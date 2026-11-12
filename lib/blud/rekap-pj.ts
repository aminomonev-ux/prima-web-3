// lib/blud/rekap-pj.ts — SATU aturan "berapa uang tiap Penanggung Jawab" untuk Cetak Rekap PJ
// DAN auto-fill nominal BLUD di Form PK. PURE, aman-klien.
// Konsep: docs/CONCEPT-pk-nominal-blud-langsung.md.
//
// Subtotal per PJ sengaja MENTAH (jumlah semua baris ber-PJ itu, apa adanya) — sama dengan
// layar Cetak yang dipakai orang untuk memeriksa angka PK. PJ dobel dalam satu rantai
// dilaporkan lewat `auditRekapPJ`, tidak diam-diam dibuang dari subtotalnya.

import type { DpaBaris, PergeseranBaris } from '@/types'
import { auditRekapPJ, type AuditPjRow, type AuditDoubleEntry } from './audit-pj'

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
  /** Label PJ yang dipetakan ke unit, beserta subtotalnya di versi ini (0 + `ada:false` = tidak ditemukan). */
  per: Array<{ label: string; nominal: number; ada: boolean }>
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
  const perKunci = new Map(kelompokPerPj(rows).map(g => [kunci(g.pj), g.subtotal]))
  const dicari = [...new Map(labels.filter(l => adaPj(rapikanPj(l))).map(l => [kunci(l), rapikanPj(l)])).entries()]
  const per = dicari.map(([k, label]) => ({ label, nominal: perKunci.get(k) ?? 0, ada: perKunci.has(k) }))
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
