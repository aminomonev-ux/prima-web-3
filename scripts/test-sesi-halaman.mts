#!/usr/bin/env npx tsx
// scripts/test-sesi-halaman.mts — sesi yang ditolak tidak membuka halaman dan tidak jadi 500.
//
// Laporan 2026-11-04: membuka /admin dengan cookie yang `lastActive`-nya lewat 60 menit memulangkan
// 500 "Cookies can only be modified in a Server Action or Route Handler" — getSession menghapus
// cookie dari server component. Sementara layout dashboard, /menu, dan BLUD (yang hanya membaca
// x-user-* dari proxy) justru TERBUKA dengan cookie diam itu — dan dengan sesi yang sudah dicabut.
//
// A. proxy() SUNGGUHAN dengan token bertanda tangan — batasnya diturunkan dari lib/constants, jadi
//    angka salinan di proxy yang bergeser ikut tertangkap.
// B. getSession: setiap penghapusan cookie lewat penolong yang aman di server component.
// C. pastikanSesiHalaman (sesi dicabut / NONAKTIF / dikeluarkan pemeliharaan) dan layout dashboard.
// D. tiap halaman & layout server memanggilnya — layout bersama tidak dirender ulang saat berpindah
//    halaman di tab yang sudah terbuka, jadi pemeriksaan di layout saja meninggalkan celah.
//
// Jalankan: npx tsx scripts/test-sesi-halaman.mts
import { readFileSync, readdirSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { SignJWT } from 'jose'
import { NextRequest } from 'next/server'
import { SESSION_INACTIVE_MINUTES, SESSION_ABSOLUTE_LIFETIME_HOURS } from '../lib/constants'

let lulus = 0
const gagal: string[] = []
function ok(nama: string, syarat: unknown, ket = '') {
  if (syarat) { lulus++; console.log(`  ok  ${nama}`) }
  else { gagal.push(nama); console.log(`FAIL  ${nama}${ket ? ' — ' + ket : ''}`) }
}
const sumber = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
const tanpaKomentar = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
const badan = (isi: string, awal: string) => { const i = isi.indexOf(awal); return i < 0 ? '' : isi.slice(i, isi.indexOf('\n}\n', i)) }

// Rahasia uji sendiri, bukan milik .env.local — proxy membacanya saat modulnya dimuat.
process.env.JWT_SECRET = randomBytes(32).toString('base64')
const RAHASIA = new TextEncoder().encode(process.env.JWT_SECRET)
const { proxy } = await import('../proxy')

const MENIT = 60 * 1000
const sekarangDetik = () => Math.floor(Date.now() / 1000)
async function token(opsi: { diamMenit?: number | null; umurDetik?: number; rahasia?: Uint8Array } = {}) {
  const { diamMenit = 0, umurDetik = 3600, rahasia = RAHASIA } = opsi
  return new SignJWT({
    userId: 1, username: 'uji', role: 'SUPER_ADMIN', email: '', sessionId: 'uji-sesi',
    ...(diamMenit === null ? {} : { lastActive: Date.now() - diamMenit * MENIT }),
    originalIat: sekarangDetik() - umurDetik,
  }).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('8h').sign(rahasia)
}
async function minta(jalur: string, t: string) {
  const res = await proxy(new NextRequest(`http://localhost:3000${jalur}`, { headers: { cookie: `prima_session=${t}` } }))
  const lokasi = res.headers.get('location')
  const sc = res.headers.get('set-cookie') ?? ''
  return {
    status: res.status,
    lanjut: res.headers.get('x-middleware-next') === '1',
    lokasi: lokasi ? new URL(lokasi).pathname + new URL(lokasi).search : null,
    cookieDihapus: /^prima_session=;/.test(sc) && /expires=thu, 01 jan 1970|max-age=0/i.test(sc),
    cookieDisentuh: sc.includes('prima_session='),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('A. proxy menolak halaman yang diam')
const batas = SESSION_INACTIVE_MINUTES
{
  const r = await minta('/admin', await token({ diamMenit: 120 }))
  ok('A1 /admin diam 2 jam → /login?reason=expired + cookie dihapus (bukan 500, bukan ke /menu)',
    r.status === 307 && r.lokasi === '/login?reason=expired' && r.cookieDihapus, JSON.stringify(r))
}
for (const jalur of ['/menu', '/blud', '/usulan-kebutuhan']) {
  const r = await minta(jalur, await token({ diamMenit: batas + 1 }))
  ok(`A2 ${jalur} diam ${batas + 1} menit → ditolak (layar yang cuma membaca x-user-*)`,
    r.status === 307 && r.lokasi === '/login?reason=expired' && r.cookieDihapus, JSON.stringify(r))
}
{
  const r = await minta('/menu', await token({ diamMenit: batas - 1 }))
  ok(`A3 diam ${batas - 1} menit → diteruskan (batas = SESSION_INACTIVE_MINUTES, bukan angka lain)`,
    r.lanjut && !r.cookieDisentuh, JSON.stringify(r))
}
{
  const r = await minta('/admin', await token({ diamMenit: 0 }))
  ok('A4 sesi segar → diteruskan, cookie tidak disentuh', r.lanjut && !r.cookieDisentuh, JSON.stringify(r))
}
{
  const r = await minta('/menu', await token({ diamMenit: null }))
  ok('A5 token tanpa lastActive → diteruskan (sama dengan getSession)', r.lanjut, JSON.stringify(r))
}
for (const jalur of ['/api/auth/keepalive', '/api/auth/pemeliharaan', '/api/auth/me']) {
  const r = await minta(jalur, await token({ diamMenit: 120 }))
  ok(`A6 ${jalur} diam → diserahkan ke route (getSession menjawab 401 + alasan)`,
    r.lanjut && !r.cookieDisentuh, JSON.stringify(r))
}

console.log('\nA. jalur penolakan lama tetap')
{
  const umurMaks = SESSION_ABSOLUTE_LIFETIME_HOURS * 3600
  const tua = await minta('/menu', await token({ umurDetik: umurMaks + 60 }))
  const muda = await minta('/menu', await token({ umurDetik: umurMaks - 60 }))
  ok('A7 umur absolut lewat → /login + cookie dihapus; semenit sebelum batas → diteruskan',
    tua.status === 307 && tua.lokasi === '/login' && tua.cookieDihapus && muda.lanjut, JSON.stringify({ tua, muda }))
  const palsu = await minta('/menu', await token({ rahasia: new TextEncoder().encode(randomBytes(32).toString('base64')) }))
  ok('A8 tanda tangan salah → /login + cookie dihapus', palsu.status === 307 && palsu.lokasi === '/login' && palsu.cookieDihapus, JSON.stringify(palsu))
  const apiPalsu = await minta('/api/auth/me', await token({ rahasia: new TextEncoder().encode(randomBytes(32).toString('base64')) }))
  ok('A9 API dengan tanda tangan salah tetap 401 di proxy', apiPalsu.status === 401 && apiPalsu.cookieDihapus, JSON.stringify(apiPalsu))
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\nB. getSession aman dipanggil dari server component')
const AUTH = tanpaKomentar(sumber('lib/security/auth.ts'))
const GS = badan(AUTH, 'export async function getSession')
const PENOLONG = badan(AUTH, 'function buangCookieSesi')
ok('B1 penolong menangkap galat hapus cookie', /try \{\s*cookieStore\.delete\(COOKIE_NAME\);\s*\} catch/.test(PENOLONG), PENOLONG)
ok('B2 getSession tidak menghapus cookie langsung', GS.length > 0 && !GS.includes('cookieStore.delete('))
ok('B3 kelima penolakan (dicabut, status, pemeliharaan, diam, umur absolut) lewat penolong lalu return null',
  (GS.match(/buangCookieSesi\(cookieStore\);\s*return null;/g) ?? []).length === 5)
ok('B4 getSession tidak menulis cookie lewat jalan lain', !/cookieStore\.set\(|cookies\(\)\.(delete|set)\(/.test(GS))
ok('B5 Keluar (clearSessionCookie) TIDAK ditelan — gagal menghapus harus kelihatan',
  /cookieStore\.delete\(COOKIE_NAME\);/.test(badan(AUTH, 'export async function clearSessionCookie'))
  && !badan(AUTH, 'export async function clearSessionCookie').includes('buangCookieSesi'))

// ─────────────────────────────────────────────────────────────────────────────
console.log('\nC. pastikanSesiHalaman menolak sesi yang hanya bisa dinilai DB')
const PENJAGA = tanpaKomentar(sumber('lib/security/sesi-halaman.ts'))
ok('C1 token dibaca, lalu getSession; null → redirect',
  PENJAGA.includes('const token = (await cookies()).get(COOKIE_NAME)?.value;\n  const sesi = await getSession();\n  if (!sesi) redirect('))
ok('C2 dikeluarkan pemeliharaan → /login?reason=pemeliharaan, sebab lain → /login',
  PENJAGA.includes("if (!sesi) redirect((await alasanSesiDitolak(token)) === 'PEMELIHARAAN' ? '/login?reason=pemeliharaan' : '/login');"))
ok('C3 dibungkus cache React — layout + halaman + penjaga modul = satu kueri per permintaan',
  /import \{ cache \} from 'react';/.test(PENJAGA) && /export const pastikanSesiHalaman = cache\(async \(\)/.test(PENJAGA))
ok('C4 alasan memakai fungsi yang sama dengan keepalive & status pemeliharaan',
  /import \{ alasanSesiDitolak \} from '\.\/jadwal-keluar-data';/.test(PENJAGA)
  && ['app/api/auth/keepalive/route.ts', 'app/api/auth/pemeliharaan/route.ts'].every(p => sumber(p).includes('alasanSesiDitolak(token)')))
const LAYOUT = tanpaKomentar(sumber('app/(dashboard)/layout.tsx'))
const DL = badan(LAYOUT, 'export default async function DashboardLayout')
const iJaga = DL.indexOf('await pastikanSesiHalaman();')
ok('C5 layout dashboard memanggilnya sebelum data pengguna dibaca & sebelum anak halaman dirender',
  iJaga > 0 && iJaga < DL.indexOf('SELECT theme_preference') && iJaga < DL.indexOf('return ('))

// ─────────────────────────────────────────────────────────────────────────────
// Layout bersama tidak dirender ulang saat berpindah halaman di tab yang sudah terbuka, jadi tiap
// HALAMAN harus memeriksa sendiri — langsung, atau lewat penjaga modul yang memanggilnya.
console.log('\nD. tiap halaman & layout server memeriksa sesi (bukan hanya header proxy)')
const PENJAGA_MODUL: Record<string, string> = {
  'izinLayar(':     'app/(dashboard)/blud/_izin.ts',
  'izinLayarBba(':  'app/(dashboard)/buku-besar-aset/_izin.ts',
  'izinLayarPk(':   'app/(dashboard)/perjanjian-kinerja/_izin.ts',
  'jagaLayarModul(': 'lib/security/penjaga-layar.ts',
}
for (const [panggil, berkas] of Object.entries(PENJAGA_MODUL)) {
  const isi = tanpaKomentar(sumber(berkas))
  const fn = badan(isi, `export async function ${panggil}`)
  const iSesi = fn.indexOf('await pastikanSesiHalaman()')
  const iData = fn.search(/petaIzin\w+\(|hasAppAccess\(/)
  ok(`D1 ${panggil.slice(0, -1)} memeriksa sesi sebelum membaca izin/akses`, iSesi > 0 && iData > iSesi, berkas)
}
const DIR = 'app/(dashboard)'
const berkasLayar = (readdirSync(new URL(`../${DIR}`, import.meta.url), { recursive: true }) as string[])
  .map(p => p.replace(/\\/g, '/'))
  .filter(p => /(^|\/)(page|layout)\.tsx$/.test(p))
  .sort()
const klien: string[] = []
const bolong: string[] = []
const getSessionLangsung: string[] = []
for (const rel of berkasLayar) {
  const mentah = sumber(`${DIR}/${rel}`)
  if (/^\s*['"]use client['"]/.test(mentah)) { klien.push(rel); continue }
  const isi = tanpaKomentar(mentah)
  const fn = isi.slice(isi.indexOf('export default'))
  const iReturn = fn.search(/\breturn\b/)
  // Pernyataan sendiri di awal baris (`await …` / `const x = await …`), bukan di dalam `if (…)`.
  const iJagaLayar = fn.search(/^[ \t]+(?:const [^=\n]+= )?await (?:pastikanSesiHalaman|izinLayar|izinLayarBba|izinLayarPk|jagaLayarModul)\(/m)
  if (iJagaLayar < 0 || (iReturn >= 0 && iJagaLayar > iReturn)) bolong.push(rel)
  if (/\bgetSession\(/.test(isi)) getSessionLangsung.push(rel)
}
ok(`D2 ${berkasLayar.length - klien.length} halaman/layout server memanggil pastikanSesiHalaman atau penjaga modul sebelum return`,
  berkasLayar.length > 40 && bolong.length === 0, bolong.join(', '))
ok('D3 tidak ada halaman/layout yang memanggil getSession langsung (alasan pemeliharaan hilang)',
  getSessionLangsung.length === 0, getSessionLangsung.join(', '))
// Halaman klien tidak merender data di server; datanya lewat API yang memanggil getSession.
ok('D4 halaman klien hanya yang memang tanpa data server', JSON.stringify(klien) === JSON.stringify(['profil/page.tsx']), JSON.stringify(klien))

console.log(`\n${lulus + gagal.length} pemeriksaan — ${lulus} lulus, ${gagal.length} gagal.`)
process.exit(gagal.length ? 1 : 0)
