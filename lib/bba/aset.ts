// lib/bba/aset.ts — aturan buku aset yang MURNI: dipakai data layer, layar, dan uji.
// Konsep: docs/CONCEPT-bba-buku-aset.md §5, §7.1.
import type { Golongan, Kondisi } from './kib'
import type { AsetBaca, NilaiKib } from './kib-baca'
import { statusCek } from './kondisi'
import { kunciNamaBarang } from './barang'

export interface AsetRingan {
  id: number
  golongan: Golongan
  kode_barang: string | null
  register: string | null
  kunci_impor: string | null
  kode_objek: string | null
  tahun_perolehan: number | null
  nama_resmi: string
  nama: string | null
  lokasi_id: number | null
  harga: number
  asal_usul: string | null
  keterangan: string | null
  kondisi: Kondisi | null
  kondisi_sumber: 'IMPOR' | 'CEK' | null
  kib: Record<string, NilaiKib>
  status: 'AKTIF' | 'DIHAPUS'
  /** Diisi pembaca DB (Tahap C); objek uji & hasil impor boleh tanpa. */
  kondisi_tgl?: string | null
  version?: number
  barang_id?: number | null
  /** Terisi = lahir di PRIMA lewat Tempatkan (Tahap E), bukan dari berkas KIB. */
  penerimaan_id?: number | null
}

/** Perencana mencari "Bangsal", bukan "Bangunan gudang tertutup permanen" (§4 temuan 3). */
export function namaTampil(a: Pick<AsetRingan, 'nama' | 'nama_resmi'>): string {
  return a.nama?.trim() || a.nama_resmi
}

/**
 * Asal catatan menentukan jalan koreksinya (§20): yang lahir dari berkas KIB dibetulkan di sistem
 * provinsi lalu diimpor ulang; yang lahir di PRIMA lewat Tempatkan dibetulkan di PRIMA.
 */
export const lahirDiPrima = (a: Pick<AsetRingan, 'penerimaan_id'>): boolean => a.penerimaan_id != null

/** KIB F dari berkas memang bisa tanpa kode — itu bukan "belum teregister". */
export const belumTeregister = (a: Pick<AsetRingan, 'penerimaan_id' | 'kode_barang'>): boolean => lahirDiPrima(a) && !a.kode_barang

/** Kondisi hasil impor bukan hasil pemeriksaan (§5.3). */
export function belumDicek(a: Pick<AsetRingan, 'kondisi' | 'kondisi_sumber'>): boolean {
  return a.kondisi_sumber !== 'CEK'
}

// ─── Tampilan berkelompok (§5.1) ─────────────────────────────────────────────

export interface KelompokAset {
  kunci: string
  golongan: Golongan
  nama: string
  nama_resmi: string
  tahun: number | null
  lokasi_id: number | null
  ids: number[]
  register: string[]
  harga: number
  kondisi: { B: number; RR: number; RB: number; kosong: number }
  belumDicek: number
  /** Sudah dicek di PRIMA tapi lebih lama dari jarak opname (pengaturan). */
  lewat: number
  belumTeregister: number
}

/**
 * Sejenis-setahun-seruangan: nama tampil + kode objek + tahun + ruangan. Data tetap per register.
 * `batas` = `batasCek(hari ini, jarak opname)`; tanpa itu `lewat` selalu 0.
 */
export function kelompokkan(rows: readonly AsetRingan[], batas = ''): KelompokAset[] {
  const peta = new Map<string, KelompokAset>()
  for (const a of rows) {
    const nama = namaTampil(a)
    const kunci = [a.golongan, nama.toLowerCase(), a.kode_objek ?? '', a.tahun_perolehan ?? '', a.lokasi_id ?? ''].join('|')
    let k = peta.get(kunci)
    if (!k) {
      k = { kunci, golongan: a.golongan, nama, nama_resmi: a.nama_resmi, tahun: a.tahun_perolehan, lokasi_id: a.lokasi_id,
        ids: [], register: [], harga: 0, kondisi: { B: 0, RR: 0, RB: 0, kosong: 0 }, belumDicek: 0, lewat: 0, belumTeregister: 0 }
      peta.set(kunci, k)
    }
    k.ids.push(a.id)
    if (a.register) k.register.push(a.register)
    if (belumTeregister(a)) k.belumTeregister++
    k.harga += a.harga
    if (a.kondisi) k.kondisi[a.kondisi]++
    else k.kondisi.kosong++
    const st = statusCek(a, batas)
    if (st === 'BELUM') k.belumDicek++
    else if (st === 'LEWAT') k.lewat++
  }
  return [...peta.values()]
}

/** "000011–000014" untuk register berurutan, selebihnya dipisah koma (dipendekkan). */
export function rentangRegister(regs: readonly string[]): string {
  if (regs.length === 0) return '—'
  const urut = [...regs].sort()
  const angka = urut.map(r => (/^\d+$/.test(r) ? Number(r) : NaN))
  const runtut = angka.every((n, i) => Number.isFinite(n) && (i === 0 || n === angka[i - 1] + 1))
  if (urut.length === 1) return urut[0]
  if (runtut) return `${urut[0]}–${urut[urut.length - 1]}`
  return urut.length <= 4 ? urut.join(', ') : `${urut.slice(0, 3).join(', ')}, … (${urut.length})`
}

// ─── Impor ulang (§7.1 butir 3) ──────────────────────────────────────────────

const LABEL_POKOK: Record<string, string> = {
  nama_resmi: 'nama resmi', kode_objek: 'kode objek', tahun_perolehan: 'tahun perolehan', harga: 'harga',
  asal_usul: 'asal usul', keterangan: 'keterangan', kondisi: 'kondisi', golongan: 'golongan', status: 'status',
}

const samaNilai = (a: unknown, b: unknown) => (a ?? null) === (b ?? null) || (typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) < 0.005)

/** Isi KIB yang dibandingkan: baris berkas, atau catatan kembaran yang isinya salinan berkas (§23.2). */
export type IsiBerkas = Pick<AsetBaca, 'kode_barang' | 'register' | 'nama_resmi' | 'kode_objek' | 'tahun_perolehan' | 'harga' | 'asal_usul' | 'keterangan' | 'kondisi' | 'kib'>

/**
 * Yang diperbarui impor ulang = kolom KIB. Tambahan PRIMA (nama sehari-hari, ruangan, barang)
 * tidak pernah disentuh; kondisi hanya diperbarui selama belum dicek di PRIMA (CEK menang).
 * Aset yang sudah DIHAPUS di PRIMA tapi masih ada di berkas: dikembalikan aktif TIDAK —
 * cukup dilaporkan (statusnya keputusan RT, bukan berkas).
 */
export function bandingAset(lama: AsetRingan, baru: IsiBerkas): { kolom: string[]; ubah: Partial<AsetRingan> } {
  const ubah: Partial<AsetRingan> = {}
  const kolom: string[] = []
  const pokok = ['nama_resmi', 'kode_objek', 'tahun_perolehan', 'harga', 'asal_usul', 'keterangan'] as const
  for (const k of pokok) {
    if (!samaNilai(lama[k], baru[k])) { (ubah as Record<string, unknown>)[k] = baru[k]; kolom.push(LABEL_POKOK[k]) }
  }
  if (lama.kondisi_sumber !== 'CEK' && !samaNilai(lama.kondisi, baru.kondisi)) { ubah.kondisi = baru.kondisi; kolom.push(LABEL_POKOK.kondisi) }
  const kunciKib = new Set([...Object.keys(lama.kib ?? {}), ...Object.keys(baru.kib)])
  const kibBerubah = [...kunciKib].filter(k => !samaNilai(lama.kib?.[k], baru.kib[k]))
  if (kibBerubah.length) { ubah.kib = { ...baru.kib }; kolom.push(...kibBerubah) }
  return { kolom, ubah }
}

export interface RencanaImpor {
  baru: AsetBaca[]
  /** Register baru di berkas yang dipasangkan dengan aset "belum teregister" (lahir dari penerimaan, Tahap E §7.5). */
  cocok: { lama: AsetRingan; baru: AsetBaca; ubah: Partial<AsetRingan> }[]
  berubah: { lama: AsetRingan; baru: AsetBaca; kolom: string[]; ubah: Partial<AsetRingan> }[]
  sama: number
  /** Aset DIHAPUS di PRIMA yang masih ada di berkas — dilaporkan, tidak dihidupkan lagi. */
  dihapusDiPrima: AsetBaca[]
  /** Register di PRIMA (golongan yang ada di berkas) yang tidak ada di berkas — dilaporkan, TIDAK dihapus. */
  tidakDiBerkas: AsetRingan[]
  /** "Mungkin aset yang sama, nomornya berubah" (§23.1) — ditawarkan di pratinjau, dipasangkan hanya bila dipilih. */
  calon: CalonGantiNomor[]
  /** Pasangan yang dipilih: catatan lama mendapat nomor & kolom KIB baris berkas itu — bukan aset baru. */
  dipasangkan: { lama: AsetRingan; baru: AsetBaca; ubah: Partial<AsetRingan> }[]
  /** Pasangan kiriman layar yang bukan calon menurut isi buku sekarang (berubah sejak pratinjau). */
  pasanganDitolak: string[]
}

export interface CalonGantiNomor { lama: AsetRingan; baru: AsetBaca[] }
export interface PasanganImpor { aset_id: number; kunci: string }

export function rencanakanImpor(lama: readonly AsetRingan[], baca: readonly AsetBaca[], pasangan: readonly PasanganImpor[] = []): RencanaImpor {
  const perKunci = new Map(lama.filter(a => a.kunci_impor).map(a => [a.kunci_impor!, a]))
  const hasil: RencanaImpor = { baru: [], cocok: [], berubah: [], sama: 0, dihapusDiPrima: [], tidakDiBerkas: [], calon: [], dipasangkan: [], pasanganDitolak: [] }
  const dipakai = new Set<string>()
  for (const b of baca) {
    const l = perKunci.get(b.kunci)
    if (!l) { hasil.baru.push(b); continue }
    dipakai.add(b.kunci)
    if (l.status === 'DIHAPUS') { hasil.dihapusDiPrima.push(b); continue }
    const { kolom, ubah } = bandingAset(l, b)
    if (kolom.length) hasil.berubah.push({ lama: l, baru: b, kolom, ubah })
    else hasil.sama++
  }
  const golBerkas = new Set(baca.map(b => b.golongan))
  const hilang = lama.filter(a => a.status === 'AKTIF' && a.kunci_impor && golBerkas.has(a.golongan) && !dipakai.has(a.kunci_impor))
  // Dari SEMUA register baru, sebelum cocok otomatis: nomor yang akan mengisi barang belum teregister bisa milik catatan lama.
  hasil.calon = calonGantiNomor(hilang, hasil.baru)
  const { dipasangkan, ditolak } = terapkanPasangan(hasil.calon, pasangan)
  hasil.dipasangkan = dipasangkan
  hasil.pasanganDitolak = ditolak
  const barisTerpasang = new Set(dipasangkan.map(x => x.baru)), lamaTerpasang = new Set(dipasangkan.map(x => x.lama.id))
  const { cocok, sisa } = cocokkanBelumTeregister(lama, hasil.baru.filter(b => !barisTerpasang.has(b)))
  hasil.cocok = cocok
  hasil.baru = sisa
  hasil.tidakDiBerkas = hilang.filter(a => !lamaTerpasang.has(a.id))
  return hasil
}

const kunciPasang = (golongan: string, tahun: number | null, harga: number) => `${golongan}|${tahun ?? ''}|${Math.round(harga * 100)}`

/**
 * Satu aturan untuk pratinjau impor DAN saran kembaran di kartu aset (§23): golongan + tahun + harga sama, ditambah
 * nama resmi sama bila catatannya dari berkas — namanya juga dari provinsi, jadi barang beda jenis yang kebetulan
 * setahun & seharga tersaring. Nama resmi isian Tempatkan diketik petugas; dijadikan syarat, pasangan benar tersaring.
 */
export function sejenisCalon(
  lama: Pick<AsetRingan, 'golongan' | 'tahun_perolehan' | 'harga' | 'nama_resmi' | 'penerimaan_id'>,
  isi: Pick<AsetBaca, 'golongan' | 'tahun_perolehan' | 'harga' | 'nama_resmi'>,
): boolean {
  return kunciPasang(lama.golongan, lama.tahun_perolehan, lama.harga) === kunciPasang(isi.golongan, isi.tahun_perolehan, isi.harga)
    && (lahirDiPrima(lama) || kunciNamaBarang(lama.nama_resmi) === kunciNamaBarang(isi.nama_resmi))
}

/**
 * Catatan yang tidak ada di berkas ↔ register BARU sejenis (`sejenisCalon`). Tidak dipasangkan otomatis: ekspor
 * provinsi bisa sebagian (satu lokasi), jadi register yang tak ada di berkas belum tentu berganti nomor.
 */
export function calonGantiNomor(hilang: readonly AsetRingan[], baru: readonly AsetBaca[]): CalonGantiNomor[] {
  const perKunci = new Map<string, AsetBaca[]>()
  for (const b of baru) {
    const k = kunciPasang(b.golongan, b.tahun_perolehan, b.harga)
    perKunci.set(k, [...(perKunci.get(k) ?? []), b])
  }
  return hilang
    .map(a => ({ lama: a, baru: (perKunci.get(kunciPasang(a.golongan, a.tahun_perolehan, a.harga)) ?? []).filter(b => sejenisCalon(a, b)) }))
    .filter(x => x.baru.length > 0)
}

/** Tepat satu calon, dan calon itu bukan calon catatan lain — untuk "Pasangkan semua yang pasti". */
export function calonPasti(calon: readonly CalonGantiNomor[]): Set<number> {
  const n = new Map<string, number>()
  for (const x of calon) for (const b of x.baru) n.set(b.kunci, (n.get(b.kunci) ?? 0) + 1)
  return new Set(calon.filter(x => x.baru.length === 1 && n.get(x.baru[0].kunci) === 1).map(x => x.lama.id))
}

function terapkanPasangan(calon: readonly CalonGantiNomor[], pasangan: readonly PasanganImpor[]): Pick<RencanaImpor, 'dipasangkan'> & { ditolak: string[] } {
  const perLama = new Map(calon.map(x => [x.lama.id, x]))
  const lamaDipakai = new Set<number>(), kunciDipakai = new Set<string>()
  const dipasangkan: RencanaImpor['dipasangkan'] = [], ditolak: string[] = []
  for (const p of pasangan) {
    const x = perLama.get(p.aset_id)
    const b = x?.baru.find(y => y.kunci === p.kunci)
    const nama = x ? namaTampil(x.lama) : `Aset #${p.aset_id}`
    if (!x || !b) { ditolak.push(`${nama} ↔ ${p.kunci.split('|').pop()}: bukan calon pasangan lagi — isi Buku Aset berubah sejak pratinjau.`); continue }
    if (lamaDipakai.has(p.aset_id) || kunciDipakai.has(p.kunci)) { ditolak.push(`${nama} ↔ ${b.register ?? b.nama_resmi}: dipasangkan dua kali.`); continue }
    lamaDipakai.add(p.aset_id)
    kunciDipakai.add(p.kunci)
    dipasangkan.push({ lama: x.lama, baru: b, ubah: ubahGantiNomor(x.lama, b) })
  }
  return { dipasangkan, ditolak }
}

/**
 * Catatan lama mengambil nomor & kolom KIB dari berkas — atau dari kembarannya (§23.2). Isian PRIMA (nama sehari-hari,
 * barang, ruangan, kondisi hasil cek, penerimaan) tetap. Lahir dari Tempatkan: seperti cocok otomatis, sel KIB kosong
 * di berkas tidak menghapus merk/tipe dari penerimaan.
 */
export function ubahGantiNomor(lama: AsetRingan, isi: IsiBerkas & { kunci: string }): Partial<AsetRingan> {
  const { ubah } = bandingAset(lama, isi)
  const hasil: Partial<AsetRingan> = { ...ubah, kode_barang: isi.kode_barang, register: isi.register, kunci_impor: isi.kunci }
  if (lahirDiPrima(lama)) {
    const kib = { ...lama.kib }
    for (const [k, v] of Object.entries(isi.kib)) if (v != null && v !== '') kib[k] = v
    hasil.kib = kib
  }
  return hasil
}

/** Sebelum → sesudah untuk riwayat: hanya yang benar-benar berubah, kolom KIB per kunci (kunci impor turunan kode+register). */
export function selisihRiwayat(lama: AsetRingan, ubah: Partial<AsetRingan>): { sebelum: Record<string, unknown>; sesudah: Record<string, unknown> } {
  const sebelum: Record<string, unknown> = {}, sesudah: Record<string, unknown> = {}
  const asal = lama as unknown as Record<string, unknown>
  for (const [k, v] of Object.entries(ubah)) {
    if (k === 'kunci_impor') continue
    if (k === 'kib') {
      const kib = v as Record<string, NilaiKib>
      for (const kk of new Set([...Object.keys(lama.kib), ...Object.keys(kib)])) {
        if ((lama.kib[kk] ?? null) !== (kib[kk] ?? null)) { sebelum[kk] = lama.kib[kk] ?? null; sesudah[kk] = kib[kk] ?? null }
      }
    } else if (!samaNilai(asal[k], v)) { sebelum[k] = asal[k] ?? null; sesudah[k] = v ?? null }
  }
  return { sebelum, sesudah }
}

/**
 * Cocok otomatis (§7.5 butir 3): register BARU di berkas dipasangkan dengan aset "belum teregister" yang
 * golongan, tahun perolehan, dan harganya sama — satu-satu, urut register berkas × urut id. Yang tak
 * punya pasangan tetap jadi register baru. Isian PRIMA (nama sehari-hari, ruangan, barang) tetap; kolom
 * KIB berkas menang, kecuali yang kosong di berkas (merk/tipe dari penerimaan tidak dihapus sel kosong).
 */
export function cocokkanBelumTeregister(lama: readonly AsetRingan[], baru: readonly AsetBaca[]): { cocok: RencanaImpor['cocok']; sisa: AsetBaca[] } {
  const antre = new Map<string, AsetRingan[]>()
  for (const a of [...lama].filter(a => a.status === 'AKTIF' && !a.kunci_impor && !a.kode_barang).sort((x, y) => x.id - y.id)) {
    const k = kunciPasang(a.golongan, a.tahun_perolehan, a.harga)
    antre.set(k, [...(antre.get(k) ?? []), a])
  }
  const cocok: RencanaImpor['cocok'] = []
  const sisa: AsetBaca[] = []
  const urut = [...baru].sort((x, y) => (x.kode_barang ?? '').localeCompare(y.kode_barang ?? '') || (x.register ?? '').localeCompare(y.register ?? ''))
  for (const b of urut) {
    const l = antre.get(kunciPasang(b.golongan, b.tahun_perolehan, b.harga))?.shift()
    if (!l) { sisa.push(b); continue }
    const kib = { ...l.kib }
    for (const [k, v] of Object.entries(b.kib)) if (v != null && v !== '') kib[k] = v
    const ubah: Partial<AsetRingan> = {
      kode_barang: b.kode_barang, register: b.register, kunci_impor: b.kunci, kode_objek: b.kode_objek, tahun_perolehan: b.tahun_perolehan,
      nama_resmi: b.nama_resmi, asal_usul: b.asal_usul ?? l.asal_usul, keterangan: b.keterangan ?? l.keterangan, kib,
    }
    if (l.kondisi_sumber !== 'CEK' && b.kondisi) ubah.kondisi = b.kondisi
    cocok.push({ lama: l, baru: b, ubah })
  }
  // Urutan asli berkas untuk yang jadi register baru — pratinjau & riwayat mengikuti urutan berkas.
  const tetap = new Set(sisa)
  return { cocok, sisa: baru.filter(b => tetap.has(b)) }
}

/** Nama sehari-hari awal: dari Keterangan ("Gedung Bangsal I"), tidak lebih dari 255 huruf. */
export function namaDariKeterangan(keterangan: string | null): string | null {
  const t = keterangan?.replace(/\s+/g, ' ').trim()
  return t ? t.slice(0, 255) : null
}
