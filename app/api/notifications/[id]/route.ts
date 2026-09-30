import { NextRequest, NextResponse } from 'next/server';
import { safeInt } from '@/lib/data/db';
import { getSession } from '@/lib/security/auth';
import { tandaiDibaca } from '@/lib/services/notifications';

export async function PATCH(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ ok: false }, { status: 401 });

    const { id } = await params;
    // BUG-W2: NaN guard via safeInt
    const notifId = safeInt(id, 0);
    if (!notifId) return NextResponse.json({ ok: false, message: 'Invalid id' }, { status: 400 });

    // SEC-C4: hanya notifikasi yang dialamatkan ke orang ini. B7: yang ditandai status
    // baca MILIKNYA sendiri — rekan seantrean tetap melihatnya belum dibaca.
    await tandaiDibaca(notifId, session.userId, session.role, session.username);
    return NextResponse.json({ ok: true });

  } catch (error) {
    console.error('[Notification PATCH Error]', error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
