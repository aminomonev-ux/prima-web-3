#!/usr/bin/env node
// scripts/test-blud-race-perubahan.mjs — R7: transaksi belanja × simpan/hapus DPA Perubahan.
//
// Yang diuji KODE SUNGGUHAN (`createTx`, `saveDpa`, `deleteDpaVersi`), bukan cermin
// kuerinya. Supaya deterministik, koneksi ketiga ("penahan") memegang satu kunci
// pagu sehingga salah satu transaksi berhenti tepat di titik yang diinginkan;
// keadaan "sedang menunggu kunci" dibaca dari information_schema.innodb_trx.
//
//   S (simpan): belanja Rp 25 jt ke C sementara Perubahan memotong C 30 → 20 jt.
//               Belanja ditahan SESUDAH snapshot-nya lahir; Perubahan commit di sela.
//   H (hapus):  belanja Rp 10 jt ke D (rekening yang cuma ada di Perubahan) sementara
//               Perubahan dihapus. Penghapus ditahan SESUDAH membaca daftar rekening
//               berealisasi — D belum ada di situ.
//
// Invarian: tidak ada rekening yang terserapnya melebihi pagu (yatim = pagu 0).
//
// Dijalankan pada TIGA varian, supaya terbukti pagarnya yang menahan, bukan kebetulan:
//   dengan            — kode apa adanya: invarian HARUS utuh di S dan H
//   tanpa-semua       — kunci setahun berbagi + baca terkunci dibuang: S dan H HARUS jebol
//   tanpa-kunci-tahun — hanya kunci setahun dibuang: H HARUS jebol
//
// AMAN: hanya tahun anggaran 2099; dibersihkan di awal dan di akhir tiap skenario.
// USAGE: node scripts/test-blud-race-perubahan.mjs
import { kompilasiUji } from './_kompilasi-uji.mjs'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import Module from 'node:module'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const iniBerkas = fileURLToPath(import.meta.url)
const repo = path.resolve(path.dirname(iniBerkas), '..')
const cache = path.join(repo, 'node_modules', '.cache', 'blud-race-perubahan')
const ENTRI = ['lib/data/db.ts', 'lib/blud/data.ts', 'lib/blud/realisasi-data.ts', 'lib/blud/pagu.ts', 'lib/blud/row-map.ts']

// Mutasi = membuang pagar R7 dari SALINAN kode. Kalau teks yang dicari tidak ada,
// mutannya tidak terbentuk dan uji ini harus berhenti — mutan yang diam-diam sama
// dengan aslinya akan "membuktikan" apa pun.
const BARIS_KUNCI_TAHUN = 'await kunciVersiTahunBerbagi(tx, tahun)'
const BACA_TERKUNCI = 'sumberPaguTahun(tx, tahun, {}, { terkunci: true })'
const VARIAN = {
  'dengan': [],
  'tanpa-semua': [[BARIS_KUNCI_TAHUN, ''], [BACA_TERKUNCI, 'sumberPaguTahun(tx, tahun)']],
  'tanpa-kunci-tahun': [[BARIS_KUNCI_TAHUN, '']],
}

// ─── Anak: satu varian, dua skenario ─────────────────────────────────────────
if (process.argv[2] === '--anak') {
  const outDir = process.argv[3]
  for (const line of fs.readFileSync(path.join(repo, '.env.local'), 'utf8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (i === -1) continue
    let v = t.slice(i + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    if (!(t.slice(0, i).trim() in process.env)) process.env[t.slice(0, i).trim()] = v
  }
  const resolveAsli = Module._resolveFilename
  Module._resolveFilename = function (permintaan, ...sisa) {
    if (permintaan.startsWith('@/')) return path.join(outDir, permintaan.slice(2) + '.js')
    return resolveAsli.call(this, permintaan, ...sisa)
  }
  const mysql = require('mysql2/promise')
  const { sql } = require(path.join(outDir, 'lib/data/db.js'))
  const { saveDpa, savePergeseran, deleteDpaVersi, getDpaVersion, getPergeseranByDate } = require(path.join(outDir, 'lib/blud/data.js'))
  const { createTx } = require(path.join(outDir, 'lib/blud/realisasi-data.js'))
  const { getPaguMap } = require(path.join(outDir, 'lib/blud/pagu.js'))
  const { pergeseranKeDpaInput } = require(path.join(outDir, 'lib/blud/row-map.js'))

  const TAHUN = 2099, JT = 1_000_000
  const V0 = '2099-01-10', P1 = '2099-03-31', M = '2099-10-09'
  const USER = Number((await sql`SELECT MIN(id) AS id FROM users`)[0]?.id ?? 1)

  const pohon = (angka) => {
    const anak = Object.entries(angka)
    return [
      { kode_rekening: '5.1', uraian: 'Induk', vol: null, satuan: null, harga: null, jumlah: anak.reduce((s, [, v]) => s + v, 0) * JT,
        penanggung_jawab: null, keterangan: null, tipe_baris: 'MASTER', row_id: 'r-I', anggaran_key: 'AK-race-I', parent_id: null, urutan: 0 },
      ...anak.map(([n, v], i) => ({ kode_rekening: `5.1.0${i + 1}`, uraian: `Rekening ${n}`, vol: 1, satuan: 'paket',
        harga: v * JT, jumlah: v * JT, penanggung_jawab: null, keterangan: null, tipe_baris: 'CHILD', row_id: `r-${n}`,
        anggaran_key: `AK-race-${n}`, parent_id: 'r-I', urutan: i + 1 })),
    ]
  }
  async function bersihkan() {
    await sql`DELETE FROM blud_realisasi_tx WHERE tahun_anggaran = ${TAHUN}`
    await sql`DELETE FROM blud_dpa_perubahan WHERE tahun_anggaran = ${TAHUN}`
    await sql`DELETE FROM pergeseran_dpa WHERE tahun_anggaran = ${TAHUN}`
    await sql`DELETE FROM dpa_blud WHERE tahun_anggaran = ${TAHUN}`
    await sql`DELETE FROM blud_riwayat_simpan WHERE tahun_anggaran = ${TAHUN}`
    await sql`DELETE FROM blud_periode WHERE tahun_anggaran = ${TAHUN}`
    await sql`DELETE FROM blud_locks WHERE key_id LIKE ${`${TAHUN}:%`} OR key_id = ${String(TAHUN)}`
  }
  /** DPA murni + pergeseran P1 (A80 B70 C30) + B terserap 5 jt — supaya penyimpan/penghapus punya kunci yang dipegang. */
  async function dasar() {
    await bersihkan()
    await saveDpa(TAHUN, V0, pohon({ A: 80, B: 70, C: 30 }), USER, 0)
    const pg = pohon({ A: 80, B: 70, C: 30 }).map(r => ({ ...r, vol_p: r.vol, harga_p: r.harga, pergeseran: r.jumlah, bertambah_berkurang: 0 }))
    await savePergeseran(TAHUN, P1, V0, pg, USER, 0)
    await belanja('AK-race-B', 5 * JT)
  }
  function belanja(key, nilai) {
    return createTx(TAHUN, 9, {
      tahun_anggaran: TAHUN, bulan: 9, tanggal: '2099-09-15', jenis: 'BELANJA', uraian: 'Uji balapan R7',
      kas_masuk: 0, kas_keluar: nilai, bank_masuk: 0, bank_keluar: 0,
      alokasi: [{ anggaran_key: key, nilai }], potongan: [], belum_berrekening: false,
    }, USER)
  }
  async function barisPerubahan(ubah, tambahD) {
    const rows = (await getPergeseranByDate(TAHUN, P1)).map((p, i) => pergeseranKeDpaInput(p, i))
    for (const r of rows) {
      const n = r.row_id.slice(2)
      if (ubah[n] != null) { r.harga = ubah[n] * JT; r.jumlah = ubah[n] * JT }
    }
    if (tambahD) rows.push({ ...rows[rows.length - 1], row_id: 'r-D', anggaran_key: 'AK-race-D', kode_rekening: '5.1.04', uraian: 'Rekening D', harga: 25 * JT, jumlah: 25 * JT, urutan: 9 })
    rows[0].jumlah = rows.filter(r => r.parent_id).reduce((s, r) => s + r.jumlah, 0)
    return rows
  }
  const koneksi = () => mysql.createConnection({
    host: process.env.MYSQL_HOST, port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER, password: process.env.MYSQL_PASSWORD, database: process.env.MYSQL_DATABASE,
  })
  async function penahan(key) {
    const c = await koneksi()
    await c.beginTransaction()
    await c.query('INSERT IGNORE INTO blud_locks (entity, key_id, version) VALUES (?, ?, 0)', ['realisasi_pagu', `${TAHUN}:${key}`])
    await c.query('SELECT version FROM blud_locks WHERE entity = ? AND key_id = ? FOR UPDATE', ['realisasi_pagu', `${TAHUN}:${key}`])
    return c
  }
  // `performance_schema.data_lock_waits`, BUKAN `information_schema.innodb_trx`: yang
  // kedua dilayani dari cache InnoDB yang hanya disegarkan kalau pembacaan terakhirnya
  // > 0,1 detik lalu — dipoll tiap 40 ms ia tidak pernah segar dan selalu berbunyi 0
  // (terjadi 2026-10-08: uji menunggu 15 detik lalu jalan terus, urutannya jadi
  // kebetulan waktu). Koneksinya sendiri supaya tidak antre di pool yang sedang dipakai.
  const pengamat = await koneksi()
  const menunggu = async () => Number((await pengamat.query(
    'SELECT COUNT(*) AS n FROM performance_schema.data_lock_waits'))[0][0]?.n ?? 0)
  async function tungguSampai(syarat, ms = 15000) {
    const batas = Date.now() + ms
    while (Date.now() < batas) { if (await syarat()) return true; await new Promise(r => setTimeout(r, 40)) }
    return false
  }
  const lacak = (p) => { const o = { selesai: false, hasil: null }; o.janji = p.then(v => { o.selesai = true; o.hasil = { ok: true, v } }, e => { o.selesai = true; o.hasil = { ok: false, nama: e?.name ?? String(e) } }); return o }
  async function jebol() {
    const serap = await sql`SELECT anggaran_key AS k, SUM(nilai) AS n FROM blud_realisasi_alokasi WHERE tahun_anggaran = ${TAHUN} GROUP BY anggaran_key`
    const pagu = await getPaguMap(TAHUN)
    return serap.filter(r => Number(r.n) > (pagu.get(String(r.k))?.pagu ?? 0) + 0.005)
      .map(r => `${String(r.k).replace('AK-race-', '')} terserap ${Number(r.n) / JT}jt > pagu ${(pagu.get(String(r.k))?.pagu ?? 0) / JT}jt`)
  }

  const laporan = {}
  try {
    // ── S: belanja × simpan Perubahan ──────────────────────────────────────────
    await dasar()
    {
      const tahan = await penahan('AK-race-C')
      const b = lacak(belanja('AK-race-C', 25 * JT))
      const berhenti = await tungguSampai(async () => (await menunggu()) >= 1)
      const p = lacak((async () => saveDpa(TAHUN, M, await barisPerubahan({ A: 95, C: 20 }, true), USER,
        await getDpaVersion(TAHUN, M), false, false, false, { sumber_dasar: 'PERGESERAN', versi_dasar: P1 }))())
      await tungguSampai(async () => p.selesai || (await menunggu()) >= 2)
      const urutan = p.selesai ? 'Perubahan commit selagi belanja tertahan' : 'Perubahan ikut menunggu'
      await tahan.commit(); await tahan.end()
      await Promise.all([b.janji, p.janji])
      laporan.S = { berhenti, urutan, belanja: b.hasil, simpan: p.hasil, jebol: await jebol() }
    }
    // ── H: belanja × hapus Perubahan ───────────────────────────────────────────
    await dasar()
    await saveDpa(TAHUN, M, await barisPerubahan({ A: 95, C: 20 }, true), USER, 0, false, false, false,
      { sumber_dasar: 'PERGESERAN', versi_dasar: P1 })
    {
      const tahan = await penahan('AK-race-B')
      const h = lacak(deleteDpaVersi(TAHUN, M))
      const berhenti = await tungguSampai(async () => (await menunggu()) >= 1)
      const b = lacak(belanja('AK-race-D', 10 * JT))
      await tungguSampai(async () => b.selesai || (await menunggu()) >= 2)
      const urutan = b.selesai ? 'belanja commit selagi penghapus tertahan' : 'belanja ikut menunggu'
      await tahan.commit(); await tahan.end()
      await Promise.all([h.janji, b.janji])
      laporan.H = { berhenti, urutan, hapus: h.hasil, belanja: b.hasil, jebol: await jebol() }
    }
  } finally {
    await bersihkan()
    await pengamat.end()
  }
  process.stdout.write('HASIL ' + JSON.stringify(laporan, (k, v) => (k === 'v' ? undefined : v)) + '\n')
  process.exit(0)
}

// ─── Induk: bangun tiga varian, jalankan masing-masing ───────────────────────
let gagal = 0, jalan = 0
function cek(nama, benar, tambahan = '') {
  jalan++
  if (!benar) gagal++
  console.log(`${benar ? '  ok  ' : ' GAGAL'} ${nama.padEnd(70)} ${tambahan}`)
}

function salinPohon(dari, ke) {
  fs.mkdirSync(ke, { recursive: true })
  for (const e of fs.readdirSync(dari, { withFileTypes: true })) {
    const a = path.join(dari, e.name), b = path.join(ke, e.name)
    if (e.isDirectory()) salinPohon(a, b)
    else fs.copyFileSync(a, b)
  }
}

function bangun(nama) {
  const mutasi = VARIAN[nama]
  const outDir = path.join(cache, nama, 'js')
  if (!mutasi.length) { kompilasiUji(repo, outDir, ENTRI); return outDir }
  // Sumber mutan di folder temp, BUKAN di bawah node_modules: tsc tidak mengeluarkan
  // berkas impor yang tinggal di node_modules (dianggap pustaka luar), jadi `./lock`
  // dkk. tidak pernah tertulis. Keluarannya tetap di node_modules/.cache supaya
  // `require('mysql2')` saat jalan menemukan paket milik repo ini.
  const akar = path.join(os.tmpdir(), 'prima-race-perubahan', nama)
  fs.rmSync(akar, { recursive: true, force: true })
  // Keluaran lama dibuang juga: .js basi dari kompilasi sebelumnya bisa menutupi
  // berkas yang tidak lagi tertulis, dan mutannya diam-diam berjalan dengan kode lain.
  fs.rmSync(outDir, { recursive: true, force: true })
  for (const d of ['lib', 'types']) salinPohon(path.join(repo, d), path.join(akar, d))
  const berkas = path.join(akar, 'lib/blud/realisasi-data.ts')
  let isi = fs.readFileSync(berkas, 'utf8')
  for (const [cari, ganti] of mutasi) {
    if (!isi.includes(cari)) throw new Error(`Mutan ${nama} tidak terbentuk: "${cari}" tidak ada di realisasi-data.ts`)
    isi = isi.split(cari).join(ganti)
  }
  fs.writeFileSync(berkas, isi)
  // Bukan `kompilasiUji`: ia menjalankan `npx tsc` dengan cwd = akar sumbernya, dan di
  // folder temp tanpa node_modules npx tidak menemukan TypeScript milik repo — nol
  // berkas tertulis, tanpa galat. Konfigurasinya sama; yang beda cuma tsc-nya pasti.
  fs.mkdirSync(outDir, { recursive: true })
  const tsconfig = path.join(outDir, 'tsconfig.uji.json')
  fs.writeFileSync(tsconfig, JSON.stringify({
    compilerOptions: {
      outDir, rootDir: akar, baseUrl: akar, paths: { '@/*': ['*'] },
      module: 'commonjs', target: 'es2020', moduleResolution: 'node',
      esModuleInterop: true, skipLibCheck: true, allowJs: true, resolveJsonModule: true,
      noEmitOnError: false, types: [],
    },
    files: ENTRI.map(e => path.join(akar, e)),
  }))
  spawnSync(process.execPath, [path.join(repo, 'node_modules', 'typescript', 'bin', 'tsc'), '-p', tsconfig], { cwd: repo, encoding: 'utf8' })
  for (const e of ENTRI) {
    const js = path.join(outDir, e.replace(/\.ts$/, '.js'))
    if (!fs.existsSync(js)) throw new Error(`Mutan ${nama}: ${e} tidak menghasilkan ${js}`)
  }
  return outDir
}

function jalankan(nama) {
  const outDir = bangun(nama)
  const r = spawnSync(process.execPath, [iniBerkas, '--anak', outDir], { cwd: repo, encoding: 'utf8', timeout: 180000 })
  const baris = (r.stdout ?? '').split('\n').find(l => l.startsWith('HASIL '))
  if (!baris) {
    console.log(r.stdout, r.stderr)
    throw new Error(`varian ${nama} tidak memulangkan hasil (exit ${r.status})`)
  }
  return JSON.parse(baris.slice(6))
}

const hasil = {}
for (const nama of Object.keys(VARIAN)) {
  hasil[nama] = jalankan(nama)
  const h = hasil[nama]
  console.log(`\n── varian ${nama} ──`)
  console.log(`   S: ${h.S.urutan}; belanja ${h.S.belanja.ok ? 'commit' : h.S.belanja.nama}; simpan Perubahan ${h.S.simpan.ok ? 'commit' : h.S.simpan.nama}; jebol: ${h.S.jebol.join('; ') || '-'}`)
  console.log(`   H: ${h.H.urutan}; hapus Perubahan ${h.H.hapus.ok ? 'commit' : h.H.hapus.nama}; belanja ${h.H.belanja.ok ? 'commit' : h.H.belanja.nama}; jebol: ${h.H.jebol.join('; ') || '-'}`)
  cek(`${nama}: kedua skenario benar-benar tertahan di titik yang dimaksud`, h.S.berhenti && h.H.berhenti)
}

const d = hasil['dengan'], t = hasil['tanpa-semua'], k = hasil['tanpa-kunci-tahun']
console.log('\n── Putusan ──')
cek('dengan: S — invarian utuh (pagu tidak di bawah realisasi)', d.S.jebol.length === 0, d.S.jebol.join('; '))
cek('dengan: S — belanja menang duluan, simpan Perubahan ditolak R2', d.S.belanja.ok && d.S.simpan.nama === 'BludPaguDibawahRealisasiError')
cek('dengan: H — invarian utuh (tidak ada realisasi yatim)', d.H.jebol.length === 0, d.H.jebol.join('; '))
cek('dengan: H — hapus jalan, belanja ke D ditolak (D tidak berpagu lagi)', d.H.hapus.ok && d.H.belanja.nama === 'BludPaguTerlampauiError')
cek('tanpa-semua: S JEBOL (pagu dibaca dari snapshot basi)', t.S.jebol.length > 0, t.S.jebol.join('; '))
cek('tanpa-semua: H JEBOL (rekening D jadi yatim)', t.H.jebol.length > 0, t.H.jebol.join('; '))
cek('tanpa-kunci-tahun: H JEBOL — kunci setahun yang menahan, bukan baca terkunci', k.H.jebol.length > 0, k.H.jebol.join('; '))

console.log(`\n${jalan - gagal} pemeriksaan LULUS · ${gagal} GAGAL`)
process.exit(gagal > 0 ? 1 : 0)
