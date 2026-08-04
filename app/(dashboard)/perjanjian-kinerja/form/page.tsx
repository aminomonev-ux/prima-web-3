// app/(dashboard)/perjanjian-kinerja/form/page.tsx
// Sprint 6 — Form PK. Edit mode via ?id=<dokumenId>.
import dynamicImport from 'next/dynamic'
import { izinLayarPk } from '../_izin'

export const dynamic = 'force-dynamic'

const FormClient = dynamicImport(() => import('./form-client'))

export default async function FormPkPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>
}) {
  const { bolehUbah } = await izinLayarPk('form')
  const { id } = await searchParams
  const editId = id ? Number(id) : null
  return (
    <FormClient
      editId={editId && Number.isFinite(editId) && editId > 0 ? editId : null}
      bolehUbah={bolehUbah}
    />
  )
}
