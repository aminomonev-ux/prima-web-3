#!/usr/bin/env npx tsx
// scripts/test-tahap-8.mts — penjaga regresi Tahap 8 (P3 Tinjauan · P11 Ekspor).
// Konsep: docs/CONCEPT-pusat-akses-satu-pintu.md §12 P3 & P11, §17.2 Tahap 8.
//
// Bagian A–B menguji PERILAKU (fungsi murni dipanggil dengan data buatan); C–E statis.
//
// Aturan menulis asersi sama dengan Tahap 4–7: kutip utuh sampai kurung buka (L82c),
// buang komentar sebelum asersi "tidak boleh ada lagi" — TERMASUK komentar SQL, dan
// JANGAN menghitung "seharusnya" dengan rumus yang sedang diperiksa.
//
// Jalankan: npx tsx scripts/test-tahap-8.mts

import fs from 'node:fs'
import {
  BULAN_TINJAUAN, MODUL_TINJAUAN, susunBaris, tinjauanKeAoa, type BarisMentah,
} from '../lib/admin/tinjauan-baris'

let lulus = 0
let gagal = 0

function cek(nama: string, syarat: boolean, catatan = '') {
  if (syarat) { lulus++; console.log(`  ok    ${nama.padEnd(66)} ${catatan}`) }
  else { gagal++; console.log(`  GAGAL ${nama.padEnd(66)} ${catatan}`) }
}

const baca = (p: string) => fs.readFileSync(p, 'utf8')
function buangKomentar(t: string): string {
  return t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')
}
/** Komentar SQL. WAJIB sebelum asersi apa pun atas .sql — prosanya menjelaskan
 *  keputusannya, jadi kalimat yang MENYEBUT sesuatu untuk mengatakan "ini sengaja tidak
 *  ada" akan menyalakan tesnya sendiri (tiga kali lolos di Tahap 7 karena ini). */
const buangKomentarSql = (t: string) => t.replace(/^\s*--.*$/gm, '')

const orang = (ganti: Partial<BarisMentah> = {}): BarisMentah => ({
  id: 1, username: 'uji', nama_lengkap: 'Uji Coba', role: 'PROGRAM', status: 'AKTIF',
  last_login: null, app_access: [], access_reviewed_at: null, peninjau: null,
  kedaluwarsa: 1, ...ganti,
})

// ── A · Satu baris tinjauan ──────────────────────────────────────────────────
console.log('\nA · perhitungan baris')

const b1 = susunBaris([orang({ role: 'PROGRAM', app_access: ['blud'] })])[0]
const kolom = (k: string) => b1.akses[MODUL_TINJAUAN.findIndex((m) => m.kunci === k)]

// Yang DIBERIKAN dan yang datang dari peran harus bisa dibedakan — itu seluruh gunanya
// layar ini. Kalau keduanya tampil sama, tinjauannya tidak punya apa pun untuk diputuskan.
cek('modul yang diberikan ditandai grant', kolom('blud') === 'grant')
cek('modul dari peran ditandai peran', kolom('perjanjian_kinerja') === 'peran')
cek('modul terbuka untuk semua ditandai semua', kolom('usulan_aset') === 'semua')
cek('modul tertutup kosong', kolom('iki') === null)
// Angka inilah yang dibaca auditor lebih dulu: berapa yang harus diputuskan.
cek('jumlahGrant menghitung yang DIBERIKAN saja', b1.jumlahGrant === 1, `${b1.jumlahGrant}`)

const bAdmin = susunBaris([orang({ role: 'ADMIN', app_access: [] })])[0]
cek('ADMIN: banyak pintu terbuka tanpa satu grant pun',
  bAdmin.akses.filter((a) => a !== null).length >= 8)
cek('…dan jumlahGrant-nya tetap NOL', bAdmin.jumlahGrant === 0)

// Modul yang tidak bisa diberikan per orang tidak punya apa pun untuk ditinjau di sini.
cek('Admin Panel tidak jadi kolom', !MODUL_TINJAUAN.some((m) => m.kunci === 'admin'))
cek('kolomnya sejajar dengan akses tiap baris', b1.akses.length === MODUL_TINJAUAN.length)

// `app_access` bisa NULL / bukan larik di baris lama — barisnya tidak boleh roboh.
//
// Diuji dengan OBJEK, bukan string. Versi pertama memakai `'blud'`, dan mutasinya LOLOS:
// `new Set('blud')` memang menghasilkan {b,l,u,d}, jadi tidak ada kunci modul yang cocok
// dan hasilnya kebetulan SAMA dengan yang benar. Objek tidak iterable — ia benar-benar
// melempar tanpa penjaganya, jadi bedanya terlihat.
cek('app_access null tidak merobohkan apa pun',
  susunBaris([orang({ app_access: null })])[0].jumlahGrant === 0)
cek('app_access bukan larik pun aman', (() => {
  try { return susunBaris([orang({ app_access: { blud: true } as unknown })])[0].jumlahGrant === 0 }
  catch { return false }
})())

// "Kedaluwarsa" datang dari SQL, tidak dihitung ulang di sini: dua tempat yang
// membandingkan tanggal akan berbeda pendapat pada hari salah satunya salah zona waktu.
cek('kedaluwarsa dipakai apa adanya dari server',
  susunBaris([orang({ kedaluwarsa: 0 })])[0].kedaluwarsa === false
  && susunBaris([orang({ kedaluwarsa: 1 })])[0].kedaluwarsa === true)

// ── B · Ekspor (P11) ─────────────────────────────────────────────────────────
console.log('\nB · ekspor Excel')

const aoa = tinjauanKeAoa([
  susunBaris([orang({ id: 7, username: 'sari', app_access: ['blud'], access_reviewed_at: '2026-03-01T00:00:00Z', peninjau: 'admin.it' })])[0],
])
cek('kepala kolom = identitas + tiap modul + tiga kolom penutup',
  aoa[0].length === 5 + MODUL_TINJAUAN.length + 3, `${aoa[0].length} kolom`)
cek('tiap baris data selebar kepalanya', aoa[1].length === aoa[0].length)
// Angka yang dilampirkan ke auditor wajib sama dengan yang di layar — pengekspor
// MENERIMA baris yang sudah dihitung, tidak menghitung ulang.
// Dua kelemahan pada versi pertama, dua-duanya membuat mutasinya lolos:
//   1. jendelanya dipotong pakai indeks dari teks MENTAH lalu diterapkan pada teks yang
//      sudah dibuang komentarnya — bergeser sejauh panjang komentar, jadi yang diperiksa
//      bagian berkas yang salah;
//   2. yang dicari `susunBaris(` BERKURUNG, sementara menyebut namanya saja sudah cukup
//      untuk memanggilnya lewat variabel. Nol kemunculan, bukan nol panggilan.
const daunBersih = buangKomentar(baca('lib/admin/tinjauan-baris.ts'))
const badanEkspor = daunBersih.slice(daunBersih.indexOf('export function tinjauanKeAoa'))
cek('pengekspor menerima baris jadi, tidak menyebut susunBaris sama sekali',
  badanEkspor.length > 0 && !badanEkspor.includes('susunBaris'))
cek('sumber akses ditulis kata, bukan lambang layar',
  aoa[1].includes('diberi akses') && !aoa[1].includes('✓'))
cek('belum pernah ditinjau ditulis apa adanya',
  (tinjauanKeAoa([susunBaris([orang()])[0]])[1]).includes('belum pernah'))
cek('jumlah grant ikut ke berkas', aoa[1].includes(1))

// ── C · Berkas daun tetap daun ───────────────────────────────────────────────
console.log('\nC · pemisahan klien/server')

// Layar Tinjauan menyusun berkas Excel DI PERAMBAN, jadi ia mengimpor pengekspornya.
// Satu impor server di berkas itu merobohkan seluruh rute /admin — preseden Tahap 5,
// dan `tsc`/ESLint dua-duanya lulus saat itu terjadi.
const daun = buangKomentar(baca('lib/admin/tinjauan-baris.ts'))
for (const terlarang of ['lib/data/db', 'lib/security/', 'next/server', 'next/headers', 'mysql2', 'lib/admin/tinjauan\'']) {
  cek(`tinjauan-baris.ts tidak mengimpor ${terlarang}`, !daun.includes(terlarang))
}
const panel = buangKomentar(baca('app/(dashboard)/admin/_panels/TabTinjauan.tsx'))
cek('layar mengambil dari berkas daun',
  panel.includes("from '@/lib/admin/tinjauan-baris'") && !panel.includes("from '@/lib/admin/tinjauan'"))
cek('aturan aksesnya dipinjam, tidak ditulis ulang', daun.includes("from '@/lib/admin/pintu-akses'"))

// ── D · Layar & route ────────────────────────────────────────────────────────
console.log('\nD · layar tinjauan')

const rute = buangKomentar(baca('app/api/admin/tinjauan/route.ts'))
cek('SUPER_ADMIN saja', rute.includes("session.role !== 'SUPER_ADMIN'"))
// Mencabut akses butuh alasan (P9), pembersihan izin menu (L69), dan pemeriksaan
// bentrok — semuanya sudah berdiri di Pusat Akses. Endpoint kedua = dua salinan aturan.
cek('TIDAK ada jalur pencabutan akses di route ini',
  !rute.includes('app_access') && !rute.includes('hapusIzinOrang'))
cek('menandai ditinjau tercatat di audit', rute.includes("eventType: 'USER_UPDATE'"))
cek('…dengan sasarannya (P8)', rute.includes('targetUserId: parsed.data.user_id'))
// Tanggal tinjauan itu BUKTI, dan bukti yang tanggalnya ditentukan pihak yang ditinjau
// bukan bukti.
const lib = buangKomentar(baca('lib/admin/tinjauan.ts'))
cek('stempel waktunya NOW() MySQL, bukan kiriman klien',
  lib.includes('SET access_reviewed_at = NOW(), access_reviewed_by = ${olehUserId}'))
cek('ambang bulan dipulangkan server, tidak diketik di layar',
  rute.includes('bulan: BULAN_TINJAUAN') && panel.includes('if (j.bulan) setBulan(j.bulan)'))
// L66: mysql2 menolak parameter terikat di dalam `INTERVAL`, jadi angkanya WAJIB lewat
// `sqlInt`. Yang dilarang disusun DARI konstantanya — mengetik "6" di sini akan membuat
// asersi ini ikut bergeser saat ambangnya diubah, persis kesalahan yang sudah berulang.
cek('ambang bulan sampai ke SQL lewat sqlInt, bukan angka yang diketik',
  lib.includes('INTERVAL ${sqlInt(BULAN_TINJAUAN)} MONTH')
  && !lib.includes(`INTERVAL ${BULAN_TINJAUAN} MONTH`))
cek('penyaring memakai bendera dari server', panel.includes('baris.filter(b => b.kedaluwarsa)'))
cek('ekspor memakai baris yang SEDANG TAMPIL, bukan seluruhnya',
  panel.includes('tinjauanKeAoa(tampil)'))
cek('tombol ATUR memindahkan ke Pusat Akses', panel.includes('onKeAkses(b.id)'))
// Prop terkendali, bukan prop yang disalin ke state lewat efek — dua salinan "siapa yang
// sedang dibuka" dan satu efek yang harus menjaganya tetap sama.
const klien = buangKomentar(baca('app/(dashboard)/admin/admin-client.tsx'))
cek('pilihan orang dipegang induk, dioper terkendali',
  klien.includes('<TabPusatAkses pilih={pilihOrang} setPilih={setPilihOrang}/>'))
cek('tab Tinjauan SUPER_ADMIN saja', klien.includes("...(isSA ? [{ id:'tinjauan' as Tab"))

// ── E · Migrasi ──────────────────────────────────────────────────────────────
console.log('\nE · migrasi')

const mig = buangKomentarSql(baca('docs/migrations/migration-tinjauan-akses.sql'))
cek('dua kolom ditambahkan',
  mig.includes('ADD COLUMN access_reviewed_at') && mig.includes('ADD COLUMN access_reviewed_by'))
// Beda dari `audit_log.target_user_id` yang sengaja TANPA FK, dan alasannya berlawanan
// arah: di sini yang dijaga KEADAAN SEKARANG, bukan riwayat.
cek('peninjau ber-FK SET NULL', mig.includes('REFERENCES users(id) ON DELETE SET NULL'))
cek('ada indeks untuk penyaring "belum ditinjau"', mig.includes('CREATE INDEX idx_users_reviewed'))
// Mengisinya dengan tanggal migrasi membuat seluruh akun tampak baru ditinjau hari ini —
// bukti palsu, pada kolom yang seluruh gunanya jadi bukti.
cek('TANPA nilai awal', !mig.includes('UPDATE users SET access_reviewed_at'))
cek('kepalanya memuat kueri pemeriksaan',
  baca('docs/migrations/migration-tinjauan-akses.sql').includes('information_schema.COLUMNS'))
const schema = buangKomentarSql(baca('docs/schema-mysql.sql'))
cek('skema acuan ikut diperbarui',
  schema.includes('access_reviewed_at  DATETIME') && schema.includes('idx_users_reviewed'))
cek('…berikut FK-nya', schema.includes('fk_users_reviewed_by'))

console.log(`\n${lulus + gagal} pemeriksaan · ${lulus} lulus · ${gagal} gagal`)
if (gagal > 0) {
  console.log('GAGAL — Tahap 8 tidak lagi utuh.')
  process.exit(1)
}
console.log('LULUS.')
