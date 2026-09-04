// lib/kinerja/riwayat-konstanta.ts — tetapan riwayat simpan yang AMAN DI PERAMBAN.
//
// Dipisah dari `riwayat-simpan.ts` karena berkas itu mengimpor `@/lib/data/db`
// (mysql2). Satu komponen `'use client'` yang menarik satu angka dari sana ikut
// menyeret seluruh driver MySQL ke bundel peramban, dan Next gagal membangun:
// "Module not found: Can't resolve 'net'". Bukan dugaan — itu persis yang terjadi
// pada `RIWAYAT_RETENSI` versi BLUD, dan yang mati bukan satu halaman melainkan
// seluruh rute dashboard.

/** Snapshot yang disimpan per (jenis, tahun, sumber, versi) sebelum yang terlama dipangkas. */
export const RIWAYAT_RETENSI_KINERJA = 50
