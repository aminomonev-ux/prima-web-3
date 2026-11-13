'use client'
// Lampiran (kiri) + Anggaran (kanan) split panel — GAS-style A.
// LAMPIRAN: level dikunci dari unit Pihak Pertama, 1 picker aktif per level,
//           SEMUA indikator sasaran terpilih (+satuan, target) ikut dari Master Sasaran,
//           auto-detect parent (sub → program+kegiatan otomatis).
// ANGGARAN: cascading 3 dropdown dengan visibility toggle per level, keterangan
//           dropdown SUMBER_DANA, tombol 🖉 → dialog AmbilNominalBlud (pilih DPA/Pergeseran
//           + versi): keterangan=BLUD mengisi nominal, keterangan lain menambahkan BLUD.

import { useState, useMemo, type Dispatch, type SetStateAction } from 'react'
import { Plus, Sparkles, Pencil, Info } from 'lucide-react'
import DeleteIcon from '@/components/ui/DeleteIcon'
import AmbilNominalBlud from './AmbilNominalBlud'
import PrimaButton from '@/components/ui/PrimaButton'
import { pkMono as mono } from '@/lib/shared/pk-styles'
import type { PkProgramHierarchy, PkSasaranRow, PkLevel, PkUnitKerja } from '../../_utils/pk-types'
import { fmtRp } from '../../_utils/pk-format'
import type { PkFormState, LampiranRow, AnggaranRow } from '../_types'
import {
  genRowId, SUMBER_DANA, PANJANG_SUMBER_LAIN, sumberUtama, keteranganAnggaran, totalAnggaran, alasanTolakSumber,
} from '../_types'
import { pilihanSasaran, sidikLampiran, sisipLampiran } from '@/lib/pk/pilihan-sasaran'
import { gabungTargetSatuan } from '@/lib/shared/target-renaksi'
import {
  asalSasaran, dipakaiDi, tulisEntitas, tulisPemakai,
  type AsalSasaran, type BarisLampiranLain, type BarisRenaksiAsal, type PemakaiPk,
} from '@/lib/pk/asal-sasaran'
import { fetchJson } from '@/lib/shared/api'
import { useAbortableEffect } from '@/lib/shared/hooks'

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
  const [pickKey, setPickKey] = useState('')
  // Nomor indikator (urutan di `resolved.indikator`) yang DILEPAS dari Tambah. Bawaan semua ikut;
  // dulu tidak bisa memilih, jadi indikator yang tidak dipakai harus dihapus satu per satu sesudahnya.
  const [dilepas, setDilepas] = useState<ReadonlySet<number>>(new Set())
  function pilihSasaran(kunci: string) {
    setPickKey(kunci)
    setDilepas(new Set())
  }

  // "Milik siapa" — HANYA tampilan (docs/CONCEPT-pk-lampiran-asal-sasaran.md): tidak pernah
  // masuk baris lampiran. Gagal dimuat = keterangannya tidak tampil, form tetap jalan.
  const [asal, setAsal] = useState<{ tahun: string; renaksi: BarisRenaksiAsal[]; lampiran: BarisLampiranLain[] } | null>(null)
  useAbortableEffect(async (signal) => {
    const d = await fetchJson<unknown>(`/api/perjanjian-kinerja/asal-sasaran?tahun=${encodeURIComponent(form.tahun)}`, { signal })
    if (signal.aborted) return
    setAsal(d.ok ? (d as unknown as { tahun: string; renaksi: BarisRenaksiAsal[]; lampiran: BarisLampiranLain[] }) : null)
  }, [form.tahun])
  const asalDari = (sasaran: string, indikator?: string | null, level: PkLevel = unitLevel) =>
    asal && asal.tahun === form.tahun ? asalSasaran(asal.renaksi, level, sasaran, indikator) : []
  const pemakai = (sasaran: string, indikator?: string | null) =>
    asal && asal.tahun === form.tahun ? dipakaiDi(asal.lampiran, sasaran, indikator, form.id) : []

  // Satu pilihan = satu sasaran beserta SEMUA indikatornya. Dulu hanya indikator baris pertama
  // yang ikut, jadi sasaran berindikator tiga masuk dokumen dengan satu indikator saja.
  const options = useMemo(() => pilihanSasaran(sasaranRows, unitLevel), [sasaranRows, unitLevel])
  const resolved = useMemo(() => options.find(o => o.kunci === pickKey) ?? null, [options, pickKey])

  const sudahAda = useMemo(
    () => new Set(form.lampiran.filter(r => !r._deleted).map(r => sidikLampiran(r.uraian, r.indikator))),
    [form.lampiran],
  )
  // Sasaran tanpa indikator di master tetap bisa ditambahkan (satu baris berindikator kosong).
  const calon = useMemo(() => {
    if (!resolved) return []
    if (resolved.indikator.length === 0) {
      const kosong = { indikator: null, target: null, satuan: null }
      return sudahAda.has(sidikLampiran(resolved.label, null)) ? [] : [kosong]
    }
    return resolved.indikator.filter((i, n) => !dilepas.has(n) && !sudahAda.has(sidikLampiran(resolved.label, i.indikator)))
  }, [resolved, sudahAda, dilepas])
  const bisaDipilih = resolved
    ? resolved.indikator.filter(i => !sudahAda.has(sidikLampiran(resolved.label, i.indikator))).length
    : 0

  function handleAdd() {
    if (!resolved || calon.length === 0) return
    const baru: LampiranRow[] = calon.map(i => ({
      _id: genRowId(),
      unit_kerja: form.unit_pertama,
      level: unitLevel,
      program: resolved.program,
      kegiatan: resolved.kegiatan,
      subkegiatan: resolved.subkegiatan,
      uraian: resolved.label,
      indikator: i.indikator,
      target: i.target,
      satuan: i.satuan,
      urutan: 0,
    }))
    setForm(f => ({ ...f, lampiran: sisipLampiran(f.lampiran, baru) }))
    pilihSasaran('')
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
            onChange={e => pilihSasaran(e.target.value)}
            style={inputStyle}>
            <option value="">— pilih {SASARAN_LABEL[unitLevel]} —</option>
            {options.map(o => <option key={o.kunci} value={o.kunci}>{o.label}</option>)}
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

        {resolved && asal && (
          <KotakAsal tahun={form.tahun} asal={asalDari(resolved.label)} pemakai={pemakai(resolved.label)} />
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 10.5, fontWeight: 700, color: '#FAC775', letterSpacing: '.4px', textTransform: 'uppercase' }}>
            Indikator · Target (dari Master Sasaran)
            {bisaDipilih > 1 && <span style={{ textTransform: 'none', fontWeight: 600, color: '#85B7EB' }}> — centang yang ditambahkan</span>}
          </span>
          <div style={{ ...inputStyle, cursor: 'default', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {!resolved && <span style={{ color: '#85B7EB' }}>— pilih sasaran dulu —</span>}
            {resolved && resolved.indikator.length === 0 && <span style={{ color: '#85B7EB' }}>— tidak ada indikator di Master Sasaran —</span>}
            {resolved?.indikator.map((i, n) => {
              const ada = sudahAda.has(sidikLampiran(resolved.label, i.indikator))
              return (
                <label key={n} style={{ display: 'flex', gap: 8, alignItems: 'baseline', opacity: ada ? 0.55 : 1, cursor: ada || disabled ? 'default' : 'pointer' }}>
                  <input type="checkbox" disabled={ada || disabled} checked={!ada && !dilepas.has(n)}
                    onChange={() => setDilepas(p => { const s = new Set(p); if (s.has(n)) s.delete(n); else s.add(n); return s })}
                    style={{ flexShrink: 0, alignSelf: 'center' }} />
                  <span style={{ flex: 1, minWidth: 0, color: '#E6F1FB' }}>
                    {i.indikator || <em style={{ color: '#FCA5A5' }}>indikator kosong</em>}
                    {i.indikator && <KeteranganIndikator asal={asalDari(resolved.label, i.indikator)} pemakai={pemakai(resolved.label, i.indikator)} />}
                  </span>
                  <span style={{ ...mono, color: '#FAC775', flexShrink: 0 }}>{gabungTargetSatuan(i.target, i.satuan) || '—'}</span>
                  {ada && <span style={{ fontSize: 10, color: '#85B7EB', flexShrink: 0 }}>sudah ada</span>}
                </label>
              )
            })}
          </div>
        </div>

        <PrimaButton variant="success" onClick={handleAdd} disabled={disabled || calon.length === 0} iconLeft={<Plus size={13} />}
          data-tooltip={resolved && calon.length === 0
            ? (bisaDipilih > 0 ? 'Centang minimal satu indikator' : 'Semua indikator sasaran ini sudah ada di lampiran')
            : undefined}>
          {calon.length > 1 ? `Tambah ${calon.length} Indikator` : 'Tambah Lampiran'}
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
                    <span style={{ color: '#85B7EB' }}> · Satuan: </span>
                    {r.satuan || <em style={{ color: '#FCA5A5' }}>kosong</em>}
                  </div>
                  {asal && <RingkasAsal asal={asalDari(r.uraian, r.indikator, r.level)} pemakai={pemakai(r.uraian, r.indikator)} />}
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
  /** Teks sumber dana saat Keterangan = LAINNYA. */
  const [lainnya, setLainnya] = useState('')
  const [nominal, setNominal] = useState<number>(0)
  /** Bagian BLUD dari ✎ untuk sumber selain BLUD — disimpan terpisah supaya rinciannya terlihat & nominal sumber utama tetap bisa diubah. */
  const [bagianBlud, setBagianBlud] = useState<number | null>(null)
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
    setLainnya('')
    setNominal(0)
    setBagianBlud(null)
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
    return alasanTolakSumber(keterangan, lainnya, bagianBlud)
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
      keterangan_sumber: keteranganAnggaran(keterangan, lainnya, adaBagianBlud),
      nominal: Math.max(0, totalAnggaran(keterangan, Number(nominal) || 0, bagianBlud)),
      urutan: form.anggaran.length,
      // Tanda BLUD-auto = labelnya menyebut BLUD (lib/pk/sumber-dana.ts membaca pasangan ini untuk baris lama).
      auto_filled_from_blud: keterangan === 'BLUD' ? autoFilledFromBlud : adaBagianBlud,
    }
    setForm(f => ({ ...f, anggaran: [...f.anggaran, newRow] }))
    resetForm()
  }

  function handleDelete(idx: number) {
    setForm(f => ({ ...f, anggaran: f.anggaran.filter((_, i) => i !== idx) }))
  }

  // Tombol pensil membuka dialog pilih DPA/Pergeseran + versi (dihitung langsung, bukan foto
  // Rekap PK). Keterangan BLUD = mengisi; keterangan lain = MENAMBAHKAN BLUD ke isian saat ini.
  const [dialogBlud, setDialogBlud] = useState(false)
  const utama = sumberUtama(keterangan, lainnya)
  /** BLUD Rp 0 tidak ikut disebut di label — "APBD + BLUD" dengan BLUD nol menyesatkan. */
  const adaBagianBlud = (bagianBlud ?? 0) > 0
  function pakaiNominalBlud(total: number, sumber: string) {
    setDialogBlud(false)
    setAutoFilledFromBlud(true)
    if (keterangan === 'BLUD') {
      setNominal(total)
      setHint(`BLUD: ${fmtRp(total)} (${sumber})`)
      return
    }
    // Dialog menjumlah nominal sumber utama + BLUD; yang disimpan terpisah hanya bagian BLUD-nya.
    const bagian = total - (Number(nominal) || 0)
    setBagianBlud(bagian)
    setHint(bagian > 0
      ? `BLUD ${fmtRp(bagian)} ditambahkan (${sumber}) — keterangan jadi "${keteranganAnggaran(keterangan, lainnya, true)}".`
      : `BLUD unit ini di ${sumber} Rp 0 — keterangan tetap "${keteranganAnggaran(keterangan, lainnya, false) || 'Lainnya'}".`)
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

        <Field label="KETERANGAN (Sumber Dana)"
          hint={keterangan === 'BLUD'
            ? 'Klik ✎ di sebelah nominal untuk mengambil dari DPA / Pergeseran BLUD.'
            : 'Ada bagian BLUD juga? Isi nominal lalu klik ✎ — keterangannya jadi "… + BLUD".'}>
          <select disabled={disabled} value={keterangan}
            onChange={e => { setKeterangan(e.target.value); setAutoFilledFromBlud(false); setBagianBlud(null); setHint('') }} style={inputStyle}>
            {SUMBER_DANA.map(s => <option key={s} value={s}>{s === 'LAINNYA' ? 'LAINNYA (ketik sendiri)' : s}</option>)}
          </select>
        </Field>
        {keterangan === 'LAINNYA' && (
          <Field label="SUMBER DANA LAINNYA">
            <input type="text" disabled={disabled} value={lainnya} maxLength={PANJANG_SUMBER_LAIN}
              onChange={e => setLainnya(e.target.value)} placeholder="mis. DAK, CSR, Swadaya" style={inputStyle} />
          </Field>
        )}

        <Field label={keterangan === 'BLUD' ? 'NOMINAL (Rp)' : `NOMINAL ${utama || 'LAINNYA'} (Rp)`}>
          <div style={{ display: 'flex', gap: 6 }}>
            <input type="text" inputMode="numeric" disabled={disabled}
              value={nominal > 0 ? nominal.toLocaleString('id-ID') : ''}
              onChange={e => {
                // Strip semua non-digit → parse → format id-ID di-handle via value above
                const digits = e.target.value.replace(/\D/g, '')
                setNominal(digits ? Number(digits) : 0)
                // Bagian BLUD sumber lain disimpan terpisah — mengetik nominal sumber utama tidak membuangnya.
                if (keterangan === 'BLUD') setAutoFilledFromBlud(false)
              }}
              placeholder="0"
              style={{ ...inputStyle, flex: 1, fontFamily: 'JetBrains Mono, ui-monospace, monospace', textAlign: 'right' }} />
            <button onClick={() => { setHint(''); setDialogBlud(true) }} disabled={disabled || !form.unit_pertama}
              data-tooltip={keterangan === 'BLUD' ? 'Ambil nominal dari DPA / Pergeseran BLUD' : `Tambah bagian BLUD ke nominal ${utama || 'sumber ini'}`}
              data-tooltip-pos="left"
              style={btnIconAccent(disabled, '#EF9F27')}>
              <Pencil size={13} />
            </button>
          </div>
        </Field>
        {keterangan !== 'BLUD' && (bagianBlud !== null || keterangan === 'APBD + BLUD') && (
          <div style={{ fontSize: 11.5, color: '#B5D4F4', lineHeight: 1.6, padding: '6px 10px', borderRadius: 6, border: '1px solid rgba(24,95,165,.4)' }}>
            {bagianBlud === null ? (
              <>Bagian BLUD: <b>belum diisi</b> — klik ✎ di sebelah nominal.</>
            ) : (
              <>
                {utama || 'Lainnya'} <span style={mono}>{fmtRp(Number(nominal) || 0)}</span> + BLUD <span style={mono}>{fmtRp(bagianBlud)}</span>
                {' = '}<b style={{ ...mono, color: '#FAC775' }}>{fmtRp(totalAnggaran(keterangan, Number(nominal) || 0, bagianBlud))}</b>
                <button type="button" disabled={disabled} onClick={() => { setBagianBlud(null); setAutoFilledFromBlud(false); setHint('') }}
                  style={{ marginLeft: 8, background: 'none', border: 0, color: '#FCA5A5', cursor: 'pointer', fontSize: 11, textDecoration: 'underline' }}>
                  lepas BLUD
                </button>
              </>
            )}
          </div>
        )}
        {dialogBlud && (
          <AmbilNominalBlud unit={form.unit_pertama} tahun={form.tahun}
            tambahKe={keterangan === 'BLUD' ? null : { nominal: Number(nominal) || 0, keterangan: utama || 'Lainnya' }}
            onPakai={pakaiNominalBlud} onTutup={() => setDialogBlud(false)} />
        )}

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

// ═══ "Milik siapa" — tampilan saja, tidak pernah tersimpan ═════════════════
function KotakAsal({ tahun, asal, pemakai }: { tahun: string; asal: AsalSasaran[]; pemakai: PemakaiPk[] }) {
  return (
    <div style={{ fontSize: 10.5, lineHeight: 1.55, padding: '7px 10px', borderRadius: 6, background: 'rgba(12,68,124,.25)', border: '1px solid rgba(24,95,165,.4)' }}>
      <div style={{ fontWeight: 700, color: '#85B7EB', marginBottom: 2 }}>
        Asal di Rencana Aksi {tahun} <span style={{ fontWeight: 500 }}>· keterangan saja, tidak ikut tersimpan</span>
      </div>
      {asal.length === 0 && <div style={{ color: '#85B7EB' }}>Tidak ditemukan di Rencana Aksi {tahun} (sasaran diketik di Master Sasaran).</div>}
      {asal.map((a, i) => (
        <div key={i} style={{ color: '#B5D4F4' }}>
          <span style={{ color: '#85B7EB' }}>Program: </span>{tulisEntitas(a.program)}
          {a.kegiatan && <><br /><span style={{ color: '#85B7EB' }}>Kegiatan: </span>{tulisEntitas(a.kegiatan)}</>}
          {a.sub && <><br /><span style={{ color: '#85B7EB' }}>Sub kegiatan: </span>{tulisEntitas(a.sub)}</>}
        </div>
      ))}
      {pemakai.length > 0 && (
        <div style={{ color: '#B5D4F4', marginTop: 3 }}>
          <span style={{ color: '#85B7EB' }}>Dipakai juga di PK: </span>{tulisPemakai(pemakai)}
        </div>
      )}
    </div>
  )
}

function KeteranganIndikator({ asal, pemakai }: { asal: AsalSasaran[]; pemakai: PemakaiPk[] }) {
  const induk = asal.find(a => a.indikatorInduk)?.indikatorInduk
  if (!induk && pemakai.length === 0) return null
  return (
    <span style={{ display: 'block', fontSize: 10, color: '#85B7EB', lineHeight: 1.45, marginTop: 1 }}>
      {induk && <>↳ menjabarkan: {induk}</>}
      {induk && pemakai.length > 0 && <br />}
      {pemakai.length > 0 && <>juga di: {tulisPemakai(pemakai)}</>}
    </span>
  )
}

function RingkasAsal({ asal, pemakai }: { asal: AsalSasaran[]; pemakai: PemakaiPk[] }) {
  if (asal.length === 0 && pemakai.length === 0) return null
  const a = asal[0]
  const jalur = a ? [a.program, a.kegiatan, a.sub].filter((e): e is NonNullable<typeof e> => !!e).map(tulisEntitas).join(' › ') : null
  return (
    <div style={{ fontSize: 10, color: '#85B7EB', lineHeight: 1.45, marginTop: 4, paddingTop: 4, borderTop: '1px dashed rgba(24,95,165,.4)' }}>
      {jalur && <div><span style={{ fontWeight: 700 }}>Asal: </span>{jalur}{asal.length > 1 ? ` (+${asal.length - 1} lain)` : ''}</div>}
      {a?.indikatorInduk && <div>↳ menjabarkan: {a.indikatorInduk}</div>}
      {pemakai.length > 0 && <div>Juga di PK: {tulisPemakai(pemakai)}</div>}
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
