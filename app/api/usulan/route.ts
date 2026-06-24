
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { sql, sqlInt, safeInt, escapeLike, withTransaction, bulkInsert } from '@/lib/data/db';
import { getSession } from '@/lib/security/auth';
import { checkRateLimit } from '@/lib/security/ratelimit';
import { writeAuditLog } from '@/lib/security/auditlog';
import { generateNoUsulan, updateHeaderStats } from '@/lib/data/usulan';
import { SUBBIDANG_ROLES, ADMIN_ROLES, SUBBIDANG_TO_BIDANG, BIDANG_ROLES, BIDANG_TO_SUBBIDANG } from '@/lib/constants';
import { addNotif, bidangRoleOf } from '@/lib/services/notifications';
import { isSafeHttpUrl, isSafeFileUrl } from '@/lib/shared/url';


export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });

    const { searchParams: p } = req.nextUrl;
    const scope    = p.get('scope')    ?? 'milik';
    const tahun    = p.get('tahun')    ?? '';
    const status   = p.get('status')   ?? '';
    const bidang   = p.get('bidang')   ?? '';
    const search   = p.get('search')   ?? '';
    const jenis    = p.get('jenis')    ?? '';
    const page     = Math.max(1, safeInt(p.get('page'),  1));
    const limit    = Math.min(100, Math.max(10, safeInt(p.get('limit'), 50)));
    const offset   = (page - 1) * limit;

    const isAdmin   = (ADMIN_ROLES as readonly string[]).includes(session.role);
    const isKasubag = session.role === 'ADMIN_KASUBAG';
    const isKabag   = session.role === 'ADMIN_KABAG';
    const isBidang  = (BIDANG_ROLES as readonly string[]).includes(session.role);

    // O7: filter "Tahun" sekarang berdasar kolom tahun_anggaran (sebelumnya berdasar
    // h.tanggal yang adalah tanggal pembuatan — bukan tahun anggaran semestinya).
    // Pakai index idx_uh_tahun_anggaran (migration 014).
    const whereTahun_early   = tahun  ? sql`AND h.tahun_anggaran = ${tahun}` : sql``;
    const itemLevelStatuses  = ['DITOLAK_ADMIN','DIREVISI_ADMIN','DITOLAK_BIDANG','DIREVISI_KASUBAG'];
    const whereStatus_early  = status
      ? itemLevelStatuses.includes(status)
        ? sql`AND EXISTS (SELECT 1 FROM usulan_items WHERE usulan_id = h.id AND status = ${status})`
        : sql`AND h.status_ringkas = ${status}`
      : sql``;
    const whereJenis = jenis  ? sql`AND h.jenis_usulan = ${jenis}` : sql``;

    // PERF-C4: shared LEFT JOIN aggregated — replace correlated subquery
    // `(SELECT JSON_OBJECTAGG(...) FROM ... WHERE usulan_id=h.id)`. Aggregate once,
    // join by id. Composite index `idx_ui_usulan_status` (migration 014) supports it.
    const statusAggJoin = sql`
      LEFT JOIN (
        SELECT usulan_id, JSON_OBJECTAGG(status, cnt) AS status_counts
          FROM (SELECT usulan_id, status, COUNT(*) cnt FROM usulan_items GROUP BY usulan_id, status) t
         GROUP BY usulan_id
      ) sc ON sc.usulan_id = h.id
    `;

    if (scope === 'bidang_data') {
      const allowedSubs = (BIDANG_TO_SUBBIDANG as Record<string,string[]>)[session.role] ?? [];
      const isSA = session.role === 'SUPER_ADMIN';
      const subList = isSA ? null : (allowedSubs.length ? allowedSubs : null);
      if (!subList && !isSA) return NextResponse.json({ ok: true, data: [], pagination: { page, limit, total: 0, totalPages: 0 } });
      const subFilter = subList ? sql`AND h.sub_bidang IN (${subList})` : sql``;
      const [cntR, dataR] = await Promise.all([
        // O6: legacy '' di-normalize ke NULL via migration 016 → cukup IS NOT NULL.
        sql`SELECT COUNT(DISTINCT h.id) as total FROM usulan_headers h
            JOIN usulan_items i ON i.usulan_id = h.id AND i.bidang_by IS NOT NULL
            WHERE 1=1 ${subFilter} ${whereJenis} ${whereTahun_early} ${whereStatus_early}`,
        sql`SELECT h.*, u.nama_lengkap as pembuat, sc.status_counts
            FROM usulan_headers h
            LEFT JOIN users u ON h.created_by = u.id
            ${statusAggJoin}
            WHERE EXISTS (
              SELECT 1 FROM usulan_items ii
              WHERE ii.usulan_id = h.id AND ii.bidang_by IS NOT NULL
            ) ${subFilter} ${whereJenis} ${whereTahun_early} ${whereStatus_early}
            ORDER BY h.updated_at DESC LIMIT ${sqlInt(limit)} OFFSET ${sqlInt(offset)}`,
      ]);
      const tot = parseInt((cntR[0] as Record<string,string>)?.total ?? '0');
      return NextResponse.json({ ok: true, data: dataR, pagination: { page, limit, total: tot, totalPages: Math.ceil(tot/limit) } });
    }

    if (scope === 'bidang_antrian') {
      const allowedSubs = (BIDANG_TO_SUBBIDANG as Record<string,string[]>)[session.role] ?? [];
      if (!allowedSubs.length && !isAdmin) return NextResponse.json({ ok: true, data: [], pagination: { page, limit, total: 0, totalPages: 0 } });
      const subList = isAdmin ? null : allowedSubs;
      const subFilter = subList ? sql`AND h.sub_bidang IN (${subList})` : sql``;
      const [countRows2, dataRows2] = await Promise.all([
        sql`SELECT COUNT(DISTINCT h.id) as total FROM usulan_headers h
            JOIN usulan_items i ON i.usulan_id = h.id AND i.status = 'DIAJUKAN_REVIEW'
            WHERE 1=1 ${subFilter}`,
        sql`SELECT h.*, u.nama_lengkap as pembuat, sc.status_counts
            FROM usulan_headers h
            LEFT JOIN users u ON h.created_by = u.id
            ${statusAggJoin}
            WHERE EXISTS (
              SELECT 1 FROM usulan_items ii
              WHERE ii.usulan_id = h.id AND ii.status = 'DIAJUKAN_REVIEW'
            ) ${subFilter}
            ORDER BY h.updated_at DESC LIMIT ${sqlInt(limit)} OFFSET ${sqlInt(offset)}`,
      ]);
      const total2 = parseInt((countRows2[0] as Record<string,string>)?.total ?? '0');
      return NextResponse.json({ ok: true, data: dataRows2, pagination: { page, limit, total: total2, totalPages: Math.ceil(total2/limit) } });
    }

    // SEC (L60): ownership di-enforce berbasis ROLE, BUKAN nilai param `scope`.
    // Sebelumnya filter hanya aktif saat scope==='milik' → user low-priv cukup kirim
    // scope=semua untuk lolos & baca usulan semua bidang (broken access control / IDOR).
    // Sekarang: siapa pun yang bukan admin/kasubag/kabag/bidang SELALU dibatasi ke miliknya
    // di jalur fallback ini, apa pun nilai scope-nya.
    const isLowPriv       = !isAdmin && !isKasubag && !isKabag && !isBidang;
    const whereCreatedBy  = isLowPriv
      ? sql`AND h.created_by = ${session.userId}` : sql``;
    // DA-2 (audit 2026-06-10): role BIDANG di jalur fallback dulu tanpa filter apa pun
    // → bisa baca header lintas bidang via scope=semua. Batasi ke sub-bidang wilayahnya
    // (sama dengan scope bidang_data); list kosong = tidak boleh lihat apa pun.
    const bidangSubs = isBidang
      ? ((BIDANG_TO_SUBBIDANG as Record<string, string[]>)[session.role] ?? []) : null;
    if (bidangSubs && !bidangSubs.length) {
      return NextResponse.json({ ok: true, data: [], pagination: { page, limit, total: 0, totalPages: 0 } });
    }
    const whereBidangOwn = bidangSubs ? sql`AND h.sub_bidang IN (${bidangSubs})` : sql``;
    // Reuse early-defined filters (whereTahun_early, whereStatus_early sudah include PERF-C5 sargable date)
    const whereTahun      = whereTahun_early;
    const whereStatus     = whereStatus_early;
    const whereBidang     = bidang ? sql`AND h.sub_bidang = ${bidang}` : sql``;
    // O5: escapeLike supaya % atau _ di input tidak diperlakukan sebagai wildcard MySQL.
    const searchEsc       = search ? escapeLike(search) : '';
    const whereSearch     = searchEsc ? sql`AND (
      h.no_usulan LIKE ${'%'+searchEsc+'%'}
      OR h.pengusul LIKE ${'%'+searchEsc+'%'}
      OR EXISTS (SELECT 1 FROM usulan_items WHERE usulan_id = h.id AND nama_barang LIKE ${'%'+searchEsc+'%'} LIMIT 1)
    )` : sql``;
    const isPlainAdmin    = session.role === 'ADMIN';
    const whereVerifStage = isKasubag
      ? sql`AND h.status_ringkas IN ('DITELAAH','DIPROSES','DISETUJUI','DITOLAK')`
      : isKabag
      ? sql`AND h.status_ringkas IN ('DIPROSES','DISETUJUI','DITOLAK')`
      : isPlainAdmin
      ? sql`AND h.status_ringkas NOT IN ('DRAFT','DIAJUKAN_REVIEW','REVISI_BIDANG','DITOLAK_BIDANG')`
      : sql``;
    // Antrian telaah Admin vs hasil telaah (panel "Data Admin"). Filter item-level
    // (bukan status_ringkas) karena telaah bisa parsial — selama masih ada item
    // DIAJUKAN, kelompok tetap di antrian; tuntas semua → pindah ke data_admin.
    const whereAdminStage = scope === 'antrian_admin'
      ? sql`AND EXISTS (SELECT 1 FROM usulan_items WHERE usulan_id = h.id AND status = 'DIAJUKAN')`
      : scope === 'data_admin'
      ? sql`AND NOT EXISTS (SELECT 1 FROM usulan_items WHERE usulan_id = h.id AND status = 'DIAJUKAN')
            AND h.status_ringkas NOT IN ('DRAFT','DIAJUKAN_REVIEW','REVISI_BIDANG','DITOLAK_BIDANG')`
      : sql``;

    if (scope === 'satu_bidang') {
      const bidang  = (SUBBIDANG_TO_BIDANG as Record<string,string>)[session.role] ?? '';
      const subList = bidang ? ((BIDANG_TO_SUBBIDANG as Record<string,string[]>)[bidang] ?? []) : [];
      if (!subList.length) return NextResponse.json({ ok: true, data: [], pagination: { page, limit, total: 0, totalPages: 0 } });
      const [cntR, dataR] = await Promise.all([
        sql`SELECT COUNT(*) as total FROM usulan_headers h WHERE h.sub_bidang IN (${subList}) ${whereTahun} ${whereStatus} ${whereJenis} ${whereSearch}`,
        sql`SELECT h.*, u.nama_lengkap as pembuat, sc.status_counts
            FROM usulan_headers h
            LEFT JOIN users u ON h.created_by = u.id
            ${statusAggJoin}
            WHERE h.sub_bidang IN (${subList}) ${whereTahun} ${whereStatus} ${whereJenis} ${whereSearch}
            ORDER BY h.updated_at DESC LIMIT ${sqlInt(limit)} OFFSET ${sqlInt(offset)}`,
      ]);
      const tot = parseInt((cntR[0] as Record<string,string>)?.total ?? '0');
      return NextResponse.json({ ok: true, data: dataR, pagination: { page, limit, total: tot, totalPages: Math.ceil(tot/limit) } });
    }

    // PERF-C4: jumlah_item_admin & total_nilai_admin baca langsung dari kolom header
    // (di-maintain oleh updateHeaderStats). Sebelum: 2 correlated subquery per row.
    const [countRows, dataRows] = await Promise.all([
      sql`SELECT COUNT(*) as total FROM usulan_headers h WHERE 1=1
          ${whereCreatedBy} ${whereBidangOwn} ${whereTahun} ${whereStatus} ${whereBidang} ${whereJenis} ${whereSearch} ${whereVerifStage} ${whereAdminStage}`,
      // PERF-C4: jumlah_item_admin & total_nilai_admin baca dari kolom header (persisted by updateHeaderStats).
      // statusAggJoin = LEFT JOIN aggregated (sebelumnya correlated subquery JSON_OBJECTAGG per row).
      // matched_items = search support (preserve dari main).
      sql`SELECT h.*, u.nama_lengkap as pembuat, sc.status_counts,
          ${searchEsc ? sql`(SELECT GROUP_CONCAT(nama_barang ORDER BY no_item SEPARATOR ', ') FROM (SELECT nama_barang, no_item FROM usulan_items WHERE usulan_id=h.id AND nama_barang LIKE ${'%'+searchEsc+'%'} ORDER BY no_item LIMIT 5) _m) as matched_items` : sql`NULL as matched_items`}
          FROM usulan_headers h
          LEFT JOIN users u ON h.created_by = u.id
          ${statusAggJoin}
          WHERE 1=1 ${whereCreatedBy} ${whereBidangOwn} ${whereTahun} ${whereStatus} ${whereBidang} ${whereJenis} ${whereSearch} ${whereVerifStage} ${whereAdminStage}
          ORDER BY h.updated_at DESC LIMIT ${sqlInt(limit)} OFFSET ${sqlInt(offset)}`,
    ]);

    const total      = parseInt((countRows[0] as Record<string,string>)?.total ?? '0');
    const totalPages = Math.ceil(total / limit);

    return NextResponse.json({
      ok: true,
      data: dataRows,
      pagination: { page, limit, total, totalPages },
    });

  } catch (error) {
    console.error('[Usulan GET Error]', error);
    return NextResponse.json({ ok: false, message: 'Terjadi kesalahan server.' }, { status: 500 });
  }
}


// V5-INJ-01: tolak skema non-http(s) (cegah `javascript:`/`data:` stored-XSS saat
// link dirender sebagai <a href> di reviewer). Kosong tetap boleh.
const optUrl = z.string().trim().optional()
  .refine(v => !v || isSafeHttpUrl(v), 'URL harus diawali http:// atau https://');

// file_url = path download internal dari /api/upload (relatif), bukan URL eksternal.
const optFileUrl = z.string().trim().optional()
  .refine(v => !v || isSafeFileUrl(v), 'Lampiran tidak valid');

const itemSchema = z.object({
  nama_barang:  z.string().min(1, 'Nama barang wajib diisi').max(255),
  spesifikasi:  z.string().max(2000).optional(),
  qty:          z.number().min(1, 'Jumlah minimal 1'),
  satuan:       z.string().min(1).max(50),
  harga_est:    z.number().min(0),
  prioritas:    z.enum(['TINGGI', 'SEDANG', 'RENDAH']),
  alasan:       z.string().max(2000).optional(),
  url_merk1:    optUrl,
  url_merk2:    optUrl,
  url_merk3:    optUrl,
  file_url:     optFileUrl,
});

const groupSchema = z.object({
  sub_bidang:  z.string().min(1, 'Sub bidang wajib dipilih').max(100),
  jenis_belanja:  z.string().max(255).optional(),
  items:       z.array(itemSchema).min(1, 'Minimal 1 item per grup').max(500),
});

const createSchema = z.object({
  tahun_anggaran: z.string().optional(),
  jenis_usulan:   z.enum(['MURNI','PERUBAHAN','PERGESERAN']).default('MURNI'),
  is_draft:       z.boolean().default(false),
  groups:         z.array(groupSchema).min(1, 'Minimal 1 grup'),
});

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });

    const rl = await checkRateLimit(`usulan_post:${session.userId}`, 20, 60);
    if (!rl.allowed) return NextResponse.json({ ok: false, message: 'Terlalu banyak permintaan. Coba lagi dalam 1 menit.' }, { status: 429 });

    const canCreate = (SUBBIDANG_ROLES as readonly string[]).includes(session.role) || session.role === 'SUPER_ADMIN';
    if (!canCreate) return NextResponse.json({ ok: false, message: 'Role Anda tidak dapat membuat usulan.' }, { status: 403 });

    const body   = await req.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ ok: false, message: parsed.error.issues[0]?.message }, { status: 400 });

    const { tahun_anggaran, jenis_usulan, groups, is_draft } = parsed.data;

    if (!is_draft) {
      const cfgRows = await sql`SELECT \`key\`, value FROM app_config WHERE \`key\` IN ('batas_aktif','batas_mulai','batas_selesai')`;
      const cfg: Record<string,string> = {};
      (cfgRows as {key:string;value:string}[]).forEach(r => { cfg[r.key] = r.value; });
      if (cfg.batas_aktif === 'true') {
        const today = new Date(); today.setHours(0,0,0,0);
        const mulai   = cfg.batas_mulai   ? new Date(cfg.batas_mulai)   : null;
        const selesai = cfg.batas_selesai ? new Date(cfg.batas_selesai) : null;
        if (mulai) mulai.setHours(0,0,0,0);
        if (selesai) selesai.setHours(23,59,59,999);
        const outOfRange = (mulai && today < mulai) || (selesai && today > selesai);
        if (outOfRange) {
          return NextResponse.json({ ok: false, message: 'Pengajuan usulan sedang ditutup. Usulan hanya dapat dikirim dalam periode yang ditentukan.' }, { status: 403 });
        }
      }
    }

    const baseNo = await generateNoUsulan(groups[0].sub_bidang, tahun_anggaran ? parseInt(tahun_anggaran) : undefined, jenis_usulan);
    const multiGroup = groups.length > 1;
    const created: { no_usulan: string; id: number }[] = [];

    for (let g = 0; g < groups.length; g++) {
      const grp = groups[g];
      const noUsulan  = multiGroup ? `${baseNo}-${g + 1}` : baseNo;
      const hasBidang = !!SUBBIDANG_TO_BIDANG[grp.sub_bidang];
      const status    = is_draft ? 'DRAFT' : (hasBidang ? 'DIAJUKAN_REVIEW' : 'DIAJUKAN');

      // V5-USULAN-01: header + items atomic dalam 1 transaksi (cegah commit parsial).
      const usulanId = await withTransaction(async ({ tx, conn }) => {
        const headerRows = await tx`
          INSERT INTO usulan_headers (no_usulan, pengusul, sub_bidang, jenis_belanja, tahun_anggaran, jenis_usulan, status_ringkas, created_by)
          VALUES (${noUsulan}, ${session.username}, ${grp.sub_bidang}, ${grp.jenis_belanja ?? ''},
                  ${tahun_anggaran ?? String(new Date().getFullYear())}, ${jenis_usulan}, ${status}, ${session.userId})
        `;
        const hid = (headerRows[0] as Record<string,unknown>).insertId as number;
        const itemRows = grp.items.map((item, i) => [
          hid, noUsulan, i + 1, grp.sub_bidang, session.username, grp.jenis_belanja ?? '',
          item.nama_barang, item.spesifikasi ?? '', item.qty, item.satuan, item.harga_est,
          item.prioritas, status,
          item.alasan ?? '', item.url_merk1 ?? '', item.url_merk2 ?? '', item.url_merk3 ?? '', item.file_url ?? '',
        ]);
        await bulkInsert('usulan_items',
          ['usulan_id','no_usulan','no_item','sub_bidang','pengusul','jenis_belanja',
           'nama_barang','spesifikasi','qty','satuan','harga_est','prioritas','status',
           'alasan','url_merk1','url_merk2','url_merk3','file_url'],
          itemRows, conn);
        return hid;
      });

      // Recompute stats setelah commit (idempoten — baca data ter-commit).
      await updateHeaderStats(usulanId);
      created.push({ no_usulan: noUsulan, id: usulanId });

      const pesanNotif = `Usulan baru dari <b>${session.username}</b> (${grp.sub_bidang}) — ${grp.items.length} item`;
      if (!is_draft) {
        if (hasBidang) {
          const br = bidangRoleOf(grp.sub_bidang);
          if (br) await addNotif('__BIDANG__' + br, br, 'NEW_REVIEW', pesanNotif, noUsulan, grp.sub_bidang);
        } else {
          await addNotif('__ADMIN__', 'ADMIN', 'NEW_USULAN', pesanNotif, noUsulan, grp.sub_bidang);
        }
      }
    }

    const msg = is_draft
      ? `${created.length} draft tersimpan.`
      : `${created.length} usulan berhasil dikirim!`;
    await writeAuditLog({ req, eventType: 'USULAN_CREATE', userId: session.userId, username: session.username, detail: `${created.length} usulan: ${created.map(c=>c.no_usulan).join(', ')}` });
    return NextResponse.json({ ok: true, data: created, message: msg });

  } catch (error) {
    console.error('[Usulan POST Error]', error);
    // BUG-C6: kalau race condition no_usulan kena UNIQUE constraint (migration 013)
    const err = error as { code?: string };
    if (err.code === 'ER_DUP_ENTRY') {
      return NextResponse.json({
        ok: false,
        message: 'Nomor usulan bertabrakan dengan request lain. Silakan submit ulang.',
      }, { status: 409 });
    }
    return NextResponse.json({ ok: false, message: 'Terjadi kesalahan server.' }, { status: 500 });
  }
}


export async function PUT(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });

    const rl = await checkRateLimit(`usulan_put:${session.userId}`, 10, 60);
    if (!rl.allowed) return NextResponse.json({ ok: false, message: 'Terlalu banyak permintaan. Coba lagi dalam 1 menit.' }, { status: 429 });

    // Ambil semua usulan milik user yang bisa dikirim
    const headers = await sql`
      SELECT id, status_ringkas, sub_bidang
      FROM usulan_headers
      WHERE created_by = ${session.userId}
        AND status_ringkas IN ('DRAFT', 'REVISI_BIDANG', 'DIREVISI_ADMIN')
    `;

    if (!headers.length) {
      return NextResponse.json({ ok: false, message: 'Tidak ada usulan yang bisa dikirim.' }, { status: 400 });
    }

    // V5-USULAN-03: semua transisi submit atomic dalam 1 transaksi.
    const submittedIds: number[] = [];
    await withTransaction(async ({ tx }) => {
      for (const row of headers as { id: number; status_ringkas: string; sub_bidang: string }[]) {
        const { id: usulanId, status_ringkas, sub_bidang } = row;
        const hasBidang = !!SUBBIDANG_TO_BIDANG[sub_bidang];

        if (status_ringkas === 'DRAFT') {
          const targetStatus = hasBidang ? 'DIAJUKAN_REVIEW' : 'DIAJUKAN';
          await tx`UPDATE usulan_items SET status = ${targetStatus} WHERE usulan_id = ${usulanId} AND status = 'DRAFT'`;
        } else if (status_ringkas === 'REVISI_BIDANG') {
          await tx`UPDATE usulan_items SET status = 'DIAJUKAN_REVIEW' WHERE usulan_id = ${usulanId} AND status = 'REVISI_BIDANG'`;
        } else if (status_ringkas === 'DIREVISI_ADMIN') {
          await tx`UPDATE usulan_items SET status = 'DIAJUKAN' WHERE usulan_id = ${usulanId} AND status = 'DIREVISI_ADMIN'`;
        }
        submittedIds.push(usulanId);
      }
    });
    for (const id of submittedIds) await updateHeaderStats(id);
    const count = submittedIds.length;

    await writeAuditLog({ req, eventType: 'USULAN_UPDATE', userId: session.userId, username: session.username, detail: `Bulk submit ${count} usulan` });
    return NextResponse.json({ ok: true, message: `${count} usulan berhasil dikirim.`, count });

  } catch (error) {
    console.error('[Usulan PUT Bulk Error]', error);
    return NextResponse.json({ ok: false, message: 'Terjadi kesalahan server.' }, { status: 500 });
  }
}
