// lib/blud/format.ts

/** Format angka ke rupiah Indonesia: 7139062000 → "7.139.062.000" */
export function formatRupiah(value: number | null | undefined): string {
  if (value == null) return '-'
  return value.toLocaleString('id-ID')
}

/** Hitung jumlah: vol × harga, null-safe */
export function hitungJumlah(vol: number | null, harga: number | null): number {
  if (vol == null || harga == null) return 0
  return Math.round(vol * harga)
}

/** Generate row ID unik. O4: pakai crypto.randomUUID() yang collision-free
 *  (vs Math.random 5-char yang bisa collision pada bulk paste >1000 rows). */
// Tipe label mapping — shared antara dpa-client + pergeseran-client + BlockedModal.
// Sebelumnya di-duplicate di 2 file (L22 violation), sekarang sentral di sini.
// Format: 'Level N' / 'Level N.1' sesuai chain hierarchy strict L1→L8.1.
import type { TipeBaris as _TipeBaris } from '@/types'

export const TIPE_LABEL: Record<_TipeBaris, string> = {
  GRANDMASTER:          'Level 1',
  MASTER:               'Level 2',
  CHILD:                'Level 2.1',
  LEADER:               'Level 3',
  MEMBER:               'Level 3.1',
  'PLETON-LEADER':      'Level 4',
  'PLETON-MEMBER':      'Level 4.1',
  'KETUA-KELOMPOK-A':   'Level 5',
  'ANGGOTA-KELOMPOK-A': 'Level 5.1',
  'KETUA-KELOMPOK-B':   'Level 6',
  'ANGGOTA-KELOMPOK-B': 'Level 6.1',
  'L7-HEAD':            'Level 7',
  'L7-SUB':             'Level 7.1',
  'L8-HEAD':            'Level 8',
  'L8-SUB':             'Level 8.1',
}

export function genRowId(): string {
  return `row_${crypto.randomUUID()}`;
}
