// app/api/blud/dpa/import/route.ts
// Impor DPA dari berkas Excel — PEMBACA BERKAS, bukan penulis.
//   step=preview  multipart → parse saja, TIDAK PERNAH menulis DB
// Konsep: docs/CONCEPT-export-import-dpa.md §3.1 & §3.6.
//
// `step=commit` DIBUANG (2026-08-27). Dulu tombol di modal impor menulis DB
// sendiri, memakai tanggal miliknya sendiri yang bawaannya "hari ini" — jadi
// memilih "Periode Juli" di halaman lalu mengimpor menghasilkan versi AGUSTUS,
// dan bisa menimpa versi bulan berjalan yang sudah ada. Dua tombol simpan
// dengan dua tanggal berbeda tidak bisa dibereskan dengan menyamakan tanggal
// bawaannya; yang dibuang jalur tulisnya. Sekarang hasil impor mendarat di
// FORM, dan satu-satunya yang menulis adalah tombol Simpan di halaman DPA —
// lewat POST /api/blud/dpa, dengan seluruh pagar yang sama.
//
// Khusus ADMIN/SUPER_ADMIN: satu impor menyiapkan SATU VERSI PENUH untuk
// menggantikan isi form, sekelas operasi borongan, bukan sunting baris.
import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/security/auth'
import { writeAuditLog } from '@/lib/security/auditlog'
import { bludRateLimit, canImporDpa, TahunSchema } from '@/lib/blud/schemas'
import { bolehEditMenu, tolakEdit, unauthorized, bludMati } from '../../_guard'
import { bacaGridDpa, BerkasDpaTidakDikenalError } from '@/lib/blud/import-dpa-grid'
import { bacaDpaDariGrid, StrukturDpaTidakTerbacaError } from '@/lib/blud/import-dpa'
import { getPenanggungJawab } from '@/lib/blud/penanggung-jawab-data'
import { jangkarDipakaiRealisasi } from '@/lib/blud/data'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAKS_UKURAN = 8 * 1024 * 1024

/** L38/G22 — percaya magic-number, bukan `file.type` kiriman klien. */
async function endusMime(buf: Buffer): Promise<string | null> {
  const mod = await import('file-type')
  const r = await mod.fileTypeFromBuffer(buf)
  return r?.mime ?? null
}

const MIME_XLSX = [
  'application/zip',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return unauthorized()

  const mati = await bludMati(session.role)
  if (mati) return mati
  if (!(await bolehEditMenu(session.userId, session.role, 'dpa'))) return tolakEdit('dpa')
  if (!canImporDpa(session.role)) {
    return NextResponse.json({
      ok: false, code: 'IMPOR_TERBATAS',
      error: 'Impor mengganti satu versi anggaran sekaligus, jadi hanya Super Admin atau Admin Staff yang boleh melakukannya.',
    }, { status: 403 })
  }

  const step = new URL(req.url).searchParams.get('step') ?? 'preview'
  if (step === 'commit') {
    // Tab lama yang masih memegang modal versi sebelumnya. Ditolak dengan sebab,
    // bukan diam-diam diperlakukan sebagai pratinjau — kalau tidak, orangnya
    // mengira berkasnya sudah tersimpan padahal tidak.
    return NextResponse.json({
      ok: false, code: 'IMPOR_TIDAK_MENULIS',
      error: 'Impor tidak lagi menyimpan sendiri — hasilnya masuk ke form, lalu Anda tekan Simpan. Muat ulang halaman ini dulu.',
    }, { status: 410 })
  }
  if (step !== 'preview') {
    return NextResponse.json({ ok: false, error: 'Langkah impor tidak dikenali. Muat ulang halaman, lalu ulangi impornya.' }, { status: 400 })
  }

  const limited = await bludRateLimit(session.userId, 'impor-dpa-preview', 12)
  if (limited) return limited

  return tanganiPreview(req, session)
}

async function tanganiPreview(
  req: NextRequest,
  session: { userId: number; username: string },
): Promise<NextResponse> {
  const form = await req.formData().catch(() => null)
  const file = form?.get('file') as File | null
  if (!file) {
    return NextResponse.json({ ok: false, error: 'Belum ada berkas yang dipilih.' }, { status: 400 })
  }
  if (file.size > MAKS_UKURAN) {
    return NextResponse.json({ ok: false, error: 'Ukuran berkas melebihi 8MB.' }, { status: 400 })
  }
  if (!(file.name ?? '').toLowerCase().endsWith('.xlsx')) {
    return NextResponse.json({ ok: false, error: 'Format berkas harus .xlsx.' }, { status: 400 })
  }

  const buf = Buffer.from(await file.arrayBuffer())
  const mime = await endusMime(buf)
  if (!mime || !MIME_XLSX.includes(mime)) {
    return NextResponse.json({ ok: false, error: 'Isi berkasnya bukan Excel, walau namanya berakhiran .xlsx.' }, { status: 400 })
  }

  const tahunParsed = TahunSchema.safeParse(form?.get('tahun'))
  if (!tahunParsed.success) {
    return NextResponse.json({ ok: false, error: 'Tahun anggaran tidak dikenali. Pilih tahun antara 2000 dan 2100.' }, { status: 400 })
  }
  const tahun = tahunParsed.data

  try {
    // L68 — daftar PJ ditanyakan ke DB, bukan dipercaya dari berkas. Nilai di
    // luar master dipindah ke keterangan, tidak diam-diam dibuat baru.
    const master = await getPenanggungJawab()
    const grid = await bacaGridDpa(buf)
    const hasil = bacaDpaDariGrid(grid, {
      penanggungJawabSah: master.map((m) => m.label),
    })

    // Jangkar yang akan hilang kalau baris hasil impor dipakai — `periksaJangkar`
    // di saveDpa TIDAK menangkap ini (baris impor semuanya row_id baru).
    const terpakai = await jangkarDipakaiRealisasi(tahun)
    const jangkarBaru = new Set(hasil.baris.map(b => b.jangkar).filter(Boolean) as string[])
    const realisasiTerdampak = terpakai.filter(t => !jangkarBaru.has(t.anggaran_key))

    await writeAuditLog({
      req,
      eventType: 'BLUD_DPA_IMPORT_PREVIEW',
      userId:    session.userId,
      username:  session.username,
      // Nama berkas berasal dari klien — dipotong supaya baris audit tidak bisa
      // dibanjiri teks panjang kiriman orang.
      detail:    `Pratinjau impor DPA ${tahun} dari "${file.name.slice(0, 120)}" (lembar "${hasil.namaLembar.slice(0, 40)}"): `
        + `${hasil.baris.length} baris, sumber hierarki ${hasil.baris[0]?.sumberHierarki ?? '-'}, `
        + `total ${hasil.totalHitung}, ditahan ${hasil.ditahan.length}, `
        + `realisasi terdampak ${realisasiTerdampak.length}`,
    })

    return NextResponse.json({
      ok: true,
      data: {
        namaBerkas: file.name,
        namaLembar: hasil.namaLembar,
        barisHeader: hasil.barisHeader,
        barisAkhirData: hasil.barisAkhirData,
        kolom: hasil.kolom,
        baris: hasil.baris,
        ditahan: hasil.ditahan,
        totalFile: hasil.totalFile,
        totalHitung: hasil.totalHitung,
        peringatan: hasil.peringatan,
        realisasiTerdampak,
      },
    })
  } catch (err) {
    if (err instanceof BerkasDpaTidakDikenalError || err instanceof StrukturDpaTidakTerbacaError) {
      return NextResponse.json({
        ok: false, code: 'BERKAS_TIDAK_TERBACA', error: err.message,
      }, { status: 400 })
    }
    console.error('[API /blud/dpa/import preview]', err)
    return NextResponse.json({ ok: false, error: 'Ada gangguan di server. Coba lagi sebentar lagi.' }, { status: 500 })
  }
}
