// ═══ PRIMA — Admin API Schemas (SDL-Audit v1.1 Phase 1) ════════════════════
// Centralized Zod schemas untuk endpoint app/api/admin/*.
// Fixes: SDL-M12 (admin/users PATCH body cast), SDL-L4 (app_access whitelist).

import { z } from 'zod';
import { StrongPasswordSchema } from './auth-schemas';
import { BIDANG_ROLES, SUBBIDANG_ROLES } from '@/lib/constants';
import { KUNCI_GRANT } from '@/lib/registry/apps';

// ─── Role enum ──────────────────────────────────────────────────────────────

/**
 * Role yang boleh di-assign via `admin/users` PATCH action='ubah-role'.
 * Tidak include `SUPER_ADMIN` (reject di handler — tidak boleh di-promote).
 *
 * Derive dari taksonomi role asli di lib/constants.ts (single source of truth)
 * supaya nilai dropdown (ROLE_GROUPS_OPTIONS) selalu match enum. Sebelumnya enum
 * pakai skema penamaan lama (SUB_RENBANG_PROGRAM/BIDANG_RENBANG/…) yang tidak
 * pernah cocok dengan role aktual → ubah-role ke sub bidang selalu 400.
 */
// Admin tier minus SUPER_ADMIN di-hardcode agar elemen pertama definite
// (z.enum butuh tuple `[string, ...string[]]`; `.filter` mengubahnya jadi rest-only).
const ASSIGNABLE_ROLES: [string, ...string[]] = [
  'ADMIN', 'ADMIN_KASUBAG', 'ADMIN_KABAG',
  ...BIDANG_ROLES,
  ...SUBBIDANG_ROLES,
];

export const AssignableRoleEnum = z.enum(ASSIGNABLE_ROLES);

/**
 * SDL-L4: whitelist app_access key. Sebelumnya `apps: string[]` di-`JSON.stringify`
 * tanpa cek isi → DB pollution.
 *
 * Fase B (Tahap 2): DITURUNKAN dari `lib/registry/apps.ts`, tidak lagi diketik.
 * B4 sekaligus ikut: `admin` KELUAR. Ia sempat jadi nilai yang sah di sini padahal
 * tidak ada satu pun kode yang membacanya sebagai grant — mencentangnya untuk seseorang
 * tidak pernah membuka Admin Panel, cuma menuliskan janji kosong ke `users.app_access`
 * yang kemudian terbaca seperti wewenang sungguhan waktu ada yang memeriksa (T-9).
 */
export const AppAccessKeyEnum = z.enum(KUNCI_GRANT as [string, ...string[]]);

// ─── User ID ────────────────────────────────────────────────────────────────

const UserIdSchema = z.number().int().positive();

/**
 * P9 (Tahap 7) — alasan singkat pada perubahan wewenang.
 *
 * Audit hari ini menjawab *apa* dan *siapa*, tidak pernah *kenapa*. Enam bulan kemudian
 * tidak ada yang ingat kenapa seorang staf gudang punya akses BLUD.
 *
 * `min(4)` bukan angka hiasan: alasan yang boleh kosong adalah alasan yang tidak pernah
 * diisi, dan kolom yang selalu berisi "-" lebih buruk daripada kolom yang tidak ada —
 * ia terbaca seperti sudah dijawab. Kalau memang boleh kosong, jangan ditanyakan.
 *
 * Dipakai HANYA pada: beri/cabut akses, ubah peran, hapus permanen. TIDAK pada
 * aktifkan/nonaktifkan rutin — di sana pertanyaannya sudah dijawab oleh keadaan
 * (orangnya berhenti / masuk lagi), dan meminta alasan pada aksi harian melatih orang
 * mengetik "-" lalu terbawa ke aksi yang benar-benar butuh dijelaskan.
 */
export const AlasanWewenangSchema = z.string().trim().min(4, 'Sebutkan alasannya (min. 4 huruf).').max(140);

// ─── Discriminated union per action ─────────────────────────────────────────

/**
 * SDL-M12: discriminated union untuk `admin/users` PATCH body.
 * Setiap action punya validasi field strict — runtime parsing menggantikan
 * body cast `as { id, action, role?, password? }`.
 */
export const AdminUsersPatchBodySchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('nonaktif'),
    id:     UserIdSchema,
  }),
  z.object({
    action: z.literal('aktifkan'),
    id:     UserIdSchema,
  }),
  z.object({
    action: z.literal('ubah-role'),
    id:     UserIdSchema,
    role:   AssignableRoleEnum,
    alasan: AlasanWewenangSchema,
  }),
  // `set-app-access` DIBUANG di Tahap 7. Layar yang memakainya (tab User Management)
  // sudah dimatikan Tahap 5, jadi sejak itu ia jalur tulis tanpa satu pun pintu — dan
  // yang lebih menentukan: ia memberi & mencabut akses TANPA melewati kewajiban alasan
  // yang baru dipasang P9. Pintu kedua yang melewati aturan barunya membuat aturan itu
  // jadi hiasan. Pemberian akses sekarang satu jalur: `PUT /api/admin/pusat-akses`.
  z.object({
    action:   z.literal('reset-password'),
    id:       UserIdSchema,
    password: StrongPasswordSchema,
  }),
  // Tahap 5: kartu SESI di Pusat Akses. Memutus sesi TANPA menonaktifkan akun —
  // dipakai saat seseorang lupa logout di komputer bersama. Sebelumnya satu-satunya
  // cara adalah menonaktifkan lalu mengaktifkan lagi, yang menabrak kuota di peran
  // yang sedang penuh, atau reset kata sandi, yang mengubah hal lain.
  z.object({
    action: z.literal('putus-sesi'),
    id:     UserIdSchema,
  }),
]);

export type AdminUsersPatchBody = z.infer<typeof AdminUsersPatchBodySchema>;

/**
 * INTRANET EDITION (D9 · docs/INTRANET-DELTA.md): body create-user via admin/users POST.
 * Registrasi publik dimatikan → Super Admin satu-satunya jalur pembuatan akun.
 * Role reuse AssignableRoleEnum (tanpa SUPER_ADMIN). Kuota di-enforce di handler.
 */
export const AdminUserCreateBodySchema = z.object({
  username:     z.string().min(3, 'Username minimal 3 karakter').max(50)
                 .regex(/^[a-zA-Z0-9_\-\.]+$/, 'Username hanya huruf, angka, _ - .'),
  email:        z.string().email('Format email tidak valid'),
  password:     StrongPasswordSchema,
  role:         AssignableRoleEnum,
  nama_lengkap: z.string().max(100).optional(),
});

export type AdminUserCreateBody = z.infer<typeof AdminUserCreateBodySchema>;

// ─── Config schema ──────────────────────────────────────────────────────────

/**
 * SDL-M13: config GET selalu return semua key, tapi non-admin di-filter di handler.
 * Whitelist key di sini untuk POST.
 */
export const ConfigKeyEnum = z.enum([
  'batas_mulai', 'batas_selesai', 'batas_pesan', 'batas_aktif', 'pagu_blud',
]);

/**
 * Key yang aman dilihat oleh non-admin (deadline pengajuan, info publik dalam org).
 * `pagu_blud` SENGAJA tidak masuk — angka anggaran tidak untuk SUB_BIDANG biasa.
 */
export const PUBLIC_CONFIG_KEYS: ReadonlySet<string> = new Set([
  'batas_mulai', 'batas_selesai', 'batas_pesan', 'batas_aktif',
]);

// ─── Pusat Akses (Tahap 5 · Fase C) ─────────────────────────────────────────

/**
 * Satu Simpan untuk seluruh halaman: peran + pintu modul + perkecualian menu.
 *
 * `role_awal` bukan basa-basi. Sidik jari menu menjawab "apakah izin menunya berubah";
 * ia tidak menjawab "apakah orangnya masih berperan sama". Layar yang dimuat saat
 * seseorang masih PROGRAM lalu disimpan setelah orang lain memindahkannya ke KEUANGAN
 * akan menulis izin milik jabatan yang sudah ditinggalkan — tanpa satu pun pemeriksaan
 * yang ada hari ini menyalak.
 */
export const IzinMenuEnum = z.enum(['EDIT', 'LIHAT', 'TIDAK']);

export const PusatAksesSimpanSchema = z.object({
  user_id:    UserIdSchema,
  role:       AssignableRoleEnum,
  role_awal:  z.string().min(1),
  app_access: z.array(AppAccessKeyEnum).max(20),
  /**
   * P9. Dibiarkan OPSIONAL di sini dan diwajibkan di dalam transaksi — server yang
   * memutuskan "ada yang berubah atau tidak" dari baris yang sudah dikunci `FOR UPDATE`,
   * bukan dari tebakan klien. Menyimpan tanpa mengubah wewenang apa pun (mis. cuma
   * menggeser satu izin menu) tidak perlu ditanya alasannya.
   */
  alasan:     AlasanWewenangSchema.optional(),
  menu:       z.record(z.string(), z.record(z.string(), IzinMenuEnum)).default({}),
  versi:      z.record(z.string(), z.string()).default({}),
  /** Jejak P1: paket mana yang dipakai sebagai titik awal, dan berapa yang disunting. */
  asal_paket: z.object({
    nama:   z.string().min(1).max(60),
    diubah: z.number().int().min(0).max(999),
  }).nullable().optional(),
});

export type PusatAksesSimpanBody = z.infer<typeof PusatAksesSimpanSchema>;

/**
 * Badan DELETE. `id` & `mode` tetap di query string, alasannya TIDAK: teks bebas di URL
 * berakhir di log akses Nginx dan riwayat peramban, dan yang ditulis di sini kadang
 * menyebut nama orang atau sebab pemberhentiannya.
 */
export const PusatAksesHapusSchema = z.object({
  alasan: AlasanWewenangSchema,
});

/**
 * P1 — Paket Akses. Disimpan sebagai SATU baris `app_config` (`akses_paket`), bukan
 * tabel: `value` bertipe TEXT tanpa bentuk, jadi yang menjaganya cuma skema ini —
 * divalidasi saat BACA dan saat TULIS. Baris yang rusak (disunting tangan di MySQL)
 * harus jatuh jadi "tidak ada paket", bukan merobohkan layarnya.
 */
export const PaketAksesSchema = z.object({
  nama:       z.string().min(1).max(60),
  keterangan: z.string().max(200).default(''),
  app_access: z.array(AppAccessKeyEnum).max(20),
  menu:       z.record(z.string(), z.record(z.string(), IzinMenuEnum)).default({}),
});

/**
 * Paket TIDAK boleh memuat peran. Memberi peran punya kuota, mencabut sesi, dan
 * membatalkan probation — itu aksi tersendiri, bukan isi paket (§12 P1).
 */
export const DaftarPaketSchema = z.array(PaketAksesSchema).max(20);

export type PaketAkses = z.infer<typeof PaketAksesSchema>;
