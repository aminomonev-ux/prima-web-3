// Uji statis: setiap handler HTTP di `app/api/blud/**` wajib memasang bludRateLimit.
//   node scripts/test-blud-ratelimit.mjs
//
// TIDAK menyentuh DB dan tidak memanggil route mana pun — ia membaca berkasnya.
// S3 muncul karena 9 endpoint lupa dipasangi pagar; yang bisa lupa sekali bisa lupa
// lagi. Endpoint BLUD berikutnya yang lalai akan gagal di sini, bukan di produksi.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const akar = path.join(repo, 'app', 'api', 'blud')
const METODE = ['GET', 'POST', 'PATCH', 'PUT', 'DELETE']

function kumpulkanRoute(dir) {
  const hasil = []
  for (const entri of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entri.name)
    if (entri.isDirectory()) hasil.push(...kumpulkanRoute(p))
    else if (entri.name === 'route.ts') hasil.push(p)
  }
  return hasil
}

let gagal = 0
let jalan = 0

for (const berkas of kumpulkanRoute(akar).sort()) {
  const isi = fs.readFileSync(berkas, 'utf8')
  const rel = path.relative(repo, berkas).replace(/\\/g, '/')

  // Tubuh handler dipotong sampai `export async function` berikutnya (atau EOF),
  // jadi fungsi pembantu di bawah handler terakhir ikut terhitung miliknya.
  const batas = []
  for (const metode of METODE) {
    const i = isi.indexOf(`export async function ${metode}(`)
    if (i !== -1) batas.push({ metode, mulai: i })
  }
  batas.sort((a, b) => a.mulai - b.mulai)

  for (let i = 0; i < batas.length; i++) {
    const tubuh = isi.slice(batas[i].mulai, batas[i + 1]?.mulai ?? isi.length)
    const berpagar = tubuh.includes('bludRateLimit(')
    jalan++
    if (!berpagar) gagal++
    console.log(`${berpagar ? '  ok  ' : ' GAGAL'} ${`${rel} ${batas[i].metode}`.padEnd(60)}`)
  }
}

console.log(gagal === 0
  ? `\n${jalan} handler LULUS — semuanya berpagar bludRateLimit`
  : `\n${gagal} dari ${jalan} handler TANPA rate limit`)
process.exit(gagal === 0 ? 0 : 1)
