#!/usr/bin/env npx tsx
// scripts/test-tahap-15.mts — penjaga regresi Tahap 15 (T2, T5, T7, T10).
// Konsep: docs/CONCEPT-perbaikan-audit-akses.md §5 Tahap 15.
//
// A–B statis (route menyeret next/server). C memanggil `simpanBerkasOrang` SUNGGUHAN
// terhadap basis data: akun SUPER_ADMIN dengan `roleAwal` palsu harus ditolak di dalam
// transaksi sebelum satu baris pun ditulis. D menguji `tanggalSah` & skema Zod apa adanya.
//
// Jalankan: npx tsx --env-file=.env.local scripts/test-tahap-15.mts

import fs from 'node:fs'
import path from 'node:path'
import { potongHandler } from './_potong-handler.mjs'
import { jangkaYangBerarti, sisaHari, tanggalSah, tanggalSingkat } from '../lib/admin/berjangka-baris'
import { PusatAksesSimpanSchema } from '../lib/data/admin-schemas'
import { kunciSakelarUntuk, modul } from '../lib/registry/apps'
import { kunciSakelarBerkas, modulPengunggah, MODUL_PENGUNGGAH } from '../lib/security/unggahan-modul'

let lulus = 0
let gagal = 0
function cek(nama: string, syarat: boolean, catatan = '') {
  if (syarat) { lulus++; console.log(`  ok    ${nama.padEnd(72)} ${catatan}`) }
  else { gagal++; console.log(`  GAGAL ${nama.padEnd(72)} ${catatan}`) }
}
const baca = (p: string) => fs.readFileSync(p, 'utf8')
function buangKomentar(t: string): string {
  return t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/^[ \t]*\/\/.*$/gm, '')
}
function berkasDi(dir: string, akhiran: RegExp, acc: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const j = path.join(dir, e.name)
    if (e.isDirectory()) { if (e.name !== 'node_modules' && e.name !== '.next') berkasDi(j, akhiran, acc) }
    else if (akhiran.test(e.name)) acc.push(j.replace(/\\/g, '/'))
  }
  return acc
}

// ── A · Satu pintu hapus akun (T5) ───────────────────────────────────────────
console.log('\nA · DELETE /api/admin/users dibuang (T5)')

const users = buangKomentar(baca('app/api/admin/users/route.ts'))
const handlerUsers = potongHandler(users).map((h: { nama: string }) => h.nama)
cek('route users tidak lagi mengekspor DELETE', !handlerUsers.includes('DELETE'), handlerUsers.join(','))
cek('…dan GET/POST/PATCH-nya tetap ada', ['GET', 'POST', 'PATCH'].every((m) => handlerUsers.includes(m)))
const penghapus = [...berkasDi('app', /\.(ts|tsx)$/), ...berkasDi('lib', /\.(ts|tsx)$/)]
  .filter((f) => /DELETE\s+FROM\s+users\b/i.test(buangKomentar(baca(f))))
cek('`DELETE FROM users` hanya di pintu Pusat Akses',
  penghapus.length === 1 && penghapus[0] === 'app/api/admin/pusat-akses/route.ts', penghapus.join(', '))
const pusat = buangKomentar(baca('app/api/admin/pusat-akses/route.ts'))
cek('…yang mewajibkan mode', pusat.includes("if (mode !== 'arsip' && mode !== 'permanen')"))
cek('…dan alasan untuk hapus permanen', pusat.includes('PusatAksesHapusSchema.safeParse('))

// ── B · /api/upload tunduk sakelar (T2) ─────────────────────────────────────
console.log('\nB · /api/upload di bawah sakelar modul pemakainya (T2)')

const unggah = buangKomentar(baca('app/api/upload/route.ts'))
const badanPost = potongHandler(unggah).find((h: { nama: string }) => h.nama === 'POST')?.badan ?? ''
const iMati = badanPost.indexOf('const mati = await modulMati(')
const iFile = badanPost.indexOf("formData.get('file')")
cek('POST memanggil modulMati', iMati >= 0)
cek('…SEBELUM file dibaca', iMati >= 0 && iFile >= 0 && iMati < iFile)
cek('…dengan peran (SUPER_ADMIN tetap menembus)', badanPost.includes('{ role: session.role })'))
cek('…dan hasilnya dipulangkan', badanPost.includes('if (mati) return mati;'))
cek('…memakai daftar modul bersama (unggah & unduh satu jawaban)',
  badanPost.includes('modulMati(kunciSakelarBerkas(modulAsal)') && !unggah.includes('const MODUL_PENGUNGGAH'))
const semuaKunciPengunggah = [...new Set(MODUL_PENGUNGGAH.flatMap((m) => kunciSakelarUntuk(m)))]
const samaHimpunan = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x))
cek('modul tak disebut → semua sakelar pemakai ditanya',
  samaHimpunan(kunciSakelarBerkas(null), semuaKunciPengunggah) && semuaKunciPengunggah.length >= 2,
  kunciSakelarBerkas(null).join(','))
cek('modul disebut → hanya sakelarnya sendiri',
  samaHimpunan(kunciSakelarBerkas('lkjip'), kunciSakelarUntuk('lkjip'))
  && !kunciSakelarBerkas('lkjip').some((k) => kunciSakelarUntuk('usulan_aset').includes(k)))
cek('nilai karangan tidak dikenali sebagai modul', modulPengunggah('blud') === null && modulPengunggah("lkjip' OR 1") === null)
const daftarPengunggah: string[] = [...MODUL_PENGUNGGAH]
cek('tiap modul pengunggah bersakelar di registry',
  daftarPengunggah.length > 0 && daftarPengunggah.every((k) => Boolean(modul(k)?.sakelar)), daftarPengunggah.join(','))

// Tiap pemanggil yang mengirim POST ke /api/upload menyebut modulnya — dan modul itu
// terdaftar. Pemanggil baru yang lupa jatuh ke cabang "tanya semua sakelar", yang aman
// tapi membuatnya ikut mati saat modul LAIN dibekukan.
const pemanggil = [...berkasDi('app', /\.tsx?$/), ...berkasDi('components', /\.tsx?$/)]
  .filter((f) => !f.startsWith('app/api/'))
  .map((f) => [f, buangKomentar(baca(f))] as const)
  .filter(([, t]) => /['"`]\/api\/upload['"`]/.test(t))
for (const [f, t] of pemanggil) {
  const kirim = (t.match(/['"`]\/api\/upload['"`]\s*,\s*\{\s*method:\s*'POST'/g) ?? []).length
  const disebut = [...t.matchAll(/append\('modul',\s*'([a-z_]+)'\)/g)].map((m) => m[1])
  cek(`${f.replace('app/(dashboard)/', '')}: ${kirim} unggahan menyebut modulnya`,
    kirim > 0 && disebut.length === kirim && disebut.every((m) => daftarPengunggah.includes(m)), disebut.join(','))
}

// ── B2 · /api/upload/download ikut sakelar (pertanyaan akhir nomor 5) ───────
console.log('\nB2 · /api/upload/download ikut sakelar modul pemilik berkas')

cek('unggahan mencatat modul pemilik dari daftar, bukan field bebas klien',
  badanPost.includes('const context = modulAsal;') && !badanPost.includes("formData.get('context')"))
const unduh = buangKomentar(baca('app/api/upload/download/route.ts'))
const badanGet = potongHandler(unduh).find((h: { nama: string }) => h.nama === 'GET')?.badan ?? ''
const iMatiUnduh = badanGet.indexOf('const mati = await modulMati(kunciSakelarBerkas(modulPengunggah(owner?.context)), { role: session.role });')
const iPilihBaris = badanGet.indexOf('f.context')
const iTolakPemilik = badanGet.indexOf('if (!isAdminTier)')
const iDrive = badanGet.indexOf('getDriveClient()')
cek('GET membaca context berkas', iPilihBaris >= 0)
cek('…lalu memanggil modulMati dengan modul berkas & peran', iMatiUnduh > iPilihBaris)
cek('…dan hasilnya dipulangkan', badanGet.slice(iMatiUnduh, iMatiUnduh + 200).includes('if (mati) return mati;'))
cek('…sebelum pemeriksaan pemilik', iMatiUnduh >= 0 && iTolakPemilik > iMatiUnduh)
cek('…dan sebelum Drive disentuh', iMatiUnduh >= 0 && iDrive > iMatiUnduh)

const mig = baca('docs/migrations/migration-uploaded-files-modul.sql').replace(/^\s*--.*$/gm, '')
cek('migrasi mengisi baris lama untuk kedua modul pengunggah',
  MODUL_PENGUNGGAH.every((m) => mig.includes(`SET f.context = '${m}'`)))
cek('…hanya baris yang masih kosong (aman diulang)', (mig.match(/WHERE f\.context IS NULL/g) ?? []).length === MODUL_PENGUNGGAH.length)
cek('…dengan collation eksplisit (uploaded_files 0900_ai_ci vs usulan_items unicode_ci)',
  (mig.match(/COLLATE utf8mb4_unicode_ci/g) ?? []).length >= 3)
cek('…kunci payload LKJIP sama dengan yang ditulis editor',
  mig.includes("'$.fileId'") && mig.includes("'$.imageFileId'")
  && baca('app/(dashboard)/lkjip/[id]/editor-client.tsx').includes("payload: { judul: '', fileId: json.fileId, caption: '' }")
  && baca('lib/lkjip/schemas.ts').includes("imageFileId: z.string()"))

// ── C · Lantai SUPER_ADMIN dari baris terkunci (T7) ─────────────────────────
console.log('\nC · lantai SUPER_ADMIN di dalam transaksi (T7)')

const lib = buangKomentar(baca('lib/admin/pusat-akses.ts'))
const iLantai = lib.indexOf("if (target.role === 'SUPER_ADMIN') throw new LantaiSuperAdminError()")
const iBasi = lib.indexOf('if (target.role !== p.roleAwal) throw new PeranBerubahError()')
cek('lantai dibaca dari baris FOR UPDATE', iLantai >= 0 && lib.includes('SELECT role, username, app_access FROM users WHERE id = ${p.userId} FOR UPDATE'))
cek('…sebelum pemeriksaan layar basi (tak bergantung roleAwal)', iLantai >= 0 && iBasi >= 0 && iLantai < iBasi)
cek('route tidak lagi memutuskan dari role_awal', !pusat.includes("b.role_awal === 'SUPER_ADMIN'"))
cek('route menjawab 403 berkode', pusat.includes("if (e instanceof LantaiSuperAdminError) return tolak(e.message, 403, { code: 'LANTAI_SUPER_ADMIN' })"))

if (process.env.MYSQL_DATABASE) {
  const { simpanBerkasOrang, LantaiSuperAdminError } = await import('../lib/admin/pusat-akses')
  const { sql, pool } = await import('../lib/data/db') as unknown as {
    sql: (s: TemplateStringsArray, ...v: unknown[]) => Promise<unknown[]>; pool?: { end: () => Promise<void> }
  }
  const sa = (await sql`SELECT id, role, app_access FROM users WHERE role = 'SUPER_ADMIN' AND deleted_at IS NULL ORDER BY id LIMIT 1`) as
    { id: number; role: string; app_access: unknown }[]
  if (sa[0]) {
    const sebelum = JSON.stringify(sa[0].app_access)
    let galat: unknown = null
    try {
      // `roleAwal` DIPALSUKAN — dulu satu-satunya yang diperiksa lantai di route.
      await simpanBerkasOrang({
        userId: sa[0].id, role: 'PROGRAM', roleAwal: 'PROGRAM', appAccess: ['blud'], menu: {}, versi: {},
        alasan: 'uji tahap 15 — harus ditolak', olehUserId: null,
      })
    } catch (e) { galat = e }
    const sesudah = (await sql`SELECT role, app_access FROM users WHERE id = ${sa[0].id}`) as { role: string; app_access: unknown }[]
    cek('SUPER_ADMIN + roleAwal palsu ditolak LantaiSuperAdminError', galat instanceof LantaiSuperAdminError,
      galat instanceof Error ? galat.name : String(galat))
    cek('…dan tidak ada yang tertulis', sesudah[0]?.role === 'SUPER_ADMIN' && JSON.stringify(sesudah[0]?.app_access) === sebelum)
  } else {
    cek('ada akun SUPER_ADMIN untuk diuji', false, 'basis data tanpa SUPER_ADMIN')
  }
  await pool?.end?.().catch(() => {})
} else {
  console.log('  (lewati)  uji basis data — jalankan dengan --env-file=.env.local')
}

// ── D · Tanggal berjangka sungguhan (T10) ───────────────────────────────────
console.log('\nD · tanggal berjangka divalidasi sungguhan (T10)')

for (const t of ['2026-09-30', '2028-02-29', '2026-12-31']) cek(`tanggal sah: ${t}`, tanggalSah(t))
for (const t of ['2026-13-45', '2026-02-31', '2027-02-29', '2026-04-31', '0000-00-00', '2026-9-30', 'besok', '']) {
  cek(`tanggal ditolak: ${t || '(kosong)'}`, !tanggalSah(t))
}
const dasar = { user_id: 5, role: 'PROGRAM', role_awal: 'PROGRAM', app_access: ['blud'] }
cek('Zod menolak 2026-13-45',
  !PusatAksesSimpanSchema.safeParse({ ...dasar, berjangka: { blud: { berakhir: '2026-13-45', alasan: 'uji coba' } } }).success)
cek('Zod menolak 2026-02-31',
  !PusatAksesSimpanSchema.safeParse({ ...dasar, berjangka: { blud: { berakhir: '2026-02-31', alasan: 'uji coba' } } }).success)
cek('Zod menerima tanggal sah',
  PusatAksesSimpanSchema.safeParse({ ...dasar, berjangka: { blud: { berakhir: '2026-10-31', alasan: 'uji coba' } } }).success)
cek('layar tidak menampilkan tanggal karangan', tanggalSingkat('2026-13-45') === '' && tanggalSingkat('2026-10-31') === '31 Okt 2026')
cek('sisa hari tanggal karangan = tidak diketahui', sisaHari('2026-02-31', '2026-02-01') === null)
cek('tenggat bertanggal karangan tidak ikut disimpan',
  jangkaYangBerarti(['blud'], { blud: { berakhir: '2026-13-45', alasan: 'uji coba' } }).length === 0)

console.log(`\n${lulus + gagal} pemeriksaan · ${lulus} lulus · ${gagal} gagal`)
if (gagal > 0) {
  console.log('GAGAL — Tahap 15 tidak lagi utuh.')
  process.exit(1)
}
console.log('LULUS.')
process.exit(0)
