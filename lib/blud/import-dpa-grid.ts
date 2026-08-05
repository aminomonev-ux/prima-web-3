// lib/blud/import-dpa-grid.ts — pembaca mentah berkas DPA (.xlsx) jadi grid sel.
// Konsep: docs/CONCEPT-export-import-dpa.md §3.2–3.3 lapis 1.
//
// Tugasnya HANYA membaca dan menormalkan. Tidak tahu apa-apa soal hierarki DPA —
// itu urusan import-dpa.ts. Pemisahan ini disengaja: bentuk berkas berubah tiap
// tahun (nama lembar, posisi kolom), sedangkan aturan pohon tidak.
//
// Tiga hal yang TIDAK boleh dipatok, terbukti berbeda di 3 formulir asli:
//   nama lembar   `2024` · `Pagu 57` · `BLUD ` (+ spasi di belakang)
//   baris header  dicari lewat teks, bukan nomor
//   nomor kolom   Jumlah di S (2026) tapi T (2024/2025)
import type ExcelJS from 'exceljs'

/** L67 — cap jumlah lembar yang diperiksa, tameng zip-bomb. */
const MAKS_LEMBAR = 20
const MAKS_BARIS = 20_000
const BARIS_CARI_HEADER = 40

export interface SelGrid {
  /** Teks tampilan — richText sudah digabung, rumus sudah diambil hasilnya. */
  teks: string
  /** Nilai numerik kalau selnya angka (atau rumus yang hasilnya tersimpan). */
  angka: number | null
  /** Rumus tanpa `=`. Shared formula sudah diperluas jadi rumus utuh. */
  rumus: string | null
}

export interface GridDpa {
  namaLembar: string
  /** 1-based. */
  barisHeader: number
  jumlahBaris: number
  jumlahKolom: number
  /** `sel(baris, kolom)` — keduanya 1-based, di luar jangkauan → sel kosong. */
  sel: (baris: number, kolom: number) => SelGrid
}

export class BerkasDpaTidakDikenalError extends Error {
  constructor(pesan: string) {
    super(pesan)
    this.name = 'BerkasDpaTidakDikenalError'
  }
}

const SEL_KOSONG: SelGrid = { teks: '', angka: null, rumus: null }

const POLA_HEADER = /kode\s*rekening/i

function bacaTeks(v: ExcelJS.CellValue): string {
  if (v == null) return ''
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  const o = v as unknown as Record<string, unknown>
  if (Array.isArray(o.richText)) {
    return (o.richText as Array<{ text?: string }>).map(t => t.text ?? '').join('')
  }
  if (o.result != null) return bacaTeks(o.result as ExcelJS.CellValue)
  if (typeof o.text === 'string') return o.text
  return ''
}

function bacaAngka(v: ExcelJS.CellValue): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (v && typeof v === 'object') {
    const hasil = (v as unknown as Record<string, unknown>).result
    if (typeof hasil === 'number' && Number.isFinite(hasil)) return hasil
  }
  return null
}

/**
 * Excel menyimpan satu rumus induk lalu menandai salinannya "sama seperti itu,
 * digeser". Di formulir 2026 ada 198 sel semacam itu, dan exceljs TIDAK
 * menerjemahkannya — `cell.formula` kosong. Tanpa perluasan ini, deteksi kolom
 * vol/harga kehilangan sebagian besar sampelnya.
 *
 * Pergeseran yang ditangani hanya BARIS (salin ke bawah dalam satu kolom), itu
 * bentuk yang dipakai ketiga formulir asli.
 */
function geserBaris(rumus: string, delta: number): string {
  if (delta === 0) return rumus
  // $A$1 dibiarkan (absolut); A1 dan A$1 → baris digeser hanya kalau relatif.
  return rumus.replace(/(\$?)([A-Z]{1,3})(\$?)(\d{1,7})/g, (utuh, dKol, kol, dBaris, baris) => {
    if (dBaris === '$') return utuh
    const b = Number(baris) + delta
    return b < 1 ? utuh : `${dKol}${kol}${dBaris}${b}`
  })
}

function alamatKeBaris(alamat: string): number | null {
  const m = /^\$?[A-Z]{1,3}\$?(\d{1,7})$/.exec(alamat.trim().toUpperCase())
  return m ? Number(m[1]) : null
}

function pilihLembar(wb: ExcelJS.Workbook): { ws: ExcelJS.Worksheet; barisHeader: number } {
  const lembar = wb.worksheets.slice(0, MAKS_LEMBAR)
  for (const ws of lembar) {
    if (ws.rowCount === 0 || ws.columnCount === 0) continue
    const batas = Math.min(ws.rowCount, BARIS_CARI_HEADER)
    for (let r = 1; r <= batas; r++) {
      for (let c = 1; c <= ws.columnCount; c++) {
        if (POLA_HEADER.test(bacaTeks(ws.getRow(r).getCell(c).value))) {
          return { ws, barisHeader: r }
        }
      }
    }
  }
  throw new BerkasDpaTidakDikenalError(
    'Tidak ditemukan baris header "KODE REKENING" di 40 baris pertama lembar mana pun. '
    + 'Pastikan berkas ini formulir DPA atau hasil unduhan PRIMA.',
  )
}

export async function bacaGridDpa(data: ArrayBuffer | Buffer): Promise<GridDpa> {
  const ExcelJSLib = (await import('exceljs')).default
  const wb = new ExcelJSLib.Workbook()
  await wb.xlsx.load(data as ArrayBuffer)

  const { ws, barisHeader } = pilihLembar(wb)
  const jumlahBaris = Math.min(ws.rowCount, MAKS_BARIS)
  const jumlahKolom = ws.columnCount

  // Rumus induk per sel, dipakai memperluas shared formula.
  const rumusInduk = new Map<string, string>()
  for (let r = 1; r <= jumlahBaris; r++) {
    for (let c = 1; c <= jumlahKolom; c++) {
      const v = ws.getRow(r).getCell(c).value as unknown as Record<string, unknown> | null
      if (v && typeof v === 'object' && typeof v.formula === 'string') {
        rumusInduk.set(`${r}:${c}`, v.formula)
      }
    }
  }

  const isi: SelGrid[][] = []
  for (let r = 1; r <= jumlahBaris; r++) {
    const barisIsi: SelGrid[] = []
    for (let c = 1; c <= jumlahKolom; c++) {
      const nilai = ws.getRow(r).getCell(c).value
      const o = (nilai && typeof nilai === 'object' ? nilai : null) as unknown as Record<string, unknown> | null
      let rumus: string | null = null
      if (o && typeof o.formula === 'string') {
        rumus = o.formula
      } else if (o && typeof o.sharedFormula === 'string') {
        const barisInduk = alamatKeBaris(o.sharedFormula)
        const induk = rumusInduk.get(`${barisInduk}:${c}`)
        if (induk && barisInduk != null) rumus = geserBaris(induk, r - barisInduk)
      }
      barisIsi.push({ teks: bacaTeks(nilai).trim(), angka: bacaAngka(nilai), rumus })
    }
    isi.push(barisIsi)
  }

  return {
    namaLembar: ws.name,
    barisHeader,
    jumlahBaris,
    jumlahKolom,
    sel: (baris, kolom) => isi[baris - 1]?.[kolom - 1] ?? SEL_KOSONG,
  }
}

// ─── Pembaca rumus ───────────────────────────────────────────────────────────

export interface RujukanSel { kolom: number; baris: number }

export function hurufKeKolom(huruf: string): number {
  let n = 0
  for (const ch of huruf.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n
}

const POLA_RUJUKAN = /\$?([A-Z]{1,3})\$?(\d{1,7})/g

function rujukan(teks: string): RujukanSel[] {
  const hasil: RujukanSel[] = []
  for (const m of teks.matchAll(POLA_RUJUKAN)) {
    hasil.push({ kolom: hurufKeKolom(m[1]), baris: Number(m[2]) })
  }
  return hasil
}

/**
 * Rumus PERKALIAN → daftar sel faktornya, urut kiri ke kanan.
 * `N19*R19` dua faktor · `N57*P57*R57` tiga · `ROUND(C7*E7,0)` unduhan sendiri.
 * Faktor terakhir = harga, sisanya = pengali volume (`1 x 12 bln` → vol 12).
 */
export function faktorPerkalian(rumus: string | null): RujukanSel[] | null {
  if (!rumus) return null
  const inti = /^ROUND\((.+),\s*-?\d+\)$/i.exec(rumus.trim())?.[1] ?? rumus.trim()
  if (!/^[^*]+(\*[^*]+)+$/.test(inti)) return null
  const bagian = inti.split('*').map(s => s.trim())
  const faktor: RujukanSel[] = []
  for (const b of bagian) {
    const r = rujukan(b)
    if (r.length !== 1 || !/^\$?[A-Z]{1,3}\$?\d{1,7}$/.test(b)) return null
    faktor.push(r[0])
  }
  return faktor.length >= 2 ? faktor : null
}

/**
 * Rumus AGREGASI → nomor baris anak-anaknya.
 * `SUM(F9:F12)` rentang · `F8+F15` terpencar · `S204` induk beranak tunggal
 * (dipakai formulir 2026 b.203 dan 2024 b.185).
 */
export function barisAnakDariRumus(rumus: string | null, kolomNilai: number): number[] | null {
  if (!rumus) return null
  const t = rumus.trim()
  if (faktorPerkalian(t)) return null

  const rentang = /^SUM\(\s*(\$?[A-Z]{1,3}\$?\d{1,7})\s*:\s*(\$?[A-Z]{1,3}\$?\d{1,7})\s*\)$/i.exec(t)
  if (rentang) {
    const a = alamatKeBaris(rentang[1])
    const b = alamatKeBaris(rentang[2])
    if (a == null || b == null) return null
    const hasil: number[] = []
    for (let n = Math.min(a, b); n <= Math.max(a, b); n++) hasil.push(n)
    return hasil
  }

  // Penjumlahan sel (boleh dibungkus SUM) — tolak kalau ada operator selain `+`.
  const isi = /^SUM\((.+)\)$/i.exec(t)?.[1] ?? t
  if (/[-/*^]/.test(isi)) return null
  const ruj = rujukan(isi)
  if (!ruj.length) return null
  if (ruj.some(r => r.kolom !== kolomNilai)) return null
  const jumlahOperand = isi.split('+').length
  if (jumlahOperand !== ruj.length) return null
  return ruj.map(r => r.baris)
}
