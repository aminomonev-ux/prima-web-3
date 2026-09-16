// scripts/cek-sql-limit.mjs
//
// Penjaga regresi L66: setiap `LIMIT`/`OFFSET` yang menyisipkan nilai ke dalam
// tagged template `sql` WAJIB lewat `sqlInt()`. Pemeriksaan STATIS, nol DB.
//
// Kenapa perlu penjaga sendiri, bukan cukup ditulis di pelajaran: L66 sudah ditulis
// lengkap sejak 2026-06-15, beserta peringatan "lolos tsc, ketahuan saat live" — lalu
// dilanggar sekali lagi di `lib/data/iki.ts` pada modul yang lahir sesudahnya, dan yang
// menemukannya audit, bukan mesin. Pelajaran yang punya gate tidak pernah dilanggar
// lagi; pelajaran yang cuma tertulis dilanggar lagi di modul berikutnya.
//
// Akibatnya sengaja sulit terlihat, dan itu seluruh alasan berkas ini ada:
//   - `tsc` LULUS: `${VERSI_RETENTION}` itu number yang sah di sebuah template.
//   - mysql2 menolaknya saat dijalankan (ER_WRONG_ARGUMENTS), bukan saat dibangun.
//   - kalau pemanggilnya membungkus dengan try/catch best-effort — dan jalur retensi
//     hampir selalu begitu, sebab ia memang tidak boleh menggagalkan permintaan
//     utamanya — maka TIDAK ADA gejala sama sekali. Tabelnya sekadar tumbuh terus.
//
// Jalankan: node scripts/cek-sql-limit.mjs
import fs from 'node:fs';
import path from 'node:path';

const AKAR = ['lib', 'app', 'scripts'];
const EKSTENSI = new Set(['.ts', '.tsx', '.mts', '.mjs']);

// Berkas UJI dikecualikan: isinya justru mengutip bentuk yang dilarang untuk
// memeriksanya. Memasukkannya membuat penjaga ini menyalak pada tesnya sendiri —
// pola yang sudah menggigit beberapa kali di repo ini.
// `(^|[\\/])` — bukan `[\\/]` saja. Jalur dari `path.join` di sini relatif dan DIMULAI
// dengan "scripts", tanpa pemisah di depannya, jadi pola yang mensyaratkan pemisah
// tidak pernah cocok dan penjaga ini menyalak pada berkas ujinya sendiri.
const BUKAN_SUMBER = /(^|[\\/])(scripts[\\/](test-|cek-sql-limit)|node_modules|\.next)/;

// `LIMIT ${...}` / `OFFSET ${...}` yang isinya BUKAN panggilan sqlInt(...).
// Dicocokkan ke isi kurung kurawal, bukan ke seluruh baris: `LIMIT ${sqlInt(a)} OFFSET ${b}`
// harus tetap tertangkap pada bagian keduanya.
const POLA = /\b(LIMIT|OFFSET)\s+\$\{\s*([^}]*)\}/gi;

function berkas(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (EKSTENSI.has(path.extname(e.name))) out.push(p);
    }
  })(dir);
  return out;
}

const buangKomentar = (t) =>
  t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

let diperiksa = 0;
let dipindai = 0;
const salah = [];

for (const akar of AKAR) {
  for (const f of berkas(akar)) {
    if (BUKAN_SUMBER.test(f)) continue;
    dipindai++;
    const isi = buangKomentar(fs.readFileSync(f, 'utf8'));
    for (const m of isi.matchAll(POLA)) {
      diperiksa++;
      const nilai = m[2].trim();
      if (/^sqlInt\s*\(/.test(nilai)) continue;
      const baris = isi.slice(0, m.index).split('\n').length;
      salah.push(`${f.replace(/\\/g, '/')}:${baris}  ${m[1].toUpperCase()} \${${nilai}}`);
    }
  }
}

console.log(`${dipindai} berkas dipindai · ${diperiksa} LIMIT/OFFSET bersisipan diperiksa.`);
if (salah.length) {
  console.log(`\nX  ${salah.length} sisipan LIMIT/OFFSET tidak lewat sqlInt():`);
  for (const s of salah) console.log(`     ${s}`);
  console.log('\nmysql2 menolak `LIMIT ?` pada prepared statement (ER_WRONG_ARGUMENTS).');
  console.log('Bungkus nilainya: LIMIT ${sqlInt(n)}. Lihat L66 di CLAUDE.md.');
  process.exit(1);
}
console.log('LULUS: semua LIMIT/OFFSET bersisipan lewat sqlInt().');
