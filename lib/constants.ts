// ─── PRIMA — Constants ───────────────────────────────────────────────────────

export const APP_NAME = 'PRIMA';
export const APP_FULL_NAME = 'Program Realisasi Informasi Monitoring Anggaran';
export const APP_INSTANSI = 'RSJD Dr. Amino Gondohutomo';
export const APP_INSTANSI_SHORT = 'RSJD Amino';

// ─── Role Groups ─────────────────────────────────────────────────────────────

export const ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN', 'ADMIN_KASUBAG', 'ADMIN_KABAG'] as const;

export const BIDANG_ROLES = [
  'BIDANG_UMUM',
  'BIDANG_KEUANGAN',
  'BIDANG_PELAYANAN',
  'BIDANG_PENUNJANG',
  'RENBANG',
  'UMUM',
  'KEUANGAN',
  'PELAYANAN',
  'KEPERAWATAN',
  'PENUNJANG',
] as const;

export const SUBBIDANG_ROLES = [
  'PROGRAM',
  'MDSI',
  'DIKLAT',
  'RUMAH TANGGA',
  'TUKMAS',
  'KEPEGAWAIAN',
  'PERBENDAHARAAN',
  'AKUNTANSI',
  'PENGEMBANGAN PENDAPATAN',
  'PELAYANAN MEDIS',
  'KEPERAWATAN MEDIS',
  'PENUNJANG MEDIS',
  'PENUNJANG NON MEDIS',
] as const;

// Sub-Bidang → Bidang verifikator mapping
export const SUBBIDANG_TO_BIDANG: Record<string, string> = {
  'PROGRAM':                  'RENBANG',
  'MDSI':                     'RENBANG',
  'DIKLAT':                   'RENBANG',
  'RUMAH TANGGA':             'UMUM',
  'TUKMAS':                   'UMUM',
  'KEPEGAWAIAN':              'UMUM',
  'PERBENDAHARAAN':           'KEUANGAN',
  'AKUNTANSI':                'KEUANGAN',
  'PENGEMBANGAN PENDAPATAN':  'KEUANGAN',
  'PELAYANAN MEDIS':          'PELAYANAN',
  'KEPERAWATAN MEDIS':        'KEPERAWATAN',
  'PENUNJANG MEDIS':          'PENUNJANG',
  'PENUNJANG NON MEDIS':      'PENUNJANG',
};

// Bidang → Sub-Bidang mapping (reverse)
export const BIDANG_TO_SUBBIDANG: Record<string, string[]> = {
  'RENBANG':          ['PROGRAM','MDSI','DIKLAT'],
  'UMUM':             ['RUMAH TANGGA','TUKMAS','KEPEGAWAIAN'],
  'KEUANGAN':         ['PERBENDAHARAAN','AKUNTANSI','PENGEMBANGAN PENDAPATAN'],
  'PELAYANAN':        ['PELAYANAN MEDIS'],
  'KEPERAWATAN':      ['KEPERAWATAN MEDIS'],
  'PENUNJANG':        ['PENUNJANG MEDIS','PENUNJANG NON MEDIS'],
  'BIDANG_UMUM':      ['RUMAH TANGGA','TUKMAS','KEPEGAWAIAN'],
  'BIDANG_KEUANGAN':  ['PERBENDAHARAAN','AKUNTANSI','PENGEMBANGAN PENDAPATAN'],
  'BIDANG_PELAYANAN': ['PELAYANAN MEDIS','KEPERAWATAN MEDIS'],
  'BIDANG_PENUNJANG': ['PENUNJANG MEDIS','PENUNJANG NON MEDIS'],
};

export const ROLE_SUBBIDANG_OPTIONS: Record<string, string[]> = {
  'PROGRAM':                  ['PROGRAM','MDSI','DIKLAT'],
  'MDSI':                     ['PROGRAM','MDSI','DIKLAT'],
  'DIKLAT':                   ['PROGRAM','MDSI','DIKLAT'],
  'RUMAH TANGGA':             ['RUMAH TANGGA','TUKMAS','KEPEGAWAIAN'],
  'TUKMAS':                   ['RUMAH TANGGA','TUKMAS','KEPEGAWAIAN'],
  'KEPEGAWAIAN':              ['RUMAH TANGGA','TUKMAS','KEPEGAWAIAN'],
  'PERBENDAHARAAN':           ['PERBENDAHARAAN','AKUNTANSI','PENGEMBANGAN PENDAPATAN'],
  'AKUNTANSI':                ['PERBENDAHARAAN','AKUNTANSI','PENGEMBANGAN PENDAPATAN'],
  'PENGEMBANGAN PENDAPATAN':  ['PERBENDAHARAAN','AKUNTANSI','PENGEMBANGAN PENDAPATAN'],
  'PELAYANAN MEDIS':          ['PELAYANAN MEDIS','KEPERAWATAN MEDIS'],
  'KEPERAWATAN MEDIS':        ['PELAYANAN MEDIS','KEPERAWATAN MEDIS'],
  'PENUNJANG MEDIS':          ['PENUNJANG MEDIS','PENUNJANG NON MEDIS'],
  'PENUNJANG NON MEDIS':      ['PENUNJANG MEDIS','PENUNJANG NON MEDIS'],
};

// ─── Role Labels (untuk display) ─────────────────────────────────────────────

export const ROLE_LABELS: Record<string, string> = {
  'SUPER_ADMIN':              'Super Admin',
  'ADMIN':                    'Admin Staff',
  'ADMIN_KASUBAG':            'Kasubag',
  'ADMIN_KABAG':              'Kabag',
  'BIDANG_UMUM':              'Bidang Umum',
  'BIDANG_KEUANGAN':          'Bidang Keuangan',
  'BIDANG_PELAYANAN':         'Bidang Pelayanan',
  'BIDANG_PENUNJANG':         'Bidang Penunjang',
  'RENBANG':                  'Renbang',
  'UMUM':                     'Umum',
  'KEUANGAN':                 'Keuangan',
  'PELAYANAN':                'Pelayanan',
  'PENUNJANG':                'Penunjang',
  'KEPERAWATAN':              'Keperawatan',
  'PROGRAM':                  'Program',
  'MDSI':                     'MDSI',
  'DIKLAT':                   'Diklat',
  'RUMAH TANGGA':             'Rumah Tangga',
  'TUKMAS':                   'Tukmas',
  'KEPEGAWAIAN':              'Kepegawaian',
  'PERBENDAHARAAN':           'Perbendaharaan',
  'AKUNTANSI':                'Akuntansi',
  'PENGEMBANGAN PENDAPATAN':  'Pengembangan Pendapatan',
  'PELAYANAN MEDIS':          'Pelayanan Medis',
  'KEPERAWATAN MEDIS':        'Keperawatan Medis',
  'PENUNJANG MEDIS':          'Penunjang Medis',
  'PENUNJANG NON MEDIS':      'Penunjang Non Medis',
};

// O3: Role grouping untuk dropdown role assignment (kelola-user panel).
// Sebelumnya 20+ baris hardcoded inline di usulan-client.tsx — sekarang data-driven.
// Tambah/edit role: cukup edit array di sini, dropdown otomatis update.
export const ROLE_GROUPS_OPTIONS: Array<{ label: string; roles: readonly string[] }> = [
  { label: 'Admin',                                roles: ['ADMIN', 'ADMIN_KASUBAG', 'ADMIN_KABAG'] },
  { label: 'Bidang (Verifikator)',                 roles: ['RENBANG', 'UMUM', 'KEUANGAN', 'PELAYANAN', 'PENUNJANG', 'KEPERAWATAN'] },
  { label: 'Sub Bidang Renbang',                   roles: BIDANG_TO_SUBBIDANG['RENBANG']   ?? [] },
  { label: 'Sub Bidang Umum',                      roles: BIDANG_TO_SUBBIDANG['UMUM']      ?? [] },
  { label: 'Sub Bidang Keuangan',                  roles: BIDANG_TO_SUBBIDANG['KEUANGAN']  ?? [] },
  { label: 'Sub Bidang Pelayanan & Keperawatan',   roles: ['PELAYANAN MEDIS', 'KEPERAWATAN MEDIS'] },
  { label: 'Sub Bidang Penunjang',                 roles: BIDANG_TO_SUBBIDANG['PENUNJANG'] ?? [] },
];

// ─── Status Labels ────────────────────────────────────────────────────────────

export const STATUS_LABELS: Record<string, string> = {
  'DRAFT':            'Draft',
  'DIAJUKAN_REVIEW':  'Menunggu Review Bidang',
  'REVISI_BIDANG':    'Dikembalikan Bidang',
  'DITOLAK_BIDANG':   'Ditolak Bidang',
  'DIAJUKAN':         'Menunggu Telaah Admin',
  'DITELAAH':         'Telah di-telaah Admin',
  'DITOLAK_ADMIN':    'Ditolak Admin',
  'DIREVISI_ADMIN':   'Direvisi Admin',
  'DIPROSES':         'Telah di-putuskan Kasubag',
  'DIREVISI_KASUBAG': 'Direvisi Kasubag',
  'DISETUJUI':        'Telah di-putuskan Kabag',
  'DITOLAK':          'Ditolak',
};

// ─── Security ─────────────────────────────────────────────────────────────────

export const MAX_LOGIN_ATTEMPTS = 5;       // max gagal login sebelum lock
export const LOCK_DURATION_MINUTES = 15;   // durasi lock (menit)
export const SESSION_DURATION_HOURS = 8;   // durasi session (jam)
// SEC-W3: absolute session lifetime — keepalive refresh `exp` setiap call,
// jadi tanpa cap absolut, stolen JWT bisa hidup selamanya. 7 hari = batas
// keras dari pertama kali login; setelah ini user wajib re-login.
export const SESSION_ABSOLUTE_LIFETIME_HOURS = 24 * 7;
export const RATE_LIMIT_REQUESTS = 10;      // max request per window
export const RATE_LIMIT_WINDOW_SECONDS = 60; // window rate limit (detik)
export const SESSION_INACTIVE_MINUTES = 60;  // inactivity timeout (menit)
export const RESET_PW_RATE_LIMIT_REQUESTS = 3;   // max forgot-password per window
export const RESET_PW_RATE_LIMIT_WINDOW   = 600; // window 10 menit (detik)
export const ROLE_QUOTA                   = 3;   // max akun per role (berlaku untuk semua BIDANG_ROLES)
export const ADMIN_QUOTA                  = 6;   // max ADMIN tier (Admin Staff) — migration 037
export const SUPER_ADMIN_QUOTA            = 4;   // max SUPER_ADMIN — migration 037

// ─── Role Promotion Ladder (migration 037) ───────────────────────────────────
// Konsep: docs/session/ROLE_PROMOTION_CONCEPT.md
// Chain upgrade role yang diizinkan. Source = key, target = array role tujuan.
export const PROMOTION_CHAINS = {
  PROGRAM:  ['ADMIN'],
  ADMIN:    ['SUPER_ADMIN'],
  RENBANG:  ['ADMIN_KASUBAG', 'ADMIN_KABAG'],
} as const satisfies Record<string, readonly string[]>;

export type PromotionSourceRole = keyof typeof PROMOTION_CHAINS;

export const PROMOTION_COOLDOWN_MINUTES       = 5;    // jeda Approve → role aktif
export const PROMOTION_PROBATION_DAYS         = 7;    // window revoke 1-klik
export const PROMOTION_LOCK_HOURS             = 24;   // L4 lock setelah max attempt
export const PROMOTION_MAX_ATTEMPTS           = 3;    // attempt salah dalam 24 jam
export const PROMOTION_APPROVAL_TIMEOUT_HOURS = 48;   // PENDING > N jam → EXPIRED

// ─── Satuan (unit of measurement) ────────────────────────────────────────────
// Dipakai di DPA BLUD kolom satuan + Usulan Kebutuhan BuatPanel kolom satuan.
// Comprehensive list lazim di lingkungan RSJD / pemerintahan / BLUD,
// dikelompokkan per kategori untuk kemudahan scan saat dropdown terbuka.
// Combobox SatuanCombobox menyajikan list ini dengan search-as-you-type.
export const SATUAN_OPTIONS: readonly string[] = [
  // Kuantitas / hitungan item
  'Unit', 'Buah', 'Pcs', 'Set', 'Pasang', 'Batang', 'Botol', 'Tabung', 'Roll',
  // Kemasan / paket
  'Paket', 'Dos', 'Box', 'Kotak', 'Lusin', 'Rim', 'Pak', 'Karton', 'Krat',
  // Berat / volume
  'Kg', 'Gram', 'Ton', 'Liter', 'Ml', 'M³', 'Galon',
  // Panjang / luas
  'Meter', 'Cm', 'M²', 'Hektar',
  // Waktu / periode
  'Tahun', 'Bulan', 'Hari', 'Jam', 'Minggu', 'Triwulan', 'Semester',
  // Personil / aktivitas
  'Orang', 'OH', 'OB', 'OJ', 'OK', 'Kegiatan', 'Kali', 'Sesi', 'Kunjungan',
  // Dokumen / cetakan
  'Lembar', 'Eksemplar', 'Buku', 'Bendel',
  // Spesifik kesehatan / RSJD
  'Pasien', 'Tindakan', 'Resep', 'Sample', 'Vial', 'Ampul', 'Strip', 'Tube', 'Sachet',
  // Keuangan / layanan
  'Persen', 'LS',
  // Fallback
  'Lainnya',
] as const;
