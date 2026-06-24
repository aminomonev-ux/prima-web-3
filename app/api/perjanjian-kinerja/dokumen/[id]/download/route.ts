// app/api/perjanjian-kinerja/dokumen/[id]/download/route.ts
// Stream Word file dari MEDIUMBLOB dengan ownership filter.
// Pattern: ownership L2 + safeInt L11 + audit PK_DOKUMEN_DOWNLOAD.

import { NextRequest, NextResponse } from 'next/server';
import { sql, safeInt } from '@/lib/data/db';
import { getSession } from '@/lib/security/auth';
import { writeAuditLog } from '@/lib/security/auditlog';
import { isPkRole, pkRateLimit } from '@/lib/data/pk-schemas';
import { hasAppAccess } from '@/lib/security/guard';
import { ADMIN_ROLES } from '@/lib/constants';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type FileRow = {
  generated_file: Buffer | null;
  generated_filename: string | null;
  generated_filesize: number | null;
  created_by: number | null;
};

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
  if (!(await hasAppAccess(session.userId, session.role, isPkRole))) return NextResponse.json({ ok: false, message: 'Akses ditolak' }, { status: 403 });

  const limited = await pkRateLimit(session.userId, 'download-dokumen', 30);
  if (limited) return limited;

  const { id: idRaw } = await params;
  const id = safeInt(idRaw, 0);
  if (id <= 0) return NextResponse.json({ ok: false, message: 'ID dokumen tidak valid' }, { status: 400 });

  // Ownership L2 — non-admin hanya download dokumen sendiri
  const isAdmin = (ADMIN_ROLES as readonly string[]).includes(session.role);
  const rows = await sql`
    SELECT generated_file, generated_filename, generated_filesize, created_by
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

  await writeAuditLog({
    req,
    eventType: 'PK_DOKUMEN_DOWNLOAD',
    userId:    session.userId,
    username:  session.username,
    detail:    `Download dokumen PK id=${id}, file=${row.generated_filename}`,
  });

  const filename = row.generated_filename ?? `PK-${id}.docx`;
  return new NextResponse(new Uint8Array(row.generated_file), {
    status: 200,
    headers: {
      'Content-Type':           'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition':    `attachment; filename="${encodeURIComponent(filename)}"`,
      'Content-Length':         String(row.generated_filesize ?? row.generated_file.length),
      'Cache-Control':          'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
