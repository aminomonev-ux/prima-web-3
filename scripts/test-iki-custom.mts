// scripts/test-iki-custom.mts — IKI varian CUSTOM: tabel bagian II dirancang sendiri (docs/CONCEPT-iki-custom.md).
//
//   npx tsx scripts/test-iki-custom.mts
//
// A–C `lib/iki/custom.ts` (murni): bentuk tersimpan, templat, kisi cetak, lebar kertas. D skema Zod (batas
// 24 kolom IKI, LKJIP tetap 12; aturan per varian). E tanda tangan & "boleh dicetak". F berkas PDF & Excel
// SUNGGUHAN dari pengekspor yang dipakai tombolnya, lalu dibuka ulang. G sambungan layar & route.
// H MySQL sungguhan di tahun kotak pasir 2094–2095 lewat fungsi data asli, lalu dibersihkan.

import { readFileSync } from 'node:fs'
import mysql from 'mysql2/promise'
import {
  bacaTabelCustom, tabelCustomAwal, bentukTemplat, adaIsiBadan, jumlahBarisBadan, susunKisiCetak, lebarKolomMm,
  lebarTulisMm, lebarTulisPx, BATAS_KOLOM_IKI, WARNA_KEPALA_IKI, type TabelCustom,
} from '../lib/iki/custom'
import { buildTtd, alasanTakBisaCetak, type IkiGridDokumen } from '../lib/iki/layout'
import { TabelCustomSchema, SaveDokumenSchema } from '../lib/data/iki-schemas'
import { TabelPayloadSchema } from '../lib/lkjip/schemas'
import { htmlKeSel } from '../lib/lkjip/tabel'

try {
  for (const b of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split(/\r?\n/)) {
    const t = b.trim()
    const i = t.indexOf('=')
    if (!t || t.startsWith('#') || i < 0) continue
    const k = t.slice(0, i).trim()
    if (process.env[k] === undefined) process.env[k] = t.slice(i + 1).trim().replace(/^["']|["']$/g, '')
  }
} catch { /* tanpa .env.local: bagian DB dilewati */ }

let lulus = 0
const gagal: string[] = []
function ok(nama: string, syarat: unknown, ket = '') {
  if (syarat) { lulus++; console.log(`  ok  ${nama}`) }
  else { gagal.push(nama); console.log(`FAIL  ${nama}${ket ? ' — ' + ket : ''}`) }
}
const sumber = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
const tanpaKomentar = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const coba = async <T,>(f: () => Promise<T>): Promise<T | Error> => { try { return await f() } catch (e) { return e as Error } }

/** Tabel 20 kolom: kepala 2 baris bergabung, kolom No., rumus, teks tegak, baris JUMLAH. */
function tabel20(): TabelCustom {
  const n = 20
  const kolom = Array.from({ length: n }, (_, i) => `K${i + 1}`)
  const kosong = () => kolom.map(() => ({ v: '' }))
  const kepala1 = kolom.map((_, i) => ({ v: i === 0 ? 'No.' : i === 1 ? 'Rencana Hasil Kerja' : i === 2 ? 'Target TW' : '' }))
  kepala1[0] = { v: 'No.', rs: 2 } as never
  kepala1[1] = { v: 'Rencana Hasil Kerja', rs: 2 } as never
  kepala1[2] = { v: 'Target TW', cs: 4 } as never
  const kepala2 = kolom.map((_, i) => ({ v: i >= 2 && i <= 5 ? `TW ${['I', 'II', 'III', 'IV'][i - 2]}` : `Kolom ${i + 1}` }))
  kepala2[6] = { v: 'Tegak', rot: true } as never
  const b1 = kosong(); b1[1] = { v: 'RHK satu' }; b1[2] = { v: '10' }; b1[3] = { v: '20' }
  const b2 = kosong(); b2[1] = { v: 'RHK dua' }; b2[2] = { v: '5' }; b2[3] = { v: '=C4/0' }
  const jml = kosong(); jml[1] = { v: 'JUMLAH' }; jml[2] = { v: '=SUM(C3:C4)' }
  return bacaTabelCustom({
    kolom, headerRows: 2, rows: [kepala1, kepala2, b1, b2, jml], kolomNomor: 0,
    gaya: { jumlah: true }, kertas: 'F4', colWidths: kolom.map((_, i) => (i === 1 ? 300 : 60)),
  })
}

console.log('A. Bentuk tersimpan & templat')
{
  const awal = tabelCustomAwal()
  ok('A1 bentuk awal 4 kolom, kepala 1 baris, kolom No. otomatis, kertas A4', awal.kolom.length === 4 && awal.headerRows === 1 && awal.kolomNomor === 0 && awal.kertas === 'A4')
  ok('A2 bentuk awal lolos skema server', TabelCustomSchema.safeParse(awal).success)
  const lebar = bacaTabelCustom({ kolom: Array.from({ length: 30 }, (_, i) => `K${i}`), rows: [] })
  ok('A3 lebih dari 24 kolom dipangkas ke 24 saat dibaca (keputusan #4)', BATAS_KOLOM_IKI === 24 && lebar.kolom.length === 24 && lebar.rows.every(r => r.length === 24))
  const lama = bacaTabelCustom({ kolom: ['A', 'B'], headerRows: 0, rows: [[{ v: '1' }, { v: '2' }]] })
  ok('A4 kepala 0 baris dijadikan sel (E1): 1 baris kepala berisi nama kolom', lama.headerRows === 1 && lama.rows[0][0].v === 'A' && lama.rows.length === 2)
  ok('A5 kertas tak dikenal → A4; kolom No. di luar tabel → null', bacaTabelCustom({ kolom: ['A'], kertas: 'A3', kolomNomor: 5 }).kertas === 'A4'
    && bacaTabelCustom({ kolom: ['A'], kolomNomor: 5 }).kolomNomor === null)
  ok('A6 nama kolom diambil dari judul kepala (E2)', bacaTabelCustom({ kolom: ['x', 'y'], headerRows: 1, rows: [[{ v: 'Indikator' }, { v: 'Target' }]] }).kolom.join('|') === 'Indikator|Target')
  const t = tabel20()
  const tpl = bentukTemplat(t, false)
  ok('A7 templat tanpa isi: kepala utuh + SATU baris kosong', tpl.rows.length === t.headerRows + 1 && tpl.rows.slice(0, 2).every((r, i) => JSON.stringify(r) === JSON.stringify(t.rows[i]))
    && tpl.rows[2].every(c => c.v === ''))
  const berformat = bacaTabelCustom({ kolom: ['A', 'B'], headerRows: 1, rows: [[{ v: 'A' }, { v: 'B' }], [{ v: 'x', b: true, al: 'right', cs: 2 }, { v: '' }]] })
  const tplF = bentukTemplat(berformat, false)
  ok('A8 baris pola mewarisi FORMAT baris badan pertama, tanpa isi & tanpa gabungan', tplF.rows[1][0].b === true && tplF.rows[1][0].al === 'right' && tplF.rows[1][0].v === '' && !tplF.rows[1][0].cs && !tplF.rows[1][1].h)
  ok('A9 templat dengan isi = tabel utuh', JSON.stringify(bentukTemplat(t, true)) === JSON.stringify(t))
  ok('A10 kertas, lebar, gaya ikut templat', tpl.kertas === 'F4' && tpl.colWidths[1] === 300 && tpl.gaya.jumlah === true)
  ok('A11 kolom No. otomatis saja = belum ada isi', !adaIsiBadan(bacaTabelCustom({ kolom: ['No', 'X'], headerRows: 1, kolomNomor: 0, rows: [[{ v: 'No' }, { v: 'X' }], [{ v: '1' }, { v: '' }]] }))
    && adaIsiBadan(t))
  ok('A12 jumlah baris badan', jumlahBarisBadan(t) === 3 && jumlahBarisBadan(tabelCustomAwal()) === 3)
}

console.log('\nB. Kisi cetak (satu penyusun PDF & Excel)')
{
  const t = tabel20()
  const k = susunKisiCetak(t)
  ok('B1 20 kolom, 2 baris kepala', k.ncol === 20 && k.headerRows === 2 && k.baris.length === 5)
  ok('B2 gabungan: pemilik membawa rentang, sel tertutup = null', k.baris[0][0]?.rs === 2 && k.baris[1][0] === null && k.baris[0][2]?.cs === 4 && k.baris[0][3] === null)
  ok('B3 kepala: tebal, tengah, tengah-tegak, abu IKI', k.baris[1][2]?.b === true && k.baris[1][2]?.al === 'center' && k.baris[1][2]?.va === 'middle' && k.baris[1][2]?.bg === WARNA_KEPALA_IKI)
  ok('B4 kolom No. diisi 1, 2 — baris JUMLAH tidak dinomori', k.baris[2][0]?.teks === '1' && k.baris[3][0]?.teks === '2' && k.baris[4][0]?.teks === '')
  ok('B5 rumus dihitung', k.baris[4][2]?.teks === '15', k.baris[4][2]?.teks)
  ok('B6 rumus galat dicetak "—" (aturan Word LKJIP)', k.baris[3][3]?.teks === '—', k.baris[3][3]?.teks)
  ok('B7 baris JUMLAH tebal + garis atas tebal (gaya tabel, fungsi yang sama dengan editor)', k.baris[4][1]?.b === true && k.baris[4][1]?.garis.t === 2 && k.baris[3][1]?.garis.t === 1)
  ok('B8 teks tegak dibawa', k.baris[1][6]?.rot === true && k.baris[1][7]?.rot === false)
  ok('B9 badan: rata dari kolom, tanpa latar', k.baris[2][1]?.al === 'left' && k.baris[2][1]?.bg === undefined && k.baris[2][1]?.va === 'top')
  const mendatar = susunKisiCetak({ ...t, gaya: { mendatar: true } })
  ok('B10 gaya garis mendatar: tanpa garis tegak', mendatar.baris[2][1]?.garis.l === 0 && mendatar.baris[2][1]?.garis.r === 0 && mendatar.baris[2][1]?.garis.t === 1)
  const sendiri = susunKisiCetak(bacaTabelCustom({ kolom: ['A'], headerRows: 1, rows: [[{ v: 'A', bg: 'FFF2CC', al: 'left' }], [{ v: 'x', bd: { b: 0 } }]] }))
  ok('B11 format sel sendiri menang atas bawaan kepala; garis 0 = tanpa garis', sendiri.baris[0][0]?.bg === 'FFF2CC' && sendiri.baris[0][0]?.al === 'left' && sendiri.baris[1][0]?.garis.b === 0)
}

console.log('\nC. Lebar kertas')
{
  ok('C1 bidang tulis A4 = 281 mm, F4 = 314 mm (margin 8 mm, sama dengan STANDAR)', lebarTulisMm('A4') === 281 && lebarTulisMm('F4') === 314)
  const mm = lebarKolomMm([60, 300, 60], 'F4')
  ok('C2 lebar kolom direntangkan sebanding tepat selebar kertas', Math.abs(mm.reduce((a, b) => a + b, 0) - 314) < 1e-9 && Math.abs(mm[1] / mm[0] - 5) < 1e-9)
  const sempit = lebarKolomMm(Array(20).fill(140), 'A4')
  ok('C3 20 kolom di A4 ≈ 14 mm per kolom (angka di konsep §9.1)', Math.abs(sempit[0] - 14.05) < 0.01, String(sempit[0]))
  ok('C4 garis batas kertas di editor: F4 lebih lebar dari A4', lebarTulisPx('F4') > lebarTulisPx('A4') && lebarTulisPx('A4') === 1062, String(lebarTulisPx('A4')))
}

console.log('\nD. Skema')
{
  const t = tabel20()
  const ke = (n: number) => bacaTabelCustom({ kolom: Array.from({ length: n }, (_, i) => `K${i}`), rows: [] })
  const t24 = { kolom: Array.from({ length: 24 }, (_, i) => `K${i}`), headerRows: 1, rows: [Array.from({ length: 24 }, (_, i) => ({ v: `K${i}` }))], kertas: 'A4' }
  ok('D1 IKI menerima 24 kolom', TabelCustomSchema.safeParse(t24).success)
  const k25 = { ...ke(24), kolom: [...ke(24).kolom, 'K25'] }
  ok('D2 IKI menolak 25 kolom', !TabelCustomSchema.safeParse(k25).success)
  const gabung20 = { ...t, rows: t.rows.map((r, i) => (i === 4 ? r.map((c, j) => (j === 0 ? { ...c, cs: 20 } : j > 0 ? { ...c, h: true } : c)) : r)) }
  ok('D3 gabungan 20 kolom sah di IKI (cs > 12)', TabelCustomSchema.safeParse(gabung20).success)
  const lkjip13 = { judul: '', kolom: Array.from({ length: 13 }, (_, i) => `K${i}`), rows: [Array.from({ length: 13 }, () => ({ v: '' }))] }
  ok('D4 LKJIP TETAP 12 kolom (tidak ikut longgar)', !TabelPayloadSchema.safeParse(lkjip13).success
    && TabelPayloadSchema.safeParse({ ...lkjip13, kolom: lkjip13.kolom.slice(0, 12), rows: [lkjip13.rows[0].slice(0, 12)] }).success)
  const parsed = TabelCustomSchema.parse({ ...t, judul: 'x', melintang: true, sumber: 's' })
  ok('D5 kunci khas LKJIP dari editor dibuang, kunci IKI dipertahankan', !('judul' in parsed) && !('melintang' in parsed) && parsed.kertas === 'F4' && parsed.kolomNomor === 0)
  const dasar = {
    expected_version: 0, opd: 'RSJD', nama: 'UJI', nip: '1', jabatan: 'KASI', kota_ttd: 'Semarang', rhk: [] as unknown[],
  }
  ok('D6 CUSTOM tanpa atasan & dengan tabel diterima', SaveDokumenSchema.safeParse({ ...dasar, varian: 'CUSTOM', tabel_custom: t }).success)
  ok('D7 CUSTOM tanpa tabel ditolak', !SaveDokumenSchema.safeParse({ ...dasar, varian: 'CUSTOM' }).success)
  const rhk = { no_urut: 1, rhk_intervensi: 'x', rhk: 'r', indikator: 'i', triwulan: [1, 2, 3, 4].map(n => ({ triwulan: n })) }
  ok('D8 CUSTOM berisi RHK ditolak (dua sumber kebenaran)', !SaveDokumenSchema.safeParse({ ...dasar, varian: 'CUSTOM', tabel_custom: t, rhk: [rhk] }).success)
  ok('D9 STANDAR membawa tabel ditolak', !SaveDokumenSchema.safeParse({ ...dasar, varian: 'STANDAR', nama_atasan: 'A', jabatan_atasan: 'B', tabel_custom: t }).success)
  ok('D10 STANDAR lama (tanpa tabel_custom) tetap diterima', SaveDokumenSchema.safeParse({ ...dasar, varian: 'STANDAR', nama_atasan: 'A', jabatan_atasan: 'B', rhk: [rhk] }).success)
  const html = '<table><tr><td colspan="20">Judul</td></tr></table>'
  ok('D11 tempelan HTML: colspan dijepit batas pemakai (IKI 24, LKJIP 12)', htmlKeSel(html, 24)?.[0][0].cs === 20 && htmlKeSel(html)?.[0][0].cs === 12)
}

const docCustom = (o: Partial<IkiGridDokumen> = {}): IkiGridDokumen => ({
  varian: 'CUSTOM', jenis: 'MURNI', opd: 'RSJD dr. Amino Gondohutomo', nama: 'UJI Pegawai', nip: '1990', jabatan: 'KEPALA SEKSI UJI',
  pangkat: 'Penata', ikhtisar: 'Ikhtisar', nama_atasan: null, nip_atasan: null, jabatan_atasan: null, pangkat_atasan: null,
  kota_ttd: 'Semarang', tanggal_ttd: '2027-01-15', tabel_custom: tabel20(), rhk: [], ...o,
})

console.log('\nE. Tanda tangan & boleh dicetak')
{
  const tanpa = buildTtd(docCustom())
  ok('E1 CUSTOM tanpa Nama Atasan → satu blok pegawai', tanpa.kiri === null && tanpa.kanan.nama === 'UJI Pegawai' && tanpa.kanan.lines[0] === 'Semarang, 15 Januari 2027')
  const dengan = buildTtd(docCustom({ nama_atasan: 'UJI Atasan', jabatan_atasan: 'KEPALA BIDANG', nip_atasan: '1970' }))
  ok('E2 CUSTOM dengan Nama Atasan → dua blok (Mengetahui)', dengan.kiri?.nama === 'UJI Atasan' && dengan.kiri.lines[0] === 'Mengetahui')
  const std = buildTtd(docCustom({ varian: 'STANDAR' }))
  ok('E3 STANDAR tanpa nama atasan tetap dua blok (perilaku lama)', std.kiri !== null)
  ok('E4 boleh dicetak: CUSTOM berisi ya, CUSTOM kosong tidak, STANDAR tanpa RHK tidak', alasanTakBisaCetak(docCustom()) === null
    && alasanTakBisaCetak(docCustom({ tabel_custom: tabelCustomAwal() }))?.includes('Tabel belum berisi') === true
    && alasanTakBisaCetak(docCustom({ varian: 'STANDAR' })) === 'Belum ada baris RHK — tidak ada yang bisa di-export')
}

console.log('\nF. Berkas PDF & Excel sungguhan')
{
  const { buildIkiExcelBytes } = await import('../lib/iki/export-excel')
  const { buildIkiPdfBytes } = await import('../lib/iki/export-pdf')
  const { loadExcelJs } = await import('../lib/shared/excel-export')
  const ExcelJS = await loadExcelJs()
  const buka = async (bytes: ArrayBuffer) => { const wb = new ExcelJS.Workbook(); await wb.xlsx.load(bytes); return wb.worksheets[0] }
  const ws = await buka(await buildIkiExcelBytes(docCustom(), '2027'))
  ok('F1 Excel: kertas F4 (Folio, paperSize 14) mendatar', Number(ws.pageSetup.paperSize) === 14 && ws.pageSetup.orientation === 'landscape')
  let baris = 0
  ws.eachRow((r, i) => { if (!baris && r.getCell(2).value === 'Rencana Hasil Kerja') baris = i })
  ok('F2 Excel: kepala tabel tertulis', baris > 0)
  const merges = (ws.model as { merges?: string[] }).merges ?? []
  ok('F3 Excel: gabungan kepala ikut (No. 2 baris, Target TW 4 kolom)', merges.includes(`A${baris}:A${baris + 1}`) && merges.includes(`C${baris}:F${baris}`), merges.join(','))
  const kp = ws.getCell(baris, 3)
  ok('F4 Excel: kepala abu IKI + tebal + tengah', (kp.fill as { fgColor?: { argb?: string } }).fgColor?.argb === `FF${WARNA_KEPALA_IKI}` && kp.font?.bold === true && kp.alignment?.horizontal === 'center')
  ok('F5 Excel: teks tegak diputar 90°', ws.getCell(baris + 1, 7).alignment?.textRotation === 90)
  ok('F6 Excel: 20 kolom tabel, kolom terakhir terisi kepala', ws.getCell(baris + 1, 20).value === 'Kolom 20' && !ws.getCell(baris + 1, 21).value)
  ok('F7 Excel: rumus = angka hasil, galat = "—", nomor otomatis', ws.getCell(baris + 4, 3).value === '15' && ws.getCell(baris + 3, 4).value === '—' && ws.getCell(baris + 2, 1).value === '1')
  ok('F8 Excel: baris JUMLAH bergaris atas tebal (medium), baris biasa tipis', ws.getCell(baris + 4, 2).border?.top?.style === 'medium' && ws.getCell(baris + 3, 2).border?.top?.style === 'thin')
  ok('F9 Excel: sel tertutup gabungan ikut bergaris di tepi gabungan', ws.getCell(baris, 6).border?.right?.style === 'thin' && ws.getCell(baris + 1, 1).border?.bottom?.style === 'thin')
  let ttd = false
  ws.eachRow(r => r.eachCell(c => { if (c.value === 'UJI Pegawai') ttd = true }))
  ok('F10 Excel: blok tanda tangan pegawai ada', ttd)
  const a4 = await buka(await buildIkiExcelBytes(docCustom({ tabel_custom: { ...tabel20(), kertas: 'A4' } }), '2027'))
  ok('F11 Excel: kertas A4 = paperSize 9', Number(a4.pageSetup.paperSize) === 9)
  const sempit = await buka(await buildIkiExcelBytes(docCustom({ tabel_custom: bacaTabelCustom({ kolom: ['A', 'B'], headerRows: 1, rows: [[{ v: 'A' }, { v: 'B' }], [{ v: 'isi' }, { v: '' }]] }) }), '2027'))
  ok('F12 Excel: tabel 2 kolom tetap punya kop & Data Pribadi utuh (gabungan minimal 6 kolom)', (sempit.model as { merges?: string[] }).merges?.includes('A1:F1') === true)
  // jsPDF menulis ukuran halaman dgn desimal panjang (935.4330708661418612) — dibandingkan sebagai angka.
  const halaman = (p: string) => (/\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/.exec(p) ?? []).slice(1).map(Number)
  const pdf = Buffer.from(await buildIkiPdfBytes(docCustom())).toString('latin1')
  const [lebarF4, tinggiF4] = halaman(pdf)
  ok('F13 PDF: kertas F4 mendatar (330 × 215 mm = 935,43 × 609,45 pt)', Math.abs(lebarF4 - 935.43) < 0.01 && Math.abs(tinggiF4 - 609.45) < 0.01, `${lebarF4} × ${tinggiF4}`)
  ok('F14 PDF: isi tabel, rumus, teks tegak & tanda tangan tercetak', pdf.includes('(RHK satu)') && pdf.includes('(15)') && pdf.includes('(Tegak)') && pdf.includes('(UJI Pegawai)'))
  const pdfA4 = Buffer.from(await buildIkiPdfBytes(docCustom({ tabel_custom: { ...tabel20(), kertas: 'A4' } }))).toString('latin1')
  const [lebarA4, tinggiA4] = halaman(pdfA4)
  ok('F15 PDF: kertas A4 mendatar', Math.abs(lebarA4 - 841.89) < 0.01 && Math.abs(tinggiA4 - 595.28) < 0.01, `${lebarA4} × ${tinggiA4}`)
  const kosong = await coba(() => buildIkiPdfBytes(docCustom({ tabel_custom: tabelCustomAwal() })))
  ok('F16 tabel kosong ditolak pengekspor dengan kalimat yang sama dengan zip', kosong instanceof Error && kosong.message.includes('Tabel belum berisi'))
}

console.log('\nG. Sambungan layar & route')
{
  const te = tanpaKomentar(sumber('components/tabel/TabelEditor.tsx'))
  const ed = tanpaKomentar(sumber('app/(dashboard)/iki/[id]/editor-client.tsx'))
  const daftar = tanpaKomentar(sumber('app/(dashboard)/iki/iki-client.tsx'))
  const data = tanpaKomentar(sumber('lib/data/iki.ts'))
  ok('G1 editor bersama: batas kolom dari prop di sisip, tempel, "+ Kolom", menu & tempelan HTML', !/BATAS_KOLOM_TABEL(?!,| =|\s*\})/.test(te.replace(/batasKolom = BATAS_KOLOM_TABEL/, ''))
    && te.includes('if (ncol + n > batasKolom)') && te.includes('Math.min(kurang, batasKolom - ncol)') && te.includes('disabled={ncol >= batasKolom || terkait}') && te.includes('htmlKeSel(html, batasKolom)'))
  ok('G2 editor bersama: "Simpan Tabel" hanya bila ada onSave (IKI satu tombol Simpan, §9.4)', te.includes('{onSave && <PrimaButton'))
  ok('G3 onUbah: isi saat dibuka jadi patokan, tidak dilaporkan', te.includes('if (sidikTerlaporRef.current === null) { sidikTerlaporRef.current = sidik; return; }') && te.includes('if (sidik === sidikTerlaporRef.current) return;'))
  ok('G4 fitur khas LKJIP hanya lewat prop lkjip (judul, sumber, Hubungkan)', te.includes('{lkjip && <input className="lk-tabel-judul"') && te.includes('{lkjip && (!readOnly || atur.sumber.trim())') && te.includes('{!terkait && lkjip && ('))
  // \s: `useRef<TabelEditorHandle>` juga diawali '<TabelEditor'.
  const tagEditor = (/<TabelEditor\s[\s\S]*?\/>/.exec(ed) ?? [''])[0]
  ok('G5 IKI: editor dengan batas 24, kertas, onUbah — TANPA onSave', tagEditor.includes('batasKolom={BATAS_KOLOM_IKI}') && tagEditor.includes('onUbah={ubahTabel}') && !tagEditor.includes('onSave') && tagEditor.includes('kertas={{ px: lebarTulisPx(kertas)'))
  ok('G6 IKI simpan: tabel ikut, RHK kosong untuk CUSTOM', ed.includes('rhk: isCustom ? [] : doc.rhk,') && ed.includes('tabel_custom: isCustom ? doc.tabel_custom : null,'))
  ok('G7 IKI: varian CUSTOM tidak bisa dipilih ulang di editor', ed.includes('<select value="CUSTOM" disabled>') && !/<option value="CUSTOM">CUSTOM \(tabel sendiri\)<\/option>[\s\S]{0,40}<option value="STANDAR"/.test(ed))
  ok('G8 IKI: kertas dipertahankan saat editor melaporkan perubahan', ed.includes('const luar = bacaTabelCustom(d.tabel_custom);')
    && ed.includes('tabel_custom: { ...(p as object), kertas: luar.kertas,'))
  ok('G9 zip & tombol unduh: satu aturan "boleh dicetak"', daftar.includes('if (!json.ok || alasanTakBisaCetak(json.data)) { skipped++; continue; }')
    && tanpaKomentar(sumber('lib/iki/export-pdf.ts')).includes('const alasan = alasanTakBisaCetak(doc);') && tanpaKomentar(sumber('lib/iki/export-excel.ts')).includes('const alasan = alasanTakBisaCetak(doc);'))
  ok('G10 buat IKI: templat hanya dikirim untuk CUSTOM; pilih pejabat Direktur tidak menukar Custom', daftar.includes("templat_id: form.varian === 'CUSTOM' ? form.templat_id : null")
    && daftar.includes("varian: f.varian !== 'CUSTOM' && p.jabatan?.trim().toUpperCase() === 'DIREKTUR'"))
  ok('G11 Impor Excel tidak menawarkan timpa dokumen CUSTOM', tanpaKomentar(sumber('app/(dashboard)/iki/ImportIkiModal.tsx')).includes("dupRow.status === 'DRAFT' && dupRow.varian !== 'CUSTOM' && timpa"))
  ok('G12 server: tukar CUSTOM ⇄ lainnya ditolak di saveDokumen', data.includes("if ((current.varian === 'CUSTOM') !== (input.varian === 'CUSTOM')) throw new IkiVarianTerkunciError();"))
  ok('G13 route simpan memetakan galat varian ke 409 VARIAN_TERKUNCI', sumber('app/api/iki/[id]/route.ts').includes("code: 'VARIAN_TERKUNCI'"))
  const rute = tanpaKomentar(sumber('app/api/iki/templat/route.ts'))
  ok('G14 route templat: tiap handler lewat guard() modul IKI lebih dulu', (rute.match(/const g = await guard\(\);\n\s+if \(!g\.ok\) return g\.res;/g) ?? []).length === 4)
  ok('G15 LKJIP: editor memberi modal tautan lewat prop, CSS tabel satu sumber', tanpaKomentar(sumber('app/(dashboard)/lkjip/[id]/editor-client.tsx')).includes('lkjip={{ tahunDokumen, TautanModal }}')
    && sumber('app/(dashboard)/lkjip/[id]/editor-client.tsx').includes('${TABEL_CSS}')
    // SATU anak teks di <style>: dua anak dirangkai beda oleh SSR & klien → hydration mismatch (terbukti di layar).
    && ed.includes('<style>{isCustom ? ED_CSS + TABEL_CSS : ED_CSS}</style>'))
  // 'auto' memeras tabel yang lebih lebar dari wadahnya (IKI 20 kolom tampil 17 px/kolom, LKJIP 5 × 140 → 107–122 px).
  ok('G16 editor bersama: tabel selebar jumlah kolomnya (bergulir), bukan diperas ke lebar wadah', te.includes("style={{ tableLayout: 'fixed', width: 38 + lebarTotal }}"))
}

console.log('\nH. MySQL sungguhan (kotak pasir 2094–2095)')
let c: mysql.Connection | null = null
try {
  c = await mysql.createConnection({
    host: process.env.MYSQL_HOST, port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER, password: process.env.MYSQL_PASSWORD, database: process.env.MYSQL_DATABASE,
  })
} catch (e) {
  console.log(`DILEWATI bagian DB: MySQL tidak bisa dihubungi (${(e as { code?: string }).code ?? e})`)
}
const NAMA = 'UJI-CUSTOM'
if (c) {
  const k = c
  const bersih = async () => {
    await k.query("DELETE FROM iki_dokumen WHERE tahun IN ('2094','2095') AND nama LIKE ?", [`${NAMA}%`])
    await k.query('DELETE FROM iki_templat WHERE nama LIKE ?', [`${NAMA}%`])
  }
  await bersih()
  const D = await import('../lib/data/iki')
  const [u] = await k.query('SELECT id FROM users ORDER BY id LIMIT 1') as [Array<{ id: number }>, unknown]
  const userId = Number(u[0]?.id ?? 0)
  const simpanDgn = (doc: Awaited<ReturnType<typeof D.getDokumen>>, ubah: Record<string, unknown>) => D.saveDokumen(doc!.id, {
    expected_version: doc!.version, varian: doc!.varian, jenis: doc!.jenis, opd: doc!.opd || 'RSJD', nama: doc!.nama, nip: doc!.nip,
    jabatan: doc!.jabatan, kota_ttd: doc!.kota_ttd, rhk: [], tabel_custom: doc!.tabel_custom as never, ...ubah,
  } as never, userId)
  try {
    const idBawaan = await D.createDokumen({ tahun: '2094', varian: 'CUSTOM', jenis: 'MURNI', nama: `${NAMA} A`, nip: 'UJI-C1', jabatan: 'KASI UJI A' }, userId)
    const bawaan = await D.getDokumen(idBawaan)
    ok('H1 Buat CUSTOM tanpa templat → bentuk bawaan tersimpan, templat_id kosong', bawaan?.varian === 'CUSTOM' && bawaan.templat_id === null
      && JSON.stringify(bacaTabelCustom(bawaan.tabel_custom)) === JSON.stringify(tabelCustomAwal()))

    const t20 = tabel20()
    const idTpl = await D.buatTemplat(`${NAMA} 20 kolom`, bentukTemplat(t20, false), userId)
    const daftarTpl = await D.listTemplat()
    const barisTpl = daftarTpl.find(t => t.id === idTpl)
    ok('H2 templat tersimpan & terdaftar (20 kolom, kepala + 1 baris pola)', Number(barisTpl?.ncol) === 20 && Number(barisTpl?.nrow) === 3, JSON.stringify(barisTpl))
    const kembar = await coba(() => D.buatTemplat(`${NAMA} 20 kolom`, t20, userId))
    ok('H3 nama templat kembar ditolak dengan kalimat ramah', kembar instanceof D.IkiTemplatNamaDipakaiError)

    const idDariTpl = await D.createDokumen({ tahun: '2094', varian: 'CUSTOM', jenis: 'MURNI', nama: `${NAMA} B`, nip: 'UJI-C2', jabatan: 'KASI UJI B', templat_id: idTpl }, userId)
    const dariTpl = await D.getDokumen(idDariTpl)
    ok('H4 Buat dari templat → tabel = salinan templat, templat_id dicatat', dariTpl?.templat_id === idTpl
      && JSON.stringify(bacaTabelCustom(dariTpl.tabel_custom)) === JSON.stringify(bacaTabelCustom(bentukTemplat(t20, false))))
    const hilang = await coba(() => D.createDokumen({ tahun: '2094', varian: 'CUSTOM', nama: `${NAMA} X`, nip: 'UJI-CX', jabatan: 'X', templat_id: 999999999 }, userId))
    ok('H5 templat yang tidak ada → IkiTemplatTidakAdaError, dokumen tidak dibuat', hilang instanceof D.IkiTemplatTidakAdaError)

    const v1 = await simpanDgn(dariTpl, { tabel_custom: t20 })
    const disimpan = await D.getDokumen(idDariTpl)
    ok('H6 simpan tabel 20 kolom F4 (CAS versi naik)', v1 === dariTpl!.version + 1 && bacaTabelCustom(disimpan!.tabel_custom).kolom.length === 20
      && bacaTabelCustom(disimpan!.tabel_custom).kertas === 'F4' && bacaTabelCustom(disimpan!.tabel_custom).rows[3]?.[3]?.v === '=C4/0')
    const list = await D.listDokumen('2094') as Array<{ id: number; jumlah_rhk: number; varian: string }>
    ok('H7 daftar: "jumlah" CUSTOM = baris badan tabel', Number(list.find(r => r.id === idDariTpl)?.jumlah_rhk) === 3 && Number(list.find(r => r.id === idBawaan)?.jumlah_rhk) === 3)

    await D.ubahNamaTemplat(idTpl, `${NAMA} 20 kolom (revisi)`, userId)
    await k.query('UPDATE iki_templat SET payload = ? WHERE id = ?', [JSON.stringify(tabelCustomAwal()), idTpl])
    await D.hapusTemplat(idTpl)
    const tetap = await D.getDokumen(idDariTpl)
    ok('H8 mengubah lalu menghapus templat tidak menyentuh dokumen yang dibuat darinya', bacaTabelCustom(tetap!.tabel_custom).kolom.length === 20)
    const hapusLagi = await coba(() => D.hapusTemplat(idTpl))
    ok('H9 hapus templat yang sudah tidak ada → IkiTemplatTidakAdaError', hapusLagi instanceof D.IkiTemplatTidakAdaError)

    const keStandar = await coba(() => simpanDgn(tetap, { varian: 'STANDAR', tabel_custom: null, nama_atasan: 'A', jabatan_atasan: 'B' }))
    ok('H10 CUSTOM → STANDAR ditolak (tabel tidak dibuang diam-diam)', keStandar instanceof D.IkiVarianTerkunciError
      && bacaTabelCustom((await D.getDokumen(idDariTpl))!.tabel_custom).kolom.length === 20)
    const [std] = await k.query(`INSERT INTO iki_dokumen (tahun, varian, jenis, nama, nip, jabatan, created_by, updated_by) VALUES ('2094','STANDAR','MURNI',?,?,?,?,?)`,
      [`${NAMA} S`, 'UJI-C3', 'KASI UJI S', userId, userId]) as [{ insertId: number }, unknown]
    const dokStd = await D.getDokumen(std.insertId)
    const keCustom = await coba(() => simpanDgn(dokStd, { varian: 'CUSTOM', tabel_custom: t20 }))
    ok('H11 STANDAR → CUSTOM ditolak', keCustom instanceof D.IkiVarianTerkunciError && (await D.getDokumen(std.insertId))?.varian === 'STANDAR')

    const dup = await D.duplicateDokumen(idDariTpl, '2095', userId, 'MURNI')
    const dupDok = await D.getDokumen(dup.id)
    ok('H12 duplikat ke tahun lain membawa tabel & jejak templat', dupDok?.varian === 'CUSTOM' && dupDok.templat_id === idTpl
      && JSON.stringify(dupDok.tabel_custom) === JSON.stringify((await D.getDokumen(idDariTpl))!.tabel_custom))

    const sebelum = await D.getDokumen(idDariTpl)
    await D.snapshotVersi(idDariTpl, 'FINALIZE', userId)
    await simpanDgn(sebelum, { tabel_custom: tabelCustomAwal() })
    const [vr] = await k.query('SELECT id FROM iki_versi WHERE dokumen_id = ? ORDER BY versi_ke DESC LIMIT 1', [idDariTpl]) as [Array<{ id: number }>, unknown]
    await D.restoreVersi(idDariTpl, vr[0].id, userId)
    const pulih = await D.getDokumen(idDariTpl)
    ok('H13 pulihkan versi mengembalikan tabelnya', JSON.stringify(pulih?.tabel_custom) === JSON.stringify(sebelum?.tabel_custom))

    const g = (await import('../lib/iki/export-excel'))
    const bytes = await coba(() => g.buildIkiExcelBytes(pulih as never, '2094'))
    ok('H14 dokumen dari DB langsung bisa diunduh Excel', !(bytes instanceof Error) && (bytes as ArrayBuffer).byteLength > 1000)
  } finally {
    await bersih()
    const [sisa] = await k.query("SELECT (SELECT COUNT(*) FROM iki_dokumen WHERE tahun IN ('2094','2095')) AS d, (SELECT COUNT(*) FROM iki_templat WHERE nama LIKE ?) AS t", [`${NAMA}%`]) as [Array<{ d: number; t: number }>, unknown]
    ok('H15 kotak pasir bersih', Number(sisa[0].d) === 0 && Number(sisa[0].t) === 0, JSON.stringify(sisa[0]))
    await k.end()
  }
}

console.log(`\n${lulus} lulus, ${gagal.length} gagal`)
if (gagal.length) { console.log(gagal.map(g => `  - ${g}`).join('\n')); process.exit(1) }
process.exit(0)
