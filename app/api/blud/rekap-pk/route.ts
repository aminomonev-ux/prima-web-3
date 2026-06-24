// app/api/blud/rekap-pk/route.ts
// Snapshot rekap PJ — output dari menu Cetak BLUD view "Penanggung Jawab".
// Audit pattern: getSession + isBludRole + Zod + withTransaction + audit log.

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/security/auth'
import { writeAuditLog } from '@/lib/security/auditlog'
import { isBludRole, RekapPKBodySchema, bludRateLimit } from '@/lib/blud/schemas'
import { hasAppAccess } from '@/lib/security/guard'
import { saveRekapPK } from '@/lib/blud/rekap-pk-data'

export const dynamic = 'force-dynamic'

function unauthorized() {
  return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 })
}
function forbidden() {
  return NextResponse.json({ ok: false, message: 'Akses ditolak' }, { status: 403 })
}

// POST /api/blud/rekap-pk
// Body: { versi: string | null, rows: [[label, uraianFiller, nominal], ...] }
// Client kirim ExportRow format dari cetak-data (tuple 3 elemen).
// Server filter ke {label, nominal} — kolom uraian middle di-skip.
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session)                       return unauthorized()
  if (!(await hasAppAccess(session.userId, session.role, isBludRole)))      return forbidden()

  // Rate limit save: 30/menit/user
  const limited = await bludRateLimit(session.userId, 'save-rekap-pk', 30)
  if (limited) return limited

  const raw    = await req.json().catch(() => null)
  const parsed = RekapPKBodySchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, message: 'Data tidak valid: ' + parsed.error.issues[0].message },
      { status: 400 },
    )
  }
  const { versi, rows } = parsed.data

  // Map ExportRow tuple → {label, nominal}. Filter row "uraian-only" (label kosong).
  // Client kirim format dari cetak-data renderPjView: [label, uraian, nominal]
  // — kita hanya butuh label != '' (rows total/subtotal).
  const items = rows
    .map(([label, , nominal]) => ({ label: String(label ?? '').trim(), nominal: Number(nominal) || 0 }))
    .filter(it => it.label !== '' && it.label !== '-')

  if (items.length === 0) {
    return NextResponse.json(
      { ok: false, message: 'Tidak ada row dengan label valid untuk disimpan' },
      { status: 400 },
    )
  }

  try {
    const result = await saveRekapPK(versi ?? null, items, session.userId)
    await writeAuditLog({
      req,
      eventType: 'BLUD_SAVE_REKAP_PK',
      userId:    session.userId,
      username:  session.username,
      detail:    `Simpan Rekap PK versi ${result.versi_dpa}: ${result.affected} baris`,
    })
    return NextResponse.json({
      ok: true,
      message: `✅ Rekap PK tersimpan (${result.affected} baris) untuk versi ${result.versi_dpa}.`,
      versi_dpa: result.versi_dpa,
      affected:  result.affected,
    })
  } catch (err) {
    console.error('[API /blud/rekap-pk POST]', err)
    // S-5: error dikenal (versi/row tidak ada) → 400 dgn pesan; sisanya generik
    const msg = err instanceof Error ? err.message : ''
    if (msg.startsWith('Tidak ada')) {
      return NextResponse.json({ ok: false, message: msg }, { status: 400 })
    }
    return NextResponse.json({ ok: false, message: 'Server error' }, { status: 500 })
  }
}
