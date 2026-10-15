// lib/shared/waktu-wib.ts — stempel waktu WIB, satu sumber untuk semua modul.
//
// Lahir di `lib/blud/tanggal.ts` dan dipindah ke sini saat E-Anggaran butuh
// stempel yang sama untuk `kinerja_riwayat_simpan`; `tanggalHariIniWIB` dan
// `toDateStr` menyusul saat PK, BBA, dan RIMA memerlukannya (audit 2026-09-29).
// Dua modul yang memerlukan jam yang sama tidak boleh saling menjangkau ke berkas
// khas modul lain. `lib/blud/tanggal.ts` me-re-export semuanya supaya pemanggil
// lama tidak disentuh. Berkas ini sengaja tanpa impor — layar `'use client'` memakainya.

/** Selisih WIB terhadap UTC. */
export const JAKARTA_OFFSET_MS = 7 * 60 * 60 * 1000

/**
 * 'YYYY-MM-DD HH:MM:SS' menurut WIB, siap masuk kolom DATETIME.
 *
 * BUKAN `NOW()` MySQL: server bisa berjalan di UTC, dan pada dini hari WIB
 * keduanya jatuh di tanggal yang berbeda — cukup untuk membuat sebuah snapshot
 * mengaku milik hari kemarin.
 *
 * @param sekarang epoch ms — parameter hanya untuk pengujian.
 */
export function waktuSekarangWIB(sekarang: number = Date.now()): string {
  return new Date(sekarang + JAKARTA_OFFSET_MS).toISOString().slice(0, 19).replace('T', ' ')
}

/**
 * Tanggal hari ini menurut WIB ('YYYY-MM-DD'), bukan UTC.
 *
 * B4 (BLUD): `new Date().toISOString().slice(0, 10)` memulangkan tanggal KEMARIN
 * antara 00:00–06:59 WIB. Pindah ke sini (2026-09-29) karena PK memerlukannya untuk
 * tanggal bawaan dokumen, dan klien PK tidak boleh menjangkau berkas khas BLUD.
 *
 * @param sekarang epoch ms — parameter hanya untuk menguji batas pergantian hari.
 */
export function tanggalHariIniWIB(sekarang: number = Date.now()): string {
  return new Date(sekarang + JAKARTA_OFFSET_MS).toISOString().slice(0, 10) // tanggal-utc-ok: sudah digeser ke WIB
}

/**
 * Kolom DATE dari MySQL → 'YYYY-MM-DD'.
 *
 * Pool memakai `timezone: '+07:00'`, jadi mysql2 memulangkan kolom DATE sebagai
 * tengah malam WIB = 17:00 UTC hari SEBELUMNYA. `toISOString()` polos, maupun
 * `NextResponse.json` yang memanggilnya diam-diam, lalu menyebut tanggal kemarin.
 * Offset yang sama ditambahkan supaya string ISO-nya mewakili DATE aslinya —
 * tidak bergantung zona waktu proses Node.
 */
export function toDateStr(v: unknown): string {
  if (!v) return ''
  if (v instanceof Date) {
    return new Date(v.getTime() + JAKARTA_OFFSET_MS).toISOString().slice(0, 10) // tanggal-utc-ok: sudah digeser ke WIB
  }
  return String(v).slice(0, 10)
}

/**
 * Kolom DATETIME/TIMESTAMP dari MySQL → 'YYYY-MM-DD HH:MM:SS' (jam dinding WIB).
 *
 * mysql2 memulangkan objek Date, dan `String(Date)` = "Wed Oct 14 2026 13:41:35 GMT+0700 (…)":
 * tidak terbaca pemformat tanggal mana pun (panel Riwayat LKJIP menampilkannya mentah), dan
 * kalau dipotong 19 huruf jadi "Wed Oct 14 2026 13:". Teks berzona (ISO ber-Z) diperlakukan
 * sebagai satu saat lalu digeser ke WIB; teks tanpa zona dianggap sudah jam dinding WIB
 * (hasil `DATE_FORMAT` di SQL) dan hanya dirapikan bentuknya.
 */
export function toDatetimeStr(v: unknown): string {
  if (!v) return ''
  const saat = v instanceof Date ? v
    : typeof v === 'string' && /(Z|[+-]\d\d:?\d\d)$/.test(v.trim()) ? new Date(v.trim())
      : null
  if (saat) {
    return Number.isNaN(saat.getTime()) ? '' : new Date(saat.getTime() + JAKARTA_OFFSET_MS).toISOString().slice(0, 19).replace('T', ' ')
  }
  return String(v).slice(0, 19).replace('T', ' ')
}
