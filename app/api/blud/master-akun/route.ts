// app/api/blud/master-akun/route.ts
// Endpoint Master Akun BLUD — pattern audit Tahap 11.
// SEC: getSession + isBludRole guard.  VAL: Zod.  ATOMIC: withTransaction.

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/security/auth'
import { writeAuditLog } from '@/lib/security/auditlog'
import { isBludRole, bludRateLimit } from '@/lib/blud/schemas'
import { hasAppAccess } from '@/lib/security/guard'
import { MasterAkunBodySchema } from '@/lib/blud/master-akun-schemas'
import { getMasterAkun, getMasterAkunVersion, saveMasterAkun, MasterAkunSafetyError } from '@/lib/blud/master-akun-data'
import { BludVersionConflictError } from '@/lib/blud/lock'

export const dynamic = 'force-dynamic'

function unauthorized() {
  return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
}
function forbidden() {
  return NextResponse.json({ ok: false, error: 'Akses ditolak' }, { status: 403 })
}

// GET /api/blud/master-akun?q=search
export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return unauthorized()
  if (!(await hasAppAccess(session.userId, session.role, isBludRole))) return forbidden()

  try {
    const q = new URL(req.url).searchParams.get('q') ?? ''
    const [data, version] = await Promise.all([getMasterAkun(q), getMasterAkunVersion()])
    return NextResponse.json({ ok: true, data, version })
  } catch (err) {
    console.error('[API /blud/master-akun GET]', err)
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 })
  }
}

// POST /api/blud/master-akun — body: { rows: [{kode,uraian}, ...] } — replace all
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return unauthorized()
  if (!(await hasAppAccess(session.userId, session.role, isBludRole))) return forbidden()

  // Rate limit save: 30/menit/user
  const limited = await bludRateLimit(session.userId, 'save-master-akun', 30)
  if (limited) return limited

  const raw    = await req.json().catch(() => null)
  const parsed = MasterAkunBodySchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: 'Data tidak valid: ' + parsed.error.issues[0].message },
      { status: 400 },
    )
  }
  const { rows, force, expected_version } = parsed.data

  try {
    const result = await saveMasterAkun(rows, session.userId, expected_version, force)
    await writeAuditLog({
      req,
      eventType: 'BLUD_SAVE_MASTER_AKUN',
      userId:    session.userId,
      username:  session.username,
      detail:    `Simpan Master Akun: ${result.existing} → ${result.replaced} baris (v${expected_version}→${result.newVersion})${force ? ' (forced)' : ''}`,
    })
    return NextResponse.json({
      ok: true,
      message: `Master Akun tersimpan (${result.replaced} baris)`,
      existing: result.existing,
      replaced: result.replaced,
      version: result.newVersion,
    })
  } catch (err) {
    if (err instanceof BludVersionConflictError) {
      return NextResponse.json({
        ok: false, code: 'VERSION_CONFLICT', error: err.message,
        expected: err.expected, actual: err.actual,
      }, { status: 409 })
    }
    if (err instanceof MasterAkunSafetyError) {
      return NextResponse.json({
        ok:       false,
        code:     'SAFETY_THRESHOLD',
        error:    err.message,
        existing: err.existing,
        incoming: err.incoming,
        dropPct:  err.dropPct,
      }, { status: 409 })
    }
    console.error('[API /blud/master-akun POST]', err)
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 })
  }
}
