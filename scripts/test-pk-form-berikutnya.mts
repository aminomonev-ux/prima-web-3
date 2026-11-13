// scripts/test-pk-form-berikutnya.mts — Form PK: sesudah Simpan bisa langsung mengisi PK berikutnya, "+ PK Baru".
// Jalankan: npx tsx scripts/test-pk-form-berikutnya.mts

import { readFileSync } from 'node:fs'
import {
  emptyForm, formBerikutnya, sidikForm, keteranganAnggaran, totalAnggaran, alasanTolakSumber, sumberUtama,
  SUMBER_DANA, PANJANG_SUMBER_LAIN, type PkFormState,
} from '../app/(dashboard)/perjanjian-kinerja/form/_types'
import { DokumenCreateBodySchema } from '../lib/data/pk-schemas'
import { keteranganTercetak } from '../lib/pk/sumber-dana'
import { buildAnggaranTableXml } from '../lib/pk/tabel-word'

let lulus = 0
const gagal: string[] = []
const ok = (n: string, s: unknown, k = '') => {
  if (s) { lulus++; console.log(`  ok  ${n}`) } else { gagal.push(n); console.log(`FAIL  ${n}${k ? ' — ' + k : ''}`) }
}

const isi: PkFormState = {
  ...emptyForm('2026'), id: 12, status: 'DRAFT', version: 3,
  tanggal_dokumen: '2026-01-05', jenis_pk: 'PERUBAHAN',
  unit_pertama: 'Unit A', nama_pertama: 'Nama A', jabatan_pertama: 'Jab A', pangkat_pertama: 'IV/a', nip_pertama: '1',
  unit_kedua: 'Unit B', nama_kedua: 'Nama B', jabatan_kedua: 'Jab B', pangkat_kedua: 'IV/b', nip_kedua: '2',
  lampiran: [{ unit_kerja: 'Unit A', level: 'program', program: 'P', kegiatan: null, subkegiatan: null, uraian: 'U', indikator: 'I', target: '1', satuan: '%', urutan: 0 }],
  anggaran: [{ unit_kerja: 'Unit A', level: 'program', program: 'P', kegiatan: null, subkegiatan: null, uraian: 'U', keterangan_sumber: 'BLUD', nominal: 5, urutan: 0, auto_filled_from_blud: false }],
}
const b = formBerikutnya(isi)
ok('A1 tahun, tanggal dokumen, jenis dipertahankan', b.tahun === '2026' && b.tanggal_dokumen === '2026-01-05' && b.jenis_pk === 'PERUBAHAN')
ok('A2 dokumen baru: tanpa id, DRAFT, versi 0', b.id === null && b.status === 'DRAFT' && b.version === 0)
ok('A3 Pihak Pertama dikosongkan', [b.unit_pertama, b.nama_pertama, b.jabatan_pertama, b.pangkat_pertama, b.nip_pertama].every(v => v === ''))
ok('A4 Pihak Kedua JUGA dikosongkan (keputusan pemilik)', [b.unit_kedua, b.nama_kedua, b.jabatan_kedua, b.pangkat_kedua, b.nip_kedua].every(v => v === ''))
ok('A5 lampiran & anggaran kosong', b.lampiran.length === 0 && b.anggaran.length === 0)
ok('A6 masukan tidak diubah', isi.nama_pertama === 'Nama A' && isi.lampiran.length === 1)

ok('B1 sidik mengabaikan angka kunci & status', sidikForm(isi) === sidikForm({ ...isi, version: 9, status: 'FINAL' }))
ok('B2 sidik berubah bila isian berubah', sidikForm(isi) !== sidikForm({ ...isi, nama_kedua: 'X' }))
ok('B3 sidik berubah bila lampiran berubah', sidikForm(isi) !== sidikForm({ ...isi, lampiran: [{ ...isi.lampiran[0], target: '2' }] }))

const layar = readFileSync('app/(dashboard)/perjanjian-kinerja/form/form-client.tsx', 'utf8')
const simpan = layar.slice(layar.indexOf('async function handleSave()'), layar.indexOf('function mulaiPkBaru('))
ok('C1 sesudah Simpan dokumen baru ditanya; bawaan = isi PK berikutnya',
  /if \(!form\.id\) \{[\s\S]*?await pilihDialog\(\{[\s\S]*?confirmLabel: 'Isi PK berikutnya', altLabel: 'Tetap di dokumen ini'/.test(simpan))
ok('C2 pilihan utama mengosongkan lewat formBerikutnya (tanpa pindah halaman)', /if \(pilih === 'utama'\) \{\s*mulaiPkBaru\(form\)/.test(simpan))
ok('C3 selain itu (termasuk Esc) tetap ke mode edit dokumen itu', /\} else \{\s*router\.replace\(`\/perjanjian-kinerja\/form\?id=\$\{r\.id\}`\)/.test(simpan))
ok('C4 simpan perubahan dokumen lama tidak bertanya', simpan.includes("showToast('ok', 'Perubahan tersimpan')"))
const baru = layar.slice(layar.indexOf('async function handlePkBaru()'), layar.indexOf('async function doFinalize()'))
ok('C5 PK Baru bertanya bila belum tersimpan', /const belumTersimpan = dasarRef\.current !== null && sidikForm\(form\) !== dasarRef\.current\s*if \(belumTersimpan && !\(await confirmDialog\(/.test(baru))
ok('C6 PK Baru memakai pembuat form yang sama lalu meninggalkan ?id', /mulaiPkBaru\(form\)\s*router\.push\('\/perjanjian-kinerja\/form'\)/.test(baru))
ok('C7 dasar diambil saat dokumen dimuat & sesudah simpan',
  layar.includes('dasarRef.current = sidikForm(dimuat)') && simpan.includes('dasarRef.current = sidikForm(form)'))
ok('C8 tombol PK Baru hanya saat dokumen terbuka & boleh ubah', /\{bolehUbah && \(\s*<>\s*\{form\.id && \(\s*<PrimaButton variant="purple" iconLeft=\{<Plus size=\{14\} \/>\}\s*onClick=\{handlePkBaru\}/.test(layar))

// ── D. Keterangan (Sumber Dana) Anggaran ─────────────────────────────────────
ok('D1 pilihan "APBD & BLUD" ada di dropdown', (SUMBER_DANA as readonly string[]).includes('APBD & BLUD'))
ok('D2 BLUD saja tetap "BLUD"', keteranganAnggaran('BLUD', '', true) === 'BLUD' && totalAnggaran('BLUD', 9, 5) === 9)
ok('D3 APBD tanpa ✎ = "APBD"', keteranganAnggaran('APBD', '', false) === 'APBD' && totalAnggaran('APBD', 10, null) === 10)
ok('D4 APBD + ✎ (jalan lama) jadi "APBD & BLUD", nominal dijumlah', keteranganAnggaran('APBD', '', true) === 'APBD & BLUD' && totalAnggaran('APBD', 10, 7) === 17)
ok('D5 pilihan "APBD & BLUD" + bagian BLUD', keteranganAnggaran('APBD & BLUD', '', true) === 'APBD & BLUD' && sumberUtama('APBD & BLUD', '') === 'APBD')
ok('D6 Lainnya memakai teks yang diketik', keteranganAnggaran('LAINNYA', '  DAK  ', false) === 'DAK' && keteranganAnggaran('LAINNYA', 'DAK', true) === 'DAK & BLUD')
ok('D7 APBN + ✎ = "APBN & BLUD"', keteranganAnggaran('APBN', '', true) === 'APBN & BLUD')
ok('D8 Lainnya kosong ditolak', alasanTolakSumber('LAINNYA', '  ', null) !== null && alasanTolakSumber('LAINNYA', 'DAK', null) === null)
ok('D9 "APBD & BLUD" tanpa bagian BLUD ditolak', alasanTolakSumber('APBD & BLUD', '', null) !== null && alasanTolakSumber('APBD & BLUD', '', 0) === null)
{
  const terpanjang = keteranganAnggaran('LAINNYA', 'x'.repeat(PANJANG_SUMBER_LAIN), true)
  const body = {
    tahun: '2026', tanggal_dokumen: '2026-01-05', jenis_pk: 'MURNI',
    unit_pertama: 'A', nama_pertama: 'A', jabatan_pertama: 'A', unit_kedua: 'B', nama_kedua: 'B', jabatan_kedua: 'B',
    lampiran: [], anggaran: [{ unit_kerja: 'A', level: 'program', program: 'P', kegiatan: null, subkegiatan: null, uraian: 'U',
      keterangan_sumber: terpanjang, nominal: 1, urutan: 0, auto_filled_from_blud: true }],
  }
  const p = DokumenCreateBodySchema.safeParse(body)
  ok('D10 Lainnya terpanjang + " & BLUD" masih diterima server (≤ 50)', p.success, p.success ? '' : JSON.stringify(p.error.issues[0]))
}
const panel = readFileSync('app/(dashboard)/perjanjian-kinerja/form/_components/LampiranAnggaranSplit.tsx', 'utf8')
ok('D11 baris anggaran memakai aturan yang sama (keterangan & total)',
  panel.includes('keterangan_sumber: keteranganAnggaran(keterangan, lainnya, adaBagianBlud),')
  && panel.includes("auto_filled_from_blud: keterangan === 'BLUD' ? autoFilledFromBlud : adaBagianBlud,")
  && panel.includes('const adaBagianBlud = (bagianBlud ?? 0) > 0')
  && panel.includes('nominal: Math.max(0, totalAnggaran(keterangan, Number(nominal) || 0, bagianBlud)),'))
ok('D12 Tambah ditolak bila keterangan belum lengkap', panel.includes('return alasanTolakSumber(keterangan, lainnya, bagianBlud)'))
ok('D13 ✎ di sumber selain BLUD menyimpan BAGIAN BLUD saja', panel.includes('const bagian = total - (Number(nominal) || 0)') && panel.includes('setBagianBlud(bagian)'))

// ── E. Baris lama berlabel "APBD" padahal BLUD ikut dijumlah lewat ✎ ─────────
ok('E1 baris lama APBD + tanda BLUD-auto → "APBD & BLUD"', keteranganTercetak('APBD', 1) === 'APBD & BLUD' && keteranganTercetak('APBN', true) === 'APBN & BLUD')
ok('E2 tanpa tanda BLUD-auto tidak diubah', keteranganTercetak('APBD', 0) === 'APBD' && keteranganTercetak('APBD', null) === 'APBD')
ok('E3 yang sudah menyebut BLUD tidak digandakan', keteranganTercetak('BLUD', 1) === 'BLUD' && keteranganTercetak('APBD & BLUD', 1) === 'APBD & BLUD')
{
  const xml = buildAnggaranTableXml([
    { uraian: 'P', keterangan_sumber: 'APBD', auto_filled_from_blud: 1, nominal: 120540272000, level: 'program', program: 'PROGRAM A', kegiatan: null, subkegiatan: null },
    { uraian: 'Q', keterangan_sumber: 'APBD', auto_filled_from_blud: 0, nominal: 5, level: 'program', program: 'PROGRAM B', kegiatan: null, subkegiatan: null },
  ])
  ok('E4 Word: baris lama tercetak "APBD & BLUD", APBD murni tetap "APBD"', (xml.match(/APBD &amp; BLUD/g) ?? []).length === 1 && !/APBD & BLUD/.test(xml))
  ok('E7 label "X + BLUD" yang tersimpan sebelum diganti "&" ikut dinormalkan',
    keteranganTercetak('APBD + BLUD', 1) === 'APBD & BLUD' && keteranganTercetak('APBD + BLUD', 0) === 'APBD & BLUD')
}
const docgen = readFileSync('lib/pk/docgen.ts', 'utf8')
ok('E5 penyusun Word membaca tanda BLUD-auto', docgen.includes('SELECT uraian, keterangan_sumber, auto_filled_from_blud, nominal'))
ok('E6 form membuka baris lama dengan label yang dilengkapi',
  layar.includes("keterangan_sumber: keteranganTercetak(String(a.keterangan_sumber ?? 'BLUD'), !!a.auto_filled_from_blud),"))

console.log(`\n${lulus} lulus, ${gagal.length} gagal`)
if (gagal.length) { console.log(gagal.map(g => `  - ${g}`).join('\n')); process.exit(1) }
process.exit(0)
