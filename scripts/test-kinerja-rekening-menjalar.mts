#!/usr/bin/env npx tsx
// scripts/test-kinerja-rekening-menjalar.mts — suntingan nama/rantai di tab Rekening yang
// menjalar ke RKO (semua versi) & Realisasi, dan target bulanan Beranda dari versi acuan.
// Konsep: docs/CONCEPT-kinerja-rekening-menjalar.md
// Jalankan: npx tsx --env-file=.env.local scripts/test-kinerja-rekening-menjalar.mts
// Bagian D memakai MySQL sungguhan (kotak pasir 2098), dibersihkan otomatis — tanpa
// --env-file bagian itu DILEWATI dan jumlah lulusnya turun.
import { readFileSync } from 'node:fs'
import mysql from 'mysql2/promise'
import {
  rencanaJalarRekening, ringkasJalarRekening, perluKonfirmasiJalar, kalimatJalarRekening, jejakJalarRekening,
  type RekeningLama, type RekeningMasuk, type BarisRkoRekening, type BarisRealRekening,
} from '../lib/kinerja/rekening-menjalar'

let lulus = 0
const gagal: string[] = []
function ok(nama: string, syarat: unknown, ket = '') {
  if (syarat) { lulus++; console.log(`  ok  ${nama}`) }
  else { gagal.push(nama); console.log(`FAIL  ${nama}${ket ? ' — ' + ket : ''}`) }
}
const sumber = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
const tanpaKomentar = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
const badan = (isi: string, awal: string) => { const i = isi.indexOf(awal); return i < 0 ? '' : isi.slice(i, isi.indexOf('\n}\n', i)) }
const coba = async <T,>(f: () => Promise<T>): Promise<T | Error> => { try { return await f() } catch (e) { return e as Error } }

const PB = 'PROGRAM PENUNJANG'
const PBs = `${PB} ***`
const KG = 'Administrasi Keuangan'
const SB = 'Penyediaan Gaji dan Tunjangan ASN'
const US = 'Belanja Gaji dan Tunjangan ASN'
const rek = (id: number, uraian: string, o: Partial<RekeningLama> = {}): RekeningLama =>
  ({ id, uraian, uraian_ssk: US, program: PB, kegiatan: KG, subkegiatan: SB, ...o })
const rko = (id: number, uraian: string, tipe: string, seq: number, cid: string, o: Partial<BarisRkoRekening> = {}): BarisRkoRekening =>
  ({ id, uraian, uraian_ssk: US, program: PB, kegiatan: KG, subkegiatan: SB, versi_tipe: tipe, versi_seq: seq, canonical_id: cid, ...o })
const real = (id: number, cid: string, ket: string, o: Partial<BarisRealRekening> = {}): BarisRealRekening =>
  ({ id, ssk_canonical_id: cid, keterangan: ket, uraian_ssk: US, program: PB, kegiatan: KG, subkegiatan: SB, ...o })

// ─────────────────────────────────────────────────────────────────────────────
console.log('A. Aturan: rekening berubah → RKO & Realisasi ikut')
const LAMA = [rek(1, 'Belanja Gaji Pokok PNS'), rek(2, 'Belanja Tunjangan Keluarga PNS')]
const RKO = [
  rko(10, 'Belanja Gaji Pokok PNS', 'MURNI', 0, 'K-1'), rko(11, 'Belanja Tunjangan Keluarga PNS', 'MURNI', 0, 'K-2'),
  rko(20, 'Belanja Gaji Pokok PNS', 'PERUBAHAN', 1, 'K-1'), rko(21, 'Belanja Tunjangan Keluarga PNS', 'PERUBAHAN', 1, 'K-2'),
]
const REAL = [real(100, 'K-1', 'Belanja Gaji Pokok PNS'), real(101, 'K-1', 'Belanja Gaji Pokok PNS'), real(102, 'K-2', 'Belanja Tunjangan Keluarga PNS')]
const pindah: RekeningMasuk[] = [{ ...LAMA[0], program: PBs }, LAMA[1]]

const r1 = rencanaJalarRekening(LAMA, pindah, RKO, REAL)
ok('A1 pindah program: RKO kedua versi ikut (termasuk MURNI)', r1.rko.map(x => x.baris.id).sort().join() === '10,20', JSON.stringify(r1.rko))
ok('A2 …nilainya = isi rekening baru, rekening lain tak tersentuh', r1.rko.every(x => x.nilai.program === PBs && x.nilai.uraian === 'Belanja Gaji Pokok PNS'))
ok('A3 Realisasi ikut lewat canonical_id (dua bulan), item lain tidak', r1.realisasi.map(x => x.baris.id).sort().join() === '100,101')
ok('A4 tanpa id (baris baru/impor/pulihan) → tidak menjalar',
  rencanaJalarRekening(LAMA, pindah.map(({ id: _id, ...x }) => x), RKO, REAL).rko.length === 0)
ok('A5 tidak berubah → tidak menjalar', rencanaJalarRekening(LAMA, LAMA, RKO, REAL).perubahan.length === 0)
ok('A6 hanya spasi di ujung / sumber anggaran → tidak dianggap berubah',
  rencanaJalarRekening(LAMA, [{ ...LAMA[0], uraian: 'Belanja Gaji Pokok PNS ' }, LAMA[1]], RKO, REAL).perubahan.length === 0)

const ganti = rencanaJalarRekening(LAMA, [{ ...LAMA[0], uraian: 'Belanja Gaji Pokok ASN' }, LAMA[1]], RKO, REAL)
ok('A7 ganti nama Rekening Belanja: RKO.uraian & Realisasi.keterangan ikut',
  ganti.rko.length === 2 && ganti.rko.every(x => x.nilai.uraian === 'Belanja Gaji Pokok ASN') && ganti.realisasi.length === 2)

const kembar = [rek(1, 'Belanja Gaji Pokok PNS'), rek(3, 'Belanja Gaji Pokok PNS')]
const rKembar = rencanaJalarRekening(kembar, [{ ...kembar[0], program: PBs }, kembar[1]], RKO, REAL)
ok('A8 rekening kembar yang lain tetap di rantai lama → dilewati, RKO tetap miliknya',
  rKembar.rko.length === 0 && rKembar.dilewati.length === 1 && /masih ada rekening lain/.test(rKembar.dilewati[0].sebab))
const rDua = rencanaJalarRekening(kembar, [{ ...kembar[0], program: PBs }, { ...kembar[1], program: 'PROGRAM LAIN' }], RKO, REAL)
ok('A9 kembar diubah ke dua tujuan berbeda → dilewati', rDua.rko.length === 0 && /dua tujuan/.test(rDua.dilewati[0]?.sebab ?? ''))
const rBareng = rencanaJalarRekening(kembar, [{ ...kembar[0], program: PBs }, { ...kembar[1], program: PBs }], RKO, REAL)
ok('A10 kembar diubah ke tujuan yang sama → RKO ikut sekali', rBareng.rko.length === 2 && rBareng.dilewati.length === 0)

// Data server 2026-11-02: rekening dipindah ke rantai berbintang dulu, RKO tertinggal tanpa bintang.
const rkoTertinggal = [rko(10, 'Belanja Gaji Pokok PNS', 'MURNI', 0, 'K-1', { program: PB })]
const lamaBintang = [rek(1, 'Belanja Gaji Pokok PNS', { program: PBs })]
const rTertinggal = rencanaJalarRekening(lamaBintang, [{ ...lamaBintang[0], program: 'PROGRAM BARU' }], rkoTertinggal, [])
ok('A11 RKO yang rantainya sudah beda tetap ikut bila satu-satunya bernama itu', rTertinggal.rko.length === 1 && rTertinggal.rko[0].nilai.program === 'PROGRAM BARU')
const rkoDuaRantai = [rko(10, 'Belanja Gaji Pokok PNS', 'MURNI', 0, 'K-1', { program: 'P1' }), rko(11, 'Belanja Gaji Pokok PNS', 'MURNI', 0, 'K-9', { program: 'P2' })]
const rRagu = rencanaJalarRekening(lamaBintang, [{ ...lamaBintang[0], program: 'PROGRAM BARU' }], rkoDuaRantai, [])
ok('A12 RKO punya dua baris bernama itu di rantai lain → ragu, dilewati', rRagu.rko.length === 0 && /tidak bisa dipastikan/.test(rRagu.dilewati[0]?.sebab ?? ''))
const rPilih = rencanaJalarRekening(lamaBintang, [{ ...lamaBintang[0], program: 'PROGRAM BARU' }],
  [rko(10, 'Belanja Gaji Pokok PNS', 'MURNI', 0, 'K-1', { program: PBs }), rko(11, 'Belanja Gaji Pokok PNS', 'MURNI', 0, 'K-9', { program: 'P2' })], [])
ok('A13 dari dua baris bernama sama, yang rantainya cocok saja yang ikut', rPilih.rko.map(x => x.baris.id).join() === '10')

const rkoSudah = [rko(10, 'Belanja Gaji Pokok PNS', 'MURNI', 0, 'K-1', { program: PBs })]
const rSudah = rencanaJalarRekening(LAMA, pindah, rkoSudah, [real(100, 'K-1', 'Belanja Gaji Pokok PNS')])
ok('A14 RKO sudah sama dengan rekening baru: tidak ditulis, Realisasi-nya tetap ikut', rSudah.rko.length === 0 && rSudah.realisasi.length === 1)
const rLama = rencanaJalarRekening(LAMA, pindah, RKO, [real(200, '', 'Belanja Gaji Pokok PNS'), real(201, '', 'Belanja Gaji Pokok PNS', { program: 'LAIN' })])
ok('A15 Realisasi lama tanpa canonical_id ikut lewat nama + rantai', rLama.realisasi.map(x => x.baris.id).join() === '200')
const rKembarRko = rencanaJalarRekening(LAMA, [{ ...LAMA[0], uraian: 'Belanja Tunjangan Keluarga PNS' }, LAMA[1]], RKO, REAL)
ok('A16 ganti nama ke nama rekening lain → kembar RKO dihitung (per versi)', rKembarRko.kembarRko === 2, String(rKembarRko.kembarRko))
const rTanpaRko = rencanaJalarRekening(LAMA, pindah, [], [])
ok('A17 belum di-Inject ke RKO → tidak ada yang ditanyakan', !perluKonfirmasiJalar(ringkasJalarRekening(rTanpaRko, 'GAJI')))

// ─────────────────────────────────────────────────────────────────────────────
console.log('B. Ringkasan, dialog, audit')
const ring = ringkasJalarRekening(r1, 'GAJI')
ok('B1 dampak per versi RKO + jumlah realisasi', ring.dampak.rko.length === 2 && ring.dampak.rko.every(v => v.baris === 1) && ring.dampak.realisasi === 2 && ring.dampak.rekening === 0)
ok('B2 rincian menyebut kolom yang berubah saja', ring.perubahan[0]?.rincian.length === 1 && ring.perubahan[0].rincian[0] === `Program: "${PB}" → "${PBs}"`, JSON.stringify(ring.perubahan))
ok('B3 perlu dikonfirmasi', perluKonfirmasiJalar(ring))
const kal = kalimatJalarRekening(ring)
ok('B4 kalimat dialog: rekening, RKO per versi, Realisasi, versi terkunci ikut',
  kal.includes('1 rekening berganti') && kal.includes('RKO GAJI MURNI: 1 baris') && kal.includes('RKO GAJI PERUBAHAN-1: 1 baris')
  && kal.includes('Realisasi: 2 baris') && kal.includes('termasuk yang terkunci'), kal)
ok('B5 kalimat menyebut yang dilewati beserta sebabnya', kalimatJalarRekening(ringkasJalarRekening(rKembar, 'GAJI')).includes('Tidak ikut berganti'))
ok('B6 jejak audit: kosong bila tak ada yang menjalar, berisi bila ada',
  jejakJalarRekening(ringkasJalarRekening(rTanpaRko, 'GAJI')) === '' && /RKO MURNI 1, PERUBAHAN-1 1 baris, Realisasi 2 baris/.test(jejakJalarRekening(ring)), jejakJalarRekening(ring))
ok('B7 dilewati saja (tanpa jalaran) tetap ditanyakan', perluKonfirmasiJalar(ringkasJalarRekening(rKembar, 'GAJI')))

// ─────────────────────────────────────────────────────────────────────────────
console.log('C. Sambungan kode')
const KIN = tanpaKomentar(sumber('lib/data/kinerja.ts'))
const SIMPAN = badan(KIN, 'export async function saveRekeningBatch')
const iKunci = SIMPAN.indexOf('await kunciVersiSsk(tx, tahun, sumber)')
const iReal = SIMPAN.indexOf('await acquireBludLock(tx, REALISASI_LOCK_ENTITY')
const iSelect = SIMPAN.indexOf('FROM kinerja_rekening')
ok('C1 L84: gembok RKO & Realisasi sumber ini SEBELUM membaca rekening lama', iKunci > 0 && iReal > iKunci && iSelect > iReal)
ok('C2 rekening lama dibaca FOR UPDATE', /FROM kinerja_rekening\s+WHERE tahun = \$\{tahun\} AND sumber = \$\{sumber\} ORDER BY urut, id FOR UPDATE/.test(SIMPAN))
const iTanya = SIMPAN.indexOf('if (perluKonfirmasiJalar(jalaran) && !jalarkan) throw new KinerjaPerluJalarError(jalaran);')
ok('C3 konfirmasi ditanya SEBELUM DELETE (tak ada yang tertulis)', iTanya > 0 && iTanya < SIMPAN.indexOf('DELETE FROM kinerja_rekening'))
ok('C4 tulisan jalar SEBELUM jalan keluar dini (simpanan kosong tetap konsisten)',
  SIMPAN.indexOf('await tulisJalarRekening(tx, tahun, sumber, rencana, userId);') < SIMPAN.indexOf('if (rows.length > 0) {'))
const TULIS = badan(KIN, 'async function tulisJalarRekening')
ok('C5 label saja: updated_at dipertahankan di RKO & Realisasi', (TULIS.match(/updated_at = updated_at/g) ?? []).length === 2)
ok('C6 angka kunci RKO per versi & Realisasi dinaikkan',
  TULIS.includes("bumpBludVersion(tx, 'kinerja_ssk', `${tahun}:${sumber}:${v}`, userId)") && TULIS.includes('bumpBludVersion(tx, REALISASI_LOCK_ENTITY, realisasiLockKey(tahun, sumber), userId)'))
ok('C7 balasan membawa baris dengan id baru', SIMPAN.includes('return { rows: await getRekeningRows(tahun, sumber), jalaran, paguDitembus };'))
const ROUTE = sumber('app/api/kinerja/rekening/route.ts')
ok('C8 route: 409 PERLU_KONFIRMASI_JALAR membawa ringkasan, audit menyebut jalaran',
  ROUTE.includes("code: 'PERLU_KONFIRMASI_JALAR', message: err.message, jalaran: err.jalaran") && ROUTE.includes('jejakJalarRekening(hasil.jalaran)'))
const SKEMA = sumber('lib/data/kinerja-schemas.ts')
ok('C9 Zod tidak membuang id baris & menerima jalarkan',
  /id:\s+z\.number\(\)\.int\(\)\.nonnegative\(\)\.optional\(\)/.test(badan(SKEMA, 'const RekeningRowSchema')) && /jalarkan: z\.boolean\(\)\.optional\(\)/.test(SKEMA))
const TAB = tanpaKomentar(sumber('app/(dashboard)/kinerja/_tabs/RekeningTab.tsx'))
ok('C10 layar: konfirmasi lalu simpan ulang dengan jalarkan; force tidak hilang',
  TAB.includes("isi.code === 'PERLU_KONFIRMASI_JALAR'") && TAB.includes('await saveRekening(force, true, alasanPagu)') && TAB.includes('await saveRekening(true, jalarkan, alasanPagu)'))
ok('C11 layar: id baru dipasang sesudah Simpan', TAB.includes('if (isi.rows) setRekeningRows(isi.rows);'))
ok('C12 Pulihkan & Impor tetap tanpa id (tidak menjalar)', TAB.includes('.map(r => ({ ...r, id: 0 }))') && TAB.includes('rows.map(r => ({ id: 0, ...r }))'))

const CHART = tanpaKomentar(sumber('components/kinerja/BerandaCharts.tsx'))
ok('C13 Beranda tidak lagi membaca RKO sendiri (tanpa versi = MURNI-0)', !CHART.includes('/api/kinerja/ssk'))
ok('C14 Beranda memakai target_bulan dari Laporan', CHART.includes('?.target_bulan'))
const TARGET = badan(KIN, 'async function targetBulanan')
ok('C15 target bulanan: versi acuan + baris dinol-kan tidak ikut',
  TARGET.includes('is_nullified = FALSE') && TARGET.includes('r.versi_tipe !== v.tipe || Number(r.versi_seq ?? 0) !== v.seq'))
ok('C16 kedua laporan mengisi target_bulan dari versi acuannya',
  badan(KIN, 'export async function getLaporanData').includes('targetBulanan(tahun, new Map([[sumber, versiAcuan]]), sumber)')
  && badan(KIN, 'export async function getLaporanSemua').includes('targetBulanan(tahun, new Map([...sskBySumber].map(([s, a]) => [s, a.versi_aktif])))'))

// ─────────────────────────────────────────────────────────────────────────────
console.log('D. MySQL kotak pasir 2098')
const TAHUN = '2098'
const SUMBER = ['GAJI', 'BLUD', 'HARLEP', 'PROMKES', 'SARPRAS', 'OBAT', 'PEMELIHARAAN', 'PEMBANGUNAN']
let c: mysql.Connection | null = null
try {
  c = await mysql.createConnection({
    host: process.env.MYSQL_HOST, port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER, password: process.env.MYSQL_PASSWORD, database: process.env.MYSQL_DATABASE,
  })
} catch (er) { console.log(`DILEWATI bagian DB: MySQL tidak bisa dihubungi (${(er as { code?: string }).code ?? er})`) }
if (c) {
  const k = c
  // L92: kunci uji dihapus PERSIS, bukan `WHERE entity = ?` — entity itu dipakai data asli.
  const bersih = async () => {
    // Buat Perubahan memotret realisasi (baris foto ikut lewat FK CASCADE).
    await k.query('DELETE FROM kinerja_realisasi_foto WHERE tahun = ?', [TAHUN])
    await k.query('UPDATE kinerja_ssk SET parent_versi_id = NULL WHERE tahun = ?', [TAHUN])
    for (const t of ['kinerja_ssk', 'kinerja_realisasi', 'kinerja_rekening', 'kinerja_riwayat_simpan']) {
      await k.query(`DELETE FROM ${t} WHERE tahun = ?`, [TAHUN])
    }
    for (const s of SUMBER) {
      await k.query("DELETE FROM blud_locks WHERE entity IN ('kinerja_versi_ssk', 'kinerja_realisasi') AND key_id = ?", [`${TAHUN}:${s}`])
      for (const v of ['MURNI:0', 'PERUBAHAN:1']) await k.query("DELETE FROM blud_locks WHERE entity = 'kinerja_ssk' AND key_id = ?", [`${TAHUN}:${s}:${v}`])
    }
  }
  const q = async <T,>(sqlTeks: string, p: unknown[] = []) => ((await k.query(sqlTeks, p)) as [T[], unknown])[0]
  const n = async (sqlTeks: string, p: unknown[] = []) => Number((await q<{ n: number }>(sqlTeks, p))[0]?.n ?? 0)
  const versiKunci = async (entity: string, key: string) => n('SELECT COALESCE(MAX(version), 0) AS n FROM blud_locks WHERE entity = ? AND key_id = ?', [entity, key])
  await bersih()
  try {
    const K = await import('../lib/data/kinerja')
    const [usr] = await k.query('SELECT id FROM users ORDER BY id LIMIT 1') as [Array<{ id: number }>, unknown]
    const userId = Number(usr[0]?.id ?? 0)
    const bulan = (v: number) => Object.fromEntries(K.MONTHS_KEYS.map(m => [m, v])) as ReturnType<typeof K.emptyMonths>
    const sskRow = (cid: string, uraian: string, pagu: number, o: Record<string, unknown> = {}) => ({
      canonical_id: cid, uraian_ssk: US, uraian, program: PB, kegiatan: KG, subkegiatan: SB,
      pagu, months: bulan(pagu / 12), months_pct: bulan(8.33), total: pagu, total_pct: 100, urut: 0, is_nullified: false, ...o,
    })

    await k.query(`INSERT INTO kinerja_rekening (tahun, sumber, uraian, uraian_ssk, program, kegiatan, subkegiatan, urut) VALUES
      (?, 'GAJI', 'Belanja Gaji Pokok PNS', ?, ?, ?, ?, 1), (?, 'GAJI', 'Belanja Tunjangan Keluarga PNS', ?, ?, ?, ?, 2)`,
      [TAHUN, US, PB, KG, SB, TAHUN, US, PB, KG, SB])
    await K.saveSskBatch(TAHUN, 'GAJI', [sskRow('G-1', 'Belanja Gaji Pokok PNS', 1_200_000), sskRow('G-2', 'Belanja Tunjangan Keluarga PNS', 600_000)], userId, 'MURNI', 0)
    await K.buatVersiPerubahan(TAHUN, 'GAJI', 'MURNI', 0, userId)
    await k.query(`INSERT INTO kinerja_realisasi (tahun, sumber, bulan, ssk_canonical_id, ssk_versi_tipe, ssk_versi_seq, keterangan, program, kegiatan, subkegiatan, uraian_ssk, real_fisik, real_keuangan, updated_at)
      VALUES (?, 'GAJI', 1, 'G-1', 'PERUBAHAN', 1, 'Belanja Gaji Pokok PNS', ?, ?, ?, ?, 100, 90, '2098-01-15 10:00:00'),
             (?, 'GAJI', 2, 'G-1', 'PERUBAHAN', 1, 'Belanja Gaji Pokok PNS', ?, ?, ?, ?, 200, 180, '2098-01-15 10:00:00'),
             (?, 'GAJI', 1, 'G-2', 'PERUBAHAN', 1, 'Belanja Tunjangan Keluarga PNS', ?, ?, ?, ?, 50, 40, '2098-01-15 10:00:00')`,
      [TAHUN, PB, KG, SB, US, TAHUN, PB, KG, SB, US, TAHUN, PB, KG, SB, US])
    const kunciM = await versiKunci('kinerja_ssk', `${TAHUN}:GAJI:MURNI:0`)
    const kunciP = await versiKunci('kinerja_ssk', `${TAHUN}:GAJI:PERUBAHAN:1`)
    const kunciR = await versiKunci('kinerja_realisasi', `${TAHUN}:GAJI`)
    const paguAwal = await n('SELECT SUM(pagu) AS n FROM kinerja_ssk WHERE tahun = ?', [TAHUN])

    const dimuat = await K.getRekeningRows(TAHUN, 'GAJI')
    const sunting = dimuat.map(r => r.uraian === 'Belanja Gaji Pokok PNS' ? { ...r, program: PBs } : r)
    const tanya = await coba(() => K.saveRekeningBatch(TAHUN, 'GAJI', sunting, userId))
    ok('D1 tanpa konfirmasi → KinerjaPerluJalarError menyebut MURNI terkunci + PERUBAHAN-1 + 2 realisasi',
      tanya instanceof K.KinerjaPerluJalarError && tanya.jalaran.dampak.rko.length === 2 && tanya.jalaran.dampak.realisasi === 2,
      tanya instanceof Error ? tanya.message : JSON.stringify(tanya))
    ok('D2 …dan tak satu pun tertulis (rekening, RKO, realisasi)',
      await n('SELECT COUNT(*) AS n FROM kinerja_rekening WHERE tahun = ? AND program = ?', [TAHUN, PBs]) === 0
      && await n('SELECT COUNT(*) AS n FROM kinerja_ssk WHERE tahun = ? AND program = ?', [TAHUN, PBs]) === 0
      && await n('SELECT COUNT(*) AS n FROM kinerja_rekening WHERE tahun = ?', [TAHUN]) === 2)

    const hasil = await K.saveRekeningBatch(TAHUN, 'GAJI', sunting, userId, false, true)
    ok('D3 dengan konfirmasi: RKO kedua versi pindah (MURNI terkunci ikut)',
      await n("SELECT COUNT(*) AS n FROM kinerja_ssk WHERE tahun = ? AND canonical_id = 'G-1' AND program = ?", [TAHUN, PBs]) === 2
      && await n("SELECT COUNT(*) AS n FROM kinerja_ssk WHERE tahun = ? AND versi_tipe = 'MURNI' AND locked_at IS NOT NULL AND program = ?", [TAHUN, PBs]) === 1)
    ok('D4 item lain tetap di rantai lama', await n("SELECT COUNT(*) AS n FROM kinerja_ssk WHERE tahun = ? AND canonical_id = 'G-2' AND program = ?", [TAHUN, PB]) === 2)
    ok('D5 Realisasi ikut, angka & stempel waktunya tetap',
      await n("SELECT COUNT(*) AS n FROM kinerja_realisasi WHERE tahun = ? AND ssk_canonical_id = 'G-1' AND program = ? AND updated_at = '2098-01-15 10:00:00' AND real_keuangan IN (90, 180)", [TAHUN, PBs]) === 2
      && await n("SELECT COUNT(*) AS n FROM kinerja_realisasi WHERE tahun = ? AND ssk_canonical_id = 'G-2' AND program = ?", [TAHUN, PB]) === 1)
    ok('D6 angka RKO tidak berubah', await n('SELECT SUM(pagu) AS n FROM kinerja_ssk WHERE tahun = ?', [TAHUN]) === paguAwal)
    ok('D7 angka kunci RKO MURNI, PERUBAHAN-1 & Realisasi naik (tab terbuka kena 409)',
      await versiKunci('kinerja_ssk', `${TAHUN}:GAJI:MURNI:0`) > kunciM && await versiKunci('kinerja_ssk', `${TAHUN}:GAJI:PERUBAHAN:1`) > kunciP
      && await versiKunci('kinerja_realisasi', `${TAHUN}:GAJI`) > kunciR)
    const idLama = new Set(dimuat.map(r => r.id))
    ok('D8 balasan membawa baris ber-id BARU (id lama sudah dihapus Simpan)',
      hasil.rows.length === 2 && hasil.rows.every(r => !idLama.has(r.id)) && hasil.rows.some(r => r.program === PBs))

    const kunciP2 = await versiKunci('kinerja_ssk', `${TAHUN}:GAJI:PERUBAHAN:1`)
    const ulang = await K.saveRekeningBatch(TAHUN, 'GAJI', hasil.rows, userId)
    ok('D9 simpan ulang tanpa perubahan: tak ada yang ditanya, angka kunci RKO tetap',
      !perluKonfirmasiJalar(ulang.jalaran) && await versiKunci('kinerja_ssk', `${TAHUN}:GAJI:PERUBAHAN:1`) === kunciP2)
    const kedua = ulang.rows.map(r => r.uraian === 'Belanja Gaji Pokok PNS' ? { ...r, uraian: 'Belanja Gaji Pokok ASN' } : r)
    await K.saveRekeningBatch(TAHUN, 'GAJI', kedua, userId, false, true)
    ok('D10 suntingan kedua (pakai id dari balasan) ikut menjalar: RKO.uraian & Realisasi.keterangan',
      await n("SELECT COUNT(*) AS n FROM kinerja_ssk WHERE tahun = ? AND canonical_id = 'G-1' AND uraian = 'Belanja Gaji Pokok ASN'", [TAHUN]) === 2
      && await n("SELECT COUNT(*) AS n FROM kinerja_realisasi WHERE tahun = ? AND ssk_canonical_id = 'G-1' AND keterangan = 'Belanja Gaji Pokok ASN'", [TAHUN]) === 2)
    ok('D11 audit riwayat: snapshot rekening tetap tercatat tiap Simpan', await n("SELECT COUNT(*) AS n FROM kinerja_riwayat_simpan WHERE tahun = ? AND jenis = 'REKENING'", [TAHUN]) === 3)

    // Beranda/Laporan: OBAT yang tidak dianggarkan di murni — RKO-nya hanya PERUBAHAN-1.
    await K.buatVersiPerubahan(TAHUN, 'OBAT', 'MURNI', 0, userId)
    await K.saveSskBatch(TAHUN, 'OBAT', [sskRow('O-1', 'Belanja Obat', 2_400_000), sskRow('O-2', 'Belanja BHP', 1_200_000, { is_nullified: true })], userId, 'PERUBAHAN', 1, 0)
    const semua = await K.getLaporanSemua(TAHUN)
    const obat = semua.find(s => s.sumber === 'OBAT')
    ok('D12 Laporan semua: OBAT (hanya PERUBAHAN-1) ber-pagu & ber-target bulanan',
      obat?.total_pagu === 2_400_000 && obat.target_bulan.length === 12 && obat.target_bulan.every(v => v === 200_000), JSON.stringify(obat?.target_bulan))
    const satu = await K.getLaporanData(TAHUN, 'OBAT')
    ok('D13 Laporan per sumber sama persis; baris dinol-kan tidak ikut', JSON.stringify(satu.target_bulan) === JSON.stringify(obat?.target_bulan))
    const gaji = semua.find(s => s.sumber === 'GAJI')
    ok('D14 GAJI: target dari PERUBAHAN-1 (versi acuan), bukan MURNI + PERUBAHAN dijumlah',
      gaji?.target_bulan.every(v => v === 150_000), JSON.stringify(gaji?.target_bulan))
    const kpi = await K.getKinerjaKpi(TAHUN)
    ok('D15 kartu Beranda: pagu OBAT ikut', kpi.pagu_per_sumber.OBAT === 2_400_000 && kpi.total_pagu === 4_200_000, JSON.stringify(kpi.pagu_per_sumber))
  } finally {
    await bersih()
    const sisa = await n(`SELECT (SELECT COUNT(*) FROM kinerja_ssk WHERE tahun = ?) + (SELECT COUNT(*) FROM kinerja_rekening WHERE tahun = ?)
      + (SELECT COUNT(*) FROM kinerja_realisasi WHERE tahun = ?) + (SELECT COUNT(*) FROM kinerja_riwayat_simpan WHERE tahun = ?)
      + (SELECT COUNT(*) FROM kinerja_realisasi_foto WHERE tahun = ?)
      + (SELECT COUNT(*) FROM blud_locks WHERE entity LIKE 'kinerja%' AND key_id LIKE ?) AS n`,
      [TAHUN, TAHUN, TAHUN, TAHUN, TAHUN, `${TAHUN}:%`])
    ok('D16 kotak pasir 2098 bersih kembali', sisa === 0, String(sisa))
    await k.end()
  }
}

console.log(`\n${lulus} lulus, ${gagal.length} gagal`)
if (gagal.length) { console.log(gagal.map(g => `  - ${g}`).join('\n')); process.exit(1) }
process.exit(0)
