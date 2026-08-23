'use client'
// components/blud/SalinMasterModal.tsx — salin kode+uraian dari baris DPA ke data induk.
// Konsep: docs/CONCEPT-export-import-dpa.md §3.8.
//
// Menutup lubang "impor duluan, master masih kosong": sesudah impor tabel DPA
// penuh, tapi combobox rekening belum punya satu pun pilihan karena impor menulis
// langsung ke `dpa_blud` tanpa melewati data induk.
//
// Sumber kandidatnya baris DPA yang SEDANG DI LAYAR, bukan muatan pratinjau impor.
// Karena itu jendela ini juga berguna berhari-hari sesudah impor, dan ikut menolong
// baris hasil "Import dari Usulan" maupun ketikan tangan.
//
// Dua tujuan ditulis lewat DUA panggilan terpisah dan itu memang tidak atomik satu
// sama lain — laporannya per tujuan, bukan satu kalimat "berhasil".
import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { X, AlertTriangle, Inbox } from 'lucide-react'
import PrimaButton from '@/components/ui/PrimaButton'
import { confirmDialog } from '@/components/ui/ConfirmDialog'
import {
  pindaiBarisDpa, saringIndukKodeBesar, gabungInduk,
  type BarisPindai, type KandidatSalin, type TujuanSalin,
} from '@/lib/blud/salin-master'

interface MaRow { kode: string; uraian: string }
interface KbRow { kode: string; uraian: string; level: 'L1' | 'L2' | 'L2.1'; parent_kode: string | null }

/** Batas Zod masing-masing endpoint — diperiksa di klien supaya tidak jadi 400 mentah. */
const BATAS_MA = 5000
const BATAS_KB = 1000

interface LaporanTulis { label: string; ok: boolean; pesan: string }

async function ambilDaftar<T>(url: string): Promise<{ data: T[]; version: number }> {
  const res = await fetch(url, { cache: 'no-store' })
  let json: { ok?: boolean; data?: T[]; version?: number; error?: string }
  try { json = await res.json() } catch { throw new Error('Balasan server tidak terbaca.') }
  if (!res.ok || !json.ok || !json.data) throw new Error(json.error ?? 'Gagal memuat data induk.')
  return { data: json.data, version: json.version ?? 0 }
}

async function kirimInduk(
  url: string, rows: unknown[], expectedVersion: number, paksa: boolean,
): Promise<string> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rows, expected_version: expectedVersion, force: paksa, sumber: 'DPA' }),
  })
  let json: { ok?: boolean; error?: string; code?: string; message?: string }
  try { json = await res.json() } catch { throw new Error('Balasan server tidak terbaca.') }
  if (!res.ok || !json.ok) {
    if (json.code === 'VERSION_CONFLICT') {
      throw new Error('Data induk baru saja diubah orang lain — daftarnya dimuat ulang, coba lagi.')
    }
    throw new Error(json.error ?? 'Gagal menyimpan.')
  }
  return json.message ?? 'Tersimpan.'
}

export default function SalinMasterModal({
  rows, bolehMasterAkun, bolehKodeBesar, onTutup, onSelesai,
}: {
  rows: BarisPindai[]
  bolehMasterAkun: boolean
  bolehKodeBesar: boolean
  onTutup: () => void
  onSelesai?: () => void
}) {
  const [memuat, setMemuat] = useState(true)
  const [sibuk, setSibuk] = useState(false)
  const [adaMa, setAdaMa] = useState<MaRow[]>([])
  const [adaKb, setAdaKb] = useState<KbRow[]>([])
  const [pilihManual, setPilihManual] = useState<Set<string> | null>(null)
  const [penimpa, setPenimpa] = useState<Record<string, TujuanSalin>>({})
  const [ganti, setGanti] = useState(false)
  const [laporan, setLaporan] = useState<LaporanTulis[] | null>(null)

  const muat = useCallback(async () => {
    setMemuat(true)
    try {
      const [ma, kb] = await Promise.all([
        ambilDaftar<MaRow>('/api/blud/master-akun'),
        ambilDaftar<KbRow>('/api/blud/kode-besar'),
      ])
      setAdaMa(ma.data)
      setAdaKb(kb.data)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gagal memuat data induk.')
    } finally {
      setMemuat(false)
    }
  }, [])

  useEffect(() => {
    // Pemuat sekali-jalan: `muat` menyetel state hanya sesudah `await`, jadi tidak
    // ada render berantai. Preseden: fetch-on-open di `iki/[id]/editor-client.tsx`.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void muat()
  }, [muat])

  const hasil = useMemo(
    () => pindaiBarisDpa(rows, { masterAkun: adaMa, kodeBesar: adaKb }, penimpa),
    [rows, adaMa, adaKb, penimpa],
  )

  // Centang bawaan DITURUNKAN, bukan disemai lewat effect: yang baru dan yang
  // ketiga sinyalnya sepakat. Begitu orangnya menyentuh satu centang, jawabannya
  // yang dipakai dan bawaannya tidak pernah menimpanya lagi.
  const bolehTujuan = useCallback(
    (t: TujuanSalin) => (t === 'KODE_BESAR' ? bolehKodeBesar : bolehMasterAkun),
    [bolehKodeBesar, bolehMasterAkun],
  )

  const bawaan = useMemo(
    () => new Set(
      hasil.kandidat
        .filter(k => k.status === 'BARU' && k.yakin && bolehTujuan(k.tujuan))
        .map(k => k.kode),
    ),
    [hasil, bolehTujuan],
  )
  const pilih = pilihManual ?? bawaan

  // Izin ikut menyaring DI SINI, bukan cuma saat menggambar daftarnya. Kalau hanya
  // tampilannya yang disaring, kandidat yang tujuannya tidak boleh disentuh tetap
  // terbawa ke penyimpanan dan pulang sebagai 403 yang tak bisa dijelaskan.
  const kbTerpilih = useMemo(
    () => (bolehKodeBesar ? hasil.kandidat.filter(k => k.tujuan === 'KODE_BESAR' && pilih.has(k.kode)) : []),
    [bolehKodeBesar, hasil, pilih],
  )
  const maTerpilih = useMemo(
    () => (bolehMasterAkun ? hasil.kandidat.filter(k => k.tujuan === 'MASTER_AKUN' && pilih.has(k.kode)) : []),
    [bolehMasterAkun, hasil, pilih],
  )
  const totalTerpilih = kbTerpilih.length + maTerpilih.length

  function toggle(kode: string) {
    const n = new Set(pilih)
    if (n.has(kode)) n.delete(kode)
    else n.add(kode)
    setPilihManual(n)
  }

  function pindahTujuan(kode: string, tujuan: TujuanSalin) {
    setPenimpa(p => ({ ...p, [kode]: tujuan }))
  }

  const tulisKodeBesar = useCallback(async (terpilih: KandidatSalin[]): Promise<string> => {
    const { data, version } = await ambilDaftar<KbRow>('/api/blud/kode-besar')
    // Mode ganti mengosongkan dasarnya, jadi yang tadinya "beda uraian" tidak punya
    // baris untuk ditimpa — tanpa perlakuan ini ia hilang tanpa suara.
    const isi = ganti ? terpilih.map(k => ({ ...k, status: 'BARU' as const })) : terpilih
    const gabungan = gabungInduk<KbRow>(ganti ? [] : data, isi, k => ({
      kode: k.kode, uraian: k.uraian, level: k.level ?? 'L2', parent_kode: k.parentKode,
    }))
    // `kode_besar.kode` UNIQUE — satu kembar saja membuat `bulkInsert` melempar
    // ER_DUP_ENTRY, dan itu sampai ke layar sebagai 500 "Server error" yang tidak
    // bisa dibaca siapa pun. Master Akun TIDAK diperlakukan begini: kodenya memang
    // boleh kembar di sana, jadi menyaring akan menghapus baris orang.
    const unik = new Map<string, KbRow>()
    for (const r of gabungan) unik.set(r.kode.trim(), r)
    const kirim = [...unik.values()]
    if (kirim.length > BATAS_KB) {
      throw new Error(`Kode Besar akan jadi ${kirim.length} baris — batasnya ${BATAS_KB}.`)
    }
    // Mode ganti bisa menabrak ambang "baris berkurang drastis"; orangnya sudah
    // menjawab konfirmasi merah, jadi jangan tanya dua kali.
    return kirimInduk('/api/blud/kode-besar', kirim, version, ganti)
  }, [ganti])

  const tulisMasterAkun = useCallback(async (terpilih: KandidatSalin[]): Promise<string> => {
    const { data, version } = await ambilDaftar<MaRow>('/api/blud/master-akun')
    const gabungan = gabungInduk<MaRow>(data, terpilih, k => ({ kode: k.kode, uraian: k.uraian }))
    if (gabungan.length > BATAS_MA) {
      throw new Error(`Master Akun akan jadi ${gabungan.length} baris — batasnya ${BATAS_MA}.`)
    }
    const kirim = gabungan.map(r => ({ kode: r.kode, uraian: r.uraian }))
    return kirimInduk('/api/blud/master-akun', kirim, version, false)
  }, [])

  const jalankan = useCallback(async () => {
    if (!totalTerpilih) { toast.error('Belum ada baris yang dicentang.'); return }

    if (ganti && kbTerpilih.length) {
      const setuju = await confirmDialog({
        title: 'Ganti seluruh isi Kode Besar?',
        message: `${adaKb.length} baris Kode Besar yang sekarang akan DIHAPUS, diganti ${kbTerpilih.length} baris dari DPA. Tidak bisa dibatalkan.`,
        variant: 'danger',
      })
      if (!setuju) return
    }

    // Induk yang centangnya dilepas orang membuat anaknya jadi baris hantu:
    // tersimpan di tabel, tapi dilewati `buildDpaRowsFromKodeBesar` sehingga tidak
    // pernah muncul di "Form Baru".
    const saring = saringIndukKodeBesar(kbTerpilih, ganti ? [] : adaKb)
    if (saring.yatim.length) {
      toast.warning(`${saring.yatim.length} baris Kode Besar dilewati — induknya tidak ikut dipilih.`)
    }

    setSibuk(true)
    setLaporan(null)
    const catat: LaporanTulis[] = []
    const berhasil = new Set<string>()

    if (saring.kirim.length) {
      try {
        catat.push({ label: 'Kode Besar', ok: true, pesan: await tulisKodeBesar(saring.kirim) })
        for (const k of saring.kirim) berhasil.add(k.kode)
      } catch (e) {
        catat.push({ label: 'Kode Besar', ok: false, pesan: e instanceof Error ? e.message : String(e) })
      }
    }
    if (maTerpilih.length) {
      try {
        catat.push({ label: 'Master Akun', ok: true, pesan: await tulisMasterAkun(maTerpilih) })
        for (const k of maTerpilih) berhasil.add(k.kode)
      } catch (e) {
        catat.push({ label: 'Master Akun', ok: false, pesan: e instanceof Error ? e.message : String(e) })
      }
    }

    // Centang yang sudah tertulis dilepas SEBELUM daftar dimuat ulang. Tanpa ini,
    // menekan Simpan lagi untuk mengulang tujuan yang gagal akan mengirim ulang
    // tujuan yang sudah berhasil — dan `gabungInduk` menempelnya sebagai baris baru.
    if (berhasil.size) {
      setPilihManual(new Set([...pilih].filter(k => !berhasil.has(k))))
      setGanti(false)
      await muat()
    }

    setLaporan(catat)
    setSibuk(false)
    if (catat.length && catat.every(l => l.ok)) {
      toast.success('Data induk diperbarui.')
      onSelesai?.()
    }
  }, [totalTerpilih, ganti, kbTerpilih, maTerpilih, adaKb, pilih, muat, onSelesai, tulisKodeBesar, tulisMasterAkun])

  const tampilKb = bolehKodeBesar ? hasil.kandidat.filter(k => k.tujuan === 'KODE_BESAR') : []
  const tampilMa = bolehMasterAkun ? hasil.kandidat.filter(k => k.tujuan === 'MASTER_AKUN') : []
  const tersembunyi = hasil.kandidat.length - tampilKb.length - tampilMa.length

  return (
    <div
      onClick={onTutup}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 24 }}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="blud-imp-text"
        style={{ background: 'var(--surface-card, #042C53)', borderRadius: 14, width: 'min(940px, 96vw)', maxHeight: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,.5)', overflow: 'hidden' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,.08)' }}>
          <Inbox size={17} />
          <div style={{ fontSize: 14, fontWeight: 800 }}>Salin ke Data Induk</div>
          <button onClick={onTutup} aria-label="Tutup" style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', opacity: .7 }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: 20, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {memuat && <p className="blud-imp-muted" style={{ fontSize: 12 }}>Memuat data induk…</p>}

          {!memuat && (
            <>
              <Panel judul="Yang terbaca dari baris DPA">
                <Baris label="Garis rekening">
                  {hasil.garisRekening == null
                    ? <span className="blud-imp-muted">tidak terbaca — periksa tujuan tiap baris</span>
                    : <>kode sepanjang {hasil.garisRekening} karakter{hasil.contohGaris && <> · contoh <strong style={{ fontFamily: 'var(--font-mono, monospace)' }}>{hasil.contohGaris.kode}</strong> {hasil.contohGaris.uraian}</>}</>}
                </Baris>
                <Baris label="Belum ada di induk">
                  {hasil.kandidat.length} kode
                  {hasil.sudahAda > 0 && <span className="blud-imp-muted"> · {hasil.sudahAda} sudah cocok, tidak ditawarkan</span>}
                </Baris>
                <Baris label="Pembagiannya">
                  <span className="blud-imp-muted">
                    Kode Besar cuma menampung tiga tingkat teratas yang berkode — itu batas tabelnya.
                    Yang lebih dalam selalu masuk Master Akun.
                  </span>
                </Baris>
                {hasil.ditahan.length > 0 && (
                  <Baris label="Ditahan">{hasil.ditahan.length} baris — lihat di bawah</Baris>
                )}
              </Panel>

              {hasil.kandidat.length === 0 && (
                <div className="blud-imp-badge-warn" style={{ padding: '9px 12px', borderRadius: 8, fontSize: 11.5, lineHeight: 1.6 }}>
                  Semua kode di layar ini sudah ada di data induk dengan uraian yang sama. Tidak ada yang perlu disalin.
                </div>
              )}

              {tersembunyi > 0 && (
                <div className="blud-imp-badge-warn" style={{ padding: '9px 12px', borderRadius: 8, fontSize: 11.5, lineHeight: 1.6 }}>
                  {tersembunyi} kandidat disembunyikan karena Anda tidak berhak mengubah menu tujuannya.
                </div>
              )}

              {tampilKb.length > 0 && (
                <Panel judul={`Kode Besar — ${tampilKb.length} kode`}>
                  <p className="blud-imp-muted" style={{ fontSize: 11.5, lineHeight: 1.6, marginBottom: 8 }}>
                    Kerangka yang dipakai tombol &quot;Form Baru&quot; di layar DPA. Induk wajib ikut
                    tercentang — kalau tidak, anaknya dilewati.
                  </p>
                  <div style={{ maxHeight: 240, overflowY: 'auto' }}>
                    {tampilKb.map(k => (
                      <BarisKandidat key={k.kode} k={k} dipilih={pilih.has(k.kode)}
                        onToggle={() => toggle(k.kode)}
                        onPindah={t => pindahTujuan(k.kode, t)}
                        bolehPindah={bolehMasterAkun} lawan="MASTER_AKUN" />
                    ))}
                  </div>
                  {adaKb.length > 0 && (
                    <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 10, fontSize: 11.5, lineHeight: 1.6 }}>
                      <input type="checkbox" checked={ganti} onChange={e => setGanti(e.target.checked)} style={{ marginTop: 2 }} />
                      <span>
                        <strong style={{ color: '#E24B4A' }}>Ganti seluruh isi Kode Besar</strong> — hapus {adaKb.length} baris
                        yang sekarang, sisakan hanya yang dicentang di atas.
                        {hasil.kodeBesarTakTerpakai.length > 0 && (
                          <span className="blud-imp-muted">
                            {' '}Berguna kalau berkasnya memakai konvensi lain: {hasil.kodeBesarTakTerpakai.length} kode
                            lama tidak dipakai berkas ini ({hasil.kodeBesarTakTerpakai.slice(0, 6).join(', ')}
                            {hasil.kodeBesarTakTerpakai.length > 6 ? '…' : ''}).
                          </span>
                        )}
                      </span>
                    </label>
                  )}
                </Panel>
              )}

              {tampilMa.length > 0 && (
                <Panel judul={`Master Akun — ${tampilMa.length} kode`}>
                  <p className="blud-imp-muted" style={{ fontSize: 11.5, lineHeight: 1.6, marginBottom: 8 }}>
                    Daftar yang mengisi combobox rekening di DPA &amp; Pergeseran.
                  </p>
                  <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                    {tampilMa.map(k => (
                      <BarisKandidat key={k.kode} k={k} dipilih={pilih.has(k.kode)}
                        onToggle={() => toggle(k.kode)}
                        onPindah={t => pindahTujuan(k.kode, t)}
                        bolehPindah={bolehKodeBesar} lawan="KODE_BESAR" />
                    ))}
                  </div>
                </Panel>
              )}

              {hasil.ditahan.length > 0 && (
                <Panel judul={`Ditahan — ${hasil.ditahan.length} baris`} bahaya>
                  <div style={{ maxHeight: 160, overflowY: 'auto', fontSize: 11, lineHeight: 1.7 }}>
                    {hasil.ditahan.map((d, i) => (
                      <div key={i} style={{ padding: '3px 0' }}>
                        <span style={{ fontFamily: 'var(--font-mono, monospace)' }}>{d.kode}</span>{' '}
                        {d.uraian || <em className="blud-imp-muted">(tanpa uraian)</em>}
                        <span style={{ color: '#FAC775' }}> — {d.alasan}</span>
                      </div>
                    ))}
                  </div>
                </Panel>
              )}

              {laporan && (
                <Panel judul="Hasil" bahaya={laporan.some(l => !l.ok)}>
                  {laporan.map((l, i) => (
                    <div key={i} style={{ display: 'flex', gap: 8, fontSize: 11.5, padding: '3px 0', lineHeight: 1.6 }}>
                      {!l.ok && <AlertTriangle size={13} style={{ color: '#E24B4A', flexShrink: 0, marginTop: 2 }} />}
                      <span style={{ minWidth: 90, fontWeight: 700 }}>{l.label}</span>
                      <span style={{ flex: 1, color: l.ok ? undefined : '#E24B4A' }}>{l.pesan}</span>
                    </div>
                  ))}
                  {laporan.some(l => !l.ok) && (
                    <p className="blud-imp-muted" style={{ fontSize: 11, marginTop: 8, lineHeight: 1.6 }}>
                      Dua tujuan ditulis terpisah, jadi yang berhasil tetap tersimpan. Centang yang
                      gagal masih utuh — tekan Salin lagi untuk mengulang bagian itu saja.
                    </p>
                  )}
                </Panel>
              )}
            </>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center', padding: '12px 20px', borderTop: '1px solid rgba(255,255,255,.08)' }}>
          <span className="blud-imp-muted" style={{ fontSize: 11.5, marginRight: 'auto' }}>
            {kbTerpilih.length} Kode Besar · {maTerpilih.length} Master Akun dicentang
          </span>
          <PrimaButton variant="ghost" onClick={onTutup} disabled={sibuk}>Tutup</PrimaButton>
          <PrimaButton variant="success" disabled={sibuk || memuat || !totalTerpilih} onClick={() => void jalankan()}>
            {sibuk ? 'Menyimpan…' : `Salin ${totalTerpilih} kode`}
          </PrimaButton>
        </div>
      </div>
    </div>
  )
}

function BarisKandidat({
  k, dipilih, onToggle, onPindah, bolehPindah, lawan,
}: {
  k: KandidatSalin
  dipilih: boolean
  onToggle: () => void
  onPindah: (t: TujuanSalin) => void
  bolehPindah: boolean
  lawan: TujuanSalin
}) {
  return (
    <div className={`blud-imp-row${dipilih ? ' sel' : ''}`} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '5px 4px', fontSize: 11.5 }}>
      <input type="checkbox" checked={dipilih} onChange={onToggle} style={{ marginTop: 3, flexShrink: 0 }} />
      <span style={{ fontFamily: 'var(--font-mono, monospace)', minWidth: 118, flexShrink: 0 }}>{k.kode}</span>
      <span style={{ flex: 1, minWidth: 0 }}>
        {k.uraian}
        {k.status === 'BEDA_URAIAN' && (
          <span className="blud-imp-muted"> · sekarang: &quot;{k.uraianLama}&quot;</span>
        )}
        {k.pakai > 1 && <span className="blud-imp-muted"> · {k.pakai}×</span>}
        {k.catatan.map((c, i) => (
          <div key={i} style={{ color: '#FAC775', fontSize: 10.5, lineHeight: 1.5 }}>{c}</div>
        ))}
      </span>
      {k.level && <span className="blud-imp-lv" style={{ marginTop: 2 }}>{k.level}</span>}
      {k.parentKode && (
        <span className="blud-imp-muted" style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 10, marginTop: 2, minWidth: 70 }}>
          ↳ {k.parentKode}
        </span>
      )}
      {bolehPindah && (
        <button type="button" className="blud-imp-link" style={{ marginTop: 2, flexShrink: 0 }}
          onClick={() => onPindah(lawan)}>
          pindah ke {lawan === 'KODE_BESAR' ? 'Kode Besar' : 'Master Akun'}
        </button>
      )}
    </div>
  )
}

function Panel({ judul, bahaya, children }: { judul: string; bahaya?: boolean; children: React.ReactNode }) {
  return (
    <section style={{ border: `1px solid ${bahaya ? '#E24B4A' : 'rgba(255,255,255,.10)'}`, borderRadius: 10, padding: 12 }}>
      <div className="blud-imp-dock-title" style={{ marginBottom: 8, textTransform: 'uppercase', color: bahaya ? '#E24B4A' : undefined }}>
        {judul}
      </div>
      {children}
    </section>
  )
}

function Baris({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 10, fontSize: 11.5, padding: '2px 0', lineHeight: 1.6 }}>
      <span className="blud-imp-muted" style={{ minWidth: 148 }}>{label}</span>
      <span style={{ flex: 1 }}>{children}</span>
    </div>
  )
}
