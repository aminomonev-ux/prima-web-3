import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { rencanaSetahun } from '@/lib/data/buku-besar-aset';
import { ringkasAlur } from '@/lib/bba/tahap';
import { guard } from '../_guard';

// Angka pita alur (docs/konsep/bba/CONCEPT-bba-revamp-alur.md §3.1) — baca saja, dihitung `tahapRencana`.
// Pagarnya cukup `guard()`: bagian Rencana tidak pernah tertutup bagi pemegang modul (lib/bba/peran.ts).
const Q = z.object({ tahun: z.coerce.number().int().min(2020).max(2100) });

export async function GET(req: NextRequest) {
  const g = await guard();
  if (!g.ok) return g.res;
  const p = Q.safeParse({ tahun: new URL(req.url).searchParams.get('tahun') ?? undefined });
  if (!p.success) return NextResponse.json({ ok: false, message: 'Tahun 2020-2100' }, { status: 400 });
  return NextResponse.json({ ok: true, tahun: p.data.tahun, ...ringkasAlur(await rencanaSetahun(p.data.tahun)) });
}
