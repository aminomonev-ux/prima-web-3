#!/usr/bin/env npx tsx
// scripts/test-bba-laporan.mts — Tahap 6 revamp alur BBA: Unduh Excel seragam (5 lembar) + salinan otomatis ke Drive.
// Konsep: docs/konsep/bba/CONCEPT-bba-revamp-alur.md §5B.
// Jalankan: npx tsx --env-file=.env.local scripts/test-bba-laporan.mts
// Bagian D memakai MySQL sungguhan (kotak pasir 2066, data "UJIL") dan Drive TIRUAN (googleapis diganti di proses ini);
// app_config yang disentuh dikembalikan. Tanpa MySQL = GAGAL.
import { readFileSync } from 'node:fs'
import ExcelJS from 'exceljs'
import mysql from 'mysql2/promise'
import { putuskanKirim, catatHasilKirim, JEDA_DIAM_MS } from '../lib/bba/drive-kirim'
import { tulisBukuRencana, sidikBahan, LEMBAR_BUKU, KOLOM_LAPORAN, type BahanBukuRencana } from '../lib/bba/laporan-excel'
import { kelengkapanRef } from '../lib/bba/referensi'

let lulus = 0
const gagal: string[] = []
function ok(nama: string, syarat: unknown, ket = '') {
  if (syarat) { lulus++; console.log(`  ok  ${nama}`) }
  else { gagal.push(nama); console.log(`FAIL  ${nama}${ket ? ' — ' + ket : ''}`) }
}
const sumber = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')

console.log('A. Kapan dikirim')
{
  const t0 = 1_000_000
  const a = putuskanKirim(undefined, 'S1', t0, false)
  const b = putuskanKirim(a.status, 'S1', t0 + JEDA_DIAM_MS - 1, false)
  const c = putuskanKirim(b.status, 'S1', t0 + JEDA_DIAM_MS, false)
  ok('A1 berubah → menunggu 2 menit diam, baru dikirim', !a.kirim && !b.kirim && c.kirim)
  const d = putuskanKirim(b.status, 'S2', t0 + JEDA_DIAM_MS, false)
  ok('A2 simpan lagi di tengah jeda → hitungan diam mulai lagi (rentetan = satu unggahan)', !d.kirim && d.status.berubah_pada === t0 + JEDA_DIAM_MS)
  ok('A3 paksa (tombol Admin) tidak menunggu', putuskanKirim(undefined, 'S1', t0, true).kirim)
  const terkirim = catatHasilKirim(c.status, 'S1', { fileId: 'F1', pada: '2026-11-26 10:00:00' })
  ok('A4 sesudah terkirim, isi yang sama tidak dikirim lagi (paksa pun tidak)', !putuskanKirim(terkirim, 'S1', t0 + 10 * JEDA_DIAM_MS, false).kirim && !putuskanKirim(terkirim, 'S1', t0, true).kirim)
  const gagalKirim = catatHasilKirim(c.status, 'S1', { galat: 'quota' })
  ok('A5 gagal kirim: tanda "perlu dikirim" tetap, dicoba lagi di putaran berikut; galat disebut', putuskanKirim(gagalKirim, 'S1', t0 + 2 * JEDA_DIAM_MS, false).kirim && gagalKirim.galat === 'quota')
  ok('A6 berkas Drive hilang dari catatan → dikirim ulang walau isinya sama', putuskanKirim({ ...terkirim, file_id: null }, 'S1', t0 + 2 * JEDA_DIAM_MS, false).kirim)
}

console.log('\nB. Isi workbook')
const ref = kelengkapanRef(3, 3, 0)
const bahan: BahanBukuRencana = {
  tahun: 2066, hariIni: '2066-06-01',
  rencana: [
    { id: 1, canonical_id: 'BBA-1', uraian: 'Laptop', barang_nama: 'Laptop', sumber_anggaran: 'BLUD', vol: 2, satuan: 'unit', harga: 10, nilai_rencana: 20, anggaran: 'DIDANAI', anggaran_nilai: 20, jenis_rencana: 'PENAMBAHAN', tgl_proses: '2066-02-01', vol_realisasi: 2, nilai_realisasi: 19, usulan_no: null, alasan: null, status: 'REALISASI_PENUH', usulan_keputusan: null, barang_id: 1, ref, belum_dicatat: 1 },
    { id: 2, canonical_id: 'BBA-2', uraian: 'Kursi', barang_nama: null, sumber_anggaran: 'BLUD', vol: 1, satuan: null, harga: 5, nilai_rencana: 5, anggaran: 'BELUM', anggaran_nilai: null, jenis_rencana: null, tgl_proses: null, vol_realisasi: 0, nilai_realisasi: 0, usulan_no: null, alasan: 'rusak', status: 'DIRENCANAKAN', usulan_keputusan: null, barang_id: null, ref: kelengkapanRef(0, 0, 0), belum_dicatat: 0 },
    { id: 3, canonical_id: 'BBA-3', uraian: 'Ditolak', barang_nama: null, sumber_anggaran: 'BLUD', vol: 1, satuan: null, harga: 99, nilai_rencana: 99, anggaran: 'BELUM', anggaran_nilai: null, jenis_rencana: null, tgl_proses: null, vol_realisasi: 0, nilai_realisasi: 0, usulan_no: 'U-1', alasan: null, status: 'DIRENCANAKAN', usulan_keputusan: 'DITOLAK', barang_id: null, ref, belum_dicatat: 0 },
  ],
  penerimaan: [{ id: 1, rencana_id: 1, tgl: '2066-03-01', vol: 2, harga_satuan: 9.5, nilai: 19, merk_tipe: 'A', penyedia: 'PT', catatan: null, pindahan: false, ditempatkan: 1 }],
  penawaran: [{ id: 9, penawaran_id: 4, rekanan: 'PT X', nomor_surat: '1', tgl_surat: '2066-01-01', berlaku_sampai: '2066-05-01', file_id: null, barang_id: 1, barang_nama: 'Laptop', nama_barang: 'Laptop', merk: null, merk_tipe: null, spesifikasi: null, satuan: 'unit', harga_satuan: 11, status_pajak: null, tautan: null, garansi: null }],
}
{
  const wb = new ExcelJS.Workbook()
  tulisBukuRencana(wb, bahan, 'Pengadaan')
  const buf = await wb.xlsx.writeBuffer(); const wb2 = new ExcelJS.Workbook(); await wb2.xlsx.load(buf as ArrayBuffer)
  ok('B1 lima lembar urut alur; lembar menu yang dibuka aktif', JSON.stringify(wb2.worksheets.map(w => w.name)) === JSON.stringify(LEMBAR_BUKU) && wb2.views?.[0]?.activeTab === 2)
  const ws = wb2.getWorksheet('Rencana')!
  ok('B2 templat seragam: kepala tabel di baris 7 ("No")', String(ws.getCell(7, 1).value) === 'No' && String(wb2.getWorksheet('Penawaran')!.getCell(7, 5).value) === 'Nama Rekanan / Vendor')
  const sel = (w: string, r: number, k: number) => wb2.getWorksheet(w)!.getCell(r, k).value
  const isiRencana: string[] = []
  ws.eachRow((row, r) => { if (r > 7) isiRencana.push(String(row.getCell(12).value ?? '')) })
  ok('B3 kolom Tahap dari tahapRencana (Diterima penuh, Perlu dilengkapi, Usulan ditolak)', ['Diterima penuh', 'Perlu dilengkapi', 'Usulan ditolak'].every(t => isiRencana.includes(t)), isiRencana.join('|'))
  let jumlahRencana: unknown = null
  ws.eachRow(row => { if (String(row.getCell(3).value).startsWith('JUMLAH')) jumlahRencana = row.getCell(10).value })
  ok('B4 jumlah rencana tanpa usulan ditolak (25, bukan 124)', jumlahRencana === 25, String(jumlahRencana))
  let pengadaan = 0
  wb2.getWorksheet('Pengadaan')!.eachRow((row, r) => { if (r > 7 && /^BBA-/.test(String(row.getCell(2).value ?? ''))) pengadaan++ })
  ok('B5 lembar Pengadaan = rencana didanai saja', pengadaan === 1)
  ok('B6 penawaran kedaluwarsa ditandai (data mulai baris 9, sesudah nomor kolom); Ringkasan memuat unit belum dicatat', sel('Penawaran', 8, 1) === '(1)' && sel('Penawaran', 9, KOLOM_LAPORAN.penawaran.findIndex(x => x.kunci === 'status') + 1) === 'kedaluwarsa' && JSON.stringify(wb2.getWorksheet('Ringkasan')!.getSheetValues()).includes('belum dicatat'))
  const s1 = sidikBahan(bahan)
  ok('B7 sidik stabil untuk bahan yang sama; berubah saat baris DIHAPUS (bukan cuma saat diubah)', s1 === sidikBahan(structuredClone(bahan))
    && s1 !== sidikBahan({ ...bahan, penerimaan: [] }) && s1 !== sidikBahan({ ...bahan, rencana: bahan.rencana.slice(1) }))
  {
    // Data uji: surat berlaku s.d. 2066-05-01, hari ini 2066-06-01 (sudah kedaluwarsa).
    ok('B8 sidik berubah saat penawaran lewat masa berlaku (lembar Penawaran menulis "kedaluwarsa"), tidak berubah sekadar ganti hari',
      sidikBahan({ ...bahan, hariIni: '2066-04-30' }) !== s1 && sidikBahan({ ...bahan, hariIni: '2066-06-02' }) === s1)
  }
}

console.log('\nC. Route & sambungan')
{
  const un = sumber('app/api/buku-besar-aset/unduh/route.ts'), dl = sumber('lib/data/bba-laporan.ts')
  ok('C1 unduhan & Drive memakai penyusun yang SAMA (bahanBukuRencana → tulisBuku → tulisBukuRencana)', un.includes('bukuRencanaBuffer(p.data.tahun, p.data.lembar')
    && dl.includes('tulisBukuRencana(wb, b, aktif)') && dl.includes('buffer: await tulisBuku(b, aktif)')
    && dl.includes('await bahanBukuRencana(t, penawaran)') && dl.includes("tulis: () => tulisBuku(b, 'Ringkasan')"))
  const cron = sumber('app/api/cron/bba-drive/route.ts'), kirim = sumber('app/api/buku-besar-aset/drive-kirim/route.ts')
  ok('C2 cron ber-CRON_SECRET; tombol Kirim sekarang khusus Admin', cron.includes("verifyCronSecret(req.headers.get('authorization'))") && kirim.includes('bolehBatalkanFinal(g.session.role)') && kirim.includes('kirimLaporanKeDrive(true)'))
  ok('C3 subfolder "07 Laporan Buku Besar Aset", hanya lewat folder induk', sumber('lib/services/drive-tujuan.ts').includes("bba_laporan: '07 Laporan Buku Besar Aset'")
    && sumber('lib/services/drive-tujuan.ts').includes('bba_laporan: { khusus: null, cadanganUmum: false }'))
  ok('C4 berkas ditimpa di tempat lewat satu pintu (timpaDiTujuan → perbaruiBerkasDrive), 404 → dibuat baru', sumber('lib/services/drive-catatan.ts').includes('if (kodeGalatDrive(e) !== 404) throw e;')
    && dl.includes("timpaDiTujuan('bba_laporan'") && !dl.includes('perbaruiBerkasDrive'))
  ok('C6 workbook dibangun SESUDAH putusan kirim (putaran cron yang tidak mengirim tidak menulis Excel)',
    dl.indexOf('putuskanKirim(') > 0 && dl.indexOf('await isi.tulis()') > dl.indexOf('putuskanKirim(') && !/const isi = await w\.(buat|tulis)\(/.test(dl))
  ok('C5 jalur Simpan BBA tidak menyentuh Drive (gagal Drive tidak bisa menggagalkan simpan)', !sumber('lib/data/buku-besar-aset.ts').includes('bba-laporan') && !sumber('lib/data/bba-penerimaan.ts').includes('bba-laporan'))
}

console.log('\nD. MySQL sungguhan + Drive tiruan (kotak pasir 2066)')
let c: mysql.Connection | null = null
try {
  c = await mysql.createConnection({ host: process.env.MYSQL_HOST, port: Number(process.env.MYSQL_PORT || 3306), user: process.env.MYSQL_USER, password: process.env.MYSQL_PASSWORD, database: process.env.MYSQL_DATABASE })
} catch (e) { ok(`D0 MySQL bisa dihubungi (${(e as { code?: string }).code ?? e})`, false) }
if (c) {
  const k = c
  const KUNCI = ['bba_drive_status', 'drive_root', 'drive_subfolder_otomatis']
  const [simpanan] = await k.query('SELECT `key`, value FROM app_config WHERE `key` IN (?)', [KUNCI]) as [Array<{ key: string; value: string }>, unknown]
  const bersih = async () => {
    await k.query("DELETE FROM buku_besar_aset WHERE tahun_anggaran = 2066 AND uraian LIKE 'UJIL%'")
    await k.query("DELETE FROM drive_arsip WHERE file_id LIKE 'UJIL%'")
    await k.query('DELETE FROM app_config WHERE `key` IN (?)', [KUNCI])
  }
  await bersih()
  for (const kr of ['GOOGLE_OAUTH_CLIENT_ID', 'GOOGLE_OAUTH_CLIENT_SECRET', 'GOOGLE_OAUTH_REFRESH_TOKEN']) process.env[kr] = process.env[kr] || 'x'
  const { google } = await import('googleapis')
  const asli = google.drive
  const log: string[] = []
  let gagalUpdate: number | null = null
  let sesudahUpdate: { trashed?: boolean; parents?: string[] } = {}
  ;(google as unknown as { drive: unknown }).drive = () => ({ files: {
    list: async () => ({ data: { files: [] } }),
    create: async (o: { requestBody: { name: string; mimeType?: string } }) => { const id = `UJIL${String(log.length + 1).padStart(10, '0')}`; log.push(`create:${o.requestBody.name}`); return { data: { id, name: o.requestBody.name, size: '10' } } },
    update: async (o: { fileId: string }) => { log.push(`update:${o.fileId}`); if (gagalUpdate) throw Object.assign(new Error('x'), { code: gagalUpdate }); return { data: { id: o.fileId, size: '11', ...sesudahUpdate } } },
  } })
  const B = await import('../lib/data/buku-besar-aset')
  const L = await import('../lib/data/bba-laporan')
  const T = await import('../lib/services/drive-tujuan')
  const [u] = await k.query('SELECT id FROM users ORDER BY id LIMIT 1') as [Array<{ id: number }>, unknown]
  try {
    const belum = await L.kirimLaporanKeDrive(true)
    ok('D1 folder induk belum diatur → tidak mencoba apa pun', belum.status === 'belum-diatur' && log.length === 0)
    await T.aturFolderInduk('UJILINDUK00000001')
    await B.createAset({ tahun_anggaran: 2066, uraian: 'UJIL laptop', sumber_anggaran: 'BLUD', vol: 1, harga: 1000 }, Number(u[0].id))
    const pertama = await L.kirimLaporanKeDrive(false)
    ok('D2 putaran cron pertama: isi baru terlihat, MENUNGGU 2 menit diam (belum dikirim)', pertama.status === 'selesai' && pertama.dikirim.length === 0 && !log.some(x => x.startsWith('create:BBA')))
    const paksa = await L.kirimLaporanKeDrive(true)
    const arsip = await k.query("SELECT nama FROM drive_arsip WHERE file_id LIKE 'UJIL%'") as unknown as [Array<{ nama: string }>]
    ok('D3 Kirim sekarang: workbook 2066 di subfolder tahun + KIB dibuat baru, tercatat di manifest', paksa.status === 'selesai' && paksa.dikirim.includes('BBA 2066 — Rencana s.d. Pengadaan.xlsx')
      && log.includes('create:2066') && arsip[0].some(a => a.nama === 'BBA 2066 — Rencana s.d. Pengadaan.xlsx'), JSON.stringify([paksa, log]))
    const sebelum = log.length
    const ulang = await L.kirimLaporanKeDrive(true)
    ok('D4 isi tidak berubah → tidak ada unggahan (paksa pun)', ulang.status === 'selesai' && ulang.dikirim.length === 0 && log.length === sebelum)
    await B.createAset({ tahun_anggaran: 2066, uraian: 'UJIL kursi', sumber_anggaran: 'BLUD', vol: 1, harga: 1 }, Number(u[0].id))
    await L.kirimLaporanKeDrive(true)
    ok('D5 isi berubah → berkas yang SAMA ditimpa (update), bukan berkas baru', log.slice(sebelum).some(x => x.startsWith('update:UJIL')) && !log.slice(sebelum).some(x => x.startsWith('create:BBA 2066')))
    await B.createAset({ tahun_anggaran: 2066, uraian: 'UJIL meja', sumber_anggaran: 'BLUD', vol: 1, harga: 1 }, Number(u[0].id))
    gagalUpdate = 404
    const n404 = log.length
    await L.kirimLaporanKeDrive(true)
    ok('D6 berkas di Drive sudah dihapus (404) → dibuat baru', log.slice(n404).some(x => x.startsWith('create:BBA 2066')))
    await B.createAset({ tahun_anggaran: 2066, uraian: 'UJIL lemari', sumber_anggaran: 'BLUD', vol: 1, harga: 1 }, Number(u[0].id))
    gagalUpdate = 403
    const g = await L.kirimLaporanKeDrive(true)
    const st = await L.bacaStatusDrive()
    ok('D7 Drive menolak → gagal disebut, tanda tetap (sidik terkirim tidak maju), status terakhir merah', g.status === 'selesai' && g.gagal.length === 1
      && st.berkas['rencana:2066'].sidik_terkirim !== st.berkas['rencana:2066'].sidik_terlihat && st.terakhir?.ok === false)
    gagalUpdate = null
    await L.kirimLaporanKeDrive(true)
    await B.createAset({ tahun_anggaran: 2066, uraian: 'UJIL rak', sumber_anggaran: 'BLUD', vol: 1, harga: 1 }, Number(u[0].id))
    sesudahUpdate = { trashed: true }
    const nSampah = log.length
    await L.kirimLaporanKeDrive(true)
    ok('D9 berkas lama di tempat sampah Drive → dibuat berkas baru', log.slice(nSampah).some(x => x.startsWith('create:BBA 2066')), JSON.stringify(log.slice(nSampah)))
    await B.createAset({ tahun_anggaran: 2066, uraian: 'UJIL loker', sumber_anggaran: 'BLUD', vol: 1, harga: 1 }, Number(u[0].id))
    sesudahUpdate = { parents: ['FOLDER-INDUK-LAMA'] }
    const nPindah = log.length
    await L.kirimLaporanKeDrive(true)
    ok('D10 berkas lama tidak lagi di folder tujuan (induk diganti) → dibuat berkas baru', log.slice(nPindah).some(x => x.startsWith('create:BBA 2066')), JSON.stringify(log.slice(nPindah)))
    sesudahUpdate = {}
    // Pengirim lain sedang memegang kunci → langsung "sibuk", tidak menunggu sampai lock wait timeout.
    await k.query('START TRANSACTION')
    await k.query("SELECT version FROM blud_locks WHERE entity = 'bba_drive' AND key_id = 'kirim' FOR UPDATE")
    const mulai = Date.now()
    const sibuk = await L.kirimLaporanKeDrive(true)
    const lama = Date.now() - mulai
    await k.query('ROLLBACK')
    ok('D11 kunci pengirim sedang dipegang → status sibuk tanpa menunggu', sibuk.status === 'sibuk' && lama < 5000, `${JSON.stringify(sibuk)} ${lama} ms`)
  } finally {
    ;(google as unknown as { drive: unknown }).drive = asli
    await bersih()
    for (const s of simpanan) await k.query('INSERT INTO app_config (`key`, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)', [s.key, s.value])
    const [x] = await k.query("SELECT COUNT(*) AS n FROM buku_besar_aset WHERE tahun_anggaran = 2066 AND uraian LIKE 'UJIL%'") as [Array<{ n: number }>, unknown]
    ok('D8 kotak pasir bersih, app_config dikembalikan', Number(x[0].n) === 0)
    await k.end()
  }
}

console.log(`\n${lulus} lulus, ${gagal.length} gagal`)
if (gagal.length) { console.log(gagal.map(g => `  - ${g}`).join('\n')); process.exit(1) }
process.exit(0)
