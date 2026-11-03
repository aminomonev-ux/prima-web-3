#!/usr/bin/env npx tsx
// scripts/test-kinerja-versi-cetak.mts — versi SSK di Cetak per sumber, Buat Perubahan dari RKO
// yang kosong, pagar Simpan MURNI sesudah ada Perubahan, dropdown Renaksi yang terpotong.
// Konsep: docs/CONCEPT-kinerja-versi-cetak.md.
// Jalankan: npx tsx --env-file=.env.local scripts/test-kinerja-versi-cetak.mts
// Bagian D memakai MySQL sungguhan (kotak pasir 2096), dibersihkan otomatis — tanpa
// --env-file bagian itu DILEWATI dan jumlah lulusnya turun.
import { readFileSync } from 'node:fs'
import mysql from 'mysql2/promise'
import { versiCetak, imbuhanBerkasVersiCetak } from '../lib/kinerja/versi'
import { hitungJumlahBulan, catatanYatimBulan, tandaYatim } from '../lib/kinerja/cetak-detail'
import { kopDetail, barisBulanDetail, namaBerkasRealisasi, namaBundel } from '../app/(dashboard)/kinerja/_exports'
import type { RealRow } from '../app/(dashboard)/kinerja/_types'

let lulus = 0
const gagal: string[] = []
function ok(nama: string, syarat: unknown, ket = '') {
  if (syarat) { lulus++; console.log(`  ok  ${nama}`) }
  else { gagal.push(nama); console.log(`FAIL  ${nama}${ket ? ' — ' + ket : ''}`) }
}
const sumber = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
const tanpaKomentar = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
const badan = (isi: string, awal: string) => { const i = isi.indexOf(awal); return i < 0 ? '' : isi.slice(i, isi.indexOf('\n}\n', i)) }
const coba = async <T,>(f: () => Promise<T>): Promise<T | Error> => { try { return await f() } catch (e) { return e as Error } }

const baris = (o: Partial<RealRow>): RealRow => ({
  bulan: 1, keterangan: 'Belanja', pagu_awal: 0, target_rp: 0, akum_target_rp: 0, target_fisik: 0,
  real_fisik: 0, pct_fisik: 0, akum_target_fisik: 0, akum_real_fisik: 0, akum_pct_fisik: 0,
  real_keuangan: 0, pct_keuangan: 0, akum_keuangan: 0, akum_pct_keuangan: 0, deviasi_fisik: 0, deviasi_keuangan: 0,
  ...o,
} as RealRow)

// ─────────────────────────────────────────────────────────────────────────────
console.log('A. Aturan murni — versi tercetak & rekening yatim')
const slot = [
  { versi_tipe: 'MURNI', versi_seq: 0 },
  { versi_tipe: 'PERUBAHAN', versi_seq: 1 },
]
const vMurni = versiCetak(slot, 'MURNI', 0)
const vP1    = versiCetak(slot, 'PERUBAHAN', 1)
ok('A1 versiCetak: MURNI saat ada PERUBAHAN-1 = bukan terbaru, label "MURNI"', vMurni.label === 'MURNI' && !vMurni.terbaru, JSON.stringify(vMurni))
ok('A2 versiCetak: PERUBAHAN-1 = terbaru', vP1.label === 'PERUBAHAN-1' && vP1.terbaru, JSON.stringify(vP1))
ok('A3 daftar kosong (belum dimuat / RKO kosong) dianggap terbaru — nama tanpa sisipan = versi berlaku',
  versiCetak([], 'MURNI', 0).terbaru)
// Urutan masukan sengaja PERUBAHAN dulu: pemilih "terakhir di larik" lulus pada urutan alami.
ok('A4 terbaru ditentukan pickVersiAktif, bukan urutan larik',
  !versiCetak([{ versi_tipe: 'PERUBAHAN', versi_seq: 2 }, { versi_tipe: 'PERUBAHAN', versi_seq: 1 }], 'PERUBAHAN', 1).terbaru
  && versiCetak([{ versi_tipe: 'PERUBAHAN', versi_seq: 2 }, { versi_tipe: 'MURNI', versi_seq: 0 }], 'PERUBAHAN', 2).terbaru)
ok('A5 sisipan nama berkas hanya untuk versi BUKAN terbaru',
  imbuhanBerkasVersiCetak(vMurni) === 'Murni-' && imbuhanBerkasVersiCetak(vP1) === ''
  && imbuhanBerkasVersiCetak({ label: 'PERUBAHAN-1', terbaru: false }) === 'Perubahan-1-')
ok('A6 nama berkas detail: versi terbaru tidak berubah dari nama lama, MURNI disisipi',
  namaBerkasRealisasi('GAJI', '2026', [1, 2], 'xlsx', vP1) === 'Realisasi-GAJI-2026.xlsx'
  && namaBerkasRealisasi('GAJI', '2026', [1], 'pdf', vMurni) === 'Realisasi-GAJI-Murni-Januari-2026.pdf',
  namaBerkasRealisasi('GAJI', '2026', [1], 'pdf', vMurni))
ok('A7 nama bundel ikut pilihan versi Rekap',
  namaBundel('berlaku', 'Maret', '2026', 'xlsx') === 'Laporan-Realisasi-2026-sd-Maret.xlsx'
  && namaBundel('murni', 'Maret', '2026', 'pdf') === 'Laporan-Realisasi-Murni-2026-sd-Maret.pdf')
const kop = kopDetail('GAJI', 3, '2026', 'MURNI')
ok('A8 kop detail menyebut versi di baris ke-4, jumlah baris kop tetap 4',
  kop.length === 4 && kop[3].teks === 'BULAN MARET TAHUN 2026 · SSK MURNI', JSON.stringify(kop[3]))

const isi = [
  baris({ keterangan: 'A', pagu_awal: 1_000, target_rp: 100, akum_target_rp: 300, real_keuangan: 50, akum_keuangan: 250, real_fisik: 60, akum_real_fisik: 200 }),
  baris({ keterangan: 'Lahir di Perubahan', yatim: true, pagu_awal: 0, real_keuangan: 70, akum_keuangan: 90, real_fisik: 70, akum_real_fisik: 90 }),
]
const j = hitungJumlahBulan(isi)
ok('A9 JUMLAH melewati baris yatim — realisasinya tidak menaikkan persen tanpa penyebut',
  j.realKeu === 50 && j.akumKeu === 250 && j.realFisik === 60 && j.pctKeu === 5 && j.akumPctKeu === 25, JSON.stringify(j))
ok('A10 ringkasan yatim dipulangkan untuk catatannya',
  j.yatim.jumlah === 1 && j.yatim.realKeu === 70 && j.yatim.akumKeu === 90, JSON.stringify(j.yatim))
const jTanpa = hitungJumlahBulan([isi[0]])
ok('A11 tanpa yatim: JUMLAH sama persis dengan sebelumnya, catatan null',
  jTanpa.realKeu === j.realKeu && jTanpa.pagu === j.pagu && jTanpa.yatim.jumlah === 0 && catatanYatimBulan(jTanpa, 'MURNI') === null)
const cat = catatanYatimBulan(j, 'MURNI') ?? ''
ok('A12 catatan menyebut jumlah rekening, versi, dan kedua rupiahnya',
  cat.startsWith(`1 rekening ${tandaYatim('MURNI')}`) && cat.includes('Rp 70') && cat.includes('Rp 90') && cat.includes('tidak ikut dijumlah'), cat)
const bd = barisBulanDetail(isi, false, 'MURNI')
ok('A13 berkas menandai baris yatim di Uraian, baris biasa tidak',
  bd[1][1] === `Lahir di Perubahan (${tandaYatim('MURNI')})` && bd[0][1] === 'A', JSON.stringify(bd.map(b => b[1])))
ok('A14 baris JUMLAH berkas = hitungJumlahBulan (yatim keluar)', bd[bd.length - 1][1] === 'JUMLAH' && bd[bd.length - 1][9] === '50')

// ─────────────────────────────────────────────────────────────────────────────
// Berkasnya dibangun sungguhan — yang diperiksa ISI berkas, bukan teks sumber penulisnya.
console.log('\nC. Berkas sungguhan (exceljs & jsPDF di Node)')
{
  const { loadExcelJs } = await import('../lib/shared/excel-export')
  const X = await import('../app/(dashboard)/kinerja/_exports')
  const ExcelJS = await loadExcelJs()
  const sel = (isiBaris: RealRow[]) => {
    const ws = new ExcelJS.Workbook().addWorksheet('GAJI')
    X.tulisSheetDetailPerBulan(ws, isiBaris, 'GAJI', '2026', [1], 'MURNI')
    const teks: string[] = []
    ws.eachRow(r => r.eachCell(c => { teks.push(String(c.value ?? '')) }))
    return teks
  }
  const xl = sel(isi)
  ok('C1 Excel: kop menyebut versinya', xl.includes('BULAN JANUARI TAHUN 2026 · SSK MURNI'))
  ok('C2 Excel: catatan yatim tertulis utuh di bawah tabel', xl.includes(cat), xl.filter(t => t.includes('rekening')).join(' | '))
  ok('C3 Excel: baris yatim bertanda di Uraian', xl.includes(`Lahir di Perubahan (${tandaYatim('MURNI')})`))
  ok('C4 Excel tanpa yatim: tanpa catatan', !sel([isi[0]]).some(t => t.includes('tidak ikut dijumlah')))

  const { jsPDF, autoTable } = await X.loadPdf()
  const pdf = (isiBaris: RealRow[]) => {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a3' })
    X.gambarDetailPdf(doc, autoTable, isiBaris, 'GAJI', '2026', [1], false, 'MURNI')
    return doc.output()
  }
  const p = pdf(isi)
  ok('C5 PDF: kop menyebut versi & catatan yatim ikut tercetak', p.includes('SSK MURNI') && p.includes('tidak ikut dijumlah'))
  ok('C6 PDF tanpa yatim: tanpa catatan', !pdf([isi[0]]).includes('tidak ikut dijumlah'))
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\nB. Bentuk kode — semua pintu memakai satu aturan')
const ex = tanpaKomentar(sumber('app/(dashboard)/kinerja/_exports.ts'))
ok('B1 kop detail: kedua penulis (PDF & Excel) mengoper versi',
  (ex.match(/kopDetail\(sumber, b, tahun, versi\)/g) || []).length === 2)
ok('B2 catatan yatim di bawah tabel PDF DAN Excel',
  (ex.match(/catatanYatimBulan\(hitungJumlahBulan\(barisBulan\), versi\)/g) || []).length === 2)
ok('B3 bundel: versi tiap bagian dari bagian itu sendiri',
  /tulisSheetDetailPerBulan\(wb\.addWorksheet\(bagian\.sumber\), baris, bagian\.sumber, params\.tahun, bagian\.bulan, bagian\.versi\)/.test(ex)
  && /gambarDetailPdf\(doc, autoTable, baris, bagian\.sumber, params\.tahun, bagian\.bulan, true, bagian\.versi\)/.test(ex))
const ct = tanpaKomentar(sumber('app/(dashboard)/kinerja/_tabs/CetakTab.tsx'))
ok('B4 Cetak: pemilih versi = setter shell, TANPA Buat Perubahan',
  /<VersiPickerKinerja[\s\S]{0,200}?onChange=\{v => pilihVersi\(v\)\}/.test(ct) && !/onCreatePerubahan/.test(ct))
ok('B5 Cetak: unduhan Detail membawa versi yang sama dengan label layar',
  (ct.match(/versi: versiDetail \}\)/g) || []).length === 2 && /const versiLabel\s+= versiDetail\.label/.test(ct))
ok('B6 Cetak: versi bagian bundel dari versiRekap, bukan sskVersi',
  /versiRekap\.find\(x => x\.sumber === sm\)/.test(ct) && /versi: v\?\.tipe \? labelVersi\(v\.tipe, v\.seq\)/.test(ct))
ok('B7 Cetak: kop layar menyebut versi & catatan yatim tampil di layar', /TAHUN \{tahun\} · SSK \{versiLabel\}/.test(ct) && /catatanYatimBulan\(jml, versiLabel\)/.test(ct))
const kc = tanpaKomentar(sumber('app/(dashboard)/kinerja/kinerja-client.tsx'))
ok('B8 shell mengoper pilihVersi ke Cetak (state yang sama dengan Realisasi)',
  /<CetakTab[\s\S]{0,700}?pilihVersi=\{pilihVersi\}/.test(kc))
const rt = tanpaKomentar(sumber('app/(dashboard)/kinerja/_tabs/RealisasiTab.tsx'))
ok('B9 Realisasi & Cetak memakai pemuat daftar versi yang sama',
  /useDaftarVersiSsk\(tahun, realisasiSumber\)/.test(rt) && /useDaftarVersiSsk\(tahun, realisasiSumber\)/.test(ct)
  && !/ssk\/versi-list/.test(rt))
ok('B10 unduhan tab Realisasi ikut membawa versi (L69)', (rt.match(/versi: versiUnduh \}\)/g) || []).length === 2)
const vp = tanpaKomentar(sumber('components/kinerja/VersiPickerKinerja.tsx'))
ok('B11 lencana LATEST memakai pickVersiAktif (satu aturan, L88)', /const latestItem = pickVersiAktif\(items\)/.test(vp) && !/items\.reduce/.test(vp))

const kj = tanpaKomentar(sumber('lib/data/kinerja.ts'))
const buat = badan(kj, 'export async function buatVersiPerubahan(')
const iKosong = buat.indexOf('if (sourceRows.length === 0)')
const cabangKosong = buat.slice(iKosong, buat.indexOf('copied = sourceRows.length', iKosong))
ok('B12 RKO kosong: diizinkan HANYA dari MURNI dan tanpa versi lain; selain itu dilempar',
  /if \(fromTipe !== 'MURNI' \|\| adaVersiLain\) \{\s*throw new KinerjaVersiSumberKosongError/.test(cabangKosong)
  && /return;/.test(cabangKosong) && !/UPDATE kinerja_ssk/.test(cabangKosong), cabangKosong.slice(0, 300))
ok('B13 "ada versi lain" dihitung di dalam transaksi atas seluruh versi sumber',
  /SELECT COUNT\(\*\) AS n FROM kinerja_ssk WHERE tahun = \$\{tahun\} AND sumber = \$\{sumber\}\s*`/.test(cabangKosong))
const save = badan(kj, 'export async function saveSskBatch(')
const iTx = save.indexOf('withTransaction(async ({ tx, conn })')
const iKunci = save.indexOf('await kunciVersiSsk(tx, tahun, sumber)')
const iVer = save.indexOf('FROM blud_locks WHERE entity = ${lockEntity}')
ok('B14 saveSskBatch: kunci (tahun, sumber) perintah PERTAMA, sebelum blud_locks', iKunci > iTx && iTx >= 0 && iKunci < iVer, `tx ${iTx} kunci ${iKunci} ver ${iVer}`)
const iPagar = save.indexOf("if (versiTipe === 'MURNI')")
ok('B15 pagar MURNI menghitung PERUBAHAN dan menolak dengan KinerjaVersiTerkunciError, sebelum DELETE',
  iPagar > 0 && iPagar < save.indexOf('DELETE FROM kinerja_ssk')
  && /versiTipe === 'MURNI'\) \{[\s\S]{0,260}?versi_tipe = 'PERUBAHAN'[\s\S]{0,200}?> 0\) \{\s*throw new KinerjaVersiTerkunciError\(versiTipe, versiSeq,/.test(save))
const rp = tanpaKomentar(sumber('app/api/kinerja/ssk/perubahan/route.ts'))
// Jendelanya lebar: cabang "ada salinan" kini juga menyebut foto realisasi (tutup-per-versi).
ok('B16 audit membedakan Perubahan tanpa salinan', /copied > 0[\s\S]{0,520}?tanpa salinan: RKO murni kosong/.test(rp))
const st = tanpaKomentar(sumber('app/(dashboard)/kinerja/_tabs/SskTab.tsx'))
ok('B17 layar RKO: copied 0 → pesan "baru tercatat sesudah disimpan", bukan "dikunci"',
  /if \(copied > 0\) toast\.success[\s\S]{0,120}?else toast\.success\([\s\S]{0,260}?baru tercatat sesudah disimpan/.test(st))
ok('B18 dialog Buat Perubahan saat RKO kosong tidak menjanjikan penguncian',
  /\{rkoKosong \? \([\s\S]{0,400}?tidak ada yang disalin[\s\S]{0,120}?\) : \(/.test(st) && /const rkoKosong\s+= !versiLoading && versiItems\.length === 0/.test(st))
ok('B19 RKO kosong + isian belum tersimpan: tidak menyuruh "Simpan dulu" ke MURNI',
  /toast\.error\(rkoKosong\s*\?[\s\S]{0,260}?Buat Perubahan, lalu isi di PERUBAHAN-1/.test(st))
const md = sumber('app/(dashboard)/rencana-aksi/_components/MainDashboard.tsx')
const kartu = md.slice(md.indexOf('Main indicator card'), md.indexOf('Main indicator card') + 600)
ok('B20 Renaksi: kartu indikator tanpa overflow-hidden (menu pemilih tidak terpotong), bilah gradien berujung bundar sendiri',
  /<div className="relative mb-6 rounded-2xl bg-white p-6/.test(kartu) && !/<div className="[^"]*overflow-hidden[^"]*rounded-2xl bg-white p-6/.test(kartu)
  && /absolute top-0 left-0 h-1\.5 w-full rounded-t-2xl/.test(kartu))

// ─────────────────────────────────────────────────────────────────────────────
console.log('\nD. MySQL sungguhan (kotak pasir 2096)')
const TAHUN = '2096'
let c: mysql.Connection | null = null
try {
  c = await mysql.createConnection({
    host: process.env.MYSQL_HOST, port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER, password: process.env.MYSQL_PASSWORD, database: process.env.MYSQL_DATABASE,
  })
} catch (e) { console.log(`DILEWATI bagian DB: MySQL tidak bisa dihubungi (${(e as { code?: string }).code ?? e})`) }
if (c) {
  const k = c
  const SUMBER_UJI = ['OBAT', 'GAJI'] as const
  // L92: kunci uji dihapus PERSIS, bukan `WHERE entity = ?` — entity itu dipakai data asli.
  const bersih = async () => {
    // Buat Perubahan memotret realisasi & menaikkan gembok realisasi (CONCEPT-kinerja-tutup-per-versi).
    await k.query('DELETE FROM kinerja_realisasi_foto WHERE tahun = ?', [TAHUN])
    await k.query('UPDATE kinerja_ssk SET parent_versi_id = NULL WHERE tahun = ?', [TAHUN])
    await k.query('DELETE FROM kinerja_ssk WHERE tahun = ?', [TAHUN])
    await k.query('DELETE FROM kinerja_riwayat_simpan WHERE tahun = ?', [TAHUN])
    for (const s of SUMBER_UJI) {
      await k.query("DELETE FROM blud_locks WHERE entity IN ('kinerja_versi_ssk', 'kinerja_realisasi') AND key_id = ?", [`${TAHUN}:${s}`])
      for (const v of ['MURNI:0', 'PERUBAHAN:1', 'PERUBAHAN:2']) {
        await k.query("DELETE FROM blud_locks WHERE entity = 'kinerja_ssk' AND key_id = ?", [`${TAHUN}:${s}:${v}`])
      }
    }
  }
  const n = async (q: string, p: unknown[] = []) => Number(((await k.query(q, p)) as [Array<{ n: number }>, unknown])[0][0]?.n ?? 0)
  const nBaris = (s: string, tipe: string, seq: number) =>
    n('SELECT COUNT(*) AS n FROM kinerja_ssk WHERE tahun = ? AND sumber = ? AND versi_tipe = ? AND versi_seq = ?', [TAHUN, s, tipe, seq])
  await bersih()
  try {
    const K = await import('../lib/data/kinerja')
    const [usr] = await k.query('SELECT id FROM users ORDER BY id LIMIT 1') as [Array<{ id: number }>, unknown]
    const userId = Number(usr[0]?.id ?? 0)
    const rko = (cid: string, pagu: number) => ({
      canonical_id: cid, uraian_ssk: 'Uji', uraian: `Belanja ${cid}`, program: 'P', kegiatan: 'K', subkegiatan: 'S',
      pagu, months: K.emptyMonths(), months_pct: K.emptyMonths(), total: 0, total_pct: 0, urut: 0, is_nullified: false,
    })

    // GAJI diisi DULU: "RKO kosong" wajib dihitung per sumber. Tanpa sumber lain yang berisi
    // di tahun yang sama, hitungan yang lupa saringan sumber tetap memberi 0 dan lolos.
    await K.saveSskBatch(TAHUN, 'GAJI', [rko('K-GAJI-1', 7_000_000), rko('K-GAJI-2', 3_000_000)], userId, 'MURNI', 0)

    // OBAT: tidak dianggarkan di murni.
    const h1 = await K.buatVersiPerubahan(TAHUN, 'OBAT', 'MURNI', 0, userId)
    ok('D1 RKO kosong seluruhnya: Buat Perubahan dari MURNI → PERUBAHAN-1, tanpa salinan, tanpa baris',
      h1.newVersiSeq === 1 && h1.copied === 0 && await n('SELECT COUNT(*) AS n FROM kinerja_ssk WHERE tahun = ? AND sumber = ?', [TAHUN, 'OBAT']) === 0,
      JSON.stringify(h1))
    const ePerubahanKosong = await coba(() => K.buatVersiPerubahan(TAHUN, 'OBAT', 'PERUBAHAN', 1, userId))
    ok('D2 dari PERUBAHAN yang kosong tetap ditolak walau RKO kosong (pilihan basi)',
      ePerubahanKosong instanceof K.KinerjaVersiSumberKosongError && /Buat Perubahan dari MURNI/.test(ePerubahanKosong.message),
      String(ePerubahanKosong instanceof Error ? ePerubahanKosong.message : ePerubahanKosong))

    await K.saveSskBatch(TAHUN, 'OBAT', [rko('K-OBAT-1', 50_000_000)], userId, 'PERUBAHAN', 1, 0)
    ok('D3 Simpan pertama PERUBAHAN-1 → versinya tercatat (baris ada, tanpa induk)',
      await nBaris('OBAT', 'PERUBAHAN', 1) === 1
      && await n('SELECT COUNT(*) AS n FROM kinerja_ssk WHERE tahun = ? AND sumber = ? AND parent_versi_id IS NOT NULL', [TAHUN, 'OBAT']) === 0)

    const eMurni = await coba(() => K.saveSskBatch(TAHUN, 'OBAT', [rko('K-OBAT-M', 1_000)], userId, 'MURNI', 0))
    ok('D4 Simpan ke MURNI sesudah ada Perubahan → KinerjaVersiTerkunciError, tidak ada yang tertulis',
      eMurni instanceof K.KinerjaVersiTerkunciError && /sudah punya versi Perubahan/.test(eMurni.message) && await nBaris('OBAT', 'MURNI', 0) === 0,
      String(eMurni instanceof Error ? eMurni.message : eMurni))

    const eMurniLagi = await coba(() => K.buatVersiPerubahan(TAHUN, 'OBAT', 'MURNI', 0, userId))
    ok('D5 Buat Perubahan dari MURNI kosong padahal versi lain berisi → ditolak dengan kalimat manusia',
      eMurniLagi instanceof K.KinerjaVersiSumberKosongError && /RKO OBAT MURNI kosong, padahal OBAT sudah punya versi lain/.test(eMurniLagi.message),
      String(eMurniLagi instanceof Error ? eMurniLagi.message : eMurniLagi))

    const h2 = await K.buatVersiPerubahan(TAHUN, 'OBAT', 'PERUBAHAN', 1, userId)
    ok('D6 dari PERUBAHAN-1 yang sudah berisi → PERUBAHAN-2 menyalin & mengunci seperti biasa',
      h2.newVersiSeq === 2 && h2.copied === 1 && await nBaris('OBAT', 'PERUBAHAN', 2) === 1
      && await n('SELECT COUNT(*) AS n FROM kinerja_ssk WHERE tahun = ? AND sumber = ? AND versi_seq = 1 AND locked_at IS NOT NULL', [TAHUN, 'OBAT']) === 1,
      JSON.stringify(h2))

    // GAJI: jalur lama tidak berubah.
    const h3 = await K.buatVersiPerubahan(TAHUN, 'GAJI', 'MURNI', 0, userId)
    ok('D7 jalur lama: MURNI berisi → PERUBAHAN-1 menyalin 2 baris, MURNI dikunci, induk tertanam',
      h3.newVersiSeq === 1 && h3.copied === 2
      && await n('SELECT COUNT(*) AS n FROM kinerja_ssk WHERE tahun = ? AND sumber = ? AND versi_tipe = ? AND locked_at IS NOT NULL', [TAHUN, 'GAJI', 'MURNI']) === 2
      && await n('SELECT COUNT(*) AS n FROM kinerja_ssk WHERE tahun = ? AND sumber = ? AND versi_tipe = ? AND parent_versi_id IS NOT NULL', [TAHUN, 'GAJI', 'PERUBAHAN']) === 2,
      JSON.stringify(h3))
    const eTerkunci = await coba(() => K.saveSskBatch(TAHUN, 'GAJI', [rko('K-GAJI-1', 1)], userId, 'MURNI', 0))
    ok('D8 MURNI terkunci tetap ditolak dengan kalimat lamanya (pagar locked_at mendahului pagar baru)',
      eTerkunci instanceof K.KinerjaVersiTerkunciError && eTerkunci.message === 'Versi MURNI-0 sudah dikunci, tidak bisa diubah.',
      String(eTerkunci instanceof Error ? eTerkunci.message : eTerkunci))

    // MURNI dihapus lewat Reset lalu "dipulihkan" sementara Perubahan hidup — lubang lama.
    await k.query("UPDATE kinerja_ssk SET parent_versi_id = NULL WHERE tahun = ? AND sumber = 'GAJI'", [TAHUN])
    await k.query("DELETE FROM kinerja_ssk WHERE tahun = ? AND sumber = 'GAJI' AND versi_tipe = 'MURNI'", [TAHUN])
    const ePulih = await coba(() => K.saveSskBatch(TAHUN, 'GAJI', [rko('K-GAJI-1', 7_000_000)], userId, 'MURNI', 0))
    ok('D9 MURNI yang dihapus lalu dipulihkan saat Perubahan hidup → ditolak (dulu lahir lagi tanpa locked_at)',
      ePulih instanceof K.KinerjaVersiTerkunciError && await nBaris('GAJI', 'MURNI', 0) === 0,
      String(ePulih instanceof Error ? ePulih.message : ePulih))
    const hP = await coba(() => K.saveSskBatch(TAHUN, 'GAJI', [rko('K-GAJI-1', 8_000_000)], userId, 'PERUBAHAN', 1))
    ok('D10 Simpan Perubahan tetap jalan',
      !(hP instanceof Error) && await nBaris('GAJI', 'PERUBAHAN', 1) === 1, String(hP instanceof Error ? hP.message : ''))
  } finally {
    await bersih()
    const sisa = await n(`SELECT (SELECT COUNT(*) FROM kinerja_ssk WHERE tahun = ?)
      + (SELECT COUNT(*) FROM kinerja_riwayat_simpan WHERE tahun = ?)
      + (SELECT COUNT(*) FROM blud_locks WHERE entity IN ('kinerja_versi_ssk', 'kinerja_ssk') AND key_id LIKE ?) AS n`, [TAHUN, TAHUN, `${TAHUN}:%`])
    ok('D11 kotak pasir 2096 bersih kembali', sisa === 0, String(sisa))
    await k.end()
  }
}

console.log(`\n${lulus} lulus, ${gagal.length} gagal`)
if (gagal.length) { console.log(gagal.map(g => `  - ${g}`).join('\n')); process.exit(1) }
process.exit(0)
