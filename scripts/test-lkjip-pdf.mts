// Regresi PDF LKJIP lewat LibreOffice (konsep docs/CONCEPT-lkjip-pratinjau-dan-word.md §1.6).
// npx tsx scripts/test-lkjip-pdf.mts
// Bagian B–C MENJALANKAN LibreOffice sungguhan. Tidak terpasang = GAGAL, bukan dilewati diam-diam.
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { execSync } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import {
  cariLibreOffice, ubahKePdf, hitungHalaman, hurufTertanam, hurufTerpasang, statusAntrean, SKRIP_UNO,
  PdfSibukError, PdfBatasWaktuError, PdfTidakTersediaError, PdfDibatalkanError, BATAS_ANTRE,
} from '../lib/lkjip/pdf'
import { rakitDocx } from '../lib/lkjip/docgen'
import { buildNumberedTree, type SectionFlat, type BlockNode } from '../lib/lkjip/numbering'
import { DEFAULT_STYLE } from '../lib/lkjip/schemas'

let lulus = 0, gagal = 0
const ok = (nama: string, syarat: boolean, info?: unknown) => {
  if (syarat) { lulus++; console.log(`  ✓ ${nama}`) } else { gagal++; console.log(`  ✗ ${nama}${info !== undefined ? `\n      ${typeof info === 'string' ? info : JSON.stringify(info)}` : ''}`) }
}
const buangKomentar = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const baca = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')

// ─── A. Aturan murni ───
console.log('A. Aturan murni')
const adaDi = (daftar: string[]) => (p: string) => daftar.includes(p)
const winSoffice = path.join('D:\\LO\\program', 'soffice.exe')
if (process.platform === 'win32') {
  ok('A1 env LIBREOFFICE_PROGRAM dipakai lebih dulu', cariLibreOffice({ LIBREOFFICE_PROGRAM: 'D:\\LO\\program' }, adaDi([winSoffice, path.join('D:\\LO\\program', 'python.exe'), 'C:\\Program Files\\LibreOffice\\program\\soffice.exe']))?.soffice === winSoffice)
  ok('A2 env menunjuk folder tanpa soffice → TIDAK jatuh ke lokasi bawaan (isian salah harus ketahuan)', cariLibreOffice({ LIBREOFFICE_PROGRAM: 'D:\\Salah' }, adaDi(['C:\\Program Files\\LibreOffice\\program\\soffice.exe', 'C:\\Program Files\\LibreOffice\\program\\python.exe'])) === null)
  ok('A3 tanpa env → lokasi pasang bawaan', cariLibreOffice({}, adaDi(['C:\\Program Files\\LibreOffice\\program\\soffice.exe', 'C:\\Program Files\\LibreOffice\\program\\python.exe']))?.python === 'C:\\Program Files\\LibreOffice\\program\\python.exe')
  ok('A4 soffice ada tapi python bawaan tidak → dianggap tidak terpasang', cariLibreOffice({}, adaDi(['C:\\Program Files\\LibreOffice\\program\\soffice.exe'])) === null)
  ok('A5 tidak terpasang sama sekali → null', cariLibreOffice({}, adaDi([])) === null)
}
const pdfTiruan = Buffer.from('<< /Type /Pages /Kids [] >> << /Type /Page /Parent 1 0 R >> << /Type/Page >> << /Type /PageLabel >> /BaseFont /ABCDEF+BookmanOldStyle-Bold /BaseFont /TimesNewRomanPSMT /BaseFont /QWERTY+Arial-BoldMT', 'latin1')
ok('A6 hitungHalaman: /Type /Page dihitung, /Pages & /PageLabel tidak', hitungHalaman(pdfTiruan) === 2, hitungHalaman(pdfTiruan))
ok('A7 hurufTertanam membuang awalan subset', hurufTertanam(pdfTiruan).join('|') === 'BookmanOldStyle-Bold|TimesNewRomanPSMT|Arial-BoldMT', hurufTertanam(pdfTiruan))
ok('A8 hurufTerpasang: nama keluarga berspasi cocok dgn nama PostScript', hurufTerpasang(pdfTiruan, 'Bookman Old Style') && hurufTerpasang(pdfTiruan, 'Times New Roman') && hurufTerpasang(pdfTiruan, 'Arial'))
ok('A9 hurufTerpasang: huruf yang tidak tertanam → false', !hurufTerpasang(pdfTiruan, 'Calibri') && !hurufTerpasang(pdfTiruan, 'Cambria'))
const uno = SKRIP_UNO
ok('A10 makro tidak pernah dijalankan & tautan luar tidak dimuat', /pv\("MacroExecutionMode", 0\)/.test(uno) && /pv\("UpdateDocMode", 0\)/.test(uno))
ok('A11 semua daftar diperbarui DUA kali (Daftar Isi memanjang menggeser halaman sesudahnya)', /for _ in range\(2\):\s*\n\s*for i in range\(idx\.getCount\(\)\):\s*\n\s*idx\.getByIndex\(i\)\.update\(\)/.test(uno))
ok('A12 penanda bab ikut ke PDF', /pv\("ExportBookmarks", True\)/.test(uno))
ok('A13 sambungan lewat pipe, bukan port TCP', uno.includes('--accept=pipe,name=') && !/socket,host/.test(uno))

// ─── B. Konversi sungguhan ───
console.log('\nB. Konversi sungguhan (LibreOffice)')
const lokasi = cariLibreOffice()
ok('B0 LibreOffice terpasang di mesin uji', lokasi !== null, 'Pasang LibreOffice atau isi LIBREOFFICE_PROGRAM — bagian ini tidak boleh dilewati.')

const kalimat = 'Rumah sakit menyelenggarakan pelayanan kesehatan jiwa yang paripurna dengan mutu yang terus ditingkatkan dari tahun ke tahun. '
const narasi = (n: number) => ({ html: Array.from({ length: n }, (_, i) => `<p>${i + 1}. ${kalimat.repeat(4)}</p>`).join('') })
const tabel = (judul: string, baris: number, extra: Record<string, unknown> = {}) => ({
  judul, kolom: ['No', 'Uraian', 'Nilai'], headerRows: 1, ulangKepala: true,
  rows: [[{ v: 'No' }, { v: 'Uraian' }, { v: 'Nilai' }], ...Array.from({ length: baris }, (_, i) => [{ v: String(i + 1) }, { v: `Uraian baris ${i + 1}` }, { v: String((i + 1) * 1000) }])],
  ...extra,
})
const sec: SectionFlat[] = [
  { id: 1, parent_id: null, depth: 0, urutan: 0, judul: 'PENDAHULUAN', locked: 1 },
  { id: 2, parent_id: 1, depth: 1, urutan: 0, judul: 'Latar Belakang', locked: 0 },
  { id: 3, parent_id: 1, depth: 1, urutan: 1, judul: 'Maksud dan Tujuan', locked: 0 },
  { id: 4, parent_id: null, depth: 0, urutan: 1, judul: 'PERENCANAAN KINERJA', locked: 1 },
  { id: 5, parent_id: 4, depth: 1, urutan: 0, judul: 'Rencana Strategis', locked: 0 },
  { id: 6, parent_id: null, depth: 0, urutan: 2, judul: 'AKUNTABILITAS KINERJA', locked: 1 },
  { id: 7, parent_id: 6, depth: 1, urutan: 0, judul: 'Capaian Kinerja', locked: 0 },
  { id: 8, parent_id: 6, depth: 1, urutan: 1, judul: 'Realisasi Anggaran', locked: 0 },
  { id: 9, parent_id: null, depth: 0, urutan: 3, judul: 'PENUTUP', locked: 1 },
  { id: 10, parent_id: 9, depth: 1, urutan: 0, judul: 'Kesimpulan', locked: 0 },
]
let idB = 0
const blok = (tipe: BlockNode['tipe'], payload: unknown): BlockNode => ({ id: ++idB, tipe, urutan: idB, payload } as BlockNode)
const blk = new Map<number, BlockNode[]>([
  [2, [blok('NARASI', narasi(8))]],
  [3, [blok('NARASI', narasi(5)), blok('TABEL', tabel('Tabel panjang berkepala diulang', 70))]],
  [5, [blok('NARASI', narasi(3)), blok('TABEL', tabel('Tabel mendatar', 30, { melintang: true }))]],
  [7, [blok('NARASI', narasi(10))]],
  [8, [blok('TABEL', tabel('Tabel realisasi', 25)), blok('NARASI', narasi(4))]],
  [10, [blok('NARASI', narasi(6))]],
])
const rakit = async (huruf: string) => (await rakitDocx({ tree: buildNumberedTree(sec, blk), judul: 'Uji PDF', tahun: 2099, canonical_id: 'LKJIP-UJI', style_config: { ...DEFAULT_STYLE, fontFamily: huruf as typeof DEFAULT_STYLE.fontFamily } })).buffer

const folderKerja = path.join(os.tmpdir(), 'prima-lkjip-pdf')
// Hanya folder yang lahir SELAMA uji ini — sisa jalan sebelumnya (mis. uji mutasi) tidak boleh menuduh kode yang benar.
const folderAwal = new Set(existsSync(folderKerja) ? readdirSync(folderKerja) : [])
const isiFolderKerja = () => (existsSync(folderKerja) ? readdirSync(folderKerja) : []).filter(n => !folderAwal.has(n))
const jumlahSoffice = () => {
  try {
    const out = process.platform === 'win32' ? execSync('tasklist /FI "IMAGENAME eq soffice.bin" /NH', { encoding: 'utf8' }) : execSync('pgrep -c soffice.bin || true', { encoding: 'utf8' })
    return process.platform === 'win32' ? (out.match(/soffice\.bin/gi) ?? []).length : Number(out.trim()) || 0
  } catch { return 0 }
}
const sofficeAwal = jumlahSoffice()

async function judulPdf(pdf: Buffer): Promise<string> {
  const req = createRequire(import.meta.url)
  const pdfjs = await import('file:///' + req.resolve('pdfjs-dist/legacy/build/pdf.mjs').replace(/\\/g, '/'))
  const doc = await pdfjs.getDocument({ data: new Uint8Array(pdf), verbosity: 0 }).promise
  return String(((await doc.getMetadata()).info as { Title?: string }).Title ?? '')
}
async function bacaPdf(pdf: Buffer): Promise<string[][]> {
  const req = createRequire(import.meta.url)
  const pdfjs = await import('file:///' + req.resolve('pdfjs-dist/legacy/build/pdf.mjs').replace(/\\/g, '/'))
  const doc = await pdfjs.getDocument({ data: new Uint8Array(pdf), verbosity: 0 }).promise
  const hal: string[][] = []
  for (let i = 1; i <= doc.numPages; i++) {
    const t = await (await doc.getPage(i)).getTextContent()
    const baris = new Map<number, string>()
    for (const x of t.items as Array<{ str: string; transform: number[] }>) { const y = Math.round(x.transform[5]); baris.set(y, (baris.get(y) ?? '') + x.str) }
    hal.push([...baris.entries()].sort((a, b) => b[0] - a[0]).map(([, s]) => s.replace(/\s+/g, ' ').trim()).filter(Boolean))
  }
  return hal
}

if (lokasi) {
  const docxArial = await rakit('Arial')
  const t0 = Date.now()
  const pdf = await ubahKePdf(docxArial, { judul: 'Uji Judul PDF — 2099' })
  const ms = Date.now() - t0
  ok(`B1 PDF jadi (${ms} ms, ${hitungHalaman(pdf)} halaman)`, pdf.subarray(0, 5).toString() === '%PDF-' && hitungHalaman(pdf) >= 8, hitungHalaman(pdf))
  const hal = await bacaPdf(pdf)
  ok('B1b judul PDF = judul dokumen (penampil peramban tidak menampilkan nama blob acak)', (await judulPdf(pdf)) === 'Uji Judul PDF — 2099', await judulPdf(pdf))
  ok('B2 hitungHalaman = jumlah halaman menurut pdfjs', hitungHalaman(pdf) === hal.length, { hitung: hitungHalaman(pdf), pdfjs: hal.length })
  const kaki = hal.map(h => h.at(-1) ?? '')
  const romawi = kaki.filter(k => /^[ivx]+$/.test(k))
  const angka = kaki.filter(k => /^\d+$/.test(k)).map(Number)
  ok('B3 kaki: romawi dulu, lalu angka mulai 1', romawi.length >= 1 && romawi[0] === 'i' && angka[0] === 1 && kaki.findIndex(k => /^\d+$/.test(k)) > kaki.findIndex(k => /^[ivx]+$/.test(k)), kaki)
  ok('B4 nomor angka bersambung tanpa lompat/ulang (melewati section mendatar)', angka.every((n, i) => n === i + 1), angka)
  // Daftar Isi: baris "judul …… n" di halaman romawi; nomornya = nomor kaki halaman tempat judul itu muncul.
  const halIsi = hal.map((h, i) => ({ h, i })).filter(({ i }) => /^\d+$/.test(kaki[i]))
  const entri = hal.flatMap((h, i) => /^[ivx]+$/.test(kaki[i]) ? h : [])
    .map(s => /^((?:BAB [IVX]+ |\d+\.\d+ ).+?)\s*\.{3,}\s*(\d+)$/.exec(s)).filter((m): m is RegExpExecArray => !!m)
    .map(m => ({ judul: m[1].trim(), nomor: Number(m[2]) }))
  ok('B5 Daftar Isi terisi nomor halaman (bab + sub-bab)', entri.length >= 10, entri)
  const meleset = entri.map(e => {
    const kunci = e.judul.toUpperCase()
    const ketemu = halIsi.find(({ h }) => h.some(s => s.toUpperCase() === kunci || s.toUpperCase().startsWith(kunci)))
    return { ...e, kaki: ketemu ? Number(kaki[ketemu.i]) : null }
  }).filter(e => e.kaki !== e.nomor)
  ok('B6 tiap nomor di Daftar Isi = nomor kaki halaman judulnya', meleset.length === 0, meleset)
  ok('B7 Daftar Tabel ikut terisi', hal.some((h, i) => /^[ivx]+$/.test(kaki[i]) && h.some(s => /^Tabel \d.*Tabel panjang.*\d+$/.test(s))), hal.slice(0, 5))
  const latin = pdf.toString('latin1')
  ok('B8 penanda bab tertulis (/Outlines)', latin.includes('/Outlines'))
  const kepalaUlang = hal.filter(h => h.some(s => s.replace(/\s/g, '') === 'NoUraianNilai')).length
  ok('B9 kepala tabel diulang di halaman lanjutan (≥ 4 halaman memuat kepala)', kepalaUlang >= 4, kepalaUlang)
  ok('B10 huruf dokumen Arial tertanam → tidak ada peringatan huruf', hurufTerpasang(pdf, 'Arial'), hurufTertanam(pdf))

  const pdfTakAda = await ubahKePdf(await rakit('Huruf Tak Terpasang Uji'))
  ok('B11 huruf yang tidak terpasang ketahuan (diganti diam-diam oleh LibreOffice)', !hurufTerpasang(pdfTakAda, 'Huruf Tak Terpasang Uji') && hurufTertanam(pdfTakAda).length > 0, hurufTertanam(pdfTakAda))

  ok('B12 folder kerja sementara bersih sesudah konversi', isiFolderKerja().length === 0, isiFolderKerja())
  ok('B13 tidak ada soffice tersisa', jumlahSoffice() <= sofficeAwal, { awal: sofficeAwal, sekarang: jumlahSoffice() })

  // ─── C. Antrean & batas waktu ───
  console.log('\nC. Antrean & batas waktu')
  const kecil = await rakitDocx({ tree: buildNumberedTree(sec.slice(0, 2), new Map([[2, [blok('NARASI', narasi(1))]]])), judul: 'Kecil', tahun: 2099, canonical_id: 'LKJIP-UJI', style_config: DEFAULT_STYLE }).then(r => r.buffer)
  const urutanSelesai: number[] = []
  const janji = Array.from({ length: BATAS_ANTRE + 2 }, (_, i) => ubahKePdf(kecil).then(() => { urutanSelesai.push(i); return 'ok' }, (e: Error) => e))
  await new Promise(r => setTimeout(r, 50))
  const st = statusAntrean()
  ok(`C1 satu berjalan, ${BATAS_ANTRE} menunggu`, st.berjalan && st.menunggu === BATAS_ANTRE, st)
  const hasil = await Promise.all(janji)
  ok('C2 permintaan sesudah antrean penuh ditolak PdfSibukError', hasil.filter(h => h instanceof PdfSibukError).length === 1 && hasil.at(-1) instanceof PdfSibukError, hasil.map(h => h instanceof Error ? h.constructor.name : h))
  ok('C3 yang mengantre dikerjakan berurutan sesuai kedatangan', urutanSelesai.join(',') === Array.from({ length: BATAS_ANTRE + 1 }, (_, i) => i).join(','), urutanSelesai)
  ok('C4 antrean kosong sesudahnya', !statusAntrean().berjalan && statusAntrean().menunggu === 0, statusAntrean())

  // Dokumen BERAT: konversi normalnya jauh melewati batas, jadi penolakan yang datang cepat hanya mungkin bila prosesnya dimatikan.
  const berat = (await rakitDocx({ tree: buildNumberedTree(sec.slice(0, 2), new Map([[2, [blok('NARASI', narasi(600)), blok('TABEL', tabel('Tabel berat', 2500))]]])), judul: 'Berat', tahun: 2099, canonical_id: 'LKJIP-UJI', style_config: DEFAULT_STYLE })).buffer
  const tBerat = Date.now(); await ubahKePdf(berat); const msNormal = Date.now() - tBerat
  ok(`C4b dokumen berat butuh waktu jauh di atas batas uji (${msNormal} ms)`, msNormal > 6_000, msNormal)
  const tBatas = Date.now()
  const lewat = await ubahKePdf(berat, { batasMs: 1_500 }).then(() => null, (e: Error) => e)
  // Tanpa mematikan SELURUH pohon proses, LibreOffice menyelesaikan konversinya sendiri (± 4 dtk) dan baru sesudah itu
  // prosesnya dianggap keluar — jadi yang membuktikan pemadaman adalah KAPAN penolakan datang, bukan bahwa ia datang.
  const msBatas = Date.now() - tBatas
  ok('C5 melewati batas waktu → PdfBatasWaktuError segera (pohon proses dimatikan, bukan ditunggu selesai)', lewat instanceof PdfBatasWaktuError && msBatas < 4_000, { e: lewat && lewat.message, ms: msBatas })
  await new Promise(r => setTimeout(r, 2500))
  ok('C6 proses LibreOffice yang dihentikan benar-benar mati (tanpa sisa soffice)', jumlahSoffice() <= sofficeAwal, { awal: sofficeAwal, sekarang: jumlahSoffice() })
  ok('C7 sesudah batas waktu antrean lepas & folder kerja bersih', !statusAntrean().berjalan && isiFolderKerja().length === 0, { st: statusAntrean(), folder: isiFolderKerja() })
  const pulih = await ubahKePdf(kecil).then(b => hitungHalaman(b), (e: Error) => e.message)
  ok('C8 konversi berikutnya tetap jalan (profil tidak rusak oleh proses yang dimatikan)', typeof pulih === 'number' && pulih >= 1, pulih)
  const henti = new AbortController()
  const pertama = ubahKePdf(kecil)
  const tBatal = Date.now()
  const kedua = ubahKePdf(kecil, { signal: henti.signal }).then(() => null, (e: Error) => e)
  await new Promise(r => setTimeout(r, 50)); henti.abort()
  const [, hasilKedua] = await Promise.all([pertama, kedua])
  ok('C8b dibatalkan peramban selagi mengantre → tidak dikerjakan (PdfDibatalkanError, tanpa menunggu konversi kedua)', hasilKedua instanceof PdfDibatalkanError && Date.now() - tBatal < 9_000 && !statusAntrean().berjalan, { e: hasilKedua?.constructor.name, ms: Date.now() - tBatal })
}
const tak = await ubahKePdf(Buffer.from('x'), { lokasi: null }).then(() => null, (e: Error) => e)
ok('C9 LibreOffice tidak ada → PdfTidakTersediaError dgn kalimat Word tetap bisa diunduh', tak instanceof PdfTidakTersediaError && tak.message.includes('Word tetap bisa diunduh'))

// ─── D. Route & layar ───
console.log('\nD. Route & layar')
const route = buangKomentar(baca('app/api/lkjip/[id]/generate/route.ts'))
ok('D1 pratinjau = inline + audit LKJIP_PRATINJAU; unduh = attachment + LKJIP_GENERATE', /eventType: tampil \? 'LKJIP_PRATINJAU' : 'LKJIP_GENERATE'/.test(route) && /\$\{tampil \? 'inline' : 'attachment'\}/.test(route))
ok('D2 tampil hanya berlaku untuk PDF (Word tidak bisa jadi inline)', /const tampil = pdf && /.test(route))
ok('D3 batas laju PDF berkunci sendiri', /lkjipRateLimit\(g\.session\.userId, 'pdf', 10\)/.test(route))
ok('D4 kode galat: PDF_TIDAK_TERSEDIA 503, PDF_SIBUK 503, PDF_BATAS_WAKTU 504', /PDF_TIDAK_TERSEDIA'[^\n]*status: 503/.test(route) && /PDF_SIBUK'[^\n]*status: 503/.test(route) && /PDF_BATAS_WAKTU'[^\n]*status: 504/.test(route))
ok('D5 PDF dibuat dari Word yang SAMA (generateLkjipDocx → ubahKePdf(result.buffer))', /result = await generateLkjipDocx\(id\)/.test(route) && /ubahKePdf\(result\.buffer, \{ judul: result\.judul,/.test(route))
ok('D5b sinyal batal permintaan diteruskan, 499 tanpa audit', /signal: req\.signal/.test(route) && /PdfDibatalkanError\) return NextResponse\.json\([^\n]*status: 499/.test(route))
ok('D6 guard() paling dulu', route.indexOf('await guard()') > 0 && route.indexOf('await guard()') < route.indexOf('lkjipRateLimit('))
ok('D7 jenis audit terdaftar & digolongkan retensi', baca('lib/security/auditlog.ts').includes(`'LKJIP_PRATINJAU'`) && /LKJIP_PRATINJAU: S/.test(baca('lib/security/retensi-audit.ts')))
const ed = buangKomentar(baca('app/(dashboard)/lkjip/[id]/editor-client.tsx'))
ok('D8 dock: Pratinjau & Unduh PDF di dokumen DRAFT dan FINAL', (ed.match(/\.\.\.aksiPdf,/g) ?? []).length === 2)
ok('D9 blok belum disimpan ditanyakan sebelum pratinjau/PDF', /async function bolehPakaiTersimpan\(\)[\s\S]{0,200}if \(!pdfTersedia\)[\s\S]{0,200}kotorRef\.current\.size/.test(ed) && (ed.match(/bolehPakaiTersimpan\(\)\.then/g) ?? []).length === 2)
ok('D9b LibreOffice belum terpasang → kedua tombol PDF mati DENGAN alasan', /const pdfMati = pdfTersedia \? undefined : KALIMAT_PDF_MATI/.test(ed) && (ed.match(/mati: pdfMati,/g) ?? []).length === 2)
const dock = buangKomentar(baca('components/ui/FloatingDock.tsx'))
ok('D9c dock: tombol mati tidak menjalankan aksinya, alasannya di tooltip, hover tetap hidup (aria-disabled, bukan disabled)',
  /onClick=\{it\.mati \? undefined : it\.onClick\}/.test(dock) && /data-tooltip=\{it\.mati \? `\$\{it\.label\} — \$\{it\.mati\}` : it\.label\}/.test(dock) && !/[^-]disabled=\{/.test(dock))
const pdfSrc = buangKomentar(baca('lib/lkjip/pdf.ts'))
ok('D9d LibreOffice dijalankan dari folder kerja sementara (bukan folder aplikasi)', /batasMs, kerja\);/.test(pdfSrc) && /spawn\(perintah, argumen, \{ cwd,/.test(pdfSrc))
ok('D10 halaman editor mengoper pdfTersedia dari server', /pdfTersedia=\{pdfTersedia\(\)\}/.test(baca('app/(dashboard)/lkjip/[id]/page.tsx')))
const pr = buangKomentar(baca('app/(dashboard)/lkjip/[id]/PratinjauPdf.tsx'))
ok('D11 pratinjau meminta tampil=1, jawaban lama dibuang saat ditutup (abort)', /ambilPdf\(dokumenId, true, henti\.signal\)/.test(pr) && /henti\.abort\(\)/.test(pr) && /revokeObjectURL\(url\)/.test(pr))
ok('D12 peringatan huruf dari kepala X-Lkjip-Huruf-Hilang ditampilkan', /X-Lkjip-Huruf-Hilang/.test(pr) && /kalimatHurufHilang\(k\.hasil\.hurufHilang\)/.test(pr))

console.log(`\n${lulus} lulus, ${gagal} gagal`)
process.exit(gagal ? 1 : 0)
