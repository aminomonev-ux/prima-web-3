'use client'
// Master Pejabat — inline edit table per tahun. Admin-only (guard di server page.tsx).
// Pattern sama dengan sasaran-client: replace-all per tahun via POST.

import { useState, useCallback } from 'react'
import { Plus, Save, RefreshCw, AlertCircle, CheckCircle2, ShieldCheck, X } from 'lucide-react'
import DeleteIcon from '@/components/ui/DeleteIcon'
import { fetchJson } from '@/lib/shared/api'
import { useAbortableEffect } from '@/lib/shared/hooks'
import { TableSkeleton } from '@/components/ui/table-skeleton'
import PrimaButton from '@/components/ui/PrimaButton'
import { pkInputTable as inputStyle, pkCheckbox as checkboxStyle, pkModalBackdrop as modalBackdrop, pkMono as mono } from '@/lib/shared/pk-styles'
import { usePkYear } from '../_context/PkYearContext'
import type { PkPejabat, PkUnitKerja } from '../_utils/pk-types'

interface PejabatRow extends PkPejabat {
  _dirty?: boolean
  _selected?: boolean
}

function emptyRow(): PejabatRow {
  return { unit_kerja: '', nama: '', jabatan: '', pangkat: null, nip: null, _dirty: true }
}

export default function PejabatClient() {
  const { tahun } = usePkYear()
  const [rows, setRows] = useState<PejabatRow[]>([])
  const [units, setUnits] = useState<PkUnitKerja[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [confirmDel, setConfirmDel] = useState<{ mode: 'single'; idx: number; preview: string } | { mode: 'bulk'; count: number } | { mode: 'wipe'; count: number } | null>(null)

  function showToast(kind: 'ok' | 'err', msg: string) {
    setToast({ kind, msg })
    window.setTimeout(() => setToast(null), 3500)
  }

  useAbortableEffect(async (signal) => {
    setLoading(true)
    const [p, u] = await Promise.all([
      fetchJson<unknown>(`/api/perjanjian-kinerja/pejabat?tahun=${tahun}`, { signal }),
      fetchJson<unknown>(`/api/perjanjian-kinerja/units`, { signal }),
    ])
    if (signal.aborted) return
    if (p.ok) {
      const r = p as unknown as { rows: PkPejabat[] }
      setRows((r.rows ?? []).map(x => ({ ...x, _dirty: false, _selected: false })))
    } else {
      showToast('err', p.message)
      setRows([])
    }
    if (u.ok) {
      const r = u as unknown as { units: PkUnitKerja[] }
      setUnits(r.units ?? [])
    }
    setLoading(false)
  }, [tahun, reloadKey])

  const updateCell = useCallback((idx: number, key: keyof PkPejabat, val: string) => {
    setRows(prev => prev.map((r, i) => {
      if (i !== idx) return r
      // nullable fields: empty string → null
      const isNullable = key === 'pangkat' || key === 'nip'
      const nextVal = isNullable ? (val.trim() === '' ? null : val) : val
      return { ...r, [key]: nextVal, _dirty: true }
    }))
  }, [])

  const addRow = useCallback(() => setRows(prev => [...prev, emptyRow()]), [])

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
      const label = r.nama?.trim() || r.unit_kerja?.trim() || '(kosong)'
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
      showToast('ok', '1 baris dihapus. Klik Simpan setelah menghapus.')
    } else if (confirmDel.mode === 'bulk') {
      const removed = confirmDel.count
      setRows(prev => prev.filter(r => !r._selected))
      showToast('ok', `${removed} baris dihapus. Klik Simpan setelah menghapus.`)
    }
    setConfirmDel(null)
  }, [confirmDel])

  const dirtyCount    = rows.filter(r => r._dirty).length
  const selectedCount = rows.filter(r => r._selected).length
  const allSelected   = rows.length > 0 && rows.every(r => r._selected)

  async function commitSave(survivors: PejabatRow[]) {
    setSaving(true)
    const payload = {
      tahun,
      rows: survivors.map(r => ({
        unit_kerja: r.unit_kerja.trim(),
        nama: r.nama.trim(),
        jabatan: r.jabatan.trim(),
        pangkat: r.pangkat ?? null,
        nip: r.nip ?? null,
      })),
    }
    const d = await fetchJson<unknown>('/api/perjanjian-kinerja/pejabat', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
    setSaving(false)
    if (d.ok) {
      showToast('ok', survivors.length === 0
        ? `Master Pejabat tahun ${tahun} dikosongkan.`
        : `Tersimpan: ${survivors.length} pejabat untuk tahun ${tahun}`)
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
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]
      if (!r.unit_kerja?.trim()) { showToast('err', `Baris ${i + 1}: Unit Kerja wajib`); return }
      if (!r.nama?.trim()) { showToast('err', `Baris ${i + 1}: Nama wajib`); return }
      if (!r.jabatan?.trim()) { showToast('err', `Baris ${i + 1}: Jabatan wajib`); return }
    }
    // Check duplicate unit_kerja (UNIQUE KEY constraint backend)
    const seen = new Set<string>()
    for (let i = 0; i < rows.length; i++) {
      const k = rows[i].unit_kerja.trim()
      if (seen.has(k)) { showToast('err', `Baris ${i + 1}: Unit Kerja "${k}" duplikat`); return }
      seen.add(k)
    }
    await commitSave(rows)
  }

  async function execWipe() {
    setConfirmDel(null)
    await commitSave([])
  }

  return (
    <div style={{ maxWidth: 1300, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 800, color: '#E6F1FB', margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
              Master Pejabat
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                padding: '3px 8px', borderRadius: 20,
                background: 'rgba(124,92,252,.15)', color: '#C4B5FD',
                border: '1px solid rgba(124,92,252,.3)',
                fontSize: 10, fontWeight: 700, letterSpacing: '.3px',
              }}>
                <ShieldCheck size={11} /> Admin Only
              </span>
            </h1>
            <p style={{ fontSize: 12, color: '#85B7EB', margin: '4px 0 0' }}>
              Tahun aktif: <strong style={{ color: '#FAC775', fontFamily: 'JetBrains Mono, ui-monospace, monospace' }}>{tahun}</strong>
              {' · '}
              {loading ? 'Memuat…' : `${rows.length} pejabat${selectedCount > 0 ? ` (${selectedCount} tercentang)` : ''}`}
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <PrimaButton variant="ghost" iconLeft={<RefreshCw size={14} />}
            onClick={() => setReloadKey(k => k + 1)} disabled={loading || saving}>
            Muat Ulang
          </PrimaButton>
          <PrimaButton variant="purple" iconLeft={<Plus size={14} />}
            onClick={addRow} disabled={loading || saving}>
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

      <div style={{ background: '#042C53', border: '1px solid #0C447C', borderRadius: 10, overflow: 'hidden' }}>
        {loading ? (
          <TableSkeleton rows={6} cols={6} />
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
                  <th style={th(220)}>Unit Kerja *</th>
                  <th style={th(200)}>Nama *</th>
                  <th style={th(200)}>Jabatan *</th>
                  <th style={th(140)}>Pangkat/Gol</th>
                  <th style={th(160)}>NIP</th>
                  <th style={th(60)}>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={8} style={{ padding: '40px 16px', textAlign: 'center', color: '#85B7EB', fontSize: 13 }}>
                      Belum ada data pejabat untuk tahun {tahun}. Klik <strong>Tambah Baris</strong> untuk mulai.
                    </td>
                  </tr>
                )}
                {rows.map((r, idx) => (
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
                      <select value={r.unit_kerja}
                        onChange={e => updateCell(idx, 'unit_kerja', e.target.value)}
                        style={inputStyle}>
                        <option value="">— pilih unit —</option>
                        {units.map(u => (
                          <option key={u.id} value={u.nama_unit}>{u.nama_unit}</option>
                        ))}
                      </select>
                    </td>
                    <td style={td}>
                      <input type="text"
                        value={r.nama ?? ''} onChange={e => updateCell(idx, 'nama', e.target.value)}
                        placeholder="Nama lengkap" style={inputStyle} />
                    </td>
                    <td style={td}>
                      <input type="text"
                        value={r.jabatan ?? ''} onChange={e => updateCell(idx, 'jabatan', e.target.value)}
                        placeholder="Jabatan" style={inputStyle} />
                    </td>
                    <td style={td}>
                      <input type="text"
                        value={r.pangkat ?? ''} onChange={e => updateCell(idx, 'pangkat', e.target.value)}
                        placeholder="(opsional)" style={inputStyle} />
                    </td>
                    <td style={td}>
                      <input type="text"
                        value={r.nip ?? ''} onChange={e => updateCell(idx, 'nip', e.target.value)}
                        placeholder="18 digit"
                        style={{ ...inputStyle, fontFamily: 'JetBrains Mono, ui-monospace, monospace' }} />
                    </td>
                    <td style={{ ...td, textAlign: 'center' }}>
                      <button onClick={() => requestDeleteSingle(idx)}
                        data-tooltip="Hapus baris ini"
                        data-tooltip-pos="left"
                        style={btnIconDanger(false)}>
                        <DeleteIcon size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p style={{ fontSize: 11, color: '#85B7EB', marginTop: 10, lineHeight: 1.6 }}>
        💡 Pola simpan: <strong>replace-all per tahun</strong> — semua data pejabat untuk tahun {tahun} akan ditimpa.
        UNIQUE KEY <code style={mono}>(unit_kerja, tahun, is_active)</code> — duplikat akan ditolak backend.
        Pejabat dipakai untuk auto-fill di Form Perjanjian Kinerja.
      </p>

      {confirmDel && (
        <div onClick={() => setConfirmDel(null)} style={modalBackdrop}>
          <div onClick={e => e.stopPropagation()} style={modalCard}>
            <div style={modalHeader}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <AlertCircle size={18} color="#E24B4A" />
                <strong style={{ fontSize: 14, color: '#E6F1FB' }}>
                  {confirmDel.mode === 'single' && 'Hapus Baris'}
                  {confirmDel.mode === 'bulk'   && `Hapus ${confirmDel.count} Baris Terpilih`}
                  {confirmDel.mode === 'wipe'   && `Wipe Master Pejabat Tahun ${tahun}`}
                </strong>
              </div>
              <button onClick={() => setConfirmDel(null)} style={modalCloseBtn} data-tooltip="Tutup">
                <X size={16} />
              </button>
            </div>
            <div style={{ padding: '14px 18px', fontSize: 12.5, lineHeight: 1.6, color: '#B5D4F4' }}>
              {confirmDel.mode === 'single' && (
                <>Yakin hapus pejabat: <strong style={{ color: '#FAC775' }}>{confirmDel.preview}</strong>?<br />
                  Baris akan hilang dari list. Klik <strong>Simpan</strong> setelah menghapus.</>
              )}
              {confirmDel.mode === 'bulk' && (
                <>Yakin hapus <strong style={{ color: '#FAC775' }}>{confirmDel.count}</strong> pejabat yang tercentang?<br />
                  Baris akan hilang dari list. Klik <strong>Simpan</strong> setelah menghapus.</>
              )}
              {confirmDel.mode === 'wipe' && (
                <>Anda akan <strong style={{ color: '#E24B4A' }}>WIPE</strong> semua data Master Pejabat tahun <strong style={{ color: '#FAC775' }}>{tahun}</strong> di database (replace dengan kosong). Lanjut?</>
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
    </div>
  )
}

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
const modalCard: React.CSSProperties = {
  background: '#042C53', border: '1px solid #185FA5', borderRadius: 14,
  width: '100%', maxWidth: 440, boxShadow: '0 24px 48px rgba(0,0,0,.5)',
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
