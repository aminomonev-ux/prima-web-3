import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import KinerjaClient from './kinerja-client';
import { sql, queryOne } from '@/lib/data/db';
import { isKinerjaRole } from '@/lib/data/kinerja-schemas';
import { hasAppAccess, modulSedangMati } from '@/lib/security/guard';
import type { Role } from '@/types';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export default async function KinerjaPage() {
  const h        = await headers();
  const userId   = h.get('x-user-id');
  const role     = h.get('x-user-role') as Role | null;
  const username = h.get('x-username');
  if (!userId || !role || !username) redirect('/login');
  if (!(await hasAppAccess(Number(userId), role, isKinerjaRole))) redirect('/menu');

  // T1 — sama seperti Renaksi: kartu abu di /menu cuma menutup satu pintu.
  // Mengetik /kinerja langsung tetap tembus sebelum ini. Pagar 18 route API-nya
  // terpisah di app/api/kinerja/_guard.ts — layar dan API tidak saling menumpang.
  if (await modulSedangMati(['app_status_new_econtrolling'], { role })) {
    redirect(`/maintenance?app=${encodeURIComponent('E-Anggaran')}`);
  }

  const row = await queryOne<{ theme_preference: string }>(
    sql`SELECT theme_preference FROM users WHERE id = ${Number(userId)} LIMIT 1`
  );
  const themePreference = (row?.theme_preference ?? 'dark') as 'dark' | 'light';

  return <KinerjaClient userId={Number(userId)} role={role} username={username} themePreference={themePreference} />;
}
