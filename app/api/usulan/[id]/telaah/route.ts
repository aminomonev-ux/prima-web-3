
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { sql, safeInt } from '@/lib/data/db';
import { getSession } from '@/lib/security/auth';
import { checkRateLimit } from '@/lib/security/ratelimit';
import { updateHeaderStats } from '@/lib/data/usulan';
import { addNotif } from '@/lib/services/notifications';
import { writeAuditLog } from '@/lib/security/auditlog';

const decisionSchema = z.object({
  item_id:       z.number(),
  status:        z.enum(['DITELAAH', 'DITOLAK_ADMIN', 'DIREVISI_ADMIN']),
  admin_qty:     z.number().optional(),
  admin_harga:   z.number().optional(),
  catatan_admin: z.string().optional(),
});

const bodySchema = z.object({
  decisions: z.array(decisionSchema).min(1),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });

    const canTelaah = session.role === 'ADMIN' || session.role === 'SUPER_ADMIN';
    if (!canTelaah) return NextResponse.json({ ok: false, message: 'Hanya Admin yang dapat menelaah usulan.' }, { status: 403 });
    // SDL-M16: workflow mutation = 10/menit per user.
    const rl = await checkRateLimit(`usulan_telaah:${session.userId}`, 10, 60);
    if (!rl.allowed) {
      return NextResponse.json({ ok: false, message: `Terlalu cepat. Coba lagi dalam ${rl.resetIn} detik.` }, { status: 429, headers: { 'Retry-After': String(rl.resetIn) } });
    }

    const { id } = await params;
    const usulanId = safeInt(id, 0);
    if (!usulanId) return NextResponse.json({ ok: false, message: 'ID tidak valid.' }, { status: 400 });

    const rows = await sql`SELECT no_usulan, sub_bidang FROM usulan_headers WHERE id = ${usulanId} LIMIT 1`;
    if (!rows.length) return NextResponse.json({ ok: false, message: 'Usulan tidak ditemukan.' }, { status: 404 });

    const pendingItems = await sql`SELECT id FROM usulan_items WHERE usulan_id = ${usulanId} AND status = 'DIAJUKAN' LIMIT 1`;
    if (!pendingItems.length) return NextResponse.json({ ok: false, message: 'Tidak ada item yang dapat ditelaah.' }, { status: 400 });

    const body   = await req.json();
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ ok: false, message: parsed.error.issues[0]?.message }, { status: 400 });

    const { decisions } = parsed.data;

    // Ambil semua item_id valid milik usulan ini — cegah IDOR & NaN
    const validRows = await sql`SELECT id FROM usulan_items WHERE usulan_id = ${usulanId} AND status = 'DIAJUKAN'`;
    const validIds  = new Set((validRows as {id:number}[]).map(r => r.id));
    const filtered  = decisions.filter(d => Number.isInteger(d.item_id) && validIds.has(d.item_id));
    if (!filtered.length) return NextResponse.json({ ok: false, message: 'Tidak ada item valid untuk ditelaah.' }, { status: 400 });

    for (const d of filtered) {
      const origRow = await sql`SELECT qty, harga_est FROM usulan_items WHERE id = ${d.item_id} AND usulan_id = ${usulanId} LIMIT 1`;
      if (!origRow.length) continue;
      const orig = origRow[0] as Record<string, unknown>;
      const origQty   = Number(orig.qty);
      const origHarga = Number(orig.harga_est);

      let adminQty: number, adminHarga: number, adminNominal: number, nominalDisetujui: number;

      if (d.status === 'DITOLAK_ADMIN') {
        adminQty = origQty; adminHarga = origHarga; adminNominal = 0; nominalDisetujui = 0;
      } else if (d.status === 'DIREVISI_ADMIN') {
        adminQty   = (d.admin_qty   && d.admin_qty   > 0) ? d.admin_qty   : origQty;
        adminHarga = (d.admin_harga && d.admin_harga > 0) ? d.admin_harga : origHarga;
        adminNominal   = adminQty * adminHarga;
        nominalDisetujui = adminNominal;
      } else {
        adminQty = origQty; adminHarga = origHarga;
        adminNominal   = origQty * origHarga;
        nominalDisetujui = adminNominal;
      }

      await sql`
        UPDATE usulan_items
        SET status            = ${d.status},
            nominal_disetujui = ${nominalDisetujui},
            admin_by          = ${session.username},
            admin_tgl         = CURRENT_DATE,
            admin_rekomendasi = ${d.status},
            admin_catatan     = ${d.catatan_admin ?? ''},
            admin_qty         = ${adminQty},
            admin_harga       = ${adminHarga},
            admin_nominal     = ${adminNominal},
            updated_at        = NOW()
        WHERE id = ${d.item_id} AND usulan_id = ${usulanId} AND status = 'DIAJUKAN'
      `;
    }

    await updateHeaderStats(usulanId);

    const hdr       = rows[0] as Record<string, unknown>;
    const noUsulan  = hdr.no_usulan  as string;
    const subBidang = hdr.sub_bidang as string;
    await addNotif('__KASUBAG__', 'ADMIN_KASUBAG', 'VERIF_KASUBAG',
      `Admin telah menelaah usulan <b>${noUsulan}</b> (${subBidang}). Menunggu Kasubag.`, noUsulan, subBidang);
    await writeAuditLog({ req, eventType: 'TELAAH_USULAN', userId: session.userId, username: session.username,
      detail: `${filtered.length} item ditelaah — usulan ${noUsulan} (${subBidang})` });

    return NextResponse.json({ ok: true, message: 'Telaah berhasil disimpan.' });

  } catch (error) {
    console.error('[Telaah POST Error]', error);
    return NextResponse.json({ ok: false, message: 'Terjadi kesalahan server.' }, { status: 500 });
  }
}
