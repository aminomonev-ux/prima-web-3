// app/api/perjanjian-kinerja/program/route.ts
// Master Program — hierarki program → kegiatan → sub-kegiatan.
// Pattern: getSession + isPkRole/EditRole + pkRateLimit + Zod + withTransaction + bulkInsert.

import { NextRequest, NextResponse } from 'next/server';
import { sql, withTransaction, bulkInsert } from '@/lib/data/db';
import { getSession } from '@/lib/security/auth';
import { writeAuditLog } from '@/lib/security/auditlog';
import {
  isPkRole,
  isPkEditRole,
  pkRateLimit,
  PkQuerySchema,
  ProgramBodySchema,
} from '@/lib/data/pk-schemas';
import { hasAppAccess } from '@/lib/security/guard';

export const dynamic = 'force-dynamic';

type ProgramRow = {
  id: number;
  program: string;
  kegiatan: string | null;
  subkegiatan: string | null;
  tahun: string;
  level: 'program' | 'kegiatan' | 'subkegiatan';
};

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
  if (!(await hasAppAccess(session.userId, session.role, isPkRole))) return NextResponse.json({ ok: false, message: 'Akses ditolak' }, { status: 403 });

  const limited = await pkRateLimit(session.userId, 'program-list', 60);
  if (limited) return limited;

  const { searchParams } = new URL(req.url);
  const q = PkQuerySchema.safeParse({ tahun: searchParams.get('tahun') ?? undefined });
  if (!q.success) {
    return NextResponse.json({ ok: false, message: 'Parameter tidak valid: ' + q.error.issues[0].message }, { status: 400 });
  }
  const tahun = q.data.tahun ?? new Date().getFullYear().toString();

  const rows = await sql`
    SELECT id, program, kegiatan, subkegiatan, tahun, level
    FROM pk_program
    WHERE tahun = ${tahun}
    ORDER BY program, kegiatan, subkegiatan
  ` as ProgramRow[];

  // Build nested hierarchy untuk konsumsi frontend cache (mirror GAS LAMPIRAN_CACHE)
  const programs    = new Set<string>();
  const kegiatanByProgram: Record<string, Set<string>> = {};
  const subByKegiatan:    Record<string, Set<string>> = {};

  for (const r of rows) {
    programs.add(r.program);
    if (r.kegiatan) {
      const k = r.program;
      kegiatanByProgram[k] = kegiatanByProgram[k] ?? new Set();
      kegiatanByProgram[k].add(r.kegiatan);
      if (r.subkegiatan) {
        const sk = `${r.program}||${r.kegiatan}`;
        subByKegiatan[sk] = subByKegiatan[sk] ?? new Set();
        subByKegiatan[sk].add(r.subkegiatan);
      }
    }
  }

  return NextResponse.json({
    ok: true,
    tahun,
    rows,
    hierarchy: {
      programs:           [...programs].sort(),
      kegiatanByProgram:  Object.fromEntries(
        Object.entries(kegiatanByProgram).map(([k, v]) => [k, [...v].sort()]),
      ),
      subByKegiatan:      Object.fromEntries(
        Object.entries(subByKegiatan).map(([k, v]) => [k, [...v].sort()]),
      ),
    },
  });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
  if (!(await hasAppAccess(session.userId, session.role, isPkEditRole))) return NextResponse.json({ ok: false, message: 'Akses ditolak' }, { status: 403 });

  const limited = await pkRateLimit(session.userId, 'save-program', 30);
  if (limited) return limited;

  const raw = await req.json().catch(() => null);
  const parsed = ProgramBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, message: 'Data tidak valid: ' + parsed.error.issues[0].message }, { status: 400 });
  }
  const { tahun, rows } = parsed.data;

  await withTransaction(async ({ tx, conn }) => {
    await tx`DELETE FROM pk_program WHERE tahun = ${tahun}`;
    if (rows.length === 0) return;
    const values = rows.map(r => [
      r.program,
      r.kegiatan ?? null,
      r.subkegiatan ?? null,
      tahun,
      r.level,
      session.userId,
    ]);
    await bulkInsert(
      'pk_program',
      ['program','kegiatan','subkegiatan','tahun','level','created_by'],
      values,
      conn,
    );
  });

  await writeAuditLog({
    req,
    eventType: 'PK_SAVE_PROGRAM',
    userId:    session.userId,
    username:  session.username,
    detail:    `Simpan Master Program tahun ${tahun}: ${rows.length} baris`,
  });

  return NextResponse.json({ ok: true, tahun, saved: rows.length });
}
