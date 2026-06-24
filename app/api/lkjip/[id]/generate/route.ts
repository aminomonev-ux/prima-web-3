import { NextRequest, NextResponse } from 'next/server';
import { safeInt } from '@/lib/data/db';
import { writeAuditLog } from '@/lib/security/auditlog';
import { lkjipRateLimit } from '@/lib/lkjip/schemas';
import { generateLkjipDocx } from '@/lib/lkjip/docgen';
import { guard } from '../../_guard';

export const dynamic = 'force-dynamic';

// Unduh Word = MURNI download dokumen terkini (tanpa efek samping).
// Arsip ke Drive + snapshot DB ada di aksi "Simpan Versi" (hybrid), bukan di sini.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard();
  if (!g.ok) return g.res;
  const limited = await lkjipRateLimit(g.session.userId, 'generate', 20); if (limited) return limited;
  const id = safeInt((await params).id, 0);
  if (id <= 0) return NextResponse.json({ ok: false, msg: 'ID tidak valid' }, { status: 400 });

  let result: { buffer: Buffer; filename: string };
  try {
    result = await generateLkjipDocx(id);
  } catch {
    return NextResponse.json({ ok: false, msg: 'Dokumen tidak ditemukan atau gagal di-generate' }, { status: 404 });
  }
  await writeAuditLog({ req, eventType: 'LKJIP_GENERATE', userId: g.session.userId, username: g.session.username, detail: `LKJIP generate Word id=${id}` });

  return new NextResponse(new Uint8Array(result.buffer), {
    status: 200,
    headers: {
      'Content-Type':           'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition':    `attachment; filename="${encodeURIComponent(result.filename)}"`,
      'Content-Length':         String(result.buffer.length),
      'Cache-Control':          'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
