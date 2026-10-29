#!/usr/bin/env npx tsx
// scripts/test-bba-koreksi.mts — Tahap F Buku Aset: koreksi salah input — batalkan penempatan, betulkan /
// kosongkan register, dugaan salah ketik saat impor, betulkan SK, batalkan penghapusan (khusus Admin).
// Konsep: docs/CONCEPT-bba-buku-aset.md §20.
// Jalankan: npx tsx --env-file=.env.local scripts/test-bba-koreksi.mts
// Bagian D memakai MySQL sungguhan (kotak pasir 2079, data berawalan "UJIF"), dibersihkan otomatis.
import { readFileSync } from 'node:fs'
import mysql from 'mysql2/promise'
import { lahirDiPrima, belumTeregister, kelompokkan, rencanakanImpor, calonGantiNomor, type AsetRingan } from '../lib/bba/aset'
import { alasanTakBisaBatalTempatkan, alasanTakBisaUbahRegister } from '../lib/bba/koreksi'
import type { AsetBaca, HasilBacaKib } from '../lib/bba/kib-baca'
import { BatalTempatkanSchema, BatalHapusSchema, UbahRegisterSchema, BetulkanSkSchema } from '../lib/data/bba-penerimaan-schemas'

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

const aset = (o: Partial<AsetRingan> & { id: number }): AsetRingan => ({
  golongan: 'B', kode_barang: null, register: null, kunci_impor: null, kode_objek: null, tahun_perolehan: 2026, nama_resmi: 'KURSI RODA', nama: null,
  lokasi_id: null, harga: 3_900_000, asal_usul: 'Pembelian', keterangan: null, kondisi: 'B', kondisi_sumber: 'CEK', kib: {}, status: 'AKTIF', penerimaan_id: 9, ...o,
})
const baca = (reg: string, o: Partial<AsetBaca> = {}): AsetBaca => ({
  golongan: 'B', lembar: 'KIBB', baris: 9, kunci: `K.2026-1.3.2.05|${reg}`, kode_barang: 'K.2026-1.3.2.05', register: reg, kode_objek: '1.3.2.05',
  tahun_perolehan: 2026, nama_resmi: 'KURSI RODA', harga: 3_900_000, asal_usul: 'Pembelian', keterangan: null, kondisi: 'B', kib: {}, ...o,
})

console.log('A. Aturan murni (lib/bba/aset.ts, lib/bba/koreksi.ts)')
const kibFBerkas = aset({ id: 1, golongan: 'F', penerimaan_id: null, kunci_impor: 'f|gedung baru|jl. a|2025-01-01' })
ok('A1 asal catatan: lahir di PRIMA = punya penerimaan; KIB F dari berkas tanpa kode BUKAN "belum teregister"',
  lahirDiPrima(aset({ id: 1 })) && !lahirDiPrima(kibFBerkas) && belumTeregister(aset({ id: 1 })) && !belumTeregister(kibFBerkas)
  && !belumTeregister(aset({ id: 1, kode_barang: 'K', register: '1' })))
const terregister = aset({ id: 2, kode_barang: 'K.2026-1.3.2.05', register: '000007', kunci_impor: 'K.2026-1.3.2.05|000007' })
ok('A2 batalkan penempatan: hanya lahir dari Tempatkan, aktif, belum teregister, tanpa rujukan rencana/ruangan',
  alasanTakBisaBatalTempatkan(aset({ id: 1 })) === null
  && /berkas KIB/.test(alasanTakBisaBatalTempatkan(aset({ id: 1, penerimaan_id: null })) ?? '')
  && /dihapus dengan SK/.test(alasanTakBisaBatalTempatkan(aset({ id: 1, status: 'DIHAPUS' })) ?? '')
  && /sudah teregister \(000007\)/.test(alasanTakBisaBatalTempatkan(terregister) ?? '')
  && /sudah teregister/.test(alasanTakBisaBatalTempatkan(aset({ id: 1, kunci_impor: 'x|1' })) ?? '')
  && /rencana BBA-3, BBA-4/.test(alasanTakBisaBatalTempatkan(aset({ id: 1 }), { sasaran: ['BBA-3', 'BBA-4'], gedung: [] }) ?? '')
  && /gedung ruangan IGD/.test(alasanTakBisaBatalTempatkan(aset({ id: 1, golongan: 'C' }), { sasaran: [], gedung: ['IGD'] }) ?? ''))
ok('A3 isi / betulkan / kosongkan register: hanya catatan lahir di PRIMA yang masih aktif',
  alasanTakBisaUbahRegister({ status: 'AKTIF', penerimaan_id: 9 }) === null
  && /sistem provinsi, lalu Impor KIB ulang/.test(alasanTakBisaUbahRegister({ status: 'AKTIF', penerimaan_id: null }) ?? '')
  && /dihapus/.test(alasanTakBisaUbahRegister({ status: 'DIHAPUS', penerimaan_id: 9 }) ?? ''))

// Impor: register isian PRIMA 000123 tidak ada di berkas; berkas membawa 000132 bergolongan/tahun/harga sama.
const salahKetik = aset({ id: 10, kode_barang: 'K.2026-1.3.2.05', register: '000123', kunci_impor: 'K.2026-1.3.2.05|000123' })
const dariBerkasTakAda = aset({ id: 11, penerimaan_id: null, kode_barang: 'K.2026-1.3.2.05', register: '000050', kunci_impor: 'K.2026-1.3.2.05|000050' })
const lainHarga = aset({ id: 12, harga: 1, kode_barang: 'K.2026-1.3.2.05', register: '000124', kunci_impor: 'K.2026-1.3.2.05|000124' })
const adaDiBerkas = aset({ id: 13, kode_barang: 'K.2026-1.3.2.05', register: '000140', kunci_impor: 'K.2026-1.3.2.05|000140', kode_objek: '1.3.2.05' })
const ri = rencanakanImpor([salahKetik, dariBerkasTakAda, lainHarga, adaDiBerkas], [baca('000132'), baca('000140')])
// Sejak Tahap G (§23) aset dari berkas yang nomornya diganti provinsi ikut jadi calon — perubahan yang disengaja.
ok('A4 dugaan: register isian PRIMA / aset dari berkas yang tak ada di berkas ↔ register baru sejenis; TIDAK dipasangkan tanpa pilihan (tetap baris baru)',
  ri.calon.map(x => x.lama.id).join() === '10,11' && ri.calon.every(x => x.baru.map(b => b.register).join() === '000132')
  && ri.baru.length === 1 && ri.cocok.length === 0 && ri.dipasangkan.length === 0 && ri.sama === 1
  && ri.tidakDiBerkas.map(a => a.id).sort().join() === '10,11,12', JSON.stringify(ri.calon.map(x => x.lama.id)))
ok('A5 bukan dugaan: harga lain, aset dari berkas yang nama resminya lain, belum teregister (itu cocok otomatis), tanpa register baru sejenis',
  calonGantiNomor([lainHarga, { ...dariBerkasTakAda, nama_resmi: 'TENSIMETER' }], [baca('000132')]).length === 0
  && calonGantiNomor([salahKetik], []).length === 0
  && rencanakanImpor([aset({ id: 20 })], [baca('000132')]).calon.length === 0
  && rencanakanImpor([aset({ id: 20 })], [baca('000132')]).cocok.length === 1)
const bersama = rencanakanImpor([salahKetik, aset({ id: 21 })], [baca('000132')])
ok('A5b register baru yang akan dipasangkan ke unit belum teregister sejenis TETAP disebut sebagai dugaan — nomor itu bisa milik unit yang salah ketik',
  bersama.cocok.length === 1 && bersama.cocok[0].lama.id === 21 && bersama.calon.length === 1 && bersama.calon[0].lama.id === 10, JSON.stringify(bersama.calon.map(x => x.lama.id)))
const kel = kelompokkan([aset({ id: 1 }), aset({ id: 2 }), terregister, kibFBerkas])
ok('A6 hitungan "belum teregister" per kelompok memakai aturan yang sama (KIB F berkas tidak ikut)',
  kel.find(k => k.golongan === 'B')?.belumTeregister === 2 && kel.find(k => k.golongan === 'F')?.belumTeregister === 0)

console.log('\nB. Skema Zod')
const item = [{ id: 1, expected_version: 0 }]
ok('B1 batalkan penempatan: alasan wajib ≥ 5 huruf, register kembar & kiriman kosong ditolak',
  BatalTempatkanSchema.safeParse({ item, alasan: 'salah golongan' }).success
  && !BatalTempatkanSchema.safeParse({ item, alasan: 'x' }).success && !BatalTempatkanSchema.safeParse({ item }).success
  && !BatalTempatkanSchema.safeParse({ item: [], alasan: 'salah golongan' }).success
  && !BatalTempatkanSchema.safeParse({ item: [...item, ...item], alasan: 'salah golongan' }).success)
const k1 = UbahRegisterSchema.safeParse({ id: 1, expected_version: 0, kosongkan: true })
const k2 = UbahRegisterSchema.safeParse({ id: 1, expected_version: 0, kode_barang: 'K', register: '1' })
ok('B2 ubah register: kosongkan (tanpa kode) ATAU isi kode + register; kosongkan:false bukan kosongkan',
  k1.success && 'kosongkan' in k1.data && k2.success && !('kosongkan' in k2.data)
  && !UbahRegisterSchema.safeParse({ id: 1, expected_version: 0, kosongkan: false }).success
  && !UbahRegisterSchema.safeParse({ id: 1, expected_version: 0 }).success)
ok('B3 batalkan penghapusan: alasan wajib; betulkan SK: tanggal kalender & nomor wajib',
  BatalHapusSchema.safeParse({ id: 1, expected_version: 0, alasan: 'salah pilih aset' }).success && !BatalHapusSchema.safeParse({ id: 1, expected_version: 0, alasan: '' }).success
  && BetulkanSkSchema.safeParse({ id: 1, expected_version: 0, sk_nomor: '028/1', sk_tgl: '2026-10-01' }).success
  && !BetulkanSkSchema.safeParse({ id: 1, expected_version: 0, sk_nomor: '028/1', sk_tgl: '2026-02-31' }).success
  && !BetulkanSkSchema.safeParse({ id: 1, expected_version: 0, sk_nomor: '', sk_tgl: '2026-10-01' }).success)

console.log('\nC. Pagar di kode')
const pen = tanpaKomentar(sumber('lib/data/bba-penerimaan.ts'))
const bBatal = badan(pen, 'batalTempatkan')
ok('C1 batalkan penempatan: penerimaan dikunci lebih dulu (urutan Tempatkan), rujukan dibaca SESUDAH register dikunci, DELETE sesudah pagar',
  bBatal.indexOf('FOR UPDATE OF p') > 0 && bBatal.indexOf('FOR UPDATE OF p') < bBatal.indexOf('FROM bba_aset WHERE id IN (${ids}) FOR UPDATE')
  && bBatal.indexOf('FROM bba_aset WHERE id IN (${ids}) FOR UPDATE') < bBatal.indexOf('FROM bba_rencana_aset ra')
  && bBatal.indexOf('FROM bba_aset WHERE id IN (${ids}) FOR UPDATE') < bBatal.indexOf('FROM bba_lokasi WHERE gedung_aset_id')
  && bBatal.indexOf('if (alasan.length) throw new AsetDitolakError(alasan);') < bBatal.indexOf('DELETE FROM bba_aset')
  && bBatal.includes('if (basi > 0) throw new AsetVersiError(basi);'))
const bIsi = badan(pen, 'isiRegister'), bKosong = badan(pen, 'kosongkanRegister')
ok('C2 isi & kosongkan register memakai pagar asal yang SAMA (alasanTakBisaUbahRegister) sebelum menulis',
  [bIsi, bKosong].every(b => b.indexOf('const tolak = alasanTakBisaUbahRegister(') > 0 && b.indexOf('if (tolak) throw new AsetDitolakError([tolak]);') < b.indexOf('UPDATE bba_aset')))
ok('C3 batalkan penghapusan menolak tanpa kewenangan Admin SEBELUM transaksi; route memeriksa bolehBatalkanFinal',
  badan(pen, 'batalHapus').indexOf("if (!bolehAdmin) throw new AsetDitolakError(['Membatalkan penghapusan hanya oleh Admin.']);") < badan(pen, 'batalHapus').indexOf('withTransaction')
  && tanpaKomentar(sumber('app/api/buku-besar-aset/aset/batal-hapus/route.ts')).includes('if (!bolehBatalkanFinal(g.session.role))'))
const rute = ['batal-tempatkan', 'batal-hapus', 'register', 'hapus'].map(r => tanpaKomentar(sumber(`app/api/buku-besar-aset/aset/${r}/route.ts`)))
ok('C4 tiap handler tulis koreksi memeriksa izin EDIT bagian Aset',
  rute.every(r => (r.match(/export async function (POST|PATCH|DELETE)/g) ?? []).length === (r.match(/tolakKecualiEdit\(g\.session, 'aset'\)/g) ?? []).length))
const aSql = tanpaKomentar(sumber('lib/data/bba-aset.ts'))
ok('C5 saringan & hitungan "belum teregister" cermin aturan murni (lahir dari penerimaan, tanpa kode)',
  aSql.includes("if (f.tanda === 'BELUM_TEREGISTER') w = sql`${w} AND a.penerimaan_id IS NOT NULL AND a.kode_barang IS NULL`;")
  && aSql.includes("SUM(status = 'AKTIF' AND penerimaan_id IS NOT NULL AND kode_barang IS NULL)"))
const kartu = tanpaKomentar(sumber('app/(dashboard)/buku-besar-aset/_components/KartuAset.tsx'))
ok('C6 kartu aset: tombol register hanya untuk catatan lahir di PRIMA, batalkan penempatan hanya belum teregister, batalkan penghapusan hanya Admin',
  kartu.includes("{lahirDiPrima(a) && <PrimaButton variant=\"primary\" size=\"sm\" onClick={() => setAksi('register')}>")
  && kartu.includes("{belumTeregister(a) && <PrimaButton variant=\"danger\"")
  && kartu.includes("{bolehAdmin && <PrimaButton variant=\"warning\""))
ok('C7 migrasi + skema acuan memuat BATAL_HAPUS; jenis audit baru digolongkan retensinya',
  sumber('docs/migrations/migration-bba-koreksi.sql').includes("'HAPUS','BATAL_HAPUS')") && sumber('docs/schema-mysql.sql').includes("'REHAB','HAPUS','BATAL_HAPUS') NOT NULL")
  && /BBA_ASET_BATAL_TEMPATKAN: P, BBA_ASET_BATAL_HAPUS: P/.test(sumber('lib/security/retensi-audit.ts')))

console.log('\nD. MySQL sungguhan (kotak pasir 2079)')
const TAHUN = 2079
const UJI = 'UJIF'
let c: mysql.Connection | null = null
try {
  c = await mysql.createConnection({
    host: process.env.MYSQL_HOST, port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER, password: process.env.MYSQL_PASSWORD, database: process.env.MYSQL_DATABASE,
  })
} catch (e) { console.log(`DILEWATI bagian DB: MySQL tidak bisa dihubungi (${(e as { code?: string }).code ?? e})`) }
if (c) {
  const k = c
  const bersih = async () => {
    await k.query('DELETE FROM bba_rencana_aset WHERE rencana_id IN (SELECT id FROM buku_besar_aset WHERE tahun_anggaran = ?)', [TAHUN])
    await k.query("UPDATE bba_lokasi SET gedung_aset_id = NULL WHERE nama LIKE 'UJIF%'")
    await k.query(`DELETE FROM bba_aset WHERE nama_resmi LIKE 'UJIF%' OR kunci_impor LIKE 'UJIF%' OR penerimaan_id IN
      (SELECT p.id FROM bba_penerimaan p JOIN buku_besar_aset b ON b.id = p.rencana_id WHERE b.tahun_anggaran = ?)`, [TAHUN])
    await k.query('DELETE p FROM bba_penerimaan p JOIN buku_besar_aset b ON b.id = p.rencana_id WHERE b.tahun_anggaran = ?', [TAHUN])
    await k.query('DELETE FROM buku_besar_aset WHERE tahun_anggaran = ?', [TAHUN])
    await k.query("DELETE FROM bba_barang WHERE nama LIKE 'UJIF%'")
    await k.query("DELETE FROM bba_lokasi WHERE nama LIKE 'UJIF%'")
  }
  await bersih()
  const D = await import('../lib/data/buku-besar-aset')
  const PEN = await import('../lib/data/bba-penerimaan')
  const A = await import('../lib/data/bba-aset')
  const [u] = await k.query('SELECT id FROM users ORDER BY id LIMIT 1') as [Array<{ id: number }>, unknown]
  const userId = Number(u[0]?.id ?? 0)
  const satu = async <T,>(q: string, p: unknown[] = []) => ((await k.query(q, p)) as [T[], unknown])[0][0]
  const banyak = async <T,>(q: string, p: unknown[] = []) => ((await k.query(q, p)) as [T[], unknown])[0]
  const versi = async (id: number) => Number((await satu<{ version: number }>('SELECT version FROM buku_besar_aset WHERE id = ?', [id]))?.version)
  const versiAset = async (id: number) => Number((await satu<{ version: number }>('SELECT version FROM bba_aset WHERE id = ?', [id]))?.version)
  const n = async (q: string, p: unknown[] = []) => Number((await satu<{ n: number }>(q, p))?.n ?? 0)
  const asetBaru = async (o: Record<string, unknown>) => {
    const kolom = Object.keys(o)
    const [r] = await k.query(`INSERT INTO bba_aset (${kolom.join(', ')}) VALUES (?)`, [kolom.map(x => o[x])]) as [{ insertId: number }, unknown]
    return r.insertId
  }
  /** Rencana 2079 didanai + satu penerimaan `vol` unit; dipulangkan id rencana & penerimaan. */
  const beli = async (uraian: string, vol: number, harga: number, extra: Record<string, unknown> = {}) => {
    const r = await D.createAset({ tahun_anggaran: TAHUN, uraian: `${UJI} ${uraian}`, sumber_anggaran: 'BLUD', vol, harga, satuan: 'unit', ...extra }, userId)
    await D.tandaiAnggaran({ anggaran: 'DIDANAI', item: [{ id: r.id, expected_version: await versi(r.id) }] }, userId)
    await PEN.catatPenerimaan({ rencana_id: r.id, expected_version: await versi(r.id), tgl: '2026-05-14', vol, harga_satuan: harga }, userId)
    const p = Number((await satu<{ id: number }>('SELECT id FROM bba_penerimaan WHERE rencana_id = ? ORDER BY id DESC LIMIT 1', [r.id]))?.id)
    return { rencana: r, pen: p }
  }
  const tempat = async (pen: number, jumlah: number, golongan: 'B' | 'C' | 'E', nama = `${UJI} KURSI RODA`) => {
    await PEN.tempatkan({ penerimaan_id: pen, jumlah, golongan, nama_resmi: nama, kondisi: 'B' }, userId)
    return (await banyak<{ id: number }>('SELECT id FROM bba_aset WHERE penerimaan_id = ? ORDER BY id', [pen])).map(x => Number(x.id))
  }
  const item = async (ids: number[]) => Promise.all(ids.map(async id => ({ id, expected_version: await versiAset(id) })))
  const sisaAntrean = async (pen: number) => (await PEN.antreanBukuAset()).terima.find(x => x.penerimaan_id === pen)?.sisa ?? 0
  try {
    const [lok] = await k.query("INSERT INTO bba_lokasi (nama) VALUES ('UJIF Ruang Uji')") as [{ insertId: number }, unknown]
    const b1 = await beli('Kursi roda', 3, 3_900_000)
    const salah = await tempat(b1.pen, 3, 'C')
    const dariBerkas = await asetBaru({ golongan: 'B', kode_barang: 'UJIF.01.2016-1.3.2.05.02', register: '000001', kunci_impor: 'UJIF.01.2016-1.3.2.05.02|000001', tahun_perolehan: 2016, nama_resmi: 'UJIF KURSI LAMA', kib: '{}', harga: 1 })
    ok('D0 tiga unit salah golongan ditempatkan; antrean penerimaan habis', salah.length === 3 && await sisaAntrean(b1.pen) === 0)

    const basi = await coba(async () => PEN.batalTempatkan({ item: [{ id: salah[0], expected_version: (await versiAset(salah[0])) - 1 }], alasan: 'salah golongan' }))
    const campur = await coba(async () => PEN.batalTempatkan({ item: await item([salah[0], dariBerkas]), alasan: 'salah golongan' }))
    ok('D1 angka kunci basi → 409; kiriman bercampur aset dari berkas → seluruhnya ditolak dengan alasan; tidak ada yang terbuang',
      basi instanceof A.AsetVersiError && campur instanceof A.AsetDitolakError && /berkas KIB/.test(campur.message)
      && await n('SELECT COUNT(*) AS n FROM bba_aset WHERE id IN (?)', [[...salah, dariBerkas]]) === 4)

    const h1 = await PEN.batalTempatkan({ item: await item([salah[0]]), alasan: 'salah golongan, seharusnya KIB B' })
    ok('D2 batalkan satu dari tiga: barisnya & riwayatnya dibuang, satu unit kembali ke antrean, rincian menyebut rencananya',
      h1.dibatalkan === 1 && await n('SELECT COUNT(*) AS n FROM bba_aset WHERE id = ?', [salah[0]]) === 0
      && await n('SELECT COUNT(*) AS n FROM bba_aset_riwayat WHERE aset_id = ?', [salah[0]]) === 0
      && await sisaAntrean(b1.pen) === 1 && h1.rincian.includes(b1.rencana.canonical_id) && h1.rincian.includes('KIB C'), h1.rincian)
    const masihAda = await coba(() => PEN.hapusPenerimaan(b1.pen, userId, true))
    await PEN.batalTempatkan({ item: await item(salah.slice(1)), alasan: 'salah golongan, seharusnya KIB B' })
    const benar = await tempat(b1.pen, 3, 'B')
    ok('D3 penerimaan tetap terkunci selama masih ada register; sesudah semua dibatalkan, tiga unit bisa ditempatkan ulang dengan golongan benar',
      masihAda instanceof PEN.PenerimaanDitolakError && benar.length === 3 && (await banyak<{ golongan: string }>('SELECT golongan FROM bba_aset WHERE id IN (?)', [benar])).every(x => x.golongan === 'B'))

    // Rujukan: jadi aset sasaran rencana lain / jadi gedung sebuah ruangan.
    const pelihara = await D.createAset({ tahun_anggaran: TAHUN, uraian: `${UJI} Servis kursi roda`, sumber_anggaran: 'BLUD', vol: 1, harga: 1, jenis_rencana: 'PEMELIHARAAN', aset_sasaran: [benar[0]] }, userId)
    const tolakSasaran = await coba(async () => PEN.batalTempatkan({ item: await item([benar[0]]), alasan: 'uji rujukan' }))
    const b2 = await beli('Gedung', 1, 500_000_000)
    const [gd] = await tempat(b2.pen, 1, 'C', `${UJI} GEDUNG`)
    await D.updateLokasi({ id: lok.insertId, gedung_aset_id: gd })
    const tolakGedung = await coba(async () => PEN.batalTempatkan({ item: await item([gd]), alasan: 'uji rujukan' }))
    ok('D4 register yang jadi aset sasaran rencana / gedung ruangan ditolak dengan nama rencana & ruangannya',
      tolakSasaran instanceof A.AsetDitolakError && tolakSasaran.message.includes(pelihara.canonical_id)
      && tolakGedung instanceof A.AsetDitolakError && /gedung ruangan UJIF Ruang Uji/.test(tolakGedung.message)
      && await n('SELECT COUNT(*) AS n FROM bba_aset WHERE id IN (?)', [[benar[0], gd]]) === 2,
      `${tolakSasaran instanceof Error ? tolakSasaran.message : ''} | ${tolakGedung instanceof Error ? tolakGedung.message : ''}`)

    // Register: isi → betulkan → kosongkan.
    const unit = benar[1]
    await PEN.isiRegister({ id: unit, expected_version: await versiAset(unit), kode_barang: 'UJIF.01.2026-1.3.2.05.02', register: '123' }, userId)
    const tolakTeregister = await coba(async () => PEN.batalTempatkan({ item: await item([unit]), alasan: 'uji teregister' }))
    const vSama = await versiAset(unit)
    const sama = await PEN.isiRegister({ id: unit, expected_version: vSama, kode_barang: 'UJIF.01.2026-1.3.2.05.02', register: '000123' }, userId)
    ok('D5 teregister → batalkan penempatan ditolak; isi register yang SAMA tidak menulis apa pun',
      tolakTeregister instanceof A.AsetDitolakError && /sudah teregister \(000123\)/.test(tolakTeregister.message)
      && sama.sebelum === 'UJIF.01.2026-1.3.2.05.02|000123' && await versiAset(unit) === vSama
      && await n("SELECT COUNT(*) AS n FROM bba_aset_riwayat WHERE aset_id = ? AND jenis = 'REGISTER'", [unit]) === 1)
    const betul = await PEN.isiRegister({ id: unit, expected_version: await versiAset(unit), kode_barang: 'UJIF.01.2016-1.3.2.05.02', register: '132' }, userId)
    const tahunKode = await satu<{ tahun_perolehan: number }>('SELECT tahun_perolehan FROM bba_aset WHERE id = ?', [unit])
    await PEN.isiRegister({ id: unit, expected_version: await versiAset(unit), kode_barang: '1.3.2.05.02.06.002', register: '132' }, userId)
    const sesudah = await satu<{ kunci_impor: string; tahun_perolehan: number }>('SELECT kunci_impor, tahun_perolehan FROM bba_aset WHERE id = ?', [unit])
    ok('D6 betulkan register: kunci impor ikut, register lama tercatat; kode tanpa ruas tahun → tahun kembali ke tahun DITERIMA (bukan tahun salah ketik)',
      betul.sebelum === 'UJIF.01.2026-1.3.2.05.02|000123' && betul.kunci_impor === 'UJIF.01.2016-1.3.2.05.02|000132' && tahunKode.tahun_perolehan === 2016
      && sesudah.kunci_impor === '1.3.2.05.02.06.002|000132' && sesudah.tahun_perolehan === 2026
      && await n("SELECT COUNT(*) AS n FROM bba_aset_riwayat WHERE aset_id = ? AND jenis = 'REGISTER'", [unit]) === 3, JSON.stringify({ tahunKode, sesudah }))
    await PEN.isiRegister({ id: unit, expected_version: await versiAset(unit), kode_barang: 'UJIF.01.2016-1.3.2.05.02', register: '132' }, userId)
    const ks = await PEN.kosongkanRegister({ id: unit, expected_version: await versiAset(unit), kosongkan: true }, userId)
    const kosong = await satu<{ kode_barang: string | null; register: string | null; kunci_impor: string | null; kode_objek: string | null; tahun_perolehan: number }>(
      'SELECT kode_barang, register, kunci_impor, kode_objek, tahun_perolehan FROM bba_aset WHERE id = ?', [unit])
    const vKosong = await versiAset(unit)
    await PEN.kosongkanRegister({ id: unit, expected_version: vKosong, kosongkan: true }, userId)
    ok('D7 kosongkan register: kembali belum teregister (kode, register, kunci, kode objek kosong; tahun = tahun diterima), riwayat REGISTER; kosongkan lagi tidak menulis',
      ks.sebelum === 'UJIF.01.2016-1.3.2.05.02|000132' && kosong.kode_barang === null && kosong.register === null && kosong.kunci_impor === null
      && kosong.kode_objek === null && kosong.tahun_perolehan === 2026 && await versiAset(unit) === vKosong
      && (await A.daftarAset({ tanda: 'BELUM_TEREGISTER', q: UJI, golongan: 'B' })).ringkas.jumlah === 3, JSON.stringify(kosong))

    // Aset dari berkas: kunci impornya milik berkas — termasuk KIB F tanpa kode.
    const kibF = await asetBaru({ golongan: 'F', kunci_impor: 'f|ujif gedung baru|jl. uji|2025-01-01', tahun_perolehan: 2025, nama_resmi: 'UJIF GEDUNG BARU', kib: '{}', harga: 1 })
    const vF = await versiAset(kibF)
    const isiF = await coba(() => PEN.isiRegister({ id: kibF, expected_version: vF, kode_barang: 'UJIF.01.2025-1.3.6.01.01', register: '1' }, userId))
    const kosongBerkas = await coba(async () => PEN.kosongkanRegister({ id: dariBerkas, expected_version: await versiAset(dariBerkas), kosongkan: true }, userId))
    ok('D8 aset dari berkas KIB: isi register (KIB F tanpa kode) & kosongkan ditolak, kunci impornya tetap; tidak terhitung "belum teregister"',
      isiF instanceof A.AsetDitolakError && /Impor KIB ulang/.test(isiF.message) && kosongBerkas instanceof A.AsetDitolakError
      && (await satu<{ kunci_impor: string }>('SELECT kunci_impor FROM bba_aset WHERE id = ?', [kibF]))?.kunci_impor === 'f|ujif gedung baru|jl. uji|2025-01-01'
      && await versiAset(kibF) === vF && !(await A.daftarAset({ tanda: 'BELUM_TEREGISTER', q: UJI, golongan: 'F' })).kelompok.length)

    // Impor: register isian PRIMA salah ketik (000123), berkas provinsi membawa 000132.
    await PEN.isiRegister({ id: unit, expected_version: await versiAset(unit), kode_barang: 'UJIF.01.2026-1.3.2.05.02', register: '123' }, userId)
    await k.query('UPDATE bba_aset SET lokasi_id = ? WHERE id = ?', [lok.insertId, unit])
    const berkas = { aset: [{ golongan: 'B', lembar: 'KIBB', baris: 9, kunci: 'UJIF.01.2026-1.3.2.05.02|000132', kode_barang: 'UJIF.01.2026-1.3.2.05.02', register: '000132',
      kode_objek: '1.3.2.05.02', tahun_perolehan: 2026, nama_resmi: 'UJIF KURSI RODA', harga: 3_900_000, asal_usul: 'Pembelian', keterangan: null, kondisi: 'B', kib: {} } satisfies AsetBaca],
      lembar: [], masalah: [], peringatan: [], kop: null } as unknown as HasilBacaKib
    const pra = await A.pratinjauImpor(berkas)
    const gB = pra.perGolongan.find(g => g.golongan === 'B')!
    const dugaan = pra.calon.find(x => x.register === '000123')
    // Dua unit sejenis lain masih belum teregister — nomor dari berkas akan dipasangkan ke salah satunya; dugaannya tetap disebut.
    ok('D9 pratinjau impor: dugaan salah ketik disebut (PRIMA 000123 ↔ berkas 000132, beserta ruangannya) walau nomornya akan mengisi unit belum teregister lain',
      !!dugaan && dugaan.pilihan.map(b => b.register).join() === '000132' && !!dugaan.pilihan[0].mengisi && dugaan.ruangan === 'UJIF Ruang Uji'
      && gB.cocok === 1 && pra.contohCocok.some(x => x.register === '000132'),
      JSON.stringify({ calon: pra.calon, gB }))
    await PEN.isiRegister({ id: unit, expected_version: await versiAset(unit), kode_barang: 'UJIF.01.2026-1.3.2.05.02', register: '132' }, userId)
    const pra2 = await A.pratinjauImpor(berkas)
    ok('D10 sesudah registernya dibetulkan di kartu aset, impor ulang cocok (sama), tidak ada dugaan & tidak ada baris baru',
      !pra2.calon.some(x => x.register === '000123') && pra2.perGolongan.find(g => g.golongan === 'B')!.baru === 0, JSON.stringify(pra2.perGolongan))

    // Hapus dengan SK → betulkan SK → batalkan penghapusan.
    const lamaGanti = await asetBaru({ golongan: 'B', kode_barang: 'UJIF.01.2016-1.3.2.05.02', register: '000002', kunci_impor: 'UJIF.01.2016-1.3.2.05.02|000002', tahun_perolehan: 2016, nama_resmi: 'UJIF KURSI LAMA', kib: '{}', harga: 1, kondisi: 'RB', kondisi_sumber: 'CEK' })
    await beli('Kursi roda pengganti', 1, 3_900_000, { jenis_rencana: 'PENGGANTIAN', aset_sasaran: [lamaGanti] })
    const siapAwal = (await satu<{ siap_dihapus: number }>('SELECT siap_dihapus FROM bba_aset WHERE id = ?', [lamaGanti]))?.siap_dihapus
    const skAktif = await coba(async () => PEN.betulkanSk({ id: dariBerkas, expected_version: await versiAset(dariBerkas), sk_nomor: '1', sk_tgl: '2026-10-01' }, userId))
    await PEN.hapusAset({ id: lamaGanti, expected_version: await versiAset(lamaGanti), sk_nomor: '028/12/2026', sk_tgl: '2026-10-01' }, userId)
    const skDepan = await coba(async () => PEN.betulkanSk({ id: lamaGanti, expected_version: await versiAset(lamaGanti), sk_nomor: '028/21/2026', sk_tgl: '2099-01-01' }, userId))
    const bs = await PEN.betulkanSk({ id: lamaGanti, expected_version: await versiAset(lamaGanti), sk_nomor: '028/21/2026', sk_tgl: '2026-10-02', catatan: 'salah ketik nomor' }, userId)
    const sk = await satu<{ status: string; hapus_sk_nomor: string; hapus_sk_tgl: string }>("SELECT status, hapus_sk_nomor, DATE_FORMAT(hapus_sk_tgl, '%Y-%m-%d') AS hapus_sk_tgl FROM bba_aset WHERE id = ?", [lamaGanti])
    ok('D11 betulkan SK: aset aktif ditolak, tanggal di depan ditolak; nomor & tanggal dibetulkan, tetap DIHAPUS, SK lama di riwayat',
      siapAwal === 1 && skAktif instanceof A.AsetDitolakError && skDepan instanceof A.AsetDitolakError && bs.sebelum === 'SK 028/12/2026 tgl 2026-10-01'
      && sk.status === 'DIHAPUS' && sk.hapus_sk_nomor === '028/21/2026' && sk.hapus_sk_tgl === '2026-10-02'
      && await n("SELECT COUNT(*) AS n FROM bba_aset_riwayat WHERE aset_id = ? AND jenis = 'UBAH' AND catatan = 'salah ketik nomor'", [lamaGanti]) === 1, JSON.stringify(sk))
    const bukanAdmin = await coba(async () => PEN.batalHapus({ id: lamaGanti, expected_version: await versiAset(lamaGanti), alasan: 'salah pilih aset' }, userId, false))
    const basiHapus = await coba(async () => PEN.batalHapus({ id: lamaGanti, expected_version: (await versiAset(lamaGanti)) - 1, alasan: 'salah pilih aset' }, userId, true))
    const bh = await PEN.batalHapus({ id: lamaGanti, expected_version: await versiAset(lamaGanti), alasan: 'salah pilih aset' }, userId, true)
    const hidup = await satu<{ status: string; hapus_sk_nomor: string | null; hapus_sk_tgl: string | null; siap_dihapus: number }>('SELECT status, hapus_sk_nomor, hapus_sk_tgl, siap_dihapus FROM bba_aset WHERE id = ?', [lamaGanti])
    const rw = await satu<{ catatan: string; sebelum: string | Record<string, unknown> }>("SELECT catatan, sebelum FROM bba_aset_riwayat WHERE aset_id = ? AND jenis = 'BATAL_HAPUS'", [lamaGanti])
    const seb = typeof rw?.sebelum === 'string' ? JSON.parse(rw.sebelum) : rw?.sebelum
    ok('D12 batalkan penghapusan: bukan Admin & angka kunci basi ditolak; Admin → AKTIF, SK dikosongkan, siap dihapus DIHITUNG ULANG (penggantinya sudah diterima penuh), riwayat BATAL_HAPUS menyimpan SK & alasan',
      bukanAdmin instanceof A.AsetDitolakError && basiHapus instanceof A.AsetVersiError && bh.sk === '028/21/2026 tgl 2026-10-02'
      && hidup.status === 'AKTIF' && hidup.hapus_sk_nomor === null && hidup.hapus_sk_tgl === null && hidup.siap_dihapus === 1
      && rw?.catatan === 'salah pilih aset' && seb?.sk === '028/21/2026', JSON.stringify({ hidup, rw }))
    await PEN.hapusAset({ id: dariBerkas, expected_version: await versiAset(dariBerkas), sk_nomor: '028/30/2026', sk_tgl: '2026-10-03' }, userId)
    await PEN.batalHapus({ id: dariBerkas, expected_version: await versiAset(dariBerkas), alasan: 'salah pilih aset' }, userId, true)
    const aktifLagi = await coba(async () => PEN.batalHapus({ id: dariBerkas, expected_version: await versiAset(dariBerkas), alasan: 'salah pilih aset' }, userId, true))
    ok('D13 tanpa rencana penggantian → siap dihapus tetap 0; aset aktif tidak bisa "dibatalkan penghapusannya" lagi',
      (await satu<{ siap_dihapus: number }>('SELECT siap_dihapus FROM bba_aset WHERE id = ?', [dariBerkas]))?.siap_dihapus === 0 && aktifLagi instanceof A.AsetDitolakError)
  } finally {
    await bersih()
    const sisa = await satu<{ a: number; p: number; s: number }>(`SELECT (SELECT COUNT(*) FROM buku_besar_aset WHERE tahun_anggaran = ?) AS a,
      (SELECT COUNT(*) FROM bba_penerimaan p JOIN buku_besar_aset b ON b.id = p.rencana_id WHERE b.tahun_anggaran = ?) AS p,
      (SELECT COUNT(*) FROM bba_aset WHERE nama_resmi LIKE 'UJIF%' OR kunci_impor LIKE 'UJIF%') AS s`, [TAHUN, TAHUN])
    ok('D14 kotak pasir bersih kembali', Number(sisa.a) + Number(sisa.p) + Number(sisa.s) === 0, JSON.stringify(sisa))
    await k.end()
  }
}

console.log(`\n${lulus} lulus, ${gagal.length} gagal`)
if (gagal.length) { console.log(gagal.map(g => `  - ${g}`).join('\n')); process.exit(1) }
process.exit(0)
