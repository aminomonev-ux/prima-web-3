// scripts/test-renaksi-hapus-tautan.mts — konsep docs/CONCEPT-renaksi-tautan-lanjutan.md §5, §6, §8.
// Jalankan: npx tsx --env-file=.env.local scripts/test-renaksi-hapus-tautan.mts   (MySQL kotak pasir 2072)
//
// A "Lepas tautan & hapus" (§5): penolakan membawa daftar penunjuk, lepas+hapus satu transaksi, pagar
//   Kunci Periode & induk terakhir tidak bisa ditembus. B balapan simpan × hapus (§6), deterministik:
//   koneksi uji memegang kunci yang dipegang lawannya sampai performance_schema.data_lock_waits melihat
//   jalur yang diuji menunggu. C sambungan route & layar. D kalimat LKJIP urutan Renaksi (§8).

import { readFileSync } from 'node:fs'
import mysql from 'mysql2/promise'
import { sql, queryOne } from '../lib/data/db'
import {
  upsertRencanaAksi, getRencanaAksiById, deleteRencanaAksi, setRaLock,
  RaIndukIndikatorError, RaTautanAnakError, RaPunyaAnakError, RaPeriodLockedError, BATAS_PENUNJUK,
} from '../lib/data/rencana-aksi'
import { kalimatPerbarui, hanyaUrutan, KALIMAT_URUTAN_RENAKSI, type RingkasPerbarui } from '../lib/lkjip/tautan'

const T = 2072
let lulus = 0
const gagal: string[] = []
const ok = (n: string, s: unknown, k = '') => {
  if (s) { lulus++; console.log(`  ok  ${n}`) } else { gagal.push(n); console.log(`FAIL  ${n}${k ? ' — ' + k : ''}`) }
}
const tangkap = async (fn: () => Promise<unknown>) => { try { return await fn() } catch (e) { return e } }
const tanpaKomentar = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const bersih = async () => {
  await sql`DELETE FROM rencana_aksi WHERE tahun = ${T}`
  await sql`DELETE FROM renaksi_ganti_nama WHERE tahun = ${T}`
  await sql`DELETE FROM system_settings WHERE \`key\` = ${`ra_lock_${T}`}`
}
const induk = async (id: number) => {
  const r = await queryOne<{ i: number | null }>(sql`SELECT induk_indikator_id AS i FROM rencana_aksi WHERE id = ${id}`)
  return r ? r.i : 'hilang'
}
const ada = async (id: number) => !!(await getRencanaAksiById(id))

await bersih()
const user = await queryOne<{ id: number }>(sql`SELECT id FROM users LIMIT 1`)
if (!user) { console.log('tidak ada user'); process.exit(1) }
const uid = Number(user.id)
const dasar = {
  tahun: T, jenis: 'Akumulatif' as const, satuan: '%', target_rpjmd: 100, target_tahunan: 100,
  q1_target: 25, q2_target: 25, q3_target: 25, q4_target: 25,
}
const kegiatan = (ind: string) => upsertRencanaAksi({ ...dasar, level: 'kegiatan', program: 'PROG H', kegiatan: 'KEG H', indikator: ind }, uid)
const sub = (nama: string, ind: string, indukId: number | null) => upsertRencanaAksi({
  ...dasar, level: 'sub-kegiatan', program: 'PROG H', kegiatan: 'KEG H', sub_kegiatan: nama, indikator: ind, induk_indikator_id: indukId,
}, uid)

try {
  await upsertRencanaAksi({ ...dasar, level: 'program', program: 'PROG H', indikator: 'IND PROG H' }, uid)
  const k1 = await kegiatan('IND K1')
  const k2 = await kegiatan('IND K2')

  // ── A ─────────────────────────────────────────────────────────────────────────
  console.log('\nA. Lepas tautan & hapus (§5)')
  const anak: number[] = []
  for (let i = 1; i <= 12; i++) anak.push(await sub(`SUB H${String(i).padStart(2, '0')}`, `IND S${String(i).padStart(2, '0')}`, k1))
  const versiAwal = Number((await getRencanaAksiById(anak[0]))!.version)

  const e1 = await tangkap(async () => deleteRencanaAksi((await getRencanaAksiById(k1))!))
  ok('A1 hapus induk yang ditunjuk ditolak RaTautanAnakError', e1 instanceof RaTautanAnakError, String(e1))
  const t1 = e1 as RaTautanAnakError
  ok('A2 jumlah menghitung SEMUA penunjuk', t1?.jumlah === 12, String(t1?.jumlah))
  ok(`A3 daftar penunjuk dibatasi ${BATAS_PENUNJUK}`, t1?.penunjuk?.length === BATAS_PENUNJUK)
  ok('A4 penunjuk membawa level, nama entitas, indikator', t1?.penunjuk?.[0]?.level === 'sub-kegiatan'
    && t1.penunjuk[0].nama === 'SUB H01' && t1.penunjuk[0].indikator === 'IND S01', JSON.stringify(t1?.penunjuk?.[0]))
  ok('A5 penolakan tidak mengubah apa pun', await ada(k1) && (await induk(anak[0])) === k1)

  const hasil = await deleteRencanaAksi((await getRencanaAksiById(k1))!, { lepasTautan: true }) as { lepas: number }
  ok('A6 lepasTautan memulangkan jumlah yang dilepas', hasil?.lepas === 12, JSON.stringify(hasil))
  ok('A7 baris induk terhapus', !(await ada(k1)))
  const indukAnak = await Promise.all(anak.map(induk))
  ok('A8 seluruh penunjuk jadi NULL, barisnya tetap ada', indukAnak.every(v => v === null), JSON.stringify(indukAnak))
  ok('A9 versi penunjuk naik (tab terbuka kena 409, bukan menautkan balik)',
    Number((await getRencanaAksiById(anak[0]))!.version) === versiAwal + 1)
  ok('A10 hapus tanpa penunjuk: lepas = 0', ((await deleteRencanaAksi((await getRencanaAksiById(anak[11]))!, { lepasTautan: true })) as { lepas: number }).lepas === 0)

  // Induk terakhir yang memikul nama (penjaga nama) tetap berlaku walau lepasTautan.
  const kLain = await upsertRencanaAksi({ ...dasar, level: 'kegiatan', program: 'PROG H', kegiatan: 'KEG TUNGGAL', indikator: 'IND KT' }, uid)
  const sT = await upsertRencanaAksi({ ...dasar, level: 'sub-kegiatan', program: 'PROG H', kegiatan: 'KEG TUNGGAL', sub_kegiatan: 'SUB T', indikator: 'IND ST', induk_indikator_id: kLain }, uid)
  const e2b = await tangkap(async () => deleteRencanaAksi((await getRencanaAksiById(kLain))!, { lepasTautan: true }))
  ok('A11 induk terakhir yang memikul nama tetap ditolak walau lepasTautan', e2b instanceof RaPunyaAnakError, String(e2b))
  ok('A12 penolakan itu tidak melepas tautan (satu transaksi)', (await induk(sT)) === kLain && await ada(kLain))

  await setRaLock(T, 3)
  const e3 = await tangkap(async () => deleteRencanaAksi((await getRencanaAksiById(k2))!, { lepasTautan: true }))
  ok('A13 Kunci Periode tidak bisa ditembus lepasTautan', e3 instanceof RaPeriodLockedError && await ada(k2), String(e3))
  await sql`DELETE FROM system_settings WHERE \`key\` = ${`ra_lock_${T}`}`

  // ── B ─────────────────────────────────────────────────────────────────────────
  console.log('\nB. Simpan × hapus berbarengan (§6)')
  const k = await mysql.createConnection({
    host: process.env.MYSQL_HOST, port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER, password: process.env.MYSQL_PASSWORD, database: process.env.MYSQL_DATABASE,
  })
  const tungguMenunggu = async () => {
    for (let i = 0; i < 80; i++) {
      const [r] = await k.query('SELECT COUNT(*) AS n FROM performance_schema.data_lock_waits') as unknown as [Array<{ n: number }>]
      if (Number(r[0]?.n ?? 0) > 0) return true
      await new Promise(res => setTimeout(res, 50))
    }
    return false
  }
  try {
    // B1: hapus sedang memegang induk (FOR UPDATE) → Simpan yang menautkan menunggu, lalu ditolak.
    const kB = await kegiatan('IND KB')
    await k.query('START TRANSACTION')
    await k.query('SELECT id FROM rencana_aksi WHERE id = ? FOR UPDATE', [kB])
    const simpan = tangkap(() => sub('SUB B1', 'IND SB1', kB))
    const menunggu1 = await tungguMenunggu()
    await k.query('DELETE FROM rencana_aksi WHERE id = ?', [kB])
    await k.query('COMMIT')
    const h1 = await simpan
    ok('B1a Simpan menunggu kunci baris induk (FOR SHARE di transaksi tulis)', menunggu1)
    ok('B1b sesudah induk terhapus, Simpan ditolak — bukan menautkan ke id yang tiada',
      h1 instanceof RaIndukIndikatorError, String(h1))
    const yatim = await queryOne<{ n: number }>(sql`SELECT COUNT(*) AS n FROM rencana_aksi WHERE tahun = ${T} AND induk_indikator_id = ${kB}`)
    ok('B1c tidak ada tautan ke induk yang terhapus', Number(yatim?.n ?? 0) === 0)

    // B3: Simpan KODE (edit baris anak) sudah membaca induk, lalu tertahan menulis barisnya sendiri.
    // Kunci baca induknya harus bertahan sampai Simpan selesai — kalau dilepas seketika (dibaca di luar
    // transaksi tulis), hapus menyelip dan tautan baru menunjuk id yang sudah tiada.
    const kD = await kegiatan('IND KD')
    const sD = await sub('SUB D1', 'IND SD1', null)
    await k.query('START TRANSACTION')
    await k.query('SELECT id FROM rencana_aksi WHERE id = ? FOR UPDATE', [sD])
    const simpanD = tangkap(() => upsertRencanaAksi({
      ...dasar, id: sD, level: 'sub-kegiatan', program: 'PROG H', kegiatan: 'KEG H', sub_kegiatan: 'SUB D1', indikator: 'IND SD1', induk_indikator_id: kD,
    }, uid))
    const simpanMenunggu = await tungguMenunggu()
    const hapusD = tangkap(async () => deleteRencanaAksi((await getRencanaAksiById(kD))!))
    for (let i = 0; i < 40; i++) {
      const [w] = await k.query('SELECT COUNT(*) AS n FROM performance_schema.data_lock_waits') as unknown as [Array<{ n: number }>]
      if (Number(w[0]?.n ?? 0) >= 2) break
      await new Promise(res => setTimeout(res, 50))
    }
    await k.query('COMMIT')
    const [hs, hh] = [await simpanD, await hapusD]
    ok('B3a Simpan tertahan di baris anaknya sendiri', simpanMenunggu)
    ok('B3b hapus yang menyelip menunggu Simpan, lalu menolak karena tautannya',
      hh instanceof RaTautanAnakError && typeof hs === 'number', `simpan=${String(hs)} hapus=${String(hh)}`)
    ok('B3c tidak ada tautan ke induk yang tiada', await ada(kD) && (await induk(sD)) === kD)

    // B2: Simpan sedang menautkan (memegang FOR SHARE + menulis tautan) → hapus menunggu, lalu melihat penunjuknya.
    const kC = await kegiatan('IND KC')
    const sC = await sub('SUB C1', 'IND SC1', null)
    await k.query('START TRANSACTION')
    await k.query('SELECT id FROM rencana_aksi WHERE id = ? FOR SHARE', [kC])
    await k.query('UPDATE rencana_aksi SET induk_indikator_id = ? WHERE id = ?', [kC, sC])
    const hapus = tangkap(async () => deleteRencanaAksi((await getRencanaAksiById(kC))!))
    const menunggu2 = await tungguMenunggu()
    await k.query('COMMIT')
    const h2 = await hapus
    ok('B2a hapus menunggu kunci baris (FOR UPDATE lebih dulu)', menunggu2)
    ok('B2b sesudah Simpan selesai, hapus melihat tautannya dan menolak', h2 instanceof RaTautanAnakError, String(h2))
    ok('B2c induk & tautan tetap utuh', await ada(kC) && (await induk(sC)) === kC)
  } finally {
    await k.query('ROLLBACK').catch(() => {})
    await k.end()
  }

  // ── C ─────────────────────────────────────────────────────────────────────────
  console.log('\nC. Sambungan route & layar')
  const data = tanpaKomentar(readFileSync(new URL('../lib/data/rencana-aksi.ts', import.meta.url), 'utf8'))
  const hapusFn = data.slice(data.indexOf('export async function deleteRencanaAksi('), data.indexOf('type SqlResult'))
  ok('C1 hapus: kunci baris PERTAMA di transaksi (L84)',
    /return withTransaction\(async \(\{ tx \}\) => \{\s*const \[ada\] = await tx`SELECT id FROM rencana_aksi WHERE id = \$\{row\.id\} FOR UPDATE`/.test(hapusFn))
  ok('C2 penjaga nama memakai tx yang sama', hapusFn.includes('await assertTidakPunyaAnak(tx, row);'))
  ok('C3 Kunci Periode diperiksa sebelum transaksi', hapusFn.indexOf('assertPeriodeTerbuka') < hapusFn.indexOf('withTransaction'))
  ok('C4 simpan: induk dibaca FOR SHARE lewat tx', /FROM rencana_aksi WHERE id = \$\{data\.induk_indikator_id\}\s*FOR SHARE/.test(data)
    && (data.match(/await assertIndukIndikator\(tx, data\);/g) ?? []).length === 2 && !/await assertIndukIndikator\(data\)/.test(data))
  const rute = tanpaKomentar(readFileSync(new URL('../app/api/rencana-aksi/route.ts', import.meta.url), 'utf8'))
  ok('C5 route meneruskan lepas_tautan=1 saja', rute.includes("const lepasTautan = u.searchParams.get('lepas_tautan') === '1';")
    && rute.includes('await deleteRencanaAksi(row, { lepasTautan })'))
  ok('C6 400 MASIH_DITUNJUK membawa jumlah & penunjuk', /code: 'MASIH_DITUNJUK', jumlah: e\.jumlah, penunjuk: e\.penunjuk/.test(rute))
  ok('C7 audit menyebut tautan yang dilepas', rute.includes('melepas tautan indikator induk ${lepas} baris'))
  const api = tanpaKomentar(readFileSync(new URL('../app/(dashboard)/rencana-aksi/_lib/api.ts', import.meta.url), 'utf8'))
  ok('C8 klien menerjemahkan MASIH_DITUNJUK jadi TautanAnakError', /body\.code === 'MASIH_DITUNJUK'[\s\S]{0,80}throw new TautanAnakError/.test(api))
  const de = tanpaKomentar(readFileSync(new URL('../app/(dashboard)/rencana-aksi/_components/DataEntryForm.tsx', import.meta.url), 'utf8'))
  const hd = de.slice(de.indexOf('const handleDelete = async'), de.indexOf('return (', de.indexOf('const handleDelete = async')))
  ok('C9 hapus mencoba tanpa lepas dulu', hd.includes('({ lepas } = await apiDelete(row.id));'))
  ok('C10 lepas hanya sesudah dialog danger disetujui', /variant: 'danger',\s*\}\);\s*if \(!ok\) return;\s*\(\{ lepas \} = await apiDelete\(row\.id, true\)\);/.test(hd))
  ok('C11 galat lain tidak ditelan dialog', hd.includes('if (!(err instanceof TautanAnakError)) throw err;'))

  // ── D ─────────────────────────────────────────────────────────────────────────
  console.log('\nD. Kalimat LKJIP urutan Renaksi (§8)')
  const r = (o: Partial<RingkasPerbarui>): RingkasPerbarui =>
    ({ angkaBerubah: 0, barisBaru: [], barisHilang: [], urutanBerubah: false, sama: false, ...o })
  ok('D1 urutan saja + Renaksi Cetak → kalimat sebab', kalimatPerbarui(r({ urutanBerubah: true }), 'renaksi-cetak') === KALIMAT_URUTAN_RENAKSI)
  ok('D2 urutan saja + sumber lain → kalimat lama', kalimatPerbarui(r({ urutanBerubah: true }), 'kinerja-rekap') === 'urutan baris berubah')
  ok('D3 urutan + sel berubah → tidak mengaku "angka tidak berubah"',
    !kalimatPerbarui(r({ urutanBerubah: true, angkaBerubah: 2 }), 'renaksi-cetak').includes('Angka tidak berubah'))
  ok('D4 urutan + baris baru → kalimat lama', !hanyaUrutan(r({ urutanBerubah: true, barisBaru: ['x'] })))
  ok('D5 urutan + baris hilang → kalimat lama', !hanyaUrutan(r({ urutanBerubah: true, barisHilang: ['x'] })))
  ok('D6 tanpa urutan berubah → bukan kalimat urutan', !hanyaUrutan(r({})))
  const kes = tanpaKomentar(readFileSync(new URL('../lib/lkjip/kesegaran.ts', import.meta.url), 'utf8'))
  ok('D7 pengingat otomatis meneruskan sumber', kes.includes('kalimatKesegaran(nilai, t.payload.tautan.sumber)') && kes.includes('kalimatPerbarui(p.ringkas, sumber)'))
  const ted = readFileSync(new URL('../components/tabel/TabelEditor.tsx', import.meta.url), 'utf8')
  ok('D8 dialog Perbarui meneruskan sumber', ted.includes('kalimatPerbarui(ringkas, tautan.sumber)'))
} finally {
  await bersih()
}

console.log(`\n${lulus} lulus, ${gagal.length} gagal`)
if (gagal.length) { console.log(gagal.map(g => `  - ${g}`).join('\n')); process.exit(1) }
process.exit(0)
