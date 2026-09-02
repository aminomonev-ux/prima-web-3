// scripts/test-blud-periode-terkunci.mts
// Penjaga regresi "periode terpilih tidak lenyap" — lanjutan L78b, 2026-08-28.
//
// Ceritanya: sesudah berhasil menyimpan ke Periode Juli, pemilih periode melompat
// balik ke "PERIODE BULAN BERJALAN". Bagi yang memakainya itu terlihat seperti
// tulisan Juli ditimpa Agustus — dan lebih buruk dari terlihat: koreksi kedua
// (yang memang wajib, karena hasil impor sering perlu dibetulkan) benar-benar
// mendarat di bulan berjalan.
//
// Akarnya sama dengan L78b, cuma lewat pintu yang lain: pemilih periode dan versi
// yang sedang dibuka boleh menunjuk tempat yang berbeda. Ada EMPAT pintu ke sana:
// memilih periode, membuka versi dari daftar, memulihkan snapshot, dan selesai
// menyimpan — dan tiga dari empat dulu tidak menyentuh `periodeTulis` sama sekali.
//
// Yang dijaga:
//   A. `periodeUntukVersi` — satu aturan untuk keempat pintu, diuji sungguhan
//      (fungsi murni). Termasuk yang paling mudah salah: revisi harian TIDAK
//      boleh mengunci periode, kalau tidak riwayat harian berhenti tumbuh.
//   B. Keempat pintu benar-benar memanggil aturan itu.
//   C. `belumTersimpan` — bendera "layar ≠ yang tersimpan" terpasang di semua
//      jalur yang mengisi form, dan dibersihkan di semua jalur yang memuat.
//   D. Tombol yang mengganti SELURUH tabel dikunci saat versi tersimpan terbuka.
//   E. 409 berhenti menuduh "orang lain" untuk versi milik sendiri.
//   F. Pengingat "belum tersimpan" menutup ketiga pintu keluar.
//   G. Bilah gulir pemilih periode tidak berkedip lagi.
//
// Jalankan: npx tsx scripts/test-blud-periode-terkunci.mts

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  periodeUntukVersi, tanggalPeriodeHistoris, labelPeriodeVersi,
  periodeHistorisTersedia, expectedVersionUntuk,
} from '../lib/blud/tanggal'
import { BludHistorisJadiPaguError } from '../lib/blud/data'

const AKAR = join(import.meta.dirname, '..')
const baca = (p: string) => readFileSync(join(AKAR, p), 'utf8')

/**
 * Buang komentar sebelum memeriksa "tidak boleh ada lagi" — kalau tidak, prosa
 * yang MENJELASKAN bug lama ikut tertangkap dan satu-satunya cara menghijaukan
 * tesnya adalah menghapus catatan yang paling berguna dibaca nanti.
 */
function kode(isi: string): string {
  return isi
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
}

const KLIEN_DPA = 'app/(dashboard)/blud/dpa/dpa-client.tsx'
const KLIEN_PGS = 'app/(dashboard)/blud/pergeseran/pergeseran-client.tsx'
const PEMILIH   = 'components/blud/PeriodeVersiSelect.tsx'
const SHELL     = 'app/(dashboard)/blud/blud-shell.tsx'
const PENGINGAT = 'lib/shared/belum-tersimpan.ts'
const CSS       = 'app/globals.css'

let lulus = 0
let gagal = 0
function cek(nama: string, syarat: boolean, catatan = '') {
  if (syarat) { lulus++; console.log(`  ok   ${nama.padEnd(62)} ${catatan}`) }
  else        { gagal++; console.log(`  GAGAL ${nama.padEnd(62)} ${catatan}`) }
}
function bab(judul: string) { console.log(`\n── ${judul} ──`) }

// 28 Agustus 2026, 12:00 WIB. Dipatok supaya hasilnya tidak berubah besok.
const KINI = Date.UTC(2026, 7, 28, 5, 0, 0)

bab('A. periodeUntukVersi — satu aturan, diuji sungguhan')
{
  cek('Akhir bulan lampau = periode historis',
    tanggalPeriodeHistoris('2026-07-31', KINI))
  cek('Tanggal revisi harian BUKAN periode',
    !tanggalPeriodeHistoris('2026-08-27', KINI), '27 Agu bukan akhir bulan')
  cek('Akhir bulan BERJALAN bukan periode historis',
    !tanggalPeriodeHistoris('2026-08-31', KINI), 'masih di depan')
  cek('Tahun lampau: seluruh bulannya lewat',
    tanggalPeriodeHistoris('2025-12-31', KINI))
  cek('Februari non-kabisat ikut benar',
    tanggalPeriodeHistoris('2026-02-28', KINI))
  cek('Februari kabisat ikut benar',
    tanggalPeriodeHistoris('2024-02-29', KINI))
  cek('Sehari sebelum akhir bulan ditolak',
    !tanggalPeriodeHistoris('2026-06-29', KINI))
  cek('Nilai bukan tanggal ditolak',
    !tanggalPeriodeHistoris('', KINI) && !tanggalPeriodeHistoris('2026-07', KINI))

  // Inti perbaikannya: arsip periode DIKUNCI, revisi harian TIDAK.
  cek('Arsip periode mengunci pemilih periode',
    periodeUntukVersi('2026-07-31', KINI) === '2026-07-31')
  cek('Revisi harian memulangkan bulan berjalan',
    periodeUntukVersi('2026-08-27', KINI) === '',
    'kalau tidak, tiap sunting menimpa revisi kemarin')
  cek('Versi kosong memulangkan bulan berjalan',
    periodeUntukVersi('', KINI) === '')

  cek('Label periode terbaca manusia',
    labelPeriodeVersi('2026-07-31') === 'Juli 2026')

  // Angka kunci untuk simpan KEDUA ke periode yang sama — inti permintaan
  // "koreksi tanpa impor ulang". Kalau ini 0, koreksinya ditolak 409.
  cek('Simpan kedua ke Juli memakai angka kunci Juli',
    expectedVersionUntuk('2026-07-31', '2026-07-31', 3) === 3)
  cek('Simpan ke tanggal lain tetap mulai dari 0',
    expectedVersionUntuk('2026-07-31', '2026-08-27', 3) === 0)

  // Helpernya tetap menjawab "bulan mana yang bisa menampung arsip BARU" —
  // tidak diubah. Menggabungkannya dengan yang sudah berarsip tugas komponen.
  const sisa = periodeHistorisTersedia(2026, ['2026-07-31'], KINI)
  cek('Bulan terpakai bukan calon arsip baru',
    !sisa.some(p => p.tanggal === '2026-07-31') && sisa.length === 6,
    `${sisa.length} bulan tersisa`)
}

bab('A2. Kalimat penolakan arsip yang akan jadi pagu')
{
  // Kalimatnya DIBANGUN sungguhan, bukan dicocokkan ke berkas sumbernya: yang
  // dinilai di sini bunyi yang dibaca orang, dan potongan template di sumber
  // tidak memperlihatkannya. Mengimpor `data.ts` aman — `createPool` mysql2
  // tidak menyambung apa pun sampai kueri pertama, dan seluruh env-nya punya
  // nilai cadangan.
  const dpa = new BludHistorisJadiPaguError('dpa_blud', '2026-07-31').message
  const pgs = new BludHistorisJadiPaguError('pergeseran_dpa', '2026-07-31').message

  // Dibuka dengan TOMBOL yang harus ditekan, dan kata-katanya sama dengan yang
  // tertulis di layar masing-masing modul — DPA punya Impor & Form Baru,
  // Pergeseran cuma punya "Buat Pergeseran". Menyebut "Impor" di layar
  // Pergeseran menyuruh orang mencari tombol yang tidak ada di sana.
  cek('DPA membuka dengan Impor/buat, sesuai tombol di layarnya',
    dpa.startsWith('Impor atau buat DPA bulan berjalan dulu, lalu simpan.'))
  cek('Pergeseran membuka dengan Buat Pergeseran, tanpa Impor',
    pgs.startsWith('Buat Pergeseran bulan berjalan dulu, lalu simpan.')
    && !pgs.includes('Impor'))
  cek('Tanggalnya terbaca manusia, bukan ISO',
    dpa.includes('arsip 31 Jul 2026') && !dpa.includes('2026-07-31'))
  // Pendek itu tujuannya, tapi sebabnya tidak boleh ikut hilang — tanpa itu
  // penolakannya terdengar sewenang-wenang. Yang diganti cara mengatakannya:
  // "ia akan jadi acuan pagu setahun" dilaporkan tidak terbaca.
  cek('Sebabnya pakai kata sehari-hari, bukan "acuan"',
    dpa.endsWith('kalau tidak, angka Juli 2026 yang dipakai jadi pagu tahun ini.')
    && !dpa.includes('acuan'))
  cek('Bulannya disebut namanya, bukan "ia"', dpa.includes('angka Juli 2026'))
  cek('Tidak ada istilah dalam yang tersisa',
    !/versi historis|entri historis|sumber pagu/i.test(dpa + pgs))
  cek('Cukup pendek untuk satu toast',
    dpa.length < 180 && pgs.length < 180, `${dpa.length} & ${pgs.length} huruf (dulu 246)`)
}

bab('B. Keempat pintu memakai aturan yang sama')
{
  for (const [nama, berkas] of [['DPA', KLIEN_DPA], ['Pergeseran', KLIEN_PGS]] as const) {
    const isi = kode(baca(berkas))

    // Pintu 4 — inilah bug yang dilaporkan.
    cek(`${nama}: Simpan berhasil tidak memulangkan ke bulan berjalan`,
      !/setPeriodeTulis\(''\)[\s\S]{0,80}loadHistory\(\)/.test(isi)
      && isi.includes('setPeriodeTulis(periodeUntukVersi(versiTanggal))'))
    // Pintu 2 & 3.
    cek(`${nama}: Membuka versi menyetel periode`,
      /async function bukaVersi[\s\S]{0,600}setPeriodeTulis\(periodeUntukVersi\(v\)\)/.test(isi))
    cek(`${nama}: Pulihkan snapshot menyetel periode`,
      isi.includes('setPeriodeTulis(periodeUntukVersi(s.versi_tanggal))'))
    // Pintu 1 sudah dipasang di L78b — dijaga supaya tidak hilang lagi.
    cek(`${nama}: Ganti periode masih menggerakkan layar`,
      /async function gantiPeriode[\s\S]{0,900}setRows\(\[\]\)[\s\S]{0,120}setVersi\(''\)/.test(isi))
    cek(`${nama}: Daftar versi tidak lagi menyetel versi mentah`,
      !/onChange=\{v => \{ setVersi\(v\)/.test(isi))
  }

  // Bulan yang sudah punya arsip lenyap dari daftar pilihan — `periodeHistoris
  // Tersedia` memang cuma menawarkan bulan kosong. Benar untuk MEMILIH, salah
  // untuk KEMBALI: sesudah Juli tersimpan, satu-satunya jalan pulang ke Juli
  // lewat daftar versi. Dua tempat untuk satu maksud.
  const pemilih = kode(baca(PEMILIH))
  cek('Pemilih periode ikut menampilkan bulan yang sudah berarsip',
    pemilih.includes('tanggalPeriodeHistoris(v)')
    && /pilihan:\s*\[\.\.\.kosong, \.\.\.dariArsip\]/.test(pemilih))
  cek('Revisi harian tidak ikut masuk daftar periode',
    pemilih.includes('.filter(v => tanggalPeriodeHistoris(v))'),
    'versi 26 Jul itu revisi harian, bukan arsip Juli')
  cek('Bulan berarsip diberi tanda',
    pemilih.includes('berarsip.has(p.tanggal)'))

  // Memilih periode berarsip = MEMBUKA arsipnya. Mengosongkan layar di situ
  // meninggalkan form kosong dengan sasaran Simpan yang justru sudah berisi.
  for (const [nama, berkas] of [['DPA', KLIEN_DPA], ['Pergeseran', KLIEN_PGS]] as const) {
    cek(`${nama}: Memilih periode berarsip membuka arsipnya`,
      /if \(tanggal && history\.some\(h => h\.versi_tanggal === tanggal\)\) \{\s*\n\s*await bukaVersi\(tanggal\)/
        .test(kode(baca(berkas))))
  }
}

bab('C. belumTersimpan — bendera "layar ≠ yang tersimpan"')
{
  for (const [nama, berkas, tabel] of [
    ['DPA', KLIEN_DPA, 'DpaTable'],
    ['Pergeseran', KLIEN_PGS, 'PergeseranTable'],
  ] as const) {
    const isi = kode(baca(berkas))

    // Satu-satunya jalan tabel mengubah baris. Tanpa ini, menyunting satu sel
    // pada versi yang dimuat tidak terdeteksi sama sekali.
    cek(`${nama}: Tabel menulis lewat ubahRows, bukan setRows`,
      isi.includes(`<${tabel} rows={rows} onChange={ubahRows}`))
    cek(`${nama}: ubahRows menandai belum tersimpan`,
      /const ubahRows = useCallback\([\s\S]{0,200}setBelumTersimpan\(true\)/.test(isi))

    // Muat dari server = layar SAMA dengan yang tersimpan.
    cek(`${nama}: Muat dari server membersihkan bendera`,
      /setVersion\(typeof json\.version === 'number' \? json\.version : 0\)\s*\n\s*setBelumTersimpan\(false\)/.test(isi))
    cek(`${nama}: Simpan berhasil membersihkan bendera`,
      /setPeriodeTulis\(periodeUntukVersi\(versiTanggal\)\)\s*\n\s*setBelumTersimpan\(false\)/.test(isi))
    // Pulihkan mengisi form TANPA menulis DB — `versi` terisi, isinya tidak.
    // Inilah kasus yang membuktikan `!versi` saja tidak cukup.
    cek(`${nama}: Pulihkan menandai belum tersimpan`,
      /setPeriodeTulis\(periodeUntukVersi\(s\.versi_tanggal\)\)\s*\n\s*setBelumTersimpan\(true\)/.test(isi))

    // Pertanyaan sebelum membuang harus memakai bendera, bukan `!versi`.
    cek(`${nama}: Konfirmasi buang memakai bendera, bukan versi kosong`,
      isi.includes('rows.length > 0 && belumTersimpan')
      && !isi.includes('rows.length > 0 && !versi'))
  }

  const dpa = kode(baca(KLIEN_DPA))
  cek('DPA: Form Baru menandai belum tersimpan',
    /setRows\(built\)[\s\S]{0,120}setBelumTersimpan\(true\)/.test(dpa))
  cek('DPA: Impor menandai belum tersimpan',
    /function terapkanImpor[\s\S]{0,200}setBelumTersimpan\(true\)/.test(dpa))
  cek('DPA: Salin Tahun menandai belum tersimpan',
    /function terapkanSalinTahun[\s\S]{0,200}setBelumTersimpan\(true\)/.test(dpa))

  const pgs = kode(baca(KLIEN_PGS))
  // Jendelanya dilebarkan 2026-09-02: jalur ini sekarang juga melepas catatan
  // perpindahan dan menyetel ulang dpaVersi/versi di antaranya. Yang dijaga
  // tidak berubah — barisnya berganti, jadi layar WAJIB menandai belum
  // tersimpan (L82c: jendela sempit menyalak pada kode yang benar).
  cek('Pergeseran: Buat Pergeseran menandai belum tersimpan',
    /setRows\(generated\)[\s\S]{0,240}setBelumTersimpan\(true\)/.test(pgs))
  // Pemasangan baris hasil sinkron pindah ke `pasangHasilSinkron` (2026-08-29):
  // hasilnya kini dibandingkan dulu, dan dua jalur — "tidak ada yang berubah"
  // dan tombol Terapkan — memanggil pemasang yang sama. Yang dijaga tetap sama:
  // barisnya berganti, jadi layar WAJIB menandai belum tersimpan.
  cek('Pergeseran: Sinkronkan DPA menandai belum tersimpan',
    /pasangHasilSinkron = useCallback\([\s\S]{0,200}setRows\(baris\)[\s\S]{0,120}setBelumTersimpan\(true\)/.test(pgs))
}

bab('D. Tombol borongan dikunci saat versi tersimpan terbuka')
{
  const dpa = kode(baca(KLIEN_DPA))
  cek('DPA: alasan kunci diturunkan dari versi yang terbuka',
    /const alasanKunciBorongan = versi\s*\n\s*\? `Versi \$\{formatTanggalId\(versi\)\}/.test(dpa))
  cek('DPA: Form Baru ikut terkunci',
    /disabled=\{!!alasanKunciBorongan\}[\s\S]{0,120}onClick=\{mulaiFormBaru\}/.test(dpa))
  cek('DPA: Impor ikut terkunci',
    /disabled=\{!!alasanKunciBorongan\}[\s\S]{0,140}setImportDpaBuka\(true\)/.test(dpa))
  // Patokan Salin Tahun SENGAJA berbeda: sasarannya tahun yang dibuka, bukan
  // slot versi — memilih periode historis mengosongkan layar, dan tahunnya
  // tetap berisi.
  cek('DPA: Salin Tahun memakai patokan tahun, bukan versi',
    /alasanKunciSalinTahun[\s\S]{0,400}history\.length > 0/.test(dpa))
  cek('DPA: Salin Tahun tetap menjaga syarat lama',
    /alasanKunciSalinTahun = tahunList\.filter\(t => t !== tahun\)\.length === 0/.test(dpa))
  cek('DPA: alasan kunci dipakai sebagai tooltip',
    (dpa.match(/data-tooltip=\{alasanKunciBorongan\}/g) ?? []).length === 2)
  // "Salin ke Induk" TIDAK mengganti tabel — ia membaca baris yang ada.
  cek('DPA: Salin ke Induk tidak ikut terkunci',
    /disabled=\{!rows\.length\}[\s\S]{0,120}setSalinBuka\(true\)/.test(dpa))

  const pgs = kode(baca(KLIEN_PGS))
  cek('Pergeseran: Buat Pergeseran ikut terkunci',
    /disabled=\{loading \|\| !!alasanKunciBorongan\}/.test(pgs))
  // Sinkronkan DPA memperbarui kolom di TEMPAT — row_id & vol_p/harga_p utuh,
  // jadi ia pekerjaan normal pada versi yang sudah tersimpan.
  //
  // Syarat `!!periodeTulis` dicabut 2026-08-29: dulu tombol ini dimatikan pada
  // periode historis karena servernya selalu mengambil DPA TERBARU. Sekarang ia
  // mengambil DPA yang BERLAKU pada sasaran Simpan, jadi sebabnya hilang.
  cek('Pergeseran: Sinkronkan DPA sengaja tidak ikut terkunci',
    /disabled=\{injecting \|\| !rows\.length\}/.test(pgs)
    && !/disabled=\{injecting[^}]*alasanKunciBorongan/.test(pgs))
  cek('Pergeseran: Sinkronkan DPA tidak lagi dimatikan periode historis',
    !/disabled=\{injecting \|\| !rows\.length \|\| !!periodeTulis\}/.test(pgs),
    'servernya sudah sadar periode — lihat scripts/test-blud-tutup-pergeseran.mts')
}

bab('E. 409 berhenti menuduh "orang lain"')
{
  for (const [nama, berkas] of [['DPA', KLIEN_DPA], ['Pergeseran', KLIEN_PGS]] as const) {
    const isi = kode(baca(berkas))
    cek(`${nama}: Tuduhan lama sudah tidak ada`,
      !isi.includes('baru saja diisi orang lain'))
    // expected = 0 berarti layar menyusun versi BARU dan tanggalnya ternyata
    // sudah terisi — paling sering simpanan sendiri yang lebih awal.
    cek(`${nama}: Dua keadaan dibedakan lewat expected`,
      isi.includes('const versiBaruTernyataAda = json.expected === 0'))
    cek(`${nama}: Kalimatnya menyebut kemungkinan diri sendiri`,
      isi.includes('simpanan Anda sendiri yang lebih awal'))
  }
  // Server harus tetap mengirim `expected`, kalau tidak pembedanya buta.
  for (const rute of ['app/api/blud/dpa/route.ts', 'app/api/blud/pergeseran/route.ts']) {
    cek(`${rute.split('/')[3]}: server tetap mengirim expected`,
      /VERSION_CONFLICT[\s\S]{0,200}expected:/.test(baca(rute)))
  }
}

bab('F. Pengingat "belum tersimpan" menutup tiga pintu keluar')
{
  const hook = kode(baca(PENGINGAT))
  cek('Muat ulang / tutup tab dijaga beforeunload',
    hook.includes("window.addEventListener('beforeunload'"))
  cek('Pindah menu dijaga di fase capture',
    hook.includes("document.addEventListener('click', onClick, true)"),
    'beforeunload tidak berbunyi utk navigasi App Router')
  cek('Klik tab-baru dibiarkan lewat',
    hook.includes('e.metaKey || e.ctrlKey || e.shiftKey || e.altKey'))
  cek('Tautan ke halaman ini sendiri dibiarkan lewat',
    hook.includes('tujuan.pathname === window.location.pathname'))
  cek('Tautan luar dibiarkan lewat',
    hook.includes('tujuan.origin !== window.location.origin'))
  // DILARANG window.confirm (L58) — dan itu juga alasan navigasinya harus
  // dibatalkan dulu lalu diulang: confirmDialog async, klik tidak bisa ditahan.
  cek('Memakai confirmDialog, bukan window.confirm',
    hook.includes('confirmDialog(') && !hook.includes('window.confirm'))
  cek('Pendaftar dibersihkan saat layar ditinggalkan',
    /return \(\) => \{\s*\n\s*pesanAktif = null/.test(hook))

  const shell = kode(baca(SHELL))
  cek('Shell: tombol Menu bertanya dulu',
    /bolehTinggalkanHalaman\(\)\) router\.push\('\/menu'\)/.test(shell))
  cek('Shell: Ganti Password bertanya dulu',
    /bolehTinggalkanHalaman\(\)\) router\.push\('\/profil'\)/.test(shell))
  // Urutannya penting: ditanya SEBELUM sesi dimatikan. Terbalik, menjawab
  // "tetap di sini" meninggalkan orang di halaman bersesi mati.
  cek('Shell: Keluar bertanya SEBELUM sesi dimatikan',
    /bolehTinggalkanHalaman\(\)\)\) return\s*\n\s*setLoggingOut\(true\)/.test(shell))

  for (const [nama, berkas] of [['DPA', KLIEN_DPA], ['Pergeseran', KLIEN_PGS]] as const) {
    cek(`${nama}: memasang pengingatnya`,
      /useIngatkanBelumTersimpan\(\s*\n\s*belumTersimpan && rows\.length > 0/.test(kode(baca(berkas))))
  }
}

bab('G. Bilah gulir pemilih periode')
{
  const css = baca(CSS)
  // `visible` pada satu sumbu otomatis jadi `auto` kalau sumbu lain `auto` —
  // isi yang meleset beberapa piksel memunculkan bilah gulir mendatar, yang
  // memicu bilah tegak, yang menyempitkan isi, yang menghilangkan yang mendatar.
  cek('.versi-menu mengunci gulir mendatar',
    /\.versi-menu \{[\s\S]{0,220}overflow-y: auto; overflow-x: hidden;/.test(css))
  cek('Menu brutalist diberi ruang kiri-kanan',
    /--brutalist \.versi-menu \{[\s\S]{0,320}padding: 5px 4px 0 4px;/.test(css),
    'supaya bayangan 2px tidak terpotong')
}

console.log(`\n${lulus} pemeriksaan LULUS · ${gagal} GAGAL`)
process.exit(gagal > 0 ? 1 : 0)
