// scripts/ss-konsep/cek-toc.mjs — bandingkan nomor halaman daftar isi vs halaman nyata (sementara)
import { execFileSync } from 'node:child_process'

const teks = execFileSync('pdftotext', ['-layout', process.argv[2], '-'], { encoding: 'utf8', maxBuffer: 64 << 20 })
const hal = teks.split('\f')

const judul = ['1. Pendahuluan', '4. Pengguna, Peran, dan Hak Akses', '6. Alur Kerja Setiap Modul', '7. Keamanan', '8. Pemeliharaan', '9. Pemasangan']

console.log('== halaman nyata ==')
const nyata = {}
for (const j of judul) {
  const i = hal.findIndex((t, k) => k > 5 && new RegExp('^\\s*' + j.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'm').test(t))
  if (i >= 0) { nyata[j] = i + 1; console.log(`  ${j.padEnd(36)} hal ${i + 1}`) }
}

console.log('\n== baris daftar isi ==')
for (const t of hal.slice(0, 8)) {
  for (const l of t.split('\n')) {
    const m = l.match(/^\s*(\d+\.\s+[A-Z].*?)\s{2,}(\d+)\s*$/)
    if (m) console.log(`  ${m[1].slice(0, 40).padEnd(42)} tercatat hal ${m[2]}`)
  }
}

console.log('\n== daftar gambar (3 baris awal/akhir) ==')
const iDg = hal.findIndex((t) => /DAFTAR GAMBAR/i.test(t))
if (iDg >= 0) {
  const baris = hal.slice(iDg, iDg + 4).join('\n').split('\n').filter((l) => /Gambar \d+\./.test(l))
  for (const l of [...baris.slice(0, 2), ...baris.slice(-2)]) console.log('  ' + l.trim().slice(0, 74))
}
