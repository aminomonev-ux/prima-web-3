// app/api/blud/realisasi/gu/route.ts — periode Ganti Uang Persediaan per bulan.
// Konsep: docs/CONCEPT-blud-realisasi.md §3.2, keputusan #31
//
// GET  ?tahun=&bulan=   daftar rentang GU bulan itu
// POST                  simpan (replace-all per bulan)
//
// Hanya rentang tanggalnya yang disimpan. Angka realisasi tiap lembar GU tetap
// dihitung saat berkas dibuat — tidak ada angka turunan yang diendapkan.
import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/security/auth'
import { writeAuditLog } from '@/lib/security/auditlog'
import { bludRateLimit, TahunSchema } from '@/lib/blud/schemas'
import { listGuPeriode, simpanGuPeriode } from '@/lib/blud/gu-data'
import { SimpanGuBodySchema } from '@/lib/blud/realisasi-schemas'
import { bolehInput, bolehLihat, forbidden, unauthorized, tolakEdit, realisasiMati } from '../_guard'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return unauthorized()

  const mati = await realisasiMati(session.role)
  if (mati) return mati
  if (!(await bolehLihat(session.userId, session.role, 'tutup-kas'))) return forbidden()

  const limited = await bludRateLimit(session.userId, 'view-gu', 60)
  if (limited) return limited

  const { searchParams } = new URL(req.url)
  const tahun = TahunSchema.safeParse(searchParams.get('tahun'))
  const bulan = Number(searchParams.get('bulan'))
  if (!tahun.success || !Number.isInteger(bulan) || bulan < 1 || bulan > 12) {
    return NextResponse.json({ ok: false, error: 'Parameter `tahun` / `bulan` tidak valid' }, { status: 400 })
  }

  try {
    return NextResponse.json({ ok: true, data: await listGuPeriode(tahun.data, bulan) })
  } catch (err) {
    console.error('[API /blud/realisasi/gu GET]', err)
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return unauthorized()

  const mati = await realisasiMati(session.role)
  if (mati) return mati
  if (!(await bolehInput(session.userId, session.role, 'tutup-kas'))) return tolakEdit('tutup-kas')

  const limited = await bludRateLimit(session.userId, 'realisasi-gu', 20)
  if (limited) return limited

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ ok: false, error: 'Body bukan JSON' }, { status: 400 }) }

  const parsed = SimpanGuBodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.issues[0]?.message ?? 'Data tidak valid' }, { status: 400 })
  }
  const { tahun_anggaran, bulan, periode } = parsed.data

  try {
    const data = await simpanGuPeriode(
      tahun_anggaran, bulan,
      periode.map((p) => ({ tgl_awal: p.tgl_awal, tgl_akhir: p.tgl_akhir, no_surat: p.no_surat ?? null })),
      session.userId,
    )
    await writeAuditLog({
      req,
      eventType: 'BLUD_GU_SIMPAN',
      userId: session.userId,
      username: session.username,
      detail: `Periode GU ${bulan}/${tahun_anggaran}: ${data.map((p) => `${p.tgl_awal}..${p.tgl_akhir}`).join(', ') || '(dikosongkan)'}`,
    })
    return NextResponse.json({ ok: true, data })
  } catch (err) {
    console.error('[API /blud/realisasi/gu POST]', err)
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 })
  }
}
