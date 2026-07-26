// lib/blud/export/spj-excel.ts — satu berkas .xlsx berisi seluruh lembar SPJ bulanan.
// Konsep: docs/CONCEPT-blud-realisasi.md §3.2 (pemetaan sheet), §4.7, Fase 5.
//
// Bentuk tiap lembar mengikuti berkas asli `docs/06. BKU Juni 2026.xlsx` — kop,
// urutan kolom, penomoran kolom, sampai format baku BEND-12 untuk SPJ & TUTUP KAS.
// Yang memeriksa di Keuangan/BPKAD membaca BENTUK ini; isi yang benar dengan
// bentuk yang asing tetap akan dikembalikan.
//
// Bedanya dengan berkas asli: semua lembar di sini TURUNAN dari tabel transaksi
// yang sama. Di berkas lama tiap lembar diketik/di-salin sendiri-sendiri — itu
// sebabnya kop BKU & SPI Juni masih tertulis "Bulan: Mei", dan TUTUP KAS bisa
// jomplang Rp 5,5 miliar tanpa ketahuan. Di sini keduanya mustahil.
//
// Keluarannya .xlsx — exceljs tidak bisa MENULIS format .xls lama (BIFF).
import type ExcelJS from 'exceljs'
import { getBukuKas } from '../realisasi-data'
import { getPaguEfektif, getSerapanPeriode, getSerapanRentang, gulungKeAtas } from '../pagu'
import { getNeracaKas } from '../tutup-kas'
import { getPejabatCetak } from '../pejabat-data'
import type { PejabatSpj } from '../pejabat-data'
import { listGuPeriode } from '../gu-data'
import type { GuPeriode } from '../gu-data'

const NAMA_BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']

const PROVINSI = 'PEMERINTAH  PROVINSI  JAWA  TENGAH'
const INSTANSI = 'RSJD. Dr. AMINO GONDOHUTOMO SEMARANG'
const INSTANSI_PENDEK = 'RSJD. Dr. Amino Gondohutomo Semarang'
const ALAMAT = 'Jl. Brigjen Sudiarto No. 347 Semarang Telp. (024) 6722565'
const RUPIAH = '#,##0'

const LAMPIRAN_BEND12: [string, string][] = [
  [' Lampiran', ': Sistem dan Prosedur Pengelolaan Keuangan Daerah Prov Jateng'],
  [' Nomor', ': 88 Tahun 2018'],
  [' Tanggal', ': 27 Desember 2018'],
  [' Format', ': BEND-12'],
]

/**
 * Tiga angka di lembar `pengantar` dipisah dari kode rekening — bukan diketik
 * ulang. Prefix mengikuti struktur belanja BLUD: 5.1.01 pegawai, 5.2 modal,
 * sisanya barang & jasa.
 *
 * Diuji ke berkas Juni asli dan cocok sampai rupiah terakhir: Pegawai
 * 1.212.588.101 · Barang-Jasa 4.700.086.986 · Modal 449.300.000 = 6.361.975.087.
 */
function kelompokBelanja(kode: string): 'PEGAWAI' | 'BARANG_JASA' | 'MODAL' {
  const k = (kode ?? '').trim()
  if (k.startsWith('5.1.01')) return 'PEGAWAI'
  if (k.startsWith('5.2')) return 'MODAL'
  return 'BARANG_JASA'
}

const hariDari = (iso: string) => Number(iso.slice(8, 10))

function tanggalIndo(iso: string | null): string {
  if (!iso) return ''
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return iso
  return `${Number(m[3])} ${NAMA_BULAN[Number(m[2]) - 1] ?? m[2]} ${m[1]}`
}

interface Konteks {
  tahun: number
  bulan: number
  namaBulan: string
  hariAkhir: number
  buku: Awaited<ReturnType<typeof getBukuKas>>
  baris: Awaited<ReturnType<typeof getPaguEfektif>>
  serapanBulan: Map<string, number>
  serapanLalu: Map<string, number>
  serapanSd: Map<string, number>
  neraca: Awaited<ReturnType<typeof getNeracaKas>>
  pejabat: Record<string, PejabatSpj>
  /** Belanja yang dipertanggungjawabkan — dipakai `pengantar` DAN `SPJ`. */
  belanja: { PEGAWAI: number; BARANG_JASA: number; MODAL: number; total: number }
}

/**
 * Angka yang dipertanggungjawabkan = jumlah ALOKASI ke baris anggaran, bukan
 * jumlah kas keluar. Dua hal itu berbeda: pemindahan bank→kas dan transaksi yang
 * masih diparkir ikut mengurangi kas tapi tidak dipertanggungjawabkan ke mana
 * pun. Di berkas asli `pengantar` dan `SPJ` memuat angka yang sama persis
 * (6.361.975.087) — dan itu memang angka realisasi, bukan arus kas.
 */
function hitungBelanja(
  buku: Awaited<ReturnType<typeof getBukuKas>>,
  baris: Awaited<ReturnType<typeof getPaguEfektif>>,
) {
  const peta = new Map(baris.map((b) => [b.anggaran_key, b]))
  const hasil = { PEGAWAI: 0, BARANG_JASA: 0, MODAL: 0, total: 0 }
  for (const t of buku.rows) {
    for (const a of t.alokasi) {
      const kode = peta.get(a.anggaran_key)?.kode_rekening ?? a.kode_rekening
      hasil[kelompokBelanja(kode)] += a.nilai
      hasil.total += a.nilai
    }
  }
  return hasil
}

/** `GU 1-26 Juni 2026` — persis penamaan berkas asli. */
function namaSheetGu(p: GuPeriode, bulan: number, tahun: number): string {
  return `GU ${hariDari(p.tgl_awal)}-${hariDari(p.tgl_akhir)} ${NAMA_BULAN[bulan - 1]} ${tahun}`.slice(0, 31)
}

export async function buatWorkbookSpj(tahun: number, bulan: number): Promise<ExcelJS.Buffer> {
  const ExcelJSLib = (await import('exceljs')).default

  const [buku, baris, serapan, neraca, pejabat, guPeriode] = await Promise.all([
    getBukuKas(tahun, bulan),
    getPaguEfektif(tahun),
    getSerapanPeriode(tahun, bulan),
    getNeracaKas(tahun, bulan),
    getPejabatCetak(tahun),
    listGuPeriode(tahun, bulan),
  ])

  // Serapan digulung ke induk di sini juga — supaya total lembar Realisasi BP
  // sama persis dengan total BKU. Dua angka itu berbeda = ada yang nyangkut.
  const bulanIni = new Map<string, number>()
  const bulanLalu = new Map<string, number>()
  const sdBulan = new Map<string, number>()
  for (const [k, v] of serapan) {
    bulanIni.set(k, v.bulan_ini)
    bulanLalu.set(k, v.bulan_lalu)
    sdBulan.set(k, v.bulan_ini + v.bulan_lalu)
  }

  const ctx: Konteks = {
    tahun, bulan, buku, baris, neraca, pejabat,
    namaBulan: NAMA_BULAN[bulan - 1],
    hariAkhir: new Date(tahun, bulan, 0).getDate(),
    belanja: hitungBelanja(buku, baris),
    serapanBulan: gulungKeAtas(baris, bulanIni),
    serapanLalu: gulungKeAtas(baris, bulanLalu),
    serapanSd: gulungKeAtas(baris, sdBulan),
  }

  const wb = new ExcelJSLib.Workbook()
  wb.creator = 'PRIMA'
  wb.created = new Date()

  sheetRealisasiBp(wb, ctx, ' Realisasi BP', ctx.serapanBulan)
  sheetBukuKas(wb, ctx, 'BKU', true)
  sheetBukuKas(wb, ctx, 'SPI', false)
  sheetRegister(wb, ctx)

  // Satu lembar per pengajuan GU. Kalau belum ada yang dicatat, jatuh ke satu
  // lembar sebulan penuh — supaya berkasnya tetap lengkap, bukan kehilangan
  // lembar hanya karena rentangnya belum diisi.
  if (guPeriode.length === 0) {
    sheetRealisasiBp(wb, ctx, `GU ${ctx.namaBulan} ${tahun}`.slice(0, 31), ctx.serapanBulan)
  } else {
    for (const p of guPeriode) {
      const mentah = await getSerapanRentang(tahun, p.tgl_awal, p.tgl_akhir)
      sheetRealisasiBp(wb, ctx, namaSheetGu(p, bulan, tahun), gulungKeAtas(baris, mentah))
    }
  }

  sheetPengantar(wb, ctx)
  sheetSpj(wb, ctx)
  sheetTutupKas(wb, ctx)
  sheetSetorBpd(wb, ctx)

  return wb.xlsx.writeBuffer()
}

// ─── Perkakas tata letak ────────────────────────────────────────────────────

function garis(): Partial<ExcelJS.Borders> {
  const s = { style: 'thin' as const, color: { argb: 'FF000000' } }
  return { top: s, left: s, bottom: s, right: s }
}

/** Judul rata tengah yang digabung dari kolom `dari` s/d `sampai`. */
function judul(ws: ExcelJS.Worksheet, teks: string, dari: number, sampai: number, ukuran = 11, tebal = true) {
  const r = ws.addRow([])
  r.getCell(dari).value = teks
  if (sampai > dari) ws.mergeCells(r.number, dari, r.number, sampai)
  r.getCell(dari).font = { bold: tebal, size: ukuran }
  r.getCell(dari).alignment = { horizontal: 'center' }
  return r
}

function taruh(ws: ExcelJS.Worksheet, isi: [number, unknown][], opsi?: { tebal?: boolean; angka?: number[] }) {
  const r = ws.addRow([])
  for (const [kol, nilai] of isi) {
    const c = r.getCell(kol)
    c.value = nilai as ExcelJS.CellValue
    c.font = { size: 10, bold: !!opsi?.tebal }
    if (opsi?.angka?.includes(kol)) {
      c.numFmt = RUPIAH
      c.alignment = { horizontal: 'right' }
    }
  }
  return r
}

function bingkai(r: ExcelJS.Row, dari: number, sampai: number) {
  for (let c = dari; c <= sampai; c++) r.getCell(c).border = garis()
}

/**
 * Blok tanda tangan. Nama & NIP diambil dari `blud_pejabat` — salinan beku
 * (keputusan #29), bukan JOIN ke master PK. Susunannya mengikuti berkas asli:
 * "Mengetahui" di kiri, pelaksana di kanan.
 */
function tandaTangan(
  ws: ExcelJS.Worksheet, ctx: Konteks,
  kiri: { peran: string; prakata?: string } | null,
  kanan: { peran: string; prakata?: string },
  kolKiri: number, kolKanan: number,
) {
  const tglTeks = tanggalIndo(ctx.neraca.tgl_surat)
    || `Semarang, ${ctx.hariAkhir} ${ctx.namaBulan} ${ctx.tahun}`
  ws.addRow([])
  taruh(ws, [[kolKanan, tglTeks]])

  const pKiri = kiri ? ctx.pejabat[kiri.peran] : null
  const pKanan = ctx.pejabat[kanan.peran]

  const isiJab: [number, unknown][] = []
  if (kiri?.prakata) isiJab.push([kolKiri, kiri.prakata])
  if (kanan.prakata) isiJab.push([kolKanan, kanan.prakata])
  if (isiJab.length) taruh(ws, isiJab)

  const isiPeran: [number, unknown][] = []
  if (kiri) isiPeran.push([kolKiri, pKiri?.jabatan_teks || labelPeran(kiri.peran)])
  isiPeran.push([kolKanan, pKanan?.jabatan_teks || labelPeran(kanan.peran)])
  taruh(ws, isiPeran)

  ws.addRow([]); ws.addRow([]); ws.addRow([])

  const isiNama: [number, unknown][] = []
  if (kiri) isiNama.push([kolKiri, pKiri?.nama ?? '_________________'])
  isiNama.push([kolKanan, pKanan?.nama ?? '_________________'])
  const rNama = taruh(ws, isiNama, { tebal: true })
  if (kiri) rNama.getCell(kolKiri).font = { size: 10, bold: true, underline: true }
  rNama.getCell(kolKanan).font = { size: 10, bold: true, underline: true }

  const isiNip: [number, unknown][] = []
  if (kiri && pKiri?.nip) isiNip.push([kolKiri, `NIP. ${pKiri.nip}`])
  if (pKanan?.nip) isiNip.push([kolKanan, `NIP. ${pKanan.nip}`])
  if (isiNip.length) taruh(ws, isiNip)
}

function labelPeran(k: string): string {
  return k === 'DIREKTUR' ? 'Direktur' : k === 'BENDAHARA' ? 'Bendahara Pengeluaran' : 'PPK'
}

// ─── Lembar: Realisasi BP & GU ──────────────────────────────────────────────

/**
 * Realisasi BP & GU — bentuknya SAMA PERSIS di berkas asli: kop identitas + 9
 * kolom berkepala tiga baris. Bedanya cuma isi kolom "BULAN INI":
 *   - Realisasi BP → seluruh bulan   (Juni asli: 6.361.975.087)
 *   - GU           → rentang itu saja (`GU 1-26 Juni 2026`: 5.534.274.012)
 *
 * Kolom "BULAN LALU" tidak ikut dipotong — yang dipertanggungjawabkan lewat GU
 * hanyalah belanja di rentang ini.
 */
function sheetRealisasiBp(
  wb: ExcelJS.Workbook, ctx: Konteks, nama: string, bulanIni: Map<string, number>,
) {
  const ws = wb.addWorksheet(nama)
  ws.columns = [
    { width: 30 }, { width: 34 }, { width: 18 }, { width: 17 },
    { width: 17 }, { width: 17 }, { width: 17 }, { width: 17 }, { width: 10 },
  ]

  judul(ws, 'LAPORAN PERTANGGUNGJAWABAN BENDAHARA PENGELUARAN', 1, 9, 12)
  judul(ws, `BULAN  : ${ctx.namaBulan.toUpperCase()} ${ctx.tahun}`, 1, 9, 11)
  ws.addRow([])

  for (const [label, isi] of [
    ['O P D', `:  ${INSTANSI_PENDEK}`],
    ['Direktur', `:  ${ctx.pejabat.DIREKTUR?.nama ?? ''}`],
    ['Bendahara Pengeluaran', `:  ${ctx.pejabat.BENDAHARA?.nama ?? ''}`],
    ['Tahun Anggaran', `:  ${ctx.tahun}`],
    ['Bulan', `:  ${ctx.namaBulan}`],
  ] as const) {
    taruh(ws, [[1, label], [3, isi]])
  }
  ws.addRow([])

  const b1 = ws.addRow(['KODE REKENING', 'URAIAN', '', 'PAGU', 'REALISASI', 'REALISASI', 'REALISASI', 'SISA', 'PROSEN'])
  const b2 = ws.addRow(['', '', '', 'ANGGARAN', 'BULAN', 'BULAN', ' S/D ', 'ANGGARAN', '( %)'])
  const b3 = ws.addRow(['', '', '', 'BELANJA', 'INI', 'LALU', 'BLN INI', '', ''])
  // Kolom 4-9 SENGAJA tidak digabung vertikal: di berkas asli tiap barisnya
  // teks tersendiri ("PAGU" / "ANGGARAN" / "BELANJA"), bukan satu sel tinggi.
  ws.mergeCells(b1.number, 1, b3.number, 1)
  ws.mergeCells(b1.number, 2, b3.number, 3)
  for (const r of [b1, b2, b3]) {
    for (let c = 1; c <= 9; c++) {
      const cell = r.getCell(c)
      cell.font = { bold: true, size: 10 }
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
      cell.border = garis()
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EEF7' } }
    }
  }

  for (const b of ctx.baris) {
    const ini = bulanIni.get(b.anggaran_key) ?? 0
    const lalu = ctx.serapanLalu.get(b.anggaran_key) ?? 0
    const sd = ini + lalu
    const r = ws.addRow([b.kode_rekening, b.uraian, '', b.pagu, ini, lalu, sd, b.pagu - sd,
      b.pagu > 0 ? Number(((sd / b.pagu) * 100).toFixed(2)) : 0])
    ws.mergeCells(r.number, 2, r.number, 3)
    const lebihPagu = b.pagu - sd < -0.005
    for (let c = 1; c <= 9; c++) {
      const cell = r.getCell(c)
      cell.font = { size: 10, bold: !b.is_leaf, ...(lebihPagu ? { color: { argb: 'FFC00000' } } : {}) }
      cell.border = garis()
      if (c >= 4 && c <= 8) { cell.numFmt = RUPIAH; cell.alignment = { horizontal: 'right' } }
      else if (c === 9) { cell.numFmt = '0.00'; cell.alignment = { horizontal: 'right' } }
      else cell.alignment = { horizontal: 'left', vertical: 'top', wrapText: true }
    }
  }

  tandaTangan(ws, ctx, { peran: 'DIREKTUR', prakata: 'Mengetahui' }, { peran: 'BENDAHARA' }, 2, 7)
}

// ─── Lembar: BKU & SPI ──────────────────────────────────────────────────────

/**
 * BKU dan SPI adalah lembar yang SAMA di berkas asli — judulnya sama-sama
 * "BUKU KAS UMUM ( BLUD )", bedanya SPI tidak memuat kolom Total.
 *
 * Karena keduanya dibangkitkan dari data yang sama di sini, SPI tidak akan
 * pernah lagi melenceng dari BKU. Kop bulannya pun diambil dari periode — di
 * berkas asli kop BKU & SPI Juni masih tertulis "Bulan: Mei".
 */
function sheetBukuKas(wb: ExcelJS.Workbook, ctx: Konteks, nama: string, denganTotal: boolean) {
  const ws = wb.addWorksheet(nama)
  const kolAkhir = denganTotal ? 11 : 10
  ws.columns = [
    { width: 6 }, { width: 6 }, { width: 46 }, { width: 26 },
    { width: 16 }, { width: 16 }, { width: 16 },
    { width: 16 }, { width: 16 }, { width: 16 }, { width: 17 },
  ]

  judul(ws, 'RSJD DR AMINO GONDOHUTOMO PROVINSI JAWA TENGAH', 1, kolAkhir, 12)
  judul(ws, ALAMAT, 1, kolAkhir, 10, false)
  judul(ws, 'BUKU KAS UMUM ( BLUD )', 1, kolAkhir, 12)
  ws.addRow([])
  taruh(ws, [[1, `OPD                                : ${INSTANSI_PENDEK}`]])
  taruh(ws, [[1, `Tahun Anggaran         : ${ctx.tahun}`]])
  taruh(ws, [[1, `Bulan                             : ${ctx.namaBulan}`]])
  ws.addRow([])

  const h1 = ws.addRow(['No', 'Tgl', 'Uraian', 'No.Rekening', 'Kas', '', '', 'Bank Jateng', '', '', 'Total'])
  const h2 = ws.addRow(['Kwt', '', '', '', 'Penerimaan', 'Pengeluaran', 'Saldo', 'Penerimaan', 'Pengeluaran', 'Saldo', ''])
  ws.mergeCells(h1.number, 5, h1.number, 7)
  ws.mergeCells(h1.number, 8, h1.number, 10)
  for (const kol of [2, 3, 4]) ws.mergeCells(h1.number, kol, h2.number, kol)
  if (denganTotal) ws.mergeCells(h1.number, 11, h2.number, 11)
  for (const r of [h1, h2]) {
    for (let c = 1; c <= kolAkhir; c++) {
      const cell = r.getCell(c)
      cell.font = { bold: true, size: 10 }
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
      cell.border = garis()
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EEF7' } }
    }
  }
  // Baris penomoran kolom — bentuk baku berkas asli, dipakai pemeriksa untuk
  // menunjuk kolom mana yang dipersoalkan.
  const hNo = ws.addRow(denganTotal
    ? ['1', '2', '3', '4', '5', '6', '7(5+6)', '8', '9', '10', '10(7+10)']
    : ['1', '2', '3', '4', '5', '6', '7(5+6)', '8', '9', '10'])
  for (let c = 1; c <= kolAkhir; c++) {
    hNo.getCell(c).font = { size: 9, italic: true }
    hNo.getCell(c).alignment = { horizontal: 'center' }
    hNo.getCell(c).border = garis()
  }

  const awal = ctx.buku.saldo_awal_kas + ctx.buku.saldo_awal_bank
  const rAwal = ws.addRow(['', 1, `Saldo 1 ${ctx.namaBulan} ${ctx.tahun}`, '', '', '',
    ctx.buku.saldo_awal_kas, '', '', ctx.buku.saldo_awal_bank, denganTotal ? awal : undefined])
  for (const c of [7, 10, 11]) { rAwal.getCell(c).numFmt = RUPIAH; rAwal.getCell(c).alignment = { horizontal: 'right' } }
  rAwal.font = { size: 10, bold: true }
  bingkai(rAwal, 1, kolAkhir)

  for (const t of ctx.buku.rows) {
    const kode = t.alokasi.map((a) => a.kode_rekening).filter(Boolean).join(' + ')
    const uraian = t.status === 'BELUM_BERREKENING' ? `${t.uraian}  [belum berrekening]` : t.uraian
    const r = ws.addRow([
      t.no_kwt ?? '', hariDari(t.tanggal), uraian, kode,
      t.kas_masuk || '', t.kas_keluar || '', t.saldo_kas,
      t.bank_masuk || '', t.bank_keluar || '', t.saldo_bank,
      denganTotal ? t.saldo_kas + t.saldo_bank : undefined,
    ])
    for (let c = 1; c <= kolAkhir; c++) {
      const cell = r.getCell(c)
      cell.font = { size: 10 }
      cell.border = garis()
      if (c >= 5) { cell.numFmt = RUPIAH; cell.alignment = { horizontal: 'right' } }
      else if (c <= 2) cell.alignment = { horizontal: 'center' }
      else cell.alignment = { horizontal: 'left', vertical: 'top', wrapText: true }
    }
  }

  const jml = ctx.buku.rows.reduce((a, t) => ({
    km: a.km + t.kas_masuk, kk: a.kk + t.kas_keluar,
    bm: a.bm + t.bank_masuk, bk: a.bk + t.bank_keluar,
  }), { km: 0, kk: 0, bm: 0, bk: 0 })
  const rJml = ws.addRow(['', '', 'JUMLAH', '', jml.km, jml.kk, '', jml.bm, jml.bk, '',
    denganTotal ? ctx.neraca.saldo_buku : undefined])
  for (let c = 1; c <= kolAkhir; c++) {
    rJml.getCell(c).font = { size: 10, bold: true }
    rJml.getCell(c).border = garis()
    if (c >= 5) { rJml.getCell(c).numFmt = RUPIAH; rJml.getCell(c).alignment = { horizontal: 'right' } }
  }

  tandaTangan(ws, ctx, { peran: 'PPK', prakata: 'Mengetahui' }, { peran: 'BENDAHARA' }, 3, 8)
}

// ─── Lembar: register ───────────────────────────────────────────────────────

/**
 * register — pengeluaran dikelompokkan per baris anggaran. Bentuk berkas asli:
 * tiap rekening dibuka dengan uraian + "Jumlah Anggaran", diikuti daftar
 * kuitansi (TGL/NO.KWT), lalu ditutup "Jumlah Pengeluaran" + "Saldo Anggaran".
 */
function sheetRegister(wb: ExcelJS.Workbook, ctx: Konteks) {
  const ws = wb.addWorksheet('register')
  ws.columns = [
    { width: 5 }, { width: 6 }, { width: 16 }, { width: 52 },
    { width: 18 }, { width: 18 }, { width: 18 },
  ]

  judul(ws, 'REGISTER PENGESAHAN LAPORAN PERTANGGUNGJAWABAN BLUD', 2, 7, 12)
  judul(ws, `BULAN ${ctx.namaBulan.toUpperCase()} ${ctx.tahun}`, 2, 7, 11)
  judul(ws, 'KEGIATAN PELAYANAN DAN PENDUKUNG  PELAYANAN RS', 2, 7, 11)
  ws.addRow([])

  const h1 = ws.addRow(['', 'NO', 'TGL/NO.KWT', 'URAIAN', 'JUMLAH REALISASI', '', 'SALDO'])
  const h2 = ws.addRow(['', '', '', '', 'BULAN LALU', 'BULAN INI', ''])
  ws.mergeCells(h1.number, 5, h1.number, 6)
  for (const kol of [2, 3, 4, 7]) ws.mergeCells(h1.number, kol, h2.number, kol)
  for (const r of [h1, h2]) {
    for (let c = 2; c <= 7; c++) {
      const cell = r.getCell(c)
      cell.font = { bold: true, size: 10 }
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
      cell.border = garis()
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EEF7' } }
    }
  }
  const hNo = ws.addRow(['', '1', '2', '3', '4', '5', '6(4 + 5)'])
  for (let c = 2; c <= 7; c++) {
    hNo.getCell(c).font = { size: 9, italic: true }
    hNo.getCell(c).alignment = { horizontal: 'center' }
    hNo.getCell(c).border = garis()
  }

  const petaBaris = new Map(ctx.baris.map((b) => [b.anggaran_key, b]))
  const perKey = new Map<string, { kode: string; uraian: string; tx: { tanggal: string; no: number | null; uraian: string; nilai: number }[] }>()
  for (const t of ctx.buku.rows) {
    for (const a of t.alokasi) {
      const b = petaBaris.get(a.anggaran_key)
      if (!perKey.has(a.anggaran_key)) {
        perKey.set(a.anggaran_key, { kode: b?.kode_rekening ?? a.kode_rekening, uraian: b?.uraian ?? a.uraian, tx: [] })
      }
      perKey.get(a.anggaran_key)!.tx.push({ tanggal: t.tanggal, no: t.no_kwt, uraian: t.uraian, nilai: a.nilai })
    }
  }

  const urut = [...perKey.entries()].sort((a, b) => a[1].kode.localeCompare(b[1].kode))
  for (const [key, grup] of urut) {
    const pagu = petaBaris.get(key)?.pagu ?? 0
    const lalu = ctx.serapanLalu.get(key) ?? 0

    ws.addRow([])
    taruh(ws, [[4, grup.uraian]], { tebal: true })
    taruh(ws, [[4, ` Rek: ${grup.kode}`]])
    taruh(ws, [[4, 'Jumlah Anggaran'], [7, pagu]], { tebal: true, angka: [7] })
    taruh(ws, [[4, grup.uraian], [5, lalu], [7, pagu - lalu]], { angka: [5, 7] })

    let ini = 0
    grup.tx.forEach((t, i) => {
      ini += t.nilai
      const r = taruh(ws, [
        [2, i + 1],
        [3, `${hariDari(t.tanggal)}-${ctx.bulan}-${ctx.tahun}/${t.no ?? '-'}`],
        [4, t.uraian],
        [6, t.nilai],
      ], { angka: [6] })
      bingkai(r, 2, 7)
    })

    taruh(ws, [[4, 'Jumlah Pengeluaran'], [5, lalu], [6, ini]], { tebal: true, angka: [5, 6] })
    taruh(ws, [[4, 'Saldo Anggaran'], [7, pagu - lalu - ini]], { tebal: true, angka: [7] })
  }

  if (urut.length === 0) taruh(ws, [[4, 'Belum ada pengeluaran berrekening pada bulan ini.']])

  tandaTangan(ws, ctx, { peran: 'PPK', prakata: 'Mengetahui' }, { peran: 'BENDAHARA' }, 2, 6)
}

// ─── Lembar: pengantar ──────────────────────────────────────────────────────

/** pengantar — surat pengantar ke PPK-BLUD + rincian 3 kelompok belanja. */
function sheetPengantar(wb: ExcelJS.Workbook, ctx: Konteks) {
  const ws = wb.addWorksheet('pengantar')
  ws.columns = [{ width: 4 }, { width: 30 }, { width: 40 }, { width: 6 }, { width: 20 }, { width: 22 }, { width: 26 }]

  ws.addRow([])
  judul(ws, PROVINSI, 2, 7, 12)
  judul(ws, INSTANSI, 2, 7, 12)
  judul(ws, ALAMAT, 2, 7, 9, false)
  ws.addRow([]); ws.addRow([])

  taruh(ws, [[2, 'Kepada Yth.']])
  taruh(ws, [[2, 'Pejabat Penatausahaan Keuangan BLUD (PPK-BLUD)']])
  taruh(ws, [[2, INSTANSI_PENDEK]])
  taruh(ws, [[2, 'di Semarang']])
  ws.addRow([]); ws.addRow([])

  judul(ws, 'SURAT  PENGANTAR', 2, 7, 12)
  // Berkas asli mencetak "No.  900.1.6/" dengan nomornya ditulis tangan. Kalau
  // nomor surat sudah diisi di Tutup Kas, pakai apa adanya — jangan ditempeli
  // awalan lagi, nanti jadi "900.1.6/900.1.6/1234".
  judul(ws, ctx.neraca.no_surat ? `No.  ${ctx.neraca.no_surat}` : 'No.  900.1.6/', 2, 7, 11, false)
  ws.addRow([])

  const h = ws.addRow(['', 'No', 'Jenis Surat', '', '', 'Banyaknya', 'Keterangan'])
  ws.mergeCells(h.number, 3, h.number, 5)
  for (let c = 2; c <= 7; c++) {
    h.getCell(c).font = { bold: true, size: 10 }
    h.getCell(c).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
    h.getCell(c).border = garis()
    h.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EEF7' } }
  }
  ws.addRow([])

  const total = ctx.belanja
  const jumlah = total.total

  taruh(ws, [[2, '1.'], [3, 'Surat Pertanggungjawaban Keuangan (SPJ)'], [6, '1 (satu) bendel'], [7, ' Dikirim dengan hormat']])
  taruh(ws, [[3, 'Kegiatan BLUD'], [7, ' untuk diketahui dan']])
  taruh(ws, [[7, ' dipergunakan sebagaimana']])
  taruh(ws, [[3, `Bulan      : ${ctx.namaBulan} ${ctx.tahun}`], [7, ' mestinya.']])
  taruh(ws, [[3, 'sebesar : Rp. '], [4, jumlah]], { angka: [4] })
  ws.addRow([]); ws.addRow([])

  taruh(ws, [[3, 'Terdiri']])
  taruh(ws, [[3, '1. Belanja Pegawai BLUD'], [4, 'Rp.'], [5, total.PEGAWAI]], { angka: [5] })
  taruh(ws, [[3, '2. Belanja Barang dan Jasa'], [4, 'Rp.'], [5, total.BARANG_JASA]], { angka: [5] })
  taruh(ws, [[3, '3. Belanja Modal BLUD'], [4, 'Rp.'], [5, total.MODAL]], { angka: [5] })
  taruh(ws, [[3, 'Jumlah'], [4, 'Rp.'], [5, jumlah]], { tebal: true, angka: [5] })

  ws.addRow([]); ws.addRow([])
  taruh(ws, [[2, ' Tembusan disampaikan kepada yth.']])
  taruh(ws, [[2, ' 1. Kepala Badan Pengelolaan Keuangan & Aset Daerah Prov. Jateng']])
  taruh(ws, [[2, ' 2. Kepala Inspektorat Prov. Jateng']])
  taruh(ws, [[2, ' 3. Kantor Kas Daerah Prov. Jateng']])
  taruh(ws, [[2, ' 4. Pertinggal']])

  tandaTangan(ws, ctx, null, { peran: 'BENDAHARA', prakata: `Bendahara Pengeluaran BLUD\n${INSTANSI_PENDEK}` }, 2, 6)
  ws.addRow([])
  taruh(ws, [[2, ' Diterima tanggal']])
  taruh(ws, [[2, ' Yang menerima']])
}

// ─── Lembar: SPJ ────────────────────────────────────────────────────────────

/** SPJ — register pengesahan, format baku BEND-12. Satu baris, satu angka. */
function sheetSpj(wb: ExcelJS.Workbook, ctx: Konteks) {
  const ws = wb.addWorksheet('SPJ')
  ws.columns = [{ width: 4 }, { width: 6 }, { width: 14 }, { width: 44 }, { width: 20 }, { width: 30 }]

  ws.addRow([])
  for (const [label, isi] of LAMPIRAN_BEND12) taruh(ws, [[4, label], [5, isi]])
  ws.addRow([])

  judul(ws, PROVINSI, 2, 6, 12)
  judul(ws, INSTANSI, 2, 6, 12)
  judul(ws, 'REGISTER PENGESAHAN LAPORAN PERTANGGUNG JAWABAN', 2, 6, 12)
  judul(ws, 'PENGELUARAN  (SPJ) BLUD', 2, 6, 12)
  ws.addRow([])

  const h1 = ws.addRow(['', 'No', 'Tanggal', 'Uraian', 'Jumlah SPJ', 'Keterangan'])
  const h2 = ws.addRow(['', '', '', '', '(Rp.)', ''])
  for (const kol of [2, 3, 4, 6]) ws.mergeCells(h1.number, kol, h2.number, kol)
  for (const r of [h1, h2]) {
    for (let c = 2; c <= 6; c++) {
      const cell = r.getCell(c)
      cell.font = { bold: true, size: 10 }
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
      cell.border = garis()
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EEF7' } }
    }
  }
  const hNo = ws.addRow(['', '1', '2', '3', '4', '5'])
  for (let c = 2; c <= 6; c++) {
    hNo.getCell(c).font = { size: 9, italic: true }
    hNo.getCell(c).alignment = { horizontal: 'center' }
    hNo.getCell(c).border = garis()
  }

  // Angka yang sama persis dengan `pengantar` — di berkas asli keduanya
  // 6.361.975.087. Kalau di sini dipakai arus kas keluar, SPJ dan pengantar
  // akan berbeda dan itu langsung jadi temuan.
  const tgl = ctx.neraca.tgl_surat ?? `${ctx.tahun}-${String(ctx.bulan).padStart(2, '0')}-${String(ctx.hariAkhir).padStart(2, '0')}`

  const r1 = taruh(ws, [[2, '1.'], [3, tanggalIndo(tgl)], [4, ' Surat Pertanggungjawaban Keuangan'], [5, ctx.belanja.total], [6, ' Dikirim dengan hormat']], { angka: [5] })
  bingkai(r1, 2, 6)
  bingkai(taruh(ws, [[4, ' (SPJ) Pengeluaran BLUD'], [6, ' Untuk diketahui dan']]), 2, 6)
  bingkai(taruh(ws, [[4, ` bulan ${ctx.namaBulan} ${ctx.tahun}`], [6, ' dipergunakan sebagaimana']]), 2, 6)
  bingkai(taruh(ws, [[6, ' mestinya.']]), 2, 6)

  tandaTangan(ws, ctx, { peran: 'DIREKTUR', prakata: 'Mengetahui' }, { peran: 'PPK' }, 4, 6)
}

// ─── Lembar: TUTUP KAS ──────────────────────────────────────────────────────

/**
 * TUTUP KAS — Laporan Penutupan Kas Bulanan, format baku BEND-12 dengan
 * penomoran A.1–A.4 dan B.1–B.3 persis berkas asli.
 *
 * Bedanya dengan berkas asli bukan bentuknya, tapi jaminannya: A.4 dan B.3 di
 * sini PASTI sama, sebab bulan yang tidak seimbang tidak bisa ditutup (§4.7).
 * Di berkas Juni asli A.4 = −650.471.561 sementara B.3 = 4.883.802.451, dan
 * judulnya masih tertulis "31 Mei 2026" — kop di sini diambil dari periode,
 * jadi salah bulan tidak bisa terjadi.
 */
function sheetTutupKas(wb: ExcelJS.Workbook, ctx: Konteks) {
  const ws = wb.addWorksheet('TUTUP KAS')
  ws.columns = [{ width: 4 }, { width: 6 }, { width: 8 }, { width: 44 }, { width: 22 }, { width: 24 }, { width: 22 }]
  const n = ctx.neraca
  const akhirTeks = `${ctx.hariAkhir} ${ctx.namaBulan} ${ctx.tahun}`

  ws.addRow([])
  for (const [label, isi] of LAMPIRAN_BEND12) taruh(ws, [[5, label], [6, isi]])
  ws.addRow([]); ws.addRow([])

  judul(ws, PROVINSI, 2, 7, 12)
  judul(ws, INSTANSI, 2, 7, 12)
  judul(ws, 'LAPORAN PENUTUPAN KAS BULANAN', 2, 7, 12)
  judul(ws, `BULAN ${ctx.namaBulan.toUpperCase()} ${ctx.tahun}`, 2, 7, 11)
  ws.addRow([])

  taruh(ws, [[2, 'Kepada Yth.']])
  taruh(ws, [[2, 'Pimpinan BLUD']])
  taruh(ws, [[2, INSTANSI_PENDEK]])
  taruh(ws, [[2, 'di Semarang']])
  ws.addRow([])
  taruh(ws, [[2, 'Dengan memperhatikan Peraturan Gubernur Jawa Tengah Nomor 88 Tahun 2018, bersama ini kami laporkan penutupan kas bulanan sebagai berikut:']])
  ws.addRow([])

  taruh(ws, [[2, 'A.'], [3, 'Kas Bendahara Pengeluaran BLUD']], { tebal: true })
  taruh(ws, [[3, 'A.1'], [4, `Saldo Awal 1 ${ctx.namaBulan} ${ctx.tahun}`], [7, n.saldo_awal_kas + n.saldo_awal_bank]], { angka: [7] })
  // Pemindahan bank↔kas sudah dibersihkan di getNeracaKas — "Kas Masuk" di sini
  // hanya uang yang benar-benar datang dari luar.
  taruh(ws, [[3, 'A.2'], [4, 'Kas Masuk'], [7, n.masuk_luar]], { angka: [7] })
  taruh(ws, [[3, 'A.3'], [4, 'Kas Keluar'], [7, n.keluar_luar]], { angka: [7] })
  taruh(ws, [[3, 'A.4'], [4, `Saldo akhir tanggal ${akhirTeks}`], [7, n.saldo_buku]], { tebal: true, angka: [7] })
  ws.addRow([])
  taruh(ws, [[3, `Saldo akhir tanggal ${akhirTeks}`]])
  taruh(ws, [[3, '1'], [4, 'Kas tunai'], [7, n.kas_fisik ?? 0]], { angka: [7] })
  taruh(ws, [[3, '2'], [4, 'Saldo Bank'], [7, n.bank_koran ?? 0]], { angka: [7] })
  ws.addRow([])

  taruh(ws, [[2, 'B.'], [3, 'Rekapitulasi posisi Kas di Bendahara Pengeluaran BLUD']], { tebal: true })
  taruh(ws, [[3, 'B.1'], [4, 'Saldo kas tunai'], [7, n.kas_fisik ?? 0]], { angka: [7] })
  taruh(ws, [[3, 'B.2'], [4, `Saldo di Bank Jateng s.d ${akhirTeks}`], [7, n.bank_koran ?? 0]], { angka: [7] })
  taruh(ws, [[3, 'B.3'], [4, `Saldo Total s.d ${akhirTeks}`], [7, n.saldo_nyata ?? 0]], { tebal: true, angka: [7] })

  // Selisih hanya dicetak kalau bulannya BELUM ditutup. Untuk bulan yang sudah
  // ditutup ia pasti nol — mencetak baris "Selisih 0" di dokumen resmi justru
  // memancing pertanyaan yang tidak perlu.
  if (!n.seimbang) {
    ws.addRow([])
    const r = taruh(ws, [[4, 'SELISIH (B.3 − A.4) — bulan ini BELUM ditutup'], [7, (n.saldo_nyata ?? 0) - n.saldo_buku]], { tebal: true, angka: [7] })
    for (const c of [4, 7]) r.getCell(c).font = { size: 10, bold: true, color: { argb: 'FFC00000' } }
  }

  tandaTangan(ws, ctx, { peran: 'DIREKTUR', prakata: 'Mengetahui' }, { peran: 'BENDAHARA' }, 4, 6)
}

// ─── Lembar: setor BPD ──────────────────────────────────────────────────────

/**
 * setor BPD — daftar setoran/transfer ke bank, dikelompokkan per tanggal setor
 * seperti berkas asli ("BUKTI SETOR KE BANK BPD TGL. …").
 *
 * Di berkas asli lembar ini ditulis tangan dan angkanya berdesimal pecahan
 * (hasil hitung di luar sistem). Di sini isinya diambil dari transaksi bank
 * yang sudah tercatat — jadi jumlahnya selalu cocok dengan BKU.
 */
function sheetSetorBpd(wb: ExcelJS.Workbook, ctx: Konteks) {
  const ws = wb.addWorksheet('setor BPD')
  ws.columns = [{ width: 4 }, { width: 6 }, { width: 52 }, { width: 22 }]

  const setoran = ctx.buku.rows.filter((t) => t.jenis === 'SETOR_BANK' || t.bank_masuk > 0)
  const perTanggal = new Map<string, typeof setoran>()
  for (const t of setoran) {
    if (!perTanggal.has(t.tanggal)) perTanggal.set(t.tanggal, [])
    perTanggal.get(t.tanggal)!.push(t)
  }

  if (perTanggal.size === 0) {
    ws.addRow([])
    judul(ws, `BUKTI SETOR KE BANK BPD — ${ctx.namaBulan} ${ctx.tahun}`, 2, 4, 12)
    ws.addRow([])
    taruh(ws, [[3, 'Tidak ada setoran ke bank pada bulan ini.']])
    return
  }

  for (const [tgl, daftar] of [...perTanggal.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    ws.addRow([])
    judul(ws, `BUKTI SETOR KE BANK BPD TGL. ${hariDari(tgl)}-${ctx.bulan}-${ctx.tahun}`, 2, 4, 12)
    ws.addRow([])

    const h = ws.addRow(['', 'NO', 'URAIAN', 'JUMLAH'])
    for (let c = 2; c <= 4; c++) {
      h.getCell(c).font = { bold: true, size: 10 }
      h.getCell(c).alignment = { horizontal: 'center' }
      h.getCell(c).border = garis()
      h.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EEF7' } }
    }

    let total = 0
    daftar.forEach((t, i) => {
      const nilai = t.bank_masuk || t.kas_keluar
      total += nilai
      bingkai(taruh(ws, [[2, i + 1], [3, t.uraian], [4, nilai]], { angka: [4] }), 2, 4)
    })
    bingkai(taruh(ws, [[3, 'Total'], [4, total]], { tebal: true, angka: [4] }), 2, 4)
  }

  tandaTangan(ws, ctx, null, { peran: 'BENDAHARA' }, 2, 3)
}
