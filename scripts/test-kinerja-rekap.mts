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
import { rekapAoa, REKAP_JUDUL_BARIS } from '../app/(dashboard)/kinerja/_exports';
import type { RealRow, SskMonths } from '../app/(dashboard)/kinerja/_types';

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
eq('J5 ketiga skema menerima force', (zod.match(/^\s*force:\s*z\.boolean\(\)\.optional\(\),/gm) || []).length, 3);

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

eq('L1 dua kueri agregat ikut diperbaiki',
   (kode.match(/MAX\(CASE WHEN real_fisik <> 0 OR real_keuangan <> 0 THEN bulan END\)/g) || []).length, 2);
ok('L2 MAX(bulan) polos sudah tidak dipakai', !/COALESCE\(MAX\(bulan\), 0\)/.test(kode));

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
ok('M8 PDF mencetak target fisik dengan tanda %',
   /r\.target_fisik\.toFixed\(2\)\+'%'/.test(ex));

console.log('\n── N. Unduh rekap: angkanya sama dengan yang di layar ───────────');

const aoa = rekapAoa({ baris: hasil.baris, yatim: hasil.yatim, tahun: '2026', namaBulan: 'Juli' });
eq('N1 header berdiri tepat di bawah kop', aoa[REKAP_JUDUL_BARIS][0], 'No');
eq('N2 jumlah kolom header sama dengan tabel layar', aoa[REKAP_JUDUL_BARIS].length, 11);
ok('N3 kop menyebut bulan & tahun', String(aoa[3][0]).includes('JULI') && String(aoa[3][0]).includes('2026'));
ok('N4 kop menyebut versi acuan', String(aoa[4][0]).includes('versi aktif'));

// Angka WAJIB diambil dari baris yang sudah dihitung, bukan dihitung ulang.
const gt = aoa[REKAP_JUDUL_BARIS + 1];
eq('N5 pagu grand total sama dengan layar', gt[2], hasil.baris[0].pagu);
eq('N6 target Rp sama dengan layar', gt[7], hasil.baris[0].targetRp);
eq('N7 deviasi keuangan sama dengan layar', gt[10], hasil.baris[0].devKeu);

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
eq('N12 KEDUA tombol unduh memakai baris hasil hitungan layar',
   (ct.match(/baris: rekap\.baris, yatim: rekap\.yatim/g) || []).length, 2);
// hitungRekap hanya boleh dipanggil SEKALI — di useMemo. Panggilan kedua di mana
// pun berarti dokumen yang diunduh berdiri di atas hitungan sendiri.
eq('N13 hitungRekap dipanggil tepat sekali di seluruh berkas',
   (ct.match(/hitungRekap\(/g) || []).length, 1);
ok('N14 panggilan tunggal itu memang di useMemo',
   /const rekap = useMemo\(\s*\(\) =>[\s\S]{0,200}hitungRekap\(/.test(ct));

console.log(`\n${lulus} lulus, ${gagal.length} gagal`);
if (gagal.length) { gagal.forEach(g => console.log('  - ' + g)); process.exit(1); }
