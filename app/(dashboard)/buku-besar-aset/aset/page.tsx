import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { sql, queryOne } from '@/lib/data/db';
import { isAsetRole } from '@/lib/data/buku-besar-aset-schemas';
import { daftarAset } from '@/lib/data/bba-aset';
import { bekuLayarModul } from '@/lib/security/penjaga-layar';
import { KunciTulisProvider } from '@/components/ui/KunciTulis';
import { izinLayarBba } from '../_izin';
import AsetClient from './aset-client';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export default async function BukuAsetPage() {
  const h = await headers();
  const userId = h.get('x-user-id');
  const role = h.get('x-user-role');
  const username = h.get('x-username');
  if (!userId || !role || !username) redirect('/login');

  const row = await queryOne<{ app_access: string[] | null; theme_preference: string }>(
    sql`SELECT app_access, theme_preference FROM users WHERE id = ${Number(userId)} LIMIT 1`,
  );
  if (!isAsetRole(role, row?.app_access ?? null)) redirect('/menu');
  const { peta } = await izinLayarBba('aset');
  const [beku, awal] = await Promise.all([bekuLayarModul('buku_besar_aset'), daftarAset({})]);

  return (
    <KunciTulisProvider beku={beku}>
      <AsetClient username={username} role={role} themePreference={(row?.theme_preference ?? 'dark') as 'dark' | 'light'}
        beku={beku} izin={peta} awal={awal} />
    </KunciTulisProvider>
  );
}
