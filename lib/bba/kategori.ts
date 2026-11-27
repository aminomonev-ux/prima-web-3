// lib/bba/kategori.ts — aturan murni Master Kategori 2 Tingkat (CONCEPT-bba-master-kategori.md).
// MURNI (tanpa impor server/React): dipakai data layer, route API, dan layar.
import type { Golongan } from './kib';

export const KATEGORI_INDUK_BAWAAN = ['Barang dan Jasa', 'Modal', 'Pegawai'] as const;

export const KELOMPOK_KIB_BAWAAN = [
  'TANAH',
  'PERALATAN DAN MESIN',
  'GEDUNG DAN BANGUNAN',
  'JALAN, IRIGASI, DAN JARINGAN',
  'KONSTRUKSI DALAM PENGERJAAN (KDP)',
  'ALKES & ALDOK',
] as const;

export const KATEGORI_LAMA_KIB = new Set<string>(KELOMPOK_KIB_BAWAAN);

export interface KategoriIndukItem {
  id: number;
  nama: string;
  bawaan: boolean;
  urutan: number;
}

export interface KelompokKibItem {
  id: number;
  nama: string;
  bawaan: boolean;
  urutan: number;
}

export interface JenisKategoriItem {
  id: number;
  kategori_id: number;
  kategori: string;
  nama: string;
  jenis_kategori: string;
  kode_rekening: string | null;
  kelompok_kib: string | null;
  urutan: number;
}

export interface MasterKategoriData {
  induk: KategoriIndukItem[];
  jenis: JenisKategoriItem[];
  kelompok_kib: KelompokKibItem[];
}

export interface RekeningBludItem {
  kode: string;
  uraian: string;
  sumber: 'MASTER_AKUN' | 'KODE_BESAR';
}

export interface InfoKategoriItem {
  kategori_id?: number | null;
  jenis_kategori_id?: number | null;
  kategori?: string | null;
  jenis_kategori?: string | null;
  kode_rekening?: string | null;
  kelompok_kib?: string | null;
  kategori_aset?: string | null;
}

const normKode = (kode: string | null | undefined) => (kode ?? '').trim().replace(/\s+/g, '');

/** Kode belanja operasi (5.1.x) — dipakai `adalahModal` DAN cerminnya `SYARAT_MODAL` (REGEXP MySQL, dikirim sebagai parameter). */
export const POLA_KODE_OPERASI = '^5\\.0?1(\\.|$)';

/**
 * Deteksi otomatis Kelompok KIB khusus kategori Modal (CONCEPT §2.3):
 * Prioritas 1: kata kunci nama/uraian untuk ALKES & ALDOK (alkes, kedokteran, medis, laboratorium kesehatan, rumah sakit).
 * Prioritas 2: awalan kode rekening 5.2.01 .. 5.2.06 (atau kata kunci konstruksi/KDP).
 */
export function deteksiKelompokKib(kodeRekening?: string | null, uraian?: string | null): string | null {
  const teks = (uraian ?? '').toLowerCase();
  if (/\balkes\b|alat\s+kesehatan|kedokteran|\bmedis\b|laboratorium\s+kesehatan|rumah\s+sakit/.test(teks)) {
    return 'ALKES & ALDOK';
  }
  const kode = normKode(kodeRekening);
  if (/^5\.0?2\.0?1(\.|$)/.test(kode)) return 'TANAH';
  if (/^5\.0?2\.0?2(\.|$)/.test(kode)) return 'PERALATAN DAN MESIN';
  if (/^5\.0?2\.0?3(\.|$)/.test(kode)) return 'GEDUNG DAN BANGUNAN';
  if (/^5\.0?2\.0?4(\.|$)/.test(kode)) return 'JALAN, IRIGASI, DAN JARINGAN';
  if (/^5\.0?2\.0?[56](\.|$)/.test(kode) || /konstruksi|\bkdp\b/.test(teks)) {
    return 'KONSTRUKSI DALAM PENGERJAAN (KDP)';
  }
  return null;
}

/** Pemetaan awal Golongan KIB A–F saat barang diterima masuk ke Buku Aset (§6). */
export function golonganDariKelompokKib(kelompokKib?: string | null, kategoriLama?: string | null): Golongan | null {
  const u = (kelompokKib || kategoriLama || '').trim().toUpperCase();
  if (!u) return null;
  if (u === 'TANAH' || /\bTANAH\b/.test(u)) return 'A';
  if (u.includes('ALKES') || u.includes('ALDOK') || u.includes('PERALATAN') || u.includes('MESIN')) return 'B';
  if (u.includes('GEDUNG') || u.includes('BANGUNAN')) return 'C';
  if (u.includes('JALAN') || u.includes('IRIGASI') || u.includes('JARINGAN')) return 'D';
  if (u.includes('TETAP LAINNYA') || u.includes('KIB E')) return 'E';
  if (u.includes('KONSTRUKSI') || u.includes('KDP')) return 'F';
  return null;
}

/** Saran kategori induk bawaan dari kode rekening BLUD / teks jenis belanja (mis. 5.1.01 → Pegawai, 5.1.02 → Barang dan Jasa, 5.2 → Modal). */
export function deteksiKategoriInduk(kodeRekening?: string | null, uraian?: string | null): string | null {
  const kode = normKode(kodeRekening);
  if (/^5\.0?1\.0?1(\.|$)/.test(kode)) return 'Pegawai';
  if (/^5\.0?1\.0?2(\.|$)/.test(kode)) return 'Barang dan Jasa';
  if (/^5\.0?2(\.|$)/.test(kode)) return 'Modal';
  const teks = (uraian ?? '').toLowerCase();
  if (teks.includes('belanja modal')) return 'Modal';
  if (teks.includes('belanja pegawai')) return 'Pegawai';
  if (teks.includes('belanja barang dan jasa') || teks.includes('barang & jasa')) return 'Barang dan Jasa';
  return null;
}

/**
 * Normalisasi backward compatibility (§5.3):
 * item lama yang hanya punya `kategori_aset` berisi 6 KIB lama (sementara `kategori` & `jenis_kategori` kosong)
 * dibaca sebagai `{ kategori: 'Modal', jenis_kategori: <lama>, kelompok_kib: <lama> }`.
 */
export function normalisasiKategoriItem<T extends InfoKategoriItem>(row: T): {
  kategori: string | null;
  jenis_kategori: string | null;
  kode_rekening: string | null;
  kelompok_kib: string | null;
} {
  const kat = row.kategori?.trim() || null;
  const jns = row.jenis_kategori?.trim() || null;
  const kode = row.kode_rekening?.trim() || null;
  let kib = row.kelompok_kib?.trim() || null;
  const lama = row.kategori_aset?.trim() || null;

  if (!kat && !jns && lama && KATEGORI_LAMA_KIB.has(lama.toUpperCase())) {
    const kanonik = lama.toUpperCase();
    return { kategori: 'Modal', jenis_kategori: lama, kode_rekening: kode, kelompok_kib: kib || kanonik };
  }
  if (!kib && kat?.toLowerCase() === 'modal' && jns && KATEGORI_LAMA_KIB.has(jns.toUpperCase())) {
    kib = jns.toUpperCase();
  }
  return { kategori: kat, jenis_kategori: jns, kode_rekening: kode, kelompok_kib: kib };
}

/**
 * Penentu apakah item/rencana termasuk kategori Modal sehingga masuk antrean Buku Aset (KIB).
 * Item eksplisit Barang dan Jasa, Pegawai, atau induk kustom selain Modal selesai di Pengadaan.
 * Data lama tanpa kategori tetap diperlakukan Modal kecuali kode rekeningnya jelas operasional 5.1.x.
 */
export function adalahModal(row: Pick<InfoKategoriItem, 'kategori' | 'kategori_aset' | 'kode_rekening'>): boolean {
  const kat = row.kategori?.trim();
  if (kat) return kat.toLowerCase() === 'modal';
  const lama = row.kategori_aset?.trim().toUpperCase();
  if (lama) return KATEGORI_LAMA_KIB.has(lama) || lama === 'ALKES';
  return !new RegExp(POLA_KODE_OPERASI).test(normKode(row.kode_rekening));
}

export type SaringKategori = { kategori?: string; jenis_kategori?: string };

/**
 * Saringan Kategori/Jenis untuk baris RENCANA yang sudah dinormalkan (`mapRow`). "Modal" = `adalahModal` — sama dengan
 * saringan daftar Rencana di server (`SYARAT_MODAL`), kalau tidak item lama tanpa kategori tampil di layar tapi hilang dari Excel.
 */
export function cocokSaringKategori(row: Pick<InfoKategoriItem, 'kategori' | 'jenis_kategori' | 'kode_rekening' | 'kategori_aset'>, s: SaringKategori): boolean {
  const kat = s.kategori?.trim().toLowerCase();
  if (kat && (kat === 'modal' ? !adalahModal(row) : (row.kategori ?? '').trim().toLowerCase() !== kat)) return false;
  const jns = s.jenis_kategori?.trim().toLowerCase();
  if (jns && (row.jenis_kategori ?? row.kategori_aset ?? '').trim().toLowerCase() !== jns) return false;
  return true;
}

export interface PilihanKategori { kategori_id: number | null; jenis_kategori_id: number | null }

const samaNama = (a: string | null | undefined, b: string | null | undefined) =>
  !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Id pilihan untuk form dari baris tersimpan: id yang masih ada di Master dipakai, kalau tidak dicari lewat nama
 * (data lama hanya punya teks). Yang tidak ditemukan = null, teksnya tetap tampil sebagai "di luar Master".
 */
export function pilihanDariBaris(master: MasterKategoriData, row: InfoKategoriItem): PilihanKategori {
  const kat = normalisasiKategoriItem(row);
  const induk = master.induk.find(i => i.id === row.kategori_id) ?? master.induk.find(i => samaNama(i.nama, kat.kategori));
  if (!induk) return { kategori_id: null, jenis_kategori_id: null };
  const milik = master.jenis.filter(j => j.kategori_id === induk.id);
  const jenis = milik.find(j => j.id === row.jenis_kategori_id)
    ?? milik.find(j => samaNama(j.nama, kat.jenis_kategori) && (j.kode_rekening ?? '') === (kat.kode_rekening ?? ''))
    ?? milik.find(j => samaNama(j.nama, kat.jenis_kategori));
  return { kategori_id: induk.id, jenis_kategori_id: jenis?.id ?? null };
}

/** Kelompok KIB yang akan disimpan server untuk pilihan ini (cermin `selesaikanKategori`) — hanya Modal. */
export function kelompokKibPilihan(master: MasterKategoriData, p: PilihanKategori, kode: string | null): string | null {
  const induk = master.induk.find(i => i.id === p.kategori_id);
  if (!induk || induk.nama.toLowerCase() !== 'modal') return null;
  const jenis = master.jenis.find(j => j.id === p.jenis_kategori_id);
  return jenis?.kelompok_kib ?? deteksiKelompokKib(kode, jenis?.nama);
}

/** Gabungkan hasil pencarian Master Akun dan Kode Besar BLUD tanpa duplikasi kode rekening. */
export function gabungRekeningBlud(
  masterAkun: ReadonlyArray<{ kode: string; uraian: string }>,
  kodeBesar: ReadonlyArray<{ kode: string; uraian: string }>,
): RekeningBludItem[] {
  const peta = new Map<string, RekeningBludItem>();
  for (const r of masterAkun) {
    const kode = r.kode.trim();
    const uraian = r.uraian.trim();
    if (!kode || !uraian) continue;
    const kunci = normKode(kode);
    if (!peta.has(kunci)) peta.set(kunci, { kode, uraian, sumber: 'MASTER_AKUN' });
  }
  for (const r of kodeBesar) {
    const kode = r.kode.trim();
    const uraian = r.uraian.trim();
    if (!kode || !uraian) continue;
    const kunci = normKode(kode);
    if (!peta.has(kunci)) peta.set(kunci, { kode, uraian, sumber: 'KODE_BESAR' });
  }
  return [...peta.values()].sort((a, b) => a.kode.localeCompare(b.kode, 'en', { numeric: true }));
}
