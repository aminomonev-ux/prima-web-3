// app/api/blud/realisasi/pagu/route.ts — pohon anggaran + pagu efektif + serapan.
// Konsep: docs/CONCEPT-blud-realisasi.md §2.1, §7.2
//
// Dipakai pemilih baris anggaran di Buku Kas dan layar Realisasi.
// Semua kolom turunan dihitung di sini, tidak ada yang disimpan.
//
// ?mode=cap → hanya sidik jari pagu (§4.4 lapis 3). Layar Realisasi memanggilnya
// tiap ~30 detik; memuat ulang seluruh pohon sesering itu jelas mubazir.
import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/security/auth'
import {
  getPaguEfektif, getPaguSumber, getTerserap, getSerapanPeriode, getPaguCap, gulungKeAtas,
} from '@/lib/blud/pagu'
import { TahunSchema } from '@/lib/blud/schemas'
import { bolehLihatSalahSatu, forbidden, unauthorized, realisasiMati } from '../_guard'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return unauthorized()

  const mati = await realisasiMati()
  if (mati) return mati
  // Pagu tampil di layar Buku Kas DAN Realisasi — cukup salah satunya terbuka.
  if (!(await bolehLihatSalahSatu(session.userId, session.role, ['buku-kas', 'realisasi']))) return forbidden()

  const { searchParams } = new URL(req.url)
  const parsed = TahunSchema.safeParse(searchParams.get('tahun'))
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'Parameter `tahun` tidak valid (2000–2100)' }, { status: 400 })
  }
  const tahun = parsed.data
  const bulanRaw = searchParams.get('bulan') ?? searchParams.get('sampai_bulan')
  const bulanNum = bulanRaw ? Number(bulanRaw) : NaN
  const bulan = Number.isInteger(bulanNum) && bulanNum >= 1 && bulanNum <= 12 ? bulanNum : null

  try {
    if (searchParams.get('mode') === 'cap') {
      return NextResponse.json({ ok: true, cap: await getPaguCap(tahun) })
    }

    const [baris, sumber, terserap] = await Promise.all([
      getPaguEfektif(tahun),
      getPaguSumber(tahun),
      getTerserap(tahun),
    ])
    const periode = bulan ? await getSerapanPeriode(tahun, bulan) : null

    // Semua angka serapan digulung ke induk — alokasi hanya menempel di baris
    // terbawah, jadi tanpa ini baris induk tampil nol.
    const setahun = gulungKeAtas(baris, terserap)
    const ambil = (k: 'bulan_ini' | 'bulan_lalu') =>
      periode ? gulungKeAtas(baris, new Map([...periode].map(([key, v]) => [key, v[k]]))) : null
    const bulanIni = ambil('bulan_ini')
    const bulanLalu = ambil('bulan_lalu')

    const data = baris.map((b) => {
      const dipakai = setahun.get(b.anggaran_key) ?? 0
      const ini = bulanIni?.get(b.anggaran_key) ?? 0
      const lalu = bulanLalu?.get(b.anggaran_key) ?? 0
      const sd = bulanIni ? ini + lalu : null
      // Sisa & persen mengikuti bulan yang diminta — layar Realisasi adalah
      // laporan, jadi seluruh kolomnya harus menunjuk titik waktu yang sama.
      // Tanpa `bulan` (pemilih rekening di Buku Kas) jatuh ke serapan setahun:
      // di sana yang ditanya justru "boleh belanja berapa lagi sekarang".
      const acuan = sd ?? dipakai
      return {
        ...b,
        terserap: dipakai,
        bulan_ini: bulanIni ? ini : null,
        bulan_lalu: bulanLalu ? lalu : null,
        sd_bulan: sd,
        sisa: b.pagu - acuan,
        persen: b.pagu > 0 ? (acuan / b.pagu) * 100 : 0,
      }
    })

    return NextResponse.json({ ok: true, data, tahun, bulan, pagu_sumber: sumber })
  } catch (err) {
    console.error('[API /blud/realisasi/pagu GET]', err)
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 })
  }
}
