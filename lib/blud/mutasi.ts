// lib/blud/mutasi.ts — catatan perpindahan: dari rekening mana ke rekening mana.
// Konsep: docs/CONCEPT-blud-catatan-perpindahan.md
//
// Kolom `bertambah_berkurang` cuma satu angka bertanda, jadi rekening yang
// ditambah DAN dikurangi kehilangan separuh ceritanya. Kolom Bertambah/Berkurang
// (L86) menambal itu, tapi harus diketik tangan — dan begitu pagunya dibetulkan,
// uraiannya tidak bisa disesuaikan sendiri: dari 45/12 ke selisih +30 ada dua
// jawaban yang sama-sama sah (42/12 dan 45/15) dan tidak ada dasar memilih.
//
// Catatan perpindahan menghapus tebakan itu, karena sisi mana yang berubah sudah
// dinyatakan waktu mengubahnya.
//
// PAGU TETAP PATOKAN. Catatan ini PENJELASAN, bukan sumber angka: `pergeseran`
// adalah kolom yang dibaca sisi Realisasi sebagai pagu, dan membalik arahnya
// menggoyang seluruh modul itu beserta pagar yang menahan transaksi melebihi
// pagu (konsep §3).
import type { UraianGeser } from './urai-geser'

/** Toleransi banding DECIMAL(18,2) — sama dengan EPS_URAIAN. */
export const EPS_MUTASI = 0.005

export interface MutasiInput {
  /** `row_id` baris asal, pada versi yang sama. */
  dari_row: string
  ke_row: string
  nilai: number
  keterangan?: string | null
}

/** Baris yang cukup untuk diperiksa terhadap catatan perpindahan. */
export interface BarisMutasi {
  row_id: string
  parent_id: string | null
  kode_rekening?: string
  uraian?: string
  jumlah?: number | null
  pergeseran?: number | null
}

const n = (v: number | null | undefined) => Number(v ?? 0)

/** Ada isinya? Dipakai di banyak tempat — dijadikan fungsi supaya artinya satu. */
export function adaMutasi(mutasi: readonly MutasiInput[] | null | undefined): boolean {
  return !!mutasi && mutasi.length > 0
}

/**
 * Masuk & keluar tiap baris menurut catatan perpindahan.
 *
 * Hanya baris yang benar-benar disebut yang muncul di peta. Baris yang tidak
 * pernah jadi asal maupun tujuan TIDAK diberi entri nol — bedanya penting:
 * `uraiGeser` memakai ketiadaan entri untuk memutuskan baris itu belum
 * dijelaskan catatan mana pun.
 */
export function ringkasMutasi(mutasi: readonly MutasiInput[]): Map<string, UraianGeser> {
  const peta = new Map<string, UraianGeser>()
  const ambil = (rowId: string) => {
    const ada = peta.get(rowId)
    if (ada) return ada
    const baru = { bertambah: 0, berkurang: 0 }
    peta.set(rowId, baru)
    return baru
  }
  for (const m of mutasi) {
    const v = n(m.nilai)
    if (v <= 0) continue
    ambil(m.ke_row).bertambah += v
    ambil(m.dari_row).berkurang += v
  }
  return peta
}

export interface MutasiTidakCocok {
  row_id: string
  kode_rekening: string
  uraian: string
  catatan: number
  selisih: number
}

/**
 * Baris DAUN yang disebut catatan tapi angkanya tidak sesuai pagunya.
 *
 * Daun saja, alasan yang sama dengan `periksaUraian`: induk angkanya dijumlah
 * dari anak, jadi ia tidak punya geseran sendiri untuk dicocokkan. Perpindahan
 * yang menunjuk baris induk memang ditolak lebih awal (`periksaSasaranMutasi`).
 */
export function periksaMutasi(
  rows: readonly BarisMutasi[],
  mutasi: readonly MutasiInput[],
): MutasiTidakCocok[] {
  if (!adaMutasi(mutasi)) return []
  const punyaAnak = new Set<string>()
  for (const r of rows) if (r.parent_id) punyaAnak.add(r.parent_id)

  const ringkas = ringkasMutasi(mutasi)
  const salah: MutasiTidakCocok[] = []
  for (const r of rows) {
    if (punyaAnak.has(r.row_id)) continue
    const u = ringkas.get(r.row_id)
    if (!u) continue
    const catatan = u.bertambah - u.berkurang
    const selisih = n(r.pergeseran) - n(r.jumlah)
    if (Math.abs(catatan - selisih) <= EPS_MUTASI) continue
    salah.push({
      row_id: r.row_id,
      kode_rekening: r.kode_rekening ?? '',
      uraian: r.uraian ?? '',
      catatan, selisih,
    })
  }
  return salah
}

/** Pesan penolakan yang MENYEBUT rekeningnya — "tidak cocok" tanpa nama tidak bisa ditindaklanjuti. */
export function pesanMutasiTidakCocok(salah: readonly MutasiTidakCocok[]): string {
  const rp = (v: number) => `Rp ${Math.round(v).toLocaleString('id-ID')}`
  const contoh = salah.slice(0, 3).map(s =>
    `${s.kode_rekening || s.uraian || s.row_id}: catatan ${rp(s.catatan)}, `
    + `sedangkan pagunya bergeser ${rp(s.selisih)}`)
  const sisa = salah.length > 3 ? ` (dan ${salah.length - 3} baris lain)` : ''
  return `Catatan perpindahan tidak cocok dengan pagunya — ${contoh.join('; ')}${sisa}. `
    + `Betulkan nilai perpindahannya, atau kembalikan Harga P rekening itu.`
}

export interface SasaranSalah {
  alasan: 'TIDAK_ADA' | 'INDUK' | 'SAMA' | 'NILAI'
  pesan: string
}

/**
 * Pagar bentuk: perpindahan harus menunjuk baris DAUN yang ada di dokumen ini,
 * dua baris berbeda, dengan nilai positif.
 *
 * Dipakai route SEBELUM `periksaMutasi` — mencocokkan angka pada baris yang
 * tidak ada tidak berarti apa-apa.
 */
export function periksaSasaranMutasi(
  rows: readonly BarisMutasi[],
  mutasi: readonly MutasiInput[],
): SasaranSalah[] {
  const ada = new Set(rows.map(r => r.row_id))
  const punyaAnak = new Set<string>()
  for (const r of rows) if (r.parent_id) punyaAnak.add(r.parent_id)
  const nama = new Map(rows.map(r => [r.row_id, r.kode_rekening || r.uraian || r.row_id]))

  const salah: SasaranSalah[] = []
  for (const m of mutasi) {
    for (const sisi of [m.dari_row, m.ke_row]) {
      if (!ada.has(sisi)) {
        salah.push({ alasan: 'TIDAK_ADA', pesan: `Perpindahan menunjuk baris yang tidak ada di dokumen ini (${sisi}).` })
      } else if (punyaAnak.has(sisi)) {
        salah.push({ alasan: 'INDUK', pesan: `Perpindahan tidak boleh menunjuk baris induk (${nama.get(sisi)}) — angkanya dijumlah dari anaknya.` })
      }
    }
    if (m.dari_row === m.ke_row) {
      salah.push({ alasan: 'SAMA', pesan: `Perpindahan dari dan ke rekening yang sama (${nama.get(m.dari_row) ?? m.dari_row}).` })
    }
    if (!(n(m.nilai) > 0)) {
      salah.push({ alasan: 'NILAI', pesan: `Nilai perpindahan harus lebih dari nol.` })
    }
  }
  return salah
}

/**
 * Baris yang pantas diberi spanduk "belum tercatat asalnya".
 *
 * Patokannya BARIS, bukan dokumen (konsep §4.1b). Rancangan pertama memakai
 * syarat "versi ini sudah punya catatan", dan pemakai pertama langsung menemukan
 * bolongnya: pada dokumen baru spanduknya tidak pernah muncul, jadi orang harus
 * menggulung balik ke bilah alat untuk sesuatu yang sedang ia kerjakan tepat di
 * depan matanya.
 *
 * @param digeserSesiIni  `row_id` yang disentuh `updateVolHarga` sejak halaman dimuat.
 */
export function barisPerluCatatan(
  rows: readonly BarisMutasi[],
  mutasi: readonly MutasiInput[],
  digeserSesiIni: ReadonlySet<string>,
): Set<string> {
  const punyaAnak = new Set<string>()
  for (const r of rows) if (r.parent_id) punyaAnak.add(r.parent_id)
  const disebut = ringkasMutasi(mutasi)
  const dokumenSudahMulai = adaMutasi(mutasi)

  const perlu = new Set<string>()
  for (const r of rows) {
    if (punyaAnak.has(r.row_id)) continue
    if (Math.abs(n(r.pergeseran) - n(r.jumlah)) <= EPS_MUTASI) continue
    if (disebut.has(r.row_id)) continue
    if (digeserSesiIni.has(r.row_id) || dokumenSudahMulai) perlu.add(r.row_id)
  }
  return perlu
}

export interface TebakanPasangan {
  dari_row: string
  ke_row: string
  nilai: number
}

/**
 * Tebakan pasangan untuk spanduk pintu 0 — HANYA kalau jawabannya tunggal.
 *
 * Satu rekening turun dan satu naik dengan nilai yang sama persis: cuma ada satu
 * cara memasangkannya, jadi menebaknya bukan mengarang. Dua turun dan tiga naik
 * bisa dipasangkan belasan cara, dan menebak di situ menghasilkan dokumen yang
 * terlihat rapi dan salah — memulangkan `null` jauh lebih baik.
 *
 * Tebakan ini pun tetap harus DIKONFIRMASI orangnya: yang ditolak sejak awal
 * bukan menebaknya, melainkan menyimpan tebakan diam-diam (konsep §7).
 */
export function tebakPasangan(rows: readonly BarisMutasi[]): TebakanPasangan | null {
  const punyaAnak = new Set<string>()
  for (const r of rows) if (r.parent_id) punyaAnak.add(r.parent_id)

  const naik: BarisMutasi[] = []
  const turun: BarisMutasi[] = []
  for (const r of rows) {
    if (punyaAnak.has(r.row_id)) continue
    const d = n(r.pergeseran) - n(r.jumlah)
    if (d > EPS_MUTASI) naik.push(r)
    else if (d < -EPS_MUTASI) turun.push(r)
  }
  if (naik.length !== 1 || turun.length !== 1) return null

  const nilaiNaik = n(naik[0].pergeseran) - n(naik[0].jumlah)
  const nilaiTurun = n(turun[0].jumlah) - n(turun[0].pergeseran)
  if (Math.abs(nilaiNaik - nilaiTurun) > EPS_MUTASI) return null

  return { dari_row: turun[0].row_id, ke_row: naik[0].row_id, nilai: nilaiNaik }
}

/** Total dokumen — dipakai spanduk pintu 0 & ringkasan modal. */
export function totalMutasi(mutasi: readonly MutasiInput[]): number {
  let t = 0
  for (const m of mutasi) if (n(m.nilai) > 0) t += n(m.nilai)
  return t
}

/** Catatan yang menunjuk baris yang sudah tidak ada — dilepas saat baris dihapus. */
export function buangMutasiYatim(
  rows: readonly { row_id: string }[],
  mutasi: readonly MutasiInput[],
): MutasiInput[] {
  const ada = new Set(rows.map(r => r.row_id))
  return mutasi.filter(m => ada.has(m.dari_row) && ada.has(m.ke_row))
}
