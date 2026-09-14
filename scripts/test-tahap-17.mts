#!/usr/bin/env npx tsx
// scripts/test-tahap-17.mts — penjaga regresi Tahap 17 (T9 + K2, T15).
// Konsep: docs/CONCEPT-perbaikan-audit-akses.md §5 Tahap 17.
//
// A–B menguji perilaku penolong registry yang dipakai `/maintenance` DAN halaman login.
// Sisanya statis: halaman login tidak boleh mendapat endpoint publik baru, font eksternal
// yang diblokir CSP tidak boleh kembali, dan seed `app_config` harus sama dengan registry.
//
// Jalankan: npx tsx scripts/test-tahap-17.mts

import fs from 'node:fs'
import path from 'node:path'
import {
  daftarPemeliharaanDari, keteranganSakelar, KUNCI_GLOBAL, KUNCI_SAKELAR, LABEL_GLOBAL,
} from '../lib/registry/apps'

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

const B = 'app_status_blud'
const R = 'app_status_blud_realisasi'

// ── A · keteranganSakelar: nama & kalimat dari PENYEBAB ─────────────────────
console.log('\nA · keteranganSakelar (penyebab, bukan kunci yang ditanyakan)')

{
  const k = keteranganSakelar({}, [B, R])
  cek('semua online → online, tanpa nama', k.keadaan === 'online' && k.kunci === null && k.label === '')
}
{
  const k = keteranganSakelar({ [B]: 'maintenance', [`${B}_pesan`]: 'Rekonsiliasi DPA', [`${R}_pesan`]: 'kalimat sub' }, [B, R])
  // Dulu /maintenance?m=app_status_blud_realisasi berbunyi "BLUD — Realisasi" + kalimat sub.
  cek('induk mati → nama & kalimat INDUK', k.keadaan === 'maintenance' && k.label === 'BLUD' && k.pesan === 'Rekonsiliasi DPA', `${k.label} · ${k.pesan}`)
}
{
  const k = keteranganSakelar({ [R]: 'maintenance', [`${R}_pesan`]: 'Tutup buku Juni', [`${R}_sampai`]: '2026-09-20T14:30' }, [B, R])
  cek('sub mati → nama & kalimat SUB', k.label === 'BLUD — Realisasi' && k.pesan === 'Tutup buku Juni' && k.sampai === '20 September 2026, 14.30 WIB', k.sampai)
}
{
  const k = keteranganSakelar({ [KUNCI_GLOBAL]: 'maintenance', [`${KUNCI_GLOBAL}_pesan`]: 'Migrasi server', [B]: 'maintenance' }, [B])
  cek('global mati → disebut global, walau modulnya juga mati', k.global && k.label === LABEL_GLOBAL && k.pesan === 'Migrasi server')
}
cek('beku terbaca beku, bukan maintenance', keteranganSakelar({ [B]: 'readonly' }, [B]).keadaan === 'readonly')

// ── B · daftar untuk halaman login (K2) ─────────────────────────────────────
console.log('\nB · daftarPemeliharaanDari — yang diumumkan sebelum login (K2)')

const label = (d: ReturnType<typeof daftarPemeliharaanDari>) => d.map((x) => x.label).join(' | ')
cek('tidak ada yang mati → kosong', daftarPemeliharaanDari({}).length === 0)
cek('BEKU tidak diumumkan (modul beku masih bisa dibuka)',
  label(daftarPemeliharaanDari({ app_status_dashboard: 'maintenance', app_status_iki: 'readonly' })) === 'Dashboard')
cek('induk mati disebut SEKALI (lingkup Realisasi tidak menggandakannya)',
  label(daftarPemeliharaanDari({ [B]: 'maintenance' })) === 'BLUD')
cek('sub mati sendirian disebut dengan namanya', label(daftarPemeliharaanDari({ [R]: 'maintenance' })) === 'BLUD — Realisasi')
cek('global mati → hanya global, bukan sepuluh modul',
  (() => { const d = daftarPemeliharaanDari({ [KUNCI_GLOBAL]: 'maintenance', app_status_dashboard: 'maintenance' }); return d.length === 1 && d[0].global })())
cek('sakelar fitur (RIMA) bukan modul, tidak diumumkan', daftarPemeliharaanDari({ app_status_rima_query: 'maintenance' }).length === 0)
cek('dua modul mati → dua baris', daftarPemeliharaanDari({ app_status_dashboard: 'maintenance', app_status_lkjip: 'maintenance' }).length === 2)
cek('/maintenance memakai penolong yang sama',
  buangKomentar(baca('app/maintenance/page.tsx')).includes('keteranganSakelar(Object.fromEntries(rows.map((r) => [r.key, r.value])), lingkup)'))

// ── C · Halaman login tanpa endpoint publik baru ────────────────────────────
console.log('\nC · halaman login: server component + formulir klien (T9, K2)')

const halaman = buangKomentar(baca('app/(auth)/login/page.tsx'))
const formulir = buangKomentar(baca('app/(auth)/login/login-form.tsx'))
const pembaca = buangKomentar(baca('lib/security/pemeliharaan.ts'))
cek('page.tsx server component', !halaman.includes("'use client'") && halaman.includes('await pemberitahuanPemeliharaan()'))
cek('…mengoper daftarnya sebagai prop', halaman.includes('<LoginForm pemeliharaan={pemeliharaan} />'))
cek('formulir tetap komponen klien bertipe tanpa impor nilai server',
  formulir.startsWith("'use client'") && formulir.includes("import type { Pemberitahuan } from '@/lib/security/pemeliharaan'")
  && !/import \{[^}]*\} from '@\/lib\/security\/pemeliharaan'/.test(formulir))
cek('formulir tidak menembak endpoint status apa pun', !formulir.includes('/api/admin/app-status') && !formulir.includes('app_config'))
cek('pembaca memakai aturan registry', pembaca.includes('daftarPemeliharaanDari(Object.fromEntries('))
cek('gagal membaca DB → tanpa pemberitahuan, login tetap jalan', /catch\s*\{\s*return \[\]\s*\}/.test(pembaca))
cek('yang dikirim ke peramban hanya teks untuk pemakai',
  pembaca.includes('.map((k) => ({ label: k.label, pesan: k.pesan, sampai: k.sampai, global: k.global }))'))
cek('login tetap bisa (tidak ada yang mematikan formulir karena pemeliharaan)',
  !/disabled=\{[^}]*pemeliharaan/.test(formulir))
// Daftar persis per 2026-09-14. K2 dikerjakan TANPA route publik baru; kalau daftar ini
// berubah, pemeriksaan ini sengaja gagal supaya penambahannya diputuskan, bukan menyelinap.
const RUTE_PUBLIK = ['/login', '/api/auth/login', '/api/auth/register', '/api/auth/forgot-password',
  '/api/auth/reset-password', '/api/auth/resend-verification', '/api/auth/verify-email', '/api/cron/',
  '/reset-password', '/verify-email', '/maintenance']
const rutePublikKini = [...(buangKomentar(baca('proxy.ts')).match(/const PUBLIC_ROUTES = \[([\s\S]*?)\]/)?.[1] ?? '')
  .matchAll(/'([^']+)'/g)].map((m) => m[1])
cek('route publik tidak bertambah', rutePublikKini.join() === RUTE_PUBLIK.join(), rutePublikKini.filter((r) => !RUTE_PUBLIK.includes(r)).join(', '))
cek('layar Sakelar memberi tahu keterangannya terbaca sebelum login',
  buangKomentar(baca('app/(dashboard)/admin/_panels/TabAppControl.tsx')).includes('juga tampil di halaman login'))

// ── D · Font eksternal yang diblokir CSP sendiri (T9) ───────────────────────
console.log('\nD · tidak ada font eksternal yang diblokir CSP')

const pakaiFontLuar = [...berkasDi('app', /\.(tsx?|css)$/), ...berkasDi('components', /\.(tsx?|css)$/)]
  .filter((f) => /fonts\.googleapis\.com|fonts\.gstatic\.com/.test(buangKomentar(baca(f))))
cek('nol @import Google Fonts di app/ & components/', pakaiFontLuar.length === 0, pakaiFontLuar.join(', '))
cek('CSP memang tidak mengizinkannya (alasan pemeriksaan di atas)', baca('proxy.ts').includes("\"style-src 'self' 'unsafe-inline'\""))
for (const f of ['app/error.tsx', 'app/not-found.tsx', 'app/maintenance/page.tsx']) {
  cek(`${f} tidak lagi meminta Exo 2 / Share Tech Mono`, !/Exo 2|Share Tech Mono/.test(buangKomentar(baca(f))))
}

// ── E · Seed app_config = registry (T15) ────────────────────────────────────
console.log('\nE · seed sakelar sama dengan registry (T15)')

const skema = baca('docs/schema-mysql.sql')
const blokSeed = skema.match(/INSERT IGNORE INTO app_config \(`key`, value\) VALUES([\s\S]*?);/)?.[1] ?? ''
const diseed = [...blokSeed.matchAll(/\('(app_status_[a-z_]+)'/g)].map((m) => m[1]).sort()
const registry = [...KUNCI_SAKELAR].sort()
cek('seed memuat app_status_global', diseed.includes(KUNCI_GLOBAL))
cek('seed = KUNCI_SAKELAR, tanpa kurang tanpa lebih', diseed.join() === registry.join(),
  `kurang: ${registry.filter((k) => !diseed.includes(k)).join(',') || '-'} · lebih: ${diseed.filter((k) => !registry.includes(k)).join(',') || '-'}`)
const mig = baca('docs/migrations/migration-seed-sakelar-lengkap.sql')
cek('migrasi pelengkap aman diulang (INSERT IGNORE, tak menimpa)', mig.includes('INSERT IGNORE INTO app_config') && !/ON DUPLICATE KEY UPDATE/i.test(mig))

// ── F · Panduan pemasangan ──────────────────────────────────────────────────
console.log('\nF · panduan pemasangan')

const panduan = baca('docs/PANDUAN-pemasangan-windows.md')
cek('menyebut cek-tahap-0.mjs', panduan.includes('node scripts/cek-tahap-0.mjs'))
cek('menyebut sql_mode strict', panduan.includes('STRICT_TRANS_TABLES') && panduan.includes('NO_ZERO_DATE'))
cek('menyebut kedua migrasi fase ini', panduan.includes('migration-hapus-sakelar-yatim.sql') && panduan.includes('migration-seed-sakelar-lengkap.sql'))

console.log(`\n${lulus + gagal} pemeriksaan · ${lulus} lulus · ${gagal} gagal`)
if (gagal > 0) {
  console.log('GAGAL — Tahap 17 tidak lagi utuh.')
  process.exit(1)
}
console.log('LULUS.')
