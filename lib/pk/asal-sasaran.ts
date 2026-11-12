// lib/pk/asal-sasaran.ts — "milik siapa" sasaran & indikator lampiran Form PK.
//
// PURE & aman-klien. Konsep: docs/CONCEPT-pk-lampiran-asal-sasaran.md (pilihan (c)).
// HANYA untuk tampilan: hasilnya tidak pernah masuk baris lampiran, dokumen, atau Word.
//   • asal  = program/kegiatan/sub di Rencana Aksi (nama + kode) + indikator induk yang dijabarkan;
//   • dipakai = dokumen PK lain tahun itu (unit Pihak Pertama, jenis, status) yang lampirannya
//     memuat sasaran (+ indikator) yang sama.
// Pencocokan sasaran = aturan `sasaranAdaDiRenaksi` (outcome, nama bila kosong; penanda & huruf
// besar dibuang), supaya layar ini dan spanduk "Rencana Aksi berubah" tidak berbeda pendapat.

import { rapikanIndikator, rapikanNamaEntitas } from '@/lib/shared/nama-resmi';
import { sidikLampiran } from './pilihan-sasaran';
import type { LevelPk } from './tabel-word';

export interface BarisRenaksiAsal {
  id: number;
  level: string;
  kode: string | null;
  program: string;
  kegiatan: string | null;
  sub_kegiatan: string | null;
  outcome_program: string | null;
  outcome_kegiatan: string | null;
  outcome_sub_kegiatan: string | null;
  indikator: string;
  induk_indikator_id: number | null;
}

export interface BarisLampiranLain {
  dokumen_id: number;
  unit: string;
  jenis: string;
  status: string;
  uraian: string;
  indikator: string | null;
}

export interface Entitas { nama: string; kode: string | null }
export interface AsalSasaran {
  program: Entitas;
  kegiatan: Entitas | null;
  sub: Entitas | null;
  /** Indikator tingkat di atasnya yang dijabarkan (tautan Renaksi). null = belum tertaut. */
  indikatorInduk: string | null;
}
export interface PemakaiPk { dokumen_id: number; unit: string; jenis: string; status: string }

const LEVEL_RA: Record<LevelPk, string> = { program: 'program', kegiatan: 'kegiatan', subkegiatan: 'sub-kegiatan' };
const kNama = (s: string | null | undefined) => rapikanNamaEntitas(s ?? '').toLowerCase();
const kInd = (s: string | null | undefined) => rapikanIndikator(s ?? '').toLowerCase();

const sasaranBaris = (r: BarisRenaksiAsal): string | null =>
  r.level === 'program' ? (r.outcome_program ?? r.program)
    : r.level === 'kegiatan' ? (r.outcome_kegiatan ?? r.kegiatan)
    : (r.outcome_sub_kegiatan ?? r.sub_kegiatan);

/**
 * Asal sasaran (dan indikatornya, bila diberikan) di Renaksi. Bisa lebih dari satu: teks sasaran
 * yang sama dipakai beberapa entitas. Indikator diberikan tapi tak ada yang cocok = jatuh ke
 * entitas yang memikul sasarannya saja (indikator induk tidak ditebak). Paling banyak 3.
 */
export function asalSasaran(
  renaksi: readonly BarisRenaksiAsal[], level: LevelPk, sasaran: string, indikator?: string | null,
): AsalSasaran[] {
  const lv = LEVEL_RA[level];
  const kS = kNama(sasaran);
  if (!kS) return [];
  const calon = renaksi.filter(r => r.level === lv && kNama(sasaranBaris(r)) === kS);
  const persis = indikator ? calon.filter(r => kInd(r.indikator) === kInd(indikator)) : [];
  const dipakai = persis.length ? persis : calon;
  const perId = new Map(renaksi.map(r => [Number(r.id), r]));
  const kodeDari = (lvl: string, cocok: (r: BarisRenaksiAsal) => boolean) =>
    renaksi.find(r => r.level === lvl && cocok(r) && (r.kode ?? '').trim())?.kode?.trim() ?? null;

  const out: AsalSasaran[] = [];
  const sudah = new Set<string>();
  for (const r of dipakai) {
    const program: Entitas = {
      nama: rapikanNamaEntitas(r.program),
      kode: kodeDari('program', x => x.program === r.program),
    };
    const kegiatan: Entitas | null = lv === 'program' || !r.kegiatan ? null : {
      nama: rapikanNamaEntitas(r.kegiatan),
      kode: kodeDari('kegiatan', x => x.program === r.program && x.kegiatan === r.kegiatan),
    };
    const sub: Entitas | null = lv !== 'sub-kegiatan' || !r.sub_kegiatan ? null : {
      nama: rapikanNamaEntitas(r.sub_kegiatan), kode: (r.kode ?? '').trim() || null,
    };
    const induk = persis.length && r.induk_indikator_id != null ? perId.get(Number(r.induk_indikator_id)) : undefined;
    const a: AsalSasaran = { program, kegiatan, sub, indikatorInduk: induk ? rapikanIndikator(induk.indikator) : null };
    const k = JSON.stringify(a);
    if (sudah.has(k)) continue;
    sudah.add(k);
    out.push(a);
    if (out.length === 3) break;
  }
  return out;
}

/**
 * Dokumen PK LAIN (bukan `kecuali`) yang lampirannya memuat sasaran ini — dengan indikator yang
 * sama bila `indikator` diberikan (`undefined` = indikator apa pun). Satu entri per dokumen,
 * FINAL dulu, lalu nama unit.
 */
export function dipakaiDi(
  lampiran: readonly BarisLampiranLain[], sasaran: string, indikator: string | null | undefined, kecuali: number | null,
): PemakaiPk[] {
  const kS = kNama(sasaran);
  const sidik = indikator === undefined ? null : sidikLampiran(sasaran, indikator);
  const per = new Map<number, PemakaiPk>();
  for (const l of lampiran) {
    if (l.dokumen_id === kecuali || per.has(l.dokumen_id)) continue;
    const cocok = sidik === null ? kNama(l.uraian) === kS : sidikLampiran(l.uraian, l.indikator) === sidik;
    if (cocok) per.set(l.dokumen_id, { dokumen_id: l.dokumen_id, unit: l.unit, jenis: l.jenis, status: l.status });
  }
  return [...per.values()].sort((a, b) =>
    (a.status === b.status ? 0 : a.status === 'FINAL' ? -1 : 1) || a.unit.localeCompare(b.unit, 'id'));
}

/** "1.02.02 PROGRAM X" — kode di depan bila ada. */
export const tulisEntitas = (e: Entitas): string => (e.kode ? `${e.kode} ${e.nama}` : e.nama);

/** "Wadir Pelayanan (FINAL), Kabid X (DRAFT · PERUBAHAN)". */
export function tulisPemakai(p: readonly PemakaiPk[]): string {
  return p.map(x => `${x.unit} (${x.status}${x.jenis === 'PERUBAHAN' ? ' · PERUBAHAN' : ''})`).join(', ');
}
