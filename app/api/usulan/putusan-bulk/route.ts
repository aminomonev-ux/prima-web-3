import { NextRequest, NextResponse } from 'next/server';
import { sql, withTransaction } from '@/lib/data/db';
import { getSession } from '@/lib/security/auth';
import { checkRateLimit } from '@/lib/security/ratelimit';
import { writeAuditLog } from '@/lib/security/auditlog';
import { updateHeaderStats } from '@/lib/data/usulan';
import { addNotif, NOTIF_KABAG } from '@/lib/services/notifications';
import { usulanMati } from '../_guard';

// Putusan massal Kasubag/Kabag.
//
// A5 (2026-09-16) — LINGKUPNYA MENGIKUTI SARINGAN LAYAR.
//
// Sampai commit ini, GET penghitung maupun PUT penulis tidak mengenal tahun anggaran
// sama sekali. Daftar antriannya mengenal (`GET /api/usulan` menyaring
// `AND h.tahun_anggaran = ?`), jadi seorang Kasubag bisa menyaring layarnya ke 2026,
// melihat baris-baris 2026, menekan "Setujui Semua", dan menyetujui item tahun lain
// yang tidak pernah muncul di layarnya. Bukan layar dan tombol yang sepakat — layar
// menyaring, tombol tidak.
//
// Patokannya SARINGAN, bukan tahun berjalan. Usulan tahun anggaran 2026 lazim baru
// disetujui Januari 2027; kalau patokannya tahun kalender, tiap pergantian tahun
// antrian yang belum selesai mendadak tidak bisa diproses massal dan tidak ada apa pun
// di layar yang menjelaskan kenapa. Saringan kosong tetap berarti SEMUA tahun, dan itu
// jujur: layarnya memang sedang menampilkan semua.
const RE_TAHUN = /^\d{4}$/;

/** `''` = semua tahun. Selain itu wajib 4 angka. `null` = ditolak. */
function bacaTahun(nilai: string | null | undefined): string | null {
  const t = (nilai ?? '').trim();
  if (!t) return '';
  return RE_TAHUN.test(t) ? t : null;
}

// Bukan `as const`: larik readonly ditolak `SqlValue`, dan yang dibutuhkan di sini
// memang nilainya, bukan tipe literalnya.
const STATUS_ASAL: Record<'kasubag' | 'kabag', string[]> = {
  kasubag: ['DITELAAH', 'DIREVISI_ADMIN'],
  kabag:   ['DIPROSES', 'DIREVISI_KASUBAG'],
};

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
    const mati = await usulanMati(session.role);
    if (mati) return mati;

    const isKasubag    = session.role === 'ADMIN_KASUBAG';
    const isKabag      = session.role === 'ADMIN_KABAG';
    const isSuperAdmin = session.role === 'SUPER_ADMIN';
    if (!isKasubag && !isKabag && !isSuperAdmin)
      return NextResponse.json({ ok: false, message: 'Akses ditolak.' }, { status: 403 });

    const actAs = req.nextUrl.searchParams.get('actAs');
    const asKasubag = isKasubag || (isSuperAdmin && actAs === 'kasubag');

    const tahun = bacaTahun(req.nextUrl.searchParams.get('tahun'));
    if (tahun === null)
      return NextResponse.json({ ok: false, message: 'Tahun anggaran tidak valid.' }, { status: 400 });

    const status = asKasubag ? STATUS_ASAL.kasubag : STATUS_ASAL.kabag;
    const saringTahun = tahun ? sql`AND h.tahun_anggaran = ${tahun}` : sql``;

    // Dihitung lewat JOIN ke header, sebab `tahun_anggaran` tinggal di header, bukan
    // di item. Bentuknya sengaja sama persis dengan yang dipakai PUT di bawah: angka
    // yang ditawarkan modal harus angka yang benar-benar akan tersentuh.
    const rows = await sql`
      SELECT COUNT(*) AS total, COUNT(DISTINCT h.id) AS hdrs
        FROM usulan_items i
        JOIN usulan_headers h ON h.id = i.usulan_id
       WHERE i.status IN (${status}) ${saringTahun}
    ` as Array<Record<string, string>>;

    return NextResponse.json({
      ok: true,
      data: {
        total_item:   parseInt(rows[0]?.total ?? '0'),
        total_header: parseInt(rows[0]?.hdrs ?? '0'),
        // Dikembalikan supaya modal bisa MENYEBUT lingkupnya. Angka telanjang tidak
        // bisa dibantah maupun dibenarkan pembacanya.
        tahun: tahun || null,
      },
    });
  } catch (e) {
    console.error('[PutusanBulk GET]', e);
    return NextResponse.json({ ok: false, message: 'Terjadi kesalahan server.' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
    const mati = await usulanMati(session.role);
    if (mati) return mati;

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

    const tahun = bacaTahun((body as Record<string,string>).tahun);
    if (tahun === null)
      return NextResponse.json({ ok: false, message: 'Tahun anggaran tidak valid.' }, { status: 400 });

    const status = asKasubag ? STATUS_ASAL.kasubag : STATUS_ASAL.kabag;
    const saringTahun = tahun ? sql`AND h.tahun_anggaran = ${tahun}` : sql``;

    // CQ-01 — UPDATE massal dan penentuan sasarannya satu kesatuan. Dulu keduanya
    // berdiri lepas, lalu `updateHeaderStats` diulang dalam perulangan `await` di
    // luar transaksi apa pun: putus di tengah meninggalkan item yang sudah disetujui
    // sementara ringkasan di headernya tertinggal, tanpa ada yang memberi tahu.
    //
    // Sasarannya dikunci jadi DAFTAR ID, bukan diterka ulang sesudahnya. Bentuk lama
    // mencari header lewat `kasubag_by = saya AND kasubag_tgl = CURRENT_DATE` — yang
    // ikut menjaring hasil putusan massal SEBELUMNYA di hari yang sama, jadi menekan
    // tombol dua kali sehari mengirim ulang notifikasi untuk usulan yang sudah
    // diproses pagi tadi. Dengan daftar id, yang di-UPDATE, yang dihitung ulang, dan
    // yang diberi tahu adalah himpunan yang sama persis.
    const sasaran = await withTransaction(async ({ tx }) => {
      const target = await tx`
        SELECT DISTINCT h.id, h.no_usulan, h.sub_bidang, h.pengusul
          FROM usulan_headers h
          JOIN usulan_items i ON i.usulan_id = h.id
         WHERE i.status IN (${status}) ${saringTahun}
      ` as Array<Record<string, string | number>>;
      if (target.length === 0) return { target, item: 0 };

      const ids = target.map(t => Number(t.id));
      const res = asKasubag
        // Kasubag: DITELAAH + DIREVISI_ADMIN → DIPROSES
        // nominal: admin_nominal jika ada, fallback total_est
        ? await tx`
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
             WHERE status IN (${status}) AND usulan_id IN (${ids})
          `
        // Kabag: DIPROSES + DIREVISI_KASUBAG → DISETUJUI
        // nominal prioritas: nominal_disetujui (sudah termasuk revisi kasubag) > admin_nominal > total_est
        : await tx`
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
             WHERE status IN (${status}) AND usulan_id IN (${ids})
          `;
      return { target, item: (res[0] as { affectedRows?: number })?.affectedRows ?? 0 };
    });

    const lingkup = tahun ? ` tahun ${tahun}` : '';
    if (sasaran.target.length === 0) {
      return NextResponse.json({ ok: true, message: `Tidak ada usulan${lingkup} yang menunggu putusan.`, count: 0 });
    }

    // Turunan dihitung SESUDAH commit — aturan CQ-01. `updateHeaderStats` memakai pool
    // sendiri, jadi memanggilnya di dalam transaksi justru membuatnya membaca keadaan
    // SEBELUM UPDATE (L69-b) dan menulis ringkasan yang sudah usang sejak lahir.
    for (const h of sasaran.target) {
      await updateHeaderStats(Number(h.id));
    }

    for (const h of sasaran.target) {
      const hdr = h as Record<string, string>;
      if (asKasubag) {
        await addNotif(NOTIF_KABAG, 'ADMIN_KABAG', 'VERIF_KABAG',
          `Kasubag memproses usulan <b>${hdr.no_usulan}</b> (${hdr.sub_bidang}). Menunggu Kabag.`, hdr.no_usulan, hdr.sub_bidang);
        await addNotif(hdr.pengusul, '', 'STATUS_CHANGE',
          `Usulan <b>${hdr.no_usulan}</b> diproses Kasubag, diteruskan ke Kabag.`, hdr.no_usulan, hdr.sub_bidang);
      } else {
        await addNotif(hdr.pengusul, '', 'STATUS_CHANGE',
          `Putusan final Kabag untuk usulan <b>${hdr.no_usulan}</b>: <b>DISETUJUI</b>.`, hdr.no_usulan, hdr.sub_bidang);
      }
    }

    const label = asKasubag ? 'diteruskan ke Kabag' : 'disetujui final';
    await writeAuditLog({
      req, eventType: 'PUTUSAN_BULK', userId: session.userId, username: session.username,
      detail: `Bulk ${label}${lingkup ? ` (${lingkup.trim()})` : ' (semua tahun)'}: `
        + `${sasaran.target.length} header, ${sasaran.item} item`,
    });
    return NextResponse.json({
      ok: true,
      message: `${sasaran.item} item dari ${sasaran.target.length} usulan${lingkup} berhasil ${label}.`,
      count: sasaran.target.length,
    });
  } catch (e) {
    console.error('[PutusanBulk PUT]', e);
    return NextResponse.json({ ok: false, message: 'Terjadi kesalahan server.' }, { status: 500 });
  }
}
