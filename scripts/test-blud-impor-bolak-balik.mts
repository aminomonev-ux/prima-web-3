// scripts/test-blud-impor-bolak-balik.mts — Excel DPA unduhan PRIMA → Impor DPA lagi.
//
// Kenapa ada: unduhan DPA 2026 yang diimpor kembali terbaca SALAH — total
// Rp 103,27 M padahal berkasnya Rp 68,38 M, 2 akar, 17 dari 558 baris salah
// induk. Pembaca menyusun induk dari kolom Level + urutan baris (tumpukan), dan
// itu hanya benar kalau tiap anak tinggal di blok induknya. Data 2026 menyimpan
// dua baris Rp 0 di luar bloknya: "Tambahan penghasilan berdasarkan beban kerja"
// (Level 3 di antara Level 4.1) dan "Biaya jasafilm badge/TLD" (Level 1 tanpa
// induk di tengah Belanja Jasa — tumpukan memindahkan 311 baris sesudahnya ke
// bawah akar palsu itu). Rumus SUM di berkas yang sama menyebut anak tiap induk
// dengan tepat; kini rumus yang dipakai, Level cuma cadangan.
//
// Ikut dijaga:
//   • exceljs membuang hasil rumus bernilai 0 dari `cell.value` — dulu 21 baris
//     unduhan 2026 terbaca "tidak menyimpan hasil rumusnya" (alarm palsu)
//   • pagar baris sisa salin-tempel (b.108 formulir 2026) tetap menggigit walau
//     hasil 0 kini terbaca
//   • Excel Pergeseran ditolak di Impor DPA, diminta Excel DPA murni
//
// Berkasnya DIBUAT `buatWorkbookDpa`/`buatWorkbookPergeseran` yang sama dengan
// tombol Excel di menu Cetak, lalu dibaca `bacaGridDpa` + `bacaDpaDariGrid` yang
// sama dengan route impor. Tanpa berkas contoh, tanpa DB.
//
// Jalankan: npx tsx scripts/test-blud-impor-bolak-balik.mts

import type ExcelJS from 'exceljs'
import { buatWorkbookDpa, buatWorkbookPergeseran } from '../lib/blud/export/dpa-dokumen'
import { bacaGridDpa } from '../lib/blud/import-dpa-grid'
import {
  bacaDpaDariGrid, BerkasPergeseranError, StrukturDpaTidakTerbacaError, type HasilBacaDpa,
} from '../lib/blud/import-dpa'
import { recalcDpaJumlah, recalcPergeseranJumlah } from '../lib/blud/recalc'
import { loadExcelJs } from '../lib/shared/excel-export'
import type { DpaBaris, DpaBarisInput, PergeseranBaris, PergeseranBarisInput, TipeBaris } from '../types'

let lulus = 0
let gagal = 0
function cek(nama: string, syarat: boolean, catatan = '') {
  if (syarat) { lulus++; console.log(`  ok    ${nama.padEnd(60)} ${catatan}`) }
  else        { gagal++; console.log(`  GAGAL ${nama.padEnd(60)} ${catatan}`) }
}
const bab = (judul: string) => console.log(`\n── ${judul} ──`)

// ─── Data uji ────────────────────────────────────────────────────────────────

interface Spek {
  id: string
  induk: string | null
  tipe: TipeBaris
  kode: string
  uraian: string
  vol?: number
  harga?: number
}

/** Cermin DPA 2026: dua baris Rp 0 tersimpan di luar blok induknya. */
const POHON_ACAK: Spek[] = [
  { id: 'A', induk: null, tipe: 'GRANDMASTER', kode: '5',            uraian: 'BELANJA DAERAH' },
  { id: 'B', induk: 'A',  tipe: 'MASTER',      kode: '5.1',          uraian: 'BELANJA OPERASI' },
  { id: 'C', induk: 'B',  tipe: 'CHILD',       kode: '5.1.01',       uraian: 'BELANJA PEGAWAI' },
  { id: 'D', induk: 'C',  tipe: 'LEADER',      kode: '5.1.01.01',    uraian: 'GAJI DAN TUNJANGAN' },
  { id: 'E', induk: 'D',  tipe: 'MEMBER',      kode: '5.1.01.01.01', uraian: 'Gaji pokok', vol: 1, harga: 3_000_000 },
  { id: 'F', induk: 'D',  tipe: 'MEMBER',      kode: '5.1.01.01.02', uraian: 'Tunjangan keluarga', vol: 1, harga: 450_000 },
  // Penyela — Level 3 milik C, tersimpan di antara anak-anak D.
  { id: 'X', induk: 'C',  tipe: 'LEADER',      kode: '5.1.01.02',    uraian: 'Tambahan penghasilan beban kerja' },
  { id: 'G', induk: 'D',  tipe: 'MEMBER',      kode: '5.1.01.01.03', uraian: 'Iuran simpanan', vol: 2, harga: 100_000 },
  { id: 'H', induk: 'B',  tipe: 'CHILD',       kode: '5.1.02',       uraian: 'BELANJA BARANG DAN JASA' },
  { id: 'I', induk: 'H',  tipe: 'LEADER',      kode: '5.1.02.01',    uraian: 'Belanja Jasa' },
  { id: 'J', induk: 'I',  tipe: 'MEMBER',      kode: '5.1.02.01.01', uraian: 'Jasa kebersihan', vol: 1, harga: 5_000_000 },
  // Akar nyasar — Level 1 tanpa induk di tengah blok Belanja Jasa.
  { id: 'Z', induk: null, tipe: 'GRANDMASTER', kode: '',             uraian: 'Biaya jasafilm badge/TLD' },
  { id: 'K', induk: 'I',  tipe: 'MEMBER',      kode: '5.1.02.01.02', uraian: 'Iuran asuransi', vol: 1, harga: 1_000_000 },
  // Baris kosong yang SAH (tanpa uraian, tanpa kode, Rp 0) — label Level-nya
  // yang membedakannya dari sisa salin-tempel.
  { id: 'Q', induk: 'I',  tipe: 'MEMBER',      kode: '',             uraian: '' },
  { id: 'L', induk: 'I',  tipe: 'MEMBER',      kode: '5.1.02.01.03', uraian: 'Sewa peralatan', vol: 3, harga: 100_000 },
  // Sub-pohon bernilai nol: rumus SUM dan ROUND yang hasilnya 0.
  { id: 'R', induk: 'H',  tipe: 'LEADER',      kode: '5.1.02.02',    uraian: 'Belanja sewa meubel' },
  { id: 'S', induk: 'R',  tipe: 'MEMBER',      kode: '5.1.02.02.01', uraian: 'Sewa meja kursi', vol: 1, harga: 0 },
  { id: 'M', induk: 'A',  tipe: 'MASTER',      kode: '5.2',          uraian: 'BELANJA MODAL' },
  { id: 'N', induk: 'M',  tipe: 'CHILD',       kode: '5.2.02',       uraian: 'Peralatan dan mesin' },
  { id: 'O', induk: 'N',  tipe: 'LEADER',      kode: '5.2.02.01',    uraian: 'Komputer', vol: 1, harga: 7_000_000 },
]

/** Pohon yang sama dalam urutan pohon, tanpa akar nyasar & baris kosong. */
const POHON_RAPI: Spek[] = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'X', 'H', 'I', 'J', 'K', 'L', 'R', 'S', 'M', 'N', 'O']
  .map(id => POHON_ACAK.find(s => s.id === id)!)

const TOTAL = 3_000_000 + 450_000 + 200_000 + 5_000_000 + 1_000_000 + 300_000 + 7_000_000

const jangkar = (i: number) => `AK-${(i + 1).toString(16).padStart(32, '0')}`

function bangunDpa(spek: Spek[]): DpaBaris[] {
  const mentah = spek.map((s, i) => ({
    id: 0, tahun_anggaran: 2026, versi_tanggal: '2026-08-29',
    row_id: s.id, parent_id: s.induk, urutan: i, tipe_baris: s.tipe,
    kode_rekening: s.kode, uraian: s.uraian,
    vol: s.vol ?? null, satuan: s.vol != null ? 'paket' : null, harga: s.harga ?? null,
    jumlah: 0, penanggung_jawab: null, keterangan: null,
    anggaran_key: jangkar(i), origin: 'MANUAL', usulan_item_id: null, usulan_no: null,
  }))
  const hitung = recalcDpaJumlah(mentah as unknown as DpaBarisInput[])
  return mentah.map((r, i) => ({ ...r, jumlah: hitung[i].jumlah })) as unknown as DpaBaris[]
}

function bangunPergeseran(dpa: DpaBaris[]): PergeseranBaris[] {
  const input = dpa.map(r => ({
    ...r, dpa_versi_tanggal: '2026-08-29', vol_p: r.vol, harga_p: r.harga,
    pergeseran: 0, bertambah_berkurang: 0, bertambah: null, berkurang: null,
  }))
  const hitung = recalcPergeseranJumlah(input as unknown as PergeseranBarisInput[])
  return input.map((r, i) => ({
    ...r, pergeseran: hitung[i].pergeseran, bertambah_berkurang: hitung[i].bertambah_berkurang,
  })) as unknown as PergeseranBaris[]
}

// ─── Penolong ────────────────────────────────────────────────────────────────

const BARIS_DATA_1 = 7
const KOL_JUMLAH = 6
const KOL_LEVEL = 9

async function bacaBalik(wb: ExcelJS.Workbook): Promise<HasilBacaDpa> {
  const buf = Buffer.from(await wb.xlsx.writeBuffer())
  return bacaDpaDariGrid(await bacaGridDpa(buf))
}

async function cobaBaca(wb: ExcelJS.Workbook): Promise<{ hasil: HasilBacaDpa | null; galat: unknown }> {
  try { return { hasil: await bacaBalik(wb), galat: null } }
  catch (e) { return { hasil: null, galat: e } }
}

const barisDari = (spek: Spek[], id: string) => BARIS_DATA_1 + spek.findIndex(s => s.id === id)

/** Bandingkan hasil baca dengan asalnya, baris demi baris (urutan berkas = urutan asal). */
function banding(asal: DpaBaris[], h: HasilBacaDpa) {
  const urut = [...asal].sort((a, b) => a.urutan - b.urutan)
  const idx = new Map(urut.map((r, i) => [r.row_id, i]))
  const pos = new Map(h.baris.map((b, i) => [b.barisExcel, i]))
  const salah = { induk: [] as string[], tipe: [] as string[], jumlah: [] as string[], jangkar: [] as string[] }
  urut.forEach((r, i) => {
    const b = h.baris[i]
    if (!b) return
    const indukAsli = r.parent_id ? idx.get(r.parent_id)! : null
    const indukBaca = b.indukBarisExcel == null ? null : pos.get(b.indukBarisExcel) ?? null
    if (indukAsli !== indukBaca) {
      salah.induk.push(`${r.row_id}→${indukBaca == null ? '∅' : urut[indukBaca].row_id}`)
    }
    if (b.tipe_baris !== r.tipe_baris) salah.tipe.push(r.row_id)
    if (b.jumlahHitung !== Number(r.jumlah)) salah.jumlah.push(r.row_id)
    if (b.jangkar !== r.anggaran_key) salah.jangkar.push(r.row_id)
  })
  return salah
}

const indukDari = (h: HasilBacaDpa, spek: Spek[], id: string): string | null => {
  const b = h.baris.find(x => x.barisExcel === barisDari(spek, id))
  if (!b || b.indukBarisExcel == null) return null
  return spek[b.indukBarisExcel - BARIS_DATA_1]?.id ?? '?'
}

/** Semua baris sampai ke akar — tidak ada induk melingkar. */
function tanpaLingkaran(h: HasilBacaDpa): boolean {
  const induk = new Map(h.baris.map(b => [b.barisExcel, b.indukBarisExcel]))
  return h.baris.every(b => {
    let p = b.indukBarisExcel
    let n = 0
    while (p != null && n++ < 64) p = induk.get(p) ?? null
    return n < 64
  })
}

/** "Paste as values": rumus kolom Jumlah diganti hasilnya. `cell.result`, bukan
 *  `.value.result` — yang kedua kehilangan angka 0 (itu sebab perbaikan ini). */
function tempelSebagaiNilai(ws: ExcelJS.Worksheet, baris?: number[]) {
  const sasaran = baris ?? Array.from({ length: ws.rowCount }, (_, i) => i + 1)
  for (const n of sasaran) {
    const sel = ws.getRow(n).getCell(KOL_JUMLAH)
    const v = sel.value
    if (v && typeof v === 'object' && 'formula' in v) sel.value = Number(sel.result ?? 0)
  }
}

// ─── A. Kendali: pohon yang urutannya rapi ───────────────────────────────────

bab('A. Pohon berurutan — kendali')
{
  const asal = bangunDpa(POHON_RAPI)
  const h = await bacaBalik(await buatWorkbookDpa({ tahun: 2026, versi: '2026-08-29', rows: asal }))
  const s = banding(asal, h)
  cek('Jumlah baris sama', h.baris.length === asal.length, `${h.baris.length} / ${asal.length}`)
  cek('Induk, tipe, jumlah, jangkar identik',
    !s.induk.length && !s.tipe.length && !s.jumlah.length && !s.jangkar.length, JSON.stringify(s))
  cek('Total berkas = total hitung ulang', h.totalFile === TOTAL && h.totalHitung === TOTAL,
    `${h.totalFile} / ${h.totalHitung}`)
  cek('Tanpa peringatan', h.peringatan.length === 0, h.peringatan.join(' | '))
}

// ─── B. Pohon TIDAK berurut — cermin DPA 2026 ───────────────────────────────

bab('B. Pohon tidak berurut — dua baris di luar bloknya')
const asalAcak = bangunDpa(POHON_ACAK)
const wbAcak = () => buatWorkbookDpa({ tahun: 2026, versi: '2026-08-29', rows: asalAcak })
{
  const h = await bacaBalik(await wbAcak())
  const s = banding(asalAcak, h)
  cek('Jumlah baris sama (baris kosong sah ikut terbaca)', h.baris.length === asalAcak.length,
    `${h.baris.length} / ${asalAcak.length}`)
  cek('Induk tiap baris identik dengan asalnya', s.induk.length === 0, s.induk.join(', '))
  cek('Tipe tiap baris identik', s.tipe.length === 0, s.tipe.join(', '))
  cek('Jumlah tiap baris identik', s.jumlah.length === 0, s.jumlah.join(', '))
  cek('Jangkar realisasi terbawa utuh', s.jangkar.length === 0, s.jangkar.join(', '))
  cek('Anak D sesudah penyela tetap milik D', indukDari(h, POHON_ACAK, 'G') === 'D', String(indukDari(h, POHON_ACAK, 'G')))
  cek('Anak Belanja Jasa sesudah akar nyasar tetap milik I',
    indukDari(h, POHON_ACAK, 'K') === 'I' && indukDari(h, POHON_ACAK, 'L') === 'I',
    `${indukDari(h, POHON_ACAK, 'K')} · ${indukDari(h, POHON_ACAK, 'L')}`)
  cek('Belanja Modal tetap di bawah akar asli', indukDari(h, POHON_ACAK, 'M') === 'A', String(indukDari(h, POHON_ACAK, 'M')))
  cek('Total berkas = total hitung ulang', h.totalFile === TOTAL && h.totalHitung === TOTAL,
    `${h.totalFile} / ${h.totalHitung}`)
  const akar = h.baris.filter(b => b.indukBarisExcel == null).map(b => b.uraian)
  cek('Akar nyasar dilaporkan apa adanya — 2 akar, seperti datanya', akar.length === 2, akar.join(' · '))
  cek('Tidak ada baris bercatatan', h.baris.every(b => !b.catatan.length),
    h.baris.filter(b => b.catatan.length).map(b => `b.${b.barisExcel}`).join(', '))
  cek('Peringatan hanya soal 2 akar', h.peringatan.length === 1 && /2 baris tanpa induk/.test(h.peringatan[0] ?? ''),
    h.peringatan.join(' | '))
  cek('Baris kosong sah dilaporkan uraiannya kosong', h.ditahan.length === 1
    && h.ditahan[0].barisExcel === barisDari(POHON_ACAK, 'Q'), JSON.stringify(h.ditahan))
}

// ─── C. Hasil rumus bernilai 0 tetap terbaca ────────────────────────────────

bab('C. Hasil rumus 0 tidak hilang')
{
  const wb = await wbAcak()
  const grid = await bacaGridDpa(Buffer.from(await wb.xlsx.writeBuffer()))
  const selR = grid.sel(barisDari(POHON_ACAK, 'R'), KOL_JUMLAH)
  const selS = grid.sel(barisDari(POHON_ACAK, 'S'), KOL_JUMLAH)
  cek('SUM yang hasilnya 0 terbaca 0, bukan kosong', !!selR.rumus && selR.angka === 0, `${selR.rumus} → ${selR.angka}`)
  cek('ROUND yang hasilnya 0 terbaca 0, bukan kosong', !!selS.rumus && selS.angka === 0, `${selS.rumus} → ${selS.angka}`)
  const h = bacaDpaDariGrid(grid)
  cek('Semua baris membawa angka berkas', h.baris.every(b => b.jumlahFile != null),
    h.baris.filter(b => b.jumlahFile == null).map(b => `b.${b.barisExcel}`).join(', '))
  cek('Tidak ada alarm "tidak membawa angka" untuk baris bernilai 0',
    !h.peringatan.some(p => /tidak membawa angka di kolom Jumlah/.test(p)), h.peringatan.join(' | '))
  // Kendali alarm itu sendiri: sel Jumlah yang memang kosong tetap dilaporkan.
  // Tanpa ini pemeriksaan di atas lulus kosong kalau kalimatnya berganti lagi.
  const wbKosong = await wbAcak()
  wbKosong.worksheets[0].getRow(barisDari(POHON_ACAK, 'S')).getCell(KOL_JUMLAH).value = null
  const hKosong = await bacaBalik(wbKosong)
  cek('…sel Jumlah yang benar-benar kosong tetap dilaporkan',
    hKosong.peringatan.some(p => /^1 baris tidak membawa angka di kolom Jumlah/.test(p)), hKosong.peringatan.join(' | '))
}

// ─── D. Excel Pergeseran ditolak, diminta Excel DPA murni ───────────────────

bab('D. Excel Pergeseran di Impor DPA')
{
  const { galat } = await cobaBaca(await buatWorkbookPergeseran({
    tahun: 2026, versi: '2026-09-02', rows: bangunPergeseran(bangunDpa(POHON_RAPI)),
  }))
  cek('Dokumen Pergeseran ditolak', galat instanceof BerkasPergeseranError,
    galat instanceof Error ? galat.name : String(galat))
  cek('…lewat jalur 400 yang sudah ada (StrukturDpaTidakTerbacaError)', galat instanceof StrukturDpaTidakTerbacaError)
  const pesan = galat instanceof Error ? galat.message : ''
  cek('…kalimatnya menyebut sebab & jalan keluar',
    /bukan DPA murni/.test(pesan) && /hasil pergeserannya akan hilang/.test(pesan) && /Cetak → DPA BLUD/.test(pesan),
    pesan.slice(0, 60))

  const ExcelJSLib = await loadExcelJs()
  const lembar = (judul: string[], isi: ExcelJS.CellValue[][]) => {
    const wb = new ExcelJSLib.Workbook()
    const ws = wb.addWorksheet('Lembar')
    ws.addRow(judul)
    isi.forEach(r => ws.addRow(r))
    return wb
  }
  // Rekap Pergeseran menu Cetak (saringan "yang bergeser" aktif) — judulnya sama.
  const rekap = await cobaBaca(lembar(
    ['Kode Rekening', 'Uraian', 'Vol', 'Satuan', 'Harga', 'Jumlah', 'Vol P', 'Harga P', 'Pergeseran'],
    [['5.1', 'Belanja', 1, 'th', 100, 100, 1, 120, 120]],
  ))
  cek('Rekap Pergeseran (nilai statis) juga ditolak', rekap.galat instanceof BerkasPergeseranError,
    rekap.galat instanceof Error ? rekap.galat.name : 'diterima')

  // Kendali: formulir yang kebetulan punya kolom "Pergeseran" tapi bukan buatan
  // PRIMA (tanpa Vol P/Harga P) tidak boleh ikut tertolak.
  const formulir = await cobaBaca(lembar(
    ['KODE REKENING', 'URAIAN', 'VOL', 'SATUAN', 'HARGA', 'JUMLAH', 'PERGESERAN'],
    [
      ['5.1', 'BELANJA', '', '', '', { formula: 'SUM(F3:F4)', result: 300 }, ''],
      ['5.1.1', 'Belanja A', 1, 'th', 100, { formula: 'ROUND(C3*E3,0)', result: 100 }, ''],
      ['5.1.2', 'Belanja B', 2, 'th', 100, { formula: 'ROUND(C4*E4,0)', result: 200 }, ''],
    ],
  ))
  cek('Formulir berkolom "Pergeseran" tanpa Vol P/Harga P tetap terbaca',
    !formulir.galat && formulir.hasil?.baris.length === 3,
    formulir.galat instanceof Error ? formulir.galat.message.slice(0, 60) : `${formulir.hasil?.baris.length} baris`)
}

// ─── E. Cadangan Level: seluruh rumus hilang (paste as values) ──────────────

bab('E. Rumus hilang semua — kolom Level jadi cadangan')
{
  const asal = bangunDpa(POHON_RAPI)
  const wb = await buatWorkbookDpa({ tahun: 2026, versi: '2026-08-29', rows: asal })
  tempelSebagaiNilai(wb.worksheets[0])
  const h = await bacaBalik(wb)
  const s = banding(asal, h)
  cek('Pohon berurut tetap tersusun benar dari kolom Level', s.induk.length === 0 && s.tipe.length === 0,
    JSON.stringify(s))
  cek('Totalnya tetap cocok', h.totalFile === TOTAL && h.totalHitung === TOTAL, `${h.totalFile} / ${h.totalHitung}`)
  cek('Diberi tahu bahwa induknya dari Level + urutan',
    h.peringatan.some(p => new RegExp(`^${asal.length - 1} baris tidak disebut rumus`).test(p)),
    h.peringatan.join(' | '))
}

// ─── F. Satu rumus induk hilang — cadangan hanya untuk anaknya ──────────────

bab('F. Satu rumus induk hilang')
{
  const wb = await wbAcak()
  tempelSebagaiNilai(wb.worksheets[0], [barisDari(POHON_ACAK, 'N')])
  const h = await bacaBalik(wb)
  const s = banding(asalAcak, h)
  cek('Seluruh induk tetap benar', s.induk.length === 0, s.induk.join(', '))
  cek('Hanya anak N yang ditebak — dan itu dilaporkan',
    h.peringatan.some(p => /^1 baris tidak disebut rumus/.test(p)), h.peringatan.join(' | '))
}

// ─── G. Klaim rumus palsu tidak dipercaya ───────────────────────────────────

bab('G. Rumus disunting tangan mengklaim leluhurnya sendiri')
{
  const wb = await wbAcak()
  const ws = wb.worksheets[0]
  // Daun O ("Komputer", Level 3) mengaku menjumlah akar (b.7) dan Belanja Operasi (b.8).
  ws.getRow(barisDari(POHON_ACAK, 'O')).getCell(KOL_JUMLAH).value = { formula: 'SUM(F7:F8)', result: 7_000_000 }
  // Daun L (Level 3.1) mengaku menjumlah K, saudaranya — klaim tidak sah yang
  // LEBIH DEKAT dari klaim induk aslinya. Sasarannya sengaja K: K tinggal sesudah
  // akar nyasar, jadi kalau klaim sah ikut tersingkir, cadangan Level menaruhnya
  // di bawah akar palsu itu.
  ws.getRow(barisDari(POHON_ACAK, 'L')).getCell(KOL_JUMLAH).value = {
    formula: `SUM(F${barisDari(POHON_ACAK, 'K')}:F${barisDari(POHON_ACAK, 'K')})`, result: 300_000,
  }
  const h = await bacaBalik(wb)
  const s = banding(asalAcak, h)
  cek('Induk tetap benar — klaim palsu diabaikan', s.induk.length === 0, s.induk.join(', '))
  cek('Akar asli tetap akar', indukDari(h, POHON_ACAK, 'A') === null, String(indukDari(h, POHON_ACAK, 'A')))
  cek('Klaim sah tidak tersingkir klaim palsu yang lebih dekat',
    indukDari(h, POHON_ACAK, 'B') === 'A' && indukDari(h, POHON_ACAK, 'K') === 'I',
    `${indukDari(h, POHON_ACAK, 'B')} · ${indukDari(h, POHON_ACAK, 'K')}`)
  cek('Tidak ada induk melingkar', tanpaLingkaran(h))
  cek('Klaim yang ditolak dilaporkan',
    h.peringatan.some(p => /^1 baris disebut anak oleh rumus baris yang levelnya sama atau lebih dalam/.test(p)),
    h.peringatan.join(' | '))
}

// ─── H. Sisa salin-tempel bernilai 0 tetap dilewati ─────────────────────────

bab('H. Baris sisa salin-tempel (rumus saja, hasil 0)')
{
  // Bentuk formulir manual: tanpa kolom Level. Sisa salin-tempel = rumus tanpa
  // uraian & kode yang hasilnya 0 — dulu terbaca "kosong" karena exceljs membuang
  // nol-nya; kini terbaca 0, dan pagarnya harus tetap menyaringnya (b.108 2026).
  const asal = bangunDpa(POHON_RAPI)
  const wb = await buatWorkbookDpa({ tahun: 2026, versi: '2026-08-29', rows: asal })
  const ws = wb.worksheets[0]
  for (let n = 6; n < BARIS_DATA_1 + asal.length; n++) ws.getRow(n).getCell(KOL_LEVEL).value = null
  const sisa = BARIS_DATA_1 + asal.length
  ws.getRow(sisa).getCell(KOL_JUMLAH).value = { formula: `F${barisDari(POHON_RAPI, 'S')}`, result: 0 }
  const h = await bacaBalik(wb)
  cek('Tanpa kolom Level, hierarki dari rumus', h.baris[0]?.sumberHierarki === 'rumus', String(h.baris[0]?.sumberHierarki))
  cek('Baris sisa tidak ikut terbaca', h.baris.length === asal.length && !h.baris.some(b => b.barisExcel === sisa),
    `${h.baris.length} / ${asal.length}`)
  cek('Totalnya tetap cocok', h.totalFile === TOTAL && h.totalHitung === TOTAL, `${h.totalFile} / ${h.totalHitung}`)
}

console.log(`\n${lulus} pemeriksaan LULUS · ${gagal} GAGAL`)
process.exit(gagal > 0 ? 1 : 0)
