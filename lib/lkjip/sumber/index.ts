// lib/lkjip/sumber/index.ts — daftar sumber tabel tertaut LKJIP.
// Menambah sumber = satu berkas penghubung + satu entri di sini (pola penyedia RIMA).

import type { HasilTarik, Tautan } from '../tautan';
import type { AmbilJson } from './umum';
import { setelanKinerjaRekap, tarikKinerjaRekap, KOLOM_BAWAAN_KINERJA, KOLOM_KINERJA_REKAP } from './kinerja-rekap';
import { setelanRenaksiCetak, tarikRenaksiCetak, KOLOM_BAWAAN_RENAKSI, kolomRenaksi } from './renaksi-cetak';
import type { KolomSumber } from '../tautan';

export type IdSumber = Tautan['sumber'];

export interface SumberTabel {
  id:          IdSumber;
  label:       string;
  modul:       string;
  /** Normalisasi setelan tersimpan (masukan bisa dari payload lama/rusak). */
  setelan:     (raw: unknown, tahunDokumen: number) => Record<string, unknown>;
  tarik:       (setelan: Record<string, unknown>, ambil: AmbilJson, tahunDokumen: number) => Promise<HasilTarik>;
  /** Kolom yang tersedia tanpa perlu menarik data — untuk pemetaan sebelum pratinjau. */
  kolom:       () => KolomSumber[];
  kolomBawaan: string[];
}

export const DAFTAR_SUMBER: Record<IdSumber, SumberTabel> = {
  'kinerja-rekap': {
    id: 'kinerja-rekap',
    label: 'E-Anggaran · Rekap Semua Sumber',
    modul: 'E-Anggaran',
    setelan: (raw, tahun) => ({ ...setelanKinerjaRekap(raw, tahun) }),
    tarik: (s, ambil, tahun) => tarikKinerjaRekap(setelanKinerjaRekap(s, tahun), ambil),
    kolom: () => KOLOM_KINERJA_REKAP,
    kolomBawaan: KOLOM_BAWAAN_KINERJA,
  },
  'renaksi-cetak': {
    id: 'renaksi-cetak',
    label: 'Renaksi · Cetak (Target & Realisasi Indikator)',
    modul: 'Rencana Aksi',
    setelan: (raw, tahun) => ({ ...setelanRenaksiCetak(raw, tahun) }),
    tarik: (s, ambil, tahun) => tarikRenaksiCetak(setelanRenaksiCetak(s, tahun), ambil),
    kolom: kolomRenaksi,
    kolomBawaan: KOLOM_BAWAAN_RENAKSI,
  },
};

export const URUTAN_SUMBER: IdSumber[] = ['kinerja-rekap', 'renaksi-cetak'];
