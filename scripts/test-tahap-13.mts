#!/usr/bin/env npx tsx
// scripts/test-tahap-13.mts — penjaga regresi Tahap 13 (T3 + T18).
// Konsep: docs/CONCEPT-perbaikan-audit-akses.md §5 Tahap 13.
//
// A dan C menguji PERILAKU: `fetchJson` dijalankan terhadap `fetch` palsu, dan keadaan
// kartu /menu dihitung lewat fungsi yang sama dengan yang dipakai layarnya. B dan D
// statis — `guard.ts` menyeret mysql2 + `next/headers`, `menu-client.tsx` itu komponen.
//
// Aturan asersi sama dengan Tahap 4–12: kutip utuh (L82c), buang komentar sebelum
// asersi "tidak boleh ada lagi", jangan menghitung "seharusnya" dengan rumus yang diuji.
//
// Jalankan: npx tsx scripts/test-tahap-13.mts

import fs from 'node:fs'
import { fetchJson, pesanDari } from '../lib/shared/api'
import { KUNCI_GLOBAL } from '../lib/registry/apps'
import { kartuTerkunci, sakelarKartu } from '../app/(dashboard)/menu/_kartu-sakelar'

let lulus = 0
let gagal = 0

function cek(nama: string, syarat: boolean, catatan = '') {
  if (syarat) { lulus++; console.log(`  ok    ${nama.padEnd(70)} ${catatan}`) }
  else { gagal++; console.log(`  GAGAL ${nama.padEnd(70)} ${catatan}`) }
}

const baca = (p: string) => fs.readFileSync(p, 'utf8')
function buangKomentar(t: string): string {
  return t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/^[ \t]*\/\/.*$/gm, '')
}
const hitung = (t: string, s: string) => t.split(s).length - 1

function palsukanFetch(status: number, badan: string, contentType = 'application/json') {
  globalThis.fetch = (async () =>
    new Response(badan, { status, headers: { 'Content-Type': contentType } })) as typeof fetch
}

// ── A · fetchJson membaca kalimat dari laci mana pun ─────────────────────────
console.log('\nA · lib/shared/api.ts — T3')

const KALIMAT = 'Modul ini sedang dimatikan admin untuk pemeliharaan.'

palsukanFetch(503, JSON.stringify({ ok: false, code: 'MODUL_MATI', error: KALIMAT }))
{
  const d = await fetchJson('/x')
  cek('kalimat di laci `error` sampai (bentuk balasan sakelar lama)', !d.ok && d.message === KALIMAT, d.ok ? '' : d.message)
  cek('kode balasan ikut diteruskan', !d.ok && d.code === 'MODUL_MATI')
  cek('status ikut diteruskan', !d.ok && d.status === 503)
}

palsukanFetch(503, JSON.stringify({ ok: false, msg: KALIMAT }))
{
  const d = await fetchJson('/x')
  cek('kalimat di laci `msg` (LKJIP) sampai', !d.ok && d.message === KALIMAT)
}

palsukanFetch(400, JSON.stringify({ ok: false, message: 'dari message', error: 'dari error' }))
{
  const d = await fetchJson('/x')
  // Pemanggil lama selalu mendapat `message`; laci lain hanya cadangan.
  cek('`message` tetap didahulukan', !d.ok && d.message === 'dari message')
  cek('balasan tanpa kode tidak mengarang kode', !d.ok && d.code === undefined)
}

palsukanFetch(503, JSON.stringify({ ok: false, message: '   ', error: KALIMAT }))
{
  const d = await fetchJson('/x')
  cek('laci berisi spasi saja dilewati', !d.ok && d.message === KALIMAT)
}

palsukanFetch(503, JSON.stringify({ ok: false }))
{
  const d = await fetchJson('/x')
  cek('tanpa kalimat sama sekali jatuh ke status HTTP', !d.ok && d.message.startsWith('HTTP 503'))
}

palsukanFetch(502, '<html>bad gateway</html>', 'text/html')
{
  const d = await fetchJson('/x')
  cek('badan bukan JSON tetap dijawab kalimat umum', !d.ok && d.message.includes('Server bermasalah (502)'))
}

cek('pesanDari: laci bukan string diabaikan', pesanDari({ message: 42, error: KALIMAT }) === KALIMAT)

// ── B · Balasan sakelar mengisi ketiga laci ──────────────────────────────────
console.log('\nB · lib/security/guard.ts — T3')

const guard = buangKomentar(baca('lib/security/guard.ts'))
const baris = guard.match(/const balasSakelar = [^\n]*\n[^\n]*\n/)?.[0] ?? ''
cek('balasSakelar ada', baris.length > 0)
for (const laci of ['error: pesan', 'message: pesan', 'msg: pesan']) {
  cek(`balasSakelar mengisi \`${laci.split(':')[0]}\``, baris.includes(laci))
}
cek('balasan mati lewat balasSakelar', guard.includes("const tolakMati = (pesan: string) => balasSakelar('MODUL_MATI', pesan);"))
cek('balasan beku lewat balasSakelar', /const tolakBeku = \(\) =>\s*balasSakelar\(\s*'MODUL_BACA_SAJA',/.test(guard))
// Satu balasan 503 yang dibangun di luar penolongnya = satu laci yang kembali kosong.
cek('tidak ada lagi balasan sakelar yang dirakit sendiri', hitung(guard, 'NextResponse.json(') === 1)

// ── C · Keadaan kartu /menu ──────────────────────────────────────────────────
console.log('\nC · app/(dashboard)/menu/_kartu-sakelar.ts — T18')

const MAINT = { app_status_dashboard: 'maintenance', app_status_blud: 'readonly' }

cek('status belum dimuat: kartu MEMUAT, bukan online',
  sakelarKartu({ muat: 'memuat' }, 'dashboard').keadaan === 'memuat')
// Inti T18: dulu kegagalan meninggalkan `{}` dan kartu maintenance berbunyi LIVE.
cek('status gagal dimuat: kartu TAK TERBACA, bukan online',
  sakelarKartu({ muat: 'gagal' }, 'dashboard').keadaan === 'tak-terbaca')
cek('status gagal: tak satu kartu modul pun dijawab online',
  ['dashboard', 'blud', 'iki', 'lkjip'].every((id) => sakelarKartu({ muat: 'gagal' }, id).keadaan !== 'online'))
cek('status ada: maintenance dibaca maintenance',
  sakelarKartu({ muat: 'ada', data: MAINT }, 'dashboard').keadaan === 'maintenance')
cek('status ada: beku dibaca readonly',
  sakelarKartu({ muat: 'ada', data: MAINT }, 'blud').keadaan === 'readonly')
cek('status ada tanpa baris: online (modul baru bukan modul mati)',
  sakelarKartu({ muat: 'ada', data: {} }, 'iki').keadaan === 'online')
{
  const s = sakelarKartu({ muat: 'ada', data: { [KUNCI_GLOBAL]: 'maintenance' } }, 'iki')
  cek('sakelar global menutup kartu dan disebut sebagai penyebabnya',
    s.keadaan === 'maintenance' && s.kunci === KUNCI_GLOBAL)
}
// Admin Panel adalah tempat menyalakan kembali yang lain.
cek('Admin Panel tetap online walau status gagal dimuat',
  sakelarKartu({ muat: 'gagal' }, 'admin').keadaan === 'online')
cek('Admin Panel tetap online walau global maintenance',
  sakelarKartu({ muat: 'ada', data: { [KUNCI_GLOBAL]: 'maintenance' } }, 'admin').keadaan === 'online')

cek('akses ada: modul di luar daftar terkunci',
  kartuTerkunci({ muat: 'ada', akses: ['blud'] }, 'dashboard') === true)
cek('akses ada: modul di daftar terbuka',
  kartuTerkunci({ muat: 'ada', akses: ['blud'] }, 'blud') === false)
cek('akses null (SUPER_ADMIN/ADMIN): semua terbuka',
  kartuTerkunci({ muat: 'ada', akses: null }, 'dashboard') === false)
cek('Admin Panel tidak pernah terkunci', kartuTerkunci({ muat: 'ada', akses: [] }, 'admin') === false)
// Tak diketahui ≠ terkunci: menandai semua kartu terkunci menyuruh orang meminta akses
// yang sudah ia punya. Spanduk gagal-muat yang mengatakan keadaannya.
cek('akses gagal dimuat: kartu tidak dikarang terkunci',
  kartuTerkunci({ muat: 'gagal' }, 'dashboard') === false && kartuTerkunci({ muat: 'memuat' }, 'blud') === false)

// ── D · Layar /menu memakai keduanya, terpisah ───────────────────────────────
console.log('\nD · app/(dashboard)/menu/menu-client.tsx — T18')

const menu = buangKomentar(baca('app/(dashboard)/menu/menu-client.tsx'))
cek('tidak ada lagi Promise.all yang menggabungkan pemuatan', !menu.includes('Promise.all('))
cek('tidak ada lagi kegagalan yang ditelan diam-diam', !menu.includes('.catch(() => {})'))
cek('status sakelar dimuat sendiri', menu.includes('useEffect(() => { void muatSakelar(); }, [muatSakelar]);'))
cek('akses dimuat sendiri', menu.includes('useEffect(() => { void muatAkses(); }, [muatAkses]);'))
cek('gagal memuat status menyetel keadaan gagal',
  menu.includes("if (!d.ok || !d.data) { setSakelar({ muat: 'gagal' }); return; }"))
cek('gagal memuat akses menyetel keadaan gagal', menu.includes("else setAkses({ muat: 'gagal' });"))
cek('kartu dihitung lewat berkas daun', menu.includes('const st        = sakelarKartu(sakelar, card.id);'))
cek('kunci kartu dihitung lewat berkas daun', menu.includes('const locked    = kartuTerkunci(akses, card.id);'))
cek('tidak ada lagi salinan rumus kartu di komponen', !menu.includes('function sakelarKartu(') && !menu.includes('function isLocked('))
// Kalau dua keadaan baru jatuh ke `card.badge`, kartunya kembali berbunyi LIVE.
cek('lencana keadaan tak diketahui tidak jatuh ke LIVE',
  /memuat \? 'MEMUAT' : takTerbaca \? 'BELUM TERBACA'\s*: bagian\.length \? [^\n]* : card\.badge;/.test(menu))
cek('orang diberi tahu dan diberi jalan mencoba lagi',
  menu.includes("(sakelar.muat === 'gagal' || akses.muat === 'gagal') && (")
  && menu.includes('if (sakelar.muat === \'gagal\') void muatSakelar();')
  && menu.includes('if (akses.muat === \'gagal\') void muatAkses();'))
const gaya = menu.slice(menu.indexOf('<style>{`') + 9, menu.indexOf('`}</style>'))
cek('tidak ada backtick di dalam blok gaya', !gaya.includes('`'))

console.log(`\n${lulus + gagal} pemeriksaan · ${lulus} lulus · ${gagal} gagal`)
if (gagal > 0) {
  console.log('GAGAL — Tahap 13 tidak lagi utuh.')
  process.exit(1)
}
console.log('LULUS.')
