// scripts/test-blud-salin-tahun.mts
// Penjaga regresi "Salin dari Tahun Lain" — baris DPA/Pergeseran tahun sumber
// dijadikan titik awal form DPA tahun berikutnya.
//
// Yang dijaga BUKAN "fungsinya jalan", tapi empat keputusan yang gampang sekali
// dibatalkan orang lain tanpa sadar:
//
//   1. `anggaran_key` WAJIB null. Jangkar itu mengikat baris ke realisasi/SPJ
//      tahun sumber; satu `?? d.anggaran_key` yang kelihatan wajar membuat
//      belanja tahun baru dilaporkan ke pos tahun lama.
//   2. Jejak `origin`/`usulan_*` WAJIB dilepas — baris tahun baru tidak pernah
//      lewat putusan Usulan tahun lama.
//   3. Varian pasca-geser WAJIB mengambil `vol_p`/`harga_p`/`pergeseran`, bukan
//      `vol`/`harga`/`jumlah`. Kalau tertukar, layar menampilkan angka geseran
//      tapi server menghitung ulang jadi angka DPA lama — diam-diam, tanpa error.
//   4. `row_id`/`parent_id` disalin apa adanya. Mengarang id memutus pohonnya.
//
// Bab C yang paling menentukan: ia menjalankan `recalcDpaJumlah` yang SAMA
// dengan yang dipakai server tiap Simpan, lalu menuntut angkanya tidak bergerak.
//
// Murni di memori, tidak menyentuh basis data.
//
// Jalankan: npx tsx scripts/test-blud-salin-tahun.mts

import { dpaKeTahunBaruInput, pergeseranKeTahunBaruInput } from '../lib/blud/row-map'
import { recalcDpaJumlah, validateTreeIntegrity } from '../lib/blud/recalc'
import { BLUD_IMPOR_MAKS_BARIS, BLUD_SIMPAN_MAKS_BARIS } from '../lib/blud/import-dpa-shared'
import { DpaBodySchema } from '../lib/blud/schemas'
import type { DpaBaris, PergeseranBaris } from '../types'

let lulus = 0
let gagal = 0
function cek(nama: string, syarat: boolean, catatan = '') {
  if (syarat) { lulus++; console.log(`  ok    ${nama.padEnd(60)} ${catatan}`) }
  else        { gagal++; console.log(`  GAGAL ${nama.padEnd(60)} ${catatan}`) }
}
function bab(judul: string) { console.log(`\n── ${judul} ──`) }

// ── Contoh baris DPA tahun sumber, LENGKAP dengan semua yang harus dibuang ────
const dpaAsli: DpaBaris = {
  id: 91,
  versi_tanggal: '2026-08-24',
  is_latest: 1,
  kode_rekening: '5.1.02.01.0026',
  uraian: 'Belanja Alat Tulis Kantor',
  vol: 12,
  satuan: 'paket',
  harga: 250000,
  jumlah: 3000000,
  penanggung_jawab: 'Kasubbag Umum',
  keterangan: 'rutin triwulanan',
  tipe_baris: 'CHILD',
  row_id: 'row_91',
  anggaran_key: 'AK-2026-000091',
  parent_id: 'row_90',
  urutan: 7,
  origin: 'USULAN',
  usulan_item_id: 4412,
  usulan_no: 'USL/2026/0088',
}

// ── A. DPA murni → tahun baru ────────────────────────────────────────────────
bab('A. dpaKeTahunBaruInput')
const a = dpaKeTahunBaruInput(dpaAsli, 0)

cek('A1 anggaran_key dibuang (jangkar realisasi tahun sumber)',
  a.anggaran_key === null, `→ ${JSON.stringify(a.anggaran_key)}`)
cek('A2 origin dipaksa MANUAL walau sumbernya USULAN',
  a.origin === 'MANUAL', `→ ${a.origin}`)
cek('A3 usulan_item_id dibuang',
  a.usulan_item_id === null, `→ ${JSON.stringify(a.usulan_item_id)}`)
cek('A4 usulan_no dibuang',
  a.usulan_no === null, `→ ${JSON.stringify(a.usulan_no)}`)
cek('A5 kode + uraian tersalin apa adanya',
  a.kode_rekening === dpaAsli.kode_rekening && a.uraian === dpaAsli.uraian)
cek('A6 vol/satuan/harga/jumlah tersalin apa adanya',
  a.vol === 12 && a.satuan === 'paket' && a.harga === 250000 && a.jumlah === 3000000)
cek('A7 penanggung jawab + keterangan ikut tersalin',
  a.penanggung_jawab === 'Kasubbag Umum' && a.keterangan === 'rutin triwulanan')
cek('A8 row_id apa adanya, tanpa id karangan',
  a.row_id === 'row_91', `→ ${a.row_id}`)
cek('A9 parent_id apa adanya — pohonnya utuh',
  a.parent_id === 'row_90', `→ ${a.parent_id}`)
cek('A10 urutan dari parameter, bukan warisan',
  a.urutan === 0, `→ ${a.urutan} (asli ${dpaAsli.urutan})`)
cek('A11 PJ null jadi string kosong (terikat langsung ke <input>)',
  dpaKeTahunBaruInput({ ...dpaAsli, penanggung_jawab: null, keterangan: null }, 3).penanggung_jawab === '')

// ── B. Pergeseran → tahun baru ───────────────────────────────────────────────
bab('B. pergeseranKeTahunBaruInput')

// vol/harga/jumlah SENGAJA dibedakan dari vol_p/harga_p/pergeseran. Kalau mapper
// mengambil pasangan yang salah, angkanya langsung ketahuan beda.
const pgsAsli: PergeseranBaris = {
  id: 55,
  versi_tanggal: '2026-08-25',
  dpa_versi_tanggal: '2026-08-24',
  is_latest: 1,
  kode_rekening: '5.1.02.01.0026',
  uraian: 'Belanja Alat Tulis Kantor',
  vol: 12,             // angka DPA (sebelum geser)
  satuan: 'paket',
  harga: 250000,       // angka DPA (sebelum geser)
  jumlah: 3000000,     // angka DPA (sebelum geser)
  vol_p: 15,           // angka pasca-geser
  harga_p: 260000,     // angka pasca-geser
  pergeseran: 3900000, // 15 × 260.000
  bertambah_berkurang: 900000,
  penanggung_jawab: 'Kasubbag Umum',
  keterangan: 'ditambah 3 paket',
  tipe_baris: 'CHILD',
  row_id: 'row_55',
  anggaran_key: 'AK-2026-000055',
  parent_id: 'row_54',
  urutan: 4,
}

const b = pergeseranKeTahunBaruInput(pgsAsli, 0)
const kunciB = Object.keys(b)

cek('B1 vol diambil dari vol_p, BUKAN vol',
  b.vol === 15, `→ ${b.vol} (vol_p 15 · vol 12)`)
cek('B2 harga diambil dari harga_p, BUKAN harga',
  b.harga === 260000, `→ ${b.harga} (harga_p 260rb · harga 250rb)`)
cek('B3 jumlah diambil dari pergeseran, BUKAN jumlah',
  b.jumlah === 3900000, `→ ${b.jumlah} (pergeseran 3,9jt · jumlah 3jt)`)
cek('B4 satuan dari `satuan` — Pergeseran tidak punya satuan_p',
  b.satuan === 'paket')
cek('B5 anggaran_key dibuang',
  b.anggaran_key === null, `→ ${JSON.stringify(b.anggaran_key)}`)
cek('B6 origin MANUAL + jejak usulan kosong',
  b.origin === 'MANUAL' && b.usulan_item_id === null && b.usulan_no === null)
cek('B7 PJ + keterangan ikut tersalin',
  b.penanggung_jawab === 'Kasubbag Umum' && b.keterangan === 'ditambah 3 paket')
cek('B8 row_id + parent_id apa adanya',
  b.row_id === 'row_55' && b.parent_id === 'row_54')
cek('B9 bertambah_berkurang tidak ikut (cuma bermakna di tahunnya sendiri)',
  !kunciB.includes('bertambah_berkurang'))
cek('B10 kolom khas pergeseran tidak bocor ke baris DPA',
  !kunciB.includes('vol_p') && !kunciB.includes('harga_p') && !kunciB.includes('pergeseran'),
  `→ ${kunciB.filter(k => ['vol_p', 'harga_p', 'pergeseran'].includes(k)).join(',') || 'bersih'}`)

// ── C. Invarian silang — janji utama fitur ini ───────────────────────────────
// `recalcDpaJumlah` dipanggil server tiap Simpan dan MENIMPA jumlah baris ujung
// dengan vol × harga. Kalau vol/harga yang disalin bukan pasangan pasca-geser,
// angka yang tampil di layar akan berubah sendiri begitu disimpan.
bab('C. Angka tidak bergerak saat server menghitung ulang')

const pohonPgs: PergeseranBaris[] = [
  { ...pgsAsli, id: 1, row_id: 'g1', parent_id: null, tipe_baris: 'GRANDMASTER',
    vol: null, harga: null, jumlah: 5000000, vol_p: null, harga_p: null, pergeseran: 5900000, urutan: 0 },
  { ...pgsAsli, id: 2, row_id: 'm1', parent_id: 'g1', tipe_baris: 'MASTER',
    vol: null, harga: null, jumlah: 5000000, vol_p: null, harga_p: null, pergeseran: 5900000, urutan: 1 },
  { ...pgsAsli, id: 3, row_id: 'c1', parent_id: 'm1', tipe_baris: 'CHILD',
    vol: 12, harga: 250000, jumlah: 3000000, vol_p: 15, harga_p: 260000, pergeseran: 3900000, urutan: 2 },
  { ...pgsAsli, id: 4, row_id: 'c2', parent_id: 'm1', tipe_baris: 'CHILD',
    uraian: 'Belanja Cetak', vol: 4, harga: 500000, jumlah: 2000000,
    vol_p: 4, harga_p: 500000, pergeseran: 2000000, urutan: 3 },
]

const disalin = pohonPgs.map((d, i) => pergeseranKeTahunBaruInput(d, i))
const sesudah = recalcDpaJumlah(disalin)
const ambil = (id: string) => sesudah.find(r => r.row_id === id)!

cek('C1 daun c1 tetap 3.900.000 sesudah recalc server',
  ambil('c1').jumlah === 3900000, `→ ${ambil('c1').jumlah}`)
cek('C2 daun c2 tetap 2.000.000 sesudah recalc server',
  ambil('c2').jumlah === 2000000, `→ ${ambil('c2').jumlah}`)
cek('C3 induk m1 = jumlah anak = 5.900.000, bukan 5jt warisan DPA',
  ambil('m1').jumlah === 5900000, `→ ${ambil('m1').jumlah}`)
cek('C4 akar g1 = 5.900.000 — total pasca-geser, bukan pagu DPA lama',
  ambil('g1').jumlah === 5900000, `→ ${ambil('g1').jumlah}`)
cek('C5 pohonnya lolos validateTreeIntegrity (row_id/parent_id utuh)',
  validateTreeIntegrity(disalin).length === 0,
  `→ ${validateTreeIntegrity(disalin).join('; ') || 'bersih'}`)
cek('C6 tidak ada satu pun jangkar yang lolos ke tahun baru',
  disalin.every(r => r.anggaran_key === null))
cek('C7 tidak ada satu pun jejak usulan yang lolos',
  disalin.every(r => r.origin === 'MANUAL' && r.usulan_item_id === null))

// Cermin untuk jalur DPA murni — recalc juga tidak boleh menggeser angkanya.
const pohonDpa: DpaBaris[] = [
  { ...dpaAsli, id: 1, row_id: 'g1', parent_id: null, tipe_baris: 'GRANDMASTER', vol: null, harga: null, jumlah: 5000000, urutan: 0 },
  { ...dpaAsli, id: 2, row_id: 'm1', parent_id: 'g1', tipe_baris: 'MASTER', vol: null, harga: null, jumlah: 5000000, urutan: 1 },
  { ...dpaAsli, id: 3, row_id: 'c1', parent_id: 'm1', tipe_baris: 'CHILD', vol: 12, harga: 250000, jumlah: 3000000, urutan: 2 },
  { ...dpaAsli, id: 4, row_id: 'c2', parent_id: 'm1', tipe_baris: 'CHILD', vol: 4, harga: 500000, jumlah: 2000000, urutan: 3 },
]
const salinDpa = recalcDpaJumlah(pohonDpa.map((d, i) => dpaKeTahunBaruInput(d, i)))
cek('C8 jalur DPA murni: akar tetap 5.000.000 sesudah recalc',
  salinDpa.find(r => r.row_id === 'g1')!.jumlah === 5000000,
  `→ ${salinDpa.find(r => r.row_id === 'g1')!.jumlah}`)

// ── D. Urutan diindeks ulang berurutan ───────────────────────────────────────
bab('D. Urutan')
cek('D1 urutan hasil salin 0..n-1 walau sumbernya berlubang',
  disalin.every((r, i) => r.urutan === i), `→ ${disalin.map(r => r.urutan).join(',')}`)

// ── E. Batas baris — dua angka yang harus tetap sepakat ──────────────────────
// Modal Salin menahan tahun sumber yang lebih gemuk dari batas simpan. Angkanya
// harus angka yang SAMA dengan yang dipakai Zod; kalau `DpaBodySchema` kembali
// memakai bilangan telanjang, pemeriksaan di modal jadi tebakan yang melenceng
// dan orang baru tahu setelah menyalin lalu menyunting.
bab('E. Batas baris')
cek('E1 batas simpan lebih ketat dari batas impor (asal masalahnya)',
  BLUD_SIMPAN_MAKS_BARIS < BLUD_IMPOR_MAKS_BARIS,
  `→ simpan ${BLUD_SIMPAN_MAKS_BARIS} · impor ${BLUD_IMPOR_MAKS_BARIS}`)

const barisPalsu = Array.from({ length: BLUD_SIMPAN_MAKS_BARIS + 1 }, (_, i) =>
  dpaKeTahunBaruInput({ ...dpaAsli, row_id: `x${i}`, parent_id: null }, i))
const tolak = DpaBodySchema.safeParse({
  tahun_anggaran: 2027, versi_tanggal: '2026-08-25', rows: barisPalsu,
})
const terima = DpaBodySchema.safeParse({
  tahun_anggaran: 2027, versi_tanggal: '2026-08-25', rows: barisPalsu.slice(0, BLUD_SIMPAN_MAKS_BARIS),
})
cek(`E2 Zod menolak ${BLUD_SIMPAN_MAKS_BARIS + 1} baris`,
  !tolak.success, `→ ${tolak.success ? 'DITERIMA' : tolak.error.issues[0].message}`)
cek(`E3 Zod menerima tepat ${BLUD_SIMPAN_MAKS_BARIS} baris`,
  terima.success, `→ ${terima.success ? 'ok' : terima.error.issues[0].message}`)

console.log(`\n${gagal === 0 ? 'SEMUA LOLOS' : `${gagal} GAGAL`} — ${lulus + gagal} pemeriksaan`)
process.exit(gagal === 0 ? 0 : 1)
