// scripts/test-lkjip-ukuran-gambar.mts — ukuran & pratinjau gambar LKJIP (docs/CONCEPT-lkjip-ukuran-gambar.md).
//
// A: aturan ukuran    C: impor dari Word    E: editor (kode)
// B: skema & payload  D: berkas Word        F: izin pratinjau (kode)
//
// Jalankan: npx tsx scripts/test-lkjip-ukuran-gambar.mts [berkas-pemilik.docx]

import { readFileSync } from 'node:fs'
import PizZip from 'pizzip'
import { bacaDocxLkjip } from '../lib/lkjip/impor-word'
import { GambarPayloadSchema, GrafikPayloadSchema, parseBlockPayload } from '../lib/lkjip/schemas'
import { buildGambarXml } from '../lib/lkjip/docgen'
import {
  EMU_PER_CM, LEBAR_MAKS_CM, LEBAR_MAKS_EMU, LEBAR_MIN_CM, TANPA_UKURAN, TINGGI_MAKS_EMU,
  bacaUkuran, cmDariEmu, emuDariCm, gayaPratinjau, jepitUkuran, kembalikanProporsi, lepasDariBerkas,
  potonganSah, proporsiMenyimpang, ubahLebar, ukuranTampilEmu, xmlPotongan, type UkuranGambar,
} from '../lib/lkjip/ukuran-gambar'

let lulus = 0
const gagal: string[] = []
function ok(nama: string, syarat: boolean, ket = '') {
  if (syarat) { lulus++; console.log(`  ok  ${nama}`) }
  else { gagal.push(nama); console.log(`FAIL  ${nama}${ket ? ' — ' + ket : ''}`) }
}
const kode = (p: string) => readFileSync(p, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')
const cm = (n: number) => n * EMU_PER_CM
const ALAMI = { wEmu: cm(20), hEmu: cm(10) }
const dekat = (a: number, b: number, t = 2) => Math.abs(a - b) <= t

// ─── A. Aturan ukuran ─────────────────────────────────────────────────────────
console.log('A. Aturan ukuran')
const a1 = ukuranTampilEmu(TANPA_UKURAN, { wEmu: cm(10), hEmu: cm(8) })
ok('A1 otomatis: ukuran alami selama muat', a1.wEmu === cm(10) && a1.hEmu === cm(8), JSON.stringify(a1))
const a2 = ukuranTampilEmu(TANPA_UKURAN, ALAMI)
ok('A2 otomatis terlalu lebar: berhenti di bidang tulis, sebanding', a2.wEmu === LEBAR_MAKS_EMU && dekat(a2.hEmu, LEBAR_MAKS_EMU / 2), JSON.stringify(a2))
ok('A3 bidang tulis 15,5 cm, bukan batas lama 16 cm', LEBAR_MAKS_EMU < 5760000 && Math.round(LEBAR_MAKS_EMU / 3600) / 100 === LEBAR_MAKS_CM, String(LEBAR_MAKS_EMU))
const a4 = ukuranTampilEmu({ lebarEmu: cm(8), tinggiEmu: null, potong: null }, ALAMI)
ok('A4 lebar pasti, tinggi mengikuti proporsi', a4.wEmu === cm(8) && a4.hEmu === cm(4), JSON.stringify(a4))
const a5 = ukuranTampilEmu({ lebarEmu: cm(8), tinggiEmu: cm(7), potong: null }, ALAMI)
ok('A5 keduanya pasti: dipakai persis walau gepeng', a5.wEmu === cm(8) && a5.hEmu === cm(7), JSON.stringify(a5))
const a6 = ukuranTampilEmu({ lebarEmu: cm(10), tinggiEmu: null, potong: { kiri: 0, atas: 25000, kanan: 0, bawah: 25000 } }, ALAMI)
ok('A6 tinggi mengikuti proporsi SESUDAH dipotong', a6.wEmu === cm(10) && a6.hEmu === cm(2.5), JSON.stringify(a6))
const a7 = ukuranTampilEmu({ lebarEmu: null, tinggiEmu: null, potong: { kiri: 10000, atas: 0, kanan: 10000, bawah: 0 } }, { wEmu: cm(10), hEmu: cm(5) })
ok('A7 otomatis berpotongan: bagian terlihat saja', a7.wEmu === cm(8) && a7.hEmu === cm(5), JSON.stringify(a7))
const a8 = ukuranTampilEmu(TANPA_UKURAN, { wEmu: cm(5), hEmu: cm(50) })
ok('A8 terlalu tinggi: berhenti di batas tinggi, sebanding', a8.hEmu === TINGGI_MAKS_EMU && dekat(a8.wEmu, TINGGI_MAKS_EMU / 10), JSON.stringify(a8))
ok('A9 batas tinggi menyisakan ruang keterangan', dekat(TINGGI_MAKS_EMU / EMU_PER_CM, 23.2, 0.05), String(TINGGI_MAKS_EMU / EMU_PER_CM))
const a10 = jepitUkuran(cm(16), cm(8))
ok('A10 jepit melapor bila diperkecil', a10.diperkecil && a10.wEmu === LEBAR_MAKS_EMU && !jepitUkuran(cm(5), cm(5)).diperkecil, JSON.stringify(a10))

ok('A11 proporsi sesuai: tidak menyimpang', !proporsiMenyimpang({ lebarEmu: cm(10), tinggiEmu: cm(5), potong: null }, ALAMI))
ok('A12 proporsi di bawah ambang 2%: tidak menyimpang', !proporsiMenyimpang({ lebarEmu: cm(10), tinggiEmu: cm(5.05), potong: null }, ALAMI))
ok('A13 proporsi di atas ambang: menyimpang', proporsiMenyimpang({ lebarEmu: cm(10), tinggiEmu: cm(5.5), potong: null }, ALAMI))
ok('A14 penyimpangan dihitung sesudah potongan', !proporsiMenyimpang({ lebarEmu: cm(10), tinggiEmu: cm(2.5), potong: { kiri: 0, atas: 25000, kanan: 0, bawah: 25000 } }, ALAMI))
ok('A15 tanpa tinggi pasti: tidak mungkin menyimpang', !proporsiMenyimpang({ lebarEmu: cm(10), tinggiEmu: null, potong: null }, ALAMI) && !proporsiMenyimpang(TANPA_UKURAN, ALAMI))

const g1 = gayaPratinjau({ lebarEmu: LEBAR_MAKS_EMU / 2, tinggiEmu: null, potong: null }, ALAMI)
ok('A16 pratinjau: lebar terhadap bidang tulis', dekat(g1.lebarPct, 50, 0.01) && dekat(g1.rasio, 2, 0.01) && g1.gambar.widthPct === 100 && g1.gambar.leftPct === 0, JSON.stringify(g1))
const g2 = gayaPratinjau({ lebarEmu: cm(10), tinggiEmu: null, potong: { kiri: 10000, atas: 20000, kanan: 40000, bawah: 55000 } }, ALAMI)
ok('A17 pratinjau: gambar digeser sebesar potongan', dekat(g2.gambar.widthPct, 200, 0.01) && dekat(g2.gambar.heightPct, 400, 0.01) && dekat(g2.gambar.leftPct, -20, 0.01) && dekat(g2.gambar.topPct, -80, 0.01), JSON.stringify(g2.gambar))

const u3 = { lebarEmu: cm(9), tinggiEmu: cm(8), potong: { kiri: 0, atas: 1000, kanan: 0, bawah: 1000 } }
const b1 = ubahLebar(u3, cm(4.5))
ok('A18 ubah lebar: tinggi pasti ikut sebanding, potongan tetap', b1.lebarEmu === cm(4.5) && b1.tinggiEmu === cm(4) && b1.potong === u3.potong, JSON.stringify(b1))
const b2 = ubahLebar({ lebarEmu: cm(9), tinggiEmu: null, potong: null }, cm(5))
ok('A19 ubah lebar: tinggi mengikuti tetap kosong', b2.lebarEmu === cm(5) && b2.tinggiEmu === null)
const b3 = ubahLebar(u3, null)
ok('A20 kosongkan lebar: otomatis, potongan tetap', b3.lebarEmu === null && b3.tinggiEmu === null && b3.potong === u3.potong)
ok('A21 lebar dijepit ke rentang isian', ubahLebar(TANPA_UKURAN, cm(40)).lebarEmu === LEBAR_MAKS_EMU && ubahLebar(TANPA_UKURAN, 0).lebarEmu === cm(LEBAR_MIN_CM))
const b4 = ubahLebar({ lebarEmu: cm(5), tinggiEmu: cm(20), potong: null }, cm(15))
ok('A22 hasil ubah tetap lolos batas skema', (b4.tinggiEmu ?? 0) <= TINGGI_MAKS_EMU && dekat((b4.lebarEmu ?? 0) / (b4.tinggiEmu ?? 1), 0.25, 0.001), JSON.stringify(b4))
let b5: UkuranGambar = { lebarEmu: cm(9.7), tinggiEmu: cm(8.6), potong: null }
for (const k of [1, 12, 12.5, 1, 7, 9.7]) b5 = ubahLebar(b5, cm(k))
ok('A23 mengetik angka demi angka tidak merusak proporsi', dekat(b5.tinggiEmu ?? 0, cm(8.6), 20), String(b5.tinggiEmu))
ok('A24 Kembalikan proporsi: hanya tinggi yang dilepas', JSON.stringify(kembalikanProporsi(u3)) === JSON.stringify({ ...u3, tinggiEmu: null }))
ok('A25 ganti berkas: lebar tetap, tinggi & potongan dilepas', JSON.stringify(lepasDariBerkas(u3)) === JSON.stringify({ lebarEmu: cm(9), tinggiEmu: null, potong: null }))
ok('A26 konversi cm', cmDariEmu(3492000) === 9.7 && emuDariCm(9.7) === 3492000 && cmDariEmu(LEBAR_MAKS_EMU) === 15.5, `${cmDariEmu(3492000)} ${emuDariCm(9.7)} ${cmDariEmu(LEBAR_MAKS_EMU)}`)

ok('A27 potongan sah', potonganSah({ kiri: 0, atas: 1039, kanan: 0, bawah: 1039 }))
ok('A28 potongan rusak ditolak', !potonganSah({ kiri: -1, atas: 0, kanan: 0, bawah: 0 }) && !potonganSah({ kiri: 60000, atas: 0, kanan: 60000, bawah: 0 }) && !potonganSah({ kiri: 0, atas: 60000, kanan: 0, bawah: 60000 }) && !potonganSah({ kiri: 1.5, atas: 0, kanan: 0, bawah: 0 }) && !potonganSah(null) && !potonganSah({ kiri: 0 }))
ok('A29 baca payload lama = otomatis', JSON.stringify(bacaUkuran({ judul: 'x', fileId: 'y' })) === JSON.stringify(TANPA_UKURAN) && JSON.stringify(bacaUkuran(null)) === JSON.stringify(TANPA_UKURAN))
ok('A30 baca isian rusak = otomatis', JSON.stringify(bacaUkuran({ lebarEmu: 'x', tinggiEmu: -3, potong: { kiri: 'a' } })) === JSON.stringify(TANPA_UKURAN))
ok('A31 tinggi tanpa lebar diabaikan', bacaUkuran({ tinggiEmu: 500 }).tinggiEmu === null)
ok('A31b angka negatif atau nol = tidak ada', bacaUkuran({ lebarEmu: -5 }).lebarEmu === null && bacaUkuran({ lebarEmu: 0 }).lebarEmu === null && bacaUkuran({ lebarEmu: 5, tinggiEmu: -3 }).tinggiEmu === null)
ok('A32 baca payload utuh', JSON.stringify(bacaUkuran({ lebarEmu: 5, tinggiEmu: 6, potong: { kiri: 1, atas: 2, kanan: 3, bawah: 4 } })) === JSON.stringify({ lebarEmu: 5, tinggiEmu: 6, potong: { kiri: 1, atas: 2, kanan: 3, bawah: 4 } }))

// ─── B. Skema ─────────────────────────────────────────────────────────────────
console.log('\nB. Skema')
const isi = { lebarEmu: cm(9), tinggiEmu: cm(8), potong: { kiri: 0, atas: 1039, kanan: 0, bawah: 1039 } }
for (const [tipe, nama] of [['GAMBAR', 'B1'], ['GRAFIK', 'B2']] as const) {
  const p = parseBlockPayload(tipe, isi) as UkuranGambar
  ok(`${nama} ${tipe}: ketiga kunci bertahan`, p.lebarEmu === isi.lebarEmu && p.tinggiEmu === isi.tinggiEmu && JSON.stringify(p.potong) === JSON.stringify(isi.potong), JSON.stringify(p))
}
const lama = GambarPayloadSchema.parse({ judul: 'x', fileId: 'y', caption: '' })
ok('B3 foto lama tanpa kunci: otomatis', lama.lebarEmu === null && lama.tinggiEmu === null && lama.potong === null)
ok('B4 grafik lama tanpa kunci: otomatis', GrafikPayloadSchema.parse({}).lebarEmu === null)
ok('B5 melewati batas ditolak', !GambarPayloadSchema.safeParse({ lebarEmu: LEBAR_MAKS_EMU + 1 }).success && !GambarPayloadSchema.safeParse({ lebarEmu: 5, tinggiEmu: TINGGI_MAKS_EMU + 1 }).success)
ok('B6 tepat di batas diterima', GambarPayloadSchema.safeParse({ lebarEmu: LEBAR_MAKS_EMU, tinggiEmu: TINGGI_MAKS_EMU }).success)
ok('B7 potongan rusak ditolak', !GambarPayloadSchema.safeParse({ potong: { kiri: 60000, atas: 0, kanan: 60000, bawah: 0 } }).success)
ok('B8 nol & pecahan ditolak', !GambarPayloadSchema.safeParse({ lebarEmu: 0 }).success && !GambarPayloadSchema.safeParse({ lebarEmu: 1.5 }).success)

// ─── C. Impor dari Word ───────────────────────────────────────────────────────
console.log('\nC. Impor dari Word')
const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="wp" xmlns:a="a" xmlns:pic="pic" xmlns:v="v" xmlns:c="c" xmlns:wpg="wpg"'
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64')
const pic = (rid: string, o: { srcRect?: string; xfrm?: string } = {}) =>
  `<pic:pic><pic:blipFill><a:blip r:embed="${rid}"/>${o.srcRect ?? ''}<a:stretch/></pic:blipFill><pic:spPr>${o.xfrm ?? ''}</pic:spPr></pic:pic>`
const drawing = (isiGraphic: string, ext = 'cx="3506625" cy="3086100"', wadah = 'wp:inline') =>
  `<w:drawing><${wadah}><wp:extent ${ext}/><a:graphic><a:graphicData>${isiGraphic}</a:graphicData></a:graphic></${wadah}></w:drawing>`
const parG = (isiRun: string) => `<w:p><w:r>${isiRun}</w:r></w:p>`
const docx = (badan: string): Buffer => {
  const z = new PizZip()
  z.file('word/document.xml', `<?xml version="1.0"?><w:document ${NS}><w:body><w:p><w:pPr><w:pStyle w:val="H1"/></w:pPr><w:r><w:t>BAB I PENDAHULUAN</w:t></w:r></w:p>${badan}<w:sectPr/></w:body></w:document>`)
  z.file('word/styles.xml', `<?xml version="1.0"?><w:styles ${NS}><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style><w:style w:type="paragraph" w:styleId="H1"><w:name w:val="heading 1"/></w:style></w:styles>`)
  z.file('word/media/a.png', PNG)
  z.file('word/media/b.png', PNG)
  z.file('word/_rels/document.xml.rels', `<?xml version="1.0"?><Relationships xmlns="r"><Relationship Id="rA" Type="image" Target="media/a.png"/><Relationship Id="rB" Type="image" Target="media/b.png"/><Relationship Id="rC" Type="chart" Target="charts/c.xml"/></Relationships>`)
  z.file('word/charts/c.xml', `<?xml version="1.0"?><c:chartSpace ${NS}><c:chart><c:plotArea><c:barChart><c:ser><c:cat><c:strCache><c:pt><c:v>A</c:v></c:pt></c:strCache></c:cat><c:val><c:numCache><c:pt><c:v>5</c:v></c:pt></c:numCache></c:val></c:ser></c:barChart></c:plotArea></c:chart></c:chartSpace>`)
  return z.generate({ type: 'nodebuffer' }) as Buffer
}
type BlokUji = { tipe: string; payload: UkuranGambar & Record<string, unknown> }
const impor = (badan: string) => bacaDocxLkjip(docx(badan))
const objek = (badan: string) => (impor(badan).bagian[0].blok as unknown as BlokUji[]).filter(b => b.tipe !== 'NARASI')
const ukuranDari = (b: BlokUji | undefined) => bacaUkuran(b?.payload)

const c1 = ukuranDari(objek(parG(drawing(pic('rA'))))[0])
ok('C1 satu gambar: ukuran dari wp:extent, persis', c1.lebarEmu === 3506625 && c1.tinggiEmu === 3086100 && c1.potong === null, JSON.stringify(c1))
const c2 = ukuranDari(objek(parG(drawing(pic('rA'), 'cx="3506625" cy="3086100"', 'wp:anchor')))[0])
ok('C2 gambar mengambang: ukurannya ikut', c2.lebarEmu === 3506625)
const c3 = ukuranDari(objek(parG(drawing(pic('rA', { srcRect: '<a:srcRect t="1039" b="1039"/>' }))))[0])
ok('C3 potongan dibawa, sisi kosong = 0', JSON.stringify(c3.potong) === JSON.stringify({ kiri: 0, atas: 1039, kanan: 0, bawah: 1039 }), JSON.stringify(c3.potong))
const c4 = ukuranDari(objek(parG(drawing(pic('rA', { srcRect: '<a:srcRect/>' }))))[0])
ok('C4 srcRect kosong = tanpa potongan', c4.potong === null && c4.lebarEmu === 3506625)
const c5 = ukuranDari(objek(parG(drawing(pic('rA', { srcRect: '<a:srcRect l="-5000" r="2000"/>' }))))[0])
ok('C5 nilai negatif bukan potongan', JSON.stringify(c5.potong) === JSON.stringify({ kiri: 0, atas: 0, kanan: 2000, bawah: 0 }), JSON.stringify(c5.potong))
const c6 = ukuranDari(objek(parG(drawing(pic('rA', { srcRect: '<a:srcRect l="60000" r="60000"/>' }))))[0])
ok('C6 potongan mustahil: otomatis, supaya tidak gepeng', c6.lebarEmu === null && c6.potong === null, JSON.stringify(c6))

const grup = objek(parG(`<w:drawing><wp:inline><wp:extent cx="5000000" cy="4000000"/><a:graphic><a:graphicData><wpg:wgp>${pic('rA')}${pic('rB')}</wpg:wgp></a:graphicData></a:graphic></wp:inline></w:drawing>`))
ok('C7 dua gambar dalam grup: dua blok, keduanya otomatis', grup.length === 2 && grup.every(b => ukuranDari(b).lebarEmu === null), JSON.stringify(grup.map(b => b.payload.lebarEmu)))
const grupSatu = objek(parG(`<w:drawing><wp:inline><wp:extent cx="5000000" cy="4000000"/><a:graphic><a:graphicData><wpg:wgp>${pic('rA')}</wpg:wgp></a:graphicData></a:graphic></wp:inline></w:drawing>`))
ok('C8 satu gambar dalam grup: tetap otomatis', grupSatu.length === 1 && ukuranDari(grupSatu[0]).lebarEmu === null)

const putar = impor(parG(drawing(pic('rA', { xfrm: '<a:xfrm rot="5400000"><a:ext cx="1000000" cy="2000000"/></a:xfrm>' }), 'cx="2000000" cy="1000000"')))
const c9 = ukuranDari((putar.bagian[0].blok as unknown as BlokUji[]).find(b => b.tipe !== 'NARASI'))
ok('C9 diputar: ukuran dari a:ext, bukan bingkai', c9.lebarEmu === 1000000 && c9.tinggiEmu === 2000000, JSON.stringify(c9))
ok('C10 diputar: disebut di peringatan', putar.peringatan.some(p => /1 gambar diputar/.test(p)), putar.peringatan.join(' | '))
const balik = impor(parG(drawing(pic('rA', { xfrm: '<a:xfrm flipH="1"><a:ext cx="1000000" cy="2000000"/></a:xfrm>' }))))
ok('C11 dibalik: disebut di peringatan', balik.peringatan.some(p => /diputar atau dibalik/.test(p)))
const lurus = impor(parG(drawing(pic('rA', { xfrm: '<a:xfrm rot="0"><a:ext cx="1" cy="1"/></a:xfrm>' }))))
ok('C12 rot=0: tanpa peringatan, ukuran dari wp:extent', !lurus.peringatan.some(p => /diputar/.test(p)) && ukuranDari((lurus.bagian[0].blok as unknown as BlokUji[]).find(b => b.tipe !== 'NARASI')).lebarEmu === 3506625)

ok('C12b putaran penuh 360° bukan putaran', !impor(parG(drawing(pic('rA', { xfrm: '<a:xfrm rot="21600000"><a:ext cx="1" cy="1"/></a:xfrm>' })))).peringatan.some(p => /diputar/.test(p)))
ok('C12c dibalik vertikal disebut', impor(parG(drawing(pic('rA', { xfrm: '<a:xfrm flipV="1"><a:ext cx="1" cy="1"/></a:xfrm>' })))).peringatan.some(p => /diputar/.test(p)))

const vml = (style: string, attr = '') => parG(`<w:pict><v:shape style="${style}"><v:imagedata r:id="rA"${attr}/></v:shape></w:pict>`)
const c13 = ukuranDari(objek(vml('position:absolute;width:276pt;height:243pt;mso-width-percent:0'))[0])
ok('C13 gambar lama: ukuran dari style', c13.lebarEmu === 276 * 12700 && c13.tinggiEmu === 243 * 12700, JSON.stringify(c13))
const c14 = ukuranDari(objek(vml('width:2in;height:1in'))[0])
ok('C14 gambar lama: satuan inci', c14.lebarEmu === 1828800 && c14.tinggiEmu === 914400, JSON.stringify(c14))
const c15 = ukuranDari(objek(vml('width:276pt;height:243pt', ' cropbottom="5243f"'))[0])
ok('C15 gambar lama berpotongan: otomatis', c15.lebarEmu === null, JSON.stringify(c15))
ok('C16 gambar lama tanpa satuan: otomatis', ukuranDari(objek(vml('width:276;height:243'))[0]).lebarEmu === null)
ok('C17 mso-width bukan width', ukuranDari(objek(vml('mso-width:50pt;height:243pt'))[0]).lebarEmu === null)
ok('C18 gambar lama diputar: disebut', impor(vml('width:10pt;height:10pt;rotation:90')).peringatan.some(p => /diputar/.test(p)))
ok('C19 gambar lama tanpa putaran: tidak disebut', !impor(vml('width:10pt;height:10pt;rotation:0')).peringatan.some(p => /diputar/.test(p)))
ok('C19b gambar lama dibalik: disebut', impor(vml('width:10pt;height:10pt;flip:x')).peringatan.some(p => /diputar/.test(p)))
const dobel = objek(parG('<w:pict><v:shape style="width:10pt;height:10pt"><v:imagedata r:id="rA"/></v:shape><v:shape style="width:20pt;height:20pt"><v:imagedata r:id="rB"/></v:shape></w:pict>'))
ok('C19c dua bentuk dalam satu pict: otomatis', dobel.length === 2 && dobel.every(b => ukuranDari(b).lebarEmu === null), JSON.stringify(dobel.map(b => b.payload.lebarEmu)))

const grafikW = objek(parG(`<w:drawing><wp:inline><wp:extent cx="4000000" cy="1000000"/><a:graphic><a:graphicData><c:chart r:id="rC"/></a:graphicData></a:graphic></wp:inline></w:drawing>`))[0]
const c20 = ukuranDari(grafikW)
ok('C20 grafik Word: lebar saja', grafikW?.tipe === 'GRAFIK' && c20.lebarEmu === 4000000 && c20.tinggiEmu === null, JSON.stringify(c20))
const grafikLebar = impor(parG(`<w:drawing><wp:inline><wp:extent cx="9000000" cy="1000000"/><a:graphic><a:graphicData><c:chart r:id="rC"/></a:graphicData></a:graphic></wp:inline></w:drawing>`))
ok('C21 grafik Word terlalu lebar: dijepit & disebut', ukuranDari((grafikLebar.bagian[0].blok as unknown as BlokUji[]).find(b => b.tipe === 'GRAFIK')).lebarEmu === LEBAR_MAKS_EMU && grafikLebar.peringatan.some(p => /diperkecil/.test(p)))

ok('C22 ukuran 0: otomatis', ukuranDari(objek(parG(drawing(pic('rA'), 'cx="0" cy="0"')))[0]).lebarEmu === null)
ok('C23 tanpa wp:extent: otomatis', ukuranDari(objek(parG(`<w:drawing><wp:inline><a:graphic><a:graphicData>${pic('rA')}</a:graphicData></a:graphic></wp:inline></w:drawing>`))[0]).lebarEmu === null)
const besar = impor(parG(drawing(pic('rA'), 'cx="5731200" cy="3543300"')))
const c24 = ukuranDari((besar.bagian[0].blok as unknown as BlokUji[]).find(b => b.tipe !== 'NARASI'))
ok('C24 lebih lebar dari bidang tulis: diperkecil sebanding', c24.lebarEmu === LEBAR_MAKS_EMU && dekat(c24.tinggiEmu ?? 0, 3543300 * LEBAR_MAKS_EMU / 5731200), JSON.stringify(c24))
ok('C25 diperkecil disebut, berjumlah', besar.peringatan.some(p => /^1 gambar lebih besar dari bidang tulis/.test(p)), besar.peringatan.join(' | '))
ok('C26 yang muat tidak disebut', !impor(parG(drawing(pic('rA')))).peringatan.some(p => /diperkecil/.test(p)))
const ket = objek(`<w:p><w:r><w:t>Grafik 1 Sumber</w:t></w:r></w:p>${parG(drawing(pic('rA')))}`)[0]
ok('C27 grafik bergambar ikut membawa ukuran', ket?.tipe === 'GRAFIK' && ukuranDari(ket).lebarEmu === 3506625 && ukuranDari(ket).tinggiEmu === 3086100, JSON.stringify(ket))
ok('C28 hasil impor selalu lolos skema', (() => { try { for (const b of (besar.bagian[0].blok as unknown as BlokUji[]).filter(x => x.tipe === 'GAMBAR')) parseBlockPayload('GAMBAR', b.payload); return true } catch { return false } })())
const raksasa = impor(parG(drawing(pic('rA'), 'cx="90000000" cy="90000000"')))
ok('C29 ukuran raksasa: lolos skema, tidak membatalkan dokumen', (() => { try { for (const b of (raksasa.bagian[0].blok as unknown as BlokUji[]).filter(x => x.tipe === 'GAMBAR')) parseBlockPayload('GAMBAR', b.payload); return true } catch { return false } })())

// ─── D. Berkas Word ───────────────────────────────────────────────────────────
console.log('\nD. Berkas Word')
const info = { id: 7, relId: 'rId9', mediaName: 'm.png', ext: 'png', wEmu: cm(10), hEmu: cm(5) }
const peta = new Map([['f', info]])
const xml = (p: Record<string, unknown>) => buildGambarXml({ fileId: 'f', ...p }, 'Arial', 24, peta)
const ext = (s: string) => /<wp:extent cx="(\d+)" cy="(\d+)"/.exec(s)?.slice(1).map(Number) ?? []
const aExt = (s: string) => /<a:ext cx="(\d+)" cy="(\d+)"/.exec(s)?.slice(1).map(Number) ?? []
ok('D1 tanpa ukuran: alami', JSON.stringify(ext(xml({}))) === JSON.stringify([cm(10), cm(5)]), String(ext(xml({}))))
const d2 = xml({ lebarEmu: cm(8), tinggiEmu: cm(7) })
ok('D2 ukuran pasti di wp:extent DAN a:ext', JSON.stringify(ext(d2)) === JSON.stringify([cm(8), cm(7)]) && JSON.stringify(aExt(d2)) === JSON.stringify([cm(8), cm(7)]), d2.slice(0, 200))
ok('D3 lebar saja: tinggi dari proporsi berkas', JSON.stringify(ext(xml({ lebarEmu: cm(8) }))) === JSON.stringify([cm(8), cm(4)]))
const d4 = xml({ lebarEmu: cm(8), tinggiEmu: cm(4), potong: { kiri: 1, atas: 2, kanan: 3, bawah: 4 } })
ok('D4 a:srcRect tertulis', d4.includes('<a:srcRect l="1" t="2" r="3" b="4"/>'), d4)
ok('D5 urutan skema: blip, srcRect, stretch', /<a:blip [^>]*\/><a:srcRect [^>]*\/><a:stretch>/.test(d4))
ok('D6 tanpa potongan: tanpa srcRect', !xml({ lebarEmu: cm(8) }).includes('srcRect') && xmlPotongan(null) === '')
ok('D7 satu berkas dua blok: ukurannya sendiri-sendiri', ext(xml({ lebarEmu: cm(8) }))[0] !== ext(xml({ lebarEmu: cm(3) }))[0])
ok('D8 otomatis terlalu lebar: tidak keluar margin', ext(buildGambarXml({ fileId: 'f' }, 'Arial', 24, new Map([['f', { ...info, wEmu: cm(30), hEmu: cm(15) }]])))[0] === LEBAR_MAKS_EMU)
ok('D9 isian payload rusak tidak menjatuhkan unduhan', ext(xml({ lebarEmu: 'x', potong: 'y' }))[0] === cm(10))
const dg = kode('lib/lkjip/docgen.ts')
ok('D10 Grafik memakai jalur ukuran yang sama', /imageFileId \? imgMap\.get\(p\.imageFileId\) : undefined;\s*const body = info \? drawingPara\(info, bacaUkuran\(payload\)\)/.test(dg))
ok('D11 batas lama 16 cm tidak tersisa', !/5760000|MAXW/.test(dg))
ok('D12 ukuran alami tanpa batas di pengambil berkas', /function imgDimsEmu[\s\S]*?return \{ wEmu: w \* EMU_PER_PX, hEmu: h \* EMU_PER_PX \};/.test(dg))

// ─── E. Editor ────────────────────────────────────────────────────────────────
console.log('\nE. Editor')
const ed = kode('app/(dashboard)/lkjip/[id]/editor-client.tsx')
const badan = (nama: string) => { const i = ed.indexOf(`function ${nama}(`); return ed.slice(i, ed.indexOf('\nfunction ', i + 10)) }
const gbr = badan('GambarEditor'), grf = badan('GrafikEditor')
ok('E1 Gambar: Simpan membawa ukuran', gbr.includes('onSave({ judul, caption, fileId, ...ukuran })'))
ok('E2 Grafik: Simpan membawa ukuran', /tabelSidik: source === 'tabel' \? sidikGrafik\(chartData\) : '', \.\.\.ukuran \}\)/.test(grf))
ok('E3 Gambar: penanda belum tersimpan menghitung ukuran', gbr.includes('JSON.stringify({ judul, caption, fileId, ukuran })'))
ok('E4 Grafik: penanda belum tersimpan menghitung ukuran', /const sidikIsi = JSON\.stringify\(\{[^}]*\bukuran \}\)/.test(grf))
ok('E5 Gambar: Ganti gambar melepas tinggi & potongan', gbr.includes('setFileId(json.fileId); setUkuran(lepasDariBerkas);'))
ok('E6 Grafik: Ganti gambar melepas tinggi & potongan', grf.includes('setGambarKini(json.fileId); setUkuran(lepasDariBerkas);'))
ok('E7 Grafik bersumber data: tinggi & potongan selalu lepas', grf.includes("const ukuran = source === 'gambar' ? ukuranIsian : lepasDariBerkas(ukuranIsian);"))
ok('E8 pemuatan awal dari payload', gbr.includes('useState(() => bacaUkuran(block.payload))') && grf.includes('useState(() => bacaUkuran(block.payload))'))
ok('E9 komponen dimulai ulang tiap ganti berkas', gbr.includes('<GambarBerukuran key={fileId}') && grf.includes('<GambarBerukuran key={gambarKini}'))
ok('E10 tulisan lama "Gambar siap" hilang', !gbr.includes('Gambar siap'))
ok('E11 gaya isian judul tidak menimpa kolom Lebar', ed.includes('.lk-gambar-ed > input {') && !/\.lk-gambar-ed input\b/.test(ed))
ok('E12 Grafik bersumber data mendapat isian Lebar', /source !== 'gambar' && !readOnly && <IsianLebar /.test(grf))
const kp = kode('app/(dashboard)/lkjip/[id]/GambarBerukuran.tsx')
ok('E13 hapus angka tidak langsung melepas proporsi', /if \(v !== ''\) onUbah\(ubahLebar\(ukuran, emuDariCm\(Number\(v\)\)\)\);/.test(kp))
ok('E14 kosong berlaku saat keluar', /if \(isian === ''\) \{ if \(ukuran\.lebarEmu\) onUbah\(ubahLebar\(ukuran, null\)\); return; \}/.test(kp))
ok('E15 keluar menulis ulang angka hasil jepit', kp.includes('setIsian(isianDari(ukuran));'))
ok('E16 Enter menyelesaikan isian', /e\.key === 'Enter'\) \{ e\.preventDefault\(\); e\.currentTarget\.blur\(\); \}/.test(kp))
ok('E17 ukuran di layar dari fungsi yang sama dengan Word', kp.includes('ukuranTampilEmu(ukuran, alami)') && kp.includes('gayaPratinjau(ukuran, alami)'))
ok('E18 spanduk & tombolnya', kp.includes('proporsiMenyimpang(ukuran, alami)') && kp.includes('onUbah(kembalikanProporsi(ukuran))') && /!readOnly && <PrimaButton/.test(kp))
ok('E19 gambar gagal dimuat disebut', kp.includes('onError={() => setGagal(true)}') && kp.includes('Gambar tidak bisa dimuat'))
ok('E20 hanya baca: tanpa isian', /\{!readOnly && \(\s*<label>Lebar \(cm\)/.test(kp))
ok('E21 pemuatan malas', kp.includes('loading="lazy"'))

// ─── F. Izin pratinjau ────────────────────────────────────────────────────────
console.log('\nF. Izin pratinjau')
const dl = kode('app/api/upload/download/route.ts')
ok('F1 cabang LKJIP dikunci pada context berkas', /owner\.context === 'buku_besar_aset' \|\| owner\.context === 'lkjip'/.test(dl))
ok('F2 LKJIP memakai pintu modulnya', /owner\.context === 'lkjip'\s*\? isLkjipRole\(session\.role, akses\?\.app_access \?\? null\)\s*: isAsetRole\(session\.role, akses\?\.app_access \?\? null\)/.test(dl))
ok('F3 app_access dari DB', dl.includes('SELECT app_access FROM users WHERE id = ${session.userId}'))
ok('F4 tanpa izin modul tetap ditolak', dl.includes('if (!isOwner && !bidangAllowed && !modulAllowed) return await deny();'))

// ─── G. Kalibrasi berkas pemilik (hanya dibaca) ───────────────────────────────
const berkasPemilik = process.argv[2]
if (berkasPemilik) {
  console.log('\nG. Kalibrasi berkas pemilik')
  const h = bacaDocxLkjip(readFileSync(berkasPemilik))
  const semua: BlokUji[] = []
  const jalan = (b: { blok: unknown[]; anak: unknown[] }) => { semua.push(...(b.blok as BlokUji[])); b.anak.forEach(a => jalan(a as typeof b)) }
  h.bagian.forEach(b => jalan(b as unknown as { blok: unknown[]; anak: unknown[] }))
  const gambar = semua.filter(b => b.tipe === 'GAMBAR' || (b.tipe === 'GRAFIK' && b.payload.source === 'gambar'))
  ok('G1 17 gambar semuanya berukuran', gambar.length === 17 && gambar.every(b => (b.payload.lebarEmu ?? 0) > 0 && (b.payload.tinggiEmu ?? 0) > 0), String(gambar.length))
  ok('G2 5 gambar selebar berkas asal diperkecil, disebut', h.peringatan.some(p => /^5 gambar lebih besar dari bidang tulis/.test(p)), h.peringatan.join(' | '))
  ok('G3 satu gambar berpotongan', gambar.filter(b => b.payload.potong).length === 1)
  ok('G4 semuanya lolos skema', gambar.every(b => { try { parseBlockPayload(b.tipe as 'GAMBAR', b.payload); return true } catch { return false } }))
}

console.log(`\n${lulus} lulus, ${gagal.length} gagal`)
if (gagal.length) { console.log(gagal.map(g => ` - ${g}`).join('\n')); process.exit(1) }
