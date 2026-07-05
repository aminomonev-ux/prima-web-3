// ═══ PRIMA — BLUD API Schemas (Audit Tahap 11) ══════════════════════════════
// Centralized Zod schemas + role allow-list untuk endpoint app/api/blud/*.
// Fixes: B-SEC-2 (no role guard), B-SEC-3 (no Zod validation).
// 2026-05-21: + bludRateLimit() helper (audit Pengaturan).

import { z } from 'zod';
import { NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/security/ratelimit';

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
  tipe_baris:           TipeBarisSchema,
  row_id:               z.string().max(64),
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

/** POST /api/blud/dpa — Audit BLUD v1.2 (B-NEW-3): force + L51 expected_version */
export const DpaBodySchema = z.object({
  versi_tanggal:    TanggalSchema,
  rows:             z.array(DpaBarisInputSchema).min(1, 'Minimal 1 baris').max(700, 'Maksimal 700 baris'),
  force:            z.boolean().optional().default(false),
  expected_version: z.coerce.number().int().min(0).default(0),
  sentinel_ack:     SentinelAckSchema.optional(),
});

/** POST /api/blud/pergeseran */
export const PergeseranBodySchema = z.object({
  versi_tanggal:     TanggalSchema,
  dpa_versi_tanggal: TanggalSchema.optional(),
  rows:              z.array(PergeseranBarisInputSchema).min(1, 'Minimal 1 baris').max(700, 'Maksimal 700 baris'),
  force:             z.boolean().optional().default(false),
  // B6 draft: simpan progres belum berimbang — pengakuan eksplisit user,
  // tanpa flag ini delta root != 0 ditolak PERGESERAN_TIDAK_BERIMBANG
  draft:             z.boolean().optional().default(false),
  expected_version:  z.coerce.number().int().min(0).default(0),
  sentinel_ack:      SentinelAckSchema.optional(),
});

/** POST /api/blud/pergeseran/inject */
export const InjectBodySchema = z.object({
  pergeseran_rows: z.array(PergeseranBarisInputSchema).min(1, 'Data pergeseran kosong').max(700, 'Maksimal 700 baris'),
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
  versi: TanggalSchema.nullable().optional(),    // null/undefined → pakai latest DPA date
  rows:  z.array(RekapPKItemSchema).min(1, 'Minimal 1 baris').max(500, 'Maksimal 500 baris'),
});
