#!/usr/bin/env npx tsx
// scripts/test-tahap-10.mts — penjaga regresi Tahap 10 (P2 Akses Berjangka).
// Konsep: docs/CONCEPT-pusat-akses-satu-pintu.md §12 P2, §17.2 Tahap 10.
//
// Bagian A menguji PERILAKU (berkas daun murni). B–G statis: lapisan servernya menyeret
// mysql2 + JWT_SECRET, jadi tidak bisa diimpor dari sini (pelajaran Tahap 5).
//
// Aturan menulis asersi sama dengan Tahap 4–9: kutip utuh sampai kurung buka (L82c),
// buang komentar sebelum asersi "tidak boleh ada lagi" — TERMASUK komentar SQL, potong
// jendela dari teks yang SUDAH dibuang komentarnya, dan jangan menghitung "seharusnya"
// dengan rumus yang sedang diperiksa.
//
// Jalankan: npx tsx scripts/test-tahap-10.mts

import fs from 'node:fs'
import {
  HARI_PERINGATAN, jangkaYangBerarti, labelJangka, perluPerhatian, sisaHari, tanggalSingkat,
} from '../lib/admin/berjangka-baris'

let lulus = 0
let gagal = 0

function cek(nama: string, syarat: boolean, catatan = '') {
  if (syarat) { lulus++; console.log(`  ok    ${nama.padEnd(66)} ${catatan}`) }
  else { gagal++; console.log(`  GAGAL ${nama.padEnd(66)} ${catatan}`) }
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

// ── A · Hitungan hari ────────────────────────────────────────────────────────
console.log('\nA · aturan tenggat')

cek('selisih hari kalender dihitung benar', sisaHari('2026-09-30', '2026-09-18') === 12)
cek('hari terakhir = 0, bukan 1', sisaHari('2026-09-18', '2026-09-18') === 0)
cek('yang sudah lewat bernilai negatif', sisaHari('2026-09-10', '2026-09-18') === -8)
// Lintas bulan & tahun — tempat rumus "selisih jam dibagi 24" paling sering meleset.
cek('lintas bulan tetap benar', sisaHari('2026-10-01', '2026-09-30') === 1)
cek('lintas tahun tetap benar', sisaHari('2027-01-01', '2026-12-31') === 1)
// `null`, BUKAN 0: nol berarti "berakhir hari ini", jawaban yang sangat berbeda dari
// "tanggalnya tidak terbaca".
cek('tanggal tak berbentuk memulangkan null, bukan 0', sisaHari('kemarin', '2026-09-18') === null)

cek('tanggal ditulis ringkas', tanggalSingkat('2026-09-30') === '30 Sep 2026')
cek('yang bukan tanggal jadi kosong', tanggalSingkat('30/09/2026') === '')

// Sisa harinya DITULIS, bukan cuma tanggalnya: yang perlu diputuskan bergantung pada
// hasil hitungan itu, dan menyuruh orang menghitung sendiri tiap baris adalah cara
// tercepat membuat layar ini tidak dibaca.
cek('kalimatnya menyebut sisa hari', labelJangka('2026-09-30', '2026-09-18') === 'terbuka sampai 30 Sep 2026 (12 hari lagi)')
cek('hari terakhir disebut apa adanya', labelJangka('2026-09-18', '2026-09-18').includes('hari terakhir'))
cek('yang lewat menyebut menunggu pencabutan', labelJangka('2026-09-01', '2026-09-18').includes('sudah lewat'))

// Ambangnya dari konstanta, dan yang dilewatkan dihitung DARINYA — bukan angka 3 yang
// diketik ulang, yang akan diam-diam berhenti cocok saat konstantanya diubah.
const acuan = '2026-09-18'
const tepat = new Date(Date.UTC(2026, 8, 18 + HARI_PERINGATAN)).toISOString().slice(0, 10)
const lewatSatu = new Date(Date.UTC(2026, 8, 18 + HARI_PERINGATAN + 1)).toISOString().slice(0, 10)
cek('tepat di ambang masih perlu perhatian', perluPerhatian(tepat, acuan) === true, tepat)
cek('sehari di luar ambang tidak lagi', perluPerhatian(lewatSatu, acuan) === false, lewatSatu)
cek('yang sudah lewat tetap perlu perhatian', perluPerhatian('2026-09-01', acuan) === true)

// ── A2 · Tenggat yang berarti ────────────────────────────────────────────────
console.log('\nA2 · penyaring tenggat')

const jangkaUji = {
  blud: { berakhir: '2026-09-30', alasan: 'pengganti cuti' },
  iki: { berakhir: '2026-10-31', alasan: 'magang' },
  lkjip: { berakhir: 'besok', alasan: 'salah bentuk' },
  usulan_aset: { berakhir: '2026-09-30', alasan: '   ' },
}
const hasil = jangkaYangBerarti(['blud', 'iki', 'lkjip', 'usulan_aset'], jangkaUji)
cek('tanggal tak berbentuk dibuang', !hasil.some((b) => b.appKey === 'lkjip'))
cek('alasan kosong dibuang', !hasil.some((b) => b.appKey === 'usulan_aset'))
cek('yang sah lolos dua-duanya', hasil.length === 2)
cek('urutannya tetap, tidak ikut urutan objek', hasil[0].appKey === 'blud' && hasil[1].appKey === 'iki')
// INI aturan pokoknya. Tanggal pada modul yang TIDAK diberikan per orang tidak akan
// menutup apa pun saat lewat — pintunya tidak digerakkan `app_access` — jadi ia cuma
// janji yang tidak ditepati sistem.
cek('tenggat pada modul yang tidak diberikan TIDAK ikut',
  jangkaYangBerarti(['iki'], jangkaUji).map((b) => b.appKey).join(',') === 'iki')
cek('tanpa satu grant pun hasilnya kosong', jangkaYangBerarti([], jangkaUji).length === 0)
cek('alasan dirapikan spasinya',
  jangkaYangBerarti(['blud'], { blud: { berakhir: '2026-09-30', alasan: '  pinjam  ' } })[0].alasan === 'pinjam')

// ── B · Berkas daun tetap daun ───────────────────────────────────────────────
console.log('\nB · pemisahan klien/server')

const daun = buangKomentar(baca('lib/admin/berjangka-baris.ts'))
for (const terlarang of ['lib/data/db', 'lib/security/', 'next/server', 'next/headers', 'mysql2', 'lib/admin/akses-berjangka']) {
  cek(`berjangka-baris.ts tidak mengimpor ${terlarang}`, !daun.includes(terlarang))
}
const panel = buangKomentar(baca('app/(dashboard)/admin/_panels/TabPusatAkses.tsx'))
cek('layar mengambil dari berkas daun',
  panel.includes("from '@/lib/admin/berjangka-baris'") && !panel.includes("from '@/lib/admin/akses-berjangka'"))
// Layar yang menyaring dengan aturannya sendiri akan mengirim tenggat untuk modul yang
// tidak jadi diberikan — dan server memang membuangnya, jadi bedanya senyap.
cek('layar memakai penyaring yang SAMA dengan server', panel.includes('jangkaYangBerarti(grantKirim, draJangka)'))

// ── C · Kuerinya tahan terlewat ──────────────────────────────────────────────
console.log('\nC · cron tahan terlewat')

const data = buangKomentar(baca('lib/admin/akses-berjangka.ts'))
// Server PRIMA laptop kantor yang dimatikan tiap malam. "Jatuh tempo hari ini" akan
// melewatkan seluruh baris hari itu dan TIDAK PERNAH menengoknya lagi.
cek('yang dicabut = yang SUDAH LEWAT', data.includes('WHERE k.berakhir_pada < CURDATE()'))
cek('bukan yang jatuh tempo hari ini', !data.includes('berakhir_pada = CURDATE()'))
const bIngat = badan(data, 'export async function yangPerluDiingatkan(')
cek('pengingat menyaring yang belum pernah dikirim', bIngat.includes('k.diingatkan_pada IS NULL'))
cek('…dan rentang, bukan satu hari tepat',
  bIngat.includes('k.berakhir_pada >= CURDATE()') && bIngat.includes('k.berakhir_pada <= CURDATE() + INTERVAL'))
// L66 — mysql2 menolak parameter terikat di dalam INTERVAL.
cek('ambang hari lewat sqlInt, bukan angka yang diketik',
  bIngat.includes('INTERVAL ${sqlInt(HARI_PERINGATAN)} DAY') && !bIngat.includes(`INTERVAL ${HARI_PERINGATAN} DAY`))
// Tanggalnya dari server yang sama dengan penyaringnya — dua sumber = kalimat "0 hari
// lagi" untuk baris yang penyaringnya bilang masih tiga hari.
cek('ada satu sumber tanggal server', data.includes('export async function tanggalServer('))

const bTulis = badan(data, 'export async function tulisJangkaTx(')
// Menulis ulang baris yang tidak bergeser membuat DUA kolomnya berbohong: `dibuat_oleh`
// berganti jadi siapa pun yang menekan Simpan terakhir, dan `diingatkan_pada` kembali
// NULL sehingga pengingat berbunyi lagi tiap kali halaman orang itu disimpan.
cek('baris yang tidak bergeser tidak disentuh',
  bTulis.includes('if (l && l.berakhir === b.berakhir && l.alasan === b.alasan) continue'))
cek('yang bergeser menyetel ulang pengingatnya', bTulis.includes('diingatkan_pada = NULL'))
cek('barisnya dikunci sebelum dibandingkan', bTulis.includes('FOR UPDATE'))

// ── D · Pencabutan lewat fungsi yang SAMA ────────────────────────────────────
console.log('\nD · pencabutan otomatis')

const cabut = buangKomentar(baca('lib/admin/cabut-kedaluwarsa.ts'))
// Ini aturan pokok P2. Pencabutan yang benar juga membuang perkecualian menu modul itu,
// mengambil kunci per-modul menurut urutan menaik, dan membuang tenggat yang jadi yatim.
// Jalur kedua yang menulis sendiri PASTI melewatkan salah satunya (L69).
cek('memanggil fungsi simpan yang sama dengan jalur manual',
  cabut.includes("import { simpanBerkasOrang } from '@/lib/admin/pusat-akses'")
  && cabut.includes('await simpanBerkasOrang({'))
cek('TIDAK menulis app_access sendiri',
  !cabut.includes('UPDATE users') && !cabut.includes('SET app_access'))
// Dua tenggat milik orang yang sama yang lewat bersamaan akan saling menimpa kalau
// dikerjakan satu per satu.
cek('dikerjakan per ORANG, bukan per baris tenggat', cabut.includes('const perOrang = new Map<number, BarisJatuhTempo[]>()'))
cek('peran tidak ikut digeser', cabut.includes('role: u.role,') && cabut.includes('roleAwal: u.role,'))
// Menuliskan id seseorang pada baris yang ditulis mesin membuat jejaknya menuduh orang
// yang tidak melakukan apa-apa.
cek('tidak mengaku dikerjakan seseorang', cabut.includes('olehUserId: null'))
cek('tenggat yang tersisa dikirim ulang supaya tidak ikut terhapus', cabut.includes('berjangka: Object.fromEntries('))
cek('yang kehilangan akses diberi tahu', cabut.includes("'AKSES_KEDALUWARSA'"))
// Yang bisa memperpanjang hanya SUPER_ADMIN sejak T-16; pengingat ke orang yang tidak
// bisa menindaklanjutinya cuma menambah bunyi.
cek('pengingat ke antrean SUPER_ADMIN, bukan siaran luas',
  cabut.includes("'__SUPER_ADMIN__'") && !cabut.includes('buildNotifRecipients'))
const bIngatkan = badan(cabut, 'export async function ingatkanYangHampirHabis(')
cek('stempel "sudah diingatkan" SESUDAH notifikasinya dibuat',
  bIngatkan.indexOf('addNotif(') < bIngatkan.indexOf('tandaiSudahDiingatkan('))

// ── E · Satu transaksi dengan grant-nya ──────────────────────────────────────
console.log('\nE · tenggat ikut transaksi')

const pusat = buangKomentar(baca('lib/admin/pusat-akses.ts'))
const bSimpan = badan(pusat, 'export async function simpanBerkasOrang(')
cek('tenggat ditulis di dalam transaksi yang sama', bSimpan.includes('await tulisJangkaTx(tx, p.userId, jangkaBaru, p.olehUserId)'))
// Disaring terhadap grant yang BARU: modul yang grant-nya baru dicabut kehilangan
// tenggatnya, dan tenggat yatim tidak bisa mencabut akses yang diberikan ulang nanti.
cek('disaring terhadap grant yang BARU, bukan yang lama',
  bSimpan.includes('jangkaYangBerarti(grantBaru, p.berjangka ?? {})'))
cek('berkas orang ikut membawa tenggatnya', pusat.includes('bacaJangka(userId),'))
cek('bentuk berkasnya menyebut tenggat', buangKomentar(baca('lib/admin/pintu-akses.ts')).includes('jangka: Record<string, { berakhir: string; alasan: string }>'))

// ── F · Route & skema ────────────────────────────────────────────────────────
console.log('\nF · route')

const skema = buangKomentar(baca('lib/data/admin-schemas.ts'))
cek('bentuk tanggal divalidasi di server', skema.includes('berakhir: z.string().regex('))
// Alasan peminjaman itu yang dibaca saat memutuskan perpanjangan — tanpa isi, baris
// tenggatnya tidak bisa dinilai siapa pun enam bulan kemudian.
// Dikutip UTUH berikut kalimatnya. Versi pertama cuma mencari `z.string().trim().min(4,`
// — potongan yang muncul juga di skema alasan lain di berkas ini, jadi melepas syarat
// pada alasan PEMINJAMAN tetap lolos (L82c).
cek('alasan peminjaman wajib berisi',
  skema.includes("alasan:   z.string().trim().min(4, 'Tulis dulu alasan peminjamannya.').max(255),"))

const rute = buangKomentar(baca('app/api/admin/pusat-akses/route.ts'))
cek('route meneruskan tenggat ke lapisan simpan', rute.includes('berjangka: b.berjangka,'))
// Memberi akses tanpa batas waktu dan memberi akses sampai 30 September adalah dua
// keputusan berbeda; yang membaca jejaknya harus bisa membedakannya tanpa menebak.
cek('perubahan tenggat punya baris auditnya sendiri',
  rute.includes('if (hasil.jangkaDitulis || hasil.jangkaDihapus) {'))

const cron = buangKomentar(baca('app/api/cron/akses-kedaluwarsa/route.ts'))
cek('cron dijaga CRON_SECRET', cron.includes('verifyCronSecret(req.headers.get(\'authorization\'))'))
cek('tiap pencabutan dicatat dengan sasarannya',
  cron.includes("eventType: 'ACCESS_REVOKE'") && cron.includes('targetUserId: d.userId'))
// Tanda hidup yang cuma muncul saat ia bekerja tidak bisa membedakan "tidak ada yang
// perlu dicabut" dari "cron-nya sudah dua bulan mati" — pelajaran cadangan Drive.
cek('ringkasan ditulis walau nol', cron.includes("cron: 'akses-kedaluwarsa'"))
cek('tanggalnya dari server, bukan dari jam Node', cron.includes('await tanggalServer()'))

// ── G · Migrasi ──────────────────────────────────────────────────────────────
console.log('\nG · migrasi')

const mig = buangKomentarSql(baca('docs/migrations/migration-akses-berjangka.sql'))
cek('tabelnya dibuat', mig.includes('CREATE TABLE akses_kedaluwarsa'))
// Baris kedua untuk pasangan yang sama berarti dua jawaban untuk "sampai kapan" (L88).
cek('satu tenggat per orang per modul', mig.includes('UNIQUE KEY uq_akses_kedaluwarsa (user_id, app_key)'))
// Kebalikan `audit_log.target_user_id` yang sengaja tanpa FK: yang dijaga di sini
// KEADAAN SEKARANG sebuah grant, bukan riwayat.
cek('tenggat ikut terhapus bersama akunnya', mig.includes('REFERENCES users(id) ON DELETE CASCADE'))
cek('pemberinya boleh hilang tanpa membawa barisnya', mig.includes('fk_ak_oleh FOREIGN KEY (dibuat_oleh) REFERENCES users(id) ON DELETE SET NULL'))
cek('ada indeks untuk penyapuan harian', mig.includes('KEY idx_ak_berakhir (berakhir_pada)'))
// Cron bisa terlewat sehari; tanpa kolom ini pengingatnya tidak bisa dijamin sekali.
cek('kolom penanda pengingat ada', mig.includes('diingatkan_pada DATE'))
cek('kepalanya memuat kueri pemeriksaan',
  baca('docs/migrations/migration-akses-berjangka.sql').includes('information_schema.TABLES'))
const schema = buangKomentarSql(baca('docs/schema-mysql.sql'))
// Kurung bukanya IKUT dikutip. Tanpa itu `akses_kedaluwarsa_lama` juga cocok — nama
// tabel yang berganti tetap lolos karena yang lama jadi AWALAN yang baru.
cek('skema acuan ikut diperbarui', schema.includes('CREATE TABLE akses_kedaluwarsa ('))
cek('…berikut kunci uniknya', hitung(schema, 'uq_akses_kedaluwarsa') === 1)

console.log(`\n${lulus + gagal} pemeriksaan · ${lulus} lulus · ${gagal} gagal`)
if (gagal > 0) {
  console.log('GAGAL — Tahap 10 tidak lagi utuh.')
  process.exit(1)
}
console.log('LULUS.')
