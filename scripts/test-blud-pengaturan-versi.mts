// scripts/test-blud-pengaturan-versi.mts
// Penjaga regresi layar Pengaturan BLUD — daftar & hapus versi DPA/Pergeseran.
//
// Kejadian yang dijaga (2026-08-26): versi DPA tahun 2027 terhapus karena dikira
// tahun 2026. Layar itu memuat dua angka tahun yang artinya jauh berbeda —
// tanggal SIMPAN ("26 Agu 2026") dan tahun ANGGARAN ("2027") — dan yang
// ditebalkan justru tanggal simpannya, sementara semua tahun dituang ke satu
// daftar datar tanpa pemisah. Modal konfirmasinya pun tidak pernah menyebut
// tahun anggaran sama sekali: `target.tahun` ada di data dan dikirim ke API,
// tapi tidak dirender. Kode acak 4-digit menjaga dari salah PENCET; yang terjadi
// adalah salah SASARAN, dan tidak ada apa pun yang menjaganya.
//
// Bab A menguji fungsinya, bab B membaca berkas layarnya. Bab B yang paling
// menentukan: uji satuan tetap hijau kalau seseorang mengembalikan `i === 0`
// atau `key={r.versi}` di layar, sebab fungsinya sendiri tidak rusak — yang
// rusak pemakaiannya.
//
// Murni di memori + baca berkas, tidak menyentuh basis data.
//
// Jalankan: npx tsx scripts/test-blud-pengaturan-versi.mts

import { readFileSync } from 'node:fs'
import { kelompokkanPerTahun } from '../lib/blud/pengaturan-grup'

let lulus = 0
let gagal = 0
function cek(nama: string, syarat: boolean, catatan = '') {
  if (syarat) { lulus++; console.log(`  ok    ${nama.padEnd(64)} ${catatan}`) }
  else        { gagal++; console.log(`  GAGAL ${nama.padEnd(64)} ${catatan}`) }
}
function bab(judul: string) { console.log(`\n── ${judul} ──`) }

// Cerminan data nyata 2026-08-26: DPA 2026 & 2027 SAMA-SAMA punya versi
// bertanggal 2026-08-26. Itu bukan kasus karangan — itu isi basis data hari ini,
// dan itulah yang membuat tanggal saja tidak bisa jadi kunci.
const DAFTAR = [
  { tahun_anggaran: 2027, versi_tanggal: '2026-08-26', jumlah_baris: 558 },
  { tahun_anggaran: 2027, versi_tanggal: '2026-08-25', jumlah_baris: 558 },
  { tahun_anggaran: 2026, versi_tanggal: '2026-08-26', jumlah_baris: 558 },
  { tahun_anggaran: 2026, versi_tanggal: '2026-08-05', jumlah_baris: 558 },
  { tahun_anggaran: 2026, versi_tanggal: '2026-07-26', jumlah_baris: 12 },
]
const meta = (v: { jumlah_baris: number }) => `${v.jumlah_baris} baris`

// ── A. kelompokkanPerTahun ───────────────────────────────────────────────────
bab('A. kelompokkanPerTahun')

const grup = kelompokkanPerTahun(DAFTAR, meta)

cek('A1 dua tahun tercampur → dua grup', grup.length === 2, `${grup.length} grup`)

cek('A2 urutan grup mengikuti urutan server (tahun DESC)',
  grup[0]?.tahun === 2027 && grup[1]?.tahun === 2026)

cek('A3 tidak ada baris yang hilang saat dikelompokkan',
  grup.reduce((n, g) => n + g.rows.length, 0) === DAFTAR.length,
  `${DAFTAR.length} baris`)

cek('A4 tiap grup punya TEPAT SATU baris berlaku',
  grup.every(g => g.rows.filter(r => r.berlaku).length === 1))

cek('A5 berlaku jatuh pada baris pertama tiap grup',
  grup.every(g => g.rows[0].berlaku === true && g.rows.slice(1).every(r => !r.berlaku)))

// INI inti bugnya. Daftar datar dgn `i === 0` cuma menandai versi terbaru 2027;
// versi terbaru 2026 tampil polos padahal justru itu yang sedang berlaku untuk
// 2026 — di layar penghapusan, itu mengundang orang membuangnya.
const berlaku2026 = grup.find(g => g.tahun === 2026)?.rows.find(r => r.berlaku)
cek('A6 versi terbaru 2026 IKUT berlaku, bukan cuma tahun teratas',
  berlaku2026?.versi === '2026-08-26', 'INI inti bug-nya')

const semuaKunci = grup.flatMap(g => g.rows.map(r => r.key))
cek('A7 kunci unik walau tanggalnya kembar antar tahun',
  new Set(semuaKunci).size === semuaKunci.length,
  `${new Set(semuaKunci).size}/${semuaKunci.length} unik`)

cek('A8 kunci berbentuk `tahun:versi`',
  semuaKunci.includes('2027:2026-08-26') && semuaKunci.includes('2026:2026-08-26'))

cek('A9 daftar kosong → nol grup', kelompokkanPerTahun([], meta).length === 0)

const satuTahun = kelompokkanPerTahun(DAFTAR.filter(v => v.tahun_anggaran === 2026), meta)
cek('A10 satu tahun saja → satu grup berisi semua barisnya',
  satuTahun.length === 1 && satuTahun[0].rows.length === 3)

cek('A11 meta dipakai apa adanya per baris',
  grup[1]?.rows[2]?.meta === '12 baris', grup[1]?.rows[2]?.meta)

// Tahun yang muncul lagi setelah tahun lain TIDAK boleh bikin grup kedua —
// kalau server suatu saat mengirim urutan lain, penggabungannya harus tetap benar.
const berselang = kelompokkanPerTahun([
  { tahun_anggaran: 2026, versi_tanggal: '2026-08-26', jumlah_baris: 1 },
  { tahun_anggaran: 2027, versi_tanggal: '2026-08-26', jumlah_baris: 1 },
  { tahun_anggaran: 2026, versi_tanggal: '2026-08-05', jumlah_baris: 1 },
], meta)
cek('A12 tahun berselang tetap tergabung jadi satu grup',
  berselang.length === 2 && berselang[0].rows.length === 2)

// ── B. Pemakaiannya di layar ─────────────────────────────────────────────────
bab('B. pengaturan-client.tsx')

const KLIEN = readFileSync(
  new URL('../app/(dashboard)/blud/pengaturan/pengaturan-client.tsx', import.meta.url), 'utf8')

cek('B1 memakai kelompokkanPerTahun dari lib',
  /import\s*\{[^}]*kelompokkanPerTahun[^}]*\}\s*from\s*'@\/lib\/blud\/pengaturan-grup'/.test(KLIEN))

cek('B2 kode acak sudah tidak ada', !KLIEN.includes('generateConfirmCode'))

cek('B3 tidak ada lagi Math.random', !/Math\.random/.test(KLIEN))

cek('B4 konfirmasi dibandingkan dengan tahun anggaran target',
  /tahunDiketik\s*===\s*String\(target\.tahun\)/.test(KLIEN))

cek('B5 label konfirmasi meminta tahun anggaran',
  /ketik tahun anggaran yang akan dihapus/i.test(KLIEN))

cek('B6 tombol Hapus Permanen dikunci tahunCocok',
  /disabled=\{!tahunCocok\s*\|\|\s*!alasanCukup\s*\|\|\s*deleting\}/.test(KLIEN))

cek('B7 lencana LATEST sudah tidak ada', !KLIEN.includes('LATEST'))

cek('B8 lencana BERLAKU dipakai', KLIEN.includes('BERLAKU'))

// `\b` wajib: tanpanya `totalVersi === 0` ikut tertangkap lewat huruf "i" terakhirnya.
cek('B9 lencana tidak lagi dihitung `i === 0`', !/\bi === 0/.test(KLIEN))

cek('B10 lencana dibaca dari r.berlaku', /\{r\.berlaku\s*&&/.test(KLIEN))

cek('B11 kunci React memakai r.key, bukan r.versi',
  /key=\{r\.key\}/.test(KLIEN) && !/key=\{r\.versi\}/.test(KLIEN))

cek('B12 judul modal menyebut tahun anggaran target',
  /Tahun Anggaran \{target\.tahun\}\?/.test(KLIEN))

cek('B13 ringkasan modal menampilkan Tahun Anggaran',
  /Tahun Anggaran:/.test(KLIEN))

cek('B14 kepala grup menyebut TAHUN ANGGARAN', KLIEN.includes('TAHUN ANGGARAN'))

cek('B15 baris versi diberi kata "Disimpan"', /Disimpan\s*<\/span>/.test(KLIEN))

cek('B16 penghitung section menyebut jumlah tahun',
  /\$\{grup\.length\} tahun/.test(KLIEN))

cek('B17 tooltip tombol hapus menyebut tahunnya',
  /data-tooltip=\{`Hapus versi \$\{formatTanggal\(r\.versi\)\} — tahun anggaran \$\{g\.tahun\}`\}/.test(KLIEN))

cek('B18 onDelete membawa tahun + versi, bukan indeks',
  /onDelete\(g\.tahun,\s*r\.versi\)/.test(KLIEN) && !/onDelete\(i\)/.test(KLIEN))

cek('B19 sasaran hapus dicari via tahun DAN versi',
  /x\.tahun_anggaran === tahun && x\.versi_tanggal === versi/.test(KLIEN))

cek('B20 prop mati deleteDisabled sudah dibuang', !KLIEN.includes('deleteDisabled'))

cek('B21 komentar basi soal "DISABLED kalau 1 versi" sudah tidak ada',
  !/DISABLED kalau hanya 1 versi/.test(KLIEN))

// ── C. Berkas lib-nya ────────────────────────────────────────────────────────
bab('C. lib/blud/pengaturan-grup.ts')

const LIB = readFileSync(new URL('../lib/blud/pengaturan-grup.ts', import.meta.url), 'utf8')

cek('C1 tidak mengimpor React — itu sebabnya bab A bisa jalan tanpa DOM',
  !/from\s*'react'/.test(LIB))

cek('C2 tidak menyentuh basis data maupun fetch',
  !/fetch\(|from\s*'@\/lib\/data/.test(LIB))

// ── Hasil ────────────────────────────────────────────────────────────────────
console.log(`\n${gagal === 0 ? 'SEMUA LOLOS' : 'ADA YANG GAGAL'} — ${lulus} lolos, ${gagal} gagal\n`)
process.exit(gagal === 0 ? 0 : 1)
