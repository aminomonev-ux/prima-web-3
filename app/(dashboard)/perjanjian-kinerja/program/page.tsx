// app/(dashboard)/perjanjian-kinerja/program/page.tsx
import dynamicImport from 'next/dynamic'

export const dynamic = 'force-dynamic'

const ProgramClient = dynamicImport(() => import('./program-client'))

export default function MasterProgramPage() {
  return <ProgramClient />
}
