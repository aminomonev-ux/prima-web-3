// lib/kinerja/tutup-bulan.ts — aturan Tutup Bulan Realisasi E-Anggaran.
//
// MURNI dan aman-klien: dipakai server (pagar) DAN layar (tombol, alasan tombol mati).
// Akses DB-nya di `tutup-bulan-data.ts`.
// Konsep: docs/CONCEPT-kinerja-simpan-realisasi.md §5

import { NAMA_BULAN, type PelanggaranTertutup } from './banding-realisasi'
// `import type` — terhapus saat kompilasi, jadi layar tidak ikut menarik mysql2.
import type { SumberSSK } from '@/lib/data/kinerja'

/**
 * Gembok realisasi satu (tahun, sumber) — dipegang Simpan Realisasi DAN Tutup/Buka
 * Bulan. Satu gembok untuk keduanya itu yang membuat menutup bulan mustahil terselip
 * di tengah sebuah Simpan.
 */
export const REALISASI_LOCK_ENTITY = 'kinerja_realisasi'
export const realisasiLockKey = (tahun: string, sumber: SumberSSK) => `${tahun}:${sumber}`

export interface BulanTertutup {
  bulan:        number
  ditutup_oleh: string | null
  ditutup_pada: string   // 'YYYY-MM-DD HH:MM:SS' WIB
}

/**
 * Bulan ditutup BERURUTAN: n hanya bisa ditutup kalau 1..n−1 sudah. Angka "s/d bulan"
 * menjumlah bulan-bulan sebelumnya, jadi menutup Agustus sementara Juli masih terbuka
 * membuat akumulasi Agustus yang dilaporkan tetap bisa bergeser.
 * Memulangkan `null` kalau boleh.
 */
export function alasanTolakTutup(tertutup: readonly number[], bulan: number): string | null {
  if (!Number.isInteger(bulan) || bulan < 1 || bulan > 12) return 'Bulan tidak dikenal.'
  const ada = new Set(tertutup)
  if (ada.has(bulan)) return `${NAMA_BULAN[bulan - 1]} sudah ditutup.`
  for (let b = 1; b < bulan; b++) {
    if (!ada.has(b)) return `Tutup ${NAMA_BULAN[b - 1]} dulu — bulan ditutup berurutan, karena angka "s/d bulan" menjumlah bulan-bulan sebelumnya.`
  }
  return null
}

/** Yang bisa dibuka hanya bulan tertutup TERAKHIR — alasan yang sama dengan urutan menutup. */
export function alasanTolakBuka(tertutup: readonly number[], bulan: number): string | null {
  if (!Number.isInteger(bulan) || bulan < 1 || bulan > 12) return 'Bulan tidak dikenal.'
  if (!tertutup.includes(bulan)) return `${NAMA_BULAN[bulan - 1]} belum ditutup.`
  const terakhir = Math.max(...tertutup)
  if (bulan !== terakhir) {
    return `Buka ${NAMA_BULAN[terakhir - 1]} dulu — yang bisa dibuka hanya bulan tertutup terakhir, supaya angka "s/d bulan" yang sudah ditutup tidak ikut bergeser.`
  }
  return null
}

export class KinerjaBulanTertutupError extends Error {
  constructor(public pelanggaran: PelanggaranTertutup[]) {
    super(kalimatPelanggaran(pelanggaran))
    this.name = 'KinerjaBulanTertutupError'
  }
}

/** "Agustus sudah ditutup — angkanya tidak bisa diubah: Belanja ATK (real keuangan), …" */
export function kalimatPelanggaran(p: readonly PelanggaranTertutup[], maks = 5): string {
  if (p.length === 0) return ''
  const bulan = [...new Set(p.map(x => x.bulan))].sort((a, b) => a - b).map(b => NAMA_BULAN[b - 1])
  const contoh = p.slice(0, maks).map(x =>
    `${x.label} (${NAMA_BULAN[x.bulan - 1]}, ${x.kolom === 'real_keuangan' ? 'real keuangan' : 'real fisik'})`)
  const sisa = p.length - maks
  return `${bulan.join(', ')} sudah ditutup — angkanya tidak bisa diubah. `
    + `Yang berbeda: ${contoh.join('; ')}${sisa > 0 ? `; dan ${sisa} lainnya` : ''}.`
}

// ─── RKO: peringatan target bulan tertutup ───────────────────────────────────

export interface BarisRko {
  canonical_id?: string | null
  uraian?:       string | null
  uraian_ssk?:   string | null
  pagu?:         number | string | null
  months?:       Record<string, unknown> | null
}

export interface PerubahanTargetTertutup {
  label: string
  /** null = pagu (menggeser persen SEMUA bulan, termasuk yang tertutup). */
  bulan: number | null
  lama:  number
  baru:  number
}

const KUNCI_BULAN = ['jan','feb','mar','apr','mei','jun','jul','agu','sep','okt','nov','des'] as const

const sen = (v: unknown) => Math.round((Number(v) || 0) * 100)

/**
 * Target bulan tertutup (dan pagu) yang akan berubah kalau RKO ini disimpan. Bukan
 * pagar — koreksi RKO itu sah — tapi capaian & deviasi bulan yang sudah dilaporkan ikut
 * bergeser bila versi ini dipakai sebagai pembanding, jadi orangnya harus tahu.
 */
export function perubahanTargetTertutup(
  lama: readonly BarisRko[], baru: readonly BarisRko[], tertutup: ReadonlySet<number>,
): PerubahanTargetTertutup[] {
  if (tertutup.size === 0) return []
  const kunci = (r: BarisRko, i: number, sisi: string) =>
    String(r.canonical_id ?? '').trim() || `${sisi}#${i}`
  const pLama = new Map(lama.map((r, i) => [kunci(r, i, 'lama'), r]))
  const pBaru = new Map(baru.map((r, i) => [kunci(r, i, 'baru'), r]))
  const hasil: PerubahanTargetTertutup[] = []
  const label = (r: BarisRko) => String(r.uraian || r.uraian_ssk || '(tanpa nama)')

  for (const k of new Set([...pLama.keys(), ...pBaru.keys()])) {
    const l = pLama.get(k)
    const b = pBaru.get(k)
    const r = (b ?? l) as BarisRko
    if (sen(l?.pagu) !== sen(b?.pagu)) {
      hasil.push({ label: label(r), bulan: null, lama: sen(l?.pagu) / 100, baru: sen(b?.pagu) / 100 })
    }
    for (const bulan of [...tertutup].sort((x, y) => x - y)) {
      const m = KUNCI_BULAN[bulan - 1]
      if (!m) continue
      const a = sen(l?.months?.[m])
      const z = sen(b?.months?.[m])
      if (a !== z) hasil.push({ label: label(r), bulan, lama: a / 100, baru: z / 100 })
    }
  }
  return hasil
}

export class KinerjaTargetTertutupError extends Error {
  constructor(public perubahan: PerubahanTargetTertutup[], public tertutup: number[]) {
    super(kalimatTargetTertutup(perubahan, tertutup))
    this.name = 'KinerjaTargetTertutupError'
  }
}

export function kalimatTargetTertutup(p: readonly PerubahanTargetTertutup[], tertutup: readonly number[], maks = 5): string {
  const rentang = [...tertutup].sort((a, b) => a - b).map(b => NAMA_BULAN[b - 1])
  const nama = (x: PerubahanTargetTertutup) => x.bulan === null ? `${x.label} (pagu)` : `${x.label} (target ${NAMA_BULAN[x.bulan - 1]})`
  const contoh = p.slice(0, maks).map(nama)
  const sisa = p.length - maks
  return `Realisasi ${rentang.join(', ')} sudah ditutup. Simpanan ini mengubah ${p.length} angka yang `
    + `dipakai menghitung capaian & deviasi bulan-bulan itu: ${contoh.join('; ')}${sisa > 0 ? `; dan ${sisa} lainnya` : ''}. `
    + `Laporan bulan tertutup ikut bergeser bila versi ini jadi pembanding.`
}
