// scripts/test-pk-tahun.mts — pemilih tahun PK: "Tahun lain…" diketik, tahun aktif di luar daftar tetap tampil.
// Jalankan: npx tsx scripts/test-pk-tahun.mts

import { readFileSync } from 'node:fs'
import { tahunRange, bacaTahunKetik, TAHUN_PK_MIN, TAHUN_PK_MAX } from '../app/(dashboard)/perjanjian-kinerja/_utils/pk-format'
import { TahunSchema } from '../lib/data/pk-schemas'

let lulus = 0
const gagal: string[] = []
const ok = (n: string, s: unknown, k = '') => {
  if (s) { lulus++; console.log(`  ok  ${n}`) } else { gagal.push(n); console.log(`FAIL  ${n}${k ? ' — ' + k : ''}`) }
}

const kini = new Date().getFullYear()
ok('A1 daftar bawaan = 2 tahun lalu s.d. 5 tahun depan', JSON.stringify(tahunRange()) === JSON.stringify([...Array(8)].map((_, i) => String(kini - 2 + i))))
ok('A2 tahun aktif di luar daftar ikut tampil, urut', JSON.stringify(tahunRange('2035').slice(-1)) === '["2035"]' && tahunRange('2035').length === 9)
ok('A3 tahun aktif lama (2021) di depan', tahunRange('2021')[0] === '2021')
ok('A4 tahun aktif yang sudah ada tidak digandakan', tahunRange(String(kini)).length === 8)
ok('A5 nilai aneh tidak disisipkan', tahunRange('abc').length === 8)

ok('B1 4 digit dalam batas diterima', bacaTahunKetik(' 2035 ') === '2035')
ok('B2 bukan 4 digit ditolak', bacaTahunKetik('203') === null && bacaTahunKetik('20355') === null && bacaTahunKetik('20a5') === null)
ok('B3 di bawah batas ditolak', bacaTahunKetik(String(TAHUN_PK_MIN - 1)) === null)
ok('B4 di atas batas ditolak', bacaTahunKetik(String(TAHUN_PK_MAX + 1)) === null)
ok('B5 batas bawah & atas diterima', bacaTahunKetik(String(TAHUN_PK_MIN)) !== null && bacaTahunKetik(String(TAHUN_PK_MAX)) !== null)

ok('C1 batas layar = batas server (TahunSchema)',
  TahunSchema.safeParse(String(TAHUN_PK_MIN)).success && TahunSchema.safeParse(String(TAHUN_PK_MAX)).success
  && !TahunSchema.safeParse(String(TAHUN_PK_MIN - 1)).success && !TahunSchema.safeParse(String(TAHUN_PK_MAX + 1)).success)

const shell = readFileSync('app/(dashboard)/perjanjian-kinerja/pk-shell.tsx', 'utf8')
ok('D1 daftar menerima tahun aktif', shell.includes('const years = tahunRange(tahun)'))
ok('D2 Enter memakai pembaca yang sama', shell.includes("if (e.key === 'Enter') { e.preventDefault(); pakaiTahunKetik() }")
  && /const t = bacaTahunKetik\(tahunKetik\)\s*if \(!t\) \{ setTahunSalah\(true\); return \}\s*setTahun\(t\)/.test(shell))

console.log(`\n${lulus} lulus, ${gagal.length} gagal`)
if (gagal.length) { console.log(gagal.map(g => `  - ${g}`).join('\n')); process.exit(1) }
process.exit(0)
