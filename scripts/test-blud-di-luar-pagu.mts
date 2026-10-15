// scripts/test-blud-di-luar-pagu.mts — belanja yang rekeningnya tidak ada di versi pagu berlaku.
//
//   npx tsx scripts/test-blud-di-luar-pagu.mts            (bagian F memakai MySQL, tahun 2097)
//   SIMPAN=1 npx tsx scripts/test-blud-di-luar-pagu.mts   (data 2097 dibiarkan untuk dicoba di layar)
//
// Satu aturan (`hitungDiLuarPagu`) untuk Beranda, route pagu (layar Realisasi), dan sumber BLUD
// di LKJIP. Bagian F memutar kode sungguhan atas DPA + Pergeseran + transaksi tahun 2097 yang
// dibuat dan dihapus skrip ini sendiri.

import { readFileSync } from 'node:fs'
import mysql from 'mysql2/promise'
import {
  hitungDiLuarPagu, daftarDiLuarPagu, kalimatDiLuarPagu, namaRekeningDiLuarPagu,
  BATAS_CONTOH_DI_LUAR_PAGU, type DiLuarPagu,
} from '../lib/blud/di-luar-pagu'
import { tarikBludRealisasi, setelanBludRealisasi } from '../lib/lkjip/sumber/blud-realisasi'
import type { ApiResult } from '../lib/shared/api'
import type { AmbilJson } from '../lib/lkjip/sumber/umum'

try {
  for (const b of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split(/\r?\n/)) {
    const t = b.trim()
    const i = t.indexOf('=')
    if (!t || t.startsWith('#') || i < 0) continue
    const k = t.slice(0, i).trim()
    if (process.env[k] === undefined) process.env[k] = t.slice(i + 1).trim().replace(/^["']|["']$/g, '')
  }
} catch { /* tanpa .env.local: bagian DB dilewati */ }

let lulus = 0
const gagal: string[] = []
function ok(nama: string, syarat: boolean, ket = '') {
  if (syarat) { lulus++; console.log(`  ok  ${nama}`) }
  else { gagal.push(nama); console.log(`FAIL  ${nama}${ket ? ' — ' + ket : ''}`) }
}
const baca = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
const tanpaKomentar = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1').replace(/\{\/\*[\s\S]*?\*\/\}/g, '')

// ─── A. Aturan murni ──────────────────────────────────────────────────────────
console.log('\nA. hitungDiLuarPagu')
const pohon = [{ anggaran_key: 'R' }, { anggaran_key: 'A' }]
const h = hitungDiLuarPagu(pohon, new Map([
  ['R', 900], ['A', 500],          // ada di pohon → bukan urusan fungsi ini
  ['Y', 3_000_000], ['X', 15_000_000],
  ['NOL', 0.004],                  // pengembalian menutup belanjanya → tidak disebut
  ['BALIK', -4_000_000],           // pengembalian bersih tetap uang yang tak terhitung
]))
ok('A1 hanya kunci yang TIDAK ada di pohon; nol (≤ 0,005) dilewati; nilai bertanda dijumlah',
  h.nilai === 14_000_000 && h.kunci.length === 3, JSON.stringify(h))
ok('A2 urut nilai MUTLAK terbesar dulu (−4 jt sebelum 3 jt — urut bertanda akan menaruhnya terakhir)',
  h.kunci.map(k => k.anggaran_key).join() === 'X,BALIK,Y', h.kunci.map(k => k.anggaran_key).join())
ok('A3 tanpa belanja di luar pohon → nol, bukan NaN', JSON.stringify(hitungDiLuarPagu(pohon, new Map([['A', 1]]))) === '{"nilai":0,"kunci":[]}')
ok('A4 kunci kembar nilai sama → urutan tetap (kunci menurut abjad)',
  hitungDiLuarPagu([], new Map([['b', 5], ['a', 5]])).kunci.map(k => k.anggaran_key).join() === 'a,b')

console.log('\nB. Kalimat')
const d: DiLuarPagu = {
  nilai: 19_000_000.4, rekening: 5,
  contoh: [
    { anggaran_key: 'X', kode: '5.1.02.99', uraian: 'Biaya film badge lama', nilai: 15_000_000 },
    { anggaran_key: 'Y', kode: '', uraian: 'U'.repeat(80), nilai: 3_000_000.6 },
    { anggaran_key: 'Z', kode: '', uraian: '', nilai: 1_000_000 },
  ],
}
ok('B1 nama = kode + uraian + nilai bulat bertitik', namaRekeningDiLuarPagu(d.contoh[0]) === '5.1.02.99 Biaya film badge lama (Rp 15.000.000)', namaRekeningDiLuarPagu(d.contoh[0]))
ok('B2 uraian panjang dipotong 60 huruf; nilai dibulatkan seperti layar', namaRekeningDiLuarPagu(d.contoh[1]) === `${'U'.repeat(59)}… (Rp 3.000.001)`, namaRekeningDiLuarPagu(d.contoh[1]))
ok('B3 kode & uraian tak dikenal → "rekening tanpa nama", bukan string kosong', namaRekeningDiLuarPagu(d.contoh[2]) === 'rekening tanpa nama (Rp 1.000.000)')
ok('B4 sisa di luar contoh disebut "dan n rekening lain"', daftarDiLuarPagu(d).endsWith('; dan 2 rekening lain'), daftarDiLuarPagu(d))
const k = kalimatDiLuarPagu(d, 's/d Juni') ?? ''
ok('B5 kalimat LKJIP: nominal + titik waktu + jumlah rekening + TIDAK ikut dihitung + daftar',
  k.startsWith('Belanja Rp 19.000.000 s/d Juni dari 5 rekening yang sudah tidak ada di versi pagu ini TIDAK ikut dihitung di tabel: 5.1.02.99'), k)
ok('B6 nol rekening → tanpa kalimat', kalimatDiLuarPagu({ nilai: 0, rekening: 0, contoh: [] }, 's/d Juni') === null)
ok('B7 batas contoh 3 (kalimat tetap di bawah 1000 huruf skema catatan LKJIP)', BATAS_CONTOH_DI_LUAR_PAGU === 3 && k.length < 1000)

// ─── C. Pemakai aturan — satu rumus, bukan salinan ───────────────────────────
console.log('\nC. Pemakai')
const ringkas = tanpaKomentar(baca('lib/blud/serapan-ringkas.ts'))
ok('C1 Beranda (hitungRingkas) memakai hitungDiLuarPagu, tidak lagi punya perulangan sendiri',
  /const diLuar = hitungDiLuarPagu\(baris, terserapMap\)/.test(ringkas) && !/adaDiPohon/.test(ringkas))
const { hitungRingkas } = await import('../lib/blud/serapan-ringkas')
const hr = hitungRingkas([
  { anggaran_key: 'R', kode_rekening: '5', uraian: 'R', tipe_baris: 'GRANDMASTER', parent_key: null, urutan: 0, pagu: 100, is_leaf: false },
  { anggaran_key: 'A', kode_rekening: '5.1', uraian: 'A', tipe_baris: 'CHILD', parent_key: 'R', urutan: 1, pagu: 100, is_leaf: true },
], new Map([['A', 40], ['X', 15], ['Y', 3]]))
ok('C2 angka Beranda = angka fungsi bersama (yatim 18, 2 rekening; terserap tanpa yatim)', hr.yatim === 18 && hr.yatimRekening === 2 && hr.terserap === 40, JSON.stringify(hr))

const route = tanpaKomentar(baca('app/api/blud/realisasi/pagu/route.ts'))
ok('C3 route: dengan bulan → s.d. bulan (bulan_ini + bulan_lalu), tanpa bulan → setahun — titik waktu kolom s.d.',
  /const nilaiAcuan = periode\s*\?\s*new Map\(\[\.\.\.periode\]\.map\(\(\[key, v\]\) => \[key, v\.bulan_ini \+ v\.bulan_lalu\]\)\)\s*:\s*terserap/.test(route))
ok('C4 route: dihitung dengan hitungDiLuarPagu atas baris pagu yang sama dengan tabel',
  /hitungDiLuarPagu\(baris, nilaiAcuan\)/.test(route))
ok('C5 route: nama rekening lama hanya dicari untuk CONTOH (bukan semua kunci)',
  /const contoh = luar\.kunci\.slice\(0, BATAS_CONTOH_DI_LUAR_PAGU\)/.test(route) && /getRekeningLama\(tahun, contoh\.map\(k => k\.anggaran_key\)\)/.test(route))
ok('C6 route: di_luar_pagu ikut jawaban, rekening = SEMUA kunci (bukan jumlah contoh)',
  /rekening: luar\.kunci\.length/.test(route) && /pagu_sumber: sumber, di_luar_pagu \}/.test(route))

const layar = tanpaKomentar(baca('app/(dashboard)/blud/realisasi/realisasi-client.tsx'))
ok('C7 layar Realisasi menyimpan di_luar_pagu tiap muat (termasuk muat "angka" — transaksi baru)',
  /setDiLuar\(json\.di_luar_pagu \?\? null\)/.test(layar))
ok('C8 layar Realisasi menyebutnya: nominal, jumlah rekening, daftar yang sama dengan LKJIP',
  /diLuar && diLuar\.rekening > 0 &&/.test(layar) && /Rp \{rp\(diLuar\.nilai\)\}/.test(layar) && /\{daftarDiLuarPagu\(diLuar\)\}/.test(layar))
ok('C9 spanduk tidak dibatasi tampilan Per Rekening (JUMLAH Per PJ juga tanpa uang ini)',
  !/tampilan === 'rekening' && diLuar/.test(layar))

// ─── D. Sumber BLUD di LKJIP ─────────────────────────────────────────────────
console.log('\nD. Sumber BLUD di LKJIP')
const barisLayar = (kunci: string, induk: string | null, pagu: number, sd: number) => ({
  anggaran_key: kunci, kode_rekening: `5.${kunci}`, uraian: `Uraian ${kunci}`, parent_key: induk, is_leaf: induk !== null,
  penanggung_jawab: '', pagu, terserap: sd, bulan_ini: 0, bulan_lalu: sd, sd_bulan: sd, sisa: pagu - sd, persen: pagu ? sd / pagu * 100 : 0,
})
const ambil = (diLuar?: DiLuarPagu): AmbilJson => async () => ({
  ok: true, data: [barisLayar('R', null, 100, 40), barisLayar('A', 'R', 100, 40)],
  pagu_sumber: { sumber: 'DPA', versi: '2097-01-10', perubahan_ke: null }, ...(diLuar ? { di_luar_pagu: diLuar } : {}),
}) as ApiResult<unknown>
const sB = (lain: Record<string, unknown> = {}) => setelanBludRealisasi({ tahun: 2097, sdBulan: 6, ...lain }, 2097)
const hRek = await tarikBludRealisasi(sB(), ambil(d))
ok('D1 Per Rekening: catatan memuat kalimat bersama dengan titik waktu setelan ("s/d Juni")',
  hRek.catatan.includes(kalimatDiLuarPagu(d, 's/d Juni')!), hRek.catatan.join(' | '))
const hPj = await tarikBludRealisasi(sB({ tampilan: 'pj' }), ambil(d))
ok('D2 Per PJ juga — "Belum ada PJ" + JUMLAH sama-sama tanpa uang ini', hPj.catatan.some(c => c.startsWith('Belanja Rp 19.000.000 s/d Juni')))
const hBersih = await tarikBludRealisasi(sB(), ambil({ nilai: 0, rekening: 0, contoh: [] }))
const hLama = await tarikBludRealisasi(sB(), ambil())
ok('D3 nol rekening / server lama tanpa isian → tanpa kalimat', !hBersih.catatan.some(c => c.startsWith('Belanja')) && !hLama.catatan.some(c => c.startsWith('Belanja')))
ok('D4 baris tabel TIDAK berubah (uangnya disebut, bukan dijumlahkan ke realisasi)',
  JSON.stringify(hRek.baris) === JSON.stringify(hBersih.baris))

// ─── F. MySQL sungguhan (tahun 2097) ─────────────────────────────────────────
console.log('\nF. MySQL — DPA, Pergeseran, transaksi tahun 2097')
const TAHUN = 2097
const KUNCI = (s: string) => `uji-dlp-${s}`
const URAIAN_TX = 'UJI di luar pagu'
let c: mysql.Connection | null = null
try {
  c = await mysql.createConnection({
    host: process.env.MYSQL_HOST, port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER, password: process.env.MYSQL_PASSWORD, database: process.env.MYSQL_DATABASE,
  })
} catch (e) {
  console.log(`DILEWATI bagian F: MySQL tidak bisa dihubungi (${(e as { code?: string }).code ?? e})`)
}

async function bersihkan(k: mysql.Connection) {
  await k.query(`DELETE a FROM blud_realisasi_alokasi a JOIN blud_realisasi_tx t ON t.id = a.tx_id
                 WHERE t.tahun_anggaran = ? AND t.uraian LIKE ?`, [TAHUN, `${URAIAN_TX}%`])
  await k.query('DELETE FROM blud_realisasi_tx WHERE tahun_anggaran = ? AND uraian LIKE ?', [TAHUN, `${URAIAN_TX}%`])
  await k.query('DELETE FROM dpa_blud WHERE tahun_anggaran = ? AND anggaran_key LIKE ?', [TAHUN, 'uji-dlp-%'])
  await k.query('DELETE FROM pergeseran_dpa WHERE tahun_anggaran = ? AND anggaran_key LIKE ?', [TAHUN, 'uji-dlp-%'])
}
async function hitung(k: mysql.Connection, tabel: string) {
  const [r] = await k.query(`SELECT COUNT(*) AS n FROM ${tabel} WHERE tahun_anggaran = ?`, [TAHUN]) as [Array<{ n: number }>, unknown]
  return Number(r[0].n)
}

if (c) {
  const k = c
  await bersihkan(k)
  const asing = await Promise.all(['dpa_blud', 'pergeseran_dpa', 'blud_realisasi_tx', 'blud_realisasi_alokasi', 'blud_dpa_perubahan'].map(t => hitung(k, t)))
  if (asing.some(n => n > 0)) {
    ok('F0 tahun 2097 kosong sebelum uji (data milik orang lain tidak disentuh)', false, `sisa: ${asing.join('/')}`)
  } else {
    const dpa = (versi: string, rows: Array<[string, string | null, string, string, number]>) => Promise.all(rows.map(([r, p, kode, uraian, jumlah], i) =>
      k.query(`INSERT INTO dpa_blud (tahun_anggaran, versi_tanggal, row_id, parent_id, anggaran_key, kode_rekening, uraian, jumlah, tipe_baris, urutan)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [TAHUN, versi, r, p, KUNCI(r), kode, uraian, jumlah, p ? 'CHILD' : 'GRANDMASTER', i])))
    const geser = (versi: string, rows: Array<[string, string | null, string, string, number]>) => Promise.all(rows.map(([r, p, kode, uraian, pagu], i) =>
      k.query(`INSERT INTO pergeseran_dpa (tahun_anggaran, versi_tanggal, dpa_versi_tanggal, row_id, parent_id, anggaran_key, kode_rekening, uraian, jumlah, pergeseran, tipe_baris, urutan)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [TAHUN, versi, '2097-01-10', r, p, KUNCI(r), kode, uraian, pagu, pagu, p ? 'CHILD' : 'GRANDMASTER', i])))
    await dpa('2097-01-10', [
      ['R', null, '5', 'BELANJA', 100_000_000], ['A', 'R', '5.1.01', 'Belanja ATK', 60_000_000],
      ['X', 'R', '5.1.02.99', 'Biaya film badge lama', 40_000_000], ['Y', 'R', '5.1.03', 'Y dari DPA', 0], ['Z', 'R', '5.1.04', 'Z dari DPA', 0],
    ])
    await geser('2097-01-10', [['Z', null, '5.1.04', 'Z dari Pergeseran', 0]])   // tanggal sama dgn DPA → Pergeseran menang
    await geser('2097-02-01', [['Y', null, '5.1.03', 'Y dari Pergeseran Februari', 0]])
    await geser('2097-03-01', [['R', null, '5', 'BELANJA', 100_000_000], ['A', 'R', '5.1.01', 'Belanja ATK', 100_000_000]])
    const tx = async (bulan: number, tanggal: string, jenis: string, kunci: string, nilai: number) => {
      const [r] = await k.query(`INSERT INTO blud_realisasi_tx (tahun_anggaran, bulan, tanggal, jenis, uraian, kas_keluar, kas_masuk)
                                 VALUES (?, ?, ?, ?, ?, ?, ?)`, [TAHUN, bulan, tanggal, jenis, `${URAIAN_TX} ${kunci}`, Math.max(nilai, 0), Math.max(-nilai, 0)]) as [{ insertId: number }, unknown]
      await k.query('INSERT INTO blud_realisasi_alokasi (tx_id, tahun_anggaran, anggaran_key, nilai) VALUES (?, ?, ?, ?)', [r.insertId, TAHUN, KUNCI(kunci), nilai])
    }
    await tx(1, '2097-01-15', 'BELANJA', 'X', 10_000_000)
    await tx(2, '2097-02-10', 'BELANJA', 'X', 5_000_000)
    await tx(3, '2097-03-05', 'BELANJA', 'A', 7_000_000)
    await tx(4, '2097-04-05', 'BELANJA', 'Y', 3_000_000)
    await tx(4, '2097-04-06', 'BELANJA', 'Z', 1_000_000)
    await tx(5, '2097-05-02', 'PENGEMBALIAN', 'Z', -1_000_000)

    try {
      const P = await import('../lib/blud/pagu')
      const sumber = await P.getPaguSumber(TAHUN)
      ok('F1 sumber pagu = Pergeseran 01 Mar 2097 (X, Y, Z tidak ada di versi itu)', sumber.sumber === 'PERGESERAN' && sumber.versi === '2097-03-01', JSON.stringify(sumber))
      const baris = await P.getPaguEfektif(TAHUN)
      ok('F2 pohon pagu hanya R & A', baris.map(b => b.anggaran_key).sort().join() === `${KUNCI('A')},${KUNCI('R')}`)

      // Jalur route, persis: setahun (Buku Kas, tanpa bulan) dan s.d. bulan (layar Realisasi).
      const setahun = hitungDiLuarPagu(baris, await P.getTerserap(TAHUN))
      ok('F3 setahun: X 15 jt + Y 3 jt = 18 jt, 2 rekening; Z yang dikembalikan penuh tidak disebut',
        setahun.nilai === 18_000_000 && setahun.kunci.map(x => x.anggaran_key).join() === `${KUNCI('X')},${KUNCI('Y')}`, JSON.stringify(setahun))
      const sd = async (bulan: number) => {
        const per = await P.getSerapanPeriode(TAHUN, bulan)
        return hitungDiLuarPagu(baris, new Map([...per].map(([kk, v]) => [kk, v.bulan_ini + v.bulan_lalu])))
      }
      const jan = await sd(1)
      ok('F4 s.d. Januari: hanya X 10 jt (titik waktu sama dengan kolom s.d.)', jan.nilai === 10_000_000 && jan.kunci.length === 1, JSON.stringify(jan))
      const apr = await sd(4)
      ok('F5 s.d. April: X 15 + Y 3 + Z 1 = 19 jt, 3 rekening (pengembalian Z baru Mei)',
        apr.nilai === 19_000_000 && apr.kunci.map(x => x.anggaran_key).join() === ['X', 'Y', 'Z'].map(KUNCI).join(), JSON.stringify(apr))

      const nama = await P.getRekeningLama(TAHUN, [...['X', 'Y', 'Z'].map(KUNCI), 'uji-dlp-TIDAK-ADA'])
      ok('F6 nama lama X dari DPA (satu-satunya versi yang memuatnya)', nama.get(KUNCI('X'))?.kode === '5.1.02.99' && nama.get(KUNCI('X'))?.uraian === 'Biaya film badge lama')
      ok('F7 Y dari versi TERAKHIR yang memuatnya (Pergeseran 01 Feb, bukan DPA 10 Jan)', nama.get(KUNCI('Y'))?.uraian === 'Y dari Pergeseran Februari', nama.get(KUNCI('Y'))?.uraian)
      ok('F8 tanggal sama di DPA & Pergeseran → Pergeseran', nama.get(KUNCI('Z'))?.uraian === 'Z dari Pergeseran', nama.get(KUNCI('Z'))?.uraian)
      ok('F9 kunci yang tak ada di versi mana pun tidak dipulangkan; daftar kosong → tanpa kueri',
        !nama.has('uji-dlp-TIDAK-ADA') && (await P.getRekeningLama(TAHUN, [])).size === 0)

      const { ringkasSerapan } = await import('../lib/blud/serapan-ringkas')
      const r = await ringkasSerapan(TAHUN)
      ok('F10 Beranda menyebut angka setahun yang sama (18 jt, 2 rekening)', r.yatim === 18_000_000 && r.yatim_rekening === 2, `${r.yatim}/${r.yatim_rekening}`)
    } finally {
      if (process.env.SIMPAN === '1') console.log(`  (SIMPAN=1: data uji ${TAHUN} dibiarkan — jalankan lagi tanpa SIMPAN untuk menghapusnya)`)
      else {
        await bersihkan(k)
        const sisa = await Promise.all(['dpa_blud', 'pergeseran_dpa', 'blud_realisasi_tx', 'blud_realisasi_alokasi'].map(t => hitung(k, t)))
        ok('F11 data uji 2097 terhapus semua', sisa.every(n => n === 0), sisa.join('/'))
      }
    }
  }
  await k.end()
}

console.log(`\n${lulus} lulus, ${gagal.length} gagal`)
if (gagal.length) { console.log('GAGAL: ' + gagal.join(', ')); process.exit(1) }
process.exit(0)
