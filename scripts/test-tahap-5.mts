#!/usr/bin/env npx tsx
// scripts/test-tahap-5.mts — penjaga regresi Tahap 5 (Pusat Akses · Fase C + P1).
// Konsep: docs/CONCEPT-pusat-akses-satu-pintu.md §4.5, §16.4, §17.2 Tahap 5.
//
// Bagian A menguji PERILAKU sungguhan (aturan pintu dipanggil dengan data buatan);
// B–G statis, untuk hal yang tidak punya bentuk fungsi — bahwa berkas daunnya tetap
// daun, bahwa pintu keduanya benar-benar tertutup, bahwa satu Simpan tetap satu
// transaksi.
//
// DUA aturan menulis asersi di berkas ini, dua-duanya lahir dari kesalahan nyata:
//
//   1. **Kutip utuh sampai kurung buka** (L82c). Mengutip syarat sepotong membuat
//      `false && <kutipan>` tetap cocok, jadi mutasi lolos.
//   2. **Jangan menghitung "seharusnya" dengan rumus yang diperiksa.** Di Tahap 4 satu
//      asersi lolos karena kedua sisinya bergeser bersamaan. Yang ditegaskan keadaan
//      yang diharapkan, bukan cara menghitungnya.
//
// Jalankan: npx tsx scripts/test-tahap-5.mts

import fs from 'node:fs'
import { barisPintu, grantYangBerarti } from '../lib/admin/pintu-akses'

let lulus = 0
let gagal = 0

function cek(nama: string, syarat: boolean, catatan = '') {
  if (syarat) { lulus++; console.log(`  ok    ${nama.padEnd(66)} ${catatan}`) }
  else { gagal++; console.log(`  GAGAL ${nama.padEnd(66)} ${catatan}`) }
}

const baca = (p: string) => fs.readFileSync(p, 'utf8')
const ada = (p: string) => fs.existsSync(p)

/** Buang komentar baris & blok. WAJIB dipakai sebelum asersi "tidak boleh ada lagi". */
function buangKomentar(t: string): string {
  return t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')
}
const hitung = (t: string, s: string) => t.split(s).length - 1

/**
 * Badan satu fungsi saja. Jendela yang menjulur ke fungsi tetangga menuduh yang salah —
 * dan yang lebih berbahaya, ia bisa membuat asersi "tidak boleh ada X" LULUS karena X
 * kebetulan tidak ada di fungsi ini tapi ada di sebelahnya, atau sebaliknya. Batasnya
 * deklarasi fungsi berikutnya pada tingkat indentasi mana pun — fungsi bersarang di
 * dalam komponen React tidak diawali `export`.
 */
function badan(t: string, tanda: string): string {
  const i = t.indexOf(tanda)
  if (i < 0) return ''
  const sisa = t.slice(i + tanda.length)
  const m = sisa.match(/\n\s*(?:export\s+)?(?:async\s+)?function\s/)
  return tanda + (m ? sisa.slice(0, m.index) : sisa)
}

// ── A · Aturan pintu: tiap baris menyebut SEBABNYA ───────────────────────────
console.log('\nA · pintu modul & sebabnya')

const pintuProgram = barisPintu('PROGRAM', ['blud'])
const p = (k: string) => pintuProgram.find((b) => b.kunci === k)!

// Inilah T-6 dalam bentuk yang bisa diuji: PROGRAM ada di `peranBawaan` PK, jadi
// centangnya TIDAK berarti apa-apa dan wajib mati — mencabutnya tidak menutup pintu.
cek('PK terbuka karena peran → kotak DIMATIKAN', p('perjanjian_kinerja').bisaDicentang === false)
cek('…dan sebabnya menyebut nama perannya', p('perjanjian_kinerja').sebab.includes('Program'))
cek('…dan menyatakan mencabut centang tidak menutupnya',
  p('perjanjian_kinerja').sebab.includes('mencabut centang tidak menutupnya'))
cek('PK tetap TERBUKA', p('perjanjian_kinerja').terbuka === true)

cek('BLUD terbuka karena grant → kotak HIDUP', p('blud').bisaDicentang === true)
cek('…dan sebabnya menyatakan mencabutnya MENUTUP', p('blud').sebab.includes('akan menutupnya'))
cek('modul tertutup punya kotak hidup + sebab', p('iki').bisaDicentang === true && p('iki').terbuka === false)
cek('Usulan terbuka untuk semua peran, kotak mati',
  p('usulan_aset').terbuka === true && p('usulan_aset').bisaDicentang === false
  && p('usulan_aset').sebab.includes('tidak menambah apa pun'))
cek('Admin Panel tidak bisa digrant', p('admin').bisaDicentang === false && p('admin').terbuka === false)
cek('tiap baris SELALU punya kalimat sebab', pintuProgram.every((b) => b.sebab.trim().length > 20))

// Peran yang mendapat modul dari perannya tidak boleh menuliskan grant yang tidak
// membuka apa pun — kalau lolos, Pemeriksaan Mandiri akan melaporkannya sebagai
// "pemberian akses yang tidak menambah apa-apa" yang lahir dari layar ini sendiri.
cek('grantYangBerarti membuang grant yang sudah didapat dari peran',
  !grantYangBerarti('PROGRAM', ['perjanjian_kinerja', 'blud']).includes('perjanjian_kinerja'))
cek('…dan mempertahankan yang memang menambah',
  grantYangBerarti('PROGRAM', ['perjanjian_kinerja', 'blud']).includes('blud'))
cek('grantYangBerarti membuang kunci karangan',
  grantYangBerarti('PROGRAM', ['modul_karangan']).length === 0)
cek('grantYangBerarti membuang kembar', grantYangBerarti('PROGRAM', ['blud', 'blud']).length === 1)

// Peran ADMIN mendapat delapan modul dari perannya — persis kasus yang membuat modal
// lama menyesatkan.
const pintuAdmin = barisPintu('ADMIN', [])
cek('ADMIN: mayoritas pintu terbuka TANPA satu grant pun',
  pintuAdmin.filter((b) => b.terbuka).length >= 8,
  `${pintuAdmin.filter((b) => b.terbuka).length} terbuka`)
cek('ADMIN: tidak satu pun pintu itu bisa dicentang',
  pintuAdmin.filter((b) => b.terbuka && b.bisaDicentang).length === 0)

// ── B · Berkas daun HARUS tetap daun ─────────────────────────────────────────
console.log('\nB · pemisahan klien/server')

// Ini pemeriksaan paling penting di berkas ini. Versi pertama Pusat Akses menaruh
// `barisPintu` di `pusat-akses.ts`, dan satu impor `getRoleQuota` dari
// `lib/security/promotion.ts` menyeret `verifyPassword` → `auth.ts` → `next/headers`
// ke bundel peramban. Seluruh rute /admin balas 500, dan pesannya menunjuk `auth.ts` —
// bukan barisnya. `tsc` LULUS, ESLint LULUS.
const daun = buangKomentar(baca('lib/admin/pintu-akses.ts'))
for (const terlarang of ['lib/data/db', 'lib/security/', 'next/server', 'next/headers', 'mysql2', 'lib/admin/pusat-akses']) {
  cek(`pintu-akses.ts tidak mengimpor ${terlarang}`, !daun.includes(terlarang))
}
cek('pintu-akses.ts memuat aturan pintunya', daun.includes('export function barisPintu('))
cek('pintu-akses.ts memuat bentuk berkasnya', daun.includes('export type BerkasOrang'))

const panel = buangKomentar(baca('app/(dashboard)/admin/_panels/TabPusatAkses.tsx'))
cek('layar mengambil dari berkas daun, bukan dari yang membaca DB',
  panel.includes("from '@/lib/admin/pintu-akses'") && !panel.includes("from '@/lib/admin/pusat-akses'"))

// ── C · Satu pintu (§17.4 langkah 7) ─────────────────────────────────────────
console.log('\nC · pintu kedua benar-benar tertutup')

cek('TabUserMgmt.tsx sudah tidak ada', !ada('app/(dashboard)/admin/_panels/TabUserMgmt.tsx'))
const menuPanel = buangKomentar(baca('app/(dashboard)/admin/_panels/MenuAccessPanel.tsx'))
cek('MenuAccessModal (per-orang) sudah tidak ada', !menuPanel.includes('export function MenuAccessModal'))
cek('matriks per-PERAN TETAP ada — ia bukan pintu kedua',
  menuPanel.includes('export function MenuAccessRoleTab'))

const klien = buangKomentar(baca('app/(dashboard)/admin/admin-client.tsx'))
cek("tab 'user-mgmt' hilang dari rel", !klien.includes("'user-mgmt'"))
cek('tab Pusat Akses terpasang', klien.includes("id:'pusat-akses'"))
cek('Pusat Akses SUPER_ADMIN saja', klien.includes("tab === 'pusat-akses'     && isSA &&"))
cek("tab menu-access berganti nama jadi 'Peran'", klien.includes("label:'Peran'"))

// Yang ikut pindah bersama tab lama. Kalau salah satu tertinggal, mematikan tab itu
// memutus satu-satunya pintunya — dan itu baru ketahuan saat ada yang membutuhkannya.
for (const [jalur, nama] of [
  ["method: 'POST',", 'buat akun'],
  ["action: 'reset-password'", 'reset kata sandi'],
  ["'nonaktif' : 'aktifkan'", 'nonaktif/aktifkan'],
  ["'putus-sesi'", 'putus sesi'],
  ['unlock-promotion', 'buka kunci promosi'],
  ['revoke-probation', 'cabut masa percobaan'],
] as const) {
  cek(`aksi "${nama}" ikut pindah ke Pusat Akses`, panel.includes(jalur))
}

// ── D · Satu Simpan, satu transaksi ──────────────────────────────────────────
console.log('\nD · simpan')

const lib = buangKomentar(baca('lib/admin/pusat-akses.ts'))
cek('seluruh penyimpanan dibungkus satu transaksi',
  hitung(lib, 'await withTransaction(async ({ tx, conn }) =>') === 1)
// Kunci diambil menurut nama key MENAIK — aturan yang sudah tertulis di
// `lib/data/menu-access.ts` saat belum ada pemakainya. Tanpa urutan, dua transaksi
// bisa saling menunggu.
cek('kunci diambil menurut urutan key menaik',
  lib.includes('for (const appKey of [...MENU_APP_KEYS].sort()) {\n      await acquireBludLock('))
cek('baris user dikunci FOR UPDATE lewat tx, bukan koneksi lain',
  hitung(lib, 'const baris = await tx`') === 1
  && lib.includes('SELECT role, username, app_access FROM users WHERE id = ${p.userId} FOR UPDATE'))
// Sidik jari menu menjawab "apakah izinnya berubah"; ia TIDAK menjawab "apakah
// orangnya masih berperan sama". Layar yang dimuat saat seseorang masih PROGRAM lalu
// disimpan setelah ia dipindah ke KEUANGAN akan menulis izin milik jabatan yang sudah
// ditinggalkan — dan tak satu pun pemeriksaan lain menyalak.
cek('peran yang dilihat layar diperiksa terhadap DB',
  lib.includes('if (target.role !== p.roleAwal) throw new PeranBerubahError()'))
cek('ganti peran MEMBUANG perkecualian menu',
  badan(lib, 'export async function simpanBerkasOrang').includes('hasil.izinDihapus += await hapusIzinOrang(tx, p.userId)'))
// Sesudah ganti peran, perkecualian yang dikirim layar milik jabatan LAMA. Menulisnya
// balik akan membatalkan penghapusan yang baru saja terjadi.
cek('perkecualian dari layar diabaikan saat peran berganti', lib.includes('if (!gantiPeran) {'))
cek('modul yang pintunya tertutup ikut dibersihkan perkecualiannya',
  lib.includes('if (!terbukaBaru.has(appKey)) hasil.izinDihapus += await hapusIzinOrang(tx, p.userId, appKey)'))
cek('sidik jari diperiksa di dalam transaksi, bukan lewat cache',
  lib.includes('SELECT menu_key, izin FROM menu_user_access\n    WHERE user_id = ${userId} AND app_key = ${appKey} FOR UPDATE'))
// Satu Simpan mengirim SELURUH modul yang terbuka. Menulis semuanya membuat jejak
// audit berbunyi "izin menu diperbarui" untuk modul yang tidak disentuh siapa pun.
cek('modul yang isinya sama dilewati, tidak ditulis ulang',
  lib.includes('if (sidikJariIzin(new Map(baris)) === sidikJariIzin(kini)) return false'))
cek('kuota diperiksa saat peran berganti', lib.includes('await assertQuotaAvailableTx(peranBaru, tx)'))

const rute = buangKomentar(baca('app/api/admin/pusat-akses/route.ts'))
cek('seluruh route SUPER_ADMIN saja', rute.includes("session.role !== 'SUPER_ADMIN'"))
cek('SUPER_ADMIN tidak bisa diatur dari sini',
  rute.includes("if (b.role_awal === 'SUPER_ADMIN') return tolak("))
cek('wewenang sendiri tidak diatur dari sini',
  rute.includes('if (b.user_id === session.userId) return tolak('))
cek('bentrok dua admin dijawab 409, bukan ditimpa diam-diam',
  rute.includes("code: 'BERUBAH'") && rute.includes("code: 'PERAN_BERUBAH'"))
cek('kuota penuh dijawab 409', rute.includes("code: 'KUOTA_PENUH'"))

// Pengingat belum-tersimpan memakai yang SUDAH ADA, bukan mekanisme kedua —
// tiga pintu keluarnya sudah terpasang di sana (muat ulang, <a>, router.push).
cek('pengingat belum-tersimpan memakai lib bersama',
  panel.includes("from '@/lib/shared/belum-tersimpan'") && panel.includes('useIngatkanBelumTersimpan('))

// ── E · C6 · jenis peristiwa audit sendiri ───────────────────────────────────
console.log('\nE · jejak audit')

const audit = buangKomentar(baca('lib/security/auditlog.ts'))
for (const jenis of ['ACCESS_GRANT', 'ACCESS_REVOKE', 'ROLE_CHANGE', 'USER_ARCHIVE']) {
  cek(`jenis ${jenis} terdaftar`, audit.includes(`| '${jenis}'`))
  cek(`…dan dipakai route`, rute.includes(`eventType: '${jenis}'`))
}
// `USER_UPDATE` TIDAK dibuang: mengganti nama jenis yang sudah tertulis di ribuan baris
// audit akan membuat riwayatnya berlubang.
cek("USER_UPDATE tetap ada untuk jalur lama", audit.includes("| 'USER_UPDATE'"))

// ── F · C5 · Arsipkan vs Hapus permanen (T-12) ───────────────────────────────
console.log('\nF · arsip & hapus permanen')

cek('mode WAJIB disebut — tidak ada bawaan diam-diam',
  rute.includes("if (mode !== 'arsip' && mode !== 'permanen') return tolak("))
cek('arsip: status + deleted_at + sesi dicabut, satu transaksi',
  rute.includes("UPDATE users SET status = 'NONAKTIF', deleted_at = NOW()"))
cek('arsip menolak akun yang sudah diarsipkan', rute.includes('if (t.deleted_at) return tolak('))
// Sesudah barisnya hilang, tidak ada lagi cara mengetahui angkanya.
cek('jejak dihitung SEBELUM menghapus', badan(rute, 'export async function DELETE').includes(
  'const jejak = await hitungJejakOrang(id)\n    await withTransaction('))
cek('akun yang diarsipkan disembunyikan dari daftar di SERVER',
  rute.includes('${arsip ? sql`` : sql`AND u.deleted_at IS NULL`}'))

// Daftar tabel jejaknya DIBACA dari information_schema, bukan diketik. Ada tiga puluhan
// kolom yang menunjuk users(id); daftar tangan akan memberi angka yang terlihat pasti
// tapi terlalu kecil — kesalahan yang paling sulit ketahuan, karena angkanya tetap
// masuk akal.
cek('daftar tabel jejak dibaca dari information_schema',
  lib.includes('information_schema.KEY_COLUMN_USAGE'))
cek('SET NULL & CASCADE dipisah — akibatnya berbeda',
  lib.includes("h.aturan === 'SET NULL'") && lib.includes("h.aturan === 'CASCADE'"))
cek('nama tabel/kolom disaring bentuknya sebelum masuk kueri',
  lib.includes('if (!IDENTIFIER.test(k.tabel) || !IDENTIFIER.test(k.kolom)) return null'))
cek('layar menampilkan angkanya, bukan peringatan umum',
  panel.includes('jj.totalKehilangan > 0') && panel.includes('baris akan kehilangan pemiliknya'))

// ── G · P1 · Paket Akses ─────────────────────────────────────────────────────
console.log('\nG · paket akses')

const skema = buangKomentar(baca('lib/data/admin-schemas.ts'))
cek('paket punya skema Zod sendiri', skema.includes('export const PaketAksesSchema'))
// Paket TIDAK boleh memuat peran: memberi peran punya kuota, mencabut sesi, dan
// membatalkan probation. Itu aksi tersendiri, bukan isi paket (§12 P1).
cek('paket TIDAK memuat peran', !/PaketAksesSchema = z\.object\(\{[\s\S]{0,400}role:/.test(skema))
cek('daftar paket dibatasi jumlahnya', skema.includes('DaftarPaketSchema = z.array(PaketAksesSchema).max(20)'))
// `app_config.value` TEXT tanpa bentuk, jadi Zod satu-satunya yang menjaganya — dan
// baris yang rusak harus jatuh jadi "tidak ada paket", bukan merobohkan layarnya.
cek('paket divalidasi saat DIBACA', rute.includes('DaftarPaketSchema.safeParse(JSON.parse(rows[0].value))'))
cek('baris rusak jatuh jadi daftar kosong, tidak melempar',
  badan(rute, 'async function bacaPaket').includes('return hasil.success ? hasil.data : []'))
cek('paket divalidasi lagi saat DITULIS, sebagai daftar utuh',
  rute.includes('const sah = DaftarPaketSchema.safeParse(baru)'))
// Paket MENGISI FORM. Kalau ia jadi acuan hidup, menyunting satu paket diam-diam
// mengubah wewenang belasan orang sekaligus.
cek('menerapkan paket cuma mengisi form, tidak menulis',
  panel.includes('async function terapkanPaket(p: Paket)') && !badan(panel, 'async function terapkanPaket').includes('method:'))
cek('asal paket ikut tercatat di audit', rute.includes('b.asal_paket ? ` [paket '))
cek('paket bisa disusun dari layar, bukan cuma lewat MySQL',
  panel.includes("aksi: 'simpan-paket'") && panel.includes("aksi: 'hapus-paket'"))

// -- H . Sticky yang benar-benar menempel ------------------------------------
console.log('\nH · rel & daftar orang tetap di tempat')

// Dua kolom yang HARUS tetap terlihat saat halaman digulir: rel kiri (sejak Tahap 3)
// dan daftar orang (Tahap 5). Keduanya `position: sticky`, dan keduanya sempat MATI
// tanpa satu galat pun.
//
// Sebabnya satu kata di berkas lain: `.ap-body{overflow-x:hidden}`. Begitu satu sumbu
// bukan `visible`, sumbu satunya otomatis jadi `auto` — jadi `.ap-body` berubah jadi
// scrollport terdekat bagi tiap sticky di dalamnya, padahal ia sendiri tumbuh mengikuti
// isinya dan tidak pernah menggulung. Sticky jadi punya jangkauan NOL.
//
// Tidak ada alat yang bisa melihat ini: CSS-nya sah, tsc lulus, ESLint lulus, gate E
// lulus. Ketahuan waktu halamannya digulir. Karena itu ia dijaga di sini.
const css = baca('app/(dashboard)/admin/admin.css')
const aturanBody = css.slice(css.indexOf('.ap-body{min-height:100vh'), css.indexOf('.ap-top{'))
cek('.ap-body memotong TANPA membuat kotak gulir', aturanBody.includes('overflow-x:clip'))
cek('...dan tidak kembali ke overflow-x:hidden', !aturanBody.includes('overflow-x:hidden'))
cek('rel kiri sticky', /\.ap-rail\{[^}]*position:sticky/.test(css))
cek('daftar orang sticky', /\.ap-pa-kiri\{[^}]*position:sticky/.test(css))
// Offsetnya harus sama dengan tinggi topbar (56px), plus padding isi (24px) untuk
// kolom kiri. Angka yang meleset membuat sticky menempel di tempat yang salah — dan
// itu terbaca seperti "kadang menempel, kadang tidak".
cek('rel menempel tepat di bawah topbar 56px', /\.ap-rail\{[^}]*top:56px/.test(css))
cek('daftar orang menempel di 56px + padding 24px', /\.ap-pa-kiri\{[^}]*top:80px/.test(css))
cek('topbar sendiri sticky di 0', /\.ap-top\{[^}]*position:sticky;top:0/.test(css))

console.log(`\n${lulus + gagal} pemeriksaan · ${lulus} lulus · ${gagal} gagal`)
if (gagal > 0) {
  console.log('GAGAL — Tahap 5 tidak lagi utuh.')
  process.exit(1)
}
console.log('LULUS.')
