// lib/blud/pratinjau-serapan.ts — hitungan Pratinjau Serapan (Tahap 2).
//
// Dipisah dari modalnya SUPAYA BISA DIUJI. Angka di layar itu menjanjikan apa
// yang nanti diputuskan `kunciDanPeriksaPagu` di server; kalau rumusnya menyimpang
// sedikit saja, layarnya bilang "aman" lalu transaksinya ditolak — persis
// kebingungan yang seharusnya dihapus fitur ini. Janji begitu harus bisa
// dibuktikan, bukan dibaca dari JSX.
//
// Rumus acuannya, dari `kunciDanPeriksaPagu`:
//   ditolak bila  terserap + nilai > pagu
//   kekurangan  = terserap + nilai − pagu
import { formatTanggalId } from './tanggal'

/** Ambang yang sama dengan `lebihPagu` di layar Realisasi — pecahan rupiah pada DECIMAL. */
export const EPS_PRATINJAU = 0.005

export interface BarisPratinjau {
  anggaran_key:  string
  kode_rekening: string
  uraian:        string
  pagu:          number
  /**
   * Serapan SETAHUN. Bukan "s/d bulan terpilih": pagar pagu server menjumlah
   * seluruh tahun tanpa saringan bulan, jadi memakai angka per-bulan di sini
   * melaporkan sisa yang lebih longgar dari kenyataan.
   */
  terserap:      number
  is_leaf:       boolean
}

export interface BarisDihitung extends BarisPratinjau {
  /** Rencana belanja yang diketik pengguna — tidak disimpan ke mana pun. */
  tambah:       number
  hasil:        number
  sisaSekarang: number
  sisaSetelah:  number
  /** > 0 berarti akan ditolak server. Rumusnya persis `BludPaguTerlampauiError.kekurangan`. */
  kurang:       number
}

export function hitungPratinjau(
  rows: readonly BarisPratinjau[],
  rencana: Readonly<Record<string, number>>,
): BarisDihitung[] {
  // Hanya baris terbawah yang bisa menerima realisasi — alokasi menempel di situ,
  // induk cuma penjumlahan. Menawarkan induk mengundang orang mengisi angka yang
  // tidak akan pernah bisa dipakai.
  return rows.filter(r => r.is_leaf).map((r) => {
    const tambah = rencana[r.anggaran_key] ?? 0
    const hasil  = r.terserap + tambah
    return {
      ...r,
      tambah,
      hasil,
      sisaSekarang: r.pagu - r.terserap,
      sisaSetelah:  r.pagu - hasil,
      kurang:       hasil - r.pagu,
    }
  })
}

export const akanMenembus = (r: BarisDihitung): boolean => r.kurang > EPS_PRATINJAU

/**
 * Urutan "paling mepet dulu" — tiga lapis, bukan sekadar `sisaSetelah` menaik.
 *
 * Menaik saja mengangkat ratusan rekening berpagu NOL yang belum tersentuh ke
 * puncak (sisanya nol, lebih kecil dari sisa positif mana pun) dan mengubur satu
 * baris yang benar-benar perlu dilihat. Rekening berpagu nol memang akan menolak
 * transaksi apa pun, tapi selama tidak ada yang berniat membelanjakannya ia bukan
 * kabar — begitu ada angka diketik ke sana, sisanya negatif dan ia naik sendiri
 * ke lapis pertama.
 */
export function bandingMepet(a: BarisDihitung, b: BarisDihitung): number {
  const lapis = (r: BarisDihitung) =>
    r.sisaSetelah < -EPS_PRATINJAU ? 0 : (r.pagu > 0 || r.terserap > 0) ? 1 : 2
  const la = lapis(a), lb = lapis(b)
  if (la !== lb) return la - lb
  // Di lapis berpagu yang dibandingkan sisa RELATIF: sisa Rp 1 juta dari pagu
  // Rp 2 juta jauh lebih genting daripada Rp 1 juta dari Rp 900 juta.
  if (la === 1) return (a.sisaSetelah / (a.pagu || 1)) - (b.sisaSetelah / (b.pagu || 1))
  return a.sisaSetelah - b.sisaSetelah
}

const rp = (n: number) => new Intl.NumberFormat('id-ID').format(Math.round(n))

/**
 * Daftar siap tempel untuk diteruskan ke penyusun anggaran — itu tindak lanjut
 * yang dituju layar ini ("3 rekening perlu digeser dulu").
 */
export function daftarPerluGeser(
  tahun: number,
  sumberVersi: string | null,
  jebol: readonly BarisDihitung[],
): string {
  const total = jebol.reduce((s, r) => s + r.kurang, 0)
  const baris = [...jebol]
    .sort((a, b) => b.kurang - a.kurang)
    .map(r => `${r.kode_rekening} ${r.uraian} — pagu Rp ${rp(r.pagu)}, `
      + `terserap Rp ${rp(r.terserap)}${r.tambah ? ` + rencana Rp ${rp(r.tambah)}` : ''}, `
      + `KURANG Rp ${rp(r.kurang)}`)
  // Kepala disusun terpisah, JANGAN `.filter(Boolean)` di akhir: baris kosong
  // pemisahnya ikut terbuang dan daftarnya menempel jadi satu blok.
  const kepala = [`Rekening yang perlu digeser — tahun anggaran ${tahun}`]
  if (sumberVersi) kepala.push(`Pagu acuan: versi ${formatTanggalId(sumberVersi)}`)
  return [...kepala, '', ...baris, '', `Total kekurangan: Rp ${rp(total)}`].join('\n')
}
