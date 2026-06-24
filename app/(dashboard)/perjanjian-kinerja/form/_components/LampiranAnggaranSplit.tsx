'use client'
// Lampiran (kiri) + Anggaran (kanan) split panel — GAS-style A.
// LAMPIRAN: level dikunci dari unit Pihak Pertama, 1 picker aktif per level,
//           indikator+target auto-fill readonly dari Master Sasaran,
//           auto-detect parent (sub → program+kegiatan otomatis).
// ANGGARAN: cascading 3 dropdown dengan visibility toggle per level, keterangan
//           dropdown SUMBER_DANA, tombol 🖉 router (A2 mode):
//           - keterangan=BLUD → auto-fill nominal langsung
//           - keterangan lain → prompt "Tambah BLUD ke nominal?" → fetch+jumlahkan

import { useState, useMemo, type Dispatch, type SetStateAction } from 'react'
import { Plus, Sparkles, Pencil, Loader2, Info } from 'lucide-react'
import DeleteIcon from '@/components/ui/DeleteIcon'
import { confirmDialog } from '@/components/ui/ConfirmDialog'
import { fetchJson } from '@/lib/shared/api'
import PrimaButton from '@/components/ui/PrimaButton'
import { pkMono as mono } from '@/lib/shared/pk-styles'
import type { PkProgramHierarchy, PkSasaranRow, PkLevel, PkUnitKerja } from '../../_utils/pk-types'
import { fmtRp } from '../../_utils/pk-format'
import type { PkFormState, LampiranRow, AnggaranRow } from '../_types'
import { genRowId, SUMBER_DANA } from '../_types'

interface Props {
  form: PkFormState
  setForm: Dispatch<SetStateAction<PkFormState>>
  units: PkUnitKerja[]
  hierarchy: PkProgramHierarchy | null
  sasaranRows: PkSasaranRow[]
  disabled: boolean
}

// ─── Level helpers ────────────────────────────────────────────────────────
const LEVEL_LABEL: Record<PkLevel, string> = {
  program: 'PROGRAM',
  kegiatan: 'KEGIATAN',
  subkegiatan: 'SUB-KEG',
}
const LEVEL_COLOR: Record<PkLevel, string> = {
  program: '#3B82F6',
  kegiatan: '#10B981',
  subkegiatan: '#EF9F27',
}
// Label khusus panel LAMPIRAN — sumber data = Master Sasaran (bukan Master Program)
const SASARAN_LABEL: Record<PkLevel, string> = {
  program: 'Sasaran Program',
  kegiatan: 'Sasaran Kegiatan',
  subkegiatan: 'Sasaran Sub Kegiatan',
}

export default function LampiranAnggaranSplit({
  form, setForm, units, hierarchy, sasaranRows, disabled,
}: Props) {
  // Level dikunci dari Pihak Pertama — auto-detect via units lookup
  const unitLevel: PkLevel | null = useMemo(() => {
    if (!form.unit_pertama) return null
    const u = units.find(x => x.nama_unit === form.unit_pertama)
    return u?.level ?? null
  }, [units, form.unit_pertama])

  if (!form.unit_pertama) {
    return (
      <div style={emptyHero}>
        <Info size={28} style={{ color: '#FAC775', marginBottom: 8 }} />
        <div style={{ fontSize: 14, fontWeight: 700, color: '#E6F1FB', marginBottom: 4 }}>
          Pilih Pihak Pertama dulu
        </div>
        <div style={{ fontSize: 12, color: '#85B7EB', lineHeight: 1.6 }}>
          Lampiran &amp; Anggaran mengikuti unit kerja Pihak Pertama (Bawahan).<br />
          Buka tab <strong>Pihak Pertama</strong> dan pilih unit kerja terlebih dahulu.
        </div>
      </div>
    )
  }

  if (!unitLevel) {
    return (
      <div style={emptyHero}>
        <Info size={28} style={{ color: '#FCA5A5', marginBottom: 8 }} />
        <div style={{ fontSize: 14, fontWeight: 700, color: '#E6F1FB', marginBottom: 4 }}>
          Unit kerja tidak terdaftar di Master Unit
        </div>
        <div style={{ fontSize: 12, color: '#85B7EB', lineHeight: 1.6 }}>
          Unit <strong style={{ color: '#FAC775' }}>{form.unit_pertama}</strong> tidak ditemukan di tabel
          <code style={mono}>pk_unit_kerja</code>. Hubungi admin untuk tambahkan.
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 14 }}>
      <LampiranPanel
        form={form} setForm={setForm}
        unitLevel={unitLevel}
        sasaranRows={sasaranRows}
        disabled={disabled}
      />
      <AnggaranPanel
        form={form} setForm={setForm}
        unitLevel={unitLevel}
        hierarchy={hierarchy}
        disabled={disabled}
      />
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// LAMPIRAN PANEL — 1 picker per level, auto-detect parent, indikator/target readonly
// ═══════════════════════════════════════════════════════════════════════════
interface LampiranPanelProps {
  form: PkFormState
  setForm: Dispatch<SetStateAction<PkFormState>>
  unitLevel: PkLevel
  sasaranRows: PkSasaranRow[]
  disabled: boolean
}

function LampiranPanel({
  form, setForm, unitLevel, sasaranRows, disabled,
}: LampiranPanelProps) {
  // Picker tunggal — value = index opsi unik dari sasaranRows (string)
  const [pickKey, setPickKey] = useState('')

  // Build opsi dari Master Sasaran sesuai level — dedupe by composite key, keep 1st row utk indikator/target
  const options = useMemo(() => {
    const seen = new Set<string>()
    const out: { key: string; label: string; row: PkSasaranRow }[] = []
    sasaranRows.forEach((r, i) => {
      if (r._deleted) return
      const label = unitLevel === 'program' ? r.program
        : unitLevel === 'kegiatan' ? (r.kegiatan ?? '')
        : (r.subkegiatan ?? '')
      if (!label || !label.trim()) return
      const dedupe = unitLevel === 'program'
        ? label
        : unitLevel === 'kegiatan'
          ? `${r.program}||${label}`
          : `${r.program}||${r.kegiatan ?? ''}||${label}`
      if (seen.has(dedupe)) return
      seen.add(dedupe)
      out.push({ key: `${i}`, label, row: r })
    })
    return out.sort((a, b) => a.label.localeCompare(b.label, 'id'))
  }, [sasaranRows, unitLevel])

  // Resolve dari opsi terpilih — semua field (parent + indikator + target) datang dari 1 row Master Sasaran
  const resolved = useMemo(() => {
    if (!pickKey) return null
    const opt = options.find(o => o.key === pickKey)
    if (!opt) return null
    const r = opt.row
    if (unitLevel === 'program') {
      return { program: r.program, kegiatan: null, subkegiatan: null, indikator: r.indikator_program, target: r.target_program, uraian: r.program }
    }
    if (unitLevel === 'kegiatan') {
      return { program: r.program, kegiatan: r.kegiatan, subkegiatan: null, indikator: r.indikator_kegiatan, target: r.target_kegiatan, uraian: r.kegiatan ?? '' }
    }
    return { program: r.program, kegiatan: r.kegiatan, subkegiatan: r.subkegiatan, indikator: r.indikator_subkegiatan, target: r.target_subkegiatan, uraian: r.subkegiatan ?? '' }
  }, [pickKey, options, unitLevel])

  function handleAdd() {
    if (!resolved || !resolved.uraian) return
    const newRow: LampiranRow = {
      _id: genRowId(),
      unit_kerja: form.unit_pertama,
      level: unitLevel,
      program: resolved.program,
      kegiatan: resolved.kegiatan,
      subkegiatan: resolved.subkegiatan,
      uraian: resolved.uraian,
      indikator: resolved.indikator,
      target: resolved.target,
      urutan: form.lampiran.length,
    }
    setForm(f => ({ ...f, lampiran: [...f.lampiran, newRow] }))
    setPickKey('')
  }

  function handleDelete(idx: number) {
    setForm(f => ({ ...f, lampiran: f.lampiran.filter((_, i) => i !== idx) }))
  }

  const activeRows = form.lampiran.filter(r => !r._deleted)
  const levelColor = LEVEL_COLOR[unitLevel]

  return (
    <div style={panelStyle}>
      <PanelHeader title="LAMPIRAN — Sasaran Kinerja" badge={`${activeRows.length} baris`} color="#10B981" />

      {/* Form atas — picker tunggal */}
      <div style={formAtasStyle}>
        <Field label="Unit Kerja" hint="Mengikuti Pihak Pertama (level dikunci)">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', background: 'rgba(2,15,28,.45)', border: '1px solid rgba(24,95,165,.4)', borderRadius: 6 }}>
            <span style={{ fontSize: 12, color: '#E6F1FB', flex: 1 }}>{form.unit_pertama}</span>
            <LevelBadge level={unitLevel} />
          </div>
        </Field>

        <Field label={SASARAN_LABEL[unitLevel].toUpperCase()}>
          <select disabled={disabled}
            value={pickKey}
            onChange={e => setPickKey(e.target.value)}
            style={inputStyle}>
            <option value="">— pilih {SASARAN_LABEL[unitLevel]} —</option>
            {options.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>
          {options.length === 0 && (
            <span style={{ fontSize: 10, color: '#FCA5A5', marginTop: 2 }}>
              Master Sasaran belum punya baris dengan {SASARAN_LABEL[unitLevel]}.
            </span>
          )}
        </Field>

        {/* Parent breadcrumb (kalau level=kegiatan/subkegiatan, tampil program+keg parent dari Master Sasaran) */}
        {resolved && unitLevel !== 'program' && (
          <div style={{ fontSize: 10.5, color: '#85B7EB', padding: '0 2px', lineHeight: 1.5 }}>
            <span style={{ color: '#6B7280' }}>Parent: </span>
            <span style={{ fontWeight: 600, color: '#B5D4F4' }}>{resolved.program ?? '?'}</span>
            {resolved.kegiatan && unitLevel === 'subkegiatan' && (
              <>
                <span style={{ color: '#6B7280' }}> → </span>
                <span style={{ fontWeight: 600, color: '#B5D4F4' }}>{resolved.kegiatan}</span>
              </>
            )}
          </div>
        )}

        <Field label="Indikator (auto-fill dari Master Sasaran)">
          <input type="text" readOnly value={resolved?.indikator ?? ''}
            placeholder={pickKey ? '— tidak ada di Master Sasaran —' : '— pilih item dulu —'}
            style={{ ...inputStyle, background: 'rgba(2,15,28,.7)', color: resolved?.indikator ? '#E6F1FB' : '#85B7EB', cursor: 'default' }} />
        </Field>
        <Field label="Target (auto-fill dari Master Sasaran)">
          <input type="text" readOnly value={resolved?.target ?? ''}
            placeholder={pickKey ? '— tidak ada di Master Sasaran —' : '— pilih item dulu —'}
            style={{ ...inputStyle, background: 'rgba(2,15,28,.7)', color: resolved?.target ? '#E6F1FB' : '#85B7EB', cursor: 'default' }} />
        </Field>

        <PrimaButton variant="success" onClick={handleAdd} disabled={disabled || !pickKey} iconLeft={<Plus size={13} />}>
          Tambah Lampiran
        </PrimaButton>
      </div>

      {/* List cards */}
      {activeRows.length === 0 ? (
        <EmptyState text="Belum ada lampiran. Pilih item di atas lalu klik Tambah." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
          {form.lampiran.map((r, idx) => r._deleted ? null : (
            <RowCard key={r._id ?? idx} idx={idx + 1} accent={levelColor}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: '#E6F1FB', marginBottom: 2 }}>
                    {r.uraian}
                  </div>
                  <div style={{ fontSize: 10.5, color: '#85B7EB', lineHeight: 1.5 }}>
                    {r.program && <><span style={{ color: '#FAC775' }}>{r.program}</span></>}
                    {r.kegiatan && <> → <span style={{ color: '#FAC775' }}>{r.kegiatan}</span></>}
                  </div>
                  <div style={{ fontSize: 11, color: '#B5D4F4', marginTop: 4, lineHeight: 1.4 }}>
                    <span style={{ color: '#85B7EB' }}>Indikator: </span>
                    {r.indikator || <em style={{ color: '#FCA5A5' }}>kosong</em>}
                  </div>
                  <div style={{ fontSize: 11, color: '#B5D4F4', lineHeight: 1.4 }}>
                    <span style={{ color: '#85B7EB' }}>Target: </span>
                    {r.target || <em style={{ color: '#FCA5A5' }}>kosong</em>}
                  </div>
                </div>
                <button onClick={() => handleDelete(idx)} disabled={disabled}
                  data-tooltip="Hapus" data-tooltip-pos="left"
                  style={btnIconDanger(disabled)}>
                  <DeleteIcon size={12} />
                </button>
              </div>
            </RowCard>
          ))}
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// ANGGARAN PANEL — cascading dropdown per level + keterangan + nominal + 🖉 router
// ═══════════════════════════════════════════════════════════════════════════
interface AnggaranPanelProps {
  form: PkFormState
  setForm: Dispatch<SetStateAction<PkFormState>>
  unitLevel: PkLevel
  hierarchy: PkProgramHierarchy | null
  disabled: boolean
}

function AnggaranPanel({
  form, setForm, unitLevel, hierarchy, disabled,
}: AnggaranPanelProps) {
  // Form atas state
  const [programPick, setProgramPick] = useState('')
  const [kegiatanPick, setKegiatanPick] = useState('')
  const [subkegPick, setSubkegPick] = useState('')
  const [keterangan, setKeterangan] = useState<string>('BLUD')
  const [nominal, setNominal] = useState<number>(0)
  const [bludLoading, setBludLoading] = useState(false)
  const [autoFilledFromBlud, setAutoFilledFromBlud] = useState(false)
  const [hint, setHint] = useState<string>('')

  // Visibility per level
  const showProgram  = true
  const showKegiatan = unitLevel === 'kegiatan' || unitLevel === 'subkegiatan'
  const showSubkeg   = unitLevel === 'subkegiatan'

  // Cascading options
  const programs = hierarchy?.programs ?? []
  const kegiatanOpts = programPick ? (hierarchy?.kegiatanByProgram[programPick] ?? []) : []
  const subkegOpts = programPick && kegiatanPick
    ? (hierarchy?.subByKegiatan[`${programPick}||${kegiatanPick}`] ?? [])
    : []

  function resetForm() {
    setProgramPick('')
    setKegiatanPick('')
    setSubkegPick('')
    setKeterangan('BLUD')
    setNominal(0)
    setAutoFilledFromBlud(false)
    setHint('')
  }

  function onProgramChange(v: string) {
    setProgramPick(v); setKegiatanPick(''); setSubkegPick('')
  }
  function onKegiatanChange(v: string) {
    setKegiatanPick(v); setSubkegPick('')
  }

  // Validate sebelum tambah
  function validateAdd(): string | null {
    if (!programPick) return 'Pilih Program dulu.'
    if (showKegiatan && !kegiatanPick) return 'Pilih Kegiatan dulu.'
    if (showSubkeg && !subkegPick) return 'Pilih Sub Kegiatan dulu.'
    if (!keterangan) return 'Pilih Keterangan dulu.'
    return null
  }

  function handleAdd() {
    const err = validateAdd()
    if (err) { setHint(err); return }
    const uraian = subkegPick || kegiatanPick || programPick
    const newRow: AnggaranRow = {
      _id: genRowId(),
      unit_kerja: form.unit_pertama,
      level: unitLevel,
      program: programPick || null,
      kegiatan: kegiatanPick || null,
      subkegiatan: subkegPick || null,
      uraian,
      keterangan_sumber: keterangan,
      nominal: Math.max(0, Number(nominal) || 0),
      urutan: form.anggaran.length,
      auto_filled_from_blud: autoFilledFromBlud,
    }
    setForm(f => ({ ...f, anggaran: [...f.anggaran, newRow] }))
    resetForm()
  }

  function handleDelete(idx: number) {
    setForm(f => ({ ...f, anggaran: f.anggaran.filter((_, i) => i !== idx) }))
  }

  // Pencil router (A2):
  // - keterangan=BLUD → auto-fill langsung
  // - keterangan lain → prompt "Tambah BLUD ke nominal saat ini?"
  async function handlePencilClick() {
    if (!form.unit_pertama) return
    setHint('')
    if (keterangan === 'BLUD') {
      setBludLoading(true)
      const d = await fetchJson<unknown>(`/api/perjanjian-kinerja/blud-nominal?unit=${encodeURIComponent(form.unit_pertama)}`)
      setBludLoading(false)
      if (d.ok) {
        const r = d as unknown as { nominal: number }
        setNominal(r.nominal ?? 0)
        setAutoFilledFromBlud(true)
        setHint(`BLUD auto-fill: ${fmtRp(r.nominal ?? 0)}`)
      } else {
        setHint(d.message)
      }
    } else {
      // Prompt user
      const ok = await confirmDialog({ title: 'Tambah Nominal BLUD', message: `Tambahkan nominal BLUD aggregate ke nominal saat ini (${fmtRp(nominal)})?\n\nKeterangan akan tetap "${keterangan}".`, confirmLabel: 'Tambah', variant: 'success' })
      if (!ok) return
      setBludLoading(true)
      const d = await fetchJson<unknown>(`/api/perjanjian-kinerja/blud-nominal?unit=${encodeURIComponent(form.unit_pertama)}`)
      setBludLoading(false)
      if (d.ok) {
        const r = d as unknown as { nominal: number }
        const blud = r.nominal ?? 0
        const total = (Number(nominal) || 0) + blud
        setNominal(total)
        setAutoFilledFromBlud(true)
        setHint(`BLUD terambil: ${fmtRp(blud)} → Total: ${fmtRp(total)}`)
      } else {
        setHint(d.message)
      }
    }
  }

  const activeRows = form.anggaran.filter(r => !r._deleted)
  const totalNominal = activeRows.reduce((s, r) => s + (Number(r.nominal) || 0), 0)
  const levelColor = LEVEL_COLOR[unitLevel]

  return (
    <div style={panelStyle}>
      <PanelHeader title="ANGGARAN" badge={`${activeRows.length} baris · ${fmtRp(totalNominal)}`} color="#EF9F27" />

      {/* Form atas */}
      <div style={formAtasStyle}>
        <Field label="Unit Kerja" hint="Mengikuti Pihak Pertama">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', background: 'rgba(2,15,28,.45)', border: '1px solid rgba(24,95,165,.4)', borderRadius: 6 }}>
            <span style={{ fontSize: 12, color: '#E6F1FB', flex: 1 }}>{form.unit_pertama}</span>
            <LevelBadge level={unitLevel} />
          </div>
        </Field>

        {showProgram && (
          <Field label="PROGRAM">
            <select disabled={disabled} value={programPick} onChange={e => onProgramChange(e.target.value)} style={inputStyle}>
              <option value="">— pilih program —</option>
              {programs.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </Field>
        )}
        {showKegiatan && (
          <Field label="KEGIATAN">
            <select disabled={disabled || !programPick} value={kegiatanPick} onChange={e => onKegiatanChange(e.target.value)} style={inputStyle}>
              <option value="">— pilih kegiatan —</option>
              {kegiatanOpts.map(k => <option key={k} value={k}>{k}</option>)}
            </select>
          </Field>
        )}
        {showSubkeg && (
          <Field label="SUB KEGIATAN">
            <select disabled={disabled || !kegiatanPick} value={subkegPick} onChange={e => setSubkegPick(e.target.value)} style={inputStyle}>
              <option value="">— pilih sub-kegiatan —</option>
              {subkegOpts.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
        )}

        <Field label="KETERANGAN (Sumber Dana)">
          <select disabled={disabled} value={keterangan} onChange={e => { setKeterangan(e.target.value); setAutoFilledFromBlud(false) }} style={inputStyle}>
            {SUMBER_DANA.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </Field>

        <Field label="NOMINAL (Rp)">
          <div style={{ display: 'flex', gap: 6 }}>
            <input type="text" inputMode="numeric" disabled={disabled}
              value={nominal > 0 ? nominal.toLocaleString('id-ID') : ''}
              onChange={e => {
                // Strip semua non-digit → parse → format id-ID di-handle via value above
                const digits = e.target.value.replace(/\D/g, '')
                setNominal(digits ? Number(digits) : 0)
                setAutoFilledFromBlud(false)
              }}
              placeholder="0"
              style={{ ...inputStyle, flex: 1, fontFamily: 'JetBrains Mono, ui-monospace, monospace', textAlign: 'right' }} />
            <button onClick={handlePencilClick} disabled={disabled || bludLoading || !form.unit_pertama}
              data-tooltip={keterangan === 'BLUD' ? 'Auto-fill nominal dari rekap BLUD' : `Tambah BLUD ke nominal "${keterangan}" saat ini`}
              data-tooltip-pos="left"
              style={btnIconAccent(disabled || bludLoading, '#EF9F27')}>
              {bludLoading ? <Loader2 size={13} style={{ animation: 'pk-spin 1s linear infinite' }} /> : <Pencil size={13} />}
            </button>
          </div>
        </Field>

        {hint && (
          <div style={{
            fontSize: 10.5, color: hint.includes('Rp') ? '#6EE7B7' : '#FCA5A5',
            padding: '6px 10px', borderRadius: 5,
            background: hint.includes('Rp') ? 'rgba(29,158,117,.10)' : 'rgba(226,75,74,.10)',
            border: `1px solid ${hint.includes('Rp') ? 'rgba(29,158,117,.3)' : 'rgba(226,75,74,.3)'}`,
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            {hint.includes('Rp') && <Sparkles size={11} />} {hint}
          </div>
        )}

        <PrimaButton variant="success" onClick={handleAdd} disabled={disabled} iconLeft={<Plus size={13} />}>
          Tambah Anggaran
        </PrimaButton>
      </div>

      {/* List cards */}
      {activeRows.length === 0 ? (
        <EmptyState text="Belum ada anggaran. Isi form di atas lalu klik Tambah." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
          {form.anggaran.map((r, idx) => r._deleted ? null : (
            <RowCard key={r._id ?? idx} idx={idx + 1} accent={levelColor}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: '#E6F1FB', marginBottom: 2 }}>
                    {r.uraian}
                  </div>
                  <div style={{ fontSize: 10.5, color: '#85B7EB', lineHeight: 1.5 }}>
                    {r.program && <span style={{ color: '#FAC775' }}>{r.program}</span>}
                    {r.kegiatan && <> → <span style={{ color: '#FAC775' }}>{r.kegiatan}</span></>}
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}>
                    <span style={{
                      fontSize: 10, fontWeight: 800, letterSpacing: '.4px',
                      padding: '2px 6px', borderRadius: 4,
                      background: 'rgba(59,130,246,.18)', color: '#93C5FD',
                      border: '1px solid rgba(59,130,246,.3)',
                    }}>{r.keterangan_sumber}</span>
                    <span style={{
                      fontSize: 12, fontWeight: 800,
                      fontFamily: 'JetBrains Mono, ui-monospace, monospace',
                      color: r.nominal > 0 ? '#FAC775' : '#85B7EB',
                    }}>
                      {r.nominal > 0 ? fmtRp(r.nominal) : '—'}
                    </span>
                    {r.auto_filled_from_blud && (
                      <span style={{
                        fontSize: 9.5, fontWeight: 700, padding: '1px 6px', borderRadius: 4,
                        background: 'rgba(239,159,39,.15)', color: '#FAC775',
                        display: 'inline-flex', alignItems: 'center', gap: 3,
                      }}>
                        <Sparkles size={9} /> BLUD auto
                      </span>
                    )}
                  </div>
                </div>
                <button onClick={() => handleDelete(idx)} disabled={disabled}
                  data-tooltip="Hapus" data-tooltip-pos="left"
                  style={btnIconDanger(disabled)}>
                  <DeleteIcon size={12} />
                </button>
              </div>
            </RowCard>
          ))}
        </div>
      )}

      <style>{`@keyframes pk-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

// ═══ Shared sub-components ════════════════════════════════════════════════
function PanelHeader({ title, badge, color }: { title: string; badge: string; color: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, paddingBottom: 10, borderBottom: '1px solid rgba(12,68,124,.5)' }}>
      <div>
        <div style={{ fontSize: 12, fontWeight: 800, color, letterSpacing: '.4px' }}>{title}</div>
        <div style={{ fontSize: 10.5, color: '#85B7EB', fontFamily: 'JetBrains Mono, ui-monospace, monospace', fontWeight: 600, marginTop: 2 }}>{badge}</div>
      </div>
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 10.5, fontWeight: 700, color: '#FAC775', letterSpacing: '.4px', textTransform: 'uppercase' }}>{label}</span>
      {children}
      {hint && <span style={{ fontSize: 10, color: '#85B7EB', marginTop: 1 }}>{hint}</span>}
    </label>
  )
}

function LevelBadge({ level }: { level: PkLevel }) {
  const color = LEVEL_COLOR[level]
  return (
    <span style={{
      display: 'inline-block', padding: '2px 7px', borderRadius: 4,
      fontSize: 9.5, fontWeight: 800, letterSpacing: '.5px',
      background: `${color}22`, color, border: `1px solid ${color}55`,
      fontFamily: 'JetBrains Mono, ui-monospace, monospace', flexShrink: 0,
    }}>{LEVEL_LABEL[level]}</span>
  )
}

function RowCard({ children, idx, accent }: { children: React.ReactNode; idx: number; accent: string }) {
  return (
    <div style={{
      padding: 10, borderRadius: 8,
      background: 'rgba(2,15,28,.4)',
      border: '1px solid rgba(12,68,124,.6)',
      position: 'relative',
    }}>
      <div style={{
        position: 'absolute', top: -7, left: 10,
        background: accent, color: '#020F1C',
        fontSize: 9.5, fontWeight: 800, padding: '1px 7px', borderRadius: 4,
        fontFamily: 'JetBrains Mono, ui-monospace, monospace',
      }}>#{idx}</div>
      {children}
    </div>
  )
}

function EmptyState({ text }: { text: string }) {
  return (
    <div style={{
      padding: '24px 16px', textAlign: 'center', color: '#85B7EB', fontSize: 11.5, lineHeight: 1.6,
      marginTop: 10, border: '1px dashed rgba(12,68,124,.5)', borderRadius: 8,
    }}>
      {text}
    </div>
  )
}

// ═══ Styles ════════════════════════════════════════════════════════════════
const panelStyle: React.CSSProperties = {
  background: 'rgba(2,15,28,.3)',
  border: '1px solid rgba(12,68,124,.6)',
  borderRadius: 10, padding: 12,
}

const formAtasStyle: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 10,
  padding: 12, borderRadius: 8,
  background: 'rgba(12,68,124,.18)',
  border: '1px solid rgba(24,95,165,.3)',
}

const emptyHero: React.CSSProperties = {
  textAlign: 'center', padding: '40px 16px',
  background: 'rgba(2,15,28,.4)', border: '1px dashed rgba(24,95,165,.4)',
  borderRadius: 12,
}

const inputStyle: React.CSSProperties = {
  background: 'rgba(2,15,28,.45)',
  border: '1px solid rgba(24,95,165,.4)', borderRadius: 6,
  padding: '7px 10px', color: '#E6F1FB', fontSize: 12,
  fontFamily: 'inherit', outline: 'none', width: '100%',
  transition: 'border-color .15s',
}


function btnIconDanger(d: boolean): React.CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    width: 24, height: 24, borderRadius: 5,
    background: 'rgba(226,75,74,.15)', color: '#FCA5A5',
    border: '1px solid rgba(226,75,74,.4)',
    cursor: d ? 'not-allowed' : 'pointer', opacity: d ? 0.5 : 1, transition: 'all .15s',
  }
}
function btnIconAccent(d: boolean, color: string): React.CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    width: 36, height: 36, borderRadius: 6,
    background: `${color}22`, color, border: `1px solid ${color}55`,
    cursor: d ? 'not-allowed' : 'pointer', opacity: d ? 0.5 : 1, transition: 'all .15s',
    flexShrink: 0,
  }
}
