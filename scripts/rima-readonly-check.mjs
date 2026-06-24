// scripts/rima-readonly-check.mjs — guard READ-ONLY RIMA (G1/G16, CI gate C).
// Menjamin kode Rima TIDAK PERNAH: mengaktifkan elemen (klik/submit/dispatch),
// menghapus node DOM, atau mengirim request mutasi (POST/PUT/PATCH/DELETE).
// Rima hanya boleh: cari elemen, baca geometri, scroll, fetch GET status/akses.
// Ada pelanggaran → exit 1 (build merah). Ini "rem darurat" supaya regresi di masa
// depan tidak diam-diam membuat Rima bisa mengklik tombol Hapus.

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DIRS = [path.join(ROOT, 'components', 'sentinel'), path.join(ROOT, 'lib', 'sentinel')]

// Pola TERLARANG di kode Rima. (.focus() & classList.remove() DIIZINKAN — bukan
// aktivasi/penghapusan data; classList.remove selalu berargumen.)
const FORBIDDEN = [
  { re: /\.click\s*\(/,                         why: 'memanggil .click() — mengaktifkan tombol' },
  { re: /\.submit\s*\(/,                        why: 'memanggil .submit() — submit form' },
  { re: /\.requestSubmit\s*\(/,                 why: 'memanggil .requestSubmit()' },
  { re: /dispatchEvent\s*\(/,                   why: 'dispatchEvent — event sintetis bisa setara klik' },
  { re: /\.removeChild\s*\(/,                   why: 'removeChild — menghapus node DOM' },
  { re: /\.remove\s*\(\s*\)/,                   why: 'element.remove() — menghapus node DOM' },
  { re: /method:\s*['"`](POST|PUT|PATCH|DELETE)/i, why: 'fetch mutasi — Rima hanya boleh GET' },
]

const files = []
function scan(dir) {
  let entries
  try { entries = readdirSync(dir) } catch { return }
  for (const name of entries) {
    const p = path.join(dir, name)
    if (statSync(p).isDirectory()) { scan(p); continue }
    if (/\.(tsx?|mjs)$/.test(name) && !name.endsWith('.d.mts')) files.push(p)
  }
}
for (const d of DIRS) scan(d)

// Pengecualian TER-AUDIT: baris yang memuat penanda `rima-readonly-allow` (di
// baris itu atau baris tepat di atasnya) DIIZINKAN — wajib disertai alasan agar
// terlihat & ditinjau saat code review. Dipakai utk pola aman yang lolos regex
// kasar (mis. POST ke endpoint parse read-only, atau .click() membuka dialog
// pilih file — bukan klik tombol aksi aplikasi). Tetap dilaporkan demi transparansi.
const ALLOW = 'rima-readonly-allow'

const hits = []
const allowed = []
for (const f of files) {
  const src = readFileSync(f, 'utf8')
  const lines = src.split('\n')
  lines.forEach((line, i) => {
    const t = line.trim()
    if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return // baris komentar murni
    for (const { re, why } of FORBIDDEN) {
      if (!re.test(line)) continue
      const prev = (lines[i - 1] ?? '').trim()
      const rec = { f: path.relative(ROOT, f), n: i + 1, why, line: t.slice(0, 90) }
      ;(line.includes(ALLOW) || prev.includes(ALLOW) ? allowed : hits).push(rec)
    }
  })
}

if (allowed.length) {
  console.log(`Pengecualian ter-audit (${ALLOW}): ${allowed.length} —`)
  for (const a of allowed) console.log(`  ${a.f}:${a.n} — ${a.why}`)
}

if (hits.length) {
  console.error(`GAGAL guard READ-ONLY RIMA (G1/G16): ${hits.length} pelanggaran — Rima dilarang klik/hapus:`)
  for (const h of hits) console.error(`  ${h.f}:${h.n} — ${h.why}\n      ${h.line}`)
  process.exit(1)
}
console.log(`OK guard READ-ONLY: ${files.length} file Rima bersih — tanpa klik/submit/dispatch/hapus-DOM/fetch-mutasi (G1/G16).`)
