// app/(dashboard)/blud/penanggung-jawab/page.tsx
// Pintu modul dijaga `layout.tsx`; di sini tinggal izin per-menu (Fase C).
import PenanggungJawabClient from './penanggung-jawab-client'
import { izinLayar } from '../_izin'

export const dynamic = 'force-dynamic'

export default async function PenanggungJawabPage() {
  const { bolehUbah } = await izinLayar('penanggung-jawab')
  return <PenanggungJawabClient bolehUbah={bolehUbah} />
}
