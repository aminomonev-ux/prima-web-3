// app/api/iki/import-atasan/route.ts
// Kaskade RHK antar-IKI: ambil daftar RHK milik dokumen IKI atasan sebagai
// kandidat "Rencana Hasil Kerja yang diintervensi" bawahan (docs/CONCEPT-iki.md §4.2).
// Atasan CUSTOM dibaca dari tabelnya lewat peran kolom (docs/CONCEPT-iki-custom.md §11.3).
import { NextRequest, NextResponse } from 'next/server';
import { ImportAtasanQuerySchema, ikiRateLimit } from '@/lib/data/iki-schemas';
import { getRhkAtasan } from '@/lib/data/iki';
import { writeAuditLog } from '@/lib/security/auditlog';
import { guard } from '../_guard';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const g = await guard();
  if (!g.ok) return g.res;
  const limited = await ikiRateLimit(g.session.userId, 'import-atasan', 20);
  if (limited) return limited;

  const idRaw = new URL(req.url).searchParams.get('dokumen_id') ?? '';
  const parsed = ImportAtasanQuerySchema.safeParse({ dokumen_id: idRaw });
  if (!parsed.success) {
    return NextResponse.json({ ok: false, message: 'Parameter dokumen_id tidak valid' }, { status: 400 });
  }
  const hasil = await getRhkAtasan(parsed.data.dokumen_id);
  if (!hasil) return NextResponse.json({ ok: false, message: 'Dokumen atasan tidak ditemukan' }, { status: 404 });
  const { atasan, rows, catatan } = hasil;
  await writeAuditLog({
    req, eventType: 'IKI_IMPORT_ATASAN', userId: g.session.userId, username: g.session.username,
    detail: `Import RHK dari IKI atasan id=${atasan.id} (${atasan.jabatan}) tahun ${atasan.tahun}`,
  });
  return NextResponse.json({ ok: true, atasan, rows, catatan });
}
