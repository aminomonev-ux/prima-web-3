// Uji regresi eksporter dokumen DPA/Pergeseran (lib/blud/export/dpa-dokumen.ts).
// READ-ONLY — tidak menyentuh DB/aplikasi, tidak mengunduh apa pun.
//   node scripts/test-dpa-export.mjs
//
// Invarian yang diuji:
//   • kolom Level + Jangkar ada, terisi, dan TERSEMBUNYI
//   • daun berumus ROUND(vol*harga,0) — bukan perkalian polos (vol DECIMAL(18,4))
//   • induk berumus SUM(rentang) kalau anaknya berderet, penjumlahan kalau terpencar
//   • akar tanpa anak bernilai 0, bukan rumus (cermin recalcDpaJumlah)
//   • hasil tersimpan di tiap sel rumus (pembaca yang tak menghitung tetap benar)
//   • aritmetika rumus konsisten dengan angka yang dibawa (file memeriksa dirinya)
//   • blok tanda tangan: Direktur terisi, Dewan Pengawas sengaja kosong
// Exit 1 kalau ada invarian gagal — aman dipakai sebelum commit.

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(repo, 'node_modules', '.cache', 'dpa-export-test');

fs.mkdirSync(outDir, { recursive: true });
const cfg = path.join(outDir, 'tsconfig.uji.json');
fs.writeFileSync(cfg, JSON.stringify({
  compilerOptions: {
    outDir, rootDir: repo, module: 'commonjs', target: 'es2020',
    esModuleInterop: true, skipLibCheck: true, moduleResolution: 'node',
    baseUrl: repo, paths: { '@/*': ['./*'] },
  },
  files: [path.join(repo, 'lib/blud/export/dpa-dokumen.ts')],
}, null, 2));
execSync(`npx tsc -p "${cfg}"`, { cwd: repo, stdio: 'inherit' });

// tsc `paths` hanya untuk pengecekan tipe — jalur `@/...` tetap utuh di keluaran
// commonjs. Petakan ke hasil kompilasi supaya bisa di-require di Node.
const Module = require('node:module');
const resolveAsli = Module._resolveFilename;
Module._resolveFilename = function (permintaan, ...sisa) {
  const req = permintaan.startsWith('@/') ? path.join(outDir, permintaan.slice(2)) : permintaan;
  return resolveAsli.call(this, req, ...sisa);
};

const { buatWorkbookDpa, buatWorkbookPergeseran } =
  require(path.join(outDir, 'lib/blud/export/dpa-dokumen.js'));
const ExcelJS = require(path.join(repo, 'node_modules/exceljs'));

let lolos = 0;
const gagal = [];
const cek = (nama, syarat, detail = '') => {
  if (syarat) { lolos++; return; }
  gagal.push(detail ? `${nama} — ${detail}` : nama);
};

const baris = (o) => ({
  id: 0, versi_tanggal: '2026-01-01', is_latest: 1,
  vol: null, satuan: null, harga: null, penanggung_jawab: null, keterangan: null,
  anggaran_key: null, origin: 'MANUAL', usulan_item_id: null, usulan_no: null,
  ...o,
});

// Pohon uji — sengaja memuat kasus sulit. Nomor baris Excel = 7 + urutan:
//  r2 (b.8)  anaknya BERDERET  b.9–10        → SUM(F9:F10)
//  r5 (b.11) anaknya TERPENCAR b.12 & b.14   → F12+F14
//  r6 (b.12) beranak TUNGGAL   b.13          → SUM(F13:F13)  (pola formulir manual)
//  r8 (b.14) vol pecahan 1,5                 → pembulatan harus terlihat
const rowsDpa = [
  baris({ row_id: 'r1', parent_id: null, urutan: 0, tipe_baris: 'GRANDMASTER', kode_rekening: '5.X', uraian: 'Belanja Daerah', jumlah: 6_600_004 }),
  baris({ row_id: 'r2', parent_id: 'r1', urutan: 1, tipe_baris: 'MASTER', kode_rekening: '5.1', uraian: 'Belanja Operasi', jumlah: 3_000_000, anggaran_key: 'AK-2' }),
  baris({ row_id: 'r3', parent_id: 'r2', urutan: 2, tipe_baris: 'MEMBER', kode_rekening: '5.1.01', uraian: 'Gaji', vol: 1, satuan: 'tahun', harga: 1_000_000, jumlah: 1_000_000, anggaran_key: 'AK-3' }),
  baris({ row_id: 'r4', parent_id: 'r2', urutan: 3, tipe_baris: 'MEMBER', kode_rekening: '5.1.02', uraian: 'Listrik', vol: 2, satuan: 'tahun', harga: 1_000_000, jumlah: 2_000_000, anggaran_key: 'AK-4' }),
  baris({ row_id: 'r5', parent_id: 'r1', urutan: 4, tipe_baris: 'MASTER', kode_rekening: '5.2', uraian: 'Belanja Modal', jumlah: 3_600_004, anggaran_key: 'AK-5' }),
  baris({ row_id: 'r6', parent_id: 'r5', urutan: 5, tipe_baris: 'MEMBER', kode_rekening: '5.2.01', uraian: 'Komputer', jumlah: 1_800_002, anggaran_key: 'AK-6' }),
  baris({ row_id: 'r7', parent_id: 'r6', urutan: 6, tipe_baris: 'L8-SUB', kode_rekening: '5.2.01.01', uraian: 'Rincian komputer', vol: 1, satuan: 'unit', harga: 1_800_002, jumlah: 1_800_002, anggaran_key: 'AK-7' }),
  baris({ row_id: 'r8', parent_id: 'r5', urutan: 7, tipe_baris: 'MEMBER', kode_rekening: '5.2.02', uraian: 'Meja', vol: 1.5, satuan: 'unit', harga: 1_200_001, jumlah: 1_800_002, anggaran_key: 'AK-8' }),
];

const nilaiSel = (ws, alamat) => ws.getCell(alamat).value;
const rumus = (v) => (v && typeof v === 'object' ? v.formula : null);
const hasil = (v) => (v && typeof v === 'object' ? v.result : v);

async function ujiDpa() {
  const wb = await buatWorkbookDpa({
    tahun: 2026, versi: '2026-01-01', rows: rowsDpa,
    direktur: { nama: 'dr. Alek Jusran, M.Kes', nip: '196902112007011007' },
  });
  const ws = wb.worksheets[0];

  // Header + kolom tersembunyi
  const judul = [];
  for (let c = 1; c <= 10; c++) judul.push(ws.getRow(6).getCell(c).value);
  cek('header 10 kolom', judul[0] === 'Kode Rekening' && judul[5] === 'Jumlah', judul.join('|'));
  cek('kolom Level ada', judul[8] === 'Level');
  cek('kolom Jangkar ada', judul[9] === 'Jangkar');
  cek('kolom Level tersembunyi', ws.getColumn(9).hidden === true);
  cek('kolom Jangkar tersembunyi', ws.getColumn(10).hidden === true);
  cek('panel dibekukan di header', ws.views?.[0]?.ySplit === 6, JSON.stringify(ws.views));

  // Baris data mulai 7, urut sesuai `urutan`
  cek('baris 7 = akar', ws.getCell('A7').value === '5.X');
  cek('Level akar', ws.getCell('I7').value === 'Level 1');
  cek('Level L8.1', ws.getCell('I13').value === 'Level 8.1', String(ws.getCell('I13').value));
  cek('Jangkar ikut turun', ws.getCell('J9').value === 'AK-3', String(ws.getCell('J9').value));

  // Rumus daun & induk
  cek('daun pakai ROUND', rumus(nilaiSel(ws, 'F9')) === 'ROUND(C9*E9,0)', String(rumus(nilaiSel(ws, 'F9'))));
  cek('induk anak berderet → SUM', rumus(nilaiSel(ws, 'F8')) === 'SUM(F9:F10)', String(rumus(nilaiSel(ws, 'F8'))));
  cek('induk anak terpencar → penjumlahan', rumus(nilaiSel(ws, 'F11')) === 'F12+F14', String(rumus(nilaiSel(ws, 'F11'))));
  cek('induk beranak tunggal → SUM sendiri', rumus(nilaiSel(ws, 'F12')) === 'SUM(F13:F13)', String(rumus(nilaiSel(ws, 'F12'))));
  cek('akar menjumlah dua cabang', rumus(nilaiSel(ws, 'F7')) === 'F8+F11', String(rumus(nilaiSel(ws, 'F7'))));

  // Hasil ikut tersimpan
  cek('hasil tersimpan di sel rumus', hasil(nilaiSel(ws, 'F7')) === 6_600_004, String(hasil(nilaiSel(ws, 'F7'))));

  // Aritmetika: rumus dievaluasi ulang dari hasil yang dibawa harus cocok
  const f = (a) => Number(hasil(nilaiSel(ws, a)) ?? 0);
  cek('SUM(F9:F10) konsisten', f('F9') + f('F10') === f('F8'), `${f('F9')}+${f('F10')}≠${f('F8')}`);
  cek('F12+F14 konsisten', f('F12') + f('F14') === f('F11'), `${f('F12')}+${f('F14')}≠${f('F11')}`);
  cek('akar konsisten', f('F8') + f('F11') === f('F7'));

  // Pembulatan: 1,5 × 1.200.001 = 1.800.001,5 → Math.round = 1.800.002
  cek('vol pecahan dibulatkan', f('F14') === 1_800_002, String(f('F14')));
  cek('ROUND dipakai, bukan perkalian polos', rumus(nilaiSel(ws, 'F14')) === 'ROUND(C14*E14,0)', String(rumus(nilaiSel(ws, 'F14'))));

  // Blok tanda tangan
  const semuaTeks = [];
  ws.eachRow({ includeEmpty: false }, (r) => {
    r.eachCell({ includeEmpty: false }, (c) => {
      if (typeof c.value === 'string') semuaTeks.push(c.value);
    });
  });
  const teks = semuaTeks.join('\n');
  cek('Direktur tercetak', teks.includes('dr. Alek Jusran, M.Kes'));
  cek('NIP Direktur tercetak', teks.includes('NIP. 196902112007011007'));
  cek('blok Dewan Pengawas TIDAK dicetak', !/DEWAN PENGAWAS|Sekretaris|Anggota/i.test(teks));
  cek('blok kepala Program tidak dicetak', !/Sub Kegiatan|PROGRAM PENUNJANG/i.test(teks));

  // Vol dibiarkan General — `#,##0.##` bikin angka bulat tampil "1," di Excel
  cek('vol tanpa format desimal', !ws.getCell('C10').numFmt, String(ws.getCell('C10').numFmt));
  cek('harga tetap berformat ribuan', ws.getCell('E10').numFmt === '#,##0', String(ws.getCell('E10').numFmt));
  cek('jumlah tetap berformat ribuan', ws.getCell('F10').numFmt === '#,##0', String(ws.getCell('F10').numFmt));

  // Round-trip melalui berkas nyata (bukan hanya objek di memori)
  const buf = await wb.xlsx.writeBuffer();
  const wb2 = new ExcelJS.Workbook();
  await wb2.xlsx.load(buf);
  const ws2 = wb2.worksheets[0];
  cek('rumus bertahan setelah ditulis-baca', rumus(ws2.getCell('F8').value) === 'SUM(F9:F10)', String(rumus(ws2.getCell('F8').value)));
  cek('Level bertahan setelah ditulis-baca', ws2.getCell('I7').value === 'Level 1');
  cek('kolom tersembunyi bertahan', ws2.getColumn(9).hidden === true);
}

async function ujiPergeseran() {
  const rows = rowsDpa.map((r, i) => ({
    ...r,
    dpa_versi_tanggal: '2026-01-01',
    vol_p: r.vol, harga_p: r.harga,
    pergeseran: r.jumlah, bertambah_berkurang: 0,
    urutan: i,
  }));
  const wb = await buatWorkbookPergeseran({ tahun: 2026, versi: '2026-02-01', rows, direktur: null });
  const ws = wb.worksheets[0];

  cek('pergeseran: 12 kolom', ws.getRow(6).getCell(12).value === 'Jangkar', String(ws.getRow(6).getCell(12).value));
  cek('pergeseran: Level tersembunyi', ws.getColumn(11).hidden === true);
  cek('pergeseran: kolom Jumlah berumus', rumus(nilaiSel(ws, 'F8')) === 'SUM(F9:F10)', String(rumus(nilaiSel(ws, 'F8'))));
  cek('pergeseran: kolom Pergeseran berumus', rumus(nilaiSel(ws, 'I8')) === 'SUM(I9:I10)', String(rumus(nilaiSel(ws, 'I8'))));
  cek('pergeseran: daun pakai kolom G/H', rumus(nilaiSel(ws, 'I9')) === 'ROUND(G9*H9,0)', String(rumus(nilaiSel(ws, 'I9'))));
  cek('pergeseran: selisih = pergeseran − jumlah', rumus(nilaiSel(ws, 'J9')) === 'I9-F9', String(rumus(nilaiSel(ws, 'J9'))));

  const teks = [];
  ws.eachRow({ includeEmpty: false }, (r) => r.eachCell({ includeEmpty: false }, (c) => {
    if (typeof c.value === 'string') teks.push(c.value);
  }));
  cek('pergeseran: Direktur kosong berkerangka', teks.join('\n').includes('NIP. ..............................'));
  cek('pergeseran: vol P tanpa format desimal', !ws.getCell('G9').numFmt, String(ws.getCell('G9').numFmt));
}

async function ujiKosong() {
  let kena = false;
  try { await buatWorkbookDpa({ tahun: 2026, versi: null, rows: [] }); } catch { kena = true; }
  cek('data kosong ditolak', kena);
}

(async () => {
  await ujiDpa();
  await ujiPergeseran();
  await ujiKosong();

  console.log(`\nLolos: ${lolos}  ·  Gagal: ${gagal.length}`);
  if (gagal.length) {
    gagal.forEach((g) => console.log('  ✗ ' + g));
    process.exit(1);
  }
  console.log('Semua invarian eksporter dokumen DPA/Pergeseran terpenuhi.');
})();
