// app/api/iki/import-excel/route.ts
// POST file Excel IKI (format VERSI BPSDMD) → preview struktur dokumen.
// READ-ONLY (parse saja, tidak menulis DB) — penulisan lewat POST /api/iki +
// PUT /api/iki/[id] existing atas konfirmasi user di modal preview.

import { NextRequest, NextResponse } from 'next/server';
import { writeAuditLog } from '@/lib/security/auditlog';
import { ikiRateLimit } from '@/lib/data/iki-schemas';
import { parseIkiExcel } from '@/lib/iki/import-excel';
import { guard } from '../_guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_SIZE = 5 * 1024 * 1024;
const ZIP_LIKE_MIME = [
  'application/zip',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];

// L38/G22: magic-number sniff, bukan cuma file.type klien
async function sniffMime(buf: Buffer): Promise<string | null> {
  const mod = await import('file-type');
  const r = await mod.fileTypeFromBuffer(buf);
  return r?.mime ?? null;
}

export async function POST(req: NextRequest) {
  const g = await guard();
  if (!g.ok) return g.res;

  const limited = await ikiRateLimit(g.session.userId, 'import-excel', 10);
  if (limited) return limited;

  const form = await req.formData().catch(() => null);
  const file = form?.get('file') as File | null;
  if (!file) return NextResponse.json({ ok: false, message: 'Tidak ada file yang dipilih.' }, { status: 400 });
  if (file.size > MAX_SIZE) return NextResponse.json({ ok: false, message: 'Ukuran file melebihi 5MB.' }, { status: 400 });
  if (!(file.name ?? '').toLowerCase().endsWith('.xlsx')) {
    return NextResponse.json({ ok: false, message: 'Format file harus .xlsx.' }, { status: 400 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const sniffed = await sniffMime(buf);
  if (!sniffed || !ZIP_LIKE_MIME.includes(sniffed)) {
    return NextResponse.json({ ok: false, message: 'Isi file bukan Excel (.xlsx) yang valid.' }, { status: 400 });
  }

  try {
    const result = await parseIkiExcel(buf);

    await writeAuditLog({
      req,
      eventType: 'IKI_IMPORT_EXCEL',
      userId:    g.session.userId,
      username:  g.session.username,
      detail:    `Preview import IKI dari "${file.name}": ${result.jabatan} (${result.nama}) — ${result.groups.length} grup RHK (${result.source})`,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Gagal membaca isi file.';
    return NextResponse.json({ ok: false, message }, { status: 400 });
  }
}
