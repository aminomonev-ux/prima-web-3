'use client'
// components/blud/ImportDpaModal.tsx — pos pabean impor DPA.
// Konsep: docs/konsep/blud/CONCEPT-export-import-dpa.md §3.7.
//
// Satu tombol, dua bentuk berkas: formulir manual (kode terpecah 11 kolom,
// hierarki dari rumus) dan unduhan PRIMA (kolom Level). Bedanya ditangani di
// parser server, bukan di sini — modal ini hanya MENAMPILKAN hasil deteksi dan
// meminta persetujuan.
//
// Modal ini TIDAK MENULIS APA PUN (2026-08-27). Dulu ia punya tanggal versinya
// sendiri — bawaannya "hari ini" — dan tombolnya memanggil `step=commit` yang
// langsung menulis DB. Akibatnya memilih "Periode Juli" di halaman lalu
// mengimpor menghasilkan versi Agustus, dan bisa menimpa versi bulan berjalan
// yang sudah berisi. Sekarang hasil impor dioper ke form lewat `onTerapkan`,
// dan yang menulis hanya tombol Simpan di halaman DPA — satu tombol, satu
// tanggal, satu set pagar.
//
// Yang wajib terlihat sebelum orang memasukkannya ke form: dari mana
// hierarkinya dibaca, selisih total berkas vs hitung ulang, baris bermasalah,
// dan alokasi realisasi yang jangkarnya akan hilang.
import { useCallback, useMemo, useRef, useState } from 'react'
import { Virtuoso } from 'react-virtuoso'
import { toast } from 'sonner'
import { Upload, FileSpreadsheet, X } from 'lucide-react'
import PrimaButton from '@/components/ui/PrimaButton'
import { confirmDialog } from '@/components/ui/ConfirmDialog'
import { TIPE_LABEL } from '@/lib/blud/format'
import { formatSelisih, kalimatTerbaca, putusanImpor } from '@/lib/blud/perubahan'
import type { BandingImporBalik } from '@/lib/blud/impor-balik'
import { formatTanggalId } from '@/lib/blud/tanggal'
import type { DpaBarisInput } from '@/types'
// Tipe di-impor secara TYPE-ONLY (terhapus saat kompilasi); pemetanya diambil
// dari modul ringan. Mengambil keduanya dari `import-dpa.ts` akan menyeret
// parser + `schemas.ts` + `ioredis` ke bundel browser dan build Next gagal
// dengan "Module not found: Can't resolve 'dns'".
import type { BarisDiLuarRumus, BarisTerbaca, PetaKolom } from '@/lib/blud/import-dpa'
import type { PerbaikanImpor, SumberSelisih } from '@/lib/blud/import-rapikan'
import { keDpaBarisInput } from '@/lib/blud/import-dpa-shared'
import { recalcDpaJumlah } from '@/lib/blud/recalc'

interface JangkarTerdampak {
  anggaran_key: string
  uraian: string
  jumlah_alokasi: number
  nilai: number
}

/**
 * Jejak asal-usul yang ikut ke body Simpan — cermin `AsalImporSchema` di
 * `lib/blud/schemas.ts`. Gunanya satu: memperpanjang baris audit `BLUD_SAVE_DPA`,
 * pengganti `BLUD_DPA_IMPORT_COMMIT` yang ikut hilang bersama jalur tulisnya.
 */
export type AsalImpor = {
  berkas: string; lembar: string; baris: number
  /** Impor-balik (§11.3): versi tersimpan yang isinya diganti, dan simpanan asal berkasnya. */
  ke_versi_terbuka?: string
  simpanan_berkas?: number | null
  /** Formulir luar di atas versi terbuka (CONCEPT-blud-impor-formulir-baru §2). */
  di_atas_versi?: string
  jangkar_dipasangkan?: number
}

/** Cermin `GantiIsi` di route impor. */
interface GantiIsi {
  versi: string
  simpananKini: number
  sasaranSama: boolean
  pasangan: Record<number, string>
  dipasangkan: number
  berebut: number
  tolak: string | null
}

/** Cermin `ImporBalik` di route impor. */
interface ImporBalik {
  versi: string
  simpananKini: number
  simpananBerkas: number | null
  tolak: string | null
  peringatan: string[]
  rows: DpaBarisInput[] | null
  banding: BandingImporBalik | null
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
  perbaikan: PerbaikanImpor[]
  sumberSelisih: SumberSelisih[]
  diLuarRumus: BarisDiLuarRumus[]
  realisasiTerdampak: JangkarTerdampak[]
  /** Kop "DPA PERUBAHAN KE-n" berkas (format Ringkas); null = murni. */
  perubahanKe: number | null
  versiKop: string | null
  /** Babak sasaran Simpan menurut server — null kalau sasaran tak terkirim. */
  tujuan: { babak: number | null; pembanding: { versi: string; total: number } | null } | null
  unduhan: { tahun: number; versi: string; simpananKe: number } | null
  /** Hanya bila modal dibuka di atas versi tersimpan. */
  imporBalik: ImporBalik | null
  gantiIsi: GantiIsi | null
}

const rp =(n: number | null | undefined) => (n == null ? '—' : Number(n).toLocaleString('id-ID'))

const LABEL_SUMBER: Record<string, string> = {
  level:  'rumus penjumlahan + kolom Level (unduhan PRIMA)',
  rumus:  'rujukan rumus berkas (SUM/penjumlahan)',
  posisi: 'posisi kolom kode (DITEBAK — periksa pohonnya)',
}

export default function ImportDpaModal({
  tahun, periodeLabel, sasaran, versiTerbuka, onTutup, onTerapkan,
}: {
  tahun: number
  /** Nama periode yang akan jadi tujuan Simpan — ditampilkan apa adanya supaya
   *  tujuannya terbaca SEBELUM berkas masuk form, bukan lewat toast sesudahnya. */
  periodeLabel: string
  /** Tanggal sasaran Simpan (`sasaranSimpan`) — server menilai babaknya (§11.2). */
  sasaran: string
  /**
   * Versi tersimpan yang sedang terbuka di layar ('' = tidak ada). Excel unduhan PRIMA
   * (ber-Jangkar) dari versi itu DIPASANG di atasnya (impor-balik §11.3); formulir lain
   * MENGGANTI isi tabel dengan jangkar yang dipasangkan server (CONCEPT-blud-impor-formulir-baru §2).
   */
  versiTerbuka: string
  onTutup: () => void
  /** `simpananKini` = angka kunci versi terbuka yang dibaca server saat pratinjau (L77). */
  onTerapkan: (rows: DpaBarisInput[], asal: AsalImpor, simpananKini?: number) => void
}) {
  const [sibuk, setSibuk] = useState(false)
  const [hasil, setHasil] = useState<HasilPreview | null>(null)
  /** Baris "tidak dihitung rumus Excel" (K2) yang dipilih untuk dilewati. */
  const [dilewati, setDilewati] = useState<Set<number>>(() => new Set())
  const inputRef = useRef<HTMLInputElement>(null)

  const unggah = useCallback(async (file: File) => {
    setSibuk(true)
    setHasil(null)
    setDilewati(new Set())
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('tahun', String(tahun))
      form.append('sasaran', sasaran)
      if (versiTerbuka) form.append('versi_terbuka', versiTerbuka)
      const res = await fetch('/api/blud/dpa/import?step=preview', { method: 'POST', body: form })
      let json: { ok?: boolean; data?: HasilPreview; error?: string }
      try { json = await res.json() } catch { toast.error('Jawaban dari server tidak terbaca. Coba lagi sebentar lagi.'); return }
      if (!res.ok || !json.ok || !json.data) {
        toast.error(json.error ?? 'Berkas gagal dibaca.')
        return
      }
      setHasil(json.data)
    } catch (e) {
      toast.error('Berkas gagal diunggah: ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setSibuk(false)
    }
  }, [tahun, sasaran, versiTerbuka])

  const putusan = useMemo(() => (hasil?.tujuan
    ? putusanImpor({
        perubahanKe: hasil.perubahanKe,
        babakSasaran: hasil.tujuan.babak,
        // Tanggal konkret, bukan `periodeLabel`: "bulan berjalan (hari ini)" di dalam kurung
        // kalimat putusan jadi "((…))" (ketahuan saat dicoba di aplikasi).
        sasaranLabel: formatTanggalId(sasaran),
        totalBerkas: hasil.totalHitung,
        pembanding: hasil.tujuan.pembanding,
        fmt: n => `Rp ${rp(n)}`,
      })
    : { jenis: 'boleh' as const }), [hasil, sasaran])

  // §11.3 di atas §11.2: penolakan dari salah satunya cukup; peringatan keduanya
  // ditanyakan bersama dalam SATU dialog, bukan dua dialog beruntun yang dilatih diklik.
  const { balik, ganti, tolak, peringatan, barisMasuk } = useMemo(() => {
    const b = hasil?.imporBalik ?? null
    const g = hasil?.gantiIsi ?? null
    return {
      balik: b,
      ganti: g,
      tolak: b?.tolak ?? g?.tolak ?? (putusan.jenis === 'tolak' ? putusan.pesan : null),
      peringatan: [
        ...(b?.peringatan ?? []),
        ...(g?.sasaranSama
          ? [`Isi versi ${formatTanggalId(g.versi)} akan diganti saat Simpan. Isi lamanya tetap bisa diambil kembali dari Riwayat Simpan.`]
          : []),
        ...(putusan.jenis === 'peringatan' ? [putusan.pesan] : []),
      ],
      barisMasuk: b?.rows ?? null,
    }
  }, [hasil, putusan])

  /**
   * Baris berkas yang benar-benar dimasukkan: tanpa baris yang dilewati (beserta
   * turunannya), dan — untuk formulir di atas versi terbuka — dengan jangkar versi itu
   * terpasang supaya realisasi tidak kehilangan posnya.
   */
  const barisDipakai = useMemo(() => {
    if (!hasil) return []
    const buang = new Set(dilewati)
    let tambah = buang.size > 0
    while (tambah) {
      tambah = false
      for (const b of hasil.baris) {
        if (!buang.has(b.barisExcel) && b.indukBarisExcel != null && buang.has(b.indukBarisExcel)) {
          buang.add(b.barisExcel)
          tambah = true
        }
      }
    }
    return hasil.baris
      .filter(b => !buang.has(b.barisExcel))
      .map(b => {
        const key = ganti?.pasangan[b.barisExcel]
        return key && !b.jangkar ? { ...b, jangkar: key } : b
      })
  }, [hasil, dilewati, ganti])

  /** Baris pratinjau + total, dihitung ulang tanpa baris yang dilewati. */
  const { pratinjau, totalTampil } = useMemo(() => {
    if (!hasil) return { pratinjau: [] as BarisTerbaca[], totalTampil: 0 }
    if (!dilewati.size) return { pratinjau: hasil.baris, totalTampil: hasil.totalHitung }
    const hitung = recalcDpaJumlah(keDpaBarisInput(barisDipakai))
    return {
      pratinjau: barisDipakai.map((b, i) => ({ ...b, jumlahHitung: hitung[i]?.jumlah ?? b.jumlahHitung })),
      totalTampil: hitung.filter(r => !r.parent_id).reduce((s, r) => s + (r.jumlah ?? 0), 0),
    }
  }, [hasil, dilewati, barisDipakai])

  /**
   * Induk yang selisihnya SELURUHNYA berasal dari baris "tidak dihitung rumus" yang
   * sudah dilewati — selisih itu sudah beres, catatannya tidak perlu ditampilkan lagi.
   */
  const indukBeres = useMemo(() => {
    const beres = new Set<number>()
    for (const s of hasil?.sumberSelisih ?? []) {
      const diBawah = (hasil?.diLuarRumus ?? []).filter(d => d.indukBarisExcel === s.barisExcel)
      if (!diBawah.length || !diBawah.every(d => dilewati.has(d.barisExcel))) continue
      if (Math.abs(s.residu + diBawah.reduce((t, d) => t + d.nilai, 0)) < 0.5) beres.add(s.barisExcel)
    }
    return beres
  }, [hasil, dilewati])

  /**
   * Tidak ada permintaan jaringan di sini — hasil pratinjau langsung dioper ke
   * form. Seluruh pemeriksaan berat (pohon, jangkar, ambang penurunan baris,
   * pagu di bawah realisasi, kunci optimistik) tetap berjalan, tapi di tombol
   * Simpan halaman DPA. Menaruhnya di dua tempat pernah membuat satu pagar
   * (`entri_historis`) terpasang di satu jalur saja.
   */
  const terapkan = useCallback(async () => {
    if (!hasil || tolak) return
    // §11.2/§11.3 "peringatan dulu" — ditanyakan di depan tombol, bukan sekadar
    // tertulis di panel yang bisa terlewat di bawah pratinjau pohon.
    if (peringatan.length && !(await confirmDialog({
      title: balik || ganti?.sasaranSama ? 'Periksa sebelum mengganti isi versi ini' : 'Jenis berkas tidak cocok dengan tujuan Simpan',
      message: peringatan.join('\n\n'),
      confirmLabel: 'Tetap Masukkan ke Form',
      variant: 'warning',
    }))) return
    const asal: AsalImpor = {
      berkas: hasil.namaBerkas.slice(0, 120),
      lembar: hasil.namaLembar.slice(0, 60),
      baris:  barisDipakai.length,
    }
    // Impor-balik memasang GABUNGAN buatan server (jangkar → row_id versi, baris yang
    // hilang mengikuti aturan hapus §10), bukan baris berkas apa adanya.
    if (balik && barisMasuk) {
      onTerapkan(barisMasuk, { ...asal, ke_versi_terbuka: balik.versi, simpanan_berkas: balik.simpananBerkas }, balik.simpananKini)
    } else if (ganti) {
      const dipasangkan = barisDipakai.filter(b => ganti.pasangan[b.barisExcel]).length
      onTerapkan(keDpaBarisInput(barisDipakai), { ...asal, di_atas_versi: ganti.versi, jangkar_dipasangkan: dipasangkan }, ganti.simpananKini)
    } else {
      onTerapkan(keDpaBarisInput(barisDipakai), asal)
    }
  }, [hasil, tolak, peringatan, balik, ganti, barisMasuk, barisDipakai, onTerapkan])

  const bermasalah = (hasil?.baris ?? [])
    .filter(b => !dilewati.has(b.barisExcel))
    .map(b => (indukBeres.has(b.barisExcel) ? { ...b, catatan: b.catatan.filter(c => !c.startsWith('Angka di berkas')) } : b))
    .filter(b => b.catatan.length)
  const sisaSelisih = (hasil?.sumberSelisih ?? []).filter(s => !indukBeres.has(s.barisExcel))
  const selisih = hasil && hasil.totalFile != null ? hasil.totalFile - totalTampil : null
  // K2: bagian selisih yang dijelaskan baris "tidak dihitung rumus Excel" yang tetap dimasukkan.
  const diLuarAktif = (hasil?.diLuarRumus ?? []).filter(d => !dilewati.has(d.barisExcel))
  const nilaiDiLuar = diLuarAktif.reduce((s, d) => s + d.nilai, 0)
  const selisihTerjelaskan = selisih != null && selisih !== 0 && nilaiDiLuar !== 0
    && Math.abs(selisih + nilaiDiLuar) < 0.5
  const kedalaman = hitungKedalaman(pratinjau)

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
              {versiTerbuka ? (
                <p className="blud-imp-muted" style={{ fontSize: 12, lineHeight: 1.7, marginBottom: 16 }}>
                  Versi <strong>{formatTanggalId(versiTerbuka)}</strong> sedang terbuka. Excel unduhan PRIMA dari versi ini
                  dipasang di atas versi ini dan perubahannya ditampilkan dulu. Formulir lain mengganti isi tabel —
                  versi {formatTanggalId(versiTerbuka)} tidak berubah, dan saat Simpan isinya jadi versi{' '}
                  {sasaran === versiTerbuka ? `${formatTanggalId(sasaran)} (isi versi ini diganti)` : `baru ${formatTanggalId(sasaran)}`}.
                  {' '}<strong>Tidak ada yang ditulis ke basis data</strong> sampai Anda menekan Simpan.
                </p>
              ) : (
                <p className="blud-imp-muted" style={{ fontSize: 12, lineHeight: 1.7, marginBottom: 16 }}>
                  Pilih berkas <strong>.xlsx</strong> — boleh formulir DPA dari provinsi, boleh hasil
                  unduhan PRIMA. Hierarkinya dibaca dari rumus atau kolom Level di dalam berkas;
                  <strong> tidak ada yang ditulis ke basis data</strong> sampai Anda menekan Simpan.
                </p>
              )}
              <PrimaButton variant="purple" iconLeft={<Upload size={14} />} disabled={sibuk}
                onClick={() => inputRef.current?.click()}>
                {sibuk ? 'Membaca berkas…' : 'Pilih Berkas'}
              </PrimaButton>
            </div>
          )}

          {hasil && (
            <>
              {tolak && (
                <Panel judul="Berkas ini tidak bisa dimasukkan" bahaya>
                  <p style={{ fontSize: 11.5, lineHeight: 1.6 }}>{tolak}</p>
                </Panel>
              )}
              {/* Kelas peringatan modal ini (berpasangan tema terang), bukan warna sebaris:
                  kuning #FAC775 di atas latar terang #FAFAFA nyaris tak terbaca. */}
              {!tolak && peringatan.map(p => (
                <div key={p} className="blud-imp-badge-warn" role="status" style={{ padding: '9px 12px', borderRadius: 8, fontSize: 11.5, lineHeight: 1.6 }}>
                  <strong>Periksa dulu.</strong> {p}
                </div>
              ))}

              {balik?.banding && <PanelBanding versi={balik.versi} simpananKini={balik.simpananKini} banding={balik.banding} />}

              {ganti && !ganti.tolak && (
                <Panel judul="Berkas ini mengganti isi tabel">
                  <p style={{ fontSize: 11.5, lineHeight: 1.6 }}>
                    {ganti.sasaranSama
                      ? <>Isi versi <strong>{formatTanggalId(ganti.versi)}</strong> diganti isi berkas ini saat Anda menekan Simpan. Isi lamanya tetap bisa diambil kembali dari Riwayat Simpan.</>
                      : <>Versi <strong>{formatTanggalId(ganti.versi)}</strong> tidak berubah. Saat Simpan, isi berkas ini jadi versi baru <strong>{formatTanggalId(sasaran)}</strong>.</>}
                  </p>
                  <p className="blud-imp-muted" style={{ fontSize: 11, lineHeight: 1.6, marginTop: 6 }}>
                    {ganti.dipasangkan} dari {hasil.baris.length} baris berkas punya pasangan di versi {formatTanggalId(ganti.versi)}
                    {' '}(kode rekening dan uraian sama), jadi belanja yang sudah tercatat tetap menempel ke barisnya.
                    {ganti.berebut > 0 && ` ${ganti.berebut} baris tidak dipasangkan karena calonnya kembar — dianggap baris baru.`}
                  </p>
                </Panel>
              )}

              <Panel judul="Yang terbaca dari berkas">
                <Baris label="Terbaca">
                  {kalimatTerbaca({
                    perubahanKe: hasil.perubahanKe, versiKop: hasil.versiKop,
                    unduhanPrima: hasil.kolom.jangkar != null, baris: hasil.baris.length,
                    unduhan: hasil.unduhan,
                  })}
                </Baris>
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
                  {hasil.kolom.jangkar ? ` · penanda baris ${hasil.kolom.jangkar}` : ''}
                </Baris>
              </Panel>

              <Panel judul="Neraca">
                <Baris label="Baris terbaca">{hasil.baris.length}{hasil.ditahan.length ? ` · ${hasil.ditahan.length} ditahan` : ''}</Baris>
                <Baris label="Total menurut berkas">{rp(hasil.totalFile)}</Baris>
                <Baris label="Total hitung ulang">{rp(totalTampil)}</Baris>
                <Baris label="Selisih">
                  <strong style={{ color: selisih && !selisihTerjelaskan ? '#E24B4A' : '#1D9E75' }}>
                    {selisih == null
                      ? 'tidak bisa dibandingkan'
                      : selisihTerjelaskan
                        ? `${rp(selisih)} — seluruhnya dari baris yang tidak dihitung rumus Excel (lihat di bawah)`
                      : selisih === 0
                        ? (sisaSelisih.length
                            // Nol di akar TIDAK berarti benar: kesalahan bisa saling
                            // menghapus. Menulis "cocok persis" di situ menyesatkan.
                            ? 'nihil di total — tapi lihat catatan di bawah'
                            : 'nihil — cocok persis')
                        : rp(selisih)}
                  </strong>
                </Baris>
              </Panel>

              {hasil.peringatan.map((p, i) => (
                <div key={i} className="blud-imp-badge-warn" style={{ padding: '9px 12px', borderRadius: 8, fontSize: 11.5, lineHeight: 1.6 }}>
                  {p}
                </div>
              ))}

              {hasil.realisasiTerdampak.length > 0 && (
                <Panel judul={`Belanja yang akan kehilangan posnya — ${hasil.realisasiTerdampak.length} baris`} bahaya>
                  {/* Kalimat lama berbunyi "setelah impor dijalankan, … tidak lagi punya pos" — padahal impor
                      tidak menulis apa pun, dan Simpan ke versi yang menentukan pagu menahannya dulu (§4.3,
                      `pagarSimpanVersi`: rekening yang hilang = pagu 0 di bawah terserap). */}
                  <p style={{ fontSize: 11.5, lineHeight: 1.6, marginBottom: 8 }}>
                    Belanja berikut tercatat pada baris anggaran yang <strong>tidak ada</strong> di {balik ? 'hasil impor' : 'berkas impor'}.
                    Kalau versi ini yang menentukan pagu, Simpan akan berhenti dulu dan menyebut rekeningnya.
                    Kalau tetap dilanjutkan, pengeluaran ini tidak lagi punya pos anggaran — angkanya tetap ada di
                    Buku Kas, tapi tidak terhitung ke pagu mana pun. Untuk mempertahankannya, kembalikan barisnya di Excel.
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

              {!balik && hasil.diLuarRumus.length > 0 && (
                <Panel judul={`Tidak dihitung rumus Excel — ${hasil.diLuarRumus.length} baris`} bahaya>
                  <p style={{ fontSize: 11.5, lineHeight: 1.6, marginBottom: 8 }}>
                    Rumus baris induknya di Excel tidak menyebut baris berikut, jadi Excel tidak menghitungnya
                    (biasanya rentang SUM tidak ikut melebar sesudah baris disisipkan). PRIMA tetap menghitungnya,
                    sehingga total di sini lebih besar dari angka Excel. Kalau baris itu memang bukan anggaran,
                    centang <strong>Lewati</strong>.
                  </p>
                  <div style={{ maxHeight: 170, overflowY: 'auto', fontSize: 11, lineHeight: 1.6 }}>
                    {hasil.diLuarRumus.slice(0, 60).map(d => (
                      <label key={d.barisExcel} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 8, padding: '3px 0', cursor: 'pointer' }}>
                        <input type="checkbox" checked={dilewati.has(d.barisExcel)}
                          onChange={e => setDilewati(prev => {
                            const n = new Set(prev)
                            if (e.target.checked) n.add(d.barisExcel)
                            else n.delete(d.barisExcel)
                            return n
                          })} />
                        <span>Lewati</span>
                        <span className="blud-imp-muted">b.{d.barisExcel}</span>
                        <strong style={{ flex: '1 1 160px', minWidth: 0 }}>{d.uraian || '(tanpa uraian)'}</strong>
                        <span style={{ fontFamily: 'monospace', whiteSpace: 'nowrap' }}>Rp {rp(d.nilai)}</span>
                        <span className="blud-imp-muted" style={{ flexBasis: '100%', paddingLeft: 22 }}>
                          di bawah b.{d.indukBarisExcel} {d.indukUraian}
                        </span>
                      </label>
                    ))}
                  </div>
                </Panel>
              )}

              {hasil.perbaikan.length > 0 && (
                <Panel judul={`Dibetulkan otomatis — ${hasil.perbaikan.length} baris`}>
                  <p style={{ fontSize: 11.5, lineHeight: 1.6, marginBottom: 8 }}>
                    Susunan baris dibetulkan memakai rumus yang ada di berkas. Tidak ada nominal yang
                    ditambahkan — angkanya tetap dari volume × harga. Tiap pembetulan hanya dipakai
                    kalau sesudahnya angka di berkas jadi cocok. Excel Anda sendiri tidak diubah.
                  </p>
                  <div style={{ maxHeight: 150, overflowY: 'auto', fontSize: 11, lineHeight: 1.6 }}>
                    {hasil.perbaikan.slice(0, 40).map(p => (
                      <div key={`${p.barisExcel}-${p.jenis}`} style={{ padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,.05)' }}>
                        <span className="blud-imp-muted">b.{p.barisExcel}</span>{' '}
                        <span style={{ color: '#1D9E75' }}>{p.keterangan}</span>
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
              <Panel judul={`Pratinjau pohon — ${pratinjau.length} baris`}>
                <Virtuoso
                  style={{ height: 280 }}
                  data={pratinjau}
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

              {/* Kolom tanggal sendiri dulu ada di sini, dan justru itu bugnya:
                  ia tidak tahu-menahu periode yang dipilih di halaman. Yang
                  tersisa pernyataan tujuan — dibaca, bukan diisi. */}
              <div className="blud-imp-badge-warn" style={{ padding: '10px 12px', borderRadius: 8, fontSize: 11.5, lineHeight: 1.7 }}>
                Hasil impor ini <strong>masuk ke form dulu</strong>, belum tersimpan. Tujuan penyimpanannya
                mengikuti periode di halaman DPA: <strong>{periodeLabel}</strong>. Periksa dulu isinya,
                lalu tekan Simpan di halaman.
              </div>
            </>
          )}
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-end', padding: '12px 20px', borderTop: '1px solid rgba(255,255,255,.08)' }}>
          <PrimaButton variant="ghost" onClick={onTutup} disabled={sibuk}>Batal</PrimaButton>
          {hasil && (
            <PrimaButton variant="ghost" iconLeft={<Upload size={13} />} disabled={sibuk}
              onClick={() => inputRef.current?.click()}>
              Ganti Berkas
            </PrimaButton>
          )}
          {hasil && !tolak && (
            <PrimaButton variant="primary" disabled={sibuk} onClick={() => void terapkan()}>
              Masukkan {(barisMasuk ?? barisDipakai).length} baris ke Form
            </PrimaButton>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * §11.3 butir 5 — "bandingkan dulu, baru terapkan" (L82b). Yang dicantumkan DAUN:
 * induk menjumlah anaknya, jadi mendaftarnya menulis satu perubahan sedalam pohonnya (L85).
 */
function PanelBanding({ versi, simpananKini, banding }: { versi: string; simpananKini: number; banding: BandingImporBalik }) {
  const selisih = banding.totalBaru - banding.totalLama
  const kosong = !banding.berubah.length && !banding.baru.length && !banding.dinolkan.length
    && !banding.dihapus.length && !banding.lainBerubah
  return (
    <Panel judul={`Dibandingkan dengan versi ${formatTanggalId(versi)} · simpanan ke-${simpananKini}`}>
      <Baris label="Total">
        Rp {rp(banding.totalLama)} → Rp {rp(banding.totalBaru)}
        {' · '}selisih <strong>{formatSelisih(selisih, n => `Rp ${rp(n)}`)}</strong>
      </Baris>
      {kosong && <Baris label="Perubahan">Tidak ada yang berubah — isi berkas sama dengan versi ini.</Baris>}
      <DaftarBanding judul="Angka berubah" isi={banding.berubah.map(b => ({
        kunci: `${b.kode}|${b.uraian}`, label: b.uraian, kode: b.kode,
        nilai: `${rp(b.lama)} → ${rp(b.baru)}`,
      }))} />
      <DaftarBanding judul="Baris baru" isi={banding.baru.map(b => ({
        kunci: `${b.kode}|${b.uraian}`, label: b.uraian, kode: b.kode, nilai: rp(b.jumlah),
      }))} />
      <DaftarBanding
        judul="Tidak ada di berkas — dinolkan"
        catatan="Baris ini sudah ada sebelum Perubahan, jadi tetap tercatat dengan angka Rp 0 (aturan hapus DPA Perubahan)."
        isi={banding.dinolkan.map(b => ({ kunci: `${b.kode}|${b.uraian}`, label: b.uraian, kode: b.kode, nilai: `${rp(b.jumlah)} → 0` }))} />
      <DaftarBanding judul="Tidak ada di berkas — dihapus" isi={banding.dihapus.map(b => ({
        kunci: `${b.kode}|${b.uraian}`, label: b.uraian, kode: b.kode, nilai: rp(b.jumlah),
      }))} />
      {banding.lainBerubah > 0 && (
        <Baris label="Lainnya">
          {banding.lainBerubah} baris berubah uraian, kode, penanggung jawab, keterangan, susunan, atau vol/harga tanpa mengubah jumlah.
        </Baris>
      )}
    </Panel>
  )
}

function DaftarBanding({ judul, catatan, isi }: {
  judul: string; catatan?: string
  isi: Array<{ kunci: string; label: string; kode: string; nilai: string }>
}) {
  if (!isi.length) return null
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ fontSize: 11.5, fontWeight: 700 }}>{judul} — {isi.length}</div>
      {catatan && <div className="blud-imp-muted" style={{ fontSize: 11, lineHeight: 1.5 }}>{catatan}</div>}
      {/* Berbaris, bukan dipaksa satu baris: di layar 375px kode 28 karakter + uraian
          mendorong nilainya keluar dan memunculkan bilah gulir mendatar. */}
      <div style={{ maxHeight: 130, overflowY: 'auto', overflowX: 'hidden', fontSize: 11, marginTop: 4 }}>
        {isi.slice(0, 60).map((x, i) => (
          <div key={`${x.kunci}|${i}`} style={{ display: 'flex', flexWrap: 'wrap', columnGap: 8, padding: '2px 0' }}>
            {x.kode && <span className="blud-imp-muted" style={{ fontFamily: 'monospace', overflowWrap: 'anywhere' }}>{x.kode}</span>}
            <span style={{ flex: '1 1 160px', minWidth: 0 }}>{x.label || <em className="blud-imp-muted">(tanpa uraian)</em>}</span>
            <span style={{ fontFamily: 'monospace', whiteSpace: 'nowrap', marginLeft: 'auto' }}>{x.nilai}</span>
          </div>
        ))}
        {isi.length > 60 && <div className="blud-imp-muted">… dan {isi.length - 60} lagi</div>}
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
    <div style={{ display: 'flex', flexWrap: 'wrap', columnGap: 10, fontSize: 11.5, padding: '2px 0', lineHeight: 1.6 }}>
      <span className="blud-imp-muted" style={{ flex: '0 0 148px' }}>{label}</span>
      <span style={{ flex: '1 1 220px', minWidth: 0 }}>{children}</span>
    </div>
  )
}
