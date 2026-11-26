// lib/blud/ttd-cetak.ts — tanda tangan Direktur di unduhan menu Cetak: kapan dipakai,
// cara membaca jawabannya, dan kalimat di bawah tombol PDF/Excel.
// Konsep: docs/konsep/blud/CONCEPT-blud-pejabat-penanda-tangan.md §3.1–3.2.
//
// MURNI & aman-klien. Yang tercetak = yang ditampilkan: layar Cetak memuat Direktur SEKALI
// per tahun lewat `GET /api/blud/pejabat?untuk=cetak`, dan unduhan memakai hasil yang sama.
import type { PejabatTtd } from '@/lib/shared/gaya-dokumen'

export type InfoTtdCetak =
  | { keadaan: 'ada'; direktur: PejabatTtd }
  | { keadaan: 'kosong' }
  | { keadaan: 'gagal'; sebab: string }

/** View yang mencetak blok tanda tangan Direktur. */
export function viewBertandaTangan(view: string, hanyaBergeser: boolean): boolean {
  return view === 'dpa' || view === 'dpaPerubahan' || view === 'penanggungJawab'
    || (view === 'rekapPergeseran' && !hanyaBergeser)
}

interface JawabanDirektur {
  ok?: boolean
  data?: { nama?: string; nip?: string | null; pangkat?: string | null; jabatan_teks?: string | null } | null
}

/** Status HTTP + isi jawaban → keadaan yang ditampilkan DAN dipakai unduhan. */
export function bacaJawabanDirektur(status: number, j: JawabanDirektur | null): InfoTtdCetak {
  if (status === 403) return { keadaan: 'gagal', sebab: 'akun ini belum berhak membacanya' }
  if (status === 503) return { keadaan: 'gagal', sebab: 'modul BLUD sedang ditutup' }
  if (status === 401) return { keadaan: 'gagal', sebab: 'sesi sudah berakhir' }
  if (status !== 200 || !j?.ok) return { keadaan: 'gagal', sebab: 'server tidak menjawab' }
  const d = j.data
  if (!d?.nama?.trim()) return { keadaan: 'kosong' }
  return { keadaan: 'ada', direktur: { nama: d.nama.trim(), nip: d.nip ?? null, pangkat: d.pangkat ?? null, jabatan: d.jabatan_teks ?? null } }
}

/** Direktur yang ikut ke berkas — `null` = baris tanda tangan bergaris (diisi tangan). */
export const direkturUntukBerkas = (info: InfoTtdCetak | null): PejabatTtd | null =>
  info?.keadaan === 'ada' ? info.direktur : null

/** Kalimat di bawah tombol PDF/Excel. `peringatan` = tampil kuning. */
export function kalimatTtdCetak(info: InfoTtdCetak | null, tahun: number): { peringatan: boolean; teks: string } {
  if (!info) return { peringatan: false, teks: `Memuat penanda tangan ${tahun}…` }
  if (info.keadaan === 'ada') {
    const d = info.direktur
    return { peringatan: false, teks: `Tanda tangan: ${d.nama} (${(d.jabatan || 'Direktur').toUpperCase()}) — dari Pengaturan ${tahun}` }
  }
  const akibat = 'dokumen tercetak dengan baris tanda tangan kosong.'
  if (info.keadaan === 'kosong') {
    return { peringatan: true, teks: `Pejabat penanda tangan ${tahun} belum diisi — ${akibat} Minta pengelola Pengaturan mengisinya.` }
  }
  return { peringatan: true, teks: `Pejabat penanda tangan ${tahun} tidak terbaca (${info.sebab}) — ${akibat}` }
}
