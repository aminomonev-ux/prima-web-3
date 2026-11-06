// ═══ PRIMA — LKJIP — Aturan hapus dokumen (pure, aman-klien) ═══
// Satu aturan untuk modal di daftar dokumen DAN pagar server di dalam transaksi hapus. Hak menghapus sengaja
// sama dengan hak membuka modul (keputusan pemilik): dokumen FINAL hanya ditambah syarat, bukan dibatasi perannya.

export const MIN_ALASAN_HAPUS_FINAL = 10;
export const BATAS_ALASAN_HAPUS_FINAL = 300;

export interface IsianHapus { alasan?: string; arsipDiunduh?: boolean }
export interface TolakHapus { code: 'ALASAN_WAJIB' | 'ARSIP_BELUM'; msg: string }

export function alasanTolakHapus(status: 'DRAFT' | 'FINAL', isian: IsianHapus): TolakHapus | null {
  if (status !== 'FINAL') return null;
  if ((isian.alasan ?? '').trim().length < MIN_ALASAN_HAPUS_FINAL) {
    return { code: 'ALASAN_WAJIB', msg: `Dokumen ini sudah FINAL. Menghapusnya wajib menulis alasan, minimal ${MIN_ALASAN_HAPUS_FINAL} huruf.` };
  }
  if (isian.arsipDiunduh !== true) {
    return { code: 'ARSIP_BELUM', msg: 'Dokumen FINAL baru bisa dihapus sesudah arsip Word-nya dinyatakan sudah diunduh.' };
  }
  return null;
}
