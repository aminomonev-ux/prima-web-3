// scripts/ss-konsep/sisip.mjs — menyisipkan tangkapan layar ke docx konsep (sementara)
import fs from 'node:fs'
import path from 'node:path'
import PizZip from 'pizzip'

const DOK = 'docs/konsep-sistem/PRIMA-Dokumen-Konsep-Sistem.docx'
const DIR = 'docs/konsep-sistem/gambar'
const CADANGAN = 'docs/konsep-sistem/cadangan'

// berkas, judul keterangan, judul bab (tanpa nomor), subbab (tanpa nomor) — null = seluruh bab
const SISIPAN = [
  ['01-masuk', 'Halaman masuk PRIMA', 'Alur Masuk dan Sesi', null],
  ['12-admin', 'Panel Admin — Pusat Akses', 'Panel Admin', null],
  ['02-menu', 'Halaman menu dan kartu modul', 'Halaman Menu dan Dasbor', null],
  ['03-dasbor', 'Dasbor ringkasan lintas modul', 'Halaman Menu dan Dasbor', null],
  ['04-usulan', 'Layar Usulan Kebutuhan', 'Usulan Kebutuhan', 'Langkah Kerja'],
  ['05-renaksi', 'Layar Rencana Aksi', 'Rencana Aksi', 'Langkah Kerja'],
  ['06-e-anggaran', 'Layar E-Anggaran', 'E-Anggaran', 'Langkah Kerja'],
  ['07-blud', 'Layar modul BLUD', 'BLUD', 'Penyusunan DPA, Pergeseran, dan DPA Perubahan'],
  ['08-pk', 'Layar Perjanjian Kinerja', 'Perjanjian Kinerja', 'Langkah Kerja'],
  ['09-iki', 'Layar Indikator Kinerja Individu', 'Indikator Kinerja Individu', 'Langkah Kerja'],
  ['10-bba', 'Layar Buku Besar Aset', 'Buku Besar Aset', 'Langkah Kerja'],
  ['11-lkjip', 'Layar E-LKJIP', 'E-LKJIP', 'Langkah Kerja'],
]

const CX = 5715000 // lebar isi halaman yang dipakai gambar-gambar yang sudah ada
const CY = Math.round((CX * 900) / 1440)

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const zip = new PizZip(fs.readFileSync(DOK))
let xml = zip.file('word/document.xml').asText()
let rels = zip.file('word/_rels/document.xml.rels').asText()

// ── kumpulkan paragraf & judul ────────────────────────────────────────────────
const PAR = /<w:p\b[^>]*\/>|<w:p\b[^>]*>[\s\S]*?<\/w:p>/g
const paras = []
for (const m of xml.matchAll(PAR)) {
  const raw = m[0]
  const gaya = (raw.match(/<w:pStyle w:val="([^"]+)"/) || [])[1] || ''
  const teks = [...raw.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map((x) => x[1]).join('')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim()
  paras.push({ mulai: m.index, akhir: m.index + raw.length, raw, gaya, teks })
}
const tanpaNomor = (t) => t.replace(/^[\d.]+\s+/, '').trim()
const judul = paras.map((p, i) => ({ i, gaya: p.gaya, teks: p.teks, inti: tanpaNomor(p.teks) }))
  .filter((p) => /^Heading\d$/.test(p.gaya))

// ── tentukan titik sisip ──────────────────────────────────────────────────────
const titik = []
for (const [berkas, keterangan, bab, sub] of SISIPAN) {
  const iBab = judul.findIndex((j) => j.inti.toLowerCase() === bab.toLowerCase())
  if (iBab < 0) throw new Error('bab tidak ditemukan: ' + bab)
  // batas bab = judul Heading1/Heading2 berikutnya, bukan Heading3 (subbab di dalamnya)
  let batasBab = paras.length
  for (let k = iBab + 1; k < judul.length; k++) {
    if (/^Heading[12]$/.test(judul[k].gaya)) { batasBab = judul[k].i; break }
  }
  let iAcuan = iBab
  if (sub) {
    const iSub = judul.findIndex((j, k) => k > iBab && j.i < batasBab
      && j.gaya === 'Heading3' && j.inti.toLowerCase() === sub.toLowerCase())
    if (iSub < 0) throw new Error('subbab tidak ditemukan: ' + bab + ' → ' + sub)
    iAcuan = iSub
    const berikut = judul[iAcuan + 1]
    titik.push({ berkas, keterangan, urutan: titik.length, mulai: berikut ? paras[berikut.i].mulai : paras[paras.length - 1].akhir })
  } else {
    titik.push({ berkas, keterangan, urutan: titik.length, mulai: batasBab < paras.length ? paras[batasBab].mulai : paras[paras.length - 1].akhir })
  }
}

titik.sort((a, b) => a.mulai - b.mulai)

// ── bangun XML ────────────────────────────────────────────────────────────────
let rIdMaks = Math.max(...[...rels.matchAll(/Id="rId(\d+)"/g)].map((m) => +m[1]))
let docPrMaks = Math.max(...[...xml.matchAll(/<wp:docPr id="(\d+)"/g)].map((m) => +m[1]))
const mediaBaru = []
const relBaru = []
let nomor = 30

const gambarPara = (rId, id, nama) =>
  `<w:p><w:pPr><w:keepNext/><w:spacing w:before="120" w:after="60"/><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:noProof/></w:rPr><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${CX}" cy="${CY}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:docPr id="${id}" name="${esc(nama)}" descr="${esc(nama)}" title="${esc(nama)}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="0" name="${esc(nama)}"/><pic:cNvPicPr><a:picLocks noChangeAspect="1" noChangeArrowheads="1"/></pic:cNvPicPr></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rId}"/><a:srcRect/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr bwMode="auto"><a:xfrm><a:off x="0" y="0"/><a:ext cx="${CX}" cy="${CY}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`

const ketPara = (n, teks) =>
  `<w:p><w:pPr><w:pStyle w:val="Caption"/><w:jc w:val="center"/></w:pPr><w:r><w:t xml:space="preserve">Gambar </w:t></w:r><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> SEQ Gambar </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:rPr><w:noProof/></w:rPr><w:t>${n}</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r><w:r><w:t xml:space="preserve">. ${esc(teks)}</w:t></w:r></w:p>`

for (const t of titik) {
  const rId = 'rId' + (++rIdMaks)
  const namaMedia = 'ss-' + t.berkas.replace(/^\d+-/, '') + '.png'
  zip.file('word/media/' + namaMedia, fs.readFileSync(path.join(DIR, t.berkas + '.png')))
  mediaBaru.push('word/media/' + namaMedia)
  relBaru.push(`<Relationship Id="${rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${namaMedia}"/>`)
  t.xml = gambarPara(rId, ++docPrMaks, t.berkas) + ketPara(nomor++, t.keterangan)
}

// ── sisipkan dari belakang supaya offset awal tidak bergeser ─────────────────
for (const t of [...titik].sort((a, b) => b.mulai - a.mulai || b.urutan - a.urutan)) {
  xml = xml.slice(0, t.mulai) + t.xml + xml.slice(t.mulai)
}

rels = rels.replace('</Relationships>', relBaru.join('') + '</Relationships>')
zip.file('word/document.xml', xml)
zip.file('word/_rels/document.xml.rels', rels)

// ── simpan (dengan cadangan) ─────────────────────────────────────────────────
fs.mkdirSync(CADANGAN, { recursive: true })
const cap = path.join(CADANGAN, `PRIMA-Dokumen-Konsep-Sistem-${new Date().toISOString().slice(0, 10)}.docx`)
if (!fs.existsSync(cap)) fs.copyFileSync(DOK, cap)

const keluar = zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' })
fs.writeFileSync(DOK, keluar)

console.log('cadangan :', cap)
console.log('ditulis  :', DOK, Math.round(keluar.length / 1024) + ' KB')
console.log('gambar   :', titik.length, '→ Gambar 30..' + (nomor - 1))
for (const t of [...titik].sort((a, b) => a.mulai - b.mulai)) console.log('  +', t.berkas, '|', t.keterangan)
