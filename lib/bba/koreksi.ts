// lib/bba/koreksi.ts — koreksi salah input di Buku Aset (docs/CONCEPT-bba-buku-aset.md §20), MURNI:
// dipakai server (pagar) DAN tombol kartu aset — tombol mati di layar hanya cerminnya (L82).
import { lahirDiPrima, namaTampil, type AsetRingan } from './aset'

type AsetKoreksi = Pick<AsetRingan, 'nama' | 'nama_resmi' | 'register' | 'kode_barang' | 'kunci_impor' | 'status' | 'penerimaan_id'>

/** Yang masih merujuk register ini — isinya kode rencana / nama ruangan. */
export interface RujukanAset { sasaran: string[]; gedung: string[] }

const sebut = (xs: string[]) => (xs.length <= 3 ? xs.join(', ') : `${xs.slice(0, 3).join(', ')} dan ${xs.length - 3} lainnya`)

/**
 * Batalkan penempatan = membuang register yang salah ditempatkan, unitnya kembali ke antrean. Hanya untuk
 * catatan yang BELUM pernah masuk buku resmi: lahir dari Tempatkan dan belum teregister. Begitu nomor
 * provinsi ada, ia keluar hanya lewat Hapus dengan SK (§7.6).
 */
export function alasanTakBisaBatalTempatkan(a: AsetKoreksi, rujukan: RujukanAset = { sasaran: [], gedung: [] }): string | null {
  const nama = namaTampil(a)
  if (!lahirDiPrima(a)) return `${nama}: berasal dari berkas KIB, bukan dari barang diterima — keluar dari buku aset hanya lewat Hapus dengan SK.`
  if (a.status !== 'AKTIF') return `${nama} sudah dihapus dengan SK.`
  if (a.kode_barang || a.kunci_impor)
    return `${nama} sudah teregister${a.register ? ` (${a.register})` : ''} — sudah tercatat di sistem provinsi. Register salah ketik dibetulkan di kartu aset; barang yang memang tidak ada dihapus dengan SK.`
  if (rujukan.sasaran.length) return `${nama} jadi aset sasaran rencana ${sebut(rujukan.sasaran)} — keluarkan dari rencana itu dulu.`
  if (rujukan.gedung.length) return `${nama} dipakai sebagai gedung ruangan ${sebut(rujukan.gedung)} — ganti gedungnya di Master → Ruangan dulu.`
  return null
}

/** Isi, betulkan, atau kosongkan register: hanya catatan yang lahir di PRIMA dan masih aktif. */
export function alasanTakBisaUbahRegister(a: Pick<AsetRingan, 'status' | 'penerimaan_id'>): string | null {
  if (a.status !== 'AKTIF') return 'Aset sudah dihapus.'
  if (!lahirDiPrima(a)) return 'Kode barang & register aset ini dari berkas KIB — betulkan di sistem provinsi, lalu Impor KIB ulang.'
  return null
}
