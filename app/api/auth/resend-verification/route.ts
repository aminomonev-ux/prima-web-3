
import { NextRequest, NextResponse } from 'next/server';
import { sql, toMysqlDatetime } from '@/lib/data/db';
import { checkRateLimit, getClientIp } from '@/lib/security/ratelimit';
import { writeAuditLog } from '@/lib/security/auditlog';
import { RESET_PW_RATE_LIMIT_REQUESTS, RESET_PW_RATE_LIMIT_WINDOW } from '@/lib/constants';
import { sendEmail } from '@/lib/services/email';
import { UsernameOrEmailBodySchema } from '@/lib/data/auth-schemas';
import crypto from 'crypto';

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const rl = await checkRateLimit(`resend-verify:${ip}`, RESET_PW_RATE_LIMIT_REQUESTS, RESET_PW_RATE_LIMIT_WINDOW);
    if (!rl.allowed) {
      return NextResponse.json(
        { ok: false, message: `Terlalu banyak permintaan. Coba lagi dalam ${rl.resetIn} detik.` },
        { status: 429, headers: { 'Retry-After': String(rl.resetIn) } }
      );
    }

    // SDL-M10: Zod safeParse + collapse semua branch ke generic message (no enumeration).
    const raw    = await req.json().catch(() => null);
    const parsed = UsernameOrEmailBodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, message: parsed.error.issues[0]?.message ?? 'Input tidak valid' }, { status: 400 });
    }
    const input = parsed.data.usernameOrEmail.toLowerCase();

    const users = await sql`
      SELECT id, email, username, status, email_verified
      FROM users
      WHERE LOWER(username) = ${input} OR LOWER(email) = ${input}
      LIMIT 1
    `;

    const genericOk = { ok: true, message: 'Jika akun ditemukan dan belum terverifikasi, email telah dikirim.' };

    type UserRow = { id: number; email: string; username: string; status: string; email_verified: boolean };
    const user = users.length ? users[0] as UserRow : null;

    // SDL-M10 / SEC-W1 + SEC-W4: collapse semua branch (akun tidak ada / sudah
    // verified / NONAKTIF / MENUNGGU) ke generic message + timing parity dummy work.
    // Sebelumnya 3 branch pesan berbeda → username enumeration.
    if (!user || user.email_verified || user.status !== 'AKTIF') {
      crypto.createHash('sha256').update(crypto.randomBytes(32)).digest('hex');
      await new Promise(r => setTimeout(r, 250 + Math.floor(Math.random() * 150)));
      await writeAuditLog({
        req,
        eventType: 'RESEND_VERIFY_BLOCKED',
        userId:    user?.id,
        username:  user?.username,
        detail:    !user ? 'unknown account'
                 : user.email_verified ? 'already verified'
                 : `status=${user.status}`,
      });
      return NextResponse.json(genericOk);
    }

    // SDL-M18: hash token at-rest (mirror SEC-C5 reset_token pattern).
    const rawToken    = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiry      = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await sql`
      UPDATE users
      SET email_verify_token = ${hashedToken}, email_verify_expiry = ${toMysqlDatetime(expiry)}
      WHERE id = ${user.id}
    `;

    const verifyUrl = `${process.env.NEXT_PUBLIC_APP_URL}/verify-email?token=${rawToken}`;

    await sendEmail({
      to: user.email,
      subject: 'Verifikasi Email PRIMA',
      eventType: 'VERIFY_EMAIL',
      html: `<div style="font-family:sans-serif;max-width:480px;margin:auto">
        <h2 style="color:#00d4ff">Verifikasi Email PRIMA</h2>
        <p>Halo <strong>${user.username}</strong>,</p>
        <p>Klik tombol di bawah untuk memverifikasi email kamu. Link berlaku <strong>24 jam</strong>.</p>
        <a href="${verifyUrl}" style="display:inline-block;margin:16px 0;padding:12px 24px;background:#00d4ff;color:#000;border-radius:6px;text-decoration:none;font-weight:bold">Verifikasi Email</a>
        <p style="color:#888;font-size:12px">Jika kamu tidak mendaftar di PRIMA, abaikan email ini.</p>
        <hr style="border-color:#333"/>
        <p style="color:#888;font-size:11px">PRIMA — RSJD Dr. Amino Gondohutomo</p>
      </div>`,
    });

    await writeAuditLog({ req, eventType: 'RESEND_VERIFY', userId: user.id, username: user.username });
    return NextResponse.json(genericOk);

  } catch (error) {
    console.error('[ResendVerification Error]', error);
    return NextResponse.json({ ok: false, message: 'Terjadi kesalahan server.' }, { status: 500 });
  }
}
