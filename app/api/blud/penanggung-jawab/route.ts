import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/security/auth'
import { writeAuditLog } from '@/lib/security/auditlog'
import { bludRateLimit } from '@/lib/blud/schemas'
import { bolehLihatSalahSatu, bolehEditMenu, forbidden, tolakEdit, unauthorized, bludMati } from '../_guard'
import { PenanggungJawabBodySchema } from '@/lib/blud/penanggung-jawab-schemas'
import { getPenanggungJawab, getPenanggungJawabVersion, savePenanggungJawab, PenanggungJawabSafetyError } from '@/lib/blud/penanggung-jawab-data'
import { BludVersionConflictError } from '@/lib/blud/lock'

export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await getSession()
  if (!session) return unauthorized()

  const mati = await bludMati(session.role)
  if (mati) return mati
  // Mengisi kolom Penanggung Jawab di layar DPA & Pergeseran juga — sama pola
  // master-akun/route.ts: guard menyebut menu yang MENAMPILKAN datanya.
  if (!(await bolehLihatSalahSatu(session.userId, session.role, ['penanggung-jawab', 'dpa', 'pergeseran']))) return forbidden()

  const limited = await bludRateLimit(session.userId, 'view-penanggung-jawab', 60)
  if (limited) return limited

  try {
    const [data, version] = await Promise.all([getPenanggungJawab(), getPenanggungJawabVersion()])
    return NextResponse.json({ ok: true, data, version })
  } catch (err) {
    console.error('[API /blud/penanggung-jawab GET]', err)
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return unauthorized()

  const mati = await bludMati(session.role)
  if (mati) return mati
  if (!(await bolehEditMenu(session.userId, session.role, 'penanggung-jawab'))) return tolakEdit('penanggung-jawab')

  const limited = await bludRateLimit(session.userId, 'save-penanggung-jawab', 30)
  if (limited) return limited

  const raw    = await req.json().catch(() => null)
  const parsed = PenanggungJawabBodySchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'Data tidak valid: ' + parsed.error.issues[0].message }, { status: 400 })
  }
  const { rows, force, expected_version } = parsed.data

  try {
    const result = await savePenanggungJawab(rows, session.userId, expected_version, force)
    await writeAuditLog({
      req,
      eventType: 'BLUD_SAVE_PENANGGUNG_JAWAB',
      userId:    session.userId,
      username:  session.username,
      detail:    `Simpan Penanggung Jawab: ${result.existing} → ${result.replaced} baris (v${expected_version}→${result.newVersion})${force ? ' (forced)' : ''}`,
    })
    return NextResponse.json({ ok: true, message: `Penanggung Jawab tersimpan (${result.replaced} baris)`, ...result, version: result.newVersion })
  } catch (err) {
    if (err instanceof BludVersionConflictError) {
      return NextResponse.json({
        ok: false, code: 'VERSION_CONFLICT', error: err.message,
        expected: err.expected, actual: err.actual,
      }, { status: 409 })
    }
    if (err instanceof PenanggungJawabSafetyError) {
      return NextResponse.json({
        ok: false, code: 'SAFETY_THRESHOLD', error: err.message,
        existing: err.existing, incoming: err.incoming, dropPct: err.dropPct,
      }, { status: 409 })
    }
    console.error('[API /blud/penanggung-jawab POST]', err)
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 })
  }
}
