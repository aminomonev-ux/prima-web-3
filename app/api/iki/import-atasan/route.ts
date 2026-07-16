// app/api/iki/import-atasan/route.ts
// Kaskade RHK antar-IKI: ambil daftar RHK milik dokumen IKI atasan sebagai
// kandidat "Rencana Hasil Kerja yang diintervensi" bawahan (docs/CONCEPT-iki.md §4.2).
import { NextRequest, NextResponse } from 'next/server';
import { sql, queryOne } from '@/lib/data/db';
import { ImportAtasanQuerySchema, ikiRateLimit } from '@/lib/data/iki-schemas';
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
  const atasan = await queryOne<{ id: number; nama: string; jabatan: string; tahun: string }>(
    sql`SELECT id, nama, jabatan, tahun FROM iki_dokumen WHERE id = ${parsed.data.dokumen_id} LIMIT 1`,
  );
  if (!atasan) return NextResponse.json({ ok: false, message: 'Dokumen atasan tidak ditemukan' }, { status: 404 });

  const rows = await sql`
    SELECT id AS atasan_rhk_id, no_urut, rhk, indikator, target_tahunan, aspek_b
    FROM iki_rhk
    WHERE dokumen_id = ${atasan.id}
    ORDER BY no_urut ASC, urutan ASC
  `;
  await writeAuditLog({
    req, eventType: 'IKI_IMPORT_ATASAN', userId: g.session.userId, username: g.session.username,
    detail: `Import RHK dari IKI atasan id=${atasan.id} (${atasan.jabatan}) tahun ${atasan.tahun}`,
  });
  return NextResponse.json({ ok: true, atasan, rows });
}
