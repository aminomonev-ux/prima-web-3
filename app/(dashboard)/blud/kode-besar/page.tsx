// app/(dashboard)/blud/kode-besar/page.tsx
// Pintu modul dijaga `layout.tsx`; di sini tinggal izin per-menu (Fase C).
import KodeBesarClient from './kode-besar-client'
import { izinLayar } from '../_izin'

export const dynamic = 'force-dynamic'

export default async function KodeBesarPage() {
  const { bolehUbah } = await izinLayar('kode-besar')
  return <KodeBesarClient bolehUbah={bolehUbah} />
}
