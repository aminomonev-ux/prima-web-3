// app/api/iki/route.ts — list / create / delete dokumen IKI
import { NextRequest, NextResponse } from 'next/server';
import { safeInt } from '@/lib/data/db';
import { writeAuditLog } from '@/lib/security/auditlog';
import { CreateDokumenSchema, TahunSchema, ikiRateLimit } from '@/lib/data/iki-schemas';
import { listDokumen, createDokumen, deleteDokumen, IkiFinalError, IkiNotFoundError } from '@/lib/data/iki';
import { guard } from './_guard';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const g = await guard();
  if (!g.ok) return g.res;
  const limited = await ikiRateLimit(g.session.userId, 'list', 60);
  if (limited) return limited;

  const tahunRaw = new URL(req.url).searchParams.get('tahun');
  let tahun: string | undefined;
  if (tahunRaw) {
    const parsed = TahunSchema.safeParse(tahunRaw);
    if (!parsed.success) return NextResponse.json({ ok: false, message: 'Tahun tidak valid' }, { status: 400 });
    tahun = parsed.data;
  }
  try {
    const rows = await listDokumen(tahun);
    return NextResponse.json({ ok: true, data: rows });
  } catch (err) {
    console.error('[IKI GET Error]', err);
    return NextResponse.json({ ok: false, message: 'Terjadi kesalahan server.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const g = await guard();
  if (!g.ok) return g.res;
  const limited = await ikiRateLimit(g.session.userId, 'create', 20);
  if (limited) return limited;

  const raw = await req.json().catch(() => null);
  const parsed = CreateDokumenSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, message: 'Data tidak valid: ' + parsed.error.issues[0].message }, { status: 400 });
  }
  try {
    const id = await createDokumen(parsed.data, g.session.userId);
    await writeAuditLog({
      req, eventType: 'IKI_CREATE', userId: g.session.userId, username: g.session.username,
      detail: `Buat dokumen IKI id=${id} ${parsed.data.jabatan} (${parsed.data.nama}) tahun ${parsed.data.tahun} varian ${parsed.data.varian}`,
    });
    return NextResponse.json({ ok: true, id });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Terjadi kesalahan server.';
    const isDup = message.includes('sudah ada');
    if (!isDup) console.error('[IKI POST Error]', err);
    return NextResponse.json({ ok: false, message }, { status: isDup ? 409 : 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const g = await guard();
  if (!g.ok) return g.res;
  const limited = await ikiRateLimit(g.session.userId, 'delete', 20);
  if (limited) return limited;

  const id = safeInt(new URL(req.url).searchParams.get('id'), 0);
  if (id <= 0) return NextResponse.json({ ok: false, message: 'ID tidak valid' }, { status: 400 });
  try {
    await deleteDokumen(id);
    await writeAuditLog({
      req, eventType: 'IKI_DELETE', userId: g.session.userId, username: g.session.username,
      detail: `Hapus dokumen IKI id=${id}`,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof IkiFinalError) return NextResponse.json({ ok: false, message: err.message }, { status: 409 });
    if (err instanceof IkiNotFoundError) return NextResponse.json({ ok: false, message: err.message }, { status: 404 });
    console.error('[IKI DELETE Error]', err);
    return NextResponse.json({ ok: false, message: 'Terjadi kesalahan server.' }, { status: 500 });
  }
}
