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

export interface SaranPj {
  pj: string
  /** Banyaknya baris pembanding ber-PJ ini. */
  dukungan: number
  /** Banyaknya baris pembanding yang ber-PJ (semua label). */
  dari: number
  /** 'saudara' = anak induk yang sama; 'kerabat' = satu tingkat di atasnya. */
  dasar: 'saudara' | 'kerabat'
}

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
  | (PosDasar & { jenis: 'celah'; barisCabang: number; saran: SaranPj | null })
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

export function rekonsiliasiPj(rows: readonly BarisRekon[]): HasilRekon {
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
      if (nilai !== 0) pos.push({ ...dasar(n, nilai), jenis: 'celah', barisCabang: jumlahCabang(n), saran: saranPj(n) })
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
  const asal = s.dasar === 'saudara' ? 'baris sejenis di bawah induk yang sama' : 'baris di cabang sebelahnya'
  return s.dukungan === s.dari
    ? `saran: ${s.pj} (${s.dukungan} ${asal} ber-PJ ini)`
    : `saran: ${s.pj} (${s.dukungan} dari ${s.dari} ${asal} — campuran)`
}

export function kalimatPos(p: PosRekon): string {
  const nama = [p.kode, p.uraian].filter(Boolean).join(' ') || '(tanpa uraian)'
  const di = p.jalur && !p.kode ? ` — di bawah ${p.jalur}` : ''
  const dampak = `rekap ${arahPos(p.nilai)} Rp ${rp(p.nilai)}`
  if (p.jenis === 'celah') {
    const s = kalimatSaran(p.saran)
    return `${nama}${di}: belum ber-PJ${p.barisCabang > 1 ? ` (${p.barisCabang} baris)` : ''} — ${dampak}${s ? `; ${s}` : ''}`
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
