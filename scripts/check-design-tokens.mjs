#!/usr/bin/env node
// ─── PRIMA — Gate E: Token Warna ─────────────────────────────────────────────
//
// Menahan warna BARU masuk ke sistem. Bukan membersihkan yang lama.
//
// Kenapa ratchet, bukan gate ketat: saat dipasang (2026-08-11) repo ini punya
// 240 hex unik di luar DESIGN-SYSTEM.md. Gate ketat akan merah sejak menit
// pertama, dan gate yang selalu merah selalu berakhir dimatikan orang. Jadi:
// yang sudah ada dicatat sebagai baseline dan dibiarkan; yang BARU ditolak.
//
// Ambang sengaja "hex belum pernah terlihat", bukan "hex bertambah di berkas X".
// Memindahkan kode antar berkas tidak boleh memerahkan CI — kalau itu terjadi,
// orang berhenti memercayai gate-nya.
//
// Pakai:
//   node scripts/check-design-tokens.mjs           → periksa (exit 1 kalau ada baru)
//   node scripts/check-design-tokens.mjs --update  → tulis ulang baseline
//   node scripts/check-design-tokens.mjs --list    → daftar hex baseline + jumlahnya

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative, extname } from 'node:path';

const ROOT      = process.cwd();
const DS_PATH   = join(ROOT, 'docs/design/DESIGN-SYSTEM.md');
const BASE_PATH = join(ROOT, 'docs/design/token-baseline.json');

const SCAN_DIRS = ['app', 'components', 'lib'];
const SCAN_EXT  = new Set(['.ts', '.tsx', '.css', '.js', '.jsx', '.mjs']);
const SKIP_DIR  = new Set(['node_modules', '.next', '_archive', 'graphify-out', '.git', 'dist', 'build']);

const HEX = /#[0-9A-Fa-f]{6}\b/g;

// Nilai netral yang tidak membawa makna merek — tidak perlu jadi token.
const NEUTRAL = new Set(['#FFFFFF', '#000000']);

const argv   = process.argv.slice(2);
const UPDATE = argv.includes('--update');
const LIST   = argv.includes('--list');

function fail(msg) { console.error(`✗ ${msg}`); process.exit(2); }

// ─── Kumpulkan token resmi dari DESIGN-SYSTEM.md ────────────────────────────
if (!existsSync(DS_PATH)) fail(`DESIGN-SYSTEM.md tidak ditemukan di ${relative(ROOT, DS_PATH)}`);
const tokens = new Set(
  (readFileSync(DS_PATH, 'utf8').match(HEX) ?? []).map(h => h.toUpperCase()),
);
if (tokens.size === 0) fail('DESIGN-SYSTEM.md tidak memuat satu pun hex — berkasnya rusak?');

// ─── Pindai berkas sumber ───────────────────────────────────────────────────
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

const found = new Map();   // hex → [{file, line}]
for (const dir of SCAN_DIRS) {
  for (const file of walk(join(ROOT, dir))) {
    const lines = readFileSync(file, 'utf8').split('\n');
    lines.forEach((text, i) => {
      for (const raw of text.match(HEX) ?? []) {
        const hex = raw.toUpperCase();
        if (tokens.has(hex) || NEUTRAL.has(hex)) continue;
        if (!found.has(hex)) found.set(hex, []);
        found.get(hex).push({ file: relative(ROOT, file).replace(/\\/g, '/'), line: i + 1 });
      }
    });
  }
}

// ─── Mode --update: tulis ulang baseline ────────────────────────────────────
if (UPDATE) {
  const baseline = {
    _catatan: 'Hex di luar DESIGN-SYSTEM.md yang SUDAH ada saat gate dipasang. Daftar ini hanya boleh MENGECIL. Regenerasi: node scripts/check-design-tokens.mjs --update',
    _dibuat: new Date().toISOString().slice(0, 10),
    _jumlah: found.size,
    hex: [...found.keys()].sort(),
  };
  writeFileSync(BASE_PATH, JSON.stringify(baseline, null, 2) + '\n', 'utf8');
  console.log(`✓ Baseline ditulis: ${found.size} hex → ${relative(ROOT, BASE_PATH)}`);
  process.exit(0);
}

if (!existsSync(BASE_PATH)) {
  fail(`Baseline belum ada. Jalankan dulu: node scripts/check-design-tokens.mjs --update`);
}
const baseline = new Set(JSON.parse(readFileSync(BASE_PATH, 'utf8')).hex ?? []);

// ─── Mode --list ────────────────────────────────────────────────────────────
if (LIST) {
  console.log(`Token resmi (DESIGN-SYSTEM.md) : ${tokens.size}`);
  console.log(`Baseline (warisan, dibiarkan)  : ${baseline.size}`);
  console.log(`Terpakai sekarang di luar token: ${found.size}\n`);
  for (const hex of [...found.keys()].sort()) {
    const n = found.get(hex).length;
    console.log(`  ${baseline.has(hex) ? ' ' : '+'} ${hex}  ${String(n).padStart(3)}× — ${found.get(hex)[0].file}`);
  }
  process.exit(0);
}

// ─── Periksa ────────────────────────────────────────────────────────────────
const baru = [...found.keys()].filter(h => !baseline.has(h)).sort();
const beres = [...baseline].filter(h => !found.has(h)).sort();

if (beres.length) {
  console.log(`✓ ${beres.length} hex warisan sudah hilang dari kode: ${beres.join(', ')}`);
  console.log(`  Rapikan baseline-nya: node scripts/check-design-tokens.mjs --update\n`);
}

if (baru.length === 0) {
  console.log(`✓ Gate E lolos — tidak ada warna baru di luar DESIGN-SYSTEM.md.`);
  console.log(`  token resmi ${tokens.size} · warisan ${baseline.size} · dipindai ${SCAN_DIRS.join(', ')}`);
  process.exit(0);
}

console.error(`\n✗ Gate E GAGAL — ${baru.length} warna baru di luar DESIGN-SYSTEM.md:\n`);
for (const hex of baru) {
  const tempat = found.get(hex);
  console.error(`  ${hex}  (${tempat.length}×)`);
  for (const t of tempat.slice(0, 5)) console.error(`      ${t.file}:${t.line}`);
  if (tempat.length > 5) console.error(`      … dan ${tempat.length - 5} lagi`);
}
console.error(`
Pilih salah satu:
  1. Pakai token yang sudah ada di docs/design/DESIGN-SYSTEM.md (paling sering ini jawabannya)
  2. Kalau memang warna baru yang disengaja: tambahkan ke DESIGN-SYSTEM.md lebih dulu,
     lalu jalankan ulang gate ini
  3. Kalau nilainya teknis (mis. tangga warna turunan untuk override tema, bukan warna
     merek): jalankan  node scripts/check-design-tokens.mjs --update  dan jelaskan
     alasannya di pesan commit
`);
process.exit(1);
