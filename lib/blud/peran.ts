// lib/blud/peran.ts — izin dua sumbu modul BLUD: peran × menu.
// Konsep: docs/CONCEPT-blud-peran.md (keputusan #41)
//
// MODUL DAUN — tidak mengimpor apa pun. Ribbon dan tombol di klien memakainya
// tanpa ikut menarik `next/server` maupun data layer, pola yang sama dengan
// `alokasi-rule.ts`. Kalau suatu saat berkas ini butuh impor, pikir dua kali:
// begitu ia menyeret server ke bundel klien, tombol di layar akan mulai memakai
// salinan aturannya sendiri — dan itu awal mula layar & server berbeda pendapat.
//
// Tabel ini dibaca DUA pihak dan itu syaratnya: ribbon (menyembunyikan menu &
// tombol) dan tiap route (pagar sungguhannya). Kalau hanya ribbon yang
// membacanya, yang dibuat cuma dekorasi.

export const MENU_BLUD = [
  'beranda', 'master-akun', 'kode-besar', 'penanggung-jawab',
  'dpa', 'pergeseran',
  'buku-kas', 'bukti-setor', 'realisasi', 'tutup-kas',
  'cetak', 'pengaturan',
] as const
export type MenuBlud = typeof MENU_BLUD[number]

/**
 * N4 — menu yang ikut mati kalau sakelar `app_status_blud_realisasi` dimatikan.
 *
 * Daftarnya cerminan sisi API: yang dijaga `realisasiMati()` adalah seluruh
 * `/api/blud/realisasi/*` plus `bukti-setor` dan `pejabat`. Tanpa daftar ini
 * layarnya tetap terbuka dan bisa diklik, lalu tiap panggilan API balas 503 —
 * pengguna melihat layar rusak, bukan halaman pemeliharaan. Sakelarnya berfungsi,
 * cuma separuh.
 *
 * `cetak` sengaja TIDAK ikut: layar itu tidak memanggil satu pun endpoint
 * realisasi, dan mematikannya akan ikut mematikan cetakan DPA yang tak ada
 * urusannya dengan penatausahaan harian.
 */
export const MENU_REALISASI: readonly MenuBlud[] = ['buku-kas', 'bukti-setor', 'realisasi', 'tutup-kas']

/** EDIT = boleh mengubah · LIHAT = boleh membuka & MENGUNDUH · TIDAK = ditolak. */
export type Izin = 'EDIT' | 'LIHAT' | 'TIDAK'

export const LABEL_MENU: Record<MenuBlud, string> = {
  'beranda': 'Beranda',
  'master-akun': 'Master Akun',
  'kode-besar': 'Kode Besar',
  'penanggung-jawab': 'Penanggung Jawab',
  'dpa': 'DPA BLUD',
  'pergeseran': 'Pergeseran DPA',
  'buku-kas': 'Buku Kas',
  'bukti-setor': 'Bukti Setor',
  'realisasi': 'Realisasi',
  'tutup-kas': 'Tutup Kas',
  'cetak': 'Cetak',
  'pengaturan': 'Pengaturan',
}

interface AturanPeran {
  /** Berlaku untuk menu yang tidak disebut di `khusus`. */
  bawaan: Izin
  khusus?: Partial<Record<MenuBlud, Izin>>
}

/**
 * Hanya penyimpangan dari `bawaan` yang ditulis — barisnya jadi pendek dan
 * niatnya kelihatan. "Peran ini pada dasarnya X, kecuali di menu Y."
 */
const TABEL: Record<string, AturanPeran> = {
  // Admin sistem & admin staf: seluruh modul.
  SUPER_ADMIN: { bawaan: 'EDIT' },
  ADMIN:       { bawaan: 'EDIT' },

  // Perencana anggaran: data induk + DPA + Pergeseran. Penatausahaan hanya dibaca.
  PROGRAM: {
    bawaan: 'LIHAT',
    khusus: {
      'master-akun': 'EDIT', 'kode-besar': 'EDIT', 'penanggung-jawab': 'EDIT',
      'dpa': 'EDIT', 'pergeseran': 'EDIT',
      'pengaturan': 'EDIT', // Pejabat SPJ; hapus versi tetap dijaga canHapusVersi
    },
  },

  // Kepala bidang keuangan: atasan yang membuka kunci. Menu Tutup Kas penuh —
  // menutup DAN membuka — sisanya dibaca saja.
  KEUANGAN: {
    bawaan: 'LIHAT',
    khusus: { 'tutup-kas': 'EDIT', 'pengaturan': 'EDIT' },
  },

  // Bendahara pengeluaran: satu rentang kerja yang berurutan, dari mencatat
  // sampai mencetak. Boleh menutup kas; MEMBUKA-nya bukan wewenangnya —
  // pemisahan itu dijaga `bolehBukaPeriode`, bukan tabel ini.
  PERBENDAHARAAN: {
    bawaan: 'LIHAT',
    khusus: {
      'buku-kas': 'EDIT', 'bukti-setor': 'EDIT', 'realisasi': 'EDIT',
      'tutup-kas': 'EDIT', 'pengaturan': 'EDIT',
    },
  },
}

/**
 * Peran ber-grant yang belum masuk tabel. Bukan `TIDAK` — mereka sudah lolos
 * pemeriksaan `app_access`, jadi memang sengaja diberi akses. Bukan `EDIT` —
 * peran yang belum dipikirkan tidak boleh diam-diam mewarisi wewenang menulis.
 */
const BAWAAN_TAK_TERDAFTAR: Izin = 'LIHAT'

/**
 * Menu yang tidak punya jalur tulis sama sekali — bukan kebijakan, melainkan
 * kenyataan: tidak ada route yang mengubah angka resmi dari sana. Beranda cuma
 * ringkasan; Cetak & Realisasi hanya menyajikan (`realisasi/register` cuma `GET`).
 *
 * Aturan untuk menu baru: sebuah menu boleh bertingkat `EDIT` hanya kalau ada route
 * yang benar-benar mengubah angka resmi. Penentunya bukan metode HTTP dan bukan
 * namanya — `export-log` POST tapi baca, `rekap-pk` terdengar cetakan tapi menulis.
 */
export const MENU_BACA_SAJA: readonly MenuBlud[] = ['beranda', 'cetak', 'realisasi']

/**
 * Tidak pernah bisa disembunyikan, siapa pun dan apa pun yang dicentang admin.
 * Alasannya bukan teknis melainkan pengalaman pakai: orang yang berhak masuk modul
 * tapi dilempar keluar dari halaman depannya akan mengira akunnya rusak — dan
 * `izinLayar` melempar ke Beranda, jadi Beranda yang tertutup berarti lingkaran.
 */
const MENU_SELALU_TERBUKA: readonly MenuBlud[] = ['beranda']

/**
 * `penimpa` = izin yang diatur admin lewat Admin Panel untuk orang/peran ini
 * (perkecualian orang menang atas aturan peran — diselesaikan di sisi server oleh
 * `lib/blud/izin-server.ts`). `null`/tidak diisi berarti belum diatur: pakai `TABEL`.
 *
 * Argumennya dioper masuk, TIDAK dicari sendiri. Itu yang menjaga berkas ini tetap
 * modul daun — lihat catatan di kepala berkas.
 */
export function izinMenu(role: string, menu: MenuBlud, penimpa?: Izin | null): Izin {
  const aturan = TABEL[role]
  const bawaan = aturan ? (aturan.khusus?.[menu] ?? aturan.bawaan) : BAWAAN_TAK_TERDAFTAR
  const izin = penimpa ?? bawaan
  // Menu tanpa jalur tulis tidak pernah `EDIT`, siapa pun perannya dan apa pun yang
  // dicentang admin. Menyatakannya di sini menutup satu kelas salah paham:
  // "SUPER_ADMIN EDIT di Cetak" akan membuat orang mencari tombol simpan yang
  // memang tidak pernah ada. Dievaluasi SESUDAH penimpa — jadi tidak bisa ditembus.
  if (izin === 'EDIT' && MENU_BACA_SAJA.includes(menu)) return 'LIHAT'
  if (izin === 'TIDAK' && MENU_SELALU_TERBUKA.includes(menu)) return 'LIHAT'
  return izin
}

/** Boleh mengubah isi menu ini. */
export function bolehEdit(role: string, menu: MenuBlud, penimpa?: Izin | null): boolean {
  return izinMenu(role, menu, penimpa) === 'EDIT'
}

/** Boleh membuka layarnya — termasuk mengunduh. Unduh BUKAN aksi tulis (§3). */
export function bolehBuka(role: string, menu: MenuBlud, penimpa?: Izin | null): boolean {
  return izinMenu(role, menu, penimpa) !== 'TIDAK'
}

/** Menu yang layak muncul di ribbon, urut sesuai MENU_BLUD. */
export function menuTerbuka(role: string, penimpa?: Partial<Record<MenuBlud, Izin>>): MenuBlud[] {
  return MENU_BLUD.filter((m) => bolehBuka(role, m, penimpa?.[m] ?? null))
}

export function isMenuBlud(v: unknown): v is MenuBlud {
  return typeof v === 'string' && (MENU_BLUD as readonly string[]).includes(v)
}
