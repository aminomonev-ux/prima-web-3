#!/usr/bin/env npx tsx
// scripts/test-tahap-12.mts — penjaga regresi Tahap 12 (P12 Sakelar seluruh aplikasi).
// Konsep: docs/CONCEPT-pusat-akses-satu-pintu.md §12 P12, §17.2 Tahap 12.
//
// Bagian A–B menguji PERILAKU (registry nol-impor, jadi bisa dipanggil sungguhan).
// C–G statis: lapisan servernya menyeret mysql2, jadi tidak bisa diimpor dari sini.
//
// Aturan menulis asersi sama dengan Tahap 4–11: kutip utuh sampai kurung buka (L82c),
// buang komentar sebelum asersi "tidak boleh ada lagi", potong jendela dari teks yang
// SUDAH dibuang komentarnya, dan jangan menghitung "seharusnya" dengan rumus yang
// sedang diperiksa.
//
// Jalankan: npx tsx scripts/test-tahap-12.mts

import fs from 'node:fs'
import path from 'node:path'
import {
  KEADAAN_SAKELAR, KUNCI_GLOBAL, KUNCI_PESAN, KUNCI_SAKELAR, KUNCI_SAMPAI,
  LABEL_GLOBAL, LABEL_SAKELAR, SAKELAR_INFO, SAKELAR_TANPA_PENJAGA,
  infoSakelar, keadaanTerburuk, kunciDenganGlobal, kunciPesan, kunciSampai, modul,
  sebabTerburuk, type KeadaanSakelar,
} from '../lib/registry/apps'

let lulus = 0
let gagal = 0

function cek(nama: string, syarat: boolean, catatan = '') {
  if (syarat) { lulus++; console.log(`  ok    ${nama.padEnd(68)} ${catatan}`) }
  else { gagal++; console.log(`  GAGAL ${nama.padEnd(68)} ${catatan}`) }
}

const baca = (p: string) => fs.readFileSync(p, 'utf8')
const buangKomentar = (t: string) =>
  t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')
const hitung = (t: string, s: string) => t.split(s).length - 1

function badan(teks: string, tanda: string): string {
  const i = teks.indexOf(tanda)
  if (i < 0) return ''
  const sisa = teks.slice(i + tanda.length)
  const j = sisa.search(/\nexport (?:async )?(?:function|const)|\n(?:async )?function /)
  return j < 0 ? sisa : sisa.slice(0, j)
}

/**
 * `a` muncul sebelum `b`, dan KEDUANYA memang ada.
 *
 * Membandingkan dua `indexOf` mentah adalah jebakan: yang tidak ditemukan memulangkan
 * -1, dan -1 selalu lebih kecil dari indeks mana pun — jadi MENGHAPUS baris yang
 * diperiksa membuat asersinya lulus. Ketahuan lewat uji mutasi, bukan dari membaca.
 */
function sebelum(teks: string, a: string, b: string): boolean {
  const ia = teks.indexOf(a)
  const ib = teks.indexOf(b)
  return ia >= 0 && ib >= 0 && ia < ib
}

/** Semua berkas .ts/.tsx di bawah sebuah direktori. */
function berkasDi(dir: string): string[] {
  const keluar: string[] = []
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) keluar.push(...berkasDi(p))
    else if (/\.tsx?$/.test(e.name)) keluar.push(p)
  }
  return keluar
}

// ── A · Keadaan terburuk beserta sebabnya ────────────────────────────────────
console.log('\nA · sebabTerburuk')

const pasangan = (...xs: [string, string | null | undefined][]) => xs

cek('semua online → online tanpa sebab',
  sebabTerburuk(pasangan(['g', 'online'], ['m', undefined])).keadaan === 'online'
  && sebabTerburuk(pasangan(['g', 'online'], ['m', undefined])).kunci === null)

// Yang menentukan bukan cuma "beku atau tidak", tapi SIAPA yang membekukan — kalimat
// di layar diambil dari kunci ini.
cek('satu readonly → readonly, kuncinya ikut',
  sebabTerburuk(pasangan(['g', 'online'], ['m', 'readonly'])).kunci === 'm')
cek('maintenance mengalahkan readonly',
  sebabTerburuk(pasangan(['g', 'readonly'], ['m', 'maintenance'])).keadaan === 'maintenance')
cek('…dan kuncinya kunci yang MAINTENANCE, bukan yang readonly',
  sebabTerburuk(pasangan(['g', 'readonly'], ['m', 'maintenance'])).kunci === 'm')
// Global disisipkan paling depan, jadi saat dua-duanya beku yang disebut global —
// dan itu memang yang benar: mencabut sakelar modul tidak akan membebaskan apa pun.
cek('yang pertama menang saat sama-sama readonly',
  sebabTerburuk(pasangan(['g', 'readonly'], ['m', 'readonly'])).kunci === 'g')
// Kembarannya untuk maintenance, dan ia yang paling menentukan: kalau global DAN modul
// sama-sama dimatikan, yang harus disebut global — mencabut sakelar modulnya tidak
// membebaskan apa pun. Satu-satunya pembeda antara `return` seketika dan "timpa terus"
// justru ada di sini, dan versi pertama pemeriksaan ini melewatkannya (uji mutasi).
cek('yang pertama menang saat sama-sama maintenance',
  sebabTerburuk(pasangan(['g', 'maintenance'], ['m', 'maintenance'])).kunci === 'g')
cek('global maintenance menutup walau modulnya online',
  sebabTerburuk(pasangan([KUNCI_GLOBAL, 'maintenance'], ['m', 'online'])).kunci === KUNCI_GLOBAL)
// Nilai yang tidak bisa dijelaskan diperlakukan sebagai maintenance — satu-satunya
// arah aman, dan aturan itu sudah berlaku sejak `bacaKeadaan`.
cek('nilai tak dikenal dianggap maintenance',
  sebabTerburuk(pasangan(['m', 'entah'])).keadaan === 'maintenance')

// `keadaanTerburuk` kini DITURUNKAN dari `sebabTerburuk`. Pembanding di bawah ditulis
// ulang dari nol — kalau dipanggilkan ke fungsi yang sedang diuji, ia cuma membuktikan
// fungsi itu sama dengan dirinya sendiri.
function acuanTerburuk(nilai: readonly (string | null | undefined)[]): KeadaanSakelar {
  let ada = false
  for (const n of nilai) {
    if (n && !(KEADAAN_SAKELAR as readonly string[]).includes(n)) return 'maintenance'
    if (n === 'maintenance') return 'maintenance'
    if (n === 'readonly') ada = true
  }
  return ada ? 'readonly' : 'online'
}

const contoh = ['online', 'readonly', 'maintenance', 'ngawur', undefined, null] as const
let cocok = 0
let total = 0
for (const a of contoh) for (const b of contoh) for (const c of contoh) {
  total++
  if (keadaanTerburuk([a, b, c]) === acuanTerburuk([a, b, c])) cocok++
}
cek('keadaanTerburuk tidak bergeser sesudah diturunkan', cocok === total, `${cocok}/${total}`)

// ── B · Entri sakelar global di registry ─────────────────────────────────────
console.log('\nB · registry')

cek('kuncinya app_status_global', KUNCI_GLOBAL === 'app_status_global')
cek('kunciDenganGlobal menaruh global PALING DEPAN',
  kunciDenganGlobal(['app_status_blud'])[0] === KUNCI_GLOBAL)
cek('…dan tidak membuang kunci aslinya',
  kunciDenganGlobal(['a', 'b']).join(',') === `${KUNCI_GLOBAL},a,b`)
// Larik masukan tidak boleh ikut berubah: pemanggilnya mengoper konstanta modul.
const asli = ['app_status_blud']
kunciDenganGlobal(asli)
cek('larik masukan tidak diubah', asli.length === 1)

cek('ikut di daftar kunci sakelar', KUNCI_SAKELAR.includes(KUNCI_GLOBAL))
// Zod POST /api/admin/app-status memakai KUNCI_SAKELAR sebagai whitelist; tanpa ini
// sakelarnya ada di layar tapi setiap klik dijawab 400.
cek('…tepat sekali, bukan dua kali', hitung(KUNCI_SAKELAR.join('|'), KUNCI_GLOBAL) === 1)
cek('punya label', LABEL_SAKELAR[KUNCI_GLOBAL] === LABEL_GLOBAL)
cek('kunci pesan & tenggatnya ikut diturunkan',
  KUNCI_PESAN.includes(kunciPesan(KUNCI_GLOBAL)) && KUNCI_SAMPAI.includes(kunciSampai(KUNCI_GLOBAL)))

const info = infoSakelar(KUNCI_GLOBAL)
cek('dikenal infoSakelar — /maintenance?m= menerimanya', info !== null)
cek('berdiri paling depan di SAKELAR_INFO', SAKELAR_INFO[0]?.kunci === KUNCI_GLOBAL)
cek('bukan milik modul mana pun', info?.modulKunci === null && info?.induk === null)
cek('boleh dibekukan, bukan cuma dimatikan', info?.bisaBeku === true)
cek('bertanda TERJAGA', info?.terjaga === true)
// Lencana TERJAGA yang tidak bisa dibuktikan justru kebalikan gunanya (T-1), jadi
// klaim itu ditagih ke kodenya di bagian C.
cek('tidak muncul di daftar sakelar tanpa penjaga',
  !SAKELAR_TANPA_PENJAGA.some((s) => s.kunci === KUNCI_GLOBAL))

// Kalau ia dipasang sebagai modul, ia akan ikut jadi kartu /menu, ikut jadi centang
// "Atur Akses Aplikasi", dan ikut dipindai gate G sebagai direktori route.
cek('BUKAN entri modul', modul(KUNCI_GLOBAL) === null && modul('global') === null)

// ── C · Satu tempat yang menghormatinya ──────────────────────────────────────
console.log('\nC · satu tempat')

const guard = buangKomentar(baca('lib/security/guard.ts'))
const badanBaca = badan(guard, 'async function bacaKeadaan')
cek('bacaKeadaan menyisipkan sakelar global',
  badanBaca.includes('const semua = kunciDenganGlobal(keys)'))
cek('…dan kueri membaca daftar yang sudah disisipi, bukan `keys` mentah',
  badanBaca.includes('WHERE \\`key\\` IN (${semua})') && !badanBaca.includes('IN (${keys})'))
// Kalau salah satu pintu memanggil kuerinya sendiri, sakelar global akan berlaku di
// sebagian jalur saja — bentuk T-1/L69 yang persis.
cek('cuma SATU kueri app_config di guard.ts',
  hitung(guard, 'FROM app_config') === 1)
cek('keempat pintu lewat bacaKeadaan',
  hitung(guard, 'bacaKeadaan(keys)') === 2 && badan(guard, 'export async function modulSedangMati').includes('keadaanModul(keys, opts)')
  && badan(guard, 'export async function modulDibekukan').includes('keadaanModul(keys, opts)'))
// Peran yang menembus diperiksa SEBELUM DB dibaca — itu yang membuat sakelar global
// tidak pernah bisa mengunci orang yang harus mematikannya kembali.
cek('tembus sakelar diperiksa sebelum keadaan dibaca',
  sebelum(badan(guard, 'export async function keadaanModul'), 'bolehTembusSakelar', 'bacaKeadaan'))
cek('modulMati juga menembus lebih dulu',
  sebelum(badan(guard, 'export async function modulMati'),
    'bolehTembusSakelar(opts)) return null', 'await bacaKeadaan(keys)'))

// Tidak ada pemanggil yang mengetik kunci globalnya sendiri: begitu itu terjadi, ada
// dua daftar yang menjawab pertanyaan sama dan salah satunya akan ketinggalan.
const pemakaiLuar = [
  'app/api/blud/_guard.ts', 'app/api/usulan/_guard.ts', 'app/api/kinerja/_guard.ts',
  'app/api/dashboard/_guard.ts', 'app/api/perjanjian-kinerja/_guard.ts',
  'lib/security/app-guard.ts', 'lib/blud/izin-server.ts', 'lib/pk/izin-server.ts',
]
for (const f of pemakaiLuar) {
  cek(`${f} tidak menyebut kunci global sendiri`, !baca(f).includes(KUNCI_GLOBAL))
}

// ── D · Admin Panel tidak bisa ikut terkunci ─────────────────────────────────
console.log('\nD · pintu untuk menyalakannya kembali')

const adm = modul('admin')
// Ini pagar STRUKTURAL, bukan perkecualian yang dipelihara: tanpa `sakelar`, tak satu
// pun route admin memanggil penjaga sakelar, jadi tidak ada yang bisa dikunci global.
cek('modul admin tidak punya sakelar', adm?.sakelar === null)
cek('…dan tidak punya penjaga sakelar', adm?.penjagaApi === undefined)

const routeAdmin = berkasDi('app/api/admin')
const menyentuhSakelar = routeAdmin.filter((f) => {
  const t = buangKomentar(baca(f))
  return t.includes('modulMati(') || t.includes('modulSedangMati(') || t.includes('buatGuardModul(')
})
cek('nol route Admin Panel yang tunduk sakelar', menyentuhSakelar.length === 0,
  menyentuhSakelar.join(', '))

const menu = buangKomentar(baca('app/(dashboard)/menu/menu-client.tsx'))
cek('kartu admin dijawab online tanpa membaca sakelar apa pun',
  badan(menu, 'function sakelarKartu').includes("if (id === 'admin') return { keadaan: 'online', kunci: kunciModul }"))
// Perkecualiannya ditulis SEKALI. Sebelumnya `card.id !== 'admin'` tersebar di empat
// tempat, dan menambahkan sakelar global ke masing-masing berarti empat kesempatan
// untuk melewatkan satu.
cek('perkecualian admin tidak tersebar lagi di penghitungan keadaan',
  hitung(menu, "card.id !== 'admin'") === 0)
cek('SUPER_ADMIN tetap dibawa masuk, bukan dilempar ke halaman pemeliharaan',
  menu.includes("st.keadaan === 'maintenance' && role !== 'SUPER_ADMIN'"))

// ── E · Sebabnya sampai ke layar ─────────────────────────────────────────────
console.log('\nE · layar menyebut sebabnya')

const beku = buangKomentar(baca('lib/security/beku.ts'))
cek('infoBeku ikut membaca sakelar global',
  beku.includes('const semua = kunciDenganGlobal(kunci)'))
cek('…dan memutuskan lewat sebabTerburuk, bukan keadaanTerburuk',
  beku.includes('const sebab = sebabTerburuk(') && !beku.includes('keadaanTerburuk('))
// Pesan yang diambil dari sakelar modul saat sebabnya global = spanduk kosong, tepat
// pada pembekuan yang paling luas akibatnya.
cek('kalimatnya diambil dari sakelar penyebabnya',
  beku.includes('const sumber = global ? KUNCI_GLOBAL : utama')
  && beku.includes('peta.get(kunciPesan(sumber))') && beku.includes('kunciSampai(sumber)'))
cek('layar bisa membedakan global dari modul', beku.includes('global,') && beku.includes('global: boolean'))
cek('TIDAK_BEKU ikut punya bendera itu', beku.includes("sampai: '', global: false }"))

const maint = buangKomentar(baca('app/maintenance/page.tsx'))
cek('/maintenance ikut menghitung sakelar global',
  maint.includes('kunciDenganGlobal([kunci, ...(info.induk ? [info.induk] : [])])'))
cek('…dan menulis nama sakelar penyebabnya',
  maint.includes('label: global ? LABEL_GLOBAL : info.label'))
// `readonly` tetap BUKAN alasan menampilkan halaman pemeliharaan — modul beku harus
// tetap bisa dibuka & dicetak (P5). Global yang beku pun tidak boleh mengubah itu.
cek('beku tetap tidak memunculkan halaman pemeliharaan',
  maint.includes("if (sebab.keadaan !== 'maintenance') return null"))

cek('kartu /menu mengambil pesan dari sakelar penyebabnya',
  menu.includes('const statusKey = st.kunci'))
cek('…dan tautan pemeliharaannya juga',
  menu.includes('router.push(urlPemeliharaan(st.kunci))'))

// ── F · Gesekan hanya di arah yang merusak ───────────────────────────────────
console.log('\nF · gesekan')

const panel = buangKomentar(baca('app/(dashboard)/admin/_panels/TabAppControl.tsx'))
const badanPilih = badan(panel, 'async function pilihKeadaan')
cek('mematikan/membekukan seluruh aplikasi wajib dikonfirmasi',
  badanPilih.includes("if (kunci === KUNCI_GLOBAL && baru !== 'online') {"))
// Menyalakan kembali TIDAK ditanya apa-apa: memulihkan layanan tidak boleh dihalangi
// dialog, dan gesekan di arah yang tidak merusak melatih orang menembusnya (11.4).
cek('menyalakan kembali tidak ditanya', hitung(badanPilih, 'await confirmDialog(') === 1)
cek('…dan dialognya batal berarti tidak jadi', badanPilih.includes('if (!lanjut) return'))
cek('confirmDialog, bukan window.confirm',
  panel.includes("from '@/components/ui/ConfirmDialog'")
  && !panel.includes('window.confirm') && !panel.includes('alert('))
// Dialog yang cuma bertanya "yakin?" tidak memberi tahu apa pun. Yang menentukan:
// orangnya tahu ia masih punya jalan pulang.
cek('dialognya menyebut jalan pulangnya',
  badanPilih.includes('Admin Panel tidak ikut tertutup'))

// ── G · Layar sakelar ────────────────────────────────────────────────────────
console.log('\nG · layar sakelar')

cek('spanduk muncul hanya saat global tidak online',
  panel.includes("{globalVal !== 'online' && ("))
cek('keadaan global dibaca sekali, dipakai bersama',
  hitung(panel, 'const globalVal = bacaKeadaan(status[KUNCI_GLOBAL])') === 1)
// Kalau kartu modul tetap menulis "induknya" saat yang menahan sakelar global,
// orangnya akan memeriksa sakelar yang sebetulnya masih hidup.
cek('kartu modul menyebut sakelar yang BENAR-BENAR menahannya',
  panel.includes("const namaAtas = !isGlobal && globalVal !== 'online' ? 'sakelar SELURUH APLIKASI' : 'induknya'"))
cek('global berlaku sebelum induk',
  panel.includes("const dariAtas = isGlobal ? 'online' : globalVal !== 'online' ? globalVal : indukVal"))
cek('keterangan turunan memakai dariAtas, bukan indukVal lagi',
  hitung(panel, "{dariAtas !== 'online' && val === 'online' && (") === 1
  && !panel.includes("{indukVal !== 'online' && val === 'online'"))
cek('kartunya ditandai di kelas', panel.includes("${isGlobal ? ' global' : ''}"))

const css = baca('app/(dashboard)/admin/admin.css')
cek('kartu global melebar sepenuh grid', css.includes('.ap-sk.global{grid-column:1/-1;'))
cek('spanduknya punya dua rupa', css.includes('.ap-sk-global-ingat.mati{') && css.includes('.ap-sk-global-ingat.beku{'))
// Gate E: nol warna karangan. Semua nilai warna di blok ini wajib token yang sudah ada.
const blokCss = css.slice(css.indexOf('.ap-sk.global{'), css.indexOf('.ap-sk-global-ingat.beku{') + 200)
cek('nol hex baru di blok P12', !/#[0-9a-fA-F]{3,8}/.test(blokCss))

// ── Ringkas ──────────────────────────────────────────────────────────────────
console.log(`\n${lulus + gagal} pemeriksaan · ${lulus} lulus · ${gagal} gagal`)
console.log(gagal === 0 ? 'LULUS.' : 'GAGAL — Tahap 12 tidak lagi utuh.')
process.exit(gagal === 0 ? 0 : 1)
