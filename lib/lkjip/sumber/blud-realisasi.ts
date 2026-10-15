// lib/lkjip/sumber/blud-realisasi.ts — sumber "BLUD · Realisasi Anggaran" (konsep §19.3).
//
// Datanya = layar Realisasi BLUD (`GET /api/blud/realisasi/pagu`): pagu dari versi yang SEDANG
// jadi sumber pagu, serapan sudah digulung ke induk oleh server. Per PJ memakai `rekapPerPj` —
// rumus yang sama dengan chip Per PJ di layar, jadi jumlah semua barisnya = baris JUMLAH.

import type { BarisSumber, HasilTarik, JenisKolomSumber, KolomSumber } from '../tautan';
import { GagalTarik, pesanDitolak, angkaDalam, type AmbilJson } from './umum';
import { rekapPerPj, LABEL_TANPA_PJ, type BarisPj, type RekapPj } from '@/lib/blud/realisasi-pj';
import { jenisSumberPagu } from '@/lib/blud/perubahan';
import { formatTanggalId } from '@/lib/blud/tanggal';

export type TampilanBlud = 'rekening' | 'pj';
export interface SetelanBludRealisasi {
  tahun:          number;
  sdBulan:        number;
  tampilan:       TampilanBlud;
  /** Per Rekening: tingkat terdalam yang ikut (1 = akar saja). */
  kedalaman:      number;
  /** Per Rekening: buang baris berpagu DAN berealisasi nol — DPA memuat ratusan rekening kosong. */
  sembunyikanNol: boolean;
}

const MODUL = 'BLUD Realisasi';
export const KEDALAMAN_BLUD_MAKS = 8;
const NAMA_BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

const kol = (kunci: string, label: string, jenis: JenisKolomSumber): KolomSumber => ({ kunci, label, jenis });
const realisasiLabel = (s?: Partial<SetelanBludRealisasi>) =>
  `Realisasi s/d ${NAMA_BULAN[(s?.sdBulan ?? 12) - 1] ?? 'Desember'}`;

export function kolomBlud(s?: Partial<SetelanBludRealisasi>): KolomSumber[] {
  const angka = [
    kol('pagu', 'Pagu', 'rp'), kol('realisasi', realisasiLabel(s), 'rp'),
    kol('sisa', 'Sisa', 'rp'), kol('persen', 'Serapan (%)', 'persen'),
  ];
  return s?.tampilan === 'pj'
    ? [kol('no', 'No', 'angka'), kol('pj', 'Penanggung Jawab', 'teks'), kol('rekening', 'Jumlah Rekening', 'angka'), ...angka]
    : [kol('no', 'No', 'angka'), kol('kode', 'Kode Rekening', 'teks'), kol('uraian', 'Uraian', 'teks'), ...angka];
}
export function kolomBawaanBlud(s?: Partial<SetelanBludRealisasi>): string[] {
  return s?.tampilan === 'pj' ? ['no', 'pj', 'pagu', 'realisasi', 'persen'] : ['kode', 'uraian', 'pagu', 'realisasi', 'persen'];
}

export function setelanBludRealisasi(raw: unknown, tahunDokumen: number): SetelanBludRealisasi {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    tahun:          angkaDalam(o.tahun, 2000, 2100, tahunDokumen),
    // Laporan SETAHUN — bawaannya s/d Desember, bukan bulan berjalan seperti layar Realisasi.
    sdBulan:        angkaDalam(o.sdBulan, 1, 12, 12),
    tampilan:       o.tampilan === 'pj' ? 'pj' : 'rekening',
    kedalaman:      angkaDalam(o.kedalaman, 1, KEDALAMAN_BLUD_MAKS, 3),
    sembunyikanNol: o.sembunyikanNol !== false,
  };
}

interface BarisLayar extends BarisPj { sisa: number; persen: number }
interface JawabanPagu {
  data?: BarisLayar[];
  pagu_sumber?: { sumber: 'PERGESERAN' | 'DPA' | 'KOSONG'; versi: string | null; perubahan_ke?: number | null };
}

/** Tingkat tiap baris dari rantai induknya (akar = 1). Induk yang tak ada di versi ini = akar. */
export function tingkatBaris(rows: readonly Pick<BarisPj, 'anggaran_key' | 'parent_key'>[]): Map<string, number> {
  const induk = new Map(rows.map(r => [r.anggaran_key, r.parent_key]));
  const memo = new Map<string, number>();
  const hitung = (k: string, jalur: Set<string>): number => {
    const ada = memo.get(k);
    if (ada) return ada;
    const p = induk.get(k) ?? null;
    // Jaga-jaga siklus: data rusak tidak boleh menggantung penarikan.
    const t = p && induk.has(p) && !jalur.has(p) ? hitung(p, jalur.add(k)) + 1 : 1;
    memo.set(k, t);
    return t;
  };
  for (const r of rows) hitung(r.anggaran_key, new Set());
  return memo;
}

/**
 * Urutan POHON (anak tepat di bawah induknya, saudara menurut urutan asal). Route memulangkan
 * urutan `urutan` DPA, yang bukan urutan pohon: di DPA 2026 "BELANJA MODAL" tingkat 3 datang
 * sesudah blok Belanja Operasi, jadi tabel bertingkat yang disaring per tingkat membuatnya tampak
 * anak Operasi. Layar Realisasi tidak kena karena menampilkan seluruh baris apa adanya.
 */
export function urutPohon<T extends Pick<BarisPj, 'anggaran_key' | 'parent_key'>>(rows: readonly T[]): T[] {
  const ada = new Set(rows.map(r => r.anggaran_key));
  const anak = new Map<string, T[]>();
  const akar: T[] = [];
  for (const r of rows) {
    if (r.parent_key && ada.has(r.parent_key) && r.parent_key !== r.anggaran_key) {
      anak.set(r.parent_key, [...(anak.get(r.parent_key) ?? []), r]);
    } else akar.push(r);
  }
  const hasil: T[] = [];
  const sudah = new Set<string>();
  const kunjungi = (r: T) => {
    if (sudah.has(r.anggaran_key)) return;
    sudah.add(r.anggaran_key);
    hasil.push(r);
    for (const a of anak.get(r.anggaran_key) ?? []) kunjungi(a);
  };
  akar.forEach(kunjungi);
  // Siklus (data rusak) tidak punya akar — tetap ditampilkan, di akhir.
  for (const r of rows) if (!sudah.has(r.anggaran_key)) kunjungi(r);
  return hasil;
}

const angkaPj = (r: RekapPj, realisasi: number) => ({ pagu: r.pagu, realisasi, sisa: r.sisa, persen: r.persen });

export async function tarikBludRealisasi(s: SetelanBludRealisasi, ambil: AmbilJson): Promise<HasilTarik> {
  const d = await ambil(`/api/blud/realisasi/pagu?tahun=${s.tahun}&bulan=${s.sdBulan}`);
  if (!d.ok) throw new GagalTarik(pesanDitolak(MODUL, d.status, d.message ?? ''));
  const { data: rows = [], pagu_sumber: sumber } = d as JawabanPagu;
  const kolom = kolomBlud(s);
  const bulan = NAMA_BULAN[s.sdBulan - 1];

  if (!sumber || sumber.sumber === 'KOSONG' || !rows.length) {
    return { kolom, baris: [], catatan: [`BLUD tahun ${s.tahun} belum punya DPA maupun Pergeseran — belum ada pagu untuk ditarik.`], ringkas: `BLUD Realisasi ${s.tahun}` };
  }

  const catatan = [`Pagu dari ${jenisSumberPagu({ sumber: sumber.sumber, perubahan_ke: sumber.perubahan_ke ?? null })} ${formatTanggalId(sumber.versi)}.`];
  const realisasiDari = (r: { sd_bulan: number | null; terserap: number }) => r.sd_bulan ?? r.terserap;
  let baris: BarisSumber[];

  if (s.tampilan === 'pj') {
    const hasil = rekapPerPj(rows);
    baris = hasil.baris.map((r, i) => ({
      kunci: `pj:${r.pj}`, label: r.pj,
      sel: { no: i + 1, pj: r.pj, rekening: r.rekening, ...angkaPj(r, r.sd_bulan) },
    }));
    if (hasil.tanpaPj) {
      const r = hasil.tanpaPj;
      baris.push({ kunci: 'pj:', label: LABEL_TANPA_PJ, sel: { no: baris.length + 1, pj: LABEL_TANPA_PJ, rekening: r.rekening, ...angkaPj(r, r.sd_bulan) } });
    }
    baris.push({ kunci: 'blud:JUMLAH', label: 'JUMLAH', tebal: true, sel: { no: null, pj: 'JUMLAH', rekening: hasil.total.rekening, ...angkaPj(hasil.total, hasil.total.sd_bulan) } });
    if (hasil.konflik) {
      catatan.push(`${hasil.konflik} baris ber-PJ yang induknya juga ber-PJ dihitung ke PJ induknya — tiap rupiah cuma punya satu PJ.`);
    }
  } else {
    const tingkat = tingkatBaris(rows);
    const kosong = (r: BarisLayar) => Math.abs(r.pagu) < 0.005 && Math.abs(realisasiDari(r)) < 0.005;
    const tampil = urutPohon(rows).filter(r => (tingkat.get(r.anggaran_key) ?? 1) <= s.kedalaman && !(s.sembunyikanNol && kosong(r)));
    baris = tampil.map((r, i) => ({
      kunci: `rek:${r.anggaran_key}`, label: r.uraian, indent: (tingkat.get(r.anggaran_key) ?? 1) - 1,
      sel: { no: i + 1, kode: r.kode_rekening, uraian: r.uraian, pagu: r.pagu, realisasi: realisasiDari(r), sisa: r.sisa, persen: r.persen },
    }));
    // Lebih dari satu akar BERISI (baris tanpa induk di DPA) = baris akar tidak lagi memuat semuanya.
    // Akar yang nol tidak dihitung: JUMLAH-nya cuma akan mengulang angka akar satunya.
    const akar = rows.filter(r => (tingkat.get(r.anggaran_key) ?? 1) === 1);
    if (akar.filter(r => !kosong(r)).length > 1) {
      const pagu = akar.reduce((a, r) => a + r.pagu, 0);
      const realisasi = akar.reduce((a, r) => a + realisasiDari(r), 0);
      baris.push({
        kunci: 'blud:JUMLAH', label: 'JUMLAH', tebal: true,
        sel: { no: null, kode: '', uraian: 'JUMLAH', pagu, realisasi, sisa: pagu - realisasi, persen: pagu > 0 ? (realisasi / pagu) * 100 : 0 },
      });
    }
    const dibuang = rows.length - tampil.length;
    if (dibuang) catatan.push(`${dibuang} rekening tidak ikut (lebih dalam dari tingkat ${s.kedalaman}${s.sembunyikanNol ? ' atau pagu & realisasinya nol' : ''}).`);
  }

  return {
    kolom, baris, catatan,
    ringkas: `BLUD Realisasi ${s.tahun} · s/d ${bulan} · ${s.tampilan === 'pj' ? 'per Penanggung Jawab' : `per rekening (tingkat ${s.kedalaman})`}`,
  };
}
