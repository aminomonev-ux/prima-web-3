'use client'
// app/(dashboard)/blud/tutup-kas/tutup-kas-client.tsx — Berita Acara Pemeriksaan Kas.
// Konsep: docs/CONCEPT-blud-realisasi.md §4.5, §4.7
//
// Dua sisi yang wajib bertemu. Sisi kiri DIHITUNG dari transaksi Buku Kas dan
// tidak punya satu pun kotak isian — kalau angkanya dirasa salah, yang diperbaiki
// transaksinya, bukan angkanya di sini. Sisi kanan cuma dua angka hasil
// pemeriksaan nyata: uang tunai yang dihitung + saldo rekening koran.
//
// Sengaja TIDAK ada kotak "penyesuaian": itu persis cara berkas Juni 2026 bisa
// ditutup dengan selisih Rp 5,5 miliar tanpa ada yang menyadarinya.

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Lock, LockOpen, Check, TriangleAlert, Save, Download, Plus } from 'lucide-react'
import PrimaButton from '@/components/ui/PrimaButton'
import DeleteButton from '@/components/ui/DeleteButton'
import TahunDropdown from '@/components/blud/TahunDropdown'

const CURRENT_YEAR = new Date().getFullYear()
const NAMA_BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']

const rp = (n: number) => new Intl.NumberFormat('id-ID').format(Math.round(n))
const bacaAngka = (s: string) => Number(s.replace(/[^\d]/g, '')) || 0

interface Neraca {
  tahun_anggaran: number
  bulan: number
  status: 'BUKA' | 'TUTUP'
  saldo_awal_kas: number
  saldo_awal_bank: number
  masuk_kas: number
  masuk_bank: number
  keluar_kas: number
  keluar_bank: number
  saldo_buku: number
  kas_fisik: number | null
  bank_koran: number | null
  saldo_nyata: number | null
  selisih: number | null
  seimbang: boolean
  no_surat: string | null
  tgl_surat: string | null
  ditutup_oleh: string | null
  ditutup_at: string | null
  penghalang: string[]
  jumlah_baki: number
}

interface GuBaris { tgl_awal: string; tgl_akhir: string; no_surat: string }

export default function TutupKasClient({ superAdmin }: { superAdmin: boolean }) {
  const [tahun, setTahun] = useState<number | null>(null)
  const [tahunList, setTahunList] = useState<number[]>([])
  const [bulan, setBulan] = useState(new Date().getMonth() + 1)
  const [data, setData] = useState<Neraca | null>(null)
  const [loading, setLoading] = useState(true)
  const [sibuk, setSibuk] = useState(false)

  // Sisi B diketik lokal supaya selisihnya berubah saat mengetik, tanpa menunggu
  // server — tapi yang menentukan boleh-tidaknya menutup tetap hitungan server.
  const [kasFisik, setKasFisik] = useState('')
  const [bankKoran, setBankKoran] = useState('')
  const [noSurat, setNoSurat] = useState('')
  const [tglSurat, setTglSurat] = useState('')

  const [bukaModal, setBukaModal] = useState(false)
  const [alasanBuka, setAlasanBuka] = useState('')

  // Rentang pengajuan GU bulan ini — satu bulan boleh beberapa kali (§3.2).
  const [gu, setGu] = useState<GuBaris[]>([])
  const [guSibuk, setGuSibuk] = useState(false)

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

  const muat = useCallback(async (th: number, bl: number) => {
    setLoading(true)
    try {
      const [res, resGu] = await Promise.all([
        fetch(`/api/blud/realisasi/periode?tahun=${th}&bulan=${bl}`),
        fetch(`/api/blud/realisasi/gu?tahun=${th}&bulan=${bl}`),
      ])
      const json = await res.json()
      if (!res.ok || !json.ok) { toast.error(json.error ?? 'Gagal memuat Tutup Kas'); return }
      const d: Neraca = json.data
      setData(d)
      setKasFisik(d.kas_fisik != null ? rp(d.kas_fisik) : '')
      setBankKoran(d.bank_koran != null ? rp(d.bank_koran) : '')
      setNoSurat(d.no_surat ?? '')
      setTglSurat(d.tgl_surat ?? '')
      const jsonGu = await resGu.json()
      if (resGu.ok && jsonGu.ok) {
        setGu((jsonGu.data ?? []).map((g: { tgl_awal: string; tgl_akhir: string; no_surat: string | null }) => ({
          tgl_awal: g.tgl_awal, tgl_akhir: g.tgl_akhir, no_surat: g.no_surat ?? '',
        })))
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gagal memuat')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (tahun == null) return
    void (async () => { await muat(tahun, bulan) })()
  }, [tahun, bulan, muat])

  const terkunci = data?.status === 'TUTUP'
  const nyata = bacaAngka(kasFisik) + bacaAngka(bankKoran)
  const terisi = kasFisik.trim() !== '' && bankKoran.trim() !== ''
  const selisih = data && terisi ? nyata - data.saldo_buku : null
  const seimbang = selisih != null && Math.abs(selisih) < 0.005
  const adaPenghalang = (data?.penghalang.length ?? 0) > 0

  async function kirim(tutup: boolean) {
    if (!data || tahun == null) return
    setSibuk(true)
    try {
      const res = await fetch('/api/blud/realisasi/periode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tahun_anggaran: tahun, bulan,
          kas_fisik: bacaAngka(kasFisik), bank_koran: bacaAngka(bankKoran),
          no_surat: noSurat.trim() || null, tgl_surat: tglSurat || null,
          tutup,
        }),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) {
        if (json.code === 'TERHALANG' && Array.isArray(json.detail)) {
          toast.error(json.detail.join(' '))
        } else if (json.code === 'TIDAK_SEIMBANG') {
          toast.error(`Selisih Rp ${rp(Math.abs(json.detail?.selisih ?? 0))} — bulan tidak ditutup.`)
        } else {
          toast.error(json.error ?? 'Gagal menyimpan')
        }
        await muat(tahun, bulan)
        return
      }
      setData(json.data)
      toast.success(tutup ? `${NAMA_BULAN[bulan - 1]} ${tahun} ditutup.` : 'Hasil pemeriksaan tersimpan.')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gagal menyimpan')
    } finally {
      setSibuk(false)
    }
  }

  const awalBulan = tahun != null ? `${tahun}-${String(bulan).padStart(2, '0')}-01` : ''
  const akhirBulan = tahun != null
    ? `${tahun}-${String(bulan).padStart(2, '0')}-${String(new Date(tahun, bulan, 0).getDate()).padStart(2, '0')}`
    : ''

  async function simpanGu() {
    if (tahun == null) return
    setGuSibuk(true)
    try {
      const res = await fetch('/api/blud/realisasi/gu', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tahun_anggaran: tahun, bulan,
          periode: gu.map(g => ({ tgl_awal: g.tgl_awal, tgl_akhir: g.tgl_akhir, no_surat: g.no_surat.trim() || null })),
        }),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) { toast.error(json.error ?? 'Gagal menyimpan periode GU'); return }
      setGu((json.data ?? []).map((g: { tgl_awal: string; tgl_akhir: string; no_surat: string | null }) => ({
        tgl_awal: g.tgl_awal, tgl_akhir: g.tgl_akhir, no_surat: g.no_surat ?? '',
      })))
      toast.success('Periode GU tersimpan.')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gagal menyimpan periode GU')
    } finally {
      setGuSibuk(false)
    }
  }

  async function bukaKembali() {
    if (tahun == null || alasanBuka.trim().length < 10) return
    setSibuk(true)
    try {
      const q = `tahun=${tahun}&bulan=${bulan}&alasan=${encodeURIComponent(alasanBuka.trim())}`
      const res = await fetch(`/api/blud/realisasi/periode?${q}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok || !json.ok) { toast.error(json.error ?? 'Gagal membuka periode'); return }
      setData(json.data)
      setBukaModal(false)
      setAlasanBuka('')
      toast.success(`${NAMA_BULAN[bulan - 1]} ${tahun} dibuka kembali.`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gagal membuka periode')
    } finally {
      setSibuk(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="bk-panel">
        <h1 className="bk-title">Form BLUD — Tutup Kas</h1>

        <div style={{ display: 'inline-flex' }}>
          <TahunDropdown value={tahun} items={tahunList} current={CURRENT_YEAR} onChange={setTahun} />
        </div>

        <select className="blud-imp-input bk-bulan" value={bulan} onChange={e => setBulan(Number(e.target.value))}>
          {NAMA_BULAN.map((n, i) => <option key={i} value={i + 1}>{n}</option>)}
        </select>

        {data && (
          <span className={`blud-imp-pill ${terkunci ? 'on-amber' : 'on-purple'}`}>
            {terkunci ? <><Lock size={11} /> Ditutup</> : <><LockOpen size={11} /> Terbuka</>}
          </span>
        )}

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <PrimaButton variant="success" size="sm" iconLeft={<Download size={13} />}
            disabled={tahun == null}
            onClick={() => { window.location.href = `/api/blud/realisasi/export?tahun=${tahun}&bulan=${bulan}` }}>
            Unduh SPJ Bulanan
          </PrimaButton>
          {terkunci && superAdmin && (
            <PrimaButton variant="warning" size="sm" onClick={() => setBukaModal(true)}>
              Buka Kembali
            </PrimaButton>
          )}
        </div>
      </div>

      {terkunci && data && (
        <div className="tk-tutup-banner">
          <Lock size={14} />
          <span>
            Bulan ini sudah ditutup{data.ditutup_oleh ? ` oleh ${data.ditutup_oleh}` : ''}. Semua penulisan
            transaksi ke {NAMA_BULAN[bulan - 1]} {tahun} ditolak server.
            {!superAdmin && ' Minta SUPER_ADMIN kalau perlu dibuka kembali.'}
          </span>
        </div>
      )}

      {adaPenghalang && !terkunci && (
        <div className="bk-warn">
          <b>Belum bisa ditutup:</b>
          <ul className="tk-halang">
            {data!.penghalang.map((p, i) => <li key={i}>{p}</li>)}
          </ul>
        </div>
      )}

      {loading || !data ? (
        <div className="bk-warn">Memuat…</div>
      ) : (
        <>
          <div className="tk-grid">
            {/* ── SISI A — dihitung, tanpa kotak isian ─────────────────────── */}
            <section className="tk-card">
              <header className="tk-card-head">
                <span className="tk-card-judul">Menurut buku</span>
                <span className="tk-card-sub">dihitung dari transaksi — tidak bisa diketik</span>
              </header>
              <Baris label="Saldo awal kas tunai" nilai={data.saldo_awal_kas} />
              <Baris label="Saldo awal bank" nilai={data.saldo_awal_bank} />
              <Baris label="Penerimaan bulan ini" nilai={data.masuk_kas + data.masuk_bank} tanda="+" />
              <Baris label="Pengeluaran bulan ini" nilai={data.keluar_kas + data.keluar_bank} tanda="−" />
              <div className="tk-total">
                <span>Saldo akhir menurut buku</span>
                <span className={`bk-num-inline ${data.saldo_buku < 0 ? 'rl-neg' : ''}`}>Rp {rp(data.saldo_buku)}</span>
              </div>
            </section>

            {/* ── SISI B — dua angka hasil pemeriksaan nyata ────────────────── */}
            <section className="tk-card">
              <header className="tk-card-head">
                <span className="tk-card-judul">Menurut kenyataan</span>
                <span className="tk-card-sub">hasil hitung uang &amp; rekening koran</span>
              </header>
              <label className="tk-isian">
                <span>Uang tunai di brankas</span>
                <input className="blud-imp-input bk-num-input" inputMode="numeric" disabled={terkunci}
                  value={kasFisik} placeholder="0"
                  onChange={e => setKasFisik(e.target.value === '' ? '' : rp(bacaAngka(e.target.value)))} />
              </label>
              <label className="tk-isian">
                <span>Saldo rekening koran</span>
                <input className="blud-imp-input bk-num-input" inputMode="numeric" disabled={terkunci}
                  value={bankKoran} placeholder="0"
                  onChange={e => setBankKoran(e.target.value === '' ? '' : rp(bacaAngka(e.target.value)))} />
              </label>
              <div className="tk-total">
                <span>Saldo akhir menurut kenyataan</span>
                <span className="bk-num-inline">{terisi ? `Rp ${rp(nyata)}` : '—'}</span>
              </div>
            </section>
          </div>

          {/* Selisih — satu-satunya angka yang menentukan boleh atau tidaknya menutup */}
          <div className={`tk-selisih ${!terisi ? 'netral' : seimbang ? 'seimbang' : 'jomplang'}`}>
            {!terisi ? (
              <span>Isi dua angka di sisi kanan untuk melihat selisih.</span>
            ) : seimbang ? (
              <><Check size={20} /><span>Seimbang — selisih <b>Rp 0</b>. Bulan boleh ditutup.</span></>
            ) : (
              <>
                <TriangleAlert size={20} />
                <span>
                  Selisih <b>Rp {rp(Math.abs(selisih!))}</b> {selisih! > 0 ? '(uang nyata lebih banyak dari buku)' : '(uang nyata lebih sedikit dari buku)'}.
                  Perbaiki dengan mencatat transaksi yang belum masuk di <a href="/blud/buku-kas" className="blud-imp-link">Buku Kas</a> —
                  angka di layar ini tidak boleh ditambal.
                </span>
              </>
            )}
          </div>

          <div className="tk-surat">
            <label className="tk-isian">
              <span>Nomor surat</span>
              <input className="blud-imp-input" disabled={terkunci} value={noSurat}
                placeholder="mis. 900/BA-001/2026" onChange={e => setNoSurat(e.target.value)} />
            </label>
            <label className="tk-isian">
              <span>Tanggal surat</span>
              <input className="blud-imp-input" type="date" disabled={terkunci} value={tglSurat}
                onChange={e => setTglSurat(e.target.value)} />
            </label>
            {!terkunci && (
              <div className="tk-aksi">
                <PrimaButton variant="ghost" iconLeft={<Save size={13} />} disabled={sibuk || !terisi}
                  onClick={() => kirim(false)}>
                  Simpan Pemeriksaan
                </PrimaButton>
                <PrimaButton variant="success" iconLeft={<Lock size={13} />}
                  disabled={sibuk || !seimbang || adaPenghalang}
                  data-tooltip={
                    adaPenghalang ? 'Masih ada yang harus dibereskan'
                      : !seimbang ? 'Selisih harus Rp 0'
                        : `Tutup ${NAMA_BULAN[bulan - 1]} ${tahun}`
                  }
                  onClick={() => kirim(true)}>
                  Tutup Bulan
                </PrimaButton>
              </div>
            )}
          </div>

          {/* Periode GU — satu bulan boleh beberapa pengajuan (§3.2). Rentangnya
              tidak bisa diterka dari transaksi, jadi dicatat di sini; tiap baris
              jadi satu lembar `GU <awal>-<akhir>` di berkas SPJ. */}
          <section className="tk-card">
            <header className="tk-card-head">
              <span className="tk-card-judul">Pengajuan GU bulan ini</span>
              <span className="tk-card-sub">
                Ganti Uang Persediaan — tiap rentang jadi satu lembar tersendiri di berkas SPJ.
                Kosongkan kalau bulan ini hanya sekali pengajuan untuk sebulan penuh.
              </span>
            </header>

            {gu.length === 0 ? (
              <div className="tk-gu-kosong">
                Belum ada rentang dicatat — berkas SPJ akan berisi satu lembar GU untuk sebulan penuh.
              </div>
            ) : gu.map((g, i) => (
              <div key={i} className="tk-gu-baris">
                <span className="tk-gu-nomor">GU {i + 1}</span>
                <label className="tk-isian">
                  <span>Dari</span>
                  <input className="blud-imp-input" type="date" value={g.tgl_awal}
                    min={awalBulan} max={akhirBulan} disabled={terkunci}
                    onChange={e => setGu(p => p.map((x, j) => j === i ? { ...x, tgl_awal: e.target.value } : x))} />
                </label>
                <label className="tk-isian">
                  <span>Sampai</span>
                  <input className="blud-imp-input" type="date" value={g.tgl_akhir}
                    min={awalBulan} max={akhirBulan} disabled={terkunci}
                    onChange={e => setGu(p => p.map((x, j) => j === i ? { ...x, tgl_akhir: e.target.value } : x))} />
                </label>
                <label className="tk-isian" style={{ flex: 1, minWidth: 160 }}>
                  <span>Nomor pengajuan</span>
                  <input className="blud-imp-input" value={g.no_surat} disabled={terkunci}
                    placeholder="opsional"
                    onChange={e => setGu(p => p.map((x, j) => j === i ? { ...x, no_surat: e.target.value } : x))} />
                </label>
                {!terkunci && (
                  <DeleteButton onClick={() => setGu(p => p.filter((_, j) => j !== i))}
                    data-tooltip="Hapus rentang ini" />
                )}
              </div>
            ))}

            {!terkunci && (
              <div className="tk-aksi" style={{ marginTop: 4 }}>
                <PrimaButton variant="purple" size="sm" iconLeft={<Plus size={13} />}
                  onClick={() => setGu(p => [...p, { tgl_awal: awalBulan, tgl_akhir: akhirBulan, no_surat: '' }])}>
                  Tambah Rentang
                </PrimaButton>
                <PrimaButton variant="primary" size="sm" iconLeft={<Save size={13} />}
                  onClick={simpanGu} disabled={guSibuk}>
                  Simpan Periode GU
                </PrimaButton>
              </div>
            )}
          </section>
        </>
      )}

      {bukaModal && (
        <div className="blud-modal-overlay" role="dialog" aria-modal="true"
          onClick={e => { if (e.target === e.currentTarget && !sibuk) setBukaModal(false) }}>
          <div className="blud-modal-card tk-modal">
            <header className="tk-modal-head">
              <h2>Buka kembali {NAMA_BULAN[bulan - 1]} {tahun}?</h2>
            </header>
            <div className="tk-modal-body">
              <p className="tk-modal-teks">
                Bulan ini sudah ditutup dan berita acaranya bisa jadi sudah ditandatangani.
                Membukanya kembali memungkinkan angka resmi berubah — alasannya dicatat di audit log
                atas nama Anda.
              </p>
              <label className="tk-isian">
                <span>Alasan (minimal 10 karakter)</span>
                <textarea className="blud-imp-input" rows={3} value={alasanBuka}
                  onChange={e => setAlasanBuka(e.target.value)}
                  placeholder="mis. koreksi kuitansi listrik tertinggal atas permintaan Kabag Keuangan" />
              </label>
            </div>
            <footer className="tk-modal-foot">
              <PrimaButton variant="ghost" onClick={() => setBukaModal(false)} disabled={sibuk}>Batal</PrimaButton>
              <PrimaButton variant="warning" onClick={bukaKembali}
                disabled={sibuk || alasanBuka.trim().length < 10}>
                Buka Kembali
              </PrimaButton>
            </footer>
          </div>
        </div>
      )}
    </div>
  )
}

function Baris({ label, nilai, tanda }: { label: string; nilai: number; tanda?: '+' | '−' }) {
  return (
    <div className="tk-baris">
      <span>{tanda ? `${tanda} ` : ''}{label}</span>
      <span className={`bk-num-inline ${nilai < 0 ? 'rl-neg' : ''}`}>Rp {rp(nilai)}</span>
    </div>
  )
}
