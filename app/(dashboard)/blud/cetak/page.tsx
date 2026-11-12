// app/(dashboard)/blud/cetak/page.tsx
// Cetak selalu baca-saja (MENU_BACA_SAJA di lib/blud/peran.ts) — cukup izin buka.
// "Simpan Rekap PK" (satu-satunya tombol penulis di sini) dibuang: Form PK kini menghitung
// nominal BLUD langsung dari DPA/Pergeseran (docs/CONCEPT-pk-nominal-blud-langsung.md).
import CetakClient from './cetak-client'
import { izinLayar } from '../_izin'

export const dynamic = 'force-dynamic'

export default async function CetakPage() {
  await izinLayar('cetak')
  return <CetakClient />
}
