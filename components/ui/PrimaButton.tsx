'use client'
// components/ui/PrimaButton.tsx
// Primary toolbar button untuk PRIMA — Concept 4 "Sci-Fi Engraved" adapted ke design token.
// Chamfered corners (clip-path) + 1px hairline border + 3px left accent stripe per variant.
// Reference: docs/design/DESIGN-SYSTEM.md section "PrimaButton".
//
// JANGAN dipakai untuk row action button kecil (🗑, edit inline) — itu tetap pakai
// inline button atau shadcn icon button. PrimaButton hanya untuk PRIMARY TOOLBAR.

import type { ReactNode, ButtonHTMLAttributes } from 'react'

export type PrimaVariant = 'primary' | 'success' | 'danger' | 'purple' | 'warning' | 'ghost'
export type PrimaSize    = 'sm' | 'md' | 'lg'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?:   PrimaVariant
  size?:      PrimaSize
  iconLeft?:  ReactNode
  iconRight?: ReactNode
}

export default function PrimaButton({
  variant = 'ghost',
  size    = 'md',
  iconLeft,
  iconRight,
  children,
  className,
  ...rest
}: Props) {
  return (
    <button
      type="button"
      data-variant={variant}
      data-size={size === 'md' ? undefined : size}
      className={`btn-prima${className ? ' ' + className : ''}`}
      {...rest}
    >
      {iconLeft && <span className="btn-prima-icon">{iconLeft}</span>}
      <span className="btn-prima-label">{children}</span>
      {iconRight && <span className="btn-prima-icon">{iconRight}</span>}
    </button>
  )
}
