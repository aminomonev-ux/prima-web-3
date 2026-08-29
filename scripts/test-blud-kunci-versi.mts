// scripts/test-blud-kunci-versi.mts — disiplin kunci setahun pada jalur versi.
//
// Pasangan statis dari `scripts/test-blud-race-hapus-versi.mjs`. Yang di sana
// membuktikan racenya nyata dengan dua transaksi sungguhan; yang di sini menjaga
// supaya kuncinya tidak diam-diam lepas dari salah satu jalur — dan bisa jalan
// tanpa MySQL, jadi ikut di setiap pemeriksaan biasa.
//
// USAGE: npx tsx scripts/test-blud-kunci-versi.mts

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const AKAR = join(import.meta.dirname, '..')
const baca = (p: string) => readFileSync(join(AKAR, p), 'utf8')

/** Komentar dibuang dulu — prosa yang menjelaskan pola lama tidak boleh menyalakan tesnya sendiri (L82c). */
function kode(isi: string): string {
  return isi.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

let lulus = 0
let gagal = 0
function cek(nama: string, syarat: boolean, catatan = '') {
  if (syarat) { lulus++; console.log(`  ok    ${nama.padEnd(58)} ${catatan}`) }
  else        { gagal++; console.log(`  GAGAL ${nama.padEnd(58)} ${catatan}`) }
}

const kLock = kode(baca('lib/blud/lock.ts'))
const kData = kode(baca('lib/blud/data.ts'))

console.log('\n── A. Entity kuncinya sendiri ──')
cek('BLUD_VERSI_ENTITY ada', /export const BLUD_VERSI_ENTITY = '[^']+'/.test(kLock))
cek('…dan BUKAN nilai yang sama dengan BLUD_PERIODE_ENTITY',
  !/BLUD_VERSI_ENTITY = 'realisasi_periode'/.test(kLock),
  'menumpang entity Tutup Kas membuka siklus buntu dgn catat-BKU')
cek('Key-nya per TAHUN, bukan per versi',
  /export const bludTahunKey = \(tahun: number\) => String\(tahun\)/.test(kLock),
  'kunci per-versi tidak menjaga pertanyaan "siapa MAX(versi_tanggal)"')

console.log('\n── B. Pembungkusnya ──')
cek('kunciVersiTahun memakai entity itu',
  /async function kunciVersiTahun[\s\S]{0,220}acquireBludLock\(tx, BLUD_VERSI_ENTITY, bludTahunKey\(tahun\)\)/.test(kData))

console.log('\n── C. Keenam transaksi memakainya, dan sebagai perintah PERTAMA ──')
// Pertanyaan "versi ini sumber pagu?" dijawab dari snapshot baca-konsisten, dan
// snapshot itu lahir di SELECT BIASA pertama. Mengambil kuncinya belakangan
// berarti menjaga jawaban yang sudah terlanjur dibaca dari foto lama (L55).
const pembuka = [...kData.matchAll(/await withTransaction\(async \(\{ tx(?:, conn)? \}\) => \{\r?\n(\s*)(.+)/g)]
cek('Ada tepat 6 transaksi di data.ts', pembuka.length === 6, `ketemu ${pembuka.length}`)
const pertamaKunci = pembuka.filter(m => m[2].trim() === 'await kunciVersiTahun(tx, tahun)').length
cek('Keenamnya membuka dengan kunci setahun', pertamaKunci === 6,
  `${pertamaKunci}/6 — L69: 4 jalur simpan + 2 jalur hapus, bukan cuma yang kelihatan`)
cek('Mendahului assertBludVersion',
  !/await assertBludVersion\([\s\S]{0,120}\n\s*await kunciVersiTahun/.test(kData),
  'dua-duanya kunci baris blud_locks — urutan berbeda antar-jalur sudah cukup utk buntu')

console.log('\n── D. Jalur hapus tetap memeriksa pagu ──')
cek('deletePergeseranVersi memanggil pagarHapusVersi',
  /pagarHapusVersi\(tx, 'pergeseran_dpa', tahun, versiTanggal\)/.test(kData))
cek('deleteDpaVersi ikut', /pagarHapusVersi\(tx, 'dpa_blud', tahun, versiTanggal\)/.test(kData))
cek('paguPenerus masih memulangkan null utk versi non-terbaru',
  /if \(maxPergeseran !== versi\) return null/.test(kData),
  'jalan cepat itu SAH — yang dulu salah cuma dibacanya tanpa kunci')

console.log(`\n${lulus} pemeriksaan LULUS · ${gagal} GAGAL`)
process.exit(gagal > 0 ? 1 : 0)
