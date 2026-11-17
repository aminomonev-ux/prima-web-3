// Regresi Kunci Periode di layar Detail Indikator Renaksi (laporan 2026-11-17: Matriks Bulanan terkunci, tetapi kisi
// Realisasi Bulanan & tombol ubah Triwulan di Detail Indikator tetap bisa diketik lalu Simpan ditolak server).
// npx tsx scripts/test-renaksi-kunci-layar.mts
import { readFileSync } from 'node:fs'
import { bulanTerkunci, kalimatKunci, triwulanTerkunci } from '../lib/renaksi/kunci-periode'

let lulus = 0
const gagal: string[] = []
function ok(nama: string, syarat: boolean, ket = '') {
  if (syarat) { lulus++; console.log(`  ok  ${nama}`) }
  else { gagal.push(nama); console.log(`FAIL  ${nama}${ket ? ' — ' + ket : ''}`) }
}
const kode = (p: string) => readFileSync(p, 'utf8').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '').replace(/\r\n/g, '\n')

console.log('A. Aturan')
ok('A1 terbuka (0): tidak ada bulan/triwulan terkunci', [...Array(12).keys()].every(i => !bulanTerkunci(i, 0)) && [1, 2, 3, 4].every(q => !triwulanTerkunci(q, 0)))
ok('A2 s.d. Sep: Jan–Sep terkunci, Okt–Des terbuka', [...Array(12).keys()].map(i => bulanTerkunci(i, 9)).join() === 'true,true,true,true,true,true,true,true,true,false,false,false')
ok('A3 triwulan terkunci bila SELURUH bulannya terkunci (s.d. Agu: TW I–II saja)', [1, 2, 3, 4].map(q => triwulanTerkunci(q, 8)).join() === 'true,true,false,false' && triwulanTerkunci(3, 9))
ok('A4 kalimat', kalimatKunci(9) === 'terkunci s.d. Sep' && kalimatKunci(0) === '')

console.log('\nB. Server memakai aturan yang sama')
const srv = kode('lib/data/rencana-aksi.ts')
ok('B1 updateQuarter menolak lewat triwulanTerkunci', srv.includes('if (triwulanTerkunci(quarter, lock)) throw new RaPeriodLockedError(lock);') && !srv.includes('quarter * 3 <= lock'))
ok('B2 realisasi bulanan menolak perubahan bulan terkunci lewat bulanTerkunci', srv.includes('if (bulanTerkunci(i, lock) && (months[i] ?? null) !== (existing[i] ?? null)) throw new RaPeriodLockedError(lock);'))

console.log('\nC. Layar Detail Indikator')
const md = kode('app/(dashboard)/rencana-aksi/_components/MainDashboard.tsx')
ok('C1 kunci dibaca untuk tahun yang dibuka', md.includes('const kunci = useKunciPeriode(selectedYear);'))
ok('C2 kisi bulan: bulan terkunci dimatikan + tooltip sebab', md.includes('const terkunciBln = bulanTerkunci(i, kunci);') && md.includes('disabled={!activeRow || terkunciBln}') && md.includes('realisasi ${bln} tidak bisa diubah'))
ok('C3 tombol ubah Triwulan dimatikan untuk triwulan terkunci', md.includes('disabled={!activeRow || triwulanTerkunci(q.id, kunci)}'))
ok('C4 keterangan "terkunci s.d." tampil', md.includes('{kunci > 0 && <span') && md.includes('{kalimatKunci(kunci)}'))
const hd = kode('app/(dashboard)/rencana-aksi/_components/Header.tsx')
ok('C5 Header memberi tahu layar sesudah kunci tersimpan (tanpa muat ulang)', /await apiSetLock\(selectedYear, lockBulan\);\s*beritahuKunciBerubah\(selectedYear, lockBulan\);/.test(hd))
const hook = kode('app/(dashboard)/rencana-aksi/_lib/kunci-periode.ts')
ok('C6 jawaban tahun lain tidak dipakai; kabar tahun lain diabaikan', hook.includes('return kunci.tahun === tahun ? kunci.bulan : 0;') && hook.includes('if (d?.tahun === tahun)'))

console.log(`\n${gagal.length ? 'GAGAL — ' : 'LULUS — '}${lulus} lulus, ${gagal.length} gagal`)
process.exit(gagal.length ? 1 : 0)
