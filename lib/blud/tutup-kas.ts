// lib/blud/tutup-kas.ts — Berita Acara Pemeriksaan Kas (Tutup Kas) BLUD.
// Konsep: docs/CONCEPT-blud-realisasi.md §4.5 (kunci periode), §4.6 (saldo awal),
// §4.7 (dua sisi wajib bertemu).
//
// Bentuk bakunya dua sisi yang HARUS sama:
//   SISI A menurut buku   = saldo awal + Σ masuk − Σ keluar   (DIHITUNG, tak diketik)
//   SISI B menurut nyata  = uang tunai + saldo rekening koran (DIKETIK dua angka)
// Selisih ≠ 0 → bulan tidak boleh ditutup. Tidak ada kotak "penyesuaian" bebas:
// itu persis cara berkas Juni 2026 jadi tidak seimbang tanpa ada yang tahu
// (A = −650.471.561 vs B = 4.883.802.451).
import { sql, withTransaction } from '@/lib/data/db'
import { getSaldoAwal } from './realisasi-data'
import {
  BludPeriodeTertutupError, BludTutupTidakSeimbangError, BludTutupTerhalangError,
  BludBukaTerhalangError,
} from './realisasi-schemas'

/** Toleransi pembulatan DECIMAL(18,2) — bukan izin selisih. */
const NOL = 0.005

export interface NeracaKas {
  tahun_anggaran: number
  bulan: number
  status: 'BUKA' | 'TUTUP'
  // Sisi A — dihitung
  saldo_awal_kas: number
  saldo_awal_bank: number
  masuk_kas: number
  masuk_bank: number
  keluar_kas: number
  keluar_bank: number
  /**
   * Arus dari/ke LUAR — pemindahan bank↔kas sudah dibersihkan (§4.7).
   * Mengambil Rp 440 juta dari bank ke brankas bukan penerimaan: uangnya milik
   * sendiri, cuma pindah tempat. Kalau ikut dihitung, berita acara memuat
   * "Kas Masuk 440 juta" yang tidak pernah terjadi. Saldo akhirnya sama saja —
   * yang berbeda cuma kejujuran dua angka yang ditandatangani.
   */
  masuk_luar: number
  keluar_luar: number
  saldo_buku: number
  // Sisi B — diketik
  kas_fisik: number | null
  bank_koran: number | null
  saldo_nyata: number | null
  selisih: number | null
  seimbang: boolean
  // Surat & jejak
  no_surat: string | null
  tgl_surat: string | null
  ditutup_oleh: string | null
  ditutup_at: string | null
  /** Penghalang tutup — kosong berarti tombol boleh hidup (§4.2, §4.6). */
  penghalang: string[]
  jumlah_baki: number
}

const toIso = (v: unknown): string | null => {
  if (v instanceof Date) {
    const p = (n: number) => String(n).padStart(2, '0')
    return `${v.getFullYear()}-${p(v.getMonth() + 1)}-${p(v.getDate())}`
  }
  return v == null ? null : String(v).slice(0, 10)
}

/**
 * Penghalang tutup — dikumpulkan di satu tempat supaya layar dan server memakai
 * daftar yang sama persis; UI tidak boleh punya versi aturannya sendiri.
 */
async function kumpulkanPenghalang(tahun: number, bulan: number): Promise<{ pesan: string[]; baki: number }> {
  const pesan: string[] = []

  const baki = await sql`
    SELECT COUNT(*) AS n FROM blud_realisasi_tx
    WHERE tahun_anggaran = ${tahun} AND bulan = ${bulan} AND status = 'BELUM_BERREKENING'
  ` as Record<string, unknown>[]
  const jumlahBaki = Number(baki[0]?.n ?? 0)
  if (jumlahBaki > 0) {
    pesan.push(`${jumlahBaki} transaksi masih diparkir di baki "Perlu Rekening" — sambungkan dulu ke baris anggaran.`)
  }

  // Saldo awal bulan ini diturunkan dari arus kas bulan-bulan sebelumnya (§4.6).
  // Menutup Juni sementara Mei masih terbuka berarti menandatangani saldo yang
  // masih bisa berubah esok hari — urutannya wajib dari depan.
  if (bulan > 1) {
    const sebelum = await sql`
      SELECT bulan FROM blud_periode
      WHERE tahun_anggaran = ${tahun} AND bulan < ${bulan} AND status = 'TUTUP'
    ` as Record<string, unknown>[]
    const sudah = new Set(sebelum.map((r) => Number(r.bulan)))
    const belum: number[] = []
    for (let b = 1; b < bulan; b++) if (!sudah.has(b)) belum.push(b)
    if (belum.length) {
      pesan.push(`Bulan ${belum.join(', ')} belum ditutup — saldo awal bulan ini masih bisa berubah. Tutup dari bulan terdepan.`)
    }
  }

  return { pesan, baki: jumlahBaki }
}

export async function getNeracaKas(tahun: number, bulan: number): Promise<NeracaKas> {
  const awal = await getSaldoAwal(tahun, bulan)

  // GREATEST(...) per baris = arus bersih tiap transaksi. Transaksi pemindahan
  // bank↔kas punya masuk = keluar, jadi hasilnya nol di kedua kolom — hilang
  // sendiri tanpa perlu menebak dari kolom `jenis`.
  const arus = await sql`
    SELECT COALESCE(SUM(kas_masuk), 0)   AS mk,
           COALESCE(SUM(bank_masuk), 0)  AS mb,
           COALESCE(SUM(kas_keluar), 0)  AS kk,
           COALESCE(SUM(bank_keluar), 0) AS kb,
           COALESCE(SUM(GREATEST((kas_masuk + bank_masuk) - (kas_keluar + bank_keluar), 0)), 0) AS ml,
           COALESCE(SUM(GREATEST((kas_keluar + bank_keluar) - (kas_masuk + bank_masuk), 0)), 0) AS kl
    FROM blud_realisasi_tx
    WHERE tahun_anggaran = ${tahun} AND bulan = ${bulan}
  ` as Record<string, unknown>[]

  const p = await sql`
    SELECT bp.status, bp.kas_fisik, bp.bank_koran, bp.no_surat, bp.tgl_surat,
           bp.ditutup_at, u.username AS ditutup_oleh
    FROM blud_periode bp
    LEFT JOIN users u ON u.id = bp.ditutup_oleh
    WHERE bp.tahun_anggaran = ${tahun} AND bp.bulan = ${bulan}
  ` as Record<string, unknown>[]
  const row = p[0]

  const masukKas = Number(arus[0]?.mk ?? 0)
  const masukBank = Number(arus[0]?.mb ?? 0)
  const keluarKas = Number(arus[0]?.kk ?? 0)
  const keluarBank = Number(arus[0]?.kb ?? 0)
  const masukLuar = Number(arus[0]?.ml ?? 0)
  const keluarLuar = Number(arus[0]?.kl ?? 0)
  const saldoBuku = awal.kas + awal.bank + masukLuar - keluarLuar

  const kasFisik = row?.kas_fisik != null ? Number(row.kas_fisik) : null
  const bankKoran = row?.bank_koran != null ? Number(row.bank_koran) : null
  const saldoNyata = kasFisik != null && bankKoran != null ? kasFisik + bankKoran : null
  const selisih = saldoNyata != null ? saldoNyata - saldoBuku : null

  const { pesan, baki } = await kumpulkanPenghalang(tahun, bulan)

  return {
    tahun_anggaran: tahun,
    bulan,
    status: row?.status === 'TUTUP' ? 'TUTUP' : 'BUKA',
    saldo_awal_kas: awal.kas,
    saldo_awal_bank: awal.bank,
    masuk_kas: masukKas,
    masuk_bank: masukBank,
    keluar_kas: keluarKas,
    keluar_bank: keluarBank,
    masuk_luar: masukLuar,
    keluar_luar: keluarLuar,
    saldo_buku: saldoBuku,
    kas_fisik: kasFisik,
    bank_koran: bankKoran,
    saldo_nyata: saldoNyata,
    selisih,
    seimbang: selisih != null && Math.abs(selisih) < NOL,
    no_surat: row?.no_surat != null ? String(row.no_surat) : null,
    tgl_surat: toIso(row?.tgl_surat),
    ditutup_oleh: row?.ditutup_oleh != null ? String(row.ditutup_oleh) : null,
    ditutup_at: row?.ditutup_at != null ? String(row.ditutup_at) : null,
    penghalang: pesan,
    jumlah_baki: baki,
  }
}

export interface TutupInput {
  kas_fisik: number
  bank_koran: number
  no_surat?: string | null
  tgl_surat?: string | null
}

/**
 * Menyimpan sisi B tanpa menutup bulan — supaya bendahara bisa mengisi hasil
 * hitung uang bertahap dan melihat selisihnya sebelum berkomitmen.
 */
export async function simpanSisiNyata(tahun: number, bulan: number, input: TutupInput): Promise<NeracaKas> {
  const status = await sql`
    SELECT status FROM blud_periode WHERE tahun_anggaran = ${tahun} AND bulan = ${bulan}
  ` as Record<string, unknown>[]
  if (status[0]?.status === 'TUTUP') throw new BludPeriodeTertutupError(tahun, bulan)

  await sql`
    INSERT INTO blud_periode (tahun_anggaran, bulan, status, kas_fisik, bank_koran, no_surat, tgl_surat)
    VALUES (${tahun}, ${bulan}, 'BUKA', ${input.kas_fisik}, ${input.bank_koran},
            ${input.no_surat ?? null}, ${input.tgl_surat ?? null})
    ON DUPLICATE KEY UPDATE
      kas_fisik = VALUES(kas_fisik), bank_koran = VALUES(bank_koran),
      no_surat = VALUES(no_surat), tgl_surat = VALUES(tgl_surat)
  `
  return getNeracaKas(tahun, bulan)
}

/**
 * Tutup bulan. Keseimbangan dihitung ULANG di sini dari transaksi — angka sisi A
 * yang dikirim klien tidak dipercaya sama sekali. Kalau tidak, cukup satu
 * panggilan curl untuk menutup bulan yang jomplang, dan seluruh §4.7 jadi hiasan.
 */
export async function tutupPeriode(
  tahun: number, bulan: number, input: TutupInput, userId: number,
): Promise<NeracaKas> {
  await withTransaction(async ({ tx }) => {
    const cek = await tx`
      SELECT status FROM blud_periode
      WHERE tahun_anggaran = ${tahun} AND bulan = ${bulan} FOR UPDATE
    ` as Record<string, unknown>[]
    if (cek[0]?.status === 'TUTUP') throw new BludPeriodeTertutupError(tahun, bulan)

    const { pesan } = await kumpulkanPenghalang(tahun, bulan)
    if (pesan.length) throw new BludTutupTerhalangError(pesan)

    const awal = await getSaldoAwal(tahun, bulan)
    const arus = await tx`
      SELECT COALESCE(SUM(GREATEST((kas_masuk + bank_masuk) - (kas_keluar + bank_keluar), 0)), 0) AS ml,
             COALESCE(SUM(GREATEST((kas_keluar + bank_keluar) - (kas_masuk + bank_masuk), 0)), 0) AS kl
      FROM blud_realisasi_tx
      WHERE tahun_anggaran = ${tahun} AND bulan = ${bulan}
    ` as Record<string, unknown>[]
    const saldoBuku = awal.kas + awal.bank + Number(arus[0]?.ml ?? 0) - Number(arus[0]?.kl ?? 0)

    const saldoNyata = input.kas_fisik + input.bank_koran
    const selisih = saldoNyata - saldoBuku
    if (Math.abs(selisih) >= NOL) throw new BludTutupTidakSeimbangError(saldoBuku, saldoNyata, selisih)

    await tx`
      INSERT INTO blud_periode
        (tahun_anggaran, bulan, status, kas_fisik, bank_koran, no_surat, tgl_surat, ditutup_oleh, ditutup_at)
      VALUES (${tahun}, ${bulan}, 'TUTUP', ${input.kas_fisik}, ${input.bank_koran},
              ${input.no_surat ?? null}, ${input.tgl_surat ?? null}, ${userId}, NOW())
      ON DUPLICATE KEY UPDATE
        status = 'TUTUP', kas_fisik = VALUES(kas_fisik), bank_koran = VALUES(bank_koran),
        no_surat = VALUES(no_surat), tgl_surat = VALUES(tgl_surat),
        ditutup_oleh = VALUES(ditutup_oleh), ditutup_at = NOW()
    `
  })
  return getNeracaKas(tahun, bulan)
}

/**
 * Buka kembali — izin dijaga di route + audit (§4.5).
 *
 * S2: arah ini kebalikan `kumpulkanPenghalang`, dan dulu tidak dijaga sama sekali.
 * Saldo awal sebuah bulan TIDAK disimpan — dihitung ulang dari arus kas bulan-bulan
 * sebelumnya (§4.6). Jadi membuka Januari lalu mengoreksi satu transaksi di situ
 * ikut menggeser saldo Februari sampai Juni, termasuk bulan yang berita acaranya
 * sudah ditandatangani, dan tidak ada apa pun di layar yang memberi tahu.
 *
 * Karena itu urutannya wajib dari belakang: buka Juni dulu, baru Mei, baru April.
 * Repot di sini memang disengaja — yang dibuka dokumen bertanda tangan, bukan draf.
 */
export async function bukaPeriode(tahun: number, bulan: number): Promise<NeracaKas> {
  const sesudah = await sql`
    SELECT bulan FROM blud_periode
    WHERE tahun_anggaran = ${tahun} AND bulan > ${bulan} AND status = 'TUTUP'
    ORDER BY bulan
  ` as Record<string, unknown>[]
  if (sesudah.length) {
    throw new BludBukaTerhalangError(bulan, sesudah.map((r) => Number(r.bulan)))
  }

  await sql`
    UPDATE blud_periode SET status = 'BUKA', ditutup_oleh = NULL, ditutup_at = NULL
    WHERE tahun_anggaran = ${tahun} AND bulan = ${bulan}
  `
  return getNeracaKas(tahun, bulan)
}
