// scripts/test-renaksi-duplikasi-tautan.mts — uji duplikasi tahun MENAUTKAN ULANG (konsep §9, §12 Tahap 5).
// Jalankan: npx tsx --env-file=.env.local scripts/test-renaksi-duplikasi-tautan.mts
//
// Yang dijaga di sini adalah hal yang tidak terlihat di layar: salinan tahun baru harus menunjuk
// salinan induknya DI TAHUN BARU, bukan id tahun asal. Kalau tidak, rantai di tahun baru
// menyeberang tahun dan baru ketahuan saat barisnya disunting.

import { sql, queryOne } from '../lib/data/db';
import { upsertRencanaAksi, duplicateYear } from '../lib/data/rencana-aksi';

const T1 = 2099, T2 = 2098, T3 = 2097;

let lulus = 0;
const gagal: string[] = [];
const ok = (n: string, s: boolean, k = '') => {
  if (s) { lulus++; console.log(`  ok  ${n}`); } else { gagal.push(n); console.log(`FAIL  ${n}${k ? ' — ' + k : ''}`); }
};

const bersih = async () => {
  for (const t of [T1, T2, T3]) {
    await sql`DELETE FROM rencana_aksi WHERE tahun = ${t}`;
    await sql`DELETE FROM renaksi_ganti_nama WHERE tahun = ${t}`;
    await sql`DELETE FROM system_settings WHERE \`key\` = ${`ra_lock_${t}`}`;
    await sql`DELETE FROM blud_locks WHERE entity = 'RA_DUPLIKASI' AND key_id = ${String(t)}`;
  }
};

const baris = (tahun: number, indikator: string) => queryOne<{ id: number }>(
  sql`SELECT id FROM rencana_aksi WHERE tahun = ${tahun} AND indikator = ${indikator}`,
);
const tautan = (tahun: number, indikator: string) => queryOne<{ induk_indikator_id: number | null }>(
  sql`SELECT induk_indikator_id FROM rencana_aksi WHERE tahun = ${tahun} AND indikator = ${indikator}`,
);

await bersih();
const user = await queryOne<{ id: number }>(sql`SELECT id FROM users LIMIT 1`);
if (!user) { console.log('tidak ada user — uji dilewati'); process.exit(1); }
const uid = Number(user.id);

const dasar = {
  tahun: T1, jenis: 'Akumulatif' as const, satuan: '%',
  target_rpjmd: 100, target_tahunan: 100,
  q1_target: 25, q2_target: 25, q3_target: 25, q4_target: 25,
};

// Rantai penuh satu tingkat per level, plus satu baris lama tanpa tautan.
await upsertRencanaAksi({ ...dasar, level: 'tujuan', program: 'TUJ DUP', indikator: 'IND TUJ' }, uid);
const tuj = await baris(T1, 'IND TUJ');
await upsertRencanaAksi({
  ...dasar, level: 'sasaran', program: 'SAS DUP', tujuan: 'TUJ DUP',
  indikator: 'IND SAS', induk_indikator_id: tuj!.id,
}, uid);
const sas = await baris(T1, 'IND SAS');
await upsertRencanaAksi({
  ...dasar, level: 'program', program: 'PROG DUP', sasaran: 'SAS DUP',
  indikator: 'IND PROG', induk_indikator_id: sas!.id,
}, uid);
const prog = await baris(T1, 'IND PROG');
await upsertRencanaAksi({
  ...dasar, level: 'kegiatan', program: 'PROG DUP', kegiatan: 'KEG DUP',
  indikator: 'IND KEG', induk_indikator_id: prog!.id,
}, uid);
const keg = await baris(T1, 'IND KEG');
await upsertRencanaAksi({
  ...dasar, level: 'sub-kegiatan', program: 'PROG DUP', kegiatan: 'KEG DUP', sub_kegiatan: 'SUB DUP',
  indikator: 'IND SUB', induk_indikator_id: keg!.id,
}, uid);
await upsertRencanaAksi({
  ...dasar, level: 'sub-kegiatan', program: 'PROG DUP', kegiatan: 'KEG LAMA', sub_kegiatan: 'SUB LAMA',
  indikator: 'IND SUB-LAMA',
}, uid);

console.log('\nA. Duplikasi menautkan ulang ke tahun baru');
const asal = await queryOne<{ n: number }>(sql`SELECT COUNT(*) AS n FROM rencana_aksi WHERE tahun = ${T1}`);
const hasil = await duplicateYear(T1, T2, uid);
ok('A1 seluruh baris tersalin', Number(hasil.inserted) === Number(asal?.n), `${hasil.inserted} vs ${asal?.n}`);

const tuj2 = await baris(T2, 'IND TUJ');
const sas2 = await baris(T2, 'IND SAS');
const prog2 = await baris(T2, 'IND PROG');
const keg2 = await baris(T2, 'IND KEG');
ok('A2 id tahun baru memang id yang berbeda', !!tuj2 && tuj2.id !== tuj!.id, `${tuj2?.id} vs ${tuj!.id}`);
ok('A3 sasaran menunjuk TUJUAN tahun baru', (await tautan(T2, 'IND SAS'))?.induk_indikator_id === tuj2!.id);
ok('A4 program menunjuk SASARAN tahun baru', (await tautan(T2, 'IND PROG'))?.induk_indikator_id === sas2!.id);
ok('A5 kegiatan menunjuk PROGRAM tahun baru', (await tautan(T2, 'IND KEG'))?.induk_indikator_id === prog2!.id);
ok('A6 sub kegiatan menunjuk KEGIATAN tahun baru', (await tautan(T2, 'IND SUB'))?.induk_indikator_id === keg2!.id);

const lintas = await queryOne<{ n: number }>(sql`
  SELECT COUNT(*) AS n FROM rencana_aksi
  WHERE tahun = ${T2} AND induk_indikator_id IS NOT NULL
    AND induk_indikator_id NOT IN (SELECT id FROM (SELECT id FROM rencana_aksi WHERE tahun = ${T2}) AS s)
`);
ok('A7 tidak ada tautan yang menyeberang tahun', Number(lintas?.n) === 0, String(lintas?.n));
ok('A8 baris lama tanpa tautan tetap tanpa tautan di salinannya',
  (await tautan(T2, 'IND SUB-LAMA'))?.induk_indikator_id === null);

console.log('\nB. Tautan yatim tidak dibawa ke tahun baru');
// Tautan ke induk yang sudah tidak ada sama sekali (data lama sebelum ada pagar hapus): dipasang
// langsung lewat SQL karena jalur tulis sekarang menolaknya. Duplikasi harus melepasnya, bukan
// menyalin id mati itu apa adanya ke tahun baru.
await sql`
  UPDATE rencana_aksi SET induk_indikator_id = 999000001
  WHERE tahun = ${T1} AND indikator = 'IND SUB-LAMA'
`;
const hasil2 = await duplicateYear(T1, T3, uid);
ok('B1 duplikasi kedua tetap jalan', Number(hasil2.inserted) === Number(asal?.n), String(hasil2.inserted));
ok('B2 tautan ke induk yang tidak ada dilepas jadi NULL',
  (await tautan(T3, 'IND SUB-LAMA'))?.induk_indikator_id === null, String((await tautan(T3, 'IND SUB-LAMA'))?.induk_indikator_id));
ok('B3 tautan yang induknya ikut tersalin tetap utuh',
  (await tautan(T3, 'IND SUB'))?.induk_indikator_id !== null);

await bersih();
const sisa = await queryOne<{ n: number }>(sql`SELECT COUNT(*) AS n FROM rencana_aksi WHERE tahun IN (${T1}, ${T2}, ${T3})`);
ok('C1 tahun kotak pasir bersih kembali', Number(sisa?.n) === 0, String(sisa?.n));

console.log(`\n${gagal.length === 0 ? '✅ LULUS' : '❌ GAGAL'} — ${lulus} lulus, ${gagal.length} gagal`);
if (gagal.length) { console.log('Gagal:', gagal.join(', ')); process.exit(1); }
process.exit(0);
