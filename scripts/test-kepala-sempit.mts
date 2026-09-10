#!/usr/bin/env npx tsx
// scripts/test-kepala-sempit.mts — penjaga bilah kepala modul di layar sempit.
//
// Diukur 2026-09-10 pada viewport 375px: `/blud` butuh 622px dan
// `/perjanjian-kinerja` 733px, jadi HALAMANNYA yang bergulir menyamping — bukan
// tabelnya. Kepala yang `position: sticky` ikut tergeser dan meninggalkan pita kosong.
//
// Kenapa perlu dijaga: cacat ini tidak terlihat sama sekali di layar pengembang, tidak
// menghasilkan galat apa pun, dan `tsc` maupun ESLint tak punya cara mengetahuinya.
// Satu-satunya yang bisa menahannya kembali adalah pemeriksaan seperti ini.
//
// Aturan menulis asersi sama dengan suite lain: kutip utuh (L82c), buang komentar
// sebelum asersi "tidak boleh ada lagi", dan jangan menghitung "seharusnya" dengan rumus
// yang sedang diperiksa.
//
// Jalankan: npx tsx scripts/test-kepala-sempit.mts

import fs from 'node:fs'

let lulus = 0
let gagal = 0

function cek(nama: string, syarat: boolean, catatan = '') {
  if (syarat) { lulus++; console.log(`  ok    ${nama.padEnd(64)} ${catatan}`) }
  else { gagal++; console.log(`  GAGAL ${nama.padEnd(64)} ${catatan}`) }
}

const baca = (p: string) => fs.readFileSync(p, 'utf8')
const buangKomentarCss = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '')
const buangKomentar = (t: string) =>
  t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')

const SHELL = [
  ['BLUD', 'app/(dashboard)/blud/blud-shell.tsx', 'blud'],
  ['PK', 'app/(dashboard)/perjanjian-kinerja/pk-shell.tsx', 'pk'],
] as const

// ── A · Penanda di kedua shell ───────────────────────────────────────────────
console.log('\nA · penanda bilah kepala')

for (const [nama, p, tag] of SHELL) {
  const t = buangKomentar(baca(p))
  cek(`${nama}: bilah kepalanya bisa dijangkau CSS`, t.includes('className="prima-hdr"'))
  cek(`${nama}: judul modul boleh menyusut`, t.includes('className="prima-hdr-brand"'))
  cek(`${nama}: anak judul bisa dilepas`, t.includes('className="prima-hdr-sub"'))
  // Tanpa pembungkus, teksnya cuma simpul teks telanjang dan CSS tidak bisa
  // menyentuhnya sama sekali — itu sebabnya penanda ini ada.
  cek(`${nama}: label tombol Menu terbungkus`,
    t.includes('<span className="prima-hdr-label">Menu</span>'))
  cek(`${nama}: nama & peran di lencana terbungkus`,
    t.includes('<div className="prima-hdr-label" style={{ textAlign: \'left\' }}>'))
  // Ikon telanjang tanpa keterangan itu tebak-tebakan (L79c). Tooltipnya wajib ada
  // justru karena labelnya yang hilang di layar sempit.
  cek(`${nama}: tombol Menu punya tooltip saat labelnya lepas`,
    t.includes('data-tooltip="Kembali ke menu utama"'))
  cek(`${nama}: tombol kecilkan-ribbon masih bernama sama`, t.includes(`${tag}-toggle-ribbon`))
}

// PK punya satu tambahan yang tidak dimiliki BLUD.
const pk = buangKomentar(baca('app/(dashboard)/perjanjian-kinerja/pk-shell.tsx'))
cek('PK: kata TAHUN bisa dilepas, angkanya tinggal',
  pk.includes('<span className="prima-hdr-label">TAHUN&nbsp;</span>'))

// ── B · Pil tema (dipakai SEMUA shell) ───────────────────────────────────────
console.log('\nB · pil tema')

const tt = buangKomentar(baca('components/ui/ThemeToggle.tsx'))
cek('label Dark & Light terbungkus',
  tt.includes('<span className="tt-label">Dark</span>')
  && tt.includes('<span className="tt-label">Light</span>'))
// Yang menahan artinya saat kata-katanya lepas.
cek('tiap tombolnya punya tooltip sendiri',
  tt.includes('data-tooltip="Tema gelap"') && tt.includes('data-tooltip="Tema terang"'))

// ── C · Aturannya di SATU tempat ─────────────────────────────────────────────
console.log('\nC · aturan responsif')

const css = buangKomentarCss(baca('app/globals.css'))
cek('kata pada pil tema dilepas di layar sempit', css.includes('.theme-toggle-pill .tt-label { display: none'))
cek('label & anak judul ikut dilepas',
  css.includes('.prima-hdr-label { display: none') && css.includes('.prima-hdr-sub { display: none'))
// Ini inti perbaikannya, dan bagian yang paling gampang hilang saat kode dirapikan:
// `min-width` bawaan sebuah flex-item adalah `auto`, jadi wadah kiri menolak turun di
// bawah lebar isinya walau anaknya sudah dipasangi ellipsis.
cek('kedua sisi bilah kepala boleh menyusut', css.includes('.prima-hdr > div { min-width: 0; }'))
// Dikutip UTUH satu aturan. Versi pertama cuma mencari `text-overflow: ellipsis`, dan
// itu lulus tanpa menjaga apa pun — properti yang sama muncul di belasan aturan lain di
// berkas ini, jadi membuang pemotongan pada judul modul tetap lolos (L82c).
cek('judul modul memotong diri, bukan mendorong',
  css.includes('.prima-hdr-brand > div { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }'))
cek('tombol kecilkan-ribbon dilepas di lebar yang ribbon-nya memang sudah disembunyikan',
  css.includes('.blud-toggle-ribbon, .pk-toggle-ribbon { display: none'))

// Satu blok, bukan disalin ke dua <style> shell — dua ambang yang sama pasti mulai
// berbeda begitu salah satunya disunting (L78).
for (const [nama, p] of SHELL) {
  cek(`${nama}: tidak menyalin aturannya ke blok <style> sendiri`,
    !buangKomentar(baca(p)).includes('prima-hdr-label { display'))
}

// ── D · Strip bulan Beranda BLUD ─────────────────────────────────────────────
console.log('\nD · strip 12 bulan')

const dash = baca('app/(dashboard)/blud/dashboard-client.tsx')
// `1fr` polos berlantai min-content: dua belas nama bulan menolak menyusut dan
// mendorong SELURUH HALAMAN, bukan cuma stripnya.
cek('track grid boleh turun di bawah lebar isinya',
  dash.includes('grid-template-columns: repeat(12, minmax(0, 1fr))'))
cek('di layar sempit dipecah dua baris enam',
  buangKomentarCss(dash).includes('grid-template-columns: repeat(6, minmax(0, 1fr))'))
// Sengaja hanya `.blud-strip`, BUKAN "tidak boleh ada `repeat(12, 1fr)` di berkas ini".
// Ada kembarannya — `.blud-tren`, grafik 12 bulan — yang berlantai sama, tapi panelnya
// tidak tampil pada data uji (serapan nol) sehingga tidak pernah bisa diukur. Mengubah
// yang tidak terukur, lalu menuliskan asersi yang seolah membuktikannya, lebih buruk
// daripada meninggalkannya apa adanya dan menyebutnya.
cek('yang diperbaiki memang strip bulannya',
  buangKomentarCss(dash).includes('.blud-strip { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr))'))

console.log(`\n${lulus + gagal} pemeriksaan · ${lulus} lulus · ${gagal} gagal`)
if (gagal > 0) {
  console.log('GAGAL — bilah kepala bisa meluber lagi di layar sempit.')
  process.exit(1)
}
console.log('LULUS.')
