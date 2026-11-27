// lib/bba/penawaran.ts — Penawaran Rekanan BBA (docs/konsep/bba/CONCEPT-bba-revamp-alur.md §5A). MURNI: dipakai tampilan
// Bandingkan, pemilih "Ambil dari penawaran" di modal rencana, unduhan Excel, dan uji — satu aturan untuk "terbaru yang
// berlaku", "termurah", "rata-rata", dan "kedaluwarsa".
import type { ReferensiIsian } from './referensi';

export type ItemPenawaran = {
  id: number; penawaran_id: number; rekanan: string; nomor_surat: string | null; tgl_surat: string; berlaku_sampai: string | null;
  file_id: string | null; barang_id: number | null; barang_nama: string | null; nama_barang: string; merk_tipe: string | null;
  spesifikasi: string | null; satuan: string | null; harga_satuan: number;
  kategori?: string | null; jenis_kategori?: string | null; kode_rekening?: string | null;
};

/** Tanpa tanggal berlaku = berlaku (surat tidak menulis batas); tanggal berlaku hari ini masih berlaku. */
export const masihBerlaku = (berlaku_sampai: string | null, hariIni: string) => !berlaku_sampai || berlaku_sampai >= hariIni;

/** Satuan dibandingkan apa adanya tanpa beda huruf besar/spasi; kosong = "unit" (bawaan form rencana). */
export const kunciSatuan = (s: string | null) => (s ?? '').trim().replace(/\s+/g, ' ').toLowerCase() || 'unit';

const lebihBaru = (a: ItemPenawaran, b: ItemPenawaran) => a.tgl_surat > b.tgl_surat || (a.tgl_surat === b.tgl_surat && a.id > b.id);

export type SelBanding = { item: ItemPenawaran; berlaku: boolean; termurah: boolean };
export type BarisBanding = {
  barang_id: number; barang_nama: string; satuan: string;
  /** rekanan → penawaran terbaru yang MASIH berlaku; kalau tidak ada yang berlaku, yang terbaru (kedaluwarsa, abu-abu). */
  sel: Record<string, SelBanding>;
  rata: number | null; jumlah: number;
};

/**
 * Baris = barang × satuan (satuan beda tidak dicampur: "Laptop (paket)" ≠ "Laptop (unit)"), kolom = rekanan. Kedaluwarsa
 * tetap terlihat tapi tidak ikut rata-rata dan tidak bisa jadi termurah. Item tanpa barang dikumpulkan di `belumDitautkan`.
 */
export function bandingkanPenawaran(items: readonly ItemPenawaran[], hariIni: string): { baris: BarisBanding[]; rekanan: string[]; belumDitautkan: ItemPenawaran[] } {
  const kelompok = new Map<string, ItemPenawaran[]>();
  const belumDitautkan: ItemPenawaran[] = [];
  for (const it of items) {
    if (it.barang_id === null) { belumDitautkan.push(it); continue; }
    const k = `${it.barang_id}|${kunciSatuan(it.satuan)}`;
    kelompok.set(k, [...(kelompok.get(k) ?? []), it]);
  }
  const baris: BarisBanding[] = [];
  for (const xs of kelompok.values()) {
    const per = new Map<string, ItemPenawaran[]>();
    for (const x of xs) per.set(x.rekanan, [...(per.get(x.rekanan) ?? []), x]);
    const sel: Record<string, SelBanding> = {};
    for (const [rekanan, ys] of per) {
      const berlaku = ys.filter(y => masihBerlaku(y.berlaku_sampai, hariIni));
      const pilih = (berlaku.length ? berlaku : ys).reduce((a, b) => (lebihBaru(b, a) ? b : a));
      sel[rekanan] = { item: pilih, berlaku: berlaku.length > 0, termurah: false };
    }
    const hidup = Object.values(sel).filter(s => s.berlaku);
    if (hidup.length) {
      const min = Math.min(...hidup.map(s => s.item.harga_satuan));
      for (const s of hidup) s.termurah = s.item.harga_satuan === min;
    }
    const contoh = xs[0];
    baris.push({
      barang_id: contoh.barang_id!, barang_nama: contoh.barang_nama ?? contoh.nama_barang, satuan: kunciSatuan(contoh.satuan), sel,
      rata: hidup.length ? Math.round(hidup.reduce((t, s) => t + s.item.harga_satuan, 0) / hidup.length) : null, jumlah: xs.length,
    });
  }
  baris.sort((a, b) => a.barang_nama.localeCompare(b.barang_nama, 'id') || a.satuan.localeCompare(b.satuan, 'id'));
  const rekanan = [...new Set(items.filter(i => i.barang_id !== null).map(i => i.rekanan))].sort((a, b) => a.localeCompare(b, 'id'));
  return { baris, rekanan, belumDitautkan };
}

/** Daftar "Ambil dari penawaran" untuk satu barang: yang berlaku dulu, termurah di atas; kedaluwarsa di bawah. */
export function urutUntukRencana(items: readonly ItemPenawaran[], hariIni: string): Array<ItemPenawaran & { berlaku: boolean }> {
  return items.map(i => ({ ...i, berlaku: masihBerlaku(i.berlaku_sampai, hariIni) }))
    .sort((a, b) => Number(b.berlaku) - Number(a.berlaku) || a.harga_satuan - b.harga_satuan || (b.tgl_surat > a.tgl_surat ? 1 : -1));
}

/**
 * Penawaran yang dipakai rencana DISALIN jadi referensi harga (referensi beku sejak dipesan — tautan hidup akan mengubah
 * catatan sejarah begitu penawaran disunting). Sah-tidaknya tetap aturan `referensiSah` (harga + berkas/tautan).
 */
export function referensiDariPenawaran(i: ItemPenawaran): ReferensiIsian {
  return {
    sumber: 'LAINNYA', nama_penyedia: i.rekanan, merk_tipe: i.merk_tipe, url: null, harga: i.harga_satuan,
    tgl_cek: i.tgl_surat, file_id: i.file_id, penawaran_item_id: i.id,
  };
}
