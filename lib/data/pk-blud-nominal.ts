// lib/data/pk-blud-nominal.ts — nominal BLUD untuk lampiran anggaran Form PK, dihitung LANGSUNG
// dari baris DPA / Pergeseran versi yang dipilih. Konsep: docs/CONCEPT-pk-nominal-blud-langsung.md.
//
// Dulu dibaca dari foto `rekap_pk` yang hanya lahir kalau orang menekan "Simpan Rekap PK" di Cetak
// DPA — foto basi (DPA Perubahan tak pernah difoto) dan Pergeseran tak pernah bisa dipakai.
// Aturan hitungnya `nominalUntukUnit` (lib/blud/rekap-pj.ts) = aturan tabel Cetak Rekap PJ.

import { queryMany, queryOne, sql } from '@/lib/data/db';
import { getDpaByDate, getDpaHistory, getPergeseranByDate, getPergeseranHistory } from '@/lib/blud/data';
import { getTutupPergeseran } from '@/lib/blud/tutup-data';
import { penandaPerubahan, sumberPaguTahun } from '@/lib/blud/sumber-pagu';
import { catatanVersi } from '@/lib/blud/tutup-pergeseran';
import { catatanBabak, keBabak } from '@/lib/blud/perubahan';
import { barisRekapDpa, barisRekapPergeseran, nominalUntukUnit, type NominalUnit } from '@/lib/blud/rekap-pj';
import type { SumberBlud, VersiBlud } from '@/lib/pk/nominal-blud';
import type { PkLevel } from './pk';

/** Daftar versi DPA & Pergeseran tahun itu, terbaru dulu, dengan versi yang sedang jadi pagu bertanda. */
export async function pilihanVersiBlud(tahun: number): Promise<VersiBlud[]> {
  const [dpa, geser, tutup, penanda, pagu] = await Promise.all([
    getDpaHistory(tahun), getPergeseranHistory(tahun), getTutupPergeseran(tahun),
    penandaPerubahan(sql, tahun), sumberPaguTahun(sql, tahun),
  ]);
  const berlaku = (s: SumberBlud, v: string) =>
    pagu.versi === v && (s === 'dpa' ? pagu.sumber === 'DPA' : pagu.sumber === 'PERGESERAN');
  const gabung = (...xs: Array<string | undefined>) => xs.filter(Boolean).join(' · ');
  return [
    ...geser.map(g => ({
      sumber: 'pergeseran' as const, versi: g.versi_tanggal, jumlah_baris: g.jumlah_baris,
      // Babak pergeseran diturunkan dari ACUAN-nya, bukan tanggal simpannya (konsep Perubahan §9).
      catatan: gabung(catatanVersi(tutup, g.versi_tanggal), catatanBabak(penanda, g.dpa_versi_tanggal)),
      berlaku: berlaku('pergeseran', g.versi_tanggal),
    })),
    ...dpa.map(d => ({
      sumber: 'dpa' as const, versi: d.versi_tanggal, jumlah_baris: d.jumlah_baris,
      catatan: gabung(catatanBabak(penanda, d.versi_tanggal)),
      berlaku: berlaku('dpa', d.versi_tanggal),
    })),
  ];
}

export type HasilNominalBlud =
  | { status: 'UNIT_TIDAK_DIKENAL' }
  /** Unit Program/Kegiatan tanpa satu pun label PJ di Master Unit Kerja → kolom BLUD PJ. */
  | { status: 'BELUM_DIPETAKAN'; level: PkLevel }
  | { status: 'VERSI_TIDAK_ADA' }
  | ({ status: 'OK'; level: PkLevel; perubahan_ke: number | null } & NominalUnit);

/**
 * Sub kegiatan: label PJ = nama unitnya sendiri. Program/Kegiatan: label-label yang dipetakan
 * di `pk_unit_kerja_blud_pj` (unit itu menaungi beberapa PJ).
 */
export async function nominalBludUnit(
  unitKerja: string, tahun: number, sumber: SumberBlud, versi: string,
): Promise<HasilNominalBlud> {
  const unit = await queryOne<{ level: PkLevel }>(
    sql`SELECT level FROM pk_unit_kerja WHERE nama_unit = ${unitKerja} LIMIT 1`,
  );
  if (!unit) return { status: 'UNIT_TIDAK_DIKENAL' };
  const labels = unit.level === 'subkegiatan'
    ? [unitKerja]
    : (await queryMany<{ label: string }>(
        sql`SELECT blud_pj_label AS label FROM pk_unit_kerja_blud_pj WHERE unit_pk = ${unitKerja} ORDER BY blud_pj_label`,
      )).map(r => r.label);
  if (labels.length === 0) return { status: 'BELUM_DIPETAKAN', level: unit.level };

  const [rows, penanda] = await Promise.all([
    sumber === 'dpa'
      ? getDpaByDate(tahun, versi).then(barisRekapDpa)
      : getPergeseranByDate(tahun, versi).then(r => ({ rows: barisRekapPergeseran(r), acuan: r[0]?.dpa_versi_tanggal ?? '' })),
    penandaPerubahan(sql, tahun),
  ]);
  const baris = Array.isArray(rows) ? rows : rows.rows;
  if (baris.length === 0) return { status: 'VERSI_TIDAK_ADA' };
  const versiBabak = Array.isArray(rows) ? versi : rows.acuan;
  return {
    status: 'OK', level: unit.level,
    perubahan_ke: versiBabak ? keBabak(penanda, versiBabak) : null,
    ...nominalUntukUnit(baris, labels),
  };
}
