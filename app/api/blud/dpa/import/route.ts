// app/api/blud/dpa/import/route.ts
// Impor DPA dari berkas Excel — 2 langkah:
//   step=preview  multipart → parse saja, TIDAK menulis DB
//   step=commit   JSON      → tulis baris yang sudah dikonfirmasi user di modal
// Konsep: docs/CONCEPT-export-import-dpa.md §3.1 & §3.6.
//
// Khusus ADMIN/SUPER_ADMIN: satu impor mengganti SATU VERSI PENUH, sekelas
// operasi borongan, bukan sunting baris.
import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/security/auth'
import { writeAuditLog } from '@/lib/security/auditlog'
import { bludRateLimit, canImporDpa, DpaImportBodySchema, TahunSchema } from '@/lib/blud/schemas'
import { bolehEditMenu, tolakEdit, unauthorized, bludMati } from '../../_guard'
import { bacaGridDpa, BerkasDpaTidakDikenalError } from '@/lib/blud/import-dpa-grid'
import { bacaDpaDariGrid, StrukturDpaTidakTerbacaError } from '@/lib/blud/import-dpa'
import { getPenanggungJawab } from '@/lib/blud/penanggung-jawab-data'
import {
  jangkarDipakaiRealisasi, saveDpa,
  BludReplaceSafetyError, BludJangkarHilangError, BludPaguDibawahRealisasiError,
} from '@/lib/blud/data'
import { BludVersionConflictError } from '@/lib/blud/lock'
import { recalcDpaJumlah, validateTreeIntegrity } from '@/lib/blud/recalc'

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
      error: 'Impor DPA mengganti satu versi anggaran sekaligus — hanya Super Admin atau Admin Staff.',
    }, { status: 403 })
  }

  const step = new URL(req.url).searchParams.get('step') ?? 'preview'
  if (step !== 'preview' && step !== 'commit') {
    return NextResponse.json({ ok: false, error: 'step harus preview atau commit' }, { status: 400 })
  }

  const limited = await bludRateLimit(session.userId, `impor-dpa-${step}`, step === 'commit' ? 6 : 12)
  if (limited) return limited

  return step === 'commit' ? tanganiCommit(req, session) : tanganiPreview(req, session)
}

async function tanganiPreview(
  req: NextRequest,
  session: { userId: number; username: string },
): Promise<NextResponse> {
  const form = await req.formData().catch(() => null)
  const file = form?.get('file') as File | null
  if (!file) {
    return NextResponse.json({ ok: false, error: 'Tidak ada berkas yang dipilih.' }, { status: 400 })
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
    return NextResponse.json({ ok: false, error: 'Isi berkas tidak cocok dengan ekstensi .xlsx.' }, { status: 400 })
  }

  const tahunParsed = TahunSchema.safeParse(form?.get('tahun'))
  if (!tahunParsed.success) {
    return NextResponse.json({ ok: false, error: 'Parameter `tahun` tidak valid (2000–2100).' }, { status: 400 })
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
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 })
  }
}

async function tanganiCommit(
  req: NextRequest,
  session: { userId: number; username: string },
): Promise<NextResponse> {
  const raw = await req.json().catch(() => null)
  const parsed = DpaImportBodySchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: 'Data tidak valid: ' + parsed.error.issues[0].message },
      { status: 400 },
    )
  }
  const { tahun_anggaran, versi_tanggal, rows, force, expected_version, turunkan_paksa, alasan_turun } = parsed.data

  if (turunkan_paksa && !alasan_turun) {
    return NextResponse.json(
      { ok: false, error: 'Alasan wajib diisi saat menurunkan pagu di bawah realisasi.' },
      { status: 400 },
    )
  }

  const salahPohon = validateTreeIntegrity(rows)
  if (salahPohon.length > 0) {
    return NextResponse.json({
      ok: false,
      error: `Struktur baris tidak valid: ${salahPohon[0]}`
        + (salahPohon.length > 1 ? ` (+${salahPohon.length - 1} lainnya)` : ''),
    }, { status: 400 })
  }

  try {
    const dihitung = recalcDpaJumlah(rows)
    const hasil = await saveDpa(
      tahun_anggaran, versi_tanggal, dihitung, session.userId, expected_version, force, turunkan_paksa,
    )
    if (hasil.bentrokPagu.length > 0) {
      const b = hasil.bentrokPagu
      await writeAuditLog({
        req,
        eventType: 'BLUD_PAGU_DIBAWAH_REALISASI',
        userId:    session.userId,
        username:  session.username,
        detail:    `Impor DPA ${tahun_anggaran}/${versi_tanggal} disimpan PAKSA — ${b.length} baris di bawah realisasi `
          + `(total minus Rp ${b.reduce((s, x) => s + x.minus, 0).toLocaleString('id-ID')}) · Alasan: ${alasan_turun}`,
      })
    }
    await writeAuditLog({
      req,
      eventType: 'BLUD_DPA_IMPORT_COMMIT',
      userId:    session.userId,
      username:  session.username,
      detail:    `Impor DPA ${tahun_anggaran}/${versi_tanggal}: ${hasil.existing} → ${hasil.replaced} baris `
        + `(v${expected_version}→${hasil.newVersion})${force ? ' (dipaksa)' : ''}`,
    })
    return NextResponse.json({
      ok: true,
      message: `Impor selesai — ${hasil.replaced} baris tersimpan di versi ${versi_tanggal}.`,
      tahun: tahun_anggaran,
      versi: versi_tanggal,
      existing: hasil.existing,
      replaced: hasil.replaced,
      version: hasil.newVersion,
      jangkar: hasil.jangkar,
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
        ok: false, code: 'SAFETY_THRESHOLD', error: err.message,
        existing: err.existing, incoming: err.incoming, dropPct: err.dropPct,
      }, { status: 409 })
    }
    // Pratinjau impor memang sudah menampilkan `realisasiTerdampak`, tapi itu cuma
    // pemberitahuan di layar — tidak pernah menahan commit. Ini pagarnya.
    if (err instanceof BludPaguDibawahRealisasiError) {
      return NextResponse.json({
        ok: false, code: 'PAGU_DIBAWAH_REALISASI', error: err.message, detail: err.bentrok,
      }, { status: 409 })
    }
    console.error('[API /blud/dpa/import commit]', err)
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 })
  }
}
