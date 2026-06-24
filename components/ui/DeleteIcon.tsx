'use client'
// components/ui/DeleteIcon.tsx
// Ikon trash animasi (lid rotate saat hover) — standar ikon delete PRIMA.
// 2 svg: lid (.prima-del-top) + body (.prima-del-bottom). Animasi lid dipicu lewat
// `button:hover .prima-del-top` (global di globals.css) → otomatis jalan baik di
// DeleteButton bulat maupun di PrimaButton danger (ikut hover tombol induk).
// Adapted dari Uiverse.io (vinodjangid07) ke token PRIMA.
// Reference: docs/design/DESIGN-SYSTEM.md section "DeleteButton / Animated Trash".

import { useId } from 'react'

interface Props {
  size?: number
}

export default function DeleteIcon({ size = 14 }: Props) {
  const maskId = useId()
  // size = tinggi visual target. 2 svg bertumpuk (tutup+badan) total ~1.36x lebar,
  // jadi lebar svg di-skala ~0.7x size supaya tinggi total ≈ size (sejajar ikon Pencil/Edit sebelahnya).
  const w = Math.round(size * 0.7)
  return (
    <span className="prima-del-ico" aria-hidden="true">
      <svg className="prima-del-svg prima-del-top" style={{ width: w }} viewBox="0 0 39 7" fill="none" xmlns="http://www.w3.org/2000/svg">
        <line y1="5" x2="39" y2="5" stroke="currentColor" strokeWidth="4" />
        <line x1="12" y1="1.5" x2="26.0357" y2="1.5" stroke="currentColor" strokeWidth="3" />
      </svg>
      <svg className="prima-del-svg prima-del-bottom" style={{ width: w }} viewBox="0 0 33 39" fill="none" xmlns="http://www.w3.org/2000/svg">
        <mask id={maskId} fill="white">
          <path d="M0 0H33V35C33 37.2091 31.2091 39 29 39H4C1.79086 39 0 37.2091 0 35V0Z" />
        </mask>
        <path d="M0 0H33H0ZM37 35C37 39.4183 33.4183 43 29 43H4C-0.418278 43 -4 39.4183 -4 35H4H29H37ZM4 43C-0.418278 43 -4 39.4183 -4 35V0H4V35V43ZM37 0V35C37 39.4183 33.4183 43 29 43V35V0H37Z" fill="currentColor" mask={`url(#${maskId})`} />
        <path d="M12 6L12 29" stroke="currentColor" strokeWidth="4" />
        <path d="M21 6V29" stroke="currentColor" strokeWidth="4" />
      </svg>
    </span>
  )
}
