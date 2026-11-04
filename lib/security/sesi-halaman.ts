// lib/security/sesi-halaman.ts — sesi untuk server component (halaman, layout, penjaga modul).
// Proxy hanya menilai token (tanda tangan, umur, diam) dan tidak bisa bertanya ke DB, jadi sesi yang
// dicabut admin, akun NONAKTIF, dan sesi yang dikeluarkan pemeliharaan baru ketahuan di getSession.
// Layout bersama TIDAK dirender ulang saat berpindah halaman di tab yang sudah terbuka — karena itu
// tiap HALAMAN memanggil fungsi ini juga, bukan layout saja (dijaga `scripts/test-sesi-halaman.mts`).
import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getSession, COOKIE_NAME } from './auth';
import { alasanSesiDitolak } from './jadwal-keluar-data';
import type { SessionPayload } from '@/types';

/** `cache`: satu kueri per permintaan walau layout, halaman, dan penjaga modul sama-sama memanggilnya. */
export const pastikanSesiHalaman = cache(async (): Promise<SessionPayload> => {
  // Token dibaca dulu: alasannya dinilai dari token yang ditolak (getSession membuang cookie-nya).
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  const sesi = await getSession();
  if (!sesi) redirect((await alasanSesiDitolak(token)) === 'PEMELIHARAAN' ? '/login?reason=pemeliharaan' : '/login');
  return sesi;
});
