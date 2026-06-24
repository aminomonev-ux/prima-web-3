// lib/sentinel/types.ts — kontrak Rule Registry RIMA (F1 Bot Pengawas).
// Ref: docs/session/sentinel/CONCEPT-sentinel-bot.md §2.
// G16: rule = pure function atas snapshot rows (readonly) — tanpa callback mutasi.

export type SentinelSeverity = 'info' | 'warning' | 'critical'

export interface SentinelTarget {
  rowId: string
  label: string
}

export interface SentinelFinding {
  ruleId:   string
  severity: SentinelSeverity
  /** Kalimat bot siap tampil (template per rule). */
  message:  string
  /** Baris terkait — tombol [Lihat] lompat bergiliran antar target. */
  targets:  SentinelTarget[]
  /** Ada = boleh di-Abaikan (info/warning). Critical TIDAK punya dismissKey. */
  dismissKey?: string
}

/**
 * Bentuk minimal baris yang dipahami rules — `DpaBarisInput` dan
 * `PergeseranBarisInput` memenuhinya secara struktural tanpa cast.
 */
export interface SentinelRow {
  row_id:            string
  parent_id:         string | null
  uraian:            string
  kode_rekening:     string
  vol?:              number | null
  satuan?:           string | null
  harga?:            number | null
  jumlah?:           number
  urutan?:           number
  tipe_baris?:       string
  penanggung_jawab?: string | null
  usulan_item_id?:   number | null
}

export type SentinelScope = 'blud/dpa' | 'blud/pergeseran'

export interface SentinelCtx {
  scope: SentinelScope
}

export interface SentinelRule {
  id:    string
  scope: SentinelScope[]
  evaluate(rows: readonly SentinelRow[], ctx: SentinelCtx): SentinelFinding[]
}

/** Feed halaman host → bot. Readonly by construction (G16): tanpa setter form. */
export interface SentinelFeed {
  scope: SentinelScope
  rows:  readonly SentinelRow[]
  /** Prefix id DOM baris untuk jumpToRow — 'dpa-row-' / 'perg-row-'. */
  rowDomIdPrefix: string
}

/** Jejak "user sudah diperingatkan" — ikut body Simpan existing → audit BLUD_SENTINEL_ACK (G8). */
export interface SentinelAckPayload {
  dismissed:      { rule: string; label: string }[]
  active_warning: number
}
