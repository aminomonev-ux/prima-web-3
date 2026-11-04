import { headers, cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { SessionPayload, Role } from '@/types';
import { getSession, COOKIE_NAME } from '@/lib/security/auth';
import { alasanSesiDitolak } from '@/lib/security/jadwal-keluar-data';
import BfcacheGuard from '@/components/guards/BfcacheGuard';
import SessionKeepAlive from '@/components/guards/SessionKeepAlive';
import PenjagaPemeliharaan from '@/components/guards/PenjagaPemeliharaan';
import SentinelProvider from '@/components/sentinel/SentinelProvider';
import { LampirProvider } from '@/lib/sentinel/lampir-store';
import ThemeInit from '@/components/ui/ThemeInit';
import { sql, queryOne } from '@/lib/data/db';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const h        = await headers();
  const userId   = h.get('x-user-id');
  const role     = h.get('x-user-role');
  const username = h.get('x-username');

  if (!userId || !role || !username) redirect('/login');

  // Proxy hanya menilai token (tanda tangan, umur, diam) — ia tidak bisa bertanya ke DB. Tanpa ini sesi
  // yang dicabut admin, akun NONAKTIF, dan sesi yang dikeluarkan pemeliharaan tetap membuka layar yang
  // hanya membaca x-user-* (menu, BLUD, Dashboard, …) sampai tokennya kedaluwarsa. Layout tidak dirender
  // ulang saat berpindah halaman di tab yang sudah terbuka; sisi itu dijaga API (getSession) dan ping
  // SessionKeepAlive. Token dibaca dulu: alasannya dinilai dari token yang ditolak.
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!(await getSession())) {
    redirect((await alasanSesiDitolak(token)) === 'PEMELIHARAAN' ? '/login?reason=pemeliharaan' : '/login');
  }

  const session: SessionPayload = {
    userId:   Number(userId),
    username: username,
    role:     role as Role,
    email:    '',
  };
  void session;

  // Fetch theme preference + nama tampilan sekali di layout — berlaku untuk semua halaman
  const row = await queryOne<{ theme_preference: string; nama_lengkap: string | null }>(
    sql`SELECT theme_preference, nama_lengkap FROM users WHERE id = ${Number(userId)} LIMIT 1`
  );
  const themePreference = (row?.theme_preference ?? 'dark') as 'dark' | 'light';
  // Nama sapaan Rima: nama_lengkap kalau ada, fallback username
  const displayName = (row?.nama_lengkap?.trim() || username);

  return (
    <>
      <ThemeInit themePreference={themePreference} />
      <BfcacheGuard userId={Number(userId)} />
      <SessionKeepAlive />
      <PenjagaPemeliharaan />
      {/* RIMA F1: bot pengawas di-mount SEKALI untuk seluruh dashboard (CONCEPT §8).
          role diteruskan untuk navigasi sadar-akses (F5b, G18).
          LampirProvider (§23): RAM store hasil parse lampiran chat — di ATAS Sentinel
          (RimaChat) DAN children (modul tujuan) supaya bertahan lintas-navigasi SPA. */}
      <LampirProvider>
        <SentinelProvider role={role as Role} userName={displayName}>{children}</SentinelProvider>
      </LampirProvider>
    </>
  );
}