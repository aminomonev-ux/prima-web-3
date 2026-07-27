'use client'
// components/blud/PejabatSpjPanel.tsx — pejabat penanda tangan dokumen SPJ BLUD.
// Konsep: docs/CONCEPT-blud-realisasi.md §3.1, keputusan #29.
//
// Di Excel, nama & NIP pejabat diketik ulang di 5 lembar berbeda. Di sini diisi
// sekali per tahun.
//
// "Ambil dari PK" MENYALIN nama/NIP/pangkat dari master Perjanjian Kinerja, lalu
// melepasnya. Bukan tautan hidup: kalau tahun depan pejabatnya berganti di PK,
// SPJ tahun ini yang sudah ditandatangani tidak boleh ikut berubah.
//
// pk_pejabat hanya memuat jabatan struktural — Bendahara Pengeluaran & PPK-BLUD
// tidak ada di sana. Untuk dua peran itu daftarnya tetap berguna sebagai sumber
// nama + NIP, bunyi jabatannya diketik sendiri.

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Users, Search, Save, X } from 'lucide-react'
import PrimaButton from '@/components/ui/PrimaButton'
import TahunDropdown from '@/components/blud/TahunDropdown'

const CURRENT_YEAR = new Date().getFullYear()

type Jabatan = 'DIREKTUR' | 'BENDAHARA' | 'PPK'

const PERAN: { key: Jabatan; label: string; petunjuk: string }[] = [
  { key: 'DIREKTUR',  label: 'Direktur',             petunjuk: 'penanda tangan pengantar & SPJ' },
  { key: 'BENDAHARA', label: 'Bendahara Pengeluaran', petunjuk: 'penanda tangan BKU & Tutup Kas' },
  { key: 'PPK',       label: 'PPK-BLUD',              petunjuk: 'penanda tangan verifikasi' },
]

interface Isian {
  nama: string
  nip: string
  pangkat: string
  jabatan_teks: string
  pk_pejabat_id: number | null
}

interface SaranPk {
  pk_pejabat_id: number
  unit_kerja: string
  nama: string
  jabatan: string
  pangkat: string | null
  nip: string | null
}

const kosong = (): Isian => ({ nama: '', nip: '', pangkat: '', jabatan_teks: '', pk_pejabat_id: null })

export default function PejabatSpjPanel({ bolehUbah }: { bolehUbah: boolean }) {
  const [tahun, setTahun] = useState<number | null>(null)
  const [tahunList, setTahunList] = useState<number[]>([])
  const [isi, setIsi] = useState<Record<Jabatan, Isian>>({
    DIREKTUR: kosong(), BENDAHARA: kosong(), PPK: kosong(),
  })
  const [loading, setLoading] = useState(true)
  const [sibuk, setSibuk] = useState(false)

  const [pilihUntuk, setPilihUntuk] = useState<Jabatan | null>(null)
  const [saran, setSaran] = useState<SaranPk[]>([])
  const [memuatSaran, setMemuatSaran] = useState(false)
  const [cari, setCari] = useState('')

  useEffect(() => {
    let alive = true
    void (async () => {
      try {
        const res = await fetch('/api/blud/dpa?mode=tahun-list')
        const json = await res.json()
        if (!alive) return
        const list: number[] = json.data ?? []
        setTahunList(list)
        setTahun(list.includes(CURRENT_YEAR) ? CURRENT_YEAR : (list[0] ?? CURRENT_YEAR))
      } catch {
        if (alive) setTahun(CURRENT_YEAR)
      }
    })()
    return () => { alive = false }
  }, [])

  const muat = useCallback(async (th: number) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/blud/pejabat?tahun=${th}`)
      const json = await res.json()
      if (!res.ok || !json.ok) { toast.error(json.error ?? 'Gagal memuat pejabat'); return }
      const next: Record<Jabatan, Isian> = { DIREKTUR: kosong(), BENDAHARA: kosong(), PPK: kosong() }
      for (const p of (json.data ?? [])) {
        next[p.jabatan as Jabatan] = {
          nama: p.nama ?? '', nip: p.nip ?? '', pangkat: p.pangkat ?? '',
          jabatan_teks: p.jabatan_teks ?? '', pk_pejabat_id: p.pk_pejabat_id ?? null,
        }
      }
      setIsi(next)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gagal memuat')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (tahun == null) return
    void (async () => { await muat(tahun) })()
  }, [tahun, muat])

  async function bukaSaran(untuk: Jabatan) {
    if (tahun == null) return
    setPilihUntuk(untuk)
    setCari('')
    setMemuatSaran(true)
    try {
      const res = await fetch(`/api/blud/pejabat?tahun=${tahun}&sumber=pk`)
      const json = await res.json()
      if (!res.ok || !json.ok) { toast.error(json.error ?? 'Gagal memuat daftar PK'); return }
      setSaran(json.data ?? [])
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gagal memuat daftar PK')
    } finally {
      setMemuatSaran(false)
    }
  }

  function pakai(s: SaranPk) {
    if (!pilihUntuk) return
    const untuk = pilihUntuk
    setIsi(prev => ({
      ...prev,
      [untuk]: {
        nama: s.nama,
        nip: s.nip ?? '',
        pangkat: s.pangkat ?? '',
        // Untuk BENDAHARA & PPK, jabatan di PK adalah jabatan strukturalnya —
        // bukan peran perbendaharaan yang dicetak. Biarkan diisi sendiri.
        jabatan_teks: untuk === 'DIREKTUR' ? s.jabatan : (prev[untuk].jabatan_teks || ''),
        pk_pejabat_id: s.pk_pejabat_id,
      },
    }))
    setPilihUntuk(null)
  }

  function ubah(j: Jabatan, patch: Partial<Isian>) {
    // Begitu diketik tangan, jejak asal PK dilepas — supaya `disalin_at` tidak
    // mengaku salinan padahal isinya sudah bukan yang disalin.
    setIsi(prev => ({ ...prev, [j]: { ...prev[j], ...patch, pk_pejabat_id: patch.pk_pejabat_id ?? null } }))
  }

  async function simpan() {
    if (tahun == null) return
    const daftar = PERAN
      .filter(p => isi[p.key].nama.trim() !== '')
      .map(p => ({
        jabatan: p.key,
        nama: isi[p.key].nama.trim(),
        nip: isi[p.key].nip.trim() || null,
        pangkat: isi[p.key].pangkat.trim() || null,
        jabatan_teks: isi[p.key].jabatan_teks.trim() || null,
        pk_pejabat_id: isi[p.key].pk_pejabat_id,
      }))
    setSibuk(true)
    try {
      const res = await fetch('/api/blud/pejabat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tahun_anggaran: tahun, pejabat: daftar }),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) { toast.error(json.error ?? 'Gagal menyimpan'); return }
      toast.success(`Pejabat SPJ ${tahun} tersimpan.`)
      await muat(tahun)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gagal menyimpan')
    } finally {
      setSibuk(false)
    }
  }

  const saranTersaring = saran.filter(s => {
    const q = cari.trim().toLowerCase()
    return !q || s.nama.toLowerCase().includes(q) || s.jabatan.toLowerCase().includes(q) || s.unit_kerja.toLowerCase().includes(q)
  })

  return (
    <div className="pj-panel">
      <header className="pj-head">
        <span className="pj-ikon"><Users size={16} /></span>
        <div style={{ flex: 1 }}>
          <h2 className="pj-judul">Pejabat Penanda Tangan SPJ</h2>
          <p className="pj-sub">
            Diisi sekali per tahun, dipakai semua lembar SPJ. Nilainya <b>disalin</b> dari Perjanjian
            Kinerja — pergantian pejabat tahun depan tidak mengubah dokumen tahun ini.
          </p>
        </div>
        <div style={{ display: 'inline-flex' }}>
          <TahunDropdown value={tahun} items={tahunList} current={CURRENT_YEAR} onChange={setTahun} />
        </div>
      </header>

      {loading ? (
        <div className="pj-kosong">Memuat…</div>
      ) : (
        <div className="pj-isi">
          {PERAN.map(p => (
            <div key={p.key} className="pj-peran">
              <div className="pj-peran-kepala">
                <div>
                  <div className="pj-peran-label">{p.label}</div>
                  <div className="pj-peran-petunjuk">{p.petunjuk}</div>
                </div>
                {bolehUbah && (
                  <PrimaButton variant="ghost" size="sm" onClick={() => bukaSaran(p.key)}>
                    Ambil dari PK
                  </PrimaButton>
                )}
              </div>
              <div className="pj-baris">
                <label className="tk-isian" style={{ flex: 2, minWidth: 200 }}>
                  <span>Nama</span>
                  <input className="blud-imp-input" value={isi[p.key].nama} disabled={!bolehUbah}
                    onChange={e => ubah(p.key, { nama: e.target.value })} placeholder="Nama lengkap + gelar" />
                </label>
                <label className="tk-isian" style={{ flex: 1.4, minWidth: 170 }}>
                  <span>NIP</span>
                  <input className="blud-imp-input bk-num-input" value={isi[p.key].nip} disabled={!bolehUbah}
                    onChange={e => ubah(p.key, { nip: e.target.value })} placeholder="18 digit" />
                </label>
                <label className="tk-isian" style={{ flex: .8, minWidth: 90 }}>
                  <span>Pangkat</span>
                  <input className="blud-imp-input" value={isi[p.key].pangkat} disabled={!bolehUbah}
                    onChange={e => ubah(p.key, { pangkat: e.target.value })} placeholder="IV/b" />
                </label>
                <label className="tk-isian" style={{ flex: 2, minWidth: 200 }}>
                  <span>Bunyi jabatan yang dicetak</span>
                  <input className="blud-imp-input" value={isi[p.key].jabatan_teks} disabled={!bolehUbah}
                    onChange={e => ubah(p.key, { jabatan_teks: e.target.value })} placeholder={p.label} />
                </label>
              </div>
            </div>
          ))}
          {bolehUbah && (
            <div className="pj-aksi">
              <PrimaButton variant="primary" iconLeft={<Save size={13} />} onClick={simpan} disabled={sibuk}>
                Simpan Pejabat
              </PrimaButton>
            </div>
          )}
        </div>
      )}

      {pilihUntuk && (
        <div className="blud-modal-overlay" role="dialog" aria-modal="true"
          onClick={e => { if (e.target === e.currentTarget) setPilihUntuk(null) }}>
          <div className="blud-modal-card pj-modal">
            <header className="tk-modal-head" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h2 style={{ flex: 1 }}>Ambil dari Perjanjian Kinerja {tahun}</h2>
              <button className="blud-modal-close" onClick={() => setPilihUntuk(null)}><X size={16} /></button>
            </header>
            <div className="tk-modal-body">
              <div className="rl-cari">
                <Search className="w-3.5 h-3.5" />
                <input className="blud-imp-input" placeholder="Cari nama / jabatan / unit…"
                  value={cari} onChange={e => setCari(e.target.value)} autoFocus />
              </div>
              <div className="pj-daftar">
                {memuatSaran ? (
                  <div className="pj-kosong">Memuat daftar…</div>
                ) : saranTersaring.length === 0 ? (
                  <div className="pj-kosong">
                    {saran.length === 0
                      ? `Master pejabat Perjanjian Kinerja ${tahun} masih kosong. Isi dulu di menu Perjanjian Kinerja, atau ketik manual di sini.`
                      : 'Tidak ada yang cocok.'}
                  </div>
                ) : saranTersaring.map(s => (
                  <button key={s.pk_pejabat_id} className="pj-item" onClick={() => pakai(s)}>
                    <span className="pj-item-nama">{s.nama}</span>
                    <span className="pj-item-meta">{s.jabatan} · {s.unit_kerja}</span>
                    {s.nip && <span className="pj-item-nip bk-num-inline">{s.nip}</span>}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
