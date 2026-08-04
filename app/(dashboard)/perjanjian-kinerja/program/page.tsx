// app/(dashboard)/perjanjian-kinerja/program/page.tsx
import dynamicImport from 'next/dynamic'
import { izinLayarPk } from '../_izin'

export const dynamic = 'force-dynamic'

const ProgramClient = dynamicImport(() => import('./program-client'))

export default async function MasterProgramPage() {
  const { bolehUbah } = await izinLayarPk('program')
  return <ProgramClient bolehUbah={bolehUbah} />
}
