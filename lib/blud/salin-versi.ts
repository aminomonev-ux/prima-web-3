// lib/blud/salin-versi.ts — aturan "Salin dari Versi Lain" (Tahap 3).
//
// Menggantikan alur yang sengaja dibuang di L79d: dulu orang membuka arsip Juli
// lalu menekan Simpan supaya angkanya jadi revisi hari ini. Alur itu ditutup
// karena membuka arsip kini MENGUNCI sasaran Simpan ke bulan arsipnya — tanpa
// kunci itu, menyunting arsip Juli menimpa versi Agustus tanpa sepatah kata pun.
//
// Yang ikut hilang adalah kebutuhan yang sah: "mulai versi baru dari angka versi
// lain". Fitur ini mengembalikannya dengan satu pembalikan yang menentukan:
//
//     menyalin mengganti ISI layar, TIDAK PERNAH sasaran Simpan.
//
// Sasaran tetap milik pemilih periode — satu tempat, satu maksud. Modal yang
// membawa tanggal tulisnya sendiri persis bentuk L78 (`ImportDpaModal`), dan itu
// sudah pernah menghasilkan versi Agustus dari orang yang memilih Juli.
//
// Bedanya dengan "Salin dari Tahun Lain" ada di satu kolom: `anggaran_key`.
// Di sana jangkar SENGAJA dilepas (tahun beda — jangkar itu mengikat baris ke
// realisasi tahun lama); di sini SENGAJA utuh (tahun sama — ini baris yang sama).
// Karena itu salinan ini memakai `dpaKeInput`/`pergeseranKeInput` apa adanya dan
// TIDAK punya mapper sendiri: tidak ada satu kolom pun yang perlu berubah, dan
// mapper tambahan hanya menambah tempat sebuah kolom bisa terlupa — persis
// alasan `row-map.ts` ada.

import { formatTanggalId, tanggalPeriodeHistoris, labelPeriodeVersi } from './tanggal'
import { dpaKeInput, pergeseranKeInput } from './row-map'
import type {
  DpaBaris, DpaBarisInput, PergeseranBaris, PergeseranBarisInput,
} from '@/types'

export type SumberSalin = 'DPA' | 'PERGESERAN'

/**
 * Jangkauan salinan. Dipakai baris audit `BLUD_SAVE_*` untuk menjawab satu
 * pertanyaan yang tidak bisa dijawab dari angka baris: apakah jangkar realisasi
 * ikut terbawa? 'TAHUN' berarti dilepas, 'VERSI' berarti utuh.
 *
 * Sengaja bukan disimpulkan dari `asal.tahun === tahun_anggaran` di route.
 * Kesimpulan itu memang benar hari ini — `SalinTahunModal` tidak pernah
 * menawarkan tahun yang sedang dibuka — tapi jaminannya hidup di sebuah
 * `useMemo` jauh dari route. Begitu ada yang melonggarkannya, baris auditnya
 * berbohong tanpa ada yang gagal.
 */
export type LingkupSalin = 'TAHUN' | 'VERSI'

/** Dipakai dua modal salin; bentuknya sama, `lingkup` yang membedakan. */
export interface AsalSalin {
  tahun:   number
  versi:   string
  sumber:  SumberSalin
  lingkup: LingkupSalin
}

/**
 * Satu baris daftar versi. `jumlah_baris` opsional karena riwayat Pergeseran
 * memang tidak membawanya (`{ versi_tanggal }` saja), sedangkan DPA membawanya.
 */
export interface VersiPilihan {
  versi_tanggal: string
  jumlah_baris?: number
}

/**
 * Versi yang boleh jadi SUMBER salinan.
 *
 * `kecuali` diisi dua hal yang berbeda dan dua-duanya perlu:
 *
 *   • versi yang sedang DIBUKA — menyalinnya ke layar yang sudah menampilkannya
 *     tidak mengubah apa pun,
 *   • versi yang jadi SASARAN Simpan — menyalin sebuah versi ke atas dirinya
 *     sendiri juga tidak mengubah apa pun, tapi terlihat seperti berhasil.
 *
 * Keduanya biasanya tanggal yang sama, tapi tidak selalu: sesudah "Form Baru"
 * atau ganti tahun, `versi` kosong sementara sasaran tetap hari ini — dan hari
 * ini bisa sudah punya versi tersimpan.
 */
export function sumberSalinTersedia(
  history: readonly VersiPilihan[],
  kecuali: readonly string[],
): VersiPilihan[] {
  const buang = new Set(kecuali.filter(Boolean))
  return history
    .filter(h => h.versi_tanggal && !buang.has(h.versi_tanggal))
    .slice()
    .sort((a, b) => b.versi_tanggal.localeCompare(a.versi_tanggal))
}

/**
 * Label satu versi di daftar sumber. Arsip periode diberi keterangan bulannya,
 * revisi harian tidak — dua jenis yang tinggal di kolom yang sama dan hanya
 * bentuk tanggalnya yang membedakan (lihat `tanggalPeriodeHistoris`).
 */
export function labelVersiSumber(tanggal: string, sekarang: number = Date.now()): string {
  return tanggalPeriodeHistoris(tanggal, sekarang)
    ? `${formatTanggalId(tanggal)} — arsip ${labelPeriodeVersi(tanggal)}`
    : formatTanggalId(tanggal)
}

/** Alasan tombol "Salin dari Versi" dimatikan; '' berarti boleh ditekan. */
export function alasanKunciSalinVersi(
  tahun: number,
  history: readonly VersiPilihan[],
  kecuali: readonly string[],
): string {
  if (history.length === 0) return `Tahun ${tahun} belum punya versi tersimpan untuk disalin.`
  if (sumberSalinTersedia(history, kecuali).length === 0) {
    return `Versi satu-satunya di tahun ${tahun} adalah yang sedang terbuka — belum ada versi lain untuk disalin.`
  }
  return ''
}

/**
 * Cermin pagar Zod `dpa_versi_tanggal > versi_tanggal` di `PergeseranBodySchema`.
 *
 * Baris pergeseran membawa salinan kolom DPA-nya, jadi menyalin versi A ke
 * sasaran B berarti label acuan DPA-nya ikut pindah — kalau tidak, tabelnya
 * memuat angka DPA Agustus sambil mengaku mengacu DPA Juni. Konsekuensinya
 * salinan yang mengacu DPA lebih baru daripada sasarannya akan ditolak server,
 * dan itu harus terbaca SEBELUM orangnya menekan Salin, bukan sesudah menekan
 * Simpan dan mendapat 400.
 *
 * Ditulis ulang di sini, bukan diimpor: `schemas.ts` menyeret ratelimit → ioredis
 * → dns ke dalam bundel peramban. Diikat ke aslinya lewat pengujian.
 */
// ─── PENOLONG MODAL ──────────────────────────────────────────────────────────
// Keempatnya tinggal di sini, BUKAN di dalam berkas layar, karena dua alasan
// yang sama-sama nyata:
//
//   1. Identitasnya harus tetap. Semuanya masuk daftar dependensi pemuat di
//      dalam modal; kalau lahir baru tiap render, efek pemuatnya menyala tiap
//      render dan modalnya menembak server tanpa henti.
//   2. Bisa diuji sungguhan. Fungsi yang hidup di berkas 'use client' cuma bisa
//      dicocokkan ke teks sumbernya — pengujian yang lolos untuk kode yang salah.

/** Baris DPA dari server → baris form. Jangkarnya ikut (`dpaKeInput`, tahun sama). */
export const petakanDpaRows = (d: DpaBaris[]): DpaBarisInput[] => d.map(dpaKeInput)

/** Baris Pergeseran dari server → baris form. Jangkarnya ikut. */
export const petakanPergeseranRows = (d: PergeseranBaris[]): PergeseranBarisInput[] =>
  d.map(pergeseranKeInput)

/**
 * Total = jumlah baris AKAR saja. Induk sudah berisi Σ anaknya (`recalcDpaJumlah`),
 * jadi menjumlah SEMUA baris menghitung uang yang sama berkali-kali — sekali per
 * tingkat hierarki.
 */
export const totalAkarDpa = (rows: readonly { parent_id: string | null; jumlah: number }[]): number =>
  rows.reduce((s, r) => r.parent_id ? s : s + (r.jumlah ?? 0), 0)

/**
 * Sepadan, tapi memakai kolom `pergeseran` — BUKAN `jumlah`.
 *
 * `jumlah` di baris pergeseran itu sisi DPA-nya (pagu sebelum digeser); yang
 * dibandingkan orang saat memilih versi sumber adalah angka pasca-geser. Salah
 * kolom di sini menampilkan angka yang benar-benar ada di baris itu, jadi tidak
 * ada yang terlihat rusak — cuma jawabannya bukan pertanyaan yang ditanyakan.
 */
export const totalAkarPergeseran = (rows: readonly { parent_id: string | null; pergeseran: number }[]): number =>
  rows.reduce((s, r) => r.parent_id ? s : s + (r.pergeseran ?? 0), 0)

export function alasanDpaAcuanTerlaluBaru(
  dpaVersiSumber: string | null | undefined,
  sasaran: string,
): string {
  if (!dpaVersiSumber || !sasaran || dpaVersiSumber <= sasaran) return ''
  return `Pergeseran ini mengacu DPA ${formatTanggalId(dpaVersiSumber)}, sedangkan Simpan akan menulis ke `
    + `${formatTanggalId(sasaran)} — lebih lama. Sebuah pergeseran tidak bisa menggeser anggaran yang baru ada `
    + `belakangan, jadi Simpan akan ditolak. Pilih versi sumber yang mengacu DPA ${formatTanggalId(sasaran)} `
    + `atau sebelumnya.`
}
