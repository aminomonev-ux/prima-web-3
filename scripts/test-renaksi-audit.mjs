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
  const sumber = ['lib/shared/uuid.ts', 'lib/shared/desimal.ts', 'lib/shared/nama-resmi.ts', 'lib/data/db.ts', 'lib/data/locks.ts', 'lib/renaksi/ganti-nama.ts', 'lib/renaksi/rantai.ts', 'lib/renaksi/pagu.ts', 'lib/data/renaksi-pagu.ts', 'lib/kinerja/pagu-renaksi.ts', 'lib/data/pagu-renaksi-rko.ts', 'lib/data/rencana-aksi.ts', 'app/(dashboard)/rencana-aksi/_components/DataEntryForm.tsx']
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
    await sql`DELETE FROM renaksi_ganti_nama WHERE tahun = ${t}`
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

  console.log('\n── T16: ganti nama entitas menjalar ke baris turunan ──')
  // Ganti nama dulu hanya mengubah baris yang diedit. Karena hierarki Renaksi
  // disambung TEKS NAMA, seluruh baris turunan tetap menunjuk nama lama dan hanya
  // bisa dibetulkan satu per satu lewat form.
  const tuj = (x) => ({ ...dasar(x), level: 'tujuan', sasaran: null, kegiatan: null, sub_kegiatan: null })
  const sas = (x) => ({ ...dasar(x), level: 'sasaran', kegiatan: null, sub_kegiatan: null })
  const prg = (x) => ({ ...dasar(x), level: 'program', kegiatan: null, sub_kegiatan: null })
  const keg = (x) => ({ ...dasar(x), level: 'kegiatan', sub_kegiatan: null })
  const cari = async (lv, ind) => (await RA.listRencanaAksi(TH, lv)).find((x) => x.indikator === ind)

  await RA.upsertRencanaAksi(tuj({ indikator: 'IND-JALAR-T', program: 'TUJ-JALAR' }), UID)
  await RA.upsertRencanaAksi(sas({ indikator: 'IND-JALAR-S1', program: 'SAS-JALAR', tujuan: 'TUJ-JALAR' }), UID)
  await RA.upsertRencanaAksi(sas({ indikator: 'IND-JALAR-S2', program: 'SAS-JALAR', tujuan: 'TUJ-JALAR' }), UID)
  await RA.upsertRencanaAksi(prg({ indikator: 'IND-JALAR-P', program: 'PRG-JALAR', sasaran: 'SAS-JALAR' }), UID)
  await RA.upsertRencanaAksi(keg({ indikator: 'IND-JALAR-K', program: 'PRG-JALAR', kegiatan: 'KEG-JALAR' }), UID)
  await RA.upsertRencanaAksi(dasar({ indikator: 'IND-JALAR-SUB', program: 'PRG-JALAR', kegiatan: 'KEG-JALAR', sub_kegiatan: 'SUB-JALAR' }), UID)
  // Kegiatan senama di program LAIN — tidak boleh ikut terbawa.
  await RA.upsertRencanaAksi(keg({ indikator: 'IND-JALAR-K2', program: 'PRG-LAIN', kegiatan: 'KEG-JALAR' }), UID)
  await RA.upsertRencanaAksi(dasar({ indikator: 'IND-JALAR-SUB2', program: 'PRG-LAIN', kegiatan: 'KEG-JALAR', sub_kegiatan: 'SUB-LAIN' }), UID)

  let t = await cari('tujuan', 'IND-JALAR-T')
  await RA.upsertRencanaAksi(tuj({ id: t.id, indikator: 'IND-JALAR-T', program: 'TUJ BARU', expected_version: t.version }), UID)
  let s1 = await cari('sasaran', 'IND-JALAR-S1')
  let s2 = await cari('sasaran', 'IND-JALAR-S2')
  periksa('Ganti nama tujuan menjalar ke sasaran', s1.tujuan === 'TUJ BARU' && s2.tujuan === 'TUJ BARU', `${s1.tujuan}/${s2.tujuan}`)

  // Satu entitas = banyak baris indikator: baris SENAMA (S2) ikut, kalau tidak
  // sasaran yang sama tampil dua kali dengan nama berbeda.
  const versiS2 = s2.version
  await RA.upsertRencanaAksi(sas({ id: s1.id, indikator: 'IND-JALAR-S1', program: 'SAS BARU', tujuan: 'TUJ BARU', expected_version: s1.version }), UID)
  s1 = await cari('sasaran', 'IND-JALAR-S1')
  s2 = await cari('sasaran', 'IND-JALAR-S2')
  let p = await cari('program', 'IND-JALAR-P')
  periksa('Ganti nama sasaran: baris senama ikut', s1.program === 'SAS BARU' && s2.program === 'SAS BARU', `${s1.program}/${s2.program}`)
  periksa('…versi baris senama ikut naik (tab basi kena 409)', s2.version > versiS2, `v=${versiS2}->${s2.version}`)
  periksa('…program di bawahnya ikut nama baru', p.sasaran === 'SAS BARU', `sasaran=${p.sasaran}`)

  await RA.upsertRencanaAksi(prg({ id: p.id, indikator: 'IND-JALAR-P', program: 'PRG BARU', sasaran: p.sasaran, expected_version: p.version }), UID)
  let k = await cari('kegiatan', 'IND-JALAR-K')
  let sub = await cari('sub-kegiatan', 'IND-JALAR-SUB')
  periksa('Ganti nama program menjalar ke kegiatan & sub', k.program === 'PRG BARU' && sub.program === 'PRG BARU', `${k.program}/${sub.program}`)

  await RA.upsertRencanaAksi(keg({ id: k.id, indikator: 'IND-JALAR-K', program: 'PRG BARU', kegiatan: 'KEG BARU', expected_version: k.version }), UID)
  k = await cari('kegiatan', 'IND-JALAR-K')
  sub = await cari('sub-kegiatan', 'IND-JALAR-SUB')
  const k2 = await cari('kegiatan', 'IND-JALAR-K2')
  const sub2 = await cari('sub-kegiatan', 'IND-JALAR-SUB2')
  periksa('Ganti nama kegiatan menjalar ke sub-kegiatan', sub.kegiatan === 'KEG BARU', `kegiatan=${sub.kegiatan}`)
  periksa('…kegiatan senama di program lain tidak ikut', k2.kegiatan === 'KEG-JALAR' && sub2.kegiatan === 'KEG-JALAR', `${k2.kegiatan}/${sub2.kegiatan}`)

  await RA.upsertRencanaAksi(dasar({ id: sub.id, indikator: 'IND-JALAR-SUB', program: 'PRG BARU', kegiatan: 'KEG BARU', sub_kegiatan: 'SUB BARU', expected_version: sub.version }), UID)
  sub = await cari('sub-kegiatan', 'IND-JALAR-SUB')
  periksa('Ganti nama sub-kegiatan tidak menyentuh sub lain', sub.sub_kegiatan === 'SUB BARU' && (await cari('sub-kegiatan', 'IND-JALAR-SUB2')).sub_kegiatan === 'SUB-LAIN')

  const tahunLain = await RA.listRencanaAksi(TH_SUMBER, 'sasaran')
  periksa('Tahun lain tidak tersentuh ganti nama', tahunLain.every((x) => x.tujuan !== 'TUJ BARU'), `n=${tahunLain.length}`)

  console.log('\n── Catatan ganti nama (renaksi_ganti_nama) — konsep renaksi-terhubung §4 ──')
  // Modul penyalin (E-Anggaran, PK, IKI) mengenali "berganti nama" dari catatan ini;
  // tanpanya ganti nama terbaca "satu hilang + satu baru".
  const catatan = await RA.listGantiNama(TH)
  const ringkas = catatan.map((c) => `${c.level}:${c.dari}>${c.ke}`)
  periksa('Lima ganti nama = lima catatan, urut kejadian', JSON.stringify(ringkas) === JSON.stringify([
    'tujuan:TUJ-JALAR>TUJ BARU', 'sasaran:SAS-JALAR>SAS BARU', 'program:PRG-JALAR>PRG BARU',
    'kegiatan:KEG-JALAR>KEG BARU', 'sub-kegiatan:SUB-JALAR>SUB BARU',
  ]), ringkas.join(' | '))
  const cProg = catatan.find((c) => c.level === 'program')
  periksa('…catatan program membawa induk lama (sasaran)', cProg?.induk === 'SAS BARU' && cProg?.induk_program === null, `${cProg?.induk}/${cProg?.induk_program}`)
  const cSub = catatan.find((c) => c.level === 'sub-kegiatan')
  periksa('…catatan sub-kegiatan membawa kegiatan + program lama', cSub?.induk === 'KEG BARU' && cSub?.induk_program === 'PRG BARU', `${cSub?.induk}/${cSub?.induk_program}`)
  const [oleh] = await sql`SELECT oleh FROM renaksi_ganti_nama WHERE tahun = ${TH} ORDER BY id LIMIT 1`
  periksa('…mencatat pengubahnya', Number(oleh?.oleh) === UID, `oleh=${oleh?.oleh}`)

  // Simpan tanpa mengubah nama entitas (satuan saja) tidak boleh menulis catatan.
  sub = await cari('sub-kegiatan', 'IND-JALAR-SUB')
  await RA.upsertRencanaAksi(dasar({ id: sub.id, indikator: 'IND-JALAR-SUB', program: 'PRG BARU', kegiatan: 'KEG BARU', sub_kegiatan: 'SUB BARU', satuan: 'Unit', expected_version: sub.version }), UID)
  periksa('Simpan tanpa ganti nama tidak menulis catatan', (await RA.listGantiNama(TH)).length === 5, `n=${(await RA.listGantiNama(TH)).length}`)

  // Ganti nama yang DITOLAK (versi basi) tidak boleh meninggalkan catatan.
  sub = await cari('sub-kegiatan', 'IND-JALAR-SUB')
  const eBasi = await tangkap(() => RA.upsertRencanaAksi(dasar({ id: sub.id, indikator: 'IND-JALAR-SUB', program: 'PRG BARU', kegiatan: 'KEG BARU', sub_kegiatan: 'SUB GAGAL', expected_version: sub.version + 99 }), UID))
  const sesudahGagal = await RA.listGantiNama(TH)
  periksa('Ganti nama ditolak 409 → tanpa catatan', eBasi === 'RaVersionConflictError' && sesudahGagal.length === 5 && !sesudahGagal.some((c) => c.ke === 'SUB GAGAL'), `${eBasi} n=${sesudahGagal.length}`)
  periksa('Catatan tidak bocor ke tahun lain', (await RA.listGantiNama(TH_SUMBER)).length === 0)

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

  // migration-renaksi-realisasi-null: NULL = belum diisi, 0 = nol nyata. Dulu kolomnya
  // NOT NULL DEFAULT 0, jadi Progres Negatif yang memang 0 terbaca "belum diisi".
  console.log('\n── Realisasi triwulan: kosong ≠ nol ──')
  const triwulan = (x) => [x.q1_realisasi, x.q2_realisasi, x.q3_realisasi, x.q4_realisasi]
    .map((v) => (v == null ? null : Number(v)))
  const idN = await RA.upsertRencanaAksi({ ...dasar({ indikator: 'IND-nol', jenis: 'Progres Negatif' }), level: 'sasaran', program: 'SAS-NOL', kegiatan: null, sub_kegiatan: null }, UID)
  let rn = await RA.getRencanaAksiById(idN)
  periksa('Baris baru: keempat triwulan NULL (belum diisi), bukan 0', JSON.stringify(triwulan(rn)) === '[null,null,null,null]', JSON.stringify(triwulan(rn)))
  await RA.updateQuarter(idN, 2, 4, 0, UID, rn.version)
  rn = await RA.getRencanaAksiById(idN)
  periksa('Modal TW: 0 tersimpan sebagai 0 nyata', JSON.stringify(triwulan(rn)) === '[null,0,null,null]', JSON.stringify(triwulan(rn)))
  await RA.updateQuarter(idN, 2, 4, null, UID, rn.version)
  rn = await RA.getRencanaAksiById(idN)
  periksa('Modal TW dikosongkan → NULL lagi', rn.q2_realisasi === null, `q2=${rn.q2_realisasi}`)
  await RA.updateQuarter(idN, 1, 4, 3, UID, rn.version)
  rn = await RA.getRencanaAksiById(idN)
  await RA.updateJenis(idN, 'Akumulatif', UID, rn.version)
  rn = await RA.getRencanaAksiById(idN)
  periksa('Ganti jenis (tanpa bulanan) tidak mengubah NULL jadi 0', JSON.stringify(triwulan(rn)) === '[3,null,null,null]', JSON.stringify(triwulan(rn)))
  await RA.resetRealisasi(idN, UID)
  rn = await RA.getRencanaAksiById(idN)
  periksa('Reset realisasi → NULL (belum diisi), bukan 0', JSON.stringify(triwulan(rn)) === '[null,null,null,null]', JSON.stringify(triwulan(rn)))

  const idM = await RA.upsertRencanaAksi(dasar({ indikator: 'IND-nol-bulanan', jenis: 'Progres Negatif' }), UID)
  let rm = await RA.getRencanaAksiById(idM)
  await RA.updateBulanRealisasi(idM, bulan(null, 0, null, null, null, null, 5), UID, rm.version)
  rm = await RA.getRencanaAksiById(idM)
  periksa('Bulanan: TW berisi nol nyata = 0, TW tanpa bulan terisi = NULL',
    JSON.stringify(triwulan(rm)) === '[0,null,5,null]', JSON.stringify(triwulan(rm)))
  await RA.updateJenis(idM, 'Akumulatif', UID, rm.version)
  rm = await RA.getRencanaAksiById(idM)
  periksa('…ganti jenis menghitung ulang, TW kosong tetap NULL', JSON.stringify(triwulan(rm)) === '[0,null,5,null]', JSON.stringify(triwulan(rm)))
  // Target bulanan hanya Januari: TW II–IV target tidak punya bulan terisi → tetap 0 (NOT NULL),
  // tidak ikut aturan "kosong = NULL" milik realisasi.
  await RA.upsertRencanaAksi(dasar({ id: idM, indikator: 'IND-nol-bulanan', jenis: 'Progres Positif', bulan_target: bulan(5), expected_version: rm.version }), UID)
  rm = await RA.getRencanaAksiById(idM)
  periksa('…lewat form Data Entry juga (COALESCE tidak menghidupkan 0)', JSON.stringify(triwulan(rm)) === '[0,null,5,null]', JSON.stringify(triwulan(rm)))
  const targetTw = [rm.q1_target, rm.q2_target, rm.q3_target, rm.q4_target].map((v) => (v == null ? null : Number(v)))
  periksa('Target triwulan dari bulan target yang kosong = 0, bukan NULL', JSON.stringify(targetTw) === '[5,0,0,0]', JSON.stringify(targetTw))
  await RA.updateJenis(idM, 'Akumulatif', UID, rm.version)
  rm = await RA.getRencanaAksiById(idM)
  periksa('…juga sesudah ganti jenis', [rm.q2_target, rm.q3_target, rm.q4_target].every((v) => v !== null && Number(v) === 0),
    JSON.stringify([rm.q1_target, rm.q2_target, rm.q3_target, rm.q4_target]))

  await RA.updateQuarter(idN, 3, 4, 2, UID, (await RA.getRencanaAksiById(idN)).version)
  await sql`UPDATE rencana_aksi SET tahun = ${TH_SUMBER} WHERE id = ${idN}`
  await sql`DELETE FROM rencana_aksi WHERE tahun = ${TH_TUJUAN}`
  await sql`DELETE FROM blud_locks WHERE entity = 'RA_DUPLIKASI' AND key_id IN (${[String(TH_TUJUAN), String(TH_SUMBER)]})`
  await RA.duplicateYear(TH_SUMBER, TH_TUJUAN, UID)
  const [salinanNol] = await sql`SELECT q1_realisasi, q2_realisasi, q3_realisasi, q4_realisasi FROM rencana_aksi WHERE tahun = ${TH_TUJUAN} AND indikator = 'IND-nol'`
  periksa('Salin ke tahun lain: realisasi ikut KOSONG (NULL), bukan 0', salinanNol && JSON.stringify(triwulan(salinanNol)) === '[null,null,null,null]',
    JSON.stringify(salinanNol && triwulan(salinanNol)))

  // Form Data Entry: field target menampilkan 0 sebagai KOSONG (placeholder "0"). Selama
  // field itu `required`, browser menolak submit karena nilainya kosong — Simpan seolah
  // tidak melakukan apa pun, tanpa pesan, dan seluruh isian (termasuk 12 target bulanan)
  // tidak pernah tersimpan. Dijaga di sini karena tidak ada uji DB yang bisa melihatnya.
  console.log('\n── Form Data Entry: Simpan tidak diblokir validasi bawaan browser ──')
  const formSrc = fs.readFileSync(
    path.join(repo, 'app/(dashboard)/rencana-aksi/_components/DataEntryForm.tsx'), 'utf8',
  )
  const awalTarget = formSrc.indexOf('Target RPJMD')
  const blokTarget = formSrc.slice(awalTarget, formSrc.indexOf('Kedua angka di atas adalah pembagi'))
  const tanpaKomentar = blokTarget.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
  periksa('Blok Target RPJMD–Tahunan ditemukan di form', awalTarget > 0 && blokTarget.length > 100, String(blokTarget.length))
  periksa('Field target 0-tampil-kosong TIDAK `required` (submit tidak diblokir browser)',
    !/\brequired\b/.test(tanpaKomentar))
  periksa('Keduanya masih menampilkan 0 sebagai kosong (placeholder "0" tetap ada)',
    (tanpaKomentar.match(/=== 0 \? ''/g) ?? []).length === 2, String((tanpaKomentar.match(/=== 0 \? ''/g) ?? []).length))
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
