import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/security/auth';
import { getMasterRows, createMasterRow } from '@/lib/data/kinerja';
import { writeAuditLog } from '@/lib/security/auditlog';
import { isKinerjaRole, kinerjaRateLimit, KinerjaQuerySchema, MasterCreateBodySchema } from '@/lib/data/kinerja-schemas';
import { hasAppAccess } from '@/lib/security/guard';

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
  // C-SEC-1 (Tahap 12): read endpoint juga butuh role guard — sama dengan POST.
  if (!(await hasAppAccess(session.userId, session.role, isKinerjaRole))) return NextResponse.json({ ok: false, message: 'Akses ditolak' }, { status: 403 });

  // C-WORK-1/2 (Tahap 12): validate tahun range + tipe enum via Zod
  const { searchParams } = new URL(req.url);
  const q = KinerjaQuerySchema.safeParse({
    tahun:  searchParams.get('tahun') ?? undefined,
    tipe:   searchParams.get('tipe')  ?? undefined,
    sumber: searchParams.get('sumber') ?? undefined,
  });
  if (!q.success) return NextResponse.json({ ok: false, message: 'Parameter tidak valid: ' + q.error.issues[0].message }, { status: 400 });
  const tahun  = q.data.tahun ?? new Date().getFullYear().toString();
  const tipe   = q.data.tipe ?? 'program';
  const sumber = q.data.sumber ?? null;

  const rows = await getMasterRows(tahun, tipe, sumber);
  return NextResponse.json({ ok: true, rows });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
  if (!(await hasAppAccess(session.userId, session.role, isKinerjaRole))) return NextResponse.json({ ok: false, message: 'Akses ditolak' }, { status: 403 });
  const limited = await kinerjaRateLimit(session.userId, 'save-master', 30); if (limited) return limited;

  // C-SEC-2 (Tahap 12): Zod validation untuk body
  const raw = await req.json().catch(() => null);
  const parsed = MasterCreateBodySchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ ok: false, message: 'Data tidak valid: ' + parsed.error.issues[0].message }, { status: 400 });
  const { tahun, tipe, nama, sumber, program_ref, kegiatan_ref, subkegiatan_ref } = parsed.data;

  const id = await createMasterRow(tahun, tipe, nama, sumber ?? null, session.userId, program_ref ?? null, kegiatan_ref ?? null, subkegiatan_ref ?? null);

  await writeAuditLog({
    req,
    eventType: 'KINERJA_SAVE_MASTER',
    userId:    session.userId,
    username:  session.username,
    detail:    `Tambah master ${tipe}${sumber ? ` [${sumber}]` : ''}: "${nama}" (tahun ${tahun})`,
  });

  return NextResponse.json({ ok: true, id });
}
