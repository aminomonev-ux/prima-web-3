// lib/blud/riwayat-konstanta.ts — tetapan riwayat simpan yang AMAN DI PERAMBAN.
//
// Dipisah dari `riwayat-simpan.ts` karena berkas itu mengimpor `@/lib/data/db`
// (mysql2). Satu komponen `'use client'` yang menarik satu angka dari sana ikut
// menyeret seluruh driver MySQL ke bundel peramban, dan Next gagal membangun:
// "Module not found: Can't resolve 'net'". Karena `app/(dashboard)/layout.tsx`
// ada di jejak impornya, yang mati bukan satu halaman melainkan seluruh rute
// dashboard — API pun memulangkan halaman error, bukan JSON.
//
// Pola yang sama sudah dipakai `toDateStr` di `tanggal.ts`: tetapan/utilitas
// murni tinggal di berkas tanpa impor DB, lalu berkas server me-re-export-nya
// supaya pemanggil lama tidak perlu disentuh.
//
// Aturannya sederhana: apa pun yang dibaca komponen `'use client'` tidak boleh
// tinggal serumah dengan `sql`.

/** Snapshot yang disimpan per (jenis, tahun) sebelum yang terlama dipangkas. */
export const RIWAYAT_RETENSI = 50
