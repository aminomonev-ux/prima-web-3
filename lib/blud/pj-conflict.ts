// lib/blud/pj-conflict.ts
// "Sentinel PJ" — detector konflik Penanggung Jawab di rantai vertikal DPA BLUD.
//
// Rule: dalam 1 rantai (ancestor → row → descendant), hanya boleh ada 1 PJ.
// Kalau ada 2 PJ segaris vertikal → rekap double-count.
// Sibling beda cabang (tidak segaris vertikal) → BOLEH ber-PJ berbeda.
//
// Dipakai 3 layer:
//   1. Client (dpa-client.tsx)         — pre-emptive warning saat user assign PJ
//   2. Server (POST /api/blud/dpa)     — validation reject save kalau ada konflik
//   3. Audit  (audit-pj.ts)            — post-facto report di Cetak BLUD
//
// L1: getAncestors port dari audit-pj.ts (iteratif anti-stack-overflow)

export interface PjRowLike {
  row_id:            string
  parent_id:         string | null
  uraian:            string
  kode_rekening:     string
  penanggung_jawab?: string | null
  /** Optional — kalau ada, dipakai di belum-entry rule (jumlah>0) + AuditDoubleEntry. */
  jumlah?:           number | null
  /** Optional — dipakai di AuditBelumEntry shape (tipe row). */
  tipe_baris?:       string | null
}

export interface PjConflictRow {
  row_id:        string
  kode_rekening: string
  uraian:        string
  pj:            string
  relasi:        'ancestor' | 'descendant'
  /** Optional — populated kalau row punya jumlah (untuk AuditDoubleEntry shape). */
  jumlah?:       number
}

export interface PjConflictResult {
  hasConflict: boolean
  ancestors:   PjConflictRow[]
  descendants: PjConflictRow[]
}

export interface PjGlobalConflict {
  row:        PjConflictRow
  conflict:   PjConflictRow
}

// ─── Unified findings (Opsi B — single source of truth) ─────────────────────
// Sentinel pakai filter kind='chain-conflict', Audit Rekap pakai semua kind.

export interface PjChainConflictFinding {
  kind:     'chain-conflict'
  /** Descendant row (yang punya PJ + ancestor juga punya PJ). */
  row:      PjConflictRow
  /** Ancestor yang juga ber-PJ — penyebab double-count. */
  conflict: PjConflictRow
}

export interface PjBelumEntryFinding {
  kind:      'belum-entry'
  row_id:    string
  kode:      string
  uraian:    string
  jumlah:    number
  tipe:      string
  /** PJ field di DPA (kalau ada — hint utk admin). */
  pjDiDPA:   string
  punyaAnak: boolean
}

export type PjFinding = PjChainConflictFinding | PjBelumEntryFinding

// ──────────────────────────────────────────────────────────────────────────
// Index builders (sekali bangun, reuse multi-query)
// Exported untuk shared use dgn Sentinel Swap (lib/blud/recalc.ts geserBlock).
// Generic <T extends PjRowLike> tapi cocok juga untuk rows tanpa penanggung_jawab.
// ──────────────────────────────────────────────────────────────────────────

export function buildNodeMap<T extends PjRowLike>(rows: T[]): Map<string, T> {
  const m = new Map<string, T>()
  for (const r of rows) {
    if (r.row_id) m.set(r.row_id, r)
  }
  return m
}

export function buildChildMap<T extends PjRowLike>(rows: T[]): Map<string, T[]> {
  const m = new Map<string, T[]>()
  for (const r of rows) {
    if (r.parent_id) {
      if (!m.has(r.parent_id)) m.set(r.parent_id, [])
      m.get(r.parent_id)!.push(r)
    }
  }
  return m
}

// ──────────────────────────────────────────────────────────────────────────
// Traversal
// ──────────────────────────────────────────────────────────────────────────

/** Iteratif (anti-stack-overflow utk hierarki dalam). Tidak include row itu sendiri. */
export function getAncestors<T extends PjRowLike>(rowId: string, nodeMap: Map<string, T>): T[] {
  const out: T[] = []
  const visited = new Set<string>([rowId])
  let cur = nodeMap.get(rowId)
  while (cur?.parent_id && !visited.has(cur.parent_id)) {
    const parent = nodeMap.get(cur.parent_id)
    if (!parent) break
    visited.add(parent.row_id)
    out.push(parent)
    cur = parent
  }
  return out
}

/** BFS ke bawah. Tidak include row itu sendiri. */
export function getDescendants<T extends PjRowLike>(rowId: string, childMap: Map<string, T[]>): T[] {
  const out: T[] = []
  const queue: string[] = [rowId]
  const visited = new Set<string>([rowId])
  while (queue.length) {
    const cur = queue.shift()!
    const children = childMap.get(cur) ?? []
    for (const c of children) {
      if (visited.has(c.row_id)) continue
      visited.add(c.row_id)
      out.push(c)
      queue.push(c.row_id)
    }
  }
  return out
}

function hasPj(r: PjRowLike): boolean {
  const v = (r.penanggung_jawab ?? '').trim()
  return v.length > 0 && v !== '-'
}

function toConflictRow(r: PjRowLike, relasi: 'ancestor' | 'descendant'): PjConflictRow {
  const j = r.jumlah == null ? undefined : Number(r.jumlah) || 0
  return {
    row_id:        r.row_id,
    kode_rekening: r.kode_rekening,
    uraian:        r.uraian,
    pj:            (r.penanggung_jawab ?? '').trim(),
    relasi,
    ...(j !== undefined ? { jumlah: j } : {}),
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────────────────────────────────

/**
 * Detect konflik saat user mau assign PJ ke `targetRowId`.
 * Scan ancestor & descendant — return semua row yg sudah ber-PJ.
 * Row `targetRowId` sendiri DIKECUALIKAN (self-check skip, sesuai keputusan #2).
 *
 * Catatan: tidak peduli identitas PJ (sama/beda orang sama-sama konflik).
 */
export function detectPjConflict<T extends PjRowLike>(
  rows: T[],
  targetRowId: string,
): PjConflictResult {
  const nodeMap  = buildNodeMap(rows)
  const childMap = buildChildMap(rows)
  if (!nodeMap.has(targetRowId)) {
    return { hasConflict: false, ancestors: [], descendants: [] }
  }
  const ancestors   = getAncestors(targetRowId, nodeMap).filter(hasPj).map(r => toConflictRow(r, 'ancestor'))
  const descendants = getDescendants(targetRowId, childMap).filter(hasPj).map(r => toConflictRow(r, 'descendant'))
  return {
    hasConflict: ancestors.length > 0 || descendants.length > 0,
    ancestors,
    descendants,
  }
}

/**
 * Cek struktural-mutation: user mau tambah child ke `parentRowId`.
 * Kalau parent (atau ancestor parent) sudah ber-PJ → warning, krn child baru
 * akan masuk subtree row ber-PJ → potensi konflik kalau user nanti isi PJ
 * di child / descendant child.
 *
 * Behavior sesuai keputusan user #3: tampilkan warning "Uraian X sudah ber-PJ Y,
 * tetap atau hapus?". Yes tetap (PJ X stay), No clear (PJ X cleared).
 *
 * Return: list ancestor (incl. parent itu sendiri) yang sudah ber-PJ.
 * Empty array = no warning needed.
 */
export function findAncestorPjOnAdd<T extends PjRowLike>(
  rows: T[],
  parentRowId: string | null,
): PjConflictRow[] {
  if (!parentRowId) return []
  const nodeMap = buildNodeMap(rows)
  const parent  = nodeMap.get(parentRowId)
  if (!parent) return []
  const chain = [parent, ...getAncestors(parentRowId, nodeMap)]
  return chain.filter(hasPj).map(r => toConflictRow(r, 'ancestor'))
}

/**
 * Server-side full scan: validasi seluruh dataset DPA sebelum save.
 * Return list pasangan (row, ancestor) yang konflik. Empty = aman.
 *
 * Dipakai di POST /api/blud/dpa sebagai defense layer terakhir.
 * Implementasi: wrapper tipis di atas `validatePjRules()` — filter chain-conflict
 * saja, biar Sentinel tidak ke-trigger belum-entry warning.
 */
export function validateAllPj<T extends PjRowLike>(rows: T[]): PjGlobalConflict[] {
  return validatePjRules(rows)
    .filter((f): f is PjChainConflictFinding => f.kind === 'chain-conflict')
    .map(f => ({ row: f.row, conflict: f.conflict }))
}

/**
 * Unified validator (Opsi B — single source of truth).
 *
 * Return semua jenis pelanggaran rule PJ:
 *   - `chain-conflict`: row + ancestor sama-sama ber-PJ → double-count saat rekap
 *   - `belum-entry`: leaf row dgn jumlah>0 yang TIDAK masuk rekap (row sendiri
 *     tidak ber-PJ DAN tidak ada ancestor-nya yang ber-PJ) → terlewat di-rekap
 *
 * Konsumen:
 *   - Sentinel (`use-sentinel-pj-guard.ts`, `route.ts`) pakai via `validateAllPj()`
 *     wrapper (chain-conflict only — belum-entry tidak block save)
 *   - Audit Rekap (`audit-pj.ts`) pakai semua kind, map ke `AuditDoubleEntry`
 *     + `AuditBelumEntry` shape, lalu tambah stats (selisih / totalPJ) sendiri
 *
 * Catatan: belum-entry rule require `jumlah` + `kode_rekening` (skip kode non-digit).
 * Kalau caller passing rows tanpa `jumlah` (Sentinel-only use case), belum-entry
 * findings akan kosong (semua row di-skip karena `jumlah ?? 0 <= 0`).
 */
export function validatePjRules<T extends PjRowLike>(rows: T[]): PjFinding[] {
  const nodeMap  = buildNodeMap(rows)
  const childMap = buildChildMap(rows)
  const findings: PjFinding[] = []

  // ── Pass 1: chain-conflict (ancestor + row sama-sama ber-PJ) ──
  const rowsWithPj = rows.filter(hasPj)
  const rekapRowIds = new Set(rowsWithPj.map(r => r.row_id))
  const seenPair = new Set<string>()
  for (const r of rowsWithPj) {
    const ancestors = getAncestors(r.row_id, nodeMap).filter(hasPj)
    for (const a of ancestors) {
      const key = [r.row_id, a.row_id].sort().join('|')
      if (seenPair.has(key)) continue
      seenPair.add(key)
      findings.push({
        kind:     'chain-conflict',
        row:      toConflictRow(r, 'descendant'),
        conflict: toConflictRow(a, 'ancestor'),
      })
    }
  }

  // ── Pass 2: belum-entry (leaf dgn jumlah>0, tidak di-rekap, ancestor pun tidak) ──
  for (const node of rows) {
    const jumlah = Number(node.jumlah ?? 0) || 0
    if (jumlah <= 0) continue
    const kode = (node.kode_rekening ?? '').trim()
    if (!/^\d/.test(kode)) continue                       // skip header non-rekening
    if (rekapRowIds.has(node.row_id)) continue            // sudah masuk rekap sendiri
    const ancestors = getAncestors(node.row_id, nodeMap)
    if (ancestors.some(a => rekapRowIds.has(a.row_id))) continue  // ancestor cover
    findings.push({
      kind:      'belum-entry',
      row_id:    node.row_id,
      kode,
      uraian:    (node.uraian ?? '').trim(),
      jumlah,
      tipe:      (node.tipe_baris ?? '').toUpperCase(),
      pjDiDPA:   (node.penanggung_jawab ?? '').trim(),
      punyaAnak: (childMap.get(node.row_id)?.length ?? 0) > 0,
    })
  }

  return findings
}
