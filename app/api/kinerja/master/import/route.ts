// app/api/kinerja/master/import/route.ts
// POST multipart (file xlsx) → entri Master. PEMBACA BERKAS SAJA.
//
// Tidak menulis DB sama sekali (pola IK-1/IK-4): "baru / sudah ada / kembar"
// dihitung di klien terhadap daftar Master yang sedang dibuka, lalu entri yang
// disetujui ditulis lewat POST /api/kinerja/master yang sudah ada. Dua pintu
// tulis untuk data yang sama = dua set aturan, dan itu yang melahirkan lubang.

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/security/auth';
import { hasAppAccess } from '@/lib/security/guard';
import { isKinerjaRole, kinerjaRateLimit } from '@/lib/data/kinerja-schemas';
import { writeAuditLog } from '@/lib/security/auditlog';
import { parseMasterImport } from '@/lib/data/kinerja-import-master';
import { kinerjaMati } from '../../_guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_SIZE = 10 * 1024 * 1024;
// xlsx = kontainer zip; file-type memulangkan mime zip atau ooxml (G22: sniff isi,
// bukan percaya file.type dari klien).
const ZIP_LIKE_MIME = [
  'application/zip',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];

async function sniffMime(buf: Buffer): Promise<string | null> {
  const mod = await import('file-type');
  return (await mod.fileTypeFromBuffer(buf))?.mime ?? null;
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
  // T1: sakelar maintenance — 503 kalau modul dimatikan admin (SUPER_ADMIN tembus).
  const mati = await kinerjaMati(session.role); if (mati) return mati;
  if (!(await hasAppAccess(session.userId, session.role, isKinerjaRole)))
    return NextResponse.json({ ok: false, message: 'Akses ditolak' }, { status: 403 });

  const limited = await kinerjaRateLimit(session.userId, 'master-import', 20);
  if (limited) return limited;

  const form = await req.formData().catch(() => null);
  const file = form?.get('file') as File | null;
  if (!file) return NextResponse.json({ ok: false, message: 'Tidak ada berkas yang dipilih.' }, { status: 400 });
  if (file.size > MAX_SIZE) return NextResponse.json({ ok: false, message: 'Ukuran berkas melebihi 10MB.' }, { status: 400 });
  if (!/\.xlsx$/i.test(file.name ?? '')) {
    return NextResponse.json({ ok: false, message: 'Format berkas harus .xlsx.' }, { status: 400 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const sniffed = await sniffMime(buf);
  if (!sniffed || !ZIP_LIKE_MIME.includes(sniffed)) {
    return NextResponse.json({ ok: false, message: 'Isi berkas tidak sesuai ekstensinya.' }, { status: 400 });
  }

  try {
    const hasil = await parseMasterImport(buf);

    await writeAuditLog({
      req,
      eventType: 'KINERJA_IMPORT_MASTER',
      userId:    session.userId,
      username:  session.username,
      detail:    `Baca berkas master "${file.name}" (${hasil.rows.length} entri, ${hasil.source})`,
    });

    return NextResponse.json({ ok: true, ...hasil });
  } catch (e) {
    const pesan = e instanceof Error ? e.message : 'Gagal membaca berkas Excel.';
    return NextResponse.json({ ok: false, message: pesan }, { status: 400 });
  }
}
