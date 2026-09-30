// scripts/test-check-schema.mts — regresi pembanding skema (audit U4)
//
//   npx tsx scripts/test-check-schema.mts
//
// `check-schema.mjs` dulu hanya membandingkan NAMA tabel/kolom/indeks. Bug "765.00"
// (d643d50) tersembunyi justru karena DB pengembang tertinggal migrasi INT → DECIMAL
// sementara pemeriksa berbunyi SINKRON. Uji ini memakai fungsi yang sama dengan skripnya,
// tanpa menyentuh basis data.

import { readFileSync } from 'node:fs'
import { normTipe, tipeDariDefinisi, definisiLogis, parseSchema, parseIndexes, bedaTipeKolom } from './check-schema.mjs'

let lulus = 0
const gagal: string[] = []
function sama(nama: string, dapat: unknown, harap: unknown) {
  if (dapat === harap) lulus++
  else gagal.push(`${nama} — dapat ${JSON.stringify(dapat)}, harap ${JSON.stringify(harap)}`)
}

// ── A. Normalisasi ke bentuk COLUMN_TYPE MySQL 8 ─────────────────────────────
sama('A1 INT(11) = int (lebar tampilan dibuang MySQL 8)', normTipe('INT(11)'), normTipe('int'))
sama('A2 BOOLEAN = tinyint(1)', normTipe('BOOLEAN'), 'tinyint(1)')
sama('A3 tinyint(1) dipertahankan', normTipe('tinyint(1)'), 'tinyint(1)')
sama('A4 unsigned ikut dibandingkan', normTipe('SMALLINT UNSIGNED'), 'smallint unsigned')
sama('A5 spasi dalam kurung DECIMAL', normTipe('DECIMAL(18, 2)'), 'decimal(18,2)')
sama('A6 ENUM: spasi di luar kutip dibuang', normTipe("ENUM('a', 'b')"), "enum('a','b')")
sama('A7 ENUM: spasi DI DALAM nilai dipertahankan', normTipe("ENUM('BIDANG UMUM','X')"), "enum('bidang umum','x')")
sama('A8 INTEGER = int', normTipe('INTEGER'), 'int')

// ── B. Perbedaan yang HARUS ketahuan ─────────────────────────────────────────
const beda = (a: string, b: string) => normTipe(a) !== normTipe(b)
sama('B1 bug 765.00: INT vs DECIMAL', beda('int', 'DECIMAL(10,2)'), true)
sama('B2 presisi DECIMAL', beda('decimal(18,2)', 'DECIMAL(18,4)'), true)
sama('B3 panjang VARCHAR', beda('varchar(100)', 'VARCHAR(255)'), true)
sama('B4 isi ENUM', beda("enum('DPA','PERGESERAN')", "ENUM('DPA','PERGESERAN','LAIN')"), true)
sama('B5 unsigned vs signed', beda('int unsigned', 'INT'), true)

// ── C. Membaca definisi DDL ──────────────────────────────────────────────────
sama('C1 tipe dengan UNSIGNED', tipeDariDefinisi('id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY'), 'BIGINT UNSIGNED')
sama('C2 tipe ENUM sebaris', tipeDariDefinisi("tema ENUM('dark','light') NOT NULL DEFAULT 'dark'"), "ENUM('dark','light')")
sama('C3 kolom terbangkit', tipeDariDefinisi('total DECIMAL(18,2) GENERATED ALWAYS AS (qty * harga) STORED'), 'DECIMAL(18,2)')
const TABEL = `CREATE TABLE IF NOT EXISTS uji (
  id      INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  sumber  ENUM('GAJI','BLUD',
               'OBAT') NOT NULL, -- lintas baris
  catatan VARCHAR(50) COMMENT 'boleh (kurung), koma',
  nilai   DECIMAL(18,2)
          NOT NULL DEFAULT 0,
  INDEX idx_uji_sumber (sumber)
) ENGINE=InnoDB;`
sama('C4 definisi dipecah di koma tingkat atas saja', definisiLogis(TABEL.slice(TABEL.indexOf('(') + 1, TABEL.lastIndexOf(')'))).length, 5)
const { tables, tipe } = parseSchema(TABEL)
sama('C5 ENUM lintas baris terbaca utuh', tipe.get('uji.sumber'), "enum('gaji','blud','obat')")
sama('C6 kurung & koma dalam COMMENT tidak memotong', tipe.get('uji.catatan'), 'varchar(50)')
sama('C7 baris sambungan tidak jadi kolom', [...(tables as Record<string, Set<string>>).uji].join(','), 'id,sumber,catatan,nilai')
sama('C8 indeks bernama tetap terbaca', parseIndexes(TABEL).has('uji.idx_uji_sumber'), true)

// ── C'. Pembanding: DB tertinggal migrasi INT → DECIMAL tidak lagi terbaca SINKRON ──
const aktual = new Map([
  ['uji.id', { asli: 'int', norm: normTipe('int') }],
  ['uji.sumber', { asli: "enum('GAJI','BLUD','OBAT')", norm: normTipe("enum('GAJI','BLUD','OBAT')") }],
  ['uji.catatan', { asli: 'varchar(50)', norm: normTipe('varchar(50)') }],
  ['uji.nilai', { asli: 'int', norm: normTipe('int') }],
])
const laporan = bedaTipeKolom(tables, tipe, aktual)
sama('C9 satu kolom berbeda tipe dilaporkan', laporan.length, 1)
sama('C10 laporan menyebut kolom & kedua tipenya', laporan[0], 'uji.nilai: DB int · acuan decimal(18,2)')
aktual.delete('uji.catatan')
sama('C11 kolom yang HILANG bukan urusan pembanding tipe', bedaTipeKolom(tables, tipe, aktual).length, 1)

// ── D. Skema acuan sungguhan ─────────────────────────────────────────────────
const SKEMA = readFileSync(new URL('../docs/schema-mysql.sql', import.meta.url), 'utf8')
const acuan = parseSchema(SKEMA)
sama('D1 ENUM lintas baris di skema acuan terbaca utuh',
  acuan.tipe.get('kinerja_riwayat_simpan.sumber'),
  "enum('gaji','blud','harlep','promkes','sarpras','obat','pemeliharaan','pembangunan')")
sama('D2 target Renaksi DECIMAL (asal bug 765.00)', acuan.tipe.get('rencana_aksi.target_tahunan')?.startsWith('decimal('), true)
sama('D3 indeks yang dulu hilang kini di skema acuan', parseIndexes(SKEMA).has('kinerja_master.idx_km_subkegiatan_ref'), true)
sama('D4 hampir semua kolom bertipe terbaca', acuan.tipe.size > 700, true)

// ── E. main() memakai pembanding yang diuji di atas ──────────────────────────
const SKRIP = readFileSync(new URL('./check-schema.mjs', import.meta.url), 'utf8')
sama('E1 main memakai bedaTipeKolom', SKRIP.includes('const bedaTipe = bedaTipeKolom(expected, expectedTipe, actualTipe)'), true)
sama('E2 beda tipe ikut membatalkan SINKRON',
  SKRIP.includes('if (!missingTables.length && !missingCols.length && !missingIdx.length && !notUniqueIdx.length && !bedaTipe.length) {'), true)

console.log(`\n${lulus} lulus, ${gagal.length} gagal`)
for (const g of gagal) console.log('  GAGAL ' + g)
process.exit(gagal.length ? 1 : 0)
