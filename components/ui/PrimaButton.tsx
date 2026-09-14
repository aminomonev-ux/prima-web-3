'use client'
// components/ui/PrimaButton.tsx
// Primary toolbar button untuk PRIMA — Concept 4 "Sci-Fi Engraved" adapted ke design token.
// Chamfered corners (clip-path) + 1px hairline border + 3px left accent stripe per variant.
// Reference: docs/design/DESIGN-SYSTEM.md section "PrimaButton".
//
// JANGAN dipakai untuk row action button kecil (🗑, edit inline) — itu tetap pakai
// inline button atau shadcn icon button. PrimaButton hanya untuk PRIMARY TOOLBAR.

import type { ReactNode, ButtonHTMLAttributes } from 'react'
import { useKunciTulis } from './KunciTulis'

export type PrimaVariant = 'primary' | 'success' | 'danger' | 'purple' | 'warning' | 'ghost'
export type PrimaSize    = 'sm' | 'md' | 'lg'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?:   PrimaVariant
  size?:      PrimaSize
  iconLeft?:  ReactNode
  iconRight?: ReactNode
  /**
   * Tombol ini MENULIS ke server (Simpan, Kirim, Finalisasi). Saat modulnya dibekukan ia
   * mati dengan tooltip sebabnya (Fase F Tahap 14b, K1=C). Pagarnya tetap di API (L82).
   */
  menulis?:   boolean
}

export default function PrimaButton({
  variant = 'ghost',
  size    = 'md',
  iconLeft,
  iconRight,
  children,
  className,
  menulis,
  onClick,
  ...rest
}: Props) {
  const { dikunci, sebab } = useKunciTulis()
  // `aria-disabled`, BUKAN `disabled`: `.btn-prima:disabled` ber-opacity .45 dan opacity
  // ikut memudarkan tooltip `::after`-nya, sedangkan tombol `disabled` juga tak bisa
  // difokus keyboard — sebabnya jadi tak terbaca persis saat paling perlu.
  const kunci = Boolean(menulis && dikunci)
  const tooltipAsli = (rest as { 'data-tooltip'?: string })['data-tooltip']
  return (
    <button
      type="button"
      data-variant={variant}
      data-size={size === 'md' ? undefined : size}
      className={`btn-prima${className ? ' ' + className : ''}`}
      {...rest}
      aria-disabled={kunci || undefined}
      data-tooltip={kunci ? sebab : tooltipAsli}
      // preventDefault juga menahan submit form (tombol `type="submit"`, termasuk Enter).
      onClick={kunci ? (e) => e.preventDefault() : onClick}
    >
      {iconLeft && <span className="btn-prima-icon">{iconLeft}</span>}
      <span className="btn-prima-label">{children}</span>
      {iconRight && <span className="btn-prima-icon">{iconRight}</span>}
    </button>
  )
}
