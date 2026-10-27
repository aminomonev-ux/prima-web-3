import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { sql, queryOne } from '@/lib/data/db';
import { isAsetRole } from '@/lib/data/buku-besar-aset-schemas';
import { daftarAset, listGedung } from '@/lib/data/bba-aset';
import { listLokasi } from '@/lib/data/buku-besar-aset';
import { bekuLayarModul } from '@/lib/security/penjaga-layar';
import { KunciTulisProvider } from '@/components/ui/KunciTulis';
import { izinLayarBba } from '../_izin';
import AsetClient from './aset-client';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export default async function BukuAsetPage({ searchParams }: { searchParams: Promise<{ barang?: string }> }) {
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
  // ?barang= datang dari kartu barang ("Lihat n register").
  const idBarang = Number((await searchParams).barang);
  const barangId = Number.isInteger(idBarang) && idBarang > 0 ? idBarang : undefined;
  const [beku, awal, ruangan, gedung, barang] = await Promise.all([
    bekuLayarModul('buku_besar_aset'), daftarAset({ barang: barangId }), listLokasi(), listGedung(),
    barangId ? queryOne<{ id: number; nama: string }>(sql`SELECT id, nama FROM bba_barang WHERE id = ${barangId} LIMIT 1`) : Promise.resolve(null),
  ]);

  return (
    <KunciTulisProvider beku={beku}>
      <AsetClient username={username} role={role} themePreference={(row?.theme_preference ?? 'dark') as 'dark' | 'light'}
        beku={beku} izin={peta} awal={awal}
        ruangan={ruangan.map(r => ({ id: r.id, nama: r.nama }))} gedung={gedung}
        barangAwal={barang ? { id: Number(barang.id), nama: String(barang.nama) } : null} />
    </KunciTulisProvider>
  );
}
