import { sql } from '@/lib/data/db';
import { NextRequest } from 'next/server';
import { getClientIp } from '@/lib/security/ratelimit';

export type AuditEventType =
  | 'LOGIN_SUCCESS'
  | 'LOGIN_FAILED'
  | 'LOGIN_BLOCKED'
  | 'ACCOUNT_LOCKED'
  | 'LOGOUT'
  | 'SIGNUP'
  | 'SIGNUP_BLOCKED'
  // ─── Buku Besar Aset (BBA) ─────────────────────────────────────────
  | 'BBA_CREATE'
  | 'BBA_UPDATE'
  | 'BBA_REALISASI'
  | 'BBA_IMPORT_USULAN'
  | 'BBA_DELETE'
  | 'BBA_KATEGORI_ADD'
  | 'BBA_KATEGORI_DELETE'
  // ─── LKJIP ─────────────────────────────────────────────────────────
  | 'LKJIP_CREATE'
  | 'LKJIP_UPDATE'
  | 'LKJIP_DELETE'
  | 'LKJIP_FINALIZE'
  | 'LKJIP_GENERATE'
  | 'LKJIP_DRIVE_ARCHIVE'
  | 'LKJIP_VERSI_SAVE'
  | 'LKJIP_VERSI_RESTORE'
  | 'LKJIP_SECTION_ADD'
  | 'LKJIP_SECTION_RENAME'
  | 'LKJIP_SECTION_MOVE'
  | 'LKJIP_SECTION_DELETE'
  | 'LKJIP_BLOCK_ADD'
  | 'LKJIP_BLOCK_UPDATE'
  | 'LKJIP_BLOCK_DELETE'
  // ─── IKI (Indikator Kinerja Individu) ──────────────────────────────
  | 'IKI_CREATE'
  | 'IKI_UPDATE'
  | 'IKI_DELETE'
  | 'IKI_FINALIZE'
  | 'IKI_UNFINALIZE'
  | 'IKI_IMPORT_RENAKSI'
  | 'IKI_IMPORT_ATASAN'
  | 'IKI_DOWNLOAD'
  | 'IKI_RESTORE_VERSI'
  | 'PASSWORD_RESET'
  | 'SESSION_EXPIRED'
  | 'BROADCAST'
  | 'BRUTE_FORCE'
  // ─── E-Anggaran ─────────────────────────────────────────────────────────────
  | 'KINERJA_SAVE_MASTER'
  | 'KINERJA_DELETE_MASTER'
  | 'KINERJA_MASTER_INIT_RENAKSI'
  | 'KINERJA_SAVE_REKENING'
  | 'KINERJA_SAVE_SSK'
  | 'KINERJA_SAVE_REALISASI'
  | 'KINERJA_SAVE_NOMEN'
  | 'KINERJA_SAVE_REALISASI_MAP'  // POST /api/kinerja/realisasi/import (save-map) — peta keterangan Excel→SSK
  | 'KINERJA_SAVE_PENDAPATAN'
  | 'KINERJA_SAVE_CRR'
  // Refactor Versi (docs/lain/KINERJA_VERSI_REFACTOR.md):
  | 'KINERJA_VERSI_CREATED'    // POST /api/kinerja/ssk/perubahan — buat PERUBAHAN-n + lock previous
  | 'KINERJA_VERSI_LOCKED'     // (reserved) manual lock versi
  | 'KINERJA_VERSI_SWITCH'     // (reserved) UI switch versi aktif — telemetry-grade
  | 'KINERJA_SSK_NULLIFIED'    // PATCH /api/kinerja/ssk/nullify — nol-kan/un-nol-kan baris
  | 'KINERJA_DATA_RESET'       // POST /api/kinerja/reset — destructive bulk delete (SUPER_ADMIN only)
  // ─── Usulan ───────────────────────────────────────────────────────────────
  | 'TELAAH_USULAN'
  | 'REVIEW_BIDANG'
  | 'PUTUSAN_KASUBAG'
  | 'PUTUSAN_KABAG'
  | 'PUTUSAN_BULK'
  | 'USULAN_CREATE'
  | 'USULAN_UPDATE'
  | 'USULAN_DELETE'
  | 'USULAN_CANCEL'
  // ─── Rima data-aware (CONCEPT-rima-v3, F6a) ────────────────────────────────
  | 'RIMA_QUERY'             // GET /api/rima/query — Rima baca data (permukaan akses, terjejak)
  | 'RIMA_QUERY_ABUSE'       // GET /api/rima/query — burst/cap-harian terlampaui (G26 anti-scraping, throttled 1×/menit)
  | 'RIMA_LABEL'             // PATCH /api/rima/feedback — admin melabeli/mengabaikan pertanyaan (RAL-3 workbench)
  | 'RIMA_LAMPIR'            // POST /api/rima/lampir — Rima parse Excel lampiran user (permukaan akses-data, terjejak)
  // ─── Admin & Auth ─────────────────────────────────────────────────────────
  | 'USER_CREATE'
  | 'USER_UPDATE'
  | 'USER_DELETE'
  | 'PASSWORD_CHANGE'
  | 'EMAIL_VERIFIED'
  | 'CONFIG_UPDATE'
  | 'FILE_UPLOAD'
  | 'FILE_DOWNLOAD'
  | 'FILE_DOWNLOAD_DENIED'
  // SDL-Audit v1.1 Phase 1
  | 'RESEND_VERIFY'         // POST /api/auth/resend-verification (success path)
  | 'RESEND_VERIFY_BLOCKED' // POST /api/auth/resend-verification (account not eligible — collapsed branch)
  | 'USULAN_EXPORT'         // POST /api/usulan/export (bulk PII access — UU PDP Pasal 39)
  // SDL-Audit v1.1 Phase 3
  | 'CRON_PURGE_RETENTION'  // POST /api/cron/purge-retention (SDL-L5, UU PDP Pasal 16)
  // ─── BLUD (Tahap 11) ──────────────────────────────────────────────────────
  | 'BLUD_SAVE_DPA'
  | 'BLUD_SAVE_PERGESERAN'
  | 'BLUD_INJECT_DPA'
  | 'BLUD_SAVE_MASTER_AKUN'
  | 'BLUD_SAVE_KODE_BESAR'
  | 'BLUD_SAVE_PENANGGUNG_JAWAB'
  | 'BLUD_SAVE_REKAP_PK'
  // Audit BLUD v1.2 (B-NEW-2): track view + export untuk modul keuangan sensitif
  | 'BLUD_VIEW_DPA'         // GET /api/blud/dpa (data spesifik versi)
  | 'BLUD_IMPORT_USULAN_VIEW' // GET /api/blud/dpa/import-usulan (modal import)
  | 'BLUD_VIEW_PERGESERAN'  // GET /api/blud/pergeseran (data spesifik versi)
  | 'BLUD_EXPORT_PDF'       // Client trigger PDF download
  | 'BLUD_EXPORT_XLSX'      // Client trigger Excel download
  // Pengaturan BLUD (2026-05-21): hapus versi DPA / Pergeseran via menu Pengaturan
  | 'BLUD_DELETE_DPA_VERSI'         // DELETE /api/blud/dpa?versi=YYYY-MM-DD
  | 'BLUD_DELETE_PERGESERAN_VERSI'  // DELETE /api/blud/pergeseran?versi=YYYY-MM-DD
  // Sentinel PJ (2026-05-22): konflik PJ ancestor↔descendant terdeteksi saat save DPA
  | 'BLUD_PJ_CHAIN_CONFLICT'        // POST /api/blud/dpa, log only (tidak block)
  // RIMA F1 (G8): user simpan dgn temuan Sentinel diabaikan/aktif — jejak "sudah diperingatkan"
  | 'BLUD_SENTINEL_ACK'             // POST /api/blud/dpa + /api/blud/pergeseran, log only
  // ─── Perjanjian Kinerja (Sprint 1, 2026-05-23) ────────────────────────────
  | 'PK_SAVE_SASARAN'         // POST /api/perjanjian-kinerja/sasaran
  | 'PK_SAVE_PROGRAM'         // POST /api/perjanjian-kinerja/program
  | 'PK_IMPORT_PROGRAM'       // GET /api/perjanjian-kinerja/program/import-renaksi (read-only, log saat dipanggil)
  | 'PK_IMPORT_RENAKSI_FETCH' // GET /api/perjanjian-kinerja/sasaran/import-renaksi (read-only, log saat fetch)
  | 'PK_SAVE_PEJABAT'         // POST /api/perjanjian-kinerja/pejabat
  | 'PK_SAVE_UNIT_KERJA'      // POST /api/perjanjian-kinerja/unit-kerja (admin)
  | 'PK_DOKUMEN_CREATE'       // POST /api/perjanjian-kinerja/dokumen
  | 'PK_DOKUMEN_UPDATE'       // PATCH /api/perjanjian-kinerja/dokumen/[id]
  | 'PK_DOKUMEN_DELETE'       // DELETE /api/perjanjian-kinerja/dokumen/[id]
  | 'PK_DOKUMEN_FINALIZE'     // POST /api/perjanjian-kinerja/dokumen/[id]/finalize
  | 'PK_DOKUMEN_GENERATE'     // sub-event finalize — generate Word docx
  | 'PK_DOKUMEN_DOWNLOAD'     // GET /api/perjanjian-kinerja/dokumen/[id]/download
  | 'PK_VIEW_LIST'            // GET /api/perjanjian-kinerja/dokumen (bulk PII — UU PDP Pasal 39)
  // ─── Rencana Aksi (modul baru) ────────────────────────────────────────────
  | 'RA_UPSERT'               // POST /api/rencana-aksi
  | 'RA_DELETE'               // DELETE /api/rencana-aksi
  | 'RA_UPDATE_QUARTER'       // PATCH /api/rencana-aksi/quarter
  | 'RA_UPDATE_BULAN_REALISASI' // PATCH /api/rencana-aksi (action=bulan-realisasi)
  | 'RA_UPDATE_TARGETS'       // PATCH /api/rencana-aksi/targets
  | 'RA_UPDATE_JENIS'         // PATCH /api/rencana-aksi/jenis
  | 'RA_RESET_REALISASI'      // POST /api/rencana-aksi/reset-realisasi (destructive — kode 4-digit)
  | 'RA_DUPLIKASI_TAHUN'      // POST /api/rencana-aksi/duplikasi (salin struktur+target ke tahun kosong)
  | 'RA_KUNCI_PERIODE'        // POST /api/rencana-aksi/lock (kunci/buka realisasi periode)
  | 'RA_EXPORT_PDF'           // GET /api/rencana-aksi/export?format=pdf
  | 'RA_EXPORT_XLSX'          // GET /api/rencana-aksi/export?format=excel
  // ─── Role Promotion Ladder (migration 037) ────────────────────────────────
  // Konsep: docs/session/ROLE_PROMOTION_CONCEPT.md §3 (5 layer security)
  | 'PROMOTION_REQUEST_SUBMIT'        // POST /api/auth/promotion/submit (success path)
  | 'PROMOTION_BAD_PASSWORD'          // L1 fail — re-auth password salah
  | 'PROMOTION_BAD_SECRET'            // L2 fail — secret code salah
  | 'PROMOTION_TURNSTILE_FAIL'        // L3 fail — Turnstile reject
  | 'PROMOTION_LOCKED'                // L4 — counter mencapai PROMOTION_MAX_ATTEMPTS
  | 'PROMOTION_LOCK_RESET'            // SA reset lock manual via Admin Panel
  | 'PROMOTION_APPROVED'              // L5 — SA klik Approve (status PENDING→COOLDOWN)
  | 'PROMOTION_REJECTED'              // SA klik Reject (status PENDING→REJECTED)
  | 'PROMOTION_EXPIRED'               // Cron — PENDING > 48 jam → EXPIRED
  | 'PROMOTION_CANCELLED'             // Requester self-cancel atau SA cancel-cooldown
  | 'PROMOTION_COMPLETED'             // Cron — COOLDOWN window lewat → role aktif + probation
  | 'PROMOTION_BOOTSTRAP_SUPER_ADMIN' // Bootstrap branch ADMIN→SA (no SA aktif, single-use)
  | 'PROMOTION_PROBATION_REVOKED'     // SA revoke probation (rollback to from_role)
  | 'PROMOTION_RECOVERY_USED'         // CLI scripts/promotion-recovery.js success (single-use break-glass)
  | 'PROMOTION_RECOVERY_DENIED';      // CLI recovery dengan secret salah / used / target invalid

export async function writeAuditLog(params: {
  req:        NextRequest;
  eventType:  AuditEventType;
  userId?:    number;
  username?:  string;
  detail?:    string;
}): Promise<void> {
  try {
    const ip         = getClientIp(params.req);
    const userAgent  = (params.req.headers.get('user-agent') ?? '').slice(0, 250);
    await sql`
      INSERT INTO audit_log (user_id, username, event_type, ip_address, user_agent, detail)
      VALUES (
        ${params.userId  ?? null},
        ${params.username ?? null},
        ${params.eventType},
        ${ip},
        ${userAgent},
        ${params.detail ?? null}
      )
    `;
  } catch (e) {
    console.error('[writeAuditLog error]', e);
  }
}
