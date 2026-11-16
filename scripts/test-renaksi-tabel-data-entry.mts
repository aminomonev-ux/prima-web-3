// Regresi tabel Data Entry Renaksi (cari, saring, kelompok) — konsep
// docs/konsep/renaksi/CONCEPT-renaksi-tabel-data-entry.md.
// Jalankan: npx tsx scripts/test-renaksi-tabel-data-entry.mts
import { readFileSync } from 'node:fs';
import {
  cocokCari, hitungKeadaan, keadaanBerlaku, kelompokkan, lolosSaringan, opsiInduk, punyaKeadaan, SARINGAN_KOSONG,
  type BarisTabelRenaksi,
} from '../lib/renaksi/tabel-data-entry';

let lulus = 0, gagal = 0;
function ok(nama: string, syarat: unknown, ket = '') {
  if (syarat) { lulus++; console.log(`  ok  ${nama}`); }
  else { gagal++; console.log(`  GAGAL ${nama}${ket ? ` — ${ket}` : ''}`); }
}
const sumber = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

const b = (id: number, o: Partial<BarisTabelRenaksi>): BarisTabelRenaksi => ({
  id, level: 'sub-kegiatan', kode: null, tujuan: null, sasaran: null, program: 'PROGRAM A ***', kegiatan: 'Kegiatan A1 ****',
  sub_kegiatan: 'Sub X *****', indikator: '(1) Jumlah dokumen *****', outcome_program: null, outcome_kegiatan: null,
  outcome_sub_kegiatan: null, induk_indikator_id: 10, target_tahunan: 4, anggaran_nominal: 1_000_000, ...o,
});

console.log('A. Cari');
const r1 = b(1, { kode: '1.02.05.1.01.0001', outcome_sub_kegiatan: 'Terlaksananya Advokasi' });
ok('A1 tidak membedakan huruf besar', cocokCari(r1, 'jumlah DOKUMEN'));
ok('A2 semua kata harus ada (lintas kolom)', cocokCari(r1, 'program a sub x') && !cocokCari(r1, 'program z'));
ok('A3 bintang & nomor (1) diabaikan', cocokCari(r1, 'dokumen sub x') && !cocokCari(r1, '(1)'));
ok('A4 kode & outcome ikut dicari', cocokCari(r1, '1.02.05') && cocokCari(r1, 'advokasi'));
ok('A5 cari kosong = semua', cocokCari(r1, '   '));

console.log('B. Keadaan (chip)');
ok('B1 pagu hanya di sub kegiatan', keadaanBerlaku('sub-kegiatan').includes('pagu-kosong') && !keadaanBerlaku('program').includes('pagu-kosong'));
ok('B2 tujuan tanpa chip tautan', !keadaanBerlaku('tujuan').includes('tanpa-tautan') && keadaanBerlaku('sasaran').includes('tanpa-tautan'));
ok('B3 pagu kosong = anggaran null (0 tetap terisi)', punyaKeadaan(b(2, { anggaran_nominal: null }), 'pagu-kosong') && !punyaKeadaan(b(3, { anggaran_nominal: 0 }), 'pagu-kosong'));
ok('B4 target kosong = 0/null', punyaKeadaan(b(4, { target_tahunan: 0 }), 'target-kosong') && !punyaKeadaan(r1, 'target-kosong'));
ok('B5 tanpa tautan = induk_indikator_id null, bukan di tujuan',
  punyaKeadaan(b(5, { induk_indikator_id: null }), 'tanpa-tautan') && !punyaKeadaan(b(6, { level: 'tujuan', induk_indikator_id: null }), 'tanpa-tautan'));

const daftar = [
  b(11, {}),
  b(12, { anggaran_nominal: null }),
  b(13, { kegiatan: 'Kegiatan A2', anggaran_nominal: null, induk_indikator_id: null }),
  b(14, { program: 'PROGRAM B', kegiatan: 'Kegiatan B1', target_tahunan: 0 }),
  b(15, { kegiatan: 'Kegiatan A1 ****', sub_kegiatan: 'Sub Y' }),
];
const hit = hitungKeadaan(daftar, SARINGAN_KOSONG);
ok('B6 hitungan chip', hit['pagu-kosong'] === 2 && hit['target-kosong'] === 1 && hit['tanpa-tautan'] === 1, JSON.stringify(hit));
const hit2 = hitungKeadaan(daftar, { ...SARINGAN_KOSONG, keadaan: ['pagu-kosong'] });
ok('B7 hitungan chip lain mengikuti chip yang aktif (= hasil bila ditekan)', hit2['tanpa-tautan'] === 1 && hit2['target-kosong'] === 0, JSON.stringify(hit2));
ok('B8 dua chip = keduanya berlaku', daftar.filter(r => lolosSaringan(r, { ...SARINGAN_KOSONG, keadaan: ['pagu-kosong', 'tanpa-tautan'] })).map(r => r.id).join() === '13');

console.log('C. Induk & kelompok');
ok('C1 saring induk pertama', daftar.filter(r => lolosSaringan(r, { ...SARINGAN_KOSONG, induk1: 'PROGRAM B' })).map(r => r.id).join() === '14');
ok('C2 saring induk kedua (kegiatan)', daftar.filter(r => lolosSaringan(r, { ...SARINGAN_KOSONG, induk1: 'PROGRAM A ***', induk2: 'Kegiatan A2' })).map(r => r.id).join() === '13');
ok('C3 opsi induk kedua mengikuti induk pertama', opsiInduk(daftar, 1, 'PROGRAM A ***').join('|') === 'Kegiatan A1 ****|Kegiatan A2');
ok('C4 opsi induk pertama unik, urutan kemunculan', opsiInduk(daftar, 0).join('|') === 'PROGRAM A ***|PROGRAM B');
const kel = kelompokkan(daftar);
ok('C5 kelompok Program › Kegiatan, urutan kemunculan', kel.map(g => g.bagian.map(x => x.nama).join(' > ')).join(' | ')
  === 'PROGRAM A *** > Kegiatan A1 **** | PROGRAM A *** > Kegiatan A2 | PROGRAM B > Kegiatan B1');
ok('C6 baris tak berurutan masuk kelompoknya, urutan baris dipertahankan', kel[0].baris.map(r => r.id).join() === '11,12,15');
ok('C7 level kegiatan dikelompokkan per program', kelompokkan([b(1, { level: 'kegiatan' }), b(2, { level: 'kegiatan', program: 'P2' })]).length === 2);
ok('C8 tujuan satu kelompok tanpa kepala', (() => { const k = kelompokkan([b(1, { level: 'tujuan' }), b(2, { level: 'tujuan', program: 'T2' })]); return k.length === 1 && k[0].bagian.length === 0; })());

console.log('D. Layar');
const form = sumber('app/(dashboard)/rencana-aksi/_components/DataEntryForm.tsx');
const tabel = sumber('app/(dashboard)/rencana-aksi/_components/DataEntryTabel.tsx');
ok('D1 Excel & PDF tetap dari SEMUA baris level (bukan hasil saringan)',
  /exportListXlsx\(levelRows,/.test(form) && /exportListPdf\(levelRows,/.test(form) && !/exportList(Xlsx|Pdf)\(tersaring/.test(form + tabel));
ok('D2 tombol unduhan menyebut jumlahnya', form.includes('label={`Excel (${levelRows.length})`}') && form.includes('label={`PDF (${levelRows.length})`}'));
ok('D3 tampilan bawaan Lengkap', /return 'lengkap';\s*\n\s*try \{ return window\.localStorage\.getItem\(KUNCI_TAMPILAN\) === 'ringkas' \? 'ringkas' : 'lengkap'; \} catch \{ return 'lengkap'; \}/.test(tabel));
ok('D4 menutup panel dengan isian berubah ditanya dulu', /dasarRef\.current !== null && dasarRef\.current !== potretForm/.test(form) && /if \(!buang\) return;/.test(form));
ok('D5 potret diambil ulang tiap baris dibuka', /dasarRef\.current = null;\s*\n\s*setPanelTerbuka\(true\);/.test(form));
ok('D6 satu jalur simpan: tabel tidak memanggil api', !/apiUpsert|apiDelete/.test(tabel));
ok('D7 resetForm menutup panel (sesudah simpan / ganti level)', /function resetForm\(\) \{[\s\S]*?setPanelTerbuka\(false\);[\s\S]*?\n  \}/.test(form));
ok('D8 tabel dipasang ulang per level (saringan tidak terbawa)', /<DataEntryTabel\s+key=\{level\}/.test(form));

console.log(`\n${lulus} lulus, ${gagal} gagal`);
process.exit(gagal ? 1 : 0);
