// app/api/iki/pejabat/route.ts
// Autofill Data Pribadi & Atasan dari master pejabat PK (pk_pejabat) — read-only.
// Keputusan user: reuse pk_pejabat sebagai suggest + tetap boleh input manual.
import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/data/db';
import { TahunSchema, ikiRateLimit } from '@/lib/data/iki-schemas';
import { guard } from '../_guard';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const g = await guard();
  if (!g.ok) return g.res;
  const limited = await ikiRateLimit(g.session.userId, 'pejabat', 30);
  if (limited) return limited;

  const tahunRaw = new URL(req.url).searchParams.get('tahun') ?? '';
  const parsed = TahunSchema.safeParse(tahunRaw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, message: 'Parameter tahun tidak valid' }, { status: 400 });
  }
  const rows = await sql`
    SELECT unit_kerja, nama, jabatan, pangkat, nip
    FROM pk_pejabat
    WHERE tahun = ${parsed.data} AND is_active = TRUE
    ORDER BY unit_kerja ASC, nama ASC
  `;
  return NextResponse.json({ ok: true, rows });
}
