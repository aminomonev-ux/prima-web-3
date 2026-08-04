// app/(dashboard)/perjanjian-kinerja/unit-kerja/page.tsx
import dynamicImport from 'next/dynamic'
import { izinLayarPk } from '../_izin'

export const dynamic = 'force-dynamic'

const UnitKerjaClient = dynamicImport(() => import('./unit-kerja-client'))

// Sama seperti Master Pejabat: bawaannya tertutup untuk semua peran selain
// SUPER_ADMIN/ADMIN, tapi kini bisa dibuka per-orang dari Admin Panel. Wewenang
// mengubahnya tetap terkunci — rename unit meng-cascade ke pk_pejabat & pemetaan BLUD.
export default async function UnitKerjaPage() {
  const { bolehUbah } = await izinLayarPk('unit-kerja')
  return <UnitKerjaClient bolehUbah={bolehUbah} />
}
