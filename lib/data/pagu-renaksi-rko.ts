// lib/data/pagu-renaksi-rko.ts — bahan pembanding pagu Rencana Aksi ↔ RKO E-Anggaran (hanya membaca).
// Konsep: docs/konsep/renaksi/CONCEPT-renaksi-pagu-rko.md + docs/konsep/renaksi/CONCEPT-renaksi-rko-murni-perubahan.md.
// Aturannya di lib/kinerja/pagu-renaksi.ts.

import type { Penanya } from '@/lib/data/db';
import { muatRincianPagu, statusPaguPerubahan } from './renaksi-pagu';
import { paguSubKegiatan, type BarisPagu } from '@/lib/renaksi/pagu';
import {
  agregatRko, alasanPaguSah, bandingDua, catatanPelanggaran, kalimatPelanggaran, pelanggaranSimpanan,
  ringkasPelanggaran, tabBerversiPerubahan, versiMurniPerTab, versiTerbaruPerTab,
  type BahanBandingPagu, type BarisRkoPagu, type HasilBandingDua, type JenisSimpananPagu,
  type PelanggaranPagu, type RekeningSumberDana,
} from '@/lib/kinerja/pagu-renaksi';
import { rapikanNamaEntitas } from '@/lib/shared/nama-resmi';
import { NextResponse } from 'next/server';

export interface BahanPaguRenaksi extends BahanBandingPagu {
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
  const status = await statusPaguPerubahan(q, tahun);
  return {
    renaksiMurni: paguSubKegiatan(sub, 'murni'),
    renaksiBerlaku: paguSubKegiatan(sub, 'berlaku'),
    renaksiPerubahan: status.aktif,
    rkoMurni: agregatRko(versiMurniPerTab(rkoSemua), rekening),
    rkoTerbaru: agregatRko(versiTerbaruPerTab(rkoSemua), rekening),
    tabPerubahan: tabBerversiPerubahan(rkoSemua),
    rekening,
  };
}

export async function bandingPaguTahun(q: Penanya, tahun: number): Promise<HasilBandingDua> {
  return bandingDua(await muatBahanPaguRenaksi(q, tahun));
}

// ─── Pagar Simpan (Tahap C: jalur RKO & Rekening; Tahap D: jalur Renaksi) ─────

export class PaguRenaksiTerlampauiError extends Error {
  constructor(
    public readonly tahun: number,
    public readonly pelanggaran: PelanggaranPagu[],
    public readonly catatan: string | null = null,
  ) {
    super(`Pagu RKO melebihi pagu sub kegiatan Rencana Aksi ${tahun}: `
      + pelanggaran.map(p => `${rapikanNamaEntitas(p.sub_kegiatan)} (${kalimatPelanggaran(p)})`).join('; ')
      + '.' + (catatan ? ` ${catatan}` : '')
      + ' Sesuaikan angkanya, atau simpan dengan alasan (tercatat di audit).');
    this.name = 'PaguRenaksiTerlampauiError';
  }
}

/**
 * Pagar dua langkah di DALAM transaksi tulis: `potretPaguRenaksi` sebelum menulis, `pagarPaguRenaksi`
 * sesudahnya (membaca tulisan sendiri). WAJIB: transaksinya sudah memegang `kunciTahunRenaksi(tahun)`
 * sebagai perintah PERTAMA (L84) — kunci yang sama untuk SEMUA jalur yang menggeser pagu Renaksi atau
 * RKO tahun itu, jadi dua simpanan (mis. tab GAJI & BLUD) yang masing-masing lolos tidak bisa
 * bersama-sama melampaui. Menolak = melempar galat → seluruh transaksi batal.
 * `jenis` menentukan pembanding mana yang menahan (murni/perubahan — `pelanggaranSimpanan`).
 */
export const potretPaguRenaksi = bandingPaguTahun;

export async function pagarPaguRenaksi(
  tx: Penanya, tahun: number, sebelum: HasilBandingDua, alasan: string | null | undefined, jenis: JenisSimpananPagu,
): Promise<PelanggaranPagu[]> {
  const sesudah = await bandingPaguTahun(tx, tahun);
  const baru = pelanggaranSimpanan(sebelum, sesudah, jenis);
  if (baru.length > 0 && !alasanPaguSah(alasan)) {
    throw new PaguRenaksiTerlampauiError(tahun, baru, catatanPelanggaran(baru, sesudah, tahun));
  }
  return baru;
}

/** 409 yang sama untuk semua rute (E-Anggaran memakai kunci `message`, Renaksi `error`). */
export function jawabPaguTerlampaui(err: PaguRenaksiTerlampauiError, kunciPesan: 'message' | 'error'): NextResponse {
  return NextResponse.json({
    ok: false, code: 'PAGU_RENAKSI_TERLAMPAUI', [kunciPesan]: err.message,
    tahun: err.tahun, pelanggaran: ringkasPelanggaran(err.pelanggaran), catatan: err.catatan,
  }, { status: 409 });
}

/** Kalimat audit untuk simpanan yang diteruskan dengan alasan. */
export const detailPaguDitembus = (p: readonly PelanggaranPagu[], alasan: string | null | undefined): string =>
  `Melebihi pagu Rencana Aksi diteruskan — ${p.map(b => `${rapikanNamaEntitas(b.sub_kegiatan)}: ${kalimatPelanggaran(b)}`).join('; ')}. Alasan: ${(alasan ?? '').trim()}`;
