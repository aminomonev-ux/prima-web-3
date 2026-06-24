
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { sql, safeInt, withTransaction } from '@/lib/data/db';
import { getSession } from '@/lib/security/auth';
import { checkRateLimit } from '@/lib/security/ratelimit';
import { updateHeaderStats } from '@/lib/data/usulan';
import { addNotif } from '@/lib/services/notifications';
import { writeAuditLog } from '@/lib/security/auditlog';


const kasubagDecisionSchema = z.object({
  item_id:           z.number(),
  status:            z.enum(['DIPROSES', 'DITOLAK', 'DIREVISI_KASUBAG']),
  nominal_disetujui: z.number().min(0).optional(),
  kasubag_qty:       z.number().min(0).optional(),
  kasubag_harga:     z.number().min(0).optional(),
  catatan_kasubag:   z.string().optional(),
});


const kabagDecisionSchema = z.object({
  item_id:           z.number(),
  status:            z.enum(['DISETUJUI', 'DITOLAK']),
  nominal_disetujui: z.number().min(0).optional(),
  catatan_kasubag:   z.string().optional(),
});

const bodySchema = z.object({
  decisions: z.array(z.any()).min(1),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });

    const isKasubag    = session.role === 'ADMIN_KASUBAG';
    const isKabag      = session.role === 'ADMIN_KABAG';
    const isSuperAdmin = session.role === 'SUPER_ADMIN';
    if (!isKasubag && !isKabag && !isSuperAdmin) {
      return NextResponse.json({ ok: false, message: 'Tidak memiliki akses untuk memberi putusan.' }, { status: 403 });
    }
    // SDL-M16: workflow mutation = 10/menit per user.
    const rl = await checkRateLimit(`usulan_putusan:${session.userId}`, 10, 60);
    if (!rl.allowed) {
      return NextResponse.json({ ok: false, message: `Terlalu cepat. Coba lagi dalam ${rl.resetIn} detik.` }, { status: 429, headers: { 'Retry-After': String(rl.resetIn) } });
    }

    const { id } = await params;
    const usulanId = safeInt(id, 0);
    if (!usulanId) return NextResponse.json({ ok: false, message: 'ID tidak valid.' }, { status: 400 });

    const rows = await sql`SELECT status_ringkas, no_usulan, sub_bidang, pengusul FROM usulan_headers WHERE id = ${usulanId} LIMIT 1`;
    if (!rows.length) return NextResponse.json({ ok: false, message: 'Usulan tidak ditemukan.' }, { status: 404 });

    const h            = rows[0] as Record<string, unknown>;
    const headerStatus = h.status_ringkas as string;

    
    if (isKasubag && headerStatus !== 'DITELAAH') {
      return NextResponse.json({ ok: false, message: `Usulan belum siap diputuskan Kasubag (status: ${headerStatus}).` }, { status: 400 });
    }
    if (isKabag && headerStatus !== 'DIPROSES') {
      return NextResponse.json({ ok: false, message: `Usulan belum siap diputuskan Kabag (status: ${headerStatus}).` }, { status: 400 });
    }
    if (isSuperAdmin && !['DITELAAH','DIPROSES'].includes(headerStatus)) {
      return NextResponse.json({ ok: false, message: `Usulan tidak dapat diputuskan (status: ${headerStatus}).` }, { status: 400 });
    }

    const body   = await req.json();
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ ok: false, message: 'Data tidak valid.' }, { status: 400 });

    const rawDecisions = parsed.data.decisions as Record<string, unknown>[];

    
    const actAsKasubag = isKasubag || (isSuperAdmin && headerStatus === 'DITELAAH');

    // V5-USULAN-02: validasi SEMUA keputusan dulu, lalu terapkan atomik dalam
    // 1 transaksi (cegah putusan parsial kalau gagal di tengah loop).
    if (actAsKasubag) {
      const kDecs: z.infer<typeof kasubagDecisionSchema>[] = [];
      for (const raw of rawDecisions) {
        const d = kasubagDecisionSchema.safeParse(raw);
        if (!d.success) return NextResponse.json({ ok: false, message: d.error.issues[0]?.message }, { status: 400 });
        kDecs.push(d.data);
      }
      await withTransaction(async ({ tx }) => {
        for (const dec of kDecs) {
          await tx`
            UPDATE usulan_items
            SET status            = ${dec.status},
                nominal_disetujui = ${dec.nominal_disetujui ?? 0},
                kasubag_nominal   = ${dec.nominal_disetujui ?? 0},
                kasubag_qty       = ${dec.status === 'DIREVISI_KASUBAG' ? (dec.kasubag_qty ?? null) : null},
                kasubag_harga     = ${dec.status === 'DIREVISI_KASUBAG' ? (dec.kasubag_harga ?? null) : null},
                kasubag_by        = ${session.username},
                kasubag_tgl       = CURRENT_DATE,
                kasubag_putusan   = ${dec.status},
                kasubag_catatan   = ${dec.catatan_kasubag ?? ''},
                updated_at        = NOW()
            WHERE id = ${dec.item_id}
              AND usulan_id = ${usulanId}
              AND status IN ('DITELAAH','DIREVISI_ADMIN')
          `;
        }
      });
    } else {
      const bDecs: z.infer<typeof kabagDecisionSchema>[] = [];
      for (const raw of rawDecisions) {
        const d = kabagDecisionSchema.safeParse(raw);
        if (!d.success) return NextResponse.json({ ok: false, message: d.error.issues[0]?.message }, { status: 400 });
        bDecs.push(d.data);
      }
      await withTransaction(async ({ tx }) => {
        for (const dec of bDecs) {
          await tx`
            UPDATE usulan_items
            SET status            = ${dec.status},
                nominal_disetujui = CASE
                  WHEN ${dec.status} = 'DITOLAK' THEN 0
                  WHEN ${dec.nominal_disetujui ?? 0} > 0 THEN ${dec.nominal_disetujui ?? 0}
                  WHEN admin_nominal > 0 THEN admin_nominal
                  ELSE total_est
                END,
                qty_disetujui     = CASE WHEN ${dec.status} = 'DITOLAK' THEN 0 ELSE qty END,
                kabag_by          = ${session.username},
                kabag_tgl         = CURRENT_DATE,
                kabag_putusan     = ${dec.status},
                kabag_catatan     = ${dec.catatan_kasubag ?? ''},
                updated_at        = NOW()
            WHERE id = ${dec.item_id}
              AND usulan_id = ${usulanId}
              AND status IN ('DIPROSES','DIREVISI_KASUBAG')
          `;
        }
      });
    }

    await updateHeaderStats(usulanId);

    const hdr       = rows[0] as Record<string, unknown>;
    const noUsulan  = hdr.no_usulan  as string;
    const subBidang = hdr.sub_bidang as string;
    const pengusul  = hdr.pengusul   as string;

    if (actAsKasubag) {
      await addNotif('__KABAG__', 'ADMIN_KABAG', 'VERIF_KABAG',
        `Kasubag telah memproses usulan <b>${noUsulan}</b> (${subBidang}). Menunggu Kabag.`, noUsulan, subBidang);
      await addNotif(pengusul, '', 'STATUS_CHANGE',
        `Usulan <b>${noUsulan}</b> diproses Kasubag, diteruskan ke Kabag.`, noUsulan, subBidang);
    } else {
      const allDecisions = rawDecisions as Record<string,unknown>[];
      const hasSetuju = allDecisions.some(d => d.status === 'DISETUJUI');
      const hasTolak  = allDecisions.some(d => d.status === 'DITOLAK');
      const info = hasSetuju && hasTolak ? 'sebagian disetujui' : hasSetuju ? 'DISETUJUI' : 'DITOLAK';
      await addNotif(pengusul, '', 'STATUS_CHANGE',
        `Putusan final Kabag untuk usulan <b>${noUsulan}</b>: <b>${info}</b>.`, noUsulan, subBidang);
    }

    const roleLabel = actAsKasubag ? 'Kasubag' : 'Kabag';
    await writeAuditLog({ req, eventType: actAsKasubag ? 'PUTUSAN_KASUBAG' : 'PUTUSAN_KABAG',
      userId: session.userId, username: session.username,
      detail: `${rawDecisions.length} item diputuskan — usulan ${noUsulan} (${subBidang})` });

    return NextResponse.json({ ok: true, message: `Putusan ${roleLabel} berhasil disimpan.` });

  } catch (error) {
    console.error('[Putusan POST Error]', error);
    return NextResponse.json({ ok: false, message: 'Terjadi kesalahan server.' }, { status: 500 });
  }
}
