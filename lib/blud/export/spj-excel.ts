// lib/blud/export/spj-excel.ts — satu berkas .xlsx berisi seluruh lembar SPJ bulanan.
// Konsep: docs/CONCEPT-blud-realisasi.md §3.2 (pemetaan sheet), §4.7, Fase 5.
//
// Semua lembar di sini TURUNAN dari tabel transaksi yang sama. Di berkas Excel
// lama tiap lembar diketik/di-copy sendiri-sendiri — itu sebabnya SPI bisa
// berbeda dari BKU dan TUTUP KAS bisa jomplang Rp 5,5 miliar tanpa ketahuan.
// Selama angkanya diambil dari satu sumber, ketidakcocokan itu mustahil.
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

const NAMA_INSTANSI = 'RSJD Dr. AMINO GONDOHUTOMO PROVINSI JAWA TENGAH'
const NAMA_INSTANSI_PENDEK = 'RSJD. Dr. Amino Gondohutomo Semarang'
const RUPIAH = '#,##0'

/**
 * Tiga angka di lembar `pengantar` dipisah dari kode rekening — bukan diketik
 * ulang. Prefix mengikuti struktur belanja BLUD: 5.1.01 pegawai, 5.1.02 barang &
 * jasa, 5.2 modal. Yang tidak cocok masuk Barang & Jasa (kelompok terbesar) dan
 * tetap ikut terhitung, supaya jumlah pengantar selalu = jumlah BKU.
 */
function kelompokBelanja(kode: string): 'PEGAWAI' | 'BARANG_JASA' | 'MODAL' {
  const k = (kode ?? '').trim()
  if (k.startsWith('5.1.01')) return 'PEGAWAI'
  if (k.startsWith('5.2')) return 'MODAL'
  return 'BARANG_JASA'
}

function tanggalIndo(iso: string | null): string {
  if (!iso) return ''
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return iso
  return `${Number(m[3])} ${NAMA_BULAN[Number(m[2]) - 1] ?? m[2]} ${m[1]}`
}

interface Konteks {
  tahun: number
  bulan: number
  buku: Awaited<ReturnType<typeof getBukuKas>>
  baris: Awaited<ReturnType<typeof getPaguEfektif>>
  serapanBulan: Map<string, number>
  serapanLalu: Map<string, number>
  serapanSd: Map<string, number>
  neraca: Awaited<ReturnType<typeof getNeracaKas>>
  pejabat: Record<string, PejabatSpj>
}

/** `GU 1-26 Juni 2026` — persis penamaan berkas asli. */
function namaSheetGu(p: GuPeriode, bulan: number, tahun: number): string {
  const hari = (iso: string) => String(Number(iso.slice(8, 10)))
  const nama = `GU ${hari(p.tgl_awal)}-${hari(p.tgl_akhir)} ${NAMA_BULAN[bulan - 1]} ${tahun}`
  return nama.slice(0, 31)  // batas keras nama sheet Excel
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
    serapanBulan: gulungKeAtas(baris, bulanIni),
    serapanLalu: gulungKeAtas(baris, bulanLalu),
    serapanSd: gulungKeAtas(baris, sdBulan),
  }

  const wb = new ExcelJSLib.Workbook()
  wb.creator = 'PRIMA'
  wb.created = new Date()

  sheetRealisasiBp(wb, ctx, ' Realisasi BP', ctx.serapanBulan)
  sheetBku(wb, ctx)
  sheetSpi(wb, ctx)
  sheetRegister(wb, ctx)

  // Satu lembar per pengajuan GU. Kalau belum ada yang dicatat, jatuh ke satu
  // lembar sebulan penuh — supaya berkasnya tetap lengkap, bukan kehilangan
  // lembar hanya karena rentangnya belum diisi.
  if (guPeriode.length === 0) {
    sheetRealisasiBp(wb, ctx, `GU ${NAMA_BULAN[bulan - 1]} ${tahun}`.slice(0, 31), ctx.serapanBulan)
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

function kop(ws: ExcelJS.Worksheet, lebarKolom: number, judul: string[], ctx: Konteks) {
  for (const teks of [NAMA_INSTANSI, ...judul, `BULAN ${NAMA_BULAN[ctx.bulan - 1].toUpperCase()} ${ctx.tahun}`]) {
    const r = ws.addRow([teks])
    ws.mergeCells(r.number, 1, r.number, lebarKolom)
    r.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' }
    r.getCell(1).font = { bold: true, size: teks === NAMA_INSTANSI ? 12 : 11 }
  }
  ws.addRow([])
}

function barisJudulKolom(ws: ExcelJS.Worksheet, kolom: string[]) {
  const r = ws.addRow(kolom)
  r.eachCell((c) => {
    c.font = { bold: true, size: 10 }
    c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
    c.border = garis()
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EEF7' } }
  })
  r.height = 28
  return r
}

function garis(): Partial<ExcelJS.Borders> {
  const s = { style: 'thin' as const, color: { argb: 'FF9AA5B1' } }
  return { top: s, left: s, bottom: s, right: s }
}

function isiBaris(ws: ExcelJS.Worksheet, nilai: unknown[], opsi: { angka: number[]; tebal?: boolean }) {
  const r = ws.addRow(nilai)
  r.eachCell((c, i) => {
    c.font = { size: 10, bold: !!opsi.tebal }
    c.border = garis()
    if (opsi.angka.includes(i)) {
      c.numFmt = RUPIAH
      c.alignment = { horizontal: 'right' }
    } else {
      c.alignment = { horizontal: 'left', vertical: 'top', wrapText: true }
    }
  })
  return r
}

/**
 * Blok tanda tangan. Nama & NIP diambil dari `blud_pejabat` — salinan beku
 * (keputusan #29), bukan JOIN ke master PK.
 */
function tandaTangan(ws: ExcelJS.Worksheet, ctx: Konteks, kiri: string | null, kanan: string, kolomAkhir: number) {
  const tglTeks = tanggalIndo(ctx.neraca.tgl_surat) || `Semarang, ${NAMA_BULAN[ctx.bulan - 1]} ${ctx.tahun}`
  ws.addRow([])
  const kolomKiri = 1
  const kolomKanan = Math.max(2, kolomAkhir - 2)

  const rTgl = ws.addRow([])
  rTgl.getCell(kolomKanan).value = tglTeks
  rTgl.getCell(kolomKanan).font = { size: 10 }

  const rJab = ws.addRow([])
  if (kiri) {
    const p = ctx.pejabat[kiri]
    rJab.getCell(kolomKiri).value = p?.jabatan_teks || labelPeran(kiri)
    rJab.getCell(kolomKiri).font = { size: 10 }
  }
  const pk = ctx.pejabat[kanan]
  rJab.getCell(kolomKanan).value = pk?.jabatan_teks || labelPeran(kanan)
  rJab.getCell(kolomKanan).font = { size: 10 }

  ws.addRow([]); ws.addRow([]); ws.addRow([])

  const rNama = ws.addRow([])
  if (kiri) {
    rNama.getCell(kolomKiri).value = ctx.pejabat[kiri]?.nama ?? '_________________'
    rNama.getCell(kolomKiri).font = { size: 10, bold: true, underline: true }
  }
  rNama.getCell(kolomKanan).value = pk?.nama ?? '_________________'
  rNama.getCell(kolomKanan).font = { size: 10, bold: true, underline: true }

  const rNip = ws.addRow([])
  if (kiri && ctx.pejabat[kiri]?.nip) {
    rNip.getCell(kolomKiri).value = `NIP. ${ctx.pejabat[kiri]!.nip}`
    rNip.getCell(kolomKiri).font = { size: 10 }
  }
  if (pk?.nip) {
    rNip.getCell(kolomKanan).value = `NIP. ${pk.nip}`
    rNip.getCell(kolomKanan).font = { size: 10 }
  }
}

function labelPeran(k: string): string {
  return k === 'DIREKTUR' ? 'Direktur' : k === 'BENDAHARA' ? 'Bendahara Pengeluaran' : 'PPK-BLUD'
}

// ─── Lembar ─────────────────────────────────────────────────────────────────

/** BKU — seluruh transaksi bulan itu + saldo berjalan. Sumber semua lembar lain. */
function sheetBku(wb: ExcelJS.Workbook, ctx: Konteks) {
  const ws = wb.addWorksheet('BKU')
  ws.columns = [
    { width: 5 }, { width: 12 }, { width: 10 }, { width: 46 },
    { width: 16 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 18 },
  ]
  kop(ws, 9, ['BUKU KAS UMUM'], ctx)
  barisJudulKolom(ws, ['No', 'Tanggal', 'No. Kwt', 'Uraian', 'Kas Masuk', 'Kas Keluar', 'Bank Masuk', 'Bank Keluar', 'Saldo'])

  isiBaris(ws, ['', '', '', 'Saldo awal bulan', '', '', '', '', ctx.buku.saldo_awal_kas + ctx.buku.saldo_awal_bank], { angka: [9], tebal: true })

  ctx.buku.rows.forEach((t, i) => {
    isiBaris(ws, [
      i + 1, t.tanggal, t.no_kwt ?? '',
      t.status === 'BELUM_BERREKENING' ? `${t.uraian}  [belum berrekening]` : t.uraian,
      t.kas_masuk || '', t.kas_keluar || '', t.bank_masuk || '', t.bank_keluar || '',
      t.saldo_kas + t.saldo_bank,
    ], { angka: [5, 6, 7, 8, 9] })
  })

  const jml = ctx.buku.rows.reduce((a, t) => ({
    km: a.km + t.kas_masuk, kk: a.kk + t.kas_keluar,
    bm: a.bm + t.bank_masuk, bk: a.bk + t.bank_keluar,
  }), { km: 0, kk: 0, bm: 0, bk: 0 })
  isiBaris(ws, ['', '', '', 'JUMLAH', jml.km, jml.kk, jml.bm, jml.bk, ctx.neraca.saldo_buku], { angka: [5, 6, 7, 8, 9], tebal: true })

  tandaTangan(ws, ctx, 'PPK', 'BENDAHARA', 9)
}

/**
 * SPI — TAMPILAN dari data BKU yang sama, tanpa kolom saldo berjalan. Karena
 * bukan salinan manual, ia tidak akan pernah melenceng dari BKU lagi.
 */
function sheetSpi(wb: ExcelJS.Workbook, ctx: Konteks) {
  const ws = wb.addWorksheet('SPI')
  ws.columns = [{ width: 5 }, { width: 12 }, { width: 10 }, { width: 52 }, { width: 18 }, { width: 18 }]
  kop(ws, 6, ['SURAT PERTANGGUNGJAWABAN INTERN'], ctx)
  barisJudulKolom(ws, ['No', 'Tanggal', 'No. Kwt', 'Uraian', 'Penerimaan', 'Pengeluaran'])

  ctx.buku.rows.forEach((t, i) => {
    isiBaris(ws, [
      i + 1, t.tanggal, t.no_kwt ?? '', t.uraian,
      (t.kas_masuk + t.bank_masuk) || '', (t.kas_keluar + t.bank_keluar) || '',
    ], { angka: [5, 6] })
  })

  const masuk = ctx.buku.rows.reduce((a, t) => a + t.kas_masuk + t.bank_masuk, 0)
  const keluar = ctx.buku.rows.reduce((a, t) => a + t.kas_keluar + t.bank_keluar, 0)
  isiBaris(ws, ['', '', '', 'JUMLAH', masuk, keluar], { angka: [5, 6], tebal: true })

  tandaTangan(ws, ctx, 'PPK', 'BENDAHARA', 6)
}

/** register — transaksi dikelompokkan per baris anggaran + pagu & sisa. */
function sheetRegister(wb: ExcelJS.Workbook, ctx: Konteks) {
  const ws = wb.addWorksheet('register')
  ws.columns = [{ width: 5 }, { width: 12 }, { width: 10 }, { width: 46 }, { width: 18 }, { width: 18 }, { width: 18 }]
  kop(ws, 7, ['REGISTER PENGELUARAN PER REKENING'], ctx)

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
    const sd = ctx.serapanSd.get(key) ?? 0
    ws.addRow([])
    const rj = isiBaris(ws, [`${grup.kode}`, '', '', grup.uraian, pagu, sd, pagu - sd], { angka: [5, 6, 7], tebal: true })
    rj.getCell(5).numFmt = RUPIAH
    barisJudulKolom(ws, ['No', 'Tanggal', 'No. Kwt', 'Uraian', 'Pengeluaran', '', ''])
    let jalan = 0
    grup.tx.forEach((t, i) => {
      jalan += t.nilai
      isiBaris(ws, [i + 1, t.tanggal, t.no ?? '', t.uraian, t.nilai, '', jalan], { angka: [5, 7] })
    })
    isiBaris(ws, ['', '', '', 'Jumlah bulan ini', jalan, '', ''], { angka: [5], tebal: true })
  }

  if (urut.length === 0) ws.addRow(['Belum ada pengeluaran berrekening pada bulan ini.'])
  tandaTangan(ws, ctx, 'PPK', 'BENDAHARA', 7)
}

/**
 * Realisasi BP & GU — bentuknya SAMA PERSIS, mengikuti berkas Juni asli: kop
 * identitas + 9 kolom berkepala tiga baris (Kode · Uraian · Pagu · Realisasi
 * Bulan Ini / Bulan Lalu / s/d Bln Ini · Sisa · Prosen).
 *
 * Bedanya cuma isi kolom "BULAN INI":
 *   - Realisasi BP → seluruh bulan
 *   - GU           → hanya rentang tanggal pengajuan itu
 * Di berkas asli bedanya terlihat jelas: Realisasi BP 6.361.975.087 vs
 * `GU 1-26 Juni 2026` 5.534.274.012 pada baris BELANJA DAERAH.
 *
 * Kolom "BULAN LALU" tetap bulan-bulan sebelumnya — tidak ikut dipotong, sebab
 * yang dipertanggungjawabkan lewat GU hanyalah belanja di rentang ini.
 */
function sheetRealisasiBp(
  wb: ExcelJS.Workbook, ctx: Konteks, nama: string, bulanIni: Map<string, number>,
) {
  const ws = wb.addWorksheet(nama)
  ws.columns = [
    { width: 30 }, { width: 34 }, { width: 18 }, { width: 17 },
    { width: 17 }, { width: 17 }, { width: 17 }, { width: 17 }, { width: 10 },
  ]

  const rJudul = ws.addRow(['LAPORAN PERTANGGUNGJAWABAN BENDAHARA PENGELUARAN'])
  ws.mergeCells(rJudul.number, 1, rJudul.number, 9)
  rJudul.getCell(1).font = { bold: true, size: 12 }
  rJudul.getCell(1).alignment = { horizontal: 'center' }
  const rBulan = ws.addRow([`BULAN  : ${NAMA_BULAN[ctx.bulan - 1].toUpperCase()} ${ctx.tahun}`])
  ws.mergeCells(rBulan.number, 1, rBulan.number, 9)
  rBulan.getCell(1).font = { bold: true, size: 11 }
  rBulan.getCell(1).alignment = { horizontal: 'center' }
  ws.addRow([])

  for (const [label, isi] of [
    ['O P D', `:  ${NAMA_INSTANSI_PENDEK}`],
    ['Direktur', `:  ${ctx.pejabat.DIREKTUR?.nama ?? ''}`],
    ['Bendahara Pengeluaran', `:  ${ctx.pejabat.BENDAHARA?.nama ?? ''}`],
    ['Tahun Anggaran', `:  ${ctx.tahun}`],
    ['Bulan', `:  ${NAMA_BULAN[ctx.bulan - 1]}`],
  ] as const) {
    const r = ws.addRow([label, '', isi])
    r.getCell(1).font = { size: 10 }
    r.getCell(3).font = { size: 10 }
  }
  ws.addRow([])

  // Kepala 3 baris bertumpuk — bentuk baku berkas asli, jangan diratakan jadi
  // satu baris: yang memeriksa di Keuangan membaca bentuk ini, bukan isinya saja.
  const b1 = ws.addRow(['KODE REKENING', 'URAIAN', '', 'PAGU', 'REALISASI', 'REALISASI', 'REALISASI', 'SISA', 'PROSEN'])
  const b2 = ws.addRow(['', '', '', 'ANGGARAN', 'BULAN', 'BULAN', ' S/D ', 'ANGGARAN', '( %)'])
  const b3 = ws.addRow(['', '', '', 'BELANJA', 'INI', 'LALU', 'BLN INI', '', ''])
  // Kolom 4-9 SENGAJA tidak digabung vertikal: di berkas asli tiap barisnya
  // teks tersendiri ("PAGU" / "ANGGARAN" / "BELANJA"), bukan satu sel tinggi.
  // Menggabungnya akan membuang dua baris label bawahnya.
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
    for (let c = 1; c <= 9; c++) {
      const cell = r.getCell(c)
      cell.font = { size: 10, bold: !b.is_leaf }
      cell.border = garis()
      if (c >= 4 && c <= 8) { cell.numFmt = RUPIAH; cell.alignment = { horizontal: 'right' } }
      else if (c === 9) { cell.numFmt = '0.00'; cell.alignment = { horizontal: 'right' } }
      else cell.alignment = { horizontal: 'left', vertical: 'top', wrapText: true }
    }
    // Lebih pagu ditandai di berkas juga — bukan cuma di layar. Yang memeriksa
    // di Keuangan/BPKAD membaca lembar ini, bukan aplikasinya.
    if (b.pagu - sd < -0.005) {
      for (let c = 1; c <= 9; c++) {
        const cell = r.getCell(c)
        cell.font = { ...(cell.font ?? {}), color: { argb: 'FFC00000' } }
      }
    }
  }

  tandaTangan(ws, ctx, 'DIREKTUR', 'BENDAHARA', 9)
}

/** pengantar — 3 angka besar: Pegawai · Barang-Jasa · Modal. */
function sheetPengantar(wb: ExcelJS.Workbook, ctx: Konteks) {
  const ws = wb.addWorksheet('pengantar')
  ws.columns = [{ width: 6 }, { width: 56 }, { width: 22 }]
  kop(ws, 3, ['SURAT PENGANTAR', 'PERTANGGUNGJAWABAN BELANJA BLUD'], ctx)
  barisJudulKolom(ws, ['No', 'Jenis Belanja', 'Jumlah'])

  const petaBaris = new Map(ctx.baris.map((b) => [b.anggaran_key, b]))
  const total = { PEGAWAI: 0, BARANG_JASA: 0, MODAL: 0 }
  for (const t of ctx.buku.rows) {
    for (const a of t.alokasi) {
      const kode = petaBaris.get(a.anggaran_key)?.kode_rekening ?? a.kode_rekening
      total[kelompokBelanja(kode)] += a.nilai
    }
  }

  isiBaris(ws, [1, 'Belanja Pegawai', total.PEGAWAI], { angka: [3] })
  isiBaris(ws, [2, 'Belanja Barang dan Jasa', total.BARANG_JASA], { angka: [3] })
  isiBaris(ws, [3, 'Belanja Modal', total.MODAL], { angka: [3] })
  isiBaris(ws, ['', 'JUMLAH', total.PEGAWAI + total.BARANG_JASA + total.MODAL], { angka: [3], tebal: true })

  tandaTangan(ws, ctx, 'BENDAHARA', 'DIREKTUR', 3)
}

/** SPJ — satu angka dari pengantar + blok tanda tangan. */
function sheetSpj(wb: ExcelJS.Workbook, ctx: Konteks) {
  const ws = wb.addWorksheet('SPJ')
  ws.columns = [{ width: 6 }, { width: 56 }, { width: 22 }]
  kop(ws, 3, ['SURAT PERTANGGUNGJAWABAN (SPJ)', 'BELANJA BLUD'], ctx)

  const keluar = ctx.buku.rows.reduce((a, t) => a + t.kas_keluar + t.bank_keluar, 0)
  ws.addRow([])
  isiBaris(ws, ['', 'Jumlah belanja yang dipertanggungjawabkan', keluar], { angka: [3], tebal: true })
  if (ctx.neraca.no_surat) {
    ws.addRow([])
    ws.addRow(['', 'Nomor', ctx.neraca.no_surat])
  }

  tandaTangan(ws, ctx, 'BENDAHARA', 'DIREKTUR', 3)
}

/**
 * TUTUP KAS — Berita Acara Pemeriksaan Kas. Dua sisi, dan di berkas ini keduanya
 * PASTI bertemu: bulan yang tidak seimbang tidak bisa ditutup (§4.7). Kalau
 * bulannya masih terbuka, sisi B tetap dicetak apa adanya berikut selisihnya —
 * jangan disembunyikan, justru itu yang perlu terlihat.
 */
function sheetTutupKas(wb: ExcelJS.Workbook, ctx: Konteks) {
  const ws = wb.addWorksheet('TUTUP KAS')
  ws.columns = [{ width: 6 }, { width: 52 }, { width: 22 }]
  const n = ctx.neraca
  kop(ws, 3, ['BERITA ACARA PEMERIKSAAN KAS'], ctx)

  if (n.no_surat) { ws.addRow(['', 'Nomor', n.no_surat]); ws.addRow([]) }

  barisJudulKolom(ws, ['', 'A.  Menurut Buku', 'Jumlah'])
  isiBaris(ws, ['1', 'Saldo awal kas tunai', n.saldo_awal_kas], { angka: [3] })
  isiBaris(ws, ['2', 'Saldo awal bank', n.saldo_awal_bank], { angka: [3] })
  isiBaris(ws, ['3', 'Penerimaan bulan ini', n.masuk_kas + n.masuk_bank], { angka: [3] })
  isiBaris(ws, ['4', 'Pengeluaran bulan ini', -(n.keluar_kas + n.keluar_bank)], { angka: [3] })
  isiBaris(ws, ['', 'Saldo akhir menurut buku', n.saldo_buku], { angka: [3], tebal: true })

  ws.addRow([])
  barisJudulKolom(ws, ['', 'B.  Menurut Kenyataan', 'Jumlah'])
  isiBaris(ws, ['1', 'Uang tunai di brankas', n.kas_fisik ?? 0], { angka: [3] })
  isiBaris(ws, ['2', 'Saldo rekening koran', n.bank_koran ?? 0], { angka: [3] })
  isiBaris(ws, ['', 'Saldo akhir menurut kenyataan', n.saldo_nyata ?? 0], { angka: [3], tebal: true })

  ws.addRow([])
  const rs = isiBaris(ws, ['', 'SELISIH (A − B)', n.selisih ?? 0], { angka: [3], tebal: true })
  if (!n.seimbang) {
    rs.eachCell((c) => { c.font = { ...(c.font ?? {}), bold: true, color: { argb: 'FFC00000' } } })
    ws.addRow([])
    ws.addRow(['', 'Belum seimbang — bulan ini belum ditutup.'])
  }

  tandaTangan(ws, ctx, 'BENDAHARA', 'DIREKTUR', 3)
}

/** setor BPD — hanya transaksi setoran/transfer ke bank, bulan berjalan. */
function sheetSetorBpd(wb: ExcelJS.Workbook, ctx: Konteks) {
  const ws = wb.addWorksheet('setor BPD')
  ws.columns = [{ width: 5 }, { width: 14 }, { width: 52 }, { width: 20 }]
  kop(ws, 4, ['DAFTAR SETORAN KE BANK'], ctx)
  barisJudulKolom(ws, ['No', 'Tanggal', 'Uraian', 'Jumlah Setoran'])

  const setoran = ctx.buku.rows.filter((t) => t.jenis === 'SETOR_BANK' || t.bank_masuk > 0)
  setoran.forEach((t, i) => {
    isiBaris(ws, [i + 1, t.tanggal, t.uraian, t.bank_masuk || t.kas_keluar], { angka: [4] })
  })
  if (setoran.length === 0) ws.addRow(['', '', 'Tidak ada setoran pada bulan ini.'])
  else isiBaris(ws, ['', '', 'JUMLAH', setoran.reduce((a, t) => a + (t.bank_masuk || t.kas_keluar), 0)], { angka: [4], tebal: true })

  tandaTangan(ws, ctx, null, 'BENDAHARA', 4)
}
