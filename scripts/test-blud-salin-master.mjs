// Uji detektor "Salin ke Data Induk" — baris DPA → Kode Besar / Master Akun.
//   node scripts/test-blud-salin-master.mjs
//
// TIDAK menyentuh DB. Yang diuji: apakah pemindai bisa membedakan kerangka
// (Kode Besar) dari kode rekening (Master Akun) TANPA bergantung pada titik di
// dalam kode — karena berkas nyata memakai dua konvensi, `5.1.02` dan `510199`.
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outDir = path.join(repo, 'node_modules', '.cache', 'blud-salin-master-test')

fs.mkdirSync(outDir, { recursive: true })
// `salin-master.ts` sengaja tanpa impor sama sekali, jadi tsc telanjang cukup —
// tidak perlu mendaftar rantai alias `@/…` seperti harness hapus-versi.
execSync(
  `npx tsc "${path.join(repo, 'lib/blud/salin-master.ts')}"`
  + ` --outDir "${outDir}" --rootDir "${repo}" --module commonjs --target es2020 --skipLibCheck`,
  { cwd: repo, stdio: 'pipe' },
)

const { pindaiBarisDpa, gabungInduk, saringIndukKodeBesar, normalKode, kodeIndukCocok } =
  require(path.join(outDir, 'lib/blud/salin-master.js'))

let gagal = 0
let jalan = 0
function periksa(nama, benar, tambahan = '') {
  jalan++
  if (!benar) gagal++
  console.log(`${benar ? '  ok  ' : ' GAGAL'} ${nama.padEnd(62)} ${tambahan}`)
}

const baris = (row_id, parent_id, kode, uraian, tipe_baris, tambahan = {}) => ({
  row_id, parent_id, kode_rekening: kode, uraian, tipe_baris,
  vol: null, satuan: null, harga: null, ...tambahan,
})
const kosong = { masterAkun: [], kodeBesar: [] }
const cari = (h, kode) => h.kandidat.find(k => k.kode === kode)

// ── A. Pohon bertitik — bentuk baku DPA provinsi ────────────────────────────
console.log('── A. Kode bertitik (5.1.02.01.0026) ──')

const pohonTitik = [
  baris('a1', null, '5', 'BELANJA', 'GRANDMASTER'),
  baris('a2', 'a1', '5.1', 'BELANJA OPERASI', 'MASTER'),
  baris('a3', 'a2', '5.1.02', 'Belanja Barang dan Jasa', 'CHILD'),
  baris('a4', 'a3', '5.1.02.01.0026', 'Belanja Alat Tulis Kantor', 'LEADER'),
  baris('a5', 'a4', '', 'Kertas HVS A4', 'MEMBER', { vol: 10, satuan: 'rim', harga: 50000 }),
]
const hA = pindaiBarisDpa(pohonTitik, kosong)

periksa('garis rekening = panjang kode terpanjang yang tak beranak', hA.garisRekening === 10, String(hA.garisRekening))
periksa('contoh garis menunjuk baris rekening', hA.contohGaris?.kode === '5.1.02.01.0026', hA.contohGaris?.uraian ?? '—')
periksa('"5" → Kode Besar L1 tanpa induk',
  cari(hA, '5')?.tujuan === 'KODE_BESAR' && cari(hA, '5')?.level === 'L1' && cari(hA, '5')?.parentKode === null)
periksa('"5.1" → Kode Besar L2, induk "5"',
  cari(hA, '5.1')?.level === 'L2' && cari(hA, '5.1')?.parentKode === '5')
periksa('"5.1.02" → Kode Besar L2.1, induk "5.1"',
  cari(hA, '5.1.02')?.level === 'L2.1' && cari(hA, '5.1.02')?.parentKode === '5.1')
periksa('"5.1.02.01.0026" → Master Akun',
  cari(hA, '5.1.02.01.0026')?.tujuan === 'MASTER_AKUN' && cari(hA, '5.1.02.01.0026')?.level === null)
periksa('baris rincian tanpa kode tidak ikut', hA.kandidat.length === 4, `${hA.kandidat.length} kandidat`)
periksa('semuanya yakin — tiga sinyal sepakat', hA.kandidat.every(k => k.yakin))

// ── B. Pohon tanpa titik — pertanyaan yang memicu perubahan rancangan ───────
console.log('\n── B. Kode tanpa titik (510199) ──')

const pohonPolos = [
  baris('b1', null, '5', 'BELANJA', 'GRANDMASTER'),
  baris('b2', 'b1', '51', 'BELANJA OPERASI', 'MASTER'),
  baris('b3', 'b2', '5102', 'Belanja Barang dan Jasa', 'CHILD'),
  baris('b4', 'b3', '510199', 'Belanja ATK', 'LEADER'),
  baris('b5', 'b4', '', 'Kertas HVS A4', 'MEMBER', { vol: 10, satuan: 'rim', harga: 50000 }),
]
const hB = pindaiBarisDpa(pohonPolos, kosong)

periksa('garis rekening terbaca walau tanpa titik', hB.garisRekening === 6, String(hB.garisRekening))
periksa('"5" → Kode Besar L1', cari(hB, '5')?.level === 'L1')
periksa('"51" → Kode Besar L2, induk "5"', cari(hB, '51')?.level === 'L2' && cari(hB, '51')?.parentKode === '5')
periksa('"5102" → Kode Besar L2.1, induk "51"', cari(hB, '5102')?.level === 'L2.1' && cari(hB, '5102')?.parentKode === '51')
periksa('"510199" → Master Akun', cari(hB, '510199')?.tujuan === 'MASTER_AKUN')
periksa('semuanya yakin tanpa satu pun titik', hB.kandidat.every(k => k.yakin))

// Inti pertanyaannya: aturan ruas mati HARUS salah di berkas ini. Kalau baris
// ini gagal, pengujiannya yang keliru — bukan detektornya.
periksa('…dan aturan lama "≤3 ruas" memang buta di sini',
  '510199'.split('.').length === 1 && '5'.split('.').length === 1)

// ── C. Tangga meleset — semua dilabeli CHILD oleh parser "posisi" ───────────
console.log('\n── C. Tangga tipe_baris meleset ──')

const pohonMeleset = [
  baris('c1', null, '5', 'BELANJA', 'CHILD'),
  baris('c2', 'c1', '51', 'BELANJA OPERASI', 'CHILD'),
  baris('c3', 'c2', '510199', 'Belanja ATK', 'CHILD'),
  baris('c4', 'c3', '', 'Kertas HVS', 'MEMBER', { vol: 2, satuan: 'rim', harga: 50000 }),
]
const hC = pindaiBarisDpa(pohonMeleset, kosong)

periksa('bentuk pohon + panjang kode mengalahkan tangga yang salah',
  cari(hC, '510199')?.tujuan === 'MASTER_AKUN')
periksa('ketidaksepakatan ditandai, tidak dicentang otomatis', cari(hC, '510199')?.yakin === false)
periksa('catatan menyebut tingkat yang membangkang',
  (cari(hC, '510199')?.catatan ?? []).some(c => c.includes('CHILD')),
  cari(hC, '510199')?.catatan?.[0] ?? '—')
periksa('yang di atasnya tetap terbaca Kode Besar', cari(hC, '5')?.tujuan === 'KODE_BESAR')

// Panjang kode harus JADI penentu, bukan hiasan: di sini tangga bilang Kode Besar
// dan bentuk pohon bilang Master Akun (kerangka yang belum punya anak berkode).
// Tanpa sinyal panjang, imbang 1-1 jatuh ke Master Akun dan "5.1" salah tempat.
const pohonKerangkaKosong = [
  baris('e1', null, '5', 'BELANJA', 'GRANDMASTER'),
  baris('e2', 'e1', '5.1', 'BELANJA OPERASI', 'CHILD'),
  baris('e3', 'e2', '', 'Belum dirinci', 'MEMBER', { vol: 1, satuan: 'paket', harga: 1000 }),
  baris('e4', 'e1', '5.1.02.01.0026', 'Belanja ATK', 'LEADER'),
  baris('e5', 'e4', '', 'Kertas', 'MEMBER', { vol: 1, satuan: 'rim', harga: 50000 }),
]
const hKerangka = pindaiBarisDpa(pohonKerangkaKosong, kosong)
periksa('panjang kode memenangkan kerangka yang belum punya anak berkode',
  cari(hKerangka, '5.1')?.tujuan === 'KODE_BESAR', cari(hKerangka, '5.1')?.tujuan)
periksa('…dan levelnya tetap terbaca dari kedudukan di pohon',
  cari(hKerangka, '5.1')?.level === 'L2' && cari(hKerangka, '5.1')?.parentKode === '5')

// ── C2. Rantai dalam — bentuk DPA sungguhan (RSJD 2026 berantai sampai L7.1) ─
// Tanpa langit-langit tiga tingkat, 131 dari 259 kode berkas asli terbaca sebagai
// kerangka dan diratakan semua ke L2.1. Kode Besar memang cuma punya L1/L2/L2.1.
console.log('\n── C2. Langit-langit tiga tingkat ──')

const rantaiDalam = [
  baris('f01', null, '', 'BELANJA DAERAH', 'GRANDMASTER'),
  baris('f02', 'f01', '5.1', 'BELANJA OPERASI BLUD', 'MASTER'),
  baris('f03', 'f02', '5.1.01.99', 'BELANJA PEGAWAI', 'CHILD'),
  baris('f04', 'f03', '5.1.01.99.99', 'BELANJA PEGAWAI BLUD', 'LEADER'),
  baris('f05', 'f04', '5.1.01.99.99.999', 'BELANJA PEGAWAI BLUD', 'MEMBER'),
  baris('f06', 'f05', '5.1.01.99.99.999.01', 'BELANJA GAJI DAN TUNJANGAN ASN', 'PLETON-LEADER'),
  baris('f07', 'f06', '5.1.01.99.99.999.01.01', 'Belanja Gaji pokok ASN', 'PLETON-MEMBER',
    { vol: 12, satuan: 'bulan', harga: 1000000 }),
]
const hDalam = pindaiBarisDpa(rantaiDalam, kosong)
const kbDalam = hDalam.kandidat.filter(k => k.tujuan === 'KODE_BESAR')

periksa('hanya tiga tingkat teratas yang jadi Kode Besar',
  kbDalam.length === 3, kbDalam.map(k => `${k.kode}=${k.level}`).join(' '))
periksa('tingkatnya L1 → L2 → L2.1 berurutan',
  kbDalam[0]?.level === 'L1' && kbDalam[1]?.level === 'L2' && kbDalam[2]?.level === 'L2.1')
periksa('induk berkode teratas jadi L1 walau ada leluhur tanpa kode',
  kbDalam[0]?.kode === '5.1' && kbDalam[0]?.parentKode === null)
periksa('tiga baris di bawahnya semuanya Master Akun',
  hDalam.kandidat.filter(k => k.tujuan === 'MASTER_AKUN').length === 3,
  hDalam.kandidat.filter(k => k.tujuan === 'MASTER_AKUN').map(k => k.kode).join(' '))
// Langit-langit itu fakta struktural, bukan pendapat: baris sedalam ini tidak punya
// tujuan lain. Menandainya ragu berarti ratusan kotak centang harus dicentang tangan
// — dan veto vol/harga pun tidak perlu disebut lagi karena tujuannya sudah tunggal.
periksa('yang kena langit-langit tercentang sendiri, tanpa catatan ragu',
  hDalam.kandidat.filter(k => k.tujuan === 'MASTER_AKUN').every(k => k.yakin && !k.catatan.length))

// Langit-langit memutus SEBELUM penimpaan dibaca, jadi "pindah ke Kode Besar" pada
// baris sedalam ini tidak akan melakukan apa pun. Layar wajib menyembunyikan
// tombolnya — tombol mati lebih membingungkan daripada tombol yang tidak ada.
periksa('baris di bawah langit-langit menandai dirinya tak bisa ke Kode Besar',
  hDalam.kandidat.filter(k => k.tujuan === 'MASTER_AKUN').every(k => k.bisaKeKodeBesar === false))
periksa('tiga tingkat teratas tetap boleh dipindah',
  kbDalam.every(k => k.bisaKeKodeBesar === true))
periksa('…dan penimpaan pada baris terlalu dalam memang diabaikan',
  pindaiBarisDpa(rantaiDalam, kosong, { '5.1.01.99.99.999': 'KODE_BESAR' })
    .kandidat.find(k => k.kode === '5.1.01.99.99.999')?.tujuan === 'MASTER_AKUN')

// Kalau akarnya SUDAH ada di tabel (seed `5.X`), slot L1 terpakai dan cabangnya
// mulai dari L2 — tersisa dua slot, bukan tiga. Ini bukan hiasan: `buildDpaRows‑
// FromKodeBesar` menyambungkan L2 ke L1 lewat kecocokan kode dan MENGABAIKAN
// `parent_kode`, jadi dua L2 tidak pernah bisa bersarang. Memberi tingkat L2 pada
// baris yang seharusnya cucu membuatnya mendarat sebagai saudara, bukan anak.
console.log('\n── C3. Akar sudah ada di tabel ──')

const hAkar = pindaiBarisDpa(rantaiDalam, {
  masterAkun: [],
  kodeBesar: [{ kode: '5.X', uraian: 'Belanja Daerah', level: 'L1' }],
})
const kbAkar = hAkar.kandidat.filter(k => k.tujuan === 'KODE_BESAR')

periksa('slot bergeser: cuma dua baris yang jadi Kode Besar',
  kbAkar.length === 2, kbAkar.map(k => `${k.kode}=${k.level}`).join(' '))
periksa('tidak ada L1 baru — akar tabel yang dipakai',
  kbAkar.every(k => k.level !== 'L1'))
periksa('L2 menyebut akar tabel sebagai induknya',
  kbAkar[0]?.level === 'L2' && kbAkar[0]?.parentKode === '5.X')
periksa('L2.1 menyebut L2 di atasnya',
  kbAkar[1]?.level === 'L2.1' && kbAkar[1]?.parentKode === '5.1')
periksa('induk milik tabel tidak bikin barisnya dibuang sebagai yatim',
  saringIndukKodeBesar(kbAkar, [{ kode: '5.X', uraian: 'Belanja Daerah', level: 'L1' }]).yatim.length === 0)
periksa('satu baris turun ke Master Akun karena slotnya habis',
  hAkar.kandidat.filter(k => k.tujuan === 'MASTER_AKUN').length === 4)

// Kode sampah bisa naik jadi akar kedua — di berkas 2026 pemicunya satu baris
// rincian yang kolom kodenya diisi "0". Akar kedua melahirkan GRANDMASTER kedua
// saat "Form Baru" ditekan, jadi ia harus ditandai dan tidak boleh tercentang.
const pohonAkarLiar = [
  baris('g1', null, '5.1', 'BELANJA OPERASI BLUD', 'MASTER'),
  baris('g2', 'g1', '5.1.01', 'BELANJA PEGAWAI', 'CHILD'),
  baris('g3', null, '0', 'Biaya jasafilm badge', 'CHILD'),
]
const hLiar = pindaiBarisDpa(pohonAkarLiar, {
  masterAkun: [],
  kodeBesar: [{ kode: '5.X', uraian: 'Belanja Daerah', level: 'L1' }],
})
periksa('kode yang tak cocok akar mana pun ditandai akar baru',
  (cari(hLiar, '0')?.catatan ?? []).some(c => c.includes('akar baru')),
  cari(hLiar, '0')?.level ?? '—')
periksa('…dan karena itu tidak yakin, jadi tidak tercentang otomatis',
  cari(hLiar, '0')?.yakin === false)
periksa('yang cocok akar tabel tidak ikut kena peringatan',
  (cari(hLiar, '5.1')?.catatan ?? []).every(c => !c.includes('akar baru')))
// Tanpa akar tersimpan, berkasnya memang WAJIB menyumbang akarnya sendiri —
// peringatannya justru salah kalau muncul di situ.
periksa('tanpa akar tersimpan, L1 dari berkas bukan hal aneh',
  (pindaiBarisDpa(pohonAkarLiar, kosong).kandidat.find(k => k.kode === '5.1')?.catatan ?? [])
    .every(c => !c.includes('akar baru')))

// ── D. Kode kembar di dalam satu berkas ─────────────────────────────────────
console.log('\n── D. Kode kembar ──')

const pohonKembar = [
  baris('d1', null, '5', 'BELANJA', 'GRANDMASTER'),
  baris('d2', 'd1', '510199', 'Belanja ATK', 'LEADER'),
  baris('d3', 'd1', '510199', 'Belanja ATK', 'LEADER'),
  baris('d4', 'd1', '510200', 'Belanja Cetak', 'LEADER'),
  baris('d5', 'd1', '510200', 'Belanja Penggandaan', 'LEADER'),
]
const hD = pindaiBarisDpa(pohonKembar, kosong)

periksa('kode kembar jadi satu kandidat', hD.kandidat.filter(k => k.kode === '510199').length === 1)
periksa('jumlah pemakaian dihitung', cari(hD, '510199')?.pakai === 2, String(cari(hD, '510199')?.pakai))
periksa('uraian berbeda untuk kode sama → tidak yakin', cari(hD, '510200')?.yakin === false)
periksa('…dan uraian pertama yang dipakai', cari(hD, '510200')?.uraian === 'Belanja Cetak')
periksa('uraian seragam tetap yakin', cari(hD, '510199')?.yakin === true)

// ── E. Beda dengan isi tabel yang sudah ada ─────────────────────────────────
console.log('\n── E. Selisih dengan data induk tersimpan ──')

const hE = pindaiBarisDpa(pohonPolos, {
  masterAkun: [{ kode: '510199', uraian: 'Belanja ATK' }],
  kodeBesar:  [{ kode: '5', uraian: 'BELANJA DAERAH' }],
})

periksa('isi sama persis tidak ditawarkan lagi', cari(hE, '510199') === undefined)
periksa('…dan dihitung sebagai sudah ada', hE.sudahAda === 1, String(hE.sudahAda))
periksa('uraian berbeda muncul sebagai BEDA_URAIAN', cari(hE, '5')?.status === 'BEDA_URAIAN')
periksa('uraian lama dibawa untuk ditampilkan', cari(hE, '5')?.uraianLama === 'BELANJA DAERAH')
periksa('sisanya tetap BARU', cari(hE, '5102')?.status === 'BARU')

const hE2 = pindaiBarisDpa(pohonPolos, { masterAkun: [], kodeBesar: [{ kode: '9.9', uraian: 'Sisa lama' }] })
periksa('Kode Besar lama yang tak dipakai berkas dilaporkan',
  hE2.kodeBesarTakTerpakai.length === 1 && hE2.kodeBesarTakTerpakai[0] === '9.9')

// ── F. Baris yang ditahan, dan anaknya yang ikut jatuh ──────────────────────
console.log('\n── F. Baris ditahan + induk yang ikut hilang ──')

const pohonTahan = [
  baris('f1', null, '5', '', 'GRANDMASTER'),
  baris('f2', 'f1', '51', 'BELANJA OPERASI', 'MASTER'),
  baris('f3', 'f2', '510201', 'Belanja ATK', 'LEADER'),
  baris('f4', 'f3', '', 'Kertas', 'MEMBER', { vol: 1, satuan: 'rim', harga: 1000 }),
]
const hF = pindaiBarisDpa(pohonTahan, kosong)

periksa('baris tanpa uraian ditahan',
  hF.ditahan.some(d => d.kode === '5' && d.alasan.includes('tanpa uraian')))
periksa('anak dari induk yang ditahan ikut ditahan',
  hF.ditahan.some(d => d.kode === '51' && d.alasan.includes('induk')),
  hF.ditahan.map(d => d.kode).join(','))
periksa('yang ditahan tidak ikut jadi kandidat',
  !cari(hF, '5') && !cari(hF, '51'))
periksa('baris rekening di bawahnya tetap lolos', cari(hF, '510201')?.tujuan === 'MASTER_AKUN')

const pohonPanjang = [
  baris('g1', null, '5', 'BELANJA', 'GRANDMASTER'),
  baris('g2', 'g1', '5'.repeat(70), 'Kode kepanjangan', 'LEADER'),
]
periksa('kode > 64 karakter ditahan',
  pindaiBarisDpa(pohonPanjang, kosong).ditahan.some(d => d.alasan.includes('64')))

// ── G. Veto vol/satuan/harga ────────────────────────────────────────────────
console.log('\n── G. Veto vol/satuan/harga ──')

const pohonVeto = [
  baris('h1', null, '5', 'BELANJA', 'GRANDMASTER'),
  baris('h2', 'h1', '51', 'Rincian berkode', 'MASTER', { vol: 3, satuan: 'unit', harga: 250000 }),
]
const hG = pindaiBarisDpa(pohonVeto, kosong)

periksa('baris berangka tidak pernah jadi Kode Besar', cari(hG, '51')?.tujuan === 'MASTER_AKUN')
periksa('catatan menyebut alasannya',
  (cari(hG, '51')?.catatan ?? []).some(c => c.includes('vol/satuan/harga')))
periksa('veto tidak ikut membuat yakin — orangnya yang memutuskan',
  cari(hG, '51')?.yakin === false)

// ── H. Penggabungan ke daftar induk (endpoint induk = replace-all) ──────────
console.log('\n── H. gabungInduk ──')

const adaSekarang = [
  { kode: '5', uraian: 'BELANJA DAERAH', level: 'L1', parent_kode: null },
  { kode: '9.9', uraian: 'Sisa lama', level: 'L2', parent_kode: '5' },
]
const gabung = gabungInduk(
  adaSekarang,
  [
    { kode: '5', uraian: 'BELANJA', status: 'BEDA_URAIAN', level: 'L1', parentKode: null },
    { kode: '51', uraian: 'BELANJA OPERASI', status: 'BARU', level: 'L2', parentKode: '5' },
  ],
  k => ({ kode: k.kode, uraian: k.uraian, level: k.level, parent_kode: k.parentKode }),
)

periksa('baris lama yang tak disentuh tetap ada', gabung.some(r => r.kode === '9.9'))
periksa('BEDA_URAIAN diperbarui di tempat, urutan tidak bergeser',
  gabung[0].kode === '5' && gabung[0].uraian === 'BELANJA')
periksa('BARU ditempel di ekor', gabung[gabung.length - 1].kode === '51')
periksa('tidak ada baris yang hilang', gabung.length === 3, `${gabung.length} baris`)

// ── I. Yatim berantai saat centang induk dilepas ────────────────────────────
console.log('\n── I. saringIndukKodeBesar ──')

const rantai = [
  { kode: '5', uraian: 'A', tujuan: 'KODE_BESAR', level: 'L1', parentKode: null },
  { kode: '51', uraian: 'B', tujuan: 'KODE_BESAR', level: 'L2', parentKode: '5' },
  { kode: '5102', uraian: 'C', tujuan: 'KODE_BESAR', level: 'L2.1', parentKode: '51' },
  { kode: '510299', uraian: 'D', tujuan: 'MASTER_AKUN', level: null, parentKode: null },
]
const penuh = saringIndukKodeBesar(rantai, [])
periksa('rantai utuh lolos semua', penuh.kirim.length === 4 && penuh.yatim.length === 0)

const tanpaAkar = saringIndukKodeBesar(rantai.slice(1), [])
periksa('induk dilepas → anak DAN cucu ikut gugur',
  tanpaAkar.yatim.length === 2 && tanpaAkar.kirim.length === 1,
  `kirim ${tanpaAkar.kirim.length} · yatim ${tanpaAkar.yatim.length}`)
periksa('yang gugur hanya Kode Besar, Master Akun tidak terpengaruh',
  tanpaAkar.kirim[0].tujuan === 'MASTER_AKUN')
periksa('induk yang sudah ada di tabel menyelamatkan anaknya',
  saringIndukKodeBesar(rantai.slice(1), [{ kode: '5', uraian: 'A' }]).yatim.length === 0)

// ── J. Normalisasi kode ─────────────────────────────────────────────────────
console.log('\n── J. normalKode ──')

periksa('titik dibuang', normalKode('5.1.02') === '5102')
periksa('spasi & strip ikut dibuang', normalKode('5 . 1 - 02') === '5102')
periksa('huruf dipertahankan', normalKode('5.X') === '5X')
periksa('tanpa pemisah tidak berubah', normalKode('510199') === '510199')

// ── K. Pencocokan induk yang dipakai "Form Baru" ────────────────────────────
// Dipakai `buildDpaRowsFromKodeBesar` untuk mencari L1 milik sebuah L2. Kalau
// gagal, barisnya tersimpan di `kode_besar` tapi tidak pernah muncul di form —
// dan justru kode tanpa titik hasil salinan inilah yang paling rawan.
console.log('\n── K. kodeIndukCocok ──')

periksa('seed lama: "5.X" tetap mengasuh "5.1"', kodeIndukCocok('5.X', '5.1'))
periksa('tanpa titik: "5" mengasuh "51"', kodeIndukCocok('5', '51'))
periksa('tanpa titik: "5" mengasuh "5102"', kodeIndukCocok('5', '5102'))
periksa('bertitik: "5" mengasuh "5.1"', kodeIndukCocok('5', '5.1'))
periksa('bukan induk: "6" tidak mengasuh "51"', !kodeIndukCocok('6', '51'))
periksa('bukan induk: "5.X" tidak mengasuh "6.1"', !kodeIndukCocok('5.X', '6.1'))
// Saudara sekandung tanpa titik: "51" dan "52" sama panjang dan tidak saling
// berawalan — persis kasus yang akan salah kalau cocok-awalan dipasang tanpa
// syarat "anak harus lebih panjang".
periksa('saudara tanpa titik: "51" tidak mengasuh "52"', !kodeIndukCocok('51', '52'))
periksa('kode kosong tidak pernah jadi induk', !kodeIndukCocok('', '51'))

console.log(gagal === 0 ? `\n${jalan} pemeriksaan LULUS` : `\n${gagal} dari ${jalan} pemeriksaan GAGAL`)
process.exit(gagal === 0 ? 0 : 1)
