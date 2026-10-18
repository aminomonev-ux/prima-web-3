'use client';
// Pilihan sel ala Excel — SATU hook untuk editor tabel dan kisi kepala di modal (E5,
// docs/CONCEPT-lkjip-tabel-excel.md §5.1). Aturannya (meluaskan ke gabungan, melangkah, melompat)
// ada di lib/lkjip/tabel.ts supaya bisa diuji; hook ini hanya memegang keadaan & seretan tetikus.

import { useEffect, useMemo, useRef, useState } from 'react';
import { kotakDari, luaskanPilihan, langkahSel, lompatSel, asalSel, type Kotak, type TabelCell } from '@/lib/lkjip/tabel';

/** `ar/ac` = sel aktif (tempat mengetik), `fr/fc` = ujung blok yang digerakkan Shift. */
export interface Pilihan { ar: number; ac: number; fr: number; fc: number }

export function usePilihanSel(rows: TabelCell[][], ncol: number) {
  const [mentah, setSel] = useState<Pilihan | null>(null);
  const seret = useRef<'sel' | 'kolom' | 'baris' | null>(null);
  useEffect(() => {
    const lepas = () => { seret.current = null; };
    window.addEventListener('mouseup', lepas);
    return () => window.removeEventListener('mouseup', lepas);
  }, []);

  const nrow = rows.length;
  // Baris/kolom yang dihapus tidak boleh meninggalkan pilihan di luar tabel.
  const sel = mentah && nrow > 0 && ncol > 0
    ? { ar: Math.min(mentah.ar, nrow - 1), ac: Math.min(mentah.ac, ncol - 1), fr: Math.min(mentah.fr, nrow - 1), fc: Math.min(mentah.fc, ncol - 1) }
    : null;
  const ar = sel?.ar ?? -1, ac = sel?.ac ?? -1, fr = sel?.fr ?? -1, fc = sel?.fc ?? -1;
  const kotak = useMemo<Kotak | null>(
    () => (ar < 0 ? null : luaskanPilihan(rows, kotakDari(ar, ac, fr, fc))),
    [rows, ar, ac, fr, fc]);

  const penuhKolom = !!kotak && kotak.r1 === 0 && kotak.r2 === nrow - 1;
  const penuhBaris = !!kotak && kotak.c1 === 0 && kotak.c2 === ncol - 1;

  return {
    sel, setSel, kotak, penuhKolom, penuhBaris,
    sedangSeret: () => seret.current !== null,
    pilihSel(r: number, c: number, perluas: boolean) {
      setSel(s => (perluas && s ? { ...s, fr: r, fc: c } : { ar: r, ac: c, fr: r, fc: c }));
      seret.current = 'sel';
    },
    seretSel(r: number, c: number) {
      if (seret.current === 'sel') setSel(s => (s && (s.fr !== r || s.fc !== c) ? { ...s, fr: r, fc: c } : s));
    },
    pilihKolom(c: number, perluas: boolean) {
      setSel(s => (perluas && s ? { ar: 0, ac: s.ac, fr: nrow - 1, fc: c } : { ar: 0, ac: c, fr: nrow - 1, fc: c }));
      seret.current = 'kolom';
    },
    seretKolom(c: number) {
      if (seret.current === 'kolom') setSel(s => (s && s.fc !== c ? { ...s, fc: c } : s));
    },
    pilihBaris(r: number, perluas: boolean) {
      setSel(s => (perluas && s ? { ar: s.ar, ac: 0, fr: r, fc: ncol - 1 } : { ar: r, ac: 0, fr: r, fc: ncol - 1 }));
      seret.current = 'baris';
    },
    seretBaris(r: number) {
      if (seret.current === 'baris') setSel(s => (s && s.fr !== r ? { ...s, fr: r } : s));
    },
    pilihSemua() {
      if (nrow && ncol) setSel({ ar: 0, ac: 0, fr: nrow - 1, fc: ncol - 1 });
    },
    /** Panah (Shift = perluas blok, Ctrl = lompat ke tepi data). */
    gerak(dr: number, dc: number, opsi: { perluas?: boolean; lompat?: boolean } = {}) {
      setSel(s => {
        if (!s) return nrow && ncol ? { ar: 0, ac: 0, fr: 0, fc: 0 } : s;
        const dari = opsi.perluas ? { r: s.fr, c: s.fc } : { r: s.ar, c: s.ac };
        const ke = (opsi.lompat ? lompatSel : langkahSel)(rows, ncol, dari.r, dari.c, dr, dc);
        return opsi.perluas ? { ...s, fr: ke.r, fc: ke.c } : { ar: ke.r, ac: ke.c, fr: ke.r, fc: ke.c };
      });
    },
    keSel(r: number, c: number) {
      const a = asalSel(rows, Math.max(0, Math.min(r, nrow - 1)), Math.max(0, Math.min(c, ncol - 1)));
      setSel({ ar: a.r, ac: a.c, fr: a.r, fc: a.c });
    },
  };
}
