// lib/lkjip/sumber/kinerja-laporan.ts — sumber "E-Anggaran · Laporan" (tab Laporan Konsolidasi).
//
// Dua tampilan, keduanya dari GET /api/kinerja/laporan yang dipakai layar Laporan apa adanya:
//   · per sumber dana — baris "Serapan per Sumber" + JUMLAH,
//   · per bulan       — "Detail Trend Bulanan" satu sumber + JUMLAH.
// Angka baris = angka layar (server yang menghitung). JUMLAH dijumlah dari rupiah barisnya dan
// persennya diturunkan di akhir dengan rumus server yang sama (L89), bukan rata-rata persen.

import { SUMBER_LIST, CRR_BULAN_LABELS } from '@/app/(dashboard)/kinerja/_utils';
import { catatanDinolkan, catatanYatim } from '@/app/(dashboard)/kinerja/_exports';
import type { LaporanSumber, SumberSSK } from '@/app/(dashboard)/kinerja/_types';
import type { BarisSumber, HasilTarik, JenisKolomSumber, KolomSumber } from '../tautan';
import { GagalTarik, pesanDitolak, angkaDalam, type AmbilJson } from './umum';

export type TampilanLaporan = 'sumber' | 'bulanan';
export interface SetelanKinerjaLaporan {
  tahun:     number;
  tampilan:  TampilanLaporan;
  /** Hanya tampilan per bulan. */
  sumber:    SumberSSK;
}

const kol = (kunci: string, label: string, jenis: JenisKolomSumber): KolomSumber => ({ kunci, label, jenis });
const KOLOM_PER_SUMBER: KolomSumber[] = [
  kol('no', 'No', 'angka'), kol('label', 'Sumber Dana', 'teks'), kol('pagu', 'Total Pagu', 'rp'),
  kol('realKeu', 'Real Keuangan', 'rp'), kol('pctKeu', 'Serapan Keuangan (%)', 'persen'), kol('sisa', 'Sisa Anggaran', 'rp'),
  kol('targetFisik', 'Target Fisik', 'rp'), kol('realFisik', 'Real Fisik', 'rp'), kol('pctFisik', 'Capaian Fisik (%)', 'persen'),
  kol('versi', 'Versi SSK Acuan', 'teks'),
];
/** Sejajar tabel "Detail Trend Bulanan" layar Laporan. */
const KOLOM_PER_BULAN: KolomSumber[] = [
  kol('no', 'No', 'angka'), kol('label', 'Bulan', 'teks'), kol('realKeu', 'Real Keuangan', 'rp'),
  kol('akumKeu', 'Akum Keuangan', 'rp'), kol('akumPctKeu', 'Akum % Keuangan', 'persen'),
  kol('realFisik', 'Real Fisik', 'rp'), kol('akumPctFisik', 'Akum % Fisik', 'persen'),
];

export function kolomLaporan(s?: Partial<SetelanKinerjaLaporan>): KolomSumber[] {
  return s?.tampilan === 'bulanan' ? KOLOM_PER_BULAN : KOLOM_PER_SUMBER;
}

export function kolomBawaanLaporan(s?: Partial<SetelanKinerjaLaporan>): string[] {
  return s?.tampilan === 'bulanan'
    ? ['label', 'realKeu', 'akumKeu', 'akumPctKeu']
    : ['no', 'label', 'pagu', 'realKeu', 'pctKeu', 'sisa'];
}
export const LABEL_JUMLAH = 'JUMLAH';

export function setelanKinerjaLaporan(raw: unknown, tahunDokumen: number): SetelanKinerjaLaporan {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    tahun:    angkaDalam(o.tahun, 2000, 2100, tahunDokumen),
    tampilan: o.tampilan === 'bulanan' ? 'bulanan' : 'sumber',
    sumber:   SUMBER_LIST.includes(o.sumber as SumberSSK) ? o.sumber as SumberSSK : 'GAJI',
  };
}

/** Rumus `pct_serapan` server (lib/data/kinerja.ts) — JUMLAH memakai yang sama. */
const persenDari = (bagian: number, utuh: number) => (utuh > 0 ? Math.round((bagian / utuh) * 10000) / 100 : 0);
const namaVersi = (v: LaporanSumber['versi_aktif']) => (!v ? 'tanpa SSK' : v.tipe === 'MURNI' ? 'Murni' : `Perubahan-${v.seq}`);

async function muat<T>(ambil: AmbilJson, url: string): Promise<T> {
  const d = await ambil(url);
  if (!d.ok) throw new GagalTarik(pesanDitolak('E-Anggaran', d.status, d.message ?? ''));
  return (d as { data?: T }).data as T;
}

function catatanYatimGabungan(daftar: LaporanSumber[]): string | null {
  const ada = daftar.filter(d => d.yatim.jumlahBaris > 0);
  if (!ada.length) return null;
  const teks = catatanYatim({
    jumlahBaris: ada.reduce((a, d) => a + d.yatim.jumlahBaris, 0),
    jumlahItem:  ada.reduce((a, d) => a + d.yatim.jumlahItem, 0),
    nominal:     ada.reduce((a, d) => a + d.yatim.nominal, 0),
    contoh: [],
  });
  return teks ? `${teks} (${ada.map(d => d.sumber).join(', ')})` : null;
}

export async function tarikKinerjaLaporan(s: SetelanKinerjaLaporan, ambil: AmbilJson): Promise<HasilTarik> {
  const tahun = String(s.tahun);
  if (s.tampilan === 'bulanan') {
    const d = await muat<LaporanSumber>(ambil, `/api/kinerja/laporan?tahun=${tahun}&sumber=${s.sumber}`);
    const baris: BarisSumber[] = CRR_BULAN_LABELS.map((bulan, i) => {
      const t = d.trend.find(x => x.bulan === i + 1);
      return {
        kunci: `bln:${i + 1}`, label: bulan,
        sel: {
          no: i + 1, label: bulan,
          realKeu: t?.real_keuangan ?? null, akumKeu: t?.akum_keuangan ?? null, akumPctKeu: t?.akum_pct_keuangan ?? null,
          realFisik: t?.real_fisik ?? null, akumPctFisik: t?.akum_pct_fisik ?? null,
        },
      };
    });
    baris.push({
      kunci: 'bln:JUMLAH', label: LABEL_JUMLAH, tebal: true,
      sel: {
        no: null, label: LABEL_JUMLAH, realKeu: d.total_real_keuangan, akumKeu: null, akumPctKeu: d.pct_serapan,
        realFisik: d.total_real_fisik, akumPctFisik: d.pct_fisik,
      },
    });
    const catatan = [
      catatanDinolkan(d.versi_dinolkan ? [d.sumber] : []),
      catatanYatim(d.yatim),
      d.trend.length === 0 ? `Belum ada realisasi ${d.sumber} yang diisi untuk tahun ${tahun}.` : null,
    ].filter((c): c is string => c !== null);
    return {
      kolom: KOLOM_PER_BULAN, baris, catatan,
      ringkas: `E-Anggaran · Laporan ${d.sumber} per Bulan ${tahun} · versi ${namaVersi(d.versi_aktif)}`,
    };
  }

  const semua = await muat<LaporanSumber[]>(ambil, `/api/kinerja/laporan?tahun=${tahun}`);
  const urut = SUMBER_LIST.map(k => semua.find(d => d.sumber === k)).filter((d): d is LaporanSumber => !!d);
  // Sumber dana yang tahun ini tidak punya pagu maupun realisasi hanya memenuhi tabel dengan nol.
  const tampil = urut.filter(d => d.total_pagu !== 0 || d.total_real_keuangan !== 0 || d.versi_dinolkan);
  const kosong = urut.filter(d => !tampil.includes(d)).map(d => d.sumber);
  const baris: BarisSumber[] = tampil.map((d, i) => ({
    kunci: `lap:${d.sumber}`, label: d.sumber,
    sel: {
      no: i + 1, label: d.sumber, pagu: d.total_pagu, realKeu: d.total_real_keuangan, pctKeu: d.pct_serapan,
      sisa: d.total_pagu - d.total_real_keuangan, targetFisik: d.total_target_fisik, realFisik: d.total_real_fisik,
      pctFisik: d.pct_fisik, versi: namaVersi(d.versi_aktif),
    },
  }));
  const jml = (f: (d: LaporanSumber) => number) => tampil.reduce((a, d) => a + f(d), 0);
  const pagu = jml(d => d.total_pagu), realKeu = jml(d => d.total_real_keuangan);
  const targetFisik = jml(d => d.total_target_fisik), realFisik = jml(d => d.total_real_fisik);
  if (tampil.length) {
    baris.push({
      kunci: 'lap:JUMLAH', label: LABEL_JUMLAH, tebal: true,
      sel: {
        no: null, label: LABEL_JUMLAH, pagu, realKeu, pctKeu: persenDari(realKeu, pagu), sisa: pagu - realKeu,
        // Server: pct_fisik = akumulasi real fisik ÷ PAGU (bukan ÷ target fisik) — rumus yang sama.
        targetFisik, realFisik, pctFisik: persenDari(realFisik, pagu), versi: null,
      },
    });
  }
  const catatan = [
    catatanDinolkan(tampil.filter(d => d.versi_dinolkan).map(d => d.sumber)),
    catatanYatimGabungan(tampil),
    kosong.length ? `${kosong.join(', ')} belum punya pagu maupun realisasi di ${tahun} — tidak ditampilkan.` : null,
  ].filter((c): c is string => c !== null);
  return {
    kolom: KOLOM_PER_SUMBER, baris, catatan,
    ringkas: `E-Anggaran · Laporan per Sumber Dana ${tahun} · ${tampil.map(d => `${d.sumber} ${namaVersi(d.versi_aktif)}`).join(', ') || 'tanpa data'}`,
  };
}
