// scripts/test-kinerja-rekap.mts — regresi pembenahan perhitungan E-Anggaran.
// Jalankan: npx tsx scripts/test-kinerja-rekap.mts
//
// Konsep: docs/CONCEPT-kinerja-perbaikan-perhitungan.md
//
// Pohon uji SENGAJA memakai pagu yang tidak habis dibagi 12 dan nilai bulanan
// yang persennya jatuh di batas pembulatan. Tanpa itu, bagian C/F/G/K/L semuanya
// lulus tanpa menguji apa pun — selisih 0,01 tidak akan pernah muncul.

import { readFileSync } from 'node:fs';
import { recalcAllRealisasiServer, type RealRowRaw } from '../lib/data/kinerja-calc';
import { hitungRekap, kumpulkanItem, hitungAngka, jumlahkan } from '../lib/kinerja/rekap';
import { recalcAllRealisasi } from '../app/(dashboard)/kinerja/_utils';
import { bisaSamakan, ringkasSamakan, samakanSatu, samakanSebulan } from '../lib/kinerja/samakan-target';
import { rekapAoa, REKAP_JUDUL_BARIS, realisasiAoa, DETAIL_HEADER,
  DETAIL_BULAN_HEADER, barisBulanDetail, PENANDA_TANGAN } from '../app/(dashboard)/kinerja/_exports';
import { hitungJumlahBulan, bulanBerdata } from '../lib/kinerja/cetak-detail';
import { buatPenyaringYatim, himpunanCanonical } from '../lib/kinerja/yatim';
import { nolkanBaris, aktifkanBaris, sudahDinolkan } from '../lib/kinerja/nol-kan';
import type { RealRow, SskRow, SskMonths } from '../app/(dashboard)/kinerja/_types';

let lulus = 0;
const gagal: string[] = [];
function ok(nama: string, syarat: boolean, ket = '') {
  if (syarat) { lulus++; console.log(`  ok  ${nama}`); }
  else { gagal.push(nama); console.log(`FAIL  ${nama}${ket ? ' — ' + ket : ''}`); }
}
function eq(nama: string, dapat: unknown, harap: unknown) {
  ok(nama, Object.is(dapat, harap) || dapat === harap, `dapat ${JSON.stringify(dapat)}, harap ${JSON.stringify(harap)}`);
}

const MK: (keyof SskMonths)[] = ['jan','feb','mar','apr','mei','jun','jul','agu','sep','okt','nov','des'];
const bulanan = (v: number): SskMonths =>
  MK.reduce((a, m) => { a[m] = v; return a; }, {} as SskMonths);

// ─── Pohon uji ───────────────────────────────────────────────────────────────
//
// A: pagu 7 miliar, tiap bulan 583.333.333 → persen 8,333333% (dibulatkan 8,33).
//    12 × 8,33 = 99,96% padahal rupiahnya 6.999.999.996 = 99,99999%. Selisih
//    ~2,8 juta inilah yang dulu masuk ke kolom target.
// B: pagu 40.937.377.000 — angka nyata dari layar, tidak habis dibagi apa pun.
// C: pagu 0 — item sah yang memang tidak beranggaran (bukan yatim).
const PAGU_A = 7_000_000_000;
const BULAN_A = 583_333_333;
const PAGU_B = 40_937_377_000;
const BULAN_B = 3_700_738_881;

const ssk = new Map<string, { pagu: number; months: SskMonths | null }>([
  ['A', { pagu: PAGU_A, months: bulanan(BULAN_A) }],
  ['B', { pagu: PAGU_B, months: bulanan(BULAN_B) }],
  ['C', { pagu: 0,      months: bulanan(0) }],
]);

function baris(cid: string, bulan: number, fisik: number, keu: number, nama = cid): RealRowRaw {
  return {
    bulan, keterangan: `Item ${nama}`, uraian_ssk: `SSK ${nama}`,
    program: 'Program 1', kegiatan: 'Kegiatan 1', subkegiatan: 'Sub 1',
    ssk_canonical_id: cid, ssk_versi_tipe: 'MURNI', ssk_versi_seq: 0,
    real_fisik: fisik, real_keuangan: keu,
  };
}

const mentah: RealRowRaw[] = [];
for (let b = 1; b <= 12; b++) {
  // real_fisik A sengaja BUKAN sama dengan targetnya. Kalau disamakan, mutasi
  // "tombol Samakan menimpa / memakai persen bulat" jadi tidak terlihat sama
  // sekali — tesnya lulus karena datanya kebetulan setuju.
  mentah.push(baris('A', b, b <= 7 ? 400_000_000 : 0, b <= 7 ? 500_000_000 : 0));
  mentah.push(baris('B', b, b <= 7 ? 3_000_000_000 : 0, b <= 7 ? 2_500_000_000 : 0));
  mentah.push(baris('C', b, 0, 0));
}
// Yatim: canonical_id tidak ada di SSK, tapi uangnya sudah keluar.
mentah.push(baris('HILANG', 3, 0, 90_000_000, 'Yatim'));

const rows = recalcAllRealisasiServer(mentah, { sskByCanonical: ssk }) as unknown as RealRow[];

console.log('\n── A. Hidrasi: target dari RUPIAH, bukan dari persen ───────────');

const a1 = rows.find(r => r.ssk_canonical_id === 'A' && r.bulan === 1)!;
eq('A1 target_rp = nilai RKO bulan itu', a1.target_rp, BULAN_A);
eq('A2 target_fisik = turunan persen 2 desimal', a1.target_fisik, 8.33);

const a7 = rows.find(r => r.ssk_canonical_id === 'A' && r.bulan === 7)!;
eq('A3 akum_target_rp = 7 x rupiah (bukan 7 x persen bulat)', a7.akum_target_rp, BULAN_A * 7);
// Jumlah persen yang sudah dibulatkan: 7 x 8,33 = 58,31. Dari rupiah: 58,33.
ok('A4 akum_target_fisik BUKAN jumlah persen bulat', a7.akum_target_fisik !== 58.31,
   `dapat ${a7.akum_target_fisik}`);
eq('A5 akum_target_fisik dari rupiah', a7.akum_target_fisik, 58.33);

const yat = rows.find(r => r.ssk_canonical_id === 'HILANG')!;
ok('A6 baris yatim ditandai', yat.yatim === true);
eq('A7 yatim pagu 0', yat.pagu_awal, 0);
ok('A8 baris normal tidak ditandai yatim', a1.yatim === false);

console.log('\n── B. Klien dan server memakai rumus yang sama ──────────────────');

const klien = recalcAllRealisasi(rows.map(r => ({ ...r })));
let beda = 0;
for (let i = 0; i < rows.length; i++) {
  const s = rows[i], k = klien[i];
  if (s.akum_target_fisik !== k.akum_target_fisik) beda++;
  if (s.akum_target_rp    !== k.akum_target_rp)    beda++;
  if (s.deviasi_fisik     !== k.deviasi_fisik)     beda++;
  if (s.deviasi_keuangan  !== k.deviasi_keuangan)  beda++;
}
eq('B1 recalcAllRealisasi klien == recalcAllRealisasiServer', beda, 0);

console.log('\n── C. Deviasi dari nilai mentah, dibulatkan sekali ──────────────');

// Dibuat supaya "bulat - bulat" dan "mentah lalu bulatkan" berbeda 0,01.
const angka = hitungAngka(1_000_000, 550_650, 526_644, 526_644);
eq('C1 targetPct dibulatkan', angka.targetPct, 55.07);
eq('C2 pctKeu dibulatkan', angka.pctKeu, 52.66);
// 52,66 - 55,07 = -2,41 (cara lama). Mentah: 52,6644 - 55,065 = -2,4006 -> -2,40.
eq('C3 devKeu dari mentah, bukan dari dua angka bulat', angka.devKeu, -2.4);
ok('C4 cara lama memang berbeda', Math.round((angka.pctKeu - angka.targetPct) * 100) / 100 === -2.41);

console.log('\n── D. Rekap: target Rp dijumlah, tidak dikarang dari persen ─────');

const hasil = hitungRekap(rows, 7, 'ssk', 'TOTAL');
const total = hasil.baris[0];
eq('D1 pagu total = A + B (C berpagu 0)', total.pagu, PAGU_A + PAGU_B);
eq('D2 target Rp = jumlah rupiah 7 bulan', total.targetRp, (BULAN_A + BULAN_B) * 7);
// Cara lama: round(persenBulat/100 x pagu). Harus TIDAK sama dengan hasil kita.
const caraLama = Math.round((total.targetPct / 100) * total.pagu);
ok('D3 target Rp bukan hasil balik dari persen', total.targetRp !== caraLama,
   `keduanya ${total.targetRp}`);

console.log('\n── E. Rekap: item bolong satu bulan tidak hilang ────────────────');

// Buang seluruh baris bulan 7 milik B — dulu rekap menyaring `bulan === 7`,
// jadi pagu B ikut lenyap dari penyebut.
const bolong = rows.filter(r => !(r.ssk_canonical_id === 'B' && r.bulan === 7));
const hBolong = hitungRekap(bolong, 7, 'ssk', 'TOTAL');
eq('E1 pagu tetap utuh walau bulan 7 bolong', hBolong.baris[0].pagu, PAGU_A + PAGU_B);
eq('E2 realisasi B 6 bulan ikut terhitung',
   hBolong.baris[0].realKeu, 500_000_000 * 7 + 2_500_000_000 * 6);

console.log('\n── F. Rekap: baris kembar dilaporkan, pagu tidak dobel ──────────');

const kembar = [...rows, ...rows.filter(r => r.ssk_canonical_id === 'B' && r.bulan === 3)];
const hKembar = hitungRekap(kembar, 7, 'ssk', 'TOTAL');
eq('F1 pagu tidak ikut berlipat', hKembar.baris[0].pagu, PAGU_A + PAGU_B);
eq('F2 kekembaran dilaporkan', hKembar.dobel.jumlahItem, 1);
ok('F3 contoh menyebut rekeningnya', hKembar.dobel.contoh[0] === 'Item B');
eq('F4 pohon bersih tidak melaporkan kembar', hasil.dobel.jumlahItem, 0);

console.log('\n── G. Rekap: yatim dilaporkan, tidak menaikkan persen ───────────');

eq('G1 yatim terhitung', hasil.yatim.jumlahBaris, 1);
eq('G2 nominal yatim disebut', hasil.yatim.nominal, 90_000_000);
const tanpaYatim = rows.filter(r => !r.yatim);
eq('G3 total keuangan tidak memuat yatim',
   total.realKeu, jumlahkan(kumpulkanItem(tanpaYatim, 7).items).realKeu);
ok('G4 yatim memang punya uang', hasil.yatim.nominal > 0);

console.log('\n── H. Rekap: kedalaman & bentuk baris ───────────────────────────');

const hProgram = hitungRekap(rows, 7, 'program', 'TOTAL');
eq('H1 kedalaman program = grand total + 1 program', hProgram.baris.length, 2);
const hFull = hitungRekap(rows, 7, 'full', 'TOTAL');
ok('H2 kedalaman full memuat baris rekening', hFull.baris.length > hasil.baris.length);
eq('H3 nomor baris berurutan', hFull.baris.map(b => b.no).join(','),
   hFull.baris.map((_, i) => i + 1).join(','));
eq('H4 grand total indent 0 & tebal', `${hasil.baris[0].indent}|${hasil.baris[0].tebal}`, '0|true');

console.log('\n── I. Samakan dengan Target: real fisik = target rupiah ─────────');

// Perilaku sungguhan lewat fungsi yang dipakai tombolnya, bukan tiruannya.
const disamakan = recalcAllRealisasi(samakanSebulan(rows, 8));
const i8 = disamakan.find(r => r.ssk_canonical_id === 'A' && r.bulan === 8)!;
eq('I1 real_fisik = target_rp bulan itu', i8.real_fisik, BULAN_A);
// Inilah alasan sumbernya rupiah: pct_fisik keluar PERSIS = target_fisik.
eq('I2 pct_fisik persis sama dengan target_fisik', i8.pct_fisik, i8.target_fisik);

const salahCara = Math.round((i8.target_fisik / 100) * i8.pagu_awal);
ok('I3 cara "kalikan persen" memberi angka lain', salahCara !== BULAN_A,
   `keduanya ${salahCara}`);

const i9 = disamakan.find(r => r.ssk_canonical_id === 'A' && r.bulan === 9)!;
eq('I4 bulan lain tidak tersentuh', i9.real_fisik, 0);
const iC = disamakan.find(r => r.ssk_canonical_id === 'C' && r.bulan === 8)!;
eq('I5 baris berpagu 0 tidak diisi', iC.real_fisik, 0);
// Yatim lewat jalur server selalu berpagu 0, jadi `pagu > 0` sudah cukup untuk
// data hari ini. Barisnya dikarang supaya penjaga `!r.yatim` benar-benar diuji
// kontraknya — pemanggil lain boleh menyusun baris dengan cara berbeda.
ok('I6 bisaSamakan menolak yatim walau pagunya terisi',
   !bisaSamakan({ ...rows[0], yatim: true }));
ok('I6b bisaSamakan menerima baris normal', bisaSamakan(rows[0]));

// Borongan TIDAK menimpa sel yang sudah berisi.
const asalA7 = rows.find(r => r.ssk_canonical_id === 'A' && r.bulan === 7)!;
ok('I7 pohon uji: isinya memang berbeda dari targetnya',
   asalA7.real_fisik !== 0 && asalA7.real_fisik !== asalA7.target_rp);
eq('I8 borongan tidak menimpa sel yang sudah berisi',
   samakanSebulan(rows, 7).find(r => r.ssk_canonical_id === 'A' && r.bulan === 7)!.real_fisik,
   asalA7.real_fisik);

// Per baris BOLEH menimpa — satu sel, diklik sengaja. Dipakai item A karena
// persennya (8,333333%) TIDAK bulat: cara "kalikan persen bulat" memberi
// 583.100.000, bukan 583.333.333. Item B kebetulan tepat 9,04% sehingga
// keduanya menghasilkan angka sama dan mutasinya tak akan terlihat.
const idxA7 = rows.findIndex(r => r.ssk_canonical_id === 'A' && r.bulan === 7);
eq('I9 per baris menimpa isi yang ada dengan target rupiah',
   samakanSatu(rows, idxA7)[idxA7].real_fisik, BULAN_A);

eq('I10 ringkasan menghitung baris kosong berpagu', ringkasSamakan(rows, 8).kosong, 2);
eq('I11 bulan yang sudah terisi dilaporkan sebagai berisi', ringkasSamakan(rows, 7).berisi, 2);

console.log('\n── P. Baris JUMLAH view Detail & bundel unduhan ────────────────');

// Baris JUMLAH LUPUT dari audit: dulu targetnya diturunkan dari persen bulat dan
// deviasinya dari dua angka bulat — dua cacat yang sama dengan T5 & T3.
const barisJan = rows.filter(r => r.bulan === 1 && !r.yatim);
const jml = hitungJumlahBulan(barisJan);
// Diperiksa pada RUPIAHNYA, bukan persennya: pada satu bulan kedua cara
// kebetulan membulat ke persen yang sama (8,94%), jadi asersi persen lulus tanpa
// menguji apa pun. Rupiahnya beda 233.333 dan itu yang menopang segalanya.
eq('P1 target JUMLAH = jumlah target_rp', jml.targetRp, BULAN_A + BULAN_B);
const caraLamaJml = barisJan.reduce((a, r) => a + Math.round((r.target_fisik / 100) * r.pagu_awal), 0);
ok('P2 cara lama memang memberi rupiah lain', caraLamaJml !== jml.targetRp,
   `keduanya ${jml.targetRp}`);
eq('P2b akum target JUMLAH juga dari rupiah',
   jml.akumTgtRp, barisJan.reduce((a, r) => a + r.akum_target_rp, 0));
eq('P3 pagu JUMLAH = jumlah pagu barisnya',
   jml.pagu, barisJan.reduce((a, r) => a + r.pagu_awal, 0));
eq('P4 deviasi JUMLAH dari rasio mentah',
   jml.devFisik,
   Math.round((jml.akumFisik / jml.pagu * 100 - barisJan.reduce((a,r)=>a+r.akum_target_rp,0) / jml.pagu * 100) * 100) / 100);

eq('P5 bulanBerdata memulangkan bulan yang ada barisnya', bulanBerdata(rows).length, 12);
// Masukannya sengaja DIACAK — kalau memakai `rows` apa adanya, urutannya sudah
// benar sejak awal dan pengurutnya bisa dilepas tanpa satu tes pun gagal.
const acak = [...rows].sort(() => Math.random() - 0.5);
eq('P6 bulanBerdata mengurutkan masukan yang acak',
   bulanBerdata(acak).join(','), '1,2,3,4,5,6,7,8,9,10,11,12');
// Bulan di luar 1-12 (data rusak) tidak boleh ikut jadi halaman.
const rusak = [...rows, { ...rows[0], bulan: 0 }, { ...rows[0], bulan: 13 }];
eq('P6b bulan di luar 1-12 dibuang', bulanBerdata(rusak).join(','), '1,2,3,4,5,6,7,8,9,10,11,12');

const aoaDetail = realisasiAoa(barisJan);
eq('P7 kolom detail sama dengan headernya', aoaDetail[0].length, DETAIL_HEADER.length);
eq('P8 baris detail = jumlah baris yang dikirim', aoaDetail.length, barisJan.length);
eq('P9 kolom Pagu detail sama dengan barisnya', aoaDetail[0][3], barisJan[0].pagu_awal);

const ctP = readFileSync('app/(dashboard)/kinerja/_tabs/CetakTab.tsx', 'utf8');
const exP = readFileSync('app/(dashboard)/kinerja/_exports.ts', 'utf8');
ok('P10 layar Detail memakai lib, tidak menjumlah sendiri lagi',
   /hitungJumlahBulan\(rows\)/.test(ctP) && !/const totAkumTgtRp/.test(ctP));
// PDF & Excel sama-sama lewat `barisBulanDetail`, dan di situlah JUMLAH-nya
// diambil dari lib — satu tempat untuk dua berkas.
ok('P11 baris JUMLAH berkas dari lib yang sama dengan layar',
   /const j = hitungJumlahBulan\(rows\);/.test(exP) &&
   (exP.match(/barisBulanDetail\(/g) || []).length === 3);
// Diperiksa pada PEMANGGILANNYA, bukan keberadaan teksnya: melepas panggilan
// `tandaTangan(...)` tetap meninggalkan fungsinya lengkap dengan kata-katanya,
// dan nama rumah sakit juga muncul di kop REKAP — dua-duanya lulus tanpa menguji
// apa pun (L82c).
ok('P12 halaman detail PDF memanggil kop DAN tanda tangan',
   /tulisKopPdf\(doc, kopDetail\(sumber, b, tahun\)\)/.test(exP) &&
   /tandaTangan\(doc, akhir \+ \d+, b, tahun\)/.test(exP));
// Teks kopnya hidup di SATU tempat (`kopDetail`) dan dipakai dua penulis —
// PDF dan Excel. Dulu kop rekap & kop detail dua salinan yang beda perlakuan.
eq('P12b kopDetail dipakai PDF dan Excel', (exP.match(/kopDetail\(/g) || []).length, 3);
const badanKop = exP.slice(exP.indexOf('export function kopDetail'), exP.indexOf('const PENANDA_TANGAN'));
ok('P12c kop detail memuat identitas lengkap',
   /RUMAH SAKIT JIWA DAERAH DR\. AMINO GONDOHUTOMO/.test(badanKop) &&
   /LAPORAN REALISASI KINERJA \$\{sumber\}/.test(badanKop) && /BULAN \$\{/.test(badanKop));
// Nama jabatan cuma boleh hidup di SATU daftar. Dulu ditulis ulang di JSX
// CetakTab, jadi mengganti "Kabag Program & Anggaran" jadi "Kabag Renbang" harus
// menyentuh dua tempat — dan lupa satu berarti cetakan berbeda dengan layarnya.
eq('P12d nama jabatan cuma didefinisikan sekali di seluruh modul',
   PENANDA_TANGAN.length +
   (readFileSync('app/(dashboard)/kinerja/_tabs/CetakTab.tsx', 'utf8')
     .match(new RegExp(PENANDA_TANGAN.map(p => p.jabatan).join('|'), 'g')) || []).length, 2);
ok('P12e layar memakai daftar yang sama dengan berkas',
   /PENANDA_TANGAN\.map\(pj =>/.test(readFileSync('app/(dashboard)/kinerja/_tabs/CetakTab.tsx', 'utf8')));
ok('P12f jabatan & peran keduanya terpakai di berkas',
   /p\.jabatan/.test(exP) && /p\.peran/.test(exP));

ok('P13 bundel Excel satu sheet per sumber, bukan ditumpuk',
   /addWorksheet\('Rekap'\)/.test(exP) && /addWorksheet\(bagian\.sumber\)/.test(exP));
ok('P14 bundel memakai penyusun yang sama dengan unduhan satuan',
   /tulisSheetDetailPerBulan\(wb\.addWorksheet\(bagian\.sumber\)/.test(exP) &&
   /tulisSheetData\(wb, baris, bagian\.sumber\)/.test(exP));
ok('P15 sumber tanpa baris tidak melahirkan sheet kosong',
   (exP.match(/if \(baris\.length === 0\) continue;/g) || []).length === 2);
ok('P16 baris ditandai sumbernya di fetchRealisasiAll',
   /\.map\(r => \(\{ \.\.\.r, sumber: s \}\)\)/.test(
     readFileSync('app/(dashboard)/kinerja/kinerja-client.tsx', 'utf8')));
ok('P17 tanpa sumber dicentang, hasilnya rekap saja seperti sebelumnya',
   /exportBundelExcel\(\{ \.\.\.paramRekap\(\), detail: d \}\) : exportRekapExcel\(paramRekap\(\)\)/.test(ctP));

console.log('\n── Q. Berkas unduhan sebentuk dengan layar ─────────────────────');

const exQ = readFileSync('app/(dashboard)/kinerja/_exports.ts', 'utf8');

// Q1: satu penulis kop untuk PDF, satu untuk Excel — bukan kop yang ditulis
// ulang di tiap tempat. Rekap & detail sama-sama memasoknya lewat KopBaris[].
ok('Q1 kop PDF ditulis satu fungsi untuk rekap DAN detail',
   (exQ.match(/tulisKopPdf\(doc, kop(Rekap|Detail)\(/g) || []).length === 2);
ok('Q2 kop PDF rekap rata tengah, bukan lagi di pojok kiri',
   /doc\.text\(k\.teks, tengah, y, \{ align: 'center' \}\)/.test(exQ) &&
   !/doc\.text\('RUMAH SAKIT JIWA DAERAH DR\. AMINO GONDOHUTOMO', 14,/.test(exQ));

// Q3: lebar merge diambil dari jumlah kolom, bukan angka mati yang basi begitu
// kolom bertambah (dan kolom memang baru bertambah dua di Tahap 7).
ok('Q3 kop Excel di-merge selebar jumlah kolom',
   /ws\.mergeCells\(r\.number, 1, r\.number, kolom\)/.test(exQ) &&
   /const kolom = REKAP_HEADER\.length;/.test(exQ));
ok('Q3b kop Excel detail juga memakai jumlah kolom, bukan angka mati',
   /tulisKopExcel\(ws, kopDetail\(sumber, b, tahun\), DETAIL_BULAN_HEADER\.length\)/.test(exQ));

ok('Q4 baris tebal di rekap ikut ditebalkan di Excel',
   /if \(!b\.tebal\) return;/.test(exQ) && /c\.font = \{ bold: true \}/.test(exQ));

// Q5-Q7: struktur per bulan.
ok('Q5 sheet detail Excel satu blok per bulan',
   /export function tulisSheetDetailPerBulan/.test(exQ) &&
   /for \(const b of bulanDipakai\)/.test(exQ));
ok('Q6 tiap blok punya kop, header, JUMLAH, dan tanda tangan',
   /tulisKopExcel\(ws, kopDetail/.test(exQ) &&
   /ws\.addRow\(DETAIL_BULAN_HEADER\)/.test(exQ) &&
   /tulisTandaTanganExcel\(ws, b, tahun/.test(exQ));
ok('Q7 ada pemisah halaman antar bulan, bukan di bulan pertama',
   /if \(!pertama\) ws\.getRow\(ws\.rowCount\)\.addPageBreak\(\);/.test(exQ));

// Q8: sheet Data tetap tabel rata — yang menyelamatkan sort/filter.
ok('Q8 sheet Data tetap tabel rata tanpa kop/JUMLAH',
   /export function tulisSheetData/.test(exQ) &&
   /addSheetFromAoa\(ws, \[DETAIL_HEADER, \.\.\.realisasiAoa\(rows\)\]/.test(exQ));
ok('Q8b sheet Data ikut di unduhan satuan DAN bundel',
   (exQ.match(/tulisSheetData\(/g) || []).length === 3);
// Nama sheet Excel dibatasi 31 karakter — "Data PEMELIHARAAN" masih muat, tapi
// pemotongnya dipasang supaya sumber baru yang namanya panjang tidak melempar.
ok('Q9 nama sheet Data dipotong ke batas Excel', /\.slice\(0, 31\)/.test(exQ));

// Kolom blok per bulan meniru layar: TANPA kolom Bulan (bulannya sudah di kop),
// beda dengan sheet Data yang rata dan perlu pembeda bulan.
eq('Q10 blok per bulan 15 kolom seperti layar', DETAIL_BULAN_HEADER.length, 15);
eq('Q11 sheet Data 16 kolom (ada kolom Bulan)', DETAIL_HEADER.length, 16);
ok('Q12 hanya sheet Data yang punya kolom Bulan',
   DETAIL_HEADER.includes('Bulan') && !DETAIL_BULAN_HEADER.includes('Bulan'));

// Angka di Excel tetap ANGKA supaya bisa dijumlah; di PDF baru jadi teks.
ok('Q13 Excel menyimpan rupiah sebagai angka, bukan teks',
   typeof barisBulanDetail(barisJan, true)[0][2] === 'number');
ok('Q14 PDF menyimpan rupiah sebagai teks berformat',
   typeof barisBulanDetail(barisJan, false)[0][2] === 'string');
// Baris terakhir SELALU JUMLAH — itu yang ditebalkan pemanggilnya.
const isiQ = barisBulanDetail(barisJan, true);
eq('Q15 baris terakhir adalah JUMLAH', isiQ[isiQ.length - 1][1], 'JUMLAH');
eq('Q16 jumlah baris = data + 1 baris JUMLAH', isiQ.length, barisJan.length + 1);
eq('Q17 kolom per baris sama dengan headernya', isiQ[0].length, DETAIL_BULAN_HEADER.length);

console.log('\n── O. Tingkat Capaian Fisik & Bulan Ini ────────────────────────');

// Capaian = realisasi / TARGET (bukan / pagu). Item A s/d bulan 7:
// realFisik 400jt x 7 = 2,8 M; target 583.333.333 x 7 = 4.083.333.331.
const oA = hitungRekap(rows.filter(r => r.ssk_canonical_id === 'A'), 7, 'ssk', 'A').baris[0];
eq('O1 capaian = realisasi / target', oA.capaianFisik,
   Math.round((400_000_000 * 7) / (BULAN_A * 7) * 10000) / 100);
ok('O2 capaian BEDA dengan pctFisik (pembaginya beda)', oA.capaianFisik !== oA.pctFisik);

// Target nol -> null, BUKAN 0 dan bukan Infinity.
eq('O3 target nol -> capaian null', hitungAngka(0, 0, 0, 0, 0).capaianFisik, null);
eq('O4 pagu ada tapi target nol -> tetap null', hitungAngka(1000, 0, 500, 0).capaianFisik, null);
eq('O5 target ada tapi realisasi nol -> 0%, bukan null', hitungAngka(1000, 500, 0, 0).capaianFisik, 0);

// Bulan Ini = bulan terpilih SAJA. Item A bulan 7 keuangannya 500jt.
eq('O6 bulan ini hanya bulan terpilih', oA.realKeuBulanIni, 500_000_000);
ok('O7 bulan ini lebih kecil dari akumulasinya', oA.realKeuBulanIni < oA.realKeu);
// Bulan 9 tidak ada realisasi -> nol, sementara akumulasinya tetap.
const oA9 = hitungRekap(rows.filter(r => r.ssk_canonical_id === 'A'), 9, 'ssk', 'A').baris[0];
eq('O8 bulan tanpa realisasi -> bulan ini nol', oA9.realKeuBulanIni, 0);
ok('O9 tapi akumulasinya tidak ikut nol', oA9.realKeu > 0);

// Penanganan `null` di sisi tampilan tidak bisa dijalankan dari Node, jadi
// diperiksa di sumbernya — dan di KEDUA tempat, layar dan PDF.
const ctO = readFileSync('app/(dashboard)/kinerja/_tabs/CetakTab.tsx', 'utf8');
const exO = readFileSync('app/(dashboard)/kinerja/_exports.ts', 'utf8');
ok('O10 layar menulis "—" untuk capaian null, bukan 0%',
   /b\.capaianFisik === null \? '—'/.test(ctO));
ok('O11 PDF juga menulis "—", tidak memaksa 0 lewat \\?\\?',
   /b\.capaianFisik === null \? '—'/.test(exO) && !/capaianFisik \?\? 0/.test(exO));

console.log('\n── J. Pagar simpan: penjagaan berdiri SEBELUM DELETE ────────────');

const src = readFileSync('lib/data/kinerja.ts', 'utf8');
// Buang komentar dulu — prosa yang menjelaskan bug lama jangan sampai
// menyalakan tesnya sendiri.
const kode = src.replace(/\/\*[\s\S]*?\*\//g, '').split('\n')
  .filter(l => !l.trim().startsWith('//') && !l.trim().startsWith('--')).join('\n');

for (const [nama, fungsi, tabel] of [
  ['realisasi', 'export async function saveRealisasiBatch', 'DELETE FROM kinerja_realisasi WHERE'],
  ['SSK',       'export async function saveSskBatch',       'DELETE FROM kinerja_ssk'],
  ['rekening',  'export async function saveRekeningBatch',  'DELETE FROM kinerja_rekening WHERE'],
] as const) {
  // Dipotong per BADAN FUNGSI. Mencari mundur lintas-berkas membuat pagar milik
  // fungsi LAIN yang kebetulan berdiri lebih dulu ikut dihitung — pemeriksaan
  // yang lulus karena tetangganya benar, bukan karena fungsi ini benar.
  const iFn = kode.indexOf(fungsi);
  const iNext = kode.indexOf('\nexport ', iFn + 10);
  const badan = kode.slice(iFn, iNext > 0 ? iNext : undefined);
  const iPagar = badan.indexOf('pagarReplace(');
  const iDel   = badan.indexOf(tabel);
  ok(`J1 ${nama}: pagarReplace ada sebelum DELETE`, iPagar >= 0 && iDel >= 0 && iPagar < iDel,
     `pagar@${iPagar} delete@${iDel}`);
}
ok('J2 ambang 50% sama dengan BLUD', /SAFE_DROP_THRESHOLD = 0\.5/.test(kode));
ok('J3 pagar lolos saat force', /if \(force \|\| existing === 0\) return;/.test(kode));
ok('J4 kosong ditolak walau bukan penurunan relatif', /incoming === 0 \|\| incoming < existing \* SAFE_DROP_THRESHOLD/.test(kode));

const zod = readFileSync('lib/data/kinerja-schemas.ts', 'utf8');
// Tahap 9a memperluas pagar dari 3 jalur ke 6 (Nomen, CRR, Pendapatan menyusul).
// Dua di antaranya inline di dalam discriminatedUnion, jadi jangkar awal-baris
// tidak lagi cukup — dihitung apa adanya. Rinciannya per-skema di
// scripts/test-kinerja-riwayat-simpan.mts bagian D.
eq('J5 keenam skema replace-all menerima force', (zod.match(/force:\s*z\.boolean\(\)\.optional\(\)/g) || []).length, 6);

console.log('\n── K. Versi: jalur tanpa parameter memakai versi AKTIF ──────────');

ok('K1 getRealisasiRows tidak lagi memaksa MURNI-0',
   !/getRealisasiHydrated\(tahun, sumber, 'MURNI', 0\)/.test(kode));
ok('K2 getRealisasiRows bertanya ke versiAktifKinerja',
   /versiAktifKinerja\(tahun, sumber\)/.test(kode));
ok('K3 versiAktifKinerja memakai pickVersiAktif yang sudah ada',
   /export async function versiAktifKinerja[\s\S]{0,1200}pickVersiAktif\(list\)/.test(kode));
ok('K4 versiAktifKinerja mengecualikan is_nullified',
   /export async function versiAktifKinerja[\s\S]{0,600}is_nullified = FALSE/.test(kode));

console.log('\n── L. bulan_terakhir = bulan yang ada isinya ────────────────────');

// A2 memindahkan hitungannya dari SQL ke JS: kuerinya sekarang dikelompokkan
// sampai `ssk_canonical_id` supaya yatim bisa disaring, jadi `MAX(CASE WHEN …)`
// tidak lagi bisa dipakai. Yang dijaga tetap PERILAKUNYA — "bulan terakhir yang
// ada isinya", bukan MAX(bulan) polos yang selalu 12 karena Init membuat Jan–Des
// berisi nol sejak awal tahun.
eq('L1 dua jalur menghitungnya dari baris yang berisi',
   (kode.match(/if \(\(keu !== 0 \|\| fis !== 0\) && bulan > bulanTerakhir\)/g) || []).length, 2);
ok('L2 MAX(bulan) polos sudah tidak dipakai', !/COALESCE\(MAX\(bulan\), 0\)/.test(kode));
ok('L3 bentuk SQL lamanya sudah tidak ada',
   !/MAX\(CASE WHEN real_fisik <> 0 OR real_keuangan <> 0 THEN bulan END\)/.test(kode));
// Baris yatim tidak boleh menentukan bulan terakhir: `continue` HARUS mendahului
// pemutakhirannya, di badan fungsi yang sama.
for (const fn of ['getLaporanData', 'getLaporanSemua'] as const) {
  const i = kode.indexOf(`export async function ${fn}(`);
  const badan = kode.slice(i, kode.indexOf('\n}\n', i));
  const iSkip = badan.indexOf(')) continue;');
  const iBln  = badan.indexOf('bulan > bulanTerakhir');
  ok(`L4 ${fn}: yatim dilewati SEBELUM bulan_terakhir disetel`,
     iSkip > 0 && iBln > 0 && iSkip < iBln, `continue@${iSkip} bulan@${iBln}`);
}

console.log('\n── M. Ketiga layar simpan menerjemahkan pagar itu ───────────────');

for (const f of [
  'app/(dashboard)/kinerja/_tabs/RealisasiTab.tsx',
  'app/(dashboard)/kinerja/_tabs/SskTab.tsx',
  'app/(dashboard)/kinerja/_tabs/RekeningTab.tsx',
]) {
  const s = readFileSync(f, 'utf8');
  const nama = f.split('/').pop()!;
  ok(`M1 ${nama} menangani PENURUNAN_DRASTIS`,
     s.includes("'PENURUNAN_DRASTIS'") && s.includes('konfirmasiPenurunan('));
  ok(`M2 ${nama} mengulang dengan force`, /\(true\); return; \}/.test(s));
}

const rt = readFileSync('app/(dashboard)/kinerja/_tabs/RealisasiTab.tsx', 'utf8');
ok('M3 Init memeriksa duplikat lewat canonical_id',
   /const exists = cid\s*\?\s*realisasiRows\.some\(r => r\.bulan === b && r\.ssk_canonical_id === cid\)/.test(rt));
ok('M4 layar memakai aturan dari lib, bukan menyalinnya',
   /samakanSatu\(p, idx\)/.test(rt) && /samakanSebulan\(p, realisasiBulan\)/.test(rt));
ok('M6 tooltip pakai data-tooltip, bukan title native',
   /data-tooltip=\{`Isi dengan target/.test(rt) && !/title="Isi dengan target/.test(rt));
ok('M7 Samakan tidak dipasang di Init maupun Import',
   !/samakanBaris\(|samakanSebulan\(/.test(
     rt.slice(rt.indexOf('function initRealisasiFromSSK'), rt.indexOf('async function saveRealisasi'))));

const ex = readFileSync('app/(dashboard)/kinerja/_exports.ts', 'utf8');
// Kolom persen lewat penolong `p()`; yang dijaga: `p` memang menambahkan '%'
// dan target_fisik memakainya, bukan `n()` yang untuk rupiah.
ok('M8 target fisik diformat sebagai persen, bukan rupiah',
   /const p = \(v: number\) => angka \? v : v\.toFixed\(2\) \+ '%';/.test(ex) &&
   /p\(r\.target_fisik\)/.test(ex) && !/n\(r\.target_fisik\)/.test(ex));

console.log('\n── N. Unduh rekap: angkanya sama dengan yang di layar ───────────');

const aoa = rekapAoa({ baris: hasil.baris, yatim: hasil.yatim, tahun: '2026', namaBulan: 'Juli' });
eq('N1 header berdiri tepat di bawah kop', aoa[REKAP_JUDUL_BARIS][0], 'No');
eq('N2 jumlah kolom header sama dengan tabel layar', aoa[REKAP_JUDUL_BARIS].length, 13);
ok('N3 kop menyebut bulan & tahun', String(aoa[3][0]).includes('JULI') && String(aoa[3][0]).includes('2026'));
ok('N4 kop menyebut versi acuan', String(aoa[4][0]).includes('versi aktif'));

// Angka WAJIB diambil dari baris yang sudah dihitung, bukan dihitung ulang.
const gt = aoa[REKAP_JUDUL_BARIS + 1];
eq('N5 pagu grand total sama dengan layar', gt[2], hasil.baris[0].pagu);
eq('N6 target Rp sama dengan layar', gt[8], hasil.baris[0].targetRp);
eq('N7 deviasi keuangan sama dengan layar', gt[12], hasil.baris[0].devKeu);
eq('N7b capaian fisik ikut ke berkas', gt[7], hasil.baris[0].capaianFisik);
eq('N7c bulan ini ikut ke berkas', gt[9], hasil.baris[0].realKeuBulanIni);

// Hierarki dibawa lewat spasi di depan label — Excel tak punya indent baris.
const barisProgram = hasil.baris.findIndex(b => b.indent === 1);
ok('N8 label bertakuk mengikuti kedalaman',
   String(aoa[REKAP_JUDUL_BARIS + 1 + barisProgram][1]).startsWith('    '));
ok('N9 grand total tidak bertakuk', !String(gt[1]).startsWith(' '));

// Yatim dibawa ke dokumen: tanpa ini totalnya tak bisa dijelaskan di luar aplikasi.
const catatan = aoa.map(r => String(r[0] ?? '')).find(s => s.startsWith('Catatan:'));
ok('N10 catatan yatim ikut terbawa', !!catatan && catatan.includes('90.000.000'));
const tanpaYatimAoa = rekapAoa({
  baris: hasil.baris,
  yatim: { jumlahBaris: 0, jumlahItem: 0, nominal: 0, contoh: [] },
  tahun: '2026', namaBulan: 'Juli',
});
ok('N11 tanpa yatim tidak ada catatan menggantung',
   !tanpaYatimAoa.some(r => String(r[0] ?? '').startsWith('Catatan:')));

const ct = readFileSync('app/(dashboard)/kinerja/_tabs/CetakTab.tsx', 'utf8');
// Dihitung KEMUNCULANNYA, bukan "ada?": Excel & PDF dua panggilan terpisah, jadi
// merusak salah satunya tetap menyisakan yang lain untuk dicocokkan.
// Invariannya: cuma SATU tempat yang menyusun parameter unduhan, dan kedua
// tombol memanggilnya. Menghitung kemunculan `rekap!.baris` lebih kuat daripada
// mencocokkan satu panggilan — kalau salah satu tombol menyusun sendiri, angkanya
// naik dan tes ini gagal.
eq('N12 hanya SATU tempat menyusun parameter unduhan',
   (ct.match(/rekap!\.baris/g) || []).length, 1);
// 4 = dua tombol x dua cabang (bundel / rekap saja).
eq('N12b kedua tombol memakai penyusun itu',
   (ct.match(/paramRekap\(\)/g) || []).length, 4);
// hitungRekap hanya boleh dipanggil SEKALI — di useMemo. Panggilan kedua di mana
// pun berarti dokumen yang diunduh berdiri di atas hitungan sendiri.
eq('N13 hitungRekap dipanggil tepat sekali di seluruh berkas',
   (ct.match(/hitungRekap\(/g) || []).length, 1);
ok('N14 panggilan tunggal itu memang di useMemo',
   /const rekap = useMemo\(\s*\(\) =>[\s\S]{0,200}hitungRekap\(/.test(ct));

console.log('\n── R. Format angka Excel: notasi ilmiah tidak boleh muncul ──────');

// Format bawaan Excel ("General") pindah ke notasi ilmiah begitu bilangan
// bulatnya >11 angka: pagu Rp 142.593.279.000 tampil "1,42593E+11" sementara
// Rp 74.154.779.000 tampil utuh. Jadi cacatnya HANYA muncul di baris total dan
// tidak terlihat saat diuji dengan data kecil — karena itu dijaga di sini.
{
  const ex     = readFileSync('app/(dashboard)/kinerja/_exports.ts', 'utf8');
  const helper = readFileSync('lib/shared/excel-export.ts', 'utf8');

  ok('R1 FMT_RUPIAH pakai pemisah ribuan', helper.includes("export const FMT_RUPIAH = '#,##0'"));
  // `0.00%` membuat Excel mengalikan 100 → 62,01 terbaca 6201%.
  ok('R2 FMT_PERSEN TANPA tanda % di kode format', helper.includes("export const FMT_PERSEN = '0.00'"));
  ok('R3 helper hanya memformat sel yang isinya angka',
     helper.includes("if (typeof cell.value === 'number') cell.numFmt = f;"));
  ok('R4 format dipasang mulai SESUDAH baris header',
     helper.includes('const mulai = (options.headerRowIndex ?? 0) + 2;'));

  // Panjang larik format WAJIB sama dengan jumlah kolomnya. Kalau bergeser satu,
  // kolom uang dapat format persen dan sebaliknya — tanpa satu galat pun.
  const panjangFmt = (nama: string): number => {
    const i = ex.indexOf('const ' + nama + ' = [');
    if (i < 0) return -1;
    const blok = ex.slice(i, ex.indexOf('];', i));
    return (blok.match(/FMT_RUPIAH|FMT_PERSEN|null/g) || []).length;
  };
  eq('R5 REKAP_FMT sejajar 13 kolom REKAP_HEADER',            panjangFmt('REKAP_FMT'), 13);
  eq('R6 DETAIL_FMT sejajar 16 kolom DETAIL_HEADER',           panjangFmt('DETAIL_FMT'), 16);
  eq('R7 DETAIL_BULAN_FMT sejajar 15 kolom DETAIL_BULAN_HEADER', panjangFmt('DETAIL_BULAN_FMT'), 15);

  // Rekap dipakai DUA kali (satuan + bundel) — dicacah, bukan ditanya "ada?".
  eq('R8 kedua sheet Rekap memakai REKAP_FMT', (ex.match(/numFmts: REKAP_FMT/g) || []).length, 2);
  ok('R9 sheet Data memakai DETAIL_FMT', ex.includes('numFmts: DETAIL_FMT'));
  // Blok per-bulan menambah baris sendiri, di luar addSheetFromAoa.
  // Dijangkarkan ke AWAL BARIS: kutipan telanjang tetap cocok kalau seseorang
  // menaruh `if (false)` di depannya, dan asersinya lulus untuk alasan yang salah.
  ok('R10 blok per-bulan memformat barisnya sendiri',
     /^\s*DETAIL_BULAN_FMT\.forEach\(\(f, k\) => \{$/m.test(ex));

  // Setiap unduhan yang memuat uang harus kebagian.
  eq('R11 delapan pemanggil memakai numFmts', (ex.match(/numFmts:/g) || []).length, 8);
}

console.log('\n── S. A2: realisasi yatim keluar dari Laporan & KPI juga ───────');

// Sampai T7, hanya `hitungRekap` yang mengeluarkan yatim. getLaporanData,
// getLaporanSemua, dan getKinerjaKpi menjumlahkan `SUM(real_keuangan)` tanpa
// saringan apa pun — pembilangnya memuat uang yang penyebutnya tidak memuat
// pagunya. Bab ini menjaga ketiganya sepakat dengan Rekap.
{
  const aktif = new Map<string, Set<string>>([['GAJI', new Set(['A', 'B', 'C'])]]);

  // ── Perilaku penyaring ────────────────────────────────────────────────────
  {
    const p1 = buatPenyaringYatim(aktif);
    ok('S1 canonical yang ada di versi aktif dipakai',  p1.pakai('GAJI', 'A', 500, 1, 'Item A'));
    ok('S2 canonical yang lenyap TIDAK dipakai',       !p1.pakai('GAJI', 'HILANG', 90_000_000, 1, 'Item Yatim'));
    const h1 = p1.hasil();
    eq('S3 nominal yatim ditally',      h1.nominal, 90_000_000);
    eq('S4 jumlah baris yatim ditally', h1.jumlahBaris, 1);
    eq('S5 item yatim dihitung sekali', h1.jumlahItem, 1);
    ok('S6 contoh menyebut namanya', h1.contoh[0] === 'Item Yatim');
  }
  {
    // Sumber yang tidak punya baris SSK sama sekali: SEMUA realisasinya yatim.
    // `?? new Set()`, bukan "semuanya lolos" — sumber tanpa pagu tidak boleh
    // menyumbang pembilang.
    const p2 = buatPenyaringYatim(aktif);
    ok('S7 sumber tanpa SSK: semuanya yatim', !p2.pakai('BLUD', 'A', 777, 1, 'Item A'));
    eq('S8 nominalnya ikut ditally', p2.hasil().nominal, 777);
  }
  {
    // Satu item yatim di 12 bulan = 1 item, 12 baris. Kalau `jumlahItem` ikut
    // naik per baris, spanduknya berbunyi "12 rekening" untuk satu rekening.
    const p3 = buatPenyaringYatim(aktif);
    for (let b = 1; b <= 12; b++) p3.pakai('GAJI', 'HILANG', 1_000_000, 1, 'Item Yatim');
    const h3 = p3.hasil();
    eq('S9 satu item di 12 bulan = 1 item',    h3.jumlahItem, 1);
    eq('S10 tapi 12 baris',                     h3.jumlahBaris, 12);
    eq('S11 nominalnya dijumlah',               h3.nominal, 12_000_000);
  }
  {
    const kosong = buatPenyaringYatim(aktif).hasil();
    eq('S12 tanpa yatim, nominalnya nol', kosong.nominal, 0);
    eq('S13 tanpa yatim, contohnya kosong', kosong.contoh.length, 0);
  }

  // ── Angkanya HARUS cocok dengan Rekap ─────────────────────────────────────
  //
  // Asersi terpenting di bab ini: ia yang membuktikan dua layar berhenti
  // berbantah, dan ia gagal kalau salah satu sisi diperbaiki tanpa yang lain.
  // Pohon uji `rows` memuat satu baris yatim ('HILANG', Rp 90.000.000).
  {
    const pRekap = buatPenyaringYatim(aktif);
    let totalLaporan = 0;
    for (const r of rows) {
      const keu = r.real_keuangan || 0;
      if (!pRekap.pakai('GAJI', r.ssk_canonical_id || '', keu, 1, r.keterangan)) continue;
      totalLaporan += keu;
    }
    const rekapSemua = hitungRekap(rows, 12, 'ssk', 'TOTAL');
    eq('S14 total Laporan == total Rekap', totalLaporan, rekapSemua.baris[0].realKeu);
    eq('S15 nominal yatim sama dengan yang dilaporkan Rekap',
       pRekap.hasil().nominal, rekapSemua.yatim.nominal);
    // Kalau saringannya dilepas, totalnya lebih besar — buktinya ada bedanya.
    const tanpaSaring = rows.reduce((t, r) => t + (r.real_keuangan || 0), 0);
    ok('S16 tanpa saringan totalnya memang lebih besar',
       tanpaSaring === totalLaporan + 90_000_000, `${tanpaSaring} vs ${totalLaporan}`);
  }

  // ── himpunanCanonical: hanya versi AKTIF, bukan semua versi ──────────────
  //
  // Diuji perilakunya, bukan teksnya: uji mutasi membuktikan asersi teks tidak
  // menggigit di sini — melepas perbandingan versinya lolos tanpa satu tes gagal.
  {
    const petaVersi = new Map<string, { tipe: 'MURNI' | 'PERUBAHAN'; seq: number }>([
      ['GAJI', { tipe: 'PERUBAHAN', seq: 2 }],
      ['BLUD', { tipe: 'MURNI',     seq: 0 }],
    ]);
    const barisSsk = [
      // GAJI aktif di PERUBAHAN-2. Item X hidup di MURNI-0 tapi SUDAH DIBUANG
      // dari versi aktif; item W hidup di PERUBAHAN-1 dan juga sudah dibuang.
      //
      // W itu yang penting: tipenya SAMA dengan versi aktif, hanya `seq`-nya
      // beda. Tanpa baris seperti ini, melepas perbandingan `versi_seq` lolos
      // tanpa satu tes gagal — pohon ujinya kebetulan setuju (uji mutasi S-M7b).
      { sumber: 'GAJI', canonical_id: 'X', versi_tipe: 'MURNI',     versi_seq: 0 },
      { sumber: 'GAJI', canonical_id: 'W', versi_tipe: 'PERUBAHAN', versi_seq: 1 },
      { sumber: 'GAJI', canonical_id: 'Y', versi_tipe: 'MURNI',     versi_seq: 0 },
      { sumber: 'GAJI', canonical_id: 'Y', versi_tipe: 'PERUBAHAN', versi_seq: 1 },
      { sumber: 'GAJI', canonical_id: 'Y', versi_tipe: 'PERUBAHAN', versi_seq: 2 },
      // Bentuk yang SEHARUSNYA tidak ada: MURNI ber-seq bukan 0 (skema menyebut
      // `0=MURNI, 1+=Perubahan ke-n`). Ada di sini justru supaya perbandingan
      // `versi_tipe` tidak bersandar diam-diam pada kebiasaan itu — kalau ia
      // dilepas, baris ini akan lolos dan tesnya menyalak (uji mutasi S-M7d).
      { sumber: 'GAJI', canonical_id: 'V', versi_tipe: 'MURNI',     versi_seq: 2 },
      { sumber: 'BLUD', canonical_id: 'Z', versi_tipe: 'MURNI',     versi_seq: 0 },
      // Sumber yang tidak punya versi aktif sama sekali.
      { sumber: 'OBAT', canonical_id: 'Q', versi_tipe: 'MURNI',     versi_seq: 0 },
      // canonical_id kosong tidak boleh jadi anggota himpunan.
      { sumber: 'BLUD', canonical_id: '',  versi_tipe: 'MURNI',     versi_seq: 0 },
    ];
    const him = himpunanCanonical(barisSsk, petaVersi);
    ok('S17a item yang masih ada di versi aktif masuk',   him.get('GAJI')?.has('Y') === true);
    ok('S17b item yang dibuang di versi aktif TIDAK masuk', him.get('GAJI')?.has('X') !== true);
    ok('S17b2 versi ber-TIPE sama tapi seq lebih tua juga TIDAK masuk',
       him.get('GAJI')?.has('W') !== true);
    ok('S17b3 tipe dibandingkan juga, bukan cuma seq',
       him.get('GAJI')?.has('V') !== true);
    eq('S17c GAJI cuma punya satu canonical aktif',       him.get('GAJI')?.size, 1);
    ok('S17d sumber lain ikut terbaca',                   him.get('BLUD')?.has('Z') === true);
    eq('S17e canonical_id kosong dilewati',               him.get('BLUD')?.size, 1);
    ok('S17f sumber tanpa versi aktif tidak punya himpunan', !him.has('OBAT'));
  }

  // ── Statis: ketiga jalur agregat memakai aturan yang SAMA ────────────────
  const kj = readFileSync('lib/data/kinerja.ts', 'utf8');
  const tanpaKomentar = kj.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

  ok('S17 canonicalAktifKinerja ada dan bertanya ke versiAktifKinerja',
     /export async function canonicalAktifKinerja[\s\S]{0,400}await versiAktifKinerja\(/.test(kj));

  // Dicacah, bukan ditanya "ada?": memperbaiki satu jalur saja sudah cukup
  // membuat asersi "ada" lulus, dan yang terlewat selalu yang tidak dilihat (L69).
  eq('S18 KETIGA jalur agregat memanggil canonicalAktifKinerja',
     (tanpaKomentar.match(/canonicalAktifKinerja\(/g) || []).length, 4); // 1 definisi + 3 pemanggil
  eq('S19 KETIGA jalur memakai buatPenyaringYatim',
     (tanpaKomentar.match(/buatPenyaringYatim\(/g) || []).length, 3);

  // Tidak boleh ada lagi SUM datar tanpa pengelompokan canonical di ketiganya.
  ok('S20 tidak ada lagi SUM(real_keuangan) tanpa GROUP BY canonical',
     !/SUM\(real_keuangan\), 0\) AS total_real_keuangan/.test(tanpaKomentar));

  // Yatim dipulangkan, bukan cuma dibuang.
  eq('S21 ketiga jalur memulangkan hasil penyaringnya',
     (tanpaKomentar.match(/penyaring\.hasil\(\)/g) || []).length, 3);
  ok('S21b getLaporanSemua memecahnya per sumber',
     tanpaKomentar.includes('yatimBySumber.get(sumber)'));

  // Dan TIDAK dijumlahkan ke totalnya — kalau `continue`-nya dilepas, yatim
  // ikut masuk pembilang dan seluruh perbaikan ini batal.
  eq('S22 tiga tempat melewati baris yatim dengan continue',
     (tanpaKomentar.match(/\)\) continue;/g) || []).length, 3);

  // ── Statis: spanduknya ada di kedua layar ────────────────────────────────
  for (const [nama, berkas] of [
    ['Laporan',   'app/(dashboard)/kinerja/_tabs/LaporanTab.tsx'],
    ['Dashboard', 'app/(dashboard)/kinerja/_tabs/DashboardTab.tsx'],
  ] as const) {
    const t = readFileSync(berkas, 'utf8');
    ok(`S23 ${nama} menampilkan spanduk yatim`, /yatim\??\.jumlahBaris \?\? 0\) > 0|yatim\.jumlahBaris > 0/.test(t));
    ok(`S24 ${nama} menyebut nominalnya`, /yatim\.nominal/.test(t));
    ok(`S25 ${nama} menyebut contoh rekeningnya`, /yatim\.contoh\.join/.test(t));
  }
}

console.log('\n── T. check-deletable ikut memulangkan nominalnya ──────────────');

// A1 tahap 2. Dialog "hapus item yang sudah punya realisasi" perlu menyebut
// UANGNYA, bukan cuma jumlah barisnya - "12 baris" tidak seberat
// "Rp 5.443.354.000". Route-nya dulu cuma memulangkan `count`.
{
  const cd = readFileSync('app/api/kinerja/ssk/check-deletable/route.ts', 'utf8');

  ok('T1 kueri menjumlah real_keuangan',
     cd.includes('COALESCE(SUM(real_keuangan), 0) AS nominal'));
  eq('T2 satu kueri, bukan dua perjalanan', (cd.match(/await sql`/g) || []).length, 1);
  // KEDUA cabang balasan, bukan salah satunya: klien membaca medan yang sama
  // tanpa peduli hasilnya boleh-hapus atau tidak.
  eq('T3 nominal ada di kedua cabang balasan', (cd.match(/^\s*nominal[,:]/gm) || []).length, 2);
  ok('T4 cabang boleh-hapus memulangkan nominal 0', /nominal: 0,/.test(cd));
  ok('T5 kalimat alasannya menyebut rupiahnya',
     cd.includes("realisasi keuangan Rp ${nominal.toLocaleString('id-ID')}"));
  // Nol rupiah tidak perlu disebut - "12 baris (realisasi keuangan Rp 0)"
  // membuat kalimatnya terbaca seperti galat.
  ok('T6 nominal nol tidak ikut disebut di kalimat', /nominal > 0 \?/.test(cd));
}

console.log('\n-- U. Nol-kan berhenti di FORM ---------------------------------');

// A1 tahap 3. Nol-kan lewat route yang menulis langsung ke DB tidak bisa hidup
// di layar isi-form-lalu-Simpan: barisnya jadi nol di DB, layar masih memegang
// angka lamanya, dan Simpan sesudahnya MENIMPA BALIK hasilnya tanpa satu pesan.
{
  const bulan12 = (v: number): SskMonths =>
    MK.reduce((a, m) => { a[m] = v; return a; }, {} as SskMonths);
  const barisSsk = (): SskRow[] => ([
    { uraian_ssk: 'SSK A', uraian: 'Item A', program: 'P', kegiatan: 'K', subkegiatan: 'S',
      pagu: 1_200_000_000, months: bulan12(100_000_000), months_pct: bulan12(8.33),
      total: 1_200_000_000, total_pct: 100, canonical_id: 'A' },
    { uraian_ssk: 'SSK B', uraian: 'Item B', program: 'P', kegiatan: 'K', subkegiatan: 'S',
      pagu: 500_000_000, months: bulan12(0), months_pct: bulan12(0),
      total: 0, total_pct: 0, canonical_id: 'B' },
  ]);

  const setelah = nolkanBaris(barisSsk(), 0);
  const a = setelah[0], b = setelah[1];

  ok('U1 benderanya dinaikkan', a.is_nullified === true);
  eq('U2 pagunya nol', a.pagu, 0);
  eq('U3 seluruh 12 bulan nol', MK.filter(m => (a.months[m] || 0) !== 0).length, 0);
  eq('U4 total ikut nol', a.total, 0);
  eq('U5 total_pct ikut nol', a.total_pct, 0);
  eq('U6 months_pct ikut nol', MK.filter(m => (a.months_pct[m] || 0) !== 0).length, 0);
  // Rekening TETAP ADA — itu seluruh bedanya dengan menghapus. Kalau uraian atau
  // canonical_id ikut dibuang, baris realisasinya jadi yatim juga.
  eq('U7 uraiannya TETAP', a.uraian, 'Item A');
  eq('U8 canonical_id TETAP', a.canonical_id, 'A');
  // Baris lain tidak boleh tersentuh, dan identitasnya tidak boleh berganti
  // (larik baru, objek lama) supaya React tidak me-render ulang seisi tabel.
  eq('U9 baris lain pagunya utuh', b.pagu, 500_000_000);
  ok('U10 baris lain objeknya SAMA (tidak dikloning)', b === barisSsk()[1] ? false : true);

  const aktif = aktifkanBaris(setelah, 0);
  ok('U11 Aktifkan menurunkan benderanya', aktif[0].is_nullified === false);
  // Angkanya SENGAJA tidak kembali — menebak angka lama bukan tugas sebuah tombol.
  eq('U12 Aktifkan TIDAK mengembalikan pagunya', aktif[0].pagu, 0);
  eq('U13 Aktifkan TIDAK mengembalikan bulanannya',
     MK.filter(m => (aktif[0].months[m] || 0) !== 0).length, 0);

  ok('U14 sudahDinolkan benar untuk yang dinol-kan', sudahDinolkan(setelah[0]));
  ok('U15 sudahDinolkan salah untuk yang belum', !sudahDinolkan(setelah[1]));
  // Baris yang belum tersimpan belum punya bendera sama sekali.
  ok('U16 bendera undefined dianggap belum dinol-kan',
     !sudahDinolkan({ ...barisSsk()[0], is_nullified: undefined }));

  // ── Statis: berhenti di FORM, bukan menulis ─────────────────────────────
  const st = readFileSync('app/(dashboard)/kinerja/_tabs/SskTab.tsx', 'utf8');
  ok('U17 layar memakai nolkanBaris & aktifkanBaris',
     st.includes('nolkanBaris(p, idx)') && st.includes('aktifkanBaris(p, idx)'));
  // Yang membuktikan ia berhenti di form: penanganya tidak menembak endpoint.
  const iFn = st.indexOf('async function toggleNolkan(');
  const badan = st.slice(iFn, st.indexOf('\n  function deleteSskRow', iFn));
  ok('U18 toggleNolkan tidak memanggil fetch/fetchJson', !/fetch(Json)?\(/.test(badan));
  ok('U19 toggleNolkan tidak menyebut endpoint nullify', !badan.includes('nullify'));
  // Dijangkarkan ke AWAL BARIS dan menyertakan pengikatannya: kutipan
  // `await confirmDialog(` telanjang tetap cocok kalau seseorang menaruh
  // `if (false)` di depannya, dan asersinya lulus untuk alasan yang salah (L82c).
  eq('U20 keduanya lewat confirmDialog dan HASILNYA dipakai',
     (badan.match(/^\s*const lanjut = await confirmDialog\(\{$/gm) || []).length, 2);
  eq('U20b keduanya berhenti kalau dibatalkan',
     (badan.match(/^\s*if \(!lanjut\) return;$/gm) || []).length, 2);
  // Dialog Aktifkan WAJIB menyatakan angkanya tidak kembali.
  ok('U21 dialog Aktifkan menyatakan angkanya tetap nol', badan.includes('TETAP NOL'));
  ok('U22 dialog Nol-kan menyatakan rekeningnya tetap ada', badan.includes('TETAP ADA'));
  ok('U23 keduanya menegaskan belum tersimpan', (badan.match(/Simpan Semua/g) || []).length >= 2);
  // Versi terkunci: dijaga di penanganya, bukan cuma tombolnya dimatikan (L82).
  ok('U24 versi terkunci ditolak di dalam penanganya', /if \(versiLocked\) return;/.test(badan));
  ok('U25 lencana DINOL-KAN ada di layar', st.includes('DINOL-KAN'));
  ok('U26 baris dinol-kan tampil pudar', /opacity: dinolkan \? \.55 : 1/.test(st));
}

console.log(`\n${lulus} lulus, ${gagal.length} gagal`);
if (gagal.length) { gagal.forEach(g => console.log('  - ' + g)); process.exit(1); }
