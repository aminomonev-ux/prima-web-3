// app/(dashboard)/perjanjian-kinerja/sasaran/page.tsx
import dynamicImport from 'next/dynamic'
import { izinLayarPk } from '../_izin'

export const dynamic = 'force-dynamic'

// L29: dynamic import per tab (split god component)
const SasaranClient = dynamicImport(() => import('./sasaran-client'))

export default async function MasterSasaranPage() {
  const { bolehUbah } = await izinLayarPk('sasaran')
  return <SasaranClient bolehUbah={bolehUbah} />
}
