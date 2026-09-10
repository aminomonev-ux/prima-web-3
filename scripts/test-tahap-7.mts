#!/usr/bin/env npx tsx
// scripts/test-tahap-7.mts — penjaga regresi Tahap 7 (P8 lapis 1 · P9).
// Konsep: docs/CONCEPT-pusat-akses-satu-pintu.md §12 P8/P9, §17.2 Tahap 7.
//
// Pemeriksaan STATIS + fungsi murni. Tidak menyentuh DB: yang dijaga di sini justru
// hal-hal yang baru terlihat SESUDAH datanya masuk — bahwa sasaran ikut dicatat, bahwa
// alasannya wajib, dan bahwa layarnya mengatakan garis waktunya punya ujung.
//
// Aturan menulis asersi sama dengan Tahap 4–6: kutip utuh sampai kurung buka (L82c),
// buang komentar sebelum asersi "tidak boleh ada lagi", dan JANGAN menghitung
// "seharusnya" dengan rumus yang sedang diperiksa.
//
// Jalankan: npx tsx scripts/test-tahap-7.mts

import fs from 'node:fs'
import { AlasanWewenangSchema } from '../lib/data/admin-schemas'

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

/**
 * Komentar SQL (`--`). WAJIB dipakai sebelum asersi apa pun atas berkas .sql.
 *
 * Berkas migrasi & skema di repo ini menjelaskan keputusannya di kepala berkas — jadi
 * kalimat yang MENYEBUT sesuatu untuk mengatakan "ini sengaja tidak ada" akan menyalakan
 * tesnya sendiri, dan kolom yang DIKOMENTARI tetap terbaca seperti masih ada. Ketiganya
 * lolos sekali di sini sebelum penyaring ini dipasang.
 */
function buangKomentarSql(t: string): string {
  return t.replace(/^\s*--.*$/gm, '')
}

// ── A · Alasan (P9) — bentuknya ──────────────────────────────────────────────
console.log('\nA · alasan wajib')

// Alasan yang boleh kosong adalah alasan yang tidak pernah diisi, dan kolom yang selalu
// berisi "-" lebih buruk daripada kolom yang tidak ada — ia terbaca seperti sudah
// dijawab.
cek('kosong ditolak', AlasanWewenangSchema.safeParse('').success === false)
cek('satu strip ditolak', AlasanWewenangSchema.safeParse('-').success === false)
cek('spasi saja ditolak', AlasanWewenangSchema.safeParse('   ').success === false)
cek('kalimat pendek diterima', AlasanWewenangSchema.safeParse('mutasi ke Keuangan').success === true)
cek('spasi tepi dipangkas',
  AlasanWewenangSchema.safeParse('  mutasi  ').success
  && AlasanWewenangSchema.parse('  mutasi  ') === 'mutasi')
cek('lebih dari 140 huruf ditolak', AlasanWewenangSchema.safeParse('a'.repeat(141)).success === false)
cek('tepat 140 huruf diterima', AlasanWewenangSchema.safeParse('a'.repeat(140)).success === true)

const skema = buangKomentar(baca('lib/data/admin-schemas.ts'))
cek('ubah-role WAJIB menyebut alasan', /action: z\.literal\('ubah-role'\)[\s\S]{0,220}alasan: AlasanWewenangSchema,/.test(skema))
// P9 §12: TIDAK diminta pada aktifkan/nonaktifkan rutin. Pertanyaan yang muncul pada
// aksi harian melatih orang mengetik "-" lalu terbawa ke aksi yang benar-benar penting.
for (const aksi of ['nonaktif', 'aktifkan', 'putus-sesi', 'reset-password']) {
  const blok = skema.slice(skema.indexOf(`z.literal('${aksi}')`))
  cek(`${aksi} TIDAK diminta alasannya`, !blok.slice(0, 160).includes('alasan:'))
}
// Pintu kedua yang melewati aturan barunya membuat aturan itu jadi hiasan.
cek("jalur 'set-app-access' dibuang — ia memberi akses tanpa alasan",
  !skema.includes("z.literal('set-app-access')")
  && !buangKomentar(baca('app/api/admin/users/route.ts')).includes("data.action === 'set-app-access'"))

// ── B · Server yang memutuskan, bukan klien ─────────────────────────────────
console.log('\nB · siapa yang memutuskan "berubah"')

const lib = buangKomentar(baca('lib/admin/pusat-akses.ts'))
// Klien tidak tahu keadaan tersimpan yang sebenarnya (grant lama tidak pernah dikirim
// balik), jadi "apakah ini perubahan" yang dihitung di sana adalah tebakan yang bisa
// meleset tepat pada kasus yang paling perlu dicatat — dua admin menyunting orang sama.
cek('alasan diperiksa DI DALAM transaksi', lib.includes('throw new AlasanWajibError('))
cek('…dari grant lama yang dibaca di bawah FOR UPDATE',
  lib.includes('const grantBergeser = [...grantCalon].sort().join(\',\') !== [...appAccessLama].sort().join(\',\')'))
cek('…dan syaratnya peran ATAU pintu modul bergeser',
  lib.includes('if ((gantiPeran || grantBergeser) && !p.alasan) {'))
// Menyimpan tanpa menggeser wewenang (mis. cuma satu izin menu) tidak ditanya alasannya.
cek('menyimpan tanpa menggeser wewenang tidak diminta alasan',
  !lib.includes('if (!p.alasan) throw'))
cek('diperiksa SEBELUM satu baris pun ditulis',
  lib.indexOf('throw new AlasanWajibError(') < lib.indexOf('UPDATE users SET role ='))

const rute = buangKomentar(baca('app/api/admin/pusat-akses/route.ts'))
cek('alasan wajib dijawab 400, bukan 500', rute.includes("code: 'ALASAN_WAJIB' })"))
cek('hapus permanen membaca alasannya dari BADAN, bukan query string',
  rute.includes('PusatAksesHapusSchema.safeParse(await req.json()'))
// Teks bebas di URL berakhir di log akses Nginx dan riwayat peramban, dan yang ditulis
// di sini kadang menyebut nama orang atau sebab pemberhentiannya.
cek('…dan tidak pernah lewat searchParams', !rute.includes("p.get('alasan')"))
cek('arsip TIDAK diminta alasannya', !/mode === 'arsip'[\s\S]{0,400}PusatAksesHapusSchema/.test(rute))
cek('alasan ikut ke tiap jenis peristiwa, bukan satu baris ringkasan',
  hitung(rute, '${sebab}') + hitung(rute, ' + sebab,') >= 3)

// ── C · Sasaran ikut dicatat (P8 / T-15) ────────────────────────────────────
console.log('\nC · siapa yang dikenai')

const audit = buangKomentar(baca('lib/security/auditlog.ts'))
cek('writeAuditLog menerima targetUserId', audit.includes('targetUserId?: number;'))
cek('…dan menuliskannya ke kolomnya', audit.includes('${params.targetUserId ?? null}'))
cek('kolomnya ada di INSERT', audit.includes('user_agent, detail, target_user_id)'))

// `writeAuditLog` sengaja gagal DIAM-DIAM. Konsekuensinya: pada basis data yang kodenya
// sudah di-deploy tapi migrasinya belum jalan, SELURUH jejak audit berhenti tertulis
// tanpa satu gejala pun — bukan satu kolom, semuanya. Jalur cadangan membalik urutan
// korbannya: kolom baru yang hilang, bukan barisnya.
cek('ada jalur cadangan kalau migrasinya belum jalan', audit.includes('let kolomTargetHilangSampai = 0;'))
// Penandanya KEDALUWARSA. Versi `boolean` sekali-nyala membuat proses yang sempat
// menulis audit SEBELUM migrasinya jalan memakai jalur cadangan sampai di-restart —
// terbukti langsung saat diuji: migrasi jalan, peran diubah, barisnya tetap NULL.
cek('…dan penandanya kedaluwarsa, tidak menyala selamanya',
  audit.includes('const JEDA_COBA_LAGI_MS = 5 * 60_000;')
  && audit.includes('if (Date.now() >= kolomTargetHilangSampai) {'))
// Kutipan UTUH sampai kurung buka (L82c): tanpa baris ini, mencabut penjaganya
// (`throw e` polos) meninggalkan seluruh perancah cadangan di tempatnya dan lolos.
cek('…dan galat lain tetap dilempar, tidak ikut dianggap kolom hilang',
  audit.includes('if (!kolomBelumAda(e)) throw e;'))
cek('…jalur cadangan menulis TANPA kolom sasaran, bukan menyerah',
  hitung(audit, 'INSERT INTO audit_log (user_id, username, event_type, ip_address, user_agent, detail)') === 1)
cek('…dipicu HANYA oleh kolom yang belum ada', audit.includes("=== 'ER_BAD_FIELD_ERROR'"))
cek('…dan hanya untuk kolom itu, bukan salah ketik kolom lain',
  audit.includes("includes('target_user_id')"))
cek('…ditandai, tidak mencoba tiap penulisan',
  audit.includes('kolomTargetHilangSampai = Date.now() + JEDA_COBA_LAGI_MS;'))
cek('…dan konsolnya menyebut nama berkas migrasinya',
  audit.includes('migration-audit-target-user.sql'))

// Tiap jalur yang mengenai seseorang WAJIB menyebut sasarannya. Kalau satu tertinggal,
// garis waktunya berlubang justru di aksi yang tidak dicatat itu (L69).
const users = buangKomentar(baca('app/api/admin/users/route.ts'))
cek('jumlah jejak = jumlah yang menyebut sasaran (users)',
  hitung(users, 'writeAuditLog({') === hitung(users, 'targetUserId:'),
  `${hitung(users, 'writeAuditLog({')} jejak · ${hitung(users, 'targetUserId:')} bersasaran`)
cek('ubah-role dicatat sebagai ROLE_CHANGE, bukan USER_UPDATE',
  users.includes("eventType: 'ROLE_CHANGE'"))
cek('Pusat Akses menyebut sasaran di semua jejaknya',
  rute.includes('targetUserId: b.user_id } as const')
  && hitung(rute, 'targetUserId: id,') === 2)

// ── D · Garis waktu (P8) ────────────────────────────────────────────────────
console.log('\nD · garis waktu satu orang')

cek('disaring target_user_id, bukan LIKE di kolom detail',
  lib.includes('WHERE a.target_user_id = ${userId}') && !lib.includes("detail LIKE"))
// `audit_log.id` BIGINT: mysql2 memulangkannya sebagai BigInt, yang tidak bisa
// di-JSON-kan dan merobohkan SELURUH balasan, bukan cuma kolomnya.
cek('id BIGINT di-CAST supaya bisa di-JSON-kan', lib.includes('CAST(a.id AS UNSIGNED)'))
cek('terbaru dulu', lib.includes('ORDER BY a.created_at DESC, a.id DESC'))
cek('ada batas jumlah baris', lib.includes('LIMIT ${sqlInt(batas)}'))

// Umur retensinya BUKAN pilihan tampilan — `purge-retention` benar-benar membuangnya.
const cron = baca('app/api/cron/purge-retention/route.ts')
cek('konstanta umur garis waktu = yang benar-benar dipangkas cron',
  lib.includes('export const BULAN_GARIS_WAKTU = 12') && cron.includes('INTERVAL 12 MONTH'))

const panel = buangKomentar(baca('app/(dashboard)/admin/_panels/TabPusatAkses.tsx'))
cek('layar MENGATAKAN garis waktunya punya ujung',
  panel.includes('Jejak audit dipangkas otomatis setiap {garisBulan} bulan'))
// Layar yang diam soal itu membiarkan orang membaca "tidak ada catatan" dari
// "catatannya sudah dibuang" — kesimpulan yang salah pada pertanyaan yang paling penting.
cek('…dan angkanya datang dari server, bukan diketik di layar',
  panel.includes('if (j.bulan) setGarisBulan(j.bulan)'))
cek('kosong dibedakan dari belum dimuat', panel.includes('garis.length === 0 ? ('))
// Menyapu tabel audit tiap kali sebuah nama diklik adalah biaya yang tidak diminta.
cek('dimuat saat diminta, bukan bersama berkasnya',
  panel.includes('onClick={() => void muatGaris(u.id)}') && !panel.includes('void muatGaris(id)'))
cek('ikut disegarkan sesudah Simpan kalau sedang terbuka',
  panel.includes('if (garisTerbuka) await muatGaris(berkas.user.id)'))

// ── E · Satu dialog, dua layar (P9 di sisi orang) ───────────────────────────
console.log('\nE · dialog alasan')

const komp = buangKomentar(baca('components/admin/PilihPeran.tsx'))
// Dua kotak berurutan untuk satu tindakan membuat yang kedua terbaca sebagai gangguan
// lalu diisi seadanya — persis yang membuat kolom alasan berakhir berisi "-".
cek('alasan diminta di dialog yang SAMA dengan peringatannya',
  komp.includes('return promptDialog({') && !komp.includes('confirmDialog('))
cek('dialognya memulangkan alasannya, bukan ya/tidak',
  komp.includes('Promise<string | null>'))

const dialog = buangKomentar(baca('components/ui/ConfirmDialog.tsx'))
cek('promptDialog tinggal seberkas dengan confirmDialog', dialog.includes('export function promptDialog('))
cek('confirmDialog TIDAK ikut berubah bentuk balasannya',
  dialog.includes('export function confirmDialog(opts: ConfirmOpts): Promise<boolean>'))
// Kursornya ada di kotak isian; Enter sambil mengetik akan mengirim kalimat setengah jadi.
cek('Enter tidak menyetujui saat sedang mengetik alasan',
  !/PromptUI[\s\S]{0,900}e\.key === 'Enter'/.test(dialog))
cek('tombol lanjut mati sampai alasannya cukup', dialog.includes('disabled={!cukup}'))

const ku = buangKomentar(baca('app/(dashboard)/usulan-kebutuhan/_panels/KelolaUserPanel.tsx'))
cek('Usulan meneruskan alasannya, bukan membuangnya',
  ku.includes('doChangeRole(u.id, peranBaru, alasan)'))
cek('…dan membedakan batal dari alasan kosong', ku.includes('if (alasan === null) return;'))
cek('Pusat Akses meminta alasan juga saat cuma pintunya bergeser',
  panel.includes('} else if (grantBergeser) {'))
cek('…dan menyebut modul mana yang dibuka & ditutup',
  panel.includes('Dibuka: ${dibuka.map(nama).join') && panel.includes('Ditutup: ${ditutup.map(nama).join'))

// ── F · Migrasi ─────────────────────────────────────────────────────────────
console.log('\nF · migrasi')

const mig = baca('docs/migrations/migration-audit-target-user.sql')
cek('berkas migrasinya ada', mig.includes('ADD COLUMN target_user_id'))
// §17.3 aturan 4: berkas migrasi menuliskan kueri pemeriksaannya di kepala.
cek('kepalanya memuat kueri pemeriksaan sebelum dijalankan',
  mig.includes('information_schema.COLUMNS') && mig.includes('SHOW INDEX FROM audit_log'))

// `ON DELETE SET NULL` akan MENGHAPUS jawabannya persis pada kasus yang paling perlu
// dijawab: "akun itu dihapus, siapa yang menghapusnya dan kenapa?"
// Prosa di kepala berkas ini MENJELASKAN kenapa FK-nya tidak ada dan menyebut bentuk
// indeksnya — jadi kalimatnya menyalakan tesnya sendiri kalau ikut dipindai.
const migSql = buangKomentarSql(mig)
cek('sengaja tanpa FOREIGN KEY', !migSql.includes('FOREIGN KEY') && !migSql.includes('REFERENCES users'))
cek('indeksnya benar-benar dua kolom di DDL-nya, bukan cuma di komentarnya',
  migSql.includes('(target_user_id, created_at DESC)'))
// Kolom yang DIKOMENTARI tetap terbaca seperti masih ada kalau komentarnya tidak dibuang
// — dan `docs/schema-mysql.sql` yang menentukan bentuk basis data yang lahir baru,
// bukan riwayat migrasinya (pelajaran A6/migration-kinerja-uq-versi).
const schema = buangKomentarSql(baca('docs/schema-mysql.sql'))
cek('skema acuan ikut diperbarui (bukan cuma berkas migrasinya)',
  schema.includes('target_user_id INT') && schema.includes('idx_audit_log_target'))

console.log(`\n${lulus + gagal} pemeriksaan · ${lulus} lulus · ${gagal} gagal`)
if (gagal > 0) {
  console.log('GAGAL — Tahap 7 tidak lagi utuh.')
  process.exit(1)
}
console.log('LULUS.')
