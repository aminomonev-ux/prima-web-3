// lib/data/pagu-renaksi-rko.ts — bahan pembanding pagu Rencana Aksi ↔ RKO E-Anggaran (hanya membaca).
// Konsep: docs/CONCEPT-renaksi-pagu-rko.md. Aturannya di lib/kinerja/pagu-renaksi.ts.

import type { Penanya } from '@/lib/data/db';
import { muatRincianPagu } from './renaksi-pagu';
import { paguSubKegiatan, type BarisPagu, type PaguSubRenaksi } from '@/lib/renaksi/pagu';
import {
  agregatRko, alasanPaguSah, bandingPaguRenaksi, kalimatLebih, pelanggaranBaru, ringkasPelanggaran, versiTerbaruPerTab,
  type AgregatRko, type BandingPaguSub, type BarisRkoPagu, type HasilBandingPagu, type RekeningSumberDana,
} from '@/lib/kinerja/pagu-renaksi';
import { rapikanNamaEntitas } from '@/lib/shared/nama-resmi';
import { NextResponse } from 'next/server';

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

// ─── Pagar Simpan (Tahap C: jalur RKO & Rekening; Tahap D: jalur Renaksi) ─────

export class PaguRenaksiTerlampauiError extends Error {
  constructor(public readonly tahun: number, public readonly pelanggaran: BandingPaguSub[]) {
    super(`Pagu RKO melampaui pagu sub kegiatan Rencana Aksi ${tahun}: `
      + pelanggaran.map(p => `${rapikanNamaEntitas(p.sub_kegiatan)} (${kalimatLebih(p)})`).join('; ')
      + '. Sesuaikan angkanya, atau teruskan dengan alasan (tercatat di audit).');
    this.name = 'PaguRenaksiTerlampauiError';
  }
}

/**
 * Pagar dua langkah di DALAM transaksi tulis: `potretPaguRenaksi` sebelum menulis, `pagarPaguRenaksi`
 * sesudahnya (membaca tulisan sendiri). WAJIB: transaksinya sudah memegang `kunciTahunRenaksi(tahun)`
 * sebagai perintah PERTAMA (L84) — kunci yang sama untuk SEMUA jalur yang menggeser pagu Renaksi atau
 * RKO tahun itu, jadi dua simpanan (mis. tab GAJI & BLUD) yang masing-masing lolos tidak bisa
 * bersama-sama melampaui. Menolak = melempar galat → seluruh transaksi batal.
 */
export const potretPaguRenaksi = bandingPaguTahun;

export async function pagarPaguRenaksi(
  tx: Penanya, tahun: number, sebelum: HasilBandingPagu, alasan: string | null | undefined,
): Promise<BandingPaguSub[]> {
  const baru = pelanggaranBaru(sebelum, await bandingPaguTahun(tx, tahun));
  if (baru.length > 0 && !alasanPaguSah(alasan)) throw new PaguRenaksiTerlampauiError(tahun, baru);
  return baru;
}

/** 409 yang sama untuk semua rute (E-Anggaran memakai kunci `message`, Renaksi `error`). */
export function jawabPaguTerlampaui(err: PaguRenaksiTerlampauiError, kunciPesan: 'message' | 'error'): NextResponse {
  return NextResponse.json({
    ok: false, code: 'PAGU_RENAKSI_TERLAMPAUI', [kunciPesan]: err.message,
    tahun: err.tahun, pelanggaran: ringkasPelanggaran(err.pelanggaran),
  }, { status: 409 });
}

/** Kalimat audit untuk simpanan yang diteruskan dengan alasan. */
export const detailPaguDitembus = (p: readonly BandingPaguSub[], alasan: string | null | undefined): string =>
  `Melampaui pagu Rencana Aksi diteruskan — ${p.map(b => `${rapikanNamaEntitas(b.sub_kegiatan)}: ${kalimatLebih(b)}`).join('; ')}. Alasan: ${(alasan ?? '').trim()}`;
