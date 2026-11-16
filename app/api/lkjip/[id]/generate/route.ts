import { NextRequest, NextResponse } from 'next/server';
import { safeInt } from '@/lib/data/db';
import { writeAuditLog } from '@/lib/security/auditlog';
import { lkjipRateLimit } from '@/lib/lkjip/schemas';
import { generateLkjipDocx } from '@/lib/lkjip/docgen';
import { ubahKePdf, hitungHalaman, hurufTerpasang, PdfTidakTersediaError, PdfSibukError, PdfBatasWaktuError, PdfDibatalkanError } from '@/lib/lkjip/pdf';
import { guard } from '../../_guard';

export const dynamic = 'force-dynamic';

const KEPALA_UMUM = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };

// Unduh Word = MURNI download dokumen terkini (tanpa efek samping).
// Arsip ke Drive + snapshot DB ada di aksi "Simpan Versi" (hybrid), bukan di sini.
// ?format=pdf → Word yang SAMA diubah LibreOffice (satu sumber, L78); &tampil=1 = pratinjau (inline, audit sendiri).
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard();
  if (!g.ok) return g.res;
  const pdf = req.nextUrl.searchParams.get('format') === 'pdf';
  const tampil = pdf && req.nextUrl.searchParams.get('tampil') === '1';
  // Kunci batas laju PDF sendiri: membuka pratinjau berkali-kali tidak menghabiskan jatah unduh Word.
  const limited = pdf ? await lkjipRateLimit(g.session.userId, 'pdf', 10) : await lkjipRateLimit(g.session.userId, 'generate', 20);
  if (limited) return limited;
  const id = safeInt((await params).id, 0);
  if (id <= 0) return NextResponse.json({ ok: false, msg: 'ID tidak valid' }, { status: 400 });

  let result: { buffer: Buffer; filename: string; huruf: string; judul: string };
  try {
    result = await generateLkjipDocx(id);
  } catch {
    return NextResponse.json({ ok: false, msg: 'Dokumen tidak ditemukan atau gagal di-generate' }, { status: 404 });
  }

  if (!pdf) {
    await writeAuditLog({ req, eventType: 'LKJIP_GENERATE', userId: g.session.userId, username: g.session.username, detail: `LKJIP generate Word id=${id}` });
    return new NextResponse(new Uint8Array(result.buffer), {
      status: 200,
      headers: {
        ...KEPALA_UMUM,
        'Content-Type':        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(result.filename)}"`,
        'Content-Length':      String(result.buffer.length),
      },
    });
  }

  let isi: Buffer;
  try {
    isi = await ubahKePdf(result.buffer, { judul: result.judul, signal: req.signal });
  } catch (e) {
    // 499 (gaya Nginx): peramban sudah pergi, tidak ada yang membaca jawabannya; juga tidak diaudit.
    if (e instanceof PdfDibatalkanError) return NextResponse.json({ ok: false, code: 'PDF_DIBATALKAN', msg: e.message }, { status: 499 });
    if (e instanceof PdfTidakTersediaError) return NextResponse.json({ ok: false, code: 'PDF_TIDAK_TERSEDIA', msg: e.message }, { status: 503 });
    if (e instanceof PdfSibukError) return NextResponse.json({ ok: false, code: 'PDF_SIBUK', msg: e.message }, { status: 503, headers: { 'Retry-After': '5' } });
    if (e instanceof PdfBatasWaktuError) return NextResponse.json({ ok: false, code: 'PDF_BATAS_WAKTU', msg: e.message }, { status: 504 });
    console.error('[lkjip pdf]', id, e);
    return NextResponse.json({ ok: false, code: 'PDF_GAGAL', msg: 'PDF gagal dibuat. Word tetap bisa diunduh.' }, { status: 500 });
  }
  const halaman = hitungHalaman(isi);
  const hurufAda = hurufTerpasang(isi, result.huruf);
  await writeAuditLog({
    req, eventType: tampil ? 'LKJIP_PRATINJAU' : 'LKJIP_GENERATE', userId: g.session.userId, username: g.session.username,
    detail: tampil ? `LKJIP pratinjau PDF id=${id} (${halaman} hlm)` : `LKJIP generate PDF id=${id} (${halaman} hlm)`,
  });
  const namaPdf = result.filename.replace(/\.docx$/i, '.pdf');
  return new NextResponse(new Uint8Array(isi), {
    status: 200,
    headers: {
      ...KEPALA_UMUM,
      'Content-Type':        'application/pdf',
      'Content-Disposition': `${tampil ? 'inline' : 'attachment'}; filename="${encodeURIComponent(namaPdf)}"`,
      'Content-Length':      String(isi.length),
      'X-Lkjip-Halaman':     String(halaman),
      // Huruf dokumen tidak terpasang di server → LibreOffice memakai pengganti, letak halaman bisa beda dari Word.
      ...(hurufAda ? {} : { 'X-Lkjip-Huruf-Hilang': encodeURIComponent(result.huruf) }),
    },
  });
}
