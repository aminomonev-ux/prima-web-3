// scripts/test-blud-urai-geser.mts — uraian Bertambah/Berkurang di Pergeseran.
// Konsep: docs/CONCEPT-blud-uraian-geser.md
//
// Yang dijaga di sini tujuh keputusan yang masing-masing punya bentuk "benar
// tapi salah" — jalan tanpa galat, lalu diam-diam melaporkan hal lain:
//
//   §2.1 recalc TIDAK BOLEH mengisi kolom ini. Ia jalan tiap ketikan; kalau ikut
//        mengisi, angka 45/12 yang baru diketik tertimpa jadi 33/0 tanpa pesan.
//   §2.2 kolomnya nullable+optional. Kalau diwajibkan, 50 snapshot lama +
//        cadangan Drive tidak bisa dipulihkan — rusaknya seluruh riwayat.
//   §4   induk DIJUMLAH dari anak, bukan diturunkan dari selisihnya sendiri.
//        Bedanya nyata: 50/10 versus 40/—.
//   §4   ikut digulung → tiap daftar rekening wajib menyaring daun (L85).
//   §3   invarian `bertambah − berkurang = pergeseran − jumlah` ditegakkan, dan
//        pesannya menyebut rekeningnya.
//   §5.2 `tutupPergeseranRows` melepas uraian — kalau tidak, uraian berdiri di
//        atas selisih nol dan dokumennya berbohong.
//   §5.2 `pergeseranKeInput` membawa kolomnya — kalau tidak, terbuang senyap.
//
// Bagian A–C menguji PERILAKU lewat fungsi yang dipakai produksi. D–F memeriksa
// sumber, untuk hal yang tidak bisa dijalankan tanpa DB/React.
//
// Jalankan: npx tsx scripts/test-blud-urai-geser.mts

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  uraiGeser, totalUraian, periksaUraian, pesanUraianTidakCocok,
  sudahDiurai, uraianTurunan, petaDaun, URAIAN_NOL,
} from '../lib/blud/urai-geser'
import { recalcPergeseranJumlah, partialRecalcPergeseran } from '../lib/blud/recalc'
import { tutupPergeseranRows } from '../lib/blud/tutup-pergeseran'
import { pergeseranKeInput, dpaKePergeseranInput } from '../lib/blud/row-map'
import { PergeseranBarisInputSchema } from '../lib/blud/schemas'
import { buatWorkbookPergeseran } from '../lib/blud/export/dpa-dokumen'
import type { PergeseranBarisInput, PergeseranBaris, DpaBaris } from '../types'

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const baca = (p: string) => fs.readFileSync(path.join(repo, p), 'utf8')

/** Buang komentar dulu: prosa yang MENJELASKAN bug lama tidak boleh menyalakan
 *  tesnya sendiri, dan paragraf penjelasan baru tidak boleh menggeser kode yang
 *  diperiksa ke luar jendela (L82c). */
const kode = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')

let lulus = 0
let gagal = 0
function cek(nama: string, syarat: boolean, catatan = '') {
  if (syarat) { lulus++; console.log(`  ok    ${nama.padEnd(64)} ${catatan}`) }
  else        { gagal++; console.log(`  GAGAL ${nama.padEnd(64)} ${catatan}`) }
}

// ── Pohon uji ───────────────────────────────────────────────────────────────
//
//   akar
//    └─ induk
//        ├─ C   80 → 113   diurai tangan 45 / 12   (dua arah)
//        ├─ A  500 → 400   satu arah turun
//        └─ G   50 →  75   satu arah naik
//
// Induk: dijumlah dari anak = 70 / 12. Diturunkan dari selisihnya sendiri
// (−62) = 0 / 62 — angka yang sama sekali berbeda. Itu inti §4.

const b = (o: Partial<PergeseranBarisInput> & { row_id: string }): PergeseranBarisInput => ({
  kode_rekening: o.row_id, uraian: `Uraian ${o.row_id}`,
  vol: null, satuan: null, harga: null, jumlah: 0,
  vol_p: null, harga_p: null, pergeseran: 0, bertambah_berkurang: 0,
  bertambah: null, berkurang: null,
  penanggung_jawab: '', keterangan: '',
  tipe_baris: 'CHILD', parent_id: null, urutan: 0,
  ...o,
})

const pohon: PergeseranBarisInput[] = [
  b({ row_id: 'akar',  parent_id: null,    jumlah: 630, pergeseran: 588, bertambah_berkurang: -42 }),
  b({ row_id: 'induk', parent_id: 'akar',  jumlah: 630, pergeseran: 588, bertambah_berkurang: -42 }),
  b({ row_id: 'C',     parent_id: 'induk', jumlah: 80,  pergeseran: 113, bertambah_berkurang: 33,
      bertambah: 45, berkurang: 12 }),
  b({ row_id: 'A',     parent_id: 'induk', jumlah: 500, pergeseran: 400, bertambah_berkurang: -100 }),
  b({ row_id: 'G',     parent_id: 'induk', jumlah: 50,  pergeseran: 75,  bertambah_berkurang: 25 }),
]

console.log('\n── A. Uraian & rollup ──')
const peta = uraiGeser(pohon)
const u = (id: string) => peta.get(id) ?? URAIAN_NOL

cek('Baris diurai tangan dipakai apa adanya', u('C').bertambah === 45 && u('C').berkurang === 12,
  `${u('C').bertambah} / ${u('C').berkurang}`)
cek('…TIDAK diturunkan jadi 33/0', !(u('C').bertambah === 33 && u('C').berkurang === 0),
  'itu justru yang membuat rekening dua arah kehilangan separuh ceritanya')
cek('Satu arah turun → masuk Berkurang', u('A').bertambah === 0 && u('A').berkurang === 100)
cek('Satu arah naik → masuk Bertambah', u('G').bertambah === 25 && u('G').berkurang === 0)
cek('Baris satu arah tidak perlu diketik', pohon.filter(r => sudahDiurai(r)).length === 1,
  'dari 5 baris hanya 1 yang disentuh tangan')

// §4 — mutasi (d) hidup di sini.
cek('Induk DIJUMLAH dari anak', u('induk').bertambah === 70 && u('induk').berkurang === 112,
  `${u('induk').bertambah} / ${u('induk').berkurang}`)
cek('…bukan diturunkan dari selisihnya sendiri',
  !(u('induk').bertambah === 0 && u('induk').berkurang === 42),
  'selisih induk −42 akan memberi 0/42 — angka yang sama sekali lain')
cek('Kakek ikut menggulung', u('akar').bertambah === 70 && u('akar').berkurang === 112)

const tot = totalUraian(pohon)
cek('Total dokumen dari baris AKAR saja', tot.bertambah === 70 && tot.berkurang === 112,
  `${tot.bertambah} / ${tot.berkurang} — bukan menjumlah semua baris`)

console.log('\n── B. Dokumen berimbang: total Bertambah = total Berkurang ──')
// Contoh §1 konsep, dipadatkan: A −100 ke C(+30) & G(+70); C juga melepas 12 ke I.
const berimbang: PergeseranBarisInput[] = [
  b({ row_id: 'r',  parent_id: null, jumlah: 1000, pergeseran: 1000 }),
  b({ row_id: 'A2', parent_id: 'r',  jumlah: 500, pergeseran: 400, bertambah_berkurang: -100 }),
  b({ row_id: 'C2', parent_id: 'r',  jumlah: 100, pergeseran: 118, bertambah_berkurang: 18,
      bertambah: 30, berkurang: 12 }),
  b({ row_id: 'G2', parent_id: 'r',  jumlah: 300, pergeseran: 370, bertambah_berkurang: 70 }),
  b({ row_id: 'I2', parent_id: 'r',  jumlah: 100, pergeseran: 112, bertambah_berkurang: 12 }),
]
const totB = totalUraian(berimbang)
cek('Total Bertambah = total Berkurang', totB.bertambah === totB.berkurang,
  `${totB.bertambah} = ${totB.berkurang}`)
cek('…dan bukan nol (bukti geserannya nyata)', totB.bertambah === 112)

console.log('\n── C. Invarian & recalc ──')
cek('Uraian cocok → tidak dipersoalkan', periksaUraian(pohon).length === 0)

const salah = periksaUraian([...pohon.slice(0, 2), b({
  row_id: 'C', parent_id: 'induk', jumlah: 80, pergeseran: 113, bertambah: 45, berkurang: 99,
}), ...pohon.slice(3)])
cek('Uraian tidak cocok ditolak', salah.length === 1, `${salah.length} baris`)
cek('…pesannya menyebut rekeningnya', pesanUraianTidakCocok(salah).includes('C'),
  '"tidak cocok" tanpa nama tidak bisa ditindaklanjuti')

// Baris INDUK yang menyimpan uraian tangan TIDAK boleh ikut diperiksa: angkanya
// dijumlah dari anak, jadi ia tidak punya uraian sendiri untuk dicocokkan dengan
// selisihnya. Keadaan ini nyata — sebuah daun yang sudah diurai lalu DAPAT ANAK
// menyisakan nilai lama di DB (layar melepasnya, data lama belum tentu). Tanpa
// saringan daun, `periksaUraian` menolak Simpan pada baris yang bahkan tidak
// bisa disunting siapa pun.
const indukBerurai: PergeseranBarisInput[] = [
  b({ row_id: 'p', parent_id: null, jumlah: 630, pergeseran: 588, bertambah_berkurang: -42,
      bertambah: 70, berkurang: 12 }),   // 70 − 12 = 58, sedangkan selisihnya −42
  b({ row_id: 'k', parent_id: 'p',  jumlah: 630, pergeseran: 588, bertambah_berkurang: -42 }),
]
cek('Induk yang menyimpan uraian TIDAK ikut diperiksa',
  periksaUraian(indukBerurai).length === 0,
  '70 − 12 = 58 tidak sama dengan −42, dan itu memang tidak dipersoalkan')
cek('…tapi anaknya yang salah TETAP tertangkap',
  periksaUraian([indukBerurai[0], b({ row_id: 'k', parent_id: 'p', jumlah: 100,
    pergeseran: 150, bertambah: 10, berkurang: 0 })]).length === 1,
  'saringannya daun, bukan mematikan pemeriksaan')

cek('Induk yang selisihnya tidak sama dengan anak TIDAK dipersoalkan',
  periksaUraian(pohon).length === 0,
  'induk tidak pernah punya uraian sendiri untuk dicocokkan')

cek('Turunan: naik → Bertambah', uraianTurunan(25).bertambah === 25 && uraianTurunan(25).berkurang === 0)
cek('Turunan: turun → Berkurang', uraianTurunan(-25).berkurang === 25 && uraianTurunan(-25).bertambah === 0)
cek('Nol tidak jadi Berkurang negatif', uraianTurunan(0).bertambah === 0 && uraianTurunan(0).berkurang === 0)
cek('Salah satu terisi sudah dihitung diurai', sudahDiurai({ bertambah: 5, berkurang: null }))
cek('Dua-duanya kosong = belum diurai', !sudahDiurai({ bertambah: null, berkurang: null }))
cek('petaDaun mengenali daun saja', petaDaun(pohon).has('C') && !petaDaun(pohon).has('induk'))

// §2.1 — MUTASI (a). Yang paling menentukan di seluruh suite.
const sesudahRecalc = recalcPergeseranJumlah(pohon)
const cRecalc = sesudahRecalc.find(r => r.row_id === 'C')!
cek('recalcPergeseranJumlah TIDAK menyentuh uraian tangan',
  cRecalc.bertambah === 45 && cRecalc.berkurang === 12,
  `${cRecalc.bertambah} / ${cRecalc.berkurang} — jalan tiap tabel dihitung ulang`)

const sesudahParsial = partialRecalcPergeseran(pohon, 'A')
const cParsial = sesudahParsial.find(r => r.row_id === 'C')!
cek('partialRecalcPergeseran TIDAK menyentuh uraian tangan',
  cParsial.bertambah === 45 && cParsial.berkurang === 12,
  'jalan TIAP KETIKAN — di sinilah 45/12 dulu akan lenyap')

// §5.2 — MUTASI (c).
const ditutup = tutupPergeseranRows(pohon)
cek('tutupPergeseranRows melepas uraian',
  ditutup.every(r => r.bertambah == null && r.berkurang == null),
  'sesudah penutupan selisih nol; uraian yang tertinggal berdiri di atas nol')
cek('…dan selisihnya memang jadi nol',
  ditutup.every(r => (r.bertambah_berkurang ?? 0) === 0))
cek('Uraian yang dilepas tidak menyisakan pelanggaran invarian',
  periksaUraian(ditutup).length === 0)

console.log('\n── D. Zod & pemetaan ──')
const barisZod = {
  kode_rekening: '5.1', uraian: 'ATK', vol: null, satuan: null, harga: null, jumlah: 80,
  vol_p: null, harga_p: null, pergeseran: 113, bertambah_berkurang: 33,
  tipe_baris: 'CHILD', row_id: 'r1', parent_id: null, urutan: 0,
}
// §2.2 — MUTASI (b). Snapshot lama TIDAK punya kedua field ini sama sekali.
cek('Baris TANPA kolom baru tetap lolos Zod',
  PergeseranBarisInputSchema.safeParse(barisZod).success,
  '50 snapshot riwayat + cadangan Drive dibuat sebelum kolom ini ada')
cek('null diterima', PergeseranBarisInputSchema.safeParse({ ...barisZod, bertambah: null, berkurang: null }).success)
cek('Angka diterima', PergeseranBarisInputSchema.safeParse({ ...barisZod, bertambah: 45, berkurang: 12 }).success)
cek('Negatif DITOLAK', !PergeseranBarisInputSchema.safeParse({ ...barisZod, bertambah: -5 }).success,
  '"bertambah −5jt" tidak punya arti dan bisa memenuhi invarian dengan angka omong kosong')

// §5.2 — MUTASI (g).
const dariDb = {
  id: 1, versi_tanggal: '2026-02-01', dpa_versi_tanggal: '2026-01-01',
  kode_rekening: '5.1', uraian: 'ATK', vol: null, satuan: null, harga: null, jumlah: 80,
  vol_p: null, harga_p: null, pergeseran: 113, bertambah_berkurang: 33,
  bertambah: 45, berkurang: 12,
  penanggung_jawab: null, keterangan: null,
  tipe_baris: 'CHILD', row_id: 'r1', anggaran_key: null, parent_id: null, urutan: 0,
} satisfies PergeseranBaris
const klien = pergeseranKeInput(dariDb)
cek('pergeseranKeInput membawa uraian', klien.bertambah === 45 && klien.berkurang === 12,
  'satu-satunya tempat baris server→klien dipetakan; yang lupa terbuang senyap')
cek('…null tetap null, bukan 0',
  pergeseranKeInput({ ...dariDb, bertambah: null, berkurang: null }).bertambah === null,
  'nol dan "belum diuraikan" dua hal berbeda')

const dpaAsli = {
  id: 1, versi_tanggal: '2026-01-01', kode_rekening: '5.1', uraian: 'ATK',
  vol: 1, satuan: null, harga: 80, jumlah: 80, penanggung_jawab: null, keterangan: null,
  tipe_baris: 'CHILD', row_id: 'd1', anggaran_key: null, parent_id: null, urutan: 0,
  origin: 'MANUAL', usulan_item_id: null, usulan_no: null,
} as unknown as DpaBaris
cek('dpaKePergeseranInput lahir tanpa uraian',
  dpaKePergeseranInput(dpaAsli, 0).bertambah === null,
  'salinan DPA belum digeser sama sekali')

console.log('\n── E. Sumber — yang tidak bisa dijalankan di sini ──')
const recalcSrc = kode(baca('lib/blud/recalc.ts'))
// Batas `(?<![_\w])` WAJIB: tanpa itu `bertambah_berkurang: selisih` yang memang
// SEHARUSNYA ada di partialRecalcPergeseran ikut cocok, dan pemeriksaan ini
// menyalak pada kode yang benar (L82c — mengutip sepotong).
cek('recalc tidak pernah menulis `bertambah:` / `berkurang:` dari selisih',
  !/(?<![_\w])bertambah:\s*(Math\.max|selisih|baru|hitung)/.test(recalcSrc)
  && !/(?<![_\w])berkurang:\s*(Math\.max|selisih|baru|hitung)/.test(recalcSrc),
  'kalau recalc ikut mengisi, 45/12 tertimpa jadi 33/0 tiap ketikan')

const dbSrc = kode(baca('lib/blud/data.ts'))
cek('Kolom terdaftar di PERGESERAN_COLUMNS',
  /'bertambah',\s*'berkurang'/.test(dbSrc),
  'kalau tidak, tidak pernah tertulis ke DB')
cek('Nilai ditulis `?? null`, bukan `?? 0`',
  /r\.bertambah \?\? null, r\.berkurang \?\? null/.test(dbSrc))
cek('Dibaca balik dengan null dipertahankan',
  /bertambah: r\.bertambah != null \? Number\(r\.bertambah\) : null/.test(dbSrc))

const routeSrc = kode(baca('app/api/blud/pergeseran/route.ts'))
cek('Route menolak uraian yang tidak cocok',
  /periksaUraian\(recalced, mutasi\)/.test(routeSrc) && /URAIAN_GESER_TIDAK_COCOK/.test(routeSrc),
  'argumen kedua: baris yang dijelaskan catatan perpindahan diperiksa periksaMutasi')
cek('…diperiksa SESUDAH recalc',
  routeSrc.indexOf('const recalced') < routeSrc.indexOf('periksaUraian(recalced'),
  '`pergeseran` baris agregat baru final sesudah recalc')

const salinSrc = kode(baca('lib/blud/row-map.ts'))
cek('Salin Tahun tidak membawa uraian',
  !/pergeseranKeTahunBaruInput[\s\S]{0,900}bertambah:/.test(salinSrc),
  'uraian geseran tahun lalu tidak menjelaskan pagu awal tahun baru')

console.log('\n── F. Dokumen & layar ──')
// Workbook SUNGGUHAN lewat `buatWorkbookPergeseran` — fungsi yang sama dengan
// tombol unduh. Mencocokkan teks sumber tidak membuktikan selnya terisi di
// posisi yang benar.
const wbRows: PergeseranBaris[] = [
  { row_id: 'p', parent_id: null, tipe_baris: 'MASTER', urutan: 1,
    kode_rekening: '5.1', uraian: 'BELANJA', vol: null, satuan: null, harga: null,
    jumlah: 630, vol_p: null, harga_p: null, pergeseran: 588, bertambah_berkurang: -42,
    bertambah: null, berkurang: null },
  { row_id: 'c', parent_id: 'p', tipe_baris: 'CHILD', urutan: 2,
    kode_rekening: '5.1.01', uraian: 'ATK', vol: 1, satuan: 'th', harga: 80,
    jumlah: 80, vol_p: 1, harga_p: 113, pergeseran: 113, bertambah_berkurang: 33,
    bertambah: 45, berkurang: 12 },
  { row_id: 'a', parent_id: 'p', tipe_baris: 'CHILD', urutan: 3,
    kode_rekening: '5.1.02', uraian: 'Listrik', vol: 1, satuan: 'th', harga: 550,
    jumlah: 550, vol_p: 1, harga_p: 475, pergeseran: 475, bertambah_berkurang: -75,
    bertambah: null, berkurang: null },
].map(r => ({ ...r, id: 0, versi_tanggal: '2026-09-01', dpa_versi_tanggal: '2026-08-29',
  anggaran_key: null, penanggung_jawab: null, keterangan: null })) as unknown as PergeseranBaris[]

const wb = await buatWorkbookPergeseran({ tahun: 2026, versi: '2026-09-01', rows: wbRows })
const ws = wb.worksheets[0]
// Baris header dicari, bukan ditebak: `tulisJudul` menyisipkan beberapa baris
// kop di atasnya dan jumlahnya bisa berubah.
let barisKepala = 0
ws.eachRow((row, n) => { if (!barisKepala && String(row.getCell(1).value ?? '') === 'Kode Rekening') barisKepala = n })
const judulKolom = ((ws.getRow(barisKepala).values as unknown[]) ?? []).slice(1).map(v => String(v ?? ''))
cek('Excel punya kolom Bertambah, Berkurang, Selisih',
  judulKolom.slice(9, 12).join('|') === 'Bertambah|Berkurang|Selisih',
  judulKolom.slice(9, 12).join(' · '))

// Baris data pertama sesudah header — cari baris ATK lewat kode rekeningnya.
let barisAtk = 0
ws.eachRow((row, n) => { if (String(row.getCell(1).value ?? '') === '5.1.01') barisAtk = n })
cek('Baris ATK ketemu di workbook', barisAtk > 0, `baris ${barisAtk}`)
const selAtk = (k: number) => ws.getRow(barisAtk).getCell(k).value

cek('Uraian tangan tertulis sebagai NILAI', selAtk(10) === 45 && selAtk(11) === 12,
  `${selAtk(10)} / ${selAtk(11)}`)
const selSelisih = selAtk(12) as { formula?: string } | null
cek('Kolom Selisih TETAP rumus I−F',
  !!selSelisih && selSelisih.formula === `I${barisAtk}-F${barisAtk}`,
  selSelisih?.formula ?? String(selSelisih))

let barisInduk = 0
ws.eachRow((row, n) => { if (String(row.getCell(1).value ?? '') === '5.1') barisInduk = n })
cek('Induk memuat rollup, bukan turunan selisihnya sendiri',
  ws.getRow(barisInduk).getCell(10).value === 45
  && ws.getRow(barisInduk).getCell(11).value === 87,
  `${ws.getRow(barisInduk).getCell(10).value} / ${ws.getRow(barisInduk).getCell(11).value} — selisih induk −42 akan memberi ''/42`)

cek('Level & Jangkar bergeser ke kolom 13-14',
  judulKolom[12] === 'Level' && judulKolom[13] === 'Jangkar',
  `${judulKolom[12]} · ${judulKolom[13]}`)

const cetakSrc = kode(baca('lib/blud/cetak-data.ts'))
// Yang dijaga argumen PERTAMA-nya: `sorted`, bukan daftar penuh. Argumen kedua
// (catatan perpindahan) menyusul kemudian, jadi pengikatnya `[,)]` — mengunci
// `uraiGeser(sorted)` persis akan menyalak pada kode yang benar.
cek('Cetak memakai uraiGeser atas baris TERSARING',
  /uraiGeser\(sorted[,)]/.test(cetakSrc),
  'cetak "yang bergeser saja" membawa induk tanpa anak yang diam')

const clientSrc = kode(baca('app/(dashboard)/blud/pergeseran/pergeseran-client.tsx'))
cek('Uraian dihitung sekali untuk seluruh pohon',
  /useMemo\(\(\) => uraiGeser\(rows, mutasi\), \[rows, mutasi\]\)/.test(clientSrc),
  'memanggilnya di dalam map membuat rollup O(n²) pada 558 baris')
// L81b — prop objek lahir baru tiap render dan `memo` berhenti menggigit.
cek('Prop baris berupa ANGKA, bukan objek uraian',
  /uBertambah=\{/.test(clientSrc) && !/urai=\{peta/.test(clientSrc))
cek('setUraian tidak lewat recalc',
  /const setUraian = useCallback\([\s\S]{0,400}onChange\(rowsRef\.current\.map/.test(clientSrc)
  && !/setUraian[\s\S]{0,400}partialRecalcPergeseran/.test(clientSrc),
  'kolom ini tidak menggerakkan angka apa pun')
cek('Hanya baris daun yang bisa diisi',
  /editable \? \(\s*<InputNominal[\s\S]{0,400}row\.bertambah/.test(clientSrc),
  '`editable` sudah memuat `!isAgg`')
// Ribuannya bertitik seperti kolom uang lain — tapi `nullable` WAJIB ikut:
// tanpa itu mengosongkan sel terkirim sebagai 0, barisnya mengaku sudah
// diuraikan, lalu ditolak `periksaUraian` saat menyimpan.
cek('Kedua kolom memakai InputNominal ragam nullable',
  (clientSrc.match(/<InputNominal\s+nullable/g) ?? []).length === 2,
  `${(clientSrc.match(/<InputNominal\s+nullable/g) ?? []).length} dari 2`)
cek('…dan null diteruskan apa adanya, bukan dijadikan 0',
  /onChange=\{v => aksi\.setUraian\(row\.row_id, 'bertambah', v\)\}/.test(clientSrc)
  && /onChange=\{v => aksi\.setUraian\(row\.row_id, 'berkurang', v\)\}/.test(clientSrc))

// `[data-tooltip]` di globals.css mengecualikan `input` — elemen tergantikan
// tidak merender `::after`. Keterangannya harus menempel di `td`.
cek('Keterangan kolom dipasang di td, bukan di kotak isiannya',
  (clientSrc.match(/data-tooltip=\{editable \?/g) ?? []).length === 2
  && !/<InputNominal[\s\S]{0,300}data-tooltip/.test(clientSrc),
  `${(clientSrc.match(/data-tooltip=\{editable \?/g) ?? []).length} dari 2`)

const nominalSrc = kode(baca('components/ui/input-nominal.tsx'))
cek('Ragam nullable mengirim null saat dikosongkan',
  /if \(raw === ''\) \{ setDisplay\(''\); kirim\(null\); return; \}/.test(nominalSrc)
  && /if \(props\.nullable\) props\.onChange\(v\);\s*else props\.onChange\(v \?\? 0\)/.test(nominalSrc),
  'ragam biasa TETAP mengirim 0 — 14 pemakai lain bergantung padanya')
cek('…dan nol tetap tampil "0", bukan kosong',
  /nullable \? \(v == null \? '' : v\.toLocaleString\('id-ID'\)\) : formatNominal\(v\)/.test(nominalSrc),
  'formatNominal memulangkan string kosong untuk 0 — itu menghapus beda "nol" dan "belum diisi"')

// `InputNominal` merender type="text"; aturan warna & kotak merah dikunci ke
// atribut itu. Lupa menggantinya = seluruh aturan berhenti cocok tanpa galat.
const cssSrc = baca('app/globals.css')
cek('Aturan .pg-urai mengikuti type="text"',
  (cssSrc.match(/input\.pg-urai\.[a-z-]+\[type="text"\]/g) ?? []).length === 5
  && !/input\.pg-urai\.[a-z-]+\[type="number"\]/.test(cssSrc),
  `${(cssSrc.match(/input\.pg-urai\.[a-z-]+\[type="text"\]/g) ?? []).length} dari 5 aturan`)
cek('Baris yang baru dapat anak melepas uraiannya',
  /willSwitchToAggregator[\s\S]{0,400}bertambah: null, berkurang: null/.test(clientSrc),
  'induk tidak punya tempat untuk uraian tangan')
cek('Total dokumen tampil di tabel', /totalUrai\.bertambah/.test(clientSrc))
cek('Spanduk uraian tidak cocok ada', /salahUrai\.size > 0/.test(clientSrc))

console.log(`\n${lulus} pemeriksaan LULUS · ${gagal} GAGAL`)
process.exit(gagal > 0 ? 1 : 0)
