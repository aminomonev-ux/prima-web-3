// ═══ PRIMA — Buku Besar Aset: referensi harga & bukti dukung (aturan MURNI) ═══
// Konsep: docs/CONCEPT-bba-perencanaan.md §4. Dipakai layar DAN server — satu aturan,
// jadi "Ref n/3" di tabel, di modal, dan angka tombol "Lengkapi referensi (n)" tidak bisa
// berbeda pendapat. Tanpa impor DB: berkas ini dibaca komponen 'use client'.
import { isSafeHttpUrl } from '@/lib/shared/url';

export const SUMBER_REFERENSI = ['EKATALOG', 'TOKO_DARING', 'TOKO_LURING', 'LAINNYA'] as const;
export type SumberReferensi = typeof SUMBER_REFERENSI[number];
export const LABEL_SUMBER: Record<SumberReferensi, string> = {
  EKATALOG: 'e-Katalog', TOKO_DARING: 'Toko daring', TOKO_LURING: 'Toko luring', LAINNYA: 'Lainnya',
};

export const JENIS_BUKTI = ['BUKTI_BELI', 'BAST', 'FOTO', 'LAINNYA'] as const;
export type JenisBukti = typeof JENIS_BUKTI[number];
export const LABEL_JENIS_BUKTI: Record<JenisBukti, string> = {
  BUKTI_BELI: 'Bukti beli', BAST: 'BAST', FOTO: 'Foto', LAINNYA: 'Lainnya',
};
// "Bukti n/3" menghitung JENIS yang ada, bukan jumlah berkas — tiga foto bukan pengganti BAST.
const JENIS_BUKTI_INTI: readonly JenisBukti[] = ['BUKTI_BELI', 'BAST', 'FOTO'];

export const TARGET_REFERENSI = 3;
export const TARGET_BUKTI = JENIS_BUKTI_INTI.length;
export const MAKS_REFERENSI = 10;
export const MAKS_BUKTI = 30;

const DOMAIN_EKATALOG = ['inaproc.id', 'lkpp.go.id'];
const DOMAIN_TOKO_DARING = ['shopee.co.id', 'shp.ee', 'tokopedia.com', 'tokopedia.link', 'lazada.co.id', 'blibli.com', 'bukalapak.com'];

function domainCocok(host: string, daftar: string[]): boolean {
  return daftar.some((d) => host === d || host.endsWith('.' + d));
}

/**
 * Sumber yang bisa DIPASTIKAN dari domain tautan, atau `null`. Domain lain sengaja `null`,
 * bukan 'LAINNYA': toko luring berwebsite yang sudah dipilih orang tidak boleh ditimpa
 * tebakan saat tautannya ditempel.
 */
export function tebakSumber(url: string | null | undefined): SumberReferensi | null {
  if (!isSafeHttpUrl(url)) return null;
  const host = new URL(url!.trim()).hostname.toLowerCase();
  if (domainCocok(host, DOMAIN_EKATALOG)) return 'EKATALOG';
  if (domainCocok(host, DOMAIN_TOKO_DARING)) return 'TOKO_DARING';
  return null;
}

export type ReferensiIsian = {
  sumber: SumberReferensi;
  nama_penyedia: string | null;
  /** Tahap D buku aset — dibaca lagi sebagai "pembelian sebelumnya" (§7.7). Referensi lama tanpa kolom ini. */
  merk_tipe?: string | null;
  url: string | null;
  harga: number | null;
  tgl_cek: string | null;
  file_id: string | null;
};

/** Referensi yang ikut dihitung "Ref n/3" dan ringkasan harga: berharga DAN berbukti (tautan atau berkas). */
export function referensiSah(r: Pick<ReferensiIsian, 'harga' | 'url' | 'file_id'>): boolean {
  return (r.harga ?? 0) > 0 && (isSafeHttpUrl(r.url) || !!r.file_id);
}

export type RingkasHarga = { jumlah: number; terendah: number; rata: number; tertinggi: number };

/** Rata-rata dibulatkan ke rupiah di SINI, supaya angka yang tampil = angka yang diisi "Pakai rata-rata". */
export function ringkasHarga(daftar: Pick<ReferensiIsian, 'harga' | 'url' | 'file_id'>[]): RingkasHarga | null {
  const harga = daftar.filter(referensiSah).map((r) => Number(r.harga));
  if (harga.length === 0) return null;
  return {
    jumlah: harga.length,
    terendah: Math.min(...harga),
    rata: Math.round(harga.reduce((a, b) => a + b, 0) / harga.length),
    tertinggi: Math.max(...harga),
  };
}

/** Selisih harga rencana di atas referensi tertinggi (0 = tidak di atas). Lunak: hanya penanda. */
export function selisihAtasTertinggi(harga: number, ringkas: RingkasHarga | null): number {
  return ringkas && harga > ringkas.tertinggi ? harga - ringkas.tertinggi : 0;
}

export type TingkatRef = 'LENGKAP' | 'SEBAGIAN' | 'KOSONG' | 'TAUTAN_USULAN';
export type KelengkapanRef = { n: number; target: number; tingkat: TingkatRef };

/**
 * `tautanUsulan` hanya berlaku selama item BELUM punya referensi tersimpan — begitu ada
 * yang tersimpan, yang tersimpan yang berlaku (§4.1). Karena itu yang dibandingkan jumlah
 * TERSIMPAN, bukan jumlah yang sah: tiga tautan usulan yang disimpan tanpa harga = Ref 0/3.
 */
export function kelengkapanRef(refSah: number, refTersimpan: number, tautanUsulan: number): KelengkapanRef {
  const tingkat: TingkatRef = refTersimpan === 0 && tautanUsulan > 0 ? 'TAUTAN_USULAN'
    : refSah >= TARGET_REFERENSI ? 'LENGKAP'
    : refSah > 0 ? 'SEBAGIAN' : 'KOSONG';
  return { n: refSah, target: TARGET_REFERENSI, tingkat };
}

/** Item yang ditawarkan "Lengkapi referensi": usulan DITOLAK itu catatan sejarah, tidak direncanakan lagi. */
export function perluReferensi(row: { usulan_keputusan: string | null; ref: KelengkapanRef }): boolean {
  return row.usulan_keputusan !== 'DITOLAK' && row.ref.tingkat !== 'LENGKAP';
}

export type KelengkapanBukti = { n: number; target: number };

/** `null` = bukti belum relevan (belum terealisasi) → layar menulis "—". */
export function kelengkapanBukti(jenisAda: readonly string[], status: string): KelengkapanBukti | null {
  if (status !== 'REALISASI_PENUH' && status !== 'REALISASI_SEBAGIAN') return null;
  const n = JENIS_BUKTI_INTI.filter((j) => jenisAda.includes(j)).length;
  return { n, target: TARGET_BUKTI };
}

export function buktiBelumLengkap(k: KelengkapanBukti | null): boolean {
  return k !== null && k.n < k.target;
}

/** Tautan http/https saja dari `url_merk1–3` usulan (isinya ketikan pengusul — bisa kosong atau `javascript:`). */
export function tautanAman(daftar: readonly (string | null | undefined)[]): string[] {
  return daftar.filter((u): u is string => isSafeHttpUrl(u)).map((u) => u.trim());
}

/** Isi awal slot referensi dari tautan usulan — dipakai HANYA selama item belum punya referensi tersimpan. */
export function slotDariUsulan(tautan: readonly string[]): ReferensiIsian[] {
  return tautanAman(tautan).map((url) => ({
    sumber: tebakSumber(url) ?? 'LAINNYA', nama_penyedia: null, url, harga: null, tgl_cek: null, file_id: null,
  }));
}

const teks = (s: string | null | undefined): string | null => (s && s.trim() ? s.trim() : null);

/**
 * Bentuk baku sebelum dibandingkan (belum tersimpan?) dan sebelum dikirim: teks dirapikan,
 * baris yang sama sekali kosong dibuang — baris "+ Referensi" yang tak jadi diisi bukan perubahan.
 */
export function rapikanReferensi(daftar: readonly ReferensiIsian[]): ReferensiIsian[] {
  return daftar
    .map((r) => ({
      sumber: r.sumber,
      nama_penyedia: teks(r.nama_penyedia),
      merk_tipe: teks(r.merk_tipe),
      url: teks(r.url),
      harga: r.harga != null && r.harga > 0 ? r.harga : null,
      tgl_cek: teks(r.tgl_cek),
      file_id: teks(r.file_id),
    }))
    .filter((r) => r.nama_penyedia || r.merk_tipe || r.url || r.harga != null || r.tgl_cek || r.file_id);
}

export function referensiSama(a: readonly ReferensiIsian[], b: readonly ReferensiIsian[]): boolean {
  return JSON.stringify(rapikanReferensi(a)) === JSON.stringify(rapikanReferensi(b));
}
