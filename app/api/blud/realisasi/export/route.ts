// app/api/blud/realisasi/export/route.ts — unduh SPJ Bulanan (.xlsx, 9 lembar).
// Konsep: docs/CONCEPT-blud-realisasi.md §3.2, §7.2
//
// Dibangun di server, bukan di klien: satu berkas ini menggabungkan BKU, pagu,
// neraca kas, dan pejabat penanda tangan — mengirim semua bahan itu ke browser
// hanya untuk dirakit ulang di sana justru lebih mahal dan lebih mudah melenceng.
import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/security/auth'
import { writeAuditLog } from '@/lib/security/auditlog'
import { bludRateLimit, TahunSchema } from '@/lib/blud/schemas'
import { buatWorkbookSpj } from '@/lib/blud/export/spj-excel'
import { bolehLihatSalahSatu, forbidden, unauthorized, realisasiMati } from '../_guard'

export const dynamic = 'force-dynamic'

const NAMA_BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return unauthorized()

  const mati = await realisasiMati()
  if (mati) return mati
  // Tombol "Unduh SPJ Bulanan" duduk di layar Tutup Kas — SPJ itu dokumen yang lahir
  // dari menutup bulan, jadi letaknya mengikuti alur kerja dan pagarnya yang mengikuti.
  if (!(await bolehLihatSalahSatu(session.userId, session.role, ['cetak', 'tutup-kas']))) return forbidden()

  const limited = await bludRateLimit(session.userId, 'realisasi-export', 10)
  if (limited) return limited

  const { searchParams } = new URL(req.url)
  const tahun = TahunSchema.safeParse(searchParams.get('tahun'))
  const bulan = Number(searchParams.get('bulan'))
  if (!tahun.success || !Number.isInteger(bulan) || bulan < 1 || bulan > 12) {
    return NextResponse.json({ ok: false, error: 'Parameter `tahun` / `bulan` tidak valid' }, { status: 400 })
  }

  try {
    const buffer = await buatWorkbookSpj(tahun.data, bulan)
    const nama = `SPJ-BLUD-${NAMA_BULAN[bulan - 1]}-${tahun.data}.xlsx`

    await writeAuditLog({
      req,
      eventType: 'BLUD_SPJ_UNDUH',
      userId: session.userId,
      username: session.username,
      detail: `Unduh SPJ ${NAMA_BULAN[bulan - 1]} ${tahun.data}`,
    })

    return new NextResponse(buffer as ArrayBuffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${nama}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    console.error('[API /blud/realisasi/export GET]', err)
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 })
  }
}
