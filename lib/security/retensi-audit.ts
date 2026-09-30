// ═══ PRIMA — Retensi audit_log per jenis peristiwa ═══════════════════════════
// I1 (audit 2026-09-29), keputusan pemilik aplikasi 30 Sep — pilihan B. Tanpa impor DB
// saat jalan: dipakai cron purge-retention DAN layar Pusat Akses (umur garis waktu).
import type { TxSql } from '@/lib/data/db';
import type { AuditEventType } from './auditlog';

export const RETENSI_AUDIT = { pendekBulan: 12, panjangTahun: 5 } as const;

export type KelasRetensi = 'PANJANG' | 'PENDEK';

const P: KelasRetensi = 'PANJANG';
const S: KelasRetensi = 'PENDEK';

/**
 * PANJANG (5 tahun) — peristiwa yang MENGUBAH data keuangan, kinerja, dokumen, atau hak
 * akses. Pemeriksaan BPK/Inspektorat atas satu tahun anggaran bisa datang lebih dari
 * 12 bulan kemudian; jejak "siapa mengubah apa" harus masih ada saat itu.
 * PENDEK (12 bulan) — masuk/keluar & keamanan akun, lihat/unduh/ekspor/pratinjau, RIMA,
 * pekerjaan sistem. UU PDP: data pribadi tidak disimpan lebih lama dari perlu.
 *
 * `Record`, bukan daftar awalan: jenis peristiwa baru yang belum digolongkan membuat tsc
 * gagal, alih-alih diam-diam ikut aturan yang salah.
 */
export const RETENSI_PERISTIWA: Record<AuditEventType, KelasRetensi> = {
  // Masuk/keluar & keamanan akun
  LOGIN_SUCCESS: S, LOGIN_FAILED: S, LOGIN_BLOCKED: S, ACCOUNT_LOCKED: S, LOGOUT: S,
  SIGNUP: P, SIGNUP_BLOCKED: S, PASSWORD_RESET: S, SESSION_EXPIRED: S, BRUTE_FORCE: S,
  PASSWORD_CHANGE: S, EMAIL_VERIFIED: S, RESEND_VERIFY: S, RESEND_VERIFY_BLOCKED: S,
  // Buku Besar Aset
  BBA_CREATE: P, BBA_UPDATE: P, BBA_REALISASI: P, BBA_IMPORT_USULAN: P, BBA_DELETE: P,
  BBA_KATEGORI_ADD: P, BBA_KATEGORI_DELETE: P,
  // LKJIP
  LKJIP_CREATE: P, LKJIP_UPDATE: P, LKJIP_DELETE: P, LKJIP_FINALIZE: P, LKJIP_GENERATE: S,
  LKJIP_DRIVE_ARCHIVE: P, LKJIP_VERSI_SAVE: P, LKJIP_VERSI_RESTORE: P,
  LKJIP_SECTION_ADD: P, LKJIP_SECTION_RENAME: P, LKJIP_SECTION_MOVE: P, LKJIP_SECTION_DELETE: P,
  LKJIP_BLOCK_ADD: P, LKJIP_BLOCK_UPDATE: P, LKJIP_BLOCK_DELETE: P,
  // IKI — impor Renaksi/atasan/Excel hanya membaca; tulisannya tercatat sebagai IKI_UPDATE
  IKI_CREATE: P, IKI_UPDATE: P, IKI_DELETE: P, IKI_FINALIZE: P, IKI_UNFINALIZE: P,
  IKI_IMPORT_RENAKSI: S, IKI_IMPORT_ATASAN: S, IKI_IMPORT_EXCEL: S, IKI_DOWNLOAD: S,
  IKI_RESTORE_VERSI: P,
  BROADCAST: S,
  // E-Anggaran — impor Rekening/Master/RKO hanya membaca berkas
  KINERJA_SAVE_MASTER: P, KINERJA_DELETE_MASTER: P, KINERJA_MASTER_INIT_RENAKSI: P,
  KINERJA_SAVE_REKENING: P, KINERJA_IMPORT_REKENING: S, KINERJA_IMPORT_MASTER: S, KINERJA_IMPORT_RKO: S,
  KINERJA_SAVE_SSK: P, KINERJA_SAVE_REALISASI: P, KINERJA_SAVE_NOMEN: P, KINERJA_RIWAYAT_PULIHKAN: S,
  KINERJA_SAVE_REALISASI_MAP: P, KINERJA_SAVE_PENDAPATAN: P, KINERJA_SAVE_CRR: P,
  KINERJA_VERSI_CREATED: P, KINERJA_VERSI_LOCKED: P, KINERJA_VERSI_SWITCH: S, KINERJA_DATA_RESET: P,
  // Usulan
  TELAAH_USULAN: P, REVIEW_BIDANG: P, PUTUSAN_KASUBAG: P, PUTUSAN_KABAG: P, PUTUSAN_BULK: P,
  USULAN_CREATE: P, USULAN_UPDATE: P, USULAN_DELETE: P, USULAN_CANCEL: P, USULAN_EXPORT: S,
  // RIMA
  RIMA_QUERY: S, RIMA_QUERY_ABUSE: S, RIMA_LABEL: S, RIMA_LAMPIR: S,
  // Akun & hak akses
  USER_CREATE: P, USER_UPDATE: P, USER_DELETE: P, ACCESS_GRANT: P, ACCESS_REVOKE: P, ROLE_CHANGE: P,
  ACCESS_REQUEST: P, ACCESS_REQUEST_APPROVED: P, ACCESS_REQUEST_REJECTED: P, USER_ARCHIVE: P,
  CONFIG_UPDATE: P,
  // Berkas & sistem
  FILE_UPLOAD: P, FILE_DOWNLOAD: S, FILE_DOWNLOAD_DENIED: S, CRON_PURGE_RETENTION: S,
  // BLUD
  BLUD_SAVE_DPA: P, BLUD_SAVE_PERGESERAN: P, BLUD_INJECT_DPA: P, BLUD_SAVE_MASTER_AKUN: P,
  BLUD_SAVE_KODE_BESAR: P, BLUD_SAVE_PENANGGUNG_JAWAB: P, BLUD_SAVE_REKAP_PK: P,
  BLUD_DPA_IMPORT_PREVIEW: S, BLUD_DPA_IMPORT_COMMIT: P, BLUD_VIEW_DPA: S, BLUD_IMPORT_USULAN_VIEW: S,
  BLUD_VIEW_PERGESERAN: S, BLUD_EXPORT_PDF: S, BLUD_EXPORT_XLSX: S,
  BLUD_DELETE_DPA_VERSI: P, BLUD_DELETE_PERGESERAN_VERSI: P, BLUD_RIWAYAT_PULIHKAN: S,
  BLUD_CADANGAN_JSON: P, BLUD_PJ_CHAIN_CONFLICT: P, BLUD_SENTINEL_ACK: P,
  BLUD_REALISASI_TX_CREATE: P, BLUD_REALISASI_TX_UPDATE: P, BLUD_REALISASI_TX_DELETE: P,
  BLUD_PAGU_DIBAWAH_REALISASI: P, BLUD_PERMINTAAN_CREATE: P, BLUD_PERMINTAAN_TOLAK: P,
  BLUD_PERMINTAAN_SELESAI: P, BLUD_PERIODE_TUTUP: P, BLUD_PERIODE_BUKA: P, BLUD_SALDO_AWAL_SET: P,
  BLUD_PEJABAT_SIMPAN: P, BLUD_SPJ_UNDUH: S, BLUD_GU_SIMPAN: P,
  BLUD_BUKTI_SETOR_CREATE: P, BLUD_BUKTI_SETOR_UPDATE: P, BLUD_BUKTI_SETOR_DELETE: P,
  // Perjanjian Kinerja
  PK_SAVE_SASARAN: P, PK_SAVE_PROGRAM: P, PK_IMPORT_PROGRAM: S, PK_IMPORT_RENAKSI_FETCH: S,
  PK_SAVE_PEJABAT: P, PK_SAVE_UNIT_KERJA: P, PK_DOKUMEN_CREATE: P, PK_DOKUMEN_UPDATE: P,
  PK_DOKUMEN_DELETE: P, PK_DOKUMEN_FINALIZE: P, PK_DOKUMEN_GENERATE: P, PK_DOKUMEN_DOWNLOAD: S,
  PK_VIEW_LIST: S, PK_IMPORT_PEJABAT: S, PK_EXPORT_PEJABAT: S,
  // Rencana Aksi
  RA_UPSERT: P, RA_DELETE: P, RA_UPDATE_QUARTER: P, RA_UPDATE_BULAN_REALISASI: P, RA_UPDATE_TARGETS: P,
  RA_UPDATE_JENIS: P, RA_RESET_REALISASI: P, RA_DUPLIKASI_TAHUN: P, RA_KUNCI_PERIODE: P,
  RA_IMPORT_PREVIEW: S, RA_IMPORT_COMMIT: P, RA_EXPORT_PDF: S, RA_EXPORT_XLSX: S,
  // Kenaikan peran — percobaan gagal itu keamanan akun (pendek); keputusannya hak akses (panjang)
  PROMOTION_REQUEST_SUBMIT: P, PROMOTION_BAD_PASSWORD: S, PROMOTION_BAD_SECRET: S,
  PROMOTION_TURNSTILE_FAIL: S, PROMOTION_LOCKED: S, PROMOTION_LOCK_RESET: P, PROMOTION_APPROVED: P,
  PROMOTION_REJECTED: P, PROMOTION_EXPIRED: P, PROMOTION_CANCELLED: P, PROMOTION_COMPLETED: P,
  PROMOTION_BOOTSTRAP_SUPER_ADMIN: P, PROMOTION_PROBATION_REVOKED: P,
  PROMOTION_RECOVERY_USED: P, PROMOTION_RECOVERY_DENIED: P,
};

/**
 * Jenis ber-retensi PENDEK. Jenis di luar daftar ini — termasuk nama lama yang sudah tidak
 * dipakai kode tapi masih ada di tabel — ikut aturan PANJANG: salah simpan lebih murah
 * daripada salah hapus.
 */
export const PERISTIWA_PENDEK: readonly string[] = Object.entries(RETENSI_PERISTIWA)
  .filter(([, kelas]) => kelas === 'PENDEK')
  .map(([jenis]) => jenis);

/**
 * Pangkas `audit_log` di dalam transaksi cron. Urutannya penting:
 *  1. jenis PENDEK yang lebih tua dari 12 bulan dihapus;
 *  2. apa pun yang lebih tua dari 5 tahun dihapus;
 *  3. sisa baris yang lebih tua dari 12 bulan (jenis PANJANG) dikosongkan IP & jenis
 *     perambannya — yang dijaga siapa/apa/kapan, bukan dari mesin mana (UU PDP).
 */
export async function pangkasAuditLog(tx: TxSql): Promise<{ dihapus: number; dianonimkan: number }> {
  const baris = (r: unknown) => (r as Array<{ affectedRows?: number }>)[0]?.affectedRows ?? 0;
  const pendek = await tx`
    DELETE FROM audit_log
     WHERE created_at < NOW() - INTERVAL ${RETENSI_AUDIT.pendekBulan} MONTH
       AND event_type IN (${[...PERISTIWA_PENDEK]})
  `;
  const panjang = await tx`DELETE FROM audit_log WHERE created_at < NOW() - INTERVAL ${RETENSI_AUDIT.panjangTahun} YEAR`;
  const anonim = await tx`
    UPDATE audit_log SET ip_address = NULL, user_agent = NULL
     WHERE created_at < NOW() - INTERVAL ${RETENSI_AUDIT.pendekBulan} MONTH
       AND (ip_address IS NOT NULL OR user_agent IS NOT NULL)
  `;
  return { dihapus: baris(pendek) + baris(panjang), dianonimkan: baris(anonim) };
}
