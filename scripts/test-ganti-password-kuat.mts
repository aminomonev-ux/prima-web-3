#!/usr/bin/env npx tsx
// scripts/test-ganti-password-kuat.mts — penjaga regresi kebijakan password di Ganti Password.
// Temuan sampingan docs/CONCEPT-perbaikan-audit-akses.md (Susulan, nomor 4).
//
// `/api/auth/change-password` dulu cuma `min(8)`, jadi password sementara dari Super Admin
// (yang wajib kuat) bisa diganti "aaaaaaaa" oleh pemiliknya. Yang dijaga:
//   A  skema body route menolak password lemah & menerima yang memenuhi syarat,
//   B  route benar-benar memakai skema itu (bukan salinan lokal),
//   C  form profil memakai aturan yang sama dan petunjuknya menyebut syaratnya.
//
// Jalankan: npx tsx scripts/test-ganti-password-kuat.mts

import fs from 'node:fs'
import { ChangePasswordBodySchema, StrongPasswordSchema } from '../lib/data/auth-schemas'

let lulus = 0
let gagal = 0
function cek(nama: string, syarat: boolean, catatan = '') {
  if (syarat) { lulus++; console.log(`  ok    ${nama.padEnd(64)} ${catatan}`) }
  else { gagal++; console.log(`  GAGAL ${nama.padEnd(64)} ${catatan}`) }
}
const baca = (p: string) => fs.readFileSync(p, 'utf8')
const buangKomentar = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const body = (baru: string, konfirmasi = baru) => ({ passwordLama: 'LamaSekali1', passwordBaru: baru, konfirmasi })
const pesan = (baru: string, konfirmasi = baru) => {
  const r = ChangePasswordBodySchema.safeParse(body(baru, konfirmasi))
  return r.success ? '' : r.error.issues[0]?.message ?? ''
}

// ── A · Skema body route ─────────────────────────────────────────────────────
console.log('\nA · skema body change-password')

cek('"aaaaaaaa" ditolak', !ChangePasswordBodySchema.safeParse(body('aaaaaaaa')).success, pesan('aaaaaaaa'))
cek('"Abcdefg1" diterima', ChangePasswordBodySchema.safeParse(body('Abcdefg1')).success)
cek('tanpa huruf besar ditolak', pesan('abcdefg1') === 'Password harus mengandung huruf besar', pesan('abcdefg1'))
cek('tanpa huruf kecil ditolak', pesan('ABCDEFG1') === 'Password harus mengandung huruf kecil', pesan('ABCDEFG1'))
cek('tanpa angka ditolak', pesan('Abcdefgh') === 'Password harus mengandung angka', pesan('Abcdefgh'))
cek('7 karakter ditolak', pesan('Abcdef1') === 'Password minimal 8 karakter', pesan('Abcdef1'))
cek('129 karakter ditolak, 128 diterima',
  !ChangePasswordBodySchema.safeParse(body('Aa1' + 'x'.repeat(126))).success
  && ChangePasswordBodySchema.safeParse(body('Aa1' + 'x'.repeat(125))).success)
cek('refine konfirmasi tetap jalan', pesan('Abcdefg1', 'Abcdefg2') === 'Konfirmasi password tidak cocok')
cek('passwordBaru = StrongPasswordSchema persis', ChangePasswordBodySchema.shape.passwordBaru === StrongPasswordSchema)

// ── B · Route memakai skema itu ──────────────────────────────────────────────
console.log('\nB · route memakai skema bersama')

const route = buangKomentar(baca('app/api/auth/change-password/route.ts'))
cek('route mengimpor ChangePasswordBodySchema',
  route.includes("import { ChangePasswordBodySchema } from '@/lib/data/auth-schemas';"))
cek('route mem-parse body dengan skema itu', route.includes('ChangePasswordBodySchema.safeParse(body)'))
cek('route tidak punya skema lokal', !/z\.object\s*\(/.test(route) && !/from 'zod'/.test(route))

// ── C · Form profil ──────────────────────────────────────────────────────────
console.log('\nC · form Ganti Password')

const profil = buangKomentar(baca('app/(dashboard)/profil/page.tsx'))
cek('form mengecek password baru lewat StrongPasswordSchema', profil.includes('StrongPasswordSchema.safeParse(pwBaru)'))
cek('gerbang lama "skor ≥ 3" sudah hilang', !profil.includes('str.s < 3'))
cek('petunjuk menyebut keempat syarat',
  profil.includes('Minimal 8 karakter, memuat huruf besar, huruf kecil, dan angka'))
cek('simbol ditandai tidak wajib', profil.includes("'Simbol (!@#...), tidak wajib'"))
cek('petunjuk tanpa tanda pisah panjang', !/Minimal 8 karakter[^'\n]*—|tidak wajib[^'\n]*—/.test(profil))

console.log(`\n${lulus + gagal} pemeriksaan · ${lulus} lulus · ${gagal} gagal`)
if (gagal) { console.log('GAGAL: kebijakan password Ganti Password tidak lagi utuh.'); process.exit(1) }
console.log('Kebijakan password Ganti Password utuh.')
