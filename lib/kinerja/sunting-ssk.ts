// lib/kinerja/sunting-ssk.ts — berapa baris RKO di layar yang belum tersimpan.
//
// Dipakai pengingat "belum tersimpan" shell E-Anggaran dan penahan "Buat Perubahan":
// Buat Perubahan menyalin isi TERSIMPAN, jadi suntingan di layar yang belum disimpan
// tidak ikut tersalin lalu terbuang saat layar pindah ke versi baru — dan versi lamanya
// sudah terkunci. MURNI, tanpa impor.
// Konsep: docs/CONCEPT-kinerja-simpan-realisasi.md §4

export interface BarisSskSunting {
  canonical_id?: string | null
  uraian_ssk?:   string | null
  uraian?:       string | null
  program?:      string | null
  kegiatan?:     string | null
  subkegiatan?:  string | null
  pagu?:         number | string | null
  months?:       Record<string, unknown> | null
  is_nullified?: boolean | null
}

const KUNCI_BULAN = ['jan','feb','mar','apr','mei','jun','jul','agu','sep','okt','nov','des'] as const

const sen = (v: unknown) => Math.round((Number(v) || 0) * 100)

/** Yang diketik/diubah orang saja — `months_pct`, `total`, `urut` turunan atau diatur server. */
function sidik(r: BarisSskSunting): string {
  return JSON.stringify([
    String(r.canonical_id ?? ''), String(r.uraian_ssk ?? ''), String(r.uraian ?? ''),
    String(r.program ?? ''), String(r.kegiatan ?? ''), String(r.subkegiatan ?? ''),
    sen(r.pagu), ...KUNCI_BULAN.map(k => sen(r.months?.[k])), !!r.is_nullified,
  ])
}

/**
 * Jumlah baris yang berbeda dari isi tersimpan. Dicocokkan sebagai himpunan-ganda, bukan
 * per posisi: menyisipkan satu baris di tengah tidak boleh terbaca "semua baris sesudahnya
 * berubah". Baris yang disunting = satu sidik hilang + satu sidik baru → dihitung satu.
 */
export function jumlahSskBerubah(dasar: readonly BarisSskSunting[], layar: readonly BarisSskSunting[]): number {
  const sisa = new Map<string, number>()
  for (const r of dasar) { const s = sidik(r); sisa.set(s, (sisa.get(s) ?? 0) + 1) }
  let baru = 0
  for (const r of layar) {
    const s = sidik(r)
    const n = sisa.get(s) ?? 0
    if (n > 0) sisa.set(s, n - 1)
    else baru++
  }
  let hilang = 0
  for (const n of sisa.values()) hilang += n
  return Math.max(baru, hilang)
}
