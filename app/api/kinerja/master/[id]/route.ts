import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/security/auth';
import { safeInt } from '@/lib/data/db';
import { updateMasterRow, deleteMasterRow } from '@/lib/data/kinerja';
import { writeAuditLog } from '@/lib/security/auditlog';
import { isKinerjaRole, kinerjaRateLimit, MasterUpdateBodySchema } from '@/lib/data/kinerja-schemas';
import { hasAppAccess } from '@/lib/security/guard';

const DELETE_ONLY_ROLES = ['SUPER_ADMIN', 'ADMIN']; // hapus master hanya super/admin (lebih ketat dari KINERJA_ALLOWED_ROLES)

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
  if (!(await hasAppAccess(session.userId, session.role, isKinerjaRole))) return NextResponse.json({ ok: false, message: 'Akses ditolak' }, { status: 403 });
  const limited = await kinerjaRateLimit(session.userId, 'update-master', 30); if (limited) return limited;

  // C-BUG-2 (Tahap 12): safeInt guard untuk NaN. /api/.../abc → 400, bukan silent fail.
  const { id: idRaw } = await params;
  const id = safeInt(idRaw, 0);
  if (id <= 0) return NextResponse.json({ ok: false, message: 'ID master tidak valid' }, { status: 400 });

  // C-SEC-2 (Tahap 12): Zod validation untuk body
  const raw = await req.json().catch(() => null);
  const parsed = MasterUpdateBodySchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ ok: false, message: 'Data tidak valid: ' + parsed.error.issues[0].message }, { status: 400 });
  const { nama } = parsed.data;

  await updateMasterRow(id, nama);

  await writeAuditLog({
    req,
    eventType: 'KINERJA_SAVE_MASTER',
    userId:    session.userId,
    username:  session.username,
    detail:    `Update master id=${id}: "${nama}"`,
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
  if (!DELETE_ONLY_ROLES.includes(session.role)) {
    return NextResponse.json({ ok: false, message: 'Hanya SUPER_ADMIN/ADMIN yang dapat menghapus master' }, { status: 403 });
  }
  const limited = await kinerjaRateLimit(session.userId, 'delete-master', 10); if (limited) return limited;

  // C-BUG-2 (Tahap 12): safeInt guard
  const { id: idRaw } = await params;
  const id = safeInt(idRaw, 0);
  if (id <= 0) return NextResponse.json({ ok: false, message: 'ID master tidak valid' }, { status: 400 });

  await deleteMasterRow(id);

  await writeAuditLog({
    req,
    eventType: 'KINERJA_DELETE_MASTER',
    userId:    session.userId,
    username:  session.username,
    detail:    `Hapus master id=${id}`,
  });

  return NextResponse.json({ ok: true });
}
