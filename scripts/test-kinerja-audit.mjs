// Uji regresi perbaikan audit Kinerja (T12: hapus/ubah master).
//   node scripts/test-kinerja-audit.mjs
//
// MENYENTUH DB — hanya di TAHUN KOTAK PASIR '2099', dibersihkan di `finally`.
// Yang diuji bagian yang tsc tidak bisa buktikan: bentuk subquery hitung anak &
// saudara, dan pembacaan affectedRows (L53) pada UPDATE/DELETE.
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import Module from 'node:module'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outDir = path.join(repo, 'node_modules', '.cache', 'kinerja-audit-test')

for (const line of fs.readFileSync(path.join(repo, '.env.local'), 'utf8').split('\n')) {
  const t = line.trim()
  if (!t || t.startsWith('#')) continue
  const i = t.indexOf('='); if (i === -1) continue
  let v = t.slice(i + 1).trim()
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
  if (!(t.slice(0, i).trim() in process.env)) process.env[t.slice(0, i).trim()] = v
}

fs.mkdirSync(outDir, { recursive: true })
const sumber = ['lib/shared/uuid.ts', 'lib/data/db.ts', 'lib/data/kinerja.ts']
try {
  execSync(
    `npx tsc ${sumber.map((f) => `"${path.join(repo, f)}"`).join(' ')}`
    + ` --outDir "${outDir}" --rootDir "${repo}" --module commonjs --target es2020`
    + ' --esModuleInterop --skipLibCheck --moduleResolution node',
    { cwd: repo, stdio: 'pipe' },
  )
} catch { /* alias @/... tak ter-resolve saat compile — .js tetap ditulis */ }

const resolveAsli = Module._resolveFilename
Module._resolveFilename = function (p, ...s) {
  if (p.startsWith('@/')) return path.join(outDir, p.slice(2) + '.js')
  return resolveAsli.call(this, p, ...s)
}

const { sql } = require(path.join(outDir, 'lib/data/db.js'))
const K = require(path.join(outDir, 'lib/data/kinerja.js'))

const TH = '2099'
let gagal = 0, jalan = 0
function periksa(nama, benar, tambahan = '') {
  jalan++; if (!benar) gagal++
  console.log(`${benar ? '  ok  ' : ' GAGAL'} ${nama.padEnd(56)} ${tambahan}`)
}
async function tangkap(fn) { try { const v = await fn(); return { err: null, v } } catch (e) { return { err: e?.name ?? 'Error', v: null } } }
const bersih = () => sql`DELETE FROM kinerja_master WHERE tahun = ${TH}`

async function baru(tipe, nama, refs = {}) {
  const r = await sql`
    INSERT INTO kinerja_master (tahun, tipe, nama, program_ref, kegiatan_ref, subkegiatan_ref)
    VALUES (${TH}, ${tipe}, ${nama}, ${refs.program_ref ?? null}, ${refs.kegiatan_ref ?? null}, ${refs.subkegiatan_ref ?? null})`
  return r[0].insertId
}

async function main() {
  await bersih()

  console.log('\n── T12: hapus master yang masih punya anak ──')
  const idProg = await baru('program', 'PRG-UJI')
  await baru('kegiatan', 'KEG-UJI', { program_ref: 'PRG-UJI' })
  const a = await tangkap(() => K.deleteMasterRow(idProg))
  periksa('Program terakhir + punya anak -> DITOLAK', a.err === 'KinerjaMasterPunyaAnakError', a.err ?? 'lolos')

  const idProg2 = await baru('program', 'PRG-UJI')   // saudara senama
  const b = await tangkap(() => K.deleteMasterRow(idProg))
  periksa('Ada saudara senama -> hapus BOLEH', b.err === null, b.err ?? 'lolos')
  periksa('…mengembalikan nama utk audit log', b.v?.nama === 'PRG-UJI' && b.v?.tipe === 'program', JSON.stringify(b.v))

  console.log('\n── T12: daun & id tak dikenal ──')
  const idUraian = await baru('uraian_ssk', 'URA-UJI')
  const c = await tangkap(() => K.deleteMasterRow(idUraian))
  periksa('Daun (uraian_ssk) boleh dihapus', c.err === null, c.err ?? 'lolos')
  const d = await tangkap(() => K.deleteMasterRow(99999999))
  periksa('Hapus id tak dikenal -> KinerjaMasterTidakAdaError', d.err === 'KinerjaMasterTidakAdaError', d.err ?? 'lolos')

  console.log('\n── T12: ubah master ──')
  const e = await tangkap(() => K.updateMasterRow(idProg2, 'PRG-BARU'))
  periksa('Ubah nama baris yang ada -> sukses', e.err === null, e.err ?? 'lolos')
  const cek = await sql`SELECT nama FROM kinerja_master WHERE id = ${idProg2}`
  periksa('…namanya benar-benar berubah', cek[0]?.nama === 'PRG-BARU', cek[0]?.nama)
  const f = await tangkap(() => K.updateMasterRow(99999999, 'X'))
  periksa('Ubah id tak dikenal -> 404, bukan sukses palsu', f.err === 'KinerjaMasterTidakAdaError', f.err ?? 'lolos (BUG)')

  console.log('\n── T12: kegiatan -> subkegiatan ──')
  const idKeg = await baru('kegiatan', 'KEG-B')
  await baru('subkegiatan', 'SUB-B', { kegiatan_ref: 'KEG-B' })
  const g = await tangkap(() => K.deleteMasterRow(idKeg))
  periksa('Kegiatan punya subkegiatan -> DITOLAK', g.err === 'KinerjaMasterPunyaAnakError', g.err ?? 'lolos')
}

try { await main() } catch (e) { gagal++; console.log('\n GAGAL (lemparan tak tertangkap):', e?.message ?? e) }
finally {
  await bersih()
  console.log(`\nKotak pasir dibersihkan (kinerja_master tahun ${TH}).`)
  console.log(gagal === 0 ? `\n${jalan} pemeriksaan LULUS` : `\n${gagal} dari ${jalan} pemeriksaan GAGAL`)
  process.exit(gagal === 0 ? 0 : 1)
}
