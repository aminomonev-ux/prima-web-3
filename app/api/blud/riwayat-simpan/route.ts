// app/api/blud/riwayat-simpan/route.ts
// Riwayat tiap klik Simpan DPA/Pergeseran — daftar & isi satu snapshot.
//
// BACA-SAJA. Memulihkan snapshot TIDAK terjadi di sini: isinya dipulangkan ke
// form, dan yang menuliskannya tetap POST /api/blud/dpa|pergeseran yang sudah
// ada. Itu sebabnya tidak ada handler POST/PUT/DELETE di berkas ini — dan
// sebabnya seluruh pagar simpan (gembok optimistik, pagarSimpanVersi,
// periksaJangkar, Sentinel) berlaku otomatis tanpa ditulis ulang.
//
// Konsep: docs/CONCEPT-blud-riwayat-simpan.md §3

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/security/auth'
import { writeAuditLog } from '@/lib/security/auditlog'
import { getRiwayatSimpan, getRiwayatSimpanIsi } from '@/lib/blud/riwayat-simpan'
import type { JenisRiwayat } from '@/lib/blud/riwayat-simpan'
import { TahunSchema, bludRateLimit } from '@/lib/blud/schemas'
import { bolehLihatSalahSatu, forbidden, unauthorized, bludMati } from '../_guard'

export const dynamic = 'force-dynamic'

const JENIS: Record<string, JenisRiwayat> = { DPA: 'DPA', PERGESERAN: 'PERGESERAN' }

// GET ?jenis=DPA|PERGESERAN&tahun=  → daftar snapshot (tanpa isi)
// GET ?id=                          → satu snapshot beserta isinya
export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return unauthorized()

  // L72: sakelar maintenance harus menutup route ini juga, bukan cuma kartunya
  // di /menu. Tanpa baris ini `npm run check:killswitch` gagal.
  const mati = await bludMati(session.role)
  if (mati) return mati

  // Pagarnya menyebut menu yang MENAMPILKAN datanya, sama dengan `mode=history`:
  // riwayat muncul di dropdown versi DPA/Pergeseran dan di layar Cetak.
  const boleh = await bolehLihatSalahSatu(session.userId, session.role, ['dpa', 'cetak', 'pengaturan'])
  if (!boleh) return forbidden()

  const limited = await bludRateLimit(session.userId, 'view-riwayat', 60)
  if (limited) return limited

  const { searchParams } = new URL(req.url)
  const idRaw = searchParams.get('id')

  try {
    if (idRaw) {
      const id = Number(idRaw)
      if (!Number.isInteger(id) || id <= 0) {
        return NextResponse.json({ ok: false, error: 'Nomor riwayat tidak dikenali.' }, { status: 400 })
      }
      const data = await getRiwayatSimpanIsi(id)
      if (!data) return NextResponse.json({ ok: false, error: 'Riwayat simpan itu sudah tidak ada.' }, { status: 404 })
      // Dicatat saat isinya DIAMBIL, bukan saat daftarnya dibuka: mengambil isi
      // berarti ada yang hendak memulihkannya. Simpan sesudahnya tetap tercatat
      // sendiri lewat BLUD_SAVE_DPA/BLUD_SAVE_PERGESERAN.
      await writeAuditLog({
        req,
        eventType: 'BLUD_RIWAYAT_PULIHKAN',
        userId:    session.userId,
        username:  session.username,
        detail:    `Ambil riwayat ${data.jenis} ${data.tahun_anggaran}/${data.versi_tanggal} `
          + `simpan ke-${data.versi_ke} (${data.disimpan_pada}, ${data.jumlah_baris} baris)`,
      })
      return NextResponse.json({ ok: true, data })
    }

    const jenis = JENIS[String(searchParams.get('jenis') ?? '').toUpperCase()]
    if (!jenis) {
      return NextResponse.json({ ok: false, error: 'Jenis riwayat harus DPA atau PERGESERAN.' }, { status: 400 })
    }
    const tahunParsed = TahunSchema.safeParse(searchParams.get('tahun'))
    if (!tahunParsed.success) {
      return NextResponse.json({ ok: false, error: 'Tahun anggaran tidak dikenali.' }, { status: 400 })
    }
    const data = await getRiwayatSimpan(jenis, tahunParsed.data)
    return NextResponse.json({ ok: true, data })
  } catch (e) {
    console.error('[blud/riwayat-simpan] GET gagal:', e)
    return NextResponse.json({ ok: false, error: 'Riwayat simpan belum bisa dimuat. Coba lagi sebentar lagi.' }, { status: 500 })
  }
}
