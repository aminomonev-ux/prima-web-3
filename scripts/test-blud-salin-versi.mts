// scripts/test-blud-salin-versi.mts
// Penjaga regresi "Salin dari Versi Lain" — Tahap 3, 2026-08-28.
//
// Fitur ini mengembalikan kebutuhan yang ikut hilang saat L79d menutup alur
// "buka arsip Juli lalu Simpan supaya jadi revisi hari ini": memulai versi baru
// dari angka versi lain. Yang dijaga di sini adalah SATU janji, dan hampir semua
// pemeriksaan di bawah adalah janji itu dilihat dari sudut berbeda:
//
//     menyalin mengganti ISI layar, TIDAK PERNAH sasaran Simpan.
//
// Kalau salinan ikut memindahkan sasaran, kita menghidupkan lagi bentuk L78 —
// modal yang menulis ke tempat lain daripada yang ditunjuk toolbar — dan itu
// sudah pernah menimpa versi bulan berjalan yang berisi 558 baris.
//
//   A. Sasaran Simpan satu rumus, dan salinan tidak menyentuhnya.
//   B. Jangkar realisasi UTUH (kebalikan Salin Tahun yang melepasnya).
//   C. Sumber tidak boleh sama dengan yang dibuka maupun dengan sasaran.
//   D. Pagar acuan DPA (khusus Pergeseran) dibunyikan sebelum Simpan.
//   E. Baris audit membedakan lingkup salinan.
//   F. Murni pembacaan, dan jejak asalnya tidak berbohong.
//
// Jalankan: npx tsx scripts/test-blud-salin-versi.mts

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  sumberSalinTersedia, alasanKunciSalinVersi, alasanDpaAcuanTerlaluBaru,
  labelVersiSumber, petakanDpaRows, petakanPergeseranRows,
  totalAkarDpa, totalAkarPergeseran,
} from '../lib/blud/salin-versi'
import { sasaranSimpan } from '../lib/blud/tanggal'
import { dpaKeTahunBaruInput } from '../lib/blud/row-map'
import type { DpaBaris, PergeseranBaris } from '../types'

const AKAR = join(import.meta.dirname, '..')
const baca = (p: string) => readFileSync(join(AKAR, p), 'utf8')

/**
 * Komentar dibuang SEBELUM diperiksa. Berkas-berkas ini menjelaskan bug lama di
 * dalam prosanya; tanpa ini, paragraf yang mengutip pola terlarang menyalakan
 * tesnya sendiri — dan paragraf yang panjang menggeser kode keluar dari jendela.
 */
function kode(isi: string): string {
  return isi
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
}

const DPA    = 'app/(dashboard)/blud/dpa/dpa-client.tsx'
const PGS    = 'app/(dashboard)/blud/pergeseran/pergeseran-client.tsx'
const MODAL  = 'components/blud/SalinVersiModal.tsx'
const TAHUN  = 'components/blud/SalinTahunModal.tsx'
const LIB    = 'lib/blud/salin-versi.ts'
const SKEMA  = 'lib/blud/schemas.ts'
const RT_DPA = 'app/api/blud/dpa/route.ts'
const RT_PGS = 'app/api/blud/pergeseran/route.ts'

let lulus = 0
let gagal = 0
function cek(nama: string, syarat: boolean, catatan = '') {
  if (syarat) { lulus++; console.log(`  ok   ${nama.padEnd(62)} ${catatan}`) }
  else        { gagal++; console.log(`  GAGAL ${nama.padEnd(62)} ${catatan}`) }
}
function bab(judul: string) { console.log(`\n── ${judul} ──`) }

/** Potong badan sebuah fungsi supaya pemeriksaan tidak salah alamat ke fungsi lain. */
function badan(sumber: string, tanda: string, panjang = 1200): string {
  const i = sumber.indexOf(tanda)
  return i === -1 ? '' : sumber.slice(i, i + panjang)
}

const dpaBaris = (o: Partial<DpaBaris> & { row_id: string }): DpaBaris => ({
  id: 1, versi_tanggal: '2026-07-31', kode_rekening: '5.1.01', uraian: 'Beras',
  vol: 2, satuan: 'kg', harga: 5000, jumlah: 10_000,
  penanggung_jawab: null, keterangan: null, tipe_baris: 'CHILD',
  anggaran_key: 'AK-1', parent_id: null, urutan: 0,
  origin: 'MANUAL', usulan_item_id: null, usulan_no: null,
  ...o,
})

const pgsBaris = (o: Partial<PergeseranBaris> & { row_id: string }): PergeseranBaris => ({
  id: 1, versi_tanggal: '2026-07-31', dpa_versi_tanggal: '2026-07-31',
  kode_rekening: '5.1.01', uraian: 'Beras',
  vol: 2, satuan: 'kg', harga: 5000, jumlah: 10_000,
  vol_p: 3, harga_p: 5000, pergeseran: 15_000, bertambah_berkurang: 5_000,
  bertambah: null, berkurang: null,
  penanggung_jawab: null, keterangan: null, tipe_baris: 'CHILD',
  anggaran_key: 'AK-1', parent_id: null, urutan: 0,
  ...o,
})

bab('A. Sasaran Simpan — satu rumus, dan salinan tidak menyentuhnya')
{
  // Rumusnya dulu hidup langsung di dalam `simpan()` di dua layar. Itu cukup
  // selama tidak ada yang perlu MENAMPILKANNYA; modal ini menjanjikan "sasaran
  // tidak berubah", dan janji itu hanya benar kalau yang ditampilkan dan yang
  // ditulis lahir dari rumus yang sama.
  cek('Periode kosong → hari ini', sasaranSimpan('', Date.UTC(2026, 7, 28, 5)) === '2026-08-28')
  cek('Periode terpilih → periode itu', sasaranSimpan('2026-06-30') === '2026-06-30')

  const dpa = kode(baca(DPA))
  const pgs = kode(baca(PGS))
  for (const [nama, isi] of [['DPA', dpa], ['Pergeseran', pgs]] as const) {
    cek(`Simpan ${nama} memakai sasaranSimpan()`, isi.includes('doSimpanInternal(sasaranSimpan(periodeTulis))'))
    cek(`Rumus sasaran ${nama} tidak digandakan`, !/periodeTulis \|\| tanggalHariIniWIB\(\)/.test(isi),
      'dua salinan rumus yang sama = cara L78 lahir')
    cek(`Modal ${nama} menerima sasaran, bukan menghitungnya`,
      /sasaran=\{sasaran\}/.test(isi))
  }

  // INTI FITUR. `setVersi`/`setPeriodeTulis`/`setVersion` yang tidak ada di sini
  // bukan kelalaian — itu seluruh rancangannya.
  for (const [nama, isi] of [['DPA', dpa], ['Pergeseran', pgs]] as const) {
    const blok = badan(isi, 'function terapkanSalinVersi', 900)
    cek(`terapkanSalinVersi ${nama} ada`, blok.length > 0)
    cek(`terapkanSalinVersi ${nama} tidak memindahkan versi yang dibuka`, !blok.includes('setVersi('))
    cek(`terapkanSalinVersi ${nama} tidak memindahkan periode tulis`, !blok.includes('setPeriodeTulis('))
    cek(`terapkanSalinVersi ${nama} tidak menyentuh angka kunci`, !blok.includes('setVersion('))
    cek(`terapkanSalinVersi ${nama} menandai belum tersimpan`, blok.includes('setBelumTersimpan(true)'))
  }

  // Khas Pergeseran: barisnya membawa salinan kolom DPA-nya sendiri, jadi label
  // acuannya WAJIB ikut pindah. Kalau tidak, tabelnya memuat angka DPA versi
  // sumber sambil mengaku mengacu DPA lain.
  cek('Salinan Pergeseran memindahkan acuan DPA-nya',
    badan(pgs, 'function terapkanSalinVersi', 900).includes('setDpaVersi(dpaVersiSumber)'))
}

bab('B. Jangkar realisasi UTUH — kebalikan Salin Tahun')
{
  const asal = [dpaBaris({ row_id: 'r1', anggaran_key: 'AK-9', origin: 'USULAN', usulan_item_id: 77 })]
  const [salinan] = petakanDpaRows(asal)
  cek('anggaran_key ikut terbawa', salinan.anggaran_key === 'AK-9', 'tahun sama = baris yang sama')
  cek('row_id apa adanya', salinan.row_id === 'r1', 'mengarang id memutus parent_id anaknya')
  cek('Jejak usulan ikut terbawa', salinan.origin === 'USULAN' && salinan.usulan_item_id === 77)

  // Pembandingnya sengaja dijalankan di sini: kalau suatu hari keduanya jadi
  // sama, salah satu dari dua fitur ini sedang rusak.
  const [lintasTahun] = [dpaKeTahunBaruInput(asal[0], 0)]
  cek('Salin Tahun tetap MELEPAS jangkar', lintasTahun.anggaran_key === null)
  cek('Salin Tahun tetap melepas jejak usulan',
    lintasTahun.origin === 'MANUAL' && lintasTahun.usulan_item_id === null)

  const [pgsSalinan] = petakanPergeseranRows([pgsBaris({ row_id: 'p1', anggaran_key: 'AK-3' })])
  cek('Pergeseran: anggaran_key ikut terbawa', pgsSalinan.anggaran_key === 'AK-3')
  cek('Pergeseran: pasangan vol_p/harga_p utuh',
    pgsSalinan.vol_p === 3 && pgsSalinan.harga_p === 5000 && pgsSalinan.pergeseran === 15_000)

  // Tidak ada mapper KETIGA. Kolom yang lupa didaftar di mapper baru terbuang
  // senyap, dan `anggaran_key` justru kolom yang seluruh fitur ini menjaganya.
  const lib = kode(baca(LIB))
  cek('Memakai mapper yang sudah ada, bukan mapper baru',
    lib.includes('d.map(dpaKeInput)') && lib.includes('d.map(pergeseranKeInput)')
    && !/anggaran_key\s*:/.test(lib))
}

bab('C. Daftar sumber — tidak boleh menunjuk dirinya sendiri')
{
  const riwayat = [
    { versi_tanggal: '2026-06-30' },
    { versi_tanggal: '2026-07-31' },
    { versi_tanggal: '2026-08-28' },
  ]
  const hasil = sumberSalinTersedia(riwayat, ['2026-08-28', '2026-08-28'])
  cek('Versi yang sedang dibuka dibuang', !hasil.some(h => h.versi_tanggal === '2026-08-28'))
  cek('Terbaru di atas', hasil[0].versi_tanggal === '2026-07-31', hasil.map(h => h.versi_tanggal).join(' → '))

  // Dua pengecualian yang berbeda, dan keduanya perlu: sesudah "Form Baru" atau
  // ganti tahun, `versi` kosong sementara sasaran tetap hari ini — dan hari ini
  // bisa sudah punya versi tersimpan.
  const sasaranSaja = sumberSalinTersedia(riwayat, ['', '2026-08-28'])
  cek('Sasaran dibuang walau tidak ada versi yang dibuka',
    !sasaranSaja.some(h => h.versi_tanggal === '2026-08-28') && sasaranSaja.length === 2)

  cek('Nilai kosong tidak membuang apa pun', sumberSalinTersedia(riwayat, ['', '']).length === 3)

  cek('Tahun tanpa versi → tombol mati',
    alasanKunciSalinVersi(2027, [], ['', '2027-01-05']).includes('belum punya versi'))
  cek('Satu versi dan itu yang terbuka → tombol mati',
    alasanKunciSalinVersi(2026, [{ versi_tanggal: '2026-08-28' }], ['2026-08-28', '2026-08-28'])
      .includes('satu-satunya'))
  cek('Ada versi lain → tombol hidup',
    alasanKunciSalinVersi(2026, riwayat, ['2026-08-28', '2026-08-28']) === '')

  // Arsip periode dan revisi harian tinggal di kolom yang sama; hanya bentuk
  // tanggalnya yang membedakan, jadi labelnya yang harus menjelaskan.
  cek('Arsip periode diberi keterangan bulannya',
    labelVersiSumber('2026-07-31', Date.UTC(2026, 7, 28)).includes('arsip Juli 2026'))
  cek('Revisi harian tidak diberi keterangan arsip',
    !labelVersiSumber('2026-08-27', Date.UTC(2026, 7, 28)).includes('arsip'))
}

bab('D. Pagar acuan DPA — dibunyikan sebelum Simpan, bukan sesudah 400')
{
  cek('Acuan lebih baru dari sasaran → ditahan',
    alasanDpaAcuanTerlaluBaru('2026-08-28', '2026-06-30').includes('ditolak'))
  cek('Acuan sama dengan sasaran → aman', alasanDpaAcuanTerlaluBaru('2026-06-30', '2026-06-30') === '')
  cek('Acuan lebih lama dari sasaran → aman', alasanDpaAcuanTerlaluBaru('2026-06-30', '2026-08-28') === '')
  cek('Tanpa acuan (sumber DPA) → aman', alasanDpaAcuanTerlaluBaru(null, '2026-08-28') === '')

  // Diikat ke pagar aslinya. Kalau Zod-nya berubah, tes ini merah dan
  // mengingatkan bahwa layarnya wajib ikut — bukan diam sampai ada yang kena 400.
  const skema = kode(baca(SKEMA))
  cek('Pagar Zod-nya masih berbunyi sama',
    skema.includes('d.dpa_versi_tanggal > d.versi_tanggal'))
  cek('Tombol Salin mati selama peringatan menyala',
    kode(baca(MODAL)).includes('&& !peringatanDpa'))
}

bab('E. Baris audit membedakan lingkup salinan')
{
  const skema = kode(baca(SKEMA))
  cek('Skema `asal_salin` punya lingkup', /lingkup:\s*z\.enum\(\['TAHUN', 'VERSI'\]\)/.test(skema))
  cek('Bawaannya TAHUN untuk tab lama', /\.default\('TAHUN'\)/.test(skema))
  cek('Pergeseran ikut menerima asal_salin',
    /asal_salin:\s*AsalSalinSchema\.optional\(\)/.test(
      badan(skema, 'export const PergeseranBodySchema', 1600)))

  cek('SalinTahunModal menandai TAHUN', kode(baca(TAHUN)).includes("lingkup: 'TAHUN'"))
  cek('SalinVersiModal menandai VERSI', kode(baca(MODAL)).includes("lingkup: 'VERSI'"))

  // Yang dicatat bukan sekadar "dari mana", tapi apakah jangkarnya ikut — itu
  // satu-satunya beda yang tidak bisa disimpulkan dari jumlah baris.
  const rtDpa = kode(baca(RT_DPA))
  cek('Audit DPA menyebut nasib jangkar',
    rtDpa.includes('jangkar realisasi ikut terbawa') && rtDpa.includes('jangkar realisasi dilepas'))
  cek('Audit DPA bercabang pada lingkup', /asal_salin\.lingkup === 'VERSI'/.test(rtDpa))

  const rtPgs = kode(baca(RT_PGS))
  cek('Route Pergeseran membaca asal_salin', /\basal_salin\b/.test(badan(rtPgs, 'const { tahun_anggaran', 400)))
  cek('Audit Pergeseran mencatat salinannya', rtPgs.includes('salinan dari Pergeseran'))
}

bab('F. Murni pembacaan, jejak asal tidak berbohong')
{
  const modal = kode(baca(MODAL))
  cek('Modal tidak menulis apa pun', !/method:\s*'POST'/.test(modal))
  cek('Modal memakai endpoint baca yang sudah ada',
    modal.includes('`/api/blud/${jalur}?tahun=${tahun}&tanggal=${encodeURIComponent(v)}`'),
    'nol endpoint baru = nol pagar akses baru (L72)')
  cek('Balasan basi dibuang', modal.includes('generasiRef') && modal.includes('masihBerlaku()'))
  cek('Tidak memakai kotak bawaan peramban', !/window\.confirm|alert\(/.test(modal))

  // Penolongnya di ruang MODUL: kalau lahir baru tiap render, efek pemuat di
  // dalam modal menyala tiap render dan modalnya menembak server tanpa henti.
  const lib = kode(baca(LIB))
  cek('Penolong pemuat hidup di lib, bukan di berkas layar',
    lib.includes('export const petakanDpaRows') && lib.includes('export const petakanPergeseranRows'))
  for (const [nama, berkas] of [['DPA', DPA], ['Pergeseran', PGS]] as const) {
    cek(`Layar ${nama} tidak mendefinisikan ulang penolongnya`,
      !/const petakan\w+Rows\s*=/.test(kode(baca(berkas))))
  }

  // Total = baris AKAR saja; menjumlah semua baris menghitung uang yang sama
  // sekali per tingkat hierarki.
  const pohon = [
    { parent_id: null, jumlah: 30_000, pergeseran: 45_000 },
    { parent_id: 'akar', jumlah: 10_000, pergeseran: 15_000 },
    { parent_id: 'akar', jumlah: 20_000, pergeseran: 30_000 },
  ]
  cek('Total DPA hanya baris akar', totalAkarDpa(pohon) === 30_000)
  // Salah kolom di sini menampilkan angka yang memang ada di baris itu, jadi
  // tidak ada yang terlihat rusak — cuma jawabannya bukan pertanyaan yang diajukan.
  cek('Total Pergeseran memakai kolom pergeseran, bukan jumlah', totalAkarPergeseran(pohon) === 45_000)

  // L69: jejak asal WAJIB dilepas di SETIAP jalur yang mengganti baris lewat
  // cara lain. Satu jalur yang terlewat membuat baris audit berbohong.
  const pgs = kode(baca(PGS))
  const jalurGanti = ['loadPergeseran', 'pulihkanSimpanan', 'generate']
  for (const j of jalurGanti) {
    cek(`asalSalinRef dilepas di ${j}`,
      /asalSalinRef\.current\s*=\s*null/.test(badan(pgs, j.startsWith('load') || j === 'generate'
        ? `const ${j}` : `const ${j}`, 2600)))
  }
  cek('Pergeseran mengirim asal_salin saat Simpan',
    pgs.includes('asal_salin: asalSalinRef.current ?? undefined'))
}

console.log(`\n${lulus} pemeriksaan LULUS · ${gagal} GAGAL`)
process.exit(gagal > 0 ? 1 : 0)
