// scripts/test-renaksi-desimal.mts — angka Renaksi boleh 2 angka di belakang koma.
//
// Bagian A-F: realisasi (tiga pintu pengisian). Bagian G: TARGET — RPJMD,
// tahunan, triwulan, dan 12 target bulanan di Data Entry, beserta penjumlahan
// yang menurunkan triwulan dari target bulanan.
//
// Empat hal yang masing-masing punya bentuk "kelihatan benar tapi salah":
//
//   1. `input type="number"` memulangkan string KOSONG untuk ketikan yang tak
//      terbacanya. Mengetik "7,5" di situ MENGHAPUS isi sel tanpa satu pesan
//      pun — jadi ragam desimal wajib pindah ke `type="text"`, `step="0.01"`
//      saja tidak cukup.
//   2. Membaca ketikan setengah jadi ("7,") sebagai "bukan angka" membuat koma
//      lenyap tepat saat ditekan: desimal cuma bisa ditempel, tak bisa diketik.
//   3. `Math.round(2.675 * 100) / 100` memulangkan 2,67 — 2.675 tersimpan
//      sebagai 2.67499… di IEEE-754.
//   4. Tiga pintu pengisian (kisi 12 bulan · modal Triwulan · Matriks Bulanan)
//      harus memakai SATU aturan baca/tulis. Dua salinan = satu pintu menyimpan
//      7,5 sementara pintu sebelahnya menyimpan 75.
//
// Bagian A menguji PERILAKU lewat fungsi yang dipakai produksi. B–D memeriksa
// sumber, untuk hal yang tidak bisa dijalankan tanpa React/DOM.
//
// Jalankan: npx tsx scripts/test-renaksi-desimal.mts

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { bacaDesimal, bulatkanDesimal, tulisDesimal, bersihkanKetikan, DESIMAL_RENAKSI } from '../lib/shared/desimal'
import {
  UpdateQuarterSchema, UpdateBulanRealisasiSchema, BulanBulkSchema,
  UpsertRencanaAksiSchema, UpdateTargetsSchema, ImportCommitSchema,
} from '../lib/data/rencana-aksi-schemas'
import { deriveQuartersFromMonthly, realisasiAkhirTahun } from '../app/(dashboard)/rencana-aksi/_lib/types'
import type { RaRow } from '../app/(dashboard)/rencana-aksi/_lib/types'

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const baca = (p: string) => fs.readFileSync(path.join(repo, p), 'utf8')

/** Buang komentar dulu: prosa yang MENJELASKAN aturannya tidak boleh menyalakan
 *  tesnya sendiri, dan paragraf baru tidak boleh menggeser kode yang diperiksa
 *  ke luar jendela (L82c). */
const kode = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')

let lulus = 0
let gagal = 0
function cek(nama: string, syarat: boolean, catatan = '') {
  if (syarat) { lulus++; console.log(`  ok    ${nama.padEnd(64)} ${catatan}`) }
  else { gagal++; console.log(`  GAGAL ${nama.padEnd(64)} ${catatan}`) }
}

const F_PRIMA = 'components/ui/PrimaNumberField.tsx'
const F_KISI = 'app/(dashboard)/rencana-aksi/_components/MainDashboard.tsx'
const F_TW = 'app/(dashboard)/rencana-aksi/_components/Modals.tsx'
const F_MATRIKS = 'app/(dashboard)/rencana-aksi/_components/MatrixBulananModal.tsx'
const F_SKEMA = 'lib/data/rencana-aksi-schemas.ts'
const F_CETAK = 'app/(dashboard)/rencana-aksi/_components/CetakPanel.tsx'
const F_EKSPOR = 'app/(dashboard)/rencana-aksi/_lib/exports.ts'

// ─── A. Perilaku: baca · tulis · bulatkan ───────────────────────────────────
console.log('\nA. Aturan baca/tulis angka berkoma')

cek('koma dibaca sebagai desimal', bacaDesimal('7,5') === 7.5, '"7,5" → 7.5')
cek('titik juga dibaca sebagai desimal', bacaDesimal('7.5') === 7.5, '"7.5" → 7.5')
cek('spasi di tepi diabaikan', bacaDesimal('  7,25 ') === 7.25)
cek('id-ID lengkap: ribuan titik + desimal koma', bacaDesimal('1.234,5') === 1234.5, 'tempelan dari Excel')
cek('en lengkap: ribuan koma + desimal titik', bacaDesimal('1,234.5') === 1234.5)
cek('kosong = belum diisi, BUKAN nol', bacaDesimal('') === null, 'R3: 0 itu nilai nyata')
cek('nol tetap nol', bacaDesimal('0') === 0)
cek('teks bukan angka ditolak', bacaDesimal('abc') === null)
cek('angka + huruf ditolak', bacaDesimal('7,5x') === null)
cek('ketikan setengah jadi tetap terbaca', bacaDesimal('7,') === 7, 'kalau null, komanya lenyap saat ditekan')
cek('ketikan setengah jadi (titik) tetap terbaca', bacaDesimal('7.') === 7)

cek('pembulatan tidak tergelincir IEEE-754', bulatkanDesimal(2.675) === 2.68, 'Math.round biasa → 2,67')
cek('pembulatan 3 desimal ke 2', bulatkanDesimal(7.567) === 7.57)
cek('pembulatan ke bawah', bulatkanDesimal(7.564) === 7.56)
cek('penjumlahan biner dirapikan', bulatkanDesimal(0.1 + 0.2) === 0.3)
cek('bilangan bulat tidak bergeser', bulatkanDesimal(12) === 12)
cek('angka bernotasi eksponen tidak dirusak', Number.isFinite(bulatkanDesimal(1e21)))

cek('tulis pakai koma', tulisDesimal(7.5) === '7,5')
cek('nol ekor dibuang', tulisDesimal(7) === '7', 'bukan "7,00"')
cek('ribuan pakai titik', tulisDesimal(1234.5) === '1.234,5')
cek('nol tampil "0", bukan kosong', tulisDesimal(0) === '0')
cek('null jadi kosong', tulisDesimal(null) === '')
cek('lebih dari 2 desimal ikut dibulatkan saat ditulis', tulisDesimal(7.567) === '7,57')

cek('bolak-balik teks→angka→teks tetap sama', tulisDesimal(bacaDesimal('7,25')) === '7,25')
cek('huruf dibuang dari ketikan', bersihkanKetikan('7a,5b') === '7,5')
cek('pemisah & minus dipertahankan', bersihkanKetikan('-1.234,5') === '-1.234,5')
cek('DESIMAL_RENAKSI mengikuti DECIMAL(14,2)', DESIMAL_RENAKSI === 2)

// ─── B. Pembulatan di server (pagar terakhir sebelum MySQL) ─────────────────
console.log('\nB. Pagar server: nilai yang tersimpan = nilai yang ditampilkan')

const tw = UpdateQuarterSchema.parse({ id: 1, quarter: 1, target: 10.005, realisasi: 7.567, expected_version: 0 })
cek('realisasi TW dibulatkan 2 desimal', tw.realisasi === 7.57, `7.567 → ${tw.realisasi}`)
cek('target TW ikut dibulatkan', tw.target === 10.01, `10.005 → ${tw.target}`)

const bulan = UpdateBulanRealisasiSchema.parse({
  id: 1, expected_version: 0,
  bulan_realisasi: [7.567, null, 0, 1.005, ...Array(8).fill(null)],
})
cek('realisasi bulanan dibulatkan', bulan.bulan_realisasi[0] === 7.57)
cek('null TETAP null sesudah dibulatkan', bulan.bulan_realisasi[1] === null, 'bukan 0 — R3')
cek('nol nyata tidak jadi null', bulan.bulan_realisasi[2] === 0)
cek('pembulatan naik di bulan lain', bulan.bulan_realisasi[3] === 1.01)

const bulk = BulanBulkSchema.parse({
  items: [{ id: 1, expected_version: 0, bulan_realisasi: [2.675, ...Array(11).fill(null)] }],
})
cek('simpan massal Matriks ikut dibulatkan', bulk.items[0].bulan_realisasi[0] === 2.68)

let tolakNegatif = false
try { UpdateQuarterSchema.parse({ id: 1, quarter: 1, target: 1, realisasi: -0.5, expected_version: 0 }) }
catch { tolakNegatif = true }
cek('nilai negatif tetap ditolak', tolakNegatif, 'transform tidak melonggarkan min(0)')

// ─── C. Ragam desimal PrimaNumberField ──────────────────────────────────────
console.log('\nC. Komponen isian')

const prima = kode(baca(F_PRIMA))
cek('punya prop desimal', /desimal\?:\s*number/.test(prima))
cek('ragam desimal pindah ke type="text"',
  /type=\{pakaiDesimal \? 'text' : 'number'\}/.test(prima),
  'type=number memulangkan "" untuk ketikan berkoma')
cek('inputMode ikut decimal', /inputMode=\{pakaiDesimal \? 'decimal' : 'numeric'\}/.test(prima))
cek('memakai aturan baca bersama', /bacaDesimal\(/.test(prima) && /from '@\/lib\/shared\/desimal'/.test(prima))
cek('membulatkan saat meninggalkan field', /const rapikanDesimal = \(\) => \{/.test(prima))
cek('pemanggil tetap menerima angka berTITIK',
  /el\.value = kanonik/.test(prima),
  'parseFloat di pemanggil jalan apa adanya')
cek('teks yang sedang diketik dikembalikan sesudah dikirim', /el\.value = sedangTampil/.test(prima))
cek('sinkron dari induk dilewati saat sedang diketik',
  /if \(!pakaiDesimal \|\| fokus\.current\) return/.test(prima),
  '"7," tidak ditulis ulang jadi "7"')
cek('onFocus & onBlur milik pemanggil tetap dipanggil',
  /onFocus\?\.\(e\)/.test(prima) && /onBlur\?\.\(e\)/.test(prima))
cek('bump ikut membulatkan', /bulatkanDesimal\(kini \+ dir \* stp, desimal\)/.test(prima))
cek('pemakai lama tetap type=number', /'text' : 'number'/.test(prima) && !/type="text"/.test(prima))
cek('min/max/step tidak dipasang di ragam teks',
  /min=\{pakaiDesimal \? undefined : min\}/.test(prima),
  'atribut angka tak berlaku di input teks')

// ─── D. Tiga pintu memakai aturan yang sama ─────────────────────────────────
console.log('\nD. Tiga pintu pengisian realisasi')

const kisi = kode(baca(F_KISI))
cek('kisi 12 bulan minta 2 desimal', /desimal=\{2\}/.test(kisi))
cek('kisi masih membaca e.target.value sebagai angka', /parseFloat\(e\.target\.value\)/.test(kisi))

const twSrc = kode(baca(F_TW))
cek('modal Triwulan: Realisasi 2 desimal', /min=\{0\} desimal=\{2\} required value=\{realisasi\}/.test(twSrc))
cek('modal Triwulan: Target ikut 2 desimal', /min=\{0\} desimal=\{2\} required value=\{target\}/.test(twSrc),
  'satu form, satu aturan')

const matriks = kode(baca(F_MATRIKS))
cek('Matriks membaca lewat aturan bersama', /const n = bacaDesimal\(s\)/.test(matriks))
cek('Matriks tidak lagi parseFloat sendiri', !/parseFloat\(s\.replace/.test(matriks))
cek('Matriks menyimpan teks sel yang sedang diketik', /selDiketik\?\.kunci === kunciSel \? selDiketik\.teks : tulisDesimal\(v\)/.test(matriks))
cek('Matriks membulatkan saat sel ditinggalkan', /setCell\(r\.id, m, n == null \? null : bulatkanDesimal\(n\)\)/.test(matriks))
cek('blur hanya menulis sel yang memang diketik',
  /if \(selDiketik\?\.kunci !== kunciSel\) return;/.test(matriks),
  'tanpa ini blur menghapus sel terisi')
cek('nilai sel digambar berkoma', /value=\{selDiketik\?\.kunci === kunciSel/.test(matriks))
cek('mode warna ikut berkoma', /v == null \? '—' : tulisDesimal\(v\)/.test(matriks))
cek('paste blok Excel tetap lewat parseVal', /arr\[m\] = parseVal\(cell\)/.test(matriks))

// ─── E. Tampilan: angka mentah tidak lagi dicetak apa adanya ────────────────
console.log('\nE. Tampilan angka')

cek('kartu Triwulan: realisasi berkoma', /\{tulisDesimal\(q\.realisasi\)\}/.test(kisi))
cek('kartu Triwulan: target berkoma', /\{tulisDesimal\(q\.target\)\}/.test(kisi))
cek('pratinjau TW otomatis berkoma', /\{tulisDesimal\(derivedRealisasi\[i\]\)\}/.test(kisi))
cek('target bulan di bawah sel berkoma', /target \$\{tulisDesimal\(targetB\)\}/.test(kisi))
cek('kartu evaluasi berkoma', /value=\{tulisDesimal\(target\)\}/.test(kisi) && /value=\{tulisDesimal\(realisasi\)\}/.test(kisi))
cek('tidak ada lagi {q.realisasi} mentah', !/>\{q\.realisasi\}</.test(kisi))
cek('tidak ada lagi {realAkhir} mentah di layar utama', !/\{realAkhir\} <span/.test(kisi))

const cetak = kode(baca(F_CETAK))
cek('tabel Cetak: TW berkoma', /\{tulisDesimal\(r\[`q\$\{q\}_realisasi`\]\)\}/.test(cetak))
cek('tabel Cetak: realisasi akhir berkoma', /\{tulisDesimal\(realAkhir\)\}/.test(cetak))

const ekspor = kode(baca(F_EKSPOR))
cek('PDF rekap berkoma', /`\$\{tulisDesimal\(r\.q1_realisasi\)\}\/\$\{tulisDesimal\(r\.q1_target\)\}`/.test(ekspor))
cek('PDF detail berkoma', /\['Realisasi Akhir Tahun', tulisDesimal\(realAkhir\)\]/.test(ekspor))
cek('Excel TETAP angka, bukan teks',
  /q1r: r\.q1_realisasi,/.test(ekspor),
  'sel Excel harus bisa dihitung')

// ─── F. Kolom DB tidak berubah ──────────────────────────────────────────────
console.log('\nF. Skema')

const skema = baca('docs/schema-mysql.sql')
cek('q*_realisasi tetap DECIMAL(14,2)',
  /q1_realisasi\s+DECIMAL\(14,2\)/.test(skema) && /q4_realisasi\s+DECIMAL\(14,2\)/.test(skema),
  '2 desimal muat — nol migrasi')
cek('bulan_realisasi tetap JSON', /bulan_realisasi JSON/.test(skema))

const skemaZod = kode(baca(F_SKEMA))
cek('satu definisi angka desimal dipakai bersama',
  (skemaZod.match(/AngkaDesimal/g) ?? []).length >= 3)
cek('satu definisi larik bulanan dipakai bersama',
  (skemaZod.match(/BulanArray/g) ?? []).length >= 5,
  'dua salinan aturan = dua pendapat')

// ─── G. Target: isian, penjumlahan, dan pagar servernya ─────────────────────
// Target itu PEMBAGI capaian. Kalau ia cuma bisa diisi bilangan bulat sementara
// realisasinya sudah berdesimal, indikator ber-target 99,5 harus dibulatkan
// jadi 100 atau 99 — dan seluruh persentase yang berdiri di atasnya bergeser.
console.log('\nG. Target di Data Entry')

const F_ENTRY = 'app/(dashboard)/rencana-aksi/_components/DataEntryForm.tsx'
const F_TIPE = 'app/(dashboard)/rencana-aksi/_lib/types.ts'
const F_DATA = 'lib/data/rencana-aksi.ts'
const entry = kode(baca(F_ENTRY))

cek('empat kelompok isian target minta 2 desimal',
  (entry.match(/desimal=\{2\}/g) ?? []).length === 4,
  'RPJMD · tahunan · TW manual · 12 target bulanan')
cek('target bulanan ikut berdesimal',
  /desimal=\{2\}\s*\n\s*value=\{bulanTarget\[i\] == null \? '' : bulanTarget\[i\]\}/.test(entry),
  'sumber turunan TW — kalau bulat, TW-nya ikut bulat')
cek('kosong pada target bulanan tetap null, bukan nol',
  /e\.target\.value === '' \? null : \(parseFloat\(e\.target\.value\) \|\| 0\)/.test(entry), 'R3')

cek('tabel Data Entry: RPJMD berkoma', /\{tulisDesimal\(row\.target_rpjmd\)\}/.test(entry))
cek('tabel Data Entry: tahunan berkoma', /\{tulisDesimal\(row\.target_tahunan\)\}/.test(entry))
cek('tidak ada lagi {row.target_tahunan} mentah', !/\{row\.target_tahunan\}/.test(entry))
cek('spanduk "target diubah" berkoma',
  /\{tulisDesimal\(barisAsli\.target_tahunan\)\}/.test(entry) && /\{tulisDesimal\(targetTahunan\)\}/.test(entry),
  'angka sebelum→sesudah dibaca orang, bukan mesin')
cek('pratinjau TW turunan berkoma',
  (entry.match(/\{tulisDesimal\(derivedQ\[i\]\)\}/g) ?? []).length === 2,
  'TW hanya-baca + pratinjau bulanan')
cek('total/akhir pratinjau berkoma', /tulisDesimal\(derivedQ\.reduce/.test(entry))

// ─── Penjumlahan: tempat lahirnya 10,370000000000001 ────────────────────────
console.log('\nG2. Penjumlahan target bulanan → triwulan')

const bulan12 = (isi: (number | null)[]): (number | null)[] =>
  [...isi, ...Array(12 - isi.length).fill(null)]

const twAkum = deriveQuartersFromMonthly(bulan12([1, 1.04, 8.33]), 'Akumulatif')
cek('TW dari 3 bulan berdesimal dibulatkan', twAkum[0] === 10.37,
  `penjumlahan apa adanya ${1 + 1.04 + 8.33}`)
cek('bulan kosong dianggap nol saat menjumlah',
  deriveQuartersFromMonthly(bulan12([2.5]), 'Akumulatif')[0] === 2.5)
cek('triwulan lain tidak ikut terisi', twAkum[1] === 0 && twAkum[2] === 0 && twAkum[3] === 0)

const twSnapshot = deriveQuartersFromMonthly(bulan12([1.11, 2.22, 3.33]), 'Progres Positif')
cek('Progres: TW = bulan terakhir terisi, tanpa dijumlah', twSnapshot[0] === 3.33)

const barisAkum = {
  jenis: 'Akumulatif',
  q1_realisasi: 1, q2_realisasi: 1, q3_realisasi: 8.33, q4_realisasi: 1.04,
  bulan_realisasi: null,
} as unknown as RaRow
cek('realisasi akhir tahun (4 triwulan) dibulatkan',
  realisasiAkhirTahun(barisAkum) === 11.37,
  `penjumlahan apa adanya ${1 + 1 + 8.33 + 1.04}`)

const tipe = kode(baca(F_TIPE))
const dataLayer = kode(baca(F_DATA))
cek('penjumlahan klien dibulatkan di tempatnya', /bulatkanDesimal\(part\.reduce/.test(tipe))
cek('penjumlahan server dibulatkan di tempatnya', /bulatkanDesimal\(part\.reduce/.test(dataLayer),
  'dua salinan rumus — keduanya wajib, kalau tidak layar & DB berbeda pendapat')
cek('realisasi akhir tahun ikut dibulatkan', /bulatkanDesimal\(qs\.reduce/.test(tipe))

// ─── Pagar server untuk target ──────────────────────────────────────────────
console.log('\nG3. Pagar server: target')

const dasarUpsert = {
  tahun: 2026, level: 'sub-kegiatan', program: 'P', kegiatan: 'K', sub_kegiatan: 'SK',
  indikator: 'I', jenis: 'Akumulatif', satuan: 'Persen',
}
const up = UpsertRencanaAksiSchema.parse({
  ...dasarUpsert,
  target_rpjmd: 99.567, target_tahunan: 10.005,
  q1_target: 7.567, q2_target: 0, q3_target: 0, q4_target: 0,
  bulan_target: [1.005, null, 0, ...Array(9).fill(null)],
})
cek('target RPJMD dibulatkan', up.target_rpjmd === 99.57, `99,567 → ${up.target_rpjmd}`)
cek('target tahunan dibulatkan', up.target_tahunan === 10.01)
cek('target triwulan dibulatkan', up.q1_target === 7.57)
cek('target bulanan dibulatkan', up.bulan_target?.[0] === 1.01)
cek('bulan kosong tetap null', up.bulan_target?.[1] === null, 'R3 — bukan 0')
cek('nol nyata pada target bulanan bertahan', up.bulan_target?.[2] === 0)

const tanpaTarget = UpsertRencanaAksiSchema.parse({ ...dasarUpsert })
cek('tanpa target tetap default 0', tanpaTarget.target_tahunan === 0 && tanpaTarget.q1_target === 0)

const ut = UpdateTargetsSchema.parse({ id: 1, target_rpjmd: 2.675, target_tahunan: 7.567, expected_version: 0 })
cek('jalur ubah target ikut dibulatkan', ut.target_rpjmd === 2.68 && ut.target_tahunan === 7.57)

const imp = ImportCommitSchema.parse({
  tahun: 2026, mode: 'tambah',
  rows: [{
    level: 'sub-kegiatan', nama: 'SK', indikator: 'I', satuan: 'Persen',
    target_tahunan: 7.936508, q: [1.005, 0, 0, 0],
    bulan: [2.675, ...Array(11).fill(null)],
  }],
})
cek('impor: target tahunan dari berkas dibulatkan', imp.rows[0].target_tahunan === 7.94,
  '7.936508 memang ada di berkas asli')
cek('impor: target triwulan dibulatkan', imp.rows[0].q[0] === 1.01)
cek('impor: target bulanan dibulatkan', imp.rows[0].bulan?.[0] === 2.68)

let tolakTargetNegatif = false
try { UpdateTargetsSchema.parse({ id: 1, target_rpjmd: -1, target_tahunan: 0, expected_version: 0 }) }
catch { tolakTargetNegatif = true }
cek('target negatif tetap ditolak', tolakTargetNegatif)

// ─── Dokumen cetak ──────────────────────────────────────────────────────────
console.log('\nG4. Dokumen')

cek('PDF Cetak gabungan memformat angka non-rupiah',
  /typeof v === 'number'\) return c\.money \? v\.toLocaleString\('id-ID'\) : tulisDesimal\(v\)/.test(ekspor),
  'kalau tidak, tabel yang sama berbunyi 7,5 di layar dan 7.5 di PDF')
cek('Excel Cetak gabungan TETAP angka',
  /row\.getCell\(c\.key\)\.value = typeof v === 'string' \? sanitizeCell\(v\) : v/.test(ekspor),
  'selnya harus bisa dihitung')
cek('kolom target di DB tetap DECIMAL(14,2)',
  /target_rpjmd\s+DECIMAL\(14,2\)/.test(skema) && /target_tahunan\s+DECIMAL\(14,2\)/.test(skema),
  'nol migrasi')

console.log(`\n${gagal === 0 ? 'SEMUA LULUS' : 'ADA YANG GAGAL'} — ${lulus} lulus, ${gagal} gagal\n`)
process.exit(gagal === 0 ? 0 : 1)
