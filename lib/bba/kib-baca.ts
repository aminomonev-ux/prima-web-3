// lib/bba/kib-baca.ts — membaca berkas ekspor KIB provinsi jadi catatan aset. TIDAK menulis DB.
// Konsep: docs/CONCEPT-bba-buku-aset.md §7.1, §16.
// Kolom dikenali dari TEKS kepala tiga baris, bukan letaknya: kolom bergeser tetap terbaca,
// kolom yang tidak dikenal dilaporkan (tidak disimpan), kolom wajib yang hilang menolak lembarnya.
import type ExcelJS from 'exceljs'
import { polosSelExcel, type NilaiPolos } from '@/lib/shared/excel-sel'
import {
  GOLONGAN, KOLOM_KIB, uraiKodeBarang, golonganDariKodeObjek, bacaKondisi, punyaRegister,
  type Golongan, type Kondisi, type KolomKib,
} from './kib'

/** L67 — batas lembar & kolom yang diperiksa (tameng berkas raksasa / zip-bomb). */
export const MAKS_LEMBAR = 40
const MAKS_KOLOM = 40
/** Rekap 2025: 6.845 barang. Tiga kalinya masih wajar; lebih dari itu bukan ekspor RS ini. */
export const MAKS_ASET = 20_000

export type NilaiKib = string | number | null

export interface AsetBaca {
  golongan: Golongan
  lembar: string
  /** Nomor baris Excel — disebut di pesan supaya orang bisa menemukannya di berkasnya. */
  baris: number
  kunci: string
  kode_barang: string | null
  register: string | null
  kode_objek: string | null
  tahun_perolehan: number | null
  nama_resmi: string
  harga: number
  asal_usul: string | null
  keterangan: string | null
  kondisi: Kondisi | null
  kib: Record<string, NilaiKib>
}

export interface LembarBaca { nama: string; golongan: Golongan; jumlah: number; kolomTakDikenal: string[] }
export interface KopBaca { kode_lokasi: string; bidang: string; sub_bidang: string; satuan_kerja: string }

export interface HasilBacaKib {
  lembar: LembarBaca[]
  aset: AsetBaca[]
  /** Menolak seluruh impor — tidak ada yang disimpan sampai berkasnya dibetulkan. */
  masalah: string[]
  /** Tetap bisa disimpan; ditampilkan di pratinjau. */
  peringatan: string[]
  kop: KopBaca | null
}

const rapat = (s: unknown) => String(s ?? '').toLowerCase().replace(/\s+/g, '')

function teks(v: NilaiPolos): string | null {
  if (v == null) return null
  if (v instanceof Date) return tanggalIso(v)
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(v)
  const t = String(v).replace(/\s+/g, ' ').trim()
  return t || null
}

/** exceljs membaca tanggal sebagai tengah malam UTC — bagian UTC-nya yang benar. */
function tanggalIso(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

/** Angka dari sel: angka asli, atau teks gaya Indonesia ("1.250.000,50"). */
export function angka(v: NilaiPolos): number | null {
  if (v == null || v === '') return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const t = String(v).trim()
  if (!t) return null
  const bersih = /,\d{1,2}$/.test(t) || /\.\d{3}(\.|$)/.test(t) ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '')
  const n = Number(bersih)
  return Number.isFinite(n) ? n : null
}

function tanggal(v: NilaiPolos): string | null {
  if (v == null) return null
  if (v instanceof Date) return tanggalIso(v)
  const t = String(v).trim()
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(t)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
  const id = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(t)
  if (id) return `${id[3]}-${id[2].padStart(2, '0')}-${id[1].padStart(2, '0')}`
  return t || null
}

/** Register provinsi 6 digit; sel berformat angka kehilangan nol di depannya. */
function register(v: NilaiPolos): string | null {
  if (typeof v === 'number' && Number.isInteger(v)) return String(v).padStart(6, '0')
  return teks(v)
}

function nilaiKolom(k: KolomKib, v: NilaiPolos): NilaiKib {
  switch (k.tipe) {
    case 'angka': case 'uang': return angka(v)
    case 'tanggal': return tanggal(v)
    case 'register': return register(v)
    default: return teks(v)
  }
}

/** Kunci pencocokan impor ulang. KIB F tanpa kode & register → dari isinya. */
export function kunciImpor(g: Golongan, a: { kode_barang: string | null; register: string | null; nama_resmi: string; kib: Record<string, NilaiKib> }): string | null {
  if (punyaRegister(g)) return a.kode_barang && a.register ? `${a.kode_barang}|${a.register}` : null
  return ['F', a.nama_resmi, a.kib.letak, a.kib.tgl_mulai].map(x => String(x ?? '').trim().toLowerCase()).join('|')
}

function golonganLembar(ws: ExcelJS.Worksheet): Golongan | null {
  for (let r = 1; r <= 4; r++) {
    for (let c = 1; c <= 6; c++) {
      const m = /KARTU INVENTARIS BARANG \(KIB\)\s*([A-F])\./i.exec(String(polosSelExcel(ws.getCell(r, c)) ?? ''))
      if (m) return m[1].toUpperCase() as Golongan
    }
  }
  const m = /^KIB([A-F])$/i.exec(ws.name.trim())
  return m ? (m[1].toUpperCase() as Golongan) : null
}

/**
 * Baris nomor kolom: sel-sel awalnya 1, 2, 3. Cukup tiga — KIB B mengulang "8", dan kolom yang
 * disisipkan provinsi di tengah membuat penomoran sesudahnya tidak runtut.
 */
function cariBarisNomor(ws: ExcelJS.Worksheet): number | null {
  for (let r = 1; r <= 40; r++) {
    const isi = [1, 2, 3].map(c => polosSelExcel(ws.getCell(r, c)))
    if (isi.every((v, i) => Number(v) === i + 1)) return r
  }
  return null
}

function bacaKop(ws: ExcelJS.Worksheet, sampai: number): KopBaca | null {
  const peta: Record<string, keyof KopBaca> = { kodelokasi: 'kode_lokasi', bidang: 'bidang', subbidang: 'sub_bidang', satuankerja: 'satuan_kerja' }
  const kop: KopBaca = { kode_lokasi: '', bidang: '', sub_bidang: '', satuan_kerja: '' }
  let ada = false
  for (let r = 1; r < sampai; r++) {
    const kunci = peta[rapat(polosSelExcel(ws.getCell(r, 1)))]
    if (!kunci) continue
    for (let c = 2; c <= 5; c++) {
      const v = teks(polosSelExcel(ws.getCell(r, c)))?.replace(/^:\s*/, '').trim()
      if (v && v !== ':') { kop[kunci] = v; ada = true; break }
    }
  }
  return ada ? kop : null
}

/** Pemetaan kolom berkas → definisi. Kepala 3 baris persis dulu, lalu baris terbawah bila unik. */
export function petakanKolom(g: Golongan, kepala: string[][]): { peta: Map<number, KolomKib>; takDikenal: string[] } {
  const defs = KOLOM_KIB[g]
  const peta = new Map<number, KolomKib>()
  const takDikenal: string[] = []
  const dipakai = new Set<string>()
  const lebar = Math.max(...kepala.map(r => r.length))
  for (let c = 0; c < lebar; c++) {
    const tiga = [0, 1, 2].map(i => rapat(kepala[i]?.[c]))
    if (tiga.every(t => !t)) continue
    let def = defs.find(d => !dipakai.has(d.kunci) && d.kepala.every((t, i) => rapat(t) === tiga[i]))
    if (!def) {
      const calon = defs.filter(d => !dipakai.has(d.kunci) && rapat(d.kepala[2]) === tiga[2])
      if (calon.length === 1) def = calon[0]
    }
    if (def) { peta.set(c, def); dipakai.add(def.kunci) }
    else takDikenal.push((kepala[2]?.[c] || kepala[0]?.[c] || `kolom ${c + 1}`).trim())
  }
  return { peta, takDikenal }
}

const WAJIB: Record<Golongan, string[]> = {
  A: ['nama_resmi', 'kode_barang', 'register', 'harga'], B: ['nama_resmi', 'kode_barang', 'register', 'harga'],
  C: ['nama_resmi', 'kode_barang', 'register', 'harga'], D: ['nama_resmi', 'kode_barang', 'register', 'harga'],
  E: ['nama_resmi', 'kode_barang', 'register', 'harga'], F: ['nama_resmi', 'harga'],
}

/** Kolom KIB yang menyimpan tahun pengadaan — cadangan bila kode barang tak memuat tahun. */
const KOLOM_TAHUN: Partial<Record<Golongan, string>> = { A: 'tahun_pengadaan', B: 'tahun_pembelian', E: 'tahun_cetak', F: 'tgl_mulai' }

export function bacaWorkbookKib(wb: ExcelJS.Workbook): HasilBacaKib {
  const hasil: HasilBacaKib = { lembar: [], aset: [], masalah: [], peringatan: [], kop: null }
  if (wb.worksheets.length > MAKS_LEMBAR) {
    hasil.masalah.push(`Berkas berisi ${wb.worksheets.length} lembar — paling banyak ${MAKS_LEMBAR}. Ini bukan berkas ekspor KIB.`)
    return hasil
  }
  const kunciDilihat = new Map<string, string>()
  for (const ws of wb.worksheets) {
    const g = golonganLembar(ws)
    if (!g) continue
    const rNomor = cariBarisNomor(ws)
    if (!rNomor || rNomor < 4) { hasil.peringatan.push(`Lembar ${ws.name}: baris nomor kolom (1, 2, 3, …) tidak ditemukan — dilewati.`); continue }
    const kolomAkhir = Math.min(ws.actualColumnCount || ws.columnCount, MAKS_KOLOM)
    const kepala = [rNomor - 3, rNomor - 2, rNomor - 1].map(r => Array.from({ length: kolomAkhir }, (_, c) => teks(polosSelExcel(ws.getCell(r, c + 1))) ?? ''))
    const { peta, takDikenal } = petakanKolom(g, kepala)
    const ada = new Set([...peta.values()].map(k => k.kunci))
    const hilang = WAJIB[g].filter(k => !ada.has(k))
    if (hilang.length) {
      hasil.masalah.push(`Lembar ${ws.name} (KIB ${g}): kolom ${hilang.map(k => KOLOM_KIB[g].find(d => d.kunci === k)?.kepala[2] ?? k).join(', ')} tidak ditemukan. Pastikan berkasnya ekspor KIB dari sistem provinsi tanpa kolom yang dihapus.`)
      continue
    }
    hasil.kop ??= bacaKop(ws, rNomor - 3)
    let jumlah = 0
    const barisAkhir = ws.actualRowCount ? Math.max(ws.rowCount, rNomor) : rNomor
    for (let r = rNomor + 1; r <= barisAkhir; r++) {
      const sel = (c: number) => polosSelExcel(ws.getCell(r, c + 1))
      if (Array.from({ length: kolomAkhir }, (_, c) => sel(c)).some(v => rapat(v) === 'jumlah')) break
      const isi: Record<string, NilaiKib> = {}
      for (const [c, def] of peta) if (def.kunci !== 'no') isi[def.kunci] = nilaiKolom(def, sel(c))
      const nama = typeof isi.nama_resmi === 'string' ? isi.nama_resmi : null
      if (!nama && !isi.kode_barang && !isi.harga) continue
      if (hasil.aset.length >= MAKS_ASET) { hasil.masalah.push(`Berkas memuat lebih dari ${MAKS_ASET.toLocaleString('id-ID')} aset.`); return hasil }
      if (!nama) { hasil.masalah.push(`${ws.name} baris ${r}: nama barang kosong.`); continue }
      const kode = (isi.kode_barang as string | null) ?? null
      const reg = (isi.register as string | null) ?? null
      const { tahun, kodeObjek } = uraiKodeBarang(kode)
      const kib: Record<string, NilaiKib> = {}
      for (const [k, v] of Object.entries(isi)) {
        if (!['nama_resmi', 'kode_barang', 'register', 'kondisi', 'asal_usul', 'harga', 'keterangan'].includes(k)) kib[k] = v
      }
      const kondisiTeks = isi.kondisi == null ? null : String(isi.kondisi)
      const kondisi = bacaKondisi(kondisiTeks)
      if (kondisiTeks && !kondisi) hasil.peringatan.push(`${ws.name} baris ${r}: kondisi "${kondisiTeks}" tidak dikenal — dibiarkan kosong.`)
      const kolTahun = KOLOM_TAHUN[g]
      const tahunCadangan = kolTahun ? Number(String(kib[kolTahun] ?? '').slice(0, 4)) : NaN
      const aset: AsetBaca = {
        golongan: g, lembar: ws.name, baris: r, kunci: '',
        kode_barang: kode, register: reg, kode_objek: kodeObjek,
        tahun_perolehan: tahun ?? (tahunCadangan >= 1900 && tahunCadangan <= 2200 ? tahunCadangan : null),
        nama_resmi: nama, harga: Number(isi.harga ?? 0),
        asal_usul: (isi.asal_usul as string | null) ?? null, keterangan: (isi.keterangan as string | null) ?? null,
        kondisi, kib,
      }
      const kunci = kunciImpor(g, aset)
      if (!kunci) { hasil.masalah.push(`${ws.name} baris ${r}: kode barang atau register kosong.`); continue }
      const golKode = golonganDariKodeObjek(kodeObjek)
      if (golKode && golKode !== g) hasil.peringatan.push(`${ws.name} baris ${r}: kode barang menunjuk golongan ${golKode}, tapi lembarnya KIB ${g}.`)
      const sebelumnya = kunciDilihat.get(kunci)
      if (sebelumnya) { hasil.masalah.push(`${ws.name} baris ${r}: register kembar dengan ${sebelumnya} (${kode ?? nama} · ${reg ?? '—'}).`); continue }
      kunciDilihat.set(kunci, `${ws.name} baris ${r}`)
      aset.kunci = kunci
      hasil.aset.push(aset)
      jumlah++
    }
    if (takDikenal.length) hasil.peringatan.push(`Lembar ${ws.name}: kolom ${takDikenal.map(t => `"${t}"`).join(', ')} tidak dikenal — tidak disimpan.`)
    if (jumlah > 0) hasil.lembar.push({ nama: ws.name, golongan: g, jumlah, kolomTakDikenal: takDikenal })
  }
  if (hasil.lembar.length === 0 && hasil.masalah.length === 0) {
    hasil.masalah.push('Tidak ada lembar KIB berisi data. Unggah berkas ekspor KIB (lembar KIBA … KIBF) dari sistem aset provinsi.')
  }
  return hasil
}

export { GOLONGAN }
