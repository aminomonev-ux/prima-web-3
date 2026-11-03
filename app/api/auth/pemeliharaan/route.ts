// GET /api/auth/pemeliharaan — ditanya tiap tab PRIMA ±30 detik: ada hitung mundur keluar otomatis?
//
// SENGAJA tidak memperpanjang sesi (tanpa createToken / last_active): kalau memperpanjang, komputer
// yang ditinggal dengan tab terbuka tidak akan pernah kena batas idle 60 menit.
// Konsep: docs/CONCEPT-pemeliharaan-keluar.md
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSession, COOKIE_NAME } from '@/lib/security/auth';
import { checkRateLimit } from '@/lib/security/ratelimit';
import { alasanSesiDitolak, statusTabSesi } from '@/lib/security/jadwal-keluar-data';

export const dynamic = 'force-dynamic';

export async function GET() {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ ok: false, message: 'Sesi berakhir', alasan: await alasanSesiDitolak(token) }, { status: 401 });
  }
  // Beberapa tab × tiap 30 detik + tiap tab kembali dibuka.
  const rl = await checkRateLimit(`pemeliharaan:${session.userId}`, 60, 60);
  if (!rl.allowed) {
    return new NextResponse(null, { status: 429, headers: { 'Retry-After': String(rl.resetIn) } });
  }
  if (!session.sessionId) return NextResponse.json({ ok: true, aktif: false });
  const { status } = await statusTabSesi(session.sessionId);
  return NextResponse.json({ ok: true, ...status });
}
