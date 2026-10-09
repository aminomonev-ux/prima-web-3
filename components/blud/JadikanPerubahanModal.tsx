'use client'
// components/blud/JadikanPerubahanModal.tsx — "Jadikan DPA Perubahan" (konsep §5).
//
// Berhenti di FORM (L78/L80): yang dikerjakan modal ini cuma mengisi layar dengan
// angka yang sedang jadi pagu. Yang menulis tetap tombol Simpan — jadi kunci
// optimistik, ambang turun drastis, pagar pagu, kunci setahun, audit, dan riwayat
// simpan berlaku tanpa satu baris pagar baru. Tidak ada pilihan sumber: sumbernya
// ditanyakan ke server (aturan pagu §8), bukan dihitung di layar.
//
// Sasaran Simpan ditampilkan, bukan dipilih — pola `SalinVersiModal`.
import { useEffect, useState } from 'react'
import { X, FileDiff, AlertTriangle, ArrowRight } from 'lucide-react'
import PrimaButton from '@/components/ui/PrimaButton'
import { confirmDialog } from '@/components/ui/ConfirmDialog'
import { formatRupiah } from '@/lib/blud/format'
import { formatTanggalId } from '@/lib/blud/tanggal'
import type { DpaBarisInput } from '@/types'

export interface AsalPerubahan { sumber_dasar: 'PERGESERAN' | 'DPA'; versi_dasar: string }

interface Dasar {
  sumber_dasar: 'PERGESERAN' | 'DPA'
  versi_dasar: string
  rows: DpaBarisInput[]
  jumlah_baris: number
  total: number
  selisih_draft: number
  acuan: string | null
  dpa_direvisi: string | null
}

export default function JadikanPerubahanModal({
  tahun, sasaran, keBerikut, jumlahDiLayar, onTutup, onTerapkan,
}: {
  tahun: number
  /** Tanggal yang akan ditulis Simpan — dari `sasaranSimpan`, bukan dihitung ulang. */
  sasaran: string
  /** Nomor Perubahan yang akan lahir (penanda yang sudah ada + 1). */
  keBerikut: number
  jumlahDiLayar: number
  onTutup: () => void
  onTerapkan: (rows: DpaBarisInput[], asal: AsalPerubahan) => void
}) {
  const [dasar, setDasar] = useState<Dasar | null>(null)
  const [galat, setGalat] = useState('')
  const [memuat, setMemuat] = useState(true)

  useEffect(() => {
    let hidup = true
    void (async () => {
      try {
        const res = await fetch(`/api/blud/dpa?mode=dasar-perubahan&tahun=${tahun}`, { cache: 'no-store' })
        let json: { ok?: boolean; dasar?: Dasar | null; error?: string }
        try { json = await res.json() } catch { throw new Error('Jawaban dari server tidak terbaca. Coba lagi sebentar lagi.') }
        if (!res.ok || !json.ok) throw new Error(json.error ?? 'Dasar Perubahan tidak bisa dimuat.')
        if (!hidup) return
        if (!json.dasar) setGalat(`Tahun ${tahun} belum punya DPA — belum ada angka yang bisa dijadikan dasar.`)
        else setDasar(json.dasar)
      } catch (e) {
        if (hidup) setGalat(e instanceof Error ? e.message : 'Dasar Perubahan tidak bisa dimuat.')
      } finally {
        if (hidup) setMemuat(false)
      }
    })()
    return () => { hidup = false }
  }, [tahun])

  useEffect(() => {
    const tutupEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onTutup() }
    window.addEventListener('keydown', tutupEsc)
    return () => window.removeEventListener('keydown', tutupEsc)
  }, [onTutup])

  async function lanjutkan() {
    if (!dasar) return
    if (jumlahDiLayar > 0) {
      const setuju = await confirmDialog({
        title: 'Ganti isi layar dengan dasar Perubahan?',
        message: `${jumlahDiLayar} baris yang sekarang di layar akan diganti ${dasar.jumlah_baris} baris dari `
          + `${dasar.sumber_dasar === 'PERGESERAN' ? 'Pergeseran' : 'DPA'} ${formatTanggalId(dasar.versi_dasar)}.\n\n`
          + `Belum ada yang tersimpan sampai Anda menekan Simpan.`,
        variant: 'warning',
        confirmLabel: 'Ganti isi layar',
      })
      if (!setuju) return
    }
    onTerapkan(dasar.rows, { sumber_dasar: dasar.sumber_dasar, versi_dasar: dasar.versi_dasar })
  }

  const jenis = dasar?.sumber_dasar === 'PERGESERAN' ? 'Pergeseran' : 'DPA'

  return (
    <div
      onClick={onTutup}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 24 }}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="blud-imp-text"
        role="dialog" aria-modal="true" aria-label="Jadikan DPA Perubahan"
        style={{ background: 'var(--surface-card, #042C53)', borderRadius: 14, width: 'min(620px, 96vw)', maxHeight: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,.5)', overflow: 'hidden' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,.08)' }}>
          <FileDiff size={17} />
          <div style={{ fontSize: 14, fontWeight: 800 }}>Jadikan DPA Perubahan ke-{keBerikut}</div>
          <button onClick={onTutup} aria-label="Tutup" style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', opacity: .7 }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: 20, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14, fontSize: 12, lineHeight: 1.7 }}>
          {memuat ? (
            <p className="blud-imp-muted">Memuat angka yang sedang jadi pagu…</p>
          ) : galat ? (
            <div className="blud-imp-badge-warn" style={{ padding: '9px 12px', borderRadius: 8, fontSize: 11.5 }}>{galat}</div>
          ) : dasar && (
            <>
              <div>
                Dasarnya angka yang <strong>sedang jadi pagu</strong> tahun {tahun}:{' '}
                <strong>{jenis} {formatTanggalId(dasar.versi_dasar)}</strong> · {dasar.jumlah_baris} baris · total{' '}
                <strong style={{ fontFamily: 'var(--font-mono, monospace)' }}>{formatRupiah(dasar.total)}</strong>
                {dasar.acuan && (
                  <div className="blud-imp-muted" style={{ fontSize: 11 }}>Mengacu DPA {formatTanggalId(dasar.acuan)}</div>
                )}
              </div>

              {dasar.selisih_draft !== 0 && (
                <div className="blud-imp-badge-warn" style={{ display: 'flex', gap: 8, padding: '9px 12px', borderRadius: 8, fontSize: 11.5 }}>
                  <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 3 }} />
                  <span>
                    Pergeseran ini disimpan sebagai <strong>draf yang belum berimbang</strong> — totalnya{' '}
                    {dasar.selisih_draft > 0 ? 'bertambah' : 'berkurang'}{' '}
                    <strong>{formatRupiah(Math.abs(dasar.selisih_draft))}</strong> dari DPA acuannya. Angka itulah yang terbawa.
                  </span>
                </div>
              )}
              {dasar.dpa_direvisi && (
                <div className="blud-imp-badge-warn" style={{ display: 'flex', gap: 8, padding: '9px 12px', borderRadius: 8, fontSize: 11.5 }}>
                  <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 3 }} />
                  <span>
                    DPA direvisi pada <strong>{formatTanggalId(dasar.dpa_direvisi)}</strong>, sesudah pergeseran ini dibuat,
                    dan belum disinkronkan. Revisi itu <strong>tidak ikut terbawa</strong> ke Perubahan.
                  </span>
                </div>
              )}

              {/* Sasaran ditampilkan, bukan dipilih (L80). */}
              <div className="blud-imp-row" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 8 }}>
                <span className="blud-imp-muted">{jenis} {formatTanggalId(dasar.versi_dasar)}</span>
                <ArrowRight size={14} style={{ flexShrink: 0, opacity: .6 }} />
                <span>
                  <strong>DPA Perubahan ke-{keBerikut} · {formatTanggalId(sasaran)}</strong>
                  <div className="blud-imp-muted" style={{ fontSize: 11 }}>
                    Disimpan sebagai versi DPA baru. Versi yang sudah ada tidak berubah.
                  </div>
                </span>
              </div>

              <div className="blud-imp-muted" style={{ fontSize: 11, borderTop: '1px solid rgba(255,255,255,.08)', paddingTop: 12 }}>
                <div>
                  <strong>Sesudah ini:</strong> tambah, kurangi, atau tambahkan rekening di layar, lalu tekan Simpan.
                  Kolom Sebelum mencatat angka dasar ini dan tidak bisa disunting.
                </div>
                <div style={{ marginTop: 6 }}>
                  <strong>Baris lama tidak dihapus:</strong> menghapusnya menolkan angkanya, supaya dokumen tetap
                  mencatat &quot;Rp sekian → Rp 0&quot;. Pagu yang turun di bawah uang yang sudah terpakai ditolak.
                </div>
              </div>
            </>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center', padding: '12px 20px', borderTop: '1px solid rgba(255,255,255,.08)' }}>
          <span className="blud-imp-muted" style={{ fontSize: 11.5, marginRight: 'auto' }}>
            Belum tersimpan — tekan Simpan sesudah diperiksa.
          </span>
          <PrimaButton variant="ghost" onClick={onTutup}>Batal</PrimaButton>
          <PrimaButton variant="purple" disabled={memuat || !dasar} onClick={() => void lanjutkan()}>
            Isi layar dengan dasar ini
          </PrimaButton>
        </div>
      </div>
    </div>
  )
}
