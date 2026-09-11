#!/usr/bin/env npx tsx
// scripts/test-tahap-11.mts — penjaga regresi Tahap 11 (P4 Permintaan Akses Mandiri).
// Konsep: docs/CONCEPT-pusat-akses-satu-pintu.md §12 P4, §17.2 Tahap 11.
//
// Bagian A menguji PERILAKU (berkas daun murni — ia cuma mengimpor registry yang juga
// nol-impor). B–H statis: lapisan servernya menyeret mysql2 + JWT_SECRET, jadi tidak
// bisa diimpor dari sini (pelajaran Tahap 5).
//
// Aturan menulis asersi sama dengan Tahap 4–10: kutip utuh sampai kurung buka (L82c),
// buang komentar sebelum asersi "tidak boleh ada lagi" — TERMASUK komentar SQL, potong
// jendela dari teks yang SUDAH dibuang komentarnya, dan jangan menghitung "seharusnya"
// dengan rumus yang sedang diperiksa.
//
// Jalankan: npx tsx scripts/test-tahap-11.mts

import fs from 'node:fs'
import {
  MAKS_ALASAN, MIN_ALASAN, STATUS_PERMINTAAN,
  bolehDimintaOleh, keadaanKartu, labelModul, modulYangBisaDiminta, umurPermintaan,
  type PermintaanSaya,
} from '../lib/admin/permintaan-baris'
import { AlasanWewenangSchema } from '../lib/data/admin-schemas'

let lulus = 0
let gagal = 0

function cek(nama: string, syarat: boolean, catatan = '') {
  if (syarat) { lulus++; console.log(`  ok    ${nama.padEnd(68)} ${catatan}`) }
  else { gagal++; console.log(`  GAGAL ${nama.padEnd(68)} ${catatan}`) }
}

const baca = (p: string) => fs.readFileSync(p, 'utf8')
const buangKomentar = (t: string) =>
  t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')
const buangKomentarSql = (t: string) => t.replace(/^\s*--.*$/gm, '')
const hitung = (t: string, s: string) => t.split(s).length - 1

function badan(teks: string, tanda: string): string {
  const i = teks.indexOf(tanda)
  if (i < 0) return ''
  const sisa = teks.slice(i + tanda.length)
  const j = sisa.search(/\nexport (?:async )?(?:function|const)|\n(?:async )?function /)
  return j < 0 ? sisa : sisa.slice(0, j)
}

const permintaan = (p: Partial<PermintaanSaya> & { appKey: string }): PermintaanSaya => ({
  id: 1, alasan: 'perlu untuk laporan', status: 'MENUNGGU',
  dibuatPada: '2026-09-10T02:00:00.000Z', catatanPutusan: null, ...p,
})

// ── A · Aturan siapa boleh meminta apa ───────────────────────────────────────
console.log('\nA · siapa boleh meminta apa')

// PROGRAM tidak punya BLUD lewat peran, jadi ia boleh memintanya.
cek('modul terkunci boleh diminta', bolehDimintaOleh('blud', 'PROGRAM', []) === true)
// Yang sudah dipunyai lewat grant tidak boleh — permintaannya cuma akan dijawab
// "sudah terbuka", oleh manusia.
cek('modul yang sudah di-grant tidak ditawarkan', bolehDimintaOleh('blud', 'PROGRAM', ['blud']) === false)
// ADMIN punya BLUD lewat peran; pintunya sudah terbuka tanpa grant apa pun.
cek('modul yang terbuka karena PERAN tidak ditawarkan', bolehDimintaOleh('blud', 'ADMIN', []) === false)
// T-9: `admin` bolehDigrant:false — mencentangnya di app_access tidak pernah membuka
// Admin Panel, jadi mengantrekannya berarti mengantre sesuatu yang tak punya jawaban ya.
cek('Admin Panel tidak pernah bisa diminta', bolehDimintaOleh('admin', 'PROGRAM', []) === false)
cek('…bahkan untuk peran mana pun', bolehDimintaOleh('admin', 'ADMIN_KABAG', []) === false)
// Deny-by-default: kunci salah ketik menutup, bukan membuka.
cek('kunci tak dikenal ditolak', bolehDimintaOleh('bukan-modul', 'PROGRAM', []) === false)
// `peranBawaan: 'SEMUA'` (Usulan) terbuka untuk siapa pun — tak ada yang perlu diminta.
cek('modul terbuka-untuk-semua tidak ditawarkan', bolehDimintaOleh('usulan', 'PROGRAM', []) === false)

const tawaran = modulYangBisaDiminta('PROGRAM', [])
cek('daftar tawaran tidak memuat admin', !tawaran.some(m => m.kunci === 'admin'))
cek('daftar tawaran memuat blud', tawaran.some(m => m.kunci === 'blud'), `${tawaran.length} modul`)
// Disaring dengan fungsi yang SAMA, bukan dengan syarat yang ditulis ulang — kalau
// tidak, layar bisa menawarkan sesuatu yang server tolak (aturan 11.5).
cek('daftar tawaran = hasil saringan bolehDimintaOleh',
  tawaran.every(m => bolehDimintaOleh(m.kunci, 'PROGRAM', [])))
cek('yang sudah di-grant hilang dari tawaran',
  !modulYangBisaDiminta('PROGRAM', ['blud']).some(m => m.kunci === 'blud'))

cek('label modul dibaca dari registry', labelModul('blud').length > 0 && labelModul('blud') !== 'blud')
cek('kunci tak dikenal dipulangkan apa adanya', labelModul('zzz') === 'zzz')

// ── B · Keadaan kartu /menu ──────────────────────────────────────────────────
console.log('\nB · keadaan kartu')

cek('tanpa riwayat = belum', keadaanKartu('blud', []).status === 'belum')
cek('ada yang menunggu = menunggu',
  keadaanKartu('blud', [permintaan({ appKey: 'blud' })]).status === 'menunggu')
// Modul lain tidak boleh ikut terbaca — satu orang bisa punya beberapa permintaan.
cek('permintaan modul lain tidak bocor ke kartu ini',
  keadaanKartu('pk', [permintaan({ appKey: 'blud' })]).status === 'belum')

const ditolak = keadaanKartu('blud', [
  permintaan({ appKey: 'blud', id: 1, status: 'DITOLAK', catatanPutusan: 'sebab lama', dibuatPada: '2026-09-01T00:00:00.000Z' }),
  permintaan({ appKey: 'blud', id: 2, status: 'DITOLAK', catatanPutusan: 'sebab baru', dibuatPada: '2026-09-08T00:00:00.000Z' }),
])
cek('penolakan terbaca sebagai ditolak', ditolak.status === 'ditolak')
// Yang TERBARU, bukan yang pertama ketemu: orang boleh ditolak, meminta lagi, lalu
// ditolak lagi dengan sebab berbeda — dan yang berlaku sebab terakhir.
cek('sebab yang ditampilkan sebab TERAKHIR', ditolak.catatan === 'sebab baru')
// MENUNGGU mengalahkan riwayat penolakan: yang sedang berjalan itu yang perlu dibaca.
cek('menunggu mengalahkan penolakan lama',
  keadaanKartu('blud', [
    permintaan({ appKey: 'blud', id: 1, status: 'DITOLAK', catatanPutusan: 'lama' }),
    permintaan({ appKey: 'blud', id: 2, status: 'MENUNGGU' }),
  ]).status === 'menunggu')
// Yang sudah disetujui tidak menyisakan apa pun di kartu — kartunya sudah terbuka,
// dan itu jawaban yang lebih jelas daripada lencana mana pun.
cek('yang sudah disetujui tidak menyisakan lencana',
  keadaanKartu('blud', [permintaan({ appKey: 'blud', status: 'DISETUJUI' })]).status === 'belum')

// ── C · Umur antrean ─────────────────────────────────────────────────────────
console.log('\nC · umur antrean')

cek('nol hari = hari ini', umurPermintaan(0) === 'hari ini')
cek('satu hari = kemarin', umurPermintaan(1) === 'kemarin')
cek('lebih dari itu disebut angkanya', umurPermintaan(5) === '5 hari lalu')
// Jam server bisa memulangkan negatif kalau stempelnya di masa depan (jam mesin
// bergeser). Jangan berbunyi "-1 hari lalu".
cek('negatif tidak berbunyi aneh', umurPermintaan(-2) === 'hari ini')
cek('bukan angka jadi kosong', umurPermintaan(Number.NaN) === '')
// Fungsinya menerima ANGKA — kalau ia membaca jamnya sendiri, ia tidak bisa dipakai
// saat render (ESLint react-hooks/purity) dan tidak bisa diuji tanpa membekukan waktu.
const daunTeks = baca('lib/admin/permintaan-baris.ts')
cek('berkas daun tidak pernah membaca jam sendiri',
  !daunTeks.includes('Date.now(') && !daunTeks.includes('new Date('))

// ── D · Batas alasan ─────────────────────────────────────────────────────────
console.log('\nD · batas alasan')

// Angka yang menentukan: alasan pemohon dipakai ULANG sebagai alasan P9 saat disetujui,
// jadi ia tidak boleh lebih panjang dari kolom yang akan menampungnya. Dibandingkan
// dengan skemanya sendiri, bukan dengan angka 140 yang diketik ulang di sini.
const maksP9 = AlasanWewenangSchema.safeParse('x'.repeat(MAKS_ALASAN)).success
const lebihDariP9 = AlasanWewenangSchema.safeParse('x'.repeat(MAKS_ALASAN + 1)).success
cek('alasan sepanjang batas masih muat di kolom alasan P9', maksP9 === true)
cek('…dan satu huruf lebih sudah tidak muat', lebihDariP9 === false, `MAKS_ALASAN=${MAKS_ALASAN}`)
cek('batas bawah lebih tinggi dari alasan admin', MIN_ALASAN > 4, `MIN_ALASAN=${MIN_ALASAN}`)
cek('tiga status, tidak lebih', STATUS_PERMINTAAN.length === 3)

// Skema Zod MENURUNKAN batasnya dari konstanta, tidak mengetik ulang angkanya.
const skema = buangKomentar(baca('lib/data/admin-schemas.ts'))
// KEMUNCULANNYA yang dihitung, bukan keberadaannya: `.min(MIN_ALASAN,` dipakai DUA
// skema (permintaan & penolakan), jadi asersi "ada?" tetap lulus walau salah satunya
// diganti angka mati — L82c lewat pintu yang sama untuk keenam kalinya.
cek('kedua skema memakai konstanta MIN_ALASAN', hitung(skema, '.min(MIN_ALASAN,') === 2)
cek('skema permintaan memakai konstanta MAKS_ALASAN', hitung(skema, '.max(MAKS_ALASAN)') === 1)
cek('app_key permintaan diturunkan dari registry', skema.includes('app_key: AppAccessKeyEnum'))
// Catatan penolakan wajib, dan sepanjang kolomnya.
cek('catatan penolakan wajib & 255', skema.includes('catatan: z.string().trim().min(MIN_ALASAN,') && badan(skema, 'TolakPermintaanSchema').includes('.max(255)'))

// ── E · Migrasi & skema acuan ────────────────────────────────────────────────
console.log('\nE · migrasi & skema acuan')

const mig = buangKomentarSql(baca('docs/migrations/migration-akses-permintaan.sql'))
// Kurung bukanya IKUT dikutip — tanpa itu nama tabel yang diganti jadi
// `akses_permintaan_lama` tetap cocok sebagai AWALAN (L82c, jebakan Tahap 10).
cek('tabel dibuat', mig.includes('CREATE TABLE akses_permintaan ('))
// Kolom bayangan GENERATED, bukan diisi kode: kolom yang diisi tangan cepat atau lambat
// tidak sinkron dengan `status`, dan begitu ia tidak sinkron kunci uniknya berhenti
// menjaga apa pun tanpa satu gejala.
cek('kolom penanda menunggu DIBANGKITKAN dari status',
  mig.includes("menunggu        TINYINT GENERATED ALWAYS AS (IF(status = 'MENUNGGU', 1, NULL)) STORED"))
cek('kunci unik memuat kolom bangkitan itu',
  mig.includes('UNIQUE KEY uq_akses_permintaan_menunggu (user_id, app_key, menunggu)'))
// Riwayat menerangkan KEADAAN SEKARANG sebuah akun; kalau akunnya hilang, tidak ada
// pertanyaan yang perlu dijawab. Jejaknya hidup di audit_log.
cek('permintaan ikut terhapus bersama akunnya',
  mig.includes('fk_ap_user  FOREIGN KEY (user_id)      REFERENCES users(id) ON DELETE CASCADE'))
cek('pemutusnya boleh hilang tanpa membawa barisnya',
  mig.includes('fk_ap_oleh  FOREIGN KEY (diputus_oleh) REFERENCES users(id) ON DELETE SET NULL'))
cek('ada indeks untuk antrean', mig.includes('KEY idx_ap_antrean (status, dibuat_pada)'))
// Panjang kolomnya harus sama dengan batas yang dijaga Zod — kiriman yang lolos Zod
// tapi melebihi kolom akan ditolak MySQL sebagai galat 500 yang tidak menerangkan apa pun.
cek('kolom alasan selebar MAKS_ALASAN', mig.includes(`alasan          VARCHAR(${MAKS_ALASAN}) NOT NULL`))
cek('kepalanya memuat kueri pemeriksaan',
  baca('docs/migrations/migration-akses-permintaan.sql').includes('information_schema.TABLES'))

const schema = buangKomentarSql(baca('docs/schema-mysql.sql'))
cek('skema acuan ikut diperbarui', schema.includes('CREATE TABLE akses_permintaan ('))
cek('…berikut kunci uniknya', hitung(schema, 'uq_akses_permintaan_menunggu') === 1)
cek('…dan kolom bangkitannya', schema.includes("GENERATED ALWAYS AS (IF(status = 'MENUNGGU', 1, NULL)) STORED"))

// ── F · Lapisan server ───────────────────────────────────────────────────────
console.log('\nF · lapisan server')

const lib = buangKomentar(baca('lib/admin/permintaan-akses.ts'))

// "Sudah ada yang menunggu" dijawab kunci unik DB, bukan SELECT-dulu: memeriksa baris
// yang BELUM ADA tidak mengunci apa pun (L69-a).
const badanBuat = badan(lib, 'export async function buatPermintaan')
cek('permintaan ganda dijawab galat DB, bukan SELECT-dulu',
  badanBuat.includes("=== 'ER_DUP_ENTRY'") && !badanBuat.includes('SELECT'))
cek('alasannya dipotong di batas kolomnya', badanBuat.includes('.slice(0, MAKS_ALASAN)'))

// Antrean terlama DULU — yang paling lama menunggu paling mungkin sudah menyerah dan
// kembali mengirim WhatsApp.
const badanAntrean = badan(lib, 'export async function antreanMenunggu')
cek('antrean urut terlama dulu', badanAntrean.includes('ORDER BY p.dibuat_pada ASC, p.id ASC'))
// Umurnya dihitung SERVER — satu jam untuk satu pertanyaan (pelajaran tanggalServer P2).
cek('umur dihitung server, bukan peramban',
  badanAntrean.includes('DATEDIFF(CURDATE(), DATE(p.dibuat_pada)) AS umur_hari'))
// Lencana dan daftarnya harus menyaring hal yang SAMA; lencana "3" di atas daftar
// berisi 2 membuat orang berhenti memercayai lencananya.
const badanHitung = badan(lib, 'export async function hitungMenunggu')
cek('lencana menyaring sama dengan daftarnya',
  badanHitung.includes("p.status = 'MENUNGGU' AND u.deleted_at IS NULL")
  && badanAntrean.includes("p.status = 'MENUNGGU' AND u.deleted_at IS NULL"))

// Penolakan: yang memutuskan pemenang antara dua SUPER_ADMIN adalah UPDATE bersyarat,
// bukan pemeriksaan di JavaScript (bentuk L55).
const badanTolak = badan(lib, 'export async function tolakPermintaan')
cek('penolakan bersaing diputus UPDATE bersyarat',
  badanTolak.includes("WHERE id = ${id} AND status = 'MENUNGGU'")
  && badanTolak.includes('affectedRows !== 1'))

// Penutupan berpatokan pada keadaan AKHIR, bukan "baru dicentang".
const badanTutup = badan(lib, 'export async function tutupYangSudahTerbukaTx')
cek('penutupan menyaring terhadap pintu yang TERBUKA', badanTutup.includes('terbuka.has(r.app_key)'))
cek('…dan barisnya dikunci lebih dulu', badanTutup.includes("status = 'MENUNGGU' FOR UPDATE"))
// Ia menerima `tx`, bukan membuka transaksinya sendiri: kalau ia memakai koneksi lain,
// kunci di transaksi pemanggilnya tidak menjaga apa pun (L69-b).
// DUA kueri di dalamnya (baca terkunci + tulis), dan KEDUANYA wajib lewat `tx`.
// Satu saja yang kembali ke koneksi pool sudah cukup: kunci di transaksi pemanggil
// berhenti menjaga apa pun, senyap (L69-b). Karena itu yang dihitung kemunculannya.
cek('penutupan ikut transaksi pemanggil, tidak membuka sendiri',
  !badanTutup.includes('withTransaction') && hitung(badanTutup, 'await tx`') === 2
  && !badanTutup.includes('await sql`'))

// ── G · Satu jalur tulis (aturan 11.1) ───────────────────────────────────────
console.log('\nG · satu jalur tulis')

const routeAdmin = buangKomentar(baca('app/api/admin/permintaan-akses/route.ts'))
// TIDAK ada "setujui" di sini. Menyetujui berarti memberi akses, dan memberi akses cuma
// punya satu jalur: PUT /api/admin/pusat-akses. Endpoint tulis kedua = set aturan kedua
// (L78/L80/L82).
cek('route antrean tidak punya jalur pemberian akses',
  !routeAdmin.includes('app_access') && !routeAdmin.includes('simpanBerkasOrang'))
cek('route antrean cuma GET & PATCH',
  routeAdmin.includes('export async function GET') && routeAdmin.includes('export async function PATCH')
  && !routeAdmin.includes('export async function PUT') && !routeAdmin.includes('export async function POST'))
// Kurung tutupnya IKUT dikutip. Tanpa itu, melonggarkan lantainya jadi
// `!== 'SUPER_ADMIN' && !== 'ADMIN'` tetap cocok — syarat yang dikutip sepotong
// membiarkan tambahan di belakangnya lolos (L82c).
cek('SUPER_ADMIN saja', routeAdmin.includes("if (session.role !== 'SUPER_ADMIN') return"))

const routeMinta = buangKomentar(baca('app/api/akses/permintaan/route.ts'))
// Pagar sungguhannya di server. Tautan di layar cuma muncul pada kartu terkunci, tapi
// menyembunyikan bukan menjaga (aturan 11.2).
cek('permintaan diperiksa dengan aturan yang sama dengan layar',
  routeMinta.includes('bolehDimintaOleh(appKey, session.role, grant)'))
// Grant dibaca dari DB, bukan dari sesi: token memuat peran, tidak memuat app_access —
// dan andaikan memuat pun, isinya berumur sesi.
cek('grant dibaca dari DB, bukan dari token', routeMinta.includes('SELECT app_access FROM users'))
cek('ada rem laju', routeMinta.includes('checkRateLimit(`akses-minta:'))
// Tanpa cooldown / probation / kata sandi ulang (aturan 11.4) — gesekan promosi
// dipasang di sini akan mengembalikan orang ke WhatsApp.
cek('tanpa gesekan alur promosi',
  !routeMinta.includes('verifyPromotionPassword') && !routeMinta.includes('cooldown')
  && !routeMinta.includes('probation') && !routeMinta.includes('Turnstile'))

// ── H · Penutupan & pemberitahuan di SEMUA jalur simpan (L69) ────────────────
console.log('\nH · penutupan di semua jalur simpan')

const pusat = buangKomentar(baca('lib/admin/pusat-akses.ts'))
// Ditutup di transaksi yang SAMA dengan grant-nya: terpisah, "akses diberikan tapi
// antreannya masih menunggu" jadi keadaan setengah jalan yang mungkin terjadi.
cek('penutupan dipanggil dari dalam transaksi simpan', pusat.includes('tutupYangSudahTerbukaTx('))
cek('…dengan set pintu yang SUDAH dihitung, bukan daftar grant mentah',
  badan(pusat, 'export async function simpanBerkasOrang').includes('terbukaBaru, p.olehUserId'))
cek('hasilnya dipulangkan supaya pemanggil bisa mengabari', pusat.includes('permintaanDisetujui: PermintaanDitutup[]'))
// Notifikasi TIDAK dikirim dari dalam transaksi — kabar yang terlanjur terkirim tidak
// bisa ditarik balik kalau simpanannya gagal di detik terakhir.
cek('notifikasi tidak dikirim dari dalam lapisan simpan', !pusat.includes('addNotif'))

// L69 — DUA pemanggil `simpanBerkasOrang`, dan dua-duanya wajib mengabari. Jalur cron
// nyaris mustahil menutup apa pun, dan tetap ditangani: perbaikan yang cuma mengenai
// satu jalur tulis adalah bentuk yang sudah tiga kali jadi temuan.
const pemanggil = [
  ['app/api/admin/pusat-akses/route.ts', 'route Pusat Akses'],
  ['lib/admin/cabut-kedaluwarsa.ts', 'cron kedaluwarsa'],
] as const
for (const [berkas, nama] of pemanggil) {
  const t = buangKomentar(baca(berkas))
  cek(`${nama} membaca hasil penutupan`, t.includes('permintaanDisetujui'))
  cek(`${nama} mengabari pemohonnya`, t.includes("'AKSES_DISETUJUI'"))
}
// Dan pemanggilnya memang cuma dua — kalau lahir yang ketiga, daftar di atas harus ikut.
const semuaTs = fs.readdirSync('lib/admin').map(f => `lib/admin/${f}`)
  .concat(['app/api/admin/pusat-akses/route.ts'])
  .filter(f => f.endsWith('.ts'))
const pemakai = semuaTs.filter(f => buangKomentar(baca(f)).includes('simpanBerkasOrang('))
  .filter(f => !f.endsWith('pusat-akses.ts'))
cek('pemanggil simpanBerkasOrang tepat dua', pemakai.length === 2, pemakai.join(' · '))

// Audit punya jenisnya sendiri: permintaan yang DITOLAK tidak melahirkan satu pun baris
// ACCESS_GRANT, jadi ia lenyap tanpa jejak kalau menumpang jenis yang sudah ada.
const audit = baca('lib/security/auditlog.ts')
for (const j of ['ACCESS_REQUEST', 'ACCESS_REQUEST_APPROVED', 'ACCESS_REQUEST_REJECTED']) {
  cek(`jenis audit ${j} terdaftar`, audit.includes(`| '${j}'`))
}
cek('permintaan tercatat dengan SASARANNYA', routeMinta.includes('targetUserId: session.userId'))
cek('penolakan tercatat dengan sasarannya', routeAdmin.includes('targetUserId: b.userId'))

// ── I · Layar ────────────────────────────────────────────────────────────────
console.log('\nI · layar')

const menu = baca('app/(dashboard)/menu/menu-client.tsx')
// Kartu terkunci diredupkan BAGIAN-BAGIANNYA, bukan seluruhnya: opacity/filter milik
// induk tidak bisa dibatalkan anaknya, jadi kalau kartunya yang diredupkan, kalimat
// sebab penolakan justru jadi yang paling sulit dibaca.
cek('kartu terkunci tidak lagi diredupkan seluruhnya',
  menu.includes('.app-card.locked { cursor: not-allowed; }')
  && !menu.includes('.app-card.locked { opacity: .45;'))
cek('yang diredupkan bagian-bagiannya', menu.includes('.app-card.locked > .card-cta { opacity: .45; filter: grayscale(.7); }'))
// Tanpa :not(.locked) kekhususannya persis sama dengan aturan peredup dan ia menang
// karena ditulis belakangan — kartu terkunci berkedip terang saat disentuh tetikus.
cek('hover cta mengecualikan kartu terkunci', menu.includes('.app-card:not(.locked):hover .card-cta {'))
// Daftar modul yang boleh diminta datang dari SERVER, tidak disimpulkan dari kartu.
cek('tawaran datang dari server', menu.includes('setBisaDiminta(') && menu.includes("fetch('/api/akses/permintaan')"))
cek('tombol minta hanya untuk yang boleh diminta', menu.includes('if (!bisaDiminta.includes(card.id)) return null;'))
// Kartunya sendiri punya onClick yang menelan klik; tanpa stopPropagation tombolnya mati.
// DUA baris `.card-minta` (yang menunggu & yang menawarkan tombol), dan keduanya
// wajib menghentikan kliknya — kartunya sendiri punya onClick yang menelan klik pada
// kartu terkunci. Dihitung, bukan dicari keberadaannya.
cek('kedua baris permintaan menghentikan klik kartunya',
  hitung(menu, 'className="card-minta" onClick={e => e.stopPropagation()}') === 2)
cek('sebab penolakan tertulis di kartunya', menu.includes('Belum bisa dipenuhi: {k.catatan}'))
// Backtick di dalam <style>{`…`} memutus template literal-nya — build gagal dengan
// pesan yang menunjuk JSX, bukan CSS-nya. Sudah terjadi dua kali.
const gaya = menu.slice(menu.indexOf('<style>{`') + 9, menu.indexOf('`}</style>'))
cek('tidak ada backtick di dalam blok gaya', !gaya.includes('`'))

const tab = baca('app/(dashboard)/admin/_panels/TabPusatAkses.tsx')
// SETUJUI mengisi form, lalu berhenti (aturan 11.1).
// Jendelanya dipotong pada AKHIR callback-nya, bukan diserahkan ke pemotong badan
// fungsi: `bawaKeForm` tidak diekspor, jadi pemotong itu menjulur sampai ke
// `tolakPermintaan` di bawahnya — yang memang memanggil `fetchJson` — dan asersinya
// gagal menuduh fungsi yang sudah benar (jebakan yang sama dengan K4 di suite rekap).
const tabBersih = buangKomentar(tab)
const iBawa = tabBersih.indexOf('const bawaKeForm = useCallback')
const jBawa = tabBersih.indexOf('}, [pilih, muatBerkas, setPilih]);', iBawa)
const badanBawa = iBawa >= 0 && jBawa > iBawa ? tabBersih.slice(iBawa, jBawa) : ''
cek('SETUJUI tidak menulis apa pun sendiri',
  badanBawa.length > 0 && !badanBawa.includes('fetchJson') && !badanBawa.includes('method:'))
cek('…dan itu ditulis di layar, bukan cuma di kode',
  tab.includes('SETUJUI mengisi form orang itu — aksesnya baru diberikan saat Anda menekan Simpan.'))
// REF, bukan state: state akan masuk daftar dependensi pemuat berkas lalu memuat ulang
// tiap kali ia berubah — dan pemuatan ulang itu yang menghapus centang yang baru dipasang.
cek('permintaan yang dibawa disimpan di ref', tab.includes('const permintaanRef = useRef<BarisAntrean | null>(null);'))
// Jendelanya dipotong pada akhir callback-nya (alasan yang sama dengan `bawaKeForm`),
// dan yang dihitung KEMUNCULANNYA: ref itu dibaca sekali lalu dikosongkan sekali di
// dalam badan yang sama, jadi asersi "ada?" tetap lulus walau barisan pembacanya
// diganti nilai mati — L82c sekali lagi.
const iMuat = tabBersih.indexOf('const muatBerkas = useCallback')
const jMuat = tabBersih.indexOf('  }, []);', iMuat)
const badanMuat = iMuat >= 0 && jMuat > iMuat ? tabBersih.slice(iMuat, jMuat) : ''
cek('centangnya dipasang SESUDAH berkas mendarat',
  badanMuat.includes('const q = permintaanRef.current;')
  && badanMuat.includes('if (q && q.userId === id) {')
  && hitung(badanMuat, 'permintaanRef.current') === 2)
// Alasan pemohon dipakai ulang — persetujuan tidak ditanya alasannya lagi (§12 P9).
cek('alasan pemohon mengisi kotak alasan P9', tab.includes('nilaiAwal: alasanSiap ?? undefined,'))
cek('kotak alasan menerima isian awal', baca('components/ui/ConfirmDialog.tsx').includes("useState(opts.nilaiAwal ?? '')"))
// Alasannya UTUH di baris antrean: ia satu-satunya bahan keputusan di layar itu, dan
// keputusan yang bahannya harus diklik dulu akan diambil tanpa membacanya.
cek('alasan tampil utuh di antrean', tab.includes('className="ap-pa-antrean-alasan"'))
cek('antrean disegarkan sesudah Simpan',
  hitung(buangKomentar(tab), 'await muatAntrean()') >= 2)

const adm = baca('app/(dashboard)/admin/admin-client.tsx')
// Lencana harus menyala tanpa tabnya pernah dibuka — alasan yang sama dengan P10.
cek('antrean dipegang induk, bukan tabnya', adm.includes('const [antrean, setAntrean] = useState<BarisAntrean[]>([]);'))
cek('rel Pusat Akses berlencana', adm.includes("label:'Pusat Akses', icon:<Users size={15}/>, lencana: antrean.length"))
// Tipe saja dari berkas daun; impor NILAI dari lapisan server akan menyeret mysql2 ke
// bundel peramban (preseden Tahap 5).
cek('induk mengimpor TIPE saja', adm.includes("import type { BarisAntrean } from '@/lib/admin/permintaan-baris'"))

const daunPemakai = ['app/(dashboard)/menu/menu-client.tsx', 'components/akses/MintaAksesModal.tsx',
  'app/(dashboard)/admin/_panels/TabPusatAkses.tsx', 'app/(dashboard)/admin/admin-client.tsx']
for (const f of daunPemakai) {
  cek(`${f.split('/').pop()} tidak menyentuh lapisan server`,
    !baca(f).includes("from '@/lib/admin/permintaan-akses'"))
}

console.log(`\n${lulus + gagal} pemeriksaan · ${lulus} lulus · ${gagal} gagal`)
if (gagal > 0) {
  console.log('GAGAL — Tahap 11 tidak lagi utuh.')
  process.exit(1)
}
console.log('LULUS.')
