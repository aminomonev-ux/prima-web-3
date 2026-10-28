#!/usr/bin/env npx tsx
// scripts/test-bba-rencana.mts — Tahap D Buku Aset: rencana di atas buku aset — jenis, alasan, aset
// sasaran, tanda anggaran, saran tahun lalu, pembelian sebelumnya, Excel daftar rencana.
// Konsep: docs/CONCEPT-bba-buku-aset.md §7.3, §7.4, §7.7, §8, §9, §14.
// Jalankan: npx tsx --env-file=.env.local scripts/test-bba-rencana.mts
// Bagian E memakai MySQL sungguhan (kotak pasir 2082–2083, data berawalan "UJIR"), dibersihkan otomatis.
import { readFileSync, existsSync } from 'node:fs'
import ExcelJS from 'exceljs'
import mysql from 'mysql2/promise'
import { petunjukRencana, alasanTakBisaUbahAnggaran, saranTahunLalu, bolehDitandai } from '../lib/bba/rencana'
import { rapikanReferensi, referensiSama, type ReferensiIsian } from '../lib/bba/referensi'
import { kelompokRencana, tulisDaftarRencana, type BarisRencanaExcel } from '../lib/bba/rencana-excel'
import type { Dimiliki } from '../lib/bba/kondisi'
import { BbaCreateSchema, BbaUpdateSchema, AnggaranSchema, SalinTahunLaluSchema, BbaQuerySchema, ReferensiSchema } from '../lib/data/buku-besar-aset-schemas'
import { AsetExcelSchema } from '../lib/data/bba-aset-schemas'

let lulus = 0
const gagal: string[] = []
function ok(nama: string, syarat: unknown, ket = '') {
  if (syarat) { lulus++; console.log(`  ok  ${nama}`) }
  else { gagal.push(nama); console.log(`FAIL  ${nama}${ket ? ' — ' + ket : ''}`) }
}
const sumber = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
const coba = async <T,>(f: () => Promise<T>): Promise<T | Error> => { try { return await f() } catch (e) { return e as Error } }
const tanpaKomentar = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
const badan = (isi: string, nama: string) => { const i = isi.indexOf(`export async function ${nama}(`); const j = isi.indexOf('\nexport ', i + 10); return isi.slice(i, j < 0 ? undefined : j) }

const milik = (o: Omit<Partial<Dimiliki>, 'kondisi'> & { kondisi?: Partial<Dimiliki['kondisi']> } = {}): Dimiliki => ({
  jumlah: 10, kosong: 0, ruangan: 2, perluDicek: 0, cekTerakhir: '2026-08-12', ...o,
  kondisi: { baik: 6, rusak_ringan: 2, rusak_berat: 2, total: 10, ...o.kondisi },
})

console.log('A. Aturan rencana (lib/bba/rencana.ts)')
ok('A1 penambahan padahal ada rusak berat → tawarkan penggantian; tanpa rusak berat → diam', petunjukRencana('PENAMBAHAN', milik(), 'unit').some(p => p.includes('2 unit rusak berat'))
  && petunjukRencana('PENAMBAHAN', milik({ kondisi: { rusak_berat: 0, baik: 8 } })).length === 0)
ok('A2 penggantian padahal tidak ada rusak berat → tanya alasannya', petunjukRencana('PENGGANTIAN', milik({ kondisi: { rusak_berat: 0, baik: 8 } })).some(p => p.includes('Tidak ada yang rusak berat'))
  && !petunjukRencana('PENGGANTIAN', milik()).some(p => p.includes('Tidak ada yang rusak berat')))
ok('A3 pengadaan baru padahal sudah punya → sebut jumlahnya; belum punya → diam', petunjukRencana('PENGADAAN_BARU', milik(), 'unit').some(p => p.includes('sudah punya 10 unit'))
  && petunjukRencana('PENGADAAN_BARU', null).length === 0)
ok('A4 kondisi belum/lewat dicek → minta Umum Aset memeriksa (jenis apa pun, termasuk kosong)', petunjukRencana(null, milik({ perluDicek: 3 })).some(p => p.includes('3 register'))
  && petunjukRencana('REHAB', milik({ perluDicek: 1 })).length === 1)
ok('A5 penggantian tanpa register sama sekali → tanya yang diganti yang mana', petunjukRencana('PENGGANTIAN', null).some(p => p.includes('yang diganti')))
ok('A6 anggaran: rencana yang sudah diproses tidak bisa dicabut pendanaannya; yang masih direncanakan bebas',
  alasanTakBisaUbahAnggaran('DIRENCANAKAN', 'DIDANAI', 'TIDAK_DIDANAI') === null && alasanTakBisaUbahAnggaran('DIRENCANAKAN', 'BELUM', 'DIDANAI') === null
  && !!alasanTakBisaUbahAnggaran('DIPROSES', 'DIDANAI', 'BELUM') && !!alasanTakBisaUbahAnggaran('REALISASI_PENUH', 'BELUM', 'TIDAK_DIDANAI')
  && alasanTakBisaUbahAnggaran('DIPROSES', 'BELUM', 'DIDANAI') === null && alasanTakBisaUbahAnggaran('DIPROSES', 'DIDANAI', 'DIDANAI') === null)
const calon = [
  { id: 1, anggaran: 'TIDAK_DIDANAI' as const, usulan_keputusan: null }, { id: 2, anggaran: 'TIDAK_DIDANAI' as const, usulan_keputusan: 'DITOLAK' },
  { id: 3, anggaran: 'DIDANAI' as const, usulan_keputusan: null }, { id: 4, anggaran: 'TIDAK_DIDANAI' as const, usulan_keputusan: 'DISETUJUI' },
]
ok('A7 saran tahun lalu: tidak didanai, bukan usulan ditolak, belum pernah disalin', saranTahunLalu(calon, new Set([4])).map(r => r.id).join() === '1'
  && !bolehDitandai({ usulan_keputusan: 'DITOLAK' }) && bolehDitandai({ usulan_keputusan: null }))
const ref = (p: Partial<ReferensiIsian>): ReferensiIsian => ({ sumber: 'LAINNYA', nama_penyedia: null, url: null, harga: null, tgl_cek: null, file_id: null, ...p })
ok('A8 referensi: merk/tipe dirapikan, ikut dibandingkan, baris berisi merk saja tidak dibuang',
  rapikanReferensi([ref({ merk_tipe: '  Omron HEM  ' })])[0]?.merk_tipe === 'Omron HEM'
  && !referensiSama([ref({ harga: 5, merk_tipe: 'A' })], [ref({ harga: 5, merk_tipe: 'B' })])
  && referensiSama([ref({ harga: 5 })], [ref({ harga: 5, merk_tipe: '' })]))

console.log('\nB. Excel daftar rencana (lib/bba/rencana-excel.ts)')
const baris = (o: Partial<BarisRencanaExcel> & { id: number }): BarisRencanaExcel => ({
  canonical_id: `BBA-${o.id}`, uraian: `Rencana ${o.id}`, barang_id: 9, barang_nama: 'Kursi roda', sub_bidang: 'IGD', penanggung_jawab: null,
  vol: 2, satuan: 'unit', harga: 1_000_000, nilai_rencana: 2_000_000, anggaran: 'BELUM', anggaran_nilai: null, jenis_rencana: 'PENGGANTIAN',
  alasan: null, status: 'DIRENCANAKAN', usulan_keputusan: null, ...o,
})
const rr = [baris({ id: 1, anggaran: 'DIDANAI', anggaran_nilai: 2_000_000 }), baris({ id: 2, jenis_rencana: null }), baris({ id: 3, jenis_rencana: 'PENAMBAHAN', nilai_rencana: 5_000_000 }),
  baris({ id: 4, usulan_keputusan: 'DITOLAK' })]
const kel = kelompokRencana(rr)
ok('B1 dikelompokkan per jenis sesuai urutan konsep, belum digolongkan terakhir, usulan ditolak tidak ikut', kel.map(([j, xs]) => `${j ?? '-'}:${xs.length}`).join() === 'PENGGANTIAN:1,PENAMBAHAN:1,-:1')
const wb = new ExcelJS.Workbook()
const ws = tulisDaftarRencana(wb, 2083, rr, new Map([[9, milik()]]), new Map([[1, ['Kursi roda reg. 000013', 'Kursi roda reg. 000014']]]))
const isi = (r: number) => (ws.getRow(r).values as unknown[]).slice(1)
const semuaBaris = Array.from({ length: ws.rowCount }, (_, i) => isi(i + 1))
const r1 = semuaBaris.find(b => b[1] === 'BBA-1') ?? []
ok('B2 baris rencana memuat anggaran, nilai didanai, dimiliki (10 · 6/2/2), aset sasaran', r1[9] === 'Didanai' && r1[10] === 2_000_000 && r1[11] === 10 && r1[12] === 6 && r1[14] === 2
  && String(r1[15]).includes('000013; Kursi roda reg. 000014'), JSON.stringify(r1))
const jumlahAkhir = semuaBaris.find(b => b[2] === 'JUMLAH SELURUHNYA') ?? []
ok('B3 subtotal per jenis + jumlah seluruhnya (rencana 9 jt, didanai 2 jt; usulan ditolak tidak dijumlah)', jumlahAkhir[8] === 9_000_000 && jumlahAkhir[10] === 2_000_000
  && semuaBaris.some(b => b[2] === 'Jumlah Penggantian' && b[8] === 2_000_000) && !semuaBaris.some(b => b[1] === 'BBA-4'), JSON.stringify(jumlahAkhir))

console.log('\nC. Skema & pagar')
ok('C1 item: jenis dari daftar, alasan ≤ 1000, aset sasaran tanpa kembar & ≤ 200; tidak dikirim = jangan sentuh', BbaCreateSchema.safeParse({ tahun_anggaran: 2083, uraian: 'x', jenis_rencana: 'REHAB', alasan: 'a', aset_sasaran: [1, 2] }).success
  && !BbaCreateSchema.safeParse({ tahun_anggaran: 2083, uraian: 'x', jenis_rencana: 'LAIN' }).success
  && !BbaUpdateSchema.safeParse({ id: 1, expected_version: 0, aset_sasaran: [1, 1] }).success
  && !BbaUpdateSchema.safeParse({ id: 1, expected_version: 0, alasan: 'x'.repeat(1001) }).success
  && BbaUpdateSchema.parse({ id: 1, expected_version: 0 }).aset_sasaran === undefined)
ok('C2 anggaran borongan: tiap item membawa angka kunci, tanpa kembar; salin: tahun + daftar id', AnggaranSchema.safeParse({ anggaran: 'DIDANAI', item: [{ id: 1, expected_version: 0 }] }).success
  && !AnggaranSchema.safeParse({ anggaran: 'DIDANAI', item: [{ id: 1, expected_version: 0 }, { id: 1, expected_version: 1 }] }).success
  && !AnggaranSchema.safeParse({ anggaran: 'YA', item: [{ id: 1, expected_version: 0 }] }).success && !SalinTahunLaluSchema.safeParse({ tahun: 2083, ids: [] }).success)
ok('C3 saringan daftar: jenis (termasuk "belum digolongkan") & anggaran; referensi merk/tipe; Excel RENCANA bertahun', BbaQuerySchema.safeParse({ jenis: 'KOSONG', anggaran: 'TIDAK_DIDANAI' }).success
  && !BbaQuerySchema.safeParse({ jenis: 'X' }).success && ReferensiSchema.safeParse({ sumber: 'LAINNYA', merk_tipe: 'Omron' }).success
  && AsetExcelSchema.safeParse({ jenis: 'RENCANA', tahun: '2083' }).success && !AsetExcelSchema.safeParse({ jenis: 'RENCANA' }).success)
const dBba = tanpaKomentar(sumber('lib/data/buku-besar-aset.ts'))
const bTandai = badan(dBba, 'tandaiAnggaran'), bSalin = badan(dBba, 'salinTahunLalu')
ok('C4 tandai anggaran: kunci FOR UPDATE dulu, cek versi tiap item, versi dinaikkan, nilai didanai dari kolom rencana', bTandai.indexOf('FOR UPDATE') < bTandai.indexOf('expected_version')
  && bTandai.includes('throw new BbaVersionConflictError()') && bTandai.includes('version = version + 1') && bTandai.includes("anggaran_vol = ${didanai ? sql`vol` : null}"))
ok('C5 salin: baris asal dikunci SEBELUM membaca salinan yang sudah ada (L84); referensi & sasaran lewat INSERT…SELECT, bukan perulangan', bSalin.indexOf('FOR UPDATE') < bSalin.indexOf('saranTahunLaluList(input.tahun, tx)')
  && bSalin.includes('INSERT INTO bba_referensi_harga') && bSalin.includes("a.status = 'AKTIF'") && !/for \(const .* of salin\)/.test(bSalin))
ok('C6 aset sasaran: L68 — yang BARU ditambahkan ada & AKTIF, dikunci FOR SHARE, di transaksi CAS item (create & update)', dBba.includes("SELECT id FROM bba_aset WHERE id IN (${baru}) AND status = 'AKTIF' FOR SHARE")
  && badan(dBba, 'updateAset').includes('await gantiSasaran(tx, conn, input.id, input.aset_sasaran)') && badan(dBba, 'createAset').includes('await gantiSasaran(tx, conn, id, input.aset_sasaran)'))
const mig = existsSync('docs/migrations/migration-bba-rencana.sql') ? sumber('docs/migrations/migration-bba-rencana.sql') : ''
const skema = sumber('docs/schema-mysql.sql')
ok('C7 migrasi + skema acuan: kolom rencana, bba_rencana_aset, merk_tipe; tanpa IF NOT EXISTS pada ADD COLUMN; yang sudah diproses diisi DIDANAI',
  ['jenis_rencana', 'alasan', 'anggaran ', 'anggaran_vol', 'anggaran_nilai', 'anggaran_pada', 'anggaran_oleh', 'asal_rencana_id', 'merk_tipe'].every(k => mig.includes(`ADD COLUMN ${k}`))
  && skema.includes('CREATE TABLE IF NOT EXISTS bba_rencana_aset') && mig.includes("WHERE status IN ('DIPROSES', 'REALISASI_PENUH', 'REALISASI_SEBAGIAN')") && !/ADD COLUMN IF NOT EXISTS/i.test(mig))
const audit = sumber('lib/security/retensi-audit.ts')
ok('C8 jenis audit baru tergolong retensi', audit.includes('BBA_RENCANA_ANGGARAN: P') && audit.includes('BBA_RENCANA_SALIN: P'))
const modal = sumber('app/(dashboard)/buku-besar-aset/_components/ModalItem.tsx')
ok('C9 modal: aset sasaran hanya dikirim bila berubah (L87); "Pakai sebagai referensi" hanya mengisi form (L78)', modal.includes('...(sasaranBerubah ? { aset_sasaran: isian.sasaran } : {})')
  && /function pakaiReferensi[\s\S]*?setRefs\(rs => \[\.\.\.rs, \{ \.\.\.r \}\]\)/.test(modal) && !/function pakaiReferensi[\s\S]{0,400}fetchJson/.test(modal))

console.log('\nE. MySQL sungguhan (kotak pasir 2082–2083)')
let c: mysql.Connection | null = null
try {
  c = await mysql.createConnection({ host: process.env.MYSQL_HOST, port: Number(process.env.MYSQL_PORT || 3306), user: process.env.MYSQL_USER, password: process.env.MYSQL_PASSWORD, database: process.env.MYSQL_DATABASE })
} catch (e) { console.log(`DILEWATI bagian DB: MySQL tidak bisa dihubungi (${(e as { code?: string }).code ?? e})`) }
if (c) {
  const k = c
  const bersih = async () => {
    await k.query("DELETE FROM buku_besar_aset WHERE tahun_anggaran IN (2082, 2083) AND uraian LIKE 'UJIR%'")
    await k.query("DELETE FROM bba_aset WHERE kode_barang LIKE 'UJIR.%'")
    await k.query("DELETE FROM bba_barang WHERE nama LIKE 'UJIR %'")
  }
  await bersih()
  const B = await import('../lib/data/buku-besar-aset')
  const D = await import('../lib/data/bba-aset')
  const [u] = await k.query('SELECT id FROM users ORDER BY id LIMIT 1') as [Array<{ id: number }>, unknown]
  const userId = Number(u[0]?.id ?? 0)
  const versi = async (id: number) => (await B.getAsetById(id))!.version
  try {
    const brg = await B.createBarang({ nama: 'UJIR Kursi Roda' }, userId)
    const tambahAset = async (n: number, tahun: number, kondisi: string, merk: string) => {
      const kode = `UJIR.01.${tahun}-1.3.2.07.01.01.00${n}`
      const [r] = await k.query(`INSERT INTO bba_aset (golongan, kode_barang, register, kunci_impor, kode_objek, tahun_perolehan, nama_resmi, nama, kib, harga, kondisi, kondisi_sumber, barang_id)
        VALUES ('B', ?, '00000${n}', ?, '1.3.2.07.01.01.001', ?, 'KURSI RODA', 'UJIR Kursi', ?, 4000000, ?, 'CEK', ?)`, [kode, `${kode}|${n}`, tahun, JSON.stringify({ merk_type: merk }), kondisi, brg.id]) as [{ insertId: number }, unknown]
      return r.insertId
    }
    const a1 = await tambahAset(1, 2016, 'RB', 'Merk C'), a2 = await tambahAset(2, 2016, 'RB', 'Merk C'), a3 = await tambahAset(3, 2021, 'B', 'Merk B')

    const r1 = await B.createAset({ tahun_anggaran: 2082, uraian: 'UJIR Ganti kursi roda', barang_id: brg.id, sumber_anggaran: 'BLUD', vol: 2, harga: 4_000_000,
      jenis_rencana: 'PENGGANTIAN', alasan: 'ganti 2 RB perolehan 2016', aset_sasaran: [a1, a2],
      referensi: [{ sumber: 'EKATALOG', nama_penyedia: 'PT A', merk_tipe: 'Merk A KR-809', url: 'https://e-katalog.lkpp.go.id/a', harga: 3_950_000, tgl_cek: '2081-11-01' }] }, userId)
    const det1 = await B.getAsetDetail(r1.id)
    ok('E1 rencana baru: jenis, alasan, 2 aset sasaran, referensi + merk/tipe tersimpan; daftar menghitung sasaran', det1?.item.jenis_rencana === 'PENGGANTIAN' && det1.item.alasan?.includes('2 RB')
      && det1.sasaran.map(s => s.id).sort().join() === [a1, a2].sort().join() && det1.referensi[0]?.merk_tipe === 'Merk A KR-809' && det1.item.jumlah_sasaran === 2 && det1.item.anggaran === 'BELUM')

    await B.updateAset({ id: r1.id, expected_version: await versi(r1.id), keterangan: 'tanpa sentuh sasaran' }, userId)
    const tetap = (await B.listSasaran(r1.id)).length
    await k.query("UPDATE bba_aset SET status = 'DIHAPUS' WHERE id = ?", [a3])
    const mati = await coba(async () => B.updateAset({ id: r1.id, expected_version: await versi(r1.id), aset_sasaran: [a1, a3] }, userId))
    await k.query("UPDATE bba_aset SET status = 'AKTIF' WHERE id = ?", [a3])
    ok('E2 sasaran tidak dikirim = tidak disentuh; aset dihapus/tidak ada ditolak tanpa menulis apa pun', tetap === 2 && mati instanceof B.BbaSasaranTidakDikenalError
      && (await B.listSasaran(r1.id)).length === 2)
    // Ketahuan di peramban: FIELD(…,'RB','RR','B') DESC menaruh yang BAIK di atas — calon penggantian harus di depan.
    const calonSasaran = await D.asetUntukSasaran({ barang: brg.id })
    ok('E2b calon aset sasaran: rusak berat lebih dulu, baru baik', calonSasaran.map(a => a.kondisi).join() === 'RB,RB,B', calonSasaran.map(a => a.kondisi).join())

    const v0 = await versi(r1.id)
    const t1 = await B.tandaiAnggaran({ anggaran: 'TIDAK_DIDANAI', item: [{ id: r1.id, expected_version: v0 }] }, userId)
    const ang = await B.getAsetById(r1.id)
    ok('E3 tandai tidak didanai: versi naik, vol/nilai didanai kosong, dicatat kapan', t1.ditandai === 1 && ang?.anggaran === 'TIDAK_DIDANAI' && ang.version === v0 + 1 && ang.anggaran_nilai === null && !!ang.anggaran_pada)
    const basi = await coba(() => B.tandaiAnggaran({ anggaran: 'DIDANAI', item: [{ id: r1.id, expected_version: v0 }] }, userId))
    ok('E4 angka kunci basi → 409, tidak ada yang ditulis', basi instanceof B.BbaVersionConflictError && (await B.getAsetById(r1.id))?.anggaran === 'TIDAK_DIDANAI')

    const r2 = await B.createAset({ tahun_anggaran: 2082, uraian: 'UJIR Tambah kursi', barang_id: brg.id, sumber_anggaran: 'BLUD', vol: 3, harga: 1_000_000, jenis_rencana: 'PENAMBAHAN' }, userId)
    const t2 = await B.tandaiAnggaran({ anggaran: 'DIDANAI', item: [{ id: r2.id, expected_version: await versi(r2.id) }] }, userId)
    const dd = await B.getAsetById(r2.id)
    ok('E5 tandai didanai: volume & nilai didanai = rencana saat ditandai', t2.ditandai === 1 && dd?.anggaran_vol === 3 && dd.anggaran_nilai === 3_000_000)
    await k.query("UPDATE buku_besar_aset SET status = 'DIPROSES' WHERE id = ?", [r2.id])
    const cabut = await coba(async () => B.tandaiAnggaran({ anggaran: 'TIDAK_DIDANAI', item: [{ id: r2.id, expected_version: await versi(r2.id) }] }, userId))
    ok('E6 rencana yang sudah diproses tidak bisa dicabut pendanaannya', cabut instanceof B.BbaAnggaranError && (await B.getAsetById(r2.id))?.anggaran === 'DIDANAI')

    const saran = await B.saranTahunLaluList(2083)
    ok('E7 saran 2083 = rencana 2082 yang tidak didanai saja', saran.some(r => r.id === r1.id) && !saran.some(r => r.id === r2.id))
    const s1 = await B.salinTahunLalu({ tahun: 2083, ids: [r1.id] }, userId)
    const [baru] = await k.query("SELECT id FROM buku_besar_aset WHERE tahun_anggaran = 2083 AND asal_rencana_id = ?", [r1.id]) as [Array<{ id: number }>, unknown]
    const detB = await B.getAsetDetail(Number(baru[0]?.id))
    ok('E8 salin: kode sama, asal tercatat, anggaran mulai Belum, jenis/alasan/barang ikut, referensi ikut dengan tanggal cek lama, sasaran ikut', s1.disalin === 1
      && detB?.item.canonical_id === det1!.item.canonical_id && detB.item.asal_rencana_id === r1.id && detB.item.anggaran === 'BELUM'
      && detB.item.jenis_rencana === 'PENGGANTIAN' && detB.item.barang_id === brg.id && detB.referensi[0]?.tgl_cek === '2081-11-01'
      && detB.referensi[0]?.merk_tipe === 'Merk A KR-809' && detB.sasaran.length === 2, JSON.stringify(detB?.item))
    const s2 = await B.salinTahunLalu({ tahun: 2083, ids: [r1.id] }, userId)
    const tolakSalin = await coba(() => B.salinTahunLalu({ tahun: 2083, ids: [r2.id] }, userId))
    ok('E9 salin ulang dilewati; rencana yang didanai tidak bisa disalin; saran kosong sesudahnya', s2.disalin === 0 && s2.dilewati === 1 && tolakSalin instanceof B.BbaSalinError
      && !(await B.saranTahunLaluList(2083)).some(r => r.id === r1.id))

    await k.query("UPDATE buku_besar_aset SET status = 'REALISASI_PENUH', vol_realisasi = 2, nilai_realisasi = 7800000, tgl_realisasi = '2082-05-14', anggaran = 'DIDANAI' WHERE id = ?", [r1.id])
    const pb = await B.pembelianSebelumnya(brg.id, detB!.item.id)
    ok('E10 pembelian sebelumnya: rencana terealisasi dengan harga satuan riil + referensi waktu itu; register per tahun perolehan dengan merk & kondisi sekarang',
      pb.prima.length === 1 && pb.prima[0].harga_satuan === 3_900_000 && pb.prima[0].referensi[0]?.merk_tipe === 'Merk A KR-809'
      && pb.kib.find(x => x.tahun === 2016)?.rusak_berat === 2 && pb.kib.find(x => x.tahun === 2016)?.merk.join() === 'Merk C' && pb.kib.find(x => x.tahun === 2021)?.baik === 1,
      JSON.stringify(pb.kib))
    ok('E11 item yang sedang dibuka tidak ikut pembelian sebelumnya', (await B.pembelianSebelumnya(brg.id, r1.id)).prima.length === 0)

    const ex = await B.rencanaUntukExcel(2083)
    const mine = ex.rows.find(r => r.id === detB!.item.id)
    ok('E12 data Excel rencana: dimiliki per barang + label aset sasaran', !!mine && ex.dimiliki.get(brg.id)?.jumlah === 3 && (ex.sasaran.get(detB!.item.id) ?? []).length === 2)
    const da = await D.detailAset(a1)
    const kerja = (await D.asetAktifLengkap()).find(a => a.id === a1)
    ok('E13 kartu aset & format kerja menyebut rencana yang menjadikannya sasaran', (da?.rencana.length ?? 0) === 2 && da!.rencana[0].tahun === 2083
      && !!kerja?.rencana_terkait?.includes('Penggantian'), kerja?.rencana_terkait ?? '')
  } finally {
    await bersih()
    const [sisa] = await k.query("SELECT (SELECT COUNT(*) FROM buku_besar_aset WHERE tahun_anggaran IN (2082,2083) AND uraian LIKE 'UJIR%') AS r, (SELECT COUNT(*) FROM bba_aset WHERE kode_barang LIKE 'UJIR.%') AS a, (SELECT COUNT(*) FROM bba_barang WHERE nama LIKE 'UJIR %') AS b") as [Array<{ r: number; a: number; b: number }>, unknown]
    ok('E14 kotak pasir bersih', Number(sisa[0].r) + Number(sisa[0].a) + Number(sisa[0].b) === 0, JSON.stringify(sisa[0]))
    await k.end()
  }
}

console.log(`\n${lulus} lulus, ${gagal.length} gagal`)
if (gagal.length) { console.log(gagal.map(g => `  - ${g}`).join('\n')); process.exit(1) }
process.exit(0)
