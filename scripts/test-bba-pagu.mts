#!/usr/bin/env npx tsx
// scripts/test-bba-pagu.mts — Tahap 2 revamp alur BBA: pagu belanja modal dari DPA/Pergeseran BLUD + kartu pagu.
// Konsep: docs/konsep/bba/CONCEPT-bba-revamp-alur.md §4.
// Jalankan: npx tsx --env-file=.env.local scripts/test-bba-pagu.mts
// Bagian D memakai MySQL sungguhan (kotak pasir 2069, tabel BLUD), dibersihkan otomatis. Tanpa MySQL = GAGAL.
import { readFileSync } from 'node:fs'
import mysql from 'mysql2/promise'
import { paguBelanjaModal, hitungKartuPagu, paguBisaDariBlud, type BarisPagu } from '../lib/bba/pagu'
import type { Anggaran } from '../lib/bba/rencana'

let lulus = 0
const gagal: string[] = []
function ok(nama: string, syarat: unknown, ket = '') {
  if (syarat) { lulus++; console.log(`  ok  ${nama}`) }
  else { gagal.push(nama); console.log(`FAIL  ${nama}${ket ? ' — ' + ket : ''}`) }
}
const sumber = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
const b = (row_id: string, parent_id: string | null, kode: string | null, uraian: string, nilai: number): BarisPagu => ({ row_id, parent_id, kode_rekening: kode, uraian, nilai })

console.log('A. paguBelanjaModal')
const contoh2026 = [
  b('1', null, '5', 'BELANJA DAERAH', 100), b('2', '1', '5.1', 'BELANJA OPERASI', 82.5),
  b('3', '1', '5.2.02', 'BELANJA MODAL PERALATAN DAN MESIN', 17.5), b('4', '3', '5.2.03', 'Belanja modal gedung', 4),
  b('5', '3', '5.2.02.10.01', 'Personal computer', 13.5),
]
ok('A1 contoh DPA 2026: cabang 5.2.02 dihitung sekali, 5.2.03 di bawahnya tidak dobel', paguBelanjaModal(contoh2026).nilai === 17.5 && paguBelanjaModal(contoh2026).dasar === 'KODE')
ok('A2 dua akar modal berdampingan dijumlah; kode berspasi/titik ujung tetap dikenali', paguBelanjaModal([
  b('1', null, ' 5.2.02 ', 'X', 10), b('2', null, '5.2.03.', 'Y', 7), b('3', '1', '5.2.02.01', 'Z', 10)]).nilai === 17)
ok('A3 baris pengelompok tanpa kode di antara dua baris 5.2 tidak membuat cucu terhitung ulang', paguBelanjaModal([
  b('1', null, '5.2', 'MODAL', 50), b('2', '1', null, 'kelompok', 50), b('3', '2', '5.2.02', 'alat', 50)]).nilai === 50)
ok('A4 tanpa kode 5.2 → baris ber-uraian "Belanja Modal" teratas', (() => { const h = paguBelanjaModal([b('1', null, 'A', 'BELANJA MODAL', 9), b('2', '1', 'A.1', 'belanja  modal alat', 9), b('3', null, 'B', 'Operasi', 5)]); return h.nilai === 9 && h.dasar === 'URAIAN' })())
ok('A5 tidak ada belanja modal → TIDAK_ADA, nilai 0; kode 5.20/52 bukan 5.2', paguBelanjaModal([b('1', null, '5.1', 'Operasi', 3), b('2', null, '5.20', 'X', 4), b('3', null, '52', 'Y', 5)]).dasar === 'TIDAK_ADA')
ok('A6 induk melingkar (data rusak) tidak membuat pencarian leluhur berputar selamanya', typeof paguBelanjaModal([b('1', '2', '5.2.1', 'A', 3), b('2', '1', '5.2.2', 'B', 4)]).nilai === 'number')
{
  // Pohon acak: jumlah akar modal = Σ nilai baris modal yang tak berleluhur modal, dibanding dengan penelusuran naif.
  let beda = 0
  for (let n = 0; n < 400; n++) {
    let acak = n * 7919 + 13
    const rnd = (m: number) => { acak = (acak * 1103515245 + 12345) % 2147483648; return acak % m }
    const rows: BarisPagu[] = []
    for (let i = 0; i < 25; i++) {
      const induk = i && rnd(4) ? String(rnd(i)) : null
      const kode = ['5.2.02', '5.1.01', null, '5.2', '5.2.03.01', '6.1'][rnd(6)]
      rows.push(b(String(i), induk, kode, 'x', rnd(1000)))
    }
    const modal = (r: BarisPagu) => !!r.kode_rekening && r.kode_rekening.startsWith('5.2')
    const per = new Map(rows.map(r => [r.row_id, r]))
    const adaLeluhur = (r: BarisPagu): boolean => { const p = r.parent_id ? per.get(r.parent_id) : undefined; return !!p && (modal(p) || adaLeluhur(p)) }
    const harap = rows.filter(r => modal(r) && !adaLeluhur(r)).reduce((s, r) => s + r.nilai, 0)
    const h = paguBelanjaModal(rows)
    if ((rows.some(modal) ? h.nilai : 0) !== harap) beda++
  }
  ok('A7 400 pohon acak = penelusuran naif', beda === 0, `${beda} beda`)
}

console.log('\nB. Kartu pagu')
type R = { id: number; sumber_anggaran: string; anggaran: Anggaran; nilai_rencana: number; anggaran_nilai: number | null }
const rows: R[] = [
  { id: 1, sumber_anggaran: 'BLUD', anggaran: 'DIDANAI', nilai_rencana: 12, anggaran_nilai: 10 },
  { id: 2, sumber_anggaran: 'BLUD', anggaran: 'BELUM', nilai_rencana: 5, anggaran_nilai: null },
  { id: 3, sumber_anggaran: 'APBD', anggaran: 'BELUM', nilai_rencana: 40, anggaran_nilai: null },
  { id: 4, sumber_anggaran: 'BLUD', anggaran: 'TIDAK_DIDANAI', nilai_rencana: 7, anggaran_nilai: null },
]
{
  const h = hitungKartuPagu(30, rows, new Map<number, Anggaran>([[2, 'DIDANAI'], [3, 'DIDANAI'], [4, 'BELUM']]), 'BLUD')
  ok('B1 sudah didanai = nilai saat ditandai; pilihan ini = yang berubah ke Danai; APBD tidak ikut pagu BLUD', h.sudah === 10 && h.pilihanIni === 5 && h.sisa === 15 && !h.lewat, JSON.stringify(h))
  const c = hitungKartuPagu(12, rows, new Map<number, Anggaran>([[1, 'TIDAK_DIDANAI'], [2, 'DIDANAI']]), 'BLUD')
  ok('B2 mencabut yang didanai mengurangi sebesar nilai tersimpannya', c.pilihanIni === -5 && c.terpakai === 5 && c.sisa === 7)
  const l = hitungKartuPagu(14, rows, new Map<number, Anggaran>([[2, 'DIDANAI']]), 'BLUD')
  ok('B3 melewati pagu ditandai (peringatan), sisa negatif', l.lewat && l.sisa === -1)
  const s = hitungKartuPagu(null, rows, new Map<number, Anggaran>([[3, 'DIDANAI']]), 'SEMUA')
  ok('B4 "Semua" sumber dana: pagu harus diketik (BLUD tidak dipakai), tanpa pagu sisa kosong', !paguBisaDariBlud('SEMUA') && !paguBisaDariBlud('APBD') && paguBisaDariBlud('BLUD') && s.sisa === null && s.terpakai === 50)
}

console.log('\nC. Route & layar')
{
  const r = sumber('app/api/buku-besar-aset/pagu-blud/route.ts')
  ok('C1 route: guard + LIHAT Rencana (bukan akses BLUD), sakelar BLUD mati = tidak tersedia, GET saja',
    r.indexOf('await guard()') < r.indexOf("tolakKecualiLihat(g.session, 'rencana')") && r.includes("modulSedangMati(['app_status_blud']")
    && r.indexOf("modulSedangMati(['app_status_blud']") < r.indexOf('bacaPaguBlud(') && !/export async function (POST|PATCH|DELETE)/.test(r) && !r.includes('/blud/_guard'))
  const d = sumber('lib/data/bba-pagu.ts').replace(/^\s*\/\/.*$/gm, '')
  ok('C2 data: versi lewat penjawab BLUD, tanpa MAX(versi_tanggal) sendiri; hanya total + label keluar', d.includes('sumberPaguTahun(sql, tahun)') && d.includes('getDpaVersiBerlaku(')
    && d.includes('getPergeseranVersiBerlaku(') && !/MAX\(versi_tanggal\)/.test(d) && d.includes("return { tersedia: true, nilai: h.nilai, label, versi, tabel, dasar: h.dasar }"))
  const k = sumber('app/(dashboard)/buku-besar-aset/_components/KartuPagu.tsx')
  ok('C3 kartu: diingat per peramban (try/catch), hitungan dari hitungKartuPagu, lewat pagu = peringatan', k.includes('localStorage.setItem(kunciIngat(tahun)') && /try \{ localStorage/.test(k)
    && k.includes('hitungKartuPagu(pagu,') && k.includes('Ini peringatan, bukan penolakan') && !k.includes('fetchJson<unknown>(`/api/buku-besar-aset/anggaran'))
}

console.log('\nD. MySQL sungguhan (kotak pasir 2069)')
let c: mysql.Connection | null = null
try {
  c = await mysql.createConnection({ host: process.env.MYSQL_HOST, port: Number(process.env.MYSQL_PORT || 3306), user: process.env.MYSQL_USER, password: process.env.MYSQL_PASSWORD, database: process.env.MYSQL_DATABASE })
} catch (e) { ok(`D0 MySQL bisa dihubungi (${(e as { code?: string }).code ?? e})`, false) }
if (c) {
  const k = c
  const T = 2069
  const bersih = async () => {
    for (const t of ['pergeseran_dpa', 'dpa_blud', 'blud_dpa_perubahan']) await k.query(`DELETE FROM ${t} WHERE tahun_anggaran = ?`, [T])
  }
  await bersih()
  const P = await import('../lib/data/bba-pagu')
  const dpa = async (versi: string, rows: Array<[string, string | null, string, string, number]>) => {
    for (const [i, [row_id, parent_id, kode, uraian, jumlah]] of rows.entries())
      await k.query('INSERT INTO dpa_blud (tahun_anggaran, versi_tanggal, kode_rekening, uraian, jumlah, row_id, parent_id, urutan) VALUES (?,?,?,?,?,?,?,?)', [T, versi, kode, uraian, jumlah, row_id, parent_id, i])
  }
  try {
    const kosong = await P.bacaPaguBlud(T, 'berlaku')
    ok('D1 tahun tanpa DPA → tidak tersedia, kalimat menyuruh ketik sendiri', !kosong.tersedia && kosong.alasan.includes(`DPA BLUD ${T} belum ada`))
    await dpa(`${T}-01-15`, [['a', null, '5', 'BELANJA', 100_000], ['b', 'a', '5.1', 'Operasi', 60_000], ['c', 'a', '5.2.02', 'MODAL', 40_000], ['d', 'c', '5.2.03', 'gedung', 15_000]])
    const m = await P.bacaPaguBlud(T, 'berlaku')
    ok('D2 DPA murni: total belanja modal 40.000, label menyebut DPA', m.tersedia && m.nilai === 40_000 && m.label.startsWith('DPA') && m.tabel === 'dpa_blud', JSON.stringify(m))
    await k.query(`INSERT INTO pergeseran_dpa (tahun_anggaran, versi_tanggal, dpa_versi_tanggal, kode_rekening, uraian, jumlah, pergeseran, row_id, parent_id, urutan) VALUES
      (?, '${T}-03-31', '${T}-01-15', '5', 'BELANJA', 100000, 100000, 'a', NULL, 0), (?, '${T}-03-31', '${T}-01-15', '5.2.02', 'MODAL', 40000, 45000, 'c', 'a', 1)`, [T, T])
    const g = await P.bacaPaguBlud(T, 'berlaku'), gd = await P.bacaPaguBlud(T, 'dpa'), gp = await P.bacaPaguBlud(T, 'pergeseran')
    ok('D3 sesudah Pergeseran: berlaku = kolom pergeseran (pasca-geser 45.000); "DPA terbaru" tetap 40.000', g.tersedia && g.nilai === 45_000 && g.tabel === 'pergeseran_dpa'
      && gd.tersedia && gd.nilai === 40_000 && gd.label.startsWith('DPA murni') && gp.tersedia && gp.nilai === 45_000 && gp.label.startsWith('Pergeseran'), JSON.stringify([g, gd, gp]))
    await dpa(`${T}-08-01`, [['a', null, '5', 'BELANJA', 120_000], ['c', 'a', '5.2.02', 'MODAL', 55_000]])
    await k.query(`INSERT INTO blud_dpa_perubahan (tahun_anggaran, versi_mulai, sumber_dasar, versi_dasar, dibuat_pada) VALUES (?, '${T}-08-01', 'PERGESERAN', '${T}-03-31', NOW())`, [T])
    // Pergeseran bertanggal SESUDAH Perubahan tapi masih mengacu DPA murni = babak lama — babaknya dari ACUAN, bukan tanggalnya.
    await k.query(`INSERT INTO pergeseran_dpa (tahun_anggaran, versi_tanggal, dpa_versi_tanggal, kode_rekening, uraian, jumlah, pergeseran, row_id, parent_id, urutan) VALUES
      (?, '${T}-08-15', '${T}-01-15', '5.2.02', 'MODAL', 40000, 45000, 'c', NULL, 0)`, [T])
    const p = await P.bacaPaguBlud(T, 'berlaku'), pd = await P.bacaPaguBlud(T, 'dpa'), pp = await P.bacaPaguBlud(T, 'pergeseran')
    ok('D4 DPA Perubahan: berlaku = DPA Perubahan ke-1 (pergeseran babak lama tidak lagi jadi pagu); pergeseran terbaru menyebut acuan murninya',
      p.tersedia && p.nilai === 55_000 && p.label.includes('DPA Perubahan ke-1') && pd.tersedia && pd.label.startsWith('DPA Perubahan ke-1')
      && pp.tersedia && pp.nilai === 45_000 && !pp.label.includes('Perubahan'), JSON.stringify([p, pd, pp]))
    await k.query(`INSERT INTO pergeseran_dpa (tahun_anggaran, versi_tanggal, dpa_versi_tanggal, kode_rekening, uraian, jumlah, pergeseran, row_id, parent_id, urutan) VALUES
      (?, '${T}-09-30', '${T}-08-01', '5.2.02', 'MODAL', 55000, 50000, 'c', NULL, 0)`, [T])
    const q = await P.bacaPaguBlud(T, 'berlaku'), qp = await P.bacaPaguBlud(T, 'pergeseran')
    ok('D5 pergeseran di babak Perubahan jadi pagu & labelnya menyebut acuannya', q.tersedia && q.nilai === 50_000 && q.label.includes('Pergeseran (DPA Perubahan ke-1)')
      && qp.tersedia && qp.label.includes('mengacu DPA Perubahan ke-1'), JSON.stringify([q, qp]))
  } finally {
    await bersih()
    const [sisa] = await k.query('SELECT (SELECT COUNT(*) FROM dpa_blud WHERE tahun_anggaran = ?) + (SELECT COUNT(*) FROM pergeseran_dpa WHERE tahun_anggaran = ?) + (SELECT COUNT(*) FROM blud_dpa_perubahan WHERE tahun_anggaran = ?) AS n', [T, T, T]) as [Array<{ n: number }>, unknown]
    ok('D6 kotak pasir bersih', Number(sisa[0].n) === 0)
    await k.end()
  }
}

console.log(`\n${lulus} lulus, ${gagal.length} gagal`)
if (gagal.length) { console.log(gagal.map(g => `  - ${g}`).join('\n')); process.exit(1) }
process.exit(0)
