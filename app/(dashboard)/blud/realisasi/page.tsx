// app/(dashboard)/blud/realisasi/page.tsx
// Layar pantau — tidak ada tombol tulis sama sekali, jadi hanya izin buka yang
// diperiksa. `bolehUbah` sengaja tidak diteruskan: tak ada yang bisa disembunyikan.
import RealisasiClient from './realisasi-client'
import { izinLayar } from '../_izin'

export const dynamic = 'force-dynamic'

// Tahun & saringan datang lewat server component, BUKAN `useSearchParams` di
// klien — pola yang sudah dipakai Beranda BLUD, dan menghindari keharusan
// `Suspense` yang dituntut Next untuk hook itu. Nilainya cuma keadaan awal layar;
// begitu pengguna mengganti tahun atau saringan, URL tidak lagi jadi acuan.
export default async function RealisasiPage({ searchParams }: {
  searchParams: Promise<{ tahun?: string; saring?: string }>
}) {
  const { peta } = await izinLayar('realisasi')
  const sp = await searchParams
  const th = Number(sp?.tahun)
  return (
    <RealisasiClient
      bolehDpa={peta.dpa !== 'TIDAK'}
      bolehPergeseran={peta.pergeseran !== 'TIDAK'}
      tahunAwal={Number.isInteger(th) && th >= 2000 && th <= 2100 ? th : null}
      saringAwal={sp?.saring === 'menembus' || sp?.saring === 'mepet' ? sp.saring : null}
    />
  )
}
