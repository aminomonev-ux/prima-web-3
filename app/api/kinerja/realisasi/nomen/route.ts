import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/security/auth';
import { getNomenRows, saveNomenBatch } from '@/lib/data/kinerja';
import { writeAuditLog } from '@/lib/security/auditlog';
import { isKinerjaRole, kinerjaRateLimit, KinerjaQuerySchema, NomenBodySchema } from '@/lib/data/kinerja-schemas';
import { hasAppAccess } from '@/lib/security/guard';

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
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

  const rows = await getNomenRows(tahun, sumber);
  return NextResponse.json({ ok: true, rows });
}

export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
  if (!(await hasAppAccess(session.userId, session.role, isKinerjaRole))) return NextResponse.json({ ok: false, message: 'Akses ditolak' }, { status: 403 });
  const limited = await kinerjaRateLimit(session.userId, 'save-nomen', 30); if (limited) return limited;

  // C-SEC-2 (Tahap 12): Zod validation untuk body
  const raw = await req.json().catch(() => null);
  const parsed = NomenBodySchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ ok: false, message: 'Data tidak valid: ' + parsed.error.issues[0].message }, { status: 400 });
  const { tahun, sumber, rows } = parsed.data;

  await saveNomenBatch(tahun, sumber, rows, session.userId);

  await writeAuditLog({
    req,
    eventType: 'KINERJA_SAVE_NOMEN',
    userId:    session.userId,
    username:  session.username,
    detail:    `Simpan nomenklatur ${sumber} tahun ${tahun}: ${rows.length} item`,
  });

  return NextResponse.json({ ok: true, saved: rows.length });
}
