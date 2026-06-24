'use client'
// components/ui/DeleteButton.tsx
// Tombol delete bulat animasi (row-action) — standar PRIMA. Lid trash rotate + bg→merah token saat hover.
// Masuk skip-rule design system "row-action inline" → komponen khusus, BUKAN PrimaButton.
// Teruskan onClick/disabled/data-tooltip lewat {...rest} (tooltip styled otomatis via [data-tooltip] global).
// Reference: docs/design/DESIGN-SYSTEM.md section "DeleteButton".

import type { ButtonHTMLAttributes } from 'react'
import DeleteIcon from './DeleteIcon'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  iconSize?: number
}

export default function DeleteButton({ iconSize = 13, className, ...rest }: Props) {
  return (
    <button type="button" aria-label="Hapus" className={`prima-del-btn${className ? ' ' + className : ''}`} {...rest}>
      <DeleteIcon size={iconSize} />
    </button>
  )
}
