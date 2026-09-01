// scripts/test-blud-beranda-serapan.mts — sisi Realisasi di Beranda BLUD.
// Konsep: docs/CONCEPT-blud-beranda-serapan.md
//
// Yang dijaga di sini bukan "fiturnya tampil", tapi empat keputusan yang kalau
// salah menghasilkan DUA LAYAR YANG BERBANTAH tentang angka yang sama:
//
//   §2   pagu acuan realisasi = Pergeseran versi terbaru, bukan total DPA
//   §5.0 "mepet" dihitung dari sisa SETAHUN, bukan kolom `sisa` per-bulan
//   §9.1 total terserap = jumlah baris AKAR, bukan SUM alokasi mentah
//   §8.2 sakelar `app_status_blud_realisasi` ikut menutup angka di Beranda
//
// Bagian A menguji PERILAKU lewat `hitungRingkas` yang dipakai produksi.
// Bagian B–D memeriksa sumber, untuk hal yang tidak bisa dijalankan tanpa DB —
// termasuk §8.2, yang TIDAK terpindai `npm run check:killswitch` sama sekali
// (gate itu cuma melihat `app/api/*`, sedangkan Beranda bertanya ke DB langsung).
//
// Jalankan: npx tsx scripts/test-blud-beranda-serapan.mts

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { hitungRingkas } from '../lib/blud/serapan-ringkas'
import { mepetSetahun, AMBANG_MEPET, EPS_PRATINJAU } from '../lib/blud/pratinjau-serapan'
import type { BarisPagu } from '../lib/blud/pagu'

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const baca = (p: string) => fs.readFileSync(path.join(repo, p), 'utf8')

/** Buang komentar dulu: prosa yang MENJELASKAN bug lama tidak boleh menyalakan
 *  tesnya sendiri, dan paragraf penjelasan baru tidak boleh menggeser kode yang
 *  diperiksa ke luar jendela (L82c). */
const kode = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')

let lulus = 0
let gagal = 0
function cek(nama: string, syarat: boolean, catatan = '') {
  if (syarat) { lulus++; console.log(`  ok    ${nama.padEnd(62)} ${catatan}`) }
  else        { gagal++; console.log(`  GAGAL ${nama.padEnd(62)} ${catatan}`) }
}

// ── Bagian A — perilaku hitungan ────────────────────────────────────────────
//
// Pohonnya sengaja memuat tiap kasus yang pernah membuat angka Beranda berbeda
// dari layar Realisasi:
//
//   akar
//    ├─ bekas-daun   pernah daun, sekarang punya anak — alokasi lamanya MASIH
//    │   └─ anak     menempel di induknya (menjumlah daun saja melewatkannya)
//    ├─ aman         sisa 50%
//    ├─ mepet        sisa 5%
//    ├─ jebol        terserap melewati pagu
//    └─ nol          pagu 0, belum tersentuh (0/0 → jangan mengaku mepet)
//
//   yatim            alokasi tanpa baris di versi pagu (menjumlah SUM mentah
//                    ikut menghitungnya; layar Realisasi tidak)

const b = (
  anggaran_key: string, pagu: number, parent_key: string | null, is_leaf: boolean,
): BarisPagu => ({
  anggaran_key, kode_rekening: anggaran_key, uraian: anggaran_key,
  tipe_baris: 'CHILD', parent_key, urutan: 0, pagu, is_leaf,
})

const pohon: BarisPagu[] = [
  b('akar',       100_000_000, null,          false),
  b('bekas-daun',  10_000_000, 'akar',        false),
  b('anak',         4_000_000, 'bekas-daun',  true),
  b('aman',        40_000_000, 'akar',        true),
  b('mepet',       20_000_000, 'akar',        true),
  b('jebol',        5_000_000, 'akar',        true),
  b('nol',                  0, 'akar',        true),
]

const alokasi = new Map<string, number>([
  ['bekas-daun',  3_000_000],  // sisa alokasi dari sebelum ia punya anak
  ['anak',        1_000_000],
  ['aman',       20_000_000],  // sisa 50%
  ['mepet',      19_000_000],  // sisa 5% → mepet
  ['jebol',       6_000_000],  // lewat Rp 1 juta
  ['yatim',       7_777_777],  // rekeningnya sudah lenyap dari versi pagu
])

console.log('\n── A. Hitungan serapan ──')
const h = hitungRingkas(pohon, alokasi)

cek('Total terserap = jumlah baris AKAR', h.terserap === 49_000_000, `Rp ${h.terserap.toLocaleString('id-ID')}`)
cek('…alokasi yatim TIDAK ikut terhitung', h.terserap !== 49_000_000 + 7_777_777,
  'SUM mentah akan memulangkan 56.777.777 — layar Realisasi tidak')
cek('…alokasi di baris bekas-daun TIDAK hilang', h.terserap >= 3_000_000,
  'menjumlah baris daun saja melewatkan Rp 3 juta yang menempel di induk')
cek('Total pagu = jumlah baris akar', h.pagu === 100_000_000)

cek('Hitungan menembus = 1 (daun saja)', h.menembus === 1, String(h.menembus))
cek('Hitungan mepet = 1', h.mepet === 1, String(h.mepet))
cek('Rekening berpagu NOL tidak mengaku mepet', h.mepet === 1,
  'tanpa penjaga pagu > 0, 0/0 membuat seluruhnya mepet')

// Yang jebol tidak boleh ikut dihitung mepet — dua kabar berbeda, dan orang
// menindaklanjutinya dengan cara berbeda.
cek('Yang menembus tidak ikut dihitung mepet', h.menembus + h.mepet === 2)

// §5.0 — inti seluruh fitur. Kolom `sisa` layar Realisasi mengikuti bulan
// terpilih; memakainya membuat rekening yang jebol di Agustus tampil aman saat
// orang membuka laporan Juni.
console.log('\n── B. Ambang mepet ──')
cek('Sisa 5% dari pagu = mepet', mepetSetahun(20_000_000, 1_000_000))
cek('Sisa 50% dari pagu = tidak mepet', !mepetSetahun(20_000_000, 10_000_000))
cek('Sisa tepat di ambang tidak dihitung mepet', !mepetSetahun(100, 100 * AMBANG_MEPET))
cek('Sudah menembus BUKAN mepet', !mepetSetahun(20_000_000, -1))
cek('Pagu nol tidak pernah mepet', !mepetSetahun(0, 0))
cek('Pembulatan DECIMAL tidak dibaca sebagai menembus',
  mepetSetahun(1_000_000, -EPS_PRATINJAU / 2))

// ── C. Pagu acuan & lingkup baris di sumbernya ──────────────────────────────
console.log('\n── C. Pagu acuan (§2) ──')
const src = kode(baca('lib/blud/serapan-ringkas.ts'))

cek('Pagu diambil lewat getPaguEfektif, jalur yang sama dengan layar Realisasi',
  /getPaguEfektif\(/.test(src))
cek('TIDAK menjumlah dpa_blud sendiri',
  !/FROM\s+dpa_blud[\s\S]{0,200}SUM\(/i.test(src) && !/SUM\(jumlah\)/i.test(src),
  'menjumlah DPA memberi penyebut yang berbeda dari layar Realisasi')
cek('Total dijumlah dari baris AKAR (parent_key kosong)',
  /if \(b\.parent_key\) continue/.test(src))
cek('Hitungan menembus/mepet disaring baris DAUN',
  /if \(!b\.is_leaf\) continue/.test(src))
// DUA cabang (sumber PERGESERAN dan DPA), jadi yang dihitung KEMUNCULANNYA —
// bukan "ada atau tidak". Membuang penyaring dari satu cabang saja tetap cocok
// dengan pemeriksaan yang cuma bertanya "ada?", dan mutasi seperti itu sempat
// LOLOS di sini (L69: belum selesai sampai semua jalur kena).
cek('Tren disaring ke versi pagu di KEDUA cabang sumber',
  (src.match(/anggaran_key IN \(/g) ?? []).length === 2,
  `${(src.match(/anggaran_key IN \(/g) ?? []).length} dari 2 — kalau tidak, jumlah batangnya tidak sama dengan kartu Terserap`)
cek('Penyaringnya semi-join IN, bukan JOIN',
  !/JOIN\s+pergeseran_dpa/i.test(src) && !/JOIN\s+dpa_blud/i.test(src),
  'anggaran_key tidak unik per versi — JOIN menggandakan nilainya')

console.log('\n── D. Sisa SETAHUN di layar Realisasi (§5.0) ──')
const rc = kode(baca('app/(dashboard)/blud/realisasi/realisasi-client.tsx'))

cek('barisMepet memakai terserap SETAHUN',
  /const barisMepet = \(r: BarisRealisasi\) =>[\s\S]{0,140}r\.pagu - r\.terserap/.test(rc),
  'r.sisa mengikuti bulan terpilih — rekening jebol Agustus akan tampil aman di Juni')
cek('barisMepet tidak menyentuh r.sisa',
  !/const barisMepet[\s\S]{0,200}r\.sisa/.test(rc))
cek('barisMepet daun saja', /const barisMepet[\s\S]{0,140}r\.is_leaf/.test(rc))
cek('Spanduk menghitung daun saja, supaya cocok dengan kartu Beranda',
  /const menembus = rows\.filter\(r => r\.is_leaf && lebihPagu\(r\)\)/.test(rc))
cek('Ambang & EPS diimpor, tidak ditulis ulang',
  /from '@\/lib\/blud\/pratinjau-serapan'/.test(rc) && !/-0\.005/.test(rc),
  'dua salinan angka yang sama adalah cara L78 lahir')
cek('Ambang 10% tidak ditulis telanjang di modal',
  !/sisaSetelah \/ r\.pagu < 0\.1/.test(kode(baca('components/blud/PratinjauSerapanModal.tsx'))))

cek('Muat ulang punya jalur ketiga "angka"',
  /mode: 'awal' \| 'banding' \| 'angka'/.test(rc),
  "'awal' akan menghapus spanduk Pagu diperbarui yang belum sempat dibaca")
cek('Jalur "angka" tidak menyetel ulang pembanding pagu',
  /else if \(mode !== 'angka'\)/.test(rc))
cek('Serapan ikut dibandingkan di penanda 30 detik',
  /a\.terserap === b\.terserap/.test(rc))
cek('Perubahan pagu dibedakan dari perubahan serapan',
  /paguBergeser[\s\S]{0,200}\? 'banding' : 'angka'/.test(rc))

// ── E. Dua pagar di Beranda (§8) ────────────────────────────────────────────
//
// Beranda BLUD adalah server component yang bertanya ke database langsung —
// tanpa route file, jadi `npm run check:killswitch` (yang memindai `app/api/*`)
// tidak akan pernah melihatnya. Pemeriksaan ini satu-satunya yang menjaganya.
console.log('\n── E. Izin + sakelar (§8) ──')
const bp = kode(baca('app/(dashboard)/blud/page.tsx'))

cek('Beranda memeriksa sakelar app_status_blud_realisasi',
  /modulSedangMati\(\['app_status_blud_realisasi'\]/.test(bp))
cek('Serapan hanya dihitung kalau berhak DAN sakelarnya hidup',
  /peta\['realisasi'\] !== 'TIDAK' && !realisasiMati/.test(bp))
cek('Panel Tutup Kas ikut dua pagar yang sama',
  /peta\['tutup-kas'\] !== 'TIDAK' && !realisasiMati/.test(bp))
// Sejak panel "Realisasi Terbaru" ikut memakai bahan yang sama, pagunya dimuat
// SEKALI lewat `muatDataPagu` — jadi pagarnya pindah satu langkah ke DEPAN:
// yang dijaga bukan lagi pemanggilan `ringkasSerapan`, tapi pemuatannya sendiri.
// Sifat yang dijaga tidak berubah, dan jadi lebih kuat.
cek('Tidak dihitung dulu baru disembunyikan di klien',
  /const dataPagu = bolehRealisasi \? await muatDataPagu\(tahun\) : null/.test(bp)
  && /dataPagu \? ringkasSerapan\(tahun, dataPagu\)/.test(bp),
  'menghitungnya lalu menyembunyikannya tetap mengirim angkanya ke peramban')

const dc = kode(baca('app/(dashboard)/blud/dashboard-client.tsx'))
cek('Kartu realisasi tidak dirender sama sekali kalau tidak berhak',
  /kartuSerapan\.length > 0 && \(/.test(dc))
cek('Sakelar mati diberi keterangan, bukan ruang kosong',
  /p\.realisasiMati && \([\s\S]{0,200}blud-mati/.test(dc))
cek('Kelas baru berpasangan tema terang (L82)',
  /\[data-theme="light"\] \.blud-mati/.test(dc)
  && /\[data-theme="light"\] \.blud-strip-bulan/.test(dc)
  && /\[data-theme="light"\] \.blud-tren-label/.test(dc))

const css = kode(baca('app/globals.css'))
cek('Baris mepet punya pasangan tema terang',
  /\[data-theme="light"\] \.rl-row-mepet/.test(css))
cek('Bilah saring punya pasangan tema terang',
  /\[data-theme="light"\] \.rl-saring/.test(css))
cek('Amber pakai strip tepi, bukan latar penuh seperti yang merah',
  /\.rl-row-mepet td:first-child \{ box-shadow: inset 3px 0 0/.test(css)
  && !/\.rl-row-mepet td \{ background/.test(css))

console.log('\n── F. /dashboard ikut pagar yang sama (§10) ──')
const dash = kode(baca('lib/data/dashboard.ts'))
const route = kode(baca('app/api/dashboard/route.ts'))

cek('getBludSummary menerima tahun', /async function getBludSummary\(tahun: number/.test(dash))
cek('Tidak lagi memakai getDpaLatest yang lintas-tahun untuk ringkasan',
  /getDpaLatestDate\(tahun\)/.test(dash),
  'getDpaLatest() memulangkan DPA terbaru TAHUN APA PUN')
cek('Serapan /dashboard memakai fungsi yang sama dengan Beranda',
  /ringkasSerapan\(tahun\)/.test(dash),
  'kalau disalin, cepat atau lambat keduanya berbeda pendapat (L78)')
cek('Pagu acuan realisasi disebut versinya, terpisah dari total_pagu DPA',
  /pagu_versi/.test(dash) && /pagu_sumber/.test(dash))
cek('Route memeriksa izin BLUD, bukan cuma isDashboardRole',
  /petaIzinBlud\(g\.session\.userId, g\.session\.role\)/.test(route))
cek('Route memeriksa sakelar realisasi', /app_status_blud_realisasi/.test(route))
cek('Serapan diteruskan sebagai izin, bukan dihitung tanpa syarat',
  /bolehSerapanBlud/.test(route) && /opsi\?\.bolehSerapanBlud === true/.test(dash))

console.log(`\n${lulus} pemeriksaan LULUS · ${gagal} GAGAL`)
process.exit(gagal > 0 ? 1 : 0)
