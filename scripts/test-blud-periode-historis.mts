// scripts/test-blud-periode-historis.mts
// Penjaga regresi "versi historis DPA & Pergeseran" — aplikasi mulai dipakai di
// tengah tahun, bulan-bulan sebelumnya diisi belakangan sebagai arsip.
//
// Yang dijaga:
//   A. `akhirBulan` — kabisat & padding.
//   B. `periodeHistorisTersedia` — hanya bulan LEWAT yang BELUM punya versi.
//      Bulan berjalan sengaja tidak ditawarkan: tanggal kanoniknya akhir bulan,
//      jadi "Agustus" = 31 Agu akan merebut MAX(versi_tanggal) dari versi hari ini.
//   C. Pagar Zod `versi_tanggal` — tidak boleh melewati hari ini, tahun wajib
//      cocok. Tanpa ini `{tahun:2026, versi:'2099-12-31'}` diterima dan jadi pagu
//      efektif 2026 selamanya.
//   D. Pagar `dpa_versi_tanggal` ≤ `versi_tanggal` pada Pergeseran.
//
// Murni di memori, tidak menyentuh basis data.
//
// Jalankan: npx tsx scripts/test-blud-periode-historis.mts

import { akhirBulan, periodeHistorisTersedia } from '../lib/blud/tanggal'
import { DpaBodySchema, PergeseranBodySchema, pagarVersiTanggal } from '../lib/blud/schemas'
import type { z } from 'zod'

/**
 * Ctx palsu penampung isu — supaya kedua aturan `pagarVersiTanggal` bisa diuji
 * TERPISAH dengan tanggal "hari ini" yang disuntikkan.
 *
 * Lewat Zod saja tidak cukup: tanggal masa depan yang gampang ditulis
 * (`2099-12-31`) juga melanggar aturan tahun, jadi membuang pagar masa depan
 * tidak membuat satu pemeriksaan pun gagal — terbukti lewat uji mutasi.
 */
function isuDari(versi: string, tahun: number, hariIni: string): string[] {
  const isu: string[] = []
  const ctx = { addIssue: (i: { message: string }) => isu.push(i.message) } as unknown as z.RefinementCtx
  pagarVersiTanggal({ tahun_anggaran: tahun, versi_tanggal: versi }, ctx, hariIni)
  return isu
}

let lulus = 0
let gagal = 0
function cek(nama: string, syarat: boolean, catatan = '') {
  if (syarat) { lulus++; console.log(`  ok   ${nama.padEnd(58)} ${catatan}`) }
  else        { gagal++; console.log(`  GAGAL ${nama.padEnd(58)} ${catatan}`) }
}
function bab(judul: string) { console.log(`\n── ${judul} ──`) }

/** 26 Agustus 2026, 10:00 WIB → epoch UTC. */
const AGU_26 = Date.UTC(2026, 7, 26, 3, 0, 0)

bab('A. akhirBulan')
{
  cek('Januari 31 hari', akhirBulan(2026, 1) === '2026-01-31', akhirBulan(2026, 1))
  cek('Februari 2026 (bukan kabisat) 28', akhirBulan(2026, 2) === '2026-02-28', akhirBulan(2026, 2))
  cek('Februari 2028 (kabisat) 29', akhirBulan(2028, 2) === '2028-02-29', akhirBulan(2028, 2))
  cek('April 30 hari', akhirBulan(2026, 4) === '2026-04-30', akhirBulan(2026, 4))
  cek('Bulan 1 digit diberi padding', akhirBulan(2026, 9) === '2026-09-30', akhirBulan(2026, 9))
  cek('Desember', akhirBulan(2026, 12) === '2026-12-31', akhirBulan(2026, 12))
}

bab('B. periodeHistorisTersedia — tahun berjalan')
{
  const p = periodeHistorisTersedia(2026, [], AGU_26)
  const bulan = p.map(x => x.bulan)

  cek('Januari–Juli ditawarkan', bulan.join(',') === '1,2,3,4,5,6,7', bulan.join(','))
  // Kalau Agustus ikut, tanggalnya 31 Agu > hari ini 26 Agu → merebut MAX dan
  // memindahkan pagu tahun berjalan ke dokumen yang belum tentu final.
  cek('Bulan berjalan TIDAK ditawarkan', !bulan.includes(8))
  cek('Bulan depan juga tidak', !bulan.includes(9))
  cek('Tanggalnya akhir bulan', p[0].tanggal === '2026-01-31', p[0].tanggal)
  cek('Labelnya terbaca manusia', p[0].label === 'Januari 2026', p[0].label)
}

bab('B2. Bulan yang sudah punya versi tidak ditawarkan lagi')
{
  const p = periodeHistorisTersedia(2026, ['2026-01-31', '2026-03-31', '2026-08-26'], AGU_26)
  const bulan = p.map(x => x.bulan)

  cek('Januari & Maret hilang dari daftar', bulan.join(',') === '2,4,5,6,7', bulan.join(','))
  // Versi bertanggal berapa pun di bulan itu menutup bulannya — pencocokan
  // per-BULAN, bukan per-tanggal. Kalau per-tanggal, versi 2026-01-15 tidak akan
  // menutup Januari dan orang bisa membuat versi kedua di bulan yang sama.
  const q = periodeHistorisTersedia(2026, ['2026-01-15'], AGU_26)
  cek('Tanggal mana pun di bulan itu menutupnya', !q.map(x => x.bulan).includes(1))
}

bab('B3. Tahun lain')
{
  cek('Tahun lampau: 12 bulan penuh',
    periodeHistorisTersedia(2025, [], AGU_26).length === 12)
  cek('Tahun depan: kosong',
    periodeHistorisTersedia(2027, [], AGU_26).length === 0)
  // Januari: belum ada bulan lewat sama sekali di tahun itu.
  cek('Januari tahun berjalan: kosong',
    periodeHistorisTersedia(2026, [], Date.UTC(2026, 0, 5, 3)).length === 0)
}

bab('C. Pagar versi_tanggal — DPA')
{
  const badan = (versi: string, tahun = 2026) => ({
    tahun_anggaran: tahun, versi_tanggal: versi,
    rows: [{
      kode_rekening: '5', uraian: 'X', vol: null, satuan: null, harga: null, jumlah: 0,
      tipe_baris: 'GRANDMASTER', row_id: 'r1', parent_id: null, urutan: 0,
    }],
  })

  // Dua aturan diuji terpisah, dengan "hari ini" disuntikkan supaya tesnya tidak
  // ikut berubah arti saat kalender bergerak.
  const HARI_INI = '2026-08-26'
  cek('Masa depan DI TAHUN YANG SAMA ditolak',
    isuDari('2026-12-31', 2026, HARI_INI).some(m => m.includes('setelah hari ini')),
    isuDari('2026-12-31', 2026, HARI_INI)[0]?.slice(0, 40) ?? '(lolos!)')
  cek('Besok pun ditolak',
    isuDari('2026-08-27', 2026, HARI_INI).length === 1)
  cek('Hari ini sendiri diterima',
    isuDari('2026-08-26', 2026, HARI_INI).length === 0)
  // Tahun `versi_tanggal` SENGAJA boleh beda dari `tahun_anggaran`: menyusun DPA
  // 2027 pada Agustus 2026 adalah alur yang sah — itu justru guna "Salin dari
  // Tahun Lain". Memaksakan keduanya sama pernah saya pasang dan langsung
  // ditangkap `test-blud-salin-tahun` (E3).
  cek('Menyusun anggaran tahun DEPAN hari ini diterima',
    isuDari('2026-08-26', 2027, HARI_INI).length === 0)
  cek('Menyusun anggaran tahun LALU hari ini diterima',
    isuDari('2026-08-26', 2025, HARI_INI).length === 0)

  // Bukti pagarnya benar-benar terpasang di Zod, bukan cuma ada sebagai fungsi.
  const masaDepan = DpaBodySchema.safeParse(badan('2099-12-31'))
  cek('Terpasang di DpaBodySchema', !masaDepan.success,
    masaDepan.success ? '(DITERIMA!)' : masaDepan.error.issues[0].message.slice(0, 42))

  const historis = DpaBodySchema.safeParse({ ...badan('2026-01-31'), entri_historis: true })
  cek('Periode historis yang sah diterima', historis.success)
  cek('Bendera entri_historis terbaca', historis.success && historis.data.entri_historis === true)
  cek('Tanpa bendera, bawaannya false',
    DpaBodySchema.safeParse(badan('2026-01-31')).success &&
    DpaBodySchema.parse(badan('2026-01-31')).entri_historis === false)
}

bab('D. Pergeseran — DPA acuan tidak boleh lebih baru')
{
  const badan = (versi: string, dpaVersi?: string) => ({
    tahun_anggaran: 2026, versi_tanggal: versi,
    ...(dpaVersi ? { dpa_versi_tanggal: dpaVersi } : {}),
    rows: [{
      kode_rekening: '5', uraian: 'X', vol: null, satuan: null, harga: null, jumlah: 0,
      vol_p: null, harga_p: null, pergeseran: 0, bertambah_berkurang: 0,
      tipe_baris: 'GRANDMASTER', row_id: 'r1', parent_id: null, urutan: 0,
    }],
  })

  // Inti pagar ini: Pergeseran Januari yang mengacu DPA Agustus adalah dokumen
  // yang berbunyi "pada Januari kami menggeser anggaran yang baru ada di Agustus".
  const terbalik = PergeseranBodySchema.safeParse(badan('2026-01-31', '2026-08-05'))
  cek('DPA lebih baru dari pergeserannya ditolak', !terbalik.success,
    terbalik.success ? '(DITERIMA!)' : terbalik.error.issues[0].message.slice(0, 48))

  cek('DPA periode sama diterima',
    PergeseranBodySchema.safeParse(badan('2026-01-31', '2026-01-31')).success)
  cek('DPA lebih lama diterima',
    PergeseranBodySchema.safeParse(badan('2026-03-31', '2026-01-31')).success)
  cek('Tanpa dpa_versi_tanggal diterima (server pilih sendiri)',
    PergeseranBodySchema.safeParse(badan('2026-01-31')).success)
  cek('Pagar tanggal juga berlaku di Pergeseran',
    !PergeseranBodySchema.safeParse(badan('2099-01-01')).success)
}

console.log(`\n${lulus} pemeriksaan LULUS · ${gagal} GAGAL`)
process.exit(gagal > 0 ? 1 : 0)
