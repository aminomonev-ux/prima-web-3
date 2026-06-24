import { headers } from 'next/headers';
import { redirect, notFound } from 'next/navigation';
import { sql, queryOne } from '@/lib/data/db';
import { isDashboardRole } from '@/lib/data/dashboard-schemas';
import { getModuleDetail, isDashModule } from '@/lib/data/dashboard';
import DashboardDetailClient from './detail-client';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export default async function DashboardDetailPage({ params }: { params: Promise<{ modul: string }> }) {
  const { modul } = await params;
  if (!isDashModule(modul)) notFound();

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
  const payload = await getModuleDetail(modul, tahun);
  const themePreference = (row?.theme_preference ?? 'dark') as 'dark' | 'light';

  return (
    <DashboardDetailClient
      username={username}
      role={role}
      themePreference={themePreference}
      initialTahun={tahun}
      payload={payload}
    />
  );
}
