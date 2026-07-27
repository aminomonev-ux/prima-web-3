// app/api/blud/pergeseran/inject/route.ts
// Inject: sinkronisasi kolom 0-5 dari DPA terbaru ke Pergeseran (tanpa sentuh vol_p/harga_p)
// Audit Tahap 11: B-SEC-1 (getSession), B-SEC-2 (role guard), B-SEC-3 (Zod),
// B-BUG-1 (audit log).
import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/security/auth'
import { writeAuditLog } from '@/lib/security/auditlog'
import { getDpaByDate, getDpaLatestDate, getDpaVersion } from '@/lib/blud/data'
import { injectDpaKePergeseran } from '@/lib/blud/recalc'
import { InjectBodySchema, bludRateLimit } from '@/lib/blud/schemas'
import { bolehEditMenu, tolakEdit, unauthorized } from '../../_guard'
import type { DpaBarisInput } from '@/types'

export const dynamic = 'force-dynamic'

// POST /api/blud/pergeseran/inject
// Body: { pergeseran_rows: PergeseranBarisInput[] }
// Server fetch DPA terbaru, inject ke pergeseran_rows, kembalikan hasilnya.
// Frontend yang menyimpan setelah user puas.
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return unauthorized()
  if (!(await bolehEditMenu(session.userId, session.role, 'pergeseran'))) return tolakEdit('pergeseran')

  // S-3: matching 16-level lumayan berat — batasi 30/menit/user spt endpoint save lain
  const limited = await bludRateLimit(session.userId, 'inject-dpa', 30)
  if (limited) return limited

  const raw = await req.json().catch(() => null)
  const parsed = InjectBodySchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: 'Data tidak valid: ' + parsed.error.issues[0].message },
      { status: 400 },
    )
  }
  const { tahun_anggaran, pergeseran_rows } = parsed.data

  try {
    // Coupling ketat (§2.1): inject selalu ambil DPA terbaru DALAM TAHUN SAMA.
    const dpaTanggal = await getDpaLatestDate(tahun_anggaran)
    if (!dpaTanggal) {
      return NextResponse.json({ ok: false, error: `Tidak ada data DPA untuk tahun ${tahun_anggaran}` }, { status: 404 })
    }

    // L51 transparency (B1): baca DPA + version paralel — kalau user lain edit
    // DPA bersamaan, dpa_version berubah → client bisa tampilkan warning sebelum
    // save Pergeseran. Data integrity Pergeseran tetap dijaga via save endpoint
    // sendiri (expected_version pergeseran_dpa).
    const [dpaRows, dpaVersion] = await Promise.all([
      getDpaByDate(tahun_anggaran, dpaTanggal),
      getDpaVersion(tahun_anggaran, dpaTanggal),
    ])
    if (!dpaRows.length) {
      return NextResponse.json({ ok: false, error: `Tidak ada DPA untuk ${tahun_anggaran}/${dpaTanggal}` }, { status: 404 })
    }

    // 16-level inject matching + recalc otomatis (B5: + daftar match heuristik longgar)
    const { rows: injected, lowConfidence } = injectDpaKePergeseran(pergeseran_rows, dpaRows as unknown as DpaBarisInput[])

    await writeAuditLog({
      req,
      eventType: 'BLUD_INJECT_DPA',
      userId:    session.userId,
      username:  session.username,
      detail:    `Inject DPA ${tahun_anggaran}/${dpaTanggal} (v${dpaVersion}) ke Pergeseran (${pergeseran_rows.length} baris client → ${injected.length} hasil, ${lowConfidence.length} match heuristik longgar)`,
    })

    return NextResponse.json({
      ok:             true,
      data:           injected,
      dpa_versi:      dpaTanggal,
      dpa_version:    dpaVersion,
      low_confidence: lowConfidence,
    })
  } catch (err) {
    console.error('[API /blud/pergeseran/inject POST]', err)
    return NextResponse.json({ ok: false, error: 'Gagal melakukan inject' }, { status: 500 })
  }
}
