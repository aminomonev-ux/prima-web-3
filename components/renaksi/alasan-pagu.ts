// Dialog "melampaui pagu Rencana Aksi" — SATU kalimat untuk semua layar yang bisa kena 409
// PAGU_RENAKSI_TERLAMPAUI (RKO, Rekening, Data Entry & Impor & Hapus Renaksi). Konsep:
// docs/CONCEPT-renaksi-pagu-rko.md §2 no. 2 & 4 — ditolak, tapi bisa diteruskan dengan alasan.

import { promptDialog } from '@/components/ui/ConfirmDialog';
import { ALASAN_PAGU_MIN, PANJANG_ALASAN_PAGU, type PelanggaranRingkas } from '@/lib/kinerja/pagu-renaksi';
import { rapikanNamaEntitas } from '@/lib/shared/nama-resmi';

export const KODE_PAGU_TERLAMPAUI = 'PAGU_RENAKSI_TERLAMPAUI';

export interface JawabanPaguTerlampaui { code?: string; tahun?: number; pelanggaran?: PelanggaranRingkas[] }

// Boolean biasa, bukan penjaga tipe: `d is …` membuat cabang `else` pemanggil (yang membaca
// `d.message`) disimpulkan `never`, karena semua kolomnya opsional.
export const paguTerlampaui = (d: unknown): boolean =>
  !!d && typeof d === 'object' && (d as { code?: unknown }).code === KODE_PAGU_TERLAMPAUI;

/** `null` = batal. String = alasan (sudah dirapikan) untuk dikirim ulang sebagai `alasan_pagu_renaksi`. */
export function tanyaAlasanPagu(jawaban: unknown, arah: 'rko' | 'renaksi'): Promise<string | null> {
  const d = (jawaban ?? {}) as JawabanPaguTerlampaui;
  const daftar = (d.pelanggaran ?? []).slice(0, 8)
    .map(p => `• ${rapikanNamaEntitas(p.sub_kegiatan)} — ${p.kalimat}`).join('\n');
  const lebih = (d.pelanggaran?.length ?? 0) > 8 ? `\n…dan ${(d.pelanggaran?.length ?? 0) - 8} sub kegiatan lain` : '';
  const jalan = arah === 'rko'
    ? 'Turunkan RKO-nya, naikkan pagu sub kegiatan di Data Entry Rencana Aksi, atau teruskan dengan alasan.'
    : 'Naikkan lagi pagunya, turunkan RKO di E-Anggaran, atau teruskan dengan alasan.';
  return promptDialog({
    title: `Melampaui pagu Rencana Aksi ${d.tahun ?? ''}`.trim(),
    message: `Sesudah disimpan, pagu RKO E-Anggaran (versi terbaru semua tab) melebihi pagu sub kegiatan:\n${daftar}${lebih}\n\n${jalan}`,
    label: 'Alasan meneruskan',
    placeholder: 'mis. pagu Renaksi belum diperbarui sesudah anggaran perubahan',
    minLength: ALASAN_PAGU_MIN,
    maxLength: PANJANG_ALASAN_PAGU,
    confirmLabel: 'Teruskan & simpan',
    variant: 'warning',
    petunjuk: 'Tersimpan di jejak audit bersama kelebihannya.',
  });
}
