// ─── PRIMA E-Anggaran — Shared Constants & Pure Helpers ────────────────────────
// O2: extract constants + pure functions dari kinerja-client.tsx.
// Pure = input → output, no state read/write, no side effect. Bisa di-unit-test
// independent. Tab-tab nanti import dari sini supaya logic perhitungan tidak
// duplicate.

import type {
  SumberSSK, MasterTipe, MonthKey, SskMonths,
  RekForm, RealRow, CrrRow, PendRow,
} from './_types';

// ─── Constants ───────────────────────────────────────────────────────────────

export const SUMBER_LIST: SumberSSK[] = ['GAJI', 'BLUD', 'HARLEP', 'PROMKES', 'SARPRAS', 'OBAT', 'PEMELIHARAAN', 'PEMBANGUNAN'];

export const MONTHS_KEYS: MonthKey[] = ['jan','feb','mar','apr','mei','jun','jul','agu','sep','okt','nov','des'];
export const MONTH_LABELS = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
export const MONTH_SHORT  = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];

// Label CRR per bulan (sama dengan MONTH_LABELS tapi dipakai khusus tabel CRR).
export const CRR_BULAN_LABELS = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];

export const SSK_THEME: Record<SumberSSK, { color: string; grad: string; gradActive: string; label: string }> = {
  GAJI:    { color:'#2563eb', grad:'linear-gradient(135deg,#2563eb,#1d4ed8)', gradActive:'linear-gradient(135deg,#1855bb,#1045a0)', label:'SSK GAJI' },
  BLUD:    { color:'#16a34a', grad:'linear-gradient(135deg,#16a34a,#065f46)', gradActive:'linear-gradient(135deg,#16a34a,#065f46)', label:'SSK BLUD' },
  HARLEP:  { color:'#f97316', grad:'linear-gradient(135deg,#f97316,#c2410c)', gradActive:'linear-gradient(135deg,#f97316,#c2410c)', label:'SSK HARLEP' },
  PROMKES: { color:'#7c3aed', grad:'linear-gradient(135deg,#7c3aed,#6d28d9)', gradActive:'linear-gradient(135deg,#7c3aed,#6d28d9)', label:'SSK PROMKES' },
  SARPRAS: { color:'#0891b2', grad:'linear-gradient(135deg,#0891b2,#155e75)', gradActive:'linear-gradient(135deg,#0891b2,#155e75)', label:'SSK SARPRAS' },
  // 3 sumber baru — warna pakai design token (primary / action-warning / action-purple)
  OBAT:         { color:'#EF9F27', grad:'linear-gradient(135deg,#EF9F27,#C77F0E)', gradActive:'linear-gradient(135deg,#EF9F27,#C77F0E)', label:'SSK OBAT' },
  PEMELIHARAAN: { color:'#BA7517', grad:'linear-gradient(135deg,#BA7517,#8B5710)', gradActive:'linear-gradient(135deg,#BA7517,#8B5710)', label:'SSK PEMELIHARAAN' },
  PEMBANGUNAN:  { color:'#7C5CFC', grad:'linear-gradient(135deg,#7C5CFC,#5E40D9)', gradActive:'linear-gradient(135deg,#7C5CFC,#5E40D9)', label:'SSK PEMBANGUNAN' },
};

export const MASTER_TIPE_LIST: { tipe: MasterTipe; label: string; hasSumber: boolean }[] = [
  { tipe: 'program',         label: 'Program',          hasSumber: false },
  { tipe: 'kegiatan',        label: 'Kegiatan',         hasSumber: false },
  { tipe: 'subkegiatan',     label: 'Sub Kegiatan',     hasSumber: false },
  { tipe: 'uraian_ssk',      label: 'Uraian SSK',       hasSumber: true  },
  { tipe: 'sumber_anggaran', label: 'Sumber Anggaran',  hasSumber: false },
];

// Tahun list — generate dari 2024 s/d 2040 (17 tahun)
export const TAHUN_OPTIONS: string[] = Array.from(
  { length: 2040 - 2024 + 1 },
  (_, i) => String(2024 + i),
);

// ─── Factory functions (return fresh object literals) ───────────────────────

export function emptyMonths(): SskMonths {
  return { jan: 0, feb: 0, mar: 0, apr: 0, mei: 0, jun: 0, jul: 0, agu: 0, sep: 0, okt: 0, nov: 0, des: 0 };
}

export function emptyRekForm(): RekForm {
  return { uraian: '', uraian_ssk: '', sumber_anggaran: '', program: '', kegiatan: '', subkegiatan: '' };
}

export function initCrrRows(): CrrRow[] {
  return CRR_BULAN_LABELS.map((b, i) => ({
    bulan_ke: i + 1, bulan: b,
    pendapatan: 0, belanja_blud: 0, belanja_daerah: 0,
    pendapatan_sd: 0, belanja_blud_sd: 0, belanja_daerah_sd: 0,
    crr_parsial_pct: 0, crr_total_pct: 0,
  }));
}

export function initPendapatanRows(): PendRow[] {
  return CRR_BULAN_LABELS.map(b => ({ keterangan: b, target: 0, realisasi: 0, capaian_pct: 0 }));
}

// ─── Math helpers ────────────────────────────────────────────────────────────

export function calcTotal(months: SskMonths): number {
  return MONTHS_KEYS.reduce((sum, m) => sum + (months[m] || 0), 0);
}

export function calcTotalPct(total: number, pagu: number): number {
  if (!pagu) return 0;
  return Math.round((total / pagu) * 10000) / 100;
}

// ─── Pure transform: Recalculate all 9 derived fields dari 5 input field ────
//
// Groups by keterangan + uraian_ssk supaya nama keterangan sama (beda hierarki)
// tidak tabrakan. Untuk setiap group, sort by bulan ASC lalu hitung running
// total akumulasi (target_fisik, real_fisik, real_keuangan, deviasi, dst).
//
// `akum_target_fisik` disimpan sebagai % (bukan Rp) — dijumlah tanpa round dulu
// supaya tidak drift, baru dibulatkan 2 desimal di akhir.
export function recalcAllRealisasi(rows: RealRow[]): RealRow[] {
  const groups = new Map<string, { row: RealRow; origIdx: number }[]>();
  rows.forEach((r, i) => {
    // #9: canonical_id = identitas item paling presisi (nama kembar lintas
    // sub-kegiatan tidak tercampur). Fallback legacy: keterangan+uraian_ssk.
    // Sinkron dengan lib/data/kinerja-calc.ts.
    const groupKey = r.ssk_canonical_id
      ? `cid:${r.ssk_canonical_id}`
      : `${r.keterangan || ''}||${r.uraian_ssk || ''}`;
    if (!groups.has(groupKey)) groups.set(groupKey, []);
    groups.get(groupKey)!.push({ row: { ...r }, origIdx: i });
  });

  const resultMap = new Map<number, RealRow>();
  for (const entries of groups.values()) {
    entries.sort((a, b) => a.row.bulan - b.row.bulan);
    let akumTargetPct = 0;
    let akumRealFisik = 0;
    let akumKeuangan  = 0;
    for (const { row, origIdx } of entries) {
      const pagu = row.pagu_awal || 0;
      akumTargetPct += row.target_fisik  || 0;
      akumRealFisik += row.real_fisik    || 0;
      akumKeuangan  += row.real_keuangan || 0;
      const pct_fisik         = pagu > 0 ? Math.round((row.real_fisik    / pagu) * 10000) / 100 : 0;
      const akum_pct_fisik    = pagu > 0 ? Math.round((akumRealFisik     / pagu) * 10000) / 100 : 0;
      const pct_keuangan      = pagu > 0 ? Math.round((row.real_keuangan / pagu) * 10000) / 100 : 0;
      const akum_pct_keuangan = pagu > 0 ? Math.round((akumKeuangan      / pagu) * 10000) / 100 : 0;
      // #5/#6: konvensi seragam `target − real` (positif = tertinggal/under-pace,
      // negatif = melampaui target) untuk fisik & keuangan. E3: dihitung dari akum
      // mentah (belum dibulatkan) supaya tidak drift ±0,01. Sinkron kinerja-calc.ts.
      const akumPctFisikRaw   = pagu > 0 ? (akumRealFisik / pagu) * 100 : 0;
      const akumPctKeuRaw     = pagu > 0 ? (akumKeuangan  / pagu) * 100 : 0;
      const deviasi_fisik     = Math.round((akumTargetPct - akumPctFisikRaw) * 100) / 100;
      const deviasi_keuangan  = Math.round((akumTargetPct - akumPctKeuRaw)   * 100) / 100;
      resultMap.set(origIdx, {
        ...row,
        pct_fisik,
        akum_target_fisik: Math.round(akumTargetPct * 100) / 100,
        akum_real_fisik:   akumRealFisik,
        akum_pct_fisik,
        pct_keuangan,
        akum_keuangan:     akumKeuangan,
        akum_pct_keuangan,
        deviasi_fisik,
        deviasi_keuangan,
      });
    }
  }
  return rows.map((_, i) => resultMap.get(i)!);
}

// ─── Pure transform: Recalculate s/d (sampai dengan) columns + CRR % ────────
//
// CRR = Cost Recovery Rate. Kumulatif sampai bulan berjalan.
//   crr_parsial = sumPend_sd / sumBlud_sd   × 100   (vs belanja BLUD only)
//   crr_total   = sumPend_sd / sumDaerah_sd × 100   (vs total belanja daerah)
//
// Row dengan semua nilai 0 dianggap belum diisi → skip akumulasi (akum tetap
// dari row sebelumnya). Mencegah row kosong di tengah tahun mengnol-kan akum.
export function recalcCrr(rows: CrrRow[]): CrrRow[] {
  let akumPend = 0, akumBlud = 0, akumDaerah = 0;
  return rows.map(r => {
    const hasData = (r.pendapatan || 0) > 0 || (r.belanja_blud || 0) > 0 || (r.belanja_daerah || 0) > 0;
    if (hasData) {
      akumPend   += r.pendapatan     || 0;
      akumBlud   += r.belanja_blud   || 0;
      akumDaerah += r.belanja_daerah || 0;
    }
    return {
      ...r,
      pendapatan_sd:     akumPend,
      belanja_blud_sd:   akumBlud,
      belanja_daerah_sd: akumDaerah,
      // #11: bulan kosong carry-forward CRR kumulatif terakhir (konsisten kolom
      // _sd) — bukan 0, supaya nilai tersimpan tidak menyesatkan konsumen lain.
      crr_parsial_pct: akumBlud   > 0 ? Math.round((akumPend / akumBlud)   * 10000) / 100 : 0,
      crr_total_pct:   akumDaerah > 0 ? Math.round((akumPend / akumDaerah) * 10000) / 100 : 0,
    };
  });
}
