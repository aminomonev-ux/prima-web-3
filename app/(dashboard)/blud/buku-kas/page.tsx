// app/(dashboard)/blud/buku-kas/page.tsx
// Pintu modul dijaga `layout.tsx`; di sini tinggal izin per-menu (Fase C).
import BukuKasClient from './buku-kas-client'
import { izinLayar } from '../_izin'

export const dynamic = 'force-dynamic'

export default async function BukuKasPage() {
  const { bolehUbah, peta } = await izinLayar('buku-kas')
  return (
    <BukuKasClient
      bolehUbah={bolehUbah}
      bolehDpa={peta.dpa !== 'TIDAK'}
      // Pengingat saldo awal mengarah ke menu Tutup Kas. Dua sumbu terpisah:
      // BUKA menentukan tautannya ditawarkan atau tidak, EDIT menentukan
      // tombol "Tetapkan 0" muncul — menawarkan pintu yang akan menolaknya
      // lebih membingungkan daripada tidak menawarkan sama sekali.
      bolehBukaTutupKas={peta['tutup-kas'] !== 'TIDAK'}
      bolehIsiSaldoAwal={peta['tutup-kas'] === 'EDIT'}
    />
  )
}
