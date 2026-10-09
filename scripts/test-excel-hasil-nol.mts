// scripts/test-excel-hasil-nol.mts — pembaca Excel tidak boleh kehilangan hasil rumus bernilai 0.
//
// `cell.value` exceljs membuang `result` rumus yang hasilnya 0 (getter menyalin model lewat
// `if (value)`), padahal `cell.result` masih memegangnya. Dulu dibereskan di impor DPA saja;
// 10 pembaca lain (E-Anggaran ×5, Renaksi ×2, IKI, PK, Master Akun/Kode Besar) masih memakai
// `cell.value` mentah — terbaca kosong, bulan bernilai 0 lenyap, atau "[object Object]".
//   A. penolong bersama `lib/shared/excel-sel.ts` pada workbook SUNGGUHAN (tulis → baca)
//   B. pembaca yang API-nya bisa dipanggil langsung, berkasnya memuat rumus ber-hasil 0
//   C. pagar: tiap berkas yang memuat workbook (`xlsx.load`) tidak membaca `.value` sel mentah
//
// USAGE: npx tsx scripts/test-excel-hasil-nol.mts

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import ExcelJSMod from 'exceljs'
import { nilaiSelExcel, polosSelExcel } from '../lib/shared/excel-sel'
import { readXlsxAsAoa } from '../lib/shared/excel-export'
import { parsePendapatanBuffer } from '../lib/data/kinerja-import'
import { readGrid } from '../lib/renaksi/grid'
import { bacaGridDpa } from '../lib/blud/import-dpa-grid'

const ExcelJS = ((ExcelJSMod as unknown as { default?: typeof ExcelJSMod }).default ?? ExcelJSMod)
const AKAR = join(import.meta.dirname, '..')
function kode(isi: string): string {
  return isi.replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

let lulus = 0
let gagal = 0
function cek(nama: string, syarat: boolean, catatan = '') {
  if (syarat) { lulus++; console.log(`  ok    ${nama.padEnd(76)} ${catatan}`) }
  else        { gagal++; console.log(`  GAGAL ${nama.padEnd(76)} ${catatan}`) }
}

/** Tulis workbook lalu baca balik — exceljs baru membuang hasil 0 SESUDAH dimuat dari berkas. */
async function bolakBalik(isi: (ws: ExcelJSMod.Worksheet) => void, nama = 'Data'): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  isi(wb.addWorksheet(nama))
  return Buffer.from(await wb.xlsx.writeBuffer())
}
async function muat(buf: Buffer): Promise<ExcelJSMod.Worksheet> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buf as unknown as ArrayBuffer)
  return wb.worksheets[0]
}

// ─── A. Penolong bersama ─────────────────────────────────────────────────────
console.log('\n── A. nilaiSelExcel / polosSelExcel ──')
{
  const ws = await muat(await bolakBalik(s => {
    s.getCell('A1').value = { formula: '1-1', result: 0 }
    s.getCell('A2').value = { formula: '2+3', result: 5 }
    s.getCell('A3').value = { richText: [{ text: '5.1' }, { text: '.02' }] }
    s.getCell('A4').value = { text: 'Tautan', hyperlink: 'https://contoh.test' }
    s.getCell('A5').value = 42
    s.getCell('A6').value = { formula: 'A1&""', result: '' }
    s.getCell('A7').value = { formula: '1/0', result: { error: '#DIV/0!' } }
    s.getCell('A8').value = { formula: '"5."&"1"', result: '5.1' }
  }))
  const mentah = ws.getCell('A1').value as unknown as Record<string, unknown>
  cek('A0 premis: exceljs memang membuang hasil 0 dari cell.value', !('result' in mentah) && ws.getCell('A1').result === 0,
    JSON.stringify(mentah))
  const a1 = nilaiSelExcel(ws.getCell('A1')) as { result?: unknown }
  cek('A1 nilaiSelExcel memulihkan hasil 0', a1.result === 0)
  cek('A2 hasil bukan-nol tidak diubah', (nilaiSelExcel(ws.getCell('A2')) as { result?: unknown }).result === 5)
  cek('A3 polos: rumus ber-hasil 0 → 0', polosSelExcel(ws.getCell('A1')) === 0)
  cek('A4 polos: richText digabung', polosSelExcel(ws.getCell('A3')) === '5.1.02')
  cek('A5 polos: hyperlink → teksnya', polosSelExcel(ws.getCell('A4')) === 'Tautan')
  cek('A6 polos: angka biasa apa adanya', polosSelExcel(ws.getCell('A5')) === 42)
  cek('A7 polos: sel galat → null, bukan objek', polosSelExcel(ws.getCell('A7')) === null)
  cek('A8 polos: rumus teks → hasilnya', polosSelExcel(ws.getCell('A8')) === '5.1')
  cek('A9 polos: sel kosong → null', polosSelExcel(ws.getCell('B9')) === null)
}

// ─── B. Pembaca ──────────────────────────────────────────────────────────────
console.log('\n── B. Pembaca dengan rumus ber-hasil 0 ──')
{
  // E-Anggaran Pendapatan, layout SIMPLE: Maret realisasinya rumus = 0. Dulu cellNum(objek)
  // → null → baris Maret dilewati diam-diam; dengan 6 bulan, berkasnya malah tak dikenali.
  const pend = await parsePendapatanBuffer(await bolakBalik(s => {
    s.addRow(['Bulan', 'Target', 'Realisasi'])
    const bulan = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni']
    bulan.forEach((b, i) => s.addRow([b, 1000, b === 'Maret' ? { formula: 'B4-1000', result: 0 } : 900 + i]))
  }))
  const maret = pend.months.find(m => m.bulan_ke === 3)
  cek('B1 Pendapatan: bulan berealisasi rumus 0 TIDAK lenyap', maret?.realisasi === 0, JSON.stringify(maret ?? pend.warnings))
  cek('B2 … keenam bulan terbaca', pend.months.length === 6, `${pend.months.length}`)

  // Renaksi: rumus ber-hasil 0 dulu jadi teks "[object Object]" di grid.
  const g = await readGrid(await bolakBalik(s => {
    s.addRow(['Indikator', 'Satuan', 'Target'])
    s.addRow(['Indikator uji', '%', { formula: '5-5', result: 0 }])
    s.addRow(['Indikator dua', '%', { formula: '2*4', result: 8 }])
  }), 'renaksi.xlsx')
  cek('B3 Renaksi: hasil 0 terbaca "0", bukan "[object Object]"', g.grid[1]?.[2] === '0', JSON.stringify(g.grid[1]))
  cek('B4 … hasil bukan-nol tetap', g.grid[2]?.[2] === '8')

  // Master Akun / Kode Besar: `String(r[0])` atas objek sel = "[object Object]".
  const buf = await bolakBalik(s => {
    s.addRow(['Kode', 'Uraian'])
    s.addRow([{ formula: '"5."&"1"', result: '5.1' }, { richText: [{ text: 'Belanja ' }, { text: 'Pegawai' }] }])
    s.addRow(['5.2', { formula: 'A1&"x"', result: 'Kodex' }])
  })
  const aoa = await readXlsxAsAoa(new File([new Uint8Array(buf)], 'master.xlsx'))
  cek('B5 readXlsxAsAoa: kode berumus → teks hasilnya', aoa[1]?.[0] === '5.1', JSON.stringify(aoa[1]))
  cek('B6 … uraian richText → teks', aoa[1]?.[1] === 'Belanja Pegawai')
  cek('B7 … tidak ada "[object Object]" di mana pun', !JSON.stringify(aoa).includes('object Object'))

  // DPA (sudah benar sejak 2026-10-02) — kini lewat penolong yang sama, angka tetap terbaca.
  const dpa = await bacaGridDpa(await bolakBalik(s => {
    s.addRow(['Kode Rekening', 'Uraian', 'Jumlah'])
    s.addRow(['5.1', 'Uji', { formula: '0*1', result: 0 }])
  }))
  cek('B8 DPA: hasil rumus 0 tetap angka 0', dpa.sel(2, 3).angka === 0, JSON.stringify(dpa.sel(2, 3)))
}

// ─── C. Pagar: tak ada lagi `.value` sel mentah ──────────────────────────────
console.log('\n── C. Pembaca workbook tidak membaca .value mentah ──')
{
  const berkas: string[] = []
  const jelajah = (dir: string) => {
    for (const n of readdirSync(dir)) {
      const p = join(dir, n)
      if (statSync(p).isDirectory()) { if (n !== 'node_modules' && !n.startsWith('.')) jelajah(p) }
      else if (/\.(ts|tsx)$/.test(n)) berkas.push(p)
    }
  }
  for (const d of ['lib', 'app', 'components']) jelajah(join(AKAR, d))
  const pembaca = berkas.filter(p => kode(readFileSync(p, 'utf8')).includes('xlsx.load('))
  cek('C1 pembaca workbook ditemukan (pagar tidak memeriksa ruang kosong)', pembaca.length >= 10, `${pembaca.length} berkas`)
  // Penugasan (`… .value = x`) itu MENULIS, bukan membaca — berkas yang sama sering memuat
  // eksporter juga. Pengecualian baca dicantumkan per baris PERSIS dengan alasannya, jadi
  // begitu barisnya berubah ia ikut diperiksa lagi.
  const POLA = /getCell\([^)]*\)\.value\b(?!\s*=[^=])|\bcell\.value\b(?!\s*=[^=])|\brow\.values\b/
  const BOLEH: Record<string, string[]> = {
    // penulis `addSheetFromAoa`: memformat sel yang baru diisinya sendiri, bukan berkas unggahan
    'lib/shared/excel-export.ts': ["if (typeof cell.value === 'number') cell.numFmt = f;"],
  }
  for (const p of pembaca) {
    const rel = relative(AKAR, p).replace(/\\/g, '/')
    const k = kode(readFileSync(p, 'utf8'))
    const hit = k.split('\n').filter(l => POLA.test(l) && !(BOLEH[rel] ?? []).includes(l.trim()))
    cek(`C· ${rel}`, hit.length === 0, hit[0]?.trim().slice(0, 70) ?? '')
  }
}

console.log(`\n${lulus} lulus · ${gagal} gagal`)
if (gagal) process.exit(1)
