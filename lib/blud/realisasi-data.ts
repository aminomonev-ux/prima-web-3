// lib/blud/realisasi-data.ts — Data layer Buku Kas BLUD (transaksi + alokasi).
// Konsep: docs/CONCEPT-blud-realisasi.md §2.2, §4.1, §4.2, §5.2, §5.3, §5.4
//
// Satu-satunya titik input modul Realisasi. BKU, register, Realisasi BP, pengantar,
// SPJ, dan Tutup Kas semuanya turunan dari tabel ini — tidak ada ketik ulang.
//
// Tiga hal yang HARUS atomik di satu transaksi DB (§5.2):
//   cek periode → kunci pagu per rekening → cek SUM terserap → tulis.
// Memecahnya jadi "baca sisa di JS lalu INSERT" = lost update (L55), pagu jebol
// tanpa jejak. Urutan penguncian selalu key MENAIK supaya deadlock 1213 mustahil (§5.3).
import { sql, withTransaction, bulkInsert } from '@/lib/data/db'
import type { TxSql } from '@/lib/data/db'
import {
  acquireBludLock, BLUD_PAGU_ENTITY, BLUD_KWT_ENTITY, bludPaguKey, bludKwtKey,
} from './lock'
import { getPaguMap } from './pagu'
import {
  BludPeriodeTertutupError, BludTahunTanpaDpaError, BludAlokasiTidakSeimbangError,
  BludPaguTerlampauiError, BludTxConflictError, BludAlokasiTerlarangError,
  BludSerapanNegatifError, BludPotonganTidakSahError, BludTanggalDiLuarBulanError,
  awalanBulan,
  nilaiBebanPagu, sifatAlokasi, nilaiAlokasiSeharusnya, alasanAlokasiDilarang, bolehBerpotongan,
  type TransaksiInput, type JenisTransaksi, type JenisPotongan,
} from './realisasi-schemas'

export interface RealisasiAlokasi {
  anggaran_key: string
  nilai: number
  kode_rekening: string
  uraian: string
}

export interface RealisasiPotongan {
  /** Dipakai Bukti Setor untuk menunjuk potongan ini sebagai barisnya. */
  id: number
  jenis: JenisPotongan
  keterangan: string | null
  nilai: number
}

export interface RealisasiTx {
  id: number
  tahun_anggaran: number
  bulan: number
  tanggal: string
  no_kwt: number | null
  jenis: JenisTransaksi
  uraian: string
  kas_masuk: number
  kas_keluar: number
  bank_masuk: number
  bank_keluar: number
  status: 'NORMAL' | 'BELUM_BERREKENING'
  version: number
  alokasi: RealisasiAlokasi[]
  potongan: RealisasiPotongan[]
  /** Dihitung saat dibaca — TIDAK disimpan (§2.7). */
  saldo_kas: number
  saldo_bank: number
}

export interface BukuKas {
  tahun_anggaran: number
  bulan: number
  status: 'BUKA' | 'TUTUP'
  saldo_awal_kas: number
  saldo_awal_bank: number
  rows: RealisasiTx[]
}

const toDate = (v: unknown): string => {
  if (v instanceof Date) {
    const p = (n: number) => String(n).padStart(2, '0')
    return `${v.getFullYear()}-${p(v.getMonth() + 1)}-${p(v.getDate())}`
  }
  return String(v ?? '').slice(0, 10)
}

// ─── Periode ────────────────────────────────────────────────────────────────

export async function getPeriodeStatus(tahun: number, bulan: number): Promise<'BUKA' | 'TUTUP'> {
  const rows = await sql`
    SELECT status FROM blud_periode WHERE tahun_anggaran = ${tahun} AND bulan = ${bulan}
  ` as { status?: unknown }[]
  return rows[0]?.status === 'TUTUP' ? 'TUTUP' : 'BUKA'
}

/**
 * Saldo awal bulan: bulan pertama tahun anggaran diisi manual sekali, bulan
 * berikutnya DITURUNKAN dari arus kas bulan-bulan sebelumnya (§4.6) — bukan
 * disimpan, supaya koreksi transaksi bulan lalu langsung merambat ke bawah.
 */
export async function getSaldoAwal(tahun: number, bulan: number): Promise<{ kas: number; bank: number }> {
  const p = await sql`
    SELECT saldo_awal_kas, saldo_awal_bank FROM blud_periode
    WHERE tahun_anggaran = ${tahun} AND bulan = 1
  ` as Record<string, unknown>[]
  const awalKas = Number(p[0]?.saldo_awal_kas ?? 0)
  const awalBank = Number(p[0]?.saldo_awal_bank ?? 0)
  if (bulan <= 1) return { kas: awalKas, bank: awalBank }

  const f = await sql`
    SELECT COALESCE(SUM(kas_masuk - kas_keluar), 0) AS kas,
           COALESCE(SUM(bank_masuk - bank_keluar), 0) AS bank
    FROM blud_realisasi_tx
    WHERE tahun_anggaran = ${tahun} AND bulan < ${bulan}
  ` as Record<string, unknown>[]
  return {
    kas: awalKas + Number(f[0]?.kas ?? 0),
    bank: awalBank + Number(f[0]?.bank ?? 0),
  }
}

// ─── Baca ───────────────────────────────────────────────────────────────────

export async function getBukuKas(tahun: number, bulan: number): Promise<BukuKas> {
  const txRows = await sql`
    SELECT id, tahun_anggaran, bulan, tanggal, no_kwt, jenis, uraian,
           kas_masuk, kas_keluar, bank_masuk, bank_keluar, status, version
    FROM blud_realisasi_tx
    WHERE tahun_anggaran = ${tahun} AND bulan = ${bulan}
    ORDER BY tanggal ASC, id ASC
  ` as Record<string, unknown>[]
  const alokRows = await sql`
    SELECT a.tx_id, a.anggaran_key, a.nilai
    FROM blud_realisasi_alokasi a
    JOIN blud_realisasi_tx t ON t.id = a.tx_id
    WHERE t.tahun_anggaran = ${tahun} AND t.bulan = ${bulan}
    ORDER BY a.id ASC
  ` as Record<string, unknown>[]
  const potRows = await sql`
    SELECT p.id, p.tx_id, p.jenis, p.keterangan, p.nilai
    FROM blud_realisasi_potongan p
    JOIN blud_realisasi_tx t ON t.id = p.tx_id
    WHERE t.tahun_anggaran = ${tahun} AND t.bulan = ${bulan}
    ORDER BY p.urutan ASC, p.id ASC
  ` as Record<string, unknown>[]
  const saldoAwal = await getSaldoAwal(tahun, bulan)
  const status = await getPeriodeStatus(tahun, bulan)
  const pagu = await getPaguMap(tahun)
  const potonganByTx = new Map<number, RealisasiPotongan[]>()
  for (const p of potRows) {
    const txId = Number(p.tx_id)
    if (!potonganByTx.has(txId)) potonganByTx.set(txId, [])
    potonganByTx.get(txId)!.push({
      id: Number(p.id),
      jenis: String(p.jenis) as JenisPotongan,
      keterangan: p.keterangan != null ? String(p.keterangan) : null,
      nilai: Number(p.nilai ?? 0),
    })
  }
  const alokasiByTx = new Map<number, RealisasiAlokasi[]>()
  for (const a of alokRows) {
    const txId = Number(a.tx_id)
    const key = String(a.anggaran_key)
    const baris = pagu.get(key)
    if (!alokasiByTx.has(txId)) alokasiByTx.set(txId, [])
    alokasiByTx.get(txId)!.push({
      anggaran_key: key,
      nilai: Number(a.nilai ?? 0),
      kode_rekening: baris?.kode_rekening ?? '',
      uraian: baris?.uraian ?? '(baris anggaran tidak ditemukan di versi terbaru)',
    })
  }

  let kas = saldoAwal.kas
  let bank = saldoAwal.bank
  const rows: RealisasiTx[] = txRows.map((r) => {
    const id = Number(r.id)
    kas += Number(r.kas_masuk ?? 0) - Number(r.kas_keluar ?? 0)
    bank += Number(r.bank_masuk ?? 0) - Number(r.bank_keluar ?? 0)
    return {
      id,
      tahun_anggaran: Number(r.tahun_anggaran),
      bulan: Number(r.bulan),
      tanggal: toDate(r.tanggal),
      no_kwt: r.no_kwt != null ? Number(r.no_kwt) : null,
      jenis: String(r.jenis) as JenisTransaksi,
      uraian: String(r.uraian ?? ''),
      kas_masuk: Number(r.kas_masuk ?? 0),
      kas_keluar: Number(r.kas_keluar ?? 0),
      bank_masuk: Number(r.bank_masuk ?? 0),
      bank_keluar: Number(r.bank_keluar ?? 0),
      status: r.status === 'BELUM_BERREKENING' ? 'BELUM_BERREKENING' : 'NORMAL',
      version: Number(r.version ?? 0),
      alokasi: alokasiByTx.get(id) ?? [],
      potongan: potonganByTx.get(id) ?? [],
      saldo_kas: kas,
      saldo_bank: bank,
    }
  })

  return {
    tahun_anggaran: tahun,
    bulan,
    status,
    saldo_awal_kas: saldoAwal.kas,
    saldo_awal_bank: saldoAwal.bank,
    rows,
  }
}

export interface RegisterRow {
  id: number
  tanggal: string
  bulan: number
  no_kwt: number | null
  uraian: string
  jenis: JenisTransaksi
  nilai: number
  /** Sisa anggaran setelah transaksi ini — dihitung saat dibaca, seperti §2.7. */
  saldo: number
}

export interface Register {
  anggaran_key: string
  kode_rekening: string
  uraian: string
  pagu: number
  rows: RegisterRow[]
  total: number
  sisa: number
}

/**
 * Isi sheet `register` untuk satu baris anggaran: transaksi yang membebaninya
 * + saldo anggaran berjalan. Keluaran, bukan masukan — karena itu tidak
 * dibuatkan menu sendiri, hanya panel di layar Realisasi (§3.1).
 */
export async function getRegister(
  tahun: number,
  anggaranKey: string,
  sampaiBulan?: number,
): Promise<Register> {
  const pagu = await getPaguMap(tahun)
  const baris = pagu.get(anggaranKey)
  const rows = sampaiBulan == null
    ? await sql`
        SELECT t.id, t.tanggal, t.bulan, t.no_kwt, t.uraian, t.jenis, a.nilai
        FROM blud_realisasi_alokasi a
        JOIN blud_realisasi_tx t ON t.id = a.tx_id
        WHERE a.tahun_anggaran = ${tahun} AND a.anggaran_key = ${anggaranKey}
        ORDER BY t.tanggal ASC, t.id ASC
      `
    : await sql`
        SELECT t.id, t.tanggal, t.bulan, t.no_kwt, t.uraian, t.jenis, a.nilai
        FROM blud_realisasi_alokasi a
        JOIN blud_realisasi_tx t ON t.id = a.tx_id
        WHERE a.tahun_anggaran = ${tahun} AND a.anggaran_key = ${anggaranKey}
          AND t.bulan <= ${sampaiBulan}
        ORDER BY t.tanggal ASC, t.id ASC
      `
  const paguNilai = baris?.pagu ?? 0
  let sisa = paguNilai
  let total = 0
  const daftar: RegisterRow[] = (rows as Record<string, unknown>[]).map((r) => {
    const nilai = Number(r.nilai ?? 0)
    sisa -= nilai
    total += nilai
    return {
      id: Number(r.id),
      tanggal: toDate(r.tanggal),
      bulan: Number(r.bulan),
      no_kwt: r.no_kwt != null ? Number(r.no_kwt) : null,
      uraian: String(r.uraian ?? ''),
      jenis: String(r.jenis) as JenisTransaksi,
      nilai,
      saldo: sisa,
    }
  })
  return {
    anggaran_key: anggaranKey,
    kode_rekening: baris?.kode_rekening ?? '',
    uraian: baris?.uraian ?? '(baris anggaran tidak ada di versi terbaru)',
    pagu: paguNilai,
    rows: daftar,
    total,
    sisa,
  }
}

/**
 * Isi baki "Perlu Rekening" (§4.2) — seluruh tahun, bukan per bulan: transaksi
 * yang diparkir di Mei tetap harus terlihat saat bendahara sedang di Juli, sebab
 * ia memblokir Tutup Kas sampai rekeningnya ada.
 */
export async function listBelumBerrekening(tahun: number): Promise<RealisasiTx[]> {
  const rows = await sql`
    SELECT id, tahun_anggaran, bulan, tanggal, no_kwt, jenis, uraian,
           kas_masuk, kas_keluar, bank_masuk, bank_keluar, status, version
    FROM blud_realisasi_tx
    WHERE tahun_anggaran = ${tahun} AND status = 'BELUM_BERREKENING'
    ORDER BY tanggal ASC, id ASC
  ` as Record<string, unknown>[]
  return rows.map((r) => ({
    id: Number(r.id),
    tahun_anggaran: Number(r.tahun_anggaran),
    bulan: Number(r.bulan),
    tanggal: toDate(r.tanggal),
    no_kwt: r.no_kwt != null ? Number(r.no_kwt) : null,
    jenis: String(r.jenis) as JenisTransaksi,
    uraian: String(r.uraian ?? ''),
    kas_masuk: Number(r.kas_masuk ?? 0),
    kas_keluar: Number(r.kas_keluar ?? 0),
    bank_masuk: Number(r.bank_masuk ?? 0),
    bank_keluar: Number(r.bank_keluar ?? 0),
    status: 'BELUM_BERREKENING',
    version: Number(r.version ?? 0),
    alokasi: [],
    potongan: [],
    saldo_kas: 0,
    saldo_bank: 0,
  }))
}

/** Transaksi diparkir — memblokir Tutup Kas sampai rekeningnya ada (§4.2). */
export async function countBelumBerrekening(tahun: number): Promise<number> {
  const rows = await sql`
    SELECT COUNT(*) AS n FROM blud_realisasi_tx
    WHERE tahun_anggaran = ${tahun} AND status = 'BELUM_BERREKENING'
  ` as { n?: unknown }[]
  return Number(rows[0]?.n ?? 0)
}

// ─── Tulis ──────────────────────────────────────────────────────────────────

/**
 * Kunci pagu + verifikasi serapan, ATOMIK di dalam transaksi pemanggil.
 *
 * `abaikanTxId` dipakai saat mengubah transaksi: alokasi lama miliknya sendiri
 * tidak boleh ikut dihitung, kalau tidak mengubah nominal jadi selalu ditolak.
 */
async function kunciDanPeriksaPagu(
  tx: TxSql,
  tahun: number,
  alokasi: { anggaran_key: string; nilai: number }[],
  abaikanTxId: number | null,
): Promise<void> {
  if (!alokasi.length) return

  const pagu = await getPaguMap(tahun)
  if (!pagu.size) throw new BludTahunTanpaDpaError(tahun)

  // §5.3: urutkan MENAIK sebelum mengunci apa pun. Kunci satu per satu — dengan
  // `IN (...)` urutan pengambilan kunci ikut rencana eksekusi MySQL, jaminannya hilang.
  const urut = [...alokasi].sort((a, b) => a.anggaran_key.localeCompare(b.anggaran_key))

  for (const a of urut) {
    await acquireBludLock(tx, BLUD_PAGU_ENTITY, bludPaguKey(tahun, a.anggaran_key))
  }

  for (const a of urut) {
    const baris = pagu.get(a.anggaran_key)
    if (!baris) {
      throw new BludPaguTerlampauiError({
        anggaran_key: a.anggaran_key,
        kode_rekening: '(tidak ditemukan)',
        uraian: 'Baris anggaran tidak ada di versi terbaru — mungkin terhapus saat pergeseran',
        pagu: 0, terserap: 0, nilai: a.nilai, kekurangan: a.nilai,
      })
    }
    // `FOR UPDATE` di SUM ini WAJIB, bukan hiasan. Isolasi bawaan REPEATABLE READ
    // membuat SELECT biasa membaca SNAPSHOT yang diambil di pembacaan pertama
    // transaksi ini — yaitu SEBELUM kunci pagu didapat. Akibatnya alokasi milik
    // transaksi lain yang baru commit TIDAK TERLIHAT, kuncinya menang tapi angkanya
    // basi, dan pagu tetap jebol. Locking read selalu membaca commit terakhir.
    // Terbukti di scripts/concurrency-test.js T7b (tanpa ini: 2 tersimpan, terserap 7jt dari pagu 5jt).
    const rows = abaikanTxId == null
      ? await tx`
          SELECT COALESCE(SUM(nilai), 0) AS n FROM blud_realisasi_alokasi
          WHERE tahun_anggaran = ${tahun} AND anggaran_key = ${a.anggaran_key}
          FOR UPDATE
        `
      : await tx`
          SELECT COALESCE(SUM(nilai), 0) AS n FROM blud_realisasi_alokasi
          WHERE tahun_anggaran = ${tahun} AND anggaran_key = ${a.anggaran_key} AND tx_id <> ${abaikanTxId}
          FOR UPDATE
        `
    const terserap = Number((rows as { n?: unknown }[])[0]?.n ?? 0)
    // Pengembalian tidak boleh menarik serapan ke bawah nol: sisa anggaran akan
    // melampaui pagunya sendiri dan register jadi mustahil dibaca.
    if (terserap + a.nilai < -0.005) {
      throw new BludSerapanNegatifError(baris.kode_rekening, terserap, a.nilai)
    }
    if (terserap + a.nilai > baris.pagu) {
      throw new BludPaguTerlampauiError({
        anggaran_key: a.anggaran_key,
        kode_rekening: baris.kode_rekening,
        uraian: baris.uraian,
        pagu: baris.pagu,
        terserap,
        nilai: a.nilai,
        kekurangan: terserap + a.nilai - baris.pagu,
      })
    }
  }
}

/**
 * Pagar terakhir sebelum tulis. Aturannya diambil dari `sifatAlokasi` — sumber
 * yang sama dipakai Zod dan modal Buku Kas, supaya tidak ada jenis transaksi yang
 * kebetulan lolos hanya di satu lapis.
 *
 * Dipasang di sini, bukan cuma di Zod: `createTx`/`updateTx` fungsi terekspor yang
 * bisa dipanggil skrip atau route lain tanpa melewati skema, dan begitu lolos ke
 * sini `kunciDanPeriksaPagu` + `bulkInsert` jalan tanpa syarat.
 */
function periksaKeseimbangan(input: TransaksiInput): void {
  const sifat = sifatAlokasi(input)
  if (sifat === 'DILARANG') {
    if (input.alokasi.length) throw new BludAlokasiTerlarangError(alasanAlokasiDilarang(input))
    return
  }
  const harap = nilaiAlokasiSeharusnya(input)
  const total = input.alokasi.reduce((s, a) => s + a.nilai, 0)
  if (Math.abs(total - harap) > 0.005) {
    throw new BludAlokasiTidakSeimbangError(harap, total)
  }
}

/**
 * S1 — `tanggal` wajib jatuh di dalam `(tahun, bulan)` barisnya. Dipasang di sini
 * dan bukan hanya di Zod karena jalur PATCH memang tidak bisa memeriksanya di sana:
 * `bulan` sengaja tidak diterima dari klien, jadi baru diketahui sesudah baris DB
 * terbaca.
 */
function periksaTanggalBulan(tahun: number, bulan: number, input: TransaksiInput): void {
  if (!input.tanggal.startsWith(awalanBulan(tahun, bulan))) {
    throw new BludTanggalDiLuarBulanError(tahun, bulan, input.tanggal)
  }
}

/**
 * Potongan hanya sah menempel pada pembayaran belanja, dan tidak boleh melebihi
 * yang dibayarkan — kalau tidak, ia berubah jadi arus keluar terselubung yang
 * tidak membebani anggaran mana pun.
 */
function periksaPotongan(input: TransaksiInput): void {
  if (!input.potongan.length) return
  if (!bolehBerpotongan(input)) {
    throw new BludPotonganTidakSahError(
      'Potongan hanya bisa ditahan dari pembayaran belanja yang dibebankan ke baris anggaran.',
    )
  }
  const total = input.potongan.reduce((s, p) => s + p.nilai, 0)
  if (total > nilaiBebanPagu(input) + 0.005) {
    throw new BludPotonganTidakSahError(
      'Jumlah potongan melebihi nilai pembayaran — yang ditahan tidak bisa lebih besar dari yang dibayarkan.',
    )
  }
}

const ALOKASI_COLUMNS = ['tx_id', 'tahun_anggaran', 'anggaran_key', 'nilai'] as const
const POTONGAN_COLUMNS = ['tx_id', 'tahun_anggaran', 'jenis', 'keterangan', 'nilai', 'urutan'] as const

async function tulisPotongan(
  conn: Parameters<typeof bulkInsert>[3],
  id: number,
  tahun: number,
  potongan: TransaksiInput['potongan'],
): Promise<void> {
  if (!potongan.length) return
  await bulkInsert(
    'blud_realisasi_potongan',
    POTONGAN_COLUMNS,
    potongan.map((p, i) => [id, tahun, p.jenis, p.keterangan ?? null, p.nilai, i]),
    conn,
  )
}

/**
 * Nomor kuitansi berurutan per (tahun, bulan), diberikan SERVER (§5.4).
 * Dikunci lebih dulu daripada kunci pagu supaya urutan penguncian seragam
 * di semua jalur tulis — syarat bebas-deadlock yang sama seperti §5.3.
 */
async function nomorKuitansiBerikut(tx: TxSql, tahun: number, bulan: number): Promise<number> {
  await acquireBludLock(tx, BLUD_KWT_ENTITY, bludKwtKey(tahun, bulan))
  const rows = await tx`
    SELECT COALESCE(MAX(no_kwt), 0) AS n FROM blud_realisasi_tx
    WHERE tahun_anggaran = ${tahun} AND bulan = ${bulan}
  `
  return Number((rows as { n?: unknown }[])[0]?.n ?? 0) + 1
}

export async function createTx(
  tahun: number,
  bulan: number,
  input: TransaksiInput,
  userId: number,
): Promise<{ id: number; no_kwt: number | null }> {
  periksaTanggalBulan(tahun, bulan, input)
  periksaKeseimbangan(input)
  periksaPotongan(input)

  return withTransaction(async ({ tx, conn }) => {
    // `FOR UPDATE` bukan hiasan: tanpanya Tutup Kas bisa commit di sela antara
    // pemeriksaan ini dan INSERT di bawah, dan transaksi baru menyelinap masuk ke
    // bulan yang sudah ditutup — neraca yang sudah ditandatangani jadi salah.
    const per = await tx`
      SELECT status FROM blud_periode
      WHERE tahun_anggaran = ${tahun} AND bulan = ${bulan} FOR UPDATE
    ` as { status?: unknown }[]
    if (per[0]?.status === 'TUTUP') throw new BludPeriodeTertutupError(tahun, bulan)

    const noKwt = input.jenis === 'BELANJA' ? await nomorKuitansiBerikut(tx, tahun, bulan) : null
    await kunciDanPeriksaPagu(tx, tahun, input.alokasi, null)

    const status = input.belum_berrekening ? 'BELUM_BERREKENING' : 'NORMAL'
    const res = await tx`
      INSERT INTO blud_realisasi_tx
        (tahun_anggaran, bulan, tanggal, no_kwt, jenis, uraian,
         kas_masuk, kas_keluar, bank_masuk, bank_keluar, status, version, created_by)
      VALUES
        (${tahun}, ${bulan}, ${input.tanggal}, ${noKwt}, ${input.jenis}, ${input.uraian},
         ${input.kas_masuk}, ${input.kas_keluar}, ${input.bank_masuk}, ${input.bank_keluar},
         ${status}, 0, ${userId})
    ` as unknown as Array<{ insertId: number }>
    const id = Number(res[0]?.insertId ?? 0)

    if (input.alokasi.length) {
      await bulkInsert(
        'blud_realisasi_alokasi',
        ALOKASI_COLUMNS,
        input.alokasi.map((a) => [id, tahun, a.anggaran_key, a.nilai]),
        conn,
      )
    }
    await tulisPotongan(conn, id, tahun, input.potongan)
    return { id, no_kwt: noKwt }
  })
}

export async function updateTx(
  id: number,
  expectedVersion: number,
  input: TransaksiInput,
  userId: number,
): Promise<{ version: number }> {
  periksaKeseimbangan(input)
  periksaPotongan(input)

  return withTransaction(async ({ tx, conn }) => {
    // L48: baca baris sendiri dengan FOR UPDATE — CAS harus melihat angka segar.
    const cur = await tx`
      SELECT tahun_anggaran, bulan, no_kwt, version FROM blud_realisasi_tx
      WHERE id = ${id} FOR UPDATE
    ` as Record<string, unknown>[]
    if (!cur.length) throw new Error(`Transaksi ${id} tidak ditemukan`)

    const tahun = Number(cur[0].tahun_anggaran)
    const bulan = Number(cur[0].bulan)
    const version = Number(cur[0].version ?? 0)
    if (version !== expectedVersion) throw new BludTxConflictError(id, expectedVersion, version)
    periksaTanggalBulan(tahun, bulan, input)

    const per = await tx`
      SELECT status FROM blud_periode
      WHERE tahun_anggaran = ${tahun} AND bulan = ${bulan} FOR UPDATE
    ` as { status?: unknown }[]
    if (per[0]?.status === 'TUTUP') throw new BludPeriodeTertutupError(tahun, bulan)

    await kunciDanPeriksaPagu(tx, tahun, input.alokasi, id)

    const status = input.belum_berrekening ? 'BELUM_BERREKENING' : 'NORMAL'
    await tx`
      UPDATE blud_realisasi_tx SET
        tanggal = ${input.tanggal}, jenis = ${input.jenis}, uraian = ${input.uraian},
        kas_masuk = ${input.kas_masuk}, kas_keluar = ${input.kas_keluar},
        bank_masuk = ${input.bank_masuk}, bank_keluar = ${input.bank_keluar},
        status = ${status}, version = version + 1, created_by = COALESCE(created_by, ${userId})
      WHERE id = ${id}
    `
    await tx`DELETE FROM blud_realisasi_alokasi WHERE tx_id = ${id}`
    if (input.alokasi.length) {
      await bulkInsert(
        'blud_realisasi_alokasi',
        ALOKASI_COLUMNS,
        input.alokasi.map((a) => [id, tahun, a.anggaran_key, a.nilai]),
        conn,
      )
    }
    await tx`DELETE FROM blud_realisasi_potongan WHERE tx_id = ${id}`
    await tulisPotongan(conn, id, tahun, input.potongan)
    return { version: version + 1 }
  })
}

export async function deleteTx(id: number): Promise<{ deleted: number }> {
  return withTransaction(async ({ tx }) => {
    const cur = await tx`
      SELECT tahun_anggaran, bulan FROM blud_realisasi_tx WHERE id = ${id} FOR UPDATE
    ` as Record<string, unknown>[]
    if (!cur.length) return { deleted: 0 }

    const tahun = Number(cur[0].tahun_anggaran)
    const bulan = Number(cur[0].bulan)
    const per = await tx`
      SELECT status FROM blud_periode
      WHERE tahun_anggaran = ${tahun} AND bulan = ${bulan} FOR UPDATE
    ` as { status?: unknown }[]
    if (per[0]?.status === 'TUTUP') throw new BludPeriodeTertutupError(tahun, bulan)

    // Alokasi & potongan ikut terhapus lewat FK ON DELETE CASCADE.
    const res = await tx`DELETE FROM blud_realisasi_tx WHERE id = ${id}` as unknown as Array<{ affectedRows: number }>
    return { deleted: Number(res[0]?.affectedRows ?? 0) }
  })
}
