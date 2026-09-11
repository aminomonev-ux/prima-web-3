// lib/admin/permintaan-baris.ts — aturan murni permintaan akses mandiri (P4).
// Konsep: docs/CONCEPT-pusat-akses-satu-pintu.md §12 P4 (Tahap 11).
//
// BERKAS DAUN. Dibaca kartu /menu (`'use client'`), panel Pusat Akses (`'use client'`),
// DAN lapisan servernya — jadi ia TIDAK BOLEH mengimpor apa pun yang menyeret
// `next/headers`, mysql2, atau `NextResponse`. Preseden Tahap 5: satu impor NILAI dari
// berkas ber-mysql2 merobohkan seluruh rute /admin sementara `tsc` dan ESLint sama-sama
// lulus, dan pesan galatnya menunjuk `auth.ts` alih-alih barisnya.
//
// `bolehDimintaOleh` di bawah mengimpor `bolehMasukModul` dari registry — itu aman:
// `lib/registry/apps.ts` sendiri berkas nol-impor, dan aturannya memang harus SATU
// dengan pagar sungguhannya. Layar yang menghitung "modul ini terkunci atau tidak"
// dengan aturannya sendiri akan berbeda pendapat dengan satpamnya cepat atau lambat.

import { MODUL_APPS, modul, bolehMasukModul } from '@/lib/registry/apps'

export const STATUS_PERMINTAAN = ['MENUNGGU', 'DISETUJUI', 'DITOLAK'] as const
export type StatusPermintaan = (typeof STATUS_PERMINTAAN)[number]

/**
 * Batas panjang alasan pemohon — dan angkanya BUKAN selera.
 *
 * Alasan inilah yang dipakai ulang sebagai alasan P9 saat admin menyetujui: §12 P9
 * menyebut terus terang bahwa persetujuan TIDAK ditanya alasannya lagi, "di sana
 * alasannya sudah ditulis pemohon". `AlasanWewenangSchema` membatasi kolom itu 140,
 * jadi kalau di sini boleh lebih panjang, yang mendarat di jejak audit adalah POTONGAN.
 * Alasan audit yang terpotong lebih buruk daripada alasan yang pendek sejak awal — ia
 * terbaca seperti kalimat utuh yang kebetulan aneh.
 */
export const MAKS_ALASAN = 140

/**
 * `min(10)`, bukan `min(4)` seperti alasan admin.
 *
 * Bedanya bukan ketatnya, melainkan siapa pembacanya. Alasan admin dibaca oleh admin
 * yang sedang melihat layar yang sama; alasan pemohon dibaca orang lain, besok, tanpa
 * konteks apa pun — dan "perlu" bukan kalimat yang bisa diputuskan. Tetap tidak
 * setinggi gesekan promosi (aturan 11.4): yang diminta satu kalimat, bukan formulir.
 */
export const MIN_ALASAN = 10

export type PermintaanSaya = {
  id: number
  appKey: string
  alasan: string
  status: StatusPermintaan
  dibuatPada: string
  catatanPutusan: string | null
}

export type BarisAntrean = PermintaanSaya & {
  userId: number
  username: string
  namaLengkap: string | null
  role: string
  /**
   * Umur permintaan dalam hari, DIHITUNG SERVER (`DATEDIFF` terhadap `CURDATE()`).
   *
   * Bukan selisih yang dihitung peramban terhadap `dibuat_pada`: stempelnya lahir dari
   * jam MySQL, jadi menghitungnya dengan jam mesin pembaca berarti dua jam berbeda
   * menjawab satu pertanyaan — dan jawabannya ikut bergeser mengikuti siapa yang
   * kebetulan membuka halaman. Pelajaran yang sama dengan `tanggalServer()` di P2.
   */
  umurHari: number
}

/**
 * Boleh tidak orang ini meminta modul itu?
 *
 * TIGA syarat, dan ketiganya punya sebabnya sendiri:
 *
 *   1. modulnya ada — kunci salah ketik harus jadi penolakan, bukan baris antrean untuk
 *      modul yang tidak pernah bisa diberikan;
 *   2. modulnya memang BISA di-grant — `admin` `bolehDigrant: false`, dan mencentangnya
 *      di `users.app_access` tidak pernah membuka Admin Panel (T-9). Menerima
 *      permintaannya berarti mengantre sesuatu yang tidak punya jawaban "ya";
 *   3. pintunya memang sedang TERTUTUP untuk orang ini. Meminta yang sudah dipunyai
 *      cuma menambah baris yang akan langsung dijawab "sudah terbuka" — dan yang
 *      menjawabnya manusia.
 *
 * Dipakai layar untuk memutuskan apakah tautannya muncul, DAN server untuk menolak —
 * satu fungsi, dua pembaca (aturan 11.5). Kalau layarnya saja, ini cuma penyembunyian
 * (aturan 11.2).
 */
export function bolehDimintaOleh(
  appKey: string,
  role: string,
  appAccess: readonly string[] | null | undefined,
): boolean {
  const m = modul(appKey)
  if (!m || !m.bolehDigrant) return false
  return !bolehMasukModul(appKey, role, appAccess ? [...appAccess] : [])
}

/** Nama modul seperti yang tertulis di kartu /menu. Kunci mentah untuk yang tak dikenal. */
export function labelModul(appKey: string): string {
  return modul(appKey)?.label ?? appKey
}

/**
 * Modul yang masuk akal ditawarkan ke seseorang sebagai permintaan — urut seperti
 * daftar modulnya, bukan diacak abjad, supaya cocok dengan urutan kartu di /menu.
 */
export function modulYangBisaDiminta(
  role: string,
  appAccess: readonly string[] | null | undefined,
): { kunci: string; label: string }[] {
  return MODUL_APPS
    .filter((m) => bolehDimintaOleh(m.kunci, role, appAccess))
    .map((m) => ({ kunci: m.kunci, label: m.label }))
}

/**
 * Keadaan sebuah kartu /menu terhadap antrean permintaan.
 *
 * Yang DITOLAK ikut dipulangkan beserta catatannya, dan itu bagian yang paling
 * menentukan: penolakan tanpa sebab mengirim orangnya kembali ke WhatsApp untuk
 * bertanya "kenapa" — persis antrean yang seluruh fitur ini pindahkan ke dalam
 * aplikasi. Yang sudah DISETUJUI tidak perlu ditampilkan: kartunya sudah terbuka, dan
 * itu jawaban yang lebih jelas daripada lencana mana pun.
 */
export function keadaanKartu(
  appKey: string,
  daftar: readonly PermintaanSaya[],
): { status: 'menunggu' | 'ditolak' | 'belum'; catatan: string | null; sejak: string | null } {
  const punya = daftar.filter((p) => p.appKey === appKey)
  const menunggu = punya.find((p) => p.status === 'MENUNGGU')
  if (menunggu) return { status: 'menunggu', catatan: null, sejak: menunggu.dibuatPada }
  // Yang TERBARU, bukan yang pertama ditemukan: seseorang boleh ditolak, meminta lagi,
  // lalu ditolak lagi dengan sebab yang berbeda — dan yang berlaku sebab terakhir.
  const ditolak = punya
    .filter((p) => p.status === 'DITOLAK')
    .sort((a, b) => (a.dibuatPada < b.dibuatPada ? 1 : a.dibuatPada > b.dibuatPada ? -1 : b.id - a.id))[0]
  if (ditolak) return { status: 'ditolak', catatan: ditolak.catatanPutusan, sejak: ditolak.dibuatPada }
  return { status: 'belum', catatan: null, sejak: null }
}

/**
 * Kalimat umur antrean: "menunggu sejak 3 hari lalu".
 *
 * Umurnya DISEBUT, bukan cuma tanggalnya, dan sebabnya sama dengan `labelJangka` di
 * P2: yang perlu diputuskan admin bergantung pada hasil hitungannya, dan menyuruh orang
 * menghitung sendiri tiap baris adalah cara tercepat membuat antreannya tidak dibaca.
 *
 * Menerima ANGKA, bukan tanggal + jam sekarang. Fungsi yang membaca jamnya sendiri
 * tidak bisa dipakai saat render (hasilnya bergeser tiap kali komponennya digambar
 * ulang) dan tidak bisa diuji tanpa membekukan waktu.
 */
export function umurPermintaan(hari: number): string {
  if (!Number.isFinite(hari)) return ''
  if (hari <= 0) return 'hari ini'
  if (hari === 1) return 'kemarin'
  return `${hari} hari lalu`
}
