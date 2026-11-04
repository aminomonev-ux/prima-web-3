#!/usr/bin/env npx tsx
// scripts/test-kinerja-penurunan-layar.mts — layar yang menyimpan ke route yang bisa menjawab
// 409 PENURUNAN_DRASTIS (pagar L87) wajib menerjemahkannya lewat konfirmasiPenurunan() lalu
// mengulang dengan force. `message` galat itu teks untuk pemanggil API ("Pakai force=true",
// persen bertitik); layar yang menampilkannya membuat orang buntu — tidak ada tombol memaksa.
// Pemanggilnya DICARI di app/components/lib, bukan didaftar, supaya layar baru ikut tertangkap;
// dibaca lewat parser TypeScript dan dinilai per FUNGSI simpan, bukan per berkas.
// Jalankan: npx tsx scripts/test-kinerja-penurunan-layar.mts
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

let lulus = 0
const gagal: string[] = []
function ok(nama: string, syarat: unknown, ket = '') {
  if (syarat) { lulus++; console.log(`  ok  ${nama}`) } else { gagal.push(nama); console.log(`FAIL  ${nama}${ket ? ' — ' + ket : ''}`) }
}

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const LEWATI = new Set(['node_modules', '.next', '.claude', '_archive'])

function jelajah(dir: string, cocok: (nama: string) => boolean, out: string[] = []): string[] {
  let isi: string[]
  try { isi = readdirSync(dir) } catch { return out }
  for (const n of isi) {
    if (LEWATI.has(n)) continue
    const p = join(dir, n)
    if (statSync(p).isDirectory()) jelajah(p, cocok, out)
    else if (cocok(n)) out.push(p)
  }
  return out
}

/** Route yang memulangkan PENURUNAN_DRASTIS → path endpoint-nya (`/api/kinerja/ssk`). */
function endpointBerpagar(): string[] {
  return jelajah(join(ROOT, 'app', 'api'), n => n === 'route.ts')
    .filter(f => readFileSync(f, 'utf8').includes("code: 'PENURUNAN_DRASTIS'"))
    .map(f => '/' + relative(join(ROOT, 'app'), dirname(f)).split(sep).join('/'))
    .sort()
}

interface Simpan { endpoint: string; fungsi: string; baris: number }

function awalUrl(n: ts.Expression | undefined): string | null {
  if (!n) return null
  if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) return n.text
  if (ts.isTemplateExpression(n)) return n.head.text
  return null
}

/** Metode permintaan dari argumen opsi; tanpa `method` = GET, metode dari variabel = dianggap menulis. */
function metode(opsi: ts.Expression | undefined): string {
  if (!opsi || !ts.isObjectLiteralExpression(opsi)) return 'GET'
  const p = opsi.properties.find(x => ts.isPropertyAssignment(x) && x.name.getText() === 'method') as ts.PropertyAssignment | undefined
  if (!p) return 'GET'
  const v = awalUrl(p.initializer)
  return v === null ? '?' : v.toUpperCase()
}

function namaFungsi(f: ts.SignatureDeclaration): string | null {
  if ((ts.isFunctionDeclaration(f) || ts.isMethodDeclaration(f)) && f.name) return f.name.getText()
  if ((ts.isArrowFunction(f) || ts.isFunctionExpression(f)) && ts.isVariableDeclaration(f.parent)) return f.parent.name.getText()
  return null
}

function adaDi(n: ts.Node, cari: (x: ts.Node) => boolean): boolean {
  if (cari(n)) return true
  return ts.forEachChild(n, c => (adaDi(c, cari) ? true : undefined)) ?? false
}

const panggil = (nama: string) => (x: ts.Node) =>
  ts.isCallExpression(x) && ts.isIdentifier(x.expression) && x.expression.text === nama

const berForceTrue = (a: ts.Expression) => ts.isObjectLiteralExpression(a) && a.properties.some(p =>
  ts.isPropertyAssignment(p) && p.name.getText() === 'force' && p.initializer.kind === ts.SyntaxKind.TrueKeyword)

/** Ulang dengan force: fungsi itu sendiri `fungsi(true, …)`, atau panggilan apa pun yang membawa `{ force: true }`. */
const ulangDenganForce = (fungsi: string) => (x: ts.Node) => ts.isCallExpression(x)
  && ((panggil(fungsi)(x) && x.arguments[0]?.kind === ts.SyntaxKind.TrueKeyword) || x.arguments.some(berForceTrue))

/** Cabang `=== 'PENURUNAN_DRASTIS'` yang benar: bertanya, mengulang dgn force, tanpa `message` server. */
function cabangBenar(badan: ts.Node, fungsi: string): boolean {
  let benar = false
  const telusur = (n: ts.Node) => {
    if (ts.isIfStatement(n) && adaDi(n.expression, x => ts.isStringLiteral(x) && x.text === 'PENURUNAN_DRASTIS')) {
      const isi = n.thenStatement
      const bertanya = adaDi(isi, panggil('konfirmasiPenurunan'))
      const ulangPaksa = adaDi(isi, ulangDenganForce(fungsi))
      const pesanServer = adaDi(isi, x => ts.isPropertyAccessExpression(x) && x.name.text === 'message')
      if (bertanya && ulangPaksa && !pesanServer) benar = true
    }
    ts.forEachChild(n, telusur)
  }
  telusur(badan)
  return benar
}

export function periksaSumber(teks: string, nama: string, endpoints: string[]): { simpan: Simpan[]; masalah: string[] } {
  const sf = ts.createSourceFile(nama, teks, ts.ScriptTarget.Latest, true, nama.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const simpan: Simpan[] = []
  const masalah: string[] = []
  const endpointDari = (url: string) => endpoints.find(e => url === e || url.startsWith(e + '?'))
  // Alamat lewat konstanta di berkas yang sama: `const URL_SSK = '/api/kinerja/ssk'`.
  const konstanta = new Map<string, string>()
  const kumpul = (n: ts.Node) => {
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer && (n.parent.flags & ts.NodeFlags.Const)
      && (ts.isStringLiteral(n.initializer) || ts.isNoSubstitutionTemplateLiteral(n.initializer))) konstanta.set(n.name.text, n.initializer.text)
    ts.forEachChild(n, kumpul)
  }
  kumpul(sf)
  const urlDari = (a: ts.Expression | undefined): { teks: string; dinamis: boolean } | null => {
    if (a && ts.isIdentifier(a)) { const v = konstanta.get(a.text); return v === undefined ? null : { teks: v, dinamis: false } }
    const teks = awalUrl(a)
    return teks === null ? null : { teks, dinamis: !!a && ts.isTemplateExpression(a) }
  }
  const telusur = (n: ts.Node) => {
    if (ts.isCallExpression(n)) {
      const url = urlDari(n.arguments[0])
      const endpoint = url === null ? undefined : endpointDari(url.teks)
      const tulis = metode(n.arguments[1]) !== 'GET'
      // `/api/kinerja/${x}` bisa menunjuk route berpagar, tapi tidak bisa dinilai — tolak, bukan lewati diam-diam.
      if (url && tulis && !endpoint && url.dinamis && url.teks.startsWith('/api/') && endpoints.some(e => e.startsWith(url.teks))) {
        const baris = sf.getLineAndCharacterOfPosition(n.getStart()).line + 1
        masalah.push(`${nama}:${baris} menyimpan ke alamat dinamis \`${url.teks}…\` yang bisa menunjuk route berpagar — tulis alamatnya langsung supaya bisa dinilai`)
      }
      if (endpoint && tulis) {
        const baris = sf.getLineAndCharacterOfPosition(n.getStart()).line + 1
        let f: ts.Node = n.parent
        while (f && !(ts.isFunctionLike(f) && 'body' in f && f.body)) f = f.parent
        const fungsi = f ? namaFungsi(f as ts.SignatureDeclaration) : null
        simpan.push({ endpoint, fungsi: fungsi ?? '(tanpa nama)', baris })
        if (!fungsi) masalah.push(`${nama}:${baris} menyimpan ke ${endpoint} dari fungsi tanpa nama — tidak bisa mengulang dengan force`)
        else if (!cabangBenar((f as ts.FunctionLikeDeclaration).body!, fungsi)) {
          masalah.push(`${nama}:${baris} ${fungsi}() menyimpan ke ${endpoint} tanpa cabang PENURUNAN_DRASTIS yang memanggil konfirmasiPenurunan() lalu ${fungsi}(true, …) — dan tanpa menampilkan message server`)
        }
      }
    }
    ts.forEachChild(n, telusur)
  }
  telusur(sf)
  return { simpan, masalah }
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('A. Penjaga mengenali bentuk yang benar & yang salah')
const EP = ['/api/kinerja/realisasi', '/api/kinerja/realisasi/nomen']
const layar = (cabang: string, url = "'/api/kinerja/realisasi'", opsi = "{ method: 'PUT', body: '' }") => `
async function simpan(force = false) {
  const d = await fetchJson(${url}, ${opsi});
  if (d.ok) toast.success('ok');
  ${cabang}
  else toast.error(d.message || 'Gagal');
}`
const BENAR = "else if (d.code === 'PENURUNAN_DRASTIS') { const ok = await konfirmasiPenurunan('x', d); if (ok) { await simpan(true); return; } }"
const a1 = periksaSumber(layar(BENAR), 'a.tsx', EP)
ok('A1 cabang lengkap (tanya → ulang force) → lulus', a1.simpan.length === 1 && a1.masalah.length === 0, JSON.stringify(a1))
ok('A2 tanpa cabang → ditolak (galat server tampil apa adanya)', periksaSumber(layar(''), 'a.tsx', EP).masalah.length === 1)
ok('A3 cabang yang menampilkan d.message → ditolak',
  periksaSumber(layar("else if (d.code === 'PENURUNAN_DRASTIS') { toast.error(d.message); const ok = await konfirmasiPenurunan('x', d); if (ok) await simpan(true); }"), 'a.tsx', EP).masalah.length === 1)
ok('A4 bertanya tapi tidak mengulang dengan force → ditolak',
  periksaSumber(layar("else if (d.code === 'PENURUNAN_DRASTIS') { const ok = await konfirmasiPenurunan('x', d); if (ok) await simpan(); }"), 'a.tsx', EP).masalah.length === 1)
ok('A5 tanpa konfirmasiPenurunan (dialog karangan sendiri) → ditolak',
  periksaSumber(layar("else if (d.code === 'PENURUNAN_DRASTIS') { if (await confirmDialog({ title: 'x' })) await simpan(true); }"), 'a.tsx', EP).masalah.length === 1)
ok('A6 GET (tanpa method) bukan simpan', periksaSumber(layar('', "`/api/kinerja/realisasi?tahun=${t}`", '{}'), 'a.tsx', EP).simpan.length === 0)
ok('A7 URL bertemplat + kueri tetap dikenali', periksaSumber(layar('', "`/api/kinerja/realisasi?tahun=${t}`"), 'a.tsx', EP).simpan.length === 1)
ok('A8 endpoint lain berawalan sama (/realisasi/tutup) tidak dihitung; /realisasi/nomen dihitung sendiri',
  periksaSumber(layar('', "'/api/kinerja/realisasi/tutup'"), 'a.tsx', EP).simpan.length === 0
  && periksaSumber(layar('', "'/api/kinerja/realisasi/nomen'"), 'a.tsx', EP).simpan[0]?.endpoint === '/api/kinerja/realisasi/nomen')
ok('A9 metode dari variabel dianggap menulis', periksaSumber(layar('', undefined, '{ method: m }'), 'a.tsx', EP).simpan.length === 1)
const a10 = periksaSumber(`const simpanCepat = async () => { await fetch('/api/kinerja/realisasi', { method: 'PUT' }) }`, 'b.ts', EP)
ok('A10 fungsi panah bernama ikut diperiksa', a10.simpan[0]?.fungsi === 'simpanCepat' && a10.masalah.length === 1, JSON.stringify(a10))
ok('A11 panggilan dari fungsi tanpa nama → ditolak (tidak bisa mengulang)',
  periksaSumber(`onClick(async () => { await fetch('/api/kinerja/realisasi', { method: 'PUT' }) })`, 'c.tsx', EP).masalah.length === 1)
const a12 = periksaSumber(`const URL_REAL = '/api/kinerja/realisasi'\n${layar('', 'URL_REAL')}`, 'd.tsx', EP)
ok('A12 alamat lewat konstanta di berkas yang sama ikut dinilai', a12.simpan.length === 1 && a12.masalah.length === 1, JSON.stringify(a12))
const a13 = periksaSumber(layar(BENAR, '`/api/kinerja/${jalur}`'), 'e.tsx', EP)
ok('A13 alamat dinamis yang bisa menunjuk route berpagar → ditolak dengan pesan, bukan dilewati', a13.masalah.length === 1 && a13.masalah[0].includes('alamat dinamis'), JSON.stringify(a13))
ok('A14 alamat dinamis di luar route berpagar tidak dipersoalkan', periksaSumber(layar('', '`/api/blud/${x}`'), 'e.tsx', EP).masalah.length === 0)
ok('A15 ulang dgn force lewat fungsi lain `simpanPaksa({ force: true })` diterima',
  periksaSumber(layar("else if (d.code === 'PENURUNAN_DRASTIS') { if (await konfirmasiPenurunan('x', d)) await simpanPaksa({ force: true }); }"), 'a.tsx', EP).masalah.length === 0)
ok('A16 ulang sebaris `fetchJson(…, { body: JSON.stringify({ …, force: true }) })` diterima; `force: false` tidak',
  periksaSumber(layar("else if (d.code === 'PENURUNAN_DRASTIS') { if (await konfirmasiPenurunan('x', d)) await fetchJson('/api/kinerja/realisasi', { method: 'PUT', body: JSON.stringify({ rows, force: true }) }); }"), 'a.tsx', EP).masalah.length === 0
  && periksaSumber(layar("else if (d.code === 'PENURUNAN_DRASTIS') { if (await konfirmasiPenurunan('x', d)) await simpanPaksa({ force: false }); }"), 'a.tsx', EP).masalah.length === 1)

// ─────────────────────────────────────────────────────────────────────────────
console.log('B. Route yang memasang pagar')
const endpoints = endpointBerpagar()
const DIKENAL = ['/api/kinerja/pendapatan', '/api/kinerja/realisasi', '/api/kinerja/realisasi/nomen', '/api/kinerja/rekening', '/api/kinerja/ssk']
ok('B1 kelima route berpagar ditemukan sendiri (penjaga tidak buta)', DIKENAL.every(e => endpoints.includes(e)), endpoints.join(', '))

// ─────────────────────────────────────────────────────────────────────────────
console.log('C. Seluruh layar')
const berkas = ['app', 'components', 'lib'].flatMap(d => jelajah(join(ROOT, d), n => /\.tsx?$/.test(n) && !n.endsWith('.d.ts')))
const semua = berkas.map(f => ({ f: relative(ROOT, f).split(sep).join('/'), ...periksaSumber(readFileSync(f, 'utf8'), f, endpoints) }))
const ditemukan = semua.flatMap(s => s.simpan.map(x => `${s.f}:${x.fungsi}`))
const HARUS = [
  'app/(dashboard)/kinerja/_tabs/SskTab.tsx:saveSsk', 'app/(dashboard)/kinerja/_tabs/RekeningTab.tsx:saveRekening',
  'app/(dashboard)/kinerja/_tabs/RealisasiTab.tsx:saveRealisasi', 'app/(dashboard)/kinerja/_tabs/PendapatanCrrTab.tsx:saveCrr',
  'app/(dashboard)/kinerja/_tabs/PendapatanCrrTab.tsx:savePendapatan',
]
ok('C1 kelima tombol simpan E-Anggaran ditemukan sendiri', HARUS.every(h => ditemukan.includes(h)), ditemukan.join(', '))
const masalah = semua.flatMap(s => s.masalah.map(m => m.replace(join(ROOT, ''), '')))
ok('C2 tiap simpan menerjemahkan PENURUNAN_DRASTIS lewat konfirmasiPenurunan + force', masalah.length === 0, '\n      ' + masalah.join('\n      '))

// ─────────────────────────────────────────────────────────────────────────────
console.log('D. Kalimat dialog dari angka, bukan dari teks server')
const kd = readFileSync(join(ROOT, 'lib/kinerja/konfirmasi-simpan.ts'), 'utf8')
const jawaban = kd.slice(kd.indexOf('export interface JawabanPagar'), kd.indexOf('}', kd.indexOf('export interface JawabanPagar')))
ok('D1 JawabanPagar hanya membawa angka (existing/incoming), tanpa message', jawaban.includes('existing') && jawaban.includes('incoming') && !jawaban.includes('message'))
ok('D2 konfirmasiPenurunan tidak membaca d.message', !kd.includes('d.message'))

console.log(`\n${lulus} lulus, ${gagal.length} gagal${gagal.length ? ': ' + gagal.join(', ') : ''}`)
process.exit(gagal.length ? 1 : 0)
