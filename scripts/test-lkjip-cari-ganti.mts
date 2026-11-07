// scripts/test-lkjip-cari-ganti.mts — pemisah halaman & Cari-Ganti seluruh dokumen (konsep CONCEPT-lkjip-daftar-word.md §11).
//
// A: pola cari                 D: mengganti di dokumen            G: tempel pemisah dari Word (papan klip asli)
// B: narasi                    E: perintah pemisah di editor      H: MySQL kotak pasir 2099
// C: mencari di dokumen        F: penyaring & berkas Word         I: sambungan layar (komentar dibuang — L82c)
//
// Jalankan: npx tsx --env-file=.env.local scripts/test-lkjip-cari-ganti.mts

import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import PizZip from 'pizzip'
import type { Node as PMNode } from '@tiptap/pm/model'
import {
  BATAS_HTML_NARASI, GantiTerlaluPanjangError, cariDiDokumen, gantiDiDokumen, gantiDiNarasi, polaCariTeks, type TempatTemuan,
} from '../lib/lkjip/cari-ganti'
import { DEFAULT_STYLE, parseBlockPayload, sanitizeNarasiHtml } from '../lib/lkjip/schemas'
import { narasiToXml, rakitDocx } from '../lib/lkjip/docgen'
import { tempelDariWord } from '../lib/lkjip/tempel-word'
import { flattenTree, type BlockNode, type SectionFlat, type SectionNode, buildNumberedTree } from '../lib/lkjip/numbering'
import { sisipPemisahHalaman, type Perintah } from '../lib/lkjip/perintah-narasi'
import { GayaDaftar, PemisahHalaman, SpasiParagraf, TabNarasi } from '../lib/lkjip/ekstensi-narasi'
import { sql, queryOne } from '../lib/data/db'
import { LkjipFinalError, gantiTeksDokumen, getDokumenDetail } from '../lib/lkjip/data'

const muat = createRequire(import.meta.url)
const { getSchema } = muat('@tiptap/core') as typeof import('@tiptap/core')
const StarterKit = (muat('@tiptap/starter-kit') as { default: typeof import('@tiptap/starter-kit').default }).default
const { EditorState, TextSelection } = muat('@tiptap/pm/state') as typeof import('@tiptap/pm/state')
type EditorState = import('@tiptap/pm/state').EditorState

let lulus = 0
const gagal: string[] = []
function ok(nama: string, syarat: boolean, ket = '') {
  if (syarat) { lulus++; console.log(`  ok  ${nama}`) }
  else { gagal.push(nama); console.log(`FAIL  ${nama}${ket ? ' — ' + ket : ''}`) }
}
const kode = (p: string) => readFileSync(p, 'utf8').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')

// ─── A. Pola ──────────────────────────────────────────────────────────────────
console.log('A. Pola cari')
const cocok = (kata: string, teks: string, o = {}) => [...teks.matchAll(polaCariTeks({ kata, ...o })!)].map(m => m[0])
ok('A1 kata kosong: tak ada pola', polaCariTeks({ kata: '' }) === null)
ok('A2 huruf besar/kecil bawaan disamakan', cocok('rsjd', 'RSJD rsjd').length === 2)
ok('A3 opsi huruf sama persis', cocok('rsjd', 'RSJD rsjd', { hurufBesar: true }).length === 1)
ok('A4 tanda regex dibaca harfiah', cocok('a.b', 'a.b axb').length === 1 && cocok('(x)', '(x) x').length === 1 && cocok('50%', '50% 50').length === 1 && cocok('a/b-c', 'a/b-c').length === 1)
ok('A5 seluruh kata: bagian kata tidak cocok', cocok('kin', 'kinerja kin', { seluruhKata: true }).length === 1)
ok('A6 seluruh kata paham huruf bukan-latin & angka', cocok('rumah', 'rumahé rumah', { seluruhKata: true }).length === 1 && cocok('20', '2025 20', { seluruhKata: true }).length === 1)
ok('A7 spasi juga mencocokkan spasi tak-putus', cocok('a b', 'a b a b').length === 2)

// ─── B. Narasi ────────────────────────────────────────────────────────────────
console.log('\nB. Narasi')
const pola = (kata: string, o = {}) => polaCariTeks({ kata, ...o })!
const gn = (h: string, kata: string, dengan: string, ke?: number) => gantiDiNarasi(h, pola(kata), dengan, ke)
ok('B1 ganti sederhana', gn('<p>rumah sakit</p>', 'rumah', 'wisma').html === '<p>wisma sakit</p>')
ok('B2 tidak ada kecocokan: teks persis sama', (() => { const h = '<p>a &amp; b&nbsp;c</p>'; const g = gn(h, 'zzz', 'y'); return g.n === 0 && g.html === h })())
ok('B3 melintasi format: mengikuti format awalnya, tag kosong sisanya hilang', gn('<p>Rumah <strong>Sakit</strong> Jiwa</p>', 'Rumah Sakit', 'RS').html === '<p>RS Jiwa</p>', gn('<p>Rumah <strong>Sakit</strong> Jiwa</p>', 'Rumah Sakit', 'RS').html)
ok('B3b tag kosong bersarang ikut hilang', gn('<p>a<em><u>b</u></em></p>', 'ab', 'X').html === '<p>X</p>', gn('<p>a<em><u>b</u></em></p>', 'ab', 'X').html)
ok('B3c tanpa kecocokan: tag kosong yang sudah ada tidak disentuh', gn('<p>a<em></em></p>', 'z', 'X').html === '<p>a<em></em></p>')
ok('B4 mulai di tengah format', gn('<p><strong>ab</strong>cd</p>', 'bc', 'X').html === '<p><strong>aX</strong>d</p>', gn('<p><strong>ab</strong>cd</p>', 'bc', 'X').html)
ok('B5 tag & atribut tidak pernah kena', gn('<p style="text-align:center"><strong>strong</strong></p>', 'strong', 'X').html === '<p style="text-align:center"><strong>X</strong></p>' && gn('<p data-ind-kiri="360">center</p>', 'data', 'X').n === 0)
ok('B6 tidak melintasi paragraf', gn('<p>rumah</p><p>sakit</p>', 'rumah sakit', 'X').n === 0)
ok('B7 tidak melintasi butir daftar', gn('<ol><li><p>rumah</p></li><li><p>sakit</p></li></ol>', 'rumahsakit', 'X').n === 0)
ok('B8 tidak melintasi baris baru', gn('<p>rumah<br>sakit</p>', 'rumahsakit', 'X').n === 0)
ok('B9 angka tertaut tidak tersentuh', (() => { const h = '<p>nilai <span data-angka="a1">Rp 100</span> rupiah</p>'; const g = gn(h, 'Rp', 'IDR'); return g.n === 0 && g.html === h })())
ok('B9b teks sesudah angka tertaut tetap dicari', gn('<p><span data-angka="a1">Rp</span> kata</p>', 'kata', 'X').html === '<p><span data-angka="a1">Rp</span> X</p>')
ok('B10 rujukan tidak tersentuh', gn('<p>lihat <span data-rujuk="5">Tabel 3</span></p>', 'Tabel', 'X').n === 0)
ok('B11 tab tidak tersentuh, dan memutus kecocokan', gn('<p>a<span data-tab="1">\t</span>b</p>', 'ab', 'X').n === 0)
ok('B12 span warna tetap dicari', gn('<p><span style="color:#ff0000">merah</span></p>', 'merah', 'X').html === '<p><span style="color:#ff0000">X</span></p>')
ok('B13 entitas dibaca & ditulis ulang', gn('<p>A &amp; B</p>', 'A & B', 'C & D').html === '<p>C &amp; D</p>', gn('<p>A &amp; B</p>', 'A & B', 'C & D').html)
ok('B14 pengganti berisi tag jadi teks, bukan HTML', gn('<p>x</p>', 'x', '<script>a</script>').html === '<p>&lt;script&gt;a&lt;/script&gt;</p>')
ok('B15 spasi tak-putus dipertahankan di bagian lain', gn('<p>a&nbsp;b c</p>', 'c', 'd').html === '<p>a&nbsp;b d</p>')
ok('B16 banyak kecocokan satu paragraf', gn('<p>aXa <strong>Xa</strong></p>', 'a', 'bb').html === '<p>bbXbb <strong>Xbb</strong></p>' && gn('<p>aXa <strong>Xa</strong></p>', 'a', 'bb').n === 3, gn('<p>aXa <strong>Xa</strong></p>', 'a', 'bb').html)
ok('B17 kecocokan ke-n saja', gn('<p>a a</p><p>a</p>', 'a', 'X', 1).html === '<p>a X</p><p>a</p>' && gn('<p>a a</p><p>a</p>', 'a', 'X', 2).html === '<p>a a</p><p>X</p>', gn('<p>a a</p><p>a</p>', 'a', 'X', 2).html)
ok('B18 hapus (pengganti kosong)', gn('<p>a b</p>', ' b', '').html === '<p>a</p>')
ok('B19 hasil tetap lolos penyaring', (() => { const h = gn('<ol data-gaya="a)"><li data-sp-sesudah="0"><p>Rumah <em>Sakit</em></p></li></ol>', 'Sakit', 'Jiwa').html; return sanitizeNarasiHtml(h) === h })())
ok('B20 pemisah halaman bukan penghalang format', gn('<p>a</p><hr data-halaman="1"><p>a</p>', 'a', 'b').html === '<p>b</p><hr data-halaman="1"><p>b</p>')

// ─── C. Mencari ───────────────────────────────────────────────────────────────
console.log('\nC. Mencari di dokumen')
const sel = (v: string, extra = {}) => ({ v, ...extra })
const blokN = (id: number, html: string, extra = {}): BlockNode => ({ id, tipe: 'NARASI', urutan: id, payload: { html, ...extra } })
const blokT = (id: number, rows: unknown[][], extra = {}): BlockNode => ({ id, tipe: 'TABEL', urutan: id, payload: { judul: '', kolom: rows[0].map((_, i) => `K${i}`), align: rows[0].map(() => 'left'), colWidths: rows[0].map(() => 100), headerRows: 1, rows, ...extra } })
const buatPohon = (): SectionNode[] => {
  const s: SectionFlat[] = [
    { id: 1, parent_id: null, depth: 0, urutan: 0, judul: 'PENDAHULUAN sakit', locked: 1 },
    { id: 2, parent_id: 1, depth: 1, urutan: 0, judul: 'Latar sakit', locked: 0 },
  ]
  const b = new Map<number, BlockNode[]>([
    [1, [blokN(11, '<p>rumah sakit <strong>jiwa</strong></p>', { continueList: true, angka: {} })]],
    [2, [
      blokT(21, [[sel('Unit sakit'), sel('Nilai')], [sel('Poli sakit'), sel('1250000', { nf: 'num' })], [sel('Jumlah'), sel('=SUM(B2:B2)')]], { judul: 'Tabel sakit' }),
      blokT(22, [[sel('A')], [sel('sakit')]], { tautan: { sumber: 'x' } }),
      { id: 23, tipe: 'GAMBAR', urutan: 3, payload: { judul: 'Gambar sakit', fileId: 'f', caption: 'sakit juga' } },
      { id: 24, tipe: 'GRAFIK', urutan: 4, payload: { judul: 'Grafik sakit', caption: '', chartType: 'bar', source: 'manual', data: [], tabelBlockId: null, labelCol: 0, valueCol: 1, imageFileId: '' } },
    ]],
  ])
  return buildNumberedTree(s, b)
}
const data = () => ({ tree: buatPohon(), kataPengantarHtml: '<p>sakit di pengantar</p>' })
const tSakit = cariDiDokumen(data(), { kata: 'sakit' })
const jenisDi = (j: TempatTemuan['jenis']) => tSakit.filter(t => t.tempat.jenis === j)
ok('C1 semua tempat terbaca, urut seperti dokumen', tSakit[0].tempat.jenis === 'pengantar' && tSakit[1].tempat.jenis === 'judul-bab' && tSakit[2].tempat.jenis === 'narasi', JSON.stringify(tSakit.map(t => t.tempat.jenis)))
ok('C2 jumlah tiap jenis', jenisDi('judul-bab').length === 2 && jenisDi('narasi').length === 1 && jenisDi('pengantar').length === 1 && jenisDi('bidang').length === 4 && jenisDi('sel').length === 3, JSON.stringify(tSakit.map(t => t.tempat)))
ok('C3 judul BAB terkunci: terbaca tapi bertanda', !!tSakit.find(t => t.tempat.jenis === 'judul-bab' && t.sectionId === 1)?.alasan && !tSakit.find(t => t.tempat.jenis === 'judul-bab' && t.sectionId === 2)?.alasan)
ok('C4 tabel tertaut: terbaca, tak bisa diganti', !!tSakit.find(t => t.blockId === 22)?.alasan)
ok('C5 sel biasa bisa diganti', tSakit.find(t => t.blockId === 21 && t.tempat.jenis === 'sel')?.alasan === null)
ok('C6 letak menyebut nomor & jenis', tSakit.find(t => t.blockId === 11)?.letak === 'BAB I · Narasi' && tSakit.find(t => t.blockId === 21)!.letak.endsWith('· Tabel') && tSakit[0].letak === 'Kata Pengantar', tSakit.find(t => t.blockId === 11)?.letak)
ok('C7 cuplikan: sebelum, kata, sesudah', (() => { const t = tSakit.find(x => x.blockId === 11)!; return t.sebelum === 'rumah ' && t.cocok === 'sakit' && t.sesudah === ' jiwa' })(), JSON.stringify(tSakit.find(x => x.blockId === 11)))
const cupPanjang = cariDiDokumen({ tree: [], kataPengantarHtml: `<p>${'a'.repeat(60)} kata ${'b'.repeat(60)}</p>` }, { kata: 'kata' })[0]
ok('C8 cuplikan panjang dipotong dengan tanda', cupPanjang.sebelum.startsWith('…') && cupPanjang.sebelum.length <= 41 && cupPanjang.sesudah.endsWith('…') && cupPanjang.sesudah.length <= 41)
ok('C9 hasil rumus terbaca, tak bisa diganti, teks rumus tidak dicari', (() => {
  const t = cariDiDokumen(data(), { kata: '1250000' })
  const r = cariDiDokumen(data(), { kata: 'SUM' })
  return r.length === 0 && t.some(x => x.tempat.jenis === 'sel' && (x.tempat as { r: number }).r === 1)
})())
ok('C10 kata kosong: tak ada temuan', cariDiDokumen(data(), { kata: '' }).length === 0)
const tabelRumus = buildNumberedTree([{ id: 1, parent_id: null, depth: 0, urutan: 0, judul: 'X', locked: 0 }], new Map([[1, [blokT(1, [[sel('A')], [sel('=1+1')]])]]]))
const hasilRumus = cariDiDokumen({ tree: tabelRumus, kataPengantarHtml: '' }, { kata: '2' })
ok('C11 kecocokan pada hasil rumus bertanda', hasilRumus.length === 1 && /rumus/i.test(hasilRumus[0].alasan ?? ''), JSON.stringify(hasilRumus))
const sembunyi = buildNumberedTree([{ id: 1, parent_id: null, depth: 0, urutan: 0, judul: 'X', locked: 0 }], new Map([[1, [blokT(1, [[sel('A'), sel('kata', { h: true })], [sel('b'), sel('c')]])]]]))
ok('C12 sel tertutup gabungan dilewati', cariDiDokumen({ tree: sembunyi, kataPengantarHtml: '' }, { kata: 'kata' }).length === 0)
const nomorPohon = buildNumberedTree([{ id: 1, parent_id: null, depth: 0, urutan: 0, judul: 'X', locked: 0 }], new Map([[1, [blokT(1, [[sel('No'), sel('N')], [sel('7'), sel('a')]], { kolomNomor: 0 })]]]))
ok('C13 kolom No. otomatis bertanda', !!cariDiDokumen({ tree: nomorPohon, kataPengantarHtml: '' }, { kata: '7' })[0]?.alasan)
ok('C13b kepala kolom No. tetap bisa diganti', cariDiDokumen({ tree: nomorPohon, kataPengantarHtml: '' }, { kata: 'No' })[0]?.alasan === null)
ok('C14 narasi: urutan ke berjalan lintas paragraf', (() => { const t = cariDiDokumen({ tree: [], kataPengantarHtml: '<p>a a</p><p>a</p>' }, { kata: 'a' }); return t.map(x => x.ke).join() === '0,1,2' })())

// ─── D. Mengganti ─────────────────────────────────────────────────────────────
console.log('\nD. Mengganti di dokumen')
const gs = gantiDiDokumen(data(), { kata: 'sakit' }, 'wisma')
const blokDi = (h: typeof gs, id: number) => h.blok.find(b => b.id === id)?.payload as Record<string, unknown> | undefined
ok('D1 jumlah & yang ditahan', gs.jumlah === 9 && gs.ditahan === 2, `${gs.jumlah}/${gs.ditahan}`)
ok('D2 pengantar kena', gs.pengantar === '<p>wisma di pengantar</p>')
ok('D3 judul bab yang boleh saja', gs.judulBab.length === 1 && gs.judulBab[0].id === 2 && gs.judulBab[0].judul === 'Latar wisma')
ok('D4 narasi kena, kunci lain tetap', blokDi(gs, 11)?.html === '<p>rumah wisma <strong>jiwa</strong></p>' && blokDi(gs, 11)?.continueList === true)
const t21 = blokDi(gs, 21)!
const rows21 = t21.rows as { v: string; fmt?: string }[][]
ok('D5 tabel: judul & sel kena', t21.judul === 'Tabel wisma' && rows21[1][0].v === 'Poli wisma')
ok('D6 kepala tabel berubah: nama kolom ikut (grafik memilih seri lewat nama itu)', (t21.kolom as string[])[0] === 'Unit wisma', JSON.stringify(t21.kolom))
ok('D7 tabel tertaut: judul saja boleh, selnya tidak; blok tak berubah kalau hanya sel', blokDi(gs, 22) === undefined)
ok('D8 gambar & grafik: judul + keterangan', blokDi(gs, 23)?.judul === 'Gambar wisma' && blokDi(gs, 23)?.caption === 'wisma juga' && blokDi(gs, 24)?.judul === 'Grafik wisma')
ok('D9 kunci payload lain tak hilang', blokDi(gs, 23)?.fileId === 'f' && blokDi(gs, 24)?.chartType === 'bar')
ok('D10 hasil lolos skema simpan', gs.blok.every(b => { try { const tipe = flattenTree(buatPohon()).flatMap(n => n.blocks).find(x => x.id === b.id)!.tipe; parseBlockPayload(tipe, b.payload); return true } catch { return false } }))
const satu = gantiDiDokumen({ tree: [], kataPengantarHtml: '<p>a a a</p>' }, { kata: 'a' }, 'b', { tempat: { jenis: 'pengantar' }, ke: 1 })
ok('D11 satu kecocokan saja', satu.pengantar === '<p>a b a</p>' && satu.jumlah === 1, String(satu.pengantar))
const satuSel = gantiDiDokumen(data(), { kata: 'sakit' }, 'X', { tempat: { jenis: 'sel', blockId: 21, r: 1, c: 0 }, ke: 0 })
ok('D12 sasaran sel: hanya sel itu, judul tabel tetap', satuSel.jumlah === 1 && blokDi(satuSel, 21)?.judul === 'Tabel sakit' && (blokDi(satuSel, 21)!.rows as { v: string }[][])[1][0].v === 'Poli X' && (blokDi(satuSel, 21)!.rows as { v: string }[][])[0][0].v === 'Unit sakit' && satuSel.pengantar === null && !satuSel.judulBab.length)
const satuBidang = gantiDiDokumen(data(), { kata: 'sakit' }, 'X', { tempat: { jenis: 'bidang', blockId: 23, bidang: 'caption' }, ke: 0 })
const pohonDua = buildNumberedTree([{ id: 1, parent_id: null, depth: 0, urutan: 0, judul: 'a a', locked: 0 }], new Map([[1, [blokT(1, [[sel('K')], [sel('b b')]], { judul: 'b b' })]]]))
const dataDua = { tree: pohonDua, kataPengantarHtml: '' }
ok('D12b kecocokan ke-n di judul bab', gantiDiDokumen({ tree: pohonDua, kataPengantarHtml: '' }, { kata: 'a' }, 'X', { tempat: { jenis: 'judul-bab', sectionId: 1 }, ke: 1 }).judulBab[0]?.judul === 'a X')
ok('D12c kecocokan ke-n di judul tabel', blokDi(gantiDiDokumen(dataDua, { kata: 'b' }, 'X', { tempat: { jenis: 'bidang', blockId: 1, bidang: 'judul' }, ke: 1 }), 1)?.judul === 'b X')
ok('D12d kecocokan ke-n di sel', (blokDi(gantiDiDokumen(dataDua, { kata: 'b' }, 'X', { tempat: { jenis: 'sel', blockId: 1, r: 1, c: 0 }, ke: 1 }), 1)!.rows as { v: string }[][])[1][0].v === 'b X')
ok('D13 sasaran keterangan: judulnya tetap', blokDi(satuBidang, 23)?.caption === 'X juga' && blokDi(satuBidang, 23)?.judul === 'Gambar sakit')
const satuJudul = gantiDiDokumen(data(), { kata: 'sakit' }, 'X', { tempat: { jenis: 'judul-bab', sectionId: 1 }, ke: 0 })
ok('D14 sasaran judul BAB terkunci: ditahan, tidak ditulis', satuJudul.judulBab.length === 0 && satuJudul.ditahan === 1 && satuJudul.jumlah === 0)
const fmtRows = gantiDiDokumen(data(), { kata: '1250000' }, '99', { tempat: { jenis: 'sel', blockId: 21, r: 1, c: 1 }, ke: 0 })
ok('D15 sel berformat ditulis lewat aturan ketikan', (blokDi(fmtRows, 21)!.rows as { v: string }[][])[1][1].v === '99', JSON.stringify(blokDi(fmtRows, 21)?.rows))
const pohonNf = buildNumberedTree([{ id: 1, parent_id: null, depth: 0, urutan: 0, judul: 'X', locked: 0 }], new Map([[1, [blokT(1, [[sel('K')], [sel('100', { nf: 'num' })]])]]]))
const hasilNf = gantiDiDokumen({ tree: pohonNf, kataPengantarHtml: '' }, { kata: '100' }, '1.250.000')
ok('D15b sel berformat angka: ketikan gaya Indonesia jadi angka mesin', (blokDi(hasilNf, 1)!.rows as { v: string }[][])[1][0].v === '1250000', JSON.stringify(blokDi(hasilNf, 1)?.rows))
const teksRumus = gantiDiDokumen(data(), { kata: 'SUM' }, 'X')
ok('D15c teks rumus tidak pernah diganti', teksRumus.jumlah === 0 && !teksRumus.blok.length)
const rumusTahan = gantiDiDokumen({ tree: tabelRumus, kataPengantarHtml: '' }, { kata: '2' }, '9')
ok('D16 hasil rumus ditahan', rumusTahan.jumlah === 0 && rumusTahan.ditahan === 1 && !rumusTahan.blok.length)
const nomorTahan = gantiDiDokumen({ tree: nomorPohon, kataPengantarHtml: '' }, { kata: '7' }, '9')
ok('D17 kolom No. ditahan', nomorTahan.jumlah === 0 && nomorTahan.ditahan === 1)
let panjang = false
try { gantiDiDokumen({ tree: [], kataPengantarHtml: `<p>${'a '.repeat(30)}</p>` }, { kata: 'a' }, 'x'.repeat(BATAS_HTML_NARASI)) } catch (e) { panjang = e instanceof GantiTerlaluPanjangError }
ok('D18 hasil melewati batas blok: ditolak, bukan terpotong diam-diam', panjang)
let judulKosong = false
try { gantiDiDokumen(data(), { kata: 'Latar sakit' }, '') } catch (e) { judulKosong = e instanceof GantiTerlaluPanjangError }
ok('D19 judul bab tak boleh jadi kosong', judulKosong)
const tanpaSeluruh = gantiDiDokumen({ tree: [], kataPengantarHtml: '<p>kin kinerja</p>' }, { kata: 'kin', seluruhKata: true }, 'X')
ok('D20 opsi seluruh kata berlaku saat mengganti', tanpaSeluruh.pengantar === '<p>X kinerja</p>')
const tanpaHuruf = gantiDiDokumen({ tree: [], kataPengantarHtml: '<p>Kin kin</p>' }, { kata: 'kin', hurufBesar: true }, 'X')
ok('D21 opsi huruf berlaku saat mengganti', tanpaHuruf.pengantar === '<p>Kin X</p>')
const sama = data()
const sidikSebelum = JSON.stringify(sama.tree)
gantiDiDokumen(sama, { kata: 'sakit' }, 'X')
ok('D22 tidak mengubah data masukannya', JSON.stringify(sama.tree) === sidikSebelum)
ok('D23 jumlah tombol = yang benar-benar diganti', cariDiDokumen(data(), { kata: 'sakit' }).filter(t => !t.alasan).length === gs.jumlah, `${cariDiDokumen(data(), { kata: 'sakit' }).filter(t => !t.alasan).length} vs ${gs.jumlah}`)
ok('D24 tiap temuan bisa-ganti benar-benar mengganti satu, urut ke-n', cariDiDokumen(data(), { kata: 'sakit' }).filter(t => !t.alasan).every(t => gantiDiDokumen(data(), { kata: 'sakit' }, 'X', { tempat: t.tempat, ke: t.ke }).jumlah === 1))

// ─── E. Pemisah halaman: perintah ─────────────────────────────────────────────
console.log('\nE. Perintah pemisah halaman')
const schema = getSchema([StarterKit.configure({ link: false, trailingNode: false, horizontalRule: false }), GayaDaftar, SpasiParagraf, TabNarasi, PemisahHalaman])
type JS = Record<string, unknown>
const P = (t = ''): JS => ({ type: 'paragraph', ...(t ? { content: [{ type: 'text', text: t }] } : {}) })
const LI = (...isi: JS[]): JS => ({ type: 'listItem', content: isi })
const dok = (...isi: JS[]) => schema.nodeFromJSON({ type: 'doc', content: isi })
const posTeks = (d: PMNode, t: string) => { let h = -1; d.descendants((n, p) => { if (h < 0 && n.isText && n.text!.includes(t)) h = p + n.text!.indexOf(t) }); if (h < 0) throw new Error(`teks ${t}?`); return h }
const di = (d: PMNode, t: string, geser = 0) => EditorState.create({ doc: d, selection: TextSelection.create(d, posTeks(d, t) + geser) })
const jalan = (s: EditorState, p: Perintah) => { let hasil = s; const r = p(s, tr => { hasil = hasil.apply(tr) }); return { s: hasil, r } }
const bentuk = (n: PMNode): string => {
  if (n.isText) return n.text!
  if (n.type.name === 'pemisahHalaman') return '<HR>'
  const a: string[] = []
  n.forEach(c => a.push(bentuk(c)))
  const nama: Record<string, string> = { paragraph: 'p', orderedList: 'ol', listItem: 'li', doc: 'doc' }
  return `${nama[n.type.name] ?? n.type.name}(${a.join('')})`
}
const d1 = jalan(di(dok(P('satu dua')), 'dua'), sisipPemisahHalaman)
ok('E1 tengah kalimat: paragraf terbelah, sisanya di halaman baru', bentuk(d1.s.doc) === 'doc(p(satu )<HR>p(dua))', bentuk(d1.s.doc))
ok('E2 kursor di awal halaman baru', d1.s.selection.$from.parent.textContent === 'dua' && d1.s.selection.$from.parentOffset === 0)
const d2 = jalan(di(dok(P('satu')), 'satu', 4), sisipPemisahHalaman)
ok('E3 akhir paragraf terakhir: paragraf kosong baru untuk mengetik', bentuk(d2.s.doc) === 'doc(p(satu)<HR>p())' && d2.s.selection.$from.parent.content.size === 0, bentuk(d2.s.doc))
const d3 = jalan(di(dok(P('satu'), P('dua')), 'satu', 4), sisipPemisahHalaman)
ok('E4 akhir paragraf: tidak menambah paragraf kosong', bentuk(d3.s.doc) === 'doc(p(satu)<HR>p(dua))' && d3.s.selection.$from.parent.textContent === 'dua', bentuk(d3.s.doc))
const d4 = jalan(di(dok(P('satu')), 'satu'), sisipPemisahHalaman)
ok('E5 awal paragraf: pemisah di depannya', bentuk(d4.s.doc) === 'doc(<HR>p(satu))' && d4.s.selection.$from.parent.textContent === 'satu', bentuk(d4.s.doc))
const dPilih = dok(P('hapus ini saja'))
const d5 = jalan(EditorState.create({ doc: dPilih, selection: TextSelection.create(dPilih, posTeks(dPilih, 'ini'), posTeks(dPilih, 'ini') + 4) }), sisipPemisahHalaman)
ok('E6 ada pilihan: pilihan terganti', bentuk(d5.s.doc) === 'doc(p(hapus )<HR>p(saja))', bentuk(d5.s.doc))
const dLi = dok({ type: 'orderedList', content: [LI(P('a b'))] })
const d6 = jalan(di(dLi, 'b'), sisipPemisahHalaman)
ok('E7 di dalam butir: sisa kalimat jadi paragraf kedua butir di halaman baru', d6.r && bentuk(d6.s.doc) === 'doc(ol(li(p(a )<HR>p(b))))', bentuk(d6.s.doc))
const d7 = jalan(di(dLi, 'a'), sisipPemisahHalaman)
ok('E8 awal butir: tak bisa (butir wajib diawali paragraf), ditolak tanpa merusak', d7.r === false && bentuk(d7.s.doc) === bentuk(dLi), bentuk(d7.s.doc))
ok('E9 satu transaksi', (() => { let n = 0; sisipPemisahHalaman(di(dok(P('x y')), 'y'), () => { n++ }); return n === 1 })())
const tanpaSkema = getSchema([StarterKit.configure({ link: false, trailingNode: false })])
ok('E10 skema tanpa simpulnya: ditolak', sisipPemisahHalaman(EditorState.create({ doc: tanpaSkema.nodeFromJSON({ type: 'doc', content: [{ type: 'paragraph' }] }) })) === false)

// ─── F. Penyaring & Word ──────────────────────────────────────────────────────
console.log('\nF. Penyaring & berkas Word')
const sn = sanitizeNarasiHtml
ok('F1 pemisah bertahan, dibentuk ulang', sn('<hr data-halaman="x" onclick="a" class="b">') === '<hr data-halaman="1">', sn('<hr data-halaman="x" onclick="a" class="b">'))
ok('F2 garis biasa tetap dibuang', sn('<p>a</p><hr><p>b</p>') === '<p>a</p><p>b</p>')
ok('F3 atribut mirip tidak dikira pemisah', sn('<hr x-data-halaman="1">') === '')
const nx = (h: string) => narasiToXml(h, 'Arial', 24, 720)
const PISAH = '<w:p><w:r><w:br w:type="page"/></w:r></w:p>'
ok('F4 narasi: jadi pemisah halaman Word di antara paragraf', (() => { const x = nx('<p>a</p><hr data-halaman="1"><p>b</p>'); return x.includes(PISAH) && x.indexOf('>a<') < x.indexOf(PISAH) && x.indexOf(PISAH) < x.indexOf('>b<') })())
ok('F5 di dalam butir: butirnya tetap bernomor, paragraf sesudahnya tanpa nomor', (() => { const x = nx('<ol><li><p>a</p><hr data-halaman="1"><p>b</p></li></ol>'); const a = x.indexOf('>a<'); const hr = x.indexOf(PISAH); const b = x.indexOf('>b<'); return a < hr && hr < b && x.slice(0, a).includes('<w:numPr>') && !x.slice(hr, b).includes('<w:numPr>') })())
ok('F5b butir tanpa <p>: teksnya tetap bernomor sebelum pemisah', (() => { const x = nx('<ol><li>a<hr data-halaman="1"></li></ol>'); return x.indexOf('<w:numPr>') > -1 && x.indexOf('<w:numPr>') < x.indexOf('>a<') && x.indexOf('>a<') < x.indexOf(PISAH) })())
ok('F6 pemisah saja di blok', nx('<hr data-halaman="1">') === PISAH, nx('<hr data-halaman="1">'))
ok('F7 tanpa pemisah: narasi tak berubah', !nx('<p>a</p>').includes('w:br'))
const pohonF = buildNumberedTree([{ id: 1, parent_id: null, depth: 0, urutan: 0, judul: 'Bab', locked: 0 }], new Map([[1, [blokN(1, '<p>a</p><hr data-halaman="1"><p>b</p>')]]]))
const { buffer } = await rakitDocx({ tree: pohonF, judul: 'Uji', tahun: 2099, canonical_id: 'LKJIP-UJI', style_config: DEFAULT_STYLE })
ok('F8 masuk ke berkas utuh', new PizZip(buffer).file('word/document.xml')!.asText().includes(PISAH))
ok('F9 hitungan nomor editor tak terganggu: bukan teks', !/hr/.test(kode('lib/lkjip/lanjut-daftar.ts')))

// ─── G. Tempel ────────────────────────────────────────────────────────────────
console.log('\nG. Tempel pemisah dari Word')
const klip = readFileSync('scripts/fixtures/lkjip-papan-klip/word-pisah.html', 'utf8')
const tp = tempelDariWord(klip).replace(/\s+/g, ' ')
ok('G1 berkas asli: dua pemisah, paragraf kosong sisanya ikut hilang', tp.split('<hr data-halaman="1">').length === 3 && !/<o:p>&nbsp;/.test(tp), tp)
ok('G2 urutan isi tetap', tp.indexOf('Sebelum') < tp.indexOf('<hr') && tp.indexOf('<hr') < tp.indexOf('Sesudah') && tp.lastIndexOf('<hr') < tp.indexOf('akhir kalimat'), tp)
ok('G3 lolos penyaring', sn(tempelDariWord(klip)).split('<hr data-halaman="1">').length === 3)
const dlm = tempelDariWord(`<!--StartFragment--><p style='mso-list:l0 level1 lfo1'><![if !supportLists]><span style='mso-list:Ignore'>1.</span><![endif]>A</p><br clear=all style='page-break-before:always'><p style='mso-list:l0 level1 lfo1'><![if !supportLists]><span style='mso-list:Ignore'>2.</span><![endif]>B</p><!--EndFragment-->`)
ok('G4 di antara butir: nomor berikutnya tetap lanjut', dlm === '<ol><li><p>A</p></li></ol><hr data-halaman="1"><ol start="2"><li><p>B</p></li></ol>', dlm)
ok('G5 br biasa tidak jadi pemisah', tempelDariWord('<p>a<br>b</p>') === '<p>a<br>b</p>')

// ─── H. MySQL ─────────────────────────────────────────────────────────────────
console.log('\nH. MySQL kotak pasir 2099')
const JUDUL_UJI = 'SUITE-OTOMATIS test-lkjip-cari-ganti'
const buatDok = async () => {
  await sql`DELETE FROM lkjip_dokumen WHERE tahun = 2099 AND judul = ${JUDUL_UJI}`
  const r = await sql`INSERT INTO lkjip_dokumen (canonical_id, tahun, judul, style_config) VALUES (${`U${Date.now()}`}, 2099, ${JUDUL_UJI}, ${JSON.stringify({ ...DEFAULT_STYLE, kataPengantarHtml: '<p>sakit di pengantar</p>' })})` as unknown as { insertId: number }[]
  const id = Number(r[0].insertId)
  const s1 = await sql`INSERT INTO lkjip_section (dokumen_id, parent_id, depth, urutan, judul, locked) VALUES (${id}, NULL, 0, 0, 'BAB sakit', 1)` as unknown as { insertId: number }[]
  const s2 = await sql`INSERT INTO lkjip_section (dokumen_id, parent_id, depth, urutan, judul, locked) VALUES (${id}, ${s1[0].insertId}, 1, 0, 'Sub sakit', 0)` as unknown as { insertId: number }[]
  const b1 = await sql`INSERT INTO lkjip_block (section_id, urutan, tipe, payload) VALUES (${s2[0].insertId}, 0, 'NARASI', ${JSON.stringify({ html: '<p>rumah sakit</p><p>sakit lagi</p>', continueList: true })})` as unknown as { insertId: number }[]
  const b2 = await sql`INSERT INTO lkjip_block (section_id, urutan, tipe, payload) VALUES (${s2[0].insertId}, 1, 'GAMBAR', ${JSON.stringify({ judul: 'sakit', fileId: '', caption: '' })})` as unknown as { insertId: number }[]
  return { id, s1: Number(s1[0].insertId), s2: Number(s2[0].insertId), b1: Number(b1[0].insertId), b2: Number(b2[0].insertId) }
}
const ambil = async (id: number) => {
  const d = await getDokumenDetail(id)
  const blok = flattenTree(d!.tree).flatMap(n => n.blocks)
  return { d: d!, html: (blok.find(b => b.tipe === 'NARASI')!.payload as { html: string; continueList?: boolean }), gambar: blok.find(b => b.tipe === 'GAMBAR')!.payload as { judul: string }, judul: flattenTree(d!.tree).map(n => n.judul) }
}
try {
  const u = await buatDok()
  const verAwal = (await ambil(u.id)).d.version
  const hasil = await gantiTeksDokumen(u.id, { kata: 'sakit' }, 'wisma', undefined, 1)
  const a = await ambil(u.id)
  ok('H1 semua tempat tertulis dalam satu kali jalan', hasil.jumlah === 5 && hasil.ditahan === 1 && a.html.html === '<p>rumah wisma</p><p>wisma lagi</p>' && a.gambar.judul === 'wisma' && a.d.style_config.kataPengantarHtml === '<p>wisma di pengantar</p>', JSON.stringify(hasil))
  ok('H2 judul BAB terkunci tetap, sub-bab berganti', a.judul[0] === 'BAB sakit' && a.judul[1] === 'Sub wisma', JSON.stringify(a.judul))
  ok('H3 kunci lain payload bertahan', a.html.continueList === true)
  ok('H4 versi dokumen naik (tab lain tidak menulis balik pengaturan lama)', a.d.version === verAwal + 1)
  const nol = await gantiTeksDokumen(u.id, { kata: 'tidakada' }, 'x', undefined, 1)
  ok('H5 tidak ada yang cocok: tidak menulis, versi tetap', nol.jumlah === 0 && (await ambil(u.id)).d.version === verAwal + 1)
  const satuH = await gantiTeksDokumen(u.id, { kata: 'wisma' }, 'graha', { tempat: { jenis: 'narasi', blockId: u.b1 }, ke: 1 }, 1)
  const b = await ambil(u.id)
  ok('H6 satu kecocokan saja', satuH.jumlah === 1 && b.html.html === '<p>rumah wisma</p><p>graha lagi</p>' && b.gambar.judul === 'wisma', JSON.stringify(b.html))
  await sql`UPDATE lkjip_block SET payload = ${JSON.stringify({ judul: 'x'.repeat(190), fileId: '', caption: '' })} WHERE id = ${u.b2}`
  let batal = false
  try { await gantiTeksDokumen(u.id, { kata: 'x' }, 'y'.repeat(50), undefined, 1) } catch { batal = true }
  const c = await ambil(u.id)
  ok('H7 satu blok tak lolos skema: seluruhnya batal', batal && c.gambar.judul === 'x'.repeat(190), String(batal))
  await sql`UPDATE lkjip_dokumen SET status = 'FINAL' WHERE id = ${u.id}`
  let tolak = false
  try { await gantiTeksDokumen(u.id, { kata: 'wisma' }, 'y', undefined, 1) } catch (e) { tolak = e instanceof LkjipFinalError }
  ok('H8 dokumen FINAL ditolak', tolak)
  await sql`DELETE FROM lkjip_dokumen WHERE id = ${u.id}`
  ok('H9 data uji bersih', !(await queryOne(sql`SELECT id FROM lkjip_dokumen WHERE id = ${u.id}`)))
} catch (e) {
  ok('H DB tersedia', false, e instanceof Error ? e.message : String(e))
}

// ─── I. Sambungan layar ───────────────────────────────────────────────────────
console.log('\nI. Sambungan layar')
const tt = kode('app/(dashboard)/lkjip/[id]/TiptapNarasi.tsx')
const ed = kode('app/(dashboard)/lkjip/[id]/editor-client.tsx')
const ex = kode('lib/lkjip/ekstensi-narasi.ts')
const pn = kode('app/(dashboard)/lkjip/[id]/CariGantiPanel.tsx')
const rt = kode('app/api/lkjip/[id]/ganti/route.ts')
ok('I1 garis bawaan Tiptap dimatikan: "---" tak lagi melahirkan garis yang hilang saat Simpan', tt.includes('horizontalRule: false'))
ok('I2 pemisah terpasang + Ctrl+Enter', tt.includes('PemisahHalaman') && /'Mod-Enter': \(\) => \{[\s\S]*?sisipPemisahHalaman\(state, view\.dispatch\)/.test(ex))
ok('I3 tombol & menu pemisah memberi kabar bila ditolak', tt.includes("label: 'Pemisah halaman'") && tt.includes("'Pemisah halaman (Ctrl+Enter)'") && /sisipPemisah[^\n]*toast|toast[^\n]*Letakkan kursor/.test(tt))
ok('I4 panel Cari & Ganti di dock, Ctrl+H', ed.includes("label: 'Cari & Ganti'") && /kunci === 'h'/.test(ed))
ok('I5 Ctrl+F hanya menangkap dari narasi (tabel punya sendiri, sisanya pencarian peramban)', ed.includes(".closest?.('.ProseMirror')"))
ok('I6 tabel yang sudah menangani Ctrl+F tidak direbut', ed.includes('e.defaultPrevented'))
ok('I7 blok belum disimpan: Ganti ditolak, bukan menimpa ketikan', /kotorRef\.current\.size/.test(ed) && ed.includes('Simpan dulu'))
ok('I7b sudah disimpan: tidak lagi dianggap belum tersimpan (tabel melapor ubah, tak pernah melapor bersih)', /if \(ok\) \{ kotorRef\.current\.delete\(id\);/.test(ed) && ed.includes('onUbah={() => laporKotor(true)}'))
ok('I7c gambar & grafik ikut melapor', (ed.match(/onKotor=\{laporKotor\}/g) ?? []).length === 3)
ok('I7d sorotan tidak terbawa ke dokumen lain', ed.includes('useEffect(() => () => aturSorotCari(null), []);'))
ok('I8 sesudah ganti editor dimuat ulang: isinya dipegang state lokal', ed.includes('key={`${b.id}:${generasi}`}') && /setGenerasi\(g => g \+ 1\)/.test(ed))
ok('I9 Ganti semua dikonfirmasi & menyebut jalan pulangnya', /Ganti semua[\s\S]{0,400}Riwayat/.test(ed))
ok('I10 penyorot narasi memakai aturan yang sama', tt.includes('const pola = o ? polaCariTeks(o) : null;') && tt.includes('Decoration.inline'))
ok('I11 route: pagar, batas, audit, foto sebelum ganti semua', rt.includes('await guard()') && rt.includes('lkjipRateLimit') && rt.includes("eventType: 'LKJIP_GANTI_TEKS'") && /saveVersi\(/.test(rt) && /!parsed\.data\.sasaran/.test(rt))
ok('I12 Zod di route', rt.includes('GantiTeksSchema.safeParse'))
ok('I13 jenis audit tergolong retensi', kode('lib/security/retensi-audit.ts').includes('LKJIP_GANTI_TEKS: P') && kode('lib/security/auditlog.ts').includes("'LKJIP_GANTI_TEKS'"))
ok('I14 data: kunci dokumen & blok, semua dalam satu transaksi, lewat skema simpan', /export async function gantiTeksDokumen[\s\S]*?withTransaction[\s\S]*?kunciDokumenDraft\(tx, id\)[\s\S]*?FOR UPDATE[\s\S]*?parseBlockPayload/.test(kode('lib/lkjip/data.ts')))
ok('I15 panel: penanda tanpa title bawaan, tombol Ganti mati untuk temuan yang tak bisa', !/title=/.test(pn) && pn.includes('!!temuan[indeks].alasan'))
ok('I16 panel hanya-baca di dokumen FINAL', /\{!readOnly && \(\s*<label className="lk-cg-label">Ganti dengan/.test(pn) && /\{!readOnly && \(\s*<div className="lk-cg-tombol">/.test(pn))

await (async () => { try { const { pool } = await import('../lib/data/db') as unknown as { pool?: { end: () => Promise<void> } }; await pool?.end() } catch { /* tutup koneksi uji */ } })()
console.log(gagal.length ? `\nGAGAL — ${lulus} lulus, ${gagal.length} gagal` : `\n${lulus} lulus, 0 gagal`)
process.exit(gagal.length ? 1 : 0)
