// lib/admin/pusat-akses.ts — berkas satu orang: peran, pintu modul, izin menu, jejak.
// Konsep: docs/CONCEPT-pusat-akses-satu-pintu.md §4.5, §16.4 (Tahap 5 / Fase C).
//
// Sebelum berkas ini ada, mengatur SATU orang berarti: cari di tabel → tombol ATUR →
// modal centang → tutup → tombol MENU → modal kedua → pilih modul → tutup → tombol ROLE
// → modal ketiga. Tiga penyimpanan terpisah yang bisa berhenti di tengah, dan tidak satu
// layar pun yang bisa menjawab "apa yang sebenarnya bisa dilakukan orang ini".
//
// DUA hal yang dikerjakan berkas ini, dan keduanya menutup kebingungan yang sudah
// terdaftar sebagai temuan:
//
//   1. **Tiap pintu modul menyebut SEBABNYA** (§4.5a). Modal lama menampilkan sepuluh
//      centang tanpa membedakan "terbuka karena peran" dari "terbuka karena diberi
//      akses" — jadi mencabut centang pada seorang ADMIN terlihat seperti menutup
//      pintu, padahal ADMIN ada di `peranBawaan` delapan modul dan tidak ada yang
//      tertutup. Itu T-6. Layar yang menampilkan hasil tanpa sebab melatih orang
//      mengambil kesimpulan yang salah.
//   2. **Satu Simpan, satu transaksi.** Peran + pintu modul + perkecualian menu ditulis
//      bersama atau tidak sama sekali.
//
// Aturan pintunya TIDAK ditulis ulang di sini — ia memanggil `bolehMasukModul` yang
// sama dengan pagar sungguhannya. Yang ditambahkan cuma kalimat sebabnya. Layar yang
// menghitung aksesnya sendiri akan berbeda pendapat dengan pagarnya cepat atau lambat.

import { sql, sqlInt, queryOne, withTransaction, bulkInsert, type Penanya } from '@/lib/data/db'
import { getRoleQuota } from '@/lib/constants'
import { MENU_APP_KEYS, aplikasiMenu, izinMenuRegistry, type Izin } from '@/lib/registry/menu-apps'
import {
  getIzinOrang, getIzinPeran, sidikJariIzin, hapusIzinOrang, isIzin,
  IzinBerubahError, bersihkanCacheIzin,
} from '@/lib/data/menu-access'
import { acquireBludLock } from '@/lib/data/locks'
import { barisPintu, grantYangBerarti, type BerkasOrang, type BlokMenu } from '@/lib/admin/pintu-akses'
import { jangkaYangBerarti } from '@/lib/admin/berjangka-baris'
import { bacaJangka, tulisJangkaTx } from '@/lib/admin/akses-berjangka'
import { tutupYangSudahTerbukaTx, type PermintaanDitutup } from '@/lib/admin/permintaan-akses'
import { assertQuotaAvailableTx } from '@/lib/security/promotion'

// Aturan pintunya + bentuk berkasnya tinggal di `pintu-akses.ts` — berkas DAUN tanpa
// satu pun impor server. Berkas ini yang membaca DB, jadi ia TIDAK BOLEH jadi tempat
// tinggal apa pun yang dibutuhkan komponen `'use client'`: satu impor nilai dari sini
// menyeret mysql2 dan `next/headers` ke bundel peramban, dan halamannya balas 500
// dengan pesan yang menunjuk `auth.ts` alih-alih barisnya.
export {
  barisPintu, grantYangBerarti,
  type BarisPintu, type KeadaanPintu, type BlokMenu, type BerkasOrang,
} from '@/lib/admin/pintu-akses'

// ─── Berkas orang (baca) ─────────────────────────────────────────────────────

type BarisUser = BerkasOrang['user']

export async function berkasOrang(userId: number): Promise<BerkasOrang | null> {
  const u = await queryOne<BarisUser & { app_access: unknown }>(sql`
    SELECT id, username, nama_lengkap, email, role, status, last_login, created_at,
           promotion_locked_until, probationary_until, probationary_from_role,
           deleted_at, app_access
    FROM users WHERE id = ${userId} LIMIT 1
  `)
  if (!u) return null

  const appAccess = Array.isArray(u.app_access) ? (u.app_access as string[]).filter((k) => typeof k === 'string') : []
  const pintu = barisPintu(u.role, appAccess)
  const terbuka = new Set(pintu.filter((p) => p.terbuka).map((p) => p.kunci))

  const [jangka, sesi, hitungPeran, waktu, ...blokMentah] = await Promise.all([
    bacaJangka(userId),
    queryOne<{ n: number }>(sql`
      SELECT COUNT(*) AS n FROM user_sessions
      WHERE user_id = ${userId} AND invalidated_at IS NULL
    `),
    queryOne<{ n: number }>(sql`
      SELECT COUNT(*) AS n FROM users
      WHERE role = ${u.role} AND status = 'AKTIF' AND deleted_at IS NULL
    `),
    queryOne<{ kunci: number; coba: number }>(sql`
      SELECT
        (promotion_locked_until IS NOT NULL AND promotion_locked_until > NOW()) AS kunci,
        (probationary_until     IS NOT NULL AND probationary_until     > NOW()) AS coba
      FROM users WHERE id = ${userId} LIMIT 1
    `),
    // Menu hanya dibaca untuk modul yang pintunya TERBUKA. Menu yang diatur untuk orang
    // yang pintunya tertutup tidak berarti apa-apa (§4.5b) — menampilkannya menjanjikan
    // sesuatu yang tidak akan terjadi.
    ...MENU_APP_KEYS.filter((a) => terbuka.has(a)).map((a) => blokMenu(userId, u.role, a)),
  ])

  const { app_access: _buang, ...bersih } = u
  void _buang
  return {
    user: bersih,
    sesiAktif: Number(sesi?.n ?? 0),
    promosiTerkunci: Number(waktu?.kunci ?? 0) === 1,
    masaPercobaan: Number(waktu?.coba ?? 0) === 1,
    kuota: { peran: u.role, terpakai: Number(hitungPeran?.n ?? 0), kuota: getRoleQuota(u.role) },
    pintu,
    menu: blokMentah as BlokMenu[],
    appAccess,
    jangka,
  }
}

async function blokMenu(userId: number, role: string, appKey: string): Promise<BlokMenu> {
  const [peran, orang] = await Promise.all([getIzinPeran(appKey, role), getIzinOrang(userId, appKey)])
  const menus = aplikasiMenu(appKey)?.menus ?? []
  const efektif: Record<string, Izin> = {}
  const bawaanPeran: Record<string, Izin> = {}
  for (const { key } of menus) {
    const hasil = izinMenuRegistry(appKey, key, role, orang.get(key) ?? peran.get(key) ?? null)
    // "Bawaan peran" = kode + apa pun yang sudah diatur untuk peran itu. Itulah yang
    // dipulihkan tombol "Ikut bawaan peran", jadi angkanya harus sama persis.
    const bawaan = izinMenuRegistry(appKey, key, role, peran.get(key) ?? null)
    if (hasil) efektif[key] = hasil
    if (bawaan) bawaanPeran[key] = bawaan
  }
  return {
    appKey,
    label: aplikasiMenu(appKey)?.label ?? appKey,
    menus,
    efektif,
    bawaanPeran,
    orang: Object.fromEntries(orang),
    versi: sidikJariIzin(orang),
  }
}

// ─── Jejak kepemilikan (C5 / T-12) ───────────────────────────────────────────

export type Jejak = {
  /** Baris yang kolom pemiliknya jadi NULL — datanya tetap ada, penulisnya hilang. */
  kehilanganPemilik: { tabel: string; kolom: string; jumlah: number }[]
  /** Baris yang IKUT TERHAPUS bersama akunnya. */
  ikutTerhapus: { tabel: string; kolom: string; jumlah: number }[]
  totalKehilangan: number
  totalTerhapus: number
}

/**
 * Berapa baris yang akan kehilangan pemiliknya kalau akun ini dihapus permanen.
 *
 * Daftar tabelnya **dibaca dari `information_schema`**, bukan diketik. Ada tiga puluhan
 * kolom yang menunjuk `users(id)` hari ini, dan daftar tangan yang menyebutkan sebagian
 * di antaranya akan memberi angka yang terlihat pasti tapi terlalu kecil — jenis
 * kesalahan yang paling sulit ketahuan, karena angkanya tetap masuk akal. Tabel baru
 * ikut terhitung sejak hari ia lahir, tanpa ada yang perlu mengingatnya.
 *
 * `ON DELETE SET NULL` dan `CASCADE` dipisah karena akibatnya berbeda: yang pertama
 * menyisakan datanya tanpa penulis, yang kedua membuangnya. Menggabungkan keduanya jadi
 * satu angka membuat yang paling berat justru tidak kelihatan.
 */
const IDENTIFIER = /^[A-Za-z0-9_]+$/

/**
 * Satu `COUNT(*)` pada kolom yang namanya baru diketahui saat berjalan.
 *
 * Nama tabel & kolom datang dari `information_schema`, bukan dari permintaan — tapi ia
 * tetap masuk ke teks kuerinya, karena identifier tidak bisa jadi placeholder di mysql2.
 * Jadi bentuknya disaring (`IDENTIFIER`) sebelum sampai ke sini, dan `userId` tetap
 * lewat placeholder. "Sumbernya tepercaya" bukan alasan yang bertahan pada hari berkas
 * ini disalin ke tempat lain.
 *
 * `sql` sebuah tagged template, jadi potongannya disusun tangan: dua bagian teks
 * mengapit satu nilai. Dibungkus fungsi bernama supaya bentuknya terbaca sebagai
 * sesuatu yang disengaja.
 */
async function hitungKolom(tabel: string, kolom: string, userId: number): Promise<number> {
  const potong = [`SELECT COUNT(*) AS n FROM \`${tabel}\` WHERE \`${kolom}\` = `, ''] as unknown as TemplateStringsArray
  const rows = await sql(potong, userId) as { n: number | string }[]
  return Number(rows[0]?.n ?? 0)
}

export async function hitungJejakOrang(userId: number): Promise<Jejak> {
  const kolom = await sql`
    SELECT k.TABLE_NAME AS tabel, k.COLUMN_NAME AS kolom, r.DELETE_RULE AS aturan
    FROM information_schema.KEY_COLUMN_USAGE k
    JOIN information_schema.REFERENTIAL_CONSTRAINTS r
      ON r.CONSTRAINT_SCHEMA = k.CONSTRAINT_SCHEMA AND r.CONSTRAINT_NAME = k.CONSTRAINT_NAME
    WHERE k.CONSTRAINT_SCHEMA = DATABASE()
      AND k.REFERENCED_TABLE_NAME = 'users' AND k.REFERENCED_COLUMN_NAME = 'id'
    ORDER BY k.TABLE_NAME, k.COLUMN_NAME
  ` as { tabel: string; kolom: string; aturan: string }[]

  const hasil = await Promise.all(kolom.map(async (k) => {
    if (!IDENTIFIER.test(k.tabel) || !IDENTIFIER.test(k.kolom)) return null
    return { tabel: k.tabel, kolom: k.kolom, aturan: k.aturan, jumlah: await hitungKolom(k.tabel, k.kolom, userId) }
  }))

  const isi = hasil.filter((h): h is NonNullable<typeof h> => h !== null && h.jumlah > 0)
  const kehilanganPemilik = isi.filter((h) => h.aturan === 'SET NULL').map(({ tabel, kolom, jumlah }) => ({ tabel, kolom, jumlah }))
  const ikutTerhapus = isi.filter((h) => h.aturan === 'CASCADE').map(({ tabel, kolom, jumlah }) => ({ tabel, kolom, jumlah }))
  return {
    kehilanganPemilik,
    ikutTerhapus,
    totalKehilangan: kehilanganPemilik.reduce((a, b) => a + b.jumlah, 0),
    totalTerhapus: ikutTerhapus.reduce((a, b) => a + b.jumlah, 0),
  }
}

// ─── Simpan (satu transaksi) ─────────────────────────────────────────────────

/**
 * P9 — perubahan wewenang tanpa alasan ditolak, dan yang memutuskan "berubah atau tidak"
 * SERVER, dari baris yang sudah dikunci `FOR UPDATE`.
 *
 * Bukan klien: klien tidak tahu keadaan tersimpan yang sebenarnya (grant lama tidak
 * pernah dikirim balik), jadi "apakah ini perubahan" yang dihitung di sana adalah tebakan
 * yang bisa meleset tepat pada kasus yang paling perlu dicatat — dua admin menyunting
 * orang yang sama.
 *
 * Dilempar DI DALAM transaksi, jadi apa pun yang sudah ditulis ikut dibatalkan.
 */
export class AlasanWajibError extends Error {
  constructor(public readonly yangBerubah: string) {
    super(`Sebutkan alasannya — ${yangBerubah} akan berubah.`)
    this.name = 'AlasanWajibError'
  }
}

export class PeranBerubahError extends Error {
  constructor() {
    super('Peran orang ini sudah diubah dari layar lain. Muat ulang dulu.')
    this.name = 'PeranBerubahError'
  }
}

export type PermintaanSimpan = {
  userId: number
  /** Peran tujuan. Sama dengan peran sekarang = tidak diubah. */
  role: string
  appAccess: string[]
  /** Perkecualian menu per modul. Modul yang tidak disebut = tidak disentuh. */
  menu: Record<string, Record<string, Izin>>
  /** Sidik jari per modul dari GET — pemeriksaan bentrok dua admin. */
  versi: Record<string, string>
  /** P9 — wajib kalau peran atau pintu modulnya bergeser; diperiksa di dalam transaksi. */
  alasan?: string
  /**
   * P2 — tenggat per modul. Modul yang tidak disebut berarti tanpa batas waktu, jadi
   * menghilangkan sebuah kunci dari sini MENCABUT tenggatnya (bukan membiarkannya).
   */
  berjangka?: Record<string, { berakhir: string; alasan: string }>
  /** Peran yang dilihat layar saat dimuat. Beda = layar sudah basi. */
  roleAwal: string
  /**
   * `null` = tidak ada manusia di baliknya — cron pencabutan kedaluwarsa. Sengaja
   * dibedakan dari sebuah id: menuliskan id seseorang pada baris yang ditulis mesin
   * membuat jejaknya menuduh orang yang tidak melakukan apa-apa.
   */
  olehUserId: number | null
}

export type HasilSimpan = {
  peranBerubah: { dari: string; ke: string } | null
  grantDitambah: string[]
  grantDicabut: string[]
  izinDihapus: number
  modulMenuDitulis: string[]
  jangkaDitulis: number
  jangkaDihapus: number
  /**
   * P4 — permintaan yang ikut terjawab oleh simpanan ini. Dipulangkan, BUKAN
   * diberitahukan dari dalam: pemohon harus dikabari dan jejaknya harus ditulis, dan
   * dua-duanya tidak boleh jalan di dalam transaksi yang masih bisa dibatalkan.
   */
  permintaanDisetujui: PermintaanDitutup[]
}

/**
 * Satu transaksi untuk seluruh halaman.
 *
 * URUTAN PENGUNCIAN mengikuti aturan yang sudah tertulis di `lib/data/menu-access.ts`:
 * kunci diambil menurut nama key MENAIK, supaya dua transaksi tidak pernah bisa saling
 * menunggu. Berkas itu menulis aturannya saat belum ada pemakainya, "saat alasannya
 * masih segar" — inilah hari yang disebutnya.
 */
export async function simpanBerkasOrang(p: PermintaanSimpan): Promise<HasilSimpan> {
  const hasil: HasilSimpan = {
    peranBerubah: null, grantDitambah: [], grantDicabut: [], izinDihapus: 0, modulMenuDitulis: [],
    jangkaDitulis: 0, jangkaDihapus: 0, permintaanDisetujui: [],
  }

  await withTransaction(async ({ tx, conn }) => {
    // Dibaca lewat `tx`, bukan `queryOne` — `queryOne` memakai koneksi pool sendiri, dan
    // barisnya jadi tidak terkunci oleh transaksi ini (L69-b).
    const baris = await tx`
      SELECT role, username, app_access FROM users WHERE id = ${p.userId} FOR UPDATE
    ` as { role: string; username: string; app_access: unknown }[]
    const target = baris[0]
    if (!target) throw new Error('User tidak ditemukan.')
    // Layar yang dimuat saat orangnya masih PROGRAM lalu disimpan setelah orang lain
    // memindahkannya ke KEUANGAN akan menulis izin menu milik jabatan yang sudah
    // ditinggalkan. Sidik jari menu tidak menangkap ini — ia menjawab pertanyaan lain.
    if (target.role !== p.roleAwal) throw new PeranBerubahError()

    const appAccessLama = Array.isArray(target.app_access) ? (target.app_access as string[]) : []
    const peranBaru = p.role
    const gantiPeran = peranBaru !== target.role

    // P9 — diperiksa SEBELUM satu baris pun ditulis. Menyimpan tanpa menggeser wewenang
    // (mis. cuma satu izin menu) tidak ditanya alasannya: pertanyaan yang muncul pada
    // aksi harian melatih orang mengetik "-" lalu terbawa ke aksi yang benar-benar
    // butuh dijelaskan.
    const grantCalon = grantYangBerarti(peranBaru, p.appAccess)
    const grantBergeser = [...grantCalon].sort().join(',') !== [...appAccessLama].sort().join(',')
    if ((gantiPeran || grantBergeser) && !p.alasan) {
      throw new AlasanWajibError(gantiPeran && grantBergeser ? 'peran dan pintu modul'
        : gantiPeran ? 'peran' : 'pintu modul')
    }

    // Kunci diambil lebih dulu, semuanya, menurut urutan key menaik.
    for (const appKey of [...MENU_APP_KEYS].sort()) {
      await acquireBludLock(tx, 'menu_access', `${appKey}:user:${p.userId}`)
    }

    if (gantiPeran) {
      await assertQuotaAvailableTx(peranBaru, tx)
      await tx`
        UPDATE users SET role = ${peranBaru},
          probationary_until = NULL, probationary_from_role = NULL, updated_at = NOW()
        WHERE id = ${p.userId}
      `
      // Perkecualian menu diberikan dalam konteks jabatan ("boleh ubah DPA selagi ia
      // PROGRAM"). Dibiarkan menempel saat orangnya pindah, ia jadi kewenangan yang
      // ikut berpindah diam-diam. Aturan ini sudah berlaku di jalur lama; yang baru
      // cuma bahwa ia terjadi di transaksi yang sama dengan sisanya.
      hasil.izinDihapus += await hapusIzinOrang(tx, p.userId)
      hasil.peranBerubah = { dari: target.role, ke: peranBaru }
    }

    const grantBaru = grantCalon
    hasil.grantDitambah = grantBaru.filter((k) => !appAccessLama.includes(k))
    hasil.grantDicabut = appAccessLama.filter((k) => !grantBaru.includes(k))
    await tx`
      UPDATE users SET app_access = ${grantBaru.length ? JSON.stringify(grantBaru) : null},
        updated_at = NOW()
      WHERE id = ${p.userId}
    `
    // P2 — tenggat ditulis di TRANSAKSI YANG SAMA dengan grant-nya, dan disaring
    // `jangkaYangBerarti` terhadap grant yang BARU. Dua akibatnya, dua-duanya perlu:
    // modul yang grant-nya baru saja dicabut kehilangan tenggatnya (tenggat yatim akan
    // mencabut akses yang mungkin sudah diberikan ulang belakangan — tanpa ada yang
    // memintanya), dan tenggat pada modul yang terbuka karena PERAN tidak pernah
    // tersimpan, sebab tanggal di situ tidak akan menutup apa pun saat lewat.
    const jangkaBaru = jangkaYangBerarti(grantBaru, p.berjangka ?? {})
    const j = await tulisJangkaTx(tx, p.userId, jangkaBaru, p.olehUserId)
    hasil.jangkaDitulis = j.ditulis
    hasil.jangkaDihapus = j.dihapus

    // Modul yang grant-nya dicabut ikut membawa perkecualian menunya. Kalau ditinggal,
    // barisnya jadi yatim — tidak berbahaya hari ini (pintu modulnya menutup), tapi
    // hidup kembali tanpa ada yang ingat kalau grant-nya diberikan lagi nanti.
    const terbukaBaru = new Set(barisPintu(peranBaru, grantBaru).filter((b) => b.terbuka).map((b) => b.kunci))
    for (const appKey of MENU_APP_KEYS) {
      if (!terbukaBaru.has(appKey)) hasil.izinDihapus += await hapusIzinOrang(tx, p.userId, appKey)
    }

    // P4 — permintaan yang pintunya kini terbuka ditutup DI SINI, di transaksi yang
    // sama dengan grant-nya. Patokannya keadaan akhir, bukan "baru saja dicentang":
    // permintaan untuk akses yang ternyata sudah dipunyai, atau yang jadi terbuka
    // karena perannya diganti, sama-sama sudah terjawab "ya" — dan kalau tidak ikut
    // ditutup, ia menggantung di antrean tanpa ada yang tahu jawabannya sudah ada.
    hasil.permintaanDisetujui = await tutupYangSudahTerbukaTx(
      tx, { userId: p.userId, username: target.username, role: peranBaru }, terbukaBaru, p.olehUserId,
    )

    // Sesudah ganti peran, perkecualian yang dikirim layar milik jabatan LAMA — layar
    // sudah diminta mengosongkannya, dan di sini ia diabaikan kalau tetap dikirim.
    // Menulisnya balik akan membatalkan penghapusan yang baru saja dilakukan.
    if (!gantiPeran) {
      for (const appKey of [...MENU_APP_KEYS].sort()) {
        if (!(appKey in p.menu) || !terbukaBaru.has(appKey)) continue
        const berubah = await tulisIzinOrangTx(tx, conn, p.userId, appKey, p.menu[appKey], p.versi[appKey], p.olehUserId)
        if (berubah) hasil.modulMenuDitulis.push(appKey)
      }
    }
  })

  bersihkanCacheIzin()
  return hasil
}

/**
 * Kembaran `simpanIzinOrang` yang ikut transaksi pemanggil, bukan membuka sendiri.
 * Dipisah, bukan dibuat parameter opsional di sana: fungsi yang kadang membuka
 * transaksi dan kadang tidak adalah bentuk yang paling gampang salah dipakai, dan
 * kesalahannya senyap (kunci di transaksi pemanggil berhenti menjaga apa pun — L69-b).
 */
async function tulisIzinOrangTx(
  tx: Penanya, conn: Parameters<typeof bulkInsert>[3],
  userId: number, appKey: string,
  peta: Record<string, Izin>, sidikJariHarap: string | undefined, olehUserId: number | null,
): Promise<boolean> {
  const kini = new Map<string, Izin>()
  const rows = await tx`
    SELECT menu_key, izin FROM menu_user_access
    WHERE user_id = ${userId} AND app_key = ${appKey} FOR UPDATE
  ` as { menu_key: string; izin: string }[]
  for (const r of rows) if (isIzin(r.izin)) kini.set(r.menu_key, r.izin)
  if (sidikJariHarap !== undefined && sidikJariIzin(kini) !== sidikJariHarap) {
    throw new IzinBerubahError(sidikJariIzin(kini))
  }

  const sah = new Set((aplikasiMenu(appKey)?.menus ?? []).map((m) => m.key))
  const baris = Object.entries(peta).filter(([k, v]) => sah.has(k) && isIzin(v))

  // Modul yang isinya SAMA dengan yang tersimpan dilewati sepenuhnya. Bukan
  // penghematan: satu Simpan mengirim SELURUH modul yang terbuka, jadi menulis
  // semuanya membuat jejak audit berbunyi "izin menu diperbarui" untuk modul yang
  // tidak disentuh siapa pun — dan jejak yang menyebut perubahan yang tidak terjadi
  // lebih buruk daripada tidak mencatat, karena ia dipercaya.
  if (sidikJariIzin(new Map(baris)) === sidikJariIzin(kini)) return false

  await tx`DELETE FROM menu_user_access WHERE user_id = ${userId} AND app_key = ${appKey}`
  if (baris.length > 0) {
    await bulkInsert(
      'menu_user_access',
      ['user_id', 'app_key', 'menu_key', 'izin', 'updated_by'],
      baris.map(([k, v]) => [userId, appKey, k, v, olehUserId]),
      conn,
    )
  }
  return true
}

// ─── Garis waktu satu orang (P8 lapis 1) ─────────────────────────────────────

/**
 * Umur garis waktunya, dalam bulan. **Bukan pilihan tampilan** — ini kenyataan:
 * `app/api/cron/purge-retention` membuang `audit_log` yang lebih tua dari 12 bulan.
 *
 * Angkanya tinggal di sini supaya layar bisa MENGATAKANNYA. Garis waktu yang berhenti
 * tanpa keterangan membuat orang menyimpulkan "tidak ada catatan" dari "catatannya sudah
 * dibuang" — dan itu kesimpulan yang salah pada pertanyaan yang paling penting.
 */
export const BULAN_GARIS_WAKTU = 12

export type PeristiwaOrang = {
  id: number
  jenis: string
  detail: string | null
  pelaku: string | null
  waktu: string
}

/**
 * Riwayat wewenang SATU orang, terbaru dulu.
 *
 * Disaring `target_user_id`, bukan `detail LIKE '%id=12%'` — pencarian teks itu ikut
 * cocok dengan id=120, id=123, id=127 (T-15), dan ia kelihatan berhasil sambil
 * diam-diam salah.
 *
 * `id` di-`CAST … AS UNSIGNED` karena `audit_log.id` BIGINT: mysql2 memulangkannya
 * sebagai BigInt, yang tidak bisa di-JSON-kan dan merobohkan seluruh balasan.
 */
export async function garisWaktuOrang(userId: number, batas = 60): Promise<PeristiwaOrang[]> {
  const rows = await sql`
    SELECT CAST(a.id AS UNSIGNED) AS id, a.event_type AS jenis, a.detail,
           a.username AS pelaku, a.created_at AS waktu
    FROM audit_log a
    WHERE a.target_user_id = ${userId}
    ORDER BY a.created_at DESC, a.id DESC
    LIMIT ${sqlInt(batas)}
  ` as PeristiwaOrang[]
  return rows
}
