// Types client-side modul IKI — mirror payload API app/api/iki/* .
// JANGAN import dari lib/data/iki.ts di client (module server, tarik mysql2).

export type IkiVarian = 'STANDAR' | 'DIREKTUR';
export type IkiAspekB = 'Akumulatif' | 'Progres Positif' | 'Progres Negatif' | 'Pengulangan';
export type IkiAspekC = 'Utama' | 'Penunjang';

export const ASPEK_B_OPTIONS: IkiAspekB[] = ['Akumulatif', 'Progres Positif', 'Progres Negatif', 'Pengulangan'];
export const ASPEK_C_OPTIONS: IkiAspekC[] = ['Utama', 'Penunjang'];

export type IkiListRow = {
  id: number;
  tahun: string;
  varian: IkiVarian;
  nama: string;
  nip: string;
  jabatan: string;
  pangkat: string | null;
  status: 'DRAFT' | 'FINAL';
  version: number;
  updated_at: string;
  jumlah_rhk: number;
};

export type IkiTriwulan = {
  triwulan: 1 | 2 | 3 | 4;
  target_tw: string;
  uraian: string | null;
  target_aksi: string;
};

export type IkiRhk = {
  no_urut: number;
  rhk_intervensi: string | null;
  rhk: string;
  aspek_a: string;
  aspek_b: IkiAspekB;
  aspek_c: IkiAspekC;
  indikator: string;
  target_tahunan: string;
  formulasi: string | null;
  ekspektasi: string | null;
  renaksi_id: number | null;
  atasan_rhk_id: number | null;
  triwulan: IkiTriwulan[];
};

export type IkiDokumen = {
  id: number;
  tahun: string;
  varian: IkiVarian;
  opd: string;
  nama: string;
  nip: string;
  jabatan: string;
  pangkat: string | null;
  ikhtisar: string | null;
  nama_atasan: string | null;
  nip_atasan: string | null;
  jabatan_atasan: string | null;
  pangkat_atasan: string | null;
  kota_ttd: string;
  tanggal_ttd: string | null;
  atasan_dokumen_id: number | null;
  status: 'DRAFT' | 'FINAL';
  version: number;
  /** Server-computed: dokumen atasan diubah setelah save terakhir (banner lunak, DRAFT saja) */
  atasan_stale?: boolean;
  rhk: IkiRhk[];
};

export type PejabatSuggest = {
  unit_kerja: string;
  nama: string;
  jabatan: string;
  pangkat: string | null;
  nip: string | null;
};

export type RenaksiImportRow = {
  renaksi_id: number;
  level: 'tujuan' | 'sasaran' | 'program' | 'kegiatan' | 'sub-kegiatan';
  sasaran_induk: string;
  rhk: string;
  nama: string;
  parent: string;
  indikator: string;
  jenis: IkiAspekB;
  target_tahunan: string;
  target_tw: [string, string, string, string];
};

export type AtasanRhkRow = {
  atasan_rhk_id: number;
  no_urut: number;
  rhk: string;
  indikator: string;
  target_tahunan: string;
  aspek_b: IkiAspekB;
};

/** Label option datalist — unik per orang+jabatan (1 orang bisa 2 jabatan: asli + Plt.) */
export function pejabatOptionValue(p: PejabatSuggest): string {
  return `${p.nama} — ${p.jabatan}`;
}

/**
 * Resolve input datalist → pejabat. Tahap 1: match "NAMA — JABATAN" persis
 * (klik dari dropdown). Tahap 2: nama polos, HANYA kalau kandidat tunggal —
 * nama ganda (kasus Plt.) tidak ditebak, biar user memilih dari dropdown.
 */
export function resolvePejabat(input: string, pejabat: PejabatSuggest[]): PejabatSuggest | null {
  const byCombo = pejabat.find(p => pejabatOptionValue(p) === input);
  if (byCombo) return byCombo;
  const byName = pejabat.filter(p => p.nama === input);
  return byName.length === 1 ? byName[0] : null;
}

export function emptyTriwulan(): IkiTriwulan[] {
  return [1, 2, 3, 4].map(t => ({ triwulan: t as 1 | 2 | 3 | 4, target_tw: '0', uraian: null, target_aksi: '0' }));
}

export function emptyRhk(noUrut: number): IkiRhk {
  return {
    no_urut: noUrut,
    rhk_intervensi: null,
    rhk: '',
    aspek_a: 'Kuantitatif',
    aspek_b: 'Akumulatif',
    aspek_c: 'Utama',
    indikator: '',
    target_tahunan: '',
    formulasi: null,
    ekspektasi: null,
    renaksi_id: null,
    atasan_rhk_id: null,
    triwulan: emptyTriwulan(),
  };
}

/** Format tanggal ttd Indonesia: 2026-01-15 → "15 Januari 2026". */
export function formatTanggalIndo(iso: string | null): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  if (!y || !m || !d) return '';
  return `${d} ${BULAN[m - 1]} ${y}`;
}
