import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/security/auth';
import { getSskRows, saveSskBatch, getKinerjaVersion, KinerjaVersionConflictError, KinerjaReplaceSafetyError } from '@/lib/data/kinerja';
import { writeAuditLog } from '@/lib/security/auditlog';
import { isKinerjaRole, kinerjaRateLimit, KinerjaQuerySchema, SskBodySchema, jejakPulihkan } from '@/lib/data/kinerja-schemas';
import { hasAppAccess } from '@/lib/security/guard';
import { kinerjaMati } from '../_guard';
import { hitungDinolkan } from '@/lib/kinerja/nol-kan';

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
  // T1: sakelar maintenance — 503 kalau modul dimatikan admin (SUPER_ADMIN tembus).
  const mati = await kinerjaMati(session.role); if (mati) return mati;
  // C-SEC-1 (Tahap 12): read endpoint juga butuh role guard — sama dengan PUT.
  if (!(await hasAppAccess(session.userId, session.role, isKinerjaRole))) return NextResponse.json({ ok: false, message: 'Akses ditolak' }, { status: 403 });

  // C-WORK-1/2 (Tahap 12): validate tahun range + sumber enum via Zod
  const { searchParams } = new URL(req.url);
  const q = KinerjaQuerySchema.safeParse({
    tahun:      searchParams.get('tahun')      ?? undefined,
    sumber:     searchParams.get('sumber')     ?? undefined,
    versi_tipe: searchParams.get('versi_tipe') ?? undefined,
    versi_seq:  searchParams.get('versi_seq')  ?? undefined,
  });
  if (!q.success) return NextResponse.json({ ok: false, message: 'Parameter tidak valid: ' + q.error.issues[0].message }, { status: 400 });
  const tahun     = q.data.tahun ?? new Date().getFullYear().toString();
  const sumber    = q.data.sumber ?? 'GAJI';
  const versiTipe = q.data.versi_tipe ?? 'MURNI';
  const versiSeq  = q.data.versi_seq  ?? 0;

  const rows = await getSskRows(tahun, sumber, versiTipe, versiSeq);
  const version = await getKinerjaVersion('kinerja_ssk', `${tahun}:${sumber}:${versiTipe}:${versiSeq}`);
  return NextResponse.json({ ok: true, rows, versi: { tipe: versiTipe, seq: versiSeq }, version });
}

export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
  // T1: sakelar maintenance — 503 kalau modul dimatikan admin (SUPER_ADMIN tembus).
  const mati = await kinerjaMati(session.role); if (mati) return mati;
  if (!(await hasAppAccess(session.userId, session.role, isKinerjaRole))) return NextResponse.json({ ok: false, message: 'Akses ditolak' }, { status: 403 });
  const limited = await kinerjaRateLimit(session.userId, 'save-ssk', 30); if (limited) return limited;

  // C-SEC-2 (Tahap 12): Zod validation untuk body batch
  const raw = await req.json().catch(() => null);
  const parsed = SskBodySchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ ok: false, message: 'Data tidak valid: ' + parsed.error.issues[0].message }, { status: 400 });
  const { tahun, sumber, rows, versi_tipe, versi_seq, expected_version, force, asal_pulihkan } = parsed.data;
  const versiTipe = versi_tipe ?? 'MURNI';
  const versiSeq  = versi_seq  ?? 0;

  try {
    await saveSskBatch(tahun, sumber, rows, session.userId, versiTipe, versiSeq, expected_version, force ?? false);
  } catch (err) {
    // V3-6: optimistic-lock conflict → 409 dengan code agar client bisa auto-reload.
    if (err instanceof KinerjaVersionConflictError) {
      return NextResponse.json({ ok: false, code: 'VERSION_CONFLICT', message: err.message, actual: err.actual }, { status: 409 });
    }
    if (err instanceof KinerjaReplaceSafetyError) {
      return NextResponse.json(
        { ok: false, code: 'PENURUNAN_DRASTIS', message: err.message, existing: err.existing, incoming: err.incoming },
        { status: 409 },
      );
    }
    const msg = err instanceof Error ? err.message : 'Gagal menyimpan';
    return NextResponse.json({ ok: false, message: msg }, { status: 409 });
  }

  const version = await getKinerjaVersion('kinerja_ssk', `${tahun}:${sumber}:${versiTipe}:${versiSeq}`);
  await writeAuditLog({
    req,
    eventType: 'KINERJA_SAVE_SSK',
    userId:    session.userId,
    username:  session.username,
    // Nol-kan sekarang berhenti di FORM, jadi peristiwanya tidak lagi punya
    // event audit sendiri (`KINERJA_SSK_NULLIFIED` dibuang bersama routenya).
    // Jejaknya pindah ke sini — kalau tidak, "berapa baris dimatikan" lenyap
    // dari catatan, dan yang hilang bukan cuma kerapian: itu satu-satunya cara
    // menjawab kenapa pagu setahun tiba-tiba mengecil.
    detail:    `Simpan SSK ${sumber} ${tahun} ${versiTipe}-${versiSeq}: ${rows.length} baris`
      + (hitungDinolkan(rows) > 0 ? ` (${hitungDinolkan(rows)} dinol-kan)` : '')
      + jejakPulihkan(asal_pulihkan),
  });

  return NextResponse.json({ ok: true, saved: rows.length, versi: { tipe: versiTipe, seq: versiSeq }, version });
}
