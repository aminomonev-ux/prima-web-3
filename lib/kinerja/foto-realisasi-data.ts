// lib/kinerja/foto-realisasi-data.ts — baca/tulis foto realisasi versi final
// (`kinerja_realisasi_foto` + `_baris`). Aturannya di foto-realisasi.ts.
// Konsep: docs/CONCEPT-kinerja-tutup-per-versi.md

import type { Penanya, TxSql } from '@/lib/data/db'
import type { SumberSSK } from '@/lib/data/kinerja'
import { waktuSekarangWIB } from '@/lib/shared/waktu-wib'
import type { VersiSsk } from './tutup-bulan'
import type { AsalFoto, VersiFinal } from './foto-realisasi'

/** Versi itu terkunci (final)? Kalau ya, berikut fotonya. `null` = versi berjalan. */
export async function versiFinal(q: Penanya, tahun: string, sumber: SumberSSK, v: VersiSsk): Promise<VersiFinal | null> {
  const [kunci] = await q`
    SELECT DATE_FORMAT(MAX(locked_at), '%Y-%m-%d %H:%i:%s') AS dikunci
    FROM kinerja_ssk
    WHERE tahun = ${tahun} AND sumber = ${sumber} AND versi_tipe = ${v.tipe} AND versi_seq = ${v.seq}
      AND locked_at IS NOT NULL
  ` as { dikunci: unknown }[]
  if (!kunci?.dikunci) return null
  const [f] = await q`
    SELECT f.asal, DATE_FORMAT(f.keadaan_pada, '%Y-%m-%d %H:%i:%s') AS keadaan,
           COALESCE(u.nama_lengkap, u.username) AS oleh
    FROM kinerja_realisasi_foto f
    LEFT JOIN users u ON u.id = f.difoto_oleh
    WHERE f.tahun = ${tahun} AND f.sumber = ${sumber} AND f.versi_tipe = ${v.tipe} AND f.versi_seq = ${v.seq}
  ` as { asal: unknown; keadaan: unknown; oleh: unknown }[]
  return {
    dikunci_pada: String(kunci.dikunci),
    foto: f ? {
      asal: String(f.asal) as AsalFoto,
      keadaan_pada: String(f.keadaan ?? ''),
      difoto_oleh: f.oleh ? String(f.oleh) : null,
    } : null,
  }
}

/**
 * Potret realisasi berjalan untuk versi yang baru dikunci "Buat Perubahan". Pemanggil memegang
 * gembok realisasi sumber ini. Versi yang sudah punya foto tidak dipotret ulang (`null`) —
 * foto itu yang jadi acuan laporannya. Memulangkan jumlah baris yang dipotret.
 */
export async function potretRealisasi(
  tx: TxSql, tahun: string, sumber: SumberSSK, v: VersiSsk, userId: number,
): Promise<number | null> {
  const sekarang = waktuSekarangWIB()
  const kepala = await tx`
    INSERT IGNORE INTO kinerja_realisasi_foto
      (tahun, sumber, versi_tipe, versi_seq, asal, keadaan_pada, riwayat_id, difoto_oleh, difoto_pada)
    VALUES (${tahun}, ${sumber}, ${v.tipe}, ${v.seq}, 'BUAT_PERUBAHAN', ${sekarang}, NULL, ${userId}, ${sekarang})
  ` as unknown as Array<{ affectedRows: number }>
  if (Number(kepala[0]?.affectedRows ?? 0) === 0) return null
  // Urutan `bulan, id` = urutan GET realisasi, supaya baris kembar tetap berpasangan sama.
  const isi = await tx`
    INSERT INTO kinerja_realisasi_foto_baris
      (tahun, sumber, versi_tipe, versi_seq, bulan, ssk_canonical_id, ssk_versi_tipe, ssk_versi_seq,
       keterangan, program, kegiatan, subkegiatan, uraian_ssk, real_fisik, real_keuangan)
    SELECT tahun, sumber, ${v.tipe}, ${v.seq}, bulan, ssk_canonical_id, ssk_versi_tipe, ssk_versi_seq,
           keterangan, program, kegiatan, subkegiatan, uraian_ssk, real_fisik, real_keuangan
    FROM kinerja_realisasi
    WHERE tahun = ${tahun} AND sumber = ${sumber}
    ORDER BY bulan, id
  ` as unknown as Array<{ affectedRows: number }>
  return Number(isi[0]?.affectedRows ?? 0)
}

/**
 * Sesudah Reset: foto versi yang dihapus, atau yang kuncinya dibuka lagi karena Perubahannya
 * dihapus, dibuang (barisnya ikut lewat FK CASCADE). Versi yang kembali berjalan diukur
 * dengan realisasi berjalan — dua angka "Murni" yang berbeda tidak boleh hidup berdampingan.
 */
export async function buangFotoTakFinal(tx: TxSql, tahun: string, sumber: SumberSSK): Promise<number> {
  const res = await tx`
    DELETE f FROM kinerja_realisasi_foto f
    WHERE f.tahun = ${tahun} AND f.sumber = ${sumber}
      AND NOT EXISTS (
        SELECT 1 FROM kinerja_ssk s
        WHERE s.tahun = f.tahun AND s.sumber = f.sumber AND s.versi_tipe = f.versi_tipe
          AND s.versi_seq = f.versi_seq AND s.locked_at IS NOT NULL
      )
  ` as unknown as Array<{ affectedRows: number }>
  return Number(res[0]?.affectedRows ?? 0)
}
