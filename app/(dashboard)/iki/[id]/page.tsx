import { headers } from 'next/headers';
import { redirect, notFound } from 'next/navigation';
import { sql, queryOne, safeInt } from '@/lib/data/db';
import { isIkiRole } from '@/lib/data/iki-schemas';
import { getDokumen } from '@/lib/data/iki';
import EditorClient from './editor-client';
import type { IkiDokumen } from '../_lib/types';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export default async function IkiEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const h = await headers();
  const userId   = h.get('x-user-id');
  const role     = h.get('x-user-role');
  const username = h.get('x-username');
  if (!userId || !role || !username) redirect('/login');

  const row = await queryOne<{ app_access: string[] | null; theme_preference: string }>(
    sql`SELECT app_access, theme_preference FROM users WHERE id = ${Number(userId)} LIMIT 1`,
  );
  if (!isIkiRole(role, row?.app_access ?? null)) redirect('/menu');

  const id = safeInt((await params).id, 0);
  if (id <= 0) notFound();
  const doc = await getDokumen(id);
  if (!doc) notFound();

  const themePreference = (row?.theme_preference ?? 'dark') as 'dark' | 'light';

  return (
    <EditorClient
      username={username}
      role={role}
      themePreference={themePreference}
      initialDoc={doc as unknown as IkiDokumen}
    />
  );
}
