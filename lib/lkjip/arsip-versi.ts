// ═══ PRIMA — LKJIP — Arsip Word + PDF tiap versi ke Drive ═══
// Konsep docs/konsep/lkjip/CONCEPT-lkjip-kertas-margin-arsip-pdf.md bagian B. Dipakai Simpan Versi DAN Finalisasi.
// Word dibuat SEKALI; PDF diubah dari buffer Word yang sama (jalur Pratinjau), supaya kedua arsip berisi hal yang sama
// persis. Best-effort: kegagalan Drive/LibreOffice tidak pernah menggagalkan versinya, tapi selalu disebut sebabnya.
import type { NextRequest } from 'next/server';
import { generateLkjipDocx } from './docgen';
import { PdfBatasWaktuError, PdfSibukError, PdfTidakTersediaError, hurufTerpasang, ubahKePdf } from './pdf';
import { setVersiDrive, setVersiPdf } from './versi';
import { dasarNamaArsip, ringkasArsip, type HasilArsip } from './arsip-teks';
import { tujuanTerkonfigurasi } from '@/lib/services/drive-tujuan';
import { unggahKeTujuan } from '@/lib/services/drive-catatan';
import { writeAuditLog } from '@/lib/security/auditlog';

export { LABEL_VERSI_FINAL, type HasilArsip } from './arsip-teks';
export const MIME_DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
export const MIME_PDF = 'application/pdf';

/** Galat pembuatan PDF → kalimat untuk orang. */
export function alasanPdf(err: unknown): string {
  if (err instanceof PdfTidakTersediaError) return 'LibreOffice belum terpasang di server';
  if (err instanceof PdfSibukError) return 'LibreOffice sedang dipakai — coba Simpan Versi lagi sebentar lagi';
  if (err instanceof PdfBatasWaktuError) return 'pembuatan PDF melewati batas waktu';
  return 'PDF gagal dibuat';
}

export async function arsipkanVersi(dokumenId: number, versi: { id: number; versi_no: number }, waktu = new Date()): Promise<HasilArsip> {
  const hasil: HasilArsip = { diatur: false, word: null, pdf: null, pdfAlasan: null, hurufHilang: null };
  if (!(await tujuanTerkonfigurasi('lkjip_arsip'))) return hasil;
  hasil.diatur = true;
  const docx = await generateLkjipDocx(dokumenId);
  const dasar = dasarNamaArsip(docx.filename, versi.versi_no, waktu);
  try {
    const up = await unggahKeTujuan('lkjip_arsip', { buffer: docx.buffer, name: `${dasar}.docx`, mimeType: MIME_DOCX });
    if (up.fileId) { await setVersiDrive(versi.id, up.fileId, `${dasar}.docx`); hasil.word = up.fileId; }
  } catch (e) { console.error('[LKJIP arsip Word]', e); }
  let pdf: Buffer | null = null;
  try { pdf = await ubahKePdf(docx.buffer, { judul: docx.judul }); }
  catch (e) { hasil.pdfAlasan = alasanPdf(e); }
  if (pdf) {
    if (!hurufTerpasang(pdf, docx.huruf)) hasil.hurufHilang = docx.huruf;
    try {
      const up = await unggahKeTujuan('lkjip_arsip', { buffer: pdf, name: `${dasar}.pdf`, mimeType: MIME_PDF });
      if (up.fileId) { await setVersiPdf(versi.id, up.fileId, `${dasar}.pdf`); hasil.pdf = up.fileId; }
    } catch (e) { console.error('[LKJIP arsip PDF]', e); hasil.pdfAlasan = 'PDF gagal diunggah ke Drive'; }
  }
  return hasil;
}

/** Dipakai Simpan Versi DAN Finalisasi: satu cara mengarsipkan, satu bentuk audit. Tidak pernah melempar. */
export async function arsipkanDanCatat(req: NextRequest, sesi: { userId: number; username: string }, dokumenId: number, versi: { id: number; versi_no: number }): Promise<HasilArsip> {
  let arsip: HasilArsip;
  try {
    arsip = await arsipkanVersi(dokumenId, versi);
  } catch (e) {
    console.error('[LKJIP arsip versi]', e);
    arsip = { diatur: true, word: null, pdf: null, pdfAlasan: 'dokumen gagal dirakit', hurufHilang: null };
  }
  if (arsip.diatur) {
    await writeAuditLog({ req, eventType: 'LKJIP_DRIVE_ARCHIVE', userId: sesi.userId, username: sesi.username, detail: `LKJIP doc=${dokumenId} versi ${versi.versi_no}: ${ringkasArsip(arsip)}${arsip.word ? ` · Word ${arsip.word}` : ''}${arsip.pdf ? ` · PDF ${arsip.pdf}` : ''}` });
  }
  return arsip;
}
