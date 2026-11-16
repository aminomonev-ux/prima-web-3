#!/usr/bin/env npx tsx
// scripts/test-pk-lampiran-blud.mts — lampiran "Rincian anggaran BLUD per penanggung jawab" di
// akhir berkas PK FINAL + PDF lewat LibreOffice. Konsep: docs/konsep/pk/CONCEPT-pk-lampiran-blud-pj.md.
// Jalankan: npx tsx --env-file=.env.local scripts/test-pk-lampiran-blud.mts
//   Bagian D MySQL kotak pasir 2073 (dibersihkan otomatis; SIMPAN=1 membiarkan datanya untuk
//   dicoba di layar). Bagian E butuh LibreOffice; tanpa itu GAGAL, tidak melompati.
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import mysql from 'mysql2/promise'
import PizZip from 'pizzip'
import { bludDokumen, buildLampiranBludXml, catatanLampiran, kecocokan, sisipkanKeDocx, type IsiLampiranBlud } from '../lib/pk/lampiran-blud'
import { UnduhDokumenQuerySchema } from '../lib/data/pk-schemas'

let lulus = 0
const gagal: string[] = []
function ok(nama: string, syarat: unknown, ket = '') {
  if (syarat) { lulus++; console.log(`  ok  ${nama}`) }
  else { gagal.push(nama); console.log(`FAIL  ${nama}${ket ? ' — ' + ket : ''}`) }
}
const sumber = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n')
const tanpaKomentar = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

console.log('A. Bagian BLUD sebuah PK')
const pk1 = bludDokumen([
  { keterangan_sumber: 'BLUD', nominal: '300' }, { keterangan_sumber: 'blud ', nominal: 100 },
  { keterangan_sumber: 'APBD', nominal: 999 },
])
ok('A1 hanya baris berketerangan tepat BLUD yang dijumlah', pk1.ada && pk1.nominal === 400 && !pk1.campuran, JSON.stringify(pk1))
const pk2 = bludDokumen([{ keterangan_sumber: 'BLUD', nominal: 100 }, { keterangan_sumber: 'APBD & BLUD', nominal: 500 }])
ok('A2 baris gabungan → campuran', pk2.ada && pk2.campuran && pk2.nominal === 100)
const pk3 = bludDokumen([{ keterangan_sumber: 'APBD', auto_filled_from_blud: 1, nominal: 500 }])
ok('A3 baris lama APBD bertanda BLUD-auto = gabungan (keteranganTercetak)', pk3.ada && pk3.campuran)
ok('A4 PK tanpa BLUD → tidak ditawari lampiran', !bludDokumen([{ keterangan_sumber: 'APBD', nominal: 5 }]).ada)
ok('A5 kecocokan', kecocokan(400, pk1) === 'cocok' && kecocokan(401, pk1) === 'beda' && kecocokan(400, pk2) === 'tak-diperiksa')

console.log('B. Halaman lampiran Word')
const isi: IsiLampiranBlud = {
  unit: 'Kabid <Uji> & Co', sumber: 'Pergeseran BLUD versi 15 Maret 2073',
  per: [
    { label: 'Kasi A', nominal: 1250000, ada: true, items: [{ uraian: 'Obat', jumlah: 1000000 }, { uraian: 'ATK', jumlah: 250000 }] },
    { label: 'Kasi Salah Eja', nominal: 0, ada: false, items: [] },
  ],
  total: 1250000, pk: { ada: true, nominal: 1000000, campuran: false }, dobel: 2,
};
const xml = buildLampiranBludXml(isi);
ok('B1 diawali pemisah halaman', xml.startsWith('<w:p><w:r><w:br w:type="page"/></w:r></w:p>'))
ok('B2 judul, unit (di-escape), sumber', xml.includes('RINCIAN ANGGARAN BLUD PER PENANGGUNG JAWAB') && xml.includes('Kabid &lt;Uji&gt; &amp; Co') && xml.includes('Pergeseran BLUD versi 15 Maret 2073'))
ok('B3 baris PJ + nominal ribuan bertitik + Jumlah', xml.includes('Kasi A') && xml.includes('1.250.000') && xml.includes('>Jumlah<'))
ok('B4 PJ yang tidak ada di versi itu cukup "-", tanpa kalimat \'tidak ditemukan\'',
  xml.includes('>-</w:t>') && !xml.includes('tidak ditemukan') && !/Penanggung jawab tidak ditemukan/.test(xml))
ok('B4b rincian pembentuk subtotal ikut tercetak, menjorok, urut sesudah kepala PJ-nya',
  xml.indexOf('Obat') > xml.indexOf('Kasi A') && xml.indexOf('ATK') > xml.indexOf('Obat')
  && xml.includes('<w:ind w:left="240"/>') && xml.includes('1.000.000') && xml.includes('250.000'))
const detail = isi.per.filter(p => p.ada).flatMap(p => p.items)
ok('B4c jumlah rincian = subtotal tiap PJ', isi.per.every(p => p.items.reduce((s, i) => s + i.jumlah, 0) === p.nominal)
  && detail.reduce((s, i) => s + i.jumlah, 0) === isi.total)
const cat = catatanLampiran(isi)
ok('B5 selisih dengan nominal PK ditulis merah', cat.some(c => c.merah && c.teks.includes('lebih Rp 250.000') && c.teks.includes('Rp 1.000.000')) && xml.includes('<w:color w:val="C00000"/>'))
ok('B6 cocok → tanpa catatan', !catatanLampiran({ ...isi, total: 1000000, dobel: 0 }).length)
ok('B7 gabungan → tanpa catatan apa pun (tidak diperiksa, tapi tidak dicetak)',
  !catatanLampiran({ ...isi, pk: { ...isi.pk, campuran: true }, dobel: 0 }).length)
ok('B8 baris dobel disebut', cat.some(c => c.teks.startsWith('2 baris anggaran tercatat di dua')))

// Berkas Word sungguhan dari templat PK (placeholder apa adanya — yang diuji letak sisipan).
const templat = readFileSync(new URL('../lib/pk/templates/pk-rsjd-amino-perubahan.docx', import.meta.url))
const asli = new PizZip(templat).file('word/document.xml')!.asText()
const hasil = new PizZip(sisipkanKeDocx(templat, xml)).file('word/document.xml')!.asText()
const iLampiran = hasil.indexOf('RINCIAN ANGGARAN BLUD')
const iSect = hasil.lastIndexOf('<w:sectPr')
ok('B9 lampiran disisipkan SEBELUM sectPr badan, sesudah isi lama', iLampiran > 0 && iLampiran < iSect && hasil.indexOf(asli.slice(asli.indexOf('<w:body>'), asli.lastIndexOf('<w:sectPr'))) >= 0)
ok('B10 sectPr badan tetap yang terakhir & utuh', hasil.slice(iSect) === asli.slice(asli.lastIndexOf('<w:sectPr')))
ok('B11 berkas sumber tidak diubah', new PizZip(templat).file('word/document.xml')!.asText() === asli)

console.log('C. Sambungan kode')
ok('C1 unduh: sumber & versi harus berpasangan', !UnduhDokumenQuerySchema.safeParse({ sumber: 'dpa' }).success
  && UnduhDokumenQuerySchema.safeParse({ sumber: 'dpa', versi: '2073-01-31' }).success
  && UnduhDokumenQuerySchema.safeParse({}).data?.format === 'word')
const rute = tanpaKomentar(sumber('app/api/perjanjian-kinerja/dokumen/[id]/download/route.ts'))
ok('C2 berkas FINAL tidak pernah ditulis balik (route unduh tanpa UPDATE)', !/UPDATE\s+pk_dokumen/i.test(rute))
ok('C3 kepemilikan dicek sebelum lampiran/PDF dibuat', rute.indexOf('Bukan dokumen Anda') < rute.indexOf('isiLampiranBlud('))
ok('C4 per PJ lewat aturan Form PK (nominalBludUnit), bukan rumus baru',
  tanpaKomentar(sumber('lib/data/pk-lampiran-blud.ts')).includes('nominalBludUnit(') && !/kelompokPerPj\(/.test(tanpaKomentar(sumber('lib/data/pk-lampiran-blud.ts'))))
const lr = tanpaKomentar(sumber('app/api/perjanjian-kinerja/dokumen/[id]/lampiran-blud/route.ts'))
ok('C5 rute pilihan memakai pagar & kepemilikan yang sama dengan unduh', lr.includes('pkMati(') && lr.includes("['form', 'riwayat']") && lr.includes('Bukan dokumen Anda'))

console.log('D. MySQL kotak pasir 2073')
const TAHUN = 2073
const c = await mysql.createConnection({
  host: process.env.MYSQL_HOST, port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER, password: process.env.MYSQL_PASSWORD, database: process.env.MYSQL_DATABASE,
})
const bersih = async () => {
  await c.query('DELETE FROM dpa_blud WHERE tahun_anggaran = ?', [TAHUN])
  await c.query('DELETE FROM pergeseran_dpa WHERE tahun_anggaran = ?', [TAHUN])
  await c.query('DELETE FROM pk_dokumen WHERE tahun = ?', [String(TAHUN)])
  await c.query("DELETE FROM pk_unit_kerja WHERE nama_unit LIKE 'UJI LB %'")
}
const simpan = process.env.SIMPAN === '1'
await bersih()
let docxFinal: Buffer | null = null
let idPk = 0
try {
  const { pilihanLampiranBlud, isiLampiranBlud, LampiranBludError } = await import('../lib/data/pk-lampiran-blud')
  const { generatePkDocument } = await import('../lib/pk/docgen')
  const dpa = (versi: string, a: number, b: number) => c.query(
    `INSERT INTO dpa_blud (tahun_anggaran, versi_tanggal, uraian, jumlah, penanggung_jawab, tipe_baris, row_id, parent_id, urutan) VALUES
     (?, ?, 'Belanja', ?, NULL, 'GRANDMASTER', 'R', NULL, 1), (?, ?, 'Obat', ?, 'UJI LB Kasi', 'CHILD', 'A', 'R', 2), (?, ?, 'ATK', ?, 'UJI LB PJ Lain', 'CHILD', 'B', 'R', 3)`,
    [TAHUN, versi, a + b, TAHUN, versi, a, TAHUN, versi, b])
  await dpa('2073-01-31', 100000000, 200000000)
  await dpa('2073-03-01', 150000000, 250000000)
  await c.query(
    `INSERT INTO pergeseran_dpa (tahun_anggaran, versi_tanggal, dpa_versi_tanggal, uraian, jumlah, pergeseran, penanggung_jawab, tipe_baris, row_id, parent_id, urutan) VALUES
     (?, '2073-03-15', '2073-03-01', 'Belanja', 400000000, 400000000, NULL, 'GRANDMASTER', 'R', NULL, 1),
     (?, '2073-03-15', '2073-03-01', 'Obat', 150000000, 120000000, 'UJI LB Kasi', 'CHILD', 'A', 'R', 2),
     (?, '2073-03-15', '2073-03-01', 'ATK', 250000000, 280000000, 'UJI LB PJ Lain', 'CHILD', 'B', 'R', 3)`, [TAHUN, TAHUN, TAHUN])
  await c.query(`INSERT INTO pk_unit_kerja (nama_unit, level) VALUES ('UJI LB Kabid', 'kegiatan'), ('UJI LB Kosong', 'kegiatan')`)
  await c.query(`INSERT INTO pk_unit_kerja_blud_pj (unit_pk, blud_pj_label) VALUES ('UJI LB Kabid', 'UJI LB Kasi'), ('UJI LB Kabid', 'UJI LB PJ Lain')`)

  const dokumen = async (unit: string, anggaran: Array<[string, number]>) => {
    const [r] = await c.query(
      `INSERT INTO pk_dokumen (tahun, tanggal_dokumen, jenis_pk, unit_pertama, nama_pertama, jabatan_pertama, nip_pertama,
         unit_kedua, nama_kedua, jabatan_kedua, nip_kedua, status, created_by)
       VALUES (?, '2073-03-20', 'PERUBAHAN', ?, 'Pejabat Uji Satu', 'Kepala Bidang Uji', '000000000000000001',
         'Direktur', 'Pejabat Uji Dua', 'Direktur', '000000000000000002', 'FINAL', 345)`, [String(TAHUN), unit]) as unknown as [{ insertId: number }]
    const id = r.insertId
    await c.query(`INSERT INTO pk_dokumen_lampiran (dokumen_id, unit_kerja, level, kegiatan, uraian, indikator, target, satuan, urutan)
      VALUES (?, ?, 'kegiatan', 'Kegiatan Uji Lampiran', 'Kegiatan Uji Lampiran', 'Persentase layanan uji', '95', 'Persen', 1)`, [id, unit])
    for (const [i, [ket, nominal]] of anggaran.entries()) {
      await c.query(`INSERT INTO pk_dokumen_anggaran (dokumen_id, unit_kerja, level, kegiatan, uraian, keterangan_sumber, nominal, urutan, auto_filled_from_blud)
        VALUES (?, ?, 'kegiatan', 'Kegiatan Uji Lampiran', 'Kegiatan Uji Lampiran', ?, ?, ?, ?)`, [id, unit, ket, nominal, i + 1, ket === 'BLUD' ? 1 : 0])
    }
    const g = await generatePkDocument(id)
    await c.query('UPDATE pk_dokumen SET generated_file = ?, generated_filename = ?, generated_filesize = ?, generated_at = NOW() WHERE id = ?',
      [g.buffer, g.filename, g.buffer.length, id])
    return { id, docx: g.buffer }
  }
  const d1 = await dokumen('UJI LB Kabid', [['BLUD', 400000000]])
  idPk = d1.id
  const dok = { id: d1.id, tahun: TAHUN, unit_pertama: 'UJI LB Kabid' }
  const p = await pilihanLampiranBlud(dok)
  ok('D1 pilihan: semua versi dengan total unit & kecocokan', p.status === 'OK'
    && p.versi.map(v => `${v.sumber}:${v.versi}:${v.total}:${v.kecocokan}`).join() ===
      'pergeseran:2073-03-15:400000000:cocok,dpa:2073-03-01:400000000:cocok,dpa:2073-01-31:300000000:beda', JSON.stringify(p))
  const isiP = await isiLampiranBlud(dok, 'pergeseran', '2073-03-15')
  ok('D2 isi Pergeseran = angka PASCA-geser per PJ', isiP.total === 400000000 && isiP.per.map(x => `${x.label}=${x.nominal}`).join() === 'UJI LB Kasi=120000000,UJI LB PJ Lain=280000000', JSON.stringify(isiP.per))
  ok('D2b rincian per PJ dari baris yang sama & berjumlah subtotal', isiP.per.every(x => x.items.reduce((s, i) => s + i.jumlah, 0) === x.nominal)
    && isiP.per[0].items.map(i => `${i.uraian}=${i.jumlah}`).join() === 'Obat=120000000', JSON.stringify(isiP.per.map(x => x.items)))
  ok('D3 sumber menyebut versi bertanggal Indonesia', isiP.sumber === 'Pergeseran BLUD versi 15 Maret 2073', isiP.sumber)
  const isiBeda = await isiLampiranBlud(dok, 'dpa', '2073-01-31')
  ok('D4 versi berbeda → catatan merah "kurang Rp 100.000.000"', catatanLampiran(isiBeda).some(x => x.merah && x.teks.includes('kurang Rp 100.000.000')))
  let galat = ''
  try { await isiLampiranBlud(dok, 'dpa', '2073-02-02') } catch (e) { galat = e instanceof LampiranBludError ? e.message : 'lain' }
  ok('D5 versi tidak ada → pesan jelas', /tidak ada atau kosong/.test(galat), galat)
  const d2 = await dokumen('UJI LB Kosong', [['BLUD', 1]])
  ok('D6 unit belum dipetakan → BELUM_DIPETAKAN', (await pilihanLampiranBlud({ id: d2.id, tahun: TAHUN, unit_pertama: 'UJI LB Kosong' })).status === 'BELUM_DIPETAKAN')
  const d3 = await dokumen('UJI LB Kabid', [['APBD', 5]])
  ok('D7 PK tanpa BLUD → TANPA_BLUD', (await pilihanLampiranBlud({ id: d3.id, tahun: TAHUN, unit_pertama: 'UJI LB Kabid' })).status === 'TANPA_BLUD')
  docxFinal = sisipkanKeDocx(d1.docx, buildLampiranBludXml(isiP))
  const [tersimpan] = await c.query('SELECT generated_file FROM pk_dokumen WHERE id = ?', [d1.id]) as unknown as [Array<{ generated_file: Buffer }>]
  ok('D8 berkas FINAL di database tetap tanpa lampiran', !new PizZip(tersimpan[0].generated_file).file('word/document.xml')!.asText().includes('RINCIAN ANGGARAN BLUD'))
} finally {
  if (!simpan) await bersih()
}

console.log('E. PDF lewat LibreOffice')
{
  const { docxKePdf, lokasiLibreOffice } = await import('../lib/services/docx-pdf')
  ok('E1 LibreOffice ditemukan', !!(await lokasiLibreOffice()))
  if (docxFinal) {
    const pdf = await docxKePdf(docxFinal)
    ok('E2 PDF sah', pdf.subarray(0, 5).toString() === '%PDF-')
    const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
    const pdfjs = await import(pathToFileURL(decodeURI(root) + 'node_modules/pdfjs-dist/legacy/build/pdf.mjs').href)
    const doc = await pdfjs.getDocument({ data: new Uint8Array(pdf) }).promise
    const teks: string[] = []
    for (let i = 1; i <= doc.numPages; i++) {
      const t = await (await doc.getPage(i)).getTextContent()
      teks.push(t.items.map((x: { str?: string }) => x.str ?? '').join(' '))
    }
    ok('E3 PDF berteks & lampiran di halaman TERAKHIR', /RINCIAN ANGGARAN BLUD/.test(teks[teks.length - 1]) && !/RINCIAN ANGGARAN BLUD/.test(teks.slice(0, -1).join(' ')), `halaman=${doc.numPages}`)
    ok('E4 angka per PJ & jumlah ikut', /120\.000\.000/.test(teks.join(' ')) && /400\.000\.000/.test(teks[teks.length - 1]))
    const dua = await Promise.all([docxKePdf(docxFinal), docxKePdf(docxFinal)])
    ok('E5 dua permintaan bersamaan diantre, keduanya berhasil', dua.every(b => b.subarray(0, 5).toString() === '%PDF-'))
  }
}
if (simpan && idPk) console.log(`\nData dibiarkan (SIMPAN=1): PK FINAL id ${idPk}, tahun ${TAHUN}.`)
if (!simpan) {
  const [s] = await c.query(`SELECT (SELECT COUNT(*) FROM dpa_blud WHERE tahun_anggaran = ?) + (SELECT COUNT(*) FROM pergeseran_dpa WHERE tahun_anggaran = ?)
    + (SELECT COUNT(*) FROM pk_dokumen WHERE tahun = ?) + (SELECT COUNT(*) FROM pk_unit_kerja WHERE nama_unit LIKE 'UJI LB %') AS n`,
  [TAHUN, TAHUN, String(TAHUN)]) as unknown as [Array<{ n: number }>]
  ok('F1 kotak pasir bersih kembali', Number(s[0].n) === 0)
}
await c.end()

console.log(`\n${lulus} lulus, ${gagal.length} gagal`)
if (gagal.length) { console.log(gagal.map(x => `  - ${x}`).join('\n')); process.exit(1) }
process.exit(0)
