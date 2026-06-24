// lib/sentinel/use-fuzzy-worker.ts — Block C: offload scan fuzzy ke Web Worker saat
// baris > FUZZY_SYNC_MAX (anti-jank, CONCEPT §9c). Worker dibuat lazy & di-terminate
// 30 dtk idle (tak ada thread nganggur makan RAM). reqId guard buang hasil basi.
// Worker tak tersedia (SSR/browser lawas) atau gagal dibuat → fallback SINKRON.
// Pola debounce 300 ms + queueMicrotask = use-sentinel.ts.
import { useEffect, useRef, useState } from 'react'
import { findFuzzyDupPairs } from './fuzzy'
import { FUZZY_SYNC_MAX, fuzzyLeafInput, pairsToFindings } from './rules/dup-fuzzy'
import type { FuzzyRes } from './fuzzy.worker'
import type { SentinelFeed, SentinelFinding } from './types'

const FUZZY_SCOPES = new Set<SentinelFeed['scope']>(['blud/dpa', 'blud/pergeseran'])
const WORKER_IDLE_MS = 30_000

export function useFuzzyWorker(feed: SentinelFeed | null): SentinelFinding[] {
  const [findings, setFindings] = useState<SentinelFinding[]>([])
  const workerRef = useRef<Worker | null>(null)
  const idleRef   = useRef<number | null>(null)
  const reqRef    = useRef(0)

  useEffect(() => {
    const rows = feed?.rows
    const heavy = !!feed && FUZZY_SCOPES.has(feed.scope) && !!rows && rows.length > FUZZY_SYNC_MAX
    if (!heavy) {
      // queueMicrotask: hindari setState sync di effect body — pola use-sentinel.ts
      queueMicrotask(() => setFindings(prev => (prev.length === 0 ? prev : [])))
      return
    }
    const input = fuzzyLeafInput(rows)
    const reqId = ++reqRef.current
    let cancelled = false

    const armIdleTerminate = () => {
      if (idleRef.current) window.clearTimeout(idleRef.current)
      idleRef.current = window.setTimeout(() => {
        workerRef.current?.terminate()
        workerRef.current = null
      }, WORKER_IDLE_MS)
    }
    const runSync = () => {
      const pairs = findFuzzyDupPairs(input)
      if (!cancelled) setFindings(pairsToFindings(pairs, rows))
    }

    const timer = window.setTimeout(() => {
      if (typeof Worker === 'undefined') { runSync(); return }
      try {
        if (!workerRef.current) {
          workerRef.current = new Worker(new URL('./fuzzy.worker.ts', import.meta.url), { type: 'module' })
        }
        const w = workerRef.current
        const onMsg = (e: MessageEvent<FuzzyRes>) => {
          if (e.data.reqId !== reqRef.current) return // hasil basi
          w.removeEventListener('message', onMsg)
          if (!cancelled) setFindings(pairsToFindings(e.data.pairs, rows))
          armIdleTerminate()
        }
        w.addEventListener('message', onMsg)
        w.postMessage({ reqId, rows: input })
      } catch {
        runSync() // gagal buat worker → sinkron
      }
    }, 300)

    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [feed])

  // Unmount: bersihkan worker + timer idle
  useEffect(() => () => {
    if (idleRef.current) window.clearTimeout(idleRef.current)
    workerRef.current?.terminate()
    workerRef.current = null
  }, [])

  return findings
}
