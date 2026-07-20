// app/api/perjanjian-kinerja/pejabat/import/route.ts
// POST file Excel/CSV/Word → preview baris Master Pejabat + fuzzy match unit kanonik.
// READ-ONLY (parse saja, tidak menulis DB) — penulisan tetap lewat POST
// /api/perjanjian-kinerja/pejabat atas konfirmasi user (pola IK-1 import pendapatan).
// Guard = SAMA ketatnya dengan POST pejabat: SUPER_ADMIN/ADMIN only (PII).

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/data/db';
import { getSession } from '@/lib/security/auth';
import { writeAuditLog } from '@/lib/security/auditlog';
import { pkRateLimit } from '@/lib/data/pk-schemas';
import { parsePejabatImport, type ImportFormat } from '@/lib/pk/import-pejabat';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_SIZE = 5 * 1024 * 1024;
// xlsx & docx = kontainer zip/ooxml; csv = teks (file-type balikin undefined).
const ZIP_LIKE_MIME = [
  'application/zip',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

// L38/G22: magic-number sniff, bukan cuma file.type klien.
async function sniffMime(buf: Buffer): Promise<string | null> {
  const mod = await import('file-type');
  const r = await mod.fileTypeFromBuffer(buf);
  return r?.mime ?? null;
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'SUPER_ADMIN' && session.role !== 'ADMIN') {
    return NextResponse.json({ ok: false, message: 'Hanya SUPER_ADMIN/ADMIN yang dapat import pejabat' }, { status: 403 });
  }

  const limited = await pkRateLimit(session.userId, 'import-pejabat', 20);
  if (limited) return limited;

  const form = await req.formData().catch(() => null);
  const file = form?.get('file') as File | null;
  if (!file) return NextResponse.json({ ok: false, message: 'Tidak ada file yang dipilih.' }, { status: 400 });
  if (file.size > MAX_SIZE) return NextResponse.json({ ok: false, message: 'Ukuran file melebihi 5MB.' }, { status: 400 });

  const name = (file.name ?? '').toLowerCase();
  const format: ImportFormat | null =
    name.endsWith('.xlsx') ? 'xlsx' :
    name.endsWith('.docx') ? 'docx' :
    name.endsWith('.csv')  ? 'csv'  : null;
  if (!format) {
    return NextResponse.json({ ok: false, message: 'Format file harus .xlsx, .csv, atau .docx (PDF tidak didukung).' }, { status: 400 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const sniffed = await sniffMime(buf);
  const okMime = format === 'csv'
    ? sniffed === null // teks polos — kalau ke-sniff binary berarti bukan CSV
    : sniffed !== null && ZIP_LIKE_MIME.includes(sniffed);
  if (!okMime) {
    return NextResponse.json({ ok: false, message: 'Isi file tidak sesuai ekstensinya.' }, { status: 400 });
  }

  const units = await sql`
    SELECT nama_unit FROM pk_unit_kerja WHERE active = TRUE ORDER BY urutan
  ` as { nama_unit: string }[];

  try {
    const result = await parsePejabatImport(buf, format, units.map(u => u.nama_unit));

    // Bulk PII access → audit (pola PK_VIEW_LIST).
    await writeAuditLog({
      req,
      eventType: 'PK_IMPORT_PEJABAT',
      userId:    session.userId,
      username:  session.username,
      detail:    `Preview import pejabat dari ${format.toUpperCase()} "${file.name}": ${result.rows.length} baris (${result.source})`,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Gagal membaca isi file. Pastikan format file benar.';
    return NextResponse.json({ ok: false, message }, { status: 400 });
  }
}
