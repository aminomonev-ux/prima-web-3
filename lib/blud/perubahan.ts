// lib/blud/perubahan.ts — aturan LAYAR DPA Perubahan (konsep §5, §7, §10, §12).
//
// Fungsi murni, aman untuk klien: dipisah dari `dpa-client.tsx` supaya bisa diuji
// sungguhan, bukan dicocokkan ke teks sumbernya (pola `hitungPratinjau`,
// `salin-versi.ts`). Sisi server ada di `perubahan-data.ts` & `data.ts`.

import { penandaUntukVersi, type PenandaPerubahan } from './sumber-pagu'
import { formatTanggalId } from './tanggal'
import type { DpaBarisInput } from '@/types'

/** Babak Perubahan sebuah versi DPA (1, 2, …); `null` = murni. */
export function keBabak(penanda: readonly PenandaPerubahan[], versi: string): number | null {
  const p = penandaUntukVersi([...penanda], versi)
  return p ? penanda.indexOf(p) + 1 : null
}

/**
 * Lencana di daftar & pil versi (pola `catatanVersi` layar Pergeseran). Tahun yang
 * belum punya Perubahan tidak diberi lencana sama sekali — "MURNI" di setiap baris
 * cuma menambah bising tanpa membedakan apa pun.
 */
export function catatanBabak(penanda: readonly PenandaPerubahan[], versi: string): string | undefined {
  if (!penanda.length) return undefined
  const ke = keBabak(penanda, versi)
  return ke ? `PERUBAHAN KE-${ke}` : 'MURNI'
}

/**
 * Jenis sumber pagu untuk label "Pagu dari …" — SATU rumus untuk layar Realisasi,
 * Buku Kas, dan Beranda (konsep §8). Tanpa Perubahan bunyinya persis seperti dulu.
 */
export function jenisSumberPagu(s: { sumber: string; perubahan_ke?: number | null }): string {
  const ke = s.perubahan_ke ?? null
  if (s.sumber === 'PERGESERAN') return ke ? `Pergeseran (DPA Perubahan ke-${ke})` : 'Pergeseran'
  return ke ? `DPA Perubahan ke-${ke}` : 'DPA'
}

/** Baris yang sudah ada sebelum Perubahan — server mengisi Sebelum-nya lewat `anggaran_key`. */
export const berSebelum = (r: Pick<DpaBarisInput, 'jumlah_sebelum'>): boolean => r.jumlah_sebelum != null

/** Bertambah/(Berkurang): baris yang lahir di Perubahan dihitung dari nol. Tidak disimpan (§6). */
export function selisihSebelum(r: Pick<DpaBarisInput, 'jumlah' | 'jumlah_sebelum'>): number {
  return Number(r.jumlah ?? 0) - Number(r.jumlah_sebelum ?? 0)
}

/** "+15.000.000" · "(10.000.000)" · "0" — gaya dokumen anggaran, bukan tanda minus. */
export function formatSelisih(n: number, fmt: (x: number) => string): string {
  if (Math.abs(n) < 0.005) return '0'
  return n > 0 ? `+${fmt(n)}` : `(${fmt(-n)})`
}

/**
 * Total baris AKAR, Sebelum vs Sesudah — "Sebelum Rp 180 jt → Sesudah Rp 210 jt
 * (+30 jt)". Akar saja, bukan seluruh baris: induk sudah menjumlah anaknya, jadi
 * menjumlah semua menghitung tiap rupiah sedalam pohonnya (pelajaran `totalAkarDpa`).
 */
export function totalSebelumSesudah(rows: readonly Pick<DpaBarisInput, 'parent_id' | 'row_id' | 'jumlah' | 'jumlah_sebelum'>[]): {
  sebelum: number; sesudah: number; selisih: number
} {
  const ids = new Set(rows.map(r => r.row_id))
  const akar = rows.filter(r => !r.parent_id || !ids.has(r.parent_id))
  const sebelum = akar.reduce((s, r) => s + Number(r.jumlah_sebelum ?? 0), 0)
  const sesudah = akar.reduce((s, r) => s + Number(r.jumlah ?? 0), 0)
  return { sebelum, sesudah, selisih: sesudah - sebelum }
}

/**
 * R4 di layar: "hapus" pada baris yang sudah ada sebelum Perubahan berarti
 * MENOLKAN (vol & harga dikosongkan, baris tetap tercatat "Rp X → Rp 0"); yang lahir
 * di Perubahan tetap bisa dihapus biasa. Server menolak simpanan yang membuang baris
 * dasar, jadi layar yang menghapusnya hanya menunda penolakan sampai tombol Simpan.
 *
 * Induk dipertahankan kalau ada keturunannya yang dipertahankan — kalau tidak, baris
 * lama yang dinolkan kehilangan induknya. Yang dinolkan hanya DAUN; induk angkanya
 * dijumlah ulang dari anak oleh pemanggil (`recalcDpaJumlah`).
 */
export function hapusAtauNolkan<T extends Pick<DpaBarisInput, 'row_id' | 'parent_id' | 'vol' | 'harga' | 'jumlah' | 'jumlah_sebelum'>>(
  rows: readonly T[], target: ReadonlySet<string>,
): { rows: T[]; dinolkan: number; dihapus: number } {
  const anak = new Map<string, string[]>()
  for (const r of rows) if (r.parent_id) anak.set(r.parent_id, [...(anak.get(r.parent_id) ?? []), r.row_id])
  const byId = new Map(rows.map(r => [r.row_id, r]))
  const pertahankan = new Set<string>()
  const periksa = (id: string): boolean => {
    const r = byId.get(id)
    if (!r) return false
    let tetap = !target.has(id) || berSebelum(r)
    for (const c of anak.get(id) ?? []) if (periksa(c)) tetap = true
    if (tetap) pertahankan.add(id)
    return tetap
  }
  for (const r of rows) if (!r.parent_id || !byId.has(r.parent_id)) periksa(r.row_id)
  let dinolkan = 0
  const hasil: T[] = []
  for (const r of rows) {
    if (!pertahankan.has(r.row_id)) continue
    const daun = !(anak.get(r.row_id) ?? []).some(c => pertahankan.has(c))
    if (target.has(r.row_id) && daun) {
      dinolkan++
      hasil.push({ ...r, vol: null, harga: null, jumlah: 0 })
    } else {
      hasil.push(r)
    }
  }
  return { rows: hasil, dinolkan, dihapus: rows.length - hasil.length }
}

/**
 * Alasan tombol "Jadikan DPA Perubahan" mati ('' = boleh). Cermin pagar §5.1 di
 * `saveDpa`: sasaran harus SESUDAH semua versi DPA. Tanpa cermin ini orang mengisi
 * seluruh layar dulu, lalu baru ditolak saat Simpan.
 */
export function alasanKunciPerubahan(a: {
  sumber: 'PERGESERAN' | 'DPA' | 'KOSONG' | null
  dpaTerakhir: string | null
  sasaran: string
}): string {
  if (!a.sumber) return 'Sumber pagu tahun ini sedang dimuat.'
  if (a.sumber === 'KOSONG') return 'Tahun ini belum punya DPA — belum ada angka yang bisa dijadikan dasar Perubahan.'
  if (a.dpaTerakhir && a.dpaTerakhir >= a.sasaran) {
    return a.dpaTerakhir === a.sasaran
      ? `${formatTanggalId(a.sasaran)} sudah punya simpanan DPA. DPA Perubahan harus jadi versi baru — simpan besok, atau hapus dulu versi hari ini kalau salah simpan.`
      : `Sudah ada versi DPA ${formatTanggalId(a.dpaTerakhir)}. DPA Perubahan harus sesudahnya — pilih periode bulan berjalan.`
  }
  return ''
}

// ─── Sakelar "Tampilkan kolom Sebelum" ───────────────────────────────────────
// Kenyamanan per orang, jadi localStorage — dan dibungkus try/catch: jendela privat
// atau data situs yang diblokir membuat aksesornya melempar. Bawaannya NYALA (§7):
// kolom selisih membantu saat menyunting.

export const KUNCI_TAMPIL_SEBELUM = 'prima.blud.dpa.tampil-sebelum'

export function bacaTampilSebelum(): boolean {
  try {
    return window.localStorage.getItem(KUNCI_TAMPIL_SEBELUM) !== '0'
  } catch {
    return true
  }
}

export function simpanTampilSebelum(nyala: boolean): void {
  try {
    window.localStorage.setItem(KUNCI_TAMPIL_SEBELUM, nyala ? '1' : '0')
  } catch { /* gagal menyimpan pilihan bukan alasan menahan layar */ }
}
