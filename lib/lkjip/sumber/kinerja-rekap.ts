// lib/lkjip/sumber/kinerja-rekap.ts — sumber "E-Anggaran · Rekap Semua Sumber" (Cetak → Rekap).
//
// Angkanya WAJIB sama dengan layar Cetak: pemuatan lewat `muatBahanRekap` dan hitungan lewat
// `hitungRekap` — dua fungsi yang sama yang dipakai layar itu. Judul kolom & kalimat catatan
// diambil dari unduhan Rekap (`REKAP_HEADER`, `catatan*`), bukan ditulis ulang.

import { muatBahanRekap } from '@/lib/kinerja/muat-rekap';
import { hitungRekap, type KedalamanRekap, type BarisRekap } from '@/lib/kinerja/rekap';
import { ringkasVersiRekap, type PilihanVersiRekap } from '@/lib/kinerja/versi';
import { SUMBER_LIST, CRR_BULAN_LABELS } from '@/app/(dashboard)/kinerja/_utils';
import { REKAP_HEADER, catatanDinolkan, catatanTanpaRealisasi, catatanYatim } from '@/app/(dashboard)/kinerja/_exports';
import type { HasilTarik, JenisKolomSumber, KolomSumber } from '../tautan';
import { GagalTarik, pesanDitolak, angkaDalam, type AmbilJson } from './umum';

export interface SetelanKinerjaRekap {
  tahun:     number;
  sdBulan:   number;
  versi:     PilihanVersiRekap;
  kedalaman: KedalamanRekap;
}

const KEDALAMAN: KedalamanRekap[] = ['program', 'kegiatan', 'subkegiatan', 'ssk', 'full'];
export const LABEL_KEDALAMAN: Record<KedalamanRekap, string> = {
  program: 'S/D Program', kegiatan: 'S/D Kegiatan', subkegiatan: 'S/D Subkegiatan',
  ssk: 'S/D Uraian SSK', full: 'Termasuk Rekening Belanja',
};
/** Sama dengan layar Cetak (CetakTab). */
const LABEL_TOTAL = 'RSJD Dr. Amino Gondohutomo';

/** Sejajar `REKAP_HEADER` — urutan yang sama dengan `rekapAoa`. */
const KOLOM: { kunci: keyof BarisRekap; jenis: JenisKolomSumber }[] = [
  { kunci: 'no', jenis: 'angka' }, { kunci: 'label', jenis: 'teks' }, { kunci: 'pagu', jenis: 'rp' },
  { kunci: 'targetPct', jenis: 'persen' }, { kunci: 'realFisik', jenis: 'rp' }, { kunci: 'pctFisik', jenis: 'persen' },
  { kunci: 'devFisik', jenis: 'persen' }, { kunci: 'capaianFisik', jenis: 'persen' }, { kunci: 'targetRp', jenis: 'rp' },
  { kunci: 'realKeuBulanIni', jenis: 'rp' }, { kunci: 'realKeu', jenis: 'rp' }, { kunci: 'pctKeu', jenis: 'persen' },
  { kunci: 'devKeu', jenis: 'persen' },
];
export const KOLOM_KINERJA_REKAP: KolomSumber[] =
  KOLOM.map((k, i) => ({ kunci: k.kunci, label: REKAP_HEADER[i], jenis: k.jenis }));

/** Pemetaan bawaan tabel baru: Uraian · Anggaran · Realisasi Keu s/d · % Realisasi Keu. */
export const KOLOM_BAWAAN_KINERJA = ['label', 'pagu', 'realKeu', 'pctKeu'];

export function setelanKinerjaRekap(raw: unknown, tahunDokumen: number): SetelanKinerjaRekap {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    tahun:     angkaDalam(o.tahun, 2000, 2100, tahunDokumen),
    // LKJIP itu laporan SETAHUN — bawaannya s/d Desember, bukan bulan berjalan seperti layar Cetak.
    sdBulan:   angkaDalam(o.sdBulan, 1, 12, 12),
    versi:     o.versi === 'murni' ? 'murni' : 'berlaku',
    kedalaman: KEDALAMAN.includes(o.kedalaman as KedalamanRekap) ? o.kedalaman as KedalamanRekap : 'program',
  };
}

export async function tarikKinerjaRekap(s: SetelanKinerjaRekap, ambil: AmbilJson): Promise<HasilTarik> {
  const tahun = String(s.tahun);
  const bahan = await muatBahanRekap(tahun, s.versi, ambil);
  const gagalSumber = new Set(bahan.gagal.map(g => g.sumber));
  // Semua sumber ditolak = penarikannya yang gagal, bukan "datanya kosong". Sebagian saja =
  // sumber lain tetap dipakai (perilaku layar Cetak) dan disebut di catatan.
  if (gagalSumber.size >= SUMBER_LIST.length) {
    const g = bahan.gagal.find(x => x.status === 403) ?? bahan.gagal.find(x => x.status === 503) ?? bahan.gagal[0];
    throw new GagalTarik(pesanDitolak('E-Anggaran', g?.status, g?.message ?? ''));
  }
  const namaBulan = CRR_BULAN_LABELS[s.sdBulan - 1];
  const rekap = hitungRekap(bahan.rows, bahan.items, s.sdBulan, s.kedalaman, LABEL_TOTAL);
  const catatan = [
    catatanDinolkan(bahan.dinolkan),
    catatanTanpaRealisasi(rekap.tanpaRealisasi, namaBulan, tahun),
    catatanYatim(rekap.yatim),
    rekap.dobel.jumlahItem > 0
      ? `Catatan: ${rekap.dobel.jumlahItem} rekening punya baris kembar di bulan yang sama — realisasinya terhitung dobel. Bereskan di tab Realisasi E-Anggaran.`
      : null,
    gagalSumber.size > 0 ? `Sumber ${[...gagalSumber].join(', ')} gagal dimuat, jadi tidak ikut dihitung.` : null,
  ].filter((c): c is string => c !== null);
  return {
    kolom: KOLOM_KINERJA_REKAP,
    baris: rekap.baris.map(b => ({
      kunci: b.kunci, label: b.label, indent: b.indent, tebal: b.tebal,
      sel: Object.fromEntries(KOLOM.map(k => [k.kunci, b[k.kunci] as string | number | null])),
    })),
    catatan,
    ringkas: `E-Anggaran · Rekap s/d ${namaBulan} ${tahun} · ${LABEL_KEDALAMAN[s.kedalaman]} · ${ringkasVersiRekap(bahan.versiRekap, s.versi)}`,
  };
}
