// app/api/blud/dpa/import-usulan/route.ts
// GET — daftar item Usulan Kebutuhan final (disetujui Kabag) untuk modal import DPA.
// Read-only: transformasi level/parent terjadi client-side, jejak permanen tercatat
// saat Simpan DPA (kolom origin/usulan_item_id). Ref: CONCEPT-import-usulan-dpa §6.

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/security/auth'
import { writeAuditLog } from '@/lib/security/auditlog'
import { isBludRole, bludRateLimit } from '@/lib/blud/schemas'
import { hasAppAccess } from '@/lib/security/guard'
import { listDpaImportCandidates } from '@/lib/blud/import-usulan-data'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  if (!(await hasAppAccess(session.userId, session.role, isBludRole))) {
    return NextResponse.json({ ok: false, error: 'Akses ditolak' }, { status: 403 })
  }

  const limited = await bludRateLimit(session.userId, 'import-usulan-list', 30)
  if (limited) return limited

  try {
    const data = await listDpaImportCandidates()
    // L39-lite: akses data lintas-modul (usulan → blud) selalu tercatat
    await writeAuditLog({
      req,
      eventType: 'BLUD_IMPORT_USULAN_VIEW',
      userId:    session.userId,
      username:  session.username,
      detail:    `Buka modal import usulan ke DPA: ${data.length} kandidat final`,
    })
    return NextResponse.json({ ok: true, data })
  } catch (err) {
    console.error('[API /blud/dpa/import-usulan GET]', err)
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 })
  }
}
