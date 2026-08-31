// scripts/test-blud-cadangan-json.mts — cadangan JSON BLUD ke Google Drive.
// Konsep: docs/CONCEPT-blud-cadangan-json.md
//
// Bagian A menguji PERILAKU pembaca berkas dengan berkas sungguhan (termasuk
// yang rusak); bagian B–E statis, menjaga kesepakatan yang tidak bisa dilihat
// tsc — satu logika untuk dua pemicu, urutan tulis penanda, dan pelepasan jejak
// `asal_berkas` di setiap jalur yang mengganti baris.
//
// Jalankan: npx tsx scripts/test-blud-cadangan-json.mts

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { bacaBerkasCadangan, namaBerkasCadangan, CADANGAN_FORMAT } from '../lib/blud/cadangan-berkas'

const AKAR = join(import.meta.dirname, '..')
const baca = (p: string) => readFileSync(join(AKAR, p), 'utf8')

/** Komentar dibuang dulu — prosa yang menjelaskan pola lama tidak boleh menyalakan tesnya sendiri (L82c). */
function kode(isi: string): string {
  return isi.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

const LIB   = 'lib/blud/cadangan-json.ts'
const BRK   = 'lib/blud/cadangan-berkas.ts'
const RBLUD = 'app/api/blud/cadangan-json/route.ts'
const RCRON = 'app/api/cron/blud-cadangan-json/route.ts'
const PGS   = 'app/(dashboard)/blud/pergeseran/pergeseran-client.tsx'
const DPA   = 'app/(dashboard)/blud/dpa/dpa-client.tsx'
const TOMBOL = 'components/blud/MuatBerkasButton.tsx'

let lulus = 0
let gagal = 0
function cek(nama: string, syarat: boolean, catatan = '') {
  if (syarat) { lulus++; console.log(`  ok    ${nama.padEnd(58)} ${catatan}`) }
  else        { gagal++; console.log(`  GAGAL ${nama.padEnd(58)} ${catatan}`) }
}
function bab(j: string) { console.log(`\n── ${j} ──`) }

const contoh = {
  format:            CADANGAN_FORMAT,
  jenis:             'PERGESERAN' as const,
  tahun_anggaran:    2026,
  versi_tanggal:     '2026-01-31',
  versi_ke:          4,
  disimpan_pada:     '2026-08-29 16:47:07',
  jumlah_baris:      2,
  total_nilai:       5_100_000,
  dpa_versi_tanggal: '2026-01-31',
  disimpan_oleh:     'superadmin',
  rows: [
    { row_id: 'row_a', uraian: 'Belanja Pembulatan', vol: 1, harga: 100_000 },
    { row_id: 'row_b', uraian: 'Belanja Iuran', vol: 1, harga: 175_000_000 },
  ],
}
const teks = (o: unknown) => JSON.stringify(o)
const HARUS = { jenis: 'PERGESERAN' as const, tahun: 2026 }

// ─────────────────────────────────────────────────────────────────────────────
bab('A. Pembaca berkas — masukan dari LUAR, jadi diuji dengan yang rusak juga')
{
  const sah = bacaBerkasCadangan(teks(contoh), HARUS)
  cek('Berkas sah diterima', sah.ok)
  cek('…barisnya utuh', sah.ok && sah.data.rows.length === 2)
  cek('…kolom di luar row_id ikut lewat',
    sah.ok && sah.data.rows[0].uraian === 'Belanja Pembulatan',
    'kolom baru kelak tidak boleh membuat cadangan lama ditolak')

  const bukanJson = bacaBerkasCadangan('ini bukan json', HARUS)
  cek('Bukan JSON ditolak', !bukanJson.ok)
  cek('…dengan kalimat yang menebak sebabnya',
    !bukanJson.ok && /salah pilih berkas/.test(bukanJson.error))

  const salahTahun = bacaBerkasCadangan(teks({ ...contoh, tahun_anggaran: 2027 }), HARUS)
  cek('Tahun anggaran berbeda DITOLAK', !salahTahun.ok,
    'baris membawa anggaran_key — jangkar realisasi yang terikat tahunnya')
  cek('…dan kedua tahunnya disebut',
    !salahTahun.ok && /2027/.test(salahTahun.error) && /2026/.test(salahTahun.error))

  const salahJenis = bacaBerkasCadangan(teks({ ...contoh, jenis: 'DPA' }), HARUS)
  cek('Jenis berbeda ditolak', !salahJenis.ok)

  const bentukLain = bacaBerkasCadangan(teks({ ...contoh, format: CADANGAN_FORMAT + 1 }), HARUS)
  cek('Bentuk berkas tak dikenal ditolak', !bentukLain.ok,
    'menaikkan nomor bentuk sembarangan membuat cadangan lama jadi sampah')

  cek('Baris kosong ditolak', !bacaBerkasCadangan(teks({ ...contoh, rows: [] }), HARUS).ok)
  cek('Baris tanpa row_id ditolak',
    !bacaBerkasCadangan(teks({ ...contoh, rows: [{ uraian: 'tanpa jangkar' }] }), HARUS).ok,
    'row_id menyangga hierarki dan seluruh penanganan baris')
  cek('Kepala yang hilang ditolak',
    !bacaBerkasCadangan(teks({ rows: contoh.rows }), HARUS).ok,
    'tanpa kepala, berkas tidak bisa menjawab "ini tahun berapa"')
}

// ─────────────────────────────────────────────────────────────────────────────
bab('B. Nama berkas membawa identitas lengkap')
{
  const nama = namaBerkasCadangan(contoh)
  cek('Memuat jenis, tahun, versi, simpan ke-berapa, dan stempel waktu',
    nama === 'blud-pergeseran-2026-2026-01-31-ke4-20260829164707.json', nama)
  cek('Tanpa titik dua', !nama.includes(':'), 'sah di Drive, tidak di Windows')
  cek('Dua simpanan berbeda tidak bertabrakan',
    namaBerkasCadangan(contoh) !== namaBerkasCadangan({ ...contoh, versi_ke: 5, disimpan_pada: '2026-08-29 16:48:07' }))
}

// ─────────────────────────────────────────────────────────────────────────────
bab('C. Satu logika, dua pemicu')
{
  const kLib   = kode(baca(LIB))
  const kBlud  = kode(baca(RBLUD))
  const kCron  = kode(baca(RCRON))
  const kBerkas = kode(baca(BRK))

  cek('Route Pengaturan memanggil fungsi lib', /cadangkanJsonBlud\(\)/.test(kBlud))
  cek('Route cron memanggil fungsi lib yang SAMA', /cadangkanJsonBlud\(\{ batas: \d+ \}\)/.test(kCron),
    'dua salinan logika yang sama adalah cara L78 lahir')
  cek('Tidak ada route yang mengunggah sendiri',
    !/uploadBufferToDrive/.test(kBlud) && !/uploadBufferToDrive/.test(kCron))

  cek('Penanda ditulis SESUDAH unggahan berhasil',
    /uploadBufferToDrive\(\{[\s\S]*?\}\)[\s\S]{0,200}UPDATE blud_riwayat_simpan SET drive_file_id/.test(kLib),
    'terbalik = foto mengaku tercadang padahal Drive kosong')
  cek('Kegagalan per berkas dicatat, tidak dilempar',
    /catch \(e\) \{[\s\S]{0,220}gagal\+\+/.test(kLib),
    'kuota habis pada satu berkas tidak boleh membatalkan sisanya')

  cek('`cadangan-berkas.ts` bebas dependensi server',
    !/mysql2|googleapis|lib\/data\/db|services\/drive/.test(kBerkas),
    'ia dipakai komponen use client — satu impor server merobohkan rute dashboard')
}

// ─────────────────────────────────────────────────────────────────────────────
bab('D. Pagar route')
{
  const kBlud = kode(baca(RBLUD))
  const kCron = kode(baca(RCRON))

  cek('Route Pengaturan memeriksa sakelar maintenance', /bludMati\(session\.role\)/.test(kBlud),
    'tanpa ini `npm run check:killswitch` gagal (L72)')
  cek('…dan punya daftar perannya sendiri', /canCadangkanJson\(session\.role\)/.test(kBlud),
    'bukan menumpang canHapusVersi — melonggarkan satu tidak boleh melonggarkan yang lain')
  cek('…serta dibatasi laju', /bludRateLimit\(session\.userId, 'cadangan-json'/.test(kBlud))
  cek('Route cron dijaga cron secret', /verifyCronSecret\(/.test(kCron))
  cek('Cron mencatat audit SELALU, bukan hanya saat ada yang naik',
    !/if \([^)]*diunggah[^)]*\)[\s\S]{0,80}writeAuditLog/.test(kCron),
    '"cron berhenti" tidak boleh terlihat sama dengan "tidak ada yang perlu diunggah"')
}

// ─────────────────────────────────────────────────────────────────────────────
bab('E. Muat dari berkas — berhenti di form, dua layar')
{
  const kPgs = kode(baca(PGS))
  const kDpa = kode(baca(DPA))
  const kTbl = kode(baca(TOMBOL))

  cek('Tombolnya tidak pernah memanggil endpoint tulis',
    !/fetch\(/.test(kTbl),
    'ia memulangkan isi berkas lewat onMuat; yang menulis tetap tombol Simpan (L78/L80)')
  cek('Nilai input dikosongkan sebelum diproses',
    /e\.target\.value = ''[\s\S]{0,80}if \(!berkas\) return/.test(kTbl),
    'tanpa ini memilih berkas yang sama dua kali tidak memicu change')

  for (const [nama, k, jenis] of [['Pergeseran', kPgs, 'PERGESERAN'], ['DPA', kDpa, 'DPA']] as const) {
    cek(`Layar ${nama} memasang tombolnya`, new RegExp(`jenis="${jenis}" tahun=\\{tahun\\}`).test(k))
    cek(`…dikunci alasanKunciBorongan`, /alasanKunci=\{alasanKunciBorongan\}/.test(k),
      'ia mengganti SELURUH tabel, sederajat Form Baru')
    cek(`…menandai layar belum tersimpan`,
      /setRows\(recalc\w+\(data\.rows[\s\S]{0,120}setBelumTersimpan\(true\)/.test(k))
    cek(`…dan TIDAK memindahkan sasaran`,
      !/async function muatDariBerkas[\s\S]*?\n  \}/.exec(k)?.[0].match(/setPeriodeTulis|setVersi\(/),
      'menyalin mengganti ISI, tidak pernah sasaran (L80)')
    cek(`Jejak asal_berkas ikut body Simpan (${nama})`,
      /asal_berkas: asalBerkasRef\.current \?\? undefined,/.test(k))
    // L82: jejak yang tertinggal membuat audit berbohong pada simpanan berikutnya.
    // Dibandingkan dengan `asalSalinRef`, bukan dihitung sendiri: tiap jalur yang
    // mengganti baris memutuskan SEMUA jejak sekaligus — disetel atau dikosongkan.
    // Menghitung sendiri tidak bisa membedakan "lengkap" dari "kebetulan sama".
    const berkas = (k.match(/asalBerkasRef\.current\s*=/g) ?? []).length - 1  // -1: deklarasi useRef
    const salin  = (k.match(/asalSalinRef\.current\s*=/g) ?? []).length - 1
    cek(`Diputuskan di SEMUA jalur pengganti baris (${nama})`, berkas === salin && berkas > 0,
      `${berkas} titik vs ${salin} milik asal_salin`)
  }

  const kSkema = kode(baca('lib/blud/schemas.ts'))
  cek('AsalBerkasSchema terdaftar di KEDUA body schema',
    (kSkema.match(/asal_berkas:\s+AsalBerkasSchema\.optional\(\),/g) ?? []).length === 2)
  for (const [nama, p] of [['DPA', 'app/api/blud/dpa/route.ts'], ['Pergeseran', 'app/api/blud/pergeseran/route.ts']] as const) {
    const k = kode(baca(p))
    cek(`Route ${nama} menuliskannya ke audit`, /asal_berkas \? ` · dimuat dari berkas/.test(k),
      'tanpa ini tidak ada apa pun yang membedakannya dari pemulihan biasa')
  }
}

console.log(`\n${lulus} pemeriksaan LULUS · ${gagal} GAGAL`)
process.exit(gagal > 0 ? 1 : 0)
