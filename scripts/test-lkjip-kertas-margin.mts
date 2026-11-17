// Regresi kertas & margin per dokumen LKJIP (konsep docs/konsep/lkjip/CONCEPT-lkjip-kertas-margin-arsip-pdf.md bagian A).
// npx tsx scripts/test-lkjip-kertas-margin.mts — bagian F memakai LibreOffice sungguhan (tidak ada = GAGAL).
//
// A: geometri   B: skema   C: Word (dokumen utuh)   D: impor Word   E: penggaris & dampak   F: PDF LibreOffice   G: sambungan
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import PizZip from 'pizzip'
import {
  KERTAS, MARGIN, PGMAR, PGSZ, PGSZ_MELINTANG, UKURAN_KERTAS, MARGIN_BAWAAN_CM, geometri, geserPenanda, posisiPenanda,
} from '../lib/lkjip/halaman'
import { LEBAR_TULIS_DXA, LEBAR_TULIS_MELINTANG_DXA } from '../lib/lkjip/tabel'
import { LEBAR_MAKS_EMU, TINGGI_MAKS_EMU, batasGambar, lebarMaksEmu } from '../lib/lkjip/ukuran-gambar'
import { DEFAULT_STYLE, StyleConfigSchema, type StyleConfig } from '../lib/lkjip/schemas'
import { rakitDocx, type ImageInfo } from '../lib/lkjip/docgen'
import { buildNumberedTree, type BlockNode, type SectionFlat } from '../lib/lkjip/numbering'
import { halamanDariDokumenXml } from '../lib/lkjip/impor-word'
import { dampakKertas, kalimatDampak } from '../lib/lkjip/dampak-kertas'
import { cariLibreOffice, ubahKePdf } from '../lib/lkjip/pdf'

let lulus = 0
const gagal: string[] = []
function ok(nama: string, syarat: boolean, ket = '') {
  if (syarat) { lulus++; console.log(`  ok  ${nama}`) }
  else { gagal.push(nama); console.log(`FAIL  ${nama}${ket ? ' — ' + ket.slice(0, 400) : ''}`) }
}
const kode = (p: string) => readFileSync(p, 'utf8').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')
const gaya = (s: Partial<StyleConfig>): StyleConfig => ({ ...DEFAULT_STYLE, ...s })

// ─── A. Geometri ───
console.log('A. Geometri')
const b = geometri()
ok('A1 tanpa setelan = konstanta lama persis (pgSz, pgMar, lebar tulis tegak & melintang)', b.pgSz === PGSZ && b.pgSzMelintang === PGSZ_MELINTANG && b.pgMar === PGMAR && b.lebarTulis === LEBAR_TULIS_DXA && b.lebarTulisMelintang === LEBAR_TULIS_MELINTANG_DXA, JSON.stringify(b))
ok('A2 DEFAULT_STYLE = bawaan (dokumen lama tak berubah)', JSON.stringify(geometri(DEFAULT_STYLE)) === JSON.stringify(b))
ok('A3 batas gambar bawaan = konstanta lama', batasGambar(b).lebarMaks === LEBAR_MAKS_EMU && batasGambar(b).tinggiMaks === TINGGI_MAKS_EMU)
// Margin sengaja membuat bidang tulis JAUH dari A4 (9.922 vs 8.788 dxa): kiri 4 + kanan 2 di F4 = 8.789, nyaris A4,
// sehingga kode yang keliru memakai lebar A4 tetap lulus (ketahuan lewat uji mutasi).
const f4 = geometri({ kertas: 'F4', marginCm: { atas: 3, kanan: 1.5, bawah: 2, kiri: 2.5 } })
ok('A4 F4 = 21,5 × 33 cm (K1)', f4.kertas.lebar === 12191 && f4.kertas.tinggi === 18711 && UKURAN_KERTAS.F4.cm === '21,5 × 33 cm')
ok('A5 margin cm → dxa lewat 567/cm, dibulatkan', f4.margin.atas === 1701 && f4.margin.kanan === 851 && f4.margin.bawah === 1134 && f4.margin.kiri === 1418)
ok('A6 bidang tulis F4 = kertas − margin, melintang = tinggi − kiri − kanan', f4.lebarTulis === 12191 - 1418 - 851 && f4.lebarTulis === 9922 && f4.lebarTulisMelintang === 18711 - 1418 - 851 && f4.tinggiTulis === 18711 - 1701 - 1134)
ok('A7 pgMar menyebut margin baru, jarak header/footer tetap 1,25 cm (K4)', f4.pgMar === `<w:pgMar w:top="1701" w:right="851" w:bottom="1134" w:left="1418" w:header="${MARGIN.header}" w:footer="${MARGIN.footer}" w:gutter="0"/>`)
ok('A8 kertas melintang = diputar, orient landscape', f4.pgSzMelintang === '<w:pgSz w:w="18711" w:h="12191" w:orient="landscape"/>')
const aneh = geometri({ kertas: 'Letter', marginCm: { atas: 0.2, kanan: 9, bawah: 'x' as unknown as number, kiri: 3 } })
ok('A9 nilai di luar pilihan/batas jatuh ke bawaan per sisi', aneh.kertas.lebar === KERTAS.lebar && aneh.margin.atas === MARGIN.atas && aneh.margin.kanan === MARGIN.kanan && aneh.margin.bawah === MARGIN.bawah && aneh.margin.kiri === MARGIN.kiri)
ok('A10 lebar kolom gambar berdampingan ikut bidang tulis dokumen', lebarMaksEmu(2, f4.lebarTulis) === (Math.floor(f4.lebarTulis / 2) - 216) * 635 && lebarMaksEmu(1, f4.lebarTulis) === f4.lebarTulis * 635)

// ─── B. Skema ───
console.log('\nB. Skema')
const p0 = StyleConfigSchema.parse({})
ok('B1 tanpa kunci: A4 + margin lama', p0.kertas === 'A4' && JSON.stringify(p0.marginCm) === JSON.stringify(MARGIN_BAWAAN_CM))
ok('B2 F4 diterima, kertas lain ditolak', StyleConfigSchema.safeParse({ kertas: 'F4' }).success && !StyleConfigSchema.safeParse({ kertas: 'Letter' }).success)
const m = (o: Record<string, number>) => StyleConfigSchema.safeParse({ marginCm: { ...MARGIN_BAWAAN_CM, ...o } })
ok('B3 margin 1–5 cm tiap sisi (K3)', m({ atas: 1 }).success && m({ kiri: 5 }).success && !m({ atas: 0.9 }).success && !m({ kanan: 5.1 }).success)
const pesan = m({ bawah: 0.5 })
ok('B4 penolakan menyebut batasnya', !pesan.success && pesan.error.issues[0].message === 'Margin paling kecil 1 cm', pesan.success ? '' : pesan.error.issues[0].message)
ok('B5 dibulatkan 2 desimal', StyleConfigSchema.parse({ marginCm: { ...MARGIN_BAWAAN_CM, kiri: 3.14159 } }).marginCm.kiri === 3.14)

// ─── C. Word ───
console.log('\nC. Word (dokumen utuh)')
const sec: SectionFlat[] = [{ id: 1, parent_id: null, depth: 0, urutan: 0, judul: 'PENDAHULUAN', locked: 1 }, { id: 2, parent_id: 1, depth: 1, urutan: 0, judul: 'Latar', locked: 0 }]
const tabel = (x: Record<string, unknown> = {}) => ({ judul: 'T', kolom: ['A', 'B'], headerRows: 1, colWidths: [200, 200], rows: [[{ v: 'A' }, { v: 'B' }], [{ v: '1' }, { v: '2' }]], ...x })
const blk = new Map<number, BlockNode[]>([[2, [
  { id: 21, tipe: 'NARASI', urutan: 0, payload: { html: '<p>Isi.</p>' } },
  { id: 22, tipe: 'TABEL', urutan: 1, payload: tabel({ posisi: 'penuh' }) },
  { id: 23, tipe: 'TABEL', urutan: 2, payload: tabel({ melintang: true, posisi: 'penuh' }) },
  { id: 24, tipe: 'GAMBAR', urutan: 3, payload: { judul: 'Lebar', fileId: 'fA', lebarEmu: 99_000_000 } },
  { id: 25, tipe: 'GAMBAR', urutan: 4, payload: { judul: 'Dua', fileId: 'fA', tambahan: [{ fileId: 'fA' }] } },
] as BlockNode[]]])
const info: ImageInfo = { id: 101, relId: 'rIdImg1', mediaName: 'image1.png', ext: 'png', wEmu: 4000 * 9525, hEmu: 2000 * 9525 }
const img = { map: new Map([['fA', info]]), media: [], relsXml: '', ctXml: '' }
const rakit = async (s: Partial<StyleConfig>) => { const z = new PizZip((await rakitDocx({ tree: buildNumberedTree(sec, blk), judul: 'Uji', tahun: 2099, canonical_id: 'LKJIP-UJI', style_config: gaya(s) }, img)).buffer); return { doc: z.file('word/document.xml')!.asText(), f1: z.file('word/footer.xml')!.asText(), f2: z.file('word/footer2.xml')!.asText() } }
const setelanF4 = { kertas: 'F4' as const, marginCm: { atas: 3, kanan: 1.5, bawah: 2, kiri: 2.5 }, footerText: 'RSJD' }
const w = await rakit(setelanF4)
const sect = w.doc.match(/<w:sectPr>[\s\S]*?<\/w:sectPr>/g) ?? []
ok('C1 SEMUA section memakai kertas F4 & margin dokumen (tegak/melintang)', sect.length >= 4 && sect.every(s => s.includes(f4.pgMar) && (s.includes(f4.pgSz) || s.includes(f4.pgSzMelintang))) && sect.some(s => s.includes(f4.pgSzMelintang)), String(sect.length))
ok('C2 tidak tersisa pgSz/pgMar A4', !w.doc.includes(PGSZ) && !w.doc.includes(PGMAR))
ok('C3 tab footer di tepi kanan bidang tulis dokumen (tegak & melintang)', w.f1.includes(`<w:tab w:val="right" w:pos="${f4.lebarTulis}"/>`) && w.f2.includes(`<w:tab w:val="right" w:pos="${f4.lebarTulisMelintang}"/>`))
const lebarTabel = [...w.doc.matchAll(/<w:tblGrid>((?:<w:gridCol w:w="\d+"\/>)+)<\/w:tblGrid>/g)].map(x => [...x[1].matchAll(/w:w="(\d+)"/g)].reduce((a, y) => a + Number(y[1]), 0))
ok('C4 tabel "selebar kertas" = bidang tulis dokumen (tegak & melintang)', lebarTabel.includes(f4.lebarTulis) && lebarTabel.includes(f4.lebarTulisMelintang), String(lebarTabel))
const ekstent = [...w.doc.matchAll(/<wp:extent cx="(\d+)" cy="(\d+)"/g)].map(x => Number(x[1]))
ok('C5 gambar kebesaran dijepit ke lebar tulis dokumen, berdampingan ke kolom dokumen', ekstent[0] === f4.lebarTulis * 635 && ekstent.slice(1).every(x => x <= lebarMaksEmu(2, f4.lebarTulis)) && w.doc.includes(`<w:tc><w:tcPr><w:tcW w:w="${Math.floor(f4.lebarTulis / 2)}" w:type="dxa"/><w:vAlign w:val="bottom"/>`), String(ekstent))

// ─── D. Impor Word ───
console.log('\nD. Impor Word')
const sp = (w: number, h: number, mar = 'w:top="1418" w:right="1418" w:bottom="1418" w:left="1701"', orient = '') => `<w:sectPr><w:pgSz w:w="${w}" w:h="${h}"${orient}/><w:pgMar ${mar} w:header="708" w:footer="708"/></w:sectPr>`
const baca = (isi: string) => halamanDariDokumenXml(`<w:document xmlns:w="w"><w:body><w:p/>${isi}</w:body></w:document>`)
const dA4 = baca(sp(11906, 16838))
ok('D0 dokumen ber-sectPr terbaca', !!dA4)
if (dA4) {
  ok('D1 A4 (toleransi 2 mm) + margin lama', dA4.kertas === 'A4' && JSON.stringify(dA4.marginCm) === JSON.stringify({ atas: 2.5, kanan: 2.5, bawah: 2.5, kiri: 3 }) && dA4.peringatan.length === 0, JSON.stringify(dA4))
  ok('D2 F4 21,5×33 & Folio 8,5×13 inci sama-sama F4', baca(sp(12191, 18711))!.kertas === 'F4' && baca(sp(12240, 18720))!.kertas === 'F4')
  const dL = baca(sp(12240, 15840))!
  ok('D3 Letter → A4 + peringatan', dL.kertas === null && dL.peringatan.some(p => p.includes('bukan A4 atau F4')), JSON.stringify(dL.peringatan))
  const dM = baca(sp(11906, 16838, 'w:top="400" w:right="1418" w:bottom="1418" w:left="1701"'))!
  ok('D4 margin di luar 1–5 cm → bawaan + peringatan berangka koma', dM.marginCm === null && dM.peringatan.some(p => p.includes('atas 0,71')), JSON.stringify(dM.peringatan))
  const dLand = baca(`<w:p><w:pPr>${sp(12191, 18711)}</w:pPr></w:p>${sp(18711, 12191, undefined, ' w:orient="landscape"')}`)!
  ok('D5 section melintang di akhir bukan patokan: yang dipakai tegak terakhir', dLand.kertas === 'F4', JSON.stringify(dLand))
}
const rute = kode('app/api/lkjip/impor/route.ts')
ok('D6 route impor memakai kertas & margin berkas', rute.includes('kertas: hasil.halaman.kertas ?? DEFAULT_STYLE.kertas, marginCm: hasil.halaman.marginCm ?? DEFAULT_STYLE.marginCm'))

// ─── E. Penggaris & dampak ───
console.log('\nE. Penggaris & dampak')
const i0 = { kiri: 0, kanan: 567, pertama: 0 }
ok('E1 penanda kanan dihitung dari lebar dokumen', posisiPenanda(i0, 'kanan', f4.lebarTulis) === f4.lebarTulis - 567 && posisiPenanda(i0, 'kanan') === LEBAR_TULIS_DXA - 567)
ok('E2 menyeret penanda kanan di dokumen lebar: jaraknya dari tepi dokumen', geserPenanda(i0, 'kanan', f4.lebarTulis - 1134, 'paragraf', f4.lebarTulis).kanan === 1134)
const pohon = buildNumberedTree(sec, blk)
const d = dampakKertas(pohon, geometri({ marginCm: { atas: 2.5, kanan: 5, bawah: 2.5, kiri: 5 } }))
ok('E3 dampak: gambar berukuran pasti & tabel yang lebih lebar dari bidang tulis dihitung', d.gambar === 1 && d.tabel === 0, JSON.stringify(d))
const pohonLebar = buildNumberedTree(sec, new Map([[2, [
  { id: 31, tipe: 'TABEL', urutan: 0, payload: tabel({ colWidths: [300, 300] }) },
  { id: 32, tipe: 'TABEL', urutan: 1, payload: tabel({ colWidths: [300, 300], melintang: true }) },
] as BlockNode[]]]))
const dT = dampakKertas(pohonLebar, geometri({ marginCm: { atas: 2.5, kanan: 5, bawah: 2.5, kiri: 5 } }))
ok('E3b tabel 9.000 dxa > bidang tulis tegak 11 cm dihitung; yang melintang (19,7 cm) tidak', dT.tabel === 1 && dT.gambar === 0, JSON.stringify(dT))
ok('E4 kalimat dampak; kosong bila tidak ada', kalimatDampak({ gambar: 2, tabel: 1 }).startsWith('2 gambar dan 1 tabel') && kalimatDampak({ gambar: 0, tabel: 0 }) === '')

// ─── F. PDF LibreOffice ───
console.log('\nF. PDF LibreOffice')
const lo = cariLibreOffice()
ok('F0 LibreOffice terpasang', !!lo)
if (lo) {
  const muat = createRequire(import.meta.url)
  const pdfjs = await import('file:///' + muat.resolve('pdfjs-dist/legacy/build/pdf.mjs').replace(/\\/g, '/'))
  const docx = (await rakitDocx({ tree: buildNumberedTree(sec, new Map([[2, [{ id: 21, tipe: 'NARASI', urutan: 0, payload: { html: '<p>Kalimat uji margin kiri.</p>' } }] as BlockNode[]]])), judul: 'Uji', tahun: 2099, canonical_id: 'LKJIP-UJI', style_config: gaya(setelanF4) })).buffer
  const dok = await pdfjs.getDocument({ data: new Uint8Array(await ubahKePdf(docx, { lokasi: lo, judul: 'Uji' })), isEvalSupported: false }).promise
  const hlm = await dok.getPage(dok.numPages)
  const vp = hlm.getViewport({ scale: 1 })
  const ptDariCm = (cm: number) => (cm / 2.54) * 72
  ok('F1 ukuran halaman PDF = F4 21,5 × 33 cm', Math.abs(vp.width - ptDariCm(21.5)) < 1.5 && Math.abs(vp.height - ptDariCm(33)) < 1.5, `${vp.width} × ${vp.height}`)
  const teks = (await hlm.getTextContent()).items as { str: string; transform: number[] }[]
  const kalimat = teks.find(t => t.str.includes('Kalimat uji'))
  ok('F2 teks mulai tepat di margin kiri 2,5 cm (indent baris pertama 1,27 cm)', !!kalimat && Math.abs(kalimat.transform[4] - ptDariCm(2.5 + 1.27)) < 3, String(kalimat?.transform[4]))
}

// ─── G. Sambungan ───
console.log('\nG. Sambungan layar')
const ed = kode('app/(dashboard)/lkjip/[id]/editor-client.tsx')
ok('G1 Pengaturan: pilihan kertas dari daftar & empat isian margin', ed.includes('PILIHAN_KERTAS.map(k => <option key={k} value={k}>') && ed.includes("[['atas', 'Margin atas'], ['bawah', 'Margin bawah'], ['kiri', 'Margin kiri'], ['kanan', 'Margin kanan']]") && ed.includes('min={BATAS_MARGIN_CM.min} max={BATAS_MARGIN_CM.max}'))
ok('G2 satu geometri per blok untuk tabel, gambar, grafik', ed.includes('const geo = useMemo(() => geometri(gaya), [gaya]);') && ed.includes('lebarTulis: { tegak: geo.lebarTulis, melintang: geo.lebarTulisMelintang }') && ed.includes('geo={geo} />'))
ok('G3 sesudah Simpan Pengaturan: dampak disebut', ed.includes('kalimatDampak(dampakKertas(detail.tree, geometri(styleForm)))'))
const tt = kode('app/(dashboard)/lkjip/[id]/TiptapNarasi.tsx')
ok('G4 narasi & penggaris memakai lebar tulis dokumen', tt.includes('const lebarDxa = useMemo(() => geometri(gaya).lebarTulis, [gaya]);') && tt.includes('<PenggarisNarasi lebarDxa={lebarDxa}'))
const dg = kode('lib/lkjip/docgen.ts')
ok('G5 docgen: geometri dari style_config, tidak ada PGSZ/PGMAR tetap', dg.includes('const geo = geometri(cfg);') && !/\bPGSZ\b|\bPGMAR\b/.test(dg.replace(/\/\/.*$/gm, '')))

console.log(`\n${gagal.length ? 'GAGAL — ' : 'LULUS — '}${lulus} lulus, ${gagal.length} gagal`)
process.exit(gagal.length ? 1 : 0)
