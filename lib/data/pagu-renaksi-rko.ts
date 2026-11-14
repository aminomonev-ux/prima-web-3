// lib/data/pagu-renaksi-rko.ts — bahan pembanding pagu Rencana Aksi ↔ RKO E-Anggaran (hanya membaca).
// Konsep: docs/CONCEPT-renaksi-pagu-rko.md. Aturannya di lib/kinerja/pagu-renaksi.ts.

import type { Penanya } from '@/lib/data/db';
import { muatRincianPagu } from './renaksi-pagu';
import { paguSubKegiatan, type BarisPagu, type PaguSubRenaksi } from '@/lib/renaksi/pagu';
import {
  agregatRko, bandingPaguRenaksi, versiTerbaruPerTab,
  type AgregatRko, type BarisRkoPagu, type HasilBandingPagu, type RekeningSumberDana,
} from '@/lib/kinerja/pagu-renaksi';

export interface BahanPaguRenaksi {
  renaksi: PaguSubRenaksi[];
  /** Agregat RKO versi terbaru semua tab — layar RKO mengganti bagian tab yang sedang dibuka dengan isi layarnya. */
  rko: AgregatRko[];
  /** Sumber dana tiap rekening — dipakai layar RKO memetakan barisnya sendiri. */
  rekening: RekeningSumberDana[];
}

/** Dari dalam transaksi (pagar Tahap C) WAJIB dioper `tx` (L69-b). */
export async function muatBahanPaguRenaksi(q: Penanya, tahun: number): Promise<BahanPaguRenaksi> {
  const sub = await q`
    SELECT id, level, program, kegiatan, sub_kegiatan, tujuan, sasaran, induk_indikator_id, anggaran_nominal
    FROM rencana_aksi WHERE tahun = ${tahun} AND level = 'sub-kegiatan'
  ` as BarisPagu[];
  const rincian = await muatRincianPagu(q, sub.map(r => Number(r.id)));
  for (const r of sub) {
    r.anggaran_nominal = r.anggaran_nominal == null ? null : Number(r.anggaran_nominal);
    r.pagu_rincian = rincian.get(Number(r.id)) ?? [];
  }
  const rkoSemua = await q`
    SELECT sumber AS tab, versi_tipe, versi_seq, program, kegiatan, subkegiatan, uraian_ssk, uraian, pagu, is_nullified
    FROM kinerja_ssk WHERE tahun = ${String(tahun)}
  ` as BarisRkoPagu[];
  const rekening = await q`
    SELECT sumber AS tab, uraian_ssk, uraian, sumber_anggaran FROM kinerja_rekening WHERE tahun = ${String(tahun)}
  ` as RekeningSumberDana[];
  return { renaksi: paguSubKegiatan(sub), rko: agregatRko(versiTerbaruPerTab(rkoSemua), rekening), rekening };
}

export async function bandingPaguTahun(q: Penanya, tahun: number): Promise<HasilBandingPagu> {
  const b = await muatBahanPaguRenaksi(q, tahun);
  return bandingPaguRenaksi(b.renaksi, b.rko);
}
