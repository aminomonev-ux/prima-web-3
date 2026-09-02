// scripts/test-blud-terapkan-uraian.mts — tombol Terapkan pada uraian pergeseran.
// Konsep: docs/CONCEPT-blud-terapkan-uraian.md
//
// Lima keputusan yang masing-masing punya bentuk "benar tapi salah":
//
//   §2  tawarannya muncul HANYA saat uraiannya belum cocok, dan HANYA di baris
//       daun yang punya Vol P. Membagi dengan nol memulangkan Infinity yang
//       lolos sampai ke `harga_p` tanpa satu galat pun.
//   §2  selisih pembulatan SELALU disebutkan. Menyembunyikannya membuat orang
//       mengira angkanya persis.
//   §3  yang diubah HARGA, bukan VOLUME — volume itu jumlah barang atau orang.
//   §4  uraiannya IKUT disesuaikan. Kalau tidak, pembulatan tadi membuat
//       `periksaUraian` menolak barisnya saat menyimpan: tombol ini sendiri
//       yang bikin gagal.
//   §5  tanpa ditekan, tidak ada satu angka pun yang berubah; Batal cuma
//       menutup tawaran, bukan menghapus angka atau kotak merahnya.
//
// Bagian A–B menguji PERILAKU lewat fungsi yang dipakai produksi. C memeriksa
// sumber, untuk hal yang tidak bisa dijalankan tanpa React.
//
// Jalankan: npx tsx scripts/test-blud-terapkan-uraian.mts

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { tawaranTerapkan, periksaUraian } from '../lib/blud/urai-geser'
import { partialRecalcPergeseran } from '../lib/blud/recalc'
import { PergeseranBarisInputSchema } from '../lib/blud/schemas'
import type { PergeseranBarisInput } from '../types'

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const baca = (p: string) => fs.readFileSync(path.join(repo, p), 'utf8')

/** Buang komentar dulu: prosa yang MENJELASKAN aturannya tidak boleh menyalakan
 *  tesnya sendiri, dan paragraf baru tidak boleh menggeser kode yang diperiksa
 *  ke luar jendela (L82c). */
const kode = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')

let lulus = 0
let gagal = 0
function cek(nama: string, syarat: boolean, catatan = '') {
  if (syarat) { lulus++; console.log(`  ok    ${nama.padEnd(66)} ${catatan}`) }
  else        { gagal++; console.log(`  GAGAL ${nama.padEnd(66)} ${catatan}`) }
}

const b = (o: Partial<PergeseranBarisInput> & { row_id: string }): PergeseranBarisInput => ({
  kode_rekening: o.row_id, uraian: `Uraian ${o.row_id}`,
  vol: null, satuan: null, harga: null, jumlah: 0,
  vol_p: null, harga_p: null, pergeseran: 0, bertambah_berkurang: 0,
  bertambah: null, berkurang: null,
  penanggung_jawab: '', keterangan: '',
  tipe_baris: 'CHILD', parent_id: null, urutan: 0,
  ...o,
})

/** Baris daun yang angkanya konsisten: `pergeseran = vol_p × harga_p`, persis
 *  invarian yang dijaga `recalcPergeseranJumlah`. */
const daun = (o: Partial<PergeseranBarisInput> & { row_id: string; vol_p: number | null; harga_p: number | null }) => {
  const pergeseran = (o.vol_p == null || o.harga_p == null) ? 0 : Math.round(o.vol_p * o.harga_p)
  return b({ ...o, parent_id: 'akar', pergeseran, bertambah_berkurang: pergeseran - (o.jumlah ?? 0) })
}

// ── Pohon uji ───────────────────────────────────────────────────────────────
//
//   akar
//    ├─ dokter   108 × 4.000.000, jumlah 466.000.000, diketik +10.000.000
//    ├─ atk        7 × 11.000.000, jumlah  80.000.000, diketik +45.000.000 / −12.000.000
//    ├─ listrik    7 × 14,         jumlah 100,         diketik −10
//    ├─ pas        1 × 0,          jumlah 0,           diketik +150.000
//    ├─ cocok      2 × 60,         jumlah 100,         diketik +20   (sudah pas)
//    ├─ nolvol     0 × 100,        jumlah 50,          diketik +20
//    ├─ nullvol  null,             jumlah 50,          diketik +20
//    └─ minus      2 × 5,          jumlah 10,          diketik −100
//
const pohon: PergeseranBarisInput[] = [
  b({ row_id: 'akar', parent_id: null, jumlah: 546_000_000, pergeseran: 509_000_000 }),
  daun({ row_id: 'dokter',  vol_p: 108,  harga_p: 4_000_000,  jumlah: 466_000_000, bertambah: 10_000_000 }),
  daun({ row_id: 'atk',     vol_p: 7,    harga_p: 11_000_000, jumlah: 80_000_000, bertambah: 45_000_000, berkurang: 12_000_000 }),
  daun({ row_id: 'listrik', vol_p: 7,    harga_p: 14,         jumlah: 100, berkurang: 10 }),
  daun({ row_id: 'pas',     vol_p: 1,    harga_p: 0,          jumlah: 0,   bertambah: 150_000 }),
  daun({ row_id: 'cocok',   vol_p: 2,    harga_p: 60,         jumlah: 100, bertambah: 20 }),
  daun({ row_id: 'nolvol',  vol_p: 0,    harga_p: 100,        jumlah: 50,  bertambah: 20 }),
  daun({ row_id: 'nullvol', vol_p: null, harga_p: null,       jumlah: 50,  bertambah: 20 }),
  daun({ row_id: 'minus',   vol_p: 2,    harga_p: 5,          jumlah: 10,  berkurang: 100 }),
]

console.log('\n── A. Kapan ditawarkan, dan angkanya berapa ──')

const salinanAwal = JSON.stringify(pohon)
const tawar = tawaranTerapkan(pohon)
cek('Menghitung tawaran TIDAK mengubah satu angka pun', JSON.stringify(pohon) === salinanAwal,
  'tanpa menekan tombol, tabelnya harus utuh')

const t = (id: string) => tawar.get(id)

// Contoh §2 konsep: 108 dokter, pagu dituju Rp 476.000.000.
cek('Harga P dihitung dari pagu yang DIMAKSUD', t('dokter')?.hargaBaru === 4_407_407,
  String(t('dokter')?.hargaBaru))
cek('…dan pembulatannya disebut apa adanya', t('dokter')?.meleset === -44,
  `476.000.000 − 475.999.956 = 44 rupiah yang tidak bisa dibagi rata ke 108`)
cek('Uraian ikut disesuaikan ke yang benar-benar terjadi',
  t('dokter')?.bertambah === 9_999_956,
  `${t('dokter')?.bertambah} — bukan 10.000.000, karena bukan itu yang terjadi`)
cek('Sisi yang tidak menanggung pembulatan tetap null',
  t('dokter')?.berkurang === null,
  'null dan 0 dua hal berbeda: yang satu "tidak ada", yang satu "nol"')

cek('Rekening dua arah: pembulatan ditanggung sisi TERBESAR',
  t('atk')?.bertambah === 44_999_999 && t('atk')?.berkurang === 12_000_000,
  `${t('atk')?.bertambah} / ${t('atk')?.berkurang} — 1 rupiah pada 45jt, bukan pada 12jt`)

cek('Rekening satu arah turun: yang disesuaikan Berkurang',
  t('listrik')?.berkurang === 9 && t('listrik')?.bertambah === null,
  `${t('listrik')?.bertambah} / ${t('listrik')?.berkurang}`)

cek('Volume satu → selalu pas', t('pas')?.meleset === 0 && t('pas')?.hargaBaru === 150_000,
  'tidak ada yang perlu dibagi')

cek('Uraian yang sudah cocok TIDAK ditawari', !tawar.has('cocok'),
  'tawaran di baris yang sudah benar cuma kebisingan')
cek('Vol P nol TIDAK ditawari', !tawar.has('nolvol'),
  'target / 0 memulangkan Infinity yang lolos sampai ke harga_p')
cek('Vol P kosong TIDAK ditawari', !tawar.has('nullvol'))
cek('Uraian yang menuntut harga negatif TIDAK ditawari', !tawar.has('minus'),
  'yang salah uraiannya, bukan pagunya')

// Baris INDUK: angkanya dijumlah dari anak, jadi tidak pernah punya uraian
// sendiri untuk dicocokkan. Kalau saringan daunnya lepas, baris ini dapat
// tawaran — dan menerapkannya menulis `harga_p` ke baris yang bahkan tidak
// punya kotak isian di layar.
const indukTawar: PergeseranBarisInput[] = [
  b({ row_id: 'p', parent_id: null, jumlah: 630, pergeseran: 588, bertambah_berkurang: -42,
      vol_p: 5, harga_p: 117, bertambah: 70, berkurang: 12 }),
  b({ row_id: 'k', parent_id: 'p', jumlah: 630, pergeseran: 588, bertambah_berkurang: -42 }),
]
cek('Baris INDUK tidak pernah ditawari', tawaranTerapkan(indukTawar).size === 0,
  '70 − 12 = 58 tidak sama dengan −42, dan itu memang tidak dipersoalkan')
cek('…tapi daun yang salah TETAP ditawari', tawaranTerapkan(pohon).size === 4,
  'saringannya daun, bukan mematikan tawarannya')

console.log('\n── B. Sesudah ditekan ──')

/** Persis yang dilakukan `terapkanUraian` di layar — tiga kolom, bukan empat. */
function terapkan(rows: PergeseranBarisInput[], rowId: string): PergeseranBarisInput[] {
  const tw = tawaranTerapkan(rows).get(rowId)
  if (!tw) throw new Error(`tidak ada tawaran untuk ${rowId}`)
  const updated = rows.map(r => r.row_id === rowId
    ? { ...r, harga_p: tw.hargaBaru, bertambah: tw.bertambah, berkurang: tw.berkurang }
    : r)
  return partialRecalcPergeseran(updated, rowId)
}

const sesudah = terapkan(pohon, 'dokter')
const dokterBaru = sesudah.find(r => r.row_id === 'dokter')!

cek('Harga P berubah', dokterBaru.harga_p === 4_407_407)
cek('Vol P TIDAK disentuh', dokterBaru.vol_p === 108,
  'volume itu 108 dokter — mengubahnya berarti mengubah rencana')
cek('Pagu jadi angka yang benar-benar terjadi', dokterBaru.pergeseran === 475_999_956,
  String(dokterBaru.pergeseran))
cek('Barisnya lolos pemeriksaan yang menahan Simpan',
  periksaUraian(sesudah).every(u => u.row_id !== 'dokter'),
  'tanpa penyesuaian uraian, tombol ini sendiri yang bikin barisnya ditolak')

cek('Induk ikut digulung ulang',
  sesudah.find(r => r.row_id === 'akar')!.pergeseran ===
    sesudah.filter(r => r.parent_id === 'akar').reduce((s, r) => s + (r.pergeseran ?? 0), 0))

cek('Baris lain tidak dapat identitas baru',
  sesudah.find(r => r.row_id === 'atk') === pohon.find(r => r.row_id === 'atk'),
  'L81 — 558 baris tidak boleh ikut dirender ulang')

cek('Hasilnya lolos Zod', PergeseranBarisInputSchema.safeParse({
  ...dokterBaru, tipe_baris: 'CHILD',
}).success, 'min(0) menolak uraian negatif')

// Semua kasus yang ditawari harus BERES sesudah diterapkan — termasuk yang
// pembulatannya jatuh ke sisi Berkurang.
let semuaBeres = true
for (const id of [...tawar.keys()]) {
  const hasil = terapkan(pohon, id)
  if (periksaUraian(hasil).some(u => u.row_id === id)) semuaBeres = false
  const baris = hasil.find(r => r.row_id === id)!
  if ((baris.bertambah ?? 0) < 0 || (baris.berkurang ?? 0) < 0) semuaBeres = false
}
cek('Keempat tawaran menyelesaikan barisnya, tanpa angka negatif', semuaBeres,
  `${tawar.size} baris diuji satu per satu`)

cek('Tawaran hilang sesudah diterapkan', !tawaranTerapkan(sesudah).has('dokter'),
  'kalau tidak, keterangannya menempel selamanya')

console.log('\n── C. Sumber layar ──')
const src = kode(baca('app/(dashboard)/blud/pergeseran/pergeseran-client.tsx'))

cek('Tawaran dihitung sekali untuk seluruh pohon',
  /useMemo\(\(\) => tawaranTerapkan\(rows\), \[rows\]\)/.test(src),
  'memanggilnya di dalam map membuat rollup O(n²) pada 558 baris')
cek('Prop baris berupa ANGKA, bukan objek tawaran',
  /tawarHarga=\{/.test(src) && !/tawar=\{tawaran\.get/.test(src),
  'L81b — objek lahir baru tiap render dan `memo` berhenti menggigit')
cek('Batal menyembunyikan tawarannya',
  /tawarTutup\.has\(row\.row_id\) \? null :/.test(src))

// MUTASI (a) — diterapkan tanpa ditekan. Kemunculannya DIHITUNG: satu tambahan
// di dalam sebuah efek sudah cukup untuk membuat angka uang berubah sendiri.
const sebutan = src.match(/terapkanUraian/g) ?? []
cek('`terapkanUraian` cuma disebut 5 kali', sebutan.length === 5,
  `${sebutan.length}× — tipe, definisi, berkas aksi, daftar dep, satu onClick`)
cek('…dan satu-satunya pemanggilnya sebuah onClick',
  (src.match(/onClick=\{\(\) => aksi\.terapkanUraian\(row\.row_id\)\}/g) ?? []).length === 1
  && (src.match(/aksi\.terapkanUraian\(/g) ?? []).length === 1,
  'angka uang tidak berubah tanpa diminta')

// MUTASI (c) — uraian tidak disesuaikan.
cek('Terapkan menulis harga DAN uraian yang sudah disesuaikan',
  /harga_p: tawar\.hargaBaru, bertambah: tawar\.bertambah, berkurang: tawar\.berkurang/.test(src))
cek('…dan TIDAK menyentuh vol_p', !/vol_p: tawar\./.test(src),
  '§3 — memangkas volume berarti memangkas 2 dokter')

// MUTASI (b) — selisih pembulatan tidak disebutkan.
cek('Selisih pembulatan selalu disebut',
  /tawarMeleset === 0 \? 'pas' : `meleset Rp \$\{formatRupiah\(Math\.abs\(tawarMeleset\)\)\}`/.test(src),
  'menyembunyikannya membuat orang mengira angkanya persis')

const blok = src.slice(src.indexOf('{tawarHarga != null && ('), src.indexOf('</>'))
cek('Kalimat "ubah sendiri Vol P / Harga P" menyertai tombolnya',
  blok.includes('Atau ubah sendiri Vol P / Harga P agar pas.'),
  'tombolnya cuma menawarkan SATU jalan')
cek('Tawarannya menutup seluruh lebar tabel',
  /colSpan=\{bolehUbah \? 17 : 16\}/.test(blok)
  && /colSpan=\{bolehUbah \? 4 : 3\}/.test(src),
  '11 + 1 + 1 + 4 = 17, sama dengan baris total di tfoot')
cek('Warnanya lewat kelas, bukan gaya sebaris',
  !/style=\{\{/.test(blok),
  'L82 — `[data-theme=light] table tbody td` menelan warna sebaris')

cek('Batal tidak menyentuh angkanya',
  /const tutupTawaran = useCallback\(\(rowId: string\) => \{\s*setTawarTutup\(prev => new Set\(prev\)\.add\(rowId\)\)\s*\}/.test(src),
  'ia menutup tawaran, bukan membereskan keadaannya')
cek('Mengetik ulang uraian memunculkan tawarannya lagi',
  /const setUraian = useCallback\([\s\S]{0,300}setTawarTutup\(prev => \{[\s\S]{0,200}next\.delete\(rowId\)/.test(src),
  'sasarannya berganti, jadi tawaran lama sudah tidak berlaku')
cek('…tapi menyunting Vol P / Harga P TIDAK',
  !/const updateVolHarga = useCallback\([\s\S]{0,400}setTawarTutup/.test(src),
  'itu justru jalan keluar yang ditawarkan kalimat di bawah tombol')

const css = baca('app/globals.css')
cek('Kelasnya ada di globals.css', /\.pg-tawar \{/.test(css))
cek('…dengan pasangan tema terang',
  /\[data-theme="light"\] table tbody td \.pg-tawar-teks/.test(css)
  && /\[data-theme="light"\] \.pg-tawar \{/.test(css),
  'merah muda di atas putih tidak terbaca')
// Ketahuan saat dijalankan: selnya ber-colSpan 17 jadi selebar ~1.900px, dan
// kalimat di ujung kiri + tombol di ujung kanan tidak pernah terlihat bersamaan.
cek('Lebarnya dibatasi, bukan selebar sel',
  /width: min\(860px, calc\(100vw - 48px\)\)/.test(css))
cek('…dan tetap menempel saat tabel digulir mendatar',
  /\.dpa-table\.v2 tbody tr\.pg-tawar-row > td > \.pg-tawar \{ position: sticky/.test(css),
  'sel tawaran kebetulan td:first-child, yang sudah dipasangi position: relative (0,3,3)')

console.log(`\n${lulus} pemeriksaan LULUS · ${gagal} GAGAL`)
process.exit(gagal > 0 ? 1 : 0)
