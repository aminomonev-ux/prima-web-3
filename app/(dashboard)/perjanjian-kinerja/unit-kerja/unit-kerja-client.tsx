'use client'
// Master Unit Kerja — inline edit (admin only, Sprint 8a).
// Backend POST `/api/perjanjian-kinerja/units` (upsert pattern, soft-delete via active).
// BLUD PJ mapping per unit dipilih dari penanggung_jawab labels (existing tabel BLUD).

import { useState, useCallback } from 'react'
import {
  ShieldCheck, RefreshCw, AlertCircle, Plus, Save, CheckCircle2, RotateCcw, X,
} from 'lucide-react'
import { fetchJson } from '@/lib/shared/api'
import { confirmDialog } from '@/components/ui/ConfirmDialog'
import { useAbortableEffect } from '@/lib/shared/hooks'
import { TableSkeleton } from '@/components/ui/table-skeleton'
import PrimaNumberField from '@/components/ui/PrimaNumberField'
import PrimaButton from '@/components/ui/PrimaButton'
import { pkInputTable as inputStyle, pkMono as mono } from '@/lib/shared/pk-styles'
import type { PkUnitKerja, PkLevel } from '../_utils/pk-types'

interface UnitRow extends PkUnitKerja {
  _dirty?: boolean
  _new?: boolean
}

type BludLabel = { id: number; label: string }

function emptyUnit(seq: number): UnitRow {
  return {
    id: 0, nama_unit: '', level: 'subkegiatan',
    atasan_default: null, selectable_as_pertama: true,
    urutan: seq, active: true, _dirty: true, _new: true,
  }
}

export default function UnitKerjaClient() {
  const [units, setUnits] = useState<UnitRow[]>([])
  // BLUD mapping per unit_pk → set of pj labels
  const [mapping, setMapping] = useState<Record<string, Set<string>>>({})
  const [pjLabels, setPjLabels] = useState<BludLabel[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null)
  const [mappingModalUnit, setMappingModalUnit] = useState<string | null>(null)
  const [mappingDirty, setMappingDirty] = useState(false)

  function showToast(kind: 'ok' | 'err', msg: string) {
    setToast({ kind, msg })
    window.setTimeout(() => setToast(null), 3500)
  }

  useAbortableEffect(async (signal) => {
    setLoading(true)
    const [u, pj] = await Promise.all([
      fetchJson<unknown>(`/api/perjanjian-kinerja/units?include_inactive=true&with_mapping=true`, { signal }),
      fetchJson<unknown>(`/api/blud/penanggung-jawab`, { signal }),
    ])
    if (signal.aborted) return
    if (u.ok) {
      const r = u as unknown as {
        units: PkUnitKerja[]
        mapping?: Array<{ unit_pk: string; blud_pj_label: string }>
      }
      // MySQL TINYINT(1) → mysql2 return as number 0/1, bukan boolean. Cast manual
      // supaya Zod z.boolean() di POST endpoint tidak reject saat user Save.
      setUnits((r.units ?? []).map(x => ({
        ...x,
        selectable_as_pertama: Boolean(x.selectable_as_pertama),
        active:                Boolean(x.active),
        _dirty: false, _new: false,
      })))
      const m: Record<string, Set<string>> = {}
      for (const map of r.mapping ?? []) {
        if (!m[map.unit_pk]) m[map.unit_pk] = new Set()
        m[map.unit_pk].add(map.blud_pj_label)
      }
      setMapping(m)
    } else {
      showToast('err', u.message)
      setUnits([])
    }
    if (pj.ok) {
      // BLUD endpoint returns either { rows: [...] } or array directly — handle both
      const r = pj as unknown as { rows?: BludLabel[]; data?: BludLabel[] } & { [k: string]: unknown }
      const list = (r.rows ?? r.data ?? []) as BludLabel[]
      setPjLabels(list)
    }
    setMappingDirty(false)
    setLoading(false)
  }, [reloadKey])

  const updateField = useCallback(<K extends keyof PkUnitKerja>(idx: number, key: K, val: PkUnitKerja[K]) => {
    // Rename cascade: semua relasi pakai string nama unit — atasan_default baris lain
    // + key mapping BLUD PJ ikut di-rename supaya tidak jadi referensi yatim.
    if (key === 'nama_unit') {
      const oldName = units[idx]?.nama_unit ?? ''
      const newName = String(val)
      setUnits(prev => prev.map((u, i) =>
        i === idx ? { ...u, nama_unit: newName, _dirty: true }
        : (oldName && u.atasan_default === oldName) ? { ...u, atasan_default: newName, _dirty: true }
        : u))
      if (oldName && oldName !== newName) {
        setMapping(prev => {
          if (!prev[oldName]) return prev
          const next = { ...prev }
          next[newName] = next[oldName]
          delete next[oldName]
          return next
        })
      }
      return
    }
    setUnits(prev => prev.map((u, i) => i === idx ? { ...u, [key]: val, _dirty: true } : u))
  }, [units])

  const addRow = useCallback(() => {
    setUnits(prev => [...prev, emptyUnit(prev.length + 10)])
  }, [])

  const toggleActive = useCallback((idx: number) => {
    setUnits(prev => prev.map((u, i) => i === idx ? { ...u, active: !u.active, _dirty: true } : u))
  }, [])

  function toggleMapping(unitPk: string, label: string) {
    setMapping(prev => {
      const next: Record<string, Set<string>> = { ...prev }
      const set = new Set(next[unitPk] ?? [])
      if (set.has(label)) set.delete(label)
      else set.add(label)
      next[unitPk] = set
      return next
    })
    setMappingDirty(true)
  }

  const dirtyCount = units.filter(u => u._dirty).length + (mappingDirty ? 1 : 0)
  const activeCount = units.filter(u => u.active).length

  // Detect nama_unit duplikat — case-insensitive trim. Dipakai utk inline warning
  // di input + dedup option key di dropdown atasan_default (cegah React duplicate key).
  const dupNames = (() => {
    const seen = new Map<string, number>()
    for (const u of units) {
      const k = u.nama_unit?.trim().toLowerCase()
      if (!k) continue
      seen.set(k, (seen.get(k) ?? 0) + 1)
    }
    return new Set(Array.from(seen.entries()).filter(([, n]) => n > 1).map(([k]) => k))
  })()
  const isDupRow = (nama: string) => dupNames.has(nama.trim().toLowerCase())

  async function handleSave() {
    // Validate: nama_unit non-empty
    const invalid = units.findIndex(u => !u.nama_unit?.trim())
    if (invalid !== -1) { showToast('err', `Baris ${invalid + 1}: Nama Unit wajib diisi`); return }
    // Validate atasan_default refers to existing unit
    const names = new Set(units.map(u => u.nama_unit.trim()))
    for (let i = 0; i < units.length; i++) {
      const u = units[i]
      if (u.atasan_default && !names.has(u.atasan_default.trim())) {
        showToast('err', `Baris ${i + 1}: Atasan "${u.atasan_default}" tidak ada di daftar`)
        return
      }
    }
    // Duplicate check
    const seen = new Set<string>()
    for (let i = 0; i < units.length; i++) {
      const k = units[i].nama_unit.trim()
      if (seen.has(k)) { showToast('err', `Nama unit "${k}" duplikat`); return }
      seen.add(k)
    }

    setSaving(true)
    // Mapping yatim (key tidak match unit mana pun — sisa rename lama) dibuang,
    // kalau ikut dikirim server tolak 400 "tidak terdaftar di payload".
    const bludMappingArr: Array<{ unit_pk: string; blud_pj_label: string }> = []
    let orphanCount = 0
    for (const [unitPk, labelSet] of Object.entries(mapping)) {
      if (!names.has(unitPk.trim())) { orphanCount += labelSet.size; continue }
      for (const label of labelSet) bludMappingArr.push({ unit_pk: unitPk, blud_pj_label: label })
    }
    const payload = {
      units: units.map(u => ({
        ...(u._new ? {} : { id: u.id }),
        nama_unit: u.nama_unit.trim(),
        level: u.level,
        atasan_default: u.atasan_default?.trim() || null,
        selectable_as_pertama: u.selectable_as_pertama,
        urutan: u.urutan,
        active: u.active,
      })),
      bludMapping: bludMappingArr,
    }
    const d = await fetchJson<unknown>('/api/perjanjian-kinerja/units', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
    setSaving(false)
    if (d.ok) {
      const r = d as unknown as { updated: number; inserted: number; mappings: number }
      showToast('ok', `Tersimpan: ${r.updated} updated, ${r.inserted} baru, ${r.mappings} mapping BLUD`
        + (orphanCount > 0 ? ` (${orphanCount} mapping yatim dibuang)` : ''))
      setReloadKey(k => k + 1)
    } else {
      showToast('err', d.message)
    }
  }

  const modalUnit = mappingModalUnit ? units.find(u => u.nama_unit === mappingModalUnit) : null
  const modalLabels = mappingModalUnit ? mapping[mappingModalUnit] ?? new Set() : new Set<string>()

  return (
    <div style={{ maxWidth: 1300, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: '#E6F1FB', margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
            Master Unit Kerja
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
            {loading ? 'Memuat…' : `${units.length} unit terdaftar (${activeCount} aktif)`} · Atasan default + level + BLUD PJ mapping
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <PrimaButton variant="ghost" iconLeft={<RefreshCw size={14} />}
            onClick={() => setReloadKey(k => k + 1)} disabled={loading || saving}>
            Muat Ulang
          </PrimaButton>
          <PrimaButton variant="purple" iconLeft={<Plus size={14} />}
            onClick={addRow} disabled={loading || saving}>
            Tambah Unit
          </PrimaButton>
          <PrimaButton variant="primary" iconLeft={<Save size={14} />}
            onClick={handleSave} disabled={loading || saving || dirtyCount === 0}>
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
          <TableSkeleton rows={8} cols={8} />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 1100 }}>
              <thead>
                <tr style={{ background: 'rgba(12,68,124,.5)' }}>
                  <th style={th(40)}>#</th>
                  <th style={th(240)}>Nama Unit *</th>
                  <th style={th(120)}>Level *</th>
                  <th style={th(220)}>Atasan Default</th>
                  <th style={th(110)}>Pihak 1?</th>
                  <th style={th(80)}>Urutan</th>
                  <th style={th(130)}>BLUD PJ</th>
                  <th style={th(90)}>Status</th>
                </tr>
              </thead>
              <tbody>
                {units.length === 0 && (
                  <tr>
                    <td colSpan={8} style={{ padding: '40px 16px', textAlign: 'center', color: '#85B7EB', fontSize: 13 }}>
                      Belum ada unit kerja. Klik <strong>Tambah Unit</strong> untuk mulai.
                    </td>
                  </tr>
                )}
                {units.map((u, idx) => {
                  const mappingCount = (mapping[u.nama_unit] ?? new Set()).size
                  return (
                    <tr key={u.id || `new-${idx}`} style={{
                      background: !u.active ? 'rgba(133,133,133,.08)' : (idx % 2 === 0 ? 'transparent' : 'rgba(12,68,124,.15)'),
                      opacity: u.active ? 1 : 0.6, transition: 'all .15s',
                    }}>
                      <td style={tdNum}>{idx + 1}</td>
                      <td style={td}>
                        <input type="text" disabled={!u.active}
                          value={u.nama_unit} onChange={e => updateField(idx, 'nama_unit', e.target.value)}
                          placeholder="Nama unit"
                          style={u.nama_unit?.trim() && isDupRow(u.nama_unit) ? inputDup : inputStyle} />
                        {u.nama_unit?.trim() && isDupRow(u.nama_unit) && (
                          <div style={{ fontSize: 10.5, color: '#FCA5A5', marginTop: 3, fontWeight: 600 }}>
                            ⚠ Nama unit duplikat — ganti supaya unik
                          </div>
                        )}
                      </td>
                      <td style={td}>
                        <select disabled={!u.active}
                          value={u.level} onChange={e => updateField(idx, 'level', e.target.value as PkLevel)}
                          style={inputStyle}>
                          <option value="program">PROGRAM</option>
                          <option value="kegiatan">KEGIATAN</option>
                          <option value="subkegiatan">SUB-KEG</option>
                        </select>
                      </td>
                      <td style={td}>
                        <select disabled={!u.active}
                          value={u.atasan_default ?? ''}
                          onChange={e => updateField(idx, 'atasan_default', e.target.value || null)}
                          style={inputStyle}>
                          <option value="">— top (Direktur) —</option>
                          {(() => {
                            // Dedup by nama_unit + exclude self — cegah React duplicate-key error
                            // kalau ada nama duplikat di tabel (dimunculkan via warning inline).
                            const seen = new Set<string>()
                            return units
                              .filter(o => o.nama_unit?.trim() && o.nama_unit !== u.nama_unit)
                              .filter(o => { const k = o.nama_unit.trim().toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true })
                              .map(o => <option key={o.nama_unit} value={o.nama_unit}>{o.nama_unit}</option>)
                          })()}
                        </select>
                      </td>
                      <td style={{ ...td, textAlign: 'center' }}>
                        <input type="checkbox" disabled={!u.active}
                          checked={u.selectable_as_pertama}
                          onChange={e => updateField(idx, 'selectable_as_pertama', e.target.checked)}
                          style={{ width: 16, height: 16, accentColor: '#EF9F27', cursor: u.active ? 'pointer' : 'not-allowed' }} />
                      </td>
                      <td style={td}>
                        <PrimaNumberField size="sm" disabled={!u.active}
                          value={u.urutan} onChange={e => updateField(idx, 'urutan', Number(e.target.value) || 0)}
                          inputClassName="text-right" style={{ width: 78 }} />
                      </td>
                      <td style={{ ...td, textAlign: 'center' }}>
                        <button
                          onClick={() => setMappingModalUnit(u.nama_unit)}
                          disabled={!u.active || !u.nama_unit.trim()}
                          data-tooltip={u.nama_unit ? `${mappingCount} label PJ untuk agregasi auto-fill nominal — bukan data DPA BLUD` : 'Isi nama unit dulu'}
                          data-tooltip-pos="left"
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: 4,
                            padding: '4px 9px', borderRadius: 5,
                            background: mappingCount > 0 ? 'rgba(239,159,39,.18)' : 'rgba(133,183,235,.12)',
                            color: mappingCount > 0 ? '#FAC775' : '#85B7EB',
                            border: `1px solid ${mappingCount > 0 ? 'rgba(239,159,39,.45)' : 'rgba(133,183,235,.3)'}`,
                            fontSize: 10.5, fontWeight: 700, fontFamily: 'inherit',
                            cursor: (u.active && u.nama_unit.trim()) ? 'pointer' : 'not-allowed',
                            opacity: (u.active && u.nama_unit.trim()) ? 1 : 0.5,
                          }}>
                          {mappingCount} PJ
                        </button>
                      </td>
                      <td style={{ ...td, textAlign: 'center' }}>
                        <button onClick={() => toggleActive(idx)}
                          data-tooltip={u.active ? 'Nonaktifkan (soft delete)' : 'Aktifkan kembali'}
                          data-tooltip-pos="left"
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: 4,
                            padding: '3px 10px', borderRadius: 5,
                            background: u.active ? 'rgba(29,158,117,.18)' : 'rgba(226,75,74,.18)',
                            color: u.active ? '#6EE7B7' : '#FCA5A5',
                            border: `1px solid ${u.active ? 'rgba(29,158,117,.4)' : 'rgba(226,75,74,.4)'}`,
                            fontSize: 10, fontWeight: 800, letterSpacing: '.4px',
                            cursor: 'pointer', fontFamily: 'inherit',
                          }}>
                          {u.active ? <CheckCircle2 size={11} /> : <RotateCcw size={11} />}
                          {u.active ? 'AKTIF' : 'NONAKTIF'}
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
        💡 <strong>Soft-delete only</strong>: unit tidak bisa dihapus permanen via UI (FK <code style={mono}>pk_pejabat</code> RESTRICT). Klik tombol <strong>AKTIF</strong> untuk toggle ke NONAKTIF — unit tidak muncul lagi di dropdown form. <strong>Atasan Default</strong> harus pilih dari unit yang ada di tabel. <strong>BLUD PJ</strong>: kolom mapping untuk auto-fill nominal BLUD aggregate (program/kegiatan level).
      </p>

      {/* ── BLUD PJ Mapping Modal ── */}
      {mappingModalUnit && modalUnit && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 500, padding: 20,
        }} onClick={() => setMappingModalUnit(null)}>
          <div onClick={e => e.stopPropagation()} style={{
            width: 540, maxWidth: '100%', maxHeight: '85vh', background: '#042C53',
            border: '1px solid #0C447C', borderRadius: 14, padding: 18,
            display: 'flex', flexDirection: 'column',
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
              <div>
                <h3 style={{ fontSize: 15, fontWeight: 800, color: '#E6F1FB', margin: 0 }}>BLUD PJ Mapping</h3>
                <p style={{ fontSize: 11.5, color: '#85B7EB', margin: '4px 0 0' }}>
                  Unit: <strong style={{ color: '#FAC775' }}>{mappingModalUnit}</strong>
                  {' · '}
                  {modalLabels.size} label dipilih
                </p>
              </div>
              <button onClick={() => setMappingModalUnit(null)} style={{
                background: 'none', border: 'none', color: '#85B7EB', cursor: 'pointer', padding: 4,
              }}>
                <X size={18} />
              </button>
            </div>
            <p style={{ fontSize: 11, color: '#85B7EB', margin: '0 0 12px', lineHeight: 1.6, padding: '8px 10px', background: 'rgba(59,130,246,.08)', borderRadius: 6, border: '1px solid rgba(59,130,246,.2)' }}>
              Pilih label penanggung jawab BLUD yang dipakai untuk agregasi nominal saat
              auto-fill anggaran. Hanya relevan untuk unit level Program/Kegiatan
              (sub-kegiatan tidak butuh mapping — exact match).
            </p>
            <div style={{
              flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4,
              padding: 6, border: '1px solid rgba(12,68,124,.6)', borderRadius: 6,
              background: 'rgba(2,15,28,.3)',
            }}>
              {pjLabels.length === 0 ? (
                <div style={{ padding: 20, textAlign: 'center', color: '#85B7EB', fontSize: 12 }}>
                  Tidak ada label penanggung jawab. Tambah dulu di BLUD &gt; Penanggung Jawab.
                </div>
              ) : pjLabels.map(pj => {
                const checked = modalLabels.has(pj.label)
                return (
                  <label key={pj.id} style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '7px 10px', borderRadius: 5, cursor: 'pointer',
                    background: checked ? 'rgba(239,159,39,.12)' : 'transparent',
                    border: `1px solid ${checked ? 'rgba(239,159,39,.4)' : 'transparent'}`,
                    transition: 'all .12s',
                  }}>
                    <input type="checkbox" checked={checked}
                      onChange={() => toggleMapping(mappingModalUnit, pj.label)}
                      style={{ width: 14, height: 14, accentColor: '#EF9F27', cursor: 'pointer' }} />
                    <span style={{
                      fontSize: 12, fontWeight: checked ? 700 : 600,
                      color: checked ? '#FAC775' : '#B5D4F4',
                    }}>{pj.label}</span>
                  </label>
                )
              })}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
              {modalLabels.size > 0 && (
                <PrimaButton variant="danger" onClick={async () => {
                  const unitPk = mappingModalUnit
                  if (!unitPk) return
                  if (!(await confirmDialog({
                    title: 'Kosongkan Mapping BLUD PJ',
                    message: `Hapus ${modalLabels.size} label PJ dari unit "${unitPk}"? Auto-fill nominal BLUD untuk unit ini akan berhenti. Perubahan tersimpan setelah klik Simpan.`,
                    variant: 'danger',
                  }))) return
                  setMapping(prev => ({ ...prev, [unitPk]: new Set() }))
                  setMappingDirty(true)
                }}>
                  Kosongkan Semua
                </PrimaButton>
              )}
              <PrimaButton variant="primary" onClick={() => setMappingModalUnit(null)}>
                Selesai ({modalLabels.size})
              </PrimaButton>
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
const td: React.CSSProperties = { padding: '10px 12px', borderBottom: '1px solid rgba(12,68,124,.5)', verticalAlign: 'middle', color: '#B5D4F4' }
const tdNum: React.CSSProperties = { ...td, textAlign: 'center', fontFamily: 'JetBrains Mono, ui-monospace, monospace', color: '#85B7EB', fontWeight: 700 }
const inputDup: React.CSSProperties = {
  width: '100%', background: 'rgba(226,75,74,.10)',
  border: '1.5px solid #E24B4A', borderRadius: 6,
  padding: '6px 10px', color: '#E6F1FB', fontSize: 12.5,
  fontFamily: 'inherit', outline: 'none',
}

