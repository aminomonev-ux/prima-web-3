// app/api/iki/[id]/route.ts — detail + save nested (replace-all, CAS)
import { NextRequest, NextResponse } from 'next/server';
import { safeInt } from '@/lib/data/db';
import { writeAuditLog } from '@/lib/security/auditlog';
import { SaveDokumenSchema, ikiRateLimit } from '@/lib/data/iki-schemas';
import {
  getDokumen, saveDokumen,
  IkiVersionConflictError, IkiFinalError, IkiNotFoundError,
} from '@/lib/data/iki';
import { guard } from '../_guard';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard();
  if (!g.ok) return g.res;
  const limited = await ikiRateLimit(g.session.userId, 'detail', 60);
  if (limited) return limited;

  const id = safeInt((await params).id, 0);
  if (id <= 0) return NextResponse.json({ ok: false, message: 'ID tidak valid' }, { status: 400 });
  try {
    const doc = await getDokumen(id);
    if (!doc) return NextResponse.json({ ok: false, message: 'Dokumen tidak ditemukan' }, { status: 404 });
    return NextResponse.json({ ok: true, data: doc });
  } catch (err) {
    console.error('[IKI Detail GET Error]', err);
    return NextResponse.json({ ok: false, message: 'Terjadi kesalahan server.' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard();
  if (!g.ok) return g.res;
  const limited = await ikiRateLimit(g.session.userId, 'save', 30);
  if (limited) return limited;

  const id = safeInt((await params).id, 0);
  if (id <= 0) return NextResponse.json({ ok: false, message: 'ID tidak valid' }, { status: 400 });

  const raw = await req.json().catch(() => null);
  const parsed = SaveDokumenSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, message: 'Data tidak valid: ' + parsed.error.issues[0].message }, { status: 400 });
  }
  try {
    const newVersion = await saveDokumen(id, parsed.data, g.session.userId);
    await writeAuditLog({
      req, eventType: 'IKI_UPDATE', userId: g.session.userId, username: g.session.username,
      detail: `Simpan dokumen IKI id=${id} (${parsed.data.rhk.length} RHK, versi ${newVersion})`,
    });
    return NextResponse.json({ ok: true, version: newVersion });
  } catch (err) {
    if (err instanceof IkiVersionConflictError) {
      return NextResponse.json({ ok: false, code: 'VERSION_CONFLICT', message: err.message }, { status: 409 });
    }
    if (err instanceof IkiFinalError)    return NextResponse.json({ ok: false, message: err.message }, { status: 409 });
    if (err instanceof IkiNotFoundError) return NextResponse.json({ ok: false, message: err.message }, { status: 404 });
    const message = err instanceof Error ? err.message : 'Terjadi kesalahan server.';
    const known = message.includes('tidak ditemukan') || message.includes('atasan');
    if (!known) console.error('[IKI Save Error]', err);
    return NextResponse.json({ ok: false, message: known ? message : 'Terjadi kesalahan server.' }, { status: known ? 400 : 500 });
  }
}
