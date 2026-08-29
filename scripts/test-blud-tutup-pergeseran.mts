// scripts/test-blud-tutup-pergeseran.mts
// Penjaga regresi "Tutup Pergeseran" — 2026-08-29.
// Konsep: docs/CONCEPT-blud-tutup-pergeseran.md
//
// Yang dijaga, urut dari yang paling mahal kalau rusak:
//
//   A. Kolom P → kiri, dan kolom P TIDAK tersentuh. Kalau ini meleset, pagu
//      realisasi ikut bergerak — kerusakan uang, bukan kerusakan tampilan.
//   B. Sasaran basis: bulan berikutnya kalau sudah lewat, hari ini kalau belum.
//   C. Dua pagar sasaran — menimpa versi yang ditutup, menimpa versi lain.
//   D. Pembanding sinkron: nol perubahan lewat tanpa gangguan, ada perubahan
//      dilaporkan lengkap dengan nominalnya.
//   E. Penomoran putaran dihitung, tidak disimpan.
//   F. Skenario utuh Januari → Februari dengan angka dari konsep §1.
//   G. Rantai kode: jejak penutupan sampai ke DB dan dibersihkan di SEMUA jalur
//      yang mengganti isi tabel (L69 — perbaikan yang cuma kena sebagian jalur).
//
// Jalankan: npx tsx scripts/test-blud-tutup-pergeseran.mts

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  tutupPergeseranRows, periodeSetelahTutup, alasanTolakTutup,
  nomorPutaran, labelTutup, totalPaguAkar, type TutupPergeseran,
} from '../lib/blud/tutup-pergeseran'
import { bedaSinkron, sinkronMengubahAngka } from '../lib/blud/sinkron-dpa'
import { recalcPergeseranJumlah } from '../lib/blud/recalc'
import { sasaranSimpan } from '../lib/blud/tanggal'
import type { PergeseranBarisInput } from '../types'

const AKAR = join(import.meta.dirname, '..')
const baca = (p: string) => readFileSync(join(AKAR, p), 'utf8')

/** Komentar dibuang sebelum diperiksa — prosa yang mengutip pola lama tidak boleh menyalakan tesnya sendiri. */
function kode(isi: string): string {
  return isi
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
}

const PGS   = 'app/(dashboard)/blud/pergeseran/pergeseran-client.tsx'
const LIB   = 'lib/blud/tutup-pergeseran.ts'
const DATA  = 'lib/blud/data.ts'
const TDATA = 'lib/blud/tutup-data.ts'
const SKEMA = 'lib/blud/schemas.ts'
const RUTE  = 'app/api/blud/pergeseran/route.ts'
const INJ   = 'app/api/blud/pergeseran/inject/route.ts'
const DPA   = 'app/(dashboard)/blud/dpa/dpa-client.tsx'
const DROP  = 'components/blud/VersiDropdown.tsx'

let lulus = 0
let gagal = 0
function cek(nama: string, syarat: boolean, catatan = '') {
  if (syarat) { lulus++; console.log(`  ok    ${nama.padEnd(60)} ${catatan}`) }
  else        { gagal++; console.log(`  GAGAL ${nama.padEnd(60)} ${catatan}`) }
}
function bab(j: string) { console.log(`\n── ${j} ──`) }

const AGU_29 = Date.parse('2026-08-29T05:00:00Z')   // 12:00 WIB
const FEB_01 = Date.parse('2027-02-01T05:00:00Z')
const JAN_20 = Date.parse('2027-01-20T05:00:00Z')

/**
 * Pohon contoh konsep §1: satu akar + tiga rekening.
 * DPA murni A 100 · B 50 · C 30; Januari menggeser 20 dari A ke B.
 */
function pohonJanuari(): PergeseranBarisInput[] {
  const daun = (id: string, kode: string, jml: number, p: number): PergeseranBarisInput => ({
    kode_rekening: kode, uraian: `Rekening ${kode}`, vol: 1, satuan: 'keg', harga: jml,
    jumlah: jml, vol_p: 1, harga_p: p, pergeseran: p, bertambah_berkurang: p - jml,
    penanggung_jawab: 'Kasubbag Umum', keterangan: '', tipe_baris: 'CHILD',
    row_id: id, anggaran_key: `AK-${id}`, parent_id: 'r0', urutan: 0,
  })
  const akar: PergeseranBarisInput = {
    kode_rekening: '5', uraian: 'BELANJA', vol: null, satuan: null, harga: null,
    jumlah: 180_000_000, vol_p: null, harga_p: null, pergeseran: 180_000_000,
    bertambah_berkurang: 0, penanggung_jawab: '', keterangan: '', tipe_baris: 'GRANDMASTER',
    row_id: 'r0', anggaran_key: 'AK-r0', parent_id: null, urutan: 0,
  }
  return [
    akar,
    daun('rA', '5.1.1', 100_000_000, 80_000_000),
    daun('rB', '5.1.2',  50_000_000, 70_000_000),
    daun('rC', '5.2.1',  30_000_000, 30_000_000),
  ]
}

bab('A. Kolom P → kiri, kolom P tidak tersentuh')
{
  const sebelum = pohonJanuari()
  const sesudah = tutupPergeseranRows(sebelum)
  const cari = (id: string) => sesudah.find(r => r.row_id === id)!

  cek('Kolom kiri jadi hasil pergeseran',
    cari('rA').jumlah === 80_000_000 && cari('rB').jumlah === 70_000_000 && cari('rC').jumlah === 30_000_000)
  cek('vol & harga ikut kolom P',
    cari('rA').harga === 80_000_000 && cari('rA').vol === 1)
  cek('Kolom pergeseran TIDAK berubah',
    cari('rA').pergeseran === 80_000_000 && cari('rB').pergeseran === 70_000_000,
    'di sinilah pagu realisasi dibaca')
  cek('Selisih jadi nol di semua baris',
    sesudah.every(r => r.bertambah_berkurang === 0))
  cek('Induk ikut benar', cari('r0').jumlah === 180_000_000 && cari('r0').pergeseran === 180_000_000)
  cek('Total pagu akar tidak bergerak',
    totalPaguAkar(recalcPergeseranJumlah(sebelum)) === totalPaguAkar(sesudah),
    `${totalPaguAkar(sesudah).toLocaleString('id-ID')}`)

  cek('Jangkar realisasi utuh',
    sesudah.every(r => r.anggaran_key === `AK-${r.row_id}`),
    'lepas satu saja = rekening itu ditolak saat input realisasi')
  cek('Susunan pohon utuh',
    sesudah.every((r, i) => r.row_id === sebelum[i].row_id && r.parent_id === sebelum[i].parent_id))
  cek('Kolom cermin DPA ikut terbawa',
    cari('rA').penanggung_jawab === 'Kasubbag Umum' && cari('rA').satuan === 'keg')
  cek('Baris asal tidak ikut berubah', sebelum.find(r => r.row_id === 'rA')!.jumlah === 100_000_000,
    'fungsi murni — layar boleh membatalkan dengan membuang hasilnya')

  // Recalc DULU baru disalin: kalau dibalik, induk yang angkanya sempat tidak
  // sinkron dapat `jumlah` dari nilai lama sementara `pergeseran`-nya dihitung
  // ulang ke nilai baru — selisihnya bukan nol dan Simpan ditolak tanpa sebab.
  const miring = pohonJanuari()
  miring[0] = { ...miring[0], pergeseran: 999, jumlah: 999 }
  const rapi = tutupPergeseranRows(miring)
  cek('Induk yang angkanya melenceng ikut dibetulkan',
    rapi[0].pergeseran === 180_000_000 && rapi[0].jumlah === 180_000_000 && rapi[0].bertambah_berkurang === 0,
    'recalc dulu, baru disalin')
}

bab('B. Sasaran basis')
{
  cek('Arsip Januari ditutup di Agustus → arsip Februari',
    periodeSetelahTutup('2026-01-31', AGU_29) === '2026-02-28',
    periodeSetelahTutup('2026-01-31', AGU_29))
  cek('Arsip Juli ditutup di Agustus → bulan berjalan',
    periodeSetelahTutup('2026-07-31', AGU_29) === '',
    'Agustus belum lewat, jadi belum punya tanggal kanonik')
  cek('Revisi harian → bulan berjalan',
    periodeSetelahTutup('2027-01-20', FEB_01) === '')
  cek('Desember tidak menebak tahun berikutnya',
    periodeSetelahTutup('2026-12-31', AGU_29) === '',
    'basis lintas tahun anggaran itu pertanyaan lain')

  cek('Basis historis tidak melompati versi berlaku',
    sasaranSimpan(periodeSetelahTutup('2026-01-31', AGU_29), AGU_29) < '2026-08-29',
    'inilah yang menjaga versi Agustus saat mengisi mundur')
  cek('Kasus normal mendarat di hari ini',
    sasaranSimpan(periodeSetelahTutup('2027-01-20', FEB_01), FEB_01) === '2027-02-01')
}

bab('C. Dua pagar sasaran')
{
  const dipakai = ['2026-01-31', '2026-08-29']

  cek('Menimpa versi yang ditutup → ditolak',
    alasanTolakTutup('2026-01-31', '2026-01-31', dipakai) !== '')
  cek('Alasannya menyebut jalan keluarnya',
    /Pilih periode setelah/.test(alasanTolakTutup('2026-01-31', '2026-01-31', dipakai)))
  cek('Mundur ke sebelum versi yang ditutup → ditolak',
    alasanTolakTutup('2026-01-15', '2026-01-31', dipakai) !== '')
  cek('Menimpa versi lain yang sudah ada → ditolak',
    alasanTolakTutup('2026-08-29', '2026-01-31', dipakai) !== '',
    'ini yang menyelamatkan versi Agustus')
  cek('Sasaran kosong yang sesudahnya → lolos',
    alasanTolakTutup('2026-02-28', '2026-01-31', dipakai) === '')
  cek('Tanpa versi terbuka → ditolak',
    alasanTolakTutup('2026-02-28', '', dipakai) !== '')

  // Kasus tutup 20 Jan 2027 pada versi bertanggal hari itu juga: sasaran jatuh
  // ke hari ini, jadi sama dengan versi yang ditutup — harus tertolak.
  const sasaranHariIni = sasaranSimpan(periodeSetelahTutup('2027-01-20', JAN_20), JAN_20)
  cek('Tutup di hari yang sama dengan simpanannya → ditolak',
    sasaranHariIni === '2027-01-20' && alasanTolakTutup(sasaranHariIni, '2027-01-20', ['2027-01-20']) !== '',
    'tutup besok, atau dokumen putaran ini hilang')
}

bab('D. Pembanding Sinkronkan DPA')
{
  const kini = tutupPergeseranRows(pohonJanuari())

  cek('Tidak ada perubahan → tidak mengganggu siapa pun',
    !sinkronMengubahAngka(bedaSinkron(kini, kini.map(r => ({ ...r })))),
    'DPA sudah direvisi mengikuti basis = jalan tanpa dialog')

  // Urutan diacak: inject menyusun ulang barisnya mengikuti urutan DPA.
  const teracak = [...kini].reverse().map(r => ({ ...r }))
  cek('Dicocokkan lewat row_id, bukan urutan',
    !sinkronMengubahAngka(bedaSinkron(kini, teracak)),
    'membandingkan indeks akan melaporkan seluruh tabel berubah')

  // DPA masih murni: sinkron menarik kolom P balik ke 100/50/30.
  const murni = kini.map(r => r.row_id === 'rA' ? { ...r, jumlah: 100_000_000, pergeseran: 100_000_000 }
    : r.row_id === 'rB' ? { ...r, jumlah: 50_000_000, pergeseran: 50_000_000 } : { ...r })
  const beda = bedaSinkron(kini, murni)
  cek('Perubahan nominal terdeteksi', beda.baris.length === 2,
    beda.baris.map(b => b.kode_rekening).join(','))
  cek('Yang paling besar nominalnya di atas',
    Math.abs(beda.baris[0].pergeseranBaru - beda.baris[0].pergeseranLama) >= 20_000_000)
  cek('Angka sebelum & sesudah keduanya dilaporkan',
    beda.baris.some(b => b.pergeseranLama === 80_000_000 && b.pergeseranBaru === 100_000_000))
  cek('Perubahan uraian saja TIDAK dilaporkan',
    bedaSinkron(kini, kini.map(r => ({ ...r, uraian: 'Nama baru' }))).baris.length === 0,
    'itu tujuan tombolnya — melaporkannya menenggelamkan yang berbahaya')

  const tambah = [...kini.map(r => ({ ...r })), { ...kini[1], row_id: 'rD', anggaran_key: null }]
  cek('Baris baru dari DPA dihitung', bedaSinkron(kini, tambah).barisBaru === 1)
  cek('Baris hilang dihitung', bedaSinkron(kini, kini.slice(0, 3).map(r => ({ ...r }))).barisHilang === 1)

  const naik = kini.map(r => r.row_id === 'rA' ? { ...r, pergeseran: 90_000_000 } : { ...r })
  cek('Pagu akar yang ikut bergeser terhitung',
    Math.abs(bedaSinkron(kini, naik).deltaPagu) === 0,
    'akar tidak ikut naik karena hanya daun yang diubah — delta akar tetap 0')
}

bab('E. Nomor putaran dihitung, tidak disimpan')
{
  const daftar: TutupPergeseran[] = [
    { versi_ditutup: '2027-01-20', versi_basis: '2027-01-21', ditutup_pada: '2027-01-21 09:00:00', ditutup_oleh: 'admin' },
    { versi_ditutup: '2027-02-25', versi_basis: '2027-03-01', ditutup_pada: '2027-03-01 08:10:00', ditutup_oleh: 'admin' },
  ]
  cek('Putaran pertama', nomorPutaran(daftar, '2027-01-20') === 1)
  cek('Putaran kedua', nomorPutaran(daftar, '2027-02-25') === 2)
  cek('Urutan tidak bergantung urutan larik',
    nomorPutaran([...daftar].reverse(), '2027-01-20') === 1)
  cek('Versi yang belum ditutup → 0', nomorPutaran(daftar, '2027-05-05') === 0)
  cek('Label menyebut nomor & tanggal basis',
    /ke-2/.test(labelTutup(daftar, '2027-02-25')) && /Mar/.test(labelTutup(daftar, '2027-02-25')),
    labelTutup(daftar, '2027-02-25'))
}

bab('F. Skenario utuh Januari → Februari (konsep §1)')
{
  const januari = pohonJanuari()
  const basis   = tutupPergeseranRows(januari)

  // Februari menggeser 10 juta dari C ke A, di ATAS basis.
  const februari = recalcPergeseranJumlah(basis.map(r =>
    r.row_id === 'rA' ? { ...r, harga_p: 90_000_000 }
      : r.row_id === 'rC' ? { ...r, harga_p: 20_000_000 } : { ...r }))

  const cari = (rows: PergeseranBarisInput[], id: string) => rows.find(r => r.row_id === id)!
  cek('Selisih Februari murni geseran Februari',
    cari(februari, 'rA').bertambah_berkurang === 10_000_000
    && cari(februari, 'rC').bertambah_berkurang === -10_000_000
    && cari(februari, 'rB').bertambah_berkurang === 0,
    '+10 / 0 / −10')
  cek('Februari tetap berimbang', cari(februari, 'r0').bertambah_berkurang === 0)

  // Tanpa penutupan, kolom kiri masih DPA murni dan selisihnya campuran.
  const tanpaTutup = recalcPergeseranJumlah(januari.map(r =>
    r.row_id === 'rA' ? { ...r, harga_p: 90_000_000 }
      : r.row_id === 'rC' ? { ...r, harga_p: 20_000_000 } : { ...r }))
  cek('Tanpa penutupan selisihnya campuran Januari+Februari',
    cari(tanpaTutup, 'rA').bertambah_berkurang === -10_000_000
    && cari(tanpaTutup, 'rB').bertambah_berkurang === 20_000_000,
    '−10 / +20 / −10 — inilah yang fitur ini perbaiki')
  cek('Pagu keduanya sama persis',
    totalPaguAkar(februari) === totalPaguAkar(tanpaTutup),
    'yang salah dokumennya, bukan angkanya')
}

bab('G. Rantai kode')
{
  const kPgs = kode(baca(PGS))
  const kLib = kode(baca(LIB))
  const kDat = kode(baca(DATA))
  const kTdt = kode(baca(TDATA))
  const kSkm = kode(baca(SKEMA))
  const kRt  = kode(baca(RUTE))
  const kInj = kode(baca(INJ))

  cek('Zod menerima asal_tutup', /asal_tutup:\s*AsalTutupSchema\.optional\(\)/.test(kSkm))
  cek('Pagar #1 hidup di Zod', /asal_tutup && d\.asal_tutup\.versi_ditutup >= d\.versi_tanggal/.test(kSkm))
  cek('Route meneruskan asal_tutup ke savePergeseran', /asal_tutup \?\? null/.test(kRt))
  // Syaratnya dikutip UTUH sampai kurung buka. Versi longgar (`/asalTutup &&
  // existing > 0/`) tetap lolos kalau seseorang menambahkan `false &&` di
  // depannya — dan uji mutasi memang membuktikannya lolos.
  cek('Pagar #2 hidup di dalam transaksi',
    /\n\s*if \(asalTutup && existing > 0\) \{/.test(kDat) && /throw new BludSasaranTutupTerpakaiError\(/.test(kDat))
  cek('Pagar #2 tidak bisa ditembus force',
    !/force[^\n]*asalTutup|asalTutup[^\n]*!force/.test(kDat),
    'force menyatakan "baris menyusut", bukan "dokumen lain boleh hilang"')
  cek('Penutupan dicatat di transaksi yang sama', /catatTutupPergeseran\(tx,/.test(kDat))
  cek('Penutupan ganda ditolak PRIMARY KEY, bukan SELECT dulu',
    /ER_DUP_ENTRY/.test(kTdt) && !/SELECT[^\n]*FOR UPDATE/.test(kTdt),
    'mengunci baris yang belum ada tidak mengunci apa pun (L69-a)')
  // Diperiksa pada DAFTAR KOLOM-nya, bukan pada seluruh berkas: kata "putaran"
  // sah muncul di kalimat galat ("satu putaran hanya bisa ditutup sekali"), dan
  // pemeriksaan yang menyalak karenanya cuma mengajari orang menghapus kalimat.
  const insertSql = /INSERT INTO blud_pergeseran_tutup[\s\S]*?VALUES/.exec(kTdt)?.[0] ?? ''
  const migrasi = baca('docs/migrations/migration-blud-pergeseran-tutup.sql').replace(/--.*$/gm, '')
  cek('Nomor putaran tidak pernah ditulis ke DB',
    insertSql !== '' && !/putaran/i.test(insertSql) && !/^\s*putaran\b/im.test(migrasi),
    'dihitung dari urutan versi_ditutup — menyimpannya = baca-lalu-tulis (L55)')

  cek('Sinkron mengambil DPA yang BERLAKU, bukan yang terbaru',
    /getDpaVersiBerlaku\(tahun_anggaran, versi_tanggal\)/.test(kInj) && !/getDpaLatestDate/.test(kInj))
  cek('Sinkron wajib menerima versi sasaran',
    /versi_tanggal:\s*TanggalSchema,/.test(kSkm) && /versi_tanggal:\s*sasaranSimpan\(periodeTulis\)/.test(kPgs))
  cek('Layar membandingkan dulu sebelum menerapkan',
    /sinkronMengubahAngka\(beda\)/.test(kPgs) && /setPratinjauSinkron/.test(kPgs))
  cek('Tombol sinkron tidak lagi dimatikan periode historis',
    !/disabled=\{injecting \|\| !rows\.length \|\| !!periodeTulis\}/.test(kPgs))

  cek('Tutup memindahkan sasaran lewat periode, bukan tanggal sendiri',
    /setPeriodeTulis\(konfirmTutup\.periode\)/.test(kPgs) && !/versi_tanggal:\s*['"`]\d{4}-/.test(kPgs),
    'satu rumus tanggal — L78')
  cek('Tutup tidak punya jalur tulis sendiri',
    !/fetch\([^)]*tutup/i.test(kPgs) && !/lib\/blud\/tutup-pergeseran[\s\S]{0,80}sql/.test(kLib))
  cek('Lib penutupan tidak menyentuh database', !/from '@\/lib\/data\/db'/.test(kLib))

  // L69 — jejak penutupan wajib dibersihkan di SETIAP jalur yang mengganti isi
  // tabel, bukan cuma yang paling jelas. Yang tertinggal akan mencoba menutup
  // versi yang barisnya sudah tidak ada di layar.
  const reset = (kPgs.match(/asalTutupRef\.current\s*=\s*null/g) ?? []).length
  cek('Jejak penutupan dibersihkan di semua jalur pengganti isi', reset >= 6,
    `${reset} tempat: muat versi · pulihkan · buat pergeseran · salin versi · ganti periode · simpan sukses`)
  cek('Jejak penutupan dipasang hanya oleh terapkanTutup',
    (kPgs.match(/asalTutupRef\.current\s*=\s*\{/g) ?? []).length === 1)
}

bab('H. Jalur HAPUS ikut membuang catatan penutupan')
{
  const kDat = kode(baca(DATA))
  const kTdt = kode(baca(TDATA))
  const kLib = kode(baca(LIB))
  const kPgs = kode(baca(PGS))
  const kRt  = kode(baca(RUTE))

  // Kejadian nyata 2026-08-29: versi basis 28 Feb dihapus & 31 Jan dibangun
  // ulang, catatannya tertinggal → daftar versi mengumumkan basis yang sudah
  // tidak ada, dan tombol Tutup abu-abu tanpa jalan keluar.
  const fn = /export async function hapusTutupTerkaitVersi[\s\S]*?\n}/.exec(kTdt)?.[0] ?? ''
  cek('Ada pembuang catatan penutupan', fn !== '')
  cek('KEDUA sisi dibuang',
    /versi_ditutup = \$\{versiTanggal\} OR versi_basis = \$\{versiTanggal\}/.test(fn),
    'basis dihapus = penutupan tak berbekas · yang ditutup dihapus = tanggal itu jadi dokumen baru')
  cek('Memulangkan jumlah lewat res[0], bukan res.affectedRows',
    /res\[0\]\?\.affectedRows/.test(fn), 'hasil `tx` itu array (L53/T15)')

  // Jendelanya berhenti di `export` berikutnya, BUKAN di `\n}` pertama: tipe
  // kembaliannya `Promise<{ … }>` menaruh sebuah `}` di kolom 0, jadi pola itu
  // memotong tepat sesudah tanda tangan dan memeriksa fungsi yang kosong —
  // pemeriksaan yang selalu "gagal" tanpa ada yang salah pada kodenya.
  const del = /export async function deletePergeseranVersi[\s\S]*?\nexport /.exec(kDat)?.[0] ?? ''
  cek('deletePergeseranVersi memanggilnya', /hapusTutupTerkaitVersi\(tx, tahun, versiTanggal\)/.test(del))
  cek('…DI DALAM transaksi yang sama',
    /withTransaction\([\s\S]*hapusTutupTerkaitVersi[\s\S]*\}\)/.test(del),
    'kalau di luar, barisnya hilang walau penghapusannya dibatalkan')
  cek('Jumlahnya dipulangkan ke pemanggil', /tutup_dibuang/.test(del) && /tutup_dibuang/.test(kRt))

  // L69 — jalur KOSONG+FORCE mengosongkan versi, dan versi tanpa baris lenyap
  // dari `getPergeseranHistory`. Akibatnya sama dengan menghapus.
  // Dipotong dari `savePergeseran` DULU: `saveDpa` punya cabang `if (!incoming)`
  // yang bentuknya kembar dan letaknya lebih awal di berkas, jadi pola tanpa
  // jangkar ini memeriksa fungsi yang salah — dan `saveDpa` memang tidak boleh
  // memanggilnya (penutupan cuma ada di Pergeseran).
  const sp = kDat.slice(kDat.indexOf('export async function savePergeseran'))
  const kosong = /if \(!incoming\) \{[\s\S]*?const jangkar: Record/.exec(sp)?.[0] ?? ''
  cek('Jalur kosong+force ikut membuangnya',
    /hapusTutupTerkaitVersi\(tx, tahun, versiTanggal\)/.test(kosong),
    'pagar yang cuma di jalur utama persis kegagalan L69')
  cek('Dua tempat memanggilnya di data.ts',
    (kDat.match(/hapusTutupTerkaitVersi\(tx,/g) ?? []).length === 2)

  cek('Penolakan sasaran-dihuni tidak menyuruh "pilih periode lain"',
    !/pilih periode lain/i.test(kLib),
    'sasaran penutupan diturunkan, bukan dipilih — menawarkan tombol yang tidak ada')
  cek('…dan menyebut tindakan yang memang bisa dilakukan',
    /hapus dulu versi/i.test(kLib))

  cek('Baris baru dari DPA ikut disebut di pesan sinkron',
    /beda\.barisBaru > 0[\s\S]{0,160}rekening baru ditambahkan/.test(kPgs),
    '"tidak ada angka yang berubah" sambil menyisipkan rekening itu tidak benar')
  cek('Peringatan kecocokan longgar tidak hilang di jalur Terapkan',
    /pratinjauSinkron\.dpaVersi, pratinjauSinkron\.low\)/.test(kPgs),
    'sempat dioper larik kosong — justru jalur ini yang mengubah angka')
}

// ─────────────────────────────────────────────────────────────────────────────
bab('I. Pil versi berhenti mengaku mewakili versi tersimpan')
// Dilaporkan pemakai: sesudah menutup 31 Jan, tabel di layar berubah (kolom P
// disalin ke kiri) sementara pil versi tetap berbunyi "31 JAN 2026 · 558 baris".
// Kesimpulannya wajar — arsip Januari ikut tertimpa — padahal DB utuh. Yang
// berbohong tampilannya, bukan datanya, jadi yang diperbaiki juga tampilannya.
{
  const kPgs = kode(baca(PGS))
  const kDpa = kode(baca(DPA))
  const kDrp = kode(baca(DROP))

  cek('Penutupan menandai layar belum tersimpan',
    /setRows\(tutupPergeseranRows\(rows\)\)[\s\S]{0,600}setBelumTersimpan\(true\)/.test(kPgs),
    'penanda pil menumpang bendera ini — tanpa itu tidak ada yang menyalakannya')

  cek('Pil punya penanda belum-tersimpan', /versi-draft/.test(kDrp))
  cek('…yang dikunci ke prop `belumTersimpan`',
    /\{selected && belumTersimpan && \(/.test(kDrp),
    'harus ikut `selected` juga: placeholder tidak mengaku apa-apa')
  cek('…dan bukan turunan dari `value` kosong',
    !/!value[\s\S]{0,40}versi-draft/.test(kDrp),
    'sesudah Pulihkan `versi` terisi padahal isinya belum tersimpan (L79b)')

  cek('BERLAKU tetap berdampingan, tidak disembunyikan',
    /versi-draft[\s\S]{0,600}versi-badge-latest--trigger/.test(kDrp),
    'fakta tentang versi tersimpan; menghapusnya menyesatkan ke arah lain')

  cek('Layar Pergeseran mengoper benderanya', /belumTersimpan=\{belumTersimpan\}/.test(kPgs))
  cek('Layar DPA ikut mengoper',
    /belumTersimpan=\{belumTersimpan\}/.test(kDpa),
    'kebohongan yang sama hidup di dua layar — L69')

  cek('Tooltipnya pakai standar `data-tooltip`, bukan native `title`',
    /className="versi-draft" data-tooltip=/.test(kDrp) && !/ title="/.test(kDrp),
    'native title = kotak putih browser; DESIGN-SYSTEM cuma mengizinkan satu standar')

  const css = baca('app/globals.css')
  cek('Penanda punya pasangan tema terang',
    /\[data-theme="light"\] \.versi-draft/.test(css),
    'kotak berwarna sebaris tidak ikut ditimpa tema terang — pola .tp-galat')
  cek('Jumlah baris dilepas di lebar ponsel',
    /@media \(max-width: 520px\) \{[\s\S]{0,160}\.versi-trigger \.versi-meta/.test(css),
    'diukur: lencana menambah 96px, tepi pil mendarat di 399px pada viewport 375px')
}

console.log(`\n${lulus} pemeriksaan LULUS · ${gagal} GAGAL`)
process.exit(gagal > 0 ? 1 : 0)
