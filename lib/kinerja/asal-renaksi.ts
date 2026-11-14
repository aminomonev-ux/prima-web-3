// lib/kinerja/asal-renaksi.ts — tanda "diambil dari Rencana Aksi" pada Master E-Anggaran.
//
// PURE & aman-klien: dipakai server (Init Renaksi) DAN layar (Master, Rekening).
// Konsep: docs/CONCEPT-renaksi-terhubung.md §5.1–5.2. Tanda hanya untuk LAYAR KERJA —
// Cetak, Laporan, Excel, PDF, dan Salin ke LKJIP tidak memuatnya.

import type { MasterTipe } from '@/lib/data/kinerja';
import { rapikanNamaEntitas } from '@/lib/shared/nama-resmi';
import { cocokInduk, type IndukMaster } from './master-nama';

export const ASAL_MASTER = ['MANUAL', 'RENAKSI'] as const;
export type AsalMaster = (typeof ASAL_MASTER)[number];

/**
 * Tingkat yang memang ditarik Init Renaksi. Uraian SSK selalu manual. Sumber anggaran ikut sejak pagu
 * Renaksi dirinci per sumber dana (docs/CONCEPT-renaksi-pagu-rko.md §6a: Renaksi = sumber besar).
 */
export function bisaDariRenaksi(tipe: MasterTipe): boolean {
  return tipe === 'program' || tipe === 'kegiatan' || tipe === 'subkegiatan' || tipe === 'sumber_anggaran';
}

export interface EntriBerasal extends IndukMaster {
  tipe: MasterTipe;
  nama: string;
  asal?: AsalMaster | null;
}

export function dariRenaksi(e: EntriBerasal): boolean {
  return bisaDariRenaksi(e.tipe) && e.asal === 'RENAKSI';
}

export interface RantaiNama {
  program?: string | null;
  kegiatan?: string | null;
  subkegiatan?: string | null;
}

export interface TandaRantai { program: boolean; kegiatan: boolean; subkegiatan: boolean }

/**
 * Tanda per kolom sebuah baris Rekening, DITURUNKAN dari Master (tidak disimpan di
 * `kinerja_rekening`): nama sama dan rantai induknya cocok (`cocokInduk` — aturan yang sama
 * dengan pilihan berantai) dengan entri ber-asal Renaksi. Kegiatan senama di program lain
 * tidak menurunkan tandanya.
 */
export function tandaRantai(r: RantaiNama, master: readonly EntriBerasal[]): TandaRantai {
  const ada = (tipe: MasterTipe, nama: string | null | undefined, induk: RantaiNama) =>
    !!nama && master.some(e => e.tipe === tipe && e.nama === nama && dariRenaksi(e) && cocokInduk(e, induk));
  return {
    program: ada('program', r.program, {}),
    kegiatan: ada('kegiatan', r.kegiatan, { program: r.program }),
    subkegiatan: ada('subkegiatan', r.subkegiatan, { program: r.program, kegiatan: r.kegiatan }),
  };
}

/** Pilihan berantai: nama bertanda bila salah satu entri yang LOLOS saringan induk berasal Renaksi. */
export function namaBertanda(rows: readonly EntriBerasal[]): Set<string> {
  return new Set(rows.filter(dariRenaksi).map(e => e.nama));
}

/**
 * Baris pembanding dari Renaksi. `level: 'sumber'` = satu sumber dana yang dipakai rincian pagu
 * Renaksi tahun itu, namanya di `program` (`barisSumberRenaksi` di lib/data/kinerja-master-ubah.ts).
 */
export interface BarisRenaksi {
  level: string;
  program: string;
  kegiatan: string | null;
  sub_kegiatan: string | null;
}

/** Pembanding nama Renaksi ↔ Master: bintang penanda dibuang, huruf besar-kecil diabaikan. */
export const kunciNamaRenaksi = (s: string | null | undefined): string =>
  rapikanNamaEntitas(s ?? '').toLowerCase();

/**
 * Jalur entri Master ada di Renaksi tahun yang sama? Kolom induk Master yang kosong (data
 * lama) dianggap cocok — aturan `cocokInduk`. Cermin SQL-nya: langkah isi awal di
 * docs/migrations/migration-kinerja-master-asal.sql (diuji berdampingan).
 */
export function jalurAdaDiRenaksi(e: EntriBerasal, renaksi: readonly BarisRenaksi[]): boolean {
  if (!bisaDariRenaksi(e.tipe)) return false;
  const nama = kunciNamaRenaksi(e.nama);
  const pas = (ref: string | null, v: string | null) => !ref?.trim() || kunciNamaRenaksi(ref) === kunciNamaRenaksi(v);
  return renaksi.some(r => {
    if (e.tipe === 'sumber_anggaran') return r.level === 'sumber' && kunciNamaRenaksi(r.program) === nama;
    if (e.tipe === 'program') return r.level === 'program' && kunciNamaRenaksi(r.program) === nama;
    if (e.tipe === 'kegiatan') {
      return r.level === 'kegiatan' && kunciNamaRenaksi(r.kegiatan) === nama && pas(e.program_ref, r.program);
    }
    return r.level === 'sub-kegiatan' && kunciNamaRenaksi(r.sub_kegiatan) === nama
      && pas(e.program_ref, r.program) && pas(e.kegiatan_ref, r.kegiatan);
  });
}

/**
 * Tahap G: entri yang DIGABUNG (Edit Master gabung, Rapikan Bintang) dibuang, dan tandanya dulu
 * ikut hilang — entri penerima yang MANUAL tetap MANUAL walau isinya kini milik Renaksi. Penerima
 * mewarisi RENAKSI bila salah satu yang melebur kepadanya RENAKSI DAN jalur akhirnya memang ada di
 * Renaksi (pagar yang sama dengan tanda dari form, L68). Arah sebaliknya tidak: RENAKSI tidak
 * pernah diturunkan jadi MANUAL karena digabungi entri manual. Penerima yang sudah RENAKSI boleh
 * ikut dikembalikan — menuliskannya lagi tidak mengubah apa pun.
 */
export function tandaWarisan(
  lebur: readonly { dari: number; ke: number }[],
  asal: ReadonlyMap<number, AsalMaster | null | undefined>,
  akhir: readonly (EntriBerasal & { id: number })[],
  renaksi: readonly BarisRenaksi[],
): number[] {
  const perId = new Map(akhir.map(e => [e.id, e]));
  const calon = new Set(lebur.filter(l => asal.get(l.dari) === 'RENAKSI').map(l => l.ke));
  return [...calon]
    .filter(id => { const e = perId.get(id); return !!e && jalurAdaDiRenaksi(e, renaksi); })
    .sort((a, b) => a - b);
}

export const labelLencanaRenaksi =(tahun: string | number) => `Diambil dari Rencana Aksi ${tahun}`;
