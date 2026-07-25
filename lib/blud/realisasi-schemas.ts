// lib/blud/realisasi-schemas.ts — Zod sentral + guard modul Realisasi BLUD.
// Konsep: docs/CONCEPT-blud-realisasi.md §4, §5, §7
//
// Akses: mengikuti BLUD (SUPER_ADMIN + ADMIN + grant app_access 'blud').
// Pemisahan izin INPUT vs LIHAT sudah dipasang di sini sejak awal walau untuk
// sekarang keduanya diberikan penuh — saat pembagian role diaktifkan nanti,
// yang berubah cuma isi dua fungsi ini, bukan route-nya (§7.4).
import { z } from 'zod'
import { isBludRole } from './schemas'

export const BLUD_REALISASI_APP_FLAG = 'app_status_blud_realisasi'

export function canViewRealisasi(role: string, appAccess: string[] | null | undefined): boolean {
  return isBludRole(role, appAccess)
}

export function canInputRealisasi(role: string, appAccess: string[] | null | undefined): boolean {
  return isBludRole(role, appAccess)
}

// ─── Primitives ─────────────────────────────────────────────────────────────

export const BulanSchema = z.coerce.number().int().gte(1).lte(12)
export const RupiahSchema = z.number().min(0).max(1e15)
export const AnggaranKeySchema = z.string().min(1).max(64)

export const JenisTransaksiSchema = z.enum([
  'BELANJA', 'AMBIL_BANK', 'SETOR_BANK', 'PENERIMAAN', 'LAIN',
])
export type JenisTransaksi = z.infer<typeof JenisTransaksiSchema>

export const TanggalTxSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Tanggal harus format YYYY-MM-DD')
  .refine((v) => !Number.isNaN(new Date(v).getTime()), 'Tanggal tidak valid')

export const AlokasiSchema = z.object({
  anggaran_key: AnggaranKeySchema,
  nilai: z.number().gt(0, 'Nilai alokasi harus lebih dari 0').max(1e15),
})

// ─── Body: simpan transaksi ─────────────────────────────────────────────────

/**
 * Satu transaksi = satu baris BKU. Alokasi ke baris anggaran dipisah supaya
 * satu kuitansi bisa dibebankan ke beberapa barang (§2.5 — kasus Belanja Modal).
 *
 * `no_kwt` sengaja TIDAK diterima dari klien: nomor kuitansi diberikan server
 * berurutan per (tahun, bulan) supaya tidak bentrok antar-penginput (§5.4).
 */
export const TransaksiInputSchema = z.object({
  tanggal: TanggalTxSchema,
  jenis: JenisTransaksiSchema.default('BELANJA'),
  uraian: z.string().min(1, 'Uraian wajib diisi').max(2000),
  kas_masuk: RupiahSchema.default(0),
  kas_keluar: RupiahSchema.default(0),
  bank_masuk: RupiahSchema.default(0),
  bank_keluar: RupiahSchema.default(0),
  alokasi: z.array(AlokasiSchema).max(200, 'Maksimal 200 alokasi per transaksi').default([]),
  /** Diparkir: uang sudah keluar tapi rekeningnya belum ada di DPA (§4.2). */
  belum_berrekening: z.boolean().default(false),
}).superRefine((v, ctx) => {
  const total = v.kas_masuk + v.kas_keluar + v.bank_masuk + v.bank_keluar
  if (total <= 0) {
    ctx.addIssue({ code: 'custom', path: ['kas_keluar'], message: 'Transaksi tanpa nilai — isi salah satu kolom kas/bank' })
  }
  if (v.kas_masuk > 0 && v.kas_keluar > 0) {
    ctx.addIssue({ code: 'custom', path: ['kas_keluar'], message: 'Satu transaksi tidak boleh kas masuk dan kas keluar sekaligus' })
  }
  if (v.bank_masuk > 0 && v.bank_keluar > 0) {
    ctx.addIssue({ code: 'custom', path: ['bank_keluar'], message: 'Satu transaksi tidak boleh bank masuk dan bank keluar sekaligus' })
  }
  if (v.belum_berrekening && v.alokasi.length) {
    ctx.addIssue({ code: 'custom', path: ['alokasi'], message: 'Transaksi diparkir tidak boleh punya alokasi' })
  }
  const kunci = new Set<string>()
  for (const a of v.alokasi) {
    if (kunci.has(a.anggaran_key)) {
      ctx.addIssue({ code: 'custom', path: ['alokasi'], message: 'Satu baris anggaran muncul dua kali — gabungkan jadi satu alokasi' })
      break
    }
    kunci.add(a.anggaran_key)
  }
})
export type TransaksiInput = z.infer<typeof TransaksiInputSchema>

export const CreateTxBodySchema = z.object({
  tahun_anggaran: z.coerce.number().int().gte(2000).lte(2100),
  bulan: BulanSchema,
  transaksi: TransaksiInputSchema,
})

export const UpdateTxBodySchema = z.object({
  id: z.number().int().positive(),
  expected_version: z.number().int().gte(0),
  transaksi: TransaksiInputSchema,
})

export const ListTxQuerySchema = z.object({
  tahun: z.coerce.number().int().gte(2000).lte(2100),
  bulan: BulanSchema.optional(),
})

// ─── Error domain ───────────────────────────────────────────────────────────

export class BludPeriodeTertutupError extends Error {
  constructor(public tahun: number, public bulan: number) {
    super(`Periode ${bulan}/${tahun} sudah ditutup. Minta SUPER_ADMIN membuka kembali.`)
    this.name = 'BludPeriodeTertutupError'
  }
}

export class BludTahunTanpaDpaError extends Error {
  constructor(public tahun: number) {
    super(`Tahun ${tahun} belum punya DPA. Susun DPA dulu sebelum mencatat realisasi.`)
    this.name = 'BludTahunTanpaDpaError'
  }
}

export class BludAlokasiTidakSeimbangError extends Error {
  constructor(public nilaiTransaksi: number, public totalAlokasi: number) {
    super(`Total alokasi (${totalAlokasi}) tidak sama dengan nilai transaksi (${nilaiTransaksi}).`)
    this.name = 'BludAlokasiTidakSeimbangError'
  }
}

export interface PaguTerlampauiDetail {
  anggaran_key: string
  kode_rekening: string
  uraian: string
  pagu: number
  terserap: number
  nilai: number
  kekurangan: number
}

export class BludPaguTerlampauiError extends Error {
  constructor(public detail: PaguTerlampauiDetail) {
    super(`Melebihi pagu ${detail.kode_rekening}: kurang ${detail.kekurangan}.`)
    this.name = 'BludPaguTerlampauiError'
  }
}

export class BludTxConflictError extends Error {
  constructor(public id: number, public expected: number, public actual: number) {
    super('Transaksi ini sudah diubah pengguna lain. Memuat versi terbaru.')
    this.name = 'BludTxConflictError'
  }
}
