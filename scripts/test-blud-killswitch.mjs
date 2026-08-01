// Uji regresi sakelar mati modul (S4) + penolakan permintaan atomik (R1).
//   node scripts/test-blud-killswitch.mjs
//
// MENYENTUH DB. Dua sasaran, keduanya dipulihkan di `finally`:
//   - `app_config` baris flag BLUD — nilai aslinya dicatat lalu dikembalikan.
//   - `blud_permintaan` di TAHUN KOTAK PASIR 2099 — dibuat lalu dihapus.
//
// Kenapa tidak ditiru saja: yang diuji justru perilaku saat DB tidak menjawab
// seperti harapan, dan tiruan selalu menjawab seperti harapan.
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import Module from 'node:module'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outDir = path.join(repo, 'node_modules', '.cache', 'blud-killswitch-test')

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
// `modulMati` membentuk NextResponse; di luar Next kita cukup tahu status-nya.
fs.writeFileSync(path.join(outDir, 'stub-next-server.js'),
  'exports.NextResponse = { json: (b, i) => ({ body: b, status: i && i.status }) };\n')
fs.writeFileSync(path.join(outDir, 'stub-auth.js'),
  'exports.getSession = async () => null;\n')
fs.writeFileSync(path.join(outDir, 'stub-ratelimit.js'),
  'exports.checkRateLimit = async () => ({ allowed: true });\n')

try {
  execSync(
    `npx tsc "${path.join(repo, 'lib/security/guard.ts')}"`
    + ` "${path.join(repo, 'lib/blud/permintaan-data.ts')}" "${path.join(repo, 'lib/data/db.ts')}"`
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
const { modulMati, modulSedangMati } = require(path.join(outDir, 'lib/security/guard.js'))
const { tolakPermintaan } = require(path.join(outDir, 'lib/blud/permintaan-data.js'))

const FLAG = 'app_status_blud'
const FLAG_R = 'app_status_blud_realisasi'
const TAHUN = 2099

let gagal = 0
let jalan = 0
function periksa(nama, benar, tambahan = '') {
  jalan++
  if (!benar) gagal++
  console.log(`${benar ? '  ok  ' : ' GAGAL'} ${nama.padEnd(58)} ${tambahan}`)
}
async function tangkap(fn) {
  try { await fn(); return null } catch (e) { return e?.name ?? 'Error' }
}
async function setFlag(key, nilai) {
  await sql`INSERT INTO app_config (\`key\`, value) VALUES (${key}, ${nilai})
            ON DUPLICATE KEY UPDATE value = VALUES(value)`
}
async function bacaFlag(key) {
  const r = await sql`SELECT value FROM app_config WHERE \`key\` = ${key}`
  return r[0]?.value ?? null
}

const aslinya = { [FLAG]: await bacaFlag(FLAG), [FLAG_R]: await bacaFlag(FLAG_R) }

try {
  console.log('── S4: sakelar mati modul ──')

  await setFlag(FLAG, 'online')
  await setFlag(FLAG_R, 'online')
  periksa('Semua online → tidak menghalangi', (await modulMati(FLAG)) === null)
  periksa('…termasuk pemeriksaan berjenjang', (await modulMati(FLAG, FLAG_R)) === null)
  periksa('modulSedangMati false', (await modulSedangMati(FLAG)) === false)

  await setFlag(FLAG_R, 'maintenance')
  periksa('Realisasi mati → route realisasi 503',
    (await modulMati(FLAG, FLAG_R))?.status === 503)
  // Inti "berjenjang": mematikan anak tidak boleh ikut mematikan induk. Kalau
  // baris ini gagal, DPA & master ikut mati padahal tidak diminta.
  periksa('…tapi route BLUD umum tetap jalan', (await modulMati(FLAG)) === null)

  await setFlag(FLAG, 'maintenance')
  await setFlag(FLAG_R, 'online')
  periksa('BLUD mati → route BLUD umum 503', (await modulMati(FLAG))?.status === 503)
  periksa('…dan Realisasi ikut mati', (await modulMati(FLAG, FLAG_R))?.status === 503)
  periksa('modulSedangMati true', (await modulSedangMati(FLAG)) === true)

  // Nilai apa pun selain 'online' berarti mati — salah ketik menutup, bukan membuka.
  await setFlag(FLAG, 'ONLINE')
  periksa('Salah huruf besar dianggap mati, bukan hidup', (await modulMati(FLAG))?.status === 503)

  // Kunci yang barisnya belum ada dianggap hidup, supaya modul baru tidak mati
  // hanya karena seed tertinggal.
  periksa('Kunci tak dikenal dianggap hidup', (await modulMati('app_status_entah_apa')) === null)

  console.log('\n── R1: tolak permintaan tidak boleh bilang sukses palsu ──')
  await sql`DELETE FROM blud_permintaan WHERE tahun_anggaran = ${TAHUN}`
  const ins = await sql`
    INSERT INTO blud_permintaan
      (tahun_anggaran, jenis, anggaran_key, uraian, kekurangan, status, diminta_username)
    VALUES (${TAHUN}, 'PERGESERAN', 'UJI-R1', 'uji tolak permintaan', 1000, 'MENUNGGU', 'uji')
  `
  const id = Number(ins.insertId ?? ins[0]?.insertId ?? 0)
  periksa('Permintaan uji dibuat', id > 0, `id=${id}`)

  const pertama = await tolakPermintaan(id)
  periksa('Tolak pertama berhasil', pertama?.id === id)
  // Yang dikembalikan harus keadaan SESUDAH aksi. Dulu ia potret sebelum UPDATE,
  // jadi masih berisi MENUNGGU + selesai_at kosong — pemanggil yang suatu saat
  // meneruskannya ke klien akan menampilkan "menunggu" untuk yang barusan ditolak.
  periksa('…yang dikembalikan sudah keadaan sesudah',
    pertama?.status === 'DITOLAK' && !!pertama?.selesai_at)
  periksa('…statusnya jadi DITOLAK', (await sql`
    SELECT status FROM blud_permintaan WHERE id = ${id}
  `)[0]?.status === 'DITOLAK')

  // Inti R1: dulu panggilan kedua ikut membalas sukses, mengirim notifikasi
  // "permintaan Anda ditolak", dan menulis audit — untuk sesuatu yang tidak terjadi.
  periksa('Tolak KEDUA ditolak, bukan sukses palsu',
    await tangkap(() => tolakPermintaan(id)) === 'BludPermintaanTidakMenungguError')

  periksa('Id tak dikenal tetap null (bukan melempar)',
    (await tolakPermintaan(999999999)) === null)
} finally {
  for (const [k, v] of Object.entries(aslinya)) {
    if (v === null) await sql`DELETE FROM app_config WHERE \`key\` = ${k}`
    else await setFlag(k, v)
  }
  await sql`DELETE FROM blud_permintaan WHERE tahun_anggaran = ${TAHUN}`
  const pulih = (await bacaFlag(FLAG)) === aslinya[FLAG] && (await bacaFlag(FLAG_R)) === aslinya[FLAG_R]
  const sisa = await sql`SELECT COUNT(*) AS n FROM blud_permintaan WHERE tahun_anggaran = ${TAHUN}`
  periksa('Flag dipulihkan & kotak pasir bersih',
    pulih && Number(sisa[0]?.n ?? -1) === 0, `flag=${aslinya[FLAG]}/${aslinya[FLAG_R]}`)
}

console.log(gagal === 0 ? `\n${jalan} pemeriksaan LULUS` : `\n${gagal} dari ${jalan} pemeriksaan GAGAL`)
process.exit(gagal === 0 ? 0 : 1)
