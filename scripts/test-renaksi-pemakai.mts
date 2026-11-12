#!/usr/bin/env npx tsx
// scripts/test-renaksi-pemakai.mts — sesudah ganti nama di Renaksi, sebut modul yang masih memegang
// nama lama. Konsep: docs/CONCEPT-renaksi-terhubung.md §6 (Tahap F).
// Jalankan: npx tsx --env-file=.env.local scripts/test-renaksi-pemakai.mts (MySQL kotak pasir 2094,
// dibersihkan otomatis; tanpa --env-file GAGAL).
import { readFileSync } from 'node:fs'
import mysql from 'mysql2/promise'
import { kalimatPemakai } from '../lib/renaksi/pemakai'

let lulus = 0
const gagal: string[] = []
function ok(nama: string, syarat: unknown, ket = '') {
  if (syarat) { lulus++; console.log(`  ok  ${nama}`) }
  else { gagal.push(nama); console.log(`FAIL  ${nama}${ket ? ' — ' + ket : ''}`) }
}
const sumber = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n')

console.log('A. Kalimat')
ok('A1 tanpa pemakai → tidak ada pesan', kalimatPemakai([{ modul: 'PK', tempat: 'Master Program', jumlah: 0 }]) === null)
ok('A2 hanya modul berisi yang disebut',
  kalimatPemakai([{ modul: 'E-Anggaran', tempat: 'Master', jumlah: 2 }, { modul: 'PK', tempat: 'Master Program', jumlah: 0 }])
  === 'Nama lama masih dipakai di E-Anggaran (Master: 2). Perbarui dari layar masing-masing — spanduk "Rencana Aksi berubah" muncul di sana.')

console.log('B. Sambungan kode')
const R = sumber('app/api/rencana-aksi/route.ts')
ok('B1 route menyebut pemakai hanya bila ada ganti nama, dan gagal membacanya tidak menggagalkan simpanan',
  R.includes('const dipakai = info.gantiNama') && R.includes('.catch(() => [])') && R.includes('return NextResponse.json({ ok: true, id, dipakai, perubahan });'))
const L = sumber('lib/data/rencana-aksi.ts')
ok('B2 jejak ganti nama diisi SESUDAH transaksi ter-commit', L.indexOf('if (hasil) hasil.gantiNama = gantiNama;') > L.indexOf('await catatGantiNama(tx'))
ok('B3 layar Data Entry menampilkannya sebagai keterangan', sumber('app/(dashboard)/rencana-aksi/_components/DataEntryForm.tsx').includes("if (kalimatDipakai) notify(kalimatDipakai, 'info');"))

console.log('C. MySQL kotak pasir 2094')
const TAHUN = 2094
const c = await mysql.createConnection({
  host: process.env.MYSQL_HOST, port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER, password: process.env.MYSQL_PASSWORD, database: process.env.MYSQL_DATABASE,
})
const q = async <T,>(s: string, p: unknown[] = []) => ((await c.query(s, p)) as [T[], unknown])[0]
const bersih = async () => {
  await c.query('DELETE FROM iki_dokumen WHERE tahun = ?', [String(TAHUN)])
  for (const t of ['kinerja_master', 'pk_program']) await c.query(`DELETE FROM ${t} WHERE tahun = ?`, [String(TAHUN)])
  await c.query('DELETE FROM rencana_aksi WHERE tahun = ?', [TAHUN])
  await c.query('DELETE FROM renaksi_ganti_nama WHERE tahun = ?', [TAHUN])
}
await bersih()
try {
  const RA = await import('../lib/data/rencana-aksi')
  const { pemakaiNamaRenaksi } = await import('../lib/data/renaksi-pemakai')
  const [usr] = await q<{ id: number }>('SELECT id FROM users ORDER BY id LIMIT 1')
  const uid = Number(usr?.id ?? 0)
  const dasar = { tahun: TAHUN, satuan: 'Dokumen', jenis: 'Akumulatif' as const, target_rpjmd: 0, target_tahunan: 0, q1_target: 0, q2_target: 0, q3_target: 0, q4_target: 0 }
  const idK = await RA.upsertRencanaAksi({ ...dasar, level: 'kegiatan', program: 'PRG A ***', kegiatan: 'Keg Obat ****', sub_kegiatan: null, indikator: 'P-K' }, uid)
  await RA.upsertRencanaAksi({ ...dasar, level: 'kegiatan', program: 'PRG B ***', kegiatan: 'Keg Obat ****', sub_kegiatan: null, indikator: 'P-K2' }, uid)
  await c.query(`INSERT INTO kinerja_master (tahun, tipe, nama, program_ref, urut, asal) VALUES
    (?, 'kegiatan', 'Keg Obat', 'PRG A', 1, 'RENAKSI'), (?, 'kegiatan', 'Keg Obat', 'PRG B', 2, 'RENAKSI'), (?, 'kegiatan', 'Keg Obat', 'PRG A', 3, 'MANUAL')`, [String(TAHUN), String(TAHUN), String(TAHUN)])
  await c.query(`INSERT INTO pk_program (program, kegiatan, subkegiatan, tahun, level, asal) VALUES ('PRG A', 'Keg Obat', NULL, ?, 'kegiatan', 'RENAKSI'), ('PRG B', 'Keg Obat', NULL, ?, 'kegiatan', 'RENAKSI')`, [String(TAHUN), String(TAHUN)])
  const dok = async (status: string) => {
    const [d] = await c.query(`INSERT INTO iki_dokumen (tahun, nama, nip, jabatan, status) VALUES (?, 'Uji', '0', ?, ?)`, [String(TAHUN), `Jab ${status}`, status]) as unknown as [{ insertId: number }]
    await c.query(`INSERT INTO iki_rhk (dokumen_id, no_urut, rhk, indikator, renaksi_id) VALUES (?, 1, 'Keg Obat', 'P-K', ?)`, [d.insertId, idK])
  }
  await dok('DRAFT'); await dok('FINAL')

  const r = (await q<{ id: number; version: number }>('SELECT id, version FROM rencana_aksi WHERE id = ?', [idK]))[0]
  const info: { gantiNama: import('../lib/renaksi/ganti-nama').GantiNama | null } = { gantiNama: null }
  await RA.upsertRencanaAksi({ ...dasar, id: idK, expected_version: r.version, level: 'kegiatan', program: 'PRG A ***', kegiatan: 'Keg Obat & BMHP ****', sub_kegiatan: null, indikator: 'P-K' }, uid, info)
  ok('C1 simpanan berganti nama mengisi jejaknya', info.gantiNama?.dari === 'Keg Obat ****' && info.gantiNama?.ke === 'Keg Obat & BMHP ****')
  const p = await pemakaiNamaRenaksi(TAHUN, info.gantiNama!)
  const per = Object.fromEntries(p.map(x => [x.modul, x.jumlah]))
  ok('C2 E-Anggaran: hanya entri RENAKSI di program yang sama', per['E-Anggaran'] === 1, JSON.stringify(p))
  ok('C3 PK: hanya Master Program di program yang sama', per['PK'] === 1)
  ok('C4 IKI: kartu di dokumen DRAFT saja', per['IKI'] === 1 && p.find(x => x.modul === 'IKI')?.tempat === 'kartu RHK di 1 dokumen DRAFT')
  const info2: { gantiNama: import('../lib/renaksi/ganti-nama').GantiNama | null } = { gantiNama: null }
  const r2 = (await q<{ version: number }>('SELECT version FROM rencana_aksi WHERE id = ?', [idK]))[0]
  await RA.upsertRencanaAksi({ ...dasar, id: idK, expected_version: r2.version, level: 'kegiatan', program: 'PRG A ***', kegiatan: 'Keg Obat & BMHP ****', sub_kegiatan: null, indikator: 'P-K', satuan: 'Laporan' }, uid, info2)
  ok('C5 simpanan tanpa ganti nama → jejak kosong', info2.gantiNama === null)
} finally {
  await bersih()
  const sisa = await q<{ n: number }>(`SELECT (SELECT COUNT(*) FROM rencana_aksi WHERE tahun = ?) + (SELECT COUNT(*) FROM kinerja_master WHERE tahun = ?)
    + (SELECT COUNT(*) FROM pk_program WHERE tahun = ?) + (SELECT COUNT(*) FROM iki_dokumen WHERE tahun = ?) AS n`, [TAHUN, String(TAHUN), String(TAHUN), String(TAHUN)])
  ok('C6 kotak pasir 2094 bersih kembali', Number(sisa[0]?.n) === 0)
  await c.end()
}

console.log(`\n${lulus} lulus, ${gagal.length} gagal`)
if (gagal.length) { console.log(gagal.map(g => `  - ${g}`).join('\n')); process.exit(1) }
process.exit(0)
