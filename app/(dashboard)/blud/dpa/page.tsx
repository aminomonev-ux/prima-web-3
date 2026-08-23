// app/(dashboard)/blud/dpa/page.tsx
// Pintu modul dijaga `layout.tsx`; di sini tinggal izin per-menu (Fase C).
import DpaClient from './dpa-client'
import { izinLayar } from '../_izin'
import { canImporDpa } from '@/lib/blud/schemas'

export const dynamic = 'force-dynamic'

export default async function DpaPage() {
  const { bolehUbah, role, peta } = await izinLayar('dpa')
  // Impor mengganti SATU VERSI ANGGARAN sekaligus — izin edit menu saja tidak
  // cukup. Ini hanya menyembunyikan tombolnya; pagarnya di route.
  //
  // "Salin ke Data Induk" menulis ke DUA menu lain yang izinnya berdiri sendiri —
  // ada orang yang boleh mengubah DPA tapi tidak boleh menyentuh data induk.
  // Dibaca dari `peta` yang sudah ikut terambil, bukan `izinLayar` kedua kali.
  return (
    <DpaClient
      bolehUbah={bolehUbah}
      bolehImpor={bolehUbah && canImporDpa(role)}
      bolehUbahMasterAkun={peta['master-akun'] === 'EDIT'}
      bolehUbahKodeBesar={peta['kode-besar'] === 'EDIT'}
    />
  )
}
