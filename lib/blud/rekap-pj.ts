// lib/blud/rekap-pj.ts — SATU aturan "berapa uang tiap Penanggung Jawab" untuk Cetak Rekap PJ
// DAN auto-fill nominal BLUD di Form PK. PURE, aman-klien.
// Konsep: docs/konsep/pk/CONCEPT-pk-nominal-blud-langsung.md.
//
// Subtotal per PJ sengaja MENTAH (jumlah semua baris ber-PJ itu, apa adanya) — sama dengan
// layar Cetak yang dipakai orang untuk memeriksa angka PK. PJ dobel dalam satu rantai
// dilaporkan lewat `auditRekapPJ`, tidak diam-diam dibuang dari subtotalnya.

import type { DpaBaris, PergeseranBaris } from '@/types'
import { auditRekapPJ, type AuditPjRow, type AuditDoubleEntry } from './audit-pj'
import {
  rekonsiliasiPj, periksaLabelPj, kalimatNeraca, kalimatPos, kalimatLabel, bandingVersi, kalimatBanding,
  saranPjDobel, kalimatDobel, pjTingkatTakLazim, kalimatTakLazim, labelTanpaPk, kalimatTanpaPk,
  type KonteksPj, type BarisRekon,
} from './rekonsiliasi-pj'

export interface ItemPj {
  uraian: string
  jumlah: number
  tipe: string
  rowId: string
  parentId: string
}

export interface KelompokPj {
  pj: string
  items: ItemPj[]
  subtotal: number
}

const rapikanPj = (s: string | null | undefined) => (s ?? '').trim()
const adaPj = (pj: string) => pj !== '' && pj !== '-'

/** Kelompok per PJ dalam urutan kemunculan baris — urutan tabel Cetak. */
export function kelompokPerPj(rows: readonly AuditPjRow[]): KelompokPj[] {
  const grup = new Map<string, KelompokPj>()
  for (const r of rows) {
    const pj = rapikanPj(r.penanggung_jawab)
    if (!adaPj(pj)) continue
    let g = grup.get(pj)
    if (!g) { g = { pj, items: [], subtotal: 0 }; grup.set(pj, g) }
    const jumlah = Number(r.jumlah) || 0
    g.items.push({ uraian: r.uraian, jumlah, tipe: r.tipe_baris, rowId: r.row_id, parentId: r.parent_id ?? '' })
    g.subtotal += jumlah
  }
  return [...grup.values()]
}

/** Baris DPA apa adanya. */
export const barisRekapDpa = (rows: readonly DpaBaris[]): AuditPjRow[] => rows as unknown as AuditPjRow[]

/**
 * Baris Pergeseran dengan `jumlah` = pagu PASCA-geser (`pergeseran`). `jumlah` di baris
 * pergeseran masih angka DPA; yang berlaku sesudah digeser ada di `pergeseran`.
 */
export const barisRekapPergeseran = (rows: readonly PergeseranBaris[]): AuditPjRow[] =>
  rows.map(r => ({ ...r, jumlah: r.pergeseran })) as unknown as AuditPjRow[]

export interface NominalUnit {
  /**
   * Label PJ yang dipetakan ke unit, beserta subtotalnya di versi ini (0 + `ada:false` = tidak
   * ditemukan). `items` = baris yang membentuk subtotal itu, dari pengelompokan yang SAMA —
   * lampiran PK memakainya sebagai rincian, jadi jumlahnya tidak mungkin berbeda dari subtotal.
   */
  per: Array<{ label: string; nominal: number; ada: boolean; items: ItemPj[] }>
  total: number
  /** Baris yang uangnya terhitung di DUA PJ, dan salah satunya PJ milik unit ini. */
  dobel: AuditDoubleEntry[]
  /** Selisih Total anggaran vs Total Rekap PJ — angka "Selisih" di layar Cetak. */
  selisih: number
  /** Baris berisi yang belum ber-PJ (penyebab selisih). */
  belumPj: { baris: number; nominal: number }
}

/**
 * Nominal BLUD sebuah unit PK = jumlah subtotal label PJ miliknya. Label dicocokkan tanpa
 * peduli huruf besar & spasi tepi (dulu lewat kolasi MySQL; perilakunya dipertahankan).
 */
export function nominalUntukUnit(rows: readonly AuditPjRow[], labels: readonly string[]): NominalUnit {
  const kunci = (s: string) => rapikanPj(s).toLowerCase()
  // Kelompok Cetak dibedakan per ejaan persis; di sini "Kabid X" dan "KABID X" satu PJ, jadi
  // digabung — Map biasa membuat kelompok terakhir menimpa yang pertama (subtotalnya hilang).
  const perKunci = new Map<string, { subtotal: number; items: ItemPj[] }>()
  for (const g of kelompokPerPj(rows)) {
    const ada = perKunci.get(kunci(g.pj))
    if (ada) { ada.subtotal += g.subtotal; ada.items.push(...g.items) }
    else perKunci.set(kunci(g.pj), { subtotal: g.subtotal, items: [...g.items] })
  }
  const dicari = [...new Map(labels.filter(l => adaPj(rapikanPj(l))).map(l => [kunci(l), rapikanPj(l)])).entries()]
  const per = dicari.map(([k, label]) => {
    const grup = perKunci.get(k)
    return { label, nominal: grup?.subtotal ?? 0, ada: grup !== undefined, items: grup?.items ?? [] }
  })
  const milik = new Set(dicari.map(([k]) => k))

  const audit = auditRekapPJ([...rows])
  const dobel = audit.doubleEntries.filter(d => milik.has(kunci(d.pj)) || milik.has(kunci(d.konflik.pj)))
  return {
    per,
    total: per.reduce((s, p) => s + p.nominal, 0),
    dobel,
    selisih: audit.totalDPA - audit.grandTotal,
    belumPj: daunTanpaPj(rows),
  }
}

/**
 * Uang yang tidak masuk PJ mana pun = DAUN berisi yang dirinya dan seluruh leluhurnya tanpa PJ.
 * Bukan `audit.belumEntry`: daftar itu ikut memuat induk tanpa PJ (akar Belanja) yang angkanya
 * sudah mencakup anak-anaknya — menjumlahkannya menggandakan uang (L85).
 */
function daunTanpaPj(rows: readonly AuditPjRow[]): { baris: number; nominal: number } {
  const byId = new Map(rows.map(r => [r.row_id, r]))
  const punyaAnak = new Set(rows.map(r => r.parent_id).filter(Boolean))
  let baris = 0, nominal = 0
  for (const r of rows) {
    const jumlah = Number(r.jumlah) || 0
    if (punyaAnak.has(r.row_id) || jumlah === 0) continue
    let kini: AuditPjRow | undefined = r, ber = false
    // Pagar kedalaman: rantai melingkar ditolak saat simpan, tapi ini jalur BACA (pola saringYangBergeser).
    for (let pagar = 0; kini && pagar < 64; pagar++) {
      if (adaPj(rapikanPj(kini.penanggung_jawab))) { ber = true; break }
      kini = kini.parent_id ? byId.get(kini.parent_id) : undefined
    }
    if (!ber) { baris++; nominal += jumlah }
  }
  return { baris, nominal }
}

// ─── Susunan dokumen unduhan (Excel & PDF) ───────────────────────────────────
// CONCEPT-blud-format-unduhan §6.2: baris yang PJ-nya dobel dengan leluhurnya DITANDAI
// di tabel, angkanya tidak diubah. Subtotal tetap MENTAH (= layar = Form PK); yang bersih
// hanya JUMLAH SELURUHNYA (`auditRekapPJ.grandTotal`).

export type BarisRekapPj =
  /** `porsi` = bagian dari JUMLAH SELURUHNYA, tanpa baris dobel (semua porsi berjumlah 100%). */
  | { jenis: 'kelompok'; huruf: string; pj: string; subtotal: number; porsi: number }
  | { jenis: 'rincian'; nomor: number; uraian: string; jumlah: number; dobelDengan: string | null }
  | { jenis: 'subtotal'; huruf: string; subtotal: number }

export interface SusunanRekapPj {
  baris: BarisRekapPj[]
  /** Bersih dari dobel — sama dengan total di layar Cetak. */
  total: number
  totalAnggaran: number
  selisih: number
  jumlahDobel: number
  /** Kalimat catatan di bawah tabel, urut tampil. */
  catatan: string[]
}

/** Huruf kelompok: A…Z, lalu AA, AB, … */
export function hurufKelompok(i: number): string {
  let s = ''
  for (let k = i + 1; k > 0; k = Math.floor((k - 1) / 26)) s = String.fromCharCode(65 + ((k - 1) % 26)) + s
  return s
}

/** Batas pos penyebab selisih yang ikut tercetak — sisanya disebut jumlahnya. */
export const BATAS_CATATAN_POS = 40
/** Batas butir per jenis temuan lain (PJ dobel, tingkat tak lazim, label) di catatan unduhan. */
export const BATAS_CATATAN_LAIN = 20

/**
 * Konteks pembanding Audit Rekap PJ dalam bentuk MENTAH (baris API), seperti yang dimuat
 * layar Cetak. `siapkanKonteksPj` menukarnya ke bentuk rekap: baris Pergeseran memakai pagu
 * PASCA-geser (`barisRekapPergeseran`), sama dgn tabel yang direkap.
 */
export interface KonteksPjMentah {
  sebelum?: { versi: string; rows: Array<DpaBaris | PergeseranBaris> } | null
  tahunLalu?: { tahun: number; rows: Array<DpaBaris | PergeseranBaris> } | null
  /** Pergeseran saja: DPA versi acuannya (PJ Pergeseran = salinan DPA). */
  dpaAcuan?: { versi: string; rows: DpaBaris[] } | null
  /** Label PJ yang dipakai Form PK (`GET /api/blud/penanggung-jawab?mode=pk`). */
  labelPk?: string[] | null
}

export function siapkanKonteksPj(sumber: 'dpa' | 'pergeseran', raw: KonteksPjMentah | null | undefined): KonteksPj {
  const ubah = (rows: Array<DpaBaris | PergeseranBaris>): BarisRekon[] =>
    (sumber === 'pergeseran'
      ? barisRekapPergeseran(rows as PergeseranBaris[])
      : barisRekapDpa(rows as DpaBaris[])) as unknown as BarisRekon[]
  return {
    sebelum: raw?.sebelum?.rows.length ? { versi: raw.sebelum.versi, rows: ubah(raw.sebelum.rows) } : null,
    tahunLalu: raw?.tahunLalu?.rows.length ? { tahun: raw.tahunLalu.tahun, rows: ubah(raw.tahunLalu.rows) } : null,
    dpaAcuan: sumber === 'pergeseran' && raw?.dpaAcuan?.rows.length
      ? { versi: raw.dpaAcuan.versi, rows: raw.dpaAcuan.rows as unknown as BarisRekon[] } : null,
  }
}

export function susunRekapPj(
  rows: readonly AuditPjRow[],
  labelSumber: string,
  opsi: { konteks?: KonteksPj; labelPk?: readonly string[] | null } = {},
): SusunanRekapPj {
  const audit = auditRekapPJ([...rows])
  const dobel = new Map(audit.doubleEntries.map(d => [d.rowId, d.konflik.pj]))
  const baris: BarisRekapPj[] = []
  kelompokPerPj(rows).forEach((g, i) => {
    const huruf = hurufKelompok(i)
    // Porsi dari subtotal TANPA baris dobel, terhadap total bersih — kalau dari subtotal
    // mentah, kolom % berjumlah lebih dari 100% begitu ada satu baris dobel.
    const bersih = g.items.reduce((s, it) => s + (dobel.has(it.rowId) ? 0 : it.jumlah), 0)
    baris.push({ jenis: 'kelompok', huruf, pj: g.pj, subtotal: g.subtotal, porsi: audit.grandTotal ? bersih / audit.grandTotal : 0 })
    g.items.forEach((it, j) => baris.push({
      jenis: 'rincian', nomor: j + 1, uraian: it.uraian, jumlah: it.jumlah, dobelDengan: dobel.get(it.rowId) ?? null,
    }))
    baris.push({ jenis: 'subtotal', huruf, subtotal: g.subtotal })
  })
  const selisih = audit.totalDPA - audit.grandTotal
  // Catatan pemeriksaan ikut tercetak (CONCEPT-blud-audit-pj-pintar §4): neraca, lalu
  // tiap pos penyebab selisih dgn barisnya & saran PJ — sama dgn panel di layar Cetak.
  const baris_ = rows as unknown as BarisRekon[]
  const konteks = opsi.konteks ?? {}
  const rekon = rekonsiliasiPj(baris_, konteks)
  const catatan = [kalimatNeraca(rekon, labelSumber)]
  if (konteks.sebelum) {
    catatan.push(kalimatBanding(bandingVersi(rekon, rekonsiliasiPj(konteks.sebelum.rows), konteks.sebelum.versi)))
  }
  if (audit.doubleEntries.length) {
    catatan.push(`* ${audit.doubleEntries.length} baris ber-PJ yang leluhurnya juga ber-PJ: angkanya tetap masuk subtotal PJ-nya, tetapi tidak dihitung di JUMLAH SELURUHNYA supaya tidak dobel.`)
  }
  const tampil = rekon.pos.slice(0, BATAS_CATATAN_POS)
  if (tampil.length) {
    catatan.push(`Penyebab selisih (${rekon.pos.length} pos):`)
    tampil.forEach((p, i) => catatan.push(`${i + 1}. ${kalimatPos(p)}`))
    if (rekon.pos.length > tampil.length) {
      catatan.push(`… dan ${rekon.pos.length - tampil.length} pos lainnya — daftar lengkap di panel Audit menu Cetak.`)
    }
  }
  const potong = <T>(xs: T[], ke: (x: T) => string) => {
    for (const x of xs.slice(0, BATAS_CATATAN_LAIN)) catatan.push(ke(x))
    if (xs.length > BATAS_CATATAN_LAIN) catatan.push(`… dan ${xs.length - BATAS_CATATAN_LAIN} lainnya — daftar lengkap di panel Audit menu Cetak.`)
  }
  potong(saranPjDobel(baris_), kalimatDobel)
  potong(pjTingkatTakLazim(baris_).daftar, kalimatTakLazim)
  potong(labelTanpaPk(baris_, opsi.labelPk), kalimatTanpaPk)
  for (const t of periksaLabelPj(baris_)) catatan.push(kalimatLabel(t))
  return {
    baris, total: audit.grandTotal, totalAnggaran: audit.totalDPA, selisih,
    jumlahDobel: audit.doubleEntries.length, catatan,
  }
}
