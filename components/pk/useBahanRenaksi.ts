'use client';
// Bahan pembanding "Rencana Aksi berubah" untuk Master Program / Master Sasaran PK.
// Dimuat saat dibuka, ganti tahun, `muatUlang()`, dan saat tab peramban kembali aktif sesudah
// 15 menit. Gagal / tanpa hak ubah = null → spanduk diam.

import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchJson } from '@/lib/shared/api';

const JEDA_MUAT_ULANG_MS = 15 * 60 * 1000;

export function useBahanRenaksi<T>(menu: 'program' | 'sasaran', tahun: string, aktif: boolean) {
  const [muatan, setMuatan] = useState<{ kunci: string; isi: T | null }>({ kunci: '', isi: null });
  const kunci = `${menu}:${tahun}`;
  const terakhir = useRef(0);
  const giliran = useRef(0);

  const muatUlang = useCallback(async () => {
    if (!aktif) return;
    const ke = ++giliran.current;
    terakhir.current = Date.now();
    const d = await fetchJson<unknown>(`/api/perjanjian-kinerja/banding-renaksi?tahun=${encodeURIComponent(tahun)}&menu=${menu}`);
    if (ke !== giliran.current) return;
    setMuatan({ kunci: `${menu}:${tahun}`, isi: d.ok ? (d as unknown as T) : null });
  }, [menu, tahun, aktif]);

  useEffect(() => {
    void muatUlang();
    const saatTampil = () => {
      if (document.visibilityState === 'visible' && Date.now() - terakhir.current >= JEDA_MUAT_ULANG_MS) void muatUlang();
    };
    document.addEventListener('visibilitychange', saatTampil);
    return () => document.removeEventListener('visibilitychange', saatTampil);
  }, [muatUlang]);

  return { bahan: muatan.kunci === kunci ? muatan.isi : null, muatUlang };
}
