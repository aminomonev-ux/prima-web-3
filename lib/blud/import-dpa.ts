// lib/blud/import-dpa.ts — algoritma deteksi struktur DPA dari grid Excel.
// Konsep: docs/CONCEPT-export-import-dpa.md §3.3–3.5.
//
// Intinya: hierarki DPA TIDAK ditebak dari nomor rekening. Sudah terbukti di
// data nyata bahwa jumlah segmen kode tidak sejalan dengan level — dua baris
// MEMBER bisa punya 9 dan 10 segmen, sementara induknya (CHILD) cuma 3.
// Kedalaman diambil dari tiga sumber, berurut dari yang paling pasti:
//
//   1. kolom `Level`        → dibaca apa adanya (berkas unduhan PRIMA)
//   2. rujukan rumus        → `SUM(F9:F12)` menyebut sendiri siapa anaknya
//   3. posisi kolom kode    → jumlah kolom segmen yang terisi (formulir manual)
//
// Sumber 2 dan 3 saling memeriksa. Baris yang keduanya sepakat dianggap pasti;
// yang berselisih ditandai supaya naik ke modal konfirmasi.
import type { TipeBaris } from '@/types'
import { hitungJumlah, LABEL_KE_TIPE, RANTAI_TIPE } from './format'
import { BLUD_IMPOR_MAKS_BARIS, keDpaBarisInput } from './import-dpa-shared'
import { recalcDpaJumlah } from './recalc'
import {
  barisAnakDariRumus, faktorPerkalian,
  type GridDpa, type SelGrid,
} from './import-dpa-grid'
import {
  rapikanHierarki, normalkanDaunTanpaPerkalian, sumberSelisih,
  type SimpulImpor, type PerbaikanImpor, type SumberSelisih,
} from './import-rapikan'

/**
 * Harus sama dengan batas Zod di jalur simpan impor. Kalau parser lebih longgar,
 * pratinjau menjanjikan "Simpan 3.000 baris" lalu commit-nya ditolak — setelah
 * orang terlanjur memeriksa seluruh isinya. Ditolak di sini, sebelum diperiksa.
 */
const MAKS_BARIS_IMPOR = BLUD_IMPOR_MAKS_BARIS

export interface PetaKolom {
  kode: { awal: number; akhir: number }
  uraian: number[]
  vol: number | null
  satuan: number | null
  harga: number | null
  jumlah: number
  level: number | null
  jangkar: number | null
  penanggungJawab: number | null
  keterangan: number | null
}

export type SumberHierarki = 'level' | 'rumus' | 'posisi'

export interface BarisTerbaca {
  barisExcel: number
  kode: string
  uraian: string
  vol: number | null
  satuan: string | null
  harga: number | null
  /** Angka yang tertulis di berkas — null kalau rumusnya tak menyimpan hasil. */
  jumlahFile: number | null
  jumlahHitung: number
  penanggungJawab: string | null
  keterangan: string | null
  tipe_baris: TipeBaris
  indukBarisExcel: number | null
  jangkar: string | null
  sumberHierarki: SumberHierarki
  catatan: string[]
}

export interface BarisDitahan {
  barisExcel: number
  uraian: string
  alasan: string
}

export interface HasilBacaDpa {
  namaLembar: string
  barisHeader: number
  barisAkhirData: number
  kolom: PetaKolom
  baris: BarisTerbaca[]
  ditahan: BarisDitahan[]
  /** Total akar menurut berkas vs menurut hitung ulang — pembanding utama. */
  totalFile: number | null
  totalHitung: number
  peringatan: string[]
  /** Yang dirapikan sendiri oleh sistem — ditampilkan, bukan disembunyikan. */
  perbaikan: PerbaikanImpor[]
  /** Baris yang MELAHIRKAN sisa selisih; yang cuma mewarisi tidak ikut. */
  sumberSelisih: SumberSelisih[]
}

export class StrukturDpaTidakTerbacaError extends Error {
  constructor(pesan: string) {
    super(pesan)
    this.name = 'StrukturDpaTidakTerbacaError'
  }
}

// ─── Lapis 1 & 2: peta kolom ─────────────────────────────────────────────────

/**
 * Formulir manual memakai header sel-gabung 2 baris (b.9–10), unduhan PRIMA
 * cuma 1 baris. Barisnya diperiksa TERPISAH, tidak digabung: kalau digabung,
 * header 1 baris ikut menelan baris data pertama — `Level` + `Level 1` jadi
 * "level level 1" dan kolomnya tak pernah ketemu.
 */
function barisJudul(grid: GridDpa): number[] {
  const baris = [grid.barisHeader]
  const berikut = grid.barisHeader + 1
  for (let c = 1; c <= grid.jumlahKolom; c++) {
    if (/kode\s*rekening/i.test(grid.sel(berikut, c).teks)) { baris.push(berikut); break }
  }
  return baris
}

function cariKolomBerjudul(grid: GridDpa, pola: RegExp): number[] {
  const hasil: number[] = []
  const baris = barisJudul(grid)
  for (let c = 1; c <= grid.jumlahKolom; c++) {
    if (baris.some(r => pola.test(grid.sel(r, c).teks.trim().toLowerCase()))) hasil.push(c)
  }
  return hasil
}

const barisDataMulai = (grid: GridDpa): number => Math.max(...barisJudul(grid)) + 1

/**
 * Kolom Jumlah dicari dari kolom mana yang paling banyak memuat rumus
 * PERKALIAN — bukan dari judulnya. Posisinya berpindah antar tahun (S di 2026,
 * T di 2024/2025) dan judulnya kadang tidak terbaca karena sel gabung.
 */
function petakanKolom(grid: GridDpa): PetaKolom {
  const skorPerkalian = new Map<number, number>()
  const tandaFaktor = new Map<string, number>()
  for (let r = grid.barisHeader + 1; r <= grid.jumlahBaris; r++) {
    for (let c = 1; c <= grid.jumlahKolom; c++) {
      const faktor = faktorPerkalian(grid.sel(r, c).rumus)
      if (!faktor) continue
      skorPerkalian.set(c, (skorPerkalian.get(c) ?? 0) + 1)
      const tanda = `${c}|${faktor.map(f => f.kolom).join(',')}`
      tandaFaktor.set(tanda, (tandaFaktor.get(tanda) ?? 0) + 1)
    }
  }

  let kolomJumlah = 0
  let skorTertinggi = 0
  for (const [c, n] of skorPerkalian) {
    if (n > skorTertinggi) { skorTertinggi = n; kolomJumlah = c }
  }
  if (!kolomJumlah) {
    kolomJumlah = cariKolomBerjudul(grid, /\bjumlah\b/)[0] ?? 0
  }
  if (!kolomJumlah) {
    throw new StrukturDpaTidakTerbacaError(
      'Kolom Jumlah tidak ditemukan — tidak ada rumus perkalian maupun judul "Jumlah".',
    )
  }

  // Tanda faktor terbanyak pada kolom Jumlah → kolom vol & harga.
  let kolomVol: number | null = null
  let kolomHarga: number | null = null
  let terbanyak = 0
  for (const [tanda, n] of tandaFaktor) {
    const [c, daftar] = tanda.split('|')
    if (Number(c) !== kolomJumlah || n <= terbanyak) continue
    const kolomFaktor = daftar.split(',').map(Number)
    terbanyak = n
    kolomVol = kolomFaktor[0]
    kolomHarga = kolomFaktor[kolomFaktor.length - 1]
  }
  if (kolomVol == null) kolomVol = cariKolomBerjudul(grid, /\bvol\b/)[0] ?? null
  if (kolomHarga == null) kolomHarga = cariKolomBerjudul(grid, /harga/)[0] ?? null

  // Kolom kode = deretan kolom berjudul "KODE REKENING" mulai dari kolom 1.
  // Judul itu satu-satunya yang boleh dipercaya — dialah penanda baris header.
  const kolomKode = cariKolomBerjudul(grid, /kode\s*rekening/)
  let kodeAkhir = 0
  for (let c = 1; c <= grid.jumlahKolom; c++) {
    if (!kolomKode.includes(c)) break
    kodeAkhir = c
  }
  if (!kodeAkhir) {
    throw new StrukturDpaTidakTerbacaError('Kolom "KODE REKENING" tidak ditemukan di baris header.')
  }

  // Uraian dicari SECARA STRUKTURAL: kolom antara kode dan vol. Judulnya tidak
  // bisa dipercaya — di formulir 2025 sel judul URAIAN tertimpa jadi
  // "pemeliharaa", jadi pencarian berbasis kata gagal total di situ.
  const uraianJudul = cariKolomBerjudul(grid, /uraian/)
  const batasKanan = kolomVol ?? cariKolomBerjudul(grid, /\bvol\b/)[0] ?? kolomJumlah
  const uraian = uraianJudul.length
    ? uraianJudul
    : Array.from({ length: Math.max(0, batasKanan - kodeAkhir - 1) }, (_, i) => kodeAkhir + 1 + i)
  if (!uraian.length) {
    throw new StrukturDpaTidakTerbacaError(
      `Tidak ada kolom uraian di antara kode rekening (s/d kolom ${kodeAkhir}) `
      + `dan kolom vol (${batasKanan}).`,
    )
  }

  const satuanJudul = cariKolomBerjudul(grid, /satuan|^sat$|\bsat\b/)[0] ?? null
  return {
    kode: { awal: 1, akhir: kodeAkhir },
    uraian,
    vol: kolomVol,
    satuan: satuanJudul ?? (kolomVol != null && kolomHarga != null && kolomHarga - kolomVol > 1
      ? kolomHarga - 1
      : null),
    harga: kolomHarga,
    jumlah: kolomJumlah,
    level: cariKolomBerjudul(grid, /^level$/)[0] ?? null,
    jangkar: cariKolomBerjudul(grid, /^jangkar$/)[0] ?? null,
    // `/penang/` bukan `/penanggung/`: formulir 2025 menulisnya "Penang jwb".
    penanggungJawab: cariKolomBerjudul(grid, /^penang/)[0] ?? null,
    keterangan: cariKolomBerjudul(grid, /^ket/)[0] ?? null,
  }
}

/**
 * Badan tabel berakhir di baris TERAKHIR yang punya nilai di kolom Jumlah.
 * JANGAN memakai kata "DEWAN PENGAWAS" sebagai penanda — itu nama mata anggaran
 * (honorarium dewas) yang muncul di TENGAH data pada ketiga formulir asli;
 * memotong di situ membuang ±500 baris.
 */
function cariAkhirData(grid: GridDpa, kolomJumlah: number): number {
  let akhir = grid.barisHeader
  for (let r = grid.barisHeader + 1; r <= grid.jumlahBaris; r++) {
    const sel = grid.sel(r, kolomJumlah)
    if (sel.angka != null || sel.rumus) akhir = r
  }
  return akhir
}

// ─── Lapis 4: angka per baris ────────────────────────────────────────────────

const angkaDari = (sel: SelGrid): number | null => sel.angka

/**
 * Vol majemuk `1 x 12 bln` ditulis sebagai dua angka terpisah dan rumusnya
 * tiga faktor (`N57*P57*R57`). Dibaca naif sebagai vol × harga, baris itu
 * meleset 12 kali lipat. Jumlah faktor diambil DARI RUMUS, bukan dari posisi.
 */
function bacaAngkaBaris(
  grid: GridDpa, r: number, kol: PetaKolom,
): { vol: number | null; harga: number | null; asli: string | null } {
  const faktor = faktorPerkalian(grid.sel(r, kol.jumlah).rumus)
  if (faktor && faktor.length >= 2) {
    const nilai = faktor.map(f => angkaDari(grid.sel(f.baris, f.kolom)))
    if (nilai.every(v => v != null)) {
      const harga = nilai[nilai.length - 1] as number
      const vol = nilai.slice(0, -1).reduce((a, b) => (a as number) * (b as number), 1) as number
      const asli = faktor.length > 2
        ? faktor.slice(0, -1).map((_, i) => nilai[i]).join(' x ')
        : null
      return { vol, harga, asli }
    }
  }
  return {
    vol: kol.vol != null ? angkaDari(grid.sel(r, kol.vol)) : null,
    harga: kol.harga != null ? angkaDari(grid.sel(r, kol.harga)) : null,
    asli: null,
  }
}

function bacaSatuan(grid: GridDpa, r: number, kol: PetaKolom): string | null {
  if (kol.satuan != null) {
    const t = grid.sel(r, kol.satuan).teks
    if (t && !/^x$/i.test(t) && !/^\d+([.,]\d+)?$/.test(t)) return t
  }
  // Formulir manual menggeser satuan antar baris (`1 x 1 th` vs `1 x th`).
  // Cari token teks di antara kolom vol dan harga.
  if (kol.vol != null && kol.harga != null) {
    for (let c = kol.harga - 1; c > kol.vol; c--) {
      const t = grid.sel(r, c).teks
      if (t && !/^x$/i.test(t) && !/^\d+([.,]\d+)?$/.test(t)) return t
    }
  }
  return null
}

/**
 * Segmen kode diisi kiri-ke-kanan, jadi yang dihitung hanya deretan MENERUS
 * dari kolom pertama — dan isinya harus benar-benar mirip segmen kode.
 * Tanpa pagar ini, sel sampah (formulir 2026 punya backtick tunggal di b.700
 * kolom 3) terbaca sebagai kode, membuat barisnya seolah berkedalaman 1 dan
 * ikut jadi akar palsu.
 */
const POLA_SEGMEN = /^[0-9A-Za-z][0-9A-Za-z.-]{0,7}$/

function segmenKode(grid: GridDpa, r: number, kol: PetaKolom): string[] {
  const segmen: string[] = []
  for (let c = kol.kode.awal; c <= kol.kode.akhir; c++) {
    const t = grid.sel(r, c).teks
    if (!t || !POLA_SEGMEN.test(t)) break
    segmen.push(t)
  }
  return segmen
}

function gabungKode(grid: GridDpa, r: number, kol: PetaKolom): string {
  const segmen = segmenKode(grid, r, kol)
  return segmen.length === 1 ? segmen[0] : segmen.join('.')
}

function bacaUraian(grid: GridDpa, r: number, kol: PetaKolom): string {
  // Kolom uraian bisa dua (kelompok & rincian). Yang paling kanan = paling
  // spesifik untuk baris itu.
  for (const c of [...kol.uraian].sort((a, b) => b - a)) {
    const t = grid.sel(r, c).teks
    if (t) return t
  }
  return ''
}

// ─── Lapis 2 & 3: kedalaman dan pohon ────────────────────────────────────────

interface Mentah {
  barisExcel: number
  kode: string
  uraian: string
  segmenTerisi: number
  vol: number | null
  harga: number | null
  satuan: string | null
  volAsli: string | null
  jumlahFile: number | null
  level: TipeBaris | null
  jangkar: string | null
  pj: string | null
  keterangan: string | null
  anakDariRumus: number[] | null
}

function kumpulkanMentah(grid: GridDpa, kol: PetaKolom, akhir: number): Mentah[] {
  const hasil: Mentah[] = []
  for (let r = barisDataMulai(grid); r <= akhir; r++) {
    const uraian = bacaUraian(grid, r, kol)
    const kode = gabungKode(grid, r, kol)
    const selJumlah = grid.sel(r, kol.jumlah)
    // Baris yang cuma menyisakan RUMUS — tanpa uraian, tanpa kode, tanpa hasil
    // tersimpan — adalah sisa salin-tempel, bukan data. Kalau ikut dibaca, ia
    // menempel sebagai anak baris di atasnya lewat penambatan posisi, dan baris
    // itu berubah dari daun jadi agregator sehingga vol × harga miliknya
    // DIBUANG. Di formulir 2026, b.108 semacam ini menelan Rp 170 juta milik
    // b.107 dan menyeret selisih Rp 351 juta sampai ke akar.
    if (!uraian && !kode && selJumlah.angka == null) continue

    let segmenTerisi = segmenKode(grid, r, kol).length
    // Kode satu kolom (unduhan PRIMA): kedalaman tidak bisa dari jumlah kolom.
    if (kol.kode.akhir === kol.kode.awal && segmenTerisi) segmenTerisi = 1

    const angka = bacaAngkaBaris(grid, r, kol)
    const labelLevel = kol.level != null ? grid.sel(r, kol.level).teks.toLowerCase() : ''
    hasil.push({
      barisExcel: r,
      kode,
      uraian,
      segmenTerisi,
      vol: angka.vol,
      harga: angka.harga,
      volAsli: angka.asli,
      satuan: bacaSatuan(grid, r, kol),
      jumlahFile: selJumlah.angka,
      level: labelLevel ? LABEL_KE_TIPE.get(labelLevel) ?? null : null,
      jangkar: kol.jangkar != null ? (grid.sel(r, kol.jangkar).teks || null) : null,
      pj: kol.penanggungJawab != null ? (grid.sel(r, kol.penanggungJawab).teks || null) : null,
      keterangan: kol.keterangan != null ? (grid.sel(r, kol.keterangan).teks || null) : null,
      anakDariRumus: barisAnakDariRumus(selJumlah.rumus, kol.jumlah),
    })
  }
  return hasil
}

/** Kedalaman posisi: baris tak berkode menempel ke baris berkode terakhir + 1. */
function kedalamanPosisi(mentah: Mentah[]): number[] {
  const hasil: number[] = []
  let terakhirBerkode = 0
  for (const m of mentah) {
    if (m.segmenTerisi > 0) {
      terakhirBerkode = m.segmenTerisi
      hasil.push(m.segmenTerisi)
    } else {
      hasil.push(terakhirBerkode + 1)
    }
  }
  return hasil
}

/** Induk menurut susunan tumpukan — dipakai kalau rumus tak menyebutkannya. */
function indukDariKedalaman(kedalaman: number[]): (number | null)[] {
  const induk: (number | null)[] = []
  const tumpukan: number[] = []
  kedalaman.forEach((d, i) => {
    while (tumpukan.length && kedalaman[tumpukan[tumpukan.length - 1]] >= d) tumpukan.pop()
    induk.push(tumpukan.length ? tumpukan[tumpukan.length - 1] : null)
    tumpukan.push(i)
  })
  return induk
}

/** Peringkat kedalaman yang BENAR-BENAR muncul → slot rantai L1…L8.1. */
function petakanKeRantai(kedalaman: number[]): Map<number, TipeBaris> {
  const beda = [...new Set(kedalaman)].sort((a, b) => a - b)
  const peta = new Map<number, TipeBaris>()
  beda.forEach((d, i) => {
    peta.set(d, RANTAI_TIPE[Math.min(i, RANTAI_TIPE.length - 1)])
  })
  return peta
}

// ─── Perakitan ───────────────────────────────────────────────────────────────

export interface OpsiBacaDpa {
  /** Master penanggung jawab; nilai di luar daftar dilempar ke keterangan (L68). */
  penanggungJawabSah?: readonly string[]
}

export function bacaDpaDariGrid(grid: GridDpa, opsi: OpsiBacaDpa = {}): HasilBacaDpa {
  const kolom = petakanKolom(grid)
  const barisAkhirData = cariAkhirData(grid, kolom.jumlah)
  const mentah = kumpulkanMentah(grid, kolom, barisAkhirData)
  const peringatan: string[] = []

  if (!mentah.length) {
    throw new StrukturDpaTidakTerbacaError('Tidak ada baris data yang terbaca di bawah header.')
  }
  if (mentah.length > MAKS_BARIS_IMPOR) {
    throw new StrukturDpaTidakTerbacaError(
      `Berkas memuat ${mentah.length} baris, melebihi batas ${MAKS_BARIS_IMPOR}.`,
    )
  }

  const indexDariBarisExcel = new Map(mentah.map((m, i) => [m.barisExcel, i]))
  const posisi = kedalamanPosisi(mentah)

  // Induk menurut rumus agregasi — sumber paling tegas setelah kolom Level.
  //
  // Satu baris bisa diklaim DUA induk kalau rumus kakeknya melompati anaknya
  // sendiri: di formulir 2026 b.482 berbunyi `S484+S489+...` (melewati 483)
  // sementara b.483 berbunyi `S484`. Yang menang adalah pengklaim TERDEKAT di
  // atasnya — dengan begitu rantainya jadi 482 → 483 → 484 dan tidak ada baris
  // yang tertinggal tanpa nilai. Memilih pengklaim pertama membuat 483 jadi
  // daun kosong dan angkanya hilang dari total.
  const pengklaim = new Map<number, number[]>()
  mentah.forEach((m, i) => {
    if (!m.anakDariRumus) return
    for (const barisAnak of m.anakDariRumus) {
      const j = indexDariBarisExcel.get(barisAnak)
      if (j == null || j === i) continue
      const daftar = pengklaim.get(j)
      if (daftar) daftar.push(i)
      else pengklaim.set(j, [i])
    }
  })
  const indukRumus = new Array<number | null>(mentah.length).fill(null)
  const diklaimGanda: number[] = []
  let dipakaiRumus = 0
  for (const [j, daftar] of pengklaim) {
    indukRumus[j] = Math.max(...daftar)
    dipakaiRumus++
    if (daftar.length > 1) diklaimGanda.push(mentah[j].barisExcel)
  }
  if (diklaimGanda.length) {
    peringatan.push(
      `${diklaimGanda.length} baris diklaim lebih dari satu induk oleh rumus berkas `
      + `(b.${diklaimGanda.slice(0, 5).join(', b.')}). Dipakai induk terdekat.`,
    )
  }

  const pakaiLevel = kolom.level != null && mentah.every(m => m.level != null)
  const indukPosisi = indukDariKedalaman(posisi)

  let induk: (number | null)[]
  let sumber: SumberHierarki
  if (pakaiLevel) {
    const peringkat = mentah.map(m => RANTAI_TIPE.indexOf(m.level as TipeBaris))
    induk = indukDariKedalaman(peringkat)
    sumber = 'level'
  } else if (dipakaiRumus > 0) {
    induk = mentah.map((_, i) => indukRumus[i] ?? indukPosisi[i])
    sumber = 'rumus'
  } else {
    // Kode satu kolom + tanpa Level + tanpa rumus = unduhan PRIMA versi lama.
    // Hierarkinya benar-benar tidak ada di berkas: tidak ada posisi kolom untuk
    // dibaca, dan nomor rekening bukan alamat pohon (MEMBER bisa 9 atau 10
    // segmen, induknya CHILD cuma 3). Menebak di sini akan menghasilkan pohon
    // yang tampak masuk akal tapi salah tanpa gejala — lebih baik menolak.
    if (kolom.kode.akhir === kolom.kode.awal) {
      throw new StrukturDpaTidakTerbacaError(
        'Berkas ini unduhan format lama: kode rekening satu kolom, tanpa kolom Level '
        + 'dan tanpa rumus penjumlahan. Hierarki DPA tidak tersimpan di dalamnya dan '
        + 'tidak bisa dipulihkan. Unduh ulang DPA dari menu Cetak, lalu impor berkas baru itu.',
      )
    }
    induk = indukPosisi
    sumber = 'posisi'
    peringatan.push(
      'Berkas tidak punya kolom Level maupun rumus penjumlahan — hierarki DITEBAK '
      + 'dari posisi kolom kode. Periksa pratinjau pohon sebelum menyimpan.',
    )
  }

  // ── Rapikan hierarki sebelum apa pun dihitung ──────────────────────────────
  // Baris yang rumusnya perkalian tidak boleh punya anak: begitu ia dianggap
  // induk, vol × harga miliknya DIBUANG dan angkanya lenyap dari total. Tiap
  // pemindahan harus membuktikan dirinya lebih dulu — lihat `import-rapikan.ts`.
  const simpulRapi: SimpulImpor[] = mentah.map(m => ({
    barisExcel:     m.barisExcel,
    jumlahFile:     m.jumlahFile,
    vol:            m.vol,
    harga:          m.harga,
    rumusPerkalian: (faktorPerkalian(grid.sel(m.barisExcel, kolom.jumlah).rumus)?.length ?? 0) >= 2,
  }))
  const rapi = rapikanHierarki(simpulRapi, induk)
  induk = rapi.induk

  // Baru sesudah pohonnya benar: baris terbawah yang berangka tapi tanpa
  // vol/harga diberi 1 × angkanya, supaya nilainya tidak dihitung nol.
  const normal = normalkanDaunTanpaPerkalian(simpulRapi, induk)
  normal.vol.forEach((v, i) => { mentah[i].vol = v })
  normal.harga.forEach((v, i) => { mentah[i].harga = v })
  simpulRapi.forEach((s, i) => { s.vol = normal.vol[i]; s.harga = normal.harga[i] })
  const perbaikan = [...rapi.perbaikan, ...normal.perbaikan]

  // Kedalaman final dari pohon, lalu dipetakan berperingkat ke rantai.
  const kedalamanPohon = mentah.map((_, i) => {
    let d = 0
    let p = induk[i]
    let jaga = 0
    while (p != null && jaga++ < 32) { d++; p = induk[p] }
    return d
  })
  const petaTipe = petakanKeRantai(kedalamanPohon)

  // Silang rumus vs posisi kolom. Dijadikan SATU peringatan ringkas, bukan
  // catatan per baris: di formulir manual keduanya berbeda pendapat di ratusan
  // baris (144 dari 558 pada berkas 2026) karena kedalaman posisi memang kasar.
  // Daftar sepanjang itu melatih orang mengabaikan panelnya — padahal rumuslah
  // yang dipakai, dan rumus itu yang benar.
  if (!pakaiLevel) {
    const beda = mentah.filter((_, i) =>
      indukRumus[i] != null && indukPosisi[i] != null && indukRumus[i] !== indukPosisi[i]).length
    if (beda) {
      peringatan.push(
        `${beda} baris: rumus berkas dan posisi kolom kode berbeda pendapat soal induk. `
        + 'Yang dipakai rumus berkas — lihat pratinjau pohon untuk memastikan.',
      )
    }
  }

  // Jangkar dari berkas TIDAK dipercaya apa adanya. Ia masuk ke `anggaran_key`,
  // yang di Zod cuma diperiksa panjangnya — padahal nilai itu (a) terbit lagi ke
  // berkas unduhan berikutnya, jadi teks `=…` bisa jadi rumus di layar orang
  // lain, dan (b) menentukan alokasi realisasi mana yang menempel ke baris ini,
  // sehingga jangkar kembar bisa membelokkan realisasi ke baris yang salah.
  // Hanya bentuk buatan `newAnggaranKey()` yang diterima, dan hanya sekali.
  const POLA_JANGKAR = /^AK-[0-9a-f]{32}$/i
  const jangkarTerpakai = new Set<string>()

  const pjSah = new Set((opsi.penanggungJawabSah ?? []).map(s => s.trim().toLowerCase()))
  const ditahan: BarisDitahan[] = []
  const baris: BarisTerbaca[] = mentah.map((m, i) => {
    const catatan: string[] = []
    const tipe = pakaiLevel ? (m.level as TipeBaris) : petaTipe.get(kedalamanPohon[i])!

    if (m.jumlahFile == null) {
      catatan.push('Berkas tidak menyimpan hasil rumus di baris ini — tidak bisa dibandingkan.')
    }

    let pj = m.pj
    let keterangan = m.keterangan
    if (pj && pjSah.size && !pjSah.has(pj.trim().toLowerCase())) {
      keterangan = [keterangan, `PJ berkas: ${pj}`].filter(Boolean).join(' · ')
      catatan.push(`Penanggung jawab "${pj}" tidak ada di master — dipindah ke keterangan.`)
      pj = null
    }
    if (m.volAsli) {
      keterangan = [keterangan, `vol: ${m.volAsli}`].filter(Boolean).join(' · ')
    }

    if (!m.uraian) {
      ditahan.push({ barisExcel: m.barisExcel, uraian: '(kosong)', alasan: 'Uraian kosong.' })
    }

    let jangkar = m.jangkar?.trim() || null
    if (jangkar && !POLA_JANGKAR.test(jangkar)) {
      catatan.push('Isi kolom Jangkar bukan kunci anggaran yang sah — diabaikan, baris ini dapat kunci baru.')
      jangkar = null
    } else if (jangkar && jangkarTerpakai.has(jangkar.toLowerCase())) {
      catatan.push('Kunci anggaran kembar di berkas — diabaikan, baris ini dapat kunci baru.')
      jangkar = null
    } else if (jangkar) {
      jangkarTerpakai.add(jangkar.toLowerCase())
    }

    return {
      barisExcel: m.barisExcel,
      kode: m.kode,
      uraian: m.uraian,
      vol: m.vol,
      satuan: m.satuan,
      harga: m.harga,
      jumlahFile: m.jumlahFile,
      jumlahHitung: hitungJumlah(m.vol, m.harga),
      penanggungJawab: pj,
      keterangan,
      tipe_baris: tipe,
      indukBarisExcel: induk[i] != null ? mentah[induk[i]!].barisExcel : null,
      jangkar,
      sumberHierarki: sumber,
      catatan,
    }
  })

  // Hitung ulang bottom-up memakai aturan yang sama dengan aplikasi.
  const dihitung = recalcDpaJumlah(keDpaBarisInput(baris))
  dihitung.forEach((d, i) => { baris[i].jumlahHitung = d.jumlah })

  const akar = baris.filter(b => b.indukBarisExcel == null)
  const totalHitung = akar.reduce((s, b) => s + b.jumlahHitung, 0)
  // Akar yang tidak membawa angka biasanya baris judul nyasar tanpa induk —
  // menolak membandingkan gara-gara satu baris semacam itu justru mematikan
  // pemeriksaan yang paling menenangkan. Yang berangka dijumlah, yang tidak
  // disebutkan terus terang di peringatan.
  const akarBerangka = akar.filter(b => b.jumlahFile != null)
  const totalFile = akarBerangka.length
    ? akarBerangka.reduce((s, b) => s + (b.jumlahFile as number), 0)
    : null
  const akarTanpaAngka = akar.length - akarBerangka.length
  if (akarTanpaAngka > 0) {
    peringatan.push(
      `${akarTanpaAngka} baris tanpa induk tidak membawa angka di berkas dan tidak ikut `
      + 'dihitung sebagai total berkas.',
    )
  }

  // Catatan hanya untuk baris yang MELAHIRKAN selisih. Dulu setiap baris yang
  // angkanya tidak cocok ikut ditandai — 54 baris di formulir Juli, dan hampir
  // semuanya cuma mewarisi selisih dari bawah. Daftar sepanjang itu melatih
  // orang mengabaikan panelnya.
  const sumberSisa = sumberSelisih(simpulRapi, induk)
  const petaIndeks = new Map(mentah.map((m, i) => [m.barisExcel, i]))
  for (const s of sumberSisa) {
    const b = baris[petaIndeks.get(s.barisExcel)!]
    b.catatan.push(
      s.jenis === 'INDUK'
        ? `Angka di berkas ${(b.jumlahFile ?? 0).toLocaleString('id-ID')} tidak sama dengan `
          + `jumlah ${s.jumlahAnak} baris di bawahnya — selisih `
          + `${s.residu.toLocaleString('id-ID')}. Rumus penjumlahannya kemungkinan belum diperbarui.`
        : `Angka di berkas ${(b.jumlahFile ?? 0).toLocaleString('id-ID')} tidak sama dengan `
          + `volume × harga di baris ini — selisih ${s.residu.toLocaleString('id-ID')}.`,
    )
  }
  // Selisih di akar nol TIDAK berarti berkasnya benar: kesalahan bisa saling
  // menghapus. Pada `DPA BLUD 2026 F.xlsx` akarnya cocok persis sementara di
  // dalamnya ada ±80 juta yang menutupi satu sama lain.
  if (totalFile != null && totalFile === totalHitung && sumberSisa.length > 0) {
    peringatan.push(
      `Totalnya cocok, tapi ${sumberSisa.length} tempat di dalamnya saling menutupi. `
      + 'Nilainya benar, susunannya belum tentu — dan susunan menentukan rekap per Penanggung Jawab.',
    )
  }
  if (akar.length > 1) {
    peringatan.push(`Berkas punya ${akar.length} baris tanpa induk — DPA seharusnya satu akar.`)
  }

  return {
    namaLembar: grid.namaLembar,
    barisHeader: grid.barisHeader,
    barisAkhirData,
    kolom,
    baris,
    ditahan,
    totalFile,
    totalHitung,
    peringatan,
    perbaikan,
    sumberSelisih: sumberSisa,
  }
}

// Pemeta baris tinggal di `import-dpa-shared.ts` supaya modal (klien) bisa
// memakainya tanpa ikut menyeret parser ini — dan lewat parser ini, `schemas.ts`
// beserta `ioredis` — ke bundel browser.
export { keDpaBarisInput, BLUD_IMPOR_MAKS_BARIS } from './import-dpa-shared'
