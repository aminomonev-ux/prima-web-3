import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/security/auth';
import { sql } from '@/lib/data/db';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const PreferencesSchema = z.object({
  themePreference: z.enum(['dark', 'light']),
});

export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, message: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = PreferencesSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, message: 'themePreference harus "dark" atau "light"' }, { status: 422 });
  }

  const { themePreference } = parsed.data;

  await sql`
    UPDATE users
    SET theme_preference = ${themePreference}
    WHERE id = ${session.userId}
  `;

  return NextResponse.json({ ok: true, themePreference });
}
