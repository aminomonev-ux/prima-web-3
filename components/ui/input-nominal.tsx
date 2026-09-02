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

interface InputNominalBase {
  style?    : React.CSSProperties;
  className?: string;
  placeholder?: string;
  disabled? : boolean;
  /* Sengaja TANPA prop tooltip: `[data-tooltip]` di globals.css mengecualikan
     `input` — elemen tergantikan tidak merender `::after`. Pasang tooltipnya di
     elemen pembungkus (mis. `<td>`), bukan di sini. */
  /** tambahkan ref bila perlu focus programatik */
  inputRef? : React.RefObject<HTMLInputElement | null>;
}

/**
 * Dua ragam, dibedakan `nullable`, dan bedanya BUKAN kenyamanan.
 *
 * Ragam biasa memperlakukan kosong sebagai 0 — benar untuk nominal yang selalu
 * punya nilai (harga, target). Ragam `nullable` membedakan "belum diisi" dari
 * "nol", dan itu wajib untuk kolom yang kekosongannya PUNYA ARTI: uraian
 * pergeseran memakai `null` = "belum diuraikan, hitung dari selisih" sedangkan
 * `0` = "diuraikan tangan, nilainya nol" (CONCEPT-blud-uraian-geser §2).
 * Mengirim 0 saat dikosongkan di sana membuat baris mengaku sudah diuraikan,
 * lalu ditolak `periksaUraian` saat menyimpan.
 */
type InputNominalProps = InputNominalBase & (
  | { nullable?: false; value: number;        onChange: (value: number) => void }
  | { nullable:  true;  value: number | null; onChange: (value: number | null) => void }
);

/**
 * Input angka nominal dengan format otomatis ribuan (id-ID).
 * Menyimpan raw number, menampilkan "1.234.567".
 *
 * @example
 * <InputNominal value={row.target} onChange={v => setTarget(v)} style={inpStyle} />
 * <InputNominal nullable value={row.bertambah} onChange={v => setUraian(v)} />
 */
export function InputNominal(props: InputNominalProps) {
  const { value, style, className, placeholder = '0', disabled, inputRef, nullable } = props;

  /** Nol TETAP tampil "0" di ragam nullable — `formatNominal` memulangkan string
   *  kosong untuk 0, dan di sini itu menghapus beda antara "nol" dan "belum diisi". */
  const tampil = (v: number | null) =>
    nullable ? (v == null ? '' : v.toLocaleString('id-ID')) : formatNominal(v);

  const [display, setDisplay] = useState(() => tampil(value));
  const focused = useRef(false);

  /* sync from parent (mis. setelah fetch data) */
  useEffect(() => {
    if (focused.current) return;
    setDisplay(nullable ? (value == null ? '' : value.toLocaleString('id-ID')) : formatNominal(value));
  }, [value, nullable]);

  function kirim(v: number | null) {
    if (props.nullable) props.onChange(v);
    else props.onChange(v ?? 0);
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value.replace(/\./g, '').replace(/[^0-9]/g, '');
    if (raw === '') { setDisplay(''); kirim(null); return; }
    const num = parseInt(raw, 10) || 0;
    setDisplay(num.toLocaleString('id-ID'));
    kirim(num);
  }

  function handleBlur() {
    focused.current = false;
    /* normalisasi display saat blur: hapus leading zeros, format ulang */
    const kosong = display.replace(/[^0-9]/g, '') === '';
    setDisplay(kosong ? '' : tampil(parseNominal(display)));
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
