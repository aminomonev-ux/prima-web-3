// scripts/test-renaksi-rantai.mts — uji PURE lib/renaksi/rantai.ts (Tahap 2).
// Konsep: docs/CONCEPT-renaksi-pilih-indikator.md §5, §12.
// Jalankan: npx tsx scripts/test-renaksi-rantai.mts

import {
  INDUK_LEVEL, namaEntitas, namaIndukLangsung,
  indikatorInduk, entitasAnak, indikatorEntitas, pemakaiIndikator, denganNilaiTersimpan,
  type BarisRantai,
} from '../lib/renaksi/rantai';
import type { RaLevel } from '../lib/data/rencana-aksi-schemas';

let lulus = 0;
const gagal: string[] = [];
function ok(nama: string, syarat: boolean, ket = '') {
  if (syarat) { lulus++; console.log(`  ok  ${nama}`); }
  else { gagal.push(nama); console.log(`FAIL  ${nama}${ket ? ' — ' + ket : ''}`); }
}

let seq = 0;
function baris(p: {
  level: RaLevel; program: string; indikator: string;
  kegiatan?: string | null; sub?: string | null; tujuan?: string | null; sasaran?: string | null;
  induk?: number | null; id?: number;
}): BarisRantai {
  return {
    id: p.id ?? ++seq,
    level: p.level,
    program: p.program,
    kegiatan: p.kegiatan ?? null,
    sub_kegiatan: p.sub ?? null,
    tujuan: p.tujuan ?? null,
    sasaran: p.sasaran ?? null,
    indikator: p.indikator,
    induk_indikator_id: p.induk ?? null,
  };
}

// ─── Data uji: 2 tujuan, 3 sasaran, 2 program (P1 punya 2 indikator), 4 kegiatan, 2 sub
const rows: BarisRantai[] = [
  baris({ id: 1, level: 'tujuan', program: 'T1', indikator: 'UHH' }),
  baris({ id: 2, level: 'tujuan', program: 'T2', indikator: 'IRB' }),

  baris({ id: 3, level: 'sasaran', program: 'S1', tujuan: 'T1', indikator: 'NDR' }),
  baris({ id: 4, level: 'sasaran', program: 'S2', tujuan: 'T1', indikator: 'IKM' }),
  baris({ id: 5, level: 'sasaran', program: 'S3', tujuan: 'T2', indikator: 'IMR' }),

  baris({ id: 10, level: 'program', program: 'P1', sasaran: 'S1', indikator: 'Ind A' }),
  baris({ id: 11, level: 'program', program: 'P1', sasaran: 'S1', indikator: 'Ind B' }),
  baris({ id: 12, level: 'program', program: 'P2', sasaran: 'S2', indikator: 'Ind C' }),

  baris({ id: 20, level: 'kegiatan', program: 'P1', kegiatan: 'K1', indikator: 'Keg A', induk: 10 }),
  baris({ id: 21, level: 'kegiatan', program: 'P1', kegiatan: 'K2', indikator: 'Keg B', induk: 11 }),
  baris({ id: 22, level: 'kegiatan', program: 'P1', kegiatan: 'K3', indikator: 'Keg C', induk: null }),
  baris({ id: 23, level: 'kegiatan', program: 'P2', kegiatan: 'K4', indikator: 'Keg D', induk: null }),

  baris({ id: 30, level: 'sub-kegiatan', program: 'P1', kegiatan: 'K1', sub: 'SK1', indikator: 'Sub A', induk: 20 }),
  baris({ id: 31, level: 'sub-kegiatan', program: 'P1', kegiatan: 'K1', sub: 'SK2', indikator: 'Sub B', induk: null }),
  // Baris indikator kedua untuk entitas yang sama — memastikan dedup nama.
  baris({ id: 24, level: 'kegiatan', program: 'P1', kegiatan: 'K1', indikator: 'Keg A2', induk: 10 }),
];

console.log('\nA. Peta tingkat & nama entitas');
ok('A1 tujuan tidak punya induk', INDUK_LEVEL.tujuan === null);
ok('A2 sub-kegiatan induknya kegiatan', INDUK_LEVEL['sub-kegiatan'] === 'kegiatan');
ok('A3 nama entitas kegiatan dari kolom kegiatan', namaEntitas(rows[8]) === 'K1');
ok('A4 nama entitas program dari kolom program', namaEntitas(rows[5]) === 'P1');
ok('A5 induk langsung sasaran = kolom tujuan', namaIndukLangsung(rows[2]) === 'T1');
ok('A6 induk langsung program = kolom sasaran', namaIndukLangsung(rows[5]) === 'S1');
ok('A7 induk langsung tujuan = null', namaIndukLangsung(rows[0]) === null);

console.log('\nB. Daftar indikator induk');
const indukSasaran = indikatorInduk(rows, 'sasaran', { nama: 'T1' });
ok('B1 sasaran di bawah T1 hanya melihat indikator T1', indukSasaran.length === 1 && indukSasaran[0].indikator === 'UHH', JSON.stringify(indukSasaran));
ok('B2 induk belum dipilih → daftar kosong', indikatorInduk(rows, 'sasaran', { nama: '  ' }).length === 0);
ok('B3 tujuan sebagai anak tidak punya induk', indikatorInduk(rows, 'tujuan', { nama: 'T1' }).length === 0);
const indukProgram = indikatorInduk(rows, 'program', { nama: 'S1' });
ok('B4 program di bawah S1 melihat indikator SASARAN-nya', indukProgram.map(p => p.indikator).join('|') === 'NDR', JSON.stringify(indukProgram));
ok('B5 id induk ikut dibawa (bukan cuma teks)', indukProgram[0].id === 3);
const indukKegiatan = indikatorInduk(rows, 'kegiatan', { nama: 'P1' });
ok('B6 kegiatan di bawah P1 melihat dua indikator PROGRAM-nya, terurut',
  indukKegiatan.map(p => p.indikator).join('|') === 'Ind A|Ind B', JSON.stringify(indukKegiatan));
ok('B7 program yang belum ada → daftar kosong', indikatorInduk(rows, 'kegiatan', { nama: 'P9' }).length === 0);
const indukSub = indikatorInduk(rows, 'sub-kegiatan', { nama: 'K1', program: 'P1' });
ok('B8 sub melihat indikator KEGIATAN-nya (satu entitas boleh punya beberapa)',
  indukSub.map(p => p.indikator).join('|') === 'Keg A|Keg A2', JSON.stringify(indukSub));

console.log('\nC. Daftar entitas anak (penyusutan)');
const anakIndA = entitasAnak(rows, 'kegiatan', 10, 'P1');
ok('C1 kegiatan tertaut indikator (1) + yang belum tertaut ikut tampil', anakIndA.join('|') === 'K1|K3', anakIndA.join('|'));
const anakIndB = entitasAnak(rows, 'kegiatan', 11, 'P1');
ok('C2 kegiatan yang tertaut ke indikator lain tidak muncul', anakIndB.join('|') === 'K2|K3', anakIndB.join('|'));
ok('C3 kegiatan di program lain tidak ikut', !anakIndA.includes('K4'));
ok('C4 indikator induk belum dipilih → daftar kosong', entitasAnak(rows, 'kegiatan', null, 'P1').length === 0);
ok('C5 id induk tidak sah (0/negatif) → daftar kosong', entitasAnak(rows, 'kegiatan', 0, 'P1').length === 0);
ok('C6 nama entitas tidak dobel walau punya banyak indikator',
  anakIndA.filter(n => n === 'K1').length === 1, anakIndA.join('|'));
const anakSub = entitasAnak(rows, 'sub-kegiatan', 20, 'P1');
ok('C7 sub kegiatan: yang tertaut + yang NULL', anakSub.join('|') === 'SK1|SK2', anakSub.join('|'));

console.log('\nD. Indikator milik entitas (opsi "indikator sendiri")');
ok('D1 program P1 punya dua indikator', indikatorEntitas(rows, 'program', { nama: 'P1' }).join('|') === 'Ind A|Ind B');
ok('D2 entitas baru → daftar kosong', indikatorEntitas(rows, 'program', { nama: 'P9' }).length === 0);
ok('D3 nama entitas kosong → daftar kosong', indikatorEntitas(rows, 'program', { nama: '' }).length === 0);
ok('D4 kegiatan senama di program lain tidak digabung',
  indikatorEntitas(rows, 'kegiatan', { nama: 'K1', program: 'P2' }).length === 0);

console.log('\nE. Peringatan teks yang sudah dipakai');
ok('E1 teks indikator sasaran menunjuk pemiliknya', pemakaiIndikator(rows, 'sasaran', 'NDR').join('|') === 'S1');
ok('E2 teks yang belum dipakai → kosong', pemakaiIndikator(rows, 'sasaran', 'Teks Baru').length === 0);
ok('E3 teks kosong → kosong', pemakaiIndikator(rows, 'sasaran', '   ').length === 0);

console.log('\nF. Nilai tersimpan di luar daftar');
ok('F1 nilai tersimpan lama tetap ditawarkan paling atas', denganNilaiTersimpan(['A', 'B'], 'Lama').join('|') === 'Lama|A|B');
ok('F2 nilai yang sudah ada tidak diduplikasi', denganNilaiTersimpan(['A', 'B'], 'A').join('|') === 'A|B');
ok('F3 nilai kosong tidak menambah opsi', denganNilaiTersimpan(['A'], '  ').join('|') === 'A');
ok('F4 daftar asli tidak diubah', (() => { const o = ['A']; denganNilaiTersimpan(o, 'X'); return o.length === 1; })());

console.log(`\n${gagal.length === 0 ? '✅ LULUS' : '❌ GAGAL'} — ${lulus} lulus, ${gagal.length} gagal`);
if (gagal.length) { console.log('Gagal:', gagal.join(', ')); process.exit(1); }
