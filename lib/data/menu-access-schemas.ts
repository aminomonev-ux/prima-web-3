// lib/data/menu-access-schemas.ts — Zod sentral untuk pengaturan akses menu.
// Konsep: docs/CONCEPT-menu-access-control.md §4.5, §6
import { z } from 'zod'
import { ROLE_LABELS } from '@/lib/constants'
import { MENU_APPS, MENU_APP_KEYS } from '@/lib/registry/menu-apps'

export const IzinEnum = z.enum(['EDIT', 'LIHAT', 'TIDAK'])

/**
 * Diturunkan dari registry, tidak diketik ulang. Menambah modul = menambah satu baris
 * di `lib/registry/menu-apps.ts`, bukan menyunting berkas ini — sudah dibuktikan saat
 * PK masuk sebagai modul kedua.
 */
export const AppKeyEnum = z.enum(MENU_APP_KEYS as [string, ...string[]])

/** Key sah PER MODUL, bukan satu himpunan gabungan — lihat `cekKeyMilikApp`. */
const KEY_SAH_PER_APP = new Map(
  MENU_APPS.map((a) => [a.key, new Set(a.menus.map((m) => m.key))]),
)

/**
 * Peta `{menu_key: izin}`. Peta kosong = "kembalikan ke bawaan" (semua barisnya dihapus),
 * bukan "tutup semuanya" — itu perbedaan yang harus tetap jelas di seluruh lapis.
 */
const PetaIzinSchema = z.record(z.string(), IzinEnum)
  .refine((p) => Object.keys(p).length <= 24, 'Terlalu banyak menu dalam satu simpanan')

/**
 * Key harus milik modul yang sedang disimpan, bukan sekadar "dikenal di suatu modul".
 * Sejak ada modul kedua, `blud.dpa` yang dikirim dengan `appKey=perjanjian_kinerja`
 * lolos kalau pemeriksaannya cuma satu himpunan gabungan. Ia memang akan disaring lagi
 * di data layer sebelum menyentuh DB — tapi diam-diam, dan admin melihat "tersimpan"
 * untuk sesuatu yang tidak tersimpan. Ditolak di sini supaya ia dapat pesan. (L68)
 */
function cekKeyMilikApp(
  v: { appKey: string; izin: Record<string, unknown> },
  ctx: z.RefinementCtx,
) {
  const sah = KEY_SAH_PER_APP.get(v.appKey)
  for (const k of Object.keys(v.izin)) {
    if (!sah?.has(k)) {
      ctx.addIssue({
        code: 'custom',
        path: ['izin', k],
        message: `Menu "${k}" bukan milik modul ${v.appKey}`,
      })
    }
  }
}

/**
 * `SUPER_ADMIN` sengaja TIDAK boleh jadi sasaran. Kalau barisnya bisa diedit, cepat atau
 * lambat ada yang mencabut aksesnya sendiri dan tidak tersisa siapa pun yang bisa
 * memperbaikinya dari dalam. §4.5.4 nomor 5.
 */
const RoleSchema = z.string().refine(
  (r) => r !== 'SUPER_ADMIN' && Object.prototype.hasOwnProperty.call(ROLE_LABELS, r),
  'Peran tidak dikenal atau tidak boleh diatur dari sini',
)

/**
 * Sidik jari keadaan yang dilihat admin saat layar dimuat (kunci optimistik, L48).
 * Wajib: tanpa ini dua admin yang menyimpan berurutan saling menghapus tanpa suara.
 */
const SidikJariSchema = z.string().min(1).max(2000)

export const MenuAccessBodySchema = z.discriminatedUnion('scope', [
  z.object({
    scope:  z.literal('user'),
    appKey: AppKeyEnum,
    userId: z.number().int().positive(),
    izin:   PetaIzinSchema,
    versi:  SidikJariSchema,
  }).superRefine(cekKeyMilikApp),
  z.object({
    scope:  z.literal('role'),
    appKey: AppKeyEnum,
    role:   RoleSchema,
    izin:   PetaIzinSchema,
    versi:  SidikJariSchema,
  }).superRefine(cekKeyMilikApp),
])

export type MenuAccessBody = z.infer<typeof MenuAccessBodySchema>
