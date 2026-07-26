// app/api/blud/realisasi/pagu/route.ts — pohon anggaran + pagu efektif + serapan.
// Konsep: docs/CONCEPT-blud-realisasi.md §2.1, §7.2
//
// Dipakai pemilih baris anggaran di Buku Kas dan (nanti) layar Realisasi.
// Semua kolom turunan dihitung di sini, tidak ada yang disimpan.
import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/security/auth'
import { getPaguEfektif, getPaguSumber, getTerserap } from '@/lib/blud/pagu'
import { TahunSchema } from '@/lib/blud/schemas'
import { bolehLihat, forbidden, unauthorized } from '../_guard'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return unauthorized()
  if (!(await bolehLihat(session.userId, session.role))) return forbidden()

  const { searchParams } = new URL(req.url)
  const parsed = TahunSchema.safeParse(searchParams.get('tahun'))
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'Parameter `tahun` tidak valid (2000–2100)' }, { status: 400 })
  }
  const tahun = parsed.data
  const bulanRaw = searchParams.get('sampai_bulan')
  const sampaiBulan = bulanRaw ? Number(bulanRaw) : undefined

  try {
    const [baris, sumber, terserap] = await Promise.all([
      getPaguEfektif(tahun),
      getPaguSumber(tahun),
      getTerserap(tahun),
    ])
    const terserapSd = sampaiBulan ? await getTerserap(tahun, sampaiBulan) : null

    const data = baris.map((b) => {
      const dipakai = terserap.get(b.anggaran_key) ?? 0
      return {
        ...b,
        terserap: dipakai,
        terserap_sd_bulan: terserapSd ? (terserapSd.get(b.anggaran_key) ?? 0) : null,
        sisa: b.pagu - dipakai,
        persen: b.pagu > 0 ? (dipakai / b.pagu) * 100 : 0,
      }
    })

    return NextResponse.json({ ok: true, data, tahun, pagu_sumber: sumber })
  } catch (err) {
    console.error('[API /blud/realisasi/pagu GET]', err)
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 })
  }
}
