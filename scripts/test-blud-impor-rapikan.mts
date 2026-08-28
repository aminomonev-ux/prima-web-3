// scripts/test-blud-impor-rapikan.mts
// Penjaga regresi "impor DPA merapikan sendiri" — 2026-08-28.
//
// Panel impor dulu menandai 54 baris pada formulir Juli 2026 dan menyuruh orang
// mencarinya sendiri. Padahal berkasnya TIDAK salah: rumusnya berbunyi
//
//     b.158 =SUM(P159:P161)+P163  374jt   b.159 =M159*O159  15jt  ← perkalian
//     b.160 =M160*O160  10jt              b.161 =M161*O161   7jt
//     b.163 =SUM(P164:P173)       342jt
//
// 15 + 10 + 7 + 342 = 374, cocok persis. Yang keliru pembacaan kita: b.160 &
// b.161 ditempel sebagai ANAK b.159, sehingga vol × harga milik b.159 dibuang.
// Itulah 15 jutanya.
//
//   A. Aturan 1 memperbaiki bentuk itu.
//   B. Aturan 1 MEMBUKTIKAN DIRI — kalau tidak membaik, dibatalkan.
//   C. Rumus rusak/hilang → tidak disentuh, dilaporkan.
//   D. Aturan 2 mengisi celah yang sah…
//   E. …tapi MENOLAK yang bikin dobel — regresi nyata pada `DPA BLUD 2024.1`.
//   F. Residu cuma menunjuk yang MELAHIRKAN selisih.
//   G. Berkas nyata: Juli jadi nol, yang sudah cocok tidak diganggu.
//
// Jalankan: npx tsx scripts/test-blud-impor-rapikan.mts

import { existsSync, readFileSync } from 'node:fs'
import {
  rapikanHierarki, normalkanDaunTanpaPerkalian, sumberSelisih, residuSimpul,
  type SimpulImpor,
} from '../lib/blud/import-rapikan'

let lulus = 0
let gagal = 0
function cek(nama: string, syarat: boolean, catatan = '') {
  if (syarat) { lulus++; console.log(`  ok   ${nama.padEnd(58)} ${catatan}`) }
  else        { gagal++; console.log(`  GAGAL ${nama.padEnd(58)} ${catatan}`) }
}
function bab(j: string) { console.log(`\n── ${j} ──`) }

const s = (o: Partial<SimpulImpor> & { barisExcel: number }): SimpulImpor => ({
  jumlahFile: null, vol: null, harga: null, rumusPerkalian: false, ...o,
})

/** Bentuk Juli: 158 induk · 159 perkalian (salah dijadikan induk) · 160,161 anaknya · 163 induk. */
function pohonJuli() {
  const simpul = [
    s({ barisExcel: 158, jumlahFile: 374_000_000 }),                                            // 0
    s({ barisExcel: 159, jumlahFile: 15_000_000, vol: 1, harga: 15_000_000, rumusPerkalian: true }), // 1
    s({ barisExcel: 160, jumlahFile: 10_000_000, vol: 1, harga: 10_000_000, rumusPerkalian: true }), // 2
    s({ barisExcel: 161, jumlahFile: 7_000_000,  vol: 1, harga: 7_000_000,  rumusPerkalian: true }), // 3
    s({ barisExcel: 163, jumlahFile: 342_000_000 }),                                            // 4
    s({ barisExcel: 164, jumlahFile: 342_000_000, vol: 1, harga: 342_000_000, rumusPerkalian: true }), // 5
  ]
  const induk = [null, 0, 1, 1, 0, 4]   // 160 & 161 salah: jadi anak 159
  return { simpul, induk }
}

bab('A. Aturan 1 memperbaiki bentuk Juli')
{
  const { simpul, induk } = pohonJuli()
  const { induk: baru, perbaikan } = rapikanHierarki(simpul, induk)
  cek('b.160 naik jadi anak b.158', baru[2] === 0)
  cek('b.161 naik jadi anak b.158', baru[3] === 0)
  cek('b.159 tidak lagi punya anak', !baru.includes(1))
  cek('Tercatat sebagai perbaikan', perbaikan.length === 1 && perbaikan[0].barisExcel === 159,
    perbaikan[0]?.jenis)
  cek('Keterangannya menyebut sebabnya', /perkalian/.test(perbaikan[0]?.keterangan ?? ''))

  // Sesudah dirapikan, berkas cocok dengan dirinya sendiri di setiap simpul.
  cek('Nol simpul yang melahirkan selisih', sumberSelisih(simpul, baru).length === 0)
  const sebelum = sumberSelisih(simpul, induk)
  cek('Sebelum dirapikan memang bermasalah', sebelum.length === 2,
    sebelum.map(x => `b.${x.barisExcel}`).join(','))
}

bab('B. Perbaikan harus MEMBUKTIKAN DIRI')
{
  // Rumusnya perkalian, tapi memindahkan anaknya justru merusak: angka induknya
  // memang sudah cocok dengan susunan yang sekarang.
  const simpul = [
    s({ barisExcel: 10, jumlahFile: 100 }),
    s({ barisExcel: 11, jumlahFile: 100, vol: 1, harga: 999, rumusPerkalian: true }),
    s({ barisExcel: 12, jumlahFile: 100, vol: 1, harga: 100, rumusPerkalian: true }),
  ]
  const induk = [null, 0, 1]
  const { induk: baru, perbaikan } = rapikanHierarki(simpul, induk)
  cek('Pemindahan yang tidak membaik DIBATALKAN', baru[2] === 1 && perbaikan.length === 0)
}

bab('C. Rumus hilang / rusak → tidak disentuh')
{
  const { simpul, induk } = pohonJuli()
  simpul[0].jumlahFile = null            // rumus induk tidak menyimpan hasil (#REF!, dll)
  const { induk: baru, perbaikan } = rapikanHierarki(simpul, induk)
  cek('Tidak ada yang dipindah kalau tak bisa dinilai', perbaikan.length === 0 && baru[2] === 1)
  cek('Residu memulangkan null, bukan 0', residuSimpul(simpul, induk, 0) === null,
    'menganggapnya nol membuat baris bermasalah tampak bersih')

  // Baris tanpa induk: menaikkan anaknya akan melahirkan akar kedua.
  const akar = [s({ barisExcel: 1, jumlahFile: 50, vol: 1, harga: 50, rumusPerkalian: true }),
                s({ barisExcel: 2, jumlahFile: 50, vol: 1, harga: 50, rumusPerkalian: true })]
  const r = rapikanHierarki(akar, [null, 0])
  cek('Anak tidak pernah dinaikkan jadi akar kedua', r.induk[1] === 0 && r.perbaikan.length === 0)
}

bab('D & E. Aturan 2 — mengisi yang sah, menolak yang bikin dobel')
{
  // Sah: induk 100, anaknya 60 (berangka lengkap) + 40 (tanpa vol/harga).
  const sah = [
    s({ barisExcel: 1, jumlahFile: 100 }),
    s({ barisExcel: 2, jumlahFile: 60, vol: 1, harga: 60 }),
    s({ barisExcel: 3, jumlahFile: 40 }),
  ]
  const hasilSah = normalkanDaunTanpaPerkalian(sah, [null, 0, 0])
  cek('Daun berangka tanpa vol/harga diisi 1 × angkanya',
    hasilSah.vol[2] === 1 && hasilSah.harga[2] === 40 && hasilSah.perbaikan.length === 1)

  // REGRESI NYATA (`DPA BLUD 2024.1.xlsx` b.434): baris induk struktural yang
  // di pohon kita jadi daun. Anak-anaknya sudah menempel di tempat lain, jadi
  // mengisi vol × harga membuat uangnya terhitung DUA KALI — selisih berkas
  // melonjak dari 60 juta jadi −1,06 miliar.
  const dobel = [
    s({ barisExcel: 433, jumlahFile: 1_120_000_000 }),
    s({ barisExcel: 434, jumlahFile: 1_120_000_000 }),                      // "daun" bernilai penuh
    s({ barisExcel: 435, jumlahFile: 1_120_000_000, vol: 1, harga: 1_120_000_000 }), // anak sungguhannya
  ]
  const hasilDobel = normalkanDaunTanpaPerkalian(dobel, [null, 0, 0])
  cek('Pengisian yang bikin dobel DITOLAK',
    hasilDobel.vol[1] === null && hasilDobel.perbaikan.length === 0,
    'induknya sudah cocok tanpa itu')

  const tanpaAngka = [s({ barisExcel: 1, jumlahFile: 10 }), s({ barisExcel: 2, jumlahFile: 0 })]
  cek('Baris berangka nol tidak diisi',
    normalkanDaunTanpaPerkalian(tanpaAngka, [null, 0]).perbaikan.length === 0,
    'itu baris judul/struktur, bukan uang')
}

bab('F. Residu cuma menunjuk yang MELAHIRKAN selisih')
{
  // Satu daun meleset 15; induk & kakeknya ikut meleset 15 tapi tidak bersalah.
  const simpul = [
    s({ barisExcel: 1, jumlahFile: 100 }),
    s({ barisExcel: 2, jumlahFile: 100 }),
    s({ barisExcel: 3, jumlahFile: 100, vol: 1, harga: 85 }),
  ]
  const sumber = sumberSelisih(simpul, [null, 0, 1])
  cek('Hanya 1 dari 3 baris dilaporkan', sumber.length === 1 && sumber[0].barisExcel === 3,
    sumber.map(x => `b.${x.barisExcel}`).join(','))
  cek('Residunya senilai kesalahannya', sumber[0].residu === 15)
  cek('Jenisnya dikenali', sumber[0].jenis === 'TERBAWAH' && sumber[0].jumlahAnak === 0)

  // Yang saling menghapus TETAP terlihat, walau total akarnya nol.
  const menutupi = [
    s({ barisExcel: 1, jumlahFile: 200 }),
    s({ barisExcel: 2, jumlahFile: 120, vol: 1, harga: 100 }),
    s({ barisExcel: 3, jumlahFile: 80,  vol: 1, harga: 100 }),
  ]
  const dua = sumberSelisih(menutupi, [null, 0, 0])
  cek('Kesalahan yang saling menghapus tetap terlihat', dua.length === 2,
    'total akar nol tidak berarti benar')
}

bab('G. Berkas nyata')
{
  const berkas: [string, string, number | null][] = [
    ['Juli',   'C:/Users/HP VICTUS/Downloads/DPA BLUD _JULI.xlsx',        0],
    ['2026 F', 'C:/Users/HP VICTUS/Downloads/dpa/DPA BLUD 2026 F.xlsx',   0],
  ]
  const ada = berkas.filter(([, p]) => existsSync(p))
  if (!ada.length) {
    console.log('  (dilewati — berkas kalibrasi tidak ada di komputer ini)')
  } else {
    const { bacaGridDpa } = await import('../lib/blud/import-dpa-grid')
    const { bacaDpaDariGrid } = await import('../lib/blud/import-dpa')
    for (const [nama, jalur, harap] of ada) {
      const h = bacaDpaDariGrid(await bacaGridDpa(readFileSync(jalur)), { penanggungJawabSah: [] })
      const selisih = (h.totalFile ?? 0) - h.totalHitung
      cek(`${nama}: selisih ${harap === 0 ? 'nol' : harap}`, selisih === harap,
        `${selisih.toLocaleString('id-ID')} · ${h.perbaikan.length} perbaikan`)
    }
  }
}

console.log(`\n${lulus} pemeriksaan LULUS · ${gagal} GAGAL`)
process.exit(gagal > 0 ? 1 : 0)
