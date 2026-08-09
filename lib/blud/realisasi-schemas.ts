// lib/blud/realisasi-schemas.ts — Zod sentral + guard modul Realisasi BLUD.
// Konsep: docs/CONCEPT-blud-realisasi.md §4, §5, §7
//
// Akses TIDAK diputuskan di berkas ini: sejak pembagian peran, izin lihat/input
// ditentukan per menu oleh `bolehLihat`/`bolehInput` di
// `app/api/blud/realisasi/_guard.ts` yang bertumpu pada tabel di `./peran`.
import { z } from 'zod'
import {
  JENIS_TRANSAKSI, JENIS_PEMINDAHAN, JENIS_POTONGAN, POTONGAN_PAJAK, LABEL_POTONGAN,
  nilaiBebanPagu, nilaiArusMasuk, transferNetral,
  sifatAlokasi, wajibBeralokasi, bolehBeralokasi, nilaiAlokasiSeharusnya,
  alasanAlokasiDilarang, bolehBerpotongan, potonganPajak,
} from './alokasi-rule'

// Aturan alokasi hidup di modul daun `alokasi-rule.ts` supaya modal Buku Kas
// (klien) bisa memakainya tanpa ikut menarik `next/server` lewat `./schemas`.
export {
  JENIS_TRANSAKSI, JENIS_PEMINDAHAN, JENIS_POTONGAN, POTONGAN_PAJAK, LABEL_POTONGAN,
  nilaiBebanPagu, nilaiArusMasuk, transferNetral,
  sifatAlokasi, wajibBeralokasi, bolehBeralokasi, nilaiAlokasiSeharusnya,
  alasanAlokasiDilarang, bolehBerpotongan, potonganPajak,
}
export type { JenisTransaksi, JenisPotongan, SifatAlokasi, ArusKas } from './alokasi-rule'

export const BLUD_REALISASI_APP_FLAG = 'app_status_blud_realisasi'

/**
 * Membuka bulan yang sudah ditutup (§4.5). Sengaja lebih ketat dari akses modul:
 * yang dibuka dokumen bertanda tangan, dan §4.6 membuat akibatnya merembet ke
 * seluruh bulan sesudahnya.
 *
 * PERBENDAHARAAN sengaja TIDAK di sini meski `tutup-kas` baginya EDIT: yang
 * menutup dan yang boleh membuka lagi tidak boleh orang yang sama. Kunci itu
 * dipegang atasannya — KEUANGAN — atau admin sistem.
 */
export const BLUD_BUKA_PERIODE_ROLES = ['SUPER_ADMIN', 'ADMIN', 'KEUANGAN'] as const

export function bolehBukaPeriode(role: string): boolean {
  return (BLUD_BUKA_PERIODE_ROLES as readonly string[]).includes(role)
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

/** Awalan `YYYY-MM-` sebuah periode — pengikat `tanggal` ke `(tahun, bulan)`. */
export function awalanBulan(tahun: number, bulan: number): string {
  return `${tahun}-${String(bulan).padStart(2, '0')}-`
}

const BULAN_ID = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'] as const

/** Nama bulan 1–12 untuk pesan galat; di luar rentang dikembalikan apa adanya. */
export function namaBulan(bulan: number): string {
  return BULAN_ID[bulan - 1] ?? String(bulan)
}

/**
 * `nilai` bertanda: positif membebani pagu, negatif mengembalikannya (jenis
 * PENGEMBALIAN). Tandanya diperiksa terhadap sifat transaksi di superRefine —
 * di sini cukup dipastikan bukan nol, karena alokasi nol tidak berarti apa pun.
 */
export const AlokasiSchema = z.object({
  anggaran_key: AnggaranKeySchema,
  nilai: z.number().min(-1e15).max(1e15)
    .refine((n) => Math.abs(n) > 0.005, 'Nilai alokasi tidak boleh nol'),
})

export const JenisPotonganSchema = z.enum(JENIS_POTONGAN)

export const PotonganSchema = z.object({
  /**
   * B1 — identitas baris potongan. Kosong = baris baru; berisi = baris lama yang
   * dipertahankan. Bukti Setor yang sudah terbit menunjuk `potongan_id`, jadi
   * tanpa ini `updateTx` (yang menghapus lalu menulis ulang) mencetak id baru
   * untuk baris yang isinya tidak berubah, dan slip yang sudah ditandatangani
   * kehilangan barisnya hanya karena uraian transaksinya dibetulkan.
   *
   * Di `createTx` nilainya diabaikan — semua potongan di sana memang baru.
   */
  id: z.number().int().positive().nullish(),
  jenis: JenisPotonganSchema,
  keterangan: z.string().trim().max(191).nullish(),
  nilai: z.number().gt(0, 'Nilai potongan harus lebih dari 0').max(1e15),
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
  /** Pajak/potongan yang ditahan dari pembayaran ini lalu langsung disetorkan. */
  potongan: z.array(PotonganSchema).max(20, 'Maksimal 20 potongan per transaksi').default([]),
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
  if (JENIS_PEMINDAHAN.includes(v.jenis) && !transferNetral(v)) {
    ctx.addIssue({
      code: 'custom', path: ['jenis'],
      message: 'Ambil/setor bank hanya memindahkan uang: nilai masuk harus sama dengan nilai keluar. '
        + 'Kalau ini pengeluaran sungguhan, pilih jenis lain dan bebankan ke baris anggaran.',
    })
  }
  if (v.jenis === 'PENGEMBALIAN' && nilaiBebanPagu(v) > 0) {
    ctx.addIssue({
      code: 'custom', path: ['jenis'],
      message: 'Pengembalian belanja hanya menerima uang masuk — kolom keluar harus kosong.',
    })
  }

  // Dua arah dijawab satu predikat: yang wajib tidak boleh kosong, yang dilarang
  // tidak boleh terisi. Menjaga satu arah saja meninggalkan yang lain menganga —
  // alokasi pada transaksi tanpa belanja menggerus pagu tanpa uang keluar.
  const sifat = sifatAlokasi(v)
  if (sifat === 'DILARANG' && v.alokasi.length) {
    ctx.addIssue({ code: 'custom', path: ['alokasi'], message: alasanAlokasiDilarang(v) })
  }
  if (sifat === 'WAJIB' && !v.alokasi.length) {
    ctx.addIssue({
      code: 'custom', path: ['alokasi'],
      message: 'Uang keluar wajib dibebankan ke baris anggaran. '
        + 'Kalau rekeningnya memang belum ada di DPA, centang "parkir" supaya tercatat sebagai utang pekerjaan.',
    })
  }
  if (sifat === 'WAJIB_KEMBALI' && !v.alokasi.length) {
    ctx.addIssue({
      code: 'custom', path: ['alokasi'],
      message: 'Pengembalian belanja wajib menunjuk baris anggaran mana yang serapannya dikurangi.',
    })
  }
  if (sifat === 'WAJIB' && v.alokasi.some((a) => a.nilai < 0)) {
    ctx.addIssue({
      code: 'custom', path: ['alokasi'],
      message: 'Alokasi belanja tidak boleh negatif — untuk mengembalikan belanja, pilih jenis "Pengembalian belanja".',
    })
  }
  if (sifat === 'WAJIB_KEMBALI' && v.alokasi.some((a) => a.nilai > 0)) {
    ctx.addIssue({
      code: 'custom', path: ['alokasi'],
      message: 'Alokasi pengembalian harus bernilai negatif — ia mengurangi serapan, bukan menambah.',
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

  if (v.potongan.length) {
    if (!bolehBerpotongan(v)) {
      ctx.addIssue({
        code: 'custom', path: ['potongan'],
        message: 'Potongan hanya bisa ditahan dari pembayaran belanja yang dibebankan ke baris anggaran.',
      })
    } else {
      const totalPotongan = v.potongan.reduce((s, p) => s + p.nilai, 0)
      if (totalPotongan > nilaiBebanPagu(v) + 0.005) {
        ctx.addIssue({
          code: 'custom', path: ['potongan'],
          message: 'Jumlah potongan melebihi nilai pembayaran — yang ditahan tidak bisa lebih besar dari yang dibayarkan.',
        })
      }
    }
  }
})
export type TransaksiInput = z.infer<typeof TransaksiInputSchema>

/**
 * S1: `tanggal` diikat ke `(tahun_anggaran, bulan)`. Tanpa ini keduanya jadi dua
 * nilai lepas, dan dua kelompok lembar SPJ mengelompokkan dari sumber berbeda —
 * BKU/Tutup Kas dari kolom `bulan`, lembar GU & register dari kolom `tanggal`.
 * Cukup satu salah ketik untuk membuat dua lembar dari data yang sama tak cocok,
 * atau menyusupkan tanggal ke bulan yang sudah ditutup lewat bulan yang buka.
 */
export const CreateTxBodySchema = z.object({
  tahun_anggaran: z.coerce.number().int().gte(2000).lte(2100),
  bulan: BulanSchema,
  transaksi: TransaksiInputSchema,
}).superRefine((v, ctx) => {
  if (!v.transaksi.tanggal.startsWith(awalanBulan(v.tahun_anggaran, v.bulan))) {
    ctx.addIssue({
      code: 'custom', path: ['transaksi', 'tanggal'],
      message: `Tanggal harus berada di dalam bulan ${v.bulan}/${v.tahun_anggaran} — periode itu yang sedang dibuka.`,
    })
  }
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

/**
 * R3 — saldo awal tahun. Nomor bulan sengaja tidak diterima: yang dimaksud selalu
 * awal tahun (§4.6 — bulan lain diturunkan, tidak disimpan). Kalau bulan ikut
 * dikirim, cepat atau lambat ada yang mengirim `bulan: 6` dan mengira ia sedang
 * membetulkan Juni.
 */
export const SaldoAwalBodySchema = z.object({
  tahun_anggaran: z.coerce.number().int().gte(2000).lte(2100),
  saldo_awal_kas: RupiahSchema,
  saldo_awal_bank: RupiahSchema,
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
  const awalan = awalanBulan(v.tahun_anggaran, v.bulan)
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

/**
 * S1 — pasangan pagar Zod di sisi data layer. Jalur PATCH tidak pernah menerima
 * `bulan` dari klien (diambil dari baris DB), jadi pemeriksaannya memang hanya
 * bisa dilakukan di sini, sesudah bulan aslinya terbaca.
 */
export class BludTanggalDiLuarBulanError extends Error {
  constructor(public tahun: number, public bulan: number, public tanggal: string) {
    super(
      `Tanggal ${tanggal} berada di luar bulan ${bulan}/${tahun}. `
      + 'Transaksi tercatat di bulan itu, jadi tanggalnya harus ikut — kalau memang bulan lain, '
      + 'buka bulan tersebut lalu catat di sana.',
    )
    this.name = 'BludTanggalDiLuarBulanError'
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

/** Alokasi menempel pada transaksi yang tidak boleh membebani anggaran. */
export class BludAlokasiTerlarangError extends Error {
  constructor(alasan: string) {
    super(alasan)
    this.name = 'BludAlokasiTerlarangError'
  }
}

/**
 * Pengembalian lebih besar daripada yang pernah terserap di baris itu. Dibiarkan
 * lolos, serapan jadi negatif dan sisa anggaran melampaui pagunya sendiri.
 */
export class BludSerapanNegatifError extends Error {
  constructor(public kodeRekening: string, public terserap: number, public nilai: number) {
    super(`Pengembalian ${Math.abs(nilai)} melebihi serapan ${kodeRekening} yang baru ${terserap}.`)
    this.name = 'BludSerapanNegatifError'
  }
}

export class BludPotonganTidakSahError extends Error {
  constructor(alasan: string) {
    super(alasan)
    this.name = 'BludPotonganTidakSahError'
  }
}

/**
 * B1 — potongan yang sudah masuk Bukti Setor tidak boleh hilang diam-diam.
 * `ON DELETE SET NULL` pada `blud_bukti_setor_baris.potongan_id` itu jaring
 * pengaman terakhir, bukan izin merusak dokumen yang sudah terbit: barisnya akan
 * tetap ada di slip dengan penunjuk kosong, dan tidak ada satu layar pun yang
 * memberitahu kenapa. Kalau penghapusan memang disengaja, slipnya dicabut dulu.
 */
export class BludPotonganTerpakaiError extends Error {
  constructor(public readonly potonganId: number, public readonly nomorBukti: string[]) {
    super(
      `Potongan ini sudah masuk Bukti Setor ${nomorBukti.join(', ')}. `
      + 'Batalkan atau ubah bukti setornya dulu sebelum menghapus potongan.',
    )
    this.name = 'BludPotonganTerpakaiError'
  }
}

/**
 * B1 — `id` potongan yang dikirim klien bukan milik transaksi ini.
 *
 * Ditolak terang-terangan, bukan sekadar disaring `AND tx_id = ?` pada UPDATE.
 * Dengan syarat itu saja barisnya memang tidak tersunting (IDOR tertutup), TAPI
 * baris itu juga terlewat filter "baris baru" — jadi potongannya lenyap tanpa
 * satu pun pesan. Diam yang benar tetap lebih buruk daripada penolakan.
 */
export class BludPotonganAsingError extends Error {
  constructor(public readonly txId: number, public readonly asing: number[]) {
    super(
      `${asing.length} potongan yang dikirim bukan milik transaksi ini (id ${asing.join(', ')}). `
      + 'Muat ulang halaman lalu ulangi.',
    )
    this.name = 'BludPotonganAsingError'
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

/**
 * S2 — arah kebalikan `BludTutupTerhalangError`. Saldo awal sebuah bulan tidak
 * disimpan, dihitung ulang dari bulan-bulan sebelumnya (§4.6); membuka bulan lama
 * berarti seluruh bulan sesudahnya ikut bergeser tanpa pemberitahuan.
 */
export class BludBukaTerhalangError extends Error {
  constructor(public bulan: number, public bulanTutup: number[]) {
    super(
      `Tidak bisa membuka ${namaBulan(bulan)}. `
      + `Tutup kas ${bulanTutup.map(namaBulan).join(', ')} perlu dibuka lebih dulu — `
      + 'saldo awal bulan-bulan itu dihitung dari bulan ini, jadi ikut bergeser begitu isinya berubah.',
    )
    this.name = 'BludBukaTerhalangError'
  }
}

/**
 * R3 — saldo awal tahun sudah tidak boleh disentuh. Bukan soal siapa: begitu satu
 * bulan ditutup, angka ini jadi dasar berita acara yang sudah ditandatangani, dan
 * menggesernya menggeser seluruh saldo tahun itu tanpa ada yang tahu.
 */
export class BludSaldoAwalTerkunciError extends Error {
  constructor(public tahun: number, public bulanTutup: number[]) {
    super(
      `Saldo awal ${tahun} tidak bisa diubah lagi — `
      + `tutup kas ${bulanTutup.map(namaBulan).join(', ')} sudah ditandatangani atasnya. `
      + 'Buka kembali Januari lebih dulu bila angkanya memang keliru.',
    )
    this.name = 'BludSaldoAwalTerkunciError'
  }
}

/**
 * R1 — permintaan sudah tidak berstatus MENUNGGU, jadi tidak ada yang berubah.
 * Dibedakan dari "tidak ditemukan" supaya route bisa membalas 409 (bukan 404)
 * dan yang lebih penting: TIDAK mengirim notifikasi dan TIDAK menulis audit.
 */
export class BludPermintaanTidakMenungguError extends Error {
  constructor(public id: number, public status: string) {
    super(`Permintaan ini sudah berstatus ${status} — tidak ada yang bisa ditolak lagi.`)
    this.name = 'BludPermintaanTidakMenungguError'
  }
}

export class BludTxConflictError extends Error {
  constructor(public id: number, public expected: number, public actual: number) {
    super('Transaksi ini sudah diubah pengguna lain. Memuat versi terbaru.')
    this.name = 'BludTxConflictError'
  }
}
