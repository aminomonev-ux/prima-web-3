'use client'
// components/ui/PrimaButton.tsx
// Primary toolbar button untuk PRIMA — Concept 4 "Sci-Fi Engraved" adapted ke design token.
// Chamfered corners (clip-path) + 1px hairline border + 3px left accent stripe per variant.
// Reference: docs/design/DESIGN-SYSTEM.md section "PrimaButton".
//
// JANGAN dipakai untuk row action button kecil (🗑, edit inline) — itu tetap pakai
// inline button atau shadcn icon button. PrimaButton hanya untuk PRIMARY TOOLBAR.

import { useState } from 'react'
import type { ReactNode, ButtonHTMLAttributes, PointerEvent } from 'react'
import { useKunciTulis } from './KunciTulis'
import { TipLayang } from './Tip'
import { letakTip, type LetakTip } from '@/lib/shared/tip-posisi'

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
  onPointerEnter,
  onPointerLeave,
  onPointerDown,
  ...rest
}: Props) {
  const { dikunci, sebab } = useKunciTulis()
  // `aria-disabled`, BUKAN `disabled`: `.btn-prima:disabled` ber-opacity .45, dan tombol
  // `disabled` tak bisa difokus keyboard — sebabnya jadi tak terbaca persis saat paling perlu.
  const kunci = Boolean(menulis && dikunci)
  const tooltip = kunci ? sebab : (rest as { 'data-tooltip'?: string })['data-tooltip']
  // Tooltip PORTAL, bukan `::after`: `clip-path` sudut-terpotong `.btn-prima` ikut memotong
  // pseudo-elemennya, jadi sejak commit awal tooltip tombol ini tak pernah terlihat — tapi
  // tetap ikut tata letak dan memperlebar halaman (layar DPA 1014px → 1230px). Atribut
  // `data-tooltip` tetap dipasang sebagai sumber kalimatnya; pseudo-nya dimatikan di CSS.
  // Pointer event, BUKAN onMouseEnter: React menelan mouse event pada tombol `disabled`,
  // padahal tombol mati itulah yang paling sering membawa tooltip (alasan dikuncinya).
  const [letak, setLetak] = useState<LetakTip | null>(null)
  function tampilkanTooltip(e: PointerEvent<HTMLButtonElement>) {
    // `clientWidth`, bukan `innerWidth`: yang kedua ikut menghitung bilah gulir (lihat `Tip`).
    if (tooltip) setLetak(letakTip(e.currentTarget.getBoundingClientRect(), document.documentElement.clientWidth))
    onPointerEnter?.(e)
  }
  function sembunyikanTooltip(e: PointerEvent<HTMLButtonElement>) {
    setLetak(null)
    onPointerLeave?.(e)
  }
  // Ditekan = tooltip selesai tugasnya; kalau dibiarkan ia menggantung di atas modal yang
  // baru dibuka tombol ini sampai penunjuk digeser.
  function tutupSaatDitekan(e: PointerEvent<HTMLButtonElement>) {
    setLetak(null)
    onPointerDown?.(e)
  }
  return (
    <>
      <button
        type="button"
        data-variant={variant}
        data-size={size === 'md' ? undefined : size}
        className={`btn-prima${className ? ' ' + className : ''}`}
        {...rest}
        aria-disabled={kunci || undefined}
        data-tooltip={tooltip}
        // preventDefault juga menahan submit form (tombol `type="submit"`, termasuk Enter).
        onClick={kunci ? (e) => e.preventDefault() : onClick}
        onPointerEnter={tampilkanTooltip}
        onPointerLeave={sembunyikanTooltip}
        onPointerDown={tutupSaatDitekan}
      >
        {iconLeft && <span className="btn-prima-icon">{iconLeft}</span>}
        <span className="btn-prima-label">{children}</span>
        {iconRight && <span className="btn-prima-icon">{iconRight}</span>}
      </button>
      {tooltip && letak && <TipLayang label={tooltip} pos={letak} />}
    </>
  )
}
