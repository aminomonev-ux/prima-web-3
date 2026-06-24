// lib/blud/dup-guard.ts — Sentinel Guard: deteksi entri ganda di form DPA.
// Ref: docs/session/blud/CONCEPT-import-usulan-dpa.md §5 (lapis 2).
// Pure validator (pola pj-conflict.ts) — jalan tiap render, warning only.
//
//   HARD      : ≥2 baris dgn usulan_item_id sama → pasti dobel import.
//   HEURISTIK : ≥2 baris LEAF dgn uraian ternormalisasi + satuan + harga sama
//               → kemungkinan dobel (manual-vs-import / manual-vs-manual).
//               Bisa false-positive (item kembar legitimate) → tidak blokir Simpan.

// Generic <T extends DupRowLike> (F1 RIMA): dipakai juga rule registry sentinel
// (lib/sentinel/rules/) atas PergeseranBarisInput — tanpa cast, tanpa ubah perilaku.
export interface DupRowLike {
  row_id:          string
  parent_id:       string | null
  uraian:          string
  kode_rekening:   string
  satuan?:         string | null
  harga?:          number | null
  usulan_item_id?: number | null
}

export interface DupRowRef {
  row_id:        string
  uraian:        string
  kode_rekening: string
}

export interface DupFinding {
  kind:   'hard' | 'heuristic'
  a:      DupRowRef
  b:      DupRowRef
  reason: string
}

const ref = (r: DupRowLike): DupRowRef => ({
  row_id: r.row_id, uraian: r.uraian, kode_rekening: r.kode_rekening,
})

export const normUraian = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim()

export function validateDupRules<T extends DupRowLike>(rows: readonly T[]): DupFinding[] {
  const findings: DupFinding[] = []

  // ── HARD: usulan_item_id kembar ──
  const byUsulanId = new Map<number, T[]>()
  for (const r of rows) {
    if (r.usulan_item_id == null) continue
    if (!byUsulanId.has(r.usulan_item_id)) byUsulanId.set(r.usulan_item_id, [])
    byUsulanId.get(r.usulan_item_id)!.push(r)
  }
  const hardIds = new Set<string>()
  for (const [usulanId, group] of byUsulanId) {
    for (let i = 1; i < group.length; i++) {
      findings.push({
        kind: 'hard', a: ref(group[0]), b: ref(group[i]),
        reason: `Item usulan #${usulanId} diimport ${group.length}×`,
      })
      hardIds.add(group[0].row_id); hardIds.add(group[i].row_id)
    }
  }

  // ── HEURISTIK: leaf kembar (uraian+satuan+harga) ──
  const hasChild = new Set<string>()
  for (const r of rows) if (r.parent_id) hasChild.add(r.parent_id)

  const byKey = new Map<string, T[]>()
  for (const r of rows) {
    if (hasChild.has(r.row_id)) continue              // aggregator skip
    if (hardIds.has(r.row_id)) continue               // sudah ketangkep hard
    const u = normUraian(r.uraian)
    if (!u || r.harga == null) continue               // baris kosong/belum diisi skip
    const key = `${u}||${(r.satuan ?? '').toLowerCase().trim()}||${r.harga}`
    if (!byKey.has(key)) byKey.set(key, [])
    byKey.get(key)!.push(r)
  }
  for (const group of byKey.values()) {
    for (let i = 1; i < group.length; i++) {
      findings.push({
        kind: 'heuristic', a: ref(group[0]), b: ref(group[i]),
        reason: 'Uraian + satuan + harga identik',
      })
    }
  }

  return findings
}
