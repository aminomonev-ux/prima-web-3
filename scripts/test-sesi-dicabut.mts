#!/usr/bin/env npx tsx
// scripts/test-sesi-dicabut.mts — penjaga regresi Tahap 1 (A1–A7).
// Konsep: docs/CONCEPT-pusat-akses-satu-pintu.md §17.2 Tahap 1, temuan T-1..T-7 & T-16.
//
// Pemeriksaan STATIS (baca berkas), tidak menyentuh DB. Yang dijaga di sini adalah
// hal-hal yang `tsc` tidak bisa lihat sama sekali: route baru yang lupa menanyakan
// sakelar, pagar yang dikembalikan longgar, dua salinan aturan yang mulai berbeda.
//
// DUA aturan menulis asersi di berkas ini, dua-duanya lahir dari kesalahan nyata:
//
//   1. **Kutip utuh sampai kurung buka** (L82c). Mengutip syarat sepotong membuat
//      `false && <kutipan>` tetap cocok, jadi mutasi lolos.
//   2. **Buang komentar dulu** untuk asersi "tidak boleh ada lagi". Berkas-berkas ini
//      penuh komentar yang MENJELASKAN bug lamanya — prosa itu akan menyalakan
//      tesnya sendiri kalau ikut dipindai.
//
// Jalankan: npx tsx scripts/test-sesi-dicabut.mts

import fs from 'node:fs'
import path from 'node:path'
import { MODUL_APPS, LABEL_SAKELAR } from '../lib/registry/apps'

let lulus = 0
let gagal = 0

function cek(nama: string, syarat: boolean, catatan = '') {
  if (syarat) { lulus++; console.log(`  ok    ${nama.padEnd(64)} ${catatan}`) }
  else { gagal++; console.log(`  GAGAL ${nama.padEnd(64)} ${catatan}`) }
}

const baca = (p: string) => fs.readFileSync(p, 'utf8')

/** Buang komentar baris & blok. WAJIB dipakai sebelum asersi "tidak boleh ada lagi". */
function buangKomentar(t: string): string {
  return t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')
}

const hitung = (t: string, s: string) => t.split(s).length - 1

function routes(dir: string): string[] {
  const out: string[] = []
  if (!fs.existsSync(dir)) return out
  ;(function walk(d: string) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name)
      if (e.isDirectory()) walk(p)
      else if (e.name === 'route.ts') out.push(p.replace(/\\/g, '/'))
    }
  })(dir)
  return out.sort()
}

// ── A1 · sakelar menutup TIAP handler, bukan tiap berkas ─────────────────────
// Gate G cuma bertanya "berkasnya menyebut penanda?". Route dengan GET+POST yang
// pagarnya hanya di GET akan LULUS di sana. Di sini dihitung per handler: jumlah
// pemanggilan sakelar harus SAMA dengan jumlah `getSession()`.
console.log('\nA1 · sakelar pemeliharaan menutup halaman DAN tiap route')

for (const [dir, fn] of [
  ['app/api/usulan', 'usulanMati'],
  ['app/api/perjanjian-kinerja', 'pkMati'],
] as const) {
  for (const p of routes(dir)) {
    const t = buangKomentar(baca(p))
    // Dibandingkan dengan jumlah HANDLER, bukan cuma jumlah `getSession()`. Keduanya
    // kebetulan sama hari ini, tapi handler yang lupa mengambil sesi sama sekali akan
    // lolos kalau patokannya `getSession` — dan handler seperti itu justru yang paling
    // tidak berpagar.
    const handler = [...t.matchAll(/^export async function (?:GET|POST|PUT|PATCH|DELETE)\b/gm)].length
    const pagar = hitung(t, `await ${fn}(session.role)`)
    cek(`${p.replace(dir + '/', '')} — ${handler} handler`, handler > 0 && pagar === handler,
      `${pagar}/${handler} dipagari`)
  }
}

for (const p of routes('app/api/dashboard')) {
  const t = buangKomentar(baca(p))
  cek(`${p.replace('app/api/dashboard/', '')} — dashboardMati`,
    t.includes('await dashboardMati(g.session.role)'))
}

// `role` dioper = PERAN_TEMBUS_SAKELAR berlaku. Lupa mengopernya tidak menimbulkan
// galat apa pun — SUPER_ADMIN cuma ikut ditolak 503 saat modulnya dimatikan, persis
// keadaan ketika ia paling perlu masuk memeriksa (S1).
for (const [p, fn] of [
  ['app/api/usulan/_guard.ts', 'usulanMati'],
  ['app/api/perjanjian-kinerja/_guard.ts', 'pkMati'],
  ['app/api/dashboard/_guard.ts', 'dashboardMati'],
] as const) {
  const t = buangKomentar(baca(p))
  cek(`${fn} meneruskan { role } ke modulMati`, /modulMati\(\[[^\]]+\], \{ role \}\)/.test(t))
}

for (const [p, kunci, label] of [
  ['app/(dashboard)/usulan-kebutuhan/page.tsx', 'app_status_usulan_aset', 'halaman Usulan'],
  ['app/(dashboard)/perjanjian-kinerja/layout.tsx', 'app_status_perjanjian_kinerja', 'layout PK'],
  ['app/(dashboard)/dashboard/page.tsx', 'app_status_dashboard', 'halaman Dashboard'],
  ['app/(dashboard)/dashboard/[modul]/page.tsx', 'app_status_dashboard', 'Dashboard drill-down'],
] as const) {
  const t = buangKomentar(baca(p))
  // Tahap 4 mengganti `/maintenance?app=<nama karangan>` dengan `urlPemeliharaan(<kunci>)`.
  // Yang diperiksa jadi LEBIH ketat, bukan sekadar disesuaikan: kunci yang ditanyakan ke
  // sakelar dan kunci yang dikirim ke halaman pemeliharaan harus SAMA. Dulu keduanya bisa
  // berbeda tanpa satu pun galat — halaman itu percaya apa pun yang tertulis di URL.
  cek(`${label} memeriksa sakelar + halaman pemeliharaan menyebut kunci yang sama`,
    t.includes(`await modulSedangMati(['${kunci}'], { role })`)
    && t.includes(`redirect(urlPemeliharaan('${kunci}'))`))
}

// Layar drill-down Dashboard punya pagarnya SENDIRI, bukan menumpang halaman induk —
// URL-nya bisa diketik langsung, dan pagar yang cuma di satu layar bukan pagar (L69).
// Sesudah Fase B daftar modulnya tidak lagi ditulis di skrip gate G, jadi yang
// diperiksa bukan teks di sana melainkan NILAI di registry — sekaligus bahwa skripnya
// memang membacanya dari situ, bukan mengetik ulang daftarnya sendiri.
cek('gate G menurunkan daftarnya dari registry, tidak mengetik ulang', (() => {
  const t = buangKomentar(baca('scripts/test-killswitch-modul.mjs'))
  return t.includes("from '../lib/registry/apps-data.mjs'") && !/dir: '/.test(t)
})())
for (const d of ['app/api/usulan', 'app/api/perjanjian-kinerja', 'app/api/dashboard']) {
  const m = MODUL_APPS.find((x) => x.dirApi === d)
  cek(`registry: ${d.replace('app/api/', '')} bersakelar & berpenjaga`,
    !!m && m.sakelar !== null && m.penjagaApi !== undefined, m?.penjagaApi?.penanda.join('/') ?? '—')
}

// ── A2 · keepalive membaca peran dari DB ─────────────────────────────────────
console.log('\nA2 · ubah peran berlaku tanpa mengusir siapa pun (T-2)')
{
  const mentah = baca('app/api/auth/keepalive/route.ts')
  const t = buangKomentar(mentah)
  cek('keepalive JOIN users untuk peran segar',
    /JOIN users u ON u\.id = s\.user_id/.test(t) && t.includes('SELECT u.role'))
  cek('token diterbitkan dengan peran segar, bukan payload lama',
    t.includes('const payload = peranSegar ? { ...session, role: peranSegar'))
  // Yang dijaga: kembalinya `createToken(session, …)` — bentuk lama yang menandatangani
  // ulang peran basi. Komentar sudah dibuang, jadi prosa yang menjelaskannya tidak ikut.
  cek('bentuk lama createToken(session, …) tidak kembali',
    !t.includes('createToken(session, session.sessionId)'))
  // Sesi yang SUDAH dicabut tidak boleh hidup lagi hanya karena MySQL tersendat:
  // kueri ini menjawab dua hal sekaligus, dan yang "masih sah?" fail-closed sejak awal.
  cek('gagal baca DB tetap 401, bukan diperpanjang diam-diam',
    /catch \{ rows = \[\]; \}/.test(t) && /if \(!rows\.length\) \{/.test(t))
  cek('nol kueri tambahan (SELECT hanya satu)', hitung(t, 'await sql`') === 2,
    'satu SELECT berjoin + satu UPDATE last_active')
}

// ── A3 · nonaktif memutus seketika ───────────────────────────────────────────
console.log('\nA3 · nonaktifkan menghentikan yang sedang login (T-3)')
{
  const t = buangKomentar(baca('lib/security/auth.ts'))
  cek('getSession menumpang kueri revokasi lewat JOIN users',
    /JOIN users u ON u\.id = s\.user_id/.test(t) && t.includes('SELECT u.status'))
  cek('getSession menolak status yang menutup sesi',
    t.includes('if (statusMenutupSesi(rows[0]?.status)) {'))
  cek('aturan status hidup di SATU tempat', t.includes('export function statusMenutupSesi('))
}
{
  const t = buangKomentar(baca('app/api/auth/login/route.ts'))
  cek('login memakai aturan yang sama, bukan salinannya',
    t.includes('if (statusMenutupSesi(user.status)) {')
    && !t.includes("user.status === 'NONAKTIF'"))
}
{
  const t = buangKomentar(baca('app/api/admin/users/route.ts'))
  const i = t.indexOf("data.action === 'nonaktif'")
  const badan = t.slice(i, t.indexOf("data.action === 'aktifkan'"))
  cek('nonaktif: status + cabut sesi dalam SATU transaksi',
    i > 0 && badan.includes('await withTransaction(')
    && badan.includes("UPDATE users SET status = 'NONAKTIF'")
    && badan.includes('UPDATE user_sessions SET invalidated_at = NOW()'))
  cek('nonaktif tidak lagi UPDATE lepas di luar transaksi',
    !badan.includes("await sql`UPDATE users SET status = 'NONAKTIF'"))
}

// ── A4 · kuota di jalur aktifkan ─────────────────────────────────────────────
console.log('\nA4 · mengaktifkan kembali memeriksa kuota (T-7)')
{
  const t = buangKomentar(baca('app/api/admin/users/route.ts'))
  const i = t.indexOf("data.action === 'aktifkan'")
  const badan = t.slice(i, t.indexOf("data.action === 'ubah-role'"))
  cek('aktifkan: kuota diperiksa di dalam transaksi yang sama',
    i > 0 && badan.includes('await assertQuotaAvailableTx(targetCurrentRole, tx)')
    && badan.includes("UPDATE users SET status = 'AKTIF'"))
  cek('kuota penuh dijawab 409', badan.includes('e instanceof QuotaFullError') && badan.includes('status: 409'))
  // Akun yang SUDAH aktif sudah ikut terhitung di `COUNT(*) … status='AKTIF'`, jadi
  // memeriksanya lagi menolak aksi yang tidak mengubah apa pun — 409 palsu yang
  // menyuruh admin membereskan masalah yang tidak ada.
  cek('aktifkan: akun yang sudah AKTIF tidak diperiksa kuota',
    badan.includes("if (targetCurrentStatus !== 'AKTIF') await assertQuotaAvailableTx("))
}

// ── A5 · A6 · dua tambalan satu baris ────────────────────────────────────────
console.log('\nA5/A6 · sakelar tanpa tombol, dan kartu terkunci untuk yang berhak')
// Keduanya kini fakta di registry, bukan baris di berkas layar/route. Diperiksa lewat
// nilai yang benar-benar dihasilkan — asersi yang mencocokkan teks akan lulus atau
// gagal karena alasan yang salah begitu tempatnya berpindah lagi.
cek('sakelar sub-modul Realisasi BLUD punya label (T-5)',
  LABEL_SAKELAR['app_status_blud_realisasi'] !== undefined,
  LABEL_SAKELAR['app_status_blud_realisasi'] ?? '(tidak ada)')
{
  const dash = MODUL_APPS.find((m) => m.kunci === 'dashboard')
  const peran = dash?.peranBawaan
  cek('Dashboard terbuka untuk Kasubag & Kabag (T-6)',
    peran !== undefined && peran !== 'SEMUA'
      && peran.includes('ADMIN_KASUBAG') && peran.includes('ADMIN_KABAG'))
  const t = buangKomentar(baca('app/api/user/access/route.ts'))
  cek('kartu /menu menjawab dari registry, bukan daftar pasangan',
    t.includes('for (const m of MODUL_APPS)') && !t.includes('APP_CHECKS'))
}

// ── A7 · lantai API menyusul lantai layar ────────────────────────────────────
console.log('\nA7 · wewenang tanpa layar ditutup (T-16, keputusan §9-1)')
{
  const t = buangKomentar(baca('app/api/admin/users/route.ts'))
  cek('hanya ubah-role yang terbuka untuk ADMIN',
    /AKSI_TERBUKA_UNTUK_ADMIN: readonly string\[\] = \['ubah-role'\]/.test(t))
  cek('lantai dibaca sebelum aksi apa pun dijalankan',
    t.indexOf('AKSI_TERBUKA_UNTUK_ADMIN.includes(data.action)')
      < t.indexOf("data.action === 'nonaktif'"))
  // GET dipakai panel Kelola User di Usulan untuk daftar user-nya. Menutupnya akan
  // mematikan panel yang justru dinyatakan tetap diperlukan.
  cek('GET tetap terbuka untuk ADMIN (Kelola User di Usulan)',
    hitung(t, "const isAdmin = session.role === 'ADMIN' || session.role === 'SUPER_ADMIN';") === 2)
}
{
  const t = buangKomentar(baca('app/api/admin/menu-access/route.ts'))
  cek('menu-access SUPER_ADMIN saja, GET dan POST',
    hitung(t, "if (session.role !== 'SUPER_ADMIN') return forbidden()") === 2
    && !t.includes("session.role !== 'ADMIN' &&"))
}
{
  // Panel Kelola User memang cuma mengirim ubah-role. Kalau suatu saat ia menumbuhkan
  // aksi lain, pemeriksaan ini yang memberi tahu bahwa lantainya harus ikut dipikirkan.
  // Dipersempit ke jendela SESUDAH '/api/admin/users' — berkas ini juga mengirim
  // `action: 'ajukan'` ke endpoint usulannya sendiri, dan memindai seluruh berkas
  // membuat pemeriksaan ini menuduh aksi yang sama sekali tidak ada urusannya.
  const t = buangKomentar(baca('app/(dashboard)/usulan-kebutuhan/usulan-client.tsx'))
  const aksi: string[] = []
  for (const m of t.matchAll(/'\/api\/admin\/users'/g)) {
    const jendela = t.slice(m.index, m.index + 400)
    for (const a of jendela.matchAll(/action: '([a-z-]+)'/g)) aksi.push(a[1])
  }
  cek('Kelola User hanya mengirim ubah-role ke /api/admin/users',
    aksi.length > 0 && aksi.every((a) => a === 'ubah-role'),
    aksi.join(', ') || '(tidak ada — endpoint-nya hilang?)')
}

console.log(`\n${lulus + gagal} pemeriksaan — ${lulus} lulus, ${gagal} gagal.`)
process.exit(gagal ? 1 : 0)
