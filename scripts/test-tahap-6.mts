#!/usr/bin/env npx tsx
// scripts/test-tahap-6.mts — penjaga regresi Tahap 6 (D1 · D2 · C4 · R3 · R5).
// Konsep: docs/CONCEPT-pusat-akses-satu-pintu.md §5.4, §4.6, §16.5, §17.2 Tahap 6.
//
// Bagian A menguji PERILAKU (fungsi murni dipanggil dengan data buatan); B–E statis,
// untuk hal yang tidak punya bentuk fungsi — bahwa satu komponen dipakai dua layar,
// bahwa kalimatnya menyebut tombol yang memang ada, bahwa warnanya berhenti diketik.
//
// Aturan menulis asersi di berkas ini sama dengan Tahap 4 & 5: kutip utuh sampai kurung
// buka (L82c), buang komentar sebelum asersi "tidak boleh ada lagi", dan JANGAN
// menghitung "seharusnya" dengan rumus yang sedang diperiksa.
//
// Jalankan: npx tsx scripts/test-tahap-6.mts

import fs from 'node:fs'
import { labelPeran, masihProbation } from '../components/admin/PilihPeran'

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
const hitung = (t: string, s: string) => t.split(s).length - 1

const PANEL = 'app/(dashboard)/admin/_panels/'
const berkasPanel = fs.readdirSync(PANEL).filter((f) => f.endsWith('.tsx'))

// ── A · D1 · satu dropdown untuk dua layar ───────────────────────────────────
console.log('\nA · dropdown peran bersama (T-8)')

cek('kuota ditulis di label opsi', labelPeran('ADMIN', { role: 'ADMIN', count: 5, quota: 6, full: false }) === 'Admin Staff (5/6)',
  labelPeran('ADMIN', { role: 'ADMIN', count: 5, quota: 6, full: false }))
cek('yang penuh dikatakan penuh', labelPeran('ADMIN', { role: 'ADMIN', count: 6, quota: 6, full: true }).includes('— penuh'))
// Peran tanpa kuota TIDAK diberi penanda "(0/0)" — angka yang tidak berarti apa-apa
// tetap terbaca sebagai batas oleh yang melihatnya.
cek('peran tanpa kuota tanpa penanda', labelPeran('PROGRAM', { role: 'PROGRAM', count: 9, quota: 0, full: false }) === 'Program')
cek('tanpa data kuota pun tetap bernama', labelPeran('PROGRAM') === 'Program')

const kemarin = new Date(Date.now() - 86_400_000).toISOString()
const besok = new Date(Date.now() + 86_400_000).toISOString()
cek('masa percobaan yang lewat = tidak aktif', masihProbation(kemarin) === false)
cek('masa percobaan yang masih jalan = aktif', masihProbation(besok) === true)
cek('null / undefined tidak dianggap aktif', !masihProbation(null) && !masihProbation(undefined))

const komp = buangKomentar(baca('components/admin/PilihPeran.tsx'))
// Berkas DAUN — dibaca dua komponen `'use client'` di dua modul. Satu impor server
// merobohkan keduanya sekaligus (preseden Tahap 5, kepala `lib/admin/pintu-akses.ts`).
for (const terlarang of ['lib/data/db', 'lib/security/', 'next/server', 'next/headers', 'mysql2']) {
  cek(`PilihPeran.tsx tidak mengimpor ${terlarang}`, !komp.includes(terlarang))
}
// Kuota dihitung `COUNT(*) WHERE role = ? AND status = 'AKTIF'`, jadi angkanya SUDAH
// memuat orang yang sedang dibuka. Mematikan opsi peran yang sedang ia pegang membuat
// dropdown tidak bisa menampilkan keadaan sekarang — bentuk yang sama dengan T-7.
cek('opsi penuh dimatikan, KECUALI peran yang sedang dipegang',
  komp.includes('const mati = Boolean(s?.full) && r !== peranSekarang'))
cek('SUPER_ADMIN tidak pernah jadi pilihan', komp.includes("g.roles.filter((r) => r !== 'SUPER_ADMIN')"))
// Peringatan yang selalu muncul, termasuk saat tidak ada yang terjadi, melatih orang
// menekan "Ya" tanpa membaca — dan itu yang membuat dialog berikutnya ikut tak terbaca.
cek('perkecualian menu disebut HANYA kalau ada', komp.includes('if (f.jumlahPerkecualian) {'))
cek('probation disebut HANYA kalau berjalan', komp.includes('if (f.probationAktif) {'))

const pa = buangKomentar(baca(PANEL + 'TabPusatAkses.tsx'))
const ku = buangKomentar(baca('app/(dashboard)/usulan-kebutuhan/_panels/KelolaUserPanel.tsx'))
for (const [berkas, nama] of [[pa, 'Pusat Akses'], [ku, 'Kelola User (Usulan)']] as const) {
  cek(`${nama} memakai komponen bersama`, berkas.includes('<PilihPeran'))
  cek(`${nama} memakai kalimat konfirmasi bersama`, berkas.includes('konfirmasiUbahPeran({'))
}
// T-8 tertutup kalau tidak ada lagi jalur yang mengubah peran tanpa bertanya.
cek('Usulan tidak lagi menembak ubah-role langsung dari onChange',
  !ku.includes('onChange={e => doChangeRole('))

// ── B · D2 · spanduk yang menyebut tombol yang MEMANG ADA ────────────────────
console.log('\nB · spanduk penjelas')

// Kalimatnya WAJIB menyebut nama tombol seperti tertulis di layar tujuan, huruf demi
// huruf (L79d). Versi pertama berbunyi "reset kata sandi" sementara tombolnya "Reset
// sandi" — cukup untuk membuat orang mencari sesuatu yang tidak persis ada di sana.
// Daftar ini disalin dari `TabPusatAkses.tsx`, dan asersi terakhir yang memastikannya
// masih sama.
const TOMBOL_PUSAT_AKSES = ['Nonaktifkan', 'Reset sandi', 'Putuskan', 'Arsipkan']
for (const kata of [...TOMBOL_PUSAT_AKSES, 'Pusat Akses']) {
  cek(`spanduk menyebut "${kata}"`, ku.includes(kata))
}
for (const kata of TOMBOL_PUSAT_AKSES) {
  // Dicari di berkas layar tujuan apa adanya. Kalau suatu saat tombolnya berganti nama,
  // asersi inilah yang menyalak — bukan pemakainya yang menemukan kalimat menunjuk
  // tombol yang sudah tidak ada.
  cek(`...dan tombol "${kata}" memang ada di Pusat Akses`, pa.includes(kata))
}

// Panel ini terbuka untuk ADMIN, sementara /admin sesudah T-16 hanya SUPER_ADMIN.
// Menyuruh ADMIN "buka Admin Panel" mengarahkan orang ke pintu yang melemparnya balik.
cek('tautan ke /admin hanya untuk SUPER_ADMIN', ku.includes('{isSA ? ('))
cek('ADMIN diberi tahu bahwa layarnya memang tidak bisa ia buka',
  ku.includes('hanya bisa dibuka <b>Super Admin</b>'))
cek('isSA benar-benar dioper dari usulan-client',
  buangKomentar(baca('app/(dashboard)/usulan-kebutuhan/usulan-client.tsx')).includes("isSA={role === 'SUPER_ADMIN'}"))

const menuPanel = buangKomentar(baca(PANEL + 'MenuAccessPanel.tsx'))
// Kalimat lama menunjuk "tombol MENU di tab User Management" — tab yang dimatikan
// Tahap 5. Menyebut tombol yang tidak ada lagi menyuruh orang mencari sesuatu yang
// tidak akan ditemukannya (L79d).
cek('tab Peran tidak lagi menunjuk tab yang sudah dimatikan',
  !menuPanel.includes('tab User Management'))
cek('…dan menunjuk tempatnya yang sekarang', menuPanel.includes('Pusat\n        Akses</b>'))

// ── C · C4 · pintu modul & kuota di tab Peran ────────────────────────────────
console.log('\nC · tab Peran diperluas')

cek('ada baris pintu modul per peran', menuPanel.includes('function PintuPeran('))
// Dihitung dengan `appAccess` KOSONG — jadi yang tampil memang "yang didapat peran ini
// tanpa satu pun pemberian akses", bukan gabungan dengan grant seseorang.
cek('dihitung dengan appAccess kosong', menuPanel.includes('const pintu = barisPintu(role, null)'))
cek('memakai aturan pintu yang sama dengan pagarnya',
  menuPanel.includes("from '@/lib/admin/pintu-akses'"))
cek('jumlah pemegang aktif ditampilkan', menuPanel.includes('pemegang aktif'))
cek('kuota peran ditampilkan', menuPanel.includes('kuota ${stat.count}/${stat.quota}'))
// Baris peran TIDAK memberi akses — pintu modul tetap `app_access` per orang. Layar
// yang menawarkan saklar di sini membuat orang mengira sudah membuka pintu untuk satu
// peran penuh (§4.6).
cek('baris pintunya BACA-SAJA, tanpa saklar',
  !/function PintuPeran\([\s\S]*?\n\}/.test(menuPanel) || !(/function PintuPeran\([\s\S]*?\n\}/.exec(menuPanel)![0].includes('onChange')))
cek('…dan mengatakan pintunya diberikan per orang',
  menuPanel.includes('harus diberikan <b>per orang</b> di Pusat Akses'))

// ── D · R3 · warna & tombol berhenti diketik ─────────────────────────────────
console.log('\nD · komponen & token')

const RE_HEX = /#[0-9A-Fa-f]{6}\b|#[0-9A-Fa-f]{3}\b/g
for (const f of berkasPanel) {
  const isi = baca(PANEL + f)
  const hex = isi.match(RE_HEX) ?? []
  cek(`${f} — nol hex langsung`, hex.length === 0, hex.slice(0, 3).join(' '))
}
// Palet cyberpunk lama yang sudah diganti Tahap 3 di CSS-nya. Selama masih ada di
// style sebaris, panelnya merender warna yang berbeda dari kerangkanya sendiri.
const semuaPanel = berkasPanel.map((f) => baca(PANEL + f)).join('\n')
for (const warisan of ['rgba(0,212,255', 'rgba(0,255,200', 'rgba(255,68,102', 'rgba(90,142,168']) {
  cek(`nol ${warisan}…) warisan di seluruh panel`, !semuaPanel.includes(warisan))
}
// Tabel pencarian hex→rgba bekerja dengan MEMBANDINGKAN nilai warnanya, jadi ia
// diam-diam meleset begitu warnanya jadi token — semua chip jatuh ke cabang terakhir
// tanpa satu galat pun.
cek('chip penyaring memakai color-mix, bukan tabel pencarian warna',
  buangKomentar(baca(PANEL + 'TabAttackMonitor.tsx')).includes('color-mix(in srgb, ${f.dot} 12%, transparent)'))

// `.ap-btn` hanya boleh tersisa di tempat yang memang dikecualikan DESIGN-SYSTEM:
// chevron pagination dan tombol buka-tutup (disclosure). Sisanya PrimaButton.
const bolehApBtn = new Set(['TabAuditTrail.tsx', 'TabPusatAkses.tsx'])
for (const f of berkasPanel) {
  const n = hitung(buangKomentar(baca(PANEL + f)), 'className="ap-btn')
  cek(`${f} — CTA utama pakai PrimaButton`, bolehApBtn.has(f) ? n <= 3 : n === 0, n ? `${n} sisa` : '')
}
cek('nol window.confirm / alert di seluruh panel',
  !/\bwindow\.confirm\(|\balert\(/.test(buangKomentar(semuaPanel)))
// Pesan hasil aksi lewat toast; yang BERTAHAN (lantai peran, galat pemuatan) tetap
// spanduk sebaris — pesan yang menghilang sendiri tidak boleh dipakai menjelaskan
// kenapa sebuah tombol mati.
cek('nol kelas msg-ok / msg-err di panel (bentroknya sudah tercatat di admin.css)',
  !buangKomentar(semuaPanel).includes('msg-ok') && !buangKomentar(semuaPanel).includes('msg-err'))
cek('memutus sesi orang lain ditanya dulu, dan menyebut namanya',
  buangKomentar(baca(PANEL + 'TabSessions.tsx')).includes('title: `Putuskan sesi ${username}?`'))
cek('tombol putus sesi memakai DeleteButton', baca(PANEL + 'TabSessions.tsx').includes('<DeleteButton'))

// ── E · R5 · baseline gate E turun ───────────────────────────────────────────
console.log('\nE · ratchet warna')

const baseline = JSON.parse(baca('docs/design/token-baseline.json')) as { _jumlah?: number }
cek('baseline gate E ≤ 225 (turun dari 238)', (baseline._jumlah ?? 999) <= 225, `${baseline._jumlah}`)

console.log(`\n${lulus + gagal} pemeriksaan · ${lulus} lulus · ${gagal} gagal`)
if (gagal > 0) {
  console.log('GAGAL — Tahap 6 tidak lagi utuh.')
  process.exit(1)
}
console.log('LULUS.')
