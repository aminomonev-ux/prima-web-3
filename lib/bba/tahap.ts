// lib/bba/tahap.ts — "Tahap" satu rencana BBA (docs/konsep/bba/CONCEPT-bba-revamp-alur.md §2).
// DIHITUNG, tidak disimpan, dari kolom yang sudah ada. MURNI: dipakai tab & kolom Tahap halaman Rencana,
// pita alur (server), Pengadaan, dan uji — satu aturan, jadi angka pita & isi tab tidak bisa berbeda pendapat.
import type { BbaStatus } from './status';
import type { Anggaran, JenisRencana } from './rencana';
import type { KelengkapanRef } from './referensi';

export const TAHAP = [
  'PERLU_DILENGKAPI', 'SIAP_DIPUTUSKAN', 'DIDANAI', 'DIPESAN', 'DITERIMA_SEBAGIAN', 'DITERIMA_PENUH', 'TERCATAT',
  'TIDAK_DIDANAI', 'BATAL_DIBELI', 'USULAN_DITOLAK',
] as const;
export type Tahap = typeof TAHAP[number];

export const LABEL_TAHAP: Record<Tahap, string> = {
  PERLU_DILENGKAPI: 'Perlu dilengkapi', SIAP_DIPUTUSKAN: 'Siap diputuskan', DIDANAI: 'Didanai', DIPESAN: 'Dipesan',
  DITERIMA_SEBAGIAN: 'Diterima sebagian', DITERIMA_PENUH: 'Diterima penuh', TERCATAT: 'Tercatat di Buku Aset',
  TIDAK_DIDANAI: 'Tidak didanai', BATAL_DIBELI: 'Batal dibeli', USULAN_DITOLAK: 'Usulan ditolak',
};

export type BahanTahap = {
  status: BbaStatus;
  anggaran: Anggaran;
  usulan_keputusan: string | null;
  barang_id: number | null;
  jenis_rencana: JenisRencana | null;
  ref: KelengkapanRef;
  /** Unit diterima yang belum jadi register (rehab: gedung sasaran yang kondisinya belum diperbarui). */
  belum_dicatat: number;
};

/** Yang pertama kurang supaya rencana bisa diputuskan, atau `null` = lengkap. Urutan = urutan tombol "Lengkapi". */
export type Kurang = 'BARANG' | 'JENIS' | 'REFERENSI';
export function kurangPertama(r: Pick<BahanTahap, 'barang_id' | 'jenis_rencana' | 'ref'>): Kurang | null {
  if (r.barang_id === null) return 'BARANG';
  if (r.jenis_rencana === null) return 'JENIS';
  if (r.ref.tingkat !== 'LENGKAP') return 'REFERENSI';
  return null;
}

export function tahapRencana(r: BahanTahap): Tahap {
  if (r.usulan_keputusan === 'DITOLAK') return 'USULAN_DITOLAK';
  switch (r.status) {
    case 'TIDAK_TEREALISASI': return 'BATAL_DIBELI';
    case 'DIPROSES': return 'DIPESAN';
    case 'REALISASI_SEBAGIAN': return 'DITERIMA_SEBAGIAN';
    case 'REALISASI_PENUH': return r.belum_dicatat > 0 ? 'DITERIMA_PENUH' : 'TERCATAT';
    case 'DIRENCANAKAN': break;
  }
  if (r.anggaran === 'DIDANAI') return 'DIDANAI';
  if (r.anggaran === 'TIDAK_DIDANAI') return 'TIDAK_DIDANAI';
  return kurangPertama(r) ? 'PERLU_DILENGKAPI' : 'SIAP_DIPUTUSKAN';
}

/** Garis 5 titik: Rencana · Diputuskan · Dipesan · Diterima · Tercatat. `langkah` = titik yang sudah dilewati (0–5). */
export const TITIK_TAHAP = ['Rencana', 'Diputuskan', 'Dipesan', 'Diterima', 'Tercatat'] as const;
export function langkahTahap(t: Tahap): { langkah: number; cabang: 'MERAH' | 'ABU' | null } {
  switch (t) {
    case 'PERLU_DILENGKAPI': return { langkah: 0, cabang: null };
    case 'SIAP_DIPUTUSKAN': return { langkah: 1, cabang: null };
    case 'DIDANAI': return { langkah: 2, cabang: null };
    case 'DIPESAN': return { langkah: 3, cabang: null };
    case 'DITERIMA_SEBAGIAN': return { langkah: 3, cabang: null };
    case 'DITERIMA_PENUH': return { langkah: 4, cabang: null };
    case 'TERCATAT': return { langkah: 5, cabang: null };
    case 'TIDAK_DIDANAI': return { langkah: 1, cabang: 'MERAH' };
    case 'BATAL_DIBELI': return { langkah: 2, cabang: 'MERAH' };
    case 'USULAN_DITOLAK': return { langkah: 0, cabang: 'ABU' };
  }
}

/** Tab halaman Rencana (§3.2). "Siap diputuskan" = SEMUA yang belum diputuskan — yang belum lengkap tampil redup. */
export const TAB_RENCANA = ['perlu', 'siap', 'didanai', 'tidak', 'ditolak', 'semua'] as const;
export type TabRencana = typeof TAB_RENCANA[number];
export const LABEL_TAB_RENCANA: Record<TabRencana, string> = {
  perlu: 'Perlu dilengkapi', siap: 'Siap diputuskan', didanai: 'Didanai', tidak: 'Tidak didanai', ditolak: 'Usulan ditolak', semua: 'Semua',
};

export function masukTabRencana(tab: TabRencana, r: BahanTahap): boolean {
  if (tab === 'semua') return true;
  const t = tahapRencana(r);
  if (tab === 'ditolak') return t === 'USULAN_DITOLAK';
  if (t === 'USULAN_DITOLAK') return false;
  if (tab === 'perlu') return t === 'PERLU_DILENGKAPI';
  if (tab === 'siap') return r.anggaran === 'BELUM' && r.status === 'DIRENCANAKAN';
  if (tab === 'didanai') return r.anggaran === 'DIDANAI';
  return r.anggaran === 'TIDAK_DIDANAI';
}

/** Angka di label tab. "Siap diputuskan" menghitung yang LENGKAP saja — yang bisa diputuskan sekarang. */
export function hitungTabRencana(rows: readonly BahanTahap[]): Record<TabRencana, number> {
  const n = Object.fromEntries(TAB_RENCANA.map(t => [t, 0])) as Record<TabRencana, number>;
  for (const r of rows) {
    n.semua++;
    const t = tahapRencana(r);
    if (t === 'SIAP_DIPUTUSKAN') n.siap++;
    for (const tab of ['perlu', 'didanai', 'tidak', 'ditolak'] as const) if (masukTabRencana(tab, r)) n[tab]++;
  }
  return n;
}

export type RingkasAlur = {
  perluDilengkapi: number; menungguKeputusan: number; siapDipesan: number; menungguBarang: number; belumDicatat: number;
};

/** Angka pita alur (§3.1). `belumDicatat` dihitung dalam UNIT (rehab: gedung), bukan rencana. */
export function ringkasAlur(rows: readonly BahanTahap[]): RingkasAlur {
  const h: RingkasAlur = { perluDilengkapi: 0, menungguKeputusan: 0, siapDipesan: 0, menungguBarang: 0, belumDicatat: 0 };
  for (const r of rows) {
    const t = tahapRencana(r);
    if (t === 'PERLU_DILENGKAPI') h.perluDilengkapi++;
    else if (t === 'SIAP_DIPUTUSKAN') h.menungguKeputusan++;
    else if (t === 'DIDANAI') h.siapDipesan++;
    else if (t === 'DIPESAN' || t === 'DITERIMA_SEBAGIAN') h.menungguBarang++;
    if (t !== 'USULAN_DITOLAK') h.belumDicatat += Math.max(0, r.belum_dicatat);
  }
  return h;
}

/** Tab halaman Pengadaan (§3.3) — semua rencana didanai, per tahap. */
export const TAB_PENGADAAN = ['siap', 'dipesan', 'sebagian', 'selesai', 'batal'] as const;
export type TabPengadaan = typeof TAB_PENGADAAN[number];
export const LABEL_TAB_PENGADAAN: Record<TabPengadaan, string> = { siap: 'Siap dipesan', dipesan: 'Dipesan', sebagian: 'Diterima sebagian', selesai: 'Selesai', batal: 'Batal dibeli' };
export const TAHAP_TAB_PENGADAAN: Record<TabPengadaan, Tahap[]> = {
  siap: ['DIDANAI'], dipesan: ['DIPESAN'], sebagian: ['DITERIMA_SEBAGIAN'], selesai: ['DITERIMA_PENUH', 'TERCATAT'], batal: ['BATAL_DIBELI'],
};
export const tabPengadaan = (r: BahanTahap): TabPengadaan => TAB_PENGADAAN.find(t => TAHAP_TAB_PENGADAAN[t].includes(tahapRencana(r))) ?? 'siap';
