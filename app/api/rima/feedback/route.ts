import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { sql, sqlInt } from '@/lib/data/db';
import { getSession } from '@/lib/security/auth';
import { checkRateLimit } from '@/lib/security/ratelimit';
import { writeAuditLog } from '@/lib/security/auditlog';
import { redactPii } from '@/lib/sentinel/redact';

// /api/rima/feedback — #2 fail-log mining + RAL-2/3 active learning
// (CONCEPT-rima-v4-learning.md). POST: telemetri belajar (UNANSWERED /
// CANDIDATE_PICK / THUMBS_*). GET: agregat | ?view=label | ?export=1 (admin).
// PATCH: label/abaikan per teks pertanyaan (admin, diaudit RIMA_LABEL).
// READ-ONLY terhadap data modul; hanya menulis tabel telemetri sendiri.
// Privasi: teks user di-redaksi DULU di klien (R4/G27), DI-redaksi LAGI di server
// (defense-in-depth) sebelum simpan.
export const runtime = 'nodejs';

// Intent = slug KB (usulan.buat) atau data (usulan.rekap) — allowlist bentuk saja;
// isi dicek saat training (RAL-4 memvalidasi ke KB, intent asing dilewati).
const INTENT_RE = /^[a-z0-9][a-z0-9._-]{1,63}$/i;

const FeedbackSchema = z.object({
  question: z.string().trim().min(1).max(200),
  page:     z.string().trim().max(120).optional(),
  kind:     z.enum(['UNANSWERED', 'CANDIDATE_PICK', 'THUMBS_UP', 'THUMBS_DOWN']).optional(),
  chosen_intent: z.string().trim().regex(INTENT_RE).optional(),
});

const isFeedbackAdmin = (role: string) => role === 'SUPER_ADMIN' || role === 'ADMIN';

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
  const kind = parsed.data.kind ?? 'UNANSWERED';
  // RAL-2: klik kandidat/thumbs membawa intent; UNANSWERED tidak.
  const chosenIntent = kind === 'UNANSWERED' ? null : (parsed.data.chosen_intent ?? null);
  try {
    await sql`
      INSERT INTO rima_unanswered (question, kind, chosen_intent, page, user_id, role)
      VALUES (${question}, ${kind}, ${chosenIntent}, ${page}, ${session.userId}, ${session.role})`;
  } catch {
    // telemetri best-effort — jangan ganggu pengalaman chat
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ ok: true });
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || !isFeedbackAdmin(session.role))
    return NextResponse.json({ ok: false, message: 'Akses ditolak' }, { status: 403 });

  const view = req.nextUrl.searchParams.get('view');
  try {
    // RAL-3/7c export: dataset training {text, intent, weak}. Label admin = kuat;
    // label AUTO dari validasi user = lemah (bobot kecil di RAL-4): klik kandidat
    // (CANDIDATE_PICK) + jawaban yang di-👍 (THUMBS_UP = user konfirmasi benar).
    // Intent berprefiks "data." (jawaban data-query) dikecualikan — bukan kelas
    // classifier KB. THUMBS_DOWN sengaja TIDAK auto (tahu salah ≠ tahu benarnya).
    if (view === 'export') {
      const labeled = await sql`
        SELECT DISTINCT question AS text, label_intent AS intent
          FROM rima_unanswered
         WHERE label_status = 'DILABELI' AND label_intent IS NOT NULL`;
      const autoWeak = await sql`
        SELECT DISTINCT question AS text, chosen_intent AS intent
          FROM rima_unanswered
         WHERE kind IN ('CANDIDATE_PICK', 'THUMBS_UP') AND chosen_intent IS NOT NULL
           AND chosen_intent NOT LIKE ${'data.%'}
           AND label_status <> 'DIABAIKAN'`;
      const seen = new Set((labeled as { text: string }[]).map(r => r.text));
      const data = [
        ...(labeled as { text: string; intent: string }[]).map(r => ({ ...r, weak: false })),
        ...(autoWeak as { text: string; intent: string }[])
          .filter(r => !seen.has(r.text))
          .map(r => ({ ...r, weak: true })),
      ];
      return NextResponse.json({ ok: true, data });
    }
    // RAL-3 workbench: agregat BARU per pertanyaan + sinyal thumbs-down & pick.
    // THUMBS_UP dikecualikan — sudah auto-label (RAL-7c), tak perlu antre.
    if (view === 'label') {
      const rows = await sql`
        SELECT question,
               COUNT(*) AS jumlah,
               MAX(created_at) AS terakhir,
               SUM(kind = 'THUMBS_DOWN') AS buruk,
               SUM(kind = 'CANDIDATE_PICK') AS dipilih,
               MAX(CASE WHEN kind = 'CANDIDATE_PICK' THEN chosen_intent END) AS usul_intent
          FROM rima_unanswered
         WHERE label_status = 'BARU' AND kind <> 'THUMBS_UP'
         GROUP BY question
         ORDER BY jumlah DESC, terakhir DESC
         LIMIT ${sqlInt(200)}`;
      return NextResponse.json({ ok: true, data: rows });
    }
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

// RAL-3 — label/abaikan per teks pertanyaan (mengenai SEMUA baris BARU dgn teks
// sama; agregat GET view=label memang per-teks). Admin-only + audit RIMA_LABEL.
const LabelSchema = z.object({
  question: z.string().trim().min(1).max(200),
  action:   z.enum(['LABEL', 'ABAIKAN']),
  intent:   z.string().trim().regex(INTENT_RE).optional(),
}).refine(v => v.action !== 'LABEL' || !!v.intent, { message: 'intent wajib untuk LABEL' });

export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session || !isFeedbackAdmin(session.role))
    return NextResponse.json({ ok: false, message: 'Akses ditolak' }, { status: 403 });

  const rl = await checkRateLimit(`rima-label:${session.userId}`, 60, 60);
  if (!rl.allowed)
    return NextResponse.json({ ok: false }, { status: 429, headers: { 'Retry-After': String(rl.resetIn) } });

  const raw = await req.json().catch(() => null);
  const parsed = LabelSchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ ok: false, message: 'Input tidak valid.' }, { status: 400 });

  const { question, action, intent } = parsed.data;
  try {
    const result = action === 'LABEL'
      ? await sql`
          UPDATE rima_unanswered
             SET label_status = 'DILABELI', label_intent = ${intent},
                 labeled_by = ${session.userId}, labeled_at = NOW()
           WHERE question = ${question} AND label_status = 'BARU'`
      : await sql`
          UPDATE rima_unanswered
             SET label_status = 'DIABAIKAN', label_intent = NULL,
                 labeled_by = ${session.userId}, labeled_at = NOW()
           WHERE question = ${question} AND label_status = 'BARU'`;
    // L53: sql wrapper return non-SELECT sebagai array [{affectedRows}]
    const affected = (result as unknown as Array<{ affectedRows?: number }>)[0]?.affectedRows ?? 0;
    await writeAuditLog({
      req, eventType: 'RIMA_LABEL', userId: session.userId, username: session.username,
      detail: `${action}${intent ? `→${intent}` : ''} (${affected} baris) — "${question.slice(0, 80)}"`,
    });
    return NextResponse.json({ ok: true, affected });
  } catch (error) {
    console.error('[Rima Feedback PATCH Error]', error);
    return NextResponse.json({ ok: false, message: 'Terjadi kesalahan server.' }, { status: 500 });
  }
}
