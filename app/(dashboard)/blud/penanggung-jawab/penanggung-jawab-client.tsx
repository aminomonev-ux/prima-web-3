'use client'
// CRUD 1-kolom Penanggung Jawab. Master data untuk dropdown kolom PJ di DPA & Pergeseran.

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { toast } from 'sonner'
import { Plus, Save, Users, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'
import DeleteButton from '@/components/ui/DeleteButton'
import PrimaButton from '@/components/ui/PrimaButton'
import { pagerBtn } from '@/lib/shared/blud-table-styles'

interface Row { label: string }
const PAGE_SIZE = 50

export default function PenanggungJawabClient() {
  const [rows,    setRows]    = useState<Row[]>([])
  const [loading, setLoading] = useState(false)
  const [saving,  setSaving]  = useState(false)
  const [safetyWarning, setSafetyWarning] = useState<{ existing: number; incoming: number; dropPct: number } | null>(null)
  const [page,    setPage]    = useState(1)
  // L51 optimistic locking + R2 abort + R3 guard
  const [version, setVersion] = useState<number>(0)
  const loadCtrlRef = useRef<AbortController | null>(null)
  const submittingRef = useRef(false)

  // L58: notif standar sonner (richColors dari Toaster global)
  function showToast(msg: string, ok = true) {
    if (ok) toast.success(msg)
    else toast.error(msg)
  }

  const load = useCallback(async () => {
    loadCtrlRef.current?.abort()
    const ctrl = new AbortController()
    loadCtrlRef.current = ctrl
    setLoading(true)
    try {
      const res  = await fetch('/api/blud/penanggung-jawab', { signal: ctrl.signal })
      if (ctrl.signal.aborted) return
      const json = await res.json()
      if (json.ok) {
        setRows((json.data as Row[]).map(d => ({ label: d.label })))
        setVersion(typeof json.version === 'number' ? json.version : 0)
      } else {
        showToast(json.error || 'Gagal memuat data', false)
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') return
      showToast('Gagal memuat data', false)
    }
    finally   { setLoading(false) }
  }, [])

  useEffect(() => { queueMicrotask(() => void load()) }, [load])

  function addRow() { setRows(p => [...p, { label: '' }]) }
  function deleteRow(idx: number) {
    const target = rows[idx]
    setRows(p => p.filter((_, i) => i !== idx))
    toast.success(`Baris "${target?.label || 'tanpa label'}" dihapus. Klik Simpan untuk persist.`)
  }
  function updateRow(idx: number, label: string) { setRows(p => p.map((r, i) => i === idx ? { label } : r)) }
  function moveRow(idx: number, direction: 'up' | 'down') {
    setRows(prev => {
      const next = [...prev]
      const target = direction === 'up' ? idx - 1 : idx + 1
      if (target < 0 || target >= next.length) return prev
      ;[next[idx], next[target]] = [next[target], next[idx]]
      return next
    })
  }

  async function simpan(force = false) {
    if (submittingRef.current) return
    submittingRef.current = true
    setSaving(true)
    try {
      const res = await fetch('/api/blud/penanggung-jawab', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body:   JSON.stringify({ rows, force, expected_version: version }),
      })
      const json = await res.json()
      if (res.status === 409 && json.code === 'VERSION_CONFLICT') {
        showToast('⚠️ Data sudah diubah pengguna lain. Memuat versi terbaru…', false)
        await load()
        return
      }
      if (res.status === 409 && json.code === 'SAFETY_THRESHOLD') {
        setSafetyWarning({ existing: json.existing, incoming: json.incoming, dropPct: json.dropPct })
        return
      }
      if (res.status === 429) { showToast(json.error || 'Terlalu banyak permintaan', false); return }
      if (json.ok) {
        showToast(json.message)
        if (typeof json.version === 'number') setVersion(json.version)
      } else {
        showToast(json.error || 'Gagal simpan', false)
      }
    } catch { showToast('Gagal menyimpan', false) }
    finally  { submittingRef.current = false; setSaving(false) }
  }

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const safePage = page > totalPages ? 1 : page
  const pageStart = (safePage - 1) * PAGE_SIZE
  const pageRows  = useMemo(() => rows.slice(pageStart, pageStart + PAGE_SIZE), [rows, pageStart])

  function addRowAndJump() {
    addRow()
    setPage(Math.max(1, Math.ceil((rows.length + 1) / PAGE_SIZE)))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{
        background: '#042C53', border: '1px solid #0C447C', borderRadius: 10,
        padding: '10px 16px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10,
      }}>
        <Users style={{ width: 18, height: 18, color: '#EF9F27' }} />
        <h1 style={{ fontWeight: 800, fontSize: 14, color: '#E6F1FB', margin: 0 }}>
          Penanggung Jawab — Daftar Pejabat
        </h1>
        <span style={{ fontSize: 11, color: '#85B7EB' }}>
          {rows.length} baris {loading && '(memuat...)'}
        </span>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          <PrimaButton variant="primary" iconLeft={<Save size={14} />}
            onClick={() => simpan()} disabled={saving}>
            {saving ? 'Menyimpan...' : 'Simpan'}
          </PrimaButton>
        </div>
      </div>

      {/* Info banner — fungsi menu. Theme-aware text via .blud-info-banner class. */}
      <div className="blud-info-banner" style={{
        background: 'rgba(124,92,252,.28)', border: '1px solid rgba(124,92,252,.50)',
        borderRadius: 10, padding: '10px 14px', fontSize: 11.5,
        display: 'flex', gap: 8, alignItems: 'flex-start',
      }}>
        <span style={{ fontSize: 14, lineHeight: 1 }}>ℹ️</span>
        <div style={{ flex: 1, lineHeight: 1.6 }}>
          Daftar ini jadi opsi dropdown di kolom <strong>Penanggung Jawab</strong> di DPA & Pergeseran.
          Tambah / hapus / urutkan sesuai kebutuhan.
        </div>
      </div>

      <div style={{
        background: '#042C53', border: '1px solid #0C447C', borderRadius: 10,
        padding: '10px 16px', display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center',
      }}>
        <PrimaButton variant="purple" iconLeft={<Plus size={14} />} onClick={addRowAndJump}>
          Tambah Baris
        </PrimaButton>
      </div>

      <div className="ma-scroll-wrapper">
        <table className="dpa-table master-akun-table">
          <thead>
            <tr>
              <th style={{ width: 64, textAlign: 'center' }}>Geser</th>
              <th>Penanggung Jawab</th>
              <th style={{ width: 44, textAlign: 'center' }}>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={3} style={{ textAlign: 'center', padding: '32px 12px', color: '#85B7EB' }}>
                  {loading ? 'Memuat...' : 'Belum ada data. Klik "Tambah Baris".'}
                </td>
              </tr>
            )}
            {pageRows.map(r => {
              const realIdx = rows.indexOf(r)
              return (
                <tr key={realIdx}>
                  <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                    <button onClick={() => moveRow(realIdx, 'up')} disabled={realIdx === 0} className="kb-move-btn" data-tooltip="Pindah ke atas">
                      <ChevronUp size={13} />
                    </button>
                    <button onClick={() => moveRow(realIdx, 'down')} disabled={realIdx === rows.length - 1} className="kb-move-btn" data-tooltip="Pindah ke bawah">
                      <ChevronDown size={13} />
                    </button>
                  </td>
                  <td>
                    <input
                      type="text"
                      value={r.label}
                      onChange={e => updateRow(realIdx, e.target.value)}
                      placeholder="e.g. Kasubbag Perbendaharaan"
                    />
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <DeleteButton onClick={() => deleteRow(realIdx)} data-tooltip="Hapus baris" iconSize={13} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {rows.length > PAGE_SIZE && (
        <div style={{
          background: '#042C53', border: '1px solid #0C447C', borderRadius: 10,
          padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
        }}>
          <span style={{ fontSize: 11.5, color: '#85B7EB', fontWeight: 500 }}>
            Menampilkan <strong style={{ color: '#E6F1FB' }}>{pageStart + 1}</strong>
            <span style={{ margin: '0 4px' }}>–</span>
            <strong style={{ color: '#E6F1FB' }}>{Math.min(pageStart + PAGE_SIZE, rows.length)}</strong>
            <span style={{ margin: '0 4px' }}>dari</span>
            <strong style={{ color: '#E6F1FB' }}>{rows.length}</strong>
          </span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 4, alignItems: 'center' }}>
            <button onClick={() => setPage(1)} disabled={page === 1} style={pagerBtn(page === 1)} data-tooltip="Halaman pertama">
              <ChevronsLeft size={13} />
            </button>
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} style={pagerBtn(page === 1)} data-tooltip="Sebelumnya">
              <ChevronLeft size={13} />
            </button>
            <span style={{
              padding: '5px 10px', fontSize: 11.5, fontWeight: 700, color: '#E6F1FB',
              background: 'rgba(239,159,39,.15)', borderRadius: 6,
              border: '1px solid rgba(239,159,39,.30)', minWidth: 60, textAlign: 'center',
            }}>
              {page} / {totalPages}
            </span>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} style={pagerBtn(page === totalPages)} data-tooltip="Berikutnya">
              <ChevronRight size={13} />
            </button>
            <button onClick={() => setPage(totalPages)} disabled={page === totalPages} style={pagerBtn(page === totalPages)} data-tooltip="Halaman terakhir">
              <ChevronsRight size={13} />
            </button>
          </div>
        </div>
      )}

      {safetyWarning && (
        <div onClick={() => setSafetyWarning(null)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.6)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 }}>
          <div onClick={e => e.stopPropagation()} style={{ background:'#042C53', border:'2px solid #E24B4A', borderRadius:'14px', padding:'24px', maxWidth:'500px', width:'90%', boxShadow:'0 20px 60px rgba(0,0,0,.5)' }}>
            <div style={{ fontSize:'15px', fontWeight:800, color:'#E24B4A', marginBottom:'10px' }}>
              ⚠️ Peringatan: Drop Banyak Baris
            </div>
            <div style={{ fontSize:'12px', color:'#B5D4F4', lineHeight:1.7, marginBottom:'16px' }}>
              Anda akan menggantikan <strong style={{ color:'#FAC775' }}>{safetyWarning.existing}</strong> baris existing dengan <strong style={{ color:'#FAC775' }}>{safetyWarning.incoming}</strong> baris baru — drop <strong style={{ color:'#E24B4A' }}>{safetyWarning.dropPct.toFixed(1)}%</strong>.
              <br /><br />
              <strong style={{ color:'#E24B4A' }}>Tindakan ini PERMANEN.</strong> Lanjutkan?
            </div>
            <div style={{ display:'flex', gap:'8px', justifyContent:'flex-end' }}>
              <PrimaButton variant="ghost" onClick={() => setSafetyWarning(null)} disabled={saving}>
                Batal
              </PrimaButton>
              <PrimaButton variant="danger" onClick={() => { setSafetyWarning(null); void simpan(true) }} disabled={saving}>
                Ya, Tetap Simpan
              </PrimaButton>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

