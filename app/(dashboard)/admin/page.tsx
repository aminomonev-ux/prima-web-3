
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/security/auth';
import AdminClient from './admin-client';
import { sql, queryOne } from '@/lib/data/db';

export default async function AdminPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  // Admin Panel khusus SUPER_ADMIN (selaras proxy.ts). ADMIN kelola role user
  // via panel Kelola User di /usulan-kebutuhan (API /api/admin/users tetap terbuka utk ADMIN).
  if (session.role !== 'SUPER_ADMIN') redirect('/menu');

  const row = await queryOne<{ theme_preference: string }>(
    sql`SELECT theme_preference FROM users WHERE id = ${session.userId} LIMIT 1`
  );
  const themePreference = (row?.theme_preference ?? 'dark') as 'dark' | 'light';

  return (
    <AdminClient
      userId={session.userId}
      username={session.username}
      role={session.role}
      sessionId={session.sessionId ?? ''}
      themePreference={themePreference}
    />
  );
}
