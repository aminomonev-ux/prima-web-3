// scripts/test-renaksi-balapan.mts — kunci tahun Renaksi (RA_TAHUN) untuk jalur tulis lintas-baris.
// Jalankan: npx tsx --env-file=.env.local scripts/test-renaksi-balapan.mts   (MySQL kotak pasir 2070/2071)
//
// Impor, Simpan/Hapus Data Entry, dan Duplikasi Tahun membaca keadaan banyak baris lalu menulis berdasarkan
// itu. Tanpa satu antrean per tahun, impor bisa menautkan ke indikator yang sedang dihapus, menulis kegiatan
// di bawah program yang sedang diganti namanya, dan duplikasi bisa bercampur dengan impor ke tahun tujuan.
// Balapan diputar deterministik: koneksi uji memegang kunci tahun + menulis tanpa commit (meniru jalur lain
// yang sedang berjalan) sampai performance_schema.data_lock_waits melihat jalur yang diuji menunggu.

import { readFileSync } from 'node:fs'
import mysql from 'mysql2/promise'
import { sql, queryOne } from '../lib/data/db'
import {
  upsertRencanaAksi, deleteRencanaAksi, getRencanaAksiById, duplicateYear, updateBulanRealisasiBulk,
  RaTahunTujuanBerisiError, RA_TAHUN_ENTITY,
} from '../lib/data/rencana-aksi'
import { commitImportRenaksi, type CommitRow } from '../lib/renaksi/import-data'

const T = 2071, TUJUAN = 2070
let lulus = 0
const gagal: string[] = []
const ok = (n: string, s: unknown, k = '') => {
  if (s) { lulus++; console.log(`  ok  ${n}`) } else { gagal.push(n); console.log(`FAIL  ${n}${k ? ' — ' + k : ''}`) }
}
const tangkap = async <X,>(fn: () => Promise<X>): Promise<X | Error> => { try { return await fn() } catch (e) { return e as Error } }
const tanpaKomentar = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const bersih = async () => {
  for (const t of [T, TUJUAN]) {
    await sql`DELETE FROM rencana_aksi WHERE tahun = ${t}`
    await sql`DELETE FROM renaksi_ganti_nama WHERE tahun = ${t}`
    await sql`DELETE FROM system_settings WHERE \`key\` = ${`ra_lock_${t}`}`
    // L92: hapus kunci uji persis (entity + tahun kotak pasir), bukan seluruh entity.
    await sql`DELETE FROM blud_locks WHERE entity IN ('RA_TAHUN', 'RA_DUPLIKASI') AND key_id = ${String(t)}`
  }
}

await bersih()
const user = await queryOne<{ id: number }>(sql`SELECT id FROM users LIMIT 1`)
if (!user) { console.log('tidak ada user'); process.exit(1) }
const uid = Number(user.id)
const dasar = { tahun: T, jenis: 'Akumulatif' as const, satuan: '%', target_rpjmd: 1, target_tahunan: 1, q1_target: 0, q2_target: 0, q3_target: 0, q4_target: 1 }
const keg = (nama: string, indikator: string, program: string, induk: string | null): CommitRow => ({
  level: 'kegiatan', kode: null, nama, induk_tujuan: null, induk_sasaran: null, induk_program: program, induk_kegiatan: null,
  outcome: null, indikator, indikator_induk: induk, satuan: '%', jenis: 'Akumulatif', target_tahunan: 1, q: [0, 0, 0, 1], bulan: null, anggaran: null,
})

const k = await mysql.createConnection({
  host: process.env.MYSQL_HOST, port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER, password: process.env.MYSQL_PASSWORD, database: process.env.MYSQL_DATABASE,
})
const tungguMenunggu = async () => {
  for (let i = 0; i < 60; i++) {
    const [r] = await k.query('SELECT COUNT(*) AS n FROM performance_schema.data_lock_waits') as unknown as [Array<{ n: number }>]
    if (Number(r[0]?.n ?? 0) > 0) return true
    await new Promise(res => setTimeout(res, 50))
  }
  return false
}
/** Meniru jalur tulis lain yang sedang berjalan: kunci tahun (sesudah perbaikan, semua jalur memegangnya). */
const pegangTahun = async (tahun: number) => {
  await k.query('START TRANSACTION')
  await k.query('INSERT IGNORE INTO blud_locks (entity, key_id, version) VALUES (?, ?, 0)', ['RA_TAHUN', String(tahun)])
  await k.query('SELECT version FROM blud_locks WHERE entity = ? AND key_id = ? FOR UPDATE', ['RA_TAHUN', String(tahun)])
}

try {
  await upsertRencanaAksi({ ...dasar, level: 'tujuan', program: 'TUJ R', indikator: 'IT R' }, uid)
  await upsertRencanaAksi({ ...dasar, level: 'sasaran', program: 'SAS R', tujuan: 'TUJ R', indikator: 'IS R' }, uid)
  const r1 = await upsertRencanaAksi({ ...dasar, level: 'program', program: 'PROG R', sasaran: 'SAS R', indikator: 'IP R1' }, uid)
  await upsertRencanaAksi({ ...dasar, level: 'program', program: 'PROG R', sasaran: 'SAS R', indikator: 'IP R2' }, uid)
  await upsertRencanaAksi({ ...dasar, level: 'program', program: 'PROG S', sasaran: 'SAS R', indikator: 'IP S1' }, uid)

  // ── A. impor × hapus induk ────────────────────────────────────────────────────
  console.log('\nA. Impor menautkan ke indikator yang sedang dihapus')
  await pegangTahun(T)
  await k.query('DELETE FROM rencana_aksi WHERE id = ?', [r1])
  const impor1 = tangkap(() => commitImportRenaksi(T, 'upsert', [keg('KEG R', 'IK R', 'PROG R', 'IP R1')], uid))
  const tunggu1 = await tungguMenunggu()
  await k.query('COMMIT')
  const h1 = await impor1
  ok('A1 impor menunggu jalur tulis lain di tahun itu', tunggu1)
  const yatim = await queryOne<{ n: number }>(sql`SELECT COUNT(*) AS n FROM rencana_aksi WHERE tahun = ${T} AND induk_indikator_id = ${r1}`)
  ok('A2 tidak ada tautan ke indikator yang terhapus', Number(yatim?.n ?? 0) === 0, `yatim=${yatim?.n}`)
  ok('A3 teks induk yang hilang disebut "tak dikenal"', !(h1 instanceof Error) && h1.tautanTakDikenal.includes('IK R'),
    h1 instanceof Error ? h1.message : JSON.stringify(h1.tautanTakDikenal))

  // ── B. impor × ganti nama program ─────────────────────────────────────────────
  console.log('\nB. Impor menulis kegiatan di bawah program yang sedang diganti namanya')
  await pegangTahun(T)
  await k.query("UPDATE rencana_aksi SET program = 'PROG S2' WHERE tahun = ? AND program = 'PROG S'", [T])
  const impor2 = tangkap(() => commitImportRenaksi(T, 'upsert', [keg('KEG S', 'IK S', 'PROG S', null)], uid))
  const tunggu2 = await tungguMenunggu()
  await k.query('COMMIT')
  const h2 = await impor2
  ok('B1 impor menunggu', tunggu2)
  const kegYatim = await queryOne<{ n: number }>(sql`SELECT COUNT(*) AS n FROM rencana_aksi WHERE tahun = ${T} AND level = 'kegiatan' AND program = 'PROG S'`)
  ok('B2 tidak ada kegiatan di bawah nama program yang sudah tiada', Number(kegYatim?.n ?? 0) === 0, `n=${kegYatim?.n}`)
  ok('B3 barisnya ditahan (induk tidak ada), bukan ditulis', !(h2 instanceof Error) && h2.disimpan === 0 && h2.ditahan.length === 1,
    h2 instanceof Error ? h2.message : JSON.stringify({ disimpan: h2.disimpan, ditahan: h2.ditahan.length }))

  // ── C. duplikasi × impor ke tahun tujuan ───────────────────────────────────────
  console.log('\nC. Duplikasi Tahun ke tahun yang sedang diisi impor')
  await pegangTahun(TUJUAN)
  await k.query("INSERT INTO rencana_aksi (tahun, level, program, indikator) VALUES (?, 'tujuan', 'TUJ IMPOR', 'IT IMPOR')", [TUJUAN])
  const dup = tangkap(() => duplicateYear(T, TUJUAN, uid))
  const tunggu3 = await tungguMenunggu()
  await k.query('COMMIT')
  const h3 = await dup
  ok('C1 duplikasi menunggu', tunggu3)
  ok('C2 lalu menolak karena tahun tujuan sudah berisi', h3 instanceof RaTahunTujuanBerisiError, String(h3))
  const isiTujuan = await queryOne<{ n: number }>(sql`SELECT COUNT(*) AS n FROM rencana_aksi WHERE tahun = ${TUJUAN}`)
  ok('C3 tahun tujuan tidak bercampur', Number(isiTujuan?.n ?? 0) === 1, `n=${isiTujuan?.n}`)

  // ── D. Simpan & Hapus Data Entry ikut antre ──────────────────────────────────
  console.log('\nD. Simpan & Hapus Data Entry ikut kunci tahun')
  await pegangTahun(T)
  const simpan = tangkap(() => upsertRencanaAksi({ ...dasar, level: 'program', program: 'PROG R', sasaran: 'SAS R', indikator: 'IP R3' }, uid))
  const tunggu4 = await tungguMenunggu()
  await k.query('COMMIT')
  ok('D1 Simpan baris baru menunggu kunci tahun', tunggu4 && typeof (await simpan) === 'number')
  const r3 = await queryOne<{ id: number }>(sql`SELECT id FROM rencana_aksi WHERE tahun = ${T} AND indikator = 'IP R3'`)
  await pegangTahun(T)
  const ubah = tangkap(() => upsertRencanaAksi({ ...dasar, id: Number(r3!.id), level: 'program', program: 'PROG R', sasaran: 'SAS R', indikator: 'IP R3', target_tahunan: 5 }, uid))
  const tunggu5 = await tungguMenunggu()
  await k.query('COMMIT')
  ok('D2 Simpan baris yang ada menunggu kunci tahun', tunggu5 && typeof (await ubah) === 'number')
  await pegangTahun(T)
  const hapus = tangkap(async () => deleteRencanaAksi((await getRencanaAksiById(Number(r3!.id)))!))
  const tunggu6 = await tungguMenunggu()
  await k.query('COMMIT')
  ok('D3 Hapus menunggu kunci tahun', tunggu6 && !((await hapus) instanceof Error))

  // ── F. dua ganti nama berbarengan atas dua indikator satu kegiatan ─────────────
  console.log('\nF. Ganti nama dari dua tab (penjalar menaikkan versi saudara)')
  const fa = await upsertRencanaAksi({ ...dasar, level: 'kegiatan', program: 'PROG R', kegiatan: 'KEG F', indikator: 'IK FA' }, uid)
  const fb = await upsertRencanaAksi({ ...dasar, level: 'kegiatan', program: 'PROG R', kegiatan: 'KEG F', indikator: 'IK FB' }, uid)
  const versiB = Number((await getRencanaAksiById(fb))!.version)
  const versiA = Number((await getRencanaAksiById(fa))!.version)
  await upsertRencanaAksi({ ...dasar, id: fa, expected_version: versiA, level: 'kegiatan', program: 'PROG R', kegiatan: 'KEG F1', indikator: 'IK FA' }, uid)
  const ganti2 = await tangkap(() => upsertRencanaAksi({ ...dasar, id: fb, expected_version: versiB, level: 'kegiatan', program: 'PROG R', kegiatan: 'KEG F2', indikator: 'IK FB' }, uid))
  const namaF = (await sql`SELECT DISTINCT kegiatan FROM rencana_aksi WHERE tahun = ${T} AND id IN (${fa}, ${fb})`) as unknown as Array<{ kegiatan: string }>
  ok('F1 ganti nama kedua dari tab basi ditolak versi (409), bukan membelah entitas',
    ganti2 instanceof Error && ganti2.name === 'RaVersionConflictError', String(ganti2))
  ok('F2 kedua indikator tetap satu nama', namaF.length === 1 && namaF[0].kegiatan === 'KEG F1', JSON.stringify(namaF))

  // ── G. Matriks Bulanan × impor: tidak saling kunci ──────────────────────────────
  // Simpan massal Matriks Bulanan sengaja PER BARIS (autocommit), bukan satu transaksi: selama menunggu
  // ia tidak memegang kunci apa pun, jadi tidak bisa saling kunci dengan impor yang memegang banyak baris.
  // Kalau suatu hari dibungkus satu transaksi, urutan di bawah ini jadi deadlock dan uji ini gagal.
  console.log('\nG. Matriks Bulanan berbarengan dengan impor')
  const subBaru = (n: string) => upsertRencanaAksi({ ...dasar, level: 'sub-kegiatan', program: 'PROG R', kegiatan: 'KEG F1', sub_kegiatan: `SUB ${n}`, indikator: `IS ${n}` }, uid)
  const ga = await subBaru('GA'), gb = await subBaru('GB')
  const [va, vb] = [Number((await getRencanaAksiById(ga))!.version), Number((await getRencanaAksiById(gb))!.version)]
  const bulan = [1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0]
  await k.query('START TRANSACTION')
  await k.query('UPDATE rencana_aksi SET updated_at = updated_at WHERE id = ?', [gb])
  const massal = tangkap(() => updateBulanRealisasiBulk([
    { id: ga, bulan_realisasi: bulan, expected_version: va },
    { id: gb, bulan_realisasi: bulan, expected_version: vb },
  ], uid))
  const tunggu7 = await tungguMenunggu()
  const lawan = await tangkap(() => k.query('UPDATE rencana_aksi SET updated_at = updated_at WHERE id = ?', [ga]))
  await k.query('COMMIT')
  const hm = await massal
  ok('G1 simpan massal menunggu baris yang dipegang impor', tunggu7)
  ok('G2 pemegang kunci lain tetap bisa menulis baris yang sudah disimpan massal (tidak saling kunci)',
    !(lawan instanceof Error), lawan instanceof Error ? lawan.message : '')
  ok('G3 simpan massal selesai untuk kedua baris', !(hm instanceof Error) && hm.saved === 2,
    hm instanceof Error ? hm.message : JSON.stringify(hm))

  // ── E. sambungan ──────────────────────────────────────────────────────────────
  console.log('\nE. Kunci tahun = perintah pertama tiap jalur')
  const data = tanpaKomentar(readFileSync(new URL('../lib/data/rencana-aksi.ts', import.meta.url), 'utf8'))
  ok('E1 entity RA_TAHUN', RA_TAHUN_ENTITY === 'RA_TAHUN')
  ok('E2 Simpan baris yang ada: kunci tahun pertama', /await withTransaction\(async \(\{ tx, conn \}\) => \{\s*await kunciTahunRenaksi\(tx, Number\(lama\.tahun\)\);\s*await assertIndukIndikator\(tx, data\);/.test(data))
  ok('E3 Simpan baris baru: kunci tahun pertama', /withTransaction\(async \(\{ tx, conn \}\) => \{\s*await kunciTahunRenaksi\(tx, data\.tahun\);\s*await assertIndukIndikator\(tx, data\);\s*const paguSebelum = [^;]*potretPaguRenaksi\(tx, data\.tahun\) : null;\s*const res = await tx`/.test(data))
  ok('E4 Hapus: kunci tahun pertama', /return withTransaction\(async \(\{ tx \}\) => \{\s*await kunciTahunRenaksi\(tx, Number\(row\.tahun\)\);\s*await kunciSeNama\(tx, row\);/.test(data))
  ok('E5 Duplikasi: kunci tahun tujuan sesudah RA_DUPLIKASI, sebelum COUNT', /acquireBludLock\(tx, 'RA_DUPLIKASI', String\(toTahun\)\);\s*await kunciTahunRenaksi\(tx, toTahun\);/.test(data))
  const imp = tanpaKomentar(readFileSync(new URL('../lib/renaksi/import-data.ts', import.meta.url), 'utf8'))
  const commitFn = imp.slice(imp.indexOf('export async function commitImportRenaksi('))
  ok('E6 Impor: kunci tahun pertama, lalu rencana dibaca ulang lewat tx', /withTransaction\(async \(\{ tx, conn \}\) => \{\s*await kunciTahunRenaksi\(tx, tahun\);\s*const paguSebelum = await potretPaguRenaksi\(tx, tahun\);\s*const siap = await siapkanImpor\(tahun, mode, rows, tx\);/.test(commitFn))
  ok('E7 Impor tidak lagi membaca rencana di luar transaksi', !/await siapkanImpor\(tahun, mode, rows\);/.test(commitFn))
} finally {
  await k.query('ROLLBACK').catch(() => {})
  await k.end()
  await bersih()
}

console.log(`\n${lulus} lulus, ${gagal.length} gagal`)
if (gagal.length) { console.log(gagal.map(g => `  - ${g}`).join('\n')); process.exit(1) }
process.exit(0)
