'use client'
// components/blud/TransaksiModal.tsx — form satu transaksi Buku Kas BLUD.
// Konsep: docs/CONCEPT-blud-realisasi.md §2.4, §2.5, §4.1, §4.2 · docs/CONCEPT-blud-potongan.md
//
// Tiga hal yang membedakan form ini dari form biasa:
//   1. Rekening DIPILIH dari pohon DPA/Pergeseran terbaru, tidak diketik (§2.4).
//      Kode rekening di BKU jadi sama dengan di DPA karena sumbernya sama.
//   2. Satu transaksi boleh dibagi ke beberapa baris anggaran (§2.5) — satu kuitansi
//      belanja modal sering memuat beberapa barang. Tombol "Bagi" baru muncul saat
//      dibutuhkan supaya tampilan tetap sederhana untuk kasus umum.
//   3. Pajak/potongan diisi sebagai RINCIAN pembayaran, bukan transaksi tersendiri.
//      Nilainya tidak menyentuh pagu — pagu sudah habis di baris belanjanya.
//
// Nilai alokasi selalu POSITIF di layar. Tanda diberikan saat kirim: pengembalian
// belanja dikirim negatif supaya `SUM(nilai)` di server langsung mengurangi serapan
// tanpa cabang khusus di mana pun.

import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Search, X, Plus, AlertTriangle, ArrowRightLeft, Scissors } from 'lucide-react'
import PrimaButton from '@/components/ui/PrimaButton'
import DeleteButton from '@/components/ui/DeleteButton'
import OpsiDropdown from '@/components/blud/OpsiDropdown'
import {
  JENIS_PEMINDAHAN, JENIS_POTONGAN, LABEL_POTONGAN,
  transferNetral, sifatAlokasi, alasanAlokasiDilarang,
  type JenisTransaksi, type JenisPotongan, type SifatAlokasi,
} from '@/lib/blud/alokasi-rule'

export interface BarisPaguUI {
  anggaran_key: string
  kode_rekening: string
  uraian: string
  pagu: number
  terserap: number
  sisa: number
  is_leaf: boolean
}

/** Isi `detail` pada respons 409 PAGU_TERLAMPAUI dari route tx. */
export interface PaguTerlampauiDetail {
  anggaran_key: string
  kode_rekening: string
  uraian: string
  pagu: number
  terserap: number
  nilai: number
  kekurangan: number
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
  potongan: { id?: number | null; jenis: JenisPotongan; keterangan: string | null; nilai: number }[]
}

interface Props {
  tahun: number
  bulan: number
  baris: BarisPaguUI[]
  awal: TransaksiAwal | null
  onClose: () => void
  onSaved: () => void
}

const JENIS_OPSI: { v: JenisTransaksi; t: string }[] = [
  { v: 'BELANJA', t: 'Belanja' },
  { v: 'AMBIL_BANK', t: 'Ambil dari bank' },
  { v: 'SETOR_BANK', t: 'Setor ke bank' },
  { v: 'PENERIMAAN', t: 'Penerimaan' },
  { v: 'PENGEMBALIAN', t: 'Pengembalian belanja' },
  { v: 'LAIN', t: 'Lain-lain' },
]

const POTONGAN_OPSI = JENIS_POTONGAN.map((j) => ({ value: j, label: LABEL_POTONGAN[j] }))

const rp = (n: number) => new Intl.NumberFormat('id-ID').format(Math.round(n))
const angka = (s: string) => Number(String(s).replace(/[^\d-]/g, '') || 0)

// B1 — `id` dibawa pulang apa adanya. Membuangnya membuat server mengira setiap
// baris itu baru, lalu mencetak id baru untuk baris yang tidak berubah — dan Bukti
// Setor yang menunjuk id lama kehilangan barisnya.
interface PotonganUI { id?: number | null; jenis: JenisPotongan; keterangan: string; nilai: number }

// Dirender hanya saat modal dibuka dan diberi `key` oleh pemanggil, jadi state
// cukup diambil dari prop saat mount — tanpa effect yang me-reset state
// (react-hooks/set-state-in-effect).
export default function TransaksiModal({ tahun, bulan, baris, awal, onClose, onSaved }: Props) {
  // S1: transaksi tercatat di (tahun, bulan) yang sedang dibuka, jadi tanggalnya
  // dikurung di bulan itu. Server tetap menolak yang di luar — ini supaya orangnya
  // tidak sampai mengetiknya.
  const awalBulan = `${tahun}-${String(bulan).padStart(2, '0')}-01`
  const akhirBulan = `${tahun}-${String(bulan).padStart(2, '0')}-${String(new Date(tahun, bulan, 0).getDate()).padStart(2, '0')}`
  const [tanggal, setTanggal] = useState(awal?.tanggal ?? awalBulan)
  const [jenis, setJenis] = useState<JenisTransaksi>((awal?.jenis as JenisTransaksi) ?? 'BELANJA')
  const [uraian, setUraian] = useState(awal?.uraian ?? '')
  const [kasKeluar, setKasKeluar] = useState(awal?.kas_keluar ?? 0)
  const [bankKeluar, setBankKeluar] = useState(awal?.bank_keluar ?? 0)
  const [kasMasuk, setKasMasuk] = useState(awal?.kas_masuk ?? 0)
  const [bankMasuk, setBankMasuk] = useState(awal?.bank_masuk ?? 0)
  const [alokasi, setAlokasi] = useState<{ anggaran_key: string; nilai: number }[]>(
    () => awal?.alokasi.map(a => ({ anggaran_key: a.anggaran_key, nilai: Math.abs(a.nilai) })) ?? [],
  )
  const [potongan, setPotongan] = useState<PotonganUI[]>(
    () => awal?.potongan.map(p => ({ id: p.id ?? null, jenis: p.jenis, keterangan: p.keterangan ?? '', nilai: p.nilai })) ?? [],
  )
  const [parkir, setParkir] = useState(awal?.status === 'BELUM_BERREKENING')
  const [cari, setCari] = useState('')
  const [pickerFor, setPickerFor] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [galat, setGalat] = useState<string | null>(null)
  const [paguGagal, setPaguGagal] = useState<PaguTerlampauiDetail | null>(null)
  const [mengajukan, setMengajukan] = useState(false)
  const [diajukan, setDiajukan] = useState(false)

  const byKey = useMemo(() => new Map(baris.map(b => [b.anggaran_key, b])), [baris])
  const beban = kasKeluar + bankKeluar
  const masuk = kasMasuk + bankMasuk
  const arus = { jenis, kas_masuk: kasMasuk, bank_masuk: bankMasuk, kas_keluar: kasKeluar, bank_keluar: bankKeluar }

  // Aturan dari `lib/blud/alokasi-rule.ts` — sama persis dengan yang dipakai Zod
  // dan data layer, supaya layar tidak pernah menjanjikan yang ditolak server.
  // Sifat dihitung dua kali: tanpa parkir untuk memutuskan apakah centangnya
  // pantas ditawarkan, dengan parkir untuk menentukan isi form yang sebenarnya.
  const sifatTanpaParkir = sifatAlokasi(arus)
  const sifat: SifatAlokasi = parkir ? 'DILARANG' : sifatTanpaParkir
  const bisaParkir = sifatTanpaParkir === 'WAJIB'
  const perluAlokasi = sifat !== 'DILARANG'
  const kembali = sifat === 'WAJIB_KEMBALI'
  const bisaPotongan = sifat === 'WAJIB'

  const targetAlokasi = kembali ? masuk : beban
  const totalAlokasi = alokasi.reduce((s, a) => s + a.nilai, 0)
  const selisih = targetAlokasi - totalAlokasi
  const totalPotongan = potongan.reduce((s, p) => s + p.nilai, 0)
  const potonganKelebihan = bisaPotongan && totalPotongan > beban + 0.005

  // Pemindahan bank↔kas yang tidak netral bukan pemindahan — biasanya jenisnya
  // salah pilih. Ditandai di layar sebelum server menolaknya.
  const transferTimpang = JENIS_PEMINDAHAN.includes(jenis) && !transferNetral(arus) && beban > 0
  const pengembalianTimpang = jenis === 'PENGEMBALIAN' && beban > 0

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
    // Alokasi pertama otomatis mengambil seluruh nilai transaksi — kasus umum satu
    // kuitansi = satu rekening tidak perlu mengetik nominal dua kali.
    setAlokasi(prev => [...prev, { anggaran_key: '', nilai: prev.length === 0 ? targetAlokasi : Math.max(0, selisih) }])
    setPickerFor(alokasi.length)
  }

  function tambahPotongan() {
    setPotongan(prev => [...prev, { jenis: 'PPN', keterangan: '', nilai: 0 }])
  }

  /** §4.1: membuat catatan permintaan + notifikasi. TIDAK menyentuh pagu. */
  async function ajukanPergeseran() {
    if (!paguGagal) return
    setMengajukan(true)
    try {
      const res = await fetch('/api/blud/realisasi/permintaan', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tahun_anggaran: tahun,
          jenis: 'PERGESERAN',
          anggaran_key: paguGagal.anggaran_key,
          kode_rekening: paguGagal.kode_rekening,
          uraian: `${paguGagal.uraian} — untuk transaksi "${uraian.trim() || '(tanpa uraian)'}"`,
          kekurangan: paguGagal.kekurangan,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.ok) { setGalat(json.error ?? 'Gagal mengirim permintaan.'); return }
      setDiajukan(true)
    } catch {
      setGalat('Tidak bisa menghubungi server. Coba lagi.')
    } finally {
      setMengajukan(false)
    }
  }

  async function simpan() {
    setGalat(null)
    setPaguGagal(null)
    setDiajukan(false)
    if (!uraian.trim()) { setGalat('Uraian wajib diisi.'); return }
    if (transferTimpang) {
      setGalat('Ambil/setor bank hanya memindahkan uang — nilai masuk harus sama dengan nilai keluar. '
        + 'Kalau ini pengeluaran sungguhan, pilih jenis lain lalu bebankan ke baris anggaran.'); return
    }
    if (pengembalianTimpang) {
      setGalat('Pengembalian belanja hanya menerima uang masuk — kosongkan kolom kas/bank keluar.'); return
    }
    if (perluAlokasi && !alokasi.length) {
      setGalat(kembali
        ? 'Pengembalian belanja wajib menunjuk baris anggaran mana yang serapannya dikurangi.'
        : 'Uang keluar wajib dibebankan ke baris anggaran. '
          + 'Kalau rekeningnya belum ada di DPA, centang "parkir" di bawah.'); return
    }
    if (perluAlokasi && alokasi.some(a => !a.anggaran_key)) { setGalat('Masih ada alokasi yang belum dipilih rekeningnya.'); return }
    if (perluAlokasi && Math.abs(selisih) > 0.005) {
      setGalat(`Total alokasi Rp ${rp(totalAlokasi)} tidak sama dengan nilai transaksi Rp ${rp(targetAlokasi)}.`); return
    }
    if (potonganKelebihan) {
      setGalat('Jumlah potongan melebihi nilai pembayaran — yang ditahan tidak bisa lebih besar dari yang dibayarkan.'); return
    }

    // Dikirim dari sifat, bukan dari isi state: alokasi yang terlanjur diketik saat
    // jenisnya masih BELANJA tetap tersimpan di layar setelah jenis diganti, dan
    // tanpa penyaring ini ia ikut terkirim lalu membebani pagu tanpa uang keluar.
    const transaksi = {
      tanggal, jenis, uraian: uraian.trim(),
      kas_masuk: kasMasuk, kas_keluar: kasKeluar,
      bank_masuk: bankMasuk, bank_keluar: bankKeluar,
      alokasi: perluAlokasi
        ? alokasi.map(a => ({ anggaran_key: a.anggaran_key, nilai: kembali ? -a.nilai : a.nilai }))
        : [],
      potongan: bisaPotongan
        ? potongan.filter(p => p.nilai > 0).map(p => ({
          id: p.id ?? null, jenis: p.jenis, keterangan: p.keterangan.trim() || null, nilai: p.nilai,
        }))
        : [],
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
      let json: { ok?: boolean; error?: string; code?: string; detail?: PaguTerlampauiDetail } = {}
      try { json = await res.json() } catch { /* respons bukan JSON — tangani lewat status */ }

      if (!res.ok) {
        if (json.code === 'PAGU_TERLAMPAUI' && json.detail) {
          const d = json.detail
          setPaguGagal(d)
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
              <input type="date" className="blud-imp-input" value={tanggal} min={awalBulan} max={akhirBulan}
                onChange={e => setTanggal(e.target.value)} />
            </label>
            <div className="bk-field">
              <span className="blud-imp-muted">Jenis</span>
              <OpsiDropdown
                value={jenis}
                items={JENIS_OPSI.map(o => ({ value: o.v, label: o.t }))}
                onChange={setJenis}
                icon={<ArrowRightLeft className="w-3.5 h-3.5 versi-icon" />}
                block
                portal
                ariaLabel="Jenis transaksi"
              />
            </div>
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

          {transferTimpang && (
            <div className="bk-note">
              <b>Nilai masuk dan keluar belum sama.</b> Ambil/setor bank hanya memindahkan uang milik
              sendiri, jadi keduanya harus sama besar. Kalau ini pengeluaran sungguhan, pilih jenis
              lain lalu bebankan ke baris anggaran.
            </div>
          )}

          {pengembalianTimpang && (
            <div className="bk-note">
              <b>Pengembalian belanja hanya menerima uang masuk.</b> Kosongkan kolom kas/bank keluar —
              yang dicatat di sini adalah uang yang kembali ke kas dan mengurangi serapan.
            </div>
          )}

          {kembali && (
            <div className="bk-note">
              Serapan baris anggaran yang dipilih akan <b>berkurang</b> sebesar nilai ini, dan sisa
              pagunya bertambah. Nilainya tidak boleh melebihi yang pernah terserap di baris itu.
            </div>
          )}

          {/* Centang parkir mengikuti aturan yang sama dengan kewajiban alokasi —
              dulu hanya muncul untuk BELANJA, sehingga pengeluaran berjenis lain
              tidak punya jalan keluar sah selain lolos tanpa pembebanan. */}
          {bisaParkir && (
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

          {!perluAlokasi && !parkir && alokasi.length > 0 && (
            <div className="bk-note">
              {alasanAlokasiDilarang(arus)} Pembebanan yang sudah diketik <b>tidak akan ikut disimpan</b>.
            </div>
          )}

          {perluAlokasi && (
            <div className="bk-alokasi">
              <div className="bk-alokasi-head">
                <span className="blud-imp-dock-title blud-imp-muted">
                  {kembali ? 'PENGEMBALIAN KE BARIS ANGGARAN' : 'PEMBEBANAN KE BARIS ANGGARAN'}
                </span>
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
                        {kembali
                          ? `terserap sekarang Rp ${rp(b.terserap)}`
                          : `sisa sekarang Rp ${rp(b.sisa)} dari pagu Rp ${rp(b.pagu)}`}
                      </div>
                    )}
                  </div>
                )
              })}

              {alokasi.length > 0 && (
                <div className={`bk-seimbang ${Math.abs(selisih) > 0.005 ? 'timpang' : 'pas'}`}>
                  {kembali ? 'Kembali' : 'Belanja'} Rp {rp(targetAlokasi)} · dialokasikan Rp {rp(totalAlokasi)}
                  {Math.abs(selisih) > 0.005 ? ` · selisih Rp ${rp(Math.abs(selisih))}` : ' · pas'}
                </div>
              )}
            </div>
          )}

          {bisaPotongan && (
            <div className="bk-alokasi">
              <div className="bk-alokasi-head">
                <span className="blud-imp-dock-title blud-imp-muted">POTONGAN PIHAK KETIGA</span>
                <PrimaButton size="sm" variant="purple" iconLeft={<Scissors className="w-3.5 h-3.5" />} onClick={tambahPotongan}>
                  Tambah Potongan
                </PrimaButton>
              </div>

              {potongan.length === 0 && (
                <div className="bk-potongan-kosong blud-imp-muted">
                  Pajak yang dipungut/dipotong dari pembayaran ini lalu langsung disetorkan — PPN, PPh,
                  koperasi, Baznas. Tidak mengurangi serapan: pagunya sudah habis di baris belanja di atas.
                </div>
              )}

              {potongan.map((p, i) => (
                <div key={i} className="bk-potongan-row">
                  <OpsiDropdown
                    value={p.jenis}
                    items={POTONGAN_OPSI}
                    onChange={(v) => setPotongan(prev => prev.map((x, j) => j === i ? { ...x, jenis: v } : x))}
                    block
                    portal
                    ariaLabel="Jenis potongan"
                  />
                  <input className="blud-imp-input" value={p.keterangan} maxLength={191}
                    placeholder="keterangan (opsional)"
                    onChange={e => setPotongan(prev => prev.map((x, j) => j === i ? { ...x, keterangan: e.target.value } : x))} />
                  <input className="blud-imp-input bk-num" inputMode="numeric" value={rp(p.nilai)}
                    onChange={e => setPotongan(prev => prev.map((x, j) => j === i ? { ...x, nilai: angka(e.target.value) } : x))} />
                  <DeleteButton onClick={() => setPotongan(prev => prev.filter((_, j) => j !== i))} />
                </div>
              ))}

              {potongan.length > 0 && (
                <div className={`bk-seimbang ${potonganKelebihan ? 'timpang' : 'pas'}`}>
                  Potongan Rp {rp(totalPotongan)} · diterima rekanan Rp {rp(beban - totalPotongan)}
                  {potonganKelebihan ? ' · melebihi nilai pembayaran' : ''}
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

          {/* §4.1: sistem hanya mengantar permintaan ke pemegang DPA — pagunya
              TIDAK disentuh dari sini. Angkanya tetap ditentukan manusia. */}
          {paguGagal && (
            <div className="bk-jalan-keluar">
              {diajukan ? (
                <span>
                  Permintaan sudah dikirim ke pemegang DPA. Anda akan diberi tahu begitu pagunya
                  ditambah. Sementara ini transaksinya bisa <b>diparkir</b> supaya saldo kas tetap benar.
                </span>
              ) : (
                <>
                  <span>Uangnya sudah telanjur keluar?</span>
                  <PrimaButton variant="purple" size="sm" disabled={mengajukan} onClick={ajukanPergeseran}>
                    {mengajukan ? 'Mengirim…' : 'Ajukan Pergeseran'}
                  </PrimaButton>
                </>
              )}
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
