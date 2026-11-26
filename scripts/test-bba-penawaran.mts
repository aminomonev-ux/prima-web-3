#!/usr/bin/env npx tsx
// scripts/test-bba-penawaran.mts — Tahap 5 revamp alur BBA: Penawaran Rekanan (per surat, Bandingkan, Ambil dari penawaran,
// impor Excel). Konsep: docs/konsep/bba/CONCEPT-bba-revamp-alur.md §5A.
// Jalankan: npx tsx --env-file=.env.local scripts/test-bba-penawaran.mts
// Bagian D memakai MySQL sungguhan (data berawalan "UJIW"), dibersihkan otomatis. Tanpa MySQL = GAGAL.
import { readFileSync } from 'node:fs'
import ExcelJS from 'exceljs'
import mysql from 'mysql2/promise'
import { bandingkanPenawaran, urutUntukRencana, referensiDariPenawaran, masihBerlaku, kunciSatuan, type ItemPenawaran } from '../lib/bba/penawaran'
import { bacaPenawaranWorkbook, bacaPenawaranGrid, tulisTemplatPenawaran } from '../lib/bba/penawaran-impor'
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
  barang_id: 1, barang_nama: 'Laptop', nama_barang: 'Laptop', merk_tipe: null, spesifikasi: null, satuan: 'unit', harga_satuan: 100, ...o,
})
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
  ok('A3 sel = penawaran TERBARU yang masih berlaku (PT A 110, bukan 90 yang lebih baru tapi kedaluwarsa)', unit.sel['PT A'].item.harga_satuan === 110 && unit.sel['PT A'].berlaku)
  ok('A4 rekanan yang semua penawarannya kedaluwarsa tetap tampil, tapi tidak termurah & tidak ikut rata-rata', !unit.sel['PT C'].berlaku && !unit.sel['PT C'].termurah && unit.rata === Math.round((110 + 105) / 2))
  ok('A5 termurah = PT B 105 (yang berlaku)', unit.sel['PT B'].termurah && !unit.sel['PT A'].termurah)
  ok('A6 satuan beda = baris terpisah; item tanpa barang dikumpulkan terpisah', b.baris.length === 2 && b.baris.some(x => x.satuan === 'paket') && b.belumDitautkan.length === 1 && unit.jumlah === 5)
  const urut = urutUntukRencana(items.filter(i => i.barang_id === 1 && kunciSatuan(i.satuan) === 'unit'), HARI)
  ok('A7 "Ambil dari penawaran": yang berlaku dulu, termurah di atas; kedaluwarsa di bawah', urut[0].harga_satuan === 105 && urut.at(-1)!.berlaku === false)
}
{
  const r = referensiDariPenawaran(it({ rekanan: 'CV Medika', merk_tipe: 'X-1', harga_satuan: 5000, tgl_surat: '2026-02-02' }))
  const tanpa = referensiDariPenawaran(it({ file_id: null }))
  ok('A8 salinan referensi: penyedia = rekanan, tanggal = tanggal surat, berkas surat, jejak id; sah hanya bila suratnya berberkas',
    r.nama_penyedia === 'CV Medika' && r.tgl_cek === '2026-02-02' && r.merk_tipe === 'X-1' && !!r.penawaran_item_id && referensiSah(r) && !referensiSah(tanpa))
  ok('A9 rapikanReferensi membawa jejak penawaran (dan tidak menambah kunci kosong untuk referensi biasa)', rapikanReferensi([r])[0].penawaran_item_id === r.penawaran_item_id
    && !('penawaran_item_id' in rapikanReferensi([{ ...r, penawaran_item_id: null }])[0]))
}

console.log('\nB. Impor Excel')
{
  const wb = new ExcelJS.Workbook(); tulisTemplatPenawaran(wb)
  const buf = await wb.xlsx.writeBuffer(); const wb2 = new ExcelJS.Workbook(); await wb2.xlsx.load(buf as ArrayBuffer)
  const h = bacaPenawaranWorkbook(wb2)
  ok('B1 templat seragam (berkop, kepala baris 7) terbaca balik', h.item.length === 1 && h.item[0].nama_barang === 'Laptop' && h.item[0].harga_satuan === 12_500_000 && h.masalah.length === 0, JSON.stringify(h))
  const polos = bacaPenawaranGrid([['Nama Barang', 'Satuan', 'Harga'], ['Kursi roda', 'unit', 'Rp 2.450.000'], ['Tensimeter', '', '1.250.000,50'], ['Tanpa harga', 'unit', ''], ['', '', '']])
  ok('B2 berkas polos: harga gaya Indonesia dibaca, baris tanpa harga dilewati & disebut', polos.item.length === 2 && polos.item[0].harga_satuan === 2_450_000
    && polos.item[1].harga_satuan === 1_250_000.5 && polos.dilewati.length === 1 && polos.dilewati[0].includes('Tanpa harga'))
  ok('B3 tanpa kolom nama & harga → ditolak dengan petunjuk templat', bacaPenawaranGrid([['A', 'B'], ['x', 'y']]).masalah[0]?.includes('templat'))
}

console.log('\nC. Skema, route, layar')
ok('C1 skema: minimal satu item, harga > 0, berlaku tidak sebelum tanggal surat, barang_id XOR barang_baru', !PenawaranSimpanSchema.safeParse({ kepala: { rekanan: 'A', tgl_surat: '2026-01-02' }, item: [] }).success
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
  const skema = sumber('docs/schema-mysql.sql'), mig = sumber('docs/migrations/migration-bba-penawaran.sql')
  ok('C5 migrasi + skema acuan: dua tabel + kolom jejak, tanpa IF NOT EXISTS pada ADD COLUMN; FK barang RESTRICT',
    mig.includes('CREATE TABLE bba_penawaran (') && mig.includes('CREATE TABLE bba_penawaran_item (') && mig.includes('ADD COLUMN penawaran_item_id') && !/ADD COLUMN IF NOT EXISTS/i.test(mig)
    && skema.includes('CREATE TABLE IF NOT EXISTS bba_penawaran_item') && skema.indexOf('CREATE TABLE IF NOT EXISTS bba_barang') < skema.indexOf('CREATE TABLE IF NOT EXISTS bba_penawaran_item')
    && mig.includes('REFERENCES bba_barang(id) ON DELETE RESTRICT'))
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
    await B.updateAset({ id: r.id, expected_version: (await B.getAsetById(r.id))!.version, referensi: [{ ...referensiDariPenawaran(itLap), file_id: null, url: 'https://contoh.test/a' }, { sumber: 'LAINNYA', nama_penyedia: 'x', harga: 1, url: 'https://contoh.test/b', penawaran_item_id: 999_999_999 }] }, userId)
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
  } finally {
    await bersih()
    const [s] = await k.query("SELECT (SELECT COUNT(*) FROM bba_penawaran WHERE rekanan LIKE 'UJIW%') + (SELECT COUNT(*) FROM bba_barang WHERE nama LIKE 'UJIW %') AS n") as [Array<{ n: number }>, unknown]
    ok('D9 kotak pasir bersih', Number(s[0].n) === 0)
    await k.end()
  }
}

console.log(`\n${lulus} lulus, ${gagal.length} gagal`)
if (gagal.length) { console.log(gagal.map(g => `  - ${g}`).join('\n')); process.exit(1) }
process.exit(0)
