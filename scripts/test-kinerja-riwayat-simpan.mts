// scripts/test-kinerja-riwayat-simpan.mts — regresi Tahap 9 (pagar + riwayat simpan).
// Jalankan: npx tsx scripts/test-kinerja-riwayat-simpan.mts
//
// Konsep: docs/CONCEPT-kinerja-riwayat-simpan.md
//
// Sebagian besar pemeriksaan di sini STATIS (membaca sumber), karena yang dijaga
// adalah URUTAN pernyataan di dalam transaksi — hal yang tidak bisa dibuktikan
// tanpa DB dan tidak bisa ditangkap tsc. Dua kehati-hatian yang WAJIB:
//
//   1. Jendela pemeriksaan dipotong PER BADAN FUNGSI. Mencari mundur lintas
//      berkas menemukan pagar milik fungsi LAIN, dan asersinya lulus karena
//      alasan yang salah (kejadian nyata di suite test-kinerja-rekap).
//   2. KOMENTAR DIBUANG DULU. Prosa yang menjelaskan bug lama memuat kata-kata
//      yang sama dengan kodenya, jadi tes bisa menyalakan dirinya sendiri (L82c).

import { readFileSync } from 'node:fs';
import { hitungTotalNilai } from '../lib/kinerja/riwayat-simpan';
import { RIWAYAT_RETENSI_KINERJA } from '../lib/kinerja/riwayat-konstanta';
import { waktuSekarangWIB, JAKARTA_OFFSET_MS } from '../lib/shared/waktu-wib';

let lulus = 0;
const gagal: string[] = [];
function ok(nama: string, syarat: boolean, ket = '') {
  if (syarat) { lulus++; console.log(`  ok  ${nama}`); }
  else { gagal.push(nama); console.log(`FAIL  ${nama}${ket ? ' — ' + ket : ''}`); }
}
function eq(nama: string, dapat: unknown, harap: unknown) {
  ok(nama, Object.is(dapat, harap), `dapat ${JSON.stringify(dapat)}, harap ${JSON.stringify(harap)}`);
}
function bab(judul: string) { console.log(`\n${judul}`); }

const baca = (p: string) => readFileSync(p, 'utf8');

/** Buang komentar // dan block, supaya prosa tidak ikut dicocokkan. */
function tanpaKomentar(kode: string): string {
  return kode.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
}

/**
 * Badan satu fungsi `export async function nama(` sampai `\n}` pertama di kolom 0.
 * Tanpa pemotongan ini, `indexOf`/`lastIndexOf` menyeberang ke fungsi tetangga.
 */
function badanFungsi(kode: string, nama: string): string {
  const i = kode.indexOf(`export async function ${nama}(`);
  if (i < 0) return '';
  const j = kode.indexOf('\n}\n', i);
  return tanpaKomentar(kode.slice(i, j < 0 ? kode.length : j));
}

/** Berapa kali `pola` muncul di `teks`. */
function hitung(teks: string, pola: string): number {
  return teks.split(pola).length - 1;
}

const KINERJA   = baca('lib/data/kinerja.ts');
const SCHEMAS   = baca('lib/data/kinerja-schemas.ts');
const RIWAYAT   = baca('lib/kinerja/riwayat-simpan.ts');
const KONFIRM   = baca('lib/kinerja/konfirmasi-simpan.ts');
const ROUTE_RIW = baca('app/api/kinerja/riwayat-simpan/route.ts');

// ═════════════════════════════════════════════════════════════════════════════
bab('A. Urutan — snapshot ditulis SEBELUM jalan keluar dini');

// Tiga fungsi, tiga posisi `return` dini yang berbeda. Menaruh snapshot "di akhir
// fungsi" melewatkan simpanan kosong berpaksa — justru yang paling perlu ditarik balik.
const F_SSK  = badanFungsi(KINERJA, 'saveSskBatch');
const F_REAL = badanFungsi(KINERJA, 'saveRealisasiBatch');
const F_REK  = badanFungsi(KINERJA, 'saveRekeningBatch');

ok('badan ketiga fungsi ketemu', F_SSK.length > 0 && F_REAL.length > 0 && F_REK.length > 0);

for (const [nama, badan] of [['SSK', F_SSK], ['Realisasi', F_REAL], ['Rekening', F_REK]] as const) {
  ok(`${nama}: catatRiwayatSimpan dipanggil`, badan.includes('catatRiwayatSimpan(tx,'));
}

// Realisasi & Rekening punya `if (rows.length === 0) return;` — snapshot harus di ATASnya.
for (const [nama, badan] of [['Realisasi', F_REAL], ['Rekening', F_REK]] as const) {
  const iSnap = badan.indexOf('catatRiwayatSimpan(tx,');
  const iRet  = badan.indexOf('if (rows.length === 0) return;');
  ok(`${nama}: punya jalan keluar dini yang harus dilewati`, iRet > 0);
  ok(`${nama}: snapshot mendahului return dini`, iSnap > 0 && iRet > 0 && iSnap < iRet,
    `snapshot@${iSnap} return@${iRet}`);
}

// SSK tidak punya return dini; yang harus dijaga: snapshot SESUDAH bump gembok,
// supaya `versi_ke` menyatakan angka yang benar-benar berlaku.
{
  const iBump = F_SSK.indexOf('ON DUPLICATE KEY UPDATE version = version + 1');
  const iSnap = F_SSK.indexOf('catatRiwayatSimpan(tx,');
  ok('SSK: snapshot sesudah bump gembok', iBump > 0 && iSnap > iBump, `bump@${iBump} snapshot@${iSnap}`);
  ok('SSK: tidak ada return dini yang bisa melewatinya', !F_SSK.includes('if (rows.length === 0) return;'));
}

// DELETE harus sudah lewat — snapshot memotret payload, bukan isi lama.
for (const [nama, badan, tabel] of [
  ['SSK', F_SSK, 'DELETE FROM kinerja_ssk'],
  ['Realisasi', F_REAL, 'DELETE FROM kinerja_realisasi'],
  ['Rekening', F_REK, 'DELETE FROM kinerja_rekening'],
] as const) {
  const iDel  = badan.indexOf(tabel);
  const iSnap = badan.indexOf('catatRiwayatSimpan(tx,');
  ok(`${nama}: snapshot sesudah DELETE`, iDel > 0 && iSnap > iDel, `delete@${iDel} snapshot@${iSnap}`);
}

// `versi_ke` Rekening WAJIB null — fungsi itu memang tidak punya gembok.
ok('Rekening: versiKe null (memang tanpa gembok)', /versiKe:\s*null/.test(F_REK));
ok('Rekening: benar tidak punya gembok', !F_REK.includes('blud_locks'));
for (const [nama, badan] of [['SSK', F_SSK], ['Realisasi', F_REAL]] as const) {
  ok(`${nama}: versiKe = expectedVersion + 1`, badan.includes('expectedVersion + 1'));
}

// Jenis tidak boleh tertukar — snapshot Realisasi berlabel SSK akan tampil di layar salah.
eq('SSK: berlabel SSK',            hitung(F_SSK,  "jenis: 'SSK'"), 1);
eq('Realisasi: berlabel REALISASI', hitung(F_REAL, "jenis: 'REALISASI'"), 1);
eq('Rekening: berlabel REKENING',   hitung(F_REK,  "jenis: 'REKENING'"), 1);

// Versi hanya berlaku untuk SSK.
ok('SSK: membawa versiTipe/versiSeq',      /versiTipe,\s*versiSeq/.test(F_SSK));
ok('Realisasi: versi null (tidak berversi)', /versiTipe:\s*null,\s*versiSeq:\s*null/.test(F_REAL));
ok('Rekening: versi null (tidak berversi)',  /versiTipe:\s*null,\s*versiSeq:\s*null/.test(F_REK));

// ═════════════════════════════════════════════════════════════════════════════
bab('B. Retensi memakai `<=>`, bukan `=`');

{
  // Dibatasi ke BADAN catatRiwayatSimpan. Membaca sampai akhir berkas ikut
  // menangkap `<=>` milik getRiwayatKinerja, jadi hitungannya 3 dan asersinya
  // ribut soal hal yang benar — jendela yang salah, bukan kodenya (L82c).
  const iFn  = RIWAYAT.indexOf('export async function catatRiwayatSimpan');
  const isi  = tanpaKomentar(RIWAYAT.slice(iFn, RIWAYAT.indexOf('\n}\n', iFn)));
  const iDel = isi.indexOf('DELETE FROM kinerja_riwayat_simpan');
  const del  = isi.slice(iDel);
  ok('blok pemangkasan ketemu', iFn > 0 && iDel > 0);
  // DUA cabang: WHERE luar + subquery. Dicacah, bukan ditanya "ada?" — memperbaiki
  // satu cabang saja sudah cukup untuk membuat asersi "ada" lulus.
  eq('kolom versi dibandingkan `<=>` di kedua cabang', hitung(del, 'versi_tipe <=> '), 2);
  eq('versi_seq juga `<=>` di kedua cabang',           hitung(del, 'versi_seq <=> '), 2);
  ok('tidak ada `versi_tipe =` polos di jalur hapus', !/versi_tipe = \$?\{/.test(del));
  ok('lingkup pemangkasan menyebut sumber', hitung(del, 'sumber = ') === 2);
  ok('LIMIT lewat sqlInt (mysql2 tolak LIMIT ?)', del.includes('LIMIT ${sqlInt('));
  ok('derived table `t` (MySQL tolak subquery ke tabel yang di-DELETE)', del.includes(') t'));
}

eq('retensi 50', RIWAYAT_RETENSI_KINERJA, 50);
// Komentar dibuang dulu: berkas itu MENJELASKAN kenapa ia tidak boleh mengimpor
// `@/lib/data/db`, jadi prosanya sendiri yang menjatuhkan asersinya (L82c).
ok('konstanta tinggal di berkas tanpa impor DB',
  !tanpaKomentar(baca('lib/kinerja/riwayat-konstanta.ts')).includes('@/lib/data/db'));

// ═════════════════════════════════════════════════════════════════════════════
bab('C. Menerima `tx`, bukan `sql`');

ok('catatRiwayatSimpan bertipe Penanya', /catatRiwayatSimpan\(tx: Penanya,/.test(RIWAYAT));
{
  // Badan fungsinya tidak boleh menyentuh `sql` pool — kalau ya, snapshot untuk
  // simpanan yang di-rollback tetap tertinggal.
  const i = RIWAYAT.indexOf('export async function catatRiwayatSimpan');
  const j = RIWAYAT.indexOf('\n}\n', i);
  const badan = tanpaKomentar(RIWAYAT.slice(i, j));
  ok('badan catatRiwayatSimpan tidak memakai `sql`', !/await sql`/.test(badan));
  eq('dua pernyataan tx (INSERT + pangkas)', hitung(badan, 'await tx`'), 2);
}

// ═════════════════════════════════════════════════════════════════════════════
bab('D. Pagar replace-all — KEENAM jalur, bukan tiga');

const JALUR: [string, string][] = [
  ['saveSskBatch',        'DELETE FROM kinerja_ssk'],
  ['saveRealisasiBatch',  'DELETE FROM kinerja_realisasi'],
  ['saveRekeningBatch',   'DELETE FROM kinerja_rekening'],
  ['saveNomenBatch',      'DELETE FROM kinerja_realisasi_nomen'],
  ['saveCrrBatch',        'DELETE FROM kinerja_pendapatan_crr'],
  ['savePendapatanBatch', 'DELETE FROM kinerja_pendapatan_real'],
];
for (const [fn, del] of JALUR) {
  const badan = badanFungsi(KINERJA, fn);
  const iPagar = badan.indexOf('pagarReplace(');
  const iDel   = badan.indexOf(del);
  ok(`${fn}: memanggil pagarReplace`, iPagar > 0);
  ok(`${fn}: pagar dibaca SEBELUM DELETE`, iPagar > 0 && iDel > 0 && iPagar < iDel,
    `pagar@${iPagar} delete@${iDel}`);
  ok(`${fn}: menerima force`, /force = false,/.test(badan) || /force: boolean/.test(badan));
}

// `force` tanpa jalan keluar = 409 buntu. Enam skema, enam `force`.
{
  const s = tanpaKomentar(SCHEMAS);
  eq('enam skema body punya force', hitung(s, 'force:'), 6);
  for (const nm of ['SskBodySchema', 'RekeningBodySchema', 'RealisasiBodySchema', 'NomenBodySchema']) {
    const i = s.indexOf(`export const ${nm} = z.object({`);
    const j = s.indexOf('});', i);
    ok(`${nm} punya force`, i > 0 && s.slice(i, j).includes('force:'));
  }
  // Discriminated union: KEDUA cabang, bukan salah satunya.
  const i = s.indexOf('export const PendapatanBodySchema');
  const j = s.indexOf(']);', i);
  eq('PendapatanBodySchema: force di kedua cabang', hitung(s.slice(i, j), 'force:'), 2);
}

// Ketiga route baru menerjemahkan pagarnya jadi 409 yang bisa dijawab klien.
for (const p of ['app/api/kinerja/realisasi/nomen/route.ts', 'app/api/kinerja/pendapatan/route.ts']) {
  const r = baca(p);
  ok(`${p.split('/').slice(-2).join('/')}: kenal KinerjaReplaceSafetyError`, r.includes('KinerjaReplaceSafetyError'));
  ok(`${p.split('/').slice(-2).join('/')}: memulangkan PENURUNAN_DRASTIS`, r.includes("'PENURUNAN_DRASTIS'"));
}
{
  // Dua cabang pendapatan, dua-duanya harus lewat penerjemah yang sama.
  const r = tanpaKomentar(baca('app/api/kinerja/pendapatan/route.ts'));
  eq('pendapatan: dua cabang memakai terjemahPagar', hitung(r, 'terjemahPagar(err)'), 2);
  eq('pendapatan: dua cabang mengoper force',        hitung(r, 'force ?? false'), 2);
}
{
  const t = tanpaKomentar(baca('app/(dashboard)/kinerja/_tabs/PendapatanCrrTab.tsx'));
  eq('layar Pendapatan/CRR: dua tombol menjawab pagarnya', hitung(t, 'konfirmasiPenurunan('), 2);
  // Event klik jadi argumen pertama = `force` truthy = pagar ditembus tiap simpan.
  ok('tombol CRR dibungkus arrow',        t.includes('onClick={() => saveCrr()}'));
  ok('tombol Pendapatan dibungkus arrow', t.includes('onClick={() => savePendapatan()}'));
}

// ═════════════════════════════════════════════════════════════════════════════
bab('E. hitungTotalNilai — perilaku, bukan teks');

const barisSsk  = [{ pagu: 7_000_000_000 }, { pagu: 40_937_377_000 }, { pagu: 0 }];
const barisReal = [{ real_keuangan: 1_500_000 }, { real_keuangan: 2_500_000.5 }, { real_fisik: 999 }];

eq('SSK menjumlah pagu',            hitungTotalNilai('SSK', barisSsk), 47_937_377_000);
eq('REALISASI menjumlah real_keuangan', hitungTotalNilai('REALISASI', barisReal), 4_000_000.5);
eq('REKENING nol (memang tanpa uang)',  hitungTotalNilai('REKENING', barisSsk), 0);
eq('larik kosong nol',              hitungTotalNilai('SSK', []), 0);
eq('kolom hilang dianggap nol',     hitungTotalNilai('SSK', [{ uraian: 'x' }]), 0);
eq('nilai bukan angka tidak jadi NaN', hitungTotalNilai('SSK', [{ pagu: 'abc' }, { pagu: 10 }]), 10);
// REALISASI tidak boleh diam-diam menjumlah pagu — dua kolom, dua arti.
eq('REALISASI mengabaikan pagu', hitungTotalNilai('REALISASI', [{ pagu: 999 }]), 0);

// ═════════════════════════════════════════════════════════════════════════════
bab('F. Stempel waktu WIB, bukan jam server');

{
  // 2026-09-04 19:30 UTC = 2026-09-05 02:30 WIB. Kalau memakai UTC apa adanya,
  // snapshot dini hari mengaku milik hari kemarin.
  const diniHariUTC = Date.UTC(2026, 8, 4, 19, 30, 0);
  eq('offset WIB', JAKARTA_OFFSET_MS, 7 * 60 * 60 * 1000);
  eq('dini hari WIB dapat tanggal esoknya', waktuSekarangWIB(diniHariUTC), '2026-09-05 02:30:00');
  ok('tanpa sisipan T/Z (MySQL menolaknya)', !/[TZ]/.test(waktuSekarangWIB(diniHariUTC)));
}
ok('stempel dari lib bersama, bukan berkas khas BLUD',
  RIWAYAT.includes("from '@/lib/shared/waktu-wib'"));
ok('tanggal.ts tetap me-re-export supaya pemanggil lama utuh',
  baca('lib/blud/tanggal.ts').includes('export { JAKARTA_OFFSET_MS, waktuSekarangWIB }'));
ok('INSERT memakai stempel WIB, bukan NOW()',
  RIWAYAT.includes('${waktuSekarangWIB()}') && !RIWAYAT.includes('NOW()'));

// ═════════════════════════════════════════════════════════════════════════════
bab('G. Route baca — pagar, angka gembok segar, audit');

ok('sakelar maintenance (gate G memindainya)', ROUTE_RIW.includes('kinerjaMati(session.role)'));
ok('pagar peran sama dengan route kinerja lain', ROUTE_RIW.includes('isKinerjaRole'));
ok('rate limit', ROUTE_RIW.includes('kinerjaRateLimit('));
ok('BACA-SAJA: tidak ada handler tulis',
  !/export async function (PUT|POST|DELETE|PATCH)/.test(ROUTE_RIW));
ok('?id= memulangkan angka gembok yang dibaca SAAT ITU (L77)',
  ROUTE_RIW.includes('await getKinerjaVersion(') && ROUTE_RIW.includes('version'));
ok('gembok tidak diambil dari versi_ke snapshot', !/version.*data\.versi_ke/.test(ROUTE_RIW));
ok('audit dicatat saat ISI diambil', ROUTE_RIW.includes("'KINERJA_RIWAYAT_PULIHKAN'"));
{
  // Audit HARUS di cabang ?id=, bukan di daftar: membuka daftar bukan niat memulihkan.
  const i = ROUTE_RIW.indexOf('if (idRaw) {');
  const j = ROUTE_RIW.indexOf('const jenis = JenisRiwayatSchema');
  ok('audit hanya di cabang ?id=',
    ROUTE_RIW.slice(i, j).includes('KINERJA_RIWAYAT_PULIHKAN'));
}
// DUA kolom (tipe + seq), jadi dicacah. `jenis === 'SSK'` polos juga muncul di
// `kunciGembok`, sehingga asersi "ada" lulus walau pemaksaannya sudah dicabut.
eq('jenis non-SSK dipaksa versi null di KEDUA kolom (kalau tidak daftarnya kosong senyap)',
  hitung(tanpaKomentar(ROUTE_RIW), "j === 'SSK' ? "), 2);
ok('KINERJA_RIWAYAT_PULIHKAN terdaftar di AuditEventType',
  baca('lib/security/auditlog.ts').includes("'KINERJA_RIWAYAT_PULIHKAN'"));

// ═════════════════════════════════════════════════════════════════════════════
bab('H. asal_pulihkan — dipasang, dioper, DAN dilepas');

const TABS: [string, string, string[]][] = [
  ['Realisasi', 'app/(dashboard)/kinerja/_tabs/RealisasiTab.tsx', ['applyImport', 'initRealisasiFromSSK']],
  ['SSK',       'app/(dashboard)/kinerja/_tabs/SskTab.tsx',       ['injectRekening', 'onApply']],
  ['Rekening',  'app/(dashboard)/kinerja/_tabs/RekeningTab.tsx',  ['terapkanImport']],
];
for (const [nama, p, jalur] of TABS) {
  const t = tanpaKomentar(baca(p));
  ok(`${nama}: mengirim asal_pulihkan di body Simpan`, t.includes('asal_pulihkan: asalPulihkanRef.current'));
  ok(`${nama}: mengisinya saat memulihkan`, /asalPulihkanRef\.current = \{ id: item\.id/.test(t));
  // Dilepas di tiap jalur pengganti isi + sesudah Simpan berhasil. Kalau
  // tertinggal, simpan berikutnya mengaku pulihan padahal bukan.
  ok(`${nama}: dilepas di ${jalur.length + 1} tempat (${jalur.join(', ')} + sesudah Simpan)`,
    hitung(t, 'asalPulihkanRef.current = null') >= jalur.length + 1,
    `ketemu ${hitung(t, 'asalPulihkanRef.current = null')}`);
}
{
  const s = tanpaKomentar(SCHEMAS);
  eq('tiga skema body menerima asal_pulihkan', hitung(s, 'asal_pulihkan: AsalPulihkanSchema.optional()'), 3);
  ok('jejakPulihkan satu fungsi bersama', s.includes('export function jejakPulihkan('));
}
for (const p of ['app/api/kinerja/ssk/route.ts', 'app/api/kinerja/realisasi/route.ts', 'app/api/kinerja/rekening/route.ts']) {
  ok(`${p.split('/').slice(-2)[0]}: detail audit memuat jejakPulihkan`,
    baca(p).includes('+ jejakPulihkan(asal_pulihkan)'));
}

// ═════════════════════════════════════════════════════════════════════════════
bab('I. Kalimat konfirmasi berhenti berbohong');

ok('tidak lagi mengaku "tidak ada riwayat"', !KONFIRM.includes('tidak ada riwayat'));
ok('menunjuk tombol yang MEMANG ada di layar', KONFIRM.includes('Riwayat Simpan'));
ok('tetap menyarankan batal + muat ulang kalau tabelnya belum penuh',
  KONFIRM.includes('muat ulang halaman'));

// ═════════════════════════════════════════════════════════════════════════════
bab('J. Modal dipakai bersama, bukan disalin tiga kali');

{
  const m = baca('components/kinerja/RiwayatSimpanModal.tsx');
  ok('modal menerima jenis sebagai prop', /jenis:\s+JenisRiwayat;/.test(m));
  ok('modal tidak menulis apa pun', !/method:\s*'(PUT|POST|DELETE)'/.test(m));
  // Menyebutnya di daftar prop tidak berarti kalimatnya memakainya — yang dijaga
  // interpolasinya di dalam pesan, bukan keberadaan namanya di berkas.
  ok('konfirmasi menyebut jumlah baris yang akan DIGANTI',
    m.includes('${barisSekarang} baris yang sekarang di layar'));
  ok('konfirmasi menyebut jumlah baris snapshot', m.includes('${it.jumlah_baris} baris'));
  ok('menegaskan belum tersimpan', m.includes('belum tersimpan'));
  ok('membaca retensi dari berkas aman-peramban',
    m.includes("from '@/lib/kinerja/riwayat-konstanta'"));
  ok('TIDAK menarik riwayat-simpan.ts (mysql2 ikut ke bundel peramban)',
    !m.includes("from '@/lib/kinerja/riwayat-simpan'"));
  let dipakai = 0;
  for (const [, p] of TABS) if (baca(p).includes('<RiwayatSimpanModal')) dipakai++;
  eq('dipakai ketiga tab', dipakai, 3);
}

// ═════════════════════════════════════════════════════════════════════════════
bab('K. Migrasi & schema sejalan');

for (const [nama, p] of [['migrasi', 'docs/migrations/migration-kinerja-riwayat-simpan.sql'],
                         ['schema',  'docs/schema-mysql.sql']] as const) {
  const sqlSrc = baca(p);
  const i = sqlSrc.indexOf('CREATE TABLE IF NOT EXISTS kinerja_riwayat_simpan');
  const blok = sqlSrc.slice(i, sqlSrc.indexOf(';', i));
  ok(`${nama}: tabelnya ada`, i > 0);
  ok(`${nama}: tahun VARCHAR (ikut kinerja_*, bukan SMALLINT)`, /tahun\s+VARCHAR\(10\)/.test(blok));
  ok(`${nama}: versi_tipe NULL`, /versi_tipe\s+ENUM\('MURNI','PERUBAHAN'\)\s+NULL/.test(blok));
  ok(`${nama}: versi_ke NULL`,   /versi_ke\s+INT UNSIGNED\s+NULL/.test(blok));
  ok(`${nama}: isi JSON NOT NULL`, /isi\s+JSON\s+NOT NULL/.test(blok));
  ok(`${nama}: FK user ON DELETE SET NULL`, blok.includes('ON DELETE SET NULL'));
}

// ─────────────────────────────────────────────────────────────────────────────
console.log(`\n${lulus} lulus, ${gagal.length} gagal`);
for (const g of gagal) console.log('  - ' + g);
process.exit(gagal.length ? 1 : 0);
