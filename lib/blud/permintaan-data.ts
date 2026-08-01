// lib/blud/permintaan-data.ts — permintaan pergeseran / penambahan rekening.
// Konsep: docs/CONCEPT-blud-realisasi.md §4.1, §4.2
//
// Tabel ini TIDAK PERNAH menyentuh pagu. Ia hanya mencatat "ada yang perlu
// digeser" supaya permintaan bendahara tidak hilang di percakapan WA, dan supaya
// ada jejak siapa meminta apa. Angkanya tetap ditentukan manusia di menu
// Pergeseran — keputusan eksplisit §4.1, bukan pengisian otomatis.

import { sql, execWrite } from '@/lib/data/db'
import { BludPermintaanTidakMenungguError } from './realisasi-schemas'
import { getPaguMap, getTerserap } from './pagu'

export type JenisPermintaan = 'PERGESERAN' | 'REKENING_BARU'
export type StatusPermintaan = 'MENUNGGU' | 'SELESAI' | 'DITOLAK'

export interface Permintaan {
  id: number
  tahun_anggaran: number
  jenis: JenisPermintaan
  anggaran_key: string | null
  kode_rekening: string | null
  uraian: string
  kekurangan: number
  status: StatusPermintaan
  tx_id: number | null
  diminta_username: string | null
  diminta_at: string
  selesai_at: string | null
}

export interface PermintaanInput {
  tahun_anggaran: number
  jenis: JenisPermintaan
  anggaran_key?: string | null
  kode_rekening?: string | null
  uraian: string
  kekurangan?: number
  tx_id?: number | null
}

const toWaktu = (v: unknown): string => {
  if (v instanceof Date) return v.toISOString()
  return String(v ?? '')
}

function normalisasi(r: Record<string, unknown>): Permintaan {
  return {
    id: Number(r.id),
    tahun_anggaran: Number(r.tahun_anggaran),
    jenis: String(r.jenis) as JenisPermintaan,
    anggaran_key: r.anggaran_key != null ? String(r.anggaran_key) : null,
    kode_rekening: r.kode_rekening != null ? String(r.kode_rekening) : null,
    uraian: String(r.uraian ?? ''),
    kekurangan: Number(r.kekurangan ?? 0),
    status: String(r.status) as StatusPermintaan,
    tx_id: r.tx_id != null ? Number(r.tx_id) : null,
    diminta_username: r.diminta_username != null ? String(r.diminta_username) : null,
    diminta_at: toWaktu(r.diminta_at),
    selesai_at: r.selesai_at != null ? toWaktu(r.selesai_at) : null,
  }
}

export async function listPermintaan(tahun: number, status?: StatusPermintaan): Promise<Permintaan[]> {
  const rows = status
    ? await sql`
        SELECT id, tahun_anggaran, jenis, anggaran_key, kode_rekening, uraian, kekurangan,
               status, tx_id, diminta_username, diminta_at, selesai_at
        FROM blud_permintaan
        WHERE tahun_anggaran = ${tahun} AND status = ${status}
        ORDER BY diminta_at DESC, id DESC
      `
    : await sql`
        SELECT id, tahun_anggaran, jenis, anggaran_key, kode_rekening, uraian, kekurangan,
               status, tx_id, diminta_username, diminta_at, selesai_at
        FROM blud_permintaan
        WHERE tahun_anggaran = ${tahun}
        ORDER BY diminta_at DESC, id DESC
      `
  return (rows as Record<string, unknown>[]).map(normalisasi)
}

export async function countMenunggu(tahun: number): Promise<number> {
  const rows = await sql`
    SELECT COUNT(*) AS n FROM blud_permintaan
    WHERE tahun_anggaran = ${tahun} AND status = 'MENUNGGU'
  ` as { n?: unknown }[]
  return Number(rows[0]?.n ?? 0)
}

/**
 * Permintaan yang sama diajukan dua kali (bendahara mencoba menyimpan lagi lalu
 * ditolak lagi) tidak membuat baris baru — hanya nilai kekurangannya diperbarui.
 * Tanpa ini baki penuh permintaan kembar untuk satu rekening yang sama.
 */
export async function createPermintaan(
  input: PermintaanInput,
  userId: number,
  username: string,
): Promise<{ id: number; baru: boolean }> {
  const key = input.anggaran_key ?? null
  const txId = input.tx_id ?? null
  const kekurangan = input.kekurangan ?? 0

  let sudah: unknown[] = []
  if (key) {
    sudah = await sql`
      SELECT id FROM blud_permintaan
      WHERE tahun_anggaran = ${input.tahun_anggaran} AND status = 'MENUNGGU'
        AND jenis = ${input.jenis} AND anggaran_key = ${key}
      LIMIT 1
    `
  } else if (txId != null) {
    sudah = await sql`
      SELECT id FROM blud_permintaan
      WHERE tahun_anggaran = ${input.tahun_anggaran} AND status = 'MENUNGGU'
        AND jenis = ${input.jenis} AND tx_id = ${txId}
      LIMIT 1
    `
  }
  const lama = (sudah as { id?: unknown }[])[0]
  if (lama?.id != null) {
    const id = Number(lama.id)
    await sql`
      UPDATE blud_permintaan
      SET kekurangan = GREATEST(kekurangan, ${kekurangan}), uraian = ${input.uraian}
      WHERE id = ${id}
    `
    return { id, baru: false }
  }

  const res = await sql`
    INSERT INTO blud_permintaan
      (tahun_anggaran, jenis, anggaran_key, kode_rekening, uraian, kekurangan, tx_id, diminta_oleh, diminta_username)
    VALUES
      (${input.tahun_anggaran}, ${input.jenis}, ${key}, ${input.kode_rekening ?? null},
       ${input.uraian}, ${kekurangan}, ${txId}, ${userId}, ${username})
  ` as unknown as Array<{ insertId: number }>
  return { id: Number(res[0]?.insertId ?? 0), baru: true }
}

/**
 * R1 — yang menentukan hasil adalah UPDATE-nya, bukan SELECT sebelumnya.
 *
 * Dulu baris dibaca lalu dikembalikan tanpa memeriksa apakah UPDATE mengenai
 * sesuatu. Permintaan yang sudah `SELESAI`/`DITOLAK` tetap dibalas sukses, tetap
 * mengirim notifikasi "permintaan Anda ditolak" ke pengaju, dan tetap menulis
 * audit — padahal tidak ada yang berubah. Jejak palsu lebih buruk daripada tidak
 * ada jejak: yang membacanya nanti percaya sesuatu memang terjadi.
 *
 * `null` = barisnya tidak ada. Statusnya sudah bukan MENUNGGU = melempar, bukan
 * `null` — dua keadaan berbeda tidak boleh diwakili satu nilai.
 */
async function bacaPermintaan(id: number): Promise<Record<string, unknown> | null> {
  const rows = await sql`
    SELECT id, tahun_anggaran, jenis, anggaran_key, kode_rekening, uraian, kekurangan,
           status, tx_id, diminta_username, diminta_at, selesai_at
    FROM blud_permintaan WHERE id = ${id}
  ` as Record<string, unknown>[]
  return rows[0] ?? null
}

export async function tolakPermintaan(id: number): Promise<Permintaan | null> {
  const sebelum = await bacaPermintaan(id)
  if (!sebelum) return null

  const { affectedRows } = await execWrite(sql`
    UPDATE blud_permintaan SET status = 'DITOLAK', selesai_at = NOW()
    WHERE id = ${id} AND status = 'MENUNGGU'
  `)
  if (affectedRows === 0) {
    throw new BludPermintaanTidakMenungguError(id, String(sebelum.status ?? '-'))
  }

  // Dibaca ULANG, bukan mengembalikan potret sebelum UPDATE. Yang lama masih
  // berisi `status: 'MENUNGGU'` dan `selesai_at: null` — pemanggil yang suatu saat
  // meneruskannya ke klien akan menampilkan "menunggu" untuk permintaan yang baru
  // saja ditolak, lalu orangnya menekan Tolak lagi dan dapat 409. `selesai_at`
  // juga harus datang dari `NOW()` MySQL, bukan ditebak dengan jam JS.
  const sesudah = await bacaPermintaan(id)
  return normalisasi(sesudah ?? sebelum)
}

/**
 * Dipanggil setelah Pergeseran tersimpan: permintaan yang sudah terpenuhi
 * ditutup sendiri. "Terpenuhi" = pagu baris itu kini cukup menampung serapannya
 * plus kekurangan yang diminta. Untuk REKENING_BARU cukup barisnya ada.
 *
 * Sengaja dijalankan SETELAH commit pergeseran, bukan di dalamnya: gagal menutup
 * permintaan tidak boleh membatalkan pergeseran yang sudah benar.
 */
export async function selesaikanPermintaanTerpenuhi(tahun: number): Promise<Permintaan[]> {
  const menunggu = await listPermintaan(tahun, 'MENUNGGU')
  if (!menunggu.length) return []

  const [pagu, terserap] = await Promise.all([getPaguMap(tahun), getTerserap(tahun)])
  const kodeAda = new Set<string>()
  for (const b of pagu.values()) if (b.kode_rekening) kodeAda.add(b.kode_rekening)

  const selesai: Permintaan[] = []
  for (const p of menunggu) {
    let cukup = false
    if (p.jenis === 'REKENING_BARU') {
      cukup = !!p.kode_rekening && kodeAda.has(p.kode_rekening)
    } else if (p.anggaran_key) {
      const baris = pagu.get(p.anggaran_key)
      if (baris) cukup = baris.pagu - (terserap.get(p.anggaran_key) ?? 0) >= p.kekurangan
    }
    if (!cukup) continue
    await sql`UPDATE blud_permintaan SET status = 'SELESAI', selesai_at = NOW() WHERE id = ${p.id} AND status = 'MENUNGGU'`
    selesai.push(p)
  }
  return selesai
}
