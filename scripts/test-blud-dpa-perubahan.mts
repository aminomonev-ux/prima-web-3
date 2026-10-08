// scripts/test-blud-dpa-perubahan.mts — DPA Perubahan BLUD, Tahap 1 (uji statis + fungsi murni).
//
// Konsep: docs/CONCEPT-blud-dpa-perubahan.md. Pasangannya yang menyentuh MySQL:
// scripts/test-blud-dpa-perubahan-db.mjs (11 skenario) dan
// scripts/test-blud-race-perubahan.mjs (R7, kode sungguhan × 3 varian).
//
// Yang dijaga di sini hal-hal yang uji DB tidak bisa lihat atau terlalu mahal:
//   A. mapper — jangkar dibawa, jejak usulan dari DPA acuan, Tahun Baru melepasnya
//   B. Zod — kolom Sebelum OPSIONAL (foto riwayat & cadangan Drive lama), asal_perubahan
//   C. keenam jalur tulis/hapus (L69) memasang pagar yang berlaku untuknya
//   D. R7 — urutan kunci di jalur belanja
//   E. route — kode galat & `bisa_dipaksa`
//   F. kalimat galat menyebut tombol yang memang ada di layar
//
// Pemeriksaan teks membuang komentar dulu dan mengutip utuh (L82c).
// USAGE: npx tsx scripts/test-blud-dpa-perubahan.mts

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  dpaKeInput, dpaKeTahunBaruInput, pergeseranKeDpaInput, pergeseranKeTahunBaruInput,
} from '../lib/blud/row-map'
import { DpaBarisInputSchema, DpaBodySchema, AsalPerubahanSchema } from '../lib/blud/schemas'
import {
  BludSasaranPerubahanError, BludAcuanSebelumPerubahanError, BludVersiDasarError,
  BludBarisDasarHilangError, BludPaksaPerubahanError, BludPaguDibawahRealisasiError,
} from '../lib/blud/data'
import type { DpaBaris, PergeseranBaris } from '../types'

const AKAR = join(import.meta.dirname, '..')
const baca = (p: string) => readFileSync(join(AKAR, p), 'utf8')
function kode(isi: string): string {
  return isi.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}
/**
 * Badan fungsi tingkat atas: dari `function nama(` sampai `}` yang berdiri SENDIRI di
 * kolom 0. Bukan `\n}` pertama: tipe balikan berbentuk objek multi-baris ditutup
 * `}>` di kolom 0 (`deleteDpaVersi`), dan memotong di situ membuang seluruh badannya.
 */
function badan(src: string, nama: string): string {
  const awal = src.search(new RegExp(`function ${nama}\\(`))
  if (awal < 0) return ''
  const akhir = src.indexOf('\n}\n', awal)
  return akhir < 0 ? src.slice(awal) : src.slice(awal, akhir + 2)
}

let lulus = 0
let gagal = 0
function cek(nama: string, syarat: boolean, catatan = '') {
  if (syarat) { lulus++; console.log(`  ok    ${nama.padEnd(70)} ${catatan}`) }
  else        { gagal++; console.log(`  GAGAL ${nama.padEnd(70)} ${catatan}`) }
}

// ─── A. Mapper ───────────────────────────────────────────────────────────────
console.log('\n── A. Mapper ──')
const pg: PergeseranBaris = {
  id: 7, versi_tanggal: '2026-03-31', dpa_versi_tanggal: '2026-01-31',
  kode_rekening: '5.1.02.01', uraian: 'ATK', vol: 10, satuan: 'rim', harga: 50_000, jumlah: 500_000,
  vol_p: 12, harga_p: 55_000, pergeseran: 660_000, bertambah_berkurang: 160_000, bertambah: 160_000, berkurang: null,
  penanggung_jawab: 'Kasubbag Umum', keterangan: 'cat', tipe_baris: 'CHILD', row_id: 'r-atk',
  anggaran_key: 'AK-atk', parent_id: 'r-induk', urutan: 4,
}
const jejak = new Map([['r-atk', { origin: 'USULAN' as const, usulan_item_id: 77, usulan_no: 'USL/26/77' }]])
{
  const d = pergeseranKeDpaInput(pg, 9, jejak)
  cek('pergeseranKeDpaInput: jangkar DIBAWA', d.anggaran_key === 'AK-atk')
  cek('…angka = kolom P (vol_p, harga_p, pergeseran)', d.vol === 12 && d.harga === 55_000 && d.jumlah === 660_000)
  cek('…jejak usulan dari DPA acuan lewat row_id', d.origin === 'USULAN' && d.usulan_item_id === 77 && d.usulan_no === 'USL/26/77')
  cek('…tanpa jejak → MANUAL/null', (() => { const x = pergeseranKeDpaInput(pg, 9); return x.origin === 'MANUAL' && x.usulan_item_id === null })())
  cek('…kolom Sebelum TIDAK diisi (milik server)', !('vol_sebelum' in d) && !('jumlah_sebelum' in d))
  cek('…urutan & row_id/parent_id apa adanya', d.urutan === 9 && d.row_id === 'r-atk' && d.parent_id === 'r-induk')
  const t = pergeseranKeTahunBaruInput(pg, 9)
  cek('pergeseranKeTahunBaruInput: jangkar & jejak DILEPAS',
    t.anggaran_key === null && t.origin === 'MANUAL' && t.usulan_item_id === null && t.usulan_no === null)
  const DILEPAS = ['anggaran_key', 'origin', 'usulan_item_id', 'usulan_no']
  const sisa = (o: object) => JSON.stringify(Object.entries(o).filter(([k]) => !DILEPAS.includes(k)))
  cek('…selain itu identik dengan pergeseranKeDpaInput (satu daftar kolom)', sisa(t) === sisa(pergeseranKeDpaInput(pg, 9, jejak)))
}
{
  const dpa = {
    id: 3, versi_tanggal: '2026-10-09', kode_rekening: '5.1', uraian: 'x', vol: 1, satuan: 'paket', harga: 9, jumlah: 9,
    penanggung_jawab: null, keterangan: null, tipe_baris: 'CHILD', row_id: 'r-1', anggaran_key: 'AK-1',
    parent_id: null, urutan: 0, origin: 'MANUAL', usulan_item_id: null, usulan_no: null,
    vol_sebelum: 2, satuan_sebelum: 'paket', harga_sebelum: 8, jumlah_sebelum: 16,
  } satisfies DpaBaris
  const i = dpaKeInput(dpa)
  cek('dpaKeInput memantulkan kolom Sebelum (untuk layar)',
    i.vol_sebelum === 2 && i.satuan_sebelum === 'paket' && i.harga_sebelum === 8 && i.jumlah_sebelum === 16)
  const n = dpaKeTahunBaruInput(dpa, 0)
  cek('dpaKeTahunBaruInput: tahun baru lahir MURNI (tanpa kolom Sebelum, §12)',
    !Object.keys(n).some(k => k.endsWith('_sebelum')))
}

// ─── B. Zod ──────────────────────────────────────────────────────────────────
console.log('\n── B. Zod ──')
const barisLama = {
  kode_rekening: '5.1', uraian: 'x', vol: null, satuan: null, harga: null, jumlah: 0,
  tipe_baris: 'CHILD', row_id: 'r-1', parent_id: null, urutan: 0,
}
cek('Baris TANPA kolom Sebelum (foto riwayat lama) diterima', DpaBarisInputSchema.safeParse(barisLama).success)
cek('Baris dengan kolom Sebelum diterima', DpaBarisInputSchema.safeParse({ ...barisLama, vol_sebelum: 1, satuan_sebelum: 'x', harga_sebelum: 2, jumlah_sebelum: 2 }).success)
cek('Kolom Sebelum null diterima', DpaBarisInputSchema.safeParse({ ...barisLama, jumlah_sebelum: null }).success)
const body = { tahun_anggaran: 2026, versi_tanggal: '2026-01-31', rows: [barisLama] }
cek('Body tanpa asal_perubahan tetap diterima', DpaBodySchema.safeParse(body).success)
cek('asal_perubahan diterima', DpaBodySchema.safeParse({ ...body, asal_perubahan: { sumber_dasar: 'PERGESERAN', versi_dasar: '2026-01-15' } }).success)
cek('asal_perubahan dengan dasar lebih baru dari versinya → ditolak',
  !DpaBodySchema.safeParse({ ...body, asal_perubahan: { sumber_dasar: 'DPA', versi_dasar: '2026-02-01' } }).success)
cek('sumber_dasar di luar PERGESERAN/DPA → ditolak', !AsalPerubahanSchema.safeParse({ sumber_dasar: 'KOSONG', versi_dasar: '2026-01-01' }).success)

// ─── C. Keenam jalur L69 ─────────────────────────────────────────────────────
console.log('\n── C. Keenam jalur tulis/hapus memasang pagarnya ──')
const kData = kode(baca('lib/blud/data.ts'))
const bSaveDpa = badan(kData, 'saveDpa')
const bSavePg = badan(kData, 'savePergeseran')
const bDelDpa = badan(kData, 'deleteDpaVersi')
const bDelPg = badan(kData, 'deletePergeseranVersi')
/** Cabang kosong+force = dari `if (!incoming) {` sampai badan utama dimulai. */
function pisahCabang(b: string): { kosong: string; utama: string } {
  const a = b.indexOf('if (!incoming) {')
  const u = b.indexOf('const jangkar: Record<string, string> = {}')
  return { kosong: a >= 0 && u > a ? b.slice(a, u) : '', utama: u >= 0 ? b.slice(u) : '' }
}
const dpaC = pisahCabang(bSaveDpa)
const pgC = pisahCabang(bSavePg)
cek('Keempat cabang simpan berhasil dipotong', [dpaC.kosong, dpaC.utama, pgC.kosong, pgC.utama].every(x => x.length > 200))

const JALUR: [string, string, RegExp[]][] = [
  ['saveDpa utama', dpaC.utama, [
    /tolakVersiDasar\(penanda, 'dpa_blud', versiTanggal\)/,
    /if \(turunkanPaksa && babak\) throw new BludPaksaPerubahanError\(versiTanggal\)/,
    /if \(sesudah\.length\) throw new BludSasaranPerubahanError\(/,
    /if \(hilang\.length\) throw new BludBarisDasarHilangError\(hilang\)/,
    /await catatPerubahan\(tx, \{/,
    /pagarSimpanVersi\(tx, tahun, tulis, baruPagu, turunkanPaksa, !babak\)/,
  ]],
  ['saveDpa kosong+force', dpaC.kosong, [
    /tolakVersiDasar\(penanda, 'dpa_blud', versiTanggal\)/,
    /if \(turunkanPaksa && babak\) throw new BludPaksaPerubahanError\(versiTanggal\)/,
    /throw new BludBarisDasarHilangError\(/,
    /await bersihkanPenandaYatim\(tx, tahun\)/,
    /pagarSimpanVersi\(tx, tahun, tulis, new Map\(\), turunkanPaksa, !babak\)/,
  ]],
  ['savePergeseran utama', pgC.utama, [
    /tolakVersiDasar\(penanda, 'pergeseran_dpa', versiTanggal\)/,
    /if \(babak && dpaVersiTanggal < babak\.versi_mulai\) \{/,
    /\{ tabel: 'pergeseran_dpa', versi: versiTanggal, acuan: dpaVersiTanggal \}/,
  ]],
  ['savePergeseran kosong+force', pgC.kosong, [
    /tolakVersiDasar\(await penandaPerubahan\(tx, tahun\), 'pergeseran_dpa', versiTanggal\)/,
    /\{ tabel: 'pergeseran_dpa', versi: versiTanggal, acuan: dpaVersiTanggal \}/,
  ]],
  ['deleteDpaVersi', bDelDpa, [
    /tolakVersiDasar\(await penandaPerubahan\(tx, tahun\), 'dpa_blud', versiTanggal\)/,
    /penandaDibuang = await bersihkanPenandaYatim\(tx, tahun\)/,
  ]],
  ['deletePergeseranVersi', bDelPg, [
    /tolakVersiDasar\(await penandaPerubahan\(tx, tahun\), 'pergeseran_dpa', versiTanggal\)/,
  ]],
]
for (const [nama, isi, pola] of JALUR) {
  const kurang = pola.filter(p => !p.test(isi))
  cek(`${nama}: ${pola.length} pagar terpasang`, isi.length > 0 && kurang.length === 0, kurang.map(String).join(' · ').slice(0, 120))
}
// Urutan di dalam saveDpa utama: kunci setahun dulu, penanda dibaca di bawahnya,
// R8 sebelum pagar pagu, penanda ditulis SESUDAH barisnya.
{
  const u = dpaC.utama
  const i = (s: string) => u.indexOf(s)
  cek('saveDpa: kunci setahun → penanda → §5.1/R8 → pagar pagu → baris → penanda',
    i('await kunciVersiTahun(tx, tahun)') >= 0
    && i('await kunciVersiTahun(tx, tahun)') < i('await penandaPerubahan(tx, tahun)')
    && i('await penandaPerubahan(tx, tahun)') < i('throw new BludPaksaPerubahanError')
    && i('throw new BludPaksaPerubahanError') < i('await pagarSimpanVersi(')
    && i('await bulkInsert(\'dpa_blud\'') < i('await catatPerubahan(tx, {'))
  // Penanda ditulis di transaksi YANG SAMA dengan barisnya — satu withTransaction.
  cek('saveDpa: catatPerubahan di dalam withTransaction yang sama dengan bulkInsert',
    (u.match(/await withTransaction\(/g) ?? []).length === 1 && i('await catatPerubahan(') > i('await withTransaction('))
  // Kolom Sebelum: dari `dasar` (server), tidak pernah dari baris kiriman.
  cek('Kolom Sebelum diisi dari versi dasar, bukan dari baris klien',
    /s \? s\.vol : null, s \? s\.satuan : null, s \? s\.harga : null, s \? s\.jumlah : null/.test(u)
    && !/r\.(vol|satuan|harga|jumlah)_sebelum/.test(u))
  cek('R4 tidak bisa ditembus force (tidak ada `force` di syaratnya)', !/force[^\n]*BludBarisDasarHilangError|BludBarisDasarHilangError[^\n]*force/.test(u))
}
cek('DPA_COLUMNS memuat 4 kolom Sebelum', /'vol_sebelum', 'satuan_sebelum', 'harga_sebelum', 'jumlah_sebelum',/.test(kData))
cek('normDpa memetakan 4 kolom Sebelum',
  ['vol_sebelum', 'satuan_sebelum', 'harga_sebelum', 'jumlah_sebelum'].every(k => new RegExp(`${k}: r\\.${k} != null`).test(badan(kData, 'normDpa'))))
cek('penanda dibuang di transaksi hapus, SESUDAH DELETE baris',
  bDelDpa.indexOf('DELETE FROM dpa_blud') < bDelDpa.indexOf('await bersihkanPenandaYatim(tx, tahun)'))

// ─── D. R7 — jalur belanja ───────────────────────────────────────────────────
console.log('\n── D. R7 — kunci setahun berbagi + baca terkunci ──')
const kReal = kode(baca('lib/blud/realisasi-data.ts'))
const bPeriksa = badan(kReal, 'kunciDanPeriksaPagu')
{
  const iReturn = bPeriksa.indexOf('if (!alokasi.length) return')
  const iTahun = bPeriksa.indexOf('await kunciVersiTahunBerbagi(tx, tahun)')
  const iPagu = bPeriksa.indexOf('await acquireBludLock(tx, BLUD_PAGU_ENTITY')
  cek('kunciDanPeriksaPagu: kunci setahun SESUDAH cek alokasi, SEBELUM kunci pagu',
    iReturn >= 0 && iTahun > iReturn && iPagu > iTahun, `${iReturn} < ${iTahun} < ${iPagu}`)
  cek('kunciVersiTahunBerbagi = FOR SHARE pada BLUD_VERSI_ENTITY',
    /acquireBludLockBerbagi\(tx, BLUD_VERSI_ENTITY, bludTahunKey\(tahun\)\)/.test(badan(kReal, 'kunciVersiTahunBerbagi'))
    && /FOR SHARE/.test(badan(kode(baca('lib/data/locks.ts')), 'acquireBludLockBerbagi')))
  // Varian ini tidak bisa dijeda deterministik di uji balapan (celahnya di antara dua
  // pernyataan tanpa kunci), jadi dijaga di sini.
  cek('bacaPaguTerkunci membaca sumber pagu dalam mode terkunci',
    /sumberPaguTahun\(tx, tahun, \{\}, \{ terkunci: true \}\)/.test(badan(kReal, 'bacaPaguTerkunci')))
}

// ─── E. Route ────────────────────────────────────────────────────────────────
console.log('\n── E. Route ──')
const kDpaRoute = kode(baca('app/api/blud/dpa/route.ts'))
const kPgRoute = kode(baca('app/api/blud/pergeseran/route.ts'))
cek('POST DPA meneruskan asal_perubahan ke saveDpa', /expected_version, force, turunkan_paksa, entri_historis, asal_perubahan \?\? null,/.test(kDpaRoute))
for (const kodeGalat of ['SASARAN_PERUBAHAN_TERPAKAI', 'DASAR_PERUBAHAN_BERGESER', 'BARIS_DASAR_DIHAPUS', 'TURUNKAN_PAKSA_DITUTUP', 'VERSI_DASAR_PERUBAHAN', 'PERUBAHAN_GANDA']) {
  cek(`POST DPA memetakan ${kodeGalat}`, kDpaRoute.includes(`'${kodeGalat}'`))
}
cek('DELETE DPA memetakan VERSI_DASAR_PERUBAHAN (+ audit tolakan)', (kDpaRoute.match(/'VERSI_DASAR_PERUBAHAN'/g) ?? []).length === 2)
cek('Pergeseran memetakan PERGESERAN_ACUAN_SEBELUM_PERUBAHAN', kPgRoute.includes("'PERGESERAN_ACUAN_SEBELUM_PERUBAHAN'"))
cek('Pergeseran memetakan VERSI_DASAR_PERUBAHAN di POST dan DELETE', (kPgRoute.match(/'VERSI_DASAR_PERUBAHAN'/g) ?? []).length === 2)
cek('PAGU_DIBAWAH_REALISASI membawa bisa_dipaksa di kedua route',
  /bisa_dipaksa: err\.bisaDipaksa/.test(kDpaRoute) && /bisa_dipaksa: err\.bisaDipaksa/.test(kPgRoute))
cek('Audit menyebut pembuatan Perubahan', /MEMBUAT DPA PERUBAHAN ke-/.test(kDpaRoute))

// ─── F. Kalimat galat ────────────────────────────────────────────────────────
console.log('\n── F. Kalimat galat menyebut jalan keluarnya ──')
const sas = new BludSasaranPerubahanError('2026-10-09', '2026-10-09')
cek('Sasaran terpakai: tiga bagian (masalah · sebab · jalan keluar)', sas.message.split('\n').length === 2 && /besok/.test(sas.message))
cek('Sasaran sebelum DPA terakhir: menyuruh pilih bulan berjalan', /periode bulan berjalan/.test(new BludSasaranPerubahanError('2026-09-30', '2026-10-01').message))
cek('Acuan babak lama: menyebut tombol Buat Pergeseran',
  /Buat Pergeseran/.test(new BludAcuanSebelumPerubahanError('2026-10-20', '2026-01-31', '2026-10-09', 1).message))
cek('Versi dasar: menyebut jalan keluarnya (hapus DPA Perubahan dulu)',
  /hapus dulu DPA Perubahan/.test(new BludVersiDasarError('pergeseran_dpa', '2026-03-31', '2026-10-09', 1).message))
cek('Baris dasar hilang: menyuruh menolkan, bukan menghapus',
  /dinolkan, bukan dihapus/.test(new BludBarisDasarHilangError([{ anggaran_key: 'k', kode_rekening: '5.1', uraian: 'ATK' }]).message))
cek('R8: tidak menawarkan simpan paksa', /simpan paksa tidak tersedia/.test(new BludPaksaPerubahanError('2026-10-09').message))
const b = [{ anggaran_key: 'k', kode_rekening: '5.1', uraian: 'x', pagu_baru: 1, terserap: 2, minus: 1, hilang: false }]
cek('Pagu di bawah realisasi (Perubahan): kalimat tanpa "simpan ulang dengan konfirmasi"',
  !/konfirmasi/.test(new BludPaguDibawahRealisasiError(b, false).message) && /konfirmasi/.test(new BludPaguDibawahRealisasiError(b).message))

console.log(`\n${lulus} pemeriksaan LULUS · ${gagal} GAGAL`)
process.exit(gagal > 0 ? 1 : 0)
