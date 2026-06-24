import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { sql, sqlInt } from '@/lib/data/db';
import { getSession } from '@/lib/security/auth';
import { checkRateLimit } from '@/lib/security/ratelimit';
import { redactPii } from '@/lib/sentinel/redact';

// /api/rima/feedback — #2 fail-log mining. POST: kumpulkan pertanyaan Rima yang
// tak terjawab (bahan tumbuh KB). GET: agregat untuk admin (SUPER_ADMIN/ADMIN).
// READ-ONLY terhadap data modul; hanya menulis tabel telemetri sendiri.
// Privasi: teks user di-redaksi DULU di klien (R4/G27), DI-redaksi LAGI di server
// (defense-in-depth) sebelum simpan.
export const runtime = 'nodejs';

const FeedbackSchema = z.object({
  question: z.string().trim().min(1).max(200),
  page:     z.string().trim().max(120).optional(),
});

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });

  const rl = await checkRateLimit(`rima-feedback:${session.userId}`, 30, 60);
  if (!rl.allowed)
    return NextResponse.json({ ok: false }, { status: 429, headers: { 'Retry-After': String(rl.resetIn) } });

  const raw = await req.json().catch(() => null);
  const parsed = FeedbackSchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ ok: false, message: 'Input tidak valid.' }, { status: 400 });

  const question = redactPii(parsed.data.question).slice(0, 200);
  const page = parsed.data.page ? parsed.data.page.slice(0, 120) : null;
  try {
    await sql`
      INSERT INTO rima_unanswered (question, page, user_id, role)
      VALUES (${question}, ${page}, ${session.userId}, ${session.role})`;
  } catch {
    // telemetri best-effort — jangan ganggu pengalaman chat
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ ok: true });
}

export async function GET() {
  const session = await getSession();
  if (!session || (session.role !== 'SUPER_ADMIN' && session.role !== 'ADMIN'))
    return NextResponse.json({ ok: false, message: 'Akses ditolak' }, { status: 403 });

  try {
    const rows = await sql`
      SELECT question, COUNT(*) AS jumlah, MAX(created_at) AS terakhir
        FROM rima_unanswered
       GROUP BY question
       ORDER BY jumlah DESC, terakhir DESC
       LIMIT ${sqlInt(100)}`;
    return NextResponse.json({ ok: true, data: rows });
  } catch (error) {
    console.error('[Rima Feedback GET Error]', error);
    return NextResponse.json({ ok: false, message: 'Terjadi kesalahan server.' }, { status: 500 });
  }
}
