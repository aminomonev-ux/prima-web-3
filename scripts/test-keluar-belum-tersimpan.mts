// scripts/test-keluar-belum-tersimpan.mts — regresi tombol Keluar & pengingat belum-tersimpan (2026-10-01)
//
// Keluar dulu MEMATIKAN sesi sebelum bertanya; `window.location.href` sesudahnya memicu
// `beforeunload`, jadi pertanyaan peramban datang SESUDAH sesinya mati dan jawaban
// "tetap di sini" meninggalkan orang di halaman yang Simpan-nya pasti 401. Terbukti di
// peramban untuk Admin Panel, BLUD, dan E-Anggaran sebelum diperbaiki. Ikut dijaga K3:
// pindah-halaman-penuh yang disengaja wajib menulis alasannya, dan CI 0 peringatan.
//
// Komponen 'use client' tidak bisa dijalankan dari Node, jadi yang dibandingkan URUTAN
// di badan fungsinya — selalu sesudah komentar dibuang, dan syarat dikutip utuh (L82c).
//
//   npx tsx scripts/test-keluar-belum-tersimpan.mts

import { readFileSync, readdirSync } from 'node:fs'
import { join, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

let lulus = 0
const gagal: string[] = []
function cek(nama: string, syarat: boolean) {
  if (syarat) lulus++
  else gagal.push(nama)
}

const AKAR = fileURLToPath(new URL('..', import.meta.url))
const baca = (p: string) => readFileSync(join(AKAR, p), 'utf8')
/** Komentar dibuang dulu — prosa yang menjelaskan bug lama tidak boleh ikut dicocokkan. */
const kode = (p: string) => baca(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')

/** Badan blok pertama sesudah `penanda`, dari `{` sampai pasangannya. */
function badan(src: string, penanda: string): string {
  const i = src.indexOf(penanda)
  if (i < 0) return ''
  const buka = src.indexOf('{', i + penanda.length)
  let dalam = 0
  for (let j = buka; j >= 0 && j < src.length; j++) {
    if (src[j] === '{') dalam++
    else if (src[j] === '}' && --dalam === 0) return src.slice(buka, j + 1)
  }
  return ''
}

/** Semua potongan ada, dan muncul berurutan — yang belakangan dicari SESUDAH yang sebelumnya. */
function urut(teks: string, ...potongan: string[]): boolean {
  let posisi = -1
  for (const p of potongan) {
    posisi = teks.indexOf(p, posisi + 1)
    if (posisi < 0) return false
  }
  return true
}

function berkasSumber(dir: string): string[] {
  const hasil: string[] = []
  for (const nama of readdirSync(join(AKAR, dir), { withFileTypes: true })) {
    const rel = `${dir}/${nama.name}`
    if (nama.isDirectory()) hasil.push(...berkasSumber(rel))
    else if (/\.(tsx?|mts)$/.test(nama.name)) hasil.push(rel)
  }
  return hasil
}
const SUMBER = [...berkasSumber('app'), ...berkasSumber('components')]

const TANYA   = 'if (!(await bolehTinggalkanHalaman())) return'
const LOGOUT  = "fetch('/api/auth/logout'"
const LEPAS   = 'lepaskanPengingat()'
const PINDAH  = "window.location.href = '/login'"

// ── A. Mekanisme bersama ──────────────────────────────────────────────────────
{
  const k = kode('lib/shared/belum-tersimpan.ts')
  cek('A1 lepaskanPengingat() mengosongkan pesanAktif',
    badan(k, 'export function lepaskanPengingat').includes('pesanAktif = null'))
  cek('A2 beforeunload diam kalau pengingat sudah dilepas (cek SEBELUM preventDefault)',
    urut(badan(k, 'const onUnload = '), 'if (!pesanAktif) return', 'e.preventDefault()'))
}

// ── B. Tiap layar berpengingat → tombol Keluar shell-nya bertanya DULU ────────
// Layar yang memasang pengingat ↔ shell yang memegang tombol Keluar-nya. Layar BARU yang
// memakai useIngatkanBelumTersimpan wajib didaftarkan di sini, kalau tidak B1 merah:
// pengingat tanpa Keluar yang bertanya dulu = lubang yang sama lewat pintu lain (L69).
const PASANGAN: Record<string, string> = {
  'app/(dashboard)/blud/dpa/dpa-client.tsx':               'app/(dashboard)/blud/blud-shell.tsx',
  'app/(dashboard)/blud/pergeseran/pergeseran-client.tsx': 'app/(dashboard)/blud/blud-shell.tsx',
  'app/(dashboard)/admin/_panels/TabPusatAkses.tsx':       'app/(dashboard)/admin/admin-client.tsx',
}
{
  const pemakai = SUMBER.filter(p => kode(p).includes('useIngatkanBelumTersimpan(')).sort()
  cek(`B1 daftar layar berpengingat lengkap (ditemukan: ${pemakai.join(', ')})`,
    JSON.stringify(pemakai) === JSON.stringify(Object.keys(PASANGAN).sort()))
  for (const shell of new Set(Object.values(PASANGAN))) {
    const b = badan(kode(shell), 'function handleLogout')
    cek(`B2 ${shell}: tanya → logout → lepas pengingat → pindah`, urut(b, TANYA, LOGOUT, LEPAS, PINDAH))
  }
}

// ── C. E-Anggaran punya penjaga sendiri (pendingMasterRef + guardPending) ─────
{
  const topbar = kode('app/(dashboard)/kinerja/_components/Topbar.tsx')
  cek('C1 Keluar lewat onGuardPending',
    topbar.includes('onClick={() => { setDropOpen(false); onGuardPending(onLogout); }}'))
  cek('C2 Menu lewat onGuardPending + router.push',
    topbar.includes("onClick={() => onGuardPending(() => router.push('/menu'))}"))
  cek('C3 Ganti Password lewat onGuardPending + router.push (dulu tanpa pertanyaan aplikasi)',
    topbar.includes("onClick={() => { setDropOpen(false); onGuardPending(() => router.push('/profil')); }}"))
  cek('C4 Topbar tidak lagi memakai window.location', !topbar.includes('window.location'))

  const shell = kode('app/(dashboard)/kinerja/kinerja-client.tsx')
  cek('C5 handleLogout: logout → ref dilepas → pindah',
    urut(badan(shell, 'const handleLogout = useCallback('), LOGOUT, 'pendingMasterRef.current = false', PINDAH))
  cek('C6 beforeunload E-Anggaran memang bertanya lewat ref yang sama',
    urut(badan(shell, 'function handleBeforeUnload'), 'if (pendingMasterRef.current)', 'e.preventDefault()'))
}

// ── D. K3: pindah-halaman-penuh yang disengaja menulis alasannya ──────────────
{
  const DIREKTIF = 'eslint-disable-next-line @next/next/no-location-assign-relative-destination'
  const temuan: string[] = []
  let jumlah = 0
  for (const p of SUMBER) {
    baca(p).split(/\r?\n/).forEach((baris, i) => {
      if (!baris.includes(DIREKTIF)) return
      jumlah++
      const alasan = baris.split(DIREKTIF)[1]?.match(/^\s+--\s+(.+?)\s*(\*\/\s*\})?\s*$/)?.[1] ?? ''
      if (alasan.length < 10) temuan.push(`${p.split('/').join(sep)}:${i + 1}`)
    })
  }
  cek('D1 pengecualian navigasi penuh masih ada (logout, unduhan, halaman darurat)', jumlah > 0)
  cek(`D2 tiap pengecualian menulis alasannya (tanpa alasan: ${temuan.join(', ') || '-'})`, temuan.length === 0)
}

// ── E. Penjaga CI ─────────────────────────────────────────────────────────────
cek('E1 CI menolak peringatan ESLint baru',
  baca('.github/workflows/security-scan.yml').includes('run: npm run lint -- --max-warnings 0'))

console.log(`\n${lulus} lulus, ${gagal.length} gagal`)
for (const g of gagal) console.log('  GAGAL ' + g)
process.exit(gagal.length ? 1 : 0)
