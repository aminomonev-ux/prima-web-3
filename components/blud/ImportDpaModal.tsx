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
import { toast } from 'sonner'
import { Upload, FileSpreadsheet, X } from 'lucide-react'
import PrimaButton from '@/components/ui/PrimaButton'
import { TIPE_LABEL } from '@/lib/blud/format'
import { keDpaBarisInput, type BarisTerbaca, type PetaKolom } from '@/lib/blud/import-dpa'

interface JangkarTerdampak {
  anggaran_key: string
  uraian: string
  jumlah_alokasi: number
  nilai: number
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

const MAKS_PRATINJAU = 300

const rp = (n: number | null | undefined) => (n == null ? '—' : Number(n).toLocaleString('id-ID'))

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
  const [versiTanggal, setVersiTanggal] = useState(() => new Date().toISOString().slice(0, 10))
  const [paksa, setPaksa] = useState<{ pesan: string } | null>(null)
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

  const simpan = useCallback(async (dipaksa: boolean) => {
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
          force: dipaksa,
          expected_version: versiTujuan,
        }),
      })
      let json: { ok?: boolean; error?: string; code?: string; message?: string }
      try { json = await res.json() } catch { toast.error('Balasan server tidak terbaca.'); return }
      if (!res.ok || !json.ok) {
        if (json.code === 'SAFETY_THRESHOLD') {
          setPaksa({ pesan: json.error ?? 'Baris berkurang drastis.' })
          return
        }
        toast.error(json.error ?? 'Gagal menyimpan hasil impor.')
        return
      }
      toast.success(json.message ?? 'Impor selesai.')
      onSelesai(versiTanggal)
    } catch (e) {
      toast.error('Gagal menyimpan: ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setSibuk(false)
      setPaksa(null)
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

        <div style={{ padding: 20, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {!hasil && (
            <div style={{ textAlign: 'center', padding: '28px 12px' }}>
              <p className="blud-imp-muted" style={{ fontSize: 12, lineHeight: 1.7, marginBottom: 16 }}>
                Pilih berkas <strong>.xlsx</strong> — boleh formulir DPA dari provinsi, boleh hasil
                unduhan PRIMA. Hierarkinya dibaca dari rumus atau kolom Level di dalam berkas;
                <strong> tidak ada yang ditulis ke basis data</strong> sampai Anda menekan Simpan.
              </p>
              <input
                ref={inputRef}
                type="file"
                accept=".xlsx"
                style={{ display: 'none' }}
                onChange={e => { const f = e.target.files?.[0]; if (f) void unggah(f) }}
              />
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

              <Panel judul={`Pratinjau pohon${hasil.baris.length > MAKS_PRATINJAU ? ` — ${MAKS_PRATINJAU} baris pertama dari ${hasil.baris.length}` : ''}`}>
                <div style={{ maxHeight: 260, overflowY: 'auto', fontSize: 11 }}>
                  {hasil.baris.slice(0, MAKS_PRATINJAU).map(b => (
                    <div key={b.barisExcel} style={{ display: 'flex', gap: 8, padding: '2px 0' }}>
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
                  ))}
                </div>
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
            <PrimaButton variant="primary" disabled={sibuk || !versiTanggal} onClick={() => void simpan(false)}>
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
                <PrimaButton variant="danger" onClick={() => void simpan(true)} disabled={sibuk}>Ya, tetap simpan</PrimaButton>
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
