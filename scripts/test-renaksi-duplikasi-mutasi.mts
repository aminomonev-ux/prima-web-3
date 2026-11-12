// scripts/test-renaksi-duplikasi-mutasi.mts — uji MUTASI langkah relink duplikasi (konsep §14 butir 8b).
// Jalankan: npx tsx --env-file=.env.local scripts/test-renaksi-duplikasi-mutasi.mts
//
// Uji biasa membuktikan salinan tahun baru tertaut ke baris tahun baru. Uji ini membuktikan SEBAB-nya:
// langkah relink dijadikan no-op (persis "menyalin induk_indikator_id mentah"), lalu diperiksa bahwa
// pemeriksaan yang sama memang GAGAL pada mutan. Kalau mutan tetap lolos, pemeriksaan itu tidak
// menjaga apa pun.

import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { sql, queryOne } from '../lib/data/db';
import { upsertRencanaAksi, duplicateYear } from '../lib/data/rencana-aksi';

const T1 = 2099, T2 = 2098, T3 = 2096;

let lulus = 0;
const gagal: string[] = [];
const ok = (n: string, s: boolean, k = '') => {
  if (s) { lulus++; console.log(`  ok  ${n}`); } else { gagal.push(n); console.log(`FAIL  ${n}${k ? ' — ' + k : ''}`); }
};

const bersih = async () => {
  for (const t of [T1, T2, T3]) {
    await sql`DELETE FROM rencana_aksi WHERE tahun = ${t}`;
    await sql`DELETE FROM renaksi_ganti_nama WHERE tahun = ${t}`;
    await sql`DELETE FROM blud_locks WHERE entity = 'RA_DUPLIKASI' AND key_id = ${String(t)}`;
  }
};

const baris = (tahun: number, indikator: string) => queryOne<{ id: number }>(
  sql`SELECT id FROM rencana_aksi WHERE tahun = ${tahun} AND indikator = ${indikator}`,
);
const tautan = (tahun: number, indikator: string) => queryOne<{ induk_indikator_id: number | null }>(
  sql`SELECT induk_indikator_id FROM rencana_aksi WHERE tahun = ${tahun} AND indikator = ${indikator}`,
);

const SUMBER = join(process.cwd(), 'lib', 'data', 'rencana-aksi.ts');
const SALINAN = join(process.cwd(), 'lib', 'data', 'rencana-aksi.mutasi.tmp.ts');
const RELINK = 'SET anak.induk_indikator_id = induk_baru.id';
const RELINK_NOOP = 'SET anak.induk_indikator_id = anak.induk_indikator_id';

console.log('\nM. Uji mutasi langkah relink duplikasi');

const asli = readFileSync(SUMBER, 'utf8');
ok('M1 langkah relink ditemukan di sumber', asli.includes(RELINK));

await bersih();
const user = await queryOne<{ id: number }>(sql`SELECT id FROM users LIMIT 1`);
if (!user) { console.log('tidak ada user — uji dilewati'); process.exit(1); }
const uid = Number(user.id);

const dasar = {
  tahun: T1, jenis: 'Akumulatif' as const, satuan: '%',
  target_rpjmd: 100, target_tahunan: 100,
  q1_target: 25, q2_target: 25, q3_target: 25, q4_target: 25,
};
await upsertRencanaAksi({ ...dasar, level: 'tujuan', program: 'TUJ MUT', indikator: 'IND TUJ' }, uid);
const tuj = await baris(T1, 'IND TUJ');
await upsertRencanaAksi({
  ...dasar, level: 'sasaran', program: 'SAS MUT', tujuan: 'TUJ MUT',
  indikator: 'IND SAS', induk_indikator_id: tuj!.id,
}, uid);

// Pemeriksaan yang sama dipakai untuk modul asli dan mutan — itulah titik ujinya.
const tautanBenar = async (tahun: number) => {
  const sas = await baris(tahun, 'IND SAS');
  const tujTahun = await baris(tahun, 'IND TUJ');
  const link = (await tautan(tahun, 'IND SAS'))?.induk_indikator_id ?? null;
  return !!sas && !!tujTahun && link === tujTahun.id;
};

const hasilAsli = await duplicateYear(T1, T2, uid);
ok('M2 modul asli menyalin baris', Number(hasilAsli.inserted) === 2, String(hasilAsli.inserted));
ok('M3 modul asli: salinan tertaut ke induk tahun baru', await tautanBenar(T2));

const mutan = asli.replace(RELINK, RELINK_NOOP);
ok('M4 salinan mutan benar-benar berubah (bukan no-op)', mutan !== asli && mutan.includes(RELINK_NOOP));

try {
  writeFileSync(SALINAN, mutan);
  const mod = await import(pathToFileURL(SALINAN).href + '?mutasi=' + Date.now()) as {
    duplicateYear: typeof duplicateYear;
  };
  const hasilMutan = await mod.duplicateYear(T1, T3, uid);
  ok('M5 mutan tetap menyalin barisnya (yang diuji hanya tautannya)',
    Number(hasilMutan.inserted) === 2, String(hasilMutan.inserted));
  ok('M6 tanpa relink, pemeriksaan yang sama GAGAL (bukti langkah itu bekerja)',
    !(await tautanBenar(T3)), String((await tautan(T3, 'IND SAS'))?.induk_indikator_id));
} finally {
  try { unlinkSync(SALINAN); } catch { /* sudah bersih */ }
}

await bersih();
const sisa = await queryOne<{ n: number }>(sql`SELECT COUNT(*) AS n FROM rencana_aksi WHERE tahun IN (${T1}, ${T2}, ${T3})`);
ok('C1 tahun kotak pasir bersih kembali', Number(sisa?.n) === 0, String(sisa?.n));

console.log(`\n${gagal.length === 0 ? '✅ LULUS' : '❌ GAGAL'} — ${lulus} lulus, ${gagal.length} gagal`);
if (gagal.length) { console.log('Gagal:', gagal.join(', ')); process.exit(1); }
process.exit(0);
