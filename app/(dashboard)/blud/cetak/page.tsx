// app/(dashboard)/blud/cetak/page.tsx
// Cetak selalu baca-saja (MENU_BACA_SAJA di lib/blud/peran.ts) — cukup izin buka.
// Satu pengecualian: "Simpan Rekap PK" menulis ke tabel `rekap_pk`, dan route-nya
// dijaga izin tulis menu DPA. Tombolnya ikut izin itu, bukan izin menu Cetak.
import CetakClient from './cetak-client'
import { izinLayar } from '../_izin'
import { bolehEdit } from '@/lib/blud/peran'

export const dynamic = 'force-dynamic'

export default async function CetakPage() {
  const { role } = await izinLayar('cetak')
  return <CetakClient bolehSimpanRekap={bolehEdit(role, 'dpa')} />
}
