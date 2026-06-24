// PRIMA — Email Service (Gmail SMTP via nodemailer).
//
// Refactor 2026-05-30 (migration 038):
// - Unified sendEmail({to,subject,html,eventType?}) — semua wrapper wajib lewat sini
// - Per-event toggle dari app_config (gate sebelum kirim, kecuali RESET_PASSWORD/VERIFY_EMAIL critical)
// - BCC ke admin email (kalau email_notif_recipient ter-isi)
// - Provider auto-detect (Gmail vs SendGrid vs None) — sementara baru Gmail
// - Logging ke table email_log (audit trail per send + status SENT/FAILED/SKIPPED_TOGGLE)

import nodemailer from 'nodemailer';
import { sql, sqlInt } from '@/lib/data/db';

const GMAIL_USER = process.env.GMAIL_USER ?? '';
const GMAIL_PASS = process.env.GMAIL_APP_PASSWORD ?? '';

// ─── Provider Auto-Detect ───────────────────────────────────────────────────

interface EmailPlan {
  provider:     string;
  plan:         string;
  dailyLimit:   number;
  monthlyLimit: number;
}

function detectProvider(): EmailPlan {
  // Sementara Gmail saja. Tambah cabang kalau pakai SendGrid/SES nanti.
  if (process.env.SENDGRID_API_KEY) {
    return { provider: 'SendGrid', plan: 'Pro', dailyLimit: 10000, monthlyLimit: 300000 };
  }
  if (GMAIL_USER) {
    return { provider: 'Gmail', plan: 'Free', dailyLimit: 500, monthlyLimit: 15000 };
  }
  return { provider: 'None', plan: 'Disabled', dailyLimit: 0, monthlyLimit: 0 };
}

export const EMAIL_PLAN: EmailPlan = detectProvider();

// ─── Event types (untuk toggle gate + log) ──────────────────────────────────

export type EmailEvent =
  // Usulan flow (existing toggles)
  | 'USULAN_BARU'
  | 'USULAN_DISETUJUI'
  | 'USULAN_DITOLAK'
  | 'USULAN_DIREVISI'
  // Promotion flow (toggles baru migration 038)
  | 'PROMOTION_NEW_REQUEST'
  | 'PROMOTION_APPROVED'
  | 'PROMOTION_REJECTED'
  | 'PROMOTION_BOOTSTRAP'
  // Auth flow — TIDAK di-gate (critical security, harus selalu sampai)
  | 'RESET_PASSWORD'
  | 'VERIFY_EMAIL'
  | 'GENERIC';

const EVENT_TOGGLE_KEY: Record<EmailEvent, string | null> = {
  USULAN_BARU:           'email_notif_usulan_baru',
  USULAN_DISETUJUI:      'email_notif_disetujui',
  USULAN_DITOLAK:        'email_notif_ditolak',
  USULAN_DIREVISI:       'email_notif_revisi',
  PROMOTION_NEW_REQUEST: 'email_notif_promotion_new_request',
  PROMOTION_APPROVED:    'email_notif_promotion_approved',
  PROMOTION_REJECTED:    'email_notif_promotion_rejected',
  PROMOTION_BOOTSTRAP:   'email_notif_promotion_bootstrap',
  RESET_PASSWORD:        null, // critical — bypass toggle
  VERIFY_EMAIL:          null, // critical — bypass toggle
  GENERIC:               null,
};

// ─── Config readers (app_config helpers, silent fail) ───────────────────────

async function getConfigBool(key: string, defaultVal: boolean): Promise<boolean> {
  try {
    const rows = await sql`SELECT value FROM app_config WHERE \`key\` = ${key} LIMIT 1` as Array<{ value: string }>;
    if (rows.length === 0) return defaultVal;
    return rows[0].value === 'true';
  } catch {
    return defaultVal;
  }
}

async function getConfigStr(key: string): Promise<string | null> {
  try {
    const rows = await sql`SELECT value FROM app_config WHERE \`key\` = ${key} LIMIT 1` as Array<{ value: string }>;
    return rows[0]?.value ?? null;
  } catch {
    return null;
  }
}

// ─── Email Log (audit trail per send) ───────────────────────────────────────

type EmailStatus = 'SENT' | 'FAILED' | 'SKIPPED_TOGGLE' | 'SKIPPED_NO_CREDS' | 'SKIPPED_NO_PROVIDER';

async function logEmail(
  recipient: string,
  subject:   string,
  eventType: string,
  status:    EmailStatus,
  errorMsg?: string,
): Promise<void> {
  try {
    await sql`
      INSERT INTO email_log (recipient, subject, event_type, status, error_msg)
      VALUES (${recipient.slice(0, 255)}, ${subject.slice(0, 500)}, ${eventType}, ${status}, ${errorMsg ?? null})
    `;
  } catch {
    // Non-critical — kalau table email_log belum exist (migration belum apply),
    // jangan blok email kirim.
  }
}

// ─── Transporter ────────────────────────────────────────────────────────────

function createTransporter() {
  return nodemailer.createTransport({
    host:   'smtp.gmail.com',
    port:   465,
    secure: true,
    auth:   { user: GMAIL_USER, pass: GMAIL_PASS },
  });
}

// ─── Public sendEmail (unified) ─────────────────────────────────────────────

interface SendEmailOpts {
  to:         string;
  subject:    string;
  html:       string;
  eventType?: EmailEvent;
}

export async function sendEmail(opts: SendEmailOpts): Promise<{ ok: boolean; error?: string }> {
  const { to, subject, html, eventType = 'GENERIC' } = opts;

  // 0. INTRANET EDITION (D1 · docs/INTRANET-DELTA.md): email DIMATIKAN di v3.
  // No-op sukses-semu + log SKIPPED_NO_PROVIDER, supaya pemanggil (register/promotion/
  // notif) tak error. Registrasi publik & reset/verifikasi email sudah di-retire,
  // jadi tak ada email kritikal yang hilang. Pembuatan akun & reset = admin-driven.
  if (EMAIL_PLAN.provider === 'None') {
    await logEmail(to, subject, eventType, 'SKIPPED_NO_PROVIDER', 'Email disabled (intranet edition)');
    return { ok: true };
  }

  // 1. Cek master toggle (kecuali critical security event).
  const isCritical = eventType === 'RESET_PASSWORD' || eventType === 'VERIFY_EMAIL';
  if (!isCritical) {
    const masterOn = await getConfigBool('email_notif_enabled', true);
    if (!masterOn) {
      await logEmail(to, subject, eventType, 'SKIPPED_TOGGLE', 'Master toggle OFF');
      return { ok: false, error: 'Email notifikasi master OFF' };
    }
    const toggleKey = EVENT_TOGGLE_KEY[eventType];
    if (toggleKey) {
      const eventOn = await getConfigBool(toggleKey, true);
      if (!eventOn) {
        await logEmail(to, subject, eventType, 'SKIPPED_TOGGLE', `Event ${eventType} OFF`);
        return { ok: false, error: `Email event ${eventType} OFF` };
      }
    }
  }

  // 2. K10-1: soft-cap free-tier Gmail (default 500/hari). Hentikan email
  // non-critical di ambang 90% supaya jatah tersisa untuk RESET_PASSWORD/
  // VERIFY_EMAIL (critical bypass soft-cap). Cegah akun SMTP terkunci 24 jam.
  if (!isCritical && EMAIL_PLAN.dailyLimit > 0) {
    const safeDaily = Math.floor(EMAIL_PLAN.dailyLimit * 0.9);
    const { sentToday } = await getEmailQuota();
    if (sentToday >= safeDaily) {
      await logEmail(to, subject, eventType, 'SKIPPED_TOGGLE', `Soft quota ${sentToday}/${EMAIL_PLAN.dailyLimit}`);
      return { ok: false, error: `Kuota email harian hampir penuh (${sentToday}/${EMAIL_PLAN.dailyLimit}) — email non-kritis ditunda` };
    }
  }

  // 3. Credentials check.
  if (!GMAIL_USER || !GMAIL_PASS) {
    console.warn('[Email] GMAIL_USER or GMAIL_APP_PASSWORD not set — skipping send');
    await logEmail(to, subject, eventType, 'SKIPPED_NO_CREDS', 'Gmail credentials missing');
    return { ok: false, error: 'Gmail credentials not configured' };
  }

  // 4. BCC ke admin (kalau ter-isi).
  const bccAdmin = await getConfigStr('email_notif_recipient');
  const bcc = bccAdmin && bccAdmin.includes('@') ? bccAdmin : undefined;

  // 5. Send.
  try {
    const transporter = createTransporter();
    await transporter.sendMail({
      from:    `"PRIMA RSJD Amino" <${GMAIL_USER}>`,
      to,
      ...(bcc ? { bcc } : {}),
      subject,
      html,
    });
    await logEmail(to, subject, eventType, 'SENT');
    return { ok: true };
  } catch (e) {
    console.error('[Email] Send failed:', e);
    await logEmail(to, subject, eventType, 'FAILED', String(e).slice(0, 1000));
    return { ok: false, error: String(e) };
  }
}

// ─── Role Promotion Ladder email templates (migration 037) ──────────────────
// Konsep: docs/session/ROLE_PROMOTION_CONCEPT.md §3 (L5 dual-control)

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

function emailLayout(title: string, bodyHtml: string): string {
  return `<!DOCTYPE html><html><body style="font-family:Inter,Arial,sans-serif;background:#f4f6f9;margin:0;padding:24px;color:#1a1a1a">
    <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:8px;padding:24px;border:1px solid #e2e8f0">
      <h2 style="margin:0 0 16px;color:#042C53;font-size:18px">${escapeHtml(title)}</h2>
      ${bodyHtml}
      <hr style="margin:24px 0;border:none;border-top:1px solid #e2e8f0">
      <p style="margin:0;font-size:12px;color:#64748b">PRIMA — RSJD Dr. Amino Gondohutomo. Email ini di-generate otomatis, jangan reply.</p>
    </div>
  </body></html>`;
}

export async function sendPromotionRequestSubmittedEmail(
  saEmails: string[],
  params: {
    requesterName:     string;
    requesterUsername: string;
    fromRole:          string;
    toRole:            string;
    reason:            string;
    reqId:             number;
  },
): Promise<void> {
  if (saEmails.length === 0) return;
  const html = emailLayout(
    'Permohonan Upgrade Role — Perlu Review',
    `<p>Ada permohonan upgrade role baru yang perlu di-review:</p>
     <table style="width:100%;border-collapse:collapse;margin:12px 0">
       <tr><td style="padding:6px 0;color:#64748b;width:140px">Pemohon</td><td style="padding:6px 0"><b>${escapeHtml(params.requesterName)}</b> (${escapeHtml(params.requesterUsername)})</td></tr>
       <tr><td style="padding:6px 0;color:#64748b">Dari role</td><td style="padding:6px 0">${escapeHtml(params.fromRole)}</td></tr>
       <tr><td style="padding:6px 0;color:#64748b">Ke role</td><td style="padding:6px 0"><b>${escapeHtml(params.toRole)}</b></td></tr>
       <tr><td style="padding:6px 0;color:#64748b;vertical-align:top">Alasan</td><td style="padding:6px 0;white-space:pre-wrap">${escapeHtml(params.reason)}</td></tr>
     </table>
     <p style="margin-top:16px"><a href="${escapeHtml(APP_URL)}/admin?tab=promotion" style="background:#7C5CFC;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;display:inline-block">Review di Admin Panel</a></p>
     <p style="margin-top:16px;font-size:13px;color:#64748b">Permohonan ini akan otomatis di-EXPIRED kalau tidak di-approve dalam 48 jam.</p>`,
  );
  for (const to of saEmails) {
    await sendEmail({ to, subject: '[PRIMA] Permohonan Upgrade Role — Perlu Review', html, eventType: 'PROMOTION_NEW_REQUEST' });
  }
}

export async function sendPromotionApprovedEmail(
  requesterEmail: string,
  params: {
    requesterName:    string;
    fromRole:         string;
    toRole:           string;
    cooldownMinutes:  number;
  },
): Promise<void> {
  if (!requesterEmail) return;
  const html = emailLayout(
    'Permohonan Upgrade Role — Approved',
    `<p>Hai ${escapeHtml(params.requesterName)},</p>
     <p>Permohonan upgrade role kamu sudah di-<b>approve</b> oleh Super Admin.</p>
     <p>Role <b>${escapeHtml(params.toRole)}</b> akan aktif dalam <b>${params.cooldownMinutes} menit</b> (cooldown window).</p>
     <p style="font-size:13px;color:#64748b">Selama cooldown, Super Admin masih bisa membatalkan approval ini sebagai langkah pencegahan phishing.</p>`,
  );
  await sendEmail({ to: requesterEmail, subject: '[PRIMA] Permohonan Upgrade Role di-Approve', html, eventType: 'PROMOTION_APPROVED' });
}

export async function sendPromotionRejectedEmail(
  requesterEmail: string,
  params: {
    requesterName: string;
    fromRole:      string;
    toRole:        string;
    reason:        string;
  },
): Promise<void> {
  if (!requesterEmail) return;
  const html = emailLayout(
    'Permohonan Upgrade Role — Ditolak',
    `<p>Hai ${escapeHtml(params.requesterName)},</p>
     <p>Permohonan upgrade role <b>${escapeHtml(params.fromRole)}</b> → <b>${escapeHtml(params.toRole)}</b> ditolak oleh Super Admin.</p>
     <p style="background:#fef3c7;padding:12px;border-left:3px solid #BA7517;margin:12px 0;border-radius:4px"><b>Alasan:</b><br>${escapeHtml(params.reason)}</p>
     <p style="font-size:13px;color:#64748b">Jika ada pertanyaan, hubungi Super Admin sistem.</p>`,
  );
  await sendEmail({ to: requesterEmail, subject: '[PRIMA] Permohonan Upgrade Role Ditolak', html, eventType: 'PROMOTION_REJECTED' });
}

export async function sendPromotionBootstrapAlertEmail(
  ownerEmails: string[],
  params: {
    username:   string;
    email:      string;
    ipAddress:  string | null;
    userAgent:  string | null;
    timestamp:  Date;
  },
): Promise<void> {
  if (ownerEmails.length === 0) return;
  const html = emailLayout(
    '⚠ ALERT — Bootstrap SUPER_ADMIN Digunakan',
    `<p style="background:#fee2e2;padding:12px;border-left:3px solid #E24B4A;border-radius:4px">
       Bootstrap flag <code>system_settings.bootstrap_super_admin_used_at</code> baru saja di-set.
       Ini SINGLE-USE — bootstrap kedua tidak boleh kecuali admin DB manual clear flag.
     </p>
     <table style="width:100%;border-collapse:collapse;margin:12px 0">
       <tr><td style="padding:6px 0;color:#64748b;width:140px">Username</td><td style="padding:6px 0"><b>${escapeHtml(params.username)}</b></td></tr>
       <tr><td style="padding:6px 0;color:#64748b">Email</td><td style="padding:6px 0">${escapeHtml(params.email)}</td></tr>
       <tr><td style="padding:6px 0;color:#64748b">IP</td><td style="padding:6px 0">${escapeHtml(params.ipAddress ?? '(unknown)')}</td></tr>
       <tr><td style="padding:6px 0;color:#64748b">User Agent</td><td style="padding:6px 0">${escapeHtml(params.userAgent ?? '(unknown)')}</td></tr>
       <tr><td style="padding:6px 0;color:#64748b">Waktu</td><td style="padding:6px 0">${escapeHtml(params.timestamp.toISOString())}</td></tr>
     </table>
     <p>Kalau ini BUKAN kamu, segera incident response: invalidate session user, audit log, kemungkinan revoke.</p>`,
  );
  for (const to of ownerEmails) {
    await sendEmail({ to, subject: '⚠ [PRIMA] ALERT — Bootstrap SUPER_ADMIN Digunakan', html, eventType: 'PROMOTION_BOOTSTRAP' });
  }
}

// ─── getEmailQuota (refactor — query email_log realtime) ────────────────────

export async function getEmailQuota() {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const month = today.slice(0, 7);
    const rows = await sql`
      SELECT
        SUM(CASE WHEN status='SENT' AND DATE(sent_at) = ${today}                THEN 1 ELSE 0 END) AS sent_today,
        SUM(CASE WHEN status='SENT' AND DATE_FORMAT(sent_at,'%Y-%m') = ${month} THEN 1 ELSE 0 END) AS sent_month
      FROM email_log
    ` as Array<{ sent_today: number | string | null; sent_month: number | string | null }>;
    return {
      sentToday:    Number(rows[0]?.sent_today ?? 0),
      sentMonth:    Number(rows[0]?.sent_month ?? 0),
      dailyLimit:   EMAIL_PLAN.dailyLimit,
      monthlyLimit: EMAIL_PLAN.monthlyLimit,
      provider:     EMAIL_PLAN.provider,
      plan:         EMAIL_PLAN.plan,
    };
  } catch {
    // Fallback kalau migration 038 belum apply.
    return {
      sentToday:    0,
      sentMonth:    0,
      dailyLimit:   EMAIL_PLAN.dailyLimit,
      monthlyLimit: EMAIL_PLAN.monthlyLimit,
      provider:     EMAIL_PLAN.provider,
      plan:         EMAIL_PLAN.plan,
    };
  }
}

// ─── Recent log (untuk UI Admin Panel — table baris terakhir) ───────────────

export async function getRecentEmailLog(limit = 50) {
  try {
    const rows = await sql`
      SELECT id, sent_at, recipient, subject, event_type, status, error_msg
      FROM email_log
      ORDER BY id DESC
      LIMIT ${sqlInt(Math.min(200, Math.max(1, limit)))}
    ` as Array<{
      id: number; sent_at: string; recipient: string; subject: string;
      event_type: string; status: string; error_msg: string | null;
    }>;
    return rows;
  } catch {
    return [];
  }
}
