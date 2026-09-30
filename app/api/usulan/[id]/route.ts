import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { sql, withTransaction, safeInt, bulkInsert } from '@/lib/data/db';
import { getSession } from '@/lib/security/auth';
import { checkRateLimit } from '@/lib/security/ratelimit';
import { writeAuditLog } from '@/lib/security/auditlog';
import { ADMIN_ROLES, BIDANG_ROLES, SUBBIDANG_ROLES, BIDANG_TO_SUBBIDANG, SUBBIDANG_TO_BIDANG } from '@/lib/constants';
import { generateNoUsulan, updateHeaderStats, jendelaPengajuanTerbuka } from '@/lib/data/usulan';
import { ItemUsulanSchema, JenisUsulanSchema, QtyUsulanSchema, HargaUsulanSchema } from '@/lib/data/usulan-schemas';
import { PESAN_JENDELA_TUTUP } from '@/lib/shared/jendela-pengajuan';
import { addNotif, bidangRoleOf, notifBidang } from '@/lib/services/notifications';
import { usulanMati } from '../_guard';


export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
    const mati = await usulanMati(session.role);
    if (mati) return mati;

    const { id } = await params;
    // BUG-W2: NaN guard — `/api/usulan/abc` → parseInt=NaN → WHERE id=NULL → silent 404
    const usulanId = safeInt(id, 0);
    if (!usulanId) return NextResponse.json({ ok: false, message: 'ID usulan tidak valid.' }, { status: 400 });
    const isAdmin     = (ADMIN_ROLES as readonly string[]).includes(session.role);
    const isBidang    = (BIDANG_ROLES as readonly string[]).includes(session.role);
    const isSubBidang = (SUBBIDANG_ROLES as readonly string[]).includes(session.role);
    const allowedSubs = isBidang ? ((BIDANG_TO_SUBBIDANG as Record<string,string[]>)[session.role] ?? []) : [];

    // Sub-bidang user dapat melihat detail usulan sesama satu bidang (fitur "Satu Bidang")
    const sameBidangSubs: string[] = isSubBidang
      ? (() => {
          const bidang = (SUBBIDANG_TO_BIDANG as Record<string,string>)[session.role] ?? '';
          return bidang ? ((BIDANG_TO_SUBBIDANG as Record<string,string[]>)[bidang] ?? []) : [];
        })()
      : [];

    let accessClause;
    if (isAdmin) {
      accessClause = sql``;
    } else if (isBidang && allowedSubs.length) {
      accessClause = sql`AND h.sub_bidang IN (${allowedSubs})`;
    } else if (sameBidangSubs.length) {
      accessClause = sql`AND (h.created_by = ${session.userId} OR h.sub_bidang IN (${sameBidangSubs}))`;
    } else {
      accessClause = sql`AND h.created_by = ${session.userId}`;
    }

    const headers = await sql`
      SELECT h.*, u.nama_lengkap as pembuat
      FROM usulan_headers h
      LEFT JOIN users u ON h.created_by = u.id
      WHERE h.id = ${usulanId}
      ${accessClause}
      LIMIT 1
    `;

    if (!headers.length) return NextResponse.json({ ok: false, message: 'Usulan tidak ditemukan.' }, { status: 404 });

    const isPlainAdmin = session.role === 'ADMIN' || session.role === 'ADMIN_KASUBAG' || session.role === 'ADMIN_KABAG';
    const items = isPlainAdmin
      ? await sql`SELECT * FROM usulan_items WHERE usulan_id = ${usulanId} AND status NOT IN ('DRAFT','DIAJUKAN_REVIEW','REVISI_BIDANG','DITOLAK_BIDANG') ORDER BY no_item`
      : await sql`SELECT * FROM usulan_items WHERE usulan_id = ${usulanId} ORDER BY no_item`;

    return NextResponse.json({ ok: true, data: { header: headers[0], items } });

  } catch (error) {
    console.error('[Usulan GET Detail Error]', error);
    return NextResponse.json({ ok: false, message: 'Terjadi kesalahan server.' }, { status: 500 });
  }
}


export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
    const mati = await usulanMati(session.role);
    if (mati) return mati;
    // SDL-M16: workflow mutation PATCH (ajukan/cancel/update_draft) = 20/menit per user.
    const rl = await checkRateLimit(`usulan_patch:${session.userId}`, 20, 60);
    if (!rl.allowed) {
      return NextResponse.json({ ok: false, message: `Terlalu cepat. Coba lagi dalam ${rl.resetIn} detik.` }, { status: 429, headers: { 'Retry-After': String(rl.resetIn) } });
    }

    const { id }   = await params;
    const body     = await req.json();
    const { action } = body;

    // BUG-W2: NaN guard
    const usulanId = safeInt(id, 0);
    if (!usulanId) return NextResponse.json({ ok: false, message: 'ID usulan tidak valid.' }, { status: 400 });

    if (action === 'ajukan') {
      
      const rows = await sql`SELECT status_ringkas, sub_bidang, created_by FROM usulan_headers WHERE id = ${usulanId} LIMIT 1`;
      if (!rows.length) return NextResponse.json({ ok: false, message: 'Usulan tidak ditemukan.' }, { status: 404 });
      const h = rows[0] as Record<string,unknown>;
      if (h.created_by !== session.userId && session.role !== 'SUPER_ADMIN') return NextResponse.json({ ok: false, message: 'Bukan usulan Anda.' }, { status: 403 });

      const curStatus = h.status_ringkas as string;
      const hasBidang = !!SUBBIDANG_TO_BIDANG[h.sub_bidang as string];

      if (curStatus === 'DRAFT') {
        // B3: pengiriman PERTAMA tunduk jendela pengajuan — dulu hanya POST yang
        // bertanya, jadi "simpan draf lalu Ajukan" melewatinya.
        if (!(await jendelaPengajuanTerbuka())) {
          return NextResponse.json({ ok: false, message: PESAN_JENDELA_TUTUP }, { status: 403 });
        }
        const targetStatus = hasBidang ? 'DIAJUKAN_REVIEW' : 'DIAJUKAN';
        await sql`UPDATE usulan_items SET status = ${targetStatus} WHERE usulan_id = ${usulanId} AND status = 'DRAFT'`;
        await updateHeaderStats(usulanId);
        return NextResponse.json({ ok: true, message: hasBidang ? 'Usulan dikirim ke Review Bidang.' : 'Usulan berhasil diajukan.' });
      }
      if (curStatus === 'REVISI_BIDANG') {
        
        await sql`UPDATE usulan_items SET status = 'DIAJUKAN_REVIEW' WHERE usulan_id = ${usulanId} AND status = 'REVISI_BIDANG'`;
        await updateHeaderStats(usulanId);
        return NextResponse.json({ ok: true, message: 'Usulan dikirim ulang ke Review Bidang.' });
      }
      if (curStatus === 'DIREVISI_ADMIN') {
        
        await sql`UPDATE usulan_items SET status = 'DIAJUKAN' WHERE usulan_id = ${usulanId} AND status = 'DIREVISI_ADMIN'`;
        await updateHeaderStats(usulanId);
        return NextResponse.json({ ok: true, message: 'Usulan dikirim ulang ke Admin.' });
      }
      return NextResponse.json({ ok: false, message: `Usulan status ${curStatus} tidak bisa diajukan ulang.` }, { status: 400 });
    }

    if (action === 'cancel_by_creator') {
      // BUG-W4: pengusul tarik kembali usulan yang sudah DIAJUKAN_REVIEW
      // sebelum Bidang sentuh. Konservatif: hanya status DIAJUKAN_REVIEW
      // (kalau sudah ada item DIPROSES/DITELAAH oleh bidang/admin, tidak boleh).
      const rows = await sql`SELECT status_ringkas, sub_bidang, no_usulan, created_by FROM usulan_headers WHERE id = ${usulanId} LIMIT 1`;
      if (!rows.length) return NextResponse.json({ ok: false, message: 'Usulan tidak ditemukan.' }, { status: 404 });
      const h = rows[0] as Record<string,unknown>;
      if (h.created_by !== session.userId && session.role !== 'SUPER_ADMIN') {
        return NextResponse.json({ ok: false, message: 'Bukan usulan Anda.' }, { status: 403 });
      }
      if (h.status_ringkas !== 'DIAJUKAN_REVIEW') {
        return NextResponse.json({ ok: false, message: `Hanya usulan berstatus 'Menunggu Bidang Review' yang bisa dibatalkan (status sekarang: ${h.status_ringkas}).` }, { status: 400 });
      }
      // Defensive: pastikan tidak ada item yang sudah disentuh bidang
      // O6: legacy data '' sudah di-normalize ke NULL via migration 016 → cukup IS NOT NULL.
      const touchedRows = await sql`SELECT 1 FROM usulan_items WHERE usulan_id = ${usulanId} AND bidang_by IS NOT NULL LIMIT 1`;
      if (touchedRows.length > 0) {
        return NextResponse.json({ ok: false, message: 'Bidang sudah mulai review. Tidak bisa dibatalkan, minta Bidang untuk kembalikan/tolak.' }, { status: 400 });
      }
      // Revert: items DIAJUKAN_REVIEW → DRAFT. Header status auto-recompute via updateHeaderStats.
      await sql`UPDATE usulan_items SET status = 'DRAFT', updated_at = NOW() WHERE usulan_id = ${usulanId} AND status = 'DIAJUKAN_REVIEW'`;
      await updateHeaderStats(usulanId);

      // Notif Bidang supaya tidak buang waktu review usulan yang sudah dibatalkan
      const noUsulan  = h.no_usulan  as string;
      const subBidang = h.sub_bidang as string;
      const br        = bidangRoleOf(subBidang);
      if (br) {
        // `notifBidang(br)`, bukan `br` telanjang — lihat baris serupa di jalur
        // "revisi dikirim ulang" beberapa puluh baris di bawah, yang sejak awal
        // memakai bentuk yang benar. Dua ejaan untuk maksud yang sama, di berkas
        // yang sama, dan yang salah ini membuat Bidang tidak pernah tahu antrean
        // reviewnya berkurang.
        await addNotif(notifBidang(br), br, 'STATUS_CHANGE', `Usulan <b>${noUsulan}</b> (${subBidang}) dibatalkan oleh pengusul. Antrian review berkurang.`, noUsulan, subBidang);
      }

      await writeAuditLog({ req, eventType: 'USULAN_CANCEL', userId: session.userId, username: session.username, detail: `Cancel usulan ${noUsulan} (id=${usulanId}) — revert ke DRAFT` });
      return NextResponse.json({ ok: true, message: 'Usulan dibatalkan dan dikembalikan ke Draft. Anda dapat edit dan ajukan ulang.' });
    }

    if (action === 'resubmit_revisi_bidang') {
      const rows = await sql`SELECT created_by, no_usulan, sub_bidang FROM usulan_headers WHERE id = ${usulanId} LIMIT 1`;
      if (!rows.length) return NextResponse.json({ ok: false, message: 'Usulan tidak ditemukan.' }, { status: 404 });
      const h = rows[0] as Record<string,unknown>;
      if (h.created_by !== session.userId && session.role !== 'SUPER_ADMIN') return NextResponse.json({ ok: false, message: 'Bukan usulan Anda.' }, { status: 403 });

      // B10: batas qty/harga SAMA dengan buat baru (lib/data/usulan-schemas.ts) — dulu
      // jalur ini menerima 0 dan negatif, jadi total usulan bisa minus.
      const resubSchema = z.object({
        action: z.literal('resubmit_revisi_bidang'),
        items: z.array(z.object({
          item_id:     z.number(),
          spesifikasi: z.string().max(2000).optional(),
          qty:         QtyUsulanSchema.optional(),
          harga_est:   HargaUsulanSchema.optional(),
        })).optional(),
      });
      const rp = resubSchema.safeParse(body);
      if (!rp.success) return NextResponse.json({ ok: false, message: rp.error.issues[0]?.message }, { status: 400 });

      // B11: perubahan item + pengembalian status satu transaksi — dulu perulangan
      // `await` lepas; mati di tengah meninggalkan sebagian item terevisi.
      await withTransaction(async ({ tx }) => {
        for (const it of rp.data.items ?? []) {
          const spek  = it.spesifikasi ?? null;
          const qty   = it.qty         ?? null;
          const harga = it.harga_est   ?? null;
          await tx`
            UPDATE usulan_items
            SET spesifikasi = COALESCE(${spek},  spesifikasi),
                qty         = COALESCE(${qty},   qty),
                harga_est   = COALESCE(${harga}, harga_est),
                updated_at  = NOW()
            WHERE id = ${it.item_id} AND usulan_id = ${usulanId} AND status = 'REVISI_BIDANG'
          `;
        }

        // O6: Reset ke NULL (sesuai schema DEFAULT NULL), bukan empty string.
        // Sebelumnya inkonsisten ('') menyebabkan filter `IS NOT NULL AND != ''`.
        await tx`
          UPDATE usulan_items
          SET status = 'DIAJUKAN_REVIEW',
              bidang_by=NULL, bidang_tgl=NULL, bidang_keputusan=NULL, bidang_catatan=NULL,
              updated_at = NOW()
          WHERE usulan_id = ${usulanId} AND status = 'REVISI_BIDANG'
        `;
      });

      await updateHeaderStats(usulanId);

      const rh        = rows[0] as Record<string,unknown>;
      const noUsulan  = rh.no_usulan  as string;
      const subBidang = rh.sub_bidang as string;
      const br        = bidangRoleOf(subBidang);
      if (br) await addNotif('__BIDANG__' + br, br, 'NEW_REVIEW',
        `Sub-Bidang telah merevisi usulan <b>${noUsulan}</b> (${subBidang}). Menunggu review ulang.`, noUsulan, subBidang);

      return NextResponse.json({ ok: true, message: 'Item revisi berhasil dikirim ulang ke Review Bidang.' });
    }

    if (action === 'update_draft') {

      // B4: skema item & jenis BERSAMA jalur buat baru. Dulu jalur ini menolak
      // PERGESERAN (draf PERGESERAN tak bisa disimpan) dan tidak memeriksa tautan
      // merek (V5-INJ-01 hanya terpasang di buat baru).
      const updateSchema = z.object({
        action:           z.literal('update_draft'),
        sub_bidang:       z.string().optional(),
        tahun_anggaran:   z.string().optional(),
        jenis_usulan:     JenisUsulanSchema.optional(),
        jenis_belanja:       z.string().optional(),
        is_draft:         z.boolean().default(true),
        updated_at_check: z.string().optional(),
        items: z.array(ItemUsulanSchema.extend({
          sub_bidang:     z.string().optional(),
          jenis_belanja:  z.string().optional(),
        })).min(1).max(500),
      });
      const p = updateSchema.safeParse(body);
      if (!p.success) return NextResponse.json({ ok: false, message: p.error.issues[0]?.message }, { status: 400 });

      const { sub_bidang: newSubBidang, tahun_anggaran, jenis_usulan, jenis_belanja, items, is_draft, updated_at_check } = p.data;
      const rows2 = await sql`SELECT created_by, status_ringkas, sub_bidang, updated_at, tahun_anggaran, jenis_usulan FROM usulan_headers WHERE id = ${usulanId} LIMIT 1`;
      if (!rows2.length) return NextResponse.json({ ok: false, message: 'Usulan tidak ditemukan.' }, { status: 404 });
      const h2 = rows2[0] as Record<string,unknown>;
      if (h2.created_by !== session.userId && session.role !== 'SUPER_ADMIN') return NextResponse.json({ ok: false, message: 'Bukan usulan Anda.' }, { status: 403 });
      if (h2.status_ringkas !== 'DRAFT') return NextResponse.json({ ok: false, message: 'Hanya DRAFT yang bisa diedit.' }, { status: 400 });
      // B3: menyimpan draf sekaligus mengirim = pengiriman pertama, tunduk jendela.
      if (!is_draft && !(await jendelaPengajuanTerbuka())) {
        return NextResponse.json({ ok: false, message: PESAN_JENDELA_TUTUP }, { status: 403 });
      }

      if (updated_at_check) {
        const dbUpdatedAt = new Date(h2.updated_at as string).getTime();
        const clientUpdatedAt = new Date(updated_at_check).getTime();
        if (Math.abs(dbUpdatedAt - clientUpdatedAt) > 1000) {
          return NextResponse.json({ ok: false, message: 'Usulan ini sudah diubah oleh pengguna lain. Muat ulang dulu sebelum menyimpan.' }, { status: 409 });
        }
      }

      const effectiveSub  = newSubBidang ?? (h2.sub_bidang as string);
      const subChanged    = !!newSubBidang && newSubBidang !== (h2.sub_bidang as string);
      const hasBidang     = !!SUBBIDANG_TO_BIDANG[effectiveSub];
      const newStatus     = is_draft ? 'DRAFT' : (hasBidang ? 'DIAJUKAN_REVIEW' : 'DIAJUKAN');
      // B4: tidak dikirim = TETAP seperti tersimpan, bukan dikosongkan — dulu
      // `tahun_anggaran ?? ''` menghapus tahun anggaran draf yang tidak menyebutnya.
      const tahunEfektif  = tahun_anggaran ?? String(h2.tahun_anggaran ?? '');
      const jenisEfektif  = jenis_usulan ?? String(h2.jenis_usulan ?? 'MURNI');
      // B4: nomor baru ikut JENIS draf — tanpa jenis, draf PERUBAHAN/PERGESERAN yang
      // ganti sub-bidang mendapat awalan MURNI (`UA-`).
      const finalNoUsulan = subChanged
        ? await generateNoUsulan(effectiveSub, tahunEfektif ? parseInt(tahunEfektif) : undefined, jenisEfektif)
        : null;

      // BUG-C2: UPDATE header + DELETE items + INSERT items dalam SATU transaksi.
      // Kalau ada step yang gagal → rollback semua (draft tidak jadi kosong / partial).
      const tersimpan = await withTransaction(async ({ tx, conn }) => {
        // Status DRAFT ditegaskan lagi DI DALAM transaksi: pemeriksaan di atas bisa
        // didahului tab lain yang mengirim draf yang sama di selanya.
        const upd = await tx`
          UPDATE usulan_headers SET
            sub_bidang     = ${effectiveSub},
            jenis_belanja     = ${jenis_belanja ?? ''},
            tahun_anggaran = ${tahunEfektif},
            ${jenis_usulan ? sql`jenis_usulan = ${jenis_usulan},` : sql``}
            status_ringkas = ${newStatus},
            ${finalNoUsulan ? sql`no_usulan = ${finalNoUsulan},` : sql``}
            updated_at     = NOW()
          WHERE id = ${usulanId} AND status_ringkas = 'DRAFT'
        ` as Array<{ affectedRows?: number }>;
        if (Number(upd[0]?.affectedRows ?? 0) === 0) return false;

        await tx`DELETE FROM usulan_items WHERE usulan_id = ${usulanId}`;

        const noUsulanRow = await tx`SELECT no_usulan, sub_bidang, pengusul FROM usulan_headers WHERE id = ${usulanId}`;
        const hdr = noUsulanRow[0] as Record<string,unknown>;

        // PERF-C1: satu INSERT borongan, bukan satu per item.
        await bulkInsert('usulan_items',
          ['usulan_id','no_usulan','no_item','sub_bidang','pengusul','jenis_belanja',
           'nama_barang','spesifikasi','qty','satuan','harga_est','prioritas','status',
           'alasan','url_merk1','url_merk2','url_merk3','file_url'],
          items.map((item, i) => [
            usulanId, hdr.no_usulan as string, i + 1,
            effectiveSub, hdr.pengusul as string, item.jenis_belanja ?? jenis_belanja ?? '',
            item.nama_barang, item.spesifikasi ?? '', item.qty, item.satuan,
            item.harga_est, item.prioritas, newStatus,
            item.alasan ?? '', item.url_merk1 ?? '', item.url_merk2 ?? '', item.url_merk3 ?? '',
            item.file_url ?? '',
          ]),
          conn);
        return true;
      });
      if (!tersimpan) {
        return NextResponse.json({ ok: false, message: 'Usulan ini sudah tidak berstatus Draft. Muat ulang dulu sebelum menyimpan.' }, { status: 409 });
      }

      await updateHeaderStats(usulanId);
      await writeAuditLog({ req, eventType: 'USULAN_UPDATE', userId: session.userId, username: session.username, detail: `Update draft id=${usulanId}${!is_draft ? ' → diajukan' : ''}` });
      return NextResponse.json({ ok: true, message: is_draft ? 'Draft berhasil diperbarui.' : (hasBidang ? 'Usulan dikirim ke Review Bidang.' : 'Usulan berhasil diajukan.') });
    }

    return NextResponse.json({ ok: false, message: 'Action tidak dikenal.' }, { status: 400 });

  } catch (error) {
    console.error('[Usulan PATCH Error]', error);
    const err = error as { code?: string };
    if (err.code === 'ER_DUP_ENTRY') {
      return NextResponse.json({
        ok: false,
        message: 'Nomor usulan bertabrakan dengan request lain. Silakan coba ulang.',
      }, { status: 409 });
    }
    return NextResponse.json({ ok: false, message: 'Terjadi kesalahan server.' }, { status: 500 });
  }
}


export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
    const mati = await usulanMati(session.role);
    if (mati) return mati;
    // SDL-M16: hard-delete = 10/menit per user.
    const rl = await checkRateLimit(`usulan_delete:${session.userId}`, 10, 60);
    if (!rl.allowed) {
      return NextResponse.json({ ok: false, message: `Terlalu cepat. Coba lagi dalam ${rl.resetIn} detik.` }, { status: 429, headers: { 'Retry-After': String(rl.resetIn) } });
    }

    const { id }  = await params;
    // BUG-W2: NaN guard
    const usulanId = safeInt(id, 0);
    if (!usulanId) return NextResponse.json({ ok: false, message: 'ID usulan tidak valid.' }, { status: 400 });
    const isAdmin  = (ADMIN_ROLES as readonly string[]).includes(session.role);

    const rows = await sql`SELECT created_by, status_ringkas FROM usulan_headers WHERE id = ${usulanId} LIMIT 1`;
    if (!rows.length) return NextResponse.json({ ok: false, message: 'Usulan tidak ditemukan.' }, { status: 404 });

    const h = rows[0] as Record<string, unknown>;
    if (!isAdmin && (h.created_by !== session.userId || h.status_ringkas !== 'DRAFT')) {
      return NextResponse.json({ ok: false, message: 'Tidak dapat menghapus usulan ini.' }, { status: 403 });
    }

    await sql`DELETE FROM usulan_headers WHERE id = ${usulanId}`;
    await writeAuditLog({ req, eventType: 'USULAN_DELETE', userId: session.userId, username: session.username, detail: `Hapus usulan id=${usulanId}` });
    return NextResponse.json({ ok: true, message: 'Usulan berhasil dihapus.' });

  } catch (error) {
    console.error('[Usulan DELETE Error]', error);
    return NextResponse.json({ ok: false, message: 'Terjadi kesalahan server.' }, { status: 500 });
  }
}