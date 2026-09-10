// lib/admin/cabut-kedaluwarsa.ts — pencabutan otomatis akses berjangka (P2, Tahap 10).
// Konsep: docs/CONCEPT-pusat-akses-satu-pintu.md §12 P2.
//
// SATU aturan yang menentukan seluruh bentuk berkas ini: pencabutan otomatis **memanggil
// fungsi pencabutan yang sama** dengan pencabutan manual — `simpanBerkasOrang`. BUKAN
// `UPDATE users SET app_access` sendiri di dalam cron.
//
// Sebabnya bukan kerapian. Pencabutan yang benar bukan cuma membuang satu kunci dari
// larik: ia juga membuang perkecualian menu modul itu (kalau ditinggal, barisnya hidup
// kembali diam-diam saat grant-nya diberikan lagi), mengambil kunci per-modul menurut
// urutan menaik supaya tidak berebut dengan admin yang sedang menyimpan halaman orang
// yang sama, dan membuang tenggat yang ikut jadi yatim. Semua itu sudah berdiri di satu
// tempat. Jalur kedua yang menulis sendiri PASTI melewatkan salah satunya — itu L69,
// dan pembersihan perkecualian menu memang sudah pernah jadi korbannya.
//
// Berkas ini terpisah dari `akses-berjangka.ts` supaya lapisan datanya tidak membentuk
// lingkaran impor dengan `pusat-akses.ts`.

import { queryOne, sql } from '@/lib/data/db'
import { modul } from '@/lib/registry/apps'
import { addNotif } from '@/lib/services/notifications'
import { tanggalSingkat, sisaHari } from '@/lib/admin/berjangka-baris'
import {
  yangSudahLewat, yangPerluDiingatkan, tandaiSudahDiingatkan, type BarisJatuhTempo,
} from '@/lib/admin/akses-berjangka'
import { simpanBerkasOrang } from '@/lib/admin/pusat-akses'

const label = (appKey: string) => modul(appKey)?.label ?? appKey

export type HasilCabut = {
  dicabut: { userId: number; username: string; appKey: string; berakhir: string }[]
  diingatkan: number
  galat: string[]
}

/**
 * Dikerjakan PER ORANG, bukan per baris tenggat.
 *
 * Dua tenggat milik orang yang sama yang lewat di hari yang sama akan menghasilkan dua
 * panggilan simpan yang saling menimpa kalau dikerjakan satu per satu: yang kedua
 * membaca `app_access` yang sudah dibaca sebelum yang pertama menulis, lalu
 * mengembalikan kunci yang barusan dicabut. Digabung dulu, sekali simpan.
 */
export async function cabutYangLewat(): Promise<HasilCabut> {
  const hasil: HasilCabut = { dicabut: [], diingatkan: 0, galat: [] }

  const lewat = await yangSudahLewat()
  const perOrang = new Map<number, BarisJatuhTempo[]>()
  for (const b of lewat) perOrang.set(b.userId, [...(perOrang.get(b.userId) ?? []), b])

  for (const [userId, baris] of perOrang) {
    try {
      const u = await queryOne<{ role: string; app_access: unknown }>(
        sql`SELECT role, app_access FROM users WHERE id = ${userId} LIMIT 1`,
      )
      if (!u) continue
      const punya = Array.isArray(u.app_access) ? (u.app_access as string[]) : []
      const dibuang = new Set(baris.map((b) => b.appKey))
      const sisa = punya.filter((k) => !dibuang.has(k))

      await simpanBerkasOrang({
        userId,
        role: u.role,
        roleAwal: u.role,
        appAccess: sisa,
        // Kosong, dan itu bukan kelalaian: `simpanBerkasOrang` hanya menulis
        // perkecualian menu untuk modul yang DISEBUT di sini. Mengirim peta kosong
        // berarti "jangan sentuh menu apa pun" — sementara pembersihan menu milik modul
        // yang pintunya baru saja tertutup tetap jalan, karena itu bagian dari
        // pencabutannya, bukan bagian dari kiriman layar.
        menu: {},
        versi: {},
        alasan: `Akses berjangka kedaluwarsa: ${baris.map((b) => `${label(b.appKey)} s/d ${tanggalSingkat(b.berakhir)}`).join(', ')}`,
        // Tenggat yang tersisa dikirim ulang apa adanya supaya tidak ikut terhapus;
        // yang lewat sengaja TIDAK ikut, jadi barisnya lenyap bersama grant-nya.
        berjangka: Object.fromEntries(
          (await sisaTenggat(userId, dibuang)).map((r) => [r.appKey, { berakhir: r.berakhir, alasan: r.alasan }]),
        ),
        olehUserId: null,
      })

      for (const b of baris) {
        hasil.dicabut.push({ userId, username: b.username, appKey: b.appKey, berakhir: b.berakhir })
        // Yang kehilangan akses harus tahu KENAPA dan sejak kapan — kalau tidak, yang
        // sampai ke admin besok pagi adalah "aplikasinya rusak".
        await addNotif(
          b.username, b.role, 'AKSES_KEDALUWARSA',
          `Akses ${label(b.appKey)} berakhir ${tanggalSingkat(b.berakhir)} dan sudah dicabut otomatis. Hubungi Super Admin bila masih dibutuhkan.`,
        )
      }
    } catch (e) {
      hasil.galat.push(`user ${userId}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  return hasil
}

/** Tenggat milik orang itu yang TIDAK sedang dicabut — dibaca ulang di luar transaksi. */
async function sisaTenggat(userId: number, dibuang: Set<string>) {
  const rows = await sql`
    SELECT app_key, berakhir_pada, alasan FROM akses_kedaluwarsa WHERE user_id = ${userId}
  ` as { app_key: string; berakhir_pada: unknown; alasan: string }[]
  return rows
    .filter((r) => !dibuang.has(r.app_key))
    .map((r) => ({
      appKey: r.app_key,
      berakhir: r.berakhir_pada instanceof Date
        ? `${r.berakhir_pada.getFullYear()}-${String(r.berakhir_pada.getMonth() + 1).padStart(2, '0')}-${String(r.berakhir_pada.getDate()).padStart(2, '0')}`
        : String(r.berakhir_pada ?? '').slice(0, 10),
      alasan: r.alasan,
    }))
}

/**
 * Pengingat H-3 ke pemegang DAN ke SUPER_ADMIN.
 *
 * Ke SUPER_ADMIN juga, bukan cuma ke pemegangnya: yang bisa memperpanjang hanya dia
 * (Pusat Akses SUPER_ADMIN saja sejak T-16), jadi pengingat yang hanya sampai ke
 * pemegang berujung pada percakapan WhatsApp — persis antrean yang seluruh konsep ini
 * pindahkan ke dalam aplikasi.
 *
 * `hariIni` DIOPER, tidak dibaca sendiri di sini: ia datang dari `tanggalServer()`,
 * sumber yang sama dengan penyaring barisnya.
 */
export async function ingatkanYangHampirHabis(hariIni: string): Promise<number> {
  const baris = await yangPerluDiingatkan()
  if (baris.length === 0) return 0

  for (const b of baris) {
    const sisa = sisaHari(b.berakhir, hariIni)
    const kapan = sisa === null ? tanggalSingkat(b.berakhir)
      : sisa <= 0 ? `hari ini (${tanggalSingkat(b.berakhir)})`
      : `${sisa} hari lagi (${tanggalSingkat(b.berakhir)})`
    await addNotif(
      b.username, b.role, 'AKSES_AKAN_BERAKHIR',
      `Akses ${label(b.appKey)} Anda berakhir ${kapan}. Hubungi Super Admin bila masih dibutuhkan.`,
    )
    // Antrean SUPER_ADMIN saja (`__SUPER_ADMIN__`), BUKAN `buildNotifRecipients`.
    // Helper itu ikut menyiarkan ke antrean ADMIN/KASUBAG/KABAG dan mengulang nama
    // pemegangnya sendiri — padahal yang bisa memperpanjang akses hanya SUPER_ADMIN
    // sejak T-16. Pengingat yang sampai ke orang yang tidak bisa menindaklanjutinya
    // cuma menambah bunyi, dan bunyi yang tidak bisa ditindaklanjuti diabaikan.
    await addNotif(
      '__SUPER_ADMIN__', 'SUPER_ADMIN', 'AKSES_AKAN_BERAKHIR',
      `Akses ${label(b.appKey)} milik ${b.username} berakhir ${kapan}. Alasan peminjaman: ${b.alasan}`,
    )
  }

  // Distempel SESUDAH notifikasinya dibuat. Terbalik, satu galat di tengah membuat
  // barisnya tercatat "sudah diingatkan" padahal tidak ada yang pernah sampai.
  await tandaiSudahDiingatkan(baris.map((b) => b.id))
  return baris.length
}
