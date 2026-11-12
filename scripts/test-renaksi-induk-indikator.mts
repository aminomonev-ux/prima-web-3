// scripts/test-renaksi-induk-indikator.mts — uji jalur tulis kolom `induk_indikator_id`.
// Konsep: docs/CONCEPT-renaksi-pilih-indikator.md (§6, §8, §12 Tahap 3–4).
// Jalankan: npx tsx --env-file=.env.local scripts/test-renaksi-induk-indikator.mts
//
// Yang dijaga di sini adalah hal-hal yang TIDAK terlihat di layar:
//   • tautan benar-benar tersimpan, dan edit tanpa kolomnya tidak mengosongkannya;
//   • tautan silang (beda tahun / beda tingkat / bukan induk baris ini) ditolak, bukan ditelan;
//   • hapus induk yang masih ditunjuk ditolak — penjaga lama berbasis NAMA meloloskannya;
//   • impor mode 'ganti' melepas tautan anak, tidak meninggalkan id yang sudah tidak ada.

import { sql, queryOne } from '../lib/data/db';
import {
  upsertRencanaAksi, getRencanaAksiById, deleteRencanaAksi,
  RaIndukIndikatorError, RaTautanAnakError,
} from '../lib/data/rencana-aksi';
import { commitImportRenaksi, type CommitRow } from '../lib/renaksi/import-data';

const T1 = 2099, T2 = 2098;

let lulus = 0;
const gagal: string[] = [];
const ok = (n: string, s: boolean, k = '') => {
  if (s) { lulus++; console.log(`  ok  ${n}`); } else { gagal.push(n); console.log(`FAIL  ${n}${k ? ' — ' + k : ''}`); }
};
const tangkap = async (fn: () => Promise<unknown>) => {
  try { await fn(); return null; } catch (e) { return e; }
};

const bersih = async () => {
  for (const t of [T1, T2]) {
    await sql`DELETE FROM rencana_aksi WHERE tahun = ${t}`;
    await sql`DELETE FROM renaksi_ganti_nama WHERE tahun = ${t}`;
    await sql`DELETE FROM system_settings WHERE \`key\` = ${`ra_lock_${t}`}`;
    await sql`DELETE FROM blud_locks WHERE entity = 'RA_DUPLIKASI' AND key_id = ${String(t)}`;
  }
};

await bersih();
const user = await queryOne<{ id: number }>(sql`SELECT id FROM users LIMIT 1`);
if (!user) { console.log('tidak ada user — uji dilewati'); process.exit(1); }
const uid = Number(user.id);

const dasar = {
  tahun: T1, jenis: 'Akumulatif' as const, satuan: '%',
  target_rpjmd: 100, target_tahunan: 100,
  q1_target: 25, q2_target: 25, q3_target: 25, q4_target: 25,
};

// Rantai: tujuan → sasaran (dibutuhkan impor 'ganti' untuk mengenali induk) → 2 program.
await upsertRencanaAksi({ ...dasar, level: 'tujuan', program: 'TUJ UJI', indikator: 'IND TUJ' }, uid);
await upsertRencanaAksi({ ...dasar, level: 'sasaran', program: 'SAS UJI', tujuan: 'TUJ UJI', indikator: 'IND SAS' }, uid);
const p1 = await upsertRencanaAksi({ ...dasar, level: 'program', program: 'PROG UJI', sasaran: 'SAS UJI', indikator: 'IND P1' }, uid);
const p2 = await upsertRencanaAksi({ ...dasar, level: 'program', program: 'PROG UJI', sasaran: 'SAS UJI', indikator: 'IND P2' }, uid);

console.log('\nA. Simpan & pertahankan tautan');
const keg = await upsertRencanaAksi({
  ...dasar, level: 'kegiatan', program: 'PROG UJI', kegiatan: 'KEG UJI',
  indikator: 'IND K1', induk_indikator_id: p1,
}, uid);
let baris = await getRencanaAksiById(keg);
ok('A1 tautan tersimpan saat baris baru dibuat', baris?.induk_indikator_id === p1, String(baris?.induk_indikator_id));

// Edit tanpa mengirim kolomnya — pola impor & PATCH lain. Tautan tidak boleh hilang.
await upsertRencanaAksi({
  ...dasar, id: keg, expected_version: baris!.version, level: 'kegiatan',
  program: 'PROG UJI', kegiatan: 'KEG UJI', indikator: 'IND K1',
}, uid);
baris = await getRencanaAksiById(keg);
ok('A2 edit tanpa kolom tautan tidak mengosongkannya', baris?.induk_indikator_id === p1, String(baris?.induk_indikator_id));

// Baris lama (tautan NULL) tetap sah & tetap bisa disunting.
const barisLama = await upsertRencanaAksi({
  ...dasar, level: 'kegiatan', program: 'PROG UJI', kegiatan: 'KEG LAMA',
  indikator: 'IND K-LAMA',
}, uid);
ok('A3 baris tanpa tautan tetap tersimpan (keadaan data lama)',
  (await getRencanaAksiById(barisLama))?.induk_indikator_id === null);

console.log('\nB. Tautan silang ditolak');
let e = await tangkap(() => upsertRencanaAksi({
  ...dasar, level: 'kegiatan', program: 'PROG UJI', kegiatan: 'KEG UJI',
  indikator: 'IND K-SALAH-TINGKAT', induk_indikator_id: keg,
}, uid));
ok('B1 induk dari tingkat yang salah ditolak', e instanceof RaIndukIndikatorError, (e as Error)?.name);
ok('B2 baris yang ditolak tidak ikut tersimpan',
  (await queryOne<{ n: number }>(sql`SELECT COUNT(*) AS n FROM rencana_aksi WHERE tahun = ${T1} AND indikator = 'IND K-SALAH-TINGKAT'`))?.n === 0);

// Indikator LAIN dari program YANG SAMA itu sah: satu program punya beberapa indikator, dan
// kegiatan mana pun di bawahnya boleh menjabarkan salah satunya.
const kegSaudara = await upsertRencanaAksi({
  ...dasar, level: 'kegiatan', program: 'PROG UJI', kegiatan: 'KEG SAUDARA',
  indikator: 'IND K-SAUDARA', induk_indikator_id: p2,
}, uid);
ok('B3 indikator lain dari program yang SAMA diterima',
  (await getRencanaAksiById(kegSaudara))?.induk_indikator_id === p2);

// Yang harus ditolak: indikator milik program LAIN — induk baris ini bukan program itu.
const pLain = await upsertRencanaAksi({
  ...dasar, level: 'program', program: 'PROG LAIN', sasaran: 'SAS UJI', indikator: 'IND X1',
}, uid);
e = await tangkap(() => upsertRencanaAksi({
  ...dasar, level: 'kegiatan', program: 'PROG UJI', kegiatan: 'KEG UJI',
  indikator: 'IND K-SILANG', induk_indikator_id: pLain,
}, uid));
ok('B3b indikator program LAIN ditolak', e instanceof RaIndukIndikatorError, (e as Error)?.name);

const pTahunLain = await upsertRencanaAksi({
  ...dasar, tahun: T2, level: 'program', program: 'PROG UJI', sasaran: 'SAS UJI', indikator: 'IND P1',
}, uid);
e = await tangkap(() => upsertRencanaAksi({
  ...dasar, level: 'kegiatan', program: 'PROG UJI', kegiatan: 'KEG UJI',
  indikator: 'IND K-TAHUN', induk_indikator_id: pTahunLain,
}, uid));
ok('B4 indikator dari tahun lain ditolak', e instanceof RaIndukIndikatorError);

console.log('\nC. Pagar hapus');
const p1Row = await getRencanaAksiById(p1);
e = await tangkap(() => deleteRencanaAksi(p1Row!));
ok('C1 hapus indikator induk yang masih ditunjuk ditolak', e instanceof RaTautanAnakError, (e as Error)?.name);
ok('C2 pesannya menyebut jumlah baris yang menunjuk', /masih ada 1 baris/.test((e as Error)?.message ?? ''), (e as Error)?.message);
ok('C2b hanya baris yang benar-benar menunjuk p1 yang dihitung',
  /masih ada 1 baris/.test((e as Error)?.message ?? '') && kegSaudara > 0);
ok('C3 barisnya tidak jadi terhapus', (await getRencanaAksiById(p1)) !== null);

console.log('\nD. Impor mode ganti tidak meninggalkan tautan hantu');
const barisProgram = (indikator: string): CommitRow => ({
  level: 'program', kode: null, nama: 'PROG UJI',
  induk_tujuan: null, induk_sasaran: 'SAS UJI', induk_program: null, induk_kegiatan: null,
  outcome: null, indikator, satuan: '%', jenis: 'Akumulatif',
  target_tahunan: 10, q: [1, 1, 1, 1], bulan: null, anggaran: null,
});
const hasil = await commitImportRenaksi(T1, 'ganti', [barisProgram('IND P1'), barisProgram('IND P2')], uid);
ok('D1 impor ganti menulis ulang level program', hasil.disimpan === 2 && hasil.ditahan.length === 0, JSON.stringify(hasil.ditahan));
const sisaTautan = await queryOne<{ n: number }>(sql`
  SELECT COUNT(*) AS n FROM rencana_aksi WHERE tahun = ${T1} AND induk_indikator_id IS NOT NULL
`);
ok('D2 tautan anak ke baris yang dihapus dilepas jadi NULL', sisaTautan?.n === 0, String(sisaTautan?.n));
const indukBaru = await queryOne<{ id: number }>(sql`
  SELECT id FROM rencana_aksi WHERE tahun = ${T1} AND level = 'program' AND indikator = 'IND P3-YATIM'
`);
ok('D3 kontrol: tidak ada baris yatim yang tersisa', indukBaru === null);

await bersih();
const bersihLagi = await queryOne<{ n: number }>(sql`SELECT COUNT(*) AS n FROM rencana_aksi WHERE tahun IN (${T1}, ${T2})`);
ok('E1 tahun kotak pasir bersih kembali', bersihLagi?.n === 0, String(bersihLagi?.n));

console.log(`\n${gagal.length === 0 ? '✅ LULUS' : '❌ GAGAL'} — ${lulus} lulus, ${gagal.length} gagal`);
if (gagal.length) { console.log('Gagal:', gagal.join(', ')); process.exit(1); }
process.exit(0);
