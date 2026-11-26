// Regresi: pejabat penanda tangan BLUD — siapa membaca (Cetak), siapa mengubah (Pengaturan).
// Konsep: docs/konsep/blud/CONCEPT-blud-pejabat-penanda-tangan.md
//
//   npx tsx --env-file=.env.local scripts/test-blud-pejabat-cetak.mts
//
// A. Tabel peran: Program & Bendahara baca saja, Keuangan mengubah (K4/K5)
// B. Aturan layar Cetak: jawaban → keadaan → kalimat & Direktur yang tercetak
// C. Route: mode `untuk=cetak` dipagari sakelar BLUD + menu pencetak, Direktur saja (K1–K3)
// D. Layar: Cetak memuat sekali & mencetak yang ditampilkan; Pengaturan menyebut pengubahnya
// E. DB kotak pasir 2099: hanya baris DIREKTUR yang keluar
import { readFileSync } from 'node:fs'
import { izinMenu, peranPengubah, LABEL_PERAN_BLUD } from '../lib/blud/peran'
import { bacaJawabanDirektur, kalimatTtdCetak, viewBertandaTangan, direkturUntukBerkas } from '../lib/blud/ttd-cetak'

let lulus = 0, gagal = 0
function ok(nama: string, syarat: boolean, info = '') {
  if (syarat) { lulus++; console.log(`  ok  ${nama}`) }
  else { gagal++; console.log(`FAIL  ${nama}${info ? ` — ${info}` : ''}`) }
}
const kode = (p: string) => readFileSync(p, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')

console.log('\n── A. Tabel peran ────────────────────────────────────────────────')
ok('A1 Program: Pengaturan baca saja', izinMenu('PROGRAM', 'pengaturan') === 'LIHAT')
ok('A2 Bendahara: Pengaturan baca saja (tidak menetapkan PPK-nya sendiri)', izinMenu('PERBENDAHARAAN', 'pengaturan') === 'LIHAT')
ok('A3 Keuangan, Admin, Super Admin tetap mengubah',
  ['KEUANGAN', 'ADMIN', 'SUPER_ADMIN'].every(r => izinMenu(r, 'pengaturan') === 'EDIT'))
ok('A4 Program & Bendahara tetap mengubah menu kerjanya (DPA / Buku Kas)',
  izinMenu('PROGRAM', 'dpa') === 'EDIT' && izinMenu('PERBENDAHARAAN', 'buku-kas') === 'EDIT')
ok('A5 daftar pengubah diturunkan dari tabel', peranPengubah('pengaturan').join(',') === 'SUPER_ADMIN,ADMIN,KEUANGAN', peranPengubah('pengaturan').join(','))
ok('A6 pengecualian per akun tetap bisa lewat Pusat Akses (penimpa EDIT)', izinMenu('PROGRAM', 'pengaturan', 'EDIT') === 'EDIT')
ok('A7 tiap peran di tabel punya sebutan layar', peranPengubah('dpa').every(r => !!LABEL_PERAN_BLUD[r]))

console.log('\n── B. Aturan layar Cetak ─────────────────────────────────────────')
const ada = bacaJawabanDirektur(200, { ok: true, data: { nama: ' dr. Uji Direktur ', nip: '1980', pangkat: 'Pembina', jabatan_teks: 'Direktur RSJD' } })
ok('B1 jawaban berisi → Direktur lengkap (nama dirapikan, jabatan_teks → jabatan)',
  ada.keadaan === 'ada' && ada.direktur.nama === 'dr. Uji Direktur' && ada.direktur.jabatan === 'Direktur RSJD' && ada.direktur.nip === '1980')
ok('B2 data null / nama kosong → kosong', bacaJawabanDirektur(200, { ok: true, data: null }).keadaan === 'kosong'
  && bacaJawabanDirektur(200, { ok: true, data: { nama: '  ' } }).keadaan === 'kosong')
const g403 = bacaJawabanDirektur(403, { ok: false }), g503 = bacaJawabanDirektur(503, null)
ok('B3 403 / 503 → gagal dengan sebab yang berbeda', g403.keadaan === 'gagal' && g503.keadaan === 'gagal' && g403.sebab !== g503.sebab)
ok('B4 yang tercetak = yang dibaca; kosong/gagal → baris bergaris (null)',
  direkturUntukBerkas(ada)?.nama === 'dr. Uji Direktur' && direkturUntukBerkas({ keadaan: 'kosong' }) === null && direkturUntukBerkas(g403) === null && direkturUntukBerkas(null) === null)
const kAda = kalimatTtdCetak(ada, 2099), kKosong = kalimatTtdCetak({ keadaan: 'kosong' }, 2099), kGagal = kalimatTtdCetak(g503, 2099)
ok('B5 terisi: menyebut nama, jabatan, tahun — bukan peringatan', !kAda.peringatan && kAda.teks.includes('dr. Uji Direktur') && kAda.teks.includes('DIREKTUR RSJD') && kAda.teks.includes('2099'))
ok('B6 kosong: peringatan + akibat + jalan keluar', kKosong.peringatan && kKosong.teks.includes('belum diisi') && kKosong.teks.includes('baris tanda tangan kosong') && kKosong.teks.includes('Pengaturan'))
ok('B7 gagal: peringatan menyebut sebabnya', kGagal.peringatan && kGagal.teks.includes('modul BLUD sedang ditutup'))
ok('B8 view bertanda tangan: DPA, DPA Perubahan, Rekap PJ, Pergeseran penuh',
  ['dpa', 'dpaPerubahan', 'penanggungJawab'].every(v => viewBertandaTangan(v, false)) && viewBertandaTangan('rekapPergeseran', false))
ok('B9 Pergeseran tersaring & Master Akun tanpa tanda tangan', !viewBertandaTangan('rekapPergeseran', true) && !viewBertandaTangan('masterAkun', false))

console.log('\n── C. Route ──────────────────────────────────────────────────────')
{
  const R = kode('app/api/blud/pejabat/route.ts')
  const cetak = R.slice(R.indexOf('async function getDirekturUntukCetak'), R.indexOf('export async function GET'))
  const get = R.slice(R.indexOf('export async function GET'), R.indexOf('export async function POST'))
  ok('C1 mode cetak dipagari sakelar BLUD, bukan sakelar Realisasi (K3)', cetak.includes('await bludMati(session.role)') && !cetak.includes('realisasiMati'))
  ok('C2 boleh dibaca siapa pun yang membuka Cetak/DPA/Pergeseran/Pengaturan (K1)',
    cetak.includes("bolehLihatSalahSatu(session.userId, session.role, ['cetak', 'dpa', 'pergeseran', 'pengaturan'])"))
  ok('C3 mode cetak memulangkan getDirekturCetak saja (tanpa daftar lengkap)', cetak.includes('getDirekturCetak(parsed.data)') && !cetak.includes('listPejabat'))
  ok('C4 cabang cetak diputuskan SEBELUM pagar menu Pengaturan + sakelar Realisasi',
    get.indexOf("=== 'cetak') return getDirekturUntukCetak") > 0 && get.indexOf("=== 'cetak') return getDirekturUntukCetak") < get.indexOf('realisasiMati'))
  ok('C5 mode lama (daftar lengkap) tetap di balik Pengaturan + sakelar Realisasi (K2)',
    get.includes("bolehLihat(session.userId, session.role, 'pengaturan')") && get.includes('await realisasiMati(session.role)'))
  ok('C6 mode cetak dibatasi laju', cetak.includes("bludRateLimit(session.userId, 'view-pejabat', 60)"))
  const D = kode('lib/blud/pejabat-data.ts')
  const fn = D.slice(D.indexOf('export async function getDirekturCetak'), D.indexOf('export async function getPejabatCetak'))
  ok('C7 kueri hanya baris DIREKTUR', /WHERE tahun_anggaran = \$\{tahun\} AND jabatan = 'DIREKTUR'/.test(fn) && !/BENDAHARA|PPK/.test(fn))
}

console.log('\n── D. Layar ──────────────────────────────────────────────────────')
{
  const C = kode('app/(dashboard)/blud/cetak/cetak-client.tsx')
  ok('D1 Cetak membaca mode untuk=cetak, bukan daftar lengkap', C.includes('/api/blud/pejabat?untuk=cetak&tahun=') && !C.includes('/api/blud/pejabat?tahun='))
  ok('D2 dimuat sekali per tahun (efek bergantung [tahun])', /setTtd\(\{ tahun, info \}\)[\s\S]{0,120}\}, \[tahun\]\)/.test(C))
  ok('D3 unduhan tidak mengambil ulang — memakai Direktur yang ditampilkan',
    !C.includes('ambilDirektur') && C.includes('const direktur = direkturUntukBerkas(infoTtd)'))
  ok('D4 kedua tombol menunggu penanda tangan selesai dimuat', (C.match(/if \(ttdBelumSiap\(\)\) return/g) ?? []).length === 2)
  ok('D5 baris info di bawah tombol unduh', C.includes('kalimatTtdCetak(infoTtd, tahun)') && C.includes("k.peringatan ? ' tp-ingat' : ''"))
  const P = kode('components/blud/PejabatSpjPanel.tsx')
  ok('D6 Pengaturan menyebut pengubahnya dari tabel peran', P.includes("peranPengubah('pengaturan')") && P.includes('{KALIMAT_PENGUBAH}') && P.includes('Pusat Akses'))
}

console.log('\n── E. DB kotak pasir 2099 ────────────────────────────────────────')
{
  const { sql } = await import('../lib/data/db')
  const { getDirekturCetak } = await import('../lib/blud/pejabat-data')
  const TAHUN = 2099
  const lama = await sql`SELECT jabatan FROM blud_pejabat WHERE tahun_anggaran = ${TAHUN}` as unknown[]
  if (lama.length) {
    ok('E0 kotak pasir 2099 kosong (uji tidak menimpa isian orang)', false, `${lama.length} baris sudah ada`)
  } else {
    try {
      ok('E1 tahun tanpa pejabat → null', (await getDirekturCetak(TAHUN)) === null)
      await sql`INSERT INTO blud_pejabat (tahun_anggaran, jabatan, nama, nip, pangkat, jabatan_teks) VALUES
        (${TAHUN}, 'BENDAHARA', 'Uji Bendahara', '111', NULL, NULL),
        (${TAHUN}, 'PPK', 'Uji PPK', '222', NULL, NULL)`
      ok('E2 Bendahara & PPK terisi, Direktur belum → tetap null (tidak tertukar)', (await getDirekturCetak(TAHUN)) === null)
      await sql`INSERT INTO blud_pejabat (tahun_anggaran, jabatan, nama, nip, pangkat, jabatan_teks) VALUES
        (${TAHUN}, 'DIREKTUR', 'dr. Uji Direktur', '333', 'Pembina', 'Direktur RSJD')`
      const d = await getDirekturCetak(TAHUN)
      ok('E3 hanya Direktur yang keluar, lengkap', JSON.stringify(d) === JSON.stringify({ nama: 'dr. Uji Direktur', nip: '333', pangkat: 'Pembina', jabatan_teks: 'Direktur RSJD' }), JSON.stringify(d))
    } finally {
      await sql`DELETE FROM blud_pejabat WHERE tahun_anggaran = ${TAHUN}`
      ok('E4 kotak pasir dibersihkan', ((await sql`SELECT id FROM blud_pejabat WHERE tahun_anggaran = ${TAHUN}`) as unknown[]).length === 0)
    }
  }
}

console.log(`\n${lulus} lulus, ${gagal} gagal`)
process.exit(gagal ? 1 : 0)
