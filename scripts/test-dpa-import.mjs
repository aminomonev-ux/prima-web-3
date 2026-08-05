// Uji regresi parser impor DPA (lib/blud/import-dpa*.ts) terhadap berkas nyata.
// READ-ONLY — tidak menyentuh DB/aplikasi.
//   node scripts/test-dpa-import.mjs ["C:/path/file-atau-folder"]
//
// Folder boleh berisi berapa pun .xlsx: tiap berkas baru tinggal dijatuhkan ke
// situ, tanpa mengubah kode. Berkas kalibrasi TIDAK ikut repo — isinya NIP
// pejabat dan rincian anggaran, sedangkan repo ini publik.
//
// Invarian yang diuji per berkas:
//   • lembar & baris header ketemu tanpa dipatok nomor
//   • kolom Jumlah/vol/harga ketemu walau posisinya beda antar tahun
//   • badan tabel TIDAK terpotong di baris "Dewan Pengawas BLUD" (nama mata
//     anggaran, bukan blok tanda tangan)
//   • pohon punya SATU akar dan tidak ada baris yatim
//   • hitung ulang cocok dengan angka di berkas (selisih dilaporkan, bukan didiamkan)
// Exit 1 kalau ada invarian gagal.

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = process.argv[2] ?? 'C:/Users/HP VICTUS/Downloads/dpa';

if (!fs.existsSync(target)) {
  console.error(`Berkas/folder uji tidak ditemukan: ${target}`);
  console.error('Pakai: node scripts/test-dpa-import.mjs "C:/path/folder-dpa"');
  console.error('Berkas kalibrasi sengaja tidak ikut repo (memuat NIP + rincian anggaran).');
  process.exit(1);
}

const outDir = path.join(repo, 'node_modules', '.cache', 'dpa-import-test');
fs.mkdirSync(outDir, { recursive: true });
const cfg = path.join(outDir, 'tsconfig.uji.json');
fs.writeFileSync(cfg, JSON.stringify({
  compilerOptions: {
    outDir, rootDir: repo, module: 'commonjs', target: 'es2020',
    esModuleInterop: true, skipLibCheck: true, moduleResolution: 'node',
    baseUrl: repo, paths: { '@/*': ['./*'] },
  },
  files: [
    path.join(repo, 'lib/blud/import-dpa.ts'),
    path.join(repo, 'lib/blud/export/dpa-dokumen.ts'),
  ],
}, null, 2));
execSync(`npx tsc -p "${cfg}"`, { cwd: repo, stdio: 'inherit' });

const Module = require('node:module');
const resolveAsli = Module._resolveFilename;
Module._resolveFilename = function (permintaan, ...sisa) {
  const req = permintaan.startsWith('@/') ? path.join(outDir, permintaan.slice(2)) : permintaan;
  return resolveAsli.call(this, req, ...sisa);
};

const { bacaGridDpa } = require(path.join(outDir, 'lib/blud/import-dpa-grid.js'));
const { bacaDpaDariGrid } = require(path.join(outDir, 'lib/blud/import-dpa.js'));
const { buatWorkbookDpa } = require(path.join(outDir, 'lib/blud/export/dpa-dokumen.js'));

let lolos = 0;
const gagal = [];
const cek = (nama, syarat, detail = '') => {
  if (syarat) { lolos++; return; }
  gagal.push(detail ? `${nama} — ${detail}` : nama);
};

function* telusuri(p) {
  if (fs.statSync(p).isFile()) { yield p; return; }
  for (const e of fs.readdirSync(p, { withFileTypes: true })) {
    const anak = path.join(p, e.name);
    if (e.isDirectory()) yield* telusuri(anak);
    else if (/\.xlsx$/i.test(e.name) && !e.name.startsWith('~$')) yield anak;
  }
}

const rp = (n) => (n == null ? '-' : Number(n).toLocaleString('id-ID'));

async function ujiBerkas(berkas) {
  const nama = path.basename(berkas);
  console.log('\n' + '='.repeat(72) + '\n### ' + nama);
  const grid = await bacaGridDpa(fs.readFileSync(berkas));
  const h = bacaDpaDariGrid(grid);

  const k = h.kolom;
  console.log(`lembar "${grid.namaLembar}" · header b.${h.barisHeader} · data s/d b.${h.barisAkhirData}`);
  console.log(`kolom: kode ${k.kode.awal}-${k.kode.akhir} · uraian ${k.uraian.join(',')} `
    + `· vol ${k.vol} · satuan ${k.satuan} · harga ${k.harga} · jumlah ${k.jumlah}`
    + (k.level ? ` · level ${k.level}` : '') + (k.jangkar ? ` · jangkar ${k.jangkar}` : ''));
  console.log(`baris terbaca ${h.baris.length} · sumber hierarki: ${h.baris[0]?.sumberHierarki}`);
  console.log(`total berkas ${rp(h.totalFile)} · hitung ulang ${rp(h.totalHitung)}`);

  cek(`${nama}: kolom Jumlah ketemu`, k.jumlah > 0);
  cek(`${nama}: kolom harga ketemu`, k.harga != null);
  cek(`${nama}: ada baris terbaca`, h.baris.length > 0);

  // Jebakan utama: "Dewan Pengawas BLUD" adalah mata anggaran di tengah data.
  const dewas = h.baris.filter(b => /dewan pengawas/i.test(b.uraian));
  if (dewas.length) {
    const terakhir = h.baris[h.baris.length - 1].barisExcel;
    cek(`${nama}: tidak terpotong di "Dewan Pengawas"`, terakhir > dewas[0].barisExcel,
      `dewas b.${dewas[0].barisExcel}, data berhenti b.${terakhir}`);
  }

  // Pohon utuh
  const adaBaris = new Set(h.baris.map(b => b.barisExcel));
  const yatim = h.baris.filter(b => b.indukBarisExcel != null && !adaBaris.has(b.indukBarisExcel));
  cek(`${nama}: tidak ada induk menggantung`, yatim.length === 0, `${yatim.length} baris`);
  const akar = h.baris.filter(b => b.indukBarisExcel == null);
  cek(`${nama}: pohon punya akar`, akar.length >= 1);

  // Tidak ada lingkaran induk
  let lingkaran = 0;
  const indukPeta = new Map(h.baris.map(b => [b.barisExcel, b.indukBarisExcel]));
  for (const b of h.baris) {
    let p = b.indukBarisExcel; let n = 0;
    while (p != null && n++ < 64) p = indukPeta.get(p) ?? null;
    if (n >= 64) lingkaran++;
  }
  cek(`${nama}: tidak ada lingkaran induk`, lingkaran === 0, `${lingkaran} baris`);

  // Selisih hitung ulang
  const beda = h.baris.filter(b => b.jumlahFile != null && b.jumlahFile !== b.jumlahHitung);
  const tanpaHasil = h.baris.filter(b => b.jumlahFile == null);
  console.log(`selisih hitung ulang: ${beda.length} baris · tanpa hasil tersimpan: ${tanpaHasil.length}`);
  if (beda.length) {
    beda.slice(0, 5).forEach(b => console.log(
      `   b.${b.barisExcel} ${b.uraian.slice(0, 34).padEnd(34)} berkas ${rp(b.jumlahFile)} vs hitung ${rp(b.jumlahHitung)}`));
  }
  if (h.peringatan.length) h.peringatan.forEach(p => console.log('   ! ' + p));
  if (h.ditahan.length) console.log(`   ditahan: ${h.ditahan.length} baris`);

  return h;
}

/** Jangkar sah = bentuk buatan newAnggaranKey(): 'AK-' + 32 hex. */
const jk = (n) => 'AK-' + String(n).repeat(32).slice(0, 32);

/** Round-trip: unduhan sendiri harus terbaca PERSIS seperti aslinya. */
async function ujiPulangPergi() {
  console.log('\n' + '='.repeat(72) + '\n### ROUND-TRIP unduhan sendiri');
  const asal = [
    { row_id: 'a', parent_id: null, urutan: 0, tipe_baris: 'GRANDMASTER', kode_rekening: '5.X', uraian: 'Belanja Daerah', vol: null, satuan: null, harga: null, jumlah: 9_000_000, penanggung_jawab: null, keterangan: null, anggaran_key: jk(1) },
    { row_id: 'b', parent_id: 'a', urutan: 1, tipe_baris: 'MASTER', kode_rekening: '5.1', uraian: 'Belanja Operasi', vol: null, satuan: null, harga: null, jumlah: 4_000_000, penanggung_jawab: null, keterangan: null, anggaran_key: jk(2) },
    { row_id: 'c', parent_id: 'b', urutan: 2, tipe_baris: 'MEMBER', kode_rekening: '5.1.01', uraian: 'Gaji', vol: 1, satuan: 'tahun', harga: 1_000_000, jumlah: 1_000_000, penanggung_jawab: null, keterangan: null, anggaran_key: jk(3) },
    { row_id: 'd', parent_id: 'b', urutan: 3, tipe_baris: 'MEMBER', kode_rekening: '5.1.02', uraian: 'Listrik', vol: 2, satuan: 'tahun', harga: 1_500_000, jumlah: 3_000_000, penanggung_jawab: null, keterangan: null, anggaran_key: jk(4) },
    { row_id: 'e', parent_id: 'a', urutan: 4, tipe_baris: 'MASTER', kode_rekening: '5.2', uraian: 'Belanja Modal', vol: null, satuan: null, harga: null, jumlah: 5_000_000, penanggung_jawab: null, keterangan: null, anggaran_key: jk(5) },
    { row_id: 'f', parent_id: 'e', urutan: 5, tipe_baris: 'CHILD', kode_rekening: '5.2.2', uraian: 'Peralatan', vol: null, satuan: null, harga: null, jumlah: 5_000_000, penanggung_jawab: null, keterangan: null, anggaran_key: jk(6) },
    { row_id: 'g', parent_id: 'f', urutan: 6, tipe_baris: 'MEMBER', kode_rekening: '5.2.02', uraian: 'Komputer', vol: 1, satuan: 'unit', harga: 5_000_000, jumlah: 5_000_000, penanggung_jawab: null, keterangan: null, anggaran_key: jk(7) },
  ].map(r => ({ id: 0, versi_tanggal: '2026-01-01', is_latest: 1, origin: 'MANUAL', usulan_item_id: null, usulan_no: null, ...r }));

  const wb = await buatWorkbookDpa({ tahun: 2026, versi: '2026-01-01', rows: asal, direktur: null });
  const buf = await wb.xlsx.writeBuffer();
  const grid = await bacaGridDpa(buf);
  const h = bacaDpaDariGrid(grid);

  cek('round-trip: kolom Level terbaca', h.kolom.level != null);
  cek('round-trip: kolom Jangkar terbaca', h.kolom.jangkar != null);
  cek('round-trip: hierarki dari kolom Level', h.baris[0]?.sumberHierarki === 'level', String(h.baris[0]?.sumberHierarki));
  cek('round-trip: jumlah baris sama', h.baris.length === asal.length, `${h.baris.length} vs ${asal.length}`);

  const salahTipe = h.baris.filter((b, i) => b.tipe_baris !== asal[i].tipe_baris);
  cek('round-trip: tipe_baris identik', salahTipe.length === 0,
    salahTipe.map(b => `b.${b.barisExcel} ${b.tipe_baris}`).join(', '));

  const idKe = new Map(asal.map((r, i) => [r.row_id, i]));
  const indukSalah = h.baris.filter((b, i) => {
    const indukAsal = asal[i].parent_id == null ? null : idKe.get(asal[i].parent_id);
    const indukBaca = b.indukBarisExcel == null ? null : h.baris.findIndex(x => x.barisExcel === b.indukBarisExcel);
    return (indukAsal ?? null) !== (indukBaca === -1 ? null : indukBaca);
  });
  cek('round-trip: induk identik', indukSalah.length === 0, `${indukSalah.length} baris`);

  const jangkarSalah = h.baris.filter((b, i) => b.jangkar !== asal[i].anggaran_key);
  cek('round-trip: jangkar terbawa utuh', jangkarSalah.length === 0, `${jangkarSalah.length} baris`);

  const nilaiSalah = h.baris.filter((b, i) => b.jumlahHitung !== (i === 0 ? 9_000_000 : b.jumlahHitung));
  cek('round-trip: total akar benar', h.totalHitung === 9_000_000, rp(h.totalHitung));
  cek('round-trip: tidak ada selisih vs berkas', h.baris.every(b => b.jumlahFile === b.jumlahHitung),
    String(h.baris.filter(b => b.jumlahFile !== b.jumlahHitung).length));
  void nilaiSalah;

  console.log(`terbaca ${h.baris.length} baris · sumber ${h.baris[0]?.sumberHierarki} · total ${rp(h.totalHitung)}`);
}

/**
 * Berkas kiriman orang tidak boleh bisa menitipkan rumus atau membajak jangkar.
 * `anggaran_key` menentukan alokasi realisasi mana yang menempel ke baris, dan
 * ikut terbit lagi di berkas unduhan berikutnya.
 */
async function ujiJangkarJahat() {
  console.log('\n' + '='.repeat(72) + '\n### JANGKAR JAHAT');
  const baris = (o) => ({
    id: 0, versi_tanggal: '2026-01-01', is_latest: 1, origin: 'MANUAL',
    usulan_item_id: null, usulan_no: null, vol: null, satuan: null, harga: null,
    penanggung_jawab: null, keterangan: null, ...o,
  });
  const asal = [
    baris({ row_id: 'a', parent_id: null, urutan: 0, tipe_baris: 'GRANDMASTER', kode_rekening: '5.X', uraian: 'Akar', jumlah: 3_000_000, anggaran_key: '=HYPERLINK("http://jahat","klik")' }),
    baris({ row_id: 'b', parent_id: 'a', urutan: 1, tipe_baris: 'MEMBER', kode_rekening: '5.1', uraian: 'Sah', vol: 1, satuan: 'th', harga: 1_000_000, jumlah: 1_000_000, anggaran_key: jk(9) }),
    baris({ row_id: 'c', parent_id: 'a', urutan: 2, tipe_baris: 'MEMBER', kode_rekening: '5.2', uraian: 'Kembar', vol: 2, satuan: 'th', harga: 1_000_000, jumlah: 2_000_000, anggaran_key: jk(9) }),
  ];
  const wb = await buatWorkbookDpa({ tahun: 2026, versi: '2026-01-01', rows: asal, direktur: null });

  const ws = wb.worksheets[0];
  const selJangkar = ws.getCell('J7').value;
  cek('rumus di jangkar dilumpuhkan saat ditulis', typeof selJangkar === 'string' && selJangkar.startsWith("'="),
    JSON.stringify(selJangkar));

  const buf = await wb.xlsx.writeBuffer();
  const h = bacaDpaDariGrid(await bacaGridDpa(buf));
  cek('jangkar berbentuk rumus ditolak saat dibaca', h.baris[0].jangkar === null, String(h.baris[0].jangkar));
  cek('jangkar sah tetap diterima', h.baris[1].jangkar === jk(9), String(h.baris[1].jangkar));
  cek('jangkar kembar ditolak', h.baris[2].jangkar === null, String(h.baris[2].jangkar));
  cek('penolakan jangkar dilaporkan', h.baris[2].catatan.some(c => /kembar/i.test(c)), h.baris[2].catatan.join('|'));
  console.log(`jangkar: b1=${h.baris[0].jangkar} b2=${h.baris[1].jangkar} b3=${h.baris[2].jangkar}`);

  // Kolom Level dibaca dari isi sel berkas. Pada objek biasa, '__proto__'
  // mengembalikan bawaan Object — nilai truthy yang lolos "levelnya terbaca"
  // lalu merambat jadi tipe_baris sampah. Petanya harus Map.
  const ws2 = (await buatWorkbookDpa({ tahun: 2026, versi: '2026-01-01', rows: asal, direktur: null })).worksheets[0];
  ws2.getCell('I8').value = '__proto__';
  ws2.getCell('I9').value = 'constructor';
  const wb2 = ws2.workbook;
  const h2 = bacaDpaDariGrid(await bacaGridDpa(await wb2.xlsx.writeBuffer()));
  const tipeSah = new Set(['GRANDMASTER','MASTER','CHILD','LEADER','MEMBER','PLETON-LEADER','PLETON-MEMBER',
    'KETUA-KELOMPOK-A','ANGGOTA-KELOMPOK-A','KETUA-KELOMPOK-B','ANGGOTA-KELOMPOK-B','L7-HEAD','L7-SUB','L8-HEAD','L8-SUB']);
  cek('kolom Level tahan __proto__/constructor', h2.baris.every(b => tipeSah.has(b.tipe_baris)),
    h2.baris.map(b => String(b.tipe_baris)).join('|'));
  console.log(`level jahat → tipe: ${h2.baris.map(b => b.tipe_baris).join(', ')}`);
}

(async () => {
  const berkas = [...telusuri(target)];
  if (!berkas.length) {
    console.error(`Tidak ada .xlsx di ${target}`);
    process.exit(1);
  }
  for (const b of berkas) {
    const nama = path.basename(b);
    try {
      await ujiBerkas(b);
    } catch (e) {
      const pesan = e instanceof Error ? e.message : String(e);
      // Unduhan format LAMA memang harus ditolak — hierarkinya tidak ada di
      // berkas dan menebaknya menghasilkan pohon salah tanpa gejala.
      if (/format lama/i.test(pesan)) {
        console.log('\n' + '='.repeat(72) + '\n### ' + nama);
        console.log('   ditolak (benar): ' + pesan);
        cek(`${nama}: unduhan format lama ditolak dengan pesan jelas`, /Unduh ulang/i.test(pesan));
      } else {
        gagal.push(`${nama}: ${pesan}`);
        console.log('   ✗ ' + pesan);
      }
    }
  }
  await ujiPulangPergi();
  await ujiJangkarJahat();

  console.log(`\nLolos: ${lolos}  ·  Gagal: ${gagal.length}`);
  if (gagal.length) {
    gagal.forEach((g) => console.log('  ✗ ' + g));
    process.exit(1);
  }
  console.log('Semua invarian parser impor DPA terpenuhi.');
})();
