'use client'
// app/(dashboard)/blud/bukti-setor/bukti-setor-client.tsx — daftar bukti setor ke bank.
// Konsep: docs/CONCEPT-blud-bukti-setor.md
//
// Dipisah dari Buku Kas dengan sengaja. Buku Kas adalah catatan resmi — tiap
// barisnya fakta, dan semua lembar lain diturunkan darinya. Layar ini merakit
// dokumen yang sebagian barisnya boleh diketik lepas. Menaruh keduanya di satu
// layar berarti baris "boleh ngarang" duduk bersebelahan dengan sumber kebenaran.

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Plus, Pencil, Lock, CalendarDays, AlertTriangle } from 'lucide-react'
import PrimaButton from '@/components/ui/PrimaButton'
import DeleteButton from '@/components/ui/DeleteButton'
import { confirmDialog } from '@/components/ui/ConfirmDialog'
import TahunDropdown from '@/components/blud/TahunDropdown'
import OpsiDropdown from '@/components/blud/OpsiDropdown'
import BuktiSetorModal, { type BuktiSetorAwal, type BarisUI } from '@/components/blud/BuktiSetorModal'

const CURRENT_YEAR = new Date().getFullYear()
const NAMA_BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']

const rp = (n: number) => new Intl.NumberFormat('id-ID').format(Math.round(n))

interface BuktiSetorRow {
  id: number
  tanggal: string
  no_bukti: string | null
  ambil_tx_id: number | null
  ambil_uang: number
  version: number
  baris: BarisUI[]
  total: number
  cash: number
  n_terhubung: number
  n_ketik: number
  nilai_ketik: number
  peringatan: string[]
}

export default function BuktiSetorClient() {
  const [tahun, setTahun] = useState<number | null>(null)
  const [tahunList, setTahunList] = useState<number[]>([])
  const [bulan, setBulan] = useState(new Date().getMonth() + 1)
  const [rows, setRows] = useState<BuktiSetorRow[]>([])
  const [terkunci, setTerkunci] = useState(false)
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [edit, setEdit] = useState<BuktiSetorAwal | null>(null)

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
      const res = await fetch(`/api/blud/bukti-setor?tahun=${th}&bulan=${bl}`)
      const json = await res.json()
      if (!res.ok || !json.ok) { toast.error(json.error ?? 'Gagal memuat bukti setor'); return }
      setRows(json.data ?? [])
    } catch {
      toast.error('Tidak bisa menghubungi server')
    } finally {
      setLoading(false)
    }
  }, [])

  // Status periode ikut dari Buku Kas — bulan yang sudah ditutup tidak boleh
  // menerima slip baru, sama seperti transaksi.
  const muatPeriode = useCallback(async (th: number, bl: number) => {
    try {
      const res = await fetch(`/api/blud/realisasi/tx?tahun=${th}&bulan=${bl}`)
      const json = await res.json()
      if (res.ok && json.ok) setTerkunci(json.data?.status === 'TUTUP')
    } catch { /* pil "periode ditutup" tidak muncul — server tetap menolak */ }
  }, [])

  useEffect(() => {
    if (tahun == null) return
    void (async () => {
      setLoading(true)
      await Promise.all([muat(tahun, bulan), muatPeriode(tahun, bulan)])
    })()
  }, [tahun, bulan, muat, muatPeriode])

  function bukaUbah(r: BuktiSetorRow) {
    setEdit({
      id: r.id, version: r.version, tanggal: r.tanggal, no_bukti: r.no_bukti,
      ambil_tx_id: r.ambil_tx_id, ambil_uang: r.ambil_uang,
      baris: r.baris,
    })
    setModalOpen(true)
  }

  async function hapus(r: BuktiSetorRow) {
    const ok = await confirmDialog({
      title: 'Hapus bukti setor',
      message: `Hapus bukti setor ${r.tanggal} senilai Rp ${rp(r.total)}?\n\nBaris-barisnya ikut terhapus; transaksi di Buku Kas tidak tersentuh.`,
      variant: 'danger',
    })
    if (!ok) return
    try {
      const res = await fetch(`/api/blud/bukti-setor?id=${r.id}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok || !json.ok) { toast.error(json.error ?? 'Gagal menghapus'); return }
      toast.success('Bukti setor dihapus')
      if (tahun != null) void muat(tahun, bulan)
    } catch {
      toast.error('Tidak bisa menghubungi server')
    }
  }

  return (
    <div className="space-y-4">
      <div className="bk-panel">
        <h1 className="bk-title">Form BLUD — Bukti Setor</h1>

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

        {terkunci && (
          <span className="blud-imp-pill on-amber">
            <Lock className="w-3 h-3" style={{ display: 'inline', marginRight: 4 }} />Periode ditutup
          </span>
        )}

        <div style={{ marginLeft: 'auto' }}>
          <PrimaButton variant="purple" size="sm" iconLeft={<Plus className="w-3.5 h-3.5" />}
            disabled={terkunci || tahun == null} onClick={() => { setEdit(null); setModalOpen(true) }}>
            Bukti Setor Baru
          </PrimaButton>
        </div>
      </div>

      {loading && <div className="bk-panel bk-kosong">Memuat…</div>}

      {!loading && rows.length === 0 && (
        <div className="bk-panel bk-kosong">
          Belum ada bukti setor di {NAMA_BULAN[bulan - 1]} {tahun}.
          Lembar <b>setor BPD</b> pada berkas SPJ akan kosong sampai ada yang dicatat di sini.
        </div>
      )}

      {!loading && rows.map(r => (
        <div key={r.id} className="bk-panel bs-kartu">
          <div className="bs-kartu-kepala">
            <div>
              <div className="bs-kartu-judul">
                Bukti setor {new Date(r.tanggal).getDate()} {NAMA_BULAN[bulan - 1]} {tahun}
                {r.no_bukti && <span className="bs-kartu-no">{r.no_bukti}</span>}
              </div>
              <div className="blud-imp-muted bs-kartu-ringkas">
                {r.baris.length} baris · {r.n_terhubung} terhubung ke BKU
                {r.n_ketik > 0 && ` · ${r.n_ketik} diketik lepas senilai Rp ${rp(r.nilai_ketik)}`}
              </div>
            </div>
            <div className="bs-kartu-aksi">
              <button className="blud-act blud-act-add" disabled={terkunci}
                onClick={() => bukaUbah(r)} data-tooltip="Ubah" aria-label="Ubah">
                <Pencil />
              </button>
              <DeleteButton disabled={terkunci} onClick={() => hapus(r)} />
            </div>
          </div>

          <div className="bs-kartu-angka">
            <span className="blud-imp-muted">Ambil Uang</span>
            <span className="bk-num-inline">Rp {rp(r.ambil_uang)}</span>
            <span className="blud-imp-muted">Total</span>
            <span className="bk-num-inline">Rp {rp(r.total)}</span>
            <span className="blud-imp-muted">Cash</span>
            <span className={`bk-num-inline${r.cash < -0.005 ? ' bs-cash-timpang' : ''}`}>Rp {rp(r.cash)}</span>
          </div>

          {r.peringatan.map((p, i) => (
            <div key={i} className="bk-warn">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{p}</span>
            </div>
          ))}
        </div>
      ))}

      {modalOpen && tahun != null && (
        <BuktiSetorModal
          key={edit?.id ?? 'baru'}
          tahun={tahun}
          bulan={bulan}
          awal={edit}
          onClose={() => setModalOpen(false)}
          onSaved={() => { void muat(tahun, bulan) }}
        />
      )}
    </div>
  )
}
