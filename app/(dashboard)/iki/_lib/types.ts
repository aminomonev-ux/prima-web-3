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

// Fuzzy match jabatan teks bebas → pejabat Master PK (client-safe, tanpa import server).
// Sinonim struktural sama dengan matcher import Master Pejabat (Kabag=Kepala Bagian, dst).
function jabatanTokens(s: string): Set<string> {
  let t = ' ' + s.toLowerCase() + ' ';
  t = t
    .replace(/\bkepala\s+sub\s*bagian\b/g, ' kasubbag ')
    .replace(/\bkasubag\b/g, ' kasubbag ')
    .replace(/\bkepala\s+bagian\b/g, ' kabag ')
    .replace(/\bkepala\s+bidang\b/g, ' kabid ')
    .replace(/\bkepala\s+seksi\b/g, ' kasi ')
    .replace(/\bkasie\b/g, ' kasi ')
    .replace(/\bwakil\s+direktur\b/g, ' wadir ')
    .replace(/\bplt\.?\b/g, ' plt ')
    .replace(/\btata\s+usaha\b/g, ' tu ')
    .replace(/\bhubungan\s+masyarakat\b/g, ' humas ');
  t = t.replace(/[^a-z0-9]+/g, ' ');
  return new Set(t.split(' ').filter(w => w && w !== 'dan'));
}

export function matchPejabatByJabatan(jabatan: string, list: PejabatSuggest[]): { p: PejabatSuggest; score: number } | null {
  const t = jabatanTokens(jabatan);
  if (t.size === 0) return null;
  let best: PejabatSuggest | null = null;
  let bestScore = 0;
  for (const p of list) {
    const pt = jabatanTokens(p.jabatan);
    if (pt.size === 0) continue;
    let inter = 0;
    for (const w of t) if (pt.has(w)) inter++;
    const dice = (2 * inter) / (t.size + pt.size);
    // Containment: jabatan master utuh di dalam teks file = match — blok TTD sering
    // pakai bentuk panjang ("DIREKTUR RSJD dr. AMINO ..." vs master "DIREKTUR").
    // Aman dari "Wakil Direktur" karena sinonim wadir dinormalkan lebih dulu.
    const contained = inter === Math.min(t.size, pt.size) ? 0.95 : 0;
    const s = Math.max(dice, contained);
    if (s > bestScore) { bestScore = s; best = p; }
  }
  return best && bestScore >= 0.6 ? { p: best, score: bestScore } : null;
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
