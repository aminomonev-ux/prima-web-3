// scripts/test-blud-tabel-cepat.mts
// Penjaga regresi performa tabel DPA & Pergeseran — Tahap 4, 2026-08-28.
//
// Diukur di aplikasi dengan 558 baris asli, memakai PerformanceObserver
// ('longtask' — blokade main-thread, bukan rAF yang dicekik di tab tak terlihat):
//
//   satu ketikan di kotak Cari   : 723 ms  ->    0 ms
//   satu ketikan di sel Vol      : 869 ms ->   77 ms
//
// Yang penting bukan angkanya, tapi APA yang membuatnya bisa turun. Dugaan
// pertama — pemindaian Sentinel (`validateAllPj`/`validateDupRules`) yang jalan
// tiap render — TERBANTAH oleh percobaan: dengan seluruh baris disembunyikan
// lewat saringan level, ketikan yang sama tidak menghasilkan satu pun long-task.
// Biayanya memang di 558 baris × (4 combobox + menu aksi).
//
// Perbaikannya dua bagian, dan keduanya WAJIB ada:
//
//   1. `partialRecalc*` berhenti mengkloning SELURUH baris. Dulu ia membuka
//      dengan `rows.map(r => ({ ...r }))`, jadi tiap ketikan memberi 558 baris
//      identitas baru dan React menganggap semuanya berubah.
//   2. Barisnya jadi komponen ber-`memo`, dan tiap prop-nya dibuat stabil.
//
// Dibuktikan dengan mengembalikan (1) saja: 77 ms naik lagi jadi 869 ms — memo
// tanpa perbaikan kloning tidak menggigit sama sekali. Karena itu berkas ini
// menjaga KEDUANYA; melepas salah satu mengembalikan lag tanpa ada yang gagal.
//
//   A. Identitas baris yang tidak berubah dipertahankan.
//   B. Angkanya tetap sama dengan hitungan penuh.
//   C. Baris di-memo dan menerima nilai skalar, bukan Set/Map.
//   D. Penangan per-baris tidak bergantung pada `rows`.
//
// Jalankan: npx tsx scripts/test-blud-tabel-cepat.mts

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  partialRecalcDpa, partialRecalcPergeseran, recalcDpaJumlah, recalcPergeseranJumlah,
} from '../lib/blud/recalc'
import type { DpaBarisInput, PergeseranBarisInput } from '../types'

const AKAR = join(import.meta.dirname, '..')
const baca = (p: string) => readFileSync(join(AKAR, p), 'utf8')

function kode(isi: string): string {
  return isi
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
}

const DPA = 'app/(dashboard)/blud/dpa/dpa-client.tsx'
const PGS = 'app/(dashboard)/blud/pergeseran/pergeseran-client.tsx'
const SWAP = 'lib/blud/use-sentinel-swap.ts'
const GUARD = 'lib/blud/use-sentinel-pj-guard.ts'
const RECALC = 'lib/blud/recalc.ts'

let lulus = 0
let gagal = 0
function cek(nama: string, syarat: boolean, catatan = '') {
  if (syarat) { lulus++; console.log(`  ok   ${nama.padEnd(64)} ${catatan}`) }
  else        { gagal++; console.log(`  GAGAL ${nama.padEnd(64)} ${catatan}`) }
}
function bab(judul: string) { console.log(`\n── ${judul} ──`) }

/** Pohon uji: 1 akar → 2 induk → masing-masing 3 daun berisi. */
function pohonDpa(): DpaBarisInput[] {
  const rows: DpaBarisInput[] = [{
    kode_rekening: '', uraian: 'AKAR', vol: null, satuan: null, harga: null, jumlah: 0,
    tipe_baris: 'GRANDMASTER', row_id: 'akar', parent_id: null, urutan: 0,
  }]
  let n = 0
  for (const m of ['m1', 'm2']) {
    rows.push({
      kode_rekening: '5.1', uraian: m, vol: null, satuan: null, harga: null, jumlah: 0,
      tipe_baris: 'MASTER', row_id: m, parent_id: 'akar', urutan: ++n,
    })
    for (let i = 1; i <= 3; i++) {
      rows.push({
        kode_rekening: `5.1.0${i}`, uraian: `${m}-anak${i}`,
        vol: i, satuan: 'unit', harga: 1000, jumlah: i * 1000,
        tipe_baris: 'CHILD', row_id: `${m}-a${i}`, parent_id: m, urutan: ++n,
      })
    }
  }
  return recalcDpaJumlah(rows)
}

function pohonPergeseran(): PergeseranBarisInput[] {
  return recalcPergeseranJumlah(pohonDpa().map(r => ({
    ...r,
    vol_p: r.vol, harga_p: r.harga,
    pergeseran: r.jumlah, bertambah_berkurang: 0,
  })))
}

/** Persis yang dilakukan `updateRow` di layar: map satu baris, lalu partial recalc. */
function ketikVol(rows: DpaBarisInput[], rowId: string, vol: number): DpaBarisInput[] {
  const updated = rows.map(r => r.row_id === rowId ? { ...r, vol } : r)
  return partialRecalcDpa(updated, rowId)
}

bab('A. Identitas baris yang tidak berubah dipertahankan')
{
  const awal = pohonDpa()
  const sesudah = ketikVol(awal, 'm1-a2', 50)

  const idx = (rows: DpaBarisInput[], id: string) => rows.findIndex(r => r.row_id === id)
  const sama = (id: string) => awal[idx(awal, id)] === sesudah[idx(sesudah, id)]

  cek('Larik selalu baru', awal !== sesudah, 'React & tombol Simpan butuh identitas larik berganti')
  cek('Baris yang diketik dapat objek baru', !sama('m1-a2'))
  cek('Induknya ikut baru (jumlahnya berubah)', !sama('m1'))
  cek('Akar ikut baru', !sama('akar'))

  // INTI TAHAP 4. Kalau ini gagal, tiap ketikan memberi 558 baris identitas baru
  // dan `memo` pada barisnya tidak menggigit sama sekali.
  const saudara = ['m1-a1', 'm1-a3']
  cek('Saudara sekandung TETAP objek yang sama', saudara.every(sama), saudara.join(', '))
  const cabangLain = ['m2', 'm2-a1', 'm2-a2', 'm2-a3']
  cek('Cabang lain TETAP objek yang sama', cabangLain.every(sama), `${cabangLain.length} baris`)

  const tetap = sesudah.filter((r, i) => r === awal[i]).length
  cek('Hanya 3 dari 9 baris berganti identitas', tetap === 6, `${9 - tetap} berganti`)

  // Mengetik ulang nilai yang SAMA: baris itu sendiri memang dapat objek baru
  // (map di `updateRow` selalu menyalinnya, dan me-render ulang satu baris murah),
  // tapi rantai induknya tidak boleh ikut — angkanya tidak bergeser sedikit pun.
  const nolPerubahan = ketikVol(awal, 'm1-a2', 2)
  const idxN = (id: string) => awal.findIndex(r => r.row_id === id)
  cek('Vol diketik ulang dengan nilai sama: induk tidak ikut berganti',
    ['m1', 'akar'].every(id => nolPerubahan[idxN(id)] === awal[idxN(id)]))
  cek('Vol diketik ulang dengan nilai sama: hanya 1 baris berganti',
    nolPerubahan.filter((r, i) => r !== awal[i]).length === 1)
}

bab('B. Angkanya tetap sama dengan hitungan penuh')
{
  const awal = pohonDpa()
  const partial = ketikVol(awal, 'm1-a2', 50)
  const penuh   = recalcDpaJumlah(awal.map(r => r.row_id === 'm1-a2' ? { ...r, vol: 50 } : r))

  const petaP = new Map(partial.map(r => [r.row_id, r.jumlah]))
  const beda  = penuh.filter(r => petaP.get(r.row_id) !== r.jumlah)
  cek('Partial = hitungan penuh untuk SEMUA baris', beda.length === 0,
    beda.map(b => `${b.row_id}: ${petaP.get(b.row_id)} != ${b.jumlah}`).join('; '))
  cek('Angkanya memang bergeser', petaP.get('m1-a2') === 50_000 && petaP.get('m1') === 54_000,
    `m1 = ${petaP.get('m1')}`)
  cek('Akar ikut naik', petaP.get('akar') === 54_000 + 6_000)

  // Induk yang berubah dari daun jadi agregator dan sebaliknya tetap benar:
  // baris tanpa anak DAN tidak editable harus jadi 0, bukan warisan angka lama.
  const yatim = partialRecalcDpa(awal, 'tidak-ada')
  cek('Baris yang tidak ditemukan: larik asli dipulangkan apa adanya', yatim === awal)
}

bab('C. Pergeseran — kolom pergeseran DAN selisihnya')
{
  const awal = pohonPergeseran()
  const updated = awal.map(r => r.row_id === 'm1-a2' ? { ...r, vol_p: 50 } : r)
  const sesudah = partialRecalcPergeseran(updated, 'm1-a2')

  const at = (rows: PergeseranBarisInput[], id: string) => rows.find(r => r.row_id === id)!
  cek('Pergeseran anak = vol_p × harga_p', at(sesudah, 'm1-a2').pergeseran === 50_000)
  cek('Selisih terhadap DPA ikut disegarkan',
    at(sesudah, 'm1-a2').bertambah_berkurang === 50_000 - 2_000)
  cek('Induk menjumlah ulang', at(sesudah, 'm1').pergeseran === 54_000)
  cek('Selisih induk ikut', at(sesudah, 'm1').bertambah_berkurang === 54_000 - 6_000)

  const idx = (rows: PergeseranBarisInput[], id: string) => rows.findIndex(r => r.row_id === id)
  const sama = (id: string) => updated[idx(updated, id)] === sesudah[idx(sesudah, id)]
  cek('Cabang lain TETAP objek yang sama',
    ['m2', 'm2-a1', 'm2-a2', 'm2-a3', 'm1-a1', 'm1-a3'].every(sama))

  const penuh = recalcPergeseranJumlah(updated)
  const petaP = new Map(sesudah.map(r => [r.row_id, [r.pergeseran, r.bertambah_berkurang]]))
  cek('Partial = hitungan penuh',
    penuh.every(r => {
      const p = petaP.get(r.row_id)!
      return p[0] === r.pergeseran && p[1] === r.bertambah_berkurang
    }))

  // Kloning penuh tidak boleh diam-diam kembali lewat berkas recalc.
  const src = kode(baca(RECALC))
  const badanPartial = src.slice(src.indexOf('export function partialRecalcDpa'))
  cek('partialRecalc tidak lagi membuka dengan kloning semua baris',
    !/partialRecalc\w+[\s\S]{0,300}rows\.map\(r => \(\{ \.\.\.r \}\)\)/.test(badanPartial),
    'pola lama yang membuat memo sia-sia')
}

bab('D. Baris di-memo dan menerima nilai skalar')
{
  for (const [nama, berkas, komponen] of [
    ['DPA', DPA, 'DpaRow'], ['Pergeseran', PGS, 'PergeseranRow'],
  ] as const) {
    const isi = kode(baca(berkas))
    cek(`${nama}: baris jadi komponen ber-memo`,
      new RegExp(`const ${komponen} = memo\\(function ${komponen}`).test(isi))
    cek(`${nama}: tabel merender <${komponen}>`, isi.includes(`<${komponen}`))

    // Kalau Set/Map/id yang dioper, satu centang atau satu lompatan pencarian
    // me-render ulang seluruh baris — memo-nya jadi hiasan.
    cek(`${nama}: seleksi dioper sebagai boleh/tidak`,
      /terpilih=\{selectedRowIds\.has\(row\.row_id\)\}/.test(isi))
    cek(`${nama}: sorotan dioper sebagai boleh/tidak`,
      /disorot=\{row\.row_id === highlightId\}/.test(isi))
    cek(`${nama}: agregator dioper sebagai boleh/tidak`,
      /isAgg=\{\(childCount\.get\(row\.row_id\) \?\? 0\) > 0\}/.test(isi))
    cek(`${nama}: penangan dibundel jadi satu objek ber-useMemo`,
      /const aksi = useMemo\(\(\) => \(\{/.test(isi))
    cek(`${nama}: barisnya tidak menerima Set/Map mentah`,
      !new RegExp(`<${komponen}[\\s\\S]{0,600}(selectedRowIds=|childCount=|highlightId=)`).test(isi))
  }
}

bab('E. Penangan per-baris tidak bergantung pada `rows`')
{
  // Satu saja yang masih ber-dep `rows` sudah cukup membuat `aksi` berganti
  // identitas tiap ketikan — dan seluruh pemisahan baris jadi sia-sia.
  for (const [nama, berkas, penangan] of [
    ['DPA', DPA, ['updateRow', 'pilihAkun', 'addSibling', 'deleteBaris', 'addChild']],
    ['Pergeseran', PGS, ['updateVolHarga', 'updateText', 'pickAkun', 'addSibling', 'deleteBaris', 'addChild']],
  ] as const) {
    const isi = kode(baca(berkas))
    for (const p of penangan) {
      const i = isi.indexOf(`const ${p} = useCallback(`)
      const blok = i === -1 ? '' : isi.slice(i, isi.indexOf('\n', isi.indexOf('}, [', i)))
      cek(`${nama}: ${p} tidak ber-dep rows`,
        blok.length > 0 && !/\}, \[[^\]]*\brows\b[^\]]*\]/.test(blok),
        blok.slice(blok.lastIndexOf('}, [')) || 'tidak ketemu')
    }
    cek(`${nama}: rowsRef diisi di efek, bukan saat render`,
      /useEffect\(\(\) => \{ rowsRef\.current = rows \}\)/.test(isi),
      'mengisinya saat render bisa menyimpan hasil render yang dibatalkan')
  }

  const swap = kode(baca(SWAP))
  cek('Swap: toggleCheckbox stabil', /const toggleCheckbox = useCallback[\s\S]{0,2200}\n  \}, \[\]\)/.test(swap))
  cek('Swap: geser tidak ber-dep rows/seleksi', /const geser = useCallback[\s\S]{0,900}\}, \[onChange, setBlocked\]\)/.test(swap))
  cek('Swap: keduanya membaca lewat ref',
    swap.includes('rowsRef.current') && swap.includes('pilihRef.current'))

  // Arrow baru tiap render pada `setBlocked` membuat `geser`/`toggleCheckbox`
  // ikut berganti identitas — pagar yang mudah bocor lagi.
  const pgs = kode(baca(PGS))
  cek('Pergeseran: setBlocked konstanta modul, bukan arrow inline',
    pgs.includes('setBlocked: abaikanBlocked') && /^const abaikanBlocked = \(\) => \{\}/m.test(pgs))

  const guard = kode(baca(GUARD))
  cek('PJ guard: hasil pemindaian di-useMemo', /const \{ pjConflictPairs, pjConflictPartners \} = useMemo\(/.test(guard))
  cek('PJ guard: handlePjChange tidak ber-dep rows', /const handlePjChange = useCallback[\s\S]{0,1400}\}, \[updateRow\]\)/.test(guard))
}

console.log(`\n${lulus} pemeriksaan LULUS · ${gagal} GAGAL`)
process.exit(gagal > 0 ? 1 : 0)
