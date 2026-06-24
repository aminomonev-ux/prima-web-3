import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// ─── Format helpers (PERF-W1) ────────────────────────────────────────────────
// Canonical single source of truth. Sebelumnya duplicated di 4 file dengan
// nuance berbeda (space char, behavior untuk 0). Konsolidasi: pakai Intl untuk
// rupiah (auto-locale handling), normalize non-breaking space ke regular space.

/** Rp 1.000.000 — Intl.NumberFormat dengan space normal (bukan \xa0 non-breaking). */
export function fmtRp(n: number | null | undefined): string {
  const v = n ?? 0;
  return new Intl.NumberFormat('id-ID', {
    style: 'currency', currency: 'IDR', maximumFractionDigits: 0,
  }).format(v).replace('\xa0', ' ');
}

/** "15 Mei 2026" atau "-" kalau string kosong. */
export function fmtTgl(d: string): string {
  return d ? new Date(d).toLocaleDateString('id-ID', {
    day: '2-digit', month: 'short', year: 'numeric',
  }) : '-';
}

/** Input-friendly: returns "" untuk 0 (supaya placeholder input bisa muncul). */
export function fmtNum(n: number | undefined | null): string {
  return n && n > 0 ? n.toLocaleString('id-ID') : '';
}

/** Display-friendly: returns "0" untuk 0 (supaya tabel/cell tidak blank). */
export function fmtNumDisplay(n: number | undefined | null): string {
  return n ? n.toLocaleString('id-ID') : '0';
}

/** "1.000.000" → 1000000. Robust ke any non-digit (titik, koma, spasi). */
export function parseNum(s: string): number {
  return parseInt(s.replace(/[^0-9]/g, '')) || 0;
}
