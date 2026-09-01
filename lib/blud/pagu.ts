// lib/blud/pagu.ts — Pagu efektif per baris anggaran + serapan realisasi.
// Konsep: docs/CONCEPT-blud-realisasi.md §2.1
//
// Pagu TIDAK PERNAH disalin ke tabel realisasi. Menyalinnya berarti basi begitu
// ada pergeseran baru — persis penyakit berkas Excel yang digantikan modul ini.
//
//   Pagu efektif (tahun T, baris X)
//     = baris X pada Pergeseran versi TERBARU tahun T   (kolom `pergeseran`)
//     → kalau tahun T belum punya Pergeseran, dari DPA versi TERBARU (kolom `jumlah`)
//
// Kolom `pergeseran` = pagu SESUDAH digeser (bukan nilai deltanya — itu
// `bertambah_berkurang`). Lihat recalcPergeseranJumlah di recalc.ts.
import { sql } from '@/lib/data/db'
import { toDateStr } from './data'
import type { TipeBaris } from '@/types'

export interface BarisPagu {
  anggaran_key: string
  kode_rekening: string
  uraian: string
  tipe_baris: TipeBaris
  parent_key: string | null
  urutan: number
  pagu: number
  is_leaf: boolean
}

export interface PaguSumber {
  sumber: 'PERGESERAN' | 'DPA' | 'KOSONG'
  versi: string | null
}

interface BarisMentah {
  anggaran_key: unknown
  kode_rekening: unknown
  uraian: unknown
  tipe_baris: unknown
  row_id: unknown
  parent_id: unknown
  urutan: unknown
  pagu: unknown
}

function susun(rows: BarisMentah[]): BarisPagu[] {
  const keyByRowId = new Map<string, string>()
  const punyaAnak = new Set<string>()
  for (const r of rows) {
    const rowId = String(r.row_id ?? '')
    const key = String(r.anggaran_key ?? '')
    if (rowId && key) keyByRowId.set(rowId, key)
    const parent = r.parent_id != null ? String(r.parent_id) : ''
    if (parent) punyaAnak.add(parent)
  }
  const hasil: BarisPagu[] = []
  for (const r of rows) {
    const key = String(r.anggaran_key ?? '')
    if (!key) continue // baris tanpa jangkar tidak bisa jadi sasaran realisasi
    const rowId = String(r.row_id ?? '')
    const parentRowId = r.parent_id != null ? String(r.parent_id) : ''
    hasil.push({
      anggaran_key: key,
      kode_rekening: String(r.kode_rekening ?? ''),
      uraian: String(r.uraian ?? ''),
      tipe_baris: String(r.tipe_baris) as TipeBaris,
      parent_key: parentRowId ? (keyByRowId.get(parentRowId) ?? null) : null,
      urutan: Number(r.urutan ?? 0),
      pagu: Number(r.pagu ?? 0),
      is_leaf: !punyaAnak.has(rowId),
    })
  }
  return hasil
}

/**
 * Dari mana pagu tahun ini diambil — dipakai UI untuk memberi tahu pengguna.
 *
 * `toDateStr` WAJIB, jangan `String(v).slice(0,10)`: kolom DATE dikembalikan
 * mysql2 sebagai objek Date, dan `String(Date)` berbunyi "Sun Jul 26 2026 …"
 * sehingga potongannya jadi "Sun Jul 26". Selain salah di layar, string itu
 * dipakai lagi sebagai parameter DATE di getPaguCap → MySQL menolak dengan
 * ER_WRONG_VALUE dan deteksi perubahan pagu §4.4 mati diam-diam.
 */
export async function getPaguSumber(tahun: number): Promise<PaguSumber> {
  const pgs = await sql`
    SELECT MAX(versi_tanggal) AS v FROM pergeseran_dpa WHERE tahun_anggaran = ${tahun}
  ` as { v?: unknown }[]
  if (pgs[0]?.v) return { sumber: 'PERGESERAN', versi: toDateStr(pgs[0].v) }

  const dpa = await sql`
    SELECT MAX(versi_tanggal) AS v FROM dpa_blud WHERE tahun_anggaran = ${tahun}
  ` as { v?: unknown }[]
  if (dpa[0]?.v) return { sumber: 'DPA', versi: toDateStr(dpa[0].v) }

  return { sumber: 'KOSONG', versi: null }
}

/**
 * Pohon baris anggaran + pagu efektif tahun tsb, urut tampilan.
 * Array kosong = tahun itu belum punya DPA (§4.8) — pemanggil wajib menolak
 * input realisasi, bukan menampilkan layar kosong tanpa keterangan.
 */
export async function getPaguEfektif(tahun: number): Promise<BarisPagu[]> {
  const { sumber } = await getPaguSumber(tahun)
  if (sumber === 'KOSONG') return []

  const rows = sumber === 'PERGESERAN'
    ? await sql`
        SELECT anggaran_key, kode_rekening, uraian, tipe_baris, row_id, parent_id, urutan,
               pergeseran AS pagu
        FROM pergeseran_dpa
        WHERE tahun_anggaran = ${tahun}
          AND versi_tanggal = (SELECT MAX(versi_tanggal) FROM pergeseran_dpa WHERE tahun_anggaran = ${tahun})
        ORDER BY urutan ASC
      `
    : await sql`
        SELECT anggaran_key, kode_rekening, uraian, tipe_baris, row_id, parent_id, urutan,
               jumlah AS pagu
        FROM dpa_blud
        WHERE tahun_anggaran = ${tahun}
          AND versi_tanggal = (SELECT MAX(versi_tanggal) FROM dpa_blud WHERE tahun_anggaran = ${tahun})
        ORDER BY urutan ASC
      `

  return susun(rows as BarisMentah[])
}

export async function getPaguMap(tahun: number): Promise<Map<string, BarisPagu>> {
  const rows = await getPaguEfektif(tahun)
  return new Map(rows.map((r) => [r.anggaran_key, r]))
}

/** Serapan per baris anggaran — SUM alokasi, tidak pernah disimpan sebagai kolom. */
export async function getTerserap(
  tahun: number,
  sampaiBulan?: number,
): Promise<Map<string, number>> {
  const rows = sampaiBulan == null
    ? await sql`
        SELECT a.anggaran_key AS k, SUM(a.nilai) AS n
        FROM blud_realisasi_alokasi a
        WHERE a.tahun_anggaran = ${tahun}
        GROUP BY a.anggaran_key
      `
    : await sql`
        SELECT a.anggaran_key AS k, SUM(a.nilai) AS n
        FROM blud_realisasi_alokasi a
        JOIN blud_realisasi_tx t ON t.id = a.tx_id
        WHERE a.tahun_anggaran = ${tahun} AND t.bulan <= ${sampaiBulan}
        GROUP BY a.anggaran_key
      `
  const map = new Map<string, number>()
  for (const r of rows as { k: unknown; n: unknown }[]) {
    map.set(String(r.k), Number(r.n ?? 0))
  }
  return map
}

// ── Fase 3 — serapan per periode, sidik pagu, pagar §4.3 ────────────────────

export interface SerapanBaris {
  bulan_ini: number
  bulan_lalu: number
  tahun: number
}

/**
 * Tiga ember serapan sekaligus untuk layar Realisasi: bulan terpilih, bulan
 * sebelumnya (§2.6), dan total setahun. Satu query — dipecah jadi tiga
 * perjalanan ke DB, ketiganya bisa berasal dari keadaan yang berbeda.
 */
export async function getSerapanPeriode(tahun: number, bulan: number): Promise<Map<string, SerapanBaris>> {
  const rows = await sql`
    SELECT a.anggaran_key AS k,
           COALESCE(SUM(CASE WHEN t.bulan = ${bulan} THEN a.nilai ELSE 0 END), 0) AS ini,
           COALESCE(SUM(CASE WHEN t.bulan < ${bulan} THEN a.nilai ELSE 0 END), 0) AS lalu,
           COALESCE(SUM(a.nilai), 0) AS thn
    FROM blud_realisasi_alokasi a
    JOIN blud_realisasi_tx t ON t.id = a.tx_id
    WHERE a.tahun_anggaran = ${tahun}
    GROUP BY a.anggaran_key
  ` as Record<string, unknown>[]
  const map = new Map<string, SerapanBaris>()
  for (const r of rows) {
    map.set(String(r.k), {
      bulan_ini:  Number(r.ini ?? 0),
      bulan_lalu: Number(r.lalu ?? 0),
      tahun:      Number(r.thn ?? 0),
    })
  }
  return map
}

/**
 * Serapan dalam rentang tanggal — untuk lembar GU yang memotong sebagian bulan
 * (berkas asli: `GU 1-26 Juni 2026`, bukan sebulan penuh).
 *
 * Batasnya inklusif di kedua ujung; `tanggal` bertipe DATE jadi tidak ada jam
 * yang bisa membuat transaksi tanggal terakhir terlewat.
 */
export async function getSerapanRentang(
  tahun: number, dari: string, sampai: string,
): Promise<Map<string, number>> {
  const rows = await sql`
    SELECT a.anggaran_key AS k, COALESCE(SUM(a.nilai), 0) AS n
    FROM blud_realisasi_alokasi a
    JOIN blud_realisasi_tx t ON t.id = a.tx_id
    WHERE a.tahun_anggaran = ${tahun} AND t.tanggal BETWEEN ${dari} AND ${sampai}
    GROUP BY a.anggaran_key
  ` as Record<string, unknown>[]
  const map = new Map<string, number>()
  for (const r of rows) map.set(String(r.k), Number(r.n ?? 0))
  return map
}

/**
 * Angka anak dinaikkan ke seluruh leluhurnya. Alokasi hanya menempel di baris
 * terbawah, jadi tanpa ini semua baris induk tampil nol dan total layar
 * Realisasi tidak akan pernah cocok dengan Buku Kas.
 */
export function gulungKeAtas(baris: BarisPagu[], nilai: Map<string, number>): Map<string, number> {
  const induk = new Map(baris.map((b) => [b.anggaran_key, b.parent_key]))
  const total = new Map<string, number>()
  for (const b of baris) total.set(b.anggaran_key, nilai.get(b.anggaran_key) ?? 0)
  for (const b of baris) {
    const v = nilai.get(b.anggaran_key) ?? 0
    if (!v) continue
    const dilewati = new Set<string>([b.anggaran_key])
    let p = induk.get(b.anggaran_key) ?? null
    while (p && !dilewati.has(p)) {
      dilewati.add(p)
      total.set(p, (total.get(p) ?? 0) + v)
      p = induk.get(p) ?? null
    }
  }
  return total
}

export interface PaguCap {
  sumber: PaguSumber['sumber']
  versi: string | null
  baris: number
  sidik: number
  /**
   * Total alokasi setahun — penanda "ada yang mencatat transaksi baru", supaya
   * layar Realisasi ikut segar saat rekan mengetik di Buku Kas. Sebelumnya
   * pemeriksaan 30 detik hanya melihat pagu, jadi serapan diam sampai halaman
   * dimuat ulang.
   *
   * `SUM` mentah, sengaja: angka ini TIDAK PERNAH ditampilkan — ia cuma
   * dibandingkan dengan angka sebelumnya. Aturan "jumlahkan baris akar"
   * (docs/CONCEPT-blud-beranda-serapan.md §9.1) berlaku untuk angka yang dibaca
   * orang; di sini ikut menghitung alokasi yatim justru bagus, sebab perubahan
   * padanya juga perlu memicu muat ulang.
   */
  terserap: number
}

/**
 * Sidik jari pagu tahun berjalan — dipakai layar Realisasi untuk menyadari
 * pergeseran yang disimpan orang lain (§4.4 lapis 3), tanpa WebSocket.
 * BUKAN SUM(pagu): pergeseran wajib berimbang, jadi totalnya justru tetap
 * walau angka tiap baris berubah. CRC32 per baris menangkap perubahan itu.
 */
export async function getPaguCap(tahun: number): Promise<PaguCap> {
  const { sumber, versi } = await getPaguSumber(tahun)
  const serap = await sql`
    SELECT COALESCE(SUM(nilai), 0) AS n FROM blud_realisasi_alokasi WHERE tahun_anggaran = ${tahun}
  ` as Record<string, unknown>[]
  const terserap = Number(serap[0]?.n ?? 0)
  if (sumber === 'KOSONG') return { sumber, versi: null, baris: 0, sidik: 0, terserap }
  const rows = sumber === 'PERGESERAN'
    ? await sql`
        SELECT COUNT(*) AS n,
               COALESCE(SUM(CRC32(CONCAT_WS(':', anggaran_key, CAST(pergeseran AS CHAR)))), 0) AS s
        FROM pergeseran_dpa
        WHERE tahun_anggaran = ${tahun} AND versi_tanggal = ${versi}
      `
    : await sql`
        SELECT COUNT(*) AS n,
               COALESCE(SUM(CRC32(CONCAT_WS(':', anggaran_key, CAST(jumlah AS CHAR)))), 0) AS s
        FROM dpa_blud
        WHERE tahun_anggaran = ${tahun} AND versi_tanggal = ${versi}
      `
  const r = (rows as Record<string, unknown>[])[0]
  return { sumber, versi, baris: Number(r?.n ?? 0), sidik: Number(r?.s ?? 0), terserap }
}

export interface BentrokPagu {
  anggaran_key: string
  kode_rekening: string
  uraian: string
  pagu_baru: number
  terserap: number
  minus: number
  /** Barisnya hilang sama sekali dari versi baru — realisasinya jadi yatim (§4.4). */
  hilang: boolean
}

// §4.3 dijaga oleh `pagarSimpanVersi` di `data.ts` — DI DALAM transaksi simpan dan
// di bawah kunci pagu. Versi lamanya di sini (`cekPaguDibawahRealisasi`) dibuang
// bersama B3: ia berjalan di luar transaksi tanpa kunci apa pun, jadi jawabannya
// bisa sudah basi begitu dipakai. Membiarkannya tetap ada berarti menyediakan
// pemeriksaan yang tampak benar untuk dipanggil jalur tulis berikutnya.
