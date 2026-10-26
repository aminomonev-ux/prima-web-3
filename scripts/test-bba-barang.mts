// scripts/test-bba-barang.mts — Buku Besar Aset Tahap 2: Master Barang, status Dalam Proses,
// tampilan Per Barang (docs/CONCEPT-bba-perencanaan.md §5).
//
//   npx tsx scripts/test-bba-barang.mts
//
// A aturan murni `lib/bba/barang.ts` + `lib/bba/status.ts`. B skema Zod. C sambungan sumber.
// D MySQL sungguhan di tahun kotak pasir 2086–2088 lewat fungsi data asli, lalu dibersihkan.

import { readFileSync } from 'node:fs'
import mysql from 'mysql2/promise'
import {
  rapikanNamaBarang, kunciNamaBarang, namaDasarUraian, saranBarang, barangBernamaSama,
  ringkasPerBarang, riwayatPerTahun, type BahanBarang,
} from '../lib/bba/barang'
import {
  isValidStatusTransition, pilihanStatusRealisasi, statusSebelumTerima, STATUS_BELUM_TEREALISASI, BBA_STATUSES,
} from '../lib/bba/status'

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

console.log('A. Aturan murni')
ok('A1 nama dirapikan: spasi ganda & tepi dibuang, huruf dipertahankan, ≤160', rapikanNamaBarang('  Kursi   Roda\tStandar ') === 'Kursi Roda Standar'
  && rapikanNamaBarang('x'.repeat(200)).length === 160 && rapikanNamaBarang(null) === '')
ok('A2 kunci pembanding abai huruf besar-kecil & aksen (cermin kolasi ai_ci)', kunciNamaBarang(' kursi  RODA ') === kunciNamaBarang('Kursi Roda') && kunciNamaBarang('Café') === 'cafe')
ok('A3 nama dasar dari uraian tarikan usulan = bagian sebelum " — "', namaDasarUraian('Printer A3 — Laser warna') === 'Printer A3' && namaDasarUraian('Laptop Core i5') === 'Laptop Core i5')
const daftar = [{ id: 1, nama: 'Laptop' }, { id: 2, nama: 'Printer' }, { id: 3, nama: 'Printer A3' }, { id: 4, nama: 'Kursi Roda' }]
ok('A4 saran = awalan UTUH uraian', saranBarang('Laptop Core i5 14 inci', daftar)?.id === 1 && saranBarang('laptop, i5', daftar)?.id === 1
  && saranBarang('Laptop', daftar)?.id === 1 && saranBarang('Laptopan murah', daftar) === null && saranBarang('Meja', daftar) === null)
ok('A5 saran: yang terpanjang menang (Printer A3 mengalahkan Printer)', saranBarang('Printer A3 — Laser', daftar)?.id === 3 && saranBarang('Printer Dot Matrix', daftar)?.id === 2)
ok('A6 tautan otomatis tarik usulan hanya nama SAMA, bukan awalan', barangBernamaSama('  kursi  roda ', daftar)?.id === 4 && barangBernamaSama('Laptop Core', daftar) === null && barangBernamaSama('', daftar) === null)

const b = (p: Partial<BahanBarang>): BahanBarang => ({ barang_id: 1, tahun_anggaran: 2089, status: 'DIRENCANAKAN', usulan_keputusan: null, vol: 0, vol_realisasi: 0, nilai_rencana: 0, nilai_realisasi: 0, tgl_realisasi: null, ...p })
const bahan: BahanBarang[] = [
  b({ tahun_anggaran: 2087, status: 'REALISASI_PENUH', vol: 4, vol_realisasi: 4, nilai_rencana: 56e6, nilai_realisasi: 52e6, tgl_realisasi: '2087-05-01' }),
  b({ tahun_anggaran: 2088, status: 'REALISASI_SEBAGIAN', vol: 3, vol_realisasi: 2, nilai_rencana: 42e6, nilai_realisasi: 27e6, tgl_realisasi: '2088-02-01' }),
  b({ tahun_anggaran: 2088, status: 'REALISASI_PENUH', vol: 1, vol_realisasi: 1, nilai_rencana: 14e6, nilai_realisasi: 12e6, tgl_realisasi: '2088-09-01' }),
  b({ tahun_anggaran: 2088, status: 'DIPROSES', vol: 2, nilai_rencana: 28e6 }),
  b({ tahun_anggaran: 2089, status: 'DIRENCANAKAN', vol: 5, nilai_rencana: 70e6 }),
  b({ tahun_anggaran: 2089, status: 'DIPROSES', vol: 1, nilai_rencana: 14e6 }),
  b({ tahun_anggaran: 2090, status: 'REALISASI_PENUH', vol: 9, vol_realisasi: 9, nilai_rencana: 1e6, nilai_realisasi: 1e6 }),
  b({ tahun_anggaran: 2089, status: 'TIDAK_TEREALISASI', usulan_keputusan: 'DITOLAK', vol: 9, nilai_rencana: 99e6 }),
  b({ barang_id: null, tahun_anggaran: 2089, status: 'DIRENCANAKAN', vol: 2, nilai_rencana: 10e6 }),
  b({ barang_id: null, tahun_anggaran: 2089, status: 'REALISASI_PENUH', vol: 1, vol_realisasi: 1, nilai_rencana: 5e6, nilai_realisasi: 5e6 }),
  b({ barang_id: null, tahun_anggaran: 2089, status: 'TIDAK_TEREALISASI', usulan_keputusan: 'DITOLAK', vol: 3, nilai_rencana: 7e6 }),
  b({ barang_id: null, tahun_anggaran: 2088, status: 'DIRENCANAKAN', vol: 8, nilai_rencana: 8e6 }),
]
const { perBarang, belum } = ringkasPerBarang(bahan, 2089)
const r1 = perBarang.get(1)
ok('A7 pernah dibeli = Σ unit realisasi s.d. T (tahun depan & ditolak tidak ikut)', r1?.dibeli === 7, JSON.stringify(r1))
ok('A8 pembelian terakhir = tahun lalu tanggal terakhir → harga satuannya', r1?.tahun_beli_terakhir === 2088 && r1.harga_beli_terakhir === 12e6)
ok('A9 dalam proses = Σ unit DIPROSES s.d. T (pesanan tahun lalu ikut)', r1?.diproses === 3)
ok('A10 direncanakan = unit DIRENCANAKAN tahun T saja; item & rencana tahun T (semua status, tanpa ditolak)', r1?.direncanakan === 5 && r1.item_tahun === 2 && r1.rencana_tahun === 84e6)
ok('A11 "Belum ditautkan" = item tahun T tanpa barang, ditolak & tahun lain tidak ikut', belum.item === 2 && belum.direncanakan === 2 && belum.rencana === 15e6, JSON.stringify(belum))
const kpi2089 = bahan.filter(x => x.tahun_anggaran === 2089 && x.usulan_keputusan !== 'DITOLAK').reduce((s, x) => s + x.nilai_rencana, 0)
ok('A12 Σ Rencana T per barang + belum ditautkan = KPI Total Rencana (tanpa ditolak)', [...perBarang.values()].reduce((s, r) => s + r.rencana_tahun, 0) + belum.rencana === kpi2089)
const riw = riwayatPerTahun(bahan.filter(x => x.barang_id === 1), [
  { tahun_anggaran: 2089, harga: 13e6, url: 'https://shopee.co.id/a', file_id: null },
  { tahun_anggaran: 2089, harga: 15e6, url: null, file_id: 'berkas' },
  { tahun_anggaran: 2089, harga: 1, url: null, file_id: null },
])
ok('A13 riwayat per tahun: terbaru di atas, ditolak tidak dihitung', riw.map(r => r.tahun).join() === '2090,2089,2088,2087' && riw[1].item === 2 && riw[1].nilai_rencana === 84e6)
ok('A14 riwayat: harga satuan setahun = Σ nilai ÷ Σ unit realisasi; tanpa realisasi → null', riw[2].harga_satuan === 13e6 && riw[1].harga_satuan === null)
ok('A15 riwayat: rata-rata referensi SAH tahun itu (tren harga)', riw[1].ref_rata === 14e6 && riw[2].ref_rata === null)
ok('A16 riwayat menghitung status per tahun', riw[2].status.REALISASI_PENUH === 1 && riw[2].status.DIPROSES === 1 && riw[2].status.REALISASI_SEBAGIAN === 1)

ok('A17 DIPROSES di antara Direncanakan & Realisasi', BBA_STATUSES.join() === 'DIRENCANAKAN,DIPROSES,REALISASI_PENUH,REALISASI_SEBAGIAN,TIDAK_TEREALISASI')
ok('A18 transisi: Direncanakan ⇄ Dalam Proses, Dalam Proses → realisasi', isValidStatusTransition('DIRENCANAKAN', 'DIPROSES') && isValidStatusTransition('DIPROSES', 'DIRENCANAKAN')
  && isValidStatusTransition('DIPROSES', 'REALISASI_PENUH') && isValidStatusTransition('DIPROSES', 'TIDAK_TEREALISASI'))
ok('A19 transisi: yang sudah terealisasi tidak bisa mundur ke Dalam Proses', !isValidStatusTransition('REALISASI_SEBAGIAN', 'DIPROSES') && !isValidStatusTransition('TIDAK_TEREALISASI', 'DIPROSES')
  && !isValidStatusTransition('REALISASI_PENUH', 'DIPROSES') && isValidStatusTransition('REALISASI_PENUH', 'DIPROSES', true))
ok('A20 pilihan status modal = status sekarang + transisi sah', pilihanStatusRealisasi('DIPROSES').join() === 'DIRENCANAKAN,DIPROSES,REALISASI_PENUH,REALISASI_SEBAGIAN,TIDAK_TEREALISASI'
  && pilihanStatusRealisasi('REALISASI_SEBAGIAN').join() === 'REALISASI_PENUH,REALISASI_SEBAGIAN,TIDAK_TEREALISASI')
ok('A21 sebelum diterima = Direncanakan & Dalam Proses; "belum terealisasi" KPI ikut DIPROSES', statusSebelumTerima('DIPROSES') && statusSebelumTerima('DIRENCANAKAN')
  && !statusSebelumTerima('TIDAK_TEREALISASI') && STATUS_BELUM_TEREALISASI.includes('DIPROSES'))

console.log('\nB. Skema Zod')
const S = await import('../lib/data/buku-besar-aset-schemas')
ok('B1 barang_id DAN barang_baru sekaligus ditolak', !S.BbaCreateSchema.safeParse({ tahun_anggaran: 2089, uraian: 'x', barang_id: 1, barang_baru: 'Laptop' }).success
  && !S.BbaUpdateSchema.safeParse({ id: 1, expected_version: 0, barang_id: 1, barang_baru: 'Laptop' }).success)
const u0 = S.BbaUpdateSchema.parse({ id: 1, expected_version: 0 })
const uLepas = S.BbaUpdateSchema.parse({ id: 1, expected_version: 0, barang_id: null })
ok('B2 barang_id tidak dikirim = undefined (jangan sentuh); null = lepas', u0.barang_id === undefined && uLepas.barang_id === null)
ok('B3 status TIDAK lagi lewat PATCH item (satu pintu: Proses & Realisasi)', !('status' in S.BbaUpdateSchema.parse({ id: 1, expected_version: 0, status: 'DIPROSES' })))
ok('B4 realisasi menerima DIPROSES + tgl_proses berformat tanggal', S.BbaRealisasiSchema.safeParse({ id: 1, expected_version: 0, nilai_realisasi: 0, vol_realisasi: 0, status: 'DIPROSES', tgl_proses: '2089-02-03' }).success
  && !S.BbaRealisasiSchema.safeParse({ id: 1, expected_version: 0, nilai_realisasi: 0, vol_realisasi: 0, status: 'DIPROSES', tgl_proses: '3/2/2089' }).success)
ok('B5 tautkan: tiap pasangan tepat satu (barang ada ATAU baru); kosong & >200 ditolak', S.BarangTautkanSchema.safeParse({ pasangan: [{ aset_id: 1, barang_id: 2 }, { aset_id: 2, barang_baru: 'X' }] }).success
  && !S.BarangTautkanSchema.safeParse({ pasangan: [{ aset_id: 1 }] }).success && !S.BarangTautkanSchema.safeParse({ pasangan: [] }).success
  && !S.BarangTautkanSchema.safeParse({ pasangan: Array.from({ length: 201 }, (_, i) => ({ aset_id: i + 1, barang_id: 1 })) }).success)
ok('B6 gabung ke diri sendiri ditolak', !S.BarangGabungSchema.safeParse({ dari: 3, ke: 3 }).success && S.BarangGabungSchema.safeParse({ dari: 3, ke: 4 }).success)
ok('B7 nama barang kosong / >160 ditolak', !S.BarangCreateSchema.safeParse({ nama: '   ' }).success && !S.BarangCreateSchema.safeParse({ nama: 'x'.repeat(161) }).success)

console.log('\nC. Sambungan sumber')
const skema = sumber('docs/schema-mysql.sql')
const iBarang = skema.indexOf('CREATE TABLE IF NOT EXISTS bba_barang (')
const iBba = skema.indexOf('CREATE TABLE IF NOT EXISTS buku_besar_aset (')
const blokBba = skema.slice(iBba, skema.indexOf(') ENGINE', iBba))
ok('C1 skema acuan: bba_barang dibuat SEBELUM buku_besar_aset, FK RESTRICT di dalam CREATE (berkas bisa dijalankan ulang)', iBarang >= 0 && iBarang < iBba
  && blokBba.includes('CONSTRAINT fk_bba_barang FOREIGN KEY (barang_id)      REFERENCES bba_barang(id)       ON DELETE RESTRICT') && !/ALTER TABLE buku_besar_aset/.test(skema))
ok('C2 skema acuan: status ber-DIPROSES + tgl_proses DATE', blokBba.includes("ENUM('DIRENCANAKAN','DIPROSES','REALISASI_PENUH','REALISASI_SEBAGIAN','TIDAK_TEREALISASI')") && blokBba.includes('tgl_proses        DATE'))
const mig = sumber('docs/migrations/migration-bba-barang-proses.sql')
ok('C3 migrasi: ADD COLUMN tanpa IF NOT EXISTS, FK RESTRICT', mig.includes('ADD COLUMN barang_id  INT UNSIGNED NULL') && !/ADD COLUMN IF NOT EXISTS/i.test(mig) && mig.includes('ON DELETE RESTRICT'))
const data = tanpaKomentar(sumber('lib/data/buku-besar-aset.ts'))
ok('C4 KPI "belum terealisasi" memakai daftar bersama (ikut DIPROSES)', data.includes('AND b.status IN (${[...STATUS_BELUM_TEREALISASI]}) THEN 1 ELSE 0 END), 0) AS backlog'))
const bUpdate = badan(data, 'export async function updateAset(', 'export async function setRealisasi(')
const iTentukan = bUpdate.indexOf('const barangId = await tentukanBarang(tx,')
const iCas = bUpdate.indexOf('assertCas(res);')
const iVersi = bUpdate.indexOf('if (Number(kini[0]?.version) !== input.expected_version) throw new BbaVersionConflictError();')
ok('C5 updateAset: versi dicek di bawah kunci DULU, lalu barang ditentukan, di transaksi yang SAMA sebelum CAS', iTentukan > bUpdate.indexOf('await withTransaction(')
  && iVersi > 0 && iVersi < iTentukan && iTentukan < iCas && bUpdate.includes('SELECT version FROM buku_besar_aset WHERE id = ${input.id} FOR UPDATE'))
ok('C6 updateAset tidak lagi menulis status', !/status = \$\{input\.status\}/.test(bUpdate) && !bUpdate.includes('isValidStatusTransition'))
const bReal = badan(data, 'export async function setRealisasi(', 'export async function deleteAset(')
ok('C7 setRealisasi: "sebelum diterima ⇒ realisasi 0" diperiksa SEBELUM UPDATE', bReal.indexOf('if (statusSebelumTerima(input.status) && (input.vol_realisasi !== 0 || input.nilai_realisasi !== 0))') >= 0
  && bReal.indexOf('if (statusSebelumTerima(input.status) && (input.vol_realisasi !== 0 || input.nilai_realisasi !== 0))') < bReal.indexOf('UPDATE buku_besar_aset SET'))
ok('C8 setRealisasi: tgl_proses diisi saat DIPROSES, dikosongkan saat kembali Direncanakan, dipertahankan saat diterima',
  bReal.includes("const tglProses = input.status === 'DIPROSES' ? (input.tgl_proses ?? cur.tgl_proses ?? null)") && bReal.includes(": input.status === 'DIRENCANAKAN' ? null : cur.tgl_proses;"))
const bImpor = badan(data, 'export async function commitImportUsulan(', '// ─── Master Kategori Aset')
ok('C9 tarik usulan: tautan otomatis nama SAMA, kolom barang_id ikut bulkInsert', bImpor.includes('barangBernamaSama(c.nama_barang, daftarBarang)?.id ?? null') && bImpor.includes("'uraian', 'barang_id', 'sumber_anggaran'"))
const bGabung = badan(data, 'export async function gabungBarang(', 'export async function tautkanBarang(')
ok('C10 gabung: kunci kedua barang, item pindah + versi naik, BARU hapus asal', bGabung.includes('FOR UPDATE') && bGabung.includes('version = version + 1')
  && bGabung.indexOf('UPDATE buku_besar_aset SET barang_id') < bGabung.indexOf('DELETE FROM bba_barang'))
const bTaut = badan(data, 'export async function tautkanBarang(', 'function bahanDari(')
ok('C11 tautkan: hanya item yang MASIH tanpa barang', bTaut.includes('WHERE id IN (${ids}) AND barang_id IS NULL') && bTaut.includes('await pastikanBarang(tx,'))
ok('C12 L68: barang yang ditunjuk diperiksa ada (FOR SHARE)', data.includes('SELECT id FROM bba_barang WHERE id IN (${unik}) FOR SHARE'))
const rima = tanpaKomentar(sumber('lib/rima/bba-provider.ts'))
ok('C13 RIMA: menunggu realisasi = Direncanakan + Dalam Proses', rima.includes("const BBA_INBOX_STATUS = ['DIRENCANAKAN', 'DIPROSES'] as const;") && rima.includes('WHERE status IN (${[...BBA_INBOX_STATUS]})'))
const modal = tanpaKomentar(sumber('app/(dashboard)/buku-besar-aset/_components/ModalItem.tsx'))
ok('C14 modal item: pilihan status hilang, barang dikirim hanya kalau berubah (L87)', !modal.includes('STATUSES.map') && !/status: isian\.status/.test(modal)
  && modal.includes('...(barangBerubah ? bodyBarang(isian.barang) : {}),'))
const klien = tanpaKomentar(sumber('app/(dashboard)/buku-besar-aset/buku-besar-aset-client.tsx'))
ok('C15 modal Proses & Realisasi: pilihan dari aturan transisi bersama, angka dikunci 0 sebelum diterima', klien.includes('pilihanStatusRealisasi(realForm.row.status, bolehBatalkanFinal(role))')
  && klien.includes('nilai_realisasi: sebelumTerima ? 0 : realForm.nilai, vol_realisasi: sebelumTerima ? 0 : realForm.vol,'))
const routes = ['app/api/buku-besar-aset/barang/route.ts', 'app/api/buku-besar-aset/barang/gabung/route.ts', 'app/api/buku-besar-aset/barang/tautkan/route.ts'].map(p => tanpaKomentar(sumber(p)))
const handler = routes.reduce((n, s) => n + (s.match(/export async function (GET|POST|PATCH|DELETE)\(/g) ?? []).length, 0)
const dijaga = routes.reduce((n, s) => n + (s.match(/const g = await guard\(\);\s*if \(!g\.ok\) return g\.res;/g) ?? []).length, 0)
ok('C16 route barang: tiap handler lewat guard modul lebih dulu', handler === 6 && dijaga === 6, `${dijaga}/${handler}`)
const { RETENSI_PERISTIWA } = await import('../lib/security/retensi-audit')
ok('C17 audit barang digolongkan perubahan data (5 tahun)', ['BBA_BARANG_ADD', 'BBA_BARANG_UPDATE', 'BBA_BARANG_DELETE', 'BBA_BARANG_GABUNG', 'BBA_BARANG_TAUTKAN']
  .every(k => (RETENSI_PERISTIWA as Record<string, string>)[k] === 'PANJANG'))
const perBarang2 = tanpaKomentar(sumber('app/(dashboard)/buku-besar-aset/_components/PerBarang.tsx'))
const kartu = tanpaKomentar(sumber('app/(dashboard)/buku-besar-aset/_components/KartuBarang.tsx'))
ok('C18 Per Barang & kartu barang: jawaban terlambat dibuang', perBarang2.includes('if (n !== nomor.current) return;') && kartu.includes('if (n !== nomor.current) return;'))

console.log('\nD. MySQL sungguhan (kotak pasir 2086–2088)')
const TAHUN = [2086, 2087, 2088]
const UJI = 'UJI-BBA-BRG'
let c: mysql.Connection | null = null
try {
  c = await mysql.createConnection({
    host: process.env.MYSQL_HOST, port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER, password: process.env.MYSQL_PASSWORD, database: process.env.MYSQL_DATABASE,
  })
} catch (e) {
  console.log(`DILEWATI bagian DB: MySQL tidak bisa dihubungi (${(e as { code?: string }).code ?? e})`)
}
if (c) {
  const k = c
  const bersih = async () => {
    await k.query('DELETE FROM buku_besar_aset WHERE tahun_anggaran IN (?)', [TAHUN])
    await k.query('DELETE FROM usulan_items WHERE no_usulan = ?', [UJI])
    await k.query('DELETE FROM usulan_headers WHERE no_usulan = ?', [UJI])
    await k.query("DELETE FROM bba_barang WHERE nama LIKE 'UJIBBA%'")
  }
  await bersih()
  const D = await import('../lib/data/buku-besar-aset')
  const [u] = await k.query('SELECT id FROM users ORDER BY id LIMIT 1') as [Array<{ id: number }>, unknown]
  const userId = Number(u[0]?.id ?? 0)
  const versi = async (id: number) => Number(((await k.query('SELECT version FROM buku_besar_aset WHERE id = ?', [id])) as [Array<{ version: number }>, unknown])[0][0]?.version)
  const baris = async (id: number) => ((await k.query("SELECT barang_id, status, DATE_FORMAT(tgl_proses, '%Y-%m-%d') AS tgl_proses, DATE_FORMAT(tgl_realisasi, '%Y-%m-%d') AS tgl_realisasi FROM buku_besar_aset WHERE id = ?", [id])) as [Array<{ barang_id: number | null; status: string; tgl_proses: string | null; tgl_realisasi: string | null }>, unknown])[0][0]
  const jumlahBarang = async (pola: string) => Number(((await k.query('SELECT COUNT(*) AS n FROM bba_barang WHERE nama LIKE ?', [pola])) as [Array<{ n: number }>, unknown])[0][0]?.n)
  const item = (tahun: number, uraian: string, vol: number, harga: number, ext: Record<string, unknown> = {}) =>
    D.createAset({ tahun_anggaran: tahun, uraian: `${UJI} ${uraian}`, sumber_anggaran: 'BLUD', vol, harga, ...ext }, userId)
  try {
    const laptop = await D.createBarang({ nama: '  UJIBBA   Laptop ' }, userId)
    const kembar = await coba(() => D.createBarang({ nama: 'ujibba laptop' }, userId))
    ok('D1 barang baru dirapikan; kembar beda huruf/spasi ditolak (kolasi ci)', laptop.nama === 'UJIBBA Laptop' && kembar instanceof D.BbaBarangKembarError)

    const kr1 = await item(2088, 'Kursi roda A', 2, 2_000_000, { barang_baru: 'UJIBBA Kursi Roda', kategori_aset: 'ALKES', satuan: 'unit' })
    const kr2 = await item(2088, 'Kursi roda B', 1, 2_100_000, { barang_baru: ' ujibba  kursi roda' })
    const [[krb]] = await k.query("SELECT id, kategori_aset, satuan FROM bba_barang WHERE nama = 'UJIBBA Kursi Roda'") as [Array<{ id: number; kategori_aset: string; satuan: string }>, unknown]
    ok('D2 "buat barang baru" saat Simpan item: dibuat sekali, item kedua memakai yang sama; kategori/satuan dari item', await jumlahBarang('UJIBBA Kursi%') === 1
      && (await baris(kr1.id)).barang_id === krb.id && (await baris(kr2.id)).barang_id === krb.id && krb.kategori_aset === 'ALKES' && krb.satuan === 'unit')

    const hantu = await coba(() => item(2088, 'Hantu', 1, 1, { barang_id: 999_999_999 }))
    const [[nHantu]] = await k.query('SELECT COUNT(*) AS n FROM buku_besar_aset WHERE uraian = ?', [`${UJI} Hantu`]) as [Array<{ n: number }>, unknown]
    ok('D3 L68: barang yang tidak ada ditolak, item ikut batal', hantu instanceof D.BbaBarangTidakDikenalError && Number(nHantu.n) === 0)

    const v0 = await versi(kr1.id)
    await D.updateAset({ id: kr1.id, expected_version: v0, keterangan: 'x' }, userId)
    const basi = await coba(() => D.updateAset({ id: kr1.id, expected_version: v0, barang_baru: 'UJIBBA Nebulizer' }, userId))
    ok('D4 CAS basi → 409 DAN barang baru yang sempat dibuat ikut batal', basi instanceof D.BbaVersionConflictError && await jumlahBarang('UJIBBA Nebulizer') === 0)
    ok('D5 PATCH tanpa barang_id tidak menyentuh tautan', (await baris(kr1.id)).barang_id === krb.id)
    await D.updateAset({ id: kr2.id, expected_version: await versi(kr2.id), barang_id: null }, userId)
    ok('D6 barang_id null = lepas tautan', (await baris(kr2.id)).barang_id === null)

    // Riwayat Laptop lintas tahun + status Dalam Proses
    const l86 = await item(2086, 'Laptop i5', 4, 14_000_000, { barang_id: laptop.id })
    await D.setRealisasi({ id: l86.id, expected_version: await versi(l86.id), nilai_realisasi: 52_000_000, vol_realisasi: 4, tgl_realisasi: '2086-05-01', status: 'REALISASI_PENUH' }, userId)
    const l87a = await item(2087, 'Laptop i7', 3, 14_000_000, { barang_id: laptop.id })
    await D.setRealisasi({ id: l87a.id, expected_version: await versi(l87a.id), nilai_realisasi: 27_000_000, vol_realisasi: 2, tgl_realisasi: '2087-02-01', status: 'REALISASI_SEBAGIAN' }, userId)
    const l87b = await item(2087, 'Laptop pesanan', 2, 14_000_000, { barang_id: laptop.id })
    const salahAngka = await coba(() => D.setRealisasi({ id: l87b.id, expected_version: 0, nilai_realisasi: 1, vol_realisasi: 0, tgl_proses: '2087-10-01', status: 'DIPROSES' }, userId))
    ok('D7 Dalam Proses dengan angka realisasi ≠ 0 ditolak (barang belum diterima)', salahAngka instanceof D.BbaStatusMismatchError)
    await D.setRealisasi({ id: l87b.id, expected_version: await versi(l87b.id), nilai_realisasi: 0, vol_realisasi: 0, tgl_realisasi: '2087-10-09', tgl_proses: '2087-10-01', status: 'DIPROSES' }, userId)
    const p1 = await baris(l87b.id)
    ok('D8 Direncanakan → Dalam Proses: tgl_proses tersimpan, tgl_realisasi kosong', p1.status === 'DIPROSES' && p1.tgl_proses === '2087-10-01' && p1.tgl_realisasi === null, JSON.stringify(p1))
    const vA = await versi(l87a.id)
    const mundur = await coba(() => D.setRealisasi({ id: l87a.id, expected_version: vA, nilai_realisasi: 0, vol_realisasi: 0, tgl_proses: '2087-01-01', status: 'DIPROSES' }, userId))
    ok('D9 Realisasi Sebagian → Dalam Proses ditolak', mundur instanceof D.BbaTransitionError)
    const l88 = await item(2088, 'Laptop rencana', 5, 14_000_000, { barang_id: laptop.id })
    await D.updateAset({ id: l88.id, expected_version: await versi(l88.id), referensi: [
      { sumber: 'TOKO_DARING', url: 'https://shopee.co.id/a', harga: 13_000_000 }, { sumber: 'EKATALOG', url: 'https://e-katalog.lkpp.go.id/b', harga: 15_000_000 },
    ] }, userId)
    const lepas = await item(2088, 'Tanpa barang', 1, 10_000_000)
    await k.query(`INSERT INTO buku_besar_aset (canonical_id, tahun_anggaran, origin, usulan_keputusan, uraian, vol, harga, nilai_rencana, status, created_by, updated_by)
      VALUES ('UJIBBA-TOLAK', 2088, 'USULAN', 'DITOLAK', ?, 3, 1000000, 3000000, 'TIDAK_TEREALISASI', ?, ?)`, [`${UJI} Ditolak`, userId, userId])

    const pb = await D.perBarangTahun(2088)
    const rl = pb.rows.find(r => r.id === laptop.id)
    ok('D10 Per Barang Laptop 2088: dibeli 6 (terakhir 2087 · Rp 13,5 jt), dalam proses 2, direncanakan 5', rl?.dibeli === 6 && rl.tahun_beli_terakhir === 2087
      && rl.harga_beli_terakhir === 13_500_000 && rl.diproses === 2 && rl.direncanakan === 5 && rl.item_tahun === 1 && rl.rencana_tahun === 70_000_000, JSON.stringify(rl))
    ok('D11 Belum ditautkan 2088: item tanpa barang saja (yang dilepas + manual), usulan ditolak tidak ikut', pb.belum.item === 2
      && pb.belum.daftar.map(x => x.id).sort().join() === [kr2.id, lepas.id].sort().join(), JSON.stringify(pb.belum))
    const kpi = await D.getAsetKpi({ tahun: 2088, page: 1, limit: 50 })
    ok('D12 Σ Rencana per barang + belum ditautkan = KPI Total Rencana', pb.rows.reduce((s, r) => s + r.rencana_tahun, 0) + pb.belum.rencana === kpi.rencana, `${kpi.rencana}`)
    const kpi87 = await D.getAsetKpi({ tahun: 2087, page: 1, limit: 50 })
    ok('D13 KPI "belum terealisasi" ikut menghitung Dalam Proses', kpi87.backlog === 1)
    const det = await D.detailBarang(laptop.id, 2088)
    ok('D14 kartu barang: riwayat 2088/2087/2086, harga satuan per tahun, rata-rata referensi 2088', det?.riwayat.map(r => r.tahun).join() === '2088,2087,2086'
      && det.riwayat[1].harga_satuan === 13_500_000 && det.riwayat[2].harga_satuan === 13_000_000 && det.riwayat[0].ref_rata === 14_000_000, JSON.stringify(det?.riwayat))

    await D.setRealisasi({ id: l87b.id, expected_version: await versi(l87b.id), nilai_realisasi: 28_000_000, vol_realisasi: 2, tgl_realisasi: '2087-12-01', status: 'REALISASI_PENUH' }, userId)
    const p2 = await baris(l87b.id)
    ok('D15 Dalam Proses → diterima: tgl_proses (dipesan kapan) tetap, tgl_realisasi terisi', p2.status === 'REALISASI_PENUH' && p2.tgl_proses === '2087-10-01' && p2.tgl_realisasi === '2087-12-01')
    const l87c = await item(2087, 'Laptop batal', 1, 14_000_000, { barang_id: laptop.id })
    await D.setRealisasi({ id: l87c.id, expected_version: await versi(l87c.id), nilai_realisasi: 0, vol_realisasi: 0, tgl_proses: '2087-03-03', status: 'DIPROSES' }, userId)
    await D.setRealisasi({ id: l87c.id, expected_version: await versi(l87c.id), nilai_realisasi: 0, vol_realisasi: 0, status: 'DIRENCANAKAN' }, userId)
    const p3 = await baris(l87c.id)
    ok('D16 pesanan batal (Dalam Proses → Direncanakan): tgl_proses dikosongkan', p3.status === 'DIRENCANAKAN' && p3.tgl_proses === null)

    // Tautkan sekaligus
    const vLepas = await versi(lepas.id)
    const tk = await D.tautkanBarang({ pasangan: [
      { aset_id: lepas.id, barang_baru: 'UJIBBA Printer' }, { aset_id: kr2.id, barang_id: krb.id }, { aset_id: l88.id, barang_id: krb.id },
    ] }, userId)
    ok('D17 tautkan: hanya yang masih kosong diisi; yang sudah bertaut dilewati, bukan ditimpa', tk.ditautkan === 2 && tk.dilewati === 1 && tk.barang_baru === 1
      && (await baris(l88.id)).barang_id === laptop.id && (await baris(kr2.id)).barang_id === krb.id, JSON.stringify(tk))
    ok('D18 tautkan menaikkan versi item (modal yang terbuka dapat 409, bukan menimpa)', await versi(lepas.id) === vLepas + 1)

    // Gabungkan Kursi Roda → Laptop (anggap kembar)
    const vKr1 = await versi(kr1.id)
    const gb = await D.gabungBarang(krb.id, laptop.id, userId)
    const modalBasi = await coba(() => D.updateAset({ id: kr1.id, expected_version: vKr1, barang_id: krb.id }, userId))
    ok('D19 gabung: semua item pindah, barang asal hilang, versi item naik', gb.dipindah === 2 && (await baris(kr1.id)).barang_id === laptop.id
      && await jumlahBarang('UJIBBA Kursi%') === 0 && await versi(kr1.id) === vKr1 + 1)
    ok('D20 modal yang masih memegang barang lama → 409 (bukan menulis barang yang sudah tidak ada)', modalBasi instanceof D.BbaVersionConflictError)
    const gbHantu = await coba(() => D.gabungBarang(999_999_998, laptop.id, userId))
    ok('D21 gabung barang yang tidak ada → BbaBarangTidakDikenalError', gbHantu instanceof D.BbaBarangTidakDikenalError)

    const dipakai = await coba(() => D.hapusBarang(laptop.id))
    const kosong = await D.createBarang({ nama: 'UJIBBA Tak Terpakai' }, userId)
    ok('D22 hapus barang yang dipakai → ditolak dengan jumlah item; yang tak terpakai bisa', dipakai instanceof D.BbaBarangDipakaiError && /dipakai \d+ item/.test(dipakai.message)
      && (await D.hapusBarang(kosong.id))?.nama === 'UJIBBA Tak Terpakai' && (await D.hapusBarang(kosong.id)) === null)
    const fk = await coba(async () => k.query('DELETE FROM bba_barang WHERE id = ?', [laptop.id]))
    ok('D23 FK RESTRICT = jaring terakhir di luar aplikasi', (fk as { code?: string }).code === 'ER_ROW_IS_REFERENCED_2')

    // Tarik dari Usulan: tautan otomatis nama sama
    const [h] = await k.query("INSERT INTO usulan_headers (no_usulan, pengusul, sub_bidang, tahun_anggaran) VALUES (?, 'UJI', 'SUB_UJI', '2088')", [UJI]) as [{ insertId: number }, unknown]
    await k.query(`INSERT INTO usulan_items (usulan_id, no_usulan, no_item, sub_bidang, pengusul, jenis_belanja, nama_barang, spesifikasi, qty, satuan, harga_est, status) VALUES
      (?, ?, 1, 'SUB_UJI', 'UJI', 'Belanja Modal Peralatan', ' ujibba   printer ', 'A3', 1, 'unit', 9000000, 'DISETUJUI'),
      (?, ?, 2, 'SUB_UJI', 'UJI', 'Belanja Modal Peralatan', 'UJIBBA Printer Tinta', NULL, 1, 'unit', 3000000, 'DISETUJUI')`, [h.insertId, UJI, h.insertId, UJI])
    const imp = await D.commitImportUsulan(2088, userId)
    const daftarImp = (await D.listAset({ tahun: 2088, origin: 'USULAN', page: 1, limit: 200 })).rows.filter(r => r.usulan_no === UJI)
    const printer = (await k.query("SELECT id FROM bba_barang WHERE nama = 'UJIBBA Printer'") as [Array<{ id: number }>, unknown])[0][0]
    ok('D24 tarik usulan: nama sama (spasi/huruf beda) tertaut otomatis; nama lain tidak, tanpa barang baru', imp.inserted === 2 && imp.tertaut === 1
      && daftarImp.find(r => r.uraian.startsWith(' ujibba'))?.barang_id === printer.id && daftarImp.find(r => r.uraian.startsWith('UJIBBA Printer Tinta'))?.barang_id === null
      && await jumlahBarang('UJIBBA Printer Tinta') === 0, JSON.stringify(daftarImp.map(r => [r.uraian, r.barang_id])))
    const daftarL = (await D.listAset({ tahun: 2087, page: 1, limit: 200 })).rows.find(r => r.id === l87b.id)
    ok('D25 daftar membawa nama barang & tgl_proses', daftarL?.barang_nama === 'UJIBBA Laptop' && daftarL.tgl_proses === '2087-10-01')
  } finally {
    await bersih()
    const [sisa] = await k.query("SELECT (SELECT COUNT(*) FROM buku_besar_aset WHERE tahun_anggaran IN (?)) AS a, (SELECT COUNT(*) FROM usulan_items WHERE no_usulan = ?) AS u, (SELECT COUNT(*) FROM bba_barang WHERE nama LIKE 'UJIBBA%') AS g",
      [TAHUN, UJI]) as [Array<{ a: number; u: number; g: number }>, unknown]
    ok('D26 kotak pasir bersih', Number(sisa[0].a) === 0 && Number(sisa[0].u) === 0 && Number(sisa[0].g) === 0, JSON.stringify(sisa[0]))
    await k.end()
  }
}

console.log(`\n${lulus} lulus, ${gagal.length} gagal`)
if (gagal.length) { console.log(gagal.map(g => `  - ${g}`).join('\n')); process.exit(1) }
process.exit(0)
