// lib/blud/segarkan.ts — syarat penyegar otomatis Beranda BLUD.
// Konsep: docs/CONCEPT-blud-beranda-panel-bergerak.md §5.3–5.4
//
// Dipisah dari berkas layar supaya syaratnya bisa DIUJI. Aturan yang cuma hidup
// di dalam `useEffect` hanya bisa dicocokkan ke teks sumbernya, dan syarat kedua
// di bawah ini terlalu mudah dilepas orang yang tidak tahu kenapa ia ada.

export const JEDA_SEGARKAN_MS = 3 * 60 * 1000
export const BATAS_DIAM_MS = 15 * 60 * 1000

/** Sama persis dengan daftar milik `SessionKeepAlive` — dua ukuran "aktif" yang berbeda malah membingungkan. */
export const PERISTIWA_AKTIF = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'click'] as const

/**
 * Boleh menyegarkan sekarang? DUA syarat, dan yang kedua bukan soal beban.
 *
 * `terlihat` — tab yang ditinggal ke Excel tiga jam akan menghitung ulang 60 kali
 * tanpa pernah dilihat siapa pun.
 *
 * `diamMs` — sesi idle mati di menit ke-60 (`IDLE_TIMEOUT_MS`), tapi cap
 * `lastActive` di server hanya diperbarui oleh ping keepalive yang jalan TIAP 10
 * MENIT. Jadi sesi di server bisa mati sekitar menit ke-52 sementara hitung
 * mundur di layar baru jatuh di menit ke-60. Selama ini celah itu tak terlihat —
 * tak ada yang bicara ke server di rentang tersebut. Penyegar otomatis akan
 * bicara: tembakan di menit ke-54 dijawab "sesi habis" lalu orangnya dilempar ke
 * halaman login persis saat modal "Sesi akan habis, 04:12" sedang terbuka. Bukan
 * lubang keamanan — arahnya justru lebih ketat — tapi modal peringatan yang
 * sengaja dibuat itu jadi sia-sia.
 *
 * Ambang 15 menit membuat penyegar TIDAK PERNAH menembak di jendela peringatan
 * menit 55–60.
 *
 * Penyegarnya sendiri tidak memperpanjang sesi: `lastActive` hanya distempel di
 * `createToken`, dan itu cuma dipanggil oleh `/api/auth/login` dan
 * `/api/auth/keepalive`. `router.refresh()` tidak menyentuh keduanya dan tidak
 * menerbitkan satu pun peristiwa di `PERISTIWA_AKTIF`. Tab yang ditinggal tetap
 * logout di menit ke-60.
 */
export function bolehSegarkan(o: { terlihat: boolean; diamMs: number }): boolean {
  return o.terlihat && o.diamMs < BATAS_DIAM_MS
}

/**
 * "14:32" dari `YYYY-MM-DD HH:MM:SS` — stempel "diperbarui" di kepala Beranda.
 *
 * Jamnya distempel SERVER saat menghitung halaman, bukan klien saat menekan
 * tombol. Dua sebab: `router.refresh()` menjalankan ulang server component-nya
 * sehingga stempelnya ikut berganti sendiri tanpa satu pun state di klien, dan
 * yang ingin diketahui orang memang "angka ini dari jam berapa", bukan "saya
 * menekan tombolnya jam berapa" — kalau servernya lambat, keduanya berbeda.
 */
export function jamPendek(waktu: string): string {
  return waktu.slice(11, 16)
}
