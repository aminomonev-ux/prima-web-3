// app/(dashboard)/perjanjian-kinerja/sasaran/page.tsx
import dynamicImport from 'next/dynamic'

export const dynamic = 'force-dynamic'

// L29: dynamic import per tab (split god component)
const SasaranClient = dynamicImport(() => import('./sasaran-client'))

export default function MasterSasaranPage() {
  return <SasaranClient />
}
