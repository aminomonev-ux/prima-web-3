// scripts/test-blud-impor-periode.mts
// Penjaga regresi "satu periode, satu tombol simpan" — sesudah bug 2026-08-27.
//
// Ceritanya: memilih "Periode Juli" di layar DPA lalu menekan Impor menghasilkan
// versi AGUSTUS. Modal impor punya tanggalnya sendiri (bawaannya hari ini) DAN
// jalur tulisnya sendiri (`step=commit` → `saveDpa`), dua-duanya tidak tahu-menahu
// soal periode di halaman. Versi Juli yang muncul berikutnya lahir dari tombol
// Simpan — jadi satu berkas jadi dua versi, dan yang Agustus bisa MENIMPA versi
// bulan berjalan yang sudah berisi.
//
// Yang dijaga:
//   A. Impor tidak punya jalur tulis lagi — pembaca berkas, titik.
//   B. Ganti periode menggerakkan SELURUH layar, bukan cuma target Simpan.
//   C. Rantai `asal_impor` utuh dari modal → klien → Zod → baris audit.
//      Ini pengganti `BLUD_DPA_IMPORT_COMMIT` yang ikut hilang; kalau satu mata
//      rantainya putus, versi hasil impor tak terbedakan dari ketikan tangan.
//   D. Pagar yang sudah ada tidak ikut terbawa saat merapikan.
//
// Sebagian besar pemeriksaan bersifat STRUKTURAL (membaca berkas sumber), sama
// pola dengan test-renaksi-audit: perilaku React tidak bisa dijalankan di sini,
// tapi rantai pemanggilannya bisa dibuktikan masih tersambung.
//
// Jalankan: npx tsx scripts/test-blud-impor-periode.mts

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DpaBodySchema, AsalImporSchema } from '../lib/blud/schemas'
import * as schemas from '../lib/blud/schemas'

const AKAR = join(import.meta.dirname, '..')
const baca = (p: string) => readFileSync(join(AKAR, p), 'utf8')

/**
 * Buang komentar sebelum memeriksa "tidak boleh ada lagi".
 *
 * Tanpa ini, prosa yang MENJELASKAN bug lama ("tombolnya dulu memanggil
 * step=commit") ikut tertangkap dan tesnya menyalak pada penjelasannya sendiri —
 * lalu satu-satunya cara menghijaukannya adalah menghapus catatan yang justru
 * paling berguna dibaca setahun lagi.
 */
function kode(isi: string): string {
  return isi
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
}

const RUTE_IMPOR = 'app/api/blud/dpa/import/route.ts'
const RUTE_DPA   = 'app/api/blud/dpa/route.ts'
const MODAL      = 'components/blud/ImportDpaModal.tsx'
const KLIEN_DPA  = 'app/(dashboard)/blud/dpa/dpa-client.tsx'
const KLIEN_PGS  = 'app/(dashboard)/blud/pergeseran/pergeseran-client.tsx'
const SKEMA      = 'lib/blud/schemas.ts'

let lulus = 0
let gagal = 0
function cek(nama: string, syarat: boolean, catatan = '') {
  if (syarat) { lulus++; console.log(`  ok   ${nama.padEnd(60)} ${catatan}`) }
  else        { gagal++; console.log(`  GAGAL ${nama.padEnd(60)} ${catatan}`) }
}
function bab(judul: string) { console.log(`\n── ${judul} ──`) }

bab('A. Impor tidak punya jalur tulis')
{
  const rute = kode(baca(RUTE_IMPOR))
  const modal = kode(baca(MODAL))

  // Inti perbaikannya. Selama `saveDpa` masih bisa dipanggil dari sini, ada dua
  // pintu tulis dengan dua tanggal — dan pagar yang lupa dipasang di salah satunya
  // (dulu: `entri_historis`) jadi lubang aturan, bukan sekadar beda tampilan.
  cek('Rute impor tidak memanggil saveDpa', !rute.includes('saveDpa('))
  cek('Fungsi tanganiCommit sudah tidak ada', !rute.includes('tanganiCommit'))
  cek('Rute impor tidak memakai skema badan tulis', !rute.includes('DpaImportBodySchema'))

  // Tab lama yang masih memegang modal versi sebelumnya harus DITOLAK dengan
  // sebab — kalau diam-diam diperlakukan sebagai pratinjau, orangnya mengira
  // berkasnya sudah tersimpan padahal tidak.
  cek('step=commit ditolak eksplisit', rute.includes('IMPOR_TIDAK_MENULIS'))
  cek('Penolakannya 410, bukan 200', /IMPOR_TIDAK_MENULIS[\s\S]{0,220}status: 410/.test(rute))

  cek('Modal tidak lagi memanggil step=commit', !modal.includes('import?step=commit'))
  // Dua sumber tanggal yang tidak terhubung = sebab langsung bug-nya.
  cek('Modal tidak punya tanggal sendiri', !modal.includes('tanggalHariIniWIB'))
  cek('Kolom tanggal di modal sudah dibuang', !modal.includes("type=\"date\""))
  cek('Modal menyerahkan baris lewat onTerapkan', modal.includes('onTerapkan'))
  cek('Modal menyatakan periode tujuan', modal.includes('periodeLabel'))
  // Tombolnya tidak boleh lagi berbunyi "Simpan": itu janji yang tidak ditepatinya.
  cek('Tombol modal tidak menjanjikan simpan', !/Simpan \$\{?hasil/.test(modal))

  cek('DpaImportBodySchema sudah tidak diekspor',
    !('DpaImportBodySchema' in schemas))
}

bab('A2. Tidak ada sisa jalur commit di klien BLUD mana pun')
{
  for (const f of [KLIEN_DPA, KLIEN_PGS, MODAL]) {
    cek(`${f.split('/').pop()} bebas step=commit`, !kode(baca(f)).includes('import?step=commit'))
  }
}

bab('B. Ganti periode menggerakkan layar')
{
  const dpa = baca(KLIEN_DPA)
  const pgs = baca(KLIEN_PGS)

  // Separuh kedua dari bug: memilih Juli meninggalkan baris Agustus di layar,
  // lalu Simpan menulis baris Agustus itu ke dalam versi Juli.
  cek('DPA punya gantiPeriode', dpa.includes('async function gantiPeriode'))
  cek('Pemilih periode DPA memakai gantiPeriode',
    /value=\{periodeTulis\}[\s\S]{0,120}gantiPeriode/.test(dpa))
  cek('setPeriodeTulis polos tidak lagi jadi onChange',
    !/onChange=\{setPeriodeTulis\}/.test(dpa))

  const badanDpa = dpa.slice(dpa.indexOf('async function gantiPeriode'))
    .slice(0, 1400)
  cek('gantiPeriode mengosongkan baris', badanDpa.includes('setRows([])'))
  cek('gantiPeriode melepas versi', badanDpa.includes("setVersi('')"))
  cek('gantiPeriode menyetel ulang angka kunci', badanDpa.includes('setVersion(0)'))
  // Kembali ke bulan berjalan HARUS memuat ulang, bukan meninggalkan layar kosong
  // — kalau kosong, Simpan berikutnya menulis form kosong ke versi hari ini.
  cek('Kembali ke bulan berjalan memuat ulang', badanDpa.includes('await loadDpa()'))
  cek('Isian belum tersimpan dikonfirmasi dulu',
    badanDpa.includes('confirmDialog') && badanDpa.includes('rows.length > 0 && !versi'))
  cek('gantiPeriode melepas jejak asal', badanDpa.includes('asalImporRef.current    = null'))

  cek('Pergeseran memakai gantiPeriode juga', pgs.includes('async function gantiPeriode'))
  cek('Pemilih periode Pergeseran memakai gantiPeriode',
    /value=\{periodeTulis\}[\s\S]{0,120}gantiPeriode/.test(pgs))
  const badanPgs = pgs.slice(pgs.indexOf('async function gantiPeriode')).slice(0, 1200)
  cek('Pergeseran juga bertanya sebelum membuang',
    badanPgs.includes('confirmDialog') && badanPgs.includes('rows.length > 0 && !versi'))
}

bab('C. Rantai asal_impor — modal → klien → Zod → audit')
{
  const modal = baca(MODAL)
  const dpa   = baca(KLIEN_DPA)
  const rute  = baca(RUTE_DPA)
  const skema = baca(SKEMA)

  cek('Modal mengirim berkas+lembar+baris',
    /onTerapkan\(keDpaBarisInput[\s\S]{0,200}berkas:[\s\S]{0,120}lembar:[\s\S]{0,120}baris:/.test(modal))
  cek('Klien menyimpannya di asalImporRef',
    /function terapkanImpor[\s\S]{0,600}asalImporRef\.current\s*=\s*asal/.test(dpa))
  // Mata rantai yang paling gampang putus: ref-nya ada, tapi lupa ikut di body.
  cek('Klien mengirim asal_impor di body Simpan',
    dpa.includes('asal_impor: asalImporRef.current'))
  cek('Zod menerima asal_impor', skema.includes('asal_impor:       AsalImporSchema.optional()'))
  cek('Rute DPA membaca asal_impor', /=\s*parsed\.data/.test(rute) && rute.includes('asal_impor,'))
  cek('Baris audit menyebut berkasnya', /asal_impor \?[\s\S]{0,160}asal_impor\.berkas/.test(rute))

  // Jejaknya harus DILEPAS begitu barisnya diganti lewat jalur lain, kalau tidak
  // audit simpan berikutnya berbohong: "diimpor dari X" padahal diketik tangan.
  const lepas = (dpa.match(/asalImporRef\.current\s*=\s*null/g) ?? []).length
  cek('Jejak impor dilepas di semua jalur ganti-baris', lepas >= 5, `${lepas} tempat`)

  // Runtime, bukan struktural: pagarnya benar-benar berlaku.
  const badan = (extra: Record<string, unknown>) => ({
    tahun_anggaran: 2026, versi_tanggal: '2026-07-31',
    rows: [{
      kode_rekening: '5', uraian: 'X', vol: null, satuan: null, harga: null, jumlah: 0,
      tipe_baris: 'GRANDMASTER', row_id: 'r1', parent_id: null, urutan: 0,
    }],
    ...extra,
  })
  const sah = DpaBodySchema.safeParse(badan({
    asal_impor: { berkas: 'DPA BLUD 2026 F.xlsx', lembar: 'BLUD ', baris: 558 },
  }))
  cek('Badan dengan asal_impor diterima', sah.success,
    sah.success ? '' : sah.error.issues[0].message)
  cek('Nilainya terbaca utuh',
    sah.success && sah.data.asal_impor?.baris === 558)
  cek('Tanpa asal_impor tetap sah (ketikan tangan)',
    DpaBodySchema.safeParse(badan({})).success)

  // Nama berkas datang dari klien — dibatasi supaya baris audit tidak bisa
  // dibanjiri teks kiriman orang.
  cek('Nama berkas kepanjangan ditolak',
    !AsalImporSchema.safeParse({ berkas: 'x'.repeat(121), lembar: 'a', baris: 1 }).success)
  cek('Nama lembar kepanjangan ditolak',
    !AsalImporSchema.safeParse({ berkas: 'a', lembar: 'x'.repeat(61), baris: 1 }).success)
}

bab('D. Pagar lama tidak ikut terbawa')
{
  const dpa  = baca(KLIEN_DPA)
  const rute = baca(RUTE_IMPOR)

  // Tahap 1 memasang ini; merapikan impor tidak boleh menghapusnya.
  cek('entri_historis masih dikirim klien', dpa.includes('entri_historis: versiTanggal !=='))
  cek('Target Simpan masih dari periodeTulis',
    dpa.includes('doSimpanInternal(periodeTulis || tanggalHariIniWIB())'))
  // Impor tetap operasi borongan — pratinjaunya pun hanya untuk SA/Admin.
  cek('Pratinjau impor tetap dijaga peran', rute.includes('canImporDpa'))
  cek('Pratinjau tetap dicatat audit', rute.includes('BLUD_DPA_IMPORT_PREVIEW'))
  // Pratinjau masih WAJIB menunjukkan realisasi yang jangkarnya akan hilang —
  // sekarang justru lebih berguna, karena orangnya masih bisa membatalkan.
  cek('Peringatan jangkar hilang tetap ada', rute.includes('realisasiTerdampak'))
}

console.log(`\n${lulus} pemeriksaan LULUS · ${gagal} GAGAL`)
process.exit(gagal > 0 ? 1 : 0)
