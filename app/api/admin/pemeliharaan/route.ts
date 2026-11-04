// /api/admin/pemeliharaan — "Pemeliharaan & keluar otomatis" (SUPER_ADMIN saja, sama dengan
// Broadcast & emergency logout). GET = keadaan jadwal; POST = kirim / batalkan / buka login.
// Konsep: docs/CONCEPT-pemeliharaan-keluar.md
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/security/auth';
import { checkRateLimit } from '@/lib/security/ratelimit';
import { writeAuditLog } from '@/lib/security/auditlog';
import { PILIHAN_JEDA_MENIT, ringkasJadwal, jamDari } from '@/lib/security/jadwal-keluar';
import {
  bacaJadwalSekarang, hitungSesiLain, kirimJadwalKeluar, batalkanJadwalKeluar,
  bukaLoginKeluar, JadwalKeluarError,
} from '@/lib/security/jadwal-keluar-data';

export const dynamic = 'force-dynamic';

const BodySchema = z.discriminatedUnion('aksi', [
  z.object({
    aksi:        z.literal('kirim'),
    pesan:       z.string().trim().min(1, 'Pesan wajib diisi.').max(500, 'Pesan maksimal 500 karakter.'),
    menit:       z.number().int().refine(n => (PILIHAN_JEDA_MENIT as readonly number[]).includes(n), 'Jeda tidak dikenal.'),
    tahan_login: z.boolean(),
  }),
  z.object({ aksi: z.literal('batalkan') }),
  z.object({ aksi: z.literal('buka_login') }),
]);

async function sesiSuperAdmin() {
  const session = await getSession();
  return session?.role === 'SUPER_ADMIN' ? session : null;
}

export async function GET() {
  const session = await sesiSuperAdmin();
  if (!session) return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 403 });
  const { jadwal, sekarang } = await bacaJadwalSekarang();
  return NextResponse.json({
    ok: true,
    jadwal: ringkasJadwal(jadwal, sekarang),
    sesi_lain_aktif: await hitungSesiLain(session.sessionId ?? '', jadwal),
  });
}

export async function POST(req: NextRequest) {
  const session = await sesiSuperAdmin();
  if (!session) return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 403 });
  const rl = await checkRateLimit(`pemeliharaan-admin:${session.userId}`, 10, 600);
  if (!rl.allowed) {
    return NextResponse.json({ ok: false, message: `Terlalu sering. Coba lagi dalam ${rl.resetIn} detik.` }, { status: 429 });
  }
  let raw: unknown;
  try { raw = await req.json(); } catch { raw = null; }
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, message: parsed.error.issues[0]?.message ?? 'Isian tidak valid.' }, { status: 400 });
  }
  const b = parsed.data;
  try {
    let detail: string;
    if (b.aksi === 'kirim') {
      const j = await kirimJadwalKeluar({
        pesan: b.pesan, menit: b.menit, tahanLogin: b.tahan_login,
        oleh: session.username, sesiPengirim: session.sessionId ?? '',
      });
      detail = `Kirim: keluar otomatis pukul ${jamDari(j.batas)} (jeda ${b.menit} menit)`
        + (j.tahan_login ? `, login ditahan sampai ${jamDari(j.login_dibuka)}` : ', login tidak ditahan')
        + `: "${b.pesan.slice(0, 80)}"`;
    } else if (b.aksi === 'batalkan') {
      const j = await batalkanJadwalKeluar();
      detail = `Dibatalkan sebelum waktunya (semula pukul ${jamDari(j.batas)})`;
    } else {
      const j = await bukaLoginKeluar();
      detail = `Login dibuka pukul ${jamDari(j.login_dibuka)}`;
    }
    await writeAuditLog({ req, eventType: 'PEMELIHARAAN_KELUAR', userId: session.userId, username: session.username, detail });
    const { jadwal, sekarang } = await bacaJadwalSekarang();
    return NextResponse.json({ ok: true, jadwal: ringkasJadwal(jadwal, sekarang) });
  } catch (e) {
    if (e instanceof JadwalKeluarError) return NextResponse.json({ ok: false, message: e.message }, { status: e.status });
    throw e;
  }
}
