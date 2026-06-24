// POST /api/auth/promotion/submit
// Submit promotion request dengan 5-layer security:
//   L1 re-auth password, L2 secret code, L3 Turnstile, L4 rate-lock,
//   L5 dual-control (di-create sebagai PENDING — atau auto-COOLDOWN di bootstrap).
// Konsep: docs/session/ROLE_PROMOTION_CONCEPT.md §3-§4

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/security/auth';
import { getClientIp } from '@/lib/security/ratelimit';
import { verifyTurnstile } from '@/lib/security/recaptcha';
import { writeAuditLog } from '@/lib/security/auditlog';
import {
  PromotionSubmitBodySchema,
  promotionRateLimit,
  isValidPromotionChain,
} from '@/lib/data/promotion-schemas';
import {
  checkPromotionLock,
  verifyPromotionPassword,
  verifyPromotionSecret,
  incrementPromotionFailCount,
  clearPromotionFailCount,
  assertQuotaAvailable,
  isBootstrapMode,
  claimBootstrap,
  getActiveSuperAdminEmails,
  getActiveSuperAdminUsernames,
  getOwnerEmails,
} from '@/lib/security/promotion';
import {
  getActiveRequestByUser,
  createPromotionRequest,
  approveRequest,
} from '@/lib/data/promotion';
import {
  sendPromotionRequestSubmittedEmail,
  sendPromotionBootstrapAlertEmail,
} from '@/lib/services/email';
import { addPromotionNotif, notifySuperAdmins } from '@/lib/services/notifications';
import { sql } from '@/lib/data/db';

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
    }

    // Rate limit anti-DoS (terpisah dari L4 attempt counter).
    const limited = await promotionRateLimit(session.userId, 'submit', 5);
    if (limited) return limited;

    // Zod parse shape.
    const raw = await req.json().catch(() => null);
    const parsed = PromotionSubmitBodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, message: parsed.error.issues[0]?.message ?? 'Body tidak valid.' },
        { status: 400 },
      );
    }
    const { toRole, password, secret, reason, turnstileToken } = parsed.data;

    // Chain valid?
    if (!isValidPromotionChain(session.role, toRole)) {
      return NextResponse.json(
        { ok: false, message: 'Kombinasi role tidak dapat di-upgrade.' },
        { status: 400 },
      );
    }

    // ADMIN_KASUBAG/ADMIN_KABAG → SUPER_ADMIN by design DILARANG — di-cover oleh
    // chain check di atas (PROMOTION_CHAINS tidak punya key KASUBAG/KABAG).

    // Active req sudah ada? Cegah duplicate.
    const existing = await getActiveRequestByUser(session.userId);
    if (existing) {
      return NextResponse.json(
        { ok: false, message: 'Permohonan upgrade kamu sebelumnya masih aktif.' },
        { status: 409 },
      );
    }

    // L4 — cek lock dulu sebelum operasi mahal (turnstile/bcrypt).
    const lock = await checkPromotionLock(session.userId);
    if (lock.locked) {
      await writeAuditLog({
        req,
        eventType: 'PROMOTION_LOCKED',
        userId: session.userId,
        username: session.username,
        detail: `Submit blocked — locked until ${lock.until.toISOString()}`,
      });
      return NextResponse.json(
        { ok: false, message: 'Akun terkunci untuk promotion. Hubungi Super Admin.' },
        { status: 423 },
      );
    }

    // L3 — Turnstile.
    const ts = await verifyTurnstile(turnstileToken);
    if (!ts.ok) {
      await writeAuditLog({
        req,
        eventType: 'PROMOTION_TURNSTILE_FAIL',
        userId: session.userId,
        username: session.username,
      });
      return NextResponse.json(
        { ok: false, message: 'Captcha tidak valid. Refresh dan coba lagi.' },
        { status: 403 },
      );
    }

    // L1 — re-auth password.
    const passOk = await verifyPromotionPassword(session.userId, password);
    if (!passOk) {
      const result = await incrementPromotionFailCount(session.userId);
      await writeAuditLog({
        req,
        eventType: 'PROMOTION_BAD_PASSWORD',
        userId: session.userId,
        username: session.username,
        detail: `count=${result.count} locked=${result.nowLocked}`,
      });
      return NextResponse.json(
        {
          ok: false,
          message: result.nowLocked
            ? 'Password salah. Akun terkunci 24 jam karena melebihi batas percobaan.'
            : 'Password salah.',
        },
        { status: 401 },
      );
    }

    // L2 — secret code (timing-safe).
    if (!verifyPromotionSecret(secret)) {
      const result = await incrementPromotionFailCount(session.userId);
      await writeAuditLog({
        req,
        eventType: 'PROMOTION_BAD_SECRET',
        userId: session.userId,
        username: session.username,
        detail: `count=${result.count} locked=${result.nowLocked}`,
      });
      return NextResponse.json(
        {
          ok: false,
          message: result.nowLocked
            ? 'Secret code salah. Akun terkunci 24 jam karena melebihi batas percobaan.'
            : 'Secret code salah.',
        },
        { status: 401 },
      );
    }

    // L1+L2 success → clear counter.
    await clearPromotionFailCount(session.userId);

    // Quota check target role (kecuali bootstrap SUPER_ADMIN — bootstrap berarti
    // SA count = 0, quota 4 pasti available).
    try {
      await assertQuotaAvailable(toRole);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Quota role penuh.';
      return NextResponse.json({ ok: false, message: msg }, { status: 409 });
    }

    // Bootstrap branch: chain ADMIN → SUPER_ADMIN + no SA aktif + flag NULL.
    // L52 race protection: claim flag atomic SEBELUM create+approve. Kalau 2
    // user submit barengan, hanya 1 yang menang claim; sisa fallback non-bootstrap.
    const ipAddress = getClientIp(req);
    const userAgent = (req.headers.get('user-agent') ?? '').slice(0, 250) || null;

    let bootstrap = false;
    if (toRole === 'SUPER_ADMIN' && (await isBootstrapMode())) {
      bootstrap = await claimBootstrap();
      // Kalau claim gagal = race lost → fall through ke non-bootstrap path.
    }

    const reqId = await createPromotionRequest({
      userId: session.userId,
      fromRole: session.role,
      toRole,
      reason,
      isBootstrap: bootstrap,
      ipAddress,
      userAgent,
    });

    if (bootstrap) {
      // Auto-approve: PENDING → COOLDOWN (skip L5). Flag sudah di-claim.
      const ok = await approveRequest(reqId, session.userId);
      if (!ok) {
        return NextResponse.json(
          { ok: false, message: 'Gagal auto-approve bootstrap.' },
          { status: 500 },
        );
      }
      await writeAuditLog({
        req,
        eventType: 'PROMOTION_BOOTSTRAP_SUPER_ADMIN',
        userId: session.userId,
        username: session.username,
        detail: `Bootstrap ADMIN→SUPER_ADMIN — reqId=${reqId}`,
      });
      const ownerEmails = getOwnerEmails();
      const userRows = await sql`SELECT email FROM users WHERE id = ${session.userId} LIMIT 1` as Array<{ email: string }>;
      void sendPromotionBootstrapAlertEmail(ownerEmails, {
        username: session.username,
        email: userRows[0]?.email ?? '',
        ipAddress,
        userAgent,
        timestamp: new Date(),
      });
      return NextResponse.json({
        ok: true,
        message: 'Bootstrap SUPER_ADMIN — role aktif setelah cooldown 5 menit.',
        data: { reqId, bootstrap: true },
      });
    }

    // Non-bootstrap: notify SA queue (in-app + email).
    await writeAuditLog({
      req,
      eventType: 'PROMOTION_REQUEST_SUBMIT',
      userId: session.userId,
      username: session.username,
      detail: `reqId=${reqId} ${session.role}→${toRole}`,
    });

    void notifySuperAdmins(
      'PROMOTION_NEW_REQUEST',
      `<b>${session.username}</b> mengajukan upgrade ${session.role} → ${toRole}`,
    );
    const saEmails = await getActiveSuperAdminEmails();
    void getActiveSuperAdminUsernames(); // warm up cache; not needed here
    const userRows = await sql`SELECT nama_lengkap FROM users WHERE id = ${session.userId} LIMIT 1` as Array<{ nama_lengkap: string | null }>;
    void sendPromotionRequestSubmittedEmail(saEmails, {
      requesterName: userRows[0]?.nama_lengkap ?? session.username,
      requesterUsername: session.username,
      fromRole: session.role,
      toRole,
      reason,
      reqId,
    });

    return NextResponse.json({
      ok: true,
      message: 'Permohonan upgrade dikirim. Menunggu approval Super Admin.',
      data: { reqId, bootstrap: false },
    });
  } catch (err) {
    console.error('[Promotion Submit Error]', err);
    return NextResponse.json({ ok: false, message: 'Terjadi kesalahan server.' }, { status: 500 });
  }
}
