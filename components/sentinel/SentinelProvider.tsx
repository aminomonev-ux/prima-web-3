'use client'

// components/sentinel/SentinelProvider.tsx — context ringan RIMA (F1).
// Dua context dipisah supaya host (dpa/pergeseran client) hanya pegang API stabil
// (identity tetap → nol re-render dari state bot), sedangkan SentinelBot pegang state.
// G16: feed readonly — provider TIDAK pernah menerima setter/callback mutasi form.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { confirmDialog } from '@/components/ui/ConfirmDialog'
import { evaluateSentinel } from '@/lib/sentinel/registry'
import { useFuzzyWorker } from '@/lib/sentinel/use-fuzzy-worker'
import { useSentinel } from '@/lib/sentinel/use-sentinel'
import type { DismissEntry } from '@/lib/sentinel/dismiss-store'
import type { NavSnapshot } from '@/lib/sentinel/nav'
import type {
  SentinelAckPayload, SentinelFeed, SentinelFinding, SentinelRow, SentinelScope,
} from '@/lib/sentinel/types'
import type { Role } from '@/types'
import SentinelBot from './SentinelBot'

export interface SentinelPreSaveResult {
  ok:  boolean
  ack: SentinelAckPayload | null
}

interface SentinelApi {
  publishFeed: (feed: SentinelFeed) => void
  clearFeed:   (scope: SentinelScope) => void
  preSave:     () => Promise<SentinelPreSaveResult>
}

export interface SentinelState {
  feed:       SentinelFeed | null
  /** Temuan setelah filter Abaikan, terurut critical → warning → info. */
  active:     SentinelFinding[]
  /** Temuan yang sedang ditekan oleh Abaikan (untuk tab "Diabaikan"). */
  suppressed: { finding: SentinelFinding; entry: DismissEntry }[]
  dismiss:    (finding: SentinelFinding) => void
  undismiss:  (key: string) => void
  jumpToRow:  (rowId: string) => void
  /** F4g preferensi user "Sembunyikan Rima" — sembunyikan UI bot (lewat panel). */
  hide:       () => void
}

const SentinelApiContext   = createContext<SentinelApi | null>(null)
const SentinelStateContext = createContext<SentinelState | null>(null)

const SEVERITY_ORDER = { critical: 0, warning: 1, info: 2 } as const

export default function SentinelProvider({ children, role = null, userName = null }: { children: React.ReactNode; role?: Role | null; userName?: string | null }) {
  const [feed, setFeed] = useState<SentinelFeed | null>(null)
  const { findings, dismissed, dismiss, undismiss } = useSentinel(feed)
  // Block C: fuzzy O(n²) untuk form raksasa (>1000 baris) dihitung di Web Worker
  // (anti-jank); ≤ cap = [] (sudah dihitung sinkron oleh rule). Di-merge ke bawah.
  const fuzzyFindings = useFuzzyWorker(feed)

  // F4g — kill switch global (SUPER_ADMIN via Admin Panel) + preferensi user.
  // Fail-safe (G6): fetch flag gagal → bot TETAP tampil (default online).
  // Pre-save gate & feed context tetap aktif walau UI bot disembunyikan —
  // proteksi entri ganda tidak ikut hilang hanya karena avatar disembunyikan.
  const [killed, setKilled] = useState(false)
  const [userHidden, setUserHidden] = useState(false)
  // F5b — navigasi sadar-akses (G18): status modul + akses user (read-only).
  const [appStatus, setAppStatus] = useState<Record<string, string>>({})
  const [userAccess, setUserAccess] = useState<string[] | null>(null)
  useEffect(() => {
    // queueMicrotask: hindari setState sync di effect body (react-hooks/set-state-in-effect)
    let hiddenPref = false
    try { hiddenPref = window.localStorage.getItem('rima:hidden') === '1' } catch { /* noop */ }
    if (hiddenPref) queueMicrotask(() => setUserHidden(true))
    let alive = true
    fetch('/api/admin/app-status')
      .then(r => r.json())
      .then(j => { if (alive && j?.ok && j.data) { setAppStatus(j.data); if (j.data.app_status_sentinel_bot === 'maintenance') setKilled(true) } })
      .catch(() => { /* G6 fail-safe: biarkan bot tampil */ })
    fetch('/api/user/access')
      .then(r => r.json())
      .then(j => { if (alive && j?.ok) setUserAccess(j.app_access ?? null) })
      .catch(() => { /* akses null = anggap penuh; route guard tetap menegakkan */ })
    return () => { alive = false }
  }, [])
  const hide = useCallback(() => {
    try { window.localStorage.setItem('rima:hidden', '1') } catch { /* noop */ }
    setUserHidden(true)
  }, [])
  const showAgain = useCallback(() => {
    try { window.localStorage.removeItem('rima:hidden') } catch { /* noop */ }
    setUserHidden(false)
  }, [])
  const hidden = killed || userHidden

  // Refs untuk preSave (dipanggil dari host saat Simpan — butuh nilai terkini
  // tanpa membuat preSave berganti identity)
  const feedRef      = useRef<SentinelFeed | null>(null)
  const dismissedRef = useRef<Map<string, DismissEntry>>(new Map())
  useEffect(() => { feedRef.current = feed }, [feed])
  useEffect(() => { dismissedRef.current = dismissed }, [dismissed])

  const publishFeed = useCallback((f: SentinelFeed) => setFeed(f), [])
  const clearFeed   = useCallback((scope: SentinelScope) => {
    setFeed(prev => (prev?.scope === scope ? null : prev))
  }, [])

  const jumpToRow = useCallback((rowId: string) => {
    const prefix = feedRef.current?.rowDomIdPrefix
    if (!prefix) return
    const el = document.getElementById(`${prefix}${rowId}`)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el.classList.remove('pj-sentinel-row-flash')
    // restart animation (force reflow) — pola use-sentinel-pj-guard.ts
    void (el as HTMLElement).offsetWidth
    el.classList.add('pj-sentinel-row-flash')
    window.setTimeout(() => el.classList.remove('pj-sentinel-row-flash'), 1700)
  }, [])

  // Pre-save gate (CONCEPT §4): evaluasi SINKRON dari rows terkini — tidak
  // bergantung hasil debounce 300 ms (anti-race "paste lalu langsung Simpan").
  const preSave = useCallback(async (): Promise<SentinelPreSaveResult> => {
    const f = feedRef.current
    if (!f) return { ok: true, ack: null }
    const result = evaluateSentinel(f.scope, f.rows)
    const dis    = dismissedRef.current
    const activeNow = result.filter(x => !x.dismissKey || !dis.has(x.dismissKey))

    const criticals = activeNow.filter(x => x.severity === 'critical')
    if (criticals.length > 0) {
      // Mirror validasi server (lapis 3) — pesan ramah, simpan diblokir
      toast.error(`RIMA: ${criticals.length} entri ganda PASTI terdeteksi — hapus dulu salah satunya, baru simpan.`)
      return { ok: false, ack: null }
    }

    const warns = activeNow.filter(x => x.severity === 'warning')
    if (warns.length > 0) {
      const lanjut = await confirmDialog({
        title:        'Peringatan RIMA',
        message:      `${warns.length} peringatan Sentinel belum dibereskan — tetap simpan?`,
        confirmLabel: 'Tetap Simpan',
        variant:      'warning',
      })
      if (!lanjut) return { ok: false, ack: null }
    }

    const suppressedNow = result.filter(x => x.dismissKey && dis.has(x.dismissKey))
    const ack: SentinelAckPayload | null =
      warns.length > 0 || suppressedNow.length > 0
        ? {
            dismissed:      suppressedNow.map(x => ({ rule: x.ruleId, label: x.message.slice(0, 200) })),
            active_warning: warns.length,
          }
        : null
    return { ok: true, ack }
  }, [])

  const api = useMemo<SentinelApi>(
    () => ({ publishFeed, clearFeed, preSave }),
    [publishFeed, clearFeed, preSave],
  )

  // F5b — snapshot navigasi sadar-akses untuk RimaChat (read-only, G16/G18)
  const navSnapshot = useMemo<NavSnapshot>(
    () => ({ role, access: userAccess, status: appStatus }),
    [role, userAccess, appStatus],
  )

  const state = useMemo<SentinelState>(() => {
    // Sinkron (rule) + worker fuzzy (Block C). >1000 baris: fuzzy hanya dari worker;
    // ≤ cap: fuzzyFindings = [] → tanpa dobel.
    const all = fuzzyFindings.length ? [...findings, ...fuzzyFindings] : findings
    const active = all
      .filter(f => !f.dismissKey || !dismissed.has(f.dismissKey))
      .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])
    const suppressed = all
      .filter(f => f.dismissKey && dismissed.has(f.dismissKey))
      .map(f => ({ finding: f, entry: dismissed.get(f.dismissKey!)! }))
    return { feed, active, suppressed, dismiss, undismiss, jumpToRow, hide }
  }, [feed, findings, fuzzyFindings, dismissed, dismiss, undismiss, jumpToRow, hide])

  return (
    <SentinelApiContext.Provider value={api}>
      <SentinelStateContext.Provider value={state}>
        {children}
        {/* F4g: kill switch global / preferensi user → bot UI tidak dirender;
            pre-save gate & feed context (di atas) tetap aktif (proteksi utuh). */}
        {!hidden && <SentinelBot navSnapshot={navSnapshot} userName={userName} />}
        {userHidden && !killed && (
          <button type="button" className="rima-restore" onClick={showAgain}
            data-tooltip="Tampilkan kembali asisten Rima" aria-label="Tampilkan kembali asisten Rima">
            🤖
          </button>
        )}
      </SentinelStateContext.Provider>
    </SentinelApiContext.Provider>
  )
}

/** Host (dpa-client/pergeseran-client) publish snapshot rows ke bot. */
export function useSentinelFeed(
  scope: SentinelScope,
  rows: readonly SentinelRow[],
  rowDomIdPrefix: string,
): void {
  const api = useContext(SentinelApiContext)
  useEffect(() => {
    api?.publishFeed({ scope, rows, rowDomIdPrefix })
  }, [api, scope, rows, rowDomIdPrefix])
  useEffect(() => {
    if (!api) return
    return () => api.clearFeed(scope)
  }, [api, scope])
}

const PRESAVE_NOOP = async (): Promise<SentinelPreSaveResult> => ({ ok: true, ack: null })

/** Gate Simpan host: blokir critical + konfirmasi warning + ack untuk audit (G8). */
export function useSentinelPreSave(): () => Promise<SentinelPreSaveResult> {
  const api = useContext(SentinelApiContext)
  return api?.preSave ?? PRESAVE_NOOP
}

export function useSentinelState(): SentinelState | null {
  return useContext(SentinelStateContext)
}
