// lib/data/pk-lampiran-blud.ts — bahan lampiran "Rincian anggaran BLUD per penanggung jawab"
// untuk PK FINAL. Konsep: docs/konsep/pk/CONCEPT-pk-lampiran-blud-pj.md.
// Angka per PJ memakai `nominalBludUnit` — aturan yang sama dengan tombol ✎ Form PK dan
// Cetak Rekap PJ BLUD, jadi tidak ada rumus kedua.

import { queryMany, sql } from '@/lib/data/db';
import { nominalBludUnit, pilihanVersiBlud } from '@/lib/data/pk-blud-nominal';
import { fmtTanggalID } from '@/lib/pk/docgen';
import { bludDokumen, kecocokan, type BludDokumen, type IsiLampiranBlud, type Kecocokan } from '@/lib/pk/lampiran-blud';
import { NAMA_SUMBER_BLUD, type SumberBlud, type VersiBlud } from '@/lib/pk/nominal-blud';

export interface DokumenLampiran { id: number; tahun: number; unit_pertama: string }

async function bludPk(id: number): Promise<BludDokumen> {
  const rows = await queryMany<{ keterangan_sumber: string; auto_filled_from_blud: number | null; nominal: string }>(
    sql`SELECT keterangan_sumber, auto_filled_from_blud, nominal FROM pk_dokumen_anggaran WHERE dokumen_id = ${id}`,
  );
  return bludDokumen(rows);
}

export type PilihanLampiran =
  | { status: 'TANPA_BLUD' }
  | { status: 'UNIT_TIDAK_DIKENAL' | 'BELUM_DIPETAKAN'; pk: BludDokumen }
  | { status: 'OK'; pk: BludDokumen; versi: Array<VersiBlud & { total: number | null; kecocokan: Kecocokan | null }> };

/** Daftar versi DPA & Pergeseran tahun dokumen, dengan total unit dan kecocokannya dengan PK. */
export async function pilihanLampiranBlud(dok: DokumenLampiran): Promise<PilihanLampiran> {
  const pk = await bludPk(dok.id);
  if (!pk.ada) return { status: 'TANPA_BLUD' };
  const daftar = await pilihanVersiBlud(dok.tahun);
  const versi: Array<VersiBlud & { total: number | null; kecocokan: Kecocokan | null }> = [];
  for (const v of daftar) {
    const h = await nominalBludUnit(dok.unit_pertama, dok.tahun, v.sumber, v.versi);
    if (h.status === 'UNIT_TIDAK_DIKENAL' || h.status === 'BELUM_DIPETAKAN') return { status: h.status, pk };
    versi.push(h.status === 'OK'
      ? { ...v, total: h.total, kecocokan: kecocokan(h.total, pk) }
      : { ...v, total: null, kecocokan: null });
  }
  return { status: 'OK', pk, versi };
}

export class LampiranBludError extends Error {}

export async function isiLampiranBlud(dok: DokumenLampiran, sumber: SumberBlud, versi: string): Promise<IsiLampiranBlud> {
  const pk = await bludPk(dok.id);
  if (!pk.ada) throw new LampiranBludError('Perjanjian Kinerja ini tidak memuat anggaran BLUD.');
  const h = await nominalBludUnit(dok.unit_pertama, dok.tahun, sumber, versi);
  if (h.status === 'UNIT_TIDAK_DIKENAL') throw new LampiranBludError(`Unit "${dok.unit_pertama}" tidak ada di Master Unit Kerja.`);
  if (h.status === 'BELUM_DIPETAKAN') throw new LampiranBludError(`Unit "${dok.unit_pertama}" belum dipetakan ke penanggung jawab BLUD di Master Unit Kerja.`);
  if (h.status === 'VERSI_TIDAK_ADA') throw new LampiranBludError(`${NAMA_SUMBER_BLUD[sumber]} BLUD versi ${fmtTanggalID(versi)} tidak ada atau kosong.`);
  return {
    unit: dok.unit_pertama,
    sumber: `${NAMA_SUMBER_BLUD[sumber]} BLUD versi ${fmtTanggalID(versi)}`
      + (h.perubahan_ke ? ` · DPA Perubahan ke-${h.perubahan_ke}` : ''),
    per: h.per,
    total: h.total,
    pk,
    dobel: h.dobel.length,
  };
}
