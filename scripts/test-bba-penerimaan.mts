#!/usr/bin/env npx tsx
// scripts/test-bba-penerimaan.mts — Tahap E Buku Aset: pengadaan & penerimaan — realisasi = Σ penerimaan,
// "yang dibeli", antrean → tempatkan → belum teregister → isi register / cocok otomatis saat impor KIB,
// penggantian → siap dihapus, hapus dengan SK, rehab.
// Konsep: docs/CONCEPT-bba-buku-aset.md §7.4–7.7, §14, §15, §16.
// Jalankan: npx tsx --env-file=.env.local scripts/test-bba-penerimaan.mts
// Bagian D memakai MySQL sungguhan (kotak pasir 2080–2081, data berawalan "UJIE"), dibersihkan otomatis.
import { readFileSync, existsSync } from 'node:fs'
import mysql from 'mysql2/promise'
import { ringkasPenerimaan, alasanTolakPenerimaan, sisaDitempatkan, salinanYangDibeli, referensiDariDibeli } from '../lib/bba/penerimaan'
import { cocokkanBelumTeregister, rencanakanImpor, type AsetRingan } from '../lib/bba/aset'
import { alasanTolakProses, sasaranBeku, type BbaStatus } from '../lib/bba/status'
import type { AsetBaca, HasilBacaKib } from '../lib/bba/kib-baca'
import { PenerimaanSchema, AntreanAksiSchema, HapusAsetSchema, RegisterSchema } from '../lib/data/bba-penerimaan-schemas'
import { TanggalSchema } from '../lib/data/buku-besar-aset-schemas'

let lulus = 0
const gagal: string[] = []
function ok(nama: string, syarat: unknown, ket = '') {
  if (syarat) { lulus++; console.log(`  ok  ${nama}`) }
  else { gagal.push(nama); console.log(`FAIL  ${nama}${ket ? ' — ' + ket : ''}`) }
}
const sumber = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
const coba = async <T,>(f: () => Promise<T>): Promise<T | Error> => { try { return await f() } catch (e) { return e as Error } }
const tanpaKomentar = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
const badan = (isi: string, nama: string) => { const i = isi.indexOf(`export async function ${nama}(`); const j = isi.indexOf('\nexport ', i + 10); return isi.slice(i, j < 0 ? undefined : j) }

console.log('A. Aturan murni (lib/bba/penerimaan.ts, lib/bba/aset.ts)')
const xs = [{ tgl: '2026-05-14', vol: 1, nilai: 3_900_000 }, { tgl: '2026-03-02', vol: 0.5, nilai: 1_950_000.5 }]
const r1 = ringkasPenerimaan(2, xs)
ok('A1 realisasi = Σ penerimaan: vol & nilai dijumlah dari baris (bukan vol × harga ulang), tanggal = penerimaan terakhir',
  r1.vol === 1.5 && r1.nilai === 5_850_000.5 && r1.tgl === '2026-05-14' && r1.status === 'REALISASI_SEBAGIAN', JSON.stringify(r1))
ok('A2 status hanya maju lewat penerimaan: kosong = Dalam Proses, penuh bila Σ ≥ volume (toleransi pembulatan)',
  ringkasPenerimaan(2, []).status === 'DIPROSES' && ringkasPenerimaan(2, []).tgl === null
  && ringkasPenerimaan(2, [{ tgl: '2026-01-01', vol: 1.99, nilai: 1 }]).status === 'REALISASI_SEBAGIAN'
  && ringkasPenerimaan(2, [{ tgl: '2026-01-01', vol: 1.996, nilai: 1 }]).status === 'REALISASI_PENUH')
const rr = (o: Partial<Parameters<typeof alasanTolakPenerimaan>[0]> = {}) => ({ anggaran: 'DIDANAI' as const, usulan_keputusan: null, status: 'DIPROSES' as const, vol: 2, canonical_id: 'BBA-1', ...o })
ok('A3 pagar penerimaan: didanai, bukan usulan ditolak, bukan Tidak Terealisasi, jumlah > 0, tidak sesudah hari ini, tidak melebihi volume',
  alasanTolakPenerimaan(rr(), 0, 2, '2026-10-27', '2026-10-27') === null
  && alasanTolakPenerimaan(rr({ status: 'DIRENCANAKAN' }), 0, 1, '2026-10-27', '2026-10-27') === null
  && /belum ditandai didanai/.test(alasanTolakPenerimaan(rr({ anggaran: 'BELUM' }), 0, 1, '2026-10-01', '2026-10-27') ?? '')
  && /ditolak/.test(alasanTolakPenerimaan(rr({ usulan_keputusan: 'DITOLAK' }), 0, 1, '2026-10-01', '2026-10-27') ?? '')
  && /Tidak Terealisasi/.test(alasanTolakPenerimaan(rr({ status: 'TIDAK_TEREALISASI' }), 0, 1, '2026-10-01', '2026-10-27') ?? '')
  && !!alasanTolakPenerimaan(rr(), 0, 0, '2026-10-01', '2026-10-27') && !!alasanTolakPenerimaan(rr(), 0, 1, '2026-10-28', '2026-10-27')
  && /Melebihi volume/.test(alasanTolakPenerimaan(rr(), 1.5, 0.6, '2026-10-01', '2026-10-27') ?? ''))
ok('A4 antrean: unit diterima − register yang sudah ditempatkan; rehab tidak melahirkan aset; tidak pernah negatif',
  sisaDitempatkan({ vol: 3 }, 1, 'PENGGANTIAN') === 2 && sisaDitempatkan({ vol: 3 }, 0, 'REHAB') === 0
  && sisaDitempatkan({ vol: 2.5 }, 0, null) === 2 && sisaDitempatkan({ vol: 1 }, 4, null) === 0)
const ref = { merk_tipe: 'Merk A KR-809', nama_penyedia: 'PT A', url: 'https://e-katalog.lkpp.go.id/a' }
ok('A5 yang dibeli = SALINAN referensi terpilih; isian sendiri menimpa per kolom; spasi kosong ikut referensi; tanpa referensi = isian saja',
  JSON.stringify(salinanYangDibeli(ref, {})) === JSON.stringify({ merk_tipe: 'Merk A KR-809', penyedia: 'PT A', url: 'https://e-katalog.lkpp.go.id/a' })
  && salinanYangDibeli(ref, { penyedia: ' CV B ', merk_tipe: '   ' }).penyedia === 'CV B' && salinanYangDibeli(ref, { merk_tipe: '   ' }).merk_tipe === 'Merk A KR-809'
  && salinanYangDibeli(ref, { merk_tipe: 'Merk A KR-810', url: 'https://contoh.id/x' }).merk_tipe === 'Merk A KR-810'
  && salinanYangDibeli(ref, { url: 'https://contoh.id/x' }).url === 'https://contoh.id/x'
  && JSON.stringify(salinanYangDibeli(null, { merk_tipe: 'X' })) === JSON.stringify({ merk_tipe: 'X', penyedia: null, url: null }))
const rd = referensiDariDibeli({ tgl: '2025-05-14', vol: 2, harga_satuan: 3_900_000, merk_tipe: 'Merk A', penyedia: 'PT A', url: 'https://e-katalog.lkpp.go.id/a' })
ok('A6 "pakai sebagai referensi" dari yang dibeli: harga riil, tanggal cek = tanggal diterima, sumber ditebak dari tautan',
  rd.harga === 3_900_000 && rd.tgl_cek === '2025-05-14' && rd.sumber === 'EKATALOG' && rd.merk_tipe === 'Merk A' && rd.file_id === null
  && referensiDariDibeli({ tgl: '2025-01-01', vol: 1, harga_satuan: 1, merk_tipe: null, penyedia: null, url: null }).sumber === 'LAINNYA')

const lama = (o: Partial<AsetRingan> & { id: number }): AsetRingan => ({
  golongan: 'B', kode_barang: null, register: null, kunci_impor: null, kode_objek: null, tahun_perolehan: 2025, nama_resmi: 'KURSI RODA', nama: 'Kursi roda IGD',
  lokasi_id: 7, harga: 3_900_000, asal_usul: 'Pembelian', keterangan: 'BBA-9', kondisi: 'B', kondisi_sumber: 'CEK', kib: { merk_type: 'Merk A' }, status: 'AKTIF', ...o,
})
const baca = (o: Partial<AsetBaca> & { register: string }): AsetBaca => ({
  golongan: 'B', lembar: 'KIBB', baris: 9, kunci: `K.2025-1.3.2.05|${o.register}`, kode_barang: 'K.2025-1.3.2.05', kode_objek: '1.3.2.05', tahun_perolehan: 2025,
  nama_resmi: 'KURSI RODA', harga: 3_900_000, asal_usul: 'Pembelian', keterangan: null, kondisi: 'RR', kib: { merk_type: '', no_rangka: 'R-1' }, ...o,
})
const ck = cocokkanBelumTeregister(
  [lama({ id: 3 }), lama({ id: 2 }), lama({ id: 5, harga: 1_000_000 }), lama({ id: 6, kunci_impor: 'x|1', kode_barang: 'x' }), lama({ id: 8, status: 'DIHAPUS' })],
  [baca({ register: '000012' }), baca({ register: '000011' }), baca({ register: '000013' }), baca({ register: '000014', golongan: 'E' })],
)
ok('A7 cocok otomatis: golongan + tahun + harga sama, satu-satu, register terkecil ↔ id terkecil; sisanya tetap register baru (urut berkas)',
  ck.cocok.map(x => `${x.lama.id}:${x.baru.register}`).join() === '2:000011,3:000012' && ck.sisa.map(x => x.register).join() === '000013,000014', JSON.stringify(ck.cocok.map(x => [x.lama.id, x.baru.register])))
const u0 = ck.cocok[0].ubah
ok('A8 cocok: kode & register & kunci dari berkas; kondisi yang sudah dicek tetap; sel KIB kosong tidak menghapus merk dari penerimaan',
  u0.kode_barang === 'K.2025-1.3.2.05' && u0.register === '000011' && u0.kunci_impor === 'K.2025-1.3.2.05|000011' && !('kondisi' in u0)
  && u0.kib?.merk_type === 'Merk A' && u0.kib?.no_rangka === 'R-1' && !('nama' in u0) && !('lokasi_id' in u0))
const ri = rencanakanImpor([lama({ id: 2 }), lama({ id: 9, kunci_impor: 'K.2025-1.3.2.05|000020', kode_barang: 'K.2025-1.3.2.05', register: '000020', kondisi_sumber: 'IMPOR' })],
  [baca({ register: '000020' }), baca({ register: '000021' }), baca({ register: '000022' })])
ok('A9 rencana impor: register yang sudah ada dicocokkan lewat kunci DULU; sisa baru yang cocok mengisi belum teregister, lainnya tetap baru',
  ri.cocok.length === 1 && ri.cocok[0].lama.id === 2 && ri.cocok[0].baru.register === '000021' && ri.baru.map(x => x.register).join() === '000022'
  && ri.berubah.length + ri.sama === 1)

const proses = (status: BbaStatus, anggaran = 'DIDANAI') => ({ status, anggaran, usulan_keputusan: null })
ok('A10 Proses (pesan/batal/tidak terealisasi): ditolak begitu ada penerimaan; Dalam Proses & Tidak Terealisasi hanya untuk rencana didanai',
  alasanTolakProses(proses('DIPROSES'), 'TIDAK_TEREALISASI', 0) === null && alasanTolakProses(proses('DIPROSES'), 'TIDAK_TEREALISASI', 1) !== null
  && alasanTolakProses(proses('DIRENCANAKAN', 'BELUM'), 'DIPROSES', 0) !== null && alasanTolakProses(proses('DIRENCANAKAN', 'TIDAK_DIDANAI'), 'TIDAK_TEREALISASI', 0) !== null
  && alasanTolakProses(proses('DIPROSES', 'BELUM'), 'DIRENCANAKAN', 0) === null && alasanTolakProses(proses('REALISASI_PENUH'), 'DIPROSES', 0) !== null)
ok('A11 jenis rencana & aset sasaran beku begitu ada barang diterima (bukan sejak dipesan — belum ada yang dihitung darinya)',
  sasaranBeku('REALISASI_SEBAGIAN') && sasaranBeku('REALISASI_PENUH')
  && !sasaranBeku('DIRENCANAKAN') && !sasaranBeku('DIPROSES') && !sasaranBeku('TIDAK_TEREALISASI'))

console.log('\nB. Skema (lib/data/bba-penerimaan-schemas.ts)')
const pen = { rencana_id: 1, expected_version: 0, tgl: '2026-05-14', vol: 2, harga_satuan: 3_900_000 }
ok('B1 penerimaan: jumlah > 0, tautan aman saja, referensi ke-n dalam batas', PenerimaanSchema.safeParse(pen).success
  && !PenerimaanSchema.safeParse({ ...pen, vol: 0 }).success && !PenerimaanSchema.safeParse({ ...pen, url: 'javascript:alert(1)' }).success
  && !PenerimaanSchema.safeParse({ ...pen, referensi_urutan: 11 }).success && !PenerimaanSchema.safeParse({ ...pen, tgl: '14/05/2026' }).success)
ok('B2 antrean: satu POST dua tindakan (TEMPATKAN / REHAB), bentuknya dipisah', AntreanAksiSchema.safeParse({ aksi: 'TEMPATKAN', penerimaan_id: 1, jumlah: 2, golongan: 'B', nama_resmi: 'KURSI RODA', kondisi: 'B' }).success
  && !AntreanAksiSchema.safeParse({ aksi: 'TEMPATKAN', penerimaan_id: 1, jumlah: 0, golongan: 'B', nama_resmi: 'X', kondisi: 'B' }).success
  && AntreanAksiSchema.safeParse({ aksi: 'REHAB', aset_id: 1, expected_version: 0, rencana_id: 1, kondisi: 'B', tgl: '2026-01-01' }).success
  && !AntreanAksiSchema.safeParse({ aksi: 'REHAB', penerimaan_id: 1 }).success)
ok('B3 hapus aset wajib nomor & tanggal SK; register wajib kode + nomor', !HapusAsetSchema.safeParse({ id: 1, expected_version: 0, sk_nomor: ' ', sk_tgl: '2026-01-01' }).success
  && HapusAsetSchema.safeParse({ id: 1, expected_version: 0, sk_nomor: '028/123', sk_tgl: '2026-01-01' }).success
  && !RegisterSchema.safeParse({ id: 1, expected_version: 0, kode_barang: 'x', register: '' }).success)
ok('B4 tanggal BBA harus ada di kalender (dulu 2026-02-31 lolos lalu MySQL strict → 500); 29 Feb hanya di tahun kabisat',
  !TanggalSchema.safeParse('2026-02-31').success && !TanggalSchema.safeParse('2025-02-29').success && !TanggalSchema.safeParse('2026-13-01').success
  && TanggalSchema.safeParse('2024-02-29').success && TanggalSchema.safeParse('2026-10-28').success
  && !HapusAsetSchema.safeParse({ id: 1, expected_version: 0, sk_nomor: '028/1', sk_tgl: '2026-04-31' }).success)

console.log('\nC. Satu jalur tulis & pagar (kode)')
const dataPen = tanpaKomentar(sumber('lib/data/bba-penerimaan.ts'))
const dataBba = tanpaKomentar(sumber('lib/data/buku-besar-aset.ts'))
const bCatat = badan(dataPen, 'catatPenerimaan')
const iKunci = bCatat.indexOf('const r = await kunciRencana(tx, input.rencana_id);')
const iCas = bCatat.indexOf('if (r.version !== input.expected_version) throw new BbaVersionConflictError();')
const iPagar = bCatat.indexOf('const alasan = alasanTolakPenerimaan(r, sudah, input.vol, input.tgl, tanggalHariIniWIB());')
const iBeku = bCatat.indexOf('await bekukanTautanUsulan(tx, conn, r);')
const iRef = bCatat.indexOf('await listReferensi(r.id, tx)')
const iInsert = bCatat.indexOf('INSERT INTO bba_penerimaan')
ok('C1 catatPenerimaan: kunci → CAS → pagar → bekukan tautan usulan → baca referensi (tx yang sama) → tulis → realisasi dari Σ',
  iKunci >= 0 && iKunci < iCas && iCas < iPagar && iPagar < iBeku && iBeku < iRef && iRef < iInsert && iInsert < bCatat.indexOf('await tulisRealisasi(tx, r.id, r.vol, userId)'))
const tulisReal = (s: string) => (s.match(/vol_realisasi = \$\{/g) ?? []).length
ok('C2 angka realisasi rencana ditulis HANYA dari Σ penerimaan (tulisRealisasi); Proses menolkan, tidak menerima angka',
  tulisReal(dataPen) === 1 && dataPen.includes('const r = ringkasPenerimaan(vol, xs);') && tulisReal(dataBba) === 0
  && badan(dataBba, 'ubahStatusProses').includes('vol_realisasi = 0, nilai_realisasi = 0, tgl_realisasi = NULL')
  && !existsSync(new URL('../app/api/buku-besar-aset/realisasi/route.ts', import.meta.url)))
const bHapus = badan(dataPen, 'hapusPenerimaan')
ok('C3 hapus penerimaan: ditolak bila sudah ditempatkan; dari Diterima penuh hanya Admin (A4); route mengoper kewenangan sesi',
  bHapus.indexOf('if (aset > 0) throw new PenerimaanDitolakError(') < bHapus.indexOf('DELETE FROM bba_penerimaan')
  && bHapus.indexOf('if (dariPenuh && !bolehKoreksiMundur)') < bHapus.indexOf('DELETE FROM bba_penerimaan')
  && sumber('app/api/buku-besar-aset/pengadaan/route.ts').includes('hapusPenerimaan(p.data.id, g.session.userId, bolehBatalkanFinal(g.session.role))'))
ok('C3b hapus penerimaan: realisasi lama (pindahan) hanya Admin & rehab yang sudah memperbarui gedung ditolak — keduanya SEBELUM DELETE; layar mengunci tombolnya',
  bHapus.indexOf('if (Number(p[0].pindahan) === 1 && !bolehKoreksiMundur)') > 0 && bHapus.indexOf('if (Number(p[0].pindahan) === 1 && !bolehKoreksiMundur)') < bHapus.indexOf('DELETE FROM bba_penerimaan')
  && bHapus.indexOf("if (r.jenis_rencana === 'REHAB') {") > 0 && bHapus.indexOf("if (r.jenis_rencana === 'REHAB') {") < bHapus.indexOf('DELETE FROM bba_penerimaan')
  && sumber('app/(dashboard)/buku-besar-aset/_components/ModalPengadaan.tsx').includes("p.pindahan && !bolehKoreksiMundur ? 'Realisasi lama"))
const bUbah = badan(dataBba, 'updateAset')
ok('C3c jenis rencana & aset sasaran beku sejak diterima: diperiksa di server (L82), layar ikut mengunci isiannya',
  bUbah.indexOf('if (sasaranBeku(cur.status)) {') > 0 && bUbah.indexOf('if (sasaranBeku(cur.status)) {') < bUbah.indexOf('await withTransaction(')
  && sumber('app/api/buku-besar-aset/route.ts').includes("if (err instanceof BbaSasaranBekuError)     return NextResponse.json({ ok: false, code: 'SASARAN_BEKU'")
  && sumber('app/(dashboard)/buku-besar-aset/_components/ModalItem.tsx').includes('<fieldset disabled={jenisBeku}')
  && sumber('app/(dashboard)/buku-besar-aset/_components/ModalItem.tsx').includes('<select value={isian.jenis_rencana} disabled={jenisBeku}'))
const bTempat = badan(dataPen, 'tempatkan')
ok('C4 tempatkan: penerimaan dikunci FOR UPDATE, sisa dihitung di bawah kunci, register lahir lewat bulkInsert + riwayat TERIMA',
  bTempat.includes('WHERE p.id = ${input.penerimaan_id} FOR UPDATE') && bTempat.indexOf('if (input.jumlah > sisa)') < bTempat.indexOf("await bulkInsert('bba_aset'")
  && bTempat.includes("id, 'TERIMA', null,") && bTempat.includes("const kib = input.golongan === 'B' && p.merk_tipe ? { merk_type: String(p.merk_tipe) } : {};"))
const mig = sumber('docs/migrations/migration-bba-penerimaan.sql')
const skema = sumber('docs/schema-mysql.sql')
ok('C5 migrasi: realisasi lama jadi satu penerimaan bertanda pindahan (tidak masuk antrean); FK RESTRICT; ADD COLUMN tanpa IF NOT EXISTS',
  /INSERT INTO bba_penerimaan \([^)]*pindahan\)/.test(mig) && /'Realisasi sebelum pencatatan penerimaan \(dipindah otomatis\)', 1/.test(mig)
  && !/ADD COLUMN IF NOT EXISTS/i.test(mig) && (mig.match(/ON DELETE RESTRICT/g) ?? []).length === 2
  && dataPen.includes('WHERE p.pindahan = 0 AND (b.jenis_rencana IS NULL OR b.jenis_rencana <> \'REHAB\')')
  && skema.indexOf('CREATE TABLE IF NOT EXISTS bba_penerimaan') < skema.indexOf('CREATE TABLE IF NOT EXISTS bba_aset ('))
const TGL_CADANGAN = mig.match(/COALESCE\(b\.tgl_realisasi, (.+?)\), b\.vol_realisasi/)?.[1] ?? ''
const nav = sumber('app/(dashboard)/buku-besar-aset/_components/BbaNav.tsx')
const rencanaKlien = sumber('app/(dashboard)/buku-besar-aset/buku-besar-aset-client.tsx')
const pengadaanKlien = sumber('app/(dashboard)/buku-besar-aset/pengadaan/pengadaan-client.tsx')
ok('C6 halaman Pengadaan terdaftar; Rencana & Pengadaan memakai modal Proses & Penerimaan yang SAMA',
  nav.includes("pengadaan: '/buku-besar-aset/pengadaan',") && rencanaKlien.includes('<ModalPengadaan ') && pengadaanKlien.includes('<ModalPengadaan ')
  && sumber('app/(dashboard)/buku-besar-aset/pengadaan/page.tsx').includes("izinLayarBba('pengadaan')"))
const pengadaanRoute = tanpaKomentar(sumber('app/api/buku-besar-aset/pengadaan/route.ts'))
ok('C7 daftar Pengadaan = rencana DIDANAI saja; GET berizin Lihat Pengadaan', dataPen.includes("WHERE b.tahun_anggaran = ${tahun} AND b.anggaran = 'DIDANAI'")
  && pengadaanRoute.includes("tolakKecualiLihat(g.session, 'pengadaan')"))
const bCocok = tanpaKomentar(sumber('lib/data/bba-aset.ts'))
ok('C9 Excel KIB (bentuk ekspor provinsi) tanpa register belum teregister — penyaringnya sama dengan BI/Rekap/sensus',
  tanpaKomentar(sumber('app/api/buku-besar-aset/aset/excel/route.ts')).includes('const isi = (await Promise.all(daftar.map(asetUntukKib))).map(xs => xs.filter(masukBukuResmi));'))
ok('C10 salin tahun lalu: himpunan rencana BERREFERENSI bernama sesuai isinya', !dataBba.includes('tanpaRef') && badan(dataBba, 'salinTahunLalu').includes('!punyaRef.has(r.id)'))
ok('C8 impor KIB: cocok otomatis ditulis di transaksi impor yang sama (sesudah kunci impor), riwayat REGISTER',
  bCocok.indexOf("await acquireBludLock(tx, 'bba_aset_impor', 'semua');") < bCocok.indexOf('for (const bagian of potong(rencana.cocok))')
  && bCocok.includes("lama.id, 'REGISTER', JSON.stringify({ kode_barang: null, register: null })"))

console.log('\nD. MySQL sungguhan (kotak pasir 2080–2081)')
const TAHUN = [2080, 2081]
const UJI = 'UJIE'
let c: mysql.Connection | null = null
try {
  c = await mysql.createConnection({
    host: process.env.MYSQL_HOST, port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER, password: process.env.MYSQL_PASSWORD, database: process.env.MYSQL_DATABASE,
  })
} catch (e) { console.log(`DILEWATI bagian DB: MySQL tidak bisa dihubungi (${(e as { code?: string }).code ?? e})`) }
if (c) {
  const k = c
  const bersih = async () => {
    await k.query(`DELETE FROM bba_rencana_aset WHERE rencana_id IN (SELECT id FROM buku_besar_aset WHERE tahun_anggaran IN (?))`, [TAHUN])
    await k.query(`DELETE FROM bba_aset WHERE nama_resmi LIKE 'UJIE%' OR kunci_impor LIKE 'UJIE%' OR penerimaan_id IN
      (SELECT p.id FROM bba_penerimaan p JOIN buku_besar_aset b ON b.id = p.rencana_id WHERE b.tahun_anggaran IN (?))`, [TAHUN])
    await k.query('DELETE p FROM bba_penerimaan p JOIN buku_besar_aset b ON b.id = p.rencana_id WHERE b.tahun_anggaran IN (?)', [TAHUN])
    await k.query('DELETE FROM buku_besar_aset WHERE tahun_anggaran IN (?)', [TAHUN])
    await k.query('DELETE FROM usulan_items WHERE no_usulan = ?', [UJI])
    await k.query('DELETE FROM usulan_headers WHERE no_usulan = ?', [UJI])
    await k.query("DELETE FROM bba_barang WHERE nama LIKE 'UJIE%'")
    await k.query("DELETE FROM bba_lokasi WHERE nama LIKE 'UJIE%'")
  }
  await bersih()
  const D = await import('../lib/data/buku-besar-aset')
  const PEN = await import('../lib/data/bba-penerimaan')
  const A = await import('../lib/data/bba-aset')
  const [u] = await k.query('SELECT id FROM users ORDER BY id LIMIT 1') as [Array<{ id: number }>, unknown]
  const userId = Number(u[0]?.id ?? 0)
  const satu = async <T,>(q: string, p: unknown[] = []) => ((await k.query(q, p)) as [T[], unknown])[0][0]
  const versi = async (id: number) => Number((await satu<{ version: number }>('SELECT version FROM buku_besar_aset WHERE id = ?', [id]))?.version)
  const versiAset = async (id: number) => Number((await satu<{ version: number }>('SELECT version FROM bba_aset WHERE id = ?', [id]))?.version)
  const rencana = async (id: number) => satu<{ status: string; vol_realisasi: string; nilai_realisasi: string; tgl_realisasi: string | null; tgl_proses: string | null }>(
    "SELECT status, vol_realisasi, nilai_realisasi, DATE_FORMAT(tgl_realisasi, '%Y-%m-%d') AS tgl_realisasi, DATE_FORMAT(tgl_proses, '%Y-%m-%d') AS tgl_proses FROM buku_besar_aset WHERE id = ?", [id])
  const nPen = async (id: number) => Number((await satu<{ n: number }>('SELECT COUNT(*) AS n FROM bba_penerimaan WHERE rencana_id = ?', [id]))?.n)
  const danai = async (id: number) => D.tandaiAnggaran({ anggaran: 'DIDANAI', item: [{ id, expected_version: await versi(id) }] }, userId)
  const terima = async (id: number, o: { tgl: string; vol: number; harga_satuan: number; referensi_urutan?: number; merk_tipe?: string }) =>
    PEN.catatPenerimaan({ rencana_id: id, expected_version: await versi(id), ...o }, userId)
  const asetBaru = async (o: Record<string, unknown>) => {
    const kolom = Object.keys(o)
    const [r] = await k.query(`INSERT INTO bba_aset (${kolom.join(', ')}) VALUES (?)`, [kolom.map(x => o[x])]) as [{ insertId: number }, unknown]
    return r.insertId
  }
  try {
    const [lok] = await k.query("INSERT INTO bba_lokasi (nama) VALUES ('UJIE IGD')") as [{ insertId: number }, unknown]
    const lama1 = await asetBaru({ golongan: 'B', kode_barang: 'UJIE.01.2016-1.3.2.05.02', register: '000001', kunci_impor: 'UJIE.01.2016-1.3.2.05.02|000001', tahun_perolehan: 2016, nama_resmi: 'UJIE KURSI RODA LAMA', kib: '{}', harga: 1_500_000, kondisi: 'RB', kondisi_sumber: 'CEK' })
    const lama2 = await asetBaru({ golongan: 'B', kode_barang: 'UJIE.01.2016-1.3.2.05.02', register: '000002', kunci_impor: 'UJIE.01.2016-1.3.2.05.02|000002', tahun_perolehan: 2016, nama_resmi: 'UJIE KURSI RODA LAMA', kib: '{}', harga: 1_500_000, kondisi: 'RB', kondisi_sumber: 'CEK' })
    const ganti = await D.createAset({ tahun_anggaran: 2081, uraian: `${UJI} Kursi roda pengganti`, sumber_anggaran: 'BLUD', vol: 2, harga: 4_000_000, satuan: 'unit',
      barang_baru: 'UJIE Kursi Roda', jenis_rencana: 'PENGGANTIAN', aset_sasaran: [lama1, lama2],
      referensi: [{ sumber: 'EKATALOG', nama_penyedia: 'PT A', merk_tipe: 'Merk A KR-809', url: 'https://e-katalog.lkpp.go.id/a', harga: 3_950_000 },
        { sumber: 'TOKO_DARING', nama_penyedia: 'Toko B', merk_tipe: 'Merk B', url: 'https://shopee.co.id/b', harga: 4_200_000 }] }, userId)

    const belum = await coba(() => terima(ganti.id, { tgl: '2026-05-14', vol: 1, harga_satuan: 3_917_123 }))
    ok('D1 penerimaan rencana yang belum didanai ditolak, tidak ada baris tertulis', belum instanceof PEN.PenerimaanDitolakError && await nPen(ganti.id) === 0)
    await danai(ganti.id)
    const basi = await coba(async () => PEN.catatPenerimaan({ rencana_id: ganti.id, expected_version: (await versi(ganti.id)) - 1, tgl: '2026-05-14', vol: 1, harga_satuan: 1 }, userId))
    const depan = await coba(() => terima(ganti.id, { tgl: '2099-01-01', vol: 1, harga_satuan: 1 }))
    const lebih = await coba(() => terima(ganti.id, { tgl: '2026-05-14', vol: 3, harga_satuan: 1 }))
    ok('D2 angka kunci basi → 409; tanggal sesudah hari ini & melebihi volume → ditolak; tidak ada yang tertulis',
      basi instanceof D.BbaVersionConflictError && depan instanceof PEN.PenerimaanDitolakError && lebih instanceof PEN.PenerimaanDitolakError && await nPen(ganti.id) === 0)

    const h1 = await terima(ganti.id, { tgl: '2026-05-14', vol: 1, harga_satuan: 3_917_123, referensi_urutan: 1 })
    const p1 = await rencana(ganti.id)
    const [b1] = (await k.query("SELECT merk_tipe, penyedia, url, nilai FROM bba_penerimaan WHERE rencana_id = ?", [ganti.id]) as [Array<{ merk_tipe: string; penyedia: string; url: string; nilai: string }>, unknown])[0]
    const sasaran1 = (await k.query('SELECT siap_dihapus FROM bba_aset WHERE id IN (?) ORDER BY id', [[lama1, lama2]]) as [Array<{ siap_dihapus: number }>, unknown])[0]
    ok('D3 penerimaan sebagian: status Diterima sebagian, realisasi = Σ, tgl_proses kosong diisi tanggal penerimaan, yang dibeli tersalin dari referensi ke-1',
      h1.status === 'REALISASI_SEBAGIAN' && p1.status === 'REALISASI_SEBAGIAN' && Number(p1.vol_realisasi) === 1 && Number(p1.nilai_realisasi) === 3_917_123
      && p1.tgl_realisasi === '2026-05-14' && p1.tgl_proses === '2026-05-14' && b1.merk_tipe === 'Merk A KR-809' && b1.penyedia === 'PT A' && b1.url === 'https://e-katalog.lkpp.go.id/a',
      JSON.stringify({ p1, b1 }))
    ok('D4 penggantian diterima SEBAGIAN → aset lama belum ditandai siap dihapus (belum tahu unit mana yang sudah ada penggantinya)',
      h1.siapDihapus === 0 && sasaran1.every(x => x.siap_dihapus === 0), JSON.stringify({ h1, sasaran1 }))
    const ubahRef = await coba(async () => D.updateAset({ id: ganti.id, expected_version: await versi(ganti.id), referensi: [] }, userId))
    const prosesLagi = await coba(async () => D.ubahStatusProses({ id: ganti.id, expected_version: await versi(ganti.id), status: 'DIPROSES' }, userId))
    ok('D5 sesudah penerimaan: referensi beku, status tidak bisa diubah lewat Proses (mengikuti penerimaan)', ubahRef instanceof D.BbaReferensiBekuError && prosesLagi instanceof D.BbaStatusMismatchError)
    const vSebelum = await versi(ganti.id)
    const ubahJenis = await coba(() => D.updateAset({ id: ganti.id, expected_version: vSebelum, jenis_rencana: 'PENAMBAHAN' }, userId))
    const ubahSasaran = await coba(() => D.updateAset({ id: ganti.id, expected_version: vSebelum, aset_sasaran: [lama1] }, userId))
    const kosongkanJenis = await coba(() => D.updateAset({ id: ganti.id, expected_version: vSebelum, jenis_rencana: null }, userId))
    const sama = await coba(() => D.updateAset({ id: ganti.id, expected_version: vSebelum, jenis_rencana: 'PENGGANTIAN', aset_sasaran: [lama2, lama1], keterangan: 'UJIE sama' }, userId))
    ok('D5b sesudah diterima: jenis & aset sasaran beku (diubah/dikosongkan → SASARAN_BEKU, tanpa menulis); isian yang sama (urutan lain) tetap tersimpan',
      ubahJenis instanceof D.BbaSasaranBekuError && ubahSasaran instanceof D.BbaSasaranBekuError && kosongkanJenis instanceof D.BbaSasaranBekuError
      && !(sama instanceof Error) && await versi(ganti.id) === vSebelum + 1
      && (await satu<{ jenis_rencana: string }>('SELECT jenis_rencana FROM buku_besar_aset WHERE id = ?', [ganti.id]))?.jenis_rencana === 'PENGGANTIAN'
      && Number((await satu<{ n: number }>('SELECT COUNT(*) AS n FROM bba_rencana_aset WHERE rencana_id = ?', [ganti.id]))?.n) === 2,
      String(sama instanceof Error ? sama.message : ''))

    const h2 = await terima(ganti.id, { tgl: '2026-05-20', vol: 1, harga_satuan: 3_917_123, merk_tipe: 'Merk A KR-810' })
    const p2 = await rencana(ganti.id)
    ok('D6 penerimaan kedua: Diterima penuh, nilai = Σ dua baris, tanggal = penerimaan terakhir, isian sendiri menimpa merk',
      h2.status === 'REALISASI_PENUH' && Number(p2.nilai_realisasi) === 7_834_246 && p2.tgl_realisasi === '2026-05-20'
      && (await satu<{ merk_tipe: string }>('SELECT merk_tipe FROM bba_penerimaan WHERE rencana_id = ? ORDER BY id DESC LIMIT 1', [ganti.id]))?.merk_tipe === 'Merk A KR-810')
    const tanda = async () => ((await k.query('SELECT siap_dihapus FROM bba_aset WHERE id IN (?) ORDER BY id', [[lama1, lama2]])) as [Array<{ siap_dihapus: number }>, unknown])[0]
    ok('D6b penggantian Diterima PENUH → aset sasaran ditandai siap dihapus (+ riwayat)', h2.siapDihapus === 2 && (await tanda()).every(x => x.siap_dihapus === 1)
      && Number((await satu<{ n: number }>("SELECT COUNT(*) AS n FROM bba_aset_riwayat WHERE aset_id = ? AND jenis = 'UBAH' AND catatan LIKE 'Diganti lewat%'", [lama1]))?.n) === 1)
    const idPen2 = Number((await satu<{ id: number }>('SELECT id FROM bba_penerimaan WHERE rencana_id = ? ORDER BY id DESC LIMIT 1', [ganti.id]))?.id)
    const bukanAdmin = await coba(() => PEN.hapusPenerimaan(idPen2, userId, false))
    const hp = await PEN.hapusPenerimaan(idPen2, userId, true)
    const p3 = await rencana(ganti.id)
    ok('D7 koreksi mundur dari Diterima penuh: ditolak tanpa kewenangan Admin; dengan kewenangan → dihitung ulang jadi sebagian, tanda siap dihapus dilepas',
      bukanAdmin instanceof PEN.PenerimaanDitolakError && hp?.dariPenuh === true && p3.status === 'REALISASI_SEBAGIAN' && Number(p3.nilai_realisasi) === 3_917_123
      && (await tanda()).every(x => x.siap_dihapus === 0))
    await terima(ganti.id, { tgl: '2026-05-20', vol: 1, harga_satuan: 3_917_123, referensi_urutan: 2 })

    // Antrean & penempatan
    const [pindah] = await k.query(`INSERT INTO bba_penerimaan (rencana_id, tgl, vol, harga_satuan, nilai, catatan, pindahan) VALUES (?, '2020-01-01', 1, 1, 1, 'pindahan uji', 1)`, [ganti.id]) as [{ insertId: number }, unknown]
    const an = await PEN.antreanBukuAset()
    const milik = an.terima.filter(x => x.rencana_id === ganti.id)
    ok('D8 antrean: tiap penerimaan dengan unit yang belum ditempatkan; baris pindahan (realisasi lama) tidak ikut', milik.length === 2 && milik.every(x => x.sisa === 1 && x.harga_satuan === 3_917_123))
    // Pindahan hanya untuk uji antrean — dibuang (oleh Admin) supaya realisasi = Σ penerimaan tetap benar di langkah berikutnya.
    const pindahBukanAdmin = await coba(() => PEN.hapusPenerimaan(pindah.insertId, userId, false))
    const masihAda = await nPen(ganti.id)
    await PEN.hapusPenerimaan(pindah.insertId, userId, true)
    ok('D8b realisasi lama (pindahan) hanya bisa dihapus Admin — nilainya tidak bisa dicatat ulang persis',
      pindahBukanAdmin instanceof PEN.PenerimaanDitolakError && /realisasi lama/.test(pindahBukanAdmin.message) && masihAda === 3 && await nPen(ganti.id) === 2)
    const pen1 = milik.find(x => x.merk_tipe === 'Merk A KR-809')!
    const t1 = await PEN.tempatkan({ penerimaan_id: pen1.penerimaan_id, jumlah: 1, golongan: 'B', nama_resmi: 'UJIE KURSI RODA', nama: 'Kursi roda IGD', lokasi_id: lok.insertId, kondisi: 'B' }, userId)
    const baru = await satu<{ id: number; kode_barang: string | null; harga: string; tahun_perolehan: number; kib: string | Record<string, unknown>; lokasi_id: number; kondisi: string; kondisi_sumber: string; barang_id: number | null }>(
      'SELECT id, kode_barang, harga, tahun_perolehan, kib, lokasi_id, kondisi, kondisi_sumber, barang_id FROM bba_aset WHERE penerimaan_id = ?', [pen1.penerimaan_id])
    const kib = typeof baru.kib === 'string' ? JSON.parse(baru.kib) : baru.kib
    ok('D9 tempatkan: register belum teregister, harga riil, tahun = tahun diterima, merk/tipe yang dibeli → Merk/Type KIB B, ruangan & kondisi dicek, barang ikut rencana',
      t1.ditempatkan === 1 && baru.kode_barang === null && Number(baru.harga) === 3_917_123 && baru.tahun_perolehan === 2026 && kib.merk_type === 'Merk A KR-809'
      && baru.lokasi_id === lok.insertId && baru.kondisi === 'B' && baru.kondisi_sumber === 'CEK' && baru.barang_id !== null
      && Number((await satu<{ n: number }>("SELECT COUNT(*) AS n FROM bba_aset_riwayat WHERE aset_id = ? AND jenis = 'TERIMA'", [baru.id]))?.n) === 1, JSON.stringify(baru))
    const lewat = await coba(() => PEN.tempatkan({ penerimaan_id: pen1.penerimaan_id, jumlah: 1, golongan: 'B', nama_resmi: 'X', kondisi: 'B' }, userId))
    const hapusDitempatkan = await coba(() => PEN.hapusPenerimaan(pen1.penerimaan_id, userId, true))
    ok('D10 unit yang sudah ditempatkan tidak bisa ditempatkan lagi; penerimaan yang sudah jadi register tidak bisa dihapus',
      lewat instanceof PEN.PenerimaanDitolakError && hapusDitempatkan instanceof PEN.PenerimaanDitolakError
      && !(await PEN.antreanBukuAset()).terima.some(x => x.penerimaan_id === pen1.penerimaan_id))

    const dBelum = await A.daftarAset({ tanda: 'BELUM_TEREGISTER', q: 'UJIE' })
    const dSiap = await A.daftarAset({ tanda: 'SIAP_DIHAPUS', q: 'UJIE' })
    ok('D11 saringan Buku Aset: belum teregister & siap dihapus (hitungan seluruh buku ikut)', dBelum.ringkas.jumlah === 1 && dSiap.ringkas.jumlah === 2
      && dBelum.tanda.belumTeregister >= 1 && dBelum.tanda.siapDihapus >= 2)

    const salahGol = await coba(async () => PEN.isiRegister({ id: baru.id, expected_version: await versiAset(baru.id), kode_barang: 'UJIE.01.2026-1.3.3.01.01', register: '7' }, userId))
    const kembar = await coba(async () => PEN.isiRegister({ id: baru.id, expected_version: await versiAset(baru.id), kode_barang: 'UJIE.01.2016-1.3.2.05.02', register: '1' }, userId))
    const reg = await PEN.isiRegister({ id: baru.id, expected_version: await versiAset(baru.id), kode_barang: 'UJIE.01.2026-1.3.2.05.02', register: '7' }, userId)
    const sesudahReg = await satu<{ register: string; kunci_impor: string; kode_objek: string }>('SELECT register, kunci_impor, kode_objek FROM bba_aset WHERE id = ?', [baru.id])
    ok('D12 isi register: kode golongan lain & kunci yang sudah dipakai ditolak; register angka jadi 6 digit, kunci impor & kode objek ikut, riwayat REGISTER',
      salahGol instanceof A.AsetDitolakError && kembar instanceof A.AsetDitolakError && reg.kunci_impor === 'UJIE.01.2026-1.3.2.05.02|000007'
      && sesudahReg.register === '000007' && sesudahReg.kode_objek === '1.3.2.05.02'
      && Number((await satu<{ n: number }>("SELECT COUNT(*) AS n FROM bba_aset_riwayat WHERE aset_id = ? AND jenis = 'REGISTER'", [baru.id]))?.n) === 1)

    // Balapan register kembar: koneksi lain memegang kunci yang sama di transaksi TERBUKA. SELECT pemeriksa di
    // isiRegister tidak melihatnya (belum commit), UPDATE-nya menunggu indeks UNIK, lalu bentrok begitu commit.
    // Lahir dari penerimaan: isi register hanya untuk catatan yang lahir di PRIMA (Tahap F §20.2).
    const regA = await asetBaru({ golongan: 'B', tahun_perolehan: 2026, nama_resmi: 'UJIE KURSI RODA BALAP A', kib: '{}', harga: 1, penerimaan_id: pen1.penerimaan_id })
    const regB = await asetBaru({ golongan: 'B', tahun_perolehan: 2026, nama_resmi: 'UJIE KURSI RODA BALAP B', kib: '{}', harga: 1, penerimaan_id: pen1.penerimaan_id })
    const vB = await versiAset(regB)
    await k.query('START TRANSACTION')
    await k.query("UPDATE bba_aset SET kode_barang = 'UJIE.01.2026-1.3.2.05.02', register = '000099', kunci_impor = 'UJIE.01.2026-1.3.2.05.02|000099' WHERE id = ?", [regA])
    const balap = coba(() => PEN.isiRegister({ id: regB, expected_version: vB, kode_barang: 'UJIE.01.2026-1.3.2.05.02', register: '99' }, userId))
    for (let i = 0; i < 60; i++) {
      const w = await coba(async () => Number(((await k.query('SELECT COUNT(*) AS n FROM performance_schema.data_lock_waits')) as [Array<{ n: number }>, unknown])[0][0]?.n ?? 0))
      if (w instanceof Error || w > 0) break
      await new Promise(r => setTimeout(r, 50))
    }
    await k.query('COMMIT')
    const hasilBalap = await balap
    ok('D12b register kembar yang lolos pemeriksaan karena balapan → ditolak dengan pesan, bukan 500 ER_DUP_ENTRY',
      hasilBalap instanceof A.AsetDitolakError && /sudah dipakai register lain/.test(hasilBalap.message)
      && (await satu<{ kunci_impor: string | null }>('SELECT kunci_impor FROM bba_aset WHERE id = ?', [regB]))?.kunci_impor === null,
      hasilBalap instanceof Error ? `${hasilBalap.name}: ${hasilBalap.message}` : JSON.stringify(hasilBalap))

    // Cocok otomatis saat impor KIB: unit kedua ditempatkan, lalu register-nya datang dari berkas provinsi.
    const pen2 = milik.find(x => x.merk_tipe === 'Merk B') ?? (await PEN.antreanBukuAset()).terima.find(x => x.rencana_id === ganti.id)!
    await PEN.tempatkan({ penerimaan_id: pen2.penerimaan_id, jumlah: 1, golongan: 'B', nama_resmi: 'UJIE KURSI RODA', nama: 'Kursi roda IGD 2', lokasi_id: lok.insertId, kondisi: 'B' }, userId)
    const unit2 = Number((await satu<{ id: number }>('SELECT id FROM bba_aset WHERE penerimaan_id = ?', [pen2.penerimaan_id]))?.id)
    const dariBerkas = (reg: string): AsetBaca => ({ golongan: 'B', lembar: 'KIBB', baris: 9, kunci: `UJIE.01.2026-1.3.2.05.02|${reg}`, kode_barang: 'UJIE.01.2026-1.3.2.05.02',
      register: reg, kode_objek: '1.3.2.05.02', tahun_perolehan: 2026, nama_resmi: 'UJIE KURSI RODA', harga: 3_917_123, asal_usul: 'Pembelian', keterangan: null, kondisi: 'RR', kib: { merk_type: '', ukuran_cc: '-' } })
    const berkas = { aset: [dariBerkas('000007'), dariBerkas('000008')], lembar: [], masalah: [], peringatan: [], kop: null } as unknown as HasilBacaKib
    const pra = await A.pratinjauImpor(berkas)
    const gB = pra.perGolongan.find(g => g.golongan === 'B')!
    ok('D13 pratinjau impor: register yang sudah diisi = sama; yang baru mengisi unit belum teregister (bukan baris baru)', gB.cocok === 1 && gB.baru === 0 && pra.contohCocok[0]?.register === '000008', JSON.stringify(gB))
    const s = await A.simpanImpor(berkas, userId, 'uji-cocok.xlsx')
    const u2 = await satu<{ register: string; kunci_impor: string; nama: string; lokasi_id: number; kondisi: string; kondisi_sumber: string; kib: string | Record<string, unknown> }>(
      'SELECT register, kunci_impor, nama, lokasi_id, kondisi, kondisi_sumber, kib FROM bba_aset WHERE id = ?', [unit2])
    const kib2 = typeof u2.kib === 'string' ? JSON.parse(u2.kib) : u2.kib
    ok('D14 simpan impor: unit kedua mendapat register 000008; nama sehari-hari, ruangan, kondisi dicek tetap; merk dari penerimaan tidak dihapus sel kosong',
      s.cocok === 1 && s.baru === 0 && u2.register === '000008' && u2.kunci_impor === 'UJIE.01.2026-1.3.2.05.02|000008' && u2.nama === 'Kursi roda IGD 2'
      && u2.lokasi_id === lok.insertId && u2.kondisi === 'B' && u2.kondisi_sumber === 'CEK' && kib2.merk_type === 'Merk B' && kib2.ukuran_cc === '-'
      && Number((await satu<{ n: number }>("SELECT COUNT(*) AS n FROM bba_aset_riwayat WHERE aset_id = ? AND jenis = 'REGISTER' AND catatan LIKE 'Cocok otomatis%'", [unit2]))?.n) === 1,
      JSON.stringify({ s, u2 }))

    // Penghapusan dengan SK
    const skDepan = await coba(async () => PEN.hapusAset({ id: lama1, expected_version: await versiAset(lama1), sk_nomor: '028/1', sk_tgl: '2099-01-01' }, userId))
    await PEN.hapusAset({ id: lama1, expected_version: await versiAset(lama1), sk_nomor: '028/123/2026', sk_tgl: '2026-10-01', catatan: 'diganti' }, userId)
    const dh = await satu<{ status: string; hapus_sk_nomor: string; hapus_sk_tgl: string; siap_dihapus: number }>("SELECT status, hapus_sk_nomor, DATE_FORMAT(hapus_sk_tgl, '%Y-%m-%d') AS hapus_sk_tgl, siap_dihapus FROM bba_aset WHERE id = ?", [lama1])
    const duaKali = await coba(async () => PEN.hapusAset({ id: lama1, expected_version: await versiAset(lama1), sk_nomor: 'x', sk_tgl: '2026-10-01' }, userId))
    const det = await A.detailAset(lama1)
    ok('D15 hapus dengan SK: tanggal SK di depan ditolak; status DIHAPUS + nomor/tanggal SK, tanda siap dihapus lepas, riwayat HAPUS; dihapus dua kali ditolak',
      skDepan instanceof A.AsetDitolakError && dh.status === 'DIHAPUS' && dh.hapus_sk_nomor === '028/123/2026' && dh.hapus_sk_tgl === '2026-10-01' && dh.siap_dihapus === 0
      && duaKali instanceof A.AsetDitolakError && det?.aset.hapus_sk_nomor === '028/123/2026' && det.riwayat[0]?.jenis === 'HAPUS')

    const lama3 = await asetBaru({ golongan: 'B', kode_barang: 'UJIE.01.2016-1.3.2.05.02', register: '000003', kunci_impor: 'UJIE.01.2016-1.3.2.05.02|000003', tahun_perolehan: 2016, nama_resmi: 'UJIE KURSI RODA LAMA', kib: '{}', harga: 1_500_000, kondisi: 'RB', kondisi_sumber: 'CEK' })
    const rencanaLain = await D.createAset({ tahun_anggaran: 2080, uraian: `${UJI} Ganti kursi roda lain`, sumber_anggaran: 'BLUD', vol: 1, harga: 1, jenis_rencana: 'PENGGANTIAN', aset_sasaran: [lama3] }, userId)
    await PEN.hapusAset({ id: lama3, expected_version: await versiAset(lama3), sk_nomor: '028/124/2026', sk_tgl: '2026-10-02' }, userId)
    const tetap = await coba(async () => D.updateAset({ id: rencanaLain.id, expected_version: await versi(rencanaLain.id), aset_sasaran: [lama3, lama2] }, userId))
    const tambahDihapus = await coba(async () => D.updateAset({ id: rencanaLain.id, expected_version: await versi(rencanaLain.id), aset_sasaran: [lama3, lama2, lama1] }, userId))
    ok('D15b sasaran yang sudah dihapus dengan SK boleh tetap tinggal (rencana masih bisa disimpan); yang BARU ditambahkan tetap harus aktif',
      !(tetap instanceof Error) && tambahDihapus instanceof D.BbaSasaranTidakDikenalError
      && Number((await satu<{ n: number }>('SELECT COUNT(*) AS n FROM bba_rencana_aset WHERE rencana_id = ?', [rencanaLain.id]))?.n) === 2,
      tetap instanceof Error ? tetap.message : '')

    // Rehab
    const gedung = await asetBaru({ golongan: 'C', kode_barang: 'UJIE.01.1990-1.3.3.01.01', register: '000001', kunci_impor: 'UJIE.01.1990-1.3.3.01.01|000001', tahun_perolehan: 1990, nama_resmi: 'UJIE GEDUNG BANGSAL', kib: '{}', harga: 500_000_000, kondisi: 'RR', kondisi_sumber: 'CEK' })
    const rehab = await D.createAset({ tahun_anggaran: 2081, uraian: `${UJI} Rehab bangsal`, sumber_anggaran: 'BLUD', vol: 1, harga: 200_000_000, satuan: 'paket', jenis_rencana: 'REHAB', aset_sasaran: [gedung] }, userId)
    await danai(rehab.id)
    await terima(rehab.id, { tgl: '2026-09-30', vol: 1, harga_satuan: 198_000_000 })
    const an2 = await PEN.antreanBukuAset()
    const tugas = an2.rehab.find(x => x.rencana_id === rehab.id)
    ok('D16 rehab diterima: tidak masuk antrean "barang diterima" (tidak melahirkan aset), muncul sebagai "perbarui kondisi gedung"',
      !an2.terima.some(x => x.rencana_id === rehab.id) && tugas?.aset_id === gedung && tugas.aset_golongan === 'C')
    const bukanSasaran = await coba(async () => PEN.catatRehab({ aset_id: lama2, expected_version: await versiAset(lama2), rencana_id: rehab.id, kondisi: 'B', tgl: '2026-10-01' }, userId))
    await PEN.catatRehab({ aset_id: gedung, expected_version: tugas!.aset_version, rencana_id: rehab.id, kondisi: 'B', tgl: '2026-10-01' }, userId)
    const g2 = await satu<{ kondisi: string; kondisi_tgl: string }>("SELECT kondisi, DATE_FORMAT(kondisi_tgl, '%Y-%m-%d') AS kondisi_tgl FROM bba_aset WHERE id = ?", [gedung])
    ok('D17 catat rehab: aset bukan sasaran ditolak; kondisi gedung diperbarui, riwayat REHAB menyebut rencananya, antrean rehab selesai',
      bukanSasaran instanceof A.AsetDitolakError && g2.kondisi === 'B' && g2.kondisi_tgl === '2026-10-01'
      && Number((await satu<{ n: number }>("SELECT COUNT(*) AS n FROM bba_aset_riwayat WHERE aset_id = ? AND jenis = 'REHAB' AND JSON_UNQUOTE(JSON_EXTRACT(sesudah, '$.rencana')) = ?", [gedung, rehab.canonical_id]))?.n) === 1
      && !(await PEN.antreanBukuAset()).rehab.some(x => x.rencana_id === rehab.id))
    const penRehab = Number((await satu<{ id: number }>('SELECT id FROM bba_penerimaan WHERE rencana_id = ?', [rehab.id]))?.id)
    const hapusRehab = await coba(() => PEN.hapusPenerimaan(penRehab, userId, true))
    ok('D17b penerimaan rehab yang sudah memperbarui kondisi gedung tidak bisa dihapus — riwayat gedung tidak ditinggal menunjuk rencana Dalam Proses',
      hapusRehab instanceof PEN.PenerimaanDitolakError && /Kondisi gedung sudah diperbarui/.test(hapusRehab.message) && await nPen(rehab.id) === 1
      && (await rencana(rehab.id)).status === 'REALISASI_PENUH')

    // Pembelian sebelumnya membawa yang benar-benar dibeli
    const barangId = Number((await satu<{ barang_id: number }>('SELECT barang_id FROM buku_besar_aset WHERE id = ?', [ganti.id]))?.barang_id)
    const lawas = await D.createAset({ tahun_anggaran: 2080, uraian: `${UJI} Kursi roda lawas`, sumber_anggaran: 'BLUD', vol: 1, harga: 2_000_000, barang_id: barangId }, userId)
    await k.query("UPDATE buku_besar_aset SET status = 'REALISASI_PENUH', anggaran = 'DIDANAI', vol_realisasi = 1, nilai_realisasi = 2000000 WHERE id = ?", [lawas.id])
    await k.query("INSERT INTO bba_penerimaan (rencana_id, tgl, vol, harga_satuan, nilai, merk_tipe, catatan, pindahan) VALUES (?, '2020-06-01', 1, 2000000, 2000000, 'BUKAN-YANG-DIBELI', 'pindahan uji', 1)", [lawas.id])
    const pb = await D.pembelianSebelumnya(barangId)
    const lalu = pb.prima.find(x => x.id === ganti.id)
    ok('D18 pembelian sebelumnya: "yang dibeli" per penerimaan (merk, penyedia, tautan, harga riil) di samping referensi waktu itu',
      lalu?.dibeli.length === 2 && lalu.dibeli[0].merk_tipe === 'Merk A KR-809' && lalu.dibeli[1].penyedia === 'Toko B' && lalu.dibeli[0].harga_satuan === 3_917_123
      && lalu.referensi.length === 2, JSON.stringify(lalu?.dibeli))
    ok('D18b realisasi lama yang dipindah migrasi tetap tampil sebagai pembelian, tanpa "yang dibeli" karangan', pb.prima.find(x => x.id === lawas.id)?.dibeli.length === 0)

    const cadangan = async (tahun: number) =>
      (await satu<{ t: string }>(`SELECT DATE_FORMAT(${TGL_CADANGAN.replaceAll('b.tahun_anggaran', '?')}, '%Y-%m-%d') AS t`, [tahun]))?.t
    const hariIniDb = (await satu<{ t: string }>("SELECT DATE_FORMAT(CURDATE(), '%Y-%m-%d') AS t"))?.t
    ok('D18c migrasi: rencana lama tanpa tanggal realisasi → 31 Des tahun anggarannya (kabisat juga), tapi tidak sesudah hari ini',
      TGL_CADANGAN !== '' && await cadangan(2024) === '2024-12-31' && await cadangan(2023) === '2023-12-31' && await cadangan(2099) === hariIniDb,
      `${TGL_CADANGAN} → ${await cadangan(2024)} / ${await cadangan(2099)}`)

    const pesan = await D.createAset({ tahun_anggaran: 2080, uraian: `${UJI} Dipesan`, sumber_anggaran: 'BLUD', vol: 1, harga: 1 }, userId)
    await danai(pesan.id)
    const pesanDepan = await coba(async () => D.ubahStatusProses({ id: pesan.id, expected_version: await versi(pesan.id), status: 'DIPROSES', tgl_proses: '2099-01-01' }, userId))
    const vPesan = await versi(pesan.id)
    await D.ubahStatusProses({ id: pesan.id, expected_version: vPesan, status: 'DIPROSES', tgl_proses: '2026-10-01' }, userId)
    ok('D18d tanggal pesan/kontrak sesudah hari ini ditolak server (bukan cuma atribut max di layar); tanggal lampau diterima',
      pesanDepan instanceof D.BbaStatusMismatchError && await versi(pesan.id) === vPesan + 1 && (await rencana(pesan.id)).tgl_proses === '2026-10-01')

    const undanai = await D.createAset({ tahun_anggaran: 2080, uraian: `${UJI} Tak didanai`, sumber_anggaran: 'BLUD', vol: 1, harga: 1 }, userId)
    const daftar = await PEN.pengadaanTahun(2081)
    ok('D19 halaman Pengadaan: hanya rencana didanai tahun itu, penerimaan ikut', daftar.rows.length === 2 && daftar.rows.every(r => r.anggaran === 'DIDANAI')
      && (daftar.penerimaan[ganti.id]?.length ?? 0) === 2 && !(await PEN.pengadaanTahun(2080)).rows.some(r => r.id === undanai.id))
  } finally {
    await bersih()
    const sisa = await satu<{ a: number; p: number; s: number }>(`SELECT (SELECT COUNT(*) FROM buku_besar_aset WHERE tahun_anggaran IN (?)) AS a,
      (SELECT COUNT(*) FROM bba_penerimaan p JOIN buku_besar_aset b ON b.id = p.rencana_id WHERE b.tahun_anggaran IN (?)) AS p,
      (SELECT COUNT(*) FROM bba_aset WHERE nama_resmi LIKE 'UJIE%' OR kunci_impor LIKE 'UJIE%') AS s`, [TAHUN, TAHUN])
    ok('D20 kotak pasir bersih kembali', Number(sisa.a) + Number(sisa.p) + Number(sisa.s) === 0, JSON.stringify(sisa))
    await k.end()
  }
}

console.log(`\n${lulus} lulus, ${gagal.length} gagal`)
if (gagal.length) { console.log(gagal.map(g => `  - ${g}`).join('\n')); process.exit(1) }
process.exit(0)
