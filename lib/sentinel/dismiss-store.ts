// lib/sentinel/dismiss-store.ts — memori [Abaikan] RIMA di localStorage.
// Ring-buffer LRU per CONCEPT-sentinel-bot.md §9c: cap 200 entri + TTL 30 hari,
// penuh → entri lastUsed TERTUA keluar satu-satu (gradual, tidak pernah nuke).
// Namespace: rima:dismiss:<scope>. Nol penyimpanan server/DB.

export interface DismissEntry {
  /** dismissKey temuan (stabil per pasangan row). */
  k:     string
  rule:  string
  label: string
  /** lastUsed epoch ms — basis LRU + TTL. */
  t:     number
}

const CAP    = 200
const TTL_MS = 30 * 24 * 60 * 60 * 1000

const storageKey = (scope: string) => `rima:dismiss:${scope}`

function read(scope: string): DismissEntry[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(storageKey(scope))
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    const now = Date.now()
    return parsed.filter((e): e is DismissEntry =>
      !!e && typeof e === 'object'
      && typeof (e as DismissEntry).k === 'string'
      && typeof (e as DismissEntry).t === 'number'
      && now - (e as DismissEntry).t < TTL_MS)
  } catch {
    return []
  }
}

function write(scope: string, entries: DismissEntry[]): void {
  if (typeof window === 'undefined') return
  try {
    let next = entries
    if (next.length > CAP) {
      next = [...next].sort((a, b) => a.t - b.t).slice(next.length - CAP)
    }
    window.localStorage.setItem(storageKey(scope), JSON.stringify(next))
  } catch {
    /* storage penuh/disabled → degradasi anggun: Abaikan hanya bertahan sesi ini */
  }
}

/** Sweep TTL terjadi alami di read() — dipanggil sekali saat init scope. */
export function loadDismissed(scope: string): DismissEntry[] {
  return read(scope)
}

export function addDismiss(scope: string, entry: Omit<DismissEntry, 't'>): DismissEntry[] {
  const entries = read(scope).filter(e => e.k !== entry.k)
  entries.push({ ...entry, t: Date.now() })
  write(scope, entries)
  return read(scope)
}

export function removeDismiss(scope: string, key: string): DismissEntry[] {
  const entries = read(scope).filter(e => e.k !== key)
  write(scope, entries)
  return entries
}

/** Refresh lastUsed entri yang masih menekan temuan aktif (LRU tetap akurat). */
export function touchDismissed(scope: string, activeKeys: ReadonlySet<string>): void {
  if (activeKeys.size === 0) return
  const entries = read(scope)
  const now = Date.now()
  let changed = false
  for (const e of entries) {
    // throttle tulis: hanya kalau lastUsed > 1 hari, biar tidak write tiap evaluasi
    if (activeKeys.has(e.k) && now - e.t > 24 * 60 * 60 * 1000) {
      e.t = now
      changed = true
    }
  }
  if (changed) write(scope, entries)
}
