// app/api/blud/dpa/import-usulan/route.ts
// GET — daftar item Usulan Kebutuhan final (disetujui Kabag) untuk modal import DPA.
// Read-only: transformasi level/parent terjadi client-side, jejak permanen tercatat
// saat Simpan DPA (kolom origin/usulan_item_id). Ref: CONCEPT-import-usulan-dpa §6.

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/security/auth'
import { writeAuditLog } from '@/lib/security/auditlog'
import { bludRateLimit } from '@/lib/blud/schemas'
import { bolehEditMenu, tolakEdit, unauthorized } from '../../_guard'
import { listDpaImportCandidates } from '@/lib/blud/import-usulan-data'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return unauthorized()
  // GET, tapi satu-satunya gunanya menyiapkan tulisan ke DPA — jadi izinnya izin tulis
  // menu DPA, bukan izin baca. Pemegang LIHAT tak punya tombolnya, dan tak perlu daftarnya.
  if (!(await bolehEditMenu(session.userId, session.role, 'dpa'))) return tolakEdit('dpa')

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
