// lib/blud/export/dpa-dokumen.ts — unduhan DPA & Pergeseran sebagai DOKUMEN, bukan rekap.
// Konsep: docs/CONCEPT-export-import-dpa.md §2.
//
// Beda pokok dengan `excel.ts`: kolom Jumlah berisi RUMUS, bukan angka mati.
// Rumusnya cermin `recalcDpaJumlah()` — daun `ROUND(vol*harga,0)`, induk
// `SUM(anak)`. Itu yang membuat berkas ini bisa dibaca balik oleh importer
// (rentang SUM menyebut sendiri siapa anaknya) sekaligus memeriksa dirinya
// sendiri saat orang keuangan mengubah angka di Excel.
//
// Dua kolom tersembunyi di belakang:
//   Level   cadangan hierarki kalau rumus hilang kena "paste as values"
//   Jangkar `anggaran_key` — tanpa ini impor balik memutus alokasi realisasi
//           (`periksaJangkar` di data.ts TIDAK menangkap kasus baris serba-baru)
//
// Blok tanda tangan ditulis lokal, TIDAK memakai `tandaTangan()` milik
// spj-excel.ts: berkas itu server-side (mengimpor getBukuKas/sql) sedangkan
// eksporter ini jalan di browser.
import type ExcelJS from 'exceljs'
import { loadExcelJs, downloadWorkbook, sanitizeCell } from '@/lib/shared/excel-export'
import { TIPE_LABEL } from '@/lib/blud/format'
import { isLeafMode } from '@/lib/blud/recalc'
import { uraiGeser, URAIAN_NOL } from '@/lib/blud/urai-geser'
import type { DpaBaris, PergeseranBaris, TipeBaris } from '@/types'

const INSTANSI = 'RSJD Dr. AMINO GONDOHUTOMO'
const PROVINSI = 'PROVINSI JAWA TENGAH'
const RUPIAH = '#,##0'
const GARIS_ISI = '..............................'

const BARIS_HEADER = 6
const BARIS_DATA_1 = 7

export interface PejabatDokumen {
  nama: string
  nip: string | null
}

/** Bentuk minimum yang dibutuhkan pembangun pohon — dipenuhi DpaBaris & PergeseranBaris. */
interface BarisPohon {
  row_id: string
  parent_id: string | null
  urutan: number
  tipe_baris: TipeBaris
  anggaran_key?: string | null
  kode_rekening: string
  uraian: string
  vol: number | null
  satuan: string | null
  harga: number | null
  jumlah: number
}

interface Pohon<T extends BarisPohon> {
  urut: T[]
  anak: Map<string, T[]>
  barisExcel: Map<string, number>
  kedalaman: Map<string, number>
}

function siapkanPohon<T extends BarisPohon>(rows: T[]): Pohon<T> {
  const urut = [...rows].sort((a, b) => a.urutan - b.urutan)

  const anak = new Map<string, T[]>()
  for (const r of urut) {
    if (!r.parent_id) continue
    const daftar = anak.get(r.parent_id)
    if (daftar) daftar.push(r)
    else anak.set(r.parent_id, [r])
  }

  const barisExcel = new Map<string, number>()
  urut.forEach((r, i) => barisExcel.set(r.row_id, BARIS_DATA_1 + i))

  // Kedalaman untuk indentasi uraian — dari pohon, bukan dari tipe_baris, karena
  // rantai level boleh melompat (CHILD → MEMBER tanpa LEADER di data nyata).
  const indukDari = new Map(urut.map(r => [r.row_id, r.parent_id]))
  const kedalaman = new Map<string, number>()
  for (const r of urut) {
    let d = 0
    let p = r.parent_id
    let jaga = 0
    while (p && jaga++ < 32) {
      d++
      p = indukDari.get(p) ?? null
    }
    kedalaman.set(r.row_id, d)
  }

  return { urut, anak, barisExcel, kedalaman }
}

/** Anak berderet → `SUM(F8:F10)`; terpencar → `F8+F15` (pola formulir manual `S13=S14+S77`). */
function rumusAgregat(kol: string, barisAnak: number[]): string {
  const urut = [...barisAnak].sort((a, b) => a - b)
  const berderet = urut.every((n, i) => i === 0 || n === urut[i - 1] + 1)
  return berderet
    ? `SUM(${kol}${urut[0]}:${kol}${urut[urut.length - 1]})`
    : urut.map(n => `${kol}${n}`).join('+')
}

/**
 * `ROUND(...,0)` wajib — `hitungJumlah()` memakai Math.round sedangkan vol
 * disimpan DECIMAL(18,4). Tanpa pembulatan, baris ber-vol pecahan meleset
 * beberapa rupiah dan selisihnya merambat ke atas lewat SUM.
 */
function rumusDaun(kolVol: string, kolHarga: string, baris: number): string {
  return `ROUND(${kolVol}${baris}*${kolHarga}${baris},0)`
}

function selNilai<T extends BarisPohon>(
  r: T,
  pohon: Pohon<T>,
  kol: { vol: string; harga: string; nilai: string },
  nilai: number,
  /** Nilai vol & harga baris ini — nama kolomnya beda antara sisi DPA dan sisi P. */
  isian: { vol: number | null; harga: number | null },
): ExcelJS.CellValue {
  const anak = pohon.anak.get(r.row_id) ?? []
  if (anak.length) {
    const barisAnak = anak
      .map(c => pohon.barisExcel.get(c.row_id))
      .filter((n): n is number => n != null)
    if (barisAnak.length) return { formula: rumusAgregat(kol.nilai, barisAnak), result: nilai }
  }
  // isLeafMode = tipe EDITABLE && tanpa anak. Root (GRANDMASTER) tanpa anak
  // bernilai 0 di recalc, bukan vol × harga — jadi ditulis angka, bukan rumus.
  if (!isLeafMode(r, pohon.anak)) return 0
  const baris = pohon.barisExcel.get(r.row_id)
  if (baris == null) return nilai
  // Vol/harga kosong → ANGKA, bukan rumus. Sel kosongnya ditulis sebagai teks
  // kosong, dan `ROUND(""*"",0)` di Excel berbunyi #VALUE! — rumus yang ada tapi
  // galat. Muncul pada DPA hasil IMPOR, yang lumrah membawa baris berjumlah tanpa
  // rincian vol × harga (berkas sumbernya cuma memuat totalnya); Pergeseran
  // mewarisinya karena barisnya disalin dari DPA.
  //
  // Menulis 0 pada sel vol/harga agar rumusnya "jalan" DITOLAK: hasilnya 0 pada
  // baris yang nilainya bukan nol — angka salah yang terlihat benar, jauh lebih
  // berbahaya daripada galat yang kelihatan.
  if (isian.vol == null || isian.harga == null) return nilai
  return { formula: rumusDaun(kol.vol, kol.harga, baris), result: nilai }
}

// ─── Penata lembar ───────────────────────────────────────────────────────────

function garisSemua(argb = 'FFBFBFBF'): Partial<ExcelJS.Borders> {
  const sisi = { style: 'thin' as const, color: { argb } }
  return { top: sisi, left: sisi, bottom: sisi, right: sisi }
}

function tulisJudul(ws: ExcelJS.Worksheet, kolTerakhir: number, judul: string, tahun: number): void {
  const baris = [judul, 'BADAN LAYANAN UMUM DAERAH', `${INSTANSI} ${PROVINSI}`, `TAHUN ANGGARAN ${tahun}`]
  baris.forEach((teks, i) => {
    const r = ws.getRow(i + 1)
    r.getCell(1).value = teks
    ws.mergeCells(i + 1, 1, i + 1, kolTerakhir)
    r.getCell(1).font = { bold: true, size: i === 0 ? 13 : 11 }
    r.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' }
  })
}

function tulisHeader(ws: ExcelJS.Worksheet, judulKolom: string[]): void {
  const r = ws.getRow(BARIS_HEADER)
  judulKolom.forEach((teks, i) => {
    const sel = r.getCell(i + 1)
    sel.value = teks
    sel.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 }
    sel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1855BB' } }
    sel.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
    sel.border = garisSemua('FFFFFFFF')
  })
  r.height = 28
}

/**
 * Keputusan pengguna 2026-08-05: hanya tanda tangan Direktur. Blok Dewan
 * Pengawas TIDAK dicetak — formulir kerja yang dipakai sehari-hari memang tidak
 * memuatnya, dan kerangka kosong yang tidak pernah diisi cuma jadi sampah.
 * Nama & NIP Direktur diambil dari `blud_pejabat`; kalau tidak tersedia,
 * barisnya ikut dicetak bergaris untuk diisi tangan.
 */
function tulisTandaTangan(
  ws: ExcelJS.Worksheet,
  mulai: number,
  kolAwal: number,
  kolTerakhir: number,
  direktur: PejabatDokumen | null,
): void {
  const tulis = (baris: number, teks: string, tebal = false) => {
    const sel = ws.getRow(baris).getCell(kolAwal)
    sel.value = sanitizeCell(teks)
    ws.mergeCells(baris, kolAwal, baris, kolTerakhir)
    sel.font = { size: 10, bold: tebal }
    sel.alignment = { horizontal: 'center' }
  }

  tulis(mulai, `Semarang, ${GARIS_ISI}`)
  tulis(mulai + 1, 'Direktur')
  tulis(mulai + 2, INSTANSI, true)
  tulis(mulai + 3, PROVINSI, true)
  // mulai+4 … +6 dibiarkan kosong sebagai ruang tanda tangan basah.
  tulis(mulai + 7, direktur?.nama?.trim() || GARIS_ISI, true)
  tulis(mulai + 8, direktur?.nip?.trim() ? `NIP. ${direktur.nip.trim()}` : `NIP. ${GARIS_ISI}`)
}

function selesaikanLembar(
  ws: ExcelJS.Worksheet,
  lebar: number[],
  kolSembunyi: number[],
): void {
  lebar.forEach((w, i) => { ws.getColumn(i + 1).width = w })
  kolSembunyi.forEach(c => { ws.getColumn(c).hidden = true })
  ws.views = [{ state: 'frozen', ySplit: BARIS_HEADER }]
}

function namaBerkas(awalan: string, tahun: number, versi: string | null): string {
  const tag = (versi ?? new Date().toISOString().slice(0, 10)).replace(/-/g, '')
  return `${awalan}_${tahun}_${tag}.xlsx`
}

// ─── DPA ─────────────────────────────────────────────────────────────────────

const KOLOM_DPA = [
  'Kode Rekening', 'Uraian', 'Vol', 'Satuan', 'Harga', 'Jumlah',
  'Penanggung Jawab', 'Keterangan', 'Level', 'Jangkar',
]
const LEBAR_DPA = [26, 46, 8, 10, 16, 18, 22, 24, 10, 26]

export interface UnduhDokumenArgs<T> {
  tahun: number
  versi: string | null
  rows: T[]
  direktur?: PejabatDokumen | null
}

/** Dipisah dari unduhan supaya bisa diuji di Node tanpa DOM (`test-dpa-export.mjs`). */
export async function buatWorkbookDpa(args: UnduhDokumenArgs<DpaBaris>): Promise<ExcelJS.Workbook> {
  const { tahun, rows, direktur = null } = args
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error('Data kosong — tidak ada yang bisa diunduh')
  }

  const ExcelJSLib = await loadExcelJs()
  const wb = new ExcelJSLib.Workbook()
  const ws = wb.addWorksheet(`DPA ${tahun}`)
  const pohon = siapkanPohon(rows)
  const kolTampak = 8

  tulisJudul(ws, kolTampak, 'RINCIAN BELANJA ANGGARAN', tahun)
  tulisHeader(ws, KOLOM_DPA)

  for (const r of pohon.urut) {
    const nomor = pohon.barisExcel.get(r.row_id)!
    const baris = ws.getRow(nomor)
    const punyaAnak = (pohon.anak.get(r.row_id)?.length ?? 0) > 0

    baris.getCell(1).value = sanitizeCell(r.kode_rekening ?? '')
    baris.getCell(2).value = sanitizeCell(r.uraian ?? '')
    baris.getCell(3).value = r.vol ?? ''
    baris.getCell(4).value = sanitizeCell(r.satuan ?? '')
    baris.getCell(5).value = r.harga ?? ''
    baris.getCell(6).value = selNilai(r, pohon, { vol: 'C', harga: 'E', nilai: 'F' }, r.jumlah, { vol: r.vol, harga: r.harga })
    baris.getCell(7).value = sanitizeCell(r.penanggung_jawab ?? '')
    baris.getCell(8).value = sanitizeCell(r.keterangan ?? '')
    baris.getCell(9).value = TIPE_LABEL[r.tipe_baris] ?? ''
    // `anggaran_key` bisa berasal dari berkas yang diimpor orang, jadi ia teks
    // asing — bukan nilai buatan server semata. Tanpa sanitizeCell, isian
    // `=…` di kolom Jangkar berkas kiriman bisa tersimpan lalu terbit kembali
    // sebagai RUMUS di berkas yang dibuka orang keuangan.
    baris.getCell(10).value = sanitizeCell(r.anggaran_key ?? '')

    hiasBarisData(baris, {
      kolomAngka: [3, 5, 6],
      kolomVolume: [3],
      kolTerakhir: KOLOM_DPA.length,
      indent: pohon.kedalaman.get(r.row_id) ?? 0,
      tebal: punyaAnak,
    })
  }

  const akhirData = BARIS_DATA_1 + pohon.urut.length - 1
  tulisTandaTangan(ws, akhirData + 3, 5, kolTampak, direktur)
  selesaikanLembar(ws, LEBAR_DPA, [9, 10])
  return wb
}

export async function exportDpaDokumen(args: UnduhDokumenArgs<DpaBaris>): Promise<void> {
  const wb = await buatWorkbookDpa(args)
  await downloadWorkbook(wb, namaBerkas('DPA_BLUD', args.tahun, args.versi))
}

// ─── Pergeseran ──────────────────────────────────────────────────────────────

// Kolom `Selisih` (12) TETAP rumus `I−F`, jangan diganti nilai mati: itu yang
// membuat berkasnya bisa diperiksa sendiri — ubah satu angka Pergeseran, selisih
// ikut. Dua kolom sebelumnya berisi NILAI, sebab uraian tangan memang bukan
// hasil rumus. `F` (Jumlah) dan `I` (Pergeseran) tidak bergeser, jadi rumusnya
// tetap sah walau selnya pindah dari J ke L.
const KOLOM_PERGESERAN = [
  'Kode Rekening', 'Uraian', 'Vol', 'Satuan', 'Harga', 'Jumlah',
  'Vol P', 'Harga P', 'Pergeseran', 'Bertambah', 'Berkurang', 'Selisih', 'Level', 'Jangkar',
]
const LEBAR_PERGESERAN = [26, 46, 8, 10, 16, 18, 8, 16, 18, 16, 16, 18, 10, 26]

export async function buatWorkbookPergeseran(
  args: UnduhDokumenArgs<PergeseranBaris>,
): Promise<ExcelJS.Workbook> {
  const { tahun, rows, direktur = null } = args
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error('Data kosong — tidak ada yang bisa diunduh')
  }

  const ExcelJSLib = await loadExcelJs()
  const wb = new ExcelJSLib.Workbook()
  const ws = wb.addWorksheet(`Pergeseran ${tahun}`)
  const pohon = siapkanPohon(rows)
  const urai = uraiGeser(rows)
  const kolTampak = 12

  tulisJudul(ws, kolTampak, 'PERGESERAN RINCIAN BELANJA ANGGARAN', tahun)
  tulisHeader(ws, KOLOM_PERGESERAN)

  for (const r of pohon.urut) {
    const nomor = pohon.barisExcel.get(r.row_id)!
    const baris = ws.getRow(nomor)
    const punyaAnak = (pohon.anak.get(r.row_id)?.length ?? 0) > 0

    baris.getCell(1).value = sanitizeCell(r.kode_rekening ?? '')
    baris.getCell(2).value = sanitizeCell(r.uraian ?? '')
    baris.getCell(3).value = r.vol ?? ''
    baris.getCell(4).value = sanitizeCell(r.satuan ?? '')
    baris.getCell(5).value = r.harga ?? ''
    baris.getCell(6).value = selNilai(r, pohon, { vol: 'C', harga: 'E', nilai: 'F' }, r.jumlah, { vol: r.vol, harga: r.harga })
    baris.getCell(7).value = r.vol_p ?? ''
    baris.getCell(8).value = r.harga_p ?? ''
    baris.getCell(9).value = selNilai(r, pohon, { vol: 'G', harga: 'H', nilai: 'I' }, r.pergeseran, { vol: r.vol_p, harga: r.harga_p })
    // Uraian bertambah/berkurang — nilai efektif, sudah termasuk rollup induk
    // (`uraiGeser`). Baris yang tidak diuraikan tangan tetap terisi di sini:
    // turunannya memang angka yang benar, dan dokumen yang mengosongkannya akan
    // membuat baris totalnya tidak berjumlah.
    const u = urai.get(r.row_id) ?? URAIAN_NOL
    baris.getCell(10).value = u.bertambah || ''
    baris.getCell(11).value = u.berkurang || ''
    // Selisih = pergeseran − jumlah, sesuai recalcPergeseranJumlah().
    baris.getCell(12).value = { formula: `I${nomor}-F${nomor}`, result: r.bertambah_berkurang }
    baris.getCell(13).value = TIPE_LABEL[r.tipe_baris] ?? ''
    baris.getCell(14).value = sanitizeCell(r.anggaran_key ?? '')

    hiasBarisData(baris, {
      kolomAngka: [3, 5, 6, 7, 8, 9, 10, 11, 12],
      kolomVolume: [3, 7],
      kolTerakhir: KOLOM_PERGESERAN.length,
      indent: pohon.kedalaman.get(r.row_id) ?? 0,
      tebal: punyaAnak,
    })
  }

  const akhirData = BARIS_DATA_1 + pohon.urut.length - 1
  tulisTandaTangan(ws, akhirData + 3, 6, kolTampak, direktur)
  selesaikanLembar(ws, LEBAR_PERGESERAN, [11, 12])
  return wb
}

export async function exportPergeseranDokumen(
  args: UnduhDokumenArgs<PergeseranBaris>,
): Promise<void> {
  const wb = await buatWorkbookPergeseran(args)
  await downloadWorkbook(wb, namaBerkas('PERGESERAN_DPA', args.tahun, args.versi))
}

// ─── Hiasan baris data ───────────────────────────────────────────────────────

function hiasBarisData(
  baris: ExcelJS.Row,
  opsi: {
    kolomAngka: number[]
    kolomVolume: number[]
    kolTerakhir: number
    indent: number
    tebal: boolean
  },
): void {
  const angka = new Set(opsi.kolomAngka)
  const volume = new Set(opsi.kolomVolume)
  for (let c = 1; c <= opsi.kolTerakhir; c++) {
    const sel = baris.getCell(c)
    // Monospace untuk angka keuangan — aturan design system.
    sel.font = { size: 10, bold: opsi.tebal, name: angka.has(c) ? 'Consolas' : 'Calibri' }
    sel.border = garisSemua()
    if (angka.has(c)) {
      sel.alignment = { horizontal: 'right', vertical: 'top' }
      // Kolom vol dibiarkan General: format `#,##0.##` tetap mencetak pemisah
      // desimal walau angkanya bulat (vol 1 tampil "1,"), sedangkan vol disimpan
      // DECIMAL(18,4) jadi pecahannya tetap harus terlihat kalau memang ada.
      if (!volume.has(c)) sel.numFmt = RUPIAH
    } else if (c === 2) {
      sel.alignment = { horizontal: 'left', vertical: 'top', wrapText: true, indent: opsi.indent }
    } else {
      sel.alignment = { horizontal: 'left', vertical: 'top', wrapText: true }
    }
  }
}
