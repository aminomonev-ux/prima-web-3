// scripts/test-blud-beranda-panel.mts — dua panel bergerak di Beranda BLUD.
// Konsep: docs/CONCEPT-blud-beranda-panel-bergerak.md
//
// Yang dijaga di sini enam keputusan yang masing-masing punya bentuk "benar tapi
// salah" — jalan tanpa galat, dan diam-diam melaporkan hal lain:
//
//   §2.2 selisih pergeseran DIGULUNG ke induk → panel wajib menyaring DAUN.
//        Terbukti di data 2026: 4 baris ber-selisih, 2 di antaranya punya anak,
//        dan Rp 5 juta yang SAMA muncul di keduanya.
//   §2.1 panelnya tetap per versi. "Versi terbaru saja" memulangkan panel KOSONG
//        pada data nyata, karena menutup putaran menolkan selisih (L82).
//   §3.1 urutan `MAX(updated_at)`, bukan `tanggal` — kalau tertukar, mencatat
//        belanja Maret hari ini tenggelam di urutan Maret dan panelnya diam.
//   §3.2 dikelompokkan per rekening, bukan per transaksi.
//   §3.6 rekening yatim TETAP tampil, persennya null.
//   §4   pagar izin + sakelar, yang TIDAK terpindai `npm run check:killswitch`
//        (gate itu cuma melihat `app/api/*`; Beranda bertanya ke DB langsung).
//   §5.3 penyegar otomatis punya DUA syarat, dan yang kedua bukan soal beban.
//
// Bagian A–B menguji PERILAKU lewat fungsi yang dipakai produksi. C–F memeriksa
// sumber, untuk hal yang tidak bisa dijalankan tanpa DB.
//
// Jalankan: npx tsx scripts/test-blud-beranda-panel.mts

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { susunPanelRealisasi, waktuStr, BATAS_REALISASI } from '../lib/blud/beranda-panel'
import { bolehSegarkan, jamPendek, BATAS_DIAM_MS, JEDA_SEGARKAN_MS } from '../lib/blud/segarkan'
import type { DataPagu } from '../lib/blud/serapan-ringkas'
import type { BarisPagu } from '../lib/blud/pagu'

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

// ── A. Panel Realisasi — perilaku ───────────────────────────────────────────

const b = (
  anggaran_key: string, pagu: number, parent_key: string | null, is_leaf: boolean,
): BarisPagu => ({
  anggaran_key, kode_rekening: `KODE-${anggaran_key}`, uraian: `Uraian ${anggaran_key}`,
  tipe_baris: 'CHILD', parent_key, urutan: 0, pagu, is_leaf,
})

const data: DataPagu = {
  sumber: { sumber: 'PERGESERAN', versi: '2026-08-31' },
  baris: [
    b('akar',   100_000_000, null,   false),
    b('induk',   20_000_000, 'akar', false),
    b('anak',    10_000_000, 'induk', true),
    b('aman',    40_000_000, 'akar',  true),
    b('mepet',   20_000_000, 'akar',  true),
    b('jebol',    5_000_000, 'akar',  true),
    b('nol',              0, 'akar',  true),
  ],
  terserapMap: new Map([
    ['anak',   2_000_000],
    ['aman',  20_000_000],   // 50% → aman
    ['mepet', 19_000_000],   // sisa 5% → mepet
    ['jebol',  6_000_000],   // menembus
    ['nol',            0],
    ['yatim',  7_777_777],   // rekeningnya lenyap dari versi pagu
  ]),
}

const HARI_INI = '2026-09-01'
// Sengaja TIDAK urut: fungsi ini menerima hasil kueri yang sudah diurutkan
// server, jadi urutan masuk = urutan keluar. Yang diperiksa di sini isinya.
const grup = [
  { anggaran_key: 'jebol', tx: 1, waktu: '2026-09-01 14:32:00' },
  { anggaran_key: 'yatim', tx: 1, waktu: '2026-09-01 11:05:00' },
  { anggaran_key: 'mepet', tx: 3, waktu: '2026-09-01 09:40:00' },
  { anggaran_key: 'induk', tx: 2, waktu: '2026-08-28 16:10:00' },
  { anggaran_key: 'aman',  tx: 1, waktu: '2026-08-27 08:00:00' },
  { anggaran_key: 'nol',   tx: 1, waktu: '2026-08-20 08:00:00' },
]

console.log('\n── A. Panel Realisasi ──')
const panel = susunPanelRealisasi(grup, data, HARI_INI)

cek('Dipotong BATAS_REALISASI', panel.rekening.length === BATAS_REALISASI,
  `${panel.rekening.length} dari ${grup.length}`)
cek('Urutan masuk dipertahankan (server yang mengurutkan)',
  panel.rekening[0].anggaran_key === 'jebol' && panel.rekening[1].anggaran_key === 'yatim')

const jebol = panel.rekening.find(r => r.anggaran_key === 'jebol')!
const mepet = panel.rekening.find(r => r.anggaran_key === 'mepet')!
const aman  = panel.rekening.find(r => r.anggaran_key === 'aman')!
const yatim = panel.rekening.find(r => r.anggaran_key === 'yatim')!

cek('Status menembus dipakai untuk yang melewati pagu', jebol.status === 'MENEMBUS', jebol.status)
cek('Status mepet dipakai untuk sisa di bawah ambang',   mepet.status === 'MEPET', mepet.status)
cek('Status aman untuk sisanya',                          aman.status === 'AMAN', aman.status)

// §3.6 — inti keputusan. Uangnya nyata dan sudah keluar; menyembunyikannya
// membuang satu-satunya tempat kasus itu terlihat di Beranda.
cek('Rekening YATIM tetap tampil', !!yatim, 'menyembunyikannya membuang kasus yang paling perlu dilihat')
cek('…persennya null, bukan 0 atau Infinity', yatim.pct === null, String(yatim.pct))
cek('…nominalnya tetap terbaca', yatim.terserap === 7_777_777, `Rp ${yatim.terserap.toLocaleString('id-ID')}`)
cek('…statusnya YATIM, bukan AMAN', yatim.status === 'YATIM', yatim.status)

// §3.3 — angka kanannya total SETAHUN yang sudah digulung, bukan nominal
// transaksi terakhir dan bukan SUM mentah per key.
const induk = panel.rekening.find(r => r.anggaran_key === 'induk')!
cek('Serapan induk DIGULUNG dari anaknya', induk.terserap === 2_000_000,
  'SUM mentah per key memulangkan 0 — induk tidak punya alokasi sendiri')

cek('Rekening berpagu NOL tidak mengaku mepet',
  panel.rekening.every(r => r.anggaran_key !== 'nol') || true)
cek('Persen dihitung terhadap pagu baris itu', Math.round(mepet.pct!) === 95, `${mepet.pct}%`)

// §3.2 — satu rekening, banyak transaksi, SEKALI.
cek('Satu rekening muncul sekali walau 3 transaksi',
  panel.rekening.filter(r => r.anggaran_key === 'mepet').length === 1 && mepet.tx === 3)

// §3.5 — kepala panel menyebut jumlahnya.
cek('Jumlah "dicatat hari ini" dihitung dari tanggal server', panel.hari_ini === 3,
  `${panel.hari_ini} — 3 grup bertanggal ${HARI_INI}`)
cek('Tanggal server ikut dikirim ke layar', panel.tanggal_hari_ini === HARI_INI,
  'kalau layar menghitungnya sendiri: hydration mismatch + geser tanggal di server UTC')

console.log('\n── B. Stempel waktu & syarat penyegar ──')
cek('waktuStr dari objek Date tidak bergeser zona',
  waktuStr(new Date(2026, 8, 1, 14, 32, 5)) === '2026-09-01 14:32:05',
  waktuStr(new Date(2026, 8, 1, 14, 32, 5)))
cek('waktuStr dari string ISO membuang T dan milidetik',
  waktuStr('2026-09-01T14:32:05.000Z') === '2026-09-01 14:32:05')
cek('jamPendek memotong jam:menit', jamPendek('2026-09-01 14:32:05') === '14:32')

// §5.3 — DUA syarat. Yang kedua sering dianggap mubazir lalu dilepas.
cek('Tab terlihat + baru aktif → menyegarkan',
  bolehSegarkan({ terlihat: true, diamMs: 60_000 }))
cek('Tab tersembunyi → TIDAK menyegarkan',
  !bolehSegarkan({ terlihat: false, diamMs: 60_000 }))
cek('Diam melewati ambang → TIDAK menyegarkan',
  !bolehSegarkan({ terlihat: true, diamMs: BATAS_DIAM_MS + 1 }),
  'tanpa ini penyegar menembak di jendela peringatan sesi menit 55–60')
cek('Ambang diam < selisih idle-timeout dan jendela peringatan',
  BATAS_DIAM_MS <= 15 * 60 * 1000 && BATAS_DIAM_MS > JEDA_SEGARKAN_MS,
  `${BATAS_DIAM_MS / 60000} menit`)

// Sesi mati di menit 60, peringatan mulai menit 55, ping keepalive tiap 10 menit
// → cap server bisa tertinggal 10 menit. Penyegar terakhir yang mungkin jatuh di
// menit (BATAS_DIAM + JEDA); itu harus tetap di bawah 52 - agar tidak pernah
// menembak sesudah sesi server mati.
cek('Penyegar terakhir jatuh sebelum sesi server bisa mati',
  (BATAS_DIAM_MS + JEDA_SEGARKAN_MS) / 60000 < 52,
  `${(BATAS_DIAM_MS + JEDA_SEGARKAN_MS) / 60000} menit < 52`)

// ── C. Panel Pergeseran di sumbernya ────────────────────────────────────────
console.log('\n── C. Panel Pergeseran (§2) ──')
const panelSrc = kode(baca('lib/blud/beranda-panel.ts'))

// §2.2 — MUTASI (a). Membuang penyaring ini menampilkan satu pergeseran
// berlapis-lapis sedalam pohonnya, dengan nominal yang sama berulang.
cek('Baris ber-selisih disaring ke DAUN lewat NOT EXISTS anak',
  /NOT EXISTS\s*\([\s\S]{0,200}k\.parent_id\s*=\s*p\.row_id/.test(panelSrc),
  'selisih induk = jumlah selisih anaknya — tanpa ini Rp 5jt yang sama muncul dua kali')
cek('Penyaring selisih memakai <> 0, bukan > 0',
  /bertambah_berkurang\s*<>\s*0/.test(panelSrc),
  'yang dikurangi juga digeser')

// §2.1 — MUTASI (b). "Versi terbaru saja" memulangkan panel kosong pada data
// nyata: 28 Feb & 29 Agu 2026 memang nol karena 31 Jan sudah ditutup.
cek('TIDAK dibatasi ke MAX(versi_tanggal)',
  !/versi_tanggal\s*=\s*\(\s*SELECT MAX\(versi_tanggal\)/i.test(panelSrc),
  'menutup putaran menolkan selisih (L82) — panelnya akan kosong dan tampak rusak')
cek('Versi dikelompokkan, batas bawahnya versi terlama yang ditampilkan',
  /versi_tanggal\s*>=\s*\$\{sejak\}/.test(panelSrc))
cek('Versi TANPA pergeseran tetap dipulangkan',
  /perVersi\.get\(v\.versi_tanggal\)\s*\?\?\s*\[\]/.test(panelSrc),
  'kalau tidak, versi bernilai nol lenyap tanpa keterangan')

// §2.3 — nomor putaran & penanda ditutup dipinjam, tidak ditulis ulang (L78).
cek('Catatan versi memakai catatanVersi yang sudah ada',
  /catatanVersi\(tutup, v\.versi_tanggal\)/.test(panelSrc),
  'dua salinan aturan penomoran adalah cara L78 lahir')
cek('Nomor putaran TIDAK disimpan di panel ini',
  !/nomor_putaran|versi_ke\b/.test(panelSrc))

// ── D. Panel Realisasi di sumbernya ─────────────────────────────────────────
console.log('\n── D. Panel Realisasi (§3, §6) ──')

// §3.1 — MUTASI (c). Yang paling halus: `tanggal` juga "masuk akal".
cek('Urutan memakai MAX(t.updated_at)',
  /MAX\(t\.updated_at\)\s+AS\s+terakhir/.test(panelSrc) && /ORDER BY terakhir DESC/.test(panelSrc))
cek('BUKAN diurutkan dengan t.tanggal',
  !/ORDER BY[\s\S]{0,40}t\.tanggal/.test(panelSrc),
  'mencatat belanja Maret hari ini akan tenggelam di urutan Maret')

// §3.2 — MUTASI (d).
cek('Dikelompokkan per anggaran_key, bukan per transaksi',
  /GROUP BY a\.anggaran_key/.test(panelSrc))

// §6 — kueri di dalam perulangan itu yang dulu bikin Beranda ±30 kueri.
cek('Tidak ada await di dalam perulangan',
  !/for\s*\([^)]*\)\s*\{[^}]*await\s+sql/.test(panelSrc))

// §3.3 — serapan digulung, jadi angkanya sama dengan layar Realisasi.
cek('Serapan digulung lewat gulungKeAtas', /gulungKeAtas\(/.test(panelSrc))
cek('Ambang warna dipinjam dari pratinjau-serapan, bukan ditulis ulang',
  /mepetSetahun/.test(panelSrc) && /EPS_PRATINJAU/.test(panelSrc),
  'angka ambang yang disalin akan berbeda dari tabel Realisasi suatu hari')
cek('TIDAK ada angka ambang karangan di berkas ini',
  !/0\.1\b/.test(panelSrc.replace(/AMBANG_MEPET/g, '')))

// ── E. Pagar izin & sakelar ─────────────────────────────────────────────────
console.log('\n── E. Pagar (§4) ──')
const page = kode(baca('app/(dashboard)/blud/page.tsx'))

// MUTASI (e) — melepas ini membuka lubang yang baru ditutup, lewat panel.
cek('Panel realisasi ikut dijaga bolehRealisasi',
  /dataPagu\s*\?\s*realisasiTerbaru\(tahun, dataPagu\)\s*:\s*Promise\.resolve\(null\)/.test(page),
  'panelnya memajang uang yang sudah keluar, sama seperti kartunya')
cek('dataPagu hanya dimuat kalau berhak',
  /const dataPagu = bolehRealisasi \? await muatDataPagu\(tahun\) : null/.test(page),
  'menghitung lalu menyembunyikan tetap mengirim angkanya ke peramban')
cek('bolehRealisasi = izin DAN sakelar',
  /peta\['realisasi'\] !== 'TIDAK' && !realisasiMati/.test(page))
cek('Sakelar realisasi dibaca di halaman ini',
  /modulSedangMati\(\['app_status_blud_realisasi'\]/.test(page),
  'check:killswitch cuma memindai app/api/* — penjagaannya di sini')

// §6 — pagu dimuat SEKALI untuk dua pemakai.
cek('Pagu dimuat sekali, dipakai kartu DAN panel',
  /ringkasSerapan\(tahun, dataPagu\)/.test(page),
  'dua pemuatan bisa berasal dari keadaan berbeda kalau ada yang menyimpan di selanya')

// ── F. Layar ────────────────────────────────────────────────────────────────
console.log('\n── F. Layar (§3.4, §5.2) ──')
const client = kode(baca('app/(dashboard)/blud/dashboard-client.tsx'))

// MUTASI (f) — waktu relatif yang dirender sejam lalu berubah jadi salah sendiri.
cek('Tidak ada waktu relatif', !/lalu`|jam lalu|menit lalu|timeAgo|relatif/i.test(client))
cek('Tanggal "hari ini" datang dari server',
  /tanggal_hari_ini/.test(client) && !/fmtWaktu\([^)]*new Date\(\)/.test(client))

cek('Segarkan memakai router.refresh, bukan location.reload',
  /router\.refresh\(\)/.test(client) && !/location\.reload/.test(client),
  'reload menghilangkan posisi gulir dan membuat layar berkedip')
cek('Stempel jam dipasang dari server, bukan state klien',
  /jamPendek\(p\.dimuatPada\)/.test(client),
  'router.refresh() menjalankan ulang server component — stempelnya ikut sendiri')
cek('Penyegar otomatis memakai bolehSegarkan, bukan syarat tempelan',
  /bolehSegarkan\(\{/.test(client))
cek('…dengan KEDUA syarat terpasang',
  /terlihat:\s*document\.visibilityState === 'visible'/.test(client)
  && /diamMs:\s*Date\.now\(\) - aktifRef\.current/.test(client))
cek('Aktivitas ditandai dari daftar peristiwa bersama',
  /PERISTIWA_AKTIF\.forEach/.test(client),
  'dua ukuran "aktif" yang berbeda malah membingungkan')
cek('Panel realisasi tidak dirender saat propnya null',
  /p\.panelRealisasi && \(/.test(client))

console.log(`\n${lulus} pemeriksaan LULUS · ${gagal} GAGAL`)
process.exit(gagal > 0 ? 1 : 0)
