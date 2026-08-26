// scripts/test-blud-versi-lock.mts
// Penjaga regresi kunci optimistik versi BLUD (DPA + Pergeseran).
//
// Bug yang dijaga (2026-08-26): tombol Simpan menolak dengan "Orang lain baru saja
// mengubah versi ini" padahal tidak ada orang lain sama sekali.
//
// Sebabnya satu baris. Kunci optimistik itu milik pasangan (tahun, versi_tanggal) —
// lihat `bludVersiKey` — sedangkan layar mengirim angka kunci milik versi yang
// sedang DIBUKA. Selama masih hari yang sama keduanya kebetulan sama, jadi bug ini
// tidur. Begitu berganti hari, `simpan()` menulis ke `tanggalHariIniWIB()` yang
// belum punya baris kunci (angkanya 0) sementara layar mengirim angka versi kemarin
// (1) → ditolak. Artinya: simpan PERTAMA setiap hari baru selalu gagal, dan di DPA
// penanganan penolakannya memuat ulang versi hari ini yang belum ada → form kosong.
//
// Bab B yang paling menentukan. Uji satuan di bab A tetap hijau kalau seseorang
// mengembalikan `expected_version: version` di layar, sebab fungsinya sendiri tidak
// rusak — yang rusak pemakaiannya. Jadi bab B membaca berkas layarnya.
//
// Murni di memori + baca berkas, tidak menyentuh basis data.
//
// Jalankan: npx tsx scripts/test-blud-versi-lock.mts

import { readFileSync } from 'node:fs'
import { expectedVersionUntuk, tanggalHariIniWIB } from '../lib/blud/tanggal'

let lulus = 0
let gagal = 0
function cek(nama: string, syarat: boolean, catatan = '') {
  if (syarat) { lulus++; console.log(`  ok    ${nama.padEnd(62)} ${catatan}`) }
  else        { gagal++; console.log(`  GAGAL ${nama.padEnd(62)} ${catatan}`) }
}
function bab(judul: string) { console.log(`\n── ${judul} ──`) }

// ── A. Perilaku fungsinya ────────────────────────────────────────────────────
bab('A. expectedVersionUntuk')

cek('A1 versi yang sama → angka kunci versi itu',
  expectedVersionUntuk('2026-08-26', '2026-08-26', 3) === 3, 'menimpa versi hari ini')

cek('A2 tanggal berbeda → 0 (versi baru selalu mulai dari nol)',
  expectedVersionUntuk('2026-08-26', '2026-08-25', 1) === 0, 'INI inti bug-nya')

cek('A3 form belum punya versi (habis Salin/Form Baru) → 0',
  expectedVersionUntuk('2026-08-26', '', 0) === 0)

cek('A4 form kosong tapi angka kunci masih tertinggal → tetap 0',
  expectedVersionUntuk('2026-08-26', '', 7) === 0,
  'Salin tidak mereset `version`; tanggalnya yang menyelamatkan')

cek('A5 versi lama, angka kunci besar → tetap 0, bukan angkanya',
  expectedVersionUntuk('2027-01-02', '2026-12-31', 42) === 0)

// Alur sehari penuh, persis seperti di layar.
bab('A. Alur dua hari berturut-turut')

const hariIni    = '2026-08-26'
const kemarin    = '2026-08-25'
// Pagi: muat versi terakhir (kemarin, sudah tersimpan sekali → angka kunci 1).
const pagi = expectedVersionUntuk(hariIni, kemarin, 1)
cek('A6 simpan pertama hari ini → kirim 0, cocok dengan baris kunci yang belum ada',
  pagi === 0, `kirim ${pagi}`)
// Server membalas version: 1 untuk kunci hari ini, layar menyetel versi = hari ini.
const siang = expectedVersionUntuk(hariIni, hariIni, 1)
cek('A7 simpan kedua hari ini → kirim 1, kunci hari ini memang sudah 1',
  siang === 1, `kirim ${siang}`)
const sore = expectedVersionUntuk(hariIni, hariIni, 2)
cek('A8 simpan ketiga → ikut naik', sore === 2, `kirim ${sore}`)

// Yang TIDAK boleh ikut hilang: penolakan yang memang benar.
cek('A9 rekan kerja sudah membuat versi hari ini → 0 vs angkanya → tetap ditolak',
  expectedVersionUntuk(hariIni, kemarin, 1) === 0,
  'server bandingkan 0 ≠ 1 → 409, dan itu benar')

// `tanggalHariIniWIB` yang menentukan tanggal tujuan — pastikan bentuknya cocok
// dibandingkan dengan `versi_tanggal` (kolom DATE dipetakan ke YYYY-MM-DD).
bab('A. Bentuk tanggal')
const t = tanggalHariIniWIB(Date.parse('2026-08-25T17:30:00Z')) // 26 Agu 00:30 WIB
cek('A10 tanggalHariIniWIB berbentuk YYYY-MM-DD', /^\d{4}-\d{2}-\d{2}$/.test(t), t)
cek('A11 dini hari WIB sudah dihitung hari berikutnya', t === '2026-08-26', t)
cek('A12 perbandingannya string apa adanya — tidak ada normalisasi tersembunyi',
  expectedVersionUntuk(t, '2026-08-26', 5) === 5)

// ── B. Layar benar-benar memakainya ──────────────────────────────────────────
// Uji satuan di atas tidak akan berteriak kalau seseorang menulis balik
// `expected_version: version` di layar. Bab ini yang menahannya.
bab('B. Pemakaian di layar')

const layar: [string, string][] = [
  ['DPA',        'app/(dashboard)/blud/dpa/dpa-client.tsx'],
  ['Pergeseran', 'app/(dashboard)/blud/pergeseran/pergeseran-client.tsx'],
]

for (const [nama, path] of layar) {
  const isi = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

  cek(`B1 ${nama} mengimpor expectedVersionUntuk`,
    /import\s*\{[^}]*\bexpectedVersionUntuk\b[^}]*\}\s*from\s*'@\/lib\/blud\/tanggal'/.test(isi))

  cek(`B2 ${nama} mengirim expected_version lewat helper`,
    /expected_version:\s*expectedVersionUntuk\(\s*versiTanggal\s*,\s*versi\s*,\s*version\s*\)/.test(isi),
    'argumennya: tanggal TUJUAN dulu, baru versi yang dibuka')

  cek(`B3 ${nama} tidak lagi mengirim angka kunci versi lain apa adanya`,
    !/expected_version:\s*version\b/.test(isi),
    'pola lama yang menyebabkan bug')

  // Tanggal tujuan tetap dicetak dari WIB, bukan dari `versi` yang sedang dibuka —
  // kalau ini berubah, arti argumen pertama helper ikut berubah.
  cek(`B4 ${nama} menyimpan ke tanggalHariIniWIB()`,
    /doSimpanInternal\(tanggalHariIniWIB\(\)\)/.test(isi))
}

// ── C. Konflik sungguhan tidak boleh membuang pekerjaan diam-diam ────────────
// Sebelum 26 Agu 2026, penanganan 409 langsung menimpa isian layar dengan muatan
// server. Yang belum tersimpan hilang tanpa bisa dibatalkan — padahal pesannya
// menyuruh "periksa dulu, lalu simpan ulang", yang mustahil kalau isiannya lenyap.
// Godaan menyederhanakannya kembali jadi satu baris `await load…()` besar sekali,
// jadi bentuk penanganannya ikut dijaga di sini.
bab('C. Penanganan konflik')

for (const [nama, path] of layar) {
  const isi = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
  const mulai = isi.indexOf("code === 'VERSION_CONFLICT'")
  // Blok berakhir di penanganan 409 berikutnya (SAFETY_THRESHOLD).
  const akhir = isi.indexOf("code === 'SAFETY_THRESHOLD'", mulai)
  const blok = mulai >= 0 && akhir > mulai ? isi.slice(mulai, akhir) : ''

  cek(`C1 ${nama} blok VERSION_CONFLICT ketemu`, blok.length > 0)

  cek(`C2 ${nama} bertanya dulu, tidak menimpa sendiri`,
    /confirmDialog\(/.test(blok), 'pilihan ada di tangan orang, bukan di kode')

  cek(`C3 ${nama} pilihan "pertahankan isian saya" tersedia`,
    /cancelLabel:\s*'Tetap pakai isian saya'/.test(blok),
    'Esc / klik luar = false → yang tidak merusak jadi bawaan')

  cek(`C4 ${nama} memuat ulang HANYA kalau diminta`,
    /if\s*\(\s*ambilMilikMereka\s*\)\s*\{\s*await load/.test(blok),
    'bukan `await load…()` tanpa syarat')

  // Tanpa ini "tetap pakai isian saya" jadi jalan buntu: Simpan berikutnya
  // memakai angka kunci yang sudah basi dan ditolak lagi, selamanya.
  cek(`C5 ${nama} menyejajarkan angka kunci ke keadaan server`,
    /json\.actual/.test(blok) && /setVersion\(/.test(blok) && /setVersi\(/.test(blok))
}

// ── Hasil ────────────────────────────────────────────────────────────────────
console.log(`\n${gagal === 0 ? 'SEMUA LOLOS' : 'ADA YANG GAGAL'} — ${lulus} lolos, ${gagal} gagal`)
process.exit(gagal === 0 ? 0 : 1)
