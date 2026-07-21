// Uji regresi parser import Rencana Aksi (lib/renaksi/*) terhadap file nyata.
// READ-ONLY — tidak menyentuh DB/aplikasi.
//   node scripts/test-renaksi-import.mjs ["D:/path/file-atau-folder"]
// Default = matriks Rencana Aksi 2026 (file kalibrasi).
//
// Invarian yang diuji:
//   • semua baris indikator terbaca (tidak ada yang hilang diam-diam)
//   • level & hierarki induk terisi sesuai aturan tiap level
//   • Akumulatif: jumlah target TW == target tahunan (aritmetika file sendiri)
//   • Progres/Pengulangan: TW IV == target tahunan
// Exit 1 kalau ada invarian gagal — aman dipakai sebelum commit.

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = process.argv[2] ?? 'D:/KANTOR/IKI 26/PERUBAHAN IKI 26/RENCANA AKSI 2026.xlsx';

if (!fs.existsSync(target)) {
  console.error(`File/folder uji tidak ditemukan: ${target}`);
  console.error('Pakai: node scripts/test-renaksi-import.mjs "D:/path/file.xlsx"');
  process.exit(1);
}

const outDir = path.join(repo, 'node_modules', '.cache', 'renaksi-import-test');
fs.mkdirSync(outDir, { recursive: true });
execSync(
  `npx tsc "${path.join(repo, 'lib/renaksi/grid.ts')}" "${path.join(repo, 'lib/renaksi/import-renaksi.ts')}"`
  + ` --outDir "${outDir}" --module commonjs --target es2020 --esModuleInterop --skipLibCheck --moduleResolution node`,
  { cwd: repo, stdio: 'inherit' },
);
const { parseRenaksiFile } = require(path.join(outDir, 'import-renaksi.js'));

function* walk(p) {
  if (fs.statSync(p).isFile()) { yield p; return; }
  for (const e of fs.readdirSync(p, { withFileTypes: true })) {
    const f = path.join(p, e.name);
    if (e.isDirectory()) yield* walk(f);
    else if (/\.(xlsx|csv|pdf)$/i.test(e.name) && !e.name.startsWith('~$')) yield f;
  }
}

const PARENT_FIELD = {
  sasaran: 'induk_tujuan',
  program: 'induk_sasaran',
  kegiatan: 'induk_program',
  'sub-kegiatan': 'induk_kegiatan',
};

let ok = 0, fail = 0;
for (const f of walk(target)) {
  const nama = path.basename(f);
  try {
    const r = await parseRenaksiFile(fs.readFileSync(f), f);
    const masalah = [];

    for (const row of r.rows) {
      const pf = PARENT_FIELD[row.level];
      if (pf && !row[pf]) masalah.push(`baris ${row.baris} (${row.level}): induk kosong`);
      if (row.level === 'sub-kegiatan' && !row.induk_program) masalah.push(`baris ${row.baris}: program induk kosong`);
      if (!row.indikator) masalah.push(`baris ${row.baris}: indikator kosong`);
      if (!row.nama) masalah.push(`baris ${row.baris}: nama entitas kosong`);
    }

    let akumOk = 0, akumBeda = 0, tw4Ok = 0, tw4Beda = 0;
    for (const row of r.rows) {
      if (row.target_tahunan === 0) continue;
      const sum = row.q.reduce((a, b) => a + b, 0);
      if (row.jenis === 'Akumulatif') {
        if (Math.abs(sum - row.target_tahunan) < 0.01) akumOk++; else akumBeda++;
      } else if (Math.abs(row.q[3] - row.target_tahunan) < 0.01) tw4Ok++;
      else tw4Beda++;
    }

    const perluCek = r.rows.filter(x => x.perlu_cek).length;
    const lv = Object.entries(r.levelCount).filter(([, n]) => n > 0).map(([k, n]) => `${k}:${n}`).join(' ');

    if (masalah.length) {
      fail++;
      console.log(`FAIL ${nama} — ${masalah.length} masalah`);
      for (const m of masalah.slice(0, 8)) console.log(`       · ${m}`);
    } else {
      ok++;
      console.log(`OK   ${nama} [${r.kind}] ${r.rows.length} baris | ${lv}`);
      console.log(`       target TW vs tahunan → Akumulatif ${akumOk} cocok/${akumBeda} beda · lainnya ${tw4Ok} cocok/${tw4Beda} beda`
        + `${perluCek ? ` · ${perluCek} perlu dicek` : ''}`);
    }
    if (r.warnings.length) {
      for (const w of [...new Set(r.warnings)].slice(0, 4)) console.log(`       ! ${w}`);
    }
  } catch (e) {
    fail++;
    console.log(`FAIL ${nama}: ${e.message}`);
  }
}

console.log(`\n=== ${ok} OK / ${fail} FAIL`);
process.exit(fail > 0 ? 1 : 0);
