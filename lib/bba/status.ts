// lib/bba/status.ts — status item Buku Besar Aset + transisinya. MURNI (tanpa impor server):
// dipakai skema Zod, data layer, DAN layar (pilihan status di modal Proses & Realisasi), supaya
// aturan transisi cuma satu. Konsep: docs/CONCEPT-bba-perencanaan.md §5.2.

export const BBA_STATUSES = [
  'DIRENCANAKAN', 'DIPROSES', 'REALISASI_PENUH', 'REALISASI_SEBAGIAN', 'TIDAK_TEREALISASI',
] as const;
export type BbaStatus = typeof BBA_STATUSES[number];

export const LABEL_STATUS: Record<BbaStatus, string> = {
  DIRENCANAKAN: 'Direncanakan', DIPROSES: 'Dalam Proses', REALISASI_PENUH: 'Realisasi Penuh',
  REALISASI_SEBAGIAN: 'Realisasi Sebagian', TIDAK_TEREALISASI: 'Tidak Terealisasi',
};

/** "Belum terealisasi" di KPI & inbox RIMA. DIPROSES ikut: barangnya belum diterima. */
export const STATUS_BELUM_TEREALISASI: readonly BbaStatus[] = ['DIRENCANAKAN', 'DIPROSES', 'TIDAK_TEREALISASI'];

/**
 * Status yang diubah tangan lewat "Proses" (docs/CONCEPT-bba-buku-aset.md §7.4). Diterima sebagian/penuh
 * TIDAK ada di sini: sejak Tahap E keduanya turunan Σ penerimaan (`ringkasPenerimaan`) — satu jalur tulis.
 * DIPROSES → DIRENCANAKAN = pesanan batal, barangnya tetap direncanakan (§5.2).
 */
export const STATUS_PROSES = ['DIRENCANAKAN', 'DIPROSES', 'TIDAK_TEREALISASI'] as const satisfies readonly BbaStatus[];
export type StatusProses = typeof STATUS_PROSES[number];

/** Pilihan di modal Proses untuk item berstatus `dari` — kosong begitu ada barang yang diterima. */
export function pilihanStatusProses(dari: BbaStatus): readonly StatusProses[] {
  return dari === 'REALISASI_PENUH' || dari === 'REALISASI_SEBAGIAN' ? [] : STATUS_PROSES;
}

/** Pagar `ubahStatusProses` (server) DAN tombol Simpan modal. Pesanan hanya untuk rencana yang didanai (§16). */
export function alasanTolakProses(r: { status: BbaStatus; anggaran: string; usulan_keputusan: string | null }, ke: StatusProses, jumlahPenerimaan: number): string | null {
  if (r.usulan_keputusan === 'DITOLAK') return 'Usulan ini ditolak — catatan sejarah, statusnya tidak diubah.';
  if (jumlahPenerimaan > 0 || pilihanStatusProses(r.status).length === 0)
    return 'Sudah ada barang yang diterima — statusnya mengikuti penerimaan. Salah catat? Hapus penerimaannya dulu.';
  if (ke !== 'DIRENCANAKAN' && ke !== r.status && r.anggaran !== 'DIDANAI')
    return 'Rencana ini belum ditandai didanai — Perencanaan menandainya dulu, baru bisa diproses.';
  return null;
}

/**
 * Sejak barangnya dipesan, survei harga = catatan sejarah ("dulu dibandingkan dengan apa"),
 * bukan draf (docs/CONCEPT-bba-buku-aset.md §7.4, §10 butir 7). Pesanan batal → kembali
 * Direncanakan → terbuka lagi.
 */
export function referensiBeku(status: BbaStatus): boolean {
  return status !== 'DIRENCANAKAN';
}

/**
 * Alasan item TIDAK boleh dihapus, atau `null`. Satu kalimat untuk route DAN tombol Hapus.
 * Hapus item ikut membuang referensi & bukti (ON DELETE CASCADE) — padahal itulah bahan
 * "pembelian sebelumnya" saat barang yang sama direncanakan lagi (§7.7).
 */
export function alasanTakBisaHapus(status: BbaStatus, jumlahBukti: number): string | null {
  if (status !== 'DIRENCANAKAN') {
    return `Item berstatus ${LABEL_STATUS[status]} tidak bisa dihapus — jejak rencana dan pembeliannya dipakai saat merencanakan barang yang sama berikutnya.`;
  }
  if (jumlahBukti > 0) {
    return `Item ini punya ${jumlahBukti} bukti dukung, jadi tidak bisa dihapus. Kalau buktinya salah unggah, lepas dulu di tab Bukti dukung.`;
  }
  return null;
}
