'use client'
// app/(dashboard)/perjanjian-kinerja/_context/PkYearContext.tsx
// Context tahun aktif untuk modul PK — share state antar tab via layout-level provider.
// Persist localStorage key 'prima_pk_year'. Hydration-safe: lazy initial = current year (SSR),
// sync dari localStorage di useEffect.

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

interface PkYearCtxValue {
  tahun: string
  setTahun: (t: string) => void
}

const PkYearCtx = createContext<PkYearCtxValue | null>(null)

const LS_KEY = 'prima_pk_year'

export function PkYearProvider({ children }: { children: ReactNode }) {
  const [tahun, setTahunState] = useState<string>(() => String(new Date().getFullYear()))

  useEffect(() => {
    // Post-mount sync dari localStorage (async-post cegah set-state-in-effect warning).
    Promise.resolve().then(() => {
      try {
        const stored = localStorage.getItem(LS_KEY)
        if (stored && /^\d{4}$/.test(stored)) setTahunState(stored)
      } catch {}
    })
  }, [])

  function setTahun(t: string) {
    setTahunState(t)
    try { localStorage.setItem(LS_KEY, t) } catch {}
  }

  return <PkYearCtx.Provider value={{ tahun, setTahun }}>{children}</PkYearCtx.Provider>
}

export function usePkYear(): PkYearCtxValue {
  const ctx = useContext(PkYearCtx)
  if (!ctx) throw new Error('usePkYear must be used within <PkYearProvider>')
  return ctx
}
