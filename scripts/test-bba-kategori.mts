#!/usr/bin/env npx tsx
// scripts/test-bba-kategori.mts — Master Kategori 2 tingkat BBA (docs/konsep/bba/CONCEPT-bba-master-kategori.md).
// Jalankan: npx tsx --env-file=.env.local scripts/test-bba-kategori.mts
// Bagian C memakai MySQL sungguhan (kotak pasir 2063, data berawalan "UJIKAT"), dibersihkan otomatis. Tanpa MySQL
// bagian itu GAGAL, bukan dilewati.
import { readFileSync } from 'node:fs'
import mysql from 'mysql2/promise'
import {
  deteksiKelompokKib, adalahModal, normalisasiKategoriItem, pilihanDariBaris, kelompokKibPilihan, gabungRekeningBlud, POLA_KODE_OPERASI,
  cocokSaringKategori, golonganDariKelompokKib,
  type MasterKategoriData,
} from '../lib/bba/kategori'
import { tahapRencana } from '../lib/bba/tahap'

let lulus = 0
const gagal: string[] = []
function ok(nama: string, syarat: unknown, ket = '') {
  if (syarat) { lulus++; console.log(`  ok  ${nama}`) }
  else { gagal.push(nama); console.log(`FAIL  ${nama}${ket ? ' — ' + ket : ''}`) }
}
const sumber = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
const tanpaKomentar = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
const badan = (teks: string, awal: string) => { const i = teks.indexOf(awal); if (i < 0) return ''; const j = teks.indexOf('\nexport ', i + 10); return teks.slice(i, j < 0 ? undefined : j) }
const coba = async <T,>(f: () => Promise<T>): Promise<T | Error> => { try { return await f() } catch (e) { return e as Error } }

console.log('A. Aturan murni')
ok('A1 deteksi KIB: kata kunci alkes menang atas awalan kode', deteksiKelompokKib('5.2.03.01', 'Belanja Modal Alat Kedokteran') === 'ALKES & ALDOK')
ok('A2 deteksi KIB per awalan 5.2.01..06 (berangka nol maupun tidak)',
  deteksiKelompokKib('5.2.01.01', '') === 'TANAH' && deteksiKelompokKib('5.02.02.05', '') === 'PERALATAN DAN MESIN'
  && deteksiKelompokKib('5.2.3', '') === 'GEDUNG DAN BANGUNAN' && deteksiKelompokKib('5.2.04.1', '') === 'JALAN, IRIGASI, DAN JARINGAN'
  && deteksiKelompokKib('5.2.06', '') === 'KONSTRUKSI DALAM PENGERJAAN (KDP)' && deteksiKelompokKib('5.1.02.01', 'ATK') === null)
ok('A3 adalahModal: kategori tertulis menentukan sendiri', adalahModal({ kategori: 'Modal', kode_rekening: '5.1.02' }) && !adalahModal({ kategori: 'Barang dan Jasa', kategori_aset: 'TANAH' }))
ok('A4 adalahModal data lama: 6 KIB + ALKES = Modal, teks lain bukan', adalahModal({ kategori_aset: 'gedung dan bangunan' }) && adalahModal({ kategori_aset: 'ALKES' }) && !adalahModal({ kategori_aset: 'ATK' }))
ok('A5 adalahModal tanpa kategori: 5.1.x bukan Modal, 5.10/5.2/kosong Modal',
  !adalahModal({ kode_rekening: '5.1.02.01' }) && !adalahModal({ kode_rekening: '5.01' }) && adalahModal({ kode_rekening: '5.10.1' })
  && adalahModal({ kode_rekening: '5.2.02' }) && adalahModal({}))
ok('A6 POLA_KODE_OPERASI = regex `^5\\.0?1(\\.|$)` (dikirim sebagai parameter REGEXP)', POLA_KODE_OPERASI === '^5\\.0?1(\\.|$)')
{
  const n = normalisasiKategoriItem({ kategori_aset: 'Tanah' })
  ok('A7 normalisasi data lama: Tanah → Modal / Tanah / kelompok TANAH', n.kategori === 'Modal' && n.jenis_kategori === 'Tanah' && n.kelompok_kib === 'TANAH')
}
const master: MasterKategoriData = {
  induk: [{ id: 1, nama: 'Barang dan Jasa', bawaan: true, urutan: 1 }, { id: 2, nama: 'Modal', bawaan: true, urutan: 2 }],
  kelompok_kib: [{ id: 1, nama: 'TANAH', bawaan: true, urutan: 1 }],
  jenis: [
    { id: 10, kategori_id: 2, kategori: 'Modal', nama: 'TANAH', jenis_kategori: 'TANAH', kode_rekening: null, kelompok_kib: 'TANAH', urutan: 1 },
    { id: 11, kategori_id: 2, kategori: 'Modal', nama: 'Belanja Modal Alat Kedokteran', jenis_kategori: 'Belanja Modal Alat Kedokteran', kode_rekening: '5.2.02.07', kelompok_kib: null, urutan: 2 },
    { id: 12, kategori_id: 1, kategori: 'Barang dan Jasa', nama: 'ATK', jenis_kategori: 'ATK', kode_rekening: '5.1.02.01', kelompok_kib: null, urutan: 1 },
  ],
}
ok('A8 pilihanDariBaris: id yang masih ada dipakai', JSON.stringify(pilihanDariBaris(master, { kategori_id: 1, jenis_kategori_id: 12 })) === '{"kategori_id":1,"jenis_kategori_id":12}')
ok('A9 pilihanDariBaris: data lama hanya teks → dicari lewat nama', JSON.stringify(pilihanDariBaris(master, { kategori_aset: 'tanah' })) === '{"kategori_id":2,"jenis_kategori_id":10}')
ok('A10 pilihanDariBaris: induk tak dikenal → kosong (teksnya tetap ditampilkan layar)', pilihanDariBaris(master, { kategori: 'Hibah', jenis_kategori: 'X' }).kategori_id === null)
ok('A11 kelompokKibPilihan: bukan Modal → null; jenis ber-KIB; tanpa KIB → dideteksi',
  kelompokKibPilihan(master, { kategori_id: 1, jenis_kategori_id: 12 }, '5.2.02') === null
  && kelompokKibPilihan(master, { kategori_id: 2, jenis_kategori_id: 10 }, null) === 'TANAH'
  && kelompokKibPilihan(master, { kategori_id: 2, jenis_kategori_id: 11 }, '5.2.02.07') === 'ALKES & ALDOK')
{
  const g = gabungRekeningBlud([{ kode: '5.2.2', uraian: 'B' }, { kode: '5.1', uraian: 'A' }], [{ kode: ' 5.2.2 ', uraian: 'B2' }, { kode: '5.10', uraian: 'C' }])
  ok('A12 gabung rekening BLUD: kembar kode dibuang (Master Akun menang), urut numerik', g.map(x => x.kode).join() === '5.1,5.2.2,5.10' && g[1].sumber === 'MASTER_AKUN')
}

ok('A13 saringan Modal untuk unduhan = adalahModal (item lama tanpa kategori ikut, 5.1 tidak)',
  cocokSaringKategori({ kategori: null, kode_rekening: null }, { kategori: 'Modal' }) && !cocokSaringKategori({ kategori: null, kode_rekening: '5.1.02' }, { kategori: 'modal' })
  && !cocokSaringKategori({ kategori: 'Barang dan Jasa' }, { kategori: 'Modal' }) && cocokSaringKategori({ kategori: 'Barang dan Jasa' }, { kategori: 'barang dan jasa' }))
ok('A14 saringan jenis: nama jenis, data lama lewat kategori_aset', cocokSaringKategori({ jenis_kategori: 'ATK' }, { jenis_kategori: 'atk' }) && cocokSaringKategori({ kategori_aset: 'TANAH' }, { jenis_kategori: 'Tanah' }) && !cocokSaringKategori({ jenis_kategori: 'X' }, { jenis_kategori: 'ATK' }))
ok('A15 golongan awal Tempatkan dari kelompok KIB', golonganDariKelompokKib('TANAH') === 'A' && golonganDariKelompokKib('ALKES & ALDOK') === 'B' && golonganDariKelompokKib('GEDUNG DAN BANGUNAN') === 'C'
  && golonganDariKelompokKib('JALAN, IRIGASI, DAN JARINGAN') === 'D' && golonganDariKelompokKib('ASET TETAP LAINNYA') === 'E' && golonganDariKelompokKib('KONSTRUKSI DALAM PENGERJAAN (KDP)') === 'F' && golonganDariKelompokKib(null) === null)

console.log('\nB. Bentuk kode (urutan kunci, satu aturan Modal)')
{
  const d = tanpaKomentar(sumber('lib/data/buku-besar-aset.ts'))
  const pn = tanpaKomentar(sumber('lib/data/bba-penerimaan.ts'))
  const u = badan(d, 'export async function updateAset(')
  ok('B1 updateAset: kategori dikunci (FOR SHARE) SEBELUM baris item', u.indexOf('selesaikanKategori(tx') > 0 && u.indexOf('selesaikanKategori(tx') < u.indexOf('FOR UPDATE'))
  const dj = badan(d, 'export async function deleteJenisKategori(')
  ok('B2 hapus jenis: kunci master → lepas tautan → DELETE', dj.indexOf('FOR UPDATE') < dj.indexOf('lepasTautanKategori') && dj.indexOf('lepasTautanKategori') < dj.indexOf('DELETE FROM bba_kategori_aset'))
  ok('B3 hapus induk melepas kategori_id pemakai', badan(d, 'export async function deleteKategoriInduk(').includes("lepasTautanKategori(tx, 'kategori_id'"))
  ok('B4 belum_dicatat 0 untuk bukan Modal (kecuali REHAB)', /WHEN b\.jenis_rencana = 'REHAB'[\s\S]*WHEN NOT \$\{SYARAT_MODAL\} THEN 0/.test(d))
  const an = badan(pn, 'export async function antreanBukuAset(')
  ok('B5 antrean: syarat Modal di unit terima, TIDAK di rehab', (an.match(/SYARAT_MODAL/g) ?? []).length === 1 && an.indexOf('SYARAT_MODAL') < an.indexOf("b.jenis_rencana = 'REHAB'"))
  ok('B6 tidak ada salinan kedua aturan Modal (regex 5.1 hanya di lib/bba/kategori.ts)',
    !/5\\\\?\.0\?1/.test(pn) && !/5\\\\?\.0\?1/.test(d))
  const sp = badan(tanpaKomentar(sumber('lib/data/bba-penawaran.ts')), 'export async function simpanPenawaranDi(')
  ok('B7 simpan surat: kategori hanya ditulis kalau dikirim (L87)', /if \(kat\.terisi\)\s*\{\s*setKat = sql`kategori_id/.test(sp))
  ok('B8 tinjauan Drive tidak mengirim teks kategori surat', !/kategori: sr\?\.kategori/.test(sumber('lib/data/bba-drive-balik.ts')))
  ok('B9 kedua unduhan rencana menyaring lewat cocokSaringKategori (satu aturan)', badan(d, 'export async function rencanaUntukExcel(').includes('cocokSaringKategori(r, filter)')
    && tanpaKomentar(sumber('lib/data/bba-laporan.ts')).includes('cocokSaringKategori(r, filter)'))
  {
    const at = tanpaKomentar(sumber('app/(dashboard)/buku-besar-aset/_components/AksiTerima.tsx'))
    ok('B10 Tempatkan: golongan awal = saran dari kelompok KIB, B hanya bila tak ada saran', /const golonganSaran = golonganDariKelompokKib\(p\.kelompok_kib\)/.test(at) && /useState\(\{ golongan: \(golonganSaran \?\? 'B'\) as Golongan/.test(at))
  }
}

console.log('\nC. MySQL sungguhan (kotak pasir 2063)')
let c: mysql.Connection | null = null
try {
  c = await mysql.createConnection({ host: process.env.MYSQL_HOST, port: Number(process.env.MYSQL_PORT || 3306), user: process.env.MYSQL_USER, password: process.env.MYSQL_PASSWORD, database: process.env.MYSQL_DATABASE })
} catch (e) { ok(`C0 MySQL bisa dihubungi (${(e as { code?: string }).code ?? e})`, false) }
if (c) {
  const k = c
  const bersih = async () => {
    await k.query("DELETE a FROM bba_aset a JOIN bba_penerimaan p ON p.id = a.penerimaan_id JOIN buku_besar_aset b ON b.id = p.rencana_id WHERE b.tahun_anggaran = 2063 AND b.uraian LIKE 'UJIKAT%'")
    await k.query("DELETE p FROM bba_penerimaan p JOIN buku_besar_aset b ON b.id = p.rencana_id WHERE b.tahun_anggaran = 2063 AND b.uraian LIKE 'UJIKAT%'")
    await k.query("DELETE FROM buku_besar_aset WHERE tahun_anggaran = 2063 AND uraian LIKE 'UJIKAT%'")
    await k.query("DELETE i FROM bba_penawaran_item i JOIN bba_penawaran w ON w.id = i.penawaran_id WHERE w.rekanan LIKE 'UJIKAT%'")
    await k.query("DELETE FROM bba_penawaran WHERE rekanan LIKE 'UJIKAT%'")
    await k.query("DELETE FROM bba_barang WHERE nama LIKE 'UJIKAT %'")
    await k.query("DELETE FROM bba_kategori_aset WHERE nama LIKE 'UJIKAT%'")
    await k.query("DELETE FROM bba_kategori_induk WHERE nama LIKE 'UJIKAT%'")
    await k.query("DELETE FROM bba_kelompok_kib WHERE nama LIKE 'UJIKAT%'")
  }
  await bersih()
  const B = await import('../lib/data/buku-besar-aset')
  const P = await import('../lib/data/bba-penerimaan')
  const W = await import('../lib/data/bba-penawaran')
  const D = await import('../lib/data/db')
  const [u] = await k.query("SELECT id FROM users WHERE status = 'AKTIF' ORDER BY id LIMIT 1") as [Array<{ id: number }>, unknown]
  const userId = Number(u[0]?.id ?? 0)
  const versi = async (id: number) => (await B.getAsetById(id))!.version
  const ref1 = [{ sumber: 'LAINNYA' as const, nama_penyedia: 'PT UJIKAT', harga: 1_000_000 }]
  try {
    const m = await B.listKategoriLengkap()
    const modal = m.induk.find(i => i.nama === 'Modal')!, bj = m.induk.find(i => i.nama === 'Barang dan Jasa')!
    ok('C1 migrasi: tiga induk bawaan + enam kelompok KIB bawaan', !!modal && !!bj && m.induk.some(i => i.nama === 'Pegawai')
      && ['TANAH', 'PERALATAN DAN MESIN', 'GEDUNG DAN BANGUNAN', 'JALAN, IRIGASI, DAN JARINGAN', 'KONSTRUKSI DALAM PENGERJAAN (KDP)', 'ALKES & ALDOK'].every(n => m.kelompok_kib.some(x => x.nama === n && x.bawaan)))

    const jAlkes = await B.createJenisKategori({ kategori_id: modal.id, jenis_kategori: 'UJIKAT Belanja Modal Alat Kedokteran', kode_rekening: '5.2.02.07.01.0001' })
    const jAtk = await B.createJenisKategori({ kategori_id: bj.id, jenis_kategori: 'UJIKAT Belanja ATK', kode_rekening: '5.1.02.01.01.0024', kelompok_kib: 'TANAH' })
    ok('C2 jenis Modal: kelompok KIB terdeteksi dari uraian; jenis Barang & Jasa: KIB dibuang', jAlkes.kelompok_kib === 'ALKES & ALDOK' && jAtk.kelompok_kib === null)
    const kembar = await coba(() => B.createJenisKategori({ kategori_id: bj.id, jenis_kategori: 'ujikat belanja atk', kode_rekening: '5.1.02.01.01.0024' }))
    ok('C3 jenis kembar (nama & kode sama di induk yang sama) ditolak', kembar instanceof B.BbaKategoriKembarError)
    const kibAsing = await coba(() => B.createJenisKategori({ kategori_id: modal.id, jenis_kategori: 'UJIKAT X', kelompok_kib: 'UJIKAT TIDAK ADA' }))
    ok('C4 kelompok KIB di luar Master ditolak (L68)', kibAsing instanceof B.BbaKategoriTidakDikenalError)

    const brg = await B.createBarang({ nama: 'UJIKAT Kursi', jenis_kategori_id: jAtk.id }, userId)
    const [bg] = await k.query('SELECT kategori, jenis_kategori, kode_rekening FROM bba_barang WHERE id = ?', [brg.id]) as [Array<Record<string, string>>, unknown]
    ok('C5 barang: jenis dipilih → kategori, nama jenis, kode rekening terisi dari Master', bg[0].kategori === 'Barang dan Jasa' && bg[0].jenis_kategori === 'UJIKAT Belanja ATK' && bg[0].kode_rekening === '5.1.02.01.01.0024')

    const atk = await B.createAset({ tahun_anggaran: 2063, uraian: 'UJIKAT atk', barang_id: brg.id, jenis_rencana: 'PENAMBAHAN', sumber_anggaran: 'BLUD', vol: 2, harga: 1_000_000, referensi: ref1, jenis_kategori_id: jAtk.id }, userId)
    const alkes = await B.createAset({ tahun_anggaran: 2063, uraian: 'UJIKAT alkes', barang_id: brg.id, jenis_rencana: 'PENAMBAHAN', sumber_anggaran: 'BLUD', vol: 1, harga: 1_000_000, referensi: ref1, jenis_kategori_id: jAlkes.id }, userId)
    const ra = (await B.getAsetById(atk.id))!, rb = (await B.getAsetById(alkes.id))!
    ok('C6 item: kode rekening otomatis dari jenis, kelompok KIB hanya untuk Modal',
      ra.kategori === 'Barang dan Jasa' && ra.kode_rekening === '5.1.02.01.01.0024' && ra.kelompok_kib === null
      && rb.kategori === 'Modal' && rb.kode_rekening === '5.2.02.07.01.0001' && rb.kelompok_kib === 'ALKES & ALDOK')

    const kibPaksa = await B.createAset({ tahun_anggaran: 2063, uraian: 'UJIKAT kib paksa', sumber_anggaran: 'BLUD', vol: 1, harga: 1, jenis_kategori_id: jAtk.id, kelompok_kib: 'TANAH' }, userId)
    ok('C6b kelompok KIB yang dikirim untuk item bukan Modal dibuang server', (await B.getAsetById(kibPaksa.id))!.kelompok_kib === null)

    // Cermin SQL `SYARAT_MODAL` = `adalahModal` untuk tiap bentuk data (lama & baru).
    const bentuk: Array<[string | null, string | null, string | null]> = [
      ['Modal', null, '5.1.02'], ['Barang dan Jasa', 'TANAH', '5.2.01'], [null, 'tanah', null], [null, 'ALKES', '5.1.02'], [null, 'ATK', null],
      [null, null, '5.1.02.01'], [null, null, '5.01.2'], [null, null, '5.10.1'], [null, null, '5.2.02'], [null, null, null], [' ', '', ''], ['pegawai', null, '5.2'],
    ]
    const id: number[] = []
    for (const [i, [kat, lama, kode]] of bentuk.entries()) {
      const [r] = await k.query("INSERT INTO buku_besar_aset (canonical_id, tahun_anggaran, uraian, kategori, kategori_aset, kode_rekening, status, anggaran) VALUES (?, 2063, ?, ?, ?, ?, 'DIRENCANAKAN', 'BELUM')",
        [`UJIKAT-${i}`, `UJIKAT bentuk ${i}`, kat, lama, kode]) as [{ insertId: number }, unknown]
      id.push(r.insertId)
    }
    const hasil = await D.queryMany<{ id: number; m: number }>(D.sql`SELECT b.id, ${B.SYARAT_MODAL} AS m FROM buku_besar_aset b WHERE b.id IN (${id})`)
    const beda = bentuk.filter(([kat, lama, kode], i) => (Number(hasil.find(h => Number(h.id) === id[i])?.m) === 1) !== adalahModal({ kategori: kat, kategori_aset: lama, kode_rekening: kode }))
    ok(`C7 SYARAT_MODAL (SQL) = adalahModal (JS) pada ${bentuk.length} bentuk data`, beda.length === 0, JSON.stringify(beda))
    const sm = await B.listAset({ tahun: 2063, kategori: 'Modal', page: 1, limit: 100 })
    ok('C8 saringan Kategori=Modal memakai aturan yang sama', sm.rows.filter(r => r.uraian.startsWith('UJIKAT bentuk')).length === bentuk.filter(([a, b2, kd]) => adalahModal({ kategori: a, kategori_aset: b2, kode_rekening: kd })).length)
    const ex = await B.rencanaUntukExcel(2063, { kategori: 'Modal' })
    ok('C8b Excel daftar rencana Kategori=Modal = daftar layar (item lama tanpa kategori ikut)', ex.rows.filter(r => r.uraian.startsWith('UJIKAT bentuk')).length === sm.rows.filter(r => r.uraian.startsWith('UJIKAT bentuk')).length)
    await k.query('DELETE FROM buku_besar_aset WHERE id IN (?)', [id])

    await B.tandaiAnggaran({ item: [{ id: atk.id, expected_version: await versi(atk.id), anggaran: 'DIDANAI' }, { id: alkes.id, expected_version: await versi(alkes.id), anggaran: 'DIDANAI' }] }, userId)
    await P.catatPenerimaan({ rencana_id: atk.id, expected_version: await versi(atk.id), tgl: '2026-02-01', vol: 2, harga_satuan: 1_000_000 }, userId)
    await P.catatPenerimaan({ rencana_id: alkes.id, expected_version: await versi(alkes.id), tgl: '2026-02-01', vol: 1, harga_satuan: 1_000_000 }, userId)
    const setahun = await B.rencanaSetahun(2063)
    const xa = setahun.find(r => r.id === atk.id)!, xb = setahun.find(r => r.id === alkes.id)!
    ok('C9 Barang & Jasa diterima penuh → langsung Tercatat (tidak menunggu register)', xa.belum_dicatat === 0 && tahapRencana(xa) === 'TERCATAT', String(xa.belum_dicatat))
    ok('C10 Modal diterima → menunggu register', xb.belum_dicatat === 1 && tahapRencana(xb) === 'DITERIMA_PENUH')
    const antre = await P.antreanBukuAset()
    ok('C11 antrean Buku Aset: hanya yang Modal', antre.terima.some(t => t.rencana_id === alkes.id) && !antre.terima.some(t => t.rencana_id === atk.id))
    const [pa] = await k.query('SELECT id FROM bba_penerimaan WHERE rencana_id = ?', [atk.id]) as [Array<{ id: number }>, unknown]
    const tolakTempat = await coba(() => P.tempatkan({ penerimaan_id: pa[0].id, jumlah: 1, golongan: 'B', nama_resmi: 'UJIKAT', kondisi: 'B' }, userId))
    ok('C12 menempatkan penerimaan bukan Modal ditolak server', tolakTempat instanceof P.PenerimaanDitolakError)

    const pindah = await coba(async () => B.updateAset({ id: atk.id, expected_version: await versi(atk.id), jenis_kategori_id: jAlkes.id }, userId))
    ok('C13 sesudah diterima: pindah ke Modal ditolak (antrean ditentukan kategorinya)', pindah instanceof B.BbaKategoriBekuError && (await B.getAsetById(atk.id))!.kategori === 'Barang dan Jasa')
    const jAtk2 = await B.createJenisKategori({ kategori_id: bj.id, jenis_kategori: 'UJIKAT Belanja Kertas', kode_rekening: '5.1.02.01.01.0025' })
    await B.updateAset({ id: atk.id, expected_version: await versi(atk.id), jenis_kategori_id: jAtk2.id }, userId)
    ok('C14 jenis lain di kategori yang sama tetap boleh', (await B.getAsetById(atk.id))!.jenis_kategori === 'UJIKAT Belanja Kertas')
    await B.updateAset({ id: atk.id, expected_version: await versi(atk.id), uraian: 'UJIKAT atk diubah' }, userId)
    ok('C15 Simpan tanpa kategori tidak mengosongkan kategori (L87)', (await B.getAsetById(atk.id))!.jenis_kategori_id === jAtk2.id)

    const vSebelum = await versi(atk.id)
    await B.updateJenisKategori({ id: jAtk2.id, jenis_kategori: 'UJIKAT Belanja Kertas HVS' })
    const sesudahNama = (await B.getAsetById(atk.id))!
    ok('C16 ganti nama jenis menjalar ke pemakai, angka kunci item tidak naik (tab terbuka tidak kena 409)', sesudahNama.jenis_kategori === 'UJIKAT Belanja Kertas HVS' && sesudahNama.version === vSebelum)
    const kib = await B.createKelompokKib('UJIKAT KIB LAIN')
    await B.updateJenisKategori({ id: jAlkes.id, kelompok_kib: kib.nama })
    const [rk] = await k.query('SELECT id FROM bba_kelompok_kib WHERE nama = ?', [kib.nama]) as [Array<{ id: number }>, unknown]
    const tolakKib = await coba(() => B.deleteKelompokKib(rk[0].id))
    ok('C17 kelompok KIB yang masih dipakai jenis tidak bisa dihapus', tolakKib instanceof B.BbaKategoriDipakaiError)
    await B.updateJenisKategori({ id: jAlkes.id, kelompok_kib: 'ALKES & ALDOK' })
    await k.query('UPDATE buku_besar_aset SET kelompok_kib = ? WHERE id = ?', [kib.nama, alkes.id])
    const tolakKib2 = await coba(() => B.deleteKelompokKib(rk[0].id))
    ok('C18 … juga yang masih dipakai rencana (teks), pesannya menyebut jumlahnya', tolakKib2 instanceof B.BbaKategoriDipakaiError && /1 rencana/.test((tolakKib2 as Error).message))
    await k.query("UPDATE buku_besar_aset SET kelompok_kib = 'ALKES & ALDOK' WHERE id = ?", [alkes.id])
    ok('C19 kelompok KIB bebas pemakai bisa dihapus', await B.deleteKelompokKib(rk[0].id))

    const ind = await B.createKategoriInduk('UJIKAT Hibah')
    const jHibah = await B.createJenisKategori({ kategori_id: ind.id, jenis_kategori: 'UJIKAT Hibah Barang' })
    const tolakInduk = await coba(() => B.deleteKategoriInduk(ind.id))
    ok('C20 induk yang masih punya jenis tidak bisa dihapus', tolakInduk instanceof B.BbaKategoriDipakaiError)
    const ih = await B.createAset({ tahun_anggaran: 2063, uraian: 'UJIKAT hibah', sumber_anggaran: 'LAINNYA', vol: 1, harga: 1, jenis_kategori_id: jHibah.id }, userId)
    await B.deleteJenisKategori(jHibah.id)
    const sesudahHapus = (await B.getAsetById(ih.id))!
    ok('C21 hapus jenis: item tetap menyimpan nama jenisnya, tautan id dilepas', sesudahHapus.jenis_kategori === 'UJIKAT Hibah Barang' && sesudahHapus.jenis_kategori_id === null)
    await B.deleteKategoriInduk(ind.id)
    const sesudahInduk = (await B.getAsetById(ih.id))!
    ok('C22 hapus induk kustom: kategori_id pemakai dilepas, teksnya tetap', sesudahInduk.kategori_id === null && sesudahInduk.kategori === 'UJIKAT Hibah')
    await B.updateAset({ id: ih.id, expected_version: sesudahInduk.version, uraian: 'UJIKAT hibah 2' }, userId)
    ok('C23 item yang kategorinya sudah dihapus tetap bisa disimpan', (await B.getAsetById(ih.id))!.uraian === 'UJIKAT hibah 2')

    const sr = await W.simpanPenawaran({ kepala: { rekanan: 'UJIKAT PT', tgl_surat: '2026-01-02', jenis_kategori_id: jAtk.id }, item: [{ nama_barang: 'Kertas', harga_satuan: 50_000 }] }, userId)
    const s1 = (await W.listPenawaran('UJIKAT PT'))[0]
    await W.simpanPenawaran({ id: sr.id, expected_version: s1.version, kepala: { rekanan: 'UJIKAT PT', tgl_surat: '2026-01-02', catatan: 'ubah' }, item: [{ id: s1.item[0].id, nama_barang: 'Kertas', harga_satuan: 51_000 }] }, userId)
    const s2 = (await W.listPenawaran('UJIKAT PT'))[0]
    ok('C24 surat: diubah tanpa kategori → kategori & kode rekening tetap (L87)', s2.jenis_kategori_id === jAtk.id && s2.kode_rekening === '5.1.02.01.01.0024' && s2.catatan === 'ubah')
  } finally {
    await bersih()
    const [sisa] = await k.query(`SELECT (SELECT COUNT(*) FROM buku_besar_aset WHERE tahun_anggaran = 2063) AS r,
      (SELECT COUNT(*) FROM bba_kategori_aset WHERE nama LIKE 'UJIKAT%') AS j, (SELECT COUNT(*) FROM bba_kategori_induk WHERE nama LIKE 'UJIKAT%') AS i,
      (SELECT COUNT(*) FROM bba_kelompok_kib WHERE nama LIKE 'UJIKAT%') AS kb, (SELECT COUNT(*) FROM bba_penawaran WHERE rekanan LIKE 'UJIKAT%') AS w`) as [Array<Record<string, number>>, unknown]
    ok('C25 kotak pasir bersih', Object.values(sisa[0]).every(v => Number(v) === 0), JSON.stringify(sisa[0]))
    await k.end()
  }
}

console.log(`\n${lulus} lulus, ${gagal.length} gagal`)
if (gagal.length) { console.log(gagal.map(g => `  - ${g}`).join('\n')); process.exit(1) }
process.exit(0)
