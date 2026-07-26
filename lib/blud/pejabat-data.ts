// lib/blud/pejabat-data.ts — Pejabat penanda tangan dokumen SPJ BLUD.
// Konsep: docs/CONCEPT-blud-realisasi.md §3.1, keputusan #29.
//
// Di Excel, nama & NIP pejabat diketik ulang di 5 lembar berbeda — sumber salah
// ketik yang tidak pernah ketahuan sampai berkasnya sudah ditandatangani.
// Di sini diisi sekali per tahun, dipakai semua lembar.
//
// KEPUTUSAN #29 — pk_pejabat dipakai sebagai SUMBER ISIAN, bukan sumber
// kebenaran. Yang disimpan adalah salinan nama/NIP/pangkat pada saat penetapan.
// Kalau tahun depan pejabatnya berganti di master PK, SPJ tahun ini yang sudah
// dicetak dan ditandatangani tidak boleh ikut berubah — maka TIDAK ADA JOIN ke
// pk_pejabat di jalur cetak, dan tidak ada FK yang bisa menariknya.
import { sql, withTransaction, bulkInsert, toMysqlDatetime } from '@/lib/data/db'
import type { JabatanSpj } from './realisasi-schemas'

export interface PejabatSpj {
  jabatan: JabatanSpj
  nama: string
  nip: string | null
  pangkat: string | null
  jabatan_teks: string | null
  pk_pejabat_id: number | null
  disalin_at: string | null
}

export interface SaranPejabatPk {
  pk_pejabat_id: number
  unit_kerja: string
  nama: string
  jabatan: string
  pangkat: string | null
  nip: string | null
}

const teks = (v: unknown): string | null => {
  const s = v == null ? '' : String(v).trim()
  return s === '' ? null : s
}

export async function listPejabat(tahun: number): Promise<PejabatSpj[]> {
  const rows = await sql`
    SELECT jabatan, nama, nip, pangkat, jabatan_teks, pk_pejabat_id, disalin_at
    FROM blud_pejabat
    WHERE tahun_anggaran = ${tahun}
    ORDER BY FIELD(jabatan, 'DIREKTUR', 'BENDAHARA', 'PPK')
  ` as Record<string, unknown>[]
  return rows.map((r) => ({
    jabatan: String(r.jabatan) as JabatanSpj,
    nama: String(r.nama ?? ''),
    nip: teks(r.nip),
    pangkat: teks(r.pangkat),
    jabatan_teks: teks(r.jabatan_teks),
    pk_pejabat_id: r.pk_pejabat_id != null ? Number(r.pk_pejabat_id) : null,
    disalin_at: r.disalin_at != null ? String(r.disalin_at) : null,
  }))
}

/** Peta siap cetak — dipakai blok tanda tangan di sheet SPJ/pengantar/TUTUP KAS. */
export async function getPejabatCetak(tahun: number): Promise<Record<string, PejabatSpj>> {
  const peta: Record<string, PejabatSpj> = {}
  for (const p of await listPejabat(tahun)) peta[p.jabatan] = p
  return peta
}

export interface SimpanPejabatInput {
  jabatan: JabatanSpj
  nama: string
  nip?: string | null
  pangkat?: string | null
  jabatan_teks?: string | null
  pk_pejabat_id?: number | null
}

/**
 * Replace-all per tahun: daftarnya cuma 3 baris, dan mengganti seluruhnya lebih
 * jujur daripada menambal per baris — pejabat yang dihapus dari layar memang
 * harus hilang, bukan tertinggal sebagai sisa versi lama.
 */
export async function simpanPejabat(
  tahun: number, daftar: SimpanPejabatInput[], userId: number,
): Promise<PejabatSpj[]> {
  await withTransaction(async ({ tx, conn }) => {
    await tx`DELETE FROM blud_pejabat WHERE tahun_anggaran = ${tahun}`
    if (!daftar.length) return
    await bulkInsert(
      'blud_pejabat',
      ['tahun_anggaran', 'jabatan', 'nama', 'nip', 'pangkat', 'jabatan_teks', 'pk_pejabat_id', 'disalin_at', 'updated_by'],
      daftar.map((p) => [
        tahun, p.jabatan, p.nama.trim(),
        p.nip?.trim() || null,
        p.pangkat?.trim() || null,
        p.jabatan_teks?.trim() || null,
        p.pk_pejabat_id ?? null,
        p.pk_pejabat_id ? toMysqlDatetime(new Date()) : null,
        userId,
      ]),
      conn,
    )
  })
  return listPejabat(tahun)
}

/**
 * Daftar saran dari master Perjanjian Kinerja. Read-only — hanya untuk mengisi
 * form; yang tersimpan tetap salinannya (keputusan #29).
 *
 * pk_pejabat memuat jabatan STRUKTURAL (Direktur/Wadir/Kabid/Kabag/Kasubbag).
 * Peran perbendaharaan seperti Bendahara Pengeluaran & PPK-BLUD tidak ada di
 * sana, jadi untuk dua peran itu daftarnya tetap berguna sebagai sumber nama +
 * NIP, sementara bunyi jabatannya diketik sendiri.
 */
export async function sarankanDariPk(tahun: number): Promise<SaranPejabatPk[]> {
  const rows = await sql`
    SELECT id, unit_kerja, nama, jabatan, pangkat, nip
    FROM pk_pejabat
    WHERE tahun = ${String(tahun)} AND is_active = TRUE
    ORDER BY unit_kerja ASC, nama ASC
  ` as Record<string, unknown>[]
  return rows.map((r) => ({
    pk_pejabat_id: Number(r.id),
    unit_kerja: String(r.unit_kerja ?? ''),
    nama: String(r.nama ?? ''),
    jabatan: String(r.jabatan ?? ''),
    pangkat: teks(r.pangkat),
    nip: teks(r.nip),
  }))
}
