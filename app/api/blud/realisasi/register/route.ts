// app/api/blud/realisasi/register/route.ts — isi sheet `register` satu rekening.
// Konsep: docs/CONCEPT-blud-realisasi.md §3.1, §3.2
//
// Keluaran murni: daftar transaksi yang membebani satu baris anggaran + saldo
// anggaran berjalan. Tidak ada menu tersendiri — ini panel drill-down di layar
// Realisasi, dibuka dengan mengklik satu baris.
import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/security/auth'
import { getRegister } from '@/lib/blud/realisasi-data'
import { TahunSchema, bludRateLimit } from '@/lib/blud/schemas'
import { bolehLihat, forbidden, unauthorized, realisasiMati } from '../_guard'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return unauthorized()

  const mati = await realisasiMati()
  if (mati) return mati
  if (!(await bolehLihat(session.userId, session.role, 'realisasi'))) return forbidden()

  // R4 — register menelusuri seluruh transaksi satu baris anggaran setahun.
  const limited = await bludRateLimit(session.userId, 'view-register', 60)
  if (limited) return limited

  const { searchParams } = new URL(req.url)
  const parsed = TahunSchema.safeParse(searchParams.get('tahun'))
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'Parameter `tahun` tidak valid (2000–2100)' }, { status: 400 })
  }
  const anggaranKey = (searchParams.get('anggaran_key') ?? '').trim()
  if (!anggaranKey || anggaranKey.length > 64) {
    return NextResponse.json({ ok: false, error: 'Parameter `anggaran_key` wajib' }, { status: 400 })
  }
  const bulanNum = Number(searchParams.get('sampai_bulan'))
  const sampaiBulan = Number.isInteger(bulanNum) && bulanNum >= 1 && bulanNum <= 12 ? bulanNum : undefined

  try {
    const data = await getRegister(parsed.data, anggaranKey, sampaiBulan)
    return NextResponse.json({ ok: true, data })
  } catch (err) {
    console.error('[API /blud/realisasi/register GET]', err)
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 })
  }
}
