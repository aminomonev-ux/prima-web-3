'use client'
// app/(dashboard)/blud/buku-kas/buku-kas-client.tsx — layar Buku Kas BLUD.
// Konsep: docs/CONCEPT-blud-realisasi.md §3 (menu), §4.2 (baki parkir), §2.7 (saldo)
//
// Ini SATU-SATUNYA layar input modul Realisasi. BKU, register, Realisasi BP,
// pengantar, SPJ, dan Tutup Kas semuanya turunan dari data yang diketik di sini.
//
// Kolom Saldo Kas/Bank dihitung server saat dibaca, bukan disimpan (§2.7):
// menyisipkan satu transaksi di tengah tidak menulis ulang ratusan baris di bawahnya.

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Plus, Pencil, Inbox, Lock, CalendarDays } from 'lucide-react'
import PrimaButton from '@/components/ui/PrimaButton'
import DeleteButton from '@/components/ui/DeleteButton'
import { confirmDialog } from '@/components/ui/ConfirmDialog'
import TahunDropdown from '@/components/blud/TahunDropdown'
import OpsiDropdown from '@/components/blud/OpsiDropdown'
import { formatTanggalId } from '@/lib/blud/tanggal'
import TransaksiModal, { type BarisPaguUI, type TransaksiAwal } from '@/components/blud/TransaksiModal'
import { LABEL_POTONGAN, type JenisPotongan } from '@/lib/blud/alokasi-rule'
import BakiRekeningPanel from '@/components/blud/BakiRekeningPanel'

const CURRENT_YEAR = new Date().getFullYear()
const NAMA_BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']

const rp = (n: number) => new Intl.NumberFormat('id-ID').format(Math.round(n))
const rpKosong = (n: number) => (n ? rp(n) : '')

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
  status: string
  version: number
  alokasi: { anggaran_key: string; nilai: number; kode_rekening: string; uraian: string }[]
  potongan: { jenis: JenisPotongan; keterangan: string | null; nilai: number }[]
  saldo_kas: number
  saldo_bank: number
}

interface BukuKasData {
  tahun_anggaran: number
  bulan: number
  status: 'BUKA' | 'TUTUP'
  saldo_awal_kas: number
  saldo_awal_bank: number
  rows: TxRow[]
}

export default function BukuKasClient() {
  const [tahun, setTahun] = useState<number | null>(null)
  const [tahunList, setTahunList] = useState<number[]>([])
  const [bulan, setBulan] = useState(new Date().getMonth() + 1)
  const [data, setData] = useState<BukuKasData | null>(null)
  const [baris, setBaris] = useState<BarisPaguUI[]>([])
  const [sumber, setSumber] = useState<{ sumber: string; versi: string | null } | null>(null)
  const [diparkir, setDiparkir] = useState(0)
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [edit, setEdit] = useState<TransaksiAwal | null>(null)
  const [bakiOpen, setBakiOpen] = useState(false)

  useEffect(() => {
    let alive = true
    ;(async () => {
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
    try {
      const res = await fetch(`/api/blud/realisasi/tx?tahun=${th}&bulan=${bl}`)
      const json = await res.json()
      if (!res.ok || !json.ok) { toast.error(json.error ?? 'Gagal memuat Buku Kas'); return }
      setData(json.data); setSumber(json.pagu_sumber); setDiparkir(json.diparkir ?? 0)
    } catch {
      toast.error('Tidak bisa menghubungi server')
    } finally {
      setLoading(false)
    }
  }, [])

  const muatPagu = useCallback(async (th: number) => {
    try {
      const res = await fetch(`/api/blud/realisasi/pagu?tahun=${th}`)
      const json = await res.json()
      if (res.ok && json.ok) setBaris(json.data ?? [])
    } catch { /* pemilih rekening kosong — pesannya sudah jelas di modal */ }
  }, [])

  useEffect(() => {
    if (tahun == null) return
    void (async () => {
      setLoading(true)
      await Promise.all([muat(tahun, bulan), muatPagu(tahun)])
    })()
  }, [tahun, bulan, muat, muatPagu])

  const terkunci = data?.status === 'TUTUP'
  const tanpaDpa = sumber?.sumber === 'KOSONG'

  function bukaBaru() {
    setEdit(null); setModalOpen(true)
  }

  function bukaUbah(r: TxRow) {
    setEdit({
      id: r.id, version: r.version, tanggal: r.tanggal, jenis: r.jenis, uraian: r.uraian,
      kas_masuk: r.kas_masuk, kas_keluar: r.kas_keluar,
      bank_masuk: r.bank_masuk, bank_keluar: r.bank_keluar,
      status: r.status,
      alokasi: r.alokasi.map(a => ({ anggaran_key: a.anggaran_key, nilai: a.nilai })),
      potongan: (r.potongan ?? []).map(p => ({ jenis: p.jenis, keterangan: p.keterangan, nilai: p.nilai })),
    })
    setModalOpen(true)
  }

  async function hapus(r: TxRow) {
    const ok = await confirmDialog({
      title: 'Hapus transaksi',
      message: `Hapus kuitansi ${r.no_kwt ?? '-'} — "${r.uraian}" senilai Rp ${rp(r.kas_keluar + r.bank_keluar || r.kas_masuk + r.bank_masuk)}?\n\nSaldo di bawahnya ikut bergeser.`,
      variant: 'danger',
    })
    if (!ok) return
    try {
      const res = await fetch(`/api/blud/realisasi/tx?id=${r.id}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok || !json.ok) { toast.error(json.error ?? 'Gagal menghapus'); return }
      toast.success('Transaksi dihapus')
      if (tahun != null) { muat(tahun, bulan); muatPagu(tahun) }
    } catch {
      toast.error('Tidak bisa menghubungi server')
    }
  }

  const totalKasKeluar = data?.rows.reduce((s, r) => s + r.kas_keluar, 0) ?? 0
  const totalBankKeluar = data?.rows.reduce((s, r) => s + r.bank_keluar, 0) ?? 0
  const totalKasMasuk = data?.rows.reduce((s, r) => s + r.kas_masuk, 0) ?? 0
  const totalBankMasuk = data?.rows.reduce((s, r) => s + r.bank_masuk, 0) ?? 0

  return (
    <div className="space-y-4">
      <div className="bk-panel">
        <h1 className="bk-title">Form BLUD — Buku Kas</h1>

        <div style={{ display: 'inline-flex' }}>
          <TahunDropdown value={tahun} items={tahunList} current={CURRENT_YEAR} onChange={setTahun} />
        </div>

        <OpsiDropdown
          value={bulan}
          items={NAMA_BULAN.map((n, i) => ({ value: i + 1, label: n }))}
          onChange={setBulan}
          icon={<CalendarDays className="w-3.5 h-3.5 versi-icon" />}
          ariaLabel="Pilih bulan"
        />

        {sumber && sumber.sumber !== 'KOSONG' && (
          <span className="blud-imp-pill on-purple">
            Pagu dari {sumber.sumber === 'PERGESERAN' ? 'Pergeseran' : 'DPA'} {formatTanggalId(sumber.versi)}
          </span>
        )}
        {terkunci && (
          <span className="blud-imp-pill on-amber"><Lock className="w-3 h-3" style={{ display: 'inline', marginRight: 4 }} />Periode ditutup</span>
        )}

        <div style={{ marginLeft: 'auto' }}>
          <PrimaButton variant="purple" size="sm" iconLeft={<Plus className="w-3.5 h-3.5" />}
            disabled={terkunci || tanpaDpa || tahun == null} onClick={bukaBaru}>
            Transaksi Baru
          </PrimaButton>
        </div>
      </div>

      {tanpaDpa && (
        <div className="bk-warn">
          Tahun {tahun} belum punya DPA, jadi belum ada baris anggaran yang bisa dibebani.
          Susun DPA lebih dulu di menu <a href="/blud/dpa" className="blud-imp-link">DPA BLUD</a>.
        </div>
      )}

      {diparkir > 0 && (
        <div className="bk-parkir-banner">
          <Inbox className="w-4 h-4 shrink-0" />
          <span>
            <b>{diparkir} transaksi diparkir</b> — uangnya sudah keluar tapi rekeningnya belum ada di DPA.
            Tambahkan rekeningnya lewat menu Pergeseran, lalu sambungkan transaksinya.
            Selama masih ada yang terparkir, <b>Tutup Kas tidak bisa dijalankan</b>.
          </span>
          <PrimaButton variant="warning" size="sm" onClick={() => setBakiOpen(true)}>
            Buka Baki
          </PrimaButton>
        </div>
      )}

      {data && (
        <div className="bk-panel bk-saldo">
          <span className="blud-imp-muted">Saldo awal {NAMA_BULAN[bulan - 1]}</span>
          <span className="blud-imp-text">Kas <b className="bk-num-inline">Rp {rp(data.saldo_awal_kas)}</b></span>
          <span className="blud-imp-text">Bank <b className="bk-num-inline">Rp {rp(data.saldo_awal_bank)}</b></span>
          <span className="blud-imp-muted" style={{ marginLeft: 'auto' }}>{data.rows.length} transaksi</span>
        </div>
      )}

      <div className="blud-scroll-wrapper">
        <table className="dpa-table bk-table">
          <thead>
            <tr>
              <th style={{ width: 40 }}>No</th>
              <th style={{ width: 92 }}>Tanggal</th>
              <th style={{ width: 56 }}>Kwt</th>
              <th>Uraian</th>
              <th style={{ width: 210 }}>Rekening</th>
              <th style={{ width: 110 }}>Kas Masuk</th>
              <th style={{ width: 110 }}>Kas Keluar</th>
              <th style={{ width: 120 }}>Saldo Kas</th>
              <th style={{ width: 110 }}>Bank Masuk</th>
              <th style={{ width: 110 }}>Bank Keluar</th>
              <th style={{ width: 120 }}>Saldo Bank</th>
              <th style={{ width: 70 }}>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={12} className="bk-kosong">Memuat…</td></tr>
            )}
            {!loading && !data?.rows.length && (
              <tr><td colSpan={12} className="bk-kosong">
                Belum ada transaksi di {NAMA_BULAN[bulan - 1]} {tahun}.
              </td></tr>
            )}
            {!loading && data?.rows.map((r, i) => (
              <tr key={r.id} className={r.status === 'BELUM_BERREKENING' ? 'bk-row-parkir' : undefined}>
                <td className="bk-c">{i + 1}</td>
                <td className="bk-c bk-num-inline">{r.tanggal.slice(8, 10)}/{r.tanggal.slice(5, 7)}</td>
                <td className="bk-c bk-num-inline">{r.no_kwt ?? '—'}</td>
                <td>
                  {r.uraian}
                  {r.status === 'BELUM_BERREKENING' && <span className="bk-tag-parkir">diparkir</span>}
                  {(r.potongan ?? []).map((p, j) => (
                    <span key={j} className="bk-tag-potongan">
                      {LABEL_POTONGAN[p.jenis]} {rp(p.nilai)}
                    </span>
                  ))}
                </td>
                <td className="bk-rek">
                  {r.alokasi.length === 0 && <span className="blud-imp-muted">—</span>}
                  {r.alokasi.map((a, j) => (
                    <div key={j} className="bk-rek-item">
                      <span className="bk-kode">{a.kode_rekening || '—'}</span>
                      {r.alokasi.length > 1 && <span className="bk-rek-nilai">Rp {rp(a.nilai)}</span>}
                    </div>
                  ))}
                </td>
                <td className="bk-r bk-num-inline">{rpKosong(r.kas_masuk)}</td>
                <td className="bk-r bk-num-inline">{rpKosong(r.kas_keluar)}</td>
                <td className="bk-r bk-num-inline bk-saldo-sel">{rp(r.saldo_kas)}</td>
                <td className="bk-r bk-num-inline">{rpKosong(r.bank_masuk)}</td>
                <td className="bk-r bk-num-inline">{rpKosong(r.bank_keluar)}</td>
                <td className="bk-r bk-num-inline bk-saldo-sel">{rp(r.saldo_bank)}</td>
                <td className="bk-c">
                  <div className="bk-aksi">
                    <button className="blud-act blud-act-add" disabled={terkunci}
                      onClick={() => bukaUbah(r)} data-tooltip="Ubah" aria-label="Ubah">
                      <Pencil />
                    </button>
                    <DeleteButton disabled={terkunci} onClick={() => hapus(r)} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
          {!loading && !!data?.rows.length && (
            <tfoot>
              <tr className="bk-total">
                <td colSpan={5} className="bk-r">JUMLAH BULAN INI</td>
                <td className="bk-r bk-num-inline">{rpKosong(totalKasMasuk)}</td>
                <td className="bk-r bk-num-inline">{rpKosong(totalKasKeluar)}</td>
                <td className="bk-r bk-num-inline">{rp(data.rows[data.rows.length - 1].saldo_kas)}</td>
                <td className="bk-r bk-num-inline">{rpKosong(totalBankMasuk)}</td>
                <td className="bk-r bk-num-inline">{rpKosong(totalBankKeluar)}</td>
                <td className="bk-r bk-num-inline">{rp(data.rows[data.rows.length - 1].saldo_bank)}</td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {tahun != null && bakiOpen && (
        <BakiRekeningPanel
          tahun={tahun}
          onClose={() => setBakiOpen(false)}
          onSambungkan={(awal) => { setBakiOpen(false); setEdit(awal); setModalOpen(true) }}
        />
      )}

      {tahun != null && modalOpen && (
        <TransaksiModal
          key={edit ? `ubah-${edit.id}-${edit.version}` : 'baru'}
          tahun={tahun}
          // Dari baki bisa datang transaksi bulan lain — ikutkan bulan aslinya
          // supaya judul modal tidak menyebut bulan yang sedang dilihat.
          bulan={edit ? Number(edit.tanggal.slice(5, 7)) || bulan : bulan}
          baris={baris}
          awal={edit}
          onClose={() => setModalOpen(false)}
          onSaved={() => { toast.success('Transaksi tersimpan'); muat(tahun, bulan); muatPagu(tahun) }}
        />
      )}
    </div>
  )
}
