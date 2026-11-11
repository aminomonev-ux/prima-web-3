// scripts/ss-konsep/cek-halaman.mjs — potongan teks halaman tertentu (sementara)
import { execFileSync } from 'node:child_process'

const teks = execFileSync('pdftotext', ['-layout', process.argv[2], '-'], { encoding: 'utf8', maxBuffer: 64 << 20 })
const hal = teks.split('\f')
for (const n of process.argv.slice(3).map(Number)) {
  const t = hal[n - 1] || ''
  const baris = t.split('\n').map((l) => l.trim()).filter(Boolean)
  console.log(`=== hal ${n} (${baris.length} baris) ===`)
  console.log('awal :', baris.slice(0, 2).join(' | ').slice(0, 110))
  console.log('akhir:', baris.slice(-2).join(' | ').slice(0, 110))
  const cap = baris.filter((l) => /^Gambar \d+\./.test(l))
  if (cap.length) console.log('keterangan:', cap.join(' || ').slice(0, 110))
}
