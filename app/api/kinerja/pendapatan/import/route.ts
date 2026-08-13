import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/security/auth';
import { hasAppAccess } from '@/lib/security/guard';
import { isKinerjaRole, kinerjaRateLimit } from '@/lib/data/kinerja-schemas';
import { parsePendapatanBuffer } from '@/lib/data/kinerja-import';
import { kinerjaMati } from '../../_guard';

// IK-1 (Import Pendapatan bulanan): POST file Excel → baris realisasi per bulan.
// READ-ONLY (parse saja, tidak menulis DB) — penulisan tetap lewat PUT
// /api/kinerja/pendapatan atas konfirmasi user (Model A′/G21/G33). Guard = SAMA
// dengan endpoint Kinerja lain (G31 paritas, L60/L61). Parse di SERVER (G22/G29).
export const runtime = 'nodejs';

const ALLOWED_MIME = [
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];
const MAX_SIZE = 10 * 1024 * 1024;

// L38/G22: magic-number, bukan cuma file.type klien. xlsx = kontainer zip/ooxml.
async function sniffMime(buf: Buffer): Promise<string | null> {
  const mod = await import('file-type');
  const r = await mod.fileTypeFromBuffer(buf);
  return r?.mime ?? null;
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
  // T1: sakelar maintenance — 503 kalau modul dimatikan admin (SUPER_ADMIN tembus).
  const mati = await kinerjaMati(session.role); if (mati) return mati;
  if (!(await hasAppAccess(session.userId, session.role, isKinerjaRole)))
    return NextResponse.json({ ok: false, message: 'Akses ditolak' }, { status: 403 });
  const limited = await kinerjaRateLimit(session.userId, 'import-pendapatan', 20);
  if (limited) return limited;

  const form = await req.formData().catch(() => null);
  const file = form?.get('file') as File | null;
  if (!file) return NextResponse.json({ ok: false, message: 'Tidak ada file yang dipilih.' }, { status: 400 });
  if (file.size > MAX_SIZE) return NextResponse.json({ ok: false, message: 'Ukuran file melebihi 10MB.' }, { status: 400 });

  // T9/L38/G22: percaya magic-number, TITIK — `file.type` adalah label tulisan
  // pengirim, bukan bukti isi. Lihat catatan lengkap di realisasi/import/route.ts.
  const buf = Buffer.from(await file.arrayBuffer());
  const sniffed = await sniffMime(buf);
  const okMime = !!sniffed
    && (ALLOWED_MIME.includes(sniffed) || sniffed === 'application/zip' || sniffed === 'application/x-cfb');
  if (!okMime) return NextResponse.json({ ok: false, message: 'File harus Excel (.xlsx/.xls).' }, { status: 400 });

  try {
    const result = await parsePendapatanBuffer(buf);
    return NextResponse.json({ ok: true, months: result.months, warnings: result.warnings });
  } catch {
    return NextResponse.json({ ok: false, message: 'Gagal membaca isi Excel. Pastikan format file benar.' }, { status: 400 });
  }
}
