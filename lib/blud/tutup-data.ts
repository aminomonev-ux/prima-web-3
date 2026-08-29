// lib/blud/tutup-data.ts — sisi database "Tutup Pergeseran".
//
// Berkas ini SENGAJA tidak mengimpor `data.ts`, padahal `data.ts` memanggilnya —
// alasan yang sama dengan `riwayat-simpan.ts`: dua berkas yang saling mengimpor
// membentuk lingkaran modul yang baru meledak saat runtime, di rute acak.
//
// Yang ditulis di sini cuma PERISTIWA penutupannya. Barisnya sendiri ditulis
// jalur Simpan biasa, dan itu keputusan pokok konsepnya (§3): satu jalur tulis,
// satu rumus tanggal, seluruh pagar lama berlaku otomatis.
//
// Konsep: docs/CONCEPT-blud-tutup-pergeseran.md

import { sql } from '@/lib/data/db'
import type { TxSql } from '@/lib/data/db'
import { waktuSekarangWIB, toDateStr } from './tanggal'
import type { TutupPergeseran } from './tutup-pergeseran'

/** Dilempar kalau versi itu sudah pernah ditutup — ditangkap route jadi 409. */
export class BludSudahDitutupError extends Error {
  constructor(public readonly versiDitutup: string, public readonly versiBasis: string) {
    super(
      `Versi pergeseran ${versiDitutup} sudah pernah ditutup (basisnya ${versiBasis}). `
      + `Satu putaran hanya bisa ditutup sekali.`,
    )
    this.name = 'BludSudahDitutupError'
  }
}

/**
 * Catat penutupan, DI DALAM transaksi simpan yang sama dengan barisnya.
 *
 * `INSERT` polos, bukan `SELECT` dulu lalu `INSERT`: PRIMARY KEY
 * `(tahun_anggaran, versi_ditutup)` yang menjadikan "satu versi hanya bisa
 * ditutup sekali" — klik dobel ditolak kunci tabelnya sendiri, atomik, dan tanpa
 * `SELECT … FOR UPDATE` pada baris yang belum ada sama sekali (L69-a: mengunci
 * baris yang belum ada tidak mengunci apa pun).
 *
 * Duplikatnya diterjemahkan jadi galat yang bisa dibaca orang, bukan dibiarkan
 * naik sebagai ER_DUP_ENTRY.
 */
export async function catatTutupPergeseran(
  tx: TxSql,
  a: { tahun: number; versiDitutup: string; versiBasis: string; userId: number },
): Promise<void> {
  try {
    await tx`
      INSERT INTO blud_pergeseran_tutup
        (tahun_anggaran, versi_ditutup, versi_basis, ditutup_pada, ditutup_oleh)
      VALUES
        (${a.tahun}, ${a.versiDitutup}, ${a.versiBasis}, ${waktuSekarangWIB()}, ${a.userId})
    `
  } catch (e) {
    const kode = (e as { code?: string }).code
    if (kode === 'ER_DUP_ENTRY') {
      const lama = await tx`
        SELECT versi_basis FROM blud_pergeseran_tutup
        WHERE tahun_anggaran = ${a.tahun} AND versi_ditutup = ${a.versiDitutup}
      ` as { versi_basis?: unknown }[]
      throw new BludSudahDitutupError(a.versiDitutup, lama[0]?.versi_basis ? toDateStr(lama[0].versi_basis) : '—')
    }
    throw e
  }
}

/**
 * Daftar penutupan setahun, urut tanggal. Nomor putaran TIDAK ikut dipulangkan —
 * ia dihitung dari urutan ini oleh `nomorPutaran`. Menyimpannya berarti
 * baca-lalu-tulis pada sebuah penghitung, anti-pattern L55.
 */
export async function getTutupPergeseran(tahun: number): Promise<TutupPergeseran[]> {
  const rows = await sql`
    SELECT t.versi_ditutup, t.versi_basis, t.ditutup_pada, u.username AS ditutup_oleh
    FROM blud_pergeseran_tutup t
    LEFT JOIN users u ON u.id = t.ditutup_oleh
    WHERE t.tahun_anggaran = ${tahun}
    ORDER BY t.versi_ditutup ASC
  ` as Record<string, unknown>[]

  return rows.map(r => ({
    versi_ditutup: toDateStr(r.versi_ditutup),
    versi_basis:   toDateStr(r.versi_basis),
    ditutup_pada:  String(r.ditutup_pada ?? '').slice(0, 19).replace('T', ' '),
    ditutup_oleh:  r.ditutup_oleh ? String(r.ditutup_oleh) : null,
  }))
}
