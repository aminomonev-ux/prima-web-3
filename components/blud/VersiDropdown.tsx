'use client'
// components/blud/VersiDropdown.tsx
// Custom pill-shaped dropdown untuk pilih versi DPA / Pergeseran.
// Theme-aware (dark default + light override via [data-theme="light"]).
//
// Tiap tanggal bisa dibuka untuk melihat RIWAYAT SIMPAN-nya (per jam-menit).
// Memilih versi dan memilih satu simpanan itu tindakan yang sama di kedalaman
// berbeda — dua-duanya memuat isi ke form — jadi tempatnya juga sama. Anak
// barisnya tertutup secara default supaya dropdown tidak meledak jadi 50 baris.

import { useEffect, useMemo, useRef, useState } from 'react'
import { History, ChevronDown, ChevronRight, Check, RotateCcw } from 'lucide-react'
import { formatTanggalId } from '@/lib/blud/tanggal'

export interface VersiItem {
  versi_tanggal: string         // YYYY-MM-DD
  jumlah_baris?: number         // opsional (DPA pakai, Pergeseran tidak)
}

/** Satu klik Simpan. Bentuknya sengaja sama dengan `RiwayatSimpanItem` di server. */
export interface SimpananItem {
  id:                 number
  versi_tanggal:      string
  disimpan_pada:      string   // 'YYYY-MM-DD HH:MM:SS'
  versi_ke:           number
  jumlah_baris:       number
  disimpan_oleh_nama: string | null
}

interface Props {
  value:    string                   // tanggal terpilih (kosong = belum pilih)
  items:    VersiItem[]              // daftar versi (urut desc dari terbaru)
  onChange: (versi: string) => void
  placeholder?: string
  /** Riwayat simpan seluruh tahun; dikelompokkan per tanggal di dalam. */
  riwayat?: SimpananItem[]
  /** Dipanggil saat satu simpanan lama dipilih untuk dimuat ke form. */
  onPulihkan?: (s: SimpananItem) => void
}

const formatTanggal = formatTanggalId

/** '2026-08-26 14:32:05' → '14:32'. Nilai tak dikenal dikembalikan apa adanya. */
function jamMenit(waktu: string): string {
  const m = /\d{4}-\d{2}-\d{2}[ T](\d{2}:\d{2})/.exec(waktu)
  return m ? m[1] : waktu
}

export default function VersiDropdown({
  value, items, onChange, placeholder = '— Pilih Versi —', riwayat, onPulihkan,
}: Props) {
  const [open, setOpen] = useState(false)
  const [terbuka, setTerbuka] = useState<string | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  // Click outside → close
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const selected = items.find(i => i.versi_tanggal === value)
  // Asumsi item[0] = terbaru karena API sudah ORDER BY versi_tanggal DESC
  const berlakuTanggal = items[0]?.versi_tanggal

  const simpananUntuk = (tgl: string) => (riwayat ?? []).filter(s => s.versi_tanggal === tgl)

  /**
   * Tanggal yang punya riwayat simpan tapi versinya sudah tidak ada di `items` —
   * yaitu versi yang dihapus lewat layar Pengaturan. `deleteDpaVersi` sengaja
   * tidak mengikutkan tabel riwayat supaya angkanya bisa dipulihkan; tanpa
   * daftar ini janji itu tidak punya jalan di layar mana pun.
   */
  const yatim = useMemo(() => {
    const ada = new Set(items.map(i => i.versi_tanggal))
    const out: string[] = []
    for (const s of riwayat ?? []) {
      if (!ada.has(s.versi_tanggal) && !out.includes(s.versi_tanggal)) out.push(s.versi_tanggal)
    }
    return out.sort().reverse()
  }, [items, riwayat])

  return (
    <div ref={wrapRef} className="versi-dropdown versi-dropdown--brutalist">
      <button
        type="button"
        className="versi-trigger"
        onClick={() => setOpen(o => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <History className="w-3.5 h-3.5 versi-icon" />
        <span className="versi-label">
          {selected
            ? <>
                {formatTanggal(selected.versi_tanggal)}
                {typeof selected.jumlah_baris === 'number' &&
                  <span className="versi-meta"> · {selected.jumlah_baris} baris</span>}
              </>
            : <span className="versi-placeholder">{placeholder}</span>}
        </span>
        {selected && selected.versi_tanggal === berlakuTanggal && (
          <span className="versi-badge-latest versi-badge-latest--trigger">BERLAKU</span>
        )}
        <ChevronDown className={`w-3.5 h-3.5 versi-chevron ${open ? 'open' : ''}`} />
      </button>

      {open && (
        <div className="versi-menu" role="listbox">
          {items.length === 0 && yatim.length === 0 ? (
            <div className="versi-empty">Belum ada versi tersimpan</div>
          ) : (
            <>
            {items.map(item => {
              const active    = item.versi_tanggal === value
              const isBerlaku = item.versi_tanggal === berlakuTanggal
              const simpanan  = simpananUntuk(item.versi_tanggal)
              const mekar     = terbuka === item.versi_tanggal
              return (
                <div key={item.versi_tanggal}>
                  {/* Panah berdiri SEJAJAR dengan tombol versi, bukan di dalamnya.
                      Dulu ia `<span role="button" tabIndex={-1}>` bersarang di
                      dalam `<button>`: konten interaktif bersarang yang tidak
                      valid, dan karena tidak bisa difokus, pengguna papan ketik
                      tidak punya cara apa pun membuka riwayat — jadi tombol
                      Pulihkan di dalamnya tak pernah tercapai tanpa tetikus. */}
                  <div className="versi-baris">
                    {simpanan.length > 1 ? (
                      <button
                        type="button"
                        aria-label={mekar ? `Tutup riwayat simpan ${formatTanggal(item.versi_tanggal)}` : `Lihat ${simpanan.length} riwayat simpan ${formatTanggal(item.versi_tanggal)}`}
                        aria-expanded={mekar}
                        className={`versi-riwayat-toggle ${mekar ? 'open' : ''}`}
                        onClick={() => setTerbuka(t => t === item.versi_tanggal ? null : item.versi_tanggal)}
                      >
                        <ChevronRight className="w-3 h-3" />
                      </button>
                    ) : (
                      <span className="versi-riwayat-kosong" aria-hidden="true" />
                    )}
                    <button
                      type="button"
                      role="option"
                      aria-selected={active}
                      className={`versi-item ${active ? 'active' : ''}`}
                      onClick={() => { onChange(item.versi_tanggal); setOpen(false) }}
                    >
                      <History className="w-3 h-3 versi-item-icon" />
                      <span className="versi-item-date">{formatTanggal(item.versi_tanggal)}</span>
                      {typeof item.jumlah_baris === 'number' && (
                        <span className="versi-item-meta">· {item.jumlah_baris} baris</span>
                      )}
                      {simpanan.length > 1 && (
                        <span className="versi-item-meta">· {simpanan.length}× simpan</span>
                      )}
                      {isBerlaku && <span className="versi-badge-latest">BERLAKU</span>}
                      {active && <Check className="w-3.5 h-3.5 versi-item-check" />}
                    </button>
                  </div>

                  {mekar && simpanan.map((s, i) => (
                    <BarisSimpanan
                      key={s.id} s={s}
                      // Simpanan terbaru = isi yang sedang tampil di form, jadi
                      // memulihkannya tidak melakukan apa pun.
                      kini={i === 0}
                      onPulihkan={onPulihkan}
                      tutup={() => setOpen(false)}
                    />
                  ))}
                </div>
              )
            })}

            {/* Versi yang barisnya sudah dihapus tapi riwayat simpannya masih
                ada. Tanpa bagian ini janji di layar Pengaturan ("masih bisa
                dimuat ulang dari dropdown versi") tidak punya jalan sama sekali:
                tanggalnya lenyap dari `items`, dan riwayat yang bersarang di
                bawahnya ikut lenyap bersamanya.

                Tanggalnya SENGAJA tidak bisa dipilih sebagai versi — versinya
                memang sudah tidak ada, memuatnya hanya menghasilkan layar
                kosong. Yang bisa ditekan cuma Pulihkan, dan itu menulis versi
                baru bertanggal hari ini. */}
            {yatim.length > 0 && (
              <div className="versi-yatim-grup">
                <div className="versi-yatim-judul">
                  Versi terhapus — riwayatnya masih ada
                </div>
                {yatim.map(tgl => {
                  const simpanan = simpananUntuk(tgl)
                  const mekar    = terbuka === tgl
                  return (
                    <div key={`yatim:${tgl}`}>
                      <div className="versi-baris">
                        <button
                          type="button"
                          aria-label={mekar ? `Tutup riwayat simpan ${formatTanggal(tgl)}` : `Lihat ${simpanan.length} riwayat simpan ${formatTanggal(tgl)}`}
                          aria-expanded={mekar}
                          className={`versi-riwayat-toggle ${mekar ? 'open' : ''}`}
                          onClick={() => setTerbuka(t => t === tgl ? null : tgl)}
                        >
                          <ChevronRight className="w-3 h-3" />
                        </button>
                        <div className="versi-item versi-item--yatim">
                          <History className="w-3 h-3 versi-item-icon" />
                          <span className="versi-item-date">{formatTanggal(tgl)}</span>
                          <span className="versi-item-meta">· {simpanan.length}× simpan</span>
                        </div>
                      </div>
                      {mekar && simpanan.map(s => (
                        // Tidak ada satu pun yang "tampil sekarang": versinya
                        // sudah tidak ada, jadi semuanya bisa dipulihkan.
                        <BarisSimpanan
                          key={s.id} s={s} kini={false}
                          onPulihkan={onPulihkan} tutup={() => setOpen(false)}
                        />
                      ))}
                    </div>
                  )
                })}
              </div>
            )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

function BarisSimpanan({ s, kini, onPulihkan, tutup }: {
  s:          SimpananItem
  kini:       boolean
  onPulihkan?: (s: SimpananItem) => void
  tutup:      () => void
}) {
  return (
    <div className="versi-simpanan">
      <span className="versi-simpanan-jam">{jamMenit(s.disimpan_pada)}</span>
      <span className="versi-simpanan-teks">
        Simpan ke-{s.versi_ke} · {s.jumlah_baris} baris
        {s.disimpan_oleh_nama && ` · ${s.disimpan_oleh_nama}`}
      </span>
      {kini ? (
        <span className="versi-simpanan-kini">tampil sekarang</span>
      ) : onPulihkan && (
        <button
          type="button"
          className="versi-simpanan-pulih"
          onClick={() => { tutup(); onPulihkan(s) }}
        >
          <RotateCcw className="w-3 h-3" /> Pulihkan
        </button>
      )}
    </div>
  )
}
