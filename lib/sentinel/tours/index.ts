// lib/sentinel/tours/index.ts — kontrak + registry skrip tur RIMA F3 (CONCEPT §6).
// G2: skrip tur = data statis typed di repo — tanpa eval, tanpa instruksi dari
// server/DB. G1: tur tidak pernah meng-klik apa pun — murni menunjuk + menjelaskan.

export interface TourStep {
  /** Id anchor di lib/sentinel/anchors.ts. Elemen tidak ada di DOM → step di-skip. */
  anchor: string
  text: string
  /**
   * Latihan ringan: setelah step tampil, bot menunggu anchor ini MUNCUL di DOM
   * (mis. user membuka menu/modal) lalu auto-lanjut. Tidak pernah meng-klik (G1).
   */
  waitFor?: string
  /** Step menjelang aksi mutasi: bot berhenti menunjuk + nada hati-hati (§6b-1). */
  caution?: boolean
}

export interface TourScript {
  id: string
  title: string
  /** Pathname halaman tur (prefix match) — beda halaman → bot kasih link dulu. */
  page: string
  steps: TourStep[]
  closing: string
}

// Resume §6b-6 — progres per tur di localStorage (cap alami: 1 key kecil per tur)
const RESUME_PREFIX = 'rima:tour:'

export function savedTourStep(tourId: string): number | null {
  try {
    const raw = window.localStorage.getItem(RESUME_PREFIX + tourId)
    if (raw === null) return null
    const n = Number(raw)
    return Number.isInteger(n) && n > 0 ? n : null
  } catch { return null }
}

export function saveTourProgress(tourId: string, step: number): void {
  if (tourId.startsWith('locate:')) return
  try { window.localStorage.setItem(RESUME_PREFIX + tourId, String(step)) } catch { /* best-effort */ }
}

export function clearTourProgress(tourId: string): void {
  try { window.localStorage.removeItem(RESUME_PREFIX + tourId) } catch { /* best-effort */ }
}

import { dpaEndToEnd } from './dpa-end-to-end'
import { importUsulan } from './import-usulan'
import { pergeseranDasar } from './pergeseran-dasar'
import { kenalPrima } from './kenal-prima'
import { usulanBuatBaru } from './usulan-buat-baru'
import { bbaEntry } from './bba-entry'
import { kinerjaKeliling } from './kinerja-keliling'
import { pkKeliling } from './pk-keliling'
import { lkjipSusun } from './lkjip-susun'

export const TOUR_REGISTRY: Record<string, TourScript> = {
  [dpaEndToEnd.id]: dpaEndToEnd,
  [importUsulan.id]: importUsulan,
  [pergeseranDasar.id]: pergeseranDasar,
  [kenalPrima.id]: kenalPrima,
  [usulanBuatBaru.id]: usulanBuatBaru,
  [bbaEntry.id]: bbaEntry,
  [kinerjaKeliling.id]: kinerjaKeliling,
  [pkKeliling.id]: pkKeliling,
  [lkjipSusun.id]: lkjipSusun,
}
