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
