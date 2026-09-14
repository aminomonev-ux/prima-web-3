// scripts/cek-urutan-penjaga.mjs — Fase F Tahap 14b. STATIS, nol DB.
//
// Sejak `jepitBeku` dibuang (K1=C), izin EDIT tidak lagi dijepit ke LIHAT saat modul
// dibekukan. Satu-satunya yang menahan tulisan jadi penjaga sakelar (`bludMati`,
// `pkMati`, …) — dan itu hanya berlaku kalau ia dipanggil SEBELUM izin menu diperiksa
// dan sebelum data disentuh. Gate G membuktikan penjaganya ADA di tiap handler; berkas
// ini membuktikan URUTANNYA untuk modul yang punya izin per-menu.
//
// Jalankan: node scripts/cek-urutan-penjaga.mjs
import fs from 'node:fs'
import path from 'node:path'
import { MODUL_APPS_DATA } from '../lib/registry/apps-data.mjs'
import { potongHandler } from './_potong-handler.mjs'

const TULIS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])
// Titik pertama yang tidak boleh mendahului penjaga sakelar.
const TITIK_SESUDAH = ['bolehEditMenu(', 'bolehInput(', 'withTransaction(', 'sql`', 'execWrite(']

function cariRoute(dir) {
  const out = []
  if (!fs.existsSync(dir)) return out
  ;(function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name)
      if (e.isDirectory()) walk(p)
      else if (e.name === 'route.ts') out.push(p)
    }
  })(dir)
  return out
}

const buangKomentar = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')

let diperiksa = 0
const salah = []
for (const m of MODUL_APPS_DATA.filter((x) => x.punyaMenu && x.dirApi && x.penjagaApi)) {
  for (const f of cariRoute(m.dirApi)) {
    for (const h of potongHandler(buangKomentar(fs.readFileSync(f, 'utf8')))) {
      if (!TULIS.has(h.nama)) continue
      diperiksa++
      const iPenjaga = Math.min(...m.penjagaApi.penanda.map((p) => h.badan.indexOf(p)).filter((i) => i >= 0))
      const iTitik = TITIK_SESUDAH.map((t) => [t, h.badan.indexOf(t)]).filter(([, i]) => i >= 0)
      const mendahului = iTitik.filter(([, i]) => i < iPenjaga)
      if (!Number.isFinite(iPenjaga) || mendahului.length) {
        salah.push(`${path.relative('.', f).replace(/\\/g, '/')} ${h.nama}: ${
          Number.isFinite(iPenjaga) ? `${mendahului.map(([t]) => t).join(', ')} mendahului penjaga sakelar` : 'tanpa penjaga'}`)
      }
    }
  }
}

console.log(`${diperiksa} handler tulis (modul ber-izin menu) diperiksa.`)
if (salah.length) {
  console.log(`GAGAL — ${salah.length} handler memeriksa izin/menyentuh data sebelum sakelar:`)
  for (const s of salah) console.log(`  ${s}`)
  process.exit(1)
}
console.log('LULUS — penjaga sakelar selalu paling dulu.')
