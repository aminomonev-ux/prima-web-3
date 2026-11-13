// app/api/perjanjian-kinerja/dokumen/[id]/salin-draft/route.ts
// POST — salin dokumen FINAL jadi DRAFT baru. Dokumen lama tidak disentuh (arsip).
// Pola guard/audit sama dengan PATCH /dokumen/[id]: sesi → sakelar → izin menu → rate limit
// → kepemilikan → logika di lib/data/pk.ts → audit.

import { NextRequest, NextResponse } from 'next/server';
import { sql, safeInt } from '@/lib/data/db';
import { getSession } from '@/lib/security/auth';
import { writeAuditLog } from '@/lib/security/auditlog';
import { pkRateLimit } from '@/lib/data/pk-schemas';
import { salinJadiDraft, PkDokumenTidakAdaError, PkHanyaFinalDisalinError } from '@/lib/data/pk';
import { bolehEditMenu, tolakEdit, pkMati } from '../../../_guard';
import { ADMIN_ROLES } from '@/lib/constants';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
  const mati = await pkMati(session.role);
  if (mati) return mati;
  if (!(await bolehEditMenu(session.userId, session.role, 'form'))) return tolakEdit('form');

  const limited = await pkRateLimit(session.userId, 'salin-draft', 10);
  if (limited) return limited;

  const id = safeInt((await params).id, 0);
  if (id <= 0) return NextResponse.json({ ok: false, message: 'ID dokumen tidak valid' }, { status: 400 });

  // Ownership L2 SEC-C4. Status (FINAL saja) diperiksa di lib, di dalam transaksi.
  const rows = await sql`SELECT created_by FROM pk_dokumen WHERE id = ${id} LIMIT 1` as { created_by: number | null }[];
  if (!rows.length) return NextResponse.json({ ok: false, message: 'Dokumen tidak ditemukan' }, { status: 404 });
  const isAdmin = (ADMIN_ROLES as readonly string[]).includes(session.role);
  if (!isAdmin && rows[0].created_by !== session.userId) {
    return NextResponse.json({ ok: false, message: 'Bukan dokumen Anda' }, { status: 403 });
  }

  let baru: number;
  try {
    baru = await salinJadiDraft(id, session.userId);
  } catch (err) {
    if (err instanceof PkDokumenTidakAdaError) return NextResponse.json({ ok: false, message: err.message }, { status: 404 });
    if (err instanceof PkHanyaFinalDisalinError) return NextResponse.json({ ok: false, code: 'BUKAN_FINAL', message: err.message }, { status: 409 });
    throw err;
  }

  await writeAuditLog({
    req,
    eventType: 'PK_DOKUMEN_SALIN_DRAFT',
    userId:    session.userId,
    username:  session.username,
    detail:    `Salin dokumen PK FINAL id=${id} → DRAFT baru id=${baru}`,
  });

  return NextResponse.json({ ok: true, id: baru, sumber: id });
}
