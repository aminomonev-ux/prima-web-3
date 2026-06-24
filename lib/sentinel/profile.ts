// lib/sentinel/profile.ts — preferensi onboarding RIMA (B4), localStorage per
// browser-per-user. Cap ≤2KB (anti-bloat §9c); semua akses try/catch (storage
// bisa diblokir/penuh) — best-effort, tidak boleh mengganggu chat.

const KEY = 'rima:profile'
const CAP = 2048

export interface RimaProfile {
  /** Sudah pernah onboarding (lewati tutorial / mulai tur kenal-prima). */
  onboarded?: boolean
  /** Versi fitur terakhir yang sudah dilihat user — lihat RIMA_WHATS_NEW.version. */
  seenVersion?: string
}

export function getProfile(): RimaProfile {
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return {}
    const p: unknown = JSON.parse(raw)
    return p && typeof p === 'object' ? (p as RimaProfile) : {}
  } catch { return {} }
}

export function patchProfile(patch: Partial<RimaProfile>): void {
  try {
    const json = JSON.stringify({ ...getProfile(), ...patch })
    if (json.length > CAP) return // membengkak tak wajar → abaikan
    window.localStorage.setItem(KEY, json)
  } catch { /* best-effort — preferensi boleh gagal disimpan diam-diam */ }
}
