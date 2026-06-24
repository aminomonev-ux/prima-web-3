import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/security/auth';
import { hasAppAccess } from '@/lib/security/guard';
import { isKinerjaRole, kinerjaRateLimit, TahunSchema, SaveMapBodySchema } from '@/lib/data/kinerja-schemas';
import { sql, withTransaction } from '@/lib/data/db';
import { writeAuditLog } from '@/lib/security/auditlog';
import { buildRealisasiImport } from '@/lib/data/kinerja-import-match';

// IK-4 (Import Realisasi belanja): READ-ONLY match + save-peta. Penulisan
// real_keuangan tetap lewat PUT /api/kinerja/realisasi (Model A'/G33). Guard sama
// dengan endpoint Kinerja lain (G31, L60/L61). Parse di server (G22/G29).
//   POST multipart (file)   → parse + match (peta dulu, lalu fuzzy), grup per sumber
//   POST json {action:save-map} → simpan cocokan terkonfirmasi user (peta tersimpan)
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

  const ct = req.headers.get('content-type') ?? '';

  // ─── Mode SAVE PETA (JSON) — simpan cocokan terkonfirmasi user ──────────────
  if (ct.includes('application/json')) {
    const limited = await kinerjaRateLimit(session.userId, 'realisasi-map', 30); if (limited) return limited;
    // L-1: Zod sentral (sumber enum tolak nilai liar → cegah 500 strict MySQL; G12 pesan ramah)
    const parsed = SaveMapBodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ ok: false, message: 'Data peta tidak valid (cek sumber/tahun/keterangan).' }, { status: 400 });
    const { tahun, pairs } = parsed.data;
    if (pairs.length === 0) return NextResponse.json({ ok: true, saved: 0 });
    // L-1: anti pointer menggantung — hanya simpan pair yang target SSK-nya memang
    // ada sebagai baris Realisasi di tahun itu (sumber kebenaran target = buildRealisasiImport).
    const wanted = [...new Set(pairs.map(p => p.ssk_canonical_id))];
    const existRows = await sql`
      SELECT DISTINCT ssk_canonical_id FROM kinerja_realisasi
       WHERE tahun = ${tahun} AND ssk_canonical_id IN (${wanted})` as { ssk_canonical_id: string }[];
    const validIds = new Set(existRows.map(r => r.ssk_canonical_id));
    const valid = pairs.filter(p => validIds.has(p.ssk_canonical_id));
    if (valid.length === 0) return NextResponse.json({ ok: false, message: 'Target SSK pada peta tidak ditemukan di tahun ini.' }, { status: 400 });
    await withTransaction(async ({ tx }) => {
      for (const p of valid) {
        await tx`
          INSERT INTO kinerja_realisasi_map (tahun, sumber, keterangan_excel, ssk_canonical_id, updated_by)
          VALUES (${tahun}, ${p.sumber}, ${p.keterangan_excel.slice(0, 500)}, ${p.ssk_canonical_id}, ${session.userId})
          ON DUPLICATE KEY UPDATE sumber = VALUES(sumber), ssk_canonical_id = VALUES(ssk_canonical_id), updated_by = VALUES(updated_by)`;
      }
    });
    // L-2: jejak audit permukaan tulis peta (sebelumnya tanpa writeAuditLog)
    await writeAuditLog({ req, eventType: 'KINERJA_SAVE_REALISASI_MAP', userId: session.userId, username: session.username, detail: `tahun=${tahun} pairs=${valid.length}` });
    return NextResponse.json({ ok: true, saved: valid.length });
  }

  // ─── Mode MATCH (multipart file) ────────────────────────────────────────────
  const limited = await kinerjaRateLimit(session.userId, 'realisasi-import', 20); if (limited) return limited;
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

  try {
    const { data } = await buildRealisasiImport(buf, tahun);
    return NextResponse.json({ ok: true, ...data });
  } catch {
    return NextResponse.json({ ok: false, message: 'Gagal membaca isi Excel.' }, { status: 400 });
  }
}
