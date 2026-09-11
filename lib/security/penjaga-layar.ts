// lib/security/penjaga-layar.ts — penjaga setingkat modul untuk LAYOUT sebuah modul.
// Konsep: docs/CONCEPT-pusat-akses-satu-pintu.md §12 P5 (Tahap 9).
//
// Dibuat saat menutup sisa Tahap 9: IKI, E-LKJIP, dan Buku Besar Aset tidak memeriksa
// sakelar maintenance di layar sama sekali. Route API-nya sudah menolak lewat
// `buatGuardModul`, tapi mengetik alamatnya saat modulnya dimatikan tetap membuka
// layarnya penuh — lalu SETIAP panggilan dibalas 503. Yang dilihat orang bukan halaman
// pemeliharaan melainkan layar rusak, dan itu keadaan yang paling sulit dilaporkan
// dengan benar ("IKI-nya error", padahal sedang sengaja dimatikan). Bentuk T-1/L72.
//
// SATU fungsi, bukan tiga salinan: yang dijaga di sini bukan cuma "panggil dua
// pemeriksaan" melainkan URUTANNYA, dan urutan yang disalin tiga kali cepat atau lambat
// terbalik di salah satunya tanpa ada yang menyadarinya.
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { cekModul, modul, urlPemeliharaan } from '@/lib/registry/apps'
import { hasAppAccess, modulSedangMati } from '@/lib/security/guard'
import { infoBeku, TIDAK_BEKU, type InfoBeku } from '@/lib/security/beku'

/**
 * Sesi → AKSES → sakelar, dalam urutan itu. Urutannya menentukan, bukan selera:
 *
 * Kalau sakelar diperiksa lebih dulu, orang yang memang TIDAK BERHAK atas modul ini
 * akan diberi halaman pemeliharaan — ia lalu menunggu modulnya "hidup lagi" untuk
 * sesuatu yang tidak akan pernah terbuka untuknya. Aksesnya dulu, jadi yang tidak
 * berhak dipulangkan ke `/menu` seperti biasa, dan halaman pemeliharaan hanya dilihat
 * orang yang memang akan bisa masuk begitu sakelarnya dinyalakan.
 *
 * Urutan yang sama sudah berlaku di `blud/layout.tsx` dan `perjanjian-kinerja/layout.tsx`
 * sejak Tahap 9; fungsi ini membawanya ke modul yang belum punya.
 *
 * Aturan aksesnya diambil dari registry (`cekModul`), bukan `is<Modul>Role` — ketiganya
 * memang sudah pembungkus tipis `bolehMasukModul`, dan mengambilnya dari registry
 * membuat modul berikutnya ikut tanpa satu daftar pun disentuh.
 *
 * `role` dioper ke `modulSedangMati` supaya PERAN_TEMBUS_SAKELAR berlaku: yang mematikan
 * modul harus tetap bisa masuk memeriksanya.
 *
 * Dipanggil dari LAYOUT, bukan `page.tsx`: ketiga modul ini punya halaman penuh kedua
 * (`/iki/[id]`, `/lkjip/[id]`, `/buku-besar-aset/master`), dan penjaga di halaman daftar
 * tidak menutup pintu editor — padahal tautan langsung ke editor justru yang paling
 * sering dipakai.
 */
export async function jagaLayarModul(kunci: string): Promise<void> {
  const h = await headers()
  const userId = h.get('x-user-id')
  const role = h.get('x-user-role')
  if (!userId || !role) redirect('/login')
  if (!(await hasAppAccess(Number(userId), role, cekModul(kunci)))) redirect('/menu')
  // Sakelarnya dibaca dari registry — daftar kesekian yang mengetik `app_status_iki`
  // adalah daftar kesekian yang bisa ketinggalan.
  const sakelar = modul(kunci)?.sakelar
  if (sakelar && (await modulSedangMati([sakelar], { role }))) redirect(urlPemeliharaan(sakelar))
}

/**
 * Keterangan pembekuan untuk layar sebuah modul — pendamping `jagaLayarModul`.
 *
 * Ada di berkas yang sama dan bukan dipanggil langsung dari tiap layar karena yang
 * dijaga di sini sebuah PASANGAN: kunci sakelar yang dipakai spanduk WAJIB kunci yang
 * sama dengan yang dipakai penjaganya. Kalau tiap layar mengetiknya sendiri, satu salah
 * ketik menghasilkan layar yang dijaga sakelar A tapi menjelaskan sakelar B — dan
 * karena keduanya nyaris selalu `online`, selisih itu tidak menimbulkan gejala apa pun
 * sampai hari modulnya benar-benar dibekukan.
 *
 * Modul tanpa sakelar dijawab TIDAK_BEKU, bukan dilempar: `modul()` memulangkan `null`
 * untuk kunci yang tidak dikenal, dan spanduk yang hilang tidak membuka satu pintu pun
 * (pagarnya berdiri di `modulMati`, yang tetap menolak).
 */
export async function bekuLayarModul(kunci: string): Promise<InfoBeku> {
  const sakelar = modul(kunci)?.sakelar
  if (!sakelar) return TIDAK_BEKU
  const h = await headers()
  return infoBeku([sakelar], h.get('x-user-role') ?? undefined)
}
