// app/api/perjanjian-kinerja/sasaran/route.ts
// Master Sasaran — referensi indikator + target per program/kegiatan/sub-kegiatan.
// Pattern: getSession + isPkRole/EditRole + pkRateLimit + Zod + withTransaction + bulkInsert + audit log.

import { NextRequest, NextResponse } from 'next/server';
import { sql, withTransaction, bulkInsert } from '@/lib/data/db';
import { getSession } from '@/lib/security/auth';
import { writeAuditLog } from '@/lib/security/auditlog';
import {
  isPkRole,
  isPkEditRole,
  pkRateLimit,
  PkQuerySchema,
  SasaranBodySchema,
} from '@/lib/data/pk-schemas';
import { hasAppAccess } from '@/lib/security/guard';

export const dynamic = 'force-dynamic';

type SasaranRow = {
  id: number;
  program: string;
  indikator_program: string | null;
  target_program: string | null;
  kegiatan: string | null;
  indikator_kegiatan: string | null;
  target_kegiatan: string | null;
  subkegiatan: string | null;
  indikator_subkegiatan: string | null;
  target_subkegiatan: string | null;
  tahun: string;
};

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
  if (!(await hasAppAccess(session.userId, session.role, isPkRole))) return NextResponse.json({ ok: false, message: 'Akses ditolak' }, { status: 403 });

  const limited = await pkRateLimit(session.userId, 'sasaran-list', 60);
  if (limited) return limited;

  const { searchParams } = new URL(req.url);
  const q = PkQuerySchema.safeParse({ tahun: searchParams.get('tahun') ?? undefined });
  if (!q.success) {
    return NextResponse.json({ ok: false, message: 'Parameter tidak valid: ' + q.error.issues[0].message }, { status: 400 });
  }
  const tahun = q.data.tahun ?? new Date().getFullYear().toString();

  const rows = await sql`
    SELECT id, program, indikator_program, target_program,
           kegiatan, indikator_kegiatan, target_kegiatan,
           subkegiatan, indikator_subkegiatan, target_subkegiatan, tahun
    FROM pk_sasaran
    WHERE tahun = ${tahun}
    ORDER BY program, kegiatan, subkegiatan, id
  ` as SasaranRow[];

  return NextResponse.json({ ok: true, tahun, rows });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
  if (!(await hasAppAccess(session.userId, session.role, isPkEditRole))) return NextResponse.json({ ok: false, message: 'Akses ditolak' }, { status: 403 });

  const limited = await pkRateLimit(session.userId, 'save-sasaran', 30);
  if (limited) return limited;

  const raw = await req.json().catch(() => null);
  const parsed = SasaranBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, message: 'Data tidak valid: ' + parsed.error.issues[0].message }, { status: 400 });
  }
  const { tahun, rows } = parsed.data;

  // Pattern: replace-all per tahun (DELETE + bulkInsert dalam withTransaction — L7 BUG-C2)
  // Konsisten dengan pattern E-Anggaran saveSskBatch + L24 (pass conn ke bulkInsert).
  await withTransaction(async ({ tx, conn }) => {
    await tx`DELETE FROM pk_sasaran WHERE tahun = ${tahun}`;
    if (rows.length === 0) return;
    const values = rows.map(r => [
      r.program,
      r.indikator_program ?? null,
      r.target_program ?? null,
      r.kegiatan ?? null,
      r.indikator_kegiatan ?? null,
      r.target_kegiatan ?? null,
      r.subkegiatan ?? null,
      r.indikator_subkegiatan ?? null,
      r.target_subkegiatan ?? null,
      tahun,
      session.userId,
    ]);
    await bulkInsert(
      'pk_sasaran',
      [
        'program','indikator_program','target_program',
        'kegiatan','indikator_kegiatan','target_kegiatan',
        'subkegiatan','indikator_subkegiatan','target_subkegiatan',
        'tahun','created_by',
      ],
      values,
      conn,
    );
  });

  await writeAuditLog({
    req,
    eventType: 'PK_SAVE_SASARAN',
    userId:    session.userId,
    username:  session.username,
    detail:    `Simpan Master Sasaran tahun ${tahun}: ${rows.length} baris`,
  });

  return NextResponse.json({ ok: true, tahun, saved: rows.length });
}
