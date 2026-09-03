// scripts/test-blud-riwayat-simpan.mts
// Penjaga regresi riwayat simpan per jam (DPA + Pergeseran).
//
// Yang dijaga: dua kali Simpan pada tanggal sama tapi jam berbeda harus
// dua-duanya tersimpan dan bisa dipulihkan. Sebelum ini Simpan itu
// hapus-lalu-tulis-ulang untuk (tahun, versi_tanggal) yang sama, jadi simpanan
// jam 16:40 menghapus hasil jam 09:15 tanpa sisa.
//
// Tiga hal yang paling gampang rusak lagi, dan masing-masing punya bab:
//
//   A. `waktuSekarangWIB` — kalau ia memakai jam server (UTC) alih-alih WIB,
//      snapshot dini hari punya tanggal berbeda dari versinya dan terlihat nyasar.
//   B. EMPAT jalur tulis, bukan tiga. `savePergeseran` juga punya cabang
//      kosong+force, dan itu yang terlewat waktu konsepnya ditulis (L69).
//   C. Angka kunci saat memuat snapshot WAJIB diambil segar dari server, bukan
//      dari `versi_ke` snapshot — kalau tidak, L75 lahir kembali lewat pintu lain.
//
// Bab B & C membaca berkasnya: uji satuan tetap hijau kalau seseorang menghapus
// satu pemanggilan di jalur tulis, sebab fungsinya sendiri tidak rusak.
//
// Murni di memori + baca berkas, tidak menyentuh basis data.
//
// Jalankan: npx tsx scripts/test-blud-riwayat-simpan.mts

import { readFileSync } from 'node:fs'
import { waktuSekarangWIB, tanggalHariIniWIB, toDateStr, JAKARTA_OFFSET_MS } from '../lib/blud/tanggal'
import { RIWAYAT_RETENSI } from '../lib/blud/riwayat-simpan'

let lulus = 0
let gagal = 0
function cek(nama: string, syarat: boolean, catatan = '') {
  if (syarat) { lulus++; console.log(`  ok    ${nama.padEnd(64)} ${catatan}`) }
  else        { gagal++; console.log(`  GAGAL ${nama.padEnd(64)} ${catatan}`) }
}
function bab(judul: string) { console.log(`\n── ${judul} ──`) }

const baca = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8')

/**
 * Buang komentar sebelum memeriksa "pola ini sudah TIDAK ada".
 *
 * Berkas ini menjelaskan bentuk lamanya di komentar — `<span role="button"
 * tabIndex={-1}>` dan sejenisnya. Pemeriksaan negatif yang membaca berkas
 * mentah akan menemukan kutipan itu dan menyatakan bentuk lamanya masih ada,
 * padahal yang tersisa cuma ceritanya. Sekelas dengan B10: pemeriksaan yang
 * cocok pada tempat yang salah.
 */
const tanpaKomentar = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

// ── A. Stempel waktu WIB ─────────────────────────────────────────────────────
bab('A. waktuSekarangWIB')

// 2026-08-26 02:30 WIB = 2026-08-25 19:30 UTC. Ini batas yang menjebak: jam
// server memulangkan tanggal KEMARIN, dan snapshot jadi lepas dari versinya.
const diniHariUTC = Date.UTC(2026, 7, 25, 19, 30, 0)

cek('A1 bentuknya YYYY-MM-DD HH:MM:SS, bukan ISO',
  /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(waktuSekarangWIB(diniHariUTC)),
  waktuSekarangWIB(diniHariUTC))

cek('A2 tidak menyisakan T atau Z yang ditolak MySQL',
  !/[TZ]/.test(waktuSekarangWIB(diniHariUTC)))

cek('A3 dini hari WIB → tanggalnya HARI INI menurut WIB, bukan kemarin UTC',
  waktuSekarangWIB(diniHariUTC).startsWith('2026-08-26'), 'INI inti jebakannya')

cek('A4 jamnya WIB, bukan UTC',
  waktuSekarangWIB(diniHariUTC).slice(11, 16) === '02:30')

cek('A5 sepakat dengan tanggalHariIniWIB pada saat yang sama',
  waktuSekarangWIB(diniHariUTC).slice(0, 10) === tanggalHariIniWIB(diniHariUTC),
  'snapshot tidak boleh lepas dari versinya')

// Siang hari biasa, supaya A3 tidak lolos karena kebetulan
const siangUTC = Date.UTC(2026, 7, 26, 7, 32, 5)
cek('A6 siang hari juga benar (14:32 WIB)',
  waktuSekarangWIB(siangUTC) === '2026-08-26 14:32:05', waktuSekarangWIB(siangUTC))

cek('A7 toDateStr ikut pindah ke tanggal.ts dan tetap benar',
  toDateStr(new Date(Date.UTC(2026, 6, 0, 17, 0, 0))) === '2026-07-01',
  'DATE tengah malam +07:00 tidak boleh mundur sehari')

cek('A8 offsetnya satu tetapan, bukan angka yang diketik ulang',
  JAKARTA_OFFSET_MS === 7 * 60 * 60 * 1000)

// ── B. Empat jalur tulis ─────────────────────────────────────────────────────
bab('B. lib/blud/data.ts — SEMUA jalur tulis')

const DATA = baca('../lib/blud/data.ts')

const panggilan = (DATA.match(/catatRiwayatSimpan\(tx, \{/g) ?? []).length
cek('B1 dipanggil EMPAT kali, bukan tiga', panggilan === 4,
  `${panggilan}× — saveDpa ×2 + savePergeseran ×2 (L69)`)

cek('B2 jenis DPA dipakai dua kali',
  (DATA.match(/jenis: 'DPA'/g) ?? []).length === 2)

cek('B3 jenis PERGESERAN dipakai dua kali',
  (DATA.match(/jenis: 'PERGESERAN'/g) ?? []).length === 2)

// Cabang kosong+force: `baris: []`. Kalau salah satunya hilang, pengosongan
// versi jadi tak berjejak — dan itu satu-satunya penghapusan isi di luar
// layar Pengaturan.
cek('B4 dua cabang kosong+force mencatat snapshot kosong',
  (DATA.match(/baris: \[\], totalNilai: 0/g) ?? []).length === 2)

cek('B5 selalu di dalam transaksi — memakai `tx`, bukan `sql`',
  !/catatRiwayatSimpan\(sql/.test(DATA))

// Sesudah bump, bukan sebelum: `versi_ke` harus angka kunci SESUDAH simpan.
for (const [nama, tabel] of [['B6 DPA', 'dpa_blud'], ['B7 Pergeseran', 'pergeseran_dpa']] as const) {
  const re = new RegExp(`bumpBludVersion\\(tx, '${tabel}', lockKey, userId\\)\\s*\\n(?:\\s*//[^\\n]*\\n)*\\s*await catatRiwayatSimpan`, 'g')
  cek(`${nama}: dicatat SESUDAH bumpBludVersion`, (DATA.match(re) ?? []).length === 2,
    `${(DATA.match(re) ?? []).length}/2 cabang`)
}

cek('B8 versi_ke = angka kunci sesudah bump',
  (DATA.match(/versiKe: expectedVersion \+ 1/g) ?? []).length === 4)

// Diikat ke baris `totalNilai`-nya, bukan sekadar "ada di berkas ini":
// `Number(r.pergeseran ?? 0)` juga muncul di `baruPagu`, jadi pemeriksaan longgar
// tetap hijau walau baris totalnya dirusak. Ketahuan lewat uji mutasi.
cek('B9 total DPA dari kolom `jumlah`',
  /totalNilai: rows\.reduce\(\(s, r\) => s \+ Number\(r\.jumlah \?\? 0\), 0\)/.test(DATA))

cek('B10 total Pergeseran dari `pergeseran` (pagu pasca-geser), bukan `jumlah`',
  /totalNilai: rows\.reduce\(\(s, r\) => s \+ Number\(r\.pergeseran \?\? 0\), 0\)/.test(DATA))

cek('B11 acuan DPA ikut tercatat di kedua cabang pergeseran',
  (DATA.match(/dpaVersiTanggal,/g) ?? []).length >= 2)

cek('B12 deleteDpaVersi TIDAK menyentuh riwayat — snapshot selamat dari hapus versi',
  !/DELETE FROM blud_riwayat_simpan/.test(DATA))

// ── C. Pemulihan di layar ────────────────────────────────────────────────────
bab('C. Klien — memuat snapshot')

for (const [nama, berkas, ep] of [
  ['C-DPA', '../app/(dashboard)/blud/dpa/dpa-client.tsx', 'dpa'],
  ['C-PRG', '../app/(dashboard)/blud/pergeseran/pergeseran-client.tsx', 'pergeseran'],
] as const) {
  const K = baca(berkas)

  cek(`${nama}1 mengambil daftar riwayat`,
    new RegExp(`riwayat-simpan\\?jenis=${ep === 'dpa' ? 'DPA' : 'PERGESERAN'}`).test(K))

  cek(`${nama}2 konfirmasi dulu sebelum membuang isian layar (L75b)`,
    /pulihkanSimpanan[\s\S]{0,600}?confirmDialog\(/.test(K))

  cek(`${nama}3 pilihan tidak-merusak jadi bawaan (`+ 'if (!lanjut) return' + `)`,
    /if \(!lanjut\) return/.test(K))

  // INTI bab ini: angka kunci diambil segar, bukan dari snapshot.
  cek(`${nama}4 angka kunci diambil SEGAR dari server`,
    new RegExp(`/api/blud/${ep}\\?tahun=\\$\\{tahun\\}&tanggal=`).test(K))

  // Tanpa ini, endpoint yang menolak (mis. kena bludRateLimit 60/menit)
  // memulangkan badan tanpa `version`, angka kunci diam-diam jadi 0, dan Simpan
  // berikutnya ditolak 409 "diubah orang lain" — konflik yang tak pernah ada.
  cek(`${nama}4b pemulihan DIBATALKAN kalau angka kunci gagal diambil`,
    /if \(!vRes\.ok \|\| typeof vJson\.version !== 'number'\) \{[\s\S]{0,200}?throw new Error/.test(K))

  cek(`${nama}4c angka kunci dipasang apa adanya, tanpa jatuh ke 0`,
    /setVersion\(vJson\.version\)/.test(K) && !/setVersion\(typeof vJson\.version/.test(K))

  cek(`${nama}5 TIDAK memakai versi_ke snapshot sebagai expected_version`,
    !/setVersion\(\s*s\.versi_ke/.test(K) && !/expected_version:\s*s\.versi_ke/.test(K),
    'INI L75 lewat pintu lain')

  cek(`${nama}6 versi layar diarahkan ke tanggal milik snapshot`,
    /setVersi\(s\.versi_tanggal\)/.test(K))

  cek(`${nama}7 jejak asal dikirim ke audit`,
    /asal_pulihkan: asalPulihkanRef\.current \?\? undefined/.test(K))

  cek(`${nama}8 jejak asal dilepas begitu baris diganti dari server`,
    /asalPulihkanRef\.current = null/.test(K))

  cek(`${nama}9 tombol pulihkan hanya untuk yang boleh mengubah`,
    /onPulihkan=\{bolehUbah \? pulihkanSimpanan : undefined\}/.test(K))
}

const PRG = baca('../app/(dashboard)/blud/pergeseran/pergeseran-client.tsx')
cek('C-PRG10 acuan DPA ikut dipulihkan dari snapshot',
  /if \(json\.data\.dpa_versi_tanggal\) setDpaVersi\(json\.data\.dpa_versi_tanggal\)/.test(PRG),
  'kalau tidak, acuannya jadi yang kebetulan terpilih di layar')

// Kolom turunan di snapshot adalah angka kiriman klien saat itu; server SELALU
// menghitung ulang sebelum menilai, dan lencana DRAFT di layar juga. Memuat apa
// adanya membuat tabel memperlihatkan angka yang tidak dipakai keputusan mana pun.
cek('C-PRG11 snapshot di-recalc saat dimuat, sama seperti jalur DPA',
  /setRows\(recalcPergeseranJumlah\(json\.data\.isi as PergeseranBarisInput\[\]\)\)/.test(PRG))

const DPAK = baca('../app/(dashboard)/blud/dpa/dpa-client.tsx')
cek('C-DPA11 snapshot di-recalc saat dimuat',
  /setRows\(recalcDpaJumlah\(json\.data\.isi as DpaBarisInput\[\]\)\)/.test(DPAK))

// ── F. Versi terhapus & aksesibilitas dropdown ───────────────────────────────
bab('F. VersiDropdown')

const VD = baca('../components/blud/VersiDropdown.tsx')

// `deleteDpaVersi` sengaja tidak mengikutkan tabel riwayat supaya angkanya bisa
// dipulihkan. Tanpa daftar ini janji itu tidak punya jalan: tanggalnya lenyap
// dari `items`, dan riwayat yang bersarang di bawahnya ikut lenyap.
cek('F1 tanggal yang riwayatnya ada tapi versinya sudah dihapus tetap tampil',
  /const yatim = useMemo\(/.test(VD) && /versi-yatim-grup/.test(VD))
cek('F2 tanggal versi terhapus TIDAK bisa dipilih sebagai versi',
  /versi-item versi-item--yatim/.test(VD) && !/onClick=\{\(\) => \{ onChange\(tgl\)/.test(VD))
cek('F3 semua simpanan versi terhapus bisa dipulihkan (tak ada "tampil sekarang")',
  /kini=\{false\}/.test(VD), 'versinya sudah tidak ada, jadi tak ada yang sedang tampil')

// Bersarang di dalam `<button>` ia tidak akan pernah bisa difokus, dan pengguna
// papan ketik tidak punya cara apa pun membuka riwayat — Pulihkan tak tercapai.
const VDK = tanpaKomentar(VD)   // komentarnya mengutip bentuk lama — lihat `tanpaKomentar`
cek('F4 panah riwayat adalah <button> sendiri, bukan span bersarang',
  /<button[\s\S]{0,400}?className=\{`versi-riwayat-toggle/.test(VDK)
  && !/tabIndex=\{-1\}/.test(VDK))
cek('F5 panah mengumumkan status buka/tutup', /aria-expanded=\{mekar\}/.test(VDK))
cek('F6 panah tidak lagi butuh stopPropagation — ia bukan anak tombol versi',
  !/e\.stopPropagation\(\)/.test(VDK))

// ── D. Endpoint & retensi ────────────────────────────────────────────────────
bab('D. Endpoint, pagar, retensi')

const ROUTE = baca('../app/api/blud/riwayat-simpan/route.ts')

cek('D1 kill-switch dipasang (L72)', /bludMati\(session\.role\)/.test(ROUTE))
cek('D2 pagar izin menyebut menu yang menampilkan datanya',
  /bolehLihatSalahSatu\(session\.userId, session\.role, \['dpa', 'cetak', 'pengaturan'\]\)/.test(ROUTE))
cek('D3 rate limit dipasang', /bludRateLimit\(session\.userId, 'view-riwayat'/.test(ROUTE))
cek('D4 audit dicatat saat isinya diambil', /BLUD_RIWAYAT_PULIHKAN/.test(ROUTE))
cek('D5 BACA-SAJA — tidak ada handler tulis',
  !/export async function (POST|PUT|PATCH|DELETE)/.test(ROUTE),
  'pulihkan lewat POST /api/blud/dpa yang sudah ada')

const LIB = baca('../lib/blud/riwayat-simpan.ts')
cek('D6 retensi lebih besar dari LKJIP/IKI (20) — DPA disimpan jauh lebih sering',
  RIWAYAT_RETENSI === 50, String(RIWAYAT_RETENSI))
cek('D7 pemangkasan lewat derived table (MySQL tolak subquery ke tabel yg di-DELETE)',
  /SELECT id FROM \(\s*\n\s*SELECT id FROM blud_riwayat_simpan/.test(LIB))
cek('D8 LIMIT pakai sqlInt — mysql2 menolak `LIMIT ?` (L66)',
  /LIMIT \$\{sqlInt\(RIWAYAT_RETENSI\)\}/.test(LIB))

// Kalau kuncinya cuma (jenis, tahun), 50 simpanan pada versi yang sedang aktif
// menyapu habis riwayat versi lain di tahun yang sama — dan versi lama yang
// tak lagi disentuh justru yang paling mungkin dicari orang.
cek('D11 pemangkasan dikunci per VERSI, bukan per tahun',
  (LIB.match(/versi_tanggal = \$\{a\.versiTanggal\}/g) ?? []).length === 2,
  'wajib di KEDUA sisi: DELETE dan daftar yang disisakan')
cek('D9 daftar tidak membawa kolom isi', !/SELECT[^;]*r\.isi[^;]*ORDER BY/.test(LIB))
cek('D10 tidak mengimpor data.ts — arah impornya searah, tanpa lingkaran',
  !/from '\.\/data'/.test(LIB))

// ── E. Skema & migrasi ───────────────────────────────────────────────────────
bab('E. Skema')

const MIG = baca('../docs/migrations/migration-blud-riwayat-simpan.sql')
const SCH = baca('../docs/schema-mysql.sql')

cek('E1 migrasi membuat tabelnya', /CREATE TABLE IF NOT EXISTS blud_riwayat_simpan/.test(MIG))
cek('E2 tabel juga terdaftar di schema-mysql.sql',
  /CREATE TABLE IF NOT EXISTS blud_riwayat_simpan/.test(SCH))
cek('E3 disimpan_pada DATETIME, bukan TIMESTAMP (zona sesi)',
  /disimpan_pada\s+DATETIME/.test(MIG) && !/disimpan_pada\s+TIMESTAMP/.test(MIG))
cek('E4 versi_tanggal tetap DATE — jam TIDAK naik jadi identitas',
  /versi_tanggal\s+DATE/.test(MIG))
cek('E5 dpa_blud.versi_tanggal masih DATE (tidak ikut diubah)',
  /versi_tanggal\s+DATE\s+NOT NULL COMMENT 'Tanggal versi\/history DPA'/.test(SCH))
cek('E6 pergeseran_dpa.dpa_versi_tanggal masih DATE',
  /dpa_versi_tanggal\s+DATE\s+NOT NULL COMMENT 'Versi DPA yang menjadi acuan'/.test(SCH))

// ── G. Cakupan cetak ikut ke berkas unduhan ──────────────────────────────────
bab('G. Penanda "sebagian" di PDF & Excel')

const CETAK = baca('../app/(dashboard)/blud/cetak/cetak-client.tsx')
const PDF   = baca('../lib/blud/export/pdf.ts')
const XLSX  = baca('../lib/blud/export/excel.ts')

// Pratinjau layar memuat spanduk + judul "Yang Bergeser", tapi `result.meta`
// dibuang di onCetak dan eksporter menyusun judulnya sendiri. Tanpa penanda,
// yang beredar adalah dokumen yang tampak lengkap padahal barisnya sebagian —
// sementara baris induknya tetap pagu penuh.
cek('G1 catatan cakupan dikirim ke PDF', /exportToPdf\(\{[^}]*catatan: catatanCakupan/.test(CETAK))
cek('G2 catatan cakupan dikirim ke Excel', /exportToExcel\(\{[^}]*catatan: catatanCakupan/.test(CETAK))
cek('G3 PDF mencetak catatannya', /if \(catatan\) \{[\s\S]{0,300}?doc\.text\(catatan/.test(PDF))
cek('G4 Excel menulis catatannya DI ATAS kepala tabel',
  /if \(catatan\) \{[\s\S]{0,120}?ws\.addRow\(\[catatan\]\)/.test(XLSX)
  && /const barisHeader = catatan \? 2 : 1/.test(XLSX))
// Sakelarnya bisa diubah SESUDAH tabel tercetak tanpa menekan Cetak lagi;
// membacanya saat unduh memberi keterangan yang tidak cocok dengan isi berkas.
// Sumber kalimatnya kini `result.meta.cakupan` milik `renderCetakHtml` (satu
// kalimat, dipakai spanduk + PDF + Excel), bukan lagi dirakit di klien dari
// `saring` — yang dijaga TETAP sama: distempel di dalam onCetak.
cek('G5 catatan dipotret saat Cetak, bukan dibaca saat unduh',
  /setCatatanCakupan\(result\.meta\.cakupan/.test(CETAK) && !/catatan: hanyaBergeser/.test(CETAK))
cek('G6 spanduk Pengaturan menyebut bagian "Versi terhapus" + batas retensi',
  /Versi terhapus/.test(baca('../app/(dashboard)/blud/pengaturan/pengaturan-client.tsx'))
  && /\{RIWAYAT_RETENSI\}/.test(baca('../app/(dashboard)/blud/pengaturan/pengaturan-client.tsx')))

// ── Hasil ────────────────────────────────────────────────────────────────────
console.log(`\n${gagal === 0 ? 'SEMUA LOLOS' : 'ADA YANG GAGAL'} — ${lulus} lolos, ${gagal} gagal\n`)
process.exit(gagal === 0 ? 0 : 1)
