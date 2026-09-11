import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import UsulanClient from './usulan-client';
import { sql, queryOne } from '@/lib/data/db';
import { modulSedangMati } from '@/lib/security/guard';
import { urlPemeliharaan } from '@/lib/registry/apps';
import { bekuLayarModul } from '@/lib/security/penjaga-layar';
import type { Role } from '@/types';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export default async function UsulanKebutuhanPage() {
  const h        = await headers();
  const userId   = h.get('x-user-id');
  const role     = h.get('x-user-role') as Role | null;
  const username = h.get('x-username');
  if (!userId || !role || !username) redirect('/login');

  // T-1: `app_status_usulan_aset` punya tombol di Admin Panel sejak lama, tapi sampai
  // sekarang tidak dibaca siapa pun — mematikan modul Usulan cuma membuat kartunya abu
  // di /menu, sementara mengetik URL ini tetap masuk penuh. Pengecualian perannya
  // dipegang guard (`PERAN_TEMBUS_SAKELAR`), tidak ditulis ulang di sini.
  if (await modulSedangMati(['app_status_usulan_aset'], { role })) {
    redirect(urlPemeliharaan('app_status_usulan_aset'));
  }

  const beku = await bekuLayarModul('usulan_aset');

  const row = await queryOne<{ theme_preference: string }>(
    sql`SELECT theme_preference FROM users WHERE id = ${Number(userId)} LIMIT 1`
  );
  const themePreference = (row?.theme_preference ?? 'dark') as 'dark' | 'light';

  return <UsulanClient userId={Number(userId)} role={role} username={username} themePreference={themePreference} beku={beku} />;
}