// app/api/blud/pergeseran/route.ts
// Audit Tahap 11: B-SEC-1 (getSession), B-SEC-2 (role guard), B-SEC-3 (Zod),
// B-BUG-1 (audit log), B-BUG-2 (validate dpa_versi_tanggal exist).
import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/security/auth'
import { writeAuditLog } from '@/lib/security/auditlog'
import {
  getPergeseranHistory, getPergeseranByDate, getDpaByDate, getDpaLatestDate,
  getPergeseranLatestDate, getPergeseranVersion, savePergeseran, deletePergeseranVersi, BludReplaceSafetyError,
} from '@/lib/blud/data'
import { BludVersionConflictError } from '@/lib/blud/lock'
import { recalcPergeseranJumlah, validateTreeIntegrity } from '@/lib/blud/recalc'
import { isBludRole, PergeseranBodySchema, TanggalSchema, bludRateLimit } from '@/lib/blud/schemas'
import { hasAppAccess } from '@/lib/security/guard'

export const dynamic = 'force-dynamic'

function unauthorized() {
  return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
}
function forbidden() {
  return NextResponse.json({ ok: false, error: 'Akses ditolak' }, { status: 403 })
}

// GET /api/blud/pergeseran
// ?mode=history   → daftar semua versi
// ?tanggal=yyyy   → baris versi tertentu
// (tanpa param)   → baris versi terbaru
export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return unauthorized()
  if (!(await hasAppAccess(session.userId, session.role, isBludRole))) return forbidden()

  const { searchParams } = new URL(req.url)
  const mode    = searchParams.get('mode')
  const tanggal = searchParams.get('tanggal')

  try {
    if (mode === 'history') {
      const data = await getPergeseranHistory()
      return NextResponse.json({ ok: true, data })
    }

    const versi = tanggal ?? await getPergeseranLatestDate()
    if (!versi) return NextResponse.json({ ok: true, data: [], versi_tanggal: null })

    const [data, version] = await Promise.all([getPergeseranByDate(versi), getPergeseranVersion(versi)])
    await writeAuditLog({
      req,
      eventType: 'BLUD_VIEW_PERGESERAN',
      userId:    session.userId,
      username:  session.username,
      detail:    `View Pergeseran versi ${versi}: ${data.length} baris`,
    })
    return NextResponse.json({ ok: true, data, versi_tanggal: versi, version })
  } catch (err) {
    console.error('[API /blud/pergeseran GET]', err)
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 })
  }
}

// POST /api/blud/pergeseran
// Body: { versi_tanggal, dpa_versi_tanggal?, rows }
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return unauthorized()
  if (!(await hasAppAccess(session.userId, session.role, isBludRole))) return forbidden()

  // Rate limit save: 30/menit/user
  const limited = await bludRateLimit(session.userId, 'save-pergeseran', 30)
  if (limited) return limited

  const raw = await req.json().catch(() => null)
  const parsed = PergeseranBodySchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: 'Data tidak valid: ' + parsed.error.issues[0].message },
      { status: 400 },
    )
  }
  const { versi_tanggal, dpa_versi_tanggal, rows, force, expected_version, sentinel_ack } = parsed.data

  // B-1: tolak pohon rusak (parent orphan / row_id duplikat / siklus) sebelum simpan
  const treeErrors = validateTreeIntegrity(rows)
  if (treeErrors.length > 0) {
    return NextResponse.json(
      { ok: false, error: `Struktur baris tidak valid: ${treeErrors[0]}${treeErrors.length > 1 ? ` (+${treeErrors.length - 1} lainnya)` : ''}` },
      { status: 400 },
    )
  }

  try {
    // B-BUG-2: resolve DPA versi acuan (body > latest). Selalu validasi exist.
    const dpaVersi = dpa_versi_tanggal || (await getDpaLatestDate())
    if (!dpaVersi) {
      return NextResponse.json(
        { ok: false, error: 'Tidak ada versi DPA tersedia untuk dijadikan acuan' },
        { status: 400 },
      )
    }
    const dpaRows = await getDpaByDate(dpaVersi)
    if (!dpaRows.length) {
      return NextResponse.json(
        { ok: false, error: `Versi DPA ${dpaVersi} tidak ditemukan` },
        { status: 400 },
      )
    }

    const recalced = recalcPergeseranJumlah(rows)
    const result = await savePergeseran(versi_tanggal, dpaVersi, recalced, session.userId, expected_version, force)

    await writeAuditLog({
      req,
      eventType: 'BLUD_SAVE_PERGESERAN',
      userId:    session.userId,
      username:  session.username,
      detail:    `Simpan Pergeseran versi ${versi_tanggal} (acuan DPA ${dpaVersi}): ${result.existing} → ${result.replaced} baris (v${expected_version}→${result.newVersion})${force ? ' (forced)' : ''}`,
    })
    // RIMA F1 (G8): jejak "user sudah diperingatkan" — log only, tidak block
    if (sentinel_ack && (sentinel_ack.dismissed.length > 0 || sentinel_ack.active_warning > 0)) {
      await writeAuditLog({
        req,
        eventType: 'BLUD_SENTINEL_ACK',
        userId:    session.userId,
        username:  session.username,
        detail:    `Pergeseran versi ${versi_tanggal} disimpan dgn ${sentinel_ack.active_warning} peringatan Sentinel aktif${sentinel_ack.dismissed.length > 0 ? ` · diabaikan: ${sentinel_ack.dismissed.slice(0, 5).map(d => `[${d.rule}] ${d.label}`).join('; ')}${sentinel_ack.dismissed.length > 5 ? '; …' : ''}` : ''}`,
      })
    }

    return NextResponse.json({
      ok: true,
      message: `Pergeseran berhasil disimpan (${result.replaced} baris)`,
      versi: versi_tanggal,
      dpa_versi: dpaVersi,
      existing: result.existing,
      replaced: result.replaced,
      version: result.newVersion,
    })
  } catch (err) {
    if (err instanceof BludVersionConflictError) {
      return NextResponse.json({
        ok: false, code: 'VERSION_CONFLICT', error: err.message,
        expected: err.expected, actual: err.actual,
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
    console.error('[API /blud/pergeseran POST]', err)
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 })
  }
}

// DELETE /api/blud/pergeseran?versi=YYYY-MM-DD
// Hapus permanen versi Pergeseran (standalone, tanpa cascade).
export async function DELETE(req: NextRequest) {
  const session = await getSession()
  if (!session) return unauthorized()
  if (!(await hasAppAccess(session.userId, session.role, isBludRole))) return forbidden()

  // Rate limit destructive: 10/menit/user
  const limited = await bludRateLimit(session.userId, 'delete-pergeseran', 10)
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
    const result = await deletePergeseranVersi(parsed.data)
    await writeAuditLog({
      req,
      eventType: 'BLUD_DELETE_PERGESERAN_VERSI',
      userId:    session.userId,
      username:  session.username,
      detail:    `Hapus Pergeseran versi ${parsed.data}: ${result.pergeseran_rows} baris`,
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
    console.error('[API /blud/pergeseran DELETE]', err)
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 })
  }
}
