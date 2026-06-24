// app/api/blud/kode-besar/route.ts
// Endpoint Kode Besar BLUD — mirror pattern master-akun.
// SEC: getSession + isBludRole. VAL: Zod. ATOMIC: withTransaction.
// PERF: bulkInsert. RATE LIMIT: bludRateLimit 30/min (POST).

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/security/auth'
import { writeAuditLog } from '@/lib/security/auditlog'
import { isBludRole, bludRateLimit } from '@/lib/blud/schemas'
import { hasAppAccess } from '@/lib/security/guard'
import { KodeBesarBodySchema } from '@/lib/blud/kode-besar-schemas'
import { getKodeBesar, getKodeBesarVersion, saveKodeBesar, KodeBesarSafetyError } from '@/lib/blud/kode-besar-data'
import { BludVersionConflictError } from '@/lib/blud/lock'

export const dynamic = 'force-dynamic'

function unauthorized() {
  return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
}
function forbidden() {
  return NextResponse.json({ ok: false, error: 'Akses ditolak' }, { status: 403 })
}

// GET /api/blud/kode-besar?q=search
export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return unauthorized()
  if (!(await hasAppAccess(session.userId, session.role, isBludRole))) return forbidden()

  try {
    const q = new URL(req.url).searchParams.get('q') ?? ''
    const [data, version] = await Promise.all([getKodeBesar(q), getKodeBesarVersion()])
    return NextResponse.json({ ok: true, data, version })
  } catch (err) {
    console.error('[API /blud/kode-besar GET]', err)
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 })
  }
}

// POST /api/blud/kode-besar — body: { rows, force? } — replace all
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return unauthorized()
  if (!(await hasAppAccess(session.userId, session.role, isBludRole))) return forbidden()

  // Rate limit save: 30/menit/user
  const limited = await bludRateLimit(session.userId, 'save-kode-besar', 30)
  if (limited) return limited

  const raw    = await req.json().catch(() => null)
  const parsed = KodeBesarBodySchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: 'Data tidak valid: ' + parsed.error.issues[0].message },
      { status: 400 },
    )
  }
  const { rows, force, expected_version } = parsed.data

  try {
    const result = await saveKodeBesar(rows, session.userId, expected_version, force)
    await writeAuditLog({
      req,
      eventType: 'BLUD_SAVE_KODE_BESAR',
      userId:    session.userId,
      username:  session.username,
      detail:    `Simpan Kode Besar: ${result.existing} → ${result.replaced} baris (v${expected_version}→${result.newVersion})${force ? ' (forced)' : ''}`,
    })
    return NextResponse.json({
      ok: true,
      message: `Kode Besar tersimpan (${result.replaced} baris)`,
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
    if (err instanceof KodeBesarSafetyError) {
      return NextResponse.json({
        ok:       false,
        code:     'SAFETY_THRESHOLD',
        error:    err.message,
        existing: err.existing,
        incoming: err.incoming,
        dropPct:  err.dropPct,
      }, { status: 409 })
    }
    console.error('[API /blud/kode-besar POST]', err)
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 })
  }
}
