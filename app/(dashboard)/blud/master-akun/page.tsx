// app/(dashboard)/blud/master-akun/page.tsx
// Pintu modul dijaga `layout.tsx`; di sini tinggal izin per-menu (Fase C).
import MasterAkunClient from './master-akun-client'
import { izinLayar } from '../_izin'

export const dynamic = 'force-dynamic'

export default async function MasterAkunPage() {
  const { bolehUbah } = await izinLayar('master-akun')
  return <MasterAkunClient bolehUbah={bolehUbah} />
}
