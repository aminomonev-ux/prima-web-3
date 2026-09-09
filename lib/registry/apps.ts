// lib/registry/apps.ts — SATU daftar modul PRIMA.
// Konsep: docs/CONCEPT-pusat-akses-satu-pintu.md §4.1 (Fase B / Tahap 2).
//
// Sebelum berkas ini ada, satu fakta — "modul X ada, kuncinya `x`, pintunya `isXRole`,
// sakelarnya `app_status_x`, route-nya di `app/api/x`" — ditulis di DELAPAN tempat yang
// tidak saling memaksa: kartu /menu, checkbox Atur Akses, label App Control, whitelist
// Zod, whitelist sakelar server, `APP_CHECKS`, tujuan navigasi RIMA, dan daftar
// direktori milik gate G. Tiap selisih di antara kedelapannya adalah selisih yang tidak
// disengaja — dan itulah T-1, T-5, T-6, T-9 dan T-11 sekaligus.
//
// Yang paling menentukan justru yang terakhir: **penjaga otomatis punya daftarnya
// sendiri yang diketik tangan**, jadi ia hanya menjaga modul yang sudah diingat. Selama
// itu berlaku, memperbaiki temuan satu per satu tidak mencegah modul ke-sebelas
// mengulanginya bulan depan.
//
// ATURAN BERKAS INI:
//   1. **Nol impor.** Ia dibaca komponen `'use client'`, route server, DAN skrip CI.
//      Satu impor yang menyeret mysql2 akan merobohkan salah satunya (preseden nyata:
//      satu konstanta dari berkas ber-mysql2 pernah merobohkan seluruh rute dashboard).
//   2. **Data + fungsi murni saja.** Tidak ada pembacaan DB, tidak ada `NextResponse`.
//   3. **Menambah modul = menambah SATU entri**, di `apps-data.mjs`. Kalau sebuah
//      tempat masih perlu diketik ulang setelah itu, tempat itu belum selesai
//      diturunkan.
//
// Isinya sengaja tinggal di `apps-data.mjs` (JavaScript polos) — alasannya ditulis di
// kepala berkas itu: gate G jalan di CI dengan `node` biasa dan tidak bisa membaca
// TypeScript, sementara membiarkannya mengetik ulang daftar modul akan mengembalikan
// cacat yang justru sedang dibuang.

export type SubSakelar = {
  kunci: string
  label: string
}

export type PenjagaApi = {
  /** `pabrik` = `buatGuardModul(...)` di `_guard.ts`; `per-route` = tiap route memanggil helper matinya sendiri. */
  lewat: 'pabrik' | 'per-route'
  /** Nama yang salah satunya WAJIB muncul di tiap berkas route — dipakai gate G. */
  penanda: readonly string[]
}

export type Modul = {
  /** Kunci `users.app_access`, sekaligus id kartu di /menu. */
  kunci: string
  label: string
  href: string
  /**
   * Peran yang dapat modul ini TANPA grant. `'SEMUA'` = terbuka untuk semua peran
   * (hari ini hanya Usulan Kebutuhan; pembatasannya ada di dalam modulnya sendiri).
   */
  peranBawaan: readonly string[] | 'SEMUA'
  /** Muncul di daftar "Atur Akses Aplikasi"? Modul yang tidak bisa di-grant = false. */
  bolehDigrant: boolean
  /** Kunci `app_config`. `null` = memang tidak punya sakelar. */
  sakelar: string | null
  subSakelar?: readonly SubSakelar[]
  /** Direktori route API. `null` = tidak punya route sendiri. */
  dirApi: string | null
  penjagaApi?: PenjagaApi
  /** Punya izin per-menu (`menu_role_access`) — lihat `lib/registry/menu-apps.ts`. */
  punyaMenu: boolean
  /**
   * Sebutan lain yang dipakai orang saat menyuruh RIMA membuka modul ini ("buka dpa").
   * Ikut di sini, bukan di `lib/sentinel/nav.ts`, karena daftar terpisah di sana sudah
   * terbukti ketinggalan: Dashboard tidak pernah ditambahkan ke sana sama sekali (T-11).
   */
  alias?: readonly string[]
}

import { MODUL_APPS_DATA } from './apps-data.mjs'

/** Daftar modul — isinya di `apps-data.mjs`, tipenya ditegakkan di sini. */
export const MODUL_APPS: readonly Modul[] = MODUL_APPS_DATA as readonly Modul[]

const PETA = new Map(MODUL_APPS.map((m) => [m.kunci, m]))

export function modul(kunci: string): Modul | null {
  return PETA.get(kunci) ?? null
}

/**
 * Pengganti tunggal delapan `is<Modul>Role` yang isinya byte-identik. Dipakai lewat
 * `hasAppAccess(userId, role, cekModul('blud'))` — bentuk pemanggilnya tidak berubah.
 *
 * Modul yang tidak dikenal dijawab `false` (deny-by-default): salah ketik kunci harus
 * menutup pintu, bukan membukanya.
 */
export function bolehMasukModul(
  kunci: string,
  role: string,
  appAccess: string[] | null | undefined,
): boolean {
  const m = PETA.get(kunci)
  if (!m) return false
  if (m.peranBawaan === 'SEMUA') return true
  if (m.peranBawaan.includes(role)) return true
  // Grant hanya berlaku untuk modul yang memang bisa di-grant. Tanpa syarat ini,
  // menyelipkan 'admin' ke `users.app_access` lewat jalur mana pun akan membuka
  // Admin Panel — persis yang T-9 sebut sebagai janji kosong, tapi terbalik jadi
  // pintu sungguhan.
  if (!m.bolehDigrant) return false
  return Array.isArray(appAccess) && appAccess.includes(kunci)
}

/**
 * Peran bawaan sebuah modul sebagai larik. Modul `'SEMUA'` memulangkan larik KOSONG,
 * dan itu bukan jawaban yang sama — jangan pakai fungsi ini untuk memutuskan akses;
 * `bolehMasukModul` yang berhak menjawab itu. Ini cuma untuk menampilkan daftarnya
 * dan untuk konstanta `*_ALLOWED_ROLES` lama yang masih diimpor beberapa berkas.
 */
export function peranBawaanModul(kunci: string): readonly string[] {
  const p = PETA.get(kunci)?.peranBawaan
  return p && p !== 'SEMUA' ? p : []
}

/** Bentuk siap-pakai untuk `hasAppAccess` / `requireAccess`, yang menerima `(role, appAccess)`. */
export function cekModul(kunci: string) {
  return (role: string, appAccess: string[] | null | undefined) =>
    bolehMasukModul(kunci, role, appAccess)
}

// ─── Daftar turunan ──────────────────────────────────────────────────────────
// Semua yang di bawah ini DITURUNKAN, tidak diketik. Tiap konstanta di sini dulunya
// sebuah daftar tangan tersendiri di berkas lain.

/**
 * Sakelar yang BUKAN milik sebuah modul: fitur lintas-modul yang punya tombolnya
 * sendiri di App Control. Ditaruh di sini, bukan dibiarkan di berkas route, supaya
 * "daftar seluruh sakelar" tetap satu — itu seluruh gunanya berkas ini.
 */
export const SAKELAR_LAIN: readonly SubSakelar[] = [
  { kunci: 'app_status_sentinel_bot', label: 'RIMA — Seluruh Bot' },
  { kunci: 'app_status_rima_query', label: 'RIMA — Tanya Data (Q&A)' },
]

/** Kunci `app_access` yang sah — whitelist Zod. `admin` & `usulan_aset` tidak termasuk. */
export const KUNCI_GRANT: readonly string[] = MODUL_APPS.filter((m) => m.bolehDigrant).map((m) => m.kunci)

/** Semua kunci sakelar `app_config` — modul, sub-modul, dan fitur lintas-modul. */
export const KUNCI_SAKELAR: readonly string[] = [
  ...MODUL_APPS.flatMap((m) => [
    ...(m.sakelar ? [m.sakelar] : []),
    ...(m.subSakelar ?? []).map((s) => s.kunci),
  ]),
  ...SAKELAR_LAIN.map((s) => s.kunci),
]

/** Kunci sakelar → label yang tampil di App Control. */
export const LABEL_SAKELAR: Readonly<Record<string, string>> = Object.fromEntries([
  ...MODUL_APPS.flatMap((m) => [
    ...(m.sakelar ? [[m.sakelar, m.label] as const] : []),
    ...(m.subSakelar ?? []).map((s) => [s.kunci, s.label] as const),
  ]),
  ...SAKELAR_LAIN.map((s) => [s.kunci, s.label] as const),
])

/** Modul yang route API-nya wajib menghormati sakelar — bahan gate G. */
export const MODUL_BERSAKELAR: readonly Modul[] = MODUL_APPS.filter(
  (m) => m.sakelar !== null && m.dirApi !== null && m.penjagaApi !== undefined,
)
