// lib/admin/akses-berjangka.ts — tabel `akses_kedaluwarsa` (P2, Tahap 10).
// Konsep: docs/CONCEPT-pusat-akses-satu-pintu.md §12 P2.
//
// SERVER-ONLY, dan SENGAJA hanya menyentuh tabelnya sendiri. Yang mencabut aksesnya
// tinggal di `cabut-kedaluwarsa.ts` — kalau orkestrasi itu ditaruh di sini, berkas ini
// harus mengimpor `pusat-akses.ts` yang justru mengimpor berkas ini untuk menulis
// tenggat di dalam transaksinya. Lingkaran impor di lapisan data adalah bentuk yang
// paling sulit dilihat sampai ia meledak saat build.

import { sql, sqlInt, type Penanya } from '@/lib/data/db'
import { HARI_PERINGATAN, type BarisBerjangka } from '@/lib/admin/berjangka-baris'

export { HARI_PERINGATAN, type BarisBerjangka }

export type JangkaTersimpan = Record<string, { berakhir: string; alasan: string }>

/** `Date` MySQL → `YYYY-MM-DD` tanpa lewat zona waktu peramban. */
function keIso(v: unknown): string {
  if (v instanceof Date) {
    const p = (n: number) => String(n).padStart(2, '0')
    return `${v.getFullYear()}-${p(v.getMonth() + 1)}-${p(v.getDate())}`
  }
  return String(v ?? '').slice(0, 10)
}

export async function bacaJangka(userId: number): Promise<JangkaTersimpan> {
  const rows = await sql`
    SELECT app_key, berakhir_pada, alasan FROM akses_kedaluwarsa WHERE user_id = ${userId}
  ` as { app_key: string; berakhir_pada: unknown; alasan: string }[]
  const out: JangkaTersimpan = {}
  for (const r of rows) out[r.app_key] = { berakhir: keIso(r.berakhir_pada), alasan: r.alasan }
  return out
}

/**
 * Setel tenggat seorang pemakai ke keadaan yang dikirim — di dalam transaksi PEMANGGIL.
 *
 * Yang dikirim adalah keadaan LENGKAP, jadi tenggat yang hilang dari kiriman memang
 * berarti dicabut. Tapi baris yang isinya TIDAK BERGESER sama sekali tidak disentuh, dan
 * itu bukan penghematan — dua kolomnya akan berbohong kalau ditulis ulang:
 *
 *   · `dibuat_oleh` berganti jadi siapa pun yang kebetulan menekan Simpan terakhir,
 *     padahal yang ditanyakan orang adalah SIAPA YANG MEMINJAMKAN akses itu;
 *   · `diingatkan_pada` kembali NULL, jadi pengingat H-3 berbunyi lagi tiap kali ada
 *     yang menyimpan halaman orang itu untuk urusan yang sama sekali lain. Pengingat
 *     yang berulang tanpa sebab persis cara melatih orang mengabaikannya.
 *
 * Yang BERGESER memang harus menyetel ulang `diingatkan_pada`: tenggat baru = pengingat
 * baru.
 */
export async function tulisJangkaTx(
  tx: Penanya, userId: number, baris: readonly BarisBerjangka[], olehUserId: number | null,
): Promise<{ ditulis: number; dihapus: number }> {
  const lama = await tx`
    SELECT app_key, berakhir_pada, alasan FROM akses_kedaluwarsa
    WHERE user_id = ${userId} FOR UPDATE
  ` as { app_key: string; berakhir_pada: unknown; alasan: string }[]
  const petaLama = new Map(lama.map((r) => [r.app_key, { berakhir: keIso(r.berakhir_pada), alasan: r.alasan }]))

  const kunciBaru = new Set(baris.map((b) => b.appKey))
  const dibuang = lama.filter((r) => !kunciBaru.has(r.app_key)).map((r) => r.app_key)
  for (const appKey of dibuang) {
    await tx`DELETE FROM akses_kedaluwarsa WHERE user_id = ${userId} AND app_key = ${appKey}`
  }

  let ditulis = 0
  for (const b of baris) {
    const l = petaLama.get(b.appKey)
    if (l && l.berakhir === b.berakhir && l.alasan === b.alasan) continue
    await tx`
      INSERT INTO akses_kedaluwarsa (user_id, app_key, berakhir_pada, alasan, dibuat_oleh)
      VALUES (${userId}, ${b.appKey}, ${b.berakhir}, ${b.alasan}, ${olehUserId})
      ON DUPLICATE KEY UPDATE
        berakhir_pada = VALUES(berakhir_pada), alasan = VALUES(alasan),
        dibuat_oleh = VALUES(dibuat_oleh), dibuat_pada = NOW(), diingatkan_pada = NULL
    `
    ditulis++
  }
  return { ditulis, dihapus: dibuang.length }
}

export type BarisJatuhTempo = {
  id: number
  userId: number
  username: string
  role: string
  appKey: string
  berakhir: string
  alasan: string
}

function petakan(rows: unknown[]): BarisJatuhTempo[] {
  return (rows as {
    id: number; user_id: number; username: string; role: string
    app_key: string; berakhir_pada: unknown; alasan: string
  }[]).map((r) => ({
    id: Number(r.id), userId: Number(r.user_id), username: r.username, role: r.role,
    appKey: r.app_key, berakhir: keIso(r.berakhir_pada), alasan: r.alasan,
  }))
}

/**
 * Yang tenggatnya SUDAH LEWAT — bukan "yang jatuh tempo hari ini".
 *
 * Bedanya menentukan: server PRIMA adalah laptop kantor yang dimatikan tiap malam, jadi
 * cron bisa tidak jalan sehari penuh. Kueri "jatuh tempo hari ini" akan melewatkan
 * seluruh baris hari itu dan TIDAK PERNAH menengoknya lagi — aksesnya hidup selamanya,
 * tanpa satu pun gejala. `< CURDATE()` menyapu semua yang tertinggal berapa pun lamanya.
 *
 * `CURDATE()` = tanggal server MySQL, bukan jam peramban maupun jam Node: yang menentukan
 * kapan sebuah akses mati tidak boleh bergantung pada mesin siapa yang bertanya.
 */
export async function yangSudahLewat(): Promise<BarisJatuhTempo[]> {
  const rows = await sql`
    SELECT k.id, k.user_id, u.username, u.role, k.app_key, k.berakhir_pada, k.alasan
    FROM akses_kedaluwarsa k JOIN users u ON u.id = k.user_id
    WHERE k.berakhir_pada < CURDATE()
    ORDER BY k.user_id, k.app_key
  `
  return petakan(rows as unknown[])
}

/**
 * Yang perlu diingatkan: sisa ≤ HARI_PERINGATAN, belum lewat, dan belum pernah dikirimi.
 *
 * Sekali lagi bukan "tepat H-3". Hari itu mungkin memang tidak pernah terjadi buat cron
 * yang laptopnya sedang mati, dan pengingat yang hilang mengubah pencabutan otomatis
 * jadi kejutan — persis yang fitur ini hindari.
 */
export async function yangPerluDiingatkan(): Promise<BarisJatuhTempo[]> {
  const rows = await sql`
    SELECT k.id, k.user_id, u.username, u.role, k.app_key, k.berakhir_pada, k.alasan
    FROM akses_kedaluwarsa k JOIN users u ON u.id = k.user_id
    WHERE k.diingatkan_pada IS NULL
      AND k.berakhir_pada >= CURDATE()
      AND k.berakhir_pada <= CURDATE() + INTERVAL ${sqlInt(HARI_PERINGATAN)} DAY
    ORDER BY k.berakhir_pada, k.user_id
  `
  return petakan(rows as unknown[])
}

/**
 * Tanggal menurut server MySQL — sumber yang SAMA dengan yang menyaring barisnya.
 *
 * Kalau kalimat "3 hari lagi" dihitung dari jam Node sementara barisnya dipilih
 * `CURDATE()`, keduanya bisa berbeda hari dan pengingatnya berbunyi "0 hari lagi" untuk
 * tenggat yang menurut penyaringnya masih tiga hari lagi. Satu pertanyaan, satu jawaban.
 */
export async function tanggalServer(): Promise<string> {
  const rows = await sql`SELECT CURDATE() AS d` as { d: unknown }[]
  return keIso(rows[0]?.d)
}

/** Distempel SESUDAH notifikasinya benar-benar dibuat — terbalik = pengingat yang hilang diam-diam. */
export async function tandaiSudahDiingatkan(ids: readonly number[]): Promise<void> {
  if (ids.length === 0) return
  await sql`UPDATE akses_kedaluwarsa SET diingatkan_pada = CURDATE() WHERE id IN (${[...ids]})`
}
