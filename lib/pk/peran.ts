// lib/pk/peran.ts — izin dua sumbu modul Perjanjian Kinerja: peran × menu.
// Konsep: docs/CONCEPT-pk-peran.md
//
// MODUL DAUN — tidak mengimpor apa pun, sama seperti `lib/blud/peran.ts`. Ribbon
// dan tombol di klien memakainya tanpa ikut menarik `next/server` maupun data
// layer. Begitu berkas ini butuh impor, pikir dua kali: ia akan menyeret server ke
// bundel klien, dan layar mulai memakai salinan aturannya sendiri.
//
// Tabel ini dibaca DUA pihak dan itu syaratnya: ribbon (menyembunyikan tile &
// tombol) dan tiap route (pagar sungguhannya). Kalau hanya ribbon yang membacanya,
// yang dibuat cuma dekorasi.

export const MENU_PK = [
  'beranda', 'sasaran', 'program', 'form', 'riwayat', 'pejabat', 'unit-kerja',
] as const
export type MenuPk = typeof MENU_PK[number]

/** EDIT = boleh mengubah · LIHAT = boleh membuka & MENGUNDUH · TIDAK = ditolak. */
export type Izin = 'EDIT' | 'LIHAT' | 'TIDAK'

export const LABEL_MENU_PK: Record<MenuPk, string> = {
  'beranda':    'Beranda',
  'sasaran':    'Master Sasaran',
  'program':    'Master Program',
  'form':       'Form PK',
  'riwayat':    'Riwayat',
  'pejabat':    'Master Pejabat',
  'unit-kerja': 'Master Unit',
}

const PERAN_ADMIN_PK: readonly string[] = ['SUPER_ADMIN', 'ADMIN']

/**
 * Dua menu yang hari ini tertutup untuk semua orang selain SUPER_ADMIN/ADMIN —
 * `pejabat/page.tsx:17` dan `unit-kerja/page.tsx:15` sama-sama `redirect` sebelum
 * apa pun dirender.
 *
 * Ditulis di sini supaya kenyataan itu terbaca di satu tempat, dan supaya ribbon
 * ikut tahu. Hari ini kedua tile-nya tetap muncul untuk RENBANG dan langsung
 * memantul balik ke Beranda saat diklik — pintu yang kelihatan tapi selalu tertutup.
 *
 * Bukan larangan mutlak: `penimpa` dari Admin Panel menang atas ini. Itu memang
 * gunanya modul ini — admin bisa membuka Master Pejabat untuk satu orang secara
 * sadar, alih-alih meminta developer mengubah kode.
 */
const MENU_TERTUTUP_BAWAAN: readonly MenuPk[] = ['pejabat', 'unit-kerja']

/**
 * Lantai keras yang TIDAK bisa ditembus matriks Admin Panel — dua route menolaknya
 * lewat cek `session.role` langsung, dan itu keputusan yang dipertahankan:
 *
 * - `pejabat` — memuat nama, NIP, dan jabatan orang (PII).
 *   (`pejabat/route.ts:76`, `pejabat/import/route.ts:35`)
 * - `unit-kerja` — mengganti nama unit meng-*cascade* ke `pk_pejabat` dan pemetaan
 *   BLUD; satu salah ketik menulis ulang rujukan di banyak tempat sekaligus.
 *   (`units/route.ts:63`)
 *
 * Daftar ini dibaca `_guard.ts` (sebagai DAN, bukan pengganti) dan matriks Admin
 * Panel lewat `editHanyaPeran` di registry (mematikan sel yang tidak akan berefek).
 * Tanpa keduanya, admin bisa memutar saklar "boleh ubah", layar menampilkan tombol
 * Simpan, lalu route membalas 403 — pagar di API tapi tidak di layar (L69).
 */
export const LANTAI_EDIT: Partial<Record<MenuPk, readonly string[]>> = {
  'pejabat':    PERAN_ADMIN_PK,
  'unit-kerja': PERAN_ADMIN_PK,
}

export function lantaiEditMenghalangi(role: string, menu: MenuPk): boolean {
  const lantai = LANTAI_EDIT[menu]
  return !!lantai && !lantai.includes(role)
}

interface AturanPeran {
  /** Berlaku untuk menu yang tidak disebut di `khusus`. */
  bawaan: Izin
  khusus?: Partial<Record<MenuPk, Izin>>
}

/**
 * DITURUNKAN dari perilaku hari ini, bukan dikarang: `PK_ALLOWED_ROLES` (boleh masuk)
 * dan `PK_EDIT_ROLES` (boleh ubah) di `lib/data/pk-schemas.ts`. Dengan kedua tabel
 * izin kosong — keadaan di hari pertama, dan bisa jadi selamanya — hasilnya wajib
 * identik dengan sebelum berkas ini ada.
 *
 * Hanya penyimpangan dari `bawaan` yang ditulis, supaya niatnya kelihatan. Master
 * Pejabat & Master Unit tidak perlu ditulis di tiap baris: `MENU_TERTUTUP_BAWAAN`
 * yang mengurusnya, dan menuliskannya dua kali membuat dua sumber kebenaran yang
 * cepat atau lambat berselisih.
 */
const TABEL: Record<string, AturanPeran> = {
  // Admin sistem & admin staf: seluruh modul.
  SUPER_ADMIN: { bawaan: 'EDIT' },
  ADMIN:       { bawaan: 'EDIT' },

  // Penyusun PK.
  ADMIN_KASUBAG: { bawaan: 'EDIT' },
  RENBANG:       { bawaan: 'EDIT' },
  PROGRAM:       { bawaan: 'EDIT' },

  // Kepala bagian: peninjau baca-saja. Ini bukan kelalaian melainkan keputusan
  // Sprint 0 yang sudah berlaku hari ini lewat `isPkEditRole` — peran yang ada di
  // ALLOWED tapi tidak di EDIT.
  ADMIN_KABAG: { bawaan: 'LIHAT' },
}

/**
 * Peran ber-grant yang belum masuk tabel.
 *
 * `LIHAT` — sama dengan BLUD. Bukan `TIDAK`: mereka sudah lolos pemeriksaan
 * `app_access`, jadi memang sengaja diberi akses. Bukan `EDIT`: peran yang belum
 * dipikirkan tidak boleh diam-diam mewarisi wewenang menulis.
 *
 * **Ini PERUBAHAN PERILAKU yang disengaja (2026-08-03), bukan penurunan otomatis.**
 * Sebelumnya `isPkEditRole` (`pk-schemas.ts:68-73`) mengembalikan `true` untuk peran
 * mana pun di luar allow-list yang punya grant `perjanjian_kinerja` — artinya peran
 * sub-bidang ber-grant berwenang LEBIH BESAR daripada ADMIN_KABAG yang sengaja
 * dibuat peninjau. Grant yang dimaksudkan "beri dia akses" ternyata berarti "beri
 * dia akses penuh". Temuan itu ditulis di `docs/CONCEPT-pk-peran.md` §5.2.
 *
 * Yang hilang tidak hilang selamanya: wewenang mengubah dikembalikan dengan
 * mencentang menunya di matriks Admin Panel, per peran atau per orang. Bedanya
 * sekarang itu keputusan yang diambil seseorang, bukan akibat samping dari grant.
 */
const BAWAAN_TAK_TERDAFTAR: Izin = 'LIHAT'

/**
 * Menu tanpa jalur tulis sama sekali — bukan kebijakan, melainkan kenyataan: tidak
 * ada route yang mengubah angka resmi dari sana. Beranda cuma ringkasan.
 *
 * Aturan untuk menu baru: sebuah menu boleh bertingkat `EDIT` hanya kalau ada route
 * yang benar-benar mengubah angka resmi. Penentunya bukan metode HTTP dan bukan
 * namanya — `download` itu GET tapi bisa mencatat jejak, `import` terdengar menulis
 * padahal cuma pratinjau.
 */
export const MENU_BACA_SAJA_PK: readonly MenuPk[] = ['beranda']

/**
 * Tidak pernah bisa disembunyikan. Alasannya bukan teknis melainkan pengalaman
 * pakai: orang yang berhak masuk modul tapi dilempar keluar dari halaman depannya
 * akan mengira akunnya rusak — dan `izinLayar` melempar ke Beranda, jadi Beranda
 * yang tertutup berarti lingkaran.
 */
const MENU_SELALU_TERBUKA: readonly MenuPk[] = ['beranda']

/**
 * `penimpa` = izin yang diatur admin lewat Admin Panel untuk orang/peran ini
 * (perkecualian orang menang atas aturan peran — diselesaikan di sisi server oleh
 * `lib/pk/izin-server.ts`). `null`/tidak diisi berarti belum diatur: pakai `TABEL`.
 *
 * Argumennya dioper masuk, TIDAK dicari sendiri. Itu yang menjaga berkas ini tetap
 * modul daun — lihat catatan di kepala berkas.
 *
 * `LANTAI_EDIT` sengaja TIDAK dievaluasi di sini. Fungsi ini menjawab "izin apa yang
 * diberikan kepada peran ini untuk menu ini"; lantai menjawab "siapa yang boleh
 * menyentuh datanya", pertanyaan berbeda yang berlaku walau izinnya EDIT.
 * Menggabungkannya membuat matriks Admin Panel menampilkan LIHAT untuk sel yang
 * sebetulnya tersimpan EDIT — admin akan mengira setelannya tidak tersimpan.
 */
export function izinMenu(role: string, menu: MenuPk, penimpa?: Izin | null): Izin {
  const aturan = TABEL[role]
  const dariTabel = aturan ? (aturan.khusus?.[menu] ?? aturan.bawaan) : BAWAAN_TAK_TERDAFTAR
  const bawaan = MENU_TERTUTUP_BAWAAN.includes(menu) && !PERAN_ADMIN_PK.includes(role)
    ? 'TIDAK'
    : dariTabel
  const izin = penimpa ?? bawaan
  // Dievaluasi SESUDAH penimpa — jadi tidak bisa ditembus lewat Admin Panel.
  if (izin === 'EDIT' && MENU_BACA_SAJA_PK.includes(menu)) return 'LIHAT'
  if (izin === 'TIDAK' && MENU_SELALU_TERBUKA.includes(menu)) return 'LIHAT'
  return izin
}

/**
 * Boleh mengubah isi menu ini. Sudah memperhitungkan `LANTAI_EDIT` — inilah yang
 * dipakai pagar route dan tombol di layar, supaya keduanya tidak pernah berbeda
 * pendapat. Yang butuh izin mentahnya (matriks Admin Panel) memanggil `izinMenu`.
 */
export function bolehEdit(role: string, menu: MenuPk, penimpa?: Izin | null): boolean {
  if (lantaiEditMenghalangi(role, menu)) return false
  return izinMenu(role, menu, penimpa) === 'EDIT'
}

/** Boleh membuka layarnya — termasuk mengunduh. Unduh BUKAN aksi tulis. */
export function bolehBuka(role: string, menu: MenuPk, penimpa?: Izin | null): boolean {
  return izinMenu(role, menu, penimpa) !== 'TIDAK'
}

/** Menu yang layak muncul di ribbon, urut sesuai MENU_PK. */
export function menuTerbuka(role: string, penimpa?: Partial<Record<MenuPk, Izin>>): MenuPk[] {
  return MENU_PK.filter((m) => bolehBuka(role, m, penimpa?.[m] ?? null))
}

export function isMenuPk(v: unknown): v is MenuPk {
  return typeof v === 'string' && (MENU_PK as readonly string[]).includes(v)
}
