// app/api/blud/realisasi/saldo-awal/route.ts — saldo awal tahun anggaran (R3).
// Konsep: docs/CONCEPT-blud-realisasi.md §4.6
//
// POST  { tahun_anggaran, saldo_awal_kas, saldo_awal_bank }
//
// Sengaja route sendiri, bukan menumpang POST /realisasi/periode: arti route itu
// "simpan sisi nyata / tutup bulan" — satu bulan. Angka di sini menggeser saldo
// SELURUH tahun, dan menyelipkannya ke dalam body yang lain menyembunyikan itu.
import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/security/auth'
import { writeAuditLog } from '@/lib/security/auditlog'
import { bludRateLimit } from '@/lib/blud/schemas'
import { setSaldoAwalTahun } from '@/lib/blud/tutup-kas'
import { SaldoAwalBodySchema, BludSaldoAwalTerkunciError } from '@/lib/blud/realisasi-schemas'
import { bolehInput, tolakEdit, unauthorized, realisasiMati } from '../_guard'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return unauthorized()
  const mati = await realisasiMati()
  if (mati) return mati
  // Ikut menu `tutup-kas`, tanpa daftar peran tersendiri. Wewenang yang benar-benar
  // berbahaya — mengubahnya setelah ada berita acara — sudah terjaga sendirinya:
  // jalannya cuma lewat buka periode, dan itu punya `bolehBukaPeriode` yang sempit.
  if (!(await bolehInput(session.userId, session.role, 'tutup-kas'))) return tolakEdit('tutup-kas')

  const limited = await bludRateLimit(session.userId, 'realisasi-saldo-awal', 20)
  if (limited) return limited

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ ok: false, error: 'Body bukan JSON' }, { status: 400 }) }

  const parsed = SaldoAwalBodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.issues[0]?.message ?? 'Data tidak valid' }, { status: 400 })
  }
  const p = parsed.data

  try {
    const { lama, neraca } = await setSaldoAwalTahun(p.tahun_anggaran, {
      kas: p.saldo_awal_kas, bank: p.saldo_awal_bank,
    })
    await writeAuditLog({
      req,
      eventType: 'BLUD_SALDO_AWAL_SET',
      userId: session.userId,
      username: session.username,
      detail: `Saldo awal ${p.tahun_anggaran} — tunai ${lama.kas} → ${p.saldo_awal_kas} · bank ${lama.bank} → ${p.saldo_awal_bank}`,
    })
    return NextResponse.json({ ok: true, data: neraca })
  } catch (err) {
    if (err instanceof BludSaldoAwalTerkunciError) {
      return NextResponse.json({
        ok: false, code: 'SALDO_AWAL_TERKUNCI', error: err.message, bulan_tutup: err.bulanTutup,
      }, { status: 409 })
    }
    console.error('[API /blud/realisasi/saldo-awal POST]', err)
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 })
  }
}
