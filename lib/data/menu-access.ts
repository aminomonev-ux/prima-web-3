// lib/data/menu-access.ts — pengaturan izin menu dari Admin Panel.
// Konsep: docs/CONCEPT-menu-access-control.md §4.5
//
// Dua lapis, urutan menang: perkecualian orang > aturan peran > bawaan di kode.
// Baris yang TIDAK ADA bukan "tidak boleh" melainkan "belum diatur" — jawabannya
// diambil dari `TABEL` di `peran.ts` modul yang bersangkutan (`lib/blud/peran.ts`,
// `lib/pk/peran.ts`). Karena itu tabel kosong = perilaku hari ini, dan itulah
// keadaan sesudah migration dijalankan.
//
// Berkas ini SERVER-ONLY. Ia mengimpor `peran.ts` (modul daun) tapi TIDAK BOLEH
// diimpor sebaliknya — begitu `peran.ts` menyeret data layer, bundel klien ikut
// menarik server dan ribbon mulai memakai salinan aturannya sendiri.
import { sql, withTransaction, bulkInsert, type Penanya } from './db'
import type { Izin } from '@/lib/blud/peran'
import { infoMenu } from '@/lib/registry/menu-apps'
import { acquireBludLock } from '@/lib/data/locks'

export const APP_BLUD = 'blud'
export const APP_PK = 'perjanjian_kinerja'

const IZIN_SAH: readonly Izin[] = ['EDIT', 'LIHAT', 'TIDAK']

export function isIzin(v: unknown): v is Izin {
  return typeof v === 'string' && (IZIN_SAH as readonly string[]).includes(v)
}

/** Key yang tidak dikenal registry = sisa menu yang sudah dihapus/berganti nama (§5). */
function keySah(appKey: string, key: string): boolean {
  return infoMenu(appKey, key) !== null
}

export { semuaKeyMenu } from '@/lib/registry/menu-apps'

// ── Cache ────────────────────────────────────────────────────────────────────
// Tabel ini dibaca hampir tiap panggilan API. Cache dibersihkan saat admin
// menyimpan, TAPI hanya di proses yang menyimpan — di belakang PM2 cluster,
// pekerja lain tidak ikut tahu. Karena itu ada TTL pendek: pencabutan akses
// terlambat paling lama 15 detik, bukan sampai orangnya login ulang. Itu
// alasan yang sama kenapa `app_access` tidak boleh dititipkan ke JWT (§4.3).
const TTL_MS = 15_000

/**
 * Yang disimpan JANJI-nya, bukan hasilnya — dan itu yang membuat lima puluh
 * permintaan berbarengan cukup menghasilkan satu query, bukan lima puluh. Kalau
 * yang disimpan hasilnya, semuanya sudah telanjur meleset sebelum yang pertama
 * sempat mengisi cache (serbuan bersamaan / *cache stampede*).
 */
type Kotak<T> = { isi: Promise<T>; kedaluwarsa: number }
type Rak = Map<string, Kotak<Map<string, Izin>>>

const cachePeran: Rak = new Map()
const cacheOrang: Rak = new Map()

function masihSegar<T>(k: Kotak<T> | undefined): k is Kotak<T> {
  return !!k && k.kedaluwarsa > Date.now()
}

export function bersihkanCacheIzin(): void {
  cachePeran.clear()
  cacheOrang.clear()
}

/**
 * Pemasangan kotak WAJIB terjadi sebelum `await` pertama — kalau tidak, celah yang
 * mau ditutup justru terbuka lagi di antara "mulai membaca" dan "menyimpan hasil".
 * Karena itu fungsi ini sengaja BUKAN `async`.
 */
function lewatCache(
  rak: Rak, kunci: string, ambil: () => Promise<Map<string, Izin>>,
): Promise<Map<string, Izin>> {
  const ada = rak.get(kunci)
  if (masihSegar(ada)) return ada.isi

  const janji = ambil()
  const kotak: Kotak<Map<string, Izin>> = { isi: janji, kedaluwarsa: Date.now() + TTL_MS }
  rak.set(kunci, kotak)
  // Kegagalan jangan ikut mengendap 15 detik: DB putus sedetik akan jadi "ditolak"
  // selama seperempat menit bagi semua orang. Dibuang hanya kalau kotak ini masih
  // yang terpasang — kalau sudah diganti pembacaan yang lebih baru, jangan disentuh.
  janji.catch(() => { if (rak.get(kunci) === kotak) rak.delete(kunci) })
  return janji
}

function petaDariBaris(appKey: string, rows: Array<{ menu_key: string; izin: string }>): Map<string, Izin> {
  const peta = new Map<string, Izin>()
  for (const r of rows) if (isIzin(r.izin) && keySah(appKey, r.menu_key)) peta.set(r.menu_key, r.izin)
  return peta
}

/**
 * Sidik jari keadaan tersimpan — dipakai kunci optimistik saat menyimpan (L48).
 * Dua admin membuka layar yang sama lalu menyimpan berurutan: yang kedua ditolak 409
 * ketimbang menghapus diam-diam perubahan yang pertama. Bentuknya sengaja teks biasa
 * supaya bisa dibaca manusia di log kalau ada yang perlu ditelusuri.
 */
export function sidikJariIzin(peta: Map<string, Izin>): string {
  if (peta.size === 0) return '-'
  return [...peta].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join(',')
}

// ── Baca ─────────────────────────────────────────────────────────────────────

/** Izin yang diatur admin untuk satu peran. Kosong = seluruhnya ikut bawaan kode. */
export function getIzinPeran(appKey: string, role: string): Promise<Map<string, Izin>> {
  return lewatCache(cachePeran, `${appKey}\0${role}`, async () => petaDariBaris(appKey,
    await sql`
    SELECT menu_key, izin FROM menu_role_access
    WHERE app_key = ${appKey} AND role = ${role}
  ` as Array<{ menu_key: string; izin: string }>
  ))
}

/** Perkecualian untuk satu orang. Kosong = orang itu mengikuti perannya. */
export function getIzinOrang(userId: number, appKey: string): Promise<Map<string, Izin>> {
  return lewatCache(cacheOrang, `${userId}\0${appKey}`, async () => petaDariBaris(appKey,
    await sql`
    SELECT menu_key, izin FROM menu_user_access
    WHERE user_id = ${userId} AND app_key = ${appKey}
  ` as Array<{ menu_key: string; izin: string }>
  ))
}

/**
 * Penimpa untuk satu menu: perkecualian orang menang atas aturan peran.
 * `null` berarti tidak ada yang mengatur — pemanggil memakai bawaan dari kode.
 */
export async function getPenimpa(
  userId: number, role: string, appKey: string, menuKey: string,
): Promise<Izin | null> {
  const [orang, peran] = await Promise.all([
    getIzinOrang(userId, appKey),
    getIzinPeran(appKey, role),
  ])
  return orang.get(menuKey) ?? peran.get(menuKey) ?? null
}

/** Semua penimpa satu modul sekaligus — untuk layar yang butuh 12 menu dalam sekali baca. */
export async function getPetaPenimpa(
  userId: number, role: string, appKey: string,
): Promise<Map<string, Izin>> {
  const [orang, peran] = await Promise.all([
    getIzinOrang(userId, appKey),
    getIzinPeran(appKey, role),
  ])
  const gabung = new Map<string, Izin>(peran)
  for (const [k, v] of orang) gabung.set(k, v)
  return gabung
}

// ── Tulis ────────────────────────────────────────────────────────────────────
// Ganti-semua per (peran) atau per (orang, modul): DELETE + bulkInsert dalam satu
// transaksi. Peta kosong = hapus seluruh barisnya = "kembalikan ke bawaan".
// Key yang tidak dikenal registry dibuang di sini — itu satu-satunya pembersihan
// yang dibutuhkan sisa menu lama (§5), dan ia jalan saat datanya memang disentuh.

function bersihkanPeta(appKey: string, peta: Map<string, Izin>): Array<[string, Izin]> {
  return [...peta].filter(([k, v]) => keySah(appKey, k) && isIzin(v))
}

/** Ditolak sebelum menulis kalau keadaan tersimpan sudah berubah sejak layar dimuat. */
export class IzinBerubahError extends Error {
  constructor(public readonly sekarang: string) {
    super('Pengaturan ini baru saja diubah orang lain.')
    this.name = 'IzinBerubahError'
  }
}

/**
 * Kunci penulisan; mekanismenya di `lib/data/locks.ts`. Tabelnya `blud_locks` —
 * namanya menyebut BLUD tapi bentuknya umum `(entity, key_id)`, dan membuat tabel
 * kunci kedua untuk pola yang sama justru menambah tempat yang harus dijaga tetap
 * benar. Nama tabel sengaja tidak diganti: enam modul sudah memakainya.
 *
 * Kenapa perlu kunci padahal sudah ada sidik jari: **L69-a**. Keadaan awal kedua tabel
 * izin adalah KOSONG, dan `SELECT … FOR UPDATE` pada baris yang belum ada tidak
 * mengunci apa pun. Tanpa baris kunci yang dipastikan ada lebih dulu, dua admin yang
 * sama-sama melihat "belum diatur" akan sama-sama lolos pemeriksaan sidik jari lalu
 * sama-sama menulis — dan yang belakangan menghapus pekerjaan yang duluan tanpa suara.
 */
const KUNCI_IZIN = 'menu_access'

/**
 * URUTAN PENGUNCIAN, kalau suatu saat satu transaksi menyentuh KEDUA tabel:
 * **peran dulu, baru orang** — `${appKey}:role:*` sebelum `${appKey}:user:*`.
 *
 * Hari ini aturan itu belum berlaku: tiap penyimpanan mengambil TEPAT SATU kunci, jadi
 * lingkaran tunggu mustahil dengan sendirinya. Ia baru berlaku pada hari ada aksi
 * gabungan — misalnya "terapkan aturan peran ini, lalu bersihkan perkecualian orang di
 * bawahnya". Ditulis sekarang, saat alasannya masih segar, bukan nanti saat orang
 * sudah harus menebak kenapa urutannya penting.
 *
 * Kenapa urutan itu: searah dengan pewarisan izin (perkecualian orang menang atas
 * aturan peran, jadi peran ditetapkan lebih dulu), dan kebetulan juga urutan key
 * menaik — `role` < `user` secara leksikal. Mengunci menurut urutan key menaik itu
 * yang membuat dua transaksi tidak pernah bisa saling menunggu (dibuktikan T8a/T8b di
 * `scripts/concurrency-test.js`).
 */
const kunciPeran = (appKey: string, role: string) => `${appKey}:role:${role}`
const kunciOrang = (appKey: string, userId: number) => `${appKey}:user:${userId}`

export async function simpanIzinPeran(
  appKey: string, role: string, peta: Map<string, Izin>, updatedBy: number, sidikJariHarap?: string,
): Promise<void> {
  const baris = bersihkanPeta(appKey, peta)
  await withTransaction(async ({ tx, conn }) => {
    await acquireBludLock(tx, KUNCI_IZIN, kunciPeran(appKey, role))
    // Dibaca DI DALAM transaksi lewat `tx` — kalau memakai koneksi lain (atau cache),
    // pemeriksaannya membaca keadaan yang bukan yang sedang dikunci (L69-b).
    if (sidikJariHarap !== undefined) {
      const kini = petaDariBaris(appKey, await tx`
        SELECT menu_key, izin FROM menu_role_access
        WHERE app_key = ${appKey} AND role = ${role} FOR UPDATE
      ` as Array<{ menu_key: string; izin: string }>)
      const sekarang = sidikJariIzin(kini)
      if (sekarang !== sidikJariHarap) throw new IzinBerubahError(sekarang)
    }
    await tx`DELETE FROM menu_role_access WHERE app_key = ${appKey} AND role = ${role}`
    if (baris.length > 0) {
      await bulkInsert(
        'menu_role_access',
        ['app_key', 'role', 'menu_key', 'izin', 'updated_by'],
        baris.map(([k, v]) => [appKey, role, k, v, updatedBy]),
        conn,
      )
    }
  })
  bersihkanCacheIzin()
}

/**
 * Buang seluruh perkecualian seseorang. Dua pemakainya, dan keduanya penting:
 *
 *   - **peran diganti** — perkecualian diberikan dalam konteks jabatan tertentu
 *     ("boleh ubah DPA selagi ia PROGRAM"). Membiarkannya menempel saat orangnya
 *     pindah ke jabatan lain membuat kewenangan ikut berpindah diam-diam;
 *   - **grant modul dicabut** — barisnya jadi yatim, dan hidup lagi tanpa ada yang
 *     ingat kalau grant-nya diberikan kembali setahun kemudian.
 *
 * Menerima `Penanya` supaya bisa ikut transaksi pemanggil — kalau ia memakai koneksi
 * sendiri, kunci di transaksi pemanggil tidak menjaga apa pun (L69-b).
 * Mengembalikan jumlah baris yang dibuang supaya pemanggil bisa mencatatnya di audit.
 */
export async function hapusIzinOrang(
  penanya: Penanya, userId: number, appKey?: string,
): Promise<number> {
  const rows = await penanya`
    SELECT menu_key FROM menu_user_access
    WHERE user_id = ${userId} ${appKey ? sql`AND app_key = ${appKey}` : sql``}
  ` as Array<{ menu_key: string }>
  if (rows.length === 0) return 0
  await penanya`
    DELETE FROM menu_user_access
    WHERE user_id = ${userId} ${appKey ? sql`AND app_key = ${appKey}` : sql``}
  `
  bersihkanCacheIzin()
  return rows.length
}

/** Berapa perkecualian yang dipegang orang ini — untuk peringatan sebelum ubah peran. */
export async function jumlahIzinOrang(userId: number): Promise<number> {
  const rows = await sql`
    SELECT COUNT(*) AS n FROM menu_user_access WHERE user_id = ${userId}
  ` as Array<{ n: number }>
  return Number(rows[0]?.n ?? 0)
}

export async function simpanIzinOrang(
  userId: number, appKey: string, peta: Map<string, Izin>, updatedBy: number, sidikJariHarap?: string,
): Promise<void> {
  const baris = bersihkanPeta(appKey, peta)
  await withTransaction(async ({ tx, conn }) => {
    await acquireBludLock(tx, KUNCI_IZIN, kunciOrang(appKey, userId))
    if (sidikJariHarap !== undefined) {
      const kini = petaDariBaris(appKey, await tx`
        SELECT menu_key, izin FROM menu_user_access
        WHERE user_id = ${userId} AND app_key = ${appKey} FOR UPDATE
      ` as Array<{ menu_key: string; izin: string }>)
      const sekarang = sidikJariIzin(kini)
      if (sekarang !== sidikJariHarap) throw new IzinBerubahError(sekarang)
    }
    await tx`DELETE FROM menu_user_access WHERE user_id = ${userId} AND app_key = ${appKey}`
    if (baris.length > 0) {
      await bulkInsert(
        'menu_user_access',
        ['user_id', 'app_key', 'menu_key', 'izin', 'updated_by'],
        baris.map(([k, v]) => [userId, appKey, k, v, updatedBy]),
        conn,
      )
    }
  })
  bersihkanCacheIzin()
}
