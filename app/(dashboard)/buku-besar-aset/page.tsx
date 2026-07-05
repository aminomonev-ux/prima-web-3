import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { sql, queryOne } from '@/lib/data/db';
import { isAsetRole } from '@/lib/data/buku-besar-aset-schemas';
import { listAset, getAsetKpi, listKategori } from '@/lib/data/buku-besar-aset';
import BukuBesarAsetClient from './buku-besar-aset-client';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export default async function BukuBesarAsetPage() {
  const h = await headers();
  const userId   = h.get('x-user-id');
  const role     = h.get('x-user-role');
  const username = h.get('x-username');
  if (!userId || !role || !username) redirect('/login');

  const row = await queryOne<{ app_access: string[] | null; theme_preference: string }>(
    sql`SELECT app_access, theme_preference FROM users WHERE id = ${Number(userId)} LIMIT 1`,
  );
  if (!isAsetRole(role, row?.app_access ?? null)) redirect('/menu');

  const tahun = new Date().getFullYear();
  const [initial, kategori, initialKpi] = await Promise.all([
    listAset({ tahun, page: 1, limit: 50 }),
    listKategori(),
    getAsetKpi({ tahun, page: 1, limit: 50 }),
  ]);
  const themePreference = (row?.theme_preference ?? 'dark') as 'dark' | 'light';

  return (
    <BukuBesarAsetClient
      username={username}
      role={role}
      themePreference={themePreference}
      initialTahun={tahun}
      initialResult={initial}
      initialKpi={initialKpi}
      kategori={kategori.map(k => k.nama)}
    />
  );
}
