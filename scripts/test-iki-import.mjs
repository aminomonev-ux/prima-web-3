// Uji regresi parser import IKI (lib/iki/import-excel.ts) terhadap folder file
// Excel asli — READ-ONLY, tidak menyentuh DB/aplikasi.
// Pakai:  node scripts/test-iki-import.mjs ["D:/path/ke/folder-iki"]
// Default folder = arsip kalibrasi 20 file IKI STRUKTURAL FINAL 2026.
// Exit code 1 kalau ada file gagal parse / struktur TW rusak — aman untuk CI lokal.

import fs from 'node:fs';
import path from 'node:path';
import Module, { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { kompilasiUji } from './_kompilasi-uji.mjs';

const require = createRequire(import.meta.url);
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = process.argv[2] ?? 'D:/KANTOR/IKI 26/PERUBAHAN IKI 26/IKI STRUKTURAL FINAL';

if (!fs.existsSync(root)) {
  console.error(`Folder uji tidak ditemukan: ${root}`);
  console.error('Pakai: node scripts/test-iki-import.mjs "D:/path/ke/folder-iki"');
  process.exit(1);
}

// Compile parser ke cache (di dalam repo supaya require exceljs resolve ke node_modules).
// `kompilasiUji`, bukan `tsc` telanjang: parser kini mengimpor `@/lib/shared/excel-sel`
// (hasil rumus 0, 2026-10-09) — kasus U1 di _kompilasi-uji.mjs.
const outDir = path.join(repo, 'node_modules', '.cache', 'iki-import-test');
kompilasiUji(repo, outDir, ['lib/iki/import-excel.ts']);
const resolveAsli = Module._resolveFilename;
Module._resolveFilename = function (permintaan, ...sisa) {
  if (permintaan.startsWith('@/')) return path.join(outDir, permintaan.slice(2) + '.js');
  return resolveAsli.call(this, permintaan, ...sisa);
};
const { parseIkiExcel } = require(path.join(outDir, 'lib/iki/import-excel.js'));

function* walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (/\.xlsx$/i.test(e.name) && !e.name.startsWith('~$')) yield p;
  }
}

let ok = 0, fail = 0;
const notes = [];
for (const f of walk(root)) {
  const rel = path.relative(root, f);
  try {
    const r = await parseIkiExcel(fs.readFileSync(f));
    const rhks = r.groups.flatMap(g => g.rhkList);
    const tws = rhks.flatMap(x => x.triwulan);
    const problems = [];
    if (r.groups.length === 0) problems.push('0 grup');
    if (rhks.some(x => x.triwulan.length !== 4)) problems.push('RHK dengan TW != 4');
    if (!r.nama) problems.push('nama kosong');
    const taksiFilled = tws.filter(t => t.target_aksi && t.target_aksi !== '0').length;
    const ttwFilled = tws.filter(t => t.target_tw && t.target_tw !== '0').length;
    const fallbackCols = r.columns.filter(c => c.source === 'fallback' && c.col !== null).map(c => c.field);
    if (problems.length) {
      fail++;
      console.log(`FAIL ${rel} — ${problems.join(', ')}`);
    } else {
      ok++;
      console.log(`OK   ${rel} — ${r.varian} | grup:${r.groups.length} rhk:${rhks.length} | targetTW:${ttwFilled}/${tws.length} targetAksi:${taksiFilled}/${tws.length}`);
    }
    if (fallbackCols.length) notes.push(`${rel}: kolom fallback → ${fallbackCols.join(', ')}`);
    if (taksiFilled === 0) notes.push(`${rel}: target_aksi 0 semua — cek kalau file aslinya memang terisi`);
  } catch (e) {
    fail++;
    console.log(`FAIL ${rel}: ${e.message}`);
  }
}

if (notes.length) {
  console.log('\nCatatan:');
  for (const n of notes) console.log(`  • ${n}`);
}
console.log(`\n=== ${ok} OK / ${fail} FAIL`);
process.exit(fail > 0 ? 1 : 0);
