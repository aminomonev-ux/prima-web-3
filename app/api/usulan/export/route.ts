
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { sql } from '@/lib/data/db';
import { getSession } from '@/lib/security/auth';
import { checkRateLimit } from '@/lib/security/ratelimit';
import { writeAuditLog } from '@/lib/security/auditlog';
import { ADMIN_ROLES, BIDANG_ROLES, BIDANG_TO_SUBBIDANG } from '@/lib/constants';

// SDL-H5: cap array size + integer guard untuk hindari bulk DoS / NaN injection.
const ExportBodySchema = z.object({
  ids: z.array(z.number().int().positive()).min(1).max(500, 'Maks 500 usulan per export batch'),
});

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });

    // SDL-H5 (RL): bulk read = expensive, throttle 10/menit per user.
    const rl = await checkRateLimit(`usulan_export:${session.userId}`, 10, 60);
    if (!rl.allowed) {
      return NextResponse.json(
        { ok: false, message: `Terlalu banyak export. Coba lagi dalam ${rl.resetIn} detik.` },
        { status: 429, headers: { 'Retry-After': String(rl.resetIn) } }
      );
    }

    // SDL-H5 (Zod): validate body — bukan cast.
    const raw    = await req.json().catch(() => null);
    const parsed = ExportBodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, message: parsed.error.issues[0]?.message ?? 'Body tidak valid.' }, { status: 400 });
    }
    const { ids } = parsed.data;

    const isAdmin  = (ADMIN_ROLES as readonly string[]).includes(session.role);
    const isBidang = (BIDANG_ROLES as readonly string[]).includes(session.role);

    let rows: Record<string, unknown>[];

    if (isAdmin) {
      rows = await sql`SELECT usulan_id, no_item, nama_barang, spesifikasi, qty, satuan, harga_est, total_est, prioritas, status, admin_nominal, kasubag_nominal, nominal_disetujui FROM usulan_items WHERE usulan_id IN (${ids}) ORDER BY usulan_id, no_item` as Record<string, unknown>[];
    } else if (isBidang) {
      const allowedSubs = (BIDANG_TO_SUBBIDANG as Record<string, string[]>)[session.role] ?? [];
      if (!allowedSubs.length) return NextResponse.json({ ok: true, data: {} });
      rows = await sql`SELECT i.usulan_id, i.no_item, i.nama_barang, i.spesifikasi, i.qty, i.satuan, i.harga_est, i.total_est, i.prioritas, i.status, i.admin_nominal, i.kasubag_nominal, i.nominal_disetujui FROM usulan_items i JOIN usulan_headers h ON h.id = i.usulan_id WHERE i.usulan_id IN (${ids}) AND h.sub_bidang IN (${allowedSubs}) ORDER BY i.usulan_id, i.no_item` as Record<string, unknown>[];
    } else {
      rows = await sql`SELECT i.usulan_id, i.no_item, i.nama_barang, i.spesifikasi, i.qty, i.satuan, i.harga_est, i.total_est, i.prioritas, i.status, i.admin_nominal, i.kasubag_nominal, i.nominal_disetujui FROM usulan_items i JOIN usulan_headers h ON h.id = i.usulan_id WHERE i.usulan_id IN (${ids}) AND h.created_by = ${session.userId} ORDER BY i.usulan_id, i.no_item` as Record<string, unknown>[];
    }

    const data: Record<number, Record<string, unknown>[]> = {};
    for (const row of rows) {
      const uid = row.usulan_id as number;
      if (!data[uid]) data[uid] = [];
      data[uid].push(row);
    }

    // SDL-H5 (audit): pencatatan bulk PII access (UU PDP Pasal 39).
    await writeAuditLog({
      req,
      eventType: 'USULAN_EXPORT',
      userId:    session.userId,
      username:  session.username,
      detail:    `Export ${ids.length} usulan (${rows.length} item)`,
    });

    return NextResponse.json({ ok: true, data });
  } catch (error) {
    console.error('[Export Error]', error);
    return NextResponse.json({ ok: false, message: 'Terjadi kesalahan server.' }, { status: 500 });
  }
}
