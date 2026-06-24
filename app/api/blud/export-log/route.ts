// app/api/blud/export-log/route.ts
// Audit BLUD v1.2 (B-NEW-2): log event saat user klik export PDF/XLSX di cetak-client.
// Frontend POST sekali per klik download — supaya audit trail tahu siapa export apa.
//
// Pattern: getSession + isBludRole + Zod + writeAuditLog (no DB mutation).

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/security/auth'
import { writeAuditLog } from '@/lib/security/auditlog'
import { isBludRole } from '@/lib/blud/schemas'
import { hasAppAccess } from '@/lib/security/guard'

export const dynamic = 'force-dynamic'

const BodySchema = z.object({
  type:  z.enum(['pdf', 'xlsx']),
  menu:  z.enum(['dpa', 'pergeseran', 'master-akun']),
  view:  z.string().max(64).optional(),
  versi: z.string().max(32).nullable().optional(),
  rows:  z.number().int().nonnegative().max(10000).optional(),
})

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  if (!(await hasAppAccess(session.userId, session.role, isBludRole))) return NextResponse.json({ ok: false, error: 'Akses ditolak' }, { status: 403 })

  const raw    = await req.json().catch(() => null)
  const parsed = BodySchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'Data tidak valid' }, { status: 400 })
  }
  const { type, menu, view, versi, rows } = parsed.data

  await writeAuditLog({
    req,
    eventType: type === 'pdf' ? 'BLUD_EXPORT_PDF' : 'BLUD_EXPORT_XLSX',
    userId:    session.userId,
    username:  session.username,
    detail:    `Export ${type.toUpperCase()} ${menu}${view ? `/${view}` : ''}${versi ? ` versi ${versi}` : ''}${rows != null ? ` (${rows} baris)` : ''}`,
  })

  return NextResponse.json({ ok: true })
}
