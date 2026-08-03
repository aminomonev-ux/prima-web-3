// lib/data/menu-access-schemas.ts — Zod sentral untuk pengaturan akses menu.
// Konsep: docs/CONCEPT-menu-access-control.md §4.5, §6
import { z } from 'zod'
import { ROLE_LABELS } from '@/lib/constants'
import { MENU_APPS, MENU_APP_KEYS } from '@/lib/registry/menu-apps'

export const IzinEnum = z.enum(['EDIT', 'LIHAT', 'TIDAK'])

/**
 * Diturunkan dari registry, tidak diketik ulang. Hari ini isinya baru BLUD; menambah
 * modul = menambah satu baris di `lib/registry/menu-apps.ts`, bukan menyunting berkas ini.
 */
export const AppKeyEnum = z.enum(MENU_APP_KEYS as [string, ...string[]])

const KEY_SAH = new Set(MENU_APPS.flatMap((a) => a.menus.map((m) => m.key)))

/**
 * Peta `{menu_key: izin}`. Peta kosong = "kembalikan ke bawaan" (semua barisnya dihapus),
 * bukan "tutup semuanya" — itu perbedaan yang harus tetap jelas di seluruh lapis.
 */
const PetaIzinSchema = z.record(z.string(), IzinEnum)
  .refine((p) => Object.keys(p).length <= 24, 'Terlalu banyak menu dalam satu simpanan')
  .refine((p) => Object.keys(p).every((k) => KEY_SAH.has(k)), 'Ada menu yang tidak dikenal')

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
  }),
  z.object({
    scope:  z.literal('role'),
    appKey: AppKeyEnum,
    role:   RoleSchema,
    izin:   PetaIzinSchema,
    versi:  SidikJariSchema,
  }),
])

export type MenuAccessBody = z.infer<typeof MenuAccessBodySchema>
