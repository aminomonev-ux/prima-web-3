// app/api/blud/bukti-setor/route.ts — Bukti Setor ke Bank (lembar `setor BPD`).
// Konsep: docs/CONCEPT-blud-bukti-setor.md
//
// GET    ?tahun=&bulan=   daftar slip bulan itu (Total & Cash dihitung server)
// GET    ?id=             satu slip beserta barisnya
// POST                    simpan (buat kalau `id` kosong, ubah dengan CAS kalau ada)
// DELETE ?id=             hapus (baris ikut lewat FK CASCADE)
//
// Guard-nya sama persis dengan Buku Kas — peruntukannya satu pekerjaan.
import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/security/auth'
import { writeAuditLog } from '@/lib/security/auditlog'
import { bludRateLimit } from '@/lib/blud/schemas'
import { listBuktiSetor, getBuktiSetor, simpanBuktiSetor, hapusBuktiSetor } from '@/lib/blud/bukti-setor-data'
import {
  SimpanBuktiSetorSchema, ListBuktiSetorQuerySchema,
  BludBuktiSetorConflictError, BludBuktiSetorTidakAdaError,
} from '@/lib/blud/bukti-setor-schemas'
import { BludPeriodeTertutupError } from '@/lib/blud/realisasi-schemas'
import { bolehInput, bolehLihat, forbidden, unauthorized } from '../realisasi/_guard'

export const dynamic = 'force-dynamic'

function petakanError(err: unknown): NextResponse | null {
  if (err instanceof BludBuktiSetorConflictError) {
    return NextResponse.json({ ok: false, code: 'VERSION_CONFLICT', error: err.message }, { status: 409 })
  }
  if (err instanceof BludPeriodeTertutupError) {
    return NextResponse.json({ ok: false, code: 'PERIODE_TUTUP', error: err.message }, { status: 409 })
  }
  if (err instanceof BludBuktiSetorTidakAdaError) {
    return NextResponse.json({ ok: false, code: 'TIDAK_DITEMUKAN', error: err.message }, { status: 404 })
  }
  return null
}

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return unauthorized()
  if (!(await bolehLihat(session.userId, session.role))) return forbidden()

  const { searchParams } = new URL(req.url)
  const parsed = ListBuktiSetorQuerySchema.safeParse({
    tahun: searchParams.get('tahun'),
    bulan: searchParams.get('bulan') ?? undefined,
    id: searchParams.get('id') ?? undefined,
  })
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.issues[0]?.message ?? 'Parameter tidak valid' }, { status: 400 })
  }

  try {
    if (parsed.data.id) {
      const data = await getBuktiSetor(parsed.data.id)
      if (!data) return NextResponse.json({ ok: false, error: 'Bukti setor tidak ditemukan' }, { status: 404 })
      return NextResponse.json({ ok: true, data })
    }
    const bulan = parsed.data.bulan ?? new Date().getMonth() + 1
    return NextResponse.json({ ok: true, data: await listBuktiSetor(parsed.data.tahun, bulan) })
  } catch (err) {
    console.error('[API /blud/bukti-setor GET]', err)
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return unauthorized()
  if (!(await bolehInput(session.userId, session.role))) return forbidden()

  const limited = await bludRateLimit(session.userId, 'bukti-setor', 60)
  if (limited) return limited

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ ok: false, error: 'Body bukan JSON' }, { status: 400 }) }

  const parsed = SimpanBuktiSetorSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.issues[0]?.message ?? 'Data tidak valid' }, { status: 400 })
  }

  try {
    const hasil = await simpanBuktiSetor(parsed.data, session.userId)
    await writeAuditLog({
      req,
      eventType: parsed.data.id ? 'BLUD_BUKTI_SETOR_UPDATE' : 'BLUD_BUKTI_SETOR_CREATE',
      userId: session.userId,
      username: session.username,
      detail: `Bukti setor ${parsed.data.tahun_anggaran}/${parsed.data.bulan} tgl ${parsed.data.tanggal} `
        + `id=${hasil.id} · ${parsed.data.baris.length} baris`,
    })
    return NextResponse.json({ ok: true, ...hasil })
  } catch (err) {
    const mapped = petakanError(err)
    if (mapped) return mapped
    console.error('[API /blud/bukti-setor POST]', err)
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const session = await getSession()
  if (!session) return unauthorized()
  if (!(await bolehInput(session.userId, session.role))) return forbidden()

  const limited = await bludRateLimit(session.userId, 'bukti-setor-delete', 20)
  if (limited) return limited

  const id = Number(new URL(req.url).searchParams.get('id') ?? 0)
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ ok: false, error: 'Parameter `id` tidak valid' }, { status: 400 })
  }

  try {
    const hasil = await hapusBuktiSetor(id)
    if (!hasil.deleted) return NextResponse.json({ ok: false, error: 'Bukti setor tidak ditemukan' }, { status: 404 })
    await writeAuditLog({
      req,
      eventType: 'BLUD_BUKTI_SETOR_DELETE',
      userId: session.userId,
      username: session.username,
      detail: `Hapus bukti setor id=${id}`,
    })
    return NextResponse.json({ ok: true, ...hasil })
  } catch (err) {
    const mapped = petakanError(err)
    if (mapped) return mapped
    console.error('[API /blud/bukti-setor DELETE]', err)
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 })
  }
}
