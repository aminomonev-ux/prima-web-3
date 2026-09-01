// lib/blud/beranda-panel.ts — isi dua panel riwayat di Beranda BLUD.
// Konsep: docs/CONCEPT-blud-beranda-panel-bergerak.md §2, §3, §6
//
// Keduanya dulu berbentuk "5 versi terbaru" dan menjawab pertanyaan yang tidak
// pernah ditanya siapa pun: Δ Net pergeseran SELALU nol (pergeseran wajib
// berimbang), jadi panelnya memajang `+Rp 0` tiga kali. Yang dicari orang
// rekening MANA yang digeser — pertanyaan yang melahirkan seluruh fitur Tutup
// Pergeseran.
//
// Nol kolom, nol tabel, nol migrasi, nol endpoint. Dua panel ini juga membuang
// 10 kueri di dalam perulangan yang dulu ada di page.tsx.
import { sql } from '@/lib/data/db'
import { getTutupPergeseran } from './tutup-data'
import { catatanVersi } from './tutup-pergeseran'
import { EPS_PRATINJAU, mepetSetahun } from './pratinjau-serapan'
import { gulungKeAtas } from './pagu'
import type { DataPagu } from './serapan-ringkas'
import { tanggalHariIniWIB, toDateStr } from './tanggal'

/** Berapa rekening ditampilkan per versi / per panel sebelum diringkas jadi "N lainnya". */
export const BATAS_REKENING = 4
export const BATAS_VERSI = 5
export const BATAS_REALISASI = 5

// ── Panel 1 — rekening yang digeser ─────────────────────────────────────────

export interface RekeningGeser {
  kode_rekening: string
  uraian: string
  /** `bertambah_berkurang` apa adanya — bertanda, jadi tanda itu yang diwarnai. */
  nominal: number
}

export interface VersiPergeseran {
  versi_tanggal: string
  jumlah_baris: number
  /** "Pergeseran ke-1 · ditutup 28 Feb 2026" / "basis dari 31 Jan 2026". */
  catatan?: string
  rekening: RekeningGeser[]
  /** Sisa yang tidak muat ditampilkan — 0 kalau semuanya masuk. */
  lainnya: number
}

/**
 * Riwayat pergeseran, TETAP berkelompok per versi.
 *
 * Panel "rekening yang digeser di versi terbaru" akan kosong pada data nyata dan
 * terlihat seperti rusak: menutup sebuah putaran menyalin kolom P ke kolom kiri,
 * jadi versi sesudahnya memang mulai dari selisih nol (L82). Riwayatnya tidak
 * hilang — ia tinggal di versi tempat ia terjadi. Data 2026: 31 Jan punya
 * rekening bergeser, 28 Feb dan 29 Agu nol, dan ketiganya benar.
 *
 * DAUN saja. `recalcPergeseranJumlah` menulis `bertambah_berkurang = pergeseran −
 * jumlah` untuk SETIAP baris termasuk agregat, dan agregat menjumlah anaknya —
 * jadi selisih induk adalah selisih anaknya, diulang. Terbukti di data 2026: 4
 * baris ber-selisih, 2 di antaranya punya anak, dan Rp 5 juta yang sama muncul
 * di keduanya. Tanpa saringan ini satu pergeseran tampil berlapis-lapis sedalam
 * pohonnya. (§2.2 — pelajaran §9.1 konsep serapan lewat pintu lain.)
 *
 * Beda dengan `saringYangBergeser` di `cetak-data.ts`, yang justru MEMBAWA
 * leluhur: di sana hasilnya dokumen anggaran yang tidak terbaca tanpa baris
 * induk; di sini hasilnya daftar rekening, dan induk cuma menggandakan isinya.
 */
export async function riwayatPergeseran(tahun: number): Promise<VersiPergeseran[]> {
  const versiRows = await sql`
    SELECT versi_tanggal, COUNT(*) AS jumlah_baris
    FROM pergeseran_dpa
    WHERE tahun_anggaran = ${tahun}
    GROUP BY versi_tanggal
    ORDER BY versi_tanggal DESC
  ` as Record<string, unknown>[]
  if (!versiRows.length) return []

  const versiList = versiRows
    .map(v => ({ versi_tanggal: toDateStr(v.versi_tanggal), jumlah_baris: Number(v.jumlah_baris ?? 0) }))
    .slice(0, BATAS_VERSI)

  // Batas bawah = versi terlama yang ditampilkan. `versi_tanggal` DATE dan sudah
  // dikelompokkan, jadi `>=` memulangkan tepat kelima versi itu — tanpa perlu
  // LIMIT di dalam subkueri, yang MySQL tolak pada `IN`.
  const sejak = versiList[versiList.length - 1].versi_tanggal

  const [geserMentah, tutup] = await Promise.all([
    (async () => await sql`
      SELECT p.versi_tanggal, p.kode_rekening, p.uraian, p.bertambah_berkurang, p.urutan
      FROM pergeseran_dpa p
      WHERE p.tahun_anggaran = ${tahun}
        AND p.versi_tanggal >= ${sejak}
        AND p.bertambah_berkurang <> 0
        AND NOT EXISTS (
          SELECT 1 FROM pergeseran_dpa k
          WHERE k.tahun_anggaran = p.tahun_anggaran
            AND k.versi_tanggal = p.versi_tanggal
            AND k.parent_id = p.row_id
        )
      ORDER BY p.versi_tanggal DESC, ABS(p.bertambah_berkurang) DESC, p.urutan ASC
    `)(),
    getTutupPergeseran(tahun),
  ])
  const geserRows = geserMentah as Record<string, unknown>[]

  const perVersi = new Map<string, RekeningGeser[]>()
  for (const r of geserRows) {
    const v = toDateStr(r.versi_tanggal)
    const daftar = perVersi.get(v) ?? []
    daftar.push({
      kode_rekening: String(r.kode_rekening ?? ''),
      uraian: String(r.uraian ?? ''),
      nominal: Number(r.bertambah_berkurang ?? 0),
    })
    perVersi.set(v, daftar)
  }

  return versiList.map(v => {
    const semua = perVersi.get(v.versi_tanggal) ?? []
    return {
      ...v,
      catatan: catatanVersi(tutup, v.versi_tanggal),
      rekening: semua.slice(0, BATAS_REKENING),
      lainnya: Math.max(0, semua.length - BATAS_REKENING),
    }
  })
}

// ── Panel 2 — rekening yang baru dicatat realisasinya ───────────────────────

export type StatusSerapan = 'AMAN' | 'MEPET' | 'MENEMBUS' | 'YATIM'

export interface RekeningRealisasi {
  anggaran_key: string
  kode_rekening: string
  uraian: string
  /** Jumlah baris alokasi yang menempel di rekening ini tahun itu. */
  tx: number
  /** `MAX(updated_at)` — `YYYY-MM-DD HH:MM:SS`, waktu server. */
  waktu: string
  /** Total SETAHUN, sudah digulung dari anak-anaknya. */
  terserap: number
  pagu: number
  /** `null` untuk rekening yatim — pagunya tidak ada, jadi persennya tidak bisa dihitung. */
  pct: number | null
  status: StatusSerapan
}

export interface PanelRealisasi {
  rekening: RekeningRealisasi[]
  /** Rekening yang sentuhan terakhirnya jatuh hari ini — dipajang di kepala panel. */
  hari_ini: number
  /**
   * "Hari ini" menurut SERVER, `YYYY-MM-DD`. Ikut dikirim supaya layar tidak
   * menghitungnya sendiri dari `new Date()` peramban: itu membuat HTML server dan
   * klien berbeda (hydration), dan pada server ber-TZ UTC menjelang tengah malam
   * WIB keduanya memang jatuh di tanggal yang berlainan.
   */
  tanggal_hari_ini: string
}

export const PANEL_REALISASI_KOSONG: PanelRealisasi = {
  rekening: [], hari_ini: 0, tanggal_hari_ini: '',
}

interface GrupMentah {
  anggaran_key: string
  tx: number
  waktu: string
}

/**
 * Rekening yang paling baru disentuh, urut `MAX(updated_at)`.
 *
 * **Bukan `tanggal`.** Keduanya ada di `blud_realisasi_tx` dan keduanya masuk
 * akal, tapi hanya satu yang membuat panel ini bergerak: mencatat belanja Maret
 * hari ini akan tenggelam di urutan Maret kalau patokannya `tanggal`. Satu kolom
 * `updated_at` menjawab dua hal sekaligus — saat baris lahir ia sama dengan waktu
 * dibuat, saat dikoreksi ia ikut naik — jadi transaksi yang baru saja dibetulkan
 * juga naik, dan itu memang wajar. (§3.1)
 *
 * Dikelompokkan per `anggaran_key`, bukan per transaksi: yang diminta "rekening".
 * Satu rekening dengan lima transaksi muncul sekali.
 */
export async function realisasiTerbaru(
  tahun: number,
  data: DataPagu,
  hariIni: string = tanggalHariIniWIB(),
): Promise<PanelRealisasi> {
  const rows = await sql`
    SELECT a.anggaran_key AS k, COUNT(*) AS n, MAX(t.updated_at) AS terakhir
    FROM blud_realisasi_alokasi a
    JOIN blud_realisasi_tx t ON t.id = a.tx_id
    WHERE a.tahun_anggaran = ${tahun}
    GROUP BY a.anggaran_key
    ORDER BY terakhir DESC
  ` as Record<string, unknown>[]
  if (!rows.length) return { ...PANEL_REALISASI_KOSONG, tanggal_hari_ini: hariIni }

  const grup: GrupMentah[] = rows.map(r => ({
    anggaran_key: String(r.k ?? ''),
    tx: Number(r.n ?? 0),
    waktu: waktuStr(r.terakhir),
  }))

  return susunPanelRealisasi(grup, data, hariIni)
}

/** `2026-09-01 14:32:05` dari kolom DATETIME, apa pun bentuk yang dipulangkan mysql2. */
export function waktuStr(v: unknown): string {
  if (v instanceof Date) {
    const p = (n: number) => String(n).padStart(2, '0')
    return `${v.getFullYear()}-${p(v.getMonth() + 1)}-${p(v.getDate())} `
      + `${p(v.getHours())}:${p(v.getMinutes())}:${p(v.getSeconds())}`
  }
  return String(v ?? '').slice(0, 19).replace('T', ' ')
}

/**
 * Bagian yang menghitung, dipisah dari yang bertanya ke database SUPAYA BISA
 * DIUJI — pola `hitungRingkas`/`hitungPratinjau`. Panel ini mengaku memakai
 * aturan warna yang sama persis dengan tabel Realisasi; janji begitu harus bisa
 * dibuktikan, bukan dibaca dari JSX.
 *
 * Serapannya DIGULUNG (`gulungKeAtas`), bukan SUM mentah per key: sebuah rekening
 * induk yang alokasinya menempel di anak-anaknya tetap harus tampil di angka yang
 * sama dengan layar Realisasi.
 *
 * Rekening yatim — `anggaran_key` yang sudah LENYAP dari versi pagu berjalan —
 * TETAP tampil, dengan `pct: null`. Uangnya nyata dan sudah keluar, dan justru
 * itu yang paling perlu dilihat; layar Realisasi pun memasang spanduk untuknya.
 * Menyembunyikannya membuang satu-satunya tempat kasus itu terlihat di Beranda.
 * (§3.6)
 */
export function susunPanelRealisasi(
  grup: readonly GrupMentah[],
  data: DataPagu,
  hariIni: string = tanggalHariIniWIB(),
): PanelRealisasi {
  const gulung = gulungKeAtas(data.baris, new Map(data.terserapMap))
  const paguByKey = new Map(data.baris.map(b => [b.anggaran_key, b]))

  let jumlahHariIni = 0
  for (const g of grup) if (g.waktu.slice(0, 10) === hariIni) jumlahHariIni++

  const rekening: RekeningRealisasi[] = grup.slice(0, BATAS_REALISASI).map(g => {
    const b = paguByKey.get(g.anggaran_key)
    const terserap = gulung.get(g.anggaran_key) ?? data.terserapMap.get(g.anggaran_key) ?? 0
    if (!b) {
      return {
        anggaran_key: g.anggaran_key, kode_rekening: g.anggaran_key, uraian: '',
        tx: g.tx, waktu: g.waktu, terserap, pagu: 0, pct: null, status: 'YATIM' as const,
      }
    }
    const sisa = b.pagu - terserap
    const status: StatusSerapan = sisa < -EPS_PRATINJAU
      ? 'MENEMBUS'
      : mepetSetahun(b.pagu, sisa) ? 'MEPET' : 'AMAN'
    return {
      anggaran_key: g.anggaran_key,
      kode_rekening: b.kode_rekening,
      uraian: b.uraian,
      tx: g.tx,
      waktu: g.waktu,
      terserap,
      pagu: b.pagu,
      pct: b.pagu > 0 ? (terserap / b.pagu) * 100 : null,
      status,
    }
  })

  return { rekening, hari_ini: jumlahHariIni, tanggal_hari_ini: hariIni }
}
