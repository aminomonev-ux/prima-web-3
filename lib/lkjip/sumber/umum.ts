// lib/lkjip/sumber/umum.ts — bagian bersama para penghubung sumber tabel tertaut LKJIP.

import type { ApiResult } from '@/lib/shared/api';

export type AmbilJson = (url: string) => Promise<ApiResult<unknown>>;

/** Penarikan yang tidak bisa dilanjutkan; `message`-nya langsung ditampilkan ke orang. */
export class GagalTarik extends Error {
  constructor(message: string) { super(message); this.name = 'GagalTarik'; }
}

/**
 * Penarikan berjalan lewat endpoint modul sumber yang sudah ada, jadi pagar modul itu (akses,
 * sakelar maintenance) berlaku sendiri. Kalimatnya menyebut MODULNYA — "403" saja tidak
 * memberi tahu orang harus minta akses apa.
 */
export function pesanDitolak(modul: string, status: number | undefined, pesanAsli: string): string {
  if (status === 403) return `Butuh akses ${modul}. Minta aksesnya ke admin; tabel yang sudah tertaut tetap tercetak dari tarikan terakhir.`;
  if (status === 503) return `${modul} sedang dalam pemeliharaan, jadi datanya belum bisa ditarik. Coba lagi nanti.`;
  if (status === 401) return 'Sesi Anda sudah berakhir. Masuk lagi, lalu ulangi.';
  return `Gagal menarik data ${modul}: ${pesanAsli}`;
}

export function angkaDalam(v: unknown, min: number, maks: number, cadangan: number): number {
  const n = Number(v);
  return Number.isInteger(n) && n >= min && n <= maks ? n : cadangan;
}
