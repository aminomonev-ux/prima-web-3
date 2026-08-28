'use client'
// components/blud/SalinVersiModal.tsx — salin isi versi LAIN dalam tahun yang
// sama ke form yang sedang di layar. Aturannya: lib/blud/salin-versi.ts
//
// Satu hal yang membuat modal ini berbeda dari semua modal lain di BLUD, dan itu
// disengaja: ia TIDAK PUNYA sasaran tulis sendiri. Sasaran ditampilkan sebagai
// keterangan, bukan pilihan — yang menentukannya tetap pemilih periode di
// toolbar. Modal yang memegang tanggal tulisnya sendiri persis bentuk L78, dan
// bentuk itu sudah pernah menghasilkan versi Agustus dari orang yang memilih
// Juli, lalu menimpa versi bulan berjalan yang sudah berisi.
//
// Generik atas tipe barisnya supaya layar DPA dan Pergeseran memakai badan yang
// sama sambil tetap memetakan barisnya dengan mapper masing-masing
// (`dpaKeInput` / `pergeseranKeInput`). Yang tidak boleh terjadi adalah mapper
// KETIGA yang khusus untuk salinan ini — kolom yang lupa didaftar di sana akan
// terbuang senyap, dan `anggaran_key` justru kolom yang seluruh fitur ini ada
// untuk mempertahankannya.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { X, Copy, AlertTriangle, ArrowRight } from 'lucide-react'
import PrimaButton from '@/components/ui/PrimaButton'
import SoftSelect from '@/components/ui/SoftSelect'
import { confirmDialog } from '@/components/ui/ConfirmDialog'
import { formatRupiah } from '@/lib/blud/format'
import { formatTanggalId } from '@/lib/blud/tanggal'
import {
  sumberSalinTersedia, labelVersiSumber, alasanDpaAcuanTerlaluBaru,
  type AsalSalin, type SumberSalin, type VersiPilihan,
} from '@/lib/blud/salin-versi'

/** Baris pergeseran membawa acuan DPA-nya; baris DPA tidak. Dibaca lunak. */
type MungkinBerAcuanDpa = { dpa_versi_tanggal?: string | null }

export default function SalinVersiModal<TRaw, TInput>({
  tahun, jenis, history, versiTerbuka, sasaran, jumlahDiLayar,
  petakan, hitungTotal, onTutup, onSalin,
}: {
  tahun:         number
  jenis:         SumberSalin
  history:       readonly VersiPilihan[]
  /** Versi yang sedang dibaca layar; '' kalau layar sedang tidak memegang versi. */
  versiTerbuka:  string
  /** Tanggal yang akan ditulis Simpan — dari `sasaranSimpan`, bukan dihitung ulang. */
  sasaran:       string
  jumlahDiLayar: number
  petakan:       (raw: TRaw[]) => TInput[]
  hitungTotal:   (rows: TInput[]) => number
  onTutup:       () => void
  onSalin:       (rows: TInput[], asal: AsalSalin, dpaVersi: string | null) => void
}) {
  const pilihan = useMemo(
    () => sumberSalinTersedia(history, [versiTerbuka, sasaran]),
    [history, versiTerbuka, sasaran],
  )

  const [sumber,  setSumber]  = useState<string>(pilihan[0]?.versi_tanggal ?? '')
  const [memuat,  setMemuat]  = useState(false)
  const [sibuk,   setSibuk]   = useState(false)
  const [baris,   setBaris]   = useState<TInput[]>([])
  const [dpaVersi, setDpaVersi] = useState<string | null>(null)

  // Nomor urut permintaan — sama seperti SalinTahunModal. Mengganti sumber dua
  // kali beruntun bisa membuat balasan yang LEBIH LAMA datang belakangan, dan
  // yang tersalin bukan yang angkanya dilihat di pratinjau.
  const generasiRef = useRef(0)

  const muat = useCallback(async (v: string) => {
    const generasi = ++generasiRef.current
    const masihBerlaku = () => generasiRef.current === generasi
    setMemuat(true)
    setBaris([]); setDpaVersi(null)
    try {
      const jalur = jenis === 'DPA' ? 'dpa' : 'pergeseran'
      const res = await fetch(`/api/blud/${jalur}?tahun=${tahun}&tanggal=${encodeURIComponent(v)}`, { cache: 'no-store' })
      let json: { ok?: boolean; data?: TRaw[]; error?: string }
      try { json = await res.json() } catch { throw new Error('Jawaban dari server tidak terbaca. Coba lagi sebentar lagi.') }
      if (!res.ok || !json.ok) throw new Error(json.error ?? 'Isi versi itu tidak bisa dimuat. Coba lagi sebentar lagi.')
      if (!masihBerlaku()) return
      const raw = json.data ?? []
      setBaris(petakan(raw))
      // Dibaca dari baris pertama, persis cara `loadPergeseran` melakukannya.
      // Untuk DPA nilainya memang tidak ada dan `?? null` sudah jawaban benar.
      setDpaVersi((raw[0] as MungkinBerAcuanDpa | undefined)?.dpa_versi_tanggal ?? null)
    } catch (e) {
      if (masihBerlaku()) toast.error(e instanceof Error ? e.message : 'Isi versi itu tidak bisa dimuat.')
    } finally {
      if (masihBerlaku()) setMemuat(false)
    }
  }, [tahun, jenis, petakan])

  useEffect(() => {
    if (!sumber) return
    // Pemuat sekali-jalan per versi: `muat` menyetel state hanya sesudah `await`.
    // Preseden: fetch-on-open di `SalinTahunModal.tsx`.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void muat(sumber)
  }, [sumber, muat])

  const peringatanDpa = alasanDpaAcuanTerlaluBaru(dpaVersi, sasaran)
  const total = baris.length > 0 ? hitungTotal(baris) : 0
  const siap = !memuat && !sibuk && !!sumber && baris.length > 0 && !peringatanDpa

  const jalankan = useCallback(async () => {
    if (!sumber || baris.length === 0) return
    if (jumlahDiLayar > 0) {
      // `confirmLabel` wajib diisi: bawaan `confirmDialog` berbunyi "Hapus", dan
      // di sini tidak ada apa pun yang dihapus maupun menyentuh basis data.
      const setuju = await confirmDialog({
        title: 'Ganti isi layar dengan versi lain?',
        message: `${jumlahDiLayar} baris yang sekarang di layar akan diganti ${baris.length} baris dari versi `
          + `${formatTanggalId(sumber)}.\n\n`
          + `Sasaran Simpan TIDAK berubah — tetap ${formatTanggalId(sasaran)}. `
          + `Belum ada yang tersimpan sampai Anda menekan Simpan.`,
        variant: 'warning',
        confirmLabel: 'Ganti isi layar',
      })
      if (!setuju) return
    }
    setSibuk(true)
    onSalin(baris, { tahun, versi: sumber, sumber: jenis, lingkup: 'VERSI' }, dpaVersi)
    setSibuk(false)
  }, [sumber, baris, jumlahDiLayar, sasaran, tahun, jenis, dpaVersi, onSalin])

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
          <Copy size={17} />
          <div style={{ fontSize: 14, fontWeight: 800 }}>Salin dari Versi Lain</div>
          <button onClick={onTutup} aria-label="Tutup" style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', opacity: .7 }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: 20, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {pilihan.length === 0 ? (
            <div className="blud-imp-badge-warn" style={{ padding: '9px 12px', borderRadius: 8, fontSize: 11.5, lineHeight: 1.6 }}>
              Belum ada versi lain di tahun {tahun} yang bisa disalin.
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 700 }}>Salin dari versi</span>
                <SoftSelect
                  value={sumber}
                  options={pilihan.map(p => ({ value: p.versi_tanggal, label: labelVersiSumber(p.versi_tanggal) }))}
                  onChange={v => setSumber(String(v))}
                  minWidth={230}
                  disabled={memuat}
                />
              </div>

              {/* Sasaran ditampilkan, bukan dipilih. Itu seluruh rancangan modal
                  ini: menyalin mengganti ISI, tidak pernah SASARAN. */}
              <div
                className="blud-imp-row"
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 8, fontSize: 12 }}
              >
                <span className="blud-imp-muted">{sumber ? formatTanggalId(sumber) : '—'}</span>
                <ArrowRight size={14} style={{ flexShrink: 0, opacity: .6 }} />
                <span>
                  <strong>{formatTanggalId(sasaran)}</strong>
                  <div className="blud-imp-muted" style={{ fontSize: 11, lineHeight: 1.6 }}>
                    Sasaran Simpan tidak berubah. Untuk menulis ke periode lain, tutup jendela ini
                    lalu ganti periodenya di pemilih periode.
                  </div>
                </span>
              </div>

              {memuat ? (
                <p className="blud-imp-muted" style={{ fontSize: 12 }}>Memuat isi versi {formatTanggalId(sumber)}…</p>
              ) : baris.length > 0 && (
                <div style={{ fontSize: 12, lineHeight: 1.7 }}>
                  <strong>{baris.length} baris</strong> · total{' '}
                  <strong style={{ fontFamily: 'var(--font-mono, monospace)' }}>{formatRupiah(total)}</strong>
                  {dpaVersi && (
                    <div className="blud-imp-muted" style={{ fontSize: 11 }}>
                      Mengacu DPA {formatTanggalId(dpaVersi)}
                    </div>
                  )}
                </div>
              )}

              {peringatanDpa && (
                <div className="blud-imp-badge-warn" style={{ display: 'flex', gap: 8, padding: '9px 12px', borderRadius: 8, fontSize: 11.5, lineHeight: 1.6 }}>
                  <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 2 }} />
                  <span>{peringatanDpa}</span>
                </div>
              )}

              <div className="blud-imp-muted" style={{ fontSize: 11, lineHeight: 1.7, borderTop: '1px solid rgba(255,255,255,.08)', paddingTop: 12 }}>
                <div>
                  <strong>Yang tersalin:</strong> seluruh isi baris apa adanya, termasuk hubungannya
                  dengan belanja yang sudah tercatat — versinya berbeda, tapi tahunnya sama, jadi
                  posnya memang pos yang sama.
                </div>
                <div style={{ marginTop: 6 }}>
                  <strong>Yang perlu diperiksa:</strong> pos yang ada di sasaran tapi tidak ada di
                  versi sumber akan hilang begitu Simpan ditekan. Kalau pos itu sudah dipakai
                  belanja, Simpan akan menolaknya dan menyebutkan barisnya.
                </div>
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
            {siap ? `Salin ${baris.length} baris ke form` : 'Salin ke form'}
          </PrimaButton>
        </div>
      </div>
    </div>
  )
}
