// lib/bba/penerimaan.ts — aturan pengadaan & penerimaan (docs/CONCEPT-bba-buku-aset.md §7.4–7.6, §15).
// MURNI: dipakai data layer, halaman Pengadaan, antrean Buku Aset, dan uji.
import type { BbaStatus } from './status';
import type { Anggaran, JenisRencana } from './rencana';
import { tebakSumber, type ReferensiIsian } from './referensi';

const EPS = 0.005;
const bulat2 = (n: number) => Math.round(n * 100) / 100;

export interface BahanPenerimaan { tgl: string; vol: number; nilai: number }
export type StatusTerima = 'DIPROSES' | 'REALISASI_SEBAGIAN' | 'REALISASI_PENUH';

/**
 * Realisasi rencana = turunan Σ penerimaan (§15). Status hanya maju lewat sini: belum ada yang
 * diterima = Dalam Proses, sebagian, atau penuh. Nilai dijumlah dari nilai tersimpan tiap baris —
 * bukan vol × harga ulang (data lama membawa nilai realisasi apa adanya).
 */
export function ringkasPenerimaan(volRencana: number, xs: readonly BahanPenerimaan[]): { vol: number; nilai: number; tgl: string | null; status: StatusTerima } {
  const vol = bulat2(xs.reduce((s, x) => s + x.vol, 0));
  const nilai = bulat2(xs.reduce((s, x) => s + x.nilai, 0));
  const tgl = xs.reduce<string | null>((m, x) => (!m || x.tgl > m ? x.tgl : m), null);
  const status: StatusTerima = vol <= EPS ? 'DIPROSES' : vol + EPS >= volRencana ? 'REALISASI_PENUH' : 'REALISASI_SEBAGIAN';
  return { vol, nilai, tgl, status };
}

type BahanRencana = { anggaran: Anggaran; usulan_keputusan: string | null; status: BbaStatus; vol: number; canonical_id: string };

/** Pagar API (§16): penerimaan hanya untuk rencana yang didanai, tidak melebihi volume rencana. */
export function alasanTolakPenerimaan(r: BahanRencana, sudah: number, terima: number, tgl: string, hariIni: string): string | null {
  if (r.usulan_keputusan === 'DITOLAK') return `${r.canonical_id}: usulan ditolak — catatan sejarah, tidak dibeli.`;
  if (r.anggaran !== 'DIDANAI') return `${r.canonical_id} belum ditandai didanai — penerimaan hanya untuk rencana yang masuk anggaran (ditandai Perencanaan).`;
  if (r.status === 'TIDAK_TEREALISASI') return `${r.canonical_id} berstatus Tidak Terealisasi — kembalikan ke Dalam Proses dulu.`;
  if (terima <= 0) return 'Jumlah yang diterima harus lebih dari 0.';
  if (tgl > hariIni) return 'Tanggal penerimaan tidak boleh sesudah hari ini.';
  if (sudah + terima > r.vol + EPS) return `Melebihi volume rencana: sudah diterima ${sudah}, rencana ${r.vol}.`;
  return null;
}

/**
 * Antrean "barang diterima, belum dicatat" (§15) — dihitung, tidak disimpan: unit diterima dikurangi
 * register yang menunjuk penerimaan itu. Rehab tidak melahirkan aset baru — antreannya lain (perbarui gedung).
 */
export function sisaDitempatkan(p: { vol: number }, sudah: number, jenis: JenisRencana | null): number {
  if (jenis === 'REHAB') return 0;
  return Math.max(0, Math.floor(p.vol + EPS) - sudah);
}

type RefDibeli = { merk_tipe?: string | null; nama_penyedia: string | null; url: string | null };
type IsianDibeli = { merk_tipe?: string | null; penyedia?: string | null; url?: string | null };

/**
 * "Yang benar-benar dibeli" (§7.4 butir 4) disimpan sebagai SALINAN referensi terpilih — baris referensi
 * berganti id tiap Simpan item. Isian sendiri menimpa per kolom; tanpa referensi = beli di tempat lain.
 */
export function salinanYangDibeli(ref: RefDibeli | null, isi: IsianDibeli): { merk_tipe: string | null; penyedia: string | null; url: string | null } {
  const pilih = (a?: string | null, b?: string | null) => a?.trim() || b?.trim() || null;
  return { merk_tipe: pilih(isi.merk_tipe, ref?.merk_tipe), penyedia: pilih(isi.penyedia, ref?.nama_penyedia), url: pilih(isi.url, ref?.url) };
}

/** Yang dibeli (satu penerimaan) dalam bentuk ringkas untuk "pembelian sebelumnya" (§7.7). */
export interface DibeliLalu { tgl: string; vol: number; harga_satuan: number; merk_tipe: string | null; penyedia: string | null; url: string | null }

/**
 * "Pakai sebagai referensi" dari yang benar-benar dibeli dulu: harga = harga riil, tanggal cek = tanggal
 * diterima (kelihatan harganya perlu dicek ulang), sumber ditebak dari tautannya.
 */
export function referensiDariDibeli(d: DibeliLalu): ReferensiIsian {
  return { sumber: tebakSumber(d.url) ?? 'LAINNYA', nama_penyedia: d.penyedia, merk_tipe: d.merk_tipe, url: d.url, harga: d.harga_satuan, tgl_cek: d.tgl, file_id: null };
}
