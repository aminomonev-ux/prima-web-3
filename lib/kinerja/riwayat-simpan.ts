// lib/kinerja/riwayat-simpan.ts — riwayat tiap klik Simpan SSK/Realisasi/Rekening.
//
// Ketiga jalur itu hapus-lalu-tulis-ulang per (tahun, sumber), jadi simpanan sore
// menghapus hasil pagi tanpa sisa. Tahap 0b sudah menolak payload kosong dan
// penurunan drastis; yang tersisa adalah simpanan SAH yang salah isi — 180 baris
// masuk, 180 baris keluar, tidak ada ambang yang bisa menyalak.
//
// Baris di sini SENGAJA tidak dirujuk siapa pun. Ia catatan, bukan entitas.
//
// Konsep: docs/CONCEPT-kinerja-riwayat-simpan.md

import { sql, sqlInt } from '@/lib/data/db'
import type { Penanya } from '@/lib/data/db'
import { waktuSekarangWIB } from '@/lib/shared/waktu-wib'
// Diimpor DAN di-re-export: `export … from` tidak membuat binding lokal,
// padahal pemangkasan retensi di berkas ini memakainya sendiri.
import { RIWAYAT_RETENSI_KINERJA } from './riwayat-konstanta'

export { RIWAYAT_RETENSI_KINERJA }

export type JenisRiwayatKinerja = 'SSK' | 'REALISASI' | 'REKENING'

/** Lingkup yang di-DELETE oleh satu klik Simpan. Versi NULL = jenis ini tidak berversi. */
export interface LingkupRiwayat {
  jenis:      JenisRiwayatKinerja
  tahun:      string
  sumber:     string
  versiTipe:  'MURNI' | 'PERUBAHAN' | null
  versiSeq:   number | null
}

/** Baris daftar — TANPA `isi`, supaya membuka daftar tidak menyeret puluhan MB. */
export interface RiwayatKinerjaItem extends LingkupRiwayat {
  id:                 number
  disimpan_pada:      string   // 'YYYY-MM-DD HH:MM:SS' WIB
  versi_ke:           number | null
  jumlah_baris:       number
  total_nilai:        number
  disimpan_oleh_nama: string | null
}

export interface RiwayatKinerjaIsi extends RiwayatKinerjaItem {
  isi: unknown[]
}

interface CatatArgs extends LingkupRiwayat {
  baris:      unknown[]
  totalNilai: number
  versiKe:    number | null
  userId:     number
}

/**
 * Total yang ditampilkan di daftar. Alat bantu pengenal saja — tidak dipakai
 * menghitung apa pun, jadi Rekening yang memang tidak memuat uang tetap 0.
 */
export function hitungTotalNilai(jenis: JenisRiwayatKinerja, baris: unknown[]): number {
  const kolom = jenis === 'SSK' ? 'pagu' : jenis === 'REALISASI' ? 'real_keuangan' : null
  if (!kolom) return 0
  let total = 0
  for (const b of baris) {
    const v = (b as Record<string, unknown>)?.[kolom]
    total += Number(v ?? 0) || 0
  }
  return total
}

/**
 * Catat satu snapshot + pangkas yang lewat retensi.
 *
 * WAJIB dipanggil DENGAN `tx`, dari dalam `withTransaction` milik Simpan (L69-b).
 * Dengan `sql` biasa ia memakai koneksi lain, jadi snapshot untuk simpanan yang
 * akhirnya di-rollback (409 gembok, pagar penurunan) tetap tertinggal.
 *
 * Bukan best-effort seperti arsip Drive-nya LKJIP: ini INSERT lokal. Kalau ia
 * gagal, ada yang salah sungguhan dan Simpan memang layak ikut batal.
 */
export async function catatRiwayatSimpan(tx: Penanya, a: CatatArgs): Promise<void> {
  await tx`
    INSERT INTO kinerja_riwayat_simpan
      (jenis, tahun, sumber, versi_tipe, versi_seq, disimpan_pada, versi_ke,
       jumlah_baris, total_nilai, isi, disimpan_oleh)
    VALUES
      (${a.jenis}, ${a.tahun}, ${a.sumber}, ${a.versiTipe}, ${a.versiSeq},
       ${waktuSekarangWIB()}, ${a.versiKe},
       ${a.baris.length}, ${a.totalNilai}, ${JSON.stringify(a.baris)}, ${a.userId})
  `
  // `<=>`, BUKAN `=`. Kolom versi NULL untuk REALISASI/REKENING, dan
  // `versi_tipe = NULL` tidak pernah bernilai benar — dengan `=` riwayat kedua
  // jenis itu tidak akan pernah dipangkas, tumbuh terus tanpa satu gejala pun.
  //
  // Derived table `t` karena MySQL menolak subquery ke tabel yang sedang
  // di-DELETE; `sqlInt` karena mysql2 menolak `LIMIT ?` (L66).
  await tx`
    DELETE FROM kinerja_riwayat_simpan
     WHERE jenis = ${a.jenis} AND tahun = ${a.tahun} AND sumber = ${a.sumber}
       AND versi_tipe <=> ${a.versiTipe} AND versi_seq <=> ${a.versiSeq}
       AND id NOT IN (
         SELECT id FROM (
           SELECT id FROM kinerja_riwayat_simpan
            WHERE jenis = ${a.jenis} AND tahun = ${a.tahun} AND sumber = ${a.sumber}
              AND versi_tipe <=> ${a.versiTipe} AND versi_seq <=> ${a.versiSeq}
            ORDER BY id DESC LIMIT ${sqlInt(RIWAYAT_RETENSI_KINERJA)}
         ) t
       )
  `
}

/**
 * DATETIME dari mysql2 (pool `timezone: '+07:00'`) datang sebagai Date. Diformat
 * balik lewat offset yang sama supaya jam yang keluar sama persis dengan jam yang
 * masuk — `toISOString()` polos akan menggesernya 7 jam ke belakang.
 */
function normWaktu(v: unknown): string {
  if (v instanceof Date) return waktuSekarangWIB(v.getTime())
  return String(v ?? '').slice(0, 19).replace('T', ' ')
}

function normItem(r: Record<string, unknown>): RiwayatKinerjaItem {
  return {
    id:                 Number(r.id),
    jenis:              String(r.jenis) as JenisRiwayatKinerja,
    tahun:              String(r.tahun ?? ''),
    sumber:             String(r.sumber ?? ''),
    versiTipe:          r.versi_tipe === 'PERUBAHAN' || r.versi_tipe === 'MURNI' ? r.versi_tipe : null,
    versiSeq:           r.versi_seq === null || r.versi_seq === undefined ? null : Number(r.versi_seq),
    disimpan_pada:      normWaktu(r.disimpan_pada),
    versi_ke:           r.versi_ke === null || r.versi_ke === undefined ? null : Number(r.versi_ke),
    jumlah_baris:       Number(r.jumlah_baris ?? 0),
    total_nilai:        Number(r.total_nilai ?? 0),
    disimpan_oleh_nama: r.oleh ? String(r.oleh) : null,
  }
}

/** Daftar snapshot satu lingkup — terbaru dulu. Tanpa `isi`. */
export async function getRiwayatKinerja(l: LingkupRiwayat): Promise<RiwayatKinerjaItem[]> {
  const rows = await sql`
    SELECT r.id, r.jenis, r.tahun, r.sumber, r.versi_tipe, r.versi_seq,
           r.disimpan_pada, r.versi_ke, r.jumlah_baris, r.total_nilai,
           COALESCE(u.nama_lengkap, u.username) AS oleh
      FROM kinerja_riwayat_simpan r
      LEFT JOIN users u ON u.id = r.disimpan_oleh
     WHERE r.jenis = ${l.jenis} AND r.tahun = ${l.tahun} AND r.sumber = ${l.sumber}
       AND r.versi_tipe <=> ${l.versiTipe} AND r.versi_seq <=> ${l.versiSeq}
     ORDER BY r.disimpan_pada DESC, r.id DESC
  ` as Record<string, unknown>[]
  return rows.map(normItem)
}

/** Satu snapshot beserta isinya — untuk dimuat ke form. */
export async function getRiwayatKinerjaIsi(id: number): Promise<RiwayatKinerjaIsi | null> {
  const rows = await sql`
    SELECT r.id, r.jenis, r.tahun, r.sumber, r.versi_tipe, r.versi_seq,
           r.disimpan_pada, r.versi_ke, r.jumlah_baris, r.total_nilai,
           COALESCE(u.nama_lengkap, u.username) AS oleh, r.isi
      FROM kinerja_riwayat_simpan r
      LEFT JOIN users u ON u.id = r.disimpan_oleh
     WHERE r.id = ${id}
  ` as Record<string, unknown>[]
  const r = rows[0]
  if (!r) return null
  // Kolom JSON dipulangkan mysql2 sudah ter-parse; string hanya muncul kalau
  // driver/versi berbeda. Dua-duanya diterima supaya tidak pecah diam-diam.
  const isi = typeof r.isi === 'string' ? JSON.parse(r.isi) : r.isi
  return { ...normItem(r), isi: Array.isArray(isi) ? isi : [] }
}
