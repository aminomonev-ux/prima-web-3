// lib/blud/realisasi-schemas.ts — Zod sentral + guard modul Realisasi BLUD.
// Konsep: docs/CONCEPT-blud-realisasi.md §4, §5, §7
//
// Akses: mengikuti BLUD (SUPER_ADMIN + ADMIN + grant app_access 'blud').
// Pemisahan izin INPUT vs LIHAT sudah dipasang di sini sejak awal walau untuk
// sekarang keduanya diberikan penuh — saat pembagian role diaktifkan nanti,
// yang berubah cuma isi dua fungsi ini, bukan route-nya (§7.4).
import { z } from 'zod'
import { isBludRole } from './schemas'
import {
  JENIS_TRANSAKSI, JENIS_PEMINDAHAN, nilaiBebanPagu, transferNetral, wajibBeralokasi,
} from './alokasi-rule'

// Aturan alokasi hidup di modul daun `alokasi-rule.ts` supaya modal Buku Kas
// (klien) bisa memakainya tanpa ikut menarik `next/server` lewat `./schemas`.
export {
  JENIS_TRANSAKSI, JENIS_PEMINDAHAN, nilaiBebanPagu, transferNetral, wajibBeralokasi,
}
export type { JenisTransaksi, ArusKas } from './alokasi-rule'

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

export const JenisTransaksiSchema = z.enum(JENIS_TRANSAKSI)

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
  if (JENIS_PEMINDAHAN.includes(v.jenis) && !transferNetral(v)) {
    ctx.addIssue({
      code: 'custom', path: ['jenis'],
      message: 'Ambil/setor bank hanya memindahkan uang: nilai masuk harus sama dengan nilai keluar. '
        + 'Kalau ini pengeluaran sungguhan, pilih jenis lain dan bebankan ke baris anggaran.',
    })
  }
  if (wajibBeralokasi(v) && !v.alokasi.length) {
    ctx.addIssue({
      code: 'custom', path: ['alokasi'],
      message: 'Uang keluar wajib dibebankan ke baris anggaran. '
        + 'Kalau rekeningnya memang belum ada di DPA, centang "parkir" supaya tercatat sebagai utang pekerjaan.',
    })
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

// ─── Body: permintaan pergeseran / rekening baru (§4.1, §4.2) ───────────────

/**
 * `anggaran_key` wajib untuk PERGESERAN (barisnya ada, pagunya kurang) dan
 * dilarang untuk REKENING_BARU (barisnya memang belum ada — itu justru
 * permintaannya). Dipisah di sini supaya route tidak perlu bercabang.
 */
export const PermintaanBodySchema = z.object({
  tahun_anggaran: z.coerce.number().int().gte(2000).lte(2100),
  jenis: z.enum(['PERGESERAN', 'REKENING_BARU']),
  anggaran_key: AnggaranKeySchema.nullish(),
  kode_rekening: z.string().max(64).nullish(),
  uraian: z.string().trim().min(3, 'Uraian minimal 3 karakter').max(2000),
  kekurangan: RupiahSchema.default(0),
  tx_id: z.coerce.number().int().positive().nullish(),
}).superRefine((v, ctx) => {
  if (v.jenis === 'PERGESERAN' && !v.anggaran_key) {
    ctx.addIssue({ code: 'custom', message: 'Permintaan pergeseran wajib menunjuk baris anggaran' })
  }
  if (v.jenis === 'REKENING_BARU' && !v.tx_id) {
    ctx.addIssue({ code: 'custom', message: 'Permintaan rekening baru wajib menyebut transaksi pemicunya' })
  }
})

export const PatchPermintaanSchema = z.object({
  id: z.coerce.number().int().positive(),
  aksi: z.enum(['TOLAK']),
})

// ─── Body: Tutup Kas (§4.7) ─────────────────────────────────────────────────

/**
 * Yang diterima dari klien HANYA sisi B (dua angka hasil pemeriksaan nyata) dan
 * kelengkapan surat. Sisi A tidak pernah dikirim — dihitung ulang di server dari
 * transaksi. Menerima saldo buku dari klien = membiarkan bulan jomplang ditutup
 * lewat satu panggilan curl.
 */
export const TutupKasBodySchema = z.object({
  tahun_anggaran: z.coerce.number().int().gte(2000).lte(2100),
  bulan: BulanSchema,
  kas_fisik: RupiahSchema,
  bank_koran: RupiahSchema,
  no_surat: z.string().trim().max(64).nullish(),
  tgl_surat: TanggalTxSchema.nullish(),
  /** false = simpan sisi nyata saja (belum berkomitmen menutup bulan). */
  tutup: z.boolean().default(false),
})

export const BukaPeriodeQuerySchema = z.object({
  tahun: z.coerce.number().int().gte(2000).lte(2100),
  bulan: BulanSchema,
  alasan: z.string().trim().min(10, 'Alasan membuka periode minimal 10 karakter').max(500),
})

// ─── Body: periode GU (§3.2) ────────────────────────────────────────────────

/**
 * Satu bulan boleh punya beberapa pengajuan GU. Rentang wajib berada di dalam
 * bulan yang bersangkutan dan tidak boleh saling tindih — dua lembar GU yang
 * beririsan berarti belanja yang sama diajukan penggantiannya dua kali.
 */
export const GuPeriodeSchema = z.object({
  tgl_awal: TanggalTxSchema,
  tgl_akhir: TanggalTxSchema,
  no_surat: z.string().trim().max(64).nullish(),
}).refine((v) => v.tgl_awal <= v.tgl_akhir, {
  message: 'Tanggal akhir tidak boleh mendahului tanggal mulai', path: ['tgl_akhir'],
})

export const SimpanGuBodySchema = z.object({
  tahun_anggaran: z.coerce.number().int().gte(2000).lte(2100),
  bulan: BulanSchema,
  periode: z.array(GuPeriodeSchema).max(10, 'Maksimal 10 pengajuan GU per bulan'),
}).superRefine((v, ctx) => {
  const bl = String(v.bulan).padStart(2, '0')
  const awalan = `${v.tahun_anggaran}-${bl}-`
  for (const p of v.periode) {
    if (!p.tgl_awal.startsWith(awalan) || !p.tgl_akhir.startsWith(awalan)) {
      ctx.addIssue({ code: 'custom', path: ['periode'], message: 'Rentang GU harus berada di dalam bulan yang dipilih' })
      return
    }
  }
  const urut = [...v.periode].sort((a, b) => a.tgl_awal.localeCompare(b.tgl_awal))
  for (let i = 1; i < urut.length; i++) {
    if (urut[i].tgl_awal <= urut[i - 1].tgl_akhir) {
      ctx.addIssue({
        code: 'custom', path: ['periode'],
        message: `Rentang GU saling tindih (${urut[i - 1].tgl_awal}–${urut[i - 1].tgl_akhir} dan ${urut[i].tgl_awal}–${urut[i].tgl_akhir})`,
      })
      return
    }
  }
})

// ─── Body: pejabat penanda tangan SPJ ───────────────────────────────────────

export const JabatanSpjSchema = z.enum(['DIREKTUR', 'BENDAHARA', 'PPK'])
export type JabatanSpj = z.infer<typeof JabatanSpjSchema>

export const PEJABAT_SPJ_LABEL: Record<JabatanSpj, string> = {
  DIREKTUR: 'Direktur',
  BENDAHARA: 'Bendahara Pengeluaran',
  PPK: 'PPK-BLUD',
}

/**
 * Nilainya SALINAN, bukan rujukan ke pk_pejabat (keputusan #29). `pk_pejabat_id`
 * hanya jejak asal — tidak pernah dipakai untuk JOIN saat mencetak, supaya SPJ
 * yang sudah ditandatangani tidak ikut berubah waktu master PK diperbarui.
 */
export const PejabatSpjSchema = z.object({
  jabatan: JabatanSpjSchema,
  nama: z.string().trim().min(2, 'Nama pejabat wajib diisi').max(128),
  nip: z.string().trim().max(32).nullish(),
  pangkat: z.string().trim().max(64).nullish(),
  jabatan_teks: z.string().trim().max(191).nullish(),
  pk_pejabat_id: z.coerce.number().int().positive().nullish(),
})

export const SimpanPejabatBodySchema = z.object({
  tahun_anggaran: z.coerce.number().int().gte(2000).lte(2100),
  pejabat: z.array(PejabatSpjSchema).max(10),
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

export class BludTutupTidakSeimbangError extends Error {
  constructor(public saldoBuku: number, public saldoNyata: number, public selisih: number) {
    super(`Sisi buku (${saldoBuku}) tidak sama dengan sisi nyata (${saldoNyata}). Selisih ${selisih}.`)
    this.name = 'BludTutupTidakSeimbangError'
  }
}

export class BludTutupTerhalangError extends Error {
  constructor(public penghalang: string[]) {
    super(penghalang.join(' '))
    this.name = 'BludTutupTerhalangError'
  }
}

export class BludTxConflictError extends Error {
  constructor(public id: number, public expected: number, public actual: number) {
    super('Transaksi ini sudah diubah pengguna lain. Memuat versi terbaru.')
    this.name = 'BludTxConflictError'
  }
}
