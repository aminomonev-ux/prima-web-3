// app/api/blud/realisasi/tx/route.ts — Buku Kas BLUD (transaksi kas/bank).
// Konsep: docs/CONCEPT-blud-realisasi.md §7.2
//
// GET    ?tahun=&bulan=   daftar transaksi + saldo berjalan
// POST                    tambah transaksi (nomor kuitansi dari server)
// PATCH                   ubah transaksi (CAS expected_version)
// DELETE ?id=             hapus transaksi (alokasi ikut lewat FK CASCADE)
import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/security/auth'
import { writeAuditLog } from '@/lib/security/auditlog'
import { bludRateLimit } from '@/lib/blud/schemas'
import {
  getBukuKas, countBelumBerrekening, listBelumBerrekening, createTx, updateTx, deleteTx,
} from '@/lib/blud/realisasi-data'
import { getPaguSumber } from '@/lib/blud/pagu'
import {
  CreateTxBodySchema, UpdateTxBodySchema, ListTxQuerySchema,
  BludPeriodeTertutupError, BludTahunTanpaDpaError, BludAlokasiTidakSeimbangError,
  BludPaguTerlampauiError, BludTxConflictError, BludAlokasiTerlarangError,
  BludSerapanNegatifError, BludPotonganTidakSahError, BludTanggalDiLuarBulanError,
} from '@/lib/blud/realisasi-schemas'
import { bolehInput, bolehLihat, forbidden, unauthorized, tolakEdit, realisasiMati } from '../_guard'

export const dynamic = 'force-dynamic'

/** Terjemahkan error domain jadi respons yang bisa ditindaklanjuti klien. */
function petakanError(err: unknown): NextResponse | null {
  if (err instanceof BludPaguTerlampauiError) {
    return NextResponse.json({ ok: false, code: 'PAGU_TERLAMPAUI', error: err.message, detail: err.detail }, { status: 409 })
  }
  if (err instanceof BludTxConflictError) {
    return NextResponse.json({ ok: false, code: 'VERSION_CONFLICT', error: err.message }, { status: 409 })
  }
  if (err instanceof BludPeriodeTertutupError) {
    return NextResponse.json({ ok: false, code: 'PERIODE_TUTUP', error: err.message }, { status: 409 })
  }
  if (err instanceof BludTahunTanpaDpaError) {
    return NextResponse.json({ ok: false, code: 'TANPA_DPA', error: err.message }, { status: 409 })
  }
  if (err instanceof BludAlokasiTidakSeimbangError) {
    return NextResponse.json({ ok: false, code: 'ALOKASI_TIDAK_SEIMBANG', error: err.message }, { status: 400 })
  }
  if (err instanceof BludAlokasiTerlarangError) {
    return NextResponse.json({ ok: false, code: 'ALOKASI_TERLARANG', error: err.message }, { status: 400 })
  }
  if (err instanceof BludPotonganTidakSahError) {
    return NextResponse.json({ ok: false, code: 'POTONGAN_TIDAK_SAH', error: err.message }, { status: 400 })
  }
  if (err instanceof BludSerapanNegatifError) {
    return NextResponse.json({ ok: false, code: 'SERAPAN_NEGATIF', error: err.message }, { status: 409 })
  }
  if (err instanceof BludTanggalDiLuarBulanError) {
    return NextResponse.json({ ok: false, code: 'TANGGAL_LUAR_BULAN', error: err.message }, { status: 400 })
  }
  return null
}

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return unauthorized()

  const mati = await realisasiMati()
  if (mati) return mati
  if (!(await bolehLihat(session.userId, session.role, 'buku-kas'))) return forbidden()

  // R4 — Buku Kas memuat transaksi sebulan berikut alokasi & potongannya.
  const limited = await bludRateLimit(session.userId, 'view-tx', 60)
  if (limited) return limited

  const { searchParams } = new URL(req.url)
  const parsed = ListTxQuerySchema.safeParse({
    tahun: searchParams.get('tahun'),
    bulan: searchParams.get('bulan') ?? undefined,
  })
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.issues[0]?.message ?? 'Parameter tidak valid' }, { status: 400 })
  }

  const { tahun } = parsed.data
  const bulan = parsed.data.bulan ?? new Date().getMonth() + 1

  try {
    // Baki "Perlu Rekening" (§4.2) melihat SATU TAHUN penuh, bukan bulan berjalan:
    // transaksi yang diparkir di Mei tetap memblokir Tutup Kas di Juli.
    if (searchParams.get('mode') === 'parkir') {
      return NextResponse.json({ ok: true, data: await listBelumBerrekening(tahun) })
    }

    const [data, sumber, diparkir] = await Promise.all([
      getBukuKas(tahun, bulan),
      getPaguSumber(tahun),
      countBelumBerrekening(tahun),
    ])
    return NextResponse.json({ ok: true, data, pagu_sumber: sumber, diparkir })
  } catch (err) {
    console.error('[API /blud/realisasi/tx GET]', err)
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return unauthorized()

  const mati = await realisasiMati()
  if (mati) return mati
  if (!(await bolehInput(session.userId, session.role, 'buku-kas'))) return tolakEdit('buku-kas')

  const limited = await bludRateLimit(session.userId, 'realisasi-tx', 60)
  if (limited) return limited

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ ok: false, error: 'Body bukan JSON' }, { status: 400 }) }

  const parsed = CreateTxBodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.issues[0]?.message ?? 'Data tidak valid' }, { status: 400 })
  }
  const { tahun_anggaran, bulan, transaksi } = parsed.data

  try {
    const hasil = await createTx(tahun_anggaran, bulan, transaksi, session.userId)
    await writeAuditLog({
      req,
      eventType: 'BLUD_REALISASI_TX_CREATE',
      userId: session.userId,
      username: session.username,
      detail: `Transaksi ${tahun_anggaran}/${bulan} kwt=${hasil.no_kwt ?? '-'} id=${hasil.id}: ${transaksi.uraian.slice(0, 80)}`,
    })
    return NextResponse.json({ ok: true, ...hasil })
  } catch (err) {
    const mapped = petakanError(err)
    if (mapped) return mapped
    console.error('[API /blud/realisasi/tx POST]', err)
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  const session = await getSession()
  if (!session) return unauthorized()

  const mati = await realisasiMati()
  if (mati) return mati
  if (!(await bolehInput(session.userId, session.role, 'buku-kas'))) return tolakEdit('buku-kas')

  const limited = await bludRateLimit(session.userId, 'realisasi-tx', 60)
  if (limited) return limited

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ ok: false, error: 'Body bukan JSON' }, { status: 400 }) }

  const parsed = UpdateTxBodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.issues[0]?.message ?? 'Data tidak valid' }, { status: 400 })
  }
  const { id, expected_version, transaksi } = parsed.data

  try {
    const hasil = await updateTx(id, expected_version, transaksi, session.userId)
    await writeAuditLog({
      req,
      eventType: 'BLUD_REALISASI_TX_UPDATE',
      userId: session.userId,
      username: session.username,
      detail: `Ubah transaksi id=${id} → v${hasil.version}: ${transaksi.uraian.slice(0, 80)}`,
    })
    return NextResponse.json({ ok: true, ...hasil })
  } catch (err) {
    const mapped = petakanError(err)
    if (mapped) return mapped
    console.error('[API /blud/realisasi/tx PATCH]', err)
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const session = await getSession()
  if (!session) return unauthorized()

  const mati = await realisasiMati()
  if (mati) return mati
  if (!(await bolehInput(session.userId, session.role, 'buku-kas'))) return tolakEdit('buku-kas')

  const limited = await bludRateLimit(session.userId, 'realisasi-tx-delete', 20)
  if (limited) return limited

  const id = Number(new URL(req.url).searchParams.get('id') ?? 0)
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ ok: false, error: 'Parameter `id` tidak valid' }, { status: 400 })
  }

  try {
    const hasil = await deleteTx(id)
    if (!hasil.deleted) return NextResponse.json({ ok: false, error: 'Transaksi tidak ditemukan' }, { status: 404 })
    await writeAuditLog({
      req,
      eventType: 'BLUD_REALISASI_TX_DELETE',
      userId: session.userId,
      username: session.username,
      detail: `Hapus transaksi id=${id}`,
    })
    return NextResponse.json({ ok: true, ...hasil })
  } catch (err) {
    const mapped = petakanError(err)
    if (mapped) return mapped
    console.error('[API /blud/realisasi/tx DELETE]', err)
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 })
  }
}
