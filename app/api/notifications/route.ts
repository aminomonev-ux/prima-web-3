import { NextResponse } from 'next/server';
import { getSession } from '@/lib/security/auth';
import { bacaNotifikasi, tandaiSemuaDibaca } from '@/lib/services/notifications';

// B7 (audit 2026-09-29): status baca per orang — lihat `bacaNotifikasi` &
// `tandaiSemuaDibaca` di lib/services/notifications.ts.

export async function GET() {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ ok: false }, { status: 401 });

    const { data, unread } = await bacaNotifikasi(session.userId, session.role, session.username);
    return NextResponse.json({ ok: true, data, unread });

  } catch (error) {
    console.error('[Notifications GET Error]', error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

export async function PATCH() {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ ok: false }, { status: 401 });

    // Menandai untuk DIRI SENDIRI saja: rekan seantrean tetap melihatnya belum dibaca.
    await tandaiSemuaDibaca(session.userId, session.role, session.username);
    return NextResponse.json({ ok: true });

  } catch (error) {
    console.error('[Notifications PATCH Error]', error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
