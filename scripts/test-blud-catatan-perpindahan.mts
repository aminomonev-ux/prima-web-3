// scripts/test-blud-catatan-perpindahan.mts — catatan perpindahan dari-ke.
// Konsep: docs/CONCEPT-blud-catatan-perpindahan.md
//
// Enam keputusan yang masing-masing punya bentuk "benar tapi salah":
//
//   §3   PAGU tetap patokan — catatan adalah penjelasan. Angkanya wajib cocok
//        dengan `pergeseran − jumlah` tiap baris, dan yang tidak cocok DISEBUT
//        rekeningnya.
//   §4.1b spanduk baris muncul sejak geseran PERTAMA (patokannya BARIS, bukan
//        "dokumen sudah punya catatan"). Salah patokan = fiturnya tidak pernah
//        ditemukan orang.
//   §7   menebak pasangan boleh HANYA kalau jawabannya tunggal. Dua turun dan
//        tiga naik bisa dipasangkan belasan cara.
//   §4.4 baris yang dijelaskan catatan mengambil angkanya dari situ, bukan dari
//        kolom tangan maupun selisihnya.
//   §6   enam jalur yang mengganti isi tabel wajib melepas catatannya, dan baris
//        yang dihapus menyeret catatan yang menunjuknya.
//   §5   ditulis hapus-lalu-tulis-ulang DI TRANSAKSI YANG SAMA dengan barisnya.
//
// Bagian A–C menguji PERILAKU lewat fungsi yang dipakai produksi. D memeriksa
// sumber, untuk hal yang tidak bisa dijalankan tanpa DB/React.
//
// Jalankan: npx tsx scripts/test-blud-catatan-perpindahan.mts

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  ringkasMutasi, periksaMutasi, periksaSasaranMutasi, pesanMutasiTidakCocok,
  barisPerluCatatan, tebakPasangan, totalMutasi, buangMutasiYatim, adaMutasi,
  type MutasiInput,
} from '../lib/blud/mutasi'
import { uraiGeser, totalUraian, periksaUraian, URAIAN_NOL } from '../lib/blud/urai-geser'
import { MutasiSchema } from '../lib/blud/schemas'
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

// ── Pohon uji — contoh §2 konsep ────────────────────────────────────────────
//
//   akar
//    ├─ atk    80 → 110   (menerima 42 dari pd, melepas 12 ke lab)
//    ├─ pd    100 →  58   (melepas 42)
//    └─ lab    20 →  32   (menerima 12)
//
const pohon: PergeseranBarisInput[] = [
  b({ row_id: 'akar', parent_id: null, jumlah: 200, pergeseran: 200 }),
  b({ row_id: 'atk',  parent_id: 'akar', jumlah: 80,  pergeseran: 110, bertambah_berkurang: 30 }),
  b({ row_id: 'pd',   parent_id: 'akar', jumlah: 100, pergeseran: 58,  bertambah_berkurang: -42 }),
  b({ row_id: 'lab',  parent_id: 'akar', jumlah: 20,  pergeseran: 32,  bertambah_berkurang: 12 }),
]

const catatan: MutasiInput[] = [
  { dari_row: 'pd',  ke_row: 'atk', nilai: 42, keterangan: 'kegiatan batal' },
  { dari_row: 'atk', ke_row: 'lab', nilai: 12, keterangan: 'reagen kurang' },
]

console.log('\n── A. Angka yang dihasilkan catatan ──')

const rk = ringkasMutasi(catatan)
cek('Rekening dua arah terbaca utuh',
  rk.get('atk')?.bertambah === 42 && rk.get('atk')?.berkurang === 12,
  `${rk.get('atk')?.bertambah} / ${rk.get('atk')?.berkurang} — bukan "+30" saja`)
cek('Yang melepas tercatat di sisi Berkurang', rk.get('pd')?.berkurang === 42)
cek('Yang menerima tercatat di sisi Bertambah', rk.get('lab')?.bertambah === 12)

const peta = uraiGeser(pohon, catatan)
const u = (id: string) => peta.get(id) ?? URAIAN_NOL
cek('uraiGeser mengambil angkanya dari catatan',
  u('atk').bertambah === 42 && u('atk').berkurang === 12)
cek('Induk tetap menggulung dari anak', u('akar').bertambah === 54 && u('akar').berkurang === 54,
  `${u('akar').bertambah} / ${u('akar').berkurang}`)

const tot = totalUraian(pohon, catatan)
cek('Total dokumen = nilai KOTOR yang benar-benar berpindah',
  tot.bertambah === 54 && tot.berkurang === 54,
  '54, bukan 42 — 12 juta yang lewat ATK ikut terhitung')
cek('…dan tanpa catatan angkanya memang 42',
  totalUraian(pohon).bertambah === 42,
  'diturunkan dari selisih: ATK cuma terbaca +30')

// §4.4 — catatan MENGALAHKAN kolom tangan. Kalau tidak, nilai lama yang
// tertinggal di kolom itu diam-diam mengalahkan catatan yang baru dibuat.
const pohonBerurai = pohon.map(r => (r.row_id === 'atk' ? { ...r, bertambah: 99, berkurang: 69 } : r))
cek('Catatan mengalahkan kolom tangan',
  uraiGeser(pohonBerurai, catatan).get('atk')?.bertambah === 42,
  '99/69 yang tertinggal tidak boleh menang')
cek('…dan kolom tangan itu berhenti menahan Simpan',
  periksaUraian(pohonBerurai, catatan).length === 0,
  'kolomnya sudah tidak bisa disunting — nilai basi di situ bukan salah pemakainya')
cek('Baris TANPA catatan tetap memakai kolom tangannya',
  uraiGeser([...pohon, b({ row_id: 'x', parent_id: 'akar', jumlah: 10, pergeseran: 15, bertambah: 8, berkurang: 3 })], catatan)
    .get('x')?.bertambah === 8,
  'dokumen yang baru sebagian dicatat tetap memulangkan angka yang benar')

console.log('\n── B. Pagar ──')

cek('Catatan yang cocok tidak dipersoalkan', periksaMutasi(pohon, catatan).length === 0)

const salah = periksaMutasi(pohon, [{ dari_row: 'pd', ke_row: 'atk', nilai: 30 }])
cek('Catatan yang tidak cocok ditolak', salah.length === 1, `${salah.length} baris`)
cek('…pesannya menyebut rekeningnya', pesanMutasiTidakCocok(salah).includes('pd'),
  '"tidak cocok" tanpa nama tidak bisa ditindaklanjuti')

cek('Menunjuk baris yang tidak ada ditolak',
  periksaSasaranMutasi(pohon, [{ dari_row: 'hantu', ke_row: 'atk', nilai: 5 }])
    .some(s => s.alasan === 'TIDAK_ADA'))
cek('Menunjuk baris INDUK ditolak',
  periksaSasaranMutasi(pohon, [{ dari_row: 'akar', ke_row: 'atk', nilai: 5 }])
    .some(s => s.alasan === 'INDUK'),
  'angka induk dijumlah dari anak — ia tidak punya geseran sendiri')
// Pagar berlapis: kalaupun catatan bermuatan induk lolos ke `periksaMutasi`
// (mis. dipanggil langsung tanpa lewat route), induknya TIDAK ikut dinilai.
// Tanpa fixture ini saringan daun di `periksaMutasi` tidak pernah dijalankan
// sama sekali, dan mutasi yang membuangnya sempat LOLOS.
cek('…dan periksaMutasi pun tidak ikut menilai induknya',
  !periksaMutasi(pohon, [{ dari_row: 'akar', ke_row: 'atk', nilai: 5 }])
    .some(s => s.row_id === 'akar'),
  'induk tidak punya geseran sendiri untuk dicocokkan')
cek('Dari dan ke rekening yang sama ditolak',
  periksaSasaranMutasi(pohon, [{ dari_row: 'atk', ke_row: 'atk', nilai: 5 }])
    .some(s => s.alasan === 'SAMA'))
cek('Nilai nol ditolak',
  periksaSasaranMutasi(pohon, [{ dari_row: 'pd', ke_row: 'atk', nilai: 0 }])
    .some(s => s.alasan === 'NILAI'))
cek('Zod menolak nilai negatif', !MutasiSchema.safeParse({ dari_row: 'a', ke_row: 'b', nilai: -5 }).success)
cek('Zod menerima catatan yang benar',
  MutasiSchema.safeParse({ dari_row: 'a', ke_row: 'b', nilai: 5, keterangan: 'x' }).success)

cek('Baris dihapus menyeret catatannya',
  buangMutasiYatim(pohon.filter(r => r.row_id !== 'lab'), catatan).length === 1,
  'catatan yang menunjuk baris hilang membuat Simpan ditolak tanpa sebab yang terlihat')
cek('Total kotor dihitung dari nilainya', totalMutasi(catatan) === 54)
cek('adaMutasi membedakan kosong dari terisi', !adaMutasi([]) && adaMutasi(catatan))

console.log('\n── C. Kapan spanduknya muncul (§4.1b) ──')

const kosong = new Set<string>()
cek('Dokumen baru, belum disentuh → DIAM',
  barisPerluCatatan(pohon, [], kosong).size === 0,
  'membuka arsip lama tidak boleh memunculkan puluhan spanduk')
cek('Baris digeser di sesi ini → spanduk muncul, sejak geseran PERTAMA',
  barisPerluCatatan(pohon, [], new Set(['atk'])).has('atk'),
  'inilah yang membuat orang tidak perlu menggulung balik ke bilah alat')
cek('…dan hanya baris itu', barisPerluCatatan(pohon, [], new Set(['atk'])).size === 1)
cek('Dokumen yang SUDAH punya catatan → yang belum dijelaskan tetap menyalak',
  barisPerluCatatan(pohon, [{ dari_row: 'pd', ke_row: 'atk', nilai: 42 }], kosong).has('lab'),
  'daftar pekerjaan yang habis sendiri begitu catatannya dibuat')
cek('Baris yang sudah dijelaskan berhenti menyalak',
  !barisPerluCatatan(pohon, catatan, new Set(['atk'])).has('atk'))
cek('Baris yang tidak bergeser tidak pernah menyalak',
  !barisPerluCatatan([b({ row_id: 'diam', parent_id: null, jumlah: 10, pergeseran: 10 })], [], new Set(['diam'])).has('diam'))
cek('Baris INDUK tidak pernah menyalak',
  !barisPerluCatatan(pohon, [], new Set(['akar', 'atk'])).has('akar'))

console.log('\n── D. Tebakan pasangan (§7) ──')

const duaBaris: PergeseranBarisInput[] = [
  b({ row_id: 'a', parent_id: null, jumlah: 10_000_000, pergeseran: 5_000_000 }),
  b({ row_id: 'b', parent_id: null, jumlah: 2_000_000,  pergeseran: 7_000_000 }),
]
const t = tebakPasangan(duaBaris)
cek('Satu turun & satu naik → ditebak',
  t?.dari_row === 'a' && t?.ke_row === 'b' && t?.nilai === 5_000_000,
  'cuma ada satu cara memasangkannya, jadi menebaknya bukan mengarang')
cek('Dua turun & satu naik → TIDAK ditebak',
  tebakPasangan([...duaBaris, b({ row_id: 'c', parent_id: null, jumlah: 5_000_000, pergeseran: 4_000_000 })]) === null,
  'belasan cara memasangkannya — menebak menghasilkan dokumen rapi yang salah')
cek('Nilainya tidak sama → TIDAK ditebak',
  tebakPasangan([
    b({ row_id: 'a', parent_id: null, jumlah: 10, pergeseran: 5 }),
    b({ row_id: 'b', parent_id: null, jumlah: 2, pergeseran: 9 }),
  ]) === null)
cek('Tidak ada yang bergeser → TIDAK ditebak', tebakPasangan(pohon.slice(0, 1)) === null)

console.log('\n── E. Sumber ──')
const dbSrc = kode(baca('lib/blud/data.ts'))
cek('Ditulis di transaksi yang SAMA dengan barisnya',
  /await bulkInsert\('pergeseran_dpa'[\s\S]{0,900}await tulisMutasi\(tx, conn/.test(dbSrc),
  'baris dan catatannya harus jatuh bersama atau tidak sama sekali')
cek('Hapus-lalu-tulis-ulang per (tahun, versi)',
  /DELETE FROM pergeseran_mutasi WHERE tahun_anggaran = \$\{tahun\} AND versi_tanggal = \$\{versiTanggal\}/.test(dbSrc))
// L69 — tiga jalur, dan dua di antaranya gampang dikira tidak ada.
cek('Jalur kosong+force ikut mengosongkan catatannya',
  (dbSrc.match(/tulisMutasi\(tx, undefined, tahun, versiTanggal, \[\]\)/g) ?? []).length === 2,
  'satu di cabang kosong+force, satu di deletePergeseranVersi')
cek('`undefined` berarti JANGAN SENTUH, bukan kosongkan',
  /if \(mutasi === undefined\) return/.test(dbSrc),
  'pemanggil lama tidak boleh menghapus catatan orang')

const routeSrc = kode(baca('app/api/blud/pergeseran/route.ts'))
// Jangkarnya `const sasaranSalah = …`, BUKAN nama fungsinya: `periksaSasaranMutasi`
// juga muncul di baris import di paling atas berkas, jadi `indexOf` atas nama
// telanjang selalu memulangkan posisi import dan pemeriksaan urutannya lulus
// apa pun isi badannya. Mutasi yang membalik urutan sempat LOLOS karena itu.
cek('Route memeriksa bentuk dulu, baru angkanya',
  routeSrc.indexOf('const sasaranSalah = periksaSasaranMutasi(') < routeSrc.indexOf('periksaMutasi(recalced'),
  'mencocokkan angka pada baris yang tidak ada tidak berarti apa-apa')
cek('Kedua penolakannya punya kode sendiri',
  /MUTASI_SASARAN_SALAH/.test(routeSrc) && /MUTASI_TIDAK_COCOK/.test(routeSrc))
cek('GET memulangkan catatannya', /getPergeseranMutasi\(tahun, versi\)/.test(routeSrc))
cek('Diteruskan ke savePergeseran', /asal_tutup \?\? null, mutasi,/.test(routeSrc))

const clientSrc = kode(baca('app/(dashboard)/blud/pergeseran/pergeseran-client.tsx'))
cek('Tiga pintu memanggil SATU pembuka',
  (clientSrc.match(/bukaCatatan\(/g) ?? []).length >= 3
  && /const bukaCatatan = useCallback\(\(rowId: string \| null\) => setCatatanBuka/.test(clientSrc),
  'dua tempat yang mengurus hal yang sama akan berbeda pendapat (L78)')
cek('Spanduk baris memakai patokan BARIS',
  /barisPerluCatatan\(rows, mutasi, digeserSesiIni\)/.test(clientSrc)
  && /setDigeserSesiIni\(prev => \(prev\.has\(rowId\) \? prev : new Set\(prev\)\.add\(rowId\)\)\)/.test(clientSrc),
  'ditandai di updateVolHarga, dan tidak melahirkan Set baru tiap ketikan (L81)')
cek('Spanduk atas hanya saat belum ada catatan sama sekali',
  /!lewatiCatatan && mutasi\.length === 0 && perluCatatan\.size > 0/.test(clientSrc))
cek('"Lewati dokumen ini" mematikan kedua tingkat',
  /perluCatatan=\{!lewatiCatatan && !abaikanCatat\.has\(row\.row_id\) && perluCatatan\.has\(row\.row_id\)\}/.test(clientSrc),
  'satu sakelar, dua tingkat')
cek('Kolomnya jadi hanya-baca saat dijelaskan catatan',
  (clientSrc.match(/editable && dariCatatan \?/g) ?? []).length === 2,
  'dua kolom — kalau cuma satu, yang lain masih bisa diketik dan bertengkar dengan catatan')
cek('mutasi SELALU dikirim, termasuk saat kosong',
  /^\s*mutasi,\s*$/m.test(clientSrc) && !/mutasi: mutasi\.length \? mutasi : undefined/.test(clientSrc),
  '`undefined` membuat penghapusan catatan terakhir tidak pernah sampai ke server')

// §6 — enam jalur pengganti baris. Dihitung, bukan ditanya "ada?": satu jalur
// yang terlewat persis bentuk kegagalan L69.
const lepas = (clientSrc.match(/setMutasi\(\[\]\)/g) ?? []).length
cek('Enam jalur pengganti baris melepas catatannya', lepas === 8,
  `${lepas} — Buat Pergeseran, ganti periode, ganti tahun, Salin Versi, Sinkron DPA, Tutup, Pulihkan, Muat Berkas`)
cek('Baris dihapus menyeret catatannya, di satu pintu',
  /const ubahRows = useCallback[\s\S]{0,400}buangMutasiYatim\(next, prev\)/.test(clientSrc),
  'semua jalur hapus lewat onChange')
cek('…tanpa melahirkan larik baru tiap ketikan',
  /return sisa\.length === prev\.length \? prev : sisa/.test(clientSrc),
  'identitas yang berganti membuat seluruh memo tabel dihitung ulang (L81)')

const modalSrc = kode(baca('components/blud/CatatanPerpindahanModal.tsx'))
cek('Modal berhenti di form — tidak menembak API sama sekili',
  !/fetch\(/.test(modalSrc),
  'yang menulis tetap tombol Simpan di halaman')
cek('Pilihan Dari/Ke hanya baris DAUN di dokumen ini',
  /filter\(r => !punyaAnak\.has\(r\.row_id\)\)/.test(modalSrc))
cek('Tombol Terapkan tidak dimatikan saat belum cocok',
  !/disabled=\{!beres\}/.test(modalSrc),
  'mematikannya mengurung isian yang sudah diketik')

const cssSrc = baca('app/globals.css')
cek('Kelas barunya berpasangan tema terang (L82)',
  /\[data-theme="light"\] \.pg-catat \{/.test(cssSrc)
  && /\[data-theme="light"\] \.pg-catat-atas/.test(cssSrc)
  && /\[data-theme="light"\] \.cp-strip\.bad/.test(cssSrc)
  && /\[data-theme="light"\] table tbody td \.pg-dari-catatan\.plus/.test(cssSrc))
cek('Spanduk baris tetap terlihat saat tabel digulir mendatar',
  /\.dpa-table\.v2 tbody tr\.pg-catat-row > td > \.pg-catat \{ position: sticky/.test(cssSrc),
  'sel ber-colSpan itu td:first-child juga, yang sudah dipasangi position: relative')

console.log(`\n${lulus} pemeriksaan LULUS · ${gagal} GAGAL`)
process.exit(gagal > 0 ? 1 : 0)
