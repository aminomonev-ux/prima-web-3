// lib/renaksi/tabel-data-entry.ts — cari, saring, dan kelompok tabel Data Entry Renaksi.
// PURE, aman-klien. Konsep: docs/konsep/renaksi/CONCEPT-renaksi-tabel-data-entry.md.
//
// Hanya tampilan: tidak ada yang ditulis balik, Excel/PDF tetap SEMUA baris.

import { rapikanIndikator, rapikanNamaEntitas, type LevelRenaksi } from '@/lib/shared/nama-resmi';

/** Kolom baris Renaksi yang dibaca tabel — struktural supaya lib tidak bergantung pada berkas layar. */
export interface BarisTabelRenaksi {
  id: number;
  level: LevelRenaksi;
  kode: string | null;
  tujuan: string | null;
  sasaran: string | null;
  program: string;
  kegiatan: string | null;
  sub_kegiatan: string | null;
  indikator: string;
  outcome_program: string | null;
  outcome_kegiatan: string | null;
  outcome_sub_kegiatan: string | null;
  induk_indikator_id: number | null;
  target_tahunan: number | null;
  anggaran_nominal: number | null;
}

/** Nama entitas baris itu sendiri (kolom yang dipakai level tsb). */
export function namaEntitasBaris(r: BarisTabelRenaksi): string {
  if (r.level === 'kegiatan') return r.kegiatan ?? '';
  if (r.level === 'sub-kegiatan') return r.sub_kegiatan ?? '';
  return r.program;
}

const normal = (s: string | null | undefined, indikator = false) =>
  (s ? (indikator ? rapikanIndikator(s) : rapikanNamaEntitas(s)) : '').toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * Cocok bila SETIAP kata pencarian ada di salah satu kolom teks. Bintang tingkat dan nomor
 * `(1)` diabaikan lewat aturan nama-resmi yang sama dengan tampilan penanda.
 */
export function cocokCari(r: BarisTabelRenaksi, cari: string): boolean {
  const kata = cari.toLowerCase().split(/\s+/).filter(Boolean);
  if (!kata.length) return true;
  const teks = [
    normal(r.tujuan), normal(r.sasaran), normal(r.program), normal(r.kegiatan), normal(r.sub_kegiatan),
    normal(r.indikator, true), (r.kode ?? '').toLowerCase(),
    normal(r.outcome_program), normal(r.outcome_kegiatan), normal(r.outcome_sub_kegiatan),
  ].join('\n');
  return kata.every(k => teks.includes(k));
}

export type Keadaan = 'pagu-kosong' | 'target-kosong' | 'tanpa-tautan';

export const LABEL_KEADAAN: Record<Keadaan, string> = {
  'pagu-kosong': 'Pagu belum diisi',
  'target-kosong': 'Target belum diisi',
  'tanpa-tautan': 'Belum tertaut indikator induk',
};

/** Chip yang berlaku di level itu: pagu hanya milik sub kegiatan, tujuan tidak punya induk. */
export function keadaanBerlaku(level: LevelRenaksi): Keadaan[] {
  const out: Keadaan[] = [];
  if (level === 'sub-kegiatan') out.push('pagu-kosong');
  out.push('target-kosong');
  if (level !== 'tujuan') out.push('tanpa-tautan');
  return out;
}

export function punyaKeadaan(r: BarisTabelRenaksi, k: Keadaan): boolean {
  if (k === 'pagu-kosong') return r.level === 'sub-kegiatan' && r.anggaran_nominal == null;
  if (k === 'target-kosong') return !r.target_tahunan;
  return r.level !== 'tujuan' && r.induk_indikator_id == null;
}

/** Bagian kepala kelompok = induk baris itu, dari atas ke bawah. Tujuan tidak berkelompok. */
export function bagianInduk(r: BarisTabelRenaksi): Array<{ nama: string; level: LevelRenaksi }> {
  const bersih = (s: string | null) => (s ?? '').trim();
  switch (r.level) {
    case 'sasaran': return [{ nama: bersih(r.tujuan), level: 'tujuan' }];
    case 'program': return [{ nama: bersih(r.sasaran), level: 'sasaran' }];
    case 'kegiatan': return [{ nama: bersih(r.program), level: 'program' }];
    case 'sub-kegiatan': return [{ nama: bersih(r.program), level: 'program' }, { nama: bersih(r.kegiatan), level: 'kegiatan' }];
    default: return [];
  }
}

export interface Saringan {
  cari: string;
  /** Induk pertama (nama tersimpan); '' = semua. */
  induk1: string;
  /** Induk kedua — hanya sub kegiatan (kegiatan); '' = semua. */
  induk2: string;
  keadaan: Keadaan[];
}

export const SARINGAN_KOSONG: Saringan = { cari: '', induk1: '', induk2: '', keadaan: [] };

export function lolosSaringan(r: BarisTabelRenaksi, s: Saringan): boolean {
  const induk = bagianInduk(r);
  if (s.induk1 && induk[0]?.nama !== s.induk1) return false;
  if (s.induk2 && induk[1]?.nama !== s.induk2) return false;
  // Beberapa chip = semuanya harus berlaku (menyempitkan), sama seperti kata pencarian.
  if (s.keadaan.some(k => !punyaKeadaan(r, k))) return false;
  return cocokCari(r, s.cari);
}

/** Jumlah per chip dihitung dari baris yang lolos saringan LAIN — angkanya = hasil bila chip itu ditekan. */
export function hitungKeadaan<T extends BarisTabelRenaksi>(rows: readonly T[], s: Saringan): Record<Keadaan, number> {
  const out: Record<Keadaan, number> = { 'pagu-kosong': 0, 'target-kosong': 0, 'tanpa-tautan': 0 };
  for (const k of Object.keys(out) as Keadaan[]) {
    const tanpaIni = { ...s, keadaan: [...s.keadaan.filter(x => x !== k), k] };
    out[k] = rows.filter(r => lolosSaringan(r, tanpaIni)).length;
  }
  return out;
}

/** Pilihan induk untuk penyaring: nama unik menurut urutan kemunculan; induk kedua mengikuti induk pertama. */
export function opsiInduk<T extends BarisTabelRenaksi>(rows: readonly T[], tingkat: 0 | 1, induk1 = ''): string[] {
  const out: string[] = [];
  for (const r of rows) {
    const b = bagianInduk(r);
    if (tingkat === 1 && induk1 && b[0]?.nama !== induk1) continue;
    const nama = b[tingkat]?.nama;
    if (nama && !out.includes(nama)) out.push(nama);
  }
  return out;
}

export interface Kelompok<T> {
  kunci: string;
  bagian: Array<{ nama: string; level: LevelRenaksi }>;
  baris: T[];
}

/** Kelompok per induk dalam urutan kemunculan pertama; urutan baris di dalamnya dipertahankan. */
export function kelompokkan<T extends BarisTabelRenaksi>(rows: readonly T[]): Kelompok<T>[] {
  const peta = new Map<string, Kelompok<T>>();
  for (const r of rows) {
    const bagian = bagianInduk(r);
    const kunci = bagian.map(b => b.nama).join('\u0000');
    let g = peta.get(kunci);
    if (!g) { g = { kunci, bagian, baris: [] }; peta.set(kunci, g); }
    g.baris.push(r);
  }
  return [...peta.values()];
}
