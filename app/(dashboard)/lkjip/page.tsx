import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { sql, queryOne } from '@/lib/data/db';
import { isLkjipRole } from '@/lib/lkjip/schemas';
import { listDokumen } from '@/lib/lkjip/data';
import LkjipClient from './lkjip-client';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export default async function LkjipPage() {
  const h = await headers();
  const userId   = h.get('x-user-id');
  const role     = h.get('x-user-role');
  const username = h.get('x-username');
  if (!userId || !role || !username) redirect('/login');

  const row = await queryOne<{ app_access: string[] | null; theme_preference: string }>(
    sql`SELECT app_access, theme_preference FROM users WHERE id = ${Number(userId)} LIMIT 1`,
  );
  if (!isLkjipRole(role, row?.app_access ?? null)) redirect('/menu');

  const initial = await listDokumen({ page: 1, limit: 50 });
  const themePreference = (row?.theme_preference ?? 'dark') as 'dark' | 'light';

  return (
    <LkjipClient
      username={username}
      role={role}
      themePreference={themePreference}
      initialRows={initial.rows}
    />
  );
}
