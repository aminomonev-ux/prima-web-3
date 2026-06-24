import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/security/auth';
import { getSskRows, saveSskBatch, getKinerjaVersion, KinerjaVersionConflictError } from '@/lib/data/kinerja';
import { writeAuditLog } from '@/lib/security/auditlog';
import { isKinerjaRole, kinerjaRateLimit, KinerjaQuerySchema, SskBodySchema } from '@/lib/data/kinerja-schemas';
import { hasAppAccess } from '@/lib/security/guard';

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
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
  if (!(await hasAppAccess(session.userId, session.role, isKinerjaRole))) return NextResponse.json({ ok: false, message: 'Akses ditolak' }, { status: 403 });
  const limited = await kinerjaRateLimit(session.userId, 'save-ssk', 30); if (limited) return limited;

  // C-SEC-2 (Tahap 12): Zod validation untuk body batch
  const raw = await req.json().catch(() => null);
  const parsed = SskBodySchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ ok: false, message: 'Data tidak valid: ' + parsed.error.issues[0].message }, { status: 400 });
  const { tahun, sumber, rows, versi_tipe, versi_seq, expected_version } = parsed.data;
  const versiTipe = versi_tipe ?? 'MURNI';
  const versiSeq  = versi_seq  ?? 0;

  try {
    await saveSskBatch(tahun, sumber, rows, session.userId, versiTipe, versiSeq, expected_version);
  } catch (err) {
    // V3-6: optimistic-lock conflict → 409 dengan code agar client bisa auto-reload.
    if (err instanceof KinerjaVersionConflictError) {
      return NextResponse.json({ ok: false, code: 'VERSION_CONFLICT', message: err.message, actual: err.actual }, { status: 409 });
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
    detail:    `Simpan SSK ${sumber} ${tahun} ${versiTipe}-${versiSeq}: ${rows.length} baris`,
  });

  return NextResponse.json({ ok: true, saved: rows.length, versi: { tipe: versiTipe, seq: versiSeq }, version });
}
