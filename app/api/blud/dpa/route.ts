// app/api/blud/dpa/route.ts
// Audit Tahap 11: B-SEC-1 (getSession), B-SEC-2 (role guard), B-SEC-3 (Zod),
// B-BUG-1 (audit log).
import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/security/auth'
import { writeAuditLog } from '@/lib/security/auditlog'
import { getDpaHistory, getDpaByDate, getDpaLatestDate, getDpaVersion, saveDpa, deleteDpaVersi, BludReplaceSafetyError } from '@/lib/blud/data'
import { BludVersionConflictError } from '@/lib/blud/lock'
import { recalcDpaJumlah, validateTreeIntegrity } from '@/lib/blud/recalc'
import { isBludRole, DpaBodySchema, TanggalSchema, bludRateLimit } from '@/lib/blud/schemas'
import { hasAppAccess } from '@/lib/security/guard'
import { validateAllPj } from '@/lib/blud/pj-conflict'

export const dynamic = 'force-dynamic'

function unauthorized() {
  return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
}
function forbidden() {
  return NextResponse.json({ ok: false, error: 'Akses ditolak' }, { status: 403 })
}

// GET /api/blud/dpa
// ?mode=history  → daftar semua versi
// ?tanggal=yyyy  → baris versi tertentu
// (tanpa param)  → baris versi terbaru
export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return unauthorized()
  if (!(await hasAppAccess(session.userId, session.role, isBludRole))) return forbidden()

  const { searchParams } = new URL(req.url)
  const mode    = searchParams.get('mode')
  const tanggal = searchParams.get('tanggal')

  try {
    if (mode === 'history') {
      const data = await getDpaHistory()
      return NextResponse.json({ ok: true, data })
    }

    const versi = tanggal ?? await getDpaLatestDate()
    if (!versi) return NextResponse.json({ ok: true, data: [], versi_tanggal: null })

    const [data, version] = await Promise.all([getDpaByDate(versi), getDpaVersion(versi)])
    // Audit BLUD v1.2 (B-NEW-2): log view event untuk data sensitif keuangan
    await writeAuditLog({
      req,
      eventType: 'BLUD_VIEW_DPA',
      userId:    session.userId,
      username:  session.username,
      detail:    `View DPA versi ${versi}: ${data.length} baris`,
    })
    return NextResponse.json({ ok: true, data, versi_tanggal: versi, version })
  } catch (err) {
    console.error('[API /blud/dpa GET]', err)
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 })
  }
}

// POST /api/blud/dpa
// Body: { versi_tanggal: string, rows: DpaBarisInput[] }
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return unauthorized()
  if (!(await hasAppAccess(session.userId, session.role, isBludRole))) return forbidden()

  // Rate limit save: 30/menit/user
  const limited = await bludRateLimit(session.userId, 'save-dpa', 30)
  if (limited) return limited

  const raw = await req.json().catch(() => null)
  const parsed = DpaBodySchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: 'Data tidak valid: ' + parsed.error.issues[0].message },
      { status: 400 },
    )
  }
  const { versi_tanggal, rows, force, expected_version, sentinel_ack } = parsed.data

  // B-1: tolak pohon rusak (parent orphan / row_id duplikat / siklus) sebelum simpan
  const treeErrors = validateTreeIntegrity(rows)
  if (treeErrors.length > 0) {
    return NextResponse.json(
      { ok: false, error: `Struktur baris tidak valid: ${treeErrors[0]}${treeErrors.length > 1 ? ` (+${treeErrors.length - 1} lainnya)` : ''}` },
      { status: 400 },
    )
  }

  try {
    const recalced = recalcDpaJumlah(rows)

    // Sentinel PJ — server-side detect, log only (UI sudah ada modal Lanjutkan/Batal).
    // Tidak block save: user yg pilih "Tetap Lanjutkan" di UI berhak punya konflik
    // (transition data, dll). audit-pj.ts catch post-facto di Cetak BLUD untuk review.
    const pjConflicts = validateAllPj(recalced)

    const result = await saveDpa(versi_tanggal, recalced, session.userId, expected_version, force)

    await writeAuditLog({
      req,
      eventType: 'BLUD_SAVE_DPA',
      userId:    session.userId,
      username:  session.username,
      detail:    `Simpan DPA versi ${versi_tanggal}: ${result.existing} → ${result.replaced} baris (v${expected_version}→${result.newVersion})${force ? ' (forced)' : ''}${pjConflicts.length > 0 ? ` · PJ chain conflict: ${pjConflicts.length}` : ''}`,
    })
    if (pjConflicts.length > 0) {
      await writeAuditLog({
        req,
        eventType: 'BLUD_PJ_CHAIN_CONFLICT',
        userId:    session.userId,
        username:  session.username,
        detail:    `DPA versi ${versi_tanggal} disimpan dgn ${pjConflicts.length} konflik PJ chain: ${pjConflicts.slice(0, 5).map(c => `[${c.row.kode_rekening} ${c.row.uraian} ↔ ${c.conflict.kode_rekening} ${c.conflict.uraian}]`).join('; ')}${pjConflicts.length > 5 ? '; …' : ''}`,
      })
    }
    // RIMA F1 (G8): jejak "user sudah diperingatkan" — log only, tidak block
    if (sentinel_ack && (sentinel_ack.dismissed.length > 0 || sentinel_ack.active_warning > 0)) {
      await writeAuditLog({
        req,
        eventType: 'BLUD_SENTINEL_ACK',
        userId:    session.userId,
        username:  session.username,
        detail:    `DPA versi ${versi_tanggal} disimpan dgn ${sentinel_ack.active_warning} peringatan Sentinel aktif${sentinel_ack.dismissed.length > 0 ? ` · diabaikan: ${sentinel_ack.dismissed.slice(0, 5).map(d => `[${d.rule}] ${d.label}`).join('; ')}${sentinel_ack.dismissed.length > 5 ? '; …' : ''}` : ''}`,
      })
    }

    return NextResponse.json({
      ok: true,
      message: `Data DPA berhasil disimpan (${result.replaced} baris)`,
      versi: versi_tanggal,
      existing: result.existing,
      replaced: result.replaced,
      version: result.newVersion,
    })
  } catch (err) {
    if (err instanceof BludVersionConflictError) {
      return NextResponse.json({
        ok:       false,
        code:     'VERSION_CONFLICT',
        error:    err.message,
        expected: err.expected,
        actual:   err.actual,
      }, { status: 409 })
    }
    if (err instanceof BludReplaceSafetyError) {
      return NextResponse.json({
        ok:       false,
        code:     'SAFETY_THRESHOLD',
        error:    err.message,
        existing: err.existing,
        incoming: err.incoming,
        dropPct:  err.dropPct,
      }, { status: 409 })
    }
    console.error('[API /blud/dpa POST]', err)
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 })
  }
}

// DELETE /api/blud/dpa?versi=YYYY-MM-DD
// Hapus permanen versi DPA + cascade ke rekap_pk. Role guard: BLUD_ALLOWED_ROLES.
export async function DELETE(req: NextRequest) {
  const session = await getSession()
  if (!session) return unauthorized()
  if (!(await hasAppAccess(session.userId, session.role, isBludRole))) return forbidden()

  // Rate limit destructive: 10/menit/user (lebih ketat dari save)
  const limited = await bludRateLimit(session.userId, 'delete-dpa', 10)
  if (limited) return limited

  const { searchParams } = new URL(req.url)
  const versi = searchParams.get('versi')
  const parsed = TanggalSchema.safeParse(versi)
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: 'Parameter `versi` wajib format YYYY-MM-DD' },
      { status: 400 },
    )
  }

  try {
    const result = await deleteDpaVersi(parsed.data)
    await writeAuditLog({
      req,
      eventType: 'BLUD_DELETE_DPA_VERSI',
      userId:    session.userId,
      username:  session.username,
      detail:    `Hapus DPA versi ${parsed.data}: ${result.dpa_rows} baris dpa_blud + ${result.rekap_pk_rows} baris rekap_pk`,
    })
    return NextResponse.json({
      ok: true,
      message: `Versi ${parsed.data} berhasil dihapus`,
      ...result,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('tidak ditemukan')) {
      return NextResponse.json({ ok: false, error: msg }, { status: 404 })
    }
    console.error('[API /blud/dpa DELETE]', err)
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 })
  }
}
