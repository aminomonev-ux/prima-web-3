'use client'
// app/(dashboard)/blud/realisasi/realisasi-client.tsx — layar Realisasi BLUD.
// Konsep: docs/CONCEPT-blud-realisasi.md §3 (menu), §4.3, §4.4, §3.1 (register)
//
// Layar PANTAU — tidak ada satu pun kotak isian di sini. Semua angkanya turunan
// dari transaksi Buku Kas; kalau ada yang salah, yang diperbaiki transaksinya.
//
// Serapan digulung ke induk di server, jadi total baris teratas = total Buku Kas
// bulan itu. Itu juga cara paling cepat menyadari ada transaksi yang nyangkut:
// dua angka itu berbeda.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { ChevronRight, ChevronDown, Search, TriangleAlert, ArrowUp, ArrowDown, Plus, CalendarDays, Calculator } from 'lucide-react'
import PrimaButton from '@/components/ui/PrimaButton'
import TahunDropdown from '@/components/blud/TahunDropdown'
import OpsiDropdown from '@/components/blud/OpsiDropdown'
import { formatTanggalId } from '@/lib/blud/tanggal'
import RegisterPanel from '@/components/blud/RegisterPanel'
import TautanMenu from '@/components/blud/TautanMenu'
import PratinjauSerapanModal from '@/components/blud/PratinjauSerapanModal'

const CURRENT_YEAR = new Date().getFullYear()
const NAMA_BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']

const rp = (n: number) => new Intl.NumberFormat('id-ID').format(Math.round(n))
const rpKosong = (n: number) => (n ? rp(n) : '')

export interface BarisRealisasi {
  anggaran_key: string
  kode_rekening: string
  uraian: string
  parent_key: string | null
  pagu: number
  is_leaf: boolean
  terserap: number
  bulan_ini: number | null
  bulan_lalu: number | null
  sd_bulan: number | null
  sisa: number
  persen: number
}

interface Cap { sumber: string; versi: string | null; baris: number; sidik: number }

interface Perubahan {
  naik: { kode: string; uraian: string; lama: number; baru: number }[]
  turun: { kode: string; uraian: string; lama: number; baru: number }[]
  baru: { kode: string; uraian: string; baru: number }[]
  hilang: { kode: string; uraian: string; lama: number }[]
  versi: string | null
}

const capSama = (a: Cap | null, b: Cap | null) =>
  !!a && !!b && a.versi === b.versi && a.baris === b.baris && a.sidik === b.sidik

export default function RealisasiClient({ bolehDpa, bolehPergeseran }: {
  bolehDpa: boolean; bolehPergeseran: boolean
}) {
  const [tahun, setTahun] = useState<number | null>(null)
  const [tahunList, setTahunList] = useState<number[]>([])
  const [bulan, setBulan] = useState(new Date().getMonth() + 1)
  const [rows, setRows] = useState<BarisRealisasi[]>([])
  const [sumber, setSumber] = useState<{ sumber: string; versi: string | null } | null>(null)
  const [loading, setLoading] = useState(true)
  const [cari, setCari] = useState('')
  const [tutup, setTutup] = useState<Set<string>>(new Set())
  const [fokus, setFokus] = useState<BarisRealisasi | null>(null)
  const [perubahan, setPerubahan] = useState<Perubahan | null>(null)
  const [lihatPerubahan, setLihatPerubahan] = useState(false)
  const [pratinjauBuka, setPratinjauBuka] = useState(false)

  // Foto pagu terakhir yang dilihat pengguna — pembanding untuk chip ▲▼ (§4.4 lapis 1).
  const paguLama = useRef<Map<string, { pagu: number; kode: string; uraian: string }> | null>(null)
  const cap = useRef<Cap | null>(null)

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

  const muat = useCallback(async (th: number, bl: number, bandingkan: boolean) => {
    try {
      const res = await fetch(`/api/blud/realisasi/pagu?tahun=${th}&bulan=${bl}`)
      const json = await res.json()
      if (!res.ok || !json.ok) { toast.error(json.error ?? 'Data realisasi tidak bisa dimuat. Coba lagi sebentar lagi.'); return }
      const data: BarisRealisasi[] = json.data ?? []
      const baruMap = new Map(data.map(b => [b.anggaran_key, { pagu: b.pagu, kode: b.kode_rekening, uraian: b.uraian }]))

      if (bandingkan && paguLama.current) {
        const lama = paguLama.current
        const d: Perubahan = { naik: [], turun: [], baru: [], hilang: [], versi: json.pagu_sumber?.versi ?? null }
        for (const [k, v] of baruMap) {
          const l = lama.get(k)
          if (!l) d.baru.push({ kode: v.kode, uraian: v.uraian, baru: v.pagu })
          else if (v.pagu > l.pagu) d.naik.push({ kode: v.kode, uraian: v.uraian, lama: l.pagu, baru: v.pagu })
          else if (v.pagu < l.pagu) d.turun.push({ kode: v.kode, uraian: v.uraian, lama: l.pagu, baru: v.pagu })
        }
        for (const [k, l] of lama) {
          if (!baruMap.has(k)) d.hilang.push({ kode: l.kode, uraian: l.uraian, lama: l.pagu })
        }
        const jml = d.naik.length + d.turun.length + d.baru.length + d.hilang.length
        if (jml > 0) {
          setPerubahan(d)
          toast.info(`Pagu diperbarui — ${jml} baris berubah`)
        }
      } else {
        paguLama.current = baruMap
        setPerubahan(null)
      }

      setRows(data)
      setSumber(json.pagu_sumber ?? null)
    } catch {
      toast.error('Server tidak bisa dihubungi. Periksa sambungan, lalu coba lagi.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (tahun == null) return
    void (async () => {
      setLoading(true)
      paguLama.current = null
      cap.current = null
      await muat(tahun, bulan, false)
      try {
        const res = await fetch(`/api/blud/realisasi/pagu?tahun=${tahun}&mode=cap`)
        const json = await res.json()
        if (res.ok && json.ok) cap.current = json.cap
      } catch { /* penanda perubahan mati sesaat, angkanya tetap benar */ }
    })()
  }, [tahun, bulan, muat])

  // §4.4 lapis 3: satu query ringan tiap 30 detik, bukan WebSocket — cukup untuk
  // menyadari pergeseran yang disimpan orang lain sementara layar ini terbuka.
  useEffect(() => {
    if (tahun == null) return
    const timer = setInterval(() => {
      void (async () => {
        try {
          const res = await fetch(`/api/blud/realisasi/pagu?tahun=${tahun}&mode=cap`)
          const json = await res.json()
          if (!res.ok || !json.ok) return
          if (cap.current && !capSama(cap.current, json.cap)) {
            cap.current = json.cap
            await muat(tahun, bulan, true)
          } else if (!cap.current) {
            cap.current = json.cap
          }
        } catch { /* jaringan putus sesaat — dicoba lagi 30 detik berikutnya */ }
      })()
    }, 30_000)
    return () => clearInterval(timer)
  }, [tahun, bulan, muat])

  const kedalaman = useMemo(() => {
    const induk = new Map(rows.map(r => [r.anggaran_key, r.parent_key]))
    const memo = new Map<string, number>()
    const hitung = (k: string): number => {
      const ada = memo.get(k)
      if (ada != null) return ada
      memo.set(k, 0) // jaga-jaga siklus: jangan sampai rekursi tak berujung
      const p = induk.get(k) ?? null
      const d = p ? hitung(p) + 1 : 0
      memo.set(k, d)
      return d
    }
    for (const r of rows) hitung(r.anggaran_key)
    return memo
  }, [rows])

  const punyaAnak = useMemo(() => {
    const s = new Set<string>()
    for (const r of rows) if (r.parent_key) s.add(r.parent_key)
    return s
  }, [rows])

  const tampil = useMemo(() => {
    const q = cari.trim().toLowerCase()
    if (q) {
      const induk = new Map(rows.map(r => [r.anggaran_key, r.parent_key]))
      const perlu = new Set<string>()
      for (const r of rows) {
        if (!`${r.kode_rekening} ${r.uraian}`.toLowerCase().includes(q)) continue
        perlu.add(r.anggaran_key)
        let p = induk.get(r.anggaran_key) ?? null
        while (p && !perlu.has(p)) { perlu.add(p); p = induk.get(p) ?? null }
      }
      return rows.filter(r => perlu.has(r.anggaran_key))
    }
    if (!tutup.size) return rows
    const induk = new Map(rows.map(r => [r.anggaran_key, r.parent_key]))
    return rows.filter(r => {
      let p = induk.get(r.anggaran_key) ?? null
      while (p) {
        if (tutup.has(p)) return false
        p = induk.get(p) ?? null
      }
      return true
    })
  }, [rows, cari, tutup])

  const akar = useMemo(() => rows.filter(r => !r.parent_key), [rows])
  const total = useMemo(() => ({
    pagu: akar.reduce((s, r) => s + r.pagu, 0),
    ini: akar.reduce((s, r) => s + (r.bulan_ini ?? 0), 0),
    lalu: akar.reduce((s, r) => s + (r.bulan_lalu ?? 0), 0),
    sd: akar.reduce((s, r) => s + (r.sd_bulan ?? 0), 0),
    terserap: akar.reduce((s, r) => s + r.terserap, 0),
  }), [akar])

  const setelahBulanIni = total.terserap - total.sd
  const tanpaDpa = sumber?.sumber === 'KOSONG'
  // Lebih pagu dinilai dari serapan SETAHUN: baris yang jebol di Agustus tetap
  // harus terlihat merah saat pengguna menengok laporan Juni.
  const lebihPagu = (r: BarisRealisasi) => r.pagu - r.terserap < -0.005
  const minus = rows.filter(lebihPagu)

  function toggle(key: string) {
    setTutup(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
  }

  // Pembanding memakai kode rekening, bukan anggaran_key: baris yang dihapus lalu
  // dibuat ulang saat pergeseran punya key baru, tapi bagi pengguna ia rekening
  // yang sama — dan itu justru perubahan yang paling perlu terlihat.
  const chip = useCallback((kode: string): { arah: 'naik' | 'turun' | 'baru'; teks: string } | null => {
    if (!perubahan || !kode) return null
    const versi = perubahan.versi ?? 'pergeseran terbaru'
    const n = perubahan.naik.find(x => x.kode === kode)
    if (n) return { arah: 'naik', teks: `dari Rp ${rp(n.lama)} · ${versi}` }
    const t = perubahan.turun.find(x => x.kode === kode)
    if (t) return { arah: 'turun', teks: `dari Rp ${rp(t.lama)} · ${versi}` }
    if (perubahan.baru.some(x => x.kode === kode)) return { arah: 'baru', teks: `Rekening baru · ${versi}` }
    return null
  }, [perubahan])

  return (
    <div className="space-y-4">
      <div className="bk-panel">
        <h1 className="bk-title">Form BLUD — Realisasi</h1>

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

        <div className="rl-cari">
          <Search className="w-3.5 h-3.5" />
          <input className="blud-imp-input" placeholder="Cari kode / uraian…"
            value={cari} onChange={e => setCari(e.target.value)} />
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          {/* Tahap 2 — murni pembacaan, barisnya dipinjam dari state ini. Tanpa
              pagu tidak ada yang bisa dibandingkan, jadi tombolnya ikut mati. */}
          <PrimaButton variant="ghost" size="sm" iconLeft={<Calculator className="w-3.5 h-3.5" />}
            disabled={tanpaDpa || rows.length === 0}
            data-tooltip="Coba angka belanja yang belum dimasukkan — lihat rekening mana yang plafonnya kurang"
            onClick={() => setPratinjauBuka(true)}>
            Pratinjau Serapan
          </PrimaButton>
          <PrimaButton variant="ghost" size="sm" onClick={() => setTutup(new Set())}>Buka semua</PrimaButton>
          <PrimaButton variant="ghost" size="sm"
            onClick={() => setTutup(new Set(rows.filter(r => punyaAnak.has(r.anggaran_key)).map(r => r.anggaran_key)))}>
            Ciutkan
          </PrimaButton>
        </div>
      </div>

      {tanpaDpa && (
        <div className="bk-warn">
          Tahun {tahun} belum punya DPA, jadi belum ada pagu yang bisa dipantau.
          Susun DPA lebih dulu di menu <TautanMenu href="/blud/dpa" boleh={bolehDpa}>DPA BLUD</TautanMenu>.
        </div>
      )}

      {perubahan && (
        <div className="rl-banner">
          <span>
            <b>Pagu diperbarui</b>
            {perubahan.naik.length > 0 && <> · {perubahan.naik.length} naik</>}
            {perubahan.turun.length > 0 && <> · {perubahan.turun.length} turun</>}
            {perubahan.baru.length > 0 && <> · {perubahan.baru.length} rekening baru</>}
            {perubahan.hilang.length > 0 && <> · {perubahan.hilang.length} rekening hilang</>}
          </span>
          <button className="blud-imp-link" onClick={() => setLihatPerubahan(v => !v)}>
            {lihatPerubahan ? 'Sembunyikan' : 'Lihat perubahan'}
          </button>
        </div>
      )}

      {perubahan && lihatPerubahan && (
        <div className="rl-diff">
          {([
            ['naik', 'Naik', perubahan.naik] as const,
            ['turun', 'Turun', perubahan.turun] as const,
          ]).map(([k, judul, arr]) => arr.length > 0 && (
            <div key={k} className="rl-diff-grup">
              <div className="rl-diff-judul">{judul}</div>
              {arr.map((x, i) => (
                <div key={i} className="rl-diff-baris">
                  <span className="bk-kode">{x.kode}</span>
                  <span className="rl-diff-uraian">{x.uraian}</span>
                  <span className="bk-num-inline">Rp {rp(x.lama)} → Rp {rp(x.baru)}</span>
                </div>
              ))}
            </div>
          ))}
          {perubahan.baru.length > 0 && (
            <div className="rl-diff-grup">
              <div className="rl-diff-judul">Rekening baru</div>
              {perubahan.baru.map((x, i) => (
                <div key={i} className="rl-diff-baris">
                  <span className="bk-kode">{x.kode}</span>
                  <span className="rl-diff-uraian">{x.uraian}</span>
                  <span className="bk-num-inline">Rp {rp(x.baru)}</span>
                </div>
              ))}
            </div>
          )}
          {perubahan.hilang.length > 0 && (
            <div className="rl-diff-grup">
              <div className="rl-diff-judul">Rekening hilang — periksa realisasinya</div>
              {perubahan.hilang.map((x, i) => (
                <div key={i} className="rl-diff-baris">
                  <span className="bk-kode">{x.kode}</span>
                  <span className="rl-diff-uraian">{x.uraian}</span>
                  <span className="bk-num-inline">semula Rp {rp(x.lama)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {minus.length > 0 && (
        <div className="rl-minus-banner">
          <TriangleAlert className="w-4 h-4 shrink-0" />
          <span>
            <b>{minus.length} baris terserap melebihi pagunya</b> — pagu diturunkan setelah uangnya
            terlanjur keluar (§4.3). Perbaiki lewat menu <TautanMenu href="/blud/pergeseran" boleh={bolehPergeseran}>Pergeseran</TautanMenu>,
            atau koreksi transaksinya di Buku Kas.
          </span>
        </div>
      )}

      {setelahBulanIni > 0.005 && (
        <div className="bk-warn">
          Tabel ini menunjukkan keadaan <b>sampai {NAMA_BULAN[bulan - 1]}</b> saja.
          Ada realisasi <b className="bk-num-inline">Rp {rp(setelahBulanIni)}</b> di bulan
          sesudahnya, jadi sisa anggaran yang sebenarnya masih bisa dibelanjakan hari ini
          adalah <b className="bk-num-inline">Rp {rp(total.pagu - total.terserap)}</b>.
        </div>
      )}

      <div className="blud-scroll-wrapper">
        <table className="dpa-table rl-table">
          <thead>
            <tr>
              <th style={{ width: 170 }}>Kode Rekening</th>
              <th>Uraian</th>
              <th style={{ width: 130 }}>Pagu</th>
              <th style={{ width: 120 }}>{NAMA_BULAN[bulan - 1]}</th>
              <th style={{ width: 120 }}>s.d. Bln Lalu</th>
              <th style={{ width: 130 }}>s.d. {NAMA_BULAN[bulan - 1]}</th>
              <th style={{ width: 130 }}>Sisa s.d. {NAMA_BULAN[bulan - 1]}</th>
              <th style={{ width: 64 }}>%</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={8} className="bk-kosong">Memuat…</td></tr>}
            {!loading && !tampil.length && (
              <tr><td colSpan={8} className="bk-kosong">
                {cari ? `Tidak ada baris yang cocok dengan "${cari}".` : `Belum ada baris anggaran untuk ${tahun}.`}
              </td></tr>
            )}
            {!loading && tampil.map((r) => {
              const d = kedalaman.get(r.anggaran_key) ?? 0
              const induk = punyaAnak.has(r.anggaran_key)
              const c = chip(r.kode_rekening)
              return (
                <tr key={r.anggaran_key}
                  className={`${induk ? 'rl-induk' : ''} ${r.sisa < -0.005 || lebihPagu(r) ? 'rl-row-minus' : ''}`}>
                  <td className="bk-kode" style={{ paddingLeft: 8 + d * 14 }}>
                    {induk && (
                      <button className="rl-toggle" onClick={() => toggle(r.anggaran_key)}
                        aria-label={tutup.has(r.anggaran_key) ? 'Buka' : 'Tutup'}>
                        {tutup.has(r.anggaran_key) ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                      </button>
                    )}
                    {r.kode_rekening || '—'}
                  </td>
                  <td>
                    <button className="rl-uraian" onClick={() => setFokus(r)}
                      data-tooltip="Lihat transaksinya (register)">
                      {r.uraian}
                    </button>
                  </td>
                  <td className="bk-r bk-num-inline">
                    {rpKosong(r.pagu)}
                    {c && (
                      <span className={`rl-chip rl-chip-${c.arah}`} data-tooltip={c.teks}>
                        {c.arah === 'naik' && <ArrowUp className="w-3 h-3" />}
                        {c.arah === 'turun' && <ArrowDown className="w-3 h-3" />}
                        {c.arah === 'baru' && <Plus className="w-3 h-3" />}
                      </span>
                    )}
                  </td>
                  <td className="bk-r bk-num-inline">{rpKosong(r.bulan_ini ?? 0)}</td>
                  <td className="bk-r bk-num-inline">{rpKosong(r.bulan_lalu ?? 0)}</td>
                  <td className="bk-r bk-num-inline">{rpKosong(r.sd_bulan ?? 0)}</td>
                  <td className="bk-r bk-num-inline rl-sisa">{rp(r.sisa)}</td>
                  <td className="bk-c bk-num-inline">{r.pagu > 0 ? Math.round(r.persen) : '—'}</td>
                </tr>
              )
            })}
          </tbody>
          {!loading && !!rows.length && (
            <tfoot>
              <tr className="bk-total">
                <td colSpan={2} className="bk-r">JUMLAH</td>
                <td className="bk-r bk-num-inline">{rp(total.pagu)}</td>
                <td className="bk-r bk-num-inline">{rpKosong(total.ini)}</td>
                <td className="bk-r bk-num-inline">{rpKosong(total.lalu)}</td>
                <td className="bk-r bk-num-inline">{rpKosong(total.sd)}</td>
                <td className="bk-r bk-num-inline">{rp(total.pagu - total.sd)}</td>
                <td className="bk-c bk-num-inline">
                  {total.pagu > 0 ? Math.round((total.sd / total.pagu) * 100) : '—'}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {tahun != null && fokus && (
        <RegisterPanel
          key={`${fokus.anggaran_key}-${bulan}`}
          tahun={tahun}
          bulan={bulan}
          baris={fokus}
          onClose={() => setFokus(null)}
        />
      )}

      {tahun != null && pratinjauBuka && (
        <PratinjauSerapanModal
          tahun={tahun}
          rows={rows}
          sumberVersi={sumber?.versi ?? null}
          onTutup={() => setPratinjauBuka(false)}
        />
      )}
    </div>
  )
}
