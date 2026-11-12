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
import { rencanaGantiNamaImpor, type BarisBerindikator } from '../lib/renaksi/ganti-nama';
import type { RaLevel } from '../lib/data/rencana-aksi-schemas';

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

console.log('\nF. Pindah induk melepas tautan yang basi');
const idProgram = async (indikator: string) => Number((await queryOne<{ id: number }>(sql`
  SELECT id FROM rencana_aksi WHERE tahun = ${T1} AND level = 'program' AND indikator = ${indikator}`))?.id);
const q1 = await idProgram('IND P1');
const q2 = await idProgram('IND P2');
const pb = await upsertRencanaAksi({ ...dasar, level: 'program', program: 'PROG BARU', sasaran: 'SAS UJI', indikator: 'IND PB1' }, uid);
const kp1 = await upsertRencanaAksi({ ...dasar, level: 'kegiatan', program: 'PROG UJI', kegiatan: 'KEG PINDAH', indikator: 'IND KP1', induk_indikator_id: q1 }, uid);
const kp2 = await upsertRencanaAksi({ ...dasar, level: 'kegiatan', program: 'PROG UJI', kegiatan: 'KEG PINDAH', indikator: 'IND KP2', induk_indikator_id: q2 }, uid);
const sp1 = await upsertRencanaAksi({ ...dasar, level: 'sub-kegiatan', program: 'PROG UJI', kegiatan: 'KEG PINDAH', sub_kegiatan: 'SUB IKUT', indikator: 'IND SP1', induk_indikator_id: kp1 }, uid);

// Pindah program TANPA memilih indikator program baru (Edit baris lama tidak dipaksa).
await upsertRencanaAksi({
  ...dasar, id: kp1, expected_version: (await getRencanaAksiById(kp1))!.version,
  level: 'kegiatan', program: 'PROG BARU', kegiatan: 'KEG PINDAH', indikator: 'IND KP1',
}, uid);
ok('F1 baris yang dipindah tanpa pilihan baru: tautan lama dilepas',
  (await getRencanaAksiById(kp1))?.induk_indikator_id === null, String((await getRencanaAksiById(kp1))?.induk_indikator_id));
const kp2Row = await getRencanaAksiById(kp2);
ok('F2 saudara ikut pindah & tautan ke indikator program lama dilepas',
  kp2Row?.program === 'PROG BARU' && kp2Row?.induk_indikator_id === null, `${kp2Row?.program} ${kp2Row?.induk_indikator_id}`);
const sp1Row = await getRencanaAksiById(sp1);
ok('F3 sub-kegiatan tetap tertaut ke baris kegiatannya (id tidak berubah)',
  sp1Row?.induk_indikator_id === kp1 && sp1Row?.program === 'PROG BARU', `${sp1Row?.program} ${sp1Row?.induk_indikator_id}`);
// Kontrol mutasi: Simpan berikutnya dengan indikator program baru diterima.
const errF4 = await tangkap(() => upsertRencanaAksi({
  ...dasar, id: kp2, expected_version: kp2Row!.version,
  level: 'kegiatan', program: 'PROG BARU', kegiatan: 'KEG PINDAH', indikator: 'IND KP2', induk_indikator_id: pb,
}, uid));
ok('F4 tautan ke indikator program baru diterima', errF4 === null && (await getRencanaAksiById(kp2))?.induk_indikator_id === pb, (errF4 as Error)?.message);

// Pindah DENGAN pilihan baru: tautan baru yang menang, bukan NULL.
await upsertRencanaAksi({
  ...dasar, id: kp1, expected_version: (await getRencanaAksiById(kp1))!.version,
  level: 'kegiatan', program: 'PROG UJI', kegiatan: 'KEG PINDAH', indikator: 'IND KP1', induk_indikator_id: q1,
}, uid);
ok('F5 pindah dengan pilihan baru menyimpan pilihan itu', (await getRencanaAksiById(kp1))?.induk_indikator_id === q1);
ok('F6 saudara yang ikut pindah balik dilepas tautannya', (await getRencanaAksiById(kp2))?.induk_indikator_id === null);

// Sub-kegiatan pindah kegiatan: saudaranya melepas tautan ke indikator kegiatan lama.
const kl = await upsertRencanaAksi({ ...dasar, level: 'kegiatan', program: 'PROG UJI', kegiatan: 'KEG TUJUAN', indikator: 'IND KT', induk_indikator_id: q1 }, uid);
const sp2 = await upsertRencanaAksi({ ...dasar, level: 'sub-kegiatan', program: 'PROG UJI', kegiatan: 'KEG PINDAH', sub_kegiatan: 'SUB IKUT', indikator: 'IND SP2', induk_indikator_id: kp1 }, uid);
await upsertRencanaAksi({
  ...dasar, id: sp1, expected_version: (await getRencanaAksiById(sp1))!.version,
  level: 'sub-kegiatan', program: 'PROG UJI', kegiatan: 'KEG TUJUAN', sub_kegiatan: 'SUB IKUT', indikator: 'IND SP1', induk_indikator_id: kl,
}, uid);
const sp2Row = await getRencanaAksiById(sp2);
ok('F7 sub yang dipindah menyimpan indikator kegiatan barunya', (await getRencanaAksiById(sp1))?.induk_indikator_id === kl);
ok('F8 saudara sub ikut pindah & tautannya dilepas', sp2Row?.kegiatan === 'KEG TUJUAN' && sp2Row?.induk_indikator_id === null,
  `${sp2Row?.kegiatan} ${sp2Row?.induk_indikator_id}`);

console.log('\nG. Impor mode perbarui: induk berganti lewat berkas → tautan basi dilepas');
const barisKegiatan = (program: string): CommitRow => ({
  level: 'kegiatan', kode: null, nama: 'KEG TUJUAN',
  induk_tujuan: null, induk_sasaran: null, induk_program: program, induk_kegiatan: null,
  outcome: null, indikator: 'IND KT', satuan: '%', jenis: 'Akumulatif',
  target_tahunan: 10, q: [1, 1, 1, 1], bulan: null, anggaran: null,
});
const g1 = await commitImportRenaksi(T1, 'upsert', [barisKegiatan('PROG UJI')], uid);
ok('G1 impor ulang tanpa pindah: tautan dipertahankan',
  g1.diperbarui === 1 && (await getRencanaAksiById(kl))?.induk_indikator_id === q1, JSON.stringify(g1.ditahan));
const g2 = await commitImportRenaksi(T1, 'upsert', [barisKegiatan('PROG BARU')], uid);
const klRow = await getRencanaAksiById(kl);
ok('G2 impor memindah kegiatan ke program lain: tautan ke indikator program lama dilepas',
  g2.diperbarui === 1 && klRow?.program === 'PROG BARU' && klRow?.induk_indikator_id === null,
  `${klRow?.program} ${klRow?.induk_indikator_id} ${JSON.stringify(g2.ditahan)}`);
ok('G3 impor ulang tanpa perubahan tidak mencatat apa pun', g1.gantiNama.length === 0, JSON.stringify(g1.gantiNama));
const catatan = await queryOne<{ n: number; dari: string; induk: string; induk_baru: string }>(sql`
  SELECT COUNT(*) AS n, MAX(dari) AS dari, MAX(induk) AS induk, MAX(induk_baru) AS induk_baru
  FROM renaksi_ganti_nama WHERE tahun = ${T1} AND level = 'kegiatan' AND dari = 'KEG TUJUAN'`);
ok('G4 pindah induk lewat impor DICATAT untuk E-Anggaran & PK (sama seperti Data Entry)',
  g2.gantiNama.length === 1 && Number(catatan?.n) === 1 && catatan?.induk === 'PROG UJI' && catatan?.induk_baru === 'PROG BARU',
  JSON.stringify({ g: g2.gantiNama, catatan }));

console.log('\nH. Aturan pencatat impor (murni)');
{
  const b = (level: RaLevel, program: string, kegiatan: string | null, indikator: string): BarisBerindikator =>
    ({ level, program, kegiatan, sub_kegiatan: null, tujuan: null, sasaran: null, indikator });
  const lama = [b('kegiatan', 'P1', 'K', 'i1'), b('kegiatan', 'P1', 'K', 'i2')];
  const h1 = rencanaGantiNamaImpor(lama, [b('kegiatan', 'P2', 'K', 'i1'), b('kegiatan', 'P2', 'K', 'I2 ')], false);
  ok('H1 semua indikator entitas pindah ke lokasi yang sama → satu catatan pindah (indikator dibandingkan tanpa huruf besar/spasi)',
    h1.length === 1 && h1[0].indukBaru === 'P2' && h1[0].induk === 'P1', JSON.stringify(h1));
  ok('H2 mode perbarui, satu indikator tertinggal di lokasi lama → entitas terbelah, tidak dicatat',
    rencanaGantiNamaImpor(lama, [b('kegiatan', 'P2', 'K', 'i1')], false).length === 0);
  ok('H3 mode ganti (baris yang tak ada di berkas dihapus) → dicatat',
    rencanaGantiNamaImpor(lama, [b('kegiatan', 'P2', 'K', 'i1')], true).length === 1);
  ok('H4 indikator entitas yang sama menuju dua program berbeda → tidak dicatat (menebak)',
    rencanaGantiNamaImpor(lama, [b('kegiatan', 'P2', 'K', 'i1'), b('kegiatan', 'P3', 'K', 'i2')], false).length === 0);
  const h5 = rencanaGantiNamaImpor(lama, [b('kegiatan', 'P1', 'K BARU', 'i1'), b('kegiatan', 'P1', 'K BARU', 'i2')], false);
  ok('H5 ganti nama lewat impor dicatat sebagai ganti nama (bukan pindah)',
    h5.length === 1 && h5[0].dari === 'K' && h5[0].ke === 'K BARU' && h5[0].indukBaru === null, JSON.stringify(h5));
  ok('H6 satu indikator berubah, satu tetap → tidak dicatat',
    rencanaGantiNamaImpor(lama, [b('kegiatan', 'P2', 'K', 'i1'), b('kegiatan', 'P1', 'K', 'i2')], false).length === 0);
  ok('H7 indikator baru (belum tersimpan) tidak menghasilkan catatan',
    rencanaGantiNamaImpor(lama, [b('kegiatan', 'P9', 'K9', 'baru')], false).length === 0);
}

await bersih();
const bersihLagi = await queryOne<{ n: number }>(sql`SELECT COUNT(*) AS n FROM rencana_aksi WHERE tahun IN (${T1}, ${T2})`);
ok('E1 tahun kotak pasir bersih kembali', bersihLagi?.n === 0, String(bersihLagi?.n));

console.log(`\n${gagal.length === 0 ? '✅ LULUS' : '❌ GAGAL'} — ${lulus} lulus, ${gagal.length} gagal`);
if (gagal.length) { console.log('Gagal:', gagal.join(', ')); process.exit(1); }
process.exit(0);
