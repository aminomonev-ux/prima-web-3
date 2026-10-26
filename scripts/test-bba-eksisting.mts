// scripts/test-bba-eksisting.mts — Buku Besar Aset Tahap 3: kondisi eksisting per barang × lokasi
// (docs/CONCEPT-bba-perencanaan.md §6).
//
//   npx tsx scripts/test-bba-eksisting.mts
//
// A aturan murni `lib/bba/eksisting.ts`. B skema Zod. C sambungan sumber.
// D MySQL sungguhan (barang/lokasi berawalan UJIBBA3, item tahun kotak pasir 2086–2088), lalu dibersihkan.

import { readFileSync } from 'node:fs'
import mysql from 'mysql2/promise'
import {
  fmtTanggal, eksistingBerlaku, jumlahKondisi, alasanDataUlang, kalimatDataUlang, ringkasEksistingPerBarang,
  riwayatPerLokasi, isianTerisi, type BarisEksisting,
} from '../lib/bba/eksisting'

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
const tanpaKomentar = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/ .*$/gm, '')
const coba = async <T,>(f: () => Promise<T>): Promise<T | Error> => { try { return await f() } catch (e) { return e as Error } }
const badan = (s: string, awal: string, akhir: string) => s.slice(s.indexOf(awal), s.indexOf(akhir, s.indexOf(awal) + awal.length))

let idUji = 0
const e = (p: Partial<BarisEksisting>): BarisEksisting => ({
  id: ++idUji, barang_id: 1, lokasi_id: 1, lokasi_nama: 'Ruang A', baik: 0, rusak_ringan: 0, rusak_berat: 0,
  tgl_cek: '2026-01-03', catatan: null, file_id: null, created_at: '2026-01-03 09:00:00', digabung_dari: null, digabung_pada: null, ...p,
})

console.log('A. Aturan murni lib/bba/eksisting.ts')
ok('A1 tanggal Indonesia ringkas', fmtTanggal('2026-04-12') === '12 Apr 2026' && fmtTanggal('2026-05-01') === '1 Mei 2026' && fmtTanggal(null) === '')
const h1 = [
  e({ lokasi_id: 1, lokasi_nama: 'Ruang B', tgl_cek: '2026-01-03', baik: 5, rusak_berat: 1 }),
  e({ lokasi_id: 1, lokasi_nama: 'Ruang B', tgl_cek: '2026-03-01', baik: 4, rusak_berat: 4 }),
  e({ lokasi_id: 2, lokasi_nama: 'Ruang A', tgl_cek: '2026-02-01', baik: 2, rusak_ringan: 1 }),
  e({ barang_id: 2, lokasi_id: 2, lokasi_nama: 'Ruang A', tgl_cek: '2026-02-01', baik: 9 }),
]
const berlaku = eksistingBerlaku(h1)
ok('A2 yang berlaku = pendataan TERBARU per barang × lokasi (urut nama lokasi)', berlaku.length === 3 && berlaku.filter(b => b.barang_id === 1).map(b => `${b.lokasi_nama}:${b.tgl_cek}`).join() === 'Ruang A:2026-02-01,Ruang B:2026-03-01')
ok('A3 tanggal sama → id terakhir menang', eksistingBerlaku([e({ tgl_cek: '2026-01-01', baik: 1 }), e({ tgl_cek: '2026-01-01', baik: 7 })])[0].baik === 7)
const k1 = jumlahKondisi(berlaku.filter(b => b.barang_id === 1))
ok('A4 kondisi = Σ yang berlaku saja (riwayat lama tidak ikut)', k1.baik === 6 && k1.rusak_ringan === 1 && k1.rusak_berat === 4 && k1.total === 11, JSON.stringify(k1))

const satu = h1.filter(b => b.barang_id === 1)
ok('A5 tanpa pendataan → tidak ada "perlu didata ulang" (itu "Belum didata")', alasanDataUlang([], [{ barang_id: 1, vol_realisasi: 3, tgl_realisasi: '2026-05-01' }]).length === 0)
const beli = alasanDataUlang(satu, [
  { barang_id: 1, vol_realisasi: 2, tgl_realisasi: '2026-02-01' },
  { barang_id: 1, vol_realisasi: 3, tgl_realisasi: '2026-04-12' },
  { barang_id: 1, vol_realisasi: 9, tgl_realisasi: '2026-01-15' },
  { barang_id: 1, vol_realisasi: 4, tgl_realisasi: null },
])
const b0 = beli[0]
ok('A6 BELI: unit dibeli SESUDAH pendataan terlama yang berlaku (hari yang sama & tanpa tanggal tidak ikut)', beli.length === 1 && b0.jenis === 'BELI'
  && b0.unit === 3 && b0.tgl_awal === '2026-04-12' && b0.lokasi === 'Ruang A' && b0.tgl_cek === '2026-02-01', JSON.stringify(beli))
ok('A7 kalimat BELI menyebut unit, tanggal, lokasi & tanggal pendataan', kalimatDataUlang(b0, 'unit') === '3 unit dibeli 12 Apr 2026, sesudah pendataan Ruang A (1 Feb 2026). Data ulang supaya angka eksisting memuatnya.')
ok('A8 kalimat BELI rentang tanggal', kalimatDataUlang({ jenis: 'BELI', unit: 5, tgl_awal: '2026-03-01', tgl_akhir: '2026-04-12', lokasi: 'R', tgl_cek: '2026-01-03' }).includes('dibeli 1 Mar 2026 – 12 Apr 2026'))

const gab = [
  e({ lokasi_id: 3, lokasi_nama: 'Ruang IT', tgl_cek: '2026-01-10', baik: 3, created_at: '2026-01-10 08:00:00' }),
  e({ lokasi_id: 3, lokasi_nama: 'Ruang IT', tgl_cek: '2026-02-10', baik: 2, created_at: '2026-02-10 08:00:00', digabung_dari: 'Laptop Kantor', digabung_pada: '2026-06-01 10:00:00' }),
]
const g1 = alasanDataUlang(gab, [])
ok('A9 GABUNG: lokasi berpendataan dari dua barang & belum didata sesudah gabung → ditandai', g1.length === 1 && g1[0].jenis === 'GABUNG' && g1[0].lokasi === 'Ruang IT'
  && JSON.stringify((g1[0] as { dari: string[] }).dari) === '["Laptop Kantor"]', JSON.stringify(g1))
ok('A10 GABUNG: pendataan baru sesudah gabung → tanda hilang', alasanDataUlang([...gab, e({ lokasi_id: 3, lokasi_nama: 'Ruang IT', tgl_cek: '2026-06-02', created_at: '2026-06-02 09:00:00' })], []).length === 0)
ok('A11 GABUNG: lokasi yang hanya didata barang asal (satu asal) → tidak ditandai', alasanDataUlang([gab[1]], []).length === 0)
ok('A12 GABUNG: pendataan berlaku yang dicatat SEBELUM gabung tetap ditandai walau bertanggal paling baru',
  alasanDataUlang([...gab, e({ lokasi_id: 3, lokasi_nama: 'Ruang IT', tgl_cek: '2026-05-30', created_at: '2026-05-30 09:00:00' })], []).length === 1)
ok('A13 kalimat GABUNG', kalimatDataUlang(g1[0]) === 'Ruang IT punya pendataan dari barang yang digabung (Laptop Kantor) — angkanya tidak dijumlah. Data ulang Ruang IT.')
const peta = ringkasEksistingPerBarang(h1, [{ barang_id: 2, vol_realisasi: 1, tgl_realisasi: '2026-03-01' }])
ok('A14 per barang: hanya barang berpendataan; pembelian dibagi per barang', peta.size === 2 && peta.get(2)?.kondisi.baik === 9
  && peta.get(2)?.perlu_ulang.length === 1 && peta.get(1)?.perlu_ulang.length === 0 && !peta.has(3))
const rw = riwayatPerLokasi(satu)
ok('A15 riwayat per lokasi: lokasi urut nama, terbaru di atas', rw.map(r => r.lokasi).join() === 'Ruang A,Ruang B' && rw[1].baris.map(b => b.tgl_cek).join() === '2026-03-01,2026-01-03')
ok('A16 baris form kosong semua = tidak didata; nol yang diketik = didata', !isianTerisi({ baik: null, rusak_ringan: null, rusak_berat: null }) && isianTerisi({ baik: 0, rusak_ringan: null, rusak_berat: null }))

console.log('\nB. Skema Zod')
const S = await import('../lib/data/buku-besar-aset-schemas')
const dasar = { lokasi_id: 1, tgl_cek: '2026-01-03', baris: [{ barang_id: 1, baik: 2, rusak_ringan: 0, rusak_berat: 1 }] }
ok('B1 simpan pendataan sah diterima', S.EksistingSimpanSchema.safeParse(dasar).success)
ok('B2 unit negatif / pecahan ditolak', !S.EksistingSimpanSchema.safeParse({ ...dasar, baris: [{ ...dasar.baris[0], baik: -1 }] }).success
  && !S.EksistingSimpanSchema.safeParse({ ...dasar, baris: [{ ...dasar.baris[0], rusak_berat: 1.5 }] }).success)
ok('B3 barang yang sama dua kali ditolak; baris kosong ditolak; > 300 ditolak', !S.EksistingSimpanSchema.safeParse({ ...dasar, baris: [dasar.baris[0], dasar.baris[0]] }).success
  && !S.EksistingSimpanSchema.safeParse({ ...dasar, baris: [] }).success
  && !S.EksistingSimpanSchema.safeParse({ ...dasar, baris: Array.from({ length: 301 }, (_, i) => ({ ...dasar.baris[0], barang_id: i + 1 })) }).success)
ok('B4 tanggal berformat YYYY-MM-DD; id foto berbentuk id Drive', !S.EksistingSimpanSchema.safeParse({ ...dasar, tgl_cek: '3/1/2026' }).success
  && !S.EksistingSimpanSchema.safeParse({ ...dasar, baris: [{ ...dasar.baris[0], file_id: '../x' }] }).success)
ok('B5 nama lokasi kosong ditolak', !S.LokasiCreateSchema.safeParse({ nama: '   ' }).success && S.LokasiCreateSchema.safeParse({ nama: 'Ruang IGD' }).success)

console.log('\nC. Sambungan sumber')
const skema = sumber('docs/schema-mysql.sql')
const iB = skema.indexOf('CREATE TABLE IF NOT EXISTS bba_barang ('), iL = skema.indexOf('CREATE TABLE IF NOT EXISTS bba_lokasi ('), iE = skema.indexOf('CREATE TABLE IF NOT EXISTS bba_eksisting (')
ok('C1 skema acuan: bba_eksisting sesudah tabel yang dirujuknya, UNIQUE barang × lokasi × tanggal', iB >= 0 && iL > 0 && iE > iL && iE > iB && skema.includes('UNIQUE KEY uq_be_cek (barang_id, lokasi_id, tgl_cek)'))
const mig = sumber('docs/migrations/migration-bba-eksisting.sql')
ok('C2 migrasi: dua tabel baru, FK RESTRICT ke barang & lokasi', mig.includes('CREATE TABLE IF NOT EXISTS bba_lokasi (') && mig.includes('CREATE TABLE IF NOT EXISTS bba_eksisting (')
  && (mig.match(/ON DELETE RESTRICT/g) ?? []).length === 2)
const data = tanpaKomentar(sumber('lib/data/buku-besar-aset.ts'))
const bSimpan = badan(data, 'export async function simpanPendataan(', 'export async function hapusPendataan(')
const iTgl = bSimpan.indexOf('if (input.tgl_cek > hariIni) throw new BbaTanggalCekError(hariIni);')
const iLok = bSimpan.indexOf('SELECT nama FROM bba_lokasi WHERE id = ${input.lokasi_id} FOR UPDATE')
const iDel = bSimpan.indexOf('DELETE FROM bba_eksisting')
ok('C3 simpan: tanggal diperiksa, lokasi dikunci DULU, barang & berkas diperiksa SEBELUM DELETE', iTgl >= 0 && iTgl < bSimpan.indexOf('withTransaction') && iLok > 0 && iLok < iDel
  && bSimpan.indexOf('await pastikanBarang(tx, barangIds);') < iDel && bSimpan.indexOf('await pastikanBerkasBba(tx,') < iDel)
ok('C4 simpan: yang ditimpa HANYA barang yang dikirim, lokasi & tanggal itu', bSimpan.includes('WHERE lokasi_id = ${input.lokasi_id} AND tgl_cek = ${input.tgl_cek} AND barang_id IN (${barangIds})'))
const bGabung = badan(data, 'export async function gabungBarang(', 'export async function tautkanBarang(')
ok('C5 gabung: bentrok lokasi+tanggal diperiksa SEBELUM memindah; pendataan pindah sebelum barang asal dihapus', bGabung.indexOf('throw new BbaGabungBentrokError(') < bGabung.indexOf('UPDATE buku_besar_aset SET barang_id')
  && bGabung.indexOf('UPDATE bba_eksisting SET barang_id') < bGabung.indexOf('DELETE FROM bba_barang') && bGabung.includes('digabung_dari = COALESCE(digabung_dari,'))
ok('C6 hapus barang menghitung pendataan juga', badan(data, 'export async function hapusBarang(', 'export async function gabungBarang(').includes('SELECT COUNT(*) FROM bba_eksisting WHERE barang_id = ${id}'))
const bPer = badan(data, 'export async function perBarangTahun(', 'export interface DetailBarang')
ok('C7 Per Barang: barang yang hanya punya pendataan ikut tampil', bPer.includes('barang.filter(b => perBarang.has(b.id) || eksPer.has(b.id))'))
const rLok = tanpaKomentar(sumber('app/api/buku-besar-aset/lokasi/route.ts')), rEks = tanpaKomentar(sumber('app/api/buku-besar-aset/eksisting/route.ts'))
const dijaga = (s: string) => (s.match(/const g = await guard\(\);\s*if \(!g\.ok\) return g\.res;/g) ?? []).length
ok('C8 route lokasi & eksisting: tiap handler lewat guard modul lebih dulu', dijaga(rLok) === 4 && dijaga(rEks) === 3)
const { RETENSI_PERISTIWA } = await import('../lib/security/retensi-audit')
ok('C9 audit lokasi & pendataan digolongkan perubahan data (5 tahun)', ['BBA_LOKASI_ADD', 'BBA_LOKASI_UPDATE', 'BBA_LOKASI_DELETE', 'BBA_EKSISTING_SAVE', 'BBA_EKSISTING_DELETE']
  .every(x => (RETENSI_PERISTIWA as Record<string, string>)[x] === 'PANJANG'))
const modal = tanpaKomentar(sumber('app/(dashboard)/buku-besar-aset/_components/ModalPendataan.tsx'))
ok('C10 form pendataan: hanya baris terisi yang dikirim; angka terakhir disalin hanya lewat tombol', modal.includes('const terisi = useMemo(() => (baris ?? []).filter(b => isianTerisi(b.isian)), [baris]);')
  && modal.includes('baris: terisi.map(b =>') && modal.includes(": kosong(),") && (modal.match(/isian: \{ baik: b\.terakhir\.baik/g) ?? []).length === 1)
ok('C11 form pendataan: jawaban terlambat (lokasi/tanggal diganti) dibuang', modal.includes('if (n !== nomor.current) return;'))

console.log('\nD. MySQL sungguhan')
const TAHUN = [2086, 2087, 2088]
let c: mysql.Connection | null = null
try {
  c = await mysql.createConnection({
    host: process.env.MYSQL_HOST, port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER, password: process.env.MYSQL_PASSWORD, database: process.env.MYSQL_DATABASE,
  })
} catch (er) {
  console.log(`DILEWATI bagian DB: MySQL tidak bisa dihubungi (${(er as { code?: string }).code ?? er})`)
}
if (c) {
  const k = c
  const bersih = async () => {
    await k.query("DELETE e FROM bba_eksisting e JOIN bba_barang g ON g.id = e.barang_id WHERE g.nama LIKE 'UJIBBA3%'")
    await k.query("DELETE e FROM bba_eksisting e JOIN bba_lokasi l ON l.id = e.lokasi_id WHERE l.nama LIKE 'UJIBBA3%'")
    await k.query('DELETE FROM buku_besar_aset WHERE tahun_anggaran IN (?)', [TAHUN])
    await k.query("DELETE FROM bba_barang WHERE nama LIKE 'UJIBBA3%'")
    await k.query("DELETE FROM bba_lokasi WHERE nama LIKE 'UJIBBA3%'")
    await k.query("DELETE FROM uploaded_files WHERE file_id LIKE 'UJIBBA3\\_%'")
  }
  await bersih()
  const D = await import('../lib/data/buku-besar-aset')
  const { tanggalHariIniWIB } = await import('../lib/shared/waktu-wib')
  const [u] = await k.query('SELECT id FROM users ORDER BY id LIMIT 1') as [Array<{ id: number }>, unknown]
  const userId = Number(u[0]?.id ?? 0)
  const jumlahE = async (barangId: number) => Number(((await k.query('SELECT COUNT(*) AS n FROM bba_eksisting WHERE barang_id = ?', [barangId])) as [Array<{ n: number }>, unknown])[0][0]?.n)
  const besok = new Date(Date.parse(tanggalHariIniWIB() + 'T00:00:00Z') + 86_400_000).toISOString().slice(0, 10) // tanggal-utc-ok: aritmetika tanggal polos
  try {
    await k.query("INSERT INTO uploaded_files (file_id, uploaded_by, context, sniff_ok) VALUES ('UJIBBA3_foto_000000001', ?, 'buku_besar_aset', 1), ('UJIBBA3_lain_000000002', ?, 'lkjip', 1)", [userId, userId])
    const rA = await D.createLokasi('  UJIBBA3   Ruang A ')
    const rB = await D.createLokasi('UJIBBA3 Ruang B')
    const kembar = await coba(() => D.createLokasi('ujibba3 ruang a'))
    ok('D1 lokasi dirapikan; kembar beda huruf ditolak', rA.nama === 'UJIBBA3 Ruang A' && kembar instanceof D.BbaLokasiKembarError)
    const laptop = await D.createBarang({ nama: 'UJIBBA3 Laptop', satuan: 'unit' }, userId)
    const kantor = await D.createBarang({ nama: 'UJIBBA3 Laptop Kantor' }, userId)
    const kursi = await D.createBarang({ nama: 'UJIBBA3 Kursi' }, userId)

    const s1 = await D.simpanPendataan({ lokasi_id: rA.id, tgl_cek: '2026-01-03', baris: [
      { barang_id: laptop.id, baik: 5, rusak_ringan: 1, rusak_berat: 0, file_id: 'UJIBBA3_foto_000000001' }, { barang_id: kursi.id, baik: 4, rusak_ringan: 0, rusak_berat: 2 },
    ] }, userId)
    await D.simpanPendataan({ lokasi_id: rB.id, tgl_cek: '2026-02-01', baris: [{ barang_id: laptop.id, baik: 2, rusak_ringan: 0, rusak_berat: 1 }] }, userId)
    ok('D2 simpan pendataan per lokasi (2 barang sekaligus)', s1.disimpan === 2 && s1.ditimpa === 0 && await jumlahE(laptop.id) === 2)

    const masaDepan = await coba(() => D.simpanPendataan({ lokasi_id: rA.id, tgl_cek: besok, baris: [{ barang_id: laptop.id, baik: 1, rusak_ringan: 0, rusak_berat: 0 }] }, userId))
    ok('D3 tanggal cek sesudah hari ini (WIB) ditolak', masaDepan instanceof D.BbaTanggalCekError && await jumlahE(laptop.id) === 2)

    const s2 = await D.simpanPendataan({ lokasi_id: rA.id, tgl_cek: '2026-01-03', baris: [{ barang_id: laptop.id, baik: 4, rusak_ringan: 1, rusak_berat: 1 }] }, userId)
    const [[ulang]] = await k.query("SELECT baik, rusak_berat, file_id FROM bba_eksisting WHERE barang_id = ? AND lokasi_id = ? AND tgl_cek = '2026-01-03'", [laptop.id, rA.id]) as [Array<{ baik: number; rusak_berat: number; file_id: string | null }>, unknown]
    const [[kursiTetap]] = await k.query('SELECT COUNT(*) AS n FROM bba_eksisting WHERE barang_id = ?', [kursi.id]) as [Array<{ n: number }>, unknown]
    ok('D4 tanggal yang SAMA menimpa (koreksi) — tidak menumpuk', s2.ditimpa === 1 && await jumlahE(laptop.id) === 2 && ulang.baik === 4 && ulang.rusak_berat === 1 && ulang.file_id === null)
    ok('D5 barang lain di lokasi itu (tidak dikirim) tidak tersentuh', Number(kursiTetap.n) === 1)

    const lokHantu = await coba(() => D.simpanPendataan({ lokasi_id: 999_999_999, tgl_cek: '2026-01-04', baris: [{ barang_id: laptop.id, baik: 1, rusak_ringan: 0, rusak_berat: 0 }] }, userId))
    const brgHantu = await coba(() => D.simpanPendataan({ lokasi_id: rA.id, tgl_cek: '2026-01-04', baris: [{ barang_id: laptop.id, baik: 1, rusak_ringan: 0, rusak_berat: 0 }, { barang_id: 999_999_999, baik: 1, rusak_ringan: 0, rusak_berat: 0 }] }, userId))
    const pinjam = await coba(() => D.simpanPendataan({ lokasi_id: rA.id, tgl_cek: '2026-01-04', baris: [{ barang_id: laptop.id, baik: 1, rusak_ringan: 0, rusak_berat: 0, file_id: 'UJIBBA3_lain_000000002' }] }, userId))
    ok('D6 lokasi/barang tak ada & foto modul lain ditolak — tanpa satu baris pun tertulis', lokHantu instanceof D.BbaLokasiTidakDikenalError && brgHantu instanceof D.BbaBarangTidakDikenalError
      && pinjam instanceof D.BbaBerkasTidakDikenalError && await jumlahE(laptop.id) === 2)

    await D.simpanPendataan({ lokasi_id: rA.id, tgl_cek: '2026-03-01', baris: [{ barang_id: laptop.id, baik: 3, rusak_ringan: 1, rusak_berat: 2 }] }, userId)
    const form = await D.formPendataan(rA.id, '2026-03-01')
    const fl = form?.baris.find(b => b.barang_id === laptop.id), fk = form?.baris.find(b => b.barang_id === kursi.id)
    ok('D7 form: barang yang pernah di lokasi itu; "terakhir" = sebelum tanggal form, "tanggal ini" = tepat tanggal form', form?.baris.length === 2
      && fl?.terakhir?.tgl_cek === '2026-01-03' && fl.terakhir.baik === 4 && fl.tanggal_ini?.rusak_berat === 2 && fk?.terakhir?.rusak_berat === 2 && fk.tanggal_ini === null, JSON.stringify(form?.baris))

    // Pembelian sesudah pendataan terlama yang berlaku (Ruang B 1 Feb 2026)
    const it = await D.createAset({ tahun_anggaran: 2088, uraian: 'UJIBBA3 Laptop beli', sumber_anggaran: 'BLUD', vol: 3, harga: 1, barang_id: laptop.id }, userId)
    await D.setRealisasi({ id: it.id, expected_version: 0, nilai_realisasi: 3, vol_realisasi: 3, tgl_realisasi: '2026-04-12', status: 'REALISASI_PENUH' }, userId)
    const it2 = await D.createAset({ tahun_anggaran: 2088, uraian: 'UJIBBA3 Laptop lama', sumber_anggaran: 'BLUD', vol: 2, harga: 1, barang_id: laptop.id }, userId)
    await D.setRealisasi({ id: it2.id, expected_version: 0, nilai_realisasi: 2, vol_realisasi: 2, tgl_realisasi: '2025-12-01', status: 'REALISASI_PENUH' }, userId)
    const det = await D.detailBarang(laptop.id, 2088)
    ok('D8 kartu barang: eksisting = Σ berlaku tiap lokasi (A: 3/1/2, B: 2/0/1)', det?.eksisting.kondisi.baik === 5 && det.eksisting.kondisi.rusak_ringan === 1
      && det.eksisting.kondisi.rusak_berat === 3 && det.eksisting.lokasi.length === 2 && det.riwayat_eksisting.find(g => g.lokasi_id === rA.id)?.baris.length === 2, JSON.stringify(det?.eksisting.kondisi))
    const ul = det?.eksisting.perlu_ulang ?? []
    ok('D9 perlu didata ulang: 3 unit dibeli 12 Apr 2026 sesudah pendataan Ruang B (pembelian Des 2025 tidak ikut)', ul.length === 1 && ul[0].jenis === 'BELI'
      && (ul[0] as { unit: number }).unit === 3 && (ul[0] as { lokasi: string }).lokasi === 'UJIBBA3 Ruang B', JSON.stringify(ul))
    const pb = await D.perBarangTahun(2088)
    const rk = pb.rows.find(r => r.id === kursi.id)
    ok('D10 Per Barang: barang yang hanya punya pendataan ikut tampil (rusak berat terbaca)', rk?.eksisting?.kondisi.rusak_berat === 2 && rk.item_tahun === 0
      && pb.rows.find(r => r.id === laptop.id)?.eksisting?.perlu_ulang.length === 1)

    const lokDipakai = await coba(() => D.hapusLokasi(rB.id))
    const rC = await D.createLokasi('UJIBBA3 Ruang C')
    ok('D11 lokasi berpendataan tidak bisa dihapus; yang kosong bisa', lokDipakai instanceof D.BbaLokasiDipakaiError && (await D.hapusLokasi(rC.id))?.nama === 'UJIBBA3 Ruang C')
    const brgDipakai = await coba(() => D.hapusBarang(kursi.id))
    ok('D12 barang yang hanya punya pendataan tidak bisa dihapus (pesannya menyebut pendataan)', brgDipakai instanceof D.BbaBarangDipakaiError && /1 pendataan eksisting/.test(brgDipakai.message))

    // Gabungkan Laptop Kantor → Laptop
    await D.simpanPendataan({ lokasi_id: rA.id, tgl_cek: '2026-03-01', baris: [{ barang_id: kantor.id, baik: 1, rusak_ringan: 0, rusak_berat: 0 }] }, userId)
    const bentrok = await coba(() => D.gabungBarang(kantor.id, laptop.id, userId))
    ok('D13 gabung ditolak bila kedua barang didata di lokasi & tanggal yang sama — tidak ada yang pindah', bentrok instanceof D.BbaGabungBentrokError
      && /UJIBBA3 Ruang A \(1 Mar 2026\)/.test(bentrok.message) && await jumlahE(kantor.id) === 1)
    await k.query("UPDATE bba_eksisting SET tgl_cek = '2026-02-15' WHERE barang_id = ?", [kantor.id])
    const gb = await D.gabungBarang(kantor.id, laptop.id, userId)
    const det2 = await D.detailBarang(laptop.id, 2088)
    const ulangGabung = det2?.eksisting.perlu_ulang.find(a => a.jenis === 'GABUNG')
    ok('D14 gabung memindah pendataan dengan jejak asal; Ruang A ditandai perlu didata ulang', gb.pendataan === 1 && await jumlahE(laptop.id) === 4
      && ulangGabung?.lokasi === 'UJIBBA3 Ruang A' && JSON.stringify((ulangGabung as { dari: string[] }).dari) === '["UJIBBA3 Laptop Kantor"]', JSON.stringify(det2?.eksisting.perlu_ulang))
    await new Promise(r => setTimeout(r, 1100)) // created_at & digabung_pada berpresisi detik
    await D.simpanPendataan({ lokasi_id: rA.id, tgl_cek: tanggalHariIniWIB(), baris: [{ barang_id: laptop.id, baik: 6, rusak_ringan: 0, rusak_berat: 0 }] }, userId)
    const det3 = await D.detailBarang(laptop.id, 2088)
    ok('D15 didata lagi sesudah gabung → tanda gabung hilang', !det3?.eksisting.perlu_ulang.some(a => a.jenis === 'GABUNG'), JSON.stringify(det3?.eksisting.perlu_ulang))

    const terbaru = det3!.riwayat_eksisting.find(g => g.lokasi_id === rA.id)!.baris[0]
    const hp = await D.hapusPendataan(terbaru.id)
    const det4 = await D.detailBarang(laptop.id, 2088)
    ok('D16 hapus pendataan (koreksi) → yang sebelumnya kembali berlaku', hp?.lokasi === 'UJIBBA3 Ruang A' && det4?.eksisting.lokasi.find(l => l.lokasi_id === rA.id)?.tgl_cek === '2026-03-01'
      && (await D.hapusPendataan(terbaru.id)) === null)
  } finally {
    await bersih()
    const [sisa] = await k.query("SELECT (SELECT COUNT(*) FROM bba_lokasi WHERE nama LIKE 'UJIBBA3%') AS l, (SELECT COUNT(*) FROM bba_barang WHERE nama LIKE 'UJIBBA3%') AS g, (SELECT COUNT(*) FROM buku_besar_aset WHERE tahun_anggaran IN (?)) AS a",
      [TAHUN]) as [Array<{ l: number; g: number; a: number }>, unknown]
    ok('D17 kotak pasir bersih', Number(sisa[0].l) === 0 && Number(sisa[0].g) === 0 && Number(sisa[0].a) === 0, JSON.stringify(sisa[0]))
    await k.end()
  }
}

console.log(`\n${lulus} lulus, ${gagal.length} gagal`)
if (gagal.length) { console.log(gagal.map(g => `  - ${g}`).join('\n')); process.exit(1) }
process.exit(0)
