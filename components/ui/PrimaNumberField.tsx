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
import { forwardRef, useEffect, useRef, useState, type InputHTMLAttributes } from 'react'
import { bacaDesimal, bersihkanKetikan, bulatkanDesimal, tulisDesimal } from '@/lib/shared/desimal'
import { cn } from '@/lib/utils'

export interface PrimaNumberFieldProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'> {
  size?: 'sm' | 'md'
  inputClassName?: string
  /**
   * Jumlah angka di belakang koma yang boleh diisi. Tanpa prop ini komponennya
   * persis seperti dulu (`type="number"`, bilangan bulat) — 9 pemakai lama tak
   * tersentuh.
   *
   * Dengan prop ini fieldnya pindah ke `type="text"` + `inputMode="decimal"`.
   * Bukan selera: pada `type="number"` ketikan yang tak terbaca browser
   * dipulangkan sebagai string KOSONG, jadi mengetik "7,5" — cara orang di sini
   * menulis desimal — menghapus isi sel tanpa satu pesan pun. `step="0.01"` saja
   * tidak menutup itu, ia cuma melepas penolakan untuk yang mengetik titik.
   *
   * `onChange` tetap menerima ChangeEvent dengan `e.target.value` berisi angka
   * berTITIK ("7.5") supaya `parseFloat`/`Number` di pemanggil jalan apa adanya;
   * yang berkoma hanya tampilannya.
   */
  desimal?: number
}

const nativeValueSetter = () =>
  typeof window === 'undefined'
    ? undefined
    : Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set

const PrimaNumberField = forwardRef<HTMLInputElement, PrimaNumberFieldProps>(
  function PrimaNumberField(
    { size = 'md', className, style, inputClassName, value, onChange, onFocus, onBlur, min, max, step, disabled, desimal, ...rest },
    ref,
  ) {
    const innerRef = useRef<HTMLInputElement | null>(null)
    const assignRef = (el: HTMLInputElement | null) => {
      innerRef.current = el
      if (typeof ref === 'function') ref(el)
      else if (ref) ref.current = el
    }

    const pakaiDesimal = desimal != null
    const angkaProp = typeof value === 'number' ? value : bacaDesimal(String(value ?? ''))
    const [teks, setTeks] = useState(() => (pakaiDesimal ? tulisDesimal(angkaProp, desimal) : ''))
    const fokus = useRef(false)

    /* Sinkron dari induk (mis. sesudah fetch). Dilewati saat sedang diketik —
       kalau tidak, "7," yang belum selesai ditulis ulang jadi "7" dan komanya
       hilang tepat saat orang menekannya. Pola sama dengan InputNominal. */
    useEffect(() => {
      if (!pakaiDesimal || fokus.current) return
      setTeks(tulisDesimal(typeof value === 'number' ? value : bacaDesimal(String(value ?? '')), desimal))
    }, [value, pakaiDesimal, desimal])

    /* Pemanggil membaca `e.target.value`, jadi nilainya dititipkan sebentar di
       DOM lalu dikembalikan — teks yang sedang diketik tidak boleh ikut berubah. */
    const kirim = (kanonik: string) => {
      const el = innerRef.current
      if (!el || !onChange) return
      const sedangTampil = el.value
      el.value = kanonik
      onChange({ target: el, currentTarget: el } as unknown as React.ChangeEvent<HTMLInputElement>)
      el.value = sedangTampil
    }

    const ketikDesimal = (e: React.ChangeEvent<HTMLInputElement>) => {
      const diketik = bersihkanKetikan(e.target.value)
      setTeks(diketik)
      const n = bacaDesimal(diketik)
      kirim(n == null ? '' : String(n))
    }

    /* Pembulatan dilakukan DI DEPAN MATA saat meninggalkan field. Kalau tidak,
       7,567 berangkat ke server lalu dibulatkan diam-diam oleh kolom
       DECIMAL(14,2) dan angkanya berubah sendiri sesudah muat ulang. */
    const rapikanDesimal = () => {
      const n = bacaDesimal(teks)
      if (n == null) {
        setTeks('')
        kirim('')
        return
      }
      const bulat = bulatkanDesimal(n, desimal)
      setTeks(tulisDesimal(bulat, desimal))
      kirim(String(bulat))
    }

    const bump = (dir: 1 | -1) => {
      const el = innerRef.current
      if (!el || disabled) return
      const stp = step != null ? Number(step) : 1
      const lo = min != null ? Number(min) : undefined
      const hi = max != null ? Number(max) : undefined

      if (pakaiDesimal) {
        const kini = bacaDesimal(teks) ?? lo ?? 0
        let next = bulatkanDesimal(kini + dir * stp, desimal)
        if (lo != null) next = Math.max(lo, next)
        if (hi != null) next = Math.min(hi, next)
        setTeks(tulisDesimal(next, desimal))
        kirim(String(next))
        el.focus()
        return
      }

      const raw = el.value !== '' ? Number(el.value) : (lo ?? 0)
      let next = (Number.isNaN(raw) ? (lo ?? 0) : raw) + dir * stp
      if (lo != null) next = Math.max(lo, next)
      if (hi != null) next = Math.min(hi, next)
      nativeValueSetter()?.call(el, String(next))
      el.dispatchEvent(new Event('input', { bubbles: true }))
      el.focus()
    }

    const numVal = pakaiDesimal
      ? (bacaDesimal(teks) ?? NaN)
      : value !== '' && value != null ? Number(value) : NaN
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
          type={pakaiDesimal ? 'text' : 'number'}
          inputMode={pakaiDesimal ? 'decimal' : 'numeric'}
          value={pakaiDesimal ? teks : value}
          onChange={pakaiDesimal ? ketikDesimal : onChange}
          onFocus={(e) => { fokus.current = true; onFocus?.(e) }}
          onBlur={(e) => { fokus.current = false; if (pakaiDesimal) rapikanDesimal(); onBlur?.(e) }}
          min={pakaiDesimal ? undefined : min}
          max={pakaiDesimal ? undefined : max}
          step={pakaiDesimal ? undefined : step}
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
