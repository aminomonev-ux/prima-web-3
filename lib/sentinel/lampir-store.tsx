'use client'

// lib/sentinel/lampir-store.tsx — RAM store "Lampirkan-di-chat" Rima (CONCEPT §23,
// Opsi A). Menyimpan HASIL PARSE lampiran (bukan file mentah) di memori React saja
// supaya bertahan saat user pindah halaman SPA (chat → modul tujuan). TIDAK pakai
// localStorage/sessionStorage → tak terlihat di DevTools, hilang saat refresh/tab
// ditutup. File mentah sudah dibuang di server (/api/rima/lampir). Konsumsi sekali
// (take) → ephemeral. Provider dipasang di atas SentinelProvider (RimaChat) DAN
// children (modul tujuan) di app/(dashboard)/layout.tsx.

import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import type { ParsedPendMonth } from '@/lib/data/kinerja-import'

export interface LampirMatchRow {
  keterangan: string; realisasi: number; bulan_ke: number; source: string
  ssk_canonical_id: string | null; ssk_keterangan: string | null; sumber: string | null
  score: number; status: 'match' | 'mirip' | 'none'
}
export interface LampirRealisasiData {
  tahun: string; months: number[]; total: number; targetCount: number
  bySumber: Record<string, LampirMatchRow[]>; warnings: string[]
}
export interface LampirPendapatanData {
  months: ParsedPendMonth[]; warnings: string[]
}

export type LampirStash =
  | { kind: 'realisasi'; fileName: string; tahun: string; ts: number; data: LampirRealisasiData }
  | { kind: 'pendapatan'; fileName: string; tahun: string; ts: number; data: LampirPendapatanData }

interface LampirApi {
  /** Nilai terkini (reaktif) — untuk peek tanpa mengkonsumsi. */
  stash: LampirStash | null
  /** Simpan hasil parse lampiran (dipanggil RimaChat setelah upload sukses). */
  set: (s: LampirStash) => void
  /** Ambil + bersihkan (konsumsi sekali oleh modul tujuan). */
  take: () => LampirStash | null
  clear: () => void
}

const Ctx = createContext<LampirApi | null>(null)

export function LampirProvider({ children }: { children: React.ReactNode }) {
  const [stash, setStash] = useState<LampirStash | null>(null)
  const ref = useRef<LampirStash | null>(null)

  const set = useCallback((s: LampirStash) => { ref.current = s; setStash(s) }, [])
  const clear = useCallback(() => { ref.current = null; setStash(null) }, [])
  const take = useCallback((): LampirStash | null => {
    const cur = ref.current
    ref.current = null
    setStash(null)
    return cur
  }, [])

  const api = useMemo<LampirApi>(() => ({ stash, set, take, clear }), [stash, set, take, clear])
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>
}

/** null-safe: di luar provider (mis. halaman non-dashboard) → no-op. */
export function useLampir(): LampirApi {
  return useContext(Ctx) ?? NOOP
}

const NOOP: LampirApi = { stash: null, set: () => {}, take: () => null, clear: () => {} }
