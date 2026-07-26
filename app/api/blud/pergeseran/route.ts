// app/api/blud/pergeseran/route.ts
// Audit Tahap 11: B-SEC-1 (getSession), B-SEC-2 (role guard), B-SEC-3 (Zod),
// B-BUG-1 (audit log), B-BUG-2 (validate dpa_versi_tanggal exist).
import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/security/auth'
import { writeAuditLog } from '@/lib/security/auditlog'
import {
  getPergeseranHistory, getPergeseranByDate, getDpaByDate, getDpaLatestDate,
  getPergeseranLatestDate, getPergeseranVersion, getTahunList, savePergeseran, deletePergeseranVersi,
  BludReplaceSafetyError, BludJangkarHilangError,
} from '@/lib/blud/data'
import { BludVersionConflictError } from '@/lib/blud/lock'
import { cekPaguDibawahRealisasi } from '@/lib/blud/pagu'
import { selesaikanPermintaanTerpenuhi } from '@/lib/blud/permintaan-data'
import { addNotif } from '@/lib/services/notifications'
import { recalcPergeseranJumlah, validateTreeIntegrity, hitungDeltaPergeseranRoot } from '@/lib/blud/recalc'
import { isBludRole, PergeseranBodySchema, TanggalSchema, TahunSchema, bludRateLimit } from '@/lib/blud/schemas'
import { hasAppAccess } from '@/lib/security/guard'

export const dynamic = 'force-dynamic'

function unauthorized() {
  return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
}
function forbidden() {
  return NextResponse.json({ ok: false, error: 'Akses ditolak' }, { status: 403 })
}

/** Resolve tahun dari `?tahun=` — sama pola dpa/route.ts (§9 keputusan #1). */
async function resolveTahun(searchParams: URLSearchParams): Promise<{ tahun: number } | { error: string }> {
  const raw = searchParams.get('tahun')
  if (raw != null && raw !== '') {
    const parsed = TahunSchema.safeParse(raw)
    if (!parsed.success) return { error: 'Parameter `tahun` tidak valid (2000–2100)' }
    return { tahun: parsed.data }
  }
  const list = await getTahunList()
  const current = new Date().getFullYear()
  return { tahun: list.includes(current) ? current : (list[0] ?? current) }
}

// GET /api/blud/pergeseran
// ?mode=tahun-list → daftar tahun (union DPA+Pergeseran)
// ?mode=history&tahun=  → daftar versi pergeseran dalam tahun
// ?tahun=&tanggal=yyyy  → baris versi tertentu dalam tahun
// ?tahun=               → baris versi terbaru dalam tahun
export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return unauthorized()
  if (!(await hasAppAccess(session.userId, session.role, isBludRole))) return forbidden()

  const { searchParams } = new URL(req.url)
  const mode    = searchParams.get('mode')
  const tanggal = searchParams.get('tanggal')

  try {
    if (mode === 'tahun-list') {
      const data = await getTahunList()
      return NextResponse.json({ ok: true, data, current: new Date().getFullYear() })
    }

    const resolved = await resolveTahun(searchParams)
    if ('error' in resolved) return NextResponse.json({ ok: false, error: resolved.error }, { status: 400 })
    const { tahun } = resolved

    if (mode === 'history') {
      const data = await getPergeseranHistory(tahun)
      return NextResponse.json({ ok: true, data, tahun })
    }

    const versi = tanggal ?? await getPergeseranLatestDate(tahun)
    if (!versi) return NextResponse.json({ ok: true, data: [], versi_tanggal: null, tahun })

    const [data, version] = await Promise.all([getPergeseranByDate(tahun, versi), getPergeseranVersion(tahun, versi)])
    await writeAuditLog({
      req,
      eventType: 'BLUD_VIEW_PERGESERAN',
      userId:    session.userId,
      username:  session.username,
      detail:    `View Pergeseran ${tahun}/${versi}: ${data.length} baris`,
    })
    return NextResponse.json({ ok: true, data, versi_tanggal: versi, tahun, version })
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
  const { tahun_anggaran, versi_tanggal, dpa_versi_tanggal, rows, force, draft, turunkan_paksa, alasan_turun, expected_version, sentinel_ack } = parsed.data

  // §4.3 pagar 2: menembus penolakan tanpa alasan = jejak audit kosong.
  if (turunkan_paksa && !alasan_turun) {
    return NextResponse.json(
      { ok: false, error: 'Alasan wajib diisi untuk menurunkan pagu di bawah realisasi' },
      { status: 400 },
    )
  }

  // B-1: tolak pohon rusak (parent orphan / row_id duplikat / siklus) sebelum simpan
  const treeErrors = validateTreeIntegrity(rows)
  if (treeErrors.length > 0) {
    return NextResponse.json(
      { ok: false, error: `Struktur baris tidak valid: ${treeErrors[0]}${treeErrors.length > 1 ? ` (+${treeErrors.length - 1} lainnya)` : ''}` },
      { status: 400 },
    )
  }

  try {
    // B-BUG-2: resolve DPA versi acuan (body > latest DALAM TAHUN SAMA). Selalu
    // validasi exist. Coupling ketat (§2.1 Opsi A): pergeseran hanya boleh acuan
    // DPA tahun yang sama — tak boleh lintas-tahun.
    const dpaVersi = dpa_versi_tanggal || (await getDpaLatestDate(tahun_anggaran))
    if (!dpaVersi) {
      return NextResponse.json(
        { ok: false, error: `Belum ada DPA untuk tahun ${tahun_anggaran} — buat DPA ${tahun_anggaran} dulu di menu DPA BLUD` },
        { status: 400 },
      )
    }
    const dpaRows = await getDpaByDate(tahun_anggaran, dpaVersi)
    if (!dpaRows.length) {
      return NextResponse.json(
        { ok: false, error: `Versi DPA ${tahun_anggaran}/${dpaVersi} tidak ditemukan` },
        { status: 400 },
      )
    }

    const recalced = recalcPergeseranJumlah(rows)

    // B6: pergeseran WAJIB berimbang — pagu total tidak boleh berubah.
    // Kecuali draft=true: simpan progres dgn pengakuan eksplisit, status draft
    // tidak disimpan tapi diturunkan dari delta (konsisten Checkpoint D).
    const rootDelta = hitungDeltaPergeseranRoot(recalced)
    if (rootDelta !== 0 && !draft) {
      return NextResponse.json(
        {
          ok:    false,
          code:  'PERGESERAN_TIDAK_BERIMBANG',
          error: `Pergeseran tidak berimbang: total anggaran ${rootDelta > 0 ? 'bertambah' : 'berkurang'} Rp ${Math.abs(rootDelta).toLocaleString('id-ID')} terhadap DPA. Sesuaikan dulu — pergeseran wajib berimbang (pagu tetap).`,
          delta: rootDelta,
        },
        { status: 400 },
      )
    }

    // §4.3: pagu tidak boleh turun di bawah realisasi yang SUDAH terjadi, dan
    // baris yang masih dipakai transaksi tidak boleh hilang. Arah kebalikan §4.1
    // — belum pernah dijaga di Excel, dan justru yang membuat Realisasi minus.
    const bentrok = await cekPaguDibawahRealisasi(tahun_anggaran, recalced)
    if (bentrok.length > 0 && !turunkan_paksa) {
      const t = bentrok[0]
      return NextResponse.json(
        {
          ok:    false,
          code:  'PAGU_DIBAWAH_REALISASI',
          error: `${bentrok.length} baris jadi minus: ${t.kode_rekening} ${t.hilang ? 'dihapus padahal' : 'turun ke Rp ' + t.pagu_baru.toLocaleString('id-ID') + ' padahal'} sudah terserap Rp ${t.terserap.toLocaleString('id-ID')}.`,
          detail: bentrok,
        },
        { status: 409 },
      )
    }

    const result = await savePergeseran(tahun_anggaran, versi_tanggal, dpaVersi, recalced, session.userId, expected_version, force)

    if (bentrok.length > 0) {
      await writeAuditLog({
        req,
        eventType: 'BLUD_PAGU_DIBAWAH_REALISASI',
        userId:    session.userId,
        username:  session.username,
        detail:    `Pergeseran ${tahun_anggaran}/${versi_tanggal} disimpan PAKSA — ${bentrok.length} baris di bawah realisasi (total minus Rp ${bentrok.reduce((s, b) => s + b.minus, 0).toLocaleString('id-ID')}): ${bentrok.slice(0, 5).map(b => `${b.kode_rekening} pagu ${b.pagu_baru.toLocaleString('id-ID')} < terserap ${b.terserap.toLocaleString('id-ID')}${b.hilang ? ' (baris dihapus)' : ''}`).join('; ')}${bentrok.length > 5 ? '; …' : ''} · Alasan: ${alasan_turun}`,
      })
    }

    await writeAuditLog({
      req,
      eventType: 'BLUD_SAVE_PERGESERAN',
      userId:    session.userId,
      username:  session.username,
      detail:    `Simpan Pergeseran ${tahun_anggaran}/${versi_tanggal} (acuan DPA ${dpaVersi}): ${result.existing} → ${result.replaced} baris (v${expected_version}→${result.newVersion})${force ? ' (forced)' : ''}${rootDelta !== 0 ? ` [DRAFT — belum berimbang, delta Rp ${rootDelta.toLocaleString('id-ID')}]` : ''}`,
    })
    // §4.1/§4.2: permintaan bendahara yang sudah terpenuhi ditutup sendiri +
    // notifikasi balik. Sengaja SETELAH commit dan dibungkus try sendiri —
    // gagal menutup permintaan tidak boleh membatalkan pergeseran yang benar.
    try {
      const selesai = await selesaikanPermintaanTerpenuhi(tahun_anggaran)
      for (const p of selesai) {
        if (!p.diminta_username) continue
        await addNotif(
          p.diminta_username,
          'BLUD',
          'BLUD_PERMINTAAN_SELESAI',
          `Permintaan Anda untuk <b>${p.kode_rekening ?? p.uraian}</b> sudah dipenuhi lewat Pergeseran ${versi_tanggal}. Transaksinya bisa dilanjutkan.`,
        )
      }
      if (selesai.length > 0) {
        await writeAuditLog({
          req,
          eventType: 'BLUD_PERMINTAAN_SELESAI',
          userId:    session.userId,
          username:  session.username,
          detail:    `Pergeseran ${tahun_anggaran}/${versi_tanggal} memenuhi ${selesai.length} permintaan: ${selesai.map(p => `${p.kode_rekening ?? p.jenis} (${p.diminta_username ?? '-'})`).join('; ')}`,
        })
      }
    } catch (e) {
      console.error('[pergeseran → selesaikan permintaan]', e)
    }

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
      tahun: tahun_anggaran,
      versi: versi_tanggal,
      dpa_versi: dpaVersi,
      existing: result.existing,
      replaced: result.replaced,
      version: result.newVersion,
      // Peta row_id → anggaran_key baris yang baru ditulis. Klien WAJIB
      // menempelkannya ke state, kalau tidak simpan berikutnya kena JANGKAR_HILANG.
      jangkar: result.jangkar,
    })
  } catch (err) {
    if (err instanceof BludVersionConflictError) {
      return NextResponse.json({
        ok: false, code: 'VERSION_CONFLICT', error: err.message,
        expected: err.expected, actual: err.actual,
      }, { status: 409 })
    }
    if (err instanceof BludJangkarHilangError) {
      return NextResponse.json({
        ok: false, code: 'JANGKAR_HILANG', error: err.message,
        yatim: err.yatim, berjangkar: err.berjangkar,
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
  const parsedTahun = TahunSchema.safeParse(searchParams.get('tahun'))
  if (!parsedTahun.success) {
    return NextResponse.json(
      { ok: false, error: 'Parameter `tahun` wajib (2000–2100)' },
      { status: 400 },
    )
  }

  try {
    const result = await deletePergeseranVersi(parsedTahun.data, parsed.data)
    await writeAuditLog({
      req,
      eventType: 'BLUD_DELETE_PERGESERAN_VERSI',
      userId:    session.userId,
      username:  session.username,
      detail:    `Hapus Pergeseran ${parsedTahun.data}/${parsed.data}: ${result.pergeseran_rows} baris`,
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
