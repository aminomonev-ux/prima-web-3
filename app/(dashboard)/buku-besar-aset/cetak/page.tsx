import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { sql, queryOne, queryMany } from '@/lib/data/db';
import { isAsetRole } from '@/lib/data/buku-besar-aset-schemas';
import { bekuLayarModul } from '@/lib/security/penjaga-layar';
import { KunciTulisProvider } from '@/components/ui/KunciTulis';
import { GOLONGAN, type Golongan } from '@/lib/bba/kib';
import { izinLayarBba } from '../_izin';
import CetakClient from './cetak-client';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export default async function CetakBbaPage() {
  const h = await headers();
  const userId = h.get('x-user-id');
  const role = h.get('x-user-role');
  const username = h.get('x-username');
  if (!userId || !role || !username) redirect('/login');

  const row = await queryOne<{ app_access: string[] | null; theme_preference: string }>(
    sql`SELECT app_access, theme_preference FROM users WHERE id = ${Number(userId)} LIMIT 1`,
  );
  if (!isAsetRole(role, row?.app_access ?? null)) redirect('/menu');
  const { peta } = await izinLayarBba('cetak');
  const [beku, jumlah] = await Promise.all([
    bekuLayarModul('buku_besar_aset'),
    queryMany<{ golongan: Golongan; n: number }>(sql`SELECT golongan, COUNT(*) AS n FROM bba_aset WHERE status = 'AKTIF' GROUP BY golongan`),
  ]);
  const perGolongan = Object.fromEntries(GOLONGAN.map(g => [g, Number(jumlah.find(j => j.golongan === g)?.n ?? 0)])) as Record<Golongan, number>;

  return (
    <KunciTulisProvider beku={beku}>
      <CetakClient username={username} role={role} themePreference={(row?.theme_preference ?? 'dark') as 'dark' | 'light'}
        beku={beku} izin={peta} perGolongan={perGolongan} />
    </KunciTulisProvider>
  );
}
