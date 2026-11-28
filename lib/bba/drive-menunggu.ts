// lib/bba/drive-menunggu.ts — perubahan Drive yang menunggu, ditampilkan per baris di layar BBA
// (docs/konsep/bba/CONCEPT-bba-drive-dua-arah.md U2). MURNI: dipakai cron (ringkasan), API (nilai terhadap PRIMA sekarang),
// pratinjau tinjauan (yang sudah diputuskan di web tidak ditanyakan lagi), dan uji. Aturan gabungnya `gabungTigaArah` — tidak
// ada aturan kedua.
import {
  SPEK, JUDUL, gabungTigaArah, samaNilai,
  type BacaanBerkas, type MetaPrima, type NilaiBaku, type Potret, type Tinjauan,
} from './drive-balik';
import { LEMBAR_BALIK, type LembarBalik } from './laporan-excel';
import { LABEL_ANGGARAN, LABEL_JENIS, type Anggaran, type JenisRencana } from './rencana';
import { LABEL_PAJAK, LABEL_TINDAK_LANJUT, type StatusPajak, type StatusTindakLanjut } from './penawaran';

/** Batas sel yang disimpan — ringkasan hidup di satu baris `app_config` (TEXT 64 KB). Lebih = layar menunjuk ke tinjauan. */
export const MAKS_SEL_MENUNGGU = 120;
const MAKS_TEKS = 150;

/** Satu sel yang diubah di Drive dibanding ASAL (salinan yang dibuka pengubah). `a` = asal, `d` = isi Drive. */
export type SelDrive = { l: LembarBalik; id: number; k: string; a: NilaiBaku; d: NilaiBaku };

/** Disimpan cron per berkas (kunci `rencana:{tahun}`), sahih hanya untuk `revisi` yang sama dengan tahanan sekarang. */
export interface RingkasMenunggu {
  revisi: string;
  sel: SelDrive[];
  terpotong: boolean;
  /** Baris baru, catatan tinjauan (diabaikan/dihapus/galat), dan peringatan berkas (kolom asing/ragu/lembar hilang). */
  baru: number;
  catatan: number;
  peringatan: number;
  /** "Tetap nilai PRIMA" yang dipilih di web: kunci sel → isi Drive yang ditolak. */
  tetap: Record<string, NilaiBaku>;
}

export const kunciSel = (l: LembarBalik, id: number, k: string) => `${l}:${id}:${k}`;

const potong = (v: NilaiBaku | undefined): NilaiBaku => (typeof v === 'string' && v.length > MAKS_TEKS ? v.slice(0, MAKS_TEKS) : v ?? null);

/**
 * Sel yang diubah di Drive dibanding asal, TANPA memandang PRIMA sekarang — PRIMA dinilai saat layar membacanya, jadi simpanan
 * di web langsung terlihat tanpa menunggu cron. Caranya: `gabungTigaArah` dengan PRIMA "semu" = isi asal untuk tiap baris yang
 * masih ada, sehingga setiap beda Drive vs asal keluar sebagai usulan lewat pagar yang SAMA (kolom hitungan, baris usulan
 * terkunci, baris dihapus di PRIMA).
 */
export function selisihDrive(berkas: BacaanBerkas, asal: Potret | null, prima: Potret, meta: MetaPrima): Omit<RingkasMenunggu, 'revisi' | 'peringatan' | 'tetap'> {
  const semu = Object.fromEntries(LEMBAR_BALIK.map(l => [l, Object.fromEntries(Object.entries(prima[l]).map(([id, p]) =>
    [id, asal?.[l]?.[id] ? { ...p, ...asal[l][id] } : p]))])) as Potret;
  const t = gabungTigaArah(berkas, asal, semu, meta);
  const sel = t.ubah.flatMap(u => u.sel.map(s => ({ l: u.lembar, id: u.id, k: s.kunci, a: potong(s.asal ?? s.prima), d: potong(s.drive) })));
  // Kolom hitungan (Nilai, Tahap, …) ikut berubah sendiri saat Vol/Harga disunting di Sheets — PRIMA menghitungnya ulang,
  // jadi tidak ada yang hilang saat berkas ditimpa. Catatan lain (dihapus, kolom lembar lain, galat) tetap menahan.
  return { sel: sel.slice(0, MAKS_SEL_MENUNGGU), terpotong: sel.length > MAKS_SEL_MENUNGGU, baru: t.baru.length,
    catatan: t.catatan.filter(c => c.jenis !== 'hitung').length };
}

export type JenisMenunggu = 'usul' | 'benturan';
export type SelMenunggu = {
  l: LembarBalik; id: number; k: string; judul: string; jenis: JenisMenunggu;
  asal: NilaiBaku; drive: NilaiBaku; prima: NilaiBaku;
  /** Teks tampilan (label jenis/keputusan/pajak, angka berpemisah). */
  teks: { asal: string; drive: string; prima: string };
};

export function tampilBaku(l: LembarBalik, k: string, v: NilaiBaku | undefined): string {
  if (v === null || v === undefined || v === '') return '(kosong)';
  switch (SPEK[l][k]?.nilai) {
    case 'angka': return Number(v).toLocaleString('id-ID', { maximumFractionDigits: 2 });
    case 'jenis': return LABEL_JENIS[v as JenisRencana] ?? String(v);
    case 'keputusan': return v === 'DITOLAK' ? 'Usulan ditolak' : LABEL_ANGGARAN[v as Anggaran] ?? String(v);
    case 'pajak': return LABEL_PAJAK[v as StatusPajak] ?? String(v);
    case 'tindak': return LABEL_TINDAK_LANJUT[v as StatusTindakLanjut] ?? String(v);
    default: return String(v);
  }
}

/**
 * Yang MASIH menunggu, dinilai terhadap PRIMA sekarang. Hilang sendiri bila PRIMA sudah sama dengan Drive (nilai Drive dipakai
 * lewat Simpan biasa), bila dipilih "tetap nilai PRIMA", atau bila barisnya sudah tidak ada. PRIMA berubah dari asal ke nilai
 * lain = benturan.
 */
export function nilaiMenunggu(r: RingkasMenunggu | null | undefined, prima: Potret): SelMenunggu[] {
  if (!r) return [];
  return r.sel.flatMap(s => {
    const baris = prima[s.l]?.[String(s.id)];
    const spek = SPEK[s.l][s.k];
    if (!baris || !spek) return [];
    const p = baris[s.k] ?? null;
    if (samaNilai(spek.nilai, p, s.d)) return [];
    const kunci = kunciSel(s.l, s.id, s.k);
    if (kunci in r.tetap && samaNilai(spek.nilai, r.tetap[kunci], s.d)) return [];
    const jenis: JenisMenunggu = samaNilai(spek.nilai, p, s.a) ? 'usul' : 'benturan';
    return [{ l: s.l, id: s.id, k: s.k, judul: JUDUL[s.l][s.k] ?? s.k, jenis, asal: s.a, drive: s.d, prima: p,
      teks: { asal: tampilBaku(s.l, s.k, s.a), drive: tampilBaku(s.l, s.k, s.d), prima: tampilBaku(s.l, s.k, p) } }];
  });
}

/**
 * Tahanan boleh dilepas tanpa tinjauan bila SEMUA isi berkas Drive sudah diputuskan di web: tidak ada sel menunggu, dan berkas
 * tidak membawa apa pun yang hanya bisa dilihat di tinjauan (baris baru, catatan, kolom asing, ringkasan terpotong). Sengaja
 * ketat: yang terlewat di sini hilang saat berkas ditimpa.
 */
export function bolehLepasOtomatis(r: RingkasMenunggu | null | undefined, menunggu: readonly SelMenunggu[]): boolean {
  return !!r && menunggu.length === 0 && !r.terpotong && r.baru === 0 && r.catatan === 0 && r.peringatan === 0;
}

/** Tinjauan tidak menanyakan lagi sel yang di web sudah dipilih "tetap nilai PRIMA" (untuk isi Drive yang sama). */
export function saringTetap(t: Tinjauan, tetap: Record<string, NilaiBaku> | undefined): { tinjauan: Tinjauan; diputuskan: number } {
  if (!tetap || !Object.keys(tetap).length) return { tinjauan: t, diputuskan: 0 };
  let diputuskan = 0;
  const ubah = t.ubah.map(u => {
    const sel = u.sel.filter(s => {
      const k = kunciSel(u.lembar, u.id, s.kunci);
      const buang = k in tetap && samaNilai(SPEK[u.lembar][s.kunci].nilai, tetap[k], s.drive);
      if (buang) diputuskan++;
      return !buang;
    });
    return { ...u, sel };
  }).filter(u => u.sel.length);
  return { tinjauan: { ...t, ubah }, diputuskan };
}
