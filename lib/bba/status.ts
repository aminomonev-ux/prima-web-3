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

// Matriks transisi sah (server-validated). Terminal → array kosong.
// DIPROSES → DIRENCANAKAN = pesanan batal, barangnya tetap direncanakan (§5.2).
export const BBA_STATUS_TRANSITIONS: Record<BbaStatus, BbaStatus[]> = {
  DIRENCANAKAN:       ['DIPROSES', 'REALISASI_PENUH', 'REALISASI_SEBAGIAN', 'TIDAK_TEREALISASI'],
  DIPROSES:           ['REALISASI_PENUH', 'REALISASI_SEBAGIAN', 'TIDAK_TEREALISASI', 'DIRENCANAKAN'],
  REALISASI_SEBAGIAN: ['REALISASI_PENUH', 'TIDAK_TEREALISASI'],
  TIDAK_TEREALISASI:  ['REALISASI_SEBAGIAN', 'REALISASI_PENUH'],
  REALISASI_PENUH:    [],
};

export function isValidStatusTransition(from: BbaStatus, to: BbaStatus, bolehKoreksiMundur = false): boolean {
  if (from === to) return true; // idempotent: edit field lain tanpa ganti status
  // A4: koreksi mundur dari terminal REALISASI_PENUH — khusus Admin (SUPER_ADMIN/
  // ADMIN, lihat PERAN_PEMBATAL_FINAL), dicatat audit log. Nama parameternya dulu
  // `superAdminOverride`; diganti karena yang menentukan sekarang KEWENANGANNYA,
  // bukan satu peran tertentu — nama lama akan menyesatkan pembaca berikutnya.
  if (bolehKoreksiMundur && from === 'REALISASI_PENUH') return true;
  return BBA_STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}

/** Status yang boleh dipilih di modal Proses & Realisasi untuk item berstatus `dari` (termasuk tetap). */
export function pilihanStatusRealisasi(dari: BbaStatus, bolehKoreksiMundur = false): BbaStatus[] {
  return BBA_STATUSES.filter(s => isValidStatusTransition(dari, s, bolehKoreksiMundur));
}

/**
 * Barang belum diterima → unit & nilai realisasi wajib 0. Dipakai `setRealisasi` dan modal Proses &
 * Realisasi (isian angka dikunci 0). Sengaja TIDAK dipasang di jalur edit item: baris lama
 * berstatus Direncanakan yang kebetulan berangka realisasi tidak boleh mendadak tak bisa disunting.
 */
export function statusSebelumTerima(status: BbaStatus): boolean {
  return status === 'DIRENCANAKAN' || status === 'DIPROSES';
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
