// scripts/test-blud-pratinjau-serapan.mts
// Penjaga regresi "Pratinjau Serapan" — Tahap 2, 2026-08-28.
//
// Bendahara mengisi realisasi Januari–Agustus dengan MENGETIK satu per satu;
// tidak ada jalur impor untuk transaksi. Pagar pagu menolak per transaksi, jadi
// rekening yang plafonnya kurang baru ketahuan di transaksi ke sekian. Layar ini
// memindahkan kesadaran itu ke depan.
//
// Yang dijaga, dan alasannya satu: layar ini MENJANJIKAN keputusan server.
// Kalau rumusnya menyimpang sedikit saja, ia bilang "aman" lalu transaksinya
// ditolak — persis kebingungan yang seharusnya dihapus.
//
//   A. Rumus kekurangan sama persis dengan `kunciDanPeriksaPagu`.
//   B. Dasar hitungnya serapan SETAHUN, bukan s/d bulan terpilih.
//   C. Urutan "paling mepet" tidak dikubur rekening berpagu nol.
//   D. Daftar siap tempel utuh.
//   E. Murni pembacaan — tidak ada jalur tulis yang ikut lahir.
//
// Jalankan: npx tsx scripts/test-blud-pratinjau-serapan.mts

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  hitungPratinjau, bandingMepet, akanMenembus, daftarPerluGeser,
  type BarisPratinjau, type BarisDihitung,
} from '../lib/blud/pratinjau-serapan'

const AKAR = join(import.meta.dirname, '..')
const baca = (p: string) => readFileSync(join(AKAR, p), 'utf8')

function kode(isi: string): string {
  return isi
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
}

const MODAL  = 'components/blud/PratinjauSerapanModal.tsx'
const HITUNG = 'lib/blud/pratinjau-serapan.ts'
const LAYAR  = 'app/(dashboard)/blud/realisasi/realisasi-client.tsx'
const SERVER = 'lib/blud/realisasi-data.ts'

let lulus = 0
let gagal = 0
function cek(nama: string, syarat: boolean, catatan = '') {
  if (syarat) { lulus++; console.log(`  ok   ${nama.padEnd(60)} ${catatan}`) }
  else        { gagal++; console.log(`  GAGAL ${nama.padEnd(60)} ${catatan}`) }
}
function bab(judul: string) { console.log(`\n── ${judul} ──`) }

const baris = (o: Partial<BarisPratinjau> & { anggaran_key: string }): BarisPratinjau => ({
  kode_rekening: o.anggaran_key,
  uraian:        o.anggaran_key,
  pagu:          0,
  terserap:      0,
  is_leaf:       true,
  ...o,
})

bab('A. Rumus kekurangan = rumus server')
{
  // Server: ditolak bila `terserap + nilai > pagu`, kekurangan = selisihnya.
  const [r] = hitungPratinjau([baris({ anggaran_key: 'A', pagu: 100_000, terserap: 0 })], { A: 500_000 })
  cek('kurang = terserap + rencana − pagu', r.kurang === 400_000, `${r.kurang}`)
  cek('hasil = terserap + rencana', r.hasil === 500_000)
  cek('sisaSetelah = pagu − hasil', r.sisaSetelah === -400_000)

  const [s] = hitungPratinjau([baris({ anggaran_key: 'B', pagu: 1_000_000, terserap: 600_000 })], { B: 300_000 })
  cek('Serapan yang sudah ada ikut dihitung', s.kurang === -100_000 && !akanMenembus(s), 'sisa 100rb')

  // Server memakai `>` telanjang, jadi PAS pagu itu lolos. Menandainya merah
  // di sini berarti menyuruh orang mengurus pergeseran yang tidak diperlukan.
  const [t] = hitungPratinjau([baris({ anggaran_key: 'C', pagu: 1_000_000, terserap: 400_000 })], { C: 600_000 })
  cek('Belanja PAS sebesar pagu tidak ditandai menembus', !akanMenembus(t), 'terserap+rencana = pagu')

  const [u] = hitungPratinjau([baris({ anggaran_key: 'D', pagu: 0, terserap: 0 })], { D: 1 })
  cek('Rekening berpagu nol menembus begitu diisi', akanMenembus(u))

  // Rumus server dipatok di sini juga: kalau ia berubah, layar ini WAJIB ikut,
  // dan tes ini yang mengingatkan.
  const srv = kode(baca(SERVER))
  cek('Server masih menolak dengan terserap + nilai > pagu',
    srv.includes('if (terserap + a.nilai > baris.pagu)'))
  cek('Server masih menghitung kekurangan yang sama',
    srv.includes('kekurangan: terserap + a.nilai - baris.pagu'))
  cek('Server masih menjumlah SETAHUN (tanpa saringan bulan)',
    /SUM\(nilai\)[\s\S]{0,160}WHERE tahun_anggaran = \$\{tahun\} AND anggaran_key = \$\{a\.anggaran_key\}\s*\n\s*FOR UPDATE/.test(srv))
}

bab('B. Dasar hitungnya serapan SETAHUN')
{
  const hitung = kode(baca(HITUNG))
  const modal  = kode(baca(MODAL))
  // Kolom `sisa` di layar Realisasi mengikuti BULAN yang dipilih. Memakainya di
  // sini melaporkan sisa yang lebih longgar dari yang server izinkan.
  cek('Tipe masukan tidak menerima kolom `sisa` per-bulan',
    !/interface BarisPratinjau[\s\S]{0,400}\bsisa\b/.test(hitung))
  cek('Sisa dihitung ulang dari pagu − terserap',
    hitung.includes('sisaSekarang: r.pagu - r.terserap'))
  cek('Modal tidak memakai r.sisa dari layar',
    !/\br\.sisa\b/.test(modal))

  // Hanya baris terbawah yang bisa menerima alokasi.
  const campur = hitungPratinjau([
    baris({ anggaran_key: 'induk', pagu: 5_000_000, is_leaf: false }),
    baris({ anggaran_key: 'anak',  pagu: 5_000_000 }),
  ], {})
  cek('Baris induk tidak ditawarkan', campur.length === 1 && campur[0].anggaran_key === 'anak')
}

bab('C. Urutan "paling mepet dulu"')
{
  const data = hitungPratinjau([
    baris({ anggaran_key: 'nol',    pagu: 0 }),
    baris({ anggaran_key: 'lega',   pagu: 900_000_000, terserap: 1_000_000 }),
    baris({ anggaran_key: 'mepet',  pagu: 2_000_000,   terserap: 1_900_000 }),
    baris({ anggaran_key: 'jebol',  pagu: 1_000_000,   terserap: 1_500_000 }),
  ], {})
  const urut = [...data].sort(bandingMepet).map(r => r.anggaran_key)

  cek('Yang sudah menembus paling atas', urut[0] === 'jebol', urut.join(' → '))
  // Inti perbaikannya: ratusan rekening berpagu nol pernah mengubur satu baris
  // yang benar-benar perlu dilihat, karena sisanya nol < sisa positif mana pun.
  cek('Rekening berpagu nol turun ke paling bawah', urut[urut.length - 1] === 'nol')
  // Sisa RELATIF, bukan rupiah: Rp 100rb dari pagu Rp 2jt lebih genting
  // daripada Rp 899jt dari Rp 900jt.
  cek('Sisa dinilai relatif terhadap pagunya', urut[1] === 'mepet' && urut[2] === 'lega')

  const diisi = hitungPratinjau([baris({ anggaran_key: 'nol', pagu: 0 })], { nol: 1 })
  cek('Berpagu nol naik ke atas begitu diisi angka', bandingMepet(diisi[0], data[1]) < 0)
}

bab('D. Daftar siap tempel')
{
  const jebol = hitungPratinjau([
    baris({ anggaran_key: 'A', kode_rekening: '5.1.01', uraian: 'Beras', pagu: 285_000_000 }),
    baris({ anggaran_key: 'B', kode_rekening: '5.1.02', uraian: 'Bulat', pagu: 100_000 }),
  ], { A: 300_000_000, B: 500_000 }).filter(akanMenembus)

  const teks = daftarPerluGeser(2026, '2026-08-28', jebol)
  const larik = teks.split('\n')

  cek('Menyebut tahun anggaran', larik[0].includes('2026'))
  cek('Menyebut versi pagu acuannya', larik[1].includes('28 Agu 2026'), 'bukan ISO mentah')
  // `.filter(Boolean)` pernah membuang baris kosong pemisahnya dan daftarnya
  // menempel jadi satu blok — ketahuan saat diuji di aplikasi, bukan dari kode.
  cek('Baris kosong pemisah tidak ikut terbuang',
    larik[2] === '' && larik.includes(''))
  cek('Yang kekurangannya terbesar di atas',
    larik[3].includes('5.1.01') && larik[4].includes('5.1.02'))
  cek('Tiap baris menyebut pagu, terserap, dan kekurangan',
    larik[3].includes('pagu Rp 285.000.000') && larik[3].includes('KURANG Rp 15.000.000'))
  cek('Ditutup total kekurangan', teks.trimEnd().endsWith('Total kekurangan: Rp 15.400.000'))

  const tanpaVersi = daftarPerluGeser(2026, null, jebol)
  cek('Tanpa versi, barisnya dilewati bukan dikosongkan',
    !tanpaVersi.includes('Pagu acuan') && tanpaVersi.split('\n')[1] === '')
}

bab('E. Murni pembacaan')
{
  const modal = kode(baca(MODAL))
  const layar = kode(baca(LAYAR))

  // Nol endpoint baru berarti nol pagar akses baru dan nol permukaan sakelar
  // maintenance yang harus dijaga (L72). Barisnya dipinjam dari layar Realisasi.
  cek('Modal tidak memanggil server sama sekali',
    !/fetch\(/.test(modal) && !/method:\s*'POST'/.test(modal))
  cek('Barisnya dioper dari layar, bukan diambil sendiri',
    /<PratinjauSerapanModal[\s\S]{0,200}rows=\{rows\}/.test(layar))
  cek('Tombolnya mati saat tahun belum punya pagu',
    /disabled=\{tanpaDpa \|\| rows\.length === 0\}/.test(layar))
  cek('Tombol mati membawa sebabnya', /data-tooltip="Coba angka belanja/.test(layar))
  // DILARANG window.confirm/alert (L58) — dan penyalinan wajib punya jalan
  // cadangan, karena Clipboard API bisa ditolak peramban.
  cek('Tidak memakai kotak bawaan peramban',
    !/window\.confirm|alert\(/.test(modal))
  cek('Penyalinan punya jalan cadangan yang bisa dipakai',
    modal.includes('setTeksSalin(teks)') && modal.includes('readOnly'))
  cek('Sorotan kotak cadangan lewat efek, bukan ref callback',
    /useEffect\(\(\) => \{[\s\S]{0,200}salinRef\.current\?\.select\(\)/.test(modal),
    'ref callback jalan tiap render — fokus akan direbut terus')
}

console.log(`\n${lulus} pemeriksaan LULUS · ${gagal} GAGAL`)
process.exit(gagal > 0 ? 1 : 0)

// Menjaga `BarisDihitung` tetap dipakai — kalau tipenya hilang, tes ikut merah.
export type _Dipakai = BarisDihitung
