// lib/admin/pintu-akses.ts — aturan "pintu modul terbuka, dan KENAPA".
// Konsep: docs/CONCEPT-pusat-akses-satu-pintu.md §4.5a (Tahap 5 / Fase C).
//
// BERKAS DAUN. Ia dibaca komponen `'use client'` (Pusat Akses menghitung ulang tiap
// centang digeser, tanpa menembak server) DAN oleh `pusat-akses.ts` di sisi server.
// Karena itu ia TIDAK BOLEH mengimpor apa pun yang menyeret `next/headers`, mysql2,
// atau `NextResponse`.
//
// Ini bukan kehati-hatian teoretis: versi pertamanya tinggal di `pusat-akses.ts`
// bersama pembacaan DB, dan satu impor `getRoleQuota` dari `lib/security/promotion.ts`
// menyeret `verifyPassword` → `auth.ts` → `next/headers` ke bundel peramban. Seluruh
// rute /admin balas 500 dengan pesan yang menunjuk `auth.ts`, bukan penyebabnya.
// Preseden yang sama sudah tercatat di kepala `lib/registry/apps.ts`.
//
// Aturan aksesnya sendiri TIDAK ditulis ulang di sini — ia memanggil `bolehMasukModul`
// yang sama dengan pagar sungguhannya. Yang ditambahkan cuma kalimat sebabnya.

import { ROLE_LABELS } from '@/lib/constants'
import { MODUL_APPS, bolehMasukModul, type Modul } from '@/lib/registry/apps'
import type { Izin, InfoMenu } from '@/lib/registry/menu-apps'

export type KeadaanPintu =
  | 'semua'        // terbuka untuk semua peran — grant tidak menambah apa pun
  | 'peran'        // terbuka karena perannya — mencabut centang tidak menutupnya
  | 'grant'        // terbuka karena diberi akses — inilah yang bisa dicabut
  | 'tertutup'     // bisa diberikan, belum diberikan
  | 'tak-digrant'  // memang tidak bisa diberikan lewat app_access

export type BarisPintu = {
  kunci: string
  label: string
  href: string
  punyaMenu: boolean
  terbuka: boolean
  keadaan: KeadaanPintu
  /** Kalimat yang tampil di kolom kedua. Selalu terisi — termasuk saat tertutup. */
  sebab: string
  /** Kotak centangnya berarti? `false` = dimatikan, dan `sebab` yang menjelaskan kenapa. */
  bisaDicentang: boolean
  dicentang: boolean
}

/**
 * Satu baris per modul, lengkap dengan sebab.
 *
 * Kolom sebab bukan hiasan: ia yang membuat kotak centang jujur. Modal lama menampilkan
 * sepuluh centang tanpa membedakan "terbuka karena peran" dari "terbuka karena diberi
 * akses" — jadi mencabut centang pada seorang ADMIN terlihat seperti menutup pintu,
 * padahal ADMIN ada di `peranBawaan` delapan modul dan tidak ada yang tertutup (T-6).
 * Kotak yang tidak berarti DIMATIKAN, dan kalimatnya yang menjelaskan; kotak mati tanpa
 * sebab adalah keluhan UX yang sudah tercatat (L79c).
 */
export function barisPintu(role: string, appAccess: readonly string[] | null): BarisPintu[] {
  const punya = new Set(appAccess ?? [])
  const namaPeran = ROLE_LABELS[role] ?? role
  return MODUL_APPS.map((m: Modul): BarisPintu => {
    const dasar = {
      kunci: m.kunci, label: m.label, href: m.href, punyaMenu: m.punyaMenu,
      terbuka: bolehMasukModul(m.kunci, role, [...punya]),
    }
    if (m.peranBawaan === 'SEMUA') {
      return { ...dasar, keadaan: 'semua', bisaDicentang: false, dicentang: punya.has(m.kunci),
        sebab: 'Terbuka untuk semua peran — memberi akses di sini tidak menambah apa pun.' }
    }
    if (m.peranBawaan.includes(role)) {
      return { ...dasar, keadaan: 'peran', bisaDicentang: false, dicentang: punya.has(m.kunci),
        sebab: `Terbuka karena peran ${namaPeran} — mencabut centang tidak menutupnya.` }
    }
    if (!m.bolehDigrant) {
      return { ...dasar, keadaan: 'tak-digrant', bisaDicentang: false, dicentang: false,
        sebab: `Hanya untuk ${m.peranBawaan.map((r) => ROLE_LABELS[r] ?? r).join(', ')} — tidak bisa diberikan satu per satu.` }
    }
    return punya.has(m.kunci)
      ? { ...dasar, keadaan: 'grant', bisaDicentang: true, dicentang: true,
          sebab: 'Terbuka karena diberi akses — mencabut centang akan menutupnya.' }
      : { ...dasar, keadaan: 'tertutup', bisaDicentang: true, dicentang: false,
          sebab: 'Tertutup. Peran ini tidak mendapatkannya dengan sendirinya.' }
  })
}

/**
 * Kunci yang boleh benar-benar ditulis ke `users.app_access`.
 *
 * Layar sudah mematikan kotak yang tidak berarti, tapi penyaring ini tetap ada di
 * server: centang yang lolos untuk modul "terbuka karena peran" akan menuliskan grant
 * yang tidak membuka apa pun, lalu muncul lagi di Pemeriksaan Mandiri sebagai temuan
 * "pemberian akses yang tidak menambah apa-apa" — layar ini justru yang seharusnya
 * mencegahnya lahir.
 */
export function grantYangBerarti(role: string, dipilih: readonly string[]): string[] {
  const bisa = new Set(barisPintu(role, null).filter((b) => b.bisaDicentang).map((b) => b.kunci))
  return [...new Set(dipilih.filter((k) => bisa.has(k)))].sort()
}

// ─── Bentuk berkas orang ─────────────────────────────────────────────────────
// Tipenya tinggal di berkas DAUN, bukan di `pusat-akses.ts` yang membaca DB. Sebabnya
// bukan kerapian: `import type` memang terhapus saat kompilasi, tapi menaruh tipe di
// berkas ber-mysql2 mengundang impor nilai yang tidak sengaja dari komponen klien —
// dan kegagalannya baru terlihat saat halaman dibuka, dengan pesan yang menunjuk
// `auth.ts` alih-alih barisnya.

export type BlokMenu = {
  appKey: string
  label: string
  menus: readonly InfoMenu[]
  /** Hasil akhir yang berlaku untuk orang ini. */
  efektif: Record<string, Izin>
  /** Yang akan berlaku kalau perkecualiannya dibuang — bawaan kode + aturan perannya. */
  bawaanPeran: Record<string, Izin>
  /** Perkecualian yang tersimpan untuk orang ini. */
  orang: Record<string, Izin>
  /** Sidik jari keadaan tersimpan, dikirim balik saat menyimpan (L48/409 BERUBAH). */
  versi: string
}

export type BerkasOrang = {
  user: {
    id: number; username: string; nama_lengkap: string | null; email: string
    role: string; status: string; last_login: string | null; created_at: string | null
    promotion_locked_until: string | null
    probationary_until: string | null; probationary_from_role: string | null
    deleted_at: string | null
  }
  sesiAktif: number
  /**
   * "Masih terkunci" & "masih dalam masa percobaan" dijawab SERVER lewat SQL, bukan
   * dibandingkan di peramban. Dua sebab: membandingkan stempel DB dengan jam peramban
   * salah begitu jamnya meleset, dan menghitungnya saat render adalah fungsi tak murni
   * yang hasilnya bisa berganti sendiri di antara dua render.
   */
  promosiTerkunci: boolean
  masaPercobaan: boolean
  kuota: { peran: string; terpakai: number; kuota: number | null }
  pintu: BarisPintu[]
  menu: BlokMenu[]
  appAccess: string[]
  /**
   * P2 — tenggat per modul yang DIBERIKAN. Kuncinya sama dengan `appAccess`; modul yang
   * tidak disebut berarti tanpa batas waktu.
   *
   * Ikut di berkas ini, bukan diambil layar lewat panggilan kedua: dua pemuatan berarti
   * dua keadaan yang bisa berbeda kalau ada yang menyimpan di selanya, dan yang kedua
   * inilah yang menentukan kalimat "12 hari lagi" di layar.
   */
  jangka: Record<string, { berakhir: string; alasan: string }>
}
