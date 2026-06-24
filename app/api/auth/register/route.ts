
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { sql, toMysqlDatetime } from '@/lib/data/db';
import { hashPassword } from '@/lib/security/auth';
import { SUBBIDANG_ROLES, BIDANG_ROLES, ROLE_LABELS, ROLE_QUOTA } from '@/lib/constants';
import { verifyTurnstile } from '@/lib/security/recaptcha';
import { checkRateLimit, getClientIp } from '@/lib/security/ratelimit';
import { writeAuditLog } from '@/lib/security/auditlog';
import { sendEmail } from '@/lib/services/email';
import crypto from 'crypto';

const schema = z.object({
  username:        z.string().min(3).max(50).regex(/^[a-zA-Z0-9_\-\.]+$/, 'Username hanya huruf, angka, _ - .'),
  email:           z.string().email('Format email tidak valid'),
  password:        z.string().min(8, 'Password minimal 8 karakter').max(100)
                    .regex(/[A-Z]/, 'Password harus mengandung huruf besar')
                    .regex(/[a-z]/, 'Password harus mengandung huruf kecil')
                    .regex(/[0-9]/, 'Password harus mengandung angka'),
  role:            z.string().min(1, 'Pilih role'),
  turnstile_token: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const rl = await checkRateLimit(`register:${ip}`, 3, 300);
    if (!rl.allowed) {
      return NextResponse.json(
        { ok: false, message: `Terlalu banyak pendaftaran. Coba lagi dalam ${rl.resetIn} detik.` },
        { status: 429, headers: { 'Retry-After': String(rl.resetIn) } }
      );
    }

    const body   = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, message: parsed.error.issues[0]?.message || 'Input tidak valid' }, { status: 400 });
    }

    const { username, email, password, role, turnstile_token } = parsed.data;

    const rc = await verifyTurnstile(turnstile_token ?? '');
    if (!rc.ok) {
      return NextResponse.json({ ok: false, message: 'Verifikasi keamanan gagal. Coba lagi.' }, { status: 400 });
    }

    const validRoles = [...SUBBIDANG_ROLES, ...BIDANG_ROLES] as string[];
    if (!validRoles.includes(role)) {
      return NextResponse.json({ ok: false, message: 'Role tidak valid' }, { status: 400 });
    }

    // Cek kuota akun per role (hanya berlaku untuk BIDANG_ROLES)
    if ((BIDANG_ROLES as readonly string[]).includes(role)) {
      const countRows = await sql`
        SELECT COUNT(*) AS cnt FROM users
        WHERE role = ${role} AND status = 'AKTIF'
      `;
      const count = parseInt((countRows[0] as Record<string, string>).cnt ?? '0');
      if (count >= ROLE_QUOTA) {
        const roleName = ROLE_LABELS[role] ?? role;
        return NextResponse.json(
          { ok: false, message: `Kuota akun untuk ${roleName} sudah penuh (Maks ${ROLE_QUOTA}). Silakan hubungi Super Admin untuk penyesuaian.` },
          { status: 403 }
        );
      }
    }


    // V3-2 / SEC-W1: pesan generic anti-enumeration; alasan spesifik (username/email)
    // hanya di-log server-side agar penyerang tidak bisa memetakan akun yang ada.
    const existUser  = await sql`SELECT id FROM users WHERE LOWER(username) = LOWER(${username}) LIMIT 1`;
    const existEmail = await sql`SELECT id FROM users WHERE LOWER(email) = LOWER(${email}) LIMIT 1`;
    if (existUser.length || existEmail.length) {
      const dup = [existUser.length && 'username', existEmail.length && 'email'].filter(Boolean).join('+');
      await writeAuditLog({ req, eventType: 'SIGNUP_BLOCKED', username, detail: `duplicate: ${dup}` });
      return NextResponse.json(
        { ok: false, message: 'Username atau email sudah terdaftar' },
        { status: 409 }
      );
    }

    
    const password_hash = await hashPassword(password);

    
    // SDL-M18: hash token at-rest (mirror SEC-C5 reset_token pattern).
    const verify_token_raw    = crypto.randomBytes(32).toString('hex');
    const verify_token_hashed = crypto.createHash('sha256').update(verify_token_raw).digest('hex');
    const verify_expiry       = new Date(Date.now() + 24 * 60 * 60 * 1000);

    
    await sql`
      INSERT INTO users (username, email, password_hash, role, status, email_verified, email_verify_token, email_verify_expiry)
      VALUES (${username}, ${email.toLowerCase()}, ${password_hash}, ${role}, 'MENUNGGU', FALSE, ${verify_token_hashed}, ${toMysqlDatetime(verify_expiry)})
    `;

    
    const verifyUrl = `${process.env.NEXT_PUBLIC_APP_URL}/verify-email?token=${verify_token_raw}`;
    await sendEmail({
      to: email.toLowerCase(),
      subject: 'Verifikasi Email PRIMA',
      eventType: 'VERIFY_EMAIL',
      html: `<div style="font-family:sans-serif;max-width:480px;margin:auto">
        <h2 style="color:#00d4ff">Verifikasi Email PRIMA</h2>
        <p>Halo <strong>${username}</strong>,</p>
        <p>Terima kasih telah mendaftar. Klik tombol di bawah untuk memverifikasi email kamu. Link berlaku <strong>24 jam</strong>.</p>
        <a href="${verifyUrl}" style="display:inline-block;margin:16px 0;padding:12px 24px;background:#00d4ff;color:#000;border-radius:6px;text-decoration:none;font-weight:bold">Verifikasi Email</a>
        <p style="color:#888;font-size:12px">Jika kamu tidak mendaftar di PRIMA, abaikan email ini.</p>
        <hr style="border-color:#333"/>
        <p style="color:#888;font-size:11px">PRIMA — RSJD Dr. Amino Gondohutomo</p>
      </div>`,
    });
    await writeAuditLog({ req, eventType: 'SIGNUP', username, detail: `role: ${role}` });

    return NextResponse.json({
      ok: true,
      message: 'Pendaftaran berhasil! Cek email Anda untuk verifikasi akun.',
    });

  } catch (error) {
    console.error('[Register Error]', error);
    return NextResponse.json({ ok: false, message: 'Terjadi kesalahan server.' }, { status: 500 });
  }
}
