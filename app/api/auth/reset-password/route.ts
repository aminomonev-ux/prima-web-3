// SEC-C5: Consumer endpoint untuk token dari forgot-password email.
// - Token di DB sudah hashed (SHA-256). Bandingkan hash, bukan raw.
// - Single-use: clear token setelah pakai.
// - Time-limited: cek expiry.
// - Invalidate semua session aktif setelah reset (force re-login).

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/data/db';
import { checkRateLimit, getClientIp } from '@/lib/security/ratelimit';
import { writeAuditLog } from '@/lib/security/auditlog';
import { hashPassword } from '@/lib/security/auth';
import { ResetPasswordBodySchema } from '@/lib/data/auth-schemas';
import crypto from 'crypto';

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const rl = await checkRateLimit(`reset-pw:${ip}`, 5, 600); // 5 attempts / 10 min per IP
    if (!rl.allowed) {
      return NextResponse.json(
        { ok: false, message: `Terlalu banyak permintaan. Coba lagi dalam ${rl.resetIn} detik.` },
        { status: 429, headers: { 'Retry-After': String(rl.resetIn) } }
      );
    }

    // SDL-M11: Zod safeParse + complexity rule konsisten dengan admin/users PATCH.
    const raw    = await req.json().catch(() => null);
    const parsed = ResetPasswordBodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, message: parsed.error.issues[0]?.message ?? 'Input tidak valid' }, { status: 400 });
    }
    const { token, newPassword } = parsed.data;

    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    const users = await sql`
      SELECT id, username
      FROM users
      WHERE reset_token = ${hashedToken}
        AND reset_token_expiry IS NOT NULL
        AND reset_token_expiry > NOW()
      LIMIT 1
    ` as Array<{ id: number; username: string }>;

    if (!users.length) {
      return NextResponse.json({ ok: false, message: 'Token tidak valid atau sudah kadaluwarsa.' }, { status: 400 });
    }

    const user = users[0];
    const hashedPwd = await hashPassword(newPassword);

    // Update password + clear token (single-use)
    await sql`
      UPDATE users
      SET password_hash = ${hashedPwd}, reset_token = NULL, reset_token_expiry = NULL
      WHERE id = ${user.id}
    `;

    // Invalidate semua session aktif user → force re-login dengan password baru
    await sql`
      UPDATE user_sessions SET invalidated_at = NOW()
      WHERE user_id = ${user.id} AND invalidated_at IS NULL
    `;

    await writeAuditLog({
      req,
      eventType: 'PASSWORD_RESET',
      userId: user.id,
      username: user.username,
      detail: 'Password berhasil di-reset via email link',
    });

    return NextResponse.json({ ok: true, message: 'Password berhasil di-reset. Silakan login dengan password baru.' });

  } catch (error) {
    console.error('[ResetPassword Error]', error);
    return NextResponse.json({ ok: false, message: 'Terjadi kesalahan server.' }, { status: 500 });
  }
}
