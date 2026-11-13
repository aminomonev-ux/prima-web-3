// scripts/test-pk-pratinjau-pdf.mts — Pratinjau PDF dokumen PK (Riwayat): docx-preview → html2canvas → jsPDF.
// Jalankan: npx tsx scripts/test-pk-pratinjau-pdf.mts
//
// Dua cacat yang dijaga (2026-11-13, dibuktikan di peramban dengan mengukur piksel PDF hasil):
//  A. Halaman dicari dengan kelas bawaan `section.docx` padahal docx-preview memakai kelas pilihan kita —
//     tak satu halaman ketemu, seluruh pembungkus abu-abu jadi SATU halaman PDF.
//  B. Preflight Tailwind `img { display: block }` merusak <img> pengukur garis dasar html2canvas — semua
//     teks tergeser ke bawah, garis bawah nama & garis tabel tampak mencoret huruf.

import { readFileSync } from 'node:fs'

let lulus = 0
const gagal: string[] = []
const ok = (n: string, s: unknown, k = '') => {
  if (s) { lulus++; console.log(`  ok  ${n}`) } else { gagal.push(n); console.log(`FAIL  ${n}${k ? ' — ' + k : ''}`) }
}

const layar = readFileSync('app/(dashboard)/perjanjian-kinerja/riwayat/riwayat-client.tsx', 'utf8')
const kelas = /const KELAS_PRATINJAU = '([^']+)'/.exec(layar)?.[1]
ok('A1 kelas pratinjau satu konstanta', !!kelas)
ok('A2 docx-preview memakai konstanta itu', layar.includes('className: KELAS_PRATINJAU,'))
ok('A3 halaman dicari dengan kelas yang sama', layar.includes('querySelectorAll(`section.${KELAS_PRATINJAU}`)'))
ok('A4 pembungkus dicari dengan kelas yang sama', layar.includes('querySelector(`.${KELAS_PRATINJAU}-wrapper`)'))
ok('A5 tidak ada lagi nama kelas bawaan docx-preview', !/'section\.docx'|'\.docx-wrapper'/.test(layar))

const lib = readFileSync('node_modules/html2canvas-pro/dist/html2canvas-pro.esm.js', 'utf8')
const gif = /const SMALL_IMAGE = "([^"]+)"/.exec(lib)?.[1]
const css = readFileSync('app/globals.css', 'utf8')
ok('B1 html2canvas-pro masih mengukur garis dasar dengan gif kecil', !!gif && lib.includes('img.src = SMALL_IMAGE'))
ok('B2 globals.css mengembalikan gif pengukur itu ke inline (selektor persis sumbernya)',
  !!gif && new RegExp(`img\\[src="${gif!.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}"\\]\\s*\\{\\s*display:\\s*inline !important;`).test(css))

console.log(`\n${lulus} lulus, ${gagal.length} gagal`)
if (gagal.length) { console.log(gagal.map(g => `  - ${g}`).join('\n')); process.exit(1) }
process.exit(0)
