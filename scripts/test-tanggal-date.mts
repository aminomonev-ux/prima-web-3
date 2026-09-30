// scripts/test-tanggal-date.mts — regresi "kolom DATE jatuh ke hari sebelumnya"
//
//   npx tsx scripts/test-tanggal-date.mts
//
// Audit 2026-09-29, temuan B1/B2/B8/B9 + I2. Mekanismenya satu: pool mysql2 ber-
// `timezone: '+07:00'` memulangkan kolom DATE sebagai 00:00 WIB = 17:00 UTC KEMARIN.
//   B1  PK: form memotong string ISO → tanggal dokumen mundur sehari tiap simpan;
//       Riwayat menampilkan H-1.
//   B2  BBA: `String(Date)` → teks panjang yang ditolak Zod saat realisasi disimpan ulang.
//   B8  Usulan: tanggal di unduhan Excel/PDF H-1.
//   B9  RIMA: rekap versi DPA H-1.
//   I2  `keIso` & pencabutan akses berjangka bergantung zona waktu proses.
//
// Bagian D menyentuh MySQL (hanya SELECT literal, tanpa tabel) dan DILEWATI kalau basis
// datanya tidak menyala — sisanya jalan di mesin mana pun.

import { readFileSync } from 'node:fs'
import { toDateStr, tanggalHariIniWIB } from '../lib/shared/waktu-wib'
import * as tanggalBlud from '../lib/blud/tanggal'
import { kolomDate, periksaIsi } from './cek-tanggal-date.mjs'

// Env dimuat SEBELUM modul yang menyentuh `db.ts` diimpor — pool dibuat saat modul itu
// dievaluasi, jadi impor statis di atas akan membuatnya dengan kredensial kosong.
try {
  for (const b of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split(/\r?\n/)) {
    const t = b.trim()
    const i = t.indexOf('=')
    if (!t || t.startsWith('#') || i < 0) continue
    const k = t.slice(0, i).trim()
    if (process.env[k] === undefined) process.env[k] = t.slice(i + 1).trim().replace(/^["']|["']$/g, '')
  }
} catch { /* tanpa .env.local: bagian F dilewati di bawah */ }
const { fmtTanggalID } = await import('../lib/pk/docgen')
const { mapRow } = await import('../lib/data/buku-besar-aset')
const { BbaRealisasiSchema } = await import('../lib/data/buku-besar-aset-schemas')

let lulus = 0
const gagal: string[] = []
function cek(nama: string, syarat: boolean) {
  if (syarat) lulus++
  else gagal.push(nama)
}
function sama(nama: string, dapat: unknown, harap: unknown) {
  cek(`${nama} — dapat ${JSON.stringify(dapat)}, harap ${JSON.stringify(harap)}`, dapat === harap)
}
const baca = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
/** Komentar dibuang dulu — prosa yang menjelaskan bug lama tidak boleh ikut dicocokkan. */
const kode = (p: string) => baca(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')

// Bentuk persis nilai yang dipulangkan mysql2 untuk DATE '2026-07-31' di pool ber-+07:00.
const DATE_DARI_MYSQL = new Date('2026-07-31T00:00:00+07:00')

// ── A. Helper bersama ────────────────────────────────────────────────────────
sama('A1 toDateStr(Date mysql2) = tanggal DB, bukan kemarin', toDateStr(DATE_DARI_MYSQL), '2026-07-31')
sama('A2 toDateStr string YYYY-MM-DD apa adanya', toDateStr('2026-07-31'), '2026-07-31')
sama('A3 toDateStr null → kosong', toDateStr(null), '')
sama('A4 hari ini WIB: 17:00 UTC = 00:00 WIB hari berikutnya',
  tanggalHariIniWIB(Date.parse('2026-09-28T17:00:00Z')), '2026-09-29')
sama('A5 hari ini WIB: 16:59 UTC masih hari yang sama',
  tanggalHariIniWIB(Date.parse('2026-09-28T16:59:59Z')), '2026-09-28')
// Pemanggil BLUD lama tetap mendapat fungsi yang SAMA, bukan salinan.
cek('A6 lib/blud/tanggal me-re-export toDateStr yang sama', tanggalBlud.toDateStr === toDateStr)
cek('A7 lib/blud/tanggal me-re-export tanggalHariIniWIB yang sama', tanggalBlud.tanggalHariIniWIB === tanggalHariIniWIB)
cek('A8 mekanisme bug lama memang ada (JSON memotong jadi kemarin)',
  JSON.parse(JSON.stringify(DATE_DARI_MYSQL)).slice(0, 10) === '2026-07-30')

// ── B. PK (B1) ───────────────────────────────────────────────────────────────
const RUTE_DETAIL = 'app/api/perjanjian-kinerja/dokumen/[id]/route.ts'
const RUTE_DAFTAR = 'app/api/perjanjian-kinerja/dokumen/route.ts'
const FORM_PK = 'app/(dashboard)/perjanjian-kinerja/form/form-client.tsx'
const POLA_FORMAT = "DATE_FORMAT(tanggal_dokumen, '%Y-%m-%d') AS tanggal_dokumen"
cek('B1 GET detail memformat tanggal_dokumen di SQL', kode(RUTE_DETAIL).includes(POLA_FORMAT))
cek('B2 GET daftar (Riwayat) memformat tanggal_dokumen di SQL', kode(RUTE_DAFTAR).includes(POLA_FORMAT))
cek('B3 docgen Word memformat tanggal_dokumen di SQL', kode('lib/pk/docgen.ts').includes(POLA_FORMAT))
cek('B4 form memuat tanggal lewat toDateStr', kode(FORM_PK).includes('tanggal_dokumen: toDateStr(h.tanggal_dokumen)'))
cek('B5 tanggal bawaan form = hari ini WIB', /const today = tanggalHariIniWIB\(\)/.test(kode(FORM_PK)))
sama('B6 Word: "2026-05-23" → 23 Mei 2026', fmtTanggalID('2026-05-23'), '23 Mei 2026')
sama('B7 Word: tanggal 1 tanpa nol di depan', fmtTanggalID('2026-01-01'), '1 Januari 2026')

// ── C. BBA (B2) ──────────────────────────────────────────────────────────────
const baris = mapRow({ id: 1, tgl_realisasi: DATE_DARI_MYSQL, nilai_rencana: 0, nilai_realisasi: 0 })
sama('C1 mapRow: Date mysql2 → YYYY-MM-DD', baris.tgl_realisasi, '2026-07-31')
cek('C2 nilai itu LOLOS skema simpan realisasi (dulu ditolak regex)',
  BbaRealisasiSchema.safeParse({ id: 1, expected_version: 0, nilai_realisasi: 0, vol_realisasi: 0,
    tgl_realisasi: baris.tgl_realisasi, status: 'REALISASI_PENUH' }).success)
sama('C3 mapRow: string DATE_FORMAT dari SQL apa adanya', mapRow({ id: 1, tgl_realisasi: '2026-07-31' }).tgl_realisasi, '2026-07-31')
sama('C4 mapRow: kosong tetap null', mapRow({ id: 1, tgl_realisasi: null }).tgl_realisasi, null)
cek('C5 SELECT_COLS memformat tgl_realisasi',
  kode('lib/data/buku-besar-aset.ts').includes("DATE_FORMAT(b.tgl_realisasi, '%Y-%m-%d') AS tgl_realisasi"))

// ── D. Usulan (B8), RIMA (B9), akses berjangka (I2) ──────────────────────────
const EKSPOR = kode('app/(dashboard)/usulan-kebutuhan/_exports.ts')
sama('D1 ekspor Usulan: tidak ada lagi tanggal yang dipotong', (EKSPOR.match(/tanggal\?\.slice\(0, 10\)/g) ?? []).length, 0)
sama('D2 ekspor Usulan: Excel & PDF sama-sama lewat fmtTgl', (EKSPOR.match(/fmtTgl\(r\.tanggal\)/g) ?? []).length, 2)
cek('D3 RIMA BLUD memakai toDateStr', kode('lib/rima/blud-provider.ts').includes('const v = toDateStr(r.s)'))
cek('D4 keIso akses berjangka lewat toDateStr', kode('lib/admin/akses-berjangka.ts').includes('toDateStr(v)'))
cek('D5 pencabutan otomatis lewat toDateStr', kode('lib/admin/cabut-kedaluwarsa.ts').includes('berakhir: toDateStr(r.berakhir_pada)'))
cek('D6 pencabutan otomatis tidak lagi memakai getter lokal',
  !/berakhir_pada\.getDate\(\)|berakhir_pada\.getMonth\(\)/.test(kode('lib/admin/cabut-kedaluwarsa.ts')))

// ── E. Gate I (cek-tanggal-date.mjs) — dicoba dengan bentuk-bentuk lama ────────
const kolom = kolomDate(baca('docs/schema-mysql.sql'))
cek('E1 daftar kolom DATE dibaca dari skema: tanggal_dokumen', kolom.includes('tanggal_dokumen'))
cek('E2 …tgl_realisasi', kolom.includes('tgl_realisasi'))
cek('E3 …versi_tanggal', kolom.includes('versi_tanggal'))
cek('E4 DATETIME tidak ikut (created_at)', !kolom.includes('created_at'))
const kena = (teks: string) => periksaIsi(teks, kolom).map((s: { kode: string }) => s.kode)
cek('E5 menangkap "hari ini" UTC (bentuk lama form PK)', kena("const today = new Date().toISOString().slice(0, 10)").includes('ISO-POTONG'))
cek('E6 menangkap split(\'T\')[0]', kena("const t = d.toISOString().split('T')[0]").includes('ISO-POTONG'))
cek('E7 menangkap String(r.tgl_realisasi) (bentuk lama BBA)', kena('tgl_realisasi: r.tgl_realisasi ? String(r.tgl_realisasi) : null,').includes('STRING-DATE'))
cek('E8 menangkap tanggal_dokumen dipotong (bentuk lama form PK)', kena('tanggal_dokumen: String(h.tanggal_dokumen).slice(0, 10),').includes('POTONG-DATE'))
cek('E9 menangkap r.tanggal?.slice(0, 10) (bentuk lama ekspor Usulan)', kena("`${r.tanggal?.slice(0, 10) ?? ''}`").includes('POTONG-DATE'))
sama('E10 penanda tanggal-utc-ok membebaskan baris itu',
  kena("if (v instanceof Date) return v.toISOString().slice(0, 10) // tanggal-utc-ok: exceljs").length, 0)
sama('E11 kalimat di dalam komentar tidak dituduh', kena('/** dulu `new Date().toISOString().slice(0, 10)` */\nconst x = 1').length, 0)
sama('E12 kolom bukan DATE tidak dituduh', kena('const s = r.no_usulan.slice(0, 10)').length, 0)

// ── F. Basis data sungguhan (dilewati kalau MySQL mati) ──────────────────────
try {
  const { sql } = await import('../lib/data/db')
  const [r] = await sql`SELECT CAST('2026-07-31' AS DATE) AS d, DATE_FORMAT(CAST('2026-07-31' AS DATE), '%Y-%m-%d') AS f` as { d: unknown; f: string }[]
  cek('F1 mysql2 memang memulangkan objek Date untuk DATE', r.d instanceof Date)
  sama('F2 toDateStr atas nilai sungguhan', toDateStr(r.d), '2026-07-31')
  sama('F3 DATE_FORMAT memulangkan teks yang benar', r.f, '2026-07-31')
} catch (e) {
  const kodeGalat = (e as { code?: string }).code ?? ''
  if (/ECONNREFUSED|ER_ACCESS_DENIED|ETIMEDOUT|ENOTFOUND/.test(kodeGalat)) console.log(`  --  F dilewati: MySQL tidak terjangkau (${kodeGalat})`)
  else gagal.push(`F galat tak terduga: ${String(e)}`)
}

console.log(`\n${lulus} pemeriksaan lulus · ${gagal.length} gagal`)
for (const g of gagal) console.log(`  GAGAL ${g}`)
process.exit(gagal.length ? 1 : 0)
