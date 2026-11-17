import { NextRequest, NextResponse } from 'next/server';
import { safeInt } from '@/lib/data/db';
import { writeAuditLog } from '@/lib/security/auditlog';
import { DokumenFinalizeSchema, lkjipRateLimit } from '@/lib/lkjip/schemas';
import {
  finalizeDokumen,
  LkjipVersionConflictError, LkjipNotFoundError, LkjipFinalError,
} from '@/lib/lkjip/data';
import { saveVersi } from '@/lib/lkjip/versi';
import { arsipkanDanCatat, LABEL_VERSI_FINAL } from '@/lib/lkjip/arsip-versi';
import { guard } from '../../_guard';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs'; // googleapis & LibreOffice butuh Node runtime

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard();
  if (!g.ok) return g.res;
  const limited = await lkjipRateLimit(g.session.userId, 'finalize', 20); if (limited) return limited;
  const id = safeInt((await params).id, 0);
  if (id <= 0) return NextResponse.json({ ok: false, msg: 'ID tidak valid' }, { status: 400 });
  const raw = await req.json().catch(() => null);
  const parsed = DokumenFinalizeSchema.safeParse({ ...(raw ?? {}), id });
  if (!parsed.success) return NextResponse.json({ ok: false, msg: 'Data tidak valid: ' + parsed.error.issues[0].message }, { status: 400 });
  let hasil: { id: number; canonical_id: string; judul: string; version: number };
  try {
    hasil = await finalizeDokumen(id, parsed.data.expected_version, g.session.userId);
  } catch (err) {
    if (err instanceof LkjipVersionConflictError) return NextResponse.json({ ok: false, code: 'VERSION_CONFLICT', msg: err.message }, { status: 409 });
    if (err instanceof LkjipFinalError)           return NextResponse.json({ ok: false, msg: err.message }, { status: 409 });
    if (err instanceof LkjipNotFoundError)        return NextResponse.json({ ok: false, msg: err.message }, { status: 404 });
    throw err;
  }
  // Versi & identitas ikut ditulis: sesudah dokumen dihapus, baris ini satu-satunya yang
  // bisa menjawab "versi berapa yang dikunci", karena baris dokumennya sudah tiada.
  await writeAuditLog({ req, eventType: 'LKJIP_FINALIZE', userId: g.session.userId, username: g.session.username, detail: `LKJIP finalize id=${hasil.id} ${hasil.canonical_id} "${hasil.judul.slice(0, 80)}" · versi ${hasil.version}` });

  // K7: dokumen FINAL tidak berubah lagi — fotonya + arsip Word & PDF paling berharga. Dokumen sudah terkunci,
  // jadi kegagalan di sini tidak membatalkan Finalisasi; layar menyebutnya.
  let versi: { id: number; versi_no: number } | null = null;
  try {
    versi = await saveVersi(id, LABEL_VERSI_FINAL, g.session.userId);
    await writeAuditLog({ req, eventType: 'LKJIP_VERSI_SAVE', userId: g.session.userId, username: g.session.username, detail: `LKJIP simpan versi ${versi.versi_no} doc=${id} (Finalisasi)` });
  } catch (e) { console.error('[LKJIP versi final]', e); }
  const arsip = versi ? await arsipkanDanCatat(req, g.session, id, versi) : null;
  return NextResponse.json({ ok: true, versi_no: versi?.versi_no ?? null, arsip });
}
