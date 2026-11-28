#!/usr/bin/env npx tsx
// scripts/test-bba-penawaran.mts — Tahap 5 revamp alur BBA: Penawaran Rekanan (per surat, Bandingkan, Ambil dari penawaran,
// impor Excel) + kolom Matriks Inventarisasi. Konsep: docs/konsep/bba/CONCEPT-bba-revamp-alur.md §5A, CONCEPT-bba-penawaran-matriks.md.
// Jalankan: npx tsx --env-file=.env.local scripts/test-bba-penawaran.mts [Matriks_Inventarisasi_Penawaran.xlsx]
// Berkas Matriks pemilik (opsional) = kalibrasi bagian F2; tanpa berkas bagian itu tidak dijalankan dan disebut.
// Bagian D memakai MySQL sungguhan (data berawalan "UJIW"), dibersihkan otomatis. Tanpa MySQL = GAGAL.
import { readFileSync } from 'node:fs'
import ExcelJS from 'exceljs'
import mysql from 'mysql2/promise'
import {
  bandingkanPenawaran, urutUntukRencana, referensiDariPenawaran, masihBerlaku, kunciSatuan, jenisBerharga, syaratSurat, cocokJenisSurat, rapikanNamaRekanan,
  kunciRekanan, saranRekananDari, gabungMerkTipe, durasiDariTeks, tambahDurasi, bacaStatusPajak, bacaTindakLanjut, JENIS_SURAT, angka, barisTempelBarang,
  type ItemPenawaran, type ItemBerharga,
} from '../lib/bba/penawaran'
import { bacaPenawaranGrid, tulisTemplatPenawaran, KOLOM_MATRIKS } from '../lib/bba/penawaran-impor'
import { bacaMatriksGrid } from '../lib/bba/penawaran-matriks'
import { KOLOM_LAPORAN, selPenawaran } from '../lib/bba/laporan-excel'
import { polosSelExcel } from '../lib/shared/excel-sel'
import { referensiSah, rapikanReferensi } from '../lib/bba/referensi'
import { PenawaranSimpanSchema } from '../lib/data/bba-penawaran-schemas'

let lulus = 0
const gagal: string[] = []
function ok(nama: string, syarat: unknown, ket = '') {
  if (syarat) { lulus++; console.log(`  ok  ${nama}`) }
  else { gagal.push(nama); console.log(`FAIL  ${nama}${ket ? ' — ' + ket : ''}`) }
}
const sumber = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
const coba = async <T,>(f: () => Promise<T>): Promise<T | Error> => { try { return await f() } catch (e) { return e as Error } }

let nid = 0
const it = (o: Partial<ItemPenawaran>): ItemPenawaran => ({
  id: ++nid, penawaran_id: 1, rekanan: 'PT A', nomor_surat: null, tgl_surat: '2026-01-10', berlaku_sampai: null, file_id: 'f'.repeat(24),
  barang_id: 1, barang_nama: 'Laptop', nama_barang: 'Laptop', merk: null, merk_tipe: null, spesifikasi: null, satuan: 'unit', harga_satuan: 100,
  status_pajak: null, tautan: null, garansi: null, ...o,
})
const ib = (o: Partial<ItemPenawaran>) => it(o) as ItemBerharga
const gridDari = (ws: ExcelJS.Worksheet) => {
  const g: unknown[][] = []
  ws.eachRow({ includeEmpty: true }, (row, r) => { const b: unknown[] = []; for (let c = 1; c <= row.cellCount; c++) b.push(polosSelExcel(row.getCell(c)) ?? ''); g[r - 1] = b })
  return Array.from(g, b => b ?? [])
}
const HARI = '2026-06-01'

console.log('A. Aturan penawaran')
ok('A1 berlaku: tanpa batas = berlaku, hari terakhir masih berlaku', masihBerlaku(null, HARI) && masihBerlaku(HARI, HARI) && !masihBerlaku('2026-05-31', HARI))
ok('A2 satuan dibandingkan tanpa beda huruf/spasi, kosong = unit', kunciSatuan(' Unit ') === 'unit' && kunciSatuan(null) === 'unit' && kunciSatuan('Paket') === 'paket')
{
  const items = [
    it({ rekanan: 'PT A', harga_satuan: 120, tgl_surat: '2026-01-01' }), it({ rekanan: 'PT A', harga_satuan: 110, tgl_surat: '2026-03-01' }),
    it({ rekanan: 'PT A', harga_satuan: 90, tgl_surat: '2026-04-01', berlaku_sampai: '2026-04-30' }),
    it({ rekanan: 'PT B', harga_satuan: 105 }), it({ rekanan: 'PT C', harga_satuan: 80, berlaku_sampai: '2026-02-01' }),
    it({ rekanan: 'PT B', harga_satuan: 300, satuan: 'paket' }), it({ barang_id: null, nama_barang: 'Printer' }),
  ]
  const b = bandingkanPenawaran(items, HARI)
  const unit = b.baris.find(x => x.satuan === 'unit')!
  ok('A3 sel = penawaran TERBARU yang masih berlaku (PT A 110, bukan 90 yang lebih baru tapi kedaluwarsa)', unit.sel['PT. A'].item.harga_satuan === 110 && unit.sel['PT. A'].berlaku)
  ok('A4 rekanan yang semua penawarannya kedaluwarsa tetap tampil, tapi tidak termurah & tidak ikut rata-rata', !unit.sel['PT. C'].berlaku && !unit.sel['PT. C'].termurah && unit.rata === Math.round((110 + 105) / 2))
  ok('A5 termurah = PT B 105 (yang berlaku)', unit.sel['PT. B'].termurah && !unit.sel['PT. A'].termurah)
  ok('A6 satuan beda = baris terpisah; item tanpa barang dikumpulkan terpisah', b.baris.length === 2 && b.baris.some(x => x.satuan === 'paket') && b.belumDitautkan.length === 1 && unit.jumlah === 5)
  const urut = urutUntukRencana(items.filter(i => i.barang_id === 1 && kunciSatuan(i.satuan) === 'unit'), HARI)
  ok('A7 "Ambil dari penawaran": yang berlaku dulu, termurah di atas; kedaluwarsa di bawah', urut[0].harga_satuan === 105 && urut.at(-1)!.berlaku === false)
}
{
  const r = referensiDariPenawaran(ib({ rekanan: 'CV Medika', merk_tipe: 'X-1', harga_satuan: 5000, tgl_surat: '2026-02-02' }))
  const tanpa = referensiDariPenawaran(ib({ file_id: null }))
  ok('A8 salinan referensi: penyedia = rekanan (dirapikan), tanggal = tanggal surat, berkas surat, jejak id; tanpa berkas & tanpa link belum sah',
    r.nama_penyedia === 'CV. Medika' && r.tgl_cek === '2026-02-02' && r.merk_tipe === 'X-1' && !!r.penawaran_item_id && referensiSah(r) && !referensiSah(tanpa))
  ok('A9 rapikanReferensi membawa jejak penawaran (dan tidak menambah kunci kosong untuk referensi biasa)', rapikanReferensi([r])[0].penawaran_item_id === r.penawaran_item_id
    && !('penawaran_item_id' in rapikanReferensi([{ ...r, penawaran_item_id: null }])[0]))
}

console.log('\nB. Impor Excel')
{
  const wb = new ExcelJS.Workbook(); tulisTemplatPenawaran(wb, { jenis: JENIS_SURAT, pajak: ['Termasuk PPN'], status: ['Perlu telaah teknis & anggaran'] })
  const buf = await wb.xlsx.writeBuffer(); const wb2 = new ExcelJS.Workbook(); await wb2.xlsx.load(buf as ArrayBuffer)
  const ws = wb2.worksheets[0]
  const kosong = bacaMatriksGrid(gridDari(ws))
  const kepala = gridDari(ws).findIndex(b => b.includes('Nama Rekanan / Vendor'))
  ws.getRow(kepala + 2).values = [1, '2026-11-05', '161/SPH', 'Penawaran Harga (SPH)', 'PT Contoh', 'Budi', 'Belanja Modal Alat Kedokteran', 'CT Scan', 'GE', '128 Slice', 'DICOM', 'Unit', 12_500_000, 'Termasuk PPN', 'https://katalog.inaproc.id/x', '3 Tahun', '14 hari', '', 'Perlu telaah teknis & anggaran']
  const h = bacaMatriksGrid(gridDari(ws))!
  ok('B1 templat Matriks (berkop, kepala baris 7, tanpa baris contoh) terbaca balik; kosong = "tidak ada baris surat"', kosong !== null && kosong.surat.length === 0 && kosong.masalah.length === 1
    && kepala === 6 && h.surat.length === 1 && h.surat[0].item[0].harga_satuan === 12_500_000 && h.surat[0].item[0].merk === 'GE' && h.surat[0].item[0].merk_tipe === '128 Slice'
    && h.surat[0].kepala.berlaku_sampai === '2026-11-19' && h.surat[0].kepala.status_tindak_lanjut === 'PERLU_TELAAH' && h.surat[0].item[0].status_pajak === 'TERMASUK'
    && ws.getCell(`D${kepala + 2}`).dataValidation?.type === 'list', JSON.stringify(h))
  const polos = bacaPenawaranGrid([['Nama Barang', 'Satuan', 'Harga'], ['Kursi roda', 'unit', 'Rp 2.450.000'], ['Tensimeter', '', '1.250.000,50'], ['Tanpa harga', 'unit', ''], ['', '', '']])
  ok('B2 berkas polos: harga gaya Indonesia dibaca, baris tanpa harga dilewati & disebut', polos.item.length === 2 && polos.item[0].harga_satuan === 2_450_000
    && polos.item[1].harga_satuan === 1_250_000.5 && polos.dilewati.length === 1 && polos.dilewati[0].includes('Tanpa harga'))
  ok('B3 tanpa kolom nama & harga → ditolak dengan petunjuk templat', bacaPenawaranGrid([['A', 'B'], ['x', 'y']]).masalah[0]?.includes('templat'))
}

console.log('\nC. Skema, route, layar')
ok('C1 skema: surat berharga minimal satu item, harga > 0, berlaku tidak sebelum tanggal surat, barang_id XOR barang_baru', !PenawaranSimpanSchema.safeParse({ kepala: { rekanan: 'A', tgl_surat: '2026-01-02' }, item: [] }).success
  && !PenawaranSimpanSchema.safeParse({ kepala: { rekanan: 'A', tgl_surat: '2026-01-02', berlaku_sampai: '2026-01-01' }, item: [{ nama_barang: 'x', harga_satuan: 1 }] }).success
  && !PenawaranSimpanSchema.safeParse({ kepala: { rekanan: 'A', tgl_surat: '2026-01-02' }, item: [{ nama_barang: 'x', harga_satuan: 0 }] }).success
  && !PenawaranSimpanSchema.safeParse({ kepala: { rekanan: 'A', tgl_surat: '2026-01-02' }, item: [{ nama_barang: 'x', harga_satuan: 1, barang_id: 1, barang_baru: 'y' }] }).success
  && PenawaranSimpanSchema.safeParse({ kepala: { rekanan: 'A', tgl_surat: '2026-01-02' }, item: [{ nama_barang: 'x', harga_satuan: 1 }] }).success)
{
  const r = sumber('app/api/buku-besar-aset/penawaran/route.ts')
  ok('C2 route: tulis = EDIT Rencana ATAU Pengadaan, sesudah guard; audit terdaftar retensi', (r.match(/tolakKecualiEdit\(g\.session, 'rencana', 'pengadaan'\)/g) ?? []).length === 3
    && sumber('lib/security/retensi-audit.ts').includes('BBA_PENAWARAN_SIMPAN: P, BBA_PENAWARAN_HAPUS: P, BBA_PENAWARAN_IMPOR: P'))
  const imp = sumber('app/api/buku-besar-aset/penawaran/impor/route.ts')
  ok('C3 impor: magic-number xlsx, pratinjau tidak menulis, simpan membaca ULANG berkas yang sama', imp.includes('endusMime(buf)') && imp.indexOf("if (step === 'pratinjau') return") < imp.indexOf('simpanPenawaran('))
  const m = sumber('app/(dashboard)/buku-besar-aset/_components/ModalItem.tsx')
  ok('C4 modal rencana: Ambil dari penawaran hanya mengisi form, mati tanpa barang', m.includes("Pilih barang dulu di tab Data item") && m.includes('setRefs(rs => [...rs, ...baru].slice(0, MAKS_REFERENSI))')
    && !sumber('app/(dashboard)/buku-besar-aset/_components/AmbilPenawaran.tsx').includes("method: 'POST'"))
  const skema = sumber('docs/schema-mysql.sql'), mig = sumber('docs/migrations/migration-bba-penawaran.sql'), mig2 = sumber('docs/migrations/migration-bba-penawaran-matriks.sql')
  ok('C6 migrasi Matriks + skema acuan: kolom baru tanpa IF NOT EXISTS, harga boleh NULL, status ber-ENUM', !/IF NOT EXISTS/i.test(mig2)
    && ['jenis_surat', 'pic_kontak', 'masa_berlaku_teks', 'status_tindak_lanjut', 'status_pajak', 'tautan', 'garansi'].every(x => mig2.includes(`ADD COLUMN ${x}`) && skema.includes(x))
    && /MODIFY COLUMN harga_satuan DECIMAL\(18,2\) NULL/.test(mig2) && skema.includes("harga_satuan DECIMAL(18,2) NULL COMMENT 'NULL = surat belum mencantumkan harga'"))
  ok('C5 migrasi + skema acuan: dua tabel + kolom jejak, tanpa IF NOT EXISTS pada ADD COLUMN; FK barang RESTRICT',
    mig.includes('CREATE TABLE bba_penawaran (') && mig.includes('CREATE TABLE bba_penawaran_item (') && mig.includes('ADD COLUMN penawaran_item_id') && !/ADD COLUMN IF NOT EXISTS/i.test(mig)
    && skema.includes('CREATE TABLE IF NOT EXISTS bba_penawaran_item') && skema.indexOf('CREATE TABLE IF NOT EXISTS bba_barang') < skema.indexOf('CREATE TABLE IF NOT EXISTS bba_penawaran_item')
    && mig.includes('REFERENCES bba_barang(id) ON DELETE RESTRICT'))
}

console.log('\nE. Aturan kolom Matriks')
ok('E1 jenis berharga: SPH & SPH+Presentasi & kosong (data lama); permohonan/company profile/ketik sendiri tidak', jenisBerharga('Penawaran Harga (SPH)') && jenisBerharga('Penawaran Harga & Presentasi')
  && jenisBerharga(null) && jenisBerharga('  ') && !jenisBerharga('Permohonan Presentasi') && !jenisBerharga('Company Profile & Penawaran Jasa') && !jenisBerharga('Penawaran Produk'))
ok('E2 syaratSurat: berharga wajib ≥1 barang berharga; tanpa barang / tanpa harga hanya untuk jenis lain', syaratSurat('Penawaran Harga (SPH)', []) !== null
  && syaratSurat('Penawaran Harga (SPH)', [{ harga_satuan: null }]) !== null && syaratSurat('Penawaran Harga (SPH)', [{ harga_satuan: null }, { harga_satuan: 5 }]) === null
  && syaratSurat('Permohonan Presentasi', []) === null && syaratSurat(null, [{ harga_satuan: 0 }]) !== null)
ok('E3 cocokJenisSurat: isi Matriks pemilik dipetakan bila TUNGGAL, selebihnya apa adanya', cocokJenisSurat('Penawaran Harga & Presentasi produk') === 'Penawaran Harga & Presentasi'
  && cocokJenisSurat('Presentasi produk') === 'Permohonan Presentasi' && cocokJenisSurat('Penawaran Harga    ') === 'Penawaran Harga (SPH)' && cocokJenisSurat('Penawaran Produk') === 'Penawaran Produk'
  && cocokJenisSurat('penawaran harga (sph)') === 'Penawaran Harga (SPH)' && cocokJenisSurat('') === null && cocokJenisSurat('Demo alat') === 'Permohonan Demo & Brosur' && cocokJenisSurat('Presentasi & demo alat') === 'Permohonan Demo & Brosur')
ok('E4 nama rekanan dirapikan (baris baru, spasi, titik badan usaha) & dibandingkan tanpa beda ejaan', rapikanNamaRekanan('PT  Medal Darma Buana\n') === 'PT. Medal Darma Buana'
  && rapikanNamaRekanan('cv medika') === 'CV. medika' && kunciRekanan('PT. Medal Darma Buana') === kunciRekanan('pt medal  darma buana') && rapikanNamaRekanan('Toko Abadi') === 'Toko Abadi'
  && kunciRekanan('PT.Medal Darma-Buana') === kunciRekanan('PT Medal Darma Buana,') && kunciRekanan('PT A') !== kunciRekanan('PT B'))
{
  const sr = saranRekananDari([{ rekanan: 'PT Medal', pic_kontak: null }, { rekanan: 'PT. Medal', pic_kontak: 'Sugito · 0812' }, { rekanan: 'pt medal', pic_kontak: 'lama' }, { rekanan: 'CV B', pic_kontak: 'x' }])
  ok('E5 saran rekanan: satu per nama (ejaan berbeda digabung), PIC dari surat TERBARU yang mengisinya, terurut nama', sr.length === 2 && sr[1].nama === 'PT. Medal' && sr[1].pic_kontak === 'Sugito · 0812' && sr[0].nama === 'CV. B')
}
ok('E6 merk + tipe digabung tanpa mengulang merk', gabungMerkTipe('GE', 'Revolution 128') === 'GE Revolution 128' && gabungMerkTipe('GE', 'GE Revolution') === 'GE Revolution'
  && gabungMerkTipe(null, 'A-14') === 'A-14' && gabungMerkTipe('Philips', null) === 'Philips' && gabungMerkTipe(' ', '') === null)
{
  const d1 = durasiDariTeks('1 Bulan'), d2 = durasiDariTeks('14 (empat belas) hari'), d3 = durasiDariTeks('tiga puluh hari')
  ok('E7 masa berlaku: "1 Bulan", "14 (empat belas) hari", angka dalam kata; teks lain bukan durasi', d1?.n === 1 && d1.satuan === 'bulan' && d2?.n === 14 && d2.satuan === 'hari' && d3?.n === 30
    && durasiDariTeks('-') === null && durasiDariTeks('31 Desember 2026') === null && durasiDariTeks('2 minggu')?.satuan === 'minggu')
  ok('E8 tanggal berlaku: hari/minggu ditambah, bulan dijepit akhir bulan (31 Jan + 1 bulan = 28 Feb; 2028 kabisat = 29 Feb)', tambahDurasi('2026-10-30', d1!) === '2026-11-30'
    && tambahDurasi('2026-11-05', d2!) === '2026-11-19' && tambahDurasi('2026-01-31', d1!) === '2026-02-28' && tambahDurasi('2028-01-31', d1!) === '2028-02-29'
    && tambahDurasi('2026-12-20', { n: 2, satuan: 'minggu' }) === '2027-01-03' && tambahDurasi('2026-11-15', { n: 1, satuan: 'tahun' }) === '2027-11-15')
}
ok('E9 status pajak: label, "belum/tidak termasuk" mendahului "termasuk", "-" = kosong, asing = tak dikenali', bacaStatusPajak('Termasuk PPN') === 'TERMASUK' && bacaStatusPajak('Belum termasuk PPN') === 'BELUM'
  && bacaStatusPajak('tidak termasuk ppn') === 'BELUM' && bacaStatusPajak('Exclude PPN') === 'BELUM' && bacaStatusPajak('Bebas PPN') === 'BEBAS' && bacaStatusPajak('') === null && bacaStatusPajak('abc') === undefined
  && bacaStatusPajak('Tidak disebut') === 'TIDAK_DISEBUT')
ok('E10 status tindak lanjut: label lengkap & kata kunci lembar Ringkasan', bacaTindakLanjut('Menunggu Jadwal Presentasi') === 'MENUNGGU_PRESENTASI' && bacaTindakLanjut('Disetujui / Lanjut Proses') === 'LANJUT'
  && bacaTindakLanjut('Arsip / Referensi Vendor') === 'ARSIP' && bacaTindakLanjut('Ditolak / Tidak Sesuai') === 'DITOLAK' && bacaTindakLanjut('Perlu Telaah Teknis & Anggaran') === 'PERLU_TELAAH'
  && bacaTindakLanjut('') === null && bacaTindakLanjut('entah') === undefined)
{
  const tanpaKomentar = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  const layar = tanpaKomentar(sumber('app/(dashboard)/buku-besar-aset/penawaran/penawaran-client.tsx'))
  const rute = tanpaKomentar(sumber('app/api/buku-besar-aset/penawaran/impor/route.ts'))
  ok('C7 tempel di layar lewat SATU aturan barisTempelBarang (tanpa pemecah baris & pembaca harga sendiri)', layar.includes('barisTempelBarang(') && !/split\('\\n'\)/.test(layar) && !/replace\(',', '\.'\)/.test(layar))
  ok('C8 rute impor Matriks menulis lewat imporSuratMatriks — tanpa transaksi & FOR UPDATE sendiri', rute.includes('imporSuratMatriks(') && !rute.includes('withTransaction') && !/FOR UPDATE/.test(rute))
}
ok('E15 status tindak lanjut bernada negatif TIDAK terbaca "lanjut"', bacaTindakLanjut('Tidak dilanjutkan') === 'DITOLAK' && bacaTindakLanjut('tidak lanjut') === 'DITOLAK'
  && bacaTindakLanjut('Tidak disetujui') === 'DITOLAK' && bacaTindakLanjut('Batal') === 'DITOLAK' && bacaTindakLanjut('Belum disetujui') === undefined && bacaTindakLanjut('Lanjut proses') === 'LANJUT',
  `${bacaTindakLanjut('Tidak dilanjutkan')} ${bacaTindakLanjut('Belum disetujui')}`)
{
  const kasus: Array<[unknown, number]> = [
    ['Rp 1.250.000', 1250000], ['12.500.000,00', 12500000], ['12,500,000', 12500000], ['12,500,000.50', 12500000.5], ['1,750,000.50', 1750000.5],
    ['12500000,0', 12500000], ['1750000,5000', 1750000.5], ['1250000.00', 1250000], ['Rp 1.250.000,-', 1250000], ['1.250', 1250], ['12,5', 12.5],
    [' Rp650,000 ', 650000], [98500000, 98500000], ['1 250 000', 1250000],
  ]
  const salah = kasus.filter(([v, n]) => angka(v) !== n).map(([v]) => `${JSON.stringify(v)}→${angka(v)}`)
  ok('E16 angka: pemisah Indonesia & Inggris, desimal 1–4 digit, ",-", spasi tak-putus', salah.length === 0 && Number.isNaN(angka('abc')) && Number.isNaN(angka('1,2,3.4.5')), salah.join(' '))
}
for (const [berkas, nama] of [['excel-id.txt', 'pemisah Indonesia'], ['excel-en.txt', 'pemisah Inggris']] as const) {
  // Teks papan klip yang DISALIN DARI EXCEL DESKTOP sungguhan (otomasi COM, 2026-11-28) — termasuk sel Alt+Enter terkutip.
  const b = barisTempelBarang(readFileSync(new URL(`./fixtures/bba-papan-klip/${berkas}`, import.meta.url), 'utf8'))
  ok(`E17 tempel dari Excel desktop (${nama}): 5 barang, harga utuh, sel dua baris tetap satu barang`, b.length === 5
    && JSON.stringify(b.map(x => x.harga)) === JSON.stringify([12500000, 3250000, 1750000.5, 98500000, 650000])
    && b[4].nama === 'Tensimeter digital lengan' && b[4].merk === 'Omron' && b[3].nama === 'Total Station', JSON.stringify(b.map(x => [x.nama, x.harga])))
}
ok('E18 tempel: baris kepala yang ikut tersalin dilewati, baris data pertama tidak', barisTempelBarang('Nama Barang\tMerk\tTipe\tSatuan\tHarga\nLaptop\tAsus\tB1\tunit\t10.000').length === 1
  && barisTempelBarang('Nama\tA\tB\tunit\t5000\nKursi\tX\tY\tbuah\t7000').length === 2)
{
  const g = [['Tgl Surat', 'Nama Rekanan', 'Nama Barang', 'Harga Penawaran (Rp)', 'Syarat & Pengecualian'],
    ['2026-01-02', 'PT Ukur', 'Total Station', 98500000, ''], ['2026-01-02', 'PT Ukur', 'Waterpass', 5000000, 'Jumlah minimal pemesanan 2 unit'],
    ['', 'TOTAL', '', 103500000, ''], ['Jumlah', '', '', 103500000, '']]
  const h = bacaMatriksGrid(g)
  ok('H4 Matriks: barang "Total Station" & syarat "Jumlah minimal …" tetap terbaca; baris TOTAL/Jumlah dilewati', h?.surat.length === 1 && h.surat[0].item.length === 2
    && h.surat[0].item[0].nama_barang === 'Total Station' && h.dilewati.length === 0, JSON.stringify(h?.surat[0]?.item.map(i => i.nama_barang)))
}
{
  const r = referensiDariPenawaran(ib({ file_id: null, tautan: 'https://katalog.inaproc.id/ge-operations', merk: 'GE', merk_tipe: 'Revolution', harga_satuan: 9 }))
  ok('E11 link e-Katalog ikut jadi url referensi: sumber EKATALOG, SAH walau surat tanpa berkas; merk+tipe tergabung', r.url === 'https://katalog.inaproc.id/ge-operations' && r.sumber === 'EKATALOG' && referensiSah(r) && r.merk_tipe === 'GE Revolution')
  const b = bandingkanPenawaran([it({ rekanan: 'PT Satu', harga_satuan: 100 }), it({ rekanan: 'PT. Satu', harga_satuan: 90, tgl_surat: '2026-02-01' }), it({ rekanan: 'CV Dua', harga_satuan: null })], HARI)
  ok('E12 Bandingkan: barang tanpa harga tidak dibandingkan; dua ejaan satu rekanan = satu kolom', b.rekanan.length === 1 && b.baris[0].sel['PT. Satu']?.item.harga_satuan === 90 && b.baris[0].jumlah === 2)
  ok('E13 Ambil dari penawaran: barang tanpa harga tidak ditawarkan', urutUntukRencana([it({ harga_satuan: null }), it({ harga_satuan: 5 })], HARI).length === 1)
}
{
  const sk = (o: object) => PenawaranSimpanSchema.safeParse(o).success
  ok('G1 skema Matriks: permohonan tanpa barang & barang tanpa harga diterima; SPH tanpa harga ditolak; link bukan http ditolak; status/pajak ber-ENUM',
    sk({ kepala: { rekanan: 'A', tgl_surat: '2026-01-02', jenis_surat: 'Permohonan Presentasi' }, item: [] })
    && sk({ kepala: { rekanan: 'A', tgl_surat: '2026-01-02', jenis_surat: 'Permohonan Presentasi' }, item: [{ nama_barang: 'CT', harga_satuan: null }] })
    && !sk({ kepala: { rekanan: 'A', tgl_surat: '2026-01-02', jenis_surat: 'Penawaran Harga (SPH)' }, item: [{ nama_barang: 'CT', harga_satuan: null }] })
    && !sk({ kepala: { rekanan: 'A', tgl_surat: '2026-01-02' }, item: [{ nama_barang: 'CT', harga_satuan: 1, tautan: 'javascript:alert(1)' }] })
    && !sk({ kepala: { rekanan: 'A', tgl_surat: '2026-01-02', status_tindak_lanjut: 'ENTAH' }, item: [{ nama_barang: 'CT', harga_satuan: 1 }] })
    && !sk({ kepala: { rekanan: 'A', tgl_surat: '2026-01-02' }, item: [{ nama_barang: 'CT', harga_satuan: 1, status_pajak: 'PPN' }] })
    && sk({ kepala: { rekanan: 'A', tgl_surat: '2026-01-02', status_tindak_lanjut: 'LANJUT' }, item: [{ nama_barang: 'CT', harga_satuan: 1, status_pajak: 'TERMASUK', tautan: 'https://x.test/a' }] }))
  ok('G2 ubah surat tanpa jenis_surat (tab lama/Drive balik): syarat dinilai server dari jenis tersimpan, bukan Zod', sk({ id: 5, expected_version: 1, kepala: { rekanan: 'A', tgl_surat: '2026-01-02' }, item: [] })
    && sumber('lib/data/bba-penawaran.ts').includes('const sebab = syaratSurat(ada[0].jenis_surat, input.item);'))
}

console.log('\nF. Pembaca berkas Matriks')
{
  // Tiruan lembar 1 Matriks pemilik: kop, kepala bertingkat, nomor surat dua baris, harga "-", baris template kosong bernomor, baris TOTAL.
  const g: unknown[][] = [
    ['MATRIKS INVENTARISASI PENAWARAN & PERMOHONAN REKANAN'], ['RSJD — Rekapitulasi'], [],
    ['I. IDENTITAS SURAT & REKANAN', 'I. IDENTITAS SURAT & REKANAN', 'I. IDENTITAS SURAT & REKANAN', 'I. IDENTITAS SURAT & REKANAN', 'I. IDENTITAS SURAT & REKANAN', 'I. IDENTITAS SURAT & REKANAN', 'II. DETAIL', 'II. DETAIL', 'II. DETAIL', 'II. DETAIL', 'II. DETAIL', 'III. HARGA', 'III. HARGA', 'III. HARGA', 'III. HARGA', 'III. HARGA'],
    ['No.', 'Tgl Surat', 'No. Surat Rekanan', 'Jenis Surat', 'Nama Rekanan / Vendor', 'PIC & Kontak', 'Kategori Belanja / Jasa', 'Nama Barang ', 'Merk ', 'Tipe / Spesifikasi', 'Satuan ', 'Harga Penawaran (Rp)', 'Status Pajak', 'Link E-Katalog / Ref.', 'Garansi', 'Masa Berlaku SPH'],
    [1, new Date(Date.UTC(2026, 9, 30)), '610/SPH/GMP-X/2026\n073/SP/GMP-ECAT/X/2026', 'Penawaran Harga & Presentasi produk', 'PT. Global Medik Persada', 'Moch. Soleh\n(+62 812-1021-5628)', 'Belanja Modal Alat Kedokteran', 'CT Scan', 'GE ', 'Revolution Maxima 128 Slice', 'Unit', 16251318604, 'Termasuk PPN', 'https://katalog.inaproc.id/ge-operations-indonesia', '3 Tahun', '1 Bulan'],
    [2, new Date(Date.UTC(2026, 9, 13)), '-', 'Presentasi produk', 'PT. Kusuma Energi Mentari', "Musta'khirin\n082261142434", 'Belanja Modal Instalasi Pembangkit Listrik', 'PLTS', '-', '-', '-', '-', '-', '-', '-', '-'],
    [3, new Date(Date.UTC(2026, 10, 5)), '161/SPH/MEDABU/XI/2026\n', 'Penawaran Harga    ', 'PT. Medal Darma Buana\n', 'Sugito', 'Belanja Modal Alat Kedokteran', 'PACS', 'Medxa RIS-PACS', 'DICOM Server Engine, Worklist Server Engine , Data', 'Paket', 2100000000, 'Termasuk PPN', '-', '2 Tahun', '14 (empat belas) hari'],
    [4, new Date(Date.UTC(2026, 10, 5)), '161/SPH/MEDABU/XI/2026', 'Penawaran Harga', 'PT MEDAL DARMA BUANA', 'Sugito', 'Belanja Modal Alat Kedokteran', 'Lisensi Viewer', '-', '-', 'Paket', 'Belum Ada Harga', 'Belum termasuk PPN', 'contoh.com', '-', '-'],
    [5, new Date(Date.UTC(2026, 10, 16)), '075/SPH-RAA/XI/2026', 'Penawaran Produk', 'PT. Radja Arta Alkesindo', 'Telp : 081293268098', '', '', '', '', '', '', '', '', '', ''],
    [6, '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''], [7],
    // Sel gabung A:K di berkas asli: exceljs mengulang teksnya di tiap sel, termasuk kolom Rekanan & Nama Barang.
    [...Array(11).fill('TOTAL NILAI PENAWARAN HARGA TERDATA (YANG MENCANTUMKAN NOMINAL)'), 18351318604, 'Catatan: Gunakan filter', 'Catatan: Gunakan filter'],
  ]
  const h = bacaMatriksGrid(g)!
  const per = (r: string) => h.surat.find(s => s.kepala.rekanan.includes(r))!
  ok('F1 Matriks: 4 surat (dua baris Medal beda ejaan = satu surat), baris kosong & TOTAL dilewati, nilai = TOTAL berkas',
    h.surat.length === 4 && per('Medal').item.length === 2 && h.surat.flatMap(s => s.item).reduce((t, i) => t + (i.harga_satuan ?? 0), 0) === 18_351_318_604 && h.dilewati.length === 0, JSON.stringify(h.surat.map(s => [s.kepala.rekanan, s.item.length])))
  const gmp = per('Global'), plts = per('Kusuma'), med = per('Medal'), radja = per('Radja')
  ok('F2 kolom surat: tanggal Excel, nomor 2 baris, jenis dipetakan, PIC, kategori → jenis kategori (teks), masa → berlaku', gmp.kepala.tgl_surat === '2026-10-30'
    && gmp.kepala.nomor_surat === '610/SPH/GMP-X/2026 073/SP/GMP-ECAT/X/2026' && gmp.kepala.jenis_surat === 'Penawaran Harga & Presentasi' && gmp.kepala.pic_kontak === 'Moch. Soleh (+62 812-1021-5628)'
    && gmp.kepala.jenis_kategori === 'Belanja Modal Alat Kedokteran' && gmp.kepala.berlaku_sampai === '2026-11-30' && gmp.kepala.masa_berlaku_teks === '1 Bulan'
    && med.kepala.berlaku_sampai === '2026-11-19' && med.kepala.jenis_surat === 'Penawaran Harga (SPH)' && med.kepala.rekanan === 'PT. Medal Darma Buana', JSON.stringify(gmp.kepala))
  ok('F3 kolom barang: "-" = kosong, merk terpisah, "Tipe / Spesifikasi" pendek = tipe & panjang ber-koma = spesifikasi, pajak & link & garansi',
    gmp.item[0].merk === 'GE' && gmp.item[0].merk_tipe === 'Revolution Maxima 128 Slice' && gmp.item[0].status_pajak === 'TERMASUK' && gmp.item[0].garansi === '3 Tahun'
    && gmp.item[0].tautan === 'https://katalog.inaproc.id/ge-operations-indonesia' && med.item[0].merk_tipe === null && med.item[0].spesifikasi?.startsWith('DICOM')
    && plts.item[0].harga_satuan === null && plts.item[0].merk === null && plts.item[0].satuan === null && plts.kepala.jenis_surat === 'Permohonan Presentasi')
  ok('F4 "Belum Ada Harga" = tanpa harga; link bukan alamat web tidak dicatat & disebut; surat tanpa barang tetap surat', med.item[1].harga_satuan === null && med.item[1].tautan === null
    && med.item[1].status_pajak === 'BELUM' && med.catatan.some(x => x.includes('contoh.com')) && radja.item.length === 0 && radja.masalah === null && radja.kepala.jenis_surat === 'Penawaran Produk')
  ok('F5 semua surat lolos syaratSurat (Medal SPH punya satu barang berharga)', h.surat.every(s => s.masalah === null))
  ok('F6 bukan berkas Matriks (tanpa kolom rekanan) → null, jatuh ke templat lama', bacaMatriksGrid([['Nama Barang', 'Harga'], ['Kursi', 5]]) === null)
  const sph = bacaMatriksGrid([['Tgl Surat', 'Nama Rekanan', 'Jenis Surat', 'Nama Barang', 'Harga'], ['2026-01-02', 'PT X', 'Penawaran Harga (SPH)', 'Kursi', '-']])!
  ok('F7 surat penawaran harga tanpa satu harga pun = bermasalah (tidak dicatat), disebut sebabnya', sph.surat[0].masalah !== null)
}
const berkasMatriks = process.argv[2]
if (berkasMatriks) {
  const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(berkasMatriks)
  const h = bacaMatriksGrid(gridDari(wb.worksheets[0]))!
  const total = h.surat.flatMap(s => s.item).reduce((t, i) => t + (i.harga_satuan ?? 0), 0)
  ok('K1 kalibrasi berkas pemilik: 7 surat, 3 berharga, total = baris TOTAL berkas (Rp 34.081.318.604), semua lolos', h.surat.length === 7 && h.surat.filter(s => s.item.some(i => i.harga_satuan)).length === 3
    && total === 34_081_318_604 && h.surat.every(s => s.masalah === null) && h.dilewati.length === 0, `${h.surat.length} surat, total ${total}, ${JSON.stringify(h.dilewati)}`)
  ok('K2 kalibrasi: Medal 14 hari → 19 Nov, GMP 1 Bulan → 30 Nov, Radja Arta tanpa barang', h.surat.find(s => s.kepala.rekanan.includes('Medal'))?.kepala.berlaku_sampai === '2026-11-19'
    && h.surat.find(s => s.kepala.rekanan.includes('Global'))?.kepala.berlaku_sampai === '2026-11-30' && h.surat.find(s => s.kepala.rekanan.includes('Radja'))?.item.length === 0)
} else console.log('  --  K kalibrasi berkas Matriks pemilik TIDAK dijalankan (berikan path berkasnya sebagai argumen)')

console.log('\nH. Lembar unduhan = kolom Matriks')
{
  const judul = KOLOM_LAPORAN.penawaran.map(x => x.judul)
  const urutMatriks = ['Tgl Surat', 'No. Surat Rekanan', 'Jenis Surat', 'Nama Rekanan / Vendor', 'PIC & Kontak', 'Kategori Belanja / Jasa', 'Nama Barang', 'Merk', 'Tipe', 'Satuan', 'Harga Penawaran (Rp)', 'Status Pajak', 'Link E-Katalog / Ref.', 'Garansi', 'Masa Berlaku SPH']
  ok('H1 lembar Penawaran memuat kolom Matriks dalam urutan Matriks (+ kolom PRIMA di sela)', urutMatriks.every((j, i) => judul.includes(j) && (i === 0 || judul.indexOf(j) > judul.indexOf(urutMatriks[i - 1]))), judul.join(' | '))
  const sel = selPenawaran({ ...it({ harga_satuan: null, status_pajak: 'BELUM', merk: 'GE', merk_tipe: 'R', tautan: 'https://a.test' }), status_tindak_lanjut: 'LANJUT', syarat: 'tanpa kabel' }, HARI, 1)
  ok('H2 sel: harga kosong tetap kosong (bukan 0), label pajak & tindak lanjut, merk & tipe terpisah', sel.harga === '' && sel.pajak === 'Belum termasuk PPN' && sel.status_tl === 'Disetujui / lanjut proses'
    && sel.merek === 'GE' && sel.merk === 'R' && sel.syarat === 'tanpa kabel')
  ok('H3 templat impor = judul yang dikenali pembaca Matriks', bacaMatriksGrid([KOLOM_MATRIKS.map(x => x[0]) as unknown[], [1, '2026-01-02', 'n', 'Permohonan Presentasi', 'PT A', '', '', 'Alat', '', '', '', '', '', '', '', '', '', '', '', '']])?.surat.length === 1)
}

console.log('\nD. MySQL sungguhan')
let c: mysql.Connection | null = null
try {
  c = await mysql.createConnection({ host: process.env.MYSQL_HOST, port: Number(process.env.MYSQL_PORT || 3306), user: process.env.MYSQL_USER, password: process.env.MYSQL_PASSWORD, database: process.env.MYSQL_DATABASE })
} catch (e) { ok(`D0 MySQL bisa dihubungi (${(e as { code?: string }).code ?? e})`, false) }
if (c) {
  const k = c
  const bersih = async () => {
    await k.query("DELETE FROM bba_penawaran WHERE rekanan LIKE 'UJIW%'")
    await k.query("DELETE FROM buku_besar_aset WHERE tahun_anggaran = 2067 AND uraian LIKE 'UJIW%'")
    await k.query("DELETE FROM bba_barang WHERE nama LIKE 'UJIW %'")
  }
  await bersih()
  const B = await import('../lib/data/buku-besar-aset')
  const W = await import('../lib/data/bba-penawaran')
  const [u] = await k.query('SELECT id FROM users ORDER BY id LIMIT 1') as [Array<{ id: number }>, unknown]
  const userId = Number(u[0]?.id ?? 0)
  try {
    const lap = await B.createBarang({ nama: 'UJIW Laptop' }, userId)
    const s1 = await W.simpanPenawaran({ kepala: { rekanan: 'UJIW PT Satu', tgl_surat: '2026-01-05', berlaku_sampai: null }, item: [
      { barang_id: lap.id, nama_barang: 'Laptop 14', merk_tipe: 'A-14', harga_satuan: 10_000_000, satuan: 'unit' },
      { barang_baru: 'UJIW Proyektor', nama_barang: 'Proyektor', harga_satuan: 7_000_000 },
      { nama_barang: 'Barang aneh', harga_satuan: 5 },
    ] }, userId)
    const daftar = (await W.listPenawaran('UJIW')).find(s => s.id === s1.id)!
    const proy = daftar.item.find(i => i.nama_barang === 'Proyektor')!
    ok('D1 satu Simpan = surat + 3 item; barang baru dibuat di transaksi yang sama; tanpa barang = belum ditautkan', s1.baru && daftar.item.length === 3 && !!proy.barang_id
      && daftar.item.find(i => i.nama_barang === 'Barang aneh')!.barang_id === null)

    const r = await B.createAset({ tahun_anggaran: 2067, uraian: 'UJIW rencana laptop', barang_id: lap.id, sumber_anggaran: 'BLUD', vol: 1, harga: 1, jenis_rencana: 'PENAMBAHAN' }, userId)
    const itLap = (await W.itemPenawaran(lap.id))[0]
    await B.updateAset({ id: r.id, expected_version: (await B.getAsetById(r.id))!.version, referensi: [{ ...referensiDariPenawaran(itLap as ItemBerharga), file_id: null, url: 'https://contoh.test/a' }, { sumber: 'LAINNYA', nama_penyedia: 'x', harga: 1, url: 'https://contoh.test/b', penawaran_item_id: 999_999_999 }] }, userId)
    const refs = await B.listReferensi(r.id)
    ok('D2 referensi salinan membawa jejak; jejak ke item yang tidak ada dilepas (L68), bukan ditolak', refs[0].penawaran_item_id === itLap.id && refs[0].harga === 10_000_000 && refs[1].penawaran_item_id === undefined)
    ok('D3 lencana "dipakai n rencana"', (await W.listPenawaran('UJIW')).find(s => s.id === s1.id)!.item.find(i => i.id === itLap.id)!.dipakai === 1)

    const v1 = (await W.listPenawaran('UJIW')).find(s => s.id === s1.id)!.version
    await W.simpanPenawaran({ id: s1.id, expected_version: v1, kepala: { rekanan: 'UJIW PT Satu', tgl_surat: '2026-01-05' }, item: [
      { id: itLap.id, barang_id: lap.id, nama_barang: 'Laptop 14', merk_tipe: 'A-14', harga_satuan: 9_500_000 },
    ] }, userId)
    const sesudah = (await W.listPenawaran('UJIW')).find(s => s.id === s1.id)!
    ok('D4 ubah surat: item yang dikirim balik tetap ber-id sama (jejak rencana tetap menunjuk), item yang dibuang hilang', sesudah.item.length === 1 && sesudah.item[0].id === itLap.id
      && sesudah.item[0].harga_satuan === 9_500_000 && (await B.listReferensi(r.id))[0].harga === 10_000_000)
    const basi = await coba(() => W.simpanPenawaran({ id: s1.id, expected_version: v1, kepala: { rekanan: 'UJIW PT Satu', tgl_surat: '2026-01-05' }, item: [{ nama_barang: 'x', harga_satuan: 1 }] }, userId))
    ok('D5 angka kunci basi → 409, tidak tertulis', basi instanceof B.BbaVersionConflictError && (await W.listPenawaran('UJIW')).find(s => s.id === s1.id)!.item.length === 1)

    // Item proyektor surat pertama sudah dibuang di D4 — barangnya dirujuk lagi lewat surat kedua (hanya dari penawaran).
    const proyBarang = proy.barang_id!
    const s2 = await W.simpanPenawaran({ kepala: { rekanan: 'UJIW CV Dua', tgl_surat: '2026-02-01' }, item: [{ barang_id: proyBarang, nama_barang: 'Proyektor', harga_satuan: 6_900_000 }] }, userId)
    const tolakHapus = await coba(() => B.hapusBarang(proyBarang))
    ok('D6 barang yang hanya dirujuk penawaran tidak bisa dihapus (pesan menyebut penawaran)', tolakHapus instanceof B.BbaBarangDipakaiError && tolakHapus.message.includes('penawaran'), tolakHapus instanceof Error ? tolakHapus.message : 'terhapus')
    await B.gabungBarang(proyBarang, lap.id, userId)
    ok('D7 gabungkan barang memindah item penawaran juga', (await W.itemPenawaran(lap.id)).some(i => i.penawaran_id === s2.id))

    const v2 = (await W.listPenawaran('UJIW')).find(s => s.id === s1.id)!.version
    await W.hapusPenawaran(s1.id, v2)
    const tinggal = await B.listReferensi(r.id)
    ok('D8 hapus surat yang dipakai: surat hilang, referensi rencana UTUH (salinan), jejaknya dilepas', !(await W.listPenawaran('UJIW')).some(s => s.id === s1.id)
      && tinggal.length === 2 && tinggal[0].harga === 10_000_000 && tinggal[0].penawaran_item_id === undefined)

    // ── Kolom Matriks
    const m1 = await W.simpanPenawaran({ kepala: { rekanan: 'UJIW  PT Matriks\n', pic_kontak: 'Budi · 0812', tgl_surat: '2026-03-01', berlaku_sampai: '2026-03-15', masa_berlaku_teks: '14 hari',
      jenis_surat: 'Penawaran Harga (SPH)', status_tindak_lanjut: 'PERLU_TELAAH', catatan: 'belum termasuk kabel' }, item: [
      { barang_id: lap.id, nama_barang: 'Laptop', merk: 'Lenovo', merk_tipe: 'T14', harga_satuan: 15_000_000, status_pajak: 'TERMASUK', tautan: 'https://katalog.inaproc.id/x', garansi: '3 Tahun' },
      { barang_id: lap.id, nama_barang: 'Laptop cadangan', harga_satuan: null },
    ] }, userId)
    const sm = (await W.listPenawaran('UJIW')).find(s => s.id === m1.id)!
    ok('D10 kolom Matriks tersimpan & terbaca; nama rekanan dirapikan saat disimpan', sm.rekanan === 'UJIW PT Matriks' && sm.pic_kontak === 'Budi · 0812' && sm.jenis_surat === 'Penawaran Harga (SPH)'
      && sm.masa_berlaku_teks === '14 hari' && sm.status_tindak_lanjut === 'PERLU_TELAAH' && sm.catatan === 'belum termasuk kabel'
      && sm.item[0].merk === 'Lenovo' && sm.item[0].status_pajak === 'TERMASUK' && sm.item[0].tautan === 'https://katalog.inaproc.id/x' && sm.item[0].garansi === '3 Tahun' && sm.item[1].harga_satuan === null, JSON.stringify(sm))
    ok('D11 Ambil dari penawaran (per barang): barang tanpa harga tidak ikut', (await W.itemPenawaran(lap.id)).every(i => (i.harga_satuan ?? 0) > 0)
      && (await W.itemPenawaran()).some(i => i.harga_satuan === null))
    // Bentuk lama (tab lama / Drive balik): kolom Matriks tidak dikirim = jangan sentuh (L87).
    await W.simpanPenawaran({ id: m1.id, expected_version: sm.version, kepala: { rekanan: 'UJIW PT Matriks', tgl_surat: '2026-03-01', berlaku_sampai: '2026-03-15', file_id: null },
      item: sm.item.map(i => ({ id: i.id, barang_id: i.barang_id, nama_barang: i.nama_barang, merk_tipe: i.merk_tipe, spesifikasi: i.spesifikasi, satuan: i.satuan, harga_satuan: i.harga_satuan })) }, userId)
    const sm2 = (await W.listPenawaran('UJIW')).find(s => s.id === m1.id)!
    ok('D12 simpan berbentuk lama TIDAK mengosongkan jenis/PIC/masa/status/syarat surat dan merk/pajak/link/garansi barang', sm2.jenis_surat === 'Penawaran Harga (SPH)' && sm2.pic_kontak === 'Budi · 0812'
      && sm2.masa_berlaku_teks === '14 hari' && sm2.status_tindak_lanjut === 'PERLU_TELAAH' && sm2.catatan === 'belum termasuk kabel' && sm2.item[0].merk === 'Lenovo' && sm2.item[0].tautan === 'https://katalog.inaproc.id/x'
      && sm2.item[0].garansi === '3 Tahun' && sm2.item[0].status_pajak === 'TERMASUK')
    const tanpaHarga = await coba(() => W.simpanPenawaran({ id: m1.id, expected_version: sm2.version, kepala: { rekanan: 'UJIW PT Matriks', tgl_surat: '2026-03-01' },
      item: [{ id: sm2.item[1].id, barang_id: lap.id, nama_barang: 'Laptop cadangan', harga_satuan: null }] }, userId))
    ok('D13 jenis tidak dikirim: syarat dinilai dari jenis TERSIMPAN (SPH tanpa harga ditolak, tidak tertulis)', tanpaHarga instanceof W.BbaSyaratSuratError
      && (await W.listPenawaran('UJIW')).find(s => s.id === m1.id)!.item.length === 2)
    await W.ubahStatusPenawaran(m1.id, sm2.version, 'LANJUT', userId)
    const basiStatus = await coba(() => W.ubahStatusPenawaran(m1.id, sm2.version, 'ARSIP', userId))
    ok('D14 status tindak lanjut dari menu: berangka kunci, basi = 409', (await W.listPenawaran('UJIW')).find(s => s.id === m1.id)!.status_tindak_lanjut === 'LANJUT' && basiStatus instanceof B.BbaVersionConflictError)
    const m2 = await W.simpanPenawaran({ kepala: { rekanan: 'UJIW pt  matriks', tgl_surat: '2026-04-01', jenis_surat: 'Permohonan Presentasi', pic_kontak: 'Ani · 0813' }, item: [] }, userId)
    const saran = (await W.saranRekanan()).filter(r => r.nama.toLowerCase().startsWith('ujiw pt matriks'))
    ok('D15 surat tanpa barang (permohonan) tercatat & muncul di unduhan; saran rekanan: dua ejaan = satu, PIC surat terbaru', saran.length === 1 && saran[0].pic_kontak === 'Ani · 0813'
      && (await W.suratTanpaBarang()).some(s => s.penawaran_id === m2.id))
    // Impor Matriks: banyak surat SATU transaksi — surat kedua gagal = surat pertama ikut batal.
    const { withTransaction } = await import('../lib/data/db')
    const gagalTengah = await coba(() => withTransaction(async t => {
      await W.simpanPenawaranDi(t, { kepala: { rekanan: 'UJIW PT Impor Satu', tgl_surat: '2026-05-01', jenis_surat: 'Permohonan Presentasi' }, item: [] }, userId)
      await W.simpanPenawaranDi(t, { kepala: { rekanan: 'UJIW PT Impor Dua', tgl_surat: '2026-05-01', kategori: 'Kategori Tidak Ada' }, item: [{ nama_barang: 'x', harga_satuan: 1 }] }, userId)
    }))
    ok('D16 impor banyak surat satu transaksi: satu gagal = semuanya batal', gagalTengah instanceof B.BbaKategoriTidakDikenalError && !(await W.listPenawaran('UJIW PT Impor')).length)
    const kunci = await W.kunciSuratTercatat()
    ok('D17 kunci surat tercatat (rekanan+nomor+tanggal) untuk melewati surat yang sudah diimpor', kunci.some(x => x.rekanan === 'UJIW PT Matriks' && x.tgl_surat === '2026-03-01'))

    // ── Balapan (deterministik lewat performance_schema). Impor Matriks × ganti nama jenis kategori di Master.
    const menunggu = async (tabel: string) => {
      for (let i = 0; i < 100; i++) {
        const [r] = await k.query(`SELECT COUNT(*) AS n FROM performance_schema.data_lock_waits w JOIN performance_schema.data_locks l ON l.ENGINE_LOCK_ID = w.REQUESTING_ENGINE_LOCK_ID
          WHERE l.OBJECT_SCHEMA = DATABASE() AND l.OBJECT_NAME = ?`, [tabel]) as [Array<{ n: number }>, unknown]
        if (Number(r[0].n) > 0) return true
        await new Promise(s => setTimeout(s, 50))
      }
      return false
    }
    const [indRow] = await k.query("SELECT id FROM bba_kategori_induk WHERE nama = 'Barang dan Jasa'") as [Array<{ id: number }>, unknown]
    const indId = Number(indRow[0].id)
    const jenis = await B.createJenisKategori({ kategori_id: indId, jenis_kategori: 'UJIW Jenis Balapan', kode_rekening: null })
    await W.simpanPenawaran({ kepala: { rekanan: 'UJIW PT Pemegang Jenis', tgl_surat: '2026-06-01', kategori_id: indId, jenis_kategori_id: jenis.id }, item: [{ nama_barang: 'x', harga_satuan: 1 }] }, userId)
    const isiImpor = (n: string) => ({ kepala: { rekanan: `UJIW PT Balap ${n}`, tgl_surat: '2026-06-02', jenis_surat: 'Permohonan Presentasi', kategori_id: indId, jenis_kategori_id: jenis.id }, item: [] })
    const { PenawaranSimpanSchema: Skema } = await import('../lib/data/bba-penawaran-schemas')
    const saling = (e: unknown) => e instanceof Error && /deadlock/i.test(e.message)

    // Urutan LAMA (rute impor sebelum 2026-11-28): FOR UPDATE seluruh surat → baru kategori. Dibuktikan saling-kunci.
    let sudahKunci!: () => void; const terkunci = new Promise<void>(r => (sudahKunci = r))
    let lanjut!: () => void; const jeda = new Promise<void>(r => (lanjut = r))
    const lama = coba(() => withTransaction(async t => {
      await t.tx`SELECT rekanan FROM bba_penawaran FOR UPDATE`
      sudahKunci(); await jeda
      await W.simpanPenawaranDi(t, Skema.parse(isiImpor('Lama')), userId)
    }))
    await terkunci
    const gantiLama = coba(() => B.updateJenisKategori({ id: jenis.id, jenis_kategori: 'UJIW Jenis Balapan 2' }))
    const tungguLama = await menunggu('bba_penawaran')
    lanjut()
    const [rLama, gLama] = await Promise.all([lama, gantiLama])
    ok('D18a pembanding: urutan lama (kunci semua surat dulu) SALING-KUNCI dengan ganti nama jenis', tungguLama && (saling(rLama) || saling(gLama)),
      `menunggu=${tungguLama} impor=${(rLama as Error)?.message ?? 'ok'} ganti=${(gLama as Error)?.message ?? 'ok'}`)

    // Urutan BARU (imporSuratMatriks): kunci bernama, surat tak dikunci → ganti nama tidak menunggu impor.
    const [ab] = await k.query("SELECT COUNT(*) AS n FROM blud_locks WHERE entity = 'bba_penawaran_impor' AND key_id = 'semua'") as [Array<{ n: number }>, unknown]
    const tahan = await mysql.createConnection({ host: process.env.MYSQL_HOST, port: Number(process.env.MYSQL_PORT || 3306), user: process.env.MYSQL_USER, password: process.env.MYSQL_PASSWORD, database: process.env.MYSQL_DATABASE })
    try {
      await tahan.query('START TRANSACTION')
      await tahan.query("INSERT INTO blud_locks (entity, key_id, version) VALUES ('bba_penawaran_impor', 'semua', 0) ON DUPLICATE KEY UPDATE version = version")
      await tahan.query("SELECT version FROM blud_locks WHERE entity = 'bba_penawaran_impor' AND key_id = 'semua' FOR UPDATE")
      const surat = (n: string) => ({ label: n, lewati: false, data: isiImpor(n) })
      const imp1 = coba(() => W.imporSuratMatriks([surat('Baru')], userId))
      const imp2 = coba(() => W.imporSuratMatriks([surat('Baru')], userId))   // impor kembar berbarengan
      const antre = await menunggu('blud_locks')
      const ganti = await coba(() => B.updateJenisKategori({ id: jenis.id, jenis_kategori: 'UJIW Jenis Balapan 3' }))
      await tahan.query('COMMIT')
      const [h1, h2] = await Promise.all([imp1, imp2])
      const ditulis = (await W.listPenawaran('UJIW PT Balap Baru'))
      ok('D18b urutan baru: impor ANTRE di kunci bernama, ganti nama jenis selesai tanpa menunggu impor, tidak saling-kunci', antre && !(ganti instanceof Error)
        && !(h1 instanceof Error) && !(h2 instanceof Error), `antre=${antre} ganti=${(ganti as Error)?.message ?? 'ok'} h1=${(h1 as Error)?.message ?? 'ok'} h2=${(h2 as Error)?.message ?? 'ok'}`)
      ok('D19 dua impor berkas yang sama berbarengan: suratnya tercatat SATU kali, yang kedua melewatinya; label jenis ikut nama terbaru',
        ditulis.length === 1 && [h1, h2].filter(h => !(h instanceof Error) && h.tulis.length === 1).length === 1 && ditulis[0].jenis_kategori === 'UJIW Jenis Balapan 3',
        `${ditulis.length} surat, ${JSON.stringify([h1, h2])}`)
      if (Number(ab[0].n) === 0) await k.query("DELETE FROM blud_locks WHERE entity = 'bba_penawaran_impor' AND key_id = 'semua'")  // L92: hanya kunci yang dibuat uji ini
    } finally { await tahan.end() }
  } finally {
    await bersih()
    await k.query("DELETE FROM bba_kategori_aset WHERE nama LIKE 'UJIW%'")
    const [s] = await k.query("SELECT (SELECT COUNT(*) FROM bba_penawaran WHERE rekanan LIKE 'UJIW%') + (SELECT COUNT(*) FROM bba_barang WHERE nama LIKE 'UJIW %') AS n") as [Array<{ n: number }>, unknown]
    ok('D9 kotak pasir bersih', Number(s[0].n) === 0)
    await k.end()
  }
}

console.log(`\n${lulus} lulus, ${gagal.length} gagal`)
if (gagal.length) { console.log(gagal.map(g => `  - ${g}`).join('\n')); process.exit(1) }
process.exit(0)
