// app/api/kinerja/ssk/versi-list/route.ts
// Refactor Versi E-Anggaran — Checkpoint C support.
// List semua versi SSK yang tersimpan untuk (tahun, sumber).
// Reference: docs/lain/KINERJA_VERSI_REFACTOR.md
//
// Query: ?tahun=2026&sumber=GAJI
// Response: { ok: true, items: VersiKinerja[] }

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/security/auth';
import { sql } from '@/lib/data/db';
import { isKinerjaRole, KinerjaQuerySchema } from '@/lib/data/kinerja-schemas';
import { hasAppAccess } from '@/lib/security/guard';

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
  if (!(await hasAppAccess(session.userId, session.role, isKinerjaRole))) return NextResponse.json({ ok: false, message: 'Akses ditolak' }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const q = KinerjaQuerySchema.safeParse({
    tahun:  searchParams.get('tahun')  ?? undefined,
    sumber: searchParams.get('sumber') ?? undefined,
  });
  if (!q.success) return NextResponse.json({ ok: false, message: 'Parameter tidak valid: ' + q.error.issues[0].message }, { status: 400 });
  const tahun  = q.data.tahun ?? new Date().getFullYear().toString();
  const sumber = q.data.sumber;
  if (!sumber) return NextResponse.json({ ok: false, message: 'sumber wajib' }, { status: 400 });

  const rows = await sql`
    SELECT
      versi_tipe,
      versi_seq,
      COUNT(*) AS jumlah_baris,
      MAX(locked_at) AS locked_at,
      MAX(updated_at) AS updated_at
    FROM kinerja_ssk
    WHERE tahun = ${tahun} AND sumber = ${sumber}
    GROUP BY versi_tipe, versi_seq
    ORDER BY versi_seq ASC, versi_tipe ASC
  ` as Record<string, unknown>[];

  const items = rows.map(r => ({
    versi_tipe:   String(r.versi_tipe ?? 'MURNI') as 'MURNI' | 'PERUBAHAN',
    versi_seq:    Number(r.versi_seq ?? 0),
    jumlah_baris: Number(r.jumlah_baris ?? 0),
    locked_at:    r.locked_at ? String(r.locked_at) : null,
    updated_at:   r.updated_at ? String(r.updated_at) : null,
  }));

  return NextResponse.json({ ok: true, items });
}
