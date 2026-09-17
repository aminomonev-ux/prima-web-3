// scripts/test-pk-sasaran-impor.mts — regresi "Import Renaksi" Master Sasaran PK
//
//   npx tsx scripts/test-pk-sasaran-impor.mts
//
// Menjaga dua cacat yang dilaporkan 2026-09-17 dan satu yang membuat keduanya sulit
// dilacak:
//
//   1. "765.00 Orang" — `migration-043-ra-decimal.sql` mengubah
//      `rencana_aksi.target_tahunan` dari INT jadi DECIMAL(14,2), dan mysql2
//      memulangkan DECIMAL sebagai STRING. `fmtTarget` merangkainya apa adanya.
//   2. "Too big: expected string to have <=255 characters" — `outcome_*` di Renaksi
//      VARCHAR(500), tiga kolom sasaran di `pk_sasaran` cuma VARCHAR(255), jadi impor
//      bisa menghasilkan baris yang mustahil disimpan.
//   3. Kalimat penolakannya tidak menyebut baris maupun kolom, pada layar 117×9.
//
// Tidak menyentuh basis data: seluruhnya perilaku fungsi + pembacaan berkas, jadi
// suite ini jalan di mesin mana pun (pola `test-iki-roundtrip.mts`).

import { readFileSync } from 'node:fs'
import { fmtTarget } from '../lib/shared/target-renaksi'
import { pesanTolakan, LABEL_KOLOM_SASARAN } from '../lib/shared/pk-kolom'
import { SasaranBodySchema } from '../lib/data/pk-schemas'

let lulus = 0
const gagal: string[] = []

function cek(nama: string, syarat: boolean) {
  if (syarat) lulus++
  else gagal.push(nama)
}
function sama(nama: string, dapat: unknown, harap: unknown) {
  cek(`${nama} — dapat ${JSON.stringify(dapat)}, harap ${JSON.stringify(harap)}`, dapat === harap)
}

const baca = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
const RUTE_PK = 'app/api/perjanjian-kinerja/sasaran/import-renaksi/route.ts'
const RUTE_IKI = 'app/api/iki/import-renaksi/route.ts'

// ── A. Bentuk teks target ────────────────────────────────────────────────────
// Yang datang dari mysql2 adalah STRING. Ini inti cacat #1: kalau `fmtTarget`
// berhenti mengubahnya sendiri, semua asersi di blok ini jatuh sekaligus.
sama('A1 string DECIMAL + satuan biasa', fmtTarget('765.00', 'Orang'), '765 Orang')
sama('A2 string DECIMAL + Dokumen', fmtTarget('12.00', 'Dokumen'), '12 Dokumen')
sama('A3 string DECIMAL + Persen', fmtTarget('37.00', 'Persen'), '37%')
sama('A4 angka (bukan string) tetap benar', fmtTarget(765, 'Orang'), '765 Orang')

// Desimal yang SUNGGUHAN ada tidak boleh ikut terbuang bersama ".00" yang palsu.
sama('A5 desimal nyata dipertahankan, format id-ID', fmtTarget('86.72', 'Persen'), '86,72%')
sama('A6 satu angka di belakang koma', fmtTarget('7.50', 'Kegiatan'), '7,5 Kegiatan')

// Ribuan bertitik: ini yang membedakan `tulisDesimal` dari `${n}` polos.
sama('A7 pemisah ribuan', fmtTarget('1000.00', 'Orang'), '1.000 Orang')

// Nol itu nilai nyata (target memang bisa 0), berbeda dari "tidak diisi".
sama('A8 nol tetap tercetak', fmtTarget('0.00', 'Dokumen'), '0 Dokumen')
sama('A9 null → kosong, bukan "null Orang"', fmtTarget(null, 'Orang'), '')
sama('A10 teks bukan angka → kosong, bukan "NaN Orang"', fmtTarget('-', 'Orang'), '')

sama('A11 lambang % diperlakukan sama dengan "Persen"', fmtTarget('5.00', '%'), '5%')
sama('A12 satuan berspasi tidak menyisakan spasi ganda', fmtTarget('3.00', '  Laporan  '), '3 Laporan')
sama('A13 satuan kosong tidak menyisakan spasi ekor', fmtTarget('9.00', ''), '9')

// ── B. SATU salinan saja (L78) ───────────────────────────────────────────────
// Cacat #1 lahir justru karena ada dua salinan `fmtTarget` dan hanya satu
// pemanggilnya yang ingat membungkus `Number(...)`.
for (const [nama, p] of [['PK', RUTE_PK], ['IKI', RUTE_IKI]] as const) {
  const src = baca(p)
  cek(`B1 ${nama}: tidak mendefinisikan fmtTarget sendiri`, !/function\s+fmtTarget/.test(src))
  cek(`B2 ${nama}: mengimpor dari lib bersama`,
    /import\s*\{[^}]*\bfmtTarget\b[^}]*\}\s*from\s*'@\/lib\/shared\/target-renaksi'/.test(src))
  // `Number(` di sini artinya pemanggil masih merasa ikut bertanggung jawab atas
  // tipenya — persis pembagian tugas yang sudah gagal sekali.
  cek(`B3 ${nama}: tidak ada lagi fmtTarget(Number(`, !src.includes('fmtTarget(Number('))
  cek(`B4 ${nama}: benar-benar memanggilnya`, /fmtTarget\(/.test(src))
}

// Tipe di route PK sempat berbohong (`target_tahunan: number` untuk kolom DECIMAL).
cek('B5 PK: target_tahunan diketik string, sesuai yang dipulangkan mysql2',
  /target_tahunan:\s*string;/.test(baca(RUTE_PK)))

// ── C. Lebar kolom berpasangan dengan SUMBERNYA ──────────────────────────────
// Dijaga dari KEDUA sisi: kalau suatu saat `outcome_*` dilebarkan lagi, C3 yang
// menyalak, bukan pemakai yang gagal menyimpan.
const skema = baca('docs/schema-mysql.sql')
const blokPk = skema.slice(skema.indexOf('CREATE TABLE IF NOT EXISTS pk_sasaran'))
  .slice(0, skema.slice(skema.indexOf('CREATE TABLE IF NOT EXISTS pk_sasaran')).indexOf(');') + 2)
for (const k of ['program', 'kegiatan', 'subkegiatan']) {
  cek(`C1 pk_sasaran.${k} = VARCHAR(500)`,
    new RegExp(`^\\s*${k}\\s+VARCHAR\\(500\\)`, 'm').test(blokPk))
}
const blokRa = skema.slice(skema.indexOf('outcome_program'), skema.indexOf('outcome_sub_kegiatan') + 120)
cek('C2 rencana_aksi.outcome_* masih VARCHAR(500) (sumber yang ditiru)',
  (blokRa.match(/VARCHAR\(500\)/g) ?? []).length === 3)

const pkSchemas = baca('lib/data/pk-schemas.ts')
const blokZod = pkSchemas.slice(pkSchemas.indexOf('export const SasaranBodySchema'))
  .slice(0, pkSchemas.slice(pkSchemas.indexOf('export const SasaranBodySchema')).indexOf('});') + 3)
const barisZod = (kunci: string) =>
  blokZod.split(/\r?\n/).find(l => l.trimStart().startsWith(kunci + ':')) ?? ''
for (const k of ['program', 'kegiatan', 'subkegiatan']) {
  cek(`C3 Zod ${k} max(500)`, barisZod(k).includes('.max(500)'))
}
// Kolom target SENGAJA tetap 255 — melebarkan yang tidak perlu menyembunyikan isian
// yang sebenarnya salah.
for (const k of ['target_program', 'target_kegiatan', 'target_subkegiatan']) {
  cek(`C4 Zod ${k} tetap max(255)`, barisZod(k).includes('.max(255)'))
}

// Uji lewat skema sungguhan, bukan lewat angka di dalam teks sumbernya.
const baris = (isi: Record<string, string>) => ({
  tahun: '2026',
  rows: [{ program: 'P', indikator_program: null, target_program: null,
    kegiatan: null, indikator_kegiatan: null, target_kegiatan: null,
    subkegiatan: null, indikator_subkegiatan: null, target_subkegiatan: null, ...isi }],
})
// 300 karakter = panjang persis baris yang menggagalkan simpanan 117 baris di 2026.
cek('C5 subkegiatan 300 karakter DITERIMA (kasus nyata yang dulu gagal)',
  SasaranBodySchema.safeParse(baris({ subkegiatan: 'x'.repeat(300) })).success)
cek('C6 program 300 karakter diterima', SasaranBodySchema.safeParse(baris({ program: 'x'.repeat(300) })).success)
cek('C7 kegiatan 300 karakter diterima', SasaranBodySchema.safeParse(baris({ kegiatan: 'x'.repeat(300) })).success)
cek('C8 subkegiatan 501 karakter tetap DITOLAK (pagarnya tidak dilepas)',
  !SasaranBodySchema.safeParse(baris({ subkegiatan: 'x'.repeat(501) })).success)
cek('C9 target 256 karakter tetap ditolak',
  !SasaranBodySchema.safeParse(baris({ target_program: 'x'.repeat(256) })).success)

// ── D. Kalimat penolakan menyebut tempatnya ──────────────────────────────────
const tolak = SasaranBodySchema.safeParse(baris({ subkegiatan: 'x'.repeat(501) }))
cek('D1 issue.path membawa indeks baris + nama kolom',
  !tolak.success && tolak.error.issues[0].path.join('.') === 'rows.0.subkegiatan')
sama('D2 kalimatnya menyebut baris (1-based) dan judul kolomnya',
  pesanTolakan({ path: ['rows', 46, 'subkegiatan'], message: 'Terlalu panjang' }),
  'Baris 47, kolom "Sasaran Sub Kegiatan": Terlalu panjang')
sama('D3 tiga kolom target dibedakan namanya di dalam kalimat',
  pesanTolakan({ path: ['rows', 0, 'target_kegiatan'], message: 'X' }),
  'Baris 1, kolom "Target Kegiatan": X')
sama('D4 galat di luar rows tetap terbaca',
  pesanTolakan({ path: ['tahun'], message: 'Tahun tidak valid' }),
  'Data tidak valid: Tahun tidak valid')
sama('D5 kolom tak dikenal dipakai apa adanya, tidak jadi "undefined"',
  pesanTolakan({ path: ['rows', 2, 'kolom_baru'], message: 'X' }),
  'Baris 3, kolom "kolom_baru": X')
cek('D6 semua kunci Zod punya label', Object.keys(LABEL_KOLOM_SASARAN).length === 9)

// Route benar-benar MEMAKAINYA — tanpa ini seluruh blok D cuma menguji fungsi yatim.
const rute = baca('app/api/perjanjian-kinerja/sasaran/route.ts')
cek('D7 route memanggil pesanTolakan', rute.includes('pesanTolakan(parsed.error.issues[0])'))
cek('D8 route tidak lagi mengirim kalimat Zod telanjang',
  !rute.includes("'Data tidak valid: ' + parsed.error.issues[0].message"))

// ── Hasil ────────────────────────────────────────────────────────────────────
console.log(`\n${lulus + gagal.length} pemeriksaan · ${lulus} lulus · ${gagal.length} gagal`)
if (gagal.length) {
  console.log('\nGAGAL:')
  for (const g of gagal) console.log('  ✗ ' + g)
  process.exit(1)
}
console.log('LULUS: impor Renaksi → Master Sasaran aman (bentuk target, lebar kolom, kalimat galat).')
