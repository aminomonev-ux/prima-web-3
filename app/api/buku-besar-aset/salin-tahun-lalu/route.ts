import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { writeAuditLog } from '@/lib/security/auditlog';
import { SalinTahunLaluSchema, bbaRateLimit } from '@/lib/data/buku-besar-aset-schemas';
import { saranTahunLaluList, salinTahunLalu, BbaNotFoundError, BbaSalinError } from '@/lib/data/buku-besar-aset';
import { guard, tolakKecualiEdit, tolakKecualiLihat } from '../_guard';

// Saran dari rencana tahun lalu yang tidak didanai (docs/CONCEPT-bba-buku-aset.md §14): GET daftar
// untuk tahun T, POST menyalin yang dipilih ke T (izin EDIT Rencana).
const TahunSchema = z.object({ tahun: z.coerce.number().int().min(2020).max(2100) });

export async function GET(req: NextRequest) {
  const g = await guard();
  if (!g.ok) return g.res;
  const ditolak = await tolakKecualiLihat(g.session, 'rencana'); if (ditolak) return ditolak;
  const p = TahunSchema.safeParse({ tahun: new URL(req.url).searchParams.get('tahun') });
  if (!p.success) return NextResponse.json({ ok: false, message: 'Tahun tidak valid' }, { status: 400 });
  return NextResponse.json({ ok: true, rows: await saranTahunLaluList(p.data.tahun) });
}

export async function POST(req: NextRequest) {
  const g = await guard();
  if (!g.ok) return g.res;
  const ditolak = await tolakKecualiEdit(g.session, 'rencana'); if (ditolak) return ditolak;
  const limited = await bbaRateLimit(g.session.userId, 'salin-tahun', 10); if (limited) return limited;
  const p = SalinTahunLaluSchema.safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ ok: false, message: 'Data tidak valid: ' + p.error.issues[0].message }, { status: 400 });
  try {
    const hasil = await salinTahunLalu(p.data, g.session.userId);
    if (hasil.disalin > 0) {
      await writeAuditLog({ req, eventType: 'BBA_RENCANA_SALIN', userId: g.session.userId, username: g.session.username, detail: `BBA salin ${hasil.disalin} rencana ${p.data.tahun - 1} tidak didanai → ${p.data.tahun}` });
    }
    return NextResponse.json({ ok: true, ...hasil });
  } catch (err) {
    if (err instanceof BbaSalinError) return NextResponse.json({ ok: false, code: 'DITOLAK', message: err.message, alasan: err.alasan }, { status: 400 });
    if (err instanceof BbaNotFoundError) return NextResponse.json({ ok: false, message: err.message }, { status: 404 });
    throw err;
  }
}
