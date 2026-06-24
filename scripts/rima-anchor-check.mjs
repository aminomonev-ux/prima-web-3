// scripts/rima-anchor-check.mjs — integritas anchor RIMA F3 (G15, CONCEPT §6b-8).
// Validasi 3 arah supaya tur tidak pernah menunjuk tombol yang sudah pindah/hilang:
//   1. Setiap anchor yang dipakai tours/*.ts (anchor/waitFor) terdaftar di anchors.ts
//   2. Setiap id di anchors.ts punya literal data-rima="<id>" di app/ atau components/
//   3. Tidak ada data-rima liar di src yang tidak terdaftar (typo id) — kecuali 'rima.bot'
// UI berubah tanpa update anchor → build merah (jalan via npm run rima:check, CI gate C).

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// id internal yang bukan target tur — tidak wajib terdaftar di registry
const ALLOW_UNREGISTERED = new Set(['rima.bot'])

const anchorsSrc = readFileSync(path.join(ROOT, 'lib', 'sentinel', 'anchors.ts'), 'utf8')
const registered = new Set([...anchorsSrc.matchAll(/^\s*'([a-z0-9.-]+)':\s*\{/gm)].map(m => m[1]))

const toursDir = path.join(ROOT, 'lib', 'sentinel', 'tours')
const usedByTours = new Set()
for (const f of readdirSync(toursDir)) {
  if (!f.endsWith('.ts')) continue
  const src = readFileSync(path.join(toursDir, f), 'utf8')
  for (const m of src.matchAll(/(?:anchor|waitFor):\s*'([a-z0-9.-]+)'/g)) usedByTours.add(m[1])
}

const inSrc = new Set()
function scan(dir) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.next' || name.startsWith('.')) continue
    const p = path.join(dir, name)
    if (statSync(p).isDirectory()) { scan(p); continue }
    if (!/\.(tsx?|jsx?|mjs)$/.test(name)) continue
    const src = readFileSync(p, 'utf8')
    // data-rima="..." langsung + prop pass-through dataRima="..." (mis. SidebarItem)
    for (const m of src.matchAll(/data-?[rR]ima="([a-z0-9.-]+)"/g)) inSrc.add(m[1])
    // data-rima={kondisi ? 'modul.aksi' : ...} — ambil literal ber-TITIK saja
    // (pembanding pendek macam 'buat'/'tracking' tanpa titik tidak ikut tertangkap)
    for (const m of src.matchAll(/data-?[rR]ima=\{[^}]*\}/g)) {
      for (const idm of m[0].matchAll(/'([a-z0-9-]+\.[a-z0-9.-]+)'/g)) inSrc.add(idm[1])
    }
  }
}
scan(path.join(ROOT, 'app'))
scan(path.join(ROOT, 'components'))

const errs = []
for (const id of usedByTours) {
  if (!registered.has(id)) errs.push(`tur memakai anchor '${id}' yang TIDAK terdaftar di anchors.ts`)
}
for (const id of registered) {
  if (!inSrc.has(id)) errs.push(`anchor '${id}' terdaftar tapi data-rima="${id}" TIDAK ada di src (tombol pindah/hilang?)`)
}
for (const id of inSrc) {
  if (!registered.has(id) && !ALLOW_UNREGISTERED.has(id)) {
    errs.push(`data-rima="${id}" ada di src tapi tidak terdaftar di anchors.ts (typo id?)`)
  }
}

if (errs.length) {
  console.error(`GAGAL anchor-check G15: ${errs.length} masalah:`)
  for (const e of errs) console.error(`  - ${e}`)
  process.exit(1)
}
console.log(`OK G15: ${registered.size} anchor terdaftar · ${usedByTours.size} dipakai tur · semua punya data-rima di src.`)
