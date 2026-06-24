import { sql, bulkInsert, withTransaction } from '@/lib/data/db';
import { SUBBIDANG_TO_BIDANG, BIDANG_ROLES } from '@/lib/constants';

// Build daftar recipient yang user dengan (role, username) berhak baca/aksinya.
// Dipakai juga untuk ownership check (SEC-C4).
export function buildNotifRecipients(role: string, username: string): string[] {
  const r: string[] = [username];
  if (role === 'ADMIN' || role === 'SUPER_ADMIN')                  r.push('__ADMIN__');
  if ((BIDANG_ROLES as readonly string[]).includes(role))          r.push('__BIDANG__' + role);
  if (role === 'ADMIN_KASUBAG' || role === 'SUPER_ADMIN')          r.push('__KASUBAG__');
  if (role === 'ADMIN_KABAG'   || role === 'SUPER_ADMIN')          r.push('__KABAG__');
  // Promotion ladder: target SA-only queue (separate dari __ADMIN__ yg include ADMIN tier).
  if (role === 'SUPER_ADMIN')                                      r.push('__SUPER_ADMIN__');
  return r;
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
