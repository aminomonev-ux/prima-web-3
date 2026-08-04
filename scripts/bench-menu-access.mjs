// Ukur beban & perilaku cache resolusi izin menu.
//   node scripts/bench-menu-access.mjs
//
// MENYENTUH DB: mengisi `menu_role_access` + `menu_user_access` dengan baris uji,
// lalu MENGHAPUSNYA di `finally`. Kedua tabel dikembalikan ke keadaan semula
// (dicatat dulu sebelum diisi) — kalau skrip mati di tengah, jalankan ulang.
//
// Skala yang ditiru = skala nyata yang disebut pemilik: 50 pengguna serentak
// sebagai batas atas, ~20 sebagai keadaan wajar. Mengukur di angka itu, bukan di
// angka yang enak dipandang.
//
// Jumlah query dihitung dari `SHOW GLOBAL STATUS LIKE 'Questions'`. Global, bukan
// per-sesi, karena pool memakai banyak koneksi. Konsekuensinya: kalau ada proses
// lain memakai DB yang sama saat skrip jalan, angkanya ikut terhitung.
import fs from 'node:fs'
import path from 'node:path'
import Module from 'node:module'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { BERKAS_MESIN, BERKAS_PERAN, kompilasi } from './_kompilasi-izin.mjs'

const require = createRequire(import.meta.url)
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outDir = path.join(repo, 'node_modules', '.cache', 'menu-access-bench')

for (const line of fs.readFileSync(path.join(repo, '.env.local'), 'utf8').split('\n')) {
  const t = line.trim()
  if (!t || t.startsWith('#')) continue
  const i = t.indexOf('=')
  if (i === -1) continue
  let v = t.slice(i + 1).trim()
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
  if (!(t.slice(0, i).trim() in process.env)) process.env[t.slice(0, i).trim()] = v
}

// Impor `@/...` tak ter-resolve saat compile — .js tetap ditulis, dan jalurnya
// dibelokkan saat runtime di bawah.
kompilasi(repo, outDir, [...BERKAS_MESIN, ...BERKAS_PERAN], { abaikanGagal: true })

const resolveAsli = Module._resolveFilename
Module._resolveFilename = function (permintaan, ...sisa) {
  if (permintaan.startsWith('@/')) return path.join(outDir, permintaan.slice(2) + '.js')
  return resolveAsli.call(this, permintaan, ...sisa)
}

const { sql, bulkInsert } = require(path.join(outDir, 'lib/data/db.js'))
const { MENU_BLUD, izinMenu } = require(path.join(outDir, 'lib/blud/peran.js'))
const ma = require(path.join(outDir, 'lib/data/menu-access.js'))

const PERAN = ['ADMIN', 'PROGRAM', 'KEUANGAN', 'PERBENDAHARAAN']
const APP = 'blud'

async function questions() {
  const rows = await sql`SHOW GLOBAL STATUS LIKE 'Questions'`
  return Number(rows[0].Value)
}

function ms(t) { return `${t.toFixed(1)} ms` }

let gagal = 0
function periksa(nama, benar, tambahan = '') {
  if (!benar) gagal++
  console.log(`${benar ? '  ok  ' : ' GAGAL'} ${nama.padEnd(50)} ${tambahan}`)
}

const semulaPeran = await sql`SELECT * FROM menu_role_access`
const semulaOrang = await sql`SELECT * FROM menu_user_access`

try {
  if (semulaPeran.length || semulaOrang.length) {
    console.log(`⚠ tabel tidak kosong (${semulaPeran.length}/${semulaOrang.length} baris) — akan dipulihkan di akhir\n`)
  }

  // ── Isi keadaan TERBURUK yang masuk akal ──────────────────────────────────
  // Bukan tabel kosong: 4 peran x 12 menu semuanya punya baris, plus perkecualian
  // untuk 50 orang. Kalau angkanya bagus di sini, di keadaan nyata lebih ringan.
  const [{ id: userId }] = await sql`SELECT id FROM users ORDER BY id LIMIT 1`
  const barisPeran = []
  for (const p of PERAN) for (const m of MENU_BLUD) {
    barisPeran.push([APP, p, `blud.${m.replace(/-/g, '_')}`, 'LIHAT', userId])
  }
  await sql`DELETE FROM menu_role_access`
  await bulkInsert('menu_role_access', ['app_key', 'role', 'menu_key', 'izin', 'updated_by'], barisPeran)

  const idUser = (await sql`SELECT id FROM users LIMIT 50`).map(r => r.id)
  await sql`DELETE FROM menu_user_access`
  if (idUser.length) {
    await bulkInsert('menu_user_access', ['user_id', 'app_key', 'menu_key', 'izin', 'updated_by'],
      idUser.map(id => [id, APP, 'blud.dpa', 'EDIT', userId]))
  }
  console.log(`Data uji: ${barisPeran.length} baris peran · ${idUser.length} baris orang\n`)

  // ── 1. Berapa query sebenarnya per pemanggilan ────────────────────────────
  console.log('── Jumlah query ──')
  ma.bersihkanCacheIzin()
  let q0 = await questions()
  await ma.getPetaPenimpa(1, 'KEUANGAN', APP)
  let dipakai = await questions() - q0 - 1   // -1 = query SHOW STATUS itu sendiri
  periksa('panggilan pertama (cache dingin)', dipakai === 2, `${dipakai} query`)

  q0 = await questions()
  for (let i = 0; i < 100; i++) await ma.getPetaPenimpa(1, 'KEUANGAN', APP)
  dipakai = await questions() - q0 - 1
  periksa('100 panggilan berikutnya (cache panas)', dipakai === 0, `${dipakai} query`)

  // Satu query per ORANG + satu per PERAN, bukan satu per pemanggilan: dua cache
  // terpisah, dan yang peran dipakai bersama semua orang berperan sama.
  ma.bersihkanCacheIzin()
  const contoh = idUser.slice(0, 20)
  q0 = await questions()
  for (const p of PERAN) for (const id of contoh) await ma.getPetaPenimpa(id, p, APP)
  dipakai = await questions() - q0 - 1
  periksa(`${contoh.length} orang x ${PERAN.length} peran, berurutan`,
    dipakai === contoh.length + PERAN.length,
    `${dipakai} query untuk ${contoh.length * PERAN.length} pemanggilan`
    + ` (${contoh.length} orang + ${PERAN.length} peran)`)

  // Inilah yang dijaga penyimpanan-janji: tanpa itu, 50 permintaan yang datang
  // berbarengan tepat saat cache dingin semuanya meleset lebih dulu → 100 query.
  ma.bersihkanCacheIzin()
  q0 = await questions()
  await Promise.all(Array.from({ length: 50 }, () => ma.getPetaPenimpa(1, 'KEUANGAN', APP)))
  dipakai = await questions() - q0 - 1
  periksa('50 permintaan BERBARENGAN saat cache dingin', dipakai === 2,
    `${dipakai} query (tanpa penggabungan: 100)`)

  // ── 2. Cache benar-benar kedaluwarsa ──────────────────────────────────────
  console.log('\n── Kedaluwarsa cache (TTL 15 detik) ──')
  ma.bersihkanCacheIzin()
  await ma.getPetaPenimpa(1, 'KEUANGAN', APP)
  q0 = await questions()
  await ma.getPetaPenimpa(1, 'KEUANGAN', APP)
  periksa('dalam 15 detik: tidak menyentuh DB', (await questions() - q0 - 1) === 0)

  console.log('   menunggu 16 detik…')
  await new Promise(r => setTimeout(r, 16_000))
  q0 = await questions()
  await ma.getPetaPenimpa(1, 'KEUANGAN', APP)
  dipakai = await questions() - q0 - 1
  periksa('sesudah 16 detik: membaca ulang', dipakai === 2, `${dipakai} query`)

  // ── 3. Simpan membersihkan cache seketika ─────────────────────────────────
  console.log('\n── Simpan membersihkan cache di prosesnya sendiri ──')
  await ma.getPetaPenimpa(1, 'KEUANGAN', APP)
  await ma.simpanIzinPeran(APP, 'KEUANGAN', new Map([['blud.dpa', 'EDIT']]), userId)
  const sesudah = await ma.getPetaPenimpa(1, 'KEUANGAN', APP)
  periksa('perubahan langsung terbaca, tanpa menunggu TTL',
    sesudah.get('blud.dpa') === 'EDIT', `blud.dpa=${sesudah.get('blud.dpa')}`)

  // ── 4. Beban pada skala nyata ─────────────────────────────────────────────
  console.log('\n── Beban: 20 & 50 pengguna serentak ──')
  for (const jumlah of [20, 50]) {
    const orang = Array.from({ length: jumlah }, (_, i) => idUser[i % idUser.length])

    ma.bersihkanCacheIzin()
    let t = performance.now()
    q0 = await questions()
    await Promise.all(orang.map((id, i) => ma.getPetaPenimpa(id, PERAN[i % PERAN.length], APP)))
    const dinginMs = performance.now() - t
    const dinginQ = await questions() - q0 - 1

    t = performance.now()
    q0 = await questions()
    await Promise.all(orang.map((id, i) => ma.getPetaPenimpa(id, PERAN[i % PERAN.length], APP)))
    const panasMs = performance.now() - t
    const panasQ = await questions() - q0 - 1

    console.log(`  ${String(jumlah).padStart(2)} pengguna serentak`
      + ` · cache dingin ${ms(dinginMs).padStart(9)} / ${String(dinginQ).padStart(3)} query`
      + ` · cache panas ${ms(panasMs).padStart(8)} / ${panasQ} query`)
  }

  // ── 5. Perbandingan: berapa mahal dibanding menghitung dari kode saja ─────
  console.log('\n── Pembanding ──')
  let t = performance.now()
  for (let i = 0; i < 10_000; i++) for (const m of MENU_BLUD) izinMenu('KEUANGAN', m, null)
  console.log(`  10.000 x 12 menu murni di memori: ${ms(performance.now() - t)}`)

  t = performance.now()
  for (let i = 0; i < 1000; i++) await ma.getPetaPenimpa(1, 'KEUANGAN', APP)
  console.log(`  1.000 x petaPenimpa lewat cache:   ${ms(performance.now() - t)}`)

} finally {
  await sql`DELETE FROM menu_role_access`
  await sql`DELETE FROM menu_user_access`
  if (semulaPeran.length) {
    await bulkInsert('menu_role_access', ['app_key', 'role', 'menu_key', 'izin', 'updated_by'],
      semulaPeran.map(r => [r.app_key, r.role, r.menu_key, r.izin, r.updated_by]))
  }
  if (semulaOrang.length) {
    await bulkInsert('menu_user_access', ['user_id', 'app_key', 'menu_key', 'izin', 'updated_by'],
      semulaOrang.map(r => [r.user_id, r.app_key, r.menu_key, r.izin, r.updated_by]))
  }
  const sisaP = await sql`SELECT COUNT(*) n FROM menu_role_access`
  const sisaO = await sql`SELECT COUNT(*) n FROM menu_user_access`
  console.log(`\n  ok   tabel dipulihkan${' '.repeat(35)} peran=${sisaP[0].n} orang=${sisaO[0].n}`)
  console.log(gagal === 0 ? '\nSemua pemeriksaan LULUS' : `\n${gagal} pemeriksaan GAGAL`)
  process.exit(gagal === 0 ? 0 : 1)
}
