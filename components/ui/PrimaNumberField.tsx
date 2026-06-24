'use client'
// components/ui/PrimaNumberField.tsx
// Number input dengan chevron naik/turun (pengganti native spinner browser).
// Layout = Tailwind utilities (inline-flex: input flex-1 + kolom chevron di kanan).
// Warna = class .prima-numfield* di globals.css, theme-aware via data-theme (navy PRIMA di dark,
// putih di light). JANGAN pakai token shadcn bg-background/border-input: app ini toggle tema lewat
// data-theme, bukan class .dark, jadi token itu stuck di nilai light → field jadi putih di dark.
// Drop-in: forward `value`/`onChange`/`ref` apa adanya. Tombol chevron memakai native value setter
// + dispatch event 'input' supaya handler onChange induk (Number/parseInt/parseFloat/string) jalan
// tanpa diubah. Reference: docs/design/DESIGN-SYSTEM.md.

import { ChevronDown, ChevronUp } from 'lucide-react'
import { forwardRef, useRef, type InputHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export interface PrimaNumberFieldProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'> {
  size?: 'sm' | 'md'
  inputClassName?: string
}

const nativeValueSetter = () =>
  typeof window === 'undefined'
    ? undefined
    : Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set

const PrimaNumberField = forwardRef<HTMLInputElement, PrimaNumberFieldProps>(
  function PrimaNumberField(
    { size = 'md', className, style, inputClassName, value, onChange, min, max, step, disabled, ...rest },
    ref,
  ) {
    const innerRef = useRef<HTMLInputElement | null>(null)
    const assignRef = (el: HTMLInputElement | null) => {
      innerRef.current = el
      if (typeof ref === 'function') ref(el)
      else if (ref) ref.current = el
    }

    const bump = (dir: 1 | -1) => {
      const el = innerRef.current
      if (!el || disabled) return
      const stp = step != null ? Number(step) : 1
      const lo = min != null ? Number(min) : undefined
      const hi = max != null ? Number(max) : undefined
      const raw = el.value !== '' ? Number(el.value) : (lo ?? 0)
      let next = (Number.isNaN(raw) ? (lo ?? 0) : raw) + dir * stp
      if (lo != null) next = Math.max(lo, next)
      if (hi != null) next = Math.min(hi, next)
      nativeValueSetter()?.call(el, String(next))
      el.dispatchEvent(new Event('input', { bubbles: true }))
      el.focus()
    }

    const numVal = value !== '' && value != null ? Number(value) : NaN
    const atMax = max != null && !Number.isNaN(numVal) && numVal >= Number(max)
    const atMin = min != null && !Number.isNaN(numVal) && numVal <= Number(min)

    return (
      <div
        className={cn(
          'prima-numfield relative inline-flex w-full items-center overflow-hidden rounded-md border transition-[box-shadow,border-color]',
          size === 'sm' ? 'h-7' : 'h-9',
          disabled && 'opacity-50',
          className,
        )}
        style={style}
      >
        <input
          ref={assignRef}
          type="number"
          inputMode="numeric"
          value={value}
          onChange={onChange}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          className={cn(
            'prima-numfield__input h-full min-w-0 flex-1 bg-transparent tabular-nums focus:outline-none',
            size === 'sm' ? 'px-2 text-xs' : 'px-3 text-sm',
            inputClassName,
          )}
          {...rest}
        />
        <div className={cn('prima-numfield__spin flex h-full flex-col border-l', size === 'sm' ? 'w-5' : 'w-6')}>
          <button
            type="button"
            tabIndex={-1}
            aria-label="Naikkan"
            disabled={disabled || atMax}
            onClick={() => bump(1)}
            className="prima-numfield__btn flex flex-1 items-center justify-center transition-colors disabled:pointer-events-none disabled:opacity-40"
          >
            <ChevronUp size={12} strokeWidth={2} aria-hidden="true" />
          </button>
          <button
            type="button"
            tabIndex={-1}
            aria-label="Turunkan"
            disabled={disabled || atMin}
            onClick={() => bump(-1)}
            className="prima-numfield__btn flex flex-1 items-center justify-center transition-colors disabled:pointer-events-none disabled:opacity-40"
          >
            <ChevronDown size={12} strokeWidth={2} aria-hidden="true" />
          </button>
        </div>
      </div>
    )
  },
)

export default PrimaNumberField
