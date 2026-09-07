'use client'
// components/ui/Tip.tsx
// Tooltip portal reusable — bungkus elemen apa pun (tombol/icon) supaya tooltip
// TIDAK ke-clip ancestor overflow:auto (tabel/scroll-wrapper). Pakai .blud-tip-portal
// (theme-aware, di app/globals.css) — STANDAR TUNGGAL design system.
//
// Pakai untuk tombol di dalam scroll-wrapper. Untuk tombol di area non-scroll
// (toolbar/topbar/sidebar non-overflow) boleh pakai `data-tooltip` pseudo.
//
// Lolos dari clip ancestor TIDAK berarti lolos dari tepi LAYAR: tombol aksi
// tabel hidup di kolom `position: sticky; right: 0`, jadi tooltip yang selalu
// dipusatkan di atasnya separuhnya jatuh di luar jendela. Geometrinya di
// `lib/shared/tip-posisi.ts` (PURE, bisa diuji perilakunya).
//
// <Tip label="Edit"><button onClick={..}>✏️</button></Tip>

import { useState, cloneElement, isValidElement } from 'react'
import type { CSSProperties, ReactElement, MouseEvent } from 'react'
import { createPortal } from 'react-dom'
import { letakTip, type LetakTip } from '@/lib/shared/tip-posisi'

type ChildProps = {
  onMouseEnter?: (e: MouseEvent<HTMLElement>) => void
  onMouseLeave?: (e: MouseEvent<HTMLElement>) => void
}

export default function Tip({ label, children }: { label: string; children: ReactElement }) {
  const [pos, setPos] = useState<LetakTip | null>(null)

  if (!isValidElement<ChildProps>(children)) return <>{children}</>
  const childProps = children.props

  function enter(e: MouseEvent<HTMLElement>) {
    setPos(letakTip(e.currentTarget.getBoundingClientRect(), window.innerWidth))
    childProps.onMouseEnter?.(e)
  }
  function leave(e: MouseEvent<HTMLElement>) {
    setPos(null)
    childProps.onMouseLeave?.(e)
  }

  const child = cloneElement(children, { onMouseEnter: enter, onMouseLeave: leave } as ChildProps)

  return (
    <>
      {child}
      {label && pos && typeof window !== 'undefined' && createPortal(
        <div className="blud-tip-portal" style={{
          position: 'fixed', top: pos.top, left: pos.left,
          '--tip-tx': pos.tx, '--tip-maks': `${pos.lebar}px`,
        } as CSSProperties}>
          {label}
        </div>,
        document.body,
      )}
    </>
  )
}
