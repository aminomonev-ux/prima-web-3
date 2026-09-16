// lib/security/sesi.ts — memutus sesi seseorang.
//
// A7 (2026-09-16). Ganti peran SENGAJA tidak mencabut sesi (T-2,
// CONCEPT-pusat-akses-satu-pintu.md §5.1): melempar orang ke /login di tengah
// pengisian terlalu mahal untuk perubahan yang biasanya rutin. Penggantinya
// `POST /api/auth/keepalive` yang membaca `users.role` segar dari DB lalu
// menandatangani ulang tokennya.
//
// Yang perlu diluruskan angkanya: "paling lama ~1 menit" berlaku untuk klien yang
// MENGIRIM keepalive, dan keepalive dipicu klien. Orang yang perannya baru diturunkan
// dan ingin mempertahankannya cukup menutup tab lalu memakai cookie-nya dari `curl` —
// tidak ada keepalive, token tidak pernah disegarkan, dan peran lamanya hidup sampai
// batas diam 60 menit (`SESSION_INACTIVE_MINUTES`, dihitung dari `lastActive` di dalam
// token yang hanya bergerak saat keepalive). Bukan satu menit; sampai satu jam.
//
// Karena itu pemutusan ditawarkan sebagai PILIHAN di saat perannya diubah, mati secara
// bawaan — bukan dipaksakan, dan bukan pula dibiarkan tidak ada. Beda antara "rutin"
// dan "mendesak" hanya diketahui orang yang sedang menekan tombolnya, pada detik itu;
// kode tidak bisa menyimpulkannya.
import type { Penanya } from '@/lib/data/db';

/**
 * Menandai semua sesi aktif seseorang sebagai dicabut. Memulangkan jumlah sesi yang
 * benar-benar tersentuh.
 *
 * Menerima `Penanya` supaya bisa dipanggil DI DALAM transaksi yang mengubah perannya
 * (L69-b). Itu bukan kerapian: kalau pemutusan berdiri di koneksi lain dan perubahan
 * perannya gagal lalu di-rollback, orangnya terlempar keluar demi perubahan yang tidak
 * pernah terjadi.
 *
 * Tidak menyentuh baris sesi milik siapa pun selain `userId`, jadi aman dipanggil oleh
 * admin yang sedang mengubah dirinya sendiri — ia ikut terputus, dan itu memang
 * akibat yang benar.
 *
 * `getSession` sudah memeriksa pencabutan ini, jadi tidak ada yang perlu ditambahkan
 * di sisi pembacaan.
 */
export async function putusSesiPengguna(q: Penanya, userId: number): Promise<number> {
  const res = await q`
    UPDATE user_sessions SET invalidated_at = NOW()
     WHERE user_id = ${userId} AND invalidated_at IS NULL
  `;
  return (res[0] as { affectedRows?: number })?.affectedRows ?? 0;
}
