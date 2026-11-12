// Kartu RHK yang diambil dari Rencana Aksi dibandingkan dengan baris Renaksi-nya sekarang.
// MURNI, aman-klien. Konsep: docs/CONCEPT-renaksi-terhubung.md §6 (Tahap E).
//
// Pasangannya lewat `renaksi_id` (id baris rencana_aksi — tetap walau namanya diganti), jadi
// tidak ada yang ditebak. Yang dibandingkan = yang diisi `isianRenaksi`: RHK, indikator, cara
// hitung, target tahunan, target TW. Uraian & Target Aksi kartu milik pegawai, tidak dinilai.
import { rapikanIndikator } from '@/lib/shared/nama-resmi';
import { kunciNamaRenaksi } from '@/lib/kinerja/asal-renaksi';
import { isianRenaksi } from './isi-renaksi';
import type { IkiRhk, RenaksiImportRow } from './types';

type Isian = ReturnType<typeof isianRenaksi>;

export interface KartuBerubah {
  index: number;
  ke: Isian;
  /** Kolom yang berbeda: [label, isi kartu, isi Renaksi]. */
  kolom: [string, string, string][];
}

export interface HasilBandingKartu {
  berubah: KartuBerubah[];
  /** Kartu bertaut yang baris Renaksi-nya sudah tidak ada (dihapus / tahun lain). */
  hilang: number[];
}

const TW = ['I', 'II', 'III', 'IV'];
const rapat = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();

export function bandingKartuRenaksi(rhk: readonly IkiRhk[], renaksi: readonly RenaksiImportRow[]): HasilBandingKartu {
  const perId = new Map(renaksi.map(r => [r.renaksi_id, r]));
  const berubah: KartuBerubah[] = [];
  const hilang: number[] = [];
  rhk.forEach((r, index) => {
    if (r.renaksi_id == null) return;
    const src = perId.get(r.renaksi_id);
    if (!src) { hilang.push(index); return; }
    const ke = isianRenaksi(src, r.triwulan);
    const kolom: [string, string, string][] = [];
    if (kunciNamaRenaksi(r.rhk) !== kunciNamaRenaksi(ke.rhk)) kolom.push(['RHK', r.rhk, ke.rhk]);
    if (rapikanIndikator(r.indikator).toLowerCase() !== rapikanIndikator(ke.indikator).toLowerCase()) kolom.push(['Indikator', r.indikator, ke.indikator]);
    if (r.aspek_b !== ke.aspek_b) kolom.push(['Cara hitung', r.aspek_b, ke.aspek_b]);
    if (rapat(r.target_tahunan) !== rapat(ke.target_tahunan)) kolom.push(['Target tahunan', r.target_tahunan, ke.target_tahunan]);
    ke.triwulan.forEach((t, i) => {
      const lama = r.triwulan[i]?.target_tw ?? '';
      if (rapat(lama) !== rapat(t.target_tw)) kolom.push([`Target TW ${TW[i]}`, lama, t.target_tw]);
    });
    if (kolom.length) berubah.push({ index, ke, kolom });
  });
  return { berubah, hilang };
}

export const jumlahPerubahanKartu = (h: HasilBandingKartu) => h.berubah.length + h.hilang.length;

export const kunciKartu = {
  samakan: (index: number) => `u${index}`,
  lepas: (index: number) => `l${index}`,
};

/**
 * Berhenti di form (L78): kartu disamakan dengan Renaksi (uraian & target aksi tetap) dan/atau
 * dilepas tautannya (`renaksi_id` null — pengingat berhenti untuk kartu itu). Lepas sesudah
 * samakan = isinya mengikuti Renaksi sekali ini, lalu bebas disunting.
 */
export function terapkanBandingKartu(rhk: readonly IkiRhk[], h: HasilBandingKartu, pilih: ReadonlySet<string>): IkiRhk[] {
  const out = [...rhk];
  for (const b of h.berubah) if (pilih.has(kunciKartu.samakan(b.index))) out[b.index] = { ...out[b.index], ...b.ke };
  for (const i of [...h.berubah.map(b => b.index), ...h.hilang]) {
    if (pilih.has(kunciKartu.lepas(i))) out[i] = { ...out[i], renaksi_id: null };
  }
  return out;
}

export function kalimatSpandukKartu(h: HasilBandingKartu, tahun: number | string): string | null {
  const isi = [
    h.berubah.length ? `${h.berubah.length} kartu isinya berbeda` : '',
    h.hilang.length ? `${h.hilang.length} kartu tidak ada lagi di Rencana Aksi` : '',
  ].filter(Boolean);
  return isi.length ? `Rencana Aksi ${tahun} berubah: ${isi.join(', ')}.` : null;
}
