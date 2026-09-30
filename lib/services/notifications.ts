import { sql, bulkInsert, withTransaction } from '@/lib/data/db';
import { SUBBIDANG_TO_BIDANG, BIDANG_ROLES, ADMIN_ROLES } from '@/lib/constants';

/**
 * Alamat ANTREAN notifikasi. Kolom `recipient` menampung dua hal yang bentuknya
 * mirip tapi artinya berbeda: sebuah **username** (notifikasi untuk satu orang),
 * atau sebuah **token antrean** seperti di bawah (notifikasi untuk siapa pun yang
 * berperan begitu).
 *
 * Tokennya berpagar garis bawah ganda BUKAN demi gaya penulisan: itu yang membuat
 * keduanya mustahil bertabrakan, sebab username tidak boleh memuat garis bawah
 * ganda. Konsekuensinya keras dan senyap — menaruh NAMA PERAN telanjang di situ
 * (`'SUPER_ADMIN'`, atau sebuah `BIDANG_*`) menghasilkan baris notifikasi yang
 * TIDAK PERNAH bisa dibaca siapa pun, karena `buildNotifRecipients` di bawah tidak
 * pernah memulangkan bentuk itu. INSERT-nya berhasil, tidak ada galat, dan
 * peringatannya duduk di tabel sampai kiamat.
 *
 * Sudah terjadi dua kali sebelum 2026-09-16 (lihat `peringatkanRecipientPeran`).
 * Karena itu tokennya tinggal di sini, dipakai `buildNotifRecipients` DAN para
 * pemanggil — satu tempat, jadi pembaca dan penulis tidak bisa berbeda pendapat.
 */
export const NOTIF_SUPER_ADMIN = '__SUPER_ADMIN__';
export const NOTIF_ADMIN       = '__ADMIN__';
export const NOTIF_KASUBAG     = '__KASUBAG__';
export const NOTIF_KABAG       = '__KABAG__';

/** Antrean sebuah Bidang. `role` = salah satu `BIDANG_ROLES`. */
export const notifBidang = (role: string) => '__BIDANG__' + role;

// Build daftar recipient yang user dengan (role, username) berhak baca/aksinya.
// Dipakai juga untuk ownership check (SEC-C4).
export function buildNotifRecipients(role: string, username: string): string[] {
  const r: string[] = [username];
  if (role === 'ADMIN' || role === 'SUPER_ADMIN')                  r.push(NOTIF_ADMIN);
  if ((BIDANG_ROLES as readonly string[]).includes(role))          r.push(notifBidang(role));
  if (role === 'ADMIN_KASUBAG' || role === 'SUPER_ADMIN')          r.push(NOTIF_KASUBAG);
  if (role === 'ADMIN_KABAG'   || role === 'SUPER_ADMIN')          r.push(NOTIF_KABAG);
  // Promotion ladder: target SA-only queue (separate dari __ADMIN__ yg include ADMIN tier).
  if (role === 'SUPER_ADMIN')                                      r.push(NOTIF_SUPER_ADMIN);
  return r;
}

/**
 * Nama peran telanjang di kolom `recipient` SELALU keliru — tidak ada pembaca yang
 * mencarinya. Ditulis ke konsol, tidak dilempar: `addNotif` memang best-effort dan
 * tidak boleh menggagalkan aksi yang memanggilnya (login, simpan usulan). Yang
 * dibutuhkan bukan penolakan, melainkan GEJALA — justru ketiadaan gejala yang
 * membuat dua kejadian sebelumnya duduk berbulan-bulan tanpa ketahuan.
 *
 * Pemeriksaannya di sini, bukan cuma di pemanggil, karena bentuk yang salah bisa
 * datang lewat variabel (`addNotif(br, br, …)`) yang tidak terlihat oleh pemindai
 * statis mana pun.
 */
const PERAN_ANTREAN: readonly string[] = [...ADMIN_ROLES, ...BIDANG_ROLES];

function peringatkanRecipientPeran(recipient: string, type: string) {
  if (PERAN_ANTREAN.includes(recipient)) {
    console.error(
      `[addNotif] recipient '${recipient}' itu NAMA PERAN, bukan alamat antrean — ` +
      `notifikasi '${type}' ini tidak akan terbaca siapa pun. ` +
      `Pakai NOTIF_SUPER_ADMIN / NOTIF_ADMIN / NOTIF_KASUBAG / NOTIF_KABAG / notifBidang(role).`,
    );
  }
}

// SEC-C2: Escape ALL HTML, then whitelist <b>/<strong>/<span> only.
// Prev bug: `.replace(/</g, '<')` was a no-op (intended &lt;) → sanitize jadi tidak jalan.
function sanitizeNotif(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/&lt;(\/?(b|strong|span))&gt;/gi, '<$1>');
}

export async function addNotif(
  recipient:  string,
  role:       string,
  type:       string,
  pesan:      string,
  noUsulan?:  string,
  subBidang?: string,
) {
  peringatkanRecipientPeran(recipient, type);
  try {
    await sql`
      INSERT INTO notifications (recipient, role, type, pesan, no_usulan, sub_bidang)
      VALUES (${recipient}, ${role}, ${type}, ${sanitizeNotif(pesan)}, ${noUsulan ?? null}, ${subBidang ?? null})
    `;
  } catch (e) {
    console.error('[addNotif error]', e);
  }
}

/**
 * Bulk in-app notif: satu pesan ke banyak recipient (mis. broadcast admin).
 * V5-ADMIN-01: atomik via withTransaction + bulkInsert (ganti loop `await sql`
 * yang N+1 & partial-commit). V5-ADMIN-02: sanitizeNotif sekali, sama dengan
 * jalur addNotif — broadcast tidak lagi punya escaping sendiri yang divergen.
 * Return jumlah baris notif yang dibuat.
 */
export async function addNotifBulk(
  recipients: ReadonlyArray<{ recipient: string; role: string }>,
  type: string,
  pesan: string,
): Promise<number> {
  if (recipients.length === 0) return 0;
  const safe = sanitizeNotif(pesan);
  const rows = recipients.map(r => [r.recipient, r.role, type, safe]);
  const res = await withTransaction(async ({ conn }) =>
    bulkInsert('notifications', ['recipient', 'role', 'type', 'pesan'], rows, conn),
  );
  return res.affectedRows;
}

export function bidangRoleOf(subBidang: string): string {
  return (SUBBIDANG_TO_BIDANG as Record<string,string>)[subBidang] ?? '';
}

// ─── Status baca per orang (B7, audit 2026-09-29) ───────────────────────────
// Dulu satu kolom `notifications.dibaca` per notifikasi. Notifikasi antrean dibaca banyak
// orang, jadi membaca = membacakan untuk semua pemegang antreannya — dan penerima
// SUPER_ADMIN mencakup antrean Kasubag & Kabag, sehingga "Tandai semua dibaca" milik
// Super Admin memadamkan peringatan mereka. Kini satu baris per orang di
// `notifikasi_dibaca`. Kuerinya tinggal di sini, bukan di route, supaya bisa diuji
// terhadap basis data sungguhan (scripts/test-notif-dibaca.mts).

export type NotifBaris = {
  id: number; type: string; pesan: string; no_usulan: string | null; sub_bidang: string | null;
  created_at: unknown; dibaca: boolean;
};

/**
 * 50 notifikasi terbaru + jumlah yang BELUM dibaca orang ini. Notifikasi yang lebih tua
 * dari akunnya dianggap sudah dibaca — akun baru tidak disambut antrean lama sebagai
 * "baru". `unread` dihitung tersendiri: dulu dihitung dari 50 baris itu saja.
 */
export async function bacaNotifikasi(userId: number, role: string, username: string): Promise<{ data: NotifBaris[]; unread: number }> {
  const recipients = buildNotifRecipients(role, username);
  const [rows, hitung] = await Promise.all([
    sql`
      SELECT n.id, n.type, n.pesan, n.no_usulan, n.sub_bidang, n.created_at,
             (d.user_id IS NOT NULL OR n.created_at < u.created_at) AS dibaca
        FROM notifications n
        JOIN users u ON u.id = ${userId}
        LEFT JOIN notifikasi_dibaca d ON d.notif_id = n.id AND d.user_id = ${userId}
       WHERE n.recipient IN (${recipients})
       ORDER BY n.created_at DESC, n.id DESC
       LIMIT 50
    `,
    sql`
      SELECT COUNT(*) AS n
        FROM notifications n
        JOIN users u ON u.id = ${userId}
       WHERE n.recipient IN (${recipients})
         AND n.created_at >= u.created_at
         AND NOT EXISTS (SELECT 1 FROM notifikasi_dibaca d WHERE d.notif_id = n.id AND d.user_id = ${userId})
    `,
  ]);
  const data = (rows as Record<string, unknown>[]).map(r => ({ ...r, dibaca: Number(r.dibaca) === 1 }) as NotifBaris);
  return { data, unread: Number((hitung[0] as { n?: unknown } | undefined)?.n ?? 0) };
}

/** Tandai SEMUA notifikasi yang boleh dibaca orang ini — untuk dirinya sendiri saja. */
export async function tandaiSemuaDibaca(userId: number, role: string, username: string): Promise<void> {
  const recipients = buildNotifRecipients(role, username);
  await sql`
    INSERT IGNORE INTO notifikasi_dibaca (notif_id, user_id)
    SELECT n.id, ${userId}
      FROM notifications n
     WHERE n.recipient IN (${recipients})
       AND NOT EXISTS (SELECT 1 FROM notifikasi_dibaca d WHERE d.notif_id = n.id AND d.user_id = ${userId})
  `;
}

/** Tandai satu notifikasi. SEC-C4: hanya kalau memang dialamatkan ke orang ini. */
export async function tandaiDibaca(notifId: number, userId: number, role: string, username: string): Promise<void> {
  const recipients = buildNotifRecipients(role, username);
  await sql`
    INSERT IGNORE INTO notifikasi_dibaca (notif_id, user_id)
    SELECT n.id, ${userId}
      FROM notifications n
     WHERE n.id = ${notifId} AND n.recipient IN (${recipients})
  `;
}

// ─── Role Promotion Ladder notif helpers (migration 037) ────────────────────

/** Tipe event promotion untuk kolom `notifications.type`. */
export type PromotionNotifType =
  | 'PROMOTION_NEW_REQUEST'   // ke __SUPER_ADMIN__ — req baru menunggu review
  | 'PROMOTION_APPROVED'      // ke requester — disetujui (cooldown jalan)
  | 'PROMOTION_REJECTED'      // ke requester — ditolak
  | 'PROMOTION_EXPIRED'       // ke requester — 48h lewat tanpa review
  | 'PROMOTION_CANCELLED'     // ke requester (kalau SA cancel cooldown)
  | 'PROMOTION_COMPLETED'     // ke requester — role aktif
  | 'PROMOTION_PROBATION_REVOKED'; // ke user — probation di-revoke SA

/**
 * Kirim notif in-app ke daftar recipient. Wrapper tipis di atas addNotif untuk
 * konsistensi role tag (kolom `notifications.role` di-pakai filter di UI).
 */
export async function addPromotionNotif(
  recipient: string,
  type: PromotionNotifType,
  pesan: string,
): Promise<void> {
  // role tag 'PROMOTION' supaya gampang filter di UI / kelola unread per modul.
  await addNotif(recipient, 'PROMOTION', type, pesan);
}

/**
 * Broadcast notif ke semua SUPER_ADMIN AKTIF (token __SUPER_ADMIN__).
 * Dipakai saat req baru submit (L5 review queue).
 */
export async function notifySuperAdmins(
  type: PromotionNotifType,
  pesan: string,
): Promise<void> {
  await addPromotionNotif('__SUPER_ADMIN__', type, pesan);
}
