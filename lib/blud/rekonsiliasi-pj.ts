// lib/blud/rekonsiliasi-pj.ts — "selisih Rekap PJ itu dari mana", dijawab habis.
// Konsep: docs/konsep/blud/CONCEPT-blud-audit-pj-pintar.md. MURNI, aman-klien.
//
// Total anggaran (T, `totalDpaBlud`) dan total rekap PJ (G, `auditRekapPJ.grandTotal`)
// dipecah jadi POS yang masing-masing menyebut barisnya dan dampaknya:
//
//   T − G = Σ celah + Σ induk-tak-cocok + Σ PJ-di-luar-anggaran   (+ sisa, harus 0)
//
//   celah  cabang TERTINGGI yang seluruhnya tanpa PJ (dirinya, leluhurnya, keturunannya).
//          Bernilai + → rekap KURANG; bernilai − → rekap LEBIH.
//   induk  simpul di jalur tanpa PJ yang angkanya ≠ jumlah anaknya: rekap anak-anaknya
//          tidak bisa mencapai (atau melewati) angka induk yang masuk total anggaran.
//   luar   baris ber-PJ yang TIDAK berada di bawah total anggaran (induknya hilang / akar
//          lain) — uangnya masuk rekap tapi tidak masuk total → rekap LEBIH.
//
// Daftar "belum entry" lama memuat induk yang sebagian anaknya sudah ber-PJ, jadi
// uang yang sama terhitung di tiap tingkat (121 baris bernilai puluhan miliar untuk
// kekurangan 1,87 M). Celah tidak pernah tumpang-tindih: jumlahnya = kekurangan.

import { totalDpaBlud, auditRekapPJ, type AuditPjRow } from './audit-pj'
import { formatTanggalId } from './tanggal'

export interface BarisRekon {
  row_id: string
  parent_id: string | null
  kode_rekening: string | null
  uraian: string | null
  jumlah: number
  penanggung_jawab?: string | null
  tipe_baris?: string | null
  anggaran_key?: string | null
}

/**
 * Dasar saran, urut KEKUATAN (yang pertama ditemukan dipakai):
 *   dpa         baris yang sama (jangkar sama) di DPA acuan ber-PJ — khusus Pergeseran
 *   versi lalu  baris yang sama ber-PJ di versi sebelumnya
 *   tahun lalu  kode + uraian sama ber-PJ di versi terakhir tahun lalu (jangkar tak lintas tahun)
 *   cabang lalu di versi sebelumnya cabang ini (anak-anaknya) ber-PJ
 *   saudara     anak induk yang sama ber-PJ
 *   kerabat     satu tingkat di atasnya
 */
export type DasarSaran = 'dpa' | 'versi lalu' | 'tahun lalu' | 'cabang lalu' | 'saudara' | 'kerabat'
export interface SaranPj {
  pj: string
  /** Banyaknya baris pembanding ber-PJ ini. */
  dukungan: number
  /** Banyaknya baris pembanding yang ber-PJ (semua label). */
  dari: number
  dasar: DasarSaran
  /** Versi (yyyy-mm-dd) atau tahun asal saran riwayat. */
  asal?: string
}

/**
 * Konteks pembanding — semuanya opsional & best-effort (layar Cetak memuatnya sendiri).
 * Baris DPA acuan hanya untuk Rekap PJ Pergeseran: PJ Pergeseran adalah salinan DPA dan
 * "Sinkronkan DPA" menimpanya kembali dari sana.
 */
export interface KonteksPj {
  sebelum?: { versi: string; rows: readonly BarisRekon[] } | null
  tahunLalu?: { tahun: number; rows: readonly BarisRekon[] } | null
  dpaAcuan?: { versi: string; rows: readonly BarisRekon[] } | null
}

/** Keadaan baris yang sama di DPA acuan (celah Pergeseran). */
export type StatusDpa =
  | { status: 'pj'; pj: string }
  | { status: 'tertaungi'; pj: string }
  | { status: 'kosong' }

interface PosDasar {
  rowId: string
  anggaranKey: string | null
  kode: string
  uraian: string
  /** Induk terdekat ("5.1.02.99 Belanja Barang …") — pengenal rincian tanpa kode. */
  jalur: string
  /** Dampak ke (anggaran − rekap): + membuat rekap KURANG, − membuat rekap LEBIH. */
  nilai: number
}
export type PosRekon =
  | (PosDasar & {
      jenis: 'celah'; barisCabang: number; saran: SaranPj | null
      /** Baris ini SENDIRI ber-PJ di versi sebelumnya — PJ-nya hilang sejak itu. */
      riwayat: { pj: string; versi: string } | null
      /** Pergeseran: keadaan baris yang sama di DPA acuan; `null` = tak ada di DPA / bukan Pergeseran. */
      dpa: StatusDpa | null
    })
  | (PosDasar & { jenis: 'induk'; jumlahInduk: number; jumlahAnak: number })
  | (PosDasar & { jenis: 'luar'; pj: string })

export interface HasilRekon {
  total: number
  rekap: number
  /** T − G: + = rekap kurang, − = rekap lebih. */
  selisih: number
  pos: PosRekon[]
  /** Bagian selisih yang tidak terjelaskan pos mana pun — semestinya 0. */
  sisa: number
  /** Bagian anggaran yang sudah ber-PJ (0..1), dari total anggaran. */
  tercakup: number
}

export const adaPj = (pj: string | null | undefined): boolean => {
  const v = (pj ?? '').trim()
  return v !== '' && v !== '-'
}
const bulat = (n: number) => Math.round(Number(n) || 0)
const teks = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim()

/** Indeks satu set baris pembanding: per jangkar, induk, anak. */
function indeks(rows: readonly BarisRekon[]) {
  const byId = new Map(rows.map(r => [r.row_id, r]))
  const byKey = new Map<string, BarisRekon>()
  for (const r of rows) if (r.anggaran_key) byKey.set(r.anggaran_key, r)
  const anak = new Map<string, BarisRekon[]>()
  for (const r of rows) {
    if (r.parent_id && byId.has(r.parent_id)) anak.set(r.parent_id, [...(anak.get(r.parent_id) ?? []), r])
  }
  const induk = (r: BarisRekon) => (r.parent_id ? byId.get(r.parent_id) ?? null : null)
  const pjLeluhur = (r: BarisRekon): string | null => {
    for (let p = induk(r), n = 0; p && n < 64; p = induk(p), n++) if (adaPj(p.penanggung_jawab)) return teks(p.penanggung_jawab)
    return null
  }
  /** Label PJ di cabang (diri + keturunan), dihitung per label. */
  const pjCabang = (r: BarisRekon): Map<string, number> => {
    const n = new Map<string, number>()
    const jalan = (x: BarisRekon, d: number) => {
      if (d > 64) return
      if (adaPj(x.penanggung_jawab)) n.set(teks(x.penanggung_jawab), (n.get(teks(x.penanggung_jawab)) ?? 0) + 1)
      for (const c of anak.get(x.row_id) ?? []) jalan(c, d + 1)
    }
    jalan(r, 0)
    return n
  }
  return { byKey, pjLeluhur, pjCabang }
}

const kunciNama = (r: BarisRekon) => `${teks(r.kode_rekening).toLowerCase()}|${teks(r.uraian).toLowerCase()}`

export function rekonsiliasiPj(rows: readonly BarisRekon[], konteks: KonteksPj = {}): HasilRekon {
  const lalu = konteks.sebelum?.rows.length ? indeks(konteks.sebelum.rows) : null
  const dpa = konteks.dpaAcuan?.rows.length ? indeks(konteks.dpaAcuan.rows) : null
  // Tahun lalu: jangkar tidak lintas tahun (Salin Tahun melepasnya) → kode + uraian, hanya yang unik.
  const tahunLalu = new Map<string, string | null>()
  for (const r of konteks.tahunLalu?.rows ?? []) {
    if (!adaPj(r.penanggung_jawab) || !teks(r.uraian)) continue
    const k = kunciNama(r)
    tahunLalu.set(k, tahunLalu.has(k) && tahunLalu.get(k) !== teks(r.penanggung_jawab) ? null : teks(r.penanggung_jawab))
  }
  const statusDpa = (r: BarisRekon): StatusDpa | null => {
    const d = dpa && r.anggaran_key ? dpa.byKey.get(r.anggaran_key) : undefined
    if (!d || !dpa) return null
    if (adaPj(d.penanggung_jawab)) return { status: 'pj', pj: teks(d.penanggung_jawab) }
    const atas = dpa.pjLeluhur(d)
    return atas ? { status: 'tertaungi', pj: atas } : { status: 'kosong' }
  }
  const byId = new Map(rows.map(r => [r.row_id, r]))
  const induk = (r: BarisRekon) => (r.parent_id && byId.has(r.parent_id) ? byId.get(r.parent_id)! : null)
  const anak = new Map<string, BarisRekon[]>()
  for (const r of rows) {
    const p = induk(r)
    if (p) anak.set(p.row_id, [...(anak.get(p.row_id) ?? []), r])
  }
  // Pagar kedalaman: jalur BACA, rantai melingkar tidak boleh menggantung layar.
  const leluhur = (r: BarisRekon): BarisRekon[] => {
    const out: BarisRekon[] = []
    for (let p = induk(r), n = 0; p && n < 64; p = induk(p), n++) out.push(p)
    return out
  }
  const pjDiAtas = new Map<string, boolean>()
  for (const r of rows) pjDiAtas.set(r.row_id, leluhur(r).some(a => adaPj(a.penanggung_jawab)))
  const adaPjDiCabang = new Map<string, boolean>()
  const cabangBerPj = (r: BarisRekon, n = 0): boolean => {
    const ada = adaPjDiCabang.get(r.row_id)
    if (ada !== undefined) return ada
    const v = adaPj(r.penanggung_jawab) || (n < 64 && (anak.get(r.row_id) ?? []).some(c => cabangBerPj(c, n + 1)))
    adaPjDiCabang.set(r.row_id, v)
    return v
  }
  const jumlahCabang = (r: BarisRekon, n = 0): number =>
    1 + (n < 64 ? (anak.get(r.row_id) ?? []).reduce((s, c) => s + jumlahCabang(c, n + 1), 0) : 0)
  const jalur = (r: BarisRekon) => {
    const p = induk(r)
    return p ? [teks(p.kode_rekening), teks(p.uraian)].filter(Boolean).join(' ') : ''
  }
  const dasar = (r: BarisRekon, nilai: number): PosDasar => ({
    rowId: r.row_id, anggaranKey: r.anggaran_key ?? null, kode: teks(r.kode_rekening), uraian: teks(r.uraian),
    jalur: jalur(r), nilai,
  })

  // Akar anggaran — cermin `totalDpaBlud` (GRANDMASTER → baris tanpa parent_id → uraian).
  let akar = rows.filter(r => r.tipe_baris === 'GRANDMASTER')
  if (!(akar.reduce((s, r) => s + (Number(r.jumlah) || 0), 0) > 0)) akar = rows.filter(r => !r.parent_id)
  if (!(akar.reduce((s, r) => s + (Number(r.jumlah) || 0), 0) > 0)) {
    akar = rows.filter(r => teks(r.uraian).toUpperCase() === 'BELANJA DAERAH').slice(0, 1)
  }
  const idAkar = new Set(akar.map(r => r.row_id))
  akar = akar.filter(r => !leluhur(r).some(a => idAkar.has(a.row_id)))
  const diBawahAkar = (r: BarisRekon) => idAkar.has(r.row_id) || leluhur(r).some(a => idAkar.has(a.row_id))

  const total = totalDpaBlud(rows.map(r => ({ ...r, uraian: r.uraian ?? '', jumlah: Number(r.jumlah) || 0 })))
  const rekap = auditRekapPJ(rows as unknown as AuditPjRow[]).grandTotal
  const pos: PosRekon[] = []

  const telusuri = (n: BarisRekon, kedalaman = 0): void => {
    if (kedalaman > 64 || adaPj(n.penanggung_jawab) || pjDiAtas.get(n.row_id)) return
    if (!cabangBerPj(n)) {
      const nilai = bulat(n.jumlah)
      if (nilai !== 0) {
        const lama = lalu && n.anggaran_key ? lalu.byKey.get(n.anggaran_key) : undefined
        pos.push({
          ...dasar(n, nilai), jenis: 'celah', barisCabang: jumlahCabang(n), saran: saranPj(n),
          riwayat: lama && adaPj(lama.penanggung_jawab) && konteks.sebelum ? { pj: teks(lama.penanggung_jawab), versi: konteks.sebelum.versi } : null,
          dpa: statusDpa(n),
        })
      }
      return
    }
    const anakN = anak.get(n.row_id) ?? []
    const jumlahAnak = anakN.reduce((s, c) => s + (Number(c.jumlah) || 0), 0)
    const beda = bulat(Number(n.jumlah) - jumlahAnak)
    if (beda !== 0) pos.push({ ...dasar(n, beda), jenis: 'induk', jumlahInduk: bulat(n.jumlah), jumlahAnak: bulat(jumlahAnak) })
    for (const c of anakN) telusuri(c, kedalaman + 1)
  }

  // Saran dari tetangga: saudara (anak induk yang sama) yang ber-PJ; kalau tak ada,
  // kerabat satu tingkat di atas. Menebak dari jauh lebih sering salah daripada benar.
  function saranPj(c: BarisRekon): SaranPj | null {
    const hitung = (calon: BarisRekon[], dasarSaran: SaranPj['dasar']): SaranPj | null => {
      const n = new Map<string, number>()
      for (const s of calon) if (adaPj(s.penanggung_jawab)) n.set(teks(s.penanggung_jawab), (n.get(teks(s.penanggung_jawab)) ?? 0) + 1)
      if (!n.size) return null
      const [pj, dukungan] = [...n.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]
      return { pj, dukungan, dari: [...n.values()].reduce((s, v) => s + v, 0), dasar: dasarSaran }
    }
    const dariDpa = statusDpa(c)
    if (dariDpa && dariDpa.status !== 'kosong') {
      return { pj: dariDpa.pj, dukungan: 1, dari: 1, dasar: 'dpa', asal: konteks.dpaAcuan?.versi }
    }
    const lama = lalu && c.anggaran_key ? lalu.byKey.get(c.anggaran_key) : undefined
    if (lama && adaPj(lama.penanggung_jawab)) {
      return { pj: teks(lama.penanggung_jawab), dukungan: 1, dari: 1, dasar: 'versi lalu', asal: konteks.sebelum?.versi }
    }
    const dariTahunLalu = tahunLalu.get(kunciNama(c))
    if (dariTahunLalu) return { pj: dariTahunLalu, dukungan: 1, dari: 1, dasar: 'tahun lalu', asal: String(konteks.tahunLalu?.tahun ?? '') }
    if (lama && lalu) {
      const n = lalu.pjCabang(lama)
      if (n.size) {
        const [pj, dukungan] = [...n.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]
        return { pj, dukungan, dari: [...n.values()].reduce((t, v) => t + v, 0), dasar: 'cabang lalu', asal: konteks.sebelum?.versi }
      }
    }
    const p = induk(c)
    if (!p) return null
    const saudara = (anak.get(p.row_id) ?? []).filter(s => s.row_id !== c.row_id)
    const dariSaudara = hitung(saudara, 'saudara')
    if (dariSaudara) return dariSaudara
    const kakek = induk(p)
    if (!kakek) return null
    const kerabat = (anak.get(kakek.row_id) ?? []).filter(s => s.row_id !== p.row_id)
      .flatMap(s => [s, ...(anak.get(s.row_id) ?? [])])
    return hitung(kerabat, 'kerabat')
  }

  for (const a of akar) telusuri(a)

  // Baris ber-PJ teratas yang tidak berada di bawah akar anggaran. Kalau ia justru
  // MENAUNGI akar anggaran, bagian yang memang anggaran tidak dihitung "lebih".
  for (const r of rows) {
    if (!adaPj(r.penanggung_jawab) || pjDiAtas.get(r.row_id) || diBawahAkar(r)) continue
    const anggaranDiBawah = akar.filter(a => leluhur(a).some(x => x.row_id === r.row_id))
      .reduce((s, a) => s + (Number(a.jumlah) || 0), 0)
    const nilai = -bulat(Number(r.jumlah) - anggaranDiBawah)
    if (nilai !== 0) pos.push({ ...dasar(r, nilai), jenis: 'luar', pj: teks(r.penanggung_jawab) })
  }

  pos.sort((a, b) => Math.abs(b.nilai) - Math.abs(a.nilai))
  const selisih = bulat(total - rekap)
  const sisa = selisih - pos.reduce((s, p) => s + p.nilai, 0)
  const celahPositif = pos.filter(p => p.jenis === 'celah' && p.nilai > 0).reduce((s, p) => s + p.nilai, 0)
  return { total, rekap, selisih, pos, sisa, tercakup: total > 0 ? Math.max(0, Math.min(1, 1 - celahPositif / total)) : 0 }
}

// ─── Pembanding antar versi ──────────────────────────────────────────────────

export interface BandingVersi {
  versi: string
  selisihLalu: number
  selisihKini: number
  /** Pos yang muncul sejak versi itu. */
  baru: PosRekon[]
  /** Pos versi itu yang sudah tidak ada sekarang. */
  teratasi: PosRekon[]
}
const kunciPos = (p: PosRekon) => `${p.jenis}|${p.anggaranKey ?? p.rowId}`

export function bandingVersi(kini: HasilRekon, lalu: HasilRekon, versi: string): BandingVersi {
  const kLalu = new Set(lalu.pos.map(kunciPos))
  const kKini = new Set(kini.pos.map(kunciPos))
  return {
    versi, selisihLalu: lalu.selisih, selisihKini: kini.selisih,
    baru: kini.pos.filter(p => !kLalu.has(kunciPos(p))),
    teratasi: lalu.pos.filter(p => !kKini.has(kunciPos(p))),
  }
}

// ─── Tingkat PJ, PJ dobel, pemetaan Form PK ──────────────────────────────────

function kedalamanSemua(rows: readonly BarisRekon[]): Map<string, number> {
  const byId = new Map(rows.map(r => [r.row_id, r]))
  const d = new Map<string, number>()
  for (const r of rows) {
    let n = 0
    for (let p = r.parent_id ? byId.get(r.parent_id) : undefined; p && n < 64; p = p.parent_id ? byId.get(p.parent_id) : undefined) n++
    d.set(r.row_id, n)
  }
  return d
}

export interface PjTakLazim {
  rowId: string; anggaranKey: string | null; kode: string; uraian: string; pj: string
  /** Tingkat 1 = akar. */
  tingkat: number
  lazim: number
}

/**
 * PJ yang dipasang jauh dari tingkat yang dipakai mayoritas — sering salah tempat dan
 * rawan jadi PJ dobel. Hanya bersuara kalau polanya jelas: ≥ 5 baris ber-PJ, ≥ 60% di
 * satu tingkat, dan yang dilaporkan berjarak ≥ 2 tingkat dari situ.
 */
export function pjTingkatTakLazim(rows: readonly BarisRekon[]): { lazim: number | null; daftar: PjTakLazim[] } {
  const d = kedalamanSemua(rows)
  const ber = rows.filter(r => adaPj(r.penanggung_jawab))
  if (ber.length < 5) return { lazim: null, daftar: [] }
  const hitung = new Map<number, number>()
  for (const r of ber) hitung.set(d.get(r.row_id)!, (hitung.get(d.get(r.row_id)!) ?? 0) + 1)
  const [mode, banyak] = [...hitung.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]
  if (banyak / ber.length < 0.6) return { lazim: null, daftar: [] }
  return {
    lazim: mode + 1,
    daftar: ber.filter(r => Math.abs(d.get(r.row_id)! - mode) >= 2).map(r => ({
      rowId: r.row_id, anggaranKey: r.anggaran_key ?? null, kode: teks(r.kode_rekening), uraian: teks(r.uraian),
      pj: teks(r.penanggung_jawab), tingkat: d.get(r.row_id)! + 1, lazim: mode + 1,
    })),
  }
}

export interface SaranDobel {
  rowId: string; anggaranKey: string | null; kode: string; uraian: string; pj: string
  indukRowId: string; indukAnggaranKey: string | null; indukUraian: string; indukPj: string
  /** Baris mana yang PJ-nya sebaiknya dihapus. */
  hapusDi: 'bawah' | 'induk'
  alasan: string
}

/**
 * Untuk tiap pasangan PJ dobel (baris + leluhur ber-PJ terdekatnya): PJ mana yang sebaiknya
 * dihapus. PJ sama → yang bawah (sudah tercakup). PJ beda → yang TIDAK di tingkat lazim;
 * tanpa tingkat lazim → yang bawah, dgn alasan "PJ induk menaungi seluruh cabangnya".
 */
export function saranPjDobel(rows: readonly BarisRekon[]): SaranDobel[] {
  const byId = new Map(rows.map(r => [r.row_id, r]))
  const d = kedalamanSemua(rows)
  const { lazim } = pjTingkatTakLazim(rows)
  const out: SaranDobel[] = []
  for (const r of rows) {
    if (!adaPj(r.penanggung_jawab)) continue
    let a: BarisRekon | undefined
    for (let p = r.parent_id ? byId.get(r.parent_id) : undefined, n = 0; p && n < 64; p = p.parent_id ? byId.get(p.parent_id) : undefined, n++) {
      if (adaPj(p.penanggung_jawab)) { a = p; break }
    }
    if (!a) continue
    const sama = normPj(teks(a.penanggung_jawab)) === normPj(teks(r.penanggung_jawab))
    const tBawah = d.get(r.row_id)! + 1
    const tInduk = d.get(a.row_id)! + 1
    let hapusDi: SaranDobel['hapusDi'] = 'bawah'
    let alasan: string
    if (sama) alasan = 'PJ-nya sama dengan induknya, jadi sudah tercakup'
    else if (lazim != null && tBawah === lazim && tInduk !== lazim) {
      hapusDi = 'induk'
      alasan = `PJ baris bawah di tingkat ${lazim} seperti kebanyakan PJ, PJ induk (tingkat ${tInduk}) yang tidak lazim; sesudahnya isi PJ saudara-saudaranya`
    } else if (lazim != null && tInduk === lazim) {
      alasan = `PJ induk di tingkat ${lazim} seperti kebanyakan PJ; kalau pos ini memang milik ${teks(r.penanggung_jawab)}, pindahkan PJ induk ke saudara-saudaranya`
    } else alasan = 'PJ induk menaungi seluruh cabangnya'
    out.push({
      rowId: r.row_id, anggaranKey: r.anggaran_key ?? null, kode: teks(r.kode_rekening), uraian: teks(r.uraian), pj: teks(r.penanggung_jawab),
      indukRowId: a.row_id, indukAnggaranKey: a.anggaran_key ?? null, indukUraian: teks(a.uraian), indukPj: teks(a.penanggung_jawab),
      hapusDi, alasan,
    })
  }
  return out
}

/**
 * Label PJ yang tidak dipakai unit PK mana pun (sub kegiatan = nama unitnya; program/kegiatan
 * lewat pemetaan Master Unit Kerja). Nominal BLUD label itu tidak pernah masuk Form PK.
 * Dicocokkan tanpa peduli huruf besar & spasi — aturan `nominalUntukUnit`.
 */
export function labelTanpaPk(
  rows: readonly BarisRekon[], labelPk: readonly string[] | null | undefined,
): Array<{ label: string; baris: number; nominal: number }> {
  if (!labelPk?.length) return []
  const kenal = new Set(labelPk.map(l => teks(l).toLowerCase()))
  const per = new Map<string, { baris: number; nominal: number }>()
  for (const r of rows) {
    if (!adaPj(r.penanggung_jawab)) continue
    const l = teks(r.penanggung_jawab)
    if (kenal.has(l.toLowerCase())) continue
    const x = per.get(l) ?? { baris: 0, nominal: 0 }
    x.baris++
    x.nominal += Number(r.jumlah) || 0
    per.set(l, x)
  }
  return [...per.entries()].map(([label, x]) => ({ label, ...x })).sort((a, b) => b.nominal - a.nominal)
}

// ─── Label PJ ────────────────────────────────────────────────────────────────

export interface TemuanLabel {
  jenis: 'ejaan' | 'mirip' | 'luarMaster'
  /** Label persis seperti tertulis (ejaan & mirip: dua label atau lebih). */
  label: string[]
  /** Banyaknya baris ber-label itu (urut sama dgn `label`). */
  baris: number[]
}

/** Satu bentuk pembanding: huruf kecil, tanda baca & spasi berlebih dibuang. */
export const normPj = (s: string) => s.toLowerCase().replace(/[.,;:]/g, ' ').replace(/\s+/g, ' ').trim()

function jarakEjaan(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 3
  const d = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    let kiri = i - 1
    d[0] = i
    for (let j = 1; j <= b.length; j++) {
      const atas = d[j]
      d[j] = Math.min(d[j] + 1, d[j - 1] + 1, kiri + (a[i - 1] === b[j - 1] ? 0 : 1))
      kiri = atas
    }
  }
  return d[b.length]
}

/**
 * Label PJ yang membuat satu orang terbelah jadi dua kelompok rekap, atau yang tidak
 * dikenal Master Penanggung Jawab. Sengaja ketat: "mirip" hanya beda ≤ 2 huruf pada
 * label ≥ 8 huruf — "Kasi Pelayanan" vs "Kasi Penunjang" tidak boleh ikut.
 */
export function periksaLabelPj(rows: readonly BarisRekon[], master?: readonly string[] | null): TemuanLabel[] {
  const hitung = new Map<string, number>()
  for (const r of rows) if (adaPj(r.penanggung_jawab)) hitung.set(teks(r.penanggung_jawab), (hitung.get(teks(r.penanggung_jawab)) ?? 0) + 1)
  const temuan: TemuanLabel[] = []
  const perNorm = new Map<string, string[]>()
  for (const l of hitung.keys()) perNorm.set(normPj(l), [...(perNorm.get(normPj(l)) ?? []), l])
  for (const ls of perNorm.values()) {
    if (ls.length > 1) temuan.push({ jenis: 'ejaan', label: ls, baris: ls.map(l => hitung.get(l)!) })
  }
  const norms = [...perNorm.keys()]
  for (let i = 0; i < norms.length; i++) {
    for (let j = i + 1; j < norms.length; j++) {
      const [a, b] = [norms[i], norms[j]]
      if (Math.min(a.length, b.length) < 8 || jarakEjaan(a, b) > 2) continue
      const label = [perNorm.get(a)![0], perNorm.get(b)![0]]
      temuan.push({ jenis: 'mirip', label, baris: label.map(l => hitung.get(l)!) })
    }
  }
  if (master?.length) {
    const kenal = new Set(master.map(normPj))
    for (const [n, ls] of perNorm) {
      if (!kenal.has(n)) temuan.push({ jenis: 'luarMaster', label: ls, baris: ls.map(l => hitung.get(l)!) })
    }
  }
  return temuan
}

// ─── Kalimat bersama (panel layar & catatan unduhan) ─────────────────────────
// Ikut tercetak di PDF (jsPDF, huruf WinAnsi/cp1252 — Gate F): JANGAN pakai → ≠ − Σ di
// sini; satu karakter di luar WinAnsi merusak SELURUH baris teksnya.

const rp = (n: number) => Math.round(Math.abs(n)).toLocaleString('id-ID')
export const arahPos = (nilai: number) => (nilai > 0 ? 'kurang' : 'lebih')

export function kalimatSaran(s: SaranPj | null): string {
  if (!s) return ''
  const tgl = s.asal && /^\d{4}-\d{2}-\d{2}$/.test(s.asal) ? formatTanggalId(s.asal) : ''
  if (s.dasar === 'dpa') return `saran: ${s.pj} (PJ baris ini di DPA acuan${tgl ? ` ${tgl}` : ''})`
  if (s.dasar === 'versi lalu') return `saran: ${s.pj} (PJ baris ini di versi ${tgl})`
  if (s.dasar === 'tahun lalu') return `saran: ${s.pj} (PJ baris dengan kode & uraian sama di tahun ${s.asal})`
  if (s.dasar === 'cabang lalu') {
    return `saran: ${s.pj} (${s.dukungan}${s.dukungan === s.dari ? '' : ` dari ${s.dari}`} baris di cabang ini ber-PJ itu di versi ${tgl})`
  }
  const asal = s.dasar === 'saudara' ? 'baris sejenis di bawah induk yang sama' : 'baris di cabang sebelahnya'
  return s.dukungan === s.dari
    ? `saran: ${s.pj} (${s.dukungan} ${asal} ber-PJ ini)`
    : `saran: ${s.pj} (${s.dukungan} dari ${s.dari} ${asal} — campuran)`
}

/** Petunjuk Sinkronkan DPA untuk celah Pergeseran (PJ Pergeseran = salinan DPA). */
export function kalimatDpa(d: StatusDpa | null): string {
  if (!d) return ''
  if (d.status === 'pj') return `di DPA baris ini ber-PJ ${d.pj} — tekan Sinkronkan DPA di layar Pergeseran, atau isi ${d.pj} di sini`
  if (d.status === 'tertaungi') return `di DPA tercakup PJ ${d.pj} dari induknya — Sinkronkan DPA mengembalikannya`
  return 'di DPA juga belum ber-PJ: isi di DPA juga, kalau tidak "Sinkronkan DPA" akan mengosongkannya lagi'
}

export function kalimatRiwayat(r: { pj: string; versi: string } | null): string {
  return r ? `dulu ber-PJ ${r.pj} di versi ${formatTanggalId(r.versi)} — PJ-nya hilang sejak itu` : ''
}

export function kalimatPos(p: PosRekon): string {
  const nama = [p.kode, p.uraian].filter(Boolean).join(' ') || '(tanpa uraian)'
  const di = p.jalur && !p.kode ? ` — di bawah ${p.jalur}` : ''
  const dampak = `rekap ${arahPos(p.nilai)} Rp ${rp(p.nilai)}`
  if (p.jenis === 'celah') {
    const tambahan = [kalimatRiwayat(p.riwayat), kalimatSaran(p.saran), kalimatDpa(p.dpa)].filter(Boolean)
    return `${nama}${di}: belum ber-PJ${p.barisCabang > 1 ? ` (${p.barisCabang} baris)` : ''} — ${dampak}${tambahan.map(t => `; ${t}`).join('')}`
  }
  if (p.jenis === 'induk') {
    return `${nama}${di}: angka induk Rp ${p.jumlahInduk.toLocaleString('id-ID')} tidak sama dengan jumlah anaknya Rp ${p.jumlahAnak.toLocaleString('id-ID')} — ${dampak}`
  }
  return `${nama}${di}: ber-PJ ${p.pj} tetapi di luar total anggaran (induknya tidak ada) — ${dampak}`
}

export function kalimatLabel(t: TemuanLabel): string {
  const daftar = t.label.map((l, i) => `"${l}" (${t.baris[i]} baris)`).join(' dan ')
  if (t.jenis === 'ejaan') return `Ejaan PJ berbeda untuk nama yang sama: ${daftar} — di rekap terpisah jadi dua kelompok.`
  if (t.jenis === 'mirip') return `PJ mirip, mungkin salah ketik: ${daftar}.`
  return `PJ tidak ada di Master Penanggung Jawab: ${daftar}.`
}

/** Satu kalimat neraca: "T = G + … ". */
export function kalimatNeraca(h: HasilRekon, labelSumber: string): string {
  if (Math.abs(h.selisih) < 1) return `Total ${labelSumber} = total rekap PJ = Rp ${rp(h.total)} — seluruh anggaran ber-PJ tepat satu kali.`
  const kurang = h.pos.filter(p => p.nilai > 0).reduce((s, p) => s + p.nilai, 0)
  const lebih = -h.pos.filter(p => p.nilai < 0).reduce((s, p) => s + p.nilai, 0)
  const bagian = [`rekap PJ Rp ${rp(h.rekap)}`]
  if (kurang) bagian.push(`belum ber-PJ/induk Rp ${rp(kurang)}`)
  let k = `Total ${labelSumber} Rp ${rp(h.total)} = ${bagian.join(' + ')}`
  if (lebih) k += ` - kelebihan Rp ${rp(lebih)}`
  if (Math.abs(h.sisa) >= 1) k += ` ${h.sisa > 0 ? '+' : '-'} sisa tak terjelaskan Rp ${rp(h.sisa)}`
  return k + '.'
}

export function kalimatBanding(b: BandingVersi): string {
  const arah = (n: number) => (n > 0 ? 'kurang' : n < 0 ? 'lebih' : 'pas')
  const lalu = `versi ${formatTanggalId(b.versi)}: rekap ${arah(b.selisihLalu)}${b.selisihLalu ? ` Rp ${rp(b.selisihLalu)}` : ''}`
  const kini = `sekarang ${arah(b.selisihKini)}${b.selisihKini ? ` Rp ${rp(b.selisihKini)}` : ''}`
  const bagian = [
    b.baru.length ? `${b.baru.length} pos baru (${b.baru.slice(0, 3).map(p => p.uraian || p.kode).join(', ')}${b.baru.length > 3 ? ', …' : ''})` : '',
    b.teratasi.length ? `${b.teratasi.length} pos teratasi` : '',
  ].filter(Boolean)
  return `Dibanding ${lalu}; ${kini}${bagian.length ? ` — ${bagian.join(', ')}` : ' — penyebabnya sama'}.`
}

export function kalimatTakLazim(t: PjTakLazim): string {
  return `${[t.kode, t.uraian].filter(Boolean).join(' ')}: PJ ${t.pj} dipasang di tingkat ${t.tingkat}, padahal kebanyakan PJ di tingkat ${t.lazim} — periksa apakah salah tempat.`
}

export function kalimatDobel(x: SaranDobel): string {
  const bawah = [x.kode, x.uraian].filter(Boolean).join(' ')
  const sasaran = x.hapusDi === 'induk' ? x.indukUraian : bawah
  return `PJ dobel: ${bawah} (${x.pj}) di bawah ${x.indukUraian} (${x.indukPj}) — saran: hapus PJ di ${sasaran}; ${x.alasan}.`
}

export function kalimatTanpaPk(x: { label: string; baris: number; nominal: number }): string {
  return `PJ "${x.label}" (${x.baris} baris, Rp ${rp(x.nominal)}) tidak dipetakan ke unit Form PK mana pun — nominal BLUD-nya tidak masuk PK. Petakan di Master Unit Kerja PK.`
}
