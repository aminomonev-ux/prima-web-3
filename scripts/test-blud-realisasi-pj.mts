// scripts/test-blud-realisasi-pj.mts — Realisasi per Penanggung Jawab + penjaga PJ Pergeseran.
// Konsep: docs/CONCEPT-blud-realisasi-pj.md
//
// A–E menguji PERILAKU fungsi murni lib/blud/realisasi-pj.ts. F–H memeriksa sambungannya
// (komentar dibuang dulu supaya prosa penjelas tidak ikut cocok — L82c). Jalur DB-nya
// (transaksi per PJ) diuji di MySQL sungguhan oleh scripts/test-blud-realisasi-pj-db.mjs.
//
// Jalankan: npx tsx scripts/test-blud-realisasi-pj.mts

import { readFileSync } from 'node:fs'
import {
  pjBersih, kepalaPj, kunciMilikPj, rekapPerPj, daunMilikPj, pilihanPj,
  tabelRekapPj, tabelRincianPj, kolomRekapPj, LABEL_TANPA_PJ, type BarisPj,
} from '../lib/blud/realisasi-pj'
import { labelBarisPj } from '../lib/blud/pj-conflict'

let lulus = 0
const gagal: string[] = []
function ok(nama: string, syarat: boolean, ket = '') {
  if (syarat) { lulus++; console.log(`  ok  ${nama}`) }
  else { gagal.push(nama); console.log(`FAIL  ${nama}${ket ? ' — ' + ket : ''}`) }
}
const kode = (p: string) => readFileSync(p, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '').replace(/\{\s*\}/g, '{}')
function badan(src: string, penanda: string): string {
  const i = src.indexOf(penanda)
  if (i < 0) return ''
  const buka = src.indexOf('{', i + penanda.length)
  let dalam = 0
  for (let j = buka; j >= 0 && j < src.length; j++) {
    if (src[j] === '{') dalam++
    else if (src[j] === '}' && --dalam === 0) return src.slice(buka, j + 1)
  }
  return ''
}
function urut(teks: string, ...potongan: string[]): boolean {
  let pos = -1
  for (const p of potongan) { pos = teks.indexOf(p, pos + 1); if (pos < 0) return false }
  return true
}

// Pohon uji — angkanya SUDAH digulung seperti keluaran route pagu:
//   I (akar, tanpa PJ)          pagu 100, s.d. 8
//   ├ A  "Kasubbag Umum"        pagu  60, s.d. 7
//   │  ├ A1 "Kasi X" (ganda!)   pagu  40, s.d. 5
//   │  └ A2                     pagu  20, s.d. 2
//   ├ B  "Kasubbag Keuangan"    pagu  30, s.d. 0 (setahun 4)
//   └ C  (tanpa PJ)             pagu  10, s.d. 1
const b = (anggaran_key: string, parent_key: string | null, pj: string | null, pagu: number, sd: number,
  is_leaf = true, terserap = sd, ini = 0): BarisPj => ({
  anggaran_key, kode_rekening: `5.${anggaran_key}`, uraian: `Rek ${anggaran_key}`, parent_key, is_leaf,
  penanggung_jawab: pj, pagu, terserap, bulan_ini: ini, bulan_lalu: sd - ini, sd_bulan: sd,
})
const rows: BarisPj[] = [
  b('I', null, null, 100, 8, false, 12, 3),
  b('A', 'I', ' Kasubbag  Umum ', 60, 7, false, 7, 2),
  b('A1', 'A', 'Kasi X', 40, 5, true, 5, 0),
  b('A2', 'A', null, 20, 2, true, 2, 2),
  b('B', 'I', 'Kasubbag Keuangan', 30, 0, true, 4, 0),
  b('C', 'I', '-', 10, 1, true, 1, 1),
]

console.log('\n── A. pjBersih & kepalaPj ───────────────────────────────────────')
{
  ok('A1 spasi dirapikan', pjBersih('  Kasubbag   Umum ') === 'Kasubbag Umum')
  ok('A2 "-" = kosong (konvensi audit PJ)', pjBersih('-') === '' && pjBersih(null) === '' && pjBersih(undefined) === '')
  const k = kepalaPj(rows)
  ok('A3 rekening mewarisi PJ induk', k.get('A2') === 'A')
  ok('A4 rantai ber-PJ ganda: INDUK yang menang (tiap rupiah satu PJ)', k.get('A1') === 'A')
  ok('A5 tanpa PJ di rantai → null', k.get('C') === null && k.get('I') === null)
  ok('A6 PJ di baris sendiri', k.get('B') === 'B')
  const siklus = kepalaPj([{ anggaran_key: 'X', parent_key: 'Y', penanggung_jawab: 'P' }, { anggaran_key: 'Y', parent_key: 'X', penanggung_jawab: null }])
  ok('A7 data melingkar tidak menggantung', siklus.size === 2)
}

console.log('\n── B. rekapPerPj ────────────────────────────────────────────────')
const h = rekapPerPj(rows)
{
  const umum = h.baris.find(x => x.pj === 'Kasubbag Umum')
  const keu = h.baris.find(x => x.pj === 'Kasubbag Keuangan')
  ok('B1 dua PJ, urut nama', h.baris.map(x => x.pj).join('|') === 'Kasubbag Keuangan|Kasubbag Umum')
  ok('B2 angka PJ = angka baris kepalanya (sudah digulung)', umum?.pagu === 60 && umum.sd_bulan === 7 && umum.bulan_ini === 2)
  ok('B3 PJ ganda di turunan TIDAK jadi kelompok sendiri', !h.baris.some(x => x.pj === 'Kasi X'))
  ok('B4 konflik dihitung', h.konflik === 1)
  ok('B5 jumlah rekening = daun', umum?.rekening === 2 && keu?.rekening === 1)
  ok('B6 "Belum ada PJ" = total akar − Σ PJ', h.tanpaPj?.pagu === 10 && h.tanpaPj.sd_bulan === 1 && h.tanpaPj.rekening === 1)
  ok('B7 total = baris akar (= JUMLAH tabel Realisasi)', h.total.pagu === 100 && h.total.sd_bulan === 8 && h.total.terserap === 12)
  ok('B8 Σ semua baris rekap = total', h.baris.reduce((s, x) => s + x.sd_bulan, 0) + (h.tanpaPj?.sd_bulan ?? 0) === h.total.sd_bulan)
  ok('B9 sisa & % mengikuti s.d. bulan (bukan setahun)', keu?.sisa === 30 && keu.persen === 0)
  const tanpaBulan = rekapPerPj(rows.map(r => ({ ...r, bulan_ini: null, bulan_lalu: null, sd_bulan: null })))
  ok('B10 tanpa bulan → sisa dari serapan setahun (cermin route pagu)', tanpaBulan.baris.find(x => x.pj === 'Kasubbag Keuangan')?.sisa === 26)
  const semuaBerPj = rekapPerPj(rows.map(r => (r.anggaran_key === 'I' ? { ...r, penanggung_jawab: 'Kabag' } : r)))
  ok('B11 akar ber-PJ menelan semuanya — tanpaPj null', semuaBerPj.tanpaPj === null && semuaBerPj.baris.length === 1 && semuaBerPj.konflik === 3)
  ok('B12 tanpa PJ sama sekali → baris kosong, semua ke "Belum ada PJ"', (() => {
    const x = rekapPerPj(rows.map(r => ({ ...r, penanggung_jawab: null })))
    return x.baris.length === 0 && x.tanpaPj?.pagu === 100
  })())
}

console.log('\n── C. Milik PJ, daun, pilihan ───────────────────────────────────')
{
  ok('C1 milik PJ = kepala + turunannya', [...kunciMilikPj(rows, 'Kasubbag Umum')].sort().join() === 'A,A1,A2')
  ok('C2 label diketik dgn spasi berbeda tetap cocok', kunciMilikPj(rows, ' Kasubbag Umum').size === 3)
  ok('C3 "" = rantai tanpa PJ', [...kunciMilikPj(rows, '')].sort().join() === 'C,I')
  ok('C4 PJ ganda di turunan tidak punya rekening sendiri', kunciMilikPj(rows, 'Kasi X').size === 0)
  ok('C5 daun saja', daunMilikPj(rows, 'Kasubbag Umum').map(r => r.anggaran_key).join() === 'A1,A2')
  ok('C6 pilihan saringan: PJ urut nama lalu "Belum ada PJ"',
    pilihanPj(h).map(p => p.value).join('|') === 'Kasubbag Keuangan|Kasubbag Umum|' && pilihanPj(h)[2].label === LABEL_TANPA_PJ)
}

console.log('\n── D. Bahan unduhan ─────────────────────────────────────────────')
{
  const rekap = tabelRekapPj(h)
  ok('D1 rekap: PJ, "Belum ada PJ", lalu JUMLAH', rekap.map(r => r[0]).join('|') === `Kasubbag Keuangan|Kasubbag Umum|${LABEL_TANPA_PJ}|JUMLAH`)
  ok('D2 angka rekap = layar', rekap[1][5] === 7 && rekap[3][2] === 100)
  ok('D3 kolom = 8, menyebut bulan', kolomRekapPj('Maret').length === 8 && kolomRekapPj('Maret').includes('s.d. Maret'))
  const rinci = tabelRincianPj(rows, h)
  const sub = rinci.find(r => r[0] === 'Jumlah Kasubbag Umum')
  ok('D4 rincian: daun tiap PJ + subtotal', rinci.filter(r => r[0] === 'Kasubbag Umum').length === 2 && !!sub)
  ok('D5 subtotal dari REKAP (bukan jumlah daun)', sub?.[6] === 7 && sub?.[3] === 60)
  ok('D6 "Belum ada PJ" ikut dirinci', rinci.some(r => r[0] === LABEL_TANPA_PJ && r[1] === '5.C'))
}

console.log('\n── E. Server ────────────────────────────────────────────────────')
{
  const P = kode('lib/blud/pagu.ts')
  const efektif = badan(P, 'export async function getPaguEfektif(tahun: number): Promise<BarisPagu[]>')
  ok('E1 PJ ikut dibaca dari KEDUA tabel sumber pagu',
    efektif.includes('pergeseran AS pagu, penanggung_jawab') && efektif.includes('jumlah AS pagu, penanggung_jawab'))
  ok('E2 PJ ikut dipetakan', P.includes("penanggung_jawab: String(r.penanggung_jawab ?? ''),"))
  const RD = kode('lib/blud/realisasi-data.ts')
  const reg = badan(RD, '): Promise<{ pj: string; rows: RegisterPjRow[]; total: number }>')
  ok('E3 transaksi per PJ: rekening dari versi sumber pagu + aturan yang SAMA dgn rekap',
    urut(reg, 'const baris = await getPaguEfektif(tahun)', 'const keys = [...kunciMilikPj(baris, pj)]', 'if (!keys.length) return'))
  ok('E4 …hanya bagian kuitansi milik PJ + total kuitansinya', reg.split('a.anggaran_key IN (${keys})').length - 1 === 2
    && reg.split('SUM(a2.nilai)').length - 1 === 2)
  ok('E5 …saringan bulan sama dgn serapan (t.bulan <=)', reg.includes('AND t.bulan <= ${sampaiBulan}'))
  const R = kode('app/api/blud/realisasi/register/route.ts')
  ok('E6 route: ?pj= ditangani SEBELUM syarat anggaran_key, panjang dibatasi',
    urut(R, "if (searchParams.has('pj')) {", 'pj.length > 128', 'getRegisterPj(parsed.data, pj, sampaiBulan)', "searchParams.get('anggaran_key')"))
  ok('E7 route: pagar sakelar & izin tetap paling dulu', urut(R, 'const mati = await realisasiMati(session.role)', "bolehLihat(session.userId, session.role, 'realisasi')", "searchParams.has('pj')"))
}

console.log('\n── F. Layar Realisasi ───────────────────────────────────────────')
{
  const C = kode('app/(dashboard)/blud/realisasi/realisasi-client.tsx')
  ok('F1 rekap dihitung SEKALI dari baris tabel', C.split('rekapPerPj(rows)').length - 1 === 1)
  ok('F2 saringan PJ memakai kunciMilikPj (aturan rekap)', C.includes('kunciMilikPj(rows, saringAktif)')
    && C.includes('if (milikPj && !milikPj.has(r.anggaran_key)) continue'))
  ok('F3 saringan yang PJ-nya hilang otomatis lepas', C.includes('const saringAktif = rekapTersaring ? saringPj : SEMUA_PJ'))
  ok('F4 unduhan dari rekap yang SAMA, pustaka dimuat saat ditekan',
    C.includes("await import('@/lib/blud/export/realisasi-pj')") && C.includes('hasil: rekapPj'))
  ok('F5 rincian PJ → register rekening yang sudah ada', C.includes('onBukaRekening={r => { setPjBuka(null); setFokus(r) }}'))
  const M = kode('components/blud/RealisasiPjModal.tsx')
  ok('F6 modal: transaksi dari register?pj, sampai bulan terpilih',
    M.includes("new URLSearchParams({ tahun: String(tahun), pj: rekap.pj, sampai_bulan: String(bulan) })")
    && M.includes('/api/blud/realisasi/register?'))
  ok('F7 modal: kuitansi terbagi disebut', M.includes('t.total_kuitansi - t.nilai > 0.005') && M.includes('bagian dari kuitansi'))
  ok('F8 modal: rekening dari aturan yang sama (daunMilikPj)', M.includes('daunMilikPj(rows, rekap.pj)'))
  const X = readFileSync('lib/blud/export/realisasi-pj.ts', 'utf8')
  ok('F9 berkas ekspor tanpa impor pustaka berat di tingkat atas', !/^import .*from 'jspdf/m.test(X) && !/^import (?!type).*from 'exceljs'/m.test(X)
    && X.includes("import('jspdf')"))
}

console.log('\n── G. Penjaga PJ di Pergeseran (cermin DPA) ─────────────────────')
{
  const PC = kode('app/(dashboard)/blud/pergeseran/pergeseran-client.tsx')
  ok('G1 hook yang sama dgn DPA, awalan baris Pergeseran', PC.includes("useSentinelPjGuard({ rows, updateRow: updatePj, idAwalan: 'perg-row-' })"))
  ok('G2 isian PJ lewat penjaga, bukan updateText langsung',
    PC.includes("onChange={v => aksi.handlePjChange(row, v ?? '')}") && !PC.includes("onChange={v => aksi.updateText(row.row_id, 'penanggung_jawab'"))
  ok('G3 ⚠ di kolom PJ + spanduk pasangan', PC.includes('partners={pjConflictPartners.get(row.row_id)}') && PC.includes('pjConflictPairs.length > 0 && ('))
  // Syarat "langsung tambah" wajib dikutip UTUH — hanya kehadiran kedua panggilan tidak
  // membuktikan dialognya pernah muncul (mutan yang membuang syaratnya sempat lolos).
  ok('G4 tambah anak/saudara bertanya bila rantainya ber-PJ',
    urut(badan(PC, 'const addChild = useCallback((tipe: TipeBaris, parentRowId: string) =>'), 'findAncestorPjOnAdd(rows, parentRowId)',
      'if (ancestorsPj.length === 0) { addChildCore(tipe, parentRowId, rows); return }', 'setPjMutation({')
    && urut(badan(PC, 'const addSibling = useCallback((row: PergeseranBarisInput) =>'), 'findAncestorPjOnAdd(rows, row.parent_id)',
      'if (ancestorsPj.length === 0) { addSiblingCore(row, rows); return }', 'setPjMutation({'))
  ok('G5 dua dialog yang sama dgn DPA', PC.includes('<PjConflictDialog') && PC.includes('<PjMutationDialog'))
  const PR = kode('app/api/blud/pergeseran/route.ts')
  ok('G6 server: dicatat (audit), TIDAK menolak', PR.includes('const pjConflicts = validateAllPj(recalced)')
    && PR.includes("eventType: 'BLUD_PJ_CHAIN_CONFLICT'") && !/pjConflicts\.length > 0\)[\s\S]{0,80}status: 4\d\d/.test(PR))
  const H = kode('lib/blud/use-sentinel-pj-guard.ts')
  ok('G7 hook generik: awalan baris bawaan tetap dpa-row-', H.includes("idAwalan = 'dpa-row-'") && H.includes('document.getElementById(`${idAwalan}${rowId}`)'))
  const DC = kode('app/(dashboard)/blud/dpa/dpa-client.tsx')
  ok('G8 layar DPA tidak berubah perilakunya (tanpa idAwalan)', DC.includes('useSentinelPjGuard({ rows, updateRow })'))
  // Baris rincian lazim tanpa kode — tombol lompat dulu berbunyi "?" di kedua layar.
  ok('G9 label tombol lompat: kode, lalu uraian, lalu "?"',
    labelBarisPj({ kode_rekening: ' 5.1.02 ', uraian: 'X' }) === '5.1.02'
    && labelBarisPj({ kode_rekening: '', uraian: '  Pengurus   Barang ' }) === 'Pengurus Barang'
    && labelBarisPj({ kode_rekening: '', uraian: 'a'.repeat(40) }) === `${'a'.repeat(27)}…`
    && labelBarisPj({ kode_rekening: '', uraian: ' ' }) === '?')
  ok('G10 kedua spanduk memakai label itu, bukan `kode || \'?\'`',
    [PC, DC].every(s => s.includes('{labelBarisPj(p.conflict)}') && s.includes('{labelBarisPj(p.row)}') && !s.includes("kode_rekening || '?'}")))
}

console.log(`\n${lulus} lulus, ${gagal.length} gagal`)
if (gagal.length) { for (const g of gagal) console.log('  - ' + g); process.exit(1) }
