// lib/shared/excel-sel.ts — membaca sel exceljs tanpa kehilangan hasil rumus bernilai 0.
// Hanya TIPE exceljs yang diimpor, jadi aman dipakai komponen klien (impor Master Akun,
// Matriks Bulanan Renaksi) maupun parser server.
import type ExcelJS from 'exceljs'

/**
 * `cell.value` exceljs MEMBUANG hasil rumus yang bernilai 0 — getter-nya menyalin model
 * lewat `if (value)` — padahal berkasnya menyimpan `<v>0</v>` dan `cell.result` masih
 * memegangnya (exceljs 4.4.0, diuji). Pembaca yang bertanya `'result' in o` lalu jatuh
 * ke objek rumusnya: terbaca kosong, atau "[object Object]" bila langsung di-`String()`.
 * Ketahuan pertama di impor DPA (2026-10-02); 10 pembaca lain masih memakai `cell.value`
 * mentah sampai 2026-10-09. Pembaca Excel BARU wajib lewat sini.
 */
export function nilaiSelExcel(sel: ExcelJS.Cell): ExcelJS.CellValue {
  const v = sel.value
  if (!v || typeof v !== 'object' || 'result' in v) return v
  if (!('formula' in v) && !('sharedFormula' in v)) return v
  const hasil = sel.result
  return hasil === undefined ? v : ({ ...v, result: hasil } as ExcelJS.CellValue)
}

export type NilaiPolos = string | number | boolean | Date | null

/**
 * Nilai POLOS sebuah sel: hasil rumus (termasuk 0), teks richText digabung, teks
 * hyperlink. Rumus tanpa hasil tersimpan dan sel galat (`#N/A`) → null, BUKAN objeknya —
 * objek yang di-`String()` jadi "[object Object]" di kolom kode/uraian.
 */
export function polosSelExcel(sel: ExcelJS.Cell): NilaiPolos {
  return polos(nilaiSelExcel(sel))
}

function polos(v: unknown): NilaiPolos {
  if (v == null) return null
  if (typeof v !== 'object' || v instanceof Date) return v as NilaiPolos
  const o = v as Record<string, unknown>
  if ('result' in o) return polos(o.result)
  if (Array.isArray(o.richText)) return (o.richText as { text?: string }[]).map(t => t.text ?? '').join('')
  if ('text' in o) return polos(o.text)
  return null
}
