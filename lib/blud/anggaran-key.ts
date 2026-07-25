// lib/blud/anggaran-key.ts — identitas stabil baris anggaran lintas-versi.
// Konsep: docs/CONCEPT-blud-realisasi.md §2.3
//
// Realisasi menempel ke anggaran_key, BUKAN ke id/row_id: dpa_blud & pergeseran_dpa
// disimpan replace-all per versi (DELETE + INSERT) dan row_id dibuat ulang tiap versi,
// jadi tautan lewat id/row_id putus begitu versi baru disimpan.
//
// Key dibuat di SERVER saat baris lahir, lalu dibawa pulang-pergi oleh klien.
// Baris hasil salin versi & hasil inject membawa key asalnya — itu yang membuat
// pagu efektif (versi pergeseran terbaru) dan realisasi menunjuk jangkar yang sama.
import { randomUUID } from 'node:crypto'

export const ANGGARAN_KEY_PREFIX = 'AK-'

export function newAnggaranKey(): string {
  return ANGGARAN_KEY_PREFIX + randomUUID().replace(/-/g, '')
}

/** Pertahankan key yang sudah ada; buat baru hanya untuk baris yang memang baru lahir. */
export function ensureAnggaranKey(existing?: string | null): string {
  const v = String(existing ?? '').trim()
  return v || newAnggaranKey()
}
