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
// B5 (Tahap 2) — DAFTAR MODULNYA TIDAK LAGI DITULIS DI SINI.
//
// Sampai 2026-09-09 berkas ini memegang `MODUL`-nya sendiri berisi enam direktori yang
// diketik tangan. Itu cacat yang paling menentukan di seluruh dokumen konsep: penjaga
// yang daftarnya terpisah dari daftar yang dijaga **hanya menjaga modul yang sudah
// diingat orang**. Usulan, PK, dan Dashboard punya sakelar bertahun-tahun tanpa satu
// pun route memeriksanya, dan gate ini lulus terus — bukan karena pemeriksaannya
// lemah, tapi karena ketiganya tidak pernah masuk daftar.
//
// Sekarang daftarnya `MODUL_BERSAKELAR` dari `lib/registry/apps.ts`. Modul baru yang
// punya sakelar tapi route-nya tidak menjaganya akan MENGGAGALKAN CI sejak hari
// pertama, tanpa ada yang perlu ingat menambahkannya ke sini.
//
// Datanya dibaca dari `apps-data.mjs` — JavaScript polos, supaya gate ini tetap jalan
// dengan `node` biasa di CI tanpa menambah dependensi. Jalankan: npm run check:killswitch

import fs from 'node:fs';
import path from 'node:path';
import { MODUL_APPS_DATA } from '../lib/registry/apps-data.mjs';

// Modul yang punya sakelar DAN punya route: itulah yang wajib menjaganya. Modul tanpa
// sakelar (Admin Panel) sengaja tidak diperiksa — mengunci pintu dari dalam.
//
// `penjagaApi` yang belum diisi TIDAK membuat modulnya dilewati — itu justru
// digagalkan. Menyaringnya keluar akan membuat gate ini bisa dimatikan per modul
// dengan menghapus satu baris di registry, tanpa satu pesan pun: persis bentuk T-1
// yang seluruh berkas ini ada untuk mencegahnya. Ketahuan lewat uji mutasi, bukan
// lewat membaca ulang kodenya.
const KANDIDAT = MODUL_APPS_DATA.filter((m) => m.sakelar && m.dirApi);
const TANPA_PENJAGA = KANDIDAT.filter((m) => !m.penjagaApi);
const MODUL = KANDIDAT
  .filter((m) => m.penjagaApi)
  .map((m) => ({ nama: m.label, dir: m.dirApi, lewat: m.penjagaApi.lewat, penanda: m.penjagaApi.penanda }));

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

for (const m of TANPA_PENJAGA) {
  console.log(`X  ${m.label}: punya sakelar '${m.sakelar}' dan route di ${m.dirApi}, tapi`);
  console.log('     `penjagaApi` belum diisi di lib/registry/apps-data.mjs — jadi tidak ada');
  console.log('     yang bisa diperiksa. Sakelar tanpa penjaga sama saja dengan tanpa sakelar.');
  gagal++;
}

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
