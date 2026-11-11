// scripts/ss-konsep/verifikasi.mjs — memeriksa docx hasil sisipan (sementara)
import fs from 'node:fs'
import PizZip from 'pizzip'

const DOK = 'docs/konsep-sistem/PRIMA-Dokumen-Konsep-Sistem.docx'
const zip = new PizZip(fs.readFileSync(DOK))
const xml = zip.file('word/document.xml').asText()
const rels = zip.file('word/_rels/document.xml.rels').asText()

const hitung = (re) => (xml.match(re) || []).length
const rIds = [...xml.matchAll(/r:embed="([^"]+)"/g)].map((m) => m[1])
const docPr = [...xml.matchAll(/<wp:docPr id="(\d+)"/g)].map((m) => +m[1])
const media = Object.keys(zip.files).filter((n) => n.startsWith('word/media/'))
const target = [...rels.matchAll(/Target="(media\/[^"]+)"/g)].map((m) => 'word/' + m[1])
const hilang = target.filter((t) => !zip.files[t])
const rIdGanda = rIds.filter((v, i) => rIds.indexOf(v) !== i)

console.log('ukuran berkas   :', Math.round(fs.statSync(DOK).size / 1024) + ' KB')
console.log('drawing         :', hitung(/<w:drawing>/g), '(sebelumnya 29)')
console.log('caption "Gambar":', hitung(/SEQ Gambar/g), '(sebelumnya 29)')
console.log('gambar word/media:', media.length, '(sebelumnya 29)')
console.log('r:embed unik     :', new Set(rIds).size, '/', rIds.length, rIdGanda.length ? 'GANDA: ' + rIdGanda : 'ok')
console.log('docPr id unik    :', new Set(docPr).size, '/', docPr.length)
console.log('rel tanpa berkas :', hilang.length ? hilang : 'tidak ada')
console.log('keterangan baru  :')
for (const m of xml.matchAll(/<w:t xml:space="preserve">\. ([^<]+)<\/w:t>/g)) console.log('  ·', m[1])
