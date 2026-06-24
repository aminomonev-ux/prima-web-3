// app/api/kinerja/ssk/check-deletable/route.ts
// Refactor Versi E-Anggaran — Checkpoint B Task #15.
// Cek apakah baris SSK punya referensi di Realisasi → boleh hapus permanen atau wajib pakai Nol-kan.
// Reference: docs/lain/KINERJA_VERSI_REFACTOR.md
//
// Query: ?tahun=2026&canonical_id=K-000123
// Response: { ok: true, deletable: boolean, count: number, reason: string }

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/security/auth';
import { sql } from '@/lib/data/db';
import { isKinerjaRole, TahunSchema } from '@/lib/data/kinerja-schemas';
import { hasAppAccess } from '@/lib/security/guard';

const QuerySchema = z.object({
  tahun:        TahunSchema,
  canonical_id: z.string().min(1).max(20),
});

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
  if (!(await hasAppAccess(session.userId, session.role, isKinerjaRole))) return NextResponse.json({ ok: false, message: 'Akses ditolak' }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const parsed = QuerySchema.safeParse({
    tahun:        searchParams.get('tahun')        ?? undefined,
    canonical_id: searchParams.get('canonical_id') ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, message: 'Parameter tidak valid: ' + parsed.error.issues[0].message },
      { status: 400 },
    );
  }
  const { tahun, canonical_id } = parsed.data;

  const rows = await sql`
    SELECT COUNT(*) AS cnt
    FROM kinerja_realisasi
    WHERE tahun = ${tahun} AND ssk_canonical_id = ${canonical_id}
  ` as { cnt: unknown }[];
  const count = Number(rows[0]?.cnt ?? 0);

  if (count === 0) {
    return NextResponse.json({
      ok: true,
      deletable: true,
      count: 0,
      reason: 'Belum ada referensi di Realisasi. Boleh hapus permanen.',
    });
  }

  return NextResponse.json({
    ok: true,
    deletable: false,
    count,
    reason: `Sudah ada ${count} baris realisasi yang merujuk ke item ini. Gunakan opsi Nol-kan.`,
  });
}
