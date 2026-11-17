'use client';
// Kunci Periode di layar Renaksi: dibaca dari server, dan ikut berganti saat diubah lewat Header tanpa muat ulang.
// Dulu hanya Matriks Bulanan yang membacanya — Detail Indikator membiarkan bulan/triwulan terkunci tetap bisa diketik,
// lalu Simpan ditolak server.
import { useEffect, useState } from 'react';
import { apiGetLock } from './api';

const PERISTIWA = 'ra-kunci-periode-berubah';

/** Dipanggil Header sesudah Kunci Periode tersimpan. */
export function beritahuKunciBerubah(tahun: number, bulan: number) {
  window.dispatchEvent(new CustomEvent(PERISTIWA, { detail: { tahun, bulan } }));
}

/** Batas kunci tahun itu (0 = terbuka). Gagal membaca = 0: server tetap menolak bulan terkunci. */
export function useKunciPeriode(tahun: number): number {
  const [kunci, setKunci] = useState<{ tahun: number; bulan: number }>({ tahun, bulan: 0 });
  useEffect(() => {
    let batal = false;
    apiGetLock(tahun).then(b => { if (!batal) setKunci({ tahun, bulan: b }); }).catch(() => { /* server tetap menjaga */ });
    const dengar = (e: Event) => {
      const d = (e as CustomEvent<{ tahun: number; bulan: number }>).detail;
      if (d?.tahun === tahun) setKunci({ tahun, bulan: d.bulan });
    };
    window.addEventListener(PERISTIWA, dengar);
    return () => { batal = true; window.removeEventListener(PERISTIWA, dengar); };
  }, [tahun]);
  // Jawaban tahun lain (ganti tahun sebelum jawaban lama pulang) tidak pernah dipakai.
  return kunci.tahun === tahun ? kunci.bulan : 0;
}
