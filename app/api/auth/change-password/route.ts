
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { sql } from '@/lib/data/db';
import { getSession, verifyPassword, hashPassword } from '@/lib/security/auth';
import { writeAuditLog } from '@/lib/security/auditlog';
import { checkRateLimit } from '@/lib/security/ratelimit';

const schema = z.object({
  passwordLama: z.string().min(1, 'Password lama wajib diisi'),
  passwordBaru: z.string().min(8, 'Password baru minimal 8 karakter').max(100),
  konfirmasi:   z.string().min(1, 'Konfirmasi password wajib diisi'),
}).refine(d => d.passwordBaru === d.konfirmasi, {
  message: 'Konfirmasi password tidak cocok',
  path: ['konfirmasi'],
});

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ ok: false, message: 'Sesi tidak valid. Silakan login ulang.' }, { status: 401 });

    // V5-AUTH-06: throttle percobaan password lama.
    const rl = await checkRateLimit(`change-pw:${session.userId}`, 5, 600);
    if (!rl.allowed) return NextResponse.json({ ok: false, message: `Terlalu banyak percobaan. Coba lagi dalam ${rl.resetIn} detik.` }, { status: 429, headers: { 'Retry-After': String(rl.resetIn) } });

    const body   = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, message: parsed.error.issues[0]?.message || 'Input tidak valid' }, { status: 400 });
    }

    const { passwordLama, passwordBaru } = parsed.data;

    
    const rows = await sql`SELECT password_hash FROM users WHERE id = ${session.userId} AND status = 'AKTIF' LIMIT 1`;
    if (!rows.length) return NextResponse.json({ ok: false, message: 'Akun tidak ditemukan.' }, { status: 404 });

    const row = rows[0] as { password_hash: string };
    const valid = await verifyPassword(passwordLama, row.password_hash);
    if (!valid) return NextResponse.json({ ok: false, message: 'Password lama salah.' }, { status: 400 });


    const same = await verifyPassword(passwordBaru, row.password_hash);
    if (same) return NextResponse.json({ ok: false, message: 'Password baru tidak boleh sama dengan password lama.' }, { status: 400 });

    
    const newHash = await hashPassword(passwordBaru);
    await sql`UPDATE users SET password_hash = ${newHash} WHERE id = ${session.userId}`;
    await sql`
      UPDATE user_sessions
      SET invalidated_at = NOW()
      WHERE user_id = ${session.userId}
        AND invalidated_at IS NULL
        AND session_id != ${session.sessionId ?? ''}
    `;

    await writeAuditLog({ req, eventType: 'PASSWORD_CHANGE', userId: session.userId, username: session.username });
    return NextResponse.json({ ok: true, message: 'Password berhasil diperbarui. Perangkat lain telah dikeluarkan.' });

  } catch (error) {
    console.error('[ChangePassword Error]', error);
    return NextResponse.json({ ok: false, message: 'Terjadi kesalahan server.' }, { status: 500 });
  }
}
