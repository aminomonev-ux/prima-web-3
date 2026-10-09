// scripts/test-blud-impor-balik.mts — DPA Perubahan BLUD, Tahap 5: impor-balik Excel
// unduhan PRIMA ke versi yang sedang terbuka (konsep docs/CONCEPT-blud-dpa-perubahan.md §11.3).
//
// Yang dijaga:
//   A. penanda unduhan — eksporter menulisnya di kolom Jangkar tersembunyi, di luar kop
//   B. parser membacanya balik dari workbook SUNGGUHAN
//   C. penjaga `periksaImporBalik` — tolak (bukan unduhan / tahun / versi / jenis / jangkar
//      asing) dan peringatan (basi, tanpa penanda)
//   D. `gabungImporBalik` — row_id dipakai ulang lewat jangkar, aturan hapus §10, posisi
//      baris yang bertahan, kolom yang tak terbawa Excel, neraca pembanding
//   E. bolak-balik penuh: unduh → baca → gabung TANPA sunting = tak ada yang berubah
//   F. sambungan layar, route, Zod, Cetak (teks tanpa komentar, kutipan utuh — L82c)
//
// USAGE: npx tsx scripts/test-blud-impor-balik.mts

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type ExcelJS from 'exceljs'
import { buatWorkbookDpa, buatWorkbookDpaPerubahan } from '../lib/blud/export/dpa-dokumen'
import { bacaGridDpa } from '../lib/blud/import-dpa-grid'
import { bacaDpaDariGrid } from '../lib/blud/import-dpa'
import { keDpaBarisInput } from '../lib/blud/import-dpa-shared'
import { dpaKeInput } from '../lib/blud/row-map'
import { kalimatTerbaca } from '../lib/blud/perubahan'
import { AsalImporSchema } from '../lib/blud/schemas'
import {
  teksPenandaUnduhan, bacaTeksPenandaUnduhan, periksaImporBalik, gabungImporBalik,
  type BerkasImporBalik, type VersiTerbuka,
} from '../lib/blud/impor-balik'
import type { DpaBaris, DpaBarisInput } from '../types'

const AKAR = join(import.meta.dirname, '..')
const baca = (p: string) => readFileSync(join(AKAR, p), 'utf8')
function kode(isi: string): string {
  return isi.replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

let lulus = 0
let gagal = 0
function cek(nama: string, syarat: boolean, catatan = '') {
  if (syarat) { lulus++; console.log(`  ok    ${nama.padEnd(78)} ${catatan}`) }
  else        { gagal++; console.log(`  GAGAL ${nama.padEnd(78)} ${catatan}`) }
}

const KUNCI = (h: string) => `AK-${h.repeat(32)}`
const dasar = {
  id: 0, tahun_anggaran: 2099, versi_tanggal: '2099-10-08', satuan: null, parent_id: null,
  anggaran_key: null, origin: 'MANUAL', usulan_item_id: null, usulan_no: null,
  penanggung_jawab: null, keterangan: null,
  vol: null, harga: null, jumlah: 0,
  vol_sebelum: null, satuan_sebelum: null, harga_sebelum: null, jumlah_sebelum: null,
} as unknown as DpaBaris

/**
 * akar 35 jt = atk 10 + listrik 15 + gedung (cat 4 + atap 6). ATK lahir dari Usulan —
 * tautan itu tidak terbawa Excel, jadi gabungan WAJIB mengambilnya dari pasangannya.
 */
function barisMurni(): DpaBaris[] {
  return [
    { ...dasar, row_id: 'akar', tipe_baris: 'GRANDMASTER', urutan: 0, kode_rekening: '5', uraian: 'BELANJA',
      jumlah: 35_000_000, anggaran_key: KUNCI('a') },
    { ...dasar, row_id: 'atk', parent_id: 'akar', tipe_baris: 'MASTER', urutan: 1, kode_rekening: '5.1', uraian: 'ATK',
      vol: 10, satuan: 'rim', harga: 1_000_000, jumlah: 10_000_000, anggaran_key: KUNCI('b'),
      origin: 'USULAN', usulan_item_id: 77, usulan_no: 'U-77', penanggung_jawab: 'Kasubbag Umum' },
    { ...dasar, row_id: 'listrik', parent_id: 'akar', tipe_baris: 'MASTER', urutan: 2, kode_rekening: '5.2', uraian: 'Listrik',
      vol: 1, satuan: 'thn', harga: 15_000_000, jumlah: 15_000_000, anggaran_key: KUNCI('c'), keterangan: 'PLN' },
    { ...dasar, row_id: 'gedung', parent_id: 'akar', tipe_baris: 'MASTER', urutan: 3, kode_rekening: '5.3', uraian: 'Pemeliharaan gedung',
      jumlah: 10_000_000, anggaran_key: KUNCI('d') },
    // Kode sepanjang aslinya: pola segmen 8 karakter dulu membuat kode begini terbaca
    // KOSONG pada setiap impor unduhan PRIMA — dan data uji berkode pendek tidak pernah melihatnya.
    { ...dasar, row_id: 'cat', parent_id: 'gedung', tipe_baris: 'CHILD', urutan: 4, kode_rekening: '5.1.02.03.02.0001', uraian: 'Cat',
      vol: 1, satuan: 'ls', harga: 4_000_000, jumlah: 4_000_000, anggaran_key: KUNCI('e') },
    { ...dasar, row_id: 'atap', parent_id: 'gedung', tipe_baris: 'CHILD', urutan: 5, kode_rekening: '5.1.02.03.02.0002', uraian: 'Atap',
      vol: 1, satuan: 'ls', harga: 6_000_000, jumlah: 6_000_000, anggaran_key: KUNCI('f') },
  ]
}
/** Versi Perubahan dari pohon yang sama: semua sudah ada sebelum Perubahan KECUALI listrik. */
function barisPerubahan(): DpaBaris[] {
  return barisMurni().map(r => r.row_id === 'listrik' ? r : {
    ...r, vol_sebelum: r.vol, satuan_sebelum: r.satuan, harga_sebelum: r.harga, jumlah_sebelum: r.jumlah,
  })
}

const nilai = (ws: ExcelJS.Worksheet, r: number, c: number) => ws.getRow(r).getCell(c).value
const keBuffer = async (wb: ExcelJS.Workbook) => Buffer.from(await wb.xlsx.writeBuffer())
const bacaWb = async (wb: ExcelJS.Workbook) => bacaDpaDariGrid(await bacaGridDpa(await keBuffer(wb)))
const keInput = (rows: DpaBaris[]): DpaBarisInput[] => rows.map(dpaKeInput)

/** Berkas tiruan: baris hasil parser yang sudah dipetakan (`row_id` baru, jangkar dari berkas). */
type Tiruan = { id: string; induk: string | null; kunci: string | null; uraian: string; kode: string; vol: number | null; harga: number | null; tipe: DpaBarisInput['tipe_baris'] }
function berkas(baris: Tiruan[]): DpaBarisInput[] {
  return baris.map((b, i) => ({
    kode_rekening: b.kode, uraian: b.uraian, vol: b.vol, satuan: b.vol != null ? 'x' : null, harga: b.harga,
    jumlah: b.vol != null && b.harga != null ? b.vol * b.harga : 0,
    penanggung_jawab: null, keterangan: null, tipe_baris: b.tipe, row_id: b.id, anggaran_key: b.kunci,
    parent_id: b.induk, urutan: i, origin: 'MANUAL' as const,
  }))
}

/** Tabel digambar menurut URUTAN baris: tiap baris harus berada di dalam blok subpohon induknya. */
function pohonUtuh(rows: readonly DpaBarisInput[]): boolean {
  const idx = new Map(rows.map((r, i) => [r.row_id, i]))
  const induk = new Map(rows.map(r => [r.row_id, r.parent_id]))
  const keturunan = (x: string, p: string) => { let c = induk.get(x); while (c) { if (c === p) return true; c = induk.get(c) } return false }
  return rows.every((r, i) => {
    if (!r.parent_id) return true
    const ip = idx.get(r.parent_id)
    if (ip == null || ip > i) return false
    for (let j = ip + 1; j < i; j++) if (!keturunan(rows[j].row_id, r.parent_id)) return false
    return true
  })
}

// ─── A. Penanda unduhan di eksporter ───────────────────────────────────────
console.log('\n── A. Penanda unduhan — eksporter ──')
{
  const teks = teksPenandaUnduhan({ tahun: 2099, versi: '2099-07-31', simpananKe: 3 })
  cek('A1 teks penanda terbaca balik utuh',
    JSON.stringify(bacaTeksPenandaUnduhan(teks)) === JSON.stringify({ tahun: 2099, versi: '2099-07-31', simpananKe: 3 }), teks)
  cek('A2 teks lain tidak dikira penanda', bacaTeksPenandaUnduhan('DPA PERUBAHAN KE-1 · versi 31 Jul 2099') === null)

  const ws = (await buatWorkbookDpa({ tahun: 2099, versi: '2099-07-31', rows: barisMurni(), simpananKe: 3 })).worksheets[0]
  const kolJangkar = 10
  cek('A3 penanda di kolom Jangkar baris 1', nilai(ws, 1, kolJangkar) === teks, String(nilai(ws, 1, kolJangkar)))
  cek('A4 kolom itu tersembunyi — tidak tercetak', ws.getColumn(kolJangkar).hidden === true)
  cek('A5 di luar sel gabung kop (J1 berdiri sendiri)', ws.getCell(1, kolJangkar).master.address === 'J1')
  cek('A6 kop yang terlihat tidak berubah', String(nilai(ws, 1, 1)) === 'RINCIAN BELANJA ANGGARAN')

  const tanpa = (await buatWorkbookDpa({ tahun: 2099, versi: '2099-07-31', rows: barisMurni() })).worksheets[0]
  cek('A7 tanpa simpananKe → tanpa penanda', !nilai(tanpa, 1, kolJangkar))
  const tanpaVersi = (await buatWorkbookDpa({ tahun: 2099, versi: null, rows: barisMurni(), simpananKe: 3 })).worksheets[0]
  cek('A8 tanpa versi → tanpa penanda (tak ada yang bisa dicocokkan)', !nilai(tanpaVersi, 1, kolJangkar))
  const nol = (await buatWorkbookDpa({ tahun: 2099, versi: '2099-07-31', rows: barisMurni(), simpananKe: 0 })).worksheets[0]
  cek('A9 simpanan ke-0 tetap ditulis (0 ≠ tidak tahu)', String(nilai(nol, 1, kolJangkar)).endsWith('simpanan ke-0'))

  // Lengkap SENGAJA tidak bisa diimpor (§11.2) — penanda di sana cuma mengundang salah paham.
  const lengkap = (await buatWorkbookDpaPerubahan({
    tahun: 2099, versi: '2099-10-08', rows: barisPerubahan(), perubahanKe: 1,
  })).worksheets[0]
  let adaDiLengkap = false
  for (let r = 1; r <= 8; r++) for (let c = 1; c <= 20; c++) if (bacaTeksPenandaUnduhan(String(nilai(lengkap, r, c) ?? ''))) adaDiLengkap = true
  cek('A10 format Lengkap tidak membawa penanda unduhan', !adaDiLengkap)
}

// ─── B. Parser membaca penanda ──────────────────────────────────────────────
console.log('\n── B. Parser ──')
{
  const h = await bacaWb(await buatWorkbookDpa({ tahun: 2099, versi: '2099-07-31', rows: barisMurni(), simpananKe: 3 }))
  cek('B1 unduhan terbaca', h.unduhan?.versi === '2099-07-31' && h.unduhan.simpananKe === 3 && h.unduhan.tahun === 2099,
    JSON.stringify(h.unduhan))
  cek('B2 kolom data tetap terbaca seperti biasa', h.baris.length === 6 && h.kolom.jangkar != null)
  const tanpa = await bacaWb(await buatWorkbookDpa({ tahun: 2099, versi: '2099-07-31', rows: barisMurni() }))
  cek('B3 unduhan lama tanpa penanda → null', tanpa.unduhan === null)
  const ringkas = await bacaWb(await buatWorkbookDpa({
    tahun: 2099, versi: '2099-10-08', rows: barisPerubahan(), perubahanKe: 1, simpananKe: 2,
  }))
  cek('B4 Ringkas Perubahan: kop DAN penanda dua-duanya terbaca',
    ringkas.perubahanKe === 1 && ringkas.unduhan?.simpananKe === 2)
  cek('B5 kalimat Terbaca menyebut versi & simpanan berkas murni',
    kalimatTerbaca({ perubahanKe: null, versiKop: null, unduhanPrima: true, baris: 6, unduhan: h.unduhan })
      === 'Excel DPA murni · unduhan PRIMA · versi 31 Jul 2099 · simpanan ke-3 · 6 baris')
  cek('B6 … tanpa penanda bunyinya seperti dulu',
    kalimatTerbaca({ perubahanKe: null, versiKop: null, unduhanPrima: false, baris: 6 }) === 'Excel DPA murni · formulir luar · 6 baris')
  const kodeBaca = h.baris.map(b => b.kode).join(' | ')
  cek('B7 kode rekening panjang (satu kolom) terbaca UTUH, tidak dikosongkan',
    kodeBaca === barisMurni().map(r => r.kode_rekening).join(' | '), kodeBaca)
  // Pagar sel sampah tetap: backtick tunggal di kolom kode bukan kode.
  const wbSampah = await buatWorkbookDpa({ tahun: 2099, versi: '2099-07-31', rows: barisMurni() })
  wbSampah.worksheets[0].getRow(7).getCell(1).value = '`'
  const sampah = await bacaWb(wbSampah)
  cek('B8 … sel sampah di kolom kode tetap ditolak', sampah.baris[0].kode === '', JSON.stringify(sampah.baris[0].kode))
}

// ─── C. Penjaga ─────────────────────────────────────────────────────────────
console.log('\n── C. periksaImporBalik ──')
{
  const v: VersiTerbuka = {
    tahun: 2099, versi: '2099-07-31', simpananKini: 3, babak: null,
    jangkar: new Set(barisMurni().map(r => r.anggaran_key!)),
  }
  const b = (x: Partial<BerkasImporBalik> = {}): BerkasImporBalik => ({
    adaKolomJangkar: true, perubahanKe: null,
    unduhan: { tahun: 2099, versi: '2099-07-31', simpananKe: 3 },
    baris: barisMurni().map((r, i) => ({ barisExcel: 8 + i, uraian: r.uraian, jangkar: r.anggaran_key })),
    ...x,
  })
  const tolakNya = (p: ReturnType<typeof periksaImporBalik>) => p.tolak ?? ''
  const segar = periksaImporBalik(b(), v)
  cek('C1 berkas segar: lolos tanpa peringatan', segar.tolak === null && 'peringatan' in segar && segar.peringatan.length === 0)
  cek('C2 tanpa kolom Jangkar (formulir luar) → tolak',
    tolakNya(periksaImporBalik(b({ adaKolomJangkar: false }), v)).includes('formulir dari luar'))
  cek('C3 tahun lain → tolak',
    tolakNya(periksaImporBalik(b({ unduhan: { tahun: 2098, versi: '2099-07-31', simpananKe: 3 } }), v)).includes('DPA 2098'))
  const lain = tolakNya(periksaImporBalik(b({ unduhan: { tahun: 2099, versi: '2099-06-30', simpananKe: 3 } }), v))
  cek('C4 versi lain → tolak, menyebut kedua versi', lain.includes('30 Jun 2099') && lain.includes('31 Jul 2099'), lain.slice(0, 70))
  cek('C5 berkas murni ke versi Perubahan → tolak',
    tolakNya(periksaImporBalik(b(), { ...v, babak: 1 })).includes('DPA murni, sedangkan versi 31 Jul 2099 yang terbuka DPA Perubahan ke-1'))
  cek('C6 berkas Perubahan ke versi murni → tolak',
    tolakNya(periksaImporBalik(b({ perubahanKe: 1 }), v)).includes('DPA Perubahan ke-1, sedangkan versi 31 Jul 2099 yang terbuka DPA murni'))
  cek('C7 Perubahan ke-1 ke versi Perubahan ke-2 → tolak',
    tolakNya(periksaImporBalik(b({ perubahanKe: 1 }), { ...v, babak: 2 })).includes('DPA Perubahan ke-2'))
  cek('C8 Perubahan ke-1 ke versi Perubahan ke-1 → lolos',
    periksaImporBalik(b({ perubahanKe: 1 }), { ...v, babak: 1 }).tolak === null)
  const asing = periksaImporBalik(b({
    baris: [...b().baris, { barisExcel: 20, uraian: 'Disalin dari 2098', jangkar: KUNCI('9') }],
  }), v)
  cek('C9 jangkar asing → tolak, menyebut barisnya', tolakNya(asing).includes('1 baris') && tolakNya(asing).includes('b.20 "Disalin dari 2098"'))
  cek('C10 jangkar beda huruf besar-kecil tetap dikenal',
    periksaImporBalik(b({ baris: [{ barisExcel: 8, uraian: 'BELANJA', jangkar: KUNCI('A') }] }), v).tolak === null)
  cek('C11 baris TANPA jangkar = baris baru, bukan asing',
    periksaImporBalik(b({ baris: [...b().baris, { barisExcel: 21, uraian: 'Baru', jangkar: null }] }), v).tolak === null)

  const basi = periksaImporBalik(b({ unduhan: { tahun: 2099, versi: '2099-07-31', simpananKe: 1 } }), v)
  const pBasi = basi.tolak === null ? basi.peringatan.join(' ') : ''
  cek('C12 berkas basi → peringatan simpanan ke-1 vs ke-3', pBasi.includes('simpanan ke-1') && pBasi.includes('simpanan ke-3') && pBasi.includes('tertimpa'))
  const maju = periksaImporBalik(b({ unduhan: { tahun: 2099, versi: '2099-07-31', simpananKe: 5 } }), v)
  cek('C13 simpanan berkas melampaui versi → peringatan dihapus-lalu-disimpan-ulang',
    maju.tolak === null && maju.peringatan.join(' ').includes('pernah dihapus lalu disimpan ulang'))
  const lama = periksaImporBalik(b({ unduhan: null }), v)
  cek('C14 unduhan tanpa penanda → peringatan, bukan tolak',
    lama.tolak === null && lama.peringatan.join(' ').includes('tidak mencatat dari simpanan ke berapa'))
  // Urutan: berkas dari luar disebut sebagai berkas dari luar, bukan "jangkar asing".
  cek('C15 tanpa kolom Jangkar didahulukan dari pemeriksaan lain',
    tolakNya(periksaImporBalik(b({ adaKolomJangkar: false, unduhan: { tahun: 2001, versi: '2001-01-31', simpananKe: 1 } }), v)).includes('formulir dari luar'))
}

// ─── D. Menggabungkan ───────────────────────────────────────────────────────
console.log('\n── D. gabungImporBalik ──')
{
  // Sunting di Excel: ATK 10 → 12 rim, Listrik dihapus, Atap diganti uraiannya, Internet baru.
  const disunting: Tiruan[] = [
    { id: 'x1', induk: null, kunci: KUNCI('a'), uraian: 'BELANJA', kode: '5', vol: null, harga: null, tipe: 'GRANDMASTER' },
    { id: 'x2', induk: 'x1', kunci: KUNCI('b').toUpperCase().replace('AK-', 'AK-'), uraian: 'ATK', kode: '5.1', vol: 12, harga: 1_000_000, tipe: 'MASTER' },
    { id: 'x4', induk: 'x1', kunci: KUNCI('d'), uraian: 'Pemeliharaan gedung', kode: '5.3', vol: null, harga: null, tipe: 'MASTER' },
    { id: 'x5', induk: 'x4', kunci: KUNCI('e'), uraian: 'Cat', kode: '5.3.1', vol: 1, harga: 4_000_000, tipe: 'CHILD' },
    { id: 'x6', induk: 'x4', kunci: KUNCI('f'), uraian: 'Atap genteng', kode: '5.3.2', vol: 1, harga: 6_000_000, tipe: 'CHILD' },
    { id: 'x7', induk: 'x1', kunci: null, uraian: 'Internet', kode: '5.4', vol: 1, harga: 3_000_000, tipe: 'MASTER' },
  ]
  const m = gabungImporBalik(keInput(barisMurni()), berkas(disunting))
  const by = new Map(m.rows.map(r => [r.uraian, r]))
  cek('D1 baris berpasangan memakai row_id VERSI', by.get('ATK')?.row_id === 'atk' && by.get('Cat')?.row_id === 'cat')
  cek('D2 induknya ikut dipetakan ke row_id versi', by.get('Cat')?.parent_id === 'gedung' && by.get('ATK')?.parent_id === 'akar')
  cek('D3 jangkar dipulangkan ke tulisan versi (bukan huruf besar berkas)', by.get('ATK')?.anggaran_key === KUNCI('b'))
  cek('D4 tautan Usulan diambil dari pasangannya',
    by.get('ATK')?.origin === 'USULAN' && by.get('ATK')?.usulan_item_id === 77 && by.get('ATK')?.usulan_no === 'U-77')
  const internet = by.get('Internet')
  cek('D5 baris baru: row_id berkas, tanpa jangkar, di bawah akar',
    internet?.row_id === 'x7' && internet.anggaran_key == null && internet.parent_id === 'akar')
  cek('D6 murni: baris yang hilang DIHAPUS', !by.has('Listrik') && m.banding.dihapus.some(d => d.uraian === 'Listrik' && d.jumlah === 15_000_000))
  cek('D7 neraca: ATK 10 jt → 12 jt di "berubah"',
    m.banding.berubah.length === 1 && m.banding.berubah[0].lama === 10_000_000 && m.banding.berubah[0].baru === 12_000_000)
  cek('D8 neraca: Internet di "baru"', m.banding.baru.length === 1 && m.banding.baru[0].jumlah === 3_000_000)
  // Atap: uraian berubah; ATK: PJ di berkas kosong — dua-duanya bukan perubahan jumlah.
  cek('D9 neraca: perubahan selain jumlah dihitung', m.banding.lainBerubah >= 1, `${m.banding.lainBerubah}`)
  cek('D10 total: 35 jt → 25 jt (12 + 10 + 3)', m.banding.totalLama === 35_000_000 && m.banding.totalBaru === 25_000_000,
    `${m.banding.totalLama} → ${m.banding.totalBaru}`)
  cek('D11 induk dihitung ulang dari anak', by.get('BELANJA')?.jumlah === 25_000_000 && by.get('Pemeliharaan gedung')?.jumlah === 10_000_000)
  cek('D12 urutan berurut 0..n−1', m.rows.every((r, i) => r.urutan === i))
  cek('D13 murni: tidak ada yang dinolkan', m.banding.dinolkan.length === 0)

  // Versi Perubahan, berkas membuang ATK (ada sebelum Perubahan), Listrik (lahir di
  // Perubahan) dan Cat (ada sebelum Perubahan, anak gedung).
  const buang: Tiruan[] = [
    { id: 'y1', induk: null, kunci: KUNCI('a'), uraian: 'BELANJA', kode: '5', vol: null, harga: null, tipe: 'GRANDMASTER' },
    { id: 'y4', induk: 'y1', kunci: KUNCI('d'), uraian: 'Pemeliharaan gedung', kode: '5.3', vol: null, harga: null, tipe: 'MASTER' },
    { id: 'y6', induk: 'y4', kunci: KUNCI('f'), uraian: 'Atap', kode: '5.3.2', vol: 1, harga: 6_000_000, tipe: 'CHILD' },
    { id: 'y7', induk: 'y1', kunci: null, uraian: 'Internet', kode: '5.4', vol: 1, harga: 3_000_000, tipe: 'MASTER' },
  ]
  const p = gabungImporBalik(keInput(barisPerubahan()), berkas(buang))
  const bp = new Map(p.rows.map(r => [r.uraian, r]))
  cek('D14 Perubahan: ATK (ada sebelum Perubahan) DINOLKAN, bukan dihapus',
    bp.get('ATK')?.jumlah === 0 && bp.get('ATK')?.vol == null && bp.get('ATK')?.harga == null)
  cek('D15 … Sebelum-nya tetap terbawa (layar menampilkan "Rp 10 jt → 0")', bp.get('ATK')?.jumlah_sebelum === 10_000_000)
  cek('D16 Perubahan: Listrik (lahir di Perubahan) tetap DIHAPUS', !bp.has('Listrik'))
  cek('D17 Cat dinolkan dan tetap di bawah gedung', bp.get('Cat')?.parent_id === 'gedung' && bp.get('Cat')?.jumlah === 0)
  cek('D18 neraca dinolkan menyebut ATK & Cat dgn angka lamanya',
    p.banding.dinolkan.length === 2 && p.banding.dinolkan.some(d => d.uraian === 'ATK' && d.jumlah === 10_000_000)
      && p.banding.dinolkan.some(d => d.uraian === 'Cat' && d.jumlah === 4_000_000))
  cek('D19 neraca dihapus hanya Listrik', p.banding.dihapus.length === 1 && p.banding.dihapus[0].uraian === 'Listrik')
  cek('D20 ATK disisip di tempat asalnya (anak pertama akar)', p.rows.findIndex(r => r.row_id === 'atk') === 1)
  cek('D21 tiap baris tetap di dalam blok subpohon induknya', pohonUtuh(p.rows))
  cek('D22 kolom Sebelum baris berpasangan ikut dari versi', bp.get('Atap')?.jumlah_sebelum === 6_000_000 && bp.get('Internet')?.jumlah_sebelum == null)

  // Seluruh subpohon gedung lenyap dari berkas: anak-anaknya ada sebelum Perubahan, jadi
  // INDUKNYA ikut dipertahankan — kalau tidak, baris yang dinolkan kehilangan induknya.
  const tanpaGedung = gabungImporBalik(keInput(barisPerubahan()), berkas(buang.filter(x => x.induk !== 'y4' && x.id !== 'y4')))
  const tg = new Map(tanpaGedung.rows.map(r => [r.uraian, r]))
  cek('D23 induk yang hilang dipertahankan bila anaknya dipertahankan',
    tg.has('Pemeliharaan gedung') && tg.get('Cat')?.parent_id === 'gedung' && tg.get('Atap')?.parent_id === 'gedung')
  cek('D24 … induk itu tidak tercatat "dinolkan" (angkanya dijumlah dari anak)',
    !tanpaGedung.banding.dinolkan.some(d => d.uraian === 'Pemeliharaan gedung') && tg.get('Pemeliharaan gedung')?.jumlah === 0)
  cek('D25 … pohonnya tetap utuh', pohonUtuh(tanpaGedung.rows))

  // Anak baru ditambahkan di Excel di bawah ATK; Listrik yang dinolkan harus mendarat
  // SESUDAH seluruh subpohon ATK, bukan di sela anak ATK.
  const anakBaru: Tiruan[] = [
    { id: 'z1', induk: null, kunci: KUNCI('a'), uraian: 'BELANJA', kode: '5', vol: null, harga: null, tipe: 'GRANDMASTER' },
    { id: 'z2', induk: 'z1', kunci: KUNCI('b'), uraian: 'ATK', kode: '5.1', vol: null, harga: null, tipe: 'MASTER' },
    { id: 'z21', induk: 'z2', kunci: null, uraian: 'Kertas', kode: '5.1.1', vol: 5, harga: 1_000_000, tipe: 'CHILD' },
    { id: 'z22', induk: 'z2', kunci: null, uraian: 'Tinta', kode: '5.1.2', vol: 5, harga: 1_000_000, tipe: 'CHILD' },
    { id: 'z4', induk: 'z1', kunci: KUNCI('d'), uraian: 'Pemeliharaan gedung', kode: '5.3', vol: null, harga: null, tipe: 'MASTER' },
    { id: 'z5', induk: 'z4', kunci: KUNCI('e'), uraian: 'Cat', kode: '5.3.1', vol: 1, harga: 4_000_000, tipe: 'CHILD' },
    { id: 'z6', induk: 'z4', kunci: KUNCI('f'), uraian: 'Atap', kode: '5.3.2', vol: 1, harga: 6_000_000, tipe: 'CHILD' },
  ]
  const versiListrikLama = barisPerubahan().map(r => r.row_id === 'listrik'
    ? { ...r, vol_sebelum: 1, satuan_sebelum: 'thn', harga_sebelum: 15_000_000, jumlah_sebelum: 15_000_000 } : r)
  const ab = gabungImporBalik(keInput(versiListrikLama), berkas(anakBaru))
  const ia = ab.rows.findIndex(r => r.uraian === 'Listrik')
  cek('D26 baris dinolkan mendarat sesudah subpohon kakaknya', ab.rows[ia - 1]?.uraian === 'Tinta' && ab.rows[ia + 1]?.uraian === 'Pemeliharaan gedung',
    ab.rows.map(r => r.uraian).join(' › '))
  cek('D27 … pohonnya tetap utuh', pohonUtuh(ab.rows))
  cek('D28 rekening yang dipecah jadi anak: ATK tidak tercatat "berubah" (bukan daun lagi)',
    !ab.banding.berubah.some(b => b.uraian === 'ATK') && ab.banding.baru.length === 2)

  // Murni, subpohon gedung lenyap utuh: yang dicantumkan DAUN-nya (Cat 4 + Atap 6), bukan
  // induknya juga — kalau induk ikut, 10 juta yang sama tercatat dua kali (L85).
  const tanpaSubpohon = gabungImporBalik(keInput(barisMurni()), berkas(disunting.filter(x => x.induk !== 'x4' && x.id !== 'x4')))
  const dh = tanpaSubpohon.banding.dihapus.map(d => d.uraian).sort().join(',')
  cek('D29 subpohon lenyap: yang tercatat dihapus hanya daunnya', dh === 'Atap,Cat,Listrik', dh)
}

// ─── E. Bolak-balik penuh ───────────────────────────────────────────────────
console.log('\n── E. Unduh → baca → gabung ──')
for (const [nama, rows, ke] of [['murni', barisMurni(), null], ['Perubahan', barisPerubahan(), 1]] as const) {
  const wb = await buatWorkbookDpa({ tahun: 2099, versi: '2099-07-31', rows: [...rows], perubahanKe: ke, simpananKe: 4 })
  const h = await bacaWb(wb)
  const versiInput = keInput([...rows])
  const putusan = periksaImporBalik(
    { adaKolomJangkar: h.kolom.jangkar != null, perubahanKe: h.perubahanKe, unduhan: h.unduhan, baris: h.baris },
    { tahun: 2099, versi: '2099-07-31', simpananKini: 4, babak: ke, jangkar: new Set(versiInput.map(r => r.anggaran_key!)) },
  )
  cek(`E1 ${nama}: berkas sendiri yang segar lolos tanpa peringatan`,
    putusan.tolak === null && putusan.peringatan.length === 0, putusan.tolak ?? '')
  const g = gabungImporBalik(versiInput, keDpaBarisInput(h.baris))
  const b = g.banding
  cek(`E2 ${nama}: tanpa sunting = tidak ada yang berubah`,
    !b.berubah.length && !b.baru.length && !b.dinolkan.length && !b.dihapus.length && b.lainBerubah === 0,
    JSON.stringify({ ...b, totalLama: undefined, totalBaru: undefined }))
  cek(`E3 ${nama}: row_id & induk identik dgn versi`,
    JSON.stringify(g.rows.map(r => [r.row_id, r.parent_id])) === JSON.stringify(versiInput.map(r => [r.row_id, r.parent_id])))
  cek(`E4 ${nama}: total sama`, b.totalLama === b.totalBaru)

  // Sunting sungguhan di Excel: Vol ATK 10 → 12, simpan, baca lagi.
  const ws = wb.worksheets[0]
  for (let n = 1; n <= ws.rowCount; n++) if (ws.getRow(n).getCell(2).value === 'ATK') ws.getRow(n).getCell(3).value = 12
  const h2 = await bacaWb(wb)
  const g2 = gabungImporBalik(versiInput, keDpaBarisInput(h2.baris))
  cek(`E5 ${nama}: suntingan Excel terbaca sebagai satu perubahan ATK`,
    g2.banding.berubah.length === 1 && g2.banding.berubah[0].baru === 12_000_000 && g2.banding.totalBaru === 37_000_000)
  cek(`E6 ${nama}: penanda bertahan setelah disunting`, h2.unduhan?.simpananKe === 4)
}

// ─── F. Sambungan ───────────────────────────────────────────────────────────
console.log('\n── F. Sambungan ──')
{
  const rute = kode(baca('app/api/blud/dpa/import/route.ts'))
  cek('F1 route: versi terbuka dibaca lewat TanggalSchema', rute.includes("TanggalSchema.safeParse(form?.get('versi_terbuka'))"))
  cek('F2 route: isi & angka kunci versi dibaca dari SERVER',
    rute.includes('await Promise.all([getDpaByDate(tahun, versi), getDpaVersion(tahun, versi)])'))
  const iPeriksa = rute.indexOf('periksaImporBalik(')
  const iGabung = rute.indexOf('gabungImporBalik(versiInput, keDpaBarisInput(hasil.baris))')
  cek('F3 route: diperiksa dulu, baru digabung — dan hanya bila tidak ditolak',
    iPeriksa > 0 && iGabung > iPeriksa && /if \(putusan\.tolak !== null\) \{[\s\S]{0,140}\} else \{\s*const g = gabungImporBalik/.test(rute))
  cek('F4 route: jenis dinilai pada babak VERSI terbuka', rute.includes('babak: keBabak(penanda, versi),'))
  cek('F5 route: realisasi terdampak dihitung dari GABUNGAN',
    rute.includes('imporBalik?.rows ? imporBalik.rows.map(r => r.anggaran_key) : hasil.baris.map(b => b.jangkar)'))
  cek('F6 route: jawaban membawa unduhan & imporBalik', rute.includes('unduhan: hasil.unduhan,') && /\bimporBalik,\n/.test(rute))

  const modal = kode(baca('components/blud/ImportDpaModal.tsx'))
  cek('F7 modal: versi terbuka dikirim', modal.includes("if (versiTerbuka) form.append('versi_terbuka', versiTerbuka)"))
  cek('F8 modal: penolakan impor-balik menyembunyikan tombol Masukkan',
    modal.includes('tolak: b?.tolak ?? (putusan.jenis === \'tolak\' ? putusan.pesan : null),') && modal.includes('{hasil && !tolak && ('))
  cek('F9 modal: peringatan impor-balik ditanyakan sebelum onTerapkan',
    /if \(peringatan\.length && !\(await confirmDialog\(\{[\s\S]*?\}\)\)\) return/.test(modal)
      && modal.includes('peringatan: [...(b?.peringatan ?? []), ...(putusan.jenis === \'peringatan\' ? [putusan.pesan] : [])],'))
  cek('F10 modal: yang dipasang GABUNGAN server + angka kunci segar',
    modal.includes('onTerapkan(barisMasuk, { ...asal, ke_versi_terbuka: balik.versi, simpanan_berkas: balik.simpananBerkas }, balik.simpananKini)'))

  const dpa = kode(baca('app/(dashboard)/blud/dpa/dpa-client.tsx'))
  const tombol = dpa.slice(dpa.indexOf('data-rima="dpa.impor"') - 260, dpa.indexOf('data-rima="dpa.impor"'))
  cek('F11 layar: Impor TIDAK lagi dikunci versi tersimpan', !tombol.includes('alasanKunciBorongan') && tombol.includes('onClick={() => { void bukaImpor() }}'))
  cek('F12 layar: Form Baru TETAP terkunci', /disabled=\{!!alasanKunciBorongan\}[\s\S]{0,120}onClick=\{mulaiFormBaru\}/.test(dpa))
  const elImpor = dpa.slice(dpa.indexOf('<ImportDpaModal'), dpa.indexOf('/>', dpa.indexOf('<ImportDpaModal')))
  cek('F13 layar: versi terbuka dioper ke modal', elImpor.includes('versiTerbuka={versi}'))
  const badan = dpa.slice(dpa.indexOf('function terapkanImpor'), dpa.indexOf('async function bukaImpor'))
  cek('F14 terapkanImpor: impor-balik memakai angka kunci SEGAR & tidak melepas versi',
    badan.includes("const balik = !!asal.ke_versi_terbuka && asal.ke_versi_terbuka === versi")
      && badan.includes('if (balik) { if (simpananKini != null) setVersion(simpananKini) }')
      && badan.includes("else setVersi('')"))
  cek('F15 terapkanImpor: sasaran Simpan tidak disentuh', !badan.includes('setPeriodeTulis('))
  cek('F16 bukaImpor menanyakan isian belum tersimpan',
    /async function bukaImpor\(\) \{\s*if \(rows\.length > 0 && belumTersimpan && !\(await confirmDialog/.test(dpa))

  const cetak = kode(baca('app/(dashboard)/blud/cetak/cetak-client.tsx'))
  cek('F17 Cetak: angka kunci dipotret bersama barisnya (DPA saja)',
    cetak.includes("setRawSimpanan(menu === 'dpa' && typeof j.version === 'number' ? j.version : null)"))
  cek('F18 Cetak: Excel DPA membawa simpananKe', cetak.includes('perubahanKe: rawBabakKe, simpananKe: rawSimpanan,'))
  cek('F19 Cetak: rawSimpanan dilepas saat ganti menu & sebelum Cetak', (cetak.match(/setRawSimpanan\(null\)/g) ?? []).length === 2)

  cek('F20 Zod: ke_versi_terbuka diterima',
    AsalImporSchema.safeParse({ berkas: 'a.xlsx', lembar: 'DPA', baris: 6, ke_versi_terbuka: '2099-07-31', simpanan_berkas: 3 }).success)
  cek('F21 Zod: tanggal ngawur ditolak',
    !AsalImporSchema.safeParse({ berkas: 'a.xlsx', lembar: 'DPA', baris: 6, ke_versi_terbuka: '31-07-2099' }).success)
  cek('F22 Zod: tanpa penanda tetap sah (impor ke periode kosong)', AsalImporSchema.safeParse({ berkas: 'a', lembar: 'b', baris: 1 }).success)
  const ruteDpa = kode(baca('app/api/blud/dpa/route.ts'))
  cek('F23 audit Simpan membedakan impor-balik', ruteDpa.includes('impor-balik ke versi terbuka ${asal_impor.ke_versi_terbuka}'))
  const ekspor = kode(baca('lib/blud/export/dpa-dokumen.ts'))
  cek('F24 eksporter menulis penanda hanya bila versi & simpananKe ada',
    /if \(versi && simpananKe != null\) \{\s*ws\.getRow\(1\)\.getCell\(KOLOM_DPA\.indexOf\('Jangkar'\) \+ 1\)\.value =/.test(ekspor))
}

console.log(`\n${lulus} lulus · ${gagal} gagal`)
if (gagal) process.exit(1)
