import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/security/auth';
import { getCrrRows, saveCrrBatch, getPendapatanRows, savePendapatanBatch } from '@/lib/data/kinerja';
import { writeAuditLog } from '@/lib/security/auditlog';
import { isKinerjaRole, kinerjaRateLimit, KinerjaQuerySchema, PendapatanBodySchema } from '@/lib/data/kinerja-schemas';
import { hasAppAccess } from '@/lib/security/guard';

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
  // C-SEC-1 (Tahap 12): read endpoint juga butuh role guard — sama dengan PUT.
  if (!(await hasAppAccess(session.userId, session.role, isKinerjaRole))) return NextResponse.json({ ok: false, message: 'Akses ditolak' }, { status: 403 });

  // C-WORK-1/2 (Tahap 12): validate tahun + type enum via Zod
  const { searchParams } = new URL(req.url);
  const q = KinerjaQuerySchema.safeParse({
    tahun: searchParams.get('tahun') ?? undefined,
    type:  searchParams.get('type')  ?? undefined,
  });
  if (!q.success) return NextResponse.json({ ok: false, message: 'Parameter tidak valid: ' + q.error.issues[0].message }, { status: 400 });
  const tahun = q.data.tahun ?? new Date().getFullYear().toString();
  const type  = q.data.type ?? 'crr';

  if (type === 'pendapatan') {
    const rows = await getPendapatanRows(tahun);
    return NextResponse.json({ ok: true, rows });
  }

  const rows = await getCrrRows(tahun);
  return NextResponse.json({ ok: true, rows });
}

export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
  if (!(await hasAppAccess(session.userId, session.role, isKinerjaRole))) return NextResponse.json({ ok: false, message: 'Akses ditolak' }, { status: 403 });
  const limited = await kinerjaRateLimit(session.userId, 'save-pendapatan', 30); if (limited) return limited;

  // C-SEC-2 (Tahap 12): Zod validation untuk body (discriminatedUnion crr|pendapatan)
  const raw = await req.json().catch(() => null);
  const parsed = PendapatanBodySchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ ok: false, message: 'Data tidak valid: ' + parsed.error.issues[0].message }, { status: 400 });

  if (parsed.data.type === 'pendapatan') {
    const { tahun, rows } = parsed.data;
    await savePendapatanBatch(tahun, rows, session.userId);
    await writeAuditLog({
      req,
      eventType: 'KINERJA_SAVE_PENDAPATAN',
      userId:    session.userId,
      username:  session.username,
      detail:    `Simpan realisasi pendapatan tahun ${tahun}: ${rows.length} item`,
    });
    return NextResponse.json({ ok: true, saved: rows.length });
  }

  // crr branch
  const { tahun, rows } = parsed.data;
  await saveCrrBatch(tahun, rows, session.userId);
  await writeAuditLog({
    req,
    eventType: 'KINERJA_SAVE_CRR',
    userId:    session.userId,
    username:  session.username,
    detail:    `Simpan CRR tahun ${tahun}: ${rows.length} bulan`,
  });
  return NextResponse.json({ ok: true, saved: rows.length });
}
