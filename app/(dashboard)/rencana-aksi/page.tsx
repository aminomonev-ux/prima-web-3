import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { sql, queryOne } from '@/lib/data/db';
import { isRencanaAksiRole } from '@/lib/data/rencana-aksi-schemas';
import { listRencanaAksi } from '@/lib/data/rencana-aksi';
import type { RaLevel } from '@/lib/data/rencana-aksi-schemas';
import RaClient from './ra-client';

export const dynamic = 'force-dynamic';

const VALID_LEVELS = ['tujuan', 'sasaran', 'program', 'kegiatan', 'sub-kegiatan'] as const;

export default async function RencanaAksiPage({
  searchParams,
}: {
  searchParams: Promise<{ tahun?: string; level?: string; mode?: string }>;
}) {
  const h = await headers();
  const userId = h.get('x-user-id');
  const role = h.get('x-user-role');
  const username = h.get('x-username');
  if (!userId || !role || !username) redirect('/login');

  const row = await queryOne<{ app_access: string[] | null; theme_preference: string }>(
    sql`SELECT app_access, theme_preference FROM users WHERE id = ${Number(userId)} LIMIT 1`,
  );
  if (!isRencanaAksiRole(role, row?.app_access ?? null)) {
    redirect('/menu');
  }

  const sp = await searchParams;
  const now = new Date().getFullYear();
  const tahunRaw = Number(sp.tahun);
  const tahun = Number.isInteger(tahunRaw) && tahunRaw >= 2026 && tahunRaw <= 2045
    ? tahunRaw
    : Math.min(Math.max(now, 2026), 2045);
  const level: RaLevel = (VALID_LEVELS as readonly string[]).includes(sp.level ?? '')
    ? (sp.level as RaLevel)
    : 'sub-kegiatan';
  const mode: 'dashboard' | 'data-entry' | 'cetak' =
    sp.mode === 'data-entry' ? 'data-entry' :
    sp.mode === 'cetak' ? 'cetak' : 'dashboard';

  const initialRows = await listRencanaAksi(tahun, level);
  const themePreference = (row?.theme_preference ?? 'dark') as 'dark' | 'light';

  return (
    <RaClient
      username={username}
      role={role}
      themePreference={themePreference}
      initialTahun={tahun}
      initialLevel={level}
      initialMode={mode}
      initialRows={initialRows}
    />
  );
}
