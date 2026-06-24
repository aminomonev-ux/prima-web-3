import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/data/db';
import { getSession } from '@/lib/security/auth';
import { checkRateLimit } from '@/lib/security/ratelimit';
import { writeAuditLog } from '@/lib/security/auditlog';
import { updateHeaderStats } from '@/lib/data/usulan';
import { addNotif } from '@/lib/services/notifications';

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });

    const isKasubag    = session.role === 'ADMIN_KASUBAG';
    const isKabag      = session.role === 'ADMIN_KABAG';
    const isSuperAdmin = session.role === 'SUPER_ADMIN';
    if (!isKasubag && !isKabag && !isSuperAdmin)
      return NextResponse.json({ ok: false, message: 'Akses ditolak.' }, { status: 403 });

    const actAs = req.nextUrl.searchParams.get('actAs');
    const asKasubag = isKasubag || (isSuperAdmin && actAs === 'kasubag');

    const rows = asKasubag
      ? await sql`SELECT COUNT(*) as total FROM usulan_items WHERE status IN ('DITELAAH','DIREVISI_ADMIN')`
      : await sql`SELECT COUNT(*) as total FROM usulan_items WHERE status IN ('DIPROSES','DIREVISI_KASUBAG')`;

    const total = parseInt((rows[0] as Record<string,string>).total ?? '0');
    const headerRows = asKasubag
      ? await sql`SELECT COUNT(DISTINCT h.id) as hdrs FROM usulan_headers h
                  JOIN usulan_items i ON i.usulan_id = h.id
                  WHERE i.status IN ('DITELAAH','DIREVISI_ADMIN')`
      : await sql`SELECT COUNT(DISTINCT h.id) as hdrs FROM usulan_headers h
                  JOIN usulan_items i ON i.usulan_id = h.id
                  WHERE i.status IN ('DIPROSES','DIREVISI_KASUBAG')`;
    const headers = parseInt((headerRows[0] as Record<string,string>).hdrs ?? '0');

    return NextResponse.json({ ok: true, data: { total_item: total, total_header: headers } });
  } catch (e) {
    console.error('[PutusanBulk GET]', e);
    return NextResponse.json({ ok: false, message: 'Terjadi kesalahan server.' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });

    const isKasubag    = session.role === 'ADMIN_KASUBAG';
    const isKabag      = session.role === 'ADMIN_KABAG';
    const isSuperAdmin = session.role === 'SUPER_ADMIN';
    if (!isKasubag && !isKabag && !isSuperAdmin)
      return NextResponse.json({ ok: false, message: 'Akses ditolak.' }, { status: 403 });

    const rl = await checkRateLimit(`bulk_put:${session.userId}`, 5, 60);
    if (!rl.allowed) return NextResponse.json({ ok: false, message: 'Terlalu banyak permintaan. Coba lagi dalam 1 menit.' }, { status: 429 });

    const body    = await req.json().catch(() => ({}));
    const actAs   = (body as Record<string,string>).actAs ?? '';
    const asKasubag = isKasubag || (isSuperAdmin && actAs === 'kasubag');

    if (asKasubag) {
      // Kasubag: DITELAAH + DIREVISI_ADMIN → DIPROSES
      // nominal: admin_nominal jika ada, fallback total_est
      await sql`
        UPDATE usulan_items
        SET status            = 'DIPROSES',
            nominal_disetujui = CASE
              WHEN admin_nominal > 0 THEN admin_nominal
              ELSE total_est
            END,
            kasubag_by      = ${session.username},
            kasubag_tgl     = CURRENT_DATE,
            kasubag_putusan = 'DIPROSES',
            kasubag_catatan = '',
            updated_at      = NOW()
        WHERE status IN ('DITELAAH','DIREVISI_ADMIN')
      `;
    } else {
      // Kabag: DIPROSES + DIREVISI_KASUBAG → DISETUJUI
      // nominal prioritas: nominal_disetujui (sudah termasuk revisi kasubag) > admin_nominal > total_est
      await sql`
        UPDATE usulan_items
        SET status            = 'DISETUJUI',
            nominal_disetujui = CASE
              WHEN nominal_disetujui > 0 THEN nominal_disetujui
              WHEN admin_nominal > 0     THEN admin_nominal
              ELSE total_est
            END,
            qty_disetujui = qty,
            kabag_by      = ${session.username},
            kabag_tgl     = CURRENT_DATE,
            kabag_putusan = 'DISETUJUI',
            kabag_catatan = '',
            updated_at    = NOW()
        WHERE status IN ('DIPROSES','DIREVISI_KASUBAG')
      `;
    }

    // Update header stats untuk semua header yang terdampak
    const affectedHeaders = asKasubag
      ? await sql`SELECT DISTINCT usulan_id FROM usulan_items WHERE status = 'DIPROSES' AND kasubag_by = ${session.username} AND kasubag_tgl = CURRENT_DATE`
      : await sql`SELECT DISTINCT usulan_id FROM usulan_items WHERE status = 'DISETUJUI' AND kabag_by = ${session.username} AND kabag_tgl = CURRENT_DATE`;

    for (const row of affectedHeaders) {
      await updateHeaderStats((row as Record<string,number>).usulan_id);
    }

    // Notifikasi per header unik
    const notifHeaders = asKasubag
      ? await sql`SELECT DISTINCT h.id, h.no_usulan, h.sub_bidang, h.pengusul
                  FROM usulan_headers h
                  JOIN usulan_items i ON i.usulan_id = h.id
                  WHERE i.status = 'DIPROSES' AND i.kasubag_by = ${session.username} AND i.kasubag_tgl = CURRENT_DATE`
      : await sql`SELECT DISTINCT h.id, h.no_usulan, h.sub_bidang, h.pengusul
                  FROM usulan_headers h
                  JOIN usulan_items i ON i.usulan_id = h.id
                  WHERE i.status = 'DISETUJUI' AND i.kabag_by = ${session.username} AND i.kabag_tgl = CURRENT_DATE`;

    for (const h of notifHeaders) {
      const hdr = h as Record<string,string>;
      if (asKasubag) {
        await addNotif('__KABAG__', 'ADMIN_KABAG', 'VERIF_KABAG',
          `Kasubag memproses usulan <b>${hdr.no_usulan}</b> (${hdr.sub_bidang}). Menunggu Kabag.`, hdr.no_usulan, hdr.sub_bidang);
        await addNotif(hdr.pengusul, '', 'STATUS_CHANGE',
          `Usulan <b>${hdr.no_usulan}</b> diproses Kasubag, diteruskan ke Kabag.`, hdr.no_usulan, hdr.sub_bidang);
      } else {
        await addNotif(hdr.pengusul, '', 'STATUS_CHANGE',
          `Putusan final Kabag untuk usulan <b>${hdr.no_usulan}</b>: <b>DISETUJUI</b>.`, hdr.no_usulan, hdr.sub_bidang);
      }
    }

    const label = asKasubag ? 'diteruskan ke Kabag' : 'disetujui final';
    await writeAuditLog({ req, eventType: 'PUTUSAN_BULK', userId: session.userId, username: session.username, detail: `Bulk ${label}: ${notifHeaders.length} header` });
    return NextResponse.json({ ok: true, message: `Semua usulan berhasil ${label}.`, count: notifHeaders.length });
  } catch (e) {
    console.error('[PutusanBulk PUT]', e);
    return NextResponse.json({ ok: false, message: 'Terjadi kesalahan server.' }, { status: 500 });
  }
}
