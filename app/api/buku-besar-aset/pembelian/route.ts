import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { pembelianSebelumnya } from '@/lib/data/buku-besar-aset';
import { guard, tolakKecualiLihat } from '../_guard';

// Pembelian sebelumnya barang yang sama (docs/CONCEPT-bba-buku-aset.md §7.7): rencana lama yang sudah
// terealisasi beserta referensi & buktinya, plus register Buku Aset per tahun perolehan. Baca saja.
const QuerySchema = z.object({ barang: z.coerce.number().int().positive(), kecuali: z.coerce.number().int().positive().optional() });

export async function GET(req: NextRequest) {
  const g = await guard();
  if (!g.ok) return g.res;
  const ditolak = await tolakKecualiLihat(g.session, 'rencana'); if (ditolak) return ditolak;
  const sp = new URL(req.url).searchParams;
  const p = QuerySchema.safeParse({ barang: sp.get('barang'), kecuali: sp.get('kecuali') || undefined });
  if (!p.success) return NextResponse.json({ ok: false, message: 'Barang tidak valid' }, { status: 400 });
  return NextResponse.json({ ok: true, ...(await pembelianSebelumnya(p.data.barang, p.data.kecuali)) });
}
