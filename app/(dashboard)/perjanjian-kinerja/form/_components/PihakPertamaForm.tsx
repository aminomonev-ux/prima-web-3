'use client'
// Pihak Pertama = BAWAHAN (yang bersangkutan, ada tanggal dokumen) — Q3 user.

import type { Dispatch, SetStateAction } from 'react'
import { pkInputForm as inputStyle, pkBadge as badge } from '@/lib/shared/pk-styles'
import type { PkUnitKerja } from '../../_utils/pk-types'
import type { PkFormState } from '../_types'

type PejabatStatus = 'idle' | 'loading' | 'found' | 'notfound'

interface Props {
  form: PkFormState
  setForm: Dispatch<SetStateAction<PkFormState>>
  units: PkUnitKerja[]
  disabled: boolean
  onUnitChange: (newUnit: string) => void
  pejabatStatus?: PejabatStatus
}

export default function PihakPertamaForm({ form, setForm, units, disabled, onUnitChange, pejabatStatus = 'idle' }: Props) {
  // Filter unit yang bisa muncul sebagai Pihak Pertama (exclude Direktur)
  const selectable = units.filter(u => u.selectable_as_pertama && u.active)

  function setField<K extends keyof PkFormState>(key: K, val: PkFormState[K]) {
    setForm(f => ({ ...f, [key]: val }))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 2 }}>
        <div style={{
          width: 36, height: 36, borderRadius: 10,
          background: 'rgba(59,130,246,.18)', color: '#3B82F6',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 800,
        }}>1</div>
        <div>
          <div style={{ fontSize: 15, fontWeight: 800, color: '#E6F1FB' }}>Pihak Pertama (Bawahan)</div>
          <div style={{ fontSize: 11.5, color: '#85B7EB' }}>Yang bersangkutan — pembuat janji kinerja</div>
        </div>
      </div>

      {/* Row 1: Jenis PK + Tanggal */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <Field label="Jenis Perjanjian Kinerja">
          <div style={{ display: 'flex', gap: 8 }}>
            <RadioPill
              checked={form.jenis_pk === 'MURNI'}
              onClick={() => setField('jenis_pk', 'MURNI')}
              disabled={disabled}
              color="#3B82F6">MURNI</RadioPill>
            <RadioPill
              checked={form.jenis_pk === 'PERUBAHAN'}
              onClick={() => setField('jenis_pk', 'PERUBAHAN')}
              disabled={disabled}
              color="#8B5CF6">PERUBAHAN</RadioPill>
          </div>
        </Field>

        <Field label="Tanggal Dokumen *">
          <input
            type="date"
            disabled={disabled}
            value={form.tanggal_dokumen}
            onChange={e => setField('tanggal_dokumen', e.target.value)}
            style={inputStyle}
          />
        </Field>
      </div>

      {/* Row 2: Unit kerja */}
      <Field label="Unit Kerja *" hint="Pilih unit kerja untuk auto-fill nama/jabatan/NIP dari Master Pejabat">
        <select
          disabled={disabled}
          value={form.unit_pertama}
          onChange={e => onUnitChange(e.target.value)}
          style={inputStyle}
        >
          <option value="">— pilih unit —</option>
          {selectable.map(u => (
            <option key={u.id} value={u.nama_unit}>
              {u.nama_unit} ({u.level})
            </option>
          ))}
        </select>
        <PejabatStatusBadge status={pejabatStatus} unit={form.unit_pertama} tahun={form.tahun} />
      </Field>

      {/* Row 3-4: Pejabat data (auto-fill but editable as fallback) */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 14 }}>
        <Field label="Nama *">
          <input type="text" disabled={disabled}
            value={form.nama_pertama}
            onChange={e => setField('nama_pertama', e.target.value)}
            placeholder="Nama lengkap" style={inputStyle} />
        </Field>
        <Field label="NIP">
          <input type="text" disabled={disabled}
            value={form.nip_pertama}
            onChange={e => setField('nip_pertama', e.target.value)}
            placeholder="18 digit" style={{ ...inputStyle, fontFamily: 'JetBrains Mono, ui-monospace, monospace' }} />
        </Field>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 14 }}>
        <Field label="Jabatan *">
          <input type="text" disabled={disabled}
            value={form.jabatan_pertama}
            onChange={e => setField('jabatan_pertama', e.target.value)}
            placeholder="Jabatan struktural/fungsional" style={inputStyle} />
        </Field>
        <Field label="Pangkat/Golongan">
          <input type="text" disabled={disabled}
            value={form.pangkat_pertama}
            onChange={e => setField('pangkat_pertama', e.target.value)}
            placeholder="cth. Pembina, IV/a" style={inputStyle} />
        </Field>
      </div>

      <p style={{ fontSize: 11, color: '#85B7EB', margin: 0, lineHeight: 1.6 }}>
        💡 Setelah pilih Unit Kerja, sistem akan auto-fill data pejabat dari Master Pejabat tahun {form.tahun}.
        Kalau belum ada master pejabat untuk unit ini, isi manual.
      </p>
    </div>
  )
}

function PejabatStatusBadge({ status, unit, tahun }: { status: PejabatStatus; unit: string; tahun: string }) {
  if (status === 'idle' || !unit) return null
  if (status === 'loading') return (
    <div style={{ ...badge, background: 'rgba(133,183,235,.12)', color: '#85B7EB', borderColor: 'rgba(133,183,235,.3)' }}>
      ⏳ Mencari pejabat di Master…
    </div>
  )
  if (status === 'found') return (
    <div style={{ ...badge, background: 'rgba(29,158,117,.12)', color: '#6EE7B7', borderColor: 'rgba(29,158,117,.4)' }}>
      ✓ Auto-fill dari Master Pejabat
    </div>
  )
  // notfound
  return (
    <div style={{ ...badge, background: 'rgba(239,159,39,.12)', color: '#FAC775', borderColor: 'rgba(239,159,39,.4)' }}>
      ⚠ Master Pejabat <strong>{unit}</strong> tahun <strong>{tahun}</strong> belum ada — isi manual atau tambah dulu di menu Master Pejabat
    </div>
  )
}


function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: '#FAC775', letterSpacing: '.4px', textTransform: 'uppercase' }}>{label}</span>
      {children}
      {hint && <span style={{ fontSize: 10.5, color: '#85B7EB', marginTop: 2 }}>{hint}</span>}
    </label>
  )
}

function RadioPill({
  checked, onClick, disabled, color, children,
}: { checked: boolean; onClick: () => void; disabled: boolean; color: string; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      style={{
        flex: 1, padding: '8px 14px', borderRadius: 6,
        border: `1.5px solid ${checked ? color : 'rgba(24,95,165,.4)'}`,
        background: checked ? `linear-gradient(135deg, ${color}33, ${color}11)` : 'rgba(2,15,28,.45)',
        color: checked ? color : '#B5D4F4',
        fontWeight: checked ? 800 : 600, fontSize: 12, fontFamily: 'inherit',
        cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1,
        transition: 'all .15s',
      }}>{children}</button>
  )
}

