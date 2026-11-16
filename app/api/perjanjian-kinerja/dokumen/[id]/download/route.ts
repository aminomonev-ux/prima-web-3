// app/api/perjanjian-kinerja/dokumen/[id]/download/route.ts
// Stream Word file dari MEDIUMBLOB dengan ownership filter.
// Pattern: ownership L2 + safeInt L11 + audit PK_DOKUMEN_DOWNLOAD.
//
// ?format=pdf → PDF dari berkas Word yang SAMA lewat LibreOffice (lib/services/docx-pdf.ts).
// ?sumber=&versi= → lampiran rincian BLUD per PJ disisipkan ke SALINAN berkas; berkas FINAL di
// database tidak diubah (docs/konsep/pk/CONCEPT-pk-lampiran-blud-pj.md).

import { NextRequest, NextResponse } from 'next/server';
import { sql, safeInt } from '@/lib/data/db';
import { getSession } from '@/lib/security/auth';
import { writeAuditLog } from '@/lib/security/auditlog';
import { pkRateLimit, UnduhDokumenQuerySchema } from '@/lib/data/pk-schemas';
import { bolehLihatSalahSatu, forbidden, pkMati } from '../../../_guard';
import { ADMIN_ROLES } from '@/lib/constants';
import { isiLampiranBlud, LampiranBludError } from '@/lib/data/pk-lampiran-blud';
import { buildLampiranBludXml, sisipkanKeDocx } from '@/lib/pk/lampiran-blud';
import { docxKePdf, PdfTidakTersediaError } from '@/lib/services/docx-pdf';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type FileRow = {
  generated_file: Buffer | null;
  generated_filename: string | null;
  generated_filesize: number | null;
  created_by: number | null;
  tahun: string;
  unit_pertama: string;
};

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
  const mati = await pkMati(session.role);
  if (mati) return mati;
  // LIHAT, bukan EDIT: mengunduh tidak mengubah angka resmi mana pun. Tombolnya ada di
  // Riwayat maupun Form, jadi cukup salah satunya terbuka.
  if (!(await bolehLihatSalahSatu(session.userId, session.role, ['form', 'riwayat']))) return forbidden();

  const sp = req.nextUrl.searchParams;
  const q = UnduhDokumenQuerySchema.safeParse({
    format: sp.get('format') ?? undefined, sumber: sp.get('sumber') ?? undefined, versi: sp.get('versi') ?? undefined,
  });
  if (!q.success) return NextResponse.json({ ok: false, message: 'Parameter tidak valid: ' + q.error.issues[0].message }, { status: 400 });
  const { format, sumber, versi } = q.data;

  const limited = await pkRateLimit(session.userId, 'download-dokumen', 30)
    ?? (format === 'pdf' ? await pkRateLimit(session.userId, 'pdf-dokumen', 10) : null);
  if (limited) return limited;

  const { id: idRaw } = await params;
  const id = safeInt(idRaw, 0);
  if (id <= 0) return NextResponse.json({ ok: false, message: 'ID dokumen tidak valid' }, { status: 400 });

  // Ownership L2 — non-admin hanya download dokumen sendiri
  const isAdmin = (ADMIN_ROLES as readonly string[]).includes(session.role);
  const rows = await sql`
    SELECT generated_file, generated_filename, generated_filesize, created_by, tahun, unit_pertama
    FROM pk_dokumen
    WHERE id = ${id}
    LIMIT 1
  ` as FileRow[];

  if (!rows.length) return NextResponse.json({ ok: false, message: 'Dokumen tidak ditemukan' }, { status: 404 });
  const row = rows[0];

  if (!isAdmin && row.created_by !== session.userId) {
    return NextResponse.json({ ok: false, message: 'Bukan dokumen Anda' }, { status: 403 });
  }
  if (!row.generated_file) {
    return NextResponse.json({ ok: false, message: 'Dokumen belum di-finalize / file kosong' }, { status: 404 });
  }

  let berkas: Uint8Array = new Uint8Array(row.generated_file);
  let lampiran = '';
  if (sumber && versi) {
    try {
      const isi = await isiLampiranBlud({ id, tahun: Number(row.tahun), unit_pertama: row.unit_pertama }, sumber, versi);
      berkas = sisipkanKeDocx(berkas, buildLampiranBludXml(isi));
      lampiran = `, lampiran BLUD per PJ dari ${isi.sumber} (total ${isi.total})`;
    } catch (e) {
      if (e instanceof LampiranBludError) return NextResponse.json({ ok: false, message: e.message }, { status: 422 });
      throw e;
    }
  }

  const namaWord = row.generated_filename ?? `PK-${id}.docx`;
  let filename = namaWord;
  let contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  if (format === 'pdf') {
    try {
      berkas = new Uint8Array(await docxKePdf(berkas));
    } catch (e) {
      if (e instanceof PdfTidakTersediaError) {
        return NextResponse.json({ ok: false, code: 'PDF_TIDAK_TERSEDIA', message: e.message }, { status: 503 });
      }
      console.error('[pk download pdf]', e);
      return NextResponse.json({ ok: false, message: 'PDF gagal dibuat. Coba lagi, atau unduh Word.' }, { status: 500 });
    }
    filename = namaWord.replace(/\.docx$/i, '') + '.pdf';
    contentType = 'application/pdf';
  }

  await writeAuditLog({
    req,
    eventType: 'PK_DOKUMEN_DOWNLOAD',
    userId:    session.userId,
    username:  session.username,
    detail:    `Download dokumen PK id=${id}, file=${filename}${lampiran}`,
  });

  return new NextResponse(berkas as BodyInit, {
    status: 200,
    headers: {
      'Content-Type':           contentType,
      'Content-Disposition':    `attachment; filename="${encodeURIComponent(filename)}"`,
      'Content-Length':         String(berkas.length),
      'Cache-Control':          'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
