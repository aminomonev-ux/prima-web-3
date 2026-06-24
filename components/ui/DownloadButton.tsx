'use client'
// components/ui/DownloadButton.tsx
// Tombol download animasi (adaptasi Uiverse.io ke token PRIMA). Layer slide warna (PDF merah /
// Excel hijau) nyembul tipis di bawah, slide turun + box-shadow saat hover, ikon panah bounce.
// Tema dark/light via globals.css. Dipakai untuk export di app Rencana Aksi.
// Reference: docs/design/DESIGN-SYSTEM.md section "DownloadButton".

import type { ButtonHTMLAttributes } from 'react'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string
  variant?: 'pdf' | 'excel' | 'word'
  size?: 'sm' | 'md'
}

export default function DownloadButton({ label, variant = 'pdf', size = 'md', className, ...rest }: Props) {
  const cls = `prima-dl-btn${size === 'sm' ? ' prima-dl-btn--sm' : ''}${className ? ' ' + className : ''}`
  return (
    <button type="button" className={cls} {...rest}>
      <span className="prima-dl-face">
        <svg viewBox="0 0 24 24" width="17" height="17" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
          <polyline points="10 9 9 9 8 9" />
        </svg>
        {label}
      </span>
      <span className="prima-dl-slide" data-variant={variant} aria-hidden="true">
        <svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
      </span>
    </button>
  )
}
