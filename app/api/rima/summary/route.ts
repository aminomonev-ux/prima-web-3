import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/data/db';
import { getSession } from '@/lib/security/auth';
import { hasAppAccess } from '@/lib/security/guard';
import { checkRateLimit } from '@/lib/security/ratelimit';
import { writeAuditLog } from '@/lib/security/auditlog';
import { RIMA_APPS, RIMA_PROVIDERS } from '@/lib/rima/registry';

// GET /api/rima/summary — #4 "Tugasku" lintas-modul. Agregasi count "menunggu aksi"
// dari SETIAP provider yang boleh diakses user (ownership dihitung di provider, L60/
// G20). READ-ONLY. Guard sama dgn /api/rima/query (L61): session → kill-switch
// fail-closed (G30, flag tunggal) → rate-limit (G26, kuota dibagi dgn query) → loop
// provider ber-akses → inbox per-modul → audit. Tak ada slot klien → tak ada cara
// melonggarkan akses.
export const runtime = 'nodejs';

const QUERY_FLAG = 'app_status_rima_query';

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });

    let flag: string | undefined;
    try {
      const rows = await sql`SELECT value FROM app_config WHERE \`key\` = ${QUERY_FLAG}`;
      flag = (rows[0] as { value?: string } | undefined)?.value;
    } catch {
      return NextResponse.json({ ok: false, message: 'Fitur tanya-data sedang tidak tersedia.' }, { status: 503 });
    }
    if (flag !== 'online')
      return NextResponse.json({ ok: false, message: 'Fitur tanya-data sedang dimatikan admin.' }, { status: 503 });

    // G26 — pakai kuota yang SAMA dgn query (anti-scraping lintas-endpoint).
    const rl = await checkRateLimit(`rima-query:${session.userId}`, 20, 60);
    const daily = rl.allowed ? await checkRateLimit(`rima-query-daily:${session.userId}`, 300, 86400) : null;
    if (!rl.allowed || (daily && !daily.allowed)) {
      const retry = !rl.allowed ? rl.resetIn : daily!.resetIn;
      const abuseAudit = await checkRateLimit(`rima-abuse-audit:${session.userId}`, 1, 60);
      if (abuseAudit.allowed)
        await writeAuditLog({
          req, eventType: 'RIMA_QUERY_ABUSE', userId: session.userId, username: session.username,
          detail: `${!rl.allowed ? 'burst' : 'cap-harian'} — summary`,
        });
      return NextResponse.json(
        { ok: false, message: `Terlalu banyak pertanyaan — coba lagi ${retry} detik lagi ya.` },
        { status: 429, headers: { 'Retry-After': String(retry) } },
      );
    }

    const modules: { app: string; title: string; label: string | null; aksi: string; count: number; total_nilai: number }[] = [];
    for (const app of RIMA_APPS) {
      const provider = RIMA_PROVIDERS[app];
      if (!(await hasAppAccess(session.userId, session.role, provider.isRole))) continue;
      const ic = await provider.inbox(session.role, session.userId);
      modules.push({ app, title: provider.title, ...ic });
    }

    await writeAuditLog({
      req, eventType: 'RIMA_QUERY', userId: session.userId, username: session.username,
      detail: `ok summary modul=${modules.length} pending=${modules.reduce((a, m) => a + m.count, 0)}`,
    });

    return NextResponse.json({ ok: true, data: { kind: 'summary', modules } });
  } catch (error) {
    console.error('[Rima Summary Error]', error);
    return NextResponse.json({ ok: false, message: 'Terjadi kesalahan server.' }, { status: 500 });
  }
}
