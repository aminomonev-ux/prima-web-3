// scripts/test-renaksi-rantai-mutasi.mts — uji MUTASI aturan "baris NULL tetap tampil".
// Konsep: docs/CONCEPT-renaksi-pilih-indikator.md §5, §12 Tahap 3.
//
// Uji biasa hanya membuktikan hasilnya sekarang benar. Uji ini membuktikan SEBAB-nya: penjaga
// `r.induk_indikator_id == null ||` dibuang dari salinan modul, lalu diperiksa bahwa baris lama
// memang lenyap. Kalau mutan tetap menampilkannya, berarti ada penjaga lain yang menutupi, atau
// penjaganya sudah berubah bentuk — dan uji ini harus gagal, bukan lolos diam-diam.
//
// Jalankan: npx tsx scripts/test-renaksi-rantai-mutasi.mts

import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { entitasAnak, type BarisRantai } from '../lib/renaksi/rantai';

let lulus = 0;
const gagal: string[] = [];
function ok(nama: string, syarat: boolean, ket = '') {
  if (syarat) { lulus++; console.log(`  ok  ${nama}`); }
  else { gagal.push(nama); console.log(`FAIL  ${nama}${ket ? ' — ' + ket : ''}`); }
}

const SUMBER = join(process.cwd(), 'lib', 'renaksi', 'rantai.ts');
const SALINAN = join(process.cwd(), 'lib', 'renaksi', 'rantai.mutasi.tmp.ts');
const PENJAGA = '(r.induk_indikator_id == null || Number(r.induk_indikator_id) === indukIndikatorId)';
const TANPA_PENJAGA = '(Number(r.induk_indikator_id) === indukIndikatorId)';

const baris = (p: Partial<BarisRantai> & Pick<BarisRantai, 'id' | 'indikator'>): BarisRantai => ({
  level: 'kegiatan', program: 'P1', kegiatan: 'K', sub_kegiatan: null,
  tujuan: null, sasaran: null, induk_indikator_id: null, ...p,
});

// Satu indikator program (id 10) dengan tiga kegiatan: satu tertaut ke 10, satu tertaut ke
// indikator LAIN (11), satu belum tertaut sama sekali — persis keadaan 52 baris hari ini.
const rows: BarisRantai[] = [
  baris({ id: 20, kegiatan: 'K1', indikator: 'Keg A', induk_indikator_id: 10 }),
  baris({ id: 21, kegiatan: 'K2', indikator: 'Keg B', induk_indikator_id: 11 }),
  baris({ id: 22, kegiatan: 'K3', indikator: 'Keg C', induk_indikator_id: null }),
];

console.log('\nM. Uji mutasi penjaga "baris NULL tetap tampil"');

const asli = readFileSync(SUMBER, 'utf8');
ok('M1 penjaga ditemukan di sumber', asli.includes(PENJAGA));

const mutan = asli.replace(PENJAGA, TANPA_PENJAGA);
ok('M2 salinan mutan benar-benar berubah (bukan no-op)', mutan !== asli && mutan.includes(TANPA_PENJAGA));

// Perilaku modul asli: K3 (belum tertaut) HARUS ikut tampil.
const hasilAsli = entitasAnak(rows, 'kegiatan', 10, 'P1');
ok('M3 modul asli menampilkan baris yang belum tertaut', hasilAsli.join('|') === 'K1|K3', hasilAsli.join('|'));
ok('M4 modul asli menyembunyikan baris yang tertaut ke indikator lain', !hasilAsli.includes('K2'));

try {
  writeFileSync(SALINAN, mutan.replace(/from '@\/lib\/data\/rencana-aksi-schemas'/g, "from '../data/rencana-aksi-schemas'"));
  const mod = await import(pathToFileURL(SALINAN).href + '?mutasi=' + Date.now()) as {
    entitasAnak: typeof entitasAnak;
  };
  const hasilMutan = mod.entitasAnak(rows, 'kegiatan', 10, 'P1');
  ok(
    'M5 tanpa penjaga, baris lama LENYAP dari pilihan (bukti penjaga bekerja)',
    hasilMutan.join('|') === 'K1',
    hasilMutan.join('|'),
  );
  ok('M6 mutan berbeda dari modul asli — uji ini memang menguji sesuatu', hasilMutan.join('|') !== hasilAsli.join('|'));
} finally {
  try { unlinkSync(SALINAN); } catch { /* sudah bersih */ }
}

console.log(`\n${gagal.length === 0 ? '✅ LULUS' : '❌ GAGAL'} — ${lulus} lulus, ${gagal.length} gagal`);
if (gagal.length) { console.log('Gagal:', gagal.join(', ')); process.exit(1); }
