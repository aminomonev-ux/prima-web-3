#!/usr/bin/env npx tsx
// scripts/test-bba-kondisi.mts — Tahap C Buku Aset: kondisi per register, ruangan & gedung, opname,
// pindah, tautkan barang, "dimiliki" per barang, lembar Excel KIR / sensus / RKPInv / BI / Rekap BMD.
// Konsep: docs/CONCEPT-bba-buku-aset.md §7.2–7.3, §8, §9, §15.
// Jalankan: npx tsx --env-file=.env.local scripts/test-bba-kondisi.mts [rekap.xlsx]
//   argumen opsional = berkas ekspor "Rekap Aset" provinsi (berisi lembar templat KIR, BI, KIBxInv,
//   RKPInv, Rekap) untuk kalibrasi kepala & gabungan; tidak masuk repo.
// Bagian E memakai MySQL sungguhan; data uji berkode "UJIK." dan dibersihkan otomatis.
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import ExcelJS from 'exceljs'
import mysql from 'mysql2/promise'
import { GOLONGAN, KOLOM_KIB, type Golongan, type Kondisi } from '../lib/bba/kib'
import { kelompokkan, type AsetRingan } from '../lib/bba/aset'
import {
  batasCek, statusCek, perluDicek, alasanTolakCek, kondisiSensus, ringkasDimiliki, ringkasDimilikiPerBarang, bolehBerRuang, punyaKondisi,
} from '../lib/bba/kondisi'
import { KOLOM_SENSUS, KOLOM_KIR, KOLOM_BI, OBJEK_BMD, rekapBmd, masukBukuResmi, kodeObjekBmd } from '../lib/bba/lembar'
import { hurufKolom, tulisLembarKib } from '../lib/bba/kib-excel'
import {
  tulisLembarSensus, tulisRekapSensus, tulisLembarKir, tulisBukuInventaris, tulisRekapBmd, tulisLembarKerja, namaLembarAman, kodeGedung,
} from '../lib/bba/lembar-excel'
import { PENGATURAN_BAWAAN, type PengaturanBba } from '../lib/bba/pengaturan'
import { CatatKondisiSchema, PindahAsetSchema, TautkanBarangAsetSchema, AsetExcelSchema, AsetDaftarSchema } from '../lib/data/bba-aset-schemas'
import { LokasiUpdateSchema } from '../lib/data/buku-besar-aset-schemas'

let lulus = 0
const gagal: string[] = []
function ok(nama: string, syarat: unknown, ket = '') {
  if (syarat) { lulus++; console.log(`  ok  ${nama}`) }
  else { gagal.push(nama); console.log(`FAIL  ${nama}${ket ? ' — ' + ket : ''}`) }
}
const sumber = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
const coba = async <T,>(f: () => Promise<T>): Promise<T | Error> => { try { return await f() } catch (e) { return e as Error } }
const tanpaKomentar = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')

const aset = (o: Partial<AsetRingan> & { id: number; golongan: Golongan }): AsetRingan => ({
  kode_barang: `UJIK.01.2020-1.3.${GOLONGAN.indexOf(o.golongan) + 1}.05.01.01.00${o.id}`, register: String(o.id).padStart(6, '0'), kunci_impor: null,
  kode_objek: `1.3.${GOLONGAN.indexOf(o.golongan) + 1}.05.01.01.00${o.id}`, tahun_perolehan: 2020, nama_resmi: `BARANG ${o.id}`, nama: null,
  lokasi_id: null, harga: 1_000_000 * o.id, asal_usul: 'Pembelian', keterangan: null, kondisi: null, kondisi_sumber: null, kib: {}, status: 'AKTIF',
  ...o,
})

console.log('A. Aturan kondisi (lib/bba/kondisi.ts)')
ok('A1 batas = hari ini dikurangi jarak opname; tanggal dijepit ke akhir bulan', batasCek('2026-10-27', 12) === '2025-10-27'
  && batasCek('2026-03-31', 1) === '2026-02-28' && batasCek('2024-03-31', 1) === '2024-02-29' && batasCek('2026-01-15', 6) === '2025-07-15')
const batas = '2025-10-27'
ok('A2 status cek: tanah null · impor = BELUM · dicek sebelum batas = LEWAT · sesudahnya TERKINI', statusCek({ golongan: 'A', kondisi_sumber: 'CEK', kondisi_tgl: '2026-01-01' }, batas) === null
  && statusCek({ golongan: 'B', kondisi_sumber: 'IMPOR' }, batas) === 'BELUM' && statusCek({ golongan: 'B', kondisi_sumber: null }, batas) === 'BELUM'
  && statusCek({ golongan: 'B', kondisi_sumber: 'CEK', kondisi_tgl: '2025-10-26' }, batas) === 'LEWAT'
  && statusCek({ golongan: 'B', kondisi_sumber: 'CEK', kondisi_tgl: '2025-10-27' }, batas) === 'TERKINI')
ok('A3 perlu dicek = BELUM atau LEWAT', perluDicek({ golongan: 'C', kondisi_sumber: 'IMPOR' }, batas) && perluDicek({ golongan: 'C', kondisi_sumber: 'CEK', kondisi_tgl: '2020-01-01' }, batas)
  && !perluDicek({ golongan: 'C', kondisi_sumber: 'CEK', kondisi_tgl: '2026-01-01' }, batas) && !perluDicek({ golongan: 'A', kondisi_sumber: null }, batas))
const dasarCek = { golongan: 'B' as Golongan, status: 'AKTIF' as const, nama: 'Meja' }
ok('A4 tolak cek: tanah, aset dihapus, tanggal lebih lama dari cek tercatat; tanggal sama tetap boleh',
  !!alasanTolakCek({ ...dasarCek, golongan: 'A', kondisi_sumber: null }, '2026-10-27')
  && !!alasanTolakCek({ ...dasarCek, status: 'DIHAPUS', kondisi_sumber: null }, '2026-10-27')
  && !!alasanTolakCek({ ...dasarCek, kondisi_sumber: 'CEK', kondisi_tgl: '2026-10-20' }, '2026-10-19')
  && alasanTolakCek({ ...dasarCek, kondisi_sumber: 'CEK', kondisi_tgl: '2026-10-20' }, '2026-10-20') === null
  && alasanTolakCek({ ...dasarCek, kondisi_sumber: 'IMPOR', kondisi_tgl: '2026-10-20' }, '2020-01-01') === null)
ok('A5 kondisi sensus tahun T = hanya hasil cek PRIMA bertanggal T', kondisiSensus({ kondisi: 'RR', kondisi_sumber: 'CEK', kondisi_tgl: '2026-03-01' }, 2026) === 'RR'
  && kondisiSensus({ kondisi: 'RR', kondisi_sumber: 'CEK', kondisi_tgl: '2025-12-31' }, 2026) === null
  && kondisiSensus({ kondisi: 'B', kondisi_sumber: 'IMPOR', kondisi_tgl: null }, 2026) === null
  && kondisiSensus({ kondisi: 'B', kondisi_sumber: 'IMPOR', kondisi_tgl: '2026-03-01' }, 2026) === null)
ok('A6 ruangan hanya untuk peralatan (B) & aset tetap lainnya (E); tanah tak berkondisi', GOLONGAN.filter(bolehBerRuang).join() === 'B,E' && GOLONGAN.filter(g => !punyaKondisi(g)).join() === 'A')
const milik = [
  aset({ id: 1, golongan: 'B', kondisi: 'B', kondisi_sumber: 'CEK', kondisi_tgl: '2026-05-01', lokasi_id: 7, barang_id: 9 }),
  aset({ id: 2, golongan: 'B', kondisi: 'RB', kondisi_sumber: 'CEK', kondisi_tgl: '2024-01-01', lokasi_id: 7, barang_id: 9 }),
  aset({ id: 3, golongan: 'B', kondisi: 'RR', kondisi_sumber: 'IMPOR', lokasi_id: 8, barang_id: 9 }),
  aset({ id: 4, golongan: 'B', kondisi: null, lokasi_id: null, barang_id: 9 }),
  aset({ id: 5, golongan: 'A', kondisi: null, barang_id: 10 }),
]
const d9 = ringkasDimiliki(milik.slice(0, 4), batas)
ok('A7 dimiliki: jumlah, kondisi, kosong, ruangan, perlu dicek, cek terakhir', d9.jumlah === 4 && d9.kondisi.baik === 1 && d9.kondisi.rusak_berat === 1 && d9.kondisi.rusak_ringan === 1
  && d9.kondisi.total === 3 && d9.kosong === 1 && d9.ruangan === 2 && d9.perluDicek === 3 && d9.cekTerakhir === '2026-05-01', JSON.stringify(d9))
const per = ringkasDimilikiPerBarang(milik, batas)
ok('A8 dimiliki per barang; tanah tidak dihitung "tanpa kondisi"', per.get(9)?.jumlah === 4 && per.get(10)?.jumlah === 1 && per.get(10)?.kosong === 0 && per.get(10)?.perluDicek === 0)
const kel = kelompokkan(milik.slice(0, 2).map(a => ({ ...a, lokasi_id: 7, nama_resmi: 'MEJA', kode_objek: '1.3.2.05.01.01.001' })), batas)
ok('A9 kelompok menghitung "belum dicek" dan "lewat" terpisah', kel.length === 1 && kel[0].lewat === 1 && kel[0].belumDicek === 0)

console.log('\nB. Lembar Excel (lib/bba/lembar-excel.ts) = templat provinsi')
const P: PengaturanBba = { ...PENGATURAN_BAWAAN, kop: { kode_lokasi: '010206', bidang: 'RS UJI', sub_bidang: '', satuan_kerja: 'RS UJI' },
  ttd: { ...PENGATURAN_BAWAAN.ttd, kepala_nama: 'dr. Kepala', kepala_nip: '1970', pengurus_nama: 'Pengurus', pengurus_nip: '1980', pembantu_nama: 'Pembantu', pembantu_nip: '1990' } }
const gabung = (ws: ExcelJS.Worksheet) => [...(ws.model as unknown as { merges: string[] }).merges].sort().join(' ')
const urutkan = (s: string) => s.split(' ').sort().join(' ')
const nilai = (ws: ExcelJS.Worksheet, a: string) => { const v = ws.getCell(a).value; return v && typeof v === 'object' && 'formula' in v ? `=${v.formula}` : v }

const ruang = { nama: 'Ruang Uji', luas: 24.5, pj_nama: 'Perawat PJ', pj_nip: '1985', gedung: { nama: 'Gedung Bangsal I', kode_barang: 'K.1984', register: '000001' } }
const wbK = new ExcelJS.Workbook()
const kir = tulisLembarKir(wbK, ruang, [aset({ id: 1, golongan: 'B', kondisi: 'RR', kib: { merk_type: 'Olympic', bahan: 'Kayu' } })], P, '2026-10-27')
ok('B1 KIR: gabungan kepala & tanda tangan persis templat', gabung(kir) === urutkan('A12:A14 B12:B14 C12:D13 E12:E14 F12:F14 G12:G14 H12:H14 I12:I14 J12:J14 K12:K14 L12:L14 M12:M14 L20:M20 L21:M21 L25:M25 L26:M26'), gabung(kir))
ok('B2 KIR: kop (gedung, ruang, luas, kode lokasi) · Jumlah H18 · SUM K16:K17 · TTD PJ ruangan & pembantu', nilai(kir, 'A8') === 'Kode Gedung' && String(nilai(kir, 'C8')).includes('Gedung Bangsal I')
  && nilai(kir, 'C9') === ': Ruang Uji' && nilai(kir, 'C10') === ': 24,5 m2' && nilai(kir, 'H10') === 'No. Kode Lokasi' && nilai(kir, 'J10') === ': 010206'
  && nilai(kir, 'H18') === 'Jumlah' && nilai(kir, 'K18') === '=SUM(K16:K17)' && nilai(kir, 'C21') === 'Penanggung Jawab Ruangan' && nilai(kir, 'C25') === '( Perawat PJ )'
  && nilai(kir, 'L21') === 'Pembantu Pengurus Barang' && nilai(kir, 'L25') === '( Pembantu )' && nilai(kir, 'L16') === 'RUSAK RINGAN' && nilai(kir, 'E16') === 'Olympic')
ok('B3 KIR: lebar kolom & halaman (mendatar skala 70, nomor kolom baris 15 diulang)', KOLOM_KIR.map(k => k.lebar).join() === '5,30,21,6,18,18,18,18,0,8,16,14,21'
  && kir.pageSetup.orientation === 'landscape' && kir.pageSetup.scale === 70 && kir.pageSetup.printTitlesRow === '15:15')
ok('B4 kode gedung kop KIR: nama + kode + register; tanpa gedung kosong', kodeGedung(ruang.gedung) === 'Gedung Bangsal I (K.1984 reg. 000001)' && kodeGedung(null) === '')

const wbB = new ExcelJS.Workbook()
const bi = tulisBukuInventaris(wbB, [aset({ id: 1, golongan: 'B', kondisi: 'RB' })], P, '2026-10-27')
ok('B5 BI: gabungan kepala & tanda tangan persis templat', gabung(bi) === urutkan('N18:O18 L20:O20 L23:O23 L24:O24 K10:K12 L10:L12 M10:N11 O10:O12 I10:I12 J10:J12 F11:F12 A10:C10 D10:F10 G10:G12 H10:H12 A11:A12 B11:B12 C11:C12 D11:D12 E11:E12'), gabung(bi))
ok('B6 BI: Jumlah di kolom I (tersembunyi) · SUM M & N · keadaan B/KB/R · TTD Kepala & Pengurus', nilai(bi, 'I16') === 'Jumlah' && nilai(bi, 'M16') === '=SUM(M14:M15)'
  && nilai(bi, 'N16') === '=SUM(N14:N15)' && nilai(bi, 'L14') === 'R' && nilai(bi, 'C18') === 'Mengetahui,' && nilai(bi, 'L20') === 'Pengurus Barang' && String(nilai(bi, 'N18')).startsWith('Semarang ,')
  && KOLOM_BI.map(k => k.lebar).join() === '5,25,7,26,21,21,15,15,0,16,10,11,8,14,16')
const bi2 = tulisBukuInventaris(new ExcelJS.Workbook(), [aset({ id: 1, golongan: 'B' }), aset({ id: 2, golongan: 'B', kode_barang: null }), aset({ id: 3, golongan: 'B', status: 'DIHAPUS' }), aset({ id: 4, golongan: 'F', kode_barang: null })], P, '2026-10-27')
ok('B7 BI hanya buku resmi: teregister & aktif (+ KIB F tanpa kode)', [nilai(bi2, 'B14'), nilai(bi2, 'B15')].includes(aset({ id: 1, golongan: 'B' }).kode_barang) && nilai(bi2, 'M17') === '=SUM(M14:M16)'
  && masukBukuResmi(aset({ id: 4, golongan: 'F', kode_barang: null })) && !masukBukuResmi(aset({ id: 2, golongan: 'B', kode_barang: null })))

const wbS = new ExcelJS.Workbook()
const sB = tulisLembarSensus(wbS, 'B', [aset({ id: 1, golongan: 'B', kondisi: 'RR', kondisi_sumber: 'CEK', kondisi_tgl: '2026-02-01', keterangan: 'Ket' })], P, 2026, '2026-10-27')
ok('B8 sensus KIB B: gabungan kepala persis templat', gabung(sB) === urutkan('F10:F12 A10:A12 B10:B12 C10:C12 D10:D12 E10:E12 R10:R12 Q10:Q12 G10:G12 H10:H12 I10:I12 J10:N11 O10:O12 P10:P12'), gabung(sB))
ok('B9 sensus KIB B: TAHUN L8/M8 · Kondisi Q (hasil cek 2026) · Keterangan R · Jumlah N16, SUM P · TTD D & O', nilai(sB, 'L8') === 'TAHUN' && nilai(sB, 'M8') === ': 2026'
  && nilai(sB, 'Q10') === 'Kondisi' && nilai(sB, 'Q14') === 'RUSAK RINGAN' && nilai(sB, 'R14') === 'Ket' && nilai(sB, 'N16') === 'Jumlah' && nilai(sB, 'P16') === '=SUM(P14:P15)'
  && nilai(sB, 'D18') === 'Mengetahui,' && nilai(sB, 'O19') === 'Pengurus Barang' && nilai(sB, 'I13') === '8' && nilai(sB, 'H13') === '8')
const sB2 = tulisLembarSensus(new ExcelJS.Workbook(), 'B', [aset({ id: 1, golongan: 'B', kondisi: 'RR', kondisi_sumber: 'CEK', kondisi_tgl: '2025-02-01' })], P, 2026, '2026-10-27')
ok('B10 sensus: cek tahun lain = kolom Kondisi kosong', nilai(sB2, 'Q14') === '')
ok('B11 sensus: tiap golongan punya kolom Kondisi sebelum Keterangan (D & F apa adanya)', (['A', 'B', 'C', 'E'] as const).every(g => { const k = KOLOM_SENSUS[g].map(x => x.kunci); return k.indexOf('kondisi_sensus') === k.indexOf('keterangan') - 1 })
  && !KOLOM_SENSUS.D.some(k => k.kunci === 'kondisi_sensus'))
// Tanpa berkas templat pun: temuan kalibrasi KIBEInv ("Nomor" di atas Kode Barang + Register) dijaga.
const sE = tulisLembarSensus(new ExcelJS.Workbook(), 'E', [aset({ id: 1, golongan: 'E' })], P, 2026, '2026-10-27')
ok('B11b sensus KIB E: Kode Barang + Register di bawah kepala "Nomor" (C10:D11), beda dari KIB E', nilai(sE, 'C10') === 'Nomor' && gabung(sE).includes('C10:D11')
  && nilai(sE, 'C12') === 'Kode Barang' && nilai(sE, 'D12') === 'Register')

const rows = [
  aset({ id: 1, golongan: 'B', kondisi: 'B', kondisi_sumber: 'CEK', kondisi_tgl: '2026-03-01', kode_objek: '1.3.2.05.01.01.001' }),
  aset({ id: 2, golongan: 'B', kondisi: 'RB', kondisi_sumber: 'CEK', kondisi_tgl: '2026-03-01', kode_objek: '1.3.2.05.01.01.002' }),
  aset({ id: 3, golongan: 'B', kondisi: 'RR', kondisi_sumber: 'IMPOR', kode_objek: '1.3.2.05.01.01.003' }),
  aset({ id: 4, golongan: 'A', kode_objek: '1.3.1.01.01.01.001' }),
  aset({ id: 5, golongan: 'F', kode_barang: null, kode_objek: null }),
  aset({ id: 6, golongan: 'B', kode_barang: null }),
]
const rk = rekapBmd(rows)
ok('B12 rekap BMD: per akun & objek, hanya buku resmi; KIB F = KDP', rk.akun.get('1.3.2')?.jumlah === 3 && rk.objek.get('1.3.2.05')?.harga === 6_000_000 && rk.akun.get('1.3.6')?.jumlah === 1
  && kodeObjekBmd({ golongan: 'F', kode_objek: null }) === '1.3.6.01' && kodeObjekBmd({ golongan: 'B', kode_objek: null }) === null)
const rs = rekapBmd(rows, a => kondisiSensus(a, 2026))
ok('B13 rekap sensus: kondisi hanya hasil cek tahun itu (impor tidak dihitung)', rs.objek.get('1.3.2.05')?.B === 1 && rs.objek.get('1.3.2.05')?.RB === 1 && rs.objek.get('1.3.2.05')?.RR === 0)

const wbR = new ExcelJS.Workbook()
const rp = tulisRekapSensus(wbR, rows.filter(a => a.golongan === 'B').slice(0, 1), P, 2026, '2026-10-27')
ok('B14 RKPInv: gabungan kepala persis templat', gabung(rp) === urutkan('A10:A12 F11:G11 H11:I11 J11:K11 L11:M11 F10:M10 D10:E11 C10:C12 B10:B12'), gabung(rp))
ok('B15 RKPInv: satu objek → total baris 15, rumus % persis templat, TTD C17/J17', nilai(rp, 'B13') === '1.3.2.05' && nilai(rp, 'D15') === '=SUM(D13:D14)'
  && nilai(rp, 'G13') === '=IF($D13=0,0,F13/$D13*100)' && nilai(rp, 'G15') === '=IF($D$15=0,0,F15/$D$15*100)' && nilai(rp, 'M15') === '=IF($D$15=0,0,L15/$D$15*100)'
  && (rp.getCell('G13').value as { result: number }).result === 100 && nilai(rp, 'L13') === 0 && nilai(rp, 'C17') === 'Mengetahui,' && nilai(rp, 'J18') === 'Pengurus Barang'
  && nilai(rp, 'H8') === 'TAHUN' && nilai(rp, 'I8') === ': 2026' && rp.pageSetup.orientation === 'portrait')

const wbM = new ExcelJS.Workbook()
const rek = tulisRekapBmd(wbM, rows, P, '202610', '2026-10-27')
ok('B16 Rekap BMD: kepala dua baris tergabung, judul di D2, periode H8/I8', gabung(rek) === urutkan('A10:A11 B10:B11 C10:C11 D10:D11 E10:E11 F10:F11 G10:G11 H10:H11 I10:I11')
  && nilai(rek, 'D2') === 'REKAPITULASI BARANG MILIK DAERAH' && nilai(rek, 'H8') === 'Periode s/d' && nilai(rek, 'I8') === ': 202610' && rek.getRow(11).height === 37.5)
ok('B17 Rekap BMD: urutan baris templat — TANAH akun (13), objek 14–49, akun 1.3.2–1.3.6 (50–54), JUMLAH D57', OBJEK_BMD.length === 36
  && nilai(rek, 'B13') === '1.3.1' && nilai(rek, 'G13') === 1 && nilai(rek, 'E13') === 0 && nilai(rek, 'C14') === '1.3.1.01' && nilai(rek, 'E14') === 1
  && nilai(rek, 'A49') === 37 && nilai(rek, 'C49') === '1.3.6.01' && nilai(rek, 'E49') === 1 && nilai(rek, 'B50') === '1.3.2' && nilai(rek, 'G50') === 3 && nilai(rek, 'A54') === 42
  && nilai(rek, 'D57') === 'JUMLAH' && nilai(rek, 'E57') === '=SUM(E13:E56)' && nilai(rek, 'H57') === '=SUM(H13:H56)' && rek.getRow(56).height === 9.75)
ok('B18 Rekap BMD: total E = total G (objek & akun menghitung aset yang sama)', (rek.getCell('E57').value as { result: number }).result === (rek.getCell('G57').value as { result: number }).result)
ok('B19 Rekap BMD: TTD C59/C60, kota H59, Pengurus H61, nama C64/H64', nilai(rek, 'C59') === 'Mengetahui,' && nilai(rek, 'C60') === 'KEPALA SKPD'
  && String(nilai(rek, 'H59')).startsWith('Semarang ,') && nilai(rek, 'H61') === 'Pengurus Barang' && nilai(rek, 'C64') === '( dr. Kepala )' && nilai(rek, 'H65') === 'NIP. 1980')

const wbJ = new ExcelJS.Workbook()
const kj = tulisLembarKerja(wbJ, [{ ...aset({ id: 1, golongan: 'B', kondisi: 'B', kondisi_sumber: 'CEK', kondisi_tgl: '2024-01-01', nama: 'Meja Perawat' }), lokasi_nama: 'Ruang Uji', gedung_nama: 'Gedung I', barang_nama: 'Meja', kondisi_oleh_nama: 'budi' },
  aset({ id: 2, golongan: 'A' })], batas)
const kepalaKerja = (kj.getRow(1).values as unknown[]).slice(1)
const barisKerja = [2, 3].map(r => (kj.getRow(r).values as unknown[]).slice(1))
const meja = barisKerja.find(b => b.includes('Meja Perawat')) ?? [], tanahK = barisKerja.find(b => b.includes('A')) ?? []
ok('B20 format kerja: satu lembar datar + tambahan PRIMA (nama, ruangan, gedung, dicek oleh, status cek; tanah tanpa status)', kepalaKerja.includes('Nama Sehari-hari') && kepalaKerja.includes('Dicek Oleh')
  && meja.includes('Ruang Uji') && meja.includes('Gedung I') && meja.includes('budi') && meja.includes('Perlu dicek ulang')
  && (tanahK[kepalaKerja.indexOf('Status Cek')] ?? '') === '' && !!kj.autoFilter)
const pakai = new Set<string>()
ok('B21 nama lembar KIR aman: ≤ 31 huruf, tanpa karakter terlarang, tidak kembar', namaLembarAman('KIR Ruang [ICU]: Lt 2/3', pakai) === 'KIR Ruang ICU Lt 2 3'
  && namaLembarAman('KIR Ruang ICU Lt 2 3', pakai) === 'KIR Ruang ICU Lt 2 3 (2)' && namaLembarAman('x'.repeat(40), pakai).length === 31)
const wbKib = new ExcelJS.Workbook(); const kibC = tulisLembarKib(wbKib, 'C', [aset({ id: 1, golongan: 'C' })], P, '2026-10-27')
const hC = hurufKolom(KOLOM_KIB.C.findIndex(k => k.kunci === 'harga') + 1), lC = hurufKolom(KOLOM_KIB.C.findIndex(k => k.kunci === 'harga') - 1)
ok('B22 KIB lewat penulis generik tetap: Jumlah 2 kolom kiri harga, kanan TTD digabung sampai kolom terakhir', nilai(kibC, `${lC}16`) === 'Jumlah'
  && nilai(kibC, `${hC}16`) === `=SUM(${hC}14:${hC}15)` && gabung(kibC).includes(`${hC}18:${hurufKolom(KOLOM_KIB.C.length)}18`))

console.log('\nC. Skema & pagar')
const v = (id: number) => ({ id, expected_version: 0 })
ok('C1 catat kondisi: tanggal, kondisi B/RR/RB, ≤ 1000 register, tanpa kembar', CatatKondisiSchema.safeParse({ tgl: '2026-10-27', item: [{ ...v(1), kondisi: 'RB' }] }).success
  && !CatatKondisiSchema.safeParse({ tgl: '27-10-2026', item: [{ ...v(1), kondisi: 'B' }] }).success
  && !CatatKondisiSchema.safeParse({ tgl: '2026-10-27', item: [{ ...v(1), kondisi: 'X' }] }).success
  && !CatatKondisiSchema.safeParse({ tgl: '2026-10-27', item: [{ ...v(1), kondisi: 'B' }, { ...v(1), kondisi: 'RR' }] }).success
  && !CatatKondisiSchema.safeParse({ tgl: '2026-10-27', item: Array.from({ length: 1001 }, (_, i) => ({ ...v(i + 1), kondisi: 'B' })) }).success
  && !CatatKondisiSchema.safeParse({ tgl: '2026-10-27', item: [] }).success)
ok('C2 pindah: tujuan id atau null (lepas); tautkan: barang wajib, bukan dua-duanya', PindahAsetSchema.safeParse({ lokasi_id: null, item: [v(1)] }).success
  && !PindahAsetSchema.safeParse({ item: [v(1)] }).success && !TautkanBarangAsetSchema.safeParse({ item: [v(1)] }).success
  && !TautkanBarangAsetSchema.safeParse({ barang_id: 1, barang_baru: 'x', item: [v(1)] }).success && TautkanBarangAsetSchema.safeParse({ barang_baru: 'Meja', item: [v(1)] }).success)
ok('C3 unduhan: KIB (bawaan tautan lama) · KIR id/SEMUA · SENSUS bertahun · jenis asing ditolak', AsetExcelSchema.safeParse({ jenis: 'KIB', golongan: 'C' }).success
  && AsetExcelSchema.safeParse({ jenis: 'KIR', lokasi: '12' }).success && AsetExcelSchema.safeParse({ jenis: 'KIR', lokasi: 'SEMUA' }).success
  && !AsetExcelSchema.safeParse({ jenis: 'SENSUS' }).success && !AsetExcelSchema.safeParse({ jenis: 'PDF' }).success
  && AsetDaftarSchema.safeParse({ lokasi: '0', kondisi: 'PERLU_DICEK' }).success && LokasiUpdateSchema.safeParse({ id: 1, luas: null, gedung_aset_id: 3 }).success)
const dAset = tanpaKomentar(sumber('lib/data/bba-aset.ts'))
ok('C4 tiga jalur tulis: kunci FOR UPDATE + cek versi dulu, riwayat lewat bulkInsert dengan conn transaksi', /FROM bba_aset a WHERE a\.id IN \(\$\{ids\}\) FOR UPDATE OF a/.test(dAset)
  && (dAset.match(/await kunciAset\(tx, input\.item\)/g) ?? []).length === 3 && (dAset.match(/bulkInsert\('bba_aset_riwayat'[\s\S]*?\), conn\);/g) ?? []).length >= 5)
ok('C5 saringan "perlu dicek" SQL = aturan perluDicek (impor/belum ATAU sebelum batas)', dAset.includes("(a.kondisi_sumber IS NULL OR a.kondisi_sumber = 'IMPOR' OR a.kondisi_tgl < ${batas})"))
const akar = path.join(process.cwd(), 'app'), semua: string[] = []
const jelajah = (d: string) => { for (const n of readdirSync(d)) { const p = path.join(d, n); if (statSync(p).isDirectory()) jelajah(p); else if (/\.tsx?$/.test(n)) semua.push(p) } }
jelajah(akar); jelajah(path.join(process.cwd(), 'lib'))
const sisaEksisting = semua.filter(f => /bba\/eksisting|api\/buku-besar-aset\/eksisting|ModalPendataan/.test(readFileSync(f, 'utf8')))
ok('C6 pendataan eksisting dipensiunkan: tak ada lagi rujukan ke lib/route/modalnya', sisaEksisting.length === 0 && !existsSync('lib/bba/eksisting.ts') && !existsSync('app/api/buku-besar-aset/eksisting/route.ts'), sisaEksisting.join(', '))
const skema = sumber('docs/schema-mysql.sql'), mig = existsSync('docs/migrations/migration-bba-ruang.sql') ? sumber('docs/migrations/migration-bba-ruang.sql') : ''
ok('C7 kolom ruangan baru di skema acuan + migrasi (tanpa IF NOT EXISTS pada ADD COLUMN)', ['gedung_aset_id', 'luas', 'pj_nama', 'pj_nip'].every(k => skema.includes(k) && mig.includes(`ADD COLUMN ${k}`))
  && !/ADD COLUMN IF NOT EXISTS/i.test(mig))
const audit = sumber('lib/security/retensi-audit.ts')
ok('C8 jenis audit baru tergolong retensi', audit.includes('BBA_ASET_KONDISI: P') && audit.includes('BBA_ASET_PINDAH: P'))

console.log('\nE. MySQL sungguhan — opname, pindah, tautkan, dimiliki')
let c: mysql.Connection | null = null
try {
  c = await mysql.createConnection({ host: process.env.MYSQL_HOST, port: Number(process.env.MYSQL_PORT || 3306), user: process.env.MYSQL_USER, password: process.env.MYSQL_PASSWORD, database: process.env.MYSQL_DATABASE })
} catch (e) { console.log(`DILEWATI bagian DB: MySQL tidak bisa dihubungi (${(e as { code?: string }).code ?? e})`) }
if (c) {
  const k = c
  const bersih = async () => {
    await k.query("DELETE FROM bba_aset WHERE kode_barang LIKE 'UJIK.%'")
    await k.query("DELETE FROM bba_lokasi WHERE nama LIKE 'UJIK %'")
    await k.query("DELETE FROM bba_barang WHERE nama LIKE 'UJIK %'")
  }
  await bersih()
  const D = await import('../lib/data/bba-aset')
  const B = await import('../lib/data/buku-besar-aset')
  const { tanggalHariIniWIB } = await import('../lib/shared/waktu-wib')
  const hariIni = tanggalHariIniWIB()
  const [u] = await k.query('SELECT id FROM users ORDER BY id LIMIT 1') as [Array<{ id: number }>, unknown]
  const userId = Number(u[0]?.id ?? 0)
  const tambah = async (g: Golongan, n: number, nama: string, objek: string) => {
    const kode = `UJIK.01.2020-${objek}.01.01.00${n}`
    const [r] = await k.query(`INSERT INTO bba_aset (golongan, kode_barang, register, kunci_impor, kode_objek, tahun_perolehan, nama_resmi, nama, kib, harga, kondisi, kondisi_sumber)
      VALUES (?, ?, '000001', ?, ?, 2020, ?, ?, '{}', ?, ?, ?)`, [g, kode, `${kode}|000001`, `${objek}.01.01.00${n}`, nama.toUpperCase(), nama, 1_000_000 * n, g === 'A' ? null : 'B', g === 'A' ? null : 'IMPOR']) as [{ insertId: number }, unknown]
    return r.insertId
  }
  const versi = async (ids: number[]) => {
    const [r] = await k.query(`SELECT id, version, kondisi, kondisi_sumber, DATE_FORMAT(kondisi_tgl, '%Y-%m-%d') AS tgl, lokasi_id, barang_id FROM bba_aset WHERE id IN (?)`, [ids]) as [Array<Record<string, unknown>>, unknown]
    return new Map(r.map(x => [Number(x.id), x]))
  }
  const item = async (ids: number[]) => { const m = await versi(ids); return ids.map(id => ({ id, expected_version: Number(m.get(id)!.version) })) }
  const cek = async (ids: number[], kondisi: Kondisi) => (await item(ids)).map(x => ({ ...x, kondisi }))
  try {
    const gedung = await tambah('C', 1, 'UJIK Gedung', '1.3.3.01')
    const [b1, b2, b3] = [await tambah('B', 1, 'UJIK Meja 1', '1.3.2.05'), await tambah('B', 2, 'UJIK Meja 2', '1.3.2.05'), await tambah('B', 3, 'UJIK Meja 3', '1.3.2.05')]
    const e1 = await tambah('E', 1, 'UJIK Buku', '1.3.5.01')
    const tanah = await tambah('A', 1, 'UJIK Tanah', '1.3.1.01')
    const r1 = await B.createLokasi('UJIK Ruang 1'), r2 = await B.createLokasi('UJIK Ruang 2')

    const salahGedung = await coba(() => B.updateLokasi({ id: r1.id, gedung_aset_id: b1 }))
    await B.updateLokasi({ id: r1.id, gedung_aset_id: gedung, luas: 24.5, pj_nama: 'UJIK PJ', pj_nip: '1985' })
    const lr = (await B.listLokasi()).find(l => l.id === r1.id)
    ok('E1 ruangan: gedung harus KIB C aktif; gedung, luas, PJ tersimpan', salahGedung instanceof B.BbaGedungTidakDikenalError && lr?.gedung_nama === 'UJIK Gedung' && lr.luas === 24.5 && lr.pj_nama === 'UJIK PJ')

    const p1 = await D.pindahkanAset({ lokasi_id: r1.id, item: await item([b1, b2, e1]) }, userId)
    const [rw] = await k.query("SELECT COUNT(*) AS n, MAX(JSON_UNQUOTE(JSON_EXTRACT(sesudah, '$.ruangan'))) AS ke FROM bba_aset_riwayat WHERE aset_id IN (?) AND jenis = 'PINDAH'", [[b1, b2, e1]]) as [Array<{ n: number; ke: string }>, unknown]
    ok('E2 pindah 3 register: lokasi berganti, versi naik, riwayat PINDAH menyebut ruangan tujuan', p1.dipindah === 3 && Number(rw[0].n) === 3 && rw[0].ke === 'UJIK Ruang 1'
      && [...(await versi([b1, b2, e1])).values()].every(x => Number(x.lokasi_id) === r1.id && Number(x.version) === 1))
    const p2 = await D.pindahkanAset({ lokasi_id: r1.id, item: await item([b1, b2]) }, userId)
    ok('E3 pindah ke ruangan yang sama: tidak ada yang ditulis', p2.dipindah === 0 && p2.tetap === 2 && Number((await versi([b1])).get(b1)!.version) === 1)
    const p3 = await coba(async () => D.pindahkanAset({ lokasi_id: r2.id, item: await item([b3, gedung]) }, userId))
    ok('E4 gedung tidak bisa dipindah ruangan → seluruhnya batal (B3 tetap tanpa ruangan)', p3 instanceof D.AsetDitolakError && (await versi([b3])).get(b3)!.lokasi_id === null)
    const p4 = await coba(async () => D.pindahkanAset({ lokasi_id: 99_999_999, item: await item([b3]) }, userId))
    ok('E5 ruangan tujuan yang tidak ada → ditolak (L68)', p4 instanceof B.BbaLokasiTidakDikenalError)

    const op = await D.asetOpname({ gedung })
    ok('E6 opname per gedung: gedungnya + isi ruangan di dalamnya, tanpa tanah & tanpa yang di luar', op.map(a => a.id).sort().join() === [gedung, b1, b2, e1].sort().join()
      && op.every(a => typeof a.version === 'number') && (await D.asetOpname({ ruang: r1.id })).length === 3)
    // Tanah tak bisa ditempatkan lewat aplikasi; kalau datanya terlanjur begitu, opname tetap melewatinya.
    await k.query('UPDATE bba_aset SET lokasi_id = ? WHERE id = ?', [r1.id, tanah])
    const opT = await D.asetOpname({ ruang: r1.id })
    await k.query('UPDATE bba_aset SET lokasi_id = NULL WHERE id = ?', [tanah])
    ok('E6b opname tidak memuat tanah walau datanya tercatat di ruangan', opT.length === 3 && !opT.some(a => a.id === tanah))

    const isi = (await item([b1, b2, gedung])).map((x, i) => ({ ...x, kondisi: (['RR', 'B', 'RB'] as const)[i] }))
    const h1 = await D.catatKondisi({ tgl: hariIni, catatan: 'Opname uji', item: isi }, userId)
    const m1 = await versi([b1, b2, gedung])
    const [rk1] = await k.query("SELECT COUNT(*) AS n FROM bba_aset_riwayat WHERE aset_id IN (?) AND jenis = 'KONDISI' AND catatan = 'Opname uji'", [[b1, b2, gedung]]) as [Array<{ n: number }>, unknown]
    ok('E7 catat kondisi: CEK + tanggal + oleh, versi naik, riwayat KONDISI per register; "berubah" = kondisi yang beda', h1.dicek === 3 && h1.berubah === 2
      && m1.get(b1)!.kondisi === 'RR' && m1.get(gedung)!.kondisi === 'RB' && [...m1.values()].every(x => x.kondisi_sumber === 'CEK' && x.tgl === hariIni) && Number(rk1[0].n) === 3)
    const basi = await coba(async () => D.catatKondisi({ tgl: hariIni, item: [{ id: b1, expected_version: 0, kondisi: 'B' }, ...(await cek([b2], 'RB'))] }, userId))
    ok('E8 satu angka kunci basi → seluruhnya 409, register lain tidak ikut tertulis', basi instanceof D.AsetVersiError && (await versi([b2])).get(b2)!.kondisi === 'B')
    const mundur = new Date(Date.parse(hariIni) - 86_400_000).toISOString().slice(0, 10)
    const tolak1 = await coba(async () => D.catatKondisi({ tgl: mundur, item: await cek([b1], 'B') }, userId))
    const tolak2 = await coba(async () => D.catatKondisi({ tgl: hariIni, item: await cek([tanah], 'B') }, userId))
    const tolak3 = await coba(async () => D.catatKondisi({ tgl: '2999-01-01', item: await cek([b3], 'B') }, userId))
    ok('E9 ditolak: tanggal lebih lama dari cek tercatat · tanah · tanggal sesudah hari ini', tolak1 instanceof D.AsetDitolakError && tolak1.alasan[0].includes('lebih baru')
      && tolak2 instanceof D.AsetDitolakError && tolak2.message.includes('tanah') && tolak3 instanceof D.AsetDitolakError && (await versi([b1])).get(b1)!.kondisi === 'RR')

    await k.query("UPDATE bba_aset SET kondisi_tgl = DATE_SUB(CURDATE(), INTERVAL 3 YEAR) WHERE id = ?", [b2])
    const perlu = await D.daftarAset({ q: 'UJIK.', kondisi: 'PERLU_DICEK' })
    const semuaU = await D.daftarAset({ q: 'UJIK.' })
    ok('E10 "perlu dicek": belum dicek (B3, buku) + lewat jarak opname (B2); tanah tidak; ringkasan lewat = 1', perlu.ringkas.jumlah === 3 && semuaU.ringkas.lewat === 1
      && semuaU.ringkas.belumDicek === 2, JSON.stringify({ perlu: perlu.ringkas, semua: semuaU.ringkas }))
    const tanpaR = await D.daftarAset({ q: 'UJIK.', lokasi: 0 })
    const diGedung = await D.daftarAset({ q: 'UJIK.', gedung })
    ok('E11 saringan ruangan: "tanpa ruangan" hanya peralatan (B3); per gedung = gedung + isinya', tanpaR.ringkas.jumlah === 1 && tanpaR.kelompok[0].ids[0] === b3 && diGedung.ringkas.jumlah === 4)

    const t1 = await D.tautkanBarangAset({ barang_baru: 'UJIK Meja Kerja', item: await item([b1, b2, b3]) }, userId)
    const [brg] = await k.query("SELECT id FROM bba_barang WHERE nama = 'UJIK Meja Kerja'") as [Array<{ id: number }>, unknown]
    const idB = Number(brg[0].id)
    const t2 = await D.tautkanBarangAset({ barang_id: idB, item: await item([b1]) }, userId)
    ok('E12 tautkan borongan: barang baru dibuat di transaksi yang sama; yang sudah bertaut dilewati', t1.ditautkan === 3 && t1.barang === 'UJIK Meja Kerja' && t2.ditautkan === 0 && t2.tetap === 1)
    const pb = (await B.perBarangTahun(2085)).rows.find(r => r.id === idB)
    const db = await B.detailBarang(idB, 2085)
    ok('E13 Per Barang & kartu barang: "dimiliki" dihitung dari register (2 baik · 1 RR · 2 perlu dicek · 1 ruangan)', pb?.dimiliki?.jumlah === 3 && pb.dimiliki.kondisi.baik === 2
      && pb.dimiliki.kondisi.rusak_ringan === 1 && pb.dimiliki.perluDicek === 2 && pb.dimiliki.ruangan === 1
      && db?.dimiliki_per_ruang.map(x => `${x.lokasi ?? '-'}:${x.ringkas.jumlah}`).join() === 'UJIK Ruang 1:2,-:1', JSON.stringify(pb?.dimiliki))
    const byBarang = await D.daftarAset({ barang: idB })
    ok('E14 Buku Aset tersaring per barang (tautan "Lihat n register" dari kartu barang)', byBarang.ringkas.jumlah === 3)

    const hapusR = await coba(() => B.hapusLokasi(r1.id))
    ok('E15 ruangan berisi aset tidak bisa dihapus; pesannya menyuruh memindahkan', hapusR instanceof B.BbaLokasiDipakaiError && hapusR.message.includes('Pindahkan'))
    const kirData = await D.ruangUntukKir(r1.id)
    const wbx = new ExcelJS.Workbook(); const ws = tulisLembarKir(wbx, kirData[0], kirData[0].aset, P, hariIni)
    ok('E16 KIR dari DB: isi ruangan + kop gedung/luas/PJ', kirData[0].aset.length === 3 && String(ws.getCell('C8').value).includes('UJIK Gedung')
      && ws.getCell('C27').value === '( UJIK PJ )' && (ws.getCell('K20').value as { result: number }).result === 1_000_000 * (1 + 2 + 1))
    const lengkap = (await D.asetAktifLengkap()).find(a => a.id === b1)
    ok('E17 format kerja dari DB: nama ruangan, gedung, barang, pengecek ikut', lengkap?.lokasi_nama === 'UJIK Ruang 1' && lengkap.gedung_nama === 'UJIK Gedung'
      && lengkap.barang_nama === 'UJIK Meja Kerja' && !!lengkap.kondisi_oleh_nama)
    const det = await D.detailAset(b1)
    ok('E18 kartu aset: riwayat memuat KONDISI, PINDAH, UBAH barang', ['KONDISI', 'PINDAH', 'UBAH'].every(j => det?.riwayat.some(r => r.jenis === j)))
  } finally {
    await bersih()
    const [sisa] = await k.query("SELECT (SELECT COUNT(*) FROM bba_aset WHERE kode_barang LIKE 'UJIK.%') AS a, (SELECT COUNT(*) FROM bba_lokasi WHERE nama LIKE 'UJIK %') AS l, (SELECT COUNT(*) FROM bba_barang WHERE nama LIKE 'UJIK %') AS b") as [Array<{ a: number; l: number; b: number }>, unknown]
    ok('E19 kotak pasir bersih', Number(sisa[0].a) + Number(sisa[0].l) + Number(sisa[0].b) === 0, JSON.stringify(sisa[0]))
    await k.end()
  }
}

const templat = process.argv[2]
if (templat && existsSync(templat)) {
  console.log('\nG. Kalibrasi lembar templat nyata')
  const wbT = new ExcelJS.Workbook(); await wbT.xlsx.readFile(templat)
  const satu = [aset({ id: 1, golongan: 'B' })]
  const buat: Record<string, [ExcelJS.Worksheet, number, number]> = {}
  const wbG = new ExcelJS.Workbook()
  buat.KIR = [tulisLembarKir(wbG, ruang, satu, P, '2026-10-27'), 12, 15]
  buat.BI = [tulisBukuInventaris(wbG, satu, P, '2026-10-27'), 10, 13]
  for (const g of GOLONGAN) buat[`KIB${g}Inv`] = [tulisLembarSensus(wbG, g, [aset({ id: 1, golongan: g })], P, 2026, '2026-10-27'), 10, 13]
  buat.RKPInv = [tulisRekapSensus(wbG, satu, P, 2026, '2026-10-27'), 10, 12]
  buat.Rekap = [tulisRekapBmd(wbG, satu, P, '202610', '2026-10-27'), 10, 12]
  const teks = (v: ExcelJS.CellValue) => (v == null ? '' : typeof v === 'object' && 'richText' in v ? v.richText.map(x => x.text).join('') : String(v)).trim()
  for (const [nama, [ws, r1, r2]] of Object.entries(buat)) {
    const t = wbT.getWorksheet(nama)
    if (!t) { ok(`G ${nama}: lembar ada di berkas templat`, false); continue }
    const beda: string[] = []
    for (let r = r1; r <= r2; r++) for (let col = 1; col <= Math.max(t.columnCount, ws.columnCount); col++) {
      const a = teks(t.getCell(r, col).value), b = teks(ws.getCell(r, col).value)
      if (a !== b) beda.push(`${hurufKolom(col)}${r} "${a}"≠"${b}"`)
    }
    const dalam = (m: string) => { const x = /^[A-Z]+(\d+):[A-Z]+(\d+)$/.exec(m); return !!x && Number(x[1]) >= r1 && Number(x[2]) <= r2 }
    const gT = (t.model as unknown as { merges: string[] }).merges.filter(dalam).sort().join(' '), gK = (ws.model as unknown as { merges: string[] }).merges.filter(dalam).sort().join(' ')
    ok(`G ${nama}: kepala & gabungan kepala sama dengan templat`, beda.length === 0 && gT === gK, `${beda.slice(0, 4).join('; ')}${gT !== gK ? ` | gabung ${gT} ≠ ${gK}` : ''}`)
  }
}

console.log(`\n${lulus} lulus, ${gagal.length} gagal`)
if (gagal.length) { console.log(gagal.map(g => `  - ${g}`).join('\n')); process.exit(1) }
process.exit(0)
