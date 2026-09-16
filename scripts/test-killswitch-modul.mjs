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
import { MODUL_APPS_DATA, SAKELAR_LAIN_DATA } from '../lib/registry/apps-data.mjs';

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
  .map((m) => ({
    nama: m.label, dir: m.dirApi, lewat: m.penjagaApi.lewat, penanda: m.penjagaApi.penanda,
    hanyaBaca: m.hanyaBaca === true,
  }));

const METODE_TULIS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// Modul berpabrik: flag WAJIB dioper sebagai argumen ketiga buatGuardModul.
const FLAG_PABRIK = /buatGuardModul\([^)]*['"]app_status_[a-z_]+['"]\s*\)/s;

// Fase F Tahap 14d — penanda dicari PER HANDLER, bukan per berkas. Dulu `route.ts` yang
// mengekspor GET+POST+PUT dan memanggil `bludMati` hanya di GET tetap lulus. Sejak K1
// memutuskan tombol simpan tidak lagi disembunyikan lewat izin, `modulMati` satu-satunya
// yang menahan tulisan saat beku — jaminannya harus per handler, bukan kebetulan.
import { potongHandler, RE_EKSPOR_LAIN } from './_potong-handler.mjs';

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
let diperiksaHandler = 0;

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
  let handlerModul = 0;
  let handlerTulis = 0;
  for (const f of routes) {
    diperiksa++;
    const isi = fs.readFileSync(f, 'utf8');
    if (RE_EKSPOR_LAIN.test(isi)) {
      bolong.push(`${f}  (bentuk ekspor handler tidak dikenali — tulis sebagai \`export async function X(\`)`);
      continue;
    }
    const handler = potongHandler(isi);
    if (handler.length === 0) {
      bolong.push(`${f}  (tidak ada handler yang dikenali)`);
      continue;
    }
    // Route yang tidak menyentuh sesi sama sekali (mis. webhook publik) tidak ada
    // di modul-modul ini; kalau suatu saat ada, kecualikan di sini dengan alasan.
    for (const h of handler) {
      handlerModul++;
      if (METODE_TULIS.has(h.nama)) handlerTulis++;
      if (!m.penanda.some((p) => h.badan.includes(p))) bolong.push(`${f}  ${h.nama}`);
    }
  }
  diperiksaHandler += handlerModul;

  // Tahap 14c — `hanyaBaca` menentukan apakah layar Sakelar menawarkan BEKU. Dicocokkan ke
  // dua arah: mengaku baca padahal menulis = BEKU disembunyikan dari modul yang justru
  // perlu dibekukan; tidak mengaku padahal tak menulis = tombol BEKU tanpa akibat (T13).
  if (m.hanyaBaca && handlerTulis > 0) {
    console.log(`X  ${m.nama}: bertanda \`hanyaBaca\` tapi punya ${handlerTulis} handler tulis — BEKU tidak akan ditawarkan untuknya.`);
    gagal++;
  } else if (!m.hanyaBaca && handlerTulis === 0) {
    console.log(`X  ${m.nama}: tidak punya satu pun handler tulis. Tandai \`hanyaBaca: true\` di apps-data.mjs supaya BEKU tidak ditawarkan.`);
    gagal++;
  }

  if (bolong.length > 0) {
    console.log(`X  ${m.nama}: ${bolong.length} handler tidak menyebut ${m.penanda.map((p) => `'${p}'`).join(' / ')} di badannya sendiri:`);
    for (const b of bolong) console.log(`     ${b}`);
    gagal++;
  } else {
    console.log(`OK ${m.nama}: ${routes.length} route · ${handlerModul} handler, semuanya lewat sakelar (${m.lewat}).`);
  }
}

// ── Pass 2 · sakelar lintas-modul (SAKELAR_LAIN) ─────────────────────────────
//
// 2026-09-16. Pass di atas hanya memindai MODUL — dan itu sebabnya sakelar RIMA hidup
// bertahun-tahun tanpa satu pun route memeriksanya sementara gate ini lulus terus.
// Bukan karena pemeriksaannya lemah, tapi karena daftarnya tidak pernah sampai ke sini
// (T-1, pelajaran B5 lewat pintu kedua).
//
// Bedanya dengan pass modul: sakelar lintas-modul boleh punya handler yang SENGAJA
// dibiarkan terbuka (mis. GET & PATCH feedback = panel admin, yang justru dibutuhkan
// saat botnya dimatikan). Yang tidak boleh handler yang tidak disebut sama sekali —
// itulah satu-satunya beda antara pengecualian dan kelalaian, dan `sebab` yang wajib
// diisi yang membuat bedanya tertulis, bukan diingat.
let handlerLain = 0;

for (const s of SAKELAR_LAIN_DATA) {
  if (!s.dijagaDi) {
    console.log(`X  ${s.label}: sakelar '${s.kunci}' tidak dijaga satu pun handler server.`);
    console.log('     Isi `dijagaDi` di lib/registry/apps-data.mjs, atau sakelarnya hanya');
    console.log('     menyembunyikan tombol di layar sementara jalur datanya tetap terbuka.');
    gagal++;
    continue;
  }

  const bolong = [];
  for (const d of s.dijagaDi) {
    if (!fs.existsSync(d.berkas)) {
      bolong.push(`${d.berkas}  (berkas tidak ada — daftarnya basi)`);
      continue;
    }
    const isi = fs.readFileSync(d.berkas, 'utf8');
    if (RE_EKSPOR_LAIN.test(isi)) {
      bolong.push(`${d.berkas}  (bentuk ekspor handler tidak dikenali)`);
      continue;
    }
    const handler = potongHandler(isi);
    if (handler.length === 0) {
      bolong.push(`${d.berkas}  (tidak ada handler yang dikenali)`);
      continue;
    }

    const dijaga = new Set(d.metode);
    const dikecualikan = new Map();
    for (const k of d.kecuali ?? []) {
      for (const m of k.metode) dikecualikan.set(m, k.sebab);
    }

    for (const h of handler) {
      handlerLain++;
      if (dijaga.has(h.nama)) {
        if (!d.penanda.some((t) => h.badan.includes(t)))
          bolong.push(`${d.berkas}  ${h.nama}  (tidak menyebut ${d.penanda.map((t) => `'${t}'`).join(' / ')})`);
      } else if (dikecualikan.has(h.nama)) {
        if (!String(dikecualikan.get(h.nama) ?? '').trim())
          bolong.push(`${d.berkas}  ${h.nama}  (dikecualikan tanpa \`sebab\`)`);
      } else {
        bolong.push(`${d.berkas}  ${h.nama}  (tidak disebut di \`metode\` maupun \`kecuali\`)`);
      }
    }

    // Daftar yang menyebut handler tak berwujud lulus tanpa memeriksa apa pun — bentuk
    // penjaga hampa yang sama dengan berkas yang tidak ada.
    const ada = new Set(handler.map((h) => h.nama));
    for (const m of [...dijaga, ...dikecualikan.keys()])
      if (!ada.has(m)) bolong.push(`${d.berkas}  ${m}  (didaftar, tapi handlernya tidak ada)`);
  }

  // Sampai di sini yang diperiksa hanya berkas yang DIDAFTAR. Route RIMA yang tidak
  // disebut sama sekali akan lolos tanpa satu pemeriksaan pun — persis bentuk lubang
  // yang pass ini dibuat untuk menutupnya (ketahuan lewat uji mutasi, bukan lewat
  // membaca ulang kodenya). Karena itu direktorinya disapu, bukan cuma daftarnya.
  if (s.dirApi) {
    const terdaftar = new Set(s.dijagaDi.map((d) => d.berkas));
    for (const f of cariRoute(s.dirApi)) {
      const rel = path.relative('.', f).replace(/\\/g, '/');
      if (!terdaftar.has(rel)) bolong.push(`${rel}  (ada di ${s.dirApi} tapi tidak terdaftar di \`dijagaDi\`)`);
    }
  }

  if (bolong.length > 0) {
    console.log(`X  ${s.label}: ${bolong.length} masalah pada penjaga sakelar '${s.kunci}':`);
    for (const b of bolong) console.log(`     ${b}`);
    gagal++;
  } else {
    console.log(`OK ${s.label}: ${s.dijagaDi.length} berkas, tiap handler disebut — dijaga atau dikecualikan beralasan.`);
  }
}

console.log(`\n${diperiksa} route · ${diperiksaHandler} handler modul + ${handlerLain} handler lintas-modul diperiksa.`);
if (gagal > 0) {
  console.log(`GAGAL: ${gagal} modul bermasalah. Sakelar maintenance yang tidak menutup API sama saja dengan tidak ada.`);
  process.exit(1);
}
console.log('LULUS: semua modul menutup API-nya saat sakelar maintenance dinyalakan.');
