// scripts/ss-konsep/cek-pdf.mjs — membaca keterangan gambar per halaman (sementara)
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'

const berkas = process.argv[2]
const teks = execFileSync('pdftotext', ['-layout', berkas, '-'], { encoding: 'utf8', maxBuffer: 64 << 20 })
const hal = teks.split('\f')

const cap = []
hal.forEach((t, i) => {
  for (const m of t.matchAll(/^\s*Gambar (\d+)\.\s*(.+)$/gm)) cap.push({ n: +m[1], judul: m[2].trim(), hal: i + 1 })
})
const unik = [...new Map(cap.map((c) => [c.n, c])).values()].sort((a, b) => a.n - b.n)

console.log(`berkas   : ${berkas}`)
console.log(`ukuran   : ${(fs.statSync(berkas).size / 1048576).toFixed(2)} MB | halaman: ${hal.length - 1} | keterangan ditemukan: ${cap.length}`)
console.log(`nomor    : ${unik.map((c) => c.n).join(',')}`)
for (const c of unik) console.log(`  Gambar ${String(c.n).padStart(2)} · hal ${String(c.hal).padStart(2)} · ${c.judul.slice(0, 62)}`)

const daftarGambar = hal.findIndex((t) => /DAFTAR GAMBAR/i.test(t))
if (daftarGambar >= 0) {
  const baris = hal.slice(daftarGambar, daftarGambar + 4).join('\n').split('\n').filter((l) => /Gambar \d+\./.test(l))
  console.log(`\nDaftar Gambar (mulai hal ${daftarGambar + 1}) — entri terlihat: ${baris.length}`)
  for (const l of baris.slice(0, 3)) console.log('  ' + l.trim().slice(0, 70))
  for (const l of baris.slice(-3)) console.log('  ' + l.trim().slice(0, 70))
}
