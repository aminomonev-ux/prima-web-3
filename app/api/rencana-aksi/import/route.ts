// app/api/rencana-aksi/import/route.ts
// Import matriks Rencana Aksi dari file (.xlsx/.csv/.pdf digital) — 2 langkah:
//   step=preview  multipart → parse saja, TIDAK menulis DB
//   step=commit   JSON      → tulis baris yang sudah dikonfirmasi user di modal
// Khusus ADMIN/SUPER_ADMIN (sekelas Duplikasi Tahun — operasi borongan).

import { NextRequest, NextResponse } from 'next/server';
import { writeAuditLog } from '@/lib/security/auditlog';
import {
  ImportColOverridesSchema,
  ImportCommitSchema,
  rencanaAksiRateLimit,
} from '@/lib/data/rencana-aksi-schemas';
import { parseRenaksiFile, type ColOverrides } from '@/lib/renaksi/import-renaksi';
import { commitImportRenaksi } from '@/lib/renaksi/import-data';
import { guard } from '../_guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_SIZE = 8 * 1024 * 1024;
const ADMIN_ROLES = ['ADMIN', 'SUPER_ADMIN'];

// L38/G22: percaya magic-number, bukan file.type dari klien
async function sniffMime(buf: Buffer): Promise<string | null> {
  const mod = await import('file-type');
  const r = await mod.fileTypeFromBuffer(buf);
  return r?.mime ?? null;
}

const ALLOWED_MIME: Record<string, string[]> = {
  '.xlsx': ['application/zip', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  '.pdf': ['application/pdf'],
};

export async function POST(req: NextRequest) {
  const g = await guard();
  if (!g.ok) return g.response;
  if (!ADMIN_ROLES.includes(g.session.role)) {
    return NextResponse.json({ ok: false, error: 'Import hanya untuk Admin.' }, { status: 403 });
  }

  const step = new URL(req.url).searchParams.get('step') ?? 'preview';
  if (step !== 'preview' && step !== 'commit') {
    return NextResponse.json({ ok: false, error: 'step harus preview atau commit' }, { status: 400 });
  }

  const limited = await rencanaAksiRateLimit(g.session.userId, `import-${step}`, step === 'commit' ? 6 : 12);
  if (limited) return limited;

  if (step === 'commit') return handleCommit(req, g.session);
  return handlePreview(req, g.session);
}

async function handlePreview(req: NextRequest, session: { userId: number; username: string }) {
  const form = await req.formData().catch(() => null);
  const file = form?.get('file') as File | null;
  if (!file) return NextResponse.json({ ok: false, error: 'Tidak ada file yang dipilih.' }, { status: 400 });
  if (file.size > MAX_SIZE) return NextResponse.json({ ok: false, error: 'Ukuran file melebihi 8MB.' }, { status: 400 });

  const name = (file.name ?? '').toLowerCase();
  const ext = ['.xlsx', '.csv', '.pdf'].find(e => name.endsWith(e));
  if (!ext) return NextResponse.json({ ok: false, error: 'Format file harus .xlsx, .csv, atau .pdf.' }, { status: 400 });

  const buf = Buffer.from(await file.arrayBuffer());
  const expected = ALLOWED_MIME[ext];
  if (expected) {
    const sniffed = await sniffMime(buf);
    if (!sniffed || !expected.includes(sniffed)) {
      return NextResponse.json({ ok: false, error: `Isi file tidak cocok dengan ekstensi ${ext}.` }, { status: 400 });
    }
  }

  let overrides: ColOverrides | undefined;
  const ovrRaw = form?.get('overrides');
  if (typeof ovrRaw === 'string' && ovrRaw) {
    let parsedOvr: unknown;
    try { parsedOvr = JSON.parse(ovrRaw); } catch {
      return NextResponse.json({ ok: false, error: 'Pemetaan kolom tidak valid.' }, { status: 400 });
    }
    const check = ImportColOverridesSchema.safeParse(parsedOvr);
    if (!check.success) return NextResponse.json({ ok: false, error: 'Pemetaan kolom tidak valid.' }, { status: 400 });
    overrides = check.data as ColOverrides;
  }

  try {
    const result = await parseRenaksiFile(buf, file.name, overrides ?? {});
    await writeAuditLog({
      req,
      eventType: 'RA_IMPORT_PREVIEW',
      userId: session.userId,
      username: session.username,
      detail: `Preview import "${file.name}" (${result.kind}): ${result.rows.length} baris — `
        + Object.entries(result.levelCount).filter(([, n]) => n > 0).map(([lv, n]) => `${lv}:${n}`).join(' '),
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const error = e instanceof Error ? e.message : 'Gagal membaca isi file.';
    return NextResponse.json({ ok: false, error }, { status: 400 });
  }
}

async function handleCommit(req: NextRequest, session: { userId: number; username: string }) {
  const raw = await req.json().catch(() => null);
  const parsed = ImportCommitSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: 'Data tidak valid: ' + parsed.error.issues[0].message },
      { status: 400 },
    );
  }

  try {
    const { tahun, mode, rows } = parsed.data;
    const result = await commitImportRenaksi(tahun, mode, rows, session.userId);
    await writeAuditLog({
      req,
      eventType: 'RA_IMPORT_COMMIT',
      userId: session.userId,
      username: session.username,
      detail: `Import ${tahun} mode=${mode}: ${result.disimpan} tersimpan `
        + `(${result.ditambah} baru, ${result.diperbarui} diperbarui, ${result.dilewati} dilewati, ${result.ditahan.length} ditahan) — `
        + Object.entries(result.perLevel).map(([lv, n]) => `${lv}:${n}`).join(' '),
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    console.error('[RA IMPORT COMMIT]', e);
    return NextResponse.json({ ok: false, error: 'Gagal menyimpan hasil import.' }, { status: 500 });
  }
}
