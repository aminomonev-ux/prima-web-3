// scripts/test-kinerja-import-rekening.mts
//
// Penjaga Import/Unduh E-Anggaran (tab Rekening & Master).
//
// Dua hal yang dijaga, dan keduanya pernah menggigit di modul lain:
//   1. urutan pengenalan judul kolom — "Sub Kegiatan" juga mengandung kata
//      "kegiatan", "Uraian SSK" juga mengandung "uraian". Salah urutan = seluruh
//      baris melenceng satu kolom, tanpa satu galat pun.
//   2. lingkaran Unduh → Import: berkas hasil ekspor aplikasi WAJIB terbaca oleh
//      importnya sendiri (di modul IKI hal ini pernah gagal dan baru ketahuan
//      dari laporan pemakai).
//
// Berkas ujinya dibangun di sini dengan exceljs, jadi tes ini jalan di mana saja.
// Kalau ketiga berkas asli ada di folder Downloads, bagian H ikut menguji itu.
//
// Jalankan: npx tsx scripts/test-kinerja-import-rekening.mts

import fs from 'node:fs';
import ExcelJS from 'exceljs';
import { parseRekeningImport, sumberDariNama } from '../lib/data/kinerja-import-rekening';
import { parseMasterImport, tipeDariSheet } from '../lib/data/kinerja-import-master';
import {
  bandingkanRekening, ringkasImpor, terapkanTambah, terapkanTimpa,
  masterKurang, bandingkanMaster,
  type BarisRekening, type MasterTersedia,
} from '../lib/kinerja/gabung-rekening';

let lulus = 0, gagal = 0;
const bab = (j: string) => console.log(`\n── ${j} ──`);
function ok(n: string, v?: unknown) { lulus++; console.log(`  ok   ${n.padEnd(56)} ${v ?? ''}`); }
function salah(n: string, harap: unknown, dapat: unknown) {
  gagal++;
  console.log(`  GAGAL ${n}\n        harap: ${JSON.stringify(harap)}\n        dapat: ${JSON.stringify(dapat)}`);
}
function cek(n: string, harap: unknown, dapat: unknown) {
  if (JSON.stringify(harap) === JSON.stringify(dapat)) ok(n, JSON.stringify(dapat));
  else salah(n, harap, dapat);
}
function benar(n: string, syarat: boolean, catatan = '') {
  if (syarat) ok(n, catatan); else salah(n, true, false);
}

async function buatBerkas(sheet: string, header: string[], baris: string[][]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheet);
  ws.addRow(header);
  for (const b of baris) ws.addRow(b);
  const out = await wb.xlsx.writeBuffer();
  return Buffer.isBuffer(out) ? out : Buffer.from(out as ArrayBuffer);
}

const P = 'PROGRAM PENUNJANG URUSAN PEMERINTAHAN DAERAH PROVINSI';
const K = 'Peningkatan Pelayanan BLUD';
const S = 'Pelayanan dan Penunjang Pelayanan BLUD **';

// ── A. Berkas bergaya sistem luar (judul kolom terakhir cuma "Sumber") ──────
bab('A. Berkas dengan judul "Sumber" (bukan "Sumber Anggaran")');
{
  const buf = await buatBerkas('REKENING BLUD',
    ['No', 'Program', 'Kegiatan', 'Sub Kegiatan', 'Uraian SSK', 'Rekening Belanja', 'Sumber'],
    [
      ['1', P, K, S, 'Penyediaan Barang dan Jasa BLUD', 'Belanja Barang dan Jasa BLUD', 'BLUD'],
      ['2', P, K, S, 'Penyediaan Belanja Pegawai BLUD', 'Belanja Pegawai BLUD', 'BLUD'],
    ]);
  const h = await parseRekeningImport(buf);
  cek('jumlah baris', 2, h.rows.length);
  cek('sumber dari nama sheet', 'BLUD', h.sumberSheet);
  cek('baris 1 utuh',
    { program: P, kegiatan: K, subkegiatan: S, uraian_ssk: 'Penyediaan Barang dan Jasa BLUD', uraian: 'Belanja Barang dan Jasa BLUD', sumber_anggaran: 'BLUD' },
    h.rows[0]);
  cek('kolom "No" tidak dicuri jadi field', ['Kolom B', 'Kolom C', 'Kolom D', 'Kolom E', 'Kolom F', 'Kolom G'],
    ['program', 'kegiatan', 'subkegiatan', 'uraian_ssk', 'uraian', 'sumber_anggaran'].map(k => h.mapping[k as 'uraian']));
  cek('tanpa peringatan', [], h.warnings);
}

// ── B. Berkas hasil Unduh Excel aplikasi sendiri ────────────────────────────
bab('B. Berkas bergaya ekspor aplikasi ("Sumber Anggaran")');
{
  const buf = await buatBerkas('Rekening GAJI',
    ['No', 'Program', 'Kegiatan', 'Sub Kegiatan', 'Uraian SSK', 'Rekening Belanja', 'Sumber Anggaran'],
    [['1', P, 'Administrasi Keuangan Perangkat Daerah', 'Penyediaan Gaji dan Tunjangan ASN **', 'Penyediaan Gaji dan Tunjangan ASN', 'Belanja Gaji Pokok PNS', 'APBD']]);
  const h = await parseRekeningImport(buf);
  cek('jumlah baris', 1, h.rows.length);
  cek('sumber terbaca', 'GAJI', h.sumberSheet);
  cek('kolom Sumber Anggaran terbaca', 'APBD', h.rows[0].sumber_anggaran);
}

// ── C. Jebakan urutan judul ─────────────────────────────────────────────────
bab('C. "Sub Kegiatan" tidak terbaca sebagai "Kegiatan"');
{
  const buf = await buatBerkas('Rekening',
    ['Program', 'Kegiatan', 'Sub Kegiatan', 'Uraian SSK', 'Rekening Belanja', 'Sumber'],
    [['PROG', 'KEG', 'SUB', 'SSK', 'REK', 'APBD']]);
  const h = await parseRekeningImport(buf);
  cek('tiap kolom mendarat di tempatnya',
    { program: 'PROG', kegiatan: 'KEG', subkegiatan: 'SUB', uraian_ssk: 'SSK', uraian: 'REK', sumber_anggaran: 'APBD' },
    h.rows[0]);
}
{
  // Baris tanpa kolom Rekening Belanja tidak boleh diam-diam hilang.
  const buf = await buatBerkas('Rekening',
    ['Program', 'Kegiatan', 'Sub Kegiatan', 'Uraian SSK', 'Rekening Belanja', 'Sumber'],
    [['PROG', 'KEG', 'SUB', 'SSK', 'REK', 'APBD'], ['PROG', 'KEG', 'SUB', 'SSK-yatim', '', 'APBD']]);
  const h = await parseRekeningImport(buf);
  cek('baris tanpa Rekening Belanja dilewati', 1, h.rows.length);
  benar('dan dilaporkan, bukan hilang diam-diam', h.warnings.some(w => /Rekening Belanja kosong/.test(w)));
}
cek('sumberDariNama tahan nama panjang', 'PROMKES', sumberDariNama('REKENING_PROMKES_2026-09-02'));
cek('sumberDariNama menolak yang bukan sumber', null, sumberDariNama('Sheet1'));

// ── D. Pencocokan baru / sama / berubah / kembar ────────────────────────────
bab('D. Pencocokan dengan tabel yang sedang dibuka');
const br = (uraian: string, sumber: string | null, ssk = 'SSK'): BarisRekening =>
  ({ program: 'PROG', kegiatan: 'KEG', subkegiatan: 'SUB', uraian_ssk: ssk, uraian, sumber_anggaran: sumber });
{
  const lama = [br('Belanja A', 'APBD'), br('Belanja B', 'APBD')];
  const berkas = [
    br('Belanja A', 'APBD'),        // sama persis
    br('Belanja B', 'BLUD'),        // identitas sama, sumber berubah
    br('Belanja C', 'APBD'),        // baru
    br('Belanja C', 'APBD'),        // kembar di berkas
  ];
  const hasil = bandingkanRekening(lama, berkas);
  cek('status per baris', ['sama', 'berubah', 'baru', 'kembar'], hasil.map(h => h.status));
  cek('ringkasan', { baru: 1, sama: 1, berubah: 1, kembar: 1 }, ringkasImpor(hasil));
  cek('nilai lama ikut dibawa untuk yang berubah', 'APBD', hasil[1].lamaSumber);
  cek('yang dicentang otomatis hanya baru & berubah', [false, true, true, false], hasil.map(h => h.ikut));

  const tambah = terapkanTambah(lama, hasil);
  cek('Tambahkan: jumlah baris', 3, tambah.length);
  cek('Tambahkan: yang berubah diperbarui di tempat', 'BLUD', tambah[1].sumber_anggaran);
  cek('Tambahkan: yang sama tidak digandakan', 1, tambah.filter(r => r.uraian === 'Belanja A').length);
  cek('Tambahkan: kembar hanya sekali', 1, tambah.filter(r => r.uraian === 'Belanja C').length);

  const timpa = terapkanTimpa(hasil);
  cek('Timpa: isi tab = isi berkas tanpa kembar', ['Belanja A', 'Belanja B', 'Belanja C'], timpa.map(r => r.uraian));

  // Impor dua kali berturut-turut tidak boleh menambah apa pun.
  const kedua = terapkanTambah(tambah, bandingkanRekening(tambah, berkas));
  cek('impor kedua kalinya: nol baris bertambah', tambah.length, kedua.length);
}
{
  // Beda spasi/huruf besar-kecil bukan baris baru.
  const lama = [br('Belanja  A', 'APBD')];
  const hasil = bandingkanRekening(lama, [br('belanja a', 'APBD')]);
  cek('spasi ganda & huruf besar diabaikan', 'sama', hasil[0].status);
}
{
  // Uraian SSK berbeda = rekening yang lain, walau nama belanjanya sama.
  const lama = [br('Belanja Tunjangan Keluarga', 'APBD', 'SSK-1')];
  const hasil = bandingkanRekening(lama, [br('Belanja Tunjangan Keluarga', 'APBD', 'SSK-2')]);
  cek('Uraian SSK berbeda dihitung baris baru', 'baru', hasil[0].status);
}

// ── E. Master yang belum ada ────────────────────────────────────────────────
bab('E. Entri Master yang perlu dibuat');
const kosong: MasterTersedia = { program: [], kegiatan: [], subkegiatan: [], uraian_ssk: [], sumber_anggaran: [] };
{
  const berkas = [
    { program: P, kegiatan: K, subkegiatan: S, uraian_ssk: 'SSK-1', uraian: 'Belanja 1', sumber_anggaran: 'BLUD' },
    { program: P, kegiatan: K, subkegiatan: S, uraian_ssk: 'SSK-2', uraian: 'Belanja 2', sumber_anggaran: 'BLUD' },
  ];
  const k = masterKurang(berkas, kosong);
  cek('jumlah entri (nama unik, bukan per baris)', 6, k.length);
  cek('urutan tipe searah hierarki',
    ['program', 'kegiatan', 'subkegiatan', 'uraian_ssk', 'uraian_ssk', 'sumber_anggaran'],
    k.map(x => x.tipe));
  cek('induk kegiatan', { program_ref: P, kegiatan_ref: null, subkegiatan_ref: null },
    { program_ref: k[1].program_ref, kegiatan_ref: k[1].kegiatan_ref, subkegiatan_ref: k[1].subkegiatan_ref });
  cek('induk uraian SSK lengkap', { program_ref: P, kegiatan_ref: K, subkegiatan_ref: S },
    { program_ref: k[3].program_ref, kegiatan_ref: k[3].kegiatan_ref, subkegiatan_ref: k[3].subkegiatan_ref });
  cek('program tidak diberi induk', [null, null, null],
    [k[0].program_ref, k[0].kegiatan_ref, k[0].subkegiatan_ref]);

  const adaSemua: MasterTersedia = {
    program: [P], kegiatan: [K], subkegiatan: [S],
    uraian_ssk: ['ssk-1', 'SSK-2'], sumber_anggaran: ['blud'],
  };
  cek('yang sudah ada tidak dibuat ulang (beda huruf pun)', 0, masterKurang(berkas, adaSemua).length);
}

// ── F. Lingkaran Unduh Master → Import Master ───────────────────────────────
bab('F. Unduh Master lalu impor balik');
{
  // Kolom sheet Master dibangun dengan susunan yang sama dengan exportMasterExcel
  // (No | Nama | Program | Kegiatan | Sub Kegiatan). Berkas ekspor sungguhannya
  // tidak bisa dipanggil di Node — `downloadWorkbook` menyentuh document.
  const wb = new ExcelJS.Workbook();
  const isi: [string, string[][]][] = [
    // Kolom induk sengaja DIISI sampah di sheet Program: tipe ini tidak punya
    // induk, jadi pembacanya wajib mengabaikannya — bukan kebetulan lolos karena
    // berkas ekspor selalu mengosongkannya.
    ['Program',         [['1', P, 'induk-palsu', 'induk-palsu', 'induk-palsu']]],
    ['Kegiatan',        [['1', K, P, '', '']]],
    ['Sub Kegiatan',    [['1', S, P, K, '']]],
    ['Uraian SSK',      [['1', 'SSK-1', P, K, S]]],
    ['Sumber Anggaran', [['1', 'BLUD', '', '', '']]],
  ];
  for (const [nama, baris] of isi) {
    const ws = wb.addWorksheet(nama);
    ws.addRow(['No', 'Nama', 'Program', 'Kegiatan', 'Sub Kegiatan']);
    for (const b of baris) ws.addRow(b);
  }
  const out = await wb.xlsx.writeBuffer();
  const h = await parseMasterImport(Buffer.isBuffer(out) ? out : Buffer.from(out as ArrayBuffer));
  cek('kelima tipe terbaca', ['program', 'kegiatan', 'subkegiatan', 'uraian_ssk', 'sumber_anggaran'], h.rows.map(r => r.tipe));
  cek('nama terbaca dari kolom B', [P, K, S, 'SSK-1', 'BLUD'], h.rows.map(r => r.nama));
  cek('induk Uraian SSK utuh', { program_ref: P, kegiatan_ref: K, subkegiatan_ref: S },
    { program_ref: h.rows[3].program_ref, kegiatan_ref: h.rows[3].kegiatan_ref, subkegiatan_ref: h.rows[3].subkegiatan_ref });
  cek('induk sampah di sheet Program diabaikan', [null, null, null],
    [h.rows[0].program_ref, h.rows[0].kegiatan_ref, h.rows[0].subkegiatan_ref]);
  cek('Kegiatan hanya menyimpan induk program', [P, null, null],
    [h.rows[1].program_ref, h.rows[1].kegiatan_ref, h.rows[1].subkegiatan_ref]);

  const banding = bandingkanMaster(h.rows, kosong);
  cek('semua baru saat Master kosong', 5, banding.filter(b => b.status === 'baru').length);
  const sesudah: MasterTersedia = { program: [P], kegiatan: [K], subkegiatan: [S], uraian_ssk: ['SSK-1'], sumber_anggaran: ['BLUD'] };
  cek('impor kedua kalinya: nol yang dibuat', 0, bandingkanMaster(h.rows, sesudah).filter(b => b.ikut).length);
  cek('kembar di berkas ditandai', ['baru', 'kembar'],
    bandingkanMaster([h.rows[0], { ...h.rows[0] }], kosong).map(b => b.status));
}
cek('judul sheet "Sub Kegiatan" tidak terbaca "kegiatan"', 'subkegiatan', tipeDariSheet('Sub Kegiatan'));
cek('judul sheet tak dikenal ditolak', null, tipeDariSheet('Sheet1'));

// ── G. Berkas asli pemakai (kalau ada) ──────────────────────────────────────
bab('G. Berkas asli di folder Downloads (dilewati kalau tidak ada)');
{
  const asli: [string, string, number][] = [
    ['PROMKES', 'C:/Users/HP VICTUS/Downloads/REKENING_PROMKES_2026-09-02.xlsx', 2],
    ['BLUD',    'C:/Users/HP VICTUS/Downloads/REKENING_BLUD_2026-09-02.xlsx',    14],
    ['GAJI',    'C:/Users/HP VICTUS/Downloads/REKENING_GAJI_2026-09-02.xlsx',    15],
  ];
  let ada = 0;
  for (const [sumber, path, jml] of asli) {
    if (!fs.existsSync(path)) continue;
    ada++;
    const h = await parseRekeningImport(fs.readFileSync(path));
    cek(`${sumber}: jumlah baris`, jml, h.rows.length);
    cek(`${sumber}: sumber terbaca dari sheet`, sumber, h.sumberSheet);
    benar(`${sumber}: semua baris punya Rekening Belanja`, h.rows.every(r => !!r.uraian));
    benar(`${sumber}: semua baris punya hierarki lengkap`,
      h.rows.every(r => !!r.program && !!r.kegiatan && !!r.subkegiatan && !!r.uraian_ssk));
    cek(`${sumber}: nol baris kembar`, 0, ringkasImpor(bandingkanRekening([], h.rows)).kembar);
  }
  if (ada === 0) console.log('  --   berkas asli tidak ada di mesin ini, bagian G dilewati');
}

console.log(`\n${lulus} pemeriksaan LULUS${gagal ? `, ${gagal} GAGAL` : ''}`);
if (gagal) process.exit(1);
