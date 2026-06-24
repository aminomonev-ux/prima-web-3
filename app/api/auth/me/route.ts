import { NextResponse } from 'next/server';
import { getSession } from '@/lib/security/auth';
import { sql, queryOne } from '@/lib/data/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  // Fetch theme_preference + probation flags from DB (not stored in JWT).
  const row = await queryOne<{
    theme_preference: string;
    probationary_until: Date | null;
    probationary_from_role: string | null;
  }>(
    sql`SELECT theme_preference, probationary_until, probationary_from_role
        FROM users WHERE id = ${session.userId} LIMIT 1`
  );
  const themePreference = row?.theme_preference ?? 'dark';

  return NextResponse.json({
    ok: true,
    userId: session.userId,
    username: session.username,
    role: session.role,
    themePreference,
    probationaryUntil:    row?.probationary_until ?? null,
    probationaryFromRole: row?.probationary_from_role ?? null,
  });
}