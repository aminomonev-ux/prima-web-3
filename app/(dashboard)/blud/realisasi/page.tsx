// app/(dashboard)/blud/realisasi/page.tsx
// Layar pantau — tidak ada tombol tulis sama sekali, jadi hanya izin buka yang
// diperiksa. `bolehUbah` sengaja tidak diteruskan: tak ada yang bisa disembunyikan.
import RealisasiClient from './realisasi-client'
import { izinLayar } from '../_izin'

export const dynamic = 'force-dynamic'

export default async function RealisasiPage() {
  const { peta } = await izinLayar('realisasi')
  return (
    <RealisasiClient
      bolehDpa={peta.dpa !== 'TIDAK'}
      bolehPergeseran={peta.pergeseran !== 'TIDAK'}
    />
  )
}
