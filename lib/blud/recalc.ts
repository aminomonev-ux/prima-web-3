// lib/blud/recalc.ts
// ─────────────────────────────────────────────────────────────────────────────
// Kalkulasi hierarki Jumlah bottom-up — full + partial recalc, geser baris
// Port dari blud-app ke prima-web (Neon Postgres, no DOM)
// ─────────────────────────────────────────────────────────────────────────────

import type { DpaBarisInput, PergeseranBarisInput, TipeBaris } from '@/types'
import { hitungJumlah } from './format'

type AnyBaris = DpaBarisInput | PergeseranBarisInput

// ─── HIERARKI KALKULASI (CHAIN STRICT L1 → L8.1) ─────────────────────────────
//
//  L1   GRANDMASTER       (root)
//  L2   MASTER            head
//  L2.1 CHILD             leaf/aggregator
//  L3   LEADER            head
//  L3.1 MEMBER            leaf/aggregator
//  L4   PLETON-LEADER     head
//  L4.1 PLETON-MEMBER     leaf/aggregator
//  L5   KETUA-KELOMPOK-A  head
//  L5.1 ANGGOTA-KELOMPOK-A leaf/aggregator
//  L6   KETUA-KELOMPOK-B  head
//  L6.1 ANGGOTA-KELOMPOK-B leaf/aggregator
//  L7   L7-HEAD           head
//  L7.1 L7-SUB            leaf/aggregator
//  L8   L8-HEAD           head
//  L8.1 L8-SUB            leaf (max depth)
//
// Aturan unified:
//   - Row di EDITABLE → LEAF kalau punya 0 anak (jumlah = vol × harga),
//                      AGGREGATOR kalau punya ≥1 anak (jumlah = Σ children).
//   - Row di HEAD (non-EDITABLE) → AGGREGATOR selalu (jumlah = Σ children).
//   - GRANDMASTER → Σ MASTER.
// Bottom-up order: deepest first.

/**
 * Tipe yang BISA jadi leaf (input vol/harga); switch ke aggregator saat punya anak.
 * Semua tipe kecuali root (GRANDMASTER) sekarang bisa leaf-mode. Head LN (LEADER,
 * PLETON-LEADER, KETUA-A, KETUA-B, L7-HEAD, L8-HEAD) yang belum punya anak = leaf,
 * setelah klik `+` & dapat anak = aggregator. Sama dengan sub-leaves.
 */
const EDITABLE: ReadonlySet<TipeBaris> = new Set([
  'MASTER',           // L2 head
  'CHILD',            // L2.1
  'LEADER',           // L3 head
  'MEMBER',           // L3.1
  'PLETON-LEADER',    // L4 head
  'PLETON-MEMBER',    // L4.1
  'KETUA-KELOMPOK-A', // L5 head
  'ANGGOTA-KELOMPOK-A',// L5.1
  'KETUA-KELOMPOK-B', // L6 head
  'ANGGOTA-KELOMPOK-B',// L6.1
  'L7-HEAD', 'L7-SUB',
  'L8-HEAD', 'L8-SUB',
])

/** Bottom-up depth order: deepest first → root last. */
const DEPTH_ORDER: readonly TipeBaris[] = [
  'L8-SUB', 'L8-HEAD',
  'L7-SUB', 'L7-HEAD',
  'ANGGOTA-KELOMPOK-B', 'KETUA-KELOMPOK-B',
  'ANGGOTA-KELOMPOK-A', 'KETUA-KELOMPOK-A',
  'PLETON-MEMBER',       'PLETON-LEADER',
  'MEMBER',              'LEADER',
  'CHILD',               'MASTER',
  'GRANDMASTER',
]

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function buildChildMap<T extends AnyBaris>(rows: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>()
  for (const r of rows) {
    if (!r.parent_id) continue
    if (!map.has(r.parent_id)) map.set(r.parent_id, [])
    map.get(r.parent_id)!.push(r)
  }
  return map
}

/** Row punya minimal 1 anak (chain child) → mode AGGREGATOR. */
export function isAggregator<T extends AnyBaris>(rowId: string, childMap: Map<string, T[]>): boolean {
  return (childMap.get(rowId)?.length ?? 0) > 0
}

/** Row dalam mode LEAF (editable type + no children). */
export function isLeafMode<T extends AnyBaris>(row: T, childMap: Map<string, T[]>): boolean {
  return EDITABLE.has(row.tipe_baris) && !isAggregator(row.row_id, childMap)
}

// ─── DPA FULL RECALC ─────────────────────────────────────────────────────────

export function recalcDpaJumlah(rows: DpaBarisInput[]): DpaBarisInput[] {
  const data     = rows.map(r => ({ ...r }))
  const childMap = buildChildMap(data)

  // Process bottom-up: deepest tipe first
  for (const tipe of DEPTH_ORDER) {
    for (const r of data) {
      if (r.tipe_baris !== tipe) continue
      const kids = childMap.get(r.row_id) ?? []
      if (kids.length === 0) {
        // LEAF mode (or orphan head)
        r.jumlah = EDITABLE.has(r.tipe_baris) ? hitungJumlah(r.vol, r.harga) : 0
      } else {
        // AGGREGATOR mode — sum all children regardless of type (chain rule)
        r.jumlah = kids.reduce((s, c) => s + (c.jumlah ?? 0), 0)
      }
    }
  }

  return data
}

// ─── PERGESERAN FULL RECALC ───────────────────────────────────────────────────

export function recalcPergeseranJumlah(rows: PergeseranBarisInput[]): PergeseranBarisInput[] {
  const data     = rows.map(r => ({ ...r }))
  const childMap = buildChildMap(data)

  for (const tipe of DEPTH_ORDER) {
    for (const r of data) {
      if (r.tipe_baris !== tipe) continue
      const kids = childMap.get(r.row_id) ?? []
      if (kids.length === 0) {
        if (EDITABLE.has(r.tipe_baris)) {
          r.pergeseran = hitungJumlah(r.vol_p, r.harga_p)
        } else {
          r.pergeseran = 0
        }
      } else {
        r.pergeseran = kids.reduce((s, c) => s + (c.pergeseran ?? 0), 0)
      }
      r.bertambah_berkurang = r.pergeseran - (r.jumlah ?? 0)
    }
  }

  return data
}

// ─── DPA PARTIAL RECALC ───────────────────────────────────────────────────────
// Hanya recalc baris yang berubah + semua ancestor-nya. O(level) bukan O(n×level).

export function partialRecalcDpa(rows: DpaBarisInput[], changedRowId: string): DpaBarisInput[] {
  const data     = rows.map(r => ({ ...r }))
  const byId     = new Map<string, DpaBarisInput>()
  data.forEach(r => byId.set(r.row_id, r))
  const childMap = buildChildMap(data)

  const changed = byId.get(changedRowId)
  if (!changed) return data

  // Recalc the changed row first (leaf or aggregator)
  const changedKids = childMap.get(changed.row_id) ?? []
  if (changedKids.length === 0 && EDITABLE.has(changed.tipe_baris)) {
    changed.jumlah = hitungJumlah(changed.vol, changed.harga)
  } else if (changedKids.length > 0) {
    changed.jumlah = changedKids.reduce((s, c) => s + (c.jumlah ?? 0), 0)
  }

  // Walk up ancestor chain — each parent re-sums all its direct children
  let current: DpaBarisInput | undefined = changed
  while (current?.parent_id) {
    const parent: DpaBarisInput | undefined = byId.get(current.parent_id)
    if (!parent) break
    const kids = childMap.get(parent.row_id) ?? []
    parent.jumlah = kids.reduce((s, c) => s + (c.jumlah ?? 0), 0)
    current = parent
  }

  return data
}

// ─── PERGESERAN PARTIAL RECALC ────────────────────────────────────────────────

export function partialRecalcPergeseran(rows: PergeseranBarisInput[], changedRowId: string): PergeseranBarisInput[] {
  const data     = rows.map(r => ({ ...r }))
  const byId     = new Map<string, PergeseranBarisInput>()
  data.forEach(r => byId.set(r.row_id, r))
  const childMap = buildChildMap(data)

  const changed = byId.get(changedRowId)
  if (!changed) return data

  const changedKids = childMap.get(changed.row_id) ?? []
  if (changedKids.length === 0 && EDITABLE.has(changed.tipe_baris)) {
    changed.pergeseran = hitungJumlah(changed.vol_p, changed.harga_p)
  } else if (changedKids.length > 0) {
    changed.pergeseran = changedKids.reduce((s, c) => s + (c.pergeseran ?? 0), 0)
  }
  changed.bertambah_berkurang = changed.pergeseran - (changed.jumlah ?? 0)

  let current: PergeseranBarisInput | undefined = changed
  while (current?.parent_id) {
    const parent: PergeseranBarisInput | undefined = byId.get(current.parent_id)
    if (!parent) break
    const kids = childMap.get(parent.row_id) ?? []
    parent.pergeseran          = kids.reduce((s, c) => s + (c.pergeseran ?? 0), 0)
    parent.bertambah_berkurang = parent.pergeseran - (parent.jumlah ?? 0)
    current = parent
  }

  return data
}

// ─── GESER BARIS ─────────────────────────────────────────────────────────────

export type GeserDirection = 'up' | 'down'

export interface GeserResult<T> {
  ok:       boolean
  rows:     T[]
  blocked?: {
    target:   { uraian: string; tipe_baris: TipeBaris }
    neighbor: { uraian: string; tipe_baris: TipeBaris }
  }
}

export function geserBaris<T extends {
  row_id: string; parent_id: string | null; urutan: number;
  uraian: string; tipe_baris: TipeBaris
}>(rows: T[], rowId: string, direction: GeserDirection): GeserResult<T> {
  const idx = rows.findIndex(r => r.row_id === rowId)
  if (idx === -1) return { ok: false, rows }

  const current   = rows[idx]
  const targetIdx = direction === 'up' ? idx - 1 : idx + 1

  if (targetIdx < 0 || targetIdx >= rows.length)
    return { ok: true, rows }

  const neighbor = rows[targetIdx]

  if (neighbor.parent_id !== current.parent_id) {
    return {
      ok: false,
      rows,
      blocked: {
        target:   { uraian: current.uraian,  tipe_baris: current.tipe_baris },
        neighbor: { uraian: neighbor.uraian, tipe_baris: neighbor.tipe_baris },
      },
    }
  }

  const next      = [...rows]
  next[idx]       = { ...neighbor, urutan: idx }
  next[targetIdx] = { ...current,  urutan: targetIdx }

  return { ok: true, rows: next.map((r, i) => ({ ...r, urutan: i })) }
}

// ─── SENTINEL SWAP — block-aware geser (per docs/session/SESSION-NOTES-2026-05-22-sentinel-swap.md)
//
// Behavior: swap block (parent + descendants) sebagai 1 unit dgn sibling adjacent
// (yang punya parent_id sama). Skip row non-sibling di antaranya.
//
// selectedRowIds (Set<string>): rows yg ter-check di UI (sudah cascade auto-check
// parent + descendants). Block roots = selected rows yg parent_id-nya NOT in
// selectedRowIds. Validation: semua block roots harus sibling (parent_id sama).
//
// Single-row leaf geser tetap pakai geserBaris() existing — TIDAK lewat sini.
export function geserBlock<T extends {
  row_id: string; parent_id: string | null; urutan: number;
  uraian: string; tipe_baris: TipeBaris
}>(rows: T[], selectedRowIds: Set<string>, direction: GeserDirection): GeserResult<T> {
  if (selectedRowIds.size === 0) return { ok: false, rows }

  // Find "block roots" — selected rows yg parent_id NOT in selectedRowIds.
  // Validasi: semua block roots harus sibling (parent_id sama).
  const blockRoots: T[] = []
  for (const r of rows) {
    if (!selectedRowIds.has(r.row_id)) continue
    if (r.parent_id === null || !selectedRowIds.has(r.parent_id)) {
      blockRoots.push(r)
    }
  }
  if (blockRoots.length === 0) return { ok: false, rows }

  const parentIds = new Set(blockRoots.map(r => r.parent_id))
  if (parentIds.size > 1) {
    return {
      ok: false, rows,
      blocked: {
        target:   { uraian: blockRoots[0].uraian, tipe_baris: blockRoots[0].tipe_baris },
        neighbor: { uraian: 'Multi-pilih harus sibling (parent sama)', tipe_baris: blockRoots[0].tipe_baris },
      },
    }
  }
  const commonParent = blockRoots[0].parent_id

  // Find Block A array indices (must be contiguous in tree DFS order)
  const blockAIndices: number[] = []
  rows.forEach((r, i) => { if (selectedRowIds.has(r.row_id)) blockAIndices.push(i) })
  if (blockAIndices.length === 0) return { ok: false, rows }
  const blockAStart = blockAIndices[0]
  const blockAEnd   = blockAIndices[blockAIndices.length - 1]

  // Contiguity check: tidak boleh skip sibling
  if (blockAEnd - blockAStart + 1 !== blockAIndices.length) {
    return {
      ok: false, rows,
      blocked: {
        target:   { uraian: rows[blockAStart].uraian, tipe_baris: rows[blockAStart].tipe_baris },
        neighbor: { uraian: 'Pilih sibling adjacent (tidak boleh skip)', tipe_baris: rows[blockAStart].tipe_baris },
      },
    }
  }

  // Find Block B (sibling adjacent dgn parent_id sama, skip non-sibling)
  if (direction === 'up') {
    let siblingIdx = -1
    for (let i = blockAStart - 1; i >= 0; i--) {
      if (rows[i].parent_id === commonParent) { siblingIdx = i; break }
    }
    if (siblingIdx === -1) {
      return {
        ok: false, rows,
        blocked: {
          target:   { uraian: rows[blockAStart].uraian, tipe_baris: rows[blockAStart].tipe_baris },
          neighbor: { uraian: 'Sudah di paling atas dalam grup ini', tipe_baris: rows[blockAStart].tipe_baris },
        },
      }
    }
    // Block B = [siblingIdx .. blockAStart-1] (sibling + descendants contiguous)
    const before = rows.slice(0, siblingIdx)
    const blockB = rows.slice(siblingIdx, blockAStart)
    const blockA = rows.slice(blockAStart, blockAEnd + 1)
    const after  = rows.slice(blockAEnd + 1)
    const reordered = [...before, ...blockA, ...blockB, ...after]
    return { ok: true, rows: reordered.map((r, i) => ({ ...r, urutan: i })) }
  } else {
    // direction === 'down'
    let siblingIdx = -1
    for (let i = blockAEnd + 1; i < rows.length; i++) {
      if (rows[i].parent_id === commonParent) { siblingIdx = i; break }
    }
    if (siblingIdx === -1) {
      return {
        ok: false, rows,
        blocked: {
          target:   { uraian: rows[blockAStart].uraian, tipe_baris: rows[blockAStart].tipe_baris },
          neighbor: { uraian: 'Sudah di paling bawah dalam grup ini', tipe_baris: rows[blockAStart].tipe_baris },
        },
      }
    }
    // Block B end = akhir subtree sibling (scan descendant kontigu DFS).
    // Dulu scan "sampai sibling berikutnya" — saat sibling adalah anak terakhir,
    // pembatas tak ketemu → blockBEnd jatuh ke akhir array dan menelan subtree
    // cabang lain (urutan DFS rusak & tersimpan via kolom urutan).
    const blockBIds = new Set<string>([rows[siblingIdx].row_id])
    let blockBEnd = siblingIdx
    for (let i = siblingIdx + 1; i < rows.length; i++) {
      const pid = rows[i].parent_id
      if (pid && blockBIds.has(pid)) { blockBIds.add(rows[i].row_id); blockBEnd = i }
      else break
    }
    const before = rows.slice(0, blockAStart)
    const blockA = rows.slice(blockAStart, blockAEnd + 1)
    const blockB = rows.slice(siblingIdx, blockBEnd + 1)
    const after  = rows.slice(blockBEnd + 1)
    const reordered = [...before, ...blockB, ...blockA, ...after]
    return { ok: true, rows: reordered.map((r, i) => ({ ...r, urutan: i })) }
  }
}

// ─── INJECT — 16 LEVEL MATCHING ──────────────────────────────────────────────

const normKode   = (s: string | null | undefined) =>
  (s ?? '').replace(/[​-‍﻿]/g, '').trim()
const normUraian = (s: string | null | undefined) =>
  (s ?? '').toLowerCase().trim()
const wordsPrefix = (s: string, n: number) =>
  s.trim().toLowerCase().split(/\s+/).slice(0, n).join(' ')
const kodePrefix  = (k: string, n: number) =>
  k.split('.').slice(0, n).join('.')
// Strip suffix branching/role/depth biar fallback matching by-group lebih lentur:
//   KETUA-KELOMPOK-A / -B → KETUA-KELOMPOK
//   PLETON-LEADER / -MEMBER → PLETON
//   L7-HEAD / L7-SUB → L7   (chain refactor 2026-05-19)
//   L8-HEAD / L8-SUB → L8
const tipeGroup = (t: string) =>
  t.replace(/-[AB]$/, '')
   .replace(/-(LEADER|MEMBER)$/, '')
   .replace(/-(HEAD|SUB)$/, '')
const uraianNorm  = (s: string) =>
  s.toLowerCase().replace(/[^a-z\s]/g, '').replace(/\s+/g, ' ').trim()

function pushTo<K, V>(map: Map<K, V[]>, key: K, val: V) {
  if (!map.has(key)) map.set(key, [])
  map.get(key)!.push(val)
}

class FifoMatcher<V> {
  private counts = new Map<string, number>()
  next(map: Map<string, V[]>, key: string, used: Set<V>): V | null {
    const arr  = map.get(key) ?? []
    const base = this.counts.get(key) ?? 0
    for (let i = base; i < arr.length; i++) {
      if (!used.has(arr[i])) { this.counts.set(key, i + 1); return arr[i] }
    }
    return null
  }
}

// B5: tier fallback longgar (uraian 1 kata / prefix kode 2 segmen / posisi
// absolut) bisa salah tempel vol_p/harga_p secara diam-diam — laporkan ke
// caller supaya user bisa periksa baris hasil match heuristik.
export interface InjectLowConfidence {
  kode_rekening: string
  uraian:        string
  tier:          'uraian-1-kata' | 'kode-prefix-2' | 'posisi-absolut'
}

export interface InjectResult {
  rows:          PergeseranBarisInput[]
  lowConfidence: InjectLowConfidence[]
}

export function injectDpaKePergeseran(
  pergeseranRows: PergeseranBarisInput[],
  dpaRows:        DpaBarisInput[]
): InjectResult {
  const byRowId           = new Map<string, PergeseranBarisInput>()
  const byTipeKode        = new Map<string, PergeseranBarisInput[]>()
  const byTipeUraian      = new Map<string, PergeseranBarisInput[]>()
  const byTipeSaja        = new Map<string, PergeseranBarisInput[]>()
  const byKodeSaja        = new Map<string, PergeseranBarisInput[]>()
  const byUraianSaja      = new Map<string, PergeseranBarisInput[]>()
  const byGrupKode        = new Map<string, PergeseranBarisInput[]>()
  const byGrupUraian      = new Map<string, PergeseranBarisInput[]>()
  const byKodePrefix4     = new Map<string, PergeseranBarisInput[]>()
  const byTipeUraian3w    = new Map<string, PergeseranBarisInput[]>()
  const byKodePrefix3     = new Map<string, PergeseranBarisInput[]>()
  const byGrupUraian3w    = new Map<string, PergeseranBarisInput[]>()
  const byUraianNormMap   = new Map<string, PergeseranBarisInput[]>()
  const byTipeUraian1w    = new Map<string, PergeseranBarisInput[]>()
  const byTipeKodePrefix2 = new Map<string, PergeseranBarisInput[]>()
  const byPosisiAbsolut: PergeseranBarisInput[] = []

  for (const p of pergeseranRows) {
    const kode   = normKode(p.kode_rekening)
    const uraian = normUraian(p.uraian)
    const tipe   = p.tipe_baris
    const grup   = tipeGroup(tipe)

    if (p.row_id) byRowId.set(p.row_id, p)

    if (kode) {
      pushTo(byTipeKode,        `${tipe}||${kode}`,  p)
      pushTo(byKodeSaja,        kode,                 p)
      pushTo(byGrupKode,        `${grup}||${kode}`,  p)
      const kp4 = kodePrefix(kode, 4); if (kp4) pushTo(byKodePrefix4,     kp4, p)
      const kp3 = kodePrefix(kode, 3); if (kp3) pushTo(byKodePrefix3,     kp3, p)
      const kp2 = kodePrefix(kode, 2); if (kp2) pushTo(byTipeKodePrefix2, `${tipe}||${kp2}`, p)
    } else {
      pushTo(byTipeUraian,   `${tipe}||${uraian}`,                 p)
      pushTo(byGrupUraian,   `${grup}||${uraian}`,                 p)
      pushTo(byGrupUraian3w, `${grup}||${wordsPrefix(uraian, 3)}`, p)
    }

    pushTo(byTipeSaja,      tipe,                                  p)
    pushTo(byUraianSaja,    uraian,                                p)
    pushTo(byTipeUraian3w,  `${tipe}||${wordsPrefix(uraian, 3)}`, p)
    pushTo(byTipeUraian1w,  `${tipe}||${wordsPrefix(uraian, 1)}`, p)
    pushTo(byUraianNormMap, uraianNorm(uraian),                    p)
    byPosisiAbsolut.push(p)
  }

  const matched = new Set<PergeseranBarisInput>()
  const fifo    = new FifoMatcher<PergeseranBarisInput>()
  const absUsed = { idx: 0 }
  const finalOrder: PergeseranBarisInput[] = []
  const lowConfidence: InjectLowConfidence[] = []

  for (const dpa of dpaRows) {
    const kode   = normKode(dpa.kode_rekening)
    const uraian = normUraian(dpa.uraian)
    const tipe   = dpa.tipe_baris
    const grup   = tipeGroup(tipe)
    const u3w    = wordsPrefix(uraian, 3)
    const u1w    = wordsPrefix(uraian, 1)
    const unorm  = uraianNorm(uraian)
    const kp4    = kodePrefix(kode, 4)
    const kp3    = kodePrefix(kode, 3)
    const kp2    = kodePrefix(kode, 2)

    let found: PergeseranBarisInput | null = null
    let lowTier: InjectLowConfidence['tier'] | null = null

    if (!found && dpa.row_id)            found = byRowId.get(dpa.row_id) ?? null
    if (!found && kode)                  found = fifo.next(byTipeKode,        `${tipe}||${kode}`,  matched)
    if (!found && !kode)                 found = fifo.next(byTipeUraian,      `${tipe}||${uraian}`, matched)
    if (!found && !kode)                 found = fifo.next(byTipeSaja,        tipe,                matched)
    if (!found && kode)                  found = fifo.next(byKodeSaja,        kode,                matched)
    if (!found && !kode && uraian)       found = fifo.next(byUraianSaja,      uraian,              matched)
    if (!found && kode)                  found = fifo.next(byGrupKode,        `${grup}||${kode}`,  matched)
    if (!found && !kode && uraian)       found = fifo.next(byGrupUraian,      `${grup}||${uraian}`, matched)
    if (!found && kode && kp4)           found = fifo.next(byKodePrefix4,     kp4,                 matched)
    if (!found && u3w)                   found = fifo.next(byTipeUraian3w,    `${tipe}||${u3w}`,   matched)
    if (!found && kode && kp3)           found = fifo.next(byKodePrefix3,     kp3,                 matched)
    if (!found && u3w)                   found = fifo.next(byGrupUraian3w,    `${grup}||${u3w}`,   matched)
    if (!found && unorm)                 found = fifo.next(byUraianNormMap,   unorm,               matched)
    if (!found && u1w)                 { found = fifo.next(byTipeUraian1w,    `${tipe}||${u1w}`,   matched); if (found) lowTier = 'uraian-1-kata' }
    if (!found && kode && kp2)         { found = fifo.next(byTipeKodePrefix2, `${tipe}||${kp2}`,   matched); if (found) lowTier = 'kode-prefix-2' }
    if (!found) {
      for (let i = absUsed.idx; i < byPosisiAbsolut.length; i++) {
        const c = byPosisiAbsolut[i]
        if (!matched.has(c)) {
          const ct = c.tipe_baris
          if (ct === tipe || tipeGroup(ct) === grup) {
            absUsed.idx = i + 1; found = c; lowTier = 'posisi-absolut'; break
          }
        }
      }
    }

    if (found) {
      matched.add(found)
      if (lowTier) lowConfidence.push({ kode_rekening: dpa.kode_rekening, uraian: dpa.uraian, tier: lowTier })
      finalOrder.push({
        ...found,
        kode_rekening: dpa.kode_rekening,
        uraian:        dpa.uraian,
        vol:           dpa.vol,
        satuan:        dpa.satuan,
        harga:         dpa.harga,
        jumlah:        dpa.jumlah,
      })
    } else {
      finalOrder.push({
        kode_rekening:       dpa.kode_rekening,
        uraian:              dpa.uraian,
        vol:                 dpa.vol,
        satuan:              dpa.satuan,
        harga:               dpa.harga,
        jumlah:              dpa.jumlah,
        vol_p:               null,
        harga_p:             null,
        pergeseran:          0,
        bertambah_berkurang: 0,
        tipe_baris:          dpa.tipe_baris,
        row_id:              dpa.row_id ?? '',
        parent_id:           dpa.parent_id,
        urutan:              dpa.urutan,
      })
    }
  }

  for (const p of pergeseranRows) {
    if (!matched.has(p)) finalOrder.push(p)
  }

  // Sort DFS by parent_id graph supaya `pgnew_*` rows tidak terlempar ke akhir
  // tapi dekat parent-nya. Pakai pergeseranRows asli sebagai sibling order hint
  // supaya urutan saudara di Pergeseran lokal di-preserve.
  const siblingHint = new Map<string, number>()
  pergeseranRows.forEach((r, i) => { if (r.row_id) siblingHint.set(r.row_id, i) })
  const sorted = sortTreeDFS(finalOrder, siblingHint)
  return {
    rows: recalcPergeseranJumlah(sorted.map((r, i) => ({ ...r, urutan: i }))),
    lowConfidence,
  }
}

/**
 * Sort baris berdasarkan DFS dari root: tiap baris muncul tepat setelah
 * subtree parent-nya. Roots ditentukan oleh parent_id == null (atau parent_id
 * yang tidak ditemukan di list).
 *
 * `siblingHint` (opsional): map row_id → index untuk preserve urutan saudara
 * dari list referensi (mis. pergeseranRows asli). Row yang tidak ada di hint
 * dianggap "baru" dan diletakkan setelah saudara yang punya hint.
 */
function sortTreeDFS<T extends { row_id: string; parent_id: string | null }>(
  rows: T[],
  siblingHint?: Map<string, number>,
): T[] {
  const childrenOf = new Map<string | null, T[]>()
  const ids        = new Set(rows.map(r => r.row_id))
  for (const r of rows) {
    const p = r.parent_id && ids.has(r.parent_id) ? r.parent_id : null
    if (!childrenOf.has(p)) childrenOf.set(p, [])
    childrenOf.get(p)!.push(r)
  }

  if (siblingHint) {
    const HINT_MAX = Number.MAX_SAFE_INTEGER
    for (const [, kids] of childrenOf) {
      // Stable sort: yang ada di hint → urutan hint; yang baru → setelah, urut input
      kids.sort((a, b) => {
        const ai = siblingHint.get(a.row_id) ?? HINT_MAX
        const bi = siblingHint.get(b.row_id) ?? HINT_MAX
        return ai - bi
      })
    }
  }

  const result: T[] = []
  const visit = (parentKey: string | null) => {
    for (const child of childrenOf.get(parentKey) ?? []) {
      result.push(child)
      visit(child.row_id)
    }
  }
  visit(null)
  return result
}

// ─── VALIDATE ────────────────────────────────────────────────────────────────

export function validateParentRefs(rows: AnyBaris[]): string[] {
  const ids = new Set(rows.map(r => r.row_id))
  const errors: string[] = []
  for (const r of rows) {
    if (r.parent_id && !ids.has(r.parent_id)) {
      errors.push(`Baris "${r.uraian}" (${r.tipe_baris}) punya parent_id "${r.parent_id}" tidak ditemukan`)
    }
  }
  return errors
}

/**
 * Validasi integritas pohon untuk payload save (audit DPA 2026-06-11 B-1):
 * parent ref valid + row_id unik + bebas siklus. Siklus dideteksi via BFS dari
 * root — node yang tak terjangkau pasti bagian rantai melingkar (sortTreeDFS
 * akan men-drop-nya diam-diam, dan agregasi jadi tak akurat).
 */
export function validateTreeIntegrity(rows: AnyBaris[]): string[] {
  const errors = validateParentRefs(rows)

  const seen = new Set<string>()
  for (const r of rows) {
    if (!r.row_id) { errors.push(`Baris "${r.uraian}" tanpa row_id`); continue }
    if (seen.has(r.row_id)) errors.push(`row_id duplikat "${r.row_id}" (baris "${r.uraian}")`)
    seen.add(r.row_id)
  }

  // Sentinel Guard lapis 3 (CONCEPT-import-usulan-dpa §5): hard-dup jejak
  // usulan tidak boleh tersimpan — 1 item usulan = maks 1 baris per versi
  const seenUsulan = new Set<number>()
  for (const r of rows) {
    const uid = (r as { usulan_item_id?: number | null }).usulan_item_id
    if (uid == null) continue
    if (seenUsulan.has(uid)) errors.push(`Item usulan #${uid} diimport lebih dari sekali ("${r.uraian}")`)
    seenUsulan.add(uid)
  }

  const childMap = buildChildMap(rows)
  const reachable = new Set<string>()
  const queue = rows.filter(r => !r.parent_id || !seen.has(r.parent_id)).map(r => r.row_id)
  while (queue.length) {
    const id = queue.shift()!
    if (reachable.has(id)) continue
    reachable.add(id)
    for (const c of childMap.get(id) ?? []) queue.push(c.row_id)
  }
  if (reachable.size < seen.size) {
    const stuck = rows.find(r => !reachable.has(r.row_id))
    errors.push(`Struktur parent melingkar terdeteksi (mis. baris "${stuck?.uraian ?? '?'}")`)
  }

  return errors
}

// ─── VALIDATE CHAIN RULE ─────────────────────────────────────────────────────
// Cek struktur lama (branching A/B atau MASTER multi-option) yang sekarang
// invalid di chain rule. Return list issues — tidak auto-fix, hanya report.
// Dipakai untuk audit data lama sebelum migration produksi.

/** Chain rule: parent tipe → 1 anak tipe sah. */
const CHAIN_CHILD_OF: Partial<Record<TipeBaris, TipeBaris>> = {
  GRANDMASTER:          'MASTER',
  MASTER:               'CHILD',
  CHILD:                'LEADER',
  LEADER:               'MEMBER',
  MEMBER:               'PLETON-LEADER',
  'PLETON-LEADER':      'PLETON-MEMBER',
  'PLETON-MEMBER':      'KETUA-KELOMPOK-A',
  'KETUA-KELOMPOK-A':   'ANGGOTA-KELOMPOK-A',
  'ANGGOTA-KELOMPOK-A': 'KETUA-KELOMPOK-B',
  'KETUA-KELOMPOK-B':   'ANGGOTA-KELOMPOK-B',
  'ANGGOTA-KELOMPOK-B': 'L7-HEAD',
  'L7-HEAD':            'L7-SUB',
  'L7-SUB':             'L8-HEAD',
  'L8-HEAD':            'L8-SUB',
  // 'L8-SUB' → leaf max (no child)
}

export interface ChainViolation {
  row_id:        string
  uraian:        string
  parent_tipe:   TipeBaris
  child_tipe:    TipeBaris
  expected:      TipeBaris | 'NONE'
  reason:        string
}

/**
 * Audit data DPA / Pergeseran: cek apakah parent→child relationship
 * mematuhi chain rule. Return list pelanggaran (kosong = bersih).
 *
 * Dipakai sebagai pre-flight check sebelum apply migration produksi
 * atau saat impor DPA lama dari versi pre-chain.
 */
export function validateChainRule(rows: AnyBaris[]): ChainViolation[] {
  const byId = new Map<string, AnyBaris>()
  rows.forEach(r => byId.set(r.row_id, r))

  const violations: ChainViolation[] = []
  for (const r of rows) {
    if (!r.parent_id) continue
    const parent = byId.get(r.parent_id)
    if (!parent) continue
    const expected = CHAIN_CHILD_OF[parent.tipe_baris]
    if (!expected) {
      violations.push({
        row_id:      r.row_id,
        uraian:      r.uraian,
        parent_tipe: parent.tipe_baris,
        child_tipe:  r.tipe_baris,
        expected:    'NONE',
        reason:      `Parent ${parent.tipe_baris} adalah leaf maksimum, tidak boleh punya anak`,
      })
      continue
    }
    if (r.tipe_baris !== expected) {
      violations.push({
        row_id:      r.row_id,
        uraian:      r.uraian,
        parent_tipe: parent.tipe_baris,
        child_tipe:  r.tipe_baris,
        expected,
        reason:      `Chain rule: parent ${parent.tipe_baris} hanya boleh punya anak ${expected}`,
      })
    }
  }
  return violations
}
