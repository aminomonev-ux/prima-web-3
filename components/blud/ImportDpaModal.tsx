'use client'
// components/blud/ImportDpaModal.tsx — pos pabean impor DPA.
// Konsep: docs/CONCEPT-export-import-dpa.md §3.7.
//
// Satu tombol, dua bentuk berkas: formulir manual (kode terpecah 11 kolom,
// hierarki dari rumus) dan unduhan PRIMA (kolom Level). Bedanya ditangani di
// parser server, bukan di sini — modal ini hanya MENAMPILKAN hasil deteksi dan
// meminta persetujuan.
//
// Yang wajib terlihat sebelum orang menekan Simpan: dari mana hierarkinya
// dibaca, selisih total berkas vs hitung ulang, baris bermasalah, dan alokasi
// realisasi yang jangkarnya akan hilang.
import { useCallback, useRef, useState } from 'react'
import { Virtuoso } from 'react-virtuoso'
import { toast } from 'sonner'
import { Upload, FileSpreadsheet, X } from 'lucide-react'
import PrimaButton from '@/components/ui/PrimaButton'
import { TIPE_LABEL } from '@/lib/blud/format'
import { tanggalHariIniWIB } from '@/lib/blud/tanggal'
// Tipe di-impor secara TYPE-ONLY (terhapus saat kompilasi); pemetanya diambil
// dari modul ringan. Mengambil keduanya dari `import-dpa.ts` akan menyeret
// parser + `schemas.ts` + `ioredis` ke bundel browser dan build Next gagal
// dengan "Module not found: Can't resolve 'dns'".
import type { BarisTerbaca, PetaKolom } from '@/lib/blud/import-dpa'
import { keDpaBarisInput } from '@/lib/blud/import-dpa-shared'

interface JangkarTerdampak {
  anggaran_key: string
  uraian: string
  jumlah_alokasi: number
  nilai: number
}

/** Bentuk `detail` pada 409 PAGU_DIBAWAH_REALISASI — cermin `BentrokPagu` di lib/blud/pagu.ts. */
interface BentrokBaris {
  kode_rekening: string
  uraian: string
  pagu_baru: number
  terserap: number
  minus: number
  hilang: boolean
}

interface HasilPreview {
  namaBerkas: string
  namaLembar: string
  barisHeader: number
  barisAkhirData: number
  kolom: PetaKolom
  baris: BarisTerbaca[]
  ditahan: Array<{ barisExcel: number; uraian: string; alasan: string }>
  totalFile: number | null
  totalHitung: number
  peringatan: string[]
  realisasiTerdampak: JangkarTerdampak[]
}

const rp =(n: number | null | undefined) => (n == null ? '—' : Number(n).toLocaleString('id-ID'))

const LABEL_SUMBER: Record<string, string> = {
  level:  'kolom Level (unduhan PRIMA — pasti)',
  rumus:  'rujukan rumus berkas (SUM/penjumlahan)',
  posisi: 'posisi kolom kode (DITEBAK — periksa pohonnya)',
}

export default function ImportDpaModal({
  tahun, onTutup, onSelesai,
}: {
  tahun: number
  onTutup: () => void
  onSelesai: (versiTanggal: string) => void
}) {
  const [sibuk, setSibuk] = useState(false)
  const [hasil, setHasil] = useState<HasilPreview | null>(null)
  const [versiTanggal, setVersiTanggal] = useState(() => tanggalHariIniWIB())
  const [paksa, setPaksa] = useState<{ pesan: string } | null>(null)
  // §4.3 — impor menulis lewat `saveDpa` yang sama, jadi ia bisa kena penolakan yang
  // sama. Tanpa panel ini 409-nya cuma jadi toast merah dan berkasnya buntu.
  const [bentrokPagu, setBentrokPagu] = useState<BentrokBaris[] | null>(null)
  const [alasanTurun, setAlasanTurun] = useState('')
  // Kedua bendera penembus disimpan di ref, BUKAN dioper sebagai argumen. Kalau satu
  // berkas memicu dua konfirmasi (baris berkurang drastis + pagu di bawah realisasi),
  // jawaban yang dioper lewat argumen hilang begitu pengguna menjawab konfirmasi yang
  // satunya — konfirmasi yang sudah dijawab muncul lagi. `alasan` dulu berbentuk
  // argumen dan kena; `force` menyusul kena karena hanya `alasan` yang dibetulkan.
  // Sekarang keduanya tidak ada di tanda tangan `simpan()` sama sekali, jadi tidak
  // ada pemanggil yang bisa lupa membawanya.
  const alasanRef = useRef<string | null>(null)
  const paksaRef = useRef(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const unggah = useCallback(async (file: File) => {
    setSibuk(true)
    setHasil(null)
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('tahun', String(tahun))
      const res = await fetch('/api/blud/dpa/import?step=preview', { method: 'POST', body: form })
      let json: { ok?: boolean; data?: HasilPreview; error?: string }
      try { json = await res.json() } catch { toast.error('Balasan server tidak terbaca.'); return }
      if (!res.ok || !json.ok || !json.data) {
        toast.error(json.error ?? 'Berkas gagal dibaca.')
        return
      }
      setHasil(json.data)
    } catch (e) {
      toast.error('Gagal mengunggah: ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setSibuk(false)
    }
  }, [tahun])

  const simpan = useCallback(async () => {
    if (!hasil) return
    setSibuk(true)
    try {
      // Kunci optimistik dipegang PER (tahun, versi_tanggal). Angka versi di layar
      // DPA milik versi yang sedang dibuka, BUKAN milik versi tujuan impor — dan
      // memakainya membuat commit selalu ditolak 409 "sudah diubah pengguna lain"
      // padahal tidak ada siapa-siapa. Yang benar: tanyakan angka versi TUJUAN
      // tepat sebelum menulis, sehingga penulis lain yang menyelinap di sela ini
      // tetap tertangkap.
      let versiTujuan = 0
      try {
        const cek = await fetch(`/api/blud/dpa?tahun=${tahun}&tanggal=${versiTanggal}`)
        const jc = await cek.json() as { ok?: boolean; version?: number }
        if (cek.ok && jc.ok && typeof jc.version === 'number') versiTujuan = jc.version
      } catch { /* versi belum ada → 0 */ }

      const rows = keDpaBarisInput(hasil.baris)
      const res = await fetch('/api/blud/dpa/import?step=commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tahun_anggaran: tahun,
          versi_tanggal: versiTanggal,
          rows,
          force: paksaRef.current,
          expected_version: versiTujuan,
          turunkan_paksa: !!alasanRef.current,
          alasan_turun: alasanRef.current ?? undefined,
        }),
      })
      let json: { ok?: boolean; error?: string; code?: string; message?: string; detail?: BentrokBaris[] }
      try { json = await res.json() } catch { toast.error('Balasan server tidak terbaca.'); return }
      if (!res.ok || !json.ok) {
        if (json.code === 'SAFETY_THRESHOLD') {
          setPaksa({ pesan: json.error ?? 'Baris berkurang drastis.' })
          return
        }
        if (json.code === 'PAGU_DIBAWAH_REALISASI') {
          setAlasanTurun('')
          setBentrokPagu(json.detail ?? [])
          return
        }
        toast.error(json.error ?? 'Gagal menyimpan hasil impor.')
        return
      }
      toast.success(json.message ?? 'Impor selesai.')
      setPaksa(null); setBentrokPagu(null)
      onSelesai(versiTanggal)
    } catch (e) {
      toast.error('Gagal menyimpan: ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      // `setPaksa(null)` dulu ada di sini — dan itu membatalkan panel yang baru saja
      // dipasang cabang SAFETY_THRESHOLD beberapa baris di atas, karena React
      // menggabung keduanya jadi satu render. Akibatnya panel konfirmasinya tidak
      // pernah muncul. Pembersihan sekarang di jalur sukses & tombol Batal.
      setSibuk(false)
    }
  }, [hasil, tahun, versiTanggal, onSelesai])

  const bermasalah = hasil?.baris.filter(b => b.catatan.length) ?? []
  const selisih = hasil && hasil.totalFile != null ? hasil.totalFile - hasil.totalHitung : null
  const kedalaman = hitungKedalaman(hasil?.baris ?? [])

  return (
    <div
      onClick={onTutup}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 24 }}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="blud-imp-text"
        style={{ background: 'var(--surface-card, #042C53)', borderRadius: 14, width: 'min(1040px, 96vw)', maxHeight: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,.5)', overflow: 'hidden' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,.08)' }}>
          <FileSpreadsheet size={17} />
          <div style={{ fontSize: 14, fontWeight: 800 }}>Impor DPA {tahun}</div>
          <button onClick={onTutup} aria-label="Tutup" style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', opacity: .7 }}>
            <X size={18} />
          </button>
        </div>

        {/* Input sengaja SELALU terpasang, bukan hanya saat berkas belum dipilih:
            kalau disembunyikan setelah pratinjau muncul, satu-satunya cara
            mencoba berkas lain adalah menutup lalu membuka lagi modalnya. */}
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx"
          style={{ display: 'none' }}
          onChange={e => { const f = e.target.files?.[0]; if (f) void unggah(f) }}
        />

        <div style={{ padding: 20, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {!hasil && (
            <div style={{ textAlign: 'center', padding: '28px 12px' }}>
              <p className="blud-imp-muted" style={{ fontSize: 12, lineHeight: 1.7, marginBottom: 16 }}>
                Pilih berkas <strong>.xlsx</strong> — boleh formulir DPA dari provinsi, boleh hasil
                unduhan PRIMA. Hierarkinya dibaca dari rumus atau kolom Level di dalam berkas;
                <strong> tidak ada yang ditulis ke basis data</strong> sampai Anda menekan Simpan.
              </p>
              <PrimaButton variant="purple" iconLeft={<Upload size={14} />} disabled={sibuk}
                onClick={() => inputRef.current?.click()}>
                {sibuk ? 'Membaca berkas…' : 'Pilih Berkas'}
              </PrimaButton>
            </div>
          )}

          {hasil && (
            <>
              <Panel judul="Yang terbaca dari berkas">
                <Baris label="Berkas">{hasil.namaBerkas}</Baris>
                <Baris label="Lembar">&quot;{hasil.namaLembar}&quot; · header baris {hasil.barisHeader} · data s/d baris {hasil.barisAkhirData}</Baris>
                <Baris label="Sumber hierarki">
                  <span style={{ color: hasil.baris[0]?.sumberHierarki === 'posisi' ? '#FAC775' : undefined }}>
                    {LABEL_SUMBER[hasil.baris[0]?.sumberHierarki ?? ''] ?? '—'}
                  </span>
                </Baris>
                <Baris label="Kolom">
                  kode {hasil.kolom.kode.awal}–{hasil.kolom.kode.akhir} · uraian {hasil.kolom.uraian.join(',')}
                  {' '}· vol {hasil.kolom.vol ?? '—'} · satuan {hasil.kolom.satuan ?? '—'}
                  {' '}· harga {hasil.kolom.harga ?? '—'} · jumlah {hasil.kolom.jumlah}
                  {hasil.kolom.level ? ` · level ${hasil.kolom.level}` : ''}
                  {hasil.kolom.jangkar ? ` · jangkar ${hasil.kolom.jangkar}` : ''}
                </Baris>
              </Panel>

              <Panel judul="Neraca">
                <Baris label="Baris terbaca">{hasil.baris.length}{hasil.ditahan.length ? ` · ${hasil.ditahan.length} ditahan` : ''}</Baris>
                <Baris label="Total menurut berkas">{rp(hasil.totalFile)}</Baris>
                <Baris label="Total hitung ulang">{rp(hasil.totalHitung)}</Baris>
                <Baris label="Selisih">
                  <strong style={{ color: selisih ? '#E24B4A' : '#1D9E75' }}>
                    {selisih == null ? 'tidak bisa dibandingkan' : selisih === 0 ? 'nihil — cocok persis' : rp(selisih)}
                  </strong>
                </Baris>
              </Panel>

              {hasil.peringatan.map((p, i) => (
                <div key={i} className="blud-imp-badge-warn" style={{ padding: '9px 12px', borderRadius: 8, fontSize: 11.5, lineHeight: 1.6 }}>
                  {p}
                </div>
              ))}

              {hasil.realisasiTerdampak.length > 0 && (
                <Panel judul={`Realisasi terdampak — ${hasil.realisasiTerdampak.length} jangkar`} bahaya>
                  <p style={{ fontSize: 11.5, lineHeight: 1.6, marginBottom: 8 }}>
                    Alokasi realisasi berikut menempel pada baris anggaran yang <strong>tidak ada</strong> di
                    berkas impor. Setelah impor, alokasinya tidak lagi menunjuk baris mana pun.
                  </p>
                  <div style={{ maxHeight: 150, overflowY: 'auto', fontSize: 11 }}>
                    {hasil.realisasiTerdampak.slice(0, 40).map(t => (
                      <div key={t.anggaran_key} style={{ display: 'flex', gap: 8, padding: '3px 0' }}>
                        <span style={{ flex: 1 }}>{t.uraian}</span>
                        <span className="blud-imp-muted">{t.jumlah_alokasi} alokasi</span>
                        <span style={{ fontFamily: 'monospace' }}>{rp(t.nilai)}</span>
                      </div>
                    ))}
                  </div>
                </Panel>
              )}

              {bermasalah.length > 0 && (
                <Panel judul={`Baris yang perlu diperiksa — ${bermasalah.length}`}>
                  <div style={{ maxHeight: 190, overflowY: 'auto', fontSize: 11, lineHeight: 1.6 }}>
                    {bermasalah.slice(0, 60).map(b => (
                      <div key={b.barisExcel} style={{ padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,.05)' }}>
                        <span className="blud-imp-muted">b.{b.barisExcel}</span>{' '}
                        <strong>{b.uraian || '(tanpa uraian)'}</strong>
                        {b.catatan.map((c, i) => <div key={i} style={{ paddingLeft: 14, color: '#FAC775' }}>{c}</div>)}
                      </div>
                    ))}
                  </div>
                </Panel>
              )}

              {/* SELURUH baris ditampilkan, bukan sepotong. Versi sebelumnya
                  memotong di 300 baris — dan pada berkas 2025 itu berarti
                  seluruh blok "Belanja Modal" (41 baris, mulai urutan ke-348)
                  tidak pernah terlihat di panel yang justru gunanya memeriksa
                  pohon. Divirtualisasi supaya ribuan baris tetap ringan. */}
              <Panel judul={`Pratinjau pohon — ${hasil.baris.length} baris`}>
                <Virtuoso
                  style={{ height: 280 }}
                  data={hasil.baris}
                  defaultItemHeight={18}
                  itemContent={(_i, b) => (
                    <div style={{ display: 'flex', gap: 8, padding: '2px 0', fontSize: 11 }}>
                      {/* Nama internal (`KETUA-KELOMPOK-B`) tidak dikenal orang
                          keuangan — pakai label yang sama dengan tombol filter
                          level di layar DPA. */}
                      <span className="blud-imp-lv" style={{ minWidth: 62, whiteSpace: 'nowrap' }}>
                        {TIPE_LABEL[b.tipe_baris] ?? b.tipe_baris}
                      </span>
                      <span style={{ flex: 1, paddingLeft: (kedalaman.get(b.barisExcel) ?? 0) * 14 }}>
                        {b.uraian || <em className="blud-imp-muted">(tanpa uraian)</em>}
                      </span>
                      <span style={{ fontFamily: 'monospace', minWidth: 110, textAlign: 'right' }}>{rp(b.jumlahHitung)}</span>
                    </div>
                  )}
                />
              </Panel>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <label style={{ fontSize: 11.5 }} className="blud-imp-muted">Simpan sebagai versi tanggal</label>
                <input type="date" className="blud-imp-input" value={versiTanggal}
                  onChange={e => setVersiTanggal(e.target.value)} style={{ padding: '5px 8px', fontSize: 12 }} />
              </div>
            </>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', padding: '12px 20px', borderTop: '1px solid rgba(255,255,255,.08)' }}>
          <PrimaButton variant="ghost" onClick={onTutup} disabled={sibuk}>Batal</PrimaButton>
          {hasil && (
            <PrimaButton variant="ghost" iconLeft={<Upload size={13} />} disabled={sibuk}
              onClick={() => inputRef.current?.click()}>
              Ganti Berkas
            </PrimaButton>
          )}
          {hasil && (
            <PrimaButton variant="primary" disabled={sibuk || !versiTanggal}
              onClick={() => { alasanRef.current = null; paksaRef.current = false; void simpan() }}>
              {sibuk ? 'Menyimpan…' : `Simpan ${hasil.baris.length} baris`}
            </PrimaButton>
          )}
        </div>

        {paksa && (
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.7)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div className="blud-imp-text" style={{ background: 'var(--surface-card, #042C53)', border: '2px solid #E24B4A', borderRadius: 14, padding: 22, maxWidth: 460 }}>
              <div style={{ fontWeight: 800, color: '#E24B4A', marginBottom: 8, fontSize: 14 }}>Baris berkurang drastis</div>
              <p style={{ fontSize: 12, lineHeight: 1.7, marginBottom: 14 }}>{paksa.pesan}</p>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <PrimaButton variant="ghost" onClick={() => setPaksa(null)} disabled={sibuk}>Batal</PrimaButton>
                <PrimaButton variant="danger" onClick={() => { paksaRef.current = true; void simpan() }} disabled={sibuk}>Ya, tetap simpan</PrimaButton>
              </div>
            </div>
          </div>
        )}

        {/* §4.3 — sama seperti simpan manual: boleh ditembus, tapi alasannya masuk
            audit log. Angka ditampilkan supaya orang tahu persis baris mana yang minus. */}
        {bentrokPagu && (
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
            <div className="blud-imp-text" style={{ background: 'var(--surface-card, #042C53)', border: '2px solid #E24B4A', borderRadius: 14, padding: 22, maxWidth: 620, width: '100%', maxHeight: '90%', overflowY: 'auto' }}>
              <div style={{ fontWeight: 800, color: '#E24B4A', marginBottom: 8, fontSize: 14 }}>
                Pagu turun di bawah realisasi ({bentrokPagu.length} baris)
              </div>
              <p style={{ fontSize: 12, lineHeight: 1.7, marginBottom: 12 }}>
                Uangnya sudah keluar. Menyimpan hasil impor ini membuat baris di bawah jadi minus
                di layar Realisasi sampai diperbaiki.
              </p>

              <div style={{ maxHeight: 220, overflowY: 'auto', marginBottom: 14 }}>
                <table className="blud-imp-tbl" style={{ width: '100%', fontSize: 11.5 }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left' }}>Kode</th>
                      <th style={{ textAlign: 'left' }}>Uraian</th>
                      <th style={{ textAlign: 'right' }}>Pagu baru</th>
                      <th style={{ textAlign: 'right' }}>Terserap</th>
                      <th style={{ textAlign: 'right' }}>Minus</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bentrokPagu.map((d, i) => (
                      <tr key={i}>
                        <td style={{ fontFamily: 'var(--font-mono, monospace)' }}>{d.kode_rekening}</td>
                        <td>{d.uraian}{d.hilang && ' · baris dihapus'}</td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono, monospace)' }}>{rp(d.pagu_baru)}</td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono, monospace)' }}>{rp(d.terserap)}</td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono, monospace)', color: '#E24B4A' }}>{rp(d.minus)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <label style={{ display: 'block', marginBottom: 14 }}>
                <span className="blud-imp-muted" style={{ fontSize: 11.5 }}>
                  Alasan (wajib, minimal 10 karakter — tercatat di audit log)
                </span>
                <textarea className="blud-imp-input" rows={3} value={alasanTurun}
                  onChange={e => setAlasanTurun(e.target.value)}
                  style={{ width: '100%', marginTop: 6 }}
                  placeholder="Contoh: pagu dikoreksi mengikuti DPA definitif atas disposisi Direktur tanggal …" />
              </label>

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <PrimaButton variant="ghost" onClick={() => setBentrokPagu(null)} disabled={sibuk}>Batal</PrimaButton>
                <PrimaButton variant="danger" disabled={sibuk || alasanTurun.trim().length < 10}
                  onClick={() => { alasanRef.current = alasanTurun.trim(); setBentrokPagu(null); void simpan() }}>
                  Tetap Lanjut
                </PrimaButton>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/** Kedalaman untuk indentasi pratinjau — dari rantai induk, bukan dari tipe. */
function hitungKedalaman(baris: BarisTerbaca[]): Map<number, number> {
  const induk = new Map(baris.map(b => [b.barisExcel, b.indukBarisExcel]))
  const hasil = new Map<number, number>()
  for (const b of baris) {
    let d = 0
    let p = b.indukBarisExcel
    let jaga = 0
    while (p != null && jaga++ < 32) { d++; p = induk.get(p) ?? null }
    hasil.set(b.barisExcel, d)
  }
  return hasil
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
