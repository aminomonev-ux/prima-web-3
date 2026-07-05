// lib/blud/audit-pj.ts
// Hybrid (no-AI) audit untuk Rekap Penanggung Jawab BLUD.
// Port dari Aplikasi BLUD (GAS) blud.html line 7037-7400 auditRekapPJ().
//
// Mendeteksi:
//   1. Double-entry (chain-conflict): rowId masuk rekap + ancestor juga masuk
//   2. Belum-entry: leaf dgn jumlah>0 yang tidak di-rekap (chain pun kosong PJ)
//   3. Selisih saldo: grandTotal rekap vs totalDPA Belanja Daerah
//
// Refactor 2026-05-25 (Opsi B): chain-conflict + belum-entry detection di-delegate
// ke `lib/blud/pj-conflict.ts::validatePjRules()` — single source of truth dgn
// Sentinel PJ. Stats (selisih/totalPJ) tetap di sini krn audit-specific.
//
// AI integration: di-defer (roadmap: /api/blud/audit-pj/ai).

import type { DpaBaris } from '@/types'
import {
  validatePjRules,
  type PjChainConflictFinding,
  type PjBelumEntryFinding,
} from './pj-conflict'

export interface AuditDoubleEntry {
  rowId:   string
  uraian:  string
  jumlah:  number
  pj:      string
  kode:    string
  konflik: {
    rowId:    string
    uraian:   string
    jumlah:   number
    pj:       string
    kode:     string
    hubungan: 'ancestor (induk/atasan)'
  }
}

export interface AuditBelumEntry {
  rowId:    string
  uraian:   string
  jumlah:   number
  kode:     string
  tipe:     string
  pjDiDPA:  string
  punyaAnak: boolean
}

export type AuditStatusSaldo = 'ok' | 'lebih' | 'kurang'

// B3: definisi Total DPA seragam dgn dashboard getDpaTotal() — struktural
// (GRANDMASTER → fallback root parent NULL), lookup uraian 'BELANJA DAERAH'
// hanya fallback terakhir. Root bernama lain tidak lagi bikin totalDPA = 0.
export function totalDpaBlud(
  rows: Array<Pick<DpaBaris, 'tipe_baris' | 'parent_id' | 'uraian' | 'jumlah'>>,
): number {
  let grand = 0
  let roots = 0
  for (const r of rows) {
    const j = Number(r.jumlah) || 0
    if (r.tipe_baris === 'GRANDMASTER') grand += j
    else if (!r.parent_id) roots += j
  }
  if (grand > 0) return grand
  if (roots > 0) return roots
  return Number(rows.find(r => (r.uraian ?? '').trim().toUpperCase() === 'BELANJA DAERAH')?.jumlah ?? 0)
}

export interface AuditResult {
  grandTotal:    number
  totalDPA:      number
  selisih:       number
  statusSaldo:   AuditStatusSaldo
  doubleEntries: AuditDoubleEntry[]
  belumEntry:    AuditBelumEntry[]
  /** Jumlah PJ unique yang di-rekap. */
  totalPJ:       number
}

// ──────────────────────────────────────────────────────────────────────────
// Public entry: jalankan audit
// ──────────────────────────────────────────────────────────────────────────
export function auditRekapPJ(dpaRows: DpaBaris[]): AuditResult {
  // ── 1. Unified validator (Sentinel + Audit pakai sama) ──
  const findings = validatePjRules(dpaRows)

  // ── 2. Map chain-conflict → AuditDoubleEntry shape ──
  const doubleEntries: AuditDoubleEntry[] = findings
    .filter((f): f is PjChainConflictFinding => f.kind === 'chain-conflict')
    .map(f => ({
      rowId:  f.row.row_id,
      uraian: f.row.uraian,
      jumlah: f.row.jumlah ?? 0,
      pj:     f.row.pj,
      kode:   f.row.kode_rekening,
      konflik: {
        rowId:    f.conflict.row_id,
        uraian:   f.conflict.uraian,
        jumlah:   f.conflict.jumlah ?? 0,
        pj:       f.conflict.pj,
        kode:     f.conflict.kode_rekening,
        hubungan: 'ancestor (induk/atasan)',
      },
    }))

  // ── 3. Map belum-entry → AuditBelumEntry shape (1:1 field rename) ──
  const belumEntry: AuditBelumEntry[] = findings
    .filter((f): f is PjBelumEntryFinding => f.kind === 'belum-entry')
    .map(f => ({
      rowId:     f.row_id,
      uraian:    f.uraian,
      jumlah:    f.jumlah,
      kode:      f.kode,
      tipe:      f.tipe,
      pjDiDPA:   f.pjDiDPA,
      punyaAnak: f.punyaAnak,
    }))

  // ── 4. Stats audit-specific (selisih saldo + totalPJ) ──
  // B4: baris chain-conflict (ancestor juga ber-PJ) di-skip dari grand total —
  // nominalnya sudah tercakup di ancestor, tanpa skip totalnya dobel-hitung
  const conflictedIds = new Set(doubleEntries.map(d => d.rowId))
  let grandTotal = 0
  const uniquePJ = new Set<string>()
  for (const r of dpaRows) {
    const pj = (r.penanggung_jawab ?? '').trim()
    if (!pj || pj === '-') continue
    uniquePJ.add(pj)
    if (conflictedIds.has(r.row_id)) continue
    grandTotal += Number(r.jumlah) || 0
  }
  const totalDPA = totalDpaBlud(dpaRows)
  const selisih  = grandTotal - totalDPA
  const statusSaldo: AuditStatusSaldo =
    Math.abs(selisih) < 1 ? 'ok' : selisih > 0 ? 'lebih' : 'kurang'

  return {
    grandTotal,
    totalDPA,
    selisih,
    statusSaldo,
    doubleEntries,
    belumEntry,
    totalPJ: uniquePJ.size,
  }
}
