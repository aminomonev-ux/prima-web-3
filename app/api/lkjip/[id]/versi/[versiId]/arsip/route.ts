// Unduh arsip Word/PDF satu versi (konsep kertas-margin-arsip-pdf B, K8). Menggantikan `/api/upload/download` untuk
// arsip: berkas arsip tidak tercatat di `uploaded_files`, jadi route umum itu menolak semua pemegang akses LKJIP
// selain admin. Id berkas TIDAK diterima dari klien — dicari lewat dokumen + versi di URL.
import { NextRequest, NextResponse } from 'next/server';
import { safeInt } from '@/lib/data/db';
import { writeAuditLog } from '@/lib/security/auditlog';
import { getDriveClient, kodeGalatDrive } from '@/lib/services/drive';
import { arsipVersi } from '@/lib/lkjip/versi';
import { MIME_DOCX, MIME_PDF } from '@/lib/lkjip/arsip-versi';
import { guard } from '../../../../_guard';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string; versiId: string }> }) {
  const g = await guard();
  if (!g.ok) return g.res;
  const p = await params;
  const id = safeInt(p.id, 0), versiId = safeInt(p.versiId, 0);
  const jenis = req.nextUrl.searchParams.get('jenis');
  if (id <= 0 || versiId <= 0 || (jenis !== 'word' && jenis !== 'pdf')) return NextResponse.json({ ok: false, msg: 'Permintaan tidak valid' }, { status: 400 });
  const arsip = await arsipVersi(id, versiId);
  const berkas = arsip?.[jenis] ?? null;
  if (!berkas) return NextResponse.json({ ok: false, msg: `Versi ini tidak punya arsip ${jenis === 'pdf' ? 'PDF' : 'Word'}.` }, { status: 404 });
  try {
    const res = await getDriveClient().files.get({ fileId: berkas.id, alt: 'media' }, { responseType: 'arraybuffer' });
    const isi = Buffer.from(res.data as unknown as ArrayBuffer);
    await writeAuditLog({ req, eventType: 'FILE_DOWNLOAD', userId: g.session.userId, username: g.session.username, detail: `Unduh arsip LKJIP ${berkas.nama} (${berkas.id}) doc=${id}` });
    return new NextResponse(new Uint8Array(isi), {
      status: 200,
      headers: {
        'Content-Type': jenis === 'pdf' ? MIME_PDF : MIME_DOCX,
        // PDF dibuka di tab (seperti Pratinjau); Word selalu diunduh.
        'Content-Disposition': `${jenis === 'pdf' ? 'inline' : 'attachment'}; filename="${encodeURIComponent(berkas.nama)}"`,
        'Cache-Control': 'private, max-age=60',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (err) {
    if (kodeGalatDrive(err) === 404) return NextResponse.json({ ok: false, msg: 'Berkas arsip sudah tidak ada di Drive.' }, { status: 404 });
    console.error('[LKJIP unduh arsip]', err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false, msg: 'Gagal mengambil arsip dari Drive.' }, { status: 500 });
  }
}
