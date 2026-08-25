'use client'
// components/blud/SalinTahunModal.tsx — salin isi DPA tahun lain ke FORM tahun ini.
// Konsep: docs/CONCEPT-blud-salin-tahun.md
//
// Sepadan dengan fitur salin-tahun di Renaksi & Kinerja, tapi berhenti satu
// langkah lebih awal dengan sengaja: yang dihasilkan cuma isi form di layar,
// belum baris di database. Simpan tetap ditekan manusia.
//
// Konsekuensi yang bagus dari berhenti di form: Sentinel ikut memeriksanya lebih
// dulu. Kalau tahun sumber punya konflik PJ segaris atau baris tak lengkap,
// spanduknya muncul SEBELUM Simpan — bukan tersalin diam-diam ke tahun baru.
//
// Dua sumber, bukan satu:
//   DPA murni      → pagu awal tahun sumber
//   Pasca-geser    → pagu yang benar-benar berlaku di akhir tahun sumber
// Pilihan kedua disembunyikan untuk orang yang tidak berhak membuka menu
// Pergeseran — GET-nya dijaga `bolehBukaMenu('pergeseran')`, jadi menampilkannya
// hanya akan berujung 403 (L69: pagar API tanpa pasangannya di layar).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { X, CalendarClock, AlertTriangle } from 'lucide-react'
import PrimaButton from '@/components/ui/PrimaButton'
import SoftSelect from '@/components/ui/SoftSelect'
import { confirmDialog } from '@/components/ui/ConfirmDialog'
import { dpaKeTahunBaruInput, pergeseranKeTahunBaruInput } from '@/lib/blud/row-map'
// Dari `import-dpa-shared`, bukan `schemas`: berkas itu sengaja bebas dependensi
// server. Lewat `schemas` bundel browser ikut menyeret ratelimit → ioredis → dns.
import { BLUD_SIMPAN_MAKS_BARIS } from '@/lib/blud/import-dpa-shared'
import { hitungDeltaPergeseranRoot } from '@/lib/blud/recalc'
import { formatRupiah } from '@/lib/blud/format'
import { formatTanggalId } from '@/lib/blud/tanggal'
import type { DpaBaris, DpaBarisInput, PergeseranBaris } from '@/types'

export type SumberSalin = 'DPA' | 'PERGESERAN'
export type AsalSalin = { tahun: number; versi: string; sumber: SumberSalin }

type Pratinjau = {
  versi: string | null
  jumlah: number
  /** Hanya terisi untuk sumber Pergeseran; ≠ 0 = versinya masih draft. */
  delta: number
}

const KOSONG: Pratinjau = { versi: null, jumlah: 0, delta: 0 }

async function ambil<T>(url: string): Promise<{ data: T[]; versi: string | null }> {
  const res = await fetch(url, { cache: 'no-store' })
  let json: { ok?: boolean; data?: T[]; versi_tanggal?: string | null; error?: string }
  try { json = await res.json() } catch { throw new Error('Balasan server tidak terbaca.') }
  if (!res.ok || !json.ok) throw new Error(json.error ?? 'Gagal memuat data tahun sumber.')
  return { data: json.data ?? [], versi: json.versi_tanggal ?? null }
}

export default function SalinTahunModal({
  tahunTujuan, tahunList, bolehBacaPergeseran, adaIsiDiForm, onTutup, onSalin,
}: {
  tahunTujuan: number
  tahunList: number[]
  bolehBacaPergeseran: boolean
  adaIsiDiForm: boolean
  onTutup: () => void
  onSalin: (rows: DpaBarisInput[], asal: AsalSalin) => void
}) {
  // Tahun sumber bawaan: tahun terbesar yang PUNYA data dan lebih tua dari tahun
  // tujuan. Kalau tidak ada yang lebih tua, pakai tahun terbesar yang bukan
  // dirinya sendiri — menyalin tahun ke dirinya sendiri tidak ada gunanya.
  const kandidat = useMemo(
    () => tahunList.filter(t => t !== tahunTujuan).sort((a, b) => b - a),
    [tahunList, tahunTujuan],
  )
  const bawaan = useMemo(
    () => kandidat.find(t => t < tahunTujuan) ?? kandidat[0] ?? null,
    [kandidat, tahunTujuan],
  )

  const [tahunSumber, setTahunSumber] = useState<number | null>(bawaan)
  const [sumber, setSumber]   = useState<SumberSalin>('DPA')
  const [memuat, setMemuat]   = useState(false)
  const [sibuk, setSibuk]     = useState(false)
  const [dpa, setDpa]         = useState<Pratinjau>(KOSONG)
  const [pgs, setPgs]         = useState<Pratinjau>(KOSONG)
  // Baris disimpan supaya tombol Salin tidak perlu menembak server kedua kali —
  // dan supaya yang tersalin persis yang angkanya sudah dilihat di pratinjau.
  const [barisDpa, setBarisDpa] = useState<DpaBaris[]>([])
  const [barisPgs, setBarisPgs] = useState<PergeseranBaris[]>([])

  // Nomor urut permintaan. Mengganti tahun sumber dua kali beruntun bisa membuat
  // balasan yang LEBIH LAMA datang belakangan: layar menampilkan isi 2026 sementara
  // dropdown menunjuk 2025, lalu `asal_salin` mencatat tahun yang salah ke audit —
  // justru jejak yang fitur ini ada untuk menjaganya. Balasan basi dibuang.
  const generasiRef = useRef(0)

  const muat = useCallback(async (tahun: number) => {
    const generasi = ++generasiRef.current
    const masihBerlaku = () => generasiRef.current === generasi
    setMemuat(true)
    setDpa(KOSONG); setPgs(KOSONG); setBarisDpa([]); setBarisPgs([])
    try {
      const tugas: Promise<void>[] = [
        ambil<DpaBaris>(`/api/blud/dpa?tahun=${tahun}`).then(r => {
          if (!masihBerlaku()) return
          setBarisDpa(r.data)
          setDpa({ versi: r.versi, jumlah: r.data.length, delta: 0 })
        }),
      ]
      if (bolehBacaPergeseran) {
        tugas.push(
          ambil<PergeseranBaris>(`/api/blud/pergeseran?tahun=${tahun}`).then(r => {
            if (!masihBerlaku()) return
            setBarisPgs(r.data)
            setPgs({ versi: r.versi, jumlah: r.data.length, delta: hitungDeltaPergeseranRoot(r.data) })
          }),
        )
      }
      await Promise.all(tugas)
    } catch (e) {
      if (masihBerlaku()) toast.error(e instanceof Error ? e.message : 'Gagal memuat data tahun sumber.')
    } finally {
      if (masihBerlaku()) setMemuat(false)
    }
  }, [bolehBacaPergeseran])

  useEffect(() => {
    if (tahunSumber == null) return
    // Pemuat sekali-jalan per tahun: `muat` menyetel state hanya sesudah `await`.
    // Preseden: fetch-on-open di `SalinMasterModal.tsx`.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void muat(tahunSumber)
  }, [tahunSumber, muat])

  // Sumber yang barisnya nol tidak boleh tetap terpilih diam-diam: orang memilih
  // Pasca-Pergeseran, lalu mengganti tahun ke tahun yang belum punya pergeseran.
  // Diturunkan saat dibaca, bukan lewat efek yang menyusul satu render kemudian —
  // di sela itu tombol Salin sempat menunjuk isi yang tidak ada.
  const sumberEfektif: SumberSalin = sumber === 'PERGESERAN' && pgs.jumlah === 0 ? 'DPA' : sumber
  const terpilih = sumberEfektif === 'DPA' ? dpa : pgs

  // Jalur impor menampung 2.000 baris, jalur simpan biasa cuma 700. Tahun yang
  // diisi lewat Impor karena itu bisa lebih gemuk daripada yang bisa disimpan
  // balik. Ditahan DI SINI, bukan dibiarkan jatuh jadi 400 dari Zod sesudah
  // orangnya menyalin lalu menyunting satu jam.
  const kegemukan = terpilih.jumlah > BLUD_SIMPAN_MAKS_BARIS
  const siap = !memuat && !sibuk && tahunSumber != null && terpilih.jumlah > 0 && !kegemukan

  const jalankan = useCallback(async () => {
    if (tahunSumber == null || !terpilih.versi) return

    // `confirmLabel` WAJIB diisi di dua konfirmasi ini. Bawaan `confirmDialog`
    // berbunyi "Hapus" — tepat untuk pemakaian aslinya, menyesatkan di sini:
    // tidak ada yang dihapus, dan tidak ada apa pun yang menyentuh basis data.
    if (adaIsiDiForm) {
      const setuju = await confirmDialog({
        title: 'Ganti isi form yang sekarang?',
        message: `Baris yang sedang ada di layar akan diganti ${terpilih.jumlah} baris dari tahun ${tahunSumber}. `
          + 'Belum ada yang tersimpan sampai Anda menekan Simpan.',
        variant: 'danger',
        confirmLabel: 'Ganti isi form',
      })
      if (!setuju) return
    }

    if (sumberEfektif === 'PERGESERAN' && pgs.delta !== 0) {
      const setuju = await confirmDialog({
        title: 'Salin dari pergeseran yang belum berimbang?',
        message: `Versi ${terpilih.versi} masih draft — selisihnya ${formatRupiah(pgs.delta)} terhadap DPA. `
          + `Angka yang belum selesai ini akan jadi dasar tahun ${tahunTujuan}.`,
        // `warning`, bukan `danger`: ini kehati-hatian, bukan tindakan merusak.
        variant: 'warning',
        confirmLabel: 'Tetap salin',
      })
      if (!setuju) return
    }

    setSibuk(true)
    const rows = sumberEfektif === 'DPA'
      ? barisDpa.map((d, i) => dpaKeTahunBaruInput(d, i))
      : barisPgs.map((d, i) => pergeseranKeTahunBaruInput(d, i))
    onSalin(rows, { tahun: tahunSumber, versi: terpilih.versi, sumber: sumberEfektif })
    setSibuk(false)
  }, [tahunSumber, terpilih, adaIsiDiForm, sumberEfektif, pgs.delta, barisDpa, barisPgs, tahunTujuan, onSalin])

  return (
    <div
      onClick={onTutup}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 24 }}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="blud-imp-text"
        style={{ background: 'var(--surface-card, #042C53)', borderRadius: 14, width: 'min(620px, 96vw)', maxHeight: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,.5)', overflow: 'hidden' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,.08)' }}>
          <CalendarClock size={17} />
          <div style={{ fontSize: 14, fontWeight: 800 }}>Salin dari Tahun Lain</div>
          <button onClick={onTutup} aria-label="Tutup" style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', opacity: .7 }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: 20, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {kandidat.length === 0 ? (
            <div className="blud-imp-badge-warn" style={{ padding: '9px 12px', borderRadius: 8, fontSize: 11.5, lineHeight: 1.6 }}>
              Belum ada tahun lain yang berisi data DPA. Tidak ada yang bisa disalin.
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12 }}>
                <span style={{ fontWeight: 700 }}>Salin dari tahun</span>
                <SoftSelect
                  value={tahunSumber ?? kandidat[0]}
                  options={kandidat.map(t => ({ value: t, label: String(t) }))}
                  onChange={t => setTahunSumber(t)}
                  minWidth={110}
                  disabled={memuat}
                />
                <span className="blud-imp-muted">→ form DPA {tahunTujuan}</span>
              </div>

              {memuat ? (
                <p className="blud-imp-muted" style={{ fontSize: 12 }}>Memuat isi tahun {tahunSumber}…</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <PilihanSumber
                    dipilih={sumberEfektif === 'DPA'}
                    onPilih={() => setSumber('DPA')}
                    judul="DPA murni"
                    ket="Pagu awal tahun sumber, sebelum digeser."
                    pratinjau={dpa}
                  />
                  {bolehBacaPergeseran && (
                    <PilihanSumber
                      dipilih={sumberEfektif === 'PERGESERAN'}
                      onPilih={() => setSumber('PERGESERAN')}
                      judul="Pasca-Pergeseran"
                      ket="Pagu yang benar-benar berlaku di akhir tahun sumber."
                      pratinjau={pgs}
                    />
                  )}
                </div>
              )}

              {!memuat && sumberEfektif === 'PERGESERAN' && pgs.delta !== 0 && (
                <div className="blud-imp-badge-warn" style={{ display: 'flex', gap: 8, padding: '9px 12px', borderRadius: 8, fontSize: 11.5, lineHeight: 1.6 }}>
                  <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 2 }} />
                  <span>
                    Pergeseran {pgs.versi} belum berimbang — selisih <strong>{formatRupiah(pgs.delta)}</strong> terhadap
                    DPA. Ini draft, bukan dokumen final.
                  </span>
                </div>
              )}

              {!memuat && kegemukan && (
                <div className="blud-imp-badge-warn" style={{ display: 'flex', gap: 8, padding: '9px 12px', borderRadius: 8, fontSize: 11.5, lineHeight: 1.6 }}>
                  <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 2 }} />
                  <span>
                    {terpilih.jumlah} baris — melebihi batas simpan {BLUD_SIMPAN_MAKS_BARIS} baris.
                    Tahun ini kemungkinan diisi lewat Impor, yang batasnya lebih longgar. Menyalinnya
                    akan menghasilkan form yang tidak bisa disimpan; pakai menu Impor untuk tahun tujuan.
                  </span>
                </div>
              )}

              {!memuat && dpa.jumlah > 0 && pgs.jumlah > 0 && dpa.jumlah !== pgs.jumlah && (
                <p className="blud-imp-muted" style={{ fontSize: 11, lineHeight: 1.6 }}>
                  Jumlah barisnya memang berbeda: pergeseran bisa mengosongkan pos yang tidak
                  jadi dipakai. Dua pilihan di atas bukan dua nama untuk isi yang sama.
                </p>
              )}

              <div className="blud-imp-muted" style={{ fontSize: 11, lineHeight: 1.7, borderTop: '1px solid rgba(255,255,255,.08)', paddingTop: 12 }}>
                Yang <strong>tidak</strong> ikut tersalin: jangkar realisasi tiap baris (belanja tahun
                baru tidak boleh dilaporkan ke pos tahun lama) dan jejak asal-usul dari
                menu Usulan. Kode rekening, uraian, volume, harga, penanggung jawab, dan
                keterangan tersalin apa adanya.
              </div>
            </>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center', padding: '12px 20px', borderTop: '1px solid rgba(255,255,255,.08)' }}>
          <span className="blud-imp-muted" style={{ fontSize: 11.5, marginRight: 'auto' }}>
            Belum tersimpan — tekan Simpan sesudah diperiksa.
          </span>
          <PrimaButton variant="ghost" onClick={onTutup} disabled={sibuk}>Batal</PrimaButton>
          <PrimaButton variant="primary" disabled={!siap} onClick={() => void jalankan()}>
            {siap ? `Salin ${terpilih.jumlah} baris ke form` : 'Salin ke form'}
          </PrimaButton>
        </div>
      </div>
    </div>
  )
}

function PilihanSumber({
  dipilih, onPilih, judul, ket, pratinjau,
}: {
  dipilih: boolean
  onPilih: () => void
  judul: string
  ket: string
  pratinjau: Pratinjau
}) {
  const kosong = pratinjau.jumlah === 0
  return (
    <label
      className={`blud-imp-row${dipilih ? ' sel' : ''}`}
      style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 12px', borderRadius: 8, fontSize: 12, cursor: kosong ? 'not-allowed' : 'pointer', opacity: kosong ? .5 : 1 }}
    >
      <input
        type="radio"
        name="sumber-salin-tahun"
        checked={dipilih}
        disabled={kosong}
        onChange={onPilih}
        style={{ marginTop: 3, flexShrink: 0 }}
      />
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ fontWeight: 700 }}>{judul}</span>
        <div className="blud-imp-muted" style={{ fontSize: 11, lineHeight: 1.6 }}>{ket}</div>
        <div style={{ fontSize: 11, marginTop: 3 }}>
          {kosong
            ? <span className="blud-imp-muted">belum ada datanya di tahun ini</span>
            : <>{pratinjau.jumlah} baris · versi {pratinjau.versi ? formatTanggalId(pratinjau.versi) : '—'}</>}
        </div>
      </span>
    </label>
  )
}
