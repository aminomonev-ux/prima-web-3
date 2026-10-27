#!/usr/bin/env npx tsx
// scripts/test-bba-aset.mts — Tahap B Buku Aset: kolom KIB, impor KIB, Excel format provinsi.
// Konsep: docs/CONCEPT-bba-buku-aset.md §5, §7.1, §9, §15.
// Jalankan: npx tsx --env-file=.env.local scripts/test-bba-aset.mts [berkas-kib-c.xlsx]
//   argumen opsional = ekspor KIB C nyata (Bangsal Jiwa) untuk kalibrasi; tidak masuk repo.
// Bagian F memakai MySQL sungguhan; data uji berkode "UJI." dan dibersihkan otomatis.
import { readFileSync, existsSync } from 'node:fs'
import ExcelJS from 'exceljs'
import mysql from 'mysql2/promise'
import {
  GOLONGAN, KOLOM_KIB, NOMOR_KOLOM, gabunganKepala, kisiKepala, uraiKodeBarang, golonganDariKodeObjek,
  bacaKondisi, kunciKib, type Golongan,
} from '../lib/bba/kib'
import { bacaWorkbookKib, petakanKolom, angka } from '../lib/bba/kib-baca'
import { kelompokkan, rentangRegister, bandingAset, rencanakanImpor, namaTampil, type AsetRingan } from '../lib/bba/aset'
import { tulisLembarKib, hurufKolom, urutCetak } from '../lib/bba/kib-excel'
import { PENGATURAN_BAWAAN, bacaPengaturan, type PengaturanBba } from '../lib/bba/pengaturan'

let lulus = 0
const gagal: string[] = []
function ok(nama: string, syarat: unknown, ket = '') {
  if (syarat) { lulus++; console.log(`  ok  ${nama}`) }
  else { gagal.push(nama); console.log(`FAIL  ${nama}${ket ? ' — ' + ket : ''}`) }
}
const sumber = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
const coba = async <T,>(f: () => Promise<T>): Promise<T | Error> => { try { return await f() } catch (e) { return e as Error } }

console.log('A. Definisi kolom KIB (lib/bba/kib.ts) = templat provinsi')
// Daftar gabungan baris kepala 10–12 dari lembar KIBA…KIBF ekspor provinsi (Rekap Aset 2025).
const GABUNG_PROVINSI: Record<Golongan, string> = {
  A: 'A10:A12 B10:B12 C10:D11 E10:E12 F10:F12 G10:G12 H10:J10 H11:H12 I11:J11 K10:K12 L10:L12 M10:M12 N10:N12',
  B: 'A10:A12 B10:B12 C10:C12 D10:D12 E10:E12 F10:F12 G10:G12 H10:H12 I10:I12 J10:N11 O10:O12 P10:P12 Q10:Q12',
  C: 'A10:A12 B10:B12 C10:D11 E10:E12 F10:G11 H10:H12 I10:I12 J10:K11 L10:L12 M10:M12 N10:N12 O10:O12 P10:P12 Q10:Q12',
  D: 'A10:A12 B10:B12 C10:D11 E10:E12 F10:F12 G10:G12 H10:H12 I10:I12 J10:K11 L10:L12 M10:M12 N10:N12 O10:O12 P10:P12 Q10:Q12',
  E: 'A10:A12 B10:B12 C10:C12 D10:D12 E10:E12 F10:F12 G10:G12 H10:H12 I10:I12 J10:J12 K10:K12 L10:L12 M10:M12 N10:N12 O10:O12 P10:P12',
  F: 'A10:A12 B10:B12 C10:C12 D10:E11 F10:F12 G10:G12 H10:I11 J10:J12 K10:K12 L10:L12 M10:M12 N10:N12 O10:O12',
}
const gabungKita = (g: Golongan) => gabunganKepala(kisiKepala(g)).map(m => `${hurufKolom(m.c1 + 1)}${m.r1 + 10}:${hurufKolom(m.c2 + 1)}${m.r2 + 10}`).sort().join(' ')
const urutGabung = (s: string) => s.split(' ').sort().join(' ')
ok('A1 gabungan kepala keenam golongan identik dengan lembar provinsi', GOLONGAN.every(g => gabungKita(g) === urutGabung(GABUNG_PROVINSI[g])),
  GOLONGAN.filter(g => gabungKita(g) !== urutGabung(GABUNG_PROVINSI[g])).join(','))
ok('A2 jumlah kolom & baris nomor sesuai templat (A14 B17 C17 D17 E16 F15; KIB B mengulang "8")',
  GOLONGAN.map(g => KOLOM_KIB[g].length).join() === '14,17,17,17,16,15' && GOLONGAN.every(g => NOMOR_KOLOM[g].length === KOLOM_KIB[g].length)
  && NOMOR_KOLOM.B.slice(7, 10).join() === '8,8,9')
ok('A3 teks kepala persis, termasuk salah ketik & spasi ganda templat', KOLOM_KIB.C[6].kepala[2] === 'Beton/  Tidak' && KOLOM_KIB.F[13].kepala[0] === 'Nilai Kotrak'
  && KOLOM_KIB.B[5].kepala[0] === 'Ukuran/ CC' && KOLOM_KIB.A[4].lebar === 0 && KOLOM_KIB.E[11].lebar === 0)
const kode = '11.01.33.74.010206.00000.00000.1984-1.3.3.01.01.02.001'
ok('A4 kode barang memuat tahun perolehan & kode objek', JSON.stringify(uraiKodeBarang(kode)) === '{"tahun":1984,"kodeObjek":"1.3.3.01.01.02.001"}'
  && uraiKodeBarang('tanpa tahun').tahun === null && golonganDariKodeObjek('1.3.3.01.01.02.001') === 'C' && golonganDariKodeObjek('1.3.1.01') === 'A' && golonganDariKodeObjek('5.1') === null)
ok('A5 kondisi KIB/KIR/BI dibaca seragam; teks asing = kosong', bacaKondisi('BAIK') === 'B' && bacaKondisi(' rusak  ringan ') === 'RR' && bacaKondisi('KB') === 'RR'
  && bacaKondisi('R') === 'RB' && bacaKondisi('RUSAK BERAT') === 'RB' && bacaKondisi('cukup') === null && bacaKondisi('') === null)
ok('A6 angka gaya Indonesia & Inggris terbaca benar', angka('1.250.000') === 1250000 && angka('7,5') === 7.5 && angka('1,250,000') === 1250000 && angka(300) === 300 && angka('') === null)

console.log('\nB. Pembaca impor (lib/bba/kib-baca.ts)')
const P: PengaturanBba = { ...PENGATURAN_BAWAAN, kop: { kode_lokasi: '010206.00000.00000', bidang: 'RS UJI', sub_bidang: 'RS UJI', satuan_kerja: 'RS UJI' },
  ttd: { ...PENGATURAN_BAWAAN.ttd, kota: 'Semarang', kepala_jabatan: 'KEPALA SKPD', kepala_nama: 'dr. Kepala Uji', kepala_nip: '1970', pengurus_nama: 'Pengurus Uji', pengurus_nip: '1980' } }
const isiKib = (g: Golongan, i: number): Record<string, string | number | null> => Object.fromEntries(kunciKib(g).map(k => {
  const def = KOLOM_KIB[g].find(d => d.kunci === k)!
  return [k, def.tipe === 'angka' ? 100 + i : def.tipe === 'tanggal' ? '1984-12-31' : `${k}-${i}`]
}))
const contoh = (g: Golongan, i: number, tahun = 1984): AsetRingan => ({
  id: i, golongan: g, kode_barang: g === 'F' ? null : `UJI.01.${tahun}-1.3.${GOLONGAN.indexOf(g) + 1}.01.0${i}`, register: g === 'F' ? null : String(i).padStart(6, '0'),
  kunci_impor: null, kode_objek: null, tahun_perolehan: tahun, nama_resmi: `BARANG ${g} ${i}`, nama: null, lokasi_id: null,
  harga: 1_000_000 * i + 0.5, asal_usul: 'BELANJA MODAL', keterangan: `Ket ${g}${i}`,
  kondisi: g === 'B' || g === 'E' || g === 'A' ? null : (['B', 'RR', 'RB'] as const)[i % 3], kondisi_sumber: null,
  kib: isiKib(g, i), status: 'AKTIF',
})
async function bolakBalik(wb: ExcelJS.Workbook) {
  const buf = await wb.xlsx.writeBuffer()
  const wb2 = new ExcelJS.Workbook()
  await wb2.xlsx.load(buf as ArrayBuffer)
  return { wb2, hasil: bacaWorkbookKib(wb2) }
}
const wbSemua = new ExcelJS.Workbook()
const sampel: Record<Golongan, AsetRingan[]> = Object.fromEntries(GOLONGAN.map(g => [g, [1, 2, 3].map(i => contoh(g, i))])) as Record<Golongan, AsetRingan[]>
for (const g of GOLONGAN) tulisLembarKib(wbSemua, g, sampel[g], P, '2026-10-26')
const { wb2, hasil } = await bolakBalik(wbSemua)
const cocok = GOLONGAN.every(g => {
  const dibaca = hasil.aset.filter(a => a.golongan === g)
  return dibaca.length === 3 && sampel[g].every((s, i) => {
    const d = dibaca[i]
    return d.nama_resmi === s.nama_resmi && d.kode_barang === s.kode_barang && d.register === s.register && Math.abs(d.harga - s.harga) < 0.001
      && d.kondisi === s.kondisi && d.keterangan === s.keterangan && JSON.stringify(Object.keys(d.kib).sort()) === JSON.stringify(kunciKib(g).sort())
      && kunciKib(g).every(k => String(d.kib[k]) === String(s.kib[k]))
  })
})
ok('B1 bolak-balik: Excel PRIMA keenam golongan dibaca kembali utuh (kolom KIB, harga, kondisi, register)', cocok && hasil.masalah.length === 0 && hasil.peringatan.length === 0,
  JSON.stringify({ masalah: hasil.masalah, peringatan: hasil.peringatan.slice(0, 3) }))
ok('B2 kop berkas ikut terbaca (kode lokasi, satuan kerja)', hasil.kop?.kode_lokasi === '010206.00000.00000' && hasil.kop?.satuan_kerja === 'RS UJI')
ok('B3 kunci impor: kode|register (A–E), isi baris untuk KIB F', hasil.aset.find(a => a.golongan === 'C')?.kunci === `${sampel.C[0].kode_barang}|000001`
  && hasil.aset.find(a => a.golongan === 'F')?.kunci.startsWith('f|barang f 1|letak-1|1984-12-31'))
ok('B4 tahun perolehan dari kode; KIB F dari tanggal mulai pekerjaan', hasil.aset.filter(a => a.golongan !== 'F').every(a => a.tahun_perolehan === 1984)
  && hasil.aset.filter(a => a.golongan === 'F').every(a => a.tahun_perolehan === 1984))

// Kolom bergeser & kolom asing: tetap terbaca dari JUDULNYA, kolom asing dilaporkan.
// Disalin nilai-per-nilai ke lembar baru dengan satu kolom disisipkan sesudah Register (exceljs
// `spliceColumns` tidak ikut menggeser sel gabungan, jadi lembarnya dibangun ulang).
const wsAsal = wb2.getWorksheet('KIBC')!
const wbGeser = new ExcelJS.Workbook()
const wsGeser = wbGeser.addWorksheet('KIBC')
const SISIP: Record<number, string> = { 10: 'Kolom Baru', 11: 'Kolom Baru', 12: 'Kolom Baru', 13: '5a', 14: 'x', 15: 'y', 16: 'z' }
for (let r = 1; r <= 22; r++) {
  for (let cc = 1; cc <= 18; cc++) {
    const v = cc < 5 ? wsAsal.getCell(r, cc).value : cc === 5 ? (SISIP[r] ?? null) : wsAsal.getCell(r, cc - 1).value
    if (v != null) wsGeser.getCell(r, cc).value = v
  }
}
const geser = bacaWorkbookKib(wbGeser)
ok('B5 kolom tambahan di tengah: kolom lain tetap terbaca dari judulnya, kolom asing dilaporkan (tidak disimpan)',
  geser.aset.filter(a => a.golongan === 'C').every((a, i) => a.harga === sampel.C[i].harga && a.kib.letak === sampel.C[i].kib.letak)
  && geser.peringatan.some(p => p.includes('KIBC') && p.includes('Kolom Baru')), JSON.stringify(geser.peringatan))
const wbHilang = new ExcelJS.Workbook()
tulisLembarKib(wbHilang, 'C', sampel.C, P, '2026-10-26')
const wsH = wbHilang.getWorksheet('KIBC')!
for (let r = 10; r <= 12; r++) wsH.getCell(r, 16).value = 'Nilai'
const hilang = bacaWorkbookKib((await bolakBalik(wbHilang)).wb2)
ok('B6 kolom wajib (Harga) hilang → lembar ditolak dengan nama kolomnya, tidak ada yang dibaca', hilang.masalah.some(m => m.includes('Harga')) && hilang.aset.length === 0)
const wbKembar = new ExcelJS.Workbook()
tulisLembarKib(wbKembar, 'B', [contoh('B', 1), { ...contoh('B', 1), id: 9 }], P, '2026-10-26')
const kembar = bacaWorkbookKib((await bolakBalik(wbKembar)).wb2)
ok('B7 register kembar di berkas → ditolak (menyebut baris pertamanya)', kembar.masalah.some(m => m.includes('kembar') && m.includes('baris 14')))
const wbAngka = new ExcelJS.Workbook()
tulisLembarKib(wbAngka, 'A', [contoh('A', 7)], P, '2026-10-26')
wbAngka.getWorksheet('KIBA')!.getCell(14, 4).value = 7
const regAngka = bacaWorkbookKib((await bolakBalik(wbAngka)).wb2)
ok('B8 register yang tersimpan sebagai angka (nol depannya hilang) dikembalikan 6 digit', regAngka.aset[0]?.register === '000007')
const wbLain = new ExcelJS.Workbook(); wbLain.addWorksheet('Sheet1').getCell('A1').value = 'bukan KIB'
ok('B9 berkas tanpa lembar KIB → ditolak dengan arahan', bacaWorkbookKib(wbLain).masalah[0]?.includes('KIBA'))
ok('B10 petakanKolom: urutan kolom berbeda tetap terpetakan dari kepala', (() => {
  const kisi = kisiKepala('A'); const balik = kisi.map(r => [...r].reverse())
  const { peta, takDikenal } = petakanKolom('A', balik)
  return takDikenal.length === 0 && peta.get(0)?.kunci === 'keterangan' && peta.get(13)?.kunci === 'no'
})())

console.log('\nC. Aturan buku aset (lib/bba/aset.ts)')
const ringan = (p: Partial<AsetRingan>): AsetRingan => ({ ...contoh('B', 1), kib: {}, ...p })
const kel = kelompokkan([
  ringan({ id: 1, register: '000011', kondisi: 'B' }), ringan({ id: 2, register: '000012', kondisi: 'RB' }),
  ringan({ id: 3, register: '000013', kondisi: null }), ringan({ id: 4, register: '000020', tahun_perolehan: 2021 }),
  ringan({ id: 5, register: '000021', lokasi_id: 7 }), ringan({ id: 6, nama: 'Kursi roda IGD' }),
])
ok('C1 kelompok = sejenis-setahun-seruangan (nama tampil + kode objek + tahun + ruangan)', kel.length === 4 && kel[0].ids.join() === '1,2,3'
  && kel[0].kondisi.B === 1 && kel[0].kondisi.RB === 1 && kel[0].kondisi.kosong === 1 && kel[0].belumDicek === 3, JSON.stringify(kel.map(k => k.ids)))
ok('C2 rentang register', rentangRegister(['000013', '000011', '000012']) === '000011–000013' && rentangRegister(['000001', '000005']) === '000001, 000005' && rentangRegister([]) === '—')
ok('C3 nama tampil: nama sehari-hari menang, kosong = nama resmi', namaTampil({ nama: 'Gedung Bangsal I', nama_resmi: 'BANGUNAN GUDANG' }) === 'Gedung Bangsal I' && namaTampil({ nama: '  ', nama_resmi: 'X' }) === 'X')
const lama = ringan({ id: 1, kunci_impor: 'k1', harga: 100, kondisi: 'RB', kondisi_sumber: 'CEK', kib: { merk_type: 'A' }, nama: 'Nama PRIMA' })
const baca = { ...hasil.aset[0], golongan: 'B' as Golongan, kunci: 'k1', harga: 120, kondisi: 'B' as const, kib: { merk_type: 'B' } }
const bnd = bandingAset(lama, baca)
ok('C4 impor ulang: harga & kolom KIB diperbarui, kondisi hasil cek RT TIDAK ditimpa, nama PRIMA tidak disentuh',
  bnd.kolom.includes('harga') && bnd.kolom.includes('merk_type') && !bnd.kolom.includes('kondisi') && bnd.ubah.nama === undefined, JSON.stringify(bnd))
const bnd2 = bandingAset({ ...lama, kondisi_sumber: 'IMPOR' }, baca)
ok('C5 kondisi yang belum dicek (dari impor) ikut diperbarui', bnd2.kolom.includes('kondisi') && bnd2.ubah.kondisi === 'B')
const rencana = rencanakanImpor([
  ringan({ id: 1, kunci_impor: 'k1' }), ringan({ id: 2, kunci_impor: 'k2', status: 'DIHAPUS' }),
  ringan({ id: 3, kunci_impor: 'k3' }), ringan({ id: 4, golongan: 'C', kunci_impor: 'kc' }),
], [{ ...baca, kunci: 'k1' }, { ...baca, kunci: 'k2' }, { ...baca, kunci: 'baru' }])
ok('C6 rencana impor: baru / berubah / dihapus-di-PRIMA tidak dihidupkan / yang tak ada di berkas hanya golongan berkas',
  rencana.baru.length === 1 && rencana.berubah.length === 1 && rencana.dihapusDiPrima.length === 1
  && rencana.tidakDiBerkas.map(a => a.id).join() === '3', JSON.stringify({ t: rencana.tidakDiBerkas.map(a => a.id) }))

console.log('\nD. Excel KIB format provinsi (lib/bba/kib-excel.ts)')
const wsX = wbSemua.getWorksheet('KIBC')!
const nilai = (a: string) => String(wsX.getCell(a).value ?? '')
ok('D1 kop: judul, provinsi, kode lokasi', nilai('C2') === 'KARTU INVENTARIS BARANG (KIB) C. GEDUNG DAN BANGUNAN' && nilai('C3') === 'PROVINSI JAWA TENGAH'
  && nilai('C5') === ': 010206.00000.00000' && (wsX.getCell('C2').font?.size === 14))
ok('D2 kepala & nomor kolom persis; isi Arial 9 mulai baris 14', [10, 11, 12].every(r => KOLOM_KIB.C.every((k, c) => String(wsX.getCell(r, c + 1).value) === k.kepala[r - 10]))
  && KOLOM_KIB.C.every((_, c) => String(wsX.getCell(13, c + 1).value) === String(c + 1)) && wsX.getCell(14, 2).font?.name === 'Arial' && wsX.getCell(14, 2).font?.size === 9)
const fJumlah = wsX.getCell('P18').value as { formula?: string; result?: number }
ok('D3 baris pendek penutup (6 pt) lalu "Jumlah" ber-SUM yang mencakupnya', wsX.getRow(17).height === 6 && nilai('N18') === 'Jumlah'
  && fJumlah?.formula === 'SUM(P14:P17)' && Math.abs((fJumlah.result ?? 0) - 6_000_001.5) < 0.01)
ok('D4 tanda tangan dua blok dari pengaturan', nilai('D20') === 'Mengetahui,' && nilai('D21') === 'KEPALA SKPD' && nilai('D25') === '( dr. Kepala Uji )'
  && nilai('P20').startsWith('Semarang , 26 Oktober 2026') && nilai('P25') === '( Pengurus Uji )' && nilai('P26') === 'NIP. 1980')
ok('D5 kolom bersembunyi di templat ikut disembunyikan (KIB A Luas, KIB E Jumlah & Tahun)', wbSemua.getWorksheet('KIBA')!.getColumn(5).hidden === true
  && wbSemua.getWorksheet('KIBE')!.getColumn(12).hidden === true && wbSemua.getWorksheet('KIBE')!.getColumn(13).hidden === true && wsX.getColumn(2).width === 25)
ok('D6 halaman A4 mendatar, nomor kolom diulang tiap halaman', wsX.pageSetup.paperSize === 9 && wsX.pageSetup.orientation === 'landscape' && wsX.pageSetup.printTitlesRow === '13:13')
ok('D7 kondisi ditulis seperti KIB provinsi (BAIK / RUSAK RINGAN / RUSAK BERAT)', ['RUSAK RINGAN', 'RUSAK BERAT', 'BAIK'].every((t, i) => nilai(`E${14 + i}`) === t))
ok('D8 urutan cetak = kode barang lalu register', urutCetak([ringan({ id: 1, kode_barang: 'B', register: '2' }), ringan({ id: 2, kode_barang: 'A', register: '9' }), ringan({ id: 3, kode_barang: 'B', register: '1' })]).map(a => a.id).join() === '2,3,1')
ok('D9 pengaturan rusak di DB tidak mematikan halaman', bacaPengaturan('{rusak').ttd.kota === 'Semarang' && bacaPengaturan(null).opname_bulan === 12)

console.log('\nE. Pagar & jalur')
const rImpor = sumber('app/api/buku-besar-aset/aset/impor/route.ts')
ok('E1 impor: pratinjau tidak menulis; simpan membaca ulang berkas yang diunggah (baris tidak dikirim dari layar)', rImpor.includes("if (step === 'pratinjau') return NextResponse.json({ ok: true, ...ringkasBaca, rencana: await pratinjauImpor(hasil) });")
  && rImpor.indexOf('simpanImpor(hasil') > rImpor.indexOf("if (step === 'pratinjau')") && rImpor.includes('fileTypeFromBuffer') && rImpor.includes('if (hasil.masalah.length)'))
const dAset = sumber('lib/data/bba-aset.ts')
ok('E2 simpan impor dikunci per modul lalu membaca aset lama di bawah kunci (FOR UPDATE)', dAset.indexOf("acquireBludLock(tx, 'bba_aset_impor', 'semua')") >= 0
  && dAset.indexOf("acquireBludLock(tx, 'bba_aset_impor', 'semua')") < dAset.indexOf('rencanakanImpor(await asetLamaUntuk(tx, golongan, true)'))
ok('E3 impor ulang memperbarui lewat upsert borongan, bukan UPDATE per baris (PERF-C1)', dAset.includes('VALUES ? AS baru') && !/for \(const [^)]+\) await tx`UPDATE bba_aset/.test(dAset))
const dBba = sumber('lib/data/buku-besar-aset.ts')
ok('E4 barang & lokasi dirujuk aset: hapus menghitungnya, gabung memindahkannya beserta riwayat (L69)',
  dBba.includes('(SELECT COUNT(*) FROM bba_aset WHERE barang_id = ${id}) AS aset') && dBba.includes('UPDATE bba_aset SET barang_id = ${ke}')
  && dBba.includes("'Gabungkan barang'") && dBba.includes('(SELECT COUNT(*) FROM bba_aset WHERE lokasi_id = ${id}) AS aset'))
const skema = sumber('docs/schema-mysql.sql')
ok('E5 tabel baru tercatat di skema acuan + migrasi', skema.includes('CREATE TABLE IF NOT EXISTS bba_aset (') && skema.includes('CREATE TABLE IF NOT EXISTS bba_aset_riwayat (')
  && existsSync(new URL('../docs/migrations/migration-bba-aset.sql', import.meta.url)))

console.log('\nF. MySQL sungguhan — impor, impor ulang, kartu aset')
let c: mysql.Connection | null = null
try {
  c = await mysql.createConnection({ host: process.env.MYSQL_HOST, port: Number(process.env.MYSQL_PORT || 3306), user: process.env.MYSQL_USER, password: process.env.MYSQL_PASSWORD, database: process.env.MYSQL_DATABASE })
} catch (e) { console.log(`DILEWATI bagian DB: MySQL tidak bisa dihubungi (${(e as { code?: string }).code ?? e})`) }
if (c) {
  const k = c
  const BARANG = 'UJI BBA ASET'
  const bersih = async () => {
    await k.query("DELETE FROM bba_aset WHERE kode_barang LIKE 'UJI.%' OR kunci_impor LIKE 'f|barang f %'")
    await k.query('DELETE FROM bba_barang WHERE nama LIKE ?', [`${BARANG}%`])
  }
  await bersih()
  const D = await import('../lib/data/bba-aset')
  const B = await import('../lib/data/buku-besar-aset')
  const [u] = await k.query('SELECT id FROM users ORDER BY id LIMIT 1') as [Array<{ id: number }>, unknown]
  const userId = Number(u[0]?.id ?? 0)
  try {
    const tanah = { ...contoh('A', 1, 1980), kode_barang: 'UJI.01.1980-1.3.1.01.01.04.003', register: '000001' }
    const gedung = [1, 2].map(i => ({ ...contoh('C', i), kib: { ...isiKib('C', i), nomor_kode_tanah: 'UJI.01.1980-1.3.1.01.01.04.003.000001' } }))
    const wbI = new ExcelJS.Workbook()
    tulisLembarKib(wbI, 'A', [tanah], P, '2026-10-26'); tulisLembarKib(wbI, 'C', gedung, P, '2026-10-26')
    const baca1 = (await bolakBalik(wbI)).hasil
    const pra = await D.pratinjauImpor(baca1)
    const [n0] = await k.query("SELECT COUNT(*) AS n FROM bba_aset WHERE kode_barang LIKE 'UJI.%'") as [Array<{ n: number }>, unknown]
    ok('F1 pratinjau menghitung 1 tanah + 2 gedung baru dan TIDAK menulis apa pun', pra.perGolongan.map(p => `${p.golongan}:${p.baru}`).join() === 'A:1,C:2' && Number(n0[0].n) === 0)
    const s1 = await D.simpanImpor(baca1, userId, 'uji.xlsx')
    const daftar = await D.daftarAset({ golongan: 'C', q: 'UJI.01' })
    const gd = (await D.asetMenurutId(daftar.kelompok.flatMap(x => x.ids)))
    ok('F2 simpan: tercatat, nama sehari-hari dari Keterangan, kondisi bertanda "dari sistem provinsi"', s1.baru === 3 && gd.length === 2
      && gd.every(a => a.nama === a.keterangan && a.kondisi_sumber === 'IMPOR') && daftar.ringkas.belumDicek === 2, JSON.stringify(s1))
    const det = await D.detailAset(gd[0].id)
    ok('F3 kartu aset: tanah tempat gedung berdiri ditemukan lewat Nomor Kode Tanah; riwayat IMPOR ada', det?.tanah?.golongan === 'A' && det.riwayat[0]?.jenis === 'IMPOR')
    const detTanah = await D.detailAset(det!.tanah!.id)
    ok('F4 kartu tanah: gedung di atasnya terdaftar', detTanah?.diAtasnya.length === 2)

    await D.ubahAset({ id: gd[0].id, expected_version: det!.aset.version, nama: 'Gedung Bangsal Uji', barang_baru: `${BARANG} Gedung` }, userId)
    await k.query("UPDATE bba_aset SET kondisi = 'RB', kondisi_sumber = 'CEK' WHERE id = ?", [gd[1].id])
    const basi = await coba(() => D.ubahAset({ id: gd[0].id, expected_version: det!.aset.version, nama: 'X' }, userId))
    ok('F5 ubah nama & barang tercatat di riwayat; angka kunci basi → 409', basi instanceof D.AsetVersiError
      && (await D.detailAset(gd[0].id))?.riwayat.some(r => r.jenis === 'UBAH' && (r.sesudah as Record<string, unknown>)?.nama === 'Gedung Bangsal Uji'))

    const gedung2 = gedung.map(gx => ({ ...gx, harga: gx.harga + 5, kondisi: 'B' as const }))
    const wbU = new ExcelJS.Workbook(); tulisLembarKib(wbU, 'C', gedung2.slice(0, 1).concat(gedung2[1]), P, '2026-10-26')
    const baca2 = (await bolakBalik(wbU)).hasil
    const s2 = await D.simpanImpor(baca2, userId, 'uji-ulang.xlsx')
    const sesudah = await D.asetMenurutId(gd.map(x => x.id))
    const g0 = sesudah.find(a => a.id === gd[0].id)!, g1 = sesudah.find(a => a.id === gd[1].id)!
    ok('F6 impor ulang: harga diperbarui, nama PRIMA tetap, kondisi hasil cek RT tidak ditimpa', s2.berubah === 2 && s2.baru === 0
      && Math.abs(g0.harga - gedung2[0].harga) < 0.01 && g0.nama === 'Gedung Bangsal Uji' && g1.kondisi === 'RB' && g1.kondisi_sumber === 'CEK', JSON.stringify({ s2, g1: [g1.kondisi, g1.kondisi_sumber] }))
    const s3 = await D.simpanImpor(baca2, userId, 'uji-ulang.xlsx')
    ok('F7 impor berkas yang sama lagi → semuanya "sama", tidak ada yang ditulis', s3.berubah === 0 && s3.baru === 0 && s3.sama === 2)
    const tanahSaja = (await bolakBalik(wbI)).hasil
    tanahSaja.aset = tanahSaja.aset.filter(a => a.golongan === 'C').slice(0, 1)
    const pra2 = await D.pratinjauImpor(tanahSaja)
    ok('F8 register yang tak ada di berkas dilaporkan (hanya golongan berkas), tidak dihapus', pra2.perGolongan.find(p => p.golongan === 'C')!.tidakDiBerkas >= 1
      && (await D.asetMenurutId([gd[1].id])).length === 1)

    const [bar] = await k.query('SELECT id FROM bba_barang WHERE nama = ?', [`${BARANG} Gedung`]) as [Array<{ id: number }>, unknown]
    const tolakHapus = await coba(() => B.hapusBarang(Number(bar[0].id)))
    ok('F9 barang yang dipakai aset tidak bisa dihapus (pesannya menyebut aset)', tolakHapus instanceof B.BbaBarangDipakaiError && tolakHapus.message.includes('aset di Buku Aset'))
    const ke = await B.createBarang({ nama: `${BARANG} Tujuan` }, userId)
    await B.gabungBarang(Number(bar[0].id), ke.id, userId)
    const pindah = await D.detailAset(gd[0].id)
    ok('F10 gabungkan barang memindah aset & mencatat riwayatnya', pindah?.aset.barang_id === ke.id && pindah.riwayat.some(r => r.catatan === 'Gabungkan barang'))
  } finally {
    await bersih()
    const [sisa] = await k.query("SELECT (SELECT COUNT(*) FROM bba_aset WHERE kode_barang LIKE 'UJI.%') AS a, (SELECT COUNT(*) FROM bba_barang WHERE nama LIKE ?) AS b", [`${BARANG}%`]) as [Array<{ a: number; b: number }>, unknown]
    ok('F11 kotak pasir bersih', Number(sisa[0].a) === 0 && Number(sisa[0].b) === 0, JSON.stringify(sisa[0]))
    await k.end()
  }
}

const berkasNyata = process.argv[2]
if (berkasNyata && existsSync(berkasNyata)) {
  console.log('\nG. Kalibrasi berkas nyata')
  const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(berkasNyata)
  const h = bacaWorkbookKib(wb)
  ok(`G1 ${berkasNyata.split(/[\\/]/).pop()}: ${h.aset.length} register terbaca tanpa masalah`, h.aset.length > 0 && h.masalah.length === 0, JSON.stringify(h.masalah))
  const c8 = h.aset.filter(a => a.golongan === 'C')
  if (c8.length === 8) ok('G2 Bangsal Jiwa: 7 gedung 1984 + 1 gedung 1987, nama dari Keterangan, total Rp 1.948.408.800',
    c8.filter(a => a.tahun_perolehan === 1984).length === 7 && c8[7].tahun_perolehan === 1987 && c8[0].keterangan === 'Gedung Bangsal I'
    && c8.reduce((s, a) => s + a.harga, 0) === 1_948_408_800)
}

console.log(`\n${lulus} lulus, ${gagal.length} gagal`)
if (gagal.length) { console.log(gagal.map(g => `  - ${g}`).join('\n')); process.exit(1) }
process.exit(0)
