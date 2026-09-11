// lib/admin/permintaan-akses.ts — tabel `akses_permintaan` (P4, Tahap 11).
// Konsep: docs/CONCEPT-pusat-akses-satu-pintu.md §12 P4.
//
// SERVER-ONLY, dan SENGAJA hanya menyentuh tabelnya sendiri — persis pembagian yang
// dipakai P2 (`akses-berjangka.ts` memegang tabelnya, `cabut-kedaluwarsa.ts` memegang
// orkestrasinya). Yang MENUTUP permintaan saat aksesnya benar-benar diberikan tinggal
// di dalam transaksi `pusat-akses.ts`, dan berkas itu mengimpor berkas ini; kalau
// orkestrasinya ditaruh di sini, lapisan datanya membentuk lingkaran impor — bentuk
// yang paling sulit dilihat sampai ia meledak saat build.
//
// Aturannya sendiri (siapa boleh meminta apa) tinggal di berkas DAUN
// `permintaan-baris.ts`, karena layar /menu memakainya juga.

import { sql, sqlInt, execWrite, type Penanya } from '@/lib/data/db'
import { MAKS_ALASAN, type BarisAntrean, type PermintaanSaya, type StatusPermintaan } from '@/lib/admin/permintaan-baris'

/** `DATETIME` mysql2 → string ISO ringkas yang aman di-JSON-kan & dibandingkan. */
function keIso(v: unknown): string {
  if (v instanceof Date) return v.toISOString()
  return String(v ?? '')
}

type BarisMentah = {
  id: number; user_id: number; app_key: string; alasan: string
  status: string; dibuat_pada: unknown; catatan_putusan: string | null
  username?: string; nama_lengkap?: string | null; role?: string
  umur_hari?: number | string
}

function petakan(r: BarisMentah): PermintaanSaya {
  return {
    id: Number(r.id),
    appKey: r.app_key,
    alasan: r.alasan,
    status: r.status as StatusPermintaan,
    dibuatPada: keIso(r.dibuat_pada),
    catatanPutusan: r.catatan_putusan,
  }
}

/**
 * Permintaan milik seseorang — termasuk yang sudah diputus.
 *
 * Yang DITOLAK ikut, dan itu bukan kelengkapan kosmetik: kartu /menu memakainya untuk
 * menuliskan SEBAB penolakan. Penolakan tanpa sebab mengirim orangnya kembali bertanya
 * lewat WhatsApp — antrean yang persis sedang dipindahkan ke dalam aplikasi.
 */
export async function permintaanSaya(userId: number, batas = 30): Promise<PermintaanSaya[]> {
  const rows = await sql`
    SELECT id, user_id, app_key, alasan, status, dibuat_pada, catatan_putusan
    FROM akses_permintaan
    WHERE user_id = ${userId}
    ORDER BY dibuat_pada DESC, id DESC
    LIMIT ${sqlInt(batas)}
  ` as BarisMentah[]
  return rows.map(petakan)
}

export type HasilBuat =
  | { hasil: 'dibuat'; id: number }
  | { hasil: 'sudah-menunggu' }

/**
 * Satu permintaan baru.
 *
 * "Sudah ada yang menunggu" dijawab oleh **kunci unik DB**, bukan oleh SELECT-dulu.
 * Memeriksa baris yang BELUM ADA tidak mengunci apa pun (L69-a), jadi dua klik beruntun
 * pada koneksi berbeda sama-sama lolos pemeriksaan lalu sama-sama menulis. Yang di sini
 * cuma menerjemahkan ER_DUP_ENTRY jadi jawaban yang bisa dibaca orang.
 *
 * Alasannya dipotong di batas yang SAMA dengan kolomnya. Tanpa itu, kiriman yang lolos
 * Zod tapi melebihi kolom akan ditolak MySQL sebagai galat 500 — dan yang terbaca orang
 * adalah "aplikasinya rusak", bukan "kalimatnya kepanjangan".
 */
export async function buatPermintaan(
  userId: number, appKey: string, alasan: string,
): Promise<HasilBuat> {
  try {
    const r = await execWrite(sql`
      INSERT INTO akses_permintaan (user_id, app_key, alasan)
      VALUES (${userId}, ${appKey}, ${alasan.trim().slice(0, MAKS_ALASAN)})
    `)
    return { hasil: 'dibuat', id: r.insertId }
  } catch (e) {
    if (typeof e === 'object' && e !== null && (e as { code?: string }).code === 'ER_DUP_ENTRY') {
      return { hasil: 'sudah-menunggu' }
    }
    throw e
  }
}

/**
 * Antrean yang menunggu putusan — terlama DULU.
 *
 * Urutannya menaik, kebalikan daftar riwayat mana pun di aplikasi ini, dan itu memang
 * disengaja: yang paling lama menunggu adalah yang paling mungkin sudah menyerah dan
 * kembali mengirim WhatsApp. Antrean yang menaruh yang terbaru di atas menyembunyikan
 * justru baris yang paling perlu dilihat.
 */
export async function antreanMenunggu(batas = 100): Promise<BarisAntrean[]> {
  const rows = await sql`
    SELECT p.id, p.user_id, p.app_key, p.alasan, p.status, p.dibuat_pada, p.catatan_putusan,
           DATEDIFF(CURDATE(), DATE(p.dibuat_pada)) AS umur_hari,
           u.username, u.nama_lengkap, u.role
    FROM akses_permintaan p JOIN users u ON u.id = p.user_id
    WHERE p.status = 'MENUNGGU' AND u.deleted_at IS NULL
    ORDER BY p.dibuat_pada ASC, p.id ASC
    LIMIT ${sqlInt(batas)}
  ` as BarisMentah[]
  return rows.map((r) => ({
    ...petakan(r),
    userId: Number(r.user_id),
    username: r.username ?? '',
    namaLengkap: r.nama_lengkap ?? null,
    role: r.role ?? '',
    umurHari: Number(r.umur_hari ?? 0),
  }))
}

/**
 * Berapa yang menunggu — untuk lencana di rel Admin Panel.
 *
 * Dihitung dengan penyaring yang SAMA dengan `antreanMenunggu` (termasuk
 * `deleted_at IS NULL`). Lencana yang berbunyi "3" di atas daftar berisi 2 adalah
 * bentuk yang membuat orang berhenti memercayai lencananya, lalu berhenti membukanya.
 */
export async function hitungMenunggu(): Promise<number> {
  const rows = await sql`
    SELECT COUNT(*) AS n FROM akses_permintaan p JOIN users u ON u.id = p.user_id
    WHERE p.status = 'MENUNGGU' AND u.deleted_at IS NULL
  ` as { n: number | string }[]
  return Number(rows[0]?.n ?? 0)
}

export type PermintaanDitutup = {
  id: number; userId: number; appKey: string; alasan: string
  /** Identitas pemohon, dibawa keluar supaya pemanggilnya tidak perlu bertanya lagi. */
  username: string; role: string
}

/**
 * Tutup permintaan yang pintunya SUDAH TERBUKA — di dalam transaksi PEMANGGIL.
 *
 * Patokannya keadaan AKHIR ("pintunya terbuka sekarang"), bukan "modul ini baru saja
 * dicentang". Tiga jalan menuju terbuka, dan ketiganya menjawab pertanyaan yang sama
 * dengan yang ditanyakan pemohon: grant baru diberikan · grant-nya sudah ada sejak
 * sebelum ia bertanya · perannya diganti sehingga modulnya jadi bawaan. Kalau
 * patokannya "baru dicentang", permintaan untuk akses yang ternyata sudah terbuka akan
 * menggantung di antrean selamanya, dan yang membacanya besok tidak punya cara tahu
 * bahwa jawabannya sudah "ya".
 *
 * Sebaliknya, permintaan untuk pintu yang TETAP tertutup tidak disentuh sama sekali:
 * admin yang membuka halaman seseorang untuk urusan lain lalu menyimpan tidak boleh
 * diam-diam menjawab pertanyaan yang belum ia putuskan.
 *
 * Ditutup di transaksi yang sama dengan grant-nya, bukan sesudahnya. Terpisah, dua
 * keadaan setengah jalan jadi mungkin: akses diberikan tapi antreannya masih berbunyi
 * menunggu, atau antreannya bersih padahal aksesnya gagal tersimpan.
 */
export async function tutupYangSudahTerbukaTx(
  tx: Penanya,
  pemohon: { userId: number; username: string; role: string },
  terbuka: ReadonlySet<string>,
  olehUserId: number | null,
): Promise<PermintaanDitutup[]> {
  const { userId } = pemohon
  const rows = await tx`
    SELECT id, app_key, alasan FROM akses_permintaan
    WHERE user_id = ${userId} AND status = 'MENUNGGU' FOR UPDATE
  ` as { id: number; app_key: string; alasan: string }[]
  const kena = rows.filter((r) => terbuka.has(r.app_key))
  if (kena.length === 0) return []

  await tx`
    UPDATE akses_permintaan
    SET status = 'DISETUJUI', diputus_pada = NOW(), diputus_oleh = ${olehUserId}
    WHERE id IN (${kena.map((r) => r.id)})
  `
  return kena.map((r) => ({
    id: Number(r.id), userId, appKey: r.app_key, alasan: r.alasan,
    username: pemohon.username, role: pemohon.role,
  }))
}

export type HasilTolak =
  | { hasil: 'ditolak'; baris: BarisAntrean }
  | { hasil: 'tidak-menunggu' }

/**
 * Menolak satu permintaan, beserta sebabnya.
 *
 * Barisnya dibaca DULU (data untuk notifikasinya tidak berubah oleh penolakan), lalu
 * `UPDATE … WHERE status = 'MENUNGGU'` yang memutuskan siapa yang menang kalau dua
 * SUPER_ADMIN menolak baris yang sama pada detik yang sama: `affectedRows` cuma 1 untuk
 * salah satu. Bentuk yang sama dengan lockout login atomik (L55) — baca-lalu-tulis di
 * JavaScript akan mengirim dua notifikasi penolakan untuk satu permintaan.
 *
 * Notifikasinya TIDAK dikirim dari sini: ia bukan urusan tabel, dan ia harus jalan di
 * luar jalur yang bisa dibatalkan.
 */
export async function tolakPermintaan(
  id: number, olehUserId: number, catatan: string,
): Promise<HasilTolak> {
  const rows = await sql`
    SELECT p.id, p.user_id, p.app_key, p.alasan, p.status, p.dibuat_pada, p.catatan_putusan,
           u.username, u.nama_lengkap, u.role
    FROM akses_permintaan p JOIN users u ON u.id = p.user_id
    WHERE p.id = ${id} LIMIT 1
  ` as BarisMentah[]
  const r = rows[0]
  if (!r) return { hasil: 'tidak-menunggu' }

  const hasil = await execWrite(sql`
    UPDATE akses_permintaan
    SET status = 'DITOLAK', diputus_pada = NOW(), diputus_oleh = ${olehUserId},
        catatan_putusan = ${catatan.trim().slice(0, 255)}
    WHERE id = ${id} AND status = 'MENUNGGU'
  `)
  if (hasil.affectedRows !== 1) return { hasil: 'tidak-menunggu' }

  return {
    hasil: 'ditolak',
    baris: {
      ...petakan(r),
      status: 'DITOLAK',
      catatanPutusan: catatan.trim().slice(0, 255),
      userId: Number(r.user_id),
      username: r.username ?? '',
      namaLengkap: r.nama_lengkap ?? null,
      role: r.role ?? '',
      umurHari: 0,
    },
  }
}
