// app/(dashboard)/perjanjian-kinerja/pejabat/page.tsx
import dynamicImport from 'next/dynamic'
import { izinLayarPk } from '../_izin'

export const dynamic = 'force-dynamic'

const PejabatClient = dynamicImport(() => import('./pejabat-client'))

// Dulu: cek `role !== SUPER_ADMIN/ADMIN` langsung di sini. Sekarang lewat izin menu —
// hasilnya sama untuk semua peran (bawaannya TIDAK, lihat `MENU_TERTUTUP_BAWAAN`),
// bedanya SUPER_ADMIN kini bisa membukanya untuk satu orang dari Admin Panel tanpa
// mengubah kode. Wewenang MENGUBAH isinya tetap terkunci di SUPER_ADMIN/ADMIN.
export default async function PejabatPage() {
  const { bolehUbah } = await izinLayarPk('pejabat')
  return <PejabatClient bolehUbah={bolehUbah} />
}
