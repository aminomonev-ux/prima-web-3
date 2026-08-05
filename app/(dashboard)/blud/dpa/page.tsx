// app/(dashboard)/blud/dpa/page.tsx
// Pintu modul dijaga `layout.tsx`; di sini tinggal izin per-menu (Fase C).
import DpaClient from './dpa-client'
import { izinLayar } from '../_izin'
import { canImporDpa } from '@/lib/blud/schemas'

export const dynamic = 'force-dynamic'

export default async function DpaPage() {
  const { bolehUbah, role } = await izinLayar('dpa')
  // Impor mengganti SATU VERSI ANGGARAN sekaligus — izin edit menu saja tidak
  // cukup. Ini hanya menyembunyikan tombolnya; pagarnya di route.
  return <DpaClient bolehUbah={bolehUbah} bolehImpor={bolehUbah && canImporDpa(role)} />
}
