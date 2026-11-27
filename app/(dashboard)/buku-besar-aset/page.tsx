import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { pastikanSesiHalaman } from '@/lib/security/sesi-halaman';
import { sql, queryOne } from '@/lib/data/db';
import { isAsetRole } from '@/lib/data/buku-besar-aset-schemas';
import { listAset, getAsetKpi, listKategoriLengkap } from '@/lib/data/buku-besar-aset';
import BukuBesarAsetClient from './buku-besar-aset-client';
import { bekuLayarModul } from '@/lib/security/penjaga-layar';
import { KunciTulisProvider } from '@/components/ui/KunciTulis';
import { izinLayarBba } from './_izin';
import { TAB_RENCANA, type TabRencana } from '@/lib/bba/tahap';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

type Cari = Promise<Record<string, string | string[] | undefined>>;

export default async function BukuBesarAsetPage({ searchParams }: { searchParams: Cari }) {
  const h = await headers();
  const userId   = h.get('x-user-id');
  const role     = h.get('x-user-role');
  const username = h.get('x-username');
  if (!userId || !role || !username) redirect('/login');
  await pastikanSesiHalaman();

  const row = await queryOne<{ app_access: string[] | null; theme_preference: string }>(
    sql`SELECT app_access, theme_preference FROM users WHERE id = ${Number(userId)} LIMIT 1`,
  );
  if (!isAsetRole(role, row?.app_access ?? null)) redirect('/menu');

  const { peta } = await izinLayarBba('rencana');
  const beku = await bekuLayarModul('buku_besar_aset');
  // ?tab= & ?tahun= dari pita alur (CONCEPT-bba-revamp-alur §3.1). Isian di luar daftar diabaikan.
  const cari = await searchParams;
  const tahunCari = Number(cari.tahun);
  const tahun = Number.isInteger(tahunCari) && tahunCari >= 2020 && tahunCari <= 2100 ? tahunCari : new Date().getFullYear();
  const tabCari = typeof cari.tab === 'string' && (TAB_RENCANA as readonly string[]).includes(cari.tab) ? cari.tab as TabRencana : null;
  const [initial, kategori, initialKpi] = await Promise.all([
    listAset({ tahun, page: 1, limit: 1000 }),
    listKategoriLengkap(),
    getAsetKpi({ tahun, page: 1, limit: 1000 }),
  ]);
  const themePreference = (row?.theme_preference ?? 'dark') as 'dark' | 'light';

  return (
    <KunciTulisProvider beku={beku}>
      <BukuBesarAsetClient
        username={username}
        role={role}
        themePreference={themePreference}
        initialTahun={tahun}
        initialResult={initial}
        initialKpi={initialKpi}
        initialTab={tabCari}
        kategori={kategori}
        beku={beku}
        izin={peta}
      />
    </KunciTulisProvider>
  );
}
