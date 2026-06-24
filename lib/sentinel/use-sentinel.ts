// lib/sentinel/use-sentinel.ts — hook evaluasi RIMA: debounce 300 ms + memo
// per hash rows (CONCEPT §2) + memori Abaikan (dismiss-store §9c).
// Pola file hook lib existing: use-sentinel-pj-guard.ts (tanpa 'use client').

import { useCallback, useEffect, useRef, useState } from 'react'
import { addDismiss, loadDismissed, removeDismiss, touchDismissed, type DismissEntry } from './dismiss-store'
import { evaluateSentinel } from './registry'
import type { SentinelFeed, SentinelFinding } from './types'

// djb2 — cukup untuk memo "rows berubah?", bukan kriptografi
function hashRows(rows: SentinelFeed['rows']): string {
  let h = 5381
  for (const r of rows) {
    const s = `${r.row_id}|${r.parent_id}|${r.uraian}|${r.satuan ?? ''}|${r.harga ?? ''}|${r.vol ?? ''}|${r.penanggung_jawab ?? ''}|${r.usulan_item_id ?? ''};`
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  }
  return `${rows.length}:${h}`
}

export interface UseSentinelReturn {
  /** Semua temuan hasil evaluasi terakhir (termasuk yang sedang diabaikan). */
  findings:  SentinelFinding[]
  /** dismissKey → entri Abaikan aktif untuk scope sekarang. */
  dismissed: Map<string, DismissEntry>
  dismiss:   (finding: SentinelFinding) => void
  undismiss: (key: string) => void
}

export function useSentinel(feed: SentinelFeed | null): UseSentinelReturn {
  const [findings, setFindings]   = useState<SentinelFinding[]>([])
  const [dismissed, setDismissed] = useState<Map<string, DismissEntry>>(new Map())
  const lastHashRef = useRef('')
  const scope = feed?.scope ?? null

  useEffect(() => {
    // queueMicrotask: hindari setState sync di effect body (react-hooks/set-state-in-effect)
    // — pola use-sentinel-swap.ts B-2
    if (!scope) {
      queueMicrotask(() => setDismissed(prev => (prev.size === 0 ? prev : new Map())))
      return
    }
    queueMicrotask(() => setDismissed(new Map(loadDismissed(scope).map(e => [e.k, e]))))
  }, [scope])

  useEffect(() => {
    if (!feed) {
      lastHashRef.current = ''
      queueMicrotask(() => setFindings(prev => (prev.length === 0 ? prev : [])))
      return
    }
    const timer = window.setTimeout(() => {
      const h = hashRows(feed.rows)
      if (h === lastHashRef.current) return
      lastHashRef.current = h
      const result = evaluateSentinel(feed.scope, feed.rows)
      setFindings(result)
      touchDismissed(feed.scope, new Set(result.map(f => f.dismissKey).filter((k): k is string => !!k)))
    }, 300)
    return () => window.clearTimeout(timer)
  }, [feed])

  const scopeRef = useRef(scope)
  useEffect(() => { scopeRef.current = scope }, [scope])

  const dismiss = useCallback((finding: SentinelFinding) => {
    const s = scopeRef.current
    if (!s || !finding.dismissKey) return
    const entries = addDismiss(s, {
      k:     finding.dismissKey,
      rule:  finding.ruleId,
      label: finding.message.slice(0, 200),
    })
    setDismissed(new Map(entries.map(e => [e.k, e])))
  }, [])

  const undismiss = useCallback((key: string) => {
    const s = scopeRef.current
    if (!s) return
    const entries = removeDismiss(s, key)
    setDismissed(new Map(entries.map(e => [e.k, e])))
  }, [])

  return { findings, dismissed, dismiss, undismiss }
}
