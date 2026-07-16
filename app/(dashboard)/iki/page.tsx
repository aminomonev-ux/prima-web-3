import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { sql, queryOne } from '@/lib/data/db';
import { isIkiRole } from '@/lib/data/iki-schemas';
import { listDokumen } from '@/lib/data/iki';
import IkiClient from './iki-client';
import type { IkiListRow } from './_lib/types';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export default async function IkiPage() {
  const h = await headers();
  const userId   = h.get('x-user-id');
  const role     = h.get('x-user-role');
  const username = h.get('x-username');
  if (!userId || !role || !username) redirect('/login');

  const row = await queryOne<{ app_access: string[] | null; theme_preference: string }>(
    sql`SELECT app_access, theme_preference FROM users WHERE id = ${Number(userId)} LIMIT 1`,
  );
  if (!isIkiRole(role, row?.app_access ?? null)) redirect('/menu');

  const initial = await listDokumen();
  const themePreference = (row?.theme_preference ?? 'dark') as 'dark' | 'light';

  return (
    <IkiClient
      username={username}
      role={role}
      themePreference={themePreference}
      initialRows={initial as IkiListRow[]}
    />
  );
}
