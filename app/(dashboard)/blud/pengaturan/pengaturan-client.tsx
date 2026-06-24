'use client'
// app/(dashboard)/blud/pengaturan/pengaturan-client.tsx
// Pengaturan BLUD: hapus versi DPA & Pergeseran dari history.
// - 2 section: DPA BLUD + Pergeseran DPA
// - Per row: tanggal versi · jumlah baris · tombol Hapus
// - Modal confirm dengan KODE RANDOM 4-digit (cegah mis-click)
// - Tombol hapus DISABLED kalau hanya 1 versi tersisa (jaga app tidak empty state)
// - Audit log via API DELETE handler

import { useState, useEffect, useCallback, useMemo } from 'react'
import { toast } from 'sonner'
import { AlertTriangle, FileText, Shuffle, RefreshCw, X } from 'lucide-react'
import DeleteIcon from '@/components/ui/DeleteIcon'
import PrimaButton from '@/components/ui/PrimaButton'

interface DpaVersi {
  versi_tanggal: string
  jumlah_baris:  number
}
interface PergeseranVersi {
  versi_tanggal:     string
  dpa_versi_tanggal: string
  jumlah_baris:      number
}

type DeleteTarget =
  | { kind: 'dpa'; versi: string; baris: number }
  | { kind: 'pergeseran'; versi: string; baris: number; dpaVersi: string }

// Generate kode konfirmasi 4-digit random (1000-9999)
function generateConfirmCode(): string {
  return String(Math.floor(1000 + Math.random() * 9000))
}

const ID_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']
function formatTanggal(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return iso
  return `${m[3]} ${ID_MONTHS[Number(m[2]) - 1] ?? m[2]} ${m[1]}`
}

export default function PengaturanClient() {
  const [dpaList,   setDpaList]   = useState<DpaVersi[]>([])
  const [pergList,  setPergList]  = useState<PergeseranVersi[]>([])
  const [loading,   setLoading]   = useState(true)
  const [err,       setErr]       = useState<string | null>(null)

  // Modal state
  const [target,     setTarget]     = useState<DeleteTarget | null>(null)
  const [expectCode, setExpectCode] = useState('')           // kode random yang harus diketik user
  const [typedCode,  setTypedCode]  = useState('')           // input user
  const [deleting,   setDeleting]   = useState(false)
  const codeMatches = useMemo(() => typedCode === expectCode && expectCode !== '', [typedCode, expectCode])

  // ─── Data fetch ────────────────────────────────────────────────────────────
  const loadAll = useCallback(async () => {
    setLoading(true)
    setErr(null)
    try {
      const [dRes, pRes] = await Promise.all([
        fetch('/api/blud/dpa?mode=history', { cache: 'no-store' }),
        fetch('/api/blud/pergeseran?mode=history', { cache: 'no-store' }),
      ])
      const [dJson, pJson] = await Promise.all([dRes.json(), pRes.json()])
      if (!dRes.ok || !dJson.ok) throw new Error(dJson.error || 'Gagal load DPA history')
      if (!pRes.ok || !pJson.ok) throw new Error(pJson.error || 'Gagal load Pergeseran history')
      setDpaList(dJson.data ?? [])
      setPergList(pJson.data ?? [])
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { queueMicrotask(() => loadAll()) }, [loadAll])

  // ─── Toast helper (3s auto-dismiss) ─────────────────────────────────────────
  // L58: notif standar sonner (richColors dari Toaster global)
  function showToast(msg: string, ok: boolean) {
    if (ok) toast.success(msg)
    else toast.error(msg)
  }

  // ─── Delete action ─────────────────────────────────────────────────────────
  async function executeDelete() {
    if (!target || !codeMatches) return
    setDeleting(true)
    try {
      const path = target.kind === 'dpa' ? '/api/blud/dpa' : '/api/blud/pergeseran'
      const res  = await fetch(`${path}?versi=${encodeURIComponent(target.versi)}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok || !json.ok) {
        if (res.status === 429) throw new Error(json.error || 'Terlalu banyak permintaan')
        throw new Error(json.error || 'Gagal hapus')
      }
      showToast(json.message || 'Versi berhasil dihapus', true)
      closeModal()
      await loadAll()
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e), false)
    } finally {
      setDeleting(false)
    }
  }

  function closeModal() {
    setTarget(null)
    setExpectCode('')
    setTypedCode('')
  }
  function openDeleteDpa(v: DpaVersi) {
    setTarget({ kind: 'dpa', versi: v.versi_tanggal, baris: v.jumlah_baris })
    setExpectCode(generateConfirmCode())
    setTypedCode('')
  }
  function openDeletePerg(v: PergeseranVersi) {
    setTarget({ kind: 'pergeseran', versi: v.versi_tanggal, baris: v.jumlah_baris, dpaVersi: v.dpa_versi_tanggal })
    setExpectCode(generateConfirmCode())
    setTypedCode('')
  }

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header */}
      <div style={{
        background: '#042C53', border: '1px solid #0C447C', borderRadius: 10,
        padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <Settings_Icon />
        <div style={{ flex: 1 }}>
          <h1 style={{ fontWeight: 800, fontSize: 15, color: '#E6F1FB', marginBottom: 2 }}>Pengaturan</h1>
          <p style={{ fontSize: 11.5, color: '#85B7EB' }}>
            Kelola versi tabel DPA &amp; Pergeseran — hapus permanen versi lama yang tidak diperlukan.
          </p>
        </div>
        <PrimaButton variant="purple" iconLeft={<RefreshCw size={13} className={loading ? 'animate-spin' : ''} />}
          onClick={loadAll} disabled={loading} data-tooltip="Muat ulang">
          Refresh
        </PrimaButton>
      </div>

      {/* Warning banner — solid red full (request user: merah full, text putih) */}
      <div style={{
        background: '#E24B4A', border: '1px solid #B91C1C',
        borderRadius: 10, padding: '10px 14px', display: 'flex', gap: 10, alignItems: 'flex-start',
        fontSize: 11.5, color: '#FFFFFF',
      }}>
        <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
        <div>
          <strong style={{ color: '#FFFFFF' }}>Peringatan:</strong> Hapus versi bersifat <strong>permanen</strong> dan tidak bisa di-undo.
          Hapus DPA juga otomatis menghapus Rekap Penanggung Jawab terkait versi tsb.
        </div>
      </div>

      {err && (
        <div style={{
          background: '#E24B4A', border: '1px solid #B91C1C',
          borderRadius: 8, padding: '10px 14px', color: '#FFFFFF', fontSize: 12,
        }}>{err}</div>
      )}

      {/* DPA section — boleh hapus semua versi (user bisa re-build via Kode Besar) */}
      <VersiSection
        title="DPA BLUD"
        icon={<FileText size={16} />}
        color="#8B5CF6"
        loading={loading}
        rows={dpaList.map(v => ({
          versi: v.versi_tanggal,
          meta:  `${v.jumlah_baris} baris`,
        }))}
        onDelete={(idx) => openDeleteDpa(dpaList[idx])}
      />

      {/* Pergeseran section */}
      <VersiSection
        title="Pergeseran DPA"
        icon={<Shuffle size={16} />}
        color="#EC4899"
        loading={loading}
        rows={pergList.map(v => ({
          versi: v.versi_tanggal,
          meta:  `${v.jumlah_baris} baris · acuan DPA ${formatTanggal(v.dpa_versi_tanggal)}`,
        }))}
        onDelete={(idx) => openDeletePerg(pergList[idx])}
        deleteDisabled={pergList.length === 0}  // pergeseran boleh kosong total (DPA tetap ada)
      />

      {/* Confirm modal — ketik kode random untuk konfirmasi */}
      {target && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={(e) => { if (e.target === e.currentTarget && !deleting) closeModal() }}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,.65)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 200, padding: 16,
          }}>
          <div style={{
            background: '#042C53', border: '1px solid rgba(239,68,68,.45)',
            borderRadius: 12, padding: 20, maxWidth: 460, width: '100%',
            boxShadow: '0 20px 60px rgba(0,0,0,.7)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 10,
                background: 'rgba(239,68,68,.20)', color: '#FCA5A5',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <AlertTriangle size={18} />
              </div>
              <h2 style={{ fontWeight: 800, color: '#E6F1FB', fontSize: 15 }}>Hapus versi permanen?</h2>
              <button
                onClick={() => !deleting && closeModal()}
                disabled={deleting}
                style={{
                  marginLeft: 'auto', background: 'transparent', border: 'none',
                  color: '#85B7EB', cursor: deleting ? 'not-allowed' : 'pointer', padding: 4,
                }}>
                <X size={18} />
              </button>
            </div>

            <div style={{
              background: 'rgba(0,0,0,.20)', borderRadius: 8, padding: 12, marginBottom: 12,
              fontSize: 12.5, color: '#B5D4F4', lineHeight: 1.6,
            }}>
              <div><strong style={{ color: '#E6F1FB' }}>
                {target.kind === 'dpa' ? 'DPA BLUD' : 'Pergeseran DPA'}
              </strong></div>
              <div>Versi: <strong style={{ color: '#FBBF24' }}>{formatTanggal(target.versi)}</strong></div>
              <div>Jumlah baris: <strong>{target.baris}</strong></div>
              {target.kind === 'pergeseran' && (
                <div>Acuan DPA: <strong>{formatTanggal(target.dpaVersi)}</strong></div>
              )}
              {target.kind === 'dpa' && (
                <div style={{ marginTop: 6, color: '#FCA5A5', fontSize: 11.5 }}>
                  ⚠ Rekap Penanggung Jawab untuk versi ini juga akan ikut terhapus.
                </div>
              )}
            </div>

            {/* Konfirmasi via kode random — anti mis-click */}
            <div style={{ marginBottom: 4, fontSize: 12, color: '#B5D4F4', fontWeight: 600 }}>
              Untuk konfirmasi, ketik kode berikut:
            </div>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '12px 14px', borderRadius: 10,
              background: 'rgba(239,68,68,.10)', border: '1px solid rgba(239,68,68,.35)',
              marginBottom: 10,
            }}>
              <code style={{
                fontFamily: 'var(--font-jetbrains-mono, ui-monospace, monospace)',
                fontSize: 22, fontWeight: 800, letterSpacing: '4px',
                color: '#FCA5A5', userSelect: 'none',
                background: 'rgba(0,0,0,.30)', padding: '4px 12px', borderRadius: 6,
                flexShrink: 0,
              }}>{expectCode}</code>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={4}
                value={typedCode}
                onChange={(e) => setTypedCode(e.target.value.replace(/\D/g, ''))}
                disabled={deleting}
                autoFocus
                placeholder="ketik 4 digit"
                style={{
                  flex: 1, fontFamily: 'var(--font-jetbrains-mono, ui-monospace, monospace)',
                  fontSize: 18, fontWeight: 700, letterSpacing: '4px',
                  textAlign: 'center',
                  padding: '8px 10px', borderRadius: 8,
                  background: '#020F1C',
                  border: `1.5px solid ${codeMatches ? '#10B981' : '#185FA5'}`,
                  color: codeMatches ? '#6EE7B7' : '#E6F1FB',
                  outline: 'none', transition: 'border-color .15s, color .15s',
                }}
              />
            </div>
            {typedCode.length === 4 && !codeMatches && (
              <div style={{ fontSize: 11.5, color: '#FCA5A5', marginBottom: 8 }}>
                Kode tidak cocok. Periksa lagi 4 digit di kotak merah.
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
              <PrimaButton variant="ghost" onClick={closeModal} disabled={deleting}>
                Batal
              </PrimaButton>
              <PrimaButton variant="danger" iconLeft={<DeleteIcon size={13} />}
                onClick={executeDelete} disabled={!codeMatches || deleting}>
                {deleting ? 'Menghapus...' : 'Hapus Permanen'}
              </PrimaButton>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0); } to { transform: rotate(360deg); } }
        @keyframes fadeInRight { from { opacity: 0; transform: translateX(20px); } to { opacity: 1; transform: translateX(0); } }
      `}</style>
    </div>
  )
}

// ─── Sub: VersiSection ────────────────────────────────────────────────────────
interface SectionRow { versi: string; meta: string }
function VersiSection({ title, icon, color, loading, rows, onDelete, deleteDisabled, disabledReason }: {
  title:   string
  icon:    React.ReactNode
  color:   string
  loading: boolean
  rows:    SectionRow[]
  onDelete: (idx: number) => void
  deleteDisabled?: boolean
  disabledReason?: string
}) {
  return (
    <div style={{ background: '#042C53', border: '1px solid #0C447C', borderRadius: 10, overflow: 'hidden' }}>
      <div style={{
        padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 8,
        borderBottom: '1px solid #0C447C',
        background: `linear-gradient(90deg, ${color}22, transparent)`,
      }}>
        <span style={{ color, display: 'inline-flex' }}>{icon}</span>
        <h2 style={{ fontWeight: 700, fontSize: 13, color: '#E6F1FB' }}>{title}</h2>
        <span style={{ marginLeft: 'auto', fontSize: 11, color: '#85B7EB', fontWeight: 500 }}>
          {loading ? '—' : `${rows.length} versi`}
        </span>
      </div>
      {loading ? (
        <div style={{ padding: 40, textAlign: 'center' }}>
          <div className="animate-spin" style={{
            width: 24, height: 24, borderRadius: '50%',
            border: '2px solid rgba(133,183,235,.25)', borderTopColor: '#85B7EB',
            margin: '0 auto',
          }} />
        </div>
      ) : rows.length === 0 ? (
        <div style={{ padding: '32px 16px', textAlign: 'center', color: '#85B7EB', fontSize: 12 }}>
          Belum ada versi tersimpan
        </div>
      ) : (
        <div>
          {rows.map((r, i) => (
            <div key={r.versi} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '10px 16px',
              borderBottom: i < rows.length - 1 ? '1px solid rgba(12,68,124,.4)' : 'none',
              transition: 'background .12s',
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(12,68,124,.25)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#E6F1FB' }}>
                  {formatTanggal(r.versi)}
                  {i === 0 && (
                    <span style={{
                      marginLeft: 8, fontSize: 9, fontWeight: 800, letterSpacing: '.4px',
                      padding: '2px 6px', borderRadius: 999,
                      background: '#10B981', color: '#FFFFFF',
                    }}>LATEST</span>
                  )}
                </div>
                <div style={{ fontSize: 11, color: '#85B7EB', marginTop: 2 }}>{r.meta}</div>
              </div>
              <button
                onClick={() => !deleteDisabled && onDelete(i)}
                disabled={deleteDisabled}
                data-tooltip={deleteDisabled ? (disabledReason ?? 'Tidak bisa hapus') : 'Hapus versi ini'}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '6px 12px', borderRadius: 8, fontSize: 11.5, fontWeight: 600,
                  background: 'transparent',
                  border: `1px solid ${deleteDisabled ? 'rgba(133,183,235,.20)' : 'rgba(226,75,74,.4)'}`,
                  color: deleteDisabled ? '#85B7EB' : '#FCA5A5',
                  cursor: deleteDisabled ? 'not-allowed' : 'pointer',
                  opacity: deleteDisabled ? .45 : 1,
                  fontFamily: 'inherit',
                  transition: 'all .15s',
                }}
                onMouseEnter={(e) => {
                  if (deleteDisabled) return
                  e.currentTarget.style.background = '#E24B4A'
                  e.currentTarget.style.color = '#FFFFFF'
                  e.currentTarget.style.borderColor = '#E24B4A'
                }}
                onMouseLeave={(e) => {
                  if (deleteDisabled) return
                  e.currentTarget.style.background = 'transparent'
                  e.currentTarget.style.color = '#FCA5A5'
                  e.currentTarget.style.borderColor = 'rgba(226,75,74,.4)'
                }}>
                <DeleteIcon size={12} /> Hapus
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// Tiny inline Settings icon component to avoid extra import
function Settings_Icon() {
  return (
    <div style={{
      width: 36, height: 36, borderRadius: 10,
      background: 'rgba(100,116,139,.20)', color: '#94A3B8',
      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    }}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
        <circle cx="12" cy="12" r="3"/>
      </svg>
    </div>
  )
}
