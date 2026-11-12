// lib/pk/nominal-blud.ts — penolong MURNI dialog "Ambil nominal BLUD" Form PK.
// Konsep: docs/CONCEPT-pk-nominal-blud-langsung.md.

export type SumberBlud = 'dpa' | 'pergeseran';

export interface VersiBlud {
  sumber: SumberBlud;
  versi: string;
  jumlah_baris: number;
  /** "Pergeseran ke-3 · ditutup …", "PERUBAHAN KE-1" — lencana yang sama dengan layar Cetak. */
  catatan: string;
  /** Versi yang sedang menentukan pagu tahun itu. */
  berlaku: boolean;
}

export const NAMA_SUMBER_BLUD: Record<SumberBlud, string> = { dpa: 'DPA', pergeseran: 'Pergeseran' };

const tglId = (v: string) => v.split('-').reverse().join('-');

/** Teks sumber di petunjuk form — versi yang dipakai harus terbaca sesudah dialog tertutup. */
export function kalimatSumberBlud(sumber: SumberBlud, versi: string, perubahanKe: number | null): string {
  return `${NAMA_SUMBER_BLUD[sumber]} ${tglId(versi)}${perubahanKe ? ` · Perubahan ke-${perubahanKe}` : ''}`;
}

/** Pilihan awal = versi yang sedang jadi pagu; tanpa itu yang pertama di daftar (terbaru). */
export function versiAwal(daftar: readonly VersiBlud[]): VersiBlud | null {
  return daftar.find(v => v.berlaku) ?? daftar[0] ?? null;
}

export function labelVersiBlud(v: VersiBlud): string {
  return `${tglId(v.versi)} (${v.jumlah_baris} baris)${v.catatan ? ` · ${v.catatan}` : ''}${v.berlaku ? ' · BERLAKU' : ''}`;
}
