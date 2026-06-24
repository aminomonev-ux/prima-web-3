
import { NextRequest, NextResponse } from 'next/server';
import { sql, toMysqlDatetime } from '@/lib/data/db';
import { writeAuditLog } from '@/lib/security/auditlog';
import { checkRateLimit, getClientIp } from '@/lib/security/ratelimit';
import { RESET_PW_RATE_LIMIT_REQUESTS, RESET_PW_RATE_LIMIT_WINDOW } from '@/lib/constants';
import { sendEmail } from '@/lib/services/email';
import { UsernameOrEmailBodySchema } from '@/lib/data/auth-schemas';
import crypto from 'crypto';

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const rl = await checkRateLimit(`forgot:${ip}`, RESET_PW_RATE_LIMIT_REQUESTS, RESET_PW_RATE_LIMIT_WINDOW);
    if (!rl.allowed) {
      return NextResponse.json(
        { ok: false, message: `Terlalu banyak permintaan. Coba lagi dalam ${rl.resetIn} detik.` },
        { status: 429, headers: { 'Retry-After': String(rl.resetIn) } }
      );
    }

    // V5-AUTH-07: validasi Zod konsisten dgn resend-verification/reset-password.
    const raw    = await req.json().catch(() => null);
    const parsed = UsernameOrEmailBodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, message: parsed.error.issues[0]?.message ?? 'Input tidak valid' }, { status: 400 });
    }
    const input = parsed.data.usernameOrEmail.toLowerCase();

    const users = await sql`
      SELECT id, email, username, status
      FROM users
      WHERE LOWER(username) = ${input} OR LOWER(email) = ${input}
      LIMIT 1
    `;

    type UserRow = { id: number; email: string; username: string; status: string };
    if (!users.length || (users[0] as UserRow).status !== 'AKTIF') {
      // SEC-W4: jalankan dummy work + sleep agar timing parity dengan happy
      // path (DB UPDATE token + sendEmail ~200-500ms). Tanpa ini, attacker
      // bisa enumerate username via response-time difference (<10ms vs ratusan ms).
      crypto.createHash('sha256').update(crypto.randomBytes(32)).digest('hex');
      await new Promise(r => setTimeout(r, 250 + Math.floor(Math.random() * 150)));
      return NextResponse.json({ ok: true, message: 'Jika akun ditemukan, link reset telah dikirim.' });
    }

    const user = users[0] as UserRow;

    // SEC-C5: store HASHED token di DB, kirim RAW token via email.
    // DB leak tidak langsung berarti attacker punya token usable.
    const rawToken    = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiry = toMysqlDatetime(new Date(Date.now() + 60 * 60 * 1000));

    await sql`
      UPDATE users
      SET reset_token = ${hashedToken}, reset_token_expiry = ${expiry}
      WHERE id = ${user.id}
    `;

    const resetUrl = `${process.env.NEXT_PUBLIC_APP_URL}/reset-password?token=${rawToken}`;

    await sendEmail({
      to: user.email,
      subject: 'Reset Password PRIMA',
      eventType: 'RESET_PASSWORD',
      html: `<div style="font-family:sans-serif;max-width:480px;margin:auto">
        <h2 style="color:#00d4ff">Reset Password PRIMA</h2>
        <p>Halo <strong>${user.username}</strong>,</p>
        <p>Klik tombol di bawah untuk mereset password kamu. Link berlaku <strong>1 jam</strong>.</p>
        <a href="${resetUrl}" style="display:inline-block;margin:16px 0;padding:12px 24px;background:#00d4ff;color:#000;border-radius:6px;text-decoration:none;font-weight:bold">Reset Password</a>
        <p style="color:#888;font-size:12px">Jika kamu tidak meminta reset password, abaikan email ini.</p>
        <hr style="border-color:#333"/>
        <p style="color:#888;font-size:11px">PRIMA — RSJD Dr. Amino Gondohutomo</p>
      </div>`,
    });

    await writeAuditLog({ req, eventType: 'PASSWORD_RESET', userId: user.id, username: user.username });

    return NextResponse.json({ ok: true, message: 'Jika akun ditemukan, link reset telah dikirim.' });

  } catch (error) {
    console.error('[ForgotPassword Error]', error);
    return NextResponse.json({ ok: false, message: 'Terjadi kesalahan server.' }, { status: 500 });
  }
}
