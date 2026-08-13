// app/api/blud/realisasi/periode/route.ts — Tutup Kas (Berita Acara Pemeriksaan Kas).
// Konsep: docs/CONCEPT-blud-realisasi.md §4.5, §4.7, §7.2
//
// GET    ?tahun=&bulan=   neraca dua sisi + daftar penghalang
// POST                    simpan sisi nyata (tutup=false) / tutup bulan (tutup=true)
// DELETE ?tahun=&bulan=&alasan=  buka kembali — BLUD_BUKA_PERIODE_ROLES, wajib beralasan
//   (SUPER_ADMIN/ADMIN/KEUANGAN — bukan "SUPER_ADMIN saja" seperti tertulis dulu;
//    PERBENDAHARAAN sengaja di luar: yang menutup tidak boleh yang membuka)
//
// Sisi A tidak pernah diterima dari klien. Keseimbangan dihitung ulang di dalam
// transaksi DB — kalau tidak, §4.7 cuma hiasan yang bisa dilewati lewat curl.
import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/security/auth'
import { writeAuditLog } from '@/lib/security/auditlog'
import { bludRateLimit } from '@/lib/blud/schemas'
import { getNeracaKas, simpanSisiNyata, tutupPeriode, bukaPeriode } from '@/lib/blud/tutup-kas'
import {
  TutupKasBodySchema, BukaPeriodeQuerySchema, bolehBukaPeriode,
  BludPeriodeTertutupError, BludTutupTidakSeimbangError, BludTutupTerhalangError,
  BludBukaTerhalangError,
} from '@/lib/blud/realisasi-schemas'
import { TahunSchema } from '@/lib/blud/schemas'
import { bolehInput, bolehLihat, forbidden, unauthorized, tolakEdit, realisasiMati } from '../_guard'

export const dynamic = 'force-dynamic'

function bacaBulan(v: string | null): number | null {
  const n = Number(v)
  return Number.isInteger(n) && n >= 1 && n <= 12 ? n : null
}

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return unauthorized()

  const mati = await realisasiMati(session.role)
  if (mati) return mati
  if (!(await bolehLihat(session.userId, session.role, 'tutup-kas'))) return forbidden()

  // R4 — neraca dua sisi menghitung ulang arus sebulan penuh tiap dipanggil.
  const limited = await bludRateLimit(session.userId, 'view-periode', 60)
  if (limited) return limited

  const { searchParams } = new URL(req.url)
  const tahun = TahunSchema.safeParse(searchParams.get('tahun'))
  const bulan = bacaBulan(searchParams.get('bulan'))
  if (!tahun.success || bulan == null) {
    return NextResponse.json({ ok: false, error: 'Parameter `tahun` / `bulan` tidak valid' }, { status: 400 })
  }

  try {
    return NextResponse.json({ ok: true, data: await getNeracaKas(tahun.data, bulan) })
  } catch (err) {
    console.error('[API /blud/realisasi/periode GET]', err)
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return unauthorized()

  const mati = await realisasiMati(session.role)
  if (mati) return mati
  if (!(await bolehInput(session.userId, session.role, 'tutup-kas'))) return tolakEdit('tutup-kas')

  const limited = await bludRateLimit(session.userId, 'realisasi-periode', 20)
  if (limited) return limited

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ ok: false, error: 'Body bukan JSON' }, { status: 400 }) }

  const parsed = TutupKasBodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.issues[0]?.message ?? 'Data tidak valid' }, { status: 400 })
  }
  const p = parsed.data
  const input = {
    kas_fisik: p.kas_fisik,
    bank_koran: p.bank_koran,
    no_surat: p.no_surat ?? null,
    tgl_surat: p.tgl_surat ?? null,
  }

  try {
    if (!p.tutup) {
      const data = await simpanSisiNyata(p.tahun_anggaran, p.bulan, input)
      return NextResponse.json({ ok: true, data })
    }

    const data = await tutupPeriode(p.tahun_anggaran, p.bulan, input, session.userId)
    await writeAuditLog({
      req,
      eventType: 'BLUD_PERIODE_TUTUP',
      userId: session.userId,
      username: session.username,
      detail: `Tutup ${p.bulan}/${p.tahun_anggaran} — saldo ${data.saldo_buku} (tunai ${p.kas_fisik} + bank ${p.bank_koran})${p.no_surat ? ` · surat ${p.no_surat}` : ''}`,
    })
    return NextResponse.json({ ok: true, data })
  } catch (err) {
    if (err instanceof BludPeriodeTertutupError) {
      return NextResponse.json({ ok: false, code: 'PERIODE_TERTUTUP', error: err.message }, { status: 409 })
    }
    if (err instanceof BludTutupTidakSeimbangError) {
      return NextResponse.json({
        ok: false, code: 'TIDAK_SEIMBANG', error: 'Sisi buku dan sisi nyata belum bertemu — bulan tidak bisa ditutup.',
        detail: { saldo_buku: err.saldoBuku, saldo_nyata: err.saldoNyata, selisih: err.selisih },
      }, { status: 409 })
    }
    if (err instanceof BludTutupTerhalangError) {
      return NextResponse.json({
        ok: false, code: 'TERHALANG', error: 'Masih ada yang harus dibereskan sebelum bulan ditutup.',
        detail: err.penghalang,
      }, { status: 409 })
    }
    console.error('[API /blud/realisasi/periode POST]', err)
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const session = await getSession()
  if (!session) return unauthorized()

  const mati = await realisasiMati(session.role)
  if (mati) return mati
  // §4.5 — dua pagar sekaligus, dan keduanya perlu. Yang pertama memastikan
  // orangnya memang pemakai modul BLUD; yang kedua bahwa perannya termasuk yang
  // memegang kunci — daftar yang sengaja lebih sempit dari pemegang EDIT
  // Tutup Kas, karena penutup dan pembuka tidak boleh orang yang sama.
  if (!(await bolehLihat(session.userId, session.role, 'tutup-kas'))) return forbidden()
  if (!bolehBukaPeriode(session.role)) {
    return NextResponse.json({
      ok: false,
      error: 'Peran Anda tidak berwenang membuka periode yang sudah ditutup — mintakan ke atasan bidang keuangan atau admin.',
    }, { status: 403 })
  }

  const limited = await bludRateLimit(session.userId, 'realisasi-periode', 20)
  if (limited) return limited

  const { searchParams } = new URL(req.url)
  const parsed = BukaPeriodeQuerySchema.safeParse({
    tahun: searchParams.get('tahun'),
    bulan: searchParams.get('bulan'),
    alasan: searchParams.get('alasan') ?? '',
  })
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.issues[0]?.message ?? 'Data tidak valid' }, { status: 400 })
  }
  const { tahun, bulan, alasan } = parsed.data

  try {
    const data = await bukaPeriode(tahun, bulan)
    await writeAuditLog({
      req,
      eventType: 'BLUD_PERIODE_BUKA',
      userId: session.userId,
      username: session.username,
      detail: `Buka kembali ${bulan}/${tahun} · Alasan: ${alasan}`,
    })
    return NextResponse.json({ ok: true, data })
  } catch (err) {
    // S2: bulan sesudahnya masih tertutup. Percobaannya ikut dicatat — yang
    // ditahan hari ini biasanya dicoba lagi lewat jalan lain.
    if (err instanceof BludBukaTerhalangError) {
      await writeAuditLog({
        req,
        eventType: 'BLUD_PERIODE_BUKA',
        userId: session.userId,
        username: session.username,
        detail: `DITOLAK — buka ${bulan}/${tahun}: bulan ${err.bulanTutup.join(', ')} masih tertutup · Alasan: ${alasan}`,
      })
      return NextResponse.json({
        ok: false, code: 'BUKA_TERHALANG', error: err.message, bulan_tutup: err.bulanTutup,
      }, { status: 409 })
    }
    console.error('[API /blud/realisasi/periode DELETE]', err)
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 })
  }
}
