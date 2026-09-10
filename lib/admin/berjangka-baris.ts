// lib/admin/berjangka-baris.ts — aturan murni akses berjangka (P2).
// Konsep: docs/CONCEPT-pusat-akses-satu-pintu.md §12 P2 (Tahap 10).
//
// BERKAS DAUN. Dibaca panel `'use client'` DAN `akses-berjangka.ts` di sisi server, jadi
// ia TIDAK BOLEH mengimpor apa pun yang menyeret `next/headers`, mysql2, atau
// `NextResponse` — preseden Tahap 5, saat satu impor nilai merobohkan seluruh rute
// /admin dengan `tsc` dan ESLint sama-sama lulus.

/**
 * Berapa hari sebelum tenggat pemegang & admin diberi tahu.
 *
 * Gunanya bukan sopan santun: perpanjangan harus jadi KEPUTUSAN, bukan kejutan. Akses
 * yang mati mendadak di tengah pekerjaan melatih orang meminta jangka yang
 * kepanjangan-panjangan supaya tidak kena dua kali — dan itu membatalkan seluruh fitur.
 */
export const HARI_PERINGATAN = 3

/** `YYYY-MM-DD`. Bentuk yang sama dengan `<input type="date">` dan kolom DATE MySQL. */
export const RE_TANGGAL = /^\d{4}-\d{2}-\d{2}$/

export type BarisBerjangka = {
  appKey: string
  /** `YYYY-MM-DD` — hari TERAKHIR akses masih berlaku. */
  berakhir: string
  alasan: string
}

/**
 * Selisih HARI KALENDER, bukan selisih jam dibagi 24.
 *
 * Keduanya berbeda jawaban tepat di sekitar tengah malam dan pada hari pergantian waktu,
 * dan yang ditanyakan orang memang "berapa hari lagi" — bukan "berapa kali 24 jam".
 * Dihitung di UTC supaya jam lokal peramban tidak ikut menggeser hasilnya; keduanya
 * tanggal polos tanpa jam, jadi tidak ada yang hilang.
 *
 * `null` = tanggalnya tidak berbentuk yang dikenal. Bukan 0: nol berarti "berakhir hari
 * ini", dan itu jawaban yang sangat berbeda dari "tidak tahu".
 */
export function sisaHari(berakhir: string, hariIni: string): number | null {
  if (!RE_TANGGAL.test(berakhir) || !RE_TANGGAL.test(hariIni)) return null
  const a = Date.parse(`${berakhir}T00:00:00Z`)
  const b = Date.parse(`${hariIni}T00:00:00Z`)
  if (Number.isNaN(a) || Number.isNaN(b)) return null
  return Math.round((a - b) / 86_400_000)
}

const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']

/** `2026-09-30` → `30 Sep 2026`. String kosong untuk yang tidak berbentuk tanggal. */
export function tanggalSingkat(iso: string): string {
  if (!RE_TANGGAL.test(iso)) return ''
  const [y, m, d] = iso.split('-')
  return `${d} ${BULAN[Number(m) - 1] ?? m} ${y}`
}

/**
 * Kalimat di baris modul: "terbuka sampai 30 Sep 2026 (12 hari lagi)".
 *
 * Sisa harinya DITULIS, bukan cuma tanggalnya. Tanggal saja menuntut orang menghitung
 * sendiri, dan yang perlu diputuskan justru bergantung pada hasil hitungan itu.
 */
export function labelJangka(berakhir: string, hariIni: string): string {
  const tgl = tanggalSingkat(berakhir)
  if (!tgl) return ''
  const sisa = sisaHari(berakhir, hariIni)
  if (sisa === null) return `terbuka sampai ${tgl}`
  if (sisa < 0) return `sudah lewat ${tgl} — menunggu pencabutan otomatis`
  if (sisa === 0) return `terbuka sampai ${tgl} (hari terakhir)`
  return `terbuka sampai ${tgl} (${sisa} hari lagi)`
}

/** Tenggat yang sudah lewat atau tinggal ≤ HARI_PERINGATAN — dipakai layar untuk menyorot. */
export function perluPerhatian(berakhir: string, hariIni: string): boolean {
  const sisa = sisaHari(berakhir, hariIni)
  return sisa !== null && sisa <= HARI_PERINGATAN
}

/**
 * Tenggat yang boleh disimpan untuk seorang pemakai.
 *
 * DUA saringan, dan yang kedua yang penting: tenggat hanya berlaku bagi modul yang
 * benar-benar DIBERIKAN per orang. Memasang tanggal pada modul yang terbuka karena
 * PERAN tidak akan menutup apa pun saat tanggalnya lewat — pintunya tidak digerakkan
 * oleh `app_access` — jadi yang tersisa cuma janji yang tidak ditepati sistem, dan itu
 * lebih buruk daripada tidak menawarkannya sama sekali.
 */
export function jangkaYangBerarti(
  dipilih: readonly string[],
  jangka: Readonly<Record<string, { berakhir: string; alasan: string }>>,
): BarisBerjangka[] {
  const punya = new Set(dipilih)
  return Object.entries(jangka)
    .filter(([kunci, v]) => punya.has(kunci) && RE_TANGGAL.test(v.berakhir) && v.alasan.trim().length > 0)
    .map(([appKey, v]) => ({ appKey, berakhir: v.berakhir, alasan: v.alasan.trim() }))
    .sort((a, b) => (a.appKey < b.appKey ? -1 : a.appKey > b.appKey ? 1 : 0))
}
