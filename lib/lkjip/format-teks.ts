// ═══ PRIMA — LKJIP — Format teks narasi (pure, aman-klien) ═══
// Stabilo, ukuran huruf, ubah huruf — dipakai bilah alat, penyaring, `docgen.ts`, dan impor Word.

// ─── Stabilo ──────────────────────────────────────────────────────────────────
// Warna dokumen, bukan warna antarmuka: harus sama dengan yang tercetak, jadi memakai warna `w:highlight`.
export const STABILO = {
  kuning: { label: 'Kuning', word: 'yellow', css: 'yellow' },
  hijau: { label: 'Hijau', word: 'green', css: 'lime' },
  biru: { label: 'Biru', word: 'cyan', css: 'cyan' },
  merah: { label: 'Merah muda', word: 'magenta', css: 'fuchsia' },
  abu: { label: 'Abu-abu', word: 'lightGray', css: 'lightgray' },
} as const;
export type KodeStabilo = keyof typeof STABILO;
export const stabiloSah = (x: unknown): x is KodeStabilo => typeof x === 'string' && Object.prototype.hasOwnProperty.call(STABILO, x);
export const POLA_STABILO = /(?<![-a-zA-Z])data-stabilo\s*=\s*["']?([a-z]{1,12})/;

/** Warna `w:highlight` berkas sumber → kode kita. Warna lain jatuh ke kuning: yang penting tandanya tidak hilang. */
export function stabiloDariWord(v: string | null | undefined): KodeStabilo | null {
  if (!v || v === 'none') return null;
  const hit = (Object.keys(STABILO) as KodeStabilo[]).find(k => STABILO[k].word.toLowerCase() === v.toLowerCase());
  return hit ?? 'kuning';
}

// ─── Ukuran huruf ─────────────────────────────────────────────────────────────
export const UKURAN_PT = [8, 9, 10, 10.5, 11, 12, 14, 16, 18, 20, 22, 24, 26, 28, 36];
export const BATAS_PT = { min: 4, max: 72 };

/** `font-size` CSS → pt. Isian lama ber-px tetap terbaca: 16px = 12 pt. */
export function ptDariCss(nilai: unknown): number | null {
  const m = /^\s*(\d{1,3}(?:\.\d+)?)\s*(pt|px)\s*$/i.exec(String(nilai ?? ''));
  if (!m) return null;
  const n = parseFloat(m[1]);
  return m[2].toLowerCase() === 'pt' ? n : Math.round((n * 3) / 4 * 10) / 10;
}

/** Setengah-poin `w:sz` dari gaya span: `14pt` → 28, `16px` → 24. `null` = tidak ada. */
export function szDariGaya(tok: string): number | null {
  const pt = /font-size\s*:\s*(\d{1,2}(?:\.\d+)?)pt/i.exec(tok);
  if (pt) return Math.round(parseFloat(pt[1]) * 2);
  const px = /font-size\s*:\s*(\d{1,3})px/i.exec(tok);
  return px ? Math.round(parseInt(px[1], 10) * 1.5) : null;
}

// ─── Ubah huruf ───────────────────────────────────────────────────────────────
export type ModeHuruf = 'kalimat' | 'kecil' | 'besar' | 'kata' | 'balik';
export const MODE_HURUF: readonly { kode: ModeHuruf; label: string }[] = [
  { kode: 'kalimat', label: 'Huruf awal kalimat' },
  { kode: 'kecil', label: 'huruf kecil' },
  { kode: 'besar', label: 'HURUF BESAR' },
  { kode: 'kata', label: 'Huruf Awal Tiap Kata' },
  { kode: 'balik', label: 'bALIK hURUF' },
];

const LOKAL = 'id-ID';
const adalahHuruf = (c: string) => /\p{L}/u.test(c);
const adalahAngka = (c: string) => /\p{N}/u.test(c);
const besar = (c: string) => c.toLocaleUpperCase(LOKAL);
const kecil = (c: string) => c.toLocaleLowerCase(LOKAL);

export interface KonteksHuruf { awalKalimat: boolean; dalamKata: boolean }
/** Keadaan awal dari teks sebelum pilihan dalam paragraf yang sama. */
export function konteksSebelum(teks: string): KonteksHuruf {
  const akhir = Array.from(teks).pop() ?? '';
  return { awalKalimat: /^\s*$/.test(teks) || /[.!?]\s+$/.test(teks), dalamKata: adalahHuruf(akhir) || adalahAngka(akhir) };
}

/**
 * Per karakter, bukan per segmen: kata yang setengahnya tebal ("**Ru**mah") terdiri dari dua simpul teks,
 * dan keduanya harus diperlakukan sebagai satu kata. Jumlah segmen tetap, jadi format tiap simpul tidak hilang.
 */
export function ubahSegmen(segmen: readonly string[], mode: ModeHuruf, konteks: KonteksHuruf = { awalKalimat: true, dalamKata: false }): string[] {
  let { awalKalimat, dalamKata } = konteks;
  let sesudahTitik = false;
  return segmen.map(s => {
    let hasil = '';
    for (const c of Array.from(s)) {
      const huruf = adalahHuruf(c);
      const angka = adalahAngka(c);
      if (mode === 'kecil') hasil += kecil(c);
      else if (mode === 'besar') hasil += besar(c);
      else if (mode === 'balik') hasil += c === besar(c) ? kecil(c) : besar(c);
      else if (mode === 'kata') hasil += huruf ? (dalamKata ? kecil(c) : besar(c)) : c;
      else hasil += huruf ? (awalKalimat ? besar(c) : kecil(c)) : c;
      // "Ma'ruf" satu kata, "Rawat-Inap" dua. Angka menyambung kata: "2nd" tidak jadi "2Nd".
      dalamKata = huruf || angka || (dalamKata && (c === "'" || c === '’'));
      if (huruf || angka) { awalKalimat = false; sesudahTitik = false; }
      else if (/[.!?]/.test(c)) sesudahTitik = true;
      else if (/\s/.test(c)) { if (sesudahTitik) awalKalimat = true; sesudahTitik = false; }
      else if (!/["'”’)\]]/.test(c)) sesudahTitik = false;
    }
    return hasil;
  });
}

/** Putaran Shift+F3 seperti Word: kecil → BESAR → Tiap Kata → kecil. */
export function modeBerikut(teks: string): ModeHuruf {
  const huruf = Array.from(teks).filter(adalahHuruf).join('');
  if (huruf && huruf === kecil(huruf)) return 'besar';
  if (huruf && huruf === besar(huruf)) return 'kata';
  return 'kecil';
}

/** Kata di sekitar kursor; `[o, o]` kalau kursornya tidak menyentuh kata. */
export function rentangKata(teks: string, o: number): [number, number] {
  const dalam = (c: string | undefined) => !!c && (adalahHuruf(c) || adalahAngka(c) || c === "'" || c === '’');
  let a = o, b = o;
  while (a > 0 && dalam(teks[a - 1])) a--;
  while (b < teks.length && dalam(teks[b])) b++;
  return [a, b];
}
