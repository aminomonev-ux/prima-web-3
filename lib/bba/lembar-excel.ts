// lib/bba/lembar-excel.ts — lembar ekspor selain KIB: hasil sensus per golongan (KIBxInv) + rekap
// sensus (RKPInv), KIR per ruangan, Buku Inventaris (BI), Rekapitulasi BMD, dan format kerja PRIMA.
// Konsep: docs/CONCEPT-bba-buku-aset.md §9. Bentuk & letak sel ditiru dari lembar templat yang ikut di
// berkas ekspor sistem aset provinsi; penulisnya `tulisLembar` (kib-excel.ts) supaya kop, kepala,
// baris Jumlah, dan tanda tangan satu aturan.
import type ExcelJS from 'exceljs'
import { TEKS_KONDISI_KIB, type Golongan, type KolomKib } from './kib'
import type { AsetRingan } from './aset'
import { namaTampil } from './aset'
import type { PengaturanBba } from './pengaturan'
import {
  KOLOM_SENSUS, NOMOR_SENSUS, JUDUL_SENSUS, KOLOM_TAHUN_SENSUS, KOLOM_KIR, KOLOM_BI, KOLOM_REKAP, KOLOM_RKP,
  AKUN_BMD, OBJEK_BMD, barisKir, barisBi, rekapBmd, masukBukuResmi, spesifikasi,
} from './lembar'
import { kondisiSensus, statusCek, fmtTanggal } from './kondisi'
import {
  tulisLembar, nilaiSelKib, urutCetak, blokKiri, blokKanan, kopBawaan, barisIsi, FMT_UANG,
} from './kib-excel'

const kisiDari = (kolom: readonly KolomKib[], baris = 3) => Array.from({ length: baris }, (_, i) => kolom.map(k => k.kepala[i]))
const urut = (n: number) => Array.from({ length: n }, (_, i) => String(i + 1))
const MARGIN_SEMPIT = { left: 0.118, right: 0.118, top: 0.551, bottom: 0.551, header: 0.315, footer: 0.315 }
const MARGIN_SEDANG = { left: 0.315, right: 0.315, top: 0.551, bottom: 0.748, header: 0.315, footer: 0.315 }

/** Nama lembar Excel: ≤ 31 huruf, tanpa []:*?/\ , tidak kembar. */
export function namaLembarAman(nama: string, dipakai: Set<string>): string {
  const dasar = nama.replace(/[[\]:*?/\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 31) || 'Lembar'
  let n = dasar, i = 2
  while (dipakai.has(n.toLowerCase())) { const akhir = ` (${i++})`; n = dasar.slice(0, 31 - akhir.length) + akhir }
  dipakai.add(n.toLowerCase())
  return n
}

// ─── Hasil sensus ────────────────────────────────────────────────────────────

/** Satu golongan. Kolom "Kondisi" = hasil pemeriksaan di PRIMA bertanggal tahun `tahun` saja; selebihnya kosong. */
export function tulisLembarSensus(wb: ExcelJS.Workbook, g: Golongan, rows: readonly AsetRingan[], p: PengaturanBba, tahun: number, tanggalCetak: string): ExcelJS.Worksheet {
  const kolom = KOLOM_SENSUS[g]
  const iHarga = kolom.findIndex(k => k.kunci === 'harga') + 1
  const t = p.ttd
  const kt = KOLOM_TAHUN_SENSUS[g]
  return tulisLembar(wb, {
    nama: `KIB${g}Inv`, judul: JUDUL_SENSUS[g], kop: kopBawaan(p),
    kopLain: [{ r: 8, c: kt, v: 'TAHUN' }, { r: 8, c: kt + 1, v: `: ${tahun}` }],
    kolom, kisi: kisiDari(kolom), barisKepala: 10, tinggiKepala: { 2: 28.8 }, nomor: NOMOR_SENSUS[g],
    baris: urutCetak(rows).map((a, i) => kolom.map(k => {
      if (k.kunci !== 'kondisi_sensus') return nilaiSelKib(k, a, i + 1)
      const ks = kondisiSensus(a, tahun)
      return ks ? TEKS_KONDISI_KIB[ks] : ''
    })),
    tinggiPenutup: 6.75,
    jumlah: { label: [iHarga - 2, 'Jumlah'], sum: [iHarga] },
    ttd: [
      ...blokKiri(g === 'F' ? 3 : 4, t.kepala_jabatan || 'KEPALA SKPD', t.kepala_nama, t.kepala_nip),
      ...blokKanan(p, tanggalCetak, 'Pengurus Barang', t.pengurus_nama, t.pengurus_nip, { c: iHarga - 1 }),
    ],
    halaman: { orientation: 'landscape', scale: 62, margins: MARGIN_SEMPIT },
  })
}

const persen = (r: number, cJml: string, mutlak: boolean, hasil: number): ExcelJS.CellValue => {
  const d = mutlak ? `$D$${r}` : `$D${r}`
  return { formula: `IF(${d}=0,0,${cJml}${r}/${d}*100)`, result: hasil }
}

/** RKPInv: per kode objek — nilai buku (AUDITED) lawan kondisi hasil sensus tahun `tahun`. */
export function tulisRekapSensus(wb: ExcelJS.Workbook, rows: readonly AsetRingan[], p: PengaturanBba, tahun: number, tanggalCetak: string): ExcelJS.Worksheet {
  const { objek } = rekapBmd(rows, a => kondisiSensus(a, tahun))
  const bentuk = { barisKepala: 10, kisi: kisiDari(KOLOM_RKP), nomor: undefined }
  const r0 = barisIsi(bentuk)
  const pct = (x: number, n: number) => (n ? (x / n) * 100 : 0)
  const isi = OBJEK_BMD.filter(([kode]) => (objek.get(kode)?.jumlah ?? 0) > 0)
  const baris = isi.map(([kode, nama], i) => {
    const x = objek.get(kode)!
    const r = r0 + i
    return [i + 1, kode, nama, x.jumlah, x.harga,
      x.B, persen(r, 'F', false, pct(x.B, x.jumlah)), x.RR, persen(r, 'H', false, pct(x.RR, x.jumlah)),
      x.RB, persen(r, 'J', false, pct(x.RB, x.jumlah)), 0, persen(r, 'L', false, 0)]
  })
  const tot = (k: 'jumlah' | 'B' | 'RR' | 'RB') => isi.reduce((s, [kode]) => s + objek.get(kode)![k], 0)
  const t = p.ttd
  return tulisLembar(wb, {
    nama: 'RKPInv', judul: 'REKAP HASIL SENSUS BARANG ', kop: kopBawaan(p),
    kopLain: [{ r: 8, c: 8, v: 'TAHUN' }, { r: 8, c: 9, v: `: ${tahun}` }],
    kolom: KOLOM_RKP, ...bentuk, baris, tinggiPenutup: 6.75,
    jumlah: {
      sum: [4, 5, 6, 8, 10, 12],
      lain: rJ => ([['F', 7, 'B'], ['H', 9, 'RR'], ['J', 11, 'RB'], ['L', 13, null]] as const).map(([h, c, k]) => ({
        c, v: persen(rJ, h, true, k ? pct(tot(k), tot('jumlah')) : 0), numFmt: FMT_UANG,
      })),
    },
    ttd: [
      ...blokKiri(3, t.kepala_jabatan || 'KEPALA SKPD', t.kepala_nama, t.kepala_nip),
      ...blokKanan(p, tanggalCetak, 'Pengurus Barang', t.pengurus_nama, t.pengurus_nip, { c: 10 }),
    ],
    halaman: { orientation: 'portrait', scale: 63, margins: MARGIN_SEDANG },
  })
}

// ─── Kartu Inventaris Ruangan ────────────────────────────────────────────────

export interface RuangKir {
  nama: string
  luas: number | null
  pj_nama: string | null
  pj_nip: string | null
  gedung: { nama: string; kode_barang: string | null; register: string | null } | null
}

export function kodeGedung(g: RuangKir['gedung']): string {
  if (!g) return ''
  const kode = [g.kode_barang, g.register].filter(Boolean).join(' reg. ')
  return kode ? `${g.nama} (${kode})` : g.nama
}

export function tulisLembarKir(wb: ExcelJS.Workbook, ruang: RuangKir, rows: readonly AsetRingan[], p: PengaturanBba, tanggalCetak: string, nama = 'KIR'): ExcelJS.Worksheet {
  const t = p.ttd
  return tulisLembar(wb, {
    nama, judul: 'KARTU INVENTARIS RUANGAN',
    kop: [
      ['Bidang', p.kop.bidang], ['Sub Bidang', p.kop.sub_bidang], ['Satuan Kerja', p.kop.satuan_kerja],
      ['Kode Gedung', kodeGedung(ruang.gedung)], ['Ruang', ruang.nama], ['Luas', ruang.luas != null ? `${ruang.luas.toLocaleString('id-ID')} m2` : ''],
    ],
    kopLain: [{ r: 10, c: 8, v: 'No. Kode Lokasi' }, { r: 10, c: 10, v: `: ${p.kop.kode_lokasi}`.trimEnd() }],
    kolom: KOLOM_KIR, kisi: kisiDari(KOLOM_KIR), barisKepala: 12, nomor: urut(KOLOM_KIR.length),
    baris: urutCetak(rows).map((a, i) => { const b = barisKir(a); return KOLOM_KIR.map(k => (k.kunci === 'no' ? i + 1 : b[k.kunci] ?? '')) }),
    tinggiPenutup: 7.5,
    jumlah: { label: [8, 'Jumlah'], sum: [11] },
    ttd: [
      ...blokKiri(3, 'Penanggung Jawab Ruangan', ruang.pj_nama ?? '', ruang.pj_nip ?? ''),
      ...blokKanan(p, tanggalCetak, 'Pembantu Pengurus Barang', t.pembantu_nama, t.pembantu_nip, { c: 12, sampai: 13 }),
    ],
    halaman: { orientation: 'landscape', scale: 70, margins: MARGIN_SEDANG },
  })
}

// ─── Buku Inventaris & Rekapitulasi BMD ──────────────────────────────────────

export function tulisBukuInventaris(wb: ExcelJS.Workbook, rows: readonly AsetRingan[], p: PengaturanBba, tanggalCetak: string): ExcelJS.Worksheet {
  const t = p.ttd
  return tulisLembar(wb, {
    nama: 'BI', judul: 'BUKU INVENTARIS BARANG MILIK DAERAH', kop: kopBawaan(p),
    kolom: KOLOM_BI, kisi: kisiDari(KOLOM_BI), barisKepala: 10, nomor: urut(KOLOM_BI.length),
    baris: urutCetak(rows.filter(masukBukuResmi)).map((a, i) => { const b = barisBi(a); return KOLOM_BI.map(k => (k.kunci === 'no' ? i + 1 : b[k.kunci] ?? '')) }),
    tinggiPenutup: 6,
    jumlah: { label: [9, 'Jumlah'], sum: [13, 14] },
    ttd: [
      ...blokKiri(3, t.kepala_jabatan || 'KEPALA SKPD', t.kepala_nama, t.kepala_nip),
      ...blokKanan(p, tanggalCetak, 'Pengurus Barang', t.pengurus_nama, t.pengurus_nip, { c: 12, sampai: 15, dJabatan: 4, kotaDari: 14 }),
    ],
    halaman: { orientation: 'landscape', scale: 66, margins: MARGIN_SEMPIT },
  })
}

/**
 * Urutan baris seperti lembar Rekap provinsi: akun TANAH, lalu semua kode objek (jumlah di kolom 5–6),
 * lalu akun 1.3.2–1.3.6 (jumlah di kolom 7–8), lalu satu baris kosong. `periode` = YYYYMM.
 */
export function tulisRekapBmd(wb: ExcelJS.Workbook, rows: readonly AsetRingan[], p: PengaturanBba, periode: string, tanggalCetak: string): ExcelJS.Worksheet {
  const { objek, akun } = rekapBmd(rows)
  const barisAkun = ([kode, nama]: readonly [string, string]) => ['', kode, '', nama, 0, 0, akun.get(kode)?.jumlah ?? 0, akun.get(kode)?.harga ?? 0, '']
  const isi: ExcelJS.CellValue[][] = [
    barisAkun(AKUN_BMD[0]),
    ...OBJEK_BMD.map(([kode, nama]) => ['', '', kode, nama, objek.get(kode)?.jumlah ?? 0, objek.get(kode)?.harga ?? 0, 0, 0, '']),
    ...AKUN_BMD.slice(1).map(barisAkun),
  ].map((b, i) => [i + 1, ...b.slice(1)])
  const t = p.ttd
  return tulisLembar(wb, {
    nama: 'Rekap', judul: 'REKAPITULASI BARANG MILIK DAERAH', kolomJudul: 4, kop: kopBawaan(p),
    kopLain: [{ r: 8, c: 8, v: 'Periode s/d' }, { r: 8, c: 9, v: `: ${periode}` }],
    kolom: KOLOM_REKAP, kisi: kisiDari(KOLOM_REKAP, 2), barisKepala: 10, tinggiKepala: { 1: 37.5 }, nomor: urut(KOLOM_REKAP.length),
    baris: [...isi, []], tinggiPenutup: 9.75,
    jumlah: { label: [4, 'JUMLAH'], sum: [5, 6, 7, 8] },
    ttd: [
      ...blokKiri(3, t.kepala_jabatan || 'KEPALA SKPD', t.kepala_nama, t.kepala_nip),
      ...blokKanan(p, tanggalCetak, 'Pengurus Barang', t.pengurus_nama, t.pengurus_nip, { c: 8, dJabatan: 4 }),
    ],
    halaman: { orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0, scale: 67, margins: { ...MARGIN_SEMPIT, left: 0.315, right: 0.315, bottom: 0.551 } },
  })
}

// ─── Format kerja PRIMA ──────────────────────────────────────────────────────

/** Register + tambahan PRIMA yang tidak ada di format provinsi. */
export type AsetKerja = AsetRingan & {
  lokasi_nama?: string | null
  gedung_nama?: string | null
  barang_nama?: string | null
  kondisi_oleh_nama?: string | null
  /** "2027 Penggantian BBA-000123; …" — rencana yang menjadikan aset ini sasaran (Tahap D). */
  rencana_terkait?: string | null
}

const LABEL_CEK = { BELUM: 'Belum dicek', LEWAT: 'Perlu dicek ulang', TERKINI: 'Terkini' } as const

const KOLOM_KERJA: [judul: string, lebar: number, nilai: (a: AsetKerja, batas: string) => ExcelJS.CellValue, fmt?: string][] = [
  ['Golongan', 9, a => a.golongan],
  ['Kode Barang', 30, a => a.kode_barang ?? ''],
  ['Register', 9, a => a.register ?? ''],
  ['Nama Resmi', 32, a => a.nama_resmi],
  ['Nama Sehari-hari', 28, a => namaTampil(a) === a.nama_resmi ? '' : namaTampil(a)],
  ['Barang (Master)', 24, a => a.barang_nama ?? ''],
  ['Tahun', 7, a => a.tahun_perolehan ?? ''],
  ['Merk/Type', 18, a => spesifikasi(a).merk],
  ['Nomor', 18, a => spesifikasi(a).nomor],
  ['Bahan', 14, a => spesifikasi(a).bahan],
  ['Ukuran', 12, a => spesifikasi(a).ukuran],
  ['Harga', 17, a => a.harga, FMT_UANG],
  ['Asal Usul', 16, a => a.asal_usul ?? ''],
  ['Ruangan', 20, a => a.lokasi_nama ?? ''],
  ['Gedung', 20, a => a.gedung_nama ?? ''],
  ['Kondisi', 14, a => (a.kondisi ? TEKS_KONDISI_KIB[a.kondisi] : '')],
  ['Sumber Kondisi', 12, a => (a.kondisi_sumber === 'CEK' ? 'Dicek di PRIMA' : a.kondisi_sumber === 'IMPOR' ? 'Impor KIB' : '')],
  ['Dicek Tanggal', 13, a => (a.kondisi_sumber === 'CEK' ? fmtTanggal(a.kondisi_tgl) : '')],
  ['Dicek Oleh', 20, a => (a.kondisi_sumber === 'CEK' ? a.kondisi_oleh_nama ?? '' : '')],
  ['Status Cek', 12, (a, batas) => { const s = statusCek(a, batas); return s ? LABEL_CEK[s] : '' }],
  ['Keterangan', 30, a => a.keterangan ?? ''],
  ['Rencana Terkait', 32, a => a.rencana_terkait ?? ''],
  ['Status', 9, a => a.status],
]

/** Lembar datar untuk disaring/diolah sendiri — bukan dokumen resmi, jadi tanpa kop & tanda tangan. */
export function tulisLembarKerja(wb: ExcelJS.Workbook, rows: readonly AsetKerja[], batas: string): ExcelJS.Worksheet {
  const ws = wb.addWorksheet('Buku Aset PRIMA', { views: [{ state: 'frozen', ySplit: 1 }] })
  ws.columns = KOLOM_KERJA.map(([header, width]) => ({ header, width }))
  const kepala = ws.getRow(1)
  kepala.font = { bold: true }
  kepala.alignment = { vertical: 'middle', wrapText: true }
  for (const a of urutCetak(rows)) {
    const r = ws.addRow(KOLOM_KERJA.map(([, , nilai]) => nilai(a, batas)))
    KOLOM_KERJA.forEach(([, , , fmt], c) => { if (fmt) r.getCell(c + 1).numFmt = fmt })
    r.getCell(7).numFmt = '0'
  }
  ws.getColumn(3).numFmt = '@'
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: KOLOM_KERJA.length } }
  return ws
}
