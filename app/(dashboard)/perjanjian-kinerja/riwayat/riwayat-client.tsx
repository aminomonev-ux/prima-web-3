'use client'
// app/(dashboard)/perjanjian-kinerja/riwayat/riwayat-client.tsx
// Riwayat list dokumen PK — paginated, filter status+jenis, action per row.
// Pattern: usePaginatedList (L21b PERF-W2), TableSkeleton (L31), fetchJson (L11f).

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Edit2, Download, FileText, AlertCircle, CheckCircle2, ChevronLeft, ChevronRight, Eye, X, Loader2 } from 'lucide-react'
import DeleteIcon from '@/components/ui/DeleteIcon'
import { fetchJson } from '@/lib/shared/api'
import { usePaginatedList } from '@/lib/shared/hooks'
import { TableSkeleton } from '@/components/ui/table-skeleton'
import PrimaButton from '@/components/ui/PrimaButton'
import DownloadButton from '@/components/ui/DownloadButton'
import { usePkYear } from '../_context/PkYearContext'
import { fmtDateID } from '../_utils/pk-format'
import type { Role } from '@/types'

type RiwayatRow = {
  id: number
  tahun: string
  tanggal_dokumen: string
  jenis_pk: 'MURNI' | 'PERUBAHAN'
  unit_pertama: string
  nama_pertama: string
  jabatan_pertama: string
  unit_kedua: string
  nama_kedua: string
  status: 'DRAFT' | 'FINAL'
  has_file: 0 | 1
  created_at: string
  created_by: number | null
}

interface Props { role: Role }

export default function RiwayatClient({ role }: Props) {
  const { tahun } = usePkYear()
  const router = useRouter()
  const [statusFilter, setStatusFilter] = useState<'' | 'DRAFT' | 'FINAL'>('')
  const [jenisFilter, setJenisFilter] = useState<'' | 'MURNI' | 'PERUBAHAN'>('')
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null)
  const [confirm, setConfirm] = useState<{
    title: string; message: string; confirmLabel: string
    confirmKind: 'purple' | 'danger'; onConfirm: () => void
  } | null>(null)
  const [preview, setPreview] = useState<{ id: number; filename: string } | null>(null)

  // Hanya SUPER_ADMIN + ADMIN boleh hapus dokumen FINAL (mirror backend gate).
  const canDeleteFinal = role === 'SUPER_ADMIN' || role === 'ADMIN'

  function showToast(kind: 'ok' | 'err', msg: string) {
    setToast({ kind, msg })
    window.setTimeout(() => setToast(null), 3500)
  }

  const list = usePaginatedList<RiwayatRow>({
    endpoint: '/api/perjanjian-kinerja/dokumen',
    params: { tahun, status: statusFilter || undefined, jenis_pk: jenisFilter || undefined },
    limit: 20,
    onError: (msg) => showToast('err', msg),
  })

  function handleDelete(row: RiwayatRow) {
    if (row.status === 'FINAL' && !canDeleteFinal) {
      showToast('err', 'Dokumen FINAL hanya bisa dihapus SUPER_ADMIN atau ADMIN')
      return
    }
    const extraWarn = row.status === 'FINAL'
      ? ' Dokumen FINAL akan ikut hapus file Word yang sudah di-generate.'
      : ''
    setConfirm({
      title: `Hapus dokumen #${row.id}`,
      message: `Hapus dokumen PK milik ${row.unit_pertama}? Aksi tidak dapat di-undo.${extraWarn}`,
      confirmLabel: 'Hapus',
      confirmKind: 'danger',
      onConfirm: async () => {
        setConfirm(null)
        const d = await fetchJson<unknown>(`/api/perjanjian-kinerja/dokumen/${row.id}`, { method: 'DELETE' })
        if (d.ok) {
          showToast('ok', `Dokumen #${row.id} dihapus`)
          list.mutate(prev => prev.filter(r => r.id !== row.id))
          window.setTimeout(() => void list.refetch(), 200)
        } else {
          showToast('err', d.message)
        }
      },
    })
  }

  function handleDownload(id: number) {
    window.location.href = `/api/perjanjian-kinerja/dokumen/${id}/download`
  }

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: '#E6F1FB', margin: 0 }}>Riwayat Dokumen PK</h1>
          <p style={{ fontSize: 12, color: '#85B7EB', margin: '4px 0 0' }}>
            Tahun <strong style={{ color: '#FAC775', fontFamily: 'JetBrains Mono, ui-monospace, monospace' }}>{tahun}</strong>
            {' · '}
            {list.loading ? 'Memuat…' : `${list.total} dokumen`}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as 'DRAFT' | 'FINAL' | '')}
            style={selectFilter}>
            <option value="">Semua status</option>
            <option value="DRAFT">DRAFT</option>
            <option value="FINAL">FINAL</option>
          </select>
          <select value={jenisFilter} onChange={e => setJenisFilter(e.target.value as 'MURNI' | 'PERUBAHAN' | '')}
            style={selectFilter}>
            <option value="">Semua jenis</option>
            <option value="MURNI">MURNI</option>
            <option value="PERUBAHAN">PERUBAHAN</option>
          </select>
          <PrimaButton variant="primary" iconLeft={<FileText size={14} />}
            onClick={() => router.push('/perjanjian-kinerja/form')}>
            Buat Baru
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

      {/* Table */}
      <div style={{ background: '#042C53', border: '1px solid #0C447C', borderRadius: 10, overflow: 'hidden' }}>
        {list.loading ? (
          <TableSkeleton rows={6} cols={8} />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <thead>
                <tr style={{ background: 'rgba(12,68,124,.5)' }}>
                  <th style={th(50)}>#</th>
                  <th style={th(110)}>Tanggal</th>
                  <th style={th(90)}>Jenis</th>
                  <th style={th(220)}>Pihak Pertama</th>
                  <th style={th(220)}>Pihak Kedua</th>
                  <th style={th(80)}>Status</th>
                  <th style={th(70)}>Word</th>
                  <th style={th(140)}>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {list.data.length === 0 && (
                  <tr>
                    <td colSpan={8} style={{ padding: '40px 16px', textAlign: 'center', color: '#85B7EB', fontSize: 13 }}>
                      Belum ada dokumen PK untuk tahun {tahun}
                      {(statusFilter || jenisFilter) && ' (sesuai filter)'}. Klik <strong>Buat Baru</strong> untuk mulai.
                    </td>
                  </tr>
                )}
                {list.data.map((r, idx) => (
                  <tr key={r.id} style={{ background: idx % 2 === 0 ? 'transparent' : 'rgba(12,68,124,.15)', transition: 'all .15s' }}>
                    <td style={tdNum}>{(list.page - 1) * 20 + idx + 1}</td>
                    <td style={{ ...td, fontFamily: 'JetBrains Mono, ui-monospace, monospace' }}>{fmtDateID(r.tanggal_dokumen)}</td>
                    <td style={td}>
                      <span style={{
                        display: 'inline-block', padding: '2px 8px', borderRadius: 5,
                        fontSize: 10, fontWeight: 800, letterSpacing: '.4px',
                        background: r.jenis_pk === 'MURNI' ? 'rgba(59,130,246,.18)' : 'rgba(139,92,246,.18)',
                        color: r.jenis_pk === 'MURNI' ? '#93C5FD' : '#C4B5FD',
                        border: `1px solid ${r.jenis_pk === 'MURNI' ? 'rgba(59,130,246,.4)' : 'rgba(139,92,246,.4)'}`,
                      }}>{r.jenis_pk}</span>
                    </td>
                    <td style={td}>
                      <div style={{ fontWeight: 700, color: '#E6F1FB' }}>{r.nama_pertama}</div>
                      <div style={{ fontSize: 11, color: '#85B7EB', marginTop: 2 }}>{r.jabatan_pertama}</div>
                      <div style={{ fontSize: 10.5, color: '#FAC775', marginTop: 1, fontWeight: 600 }}>{r.unit_pertama}</div>
                    </td>
                    <td style={td}>
                      <div style={{ fontWeight: 700, color: '#E6F1FB' }}>{r.nama_kedua}</div>
                      <div style={{ fontSize: 10.5, color: '#FAC775', marginTop: 2, fontWeight: 600 }}>{r.unit_kedua}</div>
                    </td>
                    <td style={td}>
                      <span style={{
                        display: 'inline-block', padding: '2px 8px', borderRadius: 5,
                        fontSize: 10, fontWeight: 800, letterSpacing: '.4px',
                        background: r.status === 'FINAL' ? 'rgba(29,158,117,.18)' : 'rgba(239,159,39,.18)',
                        color: r.status === 'FINAL' ? '#6EE7B7' : '#FAC775',
                        border: `1px solid ${r.status === 'FINAL' ? 'rgba(29,158,117,.4)' : 'rgba(239,159,39,.4)'}`,
                      }}>{r.status}</span>
                    </td>
                    <td style={{ ...tdNum, color: r.has_file ? '#6EE7B7' : '#85B7EB' }}>
                      {r.has_file ? '✓' : '—'}
                    </td>
                    <td style={td}>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button onClick={() => router.push(`/perjanjian-kinerja/form?id=${r.id}`)}
                          data-tooltip={r.status === 'FINAL' ? 'Lihat (read-only)' : 'Edit dokumen'}
                          data-tooltip-pos="left"
                          style={btnIcon('#3B82F6')}>
                          <Edit2 size={12} />
                        </button>
                        {r.has_file === 1 && (
                          <>
                            <button onClick={() => setPreview({
                              id: r.id,
                              filename: `PK-${r.tahun}-${r.unit_pertama.replace(/[^\w\s.-]/g,'').replace(/\s+/g,'-').slice(0,50)}-${r.jenis_pk}.docx`,
                            })}
                              data-tooltip="Preview dokumen"
                              data-tooltip-pos="left"
                              style={btnIcon('#A78BFA')}>
                              <Eye size={12} />
                            </button>
                            <button onClick={() => handleDownload(r.id)}
                              data-tooltip="Unduh Word"
                              data-tooltip-pos="left"
                              style={btnIcon('#10B981')}>
                              <Download size={12} />
                            </button>
                          </>
                        )}
                        <button onClick={() => handleDelete(r)}
                          disabled={r.status === 'FINAL' && !canDeleteFinal}
                          data-tooltip={
                            r.status === 'FINAL'
                              ? (canDeleteFinal ? 'Hapus dokumen FINAL (admin)' : 'Final — hanya SUPER_ADMIN/ADMIN')
                              : 'Hapus dokumen'
                          }
                          data-tooltip-pos="left"
                          style={btnIconDanger(r.status === 'FINAL' && !canDeleteFinal)}>
                          <DeleteIcon size={12} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {list.totalPages > 1 && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '10px 14px', borderTop: '1px solid #0C447C',
            background: 'rgba(12,68,124,.25)',
          }}>
            <div style={{ fontSize: 11.5, color: '#85B7EB', fontFamily: 'JetBrains Mono, ui-monospace, monospace' }}>
              Halaman <strong style={{ color: '#FAC775' }}>{list.page}</strong> dari {list.totalPages} · {list.total} total
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => list.setPage(list.page - 1)} disabled={list.page <= 1} style={btnIcon('#3B82F6')}>
                <ChevronLeft size={14} />
              </button>
              <button onClick={() => list.setPage(list.page + 1)} disabled={list.page >= list.totalPages} style={btnIcon('#3B82F6')}>
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

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

      {preview && (
        <DocxPreviewModal
          docId={preview.id}
          filename={preview.filename}
          onClose={() => setPreview(null)}
          onDownload={() => handleDownload(preview.id)}
        />
      )}
    </div>
  )
}

// Modal konfirmasi sesuai design-system PRIMA (canvas-dark overlay + surface-card panel).
// Mirror dari form-client.tsx — purple=review/ajukan, danger=hapus.
function ConfirmDialog({
  title, message, confirmLabel, confirmKind, onConfirm, onCancel,
}: {
  title: string; message: string; confirmLabel: string
  confirmKind: 'purple' | 'danger'
  onConfirm: () => void; onCancel: () => void
}) {
  return (
    <div onClick={onCancel} style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(2,15,28,.72)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 20, animation: 'pkConfirmFade .18s ease-out',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#042C53', borderRadius: 14,
        border: '1px solid rgba(24,95,165,.5)',
        boxShadow: '0 20px 60px rgba(0,0,0,.5)',
        maxWidth: 460, width: '100%',
        padding: 22, display: 'flex', flexDirection: 'column', gap: 14,
        color: '#E6F1FB',
      }}>
        <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: '.2px' }}>{title}</div>
        <div style={{ fontSize: 13, lineHeight: 1.6, color: '#B5D4F4' }}>{message}</div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 6 }}>
          <PrimaButton variant="ghost" onClick={onCancel}>Batal</PrimaButton>
          <PrimaButton variant={confirmKind === 'purple' ? 'purple' : 'danger'} onClick={onConfirm} autoFocus>
            {confirmLabel}
          </PrimaButton>
        </div>
      </div>
      <style>{`@keyframes pkConfirmFade { from { opacity: 0 } to { opacity: 1 } }`}</style>
    </div>
  )
}

// Preview pattern align dgn RA Cetak PdfPreviewModal:
// 1. Fetch DOCX dari endpoint
// 2. Render docx-preview ke DOM offscreen (utk capture html2canvas)
// 3. html2canvas → jsPDF: convert per docx section ke PDF page
// 4. Tampilkan iframe dengan PDF blob URL (sama gaya RA)
// 5. Tombol download: PDF (amber, baru) + Word (green, existing) + Close (red)
function DocxPreviewModal({
  docId, filename, onClose, onDownload,
}: {
  docId: number; filename: string
  onClose: () => void; onDownload: () => void
}) {
  const offscreenRef = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [errMsg, setErrMsg] = useState<string>('')
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string>('')
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null)
  const [progress, setProgress] = useState<string>('Memuat dokumen…')

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        // 1. Fetch DOCX
        const res = await fetch(`/api/perjanjian-kinerja/dokumen/${docId}/download`, { credentials: 'include' })
        if (!res.ok) throw new Error(`Gagal ambil dokumen (HTTP ${res.status})`)
        const blob = await res.blob()
        if (cancelled) return

        // 2. Render docx ke DOM offscreen
        setProgress('Memproses isi dokumen…')
        const mod = await import('docx-preview')
        if (cancelled || !offscreenRef.current) return
        offscreenRef.current.innerHTML = ''
        await mod.renderAsync(blob, offscreenRef.current, undefined, {
          className: 'pk-docx-preview',
          inWrapper: true,
          ignoreWidth: false,
          ignoreHeight: false,
          ignoreFonts: false,
          breakPages: true,
          experimental: true,
        })
        if (cancelled) return

        // Wait fonts loaded + force reflow + next frame supaya layout settle
        if (document.fonts && document.fonts.ready) {
          await document.fonts.ready
        }
        if (cancelled) return
        // Force reflow read
        void offscreenRef.current.offsetHeight
        // Wait 2 RAF utk pastikan layout commit
        await new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r())))
        if (cancelled) return

        // 3. Capture per section.docx via html2canvas → jsPDF
        setProgress('Mengkonversi ke PDF…')
        const [{ default: html2canvas }, jspdfMod] = await Promise.all([
          import('html2canvas-pro'),
          import('jspdf'),
        ])
        if (cancelled) return
        // docx-preview output: <div.docx-wrapper><section.docx>...</section>...</div>
        let sections: ArrayLike<Element> = offscreenRef.current.querySelectorAll('section.docx')
        // Fallback kalau struktur berubah / fonts blocked: capture wrapper as 1 page
        if (!sections.length) {
          const wrapper = offscreenRef.current.querySelector('.docx-wrapper')
          if (wrapper) sections = wrapper.querySelectorAll(':scope > *')
        }
        if (!sections.length && offscreenRef.current.children.length > 0) {
          sections = offscreenRef.current.querySelectorAll(':scope > *')
        }
        if (!sections.length) throw new Error('Tidak ada konten dokumen utk dikonversi')

        // jsPDF init dgn first page placeholder — orientasi per page detect kemudian
        const pdf = new jspdfMod.jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
        let addedAnyPage = false

        for (let i = 0; i < sections.length; i++) {
          if (cancelled) return
          const el = sections[i] as HTMLElement
          // Skip element yg dimensinya 0 (layout failure)
          const rect = el.getBoundingClientRect()
          if (rect.width <= 0 || rect.height <= 0) continue

          // Capture FULL section width (no viewport constraint) — lampiran landscape
          // bisa lebih lebar dari A4 portrait, biarkan html2canvas tangkap full size.
          const canvas = await html2canvas(el, {
            scale: 2,
            backgroundColor: '#ffffff',
            logging: false,
            useCORS: true,
            width: rect.width,
            height: rect.height,
            windowWidth: Math.max(rect.width, 794),
          })
          if (!canvas.width || !canvas.height || !Number.isFinite(canvas.width) || !Number.isFinite(canvas.height)) continue

          const img = canvas.toDataURL('image/jpeg', 0.92)
          const aspectRatio = canvas.width / canvas.height
          if (!Number.isFinite(aspectRatio) || aspectRatio <= 0) continue
          // Auto-detect orientation per page dari aspect ratio canvas
          const orientation: 'portrait' | 'landscape' = aspectRatio > 1.1 ? 'landscape' : 'portrait'

          if (addedAnyPage) pdf.addPage('a4', orientation)
          else if (orientation === 'landscape') {
            // First page landscape — replace default portrait
            pdf.deletePage(1)
            pdf.addPage('a4', orientation)
          }

          const pageW = pdf.internal.pageSize.getWidth()
          const pageH = pdf.internal.pageSize.getHeight()

          // Fit-to-page (preserve aspect, contain not cover)
          let drawW = pageW
          let drawH = pageW / aspectRatio
          if (drawH > pageH) {
            drawH = pageH
            drawW = pageH * aspectRatio
          }
          const offsetX = (pageW - drawW) / 2
          const offsetY = (pageH - drawH) / 2
          pdf.addImage(img, 'JPEG', offsetX, offsetY, drawW, drawH)
          addedAnyPage = true
        }
        if (!addedAnyPage) throw new Error('Tidak ada halaman valid utk dikonversi (semua section width/height 0)')

        const pdfOut = pdf.output('blob')
        if (cancelled) return
        const url = URL.createObjectURL(pdfOut)
        if (cancelled) { URL.revokeObjectURL(url); return }
        setPdfBlob(pdfOut)
        setPdfBlobUrl(url)
        setStatus('ready')
      } catch (e) {
        if (!cancelled) {
          setStatus('error')
          setErrMsg(e instanceof Error ? e.message : 'Render gagal')
        }
      }
    })()
    return () => { cancelled = true }
  }, [docId])

  // Cleanup blob URL on unmount
  useEffect(() => {
    return () => { if (pdfBlobUrl) URL.revokeObjectURL(pdfBlobUrl) }
  }, [pdfBlobUrl])

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const handleDownloadPdf = () => {
    if (!pdfBlob) return
    const url = URL.createObjectURL(pdfBlob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename.replace(/\.docx$/i, '.pdf')
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 200)
  }

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(2,15,28,.78)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 16, animation: 'pkConfirmFade .18s ease-out',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#042C53', borderRadius: 14,
        border: '1px solid rgba(24,95,165,.5)',
        boxShadow: '0 20px 60px rgba(0,0,0,.5)',
        width: '92vw', height: '92vh',
        display: 'flex', flexDirection: 'column',
        color: '#E6F1FB', overflow: 'hidden',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 16px', borderBottom: '1px solid #0C447C',
          background: 'rgba(12,68,124,.35)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <Eye size={16} color="#A78BFA" />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: '.2px' }}>Preview Dokumen (PDF)</div>
              <div style={{
                fontSize: 11, color: '#85B7EB', marginTop: 2,
                fontFamily: 'JetBrains Mono, ui-monospace, monospace',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>{filename}</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <DownloadButton variant="pdf" label="PDF" size="sm" onClick={handleDownloadPdf} disabled={!pdfBlob}
              data-tooltip="Unduh PDF" data-tooltip-pos="left" />
            <DownloadButton variant="word" label="Word" size="sm" onClick={onDownload}
              data-tooltip="Unduh Word" data-tooltip-pos="left" />
            <button onClick={onClose} data-tooltip="Tutup (Esc)" data-tooltip-pos="left"
              style={btnIcon('#E24B4A')}>
              <X size={14} />
            </button>
          </div>
        </div>

        <div style={{
          flex: 1, overflow: 'hidden', position: 'relative',
          background: '#1a1f2e',
        }}>
          {status === 'loading' && (
            <div style={{
              position: 'absolute', inset: 0,
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              gap: 10, color: '#85B7EB', fontSize: 12.5,
            }}>
              <Loader2 size={28} className="pk-spin" />
              <div>{progress}</div>
            </div>
          )}
          {status === 'error' && (
            <div style={{
              position: 'absolute', inset: 0,
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              gap: 10, color: '#FCA5A5', fontSize: 12.5, textAlign: 'center', padding: 30,
            }}>
              <AlertCircle size={28} />
              <div style={{ fontWeight: 700 }}>Gagal memuat preview</div>
              <div style={{ color: '#85B7EB', maxWidth: 480 }}>{errMsg}</div>
              <DownloadButton variant="word" label="Unduh Word" onClick={onDownload} style={{ marginTop: 10 }} />
            </div>
          )}
          {status === 'ready' && pdfBlobUrl && (
            <iframe
              src={pdfBlobUrl}
              title="Preview PK PDF"
              style={{ width: '100%', height: '100%', border: 0 }}
            />
          )}
          {/* Offscreen docx render — utk html2canvas capture. fixed + opacity 0 supaya
              layout reflow normal. width auto supaya section landscape (lampiran A4)
              dapat render full width tidak ke-clip. */}
          <div ref={offscreenRef} style={{
            position: 'fixed', top: 0, left: 0,
            minWidth: 794, minHeight: 100,
            opacity: 0, pointerEvents: 'none',
            zIndex: -1,
          }} />
        </div>
      </div>
      <style>{`
        @keyframes pkSpin { from { transform: rotate(0) } to { transform: rotate(360deg) } }
        .pk-spin { animation: pkSpin 1s linear infinite }
        .pk-docx-preview .docx-wrapper {
          background: transparent !important; padding: 0 !important;
        }
        .pk-docx-preview .docx-wrapper > section.docx {
          background: #fff !important; color: #111 !important;
          margin: 0 auto 18px !important;
        }
      `}</style>
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

const selectFilter: React.CSSProperties = {
  background: 'rgba(2,15,28,.45)', border: '1px solid rgba(24,95,165,.4)', borderRadius: 6,
  padding: '6px 10px', color: '#E6F1FB', fontSize: 12, fontFamily: 'inherit', outline: 'none',
}

function btnIcon(color: string): React.CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    width: 26, height: 26, borderRadius: 5,
    background: `${color}22`, color, border: `1px solid ${color}55`,
    cursor: 'pointer', transition: 'all .15s',
  }
}
function btnIconDanger(d: boolean): React.CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    width: 26, height: 26, borderRadius: 5,
    background: 'rgba(226,75,74,.15)', color: '#FCA5A5',
    border: '1px solid rgba(226,75,74,.4)',
    cursor: d ? 'not-allowed' : 'pointer', opacity: d ? 0.5 : 1, transition: 'all .15s',
  }
}
