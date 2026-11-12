// scripts/test-renaksi-impor-tautan.mts — Excel Renaksi membawa tautan indikator induk, dan impor
// yang memindah/mengganti nama ikut membawa turunannya (docs/CONCEPT-renaksi-tautan-lanjutan.md §2–§3).
// Jalankan: npx tsx --env-file=.env.local scripts/test-renaksi-impor-tautan.mts
// Bagian C memakai MySQL kotak pasir 2074 (dibersihkan otomatis; tanpa --env-file GAGAL).

import { sql, queryOne } from '../lib/data/db';
import { upsertRencanaAksi, getRencanaAksiById } from '../lib/data/rencana-aksi';
import { commitImportRenaksi, dampakTurunanImpor, type CommitRow } from '../lib/renaksi/import-data';
import { parseRenaksiFile } from '../lib/renaksi/import-renaksi';
import { cocokkanIndukImpor, type BarisRantai } from '../lib/renaksi/rantai';
import { turunanTertinggal, type BarisBerindikator } from '../lib/renaksi/ganti-nama';
import { buatWorkbookList } from '../app/(dashboard)/rencana-aksi/_lib/exports';
import type { RaRow } from '../app/(dashboard)/rencana-aksi/_lib/types';

const T = 2074;
let lulus = 0;
const gagal: string[] = [];
const ok = (n: string, s: unknown, k = '') => {
  if (s) { lulus++; console.log(`  ok  ${n}`); } else { gagal.push(n); console.log(`FAIL  ${n}${k ? ' — ' + k : ''}`); }
};

// ── A. Unduhan ↔ pembaca ──────────────────────────────────────────────────────
console.log('A. Unduhan Excel Data Entry membawa kolom "Indikator Induk", pembaca impor mengenalinya');
{
  const ra = (id: number, level: RaRow['level'], program: string, kegiatan: string | null, indikator: string, induk: number | null): RaRow => ({
    id, tahun: T, level, kode: null, sasaran: null, tujuan: null, outcome_program: null, outcome_kegiatan: null, outcome_sub_kegiatan: null,
    program, kegiatan, sub_kegiatan: null, indikator, induk_indikator_id: induk, jenis: 'Akumulatif', satuan: '%',
    target_rpjmd: 100, target_tahunan: 100, q1_target: 25, q2_target: 25, q3_target: 25, q4_target: 25,
    q1_realisasi: null, q2_realisasi: null, q3_realisasi: null, q4_realisasi: null, anggaran_nominal: null,
    bulan_target: null, bulan_realisasi: null, version: 1,
  } as unknown as RaRow);
  const induk = [ra(1, 'program', 'PROG', null, '(1) IND PROG SATU ***', null), ra(2, 'program', 'PROG', null, '(2) IND PROG DUA ***', null)];
  const keg = [ra(3, 'kegiatan', 'PROG', 'KEG A', 'IND KEG A', 2), ra(4, 'kegiatan', 'PROG', 'KEG B', 'IND KEG B', null)];
  const wb = await buatWorkbookList(keg, 'kegiatan', induk);
  const ws = wb.worksheets[0];
  const kepala = (ws.getRow(1).values as unknown[]).map(v => String(v ?? ''));
  ok('A1 kolom "Indikator Induk" tepat sesudah "Indikator"', kepala.indexOf('Indikator Induk') === kepala.indexOf('Indikator') + 1, kepala.join('|'));
  const kol = kepala.indexOf('Indikator Induk');
  ok('A2 isinya teks indikator induk TANPA penanda matriks; kosong bila belum tertaut',
    String(ws.getRow(2).getCell(kol).value) === 'IND PROG DUA' && !ws.getRow(3).getCell(kol).value, String(ws.getRow(2).getCell(kol).value));
  ok('A3 tanpa baris induk / tingkat tujuan → kolomnya tidak ada',
    !((await buatWorkbookList(keg, 'kegiatan')).worksheets[0].getRow(1).values as unknown[]).includes('Indikator Induk'));

  const buf = Buffer.from(await wb.xlsx.writeBuffer());
  const hasil = await parseRenaksiFile(buf, 'rencana-aksi-kegiatan.xlsx');
  const kolInd = hasil.columns.find(c => c.field === 'indikator');
  const kolInduk = hasil.columns.find(c => c.field === 'indikator_induk');
  ok('A4 pembaca: "Indikator" tidak merebut kolom "Indikator Induk" (dan sebaliknya)',
    kolInd?.header === 'Indikator' && kolInduk?.header === 'Indikator Induk', JSON.stringify({ kolInd, kolInduk }));
  {
    // Berkas susunan tangan: "Indikator Induk" di KIRI "Indikator".
    const ExcelJS = (await import('exceljs')).default;
    const w = new ExcelJS.Workbook();
    const s = w.addWorksheet('x');
    s.addRow(['Program', 'Kegiatan', 'Indikator Induk', 'Indikator', 'Target Tahunan', 'Satuan']);
    s.addRow(['PROG', 'KEG A', 'IND PROG DUA', 'IND KEG A', 10, '%']);
    const h = await parseRenaksiFile(Buffer.from(await w.xlsx.writeBuffer()), 'kiri.xlsx');
    ok('A4b kolom "Indikator Induk" di kiri tetap tidak dikira kolom indikator',
      h.rows[0]?.indikator === 'IND KEG A' && h.rows[0]?.indikator_induk === 'IND PROG DUA', JSON.stringify(h.rows.map(r => [r.indikator, r.indikator_induk])));
  }
  const baris = hasil.rows;
  ok('A5 bolak-balik: baris datar terbaca sebagai KEGIATAN (bukan program), induk program dari kolomnya sendiri, indikator & indikator induk utuh',
    baris.length === 2 && baris.every(r => r.level === 'kegiatan' && r.induk_program === 'PROG')
    && baris[0].indikator === 'IND KEG A' && baris[0].indikator_induk === 'IND PROG DUA' && baris[1].indikator_induk === null,
    JSON.stringify(baris.map(r => [r.level, r.nama, r.induk_program, r.indikator, r.indikator_induk])));
  // Nama asli diawali "PROGRAM …": dulu kata kunci itu membuat baris kegiatan terbaca program.
  const kegAsli = [ra(5, 'kegiatan', 'PROGRAM PENUNJANG ***', 'Penyediaan Layanan ****', 'IK X', null)];
  const hAsli = await parseRenaksiFile(Buffer.from(await (await buatWorkbookList(kegAsli, 'kegiatan', induk)).xlsx.writeBuffer()), 'k.xlsx');
  ok('A6 nama induk diawali "PROGRAM" tidak membuat baris kegiatan terbaca program',
    hAsli.rows.length === 1 && hAsli.rows[0].level === 'kegiatan' && hAsli.rows[0].nama === 'Penyediaan Layanan' && hAsli.rows[0].induk_program === 'PROGRAM PENUNJANG',
    JSON.stringify(hAsli.rows.map(r => [r.level, r.nama, r.induk_program])));
  const progRow = { ...ra(6, 'program', 'PROGRAM P', null, 'IP', 9), sasaran: 'SASARAN S', kode: '1.02.02' } as RaRow;
  const hProg = await parseRenaksiFile(Buffer.from(await (await buatWorkbookList([progRow], 'program', [{ ...ra(9, 'sasaran', 'SASARAN S', null, 'IND SAS', null) }])).xlsx.writeBuffer()), 'p.xlsx');
  ok('A7 tingkat program: induk sasaran dari kolom "Sasaran", kode ikut, "Sasaran (Outcome)" tidak dikira kolom sasaran',
    hProg.rows.length === 1 && hProg.rows[0].level === 'program' && hProg.rows[0].induk_sasaran === 'SASARAN S'
    && hProg.rows[0].kode === '1.02.02' && hProg.rows[0].indikator_induk === 'IND SAS',
    JSON.stringify(hProg.rows.map(r => [r.level, r.nama, r.induk_sasaran, r.kode, r.indikator_induk])));
  const subRow = { ...ra(7, 'sub-kegiatan', 'PROGRAM P', 'KEG K', 'IS', 3), sub_kegiatan: 'SUB Z' } as RaRow;
  const hSub = await parseRenaksiFile(Buffer.from(await (await buatWorkbookList([subRow], 'sub-kegiatan', keg)).xlsx.writeBuffer()), 's.xlsx');
  ok('A8 tingkat sub kegiatan: program & kegiatan induk dari kolomnya, indikator induk = indikator kegiatan',
    hSub.rows.length === 1 && hSub.rows[0].level === 'sub-kegiatan' && hSub.rows[0].induk_program === 'PROGRAM P'
    && hSub.rows[0].induk_kegiatan === 'KEG K' && hSub.rows[0].indikator_induk === 'IND KEG A',
    JSON.stringify(hSub.rows.map(r => [r.level, r.nama, r.induk_program, r.induk_kegiatan, r.indikator_induk])));
}

// ── B. Aturan murni ───────────────────────────────────────────────────────────
console.log('B. Pencocok teks induk & penghitung turunan');
{
  const b = (id: number, level: BarisRantai['level'], program: string, kegiatan: string | null, indikator: string, sasaran: string | null = null): BarisRantai =>
    ({ id, level, program, kegiatan, sub_kegiatan: null, tujuan: null, sasaran, indikator, induk_indikator_id: null });
  const kand = [b(1, 'program', 'P1', null, '(1) IND X ***'), b(2, 'program', 'P2', null, 'IND X'), b(3, 'kegiatan', 'P1', 'K', 'IK')];
  const anak = b(9, 'kegiatan', 'P1', 'K', 'IK');
  ok('B1 teks induk dicocokkan dalam ENTITAS induk baris itu (penanda & huruf besar diabaikan)', cocokkanIndukImpor(anak, 'ind x', kand) === 1);
  ok('B2 indikator senama milik program LAIN tidak diambil', cocokkanIndukImpor({ ...anak, program: 'P2' }, 'IND X', kand) === 2
    && cocokkanIndukImpor(anak, 'IND Y', kand) === null);
  ok('B3 tingkat tujuan tidak punya induk', cocokkanIndukImpor(b(5, 'tujuan', 'T', null, 'IT'), 'IND X', kand) === null);
  const sub = (k: string, p: string, ind: string): BarisBerindikator =>
    ({ level: 'sub-kegiatan', program: p, kegiatan: k, sub_kegiatan: 'S', tujuan: null, sasaran: null, indikator: ind });
  const g = { level: 'kegiatan' as const, dari: 'K', ke: 'K', induk: 'P1', indukProgram: null, indukBaru: 'P2', indukProgramBaru: null };
  const tersimpan = [sub('K', 'P1', 's1'), sub('K', 'P1', 's2'), sub('K', 'P9', 's3'), sub('K LAIN', 'P1', 's4')];
  ok('B4 turunan tertinggal = sub kegiatan itu (program lama yang sama) yang TIDAK ada di berkas',
    turunanTertinggal(g, tersimpan, [{ level: 'sub-kegiatan', indikator: 'S1 ' }]) === 1, String(turunanTertinggal(g, tersimpan, [])));
}

// ── C. Ujung-ke-ujung (MySQL kotak pasir) ─────────────────────────────────────
console.log('C. Impor ke MySQL (kotak pasir 2074)');
const bersih = async () => {
  await sql`DELETE FROM rencana_aksi WHERE tahun = ${T}`;
  await sql`DELETE FROM renaksi_ganti_nama WHERE tahun = ${T}`;
  await sql`DELETE FROM system_settings WHERE \`key\` = ${`ra_lock_${T}`}`;
};
await bersih();
try {
  const user = await queryOne<{ id: number }>(sql`SELECT id FROM users LIMIT 1`);
  const uid = Number(user!.id);
  const dasar = { tahun: T, jenis: 'Akumulatif' as const, satuan: '%', target_rpjmd: 1, target_tahunan: 1, q1_target: 0, q2_target: 0, q3_target: 0, q4_target: 1 };
  await upsertRencanaAksi({ ...dasar, level: 'tujuan', program: 'TUJ', indikator: 'IT' }, uid);
  await upsertRencanaAksi({ ...dasar, level: 'sasaran', program: 'SAS', tujuan: 'TUJ', indikator: 'IS' }, uid);
  const p1 = await upsertRencanaAksi({ ...dasar, level: 'program', program: 'PROG A', sasaran: 'SAS', indikator: 'IP A1' }, uid);
  const p2 = await upsertRencanaAksi({ ...dasar, level: 'program', program: 'PROG A', sasaran: 'SAS', indikator: 'IP A2' }, uid);
  const q1 = await upsertRencanaAksi({ ...dasar, level: 'program', program: 'PROG B', sasaran: 'SAS', indikator: 'IP B1' }, uid);
  const k1 = await upsertRencanaAksi({ ...dasar, level: 'kegiatan', program: 'PROG A', kegiatan: 'KEG', indikator: 'IK1', induk_indikator_id: p1 }, uid);
  const k2 = await upsertRencanaAksi({ ...dasar, level: 'kegiatan', program: 'PROG A', kegiatan: 'KEG', indikator: 'IK2' }, uid);
  const s1 = await upsertRencanaAksi({ ...dasar, level: 'sub-kegiatan', program: 'PROG A', kegiatan: 'KEG', sub_kegiatan: 'SUB', indikator: 'IS1', induk_indikator_id: k1 }, uid);

  const keg = (indikator: string, program: string, induk: string | null): CommitRow => ({
    level: 'kegiatan', kode: null, nama: 'KEG', induk_tujuan: null, induk_sasaran: null, induk_program: program, induk_kegiatan: null,
    outcome: null, indikator, indikator_induk: induk, satuan: '%', jenis: 'Akumulatif', target_tahunan: 1, q: [0, 0, 0, 1], bulan: null, anggaran: null,
  });

  // §2 — tautan dari berkas
  const r1 = await commitImportRenaksi(T, 'upsert', [keg('IK1', 'PROG A', '(2) IP A2 ***'), keg('IK2', 'PROG A', 'TIDAK ADA')], uid);
  ok('C1 teks induk (dengan penanda) → tautan ke indikator program yang benar; teks asing dilaporkan, tidak diisi',
    r1.tautanDiisi === 1 && r1.tautanTakDikenal.join() === 'IK2'
    && (await getRencanaAksiById(k1))?.induk_indikator_id === p2 && (await getRencanaAksiById(k2))?.induk_indikator_id === null,
    JSON.stringify({ d: r1.tautanDiisi, t: r1.tautanTakDikenal, k1: (await getRencanaAksiById(k1))?.induk_indikator_id }));
  await commitImportRenaksi(T, 'upsert', [keg('IK1', 'PROG A', null)], uid);
  ok('C2 sel kosong = tautan tidak disentuh (berkas lama tanpa kolom ini tidak menghapus tautan)',
    (await getRencanaAksiById(k1))?.induk_indikator_id === p2);

  // §2 — mode ganti: induknya lahir ulang dengan id baru
  const prog = (indikator: string): CommitRow => ({
    level: 'program', kode: null, nama: 'PROG A', induk_tujuan: null, induk_sasaran: 'SAS', induk_program: null, induk_kegiatan: null,
    outcome: null, indikator, indikator_induk: null, satuan: '%', jenis: 'Akumulatif', target_tahunan: 1, q: [0, 0, 0, 1], bulan: null, anggaran: null,
  });
  const progB: CommitRow = { ...prog('IP B1'), nama: 'PROG B' };
  await commitImportRenaksi(T, 'ganti', [prog('IP A1'), prog('IP A2'), progB, keg('IK1', 'PROG A', 'IP A1'), keg('IK2', 'PROG A', 'IP A2')], uid);
  const idBaru = async (ind: string) => Number((await queryOne<{ id: number }>(sql`SELECT id FROM rencana_aksi WHERE tahun = ${T} AND indikator = ${ind}`))?.id);
  const tk = async (ind: string) => Number((await queryOne<{ i: number }>(sql`SELECT induk_indikator_id AS i FROM rencana_aksi WHERE tahun = ${T} AND indikator = ${ind}`))?.i);
  ok('C3 mode ganti: tautan menunjuk id program yang BARU lahir di impor yang sama',
    (await tk('IK1')) === (await idBaru('IP A1')) && (await tk('IK2')) === (await idBaru('IP A2')) && (await idBaru('IP A1')) !== p1);
  void q1;
  // Mode ganti melahirkan ulang baris kegiatan (id baru) & melepas tautan sub ke id lama.
  const kBaru = await idBaru('IK1');
  ok('C3b mode ganti melepas tautan sub ke kegiatan yang dihapus (tidak menunjuk id hantu)', (await getRencanaAksiById(s1))?.induk_indikator_id === null);
  await upsertRencanaAksi({ ...dasar, id: s1, expected_version: (await getRencanaAksiById(s1))!.version, level: 'sub-kegiatan',
    program: 'PROG A', kegiatan: 'KEG', sub_kegiatan: 'SUB', indikator: 'IS1', induk_indikator_id: kBaru }, uid);

  // §3 — pindah lewat berkas, sub tidak ada di berkas
  const pindah = [keg('IK1', 'PROG B', null), keg('IK2', 'PROG B', null)];
  const dampak = await dampakTurunanImpor(T, 'upsert', pindah);
  ok('C4 dampak (baca saja): 1 kegiatan pindah, 1 sub kegiatan tertinggal',
    dampak.length === 1 && dampak[0].turunan === 1 && dampak[0].gantiNama.indukBaru === 'PROG B', JSON.stringify(dampak));
  ok('C5 dampak tidak menulis apa pun', (await getRencanaAksiById(s1))?.program === 'PROG A');
  const r2 = await commitImportRenaksi(T, 'upsert', pindah, uid, false);
  ok('C6 "Biarkan di tempat lama": sub tetap di program lama', r2.turunanDijalarkan === 0 && (await getRencanaAksiById(s1))?.program === 'PROG A');
  // kembalikan lalu ulangi dengan membawa turunan
  await commitImportRenaksi(T, 'upsert', [keg('IK1', 'PROG A', null), keg('IK2', 'PROG A', null)], uid, false);
  const r3 = await commitImportRenaksi(T, 'upsert', pindah, uid);
  const s1Row = await getRencanaAksiById(s1);
  ok('C7 bawaan "Ikut pindahkan": sub kegiatan ikut ke program baru, tautannya ke kegiatan tetap (id kegiatan tidak berubah)',
    r3.turunanDijalarkan === 1 && s1Row?.program === 'PROG B' && s1Row?.kegiatan === 'KEG' && s1Row?.induk_indikator_id === kBaru,
    JSON.stringify({ n: r3.turunanDijalarkan, p: s1Row?.program, i: s1Row?.induk_indikator_id, kBaru }));
  ok('C8 kegiatan yang dipindah: tautan ke indikator program lama dilepas', (await getRencanaAksiById(kBaru))?.induk_indikator_id === null);
  const catat = await queryOne<{ n: number }>(sql`SELECT COUNT(*) AS n FROM renaksi_ganti_nama WHERE tahun = ${T} AND induk_baru = 'PROG B'`);
  ok('C8b pindahnya juga dicatat untuk E-Anggaran & PK', Number(catat?.n) >= 1);
  void k1; void k2;
  // sub yang ADA di berkas mengikuti berkas, bukan penjalar
  const subTetap: CommitRow = {
    level: 'sub-kegiatan', kode: null, nama: 'SUB', induk_tujuan: null, induk_sasaran: null, induk_program: 'PROG B', induk_kegiatan: 'KEG',
    outcome: null, indikator: 'IS1', indikator_induk: null, satuan: '%', jenis: 'Akumulatif', target_tahunan: 9, q: [0, 0, 0, 9], bulan: null, anggaran: null,
  };
  const d2 = await dampakTurunanImpor(T, 'upsert', [keg('IK1', 'PROG A', null), keg('IK2', 'PROG A', null), { ...subTetap, induk_program: 'PROG B' }]);
  ok('C9 turunan yang ada di berkas tidak dihitung tertinggal', d2.every(d => d.turunan === 0) || d2.length === 0, JSON.stringify(d2));
} finally {
  await bersih();
  const sisa = await queryOne<{ n: number }>(sql`SELECT COUNT(*) AS n FROM rencana_aksi WHERE tahun = ${T}`);
  ok('C10 kotak pasir 2074 bersih kembali', Number(sisa?.n) === 0);
}

console.log(`\n${gagal.length === 0 ? '✅ LULUS' : '❌ GAGAL'} — ${lulus} lulus, ${gagal.length} gagal`);
if (gagal.length) { console.log('Gagal:', gagal.join(', ')); process.exit(1); }
process.exit(0);
