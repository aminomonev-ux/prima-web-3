'use client'
// app/(dashboard)/perjanjian-kinerja/sasaran/sasaran-client.tsx
// Master Sasaran — inline edit table + bulk save.
// Pattern: useAbortableEffect (L30) + fetchJson (L11f) + TableSkeleton (L31).
// Backend POST = replace-all per tahun (withTransaction DELETE + bulkInsert).

import { useState, useCallback } from 'react'
import { Plus, Save, RefreshCw, AlertCircle, CheckCircle2, Sparkles } from 'lucide-react'
import DeleteIcon from '@/components/ui/DeleteIcon'
import { fetchJson } from '@/lib/shared/api'
import { useAbortableEffect } from '@/lib/shared/hooks'
import { TableSkeleton } from '@/components/ui/table-skeleton'
import PrimaButton from '@/components/ui/PrimaButton'
import { pkInputTable as inputStyle } from '@/lib/shared/pk-styles'
import { usePkYear } from '../_context/PkYearContext'
import type { PkSasaranRow } from '../_utils/pk-types'

type ApiListResp = { ok: boolean; tahun: string; rows: PkSasaranRow[]; message?: string }

const COLS: { key: keyof PkSasaranRow; label: string; placeholder: string; minWidth: number }[] = [
  { key: 'program',                label: 'Sasaran Program',        placeholder: 'Nama program',                minWidth: 200 },
  { key: 'indikator_program',      label: 'Indikator Program',      placeholder: 'Indikator',                   minWidth: 180 },
  { key: 'target_program',         label: 'Target',                 placeholder: 'Target',                      minWidth: 120 },
  { key: 'kegiatan',               label: 'Sasaran Kegiatan',       placeholder: 'Nama kegiatan',               minWidth: 180 },
  { key: 'indikator_kegiatan',     label: 'Indikator Kegiatan',     placeholder: 'Indikator',                   minWidth: 180 },
  { key: 'target_kegiatan',        label: 'Target',                 placeholder: 'Target',                      minWidth: 120 },
  { key: 'subkegiatan',            label: 'Sasaran Sub Kegiatan',   placeholder: 'Nama sub-kegiatan',           minWidth: 180 },
  { key: 'indikator_subkegiatan',  label: 'Indikator Sub-Kegiatan', placeholder: 'Indikator',                   minWidth: 180 },
  { key: 'target_subkegiatan',     label: 'Target',                 placeholder: 'Target',                      minWidth: 120 },
]

function emptyRow(): PkSasaranRow {
  return {
    program: '',
    indikator_program: null, target_program: null,
    kegiatan: null, indikator_kegiatan: null, target_kegiatan: null,
    subkegiatan: null, indikator_subkegiatan: null, target_subkegiatan: null,
    _dirty: true,
  }
}

type ImportRenaksiResp = { ok: boolean; tahun: string; rows: Omit<PkSasaranRow, '_dirty' | '_deleted' | 'id' | 'tahun'>[]; message?: string }

export default function SasaranClient() {
  const { tahun } = usePkYear()
  const [rows, setRows] = useState<PkSasaranRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importConfirm, setImportConfirm] = useState<{ count: number; payload: PkSasaranRow[] } | null>(null)
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  function showToast(kind: 'ok' | 'err', msg: string) {
    setToast({ kind, msg })
    window.setTimeout(() => setToast(null), 3500)
  }

  // Load rows whenever tahun changes (or manual refetch)
  useAbortableEffect(async (signal) => {
    setLoading(true)
    const d = await fetchJson<unknown>(`/api/perjanjian-kinerja/sasaran?tahun=${tahun}`, { signal })
    if (signal.aborted) return
    if (d.ok) {
      const resp = d as unknown as ApiListResp
      setRows((resp.rows ?? []).map(r => ({ ...r, _dirty: false, _deleted: false })))
    } else {
      showToast('err', d.message)
      setRows([])
    }
    setLoading(false)
  }, [tahun, reloadKey])

  const updateCell = useCallback((idx: number, key: keyof PkSasaranRow, val: string) => {
    setRows(prev => prev.map((r, i) => {
      if (i !== idx) return r
      const nextVal = key === 'program' ? val : (val.trim() === '' ? null : val)
      return { ...r, [key]: nextVal, _dirty: true }
    }))
  }, [])

  const addRow    = useCallback(() => setRows(prev => [...prev, emptyRow()]), [])

  function appendImportedRows(imported: PkSasaranRow[]) {
    setRows(prev => [...prev, ...imported])
    showToast('ok', `Ditambah ${imported.length} baris dari Renaksi & Kinerja. Review lalu klik Simpan untuk commit.`)
  }

  async function handleImportRenaksi() {
    setImporting(true)
    try {
      const d = await fetchJson<unknown>(`/api/perjanjian-kinerja/sasaran/import-renaksi?tahun=${tahun}`)
      if (!d.ok) {
        showToast('err', d.message)
        return
      }
      const resp = d as unknown as ImportRenaksiResp
      if (!resp.rows.length) {
        showToast('err', resp.message || `Tidak ada data Renaksi & Kinerja untuk tahun ${tahun}.`)
        return
      }
      const imported: PkSasaranRow[] = resp.rows.map(r => ({
        program: r.program,
        indikator_program: r.indikator_program,
        target_program: r.target_program,
        kegiatan: r.kegiatan,
        indikator_kegiatan: r.indikator_kegiatan,
        target_kegiatan: r.target_kegiatan,
        subkegiatan: r.subkegiatan,
        indikator_subkegiatan: r.indikator_subkegiatan,
        target_subkegiatan: r.target_subkegiatan,
        _dirty: true,
      }))
      const hasExistingRows = rows.some(r => !r._deleted)
      if (hasExistingRows) {
        setImportConfirm({ count: imported.length, payload: imported })
      } else {
        appendImportedRows(imported)
      }
    } finally {
      setImporting(false)
    }
  }

  const toggleDel = useCallback((idx: number) => {
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, _deleted: !r._deleted, _dirty: true } : r))
  }, [])

  const dirtyCount   = rows.filter(r => r._dirty).length
  const activeCount  = rows.filter(r => !r._deleted).length
  const deletedCount = rows.filter(r => r._deleted).length

  async function handleSave() {
    // Validate: program wajib untuk semua row non-deleted
    const survivors = rows.filter(r => !r._deleted)
    const invalid   = survivors.findIndex(r => !r.program?.trim())
    if (invalid !== -1) {
      showToast('err', `Baris ${invalid + 1}: Kolom Program wajib diisi`)
      return
    }
    if (survivors.length === 0 && rows.length === 0) {
      showToast('err', 'Tidak ada data untuk disimpan. Tambah baris dulu.')
      return
    }
    setSaving(true)
    // Backend Zod min 1 row — kalau survivors kosong (semua row di-delete), kirim 1 dummy yg invalid? No.
    // Untuk MVP: kalau survivors kosong, tampilkan err (user harus hapus manual atau backend perlu support "clear all").
    if (survivors.length === 0) {
      showToast('err', 'Minimal 1 baris harus tersisa. Untuk hapus semua, hubungi admin.')
      setSaving(false)
      return
    }
    const payload = {
      tahun,
      rows: survivors.map(r => ({
        program:               r.program.trim(),
        indikator_program:     r.indikator_program ?? null,
        target_program:        r.target_program ?? null,
        kegiatan:              r.kegiatan ?? null,
        indikator_kegiatan:    r.indikator_kegiatan ?? null,
        target_kegiatan:       r.target_kegiatan ?? null,
        subkegiatan:           r.subkegiatan ?? null,
        indikator_subkegiatan: r.indikator_subkegiatan ?? null,
        target_subkegiatan:    r.target_subkegiatan ?? null,
      })),
    }
    const d = await fetchJson<unknown>('/api/perjanjian-kinerja/sasaran', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
    setSaving(false)
    if (d.ok) {
      showToast('ok', `Tersimpan: ${survivors.length} baris untuk tahun ${tahun}`)
      setReloadKey(k => k + 1)
    } else {
      showToast('err', d.message)
    }
  }

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: '#E6F1FB', margin: 0 }}>Master Sasaran</h1>
          <p style={{ fontSize: 12, color: '#85B7EB', margin: '4px 0 0' }}>
            Tahun aktif: <strong style={{ color: '#FAC775', fontFamily: 'JetBrains Mono, ui-monospace, monospace' }}>{tahun}</strong>
            {' · '}
            {loading ? 'Memuat…' : `${activeCount} baris aktif${deletedCount > 0 ? ` (+${deletedCount} ditandai hapus)` : ''}`}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <PrimaButton
            variant="ghost"
            iconLeft={<RefreshCw size={14} />}
            onClick={() => setReloadKey(k => k + 1)}
            disabled={loading || saving}
            data-tooltip="Muat ulang dari server"
            data-tooltip-pos="below">
            Muat Ulang
          </PrimaButton>
          <PrimaButton
            variant="purple"
            iconLeft={<Sparkles size={14} />}
            onClick={handleImportRenaksi}
            disabled={loading || saving || importing}
            data-tooltip={`Tarik Sasaran + Indikator + Target dari Renaksi & Kinerja tahun ${tahun}`}
            data-tooltip-pos="below">
            {importing ? 'Memuat…' : 'Import Renaksi'}
          </PrimaButton>
          <PrimaButton
            variant="purple"
            iconLeft={<Plus size={14} />}
            onClick={addRow}
            disabled={loading || saving}
            data-tooltip="Tambah baris kosong di bawah"
            data-tooltip-pos="below">
            Tambah Baris
          </PrimaButton>
          <PrimaButton
            variant="primary"
            iconLeft={<Save size={14} />}
            onClick={handleSave}
            disabled={loading || saving || dirtyCount === 0}
            data-tooltip={dirtyCount === 0 ? 'Tidak ada perubahan' : `Simpan ${dirtyCount} perubahan ke server`}
            data-tooltip-pos="below">
            {saving ? 'Menyimpan…' : `Simpan${dirtyCount > 0 ? ` (${dirtyCount})` : ''}`}
          </PrimaButton>
        </div>
      </div>

      {/* Toast */}
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

      {/* Table */}
      <div style={{
        background: '#042C53', border: '1px solid #0C447C', borderRadius: 10,
        overflow: 'hidden',
      }}>
        {loading ? (
          <TableSkeleton rows={6} cols={10} />
        ) : (
          <div style={{ overflowX: 'auto', maxWidth: '100%' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1600, fontSize: 12.5 }}>
              <thead>
                <tr style={{ background: 'rgba(12,68,124,.5)' }}>
                  <th style={th(40)}>#</th>
                  {COLS.map(c => (
                    <th key={c.key as string} style={th(c.minWidth)}>{c.label}</th>
                  ))}
                  <th style={th(60)}>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={COLS.length + 2} style={{
                      padding: '40px 16px', textAlign: 'center',
                      color: '#85B7EB', fontSize: 13,
                    }}>
                      Belum ada data sasaran untuk tahun {tahun}. Klik <strong>Tambah Baris</strong> untuk mulai.
                    </td>
                  </tr>
                )}
                {rows.map((r, idx) => (
                  <tr key={idx} style={{
                    background: r._deleted ? 'rgba(226,75,74,.08)' : (idx % 2 === 0 ? 'transparent' : 'rgba(12,68,124,.15)'),
                    opacity: r._deleted ? 0.5 : 1,
                    transition: 'all .15s',
                  }}>
                    <td style={tdNum}>{idx + 1}</td>
                    {COLS.map(c => (
                      <td key={c.key as string} style={td}>
                        <input
                          type="text"
                          disabled={r._deleted}
                          value={(r[c.key] as string | null) ?? ''}
                          onChange={(e) => updateCell(idx, c.key, e.target.value)}
                          placeholder={c.placeholder}
                          style={inputStyle}
                        />
                      </td>
                    ))}
                    <td style={tdAction}>
                      <button
                        onClick={() => toggleDel(idx)}
                        data-tooltip={r._deleted ? 'Batalkan hapus' : 'Tandai untuk dihapus'}
                        data-tooltip-pos="left"
                        style={btnIconDanger(!!r._deleted)}>
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
        💡 Pola simpan: <strong>replace-all per tahun</strong> — semua baris untuk tahun {tahun} akan ditimpa dengan
        data yang Anda lihat sekarang. Tandai baris untuk dihapus (ikon merah) lalu klik Simpan.
      </p>

      {/* Modal konfirmasi Import Renaksi — muncul kalau tabel sudah ada row aktif (proteksi double-append) */}
      {importConfirm && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 60,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
        }}>
          <div
            onClick={() => setImportConfirm(null)}
            style={{ position: 'absolute', inset: 0, background: 'rgba(2,15,28,.7)' }}
          />
          <div style={{
            position: 'relative', width: '100%', maxWidth: 440,
            background: '#042C53', border: '1px solid #0C447C', borderRadius: 14,
            overflow: 'hidden', boxShadow: '0 12px 48px rgba(0,0,0,.5)',
          }}>
            <div style={{ height: 4, background: 'linear-gradient(90deg, #7C5CFC, #EF9F27)' }} />
            <div style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <h3 style={{ margin: 0, color: '#E6F1FB', fontWeight: 800, fontSize: 15 }}>
                Tambah {importConfirm.count} baris dari Renaksi & Kinerja?
              </h3>
              <p style={{ margin: 0, color: '#85B7EB', fontSize: 12.5, lineHeight: 1.55 }}>
                Tabel sudah berisi data. Baris dari Renaksi & Kinerja akan <strong>ditambahkan di bawah</strong>{' '}
                row existing — tidak menimpa. Setelah review (edit/hapus duplikat), klik <strong>Simpan</strong>{' '}
                untuk commit ke database.
              </p>
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
                gap: 10, paddingTop: 10, borderTop: '1px solid rgba(12,68,124,.6)',
              }}>
                <PrimaButton variant="ghost" onClick={() => setImportConfirm(null)}>Batal</PrimaButton>
                <PrimaButton
                  variant="purple"
                  iconLeft={<Sparkles size={14} />}
                  onClick={() => {
                    appendImportedRows(importConfirm.payload)
                    setImportConfirm(null)
                  }}>
                  Ya, Tambahkan
                </PrimaButton>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Style helpers (inline, mirror BLUD dark surface) ───────────────────────
function th(minWidth: number): React.CSSProperties {
  return {
    padding: '10px 12px', textAlign: 'left',
    fontSize: 10.5, fontWeight: 800, letterSpacing: '.6px', textTransform: 'uppercase',
    color: '#FAC775', borderBottom: '1px solid #0C447C',
    minWidth, whiteSpace: 'nowrap',
  }
}
const td: React.CSSProperties = {
  padding: '6px 8px', borderBottom: '1px solid rgba(12,68,124,.5)', verticalAlign: 'middle',
}
const tdNum: React.CSSProperties = {
  ...td, textAlign: 'center', fontFamily: 'JetBrains Mono, ui-monospace, monospace',
  color: '#85B7EB', fontWeight: 700,
}
const tdAction: React.CSSProperties = { ...td, textAlign: 'center' }


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
