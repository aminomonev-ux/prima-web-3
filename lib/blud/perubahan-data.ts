// lib/blud/perubahan-data.ts — sisi database penanda DPA Perubahan.
//
// Pola `tutup-data.ts`, dan sengaja tidak mengimpor `data.ts` padahal `data.ts`
// memanggilnya: dua berkas yang saling mengimpor membentuk lingkaran modul.
//
// Yang ditulis di sini cuma PERISTIWA-nya (versi mana yang mulai berstatus
// Perubahan, dari dasar apa). Barisnya ditulis jalur Simpan biasa — satu jalur
// tulis, seluruh pagar lama berlaku otomatis (konsep §5).
//
// Konsep: docs/CONCEPT-blud-dpa-perubahan.md §4

import { sql } from '@/lib/data/db'
import type { TxSql } from '@/lib/data/db'
import { waktuSekarangWIB, formatTanggalId } from './tanggal'
import { penandaPerubahan, type PenandaPerubahan } from './sumber-pagu'

/** Pembuatan ganda — ditangkap route jadi 409. */
export class BludPerubahanGandaError extends Error {
  constructor(public readonly versiMulai: string) {
    super(
      `DPA Perubahan bertanggal ${formatTanggalId(versiMulai)} sudah dibuat. `
      + 'Muat ulang halaman — simpanan berikutnya cukup Simpan biasa.',
    )
    this.name = 'BludPerubahanGandaError'
  }
}

/**
 * Catat penanda, DI DALAM transaksi simpan yang sama dengan barisnya.
 *
 * `INSERT` polos, bukan SELECT dulu: PRIMARY KEY `(tahun_anggaran, versi_mulai)`
 * yang menolak pembuatan ganda, atomik, tanpa `FOR UPDATE` pada baris yang belum
 * ada (L69-a).
 */
export async function catatPerubahan(
  tx: TxSql,
  a: { tahun: number; versiMulai: string; sumberDasar: 'PERGESERAN' | 'DPA'; versiDasar: string; userId: number },
): Promise<void> {
  try {
    await tx`
      INSERT INTO blud_dpa_perubahan
        (tahun_anggaran, versi_mulai, sumber_dasar, versi_dasar, dibuat_pada, dibuat_oleh)
      VALUES
        (${a.tahun}, ${a.versiMulai}, ${a.sumberDasar}, ${a.versiDasar}, ${waktuSekarangWIB()}, ${a.userId})
    `
  } catch (e) {
    if ((e as { code?: string }).code === 'ER_DUP_ENTRY') throw new BludPerubahanGandaError(a.versiMulai)
    throw e
  }
}

/**
 * Buang penanda yang tidak lagi punya satu pun versi DPA >= `versi_mulai`-nya —
 * dipanggil dari DALAM transaksi yang menghapus atau mengosongkan versi DPA.
 *
 * Tanpa ini aturan pagu §8 melihat babak Perubahan yang tidak punya DPA: pergeseran
 * lama berhenti jadi pagu, padahal tidak ada apa pun yang menggantikannya. Ditulis
 * persis sebagai kalimat konsepnya (NOT EXISTS), bukan "hapus yang > MAX": dua cara
 * itu sama hari ini, tapi yang pertama tidak bergantung pada urutan versi.
 *
 * Riwayatnya tidak hilang: baris audit `BLUD_DELETE_DPA_VERSI` menyebut penanda
 * yang ikut dibuang. Tabel ini keadaan yang berjalan, bukan arsip.
 */
export async function bersihkanPenandaYatim(tx: TxSql, tahun: number): Promise<number> {
  const res = await tx`
    DELETE p FROM blud_dpa_perubahan p
    WHERE p.tahun_anggaran = ${tahun}
      AND NOT EXISTS (
        SELECT 1 FROM dpa_blud d
        WHERE d.tahun_anggaran = p.tahun_anggaran AND d.versi_tanggal >= p.versi_mulai
      )
  ` as unknown as Array<{ affectedRows: number }>
  // L53/T15: hasil `tx` itu ARRAY — `res.affectedRows` di sini selalu undefined.
  return Number(res[0]?.affectedRows ?? 0)
}

/**
 * Daftar penanda setahun beserta nomornya, untuk layar. Nomor dihitung dari urutan
 * di sini, tidak disimpan (L55).
 */
export async function getPerubahan(tahun: number): Promise<(PenandaPerubahan & { ke: number })[]> {
  const daftar = await penandaPerubahan(sql, tahun)
  return daftar.map((p, i) => ({ ...p, ke: i + 1 }))
}
