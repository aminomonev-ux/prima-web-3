'use client'
// Pihak Kedua = ATASAN (auto-suggest dari Pihak 1, override-able). Q3 user.

import type { Dispatch, SetStateAction } from 'react'
import { Sparkles } from 'lucide-react'
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

export default function PihakKeduaForm({ form, setForm, units, disabled, onUnitChange, pejabatStatus = 'idle' }: Props) {
  // Atasan boleh siapa saja (termasuk Direktur), tapi exclude diri sendiri
  const selectable = units.filter(u => u.active && u.nama_unit !== form.unit_pertama)

  function setField<K extends keyof PkFormState>(key: K, val: PkFormState[K]) {
    setForm(f => ({ ...f, [key]: val }))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 2 }}>
        <div style={{
          width: 36, height: 36, borderRadius: 10,
          background: 'rgba(139,92,246,.18)', color: '#8B5CF6',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 800,
        }}>2</div>
        <div>
          <div style={{ fontSize: 15, fontWeight: 800, color: '#E6F1FB' }}>Pihak Kedua (Atasan)</div>
          <div style={{ fontSize: 11.5, color: '#85B7EB' }}>Penerima janji kinerja — auto-suggest dari unit Pihak Pertama (boleh override)</div>
        </div>
      </div>

      <Field label="Unit Kerja *" hint="Pilihan otomatis berdasarkan atasan default dari Master Unit Kerja. Boleh diganti.">
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select disabled={disabled || !form.unit_pertama}
            value={form.unit_kedua}
            onChange={e => onUnitChange(e.target.value)}
            style={{ ...inputStyle, flex: 1 }}>
            <option value="">— pilih unit atasan —</option>
            {selectable.map(u => (
              <option key={u.id} value={u.nama_unit}>
                {u.nama_unit} ({u.level})
              </option>
            ))}
          </select>
          {form.unit_kedua && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '6px 10px', borderRadius: 6,
              background: 'rgba(139,92,246,.15)', color: '#C4B5FD',
              border: '1px solid rgba(139,92,246,.4)',
              fontSize: 10.5, fontWeight: 700,
            }}>
              <Sparkles size={11} /> auto
            </span>
          )}
        </div>
        {!form.unit_pertama && (
          <span style={{ fontSize: 10.5, color: '#FCA5A5', marginTop: 4 }}>
            Pilih Pihak Pertama terlebih dahulu agar auto-suggest atasan aktif.
          </span>
        )}
        <PejabatStatusBadge status={pejabatStatus} unit={form.unit_kedua} tahun={form.tahun} />
      </Field>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 14 }}>
        <Field label="Nama *">
          <input type="text" disabled={disabled}
            value={form.nama_kedua}
            onChange={e => setField('nama_kedua', e.target.value)}
            placeholder="Nama lengkap atasan" style={inputStyle} />
        </Field>
        <Field label="NIP">
          <input type="text" disabled={disabled}
            value={form.nip_kedua}
            onChange={e => setField('nip_kedua', e.target.value)}
            placeholder="18 digit" style={{ ...inputStyle, fontFamily: 'JetBrains Mono, ui-monospace, monospace' }} />
        </Field>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 14 }}>
        <Field label="Jabatan *">
          <input type="text" disabled={disabled}
            value={form.jabatan_kedua}
            onChange={e => setField('jabatan_kedua', e.target.value)}
            placeholder="Jabatan struktural atasan" style={inputStyle} />
        </Field>
        <Field label="Pangkat/Golongan">
          <input type="text" disabled={disabled}
            value={form.pangkat_kedua}
            onChange={e => setField('pangkat_kedua', e.target.value)}
            placeholder="cth. Pembina Utama, IV/c" style={inputStyle} />
        </Field>
      </div>

      <p style={{ fontSize: 11, color: '#85B7EB', margin: 0, lineHeight: 1.6 }}>
        💡 Pihak Kedua TIDAK mempunyai tanggal dokumen (hanya menerima janji).
        Override unit di atas kalau atasan default tidak tepat (mis. atasan cuti, ada penjabat).
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

