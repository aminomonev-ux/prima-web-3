import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { sql, queryOne } from '@/lib/data/db';
import { isAsetRole } from '@/lib/data/buku-besar-aset-schemas';
import { listKategori } from '@/lib/data/buku-besar-aset';
import { pengadaanTahun } from '@/lib/data/bba-penerimaan';
import { bekuLayarModul } from '@/lib/security/penjaga-layar';
import { KunciTulisProvider } from '@/components/ui/KunciTulis';
import { tanggalHariIniWIB } from '@/lib/shared/waktu-wib';
import { bolehBatalkanFinal } from '@/lib/constants';
import { izinLayarBba } from '../_izin';
import PengadaanClient from './pengadaan-client';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export default async function PengadaanBbaPage() {
  const h = await headers();
  const userId = h.get('x-user-id');
  const role = h.get('x-user-role');
  const username = h.get('x-username');
  if (!userId || !role || !username) redirect('/login');

  const row = await queryOne<{ app_access: string[] | null; theme_preference: string }>(
    sql`SELECT app_access, theme_preference FROM users WHERE id = ${Number(userId)} LIMIT 1`,
  );
  if (!isAsetRole(role, row?.app_access ?? null)) redirect('/menu');
  const { peta } = await izinLayarBba('pengadaan');
  const tahun = Number(tanggalHariIniWIB().slice(0, 4));
  const [beku, awal, kategori] = await Promise.all([bekuLayarModul('buku_besar_aset'), pengadaanTahun(tahun), listKategori()]);

  return (
    <KunciTulisProvider beku={beku}>
      <PengadaanClient username={username} role={role} themePreference={(row?.theme_preference ?? 'dark') as 'dark' | 'light'}
        beku={beku} izin={peta} awal={awal} kategori={kategori.map(k => k.nama)} bolehKoreksiMundur={bolehBatalkanFinal(role)} />
    </KunciTulisProvider>
  );
}
