// Uji regresi temuan N1–N3 audit BLUD putaran 4.
//   node scripts/test-blud-n1-n4.mjs
//
// MENYENTUH DB. Semua tulisan terjadi di TAHUN KOTAK PASIR 2099 dan dihapus lagi
// di `finally` — transaksi, periode, bukti setor, dan baris `blud_locks`-nya.
//
// N4 tidak diuji di sini: yang berubah adalah pengalihan halaman di server
// component (`izinLayar`), dan itu butuh Next berjalan, bukan pemanggilan fungsi.
//
// Kenapa tidak ditiru saja: yang diuji adalah perilaku kunci baris dan pemeriksaan
// lintas-tabel, dan tiruan selalu menjawab seperti harapan.
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import Module from 'node:module'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outDir = path.join(repo, 'node_modules', '.cache', 'blud-n1n4-test')

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
  'exports.checkRateLimit = async () => ({ allowed: true });\n')

const sumber = [
  // `lib/shared/uuid.ts` disebut eksplisit: sejak `schemas.ts` meneruskan batas
  // baris impor dari `import-dpa-shared`, rantainya sampai ke `format.ts` →
  // `@/lib/shared/uuid`, dan alias `@/…` tidak ter-resolve tsc telanjang.
  'lib/shared/uuid.ts',
  'lib/data/db.ts', 'lib/data/locks.ts', 'lib/blud/lock.ts', 'lib/blud/pagu.ts', 'lib/blud/data.ts',
  'lib/blud/anggaran-key.ts', 'lib/blud/schemas.ts', 'lib/blud/alokasi-rule.ts',
  'lib/blud/realisasi-schemas.ts', 'lib/blud/realisasi-data.ts', 'lib/blud/tutup-kas.ts',
  'lib/blud/bukti-setor-schemas.ts', 'lib/blud/bukti-setor-data.ts',
]
try {
  execSync(
    `npx tsc ${sumber.map((f) => `"${path.join(repo, f)}"`).join(' ')}`
    + ` --outDir "${outDir}" --rootDir "${repo}" --module commonjs --target es2020`
    + ' --esModuleInterop --skipLibCheck --moduleResolution node',
    { cwd: repo, stdio: 'pipe' },
  )
} catch { /* impor `@/...` tak ter-resolve saat compile — .js tetap ditulis */ }

const resolveAsli = Module._resolveFilename
Module._resolveFilename = function (permintaan, ...sisa) {
  if (permintaan === 'next/server') return path.join(outDir, 'stub-next-server.js')
  if (permintaan.startsWith('@/lib/security/ratelimit')) return path.join(outDir, 'stub-ratelimit.js')
  if (permintaan.startsWith('@/')) return path.join(outDir, permintaan.slice(2) + '.js')
  return resolveAsli.call(this, permintaan, ...sisa)
}

const { sql } = require(path.join(outDir, 'lib/data/db.js'))
const { createTx, updateTx } = require(path.join(outDir, 'lib/blud/realisasi-data.js'))
const {
  tutupPeriode, bukaPeriode, simpanSisiNyata, setSaldoAwalTahun, getNeracaKas,
} = require(path.join(outDir, 'lib/blud/tutup-kas.js'))
const { simpanBuktiSetor } = require(path.join(outDir, 'lib/blud/bukti-setor-data.js'))

const TAHUN = 2099
const UID = 1

let gagal = 0
let jalan = 0
function periksa(nama, benar, tambahan = '') {
  jalan++
  if (!benar) gagal++
  console.log(`${benar ? '  ok  ' : ' GAGAL'} ${nama.padEnd(60)} ${tambahan}`)
}
async function tangkap(fn) {
  try { await fn(); return null } catch (e) { return e?.name ?? 'Error' }
}
const baris = (bulan, jenis, uraian) => ({
  tanggal: `${TAHUN}-${String(bulan).padStart(2, '0')}-10`,
  jenis, uraian,
  kas_masuk: jenis === 'PENERIMAAN' ? 1000 : 0,
  kas_keluar: jenis === 'PENERIMAAN' ? 0 : 1000,
  bank_masuk: 0, bank_keluar: 0,
  alokasi: [], potongan: [],
  belum_berrekening: true,
})
async function kwtDari(id) {
  const r = await sql`SELECT no_kwt FROM blud_realisasi_tx WHERE id = ${id}`
  return r[0]?.no_kwt == null ? null : Number(r[0].no_kwt)
}

try {
  // Sejak §4.8 dijaga di jalur tulis (`pastikanTahunPunyaDpa`), tahun tanpa DPA
  // menolak SEMUA transaksi — termasuk yang diparkir tanpa alokasi. Dulu uji ini
  // sengaja tidak menyeed DPA karena baris parkir dianggap tidak butuh pagu; itu
  // tidak berlaku lagi. Satu baris DPA sudah cukup: yang dibaca hanya "ada/tidak".
  await sql`
    INSERT INTO dpa_blud (tahun_anggaran, versi_tanggal, kode_rekening, uraian, jumlah,
                          tipe_baris, row_id, anggaran_key, urutan)
    VALUES (${TAHUN}, '2099-01-01', '5.1.02.01', 'Uji N1-N4', 100000000, 'CHILD', 'r-uji-n1n4', 'AK-uji-n1n4', 1)
  `

  // ── N2: nomor kuitansi ikut pindah saat `jenis` diubah ────────────────────
  console.log('── N2: no_kwt mengikuti jenis ──')

  const terima = await createTx(TAHUN, 3, baris(3, 'PENERIMAAN', 'Uji terima'), UID)
  periksa('PENERIMAAN baru tidak dapat nomor', terima.no_kwt === null, `kwt=${terima.no_kwt}`)

  const belanja = await createTx(TAHUN, 3, baris(3, 'BELANJA', 'Uji belanja'), UID)
  periksa('BELANJA baru dapat nomor 1', belanja.no_kwt === 1, `kwt=${belanja.no_kwt}`)

  const v1 = await updateTx(terima.id, 0, baris(3, 'BELANJA', 'Uji terima → belanja'), UID)
  periksa('PENERIMAAN → BELANJA dapat nomor', v1.no_kwt === 2, `kwt=${v1.no_kwt}`)
  periksa('nomor itu benar tertulis di DB', (await kwtDari(terima.id)) === 2)

  const v2 = await updateTx(terima.id, 1, baris(3, 'PENERIMAAN', 'Uji belanja → terima'), UID)
  periksa('BELANJA → PENERIMAAN nomornya dilepas', v2.no_kwt === null, `kwt=${v2.no_kwt}`)
  periksa('tidak ada nomor yatim tertinggal', (await kwtDari(terima.id)) === null)

  await updateTx(belanja.id, 0, baris(3, 'BELANJA', 'Uji belanja diubah uraiannya'), UID)
  periksa('BELANJA tetap: nomor TIDAK diberi ulang', (await kwtDari(belanja.id)) === 1)

  const belanja2 = await createTx(TAHUN, 3, baris(3, 'BELANJA', 'Uji belanja kedua'), UID)
  periksa('nomor tidak melompat setelah dilepas', belanja2.no_kwt === 2, `kwt=${belanja2.no_kwt}`)

  // ── N1: perpindahan status periode ────────────────────────────────────────
  console.log('\n── N1: jalur tulis periode ──')

  const kosong = { kas_fisik: 0, bank_koran: 0, no_surat: 'UJI/2099', tgl_surat: `${TAHUN}-01-31` }
  await tutupPeriode(TAHUN, 1, kosong, UID)
  periksa('bulan 1 tertutup', (await getNeracaKas(TAHUN, 1)).status === 'TUTUP')

  periksa('kunci setahun benar-benar diambil',
    (await sql`SELECT key_id FROM blud_locks WHERE entity = 'realisasi_periode' AND key_id = ${String(TAHUN)}`).length === 1)

  periksa('saldo awal terkunci begitu ada bulan tertutup',
    (await tangkap(() => setSaldoAwalTahun(TAHUN, { kas: 5, bank: 5 }))) === 'BludSaldoAwalTerkunciError')
  periksa('layar diberi tahu alasannya', (await getNeracaKas(TAHUN, 1)).saldo_awal_terkunci === true)

  periksa('sisi nyata ditolak di bulan tertutup',
    (await tangkap(() => simpanSisiNyata(TAHUN, 1, kosong))) === 'BludPeriodeTertutupError')

  await bukaPeriode(TAHUN, 1)
  periksa('bulan 1 terbuka lagi', (await getNeracaKas(TAHUN, 1)).status === 'BUKA')
  periksa('saldo awal hidup lagi setelah dibuka',
    (await tangkap(() => setSaldoAwalTahun(TAHUN, { kas: 0, bank: 0 }))) === null)

  await tutupPeriode(TAHUN, 1, kosong, UID)
  await tutupPeriode(TAHUN, 2, { ...kosong, tgl_surat: `${TAHUN}-02-28` }, UID)
  periksa('buka bulan 1 ditolak selama bulan 2 masih tutup',
    (await tangkap(() => bukaPeriode(TAHUN, 1))) === 'BludBukaTerhalangError')

  await bukaPeriode(TAHUN, 2)
  periksa('urut dari belakang: bulan 1 boleh dibuka setelah bulan 2',
    (await tangkap(() => bukaPeriode(TAHUN, 1))) === null)

  const belumTutup = await tangkap(() => tutupPeriode(TAHUN, 4, { ...kosong, tgl_surat: `${TAHUN}-04-30` }, UID))
  periksa('tutup bulan 4 ditahan karena bulan depan belum tutup',
    belumTutup === 'BludTutupTerhalangError', belumTutup ?? '-')

  // ── N3: penunjuk Bukti Setor ──────────────────────────────────────────────
  console.log('\n── N3: penunjuk Bukti Setor ──')

  const lain = await createTx(TAHUN, 4, baris(4, 'PENERIMAAN', 'Uji bulan lain'), UID)

  const slipSah = {
    tahun_anggaran: TAHUN, bulan: 3, tanggal: `${TAHUN}-03-20`, no_bukti: 'UJI-1',
    ambil_tx_id: null, ambil_manual: 1000,
    baris: [{ asal: 'BKU', tx_id: belanja.id, potongan_id: null, uraian: null, nilai: null }],
  }
  const simpan = await tangkap(() => simpanBuktiSetor(slipSah, UID))
  periksa('penunjuk sebulan diterima', simpan === null, simpan ?? '-')

  periksa('transaksi bulan LAIN ditolak',
    (await tangkap(() => simpanBuktiSetor(
      { ...slipSah, no_bukti: 'UJI-2', baris: [{ asal: 'BKU', tx_id: lain.id, potongan_id: null, uraian: null, nilai: null }] },
      UID))) === 'BludPenunjukTidakSahError')

  periksa('transaksi yang tidak ada ditolak',
    (await tangkap(() => simpanBuktiSetor(
      { ...slipSah, no_bukti: 'UJI-3', baris: [{ asal: 'BKU', tx_id: 999999999, potongan_id: null, uraian: null, nilai: null }] },
      UID))) === 'BludPenunjukTidakSahError')

  periksa('tarikan (ambil_tx_id) bulan lain ditolak',
    (await tangkap(() => simpanBuktiSetor(
      { ...slipSah, no_bukti: 'UJI-4', ambil_tx_id: lain.id, ambil_manual: null, baris: [] },
      UID))) === 'BludPenunjukTidakSahError')

  periksa('potongan yang tidak ada ditolak',
    (await tangkap(() => simpanBuktiSetor(
      { ...slipSah, no_bukti: 'UJI-5', baris: [{ asal: 'POTONGAN', tx_id: null, potongan_id: 999999999, uraian: null, nilai: null }] },
      UID))) === 'BludPenunjukTidakSahError')

  periksa('baris KETIK tetap lolos (tak punya penunjuk)',
    (await tangkap(() => simpanBuktiSetor(
      { ...slipSah, no_bukti: 'UJI-6', baris: [{ asal: 'KETIK', tx_id: null, potongan_id: null, uraian: 'Ketikan lepas', nilai: 500 }] },
      UID))) === null)

} catch (e) {
  // Lemparan di tengah dulu lolos begitu saja: `finally` mencetak "0/0 lulus" lalu
  // keluar dengan kode 0 karena `gagal` masih nol — hijau palsu yang menyembunyikan
  // regresi selama sebulan. Sekarang lemparan apa pun dihitung sebagai kegagalan.
  gagal++; jalan++
  console.log(`\n GAGAL uji berhenti di tengah — ${e?.name ?? 'Error'}: ${e?.message ?? e}`)
} finally {
  console.log('\n── bersih-bersih kotak pasir 2099 ──')
  await sql`DELETE FROM blud_bukti_setor WHERE tahun_anggaran = ${TAHUN}`
  await sql`DELETE FROM blud_realisasi_tx WHERE tahun_anggaran = ${TAHUN}`
  await sql`DELETE FROM blud_periode WHERE tahun_anggaran = ${TAHUN}`
  await sql`DELETE FROM dpa_blud WHERE tahun_anggaran = ${TAHUN}`
  await sql`DELETE FROM blud_locks WHERE key_id = ${String(TAHUN)} OR key_id LIKE ${`${TAHUN}:%`}`
  const sisa = await sql`
    SELECT (SELECT COUNT(*) FROM blud_realisasi_tx WHERE tahun_anggaran = ${TAHUN}) AS tx,
           (SELECT COUNT(*) FROM blud_periode     WHERE tahun_anggaran = ${TAHUN}) AS per,
           (SELECT COUNT(*) FROM blud_bukti_setor WHERE tahun_anggaran = ${TAHUN}) AS slip
  `
  console.log(`  sisa 2099 → tx=${sisa[0].tx} periode=${sisa[0].per} slip=${sisa[0].slip}`)

  console.log(`\n${jalan - gagal}/${jalan} lulus`)
  process.exit(gagal ? 1 : 0)
}
