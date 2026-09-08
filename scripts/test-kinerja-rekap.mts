// scripts/test-kinerja-rekap.mts — regresi pembenahan perhitungan E-Anggaran.
// Jalankan: npx tsx scripts/test-kinerja-rekap.mts
//
// Konsep: docs/CONCEPT-kinerja-perbaikan-perhitungan.md
//
// Pohon uji SENGAJA memakai pagu yang tidak habis dibagi 12 dan nilai bulanan
// yang persennya jatuh di batas pembulatan. Tanpa itu, bagian C/F/G/K/L semuanya
// lulus tanpa menguji apa pun — selisih 0,01 tidak akan pernah muncul.

import { readFileSync, existsSync } from 'node:fs';
import { letakTip } from '../lib/shared/tip-posisi';import { recalcAllRealisasiServer, type RealRowRaw } from '../lib/data/kinerja-calc';
import { hitungRekap, kumpulkanItem, hitungAngka, jumlahkan, laporanYatim,
  targetSampai, type ItemSskAktif } from '../lib/kinerja/rekap';
import { recalcAllRealisasi } from '../app/(dashboard)/kinerja/_utils';
import { bisaSamakan, ringkasSamakan, samakanSatu, samakanSebulan } from '../lib/kinerja/samakan-target';
import { rekapAoa, REKAP_JUDUL_BARIS, realisasiAoa, DETAIL_HEADER,
  DETAIL_BULAN_HEADER, barisBulanDetail, PENANDA_TANGAN } from '../app/(dashboard)/kinerja/_exports';
import { hitungJumlahBulan, bulanBerdata } from '../lib/kinerja/cetak-detail';
import { buatPenyaringYatim, himpunanCanonical } from '../lib/kinerja/yatim';
import { pickVersiAktif, pilihVersiAgregat, versiUntukPilihan, labelVersi,
  ringkasVersiRekap, imbuhanBerkasVersi, namaBerkasRekap,
  sumberTanpaVersi } from '../lib/kinerja/versi';
import { hidrasiDariSsk, hidrasiUlang, petaHidrasi,
  type BarisSskAcuan } from '../lib/kinerja/hidrasi-ssk';
import { punyaAnak, alasanTolakGantiNama, pesanTolakGantiNama } from '../lib/kinerja/master-nama';
import { nolkanBaris, aktifkanBaris, sudahDinolkan,
  perluPeriksaHapus, pesanHapusSsk, hitungDinolkan } from '../lib/kinerja/nol-kan';
import type { RealRow, SskRow, SskMonths } from '../app/(dashboard)/kinerja/_types';

/**
 * Buang komentar BARIS dan BLOK sebelum pemeriksaan "tidak boleh ada lagi".
 *
 * Tanpa yang blok, prosa JSDoc yang MENJELASKAN cacat lama ikut terbaca sebagai
 * cacat itu sendiri, dan tesnya gagal karena kalimat yang menerangkannya —
 * bukan karena kodenya. Terjadi pada tiga pemeriksaan bab AF sekaligus (L82c
 * lewat pintu lain). Bagian Y sudah memakai bentuk yang sama secara lokal;
 * di sini ia jadi fungsi supaya tidak disalin lagi.
 */
function bersihkanKomentar(teks: string): string {
  return teks.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
}

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

// A8: Rekap menyemai itemnya dari SSK, jadi pohon uji butuh sisi SSK-nya juga.
// Hierarkinya SENGAJA sama dengan yang ditulis `baris()` ke baris realisasi —
// kalau berbeda, bagian H (kedalaman pohon) akan gagal karena alasan yang salah.
const ITEM_SSK: ItemSskAktif[] = [
  { canonical_id: 'A', program: 'Program 1', kegiatan: 'Kegiatan 1', subkegiatan: 'Sub 1',
    uraian_ssk: 'SSK A', uraian: 'Item A', pagu: PAGU_A, months: bulanan(BULAN_A) },
  { canonical_id: 'B', program: 'Program 1', kegiatan: 'Kegiatan 1', subkegiatan: 'Sub 1',
    uraian_ssk: 'SSK B', uraian: 'Item B', pagu: PAGU_B, months: bulanan(BULAN_B) },
  { canonical_id: 'C', program: 'Program 1', kegiatan: 'Kegiatan 1', subkegiatan: 'Sub 1',
    uraian_ssk: 'SSK C', uraian: 'Item C', pagu: 0, months: bulanan(0) },
];
const itemA = ITEM_SSK.filter(i => i.canonical_id === 'A');

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

const hasil = hitungRekap(rows, ITEM_SSK, 7, 'ssk', 'TOTAL');
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
const hBolong = hitungRekap(bolong, ITEM_SSK, 7, 'ssk', 'TOTAL');
eq('E1 pagu tetap utuh walau bulan 7 bolong', hBolong.baris[0].pagu, PAGU_A + PAGU_B);
eq('E2 realisasi B 6 bulan ikut terhitung',
   hBolong.baris[0].realKeu, 500_000_000 * 7 + 2_500_000_000 * 6);

console.log('\n── F. Rekap: baris kembar dilaporkan, pagu tidak dobel ──────────');

const kembar = [...rows, ...rows.filter(r => r.ssk_canonical_id === 'B' && r.bulan === 3)];
const hKembar = hitungRekap(kembar, ITEM_SSK, 7, 'ssk', 'TOTAL');
eq('F1 pagu tidak ikut berlipat', hKembar.baris[0].pagu, PAGU_A + PAGU_B);
eq('F2 kekembaran dilaporkan', hKembar.dobel.jumlahItem, 1);
ok('F3 contoh menyebut rekeningnya', hKembar.dobel.contoh[0] === 'Item B');
eq('F4 pohon bersih tidak melaporkan kembar', hasil.dobel.jumlahItem, 0);

console.log('\n── G. Rekap: yatim dilaporkan, tidak menaikkan persen ───────────');

eq('G1 yatim terhitung', hasil.yatim.jumlahBaris, 1);
eq('G2 nominal yatim disebut', hasil.yatim.nominal, 90_000_000);
const tanpaYatim = rows.filter(r => !r.yatim);
eq('G3 total keuangan tidak memuat yatim',
   total.realKeu, jumlahkan(kumpulkanItem(tanpaYatim, ITEM_SSK, 7).items).realKeu);
ok('G4 yatim memang punya uang', hasil.yatim.nominal > 0);

console.log('\n── H. Rekap: kedalaman & bentuk baris ───────────────────────────');

const hProgram = hitungRekap(rows, ITEM_SSK, 7, 'program', 'TOTAL');
eq('H1 kedalaman program = grand total + 1 program', hProgram.baris.length, 2);
const hFull = hitungRekap(rows, ITEM_SSK, 7, 'full', 'TOTAL');
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
const oA = hitungRekap(rows.filter(r => r.ssk_canonical_id === 'A'), itemA, 7, 'ssk', 'A').baris[0];
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
const oA9 = hitungRekap(rows.filter(r => r.ssk_canonical_id === 'A'), itemA, 9, 'ssk', 'A').baris[0];
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
// Badan fungsinya dipotong dulu, bukan dicocokkan lintas-berkas: pemeriksaan
// yang menjangkau ke luar akan menemukan pagar milik fungsi LAIN lalu lulus
// untuk alasan yang salah.
const blokVersiAktif = (() => {
  const i = kode.indexOf('export async function versiAktifKinerja');
  if (i < 0) return '';
  // Batasnya deklarasi berikutnya, BUKAN jumlah karakter tetap: dengan 1800
  // karakter jendelanya menjulur ke `canonicalAktifKinerja` yang saringannya
  // memang masih ada — dan pemeriksaannya jadi gagal menuduh fungsi yang benar.
  const j = kode.indexOf('export async function canonicalAktifKinerja', i + 10);
  // Kalau penanda batasnya hilang (fungsinya diganti nama), jendelanya
  // dikosongkan supaya pemeriksaannya GAGAL BERSUARA — jendela yang menjulur
  // diam-diam ke fungsi tetangga itu yang membuat pemeriksaan ini keliru
  // menuduh fungsi yang sudah benar.
  return j < 0 ? '' : kode.slice(i, j);
})();
ok('K3 versiAktifKinerja memakai satu aturan versi yang sudah ada',
   /pilihVersiAgregat\(list\)/.test(blokVersiAktif));
ok('K3b dan aturannya tidak ditulis ulang di lib/data',
   !/=== 'PERUBAHAN' \? 1 : 0/.test(kode));
// A9 MEMBALIK pemeriksaan lama di sini, dan itu disengaja. Dulu: "wajib
// menyaring is_nullified". Sekarang: saringan itu justru yang membuat versi
// habis-dinol-kan lenyap dari daftar calon sehingga versi SEBELUMNYA terpilih.
// Pemeriksaan lamanya kalau dibiarkan akan LULUS lewat `SUM(CASE WHEN …)` —
// menegaskan perilaku yang sudah salah, tanpa satu pun tanda (L82c).
ok('K4 versiAktifKinerja TIDAK lagi menyaring is_nullified di WHERE-nya',
   blokVersiAktif.length > 0
   && !/WHERE tahun = \$\{tahun\}(?: AND sumber = \$\{sumber\})? AND is_nullified = FALSE/.test(blokVersiAktif));
ok('K4b tapi hitungan barisnya tetap menyaring — angka disaring, calon tidak',
   /SUM\(CASE WHEN is_nullified = FALSE THEN 1 ELSE 0 END\) AS baris_aktif/.test(blokVersiAktif));

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

const aoa = rekapAoa({ baris: hasil.baris, yatim: hasil.yatim,
  tanpaRealisasi: hasil.tanpaRealisasi, sumberDinolkan: [],
  versiRekap: [{ sumber: 'GAJI', tipe: 'PERUBAHAN', seq: 1 }, { sumber: 'BLUD', tipe: 'MURNI', seq: 0 }],
  pilihanVersi: 'berlaku', tahun: '2026', namaBulan: 'Juli' });
eq('N1 header berdiri tepat di bawah kop', aoa[REKAP_JUDUL_BARIS][0], 'No');
eq('N2 jumlah kolom header sama dengan tabel layar', aoa[REKAP_JUDUL_BARIS].length, 13);
ok('N3 kop menyebut bulan & tahun', String(aoa[3][0]).includes('JULI') && String(aoa[3][0]).includes('2026'));
// Menyebut VERSINYA, bukan aturannya: kalimat lama "mengacu SSK versi aktif
// tiap sumber" lulus tanpa memuat satu nomor versi pun, dan begitu versinya
// bisa dipilih di layar Cetak, kalimat seperti itu berubah dari kurang
// informatif menjadi menyesatkan.
ok('N4 kop menyebut versi acuan tiap sumber',
   String(aoa[4][0]).includes('GAJI PERUBAHAN-1') && String(aoa[4][0]).includes('BLUD MURNI'));

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
  tanpaRealisasi: false, sumberDinolkan: [], versiRekap: [], pilihanVersi: 'berlaku', tahun: '2026', namaBulan: 'Juli',
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
    const rekapSemua = hitungRekap(rows, ITEM_SSK, 12, 'ssk', 'TOTAL');
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
  // Seluruh perbaikan ini berdiri di atas satu anggapan: `sskRows` yang diterima
  // tab Realisasi memang milik SUMBER dan VERSI yang sedang dibuka di tab itu -
  // bukan milik tab SSK, yang punya pemilih sumber sendiri (`activeSumber`).
  // Kalau efek ini hilang, hidrasinya memakai SSK sumber lain tanpa satu galat.
  const kc2 = bersihkanKomentar(readFileSync('app/(dashboard)/kinerja/kinerja-client.tsx', 'utf8'));
  ok('Y37 tab Realisasi memuat SSK sumbernya sendiri',
     /activeTab === 'realisasi'\) fetchSsk\(realisasiSumber\)/.test(kc2));
  ok('Y38 dan fetchSsk memakai versi yang sedang dibuka',
     /const vt = versiTipe \?\? sskVersi\.tipe/.test(kc2));

  const kj = readFileSync('lib/data/kinerja.ts', 'utf8');
  const tanpaKomentar = bersihkanKomentar(kj);

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
  // Jendelanya berhenti di penutup fungsi (`\n  }` di kolom 3), BUKAN di tanda
  // tangan fungsi tetangga: patokan begitu pecah begitu tetangganya berubah
  // jadi `async` — dan pecahnya diam-diam MELEBARKAN jendela, sehingga asersi
  // "tidak memanggil fetch" tiba-tiba membaca isi fungsi lain.
  const iFn = st.indexOf('async function toggleNolkan(');
  const badan = st.slice(iFn, st.indexOf('\n  }\n', iFn) + 4);
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

console.log('\n-- V. Hapus baris SSK berpagar ---------------------------------');

// A1 tahap 4. Menghapus baris SSK membuat canonical_id-nya lenyap dari versi
// ini, dan setiap baris realisasi yang menunjuknya jadi YATIM - pagu 0,
// target 0, dan pagarReplace tidak menyalak karena jumlah barisnya cuma turun
// satu (15 -> 14 = 6,7%, jauh di bawah ambang 50%).
{
  const dasar = {
    uraian_ssk: 'SSK A', uraian: 'Belanja Gaji Pokok PNS',
    program: 'P', kegiatan: 'K', subkegiatan: 'S',
    pagu: 0, months: {} as SskMonths, months_pct: {} as SskMonths, total: 0, total_pct: 0,
  } as unknown as SskRow;

  // Baris yang belum tersimpan tidak bisa dirujuk siapa pun - bertanya cuma
  // menambah satu perjalanan dan satu jeda untuk jawaban yang sudah pasti.
  ok('V1 baris tanpa canonical_id tidak perlu diperiksa',
     !perluPeriksaHapus({ ...dasar, canonical_id: undefined }));
  ok('V2 canonical_id string kosong juga tidak perlu',
     !perluPeriksaHapus({ ...dasar, canonical_id: '' }));
  ok('V3 baris tersimpan WAJIB diperiksa',
     perluPeriksaHapus({ ...dasar, canonical_id: 'K-abc-123' }));

  const pesan = pesanHapusSsk('Belanja Gaji Pokok PNS', { count: 12, nominal: 5_443_354_000 });
  ok('V4 menyebut nama itemnya', pesan.includes('"Belanja Gaji Pokok PNS"'));
  ok('V5 menyebut jumlah barisnya', pesan.includes('12 baris realisasi'));
  // Orang bisa menaksir "12 baris" itu sepele; tidak bisa menaksir rupiahnya sepele.
  ok('V6 menyebut NOMINALNYA', pesan.includes('Rp 5.443.354.000'));
  ok('V7 menjelaskan realisasinya tidak ikut terhapus', pesan.includes('TIDAK ikut terhapus'));
  ok('V8 menjelaskan akibatnya di Laporan & Cetak',
     pesan.includes('Laporan') && pesan.includes('Cetak'));
  // Dialog yang cuma menakut-nakuti tanpa menawarkan jalan keluar melatih orang
  // menembusnya. Nol-kan sekarang benar-benar ADA (tahap 3).
  ok('V9 menawarkan Nol-kan sebagai jalan keluar', pesan.includes('Nol-kan'));

  const nol = pesanHapusSsk('Item B', { count: 4, nominal: 0 });
  ok('V10 tetap menyebut jumlah barisnya', nol.includes('4 baris realisasi'));
  // "(realisasi keuangan Rp 0)" terbaca seperti galat, padahal artinya barisnya
  // ada tapi belum diisi uangnya.
  ok('V11 nominal nol TIDAK disebut', !nol.includes('Rp 0'));

  // -- Statis: penanganya benar-benar bertanya, dan membatalkan kalau gagal --
  const st = readFileSync('app/(dashboard)/kinerja/_tabs/SskTab.tsx', 'utf8');
  const iFn = st.indexOf('async function deleteSskRow(');
  ok('V12 deleteSskRow jadi async', iFn > 0);
  const badan = st.slice(iFn, st.indexOf('\n  // Rumus turunan dipusatkan', iFn));

  ok('V13 memanggil check-deletable', badan.includes('/api/kinerja/ssk/check-deletable?'));
  ok('V14 melewati baris yang belum tersimpan',
     /if \(!perluPeriksaHapus\(row\)\) \{ buang\(\); return; \}/.test(badan));
  ok('V15 boleh-hapus lewat tanpa bertanya', /if \(d\.deletable\) \{ buang\(\); return; \}/.test(badan));
  ok('V16 memakai pesanHapusSsk', badan.includes('pesanHapusSsk(nama,'));
  // Dijangkarkan ke awal baris + menyertakan pengikatannya (L82c).
  eq('V17 hasil dialognya dipakai',
     (badan.match(/^\s*const lanjut = await confirmDialog\(\{$/gm) || []).length, 1);
  eq('V18 dibatalkan kalau ditolak', (badan.match(/^\s*if \(!lanjut\) return;$/gm) || []).length, 1);
  // Yang PALING penting: permintaan gagal HARUS membatalkan, bukan meneruskan.
  // Meneruskan dengan asumsi "mungkin aman" adalah cara pagar ini kehilangan
  // gunanya justru di hari tersibuk.
  const iCatch = badan.indexOf('} catch {');
  const blokCatch = badan.slice(iCatch, badan.indexOf('}', badan.indexOf('return;', iCatch)));
  ok('V19 blok catch ada', iCatch > 0);
  ok('V20 catch memulangkan tanpa membuang barisnya',
     blokCatch.includes('return;') && !blokCatch.includes('buang()'));
  ok('V21 catch memberi tahu sebabnya', /toast\.error\(/.test(blokCatch));
  // Versi terkunci dijaga di penanganya, bukan cuma tombolnya dimatikan (L82).
  ok('V22 versi terkunci ditolak di dalam penanganya', /^\s*if \(versiLocked\) return;$/m.test(badan));
  // Jalur buang cuma SATU: kalau ada dua `filter`, salah satunya bisa lolos pagar.
  eq('V23 hanya SATU jalur membuang barisnya',
     (badan.match(/p\.filter\(\(_, i\) => i !== idx\)/g) || []).length, 1);
}

console.log('\n-- W. Route nullify dibuang, jejaknya pindah -------------------');

// A1 tahap 5. Nol-kan berhenti di FORM sejak tahap 3, jadi route yang menulis
// langsung ke DB jadi jalur tulis KEDUA untuk hal yang sama - bentuk yang di
// BLUD sudah melahirkan lubang nyata (L78). Dan route yang ada tapi tidak
// tersambung ADALAH temuan A1; membiarkannya berarti menyisakan jebakan yang
// baru saja dilaporkan.
{
  ok('W1 route ssk/nullify sudah tidak ada',
     !existsSync('app/api/kinerja/ssk/nullify/route.ts'));
  ok('W2 foldernya ikut bersih', !existsSync('app/api/kinerja/ssk/nullify'));

  // Event auditnya ikut dilepas - event yang tidak pernah bisa terbit lagi cuma
  // membuat daftar AuditEventType berbohong tentang apa yang bisa terjadi.
  const al = readFileSync('lib/security/auditlog.ts', 'utf8');
  ok('W3 KINERJA_SSK_NULLIFIED dilepas dari AuditEventType',
     !al.includes('KINERJA_SSK_NULLIFIED'));

  // Tapi PERISTIWANYA tidak boleh ikut hilang: "berapa baris dimatikan" adalah
  // satu-satunya cara menjawab kenapa pagu setahun tiba-tiba mengecil.
  const rt = readFileSync('app/api/kinerja/ssk/route.ts', 'utf8');
  ok('W4 detail Simpan menyebut jumlah yang dinol-kan', rt.includes('dinol-kan)'));
  ok('W5 dihitung dari payloadnya, bukan dikarang', rt.includes('hitungDinolkan(rows)'));
  // Nol tidak disebut - "(0 dinol-kan)" di tiap simpanan biasa cuma bising.
  ok('W6 nol tidak ikut disebut', /hitungDinolkan\(rows\) > 0 \?/.test(rt));
  // Jejak pulihan TIDAK boleh ikut terbuang saat kalimatnya disunting.
  ok('W7 jejak pulihan tetap ada', rt.includes('jejakPulihkan(asal_pulihkan)'));

  const nk = readFileSync('lib/kinerja/nol-kan.ts', 'utf8');
  // Bertipe struktural: pemanggilnya route yang memegang baris hasil Zod, bukan
  // tipe layar. Mengecornya jadi SskRow cuma menyembunyikan bahwa yang
  // dibutuhkan satu medan saja.
  ok('W8 hitungDinolkan bertipe struktural, bukan SskRow[]',
     /hitungDinolkan\(rows: \{ is_nullified\?: boolean \}\[\]\)/.test(nk));

  // Perilakunya.
  eq('W9 menghitung yang benar',
     hitungDinolkan([{ is_nullified: true }, {}, { is_nullified: false }, { is_nullified: true }]), 2);
  eq('W10 larik kosong nol', hitungDinolkan([]), 0);
  // `undefined` bukan `true` - baris yang belum tersimpan belum punya benderanya.
  eq('W11 bendera undefined tidak dihitung', hitungDinolkan([{}, {}]), 0);

  // Tidak boleh ada rujukan yang tertinggal di kode sumber.
  for (const berkas of [
    'app/(dashboard)/kinerja/_tabs/SskTab.tsx',
    'app/(dashboard)/kinerja/_tabs/RealisasiTab.tsx',
    'lib/kinerja/nol-kan.ts',
  ]) {
    const t = bersihkanKomentar(readFileSync(berkas, 'utf8'));
    ok(`W12 ${berkas.split('/').pop()} tidak menyebut endpoint nullify`,
       !t.includes('ssk/nullify'));
  }
}

console.log('\n-- X. A3: ganti nama master memindahkan anaknya -----------------');

// Hierarki master disambung TEKS NAMA (program_ref/kegiatan_ref/subkegiatan_ref
// berisi NAMA induknya), bukan foreign key. `UPDATE ... SET nama = ?` sendirian
// membuat setiap anak menunjuk nama yang sudah tidak ada, dan akibatnya SENYAP:
// cabangnya lenyap dari dropdown berantai tanpa satu galat pun.
{
  // Tipe yang namanya dipikul anak.
  ok('X1 program punya anak',      punyaAnak('program'));
  ok('X2 kegiatan punya anak',     punyaAnak('kegiatan'));
  ok('X3 subkegiatan punya anak',  punyaAnak('subkegiatan'));
  // Daun - tidak ada yang menunjuk namanya di kinerja_master. Kolom teks di
  // kinerja_ssk/kinerja_rekening memang memuatnya, tapi itu SALINAN hasil
  // Inject Rekening, bukan penunjuk hidup (keputusan yang sama di deleteMasterRow).
  ok('X4 uraian_ssk daun',         !punyaAnak('uraian_ssk'));
  ok('X5 sumber_anggaran daun',    !punyaAnak('sumber_anggaran'));

  // Tanpa anak tidak ada yang dipindahkan, jadi tidak ada yang bisa nyasar -
  // menolaknya cuma menghalangi pembetulan salah ketik yang tidak merusak.
  eq('X6 tanpa anak: selalu boleh',              alasanTolakGantiNama(0, 3, 2), null);
  eq('X7 punya anak, nama unik: boleh',          alasanTolakGantiNama(5, 0, 0), null);
  // Saudara masih memikul nama LAMA -> kaskade ikut memindahkan anak MILIK DIA.
  eq('X8 nama lama kembar: DITOLAK',             alasanTolakGantiNama(5, 1, 0), 'lama-kembar');
  // Sesudah ganti nama, anak baris ini dan anak saudara bernama-baru itu
  // menunjuk teks yang sama dan tidak bisa dibedakan lagi.
  eq('X9 nama baru sudah dipakai: DITOLAK',      alasanTolakGantiNama(5, 0, 1), 'baru-kembar');
  // Kalau dua-duanya kembar, yang lama diperiksa lebih dulu: ia yang membuat
  // kaskadenya merusak SEKARANG, bukan nanti.
  eq('X10 dua-duanya kembar: nama lama didahulukan', alasanTolakGantiNama(5, 1, 1), 'lama-kembar');

  const pLama = pesanTolakGantiNama('lama-kembar', 'PROGRAM A', 'PROGRAM B', 7);
  ok('X11 pesan lama-kembar menyebut nama lamanya', pLama.includes('"PROGRAM A"'));
  ok('X12 pesan lama-kembar menyebut jumlah anaknya', pLama.includes('7 baris'));
  ok('X13 pesan lama-kembar menawarkan jalan keluar', pLama.includes('Samakan dulu'));

  const pBaru = pesanTolakGantiNama('baru-kembar', 'PROGRAM A', 'PROGRAM B', 7);
  ok('X14 pesan baru-kembar menyebut nama barunya', pBaru.includes('"PROGRAM B"'));
  ok('X15 pesan baru-kembar menyebut jumlah anaknya', pBaru.includes('7 baris'));
  ok('X16 pesan baru-kembar menyuruh pakai nama lain', pBaru.includes('Pakai nama lain'));

  // -- Statis: kaskadenya benar-benar ada, atomik, dan tidak melebar ---------
  const kj = readFileSync('lib/data/kinerja.ts', 'utf8');
  const iFn = kj.indexOf('export async function updateMasterRow(');
  const badan = kj.slice(iFn, kj.indexOf('\n}\n', iFn));

  ok('X17 dibungkus withTransaction', /await withTransaction\(async \(\{ tx \}\)/.test(badan));
  // Nama lama dibaca di bawah kunci yang sama dengan tulisannya - tanpa itu dua
  // penggantian beruntun saling melewatkan dan kaskade kedua mencari nama yang
  // sudah tidak ada (L55).
  ok('X18 nama lama dibaca FOR UPDATE', /FROM kinerja_master WHERE id = \$\{id\} FOR UPDATE/.test(badan));
  ok('X19 memakai aturan dari lib, bukan disalin',
     badan.includes('alasanTolakGantiNama(') && badan.includes('punyaAnak(tipe)'));
  // TIGA kolom ref, tiga cabang UPDATE. Kalau salah satu terlewat, satu tingkat
  // hierarki tetap putus - dan yang terlewat selalu yang tidak sedang dilihat (L69).
  eq('X20 ketiga kolom ref ikut dikaskade',
     (badan.match(/SET (program_ref|kegiatan_ref|subkegiatan_ref) = \$\{nama\}/g) || []).length, 3);
  // Kaskadenya HANYA di kinerja_master. Kolom teks di kinerja_ssk &
  // kinerja_rekening sengaja tidak disentuh - itu salinan, bukan penunjuk.
  ok('X21 kinerja_ssk TIDAK ikut dikaskade', !badan.includes('UPDATE kinerja_ssk'));
  ok('X22 kinerja_rekening TIDAK ikut dikaskade', !badan.includes('UPDATE kinerja_rekening'));
  // Nama kolom TIDAK dirangkai ke dalam SQL - tiga cabang eksplisit.
  ok('X23 tidak ada nama kolom yang dirangkai ke SQL', !/SET \$\{/.test(badan));
  // Ganti nama ke nama yang sama = tidak melakukan apa pun, bukan kaskade sia-sia.
  ok('X24 nama tidak berubah -> berhenti awal', /if \(namaLama === nama\) return/.test(badan));

  // -- Statis: route & layar ------------------------------------------------
  const rt = readFileSync('app/api/kinerja/master/[id]/route.ts', 'utf8');
  ok('X25 route menerjemahkan NAMA_KEMBAR jadi 400', rt.includes("code: 'NAMA_KEMBAR'"));
  // Nama LAMA ikut dicatat: "id=42 jadi X" tidak memberi tahu X itu tadinya apa,
  // dan justru itu yang dicari saat ada yang mengeluh cabangnya hilang.
  ok('X26 audit mencatat nama lamanya', rt.includes('hasil.nama_lama'));
  ok('X27 audit mencatat jumlah anak yang dipindah', rt.includes('hasil.anak_dipindah'));

  // Komentar dibuang dulu, dan yang dicocokkan INTERPOLASINYA: komentar di atas
  // baris itu memuat frasa "ikut dipindah" juga, jadi kutipan telanjang tetap
  // cocok walau kalimatnya sudah berhenti menyebut angkanya (L82c).
  const mt = bersihkanKomentar(readFileSync('app/(dashboard)/kinerja/_tabs/MasterTab.tsx', 'utf8'));
  ok('X28 layar menyebut BERAPA anak yang ikut dipindah',
     /\$\{ikut\} baris di bawahnya ikut dipindah/.test(mt));
  ok('X28b angkanya dibaca dari balasan server', mt.includes('anak_dipindah'));
  ok('X29 layar menangani NAMA_KEMBAR', mt.includes("=== 'NAMA_KEMBAR'"));
}

console.log('\n-- Y. A4: Pulihkan menghidrasi ulang dari SSK versi terbuka ----');

// `real_fisik` & `real_keuangan` satu-satunya yang diketik manusia; pagu, target,
// dan bendera yatim SELALU turunan SSK versi yang sedang dibuka. Pulihkan dulu
// memakai angka milik FOTO, dan `recalcAllRealisasi` tidak menutup itu - ia
// MEMBACA pagu_awal/target_rp lalu menghitung persen & akumulasi dari situ.
{
  // Foto diambil saat MURNI. Sejak itu PERUBAHAN-1 menaikkan pagu A, item B
  // LENYAP dari versi itu (uangnya sudah keluar), dan item D di-NOL-KAN.
  const PAGU_A2  = 9_000_000_000;
  const BULAN_A2 =   812_345_678;
  const PAGU_D   = 5_000_000_000;

  const sskFoto = new Map(ssk);
  sskFoto.set('D', { pagu: PAGU_D, months: bulanan(400_000_000) });

  const fotoMentah: RealRowRaw[] = [];
  for (let b = 1; b <= 12; b++) fotoMentah.push(baris('A', b, b <= 7 ? 400_000_000 : 0, b <= 7 ? 500_000_000 : 0));
  fotoMentah.push(baris('D', 3, 0, 12_000_000, 'Dinolkan'));
  fotoMentah.push(baris('B', 5, 0, 30_000_000, 'Lenyap'));

  // Foto = payload PUT apa adanya (kinerja_riwayat_simpan menyimpan itu, bukan
  // hasil SELECT), jadi kolom turunannya IKUT dan nilainya milik MURNI.
  const foto = recalcAllRealisasiServer(fotoMentah, { sskByCanonical: sskFoto }) as unknown as RealRow[];

  const sskBaru: BarisSskAcuan[] = [
    { canonical_id: 'A', pagu: PAGU_A2, months: bulanan(BULAN_A2) },
    { canonical_id: 'C', pagu: 0,       months: bulanan(0) },
    // Di-nol-kan: server mengecualikannya lewat `is_nullified = FALSE`, jadi peta
    // di layar HARUS mengecualikannya juga.
    { canonical_id: 'D', pagu: PAGU_D,  months: bulanan(400_000_000), is_nullified: true },
    // Baris lama tanpa canonical_id - tidak boleh jadi kunci peta.
    { canonical_id: '',  pagu: 1_000,   months: bulanan(1) },
  ];
  const versiBaru = { tipe: 'PERUBAHAN' as const, seq: 1 };

  // Prasyarat: fotonya memang basi. Tanpa ini seluruh bagian ini lulus tanpa
  // menguji apa pun, karena angka lama dan baru kebetulan sama.
  const fotoA1 = foto.find(r => r.ssk_canonical_id === 'A' && r.bulan === 1)!;
  eq('Y1 foto membawa pagu LAMA', fotoA1.pagu_awal, PAGU_A);
  eq('Y2 foto membawa target LAMA', fotoA1.target_rp, BULAN_A);

  const pulih = recalcAllRealisasi(hidrasiUlang(foto, sskBaru, versiBaru));
  const pA1 = pulih.find(r => r.ssk_canonical_id === 'A' && r.bulan === 1)!;
  const pA7 = pulih.find(r => r.ssk_canonical_id === 'A' && r.bulan === 7)!;

  eq('Y3 pagu diambil dari versi yang dibuka', pA1.pagu_awal, PAGU_A2);
  eq('Y4 target diambil dari versi yang dibuka', pA1.target_rp, BULAN_A2);
  eq('Y5 target_fisik diturunkan dari pagu baru', pA1.target_fisik, 9.03);
  // Yang diketik manusia TIDAK disentuh - itu seluruh isi foto yang berharga.
  eq('Y6 real_fisik dipertahankan', pA1.real_fisik, 400_000_000);
  eq('Y7 real_keuangan dipertahankan', pA1.real_keuangan, 500_000_000);
  // 3,5 M / 9 M = 38,89%. Terhadap pagu foto (7 M) angkanya 50,00 - kalau
  // hidrasinya dilepas, inilah yang tampil.
  eq('Y8 akumulasi dihitung terhadap pagu BARU', pA7.akum_pct_keuangan, 38.89);
  ok('Y9 dan bukan terhadap pagu foto', pA7.akum_pct_keuangan !== 50);

  const pB = pulih.find(r => r.ssk_canonical_id === 'B')!;
  ok('Y10 item yang lenyap dari versi jadi yatim', pB.yatim === true);
  eq('Y11 yatim pagunya 0', pB.pagu_awal, 0);
  // Fotonya menyatakan sebaliknya - dan spanduk yatim berdiri di atas bendera ini.
  ok('Y12 foto menyatakan sebaliknya', foto.find(r => r.ssk_canonical_id === 'B')!.yatim === false);

  const pD = pulih.find(r => r.ssk_canonical_id === 'D')!;
  ok('Y13 item yang di-nol-kan juga yatim', pD.yatim === true);
  eq('Y14 dan pagunya 0, bukan pagu sebelum dinolkan', pD.pagu_awal, 0);

  // Angkanya kini milik versi yang dibuka, jadi penunjuk versinya ikut - dan
  // app/api/kinerja/reset menyaring baris realisasi LEWAT kolom itu.
  eq('Y15 penunjuk versi ikut disetel (tipe)', pA1.ssk_versi_tipe, 'PERUBAHAN');
  eq('Y16 penunjuk versi ikut disetel (seq)', pA1.ssk_versi_seq, 1);
  eq('Y17 foto tadinya menunjuk versi lain', foto[0].ssk_versi_tipe, 'MURNI');

  const peta = petaHidrasi(sskBaru);
  ok('Y18 baris nol-kan tidak masuk peta', !peta.has('D'));
  ok('Y19 canonical kosong tidak jadi kunci', !peta.has(''));
  ok('Y20 baris sah masuk peta', peta.has('A'));

  // INTI temuan A4: layar sesudah Pulihkan harus sama dengan layar sesudah muat
  // ulang. Pembandingnya jalur server yang sesungguhnya, bukan rumus yang
  // disalin ke tes.
  const server = recalcAllRealisasiServer(fotoMentah, { sskByCanonical: peta }) as unknown as RealRow[];
  const kolom: (keyof RealRow)[] = ['pagu_awal','target_rp','target_fisik','yatim',
    'pct_fisik','akum_target_fisik','akum_target_rp','akum_real_fisik','akum_pct_fisik',
    'pct_keuangan','akum_keuangan','akum_pct_keuangan','deviasi_fisik','deviasi_keuangan'];
  let bedaY = 0;
  for (let i = 0; i < server.length; i++)
    for (const k of kolom) if (server[i][k] !== pulih[i][k]) bedaY++;
  eq('Y21 hasil Pulihkan == hasil muat ulang dari server', bedaY, 0);

  // -- Rumus tunggal: nol pagu, bulan di luar jangkauan, acuan tidak ada -----
  const kosong = hidrasiDariSsk(undefined, 1);
  ok('Y22 acuan tidak ada -> yatim', kosong.yatim === true);
  eq('Y23 acuan tidak ada -> pagu 0', kosong.pagu_awal, 0);
  eq('Y24 acuan tidak ada -> target 0', kosong.target_rp, 0);
  // Pagu 0 itu item sah yang tidak beranggaran, bukan yatim - dan pembagiannya
  // tidak boleh melahirkan Infinity/NaN yang lolos sampai ke kolom persen.
  const nol = hidrasiDariSsk({ pagu: 0, months: bulanan(1_000) }, 1);
  eq('Y25 pagu 0 -> target_fisik 0, bukan Infinity', nol.target_fisik, 0);
  ok('Y26 pagu 0 bukan yatim', nol.yatim === false);
  eq('Y27 bulan 12 mengambil kunci des', hidrasiDariSsk({ pagu: 100, months: { ...bulanan(0), des: 40 } }, 12).target_rp, 40);
  eq('Y28 bulan di luar jangkauan -> target 0', hidrasiDariSsk({ pagu: 100, months: bulanan(7) }, 13).target_rp, 0);
  eq('Y29 months null -> target 0', hidrasiDariSsk({ pagu: 100, months: null }, 1).target_rp, 0);

  // -- Statis: ketiga jalur memakai rumus yang sama, dan urutannya benar -----
  // Komentar dibuang dulu: paragraf di atas barisnya menyebut nama fungsi yang
  // sama, jadi kutipan telanjang tetap cocok walau kodenya dikembalikan (L82c).
  const rt = bersihkanKomentar(readFileSync('app/(dashboard)/kinerja/_tabs/RealisasiTab.tsx', 'utf8'));
  // Hidrasi WAJIB mendahului recalc - kebalikannya melahirkan persen dari pagu foto.
  ok('Y30 Pulihkan menghidrasi ulang sebelum recalc',
     /recalcAllRealisasi\(hidrasiUlang\(isi as RealRow\[\], sskRows, sskVersi\)\)/.test(rt));
  ok('Y31 Init memakai peta yang sama', /const petaSsk = petaHidrasi\(sskRows\)/.test(rt));
  ok('Y32 Init memakai rumus yang sama', /\.\.\.hidrasiDariSsk\(petaSsk\.get\(cid\), b\)/.test(rt));
  // Salinan rumus di layar sudah tidak ada - kalau kembali, dua tempat bisa
  // berbeda pendapat tanpa satu tes pun berubah.
  ok('Y33 layar tidak lagi menyalin rumus target_fisik', !/target_fisik:\s*\(s\.pagu/.test(rt));

  // Saringan peta di layar cuma benar selama kueri SSK server juga menyaringnya.
  // Kalau SQL-nya berubah, dua sisi berhenti sepakat baris mana yang yatim -
  // dan Y21 tidak akan menangkapnya, sebab kedua sisi memakai peta yang sama.
  const kj = readFileSync('lib/data/kinerja.ts', 'utf8');
  // A8: kueri itu pindah ke `itemSskVersi`, yang sekarang melayani DUA kebutuhan
  // — peta hidrasi baris realisasi DAN penyebut Rekap. Satu tempat, satu saringan.
  const iHid = kj.indexOf('export async function itemSskVersi(');
  const badanHid = kj.slice(iHid, kj.indexOf('\n}\n', iHid));
  // Saringannya pindah dari WHERE ke JS supaya satu kueri menjawab dua hal,
  // jadi yang diperiksa juga pindah — INVARIANNYA sama: baris nol-kan tidak
  // boleh sampai ke item maupun ke peta hidrasi.
  ok('Y36 baris nol-kan tetap dikecualikan dari item & peta hidrasi',
     /rows\.filter\(r => Number\(r\.is_nullified \?\? 0\) === 0\)/.test(badanHid)
     && /const items = aktif\.map\(/.test(badanHid));
  ok('Y36c dan kueri itu sekaligus menjawab "habis dinol-kan?" tanpa kueri kedua',
     /baris: rows\.length, baris_aktif: aktif\.length/.test(badanHid)
     && !/versiDinolkanSsk/.test(kj));
  ok('Y36b dan hidrasi memakai kueri yang sama, bukan salinannya',
     /itemSskVersi\(tahun, sumber, versiTipe, versiSeq\)/.test(kj));

  const kc = bersihkanKomentar(readFileSync('lib/data/kinerja-calc.ts', 'utf8'));
  ok('Y34 server memakai lib yang sama', /\.\.\.hidrasiDariSsk\(ssk, r\.bulan\)/.test(kc));
  ok('Y35 server tidak lagi menyalin rumus', !/Math\.round\(\(target_rp \/ pagu\)/.test(kc));
}

console.log('\n-- Z. A6: Buat Perubahan atomik, dan bentroknya dijawab 409 -----');

// Perilakunya dibuktikan lawan MySQL sungguhan di
// `node scripts/test-kinerja-race-versi.mjs` (3 balapan, sebelum vs sesudah).
// Yang dijaga DI SINI bentuk kodenya: urutan pengambilan kunci dan letak
// pembacaan tidak bisa dilihat dari hasil satu permintaan tunggal, jadi kalau
// tidak dipatok di sini ia bisa bergeser balik tanpa satu tes pun berubah.
{
  const rt = bersihkanKomentar(readFileSync('app/api/kinerja/ssk/perubahan/route.ts', 'utf8'));

  // Tidak boleh ada `sql` biasa di route ini: satu saja yang tertinggal di luar
  // transaksi mengembalikan seluruh temuannya.
  ok('Z1 tidak ada lagi kueri di luar transaksi', !/\bawait sql`/.test(rt));
  ok('Z2 route tidak lagi mengimpor sql', !/import \{[^}]*\bsql\b[^}]*\} from '@\/lib\/data\/db'/.test(rt));

  // L84: kuncinya perintah PERTAMA. Kalau `MAX(versi_seq)` dibaca lebih dulu,
  // snapshot baca-konsisten sudah lahir dan kuncinya cuma menjaga angka basi.
  const iTx = rt.indexOf('withTransaction(async ({ tx, conn })');
  const iKunci = rt.indexOf('kunciVersiSsk(tx', iTx);
  const iMax = rt.indexOf('MAX(versi_seq)', iTx);
  const iSumber = rt.indexOf('FROM kinerja_ssk', iMax);
  ok('Z3 kunci diambil di dalam transaksi', iKunci > iTx);
  ok('Z4 kunci mendahului MAX(versi_seq)', iKunci < iMax, `kunci ${iKunci}, max ${iMax}`);
  ok('Z5 baris sumber dibaca sesudah kunci juga', iKunci < iSumber);

  // FOR UPDATE pada baris SUMBERNYA: yang mengubah isinya adalah DELETE milik
  // saveSskBatch, dan DELETE itu yang harus menunggu.
  ok('Z6 baris sumber dibaca FOR UPDATE', /versi_seq = \$\{from_versi_seq\}\s*\n\s*FOR UPDATE/.test(rt));

  // Sumber kosong tetap 404 — sekarang lewat error yang dilempar dari dalam
  // transaksi, jadi tidak ada lagi jalan keluar dini sebelum kunci diambil.
  ok('Z7 sumber kosong tetap 404', /KinerjaVersiSumberKosongError/.test(rt) && /status: 404/.test(rt));
  // ER_DUP_ENTRY = dua permintaan berbarengan, punya penjelasan sendiri.
  ok('Z8 ER_DUP_ENTRY diterjemahkan 409', /ER_DUP_ENTRY/.test(rt) && /status: 409/.test(rt));
  ok('Z9 bentroknya berkode supaya layar bisa menanganinya', rt.includes("code: 'VERSI_BENTROK'"));
  // Yang bukan dua-duanya WAJIB naik apa adanya — menelan galat tak dikenal
  // membuat kegagalan tulis terbaca seperti sukses.
  ok('Z10 galat lain dilempar ulang', /\n\s*throw e;\n/.test(rt));

  const kj = bersihkanKomentar(readFileSync('lib/data/kinerja.ts', 'utf8'));
  ok('Z11 entity kunci punya nama sendiri', kj.includes("KINERJA_VERSI_ENTITY = 'kinerja_versi_ssk'"));
  // L69-a: FOR UPDATE pada baris lock yang belum ada tidak mengunci apa pun.
  ok('Z12 kunci lewat acquireBludLock (INSERT IGNORE dulu)',
     /kunciVersiSsk[\s\S]{0,200}?acquireBludLock\(tx, KINERJA_VERSI_ENTITY/.test(kj));
  // Kuncinya per (tahun, sumber) — bukan per versi, karena MAX(versi_seq)
  // pertanyaannya berlingkup seluruh versi sumber itu.
  ok('Z13 kuncinya per (tahun, sumber)',
     /kinerjaVersiKey = \(tahun: string, sumber: SumberSSK\) => `\$\{tahun\}:\$\{sumber\}`/.test(kj));

  // saveSskBatch: pagar locked_at ikut masuk transaksi (A6 lewat pintu kedua).
  const iSave = kj.indexOf('export async function saveSskBatch(');
  const badanSave = kj.slice(iSave, kj.indexOf('\n}\n', iSave));
  const iTxSave = badanSave.indexOf('withTransaction(async ({ tx, conn })');
  const iPagar = badanSave.indexOf('MAX(locked_at)');
  ok('Z14 pagar locked_at dibaca di dalam transaksi', iPagar > iTxSave && iTxSave >= 0,
     `tx ${iTxSave}, pagar ${iPagar}`);
  ok('Z15 dan mengunci barisnya', /MAX\(locked_at\)[\s\S]{0,220}?FOR UPDATE/.test(badanSave));
  ok('Z16 penolakannya tetap menyebut versinya',
     /Versi \$\{versiTipe\}-\$\{versiSeq\} sudah dikunci/.test(badanSave));
  // Kalau ada yang mengembalikannya ke luar transaksi, `sql` biasa akan muncul
  // lagi di badan fungsi ini.
  ok('Z17 tidak ada lagi kueri lepas di saveSskBatch', !/\bawait sql`/.test(badanSave));

  const st = bersihkanKomentar(readFileSync('app/(dashboard)/kinerja/_tabs/SskTab.tsx', 'utf8'));
  ok('Z18 layar menangani VERSI_BENTROK', st.includes("=== 'VERSI_BENTROK'"));
  // Daftar versi di layar SUDAH basi begitu bentrok terjadi — menyuruh orang
  // memuat ulang untuk sesuatu yang bisa kita kerjakan sendiri itu melempar
  // pekerjaan.
  const iBentrok = st.indexOf("=== 'VERSI_BENTROK'");
  const potong = st.slice(iBentrok, iBentrok + 700);
  ok('Z19 dan menyegarkan daftar versinya sendiri',
     potong.includes('fetchVersiList()') && potong.includes('refetchSsk()'));

  const sk = readFileSync('docs/schema-mysql.sql', 'utf8');
  // Penjaga terakhirnya ADA di migration-022 tapi tidak pernah tertulis di skema
  // acuan, jadi basis data yang lahir dari berkas ini berdiri tanpanya.
  ok('Z20 skema acuan mendeklarasikan uq_ks_canonical_versi',
     /UNIQUE KEY uq_ks_canonical_versi \(tahun, sumber, canonical_id, versi_tipe, versi_seq\)/.test(sk));
  ok('Z21 ada migrasi untuk basis data yang sudah terlanjur',
     existsSync('docs/migrations/migration-kinerja-uq-versi.sql'));
}

console.log('\n-- AA. A5 & A7: satu pernyataan, dan satu aturan versi ---------');

// A7 — aturan "versi mana yang paling belakang" cuma boleh ada SATU (L88).
{
  const M0 = { versi_tipe: 'MURNI', versi_seq: 0 };
  const P1 = { versi_tipe: 'PERUBAHAN', versi_seq: 1 };
  const P2 = { versi_tipe: 'PERUBAHAN', versi_seq: 2 };

  eq('AA1 daftar kosong -> null', pickVersiAktif([]), null);
  eq('AA2 satu-satunya dipilih', pickVersiAktif([M0]), M0);
  // PERUBAHAN mengalahkan MURNI apa pun urutannya di daftar - `ORDER BY` di SQL
  // hanya kebetulan setuju selama MURNI ber-seq 0.
  eq('AA3 PERUBAHAN mengalahkan MURNI', pickVersiAktif([M0, P1]), P1);
  eq('AA4 urutan daftar tidak berpengaruh', pickVersiAktif([P1, M0]), P1);
  eq('AA5 seq tertinggi menang', pickVersiAktif([P1, P2, M0]), P2);
  eq('AA6 dan tetap menang walau di depan', pickVersiAktif([P2, P1]), P2);
  // Kasus yang membedakannya dari `ORDER BY versi_seq DESC`: MURNI ber-seq lebih
  // tinggi tidak boleh mengalahkan PERUBAHAN.
  eq('AA7 MURNI ber-seq tinggi tetap kalah',
     pickVersiAktif([{ versi_tipe: 'MURNI', versi_seq: 9 }, P1]), P1);

  const kj = readFileSync('lib/data/kinerja.ts', 'utf8');
  ok('AA8 kinerja.ts memakai aturan dari lib', kj.includes("from '@/lib/kinerja/versi'"));
  ok('AA9 dan tidak menyimpan salinannya sendiri', !/function pickVersiAktif</.test(kj));

  const rs = bersihkanKomentar(readFileSync('app/api/kinerja/reset/route.ts', 'utf8'));
  ok('AA10 reset memakai aturan yang sama', rs.includes('pickVersiAktif(slotRows)'));
  // Rumus keempat dibuang. Kalau kembali, dua tempat bisa berbeda pendapat soal
  // slot mana yang dibuka kuncinya, tanpa satu tes pun berubah.
  ok('AA11 rumus ORDER BY-nya sendiri sudah tidak ada', !/ORDER BY versi_seq DESC/.test(rs));
  // L69-b: DELETE di atasnya belum commit, jadi pembacaan lewat koneksi lain
  // masih melihat versi yang barusan dihapus.
  ok('AA12 slotnya dibaca lewat tx, bukan sql', /const slotRows = await tx`/.test(rs));
  // SENGAJA tanpa saringan is_nullified - bedanya dengan versiAktifKinerja itu
  // keputusan, dan alasannya ditulis di komentar (yang dibuang sebelum dicocokkan).
  const iSlot = rs.indexOf('const slotRows');
  ok('AA13 slotnya TIDAK menyaring is_nullified',
     !rs.slice(iSlot, iSlot + 320).includes('is_nullified'));
  const rsKomentar = readFileSync('app/api/kinerja/reset/route.ts', 'utf8');
  ok('AA14 dan alasannya ditulis, bukan disembunyikan',
     rsKomentar.includes('SENGAJA TIDAK disaring'));

  // A5 — satu pernyataan, bukan 2.000 perjalanan berurutan (PERF-C1).
  const im = bersihkanKomentar(readFileSync('app/api/kinerja/realisasi/import/route.ts', 'utf8'));
  ok('AA15 tidak ada lagi perulangan await INSERT', !/for \(const p of valid\)/.test(im));
  ok('AA16 satu pernyataan ber-VALUES ?', /VALUES \?/.test(im));
  // `conn.query`, bukan `tx`/`execute`: ekspansi `VALUES ?` butuh non-prepared.
  ok('AA17 lewat conn.query, bukan jalur prepared', /await conn\.query\(/.test(im));
  ok('AA18 masih di dalam transaksi', /withTransaction\(async \(\{ conn \}\)/.test(im));
  // Upsert-nya WAJIB tetap ada: uq_krm_tahun_ket membuat pemetaan ulang
  // keterangan yang sama jadi INSERT yang gagal, bukan pembaruan.
  ok('AA19 ON DUPLICATE KEY UPDATE dipertahankan', /ON DUPLICATE KEY UPDATE/.test(im));
  eq('AA20 ketiga kolomnya ikut diperbarui',
     (im.match(/= VALUES\((sumber|ssk_canonical_id|updated_by)\)/g) || []).length, 3);
  ok('AA21 keterangan tetap dipotong 500 karakter', im.includes('slice(0, 500)'));

  const sk = readFileSync('docs/schema-mysql.sql', 'utf8');
  ok('AA22 upsert-nya berdiri di atas kunci unik yang memang ada',
     /UNIQUE KEY uq_krm_tahun_ket \(tahun, keterangan_excel\)/.test(sk));
}

console.log('\n-- AB. A8: penyebut Rekap disemai dari SSK, bukan dari realisasi --');

// Item SSK yang belum punya satu pun baris realisasi dulu tidak terlihat Rekap,
// padahal Laporan menjumlah pagunya. Karena yang hilang cuma dari PENYEBUT,
// Rekap melaporkan serapan yang LEBIH TINGGI dari kenyataan.
{
  const PAGU_D = 23_683_980_000;   // sepupu angka nyata yang melahirkan temuannya
  const BULAN_D =   1_000_000_000;
  const itemD: ItemSskAktif = {
    canonical_id: 'D', program: 'Program 1', kegiatan: 'Kegiatan 1', subkegiatan: 'Sub 1',
    uraian_ssk: 'SSK D', uraian: 'Item D belum di-Init', pagu: PAGU_D, months: bulanan(BULAN_D),
  };
  const denganD = [...ITEM_SSK, itemD];

  // `rows` TIDAK punya satu pun baris untuk D — itu seluruh kasusnya.
  const hD = hitungRekap(rows, denganD, 7, 'ssk', 'TOTAL');
  const totalD = hD.baris[0];

  eq('AB1 pagu item tanpa realisasi ikut penyebut', totalD.pagu, PAGU_A + PAGU_B + PAGU_D);
  // Sebelum perbaikan penyebutnya berhenti di A + B. Bedanya PERSIS pagu D.
  const tanpaD = hitungRekap(rows, ITEM_SSK, 7, 'ssk', 'TOTAL').baris[0];
  eq('AB2 bedanya persis sebesar pagu item itu', totalD.pagu - tanpaD.pagu, PAGU_D);
  // Dan arahnya: serapan yang dilaporkan jadi LEBIH KECIL, bukan lebih besar.
  ok('AB3 serapan yang dilaporkan turun, bukan naik', totalD.pctKeu < tanpaD.pctKeu,
     `${totalD.pctKeu} vs ${tanpaD.pctKeu}`);
  eq('AB4 pembilangnya tidak ikut berubah', totalD.realKeu, tanpaD.realKeu);

  // Itemnya muncul di tabel dengan realisasi nol — bukan disembunyikan.
  const barisD = hitungRekap(rows, denganD, 7, 'full', 'TOTAL').baris
    .find(b => b.label === 'Item D belum di-Init');
  ok('AB5 itemnya tampil di tabel', !!barisD);
  eq('AB6 dengan realisasi nol', barisD?.realKeu, 0);
  eq('AB7 tapi targetnya ada', barisD?.targetRp, BULAN_D * 7);

  // Pagu itu TAHUNAN — ia tidak boleh bergerak mengikuti bulan yang dipilih.
  const b1  = hitungRekap(rows, denganD, 1,  'ssk', 'TOTAL').baris[0];
  const b12 = hitungRekap(rows, denganD, 12, 'ssk', 'TOTAL').baris[0];
  eq('AB8 pagu tidak bergerak saat bulan diganti', b1.pagu, b12.pagu);
  ok('AB9 sementara targetnya memang bergerak', b1.targetRp < b12.targetRp);

  // -- targetSampai: rencana, bukan turunan baris yang kebetulan ada ---------
  eq('AB10 target s/d 1 = bulan Januari', targetSampai(bulanan(100), 1), 100);
  eq('AB11 target s/d 12 = setahun', targetSampai(bulanan(100), 12), 1200);
  eq('AB12 bulan 0 -> nol', targetSampai(bulanan(100), 0), 0);
  eq('AB13 di atas 12 tidak melewati Desember', targetSampai(bulanan(100), 99), 1200);
  eq('AB14 months null -> nol', targetSampai(null, 7), 0);
  // Bukti bahwa ia menjumlah bulan yang BENAR, bukan mengalikan rata-rata.
  eq('AB15 tiap bulan dijumlah apa adanya',
     targetSampai({ ...bulanan(0), jan: 5, feb: 7, mar: 11 }, 2), 12);

  // -- Target item berbaris-bolong tidak ikut menyusut ----------------------
  // Buang seluruh baris bulan 7 milik B. Dulu targetnya ikut hilang karena
  // diakumulasi dari `target_rp` baris yang ada; sekarang dari `months` SSK.
  const bolongB = rows.filter(r => !(r.ssk_canonical_id === 'B' && r.bulan === 7));
  const hBolongB = hitungRekap(bolongB, ITEM_SSK, 7, 'ssk', 'TOTAL').baris[0];
  eq('AB16 target tetap utuh walau barisnya bolong', hBolongB.targetRp, (BULAN_A + BULAN_B) * 7);
  ok('AB17 tapi realisasinya memang berkurang', hBolongB.realKeu < tanpaD.realKeu);

  // -- Label ikut SSK, bukan salinan di baris realisasi ---------------------
  const diubah = ITEM_SSK.map(i => i.canonical_id === 'A'
    ? { ...i, uraian: 'Item A NAMA BARU', uraian_ssk: 'SSK A BARU' } : i);
  const hNama = hitungRekap(rows, diubah, 7, 'full', 'TOTAL');
  ok('AB18 nama item ikut SSK versi aktif',
     hNama.baris.some(b => b.label === 'Item A NAMA BARU'));
  ok('AB19 nama lama di baris realisasi tidak dipakai lagi',
     !hNama.baris.some(b => b.label === 'Item A'));

  // -- Yatim: tetap dikeluarkan, tidak menyelinap jadi item -----------------
  eq('AB20 yatim tetap dilaporkan', hD.yatim.jumlahBaris, 1);
  ok('AB21 dan tidak jadi item di tabel', !hD.baris.some(b => b.label.includes('Yatim')));
  // Baris yang canonical-nya tidak ada di semaian TIDAK boleh melahirkan item —
  // kalau ia melahirkan, pagunya datang dari baris realisasi lagi (cacat A8).
  const hTanpaB = hitungRekap(rows, ITEM_SSK.filter(i => i.canonical_id !== 'B'), 7, 'ssk', 'TOTAL');
  eq('AB22 baris tanpa pasangan SSK tidak menambah penyebut', hTanpaB.baris[0].pagu, PAGU_A);
  ok('AB23 dan realisasinya tidak masuk pembilang',
     hTanpaB.baris[0].realKeu < tanpaD.realKeu);

  // -- laporanYatim berdiri sendiri -----------------------------------------
  const cidSemua = new Set(['A', 'B', 'C']);
  eq('AB24 yatim dari benderanya', laporanYatim(rows, cidSemua, 7).jumlahBaris, 1);
  // Daftar KOSONG = "belum dimuat", bukan "tidak ada satu pun item". Tanpa
  // penjagaan ini, sekejap sebelum SSK selesai dimuat SELURUH baris dilaporkan
  // yatim sekaligus.
  eq('AB25 daftar kosong tidak melaporkan semuanya yatim',
     laporanYatim(rows, new Set<string>(), 7).jumlahBaris, 1);
  // Baris yang benderanya belum menyusul tetap tertangkap lewat daftar.
  eq('AB26 canonical di luar daftar ikut terhitung yatim',
     laporanYatim(rows, new Set(['A']), 7).jumlahBaris > 1, true);
  eq('AB27 bulan di atas sdBulan tidak ikut', laporanYatim(rows, cidSemua, 2).jumlahBaris, 0);

  // -- Statis: penyebutnya mustahil datang dari baris realisasi lagi --------
  //
  // Cabang "tidak ketemu di semaian" di `kumpulkanItem` TIDAK BISA dijangkau uji
  // perilaku: baris ber-canonical yang ada di semaian selalu ketemu, dan yang
  // tidak ada sudah disaring `yatimkah` lebih dulu. Jadi yang dipatok di sini
  // BENTUKNYA — dan itu ketahuan dari uji mutasi, bukan dari membaca: menaruh
  // "kalau tidak ketemu, lahirkan item dari barisnya" di situ mengembalikan
  // seluruh cacat A8 dan lolos 408 pemeriksaan tanpa satu pun berubah.
  const rkA8 = bersihkanKomentar(readFileSync('lib/kinerja/rekap.ts', 'utf8'));
  ok('AB28 rekap tidak lagi menyentuh pagu_awal sama sekali', !/pagu_awal/.test(rkA8));
  eq('AB29 item hanya dilahirkan di satu tempat: penyemaian',
     (rkA8.match(/items\.set\(/g) || []).length, 1);

  // -- Statis: rantainya utuh dari server sampai layar ----------------------
  const kjA8 = bersihkanKomentar(readFileSync('lib/data/kinerja.ts', 'utf8'));
  ok('AB30 itemSsk ikut dipulangkan getRealisasiRows', /return \{ rows, versi, itemSsk \}/.test(kjA8));
  // Kolom hierarkinya WAJIB ikut — tanpa itu pohon rekap kehilangan induknya.
  eq('AB31 kueri item membawa kolom hierarkinya',
     (kjA8.match(/COALESCE\((program|kegiatan|subkegiatan|uraian_ssk|uraian),''\)/g) || []).length >= 5, true);

  const rtA8 = bersihkanKomentar(readFileSync('app/api/kinerja/realisasi/route.ts', 'utf8'));
  // DUA cabang GET, dua-duanya. Bentuk balasan yang berbeda tergantung ada
  // tidaknya parameter versi itu jebakan yang sudah pernah menggigit (bentuk T1).
  eq('AB32 kedua cabang GET memulangkan itemSsk',
     (rtA8.match(/ok: true, rows, itemSsk/g) || []).length, 2);

  const shA8 = bersihkanKomentar(readFileSync('app/(dashboard)/kinerja/kinerja-client.tsx', 'utf8'));
  ok('AB33 layar mengumpulkan itemSsk semua sumber',
     /setRealisasiAllItems\(results\.flatMap\(x => x\.itemSsk\)\)/.test(shA8));
  ok('AB34 dan mengopernya ke tab Cetak', /realisasiAllItems=\{realisasiAllItems\}/.test(shA8));

  const ctA8 = bersihkanKomentar(readFileSync('app/(dashboard)/kinerja/_tabs/CetakTab.tsx', 'utf8'));
  ok('AB35 rekap dihitung dengan item SSK-nya',
     /hitungRekap\(realisasiAllRows, realisasiAllItems, bulanRekapPilih/.test(ctA8));
  ok('AB36 propnya wajib, bukan opsional', /realisasiAllItems: ItemSskAktif\[\];/.test(ctA8));
  // Tetap SEKALI dihitung — yang diunduh wajib memuat angka yang sama dengan layar.
  eq('AB37 hitungRekap tetap dipanggil sekali', (ctA8.match(/hitungRekap\(/g) || []).length, 1);

  const rlA8 = bersihkanKomentar(readFileSync('app/(dashboard)/kinerja/_tabs/RealisasiTab.tsx', 'utf8'));
  ok('AB38 spanduk yatim lewat laporanYatim', /laporanYatim\(realisasiRows, cidAktif, 12\)/.test(rlA8));
  // Saringan daftar canonical-nya SAMA dengan yang dipakai hidrasi & server.
  ok('AB39 daftar canonical-nya dari petaHidrasi',
     /const cidAktif = new Set\(petaHidrasi\(sskRows\)\.keys\(\)\)/.test(rlA8));
  ok('AB40 tab Realisasi tidak lagi memanggil kumpulkanItem', !/kumpulkanItem\(/.test(rlA8));
}

console.log('\n-- AC. Rekap boleh dicetak sebelum ada realisasi, dengan syarat --');

// Pemilih bulan sekarang menawarkan Jan-Des tanpa syarat, jadi tahun yang SSK-nya
// sudah terisi tapi realisasinya belum di-Init pun bisa direkap. Harganya:
// "Realisasi Rp 0" bisa muncul di dokumen yang ditandatangani — dan dokumen itu
// TIDAK BISA membedakan "uangnya belum dipakai" dari "datanya belum diisi".
// Bendera `tanpaRealisasi` yang membuatnya mengatakan bahwa ia tidak tahu.
{
  const itemSaja: ItemSskAktif[] = [{
    canonical_id: 'Z', program: 'Program Z', kegiatan: 'Kegiatan Z', subkegiatan: 'Sub Z',
    uraian_ssk: 'SSK Z', uraian: 'Item Z', pagu: 5_000_000_000, months: bulanan(400_000_000),
  }];

  // Nol baris realisasi, tapi SSK-nya berisi.
  const hKosong = hitungRekap([], itemSaja, 8, 'ssk', 'TOTAL');
  ok('AC1 tabelnya tetap terbentuk walau realisasinya nol', hKosong.baris.length > 0);
  eq('AC2 pagunya tampil apa adanya', hKosong.baris[0].pagu, 5_000_000_000);
  eq('AC3 targetnya tampil s/d bulan terpilih', hKosong.baris[0].targetRp, 400_000_000 * 8);
  eq('AC4 realisasinya nol', hKosong.baris[0].realKeu, 0);
  ok('AC5 dan itu ditandai', hKosong.tanpaRealisasi === true);

  // Baris ADA tapi seluruhnya nol — hasil "Init dari SSK" yang belum diisi.
  // Ini justru kasus yang paling gampang salah dibaca, jadi ikut ditandai.
  const nolSemua = rows.map(r => ({ ...r, real_fisik: 0, real_keuangan: 0 }));
  ok('AC6 baris nol semua juga ditandai',
     hitungRekap(nolSemua, ITEM_SSK, 7, 'ssk', 'TOTAL').tanpaRealisasi === true);
  // Ada isinya -> TIDAK ditandai, kalau tidak catatannya jadi hiasan permanen.
  ok('AC7 begitu ada isinya, tandanya lepas',
     hitungRekap(rows, ITEM_SSK, 7, 'ssk', 'TOTAL').tanpaRealisasi === false);
  // Realisasi FISIK saja (keuangan belum) tetap terhitung "ada isinya".
  const fisikSaja = rows.map(r => ({ ...r, real_keuangan: 0 }));
  ok('AC8 fisik saja sudah cukup untuk melepas tandanya',
     hitungRekap(fisikSaja, ITEM_SSK, 7, 'ssk', 'TOTAL').tanpaRealisasi === false);

  // -- Catatannya WAJIB ada di BERKAS, bukan cuma di layar ------------------
  const aoaKosong = rekapAoa({
    baris: hKosong.baris, yatim: hKosong.yatim, tanpaRealisasi: true,
    sumberDinolkan: [], versiRekap: [], pilihanVersi: 'berlaku', tahun: '2040', namaBulan: 'Agustus',
  });
  const catatanKosong = aoaKosong.map(r => String(r[0] ?? '')).filter(x => x.startsWith('Catatan:'));
  eq('AC9 satu catatan masuk ke berkas', catatanKosong.length, 1);
  ok('AC10 catatannya menyebut periodenya',
     catatanKosong[0].includes('Agustus') && catatanKosong[0].includes('2040'));
  // Kalimat inti: yang membedakan "belum dipakai" dari "belum diisi".
  ok('AC11 dan menjelaskan bedanya, bukan cuma bilang nol',
     catatanKosong[0].includes('belum dimasukkan') && catatanKosong[0].includes('belum dipakai'));

  // Dua catatan bisa berdampingan (belum diisi + ada yatim) — keduanya harus ikut.
  const duaCatatan = rekapAoa({
    baris: hKosong.baris,
    yatim: { jumlahBaris: 2, jumlahItem: 1, nominal: 7_000_000, contoh: ['Item Yatim'] },
    tanpaRealisasi: true, sumberDinolkan: [], versiRekap: [], pilihanVersi: 'berlaku', tahun: '2040', namaBulan: 'Agustus',
  }).map(r => String(r[0] ?? '')).filter(x => x.startsWith('Catatan:'));
  eq('AC12 dua catatan tidak saling menutupi', duaCatatan.length, 2);

  // Tidak ditandai -> tidak ada catatan menggantung.
  const aoaAda = rekapAoa({
    baris: hKosong.baris, yatim: hKosong.yatim, tanpaRealisasi: false,
    sumberDinolkan: [], versiRekap: [], pilihanVersi: 'berlaku', tahun: '2040', namaBulan: 'Agustus',
  });
  ok('AC13 tanpa tanda, tidak ada catatan',
     !aoaAda.some(r => String(r[0] ?? '').includes('belum dimasukkan')));

  // -- Statis: layar & PDF ikut, dan catatannya TIDAK dikecualikan dari cetak
  const exAC = bersihkanKomentar(readFileSync('app/(dashboard)/kinerja/_exports.ts', 'utf8'));
  eq('AC14 catatannya dipakai Excel DAN PDF',
     (exAC.match(/catatanTanpaRealisasi\(/g) || []).length, 3);   // 1 definisi + 2 pemakai

  const ctAC = readFileSync('app/(dashboard)/kinerja/_tabs/CetakTab.tsx', 'utf8');
  ok('AC15 pemilih bulan menawarkan Jan-Des tanpa syarat',
     /Array\.from\(\{ length: 12 \}, \(_, i\) => i \+ 1\)/.test(ctAC));
  ok('AC16 bulan tanpa realisasi tetap ditawarkan, tapi ditandai',
     ctAC.includes('(belum ada realisasi)'));
  ok('AC17 layar menampilkan catatannya', /hasil\.tanpaRealisasi &&/.test(ctAC));
  ok('AC18 dan benderanya diteruskan ke pengekspor',
     /tanpaRealisasi: rekap!\.tanpaRealisasi/.test(ctAC));
  // Spanduk yatim/kembar sengaja `no-print` (instruksi kerja untuk operator);
  // catatan INI tentang isi dokumennya sendiri, jadi ia HARUS ikut tercetak.
  const iCat = ctAC.indexOf('hasil.tanpaRealisasi &&');
  ok('AC19 catatannya tidak dikecualikan dari cetak',
     !ctAC.slice(iCat, iCat + 420).includes('no-print'));
  // Bulan bawaan saat belum ada realisasi: tahun berjalan -> bulan ini.
  ok('AC20 ada bulan bawaan untuk tahun tanpa realisasi',
     /kini\.getMonth\(\) \+ 1 : 12/.test(ctAC));
}

console.log('\n-- AD. A9: daftar calon versi lengkap, angkanya yang disaring --');

// Satu saringan pernah mengerjakan dua pekerjaan. `is_nullified = FALSE` benar
// untuk MENGHITUNG pagu, tapi ia juga menentukan versi mana yang masuk daftar
// calon -- jadi versi yang SELURUH barisnya dinol-kan lenyap dari GROUP BY dan
// versi SEBELUMNYA terpilih. Menol-kan seisi Perubahan jadi tidak berpengaruh
// apa pun, dan angkanya MUNDUR ke versi yang sudah digantikan.
{
  const v = (tipe: string, seq: number, baris: number, aktif: number, pagu: number) =>
    ({ versi_tipe: tipe, versi_seq: seq, baris, baris_aktif: aktif, total_pagu: pagu });

  // Inti A9: PERUBAHAN-1 habis dinol-kan, MURNI-0 berisi 7 M.
  const habis = pilihVersiAgregat([v('MURNI', 0, 3, 3, 7_000_000_000), v('PERUBAHAN', 1, 3, 0, 0)]);
  eq('AD1 versi yang habis dinol-kan TETAP terpilih sebagai acuan', habis.versi?.tipe, 'PERUBAHAN');
  eq('AD2 dan seq-nya ikut benar', habis.versi?.seq, 1);
  eq('AD3 pagunya 0, BUKAN mundur ke pagu MURNI', Number(habis.agregat?.total_pagu ?? -1), 0);
  ok('AD4 keadaannya ditandai, bukan dibiarkan jadi nol tanpa sebab', habis.dinolkan === true);

  // Dinol-kan SEBAGIAN tidak pernah kena cacatnya -- versinya masih punya baris
  // tak-nol sehingga tetap muncul. Diuji supaya perbaikannya tidak "menyembuhkan"
  // yang tidak sakit lalu menandai keadaan sehat sebagai bermasalah.
  const sebagian = pilihVersiAgregat([v('MURNI', 0, 3, 3, 7_000_000_000), v('PERUBAHAN', 1, 3, 2, 4_000_000_000)]);
  eq('AD5 dinol-kan sebagian tetap memilih versi terbaru', sebagian.versi?.tipe, 'PERUBAHAN');
  eq('AD6 angkanya hanya dari baris tak-nol', Number(sebagian.agregat?.total_pagu ?? 0), 4_000_000_000);
  ok('AD7 dan TIDAK ditandai dinol-kan', sebagian.dinolkan === false);

  // Versi biasa: tidak boleh ada yang berubah.
  const biasa = pilihVersiAgregat([v('MURNI', 0, 15, 15, 74_154_779_000)]);
  eq('AD8 versi tunggal tanpa nol-kan tetap terpilih', biasa.versi?.tipe, 'MURNI');
  ok('AD9 dan tidak ditandai', biasa.dinolkan === false);
  eq('AD10 pagunya utuh', Number(biasa.agregat?.total_pagu ?? 0), 74_154_779_000);

  // Sumber tanpa SSK sama sekali -> tidak ada versi, dan BUKAN "dinol-kan".
  const kosong = pilihVersiAgregat([]);
  eq('AD11 tanpa baris sama sekali tidak ada versi terpilih', kosong.versi, null);
  ok('AD12 dan itu bukan "dinol-kan" -- dua sebab berbeda', kosong.dinolkan === false);
  // Pemanggil yang lupa memilih kolom hitungannya: keduanya terbaca 0, dan
  // tanpa pagar `baris > 0` SETIAP versi akan mengaku habis dinol-kan.
  const tanpaKolom = pilihVersiAgregat([{ versi_tipe: 'MURNI', versi_seq: 0, total_pagu: 7_000_000_000 }]);
  eq('AD12b versi tetap terpilih walau kolom hitungannya tidak diminta', tanpaKolom.versi?.tipe, 'MURNI');
  ok('AD12c dan TIDAK dituduh dinol-kan tanpa bukti', tanpaKolom.dinolkan === false);

  // PERUBAHAN-2 habis dinol-kan, PERUBAHAN-1 masih berisi: yang menang tetap
  // yang terbaru. Kalau tidak, angkanya mundur satu langkah -- cacat yang sama
  // persis, cuma antar-Perubahan.
  const dua = pilihVersiAgregat([
    v('MURNI', 0, 3, 3, 7_000_000_000),
    v('PERUBAHAN', 1, 3, 3, 9_000_000_000),
    v('PERUBAHAN', 2, 3, 0, 0),
  ]);
  eq('AD13 PERUBAHAN-2 yang habis dinol-kan tetap mengalahkan PERUBAHAN-1', dua.versi?.seq, 2);
  eq('AD14 pagunya 0, bukan 9 M milik PERUBAHAN-1', Number(dua.agregat?.total_pagu ?? -1), 0);

  // Aturannya WAJIB sepakat dengan pickVersiAktif -- keduanya menjawab "versi
  // mana", dan dua jawaban yang berbeda adalah L88 lahir kembali.
  const daftar = [v('MURNI', 0, 3, 3, 7_000_000_000), v('PERUBAHAN', 1, 3, 0, 0)];
  eq('AD15 satu aturan: pilihVersiAgregat sepakat dengan pickVersiAktif',
     pilihVersiAgregat(daftar).versi?.seq, Number(pickVersiAktif(daftar)?.versi_seq));

  // -- Keempat kueri: calon TANPA saringan, angka DENGAN saringan ------------
  const dk = bersihkanKomentar(readFileSync('lib/data/kinerja.ts', 'utf8'));
  // Blok kueri yang mengelompokkan per versi tidak boleh lagi menyaring di WHERE.
  const grup = dk.split('GROUP BY').length - 1;
  ok('AD16 tidak ada lagi WHERE ber-is_nullified di kueri pemilih versi',
     !/WHERE[^`]*is_nullified = FALSE[^`]*GROUP BY[^`]*versi_seq/.test(dk), `blok GROUP BY: ${grup}`);
  // Empat tempat, dan dihitung KEMUNCULANNYA: memperbaiki satu lalu mengutip
  // sepotong akan lulus untuk alasan yang salah (L82c).
  // 5 = empat pemilih versi (versiAktifKinerja, getLaporanData,
  // getLaporanSemua, getKinerjaKpi) + `versiDinolkanSsk` yang menanyakan status
  // SATU versi tertentu. Yang terakhir memakai penolong yang sama supaya
  // "dinol-kan" tidak punya dua definisi.
  eq('AD17 semua penanya versi memakai penolong yang sama',
     (dk.match(/pilihVersiAgregat\(/g) || []).length, 5);
  // Dihitung PERSIS: ">= 6" akan lulus walau satu penjumlahan dikembalikan jadi
  // SUM biasa. 10 = versiAktifKinerja 2 + getLaporanData 3 + getLaporanSemua 3
  // + getKinerjaKpi 2. Penjumlahan bersyarat ini TIDAK bergantung pada baris
  // dinol-kan yang pagunya sudah 0: baris lama (dari route `nullify` yang dulu)
  // bisa berbendera nol tapi masih berangka.
  // 10 = versiAktifKinerja 2 (dua cabang) + getLaporanData 3 + getLaporanSemua 3
  // + getKinerjaKpi 2. `itemSskVersi` menyaring di JS, bukan di SQL, supaya satu
  // kueri menjawab dua hal — jadi ia sengaja tidak ikut hitungan ini.
  eq('AD18 penjumlahannya bersyarat, bukan disaring di WHERE',
     (dk.match(/SUM\(CASE WHEN is_nullified = FALSE/g) || []).length, 10);
  // canonicalAktifKinerja SENGAJA tetap menyaring barisnya: realisasi yang
  // menunjuk item dinol-kan HARUS jadi yatim, bukan diam-diam berpagu.
  ok('AD19 kueri baris canonical tetap menyaring is_nullified',
     /SELECT sumber, canonical_id, versi_tipe, versi_seq FROM kinerja_ssk\s*\n\s*WHERE tahun = \$\{tahun\} AND sumber = \$\{sumber\} AND is_nullified = FALSE/.test(dk));
  // Bendera dibawa keluar, bukan disimpulkan pemanggil dari "pagu === 0".
  ok('AD20 LaporanSumber membawa versi acuan + benderanya',
     /versi_aktif: \{ tipe: 'MURNI' \| 'PERUBAHAN'; seq: number \} \| null;/.test(dk)
     && /versi_dinolkan: boolean;/.test(dk));
  ok('AD21 KPI memulangkan daftar sumber yang dinol-kan',
     /sumber_dinolkan: perSumber\.filter\(r => r\.dinolkan\)/.test(dk));
  ok('AD22 getRealisasiRows meneruskan benderanya ke layar',
     /versi: VersiAktifKinerja;/.test(dk));

  // -- Nol yang tidak dijelaskan adalah jebakan berikutnya ------------------
  const exAD = bersihkanKomentar(readFileSync('app/(dashboard)/kinerja/_exports.ts', 'utf8'));
  eq('AD23 catatannya dipakai Excel DAN PDF',
     (exAD.match(/catatanDinolkan\(/g) || []).length, 3);   // 1 definisi + 2 pemakai
  const aoaNol = rekapAoa({
    baris: hasil.baris, yatim: { jumlahBaris: 0, jumlahItem: 0, nominal: 0, contoh: [] },
    tanpaRealisasi: false, sumberDinolkan: ['GAJI', 'BLUD'], versiRekap: [], pilihanVersi: 'berlaku', tahun: '2040', namaBulan: 'Oktober',
  });
  const catNol = aoaNol.map(r => String(r[0] ?? '')).filter(x => x.startsWith('Catatan:'));
  eq('AD24 catatannya masuk ke berkas', catNol.length, 1);
  ok('AD25 dan menyebut sumbernya', catNol[0].includes('GAJI') && catNol[0].includes('BLUD'));
  ok('AD26 serta menyatakan itu disengaja, bukan data yang belum diisi',
     catNol[0].includes('disengaja'));
  // Tanpa sumber dinol-kan -> tidak ada catatan menggantung.
  ok('AD27 tanpa sumber dinol-kan, tidak ada catatannya', !rekapAoa({
    baris: hasil.baris, yatim: { jumlahBaris: 0, jumlahItem: 0, nominal: 0, contoh: [] },
    tanpaRealisasi: false, sumberDinolkan: [], versiRekap: [], pilihanVersi: 'berlaku', tahun: '2040', namaBulan: 'Oktober',
  }).some(r => String(r[0] ?? '').includes('dinol-kan')));
  // Tiga catatan bisa berdampingan, dan yang SEBAB harus dibaca lebih dulu.
  const tiga = rekapAoa({
    baris: hasil.baris,
    yatim: { jumlahBaris: 2, jumlahItem: 1, nominal: 7_000_000, contoh: ['Item Yatim'] },
    tanpaRealisasi: true, sumberDinolkan: ['GAJI'], versiRekap: [], pilihanVersi: 'berlaku', tahun: '2040', namaBulan: 'Oktober',
  }).map(r => String(r[0] ?? '')).filter(x => x.startsWith('Catatan:'));
  eq('AD28 tiga catatan tidak saling menutupi', tiga.length, 3);
  ok('AD29 sebab dibaca sebelum akibat: dinol-kan mendahului yatim',
     tiga[0].includes('dinol-kan'));

  // -- Layar: ketiga tempat wajib mengatakannya (L69) -----------------------
  const ctAD = readFileSync('app/(dashboard)/kinerja/_tabs/CetakTab.tsx', 'utf8');
  ok('AD30 Rekap menampilkan keterangannya', /sumberDinolkan\.length > 0 &&/.test(ctAD));
  const iAD = ctAD.indexOf('sumberDinolkan.length > 0 &&');
  ok('AD31 dan keterangan itu IKUT tercetak', !ctAD.slice(iAD, iAD + 420).includes('no-print'));
  ok('AD32 benderanya diteruskan ke pengekspor',
     /sumberDinolkan, versiRekap, pilihanVersi, tahun,/.test(ctAD));
  // Dijangkarkan ke SYARATNYA, bukan cuma ke kedua kalimatnya: mengganti
  // syaratnya jadi `false` menyisakan kedua kalimat tetap ada di sumber, jadi
  // pemeriksaan yang cuma mengutipnya lulus untuk alasan yang salah (L82c).
  ok('AD33 keadaan-kosong membedakan "dinol-kan" dari "belum diisi"',
     /\{sumberDinolkan\.length > 0\s*\n\s*\? <>Seluruh baris SSK/.test(ctAD)
     && ctAD.includes('sudah dinol-kan, jadi tidak ada pagu')
     && ctAD.includes('Belum ada item SSK untuk tahun'));
  ok('AD34 propnya wajib, bukan opsional bernilai bawaan',
     /sumberDinolkan: SumberSSK\[\];/.test(ctAD) && !/sumberDinolkan\?: /.test(ctAD));

  const ltAD = readFileSync('app/(dashboard)/kinerja/_tabs/LaporanTab.tsx', 'utf8');
  ok('AD35 Laporan menyebut sebabnya', /d\.versi_dinolkan &&/.test(ltAD));
  ok('AD36 dan menunjukkan jalan keluarnya, bukan cuma bilang nol',
     ltAD.includes('Pengaturan → Reset'));
  const dtAD = readFileSync('app/(dashboard)/kinerja/_tabs/DashboardTab.tsx', 'utf8');
  ok('AD37 Beranda menyebutnya juga', /kpi\?\.sumber_dinolkan\?\.length/.test(dtAD));
  ok('AD38 dan menunjukkan jalan keluarnya', dtAD.includes('Pengaturan → Reset'));

  const kcAD = bersihkanKomentar(readFileSync('app/(dashboard)/kinerja/kinerja-client.tsx', 'utf8'));
  ok('AD39 benderanya dibaca dari balasan server, bukan ditebak dari itemSsk kosong',
     /dinolkan: j\.versi\?\.dinolkan === true/.test(kcAD) && !/itemSsk\.length === 0/.test(kcAD));
  ok('AD40 dan dioper ke layar Cetak', /sumberDinolkan=\{sumberDinolkan\}/.test(kcAD));
}

console.log('\n-- AE. Memilih versi SSK saat mencetak Rekap --');

// Perubahan anggaran terjadi di tengah tahun -- sering Oktober, tidak selalu
// Agustus -- dan sesudahnya ada DUA dokumen yang dua-duanya sah. Datanya sudah
// utuh (tiap versi disalin lengkap), yang belum ada cuma cara memintanya.
{
  const slot = (tipe: string, seq: number) => ({ versi_tipe: tipe, versi_seq: seq });

  // -- Aturan pemilihannya -------------------------------------------------
  const biasa = [slot('MURNI', 0), slot('PERUBAHAN', 1)];
  eq('AE1 "berlaku" memilih versi paling belakang', versiUntukPilihan(biasa, 'berlaku')?.tipe, 'PERUBAHAN');
  eq('AE2 "murni" memilih dokumen sebelum perubahan', versiUntukPilihan(biasa, 'murni')?.tipe, 'MURNI');
  eq('AE3 dan seq-nya ikut benar', versiUntukPilihan(biasa, 'murni')?.seq, 0);

  // Nomor urut MURNI TIDAK dijamin 0. Menuliskan `{MURNI, 0}` mati akan memuat
  // versi murni yang salah di sini, dan angkanya tetap masuk akal di layar.
  const murniGanda = [slot('MURNI', 0), slot('MURNI', 1), slot('PERUBAHAN', 1)];
  eq('AE4 "murni" ambil MURNI paling belakang, bukan seq 0 mati',
     versiUntukPilihan(murniGanda, 'murni')?.seq, 1);

  // Sumber yang belum berperubahan: kedua pilihan WAJIB memberi jawaban sama,
  // kalau tidak pilihannya menyesatkan untuk sumber itu.
  const belumBerubah = [slot('MURNI', 0)];
  eq('AE5 sumber tanpa perubahan: kedua pilihan sama',
     JSON.stringify(versiUntukPilihan(belumBerubah, 'berlaku')),
     JSON.stringify(versiUntukPilihan(belumBerubah, 'murni')));

  // MURNI dihapus lewat Reset sementara PERUBAHAN hidup (parent_versi_id
  // ber-ON DELETE SET NULL, jadi ini keadaan NYATA). Harus null -- bukan
  // diam-diam jatuh ke versi berlaku.
  eq('AE6 tanpa versi murni -> null, bukan jatuh ke versi berlaku',
     versiUntukPilihan([slot('PERUBAHAN', 1), slot('PERUBAHAN', 2)], 'murni'), null);
  eq('AE7 tanpa slot sama sekali -> null', versiUntukPilihan([], 'berlaku'), null);
  // PERUBAHAN-2 mengalahkan PERUBAHAN-1 di "berlaku".
  eq('AE8 di antara sesama perubahan, yang terbaru menang',
     versiUntukPilihan([slot('PERUBAHAN', 1), slot('PERUBAHAN', 2)], 'berlaku')?.seq, 2);
  // Aturannya WAJIB satu dengan pemilih versi berlaku di tempat lain.
  eq('AE9 "berlaku" sepakat dengan pickVersiAktif',
     versiUntukPilihan(biasa, 'berlaku')?.seq, Number(pickVersiAktif(biasa)?.versi_seq));

  // -- Yang berganti cuma PENYEBUTNYA -------------------------------------
  // Baris realisasi yang sama persis, dua daftar item: pagu & target berubah,
  // realisasi tidak. Itu seluruh janji fiturnya.
  const itemMurni: ItemSskAktif[] = [
    { canonical_id: 'A', program: 'Program 1', kegiatan: 'Kegiatan 1', subkegiatan: 'Sub 1',
      uraian_ssk: 'SSK A', uraian: 'Item A', pagu: 5_000_000_000, months: bulanan(400_000_000) },
  ];
  const itemPerubahan: ItemSskAktif[] = [
    { canonical_id: 'A', program: 'Program 1', kegiatan: 'Kegiatan 1', subkegiatan: 'Sub 1',
      uraian_ssk: 'SSK A', uraian: 'Item A', pagu: 8_000_000_000, months: bulanan(650_000_000) },
    // Item yang LAHIR di Perubahan -- tidak ada di dokumen murni.
    { canonical_id: 'BARU', program: 'Program 1', kegiatan: 'Kegiatan 1', subkegiatan: 'Sub 1',
      uraian_ssk: 'SSK Baru', uraian: 'Item Baru', pagu: 1_000_000_000, months: bulanan(80_000_000) },
  ];
  const realA = [baris('A', 1, 300_000_000, 300_000_000), baris('BARU', 1, 90_000_000, 90_000_000)];
  // Barisnya dihidrasi dari versi yang sama dengan penyebutnya — persis yang
  // dilakukan `getRealisasiHydrated`, yang membangun `sskByCanonical` dari
  // `itemSsk`. Menghidrasi dari satu versi lalu menghitung terhadap versi lain
  // itu justru cacat L88 yang sudah ditutup.
  const petaDari = (items: ItemSskAktif[]) =>
    new Map<string, { pagu: number; months: SskMonths | null }>(
      items.map(i => [i.canonical_id, { pagu: i.pagu, months: i.months }]));
  const barisM = recalcAllRealisasiServer(realA, { sskByCanonical: petaDari(itemMurni) }) as unknown as RealRow[];
  const barisP = recalcAllRealisasiServer(realA, { sskByCanonical: petaDari(itemPerubahan) }) as unknown as RealRow[];
  const rM = hitungRekap(barisM, itemMurni, 6, 'ssk', 'TOTAL');
  const rP = hitungRekap(barisP, itemPerubahan, 6, 'ssk', 'TOTAL');
  // Angka realisasinya TIDAK disentuh — yang berganti cuma penyebutnya.
  const keuM = barisM.find(r => r.ssk_canonical_id === 'A')!.real_keuangan;
  const keuP = barisP.find(r => r.ssk_canonical_id === 'A')!.real_keuangan;
  eq('AE9b realisasi baris tidak berubah antar-versi', keuM, keuP);
  eq('AE10 pagu mengikuti versi murni',     rM.baris[0].pagu, 5_000_000_000);
  eq('AE11 pagu mengikuti versi perubahan', rP.baris[0].pagu, 9_000_000_000);
  eq('AE12 target ikut berganti (murni)',     rM.baris[0].targetRp, 400_000_000 * 6);
  eq('AE13 target ikut berganti (perubahan)', rP.baris[0].targetRp, (650_000_000 + 80_000_000) * 6);
  // Pagu bertambah/bergeser tidak butuh apa pun yang baru: tiap versi dokumen
  // utuh, jadi memilih versi = memilih satu set angka yang sudah lengkap.
  ok('AE14 pagu boleh bertambah antar-versi tanpa perlakuan khusus',
     rP.baris[0].pagu > rM.baris[0].pagu);
  // Item yang cuma ada di Perubahan -> YATIM saat versi murni dipilih. Bukan
  // cacat: belanja itu memang tidak punya rumah di dokumen murni.
  eq('AE15 item yang lahir di Perubahan jadi yatim di versi murni', rM.yatim.jumlahItem, 1);
  eq('AE16 dan nominalnya dilaporkan, tidak lenyap', rM.yatim.nominal, 90_000_000);
  eq('AE17 di versi perubahan ia punya rumah, jadi tidak yatim', rP.yatim.jumlahItem, 0);

  // -- Kalimat versinya: satu sumber untuk layar, kop, dan berkas -----------
  eq('AE18 label seq 0 tanpa angka', labelVersi('MURNI', 0), 'MURNI');
  eq('AE19 label seq > 0 memakai angka', labelVersi('PERUBAHAN', 1), 'PERUBAHAN-1');
  eq('AE20 MURNI ber-seq juga diberi angka', labelVersi('MURNI', 2), 'MURNI-2');

  const ringkas = ringkasVersiRekap(
    [{ sumber: 'GAJI', tipe: 'PERUBAHAN', seq: 1 }, { sumber: 'BLUD', tipe: 'MURNI', seq: 0 }], 'berlaku');
  ok('AE21 ringkasannya menyebut TIAP sumber beserta versinya',
     ringkas.includes('GAJI PERUBAHAN-1') && ringkas.includes('BLUD MURNI'));
  // Sumber yang tidak punya versi untuk pilihan ini disebut apa adanya --
  // menghilangkannya dari daftar adalah bentuk cacat yang sama dengan A9.
  const adaNull = ringkasVersiRekap(
    [{ sumber: 'GAJI', tipe: 'MURNI', seq: 0 }, { sumber: 'HARLEP', tipe: null, seq: 0 }], 'murni');
  ok('AE22 sumber tanpa versi murni disebut, bukan dihilangkan',
     adaNull.includes('HARLEP tidak punya versi murni'));
  ok('AE23 daftar kosong tidak berbunyi seolah ada acuannya',
     ringkasVersiRekap([], 'berlaku').includes('Belum ada versi'));

  eq('AE24 nama berkas bawaan tidak berubah', imbuhanBerkasVersi('berlaku'), '');
  eq('AE25 pilihan non-bawaan menandai nama berkasnya', imbuhanBerkasVersi('murni'), 'Murni-');
  // Nama berkas diuji UTUH, bukan cuma imbuhannya: imbuhan yang benar tapi
  // dipasang di tempat yang salah menghasilkan nama yang salah, dan itu baru
  // terlihat sesudah orang mengunduhnya. Angka-angka ini disalin dari unduhan
  // sungguhan di aplikasi (Rekap GAJI 2026, s/d September).
  eq('AE24b nama berkas Excel bawaan',
     namaBerkasRekap('berlaku', 'September', '2026', 'xlsx'),
     'Rekap-SemuaSumber-sd-September-2026.xlsx');
  eq('AE24c nama berkas PDF bawaan',
     namaBerkasRekap('berlaku', 'September', '2026', 'pdf'),
     'Rekap-SemuaSumber-sd-September-2026.pdf');
  eq('AE25b nama berkas Excel versi murni',
     namaBerkasRekap('murni', 'September', '2026', 'xlsx'),
     'Rekap-SemuaSumber-Murni-sd-September-2026.xlsx');
  eq('AE25c nama berkas PDF versi murni',
     namaBerkasRekap('murni', 'September', '2026', 'pdf'),
     'Rekap-SemuaSumber-Murni-sd-September-2026.pdf');
  ok('AE25d kedua pilihan tidak saling menimpa di folder unduhan',
     namaBerkasRekap('berlaku', 'September', '2026', 'xlsx')
     !== namaBerkasRekap('murni', 'September', '2026', 'xlsx'));

  // -- Versinya sampai ke BERKAS, bukan cuma ke layar ----------------------
  const aoaMurni = rekapAoa({
    baris: rM.baris, yatim: rM.yatim, tanpaRealisasi: false, sumberDinolkan: [],
    versiRekap: [{ sumber: 'GAJI', tipe: 'MURNI', seq: 0 }], pilihanVersi: 'murni',
    tahun: '2040', namaBulan: 'Oktober',
  });
  ok('AE26 kop Excel menyebut versinya', String(aoaMurni[4][0]).includes('GAJI MURNI'));
  eq('AE27 jumlah baris kop tidak bergeser', REKAP_JUDUL_BARIS, 6);
  eq('AE28 header tetap tepat di bawah kop', aoaMurni[REKAP_JUDUL_BARIS][0], 'No');

  const exAE = bersihkanKomentar(readFileSync('app/(dashboard)/kinerja/_exports.ts', 'utf8'));
  // Excel DAN PDF: dua nama berkas, dua kop -- dihitung kemunculannya supaya
  // memperbaiki satu saja tidak lolos (L82c).
  // Kedua pengekspor memakai penamaan yang SAMA — dua templat nama berkas yang
  // ditulis terpisah pasti berbeda bunyi begitu satu disunting.
  eq('AE29 Excel DAN PDF memakai satu fungsi penamaan',
     (exAE.match(/namaBerkasRekap\(params\.pilihanVersi/g) || []).length, 2);
  ok('AE29b tidak ada lagi templat nama berkas rekap yang ditulis tangan',
     !/`Rekap-SemuaSumber-/.test(exAE));
  eq('AE30 ringkasan versi masuk ke kop Excel DAN PDF',
     (exAE.match(/ringkasVersiRekap\(versiRekap, pilihanVersi\)/g) || []).length, 2);
  ok('AE31 params versinya WAJIB, bukan opsional bernilai bawaan',
     /versiRekap: VersiSumberRekap\[\];/.test(exAE) && !/versiRekap\?: /.test(exAE));

  // -- Layar & pemuatnya ---------------------------------------------------
  const ctAE = readFileSync('app/(dashboard)/kinerja/_tabs/CetakTab.tsx', 'utf8');
  ok('AE32 pemilihnya menawarkan dua keadaan',
     ctAE.includes("value: 'berlaku'") && ctAE.includes("value: 'murni'"));
  ok('AE33 pemilihnya tidak memegang state sendiri', !/setPilihanVersi/.test(ctAE));
  ok('AE34 versinya tampil di bilah alat DAN di kop yang tercetak',
     (ctAE.match(/\{ringkasVersi\}/g) || []).length === 2);

  const kcAE = bersihkanKomentar(readFileSync('app/(dashboard)/kinerja/kinerja-client.tsx', 'utf8'));
  ok('AE35 bawaannya "berlaku" — jawaban benar tanpa memilih apa pun',
     /useState<PilihanVersiRekap>\('berlaku'\)/.test(kcAE));
  ok('AE36 versi murni DIRESOLUSI dari daftar versi, bukan MURNI-0 mati',
     /versi-list\?tahun=/.test(kcAE) && /versiUntukPilihan\(slot, pilihan\)/.test(kcAE)
     && !/versi_tipe=MURNI&versi_seq=0/.test(kcAE));
  ok('AE37 tanpa versi murni: TIDAK dimuat, bukan jatuh ke versi berlaku',
     /if \(!diminta\) \{/.test(kcAE));
  ok('AE38 ganti pilihan = ganti pilihan DAN muat ulang, satu tindakan',
     /setPilihanVersi\(v\);\s*\n\s*void fetchRealisasiAll\(v\);/.test(kcAE));
  ok('AE39 pilihannya dioper eksplisit, tidak dibaca dari state yang belum berganti',
     /fetchRealisasiAll = useCallback\(async \(pilihan: PilihanVersiRekap = pilihanVersi\)/.test(kcAE));

  // Cabang "versi diminta eksplisit" WAJIB ikut melaporkan `dinolkan`, kalau
  // tidak spanduk A9 diam persis saat versi yang habis dinol-kan dipilih.
  const rtAE = bersihkanKomentar(readFileSync('app/api/kinerja/realisasi/route.ts', 'utf8'));
  ok('AE40 cabang versi-eksplisit ikut membawa bendera dinolkan',
     /versi: \{ tipe: versiTipe, seq: versiSeq, dinolkan \}/.test(rtAE));
  ok('AE41 benderanya datang dari kueri yang sama dengan itemnya, bukan kueri kedua',
     /const \{ rows, itemSsk, dinolkan \} = await getRealisasiHydrated\(tahun, sumber, versiTipe, versiSeq\)/.test(rtAE)
     && !/versiDinolkanSsk/.test(rtAE));

  // Laporan/KPI/Beranda SENGAJA tanpa pemilih: pertanyaannya "sekarang
  // bagaimana", dan itu satu jawaban (L88 tetap utuh).
  const ltAE = readFileSync('app/(dashboard)/kinerja/_tabs/LaporanTab.tsx', 'utf8');
  const dtAE = readFileSync('app/(dashboard)/kinerja/_tabs/DashboardTab.tsx', 'utf8');
  ok('AE42 Laporan & Beranda tidak dapat pemilih versi',
     !/pilihanVersi/.test(ltAE) && !/pilihanVersi/.test(dtAE));
}

console.log('\n-- AF. Perbaikan hasil audit: label tidak boleh berbohong --');

{
  const kcAF = bersihkanKomentar(readFileSync('app/(dashboard)/kinerja/kinerja-client.tsx', 'utf8'));

  // Dua pemuatan yang saling menyalip bisa selesai tidak berurutan, dan yang
  // selesai terakhir belum tentu yang terakhir diminta -- angka pilihan lama di
  // bawah label pilihan baru.
  ok('AF1 pemuatan Rekap bernomor giliran', /const giliran = \+\+giliranMuatRef\.current;/.test(kcAF));
  ok('AF2 hasil giliran basi DIBUANG sebelum state disentuh',
     /if \(giliran !== giliranMuatRef\.current\) return;/.test(kcAF));
  const iSet = kcAF.indexOf('setRealisasiAllRows(recalcAllRealisasi');
  const iBuang = kcAF.indexOf('if (giliran !== giliranMuatRef.current) return;');
  ok('AF3 pagar itu berdiri SEBELUM setter pertama', iBuang > 0 && iBuang < iSet);
  ok('AF4 hanya giliran terakhir yang mematikan penanda memuat',
     /if \(giliran === giliranMuatRef\.current\) setLoadingData\(false\);/.test(kcAF));

  // `fetchRealisasiAll` menerima `pilihan` sebagai argumen pertama, jadi ia
  // TIDAK boleh dioper langsung sebagai penangan: event klik akan mendarat di
  // situ (bentuk cacat `onClick={savePendapatan}` di catatan Tahap 9a).
  ok('AF5 layar Cetak menerima pembungkus tanpa argumen',
     /onFetchAll=\{muatRekap\}/.test(kcAF)
     && /const muatRekap = useCallback\(\(\) => \{ void fetchRealisasiAll\(\); \}/.test(kcAF));
  ok('AF6 dan bukan fungsi ber-argumen itu sendiri', !/onFetchAll=\{fetchRealisasiAll\}/.test(kcAF));

  // Ganti tahun sementara Rekap terbuka: kop & judul sudah mengumumkan tahun
  // baru, angkanya masih tahun lama.
  ok('AF7 ganti tahun memuat ulang Rekap yang sudah dimuat',
     /useEffect\(\(\) => \{ if \(rekapPernahDimuatRef\.current\) muatRekapRef\.current\(\); \}, \[tahun\]\);/.test(kcAF));
  ok('AF8 lewat ref, supaya ganti pilihan versi tidak memuat dua kali',
     /muatRekapRef\.current = muatRekap/.test(kcAF));

  // Syaratnya diuji positif: pilihan ketiga tidak boleh diam-diam masuk ke
  // cabang "murni" lalu memuat versi berlaku.
  ok('AF9 cabang versi diuji positif', /if \(pilihan === 'murni'\) \{/.test(kcAF));
  ok('AF10 bukan negasi', !/if \(pilihan !== 'berlaku'\) \{/.test(kcAF));

  // Sumber yang habis dinol-kan tidak punya item dan bisa belum punya
  // realisasi -- tanpa `dinolkan` di syaratnya ia hilang dari daftar versi kop
  // padahal catatan di bawah tabel sedang membicarakannya.
  ok('AF11 sumber dinol-kan tetap masuk daftar versi kop',
     /x\.versi\.tipe === null \|\| x\.dinolkan \|\| x\.itemSsk\.length > 0/.test(kcAF));

  // Kop rekap: satu sumber untuk teks, gaya, dan jumlah baris.
  const exAF = bersihkanKomentar(readFileSync('app/(dashboard)/kinerja/_exports.ts', 'utf8'));
  ok('AF12 ringkasan versi WAJIB dioper ke kopRekap, tanpa nilai bawaan',
     /export function kopRekap\(namaBulan: string, tahun: string, ringkasVersi: string\)/.test(exAF));
  ok('AF13 kalimat kop lama tidak bisa kembali sebagai bawaan',
     !/'Pagu & target mengacu SSK versi aktif/.test(exAF));
  ok('AF14 kop Excel diambil dari kopRekap, tidak ditulis ulang',
     /\.\.\.kopRekap\(namaBulan, tahun, ringkasVersiRekap\(versiRekap, pilihanVersi\)\)\.map/.test(exAF));
  ok('AF15 gaya sheet tidak lagi memanggil pembuat teks dgn argumen palsu',
     /GAYA_KOP_REKAP\.forEach/.test(exAF) && !/kopRekap\('', ''\)/.test(exAF));
  ok('AF16 jumlah baris kop diturunkan, bukan angka tetap',
     /REKAP_JUDUL_BARIS = GAYA_KOP_REKAP\.length \+ 1/.test(exAF));
  eq('AF16b dan nilainya tetap 6', REKAP_JUDUL_BARIS, 6);

  // Keadaan kosong: SSK-nya ada, versinya yang tidak.
  eq('AF17 sumber tanpa versi bisa dikenali',
     JSON.stringify(sumberTanpaVersi([
       { sumber: 'GAJI', tipe: 'MURNI', seq: 0 },
       { sumber: 'HARLEP', tipe: null, seq: 0 },
     ])), JSON.stringify(['HARLEP']));
  eq('AF17b dan daftar tanpa yang kosong memulangkan larik kosong',
     sumberTanpaVersi([{ sumber: 'GAJI', tipe: 'MURNI', seq: 0 }]).length, 0);
  const ctAF = readFileSync('app/(dashboard)/kinerja/_tabs/CetakTab.tsx', 'utf8');
  ok('AF18 keadaan kosong menyebut "tidak punya versi murni", bukan "isi RKO/SSK dulu"',
     /tanpaVersi\.length > 0/.test(ctAF) && ctAF.includes('tidak punya versi murni'));
  ok('AF19 dan menunjukkan jalan keluarnya', ctAF.includes('Pilih <strong>Versi Berlaku</strong>'));

  // Tooltip: kedua sumbu, dan lebar tanpa bilah gulir.
  ok('AF20 letak tooltip membalik ke bawah kalau ruang di atas tidak cukup',
     letakTip({ left: 300, right: 330, width: 30, top: 10, bottom: 36 }, 1400).ty === '0%');
  eq('AF21 dan titik jangkarnya pindah ke bawah pemiliknya',
     letakTip({ left: 300, right: 330, width: 30, top: 10, bottom: 36 }, 1400).top, 42);
  ok('AF22 ruang cukup -> tetap di atas',
     letakTip({ left: 300, right: 330, width: 30, top: 400, bottom: 426 }, 1400).ty === '-100%');
  eq('AF23 dan jangkarnya di atas pemiliknya',
     letakTip({ left: 300, right: 330, width: 30, top: 400, bottom: 426 }, 1400).top, 394);
  ok('AF24 nilai tegaknya bersatuan — calc() batal kalau 0 telanjang',
     ['0%', '-100%'].includes(letakTip({ left: 300, right: 330, width: 30, top: 10, bottom: 36 }, 1400).ty));
  const tipAF = bersihkanKomentar(readFileSync('components/ui/Tip.tsx', 'utf8'));
  ok('AF25 lebar diukur tanpa bilah gulir', /document\.documentElement\.clientWidth/.test(tipAF)
     && !/window\.innerWidth/.test(tipAF));
  ok('AF26 dan --tip-ty ikut dikirim ke CSS', /'--tip-ty': pos\.ty/.test(tipAF));
  const cssAF = readFileSync('app/globals.css', 'utf8');
  ok('AF27 keyframes memakai variabel tegaknya juga',
     /transform: translate\(var\(--tip-tx\), calc\(var\(--tip-ty\) \+ 4px\)\)/.test(cssAF));

  // Cermin klien berhenti mengecilkan kontrak servernya.
  const tyAF = readFileSync('app/(dashboard)/kinerja/_types.ts', 'utf8');
  ok('AF28 bendera A9 di cermin klien wajib, bukan opsional',
     /versi_dinolkan: boolean;/.test(tyAF) && !/versi_dinolkan\?: /.test(tyAF)
     && /sumber_dinolkan: SumberSSK\[\];/.test(tyAF));
}

console.log('\n-- AG. Penyaring komentar: satu bentuk untuk seluruh suite --');

{
  // Pemeriksaan "tidak boleh ada lagi" membaca berkas sebagai TEKS, jadi ia tak
  // bisa membedakan kode dari komentar. Selama penyaringnya cuma membuang
  // komentar BARIS, satu JSDoc yang MENYEBUT bentuk terlarang melahirkan dua
  // akibat: tes gagal padahal kodenya benar, atau — lebih buruk — pemeriksaan
  // "harus ADA" lulus karena menemukannya di dalam prosa.
  const contoh = [
    '/** Dulu memakai terlarang(); jangan lagi. */',
    '  // terlarang() sudah dibuang',
    'const b = terlarang();',
    "const url = 'https://a.b'; // ekor",
  ].join('\n');
  const bersih = bersihkanKomentar(contoh);
  eq('AG1 komentar blok dan komentar baris dibuang',
     (bersih.match(/terlarang\(\)/g) || []).length, 1);
  ok('AG2 dan yang tersisa memang kodenya', /const b = terlarang\(\);/.test(bersih));

  // Komentar EKOR sengaja DIBIARKAN: `//` juga hidup di dalam string (URL) dan
  // regex, jadi membuangnya merusak kode yang sah. Batasnya dituliskan di sini
  // supaya yang berikutnya tahu itu pilihan, bukan kelalaian.
  ok('AG3 komentar ekor dibiarkan, dan URL di depannya utuh',
     bersih.includes("'https://a.b'; // ekor"));

  // Anti-kambuh: seluruh suite lewat satu pintu.
  eq('AG4 hanya penolong ini yang menyaring komentar di suite ini',
     (readFileSync('scripts/test-kinerja-rekap.mts', 'utf8')
       .match(/\.replace\(\/\^\[ /g) || []).length, 1);
}

console.log(`\n${lulus} lulus, ${gagal.length} gagal`);
if (gagal.length) { gagal.forEach(g => console.log('  - ' + g)); process.exit(1); }
