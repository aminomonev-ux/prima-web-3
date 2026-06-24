
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { sql, safeInt, queryOne } from '@/lib/data/db';
import { getSession } from '@/lib/security/auth';
import { checkRateLimit } from '@/lib/security/ratelimit';
import { updateHeaderStats } from '@/lib/data/usulan';
import { BIDANG_ROLES, BIDANG_TO_SUBBIDANG } from '@/lib/constants';
import { addNotif } from '@/lib/services/notifications';
import { writeAuditLog } from '@/lib/security/auditlog';

const decisionSchema = z.object({
  item_id:         z.number(),
  keputusan:       z.enum(['APPROVE', 'TOLAK', 'KEMBALIKAN', 'REVISI_LANGSUNG']),
  catatan:         z.string().optional(),
  rev_nama:        z.string().optional(),
  rev_spesifikasi: z.string().optional(),
  rev_qty:         z.number().optional(),
  rev_harga:       z.number().optional(),
});

const bodySchema = z.object({
  decisions: z.array(decisionSchema).min(1),
  // Optimistic locking: timestamp updated_at saat modal Bidang dibuka.
  // Kalau header.updated_at di DB > timestamp ini = data sudah berubah oleh
  // user lain (mis. pengusul cancel via BUG-W4) → return 409, Bidang refresh.
  updated_at_check: z.string().optional(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });

    const isBidang     = (BIDANG_ROLES as readonly string[]).includes(session.role);
    const isSuperAdmin = session.role === 'SUPER_ADMIN';
    if (!isBidang && !isSuperAdmin) {
      return NextResponse.json({ ok: false, message: 'Hanya Bidang yang dapat mereview usulan ini.' }, { status: 403 });
    }
    // SDL-M16: workflow mutation = 10/menit per user.
    const rl = await checkRateLimit(`usulan_review_bidang:${session.userId}`, 10, 60);
    if (!rl.allowed) {
      return NextResponse.json({ ok: false, message: `Terlalu cepat. Coba lagi dalam ${rl.resetIn} detik.` }, { status: 429, headers: { 'Retry-After': String(rl.resetIn) } });
    }

    const { id } = await params;
    const usulanId = safeInt(id, 0);
    if (!usulanId) return NextResponse.json({ ok: false, message: 'ID tidak valid.' }, { status: 400 });

    // O1: queryOne — null check + typed access, hilangkan `rows[0] as Record<...>` boilerplate.
    const h = await queryOne<{ sub_bidang: string; pengusul: string; no_usulan: string; updated_at: string }>(
      sql`SELECT sub_bidang, pengusul, no_usulan, updated_at FROM usulan_headers WHERE id = ${usulanId} LIMIT 1`
    );
    if (!h) return NextResponse.json({ ok: false, message: 'Usulan tidak ditemukan.' }, { status: 404 });

    if (isBidang) {
      const allowedSubs = (BIDANG_TO_SUBBIDANG as Record<string,string[]>)[session.role] ?? [];
      if (!allowedSubs.includes(h.sub_bidang)) {
        return NextResponse.json({ ok: false, message: 'Bidang Anda tidak berwenang mereview sub bidang ini.' }, { status: 403 });
      }
    }

    const pendingItems = await sql`SELECT id FROM usulan_items WHERE usulan_id = ${usulanId} AND status = 'DIAJUKAN_REVIEW' LIMIT 1`;
    if (!pendingItems.length) return NextResponse.json({ ok: false, message: 'Tidak ada item yang menunggu review bidang.' }, { status: 400 });

    const body   = await req.json();
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ ok: false, message: parsed.error.issues[0]?.message }, { status: 400 });

    const { decisions, updated_at_check } = parsed.data;

    // Optimistic locking: kalau client kirim timestamp saat buka modal & DB
    // sudah lebih baru (>1 detik selisih) → ada user lain yang sudah mengubah
    // (mis. pengusul cancel via BUG-W4). Stop dan minta refresh.
    if (updated_at_check) {
      const dbUpdatedAt     = new Date(h.updated_at).getTime();
      const clientUpdatedAt = new Date(updated_at_check).getTime();
      if (Math.abs(dbUpdatedAt - clientUpdatedAt) > 1000) {
        return NextResponse.json({
          ok: false,
          message: 'Usulan ini sudah diubah oleh pengguna lain (mungkin dibatalkan pengusul). Refresh dulu sebelum submit review.',
        }, { status: 409 });
      }
    }

    for (const d of decisions) {
      if (d.keputusan === 'REVISI_LANGSUNG') {
        const nama  = d.rev_nama        ?? null;
        const spek  = d.rev_spesifikasi ?? null;
        const qty   = d.rev_qty         ?? null;
        const harga = d.rev_harga       ?? null;

        // BUG-W7: *_asal = COALESCE(asal, current) → set hanya kalau masih NULL
        // (revisi pertama). Pattern lama `CASE WHEN ${rev} != current THEN current
        // ELSE asal END` salah: revisi kedua akan overwrite *_asal dengan nilai
        // revisi pertama, kehilangan nilai original yang pertama kali pengusul submit.
        await sql`
          UPDATE usulan_items
          SET status           = 'DIAJUKAN',
              bidang_by        = ${session.username},
              bidang_tgl       = CURRENT_DATE,
              bidang_keputusan = 'REVISI_LANGSUNG',
              bidang_catatan   = ${d.catatan ?? ''},
              nama_asal        = COALESCE(nama_asal, nama_barang),
              spesifikasi_asal = COALESCE(spesifikasi_asal, spesifikasi),
              qty_asal         = COALESCE(qty_asal, qty),
              harga_asal       = COALESCE(harga_asal, harga_est),
              nama_barang      = COALESCE(${nama}, nama_barang),
              spesifikasi      = COALESCE(${spek}, spesifikasi),
              qty              = COALESCE(${qty},  qty),
              harga_est        = COALESCE(${harga}, harga_est),
              updated_at       = NOW()
          WHERE id = ${d.item_id} AND usulan_id = ${usulanId} AND sub_bidang = ${h.sub_bidang} AND status = 'DIAJUKAN_REVIEW'
        `;
      } else {
        const newStatus = d.keputusan === 'APPROVE' ? 'DIAJUKAN'
                        : d.keputusan === 'TOLAK'   ? 'DITOLAK_BIDANG'
                        : 'REVISI_BIDANG';
        await sql`
          UPDATE usulan_items
          SET status           = ${newStatus},
              bidang_by        = ${session.username},
              bidang_tgl       = CURRENT_DATE,
              bidang_keputusan = ${d.keputusan},
              bidang_catatan   = ${d.catatan ?? ''},
              updated_at       = NOW()
          WHERE id = ${d.item_id} AND usulan_id = ${usulanId} AND sub_bidang = ${h.sub_bidang} AND status = 'DIAJUKAN_REVIEW'
        `;
      }
    }

    await updateHeaderStats(usulanId);

    const noUsulan  = h.no_usulan;
    const subBidang = h.sub_bidang;
    const pengusul  = h.pengusul;
    const notifSent: Record<string, boolean> = {};

    for (const d of decisions) {
      const pesanItem = `Item usulan <b>${noUsulan}</b> (${subBidang})`;
      if (d.keputusan === 'APPROVE' || d.keputusan === 'REVISI_LANGSUNG') {
        if (!notifSent['admin']) {
          await addNotif('__ADMIN__', 'ADMIN', 'NEW_USULAN', `Item diverifikasi Bidang, usulan <b>${noUsulan}</b> (${subBidang}) siap ditelaah.`, noUsulan, subBidang);
          notifSent['admin'] = true;
        }
        await addNotif(pengusul, '', 'STATUS_CHANGE', `${pesanItem}: ${d.keputusan === 'REVISI_LANGSUNG' ? 'direvisi langsung oleh Bidang' : 'disetujui Bidang'}, diteruskan ke Admin.`, noUsulan, subBidang);
      } else if (d.keputusan === 'TOLAK') {
        await addNotif(pengusul, '', 'STATUS_CHANGE', `${pesanItem}: ditolak Bidang.${d.catatan ? ' Catatan: ' + d.catatan : ''}`, noUsulan, subBidang);
      } else if (d.keputusan === 'KEMBALIKAN') {
        await addNotif(pengusul, '', 'REVISI_BIDANG', `${pesanItem}: dikembalikan untuk revisi.${d.catatan ? ' Catatan: ' + d.catatan : ''}`, noUsulan, subBidang);
      }
    }

    await writeAuditLog({ req, eventType: 'REVIEW_BIDANG', userId: session.userId, username: session.username,
      detail: `${decisions.length} item direview — usulan ${noUsulan} (${subBidang})` });

    return NextResponse.json({ ok: true, message: 'Review Bidang berhasil disimpan.' });

  } catch (error) {
    console.error('[Bidang Review POST Error]', error);
    return NextResponse.json({ ok: false, message: 'Terjadi kesalahan server.' }, { status: 500 });
  }
}
