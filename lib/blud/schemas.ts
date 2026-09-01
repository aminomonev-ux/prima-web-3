// ═══ PRIMA — BLUD API Schemas (Audit Tahap 11) ══════════════════════════════
// Centralized Zod schemas + role allow-list untuk endpoint app/api/blud/*.
// Fixes: B-SEC-2 (no role guard), B-SEC-3 (no Zod validation).
// 2026-05-21: + bludRateLimit() helper (audit Pengaturan).

import { z } from 'zod';
import { NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/security/ratelimit';
import { tanggalHariIniWIB } from './tanggal';

// ─── Constants ──────────────────────────────────────────────────────────────

/**
 * Role allow-list untuk SEMUA endpoint BLUD (GET + POST).
 *
 * Decision audit Tahap 11 (2026-05-18): default ketat — hanya SUPER_ADMIN +
 * ADMIN. Akses role lain di-toggle via admin panel "User Management > Akses
 * App". GET dan POST pakai allow-list yang SAMA (konsisten dengan kinerja
 * Tahap 12): kalau tidak punya akses app BLUD, tidak boleh lihat data
 * DPA mentah (sensitif: kode rekening + nominal anggaran).
 */
export const BLUD_ALLOWED_ROLES = ['SUPER_ADMIN', 'ADMIN'] as const;
export const BLUD_APP_KEY = 'blud';

/**
 * Cek role + app_access (pola isAsetRole/isLkjipRole). Role di luar allow-list
 * bisa di-grant via users.app_access include 'blud' (Admin Panel → User Management).
 * Pakai via `hasAppAccess(userId, role, isBludRole)` atau `requireAccess(isBludRole)`.
 */
export function isBludRole(role: string, appAccess: string[] | null | undefined): boolean {
  if ((BLUD_ALLOWED_ROLES as readonly string[]).includes(role)) return true;
  return Array.isArray(appAccess) && appAccess.includes(BLUD_APP_KEY);
}

/**
 * S5 — hapus PERMANEN satu versi DPA/Pergeseran. Sengaja lebih ketat dari akses
 * modul: grant `app_access: 'blud'` membuka pintu masuk, bukan wewenang membuang
 * anggaran setahun. Dulu keduanya sama, padahal dampaknya jauh berbeda —
 * bandingkan dengan buka periode yang sejak awal hanya SUPER_ADMIN.
 *
 * Ini BUKAN tombol hapus baris di dalam tabel DPA/Pergeseran: mengubah isi versi
 * bagian dari menyimpan, dan tetap milik siapa pun yang boleh mengedit.
 *
 * Daftarnya sengaja berbentuk array, bukan satu perbandingan `=== 'SUPER_ADMIN'`.
 * Menambah peran nanti cukup satu nama di sini, tanpa menyentuh route mana pun.
 */
export const BLUD_HAPUS_VERSI_ROLES = ['SUPER_ADMIN', 'ADMIN'] as const;

export function canHapusVersi(role: string): boolean {
  return (BLUD_HAPUS_VERSI_ROLES as readonly string[]).includes(role);
}

/**
 * Impor DPA menulis SATU VERSI PENUH sekaligus — sekelas operasi borongan, bukan
 * sunting baris. Kebetulan daftarnya sama dengan hapus versi, tapi sengaja
 * dipisah: kalau suatu saat salah satunya dilonggarkan, yang lain tidak ikut.
 */
export const BLUD_IMPOR_DPA_ROLES = ['SUPER_ADMIN', 'ADMIN'] as const;

export function canImporDpa(role: string): boolean {
  return (BLUD_IMPOR_DPA_ROLES as readonly string[]).includes(role);
}

/**
 * Menjalankan pencadangan JSON — mengirim angka anggaran KELUAR dari gedung, ke
 * penyimpanan pihak ketiga. Daftarnya kebetulan sama dengan dua di atas, dan
 * sengaja tetap terpisah dengan alasan yang sama: melonggarkan salah satunya
 * kelak tidak boleh ikut melonggarkan yang lain.
 */
export const BLUD_CADANGAN_ROLES = ['SUPER_ADMIN', 'ADMIN'] as const;

export function canCadangkanJson(role: string): boolean {
  return (BLUD_CADANGAN_ROLES as readonly string[]).includes(role);
}

// Batas baris impor tinggal di `import-dpa-shared.ts` — satu angka dipakai
// parser DAN Zod, dan berkas itu sengaja bebas dependensi server.
export { BLUD_IMPOR_MAKS_BARIS, BLUD_SIMPAN_MAKS_BARIS } from './import-dpa-shared';
import {
  BLUD_SIMPAN_MAKS_BARIS as MAKS_BARIS_SIMPAN,
} from './import-dpa-shared';

/**
 * Rate limit helper untuk endpoint BLUD. Pakai key `blud-<action>:<userId>`
 * supaya isolasi per-user (1 user spam tidak block user lain).
 *
 * @param userId      session.userId
 * @param action      label aksi (e.g. 'delete-dpa', 'save-dpa') — masuk key & error msg
 * @param maxPerMinute  default 30 (legitimate save use case)
 * @returns NextResponse 429 kalau exceeded, null kalau allowed
 *
 * Pakai sebagai early-return di handler:
 *   const limited = await bludRateLimit(session.userId, 'delete-dpa', 10)
 *   if (limited) return limited
 */
export async function bludRateLimit(
  userId: number,
  action: string,
  maxPerMinute: number = 30,
): Promise<NextResponse | null> {
  const rl = await checkRateLimit(`blud-${action}:${userId}`, maxPerMinute, 60);
  if (!rl.allowed) {
    return NextResponse.json({
      ok:      false,
      error:   `Terlalu banyak permintaan. Coba lagi dalam ${rl.resetIn} detik.`,
      resetIn: rl.resetIn,
    }, { status: 429 });
  }
  return null;
}

/**
 * R4 — apakah peristiwa "melihat" ini layak dicatat sekali lagi.
 *
 * `GET /dpa` dan `GET /pergeseran` menulis audit SETIAP panggilan. Layar yang
 * nyangkut di loop render, atau skrip sederhana, bisa menggelembungkan `audit_log`
 * sampai jejak yang benar-benar penting tenggelam di antaranya. Yang ingin dijawab
 * audit view sebenarnya "siapa pernah melihat versi ini", bukan "berapa kali
 * komponennya me-render".
 *
 * Menumpang pembatas laju yang sudah ada: jatah 1 per 60 detik untuk tiap
 * kombinasi user × versi. Tidak perlu tabel maupun mekanisme baru.
 *
 * Gagal membaca Redis → `true` (tetap dicatat). Kebalikan dari kill-switch yang
 * fail-closed: di sana ragu berarti tutup pintu, di sini ragu berarti tetap
 * meninggalkan jejak. Kehilangan jejak lebih mahal daripada satu baris berlebih.
 */
export async function bolehCatatView(userId: number, penanda: string): Promise<boolean> {
  try {
    const rl = await checkRateLimit(`blud-audit-view:${penanda}:${userId}`, 1, 60);
    return rl.allowed;
  } catch {
    return true;
  }
}

// ─── Primitive Schemas ──────────────────────────────────────────────────────

/**
 * Tanggal versi DPA / Pergeseran — string YYYY-MM-DD (MySQL DATE).
 * Sesuai `dpa.versi_tanggal DATE NOT NULL` di schema-mysql.sql.
 */
export const TanggalSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Tanggal harus format YYYY-MM-DD')
  .refine((v) => !Number.isNaN(new Date(v).getTime()), 'Tanggal tidak valid');

/**
 * Pagar `versi_tanggal` — dipakai `DpaBodySchema` & `PergeseranBodySchema`.
 *
 * Sampai sekarang `versi_tanggal` bebas sepenuhnya: format benar = diterima.
 * Padahal `getPaguEfektif` selalu mengambil MAX(versi_tanggal), jadi permintaan
 * berisi `{ tahun_anggaran: 2026, versi_tanggal: '2099-12-31' }` akan diterima
 * dan tanggal itu menjadi pagu efektif tahun 2026 SELAMANYA — tidak bisa
 * dikalahkan versi mana pun sampai tahun 2100.
 *
 * SENGAJA TIDAK memeriksa apakah tahun `versi_tanggal` sama dengan
 * `tahun_anggaran`. Keduanya memang dimensi terpisah: `versi_tanggal` adalah
 * KAPAN versi itu ditulis, `tahun_anggaran` adalah tahun yang dianggarkan.
 * Menyusun DPA 2027 pada Agustus 2026 — persis guna "Salin dari Tahun Lain" —
 * menghasilkan `{ tahun_anggaran: 2027, versi_tanggal: '2026-08-26' }`, dan
 * memaksakan keduanya sama akan menolak alur yang sah itu.
 */
export function pagarVersiTanggal(
  data: { tahun_anggaran: number; versi_tanggal: string },
  ctx: z.RefinementCtx,
  /** Param hanya untuk pengujian; produksi selalu memakai hari ini WIB. */
  hariIni: string = tanggalHariIniWIB(),
): void {
  if (data.versi_tanggal > hariIni) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['versi_tanggal'],
      message: `Versi tidak boleh bertanggal setelah hari ini (${hariIni}).`,
    });
  }
}

/**
 * Tahun anggaran — dimensi di atas versi_tanggal (CONCEPT-blud-tahun-anggaran).
 * `z.coerce` supaya query string `?tahun=2027` diterima sebagai number.
 */
export const TahunSchema = z.coerce.number().int().gte(2000).lte(2100);

/**
 * S5 — alasan hapus versi, wajib. Bentuknya sama dengan `BukaPeriodeQuerySchema`
 * di realisasi-schemas: dua aksi yang sama-sama merusak dokumen resmi sebaiknya
 * terasa sama beratnya. Kode konfirmasi 4-digit membuktikan "tidak salah klik";
 * alasan menjawab "kenapa" — dan enam bulan lagi hanya yang kedua yang berguna.
 */
export const AlasanHapusSchema = z
  .string()
  .trim()
  .min(10, 'Alasan hapus versi minimal 10 karakter')
  .max(500, 'Alasan hapus versi maksimal 500 karakter');

/**
 * TipeBaris enum — match type di `types/index.ts`.
 */
export const TipeBarisSchema = z.enum([
  'GRANDMASTER', 'MASTER', 'CHILD', 'LEADER', 'MEMBER',
  'PLETON-LEADER', 'PLETON-MEMBER',
  'KETUA-KELOMPOK-A', 'ANGGOTA-KELOMPOK-A',
  'KETUA-KELOMPOK-B', 'ANGGOTA-KELOMPOK-B',
  'L7-HEAD', 'L7-SUB', 'L8-HEAD', 'L8-SUB',
]);

// ─── Row Schemas ────────────────────────────────────────────────────────────

/**
 * DPA baris input — match `DpaBarisInput` di types/index.ts.
 * Pakai `.passthrough()` supaya field tambahan (kalau ada di masa depan)
 * tidak ditolak, tapi field wajib tetap diverifikasi.
 */
// Cap string/number sesuai lebar kolom schema-mysql.sql (audit DPA 2026-06-11 S-1):
// tanpa cap, payload kelewat panjang/besar gagal di MySQL strict → 500 membingungkan.
export const DpaBarisInputSchema = z.object({
  kode_rekening:    z.string().max(64, 'Kode rekening maks 64 karakter'),
  uraian:           z.string().max(2000, 'Uraian maks 2000 karakter'),
  vol:              z.number().min(-1e13).max(1e13).nullable(),
  satuan:           z.string().max(32, 'Satuan maks 32 karakter').nullable(),
  harga:            z.number().min(-1e15).max(1e15).nullable(),
  jumlah:           z.number().min(-1e15).max(1e15),
  penanggung_jawab: z.string().max(128, 'Penanggung jawab maks 128 karakter').nullable().optional(),
  keterangan:       z.string().max(2000, 'Keterangan maks 2000 karakter').nullable().optional(),
  tipe_baris:       TipeBarisSchema,
  row_id:           z.string().max(64),
  // Jangkar realisasi (CONCEPT-blud-realisasi §2.3) — dibuat server saat baris lahir,
  // klien hanya memantulkannya kembali. Kosong = baris baru, server yang isi.
  anggaran_key:     z.string().max(64).nullable().optional(),
  parent_id:        z.string().max(64).nullable(),
  urutan:           z.number().int(),
  // Jejak import usulan (CONCEPT-import-usulan-dpa §4) — optional, default MANUAL
  origin:           z.enum(['MANUAL', 'USULAN']).optional(),
  usulan_item_id:   z.number().int().positive().nullable().optional(),
  usulan_no:        z.string().max(64).nullable().optional(),
}).passthrough();

/**
 * Pergeseran baris input — match `PergeseranBarisInput`.
 */
export const PergeseranBarisInputSchema = z.object({
  kode_rekening:        z.string().max(64, 'Kode rekening maks 64 karakter'),
  uraian:               z.string().max(2000, 'Uraian maks 2000 karakter'),
  vol:                  z.number().min(-1e13).max(1e13).nullable(),
  satuan:               z.string().max(32, 'Satuan maks 32 karakter').nullable(),
  harga:                z.number().min(-1e15).max(1e15).nullable(),
  jumlah:               z.number().min(-1e15).max(1e15),
  vol_p:                z.number().min(-1e13).max(1e13).nullable(),
  harga_p:              z.number().min(-1e15).max(1e15).nullable(),
  pergeseran:           z.number().min(-1e15).max(1e15),
  bertambah_berkurang:  z.number().min(-1e15).max(1e15),
  // Uraian tangan bertambah/berkurang. NULLABLE + OPTIONAL, dan dua-duanya wajib:
  //
  //   nullable — `null` adalah keadaan NORMAL, bukan data hilang. Ia yang
  //     membedakan "isi sendiri dari selisih" dari "sudah diuraikan tangan,
  //     jangan ditimpa recalc".
  //   optional — 50 snapshot `blud_riwayat_simpan` + berkas cadangan Drive dibuat
  //     SEBELUM kolom ini ada. Kalau diwajibkan, memulihkan salah satunya lalu
  //     Simpan ditolak 400 dan seluruh riwayat jadi tak terpakai.
  //
  // `min(0)`: "bertambah −5jt" tidak punya arti, dan membiarkannya membuat
  // invarian `bertambah − berkurang = selisih` bisa dipenuhi dengan angka
  // omong kosong.
  bertambah:            z.number().min(0).max(1e15).nullable().optional(),
  berkurang:            z.number().min(0).max(1e15).nullable().optional(),
  // Batasnya sengaja sama persis dengan DpaBarisInputSchema — kolomnya cermin DPA.
  penanggung_jawab:     z.string().max(128, 'Penanggung jawab maks 128 karakter').nullable().optional(),
  keterangan:           z.string().max(2000, 'Keterangan maks 2000 karakter').nullable().optional(),
  tipe_baris:           TipeBarisSchema,
  row_id:               z.string().max(64),
  anggaran_key:         z.string().max(64).nullable().optional(),
  parent_id:            z.string().max(64).nullable(),
  urutan:               z.number().int(),
}).passthrough();

// ─── Body Schemas per Endpoint ──────────────────────────────────────────────

/** RIMA F1 (G8): jejak temuan Sentinel yang di-Abaikan/aktif saat Simpan →
 *  audit BLUD_SENTINEL_ACK. Ikut body Simpan existing — bukan endpoint baru (G16). */
export const SentinelAckSchema = z.object({
  dismissed: z.array(z.object({
    rule:  z.string().max(64),
    label: z.string().max(300),
  })).max(50).default([]),
  active_warning: z.number().int().min(0).max(999).default(0),
});

/**
 * Jejak "baris ini salinan tahun lain" — tujuannya SATU: memperpanjang baris
 * detail `BLUD_SAVE_DPA`. Tidak disimpan ke kolom mana pun dan tidak mengubah
 * apa yang ditulis. Tanpa ini tidak ada apa pun di basis data yang menyatakan
 * DPA 2027 lahir dari 2026 — log-nya cuma berbunyi "0 → 570 baris".
 */
export const AsalSalinSchema = z.object({
  tahun:  TahunSchema,
  versi:  TanggalSchema,
  sumber: z.enum(['DPA', 'PERGESERAN']),
  // Menjawab yang tidak bisa dijawab angka baris: jangkar realisasi ikut terbawa
  // atau tidak. 'TAHUN' = dilepas (tahun beda), 'VERSI' = utuh (tahun sama).
  // `.default` supaya tab lama yang belum mengirimnya tetap tercatat benar —
  // sebelum ada Salin Versi, satu-satunya salinan memang lintas tahun.
  lingkup: z.enum(['TAHUN', 'VERSI']).default('TAHUN'),
});

/**
 * Sepadan `AsalSalinSchema`, untuk baris yang dimuat dari riwayat simpan.
 * Tujuannya juga satu: memperpanjang baris detail audit. Tanpa ini tidak ada
 * apa pun yang menyatakan versi hari ini lahir dari simpanan pukul 09:15.
 */
export const AsalPulihkanSchema = z.object({
  id:            z.coerce.number().int().positive(),
  versi_ke:      z.coerce.number().int().min(0),
  disimpan_pada: z.string().trim().max(32),
});

/**
 * Sepadan `AsalSalinSchema`, untuk baris yang dimuat dari BERKAS cadangan JSON.
 *
 * Bedanya dengan `asal_pulihkan` bukan sepele: pemulihan dari riwayat mengambil
 * dari tabel yang masih ada di server, sedangkan ini datang dari berkas di luar —
 * bisa dari cadangan Drive bulan lalu, bisa dari komputer siapa saja. Tanpa baris
 * audit sendiri, keduanya terlihat sama padahal asal-usul angkanya jauh berbeda.
 */
export const AsalBerkasSchema = z.object({
  nama:          z.string().trim().min(1).max(191),
  versi_tanggal: TanggalSchema,
  versi_ke:      z.coerce.number().int().min(0),
  disimpan_pada: z.string().trim().max(32),
});

/**
 * Sepadan `AsalSalinSchema`, untuk baris yang datang dari berkas Excel.
 *
 * Sejak impor berhenti di form, `BLUD_DPA_IMPORT_COMMIT` tidak ada lagi — tidak
 * ada yang di-commit di sana. Baris inilah satu-satunya yang tersisa untuk
 * menyatakan "versi ini lahir dari sebuah berkas", lengkap dengan nama berkas
 * dan lembarnya. Tanpa itu impor tidak bisa dibedakan dari ketikan tangan.
 *
 * Nama berkas berasal dari klien: dibatasi panjangnya supaya baris audit tidak
 * bisa dibanjiri teks kiriman orang (pagar yang sama dengan jalur pratinjau).
 */
export const AsalImporSchema = z.object({
  berkas: z.string().trim().max(120),
  lembar: z.string().trim().max(60),
  baris:  z.coerce.number().int().min(0),
});

/**
 * Sepadan `AsalSalinSchema`, untuk baris hasil "Tutup Pergeseran".
 *
 * Bedanya dengan tiga saudaranya: yang ini tidak berhenti di baris audit. Ia
 * juga yang menerbitkan baris `blud_pergeseran_tutup` — satu-satunya tempat yang
 * menyatakan versi mana yang dikunci dan basis mana yang lahir darinya. Tanpa
 * itu, versi hasil penutupan tidak bisa dibedakan dari versi biasa yang kebetulan
 * selisihnya nol, dan "Sinkronkan DPA" kehilangan satu-satunya tanda bahwa kolom
 * kirinya bukan lagi angka DPA murni.
 */
export const AsalTutupSchema = z.object({
  versi_ditutup: TanggalSchema,
});

/**
 * Bentuk objeknya dipisah dari versi ber-refinement supaya bisa di-`.extend()`
 * — `.extend()` tidak ada pada hasil `.superRefine()`.
 */
const DpaBodyObject = z.object({
  tahun_anggaran:   TahunSchema,
  versi_tanggal:    TanggalSchema,
  rows:             z.array(DpaBarisInputSchema).min(1, 'Minimal 1 baris').max(MAKS_BARIS_SIMPAN, `Maksimal ${MAKS_BARIS_SIMPAN} baris`),
  force:            z.boolean().optional().default(false),
  // B2 — §4.3 berlaku juga di jalur DPA: selama tahun itu belum punya Pergeseran,
  // DPA-lah pagu yang berlaku. Bentuknya sengaja sama dengan PergeseranBodySchema.
  turunkan_paksa:   z.boolean().optional().default(false),
  alasan_turun:     z.string().trim().min(10, 'Alasan minimal 10 karakter').max(500).optional(),
  expected_version: z.coerce.number().int().min(0).default(0),
  sentinel_ack:     SentinelAckSchema.optional(),
  asal_salin:       AsalSalinSchema.optional(),
  asal_pulihkan:    AsalPulihkanSchema.optional(),
  asal_berkas:      AsalBerkasSchema.optional(),
  asal_impor:       AsalImporSchema.optional(),
  // Versi bulan yang sudah lewat, diisi belakangan (aplikasi mulai dipakai di
  // tengah tahun). Bukan sekadar penanda audit: jalur simpan memakainya untuk
  // menolak entri historis yang justru akan menjadi acuan pagu.
  entri_historis:   z.boolean().optional().default(false),
});

/**
 * POST /api/blud/dpa — Audit BLUD v1.2 (B-NEW-3): force + L51 expected_version.
 *
 * SATU-SATUNYA skema tulis DPA. Dulu ada `DpaImportBodySchema` kembarannya
 * dengan batas baris sendiri; ia dibuang bersama jalur commit impor. Dua skema
 * tulis berarti dua tempat pagar bisa lupa dipasang — dan memang terjadi:
 * `entri_historis` ada di kedua skema, tapi hanya jalur normal yang
 * meneruskannya ke `saveDpa`, sehingga dokumen historis yang ditolak lewat
 * Simpan justru diterima lewat Impor.
 */
export const DpaBodySchema = DpaBodyObject.superRefine(pagarVersiTanggal);

/** POST /api/blud/pergeseran */
export const PergeseranBodySchema = z.object({
  tahun_anggaran:    TahunSchema,
  versi_tanggal:     TanggalSchema,
  dpa_versi_tanggal: TanggalSchema.optional(),
  // Batasnya WAJIB ikut plafon DPA: tabel Pergeseran salinan 1:1 DPA, jadi
  // plafon yang lebih rendah membuat DPA gemuk tidak bisa dibuatkan pergeseran
  // sama sekali — dan baru ketahuan setelah seluruh geserannya diisi.
  rows:              z.array(PergeseranBarisInputSchema).min(1, 'Minimal 1 baris').max(MAKS_BARIS_SIMPAN, `Maksimal ${MAKS_BARIS_SIMPAN} baris`),
  force:             z.boolean().optional().default(false),
  // B6 draft: simpan progres belum berimbang — pengakuan eksplisit user,
  // tanpa flag ini delta root != 0 ditolak PERGESERAN_TIDAK_BERIMBANG
  draft:             z.boolean().optional().default(false),
  // CONCEPT-blud-realisasi §4.3: menurunkan pagu di bawah realisasi ditolak.
  // Boleh dilanjutkan, tapi harus disengaja dan beralasan — alasannya masuk audit.
  turunkan_paksa:    z.boolean().optional().default(false),
  alasan_turun:      z.string().trim().min(10, 'Alasan minimal 10 karakter').max(500).optional(),
  expected_version:  z.coerce.number().int().min(0).default(0),
  sentinel_ack:      SentinelAckSchema.optional(),
  // Hanya 'VERSI' yang bisa sampai ke sini: Pergeseran tidak punya "Salin dari
  // Tahun Lain" (salinan lintas tahun mendarat di form DPA, bukan di sini).
  asal_salin:        AsalSalinSchema.optional(),
  asal_pulihkan:     AsalPulihkanSchema.optional(),
  asal_berkas:       AsalBerkasSchema.optional(),
  asal_tutup:        AsalTutupSchema.optional(),
  entri_historis:    z.boolean().optional().default(false),
}).superRefine((d, ctx) => {
  pagarVersiTanggal(d, ctx);
  // Pagar tutup #1 — sasaran harus mendarat SESUDAH versi yang ditutup. Simpan
  // itu hapus-lalu-tulis-ulang per (tahun, versi_tanggal), jadi menyimpan basis
  // ke tanggal versi yang sedang ditutup akan menghapus dokumen pergeserannya:
  // selisih −20/+20 miliknya lenyap dan tinggal versi berselisih nol.
  //
  // Pagar #2 ("sasaran tidak boleh menimpa versi lain yang sudah ada") tidak bisa
  // hidup di sini — ia perlu membaca daftar versi. Tempatnya di route, di bawah
  // kunci, bersama pagar-pagar lain yang butuh database.
  if (d.asal_tutup && d.asal_tutup.versi_ditutup >= d.versi_tanggal) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['versi_tanggal'],
      message: `Hasil penutupan versi ${d.asal_tutup.versi_ditutup} tidak boleh disimpan ke ${d.versi_tanggal} — `
        + `dokumen pergeseran yang ditutup akan tertimpa. Pilih periode sesudahnya.`,
    });
  }
  // Pergeseran memotret DPA pada satu titik waktu. DPA yang lahir SESUDAH
  // pergeserannya menghasilkan dokumen yang berbunyi "pada Januari kami
  // menggeser anggaran yang baru ada di Agustus". Sebelum ada pemilih periode,
  // ini mustahil terjadi — server selalu mengambil DPA terbaru dan versinya
  // selalu hari ini; begitu keduanya bisa dipilih, keduanya bisa tidak sepadan.
  if (d.dpa_versi_tanggal && d.dpa_versi_tanggal > d.versi_tanggal) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['dpa_versi_tanggal'],
      message: `DPA acuan (${d.dpa_versi_tanggal}) lebih baru dari versi pergeserannya (${d.versi_tanggal}). Pilih DPA periode yang sama atau sebelumnya.`,
    });
  }
});

/**
 * POST /api/blud/pergeseran/inject
 *
 * `versi_tanggal` WAJIB, dan itu perbaikan bug yang sudah ada: route ini dulu
 * selalu mengambil DPA TERBARU. Menekan Sinkronkan DPA di versi Januari menarik
 * DPA Agustus — Simpan memang menolaknya lewat pagar `dpa_versi_tanggal >
 * versi_tanggal`, tapi tabelnya sudah terlanjur tertimpa dan penolakannya baru
 * datang setelah seluruh geseran diisi ulang.
 *
 * Sengaja bukan `.optional()` dengan cadangan "DPA terbaru": cadangan itu adalah
 * perilaku lamanya, dan pemanggil yang lupa mengirimnya akan diam-diam kembali ke
 * sana. Wajib berarti kompilernya yang mengingatkan.
 */
export const InjectBodySchema = z.object({
  tahun_anggaran:  TahunSchema,
  versi_tanggal:   TanggalSchema,
  pergeseran_rows: z.array(PergeseranBarisInputSchema).min(1, 'Data pergeseran kosong').max(MAKS_BARIS_SIMPAN, `Maksimal ${MAKS_BARIS_SIMPAN} baris`),
});

/** POST /api/blud/rekap-pk — snapshot rekap Penanggung Jawab dari menu Cetak */
// NOTE: Label boleh empty string (renderPjView push row uraian-only sebagai
// [label='', uraian, jumlah] untuk display). Handler filter row label='' di app
// logic (route.ts:46-48). Schema cuma cap max length supaya tidak abuse-able.
export const RekapPKItemSchema = z.tuple([
  z.string().max(255, 'Label terlalu panjang'),
  z.string().optional().or(z.literal('')), // kolom uraian (kosong untuk total/subtotal row)
  z.number().nonnegative('Nominal harus >= 0').max(1e15, 'Nominal terlalu besar'),
]);

export const RekapPKBodySchema = z.object({
  tahun_anggaran: TahunSchema,
  versi: TanggalSchema.nullable().optional(),    // null/undefined → pakai latest DPA date dalam tahun
  rows:  z.array(RekapPKItemSchema).min(1, 'Minimal 1 baris').max(500, 'Maksimal 500 baris'),
});
