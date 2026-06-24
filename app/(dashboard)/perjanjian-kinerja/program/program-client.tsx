'use client'
// app/(dashboard)/perjanjian-kinerja/program/program-client.tsx
// Master Program — hierarki Program → Kegiatan → Sub-kegiatan dengan auto level derive.
// Bulk save pattern sama dengan sasaran-client (replace-all per tahun).

import { useState, useCallback } from 'react'
import { Plus, Save, RefreshCw, AlertCircle, CheckCircle2, Download, X } from 'lucide-react'
import DeleteIcon from '@/components/ui/DeleteIcon'
import { fetchJson } from '@/lib/shared/api'
import { useAbortableEffect } from '@/lib/shared/hooks'
import { TableSkeleton } from '@/components/ui/table-skeleton'
import PrimaButton from '@/components/ui/PrimaButton'
import { pkInputTable as inputStyle, pkCheckbox as checkboxStyle, pkModalBackdrop as modalBackdrop, pkMono as mono } from '@/lib/shared/pk-styles'
import { usePkYear } from '../_context/PkYearContext'
import type { PkProgramRow, PkLevel } from '../_utils/pk-types'

type ApiListResp = { ok: boolean; tahun: string; rows: PkProgramRow[]; message?: string }

type ImportRow = { program: string; kegiatan: string | null; subkegiatan: string | null; level: PkLevel }
type ImportStats = { program: number; kegiatan: number; subkegiatan: number; source_ra: number }
type ApiImportResp = { ok: boolean; tahun: string; rows: ImportRow[]; stats: ImportStats; message?: string }

/** Stable key tuple program|kegiatan|subkegiatan untuk dedup Merge. */
function rowKey(r: { program: string; kegiatan?: string | null; subkegiatan?: string | null }): string {
  return `${r.program.trim()}||${(r.kegiatan ?? '').trim()}||${(r.subkegiatan ?? '').trim()}`
}

/** Derive level dari isi 3 field hierarki. */
function deriveLevel(r: Pick<PkProgramRow, 'program' | 'kegiatan' | 'subkegiatan'>): PkLevel {
  if (r.subkegiatan?.trim()) return 'subkegiatan'
  if (r.kegiatan?.trim()) return 'kegiatan'
  return 'program'
}

function emptyRow(intent?: PkLevel): PkProgramRow {
  return { program: '', kegiatan: null, subkegiatan: null, level: intent ?? 'program', _dirty: true, _intent: intent }
}

/** Cell terkunci kalau kolom > intent (program-only lock kegiatan+subkeg; kegiatan lock subkeg). */
function isCellLocked(intent: PkLevel | undefined, col: 'program' | 'kegiatan' | 'subkegiatan'): boolean {
  if (!intent) return false
  if (col === 'program') return false
  if (col === 'kegiatan') return intent === 'program'
  return intent !== 'subkegiatan'
}

const LEVEL_LABEL: Record<PkLevel, { txt: string; color: string }> = {
  program:     { txt: 'PROGRAM',  color: '#3B82F6' },
  kegiatan:    { txt: 'KEGIATAN', color: '#10B981' },
  subkegiatan: { txt: 'SUB-KEG',  color: '#EF9F27' },
}

export default function ProgramClient() {
  const { tahun } = usePkYear()
  const [rows, setRows] = useState<PkProgramRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [importBusy, setImportBusy] = useState(false)
  const [importModal, setImportModal] = useState<{ rows: ImportRow[]; stats: ImportStats } | null>(null)
  const [levelPickerOpen, setLevelPickerOpen] = useState(false)
  /** Modal konfirmasi delete — 3 mode: single (1 row idx), bulk (semua _selected), wipe (rows habis saat Save). */
  const [confirmDel, setConfirmDel] = useState<{ mode: 'single'; idx: number; preview: string } | { mode: 'bulk'; count: number } | { mode: 'wipe'; count: number } | null>(null)

  function showToast(kind: 'ok' | 'err', msg: string) {
    setToast({ kind, msg })
    window.setTimeout(() => setToast(null), 3500)
  }

  useAbortableEffect(async (signal) => {
    setLoading(true)
    const d = await fetchJson<unknown>(`/api/perjanjian-kinerja/program?tahun=${tahun}`, { signal })
    if (signal.aborted) return
    if (d.ok) {
      const resp = d as unknown as ApiListResp
      setRows((resp.rows ?? []).map(r => ({ ...r, _dirty: false, _selected: false })))
    } else {
      showToast('err', d.message)
      setRows([])
    }
    setLoading(false)
  }, [tahun, reloadKey])

  const updateCell = useCallback((idx: number, key: 'program' | 'kegiatan' | 'subkegiatan', val: string) => {
    setRows(prev => prev.map((r, i) => {
      if (i !== idx) return r
      // Defense: ignore writes ke cell yang seharusnya locked (UI sudah disable, ini fallback)
      if (isCellLocked(r._intent, key)) return r
      const nextVal = key === 'program' ? val : (val.trim() === '' ? null : val)
      const next: PkProgramRow = { ...r, [key]: nextVal, _dirty: true }
      // Kalau ada _intent, hormati intent (tidak auto-derive). Tanpa intent, derive seperti biasa.
      next.level = r._intent ?? deriveLevel(next)
      return next
    }))
  }, [])

  const addRowWithIntent = useCallback((intent: PkLevel) => {
    setRows(prev => [...prev, emptyRow(intent)])
    setLevelPickerOpen(false)
  }, [])

  const toggleSelect = useCallback((idx: number) => {
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, _selected: !r._selected } : r))
  }, [])
  const toggleSelectAll = useCallback(() => {
    setRows(prev => {
      const allChecked = prev.length > 0 && prev.every(r => r._selected)
      return prev.map(r => ({ ...r, _selected: !allChecked }))
    })
  }, [])

  const requestDeleteSingle = useCallback((idx: number) => {
    setRows(prev => {
      const r = prev[idx]
      if (!r) return prev
      const label = r.subkegiatan?.trim() || r.kegiatan?.trim() || r.program?.trim() || '(kosong)'
      setConfirmDel({ mode: 'single', idx, preview: label })
      return prev
    })
  }, [])
  const requestDeleteBulk = useCallback(() => {
    const count = rows.filter(r => r._selected).length
    if (count === 0) return
    setConfirmDel({ mode: 'bulk', count })
  }, [rows])

  const execConfirmDelete = useCallback(() => {
    if (!confirmDel) return
    if (confirmDel.mode === 'single') {
      const target = confirmDel.idx
      setRows(prev => prev.filter((_, i) => i !== target))
      showToast('ok', '1 baris dihapus (lokal). Klik Simpan untuk commit ke DB.')
    } else if (confirmDel.mode === 'bulk') {
      const removed = confirmDel.count
      setRows(prev => prev.filter(r => !r._selected))
      showToast('ok', `${removed} baris dihapus (lokal). Klik Simpan untuk commit ke DB.`)
    }
    // 'wipe' di-handle terpisah di execWipe
    setConfirmDel(null)
  }, [confirmDel])

  const dirtyCount    = rows.filter(r => r._dirty).length
  const selectedCount = rows.filter(r => r._selected).length
  const allSelected   = rows.length > 0 && rows.every(r => r._selected)

  async function handleImportFetch() {
    setImportBusy(true)
    const d = await fetchJson<unknown>(`/api/perjanjian-kinerja/program/import-renaksi?tahun=${tahun}`)
    setImportBusy(false)
    if (!d.ok) { showToast('err', d.message); return }
    const resp = d as unknown as ApiImportResp
    if (!resp.rows || resp.rows.length === 0) {
      showToast('err', `Tidak ada data Renaksi & Kinerja (level program/kegiatan/sub-kegiatan) untuk tahun ${tahun}.`)
      return
    }
    setImportModal({ rows: resp.rows, stats: resp.stats })
  }

  function applyImport(mode: 'replace' | 'merge') {
    if (!importModal) return
    const incoming: PkProgramRow[] = importModal.rows.map(r => ({
      program:     r.program,
      kegiatan:    r.kegiatan,
      subkegiatan: r.subkegiatan,
      level:       r.level,
      _dirty:      true,
      _intent:     r.level,
    }))
    if (mode === 'replace') {
      setRows(incoming)
      showToast('ok', `Replace: ${incoming.length} baris siap disimpan. Klik Simpan untuk commit.`)
    } else {
      const existingKeys = new Set(rows.map(r => rowKey(r)))
      const fresh = incoming.filter(r => !existingKeys.has(rowKey(r)))
      setRows(prev => [...prev, ...fresh])
      showToast('ok', `Merge: ${fresh.length} baris baru ditambahkan (${incoming.length - fresh.length} sudah ada, dilewati). Klik Simpan untuk commit.`)
    }
    setImportModal(null)
  }

  async function commitSave(survivors: PkProgramRow[]) {
    setSaving(true)
    const payload = {
      tahun,
      rows: survivors.map(r => ({
        program:     r.program.trim(),
        kegiatan:    r.kegiatan ?? null,
        subkegiatan: r.subkegiatan ?? null,
        level:       deriveLevel(r),
      })),
    }
    const d = await fetchJson<unknown>('/api/perjanjian-kinerja/program', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
    setSaving(false)
    if (d.ok) {
      showToast('ok', survivors.length === 0
        ? `Master Program tahun ${tahun} dikosongkan.`
        : `Tersimpan: ${survivors.length} baris untuk tahun ${tahun}`)
      setReloadKey(k => k + 1)
    } else {
      showToast('err', d.message)
    }
  }

  async function handleSave() {
    // Wipe case: rows habis → konfirmasi sekali lagi sebelum POST empty payload.
    if (rows.length === 0) {
      setConfirmDel({ mode: 'wipe', count: 0 })
      return
    }
    const invalid = rows.findIndex(r => !r.program?.trim())
    if (invalid !== -1) {
      showToast('err', `Baris ${invalid + 1}: Kolom Program wajib diisi`)
      return
    }
    await commitSave(rows)
  }

  async function execWipe() {
    setConfirmDel(null)
    await commitSave([])
  }

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      <style>{`
        /* Theme-aware stat card di modal Import — abu-abu kotor di light mode → kartu putih lift */
        .pk-import-stat-card { background: rgba(2,15,28,.45); }
        [data-theme="light"] .pk-import-stat-card { background: rgba(250,250,250,.85); }
        /* Theme-aware modal card + backdrop */
        .pk-modal-card { background: #042C53; border: 1px solid #185FA5; color: #E6F1FB; }
        [data-theme="light"] .pk-modal-card { background: #FAFAFA; border-color: rgba(139,92,246,.25); color: #0F0F12; }
        .pk-modal-text-secondary { color: #B5D4F4; }
        [data-theme="light"] .pk-modal-text-secondary { color: #4B5563; }
        .pk-modal-tip { background: rgba(124,92,252,.10); border-left: 3px solid #7C5CFC; }
        [data-theme="light"] .pk-modal-tip { background: rgba(139,92,246,.08); border-left-color: #8B5CF6; }
        .pk-level-pick-btn {
          display:flex; flex-direction:column; align-items:flex-start; gap:6px;
          padding:14px 16px; border-radius:10px; cursor:pointer; text-align:left;
          border:1.5px solid; transition:transform .12s, box-shadow .12s;
          font-family:inherit;
        }
        .pk-level-pick-btn:hover { transform: translateY(-2px); box-shadow: 0 8px 20px rgba(0,0,0,.35); }
      `}</style>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: '#E6F1FB', margin: 0 }}>Master Program</h1>
          <p style={{ fontSize: 12, color: '#85B7EB', margin: '4px 0 0' }}>
            Tahun aktif: <strong style={{ color: '#FAC775', fontFamily: 'JetBrains Mono, ui-monospace, monospace' }}>{tahun}</strong>
            {' · '}
            {loading ? 'Memuat…' : `${rows.length} baris${selectedCount > 0 ? ` (${selectedCount} tercentang)` : ''}`}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <PrimaButton variant="ghost" iconLeft={<RefreshCw size={14} />}
            onClick={() => setReloadKey(k => k + 1)} disabled={loading || saving}>
            Muat Ulang
          </PrimaButton>
          <PrimaButton variant="success" iconLeft={<Download size={14} />}
            onClick={handleImportFetch} disabled={loading || saving || importBusy}
            data-tooltip="Tarik hierarki Program → Kegiatan → Sub-Kegiatan dari aplikasi Renaksi & Kinerja"
            data-tooltip-pos="bottom">
            {importBusy ? 'Memuat…' : 'Import Renaksi'}
          </PrimaButton>
          <PrimaButton variant="purple" iconLeft={<Plus size={14} />}
            onClick={() => setLevelPickerOpen(true)} disabled={loading || saving}>
            Tambah Baris
          </PrimaButton>
          {selectedCount > 0 && (
            <PrimaButton variant="danger" iconLeft={<DeleteIcon size={14} />}
              onClick={requestDeleteBulk} disabled={loading || saving}>
              Hapus Terpilih ({selectedCount})
            </PrimaButton>
          )}
          <PrimaButton variant="primary" iconLeft={<Save size={14} />}
            onClick={handleSave} disabled={loading || saving}>
            {saving ? 'Menyimpan…' : `Simpan${dirtyCount > 0 ? ` (${dirtyCount})` : ''}`}
          </PrimaButton>
        </div>
      </div>

      {toast && (
        <div style={{
          marginBottom: 12, padding: '10px 14px', borderRadius: 8,
          display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, fontWeight: 600,
          background: toast.kind === 'ok' ? 'rgba(29,158,117,.15)' : 'rgba(226,75,74,.15)',
          border: `1px solid ${toast.kind === 'ok' ? 'rgba(29,158,117,.4)' : 'rgba(226,75,74,.4)'}`,
          color: toast.kind === 'ok' ? '#6EE7B7' : '#FCA5A5',
        }}>
          {toast.kind === 'ok' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          {toast.msg}
        </div>
      )}

      <div style={{
        background: '#042C53', border: '1px solid #0C447C', borderRadius: 10, overflow: 'hidden',
      }}>
        {loading ? (
          <TableSkeleton rows={6} cols={5} />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <thead>
                <tr style={{ background: 'rgba(12,68,124,.5)' }}>
                  <th style={{ ...th(36), textAlign: 'center' }}>
                    <input type="checkbox" checked={allSelected} onChange={toggleSelectAll}
                      disabled={rows.length === 0} data-tooltip="Pilih semua / batal"
                      style={checkboxStyle} />
                  </th>
                  <th style={th(40)}>#</th>
                  <th style={th(240)}>Program</th>
                  <th style={th(220)}>Kegiatan</th>
                  <th style={th(240)}>Sub-Kegiatan</th>
                  <th style={th(90)}>Level</th>
                  <th style={th(60)}>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={7} style={{ padding: '40px 16px', textAlign: 'center', color: '#85B7EB', fontSize: 13 }}>
                      Belum ada data program untuk tahun {tahun}. Klik <strong>Tambah Baris</strong> atau <strong>Import Renaksi</strong> untuk mulai.
                    </td>
                  </tr>
                )}
                {rows.map((r, idx) => {
                  const lvl = r._intent ?? deriveLevel(r)
                  const meta = LEVEL_LABEL[lvl]
                  const lockK  = isCellLocked(r._intent, 'kegiatan')
                  const lockSK = isCellLocked(r._intent, 'subkegiatan')
                  return (
                    <tr key={idx} style={{
                      background: r._selected ? 'rgba(239,159,39,.10)' : (idx % 2 === 0 ? 'transparent' : 'rgba(12,68,124,.15)'),
                      transition: 'all .15s',
                    }}>
                      <td style={{ ...td, textAlign: 'center' }}>
                        <input type="checkbox" checked={!!r._selected} onChange={() => toggleSelect(idx)}
                          style={checkboxStyle} />
                      </td>
                      <td style={tdNum}>{idx + 1}</td>
                      <td style={td}>
                        <input type="text"
                          value={r.program ?? ''} onChange={e => updateCell(idx, 'program', e.target.value)}
                          placeholder="Nama program" style={inputStyle} />
                      </td>
                      <td style={td}>
                        <input type="text" disabled={lockK} readOnly={lockK}
                          value={r.kegiatan ?? ''} onChange={e => updateCell(idx, 'kegiatan', e.target.value)}
                          placeholder={lockK ? '— terkunci (intent: Program) —' : 'Nama kegiatan'}
                          style={lockK ? inputLocked : inputStyle} />
                      </td>
                      <td style={td}>
                        <input type="text" disabled={lockSK} readOnly={lockSK}
                          value={r.subkegiatan ?? ''} onChange={e => updateCell(idx, 'subkegiatan', e.target.value)}
                          placeholder={lockSK ? `— terkunci (intent: ${r._intent === 'program' ? 'Program' : 'Kegiatan'}) —` : 'Nama sub-kegiatan'}
                          style={lockSK ? inputLocked : inputStyle} />
                      </td>
                      <td style={td}>
                        <span style={{
                          display: 'inline-block', padding: '3px 8px', borderRadius: 6,
                          fontSize: 10, fontWeight: 800, letterSpacing: '.5px',
                          background: `${meta.color}22`, color: meta.color,
                          border: `1px solid ${meta.color}55`,
                          fontFamily: 'JetBrains Mono, ui-monospace, monospace',
                        }}>{meta.txt}</span>
                      </td>
                      <td style={tdAction}>
                        <button onClick={() => requestDeleteSingle(idx)}
                          data-tooltip="Hapus baris ini"
                          data-tooltip-pos="left"
                          style={btnIconDanger(false)}>
                          <DeleteIcon size={13} />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p style={{ fontSize: 11, color: '#85B7EB', marginTop: 10, lineHeight: 1.6 }}>
        💡 <strong>Level otomatis</strong> dari isi field: hanya Program → <code style={mono}>PROGRAM</code>;
        + Kegiatan → <code style={mono}>KEGIATAN</code>; + Sub-Kegiatan → <code style={mono}>SUB-KEG</code>.
        Pola simpan: replace-all per tahun (sama dengan Master Sasaran).
        <br />
        📥 <strong>Import Renaksi</strong>: tarik hierarki Program → Kegiatan → Sub-Kegiatan dari aplikasi Renaksi & Kinerja. Hasil populate form (belum auto-save) — masih bisa diedit sebelum klik Simpan.
      </p>

      {importModal && (
        <div onClick={() => setImportModal(null)} style={modalBackdrop}>
          <div onClick={e => e.stopPropagation()} className="pk-modal-card" style={modalCard}>
            <div style={modalHeader}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Download size={18} color="#7DD3FC" />
                <strong style={{ fontSize: 14 }}>Import Hierarki dari Renaksi & Kinerja · Tahun {tahun}</strong>
              </div>
              <button onClick={() => setImportModal(null)} style={modalCloseBtn} data-tooltip="Tutup">
                <X size={16} />
              </button>
            </div>

            <div style={{ padding: '16px 18px', display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 }}>
              {[
                { label: 'PROGRAM',     value: importModal.stats.program,     color: '#3B82F6' },
                { label: 'KEGIATAN',    value: importModal.stats.kegiatan,    color: '#10B981' },
                { label: 'SUB-KEG',     value: importModal.stats.subkegiatan, color: '#EF9F27' },
                { label: 'SUMBER RA',   value: importModal.stats.source_ra,   color: '#7C5CFC' },
              ].map(s => (
                <div key={s.label} className="pk-import-stat-card" style={{ borderRadius: 8, padding: '10px 12px', border: `1px solid ${s.color}55` }}>
                  <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '.6px', color: s.color }}>{s.label}</div>
                  <div style={{ fontSize: 18, fontWeight: 800, fontFamily: 'JetBrains Mono, ui-monospace, monospace', marginTop: 2 }}>{s.value}</div>
                </div>
              ))}
            </div>

            <div className="pk-modal-text-secondary" style={{ padding: '0 18px 14px', fontSize: 12, lineHeight: 1.6 }}>
              Total <strong style={{ color: '#FAC775' }}>{importModal.rows.length}</strong> baris siap diimpor. Pilih mode:
              <ul style={{ margin: '8px 0 0', paddingLeft: 20 }}>
                <li><strong style={{ color: '#E24B4A' }}>Replace All</strong> — semua baris Master Program PK saat ini ditimpa total. Data manual hilang.</li>
                <li><strong style={{ color: '#1D9E75' }}>Merge</strong> — baris baru ditambahkan, baris existing (match Program+Kegiatan+Sub-Keg) dilewati. Data manual aman.</li>
              </ul>
              <div className="pk-modal-tip" style={{ marginTop: 10, padding: '8px 10px', borderRadius: 4, fontSize: 11.5 }}>
                Setelah pilih, baris populate ke form (belum auto-save). Klik <strong>Simpan</strong> di toolbar untuk commit ke DB.
              </div>
            </div>

            <div style={{ padding: '12px 18px', borderTop: '1px solid rgba(127,127,127,.18)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <PrimaButton variant="ghost" onClick={() => setImportModal(null)}>Batal</PrimaButton>
              <PrimaButton variant="success" iconLeft={<CheckCircle2 size={14} />}
                onClick={() => applyImport('merge')}>
                Merge
              </PrimaButton>
              <PrimaButton variant="danger" iconLeft={<RefreshCw size={14} />}
                onClick={() => applyImport('replace')}>
                Replace All
              </PrimaButton>
            </div>
          </div>
        </div>
      )}

      {confirmDel && (
        <div onClick={() => setConfirmDel(null)} style={modalBackdrop}>
          <div onClick={e => e.stopPropagation()} className="pk-modal-card" style={{ ...modalCard, maxWidth: 440 }}>
            <div style={modalHeader}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <AlertCircle size={18} color="#E24B4A" />
                <strong style={{ fontSize: 14 }}>
                  {confirmDel.mode === 'single' && 'Hapus Baris'}
                  {confirmDel.mode === 'bulk'   && `Hapus ${confirmDel.count} Baris Terpilih`}
                  {confirmDel.mode === 'wipe'   && `Wipe Master Program Tahun ${tahun}`}
                </strong>
              </div>
              <button onClick={() => setConfirmDel(null)} style={modalCloseBtn} data-tooltip="Tutup">
                <X size={16} />
              </button>
            </div>
            <div className="pk-modal-text-secondary" style={{ padding: '14px 18px', fontSize: 12.5, lineHeight: 1.6 }}>
              {confirmDel.mode === 'single' && (
                <>Yakin hapus baris: <strong style={{ color: '#FAC775' }}>{confirmDel.preview}</strong>?<br />
                  Baris akan hilang dari list. Klik <strong>Simpan</strong> setelah menghapus.</>
              )}
              {confirmDel.mode === 'bulk' && (
                <>Yakin hapus <strong style={{ color: '#FAC775' }}>{confirmDel.count}</strong> baris yang tercentang?<br />
                  Baris akan hilang dari list. Klik <strong>Simpan</strong> setelah menghapus.</>
              )}
              {confirmDel.mode === 'wipe' && (
                <>Anda akan <strong style={{ color: '#E24B4A' }}>WIPE</strong> semua data Master Program tahun <strong style={{ color: '#FAC775' }}>{tahun}</strong> di database (replace dengan kosong). Lanjut?</>
              )}
            </div>
            <div style={{ padding: '10px 18px 14px', borderTop: '1px solid rgba(127,127,127,.18)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <PrimaButton variant="ghost" onClick={() => setConfirmDel(null)}>Batal</PrimaButton>
              {confirmDel.mode === 'wipe' ? (
                <PrimaButton variant="danger" iconLeft={<DeleteIcon size={14} />} onClick={execWipe}>
                  Wipe Sekarang
                </PrimaButton>
              ) : (
                <PrimaButton variant="danger" iconLeft={<DeleteIcon size={14} />} onClick={execConfirmDelete}>
                  Hapus
                </PrimaButton>
              )}
            </div>
          </div>
        </div>
      )}

      {levelPickerOpen && (
        <div onClick={() => setLevelPickerOpen(false)} style={modalBackdrop}>
          <div onClick={e => e.stopPropagation()} className="pk-modal-card" style={{ ...modalCard, maxWidth: 460 }}>
            <div style={modalHeader}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Plus size={18} color="#FAC775" />
                <strong style={{ fontSize: 14 }}>Tambah Baris — Pilih Level</strong>
              </div>
              <button onClick={() => setLevelPickerOpen(false)} style={modalCloseBtn} data-tooltip="Tutup">
                <X size={16} />
              </button>
            </div>
            <div className="pk-modal-text-secondary" style={{ padding: '12px 18px 0', fontSize: 12, lineHeight: 1.6 }}>
              Pilih level baris yang ingin ditambah. Kolom di atas level akan otomatis terkunci (read-only).
            </div>
            <div style={{ padding: '14px 18px', display: 'grid', gridTemplateColumns: '1fr', gap: 10 }}>
              {(['program','kegiatan','subkegiatan'] as PkLevel[]).map(lv => {
                const meta = LEVEL_LABEL[lv]
                const desc = lv === 'program'
                  ? 'Hanya kolom Program editable. Kegiatan + Sub-Kegiatan terkunci.'
                  : lv === 'kegiatan'
                  ? 'Kolom Program + Kegiatan editable. Sub-Kegiatan terkunci.'
                  : 'Semua 3 kolom editable (Program + Kegiatan + Sub-Kegiatan).'
                return (
                  <button key={lv} onClick={() => addRowWithIntent(lv)}
                    className="pk-level-pick-btn"
                    style={{ background: `${meta.color}14`, borderColor: `${meta.color}66`, color: 'inherit' }}>
                    <span style={{
                      display: 'inline-block', padding: '3px 10px', borderRadius: 6,
                      fontSize: 10.5, fontWeight: 800, letterSpacing: '.6px',
                      background: `${meta.color}28`, color: meta.color,
                      border: `1px solid ${meta.color}55`,
                      fontFamily: 'JetBrains Mono, ui-monospace, monospace',
                    }}>{meta.txt}</span>
                    <span className="pk-modal-text-secondary" style={{ fontSize: 12, lineHeight: 1.5 }}>{desc}</span>
                  </button>
                )
              })}
            </div>
            <div style={{ padding: '10px 18px 14px', borderTop: '1px solid rgba(127,127,127,.18)', display: 'flex', justifyContent: 'flex-end' }}>
              <PrimaButton variant="ghost" onClick={() => setLevelPickerOpen(false)}>Batal</PrimaButton>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Re-use style helpers (duplicate inline rather than abstract — Sprint 5 scope)
function th(minWidth: number): React.CSSProperties {
  return {
    padding: '10px 12px', textAlign: 'left',
    fontSize: 10.5, fontWeight: 800, letterSpacing: '.6px', textTransform: 'uppercase',
    color: '#FAC775', borderBottom: '1px solid #0C447C',
    minWidth, whiteSpace: 'nowrap',
  }
}
const td: React.CSSProperties = { padding: '6px 8px', borderBottom: '1px solid rgba(12,68,124,.5)', verticalAlign: 'middle' }
const tdNum: React.CSSProperties = { ...td, textAlign: 'center', fontFamily: 'JetBrains Mono, ui-monospace, monospace', color: '#85B7EB', fontWeight: 700 }
const tdAction: React.CSSProperties = { ...td, textAlign: 'center' }
const inputLocked: React.CSSProperties = {
  ...inputStyle,
  background: 'rgba(127,127,127,.10)',
  border: '1px dashed rgba(127,127,127,.35)',
  color: 'rgba(229,241,251,.45)',
  cursor: 'not-allowed', fontStyle: 'italic',
}
const modalCard: React.CSSProperties = {
  borderRadius: 14,
  width: '100%', maxWidth: 560, boxShadow: '0 24px 48px rgba(0,0,0,.5)',
}
const modalHeader: React.CSSProperties = {
  padding: '14px 18px', borderBottom: '1px solid rgba(255,255,255,.08)',
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
}
const modalCloseBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  width: 28, height: 28, borderRadius: 6,
  background: 'transparent', color: '#B5D4F4', border: '1px solid rgba(181,212,244,.25)',
  cursor: 'pointer',
}
function btnIconDanger(active: boolean): React.CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    width: 28, height: 28, borderRadius: 6,
    background: active ? '#E24B4A' : 'rgba(226,75,74,.15)',
    color: active ? '#FFFFFF' : '#FCA5A5',
    border: '1px solid rgba(226,75,74,.4)',
    cursor: 'pointer', transition: 'all .15s',
  }
}
