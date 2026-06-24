'use client'

// components/sentinel/RimaTour.tsx — engine tur terbang RIMA F3 (CONCEPT §6/§6b).
// Bot terbang ke sisi elemen ber-`data-rima`, menunjuk, spotlight 4 panel
// (tanpa clip-path), bubble step + [◀ Kembali][Lanjut ▶][✕ Stop] + progress.
// G1: TIDAK PERNAH meng-klik apa pun — murni menunjuk + menjelaskan; waitFor
// hanya MENGAMATI kemunculan anchor (user yang beraksi) lalu auto-lanjut.
// Resilien: anchor tidak ada → step di-skip; scroll/resize → posisi dihitung
// ulang. Resume: progres per tur di localStorage rima:tour:<id> (§6b-6).
// K4: dialog + ESC stop + aria-live; K5: mobile bot diam, bubble bottom-sheet.

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { clearTourProgress, saveTourProgress, type TourScript } from '@/lib/sentinel/tours'
import RimaAvatar from './RimaAvatar'

const PAD = 8
const BOT_W = 76

export interface RimaTourResult {
  completed: boolean
}

interface Props {
  tour: TourScript
  initialStep: number
  onClose: (result: RimaTourResult) => void
}

function anchorEl(anchor: string): HTMLElement | null {
  // R2/G28: anchor id selalu dari registri statis; validasi allowlist sebagai
  // defense-in-depth (fase v3 bisa perkenalkan id turunan-data) — tolak karakter
  // yang bisa membobol attribute-selector (mis. `"]`).
  if (!/^[a-z0-9._:-]+$/i.test(anchor)) return null
  return document.querySelector<HTMLElement>(`[data-rima="${anchor}"]`)
}

export default function RimaTour({ tour, initialStep, onClose }: Props) {
  const [stepIdx, setStepIdx] = useState(-1)
  const [closingMode, setClosingMode] = useState(false)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const [skippedNote, setSkippedNote] = useState(false)
  const stepIdxRef = useRef(stepIdx)
  useEffect(() => { stepIdxRef.current = stepIdx }, [stepIdx])

  const step = stepIdx >= 0 && stepIdx < tour.steps.length ? tour.steps[stepIdx] : null

  const measure = useCallback((): void => {
    const cur = stepIdxRef.current
    const s = cur >= 0 ? tour.steps[cur] : null
    if (!s) { setRect(null); return }
    const el = anchorEl(s.anchor)
    setRect(el ? el.getBoundingClientRect() : null)
  }, [tour])

  // Cari step berikut yang anchor-nya ADA di DOM (skip-by-absence, arah ±1)
  const goTo = useCallback((from: number, dir: 1 | -1): void => {
    let skipped = false
    for (let i = from; i >= 0 && i < tour.steps.length; i += dir) {
      const el = anchorEl(tour.steps[i].anchor)
      if (el) {
        setSkippedNote(skipped)
        setStepIdx(i)
        setClosingMode(false)
        saveTourProgress(tour.id, i)
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
        el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' })
        // ukur setelah scroll sempat jalan — lalu listener scroll meneruskan
        window.setTimeout(() => {
          setRect(anchorEl(tour.steps[i].anchor)?.getBoundingClientRect() ?? null)
        }, reduce ? 0 : 350)
        return
      }
      skipped = true
    }
    if (dir === 1) { setClosingMode(true); setRect(null) }
  }, [tour])

  // queueMicrotask: hindari setState sync di effect body — pola use-sentinel-swap.ts B-2
  useEffect(() => { queueMicrotask(() => goTo(initialStep, 1)) }, [goTo, initialStep])

  // Posisi ulang saat scroll/resize (pasif) + interval ringan utk layout shift
  useEffect(() => {
    const onMove = () => measure()
    window.addEventListener('scroll', onMove, { passive: true, capture: true })
    window.addEventListener('resize', onMove, { passive: true })
    const iv = window.setInterval(measure, 800)
    return () => {
      window.removeEventListener('scroll', onMove, { capture: true })
      window.removeEventListener('resize', onMove)
      window.clearInterval(iv)
    }
  }, [measure])

  // waitFor (Latihan ringan): anchor target muncul → auto-lanjut. Tidak menggate
  // tombol Lanjut — user tetap bisa maju manual kapan pun.
  useEffect(() => {
    if (!step?.waitFor || closingMode) return
    const target = step.waitFor
    const iv = window.setInterval(() => {
      if (anchorEl(target)) goTo(stepIdxRef.current + 1, 1)
    }, 500)
    return () => window.clearInterval(iv)
  }, [step, closingMode, goTo])

  const stop = useCallback((completed: boolean): void => {
    if (completed) clearTourProgress(tour.id)
    onClose({ completed })
  }, [onClose, tour.id])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') stop(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [stop])

  if (typeof document === 'undefined') return null

  const vw = window.innerWidth
  const vh = window.innerHeight
  const isLast = stepIdx >= tour.steps.length - 1

  // Elemen raksasa (grid/tabel > viewport) → pakai irisan rect∩viewport supaya
  // bot/bubble/spotlight tetap terlihat (bug tur kenal-prima 3/3: bubble
  // terlempar di atas viewport, spotlight nol, bot tampak nyangkut)
  const v = rect
    ? {
        top:    Math.max(rect.top, 0),
        bottom: Math.min(rect.bottom, vh),
        left:   Math.max(rect.left, 0),
        right:  Math.min(rect.right, vw),
      }
    : null

  // Bot di sisi kiri/kanan target sesuai ruang; caution → berhenti menunjuk (§6b-1)
  let botStyle: React.CSSProperties | null = null
  let gesture: 'point-left' | 'point-right' | 'point-up' | 'idle' = 'idle'
  if (v && !closingMode) {
    const onLeft = v.left >= BOT_W + 24
    const x = onLeft ? v.left - BOT_W - 14 : Math.min(v.right + 14, vw - BOT_W - 8)
    const y = Math.min(Math.max((v.top + v.bottom) / 2 - 46, 8), vh - 110)
    botStyle = { left: x, top: y }
    // A2: arah telunjuk ikut posisi bot relatif anchor — bila ruang vertikal mepet
    // bot terdorong di bawah anchor → menunjuk ke atas; selain itu kiri/kanan.
    if (!step?.caution) gesture = y + 46 > v.bottom + 8 ? 'point-up' : onLeft ? 'point-right' : 'point-left'
  }

  // Bubble dekat target: bawah → atas → fallback tengah-bawah (target sepenuh layar)
  let bubbleStyle: React.CSSProperties = { left: '50%', bottom: 24, transform: 'translateX(-50%)' }
  if (v && !closingMode) {
    const bubbleLeft = Math.min(Math.max(v.left, 12), vw - 332)
    if (vh - v.bottom >= 190) bubbleStyle = { left: bubbleLeft, top: v.bottom + 14 }
    else if (v.top >= 190)    bubbleStyle = { left: bubbleLeft, bottom: vh - v.top + 14 }
  }

  const spot = v && !closingMode
    ? {
        top:    { left: 0, top: 0, width: vw, height: Math.max(v.top - PAD, 0) },
        left:   { left: 0, top: v.top - PAD, width: Math.max(v.left - PAD, 0), height: v.bottom - v.top + PAD * 2 },
        right:  { left: v.right + PAD, top: v.top - PAD, width: Math.max(vw - v.right - PAD, 0), height: v.bottom - v.top + PAD * 2 },
        bottom: { left: 0, top: v.bottom + PAD, width: vw, height: Math.max(vh - v.bottom - PAD, 0) },
      }
    : null

  return createPortal(
    <div className="rima-tour" role="dialog" aria-label={`Tur RIMA — ${tour.title}`}>
      {spot && Object.entries(spot).map(([k, s]) => (
        <div key={k} className="rima-spot" style={s} />
      ))}

      {botStyle && (
        <div className="rima-tour-bot" style={botStyle}>
          <RimaAvatar state="ok" gesture={gesture} talking size={62} />
        </div>
      )}

      <div className={`rima-tour-bubble${step?.caution && !closingMode ? ' caution' : ''}`} style={bubbleStyle}>
        <div className="rima-tour-head">
          <span className="rima-tour-title">{tour.title}</span>
          {!closingMode && <span className="rima-tour-progress">{stepIdx + 1}/{tour.steps.length}</span>}
        </div>
        <div className="rima-tour-text" aria-live="polite">
          {closingMode ? tour.closing : step?.text}
          {!closingMode && skippedNote && (
            <span className="rima-tour-note"> (beberapa langkah dilewati — tidak tersedia di tampilanmu)</span>
          )}
          {!closingMode && step && !rect && (
            <span className="rima-tour-note"> Elemennya sedang tidak terlihat — ikuti petunjuk di atas untuk membukanya, atau lanjut saja.</span>
          )}
        </div>
        <div className="rima-tour-controls">
          {!closingMode && stepIdx > 0 && (
            <button type="button" className="rima-chip ghost" onClick={() => goTo(stepIdx - 1, -1)}>◀ Kembali</button>
          )}
          {!closingMode && (
            <button type="button" className="rima-chip" onClick={() => (isLast ? (setClosingMode(true), setRect(null)) : goTo(stepIdx + 1, 1))}>
              {isLast ? 'Selesai ▶' : 'Lanjut ▶'}
            </button>
          )}
          {closingMode && (
            <button type="button" className="rima-chip" onClick={() => stop(true)}>Selesai ✓</button>
          )}
          <button type="button" className="rima-chip ghost" onClick={() => stop(closingMode)}>✕ Stop</button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
