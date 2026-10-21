// app/api/iki/templat/route.ts — templat tabel varian CUSTOM (docs/CONCEPT-iki-custom.md §4)
// GET daftar · POST simpan bentuk tabel jadi templat · PATCH ganti nama · DELETE ?id=
// Hak = hak modul IKI (keputusan pemilik #2): pagarnya `guard()` yang sama, termasuk sakelar maintenance.
import { NextRequest, NextResponse } from 'next/server';
import { safeInt } from '@/lib/data/db';
import { writeAuditLog } from '@/lib/security/auditlog';
import { TemplatBuatSchema, TemplatUbahSchema, ikiRateLimit } from '@/lib/data/iki-schemas';
import {
  listTemplat, buatTemplat, ubahNamaTemplat, hapusTemplat,
  IkiTemplatTidakAdaError, IkiTemplatNamaDipakaiError,
} from '@/lib/data/iki';
import { guard } from '../_guard';

export const dynamic = 'force-dynamic';

function galatDikenal(err: unknown): NextResponse | null {
  if (err instanceof IkiTemplatTidakAdaError) return NextResponse.json({ ok: false, message: err.message }, { status: 404 });
  if (err instanceof IkiTemplatNamaDipakaiError) return NextResponse.json({ ok: false, message: err.message }, { status: 409 });
  return null;
}

export async function GET() {
  const g = await guard();
  if (!g.ok) return g.res;
  const limited = await ikiRateLimit(g.session.userId, 'templat-list', 60);
  if (limited) return limited;
  try {
    return NextResponse.json({ ok: true, rows: await listTemplat() });
  } catch (err) {
    console.error('[IKI Templat GET Error]', err);
    return NextResponse.json({ ok: false, message: 'Terjadi kesalahan server.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const g = await guard();
  if (!g.ok) return g.res;
  const limited = await ikiRateLimit(g.session.userId, 'templat-tulis', 20);
  if (limited) return limited;

  const parsed = TemplatBuatSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, message: 'Data tidak valid: ' + parsed.error.issues[0].message }, { status: 400 });
  }
  try {
    const id = await buatTemplat(parsed.data.nama, parsed.data.payload, g.session.userId);
    await writeAuditLog({
      req, eventType: 'IKI_CREATE', userId: g.session.userId, username: g.session.username,
      detail: `Buat templat tabel IKI id=${id} "${parsed.data.nama}" (${parsed.data.payload.kolom.length} kolom, ${parsed.data.payload.rows.length} baris)`,
    });
    return NextResponse.json({ ok: true, id });
  } catch (err) {
    const dikenal = galatDikenal(err);
    if (dikenal) return dikenal;
    console.error('[IKI Templat POST Error]', err);
    return NextResponse.json({ ok: false, message: 'Terjadi kesalahan server.' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const g = await guard();
  if (!g.ok) return g.res;
  const limited = await ikiRateLimit(g.session.userId, 'templat-tulis', 20);
  if (limited) return limited;

  const parsed = TemplatUbahSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, message: 'Data tidak valid: ' + parsed.error.issues[0].message }, { status: 400 });
  }
  try {
    await ubahNamaTemplat(parsed.data.id, parsed.data.nama, g.session.userId);
    await writeAuditLog({
      req, eventType: 'IKI_UPDATE', userId: g.session.userId, username: g.session.username,
      detail: `Ganti nama templat tabel IKI id=${parsed.data.id} → "${parsed.data.nama}"`,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const dikenal = galatDikenal(err);
    if (dikenal) return dikenal;
    console.error('[IKI Templat PATCH Error]', err);
    return NextResponse.json({ ok: false, message: 'Terjadi kesalahan server.' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const g = await guard();
  if (!g.ok) return g.res;
  const limited = await ikiRateLimit(g.session.userId, 'templat-tulis', 20);
  if (limited) return limited;

  const id = safeInt(new URL(req.url).searchParams.get('id'), 0);
  if (id <= 0) return NextResponse.json({ ok: false, message: 'ID tidak valid' }, { status: 400 });
  try {
    const nama = await hapusTemplat(id);
    await writeAuditLog({
      req, eventType: 'IKI_DELETE', userId: g.session.userId, username: g.session.username,
      detail: `Hapus templat tabel IKI id=${id} "${nama}" (dokumen yang dibuat darinya tidak berubah)`,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const dikenal = galatDikenal(err);
    if (dikenal) return dikenal;
    console.error('[IKI Templat DELETE Error]', err);
    return NextResponse.json({ ok: false, message: 'Terjadi kesalahan server.' }, { status: 500 });
  }
}
