// lib/pk/pilihan-sasaran.ts — pilihan sasaran di form dokumen PK, dari Master Sasaran.
//
// PURE. Master Sasaran satu baris per rantai program → kegiatan → sub kegiatan, jadi sasaran
// yang punya beberapa indikator muncul di beberapa baris. Pilihan dikelompokkan per sasaran dan
// membawa SEMUA indikatornya: dokumen PK mencetaknya di bawah satu nomor.

import { rapikanIndikator, rapikanNamaEntitas } from '@/lib/shared/nama-resmi';
import { targetDanSatuan, type LevelPk } from './tabel-word';

type Teks = string | null | undefined;

export interface BarisMasterSasaran {
  program: string;
  indikator_program?: Teks; target_program?: Teks; satuan_program?: Teks;
  kegiatan?: Teks;
  indikator_kegiatan?: Teks; target_kegiatan?: Teks; satuan_kegiatan?: Teks;
  subkegiatan?: Teks;
  indikator_subkegiatan?: Teks; target_subkegiatan?: Teks; satuan_subkegiatan?: Teks;
  _deleted?: boolean;
}

export interface IndikatorSasaran { indikator: string | null; target: string | null; satuan: string | null }

export interface PilihanSasaran {
  kunci: string;
  label: string;
  program: string;
  kegiatan: string | null;
  subkegiatan: string | null;
  indikator: IndikatorSasaran[];
}

const isi = (s: Teks): string | null => (s ?? '').trim() || null;

export function pilihanSasaran(rows: readonly BarisMasterSasaran[], level: LevelPk): PilihanSasaran[] {
  const peta = new Map<string, PilihanSasaran>();
  const sudah = new Set<string>();
  for (const r of rows) {
    if (r._deleted) continue;
    const label = isi(level === 'program' ? r.program : level === 'kegiatan' ? r.kegiatan : r.subkegiatan);
    if (!label) continue;
    const kegiatan = level === 'program' ? null : isi(r.kegiatan);
    const subkegiatan = level === 'subkegiatan' ? label : null;
    const kunci = [r.program, kegiatan ?? '', subkegiatan ?? ''].join('||');
    let p = peta.get(kunci);
    if (!p) {
      p = { kunci, label, program: r.program, kegiatan, subkegiatan, indikator: [] };
      peta.set(kunci, p);
    }
    // Dinormalkan DULU, baru dibandingkan: master lama ("(1) Jumlah X ***", "4 Dokumen") dan hasil
    // tarik baru ("Jumlah X", "4" + "Dokumen") indikator yang sama, bukan dua.
    const ts = targetDanSatuan({ target: r[`target_${level}`] ?? null, satuan: r[`satuan_${level}`] ?? null });
    const ind: IndikatorSasaran = {
      indikator: isi(rapikanIndikator(r[`indikator_${level}`] ?? '')),
      target: isi(ts.target),
      satuan: isi(ts.satuan),
    };
    if (!ind.indikator && !ind.target && !ind.satuan) continue;
    const sidik = JSON.stringify([kunci, ind.indikator, ind.target, ind.satuan]);
    if (sudah.has(sidik)) continue;
    sudah.add(sidik);
    p.indikator.push(ind);
  }
  return [...peta.values()].sort((a, b) => a.label.localeCompare(b.label, 'id'));
}

/**
 * Jejak satu baris lampiran untuk mengenali "sudah ada di dokumen". Dibandingkan sesudah
 * dirapikan: baris yang dimuat dari server sudah tanpa bintang, Master Sasaran belum tentu.
 */
export function sidikLampiran(uraian: Teks, indikator: Teks): string {
  return `${rapikanNamaEntitas(uraian ?? '')}||${rapikanIndikator(indikator ?? '')}`;
}

/**
 * Sisipkan baris baru TEPAT sesudah baris terakhir bersasaran sama (kalau ada), bukan di ujung:
 * hanya indikator yang berurutan yang dicetak di bawah satu nomor.
 */
export function sisipLampiran<T extends { uraian: string; _deleted?: boolean }>(lama: readonly T[], baru: readonly T[]): T[] {
  if (baru.length === 0) return [...lama];
  const sasaran = rapikanNamaEntitas(baru[0].uraian);
  let akhir = -1;
  lama.forEach((r, i) => { if (!r._deleted && rapikanNamaEntitas(r.uraian) === sasaran) akhir = i; });
  if (akhir === -1) return [...lama, ...baru];
  return [...lama.slice(0, akhir + 1), ...baru, ...lama.slice(akhir + 1)];
}
