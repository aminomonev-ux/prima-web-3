// Uji regresi pagar HAPUS versi DPA/Pergeseran (temuan audit T1).
//   node scripts/test-blud-hapus-versi.mjs
//
// MENYENTUH DB — tapi hanya di TAHUN KOTAK PASIR 2099, dan seluruhnya dibersihkan
// di blok `finally` (termasuk kalau ada pemeriksaan yang gagal di tengah). Data
// tahun berjalan tidak pernah ditulis; satu-satunya sentuhan ke sana adalah
// pemeriksaan BACA yang memastikan versi asli memang ditolak saat mau dihapus.
//
// Yang diuji: menghapus versi yang sedang jadi sumber pagu tidak boleh
// meninggalkan realisasi menggantung. Jalur SIMPAN sudah dijaga tiga lapis sejak
// lama; jalur HAPUS dulu tidak punya satu pun, padahal akibatnya sama dan lebih
// senyap — `getPaguEfektif` selalu mengambil MAX(versi_tanggal), jadi menghapus
// versi teratas memundurkan pagu SETAHUN penuh sementara alokasinya tetap tinggal.
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import Module from 'node:module'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outDir = path.join(repo, 'node_modules', '.cache', 'blud-hapus-versi-test')

// .env.local dibaca sendiri — skrip ini di luar Next, jadi tidak ada yang memuatnya.
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
try {
  execSync(
    `npx tsc "${path.join(repo, 'lib/blud/data.ts')}" "${path.join(repo, 'lib/data/db.ts')}"`
    + ` --outDir "${outDir}" --rootDir "${repo}" --module commonjs --target es2020`
    + ' --esModuleInterop --skipLibCheck --moduleResolution node',
    { cwd: repo, stdio: 'pipe' },
  )
} catch { /* impor `@/...` tak ter-resolve saat compile — .js tetap ditulis, itu yang dipakai */ }

const resolveAsli = Module._resolveFilename
Module._resolveFilename = function (permintaan, ...sisa) {
  if (permintaan.startsWith('@/')) return path.join(outDir, permintaan.slice(2) + '.js')
  return resolveAsli.call(this, permintaan, ...sisa)
}

const { sql } = require(path.join(outDir, 'lib/data/db.js'))
const data = require(path.join(outDir, 'lib/blud/data.js'))
const { deleteDpaVersi, deletePergeseranVersi } = data

const TAHUN = 2099
const DPA_V = '2099-01-01'
const PERG_V1 = '2099-06-01'
const PERG_V2 = '2099-07-01'
const KEY_PAKAI = 'AK-uji-hapus-pakai'
const KEY_BEBAS = 'AK-uji-hapus-bebas'
const PAGU = 10_000_000
const TERSERAP = 6_000_000

let gagal = 0
let jalan = 0
function periksa(nama, benar, tambahan = '') {
  jalan++
  if (!benar) gagal++
  console.log(`${benar ? '  ok  ' : ' GAGAL'} ${nama.padEnd(52)} ${tambahan}`)
}

/** Jalankan fn, kembalikan nama kelas error-nya (atau null kalau lolos). */
async function tangkap(fn) {
  try { await fn(); return null } catch (e) { return e?.name ?? 'Error' }
}

async function seedDpa() {
  await sql`
    INSERT INTO dpa_blud
      (tahun_anggaran, versi_tanggal, kode_rekening, uraian, jumlah, tipe_baris, row_id, anggaran_key, parent_id, urutan)
    VALUES
      (${TAHUN}, ${DPA_V}, '5.1.02.01', 'Uji hapus — dipakai', ${PAGU}, 'CHILD', 'uji-r1', ${KEY_PAKAI}, NULL, 1),
      (${TAHUN}, ${DPA_V}, '5.1.02.02', 'Uji hapus — bebas',   ${PAGU}, 'CHILD', 'uji-r2', ${KEY_BEBAS}, NULL, 2)
  `
}

/** Salinan DPA sebagai satu versi Pergeseran, dgn pagu KEY_PAKAI bisa diatur. */
async function seedPergeseran(versi, paguDipakai) {
  await sql`
    INSERT INTO pergeseran_dpa
      (tahun_anggaran, versi_tanggal, dpa_versi_tanggal, kode_rekening, uraian, jumlah,
       pergeseran, bertambah_berkurang, tipe_baris, row_id, anggaran_key, parent_id, urutan)
    VALUES
      (${TAHUN}, ${versi}, ${DPA_V}, '5.1.02.01', 'Uji hapus — dipakai', ${PAGU},
       ${paguDipakai}, ${paguDipakai - PAGU}, 'CHILD', 'uji-r1', ${KEY_PAKAI}, NULL, 1),
      (${TAHUN}, ${versi}, ${DPA_V}, '5.1.02.02', 'Uji hapus — bebas',   ${PAGU},
       ${PAGU}, 0, 'CHILD', 'uji-r2', ${KEY_BEBAS}, NULL, 2)
  `
}

async function seedRealisasi() {
  const res = await sql`
    INSERT INTO blud_realisasi_tx
      (tahun_anggaran, bulan, tanggal, jenis, uraian, kas_keluar, status, version)
    VALUES (${TAHUN}, 6, '2099-06-15', 'BELANJA', 'Uji hapus versi', ${TERSERAP}, 'NORMAL', 0)
  `
  const txId = Number(res[0]?.insertId ?? 0)
  await sql`
    INSERT INTO blud_realisasi_alokasi (tx_id, tahun_anggaran, anggaran_key, nilai)
    VALUES (${txId}, ${TAHUN}, ${KEY_PAKAI}, ${TERSERAP})
  `
  return txId
}

async function bersihkan() {
  await sql`DELETE FROM blud_realisasi_tx WHERE tahun_anggaran = ${TAHUN}`
  await sql`DELETE FROM pergeseran_dpa WHERE tahun_anggaran = ${TAHUN}`
  await sql`DELETE FROM dpa_blud WHERE tahun_anggaran = ${TAHUN}`
  await sql`DELETE FROM blud_locks WHERE key_id LIKE ${`${TAHUN}:%`}`
}

async function jumlah(table, versi) {
  const rows = table === 'dpa'
    ? await sql`SELECT COUNT(*) AS n FROM dpa_blud WHERE tahun_anggaran = ${TAHUN} AND versi_tanggal = ${versi}`
    : await sql`SELECT COUNT(*) AS n FROM pergeseran_dpa WHERE tahun_anggaran = ${TAHUN} AND versi_tanggal = ${versi}`
  return Number(rows[0]?.n ?? 0)
}

try {
  await bersihkan()

  // ── 1. DPA satu-satunya, realisasinya menempel → hapus HARUS ditolak ───────
  await seedDpa()
  await seedRealisasi()
  periksa('DPA sumber pagu + ada serapan → ditolak',
    await tangkap(() => deleteDpaVersi(TAHUN, DPA_V)) === 'BludVersiTerpakaiError')
  periksa('…dan barisnya tidak jadi terhapus', await jumlah('dpa', DPA_V) === 2)

  // ── 2. Pergeseran terbaru menaikkan pagu, dipakai → hapus mundur ke penerus ─
  // v1 memberi pagu 1jt (di bawah serapan), v2 memberi pagu penuh. Menghapus v2
  // memundurkan pagu ke v1 → baris jadi minus → harus ditahan.
  await seedPergeseran(PERG_V1, 1_000_000)
  await seedPergeseran(PERG_V2, PAGU)
  periksa('Pergeseran terbaru dihapus, penerus di bawah serapan → ditolak',
    await tangkap(() => deletePergeseranVersi(TAHUN, PERG_V2)) === 'BludVersiTerpakaiError')
  periksa('…dan barisnya tidak jadi terhapus', await jumlah('perg', PERG_V2) === 2)

  // ── 3. Versi LAMA bukan sumber pagu → boleh dihapus ────────────────────────
  periksa('Pergeseran versi lama (bukan sumber pagu) → boleh',
    await tangkap(() => deletePergeseranVersi(TAHUN, PERG_V1)) === null)

  // ── 4. Soft-FK: DPA yang masih jadi acuan Pergeseran tidak boleh hilang ────
  periksa('DPA yang masih dirujuk Pergeseran → ditolak',
    await tangkap(() => deleteDpaVersi(TAHUN, DPA_V)) === 'BludVersiDirujukError')

  // ── 5. Pergeseran terakhir dihapus, DPA menampung serapan → boleh ──────────
  periksa('Pergeseran terakhir → jatuh ke DPA yang cukup → boleh',
    await tangkap(() => deletePergeseranVersi(TAHUN, PERG_V2)) === null)

  // ── 6. Tanpa realisasi, apa pun boleh dihapus ──────────────────────────────
  await sql`DELETE FROM blud_realisasi_tx WHERE tahun_anggaran = ${TAHUN}`
  periksa('DPA tanpa realisasi sama sekali → boleh',
    await tangkap(() => deleteDpaVersi(TAHUN, DPA_V)) === null)
  periksa('…dan barisnya benar-benar hilang', await jumlah('dpa', DPA_V) === 0)

  // ── 7. Data sungguhan: versi yang menyangga realisasi berjalan ─────────────
  // Tidak menulis apa pun — yang diperiksa justru bahwa penghapusannya DITOLAK.
  const nyata = await sql`
    SELECT d.tahun_anggaran AS tahun, DATE_FORMAT(MAX(d.versi_tanggal), '%Y-%m-%d') AS versi
    FROM dpa_blud d
    WHERE EXISTS (SELECT 1 FROM blud_realisasi_alokasi a WHERE a.tahun_anggaran = d.tahun_anggaran)
      AND NOT EXISTS (SELECT 1 FROM pergeseran_dpa p WHERE p.tahun_anggaran = d.tahun_anggaran)
    GROUP BY d.tahun_anggaran LIMIT 1
  `
  if (nyata.length) {
    const { tahun, versi } = nyata[0]
    const hasil = await tangkap(() => deleteDpaVersi(Number(tahun), versi))
    periksa(`Data nyata: DPA ${tahun}/${versi} ditolak`, hasil === 'BludVersiTerpakaiError', hasil ?? 'LOLOS')
  } else {
    console.log('  --   Data nyata: tidak ada tahun ber-realisasi tanpa pergeseran, dilewati')
  }
} finally {
  await bersihkan()
  const sisa = await sql`
    SELECT (SELECT COUNT(*) FROM dpa_blud WHERE tahun_anggaran = ${TAHUN})
         + (SELECT COUNT(*) FROM pergeseran_dpa WHERE tahun_anggaran = ${TAHUN})
         + (SELECT COUNT(*) FROM blud_realisasi_tx WHERE tahun_anggaran = ${TAHUN}) AS n
  `
  periksa('Kotak pasir bersih setelah uji', Number(sisa[0]?.n ?? -1) === 0)
}

console.log(gagal === 0 ? `\n${jalan} pemeriksaan LULUS` : `\n${gagal} dari ${jalan} pemeriksaan GAGAL`)
process.exit(gagal === 0 ? 0 : 1)
