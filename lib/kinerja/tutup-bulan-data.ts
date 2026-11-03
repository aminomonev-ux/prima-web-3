// lib/kinerja/tutup-bulan-data.ts — baca/tulis `kinerja_bulan_tutup`.
//
// Aturannya (urutan, kalimat) di `tutup-bulan.ts`; di sini cuma DB + gembok.
// Tutupan menempel pada (tahun, sumber, VERSI, bulan): menutup Januari di Perubahan tidak
// menutup Januari Murni, dan sebaliknya. Versi final tertutup semua lewat foto-realisasi.ts.
// Konsep: docs/CONCEPT-kinerja-simpan-realisasi.md §5, docs/CONCEPT-kinerja-tutup-per-versi.md

import { withTransaction } from '@/lib/data/db'
import type { Penanya, TxSql } from '@/lib/data/db'
import { acquireBludLock } from '@/lib/data/locks'
import { waktuSekarangWIB } from '@/lib/shared/waktu-wib'
import type { SumberSSK } from '@/lib/data/kinerja'
import { pickVersiAktif } from './versi'
import {
  REALISASI_LOCK_ENTITY, realisasiLockKey, alasanTolakTutup, alasanTolakBuka, alasanTolakVersi,
  type BulanTertutup, type VersiSsk,
} from './tutup-bulan'

/** Tutup/Buka ditolak aturan urutan atau versi — diterjemahkan jadi 409 di route. */
export class KinerjaAturanTutupError extends Error {
  constructor(alasan: string) {
    super(alasan)
    this.name = 'KinerjaAturanTutupError'
  }
}

/**
 * Versi RKO terbaru (slot) tahun·sumber — aturan `pickVersiAktif`, tanpa saringan nol-kan
 * (yang ditanyakan "slot mana yang belum punya penerus", sama dengan Reset). Tanpa RKO = MURNI-0.
 * Realisasi berjalan diukur ke versi ini, jadi tutupan versi inilah yang menjaga Simpan.
 */
export async function versiTerbaruSsk(q: Penanya, tahun: string, sumber: SumberSSK): Promise<VersiSsk> {
  const slot = await q`
    SELECT versi_tipe, versi_seq FROM kinerja_ssk
    WHERE tahun = ${tahun} AND sumber = ${sumber}
    GROUP BY versi_tipe, versi_seq
  ` as { versi_tipe?: unknown; versi_seq?: unknown }[]
  const v = pickVersiAktif(slot)
  return v
    ? { tipe: v.versi_tipe === 'PERUBAHAN' ? 'PERUBAHAN' : 'MURNI', seq: Number(v.versi_seq ?? 0) }
    : { tipe: 'MURNI', seq: 0 }
}

/**
 * Dari dalam transaksi WAJIB dioper `tx` (L69-b): pagar Simpan membaca daftar ini di
 * bawah gembok realisasi, dan pembacaan lewat koneksi lain tidak ikut terlindungi.
 */
export async function daftarBulanTertutup(q: Penanya, tahun: string, sumber: SumberSSK, v: VersiSsk): Promise<BulanTertutup[]> {
  const rows = await q`
    SELECT t.bulan, COALESCE(u.nama_lengkap, u.username) AS oleh,
           DATE_FORMAT(t.ditutup_pada, '%Y-%m-%d %H:%i:%s') AS pada
    FROM kinerja_bulan_tutup t
    LEFT JOIN users u ON u.id = t.ditutup_oleh
    WHERE t.tahun = ${tahun} AND t.sumber = ${sumber} AND t.versi_tipe = ${v.tipe} AND t.versi_seq = ${v.seq}
    ORDER BY t.bulan
  ` as { bulan: unknown; oleh: unknown; pada: unknown }[]
  return rows.map(r => ({
    bulan:        Number(r.bulan),
    ditutup_oleh: r.oleh ? String(r.oleh) : null,
    ditutup_pada: String(r.pada ?? ''),
  }))
}

export async function bulanTertutupSet(q: Penanya, tahun: string, sumber: SumberSSK, v: VersiSsk): Promise<Set<number>> {
  const rows = await q`
    SELECT bulan FROM kinerja_bulan_tutup
    WHERE tahun = ${tahun} AND sumber = ${sumber} AND versi_tipe = ${v.tipe} AND versi_seq = ${v.seq}
  ` as { bulan: unknown }[]
  return new Set(rows.map(r => Number(r.bulan)))
}

/** Tidak menunggu gembok — cukup untuk pertanyaan "boleh di-Reset?" yang juga dijaga gembok. */
export async function adaBulanTertutup(q: Penanya, tahun: string, sumber: SumberSSK, v: VersiSsk): Promise<boolean> {
  const rows = await q`
    SELECT 1 FROM kinerja_bulan_tutup
    WHERE tahun = ${tahun} AND sumber = ${sumber} AND versi_tipe = ${v.tipe} AND versi_seq = ${v.seq}
    LIMIT 1
  ` as unknown[]
  return rows.length > 0
}

/**
 * Versi yang barisnya dihapus Reset membawa tutupannya pergi — kalau tertinggal, Perubahan
 * baru bernomor sama lahir dengan bulan yang sudah "tertutup". `null` = semua versi.
 */
export async function buangTutupVersi(tx: TxSql, tahun: string, sumber: SumberSSK, v: VersiSsk | null): Promise<void> {
  if (v) {
    await tx`DELETE FROM kinerja_bulan_tutup WHERE tahun = ${tahun} AND sumber = ${sumber} AND versi_tipe = ${v.tipe} AND versi_seq = ${v.seq}`
  } else {
    await tx`DELETE FROM kinerja_bulan_tutup WHERE tahun = ${tahun} AND sumber = ${sumber}`
  }
}

/** Gembok realisasi PERTAMA (L84), lalu versinya harus versi terbaru. */
async function kunciVersiTutup(tx: TxSql, tahun: string, sumber: SumberSSK, v: VersiSsk): Promise<void> {
  await acquireBludLock(tx, REALISASI_LOCK_ENTITY, realisasiLockKey(tahun, sumber))
  const alasan = alasanTolakVersi(v, await versiTerbaruSsk(tx, tahun, sumber))
  if (alasan) throw new KinerjaAturanTutupError(alasan)
}

export async function tutupBulanRealisasi(
  tahun: string, sumber: SumberSSK, v: VersiSsk, bulan: number, userId: number,
): Promise<BulanTertutup[]> {
  return withTransaction(async ({ tx }) => {
    await kunciVersiTutup(tx, tahun, sumber, v)
    const ada = await daftarBulanTertutup(tx, tahun, sumber, v)
    const alasan = alasanTolakTutup(ada.map(x => x.bulan), bulan)
    if (alasan) throw new KinerjaAturanTutupError(alasan)
    await tx`
      INSERT INTO kinerja_bulan_tutup (tahun, sumber, versi_tipe, versi_seq, bulan, ditutup_oleh, ditutup_pada)
      VALUES (${tahun}, ${sumber}, ${v.tipe}, ${v.seq}, ${bulan}, ${userId}, ${waktuSekarangWIB()})
    `
    return daftarBulanTertutup(tx, tahun, sumber, v)
  })
}

export async function bukaBulanRealisasi(
  tahun: string, sumber: SumberSSK, v: VersiSsk, bulan: number,
): Promise<BulanTertutup[]> {
  return withTransaction(async ({ tx }) => {
    await kunciVersiTutup(tx, tahun, sumber, v)
    const ada = await daftarBulanTertutup(tx, tahun, sumber, v)
    const alasan = alasanTolakBuka(ada.map(x => x.bulan), bulan)
    if (alasan) throw new KinerjaAturanTutupError(alasan)
    await tx`
      DELETE FROM kinerja_bulan_tutup
      WHERE tahun = ${tahun} AND sumber = ${sumber} AND versi_tipe = ${v.tipe} AND versi_seq = ${v.seq} AND bulan = ${bulan}
    `
    return daftarBulanTertutup(tx, tahun, sumber, v)
  })
}
