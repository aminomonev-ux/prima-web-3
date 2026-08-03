// app/(dashboard)/blud/cetak/page.tsx
// Cetak selalu baca-saja (MENU_BACA_SAJA di lib/blud/peran.ts) — cukup izin buka.
// Satu pengecualian: "Simpan Rekap PK" menulis ke tabel `rekap_pk`, dan route-nya
// dijaga izin tulis menu DPA. Tombolnya ikut izin itu, bukan izin menu Cetak.
import { headers } from 'next/headers'
import CetakClient from './cetak-client'
import { izinLayar } from '../_izin'
import { izinBlud } from '@/lib/blud/izin-server'

export const dynamic = 'force-dynamic'

export default async function CetakPage() {
  const { role } = await izinLayar('cetak')
  // Izin hasil resolusi, bukan `bolehEdit(role, 'dpa')` — kalau dari role saja,
  // pengaturan per-orang di Admin Panel tidak akan tercermin di tombol ini.
  const uid = Number((await headers()).get('x-user-id'))
  const bolehSimpanRekap = (await izinBlud(uid, role, 'dpa')) === 'EDIT'
  return <CetakClient bolehSimpanRekap={bolehSimpanRekap} />
}
