// scripts/ss-konsep/inspeksi.mjs — membaca XML dokumen konsep (sementara, bukan bagian repo)
import fs from 'node:fs'
import zlib from 'node:zlib'

const DOK = 'docs/konsep-sistem/PRIMA-Dokumen-Konsep-Sistem.docx'

export function bacaDocx(path = DOK) {
  const b = fs.readFileSync(path)
  const eocd = b.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]))
  const n = b.readUInt16LE(eocd + 10)
  let off = b.readUInt32LE(eocd + 16)
  const entri = []
  for (let i = 0; i < n; i++) {
    const nl = b.readUInt16LE(off + 28), el = b.readUInt16LE(off + 30), cl = b.readUInt16LE(off + 32)
    entri.push({
      nama: b.slice(off + 46, off + 46 + nl).toString('utf8'),
      ukuran: b.readUInt32LE(off + 24),
      lho: b.readUInt32LE(off + 42),
    })
    off += 46 + nl + el + cl
  }
  const isi = (e) => {
    const lho = e.lho, nl = b.readUInt16LE(lho + 26), el = b.readUInt16LE(lho + 28)
    let c = b.slice(lho + 30 + nl + el, lho + 30 + nl + el + e.ukuran)
    if (b.readUInt16LE(lho + 8) === 8) c = zlib.inflateRawSync(c)
    return c.toString('utf8')
  }
  return { b, entri, isi, ambil: (nama) => entri.find((e) => e.nama === nama) }
}

const teks = (p) =>
  [...p.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map((x) => x[1]).join('').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')

export function analisa() {
  const { isi, ambil } = bacaDocx()
  const xml = isi(ambil('word/document.xml'))
  const paras = [...xml.matchAll(/<w:p[ >][\s\S]*?<\/w:p>/g)].map((m) => m[0])
  const adaSeq = xml.includes('SEQ ')
  const adaToc = xml.includes('TOC ')
  const idx = paras.findIndex((p) => p.includes('<w:drawing>'))
  return { xml, paras, teks, adaSeq, adaToc, idx, rels: isi(ambil('word/_rels/document.xml.rels')), isi, ambil }
}

if (process.argv[2] === 'jalankan') {
  const a = analisa()
  console.log('paragraf:', a.paras.length, '| SEQ:', a.adaSeq, '| TOC:', a.adaToc, '| gambar pertama idx:', a.idx)
  console.log('\n--- PARAGRAF GAMBAR ---\n' + a.paras[a.idx].slice(0, 1500))
  console.log('\n--- PARAGRAF KETERANGAN ---\n' + a.paras[a.idx + 1])
  console.log('\n--- RELS (potongan) ---\n' + a.rels.slice(0, 700))
}
