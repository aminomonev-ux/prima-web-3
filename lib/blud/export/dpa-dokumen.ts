// lib/blud/export/dpa-dokumen.ts — unduhan DPA & Pergeseran sebagai DOKUMEN, bukan rekap.
// Konsep: docs/konsep/blud/CONCEPT-export-import-dpa.md §2.
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
import { totalMutasi, type MutasiInput } from '@/lib/blud/mutasi'
import { HEX_NAIK, HEX_TURUN, KOLOM_SELISIH_PERUBAHAN } from '@/lib/blud/export/warna-delta'
import { tanggalHariIniWIB, formatTanggalId } from '@/lib/blud/tanggal'
import { teksPenandaUnduhan } from '@/lib/blud/impor-balik'
import {
  BARIS_KEPALA, WARNA, kopExcel, kepalaExcel, gayaKepalaExcel, nomorKolomExcel, hiasSelData,
  warnaiTingkatExcel, hiasBarisTotalExcel, catatanExcel, tandaTanganExcel, aturCetakExcel, tingkatBaris,
} from '@/lib/blud/export/gaya-dokumen'
import type { DpaBaris, PergeseranBaris, TipeBaris } from '@/types'

// Gaya "Resmi berwarna" (CONCEPT-blud-format-unduhan §5a): kop 1–5, garis amber 6,
// kepala 7, nomor kolom `(1)(2)…` 8, data mulai 9. Rumus tidak memakai nomor ini
// secara mati — `siapkanPohon(rows, barisAwal)` menghitung letak tiap baris darinya.
const BARIS_HEADER = BARIS_KEPALA
const BARIS_DATA_1 = BARIS_HEADER + 2

const WARNA_NAIK = `FF${HEX_NAIK}`
const WARNA_TURUN = `FF${HEX_TURUN}`

export interface PejabatDokumen {
  nama: string
  nip: string | null
}

/** Bentuk minimum yang dibutuhkan pembangun pohon — dipenuhi DpaBaris & PergeseranBaris. */
export interface BarisPohon {
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

export interface Pohon<T extends BarisPohon> {
  urut: T[]
  anak: Map<string, T[]>
  barisExcel: Map<string, number>
  kedalaman: Map<string, number>
}

/** `barisAwal` — baris Excel data pertama; format Lengkap berkepala dua tingkat. */
export function siapkanPohon<T extends BarisPohon>(rows: T[], barisAwal = BARIS_DATA_1): Pohon<T> {
  const urut = [...rows].sort((a, b) => a.urutan - b.urutan)

  const anak = new Map<string, T[]>()
  for (const r of urut) {
    if (!r.parent_id) continue
    const daftar = anak.get(r.parent_id)
    if (daftar) daftar.push(r)
    else anak.set(r.parent_id, [r])
  }

  const barisExcel = new Map<string, number>()
  urut.forEach((r, i) => barisExcel.set(r.row_id, barisAwal + i))

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

/**
 * `penanda` (baris 5) — "DPA PERUBAHAN KE-n · versi …", acuan pergeseran, atau versi.
 * Untuk DPA ia juga PENANDA yang dibaca Impor (konsep Perubahan §11.1): Excel
 * Perubahan Ringkas tidak punya beda kolom dengan DPA murni, jadi hanya kop ini
 * yang membedakannya.
 */
function tulisJudul(ws: ExcelJS.Worksheet, kolTerakhir: number, judul: string, tahun: number, penanda?: string): void {
  kopExcel(ws, kolTerakhir, judul, tahun, penanda, sanitizeCell)
}

/** Kepala satu baris + baris nomor kolom `(1)(2)…` (yang dilewati Impor). */
function tulisHeader(ws: ExcelJS.Worksheet, judulKolom: string[], kolTampak: number): void {
  kepalaExcel(ws, BARIS_HEADER, judulKolom)
  nomorKolomExcel(ws, BARIS_HEADER + 1, kolTampak)
}

/** Keputusan pengguna 2026-08-05: hanya tanda tangan Direktur (`blud_pejabat`). */
function tulisTandaTangan(
  ws: ExcelJS.Worksheet,
  mulai: number,
  kolAwal: number,
  kolTerakhir: number,
  direktur: PejabatDokumen | null,
): void {
  tandaTanganExcel(ws, mulai, kolAwal, kolTerakhir, direktur, sanitizeCell)
}

/**
 * Baris JUMLAH penutup: rumus atas baris AKAR saja (anak sudah tergulung di induknya).
 * Impor melewatinya (`barisJumlahPenutup` di import-dpa.ts) — kalau tidak, ia terbaca
 * sebagai akar tambahan dan totalnya dobel.
 */
function tulisBarisJumlah<T extends BarisPohon>(
  ws: ExcelJS.Worksheet,
  nomor: number,
  pohon: Pohon<T>,
  kolTampak: number,
  label: string,
  kolom: Array<{ kol: number; huruf: string; nilai: number }>,
): void {
  const akar = pohon.urut.filter(r => (pohon.kedalaman.get(r.row_id) ?? 0) === 0)
  const barisAkar = akar.map(r => pohon.barisExcel.get(r.row_id)).filter((n): n is number => n != null)
  const baris = ws.getRow(nomor)
  baris.getCell(2).value = label
  for (const k of kolom) {
    baris.getCell(k.kol).value = barisAkar.length
      ? { formula: rumusAgregat(k.huruf, barisAkar), result: k.nilai }
      : k.nilai
  }
  hiasBarisTotalExcel(baris, kolTampak, kolom.map(k => k.kol))
}

const totalAkar = <T extends BarisPohon>(pohon: Pohon<T>, nilai: (r: T) => number): number =>
  pohon.urut.filter(r => (pohon.kedalaman.get(r.row_id) ?? 0) === 0).reduce((s, r) => s + (Number(nilai(r)) || 0), 0)

/**
 * Dua kolom cadangan di belakang yang disembunyikan dari mata pembaca dokumen,
 * tapi tetap terbawa supaya berkasnya bisa diimpor balik.
 *
 * Letaknya DIHITUNG dari nama kolomnya, tidak ditulis sebagai angka. Waktu L86
 * menyisipkan Bertambah/Berkurang/Selisih, keduanya bergeser dari kolom 11-12 ke
 * 13-14 sementara angkanya tidak ikut digeser — jadi dokumen Pergeseran
 * menyembunyikan Berkurang & Selisih dan memamerkan Level & Jangkar, tanpa satu
 * galat pun. Indeks kolom yang ditulis tangan akan mengulang itu pada
 * penyisipan berikutnya.
 */
const KOLOM_CADANGAN = ['Level', 'Jangkar']

const kolomCadangan = (kolom: readonly string[]): number[] =>
  kolom.flatMap((nama, i) => (KOLOM_CADANGAN.includes(nama) ? [i + 1] : []))

/** Kolom yang benar-benar terlihat — dipakai merge judul & blok tanda tangan. */
const kolomTampak = (kolom: readonly string[]): number =>
  kolom.length - kolomCadangan(kolom).length

function selesaikanLembar(
  ws: ExcelJS.Worksheet,
  lebar: number[],
  kolom: readonly string[],
  barisBeku = BARIS_HEADER + 1,
): void {
  lebar.forEach((w, i) => { ws.getColumn(i + 1).width = w })
  kolomCadangan(kolom).forEach(c => { ws.getColumn(c).hidden = true })
  aturCetakExcel(ws, { mendatar: true, kepalaAwal: BARIS_HEADER, kepalaAkhir: barisBeku })
}

function namaBerkas(awalan: string, tahun: number, versi: string | null): string {
  const tag = (versi ?? tanggalHariIniWIB()).replace(/-/g, '')
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
  /**
   * Catatan perpindahan (Pergeseran saja). Dua gunanya: kolom Bertambah/Berkurang
   * memakai angka catatan alih-alih turunan selisih, dan lembar "Perpindahan"
   * yang menjawab "45 juta itu dari mana" — pertanyaan yang tidak bisa dijawab
   * dokumen yang cuma memuat hasilnya.
   */
  mutasi?: readonly MutasiInput[] | null
  /**
   * DPA: babak Perubahan versi ini (`keBabak`), `null`/tanpa = murni. Menulis kop
   * "DPA PERUBAHAN KE-n" — format Ringkas (konsep Perubahan §7) dan penanda Impor.
   */
  perubahanKe?: number | null
  /** Pergeseran: acuannya DPA Perubahan ke berapa (§9 "kop menyebut acuannya"). */
  acuanPerubahanKe?: number | null
  /**
   * DPA: angka kunci versi saat diunduh ("simpanan ke-n"). Ditulis sebagai penanda
   * unduhan di kolom Jangkar supaya impor-balik ke versi terbuka bisa menyebut berkas
   * yang basi (konsep Perubahan §11.3).
   */
  simpananKe?: number | null
}

/** Kop baris 5 dokumen DPA versi Perubahan — satu rumus untuk Ringkas & Lengkap. */
export function kopPerubahan(ke: number, versi: string | null): string {
  return `DPA PERUBAHAN KE-${ke}${versi ? ` · versi ${formatTanggalId(versi)}` : ''}`
}

/** Dipisah dari unduhan supaya bisa diuji di Node tanpa DOM (`test-dpa-export.mjs`). */
export async function buatWorkbookDpa(args: UnduhDokumenArgs<DpaBaris>): Promise<ExcelJS.Workbook> {
  const { tahun, rows, direktur = null, perubahanKe = null, versi, simpananKe = null } = args
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error('Data kosong — tidak ada yang bisa diunduh')
  }

  const ExcelJSLib = await loadExcelJs()
  const wb = new ExcelJSLib.Workbook()
  const ws = wb.addWorksheet(`DPA ${tahun}`)
  const pohon = siapkanPohon(rows)
  const kolTampak = kolomTampak(KOLOM_DPA)

  // Format Ringkas DPA Perubahan = tata letak DPA murni + kop penanda (konsep §7).
  tulisJudul(ws, kolTampak, 'RINCIAN BELANJA ANGGARAN', tahun,
    perubahanKe ? kopPerubahan(perubahanKe, versi) : versi ? `DPA BLUD versi ${formatTanggalId(versi)}` : undefined)
  // Di kolom Jangkar yang tersembunyi, di luar sel gabung kop — tidak tercetak, tapi
  // bertahan disunting Excel seperti isi Jangkar itu sendiri.
  if (versi && simpananKe != null) {
    ws.getRow(1).getCell(KOLOM_DPA.indexOf('Jangkar') + 1).value =
      sanitizeCell(teksPenandaUnduhan({ tahun, versi, simpananKe }))
  }
  tulisHeader(ws, KOLOM_DPA, kolTampak)

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
      kolTampak,
      indent: pohon.kedalaman.get(r.row_id) ?? 0,
      tebal: punyaAnak,
    })
  }

  const akhirData = BARIS_DATA_1 + pohon.urut.length - 1
  tulisBarisJumlah(ws, akhirData + 1, pohon, kolTampak, 'JUMLAH BELANJA', [
    { kol: 6, huruf: 'F', nilai: totalAkar(pohon, r => r.jumlah) },
  ])
  tulisTandaTangan(ws, akhirData + 4, 5, kolTampak, direktur)
  selesaikanLembar(ws, LEBAR_DPA, KOLOM_DPA)
  return wb
}

export async function exportDpaDokumen(args: UnduhDokumenArgs<DpaBaris>): Promise<void> {
  const wb = await buatWorkbookDpa(args)
  const awalan = args.perubahanKe ? `DPA_BLUD_PERUBAHAN${args.perubahanKe}` : 'DPA_BLUD'
  await downloadWorkbook(wb, namaBerkas(awalan, args.tahun, args.versi))
}

// ─── DPA Perubahan — format Lengkap ──────────────────────────────────────────
// Bentuk dokumen pergeseran kantor ("DPA BLUD PERGESERAN JANUARI.xlsx"): dua blok
// angka berkepala dua tingkat, lalu Bertambah/(Berkurang) dan %. Keputusan pemilik
// 2026-10-09: judul blok SEBELUM/SESUDAH PERUBAHAN, kop TANPA baris Program/Kegiatan,
// kolom % ikut (Sebelum nol → "—"), tanda tangan Direktur saja.
// Tanpa kolom Level/Jangkar: format ini SENGAJA tidak bisa diimpor (konsep §11.2 —
// dua set Vol/Harga/Jumlah membuat pembaca bisa mengambil sisi Sebelum).

const KOLOM_PERUBAHAN = [
  'Kode Rekening', 'Uraian',
  'Vol', 'Satuan', 'Harga', 'Jumlah',
  'Vol', 'Satuan', 'Harga', 'Jumlah',
  KOLOM_SELISIH_PERUBAHAN, '%', 'Penanggung Jawab', 'Keterangan',
]
const LEBAR_PERUBAHAN = [26, 46, 8, 10, 16, 18, 8, 10, 16, 18, 18, 9, 22, 24]
const BLOK_PERUBAHAN = [
  { judul: 'SEBELUM PERUBAHAN', dari: 3, sampai: 6 },
  { judul: 'SESUDAH PERUBAHAN', dari: 7, sampai: 10 },
] as const
const KOL_SELISIH_P = KOLOM_PERUBAHAN.indexOf(KOLOM_SELISIH_PERUBAHAN) + 1
const KOL_PERSEN_P = KOLOM_PERUBAHAN.indexOf('%') + 1
const BARIS_HEADER_BAWAH = BARIS_HEADER + 1
const BARIS_NOMOR_PERUBAHAN = BARIS_HEADER + 2
const BARIS_DATA_PERUBAHAN = BARIS_HEADER + 3
/** Gaya dokumen anggaran — berkurang dalam kurung, nol "-" — sama dgn `formatSelisih` di layar. */
const RUPIAH_SELISIH = '#,##0;(#,##0);"-"'
const PERSEN_SELISIH = '0.00%;(0.00%);"-"'

/**
 * Sisi Sebelum mengikuti pohon VERSI DASAR, bukan pohon sekarang: rekening yang
 * dulu daun lalu diberi anak di Perubahan dulunya bernilai vol × harga sendiri,
 * sedangkan anak-anak barunya Sebelum-nya nol — `SUM` di situ menghitung ulang
 * 10 juta jadi 0 begitu Excel menghitung. Jadi baris ini dianggap induk di sisi
 * Sebelum hanya kalau ada anaknya yang SUDAH ada di versi dasar.
 */
function selSebelum(r: DpaBaris, pohon: Pohon<DpaBaris>): ExcelJS.CellValue {
  const nilai = Number(r.jumlah_sebelum ?? 0)
  const anak = pohon.anak.get(r.row_id) ?? []
  if (anak.some(c => c.jumlah_sebelum != null)) {
    const barisAnak = anak.map(c => pohon.barisExcel.get(c.row_id)).filter((n): n is number => n != null)
    return { formula: rumusAgregat('F', barisAnak), result: nilai }
  }
  const baris = pohon.barisExcel.get(r.row_id)
  if (baris == null || r.vol_sebelum == null || r.harga_sebelum == null) return nilai
  return { formula: rumusDaun('C', 'E', baris), result: nilai }
}

function tulisHeaderPerubahan(ws: ExcelJS.Worksheet): void {
  const atas = ws.getRow(BARIS_HEADER)
  const bawah = ws.getRow(BARIS_HEADER_BAWAH)
  KOLOM_PERUBAHAN.forEach((teks, i) => {
    const c = i + 1
    if (BLOK_PERUBAHAN.some(b => c >= b.dari && c <= b.sampai)) {
      bawah.getCell(c).value = teks
    } else {
      atas.getCell(c).value = teks
      ws.mergeCells(BARIS_HEADER, c, BARIS_HEADER_BAWAH, c)
    }
  })
  for (const b of BLOK_PERUBAHAN) {
    atas.getCell(b.dari).value = b.judul
    ws.mergeCells(BARIS_HEADER, b.dari, BARIS_HEADER, b.sampai)
  }
  for (const r of [atas, bawah]) {
    for (let c = 1; c <= KOLOM_PERUBAHAN.length; c++) gayaKepalaExcel(r.getCell(c))
    r.height = 20
  }
  nomorKolomExcel(ws, BARIS_NOMOR_PERUBAHAN, KOLOM_PERUBAHAN.length)
}

export async function buatWorkbookDpaPerubahan(args: UnduhDokumenArgs<DpaBaris>): Promise<ExcelJS.Workbook> {
  const { tahun, rows, direktur = null, perubahanKe = null, versi } = args
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error('Data kosong — tidak ada yang bisa diunduh')
  }
  // Tanpa satu baris ber-Sebelum ini DPA murni: dokumennya akan berbunyi "Sebelum 0
  // → Sesudah 68 M" di semua baris — angka yang tidak pernah ada (pelajaran Tahap 2).
  if (!perubahanKe || !rows.some(r => r.jumlah_sebelum != null)) {
    throw new Error('Versi ini DPA murni — format Lengkap hanya untuk versi DPA Perubahan.')
  }

  const ExcelJSLib = await loadExcelJs()
  const wb = new ExcelJSLib.Workbook()
  const ws = wb.addWorksheet(`DPA Perubahan ${tahun}`)
  const pohon = siapkanPohon(rows, BARIS_DATA_PERUBAHAN)
  const kolTampak = KOLOM_PERUBAHAN.length

  tulisJudul(ws, kolTampak, 'RINCIAN BELANJA ANGGARAN', tahun, kopPerubahan(perubahanKe, versi))
  tulisHeaderPerubahan(ws)

  for (const r of pohon.urut) {
    const nomor = pohon.barisExcel.get(r.row_id)!
    const baris = ws.getRow(nomor)
    const punyaAnak = (pohon.anak.get(r.row_id)?.length ?? 0) > 0
    const sebelum = Number(r.jumlah_sebelum ?? 0)
    const selisih = Number(r.jumlah ?? 0) - sebelum

    baris.getCell(1).value = sanitizeCell(r.kode_rekening ?? '')
    baris.getCell(2).value = sanitizeCell(r.uraian ?? '')
    // Rekening yang lahir di Perubahan: Sebelum kosong, Jumlah-nya 0 (bukan teks) —
    // SUM induk dan rumus Bertambah butuh angka.
    baris.getCell(3).value = r.vol_sebelum ?? ''
    baris.getCell(4).value = sanitizeCell(r.satuan_sebelum ?? '')
    baris.getCell(5).value = r.harga_sebelum ?? ''
    baris.getCell(6).value = selSebelum(r, pohon)
    baris.getCell(7).value = r.vol ?? ''
    baris.getCell(8).value = sanitizeCell(r.satuan ?? '')
    baris.getCell(9).value = r.harga ?? ''
    baris.getCell(10).value = selNilai(r, pohon, { vol: 'G', harga: 'I', nilai: 'J' }, r.jumlah, { vol: r.vol, harga: r.harga })
    // Rumus, bukan nilai mati: berkasnya bisa diperiksa sendiri (pola kolom Selisih Pergeseran).
    baris.getCell(KOL_SELISIH_P).value = { formula: `J${nomor}-F${nomor}`, result: selisih }
    baris.getCell(KOL_PERSEN_P).value = {
      formula: `IF(F${nomor}=0,"—",K${nomor}/F${nomor})`,
      result: sebelum ? selisih / sebelum : '—',
    }
    baris.getCell(13).value = sanitizeCell(r.penanggung_jawab ?? '')
    baris.getCell(14).value = sanitizeCell(r.keterangan ?? '')

    const warna = new Map<number, string>()
    if (selisih > 0) warna.set(KOL_SELISIH_P, WARNA_NAIK)
    else if (selisih < 0) warna.set(KOL_SELISIH_P, WARNA_TURUN)
    hiasBarisData(baris, {
      kolomAngka: [3, 5, 6, 7, 9, 10, KOL_SELISIH_P, KOL_PERSEN_P],
      kolomVolume: [3, 7],
      kolTerakhir: kolTampak,
      kolTampak,
      indent: pohon.kedalaman.get(r.row_id) ?? 0,
      tebal: punyaAnak,
      warna,
    })
    baris.getCell(KOL_SELISIH_P).numFmt = RUPIAH_SELISIH
    baris.getCell(KOL_PERSEN_P).numFmt = PERSEN_SELISIH
  }

  const akhirData = BARIS_DATA_PERUBAHAN + pohon.urut.length - 1
  const nTotal = akhirData + 1
  const totalSebelum = totalAkar(pohon, r => Number(r.jumlah_sebelum ?? 0))
  const totalSesudah = totalAkar(pohon, r => r.jumlah)
  tulisBarisJumlah(ws, nTotal, pohon, kolTampak, 'JUMLAH BELANJA', [
    { kol: 6, huruf: 'F', nilai: totalSebelum },
    { kol: 10, huruf: 'J', nilai: totalSesudah },
  ])
  const total = ws.getRow(nTotal)
  total.getCell(KOL_SELISIH_P).value = { formula: `J${nTotal}-F${nTotal}`, result: totalSesudah - totalSebelum }
  total.getCell(KOL_SELISIH_P).numFmt = RUPIAH_SELISIH
  total.getCell(KOL_PERSEN_P).value = {
    formula: `IF(F${nTotal}=0,"—",K${nTotal}/F${nTotal})`,
    result: totalSebelum ? (totalSesudah - totalSebelum) / totalSebelum : '—',
  }
  total.getCell(KOL_PERSEN_P).numFmt = PERSEN_SELISIH
  tulisTandaTangan(ws, akhirData + 4, 9, kolTampak, direktur)
  selesaikanLembar(ws, LEBAR_PERUBAHAN, KOLOM_PERUBAHAN, BARIS_NOMOR_PERUBAHAN)
  return wb
}

export async function exportDpaPerubahanDokumen(args: UnduhDokumenArgs<DpaBaris>): Promise<void> {
  const wb = await buatWorkbookDpaPerubahan(args)
  await downloadWorkbook(wb, namaBerkas(`DPA_BLUD_PERUBAHAN${args.perubahanKe ?? ''}_LENGKAP`, args.tahun, args.versi))
}

// ─── Pergeseran ──────────────────────────────────────────────────────────────

// Kolom `Selisih` (12) TETAP rumus `I−F`, jangan diganti nilai mati: itu yang
// membuat berkasnya bisa diperiksa sendiri — ubah satu angka Pergeseran, selisih
// ikut. Dua kolom sebelumnya berisi NILAI, sebab uraian tangan memang bukan
// hasil rumus. `F` (Jumlah) dan `I` (Pergeseran) tidak bergeser, jadi rumusnya
// tetap sah walau selnya pindah dari J ke L.
// Penanggung Jawab & Keterangan ikut, sama dengan dokumen DPA dan sama dengan
// tabel di menu Cetak: keduanya sudah jadi kolom `pergeseran_dpa` sejak 2026-08-24
// (cermin DPA), dan dokumen yang menghilangkannya membuat orang yang cuma
// memegang berkasnya tidak tahu pos itu tanggung jawab siapa.
const KOLOM_PERGESERAN = [
  'Kode Rekening', 'Uraian', 'Vol', 'Satuan', 'Harga', 'Jumlah',
  'Vol P', 'Harga P', 'Pergeseran', 'Bertambah', 'Berkurang', 'Selisih',
  'Penanggung Jawab', 'Keterangan', 'Level', 'Jangkar',
]
const LEBAR_PERGESERAN = [26, 46, 8, 10, 16, 18, 8, 16, 18, 16, 16, 18, 22, 24, 10, 26]

/** Letak tiga kolom delta, dicari dari namanya — bukan angka yang diam waktu
 *  kolom lain disisipkan di depannya. */
const KOL_BERTAMBAH = KOLOM_PERGESERAN.indexOf('Bertambah') + 1
const KOL_BERKURANG = KOLOM_PERGESERAN.indexOf('Berkurang') + 1
const KOL_SELISIH = KOLOM_PERGESERAN.indexOf('Selisih') + 1

export async function buatWorkbookPergeseran(
  args: UnduhDokumenArgs<PergeseranBaris>,
): Promise<ExcelJS.Workbook> {
  const { tahun, rows, direktur = null, mutasi = null, acuanPerubahanKe = null } = args
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error('Data kosong — tidak ada yang bisa diunduh')
  }

  const ExcelJSLib = await loadExcelJs()
  const wb = new ExcelJSLib.Workbook()
  const ws = wb.addWorksheet(`Pergeseran ${tahun}`)
  const pohon = siapkanPohon(rows)
  const urai = uraiGeser(rows, mutasi)
  const kolTampak = kolomTampak(KOLOM_PERGESERAN)

  const acuan = rows[0]?.dpa_versi_tanggal ?? null
  tulisJudul(ws, kolTampak, 'PERGESERAN RINCIAN BELANJA ANGGARAN', tahun, kopPergeseran(args.versi, acuan, acuanPerubahanKe))
  tulisHeader(ws, KOLOM_PERGESERAN, kolTampak)

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
    baris.getCell(KOL_BERTAMBAH).value = u.bertambah || ''
    baris.getCell(KOL_BERKURANG).value = u.berkurang || ''
    // Selisih = pergeseran − jumlah, sesuai recalcPergeseranJumlah().
    baris.getCell(KOL_SELISIH).value = { formula: `I${nomor}-F${nomor}`, result: r.bertambah_berkurang }

    // Hijau/merah seperti di layar Cetak. Nol dibiarkan hitam — mewarnai baris
    // yang tidak bergeser membuat yang bergeser tenggelam di antaranya.
    const bb = Number(r.bertambah_berkurang ?? 0)
    const warna = new Map<number, string>()
    if (u.bertambah) warna.set(KOL_BERTAMBAH, WARNA_NAIK)
    if (u.berkurang) warna.set(KOL_BERKURANG, WARNA_TURUN)
    if (bb > 0) warna.set(KOL_SELISIH, WARNA_NAIK)
    else if (bb < 0) warna.set(KOL_SELISIH, WARNA_TURUN)
    baris.getCell(13).value = sanitizeCell(r.penanggung_jawab ?? '')
    baris.getCell(14).value = sanitizeCell(r.keterangan ?? '')
    baris.getCell(15).value = TIPE_LABEL[r.tipe_baris] ?? ''
    baris.getCell(16).value = sanitizeCell(r.anggaran_key ?? '')

    hiasBarisData(baris, {
      kolomAngka: [3, 5, 6, 7, 8, 9, KOL_BERTAMBAH, KOL_BERKURANG, KOL_SELISIH],
      kolomVolume: [3, 7],
      kolTerakhir: KOLOM_PERGESERAN.length,
      kolTampak,
      indent: pohon.kedalaman.get(r.row_id) ?? 0,
      tebal: punyaAnak,
      warna,
    })
    if (punyaAnak || !(u.bertambah || u.berkurang)) continue
    // Rincian yang benar-benar bergeser: tanda tepi kiri amber (CONCEPT-blud-format-unduhan §5a).
    baris.getCell(1).border = { ...baris.getCell(1).border, left: { style: 'thick', color: { argb: `FF${WARNA.amber}` } } }
  }

  const akhirData = BARIS_DATA_1 + pohon.urut.length - 1
  const nTotal = akhirData + 1
  const urAkar = (r: PergeseranBaris) => urai.get(r.row_id) ?? URAIAN_NOL
  const tambah = totalAkar(pohon, r => urAkar(r).bertambah)
  const kurang = totalAkar(pohon, r => urAkar(r).berkurang)
  const semula = totalAkar(pohon, r => r.jumlah)
  const menjadi = totalAkar(pohon, r => r.pergeseran)
  tulisBarisJumlah(ws, nTotal, pohon, kolTampak, 'JUMLAH', [
    { kol: 6, huruf: 'F', nilai: semula },
    { kol: 9, huruf: 'I', nilai: menjadi },
    { kol: KOL_BERTAMBAH, huruf: hurufKolom(KOL_BERTAMBAH), nilai: tambah },
    { kol: KOL_BERKURANG, huruf: hurufKolom(KOL_BERKURANG), nilai: kurang },
  ])
  ws.getRow(nTotal).getCell(KOL_SELISIH).value = { formula: `I${nTotal}-F${nTotal}`, result: menjadi - semula }
  catatanExcel(ws, nTotal + 1, kolTampak, kalimatImbang(tambah, kurang))
  tulisTandaTangan(ws, akhirData + 5, 6, kolTampak, direktur)
  selesaikanLembar(ws, LEBAR_PERGESERAN, KOLOM_PERGESERAN)
  if (mutasi?.length) tulisLembarPerpindahan(wb, rows, mutasi, args.tahun, kopPergeseran(args.versi, acuan, acuanPerubahanKe))
  return wb
}

/** Baris 5 kop Pergeseran — versi + acuan DPA. Satu rumus untuk Excel & PDF. */
export function kopPergeseran(versi: string | null, acuan: string | null, acuanPerubahanKe: number | null): string | undefined {
  const bagian: string[] = []
  if (versi) bagian.push(`Pergeseran versi ${formatTanggalId(versi)}`)
  if (acuanPerubahanKe) bagian.push(`Mengacu DPA Perubahan ke-${acuanPerubahanKe}${acuan ? ` (${formatTanggalId(acuan)})` : ''}`)
  else if (acuan) bagian.push(`acuan DPA ${formatTanggalId(acuan)}`)
  return bagian.length ? bagian.join(' · ') : undefined
}

/** "Berimbang: …" di bawah tabel Pergeseran — Excel & PDF. */
export function kalimatImbang(tambah: number, kurang: number): string {
  const rp = (n: number) => Math.round(n).toLocaleString('id-ID')
  return Math.round(tambah) === Math.round(kurang)
    ? `Berimbang: bertambah Rp ${rp(tambah)} = berkurang Rp ${rp(kurang)}.`
    : `TIDAK berimbang: bertambah Rp ${rp(tambah)}, berkurang Rp ${rp(kurang)} (selisih Rp ${rp(tambah - kurang)}).`
}

const hurufKolom = (n: number): string => {
  let s = ''
  for (let k = n; k > 0; k = Math.floor((k - 1) / 26)) s = String.fromCharCode(65 + ((k - 1) % 26)) + s
  return s
}

/**
 * Lembar kedua: uang berpindah dari rekening mana ke mana.
 *
 * Dibuat HANYA kalau ada catatannya — lembar kosong di dokumen yang beredar ke
 * luar terbaca seperti ada yang gagal, bukan seperti "memang tidak ada".
 */
function tulisLembarPerpindahan(
  wb: ExcelJS.Workbook,
  rows: PergeseranBaris[],
  mutasi: readonly MutasiInput[],
  tahun: number,
  baris5: string | undefined,
): void {
  const ws = wb.addWorksheet('Perpindahan')
  const nama = new Map<string, string>()
  for (const r of rows) {
    nama.set(r.row_id, `${r.kode_rekening ? r.kode_rekening + ' — ' : ''}${r.uraian || '(tanpa uraian)'}`)
  }
  // Baris yang sudah tidak ada tetap tercetak dengan id mentahnya: uangnya nyata,
  // dan baris yang hilang justru yang perlu ketahuan.
  const label = (rowId: string) => nama.get(rowId) ?? `(baris tidak ditemukan: ${rowId})`

  const kolom = ['No', 'Dari', 'Ke', 'Nilai', 'Keterangan']
  kopExcel(ws, kolom.length, 'DAFTAR PERPINDAHAN ANGGARAN', tahun, baris5, sanitizeCell)
  kepalaExcel(ws, BARIS_HEADER, kolom)
  nomorKolomExcel(ws, BARIS_HEADER + 1, kolom.length)

  let n = BARIS_DATA_1
  mutasi.forEach((m, i) => {
    const baris = ws.getRow(n++)
    baris.values = [
      i + 1,
      sanitizeCell(label(m.dari_row)),
      sanitizeCell(label(m.ke_row)),
      Number(m.nilai) || 0,
      sanitizeCell(m.keterangan ?? ''),
    ]
    for (let c = 1; c <= kolom.length; c++) hiasSelData(baris.getCell(c), { angka: c === 4 })
    baris.getCell(1).alignment = { horizontal: 'center', vertical: 'top' }
  })

  const total = ws.getRow(n)
  total.getCell(2).value = 'TOTAL PERPINDAHAN'
  total.getCell(4).value = mutasi.length
    ? { formula: `SUM(D${BARIS_DATA_1}:D${n - 1})`, result: totalMutasi(mutasi) }
    : 0
  hiasBarisTotalExcel(total, kolom.length, [4])
  total.getCell(2).alignment = { horizontal: 'left', vertical: 'middle' }

  // Lebar lewat `getColumn`, bukan `ws.columns = […]` — pola `selesaikanLembar`;
  // menugaskan `columns` sesudah baris ditulis mendefinisikan ulang kuncinya.
  ;[6, 46, 46, 18, 30].forEach((w, i) => { ws.getColumn(i + 1).width = w })
  aturCetakExcel(ws, { mendatar: true, kepalaAwal: BARIS_HEADER, kepalaAkhir: BARIS_HEADER + 1 })
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
    /** Kolom yang tampak — latar tingkat berhenti di sini (kolom cadangan tetap polos). */
    kolTampak: number
    indent: number
    tebal: boolean
    /** Kolom → warna teks ARGB. Diterapkan DI SINI karena fungsi ini menulis ulang
     *  `font` tiap sel; mewarnai sebelum memanggilnya akan tertimpa diam-diam. */
    warna?: Map<number, string>
  },
): void {
  const angka = new Set(opsi.kolomAngka)
  const volume = new Set(opsi.kolomVolume)
  const tingkat = tingkatBaris(opsi.indent, opsi.tebal)
  for (let c = 1; c <= opsi.kolTerakhir; c++) {
    hiasSelData(baris.getCell(c), {
      angka: angka.has(c), volume: volume.has(c), uraian: c === 2, indent: opsi.indent,
      tebal: opsi.tebal, mono: c === 1,
    })
  }
  warnaiTingkatExcel(baris, opsi.kolTampak, tingkat)
  // Di atas latar navy baris akar hijau/merah gelap tak terbaca — pakai versi terangnya.
  const terang = new Map([[WARNA_NAIK, `FF${WARNA.naikTerang}`], [WARNA_TURUN, `FF${WARNA.turunTerang}`]])
  for (const [c, argb] of opsi.warna ?? []) {
    const sel = baris.getCell(c)
    sel.font = { ...sel.font, color: { argb: tingkat === 'akar' ? terang.get(argb) ?? argb : argb } }
  }
}
