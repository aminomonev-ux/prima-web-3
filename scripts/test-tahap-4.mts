#!/usr/bin/env npx tsx
// scripts/test-tahap-4.mts — penjaga regresi Tahap 4 (T-5 · P6 · P10).
// Konsep: docs/CONCEPT-pusat-akses-satu-pintu.md §17.2 Tahap 4.
//
// Bagian A–C menguji PERILAKU sungguhan (fungsi murni dipanggil dengan data buatan);
// bagian D–F statis, untuk hal yang tidak punya bentuk fungsi — bahwa `?app=` sudah
// tidak dipakai lagi, bahwa `/maintenance` memeriksa DB, bahwa layarnya tidak punya
// jalur tulis.
//
// DUA aturan menulis asersi di berkas ini, dua-duanya lahir dari kesalahan nyata:
//
//   1. **Kutip utuh sampai kurung buka** (L82c). Mengutip syarat sepotong membuat
//      `false && <kutipan>` tetap cocok, jadi mutasi lolos.
//   2. **Buang komentar dulu** untuk asersi "tidak boleh ada lagi". Berkas-berkas ini
//      penuh komentar yang MENJELASKAN bug lamanya — prosa itu akan menyalakan
//      tesnya sendiri kalau ikut dipindai.
//
// Jalankan: npx tsx scripts/test-tahap-4.mts

import fs from 'node:fs'
import {
  SAKELAR_INFO, SAKELAR_LAIN, SAKELAR_TANPA_PENJAGA, KUNCI_SAKELAR, LABEL_SAKELAR,
  kunciPesan, kunciSampai, formatSampai, urlPemeliharaan, infoSakelar, MODUL_APPS,
} from '../lib/registry/apps'
import {
  kuotaHampirPenuh, grantMubazir, izinMenuYatim, contohkan, MAKS_CONTOH,
} from '../lib/admin/pemeriksaan'

let lulus = 0
let gagal = 0

function cek(nama: string, syarat: boolean, catatan = '') {
  if (syarat) { lulus++; console.log(`  ok    ${nama.padEnd(66)} ${catatan}`) }
  else { gagal++; console.log(`  GAGAL ${nama.padEnd(66)} ${catatan}`) }
}

const baca = (p: string) => fs.readFileSync(p, 'utf8')

/** Buang komentar baris & blok. WAJIB dipakai sebelum asersi "tidak boleh ada lagi". */
function buangKomentar(t: string): string {
  return t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')
}

const hitung = (t: string, s: string) => t.split(s).length - 1

// ── A · Registry sakelar (T-5 + lencana Terjaga) ─────────────────────────────
console.log('\nA · registry sakelar')

// T-5 ditutup sebagai EFEK SAMPING Tahap 2, bukan tambalan: layar sakelar merender
// `SAKELAR_INFO`, jadi sub-sakelar Realisasi muncul karena ia ada di registry.
cek('sub-sakelar Realisasi BLUD punya barisnya sendiri',
  SAKELAR_INFO.some(s => s.kunci === 'app_status_blud_realisasi'))
cek('…dan induknya app_status_blud',
  infoSakelar('app_status_blud_realisasi')?.induk === 'app_status_blud')
cek('…labelnya tanpa jargon "(sub-modul)"',
  !(LABEL_SAKELAR['app_status_blud_realisasi'] ?? '').includes('sub-modul'),
  LABEL_SAKELAR['app_status_blud_realisasi'])

cek('SAKELAR_INFO memuat semua kunci sakelar, tanpa kurang',
  SAKELAR_INFO.length === KUNCI_SAKELAR.length,
  `${SAKELAR_INFO.length} vs ${KUNCI_SAKELAR.length}`)
cek('tiap baris punya kalimat sebab — termasuk yang terjaga',
  SAKELAR_INFO.every(s => s.sebab.trim().length > 10))

// Lencananya DITURUNKAN dari registry, jadi asersinya TIDAK BOLEH ikut diturunkan dari
// registry — versi pertama pemeriksaan ini menghitung "seharusnya" dengan rumus yang
// persis sama dengan yang diperiksa (`m.penjagaApi !== undefined`), jadi menghapus
// `penjagaApi` menggeser kedua sisinya bersamaan dan mutasinya LOLOS. Yang ditegaskan
// di bawah keadaan yang diharapkan, bukan cara menghitungnya.
//
// Aturannya sama dengan yang ditegakkan gate G di CI: modul ber-sakelar yang punya
// route API WAJIB punya penjaga. Kalau suatu hari memang ada yang boleh dikecualikan,
// baris ini harus disunting dengan sengaja — bukan berubah sendiri.
for (const m of MODUL_APPS) {
  if (!m.sakelar || !m.dirApi) continue
  const info = infoSakelar(m.sakelar)
  cek(`${m.label} ber-route → wajib TERJAGA`, info?.terjaga === true)
  cek(`…sebabnya menyebut ${m.dirApi}`, (info?.sebab ?? '').includes(m.dirApi))
}
cek('BLUD: sebab lencananya menyebut kedua penanda penjaga',
  (infoSakelar('app_status_blud')?.sebab ?? '').includes('`bludMati`')
  && (infoSakelar('app_status_blud')?.sebab ?? '').includes('`realisasiMati`'))
cek('sub-sakelar Realisasi ikut terjaga oleh penjaga induknya',
  infoSakelar('app_status_blud_realisasi')?.terjaga === true)
cek('Admin Panel memang tanpa sakelar (kunci yang tertinggal di dalam)',
  MODUL_APPS.find(m => m.kunci === 'admin')?.sakelar === null)

// Sakelar yang penjaganya cuma hidup di peramban TIDAK boleh mengaku terjaga. Gate G
// memindai `app/api/*` dan tidak akan pernah melihatnya — di situlah lencana ini
// mengambil alih (P10 nomor 6).
cek('app_status_sentinel_bot dilaporkan BELUM terjaga',
  infoSakelar('app_status_sentinel_bot')?.terjaga === false)
cek('app_status_rima_query dilaporkan terjaga',
  infoSakelar('app_status_rima_query')?.terjaga === true)
cek('SAKELAR_TANPA_PENJAGA = himpunan yang lencananya merah',
  SAKELAR_TANPA_PENJAGA.length === SAKELAR_INFO.filter(s => !s.terjaga).length
  && SAKELAR_TANPA_PENJAGA.length > 0)
cek('tiap SAKELAR_LAIN menyatakan di mana ia dijaga (boleh null, tidak boleh lupa)',
  SAKELAR_LAIN.every(s => s.dijagaDi === null || s.dijagaDi.length > 0))

// ── B · Kunci & format P6 ────────────────────────────────────────────────────
console.log('\nB · kunci pesan/tenggat & pembacaannya')

cek('kunciPesan menurunkan, tidak mengarang', kunciPesan('app_status_blud') === 'app_status_blud_pesan')
cek('kunciSampai menurunkan, tidak mengarang', kunciSampai('app_status_blud') === 'app_status_blud_sampai')
cek('kunci terpanjang masih muat di VARCHAR(100)',
  Math.max(...KUNCI_SAKELAR.map(k => kunciSampai(k).length)) <= 100,
  `maks ${Math.max(...KUNCI_SAKELAR.map(k => kunciSampai(k).length))}`)
cek('kunci pesan tak pernah bentrok dengan kunci sakelar',
  KUNCI_SAKELAR.every(k => !KUNCI_SAKELAR.includes(kunciPesan(k))))

cek('formatSampai: tanggal + jam', formatSampai('2026-09-20T14:30') === '20 September 2026, 14.30 WIB',
  formatSampai('2026-09-20T14:30'))
cek('formatSampai: tanggal saja', formatSampai('2026-01-05') === '5 Januari 2026')
// Nilai `app_config` ditulis manusia. Teks yang bukan tanggal harus HILANG, bukan
// ditampilkan apa adanya — pembacanya tidak bisa membedakan tenggat sungguhan dari
// isi kolom yang kebetulan tersimpan.
cek('formatSampai: teks ngawur dibuang', formatSampai('secepatnya') === '')
cek('formatSampai: bulan di luar 1..12 dibuang', formatSampai('2026-13-01') === '')
cek('formatSampai: kosong tetap kosong', formatSampai('') === '')

cek('urlPemeliharaan memakai ?m=, bukan ?app=',
  urlPemeliharaan('app_status_blud') === '/maintenance?m=app_status_blud')

// ── C · Aturan P10 (murni) ───────────────────────────────────────────────────
console.log('\nC · aturan pemeriksaan mandiri')

// Kuota: ADMIN 6, SUPER_ADMIN 4, BIDANG 3. Ambangnya 80%.
const kuota = kuotaHampirPenuh([
  { role: 'ADMIN', jumlah: 5 },          // 5/6 = 83% → masuk
  { role: 'ADMIN', jumlah: 4 },          // 4/6 = 67% → tidak
  { role: 'SUPER_ADMIN', jumlah: 4 },    // 4/4 = penuh
  { role: 'UMUM', jumlah: 3 },           // BIDANG, 3/3 penuh
  { role: 'PROGRAM', jumlah: 99 },       // sub-bidang: tanpa kuota → dilewati
])
cek('kuota: yang di bawah 80% tidak dilaporkan', !kuota.some(k => k.role === 'ADMIN' && k.jumlah === 4))
cek('kuota: 5/6 dilaporkan', kuota.some(k => k.role === 'ADMIN' && k.jumlah === 5))
cek('kuota: peran tanpa kuota dilewati, bukan dianggap penuh',
  !kuota.some(k => k.role === 'PROGRAM'))
cek('kuota: yang penuh ikut', kuota.filter(k => k.jumlah >= k.kuota).length === 2)
cek('kuota: paling mepet di atas', (kuota[0]?.jumlah ?? 0) / (kuota[0]?.kuota ?? 1) === 1)

// Grant mubazir. PROGRAM ADA di peranBawaan Perjanjian Kinerja, jadi grant `perjanjian_kinerja`
// untuknya tidak menambah apa pun; `blud` untuk peran yang sama BUKAN mubazir.
const mubazir = grantMubazir([
  { username: 'a', role: 'PROGRAM', appAccess: ['perjanjian_kinerja', 'blud'] },
  { username: 'b', role: 'KEUANGAN', appAccess: ['usulan_aset'] },
  { username: 'c', role: 'KEUANGAN', appAccess: ['modul_karangan'] },
  { username: 'd', role: 'KEUANGAN', appAccess: null },
  { username: 'e', role: 'KEUANGAN', appAccess: 'bukan larik' },
])
cek('mubazir: grant yang sudah didapat dari peran dilaporkan',
  mubazir.some(m => m.username === 'a' && m.kunci === 'perjanjian_kinerja'))
cek('mubazir: grant yang MEMANG menambah tidak dilaporkan',
  !mubazir.some(m => m.username === 'a' && m.kunci === 'blud'))
cek("mubazir: modul 'SEMUA' dilaporkan mubazir untuk peran mana pun",
  mubazir.some(m => m.username === 'b' && m.kunci === 'usulan_aset'))
// Kunci karangan bukan "mubazir" — ia tidak berarti apa-apa. Dua hal berbeda, dan
// menyamakannya membuat sebabnya salah saat orang membaca daftarnya.
cek('mubazir: kunci tak dikenal dilaporkan dengan sebab berbeda',
  mubazir.some(m => m.username === 'c' && m.sebab === 'kunci tidak dikenal'))
cek('mubazir: app_access null / bukan larik tidak merobohkan apa pun',
  !mubazir.some(m => m.username === 'd' || m.username === 'e'))

const yatim = izinMenuYatim([
  { appKey: 'blud', menuKey: 'blud.dpa', pemilik: 'peran ADMIN' },
  { appKey: 'blud', menuKey: 'blud.menu_yang_sudah_hilang', pemilik: 'peran ADMIN' },
  { appKey: 'modul_bubar', menuKey: 'modul_bubar.apa_saja', pemilik: 'budi' },
])
cek('yatim: menu yang masih ada tidak ikut', !yatim.some(y => y.menuKey === 'blud.dpa'))
cek('yatim: menu yang sudah hilang ikut', yatim.some(y => y.menuKey === 'blud.menu_yang_sudah_hilang'))
// Modul yang berhenti punya izin per-menu membuat SELURUH barisnya jadi sisa. Kalau
// `app_key` tak dikenal dilewati diam-diam, sisa terbesar justru yang tak pernah terlihat.
cek('yatim: app_key yang bukan modul ber-menu ikut yatim',
  yatim.some(y => y.appKey === 'modul_bubar'))

const banyak = Array.from({ length: MAKS_CONTOH + 5 }, (_, i) => `x${i}`)
cek('contohkan: dipotong tapi sisanya DISEBUT, bukan hilang diam-diam',
  contohkan(banyak).length === MAKS_CONTOH + 1
  && contohkan(banyak).at(-1) === `… dan 5 lagi`)
cek('contohkan: yang muat tidak disentuh', contohkan(['a', 'b']).join() === 'a,b')

// ── D · `?app=` sudah tidak dipakai siapa pun ────────────────────────────────
console.log('\nD · tidak ada lagi nama modul dari URL')

const PENGALIH = [
  'app/(dashboard)/blud/layout.tsx',
  'app/(dashboard)/blud/_izin.ts',
  'app/(dashboard)/dashboard/page.tsx',
  'app/(dashboard)/dashboard/[modul]/page.tsx',
  'app/(dashboard)/kinerja/page.tsx',
  'app/(dashboard)/menu/menu-client.tsx',
  'app/(dashboard)/perjanjian-kinerja/layout.tsx',
  'app/(dashboard)/rencana-aksi/page.tsx',
  'app/(dashboard)/usulan-kebutuhan/page.tsx',
]
for (const p of PENGALIH) {
  const t = buangKomentar(baca(p))
  cek(`${p} — lewat urlPemeliharaan`, t.includes('urlPemeliharaan('))
  cek(`${p} — tidak lagi merangkai ?app=`, !t.includes('/maintenance?app='))
}

// ── E · /maintenance membuktikan, bukan mempercayai ──────────────────────────
console.log('\nE · halaman pemeliharaan')

const mt = baca('app/maintenance/page.tsx')
const mtBersih = buangKomentar(mt)
cek('halaman jadi server component (tak ada useSearchParams)',
  !mtBersih.includes('useSearchParams') && !mtBersih.includes("'use client'"))
cek('nama modul diambil dari registry, bukan dari URL',
  mtBersih.includes('infoSakelar(kunci)'))
// Ini pemeriksaan yang menutup lubangnya. Memvalidasi ke registry saja masih
// mengizinkan `?m=app_status_blud` dipakai mengarang kabar bahwa BLUD mati padahal
// hidup. Kutipannya UTUH sampai kurung buka (L82c).
//
// Bentuk kalimatnya berubah di Tahap 9 (P5): sakelarnya kini TIGA keadaan, jadi
// `!== 'online'` bukan lagi pertanyaan yang benar — ia ikut menelan modul yang cuma
// dibekukan. Yang dijaga pemeriksaan ini TIDAK berubah: keadaannya dibaca dari DB, dan
// hanya yang benar-benar mati yang boleh menampilkan halaman ini.
cek('status sakelar dibaca dari DB sebelum namanya ditampilkan',
  mtBersih.includes('sebabTerburuk(kunciCek.map((k) => [k, peta.get(k)] as const))'))
cek('sakelar yang TIDAK mati = nama tidak ditampilkan',
  mtBersih.includes("!== 'maintenance') return null"))
cek('induk ikut ditanyakan (mematikan BLUD ikut menutup Realisasi)',
  mtBersih.includes('...(info.induk ? [info.induk] : [])'))
cek('gagal baca DB = tidak terbukti, bukan diteruskan',
  /catch\s*{\s*return null;?\s*}/.test(mtBersih))
cek('label cadangan tidak menyebut modul tertentu',
  mtBersih.includes("terbukti?.label ?? 'Modul PRIMA'"))

// ── F · Layar & route Tahap 4 ────────────────────────────────────────────────
console.log('\nF · layar sakelar & pemeriksaan')

const ac = buangKomentar(baca('app/(dashboard)/admin/_panels/TabAppControl.tsx'))
cek('layar sakelar merender SAKELAR_INFO, bukan daftar label',
  ac.includes('SAKELAR_INFO.map') && !ac.includes('APP_STATUS_LABELS'))
cek('lencana Terjaga/Belum terjaga tampil', ac.includes("s.terjaga ? 'TERJAGA' : 'BELUM TERJAGA'"))
cek('sebab lencana merah selalu ikut tertulis, bukan cuma tooltip',
  ac.includes('{!s.terjaga && <div className="ap-sk-sebab">{s.sebab}</div>}'))
// `title=` bawaan peramban dilarang DESIGN-SYSTEM — kotak putih tanpa tema.
cek('tooltip pakai data-tooltip, bukan title=', !ac.includes('title={') && ac.includes('data-tooltip={s.sebab}'))
cek('pesan & tenggat dikirim lewat POST yang sama', ac.includes('pesan: d.pesan, sampai: d.sampai'))

const rt = buangKomentar(baca('app/api/admin/app-status/route.ts'))
cek('POST tetap SUPER_ADMIN saja', rt.includes("session.role !== 'SUPER_ADMIN'"))
// Tiga baris app_config untuk satu maksud. Menyalakan sakelar sambil meninggalkan
// pesan lama membuat kartu modul yang sudah hidup tetap menyandang kalimat pemeliharaan.
cek('tiga tulisan dibungkus satu transaksi (CQ-01)', rt.includes('await withTransaction(async ({ tx }) =>'))
cek('bentuk tenggat dipinjam dari registry, tidak disalin',
  rt.includes('RE_SAMPAI') && !/const RE_SAMPAI\s*=/.test(rt))
cek('GET memulangkan pesan & tenggat sekalian', rt.includes('data: map, pesan, sampai'))

const pr = buangKomentar(baca('app/api/admin/pemeriksaan/route.ts'))
cek('pemeriksaan SUPER_ADMIN saja', pr.includes("session.role !== 'SUPER_ADMIN'"))
// "Melaporkan, bukan membereskan" — kalau route ini tumbuh jalur tulis, layarnya
// berhenti bisa dipercaya sebagai laporan.
cek('pemeriksaan tidak punya jalur tulis sama sekali',
  !/export async function (POST|PUT|PATCH|DELETE)\b/.test(pr))

const tp = buangKomentar(baca('app/(dashboard)/admin/_panels/TabPemeriksaan.tsx'))
cek('layar pemeriksaan tidak punya tombol perbaiki', !/onClick=\{\(\)=>\s*perbaiki/.test(tp))
cek('layar pemeriksaan menerima data dari induknya (satu sumber untuk lencana + isi)',
  tp.includes('temuan, loading, jam, err, onMuat'))

const cl = buangKomentar(baca('app/(dashboard)/admin/admin-client.tsx'))
cek('tab Pemeriksaan hanya untuk SUPER_ADMIN', cl.includes("...(isSA ? [{ id:'pemeriksaan' as Tab"))
cek('lencana angka menyala tanpa tabnya dibuka',
  cl.includes("const perluDilihat = temuan.filter(t => t.keparahan !== 'aman').length"))

const mc = buangKomentar(baca('app/(dashboard)/menu/menu-client.tsx'))
cek('kartu /menu ikut menampilkan keterangan pemeliharaan',
  hitung(mc, 'appPesan[statusKey]') >= 2)
cek('kartu /menu memformat tenggat lewat fungsi yang sama',
  mc.includes('formatSampai(appSampai[statusKey]'))

console.log(`\n${lulus + gagal} pemeriksaan · ${lulus} lulus · ${gagal} gagal`)
if (gagal > 0) {
  console.log('GAGAL — Tahap 4 tidak lagi utuh.')
  process.exit(1)
}
console.log('LULUS.')
