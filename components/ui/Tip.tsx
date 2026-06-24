'use client'
// components/ui/Tip.tsx
// Tooltip portal reusable — bungkus elemen apa pun (tombol/icon) supaya tooltip
// TIDAK ke-clip ancestor overflow:auto (tabel/scroll-wrapper). Pakai .blud-tip-portal
// (theme-aware, di app/globals.css) — STANDAR TUNGGAL design system.
//
// Pakai untuk tombol di dalam scroll-wrapper. Untuk tombol di area non-scroll
// (toolbar/topbar/sidebar non-overflow) boleh pakai `data-tooltip` pseudo.
//
// <Tip label="Edit"><button onClick={..}>✏️</button></Tip>

import { useState, cloneElement, isValidElement } from 'react'
import type { ReactElement, MouseEvent } from 'react'
import { createPortal } from 'react-dom'

type ChildProps = {
  onMouseEnter?: (e: MouseEvent<HTMLElement>) => void
  onMouseLeave?: (e: MouseEvent<HTMLElement>) => void
}

export default function Tip({ label, children }: { label: string; children: ReactElement }) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  if (!isValidElement<ChildProps>(children)) return <>{children}</>
  const childProps = children.props

  function enter(e: MouseEvent<HTMLElement>) {
    const r = e.currentTarget.getBoundingClientRect()
    setPos({ top: r.top - 6, left: r.left + r.width / 2 })
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
        <div className="blud-tip-portal" style={{ position: 'fixed', top: pos.top, left: pos.left }}>
          {label}
        </div>,
        document.body,
      )}
    </>
  )
}
