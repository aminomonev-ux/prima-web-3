#!/usr/bin/env npx tsx
// scripts/test-pk-nominal-blud.mts — nominal BLUD lampiran anggaran Form PK dihitung LANGSUNG dari
// DPA/Pergeseran versi yang dipilih, dengan aturan yang SAMA dengan Cetak Rekap PJ.
// Konsep: docs/CONCEPT-pk-nominal-blud-langsung.md.
// Jalankan: npx tsx --env-file=.env.local scripts/test-pk-nominal-blud.mts (bagian D MySQL kotak
// pasir 2077, dibersihkan otomatis; tanpa --env-file GAGAL, tidak melompati).
import { readFileSync, existsSync } from 'node:fs'
import mysql from 'mysql2/promise'
import { kelompokPerPj, nominalUntukUnit, barisRekapPergeseran } from '../lib/blud/rekap-pj'
import { renderCetakHtml } from '../lib/blud/cetak-data'
import { versiAwal, kalimatSumberBlud, labelVersiBlud, type VersiBlud } from '../lib/pk/nominal-blud'
import { BludNominalQuerySchema } from '../lib/data/pk-schemas'
import type { AuditPjRow } from '../lib/blud/audit-pj'
import type { PergeseranBaris } from '../types'

let lulus = 0
const gagal: string[] = []
function ok(nama: string, syarat: unknown, ket = '') {
  if (syarat) { lulus++; console.log(`  ok  ${nama}`) }
  else { gagal.push(nama); console.log(`FAIL  ${nama}${ket ? ' — ' + ket : ''}`) }
}
const sumber = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n')
const tanpaKomentar = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const b = (row_id: string, parent_id: string | null, jumlah: number, pj: string | null, tipe = 'CHILD'): AuditPjRow =>
  ({ row_id, parent_id, jumlah, penanggung_jawab: pj, uraian: `Uraian ${row_id}`, tipe_baris: tipe, kode_rekening: `5.${row_id}` }) as unknown as AuditPjRow

console.log('A. Aturan per PJ')
const pohon = [
  b('R', null, 1000, null, 'GRANDMASTER'),
  b('A', 'R', 300, 'Kasi Penunjang Medik'),
  b('B', 'R', 200, 'Kasi Penunjang Non Medik'),
  b('C', 'R', 400, 'Kasubbag Umum'),
  b('C1', 'C', 150, 'Kasi Penunjang Medik'),  // PJ dobel: induk C ber-PJ juga
  b('D', 'R', 100, null),                      // belum ber-PJ
]
const g = kelompokPerPj(pohon)
ok('A1 kelompok dalam urutan kemunculan, subtotal mentah', g.map(x => `${x.pj}=${x.subtotal}`).join() === 'Kasi Penunjang Medik=450,Kasi Penunjang Non Medik=200,Kasubbag Umum=400')
const n = nominalUntukUnit(pohon, ['kasi penunjang medik ', 'Kasi Penunjang Non Medik', 'Kasi Penunjang Medis'])
ok('A2 label dicocokkan tanpa peduli huruf besar & spasi tepi', n.per[0].nominal === 450 && n.per[0].ada)
ok('A3 label yang tidak ada di versi itu disebut (ada:false), bukan diam jadi 0', n.per[2].label === 'Kasi Penunjang Medis' && !n.per[2].ada && n.per[2].nominal === 0)
ok('A4 total = jumlah label milik unit', n.total === 650)
ok('A5 baris dobel yang menyangkut PJ unit disebut', n.dobel.length === 1 && n.dobel[0].rowId === 'C1', JSON.stringify(n.dobel.map(d => d.rowId)))
ok('A6 baris dobel milik unit lain tidak disebut', nominalUntukUnit(pohon, ['Kasi Penunjang Non Medik']).dobel.length === 0)
ok('A7 belum ber-PJ = daun tanpa PJ di rantainya; akar tanpa PJ tidak menggandakan', n.belumPj.baris === 1 && n.belumPj.nominal === 100, JSON.stringify(n.belumPj))
ok('A7b daun tanpa PJ sendiri tapi induknya ber-PJ tidak dihitung',
  nominalUntukUnit([...pohon, b('C2', 'C', 50, null)], ['X']).belumPj.nominal === 100)
ok('A8 label kembar tidak menggandakan total', nominalUntukUnit(pohon, ['Kasubbag Umum', 'KASUBBAG UMUM']).total === 400)
const geser = barisRekapPergeseran([{ ...pohon[1], jumlah: 300, pergeseran: 340 } as unknown as PergeseranBaris])
ok('A9 Pergeseran memakai pagu PASCA-geser', geser[0].jumlah === 340)

console.log('B. Sama dengan Cetak Rekap PJ')
const barisGeser = pohon.map(r => ({ ...r, jumlah: r.jumlah, pergeseran: r.jumlah + (r.row_id === 'A' ? 25 : 0) })) as unknown as PergeseranBaris[]
const cetak = renderCetakHtml({ menu: 'pergeseran', view: 'penanggungJawab', rows: barisGeser, versi: '2077-03-15', tanggal: '' })
const subCetak = new Map((cetak.rows as Array<[string, string, number]>).filter(r => r[1] === '' && !r[0].endsWith(' Total')).map(r => [r[0], r[2]]))
const nGeser = nominalUntukUnit(barisRekapPergeseran(barisGeser), ['Kasi Penunjang Medik', 'Kasubbag Umum'])
ok('B1 subtotal Pergeseran per PJ = tabel Cetak', nGeser.per.every(p => subCetak.get(p.label) === p.nominal) && nGeser.per[0].nominal === 475,
  JSON.stringify([...subCetak]))
const cetakDpa = renderCetakHtml({ menu: 'dpa', view: 'penanggungJawab', rows: pohon, versi: '2077-03-01', tanggal: '' })
const subDpa = new Map((cetakDpa.rows as Array<[string, string, number]>).filter(r => r[1] === '').map(r => [r[0].toLowerCase(), r[2]]))
ok('B2 subtotal DPA per PJ = tabel Cetak', n.per.filter(p => p.ada).length === 2
  && n.per.filter(p => p.ada).every(p => subDpa.get(p.label.trim().toLowerCase()) === p.nominal))
ok('B3 Cetak & PK memakai satu aturan pengelompokan', /const grouped = kelompokPerPj\(rows\)/.test(sumber('lib/blud/cetak-data.ts'))
  && !/new Map<string, typeof pjRows>/.test(sumber('lib/blud/cetak-data.ts')))
ok('B4 penukaran pasca-geser satu pintu (Cetak & server)', sumber('lib/blud/cetak-data.ts').includes('renderPjView(barisRekapPergeseran(asli)')
  && sumber('lib/data/pk-blud-nominal.ts').includes('barisRekapPergeseran(r)'))

console.log('C. Sambungan')
const dasar = { unit: 'X', tahun: '2026', sumber: 'pergeseran', versi: '2026-11-10' }
ok('C1 sumber & versi WAJIB (server tidak menebak "terbaru")',
  BludNominalQuerySchema.safeParse(dasar).success
  && !BludNominalQuerySchema.safeParse({ ...dasar, versi: undefined }).success
  && !BludNominalQuerySchema.safeParse({ ...dasar, sumber: 'rekap' }).success)
const daftar: VersiBlud[] = [
  { sumber: 'pergeseran', versi: '2026-11-10', jumlah_baris: 584, catatan: 'PERUBAHAN KE-1', berlaku: false },
  { sumber: 'pergeseran', versi: '2026-11-03', jumlah_baris: 584, catatan: '', berlaku: true },
  { sumber: 'dpa', versi: '2026-10-13', jumlah_baris: 583, catatan: 'PERUBAHAN KE-1', berlaku: false },
]
ok('C2 pilihan awal = versi BERLAKU, bukan sekadar yang teratas', versiAwal(daftar)?.versi === '2026-11-03')
ok('C3 tanpa BERLAKU → yang teratas', versiAwal(daftar.map(v => ({ ...v, berlaku: false })))?.versi === '2026-11-10')
ok('C4 kalimat sumber menyebut jenis, tanggal, babak', kalimatSumberBlud('pergeseran', '2026-11-10', 1) === 'Pergeseran 10-11-2026 · Perubahan ke-1'
  && kalimatSumberBlud('dpa', '2026-08-29', null) === 'DPA 29-08-2026')
ok('C5 label versi seperti daftar Cetak + BERLAKU', labelVersiBlud(daftar[1]) === '03-11-2026 (584 baris) · BERLAKU'
  && labelVersiBlud(daftar[0]) === '10-11-2026 (584 baris) · PERUBAHAN KE-1')
const DLG = tanpaKomentar(sumber('app/(dashboard)/perjanjian-kinerja/form/_components/AmbilNominalBlud.tsx'))
ok('C6 dialog membuang jawaban milik pilihan lain', DLG.includes('const isi = hasil && hasil.kunci === pilih ? hasil.isi : null'))
ok('C7 tombol Pakai hanya untuk hasil OK', DLG.includes("disabled={!ok}") && DLG.includes("if (!ok || !terpilih) return"))
const LAMP = tanpaKomentar(sumber('app/(dashboard)/perjanjian-kinerja/form/_components/LampiranAnggaranSplit.tsx'))
ok('C8 panel Anggaran lewat dialog, tidak menembak nominal langsung', !LAMP.includes('/api/perjanjian-kinerja/blud-nominal') && LAMP.includes('<AmbilNominalBlud'))
ok('C9 keterangan non-BLUD = menambahkan, bukan menimpa', LAMP.includes("tambahKe={keterangan === 'BLUD' ? null : { nominal: Number(nominal) || 0, keterangan }}")
  && DLG.includes('const nominal = (tambahKe?.nominal ?? 0) + ok.total'))
const CETAK = tanpaKomentar(sumber('app/(dashboard)/blud/cetak/cetak-client.tsx'))
ok('C10 tombol Simpan Rekap PK dibuang beserta route-nya', !CETAK.includes('Simpan Rekap PK') && !CETAK.includes('/api/blud/rekap-pk')
  && !existsSync(new URL('../app/api/blud/rekap-pk/route.ts', import.meta.url)))
ok('C11 tidak ada lagi yang MEMBACA foto rekap_pk', !/FROM rekap_pk/.test(tanpaKomentar(sumber('lib/data/pk.ts')) + tanpaKomentar(sumber('lib/data/pk-blud-nominal.ts'))))

console.log('D. MySQL kotak pasir 2077')
const TAHUN = 2077
const c = await mysql.createConnection({
  host: process.env.MYSQL_HOST, port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER, password: process.env.MYSQL_PASSWORD, database: process.env.MYSQL_DATABASE,
})
const bersih = async () => {
  await c.query('DELETE FROM dpa_blud WHERE tahun_anggaran = ?', [TAHUN])
  await c.query('DELETE FROM pergeseran_dpa WHERE tahun_anggaran = ?', [TAHUN])
  await c.query("DELETE FROM pk_unit_kerja WHERE nama_unit LIKE 'UJI NB %'")
}
await bersih()
try {
  const { pilihanVersiBlud, nominalBludUnit } = await import('../lib/data/pk-blud-nominal')
  const dpa = (versi: string, a: number, bb: number) => c.query(
    `INSERT INTO dpa_blud (tahun_anggaran, versi_tanggal, uraian, jumlah, penanggung_jawab, tipe_baris, row_id, parent_id, urutan) VALUES
     (?, ?, 'Belanja', ?, NULL, 'GRANDMASTER', 'R', NULL, 1), (?, ?, 'Obat', ?, 'UJI NB Kasi', 'CHILD', 'A', 'R', 2), (?, ?, 'ATK', ?, 'UJI NB PJ Lain', 'CHILD', 'B', 'R', 3)`,
    [TAHUN, versi, a + bb, TAHUN, versi, a, TAHUN, versi, bb])
  await dpa('2077-01-31', 100, 200)
  await dpa('2077-03-01', 150, 250)
  await dpa('2077-03-15', 999, 999) // DPA bertanggal SAMA dengan pergeseran berlaku — BERLAKU harus menimbang jenisnya
  await c.query(
    `INSERT INTO pergeseran_dpa (tahun_anggaran, versi_tanggal, dpa_versi_tanggal, uraian, jumlah, pergeseran, penanggung_jawab, tipe_baris, row_id, parent_id, urutan) VALUES
     (?, '2077-03-15', '2077-03-01', 'Belanja', 400, 400, NULL, 'GRANDMASTER', 'R', NULL, 1),
     (?, '2077-03-15', '2077-03-01', 'Obat', 150, 120, 'UJI NB Kasi', 'CHILD', 'A', 'R', 2),
     (?, '2077-03-15', '2077-03-01', 'ATK', 250, 280, 'UJI NB PJ Lain', 'CHILD', 'B', 'R', 3)`, [TAHUN, TAHUN, TAHUN])
  await c.query(`INSERT INTO pk_unit_kerja (nama_unit, level) VALUES ('UJI NB Kabid', 'kegiatan'), ('UJI NB Kasi', 'subkegiatan'), ('UJI NB Kosong', 'kegiatan')`)
  await c.query(`INSERT INTO pk_unit_kerja_blud_pj (unit_pk, blud_pj_label) VALUES ('UJI NB Kabid', 'UJI NB KASI'), ('UJI NB Kabid', 'UJI NB PJ Lain'), ('UJI NB Kabid', 'UJI NB Salah Eja')`)

  const v = await pilihanVersiBlud(TAHUN)
  ok('D1 daftar memuat Pergeseran dulu lalu DPA, terbaru dulu', v.map(x => `${x.sumber}:${x.versi}`).join() === 'pergeseran:2077-03-15,dpa:2077-03-15,dpa:2077-03-01,dpa:2077-01-31', JSON.stringify(v))
  ok('D2 BERLAKU = sumber pagu (pergeseran terbaru), DPA bertanggal sama TIDAK ikut', v.filter(x => x.berlaku).map(x => `${x.sumber}:${x.versi}`).join() === 'pergeseran:2077-03-15')
  const h1 = await nominalBludUnit('UJI NB Kabid', TAHUN, 'pergeseran', '2077-03-15')
  ok('D3 Kegiatan lewat peta, angka PASCA-geser', h1.status === 'OK' && h1.total === 400 && h1.per.find(p => p.label === 'UJI NB KASI')?.nominal === 120, JSON.stringify(h1))
  ok('D4 label peta yang salah eja disebut tidak ditemukan', h1.status === 'OK' && h1.per.some(p => p.label === 'UJI NB Salah Eja' && !p.ada))
  const h2 = await nominalBludUnit('UJI NB Kabid', TAHUN, 'dpa', '2077-01-31')
  ok('D5 versi DPA lama yang dipilih benar-benar dipakai', h2.status === 'OK' && h2.total === 300)
  const h3 = await nominalBludUnit('UJI NB Kasi', TAHUN, 'dpa', '2077-03-01')
  ok('D6 Sub kegiatan = label bernama unitnya sendiri', h3.status === 'OK' && h3.total === 150)
  ok('D7 unit tanpa peta → BELUM_DIPETAKAN (bukan Rp 0 diam-diam)', (await nominalBludUnit('UJI NB Kosong', TAHUN, 'dpa', '2077-03-01')).status === 'BELUM_DIPETAKAN')
  ok('D8 versi yang tidak ada', (await nominalBludUnit('UJI NB Kabid', TAHUN, 'dpa', '2077-02-02')).status === 'VERSI_TIDAK_ADA')
  ok('D9 unit tak dikenal', (await nominalBludUnit('UJI NB Hantu', TAHUN, 'dpa', '2077-03-01')).status === 'UNIT_TIDAK_DIKENAL')
  ok('D10 tahun lain tidak ikut terbaca', (await nominalBludUnit('UJI NB Kabid', TAHUN - 1, 'dpa', '2077-03-01')).status === 'VERSI_TIDAK_ADA')
} finally {
  await bersih()
  const [s] = await c.query(`SELECT (SELECT COUNT(*) FROM dpa_blud WHERE tahun_anggaran = ?) + (SELECT COUNT(*) FROM pergeseran_dpa WHERE tahun_anggaran = ?)
    + (SELECT COUNT(*) FROM pk_unit_kerja WHERE nama_unit LIKE 'UJI NB %') + (SELECT COUNT(*) FROM pk_unit_kerja_blud_pj WHERE unit_pk LIKE 'UJI NB %') AS n`, [TAHUN, TAHUN]) as unknown as [Array<{ n: number }>]
  ok('D11 kotak pasir bersih kembali', Number(s[0].n) === 0)
  await c.end()
}

console.log(`\n${lulus} lulus, ${gagal.length} gagal`)
if (gagal.length) { console.log(gagal.map(x => `  - ${x}`).join('\n')); process.exit(1) }
process.exit(0)
