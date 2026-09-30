// lib/shared/jendela-pengajuan.ts — "boleh mengirim usulan BARU sekarang?" satu jawaban.
//
// Berkas DAUN (tanpa impor DB): dibaca server (empat pintu kirim) DAN layar (dialog
// batal). B3, audit 2026-09-29: dulu hanya POST yang memeriksa jendela, jadi "simpan
// draf lalu Ajukan" melewatinya — tiga pintu lain tidak pernah bertanya.
//
// Keputusan pemilik aplikasi (29 Sep): jendela hanya menutup PENGIRIMAN PERTAMA
// (DRAFT → diajukan). Mengirim ulang hasil revisi yang diminta Bidang/Admin tetap boleh
// kapan saja — revisi itu permintaan peninjau, bukan usulan baru.
import { tanggalHariIniWIB } from './waktu-wib'

export type KonfigJendela = { aktif: boolean; mulai: string; selesai: string }

export const PESAN_JENDELA_TUTUP =
  'Pengajuan usulan sedang ditutup. Usulan hanya dapat dikirim dalam periode yang ditentukan.'

const RE_TANGGAL = /^\d{4}-\d{2}-\d{2}$/

/**
 * Batas dibandingkan sebagai teks 'YYYY-MM-DD' pada tanggal WIB — kedua ujung termasuk
 * (hari terakhir tetap buka sampai 23:59). Tanggal tak sah dianggap tidak diisi, bukan
 * menutup: yang menjaga bentuknya validasi saat disimpan (`POST /api/config`).
 */
export function jendelaTerbuka(k: KonfigJendela, hariIni: string = tanggalHariIniWIB()): boolean {
  if (!k.aktif) return true
  const mulai = RE_TANGGAL.test(k.mulai) ? k.mulai : ''
  const selesai = RE_TANGGAL.test(k.selesai) ? k.selesai : ''
  if (mulai && hariIni < mulai) return false
  if (selesai && hariIni > selesai) return false
  return true
}
