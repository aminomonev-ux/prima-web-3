'use client'
// app/(dashboard)/blud/cetak/cetak-client.tsx
// Menu Cetak BLUD — toolbar (Menu/View/History) + 3 tombol export (Cetak/PDF/Excel)
// + render area. Port dari Aplikasi BLUD (GAS) — adapted ke MySQL + jsPDF + exceljs.
//
// View per menu:
//   DPA BLUD     → DPA + Penanggung Jawab (rekap)
//   Pergeseran   → Pergeseran DPA
//   Master Akun  → Master akun (no version)
//
// Theme-aware via CSS [data-theme="light"] di blud-shell <style> + token inline.

import { useState, useEffect, useCallback } from 'react'
import { Printer, Calendar, Save, History } from 'lucide-react'
import { toast } from 'sonner'
import PrimaButton from '@/components/ui/PrimaButton'
import DownloadButton from '@/components/ui/DownloadButton'

// ── Types lokal (sinkron dengan lib/blud/cetak-data.ts) ──
type Menu = 'dpa' | 'pergeseran' | 'master-akun'
type ViewDpa = 'dpa' | 'penanggungJawab'
type ViewPergeseran = 'rekapPergeseran'
type ViewMasterAkun = 'masterAkun'
type View = ViewDpa | ViewPergeseran | ViewMasterAkun

interface VersiOption { versi: string; jumlah_baris: number }

const MENU_LABELS: Record<Menu, string> = {
  'dpa':         'DPA BLUD',
  'pergeseran':  'Pergeseran DPA',
  'master-akun': 'Master Akun',
}

const VIEW_OPTIONS: Record<Menu, Array<{ value: View; label: string }>> = {
  'dpa': [
    { value: 'dpa',              label: 'DPA BLUD' },
    { value: 'penanggungJawab',  label: 'PENANGGUNG JAWAB' },
  ],
  'pergeseran': [
    { value: 'rekapPergeseran',  label: 'Rekap Pergeseran' },
  ],
  'master-akun': [
    { value: 'masterAkun',       label: 'Master Akun' },
  ],
}

export default function CetakClient() {
  // ── State ──
  const [menu, setMenu] = useState<Menu>('dpa')
  const [view, setView] = useState<View>('dpa')
  const [tanggal, setTanggal] = useState<string>('')           // filter optional
  const [historyVersi, setHistoryVersi] = useState<string>('')  // dropdown history
  const [historyList, setHistoryList] = useState<VersiOption[]>([])
  const [loading, setLoading] = useState(false)
  const [renderedHtml, setRenderedHtml] = useState<string>('')  // tabel hasil Cetak
  const [renderedData, setRenderedData] = useState<unknown>(null) // raw rows untuk export

  // Reset view+state saat menu berubah — pakai handler (bukan effect)
  // untuk hindari cascading render (react-hooks/set-state-in-effect).
  const handleMenuChange = useCallback((newMenu: Menu) => {
    setMenu(newMenu)
    const firstView = VIEW_OPTIONS[newMenu][0]?.value
    if (firstView) setView(firstView)
    setRenderedHtml('')
    setRenderedData(null)
    setHistoryVersi('')
    setTanggal('')
    setHistoryList([])
  }, [])

  // Load history dropdown saat menu = dpa atau pergeseran.
  // setState dalam async callback (post-await) — tidak trigger set-state-in-effect.
  useEffect(() => {
    if (menu === 'master-akun') return
    const ctrl = new AbortController()
    ;(async () => {
      try {
        const path = menu === 'dpa' ? '/api/blud/dpa?mode=history' : '/api/blud/pergeseran?mode=history'
        const r = await fetch(path, { signal: ctrl.signal })
        if (!r.ok) return
        const j = await r.json() as { ok: boolean; data?: Array<{ versi_tanggal: string; jumlah_baris: number }> }
        if (!j.ok || !j.data) return
        setHistoryList(j.data.map(d => ({ versi: d.versi_tanggal, jumlah_baris: d.jumlah_baris })))
      } catch { /* abort */ }
    })()
    return () => ctrl.abort()
  }, [menu])

  // ── Action: Cetak (fetch raw data + render tabel client-side) ──
  const onCetak = useCallback(async () => {
    setLoading(true)
    setRenderedHtml('')
    setRenderedData(null)
    try {
      // Pilih endpoint per menu — reuse existing API
      let path = ''
      if (menu === 'dpa') {
        const tgl = tanggal || historyVersi
        path = tgl ? `/api/blud/dpa?tanggal=${encodeURIComponent(tgl)}` : '/api/blud/dpa'
      } else if (menu === 'pergeseran') {
        const tgl = tanggal || historyVersi
        path = tgl ? `/api/blud/pergeseran?tanggal=${encodeURIComponent(tgl)}` : '/api/blud/pergeseran'
      } else { // master-akun
        path = '/api/blud/master-akun'
      }

      const r = await fetch(path)
      if (!r.ok) { toast.error('Gagal memuat data'); return }
      const j = await r.json() as { ok: boolean; data?: unknown; versi_tanggal?: string | null; error?: string }
      if (!j.ok) { toast.error(j.error ?? 'Gagal memuat'); return }

      // Render HTML via cetak-data helper (client-side aggregation)
      const { renderCetakHtml } = await import('@/lib/blud/cetak-data')
      const result = renderCetakHtml({ menu, view, rows: j.data, versi: j.versi_tanggal ?? historyVersi ?? null, tanggal })
      setRenderedHtml(result.html)
      setRenderedData(result.rows)
    } catch (e) {
      toast.error('Error: ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setLoading(false)
    }
  }, [menu, view, tanggal, historyVersi])

  // Audit BLUD v1.2 (B-NEW-2): log export event ke audit trail (fire-and-forget).
  const logExport = useCallback(async (type: 'pdf' | 'xlsx') => {
    try {
      await fetch('/api/blud/export-log', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type, menu, view, versi: tanggal || historyVersi || null,
          rows: Array.isArray(renderedData) ? renderedData.length : undefined,
        }),
      })
    } catch { /* silent — jangan blok user export karena audit log fail */ }
  }, [menu, view, tanggal, historyVersi, renderedData])

  // ── Action: PDF ──
  const onPdf = useCallback(async () => {
    if (!renderedData) { toast.warning('Klik Cetak dulu untuk memuat data.'); return }
    try {
      const { exportToPdf } = await import('@/lib/blud/export/pdf')
      await exportToPdf({ menu, view, tanggal, versi: historyVersi, rows: renderedData })
      void logExport('pdf')
    } catch (e) {
      toast.error('Gagal export PDF: ' + (e instanceof Error ? e.message : String(e)))
    }
  }, [renderedData, menu, view, tanggal, historyVersi, logExport])

  // ── Action: Excel ──
  const onExcel = useCallback(async () => {
    if (!renderedData) { toast.warning('Klik Cetak dulu untuk memuat data.'); return }
    try {
      const { exportToExcel } = await import('@/lib/blud/export/excel')
      await exportToExcel({ menu, view, tanggal, versi: historyVersi, rows: renderedData })
      void logExport('xlsx')
    } catch (e) {
      toast.error('Gagal export Excel: ' + (e instanceof Error ? e.message : String(e)))
    }
  }, [renderedData, menu, view, tanggal, historyVersi, logExport])

  // ── Action: Simpan Rekap PK (hanya view penanggungJawab) ──
  const onSimpanRekapPK = useCallback(async () => {
    if (!renderedData) { toast.warning('Klik Cetak dulu agar data rekap muncul.'); return }
    if (menu !== 'dpa' || view !== 'penanggungJawab') return
    try {
      const r = await fetch('/api/blud/rekap-pk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ versi: historyVersi || null, rows: renderedData }),
      })
      const data = await r.json() as { ok?: boolean; message?: string }
      if (!r.ok || !data.ok) {
        toast.error(data.message ?? 'Gagal simpan rekap PK')
        return
      }
      toast.success(data.message ?? 'Rekap PK tersimpan.')
    } catch (e) {
      toast.error('Error: ' + (e instanceof Error ? e.message : String(e)))
    }
  }, [renderedData, menu, view, historyVersi])

  const showSimpanPK = menu === 'dpa' && view === 'penanggungJawab'

  // ── Toolbar ──
  return (
    <div className="cetak-wrap" style={{ maxWidth: 1400, margin: '0 auto', padding: '4px 0' }}>
      <style>{`
        .cetak-card {
          background: rgba(4,44,83,.6); border: 1px solid rgba(255,255,255,.08);
          border-radius: 14px; padding: 18px 22px; margin-bottom: 16px;
        }
        [data-theme="light"] .cetak-card {
          background: #FAFAFA; border: 1px solid rgba(0,0,0,.06);
          box-shadow: 0 1px 3px rgba(0,0,0,.04);
        }
        .cetak-title { display: flex; align-items: center; gap: 10px; font-size: 16px; font-weight: 800; color: #E6F1FB; margin-bottom: 4px; }
        [data-theme="light"] .cetak-title { color: #0F0F12; }
        .cetak-divider { height: 1px; background: rgba(255,255,255,.06); margin: 14px 0; }
        [data-theme="light"] .cetak-divider { background: rgba(0,0,0,.06); }

        .cetak-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)) auto; gap: 12px; align-items: end; }
        .cetak-field-label { font-size: 10.5px; font-weight: 800; letter-spacing: .8px; text-transform: uppercase; color: #85B7EB; margin-bottom: 5px; }
        [data-theme="light"] .cetak-field-label { color: #6B7280; }
        .cetak-select {
          padding: 9px 12px; border-radius: 9px;
          background: rgba(2,15,28,.6); border: 1.5px solid #185FA5; color: #E6F1FB;
          font-size: 13px; font-weight: 600; cursor: pointer; outline: none;
          width: 100%; font-family: inherit;
        }
        .cetak-select:focus { border-color: #EF9F27; }
        [data-theme="light"] .cetak-select { background: #FFFFFF; border-color: rgba(139,92,246,.25); color: #0F0F12; }
        [data-theme="light"] .cetak-select:focus { border-color: #8B5CF6; box-shadow: 0 0 0 3px rgba(139,92,246,.15); }
        .cetak-select:disabled { opacity: .55; cursor: not-allowed; }
        /* input date tidak kena baseline select global — calendar icon ikut tema */
        input.cetak-select[type="date"] { color-scheme: dark; }
        [data-theme="light"] input.cetak-select[type="date"] { color-scheme: light; }

        .cetak-btns { display: flex; gap: 8px; flex-wrap: wrap; }

        /* Rendered table area — base color biar h4 title + audit panel strong (color:inherit) kebaca di dark */
        .cetak-render { margin-top: 6px; overflow-x: auto; color: #E6F1FB; }
        [data-theme="light"] .cetak-render { color: #0F0F12; }
        .cetak-render table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
        .cetak-render th { background: linear-gradient(135deg,rgba(24,85,187,.25),rgba(59,130,246,.15)); color: #E6F1FB; padding: 9px 10px; text-align: left; font-weight: 700; border: 1px solid rgba(255,255,255,.08); }
        .cetak-render td { padding: 7px 10px; color: #E6F1FB; border: 1px solid rgba(255,255,255,.05); }
        .cetak-render tr:hover td { background: rgba(255,255,255,.03); }
        [data-theme="light"] .cetak-render th { background: linear-gradient(135deg,rgba(139,92,246,.18),rgba(236,72,153,.12)); color: #5B21B6; border-color: rgba(139,92,246,.22); }
        [data-theme="light"] .cetak-render td { color: #374151; border-color: rgba(139,92,246,.08); }
        [data-theme="light"] .cetak-render tr:hover td { background: rgba(139,92,246,.04); }

        .cetak-empty {
          text-align: center; color: #85B7EB; font-size: 13px; padding: 60px 20px;
          background: rgba(2,15,28,.3); border: 1px dashed rgba(255,255,255,.1); border-radius: 12px;
          font-style: italic; opacity: .85;
        }
        [data-theme="light"] .cetak-empty { color: #6B7280; background: rgba(0,0,0,.02); border-color: rgba(0,0,0,.08); }
      `}</style>

      {/* ── Toolbar ── */}
      <div className="cetak-card">
        <div className="cetak-title">
          <Printer size={20} strokeWidth={2.4} color="#0891b2" /> Cetak Laporan BLUD
        </div>
        <div style={{ fontSize: 12, color: '#85B7EB', fontWeight: 500 }}>Pilih menu &amp; view, lalu klik Cetak untuk render tabel</div>

        <div className="cetak-divider" />

        <div className="cetak-row">
          <div>
            <div className="cetak-field-label">Menu</div>
            <select className="cetak-select" value={menu} onChange={e => handleMenuChange(e.target.value as Menu)}>
              {(Object.keys(MENU_LABELS) as Menu[]).map(m => (
                <option key={m} value={m}>{MENU_LABELS[m]}</option>
              ))}
            </select>
          </div>
          <div>
            <div className="cetak-field-label">View</div>
            <select className="cetak-select" value={view} onChange={e => setView(e.target.value as View)}>
              {VIEW_OPTIONS[menu].map(v => <option key={v.value} value={v.value}>{v.label}</option>)}
            </select>
          </div>
          {menu !== 'master-akun' && (
            <div>
              <div className="cetak-field-label">
                <History size={11} style={{ display: 'inline', verticalAlign: '-1px' }} />{' '}
                History {menu === 'dpa' ? 'DPA' : 'Pergeseran'}
              </div>
              <select className="cetak-select" value={historyVersi} onChange={e => setHistoryVersi(e.target.value)}>
                <option value="">— Terbaru —</option>
                {historyList.map(v => (
                  <option key={v.versi} value={v.versi}>{v.versi} ({v.jumlah_baris} baris)</option>
                ))}
              </select>
            </div>
          )}
          {menu !== 'master-akun' && (
            <div>
              <div className="cetak-field-label">
                <Calendar size={11} style={{ display: 'inline', verticalAlign: '-1px' }} /> Tanggal
              </div>
              <input type="date" className="cetak-select" value={tanggal} onChange={e => setTanggal(e.target.value)} />
            </div>
          )}
          <div className="cetak-btns">
            <PrimaButton variant="primary" iconLeft={<Printer size={14} />}
              onClick={onCetak} disabled={loading}>
              {loading ? 'Memuat...' : 'Cetak'}
            </PrimaButton>
            <DownloadButton variant="pdf" label="PDF" onClick={onPdf} disabled={!renderedData} />
            <DownloadButton variant="excel" label="Excel" onClick={onExcel} disabled={!renderedData} />
            {showSimpanPK && (
              <PrimaButton variant="purple" iconLeft={<Save size={14} />}
                onClick={onSimpanRekapPK} disabled={!renderedData}>
                Simpan Rekap PK
              </PrimaButton>
            )}
          </div>
        </div>
      </div>

      {/* ── Render area ── */}
      <div className="cetak-card">
        {renderedHtml
          ? <div className="cetak-render" dangerouslySetInnerHTML={{ __html: renderedHtml }} />
          : <div className="cetak-empty">Belum ada data. Pilih menu &amp; view, lalu klik <strong>Cetak</strong>.</div>
        }
      </div>
    </div>
  )
}
