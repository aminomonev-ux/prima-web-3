// Pemeriksa jangkar realisasi BLUD — anggaran_key di dpa_blud & pergeseran_dpa.
// Konsep: docs/CONCEPT-blud-realisasi.md §2.3 · DoD Fase 1
//
//   node scripts/check-anggaran-key.mjs
//
// HANYA MEMBACA. Tidak ada mode tulis — key dibuat aplikasi saat baris lahir
// (lib/blud/anggaran-key.ts), jadi skrip ini tidak boleh ikut campur.
// Dipakai setelah menyentuh saveDpa / savePergeseran / injectDpaKePergeseran.
//
// Empat hal yang diperiksa:
//   1. Tiap baris punya key            -> tanpa ini realisasi tak punya tempat menempel
//   2. Key tidak kembar dalam satu versi -> satu key = satu baris anggaran
//   3. Key bertahan saat versi berganti  -> inti Fase 1
//   4. Key pergeseran nyambung ke DPA    -> penentu pagu efektif
import mysql from 'mysql2/promise'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

// .env dibaca manual — `dotenv` bukan dependensi proyek ini.
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
for (const nama of ['.env.local', '.env']) {
  const p = join(ROOT, nama)
  if (!existsSync(p)) continue
  for (const baris of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = baris.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
  }
}

const TABEL = ['dpa_blud', 'pergeseran_dpa']
const angka = (n) => new Intl.NumberFormat('id-ID').format(Number(n || 0))
const potong = (s, n) => (String(s).length > n ? String(s).slice(0, n - 1) + '…' : String(s))
const garis = '─'.repeat(78)
// Komponen tanggal LOKAL — toISOString() menggeser ke UTC dan bisa mundur sehari (pool +07:00).
const tglLokal = (v) => {
  if (!(v instanceof Date)) return String(v ?? '').slice(0, 10)
  const p = (n) => String(n).padStart(2, '0')
  return `${v.getFullYear()}-${p(v.getMonth() + 1)}-${p(v.getDate())}`
}

const conn = await mysql.createConnection({
  host: process.env.MYSQL_HOST ?? 'localhost',
  port: parseInt(process.env.MYSQL_PORT ?? '3306'),
  user: process.env.MYSQL_USER ?? '',
  password: process.env.MYSQL_PASSWORD ?? '',
  database: process.env.MYSQL_DATABASE ?? '',
})

const [[{ db }]] = await conn.query('SELECT DATABASE() AS db')

const [kolomRows] = await conn.query(
  `SELECT TABLE_NAME AS t FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND COLUMN_NAME = 'anggaran_key' AND TABLE_NAME IN (?, ?)`,
  TABEL,
)
const kolomAda = new Set(kolomRows.map((r) => String(r.t)))

console.log('\n' + garis)
console.log(`  CEK anggaran_key — DB: ${db}`)
console.log(garis)

if (kolomAda.size < TABEL.length) {
  const kurang = TABEL.filter((t) => !kolomAda.has(t))
  console.error(`\n❌ Kolom anggaran_key belum ada di: ${kurang.join(', ')}`)
  console.error('   Jalankan: docs/migrations/migration-blud-realisasi-anggaran-key.sql\n')
  await conn.end()
  process.exit(1)
}

const muat = async (tabel) => {
  const [rows] = await conn.query(
    `SELECT id, tahun_anggaran, versi_tanggal, kode_rekening, uraian, tipe_baris, anggaran_key
       FROM ${tabel} ORDER BY tahun_anggaran, versi_tanggal, urutan, id`,
  )
  return rows
}

const data = {}
for (const t of TABEL) data[t] = await muat(t)

if (!data.dpa_blud.length && !data.pergeseran_dpa.length) {
  console.log('\nℹ️  dpa_blud & pergeseran_dpa masih kosong — belum ada yang bisa diperiksa.')
  console.log('   Simpan satu versi DPA dulu, lalu jalankan lagi.\n')
  await conn.end()
  process.exit(0)
}

// ── Kumpulkan ──
const tanpaKey = []
const formatAneh = []
const kembar = [] // key dipakai >1 baris dalam satu versi
const perTahun = new Map()

const stat = (tahun) => {
  if (!perTahun.has(tahun)) {
    perTahun.set(tahun, { keyPerVersiDpa: new Map(), keyDpa: new Set(), keyPer: new Set(), barisDpa: 0, barisPer: 0 })
  }
  return perTahun.get(tahun)
}

for (const tabel of TABEL) {
  const seen = new Map() // tabel|tahun|versi|key -> baris pertama
  for (const r of data[tabel]) {
    const tahun = Number(r.tahun_anggaran ?? 0)
    const versi = tglLokal(r.versi_tanggal)
    const st = stat(tahun)
    if (tabel === 'dpa_blud') st.barisDpa++
    else st.barisPer++

    const key = String(r.anggaran_key ?? '').trim()
    if (!key) {
      tanpaKey.push({ tabel, id: r.id, tahun, versi, tipe: r.tipe_baris, uraian: r.uraian })
      continue
    }
    if (!key.startsWith('AK-')) formatAneh.push({ tabel, id: r.id, key })

    const bucket = `${tabel}|${tahun}|${versi}|${key}`
    if (seen.has(bucket)) kembar.push({ tabel, tahun, versi, key, id: r.id, lawan: seen.get(bucket), uraian: r.uraian })
    else seen.set(bucket, r.id)

    if (tabel === 'dpa_blud') {
      st.keyDpa.add(key)
      if (!st.keyPerVersiDpa.has(versi)) st.keyPerVersiDpa.set(versi, new Set())
      st.keyPerVersiDpa.get(versi).add(key)
    } else {
      st.keyPer.add(key)
    }
  }
}

// ── Laporan ──
console.log('\n▸ RINGKASAN PER TAHUN')
console.log('  tahun │ versi DPA │ baris DPA │ baris Pgs │ key unik')
console.log('  ──────┼───────────┼───────────┼───────────┼─────────')
for (const [tahun, st] of [...perTahun.entries()].sort((a, b) => b[0] - a[0])) {
  const semua = new Set([...st.keyDpa, ...st.keyPer])
  console.log(
    `  ${String(tahun).padStart(5)} │ ${String(st.keyPerVersiDpa.size).padStart(9)} │ ` +
    `${angka(st.barisDpa).padStart(9)} │ ${angka(st.barisPer).padStart(9)} │ ${angka(semua.size).padStart(8)}`,
  )
}

console.log(`\n▸ 1. BARIS TANPA KEY: ${tanpaKey.length}`)
if (tanpaKey.length) {
  for (const b of tanpaKey.slice(0, 10)) {
    console.log(`    • ${b.tabel} id=${b.id} th=${b.tahun} v=${b.versi} ${b.tipe} │ ${potong(b.uraian, 40)}`)
  }
  if (tanpaKey.length > 10) console.log(`    … dan ${tanpaKey.length - 10} lagi`)
  console.log('    → Ada jalur simpan yang belum lewat ensureAnggaranKey() di lib/blud/data.ts.')
} else {
  console.log('    ✅ Semua baris punya jangkar.')
}

console.log(`\n▸ 2. KEY KEMBAR DALAM SATU VERSI: ${kembar.length}`)
if (kembar.length) {
  for (const k of kembar.slice(0, 10)) {
    console.log(`    • ${k.tabel} th=${k.tahun} v=${k.versi} id=${k.id} & id=${k.lawan} │ ${k.key} │ ${potong(k.uraian, 34)}`)
  }
  console.log('    → Satu key dipakai dua baris: realisasi akan menempel ke dua tempat sekaligus.')
} else {
  console.log('    ✅ Tidak ada. Satu key = satu baris anggaran.')
}

if (formatAneh.length) {
  console.log(`\n▸ FORMAT KEY TIDAK LAZIM (bukan berawalan "AK-"): ${formatAneh.length}`)
  for (const f of formatAneh.slice(0, 5)) console.log(`    • ${f.tabel} id=${f.id} │ ${f.key}`)
}

console.log('\n▸ 3. KEY BERTAHAN LINTAS VERSI DPA')
let adaMultiVersi = false
for (const [tahun, st] of [...perTahun.entries()].sort((a, b) => b[0] - a[0])) {
  if (st.keyPerVersiDpa.size < 2) continue
  adaMultiVersi = true
  const versiList = [...st.keyPerVersiDpa.keys()].sort()
  const semua = [...st.keyDpa]
  const bertahan = semua.filter((k) => versiList.every((v) => st.keyPerVersiDpa.get(v).has(k)))
  const pct = semua.length ? Math.round((bertahan.length / semua.length) * 100) : 0
  console.log(`  ${tahun}: ${versiList.length} versi │ ${angka(bertahan.length)}/${angka(semua.length)} key ada di semua versi (${pct}%)`)
  const sebagian = semua.length - bertahan.length
  if (sebagian) console.log(`         ${angka(sebagian)} key hanya di sebagian versi — baris yang ditambah/dihapus antar versi (wajar).`)
}
if (!adaMultiVersi) console.log('  (Belum ada tahun dengan >1 versi DPA — simpan versi kedua untuk menguji ini.)')

console.log('\n▸ 4. JEMBATAN DPA ↔ PERGESERAN')
let adaPergeseran = false
for (const [tahun, st] of [...perTahun.entries()].sort((a, b) => b[0] - a[0])) {
  if (!st.keyPer.size) continue
  adaPergeseran = true
  const nyambung = [...st.keyPer].filter((k) => st.keyDpa.has(k))
  const lepas = st.keyPer.size - nyambung.length
  const pct = st.keyPer.size ? Math.round((nyambung.length / st.keyPer.size) * 100) : 0
  console.log(`  ${tahun}: ${angka(nyambung.length)}/${angka(st.keyPer.size)} key nyambung ke DPA (${pct}%) │ ${angka(lepas)} hanya di pergeseran`)
  if (lepas) console.log('         Yang "hanya di pergeseran" wajar: baris rekening baru yang lahir di pergeseran.')
}
if (!adaPergeseran) console.log('  (Belum ada data pergeseran.)')

const bermasalah = tanpaKey.length + kembar.length + formatAneh.length
console.log('\n' + garis)
console.log(bermasalah ? `  ❌ ${angka(bermasalah)} hal perlu diperbaiki sebelum Realisasi dinyalakan.` : '  ✅ Jangkar realisasi sehat.')
console.log(garis + '\n')

await conn.end()
process.exit(bermasalah ? 1 : 0)
