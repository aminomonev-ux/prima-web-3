// ═══ PRIMA — Dashboard data layer (agregasi lintas-modul, READ-ONLY) ════════
// getDashboardSummary() meng-agregasi ringkasan 5 modul dalam satu round-trip.
// Reuse data-layer existing tiap modul (jangan re-query mentah yang sudah ada
// fungsinya). Audiens = role verif/admin → angka agregat penuh (lihat CONCEPT).

import { sql } from '@/lib/data/db';
import { getKinerjaKpi, SUMBER_LIST } from './kinerja';
import { listRencanaAksi } from './rencana-aksi';
import type { RaLevel } from './rencana-aksi-schemas';
import { getDpaLatestDate, getDpaByDate } from '@/lib/blud/data';

export interface UsulanSummary {
  total: number;
  disetujui: number;
  ditolak: number;
  proses: number;
  menunggu_admin: number;
  nilai_disetujui: number;
  nilai_aktif: number;
  chartBidang: { sub_bidang: string; cnt: number; nominal: number }[];
}

export interface EanggaranSummary {
  total_pagu: number;
  total_real_keuangan: number;
  pct_serapan: number;
  total_ssk_rows: number;
  total_rekening: number;
  pagu_per_sumber: { sumber: string; pagu: number }[];
}

export interface BludSummary {
  versi_tanggal: string | null;
  total_pagu: number;
  total_baris: number;
  leaf_baris: number;
}

export interface RenaksiLevelStat { level: RaLevel; count: number; target_terisi: number }
export interface RenaksiSummary {
  total_indikator: number;
  per_level: RenaksiLevelStat[];
}

export interface RealisasiLevelStat { level: RaLevel; pct: number }
export interface RealisasiKinerjaSummary {
  pct_capaian_total: number;
  on_track: number;
  lagging: number;
  per_level: RealisasiLevelStat[];
}

export interface DashboardSummary {
  usulan: UsulanSummary;
  eanggaran: EanggaranSummary;
  blud: BludSummary;
  renaksi: RenaksiSummary;
  realisasiKinerja: RealisasiKinerjaSummary;
}

const RA_LEVELS: RaLevel[] = ['tujuan', 'sasaran', 'program', 'kegiatan', 'sub-kegiatan'];
const ON_TRACK_THRESHOLD = 90; // % capaian ≥ ini = on-track

async function getUsulanSummary(): Promise<UsulanSummary> {
  const [kpiRows, bidangRows] = await Promise.all([
    sql`
      SELECT
        COUNT(*)                                                                                       AS total,
        COUNT(CASE WHEN status = 'DISETUJUI' THEN 1 END)                                               AS disetujui,
        COUNT(CASE WHEN status IN ('DITOLAK','DITOLAK_ADMIN') THEN 1 END)                              AS ditolak,
        COUNT(CASE WHEN status IN ('DITELAAH','DIPROSES') THEN 1 END)                                  AS proses,
        COUNT(CASE WHEN status = 'DIAJUKAN' THEN 1 END)                                                AS menunggu_admin,
        COALESCE(SUM(CASE WHEN status = 'DISETUJUI' THEN nominal_disetujui ELSE 0 END), 0)             AS nilai_disetujui,
        COALESCE(SUM(CASE WHEN status NOT IN ('DITOLAK','DITOLAK_ADMIN','DITOLAK_BIDANG','DRAFT') THEN harga_est*qty ELSE 0 END), 0) AS nilai_aktif
      FROM usulan_items`,
    sql`
      SELECT sub_bidang,
        COUNT(CASE WHEN status NOT IN ('DRAFT','DIAJUKAN_REVIEW','REVISI_BIDANG','DITOLAK_BIDANG') THEN 1 END) AS cnt,
        COALESCE(SUM(CASE WHEN status = 'DISETUJUI' THEN nominal_disetujui ELSE 0 END), 0)             AS nominal
      FROM usulan_items
      GROUP BY sub_bidang ORDER BY cnt DESC LIMIT 8`,
  ]);
  const k = (kpiRows[0] ?? {}) as Record<string, unknown>;
  return {
    total:           Number(k.total ?? 0),
    disetujui:       Number(k.disetujui ?? 0),
    ditolak:         Number(k.ditolak ?? 0),
    proses:          Number(k.proses ?? 0),
    menunggu_admin:  Number(k.menunggu_admin ?? 0),
    nilai_disetujui: Number(k.nilai_disetujui ?? 0),
    nilai_aktif:     Number(k.nilai_aktif ?? 0),
    chartBidang: (bidangRows as Record<string, unknown>[]).map(r => ({
      sub_bidang: String(r.sub_bidang ?? ''),
      cnt:        Number(r.cnt ?? 0),
      nominal:    Number(r.nominal ?? 0),
    })),
  };
}

async function getEanggaranSummary(tahun: string): Promise<EanggaranSummary> {
  const kpi = await getKinerjaKpi(tahun);
  return {
    total_pagu:          kpi.total_pagu,
    total_real_keuangan: kpi.total_real_keuangan,
    pct_serapan:         kpi.pct_serapan,
    total_ssk_rows:      kpi.total_ssk_rows,
    total_rekening:      kpi.total_rekening,
    pagu_per_sumber: Object.entries(kpi.pagu_per_sumber).map(([sumber, pagu]) => ({
      sumber, pagu: Number(pagu ?? 0),
    })),
  };
}

async function getBludSummary(): Promise<BludSummary> {
  const versi_tanggal = await getDpaLatestDate();
  if (!versi_tanggal) return { versi_tanggal: null, total_pagu: 0, total_baris: 0, leaf_baris: 0 };
  const rows = await getDpaByDate(versi_tanggal);
  // Total pagu = baris induk 'BELANJA DAERAH' (konvensi cetak-data.ts).
  const total_pagu = rows.find(r => (r.uraian ?? '').trim().toUpperCase() === 'BELANJA DAERAH')?.jumlah ?? 0;
  const leaf_baris = rows.filter(r => (r.vol ?? 0) > 0 || (r.harga ?? 0) > 0).length;
  return { versi_tanggal, total_pagu: Number(total_pagu) || 0, total_baris: rows.length, leaf_baris };
}

function sumQuarters(r: { q1_target: number; q2_target: number; q3_target: number; q4_target: number; q1_realisasi: number; q2_realisasi: number; q3_realisasi: number; q4_realisasi: number }) {
  const target = r.q1_target + r.q2_target + r.q3_target + r.q4_target;
  const real   = r.q1_realisasi + r.q2_realisasi + r.q3_realisasi + r.q4_realisasi;
  return { target, real };
}

async function getRenaksiAndRealisasi(tahun: number): Promise<{ renaksi: RenaksiSummary; realisasiKinerja: RealisasiKinerjaSummary }> {
  const perLevelRows = await Promise.all(RA_LEVELS.map(lvl => listRencanaAksi(tahun, lvl)));

  const renaksiPerLevel: RenaksiLevelStat[] = [];
  const realisasiPerLevel: RealisasiLevelStat[] = [];
  let totalIndikator = 0;
  let grandTarget = 0, grandReal = 0, onTrack = 0, lagging = 0;

  RA_LEVELS.forEach((level, i) => {
    const rows = perLevelRows[i];
    totalIndikator += rows.length;
    renaksiPerLevel.push({
      level,
      count: rows.length,
      target_terisi: rows.filter(r => r.target_tahunan > 0).length,
    });

    let lvlTarget = 0, lvlReal = 0;
    for (const r of rows) {
      const { target, real } = sumQuarters(r);
      lvlTarget += target; lvlReal += real;
      if (target > 0) {
        const pct = (real / target) * 100;
        if (pct >= ON_TRACK_THRESHOLD) onTrack++; else lagging++;
      }
    }
    grandTarget += lvlTarget; grandReal += lvlReal;
    realisasiPerLevel.push({
      level,
      pct: lvlTarget > 0 ? Math.round((lvlReal / lvlTarget) * 10000) / 100 : 0,
    });
  });

  return {
    renaksi: { total_indikator: totalIndikator, per_level: renaksiPerLevel },
    realisasiKinerja: {
      pct_capaian_total: grandTarget > 0 ? Math.round((grandReal / grandTarget) * 10000) / 100 : 0,
      on_track: onTrack,
      lagging,
      per_level: realisasiPerLevel,
    },
  };
}

export async function getDashboardSummary(tahun: string): Promise<DashboardSummary> {
  const [usulan, eanggaran, blud, ra] = await Promise.all([
    getUsulanSummary(),
    getEanggaranSummary(tahun),
    getBludSummary(),
    getRenaksiAndRealisasi(Number(tahun)),
  ]);
  return { usulan, eanggaran, blud, renaksi: ra.renaksi, realisasiKinerja: ra.realisasiKinerja };
}

// ═══ DETAIL per-modul (drill-down DI DALAM app Dashboard — bukan navigasi ke modul) ═══
// Tetap READ-ONLY & dijaga isDashboardRole yang sama. Tabel = rekap agregat per kategori.

export const DASH_MODULES = ['usulan', 'eanggaran', 'blud', 'renaksi', 'realisasi-kinerja'] as const;
export type DashModule = typeof DASH_MODULES[number];
export function isDashModule(v: string | null | undefined): v is DashModule {
  return v != null && (DASH_MODULES as readonly string[]).includes(v);
}

export interface PieDatum { name: string; value: number }

export interface UsulanDetail {
  kpi: { total: number; disetujui: number; ditolak: number; proses: number; menunggu_admin: number; nilai_aktif: number; nilai_disetujui: number };
  statusPie: PieDatum[];
  table: { sub_bidang: string; total: number; disetujui: number; ditolak: number; proses: number; nominal: number }[];
}
export interface EanggaranDetail {
  kpi: { total_pagu: number; total_real_keuangan: number; pct_serapan: number; total_ssk_rows: number; total_rekening: number };
  sumberPie: PieDatum[];
  table: { sumber: string; pagu: number; realisasi: number; pct: number }[];
}
export interface BludDetail {
  kpi: { versi_tanggal: string | null; total_pagu: number; leaf_baris: number; total_baris: number };
  kelompokPie: PieDatum[];
  table: { kode: string; uraian: string; jumlah: number; count: number }[];
}
export interface RenaksiDetail {
  kpi: { total_indikator: number; target_terisi: number };
  table: { level: RaLevel; count: number; target_terisi: number }[];
}
export interface RealisasiKinerjaDetail {
  kpi: { pct_capaian_total: number; on_track: number; lagging: number };
  pie: PieDatum[];
  table: { level: RaLevel; total: number; sum_target: number; sum_real: number; pct: number }[];
}

export type ModuleDetailData =
  | { modul: 'usulan';            data: UsulanDetail }
  | { modul: 'eanggaran';         data: EanggaranDetail }
  | { modul: 'blud';              data: BludDetail }
  | { modul: 'renaksi';           data: RenaksiDetail }
  | { modul: 'realisasi-kinerja'; data: RealisasiKinerjaDetail };

async function getUsulanDetail(): Promise<UsulanDetail> {
  const [kpiRows, bidangRows] = await Promise.all([
    sql`
      SELECT
        COUNT(*)                                                                                       AS total,
        COUNT(CASE WHEN status = 'DISETUJUI' THEN 1 END)                                               AS disetujui,
        COUNT(CASE WHEN status IN ('DITOLAK','DITOLAK_ADMIN') THEN 1 END)                              AS ditolak,
        COUNT(CASE WHEN status IN ('DITELAAH','DIPROSES') THEN 1 END)                                  AS proses,
        COUNT(CASE WHEN status = 'DIAJUKAN' THEN 1 END)                                                AS menunggu_admin,
        COALESCE(SUM(CASE WHEN status = 'DISETUJUI' THEN nominal_disetujui ELSE 0 END), 0)             AS nilai_disetujui,
        COALESCE(SUM(CASE WHEN status NOT IN ('DITOLAK','DITOLAK_ADMIN','DITOLAK_BIDANG','DRAFT') THEN harga_est*qty ELSE 0 END), 0) AS nilai_aktif
      FROM usulan_items`,
    sql`
      SELECT sub_bidang,
        COUNT(*)                                                                          AS total,
        COUNT(CASE WHEN status = 'DISETUJUI' THEN 1 END)                                  AS disetujui,
        COUNT(CASE WHEN status IN ('DITOLAK','DITOLAK_ADMIN') THEN 1 END)                 AS ditolak,
        COUNT(CASE WHEN status IN ('DITELAAH','DIPROSES') THEN 1 END)                     AS proses,
        COALESCE(SUM(CASE WHEN status = 'DISETUJUI' THEN nominal_disetujui ELSE 0 END),0) AS nominal
      FROM usulan_items GROUP BY sub_bidang ORDER BY total DESC`,
  ]);
  const k = (kpiRows[0] ?? {}) as Record<string, unknown>;
  const kpi = {
    total: Number(k.total ?? 0), disetujui: Number(k.disetujui ?? 0), ditolak: Number(k.ditolak ?? 0),
    proses: Number(k.proses ?? 0), menunggu_admin: Number(k.menunggu_admin ?? 0),
    nilai_disetujui: Number(k.nilai_disetujui ?? 0), nilai_aktif: Number(k.nilai_aktif ?? 0),
  };
  const statusPie: PieDatum[] = [
    { name: 'Disetujui', value: kpi.disetujui },
    { name: 'Proses',    value: kpi.proses },
    { name: 'Menunggu',  value: kpi.menunggu_admin },
    { name: 'Ditolak',   value: kpi.ditolak },
  ].filter(d => d.value > 0);
  const table = (bidangRows as Record<string, unknown>[]).map(r => ({
    sub_bidang: String(r.sub_bidang ?? ''), total: Number(r.total ?? 0), disetujui: Number(r.disetujui ?? 0),
    ditolak: Number(r.ditolak ?? 0), proses: Number(r.proses ?? 0), nominal: Number(r.nominal ?? 0),
  }));
  return { kpi, statusPie, table };
}

async function getEanggaranDetail(tahun: string): Promise<EanggaranDetail> {
  const [kpi, realRows] = await Promise.all([
    getKinerjaKpi(tahun),
    sql`SELECT sumber, COALESCE(SUM(real_keuangan),0) AS realisasi FROM kinerja_realisasi WHERE tahun = ${tahun} GROUP BY sumber`,
  ]);
  const realBySumber = new Map((realRows as Record<string, unknown>[]).map(r => [String(r.sumber), Number(r.realisasi ?? 0)]));
  // Tampilkan SEMUA sumber SSK (SUMBER_LIST 8 sumber), termasuk pagu 0 — agar lengkap,
  // bukan cuma sumber yang sudah ada barisnya. Pie pakai hanya pagu>0 (slice 0 tak berarti).
  const table = SUMBER_LIST.map(sumber => {
    const p = Number(kpi.pagu_per_sumber[sumber] ?? 0); const realisasi = realBySumber.get(sumber) ?? 0;
    return { sumber, pagu: p, realisasi, pct: p > 0 ? Math.round((realisasi / p) * 10000) / 100 : 0 };
  }).sort((a, b) => b.pagu - a.pagu);
  return {
    kpi: { total_pagu: kpi.total_pagu, total_real_keuangan: kpi.total_real_keuangan, pct_serapan: kpi.pct_serapan, total_ssk_rows: kpi.total_ssk_rows, total_rekening: kpi.total_rekening },
    sumberPie: table.filter(t => t.pagu > 0).map(t => ({ name: t.sumber, value: t.pagu })),
    table,
  };
}

async function getBludDetail(): Promise<BludDetail> {
  const versi_tanggal = await getDpaLatestDate();
  if (!versi_tanggal) return { kpi: { versi_tanggal: null, total_pagu: 0, leaf_baris: 0, total_baris: 0 }, kelompokPie: [], table: [] };
  const rows = await getDpaByDate(versi_tanggal);
  const total_pagu = rows.find(r => (r.uraian ?? '').trim().toUpperCase() === 'BELANJA DAERAH')?.jumlah ?? 0;
  const uraianByKode = new Map(rows.map(r => [r.kode_rekening, r.uraian]));
  const leaf = rows.filter(r => (r.vol ?? 0) > 0 || (r.harga ?? 0) > 0);
  const map = new Map<string, { jumlah: number; count: number }>();
  for (const r of leaf) {
    const key = (r.kode_rekening || '').split('.').slice(0, 2).join('.') || r.kode_rekening || '—';
    const e = map.get(key) ?? { jumlah: 0, count: 0 };
    e.jumlah += Number(r.jumlah) || 0; e.count++;
    map.set(key, e);
  }
  const table = [...map.entries()]
    .map(([kode, v]) => ({ kode, uraian: uraianByKode.get(kode) ?? kode, jumlah: v.jumlah, count: v.count }))
    .sort((a, b) => b.jumlah - a.jumlah);
  return {
    kpi: { versi_tanggal, total_pagu: Number(total_pagu) || 0, leaf_baris: leaf.length, total_baris: rows.length },
    kelompokPie: table.map(t => ({ name: t.uraian.length > 22 ? t.uraian.slice(0, 22) + '…' : t.uraian, value: t.jumlah })),
    table,
  };
}

async function getRenaksiDetail(tahun: number): Promise<RenaksiDetail> {
  const perLevelRows = await Promise.all(RA_LEVELS.map(l => listRencanaAksi(tahun, l)));
  const table = RA_LEVELS.map((level, i) => ({
    level, count: perLevelRows[i].length, target_terisi: perLevelRows[i].filter(r => r.target_tahunan > 0).length,
  }));
  return {
    kpi: { total_indikator: table.reduce((s, t) => s + t.count, 0), target_terisi: table.reduce((s, t) => s + t.target_terisi, 0) },
    table,
  };
}

async function getRealisasiKinerjaDetail(tahun: number): Promise<RealisasiKinerjaDetail> {
  const perLevelRows = await Promise.all(RA_LEVELS.map(l => listRencanaAksi(tahun, l)));
  let onTrack = 0, lagging = 0, grandT = 0, grandR = 0;
  const table = RA_LEVELS.map((level, i) => {
    let t = 0, r = 0;
    for (const row of perLevelRows[i]) {
      const { target, real } = sumQuarters(row);
      t += target; r += real;
      if (target > 0) { const pct = (real / target) * 100; if (pct >= ON_TRACK_THRESHOLD) onTrack++; else lagging++; }
    }
    grandT += t; grandR += r;
    return { level, total: perLevelRows[i].length, sum_target: t, sum_real: r, pct: t > 0 ? Math.round((r / t) * 10000) / 100 : 0 };
  });
  return {
    kpi: { pct_capaian_total: grandT > 0 ? Math.round((grandR / grandT) * 10000) / 100 : 0, on_track: onTrack, lagging },
    pie: [{ name: 'Tercapai', value: onTrack }, { name: 'Belum Tercapai', value: lagging }].filter(d => d.value > 0),
    table,
  };
}

export async function getModuleDetail(modul: DashModule, tahun: string): Promise<ModuleDetailData> {
  switch (modul) {
    case 'usulan':            return { modul, data: await getUsulanDetail() };
    case 'eanggaran':         return { modul, data: await getEanggaranDetail(tahun) };
    case 'blud':              return { modul, data: await getBludDetail() };
    case 'renaksi':           return { modul, data: await getRenaksiDetail(Number(tahun)) };
    case 'realisasi-kinerja': return { modul, data: await getRealisasiKinerjaDetail(Number(tahun)) };
  }
}
