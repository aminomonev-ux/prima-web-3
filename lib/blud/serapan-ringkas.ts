// lib/blud/serapan-ringkas.ts — ringkasan serapan setahun untuk Beranda BLUD & /dashboard.
// Konsep: docs/CONCEPT-blud-beranda-serapan.md §2, §9
//
// SATU fungsi, dua pemakai. Kalau disalin, cepat atau lambat Beranda dan
// /dashboard berbeda pendapat tentang % serapan tahun yang sama — pola yang
// sudah melahirkan L78.
//
// Pagunya diambil lewat jalur yang SAMA dengan layar Realisasi (`getPaguEfektif`),
// bukan dijumlah ulang dari DPA: realisasi diukur terhadap kolom `pergeseran`
// versi terbaru, dan menjumlah DPA menghasilkan penyebut yang berbeda begitu ada
// pergeseran yang benar-benar menggeser (§2).
import { sql } from '@/lib/data/db'
import {
  getPaguEfektif, getPaguSumber, getTerserap, gulungKeAtas,
  type BarisPagu, type PaguSumber,
} from './pagu'
import { EPS_PRATINJAU, mepetSetahun } from './pratinjau-serapan'
import { toDateStr } from './tanggal'

export interface SerapanRingkas {
  sumber: PaguSumber['sumber']
  /** Versi pagu acuan — WAJIB ikut ditampilkan; angka pagu tanpa versi tidak bisa diperiksa. */
  versi: string | null
  pagu: number
  terserap: number
  sisa: number
  /** 0 kalau pagunya nol — bukan Infinity, bukan NaN. */
  pct: number
  /** Baris DAUN yang terserapnya sudah melewati pagu. */
  menembus: number
  /** Baris DAUN yang sisanya tinggal di bawah AMBANG_MEPET. */
  mepet: number
  /** 12 angka, indeks 0 = Januari. Bisa negatif (jenis PENGEMBALIAN). */
  tren: number[]
  /** Tanggal transaksi terakhir tahun itu, untuk keterangan kartu Terserap. */
  tx_terakhir: string | null
  /**
   * Belanja yang jangkarnya TIDAK ada di versi pagu berlaku, jadi tidak ikut
   * `terserap`. Bukan untuk dijumlahkan ke dalamnya — untuk DISEBUTKAN.
   */
  yatim: number
  yatim_rekening: number
}

export const RINGKAS_KOSONG: SerapanRingkas = {
  sumber: 'KOSONG', versi: null, pagu: 0, terserap: 0, sisa: 0, pct: 0,
  menembus: 0, mepet: 0, tren: Array(12).fill(0), tx_terakhir: null,
  yatim: 0, yatim_rekening: 0,
}

/**
 * Serapan per bulan + tanggal transaksi terakhir.
 *
 * Disaring ke `anggaran_key` yang masih ada di versi pagu berlaku — tanpa itu
 * jumlah batangnya tidak akan sama dengan kartu Terserap, karena alokasi yang
 * rekeningnya sudah lenyap dari versi terbaru ikut terhitung di sini tapi tidak
 * di sana (§9.1). Semi-join lewat `IN`, BUKAN `JOIN`: `anggaran_key` tidak punya
 * batasan unik per versi, dan `JOIN` pada key kembar akan menggandakan nilainya.
 */
async function getTren(
  tahun: number, sumber: PaguSumber['sumber'], versi: string | null,
): Promise<{ tren: number[]; tx_terakhir: string | null }> {
  const tren = Array(12).fill(0) as number[]
  if (sumber === 'KOSONG' || !versi) return { tren, tx_terakhir: null }

  const rows = sumber === 'PERGESERAN'
    ? await sql`
        SELECT t.bulan AS b, COALESCE(SUM(a.nilai), 0) AS n, MAX(t.tanggal) AS akhir
        FROM blud_realisasi_alokasi a
        JOIN blud_realisasi_tx t ON t.id = a.tx_id
        WHERE a.tahun_anggaran = ${tahun}
          AND a.anggaran_key IN (
            SELECT anggaran_key FROM pergeseran_dpa
            WHERE tahun_anggaran = ${tahun} AND versi_tanggal = ${versi}
          )
        GROUP BY t.bulan
      `
    : await sql`
        SELECT t.bulan AS b, COALESCE(SUM(a.nilai), 0) AS n, MAX(t.tanggal) AS akhir
        FROM blud_realisasi_alokasi a
        JOIN blud_realisasi_tx t ON t.id = a.tx_id
        WHERE a.tahun_anggaran = ${tahun}
          AND a.anggaran_key IN (
            SELECT anggaran_key FROM dpa_blud
            WHERE tahun_anggaran = ${tahun} AND versi_tanggal = ${versi}
          )
        GROUP BY t.bulan
      `

  let akhir: string | null = null
  for (const r of rows as Record<string, unknown>[]) {
    const b = Number(r.b ?? 0)
    if (b >= 1 && b <= 12) tren[b - 1] = Number(r.n ?? 0)
    const tgl = r.akhir ? toDateStr(r.akhir) : null
    if (tgl && (!akhir || tgl > akhir)) akhir = tgl
  }
  return { tren, tx_terakhir: akhir }
}

/**
 * Bagian yang menghitung, dipisah dari yang bertanya ke database SUPAYA BISA
 * DIUJI — pola yang sama dengan `hitungPratinjau` di `pratinjau-serapan.ts`.
 * Angka di kartu Beranda mengaku sama dengan angka di layar Realisasi; janji
 * begitu harus bisa dibuktikan, bukan dibaca dari JSX.
 *
 * Dua lingkup baris yang SENGAJA berbeda, dan tertukarnya menghasilkan angka yang
 * tidak cocok dengan layar Realisasi (§9.1):
 *
 *   total pagu & terserap → baris AKAR. Menjumlah `blud_realisasi_alokasi`
 *     mentah ikut menghitung alokasi yang rekeningnya sudah lenyap dari versi
 *     pagu berjalan; menjumlah baris daun melewatkan baris yang dulu daun lalu
 *     dapat anak sesudah pergeseran, padahal alokasi lamanya tetap menempel di
 *     sana.
 *
 *   hitungan menembus & mepet → baris DAUN. Pagar pagu server bekerja di baris
 *     terbawah, dan itu pula yang disaring `hitungPratinjau`.
 *
 *   yatim → alokasi yang jangkarnya TIDAK ada di pohon sama sekali. `gulungKeAtas`
 *     berjalan atas `baris`, jadi kunci yang tidak ada di situ tidak punya induk
 *     untuk dinaiki dan hilang tanpa jejak dari `terserap` — padahal uangnya
 *     sudah keluar dan tetap terbaca di kartu Kas. Dihitung supaya bisa
 *     DISEBUTKAN, bukan supaya dijumlahkan ke `terserap`: menambahkannya
 *     membuat % serapan berdiri di atas penyebut yang tidak memuatnya.
 */
export function hitungRingkas(
  baris: readonly BarisPagu[],
  terserapMap: ReadonlyMap<string, number>,
): { pagu: number; terserap: number; menembus: number; mepet: number; yatim: number; yatimRekening: number } {
  const gulung = gulungKeAtas(baris as BarisPagu[], new Map(terserapMap))

  let pagu = 0
  let terserap = 0
  for (const b of baris) {
    if (b.parent_key) continue
    pagu += b.pagu
    terserap += gulung.get(b.anggaran_key) ?? 0
  }

  const adaDiPohon = new Set(baris.map(b => b.anggaran_key))
  let yatim = 0
  let yatimRekening = 0
  for (const [key, nilai] of terserapMap) {
    // Nol dilewati: rekening yang pengembaliannya menutup belanjanya bukan uang
    // yang hilang dari hitungan, dan menyebutnya cuma menambah kebisingan.
    if (adaDiPohon.has(key) || Math.abs(nilai) <= EPS_PRATINJAU) continue
    yatim += nilai
    yatimRekening++
  }

  let menembus = 0
  let mepet = 0
  for (const b of baris) {
    if (!b.is_leaf) continue
    const sisa = b.pagu - (gulung.get(b.anggaran_key) ?? 0)
    if (sisa < -EPS_PRATINJAU) menembus++
    else if (mepetSetahun(b.pagu, sisa)) mepet++
  }

  return { pagu, terserap, menembus, mepet, yatim, yatimRekening }
}

/**
 * Pohon pagu + serapan setahun. Dipisah dari `ringkasSerapan` supaya Beranda bisa
 * memakainya DUA kali tanpa bertanya dua kali ke database: kartu serapan dan
 * panel "Realisasi Terbaru" butuh bahan yang sama persis (pagu per rekening +
 * SUM alokasi). Memanggilnya sendiri-sendiri berarti tiga kueri berat diulang,
 * dan — lebih buruk — dua jawaban yang bisa berasal dari keadaan berbeda kalau
 * ada yang menyimpan di sela keduanya.
 */
export interface DataPagu {
  baris: BarisPagu[]
  sumber: PaguSumber
  terserapMap: Map<string, number>
}

export async function muatDataPagu(tahun: number): Promise<DataPagu> {
  const [baris, sumber, terserapMap] = await Promise.all([
    getPaguEfektif(tahun),
    getPaguSumber(tahun),
    getTerserap(tahun),
  ])
  return { baris, sumber, terserapMap }
}

/**
 * Angka serapan setahun, dihitung persis seperti layar Realisasi menghitungnya.
 *
 * `pra` = hasil `muatDataPagu` yang sudah dipegang pemanggil. Tanpa itu ia
 * memuat sendiri — jalur yang dipakai `/dashboard`.
 */
export async function ringkasSerapan(tahun: number, pra?: DataPagu): Promise<SerapanRingkas> {
  const { baris, sumber, terserapMap } = pra ?? await muatDataPagu(tahun)
  if (!baris.length) return { ...RINGKAS_KOSONG, tren: Array(12).fill(0) }

  const { pagu, terserap, menembus, mepet, yatim, yatimRekening } = hitungRingkas(baris, terserapMap)
  const { tren, tx_terakhir } = await getTren(tahun, sumber.sumber, sumber.versi)

  return {
    sumber: sumber.sumber,
    versi: sumber.versi,
    pagu,
    terserap,
    sisa: pagu - terserap,
    pct: pagu > 0 ? (terserap / pagu) * 100 : 0,
    menembus,
    mepet,
    tren,
    tx_terakhir,
    yatim,
    yatim_rekening: yatimRekening,
  }
}
