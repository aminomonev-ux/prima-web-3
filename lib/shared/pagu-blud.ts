// Pagu BLUD modul Usulan — satu angka per tahun anggaran (audit B5, 2026-09-29).
// Bebas dependensi server: dipakai route config, route KPI, dan layar Usulan.

/** Kunci `app_config` pagu BLUD satu tahun anggaran, mis. `pagu_blud_2026`. */
export const kunciPaguBlud = (tahun: string) => `pagu_blud_${tahun}`;

export const POLA_KUNCI_PAGU_BLUD = /^pagu_blud_(\d{4})$/;

export const POLA_TAHUN_ANGGARAN = /^\d{4}$/;

/**
 * Keputusan pemilik aplikasi (30 Sep): angka pagu BLUD boleh DILIHAT semua pengguna; yang
 * boleh MENGUBAH hanya peran di bawah. Dipakai `aturanConfig` (pagar API) DAN daftar panel
 * Usulan (`getPanels` + cerminnya di Sentinel), supaya tombol dan pagarnya satu sumber.
 */
export const PERAN_PENGUBAH_PAGU: readonly string[] = ['SUPER_ADMIN', 'ADMIN', 'PROGRAM'];

export const bolehUbahPagu = (role: string): boolean => PERAN_PENGUBAH_PAGU.includes(role);

/** Kunci-kunci `pagu_blud_{tahun}` dari peta config → { tahun: nominal }. */
export function paguPerTahunDariConfig(cfg: Record<string, string>): Record<string, number> {
  const hasil: Record<string, number> = {};
  for (const [k, v] of Object.entries(cfg)) {
    const m = POLA_KUNCI_PAGU_BLUD.exec(k);
    if (m) hasil[m[1]] = Number(v) || 0;
  }
  return hasil;
}

export type StatusPagu =
  | { jenis: 'SEMUA_TAHUN' }
  | { jenis: 'BELUM_DIATUR'; tahun: string }
  | { jenis: 'DALAM' | 'MELEBIHI'; tahun: string; pct: number };

/**
 * Pagu hanya bisa dibandingkan dengan nilai usulan TAHUN YANG SAMA. Saat saringan
 * "semua tahun" tidak ada pagu yang sah untuk pembandingnya — dulu satu angka pagu
 * dibandingkan dengan nilai seluruh tahun, jadi "Melebihi pagu" makin sering palsu
 * tiap tahun berganti.
 */
export function statusPagu(kpi: { pagu: number | null; nilai_aktif: number; tahun: string | null }): StatusPagu {
  if (kpi.pagu === null || !kpi.tahun) return { jenis: 'SEMUA_TAHUN' };
  if (!(kpi.pagu > 0)) return { jenis: 'BELUM_DIATUR', tahun: kpi.tahun };
  return {
    jenis: kpi.nilai_aktif <= kpi.pagu ? 'DALAM' : 'MELEBIHI',
    tahun: kpi.tahun,
    pct: Math.min(100, (kpi.nilai_aktif / kpi.pagu) * 100),
  };
}
