'use client'
// components/ui/EditButton.tsx
// Tombol edit bulat animasi (row-action) — keluarga DeleteButton (bulat 30px, ikon bergerak saat hover).
// Pensil miring ke posisi menulis + garis bawah ter-gambar; bg→ungu token saat hover.
// Teruskan onClick/disabled/data-tooltip lewat {...rest}.
// Reference: docs/design/DESIGN-SYSTEM.md section "Row-Action Buttons (Edit/Realisasi/Delete)".

import type { ButtonHTMLAttributes } from 'react'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  iconSize?: number
}

export default function EditButton({ iconSize = 14, className, ...rest }: Props) {
  return (
    <button type="button" aria-label="Edit" className={`prima-edit-btn${className ? ' ' + className : ''}`} {...rest}>
      <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path className="prima-edit-pencil" d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3Z" />
        <line className="prima-edit-line" x1="5" y1="23" x2="21" y2="23" />
      </svg>
    </button>
  )
}
