'use client'
// Modal Import Master Pejabat — upload Excel/CSV/Word → preview + koreksi mapping
// unit kanonik → terapkan ke grid sebagai draft (simpan tetap via tombol Simpan).
// Pola 2 langkah pilih-file → preview, mirror ImportPendapatanModal (Model A′).

import { useRef, useState } from 'react'
import { AlertCircle, FileUp, Upload, X } from 'lucide-react'
import PrimaButton from '@/components/ui/PrimaButton'
import { pkModalBackdrop as modalBackdrop, pkInputTable as inputStyle, pkCheckbox as checkboxStyle } from '@/lib/shared/pk-styles'

export interface ImportedPejabatRow {
  unit_kerja: string
  nama: string
  jabatan: string
  pangkat: string | null
  nip: string | null
}

interface ServerRow {
  unit_file: string
  nama: string
  jabatan: string
  pangkat: string | null
  nip: string | null
  unitMatch: { canonical: string | null; score: number; status: 'auto' | 'suggest' | 'unmatched' }
  warnings: string[]
}

interface PreviewRow extends ServerRow {
  include: boolean
  unitSel: string
}

interface Props {
  tahun: string
  unitOptions: { id: number; nama_unit: string }[]
  onClose(): void
  onApply(rows: ImportedPejabatRow[], mode: 'replace' | 'merge'): void
}

const STATUS_UI = {
  auto:      { label: 'auto',   color: '#6EE7B7', border: 'rgba(29,158,117,.5)',  bg: 'rgba(29,158,117,.12)' },
  suggest:   { label: 'cek',    color: '#FAC775', border: 'rgba(186,117,23,.55)', bg: 'rgba(186,117,23,.14)' },
  unmatched: { label: 'manual', color: '#FCA5A5', border: 'rgba(226,75,74,.5)',   bg: 'rgba(226,75,74,.12)' },
} as const

export default function ImportPejabatModal({ tahun, unitOptions, onClose, onApply }: Props) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [rows, setRows] = useState<PreviewRow[] | null>(null)
  const [mapping, setMapping] = useState<Record<string, string>>({})
  const [warnings, setWarnings] = useState<string[]>([])
  const [source, setSource] = useState('')
  const [mode, setMode] = useState<'replace' | 'merge'>('replace')
  const fileRef = useRef<HTMLInputElement>(null)

  async function handleFile(file: File) {
    setBusy(true)
    setError(null)
    setFileName(file.name)
    const fd = new FormData()
    fd.append('file', file)
    try {
      const res = await fetch('/api/perjanjian-kinerja/pejabat/import', { method: 'POST', body: fd })
      const d = await res.json()
      if (!d.ok) {
        setError(d.message ?? 'Gagal membaca file.')
        setRows(null)
      } else {
        setRows((d.rows as ServerRow[]).map(r => ({
          ...r,
          include: r.unitMatch.status !== 'unmatched' && !!r.nama,
          unitSel: r.unitMatch.canonical ?? '',
        })))
        setMapping(d.mapping ?? {})
        setWarnings(d.warnings ?? [])
        setSource(d.source ?? '')
      }
    } catch {
      setError('Gagal menghubungi server. Coba lagi.')
      setRows(null)
    }
    setBusy(false)
  }

  const included = (rows ?? []).filter(r => r.include)
  const missingUnit = included.filter(r => !r.unitSel).length
  const dupUnits = (() => {
    const seen = new Map<string, number>()
    for (const r of included) if (r.unitSel) seen.set(r.unitSel, (seen.get(r.unitSel) ?? 0) + 1)
    return [...seen.entries()].filter(([, n]) => n > 1).map(([u]) => u)
  })()
  const canApply = included.length > 0 && missingUnit === 0 && dupUnits.length === 0

  function apply() {
    onApply(
      included.map(r => ({
        unit_kerja: r.unitSel,
        nama: r.nama,
        jabatan: r.jabatan,
        pangkat: r.pangkat,
        nip: r.nip,
      })),
      mode,
    )
  }

  const MAPPING_LABELS: Record<string, string> = {
    unit_kerja: 'Unit Kerja', nama: 'Nama', jabatan: 'Jabatan', pangkat: 'Pangkat/Gol', nip: 'NIP',
  }

  return (
    <div onClick={onClose} style={modalBackdrop}>
      <div onClick={e => e.stopPropagation()} style={card}>
        <div style={header}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <FileUp size={18} color="#7C5CFC" />
            <strong style={{ fontSize: 14, color: '#E6F1FB' }}>Import Master Pejabat — Tahun {tahun}</strong>
          </div>
          <button onClick={onClose} style={closeBtn} data-tooltip="Tutup"><X size={16} /></button>
        </div>

        <div style={{ padding: '14px 18px', overflowY: 'auto', flex: 1 }}>
          <input ref={fileRef} type="file" accept=".xlsx,.csv,.docx" style={{ display: 'none' }}
            onChange={e => { const f = e.target.files?.[0]; if (f) void handleFile(f); e.target.value = '' }} />

          {!rows && (
            <button onClick={() => fileRef.current?.click()} disabled={busy} style={dropzone}>
              <Upload size={26} color="#7C5CFC" />
              <span style={{ fontSize: 13, fontWeight: 700, color: '#E6F1FB' }}>
                {busy ? 'Membaca file…' : 'Klik untuk pilih file'}
              </span>
              <span style={{ fontSize: 11.5, color: '#85B7EB' }}>
                Excel (.xlsx) · CSV · Word (.docx berisi tabel) — maks 5MB. Kolom terdeteksi otomatis.
              </span>
            </button>
          )}

          {error && (
            <div style={errBox}><AlertCircle size={15} /> {error}</div>
          )}

          {rows && (
            <>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginBottom: 10 }}>
                <span style={{ fontSize: 11.5, color: '#85B7EB' }}>
                  <strong style={{ color: '#E6F1FB' }}>{fileName}</strong> · {source} · {rows.length} baris
                </span>
                <button onClick={() => { setRows(null); setError(null) }} style={relinkBtn}>ganti file</button>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                {Object.entries(mapping).map(([field, col]) => (
                  <span key={field} style={mapChip}>{col} → {MAPPING_LABELS[field] ?? field}</span>
                ))}
              </div>

              {warnings.map((w, i) => (
                <div key={i} style={warnBox}><AlertCircle size={13} /> {w}</div>
              ))}
              {dupUnits.length > 0 && (
                <div style={errBox}><AlertCircle size={15} /> Unit duplikat tercentang: {dupUnits.join(', ')} — sisakan satu per unit.</div>
              )}
              {missingUnit > 0 && (
                <div style={warnBox}><AlertCircle size={13} /> {missingUnit} baris tercentang belum punya unit kanonik — pilih manual atau hapus centang.</div>
              )}

              <div style={{ overflowX: 'auto', border: '1px solid #0C447C', borderRadius: 8 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: 'rgba(12,68,124,.5)' }}>
                      <th style={thS(30)}>
                        <input type="checkbox" style={checkboxStyle}
                          checked={rows.length > 0 && rows.every(r => r.include)}
                          onChange={() => {
                            const all = rows.every(r => r.include)
                            setRows(rows.map(r => ({ ...r, include: !all })))
                          }} />
                      </th>
                      <th style={thS(170)}>Unit di File</th>
                      <th style={thS(190)}>→ Unit Kanonik</th>
                      <th style={thS(160)}>Nama</th>
                      <th style={thS(150)}>Jabatan</th>
                      <th style={thS(110)}>Pangkat/Gol</th>
                      <th style={thS(140)}>NIP</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => {
                      const ui = STATUS_UI[r.unitSel ? (r.unitSel === r.unitMatch.canonical ? r.unitMatch.status : 'auto') : 'unmatched']
                      return (
                        <tr key={i} style={{ background: r.include ? 'transparent' : 'rgba(2,15,28,.45)', opacity: r.include ? 1 : .55 }}>
                          <td style={{ ...tdS, textAlign: 'center' }}>
                            <input type="checkbox" checked={r.include} style={checkboxStyle}
                              onChange={() => setRows(rows.map((x, j) => j === i ? { ...x, include: !x.include } : x))} />
                          </td>
                          <td style={tdS}>
                            <span style={{ color: '#B5D4F4' }}>{r.unit_file || <em style={{ color: '#85B7EB' }}>(kosong)</em>}</span>
                            {r.warnings.map((w, k) => (
                              <div key={k} style={{ fontSize: 10.5, color: '#FAC775', marginTop: 2 }}>⚠ {w}</div>
                            ))}
                          </td>
                          <td style={tdS}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <select value={r.unitSel}
                                onChange={e => setRows(rows.map((x, j) => j === i ? { ...x, unitSel: e.target.value } : x))}
                                style={{ ...inputStyle, borderColor: ui.border }}>
                                <option value="">— pilih unit —</option>
                                {unitOptions.map(u => (
                                  <option key={u.id} value={u.nama_unit}>{u.nama_unit}</option>
                                ))}
                              </select>
                              <span style={{ ...statusChip, color: ui.color, borderColor: ui.border, background: ui.bg }}
                                data-tooltip={`Skor kecocokan ${(r.unitMatch.score * 100).toFixed(0)}%`}>
                                {ui.label}
                              </span>
                            </div>
                          </td>
                          <td style={tdS}>{r.nama || <em style={{ color: '#FCA5A5' }}>wajib</em>}</td>
                          <td style={tdS}>{r.jabatan}</td>
                          <td style={tdS}>{r.pangkat ?? ''}</td>
                          <td style={{ ...tdS, fontFamily: 'JetBrains Mono, ui-monospace, monospace' }}>{r.nip ?? ''}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <div style={{ display: 'flex', gap: 16, marginTop: 12, flexWrap: 'wrap' }}>
                {([
                  ['replace', 'Ganti semua', 'grid diganti seluruhnya dengan hasil import'],
                  ['merge', 'Gabung', 'unit sama di-update, unit baru ditambahkan'],
                ] as const).map(([val, label, desc]) => (
                  <label key={val} style={{ display: 'flex', alignItems: 'flex-start', gap: 7, cursor: 'pointer', fontSize: 12 }}>
                    <input type="radio" name="pk-import-mode" checked={mode === val}
                      onChange={() => setMode(val)} style={{ marginTop: 2, accentColor: '#EF9F27' }} />
                    <span>
                      <strong style={{ color: '#E6F1FB' }}>{label}</strong>
                      <span style={{ color: '#85B7EB' }}> — {desc}</span>
                    </span>
                  </label>
                ))}
              </div>
            </>
          )}
        </div>

        <div style={footer}>
          <span style={{ fontSize: 11, color: '#85B7EB', marginRight: 'auto' }}>
            {rows ? `${included.length} baris akan diterapkan sebagai draft — klik Simpan setelahnya.` : 'Data tidak langsung tersimpan — selalu lewat preview.'}
          </span>
          <PrimaButton variant="ghost" onClick={onClose}>Batal</PrimaButton>
          {rows && (
            <PrimaButton variant="primary" disabled={!canApply} onClick={apply}>
              Terapkan {included.length > 0 ? `(${included.length})` : ''}
            </PrimaButton>
          )}
        </div>
      </div>
    </div>
  )
}

const card: React.CSSProperties = {
  background: '#042C53', border: '1px solid #185FA5', borderRadius: 14,
  width: '100%', maxWidth: 1060, maxHeight: '86vh', display: 'flex', flexDirection: 'column',
  boxShadow: '0 24px 48px rgba(0,0,0,.5)',
}
const header: React.CSSProperties = {
  padding: '14px 18px', borderBottom: '1px solid rgba(255,255,255,.08)',
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
}
const footer: React.CSSProperties = {
  padding: '10px 18px 14px', borderTop: '1px solid rgba(127,127,127,.18)',
  display: 'flex', alignItems: 'center', gap: 8,
}
const closeBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  width: 28, height: 28, borderRadius: 6,
  background: 'transparent', color: '#B5D4F4', border: '1px solid rgba(181,212,244,.25)',
  cursor: 'pointer',
}
const dropzone: React.CSSProperties = {
  width: '100%', padding: '38px 16px', borderRadius: 10,
  border: '2px dashed rgba(124,92,252,.45)', background: 'rgba(124,92,252,.06)',
  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, cursor: 'pointer',
}
const errBox: React.CSSProperties = {
  margin: '10px 0', padding: '9px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
  display: 'flex', alignItems: 'center', gap: 7,
  background: 'rgba(226,75,74,.15)', border: '1px solid rgba(226,75,74,.4)', color: '#FCA5A5',
}
const warnBox: React.CSSProperties = {
  margin: '0 0 8px', padding: '7px 10px', borderRadius: 8, fontSize: 11.5,
  display: 'flex', alignItems: 'center', gap: 6,
  background: 'rgba(186,117,23,.13)', border: '1px solid rgba(186,117,23,.4)', color: '#FAC775',
}
const mapChip: React.CSSProperties = {
  padding: '3px 9px', borderRadius: 20, fontSize: 10.5, fontWeight: 700,
  background: 'rgba(124,92,252,.15)', border: '1px solid rgba(124,92,252,.35)', color: '#C4B5FD',
}
const statusChip: React.CSSProperties = {
  padding: '2px 7px', borderRadius: 20, fontSize: 9.5, fontWeight: 800,
  letterSpacing: '.4px', textTransform: 'uppercase', border: '1px solid', whiteSpace: 'nowrap',
}
const relinkBtn: React.CSSProperties = {
  padding: '2px 9px', borderRadius: 14, fontSize: 10.5, fontWeight: 700, cursor: 'pointer',
  background: 'transparent', border: '1px solid rgba(181,212,244,.35)', color: '#B5D4F4',
}
function thS(minWidth: number): React.CSSProperties {
  return {
    padding: '8px 10px', textAlign: 'left',
    fontSize: 10, fontWeight: 800, letterSpacing: '.6px', textTransform: 'uppercase',
    color: '#FAC775', borderBottom: '1px solid #0C447C', minWidth, whiteSpace: 'nowrap',
  }
}
const tdS: React.CSSProperties = {
  padding: '6px 10px', borderBottom: '1px solid rgba(12,68,124,.5)',
  verticalAlign: 'top', color: '#E6F1FB',
}
