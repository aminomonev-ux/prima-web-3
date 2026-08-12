#!/usr/bin/env node
// Gate F — menahan karakter yang tidak bisa dicetak jsPDF masuk ke teks PDF.
//
// Kenapa ada: font bawaan jsPDF (Helvetica standar) cuma memahami WinAnsi
// (cp1252). Begitu satu karakter di luar daftar itu muncul, jsPDF TIDAK
// melapor — ia diam-diam menulis ulang SELURUH baris dalam pengkodean dua-byte.
// Jadi bukan cuma karakternya yang rusak; seluruh kalimat di baris itu ikut
// jadi sampah. Kejadian nyata: 'Tujuan → Sasaran' tercetak 'Tujuan !' Sasaran'
// di PDF Cetak Renaksi selama berbulan-bulan tanpa ada yang tahu asalnya.
//
// Kenapa gate ketat (bukan ratchet seperti Gate E): setelah perbaikan
// 2026-08-12 pelanggarannya NOL. Baseline hanya perlu kalau gate lahir dengan
// utang; gate ini tidak punya, jadi jangan diberi pintu belakang.
//
// YANG DIPINDAI  : argumen teks harfiah pada `.text(...)` dan sel harfiah di
//                  dalam `head:` / `foot:` autoTable.
// YANG TIDAK     : teks dari database (nama indikator, uraian). Kalau pengguna
//                  mengetik → di nama indikator, PDF-nya tetap rusak dan gate
//                  ini tidak akan melihatnya. Menutup celah itu butuh
//                  penyaringan saat render, bukan pemindaian kode.
//
//   node scripts/check-pdf-glyphs.mjs         → periksa (exit 1 kalau ada)
//   node scripts/check-pdf-glyphs.mjs --list  → daftar berkas PDF yang dipindai
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, extname } from 'node:path';

const ROOT      = process.cwd();
const SCAN_DIRS = ['app', 'components', 'lib'];
const SCAN_EXT  = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs']);
const SKIP_DIR  = new Set(['node_modules', '.next', '_archive', 'graphify-out', '.git', 'dist', 'build']);

// Berkas dianggap penghasil PDF kalau menyentuh jsPDF — langsung atau lewat
// pembungkus dinamis (loadPdf) yang dipakai modul-modul di sini.
const PDF_HINT = /\bjspdf\b|\bjsPDF\b|\bautoTable\b|\bloadPdf\b/;

// WinAnsiEncoding: ASCII + Latin-1 + 27 karakter khas cp1252 di 0x80–0x9F.
const CP1252_SPECIALS = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';
const WINANSI = new Set(['\n', '\r', '\t']);
for (let c = 0x20; c <= 0x7E; c++) WINANSI.add(String.fromCharCode(c));
for (let c = 0xA0; c <= 0xFF; c++) WINANSI.add(String.fromCharCode(c));
for (const ch of CP1252_SPECIALS) WINANSI.add(ch);

const LIST = process.argv.slice(2).includes('--list');

function walk(dir, out = []) {
  let entries;
  try { entries = readdirSync(dir); } catch { return out; }
  for (const name of entries) {
    if (SKIP_DIR.has(name)) continue;
    const p = join(dir, name);
    let st;
    try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) walk(p, out);
    else if (SCAN_EXT.has(extname(name))) out.push(p);
  }
  return out;
}

const rel  = f => relative(ROOT, f).replace(/\\/g, '/');
const lineOf = (src, idx) => src.slice(0, idx).split('\n').length;

// Baca satu literal string mulai dari tanda kutip di posisi `i`. Mengembalikan
// isi + posisi setelah penutupnya, atau null kalau bukan literal.
function readLiteral(src, i) {
  const quote = src[i];
  if (quote !== '\'' && quote !== '"' && quote !== '`') return null;
  let out = '';
  for (let j = i + 1; j < src.length; j++) {
    const ch = src[j];
    if (ch === '\\') { j++; continue; }          // escape — isinya tak relevan
    if (ch === quote) return { text: out, end: j + 1 };
    if (quote !== '`' && ch === '\n') return null; // literal biasa tak lintas baris
    out += ch;
  }
  return null;
}

// `${...}` di template literal itu nilai runtime, bukan teks yang kita kendalikan.
const stripInterpolasi = s => s.replace(/\$\{[^}]*\}/g, '');

const nakal = s => [...new Set([...stripInterpolasi(s)].filter(c => !WINANSI.has(c)))];

function scanTextCalls(src, hits) {
  const re = /\.text\s*\(\s*/g;
  let m;
  while ((m = re.exec(src))) {
    const lit = readLiteral(src, m.index + m[0].length);
    if (!lit) continue;                           // argumen variabel — di luar jangkauan
    const bad = nakal(lit.text);
    if (bad.length) hits.push({ idx: m.index, teks: lit.text, bad, asal: '.text()' });
  }
}

// Sel harfiah di head/foot autoTable — satu-satunya teks tetap lain yang
// tercetak. Body sengaja dilewat: isinya selalu data.
function scanAutoTableHeader(src, hits) {
  const re = /\b(head|foot)\s*:\s*\[/g;
  let m;
  while ((m = re.exec(src))) {
    let depth = 0;
    for (let j = m.index + m[0].length - 1; j < src.length; j++) {
      const ch = src[j];
      if (ch === '[') depth++;
      else if (ch === ']') { if (--depth === 0) break; }
      else if (ch === '\'' || ch === '"' || ch === '`') {
        const lit = readLiteral(src, j);
        if (!lit) continue;
        const bad = nakal(lit.text);
        if (bad.length) hits.push({ idx: j, teks: lit.text, bad, asal: `autoTable ${m[1]}` });
        j = lit.end - 1;
      }
    }
  }
}

const berkasPdf = [];
const temuan = [];

for (const dir of SCAN_DIRS) {
  for (const file of walk(join(ROOT, dir))) {
    const src = readFileSync(file, 'utf8');
    if (!PDF_HINT.test(src)) continue;
    berkasPdf.push(file);
    const hits = [];
    scanTextCalls(src, hits);
    scanAutoTableHeader(src, hits);
    for (const h of hits) temuan.push({ file: rel(file), line: lineOf(src, h.idx), ...h });
  }
}

if (LIST) {
  console.log(`Berkas penghasil PDF yang dipindai: ${berkasPdf.length}`);
  for (const f of berkasPdf) console.log(`  ${rel(f)}`);
  process.exit(0);
}

if (temuan.length === 0) {
  console.log('✓ Gate F lolos — semua teks tetap di PDF aman untuk font bawaan jsPDF.');
  console.log(`  ${berkasPdf.length} berkas penghasil PDF dipindai · WinAnsi (cp1252)`);
  process.exit(0);
}

console.error(`\n✗ Gate F GAGAL — ${temuan.length} teks PDF memakai karakter di luar WinAnsi:\n`);
for (const t of temuan) {
  const daftar = t.bad.map(c => `${c} (U+${c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')})`).join(', ');
  console.error(`  ${t.file}:${t.line}  [${t.asal}]`);
  console.error(`      karakter : ${daftar}`);
  console.error(`      teks     : ${JSON.stringify(t.teks.slice(0, 80))}`);
}
console.error(`
  Ganti dengan padanan WinAnsi. Yang sering dibutuhkan:
      →  jadi  »  (0xBB)      ✓  jadi  v  atau hapus
      ≥  jadi  >=             ≤  jadi  <=
      ✗  jadi  x              emoji: hapus
  Sudah aman tanpa diubah: — – · ° ± × ÷ ½ € « » “ ” ‘ ’ … •

  Kalau memang wajib memakai karakter di luar WinAnsi, jalan satu-satunya adalah
  menyisipkan font Unicode ke PDF (doc.addFileToVFS + addFont). Itu menambah
  ratusan KB ke SETIAP berkas dan semua jalur ekspor harus diuji ulang — jangan
  ditempuh demi satu simbol.
`);
process.exit(1);
