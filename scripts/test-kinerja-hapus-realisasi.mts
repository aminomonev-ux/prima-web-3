#!/usr/bin/env npx tsx
// scripts/test-kinerja-hapus-realisasi.mts — tombol hapus di tab Realisasi hidup hanya untuk
// item yang benar-benar tidak dipakai (dihapus dari RKO versi terbaru + realisasi nol semua bulan).
// Aturannya: lib/kinerja/hapus-realisasi.ts. Jalankan: npx tsx scripts/test-kinerja-hapus-realisasi.mts
import { readFileSync } from 'node:fs'
import { alasanTakBisaHapus, itemTakTerpakai, buangItemRealisasi } from '../lib/kinerja/hapus-realisasi'
import { pelanggaranBulanTertutup } from '../lib/kinerja/banding-realisasi'
import type { RealRow } from '../app/(dashboard)/kinerja/_types'

let lulus = 0
const gagal: string[] = []
function ok(nama: string, syarat: unknown, ket = '') {
  if (syarat) { lulus++; console.log(`  ok  ${nama}`) }
  else { gagal.push(nama); console.log(`FAIL  ${nama}${ket ? ' — ' + ket : ''}`) }
}
const tanpaKomentar = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')

const baris = (cid: string, bulan: number, real_fisik = 0, real_keuangan = 0): RealRow => ({
  bulan, keterangan: `Belanja ${cid}`, program: 'P', kegiatan: 'K', subkegiatan: 'S', uraian_ssk: 'U',
  ssk_canonical_id: cid, pagu_awal: 0, target_fisik: 0, target_rp: 0, real_fisik, pct_fisik: 0,
  akum_target_fisik: 0, akum_target_rp: 0, akum_real_fisik: 0, akum_pct_fisik: 0, real_keuangan,
  pct_keuangan: 0, akum_keuangan: 0, akum_pct_keuangan: 0, deviasi_fisik: 0, deviasi_keuangan: 0,
} as RealRow)
const duaBelas = (cid: string, isi: Record<number, [number, number]> = {}) =>
  Array.from({ length: 12 }, (_, i) => baris(cid, i + 1, ...(isi[i + 1] ?? [0, 0])))

// AKTIF ada di RKO; NOLKAN ada di RKO sebagai baris dinol-kan; PPPK dihapus dari RKO & kosong;
// BEKAS dihapus dari RKO tapi pernah berealisasi Maret; FISIK hanya real fisik di Juni.
const ROWS = [
  ...duaBelas('AKTIF'), ...duaBelas('NOLKAN'), ...duaBelas('PPPK'), ...duaBelas('PPPK2'),
  ...duaBelas('BEKAS', { 3: [0, 1_250_000] }), ...duaBelas('FISIK', { 6: [500_000, 0] }),
  { ...baris('', 1), keterangan: 'Baris lama tanpa canonical' } as RealRow,
]
const K = { cidRko: new Set(['AKTIF', 'NOLKAN']), acuanTerbaru: true }

console.log('A. Kapan boleh dihapus')
ok('A1 dihapus dari RKO + nol semua bulan → boleh', alasanTakBisaHapus(ROWS, 'PPPK', K) === null)
ok('A2 masih di RKO → tidak, sarankan nol-kan', /Masih ada di RKO/.test(alasanTakBisaHapus(ROWS, 'AKTIF', K) ?? ''))
ok('A3 dinol-kan di RKO masih dihitung ADA (nol-kan cara resmi menonaktifkan)', /Masih ada di RKO/.test(alasanTakBisaHapus(ROWS, 'NOLKAN', K) ?? ''))
const aBekas = alasanTakBisaHapus(ROWS, 'BEKAS', K) ?? ''
ok('A4 pernah berealisasi → tidak, bulan & nominalnya disebut', /Maret/.test(aBekas) && /1\.250\.000/.test(aBekas), aBekas)
ok('A5 real fisik saja juga dihitung berealisasi', /Juni/.test(alasanTakBisaHapus(ROWS, 'FISIK', K) ?? ''))
ok('A6 acuan versi arsip → tidak (versi terkunci hanya-baca)', /diarsipkan/.test(alasanTakBisaHapus(ROWS, 'PPPK', { ...K, acuanTerbaru: false }) ?? ''))
ok('A7 tanpa canonical → tidak bisa dipastikan', /tanpa identitas/.test(alasanTakBisaHapus(ROWS, '', K) ?? ''))
// RKO kosong di layar bisa berarti belum dimuat: semua item akan tampak "tidak ada di RKO".
ok('A8 RKO acuan kosong/belum dimuat → tidak', /kosong atau belum dimuat/.test(alasanTakBisaHapus(ROWS, 'PPPK', { ...K, cidRko: new Set() }) ?? ''))
ok('A9 nilai yang BARU diketik (belum tersimpan) ikut dihitung', alasanTakBisaHapus([...duaBelas('PPPK', { 9: [0, 1] })], 'PPPK', K) !== null)

console.log('B. Borongan & membuang')
ok('B1 daftar item tak terpakai: hanya PPPK & PPPK2, urut kemunculan', itemTakTerpakai(ROWS, K).join() === 'PPPK,PPPK2', itemTakTerpakai(ROWS, K).join())
const sisa = buangItemRealisasi(ROWS, new Set(['PPPK']))
ok('B2 membuang SEMUA bulan item itu', !sisa.some(r => r.ssk_canonical_id === 'PPPK') && sisa.length === ROWS.length - 12)
ok('B3 item lain tidak tersentuh', sisa.filter(r => r.ssk_canonical_id === 'PPPK2').length === 12 && sisa.some(r => r.ssk_canonical_id === ''))

console.log('C. Bulan tertutup tidak menghalangi baris nol')
// Pagar server yang sama dengan Simpan: baris bernilai nol yang hilang dari bulan tertutup tidak
// mengubah angka yang sudah dilaporkan, jadi bukan pelanggaran. Itu sebabnya syaratnya "nol semua bulan".
ok('C1 buang item nol di bulan tertutup → tidak ada pelanggaran', pelanggaranBulanTertutup(ROWS, sisa, new Set([1, 2, 3])).length === 0)
ok('C2 (pembanding) buang item berealisasi di bulan tertutup → pelanggaran',
  pelanggaranBulanTertutup(ROWS, buangItemRealisasi(ROWS, new Set(['BEKAS'])), new Set([3])).length > 0)

console.log('D. Statis: tab Realisasi')
const rt = tanpaKomentar(readFileSync(new URL('../app/(dashboard)/kinerja/_tabs/RealisasiTab.tsx', import.meta.url), 'utf8'))
ok('D1 tombol hapus tidak lagi mati permanen', !/<button\s+disabled\s+onClick=\{\(\) => toast\.info\('Hapus dimatikan/.test(rt) && !rt.includes('🗑'))
ok('D2 tombol per baris memakai aturan lib + DeleteButton', /alasanTakBisaHapus\(realisasiRows, row\.ssk_canonical_id \|\| '', konteksHapus\)/.test(rt) && /<DeleteButton disabled=\{!!alasan\}/.test(rt))
ok('D3 cidRko dari SEMUA baris RKO acuan (termasuk dinol-kan), bukan petaHidrasi',
  /cidRko: new Set\(sskRows\.map\(s => s\.canonical_id \|\| ''\)\.filter\(Boolean\)\)/.test(rt))
ok('D4 acuan arsip = tidak boleh', /acuanTerbaru: !versiLocked/.test(rt))
ok('D5 diperiksa ulang pada isi terbaru sebelum dibuang', /buangItemRealisasi\(p,\s*new Set\(itemTakTerpakai\(p, konteksHapus\)\.filter\(c => pilih\.has\(c\)\)\)\)/.test(rt))
ok('D6 tombol borongan di spanduk yatim', /onClick=\{\(\) => hapusItem\(itemHapus\)\}/.test(rt))
ok('D7 dikonfirmasi dulu (danger)', /variant: 'danger',\s*confirmLabel: 'Hapus'/.test(rt))

console.log(`\n${lulus} lulus, ${gagal.length} gagal`)
if (gagal.length) { console.log(gagal.map(g => `  - ${g}`).join('\n')); process.exit(1) }
process.exit(0)
