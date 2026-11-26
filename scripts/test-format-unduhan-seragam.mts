// Regresi: unduhan Excel/PDF berbentuk tabel di semua modul = gaya "Resmi berwarna" bersama,
// dan pembaca impor tetap membaca berkas POLOS maupun berkas BERKOP (unduhan PRIMA sendiri).
// Konsep: docs/konsep/sistem/CONCEPT-format-unduhan-seragam.md
//
//   npx tsx scripts/test-format-unduhan-seragam.mts
//
// A. Pengenal baris hiasan (lib/shared/impor-tabel.ts)
// B. Impor Master Akun / Kode Besar BLUD: berkas polos, berkas tanpa kepala, unduhan berkop
// C. Bolak-balik unduh → impor E-Anggaran (Rekening, Master, RKO, Pendapatan) dari berkas berkop
// D. Usulan Kebutuhan: Ringkasan + per sub-bidang, Excel & PDF dari satu susunan
// E. Kerangka bersama: kepala di baris 7, JUMLAH amber, catatan di bawah tabel
import { readFileSync } from 'node:fs'
import { jenisBarisHiasan, barisDataImpor, kepalaKodeUraian, cariBarisKepala } from '../lib/shared/impor-tabel'
import { tulisTabelExcel, type DokTabel } from '../lib/shared/tabel-dokumen'
import { BARIS_KEPALA, argb } from '../lib/shared/gaya-dokumen'
import { loadExcelJs, readXlsxAsAoa } from '../lib/shared/excel-export'

let lulus = 0, gagal = 0
function ok(nama: string, syarat: boolean, info = '') {
  if (syarat) { lulus++; console.log(`  ok  ${nama}`) }
  else { gagal++; console.log(`FAIL  ${nama}${info ? ` — ${info}` : ''}`) }
}
const ExcelJS = await loadExcelJs()
const keBuffer = async (wb: import('exceljs').Workbook) => Buffer.from(await wb.xlsx.writeBuffer())

console.log('\n── A. Pengenal baris hiasan ──────────────────────────────────────')
ok('A1 nomor kolom (1)(2)(3)', jenisBarisHiasan(['(1)', '(2)', '(3)']) === 'nomor')
ok('A2 nomor kolom polos 1 2 3', jenisBarisHiasan([1, 2, 3, 4]) === 'nomor')
ok('A3 dua kolom berkurung (1)(2) = nomor (tabel Kode | Uraian)', jenisBarisHiasan(['(1)', '(2)']) === 'nomor')
ok('A4 dua kolom polos "1 2" BUKAN nomor — terlalu mirip baris data', jenisBarisHiasan(['1', '2']) === null)
ok('A5 nomor tidak berurutan bukan nomor', jenisBarisHiasan(['(1)', '(3)', '(4)']) === null)
ok('A6 kop gabung (teks sama di semua sel) = judul', jenisBarisHiasan(['MASTER AKUN', 'MASTER AKUN']) === 'judul')
ok('A7 JUMLAH + angka = jumlah', jenisBarisHiasan(['', 'JUMLAH', 1000, 2000]) === 'jumlah')
ok('A8 "Jumlah pasien dilayani" (indikator) BUKAN baris jumlah', jenisBarisHiasan(['1', 'Jumlah pasien dilayani', 'Orang', 100]) === null)
ok('A9 tanda tangan = penutup', jenisBarisHiasan(['NIP. 19800101 200501 1 001']) === 'penutup')
ok('A10 catatan gabung = penutup', jenisBarisHiasan(['Catatan: angka sementara', 'Catatan: angka sementara']) === 'penutup')
ok('A11 baris data biasa = null', jenisBarisHiasan(['5.1.02', 'Belanja ATK', 1000000]) === null)
ok('A12 baris kosong = null', jenisBarisHiasan(['', null, undefined]) === null)
ok('A13 kepala dicari melewati kop', cariBarisKepala([['JUDUL', 'JUDUL'], ['Kode', 'Uraian'], ['1', 'x']], b => b.includes('Kode')) === 1)

console.log('\n── B. Impor Master Akun / Kode Besar BLUD ────────────────────────')
{
  const polos = [['Kode', 'Uraian'], ['5.1.02.01', 'Belanja Barang'], ['5.1.02.02', 'Belanja Jasa']]
  ok('B1 berkas polos (kepala baris 1): dua baris data', JSON.stringify(barisDataImpor(polos, kepalaKodeUraian)) === JSON.stringify(polos.slice(1)))
  const tanpaKepala = [['5.1.02.01', 'Belanja Barang'], ['5.1.02.02', 'Nama Akun Lain']]
  ok('B2 berkas tanpa kepala: semua baris dipakai', barisDataImpor(tanpaKepala, kepalaKodeUraian).length === 2)
  // Data yang KEBETULAN berawalan "Nama"/"Uraian" tidak boleh dikira kepala (membuang baris di atasnya).
  const jebakan = [['5.1.02.01', 'Belanja Barang'], ['5.1.02.03', 'Uraian Akun Tambahan']]
  ok('B3 uraian berawalan "Uraian" di baris data tidak dikira kepala', barisDataImpor(jebakan, kepalaKodeUraian).length === 2)
  // Kepala WAJIB menyebut Kode DAN Uraian: sel "Nama Akun" sendirian di baris data bukan kepala.
  ok('B3b sel persis "Nama Akun" di baris data (tanpa "Kode") tidak dikira kepala',
    barisDataImpor([['5.1', 'Belanja Pegawai'], ['5.2', 'Nama Akun']], kepalaKodeUraian).length === 2)

  // Berkop: unduhan bergaya resmi (kop 1–5, garis 6, kepala 7, nomor kolom 8, catatan).
  const wb = new ExcelJS.Workbook()
  tulisTabelExcel(wb.addWorksheet('Master Akun'), {
    kop: { judul: 'REKAP MASTER AKUN', periode: 'TAHUN ANGGARAN 2099', modul: 'BLUD' },
    kolom: [{ judul: 'Kode', jenis: 'kode' }, { judul: 'Uraian', jenis: 'uraian' }],
    baris: [{ sel: ['5.1.02.01', 'Belanja Barang'] }, { sel: ['5.1.02.02', 'Belanja Jasa'] }],
    catatan: ['Catatan: daftar diunduh untuk diperiksa.'],
  })
  const raw = await readXlsxAsAoa(new File([await keBuffer(wb)], 'master-akun.xlsx'))
  const data = barisDataImpor(raw, kepalaKodeUraian).filter(r => String(r[1] ?? '').trim())
  ok('B4 unduhan berkop: hanya dua baris data terbaca (kop, (1)(2), catatan dilewati)',
    data.length === 2 && data[0][0] === '5.1.02.01' && data[1][1] === 'Belanja Jasa', JSON.stringify(data))

  const src = (p: string) => readFileSync(p, 'utf8')
  for (const p of ['app/(dashboard)/blud/master-akun/master-akun-client.tsx', 'app/(dashboard)/blud/kode-besar/kode-besar-client.tsx']) {
    ok(`B5 ${p.split('/')[3]}: impor lewat barisDataImpor + kepalaKodeUraian`, /for \(const r of barisDataImpor\(raw, kepalaKodeUraian\)\)/.test(src(p)))
  }
}

console.log('\n── C. Bolak-balik unduh → impor E-Anggaran (berkas berkop) ───────')
{
  const X = await import('../app/(dashboard)/kinerja/_exports')
  const { parseRekeningImport } = await import('../lib/data/kinerja-import-rekening')
  const { parseMasterImport } = await import('../lib/data/kinerja-import-master')
  const { parseRkoImport } = await import('../lib/data/kinerja-import-rko')
  const { parsePendapatanBuffer } = await import('../lib/data/kinerja-import')
  const satu = async (dok: DokTabel, nama: string) => {
    const wb = new ExcelJS.Workbook(); tulisTabelExcel(wb.addWorksheet(nama), dok); return keBuffer(wb)
  }

  // Nama realistis — nama mirip judul kolom ("PROGRAM A", "SSK A") memang sengaja dibuang
  // pembaca sebagai echo kepala berulang (berkas gabungan multi-halaman).
  const P = 'PROGRAM PENUNJANG URUSAN PEMERINTAHAN', K = 'Administrasi Umum Perangkat Daerah'
  const rek = [
    { id: 1, program: P, kegiatan: K, subkegiatan: 'Penyediaan Alat Tulis', uraian_ssk: 'Alat Tulis Kantor', uraian: 'Belanja ATK', sumber_anggaran: 'BLUD' },
    { id: 2, program: P, kegiatan: K, subkegiatan: 'Penyediaan Alat Tulis', uraian_ssk: 'Alat Tulis Kantor', uraian: 'Belanja Cetak', sumber_anggaran: 'BLUD' },
  ]
  const hRek = await parseRekeningImport(await satu(X.dokRekening(rek, 'BLUD', '2099'), 'Rekening BLUD'))
  ok('C1 Rekening: dua baris, kop & nomor kolom tidak ikut', hRek.rows.length === 2
    && hRek.rows.map(r => r.uraian).join('|') === 'Belanja ATK|Belanja Cetak' && hRek.rows[0].program === P,
    JSON.stringify(hRek.rows.map(r => r.uraian)) + ' ' + hRek.warnings.join(' / '))

  const opts = {
    program: ['PROGRAM A', 'PROGRAM B'], programRows: [], kegiatan: ['KEG A'],
    kegiatanRows: [{ id: 1, tipe: 'kegiatan' as const, sumber: null, nama: 'KEG A', program_ref: 'PROGRAM A', kegiatan_ref: null, subkegiatan_ref: null, urut: 1 }],
    subkegiatan: [], subkegiatanRows: [], sumber_anggaran: ['BLUD'], uraian_ssk: [], sskRows: [],
  }
  const wbM = new ExcelJS.Workbook()
  for (const { tipe, sheet } of X.MASTER_SHEET) tulisTabelExcel(wbM.addWorksheet(sheet), X.dokMaster(opts, tipe, sheet, '2099'))
  const hM = await parseMasterImport(await keBuffer(wbM))
  const nama = hM.rows.map(r => `${r.tipe}:${r.nama}`).sort().join('|')
  ok('C2 Master: kelima lembar terbaca, kop tidak jadi entri', nama === 'kegiatan:KEG A|program:PROGRAM A|program:PROGRAM B|sumber_anggaran:BLUD', nama)
  ok('C3 Master: rujukan induk ikut', hM.rows.find(r => r.nama === 'KEG A')?.program_ref === 'PROGRAM A')

  const bulan = (v: number) => ({ jan: v, feb: v, mar: v, apr: v, mei: v, jun: v, jul: v, agu: v, sep: v, okt: v, nov: v, des: v })
  const ssk = [
    { uraian_ssk: 'SSK A', uraian: 'Belanja ATK', program: '', kegiatan: '', subkegiatan: '', pagu: 1_200_000, months: bulan(100_000), months_pct: bulan(8.33), total: 1_200_000, total_pct: 100 },
    { uraian_ssk: 'SSK A', uraian: 'Belanja Cetak', program: '', kegiatan: '', subkegiatan: '', pagu: 2_400_000, months: bulan(200_000), months_pct: bulan(8.33), total: 2_400_000, total_pct: 100 },
  ]
  const hR = await parseRkoImport(await satu(X.dokSsk(ssk, 'BLUD', '2099'), 'RKO BLUD'))
  ok('C4 RKO: dua rekening, baris JUMLAH tidak jadi rekening', hR.rows.length === 2
    && hR.rows.map(r => r.uraian).join('|') === 'Belanja ATK|Belanja Cetak', JSON.stringify(hR.rows.map(r => r.uraian)) + ' ' + hR.warnings.join(' / '))
  ok('C5 RKO: pagu & bulan terbaca utuh', hR.rows[1]?.pagu === 2_400_000 && hR.rows[1]?.months.des === 200_000, JSON.stringify(hR.rows[1]))

  // Templat kantor lain: judul gabung yang memuat kata kepala ("URAIAN", "PAGU", nama bulan)
  // tidak boleh dikira baris kepala — kepala aslinya di baris 3.
  {
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('RKO BLUD')
    const BLN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']
    ws.getCell(1, 1).value = 'RENCANA URAIAN PAGU JANUARI S.D. DESEMBER'
    ws.mergeCells(1, 1, 1, 14)
    ws.getRow(3).values = ['Uraian', 'Pagu', ...BLN]
    ws.getRow(4).values = ['Belanja Listrik', 1_200, ...BLN.map(() => 100)]
    ws.getRow(5).values = ['Belanja Air', 2_400, ...BLN.map(() => 200)]
    const h = await parseRkoImport(await keBuffer(wb))
    ok('C4b RKO templat lain: judul gabung berisi kata kepala dilewati', h.rows.map(r => `${r.uraian}:${r.pagu}`).join('|') === 'Belanja Listrik:1200|Belanja Air:2400',
      JSON.stringify(h.rows.map(r => r.uraian)) + ' ' + h.warnings.join(' / '))
  }

  // Pembaca layout sederhana mensyaratkan ≥ 6 bulan (aturan lama parseSimple).
  const NAMA = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli']
  const pend = NAMA.map((keterangan, i) => ({ keterangan, target: 1_000, realisasi: 900 + i * 100, capaian_pct: 90 + i * 10 }))
  const hP = await parsePendapatanBuffer(await satu(X.dokPendapatan(pend, '2099'), 'Pendapatan 2099'))
  const real = hP.months.map(m => `${m.bulan_ke}:${m.realisasi}`).join('|')
  ok('C6 Pendapatan: tujuh bulan terbaca, JUMLAH tidak jadi bulan', real === NAMA.map((_, i) => `${i + 1}:${900 + i * 100}`).join('|'), real + ' ' + hP.warnings.join(' / '))
}

console.log('\n── D. Usulan Kebutuhan ───────────────────────────────────────────')
{
  const U = await import('../app/(dashboard)/usulan-kebutuhan/_exports')
  const kepala = (id: number, sub: string, total: number) => ({
    id, no_usulan: `U-${id}`, tanggal: '2099-01-10T17:00:00.000Z', pengusul: 'Uji', sub_bidang: sub, jenis_belanja: 'Barang',
    jumlah_item: 1, total_nilai: total, total_nominal: total, status_ringkas: 'DIAJUKAN',
  })
  const item = (id: number, total: number, status = 'DIAJUKAN') => ({
    id, no_item: 1, nama_barang: `Barang ${id}`, spesifikasi: '', qty: 2, satuan: 'unit', harga_est: total / 2, total_est: total,
    prioritas: 'SEDANG', status, nominal_disetujui: status === 'DISETUJUI' ? total : 0, admin_nominal: 0, kasubag_nominal: 0,
  })
  const rows = [kepala(1, 'Sub A', 1_000_000), kepala(2, 'Sub A', 500_000), kepala(3, 'Sub B', 300_000)]
  const itemsMap = { 1: [item(11, 1_000_000, 'DISETUJUI')], 2: [item(21, 500_000)], 3: [] } as never
  const wb = await U.buatWorkbookUsulan(rows as never, itemsMap)
  ok('D1 lembar: Ringkasan + satu per sub-bidang', wb.worksheets.map(w => w.name).join('|') === 'Ringkasan|Sub A|Sub B')
  const ring = wb.getWorksheet('Ringkasan')!
  ok('D2 Ringkasan: kepala di baris 7', ring.getRow(BARIS_KEPALA).getCell(1).value === 'Sub Bidang')
  let jumlahRing: unknown[] = []
  ring.eachRow(r => { if (r.getCell(1).value === 'JUMLAH') jumlahRing = (r.values as unknown[]).slice(1) })
  ok('D3 Ringkasan: JUMLAH = 3 usulan, Rp 1.800.000, disetujui Rp 1.000.000',
    jumlahRing[1] === 3 && jumlahRing[3] === 1_800_000 && jumlahRing[6] === 1_000_000, JSON.stringify(jumlahRing))
  const subA = wb.getWorksheet('Sub A')!
  let jumlahA: unknown[] = [], adaSubtotal = false, adaKosong = false
  subA.eachRow(r => {
    if (r.getCell(2).value === 'JUMLAH') jumlahA = (r.values as unknown[]).slice(1)
    if (String(r.getCell(2).value ?? '').startsWith('Subtotal U-1')) adaSubtotal = true
  })
  wb.getWorksheet('Sub B')!.eachRow(r => { if (r.getCell(2).value === '(data item tidak tersedia)') adaKosong = true })
  ok('D4 Sub A: subtotal per usulan + JUMLAH sub-bidang Rp 1.500.000', adaSubtotal && jumlahA[6] === 1_500_000, JSON.stringify(jumlahA))
  ok('D5 Sub B: usulan tanpa item tetap tertulis', adaKosong)
  ok('D6 JUMLAH berlatar amber (gaya bersama)', ring.getRow(BARIS_KEPALA + 4).getCell(1).fill?.type === 'pattern'
    && (ring.getRow(BARIS_KEPALA + 4).getCell(1).fill as { fgColor?: { argb?: string } }).fgColor?.argb === argb('amber'))
  ok('D7 tanpa tanda tangan (daftar kerja)', !JSON.stringify(ring.getSheetValues()).includes('NIP'))

  const doc = await U.buatPdfUsulan('Data Usulan', rows as never, itemsMap)
  const pdf = doc.output()
  ok('D8 PDF: halaman Ringkasan + satu per sub-bidang', doc.getNumberOfPages() === 3, String(doc.getNumberOfPages()))
  ok('D9 PDF: kaki halaman modul & kop sub-bidang', pdf.includes('PRIMA - USULAN KEBUTUHAN') && pdf.includes('SUB BIDANG SUB A'))
}

console.log('\n── E. Kerangka bersama ───────────────────────────────────────────')
{
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Uji')
  const letak = tulisTabelExcel(ws, {
    kop: { judul: 'UJI', modul: 'UJI', keterangan: 'versi uji' },
    kolom: [{ judul: 'Uraian', jenis: 'uraian' }, { judul: 'Nilai', jenis: 'rupiah' }],
    baris: [{ sel: ['A', 1] }, { sel: ['JUMLAH', 1], total: true }],
    catatan: ['Catatan: uji.'],
  })
  ok('E1 kepala di baris 7, nomor kolom di 8, data mulai 9', letak.kepalaAwal === 7 && letak.kepalaAkhir === 8 && letak.dataAwal === 9)
  ok('E2 keterangan di baris 5 (penanda versi/Perubahan)', ws.getRow(5).getCell(1).value === 'versi uji')
  ok('E3 catatan di bawah tabel, bukan di kop', ws.getRow(letak.dataAwal + 2).getCell(1).value === 'Catatan: uji.'
    || ws.getRow(letak.dataAwal + 3).getCell(1).value === 'Catatan: uji.')
  ok('E4 kolom rupiah berformat rupiah', String(ws.getRow(9).getCell(2).numFmt).startsWith('#,##0'))
}

console.log(`\n${lulus} lulus, ${gagal} gagal`)
if (gagal) process.exit(1)
