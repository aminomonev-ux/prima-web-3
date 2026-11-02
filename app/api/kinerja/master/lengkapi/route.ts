// POST /api/kinerja/master/lengkapi — buat entri Master yang belum ada untuk nama yang
// dipakai di Rekening & RKO tahun itu (Impor Rekening/RKO tidak membuat entri Master).
// Hanya MENAMBAH; `dry` = pratinjau untuk dialog. Aturannya di lib/kinerja/master-ubah.ts.

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/security/auth';
import { lengkapiMasterDariData } from '@/lib/data/kinerja-master-ubah';
import { writeAuditLog } from '@/lib/security/auditlog';
import { isKinerjaRole, kinerjaRateLimit, MasterTahunAksiBodySchema } from '@/lib/data/kinerja-schemas';
import { hasAppAccess } from '@/lib/security/guard';
import { kinerjaMati } from '../../_guard';

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
  // T1: sakelar maintenance — 503 kalau modul dimatikan admin (SUPER_ADMIN tembus).
  const mati = await kinerjaMati(session.role); if (mati) return mati;
  if (!(await hasAppAccess(session.userId, session.role, isKinerjaRole))) return NextResponse.json({ ok: false, message: 'Akses ditolak' }, { status: 403 });

  const raw = await req.json().catch(() => null);
  const parsed = MasterTahunAksiBodySchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ ok: false, message: 'Data tidak valid: ' + parsed.error.issues[0].message }, { status: 400 });
  const { tahun, dry } = parsed.data;

  const limited = await kinerjaRateLimit(session.userId, 'lengkapi-master', 10);
  if (limited) return limited;

  const hasil = await lengkapiMasterDariData(tahun, { userId: session.userId, dry });

  if (!dry && hasil.baru.length > 0) {
    const per = (t: string) => hasil.baru.filter(e => e.tipe === t).length;
    await writeAuditLog({
      req,
      eventType: 'KINERJA_SAVE_MASTER',
      userId:    session.userId,
      username:  session.username,
      detail:    `Lengkapi master tahun ${tahun} dari Rekening & RKO: +${per('program')} program, +${per('kegiatan')} kegiatan, `
        + `+${per('subkegiatan')} sub kegiatan, +${per('uraian_ssk')} uraian SSK`,
    });
  }

  return NextResponse.json({ ok: true, ...hasil });
}
