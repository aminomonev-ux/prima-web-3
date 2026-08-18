// Uji regresi perbaikan audit Renaksi (T2, T5, T6, T7, T8, T10 + keputusan K2)
// dan kolom `kode` (jangkar identitas lintas ganti nama).
//   node scripts/test-renaksi-audit.mjs
//
// MENYENTUH DB — tapi hanya di TAHUN KOTAK PASIR 2097/2098/2099, dan seluruhnya
// dibersihkan di blok `finally` (termasuk kalau ada pemeriksaan yang gagal di
// tengah). Data tahun berjalan tidak pernah disentuh.
//
// Yang diuji di sini justru bagian yang TIDAK bisa dibuktikan tsc: bentuk SQL-nya.
// COALESCE yang salah, `IN (${array})` yang tidak ter-ekspansi, atau baris kunci
// yang tidak pernah terbentuk — semuanya lolos tsc dan baru meledak saat jalan.
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import Module from 'node:module'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outDir = path.join(repo, 'node_modules', '.cache', 'renaksi-audit-test')

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
const sumber = ['lib/shared/uuid.ts', 'lib/data/db.ts', 'lib/data/locks.ts', 'lib/data/rencana-aksi.ts']
try {
  execSync(
    `npx tsc ${sumber.map((f) => `"${path.join(repo, f)}"`).join(' ')}`
    + ` --outDir "${outDir}" --rootDir "${repo}" --module commonjs --target es2020`
    + ' --esModuleInterop --skipLibCheck --moduleResolution node',
    { cwd: repo, stdio: 'pipe' },
  )
} catch { /* alias @/... tak ter-resolve saat compile — .js tetap ditulis */ }

const resolveAsli = Module._resolveFilename
Module._resolveFilename = function (permintaan, ...sisa) {
  if (permintaan.startsWith('@/')) return path.join(outDir, permintaan.slice(2) + '.js')
  return resolveAsli.call(this, permintaan, ...sisa)
}

const { sql } = require(path.join(outDir, 'lib/data/db.js'))
const RA = require(path.join(outDir, 'lib/data/rencana-aksi.js'))

const TH = 2099          // kotak pasir utama
const TH_SUMBER = 2098   // sumber duplikasi
const TH_TUJUAN = 2097   // tujuan duplikasi (harus kosong)
const UID = 1

let gagal = 0, jalan = 0
function periksa(nama, benar, tambahan = '') {
  jalan++
  if (!benar) gagal++
  console.log(`${benar ? '  ok  ' : ' GAGAL'} ${nama.padEnd(58)} ${tambahan}`)
}
async function tangkap(fn) {
  try { await fn(); return null } catch (e) { return e?.name ?? 'Error' }
}
const bulan = (...v) => { const a = Array(12).fill(null); v.forEach((x, i) => { a[i] = x }); return a }

async function bersih() {
  for (const t of [TH, TH_SUMBER, TH_TUJUAN]) {
    await sql`DELETE FROM rencana_aksi WHERE tahun = ${t}`
    await sql`DELETE FROM system_settings WHERE \`key\` = ${`ra_lock_${t}`}`
  }
  await sql`DELETE FROM blud_locks WHERE entity = 'RA_DUPLIKASI' AND key_id IN (${[String(TH_TUJUAN), String(TH_SUMBER), String(TH)]})`
}

const dasar = (extra) => ({
  tahun: TH, level: 'sub-kegiatan', program: 'PRG-UJI', kegiatan: 'KEG-UJI',
  sub_kegiatan: 'SUB-UJI', satuan: 'Persen', jenis: 'Akumulatif',
  target_rpjmd: 100, target_tahunan: 100,
  q1_target: 0, q2_target: 0, q3_target: 0, q4_target: 0,
  ...extra,
})

async function main() {
  await bersih()

  console.log('\n── T6 + T2: ganti `jenis` lewat form ikut hitung ulang & tunduk kunci ──')
  const id1 = await RA.upsertRencanaAksi(dasar({ indikator: 'IND-jenis' }), UID)
  await RA.updateBulanRealisasi(id1, bulan(10, 10, 10), UID, (await RA.getRencanaAksiById(id1)).version)
  let r = await RA.getRencanaAksiById(id1)
  periksa('Akumulatif: q1 realisasi = jumlah 3 bulan', Number(r.q1_realisasi) === 30, `q1=${r.q1_realisasi}`)

  // Dulu jalur form mengganti jenis TANPA menghitung ulang -> q1 tetap 30 (rumus lama).
  await RA.upsertRencanaAksi(dasar({ id: id1, indikator: 'IND-jenis', jenis: 'Progres Positif', expected_version: r.version }), UID)
  r = await RA.getRencanaAksiById(id1)
  periksa('Ganti jenis via form -> q1 dihitung ulang (snapshot)', Number(r.q1_realisasi) === 10, `q1=${r.q1_realisasi} jenis=${r.jenis}`)

  await RA.setRaLock(TH, 6)
  const e1 = await tangkap(() => RA.upsertRencanaAksi(dasar({ id: id1, indikator: 'IND-jenis', jenis: 'Akumulatif', expected_version: r.version }), UID))
  periksa('Periode terkunci: ganti jenis via form DITOLAK', e1 === 'RaPeriodLockedError', e1 ?? 'lolos')

  // Edit yang TIDAK menggerakkan realisasi tetap boleh walau terkunci.
  const e2 = await tangkap(() => RA.upsertRencanaAksi(dasar({ id: id1, indikator: 'IND-jenis', jenis: r.jenis, satuan: 'Unit', expected_version: r.version }), UID))
  periksa('Periode terkunci: ubah satuan saja tetap BOLEH', e2 === null, e2 ?? 'lolos')
  r = await RA.getRencanaAksiById(id1)
  periksa('…dan realisasinya tidak ikut tergeser (COALESCE)', Number(r.q1_realisasi) === 10, `q1=${r.q1_realisasi}`)

  const e3 = await tangkap(() => RA.updateJenis(id1, 'Akumulatif', UID, r.version))
  periksa('Periode terkunci: updateJenis DITOLAK', e3 === 'RaPeriodLockedError', e3 ?? 'lolos')

  console.log('\n── K2: ubah target SENGAJA tetap boleh saat terkunci ──')
  const e4 = await tangkap(() => RA.updateTargets(id1, 111, 222, UID, r.version))
  periksa('updateTargets lolos walau periode terkunci', e4 === null, e4 ?? 'lolos')
  r = await RA.getRencanaAksiById(id1)
  periksa('…targetnya benar-benar tersimpan', Number(r.target_rpjmd) === 111 && Number(r.target_tahunan) === 222, `${r.target_rpjmd}/${r.target_tahunan}`)

  console.log('\n── T2: hapus baris juga tunduk kunci ──')
  const e5 = await tangkap(() => RA.deleteRencanaAksi(r))
  periksa('Hapus saat terkunci DITOLAK', e5 === 'RaPeriodLockedError', e5 ?? 'lolos')
  await RA.setRaLock(TH, 0)

  console.log('\n── T5: CAS versi ──')
  r = await RA.getRencanaAksiById(id1)
  const e6 = await tangkap(() => RA.upsertRencanaAksi(dasar({ id: id1, indikator: 'IND-jenis', jenis: r.jenis, expected_version: r.version + 99 }), UID))
  periksa('Versi salah -> RaVersionConflictError', e6 === 'RaVersionConflictError', e6 ?? 'lolos')
  const e7 = await tangkap(() => RA.upsertRencanaAksi(dasar({ id: id1, indikator: 'IND-jenis', jenis: r.jenis, expected_version: r.version }), UID))
  periksa('Versi benar -> tersimpan', e7 === null, e7 ?? 'lolos')

  console.log('\n── T7: hapus induk yang masih punya anak ──')
  await RA.upsertRencanaAksi({ ...dasar({ indikator: 'IND-prog-A' }), level: 'program', program: 'PRG-INDUK', sasaran: 'SAS-X', kegiatan: null, sub_kegiatan: null }, UID)
  await RA.upsertRencanaAksi({ ...dasar({ indikator: 'IND-keg-anak' }), level: 'kegiatan', program: 'PRG-INDUK', kegiatan: 'KEG-ANAK', sub_kegiatan: null }, UID)
  let prog = (await RA.listRencanaAksi(TH, 'program')).find((x) => x.indikator === 'IND-prog-A')
  const e8 = await tangkap(() => RA.deleteRencanaAksi(prog))
  periksa('Baris program terakhir + punya anak -> DITOLAK', e8 === 'RaPunyaAnakError', e8 ?? 'lolos')

  // Saudara dengan NAMA sama: anaknya tidak jadi yatim, jadi hapus harus BOLEH.
  await RA.upsertRencanaAksi({ ...dasar({ indikator: 'IND-prog-B' }), level: 'program', program: 'PRG-INDUK', sasaran: 'SAS-X', kegiatan: null, sub_kegiatan: null }, UID)
  const e9 = await tangkap(() => RA.deleteRencanaAksi(prog))
  periksa('Masih ada saudara senama -> hapus BOLEH', e9 === null, e9 ?? 'lolos')

  console.log('\n── T8: simpan massal matriks bulanan ──')
  const idA = await RA.upsertRencanaAksi(dasar({ indikator: 'IND-bulk-A' }), UID)
  const idB = await RA.upsertRencanaAksi(dasar({ indikator: 'IND-bulk-B' }), UID)
  const vA = (await RA.getRencanaAksiById(idA)).version
  const vB = (await RA.getRencanaAksiById(idB)).version
  const hasil = await RA.updateBulanRealisasiBulk([
    { id: idA, bulan_realisasi: bulan(5, 5), expected_version: vA },
    { id: idB, bulan_realisasi: bulan(7, 7), expected_version: vB + 99 }, // sengaja basi
    { id: 99999999, bulan_realisasi: bulan(1), expected_version: 0 },     // sengaja tak ada
  ], UID)
  periksa('1 tersimpan, 2 gagal (per-baris independen)', hasil.saved === 1 && hasil.failed.length === 2, `saved=${hasil.saved} failed=${hasil.failed.length}`)
  const rA = await RA.getRencanaAksiById(idA)
  periksa('…baris yang lolos benar nilainya', Number(rA.q1_realisasi) === 10, `q1=${rA.q1_realisasi}`)
  const rB = await RA.getRencanaAksiById(idB)
  periksa('…baris versi basi TIDAK berubah', rB.bulan_realisasi === null, `bulan=${JSON.stringify(rB.bulan_realisasi)}`)

  await RA.setRaLock(TH, 3)
  const hasil2 = await RA.updateBulanRealisasiBulk(
    [{ id: idA, bulan_realisasi: bulan(9, 9), expected_version: rA.version }], UID)
  periksa('Massal juga tunduk Kunci Periode', hasil2.saved === 0 && /terkunci/i.test(hasil2.failed[0]?.error ?? ''), hasil2.failed[0]?.error?.slice(0, 40))
  await RA.setRaLock(TH, 0)

  console.log('\n── T10: duplikasi tahun ──')
  await RA.upsertRencanaAksi({ ...dasar({ indikator: 'IND-dup', kode: '9.99.99.9.99' }), tahun: TH_SUMBER }, UID)
  const d1 = await RA.duplicateYear(TH_SUMBER, TH_TUJUAN, UID)
  periksa('Duplikasi ke tahun kosong berhasil', d1.inserted === 1, `inserted=${d1.inserted}`)
  const e10 = await tangkap(() => RA.duplicateYear(TH_SUMBER, TH_TUJUAN, UID))
  periksa('Duplikasi kedua ke tahun berisi DITOLAK', e10 === 'RaTahunTujuanBerisiError', e10 ?? 'lolos')
  const salinan = await RA.listRencanaAksi(TH_TUJUAN, 'sub-kegiatan')
  periksa('…hanya 1 salinan (tidak dobel)', salinan.length === 1, `n=${salinan.length}`)
  periksa('…realisasi salinan mulai dari nol', Number(salinan[0].q1_realisasi) === 0 && salinan[0].bulan_realisasi === null)
  // Dulu `kode` tidak ikut di INSERT..SELECT: tahun baru lahir tanpa jangkar, padahal
  // pergantian tahun justru saat nomenklatur paling sering berubah.
  periksa('…kode ikut tersalin ke tahun baru', salinan[0].kode === '9.99.99.9.99', `kode=${salinan[0].kode}`)

  // Dua duplikasi BERSAMAAN ke tahun kosong: baris kunci harus membuat yang kedua kalah.
  await sql`DELETE FROM rencana_aksi WHERE tahun = ${TH_TUJUAN}`
  const barengan = await Promise.allSettled([
    RA.duplicateYear(TH_SUMBER, TH_TUJUAN, UID),
    RA.duplicateYear(TH_SUMBER, TH_TUJUAN, UID),
  ])
  const sukses = barengan.filter((x) => x.status === 'fulfilled' && x.value.inserted > 0).length
  const akhir = await RA.listRencanaAksi(TH_TUJUAN, 'sub-kegiatan')
  periksa('Dua duplikasi bersamaan -> tepat 1 menang', sukses === 1, `sukses=${sukses}`)
  periksa('…tahun tujuan tidak berisi salinan dobel', akhir.length === 1, `n=${akhir.length}`)

  console.log('\n── Kolom `kode`: jangkar identitas saat nama diganti ──')
  const idK = await RA.upsertRencanaAksi(dasar({ indikator: 'IND-kode', kode: '1.02.02.2.01' }), UID)
  let rk = await RA.getRencanaAksiById(idK)
  periksa('Entri manual menyimpan kode', rk.kode === '1.02.02.2.01', `kode=${rk.kode}`)

  // Rantai baca: SELECT -> RaRow -> state form. Kalau `kode` hilang di sini, form
  // memuat nilai kosong dan edit berikutnya menghapus kode tanpa ada yang sadar.
  const dariDaftar = (await RA.listRencanaAksi(TH, 'sub-kegiatan')).find((x) => x.indikator === 'IND-kode')
  periksa('listRencanaAksi mengembalikan kode', dariDaftar?.kode === '1.02.02.2.01', `kode=${dariDaftar?.kode}`)

  // Form mengirim balik apa yang tadi dimuat — meniru handleEdit di DataEntryForm.
  await RA.upsertRencanaAksi(dasar({
    id: idK, indikator: 'IND-kode', kode: dariDaftar?.kode ?? null,
    sub_kegiatan: 'SUB-UJI NAMA BARU', expected_version: rk.version,
  }), UID)
  rk = await RA.getRencanaAksiById(idK)
  periksa('Ganti nama via form TIDAK menghapus kode', rk.kode === '1.02.02.2.01', `kode=${rk.kode}`)

  // Sisi sebaliknya, dan alasan jalur form TIDAK memakai COALESCE seperti jalur impor:
  // dengan COALESCE pemeriksaan inilah yang gagal — kode jadi mustahil dihapus.
  await RA.upsertRencanaAksi(dasar({
    id: idK, indikator: 'IND-kode', kode: null,
    sub_kegiatan: 'SUB-UJI NAMA BARU', expected_version: rk.version,
  }), UID)
  rk = await RA.getRencanaAksiById(idK)
  periksa('Kode bisa dikosongkan dengan sengaja', rk.kode === null, `kode=${rk.kode}`)
}

try {
  await main()
} catch (e) {
  gagal++
  console.log('\n GAGAL (lemparan tak tertangkap):', e?.message ?? e)
} finally {
  await bersih()
  console.log(`\nKotak pasir dibersihkan (tahun ${TH_TUJUAN}/${TH_SUMBER}/${TH}).`)
  console.log(gagal === 0 ? `\n${jalan} pemeriksaan LULUS` : `\n${gagal} dari ${jalan} pemeriksaan GAGAL`)
  process.exit(gagal === 0 ? 0 : 1)
}
