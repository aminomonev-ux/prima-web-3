
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { sql, sqlInt, toMysqlDatetime, execWrite } from '@/lib/data/db';
import { verifyPassword, createToken, setSessionCookie } from '@/lib/security/auth';
import { MAX_LOGIN_ATTEMPTS, LOCK_DURATION_MINUTES, RATE_LIMIT_REQUESTS, RATE_LIMIT_WINDOW_SECONDS } from '@/lib/constants';
import { verifyTurnstile } from '@/lib/security/recaptcha';
import { checkRateLimit, getClientIp } from '@/lib/security/ratelimit';
import { writeAuditLog } from '@/lib/security/auditlog';
import { addNotif } from '@/lib/services/notifications';
import crypto from 'crypto';
import type { User } from '@/types';


const DUMMY_HASH = '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewKyqnM1KFMoTM.K';

const loginSchema = z.object({
  username: z
    .string()
    .min(3, 'Username minimal 3 karakter')
    .max(50, 'Username maksimal 50 karakter')
    .regex(/^[a-zA-Z0-9_\-\.]+$/, 'Username hanya boleh huruf, angka, _ - .'),
  password: z
    .string()
    .min(6, 'Password minimal 6 karakter')
    .max(100, 'Password terlalu panjang'),
  turnstile_token: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const ip    = getClientIp(req);
    const rl    = await checkRateLimit(`login:${ip}`, RATE_LIMIT_REQUESTS, RATE_LIMIT_WINDOW_SECONDS);
    if (!rl.allowed) {
      await writeAuditLog({ req, eventType: 'LOGIN_BLOCKED', detail: `IP rate limited` });
      return NextResponse.json(
        { ok: false, message: `Terlalu banyak percobaan. Coba lagi dalam ${rl.resetIn} detik.` },
        { status: 429, headers: { 'Retry-After': String(rl.resetIn) } }
      );
    }

    const body = await req.json();
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
      const firstError = parsed.error.issues[0];
      return NextResponse.json(
        { ok: false, message: firstError?.message || 'Input tidak valid' },
        { status: 400 }
      );
    }
    const { username, password, turnstile_token } = parsed.data;

    const rc = await verifyTurnstile(turnstile_token ?? '');
    if (!rc.ok) {
      return NextResponse.json({ ok: false, message: 'Verifikasi keamanan gagal. Coba lagi.' }, { status: 400 });
    }


    const users = await sql`
      SELECT id, username, email, password_hash, role, status,
             failed_attempts, locked_until, nama_lengkap, email_verified
      FROM users
      WHERE LOWER(username) = LOWER(${username})
      LIMIT 1
    `;

    
    const invalidMsg = 'Username atau password salah';
    if (!users.length) {
      await verifyPassword(password, DUMMY_HASH);
      return NextResponse.json({ ok: false, message: invalidMsg }, { status: 401 });
    }

    const user = users[0] as User & { password_hash: string; email_verified: boolean };

    // SEC-W1: Collapse status-specific messages → generic invalidMsg untuk
    // mencegah username enumeration. Status spesifik di-log server-side
    // (audit log) agar Admin tetap bisa debug user complaint.
    // Status user valid: AKTIF (lolos), MENUNGGU (belum verif email),
    // NONAKTIF (admin nonaktifkan). DITOLAK & PENDING sudah dihapus.
    if (user.status === 'NONAKTIF' || user.status === 'MENUNGGU') {
      await verifyPassword(password, DUMMY_HASH); // timing parity dengan happy path
      await writeAuditLog({
        req, eventType: 'LOGIN_BLOCKED', userId: user.id, username: user.username,
        detail: `Status=${user.status}, email_verified=${user.email_verified}`,
      });
      return NextResponse.json({ ok: false, message: invalidMsg }, { status: 401 });
    }

    
    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      const remaining = Math.ceil(
        (new Date(user.locked_until).getTime() - Date.now()) / 60000
      );
      return NextResponse.json(
        { ok: false, message: `Akun terkunci. Coba lagi dalam ${remaining} menit.` },
        { status: 429 }
      );
    }

    
    const isValid = await verifyPassword(password, user.password_hash);
    if (!isValid) {
      
      // V3-5: increment ATOMIK di DB (cegah lost-update failed_attempts saat gagal-login
      // barengan). locked_until ikut di-set di statement yang sama begitu threshold tercapai.
      const lockUntil = toMysqlDatetime(new Date(Date.now() + LOCK_DURATION_MINUTES * 60 * 1000));
      await sql`
        UPDATE users
        SET failed_attempts = failed_attempts + 1,
            locked_until = IF(failed_attempts >= ${MAX_LOGIN_ATTEMPTS}, ${lockUntil}, locked_until)
        WHERE id = ${user.id}
      `;
      const faRows = await sql`SELECT failed_attempts FROM users WHERE id = ${user.id} LIMIT 1` as Array<{ failed_attempts: number }>;
      const newAttempts = Number(faRows[0]?.failed_attempts ?? MAX_LOGIN_ATTEMPTS);
      if (newAttempts >= MAX_LOGIN_ATTEMPTS) {
        // Notif/audit lock hanya saat transisi tepat di threshold (sekali, bukan tiap attempt > MAX).
        if (newAttempts === MAX_LOGIN_ATTEMPTS) {
          await writeAuditLog({ req, eventType: 'ACCOUNT_LOCKED', userId: user.id, username: user.username, detail: `Locked ${LOCK_DURATION_MINUTES} min after ${newAttempts} failed attempts` });
          await addNotif('SUPER_ADMIN', 'SUPER_ADMIN', 'BRUTE_FORCE', `🚨 Akun <b>${user.username}</b> dikunci setelah ${newAttempts}x gagal login dari IP ${getClientIp(req)}`);
        }
        return NextResponse.json(
          { ok: false, message: `Terlalu banyak percobaan. Akun terkunci ${LOCK_DURATION_MINUTES} menit.` },
          { status: 429 }
        );
      }
      await writeAuditLog({ req, eventType: 'LOGIN_FAILED', userId: user.id, username: user.username, detail: `Attempt ${newAttempts}/${MAX_LOGIN_ATTEMPTS}` });
      return NextResponse.json(
        { ok: false, message: invalidMsg },
        { status: 401 }
      );
    }

    
    await sql`
      UPDATE users
      SET failed_attempts = 0,
          locked_until    = NULL,
          last_login      = NOW()
      WHERE id = ${user.id}
    `;

    
    const sessionId = crypto.randomBytes(32).toString('hex');
    const userAgent = (req.headers.get('user-agent') ?? '').slice(0, 250);

    const MAX_SESSIONS = 3;
    await sql`
      INSERT INTO user_sessions (session_id, user_id, username, role, ip_address, user_agent)
      VALUES (${sessionId}, ${user.id}, ${user.username}, ${user.role}, ${ip}, ${userAgent})
    `;
    const trim = await execWrite(sql`
      UPDATE user_sessions
      SET invalidated_at = NOW()
      WHERE user_id = ${user.id}
        AND invalidated_at IS NULL
        AND session_id NOT IN (
          SELECT s FROM (
            SELECT session_id AS s
            FROM user_sessions
            WHERE user_id = ${user.id} AND invalidated_at IS NULL
            ORDER BY created_at DESC
            LIMIT ${sqlInt(MAX_SESSIONS)}
          ) AS keep
        )
    `);
    if (trim.affectedRows > 0) {
      await addNotif(
        user.username, user.role, 'SESSION_LIMIT',
        `Sesi lama otomatis dihapus karena login baru dari IP <b>${ip}</b>`
      );
    }
    const token = await createToken({
      userId:   user.id,
      username: user.username,
      role:     user.role,
      email:    user.email,
    }, sessionId);
    await setSessionCookie(token);
    await writeAuditLog({ req, eventType: 'LOGIN_SUCCESS', userId: user.id, username: user.username });

    return NextResponse.json({
      ok: true,
      data: {
        username:     user.username,
        role:         user.role,
        namaLengkap:  user.nama_lengkap || user.username,
      },
    });

  } catch (error) {
    console.error('[Login Error]', error);
    return NextResponse.json(
      { ok: false, message: 'Terjadi kesalahan server. Coba lagi.' },
      { status: 500 }
    );
  }
}
