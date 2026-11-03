#!/usr/bin/env npx tsx
// scripts/test-kinerja-pendapatan-perubahan.mts — Target Pendapatan Perubahan (tab Pendapatan & CRR).
// Konsep: docs/CONCEPT-kinerja-pendapatan-perubahan.md
// Jalankan: npx tsx --env-file=.env.local scripts/test-kinerja-pendapatan-perubahan.mts
// Bagian C memakai MySQL sungguhan (kotak pasir 2095), dibersihkan otomatis — tanpa
// --env-file bagian itu DILEWATI dan jumlah lulusnya turun.
import { readFileSync } from 'node:fs'
import mysql from 'mysql2/promise'
import {
  adaTargetPerubahan, targetBerlaku, capaianPendapatan, buatTargetPerubahan, batalkanTargetPerubahan,
  ringkasTargetPendapatan, sebarkanSelisih, alasanTolakUbahMurni, jejakTargetPerubahan,
  type BarisTargetPendapatan,
} from '../lib/kinerja/pendapatan-perubahan'

let lulus = 0
const gagal: string[] = []
function ok(nama: string, syarat: unknown, ket = '') {
  if (syarat) { lulus++; console.log(`  ok  ${nama}`) }
  else { gagal.push(nama); console.log(`FAIL  ${nama}${ket ? ' — ' + ket : ''}`) }
}
const sumber = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
const tanpaKomentar = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
const badan = (isi: string, awal: string) => { const i = isi.indexOf(awal); return i < 0 ? '' : isi.slice(i, isi.indexOf('\n}\n', i)) }
const urut = (s: string, ...p: string[]) => p.every((x, i) => s.indexOf(x) >= 0 && (i === 0 || s.indexOf(x) > s.indexOf(p[i - 1])))
const coba = async <T,>(f: () => Promise<T>): Promise<T | Error> => { try { return await f() } catch (e) { return e as Error } }

const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']
// Target murni 10 jt/bulan; Januari–September sudah ada realisasinya.
const MURNI: BarisTargetPendapatan[] = BULAN.map((b, i) => ({
  keterangan: b, target: 10_000_000, target_perubahan: null, realisasi: i < 9 ? 9_000_000 : 0, capaian_pct: 0,
}))

// ─────────────────────────────────────────────────────────────────────────────
console.log('A. Aturan')
ok('A1 tanpa Perubahan: target berlaku = murni', !adaTargetPerubahan(MURNI) && targetBerlaku(MURNI[0]) === 10_000_000 && capaianPendapatan(MURNI[0]) === 90)
const P = buatTargetPerubahan(MURNI)
ok('A2 Buat Target Perubahan menyalin murni ke kolom Perubahan', adaTargetPerubahan(P) && P.every(r => r.target_perubahan === 10_000_000 && r.target === 10_000_000))
const P2 = P.map((r, i) => i === 0 ? { ...r, target_perubahan: 12_000_000 } : r)
ok('A3 capaian dari target BERLAKU (Perubahan)', capaianPendapatan(P2[0]) === 75 && targetBerlaku(P2[0]) === 12_000_000)
const r2 = ringkasTargetPendapatan(P2)
ok('A4 ringkasan: Murni 120 jt, Perubahan 122 jt, capaian dari Perubahan', r2.murni === 120_000_000 && r2.perubahan === 122_000_000 && r2.capaian === Math.round(81_000_000 / 122_000_000 * 10000) / 100)
ok('A5 ringkasan tanpa Perubahan: perubahan null', ringkasTargetPendapatan(MURNI).perubahan === null)
const B = batalkanTargetPerubahan(P2)
ok('A6 Batalkan: kolom Perubahan kosong, capaian kembali ke murni', !adaTargetPerubahan(B) && B[0].capaian_pct === 90)

const sebar = sebarkanSelisih(P, 135_000_000)
ok('A7 sebarkan +15 jt hanya ke Okt–Des (belum ada realisasi), masing-masing +5 jt',
  Array.isArray(sebar) && sebar.slice(0, 9).every(r => r.target_perubahan === 10_000_000) && sebar.slice(9).every(r => r.target_perubahan === 15_000_000),
  JSON.stringify(Array.isArray(sebar) ? sebar.map(r => r.target_perubahan) : sebar))
const sisa = sebarkanSelisih(P, 120_000_001)
ok('A8 sisa pembulatan rupiah jatuh ke bulan terakhir — total persis', Array.isArray(sisa)
  && sisa.reduce((s, r) => s + targetBerlaku(r), 0) === 120_000_001 && sisa[11].target_perubahan === 10_000_001)
ok('A9 sebarkan tanpa Perubahan / tanpa selisih / semua bulan berjalan → ditolak dengan alasan',
  typeof sebarkanSelisih(MURNI, 130_000_000) === 'string' && typeof sebarkanSelisih(P, 120_000_000) === 'string'
  && typeof sebarkanSelisih(P.map(r => ({ ...r, realisasi: 1 })), 130_000_000) === 'string')
ok('A10 selisih yang membuat bulan negatif ditolak', typeof sebarkanSelisih(P, 60_000_000) === 'string')

ok('A11 Murni boleh diubah selama belum ada Perubahan tersimpan', alasanTolakUbahMurni(MURNI, MURNI.map(r => ({ ...r, target: 1 }))) === null)
const tolak = alasanTolakUbahMurni(P, P.map((r, i) => i === 1 ? { ...r, target: 11_000_000 } : r))
ok('A12 sesudah Perubahan tersimpan, Murni yang berubah ditolak & bulannya disebut', !!tolak && tolak.includes('Februari') && tolak.includes('batalkan Target Perubahan'), String(tolak))
ok('A13 …termasuk di simpanan yang sekaligus membatalkan Perubahan', !!alasanTolakUbahMurni(P, batalkanTargetPerubahan(P).map(r => ({ ...r, target: 1 }))))
ok('A14 Murni sama (selisih < 1 sen) → boleh', alasanTolakUbahMurni(P, P.map(r => ({ ...r, target: r.target + 0.001 }))) === null)
ok('A15 jejak audit: dibuat / diubah / dibatalkan / tak berubah',
  jejakTargetPerubahan(MURNI, P2).includes('Target Perubahan dibuat: Murni Rp 120.000.000 → Perubahan Rp 122.000.000')
  && jejakTargetPerubahan(P, P2).includes('Rp 120.000.000 → Rp 122.000.000')
  && jejakTargetPerubahan(P2, B).includes('dibatalkan') && jejakTargetPerubahan(P, P) === '', jejakTargetPerubahan(MURNI, P2))

// ─────────────────────────────────────────────────────────────────────────────
console.log('B. Sambungan kode')
const KIN = tanpaKomentar(sumber('lib/data/kinerja.ts'))
const SIMPAN = badan(KIN, 'export async function savePendapatanBatch')
ok('B1 pagar Murni final dibaca dari isi tersimpan SEBELUM DELETE', urut(SIMPAN, 'FROM kinerja_pendapatan_real WHERE tahun = ${tahun} ORDER BY urut',
  'pagarReplace(', 'alasanTolakUbahMurni(lama, baru)', 'throw new KinerjaTargetMurniFinalError(alasan)', 'DELETE FROM kinerja_pendapatan_real'))
ok('B2 L87: kolom tak dikirim (tab lama) = Perubahan lama dipertahankan',
  SIMPAN.includes('r.target_perubahan === undefined ? (lama[i]?.target_perubahan ?? null) : r.target_perubahan'))
ok('B3 capaian tersimpan dihitung server dari target berlaku', SIMPAN.includes('capaianPendapatan(r)') && SIMPAN.includes("'target_perubahan'"))
ok('B4 GET membawa kolomnya', badan(KIN, 'export async function getPendapatanRows').includes('target_perubahan'))
const ZOD = sumber('lib/data/kinerja-schemas.ts')
ok('B5 Zod tidak membuang target_perubahan (nullable, opsional)', /target_perubahan: z\.number\(\)\.nonnegative\(\)\.nullable\(\)\.optional\(\)/.test(ZOD))
const ROUTE = tanpaKomentar(sumber('app/api/kinerja/pendapatan/route.ts'))
ok('B6 route: 409 TARGET_MURNI_FINAL + jejak di audit', ROUTE.includes("code: 'TARGET_MURNI_FINAL'") && ROUTE.includes('item` + jejak'))
const TAB = tanpaKomentar(sumber('app/(dashboard)/kinerja/_tabs/PendapatanCrrTab.tsx'))
ok('B7 layar: Target Murni hanya-baca selama ada Perubahan', TAB.includes('{canEdit && !adaPerubahan\n                        ? <InputNominal value={row.target}'))
ok('B8 layar: capaian satu rumus (ketikan & impor)', (TAB.match(/capaianPendapatan\(/g) ?? []).length >= 2 && !/rv \/ t\)/.test(TAB))
ok('B9 layar: Buat/Batalkan berhenti di form (tanpa fetch)', !badan(TAB, 'async function mulaiTargetPerubahan').includes('fetchJson')
  && !badan(TAB, 'async function hapusTargetPerubahan').includes('fetchJson'))
ok('B10 Beranda & Excel memakai target berlaku', tanpaKomentar(sumber('components/kinerja/BerandaCharts.tsx')).includes('Target: targetBerlaku(r)')
  && badan(tanpaKomentar(sumber('app/(dashboard)/kinerja/_exports.ts')), 'export async function exportPendapatanExcel').includes("'Target Perubahan'"))
const SKEMA = sumber('docs/schema-mysql.sql').replace(/\s+/g, ' ')
ok('B11 skema acuan memuat kolom yang sama dengan migrasi', SKEMA.includes("target_perubahan DECIMAL(18,2) NULL DEFAULT NULL COMMENT 'Target Perubahan bulan ini; NULL = belum ada Perubahan (target berlaku = target murni)'")
  && sumber('docs/migrations/migration-kinerja-pendapatan-perubahan.sql').replace(/\s+/g, ' ').includes("ADD COLUMN target_perubahan DECIMAL(18,2) NULL DEFAULT NULL COMMENT 'Target Perubahan bulan ini; NULL = belum ada Perubahan (target berlaku = target murni)' AFTER target"))

// ─────────────────────────────────────────────────────────────────────────────
console.log('C. MySQL kotak pasir 2095')
const TAHUN = '2095'
let c: mysql.Connection | null = null
try {
  c = await mysql.createConnection({
    host: process.env.MYSQL_HOST, port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER, password: process.env.MYSQL_PASSWORD, database: process.env.MYSQL_DATABASE,
  })
} catch (er) { console.log(`DILEWATI bagian DB: MySQL tidak bisa dihubungi (${(er as { code?: string }).code ?? er})`) }
if (c) {
  const k = c
  const bersih = () => k.query('DELETE FROM kinerja_pendapatan_real WHERE tahun = ?', [TAHUN])
  const baca = async () => ((await k.query('SELECT target, target_perubahan, capaian_pct FROM kinerja_pendapatan_real WHERE tahun = ? ORDER BY urut', [TAHUN])) as [Array<{ target: string; target_perubahan: string | null; capaian_pct: string }>, unknown])[0]
  await bersih()
  try {
    const K = await import('../lib/data/kinerja')
    const [usr] = await k.query('SELECT id FROM users ORDER BY id LIMIT 1') as [Array<{ id: number }>, unknown]
    const userId = Number(usr[0]?.id ?? 0)
    // Bentuk body Simpan: `urut` ikut (server menimpanya dengan nomor urut baris).
    const simpan = (rows: BarisTargetPendapatan[]) => K.savePendapatanBatch(TAHUN, rows.map((r, i) => ({ ...r, urut: i + 1 })), userId)
    await simpan(MURNI)
    ok('C1 simpan murni: kolom Perubahan NULL, capaian dihitung server', (await baca()).every(r => r.target_perubahan === null) && Number((await baca())[0].capaian_pct) === 90)
    const jejak = await simpan(P2.map(r => ({ ...r, capaian_pct: 0 })))
    const sesudah = await baca()
    ok('C2 simpan Perubahan: kedua kolom tersimpan, capaian Januari dari Perubahan (75%) walau layar mengirim 0',
      Number(sesudah[0].target) === 10_000_000 && Number(sesudah[0].target_perubahan) === 12_000_000 && Number(sesudah[0].capaian_pct) === 75)
    ok('C3 jejak audit menyebut Perubahan dibuat', jejak.includes('Target Perubahan dibuat'), jejak)
    const ubahMurni = await coba(() => simpan(P2.map((r, i) => i === 0 ? { ...r, target: 11_000_000 } : r)))
    ok('C4 Murni diubah sesudah Perubahan tersimpan → ditolak, tak ada yang tertulis',
      ubahMurni instanceof K.KinerjaTargetMurniFinalError && Number((await baca())[0].target) === 10_000_000)
    const tabLama = MURNI.map(({ target_perubahan: _t, ...r }, i) => ({ ...r, realisasi: i === 0 ? 9_500_000 : r.realisasi }))
    await simpan(tabLama)
    const lama = await baca()
    ok('C5 tab lama (tanpa kolom Perubahan) tidak membuang Target Perubahan', Number(lama[0].target_perubahan) === 12_000_000 && lama.every(r => r.target_perubahan !== null))
    await simpan(batalkanTargetPerubahan(P2))
    ok('C6 Batalkan: semua kolom Perubahan NULL, capaian kembali ke murni', (await baca()).every(r => r.target_perubahan === null) && Number((await baca())[0].capaian_pct) === 90)
    const murniLagi = await coba(() => simpan(MURNI.map(r => ({ ...r, target: 11_000_000 }))))
    ok('C7 sesudah dibatalkan, Murni boleh diubah lagi', !(murniLagi instanceof Error) && Number((await baca())[0].target) === 11_000_000)
    const rows = await K.getPendapatanRows(TAHUN)
    ok('C8 GET: target_perubahan null (bukan 0) saat tanpa Perubahan', rows.length === 12 && rows.every(r => r.target_perubahan === null))
  } finally {
    await bersih()
    const [[s]] = await k.query('SELECT COUNT(*) AS n FROM kinerja_pendapatan_real WHERE tahun = ?', [TAHUN]) as [Array<{ n: number }>, unknown]
    ok('C9 kotak pasir 2095 bersih kembali', Number(s.n) === 0)
    await k.end()
  }
}

console.log(`\n${lulus} lulus, ${gagal.length} gagal`)
if (gagal.length) { console.log(gagal.map(g => `  - ${g}`).join('\n')); process.exit(1) }
process.exit(0)
