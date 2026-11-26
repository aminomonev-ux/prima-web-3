import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { modulSedangMati } from '@/lib/security/guard';
import { bacaPaguBlud } from '@/lib/data/bba-pagu';
import { guard, tolakKecualiLihat } from '../_guard';

// Pagu belanja modal BLUD untuk kartu pagu lembar keputusan (docs/konsep/bba/CONCEPT-bba-revamp-alur.md §4.2).
// Pagar = izin LIHAT bagian Rencana BBA + sakelar BBA (guard), BUKAN akses modul BLUD: yang dipulangkan hanya
// SATU angka total + label versinya. Sakelar BLUD mati → "tidak tersedia", layar jatuh ke Ketik sendiri.
// Tanpa audit — bacaan angka ringkas, seperti Beranda.
const Q = z.object({ tahun: z.coerce.number().int().min(2020).max(2100), jenis: z.enum(['berlaku', 'dpa', 'pergeseran']).default('berlaku') });

export async function GET(req: NextRequest) {
  const g = await guard();
  if (!g.ok) return g.res;
  const ditolak = await tolakKecualiLihat(g.session, 'rencana'); if (ditolak) return ditolak;
  const sp = new URL(req.url).searchParams;
  const p = Q.safeParse({ tahun: sp.get('tahun') ?? undefined, jenis: sp.get('jenis') ?? undefined });
  if (!p.success) return NextResponse.json({ ok: false, message: 'Parameter tidak valid' }, { status: 400 });
  if (await modulSedangMati(['app_status_blud'], { role: g.session.role }))
    return NextResponse.json({ ok: true, tersedia: false, alasan: 'Modul BLUD sedang dimatikan — ketik pagu sendiri.' });
  return NextResponse.json({ ok: true, ...(await bacaPaguBlud(p.data.tahun, p.data.jenis)) });
}
