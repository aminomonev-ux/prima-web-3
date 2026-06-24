import { NextResponse } from 'next/server';
import { sql } from '@/lib/data/db';
import { getSession } from '@/lib/security/auth';
import { buildNotifRecipients as buildRecipients } from '@/lib/services/notifications';

export async function GET() {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ ok: false }, { status: 401 });

    const recipients = buildRecipients(session.role, session.username);

    const rows = await sql`
      SELECT id, type, pesan, no_usulan, sub_bidang, dibaca, created_at
      FROM notifications
      WHERE recipient IN (${recipients})
      ORDER BY created_at DESC
      LIMIT 50
    `;

    const unread = (rows as Record<string,unknown>[]).filter(r => !r.dibaca).length;

    return NextResponse.json({ ok: true, data: rows, unread });

  } catch (error) {
    console.error('[Notifications GET Error]', error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

export async function PATCH() {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ ok: false }, { status: 401 });

    const recipients = buildRecipients(session.role, session.username);

    await sql`
      UPDATE notifications SET dibaca = TRUE
      WHERE recipient IN (${recipients}) AND dibaca = FALSE
    `;

    return NextResponse.json({ ok: true });

  } catch (error) {
    console.error('[Notifications PATCH Error]', error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
