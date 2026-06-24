'use client';
import { useState, useEffect, useRef } from 'react';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** 1234567 → "1.234.567" */
export function formatNominal(n: number | string | null | undefined): string {
  const num = typeof n === 'string' ? parseNominal(n) : (n ?? 0);
  if (!num) return '';
  return num.toLocaleString('id-ID');
}

/** "1.234.567" → 1234567 */
export function parseNominal(s: string): number {
  return parseInt(s.replace(/\./g, '').replace(/[^0-9]/g, ''), 10) || 0;
}

// ─── Component ───────────────────────────────────────────────────────────────

interface InputNominalProps {
  value     : number;
  onChange  : (value: number) => void;
  style?    : React.CSSProperties;
  className?: string;
  placeholder?: string;
  disabled? : boolean;
  /** tambahkan ref bila perlu focus programatik */
  inputRef? : React.RefObject<HTMLInputElement | null>;
}

/**
 * Input angka nominal dengan format otomatis ribuan (id-ID).
 * Menyimpan raw number, menampilkan "1.234.567".
 *
 * @example
 * <InputNominal value={row.target} onChange={v => setTarget(v)} style={inpStyle} />
 */
export function InputNominal({
  value, onChange, style, className, placeholder = '0', disabled, inputRef,
}: InputNominalProps) {
  const [display, setDisplay] = useState(() => formatNominal(value));
  const focused = useRef(false);

  /* sync from parent (mis. setelah fetch data) */
  useEffect(() => {
    if (!focused.current) {
      setDisplay(formatNominal(value));
    }
  }, [value]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value.replace(/\./g, '').replace(/[^0-9]/g, '');
    const num = parseInt(raw, 10) || 0;
    setDisplay(raw === '' ? '' : num.toLocaleString('id-ID'));
    onChange(num);
  }

  function handleBlur() {
    focused.current = false;
    /* normalisasi display saat blur: hapus leading zeros, format ulang */
    setDisplay(formatNominal(parseNominal(display)));
  }

  return (
    <input
      ref={inputRef as React.RefObject<HTMLInputElement>}
      type="text"
      inputMode="numeric"
      value={display}
      disabled={disabled}
      className={className}
      style={style}
      placeholder={placeholder}
      onFocus={() => { focused.current = true; }}
      onChange={handleChange}
      onBlur={handleBlur}
    />
  );
}
