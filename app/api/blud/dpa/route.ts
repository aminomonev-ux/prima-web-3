// app/api/blud/dpa/route.ts
// Audit Tahap 11: B-SEC-1 (getSession), B-SEC-2 (role guard), B-SEC-3 (Zod),
// B-BUG-1 (audit log).
import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/security/auth'
import { writeAuditLog } from '@/lib/security/auditlog'
import { getDpaHistory, getDpaByDate, getDpaLatestDate, getDpaVersion, getTahunList, saveDpa, deleteDpaVersi, BludReplaceSafetyError, BludJangkarHilangError, BludVersiTerpakaiError, BludVersiDirujukError, BludPaguDibawahRealisasiError } from '@/lib/blud/data'
import { BludVersionConflictError } from '@/lib/blud/lock'
import { recalcDpaJumlah, validateTreeIntegrity } from '@/lib/blud/recalc'
import { canHapusVersi, DpaBodySchema, TanggalSchema, TahunSchema, AlasanHapusSchema, bludRateLimit, bolehCatatView } from '@/lib/blud/schemas'
import { bolehBukaMenu, bolehEditMenu, bolehLihatSalahSatu, bolehModulBlud, forbidden, tolakEdit, unauthorized, bludMati } from '../_guard'
import { validateAllPj } from '@/lib/blud/pj-conflict'

export const dynamic = 'force-dynamic'

/**
 * Resolve tahun dari query `?tahun=`. Kalau kosong → tahun berjalan bila punya
 * data, kalau tidak → tahun LATEST yang ada data (§9 keputusan #1).
 * Return `{ error }` kalau param ada tapi invalid.
 */
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

// GET /api/blud/dpa
// ?mode=tahun-list → daftar tahun anggaran yang punya data
// ?mode=history&tahun=  → daftar versi dalam tahun
// ?tahun=&tanggal=yyyy  → baris versi tertentu dalam tahun
// ?tahun=               → baris versi terbaru dalam tahun
export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return unauthorized()

  const mati = await bludMati(session.role)
  if (mati) return mati

  const { searchParams } = new URL(req.url)
  const mode    = searchParams.get('mode')
  const tanggal = searchParams.get('tanggal')

  // Pagar per-MODE, bukan per-handler — satu handler ini melayani tiga bentuk data
  // dengan kepekaan berbeda. Melebarkan seluruh GET demi dropdown tahun akan ikut
  // membuka pohon DPA lengkap, dan itu kebocoran sungguhan.
  const boleh = mode === 'tahun-list'
    ? await bolehModulBlud(session.userId, session.role)
    : mode === 'history'
      ? await bolehLihatSalahSatu(session.userId, session.role, ['dpa', 'cetak', 'pengaturan'])
      : await bolehBukaMenu(session.userId, session.role, 'dpa')
  if (!boleh) return forbidden()

  // R4 — membaca satu tahun DPA tidak murah. 60/menit longgar untuk pemakaian
  // wajar (pindah versi, pindah tahun) tapi menutup skrip yang berputar.
  const limited = await bludRateLimit(session.userId, 'view-dpa', 60)
  if (limited) return limited

  try {
    if (mode === 'tahun-list') {
      const data = await getTahunList()
      return NextResponse.json({ ok: true, data, current: new Date().getFullYear() })
    }

    const resolved = await resolveTahun(searchParams)
    if ('error' in resolved) return NextResponse.json({ ok: false, error: resolved.error }, { status: 400 })
    const { tahun } = resolved

    if (mode === 'history') {
      const data = await getDpaHistory(tahun)
      return NextResponse.json({ ok: true, data, tahun })
    }

    const versi = tanggal ?? await getDpaLatestDate(tahun)
    if (!versi) return NextResponse.json({ ok: true, data: [], versi_tanggal: null, tahun })

    const [data, version] = await Promise.all([getDpaByDate(tahun, versi), getDpaVersion(tahun, versi)])
    // Audit BLUD v1.2 (B-NEW-2): log view event untuk data sensitif keuangan.
    // R4 — sekali per menit per user per versi. Yang ingin dijawab "siapa pernah
    // melihat versi ini", bukan "berapa kali layarnya me-render".
    if (await bolehCatatView(session.userId, `dpa:${tahun}:${versi}`)) {
      await writeAuditLog({
        req,
        eventType: 'BLUD_VIEW_DPA',
        userId:    session.userId,
        username:  session.username,
        detail:    `View DPA ${tahun}/${versi}: ${data.length} baris`,
      })
    }
    return NextResponse.json({ ok: true, data, versi_tanggal: versi, tahun, version })
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

  const mati = await bludMati(session.role)
  if (mati) return mati
  if (!(await bolehEditMenu(session.userId, session.role, 'dpa'))) return tolakEdit('dpa')

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
  const {
    tahun_anggaran, versi_tanggal, rows, force, expected_version, sentinel_ack,
    turunkan_paksa, alasan_turun,
  } = parsed.data

  // Sejalan dengan jalur Pergeseran: menembus §4.3 harus disengaja DAN beralasan,
  // karena alasannya yang masuk audit — tanpa itu jejaknya cuma "dipaksa" tanpa sebab.
  if (turunkan_paksa && !alasan_turun) {
    return NextResponse.json(
      { ok: false, error: 'Alasan wajib diisi saat menurunkan pagu di bawah realisasi.' },
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
    const recalced = recalcDpaJumlah(rows)

    // Sentinel PJ — server-side detect, log only (UI sudah ada modal Lanjutkan/Batal).
    // Tidak block save: user yg pilih "Tetap Lanjutkan" di UI berhak punya konflik
    // (transition data, dll). audit-pj.ts catch post-facto di Cetak BLUD untuk review.
    const pjConflicts = validateAllPj(recalced)

    const result = await saveDpa(
      tahun_anggaran, versi_tanggal, recalced, session.userId,
      expected_version, force, turunkan_paksa,
    )

    if (result.bentrokPagu.length > 0) {
      const b = result.bentrokPagu
      await writeAuditLog({
        req,
        eventType: 'BLUD_PAGU_DIBAWAH_REALISASI',
        userId:    session.userId,
        username:  session.username,
        detail:    `DPA ${tahun_anggaran}/${versi_tanggal} disimpan PAKSA — ${b.length} baris di bawah realisasi `
          + `(total minus Rp ${b.reduce((s, x) => s + x.minus, 0).toLocaleString('id-ID')}): `
          + `${b.slice(0, 5).map(x => `${x.kode_rekening} pagu ${x.pagu_baru.toLocaleString('id-ID')} < terserap ${x.terserap.toLocaleString('id-ID')}${x.hilang ? ' (baris dihapus)' : ''}`).join('; ')}`
          + `${b.length > 5 ? '; …' : ''} · Alasan: ${alasan_turun}`,
      })
    }

    await writeAuditLog({
      req,
      eventType: 'BLUD_SAVE_DPA',
      userId:    session.userId,
      username:  session.username,
      detail:    `Simpan DPA ${tahun_anggaran}/${versi_tanggal}: ${result.existing} → ${result.replaced} baris (v${expected_version}→${result.newVersion})${force ? ' (forced)' : ''}${pjConflicts.length > 0 ? ` · PJ chain conflict: ${pjConflicts.length}` : ''}`,
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
      tahun: tahun_anggaran,
      versi: versi_tanggal,
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
        ok:       false,
        code:     'VERSION_CONFLICT',
        error:    err.message,
        expected: err.expected,
        actual:   err.actual,
      }, { status: 409 })
    }
    if (err instanceof BludJangkarHilangError) {
      return NextResponse.json({
        ok:         false,
        code:       'JANGKAR_HILANG',
        error:      err.message,
        yatim:      err.yatim,
        berjangkar: err.berjangkar,
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
    // B2 — bentuk balasannya sengaja sama dengan jalur Pergeseran supaya layar
    // DPA bisa memakai modal konfirmasi yang sudah ada di layar Pergeseran.
    if (err instanceof BludPaguDibawahRealisasiError) {
      return NextResponse.json({
        ok: false, code: 'PAGU_DIBAWAH_REALISASI', error: err.message, detail: err.bentrok,
      }, { status: 409 })
    }
    console.error('[API /blud/dpa POST]', err)
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 })
  }
}

// DELETE /api/blud/dpa?tahun=YYYY&versi=YYYY-MM-DD&alasan=…
// Hapus permanen versi DPA + cascade ke rekap_pk. S5: SUPER_ADMIN/ADMIN + alasan wajib.
export async function DELETE(req: NextRequest) {
  const session = await getSession()
  if (!session) return unauthorized()

  const mati = await bludMati(session.role)
  if (mati) return mati
  if (!(await bolehBukaMenu(session.userId, session.role, 'dpa'))) return forbidden()
  // S5: akses modul ≠ wewenang membuang anggaran setahun. Pagar sungguhannya di
  // sini, bukan di tombol yang disembunyikan klien.
  if (!canHapusVersi(session.role)) {
    return NextResponse.json({
      ok: false, code: 'HAPUS_TERBATAS',
      error: 'Hapus versi anggaran hanya boleh dilakukan Super Admin atau Admin Staff.',
    }, { status: 403 })
  }

  // Rate limit destructive: 10/menit/user (lebih ketat dari save)
  const limited = await bludRateLimit(session.userId, 'delete-dpa', 10)
  if (limited) return limited

  const { searchParams } = new URL(req.url)
  const parsedAlasan = AlasanHapusSchema.safeParse(searchParams.get('alasan') ?? '')
  if (!parsedAlasan.success) {
    return NextResponse.json(
      { ok: false, error: parsedAlasan.error.issues[0]?.message ?? 'Alasan tidak valid' },
      { status: 400 },
    )
  }
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
    const result = await deleteDpaVersi(parsedTahun.data, parsed.data)
    await writeAuditLog({
      req,
      eventType: 'BLUD_DELETE_DPA_VERSI',
      userId:    session.userId,
      username:  session.username,
      detail:    `Hapus DPA ${parsedTahun.data}/${parsed.data}: ${result.dpa_rows} baris dpa_blud + ${result.rekap_pk_rows} baris rekap_pk · Alasan: ${parsedAlasan.data}`,
    })
    return NextResponse.json({
      ok: true,
      message: `Versi ${parsed.data} berhasil dihapus`,
      ...result,
    })
  } catch (err) {
    // T1: ditahan pagar hapus — 409 dengan daftar barisnya, bentuk sama dengan
    // §4.3 di jalur simpan supaya panel bentrok di klien bisa dipakai ulang.
    if (err instanceof BludVersiTerpakaiError || err instanceof BludVersiDirujukError) {
      // Percobaan hapus yang ditahan tetap dicatat: yang gagal hari ini biasanya
      // dicoba lagi besok lewat jalan lain.
      await writeAuditLog({
        req,
        eventType: 'BLUD_DELETE_DPA_VERSI',
        userId:    session.userId,
        username:  session.username,
        detail:    `DITOLAK — hapus DPA ${parsedTahun.data}/${parsed.data}: ${err.message} · Alasan: ${parsedAlasan.data}`,
      })
      return err instanceof BludVersiTerpakaiError
        ? NextResponse.json({
            ok: false, code: 'VERSI_TERPAKAI', error: err.message,
            detail: err.bentrok, penerus: err.penerus,
          }, { status: 409 })
        : NextResponse.json({
            ok: false, code: 'VERSI_DIRUJUK', error: err.message, perujuk: err.perujuk,
          }, { status: 409 })
    }
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('tidak ditemukan')) {
      return NextResponse.json({ ok: false, error: msg }, { status: 404 })
    }
    console.error('[API /blud/dpa DELETE]', err)
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 })
  }
}
