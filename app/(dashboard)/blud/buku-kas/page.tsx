// app/(dashboard)/blud/buku-kas/page.tsx
// Pintu modul dijaga `layout.tsx`; di sini tinggal izin per-menu (Fase C).
import BukuKasClient from './buku-kas-client'
import { izinLayar } from '../_izin'

export const dynamic = 'force-dynamic'

export default async function BukuKasPage() {
  const { bolehUbah, peta } = await izinLayar('buku-kas')
  return <BukuKasClient bolehUbah={bolehUbah} bolehDpa={peta.dpa !== 'TIDAK'} />
}
