// scripts/ss-konsep/posisi.mjs — memastikan gambar baru berada di bab/subbab yang benar (sementara)
import fs from 'node:fs'
import PizZip from 'pizzip'

const zip = new PizZip(fs.readFileSync('docs/konsep-sistem/PRIMA-Dokumen-Konsep-Sistem.docx'))
const xml = zip.file('word/document.xml').asText()
const rels = zip.file('word/_rels/document.xml.rels').asText()

const peta = {}
for (const m of rels.matchAll(/Id="(rId\d+)"[^>]*Target="(media\/[^"]+)"/g)) peta[m[1]] = m[2]

const PAR = /<w:p\b[^>]*\/>|<w:p\b[^>]*>[\s\S]*?<\/w:p>/g
const teks = (raw) => [...raw.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map((x) => x[1]).join('')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim()

let h1 = '', h2 = '', h3 = ''
let n = 0
const hasil = []
for (const m of xml.matchAll(PAR)) {
  const raw = m[0]
  const gaya = (raw.match(/<w:pStyle w:val="([^"]+)"/) || [])[1] || ''
  const t = teks(raw)
  if (gaya === 'Heading1') h1 = t
  if (gaya === 'Heading2') { h2 = t; h3 = '' }
  if (gaya === 'Heading3') h3 = t
  for (const g of raw.matchAll(/r:embed="(rId\d+)"/g)) {
    const target = peta[g[1]] || ''
    if (!target.includes('media/ss-')) continue
    hasil.push({ n: ++n, media: target.split('/').pop(), h1, h2, h3, ket: '' })
  }
  // keterangan menyusul tepat sesudah paragraf gambar
  if (gaya === 'Caption' && hasil.length && !hasil[hasil.length - 1].ket) hasil[hasil.length - 1].ket = t
}

for (const h of hasil) console.log(`${h.ket}\n   ${h.h1} › ${h.h2}${h.h3 ? ' › ' + h.h3 : ''}  [${h.media}]`)

// pemeriksaan keseimbangan tag sederhana
let salah = 0
const tumpuk = []
for (const m of xml.matchAll(/<(\/?)([A-Za-z0-9:._-]+)([^>]*?)(\/?)>/g)) {
  const [, tutup, nama, , sendiri] = m
  if (sendiri === '/' || nama.startsWith('?') || nama.startsWith('!')) continue
  if (!tutup) tumpuk.push(nama)
  else if (tumpuk.pop() !== nama) salah++
}
console.log('\ntag tidak seimbang:', salah, '| sisa tumpukan:', tumpuk.length)
