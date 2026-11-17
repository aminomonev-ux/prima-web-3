// ═══ PRIMA — LKJIP — Arsip versi: bentuk hasil & kalimatnya (pure, aman-klien) ═══
// Dipisah dari `arsip-versi.ts` (yang menyeret Drive & LibreOffice) supaya layar memakai kalimat yang SAMA dengan audit.

export interface HasilArsip {
  /** Tujuan Drive `lkjip_arsip` sudah diatur. Tidak = tidak ada yang dicoba. */
  diatur: boolean;
  word: string | null;
  pdf: string | null;
  /** Kenapa PDF tidak ada; null = PDF terarsip (atau Drive belum diatur). */
  pdfAlasan: string | null;
  /** Huruf dokumen yang tidak terpasang di server — PDF memakai huruf pengganti. */
  hurufHilang: string | null;
}

/** Label versi yang dibuat otomatis saat Finalisasi (K7). */
export const LABEL_VERSI_FINAL = 'Final';

function cap(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

/** "LKJIP-2026.docx", versi 3 → dasar nama tanpa ekstensi, sama untuk Word dan PDF: "LKJIP-2026-v3-20261117-081500". */
export function dasarNamaArsip(namaDocx: string, versiNo: number, waktu: Date): string {
  return `${namaDocx.replace(/\.docx$/i, '')}-v${versiNo}-${cap(waktu)}`;
}

/** Satu kalimat ringkas untuk toast & audit. */
export function ringkasArsip(h: HasilArsip): string {
  if (!h.diatur) return 'Drive belum diatur — tanpa arsip';
  const ada = [h.word && 'Word', h.pdf && 'PDF'].filter(Boolean).join(' + ');
  const bagian = [ada ? `arsip ${ada}` : 'arsip gagal diunggah'];
  if (!h.pdf && h.pdfAlasan) bagian.push(`PDF dilewati: ${h.pdfAlasan}`);
  if (h.pdf && h.hurufHilang) bagian.push(`huruf ${h.hurufHilang} tidak terpasang di server, PDF memakai huruf pengganti`);
  return bagian.join(' · ');
}

/** Keterangan arsip di baris Riwayat Versi. Versi lama (sebelum arsip PDF) wajar tanpa PDF — tetap disebut. */
export function teksArsipVersi(v: { drive_file_id: string | null; pdf_file_id: string | null }): string {
  if (v.drive_file_id && v.pdf_file_id) return ' · ☁ Word + PDF';
  if (v.drive_file_id) return ' · ☁ Word (tanpa PDF)';
  if (v.pdf_file_id) return ' · ☁ PDF (tanpa Word)';
  return '';
}

/** Arsip lengkap = Word dan PDF ada. Selain itu toast memakai nada peringatan, supaya kekurangannya terbaca. */
export const arsipLengkap = (h: HasilArsip | null | undefined): boolean => !!h && (!h.diatur || (!!h.word && !!h.pdf && !h.hurufHilang));
