'use client';
// Penanda matriks (bintang tingkat, nomor "(1)") di layar kerja Renaksi.
//
// Layar kerja SELALU menampilkan penanda, dan penandanya DIHITUNG (lib/shared/nama-resmi.ts),
// bukan dibaca dari teks tersimpan: baris hasil impor dan baris ketikan tangan tampil sama.
// Nilai yang dipakai mencocokkan/memilih (value pemilih, kunci hierarki) tetap teks mentah.

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { nomorIndikator, tampilIndikator, tampilNama, type LevelRenaksi } from '@/lib/shared/nama-resmi';
import type { RaRow } from './types';

interface Penanda {
  /** Indikator satu baris, lengkap dengan nomor urut dan bintang tingkatnya. */
  indikator: (row: Pick<RaRow, 'id' | 'level' | 'indikator'>) => string;
  /** Label untuk pilihan indikator yang nilainya teks mentah. */
  labelIndikator: (level: LevelRenaksi, teks: string) => string;
  nama: (nama: string | null | undefined, level: LevelRenaksi) => string;
}

const nama: Penanda['nama'] = (n, level) => (n ? tampilNama(n, level, true) : '');

const TANPA_DATA: Penanda = {
  indikator: row => tampilIndikator(row.indikator, row.level, null, true),
  labelIndikator: (level, teks) => tampilIndikator(teks, level, null, true),
  nama,
};

const Konteks = createContext<Penanda>(TANPA_DATA);

export function PenandaProvider({ rows, children }: { rows: RaRow[]; children: ReactNode }) {
  const nilai = useMemo<Penanda>(() => {
    const nomor = nomorIndikator(rows);
    const idDariTeks = new Map(rows.map(r => [`${r.level}||${r.indikator}`, r.id]));
    return {
      indikator: row => tampilIndikator(row.indikator, row.level, nomor.get(row.id), true),
      labelIndikator: (level, teks) => tampilIndikator(teks, level, nomor.get(idDariTeks.get(`${level}||${teks}`) ?? -1), true),
      nama,
    };
  }, [rows]);
  return <Konteks.Provider value={nilai}>{children}</Konteks.Provider>;
}

export function usePenanda(): Penanda {
  return useContext(Konteks);
}

/** Kolom `program` memuat nama baris itu sendiri di tingkat tujuan & sasaran. */
export function levelKolomProgram(level: LevelRenaksi): LevelRenaksi {
  return level === 'tujuan' || level === 'sasaran' ? level : 'program';
}
