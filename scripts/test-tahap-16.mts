#!/usr/bin/env npx tsx
// scripts/test-tahap-16.mts — penjaga regresi Tahap 16 (T6, T11, T17, T19).
// Konsep: docs/CONCEPT-perbaikan-audit-akses.md §5 Tahap 16.
//
// A & C menguji perilaku fungsi murni. C2 memanggil `simpanBerkasOrang` terhadap basis data
// pada akun uji ber-grant mubazir (kasus `tesujiakun` yang terukur saat audit), lalu
// memulihkan `app_access` aslinya. B mencocokkan petunjuk Pemeriksaan ke daftar tab yang
// SUNGGUH ada di rel Admin Panel, bukan ke daftar yang diketik ulang di sini.
//
// Jalankan: npx tsx --env-file=.env.local scripts/test-tahap-16.mts

import fs from 'node:fs'
import { hitungSuntinganPaket } from '../lib/admin/jejak-paket'
import { grantMubazirDari, grantYangBerarti } from '../lib/admin/pintu-akses'
import { grantMubazir } from '../lib/admin/pemeriksaan'

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

// ── A · Jejak paket menghitung sungguhan (T6) ───────────────────────────────
console.log('\nA · asal_paket.diubah dihitung, bukan dikarang (T6)')

const dasar = { grant: ['blud', 'iki'], menu: { blud: { dpa: 'EDIT', realisasi: 'LIHAT' } } }
cek('tanpa suntingan → 0', hitungSuntinganPaket(dasar, { grant: ['iki', 'blud'], menu: { blud: { realisasi: 'LIHAT', dpa: 'EDIT' } } }) === 0)
cek('satu pintu ditambah → 1', hitungSuntinganPaket(dasar, { ...dasar, grant: ['blud', 'iki', 'lkjip'] }) === 1)
cek('satu pintu dilepas → 1', hitungSuntinganPaket(dasar, { ...dasar, grant: ['blud'] }) === 1)
cek('satu sel izin diganti → 1', hitungSuntinganPaket(dasar, { ...dasar, menu: { blud: { dpa: 'LIHAT', realisasi: 'LIHAT' } } }) === 1)
cek('satu sel ditambah → 1', hitungSuntinganPaket(dasar, { ...dasar, menu: { blud: { ...dasar.menu.blud, cetak: 'EDIT' } } }) === 1)
cek('satu sel dilepas → 1', hitungSuntinganPaket(dasar, { ...dasar, menu: { blud: { dpa: 'EDIT' } } }) === 1)
cek('modul menu baru utuh → jumlah selnya', hitungSuntinganPaket(dasar, { ...dasar, menu: { ...dasar.menu, pk: { form: 'EDIT', program: 'LIHAT' } } }) === 2)
cek('gabungan dijumlah', hitungSuntinganPaket(dasar, { grant: ['blud'], menu: { blud: { dpa: 'LIHAT' } } }) === 3)

const pa = buangKomentar(baca('app/(dashboard)/admin/_panels/TabPusatAkses.tsx'))
cek('layar tidak lagi mengirim angka mati', !/diubah:\s*1\b/.test(pa))
cek('layar menghitung dengan fungsi yang diuji', pa.includes('diubah: hitungSuntinganPaket(asalPaket.sesudah, { grant: draGrant, menu: draMenu })'))
cek('foto sesudah paket diambil saat paket diterapkan', pa.includes('{ nama: p.nama, sesudah: { grant: grantBaru, menu: menuBaru } }'))

// ── B · Petunjuk menunjuk tab yang ada (T11) ────────────────────────────────
console.log('\nB · petunjuk Pemeriksaan menunjuk tab yang ada (T11)')

const rel = [...baca('app/(dashboard)/admin/admin-client.tsx').matchAll(/label:'([^']+)'/g)].map((m) => m[1])
const pemeriksaan = buangKomentar(baca('lib/admin/pemeriksaan.ts'))
const tindakan = [...pemeriksaan.matchAll(/tindakan:\s*'([^']*)'/g)].map((m) => m[1])
cek('rel Admin Panel terbaca', rel.includes('Pusat Akses') && rel.includes('Peran'), rel.join(' · '))
cek('tujuh petunjuk terbaca', tindakan.length === 7, String(tindakan.length))
const disebut = tindakan.flatMap((t) => [...t.matchAll(/tab ([A-Z][A-Za-z]+(?: [A-Z][A-Za-z]+)?)/g)].map((m) => m[1]))
const tabHantu = disebut.filter((n) => !rel.includes(n))
cek('setiap "tab X" ada di rel', disebut.length >= 5 && tabHantu.length === 0, tabHantu.join(', ') || `${disebut.length} rujukan`)
// Seluruh teks temuan, bukan cuma `tindakan`: "diberikan lagi lewat Atur Akses" di
// `ringkas` lolos dari pemeriksaan pertama dan baru ketahuan saat layarnya dibuka.
const NAMA_HANTU = ['tab Pengguna', 'Akses Menu', 'Atur Akses', 'User Management', 'App Control']
cek('teks temuan tidak menyebut layar yang sudah tidak ada', NAMA_HANTU.every((n) => !pemeriksaan.includes(n)),
  NAMA_HANTU.filter((n) => pemeriksaan.includes(n)).join(', '))
// RIMA menjawab "menu apa saja di Admin Panel" dari daftar ini.
const menuRima = baca('lib/sentinel/module-menus.ts').match(/case 'admin':[\s\S]*?return (\[[^\]]*\])/)?.[1] ?? '[]'
cek('RIMA menyebut tab Admin Panel yang sama dengan relnya',
  JSON.stringify(JSON.parse(menuRima.replace(/'/g, '"'))) === JSON.stringify(rel), menuRima.slice(0, 60))

// ── C · Grant mubazir punya jalan keluar (T17) ──────────────────────────────
console.log('\nC · grant mubazir: pembersihan, bukan pencabutan (T17)')

// ADMIN membuka ketiganya lewat peran — kasus `tesujiakun` yang terukur saat audit.
cek('ADMIN: tiga grant mubazir, nol yang berarti',
  grantMubazirDari('ADMIN', ['dashboard', 'blud', 'rencana_aksi']).length === 3
  && grantYangBerarti('ADMIN', ['dashboard', 'blud', 'rencana_aksi']).length === 0)
cek('PROGRAM: blud berarti, usulan (SEMUA) & kunci asing mubazir',
  grantYangBerarti('PROGRAM', ['blud', 'usulan_aset', 'entah']).join() === 'blud'
  && grantMubazirDari('PROGRAM', ['blud', 'usulan_aset', 'entah']).join() === 'entah,usulan_aset')
cek('keduanya membelah tersimpan tanpa sisa', (() => {
  const t = ['blud', 'usulan_aset', 'entah', 'iki']
  return [...grantYangBerarti('PROGRAM', t), ...grantMubazirDari('PROGRAM', t)].sort().join() === [...t].sort().join()
})())
// Pemeriksaan melaporkan dengan aturan yang sejalan: yang ia sebut mubazir juga dianggap
// mubazir oleh penyimpan. Kalau berbeda, tombol "Buka" mengantar ke layar tanpa spanduk.
cek('Pemeriksaan & penyimpan sepakat soal mubazir', grantMubazir([{ username: 'x', role: 'ADMIN', appAccess: ['dashboard', 'blud'] }])
  .every((m) => grantMubazirDari('ADMIN', ['dashboard', 'blud']).includes(m.kunci)))

const lib = buangKomentar(baca('lib/admin/pusat-akses.ts'))
cek('alasan dibandingkan dengan grant lama yang BERARTI', lib.includes('const grantLamaBerarti = grantYangBerarti(target.role, appAccessLama)')
  && lib.includes('!== [...grantLamaBerarti].sort().join(\',\')'))
cek('dicabut = hanya yang berarti', lib.includes('hasil.grantDicabut = grantLamaBerarti.filter((k) => !grantBaru.includes(k))'))
const rute = buangKomentar(baca('app/api/admin/pusat-akses/route.ts'))
cek('pembersihan dicatat BUKAN sebagai ACCESS_REVOKE', /if \(hasil\.grantDibersihkan\.length\) \{\s*await writeAuditLog\(\{\s*\.\.\.jejak, eventType: 'USER_UPDATE'/.test(rute))
cek('layar: alasan dibandingkan dengan grant berarti', pa.includes('const grantLamaBerarti = grantYangBerarti(berkas.user.role, berkas.appAccess);'))
cek('layar: ada jalan melepas centang mubazir', pa.includes('onClick={() => setDraGrant(g => g.filter(k => !mubazirDraf.includes(k)))}'))
const tp = buangKomentar(baca('app/(dashboard)/admin/_panels/TabPemeriksaan.tsx'))
cek('Pemeriksaan membuka orangnya di Pusat Akses', tp.includes('onClick={() => onKeAkses(o.id)}')
  && baca('app/(dashboard)/admin/admin-client.tsx').includes("onKeAkses={(id) => { setPilihOrang(id); setTab('pusat-akses'); }}/>"))
cek('…dan tidak menulis apa pun sendiri', !tp.includes('fetchJson') && !tp.includes("method: 'PUT'"))

if (process.env.MYSQL_DATABASE) {
  const { simpanBerkasOrang, AlasanWajibError } = await import('../lib/admin/pusat-akses')
  const { sql } = await import('../lib/data/db') as unknown as { sql: (s: TemplateStringsArray, ...v: unknown[]) => Promise<unknown[]> }
  const baris = (await sql`
    SELECT u.id, u.username, u.role, u.app_access,
           (SELECT COUNT(*) FROM akses_kedaluwarsa k WHERE k.user_id = u.id) AS jangka
    FROM users u WHERE u.deleted_at IS NULL AND u.app_access IS NOT NULL AND u.role = 'ADMIN'
    ORDER BY u.id
  `) as { id: number; username: string; role: string; app_access: unknown; jangka: number | string }[]
  const calon = baris.find((b) => Array.isArray(b.app_access) && (b.app_access as string[]).length > 0
    && grantYangBerarti(b.role, b.app_access as string[]).length === 0 && Number(b.jangka) === 0)
  if (calon) {
    const asli = calon.app_access as string[]
    try {
      let galat: unknown = null
      let hasil: Awaited<ReturnType<typeof simpanBerkasOrang>> | null = null
      try {
        // Tanpa alasan. Dulu: AlasanWajibError "pintu modul akan berubah" + ACCESS_REVOKE.
        hasil = await simpanBerkasOrang({
          userId: calon.id, role: calon.role, roleAwal: calon.role, appAccess: [], menu: {}, versi: {}, olehUserId: null,
        })
      } catch (e) { galat = e }
      cek(`${calon.username}: membersihkan grant mubazir TIDAK menuntut alasan`, !(galat instanceof AlasanWajibError) && galat === null,
        galat instanceof Error ? galat.message : '')
      cek('…tercatat sebagai pembersihan, bukan pencabutan',
        hasil !== null && hasil.grantDicabut.length === 0 && [...hasil.grantDibersihkan].sort().join() === [...asli].sort().join(),
        hasil ? `dicabut=[${hasil.grantDicabut}] dibersihkan=[${hasil.grantDibersihkan}]` : '')
      const sesudah = (await sql`SELECT app_access FROM users WHERE id = ${calon.id}`) as { app_access: unknown }[]
      cek('…dan app_access benar-benar bersih', sesudah[0]?.app_access === null)
    } finally {
      await sql`UPDATE users SET app_access = ${JSON.stringify(asli)} WHERE id = ${calon.id}`
      const pulih = (await sql`SELECT app_access FROM users WHERE id = ${calon.id}`) as { app_access: unknown }[]
      cek('…data uji dipulihkan', JSON.stringify(pulih[0]?.app_access) === JSON.stringify(asli))
    }
  } else {
    console.log('  (lewati)  tidak ada akun ADMIN dengan grant mubazir murni tanpa tenggat di basis data ini')
  }
} else {
  console.log('  (lewati)  uji basis data — jalankan dengan --env-file=.env.local')
}

// ── D · Daftar Pusat Akses tidak berbunyi kosong saat belum/gagal dimuat (T19) ─
console.log('\nD · daftar Pusat Akses: memuat / gagal / ada (T19)')

cek('tiga keadaan pemuatan', pa.includes("useState<'memuat' | 'gagal' | 'ada'>('memuat')"))
cek('gagal memuat ditandai, tidak diabaikan', pa.includes("if (j.ok && j.data) { setDaftar(j.data); setDaftarMuat('ada'); }")
  && pa.includes("else setDaftarMuat('gagal');"))
cek('"Tidak ada yang cocok" hanya saat data memang ada', pa.includes("{daftarMuat === 'ada' && daftar.length === 0 && <div className=\"ap-pa-kosong\">Tidak ada yang cocok.</div>}"))
cek('jumlah orang tidak ditulis saat belum/gagal dimuat', pa.includes("daftarMuat === 'ada' ? `${daftar.length} orang` :"))
cek('gagal memuat punya jalan mencoba lagi', pa.includes('onClick={() => void muatDaftar()}>Coba lagi</PrimaButton>'))

console.log(`\n${lulus + gagal} pemeriksaan · ${lulus} lulus · ${gagal} gagal`)
if (gagal > 0) {
  console.log('GAGAL — Tahap 16 tidak lagi utuh.')
  process.exit(1)
}
console.log('LULUS.')
process.exit(0)
