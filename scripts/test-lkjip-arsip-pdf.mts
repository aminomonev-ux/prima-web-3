// Regresi arsip PDF riwayat versi LKJIP (konsep docs/konsep/lkjip/CONCEPT-lkjip-kertas-margin-arsip-pdf.md bagian B).
// npx tsx --env-file=.env.local scripts/test-lkjip-arsip-pdf.mts — bagian C memakai MySQL (dokumen kotak pasir 2040,
// baris versi uji dihapus lagi); tanpa DB suite ini GAGAL, bukan melompati.
//
// A: kalimat & nama (murni)   B: galat PDF → sebab   C: MySQL   D: sambungan route & layar
import { readFileSync, existsSync } from 'node:fs'
import { LABEL_VERSI_FINAL, arsipLengkap, dasarNamaArsip, ringkasArsip, teksArsipVersi, type HasilArsip } from '../lib/lkjip/arsip-teks'
import { alasanPdf } from '../lib/lkjip/arsip-versi'
import { PdfBatasWaktuError, PdfGagalError, PdfSibukError, PdfTidakTersediaError, ubahKePdf } from '../lib/lkjip/pdf'
import { arsipVersi, listVersi, saveVersi, setVersiDrive, setVersiPdf } from '../lib/lkjip/versi'
import { sql, queryOne } from '../lib/data/db'

let lulus = 0
const gagal: string[] = []
function ok(nama: string, syarat: boolean, ket = '') {
  if (syarat) { lulus++; console.log(`  ok  ${nama}`) }
  else { gagal.push(nama); console.log(`FAIL  ${nama}${ket ? ' — ' + ket.slice(0, 400) : ''}`) }
}
const kode = (p: string) => readFileSync(p, 'utf8').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')
const h = (o: Partial<HasilArsip>): HasilArsip => ({ diatur: true, word: 'w', pdf: 'p', pdfAlasan: null, hurufHilang: null, ...o })

// ─── A. Kalimat & nama ───
console.log('A. Kalimat & nama')
ok('A1 nama dasar sama untuk Word & PDF: tanpa .docx + versi + cap waktu', dasarNamaArsip('LKJIP-2026-X.docx', 3, new Date(2026, 10, 17, 8, 5, 9)) === 'LKJIP-2026-X-v3-20261117-080509')
ok('A2 lengkap: "arsip Word + PDF"', ringkasArsip(h({})) === 'arsip Word + PDF' && arsipLengkap(h({})))
const tanpaPdf = h({ pdf: null, pdfAlasan: 'LibreOffice belum terpasang di server' })
ok('A3 PDF dilewati: sebabnya disebut, nada peringatan', ringkasArsip(tanpaPdf) === 'arsip Word · PDF dilewati: LibreOffice belum terpasang di server' && !arsipLengkap(tanpaPdf), ringkasArsip(tanpaPdf))
const huruf = h({ hurufHilang: 'Garamond' })
ok('A4 huruf tak terpasang di server disebut, nada peringatan', ringkasArsip(huruf).includes('huruf Garamond tidak terpasang') && !arsipLengkap(huruf))
ok('A5 semua gagal: tidak mengaku ada arsip', ringkasArsip(h({ word: null, pdf: null, pdfAlasan: 'dokumen gagal dirakit' })).startsWith('arsip gagal diunggah'))
ok('A6 Drive belum diatur: disebut, bukan peringatan', ringkasArsip(h({ diatur: false, word: null, pdf: null })) === 'Drive belum diatur — tanpa arsip' && arsipLengkap(h({ diatur: false, word: null, pdf: null })))
ok('A7 tanpa hasil (null) = bukan lengkap', !arsipLengkap(null))
ok('A8 baris Riwayat: Word+PDF / Word saja (versi lama) / kosong', teksArsipVersi({ drive_file_id: 'a', pdf_file_id: 'b' }) === ' · ☁ Word + PDF' && teksArsipVersi({ drive_file_id: 'a', pdf_file_id: null }) === ' · ☁ Word (tanpa PDF)' && teksArsipVersi({ drive_file_id: null, pdf_file_id: null }) === '')
ok('A9 label versi Finalisasi', LABEL_VERSI_FINAL === 'Final')

// ─── B. Galat PDF → sebab ───
console.log('\nB. Galat PDF → sebab')
ok('B1 tiap galat punya kalimat sendiri', new Set([new PdfTidakTersediaError(), new PdfSibukError(), new PdfBatasWaktuError(1), new PdfGagalError('x')].map(alasanPdf)).size === 4)
let galatNyata: unknown = null
try { await ubahKePdf(Buffer.from('x'), { lokasi: null }) } catch (e) { galatNyata = e }
ok('B2 LibreOffice tidak ada (galat sungguhan) → "belum terpasang"', alasanPdf(galatNyata) === 'LibreOffice belum terpasang di server', String(galatNyata))

// ─── C. MySQL ───
console.log('\nC. MySQL (dokumen kotak pasir 2040)')
const dok = await queryOne<{ id: number }>(sql`SELECT id FROM lkjip_dokumen WHERE tahun = 2040 ORDER BY id LIMIT 1`)
ok('C0 ada dokumen kotak pasir 2040', !!dok)
if (dok) {
  const v = await saveVersi(Number(dok.id), 'uji test-lkjip-arsip-pdf', 1)
  try {
    const awal = (await listVersi(Number(dok.id))).find(x => x.id === v.id)
    ok('C1 versi baru tanpa arsip: kedua kolom null', !!awal && awal.drive_file_id === null && awal.pdf_file_id === null)
    await setVersiDrive(v.id, 'ujiWordAAAAAAAAAAAAAAAA', 'uji.docx')
    await setVersiPdf(v.id, 'ujiPdfBBBBBBBBBBBBBBBBBB', 'uji.pdf')
    const isi = (await listVersi(Number(dok.id))).find(x => x.id === v.id)
    ok('C2 daftar Riwayat membawa arsip PDF', isi?.pdf_file_id === 'ujiPdfBBBBBBBBBBBBBBBBBB' && isi?.pdf_name === 'uji.pdf' && isi?.drive_file_id === 'ujiWordAAAAAAAAAAAAAAAA')
    const a = await arsipVersi(Number(dok.id), v.id)
    ok('C3 arsip satu versi: Word & PDF', a?.word?.id === 'ujiWordAAAAAAAAAAAAAAAA' && a?.pdf?.nama === 'uji.pdf')
    ok('C4 versi milik dokumen LAIN tidak pernah cocok', (await arsipVersi(Number(dok.id) + 987654, v.id)) === null)
  } finally {
    await sql`DELETE FROM lkjip_versi WHERE id = ${v.id}`
  }
}

// ─── D. Sambungan ───
console.log('\nD. Sambungan route & layar')
const rArsip = kode('app/api/lkjip/[id]/versi/[versiId]/arsip/route.ts')
ok('D1 route arsip: penjaga modul LKJIP, id berkas dari versi (bukan dari klien)', /const g = await guard\(\);\s*if \(!g\.ok\) return g\.res;/.test(rArsip) && rArsip.includes('await arsipVersi(id, versiId)') && !/searchParams\.get\('(file|fileId|id)'\)/.test(rArsip))
ok('D2 route arsip: jenis hanya word|pdf, Word diunduh & PDF dibuka', rArsip.includes("(jenis !== 'word' && jenis !== 'pdf')") && rArsip.includes("jenis === 'pdf' ? 'inline' : 'attachment'"))
ok('D3 route arsip diaudit', rArsip.includes("eventType: 'FILE_DOWNLOAD'"))
const rVersi = kode('app/api/lkjip/[id]/versi/route.ts')
ok('D4 Simpan Versi mengarsipkan lewat satu jalur', rVersi.includes('await arsipkanDanCatat(req, g.session, id, saved)') && !rVersi.includes('unggahKeTujuan'))
const rFinal = kode('app/api/lkjip/[id]/finalize/route.ts')
ok('D5 Finalisasi: versi "Final" SESUDAH dokumen terkunci, lalu arsip lewat jalur yang sama', rFinal.indexOf('finalizeDokumen(') < rFinal.indexOf('saveVersi(id, LABEL_VERSI_FINAL') && rFinal.includes('arsipkanDanCatat(req, g.session, id, versi)'))
const av = kode('lib/lkjip/arsip-versi.ts')
ok('D6 PDF dari buffer Word yang SAMA (Word dibuat sekali)', (av.match(/generateLkjipDocx\(/g) ?? []).length === 1 && av.includes('ubahKePdf(docx.buffer'))
ok('D7 arsipkanDanCatat tidak pernah melempar ke route', /try \{\s*arsip = await arsipkanVersi\(dokumenId, versi\);\s*\} catch/.test(av))
const ed = kode('app/(dashboard)/lkjip/[id]/editor-client.tsx')
ok('D8 Riwayat lewat route arsip, bukan /api/upload/download', ed.includes('/versi/${v.id}/arsip?jenis=word') && ed.includes('/versi/${v.id}/arsip?jenis=pdf') && !/upload\/download\?id=\$\{v\.drive_file_id\}/.test(ed))
ok('D9 toast memakai kalimat yang sama dengan audit', ed.includes('ringkasArsip(arsip)') && ed.includes('arsipLengkap(arsip)'))
const skema = readFileSync('docs/schema-mysql.sql', 'utf8')
ok('D10 skema acuan + migrasi', /pdf_file_id\s+VARCHAR\(64\)\s+NULL/.test(skema) && existsSync('docs/migrations/migration-lkjip-versi-pdf.sql'))

console.log(`\n${gagal.length ? 'GAGAL — ' : 'LULUS — '}${lulus} lulus, ${gagal.length} gagal`)
process.exit(gagal.length ? 1 : 0)
