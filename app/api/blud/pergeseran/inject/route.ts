// app/api/blud/pergeseran/inject/route.ts
// Inject: sinkronisasi kolom 0-5 dari DPA terbaru ke Pergeseran (tanpa sentuh vol_p/harga_p)
// Audit Tahap 11: B-SEC-1 (getSession), B-SEC-2 (role guard), B-SEC-3 (Zod),
// B-BUG-1 (audit log).
import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/security/auth'
import { writeAuditLog } from '@/lib/security/auditlog'
import { getDpaByDate, getDpaLatestDate, getDpaVersion } from '@/lib/blud/data'
import { injectDpaKePergeseran } from '@/lib/blud/recalc'
import { isBludRole, InjectBodySchema, bludRateLimit } from '@/lib/blud/schemas'
import { hasAppAccess } from '@/lib/security/guard'
import type { DpaBarisInput } from '@/types'

export const dynamic = 'force-dynamic'

function unauthorized() {
  return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
}
function forbidden() {
  return NextResponse.json({ ok: false, error: 'Akses ditolak' }, { status: 403 })
}

// POST /api/blud/pergeseran/inject
// Body: { pergeseran_rows: PergeseranBarisInput[] }
// Server fetch DPA terbaru, inject ke pergeseran_rows, kembalikan hasilnya.
// Frontend yang menyimpan setelah user puas.
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return unauthorized()
  if (!(await hasAppAccess(session.userId, session.role, isBludRole))) return forbidden()

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
  const { pergeseran_rows } = parsed.data

  try {
    const dpaTanggal = await getDpaLatestDate()
    if (!dpaTanggal) {
      return NextResponse.json({ ok: false, error: 'Tidak ada data DPA tersedia' }, { status: 404 })
    }

    // L51 transparency (B1): baca DPA + version paralel — kalau user lain edit
    // DPA bersamaan, dpa_version berubah → client bisa tampilkan warning sebelum
    // save Pergeseran. Data integrity Pergeseran tetap dijaga via save endpoint
    // sendiri (expected_version pergeseran_dpa).
    const [dpaRows, dpaVersion] = await Promise.all([
      getDpaByDate(dpaTanggal),
      getDpaVersion(dpaTanggal),
    ])
    if (!dpaRows.length) {
      return NextResponse.json({ ok: false, error: `Tidak ada DPA untuk ${dpaTanggal}` }, { status: 404 })
    }

    // 16-level inject matching + recalc otomatis
    const injected = injectDpaKePergeseran(pergeseran_rows, dpaRows as unknown as DpaBarisInput[])

    await writeAuditLog({
      req,
      eventType: 'BLUD_INJECT_DPA',
      userId:    session.userId,
      username:  session.username,
      detail:    `Inject DPA ${dpaTanggal} (v${dpaVersion}) ke Pergeseran (${pergeseran_rows.length} baris client → ${injected.length} hasil)`,
    })

    return NextResponse.json({
      ok:          true,
      data:        injected,
      dpa_versi:   dpaTanggal,
      dpa_version: dpaVersion,
    })
  } catch (err) {
    console.error('[API /blud/pergeseran/inject POST]', err)
    return NextResponse.json({ ok: false, error: 'Gagal melakukan inject' }, { status: 500 })
  }
}
