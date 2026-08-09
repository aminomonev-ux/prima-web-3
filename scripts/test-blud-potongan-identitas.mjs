// Uji regresi B1 — identitas baris potongan bertahan saat transaksi disunting.
//   node scripts/test-blud-potongan-identitas.mjs
//
// MENYENTUH DB, seluruhnya di TAHUN KOTAK PASIR 2099 dan dihapus di `finally`:
//   dpa_blud · blud_realisasi_tx (+ alokasi & potongan lewat CASCADE) ·
//   blud_bukti_setor (+ baris lewat CASCADE) · blud_periode · blud_locks.
//
// Yang diuji fungsi ASLI `createTx`/`updateTx`, bukan tiruan SQL-nya. Itu penting:
// kerusakan B1 justru lahir dari cara data layer menulis ulang potongan
// (DELETE + bulkInsert → id AUTO_INCREMENT baru), jadi menirunya di berkas uji
// hanya akan membuktikan tiruannya sendiri.
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import Module from 'node:module'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outDir = path.join(repo, 'node_modules', '.cache', 'blud-potongan-test')

for (const line of fs.readFileSync(path.join(repo, '.env.local'), 'utf8').split('\n')) {
  const t = line.trim()
  if (!t || t.startsWith('#')) continue
  const i = t.indexOf('=')
  if (i === -1) continue
  let v = t.slice(i + 1).trim()
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
  if (!(t.slice(0, i).trim() in process.env)) process.env[t.slice(0, i).trim()] = v
}

fs.mkdirSync(outDir, { recursive: true })
fs.writeFileSync(path.join(outDir, 'stub-next-server.js'),
  'exports.NextResponse = { json: (b, i) => ({ body: b, status: i && i.status }) };\n')
fs.writeFileSync(path.join(outDir, 'stub-ratelimit.js'),
  'exports.checkRateLimit = async () => ({ allowed: true, success: true });\n')
fs.writeFileSync(path.join(outDir, 'stub-auth.js'), 'exports.getSession = async () => null;\n')

const berkas = [
  'lib/blud/realisasi-data.ts', 'lib/blud/realisasi-schemas.ts', 'lib/blud/schemas.ts',
  'lib/blud/alokasi-rule.ts', 'lib/blud/pagu.ts', 'lib/blud/data.ts', 'lib/blud/lock.ts',
  'lib/blud/anggaran-key.ts', 'lib/blud/format.ts',
  'lib/data/db.ts', 'lib/data/locks.ts', 'lib/shared/uuid.ts',
]
try {
  execSync(
    `npx tsc ${berkas.map((f) => `"${path.join(repo, f)}"`).join(' ')}`
    + ` --outDir "${outDir}" --rootDir "${repo}" --module commonjs --target es2020`
    + ' --esModuleInterop --skipLibCheck --moduleResolution node',
    { cwd: repo, stdio: 'pipe' },
  )
} catch { /* impor `@/...` tak ter-resolve saat compile — .js tetap ditulis */ }

const resolveAsli = Module._resolveFilename
Module._resolveFilename = function (permintaan, ...sisa) {
  if (permintaan === 'next/server') return path.join(outDir, 'stub-next-server.js')
  if (permintaan.startsWith('@/lib/security/auth')) return path.join(outDir, 'stub-auth.js')
  if (permintaan.startsWith('@/lib/security/ratelimit')) return path.join(outDir, 'stub-ratelimit.js')
  if (permintaan.startsWith('@/')) return path.join(outDir, permintaan.slice(2) + '.js')
  return resolveAsli.call(this, permintaan, ...sisa)
}

const { sql } = require(path.join(outDir, 'lib/data/db.js'))
const { createTx, updateTx } = require(path.join(outDir, 'lib/blud/realisasi-data.js'))

const TAHUN = 2099
const BULAN = 1
const KEY = 'UJI-B1-KEY'

let gagal = 0
let jalan = 0
function periksa(nama, benar, tambahan = '') {
  jalan++
  if (!benar) gagal++
  console.log(`${benar ? '  ok  ' : ' GAGAL'} ${nama.padEnd(56)} ${tambahan}`)
}
async function tangkap(fn) {
  try { await fn(); return null } catch (e) { return e?.name ?? 'Error' }
}
async function bersihkan() {
  await sql`DELETE FROM blud_bukti_setor WHERE tahun_anggaran = ${TAHUN}`
  await sql`DELETE FROM blud_realisasi_tx WHERE tahun_anggaran = ${TAHUN}`
  await sql`DELETE FROM dpa_blud WHERE tahun_anggaran = ${TAHUN}`
  await sql`DELETE FROM blud_periode WHERE tahun_anggaran = ${TAHUN}`
  await sql`DELETE FROM blud_locks WHERE key_id LIKE ${`${TAHUN}%`}`
}
const potonganDb = async (txId) => await sql`
  SELECT id, jenis, nilai, urutan FROM blud_realisasi_potongan
  WHERE tx_id = ${txId} ORDER BY urutan ASC, id ASC
`

await bersihkan()
try {
  // Pagu 2099 — `pastikanTahunPunyaDpa` + `bacaPaguTerkunci` menuntut baris nyata.
  await sql`
    INSERT INTO dpa_blud (tahun_anggaran, versi_tanggal, kode_rekening, uraian, jumlah,
                          tipe_baris, row_id, anggaran_key, urutan)
    VALUES (${TAHUN}, '2099-01-01', '5.1.02.01', 'Uji B1', 100000000, 'CHILD', 'r-uji-b1', ${KEY}, 1)
  `

  const dasar = {
    tahun_anggaran: TAHUN, bulan: BULAN, tanggal: '2099-01-05', jenis: 'BELANJA',
    uraian: 'Uji identitas potongan', kas_masuk: 0, kas_keluar: 0,
    bank_masuk: 0, bank_keluar: 1000000,
    alokasi: [{ anggaran_key: KEY, nilai: 1000000 }],
    potongan: [
      { jenis: 'PPN', keterangan: 'faktur A', nilai: 90000 },
      { jenis: 'PPH_21', keterangan: 'orang B', nilai: 10000 },
    ],
    belum_berrekening: false,
  }

  const dibuat = await createTx(TAHUN, BULAN, dasar, 1)
  const txId = Number(dibuat.id)
  const awal = await potonganDb(txId)
  periksa('Transaksi + 2 potongan tercatat', awal.length === 2, `tx=${txId} id=${awal.map(p => p.id).join(',')}`)

  // Slip Bukti Setor menunjuk potongan PERTAMA — inilah dokumen yang tidak boleh
  // kehilangan barisnya hanya karena transaksinya disunting.
  const bukti = await sql`
    INSERT INTO blud_bukti_setor (tahun_anggaran, bulan, tanggal, no_bukti)
    VALUES (${TAHUN}, ${BULAN}, '2099-01-06', 'UJI/B1/001')
  `
  const buktiId = Number(bukti.insertId ?? bukti[0]?.insertId ?? 0)
  await sql`
    INSERT INTO blud_bukti_setor_baris (bukti_id, urutan, asal, potongan_id)
    VALUES (${buktiId}, 0, 'POTONGAN', ${awal[0].id})
  `
  periksa('Slip menunjuk potongan pertama', buktiId > 0, `bukti=${buktiId} → potongan ${awal[0].id}`)

  console.log('\n── Inti B1: sunting uraian tidak boleh memutus slip ──')
  const kirim = (potongan, uraian) => ({ ...dasar, uraian, potongan })

  await updateTx(txId, 0, kirim(
    awal.map((p, i) => ({ id: Number(p.id), jenis: p.jenis, keterangan: `k${i}`, nilai: Number(p.nilai) })),
    'Uraian dibetulkan',
  ), 1)

  const sesudah = await potonganDb(txId)
  periksa('Id potongan TIDAK berubah',
    sesudah.length === 2 && Number(sesudah[0].id) === Number(awal[0].id) && Number(sesudah[1].id) === Number(awal[1].id),
    `${awal.map(p => p.id).join(',')} → ${sesudah.map(p => p.id).join(',')}`)

  const tautan = await sql`
    SELECT b.potongan_id, p.id AS masih_ada FROM blud_bukti_setor_baris b
    LEFT JOIN blud_realisasi_potongan p ON p.id = b.potongan_id
    WHERE b.bukti_id = ${buktiId}
  `
  periksa('Baris slip masih menunjuk potongan hidup',
    tautan[0]?.potongan_id != null && tautan[0]?.masih_ada != null,
    `potongan_id=${tautan[0]?.potongan_id ?? 'NULL'}`)

  console.log('\n── Pagar tambahan ──')
  // createTx → version 0; satu updateTx yang berhasil di atas → 1. Percobaan yang
  // ditolak tidak menaikkan version, jadi ketiganya memakai angka yang sama.
  const versiKini = 1

  periksa('Menghapus potongan yang dipakai slip DITOLAK',
    await tangkap(() => updateTx(txId, versiKini, kirim(
      [{ id: Number(awal[1].id), jenis: awal[1].jenis, keterangan: null, nilai: Number(awal[1].nilai) }],
      'Coba hapus potongan bertaut',
    ), 1)) === 'BludPotonganTerpakaiError')

  periksa('Id milik transaksi lain DITOLAK, bukan dibuang diam-diam',
    await tangkap(() => updateTx(txId, versiKini, kirim(
      [{ id: 999999999, jenis: 'PPN', keterangan: null, nilai: 100000 }],
      'Coba id asing',
    ), 1)) === 'BludPotonganAsingError')

  // Menambah baris baru: yang lama harus tetap pada id-nya, yang baru dapat id baru.
  await updateTx(txId, versiKini, kirim([
    ...awal.map((p) => ({ id: Number(p.id), jenis: p.jenis, keterangan: null, nilai: Number(p.nilai) })),
    { jenis: 'BAZNAS', keterangan: 'baru', nilai: 5000 },
  ], 'Tambah potongan baru'), 1)

  const bertiga = await potonganDb(txId)
  periksa('Tambah potongan baru tidak menggeser id lama',
    bertiga.length === 3
    && Number(bertiga[0].id) === Number(awal[0].id)
    && Number(bertiga[1].id) === Number(awal[1].id),
    `${bertiga.map(p => p.id).join(',')}`)
  periksa('Potongan baru dapat id sendiri',
    Number(bertiga[2].id) > Number(awal[1].id), `baru=${bertiga[2].id}`)

  const tautanAkhir = await sql`
    SELECT potongan_id FROM blud_bukti_setor_baris WHERE bukti_id = ${buktiId}
  `
  periksa('Slip tetap utuh sesudah semua penyuntingan',
    Number(tautanAkhir[0]?.potongan_id) === Number(awal[0].id),
    `potongan_id=${tautanAkhir[0]?.potongan_id ?? 'NULL'}`)
} finally {
  await bersihkan()
  const sisa = await sql`SELECT COUNT(*) AS n FROM blud_realisasi_tx WHERE tahun_anggaran = ${TAHUN}`
  periksa('Kotak pasir bersih', Number(sisa[0]?.n ?? -1) === 0)
}

console.log(gagal === 0 ? `\n${jalan} pemeriksaan LULUS` : `\n${gagal} dari ${jalan} pemeriksaan GAGAL`)
process.exit(gagal === 0 ? 0 : 1)
