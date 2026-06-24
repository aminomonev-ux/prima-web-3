import { NextRequest, NextResponse } from 'next/server';
import { sql, safeInt } from '@/lib/data/db';
import { getSession } from '@/lib/security/auth';
import { buildNotifRecipients } from '@/lib/services/notifications';

export async function PATCH(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ ok: false }, { status: 401 });

    const { id } = await params;
    // BUG-W2: NaN guard via safeInt
    const notifId = safeInt(id, 0);
    if (!notifId) return NextResponse.json({ ok: false, message: 'Invalid id' }, { status: 400 });

    // SEC-C4: ownership check — user hanya boleh mark-read notif yang ditujukan ke dia
    const recipients = buildNotifRecipients(session.role, session.username);
    await sql`
      UPDATE notifications SET dibaca = TRUE
      WHERE id = ${notifId} AND recipient IN (${recipients})
    `;

    return NextResponse.json({ ok: true });

  } catch (error) {
    console.error('[Notification PATCH Error]', error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
