// lib/admin/tinjauan-baris.ts — bentuk & perhitungan satu baris Tinjauan Akses.
// Konsep: docs/CONCEPT-pusat-akses-satu-pintu.md §12 P3 & P11 (Tahap 8).
//
// BERKAS DAUN. Ia dibaca komponen `'use client'` (layar Tinjauan menyusun berkas Excel
// di peramban) DAN oleh `tinjauan.ts` di sisi server. Karena itu ia TIDAK BOLEH
// mengimpor apa pun yang menyeret `next/headers`, mysql2, atau `NextResponse`.
//
// Ini bukan kehati-hatian teoretis: Tahap 5 sudah kena persis di sini — satu impor nilai
// dari berkas ber-mysql2 menyeret `auth.ts` ke bundel peramban dan seluruh rute /admin
// balas 500, dengan pesan yang menunjuk berkas yang sama sekali bukan penyebabnya.
// `tsc` lulus, ESLint lulus. Lihat kepala `lib/admin/pintu-akses.ts`.
//
// Aturan aksesnya TIDAK ditulis ulang di sini — `barisPintu` yang sama dengan pagar
// sungguhannya. Layar tinjauan yang menghitung aksesnya sendiri akan meninjau sesuatu
// yang bukan keadaan yang berlaku.

import { MODUL_APPS } from '@/lib/registry/apps'
import { barisPintu } from '@/lib/admin/pintu-akses'

/** Berapa bulan sebelum sebuah tinjauan dianggap kedaluwarsa. */
export const BULAN_TINJAUAN = 6

/**
 * Kolom modul yang MUNCUL di matriks: hanya yang bisa diberikan per orang.
 *
 * Modul yang tidak bisa di-grant (`admin`) tidak punya apa pun untuk ditinjau — akses
 * ke sana ditentukan peran, dan yang meninjau peran adalah tab Peran. Menampilkannya
 * di sini cuma menambah kolom yang tidak bisa ditindaklanjuti dari baris itu.
 */
export const MODUL_TINJAUAN = MODUL_APPS.filter((m) => m.bolehDigrant).map((m) => ({
  kunci: m.kunci, label: m.label,
}))

/** `grant` = diberikan per orang (bisa dicabut di sini). `peran`/`semua` = bukan urusan layar ini. */
export type SumberAkses = 'grant' | 'peran' | 'semua' | null

export type BarisTinjauan = {
  id: number
  username: string
  nama: string | null
  peran: string
  status: string
  loginTerakhir: string | null
  ditinjauPada: string | null
  ditinjauOleh: string | null
  /** Sejajar `MODUL_TINJAUAN`, urutannya sama. */
  akses: SumberAkses[]
  /** Berapa modul yang benar-benar DIBERIKAN — itu yang perlu diputuskan tiap tinjauan. */
  jumlahGrant: number
  kedaluwarsa: boolean
}

export type BarisMentah = {
  id: number; username: string; nama_lengkap: string | null; role: string; status: string
  last_login: string | null; app_access: unknown
  access_reviewed_at: string | null; peninjau: string | null
  kedaluwarsa: number
}

/**
 * MURNI — dipisah dari pembacaan DB supaya bisa diuji dengan data buatan, dan supaya
 * pengekspor menerima BARIS YANG SUDAH DIHITUNG alih-alih menghitung ulang. Dua tempat
 * yang menghitung tabel yang sama cepat atau lambat memberi angka berbeda, dan yang
 * paling merugikan justru saat itu terjadi di dokumen yang dilampirkan ke auditor
 * (pelajaran yang sudah mahal di rekap E-Anggaran).
 */
export function susunBaris(mentah: readonly BarisMentah[]): BarisTinjauan[] {
  return mentah.map((u) => {
    const grant = Array.isArray(u.app_access) ? (u.app_access as string[]) : []
    const pintu = barisPintu(u.role, grant)
    const akses: SumberAkses[] = MODUL_TINJAUAN.map((m) => {
      const b = pintu.find((x) => x.kunci === m.kunci)
      if (!b || !b.terbuka) return null
      return b.keadaan === 'grant' ? 'grant' : b.keadaan === 'semua' ? 'semua' : 'peran'
    })
    return {
      id: u.id,
      username: u.username,
      nama: u.nama_lengkap,
      peran: u.role,
      status: u.status,
      loginTerakhir: u.last_login,
      ditinjauPada: u.access_reviewed_at,
      ditinjauOleh: u.peninjau,
      akses,
      jumlahGrant: akses.filter((a) => a === 'grant').length,
      kedaluwarsa: Number(u.kedaluwarsa) === 1,
    }
  })
}

// ─── Bahan ekspor (P11) ──────────────────────────────────────────────────────

const LABEL_SUMBER: Record<Exclude<SumberAkses, null>, string> = {
  grant: 'diberi akses',
  peran: 'dari peran',
  semua: 'terbuka untuk semua',
}

/**
 * Baris → AOA untuk Excel. MURNI, dan ia menerima baris yang SUDAH dihitung layar.
 *
 * Itu aturan yang sudah mahal dipelajari di rekap E-Anggaran: dokumen yang diunduh wajib
 * memuat angka yang persis sama dengan yang di layar, dan menghitung ulang di pengekspor
 * adalah dua sumber kebenaran untuk satu tabel. Di sini taruhannya lebih besar lagi —
 * berkasnya dilampirkan ke auditor.
 */
export function tinjauanKeAoa(baris: readonly BarisTinjauan[]): (string | number | null)[][] {
  const kepala = [
    'Username', 'Nama', 'Peran', 'Status', 'Login terakhir',
    ...MODUL_TINJAUAN.map((m) => m.label),
    'Jumlah diberi akses', 'Ditinjau terakhir', 'Ditinjau oleh',
  ]
  const isi = baris.map((b) => [
    b.username,
    b.nama ?? '',
    b.peran,
    b.status,
    b.loginTerakhir ? tglSingkat(b.loginTerakhir) : 'belum pernah',
    ...b.akses.map((a) => (a ? LABEL_SUMBER[a] : '')),
    b.jumlahGrant,
    b.ditinjauPada ? tglSingkat(b.ditinjauPada) : 'belum pernah',
    b.ditinjauOleh ?? '',
  ])
  return [kepala, ...isi]
}

function tglSingkat(v: string): string {
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('id-ID', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  })
}
