// scripts/test-blud-format-unduhan.mts — gaya dokumen unduhan BLUD (Excel & PDF).
// Konsep: docs/konsep/blud/CONCEPT-blud-format-unduhan.md (§5a gaya, §6.1 Impor, §6.2 PJ dobel).
//
// Diuji lewat berkas SUNGGUHAN: workbook dari `buatWorkbook*` dan PDF dari `buatPdf*` — fungsi
// yang sama dengan tombol unduh — lalu isinya dibaca kembali (exceljs / pdfjs).
//
// Jalankan: npx tsx scripts/test-blud-format-unduhan.mts

import type ExcelJS from 'exceljs'
import { buatWorkbookDpa, buatWorkbookPergeseran } from '../lib/blud/export/dpa-dokumen'
import { buatWorkbookRekapPj } from '../lib/blud/export/rekap-pj-dokumen'
import { buatPdfDpa, buatPdfPergeseran, buatPdfRekapPj } from '../lib/blud/export/pdf-dokumen'
import { susunRekapPj, barisRekapDpa, kelompokPerPj, adaSelisihRekap } from '../lib/blud/rekap-pj'
import { auditRekapPJ } from '../lib/blud/audit-pj'
import { bacaGridDpa, type GridDpa } from '../lib/blud/import-dpa-grid'
import { bacaDpaDariGrid, adalahBarisNomorKolom } from '../lib/blud/import-dpa'
import { loadExcelJs } from '../lib/shared/excel-export'
import type { DpaBaris, PergeseranBaris } from '../types'

let lulus = 0
let gagal = 0
function cek(nama: string, syarat: boolean, catatan = '') {
  if (syarat) { lulus++; console.log(`  ok    ${nama.padEnd(66)} ${catatan}`) }
  else        { gagal++; console.log(`  GAGAL ${nama.padEnd(66)} ${catatan}`) }
}
const bab = (t: string) => console.log(`\n── ${t} ──`)

const dasar = {
  id: 0, tahun_anggaran: 2099, versi_tanggal: '2099-01-31',
  kode_rekening: '', uraian: '', satuan: null, parent_id: null, vol: null, harga: null,
  anggaran_key: null, origin: 'MANUAL', usulan_item_id: null, usulan_no: null,
  penanggung_jawab: null, keterangan: null,
  vol_sebelum: null, satuan_sebelum: null, harga_sebelum: null, jumlah_sebelum: null,
}

/** Jangkar berbentuk asli (`POLA_JANGKAR`): AK- + 32 hex. */
const ak = (n: number) => `AK-${n.toString(16).padStart(32, '0')}`

/** Akar → 2 induk → daun. PJ "Kasubbag Umum" di induk Operasi DAN di salah satu daunnya (dobel). */
function barisDpa(): DpaBaris[] {
  const b = (o: Record<string, unknown>) => ({ ...dasar, ...o }) as unknown as DpaBaris
  return [
    b({ row_id: 'akar', tipe_baris: 'GRANDMASTER', urutan: 1, kode_rekening: '5', uraian: 'Belanja Daerah', jumlah: 9_000_000, anggaran_key: ak(1) }),
    b({ row_id: 'op', parent_id: 'akar', tipe_baris: 'MASTER', urutan: 2, kode_rekening: '5.1', uraian: 'Belanja Operasi', jumlah: 6_000_000, anggaran_key: ak(2), penanggung_jawab: 'Kasubbag Umum' }),
    b({ row_id: 'atk', parent_id: 'op', tipe_baris: 'CHILD', urutan: 3, kode_rekening: '5.1.01', uraian: 'ATK', vol: 2, satuan: 'paket', harga: 1_000_000, jumlah: 2_000_000, anggaran_key: ak(3), penanggung_jawab: 'Kasubbag Umum' }),
    b({ row_id: 'lis', parent_id: 'op', tipe_baris: 'CHILD', urutan: 4, kode_rekening: '5.1.02', uraian: 'Listrik', vol: 1, satuan: 'th', harga: 4_000_000, jumlah: 4_000_000, anggaran_key: ak(4) }),
    b({ row_id: 'mod', parent_id: 'akar', tipe_baris: 'MASTER', urutan: 5, kode_rekening: '5.2', uraian: 'Belanja Modal', jumlah: 3_000_000, anggaran_key: ak(5), penanggung_jawab: 'Kasi Penunjang Medik' }),
    b({ row_id: 'kom', parent_id: 'mod', tipe_baris: 'CHILD', urutan: 6, kode_rekening: '5.2.01', uraian: 'Komputer', vol: 1, satuan: 'unit', harga: 3_000_000, jumlah: 3_000_000, anggaran_key: ak(6) }),
  ]
}

function barisPergeseran(): PergeseranBaris[] {
  const geser: Record<string, number> = { atk: 1_000_000, lis: 5_000_000 }
  return barisDpa().map(r => {
    const p = r.row_id === 'op' ? 6_000_000 : r.row_id === 'akar' ? 9_000_000 : geser[r.row_id] ?? Number(r.jumlah)
    const harga_p = r.row_id === 'atk' ? 500_000 : r.row_id === 'lis' ? 5_000_000 : r.harga
    return { ...r, dpa_versi_tanggal: '2099-01-31', vol_p: r.vol, harga_p, pergeseran: p, bertambah_berkurang: p - Number(r.jumlah), bertambah: null, berkurang: null }
  }) as unknown as PergeseranBaris[]
}

const nilai = (ws: ExcelJS.Worksheet, r: number, c: number) => ws.getRow(r).getCell(c).value
const isiSel = (ws: ExcelJS.Worksheet, r: number, c: number) =>
  (ws.getRow(r).getCell(c).fill as { fgColor?: { argb?: string } } | undefined)?.fgColor?.argb ?? null
const cariUraian = (ws: ExcelJS.Worksheet, teks: string, kol = 2) => {
  for (let n = 1; n <= ws.rowCount; n++) if (String(nilai(ws, n, kol) ?? '') === teks) return n
  return 0
}
const rumus = (v: ExcelJS.CellValue) => (v && typeof v === 'object' && 'formula' in v ? String(v.formula) : null)
const hasil = (v: ExcelJS.CellValue) => (v && typeof v === 'object' && 'result' in v ? v.result : v)
const keBuffer = async (wb: ExcelJS.Workbook) => Buffer.from(await wb.xlsx.writeBuffer())

async function teksPdf(buf: ArrayBuffer): Promise<string> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), useSystemFonts: false, verbosity: 0 }).promise
  let t = ''
  for (let i = 1; i <= doc.numPages; i++) {
    const isi = await (await doc.getPage(i)).getTextContent()
    t += ' ' + isi.items.map(x => ('str' in x ? x.str : '')).join(' ')
  }
  return t.replace(/\s+/g, ' ')
}

// ─── A. Excel DPA: kop, kepala, nomor kolom, tingkat, JUMLAH, cetak ──────────
bab('A. Excel DPA — gaya dokumen')
{
  const wb = await buatWorkbookDpa({ tahun: 2099, versi: '2099-01-31', rows: barisDpa(), direktur: { nama: 'dr. Uji', nip: '1' } })
  const ws = wb.worksheets[0]
  cek('A1 kop baris 1 = judul, baris 5 menyebut versi', nilai(ws, 1, 1) === 'RINCIAN BELANJA ANGGARAN' && /^DPA BLUD versi /.test(String(nilai(ws, 5, 1))))
  cek('A2 baris 6 = garis amber', isiSel(ws, 6, 1) === 'FFEF9F27' && isiSel(ws, 6, 8) === 'FFEF9F27')
  cek('A3 kepala baris 7 berlatar navy', nilai(ws, 7, 1) === 'Kode Rekening' && isiSel(ws, 7, 1) === 'FF042C53')
  cek('A4 nomor kolom (1)…(8) baris 8, kolom cadangan kosong',
    [1, 2, 8].map(c => nilai(ws, 8, c)).join('|') === '(1)|(2)|(8)' && !nilai(ws, 8, 9) && !nilai(ws, 8, 10))
  cek('A5 data mulai baris 9 (akar)', nilai(ws, 9, 1) === '5' && isiSel(ws, 9, 2) === 'FF042C53')
  const op = cariUraian(ws, 'Belanja Operasi')
  cek('A6 induk tingkat 2 berlatar biru muda + tebal', isiSel(ws, op, 1) === 'FFDCE8F5' && ws.getRow(op).getCell(2).font?.bold === true)
  const atk = cariUraian(ws, 'ATK')
  cek('A7 daun polos, menjorok 2, angka Consolas', isiSel(ws, atk, 1) === null
    && ws.getRow(atk).getCell(2).alignment?.indent === 2 && ws.getRow(atk).getCell(6).font?.name === 'Consolas')
  cek('A8 rumus daun tetap ROUND(C*E) di barisnya', rumus(nilai(ws, atk, 6)) === `ROUND(C${atk}*E${atk},0)`)
  cek('A9 rumus induk tetap SUM anak', rumus(nilai(ws, op, 6)) === `SUM(F${op + 1}:F${op + 2})`)
  const tot = cariUraian(ws, 'JUMLAH BELANJA')
  cek('A10 baris JUMLAH BELANJA = rumus atas baris AKAR saja', rumus(nilai(ws, tot, 6)) === 'SUM(F9:F9)' && hasil(nilai(ws, tot, 6)) === 9_000_000,
    String(rumus(nilai(ws, tot, 6))))
  cek('A11 baris JUMLAH berlatar amber, tanpa Level & Jangkar', isiSel(ws, tot, 2) === 'FFEF9F27' && !nilai(ws, tot, 9) && !nilai(ws, tot, 10))
  let teks = ''
  ws.eachRow(r => r.eachCell(c => { teks += ` ${String(c.value ?? '')}` }))
  cek('A12 tanda tangan Direktur sesudah tabel', teks.includes('dr. Uji') && cariUraian(ws, 'dr. Uji', 5) > tot)
  cek('A13 siap cetak: A4 mendatar, muat selebar, kepala berulang 7:8',
    ws.pageSetup.paperSize === 9 && ws.pageSetup.orientation === 'landscape' && ws.pageSetup.fitToWidth === 1
    && ws.pageSetup.printTitlesRow === '7:8')
  cek('A14 garis kisi disembunyikan, beku sampai nomor kolom',
    (ws.views[0] as { showGridLines?: boolean; ySplit?: number }).showGridLines === false && (ws.views[0] as { ySplit?: number }).ySplit === 8)
  cek('A15 nomor halaman di kaki', /Halaman &P dari &N/.test(ws.headerFooter.oddFooter ?? ''))
}

// ─── B. Excel Pergeseran: JUMLAH, berimbang, tanda bergeser ──────────────────
bab('B. Excel Pergeseran')
{
  const wb = await buatWorkbookPergeseran({ tahun: 2099, versi: '2099-02-28', rows: barisPergeseran() })
  const ws = wb.worksheets[0]
  const tot = cariUraian(ws, 'JUMLAH')
  cek('B1 JUMLAH: kolom Jumlah & Pergeseran = SUM akar', rumus(nilai(ws, tot, 6)) === 'SUM(F9:F9)' && rumus(nilai(ws, tot, 9)) === 'SUM(I9:I9)')
  cek('B2 JUMLAH: Bertambah = Berkurang (berimbang)', hasil(nilai(ws, tot, 10)) === 1_000_000 && hasil(nilai(ws, tot, 11)) === 1_000_000,
    `${hasil(nilai(ws, tot, 10))} / ${hasil(nilai(ws, tot, 11))}`)
  cek('B3 JUMLAH: Selisih = I − F', rumus(nilai(ws, tot, 12)) === `I${tot}-F${tot}`)
  cek('B4 kalimat berimbang di bawah tabel', /^Berimbang: bertambah Rp 1\.000\.000 = berkurang Rp 1\.000\.000\.$/.test(String(nilai(ws, tot + 1, 1))))
  const atk = cariUraian(ws, 'ATK')
  const tepi = ws.getRow(atk).getCell(1).border?.left as { style?: string; color?: { argb?: string } } | undefined
  cek('B5 rincian yang bergeser bertanda tepi kiri amber', tepi?.style === 'thick' && tepi.color?.argb === 'FFEF9F27')
  const kom = cariUraian(ws, 'Komputer')
  cek('B6 rincian yang tidak bergeser tanpa tanda', (ws.getRow(kom).getCell(1).border?.left as { style?: string } | undefined)?.style !== 'thick')
  cek('B7 judul Vol P / Harga P dipertahankan (penanda tolak Impor DPA)',
    [7, 8].map(c => nilai(ws, 7, c)).join('|') === 'Vol P|Harga P')
}

// ─── C. Impor melewati baris nomor kolom & JUMLAH ────────────────────────────
bab('C. Impor — §6.1')
{
  const ExcelJSLib = await loadExcelJs()
  const gridDari = async (isi: (string | number | null)[][]) => {
    const wb = new ExcelJSLib.Workbook()
    const ws = wb.addWorksheet('L')
    isi.forEach(r => ws.addRow(r))
    return bacaGridDpa(await keBuffer(wb))
  }
  const g = await gridDari([
    ['Kode Rekening', 'Uraian', 'Vol', 'Harga', 'Jumlah'],
    ['(1)', '(2)', '(3)', '(4)', '(5)'],
    ['1', '2', '3', '4', '5'],
    ['5.1', 'Belanja', 1, 2, 3],
    ['(1)', '(3)', '(2)', null, null],
    ['(1)', '(2)', null, null, null],
  ])
  cek('C1 "(1) (2) (3)…" dikenali', adalahBarisNomorKolom(g, 2))
  cek('C2 "1 2 3…" formulir kantor dikenali', adalahBarisNomorKolom(g, 3))
  cek('C3 baris data TIDAK dikira nomor kolom', !adalahBarisNomorKolom(g, 4))
  cek('C4 nomor tak berurutan TIDAK dikenali', !adalahBarisNomorKolom(g, 5))
  cek('C5 kurang dari tiga nomor TIDAK dikenali', !adalahBarisNomorKolom(g, 6))

  const asal = barisDpa()
  const bacaWb = async (wb: ExcelJS.Workbook) => bacaDpaDariGrid(await bacaGridDpa(await keBuffer(wb)))
  const h = await bacaWb(await buatWorkbookDpa({ tahun: 2099, versi: '2099-01-31', rows: asal }))
  cek('C6 unduhan bergaya baru terbaca balik utuh (baris & total)', h.baris.length === asal.length && h.totalFile === 9_000_000,
    `${h.baris.length} baris · ${h.totalFile}`)
  cek('C7 baris nomor kolom & JUMLAH tidak ikut terbaca',
    !h.baris.some(b => b.uraian === 'JUMLAH BELANJA' || /^\(\d+\)$/.test(b.kode)))
  cek('C8 jangkar utuh', h.baris.every((b, i) => b.jangkar === asal[i].anggaran_key))

  // "Paste as values": rumus hilang semua, Level jadi cadangan — JUMLAH tetap dilewati.
  const wb = await buatWorkbookDpa({ tahun: 2099, versi: '2099-01-31', rows: asal })
  wb.worksheets[0].eachRow(r => {
    const s = r.getCell(6)
    const v = s.value
    if (v && typeof v === 'object' && 'formula' in v) s.value = Number(s.result ?? 0)
  })
  const hNilai = await bacaWb(wb)
  cek('C9 paste-as-values: JUMLAH tetap dilewati (tanpa rumus, Level kosong)',
    hNilai.baris.length === asal.length && hNilai.totalFile === 9_000_000, `${hNilai.baris.length} · ${hNilai.totalFile}`)

  // Formulir luar dgn baris "1 2 3" di bawah kepala: dulu "1" terbaca sebagai kode → baris sampah.
  const kantor = await gridDari([
    ['KODE REKENING', 'URAIAN', 'VOL', 'SATUAN', 'HARGA', 'JUMLAH'],
    ['1', '2', '3', '4', '5', '6'],
    ['5.1', 'BELANJA', null, null, null, null],
    ['5.1.01', 'Belanja A', 1, 'th', 100, null],
  ])
  // Sel rumus ditulis lewat exceljs supaya hasilnya tersimpan.
  const wbK = new ExcelJSLib.Workbook()
  const wsK = wbK.addWorksheet('L')
  for (let r = 1; r <= 4; r++) for (let c = 1; c <= 6; c++) wsK.getRow(r).getCell(c).value = kantor.sel(r, c).teks || null
  wsK.getCell('C4').value = 1; wsK.getCell('E4').value = 100
  wsK.getCell('F3').value = { formula: 'SUM(F4:F4)', result: 100 }
  wsK.getCell('F4').value = { formula: 'ROUND(C4*E4,0)', result: 100 }
  const hK = await bacaWb(wbK)
  cek('C10 formulir kantor ber-baris "1 2 3": baris itu tidak terbaca sebagai data', hK.baris.length === 2 && hK.baris[0].kode === '5.1',
    hK.baris.map(b => b.kode).join(','))
}

// ─── D. Rekap PJ: susunan + tanda dobel ──────────────────────────────────────
bab('D. Rekap PJ — §6.2')
{
  const rows = barisDpa()
  const s = susunRekapPj(barisRekapDpa(rows), 'DPA')
  const audit = auditRekapPJ(barisRekapDpa(rows))
  cek('D1 total = auditRekapPJ.grandTotal (bersih dobel)', s.total === audit.grandTotal && s.total === 9_000_000, String(s.total))
  const kel = s.baris.filter(b => b.jenis === 'kelompok')
  cek('D2 subtotal per PJ tetap MENTAH (= kelompokPerPj, = Form PK)',
    JSON.stringify(kel.map(k => k.jenis === 'kelompok' ? k.subtotal : 0)) === JSON.stringify(kelompokPerPj(barisRekapDpa(rows)).map(g => g.subtotal)))
  const dobel = s.baris.filter(b => b.jenis === 'rincian' && b.dobelDengan)
  cek('D3 hanya ATK yang ditandai dobel, dengan PJ leluhurnya',
    dobel.length === 1 && dobel[0].jenis === 'rincian' && dobel[0].uraian === 'ATK' && dobel[0].dobelDengan === 'Kasubbag Umum')
  // Rekap ini PAS (total 9 jt = anggaran): catatan pemeriksaan tidak ikut ke dokumen,
  // hanya keterangan tanda * yang memang tercetak di tabel (CONCEPT-blud-audit-pj-pintar §9).
  cek('D4 rekap pas → catatan hanya keterangan tanda * dobel', s.selisih === 0 && s.catatan.length === 1 && /^\* 1 baris/.test(s.catatan[0]),
    s.catatan.join(' | '))
  const tanpaDobel = barisRekapDpa(rows).map(r => (r.uraian === 'ATK' ? { ...r, penanggung_jawab: null } : r))
  const sPas = susunRekapPj(tanpaDobel, 'DPA')
  cek('D4b rekap pas tanpa dobel → tanpa catatan sama sekali', sPas.selisih === 0 && sPas.catatan.length === 0, sPas.catatan.join(' | '))
  const sKurang = susunRekapPj(barisRekapDpa(rows).map(r => (r.uraian === 'Belanja Operasi' ? { ...r, penanggung_jawab: null } : r)), 'DPA')
  cek('D4c rekap berselisih → neraca & penyebab tetap ikut', sKurang.selisih !== 0 && /^Total DPA/.test(sKurang.catatan[0] ?? '')
    && sKurang.catatan.some(c => /^Penyebab selisih/.test(c)), sKurang.catatan.join(' | '))
  cek('D4d pos kurang & lebih yang saling menutup tetap dianggap berselisih', adaSelisihRekap(2, 0) && !adaSelisihRekap(0, 0.4) && adaSelisihRekap(0, -3))
  cek('D5 huruf kelompok A, B', kel.map(k => (k.jenis === 'kelompok' ? k.huruf : '')).join('') === 'AB')
  // Subtotal mentah memuat baris dobel; porsi TIDAK — kalau ya, kolom % berjumlah > 100%.
  const totalPorsi = kel.reduce((t, k) => t + (k.jenis === 'kelompok' ? k.porsi : 0), 0)
  cek('D5b porsi semua PJ berjumlah 100% walau ada baris dobel', Math.abs(totalPorsi - 1) < 1e-9, String(totalPorsi))

  const wb = await buatWorkbookRekapPj({ tahun: 2099, versi: '2099-01-31', sumber: 'dpa', rows })
  const ws = wb.worksheets[0]
  const atk = cariUraian(ws, 'ATK')
  cek('D6 Excel: baris dobel miring abu + keterangan "* juga dihitung di …"',
    ws.getRow(atk).getCell(3).font?.italic === true && nilai(ws, atk, 5) === '* juga dihitung di Kasubbag Umum')
  const tot = cariUraian(ws, 'JUMLAH SELURUHNYA')
  cek('D7 Excel: JUMLAH SELURUHNYA = total bersih', nilai(ws, tot, 3) === 9_000_000)
  cek('D8 Excel: satu total saja (tanpa "TOTAL BELANJA BLUD" di atas)', !cariUraian(ws, 'TOTAL BELANJA BLUD', 1))
  cek('D9 Excel: kelompok berlatar krem + porsi %', isiSel(ws, cariUraian(ws, 'Kasubbag Umum'), 2) === 'FFFDF1DE'
    && ws.getRow(cariUraian(ws, 'Kasubbag Umum')).getCell(4).numFmt === '0.0%')
  const pg = barisPergeseran()
  const wbPg = await buatWorkbookRekapPj({ tahun: 2099, versi: '2099-02-28', sumber: 'pergeseran', rows: pg })
  cek('D10 pasca-geser: angka dari kolom pergeseran, judul menyebutnya',
    /PASCA-PERGESERAN/.test(String(nilai(wbPg.worksheets[0], 1, 1))))
}

// ─── E. PDF: isi teks sungguhan ──────────────────────────────────────────────
bab('E. PDF — kop, tabel, JUMLAH, tanda tangan')
{
  const dpa = await teksPdf((await buatPdfDpa({ tahun: 2099, versi: '2099-01-31', rows: barisDpa(), direktur: { nama: 'dr. Uji', nip: '7' } })).output('arraybuffer'))
  cek('E1 DPA: kop + versi', dpa.includes('RINCIAN BELANJA ANGGARAN') && dpa.includes('TAHUN ANGGARAN 2099') && dpa.includes('DPA BLUD versi'))
  cek('E2 DPA: nomor kolom + JUMLAH BELANJA = total akar', dpa.includes('(1)') && /JUMLAH BELANJA 9\.000\.000/.test(dpa))
  cek('E3 DPA: tanda tangan Direktur + nomor halaman', dpa.includes('dr. Uji') && dpa.includes('NIP. 7') && /Halaman 1 dari 1/.test(dpa))
  const pg = await teksPdf((await buatPdfPergeseran({ tahun: 2099, versi: '2099-02-28', rows: barisPergeseran() })).output('arraybuffer'))
  cek('E4 Pergeseran: kalimat berimbang + Berkurang dalam kurung', pg.includes('Berimbang: bertambah Rp 1.000.000') && pg.includes('(1.000.000)'))
  const pj = await teksPdf((await buatPdfRekapPj({ tahun: 2099, versi: '2099-01-31', sumber: 'dpa', rows: barisDpa() })).output('arraybuffer'))
  cek('E5 Rekap PJ: tanda dobel + JUMLAH SELURUHNYA', pj.includes('* juga dihitung di Kasubbag Umum') && /JUMLAH SELURUHNYA 9\.000\.000/.test(pj))
  let galat = ''
  try { await buatPdfRekapPj({ tahun: 2099, versi: null, sumber: 'dpa', rows: barisDpa().map(r => ({ ...r, penanggung_jawab: null })) }) }
  catch (e) { galat = (e as Error).message }
  cek('E6 Rekap PJ tanpa satu PJ pun ditolak dgn kalimat jelas', /Belum ada baris ber-Penanggung Jawab/.test(galat), galat)
}

// ─── G. Tanda tangan ikut Pengaturan → Pejabat Penanda Tangan SPJ ────────────
bab('G. Tanda tangan = isian Pengaturan (nama, NIP, pangkat, bunyi jabatan)')
{
  const direktur = { nama: 'dr. IKHWAN HAMZAH', nip: '19700811 200312 1 002', pangkat: 'Pembina Tingkat I (IV/b)', jabatan: 'DIREKTUR' }
  const ws = (await buatWorkbookDpa({ tahun: 2099, versi: '2099-01-31', rows: barisDpa(), direktur })).worksheets[0]
  const n = cariUraian(ws, 'dr. IKHWAN HAMZAH', 5)
  cek('G1 Excel: bunyi jabatan dari Pengaturan ("DIREKTUR"), bukan "Direktur" mati',
    cariUraian(ws, 'DIREKTUR', 5) > 0 && !cariUraian(ws, 'Direktur', 5))
  cek('G2 Excel: nama bergaris bawah, lalu pangkat, lalu NIP',
    n > 0 && ws.getRow(n).getCell(5).font?.underline === true
    && nilai(ws, n + 1, 5) === 'Pembina Tingkat I (IV/b)' && nilai(ws, n + 2, 5) === 'NIP. 19700811 200312 1 002')
  const wsKosong = (await buatWorkbookDpa({ tahun: 2099, versi: '2099-01-31', rows: barisDpa(), direktur: { nama: 'dr. X', nip: null } })).worksheets[0]
  const nk = cariUraian(wsKosong, 'dr. X', 5)
  cek('G3 Excel: tanpa jabatan & pangkat → "Direktur", tanpa baris pangkat kosong',
    cariUraian(wsKosong, 'Direktur', 5) > 0 && /^NIP\. \.+$/.test(String(nilai(wsKosong, nk + 1, 5))))
  const pdf = await teksPdf((await buatPdfRekapPj({ tahun: 2099, versi: '2099-01-31', sumber: 'dpa', rows: barisDpa(), direktur })).output('arraybuffer'))
  cek('G4 PDF: DIREKTUR · nama · pangkat · NIP', /DIREKTUR RSJD Dr\. AMINO GONDOHUTOMO PROVINSI JAWA TENGAH dr\. IKHWAN HAMZAH Pembina Tingkat I \(IV\/b\) NIP\. 19700811 200312 1 002/.test(pdf))
  const fsx = await import('node:fs')
  const cetak = fsx.readFileSync(new URL('../app/(dashboard)/blud/cetak/cetak-client.tsx', import.meta.url), 'utf8')
  cek('G5 layar Cetak mengambil pangkat & bunyi jabatan dari /api/blud/pejabat',
    cetak.includes('pangkat: d.pangkat ?? null, jabatan: d.jabatan_teks ?? null'))
}

// ─── F. Sumber gaya satu ─────────────────────────────────────────────────────
bab('F. Satu sumber gaya')
{
  const fs = await import('node:fs')
  const baca = (p: string) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
  for (const p of ['lib/blud/export/dpa-dokumen.ts', 'lib/blud/export/pdf-dokumen.ts', 'lib/blud/export/rekap-pj-dokumen.ts', 'lib/blud/export/excel.ts', 'lib/blud/export/pdf.ts']) {
    const k = baca(p)
    cek(`F ${p.split('/').pop()} memakai gaya-dokumen, tanpa biru lama 1855BB`, /from '@\/lib\/blud\/export\/gaya-dokumen'/.test(k) && !/1855BB/.test(k))
  }
  const _g: GridDpa | null = null
  void _g
}

console.log(`\n${lulus} lulus · ${gagal} gagal`)
process.exit(gagal ? 1 : 0)
