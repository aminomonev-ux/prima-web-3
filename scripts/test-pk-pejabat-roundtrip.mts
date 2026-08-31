// scripts/test-pk-pejabat-roundtrip.mts
//
// Penjaga lingkaran Unduh -> Import Master Pejabat PK.
//
// Kenapa perlu: ekspor dan impor ditulis terpisah, jadi tidak ada apa pun yang
// memaksa keduanya sepakat soal bunyi judul kolom. Kejadian nyata di modul IKI —
// berkas hasil ekspor aplikasi sendiri DITOLAK oleh impornya sendiri, dan baru
// ketahuan dari laporan pemakai. Di sini berkasnya dibangun oleh `buatBerkasPejabat`
// yang dipakai route unduh, lalu dibaca `parsePejabatImport` yang dipakai route
// impor — dua fungsi sungguhan, bukan tiruan.
//
// Jalankan: npx tsx scripts/test-pk-pejabat-roundtrip.mts

import { buatBerkasPejabat, HEADER_PEJABAT, namaBerkasPejabat, type ExportPejabatRow } from '../lib/pk/export-pejabat';
import { parsePejabatImport } from '../lib/pk/import-pejabat';

let lulus = 0;
let gagal = 0;

function bab(judul: string) { console.log(`\n── ${judul} ──`); }
function ok(nama: string, nilai?: unknown) {
  lulus++;
  console.log(`  ok   ${nama.padEnd(58)} ${nilai ?? ''}`);
}
function salah(nama: string, harap: unknown, dapat: unknown) {
  gagal++;
  console.log(`  GAGAL ${nama}\n        harap: ${JSON.stringify(harap)}\n        dapat: ${JSON.stringify(dapat)}`);
}
function cek(nama: string, harap: unknown, dapat: unknown) {
  if (JSON.stringify(harap) === JSON.stringify(dapat)) ok(nama, JSON.stringify(dapat));
  else salah(nama, harap, dapat);
}
function benar(nama: string, syarat: boolean, catatan = '') {
  if (syarat) ok(nama, catatan); else salah(nama, true, false);
}

// Unit kanonik pk_unit_kerja — dipakai matcher impor.
const UNIT = [
  'Kepala Bagian Umum',
  'Kepala Sub Bagian Perencanaan',
  'Kepala Bidang Pelayanan Medik',
  'Direktur',
];

const DATA: ExportPejabatRow[] = [
  { unit_kerja: 'Kepala Bagian Umum',            nama: 'Budi Santoso, S.E., M.M.', jabatan: 'Kepala Bagian Umum',            pangkat: 'Pembina / IV-a', nip: '196801011990031001' },
  { unit_kerja: 'Kepala Sub Bagian Perencanaan', nama: 'Sri Wahyuni, S.KM.',       jabatan: 'Kepala Sub Bagian Perencanaan', pangkat: 'Penata / III-c', nip: '198203152006042002' },
  { unit_kerja: 'Kepala Bidang Pelayanan Medik', nama: 'dr. Andi Prasetyo, Sp.KJ', jabatan: 'Kepala Bidang Pelayanan Medik', pangkat: null,             nip: null },
  { unit_kerja: 'Direktur',                      nama: 'dr. Retno & Rekan <RSJD>', jabatan: 'Direktur',                      pangkat: 'Pembina Utama',  nip: '197505052000122003' },
];

const TAHUN = '2026';

async function pulangPergi(format: 'xlsx' | 'docx') {
  const buf = await buatBerkasPejabat(DATA, TAHUN, format);
  return { buf, hasil: await parsePejabatImport(buf, format, UNIT) };
}

// ── A. Excel ────────────────────────────────────────────────────────────────
bab('A. Excel — unduh lalu impor balik');
const xlsx = await pulangPergi('xlsx');
cek('jumlah baris terbaca', DATA.length, xlsx.hasil.rows.length);
cek('kelima kolom terpetakan', ['jabatan', 'nama', 'nip', 'pangkat', 'unit_kerja'],
  Object.keys(xlsx.hasil.mapping).sort());
// Kolom A = "No". Kalau ia dicuri jadi salah satu field, seluruh baris bergeser.
cek('kolom "No" tidak dicuri jadi field', ['Kolom B', 'Kolom C', 'Kolom D', 'Kolom E', 'Kolom F'],
  ['unit_kerja', 'nama', 'jabatan', 'pangkat', 'nip'].map(f => xlsx.hasil.mapping[f as 'nama']));
cek('tanpa peringatan', [], xlsx.hasil.warnings);

for (let i = 0; i < DATA.length; i++) {
  const asal = DATA[i];
  const balik = xlsx.hasil.rows[i];
  cek(`baris ${i + 1} nama utuh`, asal.nama, balik.nama);
  cek(`baris ${i + 1} jabatan utuh`, asal.jabatan, balik.jabatan);
  cek(`baris ${i + 1} pangkat utuh`, asal.pangkat, balik.pangkat);
  cek(`baris ${i + 1} NIP utuh`, asal.nip, balik.nip);
  cek(`baris ${i + 1} unit cocok otomatis`, ['auto', asal.unit_kerja],
    [balik.unitMatch.status, balik.unitMatch.canonical]);
}

// NIP 18 digit: ditulis sebagai ANGKA, dua digit terakhirnya hilang diam-diam.
benar('NIP 18 digit tidak kehilangan presisi',
  xlsx.hasil.rows[0].nip === '196801011990031001', xlsx.hasil.rows[0].nip ?? '(null)');

// ── B. Word ─────────────────────────────────────────────────────────────────
bab('B. Word — unduh lalu impor balik');
const docx = await pulangPergi('docx');
cek('jumlah baris terbaca', DATA.length, docx.hasil.rows.length);
cek('kelima kolom terpetakan', ['jabatan', 'nama', 'nip', 'pangkat', 'unit_kerja'],
  Object.keys(docx.hasil.mapping).sort());
cek('tanpa peringatan', [], docx.hasil.warnings);
for (let i = 0; i < DATA.length; i++) {
  cek(`baris ${i + 1} nama utuh`, DATA[i].nama, docx.hasil.rows[i].nama);
  cek(`baris ${i + 1} NIP utuh`, DATA[i].nip, docx.hasil.rows[i].nip);
  cek(`baris ${i + 1} unit cocok otomatis`, 'auto', docx.hasil.rows[i].unitMatch.status);
}
// `docxGrid` menyapu SEMUA <w:tbl> lalu menggabung barisnya jadi satu grid. Jadi
// yang dijaga bukan "judulnya tidak terbaca" — tabel tambahan SEBELUM header memang
// terlewat sendirinya karena `dataStart` mulai setelah header, sehingga uji begitu
// diam saja saat kop diubah jadi tabel. Yang benar-benar mengikat: dokumen ini
// hanya boleh punya SATU tabel. Kop atau lampiran berbentuk tabel di bawah data
// akan terbaca sebagai pejabat tanpa satu galat pun.
const { default: PizZipLib } = await import('pizzip');
const docXml = new PizZipLib(docx.buf).file('word/document.xml')!.asText();
cek('dokumen Word hanya punya satu tabel', 1, (docXml.match(/<w:tbl[\s>]/g) ?? []).length);
benar('judul tidak ikut terbaca sebagai baris pejabat',
  !docx.hasil.rows.some(r => r.nama.toUpperCase().includes('MASTER PEJABAT')));
// Karakter XML mentah di nama akan merusak berkasnya kalau tidak di-escape.
cek('karakter & < > selamat di Word', 'dr. Retno & Rekan <RSJD>', docx.hasil.rows[3].nama);

// ── C. Gerbang MIME route impor ─────────────────────────────────────────────
// Route impor menolak berkas yang isinya tidak sesuai ekstensi (L38/G22). Ekspor
// yang lolos parser tapi ditolak di gerbang ini tetap tidak bisa dipakai pemakai.
bab('C. Berkas lolos pengendus MIME route impor');
const ZIP_LIKE_MIME = [
  'application/zip',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];
const { fileTypeFromBuffer } = await import('file-type');
for (const [format, buf] of [['xlsx', xlsx.buf], ['docx', docx.buf]] as const) {
  const sniff = (await fileTypeFromBuffer(buf))?.mime ?? null;
  benar(`${format} dikenali sebagai kontainer OOXML/zip`,
    sniff !== null && ZIP_LIKE_MIME.includes(sniff), sniff ?? '(null)');
}

// ── D. Bentuk berkas ────────────────────────────────────────────────────────
bab('D. Bentuk berkas');
cek('judul kolom', ['No', 'Unit Kerja', 'Nama', 'Jabatan', 'Pangkat/Golongan', 'NIP'], [...HEADER_PEJABAT]);
cek('nama berkas xlsx', 'Master-Pejabat-2026.xlsx', namaBerkasPejabat(TAHUN, 'xlsx'));
cek('nama berkas docx', 'Master-Pejabat-2026.docx', namaBerkasPejabat(TAHUN, 'docx'));

// ── E. Gabung (merge) tidak menggandakan ────────────────────────────────────
// Modal impor mencocokkan baris lewat `unit_kerja` yang PERSIS. Ekspor yang menulis
// unit versi panjang akan lolos semua uji di atas tapi melahirkan baris kembar.
bab('E. Unduh lalu impor-gabung = nol baris baru');
const tersimpan = new Set(DATA.map(r => r.unit_kerja));
const barisBaru = xlsx.hasil.rows.filter(r => !tersimpan.has(r.unitMatch.canonical ?? r.unit_file));
cek('baris yang dianggap baru', 0, barisBaru.length);

console.log(`\n${lulus} pemeriksaan LULUS${gagal ? `, ${gagal} GAGAL` : ''}`);
if (gagal) process.exit(1);
