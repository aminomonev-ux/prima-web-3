// scripts/test-blud-sumber-pagu.mts — aturan sumber pagu BLUD tinggal di SATU tempat.
//
// Tahap 0 DPA Perubahan (docs/CONCEPT-blud-dpa-perubahan.md §8): enam salinan
// aturan "pagu diambil dari versi mana" disatukan ke lib/blud/sumber-pagu.ts,
// TANPA mengubah perilaku. Bagian A membuktikan "tanpa mengubah perilaku" —
// logika lama (disalin apa adanya dari ketiga fungsinya sebelum disatukan)
// dibandingkan dengan yang baru pada semua kombinasi versi DPA × Pergeseran.
// Bagian B–C menjaga supaya tidak ada salinan baru yang tumbuh lagi.
//
// Tanpa MySQL: kueri dijawab penanya tiruan dari larik di memori, dan tanggal
// dipulangkan sebagai objek Date seperti mysql2 (timezone '+07:00') — jadi
// `toDateStr` ikut teruji.
//
// USAGE: npx tsx scripts/test-blud-sumber-pagu.mts

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Penanya } from '../lib/data/db'
import {
  sumberPaguTahun, versiJadiSumberPagu, sumberPaguPenerus, tabelSumber,
  type TabelAnggaran,
} from '../lib/blud/sumber-pagu'

const AKAR = join(import.meta.dirname, '..')
const baca = (p: string) => readFileSync(join(AKAR, p), 'utf8')

/** Komentar dibuang dulu — prosa yang menjelaskan pola lama tidak boleh menyalakan tesnya sendiri (L82c). */
function kode(isi: string): string {
  return isi.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

/** Badan fungsi tingkat atas: dari `function nama(` sampai `}` pertama di kolom 0. */
function badan(src: string, nama: string): string {
  const awal = src.search(new RegExp(`function ${nama}\\(`))
  if (awal < 0) return ''
  const akhir = src.indexOf('\n}', awal)
  return akhir < 0 ? src.slice(awal) : src.slice(awal, akhir + 2)
}

let lulus = 0
let gagal = 0
function cek(nama: string, syarat: boolean, catatan = '') {
  if (syarat) { lulus++; console.log(`  ok    ${nama.padEnd(64)} ${catatan}`) }
  else        { gagal++; console.log(`  GAGAL ${nama.padEnd(64)} ${catatan}`) }
}

// ─── Penanya tiruan ──────────────────────────────────────────────────────────

interface Keadaan { pergeseran_dpa: string[]; dpa_blud: string[] }

const TAHUN = 2026
const POLA_MAX = /^SELECT MAX\(versi_tanggal\) AS v FROM (pergeseran_dpa|dpa_blud) WHERE tahun_anggaran = \?( AND versi_tanggal <> \?)?$/

/** DATE ala mysql2 dgn pool '+07:00': tengah malam WIB sebagai objek Date. */
const sbgDate = (iso: string) => new Date(`${iso}T00:00:00+07:00`)

function penanya(k: Keadaan, log: string[] = []): Penanya {
  return ((strings: TemplateStringsArray, ...values: unknown[]) => {
    const teks = strings.join('?').replace(/\s+/g, ' ').trim()
    log.push(teks)
    const m = POLA_MAX.exec(teks)
    if (!m) throw new Error(`kueri tak dikenal penanya tiruan: ${teks}`)
    if (values[0] !== TAHUN) throw new Error(`tahun salah: ${String(values[0])}`)
    const tabel = m[1] as TabelAnggaran
    const tanpa = m[2] ? String(values[1]) : null
    const calon = k[tabel].filter(v => v !== tanpa).sort()
    const v = calon.length ? sbgDate(calon[calon.length - 1]) : null
    return Promise.resolve([{ v }])
  }) as unknown as Penanya
}

// ─── Logika LAMA — disalin dari getPaguSumber / versiJadiSumberPagu / paguPenerus ──
// (lib/blud/pagu.ts & lib/blud/data.ts di 6c897ec), hanya MAX diganti larik.

const maks = (a: string[]) => (a.length ? [...a].sort()[a.length - 1] : null)
const maksDi = (a: string[], kurangDari: string) => maks(a.filter(v => v < kurangDari))

function lamaSumber(k: Keadaan): { tabel: TabelAnggaran | null; versi: string | null } {
  const pg = maks(k.pergeseran_dpa)
  if (pg) return { tabel: 'pergeseran_dpa', versi: pg }
  const dpa = maks(k.dpa_blud)
  if (dpa) return { tabel: 'dpa_blud', versi: dpa }
  return { tabel: null, versi: null }
}

function lamaJadiSumber(k: Keadaan, table: TabelAnggaran, versi: string): boolean {
  const maxPergeseran = maks(k.pergeseran_dpa)
  if (table === 'pergeseran_dpa') return !maxPergeseran || versi >= maxPergeseran
  if (maxPergeseran) return false
  const maxDpa = maks(k.dpa_blud)
  return !maxDpa || versi >= maxDpa
}

function lamaPenerus(
  k: Keadaan, table: TabelAnggaran, versi: string,
): { tabel: TabelAnggaran | null; versi: string | null } | null {
  const maxPergeseran = maks(k.pergeseran_dpa)
  if (table === 'dpa_blud') {
    if (maxPergeseran) return null
    const maxDpa = maks(k.dpa_blud)
    if (!maxDpa || maxDpa !== versi) return null
    const penerus = maksDi(k.dpa_blud, versi)
    return { tabel: penerus ? 'dpa_blud' : null, versi: penerus }
  }
  if (maxPergeseran !== versi) return null
  const penerus = maksDi(k.pergeseran_dpa, versi)
  if (penerus) return { tabel: 'pergeseran_dpa', versi: penerus }
  const dpaVersi = maks(k.dpa_blud)
  return { tabel: dpaVersi ? 'dpa_blud' : null, versi: dpaVersi }
}

// ─── A. Hasil identik dengan aturan lama ─────────────────────────────────────

console.log('\n── A. Hasil identik dengan aturan lama (semua kombinasi) ──')

const TANGGAL = ['2026-01-31', '2026-03-15', '2026-06-30', '2026-08-31', '2026-10-08']
const CALON = ['2026-01-01', ...TANGGAL, '2026-12-31'] // + di bawah & di atas semua versi
const TABEL: TabelAnggaran[] = ['pergeseran_dpa', 'dpa_blud']

function himpunanBagian(a: string[]): string[][] {
  const hasil: string[][] = []
  for (let m = 0; m < 1 << a.length; m++) hasil.push(a.filter((_, i) => m & (1 << i)))
  return hasil
}

const sama = (a: { tabel: unknown; versi: unknown } | null, b: { tabel: unknown; versi: unknown } | null) =>
  a === null || b === null ? a === b : a.tabel === b.tabel && a.versi === b.versi

let kombinasi = 0
let bandingSumber = 0, bedaSumber = 0
let bandingJadi = 0, bedaJadi = 0
let bandingPenerus = 0, bedaPenerus = 0
let penerusBukanNull = 0, jatuhKeDpa = 0
const contohBeda: string[] = []

for (const pg of himpunanBagian(TANGGAL)) {
  for (const dpa of himpunanBagian(TANGGAL)) {
    kombinasi++
    const k: Keadaan = { pergeseran_dpa: pg, dpa_blud: dpa }
    const q = penanya(k)

    const baru = await sumberPaguTahun(q, TAHUN)
    bandingSumber++
    if (!sama({ tabel: tabelSumber(baru), versi: baru.versi }, lamaSumber(k))) {
      bedaSumber++
      if (contohBeda.length < 5) contohBeda.push(`sumber pg=[${pg}] dpa=[${dpa}]`)
    }

    for (const t of TABEL) {
      for (const v of CALON) {
        bandingJadi++
        if ((await versiJadiSumberPagu(q, t, TAHUN, v)) !== lamaJadiSumber(k, t, v)) {
          bedaJadi++
          if (contohBeda.length < 5) contohBeda.push(`jadiSumber ${t} ${v} pg=[${pg}] dpa=[${dpa}]`)
        }

        bandingPenerus++
        const pb = await sumberPaguPenerus(q, t, TAHUN, v)
        const pl = lamaPenerus(k, t, v)
        if (pl) penerusBukanNull++
        if (pl && t === 'pergeseran_dpa' && pl.tabel === 'dpa_blud') jatuhKeDpa++
        if (!sama(pb && { tabel: tabelSumber(pb), versi: pb.versi }, pl)) {
          bedaPenerus++
          if (contohBeda.length < 5) contohBeda.push(`penerus ${t} ${v} pg=[${pg}] dpa=[${dpa}]`)
        }
      }
    }
  }
}

cek('Kombinasi versi DPA × Pergeseran yang dicoba', kombinasi === 1024, `${kombinasi}`)
cek('getPaguSumber: sumber + versi identik', bedaSumber === 0, `${bandingSumber} dibanding, ${bedaSumber} beda`)
cek('versiJadiSumberPagu: jawaban identik', bedaJadi === 0, `${bandingJadi} dibanding, ${bedaJadi} beda`)
cek('paguPenerus: null / tabel / versi penerus identik', bedaPenerus === 0, `${bandingPenerus} dibanding, ${bedaPenerus} beda`)
// Tanpa dua pemeriksaan ini, A bisa lulus karena semua jawaban kebetulan null.
cek('…dan kasus penerus bukan-null benar-benar teruji', penerusBukanNull > 500, `${penerusBukanNull}`)
cek('…termasuk "pergeseran terakhir hilang → jatuh ke DPA terbaru"', jatuhKeDpa > 50, `${jatuhKeDpa}`)
for (const c of contohBeda) console.log(`        beda: ${c}`)

console.log('\n── A2. Kasus bernama (cermin catatan di kode lama) ──')
{
  const k: Keadaan = { pergeseran_dpa: ['2026-01-31'], dpa_blud: ['2026-08-31'] }
  const s = await sumberPaguTahun(penanya(k), TAHUN)
  cek('Pergeseran menang atas DPA walau DPA-nya lebih baru',
    s.sumber === 'PERGESERAN' && s.versi === '2026-01-31', `${s.sumber} ${s.versi}`)
  cek('Menyimpan DPA di tahun ber-Pergeseran tidak menyentuh pagu',
    !(await versiJadiSumberPagu(penanya(k), 'dpa_blud', TAHUN, '2026-10-08')))
  const p = await sumberPaguPenerus(penanya(k), 'pergeseran_dpa', TAHUN, '2026-01-31')
  cek('Hapus satu-satunya Pergeseran → pagu jatuh ke DPA terbaru',
    p?.sumber === 'DPA' && p.versi === '2026-08-31', `${p?.sumber} ${p?.versi}`)
  cek('Hapus versi DPA lama → null (bukan sumber pagu)',
    (await sumberPaguPenerus(penanya(k), 'dpa_blud', TAHUN, '2026-08-31')) === null)
}
{
  const s = await sumberPaguTahun(penanya({ pergeseran_dpa: [], dpa_blud: [] }), TAHUN)
  cek('Tahun kosong → KOSONG, versi null', s.sumber === 'KOSONG' && s.versi === null)
}
{
  // Jalur yang dipanggil layar Realisasi tiap 30 detik: tetap kueri MAX polos,
  // dan DPA tidak ditanya kalau Pergeseran sudah menjawab.
  const log: string[] = []
  await sumberPaguTahun(penanya({ pergeseran_dpa: ['2026-01-31'], dpa_blud: ['2026-08-31'] }, log), TAHUN)
  cek('Tahun ber-Pergeseran: tepat 1 kueri, tanpa pengecualian', log.length === 1 && !log[0].includes('<>'),
    `${log.length} kueri`)
}

// ─── B. Tidak ada salinan aturan yang tersisa ────────────────────────────────

console.log('\n── B. Satu tempat — enam pemakai lama memanggilnya ──')

const kPagu = kode(baca('lib/blud/pagu.ts'))
const kData = kode(baca('lib/blud/data.ts'))
const kReal = kode(baca('lib/blud/realisasi-data.ts'))
const kSumber = kode(baca('lib/blud/sumber-pagu.ts'))

const bSumber = badan(kPagu, 'getPaguSumber')
const bEfektif = badan(kPagu, 'getPaguEfektif')
const bCap = badan(kPagu, 'getPaguCap')
const bPenerus = badan(kData, 'paguPenerus')
const bTerkunci = badan(kReal, 'bacaPaguTerkunci')

cek('getPaguSumber → sumberPaguTahun(sql, tahun)', /return sumberPaguTahun\(sql, tahun\)/.test(bSumber))
cek('getPaguEfektif membaca versi dari sumbernya',
  /const \{ sumber, versi \} = await getPaguSumber\(tahun\)/.test(bEfektif)
  && (bEfektif.match(/AND versi_tanggal = \$\{versi\}/g) ?? []).length === 2,
  'subkueri MAX sendiri = salinan ketujuh aturan')
cek('getPaguCap tetap lewat getPaguSumber', /await getPaguSumber\(tahun\)/.test(bCap))
cek('paguPenerus → sumberPaguPenerus(tx, …)', /await sumberPaguPenerus\(tx, table, tahun, versi\)/.test(bPenerus))
cek('versiJadiSumberPagu tidak lagi didefinisikan di data.ts',
  !/function versiJadiSumberPagu\(/.test(kData) && badan(kData, 'versiJadiSumberPagu') === '')
const panggilJadi = kData.match(/versiJadiSumberPagu\(([a-z]+),/g) ?? []
cek('…dan kedua pemanggilnya mengoper tx (L69-b)',
  panggilJadi.length === 2 && panggilJadi.every(p => p === 'versiJadiSumberPagu(tx,'),
  panggilJadi.join(' '))
cek('bacaPaguTerkunci → sumberPaguTahun(tx, tahun)', /await sumberPaguTahun\(tx, tahun\)/.test(bTerkunci),
  'lewat pool = di luar transaksi, kuncinya sia-sia')
cek('versiSebelum dibuang', !/function versiSebelum\(/.test(kData))

for (const [nama, isi] of [
  ['getPaguSumber', bSumber], ['getPaguEfektif', bEfektif], ['getPaguCap', bCap],
  ['paguPenerus', bPenerus], ['bacaPaguTerkunci', bTerkunci],
] as const) {
  cek(`${nama} tidak menulis MAX(versi_tanggal) sendiri`, isi.length > 0 && !/MAX\(versi_tanggal\)/.test(isi))
}

const BENTUK_ATURAN = /MAX\(versi_tanggal\) AS v FROM (pergeseran_dpa|dpa_blud) WHERE tahun_anggaran = \$\{tahun\}/g
const sisa: string[] = []
for (const f of ['lib/blud/pagu.ts', 'lib/blud/data.ts', 'lib/blud/realisasi-data.ts']) {
  for (const m of kode(baca(f)).matchAll(BENTUK_ATURAN)) sisa.push(`${f}: ${m[1]}`)
}
cek('Bentuk "MAX(versi_tanggal) AS v … tahun" hanya di sumber-pagu.ts', sisa.length === 0, sisa.join(', '))

console.log('\n── C. sumber-pagu.ts tetap modul daun ──')
const impor = [...kSumber.matchAll(/^import .* from '([^']+)'/gm)].map(m => m[1])
cek('Hanya mengimpor db (tipe) dan ./tanggal',
  impor.length === 2 && impor.includes('@/lib/data/db') && impor.includes('./tanggal'), impor.join(', '))
cek('Impor db-nya tipe saja (tidak menarik pool ke klien)', /^import type \{ Penanya \} from '@\/lib\/data\/db'/m.test(kSumber))
cek('Tanggal lewat toDateStr, bukan String().slice', /toDateStr\(v\)/.test(kSumber) && !/String\(v\)\.slice/.test(kSumber))

console.log(`\n${lulus} pemeriksaan LULUS · ${gagal} GAGAL`)
process.exit(gagal > 0 ? 1 : 0)
