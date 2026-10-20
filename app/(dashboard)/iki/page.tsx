import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { sql, queryOne } from '@/lib/data/db';
import { isIkiRole } from '@/lib/data/iki-schemas';
import { listDokumen } from '@/lib/data/iki';
import IkiClient from './iki-client';
import type { IkiListRow } from './_lib/types';
import { bekuLayarModul } from '@/lib/security/penjaga-layar';
import { KunciTulisProvider } from '@/components/ui/KunciTulis';
import { tanggalHariIniWIB } from '@/lib/shared/waktu-wib';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export default async function IkiPage({ searchParams }: { searchParams: Promise<{ tahun?: string }> }) {
  const h = await headers();
  const userId   = h.get('x-user-id');
  const role     = h.get('x-user-role');
  const username = h.get('x-username');
  if (!userId || !role || !username) redirect('/login');

  const row = await queryOne<{ app_access: string[] | null; theme_preference: string }>(
    sql`SELECT app_access, theme_preference FROM users WHERE id = ${Number(userId)} LIMIT 1`,
  );
  if (!isIkiRole(role, row?.app_access ?? null)) redirect('/menu');

  const beku = await bekuLayarModul('iki');
  const initial = await listDokumen();
  const themePreference = (row?.theme_preference ?? 'dark') as 'dark' | 'light';
  const { tahun } = await searchParams;

  return (
    <KunciTulisProvider beku={beku}>
      <IkiClient
        username={username}
        role={role}
        themePreference={themePreference}
        initialRows={initial as IkiListRow[]}
        beku={beku}
        tahunAwal={/^\d{4}$/.test(tahun ?? '') ? tahun! : null}
        // Tahun berjalan dari server (WIB), bukan `new Date()` di komponen: peramban dan
        // server bisa beda tahun di malam pergantian tahun → hydration mismatch.
        tahunSekarang={tanggalHariIniWIB().slice(0, 4)}
      />
    </KunciTulisProvider>
  );
}
