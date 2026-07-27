'use client'
// components/blud/DetailTransaksiModal.tsx — tampilan BACA-SAJA satu transaksi Buku Kas.
//
// Kenapa layar tersendiri dan bukan TransaksiModal yang dibuat read-only: bulan yang
// sudah ditutup mengunci tombol Ubah, dan begitu terkunci rincian transaksinya jadi
// tidak bisa dilihat sama sekali — padahal justru bulan yang sudah ditutup yang
// paling sering dibuka lagi untuk diperiksa ("PPh-nya tadi berapa?"). Menjadikan
// form input bisa read-only berarti menyulam `disabled` ke tiap isian dan berharap
// tidak ada satu pun yang terlewat; satu yang terlewat = bulan tertutup bisa diubah.
//
// Semua angkanya diambil dari baris yang sudah ada di tabel — tidak ada permintaan
// jaringan baru, jadi bisa dibuka walau server sedang sibuk.
import { createPortal } from 'react-dom'
import { X, Lock } from 'lucide-react'
import PrimaButton from '@/components/ui/PrimaButton'
import { formatTanggalId } from '@/lib/blud/tanggal'
import { LABEL_POTONGAN, type JenisPotongan } from '@/lib/blud/alokasi-rule'

export interface DetailTx {
  id: number
  tanggal: string
  no_kwt: number | null
  jenis: string
  uraian: string
  kas_masuk: number
  kas_keluar: number
  bank_masuk: number
  bank_keluar: number
  status: string
  alokasi: { anggaran_key: string; nilai: number; kode_rekening: string; uraian: string }[]
  potongan: { jenis: JenisPotongan; keterangan: string | null; nilai: number }[]
}

const rp = (n: number) => `Rp ${new Intl.NumberFormat('id-ID').format(Math.round(n))}`

const LABEL_JENIS: Record<string, string> = {
  BELANJA: 'Belanja', AMBIL_BANK: 'Ambil dari bank', SETOR_BANK: 'Setor ke bank',
  PENERIMAAN: 'Penerimaan', PENGEMBALIAN: 'Pengembalian belanja', LAIN: 'Lain-lain',
}

export default function DetailTransaksiModal({ tx, terkunci, onClose }: {
  tx: DetailTx
  /** Bulannya sudah ditutup — dinyatakan, bukan disembunyikan. */
  terkunci: boolean
  onClose: () => void
}) {
  const arus: [string, number][] = [
    ['Kas masuk', tx.kas_masuk], ['Kas keluar', tx.kas_keluar],
    ['Bank masuk', tx.bank_masuk], ['Bank keluar', tx.bank_keluar],
  ]
  const totalPotongan = tx.potongan.reduce((s, p) => s + p.nilai, 0)
  const bruto = tx.kas_keluar + tx.bank_keluar
  const totalAlokasi = tx.alokasi.reduce((s, a) => s + a.nilai, 0)

  return createPortal(
    <div className="blud-modal-overlay" role="dialog" aria-modal="true"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="blud-modal-card bk-detail-card">
        <div className="blud-modal-header">
          <div>
            <div className="blud-modal-title">Rincian transaksi</div>
            <div className="blud-modal-subtitle">
              {formatTanggalId(tx.tanggal)} · {tx.no_kwt ? `kuitansi ${tx.no_kwt}` : 'tanpa nomor kuitansi'} · id {tx.id}
            </div>
          </div>
          <button className="blud-modal-close" onClick={onClose} aria-label="Tutup"><X className="w-4 h-4" /></button>
        </div>

        <div className="bk-detail-body">
          {terkunci && (
            <div className="bk-detail-kunci">
              <Lock className="w-3.5 h-3.5" />
              <span>Bulan ini sudah ditutup — rincian hanya bisa dibaca.</span>
            </div>
          )}

          <div className="bk-detail-baris">
            <span className="blud-imp-muted">Jenis</span>
            <span>{LABEL_JENIS[tx.jenis] ?? tx.jenis}</span>
          </div>
          <div className="bk-detail-baris">
            <span className="blud-imp-muted">Uraian</span>
            <span>{tx.uraian}</span>
          </div>
          {tx.status === 'BELUM_BERREKENING' && (
            <div className="bk-detail-baris">
              <span className="blud-imp-muted">Status</span>
              <span className="bk-tag-parkir">diparkir — rekeningnya belum ada di DPA</span>
            </div>
          )}

          <div className="bk-detail-judul">Arus kas</div>
          <div className="bk-detail-grid">
            {arus.filter(([, v]) => v > 0).map(([label, v]) => (
              <div key={label} className="bk-detail-sel">
                <span className="blud-imp-muted">{label}</span>
                <strong className="bk-detail-angka">{rp(v)}</strong>
              </div>
            ))}
          </div>

          <div className="bk-detail-judul">
            Pembebanan ke baris anggaran
            {tx.alokasi.length > 1 && <span className="blud-imp-muted"> · {tx.alokasi.length} baris</span>}
          </div>
          {tx.alokasi.length === 0 ? (
            <div className="bk-detail-kosong">Transaksi ini tidak membebani baris anggaran mana pun.</div>
          ) : (
            <div className="bk-detail-daftar">
              {tx.alokasi.map((a, i) => (
                <div key={i} className="bk-detail-item">
                  <div>
                    <div className="bk-kode">{a.kode_rekening || '—'}</div>
                    <div className="blud-imp-muted">{a.uraian}</div>
                  </div>
                  {/* Pengembalian tersimpan negatif; ditampilkan apa adanya supaya
                      arah uangnya terbaca, bukan disamarkan jadi positif. */}
                  <strong className="bk-detail-angka">{rp(a.nilai)}</strong>
                </div>
              ))}
              {tx.alokasi.length > 1 && (
                <div className="bk-detail-jumlah">
                  <span>Jumlah alokasi</span>
                  <strong className="bk-detail-angka">{rp(totalAlokasi)}</strong>
                </div>
              )}
            </div>
          )}

          {tx.potongan.length > 0 && (
            <>
              <div className="bk-detail-judul">Potongan yang ditahan</div>
              <div className="bk-detail-daftar">
                {tx.potongan.map((p, i) => (
                  <div key={i} className="bk-detail-item">
                    <div>
                      <div>{LABEL_POTONGAN[p.jenis]}</div>
                      {p.keterangan && <div className="blud-imp-muted">{p.keterangan}</div>}
                    </div>
                    <strong className="bk-detail-angka">{rp(p.nilai)}</strong>
                  </div>
                ))}
                {/* Angka yang paling sering dicari saat memeriksa bulan lama:
                    berapa yang benar-benar sampai ke rekanan. */}
                <div className="bk-detail-jumlah">
                  <span>Diterima rekanan</span>
                  <strong className="bk-detail-angka">{rp(bruto - totalPotongan)}</strong>
                </div>
              </div>
              <div className="bk-detail-catatan">
                Potongan adalah rincian pembayaran ini, bukan transaksi tersendiri —
                pagu sudah habis di baris belanjanya yang dicatat bruto {rp(bruto)}.
              </div>
            </>
          )}
        </div>

        <div className="bk-detail-foot">
          <PrimaButton variant="ghost" onClick={onClose}>Tutup</PrimaButton>
        </div>
      </div>
    </div>,
    document.body,
  )
}
