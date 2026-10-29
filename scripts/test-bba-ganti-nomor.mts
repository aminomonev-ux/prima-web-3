#!/usr/bin/env npx tsx
// scripts/test-bba-ganti-nomor.mts — Tahap G Buku Aset: nomor diganti provinsi & catatan kembar —
// pasangkan "aset yang sama, nomornya berubah" di pratinjau impor, gabungkan dengan kembarannya di kartu aset.
// Konsep: docs/CONCEPT-bba-buku-aset.md §23.
// Jalankan: npx tsx --env-file=.env.local scripts/test-bba-ganti-nomor.mts
// Bagian D memakai MySQL sungguhan (kotak pasir 2078, data berawalan "UJIG"), dibersihkan otomatis.
import { readFileSync } from 'node:fs'
import mysql from 'mysql2/promise'
import { rencanakanImpor, calonGantiNomor, calonPasti, sejenisCalon, ubahGantiNomor, selisihRiwayat, type AsetRingan } from '../lib/bba/aset'
import { alasanTakBisaGabung } from '../lib/bba/koreksi'
import type { AsetBaca, HasilBacaKib } from '../lib/bba/kib-baca'
import { PasanganImporSchema, GabungKembarSchema, KembarCariSchema } from '../lib/data/bba-aset-schemas'

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

const KODE = 'K.2016-1.3.2.05'
const reg = (r: string) => ({ kode_barang: KODE, register: r, kunci_impor: `${KODE}|${r}` })
const aset = (o: Partial<AsetRingan> & { id: number }): AsetRingan => ({
  golongan: 'B', kode_barang: null, register: null, kunci_impor: null, kode_objek: '1.3.2.05', tahun_perolehan: 2016, nama_resmi: 'KURSI RODA', nama: null,
  lokasi_id: null, harga: 1_500_000, asal_usul: 'Pembelian', keterangan: null, kondisi: 'B', kondisi_sumber: 'IMPOR', kib: {}, status: 'AKTIF', penerimaan_id: null, ...o,
})
const baca = (r: string, o: Partial<AsetBaca> = {}): AsetBaca => ({
  golongan: 'B', lembar: 'KIBB', baris: 9, kunci: `${KODE}|${r}`, kode_barang: KODE, register: r, kode_objek: '1.3.2.05',
  tahun_perolehan: 2016, nama_resmi: 'KURSI RODA', harga: 1_500_000, asal_usul: 'Pembelian', keterangan: null, kondisi: 'B', kib: {}, ...o,
})

console.log('A. Aturan murni (lib/bba/aset.ts, lib/bba/koreksi.ts)')
const dariBerkas = aset({ id: 1 }), dariPrima = aset({ id: 2, penerimaan_id: 9, nama_resmi: 'Kursi roda IGD' })
ok('A1 calon: golongan + tahun + harga; nama resmi (besar-kecil & spasi diabaikan) hanya untuk aset dari berkas — isian Tempatkan diketik petugas',
  sejenisCalon(dariBerkas, baca('1', { nama_resmi: 'Kursi  roda' })) && !sejenisCalon(dariBerkas, baca('1', { nama_resmi: 'TENSIMETER' }))
  && sejenisCalon(dariPrima, baca('1')) && sejenisCalon(dariPrima, baca('1', { nama_resmi: 'TENSIMETER' }))
  && !sejenisCalon(dariBerkas, baca('1', { harga: 1_500_001 })) && !sejenisCalon(dariBerkas, baca('1', { tahun_perolehan: 2017 }))
  && !sejenisCalon(dariBerkas, baca('1', { golongan: 'E' })))

const lama = aset({ id: 1, ...reg('000123'), nama: 'Kursi roda IGD', lokasi_id: 5, kondisi: 'RR', kondisi_sumber: 'CEK', barang_id: 7 })
const tanpa = rencanakanImpor([lama], [baca('000132')])
ok('A2 tanpa pasangan = keadaan hari ini: nomor baru jadi aset baru, catatan lama "tidak ada di berkas", calonnya ditawarkan',
  tanpa.baru.map(b => b.register).join() === '000132' && tanpa.tidakDiBerkas.map(a => a.id).join() === '1' && tanpa.dipasangkan.length === 0
  && tanpa.calon.length === 1 && tanpa.calon[0].baru.map(b => b.register).join() === '000132' && tanpa.pasanganDitolak.length === 0)
const dengan = rencanakanImpor([lama], [baca('000132', { kib: { merk: 'X' } })], [{ aset_id: 1, kunci: `${KODE}|000132` }])
const u = dengan.dipasangkan[0]?.ubah ?? {}
ok('A3 dipasangkan: bukan aset baru & bukan "tidak di berkas"; catatan lama dapat nomor + kunci + kolom KIB, kondisi hasil cek & isian PRIMA tidak disentuh',
  dengan.baru.length === 0 && dengan.tidakDiBerkas.length === 0 && dengan.dipasangkan.length === 1 && dengan.pasanganDitolak.length === 0
  && u.register === '000132' && u.kunci_impor === `${KODE}|000132` && u.kib?.merk === 'X' && !('kondisi' in u)
  && !('nama' in u) && !('lokasi_id' in u) && !('barang_id' in u) && !('penerimaan_id' in u), JSON.stringify(u))
const lama2 = aset({ id: 2, ...reg('000124') })
const tolakA = rencanakanImpor([lama], [baca('000132')], [{ aset_id: 99, kunci: `${KODE}|000132` }])
const tolakB = rencanakanImpor([lama], [baca('000132')], [{ aset_id: 1, kunci: `${KODE}|000999` }])
const tolakC = rencanakanImpor([lama, lama2], [baca('000132')], [{ aset_id: 1, kunci: `${KODE}|000132` }, { aset_id: 2, kunci: `${KODE}|000132` }])
ok('A4 pasangan di luar daftar calon (aset bukan calon, register bukan calonnya, register dipakai dua kali) dilaporkan — data layer membatalkan seluruhnya',
  tolakA.pasanganDitolak.length === 1 && /isi Buku Aset berubah/.test(tolakA.pasanganDitolak[0])
  && tolakB.pasanganDitolak.length === 1 && tolakC.pasanganDitolak.length === 1 && /dua kali/.test(tolakC.pasanganDitolak[0]) && tolakC.dipasangkan.length === 1,
  JSON.stringify([tolakA.pasanganDitolak, tolakB.pasanganDitolak, tolakC.pasanganDitolak]))
const salahKetik = aset({ id: 3, penerimaan_id: 9, ...reg('000123') }), belum = aset({ id: 4, penerimaan_id: 9 })
const tanpaP = rencanakanImpor([salahKetik, belum], [baca('000132')])
const denganP = rencanakanImpor([salahKetik, belum], [baca('000132')], [{ aset_id: 3, kunci: `${KODE}|000132` }])
ok('A5 register yang tadinya mengisi barang belum teregister bisa dipasangkan ke catatan lama — cocok otomatis dihitung SESUDAH pasangan',
  tanpaP.cocok.map(x => x.lama.id).join() === '4' && tanpaP.calon.map(x => x.lama.id).join() === '3'
  && denganP.dipasangkan.map(x => x.lama.id).join() === '3' && denganP.cocok.length === 0 && denganP.baru.length === 0)
const fLama = aset({ id: 5, golongan: 'F', kode_objek: null, kunci_impor: 'f|gedung baru|jl. a|2025-01-01', tahun_perolehan: 2025, nama_resmi: 'GEDUNG BARU', harga: 9e8, kib: { letak: 'Jl. A' } })
const fBaca = baca('', { golongan: 'F', lembar: 'KIBF', kunci: 'f|gedung baru|jl. a no. 1|2025-01-01', kode_barang: null, register: null, kode_objek: null, tahun_perolehan: 2025, nama_resmi: 'GEDUNG BARU', harga: 9e8, kib: { letak: 'Jl. A No. 1' } })
const fP = rencanakanImpor([fLama], [fBaca], [{ aset_id: 5, kunci: fBaca.kunci }])
ok('A6 KIB F tanpa kode: letak dibetulkan provinsi → kuncinya berubah; tetap jadi calon dan bisa dipasangkan',
  fP.dipasangkan.length === 1 && fP.dipasangkan[0].ubah.kunci_impor === fBaca.kunci && fP.dipasangkan[0].ubah.kib?.letak === 'Jl. A No. 1' && fP.baru.length === 0)
const c17 = { tahun_perolehan: 2017, harga: 2_000_000 }, c18 = { tahun_perolehan: 2018, harga: 3_000_000 }
const pasti = calonPasti(calonGantiNomor(
  [lama, aset({ id: 6, ...reg('000150'), ...c17 }), aset({ id: 7, ...reg('000151'), ...c17 }), aset({ id: 8, ...reg('000160'), ...c18 }), aset({ id: 9, ...reg('000161'), ...c18 })],
  [baca('000132'), baca('000170', c17), baca('000171', c17), baca('000180', c18)],
))
ok('A7 "pasti": tepat satu calon DAN register itu bukan calon catatan lain', [...pasti].join() === '1', JSON.stringify([...pasti]))
const beli = aset({ id: 10, penerimaan_id: 9, kib: { merk: 'Merk Beli' } }), berkasLama = aset({ id: 11, ...reg('000123'), kib: { merk: 'Lama' } })
const isi = { ...baca('000132', { kib: { merk: '', ukuran: 'Besar' } }) }
const uPrima = ubahGantiNomor(beli, isi), uBerkas = ubahGantiNomor(berkasLama, isi)
const rw = selisihRiwayat(berkasLama, uBerkas)
ok('A8 lahir dari Tempatkan: sel KIB kosong di berkas tidak menghapus merk dari penerimaan; aset dari berkas: kolom KIB berkas menang; riwayat tanpa kunci impor',
  uPrima.kib?.merk === 'Merk Beli' && uPrima.kib?.ukuran === 'Besar' && uBerkas.kib?.merk === '' && uBerkas.kib?.ukuran === 'Besar'
  && rw.sebelum.register === '000123' && rw.sesudah.register === '000132' && !('kunci_impor' in rw.sesudah) && rw.sesudah.merk === '' && !('kode_barang' in rw.sesudah),
  JSON.stringify({ uPrima: uPrima.kib, uBerkas: uBerkas.kib, rw }))
const ini = aset({ id: 20, ...reg('000123'), lokasi_id: 5, kondisi_sumber: 'CEK' }), kembar = aset({ id: 21, ...reg('000132') })
const g = (k: Partial<AsetRingan>, fakta?: Parameters<typeof alasanTakBisaGabung>[2], i: Partial<AsetRingan> = {}) => alasanTakBisaGabung({ ...ini, ...i }, { ...kembar, ...k }, fakta) ?? ''
const fakta = (jenisRiwayat: string[], sasaran: string[] = [], gedung: string[] = []) => ({ jenisRiwayat, rujukan: { sasaran, gedung } })
ok('A9 gabungkan: kembaran dari berkas & bersih → boleh (juga untuk catatan ini yang lahir dari Tempatkan, belum teregister)',
  alasanTakBisaGabung(ini, kembar, fakta(['IMPOR'])) === null && alasanTakBisaGabung(aset({ id: 22, penerimaan_id: 9 }), kembar, fakta(['IMPOR'])) === null)
ok('A10 kembaran yang dibuang wajib bersih: lahir dari penerimaan, sudah dicek / dipindah / ditautkan / diubah, jadi sasaran rencana / gedung ruangan → ditolak dengan sebabnya',
  /lahir dari barang diterima/.test(g({ penerimaan_id: 9 })) && /kondisinya dicek/.test(g({}, fakta(['IMPOR', 'KONDISI'])))
  && /kondisinya dicek/.test(g({ kondisi_sumber: 'CEK' })) && /ditempatkan di ruangan/.test(g({ lokasi_id: 3 }))
  && /nama sehari-hari\/barang diubah/.test(g({ barang_id: 4 })) && /nama sehari-hari\/barang diubah/.test(g({}, fakta(['IMPOR', 'UBAH'])))
  && /rencana BBA-7/.test(g({}, fakta(['IMPOR'], ['BBA-7']))) && /gedung ruangan IGD/.test(g({}, fakta(['IMPOR'], [], ['IGD']))))
ok('A11 bukan kembaran: catatan yang sama, golongan berbeda (reklasifikasi), salah satunya sudah dihapus',
  /catatan yang sama/.test(g({ id: 20 })) && /reklasifikasi/.test(g({ golongan: 'C' }))
  && /sudah dihapus/.test(g({ status: 'DIHAPUS' })) && /sudah dihapus/.test(g({}, undefined, { status: 'DIHAPUS' })))

console.log('\nB. Skema Zod')
const p1 = [{ aset_id: 1, kunci: 'a|1' }]
ok('B1 pasangan impor: satu catatan & satu register berkas hanya sekali; kunci tak dikenal ditolak; boleh kosong',
  PasanganImporSchema.safeParse(p1).success && PasanganImporSchema.safeParse([]).success
  && !PasanganImporSchema.safeParse([...p1, { aset_id: 1, kunci: 'a|2' }]).success && !PasanganImporSchema.safeParse([...p1, { aset_id: 2, kunci: 'a|1' }]).success
  && !PasanganImporSchema.safeParse([{ ...p1[0], lain: 1 }]).success)
const gb = { id: 1, expected_version: 0, kembar_id: 2, expected_version_kembar: 3, alasan: 'register diganti provinsi' }
ok('B2 gabungkan: alasan ≥ 5 huruf, tidak boleh dengan dirinya sendiri; cari kembaran menerima id dari query string',
  GabungKembarSchema.safeParse(gb).success && !GabungKembarSchema.safeParse({ ...gb, alasan: 'x' }).success && !GabungKembarSchema.safeParse({ ...gb, kembar_id: 1 }).success
  && KembarCariSchema.safeParse({ id: '5' }).success && KembarCariSchema.safeParse({ id: '5', register: '000132' }).success && !KembarCariSchema.safeParse({ id: 'x' }).success)

console.log('\nC. Pagar di kode')
const aSql = tanpaKomentar(sumber('lib/data/bba-aset.ts'))
const bSimpan = badan(aSql, 'simpanImpor')
ok('C1 simpan impor: pasangan dinilai ulang di bawah kunci; satu saja bukan calon → batal SEBELUM ada yang ditulis',
  bSimpan.includes('rencanakanImpor(await asetLamaUntuk(tx, golongan, true), hasil.aset, pasangan)')
  && bSimpan.indexOf('if (rencana.pasanganDitolak.length) throw new ImporBasiError(rencana.pasanganDitolak);') > 0
  && bSimpan.indexOf('if (rencana.pasanganDitolak.length) throw new ImporBasiError(rencana.pasanganDitolak);') < bSimpan.indexOf('INSERT INTO bba_aset')
  && bSimpan.indexOf('if (rencana.pasanganDitolak.length) throw new ImporBasiError(rencana.pasanganDitolak);') < bSimpan.indexOf('bulkInsert('))
const bGabung = badan(aSql, 'gabungKembar')
const iKunci = bGabung.indexOf('ORDER BY a.id FOR UPDATE')
ok('C2 gabungkan: dua baris dikunci urut id + angka kunci keduanya; riwayat & rujukan kembaran dibaca SESUDAH kunci; pagar sebelum DELETE; kembaran dihapus DULU (kunci impor unik)',
  iKunci > 0 && bGabung.includes('if (basi > 0) throw new AsetVersiError(basi);')
  && ['FROM bba_aset_riwayat WHERE aset_id = ${kembar.id}', 'FROM bba_rencana_aset ra', 'FROM bba_lokasi WHERE gedung_aset_id'].every(t => bGabung.indexOf(t) > iKunci)
  && bGabung.indexOf('if (tolak) throw new AsetDitolakError([tolak]);') < bGabung.indexOf('DELETE FROM bba_aset')
  && bGabung.indexOf('DELETE FROM bba_aset WHERE id = ${kembar.id}') < bGabung.indexOf('UPDATE bba_aset SET'))
const rImpor = tanpaKomentar(sumber('app/api/buku-besar-aset/aset/impor/route.ts'))
const rGabung = tanpaKomentar(sumber('app/api/buku-besar-aset/aset/gabung/route.ts'))
ok('C3 route: impor meneruskan pasangan tervalidasi Zod & menjawab 409 PRATINJAU_BASI; gabung GET = izin LIHAT, POST = izin EDIT Aset sebelum membaca isian',
  rImpor.includes('PasanganImporSchema.safeParse(isi)') && rImpor.includes('simpanImpor(hasil, g.session.userId, nama, pasangan)') && rImpor.includes("code: 'PRATINJAU_BASI'")
  && /export async function GET[\s\S]*?tolakKecualiLihat\(g\.session, 'aset'\)[\s\S]*?safeParse/.test(rGabung)
  && /export async function POST[\s\S]*?tolakKecualiEdit\(g\.session, 'aset'\)[\s\S]*?safeParse/.test(rGabung))
ok('C4 jenis audit BBA_ASET_GABUNG terdaftar & digolongkan retensinya (perubahan data)',
  sumber('lib/security/auditlog.ts').includes("| 'BBA_ASET_GABUNG'") && /BBA_ASET_GABUNG: P/.test(sumber('lib/security/retensi-audit.ts')))
const kartu = tanpaKomentar(sumber('app/(dashboard)/buku-besar-aset/_components/KartuAset.tsx'))
const blokAktif = kartu.slice(kartu.indexOf("{bolehUbah && a.status === 'AKTIF' && ("), kartu.indexOf("{bolehUbah && a.status === 'DIHAPUS' && ("))
const modal = tanpaKomentar(sumber('app/(dashboard)/buku-besar-aset/_components/ModalImporKib.tsx'))
ok('C5 layar: tombol Gabungkan hanya di blok aset aktif berizin ubah; modal impor mengirim pilihan pasangan & memuat ulang pratinjau saat basi',
  blokAktif.includes("onClick={() => setAksi('gabung')}") && kartu.includes("{aksi === 'gabung' && a && <ModalGabungKembar")
  && modal.includes("fd.append('pasangan', JSON.stringify(pasangan))") && modal.includes("if (r.isi.code === 'PRATINJAU_BASI') { basi = true; return; }")
  && modal.includes('if (basi) void baca(berkas);'))

console.log('\nD. MySQL sungguhan (kotak pasir 2078)')
const TAHUN = 2078
const UJI = 'UJIG'
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
    await k.query('DELETE FROM bba_rencana_aset WHERE rencana_id IN (SELECT id FROM buku_besar_aset WHERE tahun_anggaran = ?)', [TAHUN])
    await k.query(`DELETE FROM bba_aset WHERE nama_resmi LIKE 'UJIG%' OR kunci_impor LIKE 'UJIG%' OR kunci_impor LIKE 'f|ujig%' OR penerimaan_id IN
      (SELECT p.id FROM bba_penerimaan p JOIN buku_besar_aset b ON b.id = p.rencana_id WHERE b.tahun_anggaran = ?)`, [TAHUN])
    await k.query('DELETE p FROM bba_penerimaan p JOIN buku_besar_aset b ON b.id = p.rencana_id WHERE b.tahun_anggaran = ?', [TAHUN])
    await k.query('DELETE FROM buku_besar_aset WHERE tahun_anggaran = ?', [TAHUN])
    await k.query("DELETE FROM bba_lokasi WHERE nama LIKE 'UJIG%'")
  }
  await bersih()
  const D = await import('../lib/data/buku-besar-aset')
  const PEN = await import('../lib/data/bba-penerimaan')
  const A = await import('../lib/data/bba-aset')
  const [usr] = await k.query('SELECT id FROM users ORDER BY id LIMIT 1') as [Array<{ id: number }>, unknown]
  const userId = Number(usr[0]?.id ?? 0)
  const satu = async <T,>(q: string, p: unknown[] = []) => ((await k.query(q, p)) as [T[], unknown])[0][0]
  const versi = async (id: number) => Number((await satu<{ version: number }>('SELECT version FROM buku_besar_aset WHERE id = ?', [id]))?.version)
  const versiAset = async (id: number) => Number((await satu<{ version: number }>('SELECT version FROM bba_aset WHERE id = ?', [id]))?.version)
  const n = async (q: string, p: unknown[] = []) => Number((await satu<{ n: number }>(q, p))?.n ?? 0)
  const asetBaru = async (o: Record<string, unknown>) => {
    const kolom = Object.keys(o)
    const [r] = await k.query(`INSERT INTO bba_aset (${kolom.join(', ')}) VALUES (?)`, [kolom.map(x => o[x])]) as [{ insertId: number }, unknown]
    return r.insertId
  }
  const baris = async (id: number) => satu<{ register: string | null; kunci_impor: string | null; lokasi_id: number | null; kondisi: string; kondisi_sumber: string; nama: string | null; harga: string; penerimaan_id: number | null; kib: unknown }>(
    'SELECT register, kunci_impor, lokasi_id, kondisi, kondisi_sumber, nama, harga, penerimaan_id, kib FROM bba_aset WHERE id = ?', [id])
  const KD = 'UJIG.01.2016-1.3.2.05.02', HARGA = 1_234_567, NAMA = 'UJIG KURSI RODA'
  const brs = (r: string, o: Partial<AsetBaca> = {}): AsetBaca => ({
    golongan: 'B', lembar: 'KIBB', baris: 9, kunci: `${KD}|${r}`, kode_barang: KD, register: r, kode_objek: '1.3.2.05.02',
    tahun_perolehan: 2016, nama_resmi: NAMA, harga: HARGA, asal_usul: 'Pembelian', keterangan: null, kondisi: 'B', kib: {}, ...o,
  })
  const berkas = (...aset: AsetBaca[]) => ({ aset, lembar: [], masalah: [], peringatan: [], kop: null }) as unknown as HasilBacaKib
  const asetBerkas = (r: string, o: Record<string, unknown> = {}) => asetBaru({ golongan: 'B', kode_barang: KD, register: r, kunci_impor: `${KD}|${r}`, kode_objek: '1.3.2.05.02',
    tahun_perolehan: 2016, nama_resmi: NAMA, kib: '{}', harga: HARGA, kondisi: 'B', kondisi_sumber: 'IMPOR', ...o })
  const pindah = async (id: number, lokasi: number) => A.pindahkanAset({ lokasi_id: lokasi, item: [{ id, expected_version: await versiAset(id) }] }, userId)
  try {
    const [lok] = await k.query("INSERT INTO bba_lokasi (nama) VALUES ('UJIG Ruang Uji')") as [{ insertId: number }, unknown]
    const L1 = await asetBerkas('000123', { nama: 'Kursi roda IGD' })
    await pindah(L1, lok.insertId)
    await A.catatKondisi({ tgl: '2026-10-01', item: [{ id: L1, expected_version: await versiAset(L1), kondisi: 'RR' }] }, userId)

    const pra = await A.pratinjauImpor(berkas(brs('000132')))
    const cL1 = pra.calon.find(x => x.aset_id === L1)
    ok('D1 pratinjau: catatan dari berkas yang nomornya diganti provinsi ditawarkan (pasti, dengan ruangannya); tanpa pilihan nomor itu masih "baru"',
      !!cL1 && cL1.pasti && cL1.dariBerkas && cL1.ruangan === 'UJIG Ruang Uji' && cL1.pilihan.map(b => b.register).join() === '000132'
      && pra.perGolongan.find(x => x.golongan === 'B')!.baru === 1, JSON.stringify({ cL1, gB: pra.perGolongan.find(x => x.golongan === 'B') }))

    const s1 = await A.simpanImpor(berkas(brs('000132')), userId, 'uji-g1.xlsx', [{ aset_id: L1, kunci: `${KD}|000132` }])
    const b1 = await baris(L1)
    ok('D2 simpan dengan pasangan: nomor pindah ke catatan lama (ruangan, kondisi hasil cek, nama sehari-hari tetap), tidak ada aset baru, riwayat REGISTER + riwayat lama utuh',
      s1.dipasangkan === 1 && s1.baru === 0 && b1.register === '000132' && b1.kunci_impor === `${KD}|000132` && Number(b1.lokasi_id) === lok.insertId
      && b1.kondisi === 'RR' && b1.kondisi_sumber === 'CEK' && b1.nama === 'Kursi roda IGD'
      && await n('SELECT COUNT(*) AS n FROM bba_aset WHERE kunci_impor = ?', [`${KD}|000132`]) === 1
      && await n("SELECT COUNT(*) AS n FROM bba_aset_riwayat WHERE aset_id = ? AND jenis = 'REGISTER' AND catatan LIKE 'Nomor berubah di provinsi%uji-g1.xlsx'", [L1]) === 1
      && await n("SELECT COUNT(*) AS n FROM bba_aset_riwayat WHERE aset_id = ? AND jenis IN ('PINDAH', 'KONDISI')", [L1]) === 2, JSON.stringify({ s1, b1 }))

    const vBasi = await versiAset(L1)
    const basi = await coba(() => A.simpanImpor(berkas(brs('000132'), brs('000140')), userId, 'uji-g-basi.xlsx', [{ aset_id: L1, kunci: `${KD}|000140` }]))
    ok('D3 pasangan basi (catatan itu kini cocok lewat kuncinya) → seluruh impor batal, tidak ada yang tertulis',
      basi instanceof A.ImporBasiError && basi.alasan.length === 1 && await n('SELECT COUNT(*) AS n FROM bba_aset WHERE kunci_impor = ?', [`${KD}|000140`]) === 0
      && await versiAset(L1) === vBasi)

    // Kembar yang terlanjur: impor disimpan tanpa memasangkan.
    const L2 = await asetBerkas('000200', { nama: 'Kursi roda Bangsal' })
    await pindah(L2, lok.insertId)
    const s2 = await A.simpanImpor(berkas(brs('000132'), brs('000201')), userId, 'uji-g2.xlsx')
    const T = Number((await satu<{ id: number }>('SELECT id FROM bba_aset WHERE kunci_impor = ?', [`${KD}|000201`]))?.id)
    ok('D4 impor tanpa memasangkan → kembar: nomor baru jadi catatan baru, catatan lama tetap aktif',
      s2.baru === 1 && T > 0 && await n("SELECT COUNT(*) AS n FROM bba_aset WHERE id IN (?) AND status = 'AKTIF'", [[L2, T]]) === 2)

    const lain = await asetBerkas('000250', { nama_resmi: 'UJIG TENSIMETER' })
    const saran = await A.calonKembar(L2)
    const sT = saran?.calon.find(x => x.id === T), sL1 = saran?.calon.find(x => x.id === L1)
    const cari = await A.calonKembar(L2, '000201'), cariLain = await A.calonKembar(L2, '000250')
    ok('D5 saran kembaran di kartu: kembaran bersih bisa dipilih (berkas impornya disebut); yang sudah diisi di PRIMA ditolak dengan sebabnya; nama resmi lain bukan saran tapi bisa dicari',
      !!sT && sT.alasan === null && sT.sejenis && sT.berkas === 'uji-g2.xlsx' && !!sL1 && /sudah diisi di PRIMA \(.*ditempatkan di ruangan/.test(sL1.alasan ?? '')
      && cari?.calon.some(x => x.id === T) === true && !saran?.calon.some(x => x.id === lain)
      && cariLain?.calon.some(x => x.id === lain && !x.sejenis && x.alasan === null) === true, JSON.stringify({ sT, sL1 }))

    const vL2 = await versiAset(L2), vT = await versiAset(T)
    const gBasi = await coba(() => A.gabungKembar({ id: L2, expected_version: vL2 - 1, kembar_id: T, expected_version_kembar: vT, alasan: 'register diganti provinsi' }, userId))
    const gKotor = await coba(async () => A.gabungKembar({ id: L2, expected_version: vL2, kembar_id: L1, expected_version_kembar: await versiAset(L1), alasan: 'register diganti provinsi' }, userId))
    ok('D6 angka kunci basi → 409; kembaran yang sudah diisi di PRIMA → ditolak; keduanya utuh',
      gBasi instanceof A.AsetVersiError && gKotor instanceof A.AsetDitolakError && /sudah diisi di PRIMA/.test(gKotor.message)
      && await n('SELECT COUNT(*) AS n FROM bba_aset WHERE id IN (?)', [[L1, L2, T]]) === 3)

    // Jejak PRIMA yang hanya ada di riwayat (nama sehari-hari diubah) & rujukan rencana — keduanya dibaca server di bawah kunci.
    const T3 = await asetBerkas('000260')
    await A.ubahAset({ id: T3, expected_version: await versiAset(T3), nama: 'Kursi roda dibetulkan namanya' }, userId)
    const gRiwayat = await coba(async () => A.gabungKembar({ id: L2, expected_version: vL2, kembar_id: T3, expected_version_kembar: await versiAset(T3), alasan: 'uji riwayat' }, userId))
    const saranT3 = (await A.calonKembar(L2))?.calon.find(x => x.id === T3)
    const pelihara = await D.createAset({ tahun_anggaran: TAHUN, uraian: `${UJI} Servis kursi roda`, sumber_anggaran: 'BLUD', vol: 1, harga: 1, jenis_rencana: 'PEMELIHARAAN', aset_sasaran: [T] }, userId)
    const gSasaran = await coba(async () => A.gabungKembar({ id: L2, expected_version: vL2, kembar_id: T, expected_version_kembar: await versiAset(T), alasan: 'uji rujukan' }, userId))
    ok('D6b kembaran yang hanya punya jejak di riwayat (nama diubah) atau jadi aset sasaran rencana → ditolak, di saran maupun saat menggabung',
      gRiwayat instanceof A.AsetDitolakError && /nama sehari-hari\/barang diubah/.test(gRiwayat.message) && /nama sehari-hari\/barang diubah/.test(saranT3?.alasan ?? '')
      && gSasaran instanceof A.AsetDitolakError && gSasaran.message.includes(pelihara.canonical_id),
      `${gRiwayat instanceof Error ? gRiwayat.message : ''} | ${gSasaran instanceof Error ? gSasaran.message : ''}`)
    await k.query('DELETE FROM bba_rencana_aset WHERE aset_id = ?', [T])

    const vL2b = await versiAset(L2), vTb = await versiAset(T)
    const hg = await A.gabungKembar({ id: L2, expected_version: vL2b, kembar_id: T, expected_version_kembar: vTb, alasan: 'register diganti provinsi' }, userId)
    const b2 = await baris(L2)
    ok('D7 gabungkan: kembaran dibuang beserta riwayat impornya; catatan ini mengambil nomornya, ruangan & riwayat tetap; riwayat menyebut kembaran & alasan',
      hg.nomorBaru.includes('000201') && hg.nomorLama.includes('000200') && await n('SELECT COUNT(*) AS n FROM bba_aset WHERE id = ?', [T]) === 0
      && await n('SELECT COUNT(*) AS n FROM bba_aset_riwayat WHERE aset_id = ?', [T]) === 0
      && b2.register === '000201' && b2.kunci_impor === `${KD}|000201` && Number(b2.lokasi_id) === lok.insertId && await versiAset(L2) === vL2b + 1
      && await n(`SELECT COUNT(*) AS n FROM bba_aset_riwayat WHERE aset_id = ? AND jenis = 'REGISTER' AND catatan LIKE ?`, [L2, `Digabung dengan catatan kembar #${T} (Impor KIB — uji-g2.xlsx) — register diganti provinsi`]) === 1
      && await n("SELECT COUNT(*) AS n FROM bba_aset_riwayat WHERE aset_id = ? AND jenis = 'PINDAH'", [L2]) === 1, JSON.stringify({ hg, b2 }))
    const pra3 = await A.pratinjauImpor(berkas(brs('000132'), brs('000201')))
    ok('D8 impor ulang sesudah digabung: kedua nomor cocok lewat kuncinya — tidak ada aset baru, tidak ada calon',
      pra3.perGolongan.find(x => x.golongan === 'B')!.baru === 0 && !pra3.calon.some(x => x.aset_id === L1 || x.aset_id === L2), JSON.stringify(pra3.perGolongan))

    // Lahir dari Tempatkan, harga riil beda dari harga provinsi → cocok otomatis gagal → kembar; digabung dari kartu unit itu.
    const r = await D.createAset({ tahun_anggaran: TAHUN, uraian: `${UJI} Kursi roda`, sumber_anggaran: 'BLUD', vol: 1, harga: 1_111_111, satuan: 'unit' }, userId)
    await D.tandaiAnggaran({ anggaran: 'DIDANAI', item: [{ id: r.id, expected_version: await versi(r.id) }] }, userId)
    await PEN.catatPenerimaan({ rencana_id: r.id, expected_version: await versi(r.id), tgl: '2026-05-14', vol: 1, harga_satuan: 1_111_111 }, userId)
    const pen = Number((await satu<{ id: number }>('SELECT id FROM bba_penerimaan WHERE rencana_id = ?', [r.id]))?.id)
    await PEN.tempatkan({ penerimaan_id: pen, jumlah: 1, golongan: 'B', nama_resmi: `${UJI} KURSI RODA BARU`, kondisi: 'B' }, userId)
    const U = Number((await satu<{ id: number }>('SELECT id FROM bba_aset WHERE penerimaan_id = ?', [pen]))?.id)
    const KD26 = 'UJIG.01.2026-1.3.2.05.02'
    const s4 = await A.simpanImpor(berkas(brs('000300', { kunci: `${KD26}|000300`, kode_barang: KD26, tahun_perolehan: 2026, harga: 1_100_000, nama_resmi: NAMA })), userId, 'uji-g3.xlsx')
    const T2 = Number((await satu<{ id: number }>('SELECT id FROM bba_aset WHERE kunci_impor = ?', [`${KD26}|000300`]))?.id)
    const balik = await coba(async () => A.gabungKembar({ id: T2, expected_version: await versiAset(T2), kembar_id: U, expected_version_kembar: await versiAset(U), alasan: 'arah keliru' }, userId))
    await A.gabungKembar({ id: U, expected_version: await versiAset(U), kembar_id: T2, expected_version_kembar: await versiAset(T2), alasan: 'harga provinsi beda dari harga riil' }, userId)
    const bU = await baris(U)
    const sisa = (await PEN.antreanBukuAset()).terima.find(x => x.penerimaan_id === pen)?.sisa ?? 0
    ok('D9 unit dari Tempatkan (belum teregister, harga riil beda): kembaran dari impor digabung ke unit — nomor & harga provinsi masuk, penerimaan & antrean tetap; arah sebaliknya ditolak',
      s4.baru === 1 && s4.cocok === 0 && balik instanceof A.AsetDitolakError && /lahir dari barang diterima/.test(balik.message)
      && bU.register === '000300' && Number(bU.harga) === 1_100_000 && Number(bU.penerimaan_id) === pen && bU.kondisi_sumber === 'CEK'
      && await n('SELECT COUNT(*) AS n FROM bba_aset WHERE id = ?', [T2]) === 0 && sisa === 0
      && await n("SELECT COUNT(*) AS n FROM bba_aset_riwayat WHERE aset_id = ? AND jenis = 'TERIMA'", [U]) === 1, JSON.stringify({ s4, bU, sisa }))

    // KIB F tanpa kode: letak dibetulkan provinsi.
    const F = await asetBaru({ golongan: 'F', kunci_impor: 'f|ujig gedung|jl. uji|2025-01-01', tahun_perolehan: 2025, nama_resmi: 'UJIG GEDUNG',
      kib: JSON.stringify({ letak: 'Jl. Uji', tgl_mulai: '2025-01-01' }), harga: 5_000_000 })
    const fBrs = brs('', { golongan: 'F', lembar: 'KIBF', kunci: 'f|ujig gedung|jl. uji no. 1|2025-01-01', kode_barang: null, register: null, kode_objek: null,
      tahun_perolehan: 2025, nama_resmi: 'UJIG GEDUNG', harga: 5_000_000, kondisi: null, kib: { letak: 'Jl. Uji No. 1', tgl_mulai: '2025-01-01' } })
    const praF = await A.pratinjauImpor(berkas(fBrs))
    const sF = await A.simpanImpor(berkas(fBrs), userId, 'uji-g-f.xlsx', [{ aset_id: F, kunci: fBrs.kunci }])
    const bF = await baris(F)
    const kibF = typeof bF.kib === 'string' ? JSON.parse(bF.kib) : bF.kib as Record<string, unknown>
    ok('D10 KIB F: letak dibetulkan provinsi → ditawarkan & dipasangkan; kunci & letak ikut, tetap satu catatan',
      praF.calon.some(x => x.aset_id === F) && sF.dipasangkan === 1 && sF.baru === 0 && bF.kunci_impor === fBrs.kunci && kibF?.letak === 'Jl. Uji No. 1'
      && await n("SELECT COUNT(*) AS n FROM bba_aset WHERE nama_resmi = 'UJIG GEDUNG'") === 1, JSON.stringify({ sF, bF }))
  } finally {
    await bersih()
    const sisa = await satu<{ a: number; p: number; s: number }>(`SELECT (SELECT COUNT(*) FROM buku_besar_aset WHERE tahun_anggaran = ?) AS a,
      (SELECT COUNT(*) FROM bba_penerimaan p JOIN buku_besar_aset b ON b.id = p.rencana_id WHERE b.tahun_anggaran = ?) AS p,
      (SELECT COUNT(*) FROM bba_aset WHERE nama_resmi LIKE 'UJIG%' OR kunci_impor LIKE 'UJIG%' OR kunci_impor LIKE 'f|ujig%') AS s`, [TAHUN, TAHUN])
    ok('D11 kotak pasir bersih kembali', Number(sisa.a) + Number(sisa.p) + Number(sisa.s) === 0, JSON.stringify(sisa))
    await k.end()
  }
}

console.log(`\n${lulus} lulus, ${gagal.length} gagal`)
if (gagal.length) { console.log(gagal.map(g => `  - ${g}`).join('\n')); process.exit(1) }
process.exit(0)
