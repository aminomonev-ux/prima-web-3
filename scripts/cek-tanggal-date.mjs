// scripts/cek-tanggal-date.mjs
//
// Penjaga kelas bug "kolom DATE tiba sebagai hari sebelumnya" (audit 2026-09-29, B1/B2/B8/B9).
// Pemeriksaan STATIS, nol DB.
//
// Mekanismenya satu: pool mysql2 memakai `timezone: '+07:00'` tanpa `dateStrings`, jadi
// kolom DATE datang sebagai objek Date pada tengah malam WIB = 17:00 UTC HARI SEBELUMNYA.
// Tiga bentuk yang sudah pernah merusak data di repo ini:
//   1. `.toISOString().slice(0, 10)`          → tanggal kemarin (RIMA B9, "hari ini" di 00:00–06:59)
//   2. `String(r.tgl_realisasi)`              → "Fri Jul 31 2026 00:00:00 GMT+0700 …" (BBA B2)
//   3. `h.tanggal_dokumen.slice(0, 10)` di klien atas string ISO UTC → tanggal kemarin,
//      lalu disimpan kembali: tanggal dokumen PK mundur sehari tiap simpan (B1)
// Semuanya lolos tsc dan hanya salah di antara jam tertentu atau di layar tertentu —
// jenis kesalahan yang tidak pernah ditemukan mesin kalau tidak dicari dengan sengaja.
//
// Jalan yang benar: `DATE_FORMAT(kolom, '%Y-%m-%d')` di SQL, atau `toDateStr()` /
// `tanggalHariIniWIB()` dari `lib/shared/waktu-wib.ts`. Pengecualian yang SAH (mis. sel
// tanggal Excel yang dibaca exceljs sebagai tengah malam UTC) ditandai di baris yang sama:
//   // tanggal-utc-ok: <alasan>
//
// Daftar kolom DATE dibaca dari `docs/schema-mysql.sql`, bukan diketik — kolom DATE baru
// otomatis ikut terjaga.
//
// Jalankan: node scripts/cek-tanggal-date.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const AKAR = ['app', 'lib', 'components'];
const EKSTENSI = new Set(['.ts', '.tsx', '.mts', '.mjs']);
const BUKAN_SUMBER = /(^|[\\/])(node_modules|\.next)([\\/]|$)/;
const PENANDA = 'tanggal-utc-ok:';

/** Nama kolom bertipe DATE (bukan DATETIME) dari DDL acuan. */
export function kolomDate(skema) {
  const nama = new Set();
  const bersih = skema.replace(/--[^\n]*/g, '');
  for (const baris of bersih.split('\n')) {
    const m = /^\s*`?([a-z_][a-z0-9_]*)`?\s+DATE\b(?!TIME)/i.exec(baris);
    if (m && !/^(PRIMARY|UNIQUE|KEY|INDEX|CONSTRAINT|FOREIGN)$/i.test(m[1])) nama.add(m[1].toLowerCase());
  }
  return [...nama].sort();
}

/** Komentar blok & baris-penuh dibuang, TANPA menggeser nomor baris. */
function buangKomentar(teks) {
  return teks
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ''))
    .replace(/^[ \t]*\/\/.*$/gm, '');
}

/**
 * Pelanggaran pada satu isi berkas. Dipisah dari pemindai berkas supaya uji regresi
 * bisa memberinya teks buatan (uji mutasi), bukan cuma mencocokkan repo apa adanya.
 */
export function periksaIsi(isi, kolom) {
  const asli = isi.split('\n');
  const tanpaKomentar = buangKomentar(isi).split('\n');
  const daftar = kolom.map((k) => k.replace(/[^a-z0-9_]/gi, '')).join('|');
  const aturan = [
    { kode: 'ISO-POTONG', re: /\.toISOString\(\)\s*\.(slice|substring|substr)\(\s*0\s*,\s*10\s*\)|\.toISOString\(\)\s*\.split\(\s*['"]T['"]\s*\)\s*\[\s*0\s*\]/ },
    { kode: 'STRING-DATE', re: new RegExp(`\\bString\\(\\s*[\\w.?\\[\\]'"]*\\.(${daftar})\\b`) },
    { kode: 'POTONG-DATE', re: new RegExp(`\\.(${daftar})\\s*\\)?\\s*\\??\\.(slice|substring|substr)\\(\\s*0\\s*,\\s*10\\s*\\)`) },
  ];
  const salah = [];
  tanpaKomentar.forEach((baris, i) => {
    if ((asli[i] ?? '').includes(PENANDA)) return;
    for (const a of aturan) {
      if (a.re.test(baris)) salah.push({ baris: i + 1, kode: a.kode, teks: (asli[i] ?? '').trim() });
    }
  });
  return salah;
}

function berkas(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (BUKAN_SUMBER.test(p)) continue;
      if (e.isDirectory()) walk(p);
      else if (EKSTENSI.has(path.extname(e.name))) out.push(p);
    }
  })(dir);
  return out;
}

function utama() {
  const akarRepo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const kolom = kolomDate(fs.readFileSync(path.join(akarRepo, 'docs', 'schema-mysql.sql'), 'utf8'));
  let dipindai = 0;
  const temuan = [];
  for (const akar of AKAR) {
    for (const f of berkas(path.join(akarRepo, akar))) {
      dipindai++;
      for (const s of periksaIsi(fs.readFileSync(f, 'utf8'), kolom)) {
        temuan.push(`${path.relative(akarRepo, f).replace(/\\/g, '/')}:${s.baris}  [${s.kode}]  ${s.teks}`);
      }
    }
  }
  console.log(`${dipindai} berkas dipindai · ${kolom.length} kolom DATE dijaga (dari schema-mysql.sql).`);
  if (temuan.length) {
    console.log(`\nX  ${temuan.length} pemakaian tanggal yang bisa jatuh ke hari sebelumnya:`);
    for (const t of temuan) console.log(`     ${t}`);
    console.log('\nKolom DATE tiba sebagai 00:00 WIB = 17:00 UTC kemarin. Pakai DATE_FORMAT(kolom, \'%Y-%m-%d\')');
    console.log('di SQL, atau toDateStr() / tanggalHariIniWIB() dari lib/shared/waktu-wib.ts.');
    console.log(`Pengecualian yang sah: beri penanda "// ${PENANDA} <alasan>" di baris yang sama.`);
    process.exit(1);
  }
  console.log('LULUS: tidak ada kolom DATE yang dipotong/di-String() mentah.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) utama();
