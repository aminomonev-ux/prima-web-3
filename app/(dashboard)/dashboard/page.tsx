import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { sql, queryOne } from '@/lib/data/db';
import { isDashboardRole } from '@/lib/data/dashboard-schemas';
import { getDashboardSummary } from '@/lib/data/dashboard';
import DashboardClient from './dashboard-client';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export default async function DashboardPage() {
  const h = await headers();
  const userId   = h.get('x-user-id');
  const role     = h.get('x-user-role');
  const username = h.get('x-username');
  if (!userId || !role || !username) redirect('/login');

  const row = await queryOne<{ app_access: string[] | null; theme_preference: string }>(
    sql`SELECT app_access, theme_preference FROM users WHERE id = ${Number(userId)} LIMIT 1`,
  );
  if (!isDashboardRole(role, row?.app_access ?? null)) redirect('/menu');

  const tahun = String(new Date().getFullYear());
  const initialData = await getDashboardSummary(tahun);
  const themePreference = (row?.theme_preference ?? 'dark') as 'dark' | 'light';

  return (
    <DashboardClient
      username={username}
      role={role}
      themePreference={themePreference}
      initialTahun={tahun}
      initialData={initialData}
    />
  );
}
