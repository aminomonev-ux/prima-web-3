import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/security/auth';
import { hasAppAccess } from '@/lib/security/guard';
import { writeAuditLog } from '@/lib/security/auditlog';
import { isKinerjaRole, kinerjaRateLimit, TahunSchema } from '@/lib/data/kinerja-schemas';
import { parsePendapatanBuffer } from '@/lib/data/kinerja-import';
import { buildRealisasiImport } from '@/lib/data/kinerja-import-match';

// Lampirkan-di-chat Rima (CONCEPT §23, Opsi A): user unggah Excel di chat → server
// DETEKSI jenis (belanja vs pendapatan) + PARSE, balikkan hasil. READ-ONLY: file
// mentah dibuang (buffer di RAM saja, tak ditulis disk/Drive). Penulisan tetap lewat
// modal native + Simpan user (Model A′/G33). Guard = SAMA dengan endpoint Kinerja
// (G31 paritas, L60/L61). Magic-number, bukan cuma file.type (L38/G22).
export const runtime = 'nodejs';

const ALLOWED_MIME = [
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];
const MAX_SIZE = 10 * 1024 * 1024;

async function sniffMime(buf: Buffer): Promise<string | null> {
  const mod = await import('file-type');
  return (await mod.fileTypeFromBuffer(buf))?.mime ?? null;
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
  if (!(await hasAppAccess(session.userId, session.role, isKinerjaRole)))
    return NextResponse.json({ ok: false, message: 'Akses ditolak' }, { status: 403 });
  const limited = await kinerjaRateLimit(session.userId, 'rima-lampir', 20);
  if (limited) return limited;

  const form = await req.formData().catch(() => null);
  const file = form?.get('file') as File | null;
  const tahunParsed = TahunSchema.safeParse((form?.get('tahun') as string) ?? String(new Date().getFullYear()));
  if (!file) return NextResponse.json({ ok: false, message: 'Tidak ada file yang dipilih.' }, { status: 400 });
  if (!tahunParsed.success) return NextResponse.json({ ok: false, message: 'Tahun tidak valid.' }, { status: 400 });
  if (file.size > MAX_SIZE) return NextResponse.json({ ok: false, message: 'Ukuran file melebihi 10MB.' }, { status: 400 });
  const tahun = tahunParsed.data;

  const buf = Buffer.from(await file.arrayBuffer());
  const sniffed = await sniffMime(buf);
  const okMime = sniffed
    ? (ALLOWED_MIME.includes(sniffed) || sniffed === 'application/zip' || sniffed === 'application/x-cfb')
    : ALLOWED_MIME.includes(file.type);
  if (!okMime) return NextResponse.json({ ok: false, message: 'File harus Excel (.xlsx/.xls).' }, { status: 400 });

  // Deteksi: coba belanja dulu (fitur utama IK-4). Ada baris leaf → realisasi belanja.
  try {
    const realisasi = await buildRealisasiImport(buf, tahun);
    if (realisasi.leafCount > 0) {
      // Audit: parse lampiran = permukaan akses-data → terjejak (silent-fail di helper).
      await writeAuditLog({
        req, eventType: 'RIMA_LAMPIR', userId: session.userId, username: session.username,
        detail: `realisasi tahun=${tahun} leaf=${realisasi.leafCount}`,
      });
      return NextResponse.json({ ok: true, kind: 'realisasi', tahun, data: realisasi.data });
    }
    const pend = await parsePendapatanBuffer(buf);
    if (pend.months.length > 0) {
      await writeAuditLog({
        req, eventType: 'RIMA_LAMPIR', userId: session.userId, username: session.username,
        detail: `pendapatan tahun=${tahun} bulan=${pend.months.length}`,
      });
      return NextResponse.json({ ok: true, kind: 'pendapatan', tahun, data: pend });
    }
    return NextResponse.json({ ok: false, message: 'Aku belum mengenali isi file ini sebagai laporan belanja atau pendapatan.' }, { status: 422 });
  } catch {
    return NextResponse.json({ ok: false, message: 'Gagal membaca isi Excel. Pastikan formatnya benar.' }, { status: 400 });
  }
}
