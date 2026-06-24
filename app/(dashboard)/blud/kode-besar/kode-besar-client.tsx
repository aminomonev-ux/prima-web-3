'use client'
// app/(dashboard)/blud/kode-besar/kode-besar-client.tsx
// CRUD grid 2-kolom (kode + uraian) — mirror master-akun-client.
// Pattern: load → edit in-memory → "Simpan" POST replace-all.
// Helper compliance: bulkInsert + withTransaction (di data layer), Zod (di schema),
// rate limit (di route), audit log (di route), SafetyError modal (BLUD v1.2).

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { toast } from 'sonner'
import { Plus, Save, Search, Upload, FileSpreadsheet, HelpCircle, Download, X, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ChevronUp, ChevronDown } from 'lucide-react'
import DeleteButton from '@/components/ui/DeleteButton'
import PrimaButton from '@/components/ui/PrimaButton'
import { cellNum, cellSampleHead, cellSample, pagerBtn } from '@/lib/shared/blud-table-styles'

type Level = 'L1' | 'L2' | 'L2.1'
interface Row { kode: string; uraian: string; level: Level; parent_kode: string | null }
const PAGE_SIZE = 50
const LEVEL_COLOR: Record<Level, string> = {
  'L1':   '#B45309',          // amber (match GRANDMASTER row di globals.css)
  'L2':   'rgba(16,185,129,.6)', // emerald (MASTER)
  'L2.1': '#334155',          // slate (CHILD)
}

export default function KodeBesarClient() {
  const [rows,     setRows]     = useState<Row[]>([])
  const [search,   setSearch]   = useState('')
  const [loading,  setLoading]  = useState(false)
  const [saving,   setSaving]   = useState(false)
  const [importing,setImporting]= useState(false)
  const [showFormat,setShowFormat] = useState(false)
  const [safetyWarning, setSafetyWarning] = useState<{ existing: number; incoming: number; dropPct: number } | null>(null)
  const [page,     setPage]     = useState(1)
  const fileRef = useRef<HTMLInputElement>(null)
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
      const res  = await fetch('/api/blud/kode-besar', { signal: ctrl.signal })
      if (ctrl.signal.aborted) return
      const json = await res.json()
      if (json.ok) {
        setRows((json.data as Row[]).map(d => ({
          kode: d.kode, uraian: d.uraian,
          level: (d.level ?? 'L2') as Level,
          parent_kode: d.parent_kode ?? null,
        })))
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

  function addRow() {
    setRows(prev => [...prev, { kode: '', uraian: '', level: 'L2' as Level, parent_kode: null }])
  }
  function deleteRow(idx: number) {
    const target = rows[idx]
    setRows(prev => prev.filter((_, i) => i !== idx))
    toast.success(`Baris "${target?.uraian || target?.kode || 'tanpa uraian'}" dihapus. Klik Simpan untuk persist.`)
  }
  function updateRow(idx: number, field: 'kode' | 'uraian', value: string) {
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r))
  }
  function updateLevel(idx: number, level: Level) {
    setRows(prev => prev.map((r, i) => {
      if (i !== idx) return r
      // L1 → force parent_kode null. L2 → also null (auto-detect later). L2.1 → keep existing.
      const parent_kode = level === 'L2.1' ? r.parent_kode : null
      return { ...r, level, parent_kode }
    }))
  }
  function updateParent(idx: number, parent_kode: string | null) {
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, parent_kode } : r))
  }
  // Move row dengan swap adjacent — sederhana (flat list, tidak peduli hierarki).
  // Urutan ini di-persist saat Simpan (urutan field di-set ulang di server).
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
      const res = await fetch('/api/blud/kode-besar', {
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
        setSafetyWarning({
          existing: json.existing,
          incoming: json.incoming,
          dropPct:  json.dropPct,
        })
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

  // ── Impor Excel ──────────────────────────────────────────────────────────
  async function handleFile(file: File) {
    setImporting(true)
    try {
      // SDL-Audit v1.1 Phase 4: migrate xlsx → exceljs (CVE prototype pollution + ReDoS).
      const { readXlsxAsAoa } = await import('@/lib/shared/excel-export')
      const raw = await readXlsxAsAoa(file)
      if (raw.length === 0) { showToast('Sheet kosong', false); return }
      const parsed: Row[] = []
      for (const r of raw) {
        const kode   = String(r[0] ?? '').trim()
        const uraian = String(r[1] ?? '').trim()
        if (!uraian) continue
        if (parsed.length === 0 && /^(uraian|nama|akun)/i.test(uraian)) continue
        // Default level: L2 (paling umum). User bisa ubah manual via dropdown setelah import.
        parsed.push({ kode, uraian, level: 'L2' as Level, parent_kode: null })
      }
      if (!parsed.length) { showToast('Tidak ada baris valid di Excel', false); return }
      setRows(parsed)
      showToast(`${parsed.length} baris berhasil di-import. Klik Simpan untuk persist.`)
    } catch (err) {
      console.error('[Impor Excel]', err)
      showToast('Gagal membaca file Excel', false)
    } finally {
      setImporting(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const filtered = useMemo(() => (
    search.trim()
      ? rows.filter(r =>
          r.kode.toLowerCase().includes(search.toLowerCase()) ||
          r.uraian.toLowerCase().includes(search.toLowerCase()))
      : rows
  ), [rows, search])

  // ─── Pagination 50/page ─────────────────────────────────────────────────
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  // Derived: page yg di-render selalu valid. Reset ke 1 via handler search (bukan effect)
  // untuk cegah cascading render (react-hooks/set-state-in-effect).
  const safePage = page > totalPages ? 1 : page
  const pageStart = (safePage - 1) * PAGE_SIZE
  const pageRows  = filtered.slice(pageStart, pageStart + PAGE_SIZE)
  function addRowAndJump() {
    addRow()
    setPage(Math.max(1, Math.ceil((rows.length + 1) / PAGE_SIZE)))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Header strip */}
      <div style={{
        background: '#042C53', border: '1px solid #0C447C', borderRadius: 10,
        padding: '10px 16px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10,
      }}>
        <FileSpreadsheet style={{ width: 18, height: 18, color: '#EF9F27' }} />
        <h1 style={{ fontWeight: 800, fontSize: 14, color: '#E6F1FB', margin: 0 }}>
          Kode Besar — Template Awal DPA
        </h1>
        <span style={{ fontSize: 11, color: '#85B7EB' }}>
          {rows.length} baris {loading && '(memuat...)'}
        </span>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
            style={{ display: 'none' }}
          />
          <PrimaButton variant="ghost" iconLeft={<HelpCircle size={14} />}
            onClick={() => setShowFormat(true)}
            data-tooltip="Lihat format & download template">
            Format
          </PrimaButton>
          <PrimaButton variant="success" iconLeft={<Upload size={14} />}
            onClick={() => fileRef.current?.click()} disabled={importing}>
            {importing ? 'Memproses...' : 'Impor Excel'}
          </PrimaButton>
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
          Daftar ini jadi <strong>template awal</strong> saat klik <strong>&quot;Form Baru&quot;</strong> di menu DPA.
          Setiap baris di-inject ke DPA dengan hierarki <strong>L1 (TOTAL) → L2 (kelompok) → L2.1 (leaf)</strong>.
          Untuk L2.1, wajib pilih parent L2 lewat dropdown. L2 auto-detect parent L1 dari segmen pertama kode.
        </div>
      </div>

      {/* Toolbar search + tambah */}
      <div style={{
        background: '#042C53', border: '1px solid #0C447C', borderRadius: 10,
        padding: '10px 16px', display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center',
      }}>
        <div style={{ position: 'relative', flex: '1 1 280px', maxWidth: 360 }}>
          <Search size={14} style={{
            position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
            color: '#85B7EB', pointerEvents: 'none',
          }} />
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder="Cari kode atau uraian..."
            style={{
              width: '100%', padding: '8px 12px 8px 32px', borderRadius: 6,
              border: '1px solid #185FA5', background: '#021A33', color: '#E6F1FB',
              fontSize: 12,
            }}
          />
        </div>
        <PrimaButton variant="purple" iconLeft={<Plus size={14} />} onClick={addRowAndJump}>
          Tambah Baris
        </PrimaButton>
      </div>

      {/* Grid — scroll vertikal + sticky thead */}
      <div className="ma-scroll-wrapper">
        <table className="dpa-table master-akun-table">
          <thead>
            <tr>
              <th style={{ width: 64, textAlign: 'center' }}>Geser</th>
              <th style={{ width: 160 }}>Kode</th>
              <th>Uraian</th>
              <th style={{ width: 90, textAlign: 'center' }}>Level</th>
              <th style={{ width: 140 }}>Parent (untuk L2.1)</th>
              <th style={{ width: 64, textAlign: 'center' }}>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '32px 12px', color: '#85B7EB' }}>
                  {loading ? 'Memuat...' : search ? 'Tidak ada hasil pencarian' : 'Belum ada data. Klik "Tambah Baris" atau "Impor Excel".'}
                </td>
              </tr>
            )}
            {pageRows.map(r => {
              const realIdx = rows.indexOf(r)
              // L2 candidates untuk dropdown parent L2.1 — ambil dari semua rows level L2 yang punya kode
              const l2Options = rows.filter(x => x.level === 'L2' && x.kode.trim() !== '')
              return (
                <tr key={realIdx}>
                  <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                    <button
                      onClick={() => moveRow(realIdx, 'up')}
                      disabled={realIdx === 0}
                      className="kb-move-btn"
                      data-tooltip="Pindah ke atas"
                    >
                      <ChevronUp size={13} />
                    </button>
                    <button
                      onClick={() => moveRow(realIdx, 'down')}
                      disabled={realIdx === rows.length - 1}
                      className="kb-move-btn"
                      data-tooltip="Pindah ke bawah"
                    >
                      <ChevronDown size={13} />
                    </button>
                  </td>
                  <td>
                    <input
                      type="text"
                      value={r.kode}
                      onChange={e => updateRow(realIdx, 'kode', e.target.value)}
                      placeholder="5.1"
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      value={r.uraian}
                      onChange={e => updateRow(realIdx, 'uraian', e.target.value)}
                      placeholder="Belanja Operasi BLUD"
                    />
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <select
                      value={r.level}
                      onChange={e => updateLevel(realIdx, e.target.value as Level)}
                      style={{
                        width: '100%', padding: '4px 6px', borderRadius: 4,
                        border: '1px solid #185FA5', background: LEVEL_COLOR[r.level],
                        color: '#FFFFFF', fontSize: 11, fontWeight: 700,
                        textAlign: 'center', cursor: 'pointer',
                      }}
                    >
                      <option value="L1">L1</option>
                      <option value="L2">L2</option>
                      <option value="L2.1">L2.1</option>
                    </select>
                  </td>
                  <td>
                    {r.level === 'L2.1' ? (
                      <select
                        value={r.parent_kode ?? ''}
                        onChange={e => updateParent(realIdx, e.target.value || null)}
                        style={{
                          width: '100%', padding: '4px 6px', borderRadius: 4,
                          border: `1px solid ${r.parent_kode ? '#185FA5' : '#E24B4A'}`,
                          background: '#021A33', color: '#E6F1FB',
                          fontSize: 11, cursor: 'pointer',
                        }}
                        title={!r.parent_kode ? 'Wajib pilih parent untuk L2.1' : ''}
                      >
                        <option value="">— Pilih L2 —</option>
                        {l2Options.map(l2 => (
                          <option key={l2.kode} value={l2.kode}>
                            {l2.kode} · {l2.uraian.slice(0, 30)}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span style={{ fontSize: 10.5, color: '#85B7EB', fontStyle: 'italic', display: 'block', textAlign: 'center' }}>
                        {r.level === 'L1' ? 'root' : 'auto'}
                      </span>
                    )}
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

      {/* Pagination */}
      {filtered.length > PAGE_SIZE && (
        <div style={{
          background: '#042C53', border: '1px solid #0C447C', borderRadius: 10,
          padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 8,
          flexWrap: 'wrap',
        }}>
          <span style={{ fontSize: 11.5, color: '#85B7EB', fontWeight: 500 }}>
            Menampilkan <strong style={{ color: '#E6F1FB' }}>{pageStart + 1}</strong>
            <span style={{ margin: '0 4px' }}>–</span>
            <strong style={{ color: '#E6F1FB' }}>{Math.min(pageStart + PAGE_SIZE, filtered.length)}</strong>
            <span style={{ margin: '0 4px' }}>dari</span>
            <strong style={{ color: '#E6F1FB' }}>{filtered.length}</strong> baris
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

      {/* Modal Format Excel */}
      {showFormat && (
        <div
          className="fixed inset-0 flex items-center justify-center"
          style={{ zIndex: 1000, background: 'rgba(0,0,0,.55)', backdropFilter: 'blur(4px)' }}
          onClick={() => setShowFormat(false)}
        >
          <div
            className="blud-modal-card rounded-xl"
            style={{ width: 460, maxWidth: '95vw' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="blud-modal-header flex items-center justify-between px-5 py-4">
              <span className="blud-modal-title font-semibold">Format Excel — Kode Besar</span>
              <button onClick={() => setShowFormat(false)} className="blud-modal-close">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <p className="blud-modal-subtitle text-sm">
                File Excel harus berisi <strong>2 kolom</strong> dengan urutan:
              </p>

              <table style={{
                width: '100%', borderCollapse: 'collapse', fontSize: 12,
                fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
              }} className="ma-format-table">
                <thead>
                  <tr>
                    <th style={{ width: 36, padding: '6px 8px', textAlign: 'center' }}>#</th>
                    <th style={{ width: 130, padding: '6px 8px', textAlign: 'left' }}>A — Kode</th>
                    <th style={{ padding: '6px 8px', textAlign: 'left' }}>B — Uraian</th>
                  </tr>
                </thead>
                <tbody>
                  <tr><td style={cellNum}>1</td><td style={cellSampleHead}>Kode</td><td style={cellSampleHead}>Uraian</td></tr>
                  <tr><td style={cellNum}>2</td><td style={cellSample}>5.X</td><td style={cellSample}>Belanja Daerah</td></tr>
                  <tr><td style={cellNum}>3</td><td style={cellSample}>5.1</td><td style={cellSample}>Belanja Operasi BLUD</td></tr>
                  <tr><td style={cellNum}>4</td><td style={cellSample}>5.1.1</td><td style={cellSample}>Belanja Pegawai</td></tr>
                </tbody>
              </table>

              <ul className="blud-modal-subtitle text-xs" style={{ paddingLeft: 18, lineHeight: 1.7, margin: 0 }}>
                <li>Kolom <strong>A</strong> = Kode kategori (bebas format, e.g. <code>5.X</code> atau <code>5.1.1</code>)</li>
                <li>Kolom <strong>B</strong> = Uraian / nama kategori</li>
                <li>Baris pertama boleh header — otomatis di-skip kalau berisi kata <em>Uraian/Nama/Akun</em></li>
                <li>Maks 1000 baris per import, format: <code>.xlsx</code> · <code>.xls</code> · <code>.csv</code></li>
              </ul>

              <div className="flex justify-between items-center" style={{ paddingTop: 4 }}>
                <a
                  href="/templates/master-akun-template.xlsx"
                  download="kode-besar-template.xlsx"
                  className="blud-modal-option"
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '8px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                    textDecoration: 'none',
                  }}
                >
                  <Download size={14} />
                  Download Template
                </a>
                <PrimaButton variant="primary" onClick={() => setShowFormat(false)}>Mengerti</PrimaButton>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal safety threshold drop >50% — BLUD v1.2 pattern */}
      {safetyWarning && (
        <div onClick={() => setSafetyWarning(null)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.6)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 }}>
          <div onClick={e => e.stopPropagation()} style={{ background:'#042C53', border:'2px solid #E24B4A', borderRadius:'14px', padding:'24px', maxWidth:'500px', width:'90%', boxShadow:'0 20px 60px rgba(0,0,0,.5)' }}>
            <div style={{ fontSize:'15px', fontWeight:800, color:'#E24B4A', marginBottom:'10px' }}>
              ⚠️ Peringatan: Drop Banyak Baris
            </div>
            <div style={{ fontSize:'12px', color:'#B5D4F4', lineHeight:1.7, marginBottom:'16px' }}>
              Anda akan menggantikan <strong style={{ color:'#FAC775' }}>{safetyWarning.existing}</strong> baris existing dengan <strong style={{ color:'#FAC775' }}>{safetyWarning.incoming}</strong> baris baru — drop <strong style={{ color:'#E24B4A' }}>{safetyWarning.dropPct.toFixed(1)}%</strong>.
              <br /><br />
              Bisa terjadi kalau import file salah / hapus banyak baris secara tidak sengaja. <strong style={{ color:'#E24B4A' }}>Tindakan ini PERMANEN.</strong>
              <br /><br />
              Lanjutkan tetap simpan?
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

