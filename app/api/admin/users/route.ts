
import { NextRequest, NextResponse } from 'next/server';
import { sql, sqlInt, safeInt, escapeLike } from '@/lib/data/db';
import { getSession, hashPassword } from '@/lib/security/auth';
import { writeAuditLog } from '@/lib/security/auditlog';
import { AdminUsersPatchBodySchema } from '@/lib/data/admin-schemas';
import { assertQuotaAvailable } from '@/lib/security/promotion';

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });

    const isAdmin = session.role === 'ADMIN' || session.role === 'SUPER_ADMIN';
    if (!isAdmin) return NextResponse.json({ ok: false, message: 'Akses ditolak.' }, { status: 403 });

    const { searchParams: p } = req.nextUrl;
    const status = p.get('status') ?? '';
    const search = p.get('search') ?? '';
    const page   = Math.max(1, safeInt(p.get('page'), 1));
    const limit  = 20;
    const offset = (page - 1) * limit;

    const whereStatus = status ? sql`AND u.status = ${status}` : sql``;
    // O5: escapeLike supaya % atau _ di input tidak diperlakukan sebagai wildcard MySQL.
    const searchEsc = search ? escapeLike(search) : '';
    const whereSearch = searchEsc ? sql`AND (u.username LIKE ${'%'+searchEsc+'%'} OR u.nama_lengkap LIKE ${'%'+searchEsc+'%'} OR u.email LIKE ${'%'+searchEsc+'%'})` : sql``;

    const [countRows, dataRows] = await Promise.all([
      sql`SELECT COUNT(*) as total FROM users u WHERE 1=1 ${whereStatus} ${whereSearch}`,
      sql`
        SELECT id, username, nama_lengkap, email, role, status, email_verified, app_access, created_at, updated_at,
               promotion_locked_until, probationary_until, probationary_from_role
        FROM users u WHERE 1=1 ${whereStatus} ${whereSearch}
        ORDER BY
          CASE status WHEN 'MENUNGGU' THEN 0 WHEN 'AKTIF' THEN 1 ELSE 2 END,
          created_at DESC
        LIMIT ${sqlInt(limit)} OFFSET ${sqlInt(offset)}
      `,
    ]);

    const total      = parseInt((countRows[0] as Record<string,string>)?.total ?? '0');
    const totalPages = Math.ceil(total / limit);

    return NextResponse.json({ ok: true, data: dataRows, pagination: { page, limit, total, totalPages } });

  } catch (error) {
    console.error('[Admin Users GET Error]', error);
    return NextResponse.json({ ok: false, message: 'Terjadi kesalahan server.' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });

    const isAdmin = session.role === 'ADMIN' || session.role === 'SUPER_ADMIN';
    if (!isAdmin) return NextResponse.json({ ok: false, message: 'Akses ditolak.' }, { status: 403 });

    // SDL-M12 + SDL-L4: Zod discriminated union — runtime validation, app_access whitelist.
    const raw    = await req.json().catch(() => null);
    const parsed = AdminUsersPatchBodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, message: parsed.error.issues[0]?.message ?? 'Body tidak valid.' }, { status: 400 });
    }
    const data = parsed.data;
    const { id } = data;

    const target = await sql`SELECT role, probationary_until FROM users WHERE id = ${id} LIMIT 1`;
    if (!target.length) return NextResponse.json({ ok: false, message: 'User tidak ditemukan.' }, { status: 404 });
    const targetCurrentRole = (target[0] as Record<string,unknown>).role as string;
    const targetProbationUntil = (target[0] as Record<string,unknown>).probationary_until as Date | null;
    if (targetCurrentRole === 'SUPER_ADMIN' && session.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ ok: false, message: 'Tidak dapat mengubah Super Admin.' }, { status: 403 });
    }

    if (data.action === 'nonaktif') {
      await sql`UPDATE users SET status = 'NONAKTIF', updated_at = NOW() WHERE id = ${id}`;
      await writeAuditLog({ req, eventType: 'USER_UPDATE', userId: session.userId, username: session.username, detail: `Nonaktifkan user id=${id}` });
      return NextResponse.json({ ok: true, message: 'User dinonaktifkan.' });
    }

    if (data.action === 'aktifkan') {
      await sql`UPDATE users SET status = 'AKTIF', updated_at = NOW() WHERE id = ${id}`;
      await writeAuditLog({ req, eventType: 'USER_UPDATE', userId: session.userId, username: session.username, detail: `Aktifkan user id=${id}` });
      return NextResponse.json({ ok: true, message: 'User diaktifkan.' });
    }

    if (data.action === 'ubah-role') {
      const { role } = data;
      // SEC-W5: ADMIN tier roles hanya boleh di-assign oleh SUPER_ADMIN.
      // Tanpa guard ini, ADMIN biasa bisa promote user lain ke ADMIN_KASUBAG/
      // ADMIN_KABAG → privilege escalation. Termasuk juga: ADMIN biasa tidak
      // boleh mengubah role user yang saat ini sudah di tier ADMIN_*.
      const ADMIN_TIER_ROLES = ['ADMIN','ADMIN_KASUBAG','ADMIN_KABAG'];
      if (session.role !== 'SUPER_ADMIN' &&
          (ADMIN_TIER_ROLES.includes(role) || ADMIN_TIER_ROLES.includes(targetCurrentRole))) {
        return NextResponse.json(
          { ok: false, message: 'Hanya SUPER_ADMIN yang boleh menetapkan/mengubah role tier ADMIN.' },
          { status: 403 }
        );
      }
      // V4D-1: enforce ROLE_QUOTA juga di entry point ini (CLAUDE.md §Role Quota
      // sebut "edit role (User Management Admin Panel)" sebagai entry point). Hanya
      // saat pindah MASUK ke role lain. assertQuotaAvailable no-op untuk role tak ber-cap.
      if (role !== targetCurrentRole) {
        try {
          await assertQuotaAvailable(role);
        } catch {
          return NextResponse.json({ ok: false, message: `Kuota role ${role} sudah penuh. Nonaktifkan akun lain di role tersebut dulu.` }, { status: 409 });
        }
      }
      // Ubah-role manual = override otoritatif → batalkan probation promosi yang
      // sedang berjalan: `from_role` lama jadi basi (rollback REVOKE akan lompat ke
      // role 2 langkah ke belakang). promotion_locked_until SENGAJA tidak di-clear —
      // itu penalti rate-limit perilaku (Tahap 15 L4), punya tombol UNLOCK sendiri.
      const probationWasActive = targetProbationUntil != null && new Date(targetProbationUntil).getTime() > Date.now();
      await sql`UPDATE users SET role = ${role}, probationary_until = NULL, probationary_from_role = NULL, updated_at = NOW() WHERE id = ${id}`;
      await writeAuditLog({ req, eventType: 'USER_UPDATE', userId: session.userId, username: session.username, detail: `Ubah role user id=${id} (${targetCurrentRole} → ${role})${probationWasActive ? ' [probation dibatalkan]' : ''}` });
      return NextResponse.json({ ok: true, message: `Role diubah ke ${role}.` });
    }

    if (data.action === 'set-app-access') {
      const { app_access: apps } = data;
      if (targetCurrentRole === 'SUPER_ADMIN') {
        return NextResponse.json({ ok: false, message: 'Akses SUPER_ADMIN tidak dapat dibatasi.' }, { status: 403 });
      }
      if (apps === null || apps.length === 0) {
        await sql`UPDATE users SET app_access = NULL, updated_at = NOW() WHERE id = ${id}`;
      } else {
        await sql`UPDATE users SET app_access = ${JSON.stringify(apps)}, updated_at = NOW() WHERE id = ${id}`;
      }
      await writeAuditLog({ req, eventType: 'USER_UPDATE', userId: session.userId, username: session.username, detail: `Set app_access user id=${id}: ${JSON.stringify(apps)}` });
      return NextResponse.json({ ok: true, message: 'Akses aplikasi berhasil diperbarui.' });
    }

    if (data.action === 'reset-password') {
      if (session.role !== 'SUPER_ADMIN') return NextResponse.json({ ok: false, message: 'Hanya SUPER_ADMIN.' }, { status: 403 });
      const hash = await hashPassword(data.password);
      await sql`UPDATE users SET password_hash = ${hash}, updated_at = NOW() WHERE id = ${id}`;
      await sql`UPDATE user_sessions SET invalidated_at = NOW() WHERE user_id = ${id} AND invalidated_at IS NULL`;
      await writeAuditLog({ req, eventType: 'USER_UPDATE', userId: session.userId, username: session.username, detail: `Reset password user id=${id}` });
      return NextResponse.json({ ok: true, message: 'Password berhasil direset. Semua sesi user dihapus.' });
    }

    // discriminated union exhaustive: unreachable
    return NextResponse.json({ ok: false, message: 'Action tidak dikenal.' }, { status: 400 });

  } catch (error) {
    console.error('[Admin Users PATCH Error]', error);
    return NextResponse.json({ ok: false, message: 'Terjadi kesalahan server.' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || session.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ ok: false, message: 'Hanya SUPER_ADMIN yang dapat menghapus akun.' }, { status: 403 });
    }

    const { searchParams } = req.nextUrl;
    // SDL-M15 / BUG-W2: safeInt bukan parseInt.
    const id = safeInt(searchParams.get('id'), 0);
    if (!id) return NextResponse.json({ ok: false, message: 'ID user diperlukan.' }, { status: 400 });

    const target = await sql`SELECT role, username FROM users WHERE id = ${id} LIMIT 1`;
    if (!target.length) return NextResponse.json({ ok: false, message: 'User tidak ditemukan.' }, { status: 404 });

    const t = target[0] as Record<string, unknown>;
    if (t.role === 'SUPER_ADMIN') {
      return NextResponse.json({ ok: false, message: 'Tidak dapat menghapus akun SUPER_ADMIN.' }, { status: 403 });
    }
    if (t.username === session.username) {
      return NextResponse.json({ ok: false, message: 'Tidak dapat menghapus akun sendiri.' }, { status: 403 });
    }

    // Invalidate semua sesi aktif user terlebih dahulu
    await sql`UPDATE user_sessions SET invalidated_at = NOW() WHERE user_id = ${id} AND invalidated_at IS NULL`;
    await sql`DELETE FROM users WHERE id = ${id}`;
    await writeAuditLog({ req, eventType: 'USER_DELETE', userId: session.userId, username: session.username, detail: `Hapus user ${t.username as string} (id=${id})` });

    return NextResponse.json({ ok: true, message: `Akun ${t.username as string} berhasil dihapus. Slot kuota role dibebaskan.` });

  } catch (error) {
    console.error('[Admin Users DELETE Error]', error);
    return NextResponse.json({ ok: false, message: 'Terjadi kesalahan server.' }, { status: 500 });
  }
}
