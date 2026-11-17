// Regresi gambar LKJIP: perataan, bingkai, gambar berdampingan (konsep docs/CONCEPT-lkjip-pratinjau-dan-word.md §4).
// npx tsx scripts/test-lkjip-gambar.mts — bagian F memakai LibreOffice sungguhan (tidak ada = GAGAL).
//
// A: aturan murni   B: skema (payload lama tetap sah)   C: Word XML   D: dokumen utuh   E: Cari-Ganti
// F: PDF LibreOffice   G: sambungan layar
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { crc32, deflateSync } from 'node:zlib'
import PizZip from 'pizzip'
import { BATAS_TAMBAHAN_GAMBAR, bacaAturGambar, berkasBlok, daftarGambar } from '../lib/lkjip/atur-gambar'
import { EMU_PER_PX, LEBAR_MAKS_EMU, lebarMaksEmu, ubahLebar, ukuranTampilEmu, TANPA_UKURAN } from '../lib/lkjip/ukuran-gambar'
import { LEBAR_DXA } from '../lib/lkjip/halaman'
import { DEFAULT_STYLE, GambarPayloadSchema, GantiTeksSchema, GrafikPayloadSchema } from '../lib/lkjip/schemas'
import { buildGambarXml, rakitDocx, type ImageInfo } from '../lib/lkjip/docgen'
import { buildNumberedTree, type BlockNode, type SectionFlat } from '../lib/lkjip/numbering'
import { cariDiDokumen, gantiDiDokumen } from '../lib/lkjip/cari-ganti'
import { cariLibreOffice, ubahKePdf } from '../lib/lkjip/pdf'

let lulus = 0
const gagal: string[] = []
function ok(nama: string, syarat: boolean, ket = '') {
  if (syarat) { lulus++; console.log(`  ok  ${nama}`) }
  else { gagal.push(nama); console.log(`FAIL  ${nama}${ket ? ' — ' + ket.slice(0, 500) : ''}`) }
}
const kode = (p: string) => readFileSync(p, 'utf8').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')
const hitung = (s: string, pola: RegExp) => (s.match(new RegExp(pola.source, 'g')) ?? []).length

// ─── A. Aturan murni ───
console.log('A. Aturan murni')
ok('A1 payload lama: tengah, tanpa bingkai', JSON.stringify(bacaAturGambar({ fileId: 'x' })) === '{"rata":"tengah","bingkai":false}')
ok('A2 nilai asing diabaikan', JSON.stringify(bacaAturGambar({ rata: 'atas', bingkai: 'ya' })) === '{"rata":"tengah","bingkai":false}' && bacaAturGambar({ rata: 'kanan', bingkai: true }).rata === 'kanan')
const dg = daftarGambar({ fileId: 'a', sub: '(a)', lebarEmu: 1000, tambahan: [{ fileId: 'b', sub: '(b)' }, { fileId: '' }, { fileId: 'd' }] })
ok('A3 gambar pertama dulu, tambahan dibatasi 2', dg.length === 3 && dg.map(g => g.fileId).join() === 'a,b,' && dg[0].sub === '(a)' && dg[0].ukuran.lebarEmu === 1000 && dg[1].sub === '(b)', JSON.stringify(dg))
ok('A4 payload lama = satu gambar', daftarGambar({ fileId: 'a' }).length === 1 && daftarGambar(null).length === 1)
ok('A5 berkas blok: semua gambar GAMBAR, tanpa yang kosong; GRAFIK imageFileId', berkasBlok('GAMBAR', { fileId: 'a', tambahan: [{ fileId: '' }, { fileId: 'c' }] }).join() === 'a,c' && berkasBlok('GRAFIK', { imageFileId: 'g' }).join() === 'g' && berkasBlok('TABEL', { fileId: 'x' }).length === 0)
ok('A6 lebar kolom: 1 gambar = bidang tulis, 2/3 = dibagi rata dikurangi jarak sel', lebarMaksEmu(1) === LEBAR_MAKS_EMU && lebarMaksEmu(2) === (Math.floor(LEBAR_DXA / 2) - 216) * 635 && lebarMaksEmu(3) === (Math.floor(LEBAR_DXA / 3) - 216) * 635)
const besar = { wEmu: 2000 * EMU_PER_PX, hEmu: 1000 * EMU_PER_PX }
const t2 = ukuranTampilEmu(TANPA_UKURAN, besar, lebarMaksEmu(2))
ok('A7 gambar besar berdampingan diperkecil ke lebar kolom, proporsi tetap', t2.wEmu === lebarMaksEmu(2) && Math.abs(t2.wEmu / t2.hEmu - 2) < 0.01, JSON.stringify(t2))
ok('A8 isian lebar dijepit ke kolom', ubahLebar(TANPA_UKURAN, LEBAR_MAKS_EMU, lebarMaksEmu(3)).lebarEmu === lebarMaksEmu(3))
ok('A9 tanpa lebar kolom: perilaku lama (bidang tulis)', ukuranTampilEmu(TANPA_UKURAN, besar).wEmu === LEBAR_MAKS_EMU)

// ─── B. Skema ───
console.log('\nB. Skema')
const lama = GambarPayloadSchema.parse({ judul: 'Foto', fileId: 'abc', caption: 'k' })
ok('B1 payload lama sah, kunci baru bawaan', lama.rata === 'tengah' && lama.bingkai === false && lama.sub === '' && Array.isArray(lama.tambahan) && lama.tambahan.length === 0)
ok('B2 tambahan > 2 ditolak', !GambarPayloadSchema.safeParse({ tambahan: [{}, {}, {}] }).success && GambarPayloadSchema.safeParse({ tambahan: [{ fileId: 'a' }, { fileId: 'b' }] }).success)
ok('B3 rata di luar pilihan ditolak, bingkai harus boolean', !GambarPayloadSchema.safeParse({ rata: 'atas' }).success && !GambarPayloadSchema.safeParse({ bingkai: 'ya' }).success)
const t = GambarPayloadSchema.parse({ tambahan: [{ fileId: 'a', sub: 'x', lebarEmu: 500000, potong: { kiri: 1000, atas: 0, kanan: 0, bawah: 0 }, liar: 1 }] }).tambahan[0] as Record<string, unknown>
ok('B4 tambahan membawa ukuran & potongan; kunci asing dibuang', t.lebarEmu === 500000 && (t.potong as { kiri: number }).kiri === 1000 && !('liar' in t), JSON.stringify(t))
ok('B5 sub dibatasi panjangnya', !GambarPayloadSchema.safeParse({ sub: 'x'.repeat(201) }).success && !GambarPayloadSchema.safeParse({ tambahan: [{ sub: 'x'.repeat(201) }] }).success)
const gr = GrafikPayloadSchema.parse({ rata: 'kiri', bingkai: true })
ok('B6 grafik: rata & bingkai', gr.rata === 'kiri' && gr.bingkai === true && GrafikPayloadSchema.parse({}).rata === 'tengah')
ok('B7 Cari-Ganti menerima tempat "sub" (indeks ≤ 2)', GantiTeksSchema.safeParse({ kata: 'a', dengan: 'b', sasaran: { tempat: { jenis: 'sub', blockId: 1, i: 2 }, ke: 0 } }).success && !GantiTeksSchema.safeParse({ kata: 'a', dengan: 'b', sasaran: { tempat: { jenis: 'sub', blockId: 1, i: 3 }, ke: 0 } }).success)

// ─── C. Word XML ───
console.log('\nC. Word XML')
const info = (id: number): ImageInfo => ({ id, relId: `rIdImg${id}`, mediaName: `image${id}.png`, ext: 'png', wEmu: 400 * EMU_PER_PX, hEmu: 300 * EMU_PER_PX })
const peta = new Map<string, ImageInfo>([['fA', info(101)], ['fB', info(102)], ['fC', info(103)]])
const x0 = buildGambarXml(GambarPayloadSchema.parse({ judul: 'Lama', fileId: 'fA' }), 'Arial', 24, peta)
// Keluaran sebelum §4 untuk payload lama — dokumen lama wajib persis sama.
ok('C1 payload lama: gambar & keterangan tengah, tanpa garis, tanpa tabel', x0.startsWith('<w:p><w:pPr><w:keepNext/><w:jc w:val="center"/><w:spacing w:after="0"/></w:pPr>') && x0.includes('<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>') && /<w:pStyle w:val="Caption"\/><w:jc w:val="center"\/>/.test(x0) && !x0.includes('<w:tbl>') && !x0.includes('a:ln'), x0.slice(0, 200))
const x1 = buildGambarXml({ fileId: 'fA', rata: 'kanan' }, 'Arial', 24, peta)
ok('C2 rata kanan: gambar & keterangan kanan', x1.includes('<w:keepNext/><w:jc w:val="right"/>') && /Caption"\/><w:jc w:val="right"\/>/.test(x1))
ok('C3 rata kiri', buildGambarXml({ fileId: 'fA', rata: 'kiri' }, 'Arial', 24, peta).includes('<w:jc w:val="left"/><w:spacing w:after="0"/>'))
const x2 = buildGambarXml({ fileId: 'fA', bingkai: true }, 'Arial', 24, peta)
ok('C4 bingkai: a:ln 0,75 pt hitam SESUDAH prstGeom di dalam spPr', x2.includes('<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:ln w="9525"><a:solidFill><a:srgbClr val="000000"/></a:solidFill></a:ln></pic:spPr>'), x2)
const x3 = buildGambarXml({ judul: 'Kegiatan', fileId: 'fA', sub: '(a) Rapat', tambahan: [{ fileId: 'fB', sub: '(b) Apel' }], rata: 'kiri', bingkai: true }, 'Arial', 24, peta)
const kol = Math.floor(LEBAR_DXA / 2)
ok('C5 dua gambar: SATU tabel 2 kolom selebar bidang tulis, tanpa garis', hitung(x3, /<w:tbl>/) === 1 && x3.includes(`<w:gridCol w:w="${kol}"/><w:gridCol w:w="${kol}"/></w:tblGrid>`) && x3.includes(`<w:tblW w:w="${kol * 2}" w:type="dxa"/>`) && hitung(x3, /w:val="nil"/) === 6 && hitung(x3, /<w:tc>/) === 2, x3.slice(0, 600))
ok('C6 tabel ikut perataan blok, baris tak boleh terbelah', x3.includes('<w:jc w:val="left"/><w:tblBorders>') && x3.includes('<w:trPr><w:cantSplit/></w:trPr>'))
const lebar = [...x3.matchAll(/<wp:extent cx="(\d+)"/g)].map(m => Number(m[1]))
ok('C7 tiap gambar dibatasi lebar kolom', lebar.length === 2 && lebar.every(w => w <= lebarMaksEmu(2)), String(lebar))
ok('C8 sub di bawah tiap gambar, keterangan blok SATU, bingkai di tiap gambar', x3.includes('(a) Rapat') && x3.includes('(b) Apel') && hitung(x3, /SEQ Gambar/) === 1 && hitung(x3, /<a:ln /) === 2 && x3.indexOf('(b) Apel') < x3.indexOf('SEQ Gambar'))
ok('C9 keterangan blok ikut perataan blok', /Caption"\/><w:jc w:val="left"\/>/.test(x3))
const x4 = buildGambarXml({ fileId: 'fA', tambahan: [{ fileId: '' }, { fileId: 'fC' }] }, 'Arial', 24, peta)
ok('C10 tiga kolom; gambar belum diunggah = penanda di kolomnya', hitung(x4, /<w:gridCol /) === 3 && x4.includes('[ Gambar ]') && hitung(x4, /<w:drawing>/) === 2)
const x5 = buildGambarXml({ fileId: 'fA', sub: 'Satu saja' }, 'Arial', 24, peta)
ok('C11 satu gambar ber-sub: sub di bawahnya, ikut perataan, tanpa tabel', x5.includes('Satu saja') && !x5.includes('<w:tbl>') && x5.indexOf('Satu saja') < x5.indexOf('SEQ Gambar'))

// ─── D. Dokumen utuh ───
console.log('\nD. Dokumen utuh')
const png = (w: number, h: number, rgb: [number, number, number]) => {
  const pot = (tipe: string, data: Buffer) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(tipe), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, c]) }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2
  const baris = Buffer.alloc((w * 3 + 1) * h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) baris.set(rgb, y * (w * 3 + 1) + 1 + x * 3)
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), pot('IHDR', ihdr), pot('IDAT', deflateSync(baris)), pot('IEND', Buffer.alloc(0))])
}
const gambarUji = (() => {
  const isi: Array<[string, Buffer]> = [['fileAAAAAAAAAA', png(400, 300, [200, 60, 60])], ['fileBBBBBBBBBB', png(300, 300, [60, 160, 60])], ['fileCCCCCCCCCC', png(600, 200, [60, 60, 200])]]
  const map = new Map<string, ImageInfo>()
  const media = isi.map(([fid, buf], i) => { map.set(fid, { id: 101 + i, relId: `rIdImg${i + 1}`, mediaName: `image${i + 1}.png`, ext: 'png', wEmu: buf.readUInt32BE(16) * EMU_PER_PX, hEmu: buf.readUInt32BE(20) * EMU_PER_PX }); return { name: `word/media/image${i + 1}.png`, buf } })
  const relsXml = [...map.values()].map(i => `<Relationship Id="${i.relId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${i.mediaName}"/>`).join('')
  return { map, media, relsXml, ctXml: '<Default Extension="png" ContentType="image/png"/>' }
})()
const sec: SectionFlat[] = [{ id: 1, parent_id: null, depth: 0, urutan: 0, judul: 'PENDAHULUAN', locked: 1 }]
const blokDok: BlockNode[] = [
  { id: 11, tipe: 'GAMBAR', urutan: 0, payload: GambarPayloadSchema.parse({ judul: 'Polos', fileId: 'fileAAAAAAAAAA' }) },
  { id: 12, tipe: 'GAMBAR', urutan: 1, payload: GambarPayloadSchema.parse({ judul: 'Sebaris', fileId: 'fileAAAAAAAAAA', sub: '(a) Kiri', tambahan: [{ fileId: 'fileBBBBBBBBBB', sub: '(b) Tengah' }, { fileId: 'fileCCCCCCCCCC', sub: '(c) Kanan' }], bingkai: true }) },
  { id: 13, tipe: 'GAMBAR', urutan: 2, payload: GambarPayloadSchema.parse({ judul: 'Berbingkai', fileId: 'fileCCCCCCCCCC', rata: 'kanan', bingkai: true }) },
]
const docx = (await rakitDocx({ tree: buildNumberedTree(sec, new Map([[1, blokDok]])), judul: 'Uji Gambar', tahun: 2099, canonical_id: 'LKJIP-UJI', style_config: DEFAULT_STYLE }, gambarUji)).buffer
const docXml = new PizZip(docx).file('word/document.xml')!.asText()
ok('D1 tiga blok = tiga keterangan "Gambar n" (Daftar Gambar menghitung blok, bukan gambar)', hitung(docXml, /SEQ Gambar/) === 3)
ok('D2 dokumen utuh memuat 5 gambar (1 + 3 + 1)', hitung(docXml, /<w:drawing>/) === 5)
const dariCollect = kode('lib/lkjip/docgen.ts')
ok('D3 pengambil gambar Drive membaca SEMUA gambar blok (berkasBlok)', /for \(const fid of berkasBlok\(b\.tipe, b\.payload\)\)/.test(dariCollect) && !/\(b\.payload as \{ fileId\?: string \}\)\?\.fileId/.test(dariCollect))

// ─── E. Cari-Ganti ───
console.log('\nE. Cari-Ganti')
const pohon = buildNumberedTree(sec, new Map([[1, [
  { id: 21, tipe: 'GAMBAR', urutan: 0, payload: { judul: 'Apel pagi', fileId: 'a', sub: 'apel satu', tambahan: [{ fileId: 'b', sub: 'apel dua' }, { fileId: 'c', sub: 'lain' }] } },
] as BlockNode[]]]))
const temu = cariDiDokumen({ tree: pohon, kataPengantarHtml: '' }, { kata: 'apel' })
ok('E1 cari menemukan judul + sub gambar pertama + sub tambahan', temu.length === 3 && temu.filter(x => x.tempat.jenis === 'sub').map(x => (x.tempat as { i: number }).i).join() === '0,1', JSON.stringify(temu.map(x => x.tempat)))
const g1 = gantiDiDokumen({ tree: pohon, kataPengantarHtml: '' }, { kata: 'apel' }, 'upacara', { tempat: { jenis: 'sub', blockId: 21, i: 1 }, ke: 0 })
const pg = g1.blok[0]?.payload as { sub: string; judul: string; tambahan: { sub: string }[] }
ok('E2 ganti satu: hanya sub gambar kedua', g1.jumlah === 1 && pg.tambahan[0].sub === 'upacara dua' && pg.sub === 'apel satu' && pg.judul === 'Apel pagi' && pg.tambahan[1].sub === 'lain', JSON.stringify(pg))
const g2 = gantiDiDokumen({ tree: pohon, kataPengantarHtml: '' }, { kata: 'apel' }, 'upacara')
const ps = g2.blok[0]?.payload as { sub: string; judul: string; tambahan: { sub: string; fileId: string }[] }
ok('E3 ganti semua: judul + kedua sub, berkas tetap', g2.jumlah === 3 && ps.sub === 'upacara satu' && ps.tambahan[0].sub === 'upacara dua' && ps.tambahan[0].fileId === 'b' && GambarPayloadSchema.safeParse(ps).success, JSON.stringify(ps))
let terlaluPanjang = false
try { gantiDiDokumen({ tree: pohon, kataPengantarHtml: '' }, { kata: 'lain' }, 'x'.repeat(300)) } catch { terlaluPanjang = true }
ok('E4 hasil sub melewati batas ditolak, tidak dipotong diam-diam', terlaluPanjang)

// ─── F. PDF LibreOffice ───
console.log('\nF. PDF LibreOffice')
const lo = cariLibreOffice()
ok('F0 LibreOffice terpasang', !!lo)
if (lo) {
  const muat = createRequire(import.meta.url)
  const pdfjs = await import('file:///' + muat.resolve('pdfjs-dist/legacy/build/pdf.mjs').replace(/\\/g, '/'))
  // pdfjs 5 menggabungkan perintah gambar-garis ke dalam constructPath (argumen pertamanya); versi lama memisahkannya.
  const GARIS = new Set([pdfjs.OPS.stroke, pdfjs.OPS.closeStroke, pdfjs.OPS.fillStroke, pdfjs.OPS.eoFillStroke, pdfjs.OPS.closeFillStroke, pdfjs.OPS.closeEOFillStroke])
  const hitungGaris = (ops: { fnArray: number[]; argsArray: unknown[][] }) => ops.fnArray.filter((f, k) => GARIS.has(f) || (f === pdfjs.OPS.constructPath && GARIS.has(ops.argsArray[k]?.[0] as number))).length
  const pdf = await ubahKePdf(docx, { lokasi: lo, judul: 'Uji Gambar' })
  const dok = await pdfjs.getDocument({ data: new Uint8Array(pdf), isEvalSupported: false }).promise
  let posisiSub: Record<string, { x: number; y: number; hlm: number }> = {}
  let garis = 0, gambarPdf = 0
  for (let i = 1; i <= dok.numPages; i++) {
    const pg = await dok.getPage(i)
    for (const it of (await pg.getTextContent()).items as { str: string; transform: number[] }[]) {
      if (/^\([abc]\)/.test(it.str)) posisiSub = { ...posisiSub, [it.str.slice(0, 3)]: { x: it.transform[4], y: it.transform[5], hlm: i } }
    }
    const ops = await pg.getOperatorList()
    gambarPdf += ops.fnArray.filter((f: number) => f === pdfjs.OPS.paintImageXObject).length
    garis += hitungGaris(ops)
  }
  const [a, b, c] = ['(a)', '(b)', '(c)'].map(k => posisiSub[k])
  ok('F1 PDF memuat 5 gambar', gambarPdf === 5, String(gambarPdf))
  ok('F2 tiga gambar sebaris: sub sejajar (y sama), urut kiri → kanan, satu halaman', !!(a && b && c) && Math.abs(a.y - b.y) < 2 && Math.abs(b.y - c.y) < 2 && a.x < b.x && b.x < c.x && a.hlm === c.hlm, JSON.stringify(posisiSub))
  // Pembanding: dokumen yang sama tanpa bingkai.
  const tanpa = blokDok.map(b => ({ ...b, payload: { ...(b.payload as object), bingkai: false } }))
  const docxTanpa = (await rakitDocx({ tree: buildNumberedTree(sec, new Map([[1, tanpa]])), judul: 'Uji', tahun: 2099, canonical_id: 'LKJIP-UJI', style_config: DEFAULT_STYLE }, gambarUji)).buffer
  const dok2 = await pdfjs.getDocument({ data: new Uint8Array(await ubahKePdf(docxTanpa, { lokasi: lo, judul: 'Uji' })), isEvalSupported: false }).promise
  let garisTanpa = 0
  for (let i = 1; i <= dok2.numPages; i++) garisTanpa += hitungGaris(await (await dok2.getPage(i)).getOperatorList())
  ok('F3 LibreOffice menggambar bingkai (§4.2): 4 gambar berbingkai = 4 × 4 sisi, tanpa bingkai = 0', garis === 16 && garisTanpa === 0, `dengan ${garis}, tanpa ${garisTanpa}`)
}

// ─── G. Sambungan layar ───
console.log('\nG. Sambungan layar')
const ed = kode('app/(dashboard)/lkjip/[id]/editor-client.tsx')
ok('G1 editor Gambar menyimpan tambahan + perataan + sub', /tambahan: lain\.map\(t => \(\{ fileId: t\.fileId, sub: t\.sub, \.\.\.t\.ukuran \}\)\)/.test(ed) && /judul, caption, \.\.\.atur, fileId: pertama\.fileId, sub: pertama\.sub, \.\.\.pertama\.ukuran/.test(ed))
ok('G2 editor Grafik menyimpan perataan & bingkai', /\.\.\.ukuran, \.\.\.atur \}\);/.test(ed) && /<IsianAturGambar atur=\{atur\} onUbah=\{u => setAtur\(a => \(\{ \.\.\.a, \.\.\.u \}\)\)\} readOnly=\{readOnly\} \/>/.test(ed))
ok('G2b dua perubahan cepat tidak saling menimpa: isian mengirim sebagian, induk menggabung ke nilai terbaru', /onClick=\{\(\) => onUbah\(\{ rata: r \}\)\}/.test(ed) && /onUbah\(\{ bingkai: e\.target\.checked \}\)/.test(ed) && (ed.match(/onUbah=\{u => setAtur\(a => \(\{ \.\.\.a, \.\.\.u \}\)\)\}/g) ?? []).length === 2)
ok('G3 tombol tambah dibatasi BATAS_TAMBAHAN_GAMBAR & butuh gambar pertama', /gambar\.length <= BATAS_TAMBAHAN_GAMBAR && gambar\[0\]\.fileId/.test(ed) && BATAS_TAMBAHAN_GAMBAR === 2)
ok('G4 pratinjau berdampingan dibatasi lebar kolom yang sama dengan Word', /const lebarMaks = lebarMaksEmu\(gambar\.length, geo\.lebarTulis\);/.test(ed) && /lebarMaks=\{lebarMaks\}/.test(ed))
const gb = kode('app/(dashboard)/lkjip/[id]/GambarBerukuran.tsx')
ok('G5 pratinjau ikut perataan & bingkai', gb.includes('justifyContent: RATA_FLEX[atur.rata]') && gb.includes("atur.bingkai ? ' lk-gbr-garis' : ''") && gb.includes('gayaPratinjau(ukuran, alami, lebarMaks, tinggiMaks)'))

console.log(`\n${gagal.length ? 'GAGAL — ' : 'LULUS — '}${lulus} lulus, ${gagal.length} gagal`)
if (gagal.length) process.exit(1)
