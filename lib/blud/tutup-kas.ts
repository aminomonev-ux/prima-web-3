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
import type { Penanya, TxSql } from '@/lib/data/db'
import { acquireBludLock, BLUD_PERIODE_ENTITY, bludPeriodeKey } from './lock'
import { getSaldoAwal } from './realisasi-data'
import {
  BludPeriodeTertutupError, BludTutupTidakSeimbangError, BludTutupTerhalangError,
  BludBukaTerhalangError, BludSaldoAwalTerkunciError,
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
  /**
   * R3 — apakah saldo awal tahun masih boleh diubah. DIKIRIM SERVER, bukan
   * disimpulkan layar dari `status` bulan ini: aturannya "ada bulan mana pun yang
   * tertutup", dan layar hanya memegang satu bulan. Menyimpulkannya sendiri
   * membuat isian tampak hidup lalu ditolak 409 — persis yang harus dihindari
   * `kumpulkanPenghalang`: satu daftar aturan, dibaca dua pihak.
   */
  saldo_awal_terkunci: boolean
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
async function kumpulkanPenghalang(
  tahun: number, bulan: number, q: Penanya = sql,
): Promise<{ pesan: string[]; baki: number }> {
  const pesan: string[] = []

  const baki = await q`
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
    const sebelum = await q`
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

/**
 * Bulan-bulan tahun ini yang sudah ditutup. Satu fungsi dipakai dua arah: layar
 * memakainya untuk memutuskan isian saldo awal hidup atau tidak, `setSaldoAwalTahun`
 * memakainya untuk menolak. Kalau dipisah, cepat atau lambat keduanya berbeda
 * pendapat dan isian tampak hidup lalu ditolak 409.
 *
 * Menerima `tx` supaya pemeriksaan di dalam transaksi ikut memakai koneksi yang
 * sama — kalau tidak, `FOR UPDATE` di atasnya tidak menjaga apa pun.
 */
/**
 * N1 — pembuka wajib tiap perpindahan status periode. Dua hal sekaligus:
 * (1) memastikan baris `blud_periode` bulan sasaran ADA, supaya `FOR UPDATE` di
 *     atasnya benar-benar mengunci sesuatu — pada baris yang belum ada, kunci baris
 *     tidak menjaga apa pun (lihat `acquireBludLock`);
 * (2) mengambil kunci setahun, karena aturannya memang bicara tentang bulan lain.
 *
 * Urutannya seragam di keempat pemanggil: kunci tahun dulu, baru baris bulan —
 * syarat bebas-deadlock yang sama seperti §5.3.
 */
async function kunciPeriode(tx: TxSql, tahun: number, bulan?: number): Promise<void> {
  await acquireBludLock(tx, BLUD_PERIODE_ENTITY, bludPeriodeKey(tahun))
  if (bulan != null) {
    await tx`
      INSERT IGNORE INTO blud_periode (tahun_anggaran, bulan, status) VALUES (${tahun}, ${bulan}, 'BUKA')
    `
  }
}

async function bulanTertutup(tahun: number, q: Penanya = sql): Promise<number[]> {
  const rows = await q`
    SELECT bulan FROM blud_periode
    WHERE tahun_anggaran = ${tahun} AND status = 'TUTUP' ORDER BY bulan
  ` as Record<string, unknown>[]
  return rows.map((r) => Number(r.bulan))
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
  const tertutup = await bulanTertutup(tahun)

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
    saldo_awal_terkunci: tertutup.length > 0,
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
  await withTransaction(async ({ tx }) => {
    // N1 — dikunci, bukan sekadar dibaca. Tanpa ini Tutup Kas bisa commit di sela
    // pemeriksaan dan penulisan di bawah, lalu simpan-sisi-B ini menimpa
    // `kas_fisik`/`bank_koran` pada berita acara yang sudah ditandatangani —
    // angkanya berubah, tanda tangannya tidak.
    await kunciPeriode(tx, tahun, bulan)
    const status = await tx`
      SELECT status FROM blud_periode
      WHERE tahun_anggaran = ${tahun} AND bulan = ${bulan} FOR UPDATE
    ` as Record<string, unknown>[]
    if (status[0]?.status === 'TUTUP') throw new BludPeriodeTertutupError(tahun, bulan)

    await tx`
      INSERT INTO blud_periode (tahun_anggaran, bulan, status, kas_fisik, bank_koran, no_surat, tgl_surat)
      VALUES (${tahun}, ${bulan}, 'BUKA', ${input.kas_fisik}, ${input.bank_koran},
              ${input.no_surat ?? null}, ${input.tgl_surat ?? null})
      ON DUPLICATE KEY UPDATE
        kas_fisik = VALUES(kas_fisik), bank_koran = VALUES(bank_koran),
        no_surat = VALUES(no_surat), tgl_surat = VALUES(tgl_surat)
    `
  })
  return getNeracaKas(tahun, bulan)
}

export interface SaldoAwalTahun { kas: number; bank: number }

/**
 * R3 — satu-satunya jalur tulis saldo awal tahun. Sebelum ini kolomnya hanya bisa
 * diisi lewat SQL manual, tanpa jejak, padahal ia dasar dari tiap saldo yang
 * ditandatangani sepanjang tahun.
 *
 * Terkunci begitu ADA bulan yang tertutup — bukan khusus bulan 1. Praktisnya sama
 * (urutan tutup wajib dari depan), tapi yang ingin dijaga memang "sudah ada yang
 * ditandatangani", bukan nomor bulannya.
 *
 * Mengembalikan nilai LAMA supaya pemanggilnya bisa mencatat lama → baru di audit;
 * tanpa itu jejaknya cuma berisi angka yang sekarang, dan pertanyaan "berubah dari
 * berapa" tidak pernah bisa dijawab.
 */
export async function setSaldoAwalTahun(
  tahun: number, input: SaldoAwalTahun,
): Promise<{ lama: SaldoAwalTahun; neraca: NeracaKas }> {
  const lama = await withTransaction(async ({ tx }) => {
    // T2/N1 — dikunci dulu, baru diperiksa. Tanpa itu dua orang bisa sama-sama lolos
    // pemeriksaan "belum ada yang tutup" lalu menimpa bergantian. Kuncinya setahun,
    // karena yang diperiksa memang seluruh bulan — bukan hanya bulan 1.
    await kunciPeriode(tx, tahun, 1)
    const baris = await tx`
      SELECT saldo_awal_kas, saldo_awal_bank FROM blud_periode
      WHERE tahun_anggaran = ${tahun} AND bulan = 1 FOR UPDATE
    ` as Record<string, unknown>[]

    const tertutup = await bulanTertutup(tahun, tx)
    if (tertutup.length) throw new BludSaldoAwalTerkunciError(tahun, tertutup)

    await tx`
      INSERT INTO blud_periode (tahun_anggaran, bulan, status, saldo_awal_kas, saldo_awal_bank)
      VALUES (${tahun}, 1, 'BUKA', ${input.kas}, ${input.bank})
      ON DUPLICATE KEY UPDATE
        saldo_awal_kas = VALUES(saldo_awal_kas), saldo_awal_bank = VALUES(saldo_awal_bank)
    `

    return {
      kas: Number(baris[0]?.saldo_awal_kas ?? 0),
      bank: Number(baris[0]?.saldo_awal_bank ?? 0),
    }
  })

  return { lama, neraca: await getNeracaKas(tahun, 1) }
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
    await kunciPeriode(tx, tahun, bulan)
    const cek = await tx`
      SELECT status FROM blud_periode
      WHERE tahun_anggaran = ${tahun} AND bulan = ${bulan} FOR UPDATE
    ` as Record<string, unknown>[]
    if (cek[0]?.status === 'TUTUP') throw new BludPeriodeTertutupError(tahun, bulan)

    // N1 — keduanya lewat `tx`. Penghalang dan saldo awal adalah dasar dari angka
    // yang akan ditandatangani; dibaca lewat pool artinya dibaca dari koneksi lain
    // di luar `FOR UPDATE` barusan, dan transaksi yang commit di sela ikut terbaca.
    const { pesan } = await kumpulkanPenghalang(tahun, bulan, tx)
    if (pesan.length) throw new BludTutupTerhalangError(pesan)

    const awal = await getSaldoAwal(tahun, bulan, tx)
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
  await withTransaction(async ({ tx }) => {
    // N1 — dikunci dulu, baru diperiksa. Ini satu-satunya jalur tulis periode yang
    // terlewat saat T2. Dua orang berbarengan: A membuka Mei, B menutup Juni.
    // Masing-masing lolos pemeriksaannya sendiri, keduanya commit, dan hasilnya
    // Juni TUTUP di atas Mei BUKA — persis keadaan yang aturan ini larang.
    await kunciPeriode(tx, tahun, bulan)
    const sesudah = await tx`
      SELECT bulan FROM blud_periode
      WHERE tahun_anggaran = ${tahun} AND bulan > ${bulan} AND status = 'TUTUP'
      ORDER BY bulan
    ` as Record<string, unknown>[]
    if (sesudah.length) {
      throw new BludBukaTerhalangError(bulan, sesudah.map((r) => Number(r.bulan)))
    }

    await tx`
      UPDATE blud_periode SET status = 'BUKA', ditutup_oleh = NULL, ditutup_at = NULL
      WHERE tahun_anggaran = ${tahun} AND bulan = ${bulan}
    `
  })
  return getNeracaKas(tahun, bulan)
}
