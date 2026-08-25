// app/api/blud/export-log/route.ts
// Audit BLUD v1.2 (B-NEW-2): log event saat user klik export PDF/XLSX di cetak-client.
// Frontend POST sekali per klik download — supaya audit trail tahu siapa export apa.
//
// Pattern: getSession + pagar menu (`../_guard`) + Zod + writeAuditLog (no DB mutation).

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/security/auth'
import { writeAuditLog } from '@/lib/security/auditlog'
import { bludRateLimit } from '@/lib/blud/schemas'
import { bolehBukaMenu, forbidden, unauthorized, bludMati } from '../_guard'

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
  if (!session) return unauthorized()

  const mati = await bludMati(session.role)
  if (mati) return mati
  // Mengunduh bukan menulis: pemegang LIHAT justru HARUS lolos di sini, kalau tidak
  // unduhan mereka tak berjejak. Izinnya ikut menu Cetak — baca-saja bagi semua peran.
  if (!(await bolehBukaMenu(session.userId, session.role, 'cetak'))) return forbidden()

  // Endpoint ini tidak menulis data bisnis apa pun — hanya audit_log. Tanpa pagar,
  // satu akun sah bisa mengencerkan jejak audit dengan ribuan entri ekspor palsu.
  const limited = await bludRateLimit(session.userId, 'blud-export-log', 30)
  if (limited) return limited

  const raw    = await req.json().catch(() => null)
  const parsed = BodySchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'Ada isian yang belum benar.' }, { status: 400 })
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
