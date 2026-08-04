// app/(dashboard)/perjanjian-kinerja/riwayat/page.tsx
import dynamicImport from 'next/dynamic'
import { izinLayarPk } from '../_izin'

export const dynamic = 'force-dynamic'

const RiwayatClient = dynamicImport(() => import('./riwayat-client'))

export default async function RiwayatPage() {
  // `izinLayarPk` sudah melempar ke /login kalau header sesi tidak ada — `role` dari
  // sini bukan lagi hasil baca header yang bisa null.
  const { role, bolehUbah } = await izinLayarPk('riwayat')
  return <RiwayatClient role={role} bolehUbah={bolehUbah} />
}
