// app/api/blud/cadangan-json/route.ts
// Cadangan foto per-simpan BLUD → Google Drive, pemicu MANUAL dari layar
// Pengaturan. Kembarannya `app/api/cron/blud-cadangan-json` untuk pemicu
// terjadwal; keduanya memanggil `cadangkanJsonBlud()` yang sama.
//
// Konsep: docs/CONCEPT-blud-cadangan-json.md §4 Tahap 2

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/security/auth'
import { writeAuditLog } from '@/lib/security/auditlog'
import { cadangkanJsonBlud, statusCadanganJson } from '@/lib/blud/cadangan-json'
import { bludRateLimit, canCadangkanJson } from '@/lib/blud/schemas'
import { bolehBukaMenu, forbidden, unauthorized, bludMati } from '../_guard'

export const dynamic = 'force-dynamic'

function tolakPeran() {
  return NextResponse.json({
    ok: false, code: 'CADANGAN_TERBATAS',
    error: 'Menjalankan pencadangan hanya bisa dilakukan Super Admin atau Admin Staff.',
  }, { status: 403 })
}

// GET → keadaan cadangan (dipakai layar Pengaturan untuk menampilkan
// "terakhir berhasil" dan berapa yang masih tertunggak).
export async function GET() {
  const session = await getSession()
  if (!session) return unauthorized()

  // L72: sakelar maintenance harus menutup route ini juga.
  const mati = await bludMati(session.role)
  if (mati) return mati

  if (!(await bolehBukaMenu(session.userId, session.role, 'pengaturan'))) return forbidden()

  try {
    return NextResponse.json({ ok: true, data: await statusCadanganJson() })
  } catch (e) {
    console.error('[blud/cadangan-json] GET gagal:', e)
    return NextResponse.json(
      { ok: false, error: 'Keadaan cadangan belum bisa dibaca. Coba lagi sebentar lagi.' },
      { status: 500 },
    )
  }
}

// POST → jalankan satu putaran unggahan.
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return unauthorized()

  const mati = await bludMati(session.role)
  if (mati) return mati

  if (!(await bolehBukaMenu(session.userId, session.role, 'pengaturan'))) return forbidden()
  // Pagar sungguhannya di sini, bukan di tombol yang disembunyikan klien —
  // sepadan dengan hapus versi (S5).
  if (!canCadangkanJson(session.role)) return tolakPeran()

  // Tiap putaran memanggil Google berkali-kali; batasnya lebih ketat dari baca.
  const limited = await bludRateLimit(session.userId, 'cadangan-json', 6)
  if (limited) return limited

  try {
    const hasil = await cadangkanJsonBlud()
    await writeAuditLog({
      req,
      eventType: 'BLUD_CADANGAN_JSON',
      userId:    session.userId,
      username:  session.username,
      detail:    `Cadangan JSON BLUD dijalankan manual: ${hasil.diunggah} berkas naik ke Drive`
        + `${hasil.gagal ? `, ${hasil.gagal} gagal (${hasil.pesan})` : ''}`
        + ` · tersisa ${hasil.belum} belum tercadang`,
    })
    return NextResponse.json({ ok: true, data: hasil })
  } catch (e) {
    console.error('[blud/cadangan-json] POST gagal:', e)
    return NextResponse.json(
      { ok: false, error: 'Pencadangan gagal dijalankan. Periksa sambungan ke Google Drive.' },
      { status: 500 },
    )
  }
}
