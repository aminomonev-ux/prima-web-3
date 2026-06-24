// app/api/perjanjian-kinerja/dokumen/[id]/finalize/route.ts
// POST finalize dokumen PK — generate Word + save BLOB + set status FINAL.
// Pattern: ownership L2 + withTransaction L7 + dynamic import L18.

import { NextRequest, NextResponse } from 'next/server';
import { sql, safeInt, withTransaction } from '@/lib/data/db';
import { getSession } from '@/lib/security/auth';
import { writeAuditLog } from '@/lib/security/auditlog';
import { isPkEditRole, pkRateLimit } from '@/lib/data/pk-schemas';
import { hasAppAccess } from '@/lib/security/guard';
import { ADMIN_ROLES } from '@/lib/constants';
import { generatePkDocument } from '@/lib/pk/docgen';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs'; // perlu fs untuk template file

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
  if (!(await hasAppAccess(session.userId, session.role, isPkEditRole))) return NextResponse.json({ ok: false, message: 'Akses ditolak' }, { status: 403 });

  const limited = await pkRateLimit(session.userId, 'finalize-dokumen', 10);
  if (limited) return limited;

  const { id: idRaw } = await params;
  const id = safeInt(idRaw, 0);
  if (id <= 0) return NextResponse.json({ ok: false, message: 'ID dokumen tidak valid' }, { status: 400 });

  // Ownership L2 SEC-C4
  const rows = await sql`SELECT created_by, status FROM pk_dokumen WHERE id = ${id} LIMIT 1` as { created_by: number | null; status: string }[];
  if (!rows.length) return NextResponse.json({ ok: false, message: 'Dokumen tidak ditemukan' }, { status: 404 });
  const isAdmin = (ADMIN_ROLES as readonly string[]).includes(session.role);
  if (!isAdmin && rows[0].created_by !== session.userId) {
    return NextResponse.json({ ok: false, message: 'Bukan dokumen Anda' }, { status: 403 });
  }
  if (rows[0].status === 'FINAL') {
    return NextResponse.json({ ok: false, message: 'Dokumen sudah FINAL' }, { status: 409 });
  }

  // Generate Word (dynamic import + render docxtemplater)
  let buffer: Buffer;
  let filename: string;
  try {
    const result = await generatePkDocument(id);
    buffer = result.buffer;
    filename = result.filename;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, message: 'Gagal generate Word: ' + msg }, { status: 500 });
  }

  // Save BLOB + set FINAL atomic
  await withTransaction(async ({ tx }) => {
    await tx`
      UPDATE pk_dokumen SET
        status              = 'FINAL',
        generated_file      = ${buffer},
        generated_filesize  = ${buffer.length},
        generated_filename  = ${filename},
        generated_at        = NOW()
      WHERE id = ${id}
    `;
  });

  await writeAuditLog({
    req,
    eventType: 'PK_DOKUMEN_FINALIZE',
    userId:    session.userId,
    username:  session.username,
    detail:    `Finalize + generate Word PK id=${id}, file=${filename} (${(buffer.length / 1024).toFixed(1)}KB)`,
  });

  return NextResponse.json({
    ok: true,
    id,
    status: 'FINAL',
    filename,
    filesize: buffer.length,
  });
}
