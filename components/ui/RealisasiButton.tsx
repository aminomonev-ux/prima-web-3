'use client'
// components/ui/RealisasiButton.tsx
// Tombol set-realisasi bulat animasi (row-action) — keluarga DeleteButton (bulat 30px, ikon bergerak saat hover).
// Koin jatuh masuk ke dompet saat hover; bg→hijau token (Setujui/finansial).
// Teruskan onClick/disabled/data-tooltip lewat {...rest}.
// Reference: docs/design/DESIGN-SYSTEM.md section "Row-Action Buttons (Edit/Realisasi/Delete)".

import type { ButtonHTMLAttributes } from 'react'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  iconSize?: number
}

export default function RealisasiButton({ iconSize = 15, className, ...rest }: Props) {
  return (
    <button type="button" aria-label="Set realisasi" className={`prima-real-btn${className ? ' ' + className : ''}`} {...rest}>
      <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle className="prima-real-coin" cx="12" cy="4" r="2.6" />
        <g className="prima-real-body">
          <rect x="3" y="9" width="18" height="11" rx="2" />
          <line x1="8" y1="9" x2="16" y2="9" strokeWidth="3" />
          <circle cx="12" cy="14.5" r="2" />
        </g>
      </svg>
    </button>
  )
}
