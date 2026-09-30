// scripts/test-usulan-perbaikan.mts — regresi perbaikan Usulan (audit 2026-09-29)
//
//   npx tsx scripts/test-usulan-perbaikan.mts
//
//   B3  jendela pengajuan dulu hanya diperiksa POST; "simpan draf lalu Ajukan" melewatinya.
//       Keputusan pemilik: hanya PENGIRIMAN PERTAMA yang ditutup, kirim ulang revisi boleh.
//   B4  edit draf: jenis tidak dimuat, tahun ditebak dari nomor (PERUBAHAN/PERGESERAN jatuh ke
//       tahun berjalan), `update_draft` menolak PERGESERAN, nomor ulang tanpa jenis.
//   B10 revisi Bidang & kirim-ulang menerima qty 0/negatif.
//   B11 telaah, review Bidang, kirim-ulang, buat multi-grup: tulisan berlapis tanpa transaksi.
//
// Tidak menyentuh basis data: perilaku fungsi murni + skema Zod + pembacaan berkas.

import { readFileSync } from 'node:fs'
import { jendelaTerbuka, PESAN_JENDELA_TUTUP } from '../lib/shared/jendela-pengajuan'
import { ItemUsulanSchema, JenisUsulanSchema, QtyUsulanSchema, HargaUsulanSchema } from '../lib/data/usulan-schemas'

let lulus = 0
const gagal: string[] = []
function cek(nama: string, syarat: boolean) {
  if (syarat) lulus++
  else gagal.push(nama)
}
const baca = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
/** Komentar dibuang dulu — prosa yang menjelaskan bug lama tidak boleh ikut dicocokkan. */
const kode = (p: string) => baca(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')
const hitung = (teks: string, cari: string) => teks.split(cari).length - 1

// ── A. Aturan jendela (murni) ────────────────────────────────────────────────
const J = { aktif: true, mulai: '2026-09-01', selesai: '2026-09-30' }
cek('A1 jendela nonaktif = selalu terbuka', jendelaTerbuka({ ...J, aktif: false }, '2027-01-01'))
cek('A2 di dalam periode terbuka', jendelaTerbuka(J, '2026-09-15'))
cek('A3 hari pertama termasuk', jendelaTerbuka(J, '2026-09-01'))
cek('A4 hari terakhir termasuk', jendelaTerbuka(J, '2026-09-30'))
cek('A5 sebelum mulai tertutup', !jendelaTerbuka(J, '2026-08-31'))
cek('A6 sesudah selesai tertutup', !jendelaTerbuka(J, '2026-10-01'))
cek('A7 tanggal tak sah dianggap tidak diisi, bukan menutup', jendelaTerbuka({ aktif: true, mulai: 'abc', selesai: '' }, '2026-10-01'))
cek('A8 kalimat penolakan tidak kosong', PESAN_JENDELA_TUTUP.length > 20)

// ── B. Skema bersama ─────────────────────────────────────────────────────────
const itemSah = { nama_barang: 'Laptop', qty: 1, satuan: 'Unit', harga_est: 10, prioritas: 'SEDANG' as const }
cek('B1 PERGESERAN diterima (dulu ditolak edit draf)', JenisUsulanSchema.safeParse('PERGESERAN').success)
cek('B2 qty 0 ditolak', !QtyUsulanSchema.safeParse(0).success)
cek('B3 qty negatif ditolak', !QtyUsulanSchema.safeParse(-3).success)
cek('B4 harga negatif ditolak', !HargaUsulanSchema.safeParse(-1).success)
cek('B5 item sah lolos', ItemUsulanSchema.safeParse(itemSah).success)
cek('B6 tautan javascript: ditolak (V5-INJ-01)', !ItemUsulanSchema.safeParse({ ...itemSah, url_merk1: 'javascript:alert(1)' }).success)
cek('B7 skema diperluas edit draf tetap memeriksa tautan',
  !ItemUsulanSchema.extend({}).safeParse({ ...itemSah, url_merk2: 'javascript:x' }).success)

// ── C. Keempat pintu kirim bertanya ke jendela yang sama (B3) ─────────────────
const RUTE = kode('app/api/usulan/route.ts')
const RUTE_ID = kode('app/api/usulan/[id]/route.ts')
cek('C1 tepat 4 pemanggilan jendelaPengajuanTerbuka() di dua berkas rute',
  hitung(RUTE, 'jendelaPengajuanTerbuka()') + hitung(RUTE_ID, 'jendelaPengajuanTerbuka()') === 4)
cek('C2 tidak ada lagi pemeriksaan batas buatan sendiri di POST', !RUTE.includes("cfg.batas_aktif === 'true'"))
cek('C3 PUT kirim-semua: DRAFT ditahan, revisi tetap dikirim',
  RUTE.includes("semua.filter(h => h.status_ringkas !== 'DRAFT')"))
cek('C4 ajukan: pemeriksaan berada di cabang DRAFT',
  /if \(curStatus === 'DRAFT'\) \{\s*if \(!\(await jendelaPengajuanTerbuka\(\)\)\)/.test(RUTE_ID))
cek('C5 update_draft: diperiksa hanya bila bukan draf', RUTE_ID.includes('if (!is_draft && !(await jendelaPengajuanTerbuka()))'))
const KLIEN = kode('app/(dashboard)/usulan-kebutuhan/usulan-client.tsx')
cek('C6 dialog Batalkan memperingatkan saat periode tutup',
  KLIEN.includes('const periodeTutup = !jendelaTerbuka({ aktif: bwAktif, mulai: bwMulai, selesai: bwSelesai })'))

// ── D. Edit draf (B4) ────────────────────────────────────────────────────────
cek('D1 update_draft memakai skema jenis bersama', RUTE_ID.includes('jenis_usulan:     JenisUsulanSchema.optional()'))
cek('D2 update_draft memakai skema item bersama', RUTE_ID.includes('ItemUsulanSchema.extend({'))
cek('D3 nomor ulang ikut jenis draf', RUTE_ID.includes('generateNoUsulan(effectiveSub, tahunEfektif ? parseInt(tahunEfektif) : undefined, jenisEfektif)'))
cek('D4 tahun anggaran tidak lagi dikosongkan', RUTE_ID.includes('tahun_anggaran = ${tahunEfektif}') && !RUTE_ID.includes("tahun_anggaran = ${tahun_anggaran ?? ''}"))
cek('D5 status DRAFT ditegaskan di dalam transaksi', RUTE_ID.includes("WHERE id = ${usulanId} AND status_ringkas = 'DRAFT'"))
cek('D6 item draf ditulis borongan (bulkInsert)', /withTransaction[\s\S]*?bulkInsert\('usulan_items'/.test(RUTE_ID.slice(RUTE_ID.indexOf("action === 'update_draft'"))))
cek('D7 layar memuat tahun dari header', KLIEN.includes('const tahunHeader = String(header.tahun_anggaran ?? \'\').trim();'))
cek('D7b …dan tahun header yang DIPAKAI, nomor hanya cadangan', KLIEN.includes('const tahun = tahunHeader || (tahunMatch'))
cek('D8 layar memuat jenis dari header', KLIEN.includes("setFJenis(jenisHeader === 'PERUBAHAN' || jenisHeader === 'PERGESERAN' ? jenisHeader : 'MURNI');"))

// ── E. Batas angka revisi (B10) & transaksi (B11) ────────────────────────────
const BIDANG = kode('app/api/usulan/[id]/bidang/route.ts')
const TELAAH = kode('app/api/usulan/[id]/telaah/route.ts')
cek('E1 revisi Bidang: qty lewat skema bersama', BIDANG.includes('rev_qty:         QtyUsulanSchema.optional()'))
cek('E2 revisi Bidang: harga lewat skema bersama', BIDANG.includes('rev_harga:       HargaUsulanSchema.optional()'))
cek('E3 kirim-ulang: qty lewat skema bersama', RUTE_ID.includes('qty:         QtyUsulanSchema.optional()'))
cek('E4 kirim-ulang: harga lewat skema bersama', RUTE_ID.includes('harga_est:   HargaUsulanSchema.optional()'))
cek('E5 review Bidang dalam transaksi', /await withTransaction\(async \(\{ tx \}\) => \{\s*for \(const d of decisions\)/.test(BIDANG))
cek('E6 review Bidang tidak lagi menulis lewat sql lepas di perulangan', !/for \(const d of decisions\)[\s\S]{0,400}await sql`\s*UPDATE usulan_items/.test(BIDANG))
cek('E7 telaah dalam transaksi + kunci baris', TELAAH.includes('await withTransaction(async ({ tx }) => {') && TELAAH.includes('FOR UPDATE'))
cek('E8 kirim-ulang dalam transaksi', /await withTransaction\(async \(\{ tx \}\) => \{\s*for \(const it of rp\.data\.items/.test(RUTE_ID))
cek('E9 buat multi-grup: SATU transaksi membungkus perulangan grup',
  /const created = await withTransaction\(async \(\{ tx, conn \}\) => \{[\s\S]*?for \(const \{ grp, noUsulan, status \} of rencana\)/.test(RUTE))
cek('E10 buat multi-grup: tidak ada lagi transaksi di dalam perulangan grup',
  !/for \(let g = 0; g < groups\.length; g\+\+\)[\s\S]{0,600}withTransaction/.test(RUTE))

console.log(`\n${lulus} pemeriksaan lulus · ${gagal.length} gagal`)
for (const g of gagal) console.log(`  GAGAL ${g}`)
process.exit(gagal.length ? 1 : 0)
