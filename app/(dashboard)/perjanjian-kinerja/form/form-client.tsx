'use client'
// app/(dashboard)/perjanjian-kinerja/form/form-client.tsx
// Sprint 6 — Form Perjanjian Kinerja: shell + 3-tab + actions.

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  User, Crown, ClipboardList, Save, FileCheck2,
  CheckCircle2, AlertCircle, Loader2, ArrowLeft,
} from 'lucide-react'
import { fetchJson } from '@/lib/shared/api'
import DeleteIcon from '@/components/ui/DeleteIcon'
import { useAbortableEffect } from '@/lib/shared/hooks'
import { usePkYear } from '../_context/PkYearContext'
import type { PkUnitKerja, PkPejabat, PkProgramHierarchy, PkSasaranRow } from '../_utils/pk-types'
import type { PkFormState, TabKey } from './_types'
import { genRowId } from './_types'
import PihakPertamaForm from './_components/PihakPertamaForm'
import PihakKeduaForm from './_components/PihakKeduaForm'
import LampiranAnggaranSplit from './_components/LampiranAnggaranSplit'
import PrimaButton from '@/components/ui/PrimaButton'
import DownloadButton from '@/components/ui/DownloadButton'

interface Props { editId: number | null }

function emptyForm(tahun: string): PkFormState {
  const today = new Date().toISOString().slice(0, 10)
  return {
    id: null, status: 'DRAFT', tahun,
    tanggal_dokumen: today, jenis_pk: 'MURNI',
    unit_pertama: '', nama_pertama: '', jabatan_pertama: '', pangkat_pertama: '', nip_pertama: '',
    unit_kedua: '',   nama_kedua: '',   jabatan_kedua: '',   pangkat_kedua: '',   nip_kedua: '',
    lampiran: [], anggaran: [],
  }
}

export default function FormClient({ editId }: Props) {
  const { tahun } = usePkYear()
  const router = useRouter()

  const [form, setForm] = useState<PkFormState>(() => emptyForm(tahun))
  const [tab, setTab] = useState<TabKey>('pihak1')
  const [units, setUnits] = useState<PkUnitKerja[]>([])
  const [hierarchy, setHierarchy] = useState<PkProgramHierarchy | null>(null)
  const [sasaranRows, setSasaranRows] = useState<PkSasaranRow[]>([])
  const [loadingInit, setLoadingInit] = useState(true)
  const [loadingEdit, setLoadingEdit] = useState(!!editId)
  const [saving, setSaving] = useState(false)
  const [finalizing, setFinalizing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null)
  // Modal konfirmasi (replace native window.confirm — ikut design system PRIMA)
  const [confirm, setConfirm] = useState<{
    title: string
    message: string
    confirmLabel: string
    confirmKind: 'purple' | 'danger'
    onConfirm: () => void
  } | null>(null)
  // Track auto-fill status pejabat untuk feedback UI (loading/found/notfound)
  const [pejabatStatusPertama, setPejabatStatusPertama] = useState<'idle' | 'loading' | 'found' | 'notfound'>('idle')
  const [pejabatStatusKedua,   setPejabatStatusKedua]   = useState<'idle' | 'loading' | 'found' | 'notfound'>('idle')
  const lastAutoSuggestRef = useRef<string>('')
  // Ref ke form terbaru — dibutuhkan karena setForm updater di React 18 dijalankan lazy
  // (state read di dalam updater tidak ke-flush sebelum baris berikutnya jalan).
  const formRef = useRef<PkFormState>(form)

  function showToast(kind: 'ok' | 'err', msg: string) {
    setToast({ kind, msg })
    window.setTimeout(() => setToast(null), 4000)
  }

  useAbortableEffect(async (signal) => {
    setLoadingInit(true)
    const [u, p, s] = await Promise.all([
      fetchJson<unknown>(`/api/perjanjian-kinerja/units?as_pertama=false`, { signal }),
      fetchJson<unknown>(`/api/perjanjian-kinerja/program?tahun=${tahun}`, { signal }),
      fetchJson<unknown>(`/api/perjanjian-kinerja/sasaran?tahun=${tahun}`, { signal }),
    ])
    if (signal.aborted) return
    if (u.ok) {
      const r = u as unknown as { units: PkUnitKerja[] }
      setUnits(r.units ?? [])
    }
    if (p.ok) {
      const r = p as unknown as { hierarchy: PkProgramHierarchy }
      setHierarchy(r.hierarchy ?? { programs: [], kegiatanByProgram: {}, subByKegiatan: {} })
    }
    if (s.ok) {
      const r = s as unknown as { rows: PkSasaranRow[] }
      setSasaranRows(r.rows ?? [])
    }
    setLoadingInit(false)
  }, [tahun])

  // Async-post pattern: cegah cascading render warning saat sync tahun → form.
  useEffect(() => {
    Promise.resolve().then(() => setForm(f => (f.tahun === tahun ? f : { ...f, tahun })))
  }, [tahun])

  // Sync formRef tiap render → handler async bisa baca state terbaru tanpa stale closure
  useEffect(() => { formRef.current = form }, [form])

  useAbortableEffect(async (signal) => {
    if (!editId) { setLoadingEdit(false); return }
    setLoadingEdit(true)
    const d = await fetchJson<unknown>(`/api/perjanjian-kinerja/dokumen/${editId}`, { signal })
    if (signal.aborted) return
    if (d.ok) {
      const r = d as unknown as {
        header: Record<string, unknown>
        lampiran: Array<Record<string, unknown>>
        anggaran: Array<Record<string, unknown>>
      }
      const h = r.header
      setForm({
        id: editId,
        status: (h.status as 'DRAFT' | 'FINAL') ?? 'DRAFT',
        tahun: String(h.tahun),
        tanggal_dokumen: String(h.tanggal_dokumen).slice(0, 10),
        jenis_pk: (h.jenis_pk as 'MURNI' | 'PERUBAHAN') ?? 'MURNI',
        unit_pertama: String(h.unit_pertama ?? ''),
        nama_pertama: String(h.nama_pertama ?? ''),
        jabatan_pertama: String(h.jabatan_pertama ?? ''),
        pangkat_pertama: String(h.pangkat_pertama ?? ''),
        nip_pertama: String(h.nip_pertama ?? ''),
        unit_kedua: String(h.unit_kedua ?? ''),
        nama_kedua: String(h.nama_kedua ?? ''),
        jabatan_kedua: String(h.jabatan_kedua ?? ''),
        pangkat_kedua: String(h.pangkat_kedua ?? ''),
        nip_kedua: String(h.nip_kedua ?? ''),
        lampiran: r.lampiran.map(l => ({
          unit_kerja: String(l.unit_kerja ?? ''),
          level: (l.level as 'program' | 'kegiatan' | 'subkegiatan') ?? 'subkegiatan',
          program: (l.program as string) ?? null,
          kegiatan: (l.kegiatan as string) ?? null,
          subkegiatan: (l.subkegiatan as string) ?? null,
          uraian: String(l.uraian ?? ''),
          indikator: (l.indikator as string) ?? null,
          target: (l.target as string) ?? null,
          urutan: Number(l.urutan ?? 0),
          _id: genRowId(),
        })),
        anggaran: r.anggaran.map(a => ({
          unit_kerja: String(a.unit_kerja ?? ''),
          level: (a.level as 'program' | 'kegiatan' | 'subkegiatan') ?? 'subkegiatan',
          program: (a.program as string) ?? null,
          kegiatan: (a.kegiatan as string) ?? null,
          subkegiatan: (a.subkegiatan as string) ?? null,
          uraian: String(a.uraian ?? ''),
          keterangan_sumber: String(a.keterangan_sumber ?? 'BLUD'),
          nominal: Number(a.nominal ?? 0),
          urutan: Number(a.urutan ?? 0),
          auto_filled_from_blud: !!a.auto_filled_from_blud,
          _id: genRowId(),
        })),
      })
    } else {
      showToast('err', d.message)
    }
    setLoadingEdit(false)
  }, [editId])

  const handleUnitKeduaChange = useCallback(async (newUnit: string) => {
    setForm(f => ({ ...f, unit_kedua: newUnit, nama_kedua: '', jabatan_kedua: '', pangkat_kedua: '', nip_kedua: '' }))
    if (!newUnit) { setPejabatStatusKedua('idle'); return }
    setPejabatStatusKedua('loading')
    const p = await fetchJson<unknown>(`/api/perjanjian-kinerja/pejabat?unit=${encodeURIComponent(newUnit)}&tahun=${tahun}`)
    if (p.ok) {
      const r = p as unknown as { pejabat: PkPejabat | null }
      if (r.pejabat) {
        setForm(f => ({
          ...f,
          nama_kedua: r.pejabat!.nama,
          jabatan_kedua: r.pejabat!.jabatan,
          pangkat_kedua: r.pejabat!.pangkat ?? '',
          nip_kedua: r.pejabat!.nip ?? '',
        }))
        setPejabatStatusKedua('found')
      } else {
        // Master Pejabat null → default jabatan = nama unit uppercase (mis. "Plt. Wadir Pelayanan"
        // → "PLT. WADIR PELAYANAN"). Saat di-generate Word, fmtJabatan() di docgen akan
        // title-case + append RSJD → "Plt. Wadir Pelayanan RSJD Dr. Amino Gondohutomo".
        setForm(f => ({ ...f, jabatan_kedua: newUnit.toUpperCase() }))
        setPejabatStatusKedua('notfound')
      }
    } else {
      setForm(f => ({ ...f, jabatan_kedua: newUnit.toUpperCase() }))
      setPejabatStatusKedua('notfound')
    }
  }, [tahun])

  const handleUnitPertamaChange = useCallback(async (newUnit: string) => {
    setForm(f => ({ ...f, unit_pertama: newUnit, nama_pertama: '', jabatan_pertama: '', pangkat_pertama: '', nip_pertama: '' }))
    if (!newUnit) { setPejabatStatusPertama('idle'); return }
    setPejabatStatusPertama('loading')
    const p = await fetchJson<unknown>(`/api/perjanjian-kinerja/pejabat?unit=${encodeURIComponent(newUnit)}&tahun=${tahun}`)
    if (p.ok) {
      const r = p as unknown as { pejabat: PkPejabat | null }
      if (r.pejabat) {
        setForm(f => ({
          ...f,
          nama_pertama: r.pejabat!.nama,
          jabatan_pertama: r.pejabat!.jabatan,
          pangkat_pertama: r.pejabat!.pangkat ?? '',
          nip_pertama: r.pejabat!.nip ?? '',
        }))
        setPejabatStatusPertama('found')
      } else {
        // Default jabatan = nama unit uppercase (konsisten dgn handleUnitKeduaChange)
        setForm(f => ({ ...f, jabatan_pertama: newUnit.toUpperCase() }))
        setPejabatStatusPertama('notfound')
      }
    } else {
      setForm(f => ({ ...f, jabatan_pertama: newUnit.toUpperCase() }))
      setPejabatStatusPertama('notfound')
    }
    const s = await fetchJson<unknown>(`/api/perjanjian-kinerja/units/${encodeURIComponent(newUnit)}/atasan-suggest`)
    if (s.ok) {
      const r = s as unknown as { atasan: string | null }
      const newAtasan = r.atasan ?? ''
      // Baca unit_kedua via ref — kalau pakai updater setForm, callback dijalankan lazy
      // sehingga trigger handleUnitKeduaChange ke-skip (nama/jabatan/pangkat tidak auto-fill).
      const currentKedua = formRef.current.unit_kedua
      const wasAuto = currentKedua === '' || currentKedua === lastAutoSuggestRef.current
      if (wasAuto && newAtasan) {
        lastAutoSuggestRef.current = newAtasan
        // handleUnitKeduaChange handle setForm(unit_kedua) + fetch pejabat + fill nama/jabatan/pangkat/NIP
        void handleUnitKeduaChange(newAtasan)
      }
    }
  }, [tahun, handleUnitKeduaChange])

  function validate(): string | null {
    if (!form.unit_pertama) return 'Pihak Pertama: unit kerja wajib dipilih'
    if (!form.nama_pertama) return 'Pihak Pertama: nama wajib diisi'
    if (!form.jabatan_pertama) return 'Pihak Pertama: jabatan wajib diisi'
    if (!form.unit_kedua) return 'Pihak Kedua: unit kerja wajib dipilih'
    if (!form.nama_kedua) return 'Pihak Kedua: nama wajib diisi'
    if (!form.jabatan_kedua) return 'Pihak Kedua: jabatan wajib diisi'
    if (!form.tanggal_dokumen) return 'Tanggal dokumen wajib diisi'
    const lampInvalid = form.lampiran.filter(l => !l._deleted).findIndex(l => !l.uraian?.trim())
    if (lampInvalid !== -1) return `Lampiran baris ${lampInvalid + 1}: uraian wajib diisi`
    const angInvalid = form.anggaran.filter(a => !a._deleted).findIndex(a => !a.uraian?.trim())
    if (angInvalid !== -1) return `Anggaran baris ${angInvalid + 1}: uraian wajib diisi`
    return null
  }

  async function handleSave() {
    const err = validate()
    if (err) { showToast('err', err); return }
    setSaving(true)
    const body = {
      tahun: form.tahun,
      tanggal_dokumen: form.tanggal_dokumen,
      jenis_pk: form.jenis_pk,
      unit_pertama: form.unit_pertama, nama_pertama: form.nama_pertama, jabatan_pertama: form.jabatan_pertama,
      pangkat_pertama: form.pangkat_pertama || null, nip_pertama: form.nip_pertama || null,
      unit_kedua: form.unit_kedua, nama_kedua: form.nama_kedua, jabatan_kedua: form.jabatan_kedua,
      pangkat_kedua: form.pangkat_kedua || null, nip_kedua: form.nip_kedua || null,
      lampiran: form.lampiran.filter(l => !l._deleted).map((l, i) => ({
        unit_kerja: l.unit_kerja, level: l.level,
        program: l.program, kegiatan: l.kegiatan, subkegiatan: l.subkegiatan,
        uraian: l.uraian, indikator: l.indikator, target: l.target,
        urutan: i,
      })),
      anggaran: form.anggaran.filter(a => !a._deleted).map((a, i) => ({
        unit_kerja: a.unit_kerja, level: a.level,
        program: a.program, kegiatan: a.kegiatan, subkegiatan: a.subkegiatan,
        uraian: a.uraian, keterangan_sumber: a.keterangan_sumber,
        nominal: a.nominal, urutan: i,
        auto_filled_from_blud: a.auto_filled_from_blud,
      })),
    }
    const url = form.id ? `/api/perjanjian-kinerja/dokumen/${form.id}` : `/api/perjanjian-kinerja/dokumen`
    const method = form.id ? 'PATCH' : 'POST'
    const d = await fetchJson<unknown>(url, { method, body: JSON.stringify(body) })
    setSaving(false)
    if (d.ok) {
      const r = d as unknown as { id: number }
      if (!form.id) {
        router.replace(`/perjanjian-kinerja/form?id=${r.id}`)
        showToast('ok', `Dokumen tersimpan (id #${r.id}). Anda sekarang di mode edit.`)
      } else {
        showToast('ok', 'Perubahan tersimpan')
      }
    } else {
      showToast('err', d.message)
    }
  }

  async function doFinalize() {
    if (!form.id) return
    setFinalizing(true)
    const d = await fetchJson<unknown>(`/api/perjanjian-kinerja/dokumen/${form.id}/finalize`, { method: 'POST' })
    setFinalizing(false)
    if (d.ok) {
      showToast('ok', 'Dokumen difinalisasi & Word digenerate. Klik Unduh untuk mendapatkan file.')
      setForm(f => ({ ...f, status: 'FINAL' }))
    } else {
      showToast('err', d.message)
    }
  }

  function handleFinalize() {
    if (!form.id) { showToast('err', 'Simpan dokumen terlebih dahulu sebelum finalisasi'); return }
    setConfirm({
      title: 'Finalisasi Dokumen PK',
      message: 'Finalisasi akan generate dokumen Word dan mengunci dokumen ke status FINAL. Setelah final, dokumen tidak bisa diedit lagi. Lanjutkan?',
      confirmLabel: 'Ya, Finalisasi',
      confirmKind: 'purple',
      onConfirm: () => { setConfirm(null); void doFinalize() },
    })
  }

  async function doDelete() {
    if (!form.id) return
    setDeleting(true)
    const d = await fetchJson<unknown>(`/api/perjanjian-kinerja/dokumen/${form.id}`, { method: 'DELETE' })
    setDeleting(false)
    if (d.ok) {
      showToast('ok', 'Dokumen dihapus')
      router.push('/perjanjian-kinerja/riwayat')
    } else {
      showToast('err', d.message)
    }
  }

  function handleDelete() {
    if (!form.id) { setForm(emptyForm(tahun)); showToast('ok', 'Form direset'); return }
    setConfirm({
      title: 'Hapus Dokumen PK',
      message: `Dokumen #${form.id} akan dihapus permanen termasuk semua lampiran dan anggaran. Aksi ini tidak bisa di-undo. Lanjutkan?`,
      confirmLabel: 'Ya, Hapus',
      confirmKind: 'danger',
      onConfirm: () => { setConfirm(null); void doDelete() },
    })
  }

  function handleDownload() {
    if (!form.id) return
    window.location.href = `/api/perjanjian-kinerja/dokumen/${form.id}/download`
  }

  const isFinal = form.status === 'FINAL'
  const isLoading = loadingInit || loadingEdit
  const lampActiveCount = form.lampiran.filter(l => !l._deleted).length
  const angActiveCount = form.anggaran.filter(a => !a._deleted).length

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => router.push('/perjanjian-kinerja')} style={btnGhost(false)} data-tooltip="Kembali ke Beranda" data-tooltip-pos="below">
            <ArrowLeft size={14} />
          </button>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 800, color: '#E6F1FB', margin: 0 }}>
              Form Perjanjian Kinerja
              {form.id && <span style={{ marginLeft: 10, fontSize: 13, color: '#85B7EB', fontFamily: 'JetBrains Mono, ui-monospace, monospace', fontWeight: 700 }}>#{form.id}</span>}
            </h1>
            <p style={{ fontSize: 12, color: '#85B7EB', margin: '4px 0 0' }}>
              Tahun <strong style={{ color: '#FAC775', fontFamily: 'JetBrains Mono, ui-monospace, monospace' }}>{form.tahun}</strong>
              {' · Jenis '}
              <strong style={{ color: '#FAC775' }}>{form.jenis_pk}</strong>
              {' · Status '}
              <span style={{
                display: 'inline-block', padding: '2px 8px', borderRadius: 6,
                fontSize: 10.5, fontWeight: 800, letterSpacing: '.5px',
                background: isFinal ? 'rgba(29,158,117,.18)' : 'rgba(239,159,39,.18)',
                color: isFinal ? '#6EE7B7' : '#FAC775',
                border: `1px solid ${isFinal ? 'rgba(29,158,117,.4)' : 'rgba(239,159,39,.4)'}`,
              }}>{form.status}</span>
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {form.id && isFinal && (
            <DownloadButton variant="word" label="Unduh Word" onClick={handleDownload}
              data-tooltip="Unduh dokumen Word" data-tooltip-pos="below" />
          )}
          <PrimaButton variant="danger" iconLeft={<DeleteIcon size={14} />}
            onClick={handleDelete} disabled={deleting || isFinal}
            data-tooltip={isFinal ? 'Dokumen FINAL — hubungi SUPER_ADMIN' : 'Hapus dokumen / reset form'} data-tooltip-pos="below">
            {deleting ? 'Menghapus…' : (form.id ? 'Hapus' : 'Reset')}
          </PrimaButton>
          <PrimaButton variant="primary" iconLeft={<Save size={14} />}
            onClick={handleSave} disabled={saving || isFinal || isLoading}
            data-tooltip={isFinal ? 'Dokumen sudah FINAL — tidak dapat diedit' : 'Simpan ke server'} data-tooltip-pos="below">
            {saving ? 'Menyimpan…' : 'Simpan'}
          </PrimaButton>
          {form.id && !isFinal && (
            <PrimaButton variant="success" iconLeft={<FileCheck2 size={14} />}
              onClick={handleFinalize} disabled={finalizing || isLoading}
              data-tooltip="Generate Word + kunci dokumen FINAL" data-tooltip-pos="below">
              {finalizing ? 'Memproses…' : 'Finalisasi'}
            </PrimaButton>
          )}
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

      {isLoading && (
        <div style={{
          padding: 40, textAlign: 'center', borderRadius: 10,
          background: '#042C53', border: '1px solid #0C447C', color: '#85B7EB', fontSize: 13,
        }}>
          <Loader2 size={28} style={{ animation: 'pk-spin 1s linear infinite', marginBottom: 8 }} />
          <div>Memuat data…</div>
          <style>{`@keyframes pk-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {!isLoading && (
        <>
          <div style={{
            display: 'flex', gap: 8, marginBottom: 12, padding: 4, borderRadius: 10,
            background: 'rgba(12,68,124,.25)', border: '1px solid #0C447C',
            width: 'fit-content',
          }}>
            <TabPill active={tab === 'pihak1'} onClick={() => setTab('pihak1')} color="#3B82F6" icon={User}
              label="Pihak Pertama" sub="(Bawahan)" badge={form.unit_pertama ? '✓' : null} />
            <TabPill active={tab === 'pihak2'} onClick={() => setTab('pihak2')} color="#8B5CF6" icon={Crown}
              label="Pihak Kedua" sub="(Atasan)" badge={form.unit_kedua ? '✓' : null} />
            <TabPill active={tab === 'lampiran'} onClick={() => setTab('lampiran')} color="#EF9F27" icon={ClipboardList}
              label="Lampiran" sub="& Anggaran" badge={`${lampActiveCount}+${angActiveCount}`} />
          </div>

          <div style={{ background: '#042C53', border: '1px solid #0C447C', borderRadius: 10, padding: 16 }}>
            {tab === 'pihak1' && (
              <PihakPertamaForm
                form={form} setForm={setForm} units={units}
                disabled={isFinal}
                onUnitChange={handleUnitPertamaChange}
                pejabatStatus={pejabatStatusPertama}
              />
            )}
            {tab === 'pihak2' && (
              <PihakKeduaForm
                form={form} setForm={setForm} units={units}
                disabled={isFinal}
                onUnitChange={handleUnitKeduaChange}
                pejabatStatus={pejabatStatusKedua}
              />
            )}
            {tab === 'lampiran' && (
              <LampiranAnggaranSplit
                form={form} setForm={setForm}
                units={units}
                hierarchy={hierarchy}
                sasaranRows={sasaranRows}
                disabled={isFinal}
              />
            )}
          </div>
        </>
      )}

      {confirm && (
        <ConfirmDialog
          title={confirm.title}
          message={confirm.message}
          confirmLabel={confirm.confirmLabel}
          confirmKind={confirm.confirmKind}
          onConfirm={confirm.onConfirm}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  )
}

function TabPill({
  active, onClick, color, icon: Icon, label, sub, badge,
}: {
  active: boolean; onClick: () => void; color: string
  icon: React.ElementType; label: string; sub: string
  badge: string | null
}) {
  return (
    <button onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '8px 14px', borderRadius: 7, cursor: 'pointer',
        border: active ? `1.5px solid ${color}` : '1.5px solid transparent',
        background: active ? `linear-gradient(135deg, ${color}33, ${color}11)` : 'transparent',
        color: active ? color : '#85B7EB',
        fontSize: 12.5, fontWeight: active ? 800 : 600,
        fontFamily: 'inherit', transition: 'all .15s',
      }}>
      <Icon size={15} />
      <span>{label} <span style={{ opacity: .6, fontSize: 11, fontWeight: 600 }}>{sub}</span></span>
      {badge && (
        <span style={{
          display: 'inline-block', padding: '1px 7px', borderRadius: 4,
          fontSize: 10, fontWeight: 800,
          background: active ? `${color}33` : 'rgba(133,183,235,.18)',
          color: active ? color : '#85B7EB',
          fontFamily: 'JetBrains Mono, ui-monospace, monospace',
        }}>{badge}</span>
      )}
    </button>
  )
}

function btnBase(disabled: boolean, bg: string, color: string, border?: string): React.CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '7px 12px', borderRadius: 6,
    background: bg, color, border: border ?? 'none',
    fontSize: 12, fontWeight: 700, fontFamily: 'inherit',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1, transition: 'all .15s',
  }
}
function btnGhost(d: boolean): React.CSSProperties { return btnBase(d, 'transparent', '#B5D4F4', '1px solid #185FA5') }

// Modal konfirmasi sesuai design-system PRIMA (canvas-dark overlay + surface-card panel).
// Purple kind = aksi review/ajukan (mis. finalisasi). Danger kind = aksi hapus.
function ConfirmDialog({
  title, message, confirmLabel, confirmKind, onConfirm, onCancel,
}: {
  title: string
  message: string
  confirmLabel: string
  confirmKind: 'purple' | 'danger'
  onConfirm: () => void
  onCancel: () => void
}) {
  const confirmBg = confirmKind === 'purple' ? '#7C5CFC' : '#E24B4A'
  const confirmShadow = confirmKind === 'purple' ? 'rgba(124,92,252,.35)' : 'rgba(226,75,74,.35)'
  return (
    <div
      onClick={onCancel}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(2,15,28,.72)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20, animation: 'pkConfirmFade .18s ease-out',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#042C53', borderRadius: 14,
          border: '1px solid rgba(24,95,165,.5)',
          boxShadow: '0 20px 60px rgba(0,0,0,.5)',
          maxWidth: 460, width: '100%',
          padding: 22, display: 'flex', flexDirection: 'column', gap: 14,
          color: '#E6F1FB',
        }}
      >
        <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: '.2px' }}>{title}</div>
        <div style={{ fontSize: 13, lineHeight: 1.6, color: '#B5D4F4' }}>{message}</div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 6 }}>
          <button onClick={onCancel} style={{
            padding: '9px 16px', borderRadius: 6,
            background: 'transparent', color: '#B5D4F4',
            border: '1px solid #185FA5', fontSize: 12.5, fontWeight: 700,
            fontFamily: 'inherit', cursor: 'pointer', transition: 'all .15s',
          }}>Batal</button>
          <button onClick={onConfirm} autoFocus style={{
            padding: '9px 16px', borderRadius: 6,
            background: confirmBg, color: '#FFFFFF',
            border: 'none', fontSize: 12.5, fontWeight: 800,
            fontFamily: 'inherit', cursor: 'pointer', transition: 'all .15s',
            boxShadow: `0 4px 12px ${confirmShadow}`,
          }}>{confirmLabel}</button>
        </div>
      </div>
      <style>{`@keyframes pkConfirmFade { from { opacity: 0 } to { opacity: 1 } }`}</style>
    </div>
  )
}
