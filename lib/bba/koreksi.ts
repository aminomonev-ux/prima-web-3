// lib/bba/koreksi.ts — koreksi salah input & catatan kembar di Buku Aset (docs/CONCEPT-bba-buku-aset.md §20, §23), MURNI:
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
  if (!lahirDiPrima(a)) return 'Kode barang & register aset ini dari berkas KIB — betulkan di sistem provinsi, lalu Impor KIB ulang dan pasangkan nomor barunya dengan catatan ini di pratinjau.'
  return null
}

// ─── Nomor diganti provinsi & catatan kembar (Tahap G, §23) ─────────────────────

type AsetGabung = Pick<AsetRingan, 'id' | 'golongan' | 'nama' | 'nama_resmi' | 'register' | 'kunci_impor' | 'status' | 'penerimaan_id' | 'lokasi_id' | 'barang_id' | 'kondisi_sumber'>

/** Riwayat & rujukan kembaran — dibaca server SESUDAH kedua baris dikunci. */
export interface FaktaKembar { jenisRiwayat: string[]; rujukan: RujukanAset }

const ISIAN_PRIMA: Record<string, string> = {
  UBAH: 'nama sehari-hari/barang diubah', KONDISI: 'kondisinya dicek', PINDAH: 'ditempatkan di ruangan', REGISTER: 'registernya diubah',
  REHAB: 'direhab', HAPUS: 'pernah dihapus', BATAL_HAPUS: 'penghapusannya dibatalkan', TERIMA: 'lahir dari penerimaan',
}

/**
 * Gabungkan dengan kembarannya: catatan INI (yang memegang isian PRIMA) mengambil nomor & kolom KIB kembarannya, lalu
 * kembarannya dibuang. Yang dibuang wajib lahir dari berkas dan seluruh isinya salinan berkas — pilihan keliru bisa
 * dipulihkan impor berikutnya (nomor yang tertinggal lahir lagi), tanpa ada isian PRIMA yang ikut hilang.
 */
export function alasanTakBisaGabung(ini: AsetGabung, kembar: AsetGabung, fakta: FaktaKembar = { jenisRiwayat: [], rujukan: { sasaran: [], gedung: [] } }): string | null {
  const label = `${namaTampil(kembar)}${kembar.register ? ` reg. ${kembar.register}` : ''}`
  if (ini.id === kembar.id) return 'Pilih catatan lain — ini catatan yang sama.'
  if (ini.status !== 'AKTIF') return `${namaTampil(ini)} sudah dihapus.`
  if (kembar.status !== 'AKTIF') return `${label} sudah dihapus.`
  if (ini.golongan !== kembar.golongan) return `${label} golongan ${kembar.golongan}, catatan ini golongan ${ini.golongan} — itu reklasifikasi, bukan kembaran.`
  if (lahirDiPrima(kembar))
    return `${label} lahir dari barang diterima, bukan dari berkas KIB. Yang dipertahankan selalu catatan yang kartunya dibuka — buka kartu catatan itu dan gabungkan dari sana.`
  if (!kembar.kunci_impor) return `${label} tidak punya nomor dari berkas — tidak ada yang bisa diambil.`
  const isian = new Set(fakta.jenisRiwayat.filter(j => j !== 'IMPOR').map(j => ISIAN_PRIMA[j] ?? j.toLowerCase()))
  if (kembar.kondisi_sumber === 'CEK') isian.add(ISIAN_PRIMA.KONDISI)
  if (kembar.lokasi_id != null) isian.add(ISIAN_PRIMA.PINDAH)
  if (kembar.barang_id != null) isian.add(ISIAN_PRIMA.UBAH)
  if (isian.size)
    return `${label} sudah diisi di PRIMA (${[...isian].join(', ')}) — catatan yang dibuang hanya boleh berisi salinan berkas. Dua catatan yang sama-sama sudah diisi belum bisa digabung.`
  if (fakta.rujukan.sasaran.length) return `${label} jadi aset sasaran rencana ${sebut(fakta.rujukan.sasaran)} — keluarkan dari rencana itu dulu.`
  if (fakta.rujukan.gedung.length) return `${label} dipakai sebagai gedung ruangan ${sebut(fakta.rujukan.gedung)} — ganti gedungnya di Master → Ruangan dulu.`
  return null
}
