import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/data/db';
import { getSession } from '@/lib/security/auth';
import { hasAppAccess } from '@/lib/security/guard';
import { checkRateLimit } from '@/lib/security/ratelimit';
import { writeAuditLog } from '@/lib/security/auditlog';
import { RIMA_PROVIDERS, isRimaApp } from '@/lib/rima/registry';

// GET /api/rima/query — Q&A data-aware Rima (CONCEPT-rima-v3-data-aware.md §11, F6a).
// Dispatch multi-modul via registry (usulan/bba/pk). READ-ONLY (GET-only, tak menulis
// data modul — guard read-only bot 4da07d7 tetap utuh). Urutan guard WAJIB (L61):
// session → kill-switch fail-closed (G30) → app allowlist (G24) → guard modul →
// slot allowlist (G24) → rate-limit + cap-harian (G26) → dispatch (ownership L60/G20
// di provider) → audit. Angka SELALU dari query template, bukan klien/LLM.
export const runtime = 'nodejs';

const QUERY_FLAG = 'app_status_rima_query';

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });

    // G30 — kill-switch FAIL-CLOSED tunggal: governs SEMUA Q&A data (semua app).
    // Flag bukan 'online' (atau gagal dibaca) → 503, bukan diam-diam lanjut.
    let flag: string | undefined;
    try {
      const rows = await sql`SELECT value FROM app_config WHERE \`key\` = ${QUERY_FLAG}`;
      flag = (rows[0] as { value?: string } | undefined)?.value;
    } catch {
      return NextResponse.json({ ok: false, message: 'Fitur tanya-data sedang tidak tersedia.' }, { status: 503 });
    }
    if (flag !== 'online') {
      return NextResponse.json({ ok: false, message: 'Fitur tanya-data sedang dimatikan admin.' }, { status: 503 });
    }

    // G24 (app-level) — allowlist deny-by-default. Default 'usulan' = kompat klien lama.
    const { searchParams: p } = req.nextUrl;
    const app = p.get('app') ?? 'usulan';
    if (!isRimaApp(app))
      return NextResponse.json({ ok: false, message: 'Pertanyaan belum kukenali.' }, { status: 400 });
    const provider = RIMA_PROVIDERS[app];

    // L61 — guard modul (reuse fungsi role + app_access yang SAMA dgn endpoint modul, G31).
    if (!(await hasAppAccess(session.userId, session.role, provider.isRole)))
      return NextResponse.json({ ok: false, message: 'Akses ditolak' }, { status: 403 });

    // G24 (slot-level) — slot hanya BENTUK query (tak ada scope/created_by → tak bisa
    // melonggarkan akses, L60). Parse di provider (allowlist per-modul).
    const d = provider.dispatch({
      intent: p.get('intent') ?? undefined,
      tahun:  p.get('tahun') || undefined,
      no:     p.get('no') || undefined,
      jenis:  p.get('jenis') || undefined,
      topn:   p.get('topn') || undefined,
    });
    if (!d.ok)
      return NextResponse.json({ ok: false, message: 'Pertanyaan belum kukenali.' }, { status: 400 });

    // G26 — anti-scraping 2 lapis: burst per-menit (20/60) + plafon HARIAN (300/hari).
    // Burst lewat ≠ cek harian (jangan konsumsi kuota harian saat sudah diblok per-menit).
    // Lampaui salah satu → 429 + audit RIMA_QUERY_ABUSE (di-throttle 1×/menit/user via
    // key sendiri, anti banjir audit_log). Kuota dibagi lintas-app per user.
    const rl = await checkRateLimit(`rima-query:${session.userId}`, 20, 60);
    const daily = rl.allowed ? await checkRateLimit(`rima-query-daily:${session.userId}`, 300, 86400) : null;
    if (!rl.allowed || (daily && !daily.allowed)) {
      const kind = !rl.allowed ? 'burst' : 'cap-harian';
      const retry = !rl.allowed ? rl.resetIn : daily!.resetIn;
      const abuseAudit = await checkRateLimit(`rima-abuse-audit:${session.userId}`, 1, 60);
      if (abuseAudit.allowed)
        await writeAuditLog({
          req, eventType: 'RIMA_QUERY_ABUSE', userId: session.userId, username: session.username,
          detail: `${kind} — ${app}.${d.intent} tahun=${p.get('tahun') ?? '-'}`,
        });
      return NextResponse.json(
        { ok: false, message: `Terlalu banyak pertanyaan — coba lagi ${retry} detik lagi ya.` },
        { status: 429, headers: { 'Retry-After': String(retry) } },
      );
    }

    const result = await d.run(session.role, session.userId);

    // Audit: Rima permukaan akses data → terjejak, TERMASUK percobaan yang ditolak
    // (probing lintas-akses harus kelihatan, bukan senyap). Silent-fail di helper.
    await writeAuditLog({
      req, eventType: 'RIMA_QUERY', userId: session.userId, username: session.username,
      detail: `${result.ok ? 'ok' : 'denied'} ${app}.${d.intent} tahun=${p.get('tahun') ?? '-'} no=${p.get('no') ?? '-'}`,
    });

    if (!result.ok)
      return NextResponse.json({ ok: true, denied: true, data: null });

    return NextResponse.json({ ok: true, data: result.data });
  } catch (error) {
    console.error('[Rima Query Error]', error);
    return NextResponse.json({ ok: false, message: 'Terjadi kesalahan server.' }, { status: 500 });
  }
}
