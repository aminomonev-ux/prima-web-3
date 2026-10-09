// scripts/test-blud-dpa-perubahan-cetak.mts — DPA Perubahan BLUD, Tahap 4 (cetak & impor).
//
// Konsep: docs/CONCEPT-blud-dpa-perubahan.md §7, §9, §11.1–11.2. Yang dijaga:
//   A. Excel format Lengkap — workbook SUNGGUHAN (`buatWorkbookDpaPerubahan`), kepala dua
//      tingkat, rumus tiap sisi, sisi Sebelum mengikuti pohon VERSI DASAR
//   B. kop penanda — Ringkas (DPA) & acuan (Pergeseran); tanpa Perubahan bunyinya seperti dulu
//   C. impor — berkas buatan eksporter dibaca balik lewat `bacaGridDpa` + `bacaDpaDariGrid`
//   D. aturan impor terhadap babak SASARAN (`putusanImpor`) + kalimat "Terbaca"
//   E. pratinjau menu Cetak (`renderCetakHtml`)
//   F. sambungan layar & route (teks tanpa komentar, kutipan utuh — L82c)
//
// USAGE: npx tsx scripts/test-blud-dpa-perubahan-cetak.mts

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type ExcelJS from 'exceljs'
import {
  buatWorkbookDpa, buatWorkbookDpaPerubahan, buatWorkbookPergeseran, kopPerubahan,
} from '../lib/blud/export/dpa-dokumen'
import { arahDelta, KOLOM_SELISIH_PERUBAHAN } from '../lib/blud/export/warna-delta'
import { bacaGridDpa } from '../lib/blud/import-dpa-grid'
import {
  bacaDpaDariGrid, BerkasPerubahanLengkapError, BerkasDuaSisiError, BerkasPergeseranError,
} from '../lib/blud/import-dpa'
import { putusanImpor, kalimatTerbaca } from '../lib/blud/perubahan'
import { renderCetakHtml, persenSelisih, judulDpa } from '../lib/blud/cetak-data'
import type { GridDpa, SelGrid } from '../lib/blud/import-dpa-grid'
import type { DpaBaris, PergeseranBaris } from '../types'

const AKAR = join(import.meta.dirname, '..')
const baca = (p: string) => readFileSync(join(AKAR, p), 'utf8')
function kode(isi: string): string {
  return isi.replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

let lulus = 0
let gagal = 0
function cek(nama: string, syarat: boolean, catatan = '') {
  if (syarat) { lulus++; console.log(`  ok    ${nama.padEnd(74)} ${catatan}`) }
  else        { gagal++; console.log(`  GAGAL ${nama.padEnd(74)} ${catatan}`) }
}

const KUNCI = (h: string) => `AK-${h.repeat(32)}`
const dasar = {
  id: 0, tahun_anggaran: 2099, versi_tanggal: '2099-10-08', satuan: null, parent_id: null,
  anggaran_key: null, origin: null, usulan_item_id: null, usulan_no: null,
  penanggung_jawab: null, keterangan: null,
  vol: null, harga: null, jumlah: 0,
  vol_sebelum: null, satuan_sebelum: null, harga_sebelum: null, jumlah_sebelum: null,
} as unknown as DpaBaris

/**
 * Pohon Perubahan yang memuat KETIGA bentuk sisi Sebelum:
 *   atk     daun lama, dikurangi (20 → 10 juta)
 *   listrik lahir di Perubahan (Sebelum kosong)
 *   gedung  daun di versi dasar (8 juta), di Perubahan diberi dua anak BARU
 *           → di sisi Sebelum ia tetap daun ber-vol×harga, BUKAN SUM anak-anaknya
 */
function barisPerubahan(): DpaBaris[] {
  return [
    { ...dasar, row_id: 'akar', tipe_baris: 'GRANDMASTER', urutan: 1, kode_rekening: '5', uraian: 'BELANJA',
      jumlah: 35_000_000, jumlah_sebelum: 28_000_000, anggaran_key: KUNCI('a') },
    { ...dasar, row_id: 'atk', parent_id: 'akar', tipe_baris: 'MASTER', urutan: 2, kode_rekening: '5.1', uraian: 'ATK',
      vol: 10, satuan: 'rim', harga: 1_000_000, jumlah: 10_000_000,
      vol_sebelum: 20, satuan_sebelum: 'rim', harga_sebelum: 1_000_000, jumlah_sebelum: 20_000_000, anggaran_key: KUNCI('b') },
    { ...dasar, row_id: 'listrik', parent_id: 'akar', tipe_baris: 'MASTER', urutan: 3, kode_rekening: '5.2', uraian: 'Listrik baru',
      vol: 1, satuan: 'thn', harga: 15_000_000, jumlah: 15_000_000, anggaran_key: KUNCI('c') },
    { ...dasar, row_id: 'gedung', parent_id: 'akar', tipe_baris: 'MASTER', urutan: 4, kode_rekening: '5.3', uraian: 'Pemeliharaan gedung',
      jumlah: 10_000_000, vol_sebelum: 1, satuan_sebelum: 'ls', harga_sebelum: 8_000_000, jumlah_sebelum: 8_000_000, anggaran_key: KUNCI('d') },
    { ...dasar, row_id: 'cat', parent_id: 'gedung', tipe_baris: 'CHILD', urutan: 5, kode_rekening: '5.3.1', uraian: 'Cat',
      vol: 1, satuan: 'ls', harga: 4_000_000, jumlah: 4_000_000, anggaran_key: KUNCI('e') },
    { ...dasar, row_id: 'atap', parent_id: 'gedung', tipe_baris: 'CHILD', urutan: 6, kode_rekening: '5.3.2', uraian: 'Atap',
      vol: 1, satuan: 'ls', harga: 6_000_000, jumlah: 6_000_000, anggaran_key: KUNCI('f') },
  ]
}
const barisMurni = () => barisPerubahan().map(r => ({
  ...r, vol_sebelum: null, satuan_sebelum: null, harga_sebelum: null, jumlah_sebelum: null,
})) as DpaBaris[]

const nilai = (ws: ExcelJS.Worksheet, r: number, c: number) => ws.getRow(r).getCell(c).value
const rumus = (ws: ExcelJS.Worksheet, r: number, c: number): string | null => {
  const v = nilai(ws, r, c) as { formula?: string } | null
  return v && typeof v === 'object' && 'formula' in v ? v.formula ?? null : null
}
const barisUraian = (ws: ExcelJS.Worksheet, uraian: string): number => {
  for (let n = 1; n <= ws.rowCount; n++) if (String(nilai(ws, n, 2) ?? '').trim() === uraian) return n
  return -1
}
const induk = (ws: ExcelJS.Worksheet, r: number, c: number) => ws.getCell(r, c).master.address

async function keBuffer(wb: ExcelJS.Workbook): Promise<Buffer> {
  return Buffer.from(await wb.xlsx.writeBuffer())
}

// ─── A. Excel format Lengkap ────────────────────────────────────────────────
console.log('\n── A. Excel DPA Perubahan — format Lengkap ──')
{
  const wb = await buatWorkbookDpaPerubahan({
    tahun: 2099, versi: '2099-10-08', rows: barisPerubahan(), perubahanKe: 1,
    direktur: { nama: 'dr. Uji Coba', nip: '123' },
  })
  const ws = wb.worksheets[0]
  cek('A1 kop baris 5 = kopPerubahan(1, versi)', nilai(ws, 5, 1) === kopPerubahan(1, '2099-10-08'), String(nilai(ws, 5, 1)))
  cek('A2 kop berbunyi "DPA PERUBAHAN KE-1 · versi …"', /^DPA PERUBAHAN KE-1 · versi /.test(String(nilai(ws, 5, 1))))
  cek('A3 judul blok SEBELUM PERUBAHAN digabung C6:F6',
    nilai(ws, 6, 3) === 'SEBELUM PERUBAHAN' && induk(ws, 6, 6) === 'C6' && induk(ws, 7, 3) === 'C7')
  cek('A4 judul blok SESUDAH PERUBAHAN digabung G6:J6',
    nilai(ws, 6, 7) === 'SESUDAH PERUBAHAN' && induk(ws, 6, 10) === 'G6')
  cek('A5 sub-judul baris 7: Vol·Satuan·Harga·Jumlah di kedua blok',
    [3, 4, 5, 6, 7, 8, 9, 10].map(c => nilai(ws, 7, c)).join('|') === 'Vol|Satuan|Harga|Jumlah|Vol|Satuan|Harga|Jumlah')
  cek('A6 Kode Rekening & Bertambah/(Berkurang) digabung dua baris kepala',
    induk(ws, 7, 1) === 'A6' && induk(ws, 7, 11) === 'K6' && nilai(ws, 6, 11) === KOLOM_SELISIH_PERUBAHAN)
  cek('A7 data mulai baris 8, beku sampai baris 7',
    barisUraian(ws, 'BELANJA') === 8 && (ws.views[0] as { ySplit?: number }).ySplit === 7)
  cek('A8 tanpa kolom tersembunyi (format ini sengaja tidak untuk diimpor)',
    Array.from({ length: 14 }, (_, i) => ws.getColumn(i + 1).hidden).every(h => !h))

  const atk = barisUraian(ws, 'ATK')
  const listrik = barisUraian(ws, 'Listrik baru')
  const gedung = barisUraian(ws, 'Pemeliharaan gedung')
  cek('A9 Sebelum daun lama = ROUND(C*E,0)', rumus(ws, atk, 6) === `ROUND(C${atk}*E${atk},0)`)
  cek('A10 Sesudah daun = ROUND(G*I,0)', rumus(ws, atk, 10) === `ROUND(G${atk}*I${atk},0)`)
  cek('A11 rekening lahir di Perubahan: Sebelum ANGKA 0, bukan teks/rumus',
    nilai(ws, listrik, 6) === 0 && nilai(ws, listrik, 3) === '')
  cek('A12 dulu daun, kini berinduk: Sebelum TETAP ROUND(C*E), bukan SUM anak baru',
    rumus(ws, gedung, 6) === `ROUND(C${gedung}*E${gedung},0)`, String(rumus(ws, gedung, 6)))
  cek('A13 … sedangkan sisi Sesudah-nya SUM anak', /^SUM\(J\d+:J\d+\)$/.test(rumus(ws, gedung, 10) ?? ''))
  // Anak langsung akar: ATK (9), Listrik (10), Gedung (11) — Cat & Atap cucu.
  cek('A14 akar: Sebelum SUM anak langsung (ada anak ber-Sebelum)', rumus(ws, 8, 6) === 'SUM(F9:F11)', String(rumus(ws, 8, 6)))
  cek('A15 Bertambah/(Berkurang) = J − F (rumus, bukan angka mati)', rumus(ws, atk, 11) === `J${atk}-F${atk}`)
  cek('A16 % = IF(F=0,"—",K/F)', rumus(ws, atk, 12) === `IF(F${atk}=0,"—",K${atk}/F${atk})`)
  cek('A17 % baris baru berhasil "—"', (nilai(ws, listrik, 12) as { result?: unknown }).result === '—')
  cek('A18 format selisih bergaya kurung, nol "-"', ws.getCell(atk, 11).numFmt === '#,##0;(#,##0);"-"')
  cek('A19 format % bergaya kurung', ws.getCell(atk, 12).numFmt === '0.00%;(0.00%);"-"')
  cek('A20 berkurang merah, bertambah hijau',
    ws.getCell(atk, 11).font?.color?.argb === 'FFE24B4A' && ws.getCell(listrik, 11).font?.color?.argb === 'FF1D9E75')
  let teks = ''
  ws.eachRow(r => r.eachCell(c => { teks += ` ${String(c.value ?? '')}` }))
  cek('A21 tanda tangan Direktur saja (tanpa Dewan Pengawas)', teks.includes('Direktur') && !/dewan pengawas/i.test(teks))
  cek('A22 tanpa baris Program/Kegiatan di kop', !/\bProgram\b|Sub Kegiatan/.test(teks))

  let galatMurni = ''
  try { await buatWorkbookDpaPerubahan({ tahun: 2099, versi: '2099-01-31', rows: barisMurni(), perubahanKe: 1 }) }
  catch (e) { galatMurni = (e as Error).message }
  cek('A23 versi murni DITOLAK (Sebelum 0 → Sesudah 68 M bukan angka nyata)', /DPA murni/.test(galatMurni), galatMurni)
  let galatTanpaKe = ''
  try { await buatWorkbookDpaPerubahan({ tahun: 2099, versi: '2099-10-08', rows: barisPerubahan(), perubahanKe: null }) }
  catch (e) { galatTanpaKe = (e as Error).message }
  cek('A24 tanpa nomor babak DITOLAK', /DPA murni/.test(galatTanpaKe))
  cek('A25 arahDelta mengenali kolom Bertambah/(Berkurang)',
    arahDelta(KOLOM_SELISIH_PERUBAHAN, -5) === 'turun' && arahDelta(KOLOM_SELISIH_PERUBAHAN, 5) === 'naik'
    && arahDelta(KOLOM_SELISIH_PERUBAHAN, 0) === null)
}

// ─── B. Kop penanda ─────────────────────────────────────────────────────────
console.log('\n── B. Kop penanda Ringkas & Pergeseran ──')
{
  const ringkas = (await buatWorkbookDpa({ tahun: 2099, versi: '2099-10-08', rows: barisPerubahan(), perubahanKe: 2 })).worksheets[0]
  cek('B1 Ringkas: kop "DPA PERUBAHAN KE-2" di baris 5', /^DPA PERUBAHAN KE-2 · versi /.test(String(nilai(ringkas, 5, 1))))
  cek('B2 Ringkas: kepala tetap baris 6 (Impor bergantung padanya)', nilai(ringkas, 6, 1) === 'Kode Rekening')
  const murni = (await buatWorkbookDpa({ tahun: 2099, versi: '2099-01-31', rows: barisMurni() })).worksheets[0]
  cek('B3 DPA murni: baris 5 KOSONG — bunyinya persis seperti dulu', nilai(murni, 5, 1) == null)

  const pg = barisMurni().map(r => ({
    ...r, dpa_versi_tanggal: '2099-10-08', vol_p: r.vol, harga_p: r.harga, pergeseran: r.jumlah, bertambah_berkurang: 0,
  })) as unknown as PergeseranBaris[]
  const wsPg = (await buatWorkbookPergeseran({ tahun: 2099, versi: '2099-10-20', rows: pg, acuanPerubahanKe: 1 })).worksheets[0]
  cek('B4 Pergeseran: kop menyebut acuan DPA Perubahan', /^Mengacu DPA Perubahan ke-1 \(/.test(String(nilai(wsPg, 5, 1))), String(nilai(wsPg, 5, 1)))
  const wsPg0 = (await buatWorkbookPergeseran({ tahun: 2099, versi: '2099-10-20', rows: pg })).worksheets[0]
  cek('B5 Pergeseran tanpa Perubahan: baris 5 kosong', nilai(wsPg0, 5, 1) == null)
}

// ─── C. Impor membaca berkasnya sendiri ─────────────────────────────────────
console.log('\n── C. Impor — §11.1 mengenali berkas ──')
{
  const bacaWb = async (wb: ExcelJS.Workbook) => bacaDpaDariGrid(await bacaGridDpa(await keBuffer(wb)))
  const tangkap = async (wb: ExcelJS.Workbook): Promise<Error | null> => {
    try { await bacaWb(wb); return null } catch (e) { return e as Error }
  }

  const ringkas = await bacaWb(await buatWorkbookDpa({ tahun: 2099, versi: '2099-10-08', rows: barisPerubahan(), perubahanKe: 1 }))
  cek('C1 Ringkas: perubahanKe = 1 terbaca dari kop', ringkas.perubahanKe === 1)
  cek('C2 Ringkas: versi kop ikut terbaca', !!ringkas.versiKop && /2099/.test(ringkas.versiKop), String(ringkas.versiKop))
  cek('C3 Ringkas: 6 baris, total cocok, jangkar utuh',
    ringkas.baris.length === 6 && ringkas.totalHitung === 35_000_000 && ringkas.baris.every(b => /^AK-/.test(b.jangkar ?? '')))
  cek('C4 Ringkas: angka yang terbaca sisi SESUDAH (ATK 10 juta, bukan 20)',
    ringkas.baris.find(b => b.uraian === 'ATK')?.jumlahHitung === 10_000_000)
  const murni = await bacaWb(await buatWorkbookDpa({ tahun: 2099, versi: '2099-01-31', rows: barisMurni() }))
  cek('C5 DPA murni: perubahanKe null', murni.perubahanKe === null && murni.versiKop === null)

  const lengkap = await tangkap(await buatWorkbookDpaPerubahan({ tahun: 2099, versi: '2099-10-08', rows: barisPerubahan(), perubahanKe: 1 }))
  cek('C6 Lengkap DITOLAK BerkasPerubahanLengkapError', lengkap instanceof BerkasPerubahanLengkapError, lengkap?.name)
  cek('C7 … kalimatnya menunjuk format Ringkas', /format Ringkas/.test(lengkap?.message ?? ''))

  // Lengkap yang judul bloknya disunting tangan tetap tertangkap lewat dua kolom Jumlah.
  const disunting = await buatWorkbookDpaPerubahan({ tahun: 2099, versi: '2099-10-08', rows: barisPerubahan(), perubahanKe: 1 })
  disunting.worksheets[0].getCell('C6').value = 'JANUARI'
  disunting.worksheets[0].getCell('G6').value = '2099'
  const dua = await tangkap(disunting)
  cek('C8 judul blok disunting → tetap ditolak BerkasDuaSisiError', dua instanceof BerkasDuaSisiError, dua?.name)

  const pg = barisMurni().map(r => ({
    ...r, dpa_versi_tanggal: '2099-10-08', vol_p: r.vol, harga_p: r.harga, pergeseran: r.jumlah, bertambah_berkurang: 0,
  })) as unknown as PergeseranBaris[]
  const galatPg = await tangkap(await buatWorkbookPergeseran({ tahun: 2099, versi: '2099-10-20', rows: pg }))
  cek('C9 Excel Pergeseran tetap BerkasPergeseranError (pesan lama, bukan dua-blok)', galatPg instanceof BerkasPergeseranError)

  // Grid sintetis bentuk dokumen pergeseran kantor: blok "JANUARI" | "2026", dua JUMLAH.
  const sel = (teks: string, angka: number | null = null, r: string | null = null): SelGrid => ({ teks, angka, rumus: r })
  const kantor: Record<string, SelGrid> = {
    '1,1': sel('KODE REKENING'), '1,2': sel('URAIAN'), '1,3': sel('JANUARI'), '1,6': sel('JUMLAH'),
    '1,7': sel('2026'), '1,10': sel('JUMLAH'), '1,11': sel('Bertambah/ berkurang'),
    '2,1': sel('KODE REKENING'), '2,2': sel('URAIAN'), '2,3': sel('Vol'), '2,5': sel('Harga Sat'), '2,6': sel('JUMLAH'),
    '2,7': sel('Vol'), '2,9': sel('Harga Sat'), '2,10': sel('JUMLAH'),
    '3,1': sel('5.1'), '3,2': sel('ATK'), '3,3': sel('2', 2), '3,5': sel('1', 1), '3,6': sel('2', 2, 'C3*E3'),
    '3,7': sel('3', 3), '3,9': sel('1', 1), '3,10': sel('3', 3, 'G3*I3'),
  }
  const grid: GridDpa = {
    namaLembar: '2026', barisHeader: 1, jumlahBaris: 3, jumlahKolom: 11,
    sel: (r, c) => kantor[`${r},${c}`] ?? sel(''),
  }
  let galatKantor: Error | null = null
  try { bacaDpaDariGrid(grid) } catch (e) { galatKantor = e as Error }
  cek('C10 dokumen dua blok kantor DITOLAK BerkasDuaSisiError (dulu diterima campur sisi)',
    galatKantor instanceof BerkasDuaSisiError, galatKantor?.message.slice(0, 60))
  // Sel gabung dua baris (JUMLAH di b.1 & b.2 kolom sama) tetap SATU kolom — formulir murni.
  const satuBlok: GridDpa = {
    ...grid, jumlahKolom: 6,
    sel: (r, c) => (c <= 6 ? kantor[`${r},${c}`] ?? sel('') : sel('')),
  }
  let galatSatu: Error | null = null
  try { bacaDpaDariGrid(satuBlok) } catch (e) { galatSatu = e as Error }
  cek('C11 formulir satu blok (JUMLAH digabung dua baris kepala) TIDAK tertolak', !(galatSatu instanceof BerkasDuaSisiError), galatSatu?.name)
}

// ─── D. Aturan impor terhadap babak sasaran (§11.2) ─────────────────────────
console.log('\n── D. putusanImpor & kalimatTerbaca ──')
{
  const fmt = (n: number) => `Rp ${n.toLocaleString('id-ID')}`
  const p = (perubahanKe: number | null, babakSasaran: number | null, pembanding: { versi: string; total: number } | null = null) =>
    putusanImpor({ perubahanKe, babakSasaran, sasaranLabel: '31 Okt 2099', totalBerkas: 30_000_000, pembanding, fmt })

  const tolak = p(1, null)
  cek('D1 Ringkas → sasaran murni: TOLAK', tolak.jenis === 'tolak')
  cek('D2 … menyebut tombol Jadikan DPA Perubahan', tolak.jenis === 'tolak' && /Jadikan DPA Perubahan/.test(tolak.pesan))
  const peringatan = p(null, 1, { versi: '2099-10-08', total: 35_000_000 })
  cek('D3 murni → sasaran Perubahan: PERINGATAN (bukan tolak)', peringatan.jenis === 'peringatan')
  cek('D4 … lengkap dgn selisih total "(Rp 5.000.000)"',
    peringatan.jenis === 'peringatan' && peringatan.pesan.includes('(Rp 5.000.000)'), peringatan.jenis === 'peringatan' ? peringatan.pesan : '')
  cek('D5 … dan menyebut versi pembandingnya', peringatan.jenis === 'peringatan' && /8 Okt 2099/.test(peringatan.pesan))
  cek('D6 Ringkas → sasaran Perubahan babak sama: BOLEH', p(1, 1).jenis === 'boleh')
  cek('D7 murni → sasaran murni: BOLEH (perilaku impor lama)', p(null, null).jenis === 'boleh')
  cek('D8 Ringkas ke-1 → babak ke-2: PERINGATAN', p(1, 2).jenis === 'peringatan')
  cek('D9 kalimatTerbaca Ringkas PRIMA',
    kalimatTerbaca({ perubahanKe: 1, versiKop: '8 Okt 2099', unduhanPrima: true, baris: 558 })
      === 'Excel DPA Perubahan ke-1 · unduhan PRIMA · versi 8 Okt 2099 · 558 baris')
  cek('D10 kalimatTerbaca formulir luar',
    kalimatTerbaca({ perubahanKe: null, versiKop: null, unduhanPrima: false, baris: 466 })
      === 'Excel DPA murni · formulir luar · 466 baris')
}

// ─── E. Pratinjau menu Cetak ────────────────────────────────────────────────
console.log('\n── E. renderCetakHtml ──')
{
  const r = renderCetakHtml({ menu: 'dpa', view: 'dpaPerubahan', rows: barisPerubahan(), versi: '2099-10-08', tanggal: '', perubahanKe: 1 })
  cek('E1 judul Lengkap', r.meta.title === 'DPA Perubahan ke-1 (Lengkap) — 2099-10-08')
  cek('E2 14 kolom, selisih bernama sama dgn Excel', r.meta.columns.length === 14 && r.meta.columns[10] === KOLOM_SELISIH_PERUBAHAN)
  cek('E3 kepala dua tingkat di HTML', r.html.includes('colspan="4" style="text-align:center;">SEBELUM PERUBAHAN')
    && r.html.includes('SESUDAH PERUBAHAN'))
  const atk = r.rows.find(x => x[1] === 'ATK')
  const listrik = r.rows.find(x => x[1] === 'Listrik baru')
  cek('E4 baris ekspor: selisih ANGKA bertanda (PDF mewarnainya)', atk?.[10] === -10_000_000)
  cek('E5 baris ekspor: % "-50,00%", baris baru "—"', atk?.[11] === '-50,00%' && listrik?.[11] === '—', `${atk?.[11]} / ${listrik?.[11]}`)
  cek('E6 baris baru: Jumlah Sebelum KOSONG, bukan 0', listrik?.[5] === '')
  cek('E7 total Sebelum → Sesudah di atas tabel', /Sebelum <strong>[^<]*28\.000\.000/.test(r.html) && /Sesudah <strong>[^<]*35\.000\.000/.test(r.html))
  const turun = renderCetakHtml({ menu: 'dpa', view: 'dpaPerubahan', versi: '2099-10-08', tanggal: '', perubahanKe: 1,
    rows: barisPerubahan().map(x => (x.row_id === 'listrik' ? { ...x, vol: 0, jumlah: 0 } : x.row_id === 'akar' ? { ...x, jumlah: 20_000_000 } : x)) })
  cek('E7b selisih total berkurang TIDAK berkurung ganda "((…))"', /selisih <strong>\(8\.000\.000\)<\/strong>/.test(turun.html) && !turun.html.includes('(('))
  const m = renderCetakHtml({ menu: 'dpa', view: 'dpaPerubahan', rows: barisMurni(), versi: '2099-01-31', tanggal: '', perubahanKe: null })
  cek('E8 versi murni: tanpa baris ekspor (PDF & Excel mati) + kalimat jalan keluar',
    m.rows.length === 0 && /DPA murni/.test(m.html) && /History/.test(m.html))
  cek('E8b … judulnya tetap menyebut view Lengkap, bukan "Rekap DPA BLUD"', m.meta.title === 'DPA Perubahan (Lengkap) — 2099-01-31', m.meta.title)
  cek('E9 judul Ringkas', judulDpa('2099-10-08', 2) === 'DPA Perubahan ke-2 — 2099-10-08' && judulDpa('2099-01-31', null) === 'Rekap DPA BLUD — 2099-01-31')
  const d = renderCetakHtml({ menu: 'dpa', view: 'dpa', rows: barisPerubahan(), versi: '2099-10-08', tanggal: '', perubahanKe: 1 })
  cek('E10 view DPA BLUD versi Perubahan berjudul Perubahan', d.meta.title.startsWith('DPA Perubahan ke-1 — '))
  const pg = barisMurni().map(x => ({
    ...x, dpa_versi_tanggal: '2099-10-08', vol_p: x.vol, harga_p: x.harga, pergeseran: x.jumlah, bertambah_berkurang: 0,
  })) as unknown as PergeseranBaris[]
  const g = renderCetakHtml({ menu: 'pergeseran', view: 'rekapPergeseran', rows: pg, versi: '2099-10-20', tanggal: '', acuanPerubahanKe: 1 })
  cek('E11 Rekap Pergeseran menyebut acuan Perubahan', g.meta.title.includes('mengacu DPA Perubahan ke-1'))
  const g0 = renderCetakHtml({ menu: 'pergeseran', view: 'rekapPergeseran', rows: pg, versi: '2099-10-20', tanggal: '' })
  cek('E12 … tanpa Perubahan judulnya seperti dulu', g0.meta.title === 'Rekap Pergeseran: 2099-10-20')
  cek('E13 persenSelisih: tak bergeser = kosong', persenSelisih(1_000, 0) === '')
}

// ─── F. Sambungan layar & route ─────────────────────────────────────────────
console.log('\n── F. Sambungan ──')
{
  const cetak = kode(baca('app/(dashboard)/blud/cetak/cetak-client.tsx'))
  cek('F1 Cetak: penanda dibaca SEGAR di onCetak (bersamaan dgn datanya)',
    /Promise\.all\(\[\s*fetch\(path\),\s*menu === 'master-akun' \? Promise\.resolve\(\[\]\) : muatPenanda\(tahun\),/.test(cetak))
  cek('F2 Cetak: babak pergeseran dari ACUAN-nya, bukan tanggal simpan',
    cetak.includes('menu === \'pergeseran\' && acuan ? keBabak(penandaSegar, acuan)'))
  cek('F3 Cetak: Ringkas membawa perubahanKe',
    cetak.includes('await exportDpaDokumen({ tahun, versi: rawVersi, rows: rawRows as DpaBaris[], direktur, perubahanKe: rawBabakKe })'))
  cek('F4 Cetak: view Lengkap → exportDpaPerubahanDokumen',
    cetak.includes('await exportDpaPerubahanDokumen({ tahun, versi: rawVersi, rows: rawRows as DpaBaris[], direktur, perubahanKe: rawBabakKe })'))
  cek('F5 Cetak: Pergeseran membawa acuanPerubahanKe', cetak.includes('mutasi: rawMutasi, acuanPerubahanKe: rawBabakKe,'))
  cek('F6 Cetak: view Lengkap hanya ditawarkan di tahun ber-Perubahan',
    cetak.includes("VIEW_OPTIONS[menu].filter(v => v.value !== 'dpaPerubahan' || penanda.length > 0)"))
  cek('F7 Cetak: pilihan Lengkap yang tertinggal dipulangkan ke DPA',
    cetak.includes("if (!list.length) setView(v => (v === 'dpaPerubahan' ? 'dpa' : v))"))
  cek('F8 Cetak: PDF & Excel mati kalau tabel tanpa baris',
    cetak.includes('disabled={!adaBaris} />') && cetak.includes('const adaBaris = Array.isArray(renderedData) && renderedData.length > 0'))
  cek('F9 Cetak: rawBabakKe dilepas saat ganti menu & sebelum Cetak', (cetak.match(/setRawBabakKe\(null\)/g) ?? []).length === 2)

  const modal = kode(baca('components/blud/ImportDpaModal.tsx'))
  cek('F10 Modal impor mengirim sasaran', modal.includes("form.append('sasaran', sasaran)"))
  cek('F11 Modal: tombol Masukkan HILANG saat ditolak', modal.includes("{hasil && putusan.jenis !== 'tolak' && ("))
  cek('F12 Modal: peringatan ditanyakan lewat confirmDialog sebelum onTerapkan',
    /if \(putusan\.jenis === 'peringatan' && !\(await confirmDialog\(\{[\s\S]*?\}\)\)\) return\s*onTerapkan\(/.test(modal))
  cek('F13 Modal: terapkan menolak sendiri saat tolak', modal.includes("if (!hasil || putusan.jenis === 'tolak') return"))
  cek('F13b Modal: sasaran disebut sebagai TANGGAL (bukan "bulan berjalan (hari ini)" berkurung ganda)',
    modal.includes('sasaranLabel: formatTanggalId(sasaran),'))
  cek('F13c Modal: peringatan memakai kelas bertema, bukan kuning sebaris',
    /\{putusan\.jenis === 'peringatan' && \(\s*<div className="blud-imp-badge-warn"/.test(modal))
  const dpa = kode(baca('app/(dashboard)/blud/dpa/dpa-client.tsx'))
  // `sasaran={sasaran}` juga dipakai dua modal lain — yang diperiksa elemen ImportDpaModal-nya sendiri.
  const elImpor = dpa.slice(dpa.indexOf('<ImportDpaModal'), dpa.indexOf('/>', dpa.indexOf('<ImportDpaModal')))
  cek('F14 layar DPA mengoper sasaran Simpan ke modal impor', elImpor.includes('sasaran={sasaran}'))
  const rute = kode(baca('app/api/blud/dpa/import/route.ts'))
  cek('F15 route: babak dinilai pada SASARAN', rute.includes('keBabak(await getPerubahan(tahun), sasaranParsed.data)'))
  cek('F16 route: pembanding = versi DPA berlaku di sasaran',
    rute.includes('await getDpaVersiBerlaku(tahun, sasaranParsed.data)'))
  cek('F17 route: hasil membawa perubahanKe, versiKop, tujuan',
    rute.includes('perubahanKe: hasil.perubahanKe,') && rute.includes('versiKop: hasil.versiKop,') && /\btujuan,\n/.test(rute))
  const imp = kode(baca('lib/blud/import-dpa.ts'))
  const urutan = ['if (berkasPergeseran(grid)) throw', 'if (berkasPerubahanLengkap(grid)) throw', 'if (kolomJumlah >= 2) throw', 'const kolom = petakanKolom(grid)']
    .map(s => imp.indexOf(s))
  cek('F18 parser: Pergeseran → Lengkap → dua blok → baru memetakan kolom',
    urutan.every((n, i) => n > 0 && (i === 0 || n > urutan[i - 1])), urutan.join(','))
}

console.log(`\n${lulus} lulus · ${gagal} gagal`)
if (gagal) process.exit(1)
