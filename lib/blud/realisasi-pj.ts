// lib/blud/realisasi-pj.ts — Realisasi per Penanggung Jawab (layar Realisasi BLUD).
//
// PJ di DPA/Pergeseran dipasang di sebuah baris — biasanya induk — dan berlaku untuk
// seluruh turunannya ("1 PJ per rantai vertikal", Sentinel PJ). Jadi PJ sebuah rekening
// = PJ di baris itu sendiri atau leluhur terdekat yang ber-PJ, dari versi yang SEDANG jadi
// sumber pagu (keputusan pemilik aplikasi: opsi A — transaksi lama ikut PJ yang sekarang,
// supaya pagu & realisasi per PJ diukur dengan dasar yang sama).
//
// Rantai ber-PJ GANDA (induk & turunan sama-sama ber-PJ): PJ induk yang menang. Cetak
// Rekap PJ hanya setengah sejalan — TOTAL-nya melewatkan turunan yang bentrok
// (`auditRekapPJ`), tapi subtotal per PJ-nya mentah, jadi uang turunan itu tampil di dua PJ.
// Di sini tiap rupiah cuma punya SATU PJ supaya jumlah semua baris = total. Jumlah
// baris bentrok dilaporkan (`konflik`).
//
// Angka per PJ = angka baris "kepala"-nya (baris ber-PJ teratas di rantainya), yang di
// layar Realisasi SUDAH digulung dari seluruh turunannya — jadi rekap ini mustahil berbeda
// pendapat dengan kolom s.d. di tabel per rekening. "Belum ada PJ" = total akar − Σ PJ,
// sehingga jumlah semua baris rekap sama persis dengan baris JUMLAH tabel.
//
// MURNI, tanpa impor — dipakai layar, server (register per PJ), dan unduhan Excel/PDF.

export interface BarisPj {
  anggaran_key:      string
  kode_rekening:     string
  uraian:            string
  parent_key:        string | null
  is_leaf:           boolean
  penanggung_jawab?: string | null
  pagu:              number
  terserap:          number
  bulan_ini:         number | null
  bulan_lalu:        number | null
  sd_bulan:          number | null
}

/** Bentuk minimal untuk pemetaan PJ — `BarisPagu` server memenuhinya apa adanya. */
export type BarisPohonPj = Pick<BarisPj, 'anggaran_key' | 'parent_key' | 'penanggung_jawab'>

export const LABEL_TANPA_PJ = 'Belum ada PJ'

/** '' = kosong. "-" dihitung kosong (konvensi audit PJ); spasi berlebih dirapikan. */
export function pjBersih(v: string | null | undefined): string {
  const t = String(v ?? '').replace(/\s+/g, ' ').trim()
  return t === '-' ? '' : t
}

/**
 * anggaran_key → kunci baris "kepala" PJ-nya: leluhur-atau-diri ber-PJ yang PALING ATAS
 * (induk menang saat rantainya ber-PJ ganda). `null` = rantainya tanpa PJ sama sekali.
 */
export function kepalaPj<T extends BarisPohonPj>(rows: readonly T[]): Map<string, string | null> {
  const induk = new Map(rows.map(r => [r.anggaran_key, r.parent_key]))
  const pj = new Map(rows.map(r => [r.anggaran_key, pjBersih(r.penanggung_jawab)]))
  const memo = new Map<string, string | null>()
  const cari = (k: string, jalur: Set<string>): string | null => {
    if (memo.has(k)) return memo.get(k)!
    if (jalur.has(k)) return null // jaga-jaga siklus — data rusak tidak boleh menggantung layar
    jalur.add(k)
    const p = induk.get(k) ?? null
    const dariAtas = p && induk.has(p) ? cari(p, jalur) : null
    const hasil = dariAtas ?? (pj.get(k) ? k : null)
    memo.set(k, hasil)
    return hasil
  }
  for (const r of rows) cari(r.anggaran_key, new Set())
  return memo
}

/** Kunci semua baris milik satu PJ (kepala + turunannya). `pj` kosong = yang tanpa PJ. */
export function kunciMilikPj<T extends BarisPohonPj>(rows: readonly T[], pj: string): Set<string> {
  const kepala = kepalaPj(rows)
  const pjBaris = new Map(rows.map(r => [r.anggaran_key, pjBersih(r.penanggung_jawab)]))
  const sasaran = pjBersih(pj)
  const hasil = new Set<string>()
  for (const r of rows) {
    const k = kepala.get(r.anggaran_key) ?? null
    if (sasaran === '' ? k === null : (k !== null && pjBaris.get(k) === sasaran)) hasil.add(r.anggaran_key)
  }
  return hasil
}

export interface RekapPj {
  /** Label PJ; '' untuk baris "Belum ada PJ". */
  pj:          string
  /** Rekening DAUN yang ditanggung. */
  rekening:    number
  pagu:        number
  bulan_ini:   number
  bulan_lalu:  number
  sd_bulan:    number
  terserap:    number
  sisa:        number
  persen:      number
}

export interface HasilRekapPj {
  /** Urut nama PJ. */
  baris:   RekapPj[]
  /** `null` kalau semua rekening sudah ber-PJ dan tidak ada sisa angka. */
  tanpaPj: RekapPj | null
  total:   RekapPj
  /** Baris ber-PJ yang leluhurnya juga ber-PJ — dihitung ke PJ induk. */
  konflik: number
}

type Angka = Pick<RekapPj, 'pagu' | 'bulan_ini' | 'bulan_lalu' | 'sd_bulan' | 'terserap'>
const nol = (): Angka => ({ pagu: 0, bulan_ini: 0, bulan_lalu: 0, sd_bulan: 0, terserap: 0 })
function tambah(a: Angka, r: BarisPj) {
  a.pagu += r.pagu; a.terserap += r.terserap
  a.bulan_ini += r.bulan_ini ?? 0; a.bulan_lalu += r.bulan_lalu ?? 0; a.sd_bulan += r.sd_bulan ?? 0
}
/** Sisa & persen dgn acuan yang SAMA dgn route pagu: s.d. bulan terpilih, atau setahun. */
function jadi(pj: string, rekening: number, a: Angka, adaBulan: boolean): RekapPj {
  const acuan = adaBulan ? a.sd_bulan : a.terserap
  return { pj, rekening, ...a, sisa: a.pagu - acuan, persen: a.pagu > 0 ? (acuan / a.pagu) * 100 : 0 }
}
const EPS = 0.005

export function rekapPerPj(rows: readonly BarisPj[]): HasilRekapPj {
  const kepala = kepalaPj(rows)
  const adaBulan = rows.some(r => r.sd_bulan != null)
  const perPj = new Map<string, { a: Angka; rekening: number }>()
  const ambil = (pj: string) => {
    let x = perPj.get(pj)
    if (!x) { x = { a: nol(), rekening: 0 }; perPj.set(pj, x) }
    return x
  }
  const pjBaris = new Map(rows.map(r => [r.anggaran_key, pjBersih(r.penanggung_jawab)]))
  let konflik = 0
  let rekeningTanpa = 0
  const total = nol()
  for (const r of rows) {
    const k = kepala.get(r.anggaran_key) ?? null
    // Kepala = baris ber-PJ teratas: angkanya sudah memuat seluruh turunannya.
    if (k === r.anggaran_key) tambah(ambil(pjBaris.get(k)!).a, r)
    else if (k !== null && pjBaris.get(r.anggaran_key)) konflik++
    if (r.is_leaf) {
      if (k === null) rekeningTanpa++
      else ambil(pjBaris.get(k)!).rekening++
    }
    if (!r.parent_key) tambah(total, r)
  }
  const baris = [...perPj.entries()]
    .map(([pj, x]) => jadi(pj, x.rekening, x.a, adaBulan))
    .sort((a, b) => a.pj.localeCompare(b.pj, 'id'))
  const sisa: Angka = { ...total }
  for (const b of baris) {
    sisa.pagu -= b.pagu; sisa.terserap -= b.terserap
    sisa.bulan_ini -= b.bulan_ini; sisa.bulan_lalu -= b.bulan_lalu; sisa.sd_bulan -= b.sd_bulan
  }
  const adaSisa = rekeningTanpa > 0 || Object.values(sisa).some(v => Math.abs(v) > EPS)
  return {
    baris,
    tanpaPj: adaSisa ? jadi('', rekeningTanpa, sisa, adaBulan) : null,
    total: jadi('', baris.reduce((s, b) => s + b.rekening, 0) + rekeningTanpa, total, adaBulan),
    konflik,
  }
}

/** Rekening DAUN milik satu PJ (`''` = tanpa PJ), urutan tabel dipertahankan. */
export function daunMilikPj<T extends BarisPj>(rows: readonly T[], pj: string): T[] {
  const milik = kunciMilikPj(rows, pj)
  return rows.filter(r => r.is_leaf && milik.has(r.anggaran_key))
}

/** Daftar pilihan saringan PJ di tabel per rekening — urut nama, "Belum ada PJ" di akhir. */
export function pilihanPj(hasil: HasilRekapPj): { value: string; label: string }[] {
  return [
    ...hasil.baris.map(b => ({ value: b.pj, label: b.pj })),
    ...(hasil.tanpaPj ? [{ value: '', label: LABEL_TANPA_PJ }] : []),
  ]
}

// ── Bahan unduhan (Excel & PDF memakai larik yang sama — satu sumber angka) ──

export type SelEkspor = string | number

/** Kepala kolom rekap — `namaBulan` = bulan terpilih di layar. */
export function kolomRekapPj(namaBulan: string): string[] {
  return ['Penanggung Jawab', 'Rekening', 'Pagu', namaBulan, 's.d. Bln Lalu', `s.d. ${namaBulan}`, `Sisa s.d. ${namaBulan}`, '%']
}

const baris = (label: string, r: RekapPj): SelEkspor[] =>
  [label, r.rekening, r.pagu, r.bulan_ini, r.bulan_lalu, r.sd_bulan, r.sisa, r.pagu > 0 ? Math.round(r.persen) : '']

/** Baris rekap: per PJ, "Belum ada PJ", lalu JUMLAH — persis yang tampil di layar. */
export function tabelRekapPj(hasil: HasilRekapPj): SelEkspor[][] {
  return [
    ...hasil.baris.map(b => baris(b.pj, b)),
    ...(hasil.tanpaPj ? [baris(LABEL_TANPA_PJ, hasil.tanpaPj)] : []),
    baris('JUMLAH', hasil.total),
  ]
}

export function kolomRincianPj(namaBulan: string): string[] {
  return ['Penanggung Jawab', 'Kode Rekening', 'Uraian', 'Pagu', namaBulan, 's.d. Bln Lalu', `s.d. ${namaBulan}`, `Sisa s.d. ${namaBulan}`, '%']
}

/**
 * Rincian rekening per PJ — daun tiap PJ lalu baris "Jumlah <PJ>" yang mengambil angka
 * REKAP (bukan menjumlah daun), supaya subtotal di berkas = angka rekap di layar.
 */
export function tabelRincianPj<T extends BarisPj>(rows: readonly T[], hasil: HasilRekapPj): SelEkspor[][] {
  const keluar: SelEkspor[][] = []
  const kelompok = [...hasil.baris, ...(hasil.tanpaPj ? [hasil.tanpaPj] : [])]
  for (const g of kelompok) {
    const label = g.pj || LABEL_TANPA_PJ
    for (const r of daunMilikPj(rows, g.pj)) {
      const acuan = r.sd_bulan ?? r.terserap
      keluar.push([label, r.kode_rekening, r.uraian, r.pagu, r.bulan_ini ?? 0, r.bulan_lalu ?? 0, r.sd_bulan ?? 0,
        r.pagu - acuan, r.pagu > 0 ? Math.round((acuan / r.pagu) * 100) : ''])
    }
    keluar.push([`Jumlah ${label}`, '', '', g.pagu, g.bulan_ini, g.bulan_lalu, g.sd_bulan, g.sisa, g.pagu > 0 ? Math.round(g.persen) : ''])
  }
  return keluar
}
