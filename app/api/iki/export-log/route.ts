// app/api/iki/export-log/route.ts
// Export PDF/Excel IKI digenerate client-side (jspdf/exceljs) — tidak ada route
// download yang bisa diaudit. Klien POST sekali per unduhan sukses (fire-and-forget)
// supaya audit trail tahu siapa export apa. Pola: app/api/blud/export-log.
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { writeAuditLog } from '@/lib/security/auditlog';
import { ikiRateLimit } from '@/lib/data/iki-schemas';
import { guard } from '../_guard';

export const dynamic = 'force-dynamic';

const BodySchema = z.object({
  format: z.enum(['pdf', 'xlsx']),
  mode: z.enum(['single', 'massal']).default('single'),
  dokumen_id: z.number().int().positive().optional(),
  tahun: z.string().regex(/^\d{4}$/).optional(),
  jumlah: z.number().int().nonnegative().max(1000).optional(),
});

export async function POST(req: NextRequest) {
  const g = await guard();
  if (!g.ok) return g.res;
  const limited = await ikiRateLimit(g.session.userId, 'export-log', 30);
  if (limited) return limited;

  const raw = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, message: 'Data tidak valid' }, { status: 400 });
  }
  const { format, mode, dokumen_id, tahun, jumlah } = parsed.data;
  await writeAuditLog({
    req,
    eventType: 'IKI_DOWNLOAD',
    userId: g.session.userId,
    username: g.session.username,
    detail: mode === 'massal'
      ? `Export massal ${format.toUpperCase()} IKI tahun ${tahun ?? '-'} (${jumlah ?? 0} dokumen)`
      : `Export ${format.toUpperCase()} dokumen IKI id=${dokumen_id ?? '-'}`,
  });
  return NextResponse.json({ ok: true });
}
