// scripts/test-pk-form-berikutnya.mts — Form PK: sesudah Simpan bisa langsung mengisi PK berikutnya, "+ PK Baru".
// Jalankan: npx tsx scripts/test-pk-form-berikutnya.mts

import { readFileSync } from 'node:fs'
import { emptyForm, formBerikutnya, sidikForm, type PkFormState } from '../app/(dashboard)/perjanjian-kinerja/form/_types'

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

console.log(`\n${lulus} lulus, ${gagal.length} gagal`)
if (gagal.length) { console.log(gagal.map(g => `  - ${g}`).join('\n')); process.exit(1) }
process.exit(0)
