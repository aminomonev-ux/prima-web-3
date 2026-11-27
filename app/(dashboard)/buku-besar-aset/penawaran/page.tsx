import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { pastikanSesiHalaman } from '@/lib/security/sesi-halaman';
import { sql, queryOne } from '@/lib/data/db';
import { isAsetRole } from '@/lib/data/buku-besar-aset-schemas';
import { listBarang, listKategoriLengkap } from '@/lib/data/buku-besar-aset';
import { listPenawaran, saranRekanan } from '@/lib/data/bba-penawaran';
import { bekuLayarModul } from '@/lib/security/penjaga-layar';
import { KunciTulisProvider } from '@/components/ui/KunciTulis';
import { izinLayarBba } from '../_izin';
import PenawaranClient from './penawaran-client';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export default async function PenawaranBbaPage() {
  const h = await headers();
  const userId = h.get('x-user-id');
  const role = h.get('x-user-role');
  const username = h.get('x-username');
  if (!userId || !role || !username) redirect('/login');
  await pastikanSesiHalaman();
  const row = await queryOne<{ app_access: string[] | null; theme_preference: string }>(
    sql`SELECT app_access, theme_preference FROM users WHERE id = ${Number(userId)} LIMIT 1`,
  );
  if (!isAsetRole(role, row?.app_access ?? null)) redirect('/menu');
  // Penawaran dilihat semua pemegang BBA — bagian Rencana tidak pernah tertutup, jadi petanya diambil lewat situ.
  const { peta } = await izinLayarBba('rencana');
  const [beku, surat, rekanan, barang, kategori] = await Promise.all([bekuLayarModul('buku_besar_aset'), listPenawaran(), saranRekanan(), listBarang(), listKategoriLengkap()]);
  return (
    <KunciTulisProvider beku={beku}>
      <PenawaranClient username={username} role={role} themePreference={(row?.theme_preference ?? 'dark') as 'dark' | 'light'}
        beku={beku} izin={peta} awal={surat} rekanan={rekanan} barang={barang.map(b => ({ id: b.id, nama: b.nama }))} kategori={kategori} />
    </KunciTulisProvider>
  );
}
