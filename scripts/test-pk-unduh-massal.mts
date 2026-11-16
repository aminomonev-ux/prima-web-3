#!/usr/bin/env npx tsx
// scripts/test-pk-unduh-massal.mts — unduh massal dokumen PK (satu ZIP) + pilihan versi lampiran.
// Jalankan: npx tsx scripts/test-pk-unduh-massal.mts (tanpa DB).
import { readFileSync } from 'node:fs'
import PizZip from 'pizzip'
import { BATAS_PDF_MASSAL, BATAS_UNDUH_MASSAL, PERMINTAAN_PDF_MASSAL, namaUnik, potongPer } from '../lib/pk/unduh-massal'
import { UnduhMassalBodySchema } from '../lib/data/pk-schemas'

let lulus = 0
const gagal: string[] = []
function ok(nama: string, syarat: unknown, ket = '') {
  if (syarat) { lulus++; console.log(`  ok  ${nama}`) }
  else { gagal.push(nama); console.log(`FAIL  ${nama}${ket ? ' — ' + ket : ''}`) }
}
const sumber = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n')
const tanpaKomentar = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

console.log('A. Nama berkas di dalam ZIP')
{
  const dipakai = new Set<string>()
  ok('A1 nama pertama apa adanya', namaUnik('PK-2026-Wadir.docx', dipakai) === 'PK-2026-Wadir.docx')
  ok('A2 nama kembar diberi nomor, bukan ditimpa',
    namaUnik('PK-2026-Wadir.docx', dipakai) === 'PK-2026-Wadir (2).docx'
    && namaUnik('PK-2026-Wadir.docx', dipakai) === 'PK-2026-Wadir (3).docx')
  ok('A3 ekstensi tetap di belakang', [...dipakai].every(n => n.endsWith('.docx')))
  const tanpaEkstensi = new Set<string>(['PK-1'])
  ok('A4 nama tanpa ekstensi tetap unik', namaUnik('PK-1', tanpaEkstensi) === 'PK-1 (2)')
}

console.log('B. ZIP sungguhan')
{
  const zip = new PizZip()
  zip.file('a.docx', Buffer.from('satu'))
  zip.file('b.pdf', Buffer.from('dua'))
  const buf = zip.generate({ type: 'nodebuffer' })
  const balik = new PizZip(buf)
  ok('B1 dua entri, isinya utuh', Object.keys(balik.files).length === 2
    && balik.file('a.docx')!.asText() === 'satu' && balik.file('b.pdf')!.asText() === 'dua')
}

console.log('B2. PDF dipecah per permintaan (risiko 504 Nginx)')
{
  ok('B2a potongan kecil, bukan sekali jalan', PERMINTAAN_PDF_MASSAL >= 2 && PERMINTAAN_PDF_MASSAL < BATAS_PDF_MASSAL)
  const bagian = potongPer([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], PERMINTAAN_PDF_MASSAL)
  ok('B2b 10 dokumen jadi beberapa permintaan, tidak ada yang hilang',
    bagian.length === 2 && bagian.flat().join() === '1,2,3,4,5,6,7,8,9,10')
  ok('B2c sisa dibawa di potongan terakhir', potongPer([1, 2, 3], 5).map(b => b.join()).join('|') === '1,2,3')
  ok('B2d daftar kosong tidak menghasilkan permintaan', potongPer([], 5).length === 0)
}

console.log('C. Batas & skema')
{
  const id = (n: number) => Array.from({ length: n }, (_, i) => i + 1)
  ok('C1 PDF di atas satu potongan ditolak server (batas UI 10, batas permintaan 5)',
    BATAS_PDF_MASSAL > PERMINTAAN_PDF_MASSAL
    && !UnduhMassalBodySchema.safeParse({ ids: id(PERMINTAAN_PDF_MASSAL + 1), format: 'pdf' }).success
    && !UnduhMassalBodySchema.safeParse({ ids: id(BATAS_PDF_MASSAL), format: 'pdf' }).success
    && UnduhMassalBodySchema.safeParse({ ids: id(PERMINTAAN_PDF_MASSAL), format: 'pdf' }).success)
  ok('C2 Word lebih longgar dari PDF', BATAS_UNDUH_MASSAL > BATAS_PDF_MASSAL
    && UnduhMassalBodySchema.safeParse({ ids: id(BATAS_UNDUH_MASSAL), format: 'word' }).success
    && !UnduhMassalBodySchema.safeParse({ ids: id(BATAS_UNDUH_MASSAL + 1), format: 'word' }).success)
  ok('C3 daftar kosong ditolak', !UnduhMassalBodySchema.safeParse({ ids: [], format: 'word' }).success)
  ok('C4 sumber & versi harus berpasangan',
    !UnduhMassalBodySchema.safeParse({ ids: [1], format: 'word', sumber: 'dpa' }).success
    && UnduhMassalBodySchema.safeParse({ ids: [1], format: 'word', sumber: 'dpa', versi: '2026-11-13' }).success)
  ok('C5 format asing ditolak', !UnduhMassalBodySchema.safeParse({ ids: [1], format: 'excel' }).success)
}

console.log('D. Sambungan rute & layar')
{
  const rute = tanpaKomentar(sumber('app/api/perjanjian-kinerja/dokumen/bulk-download/route.ts'))
  ok('D1 pagar modul & izin dipasang SEBELUM membaca dokumen',
    rute.indexOf('await pkMati(') > 0 && rute.indexOf('await pkMati(') < rute.indexOf('FROM pk_dokumen')
    && rute.includes("bolehLihatSalahSatu(session.userId, session.role, ['form', 'riwayat'])"))
  ok('D2 dokumen bukan haknya DISARING, bukan menggagalkan seluruh ZIP',
    rute.includes('rows.filter(r => r.created_by === session.userId)')
    && rute.includes('Tidak ada dokumen milik Anda di pilihan itu.')
    && !/Bukan dokumen Anda: #/.test(rute))
  ok('D2b yang dilewati dikabarkan ke layar, bukan hilang diam-diam',
    rute.includes('X-Dokumen-Dilewati')
    && tanpaKomentar(sumber('app/(dashboard)/perjanjian-kinerja/riwayat/riwayat-client.tsx')).includes("res.headers.get('X-Dokumen-Dilewati')"))
  ok('D3 versi BLUD satu tahun → batch campur tahun ditolak', rute.includes('tahunBatch') && rute.includes('Pilih dokumen dari satu tahun saja'))
  ok('D4 audit dicatat PER dokumen', rute.includes('for (const r of milik)')
    && rute.includes("eventType: 'PK_DOKUMEN_DOWNLOAD'")
    && rute.indexOf('await writeAuditLog') > rute.indexOf('for (const r of milik)'),
  `loop=${rute.indexOf('for (const r of milik)')} audit=${rute.indexOf('await writeAuditLog')} jenis=${rute.indexOf('PK_DOKUMEN_DOWNLOAD')}`)
  ok('D5 PK tanpa BLUD tetap ikut tanpa lampiran, versi/unit rusak menghentikan batch',
    rute.includes('LampiranTanpaBludError') && rute.includes('LampiranBludError) {'))
  ok('D6 PDF pakai antrean LibreOffice yang sama', rute.includes('docxKePdf(berkas)'))
  ok('D7 lampiran disisipkan ke salinan, berkas FINAL tidak ditulis', !/UPDATE\s+pk_dokumen/i.test(rute))
  const layar = tanpaKomentar(sumber('app/(dashboard)/perjanjian-kinerja/riwayat/riwayat-client.tsx'))
  ok('D8 layar memakai pola centang (pilih semua + per baris)',
    layar.includes('checked={semuaTerpilih}') && layar.includes('checked={terpilih.includes(r.id)}'))
  ok('D9 hanya baris berberkas yang bisa dicentang', layar.includes('disabled={r.has_file !== 1}'))
  ok('D10 PDF dijaga batasnya di layar sebelum menembak server', layar.includes('terpilih.length > BATAS_PDF_MASSAL'))
  ok('D11 pilihan versi tetap ada untuk batch', layar.includes('<PilihLampiranMassal'))
  ok('D12 PDF dikirim per potongan lalu ZIP-nya digabung di layar',
    layar.includes('potongPer(ids, PERMINTAAN_PDF_MASSAL)') && layar.includes('await gabungZip(hasil)'))
  ok('D13 gabungan ZIP tetap unik namanya (tidak saling menimpa antar-potongan)',
    /gabungZip[\s\S]*namaUnik\(nama, dipakai\)/.test(layar))
  ok('D14 plafon konversi PDF tidak ikut naik saat permintaan dipecah',
    rute.includes("'unduh-massal-pdf', 6") && rute.includes("'unduh-massal', 10"))
  ok('D15 jumlah dokumen dibatasi sebelum menembak server', layar.includes('terpilih.length > BATAS_UNDUH_MASSAL'))
  ok('D16 unduhan panjang bisa dihentikan (AbortController + tombol Hentikan)',
    layar.includes('new AbortController()') && layar.includes('batalMassal.current.abort()')
    && layar.includes('>Hentikan<'))
  ok('D17 permintaan ikut dibatalkan, bukan cuma label tombolnya',
    /credentials: 'include', signal,/.test(layar) && /signal\.aborted\) return[\s\S]*?simpanBlob\(/.test(layar))
  ok('D18 berhenti = tidak ada berkas yang disimpan', layar.includes('Unduhan dihentikan. Tidak ada berkas yang disimpan.'))
}

console.log(`\n${lulus} lulus, ${gagal.length} gagal`)
if (gagal.length) { console.log(gagal.map(x => `  - ${x}`).join('\n')); process.exit(1) }
process.exit(0)
