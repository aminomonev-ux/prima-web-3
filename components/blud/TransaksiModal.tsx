'use client'
// components/blud/TransaksiModal.tsx — form satu transaksi Buku Kas BLUD.
// Konsep: docs/CONCEPT-blud-realisasi.md §2.4, §2.5, §4.1, §4.2
//
// Dua hal yang membedakan form ini dari form biasa:
//   1. Rekening DIPILIH dari pohon DPA/Pergeseran terbaru, tidak diketik (§2.4).
//      Kode rekening di BKU jadi sama dengan di DPA karena sumbernya sama.
//   2. Satu transaksi boleh dibagi ke beberapa baris anggaran (§2.5) — satu kuitansi
//      belanja modal sering memuat beberapa barang. Tombol "Bagi" baru muncul saat
//      dibutuhkan supaya tampilan tetap sederhana untuk kasus umum.

import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Search, X, Plus, AlertTriangle } from 'lucide-react'
import PrimaButton from '@/components/ui/PrimaButton'
import DeleteButton from '@/components/ui/DeleteButton'

export interface BarisPaguUI {
  anggaran_key: string
  kode_rekening: string
  uraian: string
  pagu: number
  terserap: number
  sisa: number
  is_leaf: boolean
}

export interface TransaksiAwal {
  id: number
  version: number
  tanggal: string
  jenis: string
  uraian: string
  kas_masuk: number
  kas_keluar: number
  bank_masuk: number
  bank_keluar: number
  status: string
  alokasi: { anggaran_key: string; nilai: number }[]
}

interface Props {
  tahun: number
  bulan: number
  baris: BarisPaguUI[]
  awal: TransaksiAwal | null
  onClose: () => void
  onSaved: () => void
}

const JENIS_OPSI = [
  { v: 'BELANJA', t: 'Belanja' },
  { v: 'AMBIL_BANK', t: 'Ambil dari bank' },
  { v: 'SETOR_BANK', t: 'Setor ke bank' },
  { v: 'PENERIMAAN', t: 'Penerimaan' },
  { v: 'LAIN', t: 'Lain-lain' },
]

const rp = (n: number) => new Intl.NumberFormat('id-ID').format(Math.round(n))
const angka = (s: string) => Number(String(s).replace(/[^\d-]/g, '') || 0)

// Dirender hanya saat modal dibuka dan diberi `key` oleh pemanggil, jadi state
// cukup diambil dari prop saat mount — tanpa effect yang me-reset state
// (react-hooks/set-state-in-effect).
export default function TransaksiModal({ tahun, bulan, baris, awal, onClose, onSaved }: Props) {
  const [tanggal, setTanggal] = useState(awal?.tanggal ?? `${tahun}-${String(bulan).padStart(2, '0')}-01`)
  const [jenis, setJenis] = useState(awal?.jenis ?? 'BELANJA')
  const [uraian, setUraian] = useState(awal?.uraian ?? '')
  const [kasKeluar, setKasKeluar] = useState(awal?.kas_keluar ?? 0)
  const [bankKeluar, setBankKeluar] = useState(awal?.bank_keluar ?? 0)
  const [kasMasuk, setKasMasuk] = useState(awal?.kas_masuk ?? 0)
  const [bankMasuk, setBankMasuk] = useState(awal?.bank_masuk ?? 0)
  const [alokasi, setAlokasi] = useState<{ anggaran_key: string; nilai: number }[]>(
    () => awal?.alokasi.map(a => ({ ...a })) ?? [],
  )
  const [parkir, setParkir] = useState(awal?.status === 'BELUM_BERREKENING')
  const [cari, setCari] = useState('')
  const [pickerFor, setPickerFor] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [galat, setGalat] = useState<string | null>(null)

  const byKey = useMemo(() => new Map(baris.map(b => [b.anggaran_key, b])), [baris])
  const beban = kasKeluar + bankKeluar
  const totalAlokasi = alokasi.reduce((s, a) => s + a.nilai, 0)
  const perluAlokasi = jenis === 'BELANJA' && !parkir
  const selisih = beban - totalAlokasi

  const hasilCari = useMemo(() => {
    const q = cari.trim().toLowerCase()
    const leaf = baris.filter(b => b.is_leaf)
    if (!q) return leaf.slice(0, 60)
    return leaf.filter(b =>
      b.kode_rekening.toLowerCase().includes(q) || b.uraian.toLowerCase().includes(q)
    ).slice(0, 60)
  }, [baris, cari])

  function pilihBaris(key: string) {
    if (pickerFor == null) return
    setAlokasi(prev => prev.map((a, i) => i === pickerFor ? { ...a, anggaran_key: key } : a))
    setPickerFor(null); setCari('')
  }

  function tambahAlokasi() {
    // Alokasi pertama otomatis mengambil seluruh nilai belanja — kasus umum satu
    // kuitansi = satu rekening tidak perlu mengetik nominal dua kali.
    setAlokasi(prev => [...prev, { anggaran_key: '', nilai: prev.length === 0 ? beban : Math.max(0, selisih) }])
    setPickerFor(alokasi.length)
  }

  async function simpan() {
    setGalat(null)
    if (!uraian.trim()) { setGalat('Uraian wajib diisi.'); return }
    if (perluAlokasi && alokasi.some(a => !a.anggaran_key)) { setGalat('Masih ada alokasi yang belum dipilih rekeningnya.'); return }
    if (perluAlokasi && Math.abs(selisih) > 0.005) {
      setGalat(`Total alokasi Rp ${rp(totalAlokasi)} tidak sama dengan nilai belanja Rp ${rp(beban)}.`); return
    }

    const transaksi = {
      tanggal, jenis, uraian: uraian.trim(),
      kas_masuk: kasMasuk, kas_keluar: kasKeluar,
      bank_masuk: bankMasuk, bank_keluar: bankKeluar,
      alokasi: parkir ? [] : alokasi,
      belum_berrekening: parkir,
    }

    setSaving(true)
    try {
      const res = await fetch('/api/blud/realisasi/tx', {
        method: awal ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(awal
          ? { id: awal.id, expected_version: awal.version, transaksi }
          : { tahun_anggaran: tahun, bulan, transaksi }),
      })
      let json: { ok?: boolean; error?: string; code?: string; detail?: Record<string, number | string> } = {}
      try { json = await res.json() } catch { /* respons bukan JSON — tangani lewat status */ }

      if (!res.ok) {
        if (json.code === 'PAGU_TERLAMPAUI' && json.detail) {
          const d = json.detail
          setGalat(
            `Melebihi pagu ${d.kode_rekening} — ${d.uraian}\n` +
            `Pagu Rp ${rp(Number(d.pagu))} · terserap Rp ${rp(Number(d.terserap))} · ` +
            `transaksi ini Rp ${rp(Number(d.nilai))} → kurang Rp ${rp(Number(d.kekurangan))}.\n` +
            `Minta pergeseran lebih dulu, atau parkir transaksi ini kalau rekeningnya memang belum ada.`
          )
        } else {
          setGalat(json.error ?? `Gagal menyimpan (${res.status}).`)
        }
        return
      }
      onSaved(); onClose()
    } catch {
      setGalat('Tidak bisa menghubungi server. Coba lagi.')
    } finally {
      setSaving(false)
    }
  }

  return createPortal(
    <div className="blud-modal-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="blud-modal-card bk-modal" role="dialog" aria-modal="true">
        <div className="blud-modal-header">
          <div>
            <div className="blud-modal-title">{awal ? 'Ubah Transaksi' : 'Transaksi Baru'}</div>
            <div className="blud-modal-subtitle">
              Buku Kas {String(bulan).padStart(2, '0')}/{tahun}
              {awal?.id ? ` · id ${awal.id}` : ' · nomor kuitansi diberikan sistem'}
            </div>
          </div>
          <button className="blud-modal-close" onClick={onClose} aria-label="Tutup"><X className="w-4 h-4" /></button>
        </div>

        <div className="bk-modal-body">
          <div className="bk-grid">
            <label className="bk-field">
              <span className="blud-imp-muted">Tanggal</span>
              <input type="date" className="blud-imp-input" value={tanggal} onChange={e => setTanggal(e.target.value)} />
            </label>
            <label className="bk-field">
              <span className="blud-imp-muted">Jenis</span>
              <select className="blud-imp-input" value={jenis} onChange={e => setJenis(e.target.value)}>
                {JENIS_OPSI.map(o => <option key={o.v} value={o.v}>{o.t}</option>)}
              </select>
            </label>
          </div>

          <label className="bk-field">
            <span className="blud-imp-muted">Uraian</span>
            <input className="blud-imp-input" value={uraian} maxLength={2000}
              placeholder="mis. Pembayaran tagihan telepon Juni"
              onChange={e => setUraian(e.target.value)} />
          </label>

          <div className="bk-grid-4">
            <label className="bk-field">
              <span className="blud-imp-muted">Kas keluar</span>
              <input className="blud-imp-input bk-num" inputMode="numeric" value={rp(kasKeluar)}
                onChange={e => setKasKeluar(angka(e.target.value))} />
            </label>
            <label className="bk-field">
              <span className="blud-imp-muted">Bank keluar</span>
              <input className="blud-imp-input bk-num" inputMode="numeric" value={rp(bankKeluar)}
                onChange={e => setBankKeluar(angka(e.target.value))} />
            </label>
            <label className="bk-field">
              <span className="blud-imp-muted">Kas masuk</span>
              <input className="blud-imp-input bk-num" inputMode="numeric" value={rp(kasMasuk)}
                onChange={e => setKasMasuk(angka(e.target.value))} />
            </label>
            <label className="bk-field">
              <span className="blud-imp-muted">Bank masuk</span>
              <input className="blud-imp-input bk-num" inputMode="numeric" value={rp(bankMasuk)}
                onChange={e => setBankMasuk(angka(e.target.value))} />
            </label>
          </div>

          {jenis === 'BELANJA' && (
            <>
              <label className="bk-parkir">
                <input type="checkbox" checked={parkir} onChange={e => setParkir(e.target.checked)} />
                <span className="blud-imp-text">
                  Rekeningnya belum ada di DPA — <b>parkir</b> transaksi ini
                </span>
              </label>
              {parkir && (
                <div className="bk-note">
                  Uangnya tetap ikut menghitung saldo kas di BKU supaya angka kas tidak salah, tapi belum masuk
                  serapan anggaran. <b>Tutup Kas terkunci</b> selama masih ada transaksi terparkir.
                </div>
              )}
            </>
          )}

          {perluAlokasi && (
            <div className="bk-alokasi">
              <div className="bk-alokasi-head">
                <span className="blud-imp-dock-title blud-imp-muted">PEMBEBANAN KE BARIS ANGGARAN</span>
                <PrimaButton size="sm" variant="purple" iconLeft={<Plus className="w-3.5 h-3.5" />} onClick={tambahAlokasi}>
                  {alokasi.length === 0 ? 'Pilih Rekening' : 'Bagi ke Baris Lain'}
                </PrimaButton>
              </div>

              {alokasi.map((a, i) => {
                const b = byKey.get(a.anggaran_key)
                return (
                  <div key={i} className="bk-alokasi-row">
                    <button type="button" className="bk-pick" onClick={() => { setPickerFor(i); setCari('') }}>
                      {b
                        ? <><span className="bk-kode">{b.kode_rekening || '—'}</span><span className="blud-imp-text">{b.uraian}</span></>
                        : <span className="blud-imp-muted">— pilih baris anggaran —</span>}
                    </button>
                    <input className="blud-imp-input bk-num bk-alokasi-nilai" inputMode="numeric" value={rp(a.nilai)}
                      onChange={e => setAlokasi(prev => prev.map((x, j) => j === i ? { ...x, nilai: angka(e.target.value) } : x))} />
                    <DeleteButton onClick={() => setAlokasi(prev => prev.filter((_, j) => j !== i))} />
                    {b && (
                      <div className="bk-sisa blud-imp-muted">
                        sisa sekarang Rp {rp(b.sisa)} dari pagu Rp {rp(b.pagu)}
                      </div>
                    )}
                  </div>
                )
              })}

              {alokasi.length > 0 && (
                <div className={`bk-seimbang ${Math.abs(selisih) > 0.005 ? 'timpang' : 'pas'}`}>
                  Belanja Rp {rp(beban)} · dialokasikan Rp {rp(totalAlokasi)}
                  {Math.abs(selisih) > 0.005 ? ` · selisih Rp ${rp(Math.abs(selisih))}` : ' · pas'}
                </div>
              )}
            </div>
          )}

          {galat && (
            <div className="bk-galat">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span style={{ whiteSpace: 'pre-line' }}>{galat}</span>
            </div>
          )}
        </div>

        <div className="bk-modal-foot">
          <PrimaButton variant="ghost" onClick={onClose}>Batal</PrimaButton>
          <PrimaButton variant="primary" onClick={simpan} disabled={saving}>
            {saving ? 'Menyimpan…' : 'Simpan'}
          </PrimaButton>
        </div>

        {pickerFor != null && (
          <div className="bk-picker">
            <div className="bk-picker-head">
              <Search className="w-3.5 h-3.5 blud-imp-muted" />
              <input autoFocus className="blud-imp-input" placeholder="Cari kode atau uraian…"
                value={cari} onChange={e => setCari(e.target.value)} />
              <button className="blud-modal-close" onClick={() => setPickerFor(null)} aria-label="Tutup pemilih">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="bk-picker-list">
              {hasilCari.length === 0 && (
                <div className="bk-picker-kosong blud-imp-muted">
                  Tidak ada baris anggaran yang cocok. Kalau rekeningnya memang belum ada di DPA,
                  tutup pemilih ini lalu centang <b>parkir</b>.
                </div>
              )}
              {hasilCari.map(b => (
                <button key={b.anggaran_key} type="button" className="blud-imp-row bk-picker-item"
                  onClick={() => pilihBaris(b.anggaran_key)}>
                  <span className="bk-kode">{b.kode_rekening || '—'}</span>
                  <span className="blud-imp-text bk-picker-uraian">{b.uraian}</span>
                  <span className={`bk-picker-sisa ${b.sisa <= 0 ? 'habis' : ''}`}>Rp {rp(b.sisa)}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
