import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/security/auth';
import { getRekeningRows, saveRekeningBatch, KinerjaReplaceSafetyError, KinerjaPerluJalarError } from '@/lib/data/kinerja';
import { jejakJalarRekening } from '@/lib/kinerja/rekening-menjalar';
import { writeAuditLog } from '@/lib/security/auditlog';
import { isKinerjaRole, kinerjaRateLimit, KinerjaQuerySchema, RekeningBodySchema, jejakPulihkan } from '@/lib/data/kinerja-schemas';
import { hasAppAccess } from '@/lib/security/guard';
import { kinerjaMati } from '../_guard';
import { PaguRenaksiTerlampauiError, detailPaguDitembus, jawabPaguTerlampaui } from '@/lib/data/pagu-renaksi-rko';

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
  // T1: sakelar maintenance — 503 kalau modul dimatikan admin (SUPER_ADMIN tembus).
  const mati = await kinerjaMati(session.role); if (mati) return mati;
  // C-SEC-1 (Tahap 12): read endpoint juga butuh role guard — sama dengan PUT.
  if (!(await hasAppAccess(session.userId, session.role, isKinerjaRole))) return NextResponse.json({ ok: false, message: 'Akses ditolak' }, { status: 403 });

  // C-WORK-1/2 (Tahap 12): validate tahun + sumber via Zod
  const { searchParams } = new URL(req.url);
  const q = KinerjaQuerySchema.safeParse({
    tahun:  searchParams.get('tahun')  ?? undefined,
    sumber: searchParams.get('sumber') ?? undefined,
  });
  if (!q.success) return NextResponse.json({ ok: false, message: 'Parameter tidak valid: ' + q.error.issues[0].message }, { status: 400 });
  const tahun  = q.data.tahun ?? new Date().getFullYear().toString();
  const sumber = q.data.sumber ?? 'GAJI';

  const rows = await getRekeningRows(tahun, sumber);
  return NextResponse.json({ ok: true, rows });
}

export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
  // T1: sakelar maintenance — 503 kalau modul dimatikan admin (SUPER_ADMIN tembus).
  const mati = await kinerjaMati(session.role); if (mati) return mati;
  if (!(await hasAppAccess(session.userId, session.role, isKinerjaRole))) return NextResponse.json({ ok: false, message: 'Akses ditolak' }, { status: 403 });
  const limited = await kinerjaRateLimit(session.userId, 'save-rekening', 30); if (limited) return limited;

  // C-SEC-2 (Tahap 12): Zod validation untuk body
  const raw = await req.json().catch(() => null);
  const parsed = RekeningBodySchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ ok: false, message: 'Data tidak valid: ' + parsed.error.issues[0].message }, { status: 400 });
  const { tahun, sumber, rows, force, asal_pulihkan, jalarkan, alasan_pagu_renaksi } = parsed.data;

  let hasil: Awaited<ReturnType<typeof saveRekeningBatch>>;
  try {
    hasil = await saveRekeningBatch(tahun, sumber, rows, session.userId, force ?? false, jalarkan ?? false, alasan_pagu_renaksi ?? null);
  } catch (err) {
    if (err instanceof PaguRenaksiTerlampauiError) return jawabPaguTerlampaui(err, 'message');
    if (err instanceof KinerjaReplaceSafetyError) {
      return NextResponse.json(
        { ok: false, code: 'PENURUNAN_DRASTIS', message: err.message, existing: err.existing, incoming: err.incoming },
        { status: 409 },
      );
    }
    if (err instanceof KinerjaPerluJalarError) {
      return NextResponse.json(
        { ok: false, code: 'PERLU_KONFIRMASI_JALAR', message: err.message, jalaran: err.jalaran },
        { status: 409 },
      );
    }
    throw err;
  }

  await writeAuditLog({
    req,
    eventType: 'KINERJA_SAVE_REKENING',
    userId:    session.userId,
    username:  session.username,
    detail:    `Simpan rekening ${sumber} tahun ${tahun}: ${rows.length} baris`
      + jejakJalarRekening(hasil.jalaran) + jejakPulihkan(asal_pulihkan),
  });
  if (hasil.paguDitembus.length > 0) {
    await writeAuditLog({
      req, eventType: 'PAGU_RENAKSI_DITEMBUS', userId: session.userId, username: session.username,
      detail: `Simpan Rekening ${sumber} ${tahun}: ${detailPaguDitembus(hasil.paguDitembus, alasan_pagu_renaksi)}`,
    });
  }

  return NextResponse.json({ ok: true, saved: rows.length, rows: hasil.rows, jalaran: hasil.jalaran });
}
