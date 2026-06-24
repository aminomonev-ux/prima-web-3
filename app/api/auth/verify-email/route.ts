import { NextRequest, NextResponse } from 'next/server';
import { sql, withTransaction } from '@/lib/data/db';
import { writeAuditLog } from '@/lib/security/auditlog';
import { checkRateLimit, getClientIp } from '@/lib/security/ratelimit';
import { BIDANG_ROLES, ROLE_QUOTA, ROLE_LABELS } from '@/lib/constants';
import crypto from 'crypto';

// V5-AUTH-02: POST (bukan GET) agar token tidak terkonsumsi oleh email-prefetch /
// AV-scanner / link-prefetch. Token dikirim di body, dipicu klik tombol di UI.
export async function POST(req: NextRequest) {
  // Rate-limit per IP: token sudah hashed + expiry, tapi tetap rem brute-guess token.
  const ip = getClientIp(req);
  const rl = await checkRateLimit(`verify-email:${ip}`, 10, 60);
  if (!rl.allowed) {
    return NextResponse.json(
      { ok: false, message: `Terlalu banyak percobaan. Coba lagi dalam ${rl.resetIn} detik.` },
      { status: 429, headers: { 'Retry-After': String(rl.resetIn) } }
    );
  }

  const body  = await req.json().catch(() => null) as { token?: string } | null;
  const token = body?.token ?? null;
  if (!token) {
    return NextResponse.json({ ok: false, message: 'Token tidak valid.' }, { status: 400 });
  }

  // SDL-M18: hash input token, compare ke hashed value di DB (mirror SEC-C5).
  const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

  const users = await sql`
    SELECT id, role, email_verify_expiry, email_verified
    FROM users
    WHERE email_verify_token = ${hashedToken}
    LIMIT 1
  `;

  if (!users.length) {
    return NextResponse.json({ ok: false, message: 'Token tidak ditemukan atau sudah digunakan.' }, { status: 400 });
  }

  type UserRow = { id: number; role: string; email_verified: boolean; email_verify_expiry: string };
  const user = users[0] as UserRow;

  if (user.email_verified) {
    return NextResponse.json({ ok: false, message: 'Email sudah terverifikasi sebelumnya.' }, { status: 400 });
  }

  if (new Date(user.email_verify_expiry) < new Date()) {
    return NextResponse.json({ ok: false, message: 'Token sudah kadaluarsa. Minta kirim ulang.' }, { status: 400 });
  }

  // V3-4: kuota = max akun AKTIF per BIDANG_ROLE. Tegakkan di titik aktivasi (bukan
  // register, karena MENUNGGU tidak dihitung). FOR UPDATE gap-lock idx_users_role →
  // verifikasi role sama yang barengan di-serialkan, cegah luapan kuota.
  const isCapped = (BIDANG_ROLES as readonly string[]).includes(user.role);
  const quotaFull = await withTransaction(async ({ tx }) => {
    if (isCapped) {
      const c = await tx`
        SELECT COUNT(*) AS cnt FROM users
        WHERE role = ${user.role} AND status = 'AKTIF'
        FOR UPDATE
      `;
      if (parseInt((c[0] as Record<string, string>).cnt ?? '0') >= ROLE_QUOTA) {
        // Email tetap diverifikasi (token dihapus) tapi status MENUNGGU — admin aktivasi manual.
        await tx`
          UPDATE users
          SET email_verified = TRUE, email_verify_token = NULL, email_verify_expiry = NULL
          WHERE id = ${user.id}
        `;
        return true;
      }
    }
    await tx`
      UPDATE users
      SET email_verified = TRUE, email_verify_token = NULL, email_verify_expiry = NULL, status = 'AKTIF'
      WHERE id = ${user.id}
    `;
    return false;
  });

  if (quotaFull) {
    const roleName = ROLE_LABELS[user.role] ?? user.role;
    await writeAuditLog({ req, eventType: 'EMAIL_VERIFIED', userId: user.id, detail: `Verified but role quota full (${roleName}) — pending admin activation` });
    return NextResponse.json({ ok: true, message: `Email berhasil diverifikasi, tapi kuota akun untuk ${roleName} sedang penuh (Maks ${ROLE_QUOTA}). Akun menunggu aktivasi oleh Super Admin.` });
  }

  await writeAuditLog({ req, eventType: 'EMAIL_VERIFIED', userId: user.id, detail: `Email verified via token` });
  return NextResponse.json({ ok: true, message: 'Email berhasil diverifikasi! Akun Anda sudah aktif. Silakan login.' });
}
