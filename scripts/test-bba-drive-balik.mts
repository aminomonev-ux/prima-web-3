#!/usr/bin/env npx tsx
// scripts/test-bba-drive-balik.mts — perubahan laporan BBA di Google Drive dibawa balik ke PRIMA.
// Konsep: docs/konsep/bba/CONCEPT-bba-drive-balik.md.
// Jalankan: npx tsx --env-file=.env.local scripts/test-bba-drive-balik.mts
// Bagian E memakai MySQL sungguhan (kotak pasir 2065, data "UJID") dan Drive TIRUAN berrevisi (googleapis diganti di proses
// ini); app_config yang disentuh dikembalikan. Tanpa MySQL = GAGAL.
import { createHash } from 'node:crypto'
import ExcelJS from 'exceljs'
import mysql from 'mysql2/promise'
import { tulisBukuRencana, KOLOM_LAPORAN, JUDUL_JANGKAR, type BahanBukuRencana, type LembarBalik } from '../lib/bba/laporan-excel'
import {
  petakanKolom, bacaNilai, bacaTanggal, bacaLembar, potretDariBahan, pilihAsal, gabungTigaArah, samaNilai, barangBelumAda, barangMirip, SPEK,
  type Potret, type BacaanBerkas, type MetaPrima,
} from '../lib/bba/drive-balik'
import { periksaLuar, revisiTertimpa, lepasTahanan, putuskanKirim, catatHasilKirim, type StatusBerkasDrive } from '../lib/bba/drive-kirim'
import { kelengkapanRef } from '../lib/bba/referensi'
import { polosSelExcel } from '../lib/shared/excel-sel'

let lulus = 0
const gagal: string[] = []
function ok(nama: string, syarat: unknown, ket = '') {
  if (syarat) { lulus++; console.log(`  ok  ${nama}`) }
  else { gagal.push(nama); console.log(`FAIL  ${nama}${ket ? ' — ' + ket : ''}`) }
}
const coba = async <T,>(f: () => Promise<T>): Promise<T | Error> => { try { return await f() } catch (e) { return e as Error } }

/** Grid sel mentah seperti yang dibaca server (lib/data/bba-drive-balik.ts). */
function grid(ws: ExcelJS.Worksheet): unknown[][] {
  const g: unknown[][] = []
  ws.eachRow({ includeEmpty: true }, (row, r) => { const b: unknown[] = []; for (let c = 1; c <= Math.min(row.cellCount, 40); c++) b.push(polosSelExcel(row.getCell(c)) ?? ''); g[r - 1] = b })
  return Array.from(g, b => b ?? [])
}
async function bacaWb(wb: ExcelJS.Workbook): Promise<BacaanBerkas> {
  const buf = await wb.xlsx.writeBuffer(); const w2 = new ExcelJS.Workbook(); await w2.xlsx.load(buf as ArrayBuffer)
  const nama: Record<LembarBalik, string> = { rencana: 'Rencana', pengadaan: 'Pengadaan', penerimaan: 'Penerimaan', penawaran: 'Penawaran' }
  return Object.fromEntries((Object.keys(nama) as LembarBalik[]).map(l => [l, bacaLembar(l, grid(w2.getWorksheet(nama[l])!))])) as BacaanBerkas
}
/** Kolom (1-based) menurut judul di baris kepala 7. */
const kolom = (ws: ExcelJS.Worksheet, judul: string) => { for (let c = 1; c <= 40; c++) if (String(ws.getCell(7, c).value ?? '') === judul) return c; return -1 }
const barisKode = (ws: ExcelJS.Worksheet, kode: string) => { for (let r = 8; r <= ws.rowCount; r++) if (String(ws.getCell(r, 2).value ?? '') === kode) return r; return -1 }

// ─────────────────────────────────────────────────────────────────────────────
console.log('A. Mengenali kolom & nilai')
{
  const judul = KOLOM_LAPORAN.rencana.map(k => k.judul)
  const p = petakanKolom('rencana', [...judul, JUDUL_JANGKAR], () => [])
  ok('A1 judul laporan sendiri: semua kolom dikenali, jangkar ditemukan, tanpa asing/ragu', Object.entries(p.peta).every(([k, i]) => judul[i!] === KOLOM_LAPORAN.rencana.find(x => x.kunci === k)!.judul) && p.jangkar === judul.length && !p.asing.length && !p.ragu.length)
  const ganti = petakanKolom('rencana', ['No', 'Kode', 'Nama Item', 'Barang', 'Jenis', 'Sumber Dana', 'Volume', 'Sat', 'Harga/Unit', 'Total', 'Keputusan', 'Tahap', 'Ref', 'Justifikasi'], () => [])
  ok('A2 judul diubah tapi maksudnya sama (Nama Item, Volume, Sat, Harga/Unit, Sumber Dana, Justifikasi) tetap dikenali',
    ganti.peta.uraian === 2 && ganti.peta.vol === 6 && ganti.peta.satuan === 7 && ganti.peta.harga === 8 && ganti.peta.sumber === 5 && ganti.peta.alasan === 13, JSON.stringify(ganti.peta))
  const asing = petakanKolom('rencana', ['Kode', 'Uraian', 'Harga Satuan', 'Catatan rapat 3 Des'], i => (i === 3 ? ['ditunda', 'ok'] : []))
  ok('A3 kolom buatan pengguna yang tidak ada di PRIMA → "asing" dengan contoh isinya', asing.asing.length === 1 && asing.asing[0].judul === 'Catatan rapat 3 Des' && asing.asing[0].contoh.join() === 'ditunda,ok', JSON.stringify(asing.asing))
  const dua = petakanKolom('rencana', ['Kode', 'Uraian', 'Harga', 'Harga Satuan'], () => [])
  ok('A4 dua kolom sama kuat untuk satu kolom PRIMA → ditanyakan (ragu), tidak dipilih', dua.peta.harga === null && dua.ragu.length === 2, JSON.stringify([dua.peta.harga, dua.ragu]))
  const koreksi = petakanKolom('rencana', ['Kode', 'Uraian', 'Harga', 'Harga Satuan'], () => [], { harga: 3 })
  ok('A5 pilihan pengguna menang dan kolom lain dilepas', koreksi.peta.harga === 3 && !koreksi.ragu.some(r => r.indeks === 3))
  ok('A6 jangkar dikenali dari ISINYA walau judulnya diganti', petakanKolom('rencana', ['Kode', 'Uraian', 'x'], i => (i === 2 ? ['R:12'] : [])).jangkar === 2)
  ok('A7 tanggal: ISO, dd/mm/yyyy, "1 Maret 2026", Date Excel, nomor seri; tanggal mustahil = galat',
    bacaTanggal('2026-03-01').nilai === '2026-03-01' && bacaTanggal('01/03/2026').nilai === '2026-03-01' && bacaTanggal('1 Maret 2026').nilai === '2026-03-01'
    && bacaTanggal(new Date(Date.UTC(2026, 2, 1))).nilai === '2026-03-01' && bacaTanggal(46082).nilai === '2026-03-01' && !!bacaTanggal('31/02/2026').galat)
  ok('A8 keputusan: kosong = Belum, "Didanai"/"danai"/"ya" = Didanai, "tidak" = Tidak didanai, teks lain = ditanyakan (galat)',
    bacaNilai('keputusan', '').nilai === 'BELUM' && bacaNilai('keputusan', 'Belum ditandai').nilai === 'BELUM' && bacaNilai('keputusan', 'Didanai').nilai === 'DIDANAI'
    && bacaNilai('keputusan', 'danai').nilai === 'DIDANAI' && bacaNilai('keputusan', 'ya').nilai === 'DIDANAI' && bacaNilai('keputusan', 'Tidak').nilai === 'TIDAK_DIDANAI'
    && bacaNilai('keputusan', 'Tidak didanai').nilai === 'TIDAK_DIDANAI' && !!bacaNilai('keputusan', 'mungkin').galat)
  ok('A9 jenis: label PRIMA & kata kunci ("ganti", "rehab"); angka gaya Indonesia & Inggris; sumber tak dikenal = galat',
    bacaNilai('jenis', 'Penggantian').nilai === 'PENGGANTIAN' && bacaNilai('jenis', 'ganti unit').nilai === 'PENGGANTIAN' && bacaNilai('jenis', 'Rehab / renovasi').nilai === 'REHAB'
    && bacaNilai('angka', '1.250.000').nilai === 1250000 && bacaNilai('angka', '12,5').nilai === 12.5 && bacaNilai('angka', '1,250.50').nilai === 1250.5
    && !!bacaNilai('sumber', 'APBN').galat && bacaNilai('sumber', 'blud').nilai === 'BLUD')
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\nB. Bolak-balik: berkas yang ditulis PRIMA terbaca sama persis dengan potretnya')
const ref = kelengkapanRef(3, 3, 0)
const bahan: BahanBukuRencana = {
  tahun: 2065, hariIni: '2065-06-01',
  rencana: [
    { id: 1, canonical_id: 'BBA-1', uraian: 'Laptop', barang_nama: 'Laptop', sumber_anggaran: 'BLUD', vol: 2, satuan: 'unit', harga: 10.5, nilai_rencana: 21, anggaran: 'DIDANAI', anggaran_nilai: 21, jenis_rencana: 'PENAMBAHAN', tgl_proses: '2065-02-01', vol_realisasi: 2, nilai_realisasi: 19, usulan_no: null, alasan: null, status: 'REALISASI_PENUH', usulan_keputusan: null, barang_id: 1, ref, belum_dicatat: 1 },
    { id: 2, canonical_id: 'BBA-2', uraian: 'Kursi', barang_nama: null, sumber_anggaran: 'APBD', vol: 1, satuan: null, harga: 5, nilai_rencana: 5, anggaran: 'BELUM', anggaran_nilai: null, jenis_rencana: null, tgl_proses: null, vol_realisasi: 0, nilai_realisasi: 0, usulan_no: null, alasan: 'rusak', status: 'DIRENCANAKAN', usulan_keputusan: null, barang_id: null, ref: kelengkapanRef(0, 0, 0), belum_dicatat: 0 },
    { id: 3, canonical_id: 'BBA-3', uraian: 'Ditolak', barang_nama: null, sumber_anggaran: 'BLUD', vol: 1, satuan: null, harga: 99, nilai_rencana: 99, anggaran: 'BELUM', anggaran_nilai: null, jenis_rencana: null, tgl_proses: null, vol_realisasi: 0, nilai_realisasi: 0, usulan_no: 'U-1', alasan: null, status: 'DIRENCANAKAN', usulan_keputusan: 'DITOLAK', barang_id: null, ref, belum_dicatat: 0 },
  ],
  penerimaan: [{ id: 7, rencana_id: 1, tgl: '2065-03-01', vol: 2, harga_satuan: 9.5, nilai: 19, merk_tipe: 'Merk A', penyedia: 'PT Satu', catatan: null, pindahan: false, ditempatkan: 1 }],
  penawaran: [{ id: 9, penawaran_id: 4, rekanan: 'PT X', nomor_surat: '1', tgl_surat: '2065-01-01', berlaku_sampai: '2065-05-01', file_id: null, barang_id: 1, barang_nama: 'Laptop', nama_barang: 'Laptop', merk_tipe: null, spesifikasi: 'i5', satuan: 'unit', harga_satuan: 11 }],
}
const asal = potretDariBahan(bahan)
const meta: MetaPrima = {
  rencana: { 1: { label: 'BBA-1 · Laptop', versi: 4 }, 2: { label: 'BBA-2 · Kursi', versi: 1 }, 3: { label: 'BBA-3 · Ditolak', versi: 0, ditolakUsulan: true, terkunciUsulan: true } },
  pengadaan: { 1: { label: 'BBA-1 · Laptop', versi: 4 } }, penerimaan: { 7: { label: 'BBA-1 · diterima' } }, penawaran: { 9: { label: 'PT X · Laptop', versi: 2 } },
}
{
  const wb = new ExcelJS.Workbook(); tulisBukuRencana(wb, bahan)
  const b = await bacaWb(wb)
  const beda: string[] = []
  for (const l of ['rencana', 'pengadaan', 'penerimaan', 'penawaran'] as LembarBalik[]) {
    if (!b[l].ada) beda.push(`${l} tidak terbaca`)
    for (const r of b[l].baris) {
      if (r.id === null) { beda.push(`${l} baris ${r.baris} tanpa jangkar`); continue }
      for (const [k, v] of Object.entries(r.nilai)) if (!samaNilai(SPEK[l][k].nilai, v, asal[l][String(r.id)]?.[k])) beda.push(`${l}#${r.id}.${k}: ${v} ≠ ${asal[l][String(r.id)]?.[k]}`)
      if (Object.keys(r.galat).length) beda.push(`${l}#${r.id} galat ${JSON.stringify(r.galat)}`)
    }
  }
  ok('B1 tiap sel yang bisa dibawa balik terbaca = potret (penulis & pembaca satu daftar); baris JUMLAH & nomor kolom dilewati', beda.length === 0 && b.rencana.baris.length === 3 && b.penerimaan.baris.length === 1, beda.slice(0, 4).join(' | '))
  ok('B2 kolom Jangkar tersembunyi dan berawalan per lembar', wb.getWorksheet('Rencana')!.getColumn(KOLOM_LAPORAN.rencana.length + 1).hidden && String(wb.getWorksheet('Pengadaan')!.getCell(9, KOLOM_LAPORAN.pengadaan.length + 1).value) === 'D:1')
  const t = gabungTigaArah(b, asal, asal, meta)
  ok('B3 berkas tidak disunting → tidak ada usulan, baris baru, atau catatan', !t.ubah.length && !t.baru.length && !t.catatan.length, JSON.stringify(t).slice(0, 300))

  // Suntingan "di Drive": judul Harga diganti, harga BBA-1 diubah, satu kolom & satu baris baru (sesudah baris JUMLAH).
  const ws = wb.getWorksheet('Rencana')!
  const cH = kolom(ws, 'Harga Satuan'), cU = kolom(ws, 'Uraian'), cK = kolom(ws, 'Keputusan'), cN = kolom(ws, 'Nilai Rencana')
  ws.getCell(7, cH).value = 'Harga/Unit'
  ws.getCell(barisKode(ws, 'BBA-1'), cH).value = 12
  ws.getCell(barisKode(ws, 'BBA-2'), cN).value = 999
  ws.getCell(7, 20).value = 'Catatan rapat'; ws.getCell(barisKode(ws, 'BBA-1'), 20).value = 'ok'
  const akhir = ws.rowCount + 1
  ws.getCell(akhir, cU).value = 'Meja kerja'; ws.getCell(akhir, kolom(ws, 'Vol')).value = 3; ws.getCell(akhir, cH).value = '250.000'; ws.getCell(akhir, cK).value = 'Didanai'
  ws.getCell(barisKode(ws, 'BBA-3'), cH).value = 1
  const t2 = gabungTigaArah(await bacaWb(wb), asal, asal, meta)
  const u1 = t2.ubah.find(u => u.id === 1)
  ok('B4 harga diubah di kolom berjudul baru → usulan BBA-1 harga 10,5 → 12', u1?.sel.length === 1 && u1.sel[0].kunci === 'harga' && u1.sel[0].asal === 10.5 && u1.sel[0].drive === 12 && u1.sel[0].jenis === 'usul', JSON.stringify(t2.ubah))
  ok('B5 baris baru (tanpa jangkar, sesudah baris JUMLAH) → rencana baru dengan angka gaya Indonesia & keputusan', t2.baru.length === 1 && t2.baru[0].nilai.harga === 250000 && t2.baru[0].nilai.vol === 3 && t2.baru[0].nilai.keputusan === 'DIDANAI' && !t2.baru[0].tolak, JSON.stringify(t2.baru))
  ok('B5b kolom buatan pengguna "Catatan rapat" tidak dibaca sebagai kolom PRIMA apa pun (bukan Alasan)', (await bacaWb(wb)).rencana.peta?.asing.some(a => a.judul === 'Catatan rapat') && !t2.ubah.some(u => u.sel.some(s => s.kunci === 'alasan')))
  ok('B6 kolom hitungan diubah → disebut "dihitung PRIMA", bukan usulan; usulan ditolak tidak diubah', t2.catatan.some(c => c.jenis === 'hitung' && c.teks.includes('BBA-2')) && t2.catatan.some(c => c.jenis === 'terkunci-usulan' && c.teks.includes('BBA-3')) && !t2.ubah.some(u => u.id === 2 || u.id === 3))
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\nC. Gabung tiga arah')
const salin = (p: Potret): Potret => structuredClone(p)
const berkasDari = (p: Potret, ubah?: (b: BacaanBerkas) => void): BacaanBerkas => {
  const b = Object.fromEntries((Object.keys(p) as LembarBalik[]).map(l => [l, { ada: true, peta: null, baris: Object.entries(p[l]).map(([id, nilai], i) => ({ baris: 8 + i, id: Number(id), jangkarAsing: null, nilai: { ...nilai }, galat: {} })) }])) as BacaanBerkas
  ubah?.(b); return b
}
{
  const prima = salin(asal); prima.rencana[1].alasan = 'dari B'; prima.rencana[2].harga = 8
  const drive = berkasDari(asal, b => { b.rencana.baris[0].nilai.harga = 12; b.rencana.baris[1].nilai.harga = 7; b.rencana.baris[0].nilai.uraian = 'Laptop'; })
  const t = gabungTigaArah(drive, asal, prima, meta)
  const s1 = t.ubah.find(u => u.id === 1)?.sel ?? [], s2 = t.ubah.find(u => u.id === 2)?.sel ?? []
  ok('C1 hanya Drive mengubah → usulan; hanya PRIMA mengubah → nilai PRIMA dipertahankan (bukan usulan)', s1.length === 1 && s1[0].kunci === 'harga' && s1[0].jenis === 'usul' && t.dipertahankan >= 1, JSON.stringify(t.ubah))
  ok('C2 keduanya mengubah ke nilai berbeda → BENTURAN dengan asal, Drive, PRIMA', s2.length === 1 && s2[0].jenis === 'benturan' && s2[0].asal === 5 && s2[0].drive === 7 && s2[0].prima === 8)
  const sama = gabungTigaArah(berkasDari(asal, b => { b.rencana.baris[1].nilai.harga = 8 }), asal, prima, meta)
  ok('C3 keduanya mengubah ke nilai yang SAMA → tidak ada usulan', !sama.ubah.some(u => u.id === 2))

  // §6A urutan 2: A menyunting salinan LAMA. Kiriman 1 = asal; kiriman 2 sudah memuat alasan B; berkas A dari kiriman 1.
  const kiriman2 = salin(asal); kiriman2.rencana[1].alasan = 'dari B'
  const dariLama = berkasDari(asal, b => { b.rencana.baris[1].nilai.harga = 6 })
  const i = pilihAsal(dariLama, [asal, kiriman2])
  const lama = gabungTigaArah(dariLama, [asal, kiriman2][i], kiriman2, meta)
  ok('C4 salinan lama: asal = kiriman yang paling cocok (bukan yang terakhir) → perubahan B TIDAK terbalik', i === 0 && !lama.ubah.some(u => u.id === 1) && lama.ubah.find(u => u.id === 2)?.sel[0].drive === 6, JSON.stringify([i, lama.ubah]))
  const salah = gabungTigaArah(dariLama, kiriman2, kiriman2, meta)
  ok('C4b (pembanding) memakai kiriman terakhir sebagai asal akan mengusulkan pembalikan alasan B', salah.ubah.some(u => u.id === 1 && u.sel.some(s => s.kunci === 'alasan')))
  ok('C4c seri skor → yang terbaru', pilihAsal(berkasDari(asal), [asal, salin(asal)]) === 1)

  const tanpa = gabungTigaArah(berkasDari(asal, b => { b.rencana.baris[0].nilai.harga = 12 }), null, prima, meta)
  ok('C5 tanpa potret asal → beda Drive vs PRIMA tampil "tanpa-asal" (tidak dicentang)', tanpa.ubah.length > 0 && tanpa.ubah.every(u => u.sel.every(s => s.jenis === 'tanpa-asal')))

  const primaPlus = salin(asal); primaPlus.rencana[50] = { ...asal.rencana[2], uraian: 'Baru dari B' }
  const hilang = berkasDari(asal, b => { b.rencana.baris = b.rencana.baris.filter(r => r.id !== 2) })
  const th = gabungTigaArah(hilang, asal, primaPlus, { ...meta, rencana: { ...meta.rencana, 50: { label: 'BBA-50 · Baru dari B', versi: 0 } } })
  ok('C6 baris dihapus di Drive → disebut saja; catatan baru B (tidak ada di asal) TIDAK dibaca sebagai dihapus', th.catatan.some(c => c.jenis === 'dihapus-drive' && c.teks.includes('BBA-2')) && !th.catatan.some(c => c.teks.includes('BBA-50')))
  const primaMinus = salin(asal); delete primaMinus.rencana[2]
  ok('C6b dihapus di KEDUA sisi → tidak disebut "di PRIMA tetap ada"', !gabungTigaArah(hilang, asal, primaMinus, meta).catatan.some(c => c.jenis === 'dihapus-drive'))
  const tm = gabungTigaArah(berkasDari(asal, b => { b.rencana.baris[1].nilai.harga = 6 }), asal, primaMinus, meta)
  ok('C7 diubah di Drive tapi sudah dihapus di PRIMA → tidak bisa diterapkan, disebut', tm.catatan.some(c => c.jenis === 'dihapus-prima') && !tm.ubah.some(u => u.id === 2))

  const baru = berkasDari(asal, b => {
    const n = { ...asal.rencana[2] }
    b.rencana.baris.push({ baris: 30, id: null, jangkarAsing: null, nilai: n, galat: {} }, { baris: 31, id: null, jangkarAsing: null, nilai: { ...n, uraian: 'Lemari', harga: 77 }, galat: {} },
      { baris: 32, id: null, jangkarAsing: null, nilai: { ...n, uraian: 'Lemari', harga: 77 }, galat: {} }, { baris: 33, id: null, jangkarAsing: null, nilai: { ...n, uraian: null }, galat: {} })
    b.penerimaan.baris.push({ baris: 40, id: null, jangkarAsing: null, nilai: { ...asal.penerimaan[7] }, galat: {} })
    b.rencana.baris.push({ baris: 41, id: null, jangkarAsing: 'T:7', nilai: {}, galat: {} })
  })
  const tb = gabungTigaArah(baru, asal, asal, meta)
  const kb = (bar: number) => tb.baru.find(x => x.baris === bar)
  ok('C8 baris baru mirip catatan PRIMA → "mungkin kembar"; dua baris baru kembar → yang kedua ditandai; tanpa uraian ditolak',
    !!kb(30)?.kembar && !kb(31)?.kembar && !!kb(32)?.kembar && !!kb(33)?.tolak, JSON.stringify(tb.baru.map(b => [b.baris, b.kembar, b.tolak])))
  ok('C9 penerimaan baru yang sama (kode, tanggal, jumlah) → mungkin kembar; jangkar lembar lain → dilewati', !!kb(40)?.kembar && tb.catatan.some(c => c.jenis === 'jangkar-asing'))
  const pt = gabungTigaArah(berkasDari(asal, b => { b.penerimaan.baris[0].nilai.harga = 9 }), asal, asal, meta)
  ok('C10 penerimaan tercatat diubah di berkas → disebut "hapus lalu catat ulang", bukan usulan', !pt.ubah.length && pt.catatan.some(c => c.jenis === 'penerimaan-tetap'))
  const bt = barangBelumAda(gabungTigaArah(berkasDari(asal, b => { b.rencana.baris[1].nilai.barang = 'Laptp' }), asal, asal, meta), ['Laptop', 'Kursi Roda'])
  ok('C11 barang belum ada di Master → ditawarkan, dengan "maksudnya …?" bila mirip; nama beda huruf tidak dianggap baru',
    bt.length === 1 && bt[0].mirip === 'Laptop' && barangBelumAda(gabungTigaArah(berkasDari(asal, b => { b.rencana.baris[1].nilai.barang = 'laptop' }), asal, asal, meta), ['Laptop']).length === 0
    && barangMirip('Meja', ['Laptop', 'Kursi Roda']) === null)
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\nD. Deteksi & tahanan')
{
  const s: StatusBerkasDrive = catatHasilKirim({}, 'S1', { fileId: 'F', pada: 'x', md5: 'M1', revisi: 'r1' })
  const meta = (md5: string, revisi = 'rX') => ({ md5, revisi, oleh: 'A', diubahPada: '2065-01-01T00:00:00Z', trashed: false })
  ok('D1 md5 sama dengan kiriman → tidak ada perubahan luar (revisi berbeda tidak dihitung)', periksaLuar(s, meta('M1', 'r9')) === null)
  const l = periksaLuar(s, meta('M2', 'r2'))
  ok('D2 md5 beda → perubahan luar tercatat (revisi, pengubah) dan kiriman ditahan, "kirim sekarang" pun', l?.revisi === 'r2' && l.oleh === 'A' && !putuskanKirim({ ...s, luar: l }, 'S2', 1e9, true).kirim)
  ok('D3 disunting lagi sesudah terdeteksi → yang ditinjau versi terbaru', periksaLuar({ ...s, luar: l }, meta('M3', 'r3'))?.revisi === 'r3' && periksaLuar({ ...s, luar: l }, meta('M2', 'r2'))?.revisi === 'r2')
  ok('D4 status lama tanpa md5 kiriman → tidak bisa dinilai, tidak ditahan', periksaLuar({}, meta('M2')) === null)
  const lepas = lepasTahanan({ ...s, luar: l }, 'M2')
  ok('D5 sesudah ditinjau: isi yang ditinjau tidak dianggap baru lagi, dan kiriman berikutnya PASTI jalan', periksaLuar(lepas, meta('M2', 'r2')) === null && putuskanKirim(lepas, 'S1', 1, false).kirim && lepas.revisi_ditinjau === 'r2')
  const rev = [{ id: 'r1', md5: 'M1' }, { id: 'rA', md5: 'MA' }, { id: 'r2', md5: 'M5' }].map(x => ({ ...x, diubahPada: null, oleh: 'A' }))
  ok('D6 suntingan di sela dua kiriman PRIMA → "tertimpa", dibaca dari riwayat', revisiTertimpa(rev, ['r1'], 'r2', new Set(['M1', 'M5']))?.revisi === 'rA' && revisiTertimpa(rev, ['r1'], 'r2', new Set(['M1', 'M5']))?.tertimpa === true)
  ok('D7 revisi yang sudah ditinjau bukan "tertimpa"; revisi kiriman PRIMA sendiri juga bukan', revisiTertimpa(rev, ['r1', 'rA'], 'r2', new Set(['M1', 'M5'])) === null && revisiTertimpa(rev, ['r1'], 'r2', new Set(['M1', 'MA', 'M5'])) === null)
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\nE. MySQL sungguhan + Drive tiruan berrevisi (kotak pasir 2065)')
let c: mysql.Connection | null = null
try {
  c = await mysql.createConnection({ host: process.env.MYSQL_HOST, port: Number(process.env.MYSQL_PORT || 3306), user: process.env.MYSQL_USER, password: process.env.MYSQL_PASSWORD, database: process.env.MYSQL_DATABASE })
} catch (e) { ok(`E0 MySQL bisa dihubungi (${(e as { code?: string }).code ?? e})`, false) }
if (c) {
  const k = c
  const T = 2065, KUNCI = `rencana:${T}`
  const CFG = ['bba_drive_status', 'drive_root', 'drive_subfolder_otomatis']
  const [simpanan] = await k.query('SELECT `key`, value FROM app_config WHERE `key` IN (?)', [CFG]) as [Array<{ key: string; value: string }>, unknown]
  const [[potretAwal]] = await k.query('SELECT COALESCE(MAX(id), 0) AS m FROM bba_drive_potret') as [Array<{ m: number }>, unknown]
  const bersih = async () => {
    await k.query("DELETE FROM buku_besar_aset WHERE tahun_anggaran = ? AND uraian LIKE 'UJID%'", [T])
    await k.query("DELETE FROM bba_penawaran WHERE rekanan LIKE 'UJID%'")
    await k.query("DELETE FROM bba_barang WHERE nama LIKE 'UJID%'")
    await k.query("DELETE FROM drive_arsip WHERE file_id LIKE 'UJID%'")
    await k.query('DELETE FROM bba_drive_potret WHERE id > ?', [Number(potretAwal.m)])
    await k.query('DELETE FROM app_config WHERE `key` IN (?)', [CFG])
  }
  await bersih()
  for (const kr of ['GOOGLE_OAUTH_CLIENT_ID', 'GOOGLE_OAUTH_CLIENT_SECRET', 'GOOGLE_OAUTH_REFRESH_TOKEN']) process.env[kr] = process.env[kr] || 'x'

  // Drive tiruan: berkas berrevisi (md5 isi sungguhan), folder bernama, pengubah per revisi.
  type Rev = { id: string; md5: string; buf: Buffer; waktu: string; oleh: string; me: boolean }
  const berkas = new Map<string, { name: string; parents: string[]; folder: boolean; revs: Rev[] }>()
  let urut = 0
  const md5 = (b: Buffer) => createHash('md5').update(b).digest('hex')
  const tambahRev = (id: string, buf: Buffer, oleh = 'monev', me = true) => { berkas.get(id)!.revs.push({ id: `rev${++urut}`, md5: md5(buf), buf, waktu: new Date(Date.UTC(2065, 0, 1) + urut * 60000).toISOString(), oleh, me }) }
  const isiAliran = async (s: NodeJS.ReadableStream) => { const xs: Buffer[] = []; for await (const ch of s) xs.push(Buffer.from(ch as Buffer)); return Buffer.concat(xs) }
  const metaBerkas = (id: string) => { const f = berkas.get(id)!; const h = f.revs[f.revs.length - 1]; return { id, name: f.name, parents: f.parents, trashed: false, md5Checksum: h?.md5, headRevisionId: h?.id, modifiedTime: h?.waktu, lastModifyingUser: { displayName: h?.oleh, me: h?.me }, size: String(h?.buf.length ?? 0) } }
  const tidakAda = () => Object.assign(new Error('File not found'), { code: 404 })
  /** Kait "pengguna A menyimpan tepat saat PRIMA menimpa" — revisinya masuk SEBELUM revisi PRIMA. */
  let sebelumTimpa: { fileId: string; f: () => Promise<void> } | null = null
  let panggilUpdate: string[] = []
  const { google } = await import('googleapis')
  const asli = google.drive
  ;(google as unknown as { drive: unknown }).drive = () => ({
    files: {
      list: async (o: { q: string }) => {
        const nama = /name = '(.+?)'/.exec(o.q)?.[1], induk = /'(.+?)' in parents/.exec(o.q)?.[1]
        return { data: { files: [...berkas].filter(([, f]) => f.folder && f.name === nama && f.parents.includes(induk!)).map(([id, f]) => ({ id, name: f.name })) } }
      },
      create: async (o: { requestBody: { name: string; mimeType?: string; parents?: string[] }; media?: { body: NodeJS.ReadableStream } }) => {
        const id = `UJID${String(++urut).padStart(8, '0')}`
        const folder = o.requestBody.mimeType === 'application/vnd.google-apps.folder'
        berkas.set(id, { name: o.requestBody.name, parents: o.requestBody.parents ?? [], folder, revs: [] })
        if (!folder) tambahRev(id, await isiAliran(o.media!.body))
        return { data: folder ? { id } : metaBerkas(id) }
      },
      update: async (o: { fileId: string; media: { body: NodeJS.ReadableStream } }) => {
        if (!berkas.has(o.fileId)) throw tidakAda()
        panggilUpdate.push(o.fileId)
        const buf = await isiAliran(o.media.body)
        if (sebelumTimpa?.fileId === o.fileId) { const kait = sebelumTimpa; sebelumTimpa = null; await kait.f() }
        tambahRev(o.fileId, buf)
        return { data: metaBerkas(o.fileId) }
      },
      get: async (o: { fileId: string; alt?: string }) => {
        const f = berkas.get(o.fileId); if (!f) throw tidakAda()
        return { data: o.alt === 'media' ? f.revs[f.revs.length - 1].buf : metaBerkas(o.fileId) }
      },
    },
    revisions: {
      list: async (o: { fileId: string }) => ({ data: { revisions: berkas.get(o.fileId)!.revs.map(r => ({ id: r.id, md5Checksum: r.md5, modifiedTime: r.waktu, lastModifyingUser: { displayName: r.oleh, me: r.me } })) } }),
      get: async (o: { fileId: string; revisionId: string }) => { const r = berkas.get(o.fileId)?.revs.find(x => x.id === o.revisionId); if (!r) throw tidakAda(); return { data: r.buf } },
    },
  })
  /** Pengguna A menyunting berkas di Drive (revisi baru, bukan akun PRIMA). */
  const sunting = async (id: string, f: (wb: ExcelJS.Workbook) => void, dari?: Buffer) => {
    const wb = new ExcelJS.Workbook(); const b = berkas.get(id)!
    await wb.xlsx.load((dari ?? b.revs[b.revs.length - 1].buf) as unknown as ArrayBuffer); f(wb)
    tambahRev(id, Buffer.from(await wb.xlsx.writeBuffer()), 'Pengguna A', false)
  }
  const berkasLaporan = () => [...berkas].find(([, f]) => f.name === `BBA ${T} — Rencana s.d. Pengadaan.xlsx`)?.[0]

  const B = await import('../lib/data/buku-besar-aset')
  const L = await import('../lib/data/bba-laporan')
  const D = await import('../lib/data/bba-drive-balik')
  const W = await import('../lib/data/bba-penawaran')
  const Tj = await import('../lib/services/drive-tujuan')
  const [u] = await k.query('SELECT id FROM users ORDER BY id LIMIT 1') as [Array<{ id: number }>, unknown]
  const uid = Number(u[0].id)
  const izin = { aset: 'EDIT', rencana: 'EDIT', pengadaan: 'EDIT', master: 'EDIT', cetak: 'LIHAT' } as const
  const status = async () => (await L.bacaStatusDrive()).berkas[KUNCI]
  const versi = async (id: number) => (await B.getAsetById(id))!.version
  try {
    await Tj.aturFolderInduk('UJIDINDUK0000001')
    const brg = await B.createBarang({ nama: 'UJID Laptop' }, uid)
    const r1 = await B.createAset({ tahun_anggaran: T, uraian: 'UJID laptop', barang_id: brg.id, jenis_rencana: 'PENAMBAHAN', sumber_anggaran: 'BLUD', vol: 2, harga: 1000, referensi: [{ sumber: 'LAINNYA', harga: 1000 }] }, uid)
    const r2 = await B.createAset({ tahun_anggaran: T, uraian: 'UJID kursi', sumber_anggaran: 'BLUD', vol: 1, harga: 500 }, uid)
    await W.simpanPenawaran({ kepala: { rekanan: 'UJID PT Satu', nomor_surat: 'S-1', tgl_surat: '2065-01-02' }, item: [{ nama_barang: 'UJID meja', harga_satuan: 300 }, { nama_barang: 'UJID kursi', harga_satuan: 150 }] }, uid)

    const k1 = await L.kirimLaporanKeDrive(true)
    const fid = berkasLaporan()!
    const st1 = await status()
    const [[np1]] = await k.query('SELECT COUNT(*) AS n FROM bba_drive_potret WHERE kunci = ?', [KUNCI]) as [Array<{ n: number }>, unknown]
    ok('E1 kiriman mencatat md5 & revisi Drive dan menyimpan potret', k1.status === 'selesai' && !!fid && st1?.md5_terkirim === berkas.get(fid)!.revs.at(-1)!.md5 && !!st1.revisi_terkirim && Number(np1.n) === 1)

    // A menyunting di Drive; B menyimpan di PRIMA.
    await sunting(fid, wb => {
      const ws = wb.getWorksheet('Rencana')!
      ws.getCell(barisKode(ws, r1.canonical_id), kolom(ws, 'Harga Satuan')).value = 1200
      ws.getCell(barisKode(ws, r2.canonical_id), kolom(ws, 'Harga Satuan')).value = 700
      const n = ws.rowCount + 1
      ws.getCell(n, kolom(ws, 'Uraian')).value = 'UJID lemari'; ws.getCell(n, kolom(ws, 'Vol')).value = 3; ws.getCell(n, kolom(ws, 'Harga Satuan')).value = 250
      const wp = wb.getWorksheet('Penawaran')!
      for (let r = 8; r <= wp.rowCount; r++) if (String(wp.getCell(r, kolom(wp, 'Nama di Surat')).value) === 'UJID meja') wp.getCell(r, kolom(wp, 'Harga Satuan')).value = 280
    })
    await B.updateAset({ id: r1.id, expected_version: await versi(r1.id), alasan: 'dari B' }, uid)
    await B.updateAset({ id: r2.id, expected_version: await versi(r2.id), harga: 800 }, uid)
    const suratB = (await W.listPenawaran('UJID PT Satu'))[0]
    await W.simpanPenawaran({ id: suratB.id, expected_version: suratB.version, kepala: { rekanan: suratB.rekanan, nomor_surat: suratB.nomor_surat, tgl_surat: suratB.tgl_surat },
      item: [...suratB.item.map(i => ({ id: i.id, nama_barang: i.nama_barang, harga_satuan: i.harga_satuan })), { nama_barang: 'UJID rak dari B', harga_satuan: 90 }] }, uid)

    panggilUpdate = []
    const k2 = await L.kirimLaporanKeDrive(false)
    const st2 = await status()
    ok('E2 cron: berkas diubah di luar PRIMA → DITAHAN, tidak ditimpa; pengubah tercatat', k2.status === 'selesai' && k2.ditahan.length === 1 && !panggilUpdate.includes(fid) && st2?.luar?.oleh === 'Pengguna A' && !st2.luar.tertimpa, JSON.stringify([k2, st2?.luar]))
    ok('E3 status spanduk (baca DB saja) menyebut berkasnya', (await D.menungguTinjauan()).some(m => m.kunci === KUNCI && m.tahun === T))
    const k2b = await L.kirimLaporanKeDrive(true)
    ok('E3b "Kirim sekarang" juga tidak menimpa berkas yang ditahan', k2b.status === 'selesai' && !panggilUpdate.includes(fid))

    const p = await D.pratinjauDriveBalik(KUNCI)
    const u1 = p.tinjauan.ubah.find(x => x.lembar === 'rencana' && x.id === r1.id), u2 = p.tinjauan.ubah.find(x => x.lembar === 'rencana' && x.id === r2.id)
    const w1 = p.tinjauan.ubah.find(x => x.lembar === 'penawaran')
    ok('E4 pratinjau: harga A (tanpa benturan) = usulan; alasan B tidak diusulkan balik; harga A vs B = benturan',
      u1?.sel.length === 1 && u1.sel[0].kunci === 'harga' && u1.sel[0].jenis === 'usul' && u1.sel[0].drive === 1200
      && u2?.sel[0].jenis === 'benturan' && u2.sel[0].drive === 700 && u2.sel[0].prima === 800 && p.tinjauan.dipertahankan >= 1 && p.asal.ada, JSON.stringify(p.tinjauan.ubah))
    ok('E5 pratinjau: baris baru A = rencana baru; item penawaran baru B tidak dibaca sebagai "dihapus"; harga item penawaran = usulan',
      p.tinjauan.baru.some(b => b.lembar === 'rencana' && b.label === 'UJID lemari') && w1?.sel[0].drive === 280 && !p.tinjauan.catatan.some(c => c.teks.includes('rak dari B')), JSON.stringify([p.tinjauan.baru, w1]))
    ok('E6 pratinjau tidak menulis apa pun', (await B.getAsetById(r1.id))!.harga === 1000 && !!(await status())?.luar)

    const pilih = (sel2: Record<string, 'drive' | 'prima'>) => ({
      kunci: KUNCI, revisi: p.luar.revisi, peta: null, barangBaru: [], barangPeta: {},
      ubah: [{ lembar: 'rencana' as const, id: r1.id, versi: u1!.versi, sel: { harga: 'drive' as const } }, { lembar: 'rencana' as const, id: r2.id, versi: u2!.versi, sel: sel2 },
        { lembar: 'penawaran' as const, id: w1!.id, versi: w1!.versi, sel: { harga: 'drive' as const } }],
      baru: p.tinjauan.baru.filter(b => b.label === 'UJID lemari').map(b => ({ lembar: b.lembar, baris: b.baris })),
    })
    const tanpaPilih = await coba(() => D.terapkanDriveBalik(pilih({}), uid, izin))
    ok('E7 benturan belum dipilih → ditolak server, tidak ada yang ditulis', tanpaPilih instanceof D.TinjauanDriveError && tanpaPilih.code === 'BENTURAN_BELUM_DIPILIH' && (await B.getAsetById(r1.id))!.harga === 1000)
    const basi = await coba(() => D.terapkanDriveBalik({ ...pilih({ harga: 'prima' }), revisi: 'revisi-lama' }, uid, izin))
    ok('E8 revisi pratinjau ≠ revisi yang menunggu → PRATINJAU_BASI', basi instanceof D.TinjauanDriveError && basi.code === 'PRATINJAU_BASI')
    // A menyimpan lagi SESUDAH pratinjau dibuka, sebelum cron sempat mendeteksinya: suntingan terbarunya belum ditinjau.
    await sunting(fid, wb => { const ws = wb.getWorksheet('Rencana')!; ws.getCell(barisKode(ws, r2.canonical_id), kolom(ws, 'Satuan')).value = 'set' })
    const lagi = await coba(() => D.terapkanDriveBalik(pilih({ harga: 'prima' }), uid, izin))
    berkas.get(fid)!.revs.pop()
    ok('E8b berkas di Drive disimpan lagi sesudah pratinjau → PRATINJAU_BASI, tidak ada yang ditulis', lagi instanceof D.TinjauanDriveError && lagi.code === 'PRATINJAU_BASI' && (await B.getAsetById(r1.id))!.harga === 1000)
    await k.query('START TRANSACTION')
    await k.query("SELECT version FROM blud_locks WHERE entity = 'bba_drive' AND key_id = 'kirim' FOR UPDATE")
    const sibuk = await coba(() => D.terapkanDriveBalik(pilih({ harga: 'prima' }), uid, izin))
    await k.query('ROLLBACK')
    ok('E9 pengirim/peninjau lain memegang kunci → SIBUK tanpa menunggu', sibuk instanceof D.TinjauanDriveError && sibuk.code === 'SIBUK')

    const h = await D.terapkanDriveBalik(pilih({ harga: 'prima' }), uid, izin)
    const a1 = await B.getAsetById(r1.id), a2 = await B.getAsetById(r2.id)
    const [lemari] = await k.query("SELECT COUNT(*) AS n FROM buku_besar_aset WHERE tahun_anggaran = ? AND uraian = 'UJID lemari'", [T]) as [Array<{ n: number }>, unknown]
    const suratKini = (await W.listPenawaran('UJID PT Satu'))[0]
    ok('E10 terapkan: harga A masuk, alasan B tetap, benturan dipilih PRIMA, rencana baru dibuat', a1!.harga === 1200 && a1!.alasan === 'dari B' && a2!.harga === 800 && Number(lemari[0].n) === 1 && h.ditolak.length === 0, JSON.stringify(h))
    ok('E11 penawaran: harga item A diterapkan dan item yang baru ditambahkan B di PRIMA TETAP ada', suratKini.item.length === 3 && suratKini.item.find(i => i.nama_barang === 'UJID meja')?.harga_satuan === 280 && suratKini.item.some(i => i.nama_barang === 'UJID rak dari B'), JSON.stringify(suratKini.item.map(i => [i.nama_barang, i.harga_satuan])))
    const st3 = await status()
    const [[np2]] = await k.query('SELECT COUNT(*) AS n FROM bba_drive_potret WHERE kunci = ?', [KUNCI]) as [Array<{ n: number }>, unknown]
    ok('E12 tahanan dilepas; potret dipangkas jadi satu', !st3?.luar && !!st3?.md5_ditinjau && Number(np2.n) === 1)

    panggilUpdate = []
    const k3 = await L.kirimLaporanKeDrive(false)
    const st4 = await status()
    ok('E13 kiriman berikutnya PASTI jalan dan menimpa berkas dengan hasil gabungan; tidak ada tahanan baru', k3.status === 'selesai' && panggilUpdate.includes(fid) && !st4?.luar && st4?.md5_terkirim === berkas.get(fid)!.revs.at(-1)!.md5, JSON.stringify([k3, st4?.luar]))
    const isiBaru = new ExcelJS.Workbook(); await isiBaru.xlsx.load(berkas.get(fid)!.revs.at(-1)!.buf as unknown as ArrayBuffer)
    const wr = isiBaru.getWorksheet('Rencana')!
    ok('E14 berkas Drive kini memuat hasil gabungan', Number(wr.getCell(barisKode(wr, r1.canonical_id), kolom(wr, 'Harga Satuan')).value) === 1200 && String(wr.getCell(barisKode(wr, r1.canonical_id), kolom(wr, 'Alasan')).value) === 'dari B')

    // §6A urutan 3: A menyimpan tepat saat PRIMA sedang menimpa.
    await B.updateAset({ id: r2.id, expected_version: await versi(r2.id), alasan: 'pemicu kiriman' }, uid)
    sebelumTimpa = { fileId: fid, f: () => sunting(fid, wb => { const ws = wb.getWorksheet('Rencana')!; ws.getCell(barisKode(ws, r1.canonical_id), kolom(ws, 'Uraian')).value = 'UJID laptop kantor' }) }
    const k4 = await L.kirimLaporanKeDrive(true)
    const st5 = await status()
    ok('E15 suntingan yang tertimpa kiriman otomatis terdeteksi dari riwayat revisi ("tertimpa")', k4.status === 'selesai' && k4.ditahan.length === 1 && !!st5?.luar?.tertimpa && st5.luar.oleh === 'Pengguna A', JSON.stringify(st5?.luar))
    if (st5?.luar) {
      const p2 = await D.pratinjauDriveBalik(KUNCI)
      ok('E16 pratinjau membaca revisi A dari riwayat: uraian A = usulan; alasan B yang lebih baru tidak terbalik',
        p2.tinjauan.ubah.some(x => x.id === r1.id && x.sel.some(s => s.kunci === 'uraian' && s.drive === 'UJID laptop kantor')) && !p2.tinjauan.ubah.some(x => x.id === r2.id && x.sel.some(s => s.kunci === 'alasan')), JSON.stringify(p2.tinjauan.ubah))
      await D.abaikanDriveBalik(KUNCI, p2.luar.revisi)
      panggilUpdate = []
      await L.kirimLaporanKeDrive(false)
      const st6 = await status()
      ok('E17 abaikan: tidak ada yang ditulis (uraian PRIMA tetap), tahanan lepas, kiriman berikutnya menimpa', (await B.getAsetById(r1.id))!.uraian === 'UJID laptop' && !st6?.luar && panggilUpdate.includes(fid))
    }
  } finally {
    ;(google as unknown as { drive: unknown }).drive = asli
    await bersih()
    for (const s of simpanan) await k.query('INSERT INTO app_config (`key`, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)', [s.key, s.value])
    const [[x]] = await k.query("SELECT COUNT(*) AS n FROM buku_besar_aset WHERE tahun_anggaran = ? AND uraian LIKE 'UJID%'", [T]) as [Array<{ n: number }>, unknown]
    ok('E18 kotak pasir bersih, app_config dikembalikan', Number(x.n) === 0)
    await k.end()
  }
}

console.log(`\n${lulus} lulus, ${gagal.length} gagal`)
if (gagal.length) { console.log(gagal.map(g => `  - ${g}`).join('\n')); process.exit(1) }
process.exit(0)
