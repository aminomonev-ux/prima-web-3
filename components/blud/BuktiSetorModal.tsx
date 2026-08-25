'use client'
// components/blud/BuktiSetorModal.tsx — perakit satu slip "BUKTI SETOR KE BANK BPD".
// Konsep: docs/CONCEPT-blud-bukti-setor.md (keputusan #36)
//
// Ini satu-satunya layar di modul BLUD yang menerima baris ketikan lepas. Yang
// membuatnya tetap aman: setiap baris membawa asalnya, dan jumlah baris ketikan
// dinyatakan terang-terangan di bawah tabel. Ketikan lepas boleh — tapi tidak
// pernah tersembunyi.
//
// `Total` dan `Cash` tidak bisa diketik, meniru rumus di berkas asli
// (`=SUM(D8:D18)` dan `=D19-D20`). Server menghitung ulang keduanya saat membaca.

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Plus, Search, AlertTriangle, Keyboard, Banknote } from 'lucide-react'
import PrimaButton from '@/components/ui/PrimaButton'
import DeleteButton from '@/components/ui/DeleteButton'
import { LABEL_POTONGAN, type JenisPotongan } from '@/lib/blud/alokasi-rule'

export type AsalBarisUI = 'BKU' | 'POTONGAN' | 'KETIK'

export interface BarisUI {
  asal: AsalBarisUI
  tx_id: number | null
  potongan_id: number | null
  uraian: string
  nilai: number
  no_kwt: number | null
  hilang?: boolean
}

export interface BuktiSetorAwal {
  id: number
  version: number
  tanggal: string
  no_bukti: string | null
  ambil_tx_id: number | null
  ambil_uang: number
  baris: BarisUI[]
}

interface TxPotongan { id: number; jenis: JenisPotongan; keterangan: string | null; nilai: number }
interface TxRow {
  id: number
  tanggal: string
  no_kwt: number | null
  jenis: string
  uraian: string
  kas_masuk: number
  kas_keluar: number
  bank_masuk: number
  bank_keluar: number
  potongan?: TxPotongan[]
}

interface Props {
  tahun: number
  bulan: number
  awal: BuktiSetorAwal | null
  onClose: () => void
  onSaved: () => void
}

const rp = (n: number) => new Intl.NumberFormat('id-ID').format(Math.round(n))
const angka = (s: string) => Number(String(s).replace(/[^\d-]/g, '') || 0)
const nilaiTx = (t: TxRow) => {
  const keluar = t.kas_keluar + t.bank_keluar
  return keluar > 0 ? keluar : t.kas_masuk + t.bank_masuk
}

export default function BuktiSetorModal({ tahun, bulan, awal, onClose, onSaved }: Props) {
  const [tanggal, setTanggal] = useState(awal?.tanggal ?? `${tahun}-${String(bulan).padStart(2, '0')}-01`)
  const [noBukti, setNoBukti] = useState(awal?.no_bukti ?? '')
  const [ambilTxId, setAmbilTxId] = useState<number | null>(awal?.ambil_tx_id ?? null)
  const [ambilManual, setAmbilManual] = useState(awal?.ambil_tx_id ? 0 : (awal?.ambil_uang ?? 0))
  const [baris, setBaris] = useState<BarisUI[]>(() => awal?.baris.map(b => ({ ...b })) ?? [])
  const [txList, setTxList] = useState<TxRow[]>([])
  const [picker, setPicker] = useState<'BARIS' | 'AMBIL' | null>(null)
  const [cari, setCari] = useState('')
  const [saving, setSaving] = useState(false)
  const [galat, setGalat] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const res = await fetch(`/api/blud/realisasi/tx?tahun=${tahun}&bulan=${bulan}`)
        const json = await res.json()
        if (alive && res.ok && json.ok) setTxList(json.data?.rows ?? [])
      } catch { /* pemilih kosong — pesannya sudah jelas di dalam pemilih */ }
    })()
    return () => { alive = false }
  }, [tahun, bulan])

  const txById = useMemo(() => new Map(txList.map(t => [t.id, t])), [txList])
  const ambilTx = ambilTxId != null ? txById.get(ambilTxId) : undefined
  const ambilUang = ambilTx ? nilaiTx(ambilTx) : (ambilTxId != null ? (awal?.ambil_uang ?? 0) : ambilManual)

  const total = baris.reduce((s, b) => s + b.nilai, 0)
  const cash = ambilUang - total
  const ketik = baris.filter(b => b.asal === 'KETIK')
  const nilaiKetik = ketik.reduce((s, b) => s + b.nilai, 0)

  const terpakaiTx = useMemo(() => new Set(baris.filter(b => b.tx_id != null).map(b => b.tx_id!)), [baris])
  const terpakaiPot = useMemo(() => new Set(baris.filter(b => b.potongan_id != null).map(b => b.potongan_id!)), [baris])

  /** Calon baris = transaksi bulan ini + tiap potongan di dalamnya, yang belum dipakai. */
  const calon = useMemo(() => {
    const q = cari.trim().toLowerCase()
    const out: BarisUI[] = []
    for (const t of txList) {
      if (!terpakaiTx.has(t.id)) {
        out.push({ asal: 'BKU', tx_id: t.id, potongan_id: null, uraian: t.uraian, nilai: nilaiTx(t), no_kwt: t.no_kwt })
      }
      for (const p of t.potongan ?? []) {
        if (terpakaiPot.has(p.id)) continue
        out.push({
          asal: 'POTONGAN', tx_id: null, potongan_id: p.id,
          // Label sama persis dengan yang dipakai server saat membaca baris ini
          // kembali — kalau berbeda, uraian di layar berubah setelah disimpan.
          uraian: `Setor ${LABEL_POTONGAN[p.jenis]}${p.keterangan ? ` ${p.keterangan}` : ''}`,
          nilai: p.nilai, no_kwt: t.no_kwt,
        })
      }
    }
    if (!q) return out.slice(0, 120)
    return out.filter(b => b.uraian.toLowerCase().includes(q)).slice(0, 120)
  }, [txList, terpakaiTx, terpakaiPot, cari])

  const calonAmbil = useMemo(
    () => txList.filter(t => t.jenis === 'AMBIL_BANK'),
    [txList],
  )

  function geser(i: number, arah: -1 | 1) {
    setBaris(prev => {
      const j = i + arah
      if (j < 0 || j >= prev.length) return prev
      const next = [...prev]
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })
  }

  async function simpan() {
    setGalat(null)
    if (!tanggal.startsWith(`${tahun}-${String(bulan).padStart(2, '0')}-`)) {
      setGalat('Tanggal bukti setor harus berada di bulan yang dipilih.'); return
    }
    if (!baris.length) { setGalat('Belum ada baris. Ambil dari BKU atau ketik satu baris.'); return }
    if (ketik.some(b => !b.uraian.trim() || b.nilai <= 0)) {
      setGalat('Masih ada baris ketikan yang uraian atau nilainya kosong.'); return
    }

    const body = {
      id: awal?.id ?? null,
      expected_version: awal?.version ?? null,
      tahun_anggaran: tahun,
      bulan,
      tanggal,
      no_bukti: noBukti.trim() || null,
      ambil_tx_id: ambilTxId,
      ambil_manual: ambilTxId != null ? null : (ambilManual || null),
      baris: baris.map(b => ({
        asal: b.asal,
        tx_id: b.asal === 'BKU' ? b.tx_id : null,
        potongan_id: b.asal === 'POTONGAN' ? b.potongan_id : null,
        uraian: b.asal === 'KETIK' ? b.uraian.trim() : null,
        nilai: b.asal === 'KETIK' ? b.nilai : null,
      })),
    }

    setSaving(true)
    try {
      const res = await fetch('/api/blud/bukti-setor', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      let json: { ok?: boolean; error?: string } = {}
      try { json = await res.json() } catch { /* respons bukan JSON — tangani lewat status */ }
      if (!res.ok) { setGalat(json.error ?? 'Belum tersimpan. Coba lagi sebentar lagi.'); return }
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
            <div className="blud-modal-title">{awal ? 'Ubah Bukti Setor' : 'Bukti Setor Baru'}</div>
            <div className="blud-modal-subtitle">
              Bukti setor ke bank {String(bulan).padStart(2, '0')}/{tahun}
              {awal?.id ? ` · id ${awal.id}` : ''}
            </div>
          </div>
          <button className="blud-modal-close" onClick={onClose} aria-label="Tutup"><X className="w-4 h-4" /></button>
        </div>

        <div className="bk-modal-body">
          <div className="bk-grid">
            <label className="bk-field">
              <span className="blud-imp-muted">Tanggal setor</span>
              <input type="date" className="blud-imp-input" value={tanggal} onChange={e => setTanggal(e.target.value)} />
            </label>
            <label className="bk-field">
              <span className="blud-imp-muted">Nomor bukti (opsional)</span>
              <input className="blud-imp-input" value={noBukti} maxLength={64}
                placeholder="mis. 900/BS-004/2026" onChange={e => setNoBukti(e.target.value)} />
            </label>
          </div>

          <div className="bs-ambil">
            <span className="blud-imp-dock-title blud-imp-muted">AMBIL UANG</span>
            {ambilTx ? (
              <div className="bs-ambil-terpilih">
                <span className="blud-imp-text">{ambilTx.uraian}</span>
                <span className="bk-num-inline">Rp {rp(nilaiTx(ambilTx))}</span>
                <button type="button" className="blud-imp-link" onClick={() => setAmbilTxId(null)}>lepas</button>
              </div>
            ) : (
              <div className="bs-ambil-pilih">
                <PrimaButton size="sm" variant="purple" iconLeft={<Banknote className="w-3.5 h-3.5" />}
                  onClick={() => { setPicker('AMBIL'); setCari('') }}>
                  Pilih dari BKU
                </PrimaButton>
                <span className="blud-imp-muted">atau ketik</span>
                <input className="blud-imp-input bk-num bs-ambil-nilai" inputMode="numeric"
                  value={rp(ambilManual)} onChange={e => setAmbilManual(angka(e.target.value))} />
              </div>
            )}
            <div className="bk-note">
              Kalau tarikannya sudah tercatat di Buku Kas, <b>pilih</b> — mengetik ulang berarti membuat
              salinan kedua dari satu kejadian yang sama.
            </div>
          </div>

          <div className="bk-alokasi">
            <div className="bk-alokasi-head">
              <span className="blud-imp-dock-title blud-imp-muted">RINCIAN SETORAN</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <PrimaButton size="sm" variant="purple" iconLeft={<Plus className="w-3.5 h-3.5" />}
                  onClick={() => { setPicker('BARIS'); setCari('') }}>
                  Ambil dari BKU
                </PrimaButton>
                <PrimaButton size="sm" variant="ghost" iconLeft={<Keyboard className="w-3.5 h-3.5" />}
                  onClick={() => setBaris(prev => [...prev, { asal: 'KETIK', tx_id: null, potongan_id: null, uraian: '', nilai: 0, no_kwt: null }])}>
                  Ketik Baris
                </PrimaButton>
              </div>
            </div>

            {baris.length === 0 && (
              <div className="bk-potongan-kosong blud-imp-muted">
                Belum ada baris. Ambil dari Buku Kas supaya angkanya terikat, atau ketik lepas kalau
                memang belum tercatat di sana.
              </div>
            )}

            {baris.map((b, i) => (
              <div key={i} className="bs-baris">
                <div className="bs-baris-urut">
                  <button type="button" className="blud-act" onClick={() => geser(i, -1)} disabled={i === 0} aria-label="Naikkan">↑</button>
                  <button type="button" className="blud-act" onClick={() => geser(i, 1)} disabled={i === baris.length - 1} aria-label="Turunkan">↓</button>
                </div>
                {b.asal === 'KETIK' ? (
                  <>
                    <input className="blud-imp-input" value={b.uraian} maxLength={255} placeholder="uraian baris"
                      onChange={e => setBaris(prev => prev.map((x, j) => j === i ? { ...x, uraian: e.target.value } : x))} />
                    <input className="blud-imp-input bk-num" inputMode="numeric" value={rp(b.nilai)}
                      onChange={e => setBaris(prev => prev.map((x, j) => j === i ? { ...x, nilai: angka(e.target.value) } : x))} />
                    <span className="bs-tag bs-tag-ketik">ketikan</span>
                  </>
                ) : (
                  <>
                    <span className={`blud-imp-text bs-baris-uraian${b.hilang ? ' bs-hilang' : ''}`}>{b.uraian}</span>
                    <span className="bk-num-inline bs-baris-nilai">Rp {rp(b.nilai)}</span>
                    <span className="bs-tag bs-tag-bku">
                      {b.asal === 'POTONGAN' ? 'potongan' : 'BKU'}{b.no_kwt != null ? ` · kwt ${b.no_kwt}` : ''}
                    </span>
                  </>
                )}
                <DeleteButton onClick={() => setBaris(prev => prev.filter((_, j) => j !== i))} />
              </div>
            ))}

            {baris.length > 0 && (
              <>
                <div className="bs-hitung">
                  <span>Total</span><span className="bk-num-inline">Rp {rp(total)}</span>
                </div>
                <div className={`bs-hitung bs-cash${cash < -0.005 ? ' timpang' : ''}`}>
                  <span>Cash</span><span className="bk-num-inline">Rp {rp(cash)}</span>
                </div>
                <div className={`bk-seimbang ${ketik.length ? 'timpang' : 'pas'}`}>
                  {baris.length - ketik.length} baris terhubung ke BKU
                  {ketik.length > 0 && ` · ${ketik.length} baris diketik lepas senilai Rp ${rp(nilaiKetik)}`}
                </div>
                {cash < -0.005 && (
                  <div className="bk-note">
                    Pemakaian melebihi tarikan sebesar <b>Rp {rp(Math.abs(cash))}</b>. Boleh disimpan —
                    tapi periksa lagi daftarnya, biasanya ada baris yang bukan bagian dari tarikan ini.
                  </div>
                )}
              </>
            )}
          </div>

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

        {picker && (
          <div className="bk-picker">
            <div className="bk-picker-head">
              <Search className="w-3.5 h-3.5 blud-imp-muted" />
              <input autoFocus className="blud-imp-input"
                placeholder={picker === 'AMBIL' ? 'Cari transaksi ambil bank…' : 'Cari uraian transaksi…'}
                value={cari} onChange={e => setCari(e.target.value)} />
              <button className="blud-modal-close" onClick={() => setPicker(null)} aria-label="Tutup pemilih">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="bk-picker-list">
              {picker === 'AMBIL' ? (
                <>
                  {calonAmbil.length === 0 && (
                    <div className="bk-picker-kosong blud-imp-muted">
                      Tidak ada transaksi <b>ambil dari bank</b> di bulan ini. Tutup pemilih ini lalu
                      ketik nominalnya kalau tarikannya memang belum tercatat.
                    </div>
                  )}
                  {calonAmbil.map(t => (
                    <button key={t.id} type="button" className="blud-imp-row bk-picker-item"
                      onClick={() => { setAmbilTxId(t.id); setAmbilManual(0); setPicker(null) }}>
                      <span className="bk-kode">{t.tanggal.slice(8, 10)}/{t.tanggal.slice(5, 7)}</span>
                      <span className="blud-imp-text bk-picker-uraian">{t.uraian}</span>
                      <span className="bk-picker-sisa">Rp {rp(nilaiTx(t))}</span>
                    </button>
                  ))}
                </>
              ) : (
                <>
                  {calon.length === 0 && (
                    <div className="bk-picker-kosong blud-imp-muted">
                      Tidak ada transaksi yang cocok, atau semuanya sudah dipakai. Tutup pemilih ini
                      lalu pakai <b>Ketik Baris</b> kalau memang belum tercatat di Buku Kas.
                    </div>
                  )}
                  {calon.map((c, i) => (
                    <button key={i} type="button" className="blud-imp-row bk-picker-item"
                      onClick={() => setBaris(prev => [...prev, c])}>
                      <span className="bk-kode">{c.asal === 'POTONGAN' ? 'potongan' : `kwt ${c.no_kwt ?? '-'}`}</span>
                      <span className="blud-imp-text bk-picker-uraian">{c.uraian}</span>
                      <span className="bk-picker-sisa">Rp {rp(c.nilai)}</span>
                    </button>
                  ))}
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
