// scripts/test-killswitch-modul.mjs
//
// Penjaga regresi T1: memastikan setiap route API modul benar-benar memeriksa
// sakelar maintenance-nya. Pemeriksaan STATIS (baca berkas), tidak menyentuh DB.
//
// Kenapa perlu: route baru hampir selalu lahir dari menyalin route lama, dan
// salinan tidak tahu apa yang seharusnya ada. Itu persis bagaimana Renaksi dan
// E-Anggaran berakhir punya sakelar yang tidak menutup apa pun — sakelarnya
// dipasang di kartu menu, lalu 19 route tumbuh tanpa pernah menanyakannya.
// tsc tidak bisa menangkap kelalaian ini; hanya pemeriksaan seperti inilah yang bisa.
//
// Dua bentuk yang diterima, keduanya sah:
//   1. pabrik  — `buatGuardModul(cek, field, 'app_status_x')` di `_guard.ts`,
//                route cukup memanggil `guard()`
//   2. per-route — route memanggil helper mati-modul sendiri (mis. `kinerjaMati`)
//
// Jalankan: node scripts/test-killswitch-modul.mjs

import fs from 'node:fs';
import path from 'node:path';

// `penanda` = daftar nama yang salah satunya WAJIB muncul di berkas route.
// BLUD punya dua: `realisasiMati` adalah turunan bersyarat `bludMati(role,
// 'realisasi')` untuk sub-modul Buku Kas — dua-duanya sah, jadi dua-duanya diterima.
const MODUL = [
  { nama: 'Rencana Aksi',    dir: 'app/api/rencana-aksi',    lewat: 'pabrik',    penanda: ['guard'] },
  { nama: 'Buku Besar Aset', dir: 'app/api/buku-besar-aset', lewat: 'pabrik',    penanda: ['guard'] },
  { nama: 'IKI',             dir: 'app/api/iki',             lewat: 'pabrik',    penanda: ['guard'] },
  { nama: 'LKJIP',           dir: 'app/api/lkjip',           lewat: 'pabrik',    penanda: ['guard'] },
  { nama: 'E-Anggaran',      dir: 'app/api/kinerja',         lewat: 'per-route', penanda: ['kinerjaMati'] },
  { nama: 'BLUD',            dir: 'app/api/blud',            lewat: 'per-route', penanda: ['bludMati', 'realisasiMati'] },
];

// Modul berpabrik: flag WAJIB dioper sebagai argumen ketiga buatGuardModul.
const FLAG_PABRIK = /buatGuardModul\([^)]*['"]app_status_[a-z_]+['"]\s*\)/s;

function cariRoute(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name === 'route.ts') out.push(p);
    }
  })(dir);
  return out;
}

let gagal = 0;
let diperiksa = 0;

for (const m of MODUL) {
  const routes = cariRoute(m.dir);
  if (routes.length === 0) {
    console.log(`?  ${m.nama}: tidak ada route ditemukan di ${m.dir}`);
    continue;
  }

  if (m.lewat === 'pabrik') {
    const guardFile = path.join(m.dir, '_guard.ts');
    const isi = fs.existsSync(guardFile) ? fs.readFileSync(guardFile, 'utf8') : '';
    if (!FLAG_PABRIK.test(isi)) {
      console.log(`X  ${m.nama}: ${guardFile} memanggil buatGuardModul TANPA flag sakelar (argumen ketiga).`);
      gagal++;
    }
  }

  const bolong = [];
  for (const f of routes) {
    diperiksa++;
    const isi = fs.readFileSync(f, 'utf8');
    // Route yang tidak menyentuh sesi sama sekali (mis. webhook publik) tidak ada
    // di modul-modul ini; kalau suatu saat ada, kecualikan di sini dengan alasan.
    if (!m.penanda.some((p) => isi.includes(p))) bolong.push(f);
  }

  if (bolong.length > 0) {
    console.log(`X  ${m.nama}: ${bolong.length} dari ${routes.length} route tidak menyebut ${m.penanda.map((p) => `'${p}'`).join(' / ')}:`);
    for (const b of bolong) console.log(`     ${b}`);
    gagal++;
  } else {
    console.log(`OK ${m.nama}: ${routes.length} route, semuanya lewat sakelar (${m.lewat}).`);
  }
}

console.log(`\n${diperiksa} route diperiksa.`);
if (gagal > 0) {
  console.log(`GAGAL: ${gagal} modul bermasalah. Sakelar maintenance yang tidak menutup API sama saja dengan tidak ada.`);
  process.exit(1);
}
console.log('LULUS: semua modul menutup API-nya saat sakelar maintenance dinyalakan.');
