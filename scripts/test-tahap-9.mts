#!/usr/bin/env npx tsx
// scripts/test-tahap-9.mts — penjaga regresi Tahap 9 (P5 Mode BACA-SAJA).
// Konsep: docs/CONCEPT-pusat-akses-satu-pintu.md §12 P5, §17.2 Tahap 9.
//
// Bagian A menguji PERILAKU (fungsi murni dari registry). B–F statis: `guard.ts`
// menyeret mysql2 + `next/headers` + JWT_SECRET, jadi ia tidak bisa diimpor dari sini —
// pelajaran Tahap 5, dan itu sendiri sebabnya pemeriksaannya berbentuk pembacaan berkas.
//
// Aturan menulis asersi sama dengan Tahap 4–8: kutip utuh sampai kurung buka (L82c),
// buang komentar sebelum asersi "tidak boleh ada lagi", potong jendela dari teks yang
// SUDAH dibuang komentarnya, dan jangan menghitung "seharusnya" dengan rumus yang
// sedang diperiksa.
//
// Jalankan: npx tsx scripts/test-tahap-9.mts

import fs from 'node:fs'
import {
  KEADAAN_SAKELAR, LABEL_KEADAAN, SAKELAR_INFO, SEBAB_TAK_BISA_BEKU,
  bacaKeadaan, infoSakelar, keadaanTerburuk, modul,
} from '../lib/registry/apps'

let lulus = 0
let gagal = 0

function cek(nama: string, syarat: boolean, catatan = '') {
  if (syarat) { lulus++; console.log(`  ok    ${nama.padEnd(68)} ${catatan}`) }
  else { gagal++; console.log(`  GAGAL ${nama.padEnd(68)} ${catatan}`) }
}

const baca = (p: string) => fs.readFileSync(p, 'utf8')
function buangKomentar(t: string): string {
  return t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')
}
const hitung = (t: string, s: string) => t.split(s).length - 1

/**
 * Badan satu fungsi saja. Tanpa ini pemeriksaan menjulur ke fungsi tetangga lalu
 * lulus/menuduh untuk alasan yang salah — sudah dua kali terjadi di suite BLUD dan
 * sekali lagi di rekap E-Anggaran.
 */
function badan(teks: string, tanda: string): string {
  const i = teks.indexOf(tanda)
  if (i < 0) return ''
  const sisa = teks.slice(i + tanda.length)
  const j = sisa.search(/\nexport (?:async )?(?:function|const)|\n(?:async )?function /)
  return j < 0 ? sisa : sisa.slice(0, j)
}

// ── A · Kosakata tiga keadaan ────────────────────────────────────────────────
console.log('\nA · tiga keadaan sakelar')

cek('keadaannya tepat tiga', KEADAAN_SAKELAR.length === 3 && KEADAAN_SAKELAR.includes('readonly'))
cek('BEKU punya label sendiri, bukan menumpang MAINTENANCE',
  LABEL_KEADAAN.readonly === 'BEKU' && LABEL_KEADAAN.readonly !== LABEL_KEADAAN.maintenance)

// Baris `app_config` yang belum ada = modul baru, bukan modul mati.
cek('nilai kosong dibaca online', bacaKeadaan(undefined) === 'online' && bacaKeadaan(null) === 'online')
cek('nilai yang dikenal dibaca apa adanya',
  bacaKeadaan('readonly') === 'readonly' && bacaKeadaan('maintenance') === 'maintenance')
// Satu-satunya arah aman untuk nilai yang tidak bisa dijelaskan: anggap paling menutup.
cek('nilai asing dibaca maintenance, bukan online', bacaKeadaan('ngawur') === 'maintenance')

cek('sakelar berjenjang: induk beku ikut membekukan',
  keadaanTerburuk(['online', 'readonly']) === 'readonly')
cek('…dan induk mati mengalahkan anak yang beku',
  keadaanTerburuk(['readonly', 'maintenance']) === 'maintenance')
cek('tanpa baris sama sekali tetap online', keadaanTerburuk([]) === 'online')

// ── A2 · Sakelar mana yang boleh dibekukan ───────────────────────────────────
console.log('\nA2 · sakelar yang punya jalur tulis')

cek('modul ber-route API bisa dibekukan', infoSakelar('app_status_blud')?.bisaBeku === true)
cek('sub-sakelar mewarisi dari induknya',
  infoSakelar('app_status_blud_realisasi')?.bisaBeku === true)
// Keduanya sakelar BACA. Menawarkan BEKU di situ = tombol tanpa akibat.
cek('sakelar yang hanya dibaca peramban TIDAK bisa dibekukan',
  infoSakelar('app_status_sentinel_bot')?.bisaBeku === false)
cek('sakelar yang endpointnya GET saja TIDAK bisa dibekukan',
  infoSakelar('app_status_rima_query')?.bisaBeku === false)
cek('sakelar lintas-modul tak satu pun bisa dibekukan',
  SAKELAR_INFO.filter((s) => s.modulKunci === null).every((s) => !s.bisaBeku))
// Kalau kuncinya tidak ketemu, `modul('blud')?.sakelar ?? ''` memulangkan string kosong
// dan pembekuan BLUD berhenti bekerja TANPA satu galat pun — kegagalan paling senyap
// di seluruh tahap ini.
cek('kunci sakelar BLUD & PK benar-benar ada di registry',
  modul('blud')?.sakelar === 'app_status_blud'
  && modul('perjanjian_kinerja')?.sakelar === 'app_status_perjanjian_kinerja')

const bisa = SAKELAR_INFO.filter((s) => s.bisaBeku)
cek('kesembilan modul bersakelar dapat mode beku', bisa.length >= 9, `${bisa.length} sakelar`)

// ── B · Penjaga: metode & keadaan ────────────────────────────────────────────
console.log('\nB · lib/security/guard.ts')

const guard = buangKomentar(baca('lib/security/guard.ts'))

// Membaca boleh, menulis tidak — kalau daftarnya bergeser, pembekuannya ikut bergeser.
cek('metode BACA persis GET/HEAD/OPTIONS',
  guard.includes("const METODE_BACA = new Set(['GET', 'HEAD', 'OPTIONS'])"))
for (const m of ['POST', 'PUT', 'PATCH', 'DELETE']) {
  cek(`${m} tidak ikut dianggap membaca`, !guard.includes(`'${m}'`))
}

const bSedangMenulis = badan(guard, 'async function sedangMenulis()')
// Arah gagalnya menentukan segalanya: "tidak tahu metodenya" harus berarti MENULIS.
// Kebalikannya membuat modul beku meloloskan tulisan tanpa gejala.
cek('header hilang dianggap MENULIS', bSedangMenulis.includes('if (!m) return true'))
cek('gagal membaca header dianggap MENULIS', /catch\s*{\s*return true/.test(bSedangMenulis))
cek('metode dibaca dari header, tidak dari badan permintaan',
  bSedangMenulis.includes('.get(HEADER_METODE)'))

const bModulMati = badan(guard, 'export async function modulMati(')
cek('modul mati tetap dijawab MODUL_MATI', bModulMati.includes("keadaan === 'maintenance'"))
cek('gagal baca app_config tetap menutup (fail-closed)', bModulMati.includes("keadaan === 'gagal'"))
// Kutipan utuh sampai kurung buka (L82c): tanpa `await sedangMenulis()` di dalamnya,
// pembekuan akan menolak pembacaan juga.
cek('beku hanya menolak saat sedang MENULIS',
  bModulMati.includes("keadaan === 'readonly' && (await sedangMenulis())"))

// Kode balasan sendiri: penerimanya harus bisa membedakan "beku, membaca boleh" dari
// "modul mati" — alasan yang sama dengan kenapa modulMati 503 dan bukan 403.
cek('beku punya kode balasan sendiri', guard.includes("code: 'MODUL_BACA_SAJA'"))
cek('…dan tetap 503, bukan 403',
  badan(guard, 'const tolakBeku = ()').includes('status: 503'))

const bSedangMati = badan(guard, 'export async function modulSedangMati(')
// Titik paling gampang salah di seluruh tahap ini: bentuk lama `!== 'online'`
// menganggap beku = mati, dan halaman pemeliharaan yang tampil untuk modul beku
// mengubah pembekuan jadi pemadaman tanpa satu pesan pun.
cek('halaman pemeliharaan TIDAK tampil untuk modul beku',
  bSedangMati.includes("k === 'maintenance' || k === 'gagal'") && !bSedangMati.includes("!== 'online'"))
cek('tidak ada lagi pembacaan sakelar bergaya lama di guard', !guard.includes("!== 'online'"))
cek('layar punya cara menanyakan pembekuan', guard.includes('export async function modulDibekukan('))

// ── C · Metode datang dari proxy ─────────────────────────────────────────────
console.log('\nC · proxy.ts memasang metodenya')

const proxy = buangKomentar(baca('proxy.ts'))
const namaHeader = guard.match(/export const HEADER_METODE = '([a-z-]+)'/)?.[1] ?? ''
cek('nama headernya satu, diambil dari guard', namaHeader.length > 0, namaHeader)
cek('proxy memasang header yang SAMA dengan yang dibaca guard',
  proxy.includes(`reqHeaders.set('${namaHeader}', req.method)`))
// V3-1/L54: tanpa strip, klien bisa mengirim `x-prima-metode: GET` pada sebuah POST
// dan menembus pembekuan.
cek('header klien di-strip lebih dulu', proxy.includes(`reqHeaders.delete('${namaHeader}')`))
cek('…dan strip-nya SEBELUM dipasang',
  proxy.indexOf(`reqHeaders.delete('${namaHeader}')`) < proxy.indexOf(`reqHeaders.set('${namaHeader}', req.method)`))
// Dipasang sebelum cabang mana pun; kalau ia turun ke bawah pemeriksaan sesi, route
// publik kehilangan headernya dan `sedangMenulis` memulangkan true untuk semuanya.
cek('dipasang sebelum cabang sesi',
  proxy.indexOf(`reqHeaders.set('${namaHeader}', req.method)`) < proxy.indexOf('const token = req.cookies.get'))
cek('metodenya dari permintaan, bukan ditebak', proxy.includes('req.method'))

// ── D · Izin BLUD & PK dijepit ───────────────────────────────────────────────
console.log('\nD · izin per-menu dijepit ke LIHAT')

for (const [p, fn1, fn2, flag] of [
  ['lib/blud/izin-server.ts', 'export async function izinBlud(', 'export async function petaIzinBlud(', "modul('blud')"],
  ['lib/pk/izin-server.ts', 'export async function izinPk(', 'export async function petaIzinPk(', "modul('perjanjian_kinerja')"],
] as const) {
  const t = buangKomentar(baca(p))
  cek(`${p} menanyakan pembekuan`, t.includes("from '@/lib/security/guard'") && t.includes('modulDibekukan'))
  cek(`${p} membaca kunci sakelar dari registry`, t.includes(flag))
  // Peran yang menembus (SUPER_ADMIN) tidak boleh ikut terjepit — dan itu hanya
  // berlaku kalau perannya benar-benar dioper.
  cek(`${p} mengoper role ke penjaga`, /modulDibekukan\(\[FLAG\], \{ role \}\)/.test(t))
  cek(`${p} menjepit EDIT jadi LIHAT`, t.includes("beku && izin === 'EDIT' ? 'LIHAT' : izin"))
  // L69 — perbaikan belum selesai sampai SEMUA jalurnya kena. Dua fungsi, dua-duanya.
  cek(`${p} — jalur satu-menu ikut dijepit`, badan(t, fn1).includes('jepitBeku('))
  cek(`${p} — jalur peta ikut dijepit`, badan(t, fn2).includes('jepitBeku('))
}

// ── E · Layar ────────────────────────────────────────────────────────────────
console.log('\nE · layar')

const panel = buangKomentar(baca('app/(dashboard)/admin/_panels/TabAppControl.tsx'))
cek('sakelar digambar dari daftar keadaan, bukan tuas dua posisi',
  panel.includes('KEADAAN_SAKELAR.map') && !panel.includes('ap-toggle'))
// L79c — tombol mati wajib menyebut sebabnya, dan kalimatnya sama dengan yang
// dipulangkan API supaya keduanya tidak pernah berbeda bunyi.
cek('BEKU dimatikan untuk sakelar tanpa jalur tulis',
  panel.includes("k === 'readonly' && !s.bisaBeku"))
cek('…dengan sebab yang tertulis', panel.includes('data-tooltip={dilarang ? SEBAB_TAK_BISA_BEKU'))
cek('SUPER_ADMIN yang menembus disebut di layar', panel.includes('SUPER_ADMIN tetap bisa menembus'))
cek('induk beku diberi kalimat sendiri', panel.includes('Sudah ikut beku karena induknya dibekukan.'))

const menu = buangKomentar(baca('app/(dashboard)/menu/menu-client.tsx'))
cek('kartu /menu punya keadaan BEKU', menu.includes("appStatus[statusKey] === 'readonly'"))
cek('…berlencana BEKU', menu.includes("isBeku ? 'BEKU'"))
// Modul beku HARUS tetap bisa dibuka — itu seluruh gunanya. Kartu yang diabukan &
// tidak bisa diklik akan mengubah pembekuan jadi pemadaman di mata pemakainya.
cek('kartu beku tidak ikut diabukan seperti maintenance',
  !menu.includes("isBeku ? ' maintenance'"))
cek('kartunya tetap membawa keterangan & tenggat',
  menu.includes('(isMaint || isMaintSA || isBeku) && (appPesan[statusKey]'))

const halaman = buangKomentar(baca('app/maintenance/page.tsx'))
cek('/maintenance hanya untuk modul yang benar-benar MATI',
  halaman.includes("keadaanTerburuk(kunciCek.map((k) => peta.get(k))) !== 'maintenance'")
  && !halaman.includes("!== 'online'"))

const spanduk = buangKomentar(baca('components/ui/SpandukBeku.tsx'))
for (const terlarang of ['lib/data/db', 'lib/security/guard', 'next/server', 'next/headers', 'mysql2']) {
  cek(`SpandukBeku tidak mengimpor ${terlarang}`, !spanduk.includes(terlarang))
}
// Tipe boleh — ia dihapus saat kompilasi. Nilai TIDAK, dan bedanya satu kata.
cek('tipe InfoBeku diimpor sebagai tipe saja',
  !spanduk.includes("from '@/lib/security/beku'"))
cek('spanduk membedakan yang menembus', spanduk.includes('kecuali untuk Anda'))

for (const p of ['app/(dashboard)/blud/blud-shell.tsx', 'app/(dashboard)/perjanjian-kinerja/pk-shell.tsx']) {
  const t = buangKomentar(baca(p))
  cek(`${p} memasang spanduk`, t.includes('<SpandukBeku {...beku}/>'))
  cek(`${p} mengimpor tipenya sebagai tipe`, t.includes("import type { InfoBeku }"))
}
for (const [p, kunci] of [
  ['app/(dashboard)/blud/layout.tsx', 'app_status_blud'],
  ['app/(dashboard)/perjanjian-kinerja/layout.tsx', 'app_status_perjanjian_kinerja'],
] as const) {
  const t = buangKomentar(baca(p))
  cek(`${p} menyelesaikan keterangan beku di server`, t.includes(`infoBeku(['${kunci}'], role)`))
}

// ── F · Pagar di API ─────────────────────────────────────────────────────────
console.log('\nF · pagar sakelar')

const rute = buangKomentar(baca('app/api/admin/app-status/route.ts'))
cek('nilai sakelar divalidasi dari registry, tidak diketik ulang',
  rute.includes('z.enum(KEADAAN_SAKELAR)'))
// L82 — tombol yang disembunyikan di layar bukan pagar. Endpoint ini bisa dipanggil
// langsung, dan sakelar baca yang tersimpan `readonly` menghasilkan lencana berbohong.
cek('BEKU ditolak di API untuk sakelar tanpa jalur tulis',
  rute.includes("value === 'readonly' && !infoSakelar(key)?.bisaBeku"))
cek('…dengan kalimat yang sama dengan layar', rute.includes('SEBAB_TAK_BISA_BEKU'))
cek('kalimat itu tinggal di SATU tempat',
  hitung(buangKomentar(baca('lib/registry/apps.ts')), 'export const SEBAB_TAK_BISA_BEKU') === 1)
cek('…dan memang menjelaskan sebabnya, bukan sekadar melarang',
  SEBAB_TAK_BISA_BEKU.length > 30 && SEBAB_TAK_BISA_BEKU.includes('tidak menutup apa pun'))
// Dirujuk namanya, bukan disalin. Dua salinan kalimat yang sama pasti mulai berbeda
// bunyi begitu salah satunya disunting (L78) — dan di sini bedanya akan muncul sebagai
// layar dan API yang menolak dengan alasan berlainan.
cek('kalimatnya tidak disalin ke layar maupun API',
  !panel.includes(SEBAB_TAK_BISA_BEKU) && !rute.includes(SEBAB_TAK_BISA_BEKU))

const beku = buangKomentar(baca('lib/security/beku.ts'))
// Kebalikan modulMati, dan sengaja: ini cuma keterangan layar. Pagarnya sudah berdiri
// di modulMati yang tetap menolak saat pembacaan gagal.
cek('keterangan layar gagal-terbuka, bukan gagal-tertutup',
  badan(beku, 'export async function infoBeku(').includes('catch {\n    return TIDAK_BEKU'))
cek('yang menembus tetap diberi tahu modulnya beku', beku.includes('beku: true'))

console.log(`\n${lulus + gagal} pemeriksaan · ${lulus} lulus · ${gagal} gagal`)
if (gagal > 0) {
  console.log('GAGAL — Tahap 9 tidak lagi utuh.')
  process.exit(1)
}
console.log('LULUS.')
