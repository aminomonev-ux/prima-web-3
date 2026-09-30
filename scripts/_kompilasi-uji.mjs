// scripts/_kompilasi-uji.mjs — kompilasi bersama untuk skrip uji .mjs yang `require` kode TS.
//
// Kenapa ada (audit 2026-09-29, U1): tiap skrip dulu memelihara DAFTAR berkas yang harus
// dikompilasi sendiri, dan `tsc` telanjang tidak bisa mengikuti impor alias `@/…`. Begitu
// kode yang diuji mulai mengimpor berkas baru lewat alias (`@/lib/shared/waktu-wib`,
// `@/lib/kinerja/riwayat-simpan`, …), `.js`-nya tak pernah ditulis dan skripnya mati ENOENT
// sebelum satu pemeriksaan pun berjalan. Tujuh suite — penjaga N1–N4, saldo awal, izin
// periode, dll. — mati diam-diam sejak ±4 Sep, tepat ketika kode yang dijaganya berubah.
//
// Di sini yang disebut hanya TITIK MASUK. `tsc` diberi tsconfig sementara ber-`paths`, jadi
// ia mengikuti seluruh penutupan impor sendiri — termasuk alias dan berkas `.mjs` polos
// (`allowJs`). Menambah impor di kode yang diuji tidak lagi menuntut menyentuh skrip ujinya.
//
// Galat TIPE sengaja diabaikan: yang dibutuhkan uji adalah `.js`-nya, dan tipe sudah dijaga
// `tsc --noEmit` di CI. Kalau `.js` titik masuknya tetap tidak tertulis, itu dilempar.
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

/**
 * @param {string} repo    akar repo (absolut)
 * @param {string} outDir  folder keluaran (absolut) — biasanya node_modules/.cache/<nama>
 * @param {string[]} entri titik masuk relatif terhadap repo, mis. ['lib/blud/data.ts']
 */
export function kompilasiUji(repo, outDir, entri) {
  fs.mkdirSync(outDir, { recursive: true })
  const tsconfig = path.join(outDir, 'tsconfig.uji.json')
  fs.writeFileSync(tsconfig, JSON.stringify({
    compilerOptions: {
      outDir, rootDir: repo, baseUrl: repo, paths: { '@/*': ['*'] },
      module: 'commonjs', target: 'es2020', moduleResolution: 'node',
      esModuleInterop: true, skipLibCheck: true, allowJs: true, resolveJsonModule: true,
      jsx: 'react-jsx', noEmitOnError: false, types: ['node'],
      typeRoots: [path.join(repo, 'node_modules', '@types')],
    },
    files: entri.map((e) => path.join(repo, e)),
  }, null, 2))
  try {
    execSync(`npx tsc -p "${tsconfig}"`, { cwd: repo, stdio: 'pipe' })
  } catch { /* galat tipe diabaikan — lihat kepala berkas */ }
  for (const e of entri) {
    const js = path.join(outDir, e.replace(/\.(ts|tsx|mts)$/, '.js'))
    if (!fs.existsSync(js)) throw new Error(`kompilasiUji: ${e} tidak menghasilkan ${js}`)
  }
}
