import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import KinerjaClient from './kinerja-client';
import { sql, queryOne } from '@/lib/data/db';
import type { Role } from '@/types';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export default async function KinerjaPage() {
  const h        = await headers();
  const userId   = h.get('x-user-id');
  const role     = h.get('x-user-role') as Role | null;
  const username = h.get('x-username');
  if (!userId || !role || !username) redirect('/login');

  const row = await queryOne<{ theme_preference: string }>(
    sql`SELECT theme_preference FROM users WHERE id = ${Number(userId)} LIMIT 1`
  );
  const themePreference = (row?.theme_preference ?? 'dark') as 'dark' | 'light';

  return <KinerjaClient userId={Number(userId)} role={role} username={username} themePreference={themePreference} />;
}
