// scripts/test-blud-sumber-pagu.mts — aturan sumber pagu BLUD tinggal di SATU tempat.
//
// Tahap 0 DPA Perubahan (docs/CONCEPT-blud-dpa-perubahan.md §8): enam salinan
// aturan "pagu diambil dari versi mana" disatukan ke lib/blud/sumber-pagu.ts,
// TANPA mengubah perilaku. Tahap 1 lalu mengubah aturannya sendiri (penanda
// Perubahan + acuan pergeseran). Dua pembanding menjaga keduanya:
//   A  — aturan LAMA (disalin dari kode sebelum Tahap 0): hasil HARUS identik pada
//        semua kombinasi TANPA penanda Perubahan.
//   A3 — aturan BARU, ditulis ulang dari kalimat konsep §4/§8, independen dari
//        implementasinya: enumerasi penanda × pergeseran ber-acuan × DPA.
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
  sumberPaguTahun, versiJadiSumberPagu, sumberPaguPenerus, tabelSumber, penandaUntukVersi,
  type TabelAnggaran, type VersiTulis, type PenandaPerubahan,
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
  if (syarat) { lulus++; console.log(`  ok    ${nama.padEnd(66)} ${catatan}`) }
  else        { gagal++; console.log(`  GAGAL ${nama.padEnd(66)} ${catatan}`) }
}

// ─── Penanya tiruan ──────────────────────────────────────────────────────────

interface VersiPg { versi: string; acuan: string }
interface Keadaan { pergeseran_dpa: VersiPg[]; dpa_blud: string[]; penanda: PenandaPerubahan[] }

const TAHUN = 2026
const POLA_PENANDA = /^SELECT versi_mulai, sumber_dasar, versi_dasar FROM blud_dpa_perubahan WHERE tahun_anggaran = \? ORDER BY versi_mulai( FOR SHARE)?$/
const POLA_DPA = /^SELECT MAX\(versi_tanggal\) AS v FROM dpa_blud WHERE tahun_anggaran = \?( AND versi_tanggal <> \?)?( FOR SHARE)?$/
const POLA_PG = /^SELECT MAX\(versi_tanggal\) AS v FROM pergeseran_dpa WHERE tahun_anggaran = \?( AND dpa_versi_tanggal >= \?)?( AND versi_tanggal <> \?)?( FOR SHARE)?$/

/** DATE ala mysql2 dgn pool '+07:00': tengah malam WIB sebagai objek Date. */
const sbgDate = (iso: string) => new Date(`${iso}T00:00:00+07:00`)
const maks = (a: string[]) => (a.length ? [...a].sort()[a.length - 1] : null)

function penanya(k: Keadaan, log: string[] = []): Penanya {
  return ((strings: TemplateStringsArray, ...values: unknown[]) => {
    const teks = strings.join('?').replace(/\s+/g, ' ').trim()
    log.push(teks)
    if (values[0] !== TAHUN) throw new Error(`tahun salah: ${String(values[0])}`)
    if (POLA_PENANDA.test(teks)) {
      return Promise.resolve([...k.penanda].sort((a, b) => a.versi_mulai.localeCompare(b.versi_mulai)).map(p => ({
        versi_mulai: sbgDate(p.versi_mulai), sumber_dasar: p.sumber_dasar, versi_dasar: sbgDate(p.versi_dasar),
      })))
    }
    let m = POLA_DPA.exec(teks)
    if (m) {
      const tanpa = m[1] ? String(values[1]) : null
      const v = maks(k.dpa_blud.filter(x => x !== tanpa))
      return Promise.resolve([{ v: v ? sbgDate(v) : null }])
    }
    m = POLA_PG.exec(teks)
    if (m) {
      let i = 1
      const acuanMin = m[1] ? String(values[i++]) : null
      const tanpa = m[2] ? String(values[i++]) : null
      const v = maks(k.pergeseran_dpa.filter(p => p.versi !== tanpa && (!acuanMin || p.acuan >= acuanMin)).map(p => p.versi))
      return Promise.resolve([{ v: v ? sbgDate(v) : null }])
    }
    throw new Error(`kueri tak dikenal penanya tiruan: ${teks}`)
  }) as unknown as Penanya
}

// ─── Logika LAMA — disalin dari getPaguSumber / versiJadiSumberPagu / paguPenerus ──
// (lib/blud/pagu.ts & lib/blud/data.ts di 6c897ec), hanya MAX diganti larik.

const maksDi = (a: string[], kurangDari: string) => maks(a.filter(v => v < kurangDari))

function lamaSumber(k: Keadaan): { tabel: TabelAnggaran | null; versi: string | null } {
  const pg = maks(k.pergeseran_dpa.map(p => p.versi))
  if (pg) return { tabel: 'pergeseran_dpa', versi: pg }
  const dpa = maks(k.dpa_blud)
  if (dpa) return { tabel: 'dpa_blud', versi: dpa }
  return { tabel: null, versi: null }
}

function lamaJadiSumber(k: Keadaan, table: TabelAnggaran, versi: string): boolean {
  const maxPergeseran = maks(k.pergeseran_dpa.map(p => p.versi))
  if (table === 'pergeseran_dpa') return !maxPergeseran || versi >= maxPergeseran
  if (maxPergeseran) return false
  const maxDpa = maks(k.dpa_blud)
  return !maxDpa || versi >= maxDpa
}

function lamaPenerus(
  k: Keadaan, table: TabelAnggaran, versi: string,
): { tabel: TabelAnggaran | null; versi: string | null } | null {
  const pgVersi = k.pergeseran_dpa.map(p => p.versi)
  const maxPergeseran = maks(pgVersi)
  if (table === 'dpa_blud') {
    if (maxPergeseran) return null
    const maxDpa = maks(k.dpa_blud)
    if (!maxDpa || maxDpa !== versi) return null
    const penerus = maksDi(k.dpa_blud, versi)
    return { tabel: penerus ? 'dpa_blud' : null, versi: penerus }
  }
  if (maxPergeseran !== versi) return null
  const penerus = maksDi(pgVersi, versi)
  if (penerus) return { tabel: 'pergeseran_dpa', versi: penerus }
  const dpaVersi = maks(k.dpa_blud)
  return { tabel: dpaVersi ? 'dpa_blud' : null, versi: dpaVersi }
}

// ─── Aturan BARU — ditulis ulang dari kalimat konsep, BUKAN dari kodenya ─────────
// §4: "Kalau tidak tersisa satu pun versi DPA >= versi_mulai, penandanya dihapus."
// §8: "M = versi_mulai Perubahan TERAKHIR; Pagu = Pergeseran terbaru yang ACUAN-nya
//      >= M → belum ada: DPA terbaru."  Nomor ke-n dihitung dari urutan (§4).

interface Hasil { tabel: TabelAnggaran | null; versi: string | null; ke: number | null }

function baruSumber(k: Keadaan): Hasil {
  const hidup = k.penanda.filter(p => k.dpa_blud.some(d => d >= p.versi_mulai)).map(p => p.versi_mulai).sort()
  const M = hidup.length ? hidup[hidup.length - 1] : null
  const ke = M ? hidup.length : null
  const pg = maks(k.pergeseran_dpa.filter(p => M === null || p.acuan >= M).map(p => p.versi))
  if (pg) return { tabel: 'pergeseran_dpa', versi: pg, ke }
  const dpa = maks(k.dpa_blud)
  if (dpa) return { tabel: 'dpa_blud', versi: dpa, ke }
  return { tabel: null, versi: null, ke: null }
}

/** Keadaan SESUDAH versi itu ditulis (menimpa yang setanggal). */
function denganTulis(k: Keadaan, t: VersiTulis): Keadaan {
  if (t.tabel === 'pergeseran_dpa') {
    return { ...k, pergeseran_dpa: [...k.pergeseran_dpa.filter(p => p.versi !== t.versi), { versi: t.versi, acuan: t.acuan }] }
  }
  const dpa = k.dpa_blud.includes(t.versi) ? k.dpa_blud : [...k.dpa_blud, t.versi]
  const penanda = t.mulaiPerubahan
    ? [...k.penanda, { versi_mulai: t.versi, sumber_dasar: 'DPA' as const, versi_dasar: t.versi }]
    : k.penanda
  return { ...k, dpa_blud: dpa, penanda }
}

function tanpaVersi(k: Keadaan, tabel: TabelAnggaran, versi: string): Keadaan {
  return tabel === 'pergeseran_dpa'
    ? { ...k, pergeseran_dpa: k.pergeseran_dpa.filter(p => p.versi !== versi) }
    : { ...k, dpa_blud: k.dpa_blud.filter(d => d !== versi) }
}

function baruJadiSumber(k: Keadaan, t: VersiTulis): boolean {
  const s = baruSumber(denganTulis(k, t))
  return s.tabel === t.tabel && s.versi === t.versi
}

function baruPenerus(k: Keadaan, tabel: TabelAnggaran, versi: string): Hasil | null {
  const kini = baruSumber(k)
  if (kini.tabel !== tabel || kini.versi !== versi) return null
  return baruSumber(tanpaVersi(k, tabel, versi))
}

// ─── A. Hasil identik dengan aturan lama (tanpa penanda) ─────────────────────

console.log('\n── A. Tanpa penanda Perubahan: identik dengan aturan lama (semua kombinasi) ──')

const TANGGAL = ['2026-01-31', '2026-03-15', '2026-06-30', '2026-08-31', '2026-10-08']
const CALON = ['2026-01-01', ...TANGGAL, '2026-12-31'] // + di bawah & di atas semua versi
const TABEL: TabelAnggaran[] = ['pergeseran_dpa', 'dpa_blud']

function himpunanBagian<T>(a: T[]): T[][] {
  const hasil: T[][] = []
  for (let m = 0; m < 1 << a.length; m++) hasil.push(a.filter((_, i) => m & (1 << i)))
  return hasil
}

const sama = (a: { tabel: unknown; versi: unknown } | null, b: { tabel: unknown; versi: unknown } | null) =>
  a === null || b === null ? a === b : a.tabel === b.tabel && a.versi === b.versi

/** Pergeseran dgn acuan "wajar": DPA terakhir <= tanggalnya (atau tanggalnya sendiri). */
const acuanWajar = (dpa: string[], v: string) => maks(dpa.filter(d => d <= v)) ?? v

let kombinasi = 0
let bandingSumber = 0, bedaSumber = 0
let bandingJadi = 0, bedaJadi = 0
let bandingPenerus = 0, bedaPenerus = 0
let penerusBukanNull = 0, jatuhKeDpa = 0
const contohBeda: string[] = []

for (const pgTgl of himpunanBagian(TANGGAL)) {
  for (const dpa of himpunanBagian(TANGGAL)) {
    kombinasi++
    const k: Keadaan = { pergeseran_dpa: pgTgl.map(v => ({ versi: v, acuan: acuanWajar(dpa, v) })), dpa_blud: dpa, penanda: [] }
    const q = penanya(k)

    const baru = await sumberPaguTahun(q, TAHUN)
    bandingSumber++
    if (!sama({ tabel: tabelSumber(baru), versi: baru.versi }, lamaSumber(k)) || baru.perubahan_ke !== null) {
      bedaSumber++
      if (contohBeda.length < 5) contohBeda.push(`sumber pg=[${pgTgl}] dpa=[${dpa}]`)
    }

    for (const t of TABEL) {
      for (const v of CALON) {
        bandingJadi++
        const tulis: VersiTulis = t === 'pergeseran_dpa'
          ? { tabel: t, versi: v, acuan: acuanWajar(dpa, v) }
          : { tabel: t, versi: v }
        if ((await versiJadiSumberPagu(q, TAHUN, tulis)) !== lamaJadiSumber(k, t, v)) {
          bedaJadi++
          if (contohBeda.length < 5) contohBeda.push(`jadiSumber ${t} ${v} pg=[${pgTgl}] dpa=[${dpa}]`)
        }

        bandingPenerus++
        const pb = await sumberPaguPenerus(q, t, TAHUN, v)
        const pl = lamaPenerus(k, t, v)
        if (pl) penerusBukanNull++
        if (pl && t === 'pergeseran_dpa' && pl.tabel === 'dpa_blud') jatuhKeDpa++
        if (!sama(pb && { tabel: tabelSumber(pb), versi: pb.versi }, pl)) {
          bedaPenerus++
          if (contohBeda.length < 5) contohBeda.push(`penerus ${t} ${v} pg=[${pgTgl}] dpa=[${dpa}]`)
        }
      }
    }
  }
}

cek('Kombinasi versi DPA × Pergeseran yang dicoba', kombinasi === 1024, `${kombinasi}`)
cek('getPaguSumber: sumber + versi identik, perubahan_ke null', bedaSumber === 0, `${bandingSumber} dibanding, ${bedaSumber} beda`)
cek('versiJadiSumberPagu: jawaban identik', bedaJadi === 0, `${bandingJadi} dibanding, ${bedaJadi} beda`)
cek('paguPenerus: null / tabel / versi penerus identik', bedaPenerus === 0, `${bandingPenerus} dibanding, ${bedaPenerus} beda`)
// Tanpa dua pemeriksaan ini, A bisa lulus karena semua jawaban kebetulan null.
cek('…dan kasus penerus bukan-null benar-benar teruji', penerusBukanNull > 500, `${penerusBukanNull}`)
cek('…termasuk "pergeseran terakhir hilang → jatuh ke DPA terbaru"', jatuhKeDpa > 50, `${jatuhKeDpa}`)
for (const c of contohBeda.splice(0)) console.log(`        beda: ${c}`)

// ─── A3. Aturan baru: penanda × pergeseran ber-acuan × DPA ─────────────────────

console.log('\n── A3. Aturan baru (§8) — dibanding dengan tulisan ulang dari konsep ──')

const T4 = ['2026-01-31', '2026-04-30', '2026-07-31', '2026-10-08']
const PENANDA_SET = [[], ...T4.map(t => [t]), ...T4.flatMap((a, i) => T4.slice(i + 1).map(b => [a, b]))]
let kombinasiBaru = 0
let bSumber = 0, dSumber = 0, bJadi = 0, dJadi = 0, bPen = 0, dPen = 0
let adaBabak = 0, pgBabakLamaDiabaikan = 0, penerusBuangPenanda = 0, jadiSumberLewatMulai = 0
for (const dpa of himpunanBagian(T4)) {
  for (const pgTgl of himpunanBagian(T4)) {
    for (const modus of ['terbaru', 'tertua'] as const) {
      for (const pen of PENANDA_SET) {
        kombinasiBaru++
        // Acuan: DPA terbaru <= tanggalnya (pergeseran babak sesuai), atau DPA tertua
        // (babak lama yang tertinggal) — dua-duanya keadaan yang benar-benar bisa ada.
        const acuanUntuk = (v: string) => (modus === 'terbaru' ? acuanWajar(dpa, v) : ([...dpa].sort()[0] ?? v))
        const k: Keadaan = {
          dpa_blud: dpa,
          pergeseran_dpa: pgTgl.map(v => ({ versi: v, acuan: acuanUntuk(v) })),
          penanda: pen.map(m => ({ versi_mulai: m, sumber_dasar: 'PERGESERAN', versi_dasar: m })),
        }
        const q = penanya(k)
        const s = await sumberPaguTahun(q, TAHUN)
        const r = baruSumber(k)
        bSumber++
        if (r.ke) adaBabak++
        if (r.ke && k.pergeseran_dpa.length && r.tabel === 'dpa_blud') pgBabakLamaDiabaikan++
        if (tabelSumber(s) !== r.tabel || s.versi !== r.versi || s.perubahan_ke !== r.ke) {
          dSumber++
          if (contohBeda.length < 6) contohBeda.push(`sumber dpa=[${dpa}] pg=${JSON.stringify(k.pergeseran_dpa)} pen=[${pen}] → ${s.sumber} ${s.versi} ke${s.perubahan_ke} / ref ${r.tabel} ${r.versi} ke${r.ke}`)
        }
        for (const v of CALON) {
          const tulisan: VersiTulis[] = [
            { tabel: 'dpa_blud', versi: v },
            { tabel: 'dpa_blud', versi: v, mulaiPerubahan: true },
            ...[...new Set([...dpa, v])].filter(a => a <= v).map(a => ({ tabel: 'pergeseran_dpa' as const, versi: v, acuan: a })),
          ]
          for (const t of tulisan) {
            bJadi++
            const jb = await versiJadiSumberPagu(q, TAHUN, t)
            const jr = baruJadiSumber(k, t)
            if (t.tabel === 'dpa_blud' && t.mulaiPerubahan && jr && !baruJadiSumber(k, { tabel: 'dpa_blud', versi: v })) jadiSumberLewatMulai++
            if (jb !== jr) {
              dJadi++
              if (contohBeda.length < 6) contohBeda.push(`jadi ${JSON.stringify(t)} dpa=[${dpa}] pg=${JSON.stringify(k.pergeseran_dpa)} pen=[${pen}] → ${jb} / ref ${jr}`)
            }
          }
          for (const t of TABEL) {
            bPen++
            const pb = await sumberPaguPenerus(q, t, TAHUN, v)
            const pr = baruPenerus(k, t, v)
            if (pr && t === 'dpa_blud' && r.ke && !pr.ke) penerusBuangPenanda++
            const beda = pb === null || pr === null
              ? pb !== pr
              : tabelSumber(pb) !== pr.tabel || pb.versi !== pr.versi || pb.perubahan_ke !== pr.ke
            if (beda) {
              dPen++
              if (contohBeda.length < 6) contohBeda.push(`penerus ${t} ${v} dpa=[${dpa}] pg=${JSON.stringify(k.pergeseran_dpa)} pen=[${pen}]`)
            }
          }
        }
      }
    }
  }
}
cek('Kombinasi penanda × pergeseran ber-acuan × DPA', kombinasiBaru === 16 * 16 * 2 * 11, `${kombinasiBaru}`)
cek('sumberPaguTahun: sumber, versi, perubahan_ke sesuai konsep', dSumber === 0, `${bSumber} dibanding, ${dSumber} beda`)
cek('versiJadiSumberPagu (dpa, dpa+mulai, pergeseran×acuan) sesuai', dJadi === 0, `${bJadi} dibanding, ${dJadi} beda`)
cek('sumberPaguPenerus sesuai — termasuk penanda yang ikut lenyap', dPen === 0, `${bPen} dibanding, ${dPen} beda`)
// Pembanding yang lulus karena babak Perubahan tidak pernah muncul tidak membuktikan apa-apa.
cek('…babak Perubahan benar-benar muncul', adaBabak > 1000, `${adaBabak}`)
cek('…pergeseran babak lama diabaikan (pagu = DPA Perubahan)', pgBabakLamaDiabaikan > 100, `${pgBabakLamaDiabaikan}`)
cek('…penanda khayalan membuat DPA jadi sumber (jebakan 2)', jadiSumberLewatMulai > 100, `${jadiSumberLewatMulai}`)
cek('…menghapus versi Perubahan terakhir membuang babaknya (jebakan 3)', penerusBuangPenanda > 50, `${penerusBuangPenanda}`)
for (const c of contohBeda) console.log(`        beda: ${c}`)

console.log('\n── A2. Kasus bernama ──')
{
  const k: Keadaan = { pergeseran_dpa: [{ versi: '2026-01-31', acuan: '2026-01-31' }], dpa_blud: ['2026-01-31', '2026-08-31'], penanda: [] }
  const s = await sumberPaguTahun(penanya(k), TAHUN)
  cek('Pergeseran menang atas DPA walau DPA-nya lebih baru (tanpa Perubahan)',
    s.sumber === 'PERGESERAN' && s.versi === '2026-01-31', `${s.sumber} ${s.versi}`)
  cek('Menyimpan DPA di tahun ber-Pergeseran tidak menyentuh pagu',
    !(await versiJadiSumberPagu(penanya(k), TAHUN, { tabel: 'dpa_blud', versi: '2026-10-08' })))
  const p = await sumberPaguPenerus(penanya(k), 'pergeseran_dpa', TAHUN, '2026-01-31')
  cek('Hapus satu-satunya Pergeseran → pagu jatuh ke DPA terbaru',
    p?.sumber === 'DPA' && p.versi === '2026-08-31', `${p?.sumber} ${p?.versi}`)
  cek('Hapus versi DPA lama → null (bukan sumber pagu)',
    (await sumberPaguPenerus(penanya(k), 'dpa_blud', TAHUN, '2026-08-31')) === null)
}
{
  const s = await sumberPaguTahun(penanya({ pergeseran_dpa: [], dpa_blud: [], penanda: [] }), TAHUN)
  cek('Tahun kosong → KOSONG, versi null', s.sumber === 'KOSONG' && s.versi === null && s.perubahan_ke === null)
}
// Konsep §1: DPA murni 31 Jan, Pergeseran 31 Mar (acuan 31 Jan) = pagu. Perubahan
// dibuat 9 Okt dari Pergeseran 31 Mar.
const MURNI = '2026-01-31', PG_LAMA = '2026-03-31', MULAI = '2026-10-09'
const contoh: Keadaan = {
  dpa_blud: [MURNI, MULAI],
  pergeseran_dpa: [{ versi: PG_LAMA, acuan: MURNI }],
  penanda: [{ versi_mulai: MULAI, sumber_dasar: 'PERGESERAN', versi_dasar: PG_LAMA }],
}
{
  const s = await sumberPaguTahun(penanya(contoh), TAHUN)
  cek('§1 sesudah Perubahan: pagu pindah ke DPA Perubahan ke-1',
    s.sumber === 'DPA' && s.versi === MULAI && s.perubahan_ke === 1, `${s.sumber} ${s.versi} ke-${s.perubahan_ke}`)
  const sebelum = await sumberPaguTahun(penanya({ ...contoh, dpa_blud: [MURNI], penanda: [] }), TAHUN)
  cek('§1 sebelum Perubahan: pagu = Pergeseran 31 Mar', sebelum.sumber === 'PERGESERAN' && sebelum.versi === PG_LAMA)
}
{
  // Pergeseran bertanggal hari Perubahan, dibuat SEBELUM Perubahan → acuannya murni.
  const k: Keadaan = { ...contoh, pergeseran_dpa: [...contoh.pergeseran_dpa, { versi: MULAI, acuan: MURNI }] }
  const s = await sumberPaguTahun(penanya(k), TAHUN)
  cek('Pergeseran tgl Perubahan beracuan murni = babak lama, bukan pagu', s.sumber === 'DPA' && s.versi === MULAI)
  const k2: Keadaan = { ...contoh, pergeseran_dpa: [...contoh.pergeseran_dpa, { versi: '2026-10-20', acuan: MULAI }] }
  const s2 = await sumberPaguTahun(penanya(k2), TAHUN)
  cek('Pergeseran beracuan DPA Perubahan = pagu, babak ke-1',
    s2.sumber === 'PERGESERAN' && s2.versi === '2026-10-20' && s2.perubahan_ke === 1)
}
{
  // Jebakan 1 — pergeseran khayalan WAJIB membawa acuan.
  const q = penanya(contoh)
  cek('Jebakan 1: pergeseran babak lama (acuan murni) bukan sumber pagu',
    !(await versiJadiSumberPagu(q, TAHUN, { tabel: 'pergeseran_dpa', versi: '2026-10-20', acuan: MURNI })))
  cek('Jebakan 1: pergeseran beracuan Perubahan = sumber pagu',
    await versiJadiSumberPagu(q, TAHUN, { tabel: 'pergeseran_dpa', versi: '2026-10-20', acuan: MULAI }))
}
{
  // Jebakan 2 — simpanan yang MEMBUAT Perubahan (penanda belum ada).
  const belum: Keadaan = { ...contoh, dpa_blud: [MURNI], penanda: [] }
  const q = penanya(belum)
  cek('Jebakan 2: tanpa penanda khayalan → "bukan sumber pagu" (R2 bocor)',
    !(await versiJadiSumberPagu(q, TAHUN, { tabel: 'dpa_blud', versi: MULAI })))
  cek('Jebakan 2: dengan penanda khayalan → sumber pagu, pagar R2 jalan',
    await versiJadiSumberPagu(q, TAHUN, { tabel: 'dpa_blud', versi: MULAI, mulaiPerubahan: true }))
}
{
  // Jebakan 3 — hapus versi Perubahan TERAKHIR → penanda ikut lenyap → pergeseran lama.
  const p = await sumberPaguPenerus(penanya(contoh), 'dpa_blud', TAHUN, MULAI)
  cek('Jebakan 3: hapus Perubahan terakhir → pagu kembali ke Pergeseran lama',
    p?.sumber === 'PERGESERAN' && p.versi === PG_LAMA && p.perubahan_ke === null, `${p?.sumber} ${p?.versi}`)
  const revisi: Keadaan = { ...contoh, dpa_blud: [MURNI, MULAI, '2026-10-12'] }
  const p2 = await sumberPaguPenerus(penanya(revisi), 'dpa_blud', TAHUN, '2026-10-12')
  cek('…tapi kalau masih ada versi Perubahan lain → tetap babak Perubahan',
    p2?.sumber === 'DPA' && p2.versi === MULAI && p2.perubahan_ke === 1)
}
{
  const ke2: Keadaan = {
    dpa_blud: [MURNI, MULAI, '2026-11-20'],
    pergeseran_dpa: [{ versi: PG_LAMA, acuan: MURNI }, { versi: '2026-10-20', acuan: MULAI }],
    penanda: [contoh.penanda[0], { versi_mulai: '2026-11-20', sumber_dasar: 'PERGESERAN', versi_dasar: '2026-10-20' }],
  }
  const s = await sumberPaguTahun(penanya(ke2), TAHUN)
  cek('Perubahan ke-2: pagu = DPA 20 Nov, nomor 2', s.sumber === 'DPA' && s.versi === '2026-11-20' && s.perubahan_ke === 2)
  cek('penandaUntukVersi memilih penanda terakhir <= versi',
    penandaUntukVersi(ke2.penanda, '2026-11-01')?.versi_mulai === MULAI
    && penandaUntukVersi(ke2.penanda, '2026-11-20')?.versi_mulai === '2026-11-20'
    && penandaUntukVersi(ke2.penanda, '2026-09-30') === null)
}
{
  // Jalur yang dipanggil layar Realisasi tiap 30 detik: penanda + MAX polos, dan DPA
  // tidak ditanya kalau Pergeseran sudah menjawab.
  const log: string[] = []
  await sumberPaguTahun(penanya({ pergeseran_dpa: [{ versi: '2026-01-31', acuan: '2026-01-31' }], dpa_blud: ['2026-08-31'], penanda: [] }, log), TAHUN)
  cek('Tahun tanpa Perubahan: tepat 2 kueri (penanda + MAX polos)',
    log.length === 2 && POLA_PENANDA.test(log[0]) && !log[1].includes('<>') && !log[1].includes('>='),
    `${log.length} kueri`)
}
{
  // Mode terkunci (R7): SEMUA kuerinya locking read.
  const log: string[] = []
  await sumberPaguTahun(penanya(contoh, log), TAHUN, {}, { terkunci: true })
  cek('Mode terkunci: semua kueri FOR SHARE', log.length > 0 && log.every(l => l.endsWith('FOR SHARE')), `${log.length} kueri`)
  let lempar = false
  try { await sumberPaguTahun(penanya(contoh), TAHUN, { tanpa: { tabel: 'dpa_blud', versi: MULAI } }, { terkunci: true }) } catch { lempar = true }
  cek('Mode terkunci + andai-andai ditolak (bukan keadaan nyata)', lempar)
}

// ─── B. Tidak ada salinan aturan yang tersisa ────────────────────────────────

console.log('\n── B. Satu tempat — enam pemakai lama memanggilnya ──')

const kPagu = kode(baca('lib/blud/pagu.ts'))
const kData = kode(baca('lib/blud/data.ts'))
const kReal = kode(baca('lib/blud/realisasi-data.ts'))
const kSumber = kode(baca('lib/blud/sumber-pagu.ts'))

const bSumberF = badan(kPagu, 'getPaguSumber')
const bEfektif = badan(kPagu, 'getPaguEfektif')
const bCap = badan(kPagu, 'getPaguCap')
const bPenerus = badan(kData, 'paguPenerus')
const bTerkunci = badan(kReal, 'bacaPaguTerkunci')

cek('getPaguSumber → sumberPaguTahun(sql, tahun)', /return sumberPaguTahun\(sql, tahun\)/.test(bSumberF))
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
cek('bacaPaguTerkunci → sumberPaguTahun(tx, tahun, …)', /await sumberPaguTahun\(tx, tahun[,)]/.test(bTerkunci),
  'lewat pool = di luar transaksi, kuncinya sia-sia')
cek('versiSebelum dibuang', !/function versiSebelum\(/.test(kData))

for (const [nama, isi] of [
  ['getPaguSumber', bSumberF], ['getPaguEfektif', bEfektif], ['getPaguCap', bCap],
  ['paguPenerus', bPenerus], ['bacaPaguTerkunci', bTerkunci],
] as const) {
  cek(`${nama} tidak menulis MAX(versi_tanggal) sendiri`, isi.length > 0 && !/MAX\(versi_tanggal\)/.test(isi))
}

const BENTUK_ATURAN = /MAX\(versi_tanggal\) AS v FROM (pergeseran_dpa|dpa_blud) WHERE tahun_anggaran = \$\{tahun\}/g
const sisa: string[] = []
for (const f of ['lib/blud/pagu.ts', 'lib/blud/data.ts', 'lib/blud/realisasi-data.ts', 'lib/blud/perubahan-data.ts']) {
  for (const m of kode(baca(f)).matchAll(BENTUK_ATURAN)) sisa.push(`${f}: ${m[1]}`)
}
cek('Bentuk "MAX(versi_tanggal) AS v … tahun" hanya di sumber-pagu.ts', sisa.length === 0, sisa.join(', '))
cek('Tabel penanda hanya dibaca sumber-pagu.ts (penandaPerubahan)',
  !/FROM blud_dpa_perubahan/.test(kData) && !/FROM blud_dpa_perubahan/.test(kPagu) && !/FROM blud_dpa_perubahan/.test(kReal))

// Jebakan 1 di sisi pemanggil: setiap VersiTulis pergeseran di data.ts membawa acuan.
const tulisPg = kData.match(/\{ tabel: 'pergeseran_dpa', versi: versiTanggal[^}]*\}/g) ?? []
cek('Setiap VersiTulis pergeseran di data.ts membawa acuan dpaVersiTanggal',
  tulisPg.length === 2 && tulisPg.every(t => /acuan: dpaVersiTanggal/.test(t)), `${tulisPg.length} tempat`)
// Jebakan 2 di sisi pemanggil: simpanan pembuat Perubahan membawa penanda khayalan.
const bSave = badan(kData, 'saveDpa')
cek('saveDpa: VersiTulis membawa mulaiPerubahan: !!asalPerubahan',
  /\{ tabel: 'dpa_blud', versi: versiTanggal, mulaiPerubahan: !!asalPerubahan \}/.test(bSave))

console.log('\n── C. sumber-pagu.ts tetap modul daun ──')
const impor = [...kSumber.matchAll(/^import .* from '([^']+)'/gm)].map(m => m[1])
cek('Hanya mengimpor db (tipe) dan ./tanggal',
  impor.length === 2 && impor.includes('@/lib/data/db') && impor.includes('./tanggal'), impor.join(', '))
cek('Impor db-nya tipe saja (tidak menarik pool ke klien)', /^import type \{ Penanya \} from '@\/lib\/data\/db'/m.test(kSumber))
cek('Tanggal lewat toDateStr, bukan String().slice', /toDateStr\(/.test(kSumber) && !/String\(v\)\.slice/.test(kSumber))

console.log(`\n${lulus} pemeriksaan LULUS · ${gagal} GAGAL`)
process.exit(gagal > 0 ? 1 : 0)
