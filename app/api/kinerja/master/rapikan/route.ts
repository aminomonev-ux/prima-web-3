// POST /api/kinerja/master/rapikan — buang bintang penanda tingkat ("PROGRAM X ***") dari
// nama Master, Rekening, RKO (semua versi), dan Realisasi satu tahun; entri Master yang
// jadi kembar digabung. `dry` = pratinjau untuk dialog. Aturannya di lib/kinerja/master-ubah.ts.

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/security/auth';
import { rapikanBintangMaster } from '@/lib/data/kinerja-master-ubah';
import { writeAuditLog } from '@/lib/security/auditlog';
import { isKinerjaRole, kinerjaRateLimit, MasterTahunAksiBodySchema, bolehHapusMaster } from '@/lib/data/kinerja-schemas';
import { hasAppAccess } from '@/lib/security/guard';
import { kinerjaMati } from '../../_guard';

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
  // T1: sakelar maintenance — 503 kalau modul dimatikan admin (SUPER_ADMIN tembus).
  const mati = await kinerjaMati(session.role); if (mati) return mati;
  if (!(await hasAppAccess(session.userId, session.role, isKinerjaRole))) return NextResponse.json({ ok: false, message: 'Akses ditolak' }, { status: 403 });
  // Entri kembar dihapus — sama beratnya dengan hapus master.
  if (!bolehHapusMaster(session.role)) {
    return NextResponse.json({ ok: false, message: 'Rapikan Bintang menggabungkan entri Master — hanya SUPER_ADMIN/ADMIN.' }, { status: 403 });
  }

  const raw = await req.json().catch(() => null);
  const parsed = MasterTahunAksiBodySchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ ok: false, message: 'Data tidak valid: ' + parsed.error.issues[0].message }, { status: 400 });
  const { tahun, dry } = parsed.data;

  const limited = await kinerjaRateLimit(session.userId, 'rapikan-master', 10);
  if (limited) return limited;

  const hasil = await rapikanBintangMaster(tahun, { userId: session.userId, dry });

  if (!dry) {
    const d = hasil.data;
    await writeAuditLog({
      req,
      eventType: 'KINERJA_SAVE_MASTER',
      userId:    session.userId,
      username:  session.username,
      detail:    `Rapikan bintang master tahun ${tahun}: ${hasil.master_tulis} entri diubah, ${hasil.master_hapus} entri kembar digabung`
        + `; ikut dirapikan: rekening ${d.rekening}, RKO ${d.rko.reduce((n, v) => n + v.baris, 0)}, realisasi ${d.realisasi}`
        + (hasil.kembar_rekening ? `; ${hasil.kembar_rekening} rekening jadi bernama kembar` : ''),
    });
  }

  return NextResponse.json({ ok: true, ...hasil });
}
