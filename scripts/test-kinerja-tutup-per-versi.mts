#!/usr/bin/env npx tsx
// scripts/test-kinerja-tutup-per-versi.mts — Tutup Bulan per versi RKO + foto realisasi versi
// final (Buat Perubahan memotret Murni; Murni tertutup semua; Perubahan mulai terbuka).
// Konsep: docs/CONCEPT-kinerja-tutup-per-versi.md
// Jalankan: npx tsx --env-file=.env.local scripts/test-kinerja-tutup-per-versi.mts
// Bagian C memakai MySQL sungguhan (kotak pasir 2095), dibersihkan otomatis — tanpa
// --env-file bagian itu DILEWATI dan jumlah lulusnya turun.
import { readFileSync } from 'node:fs'
import mysql from 'mysql2/promise'
import { alasanTolakVersi, samaVersi } from '../lib/kinerja/tutup-bulan'
import { bulanFinal, kalimatVersiFinal, type VersiFinal } from '../lib/kinerja/foto-realisasi'

let lulus = 0
const gagal: string[] = []
function ok(nama: string, syarat: unknown, ket = '') {
  if (syarat) { lulus++; console.log(`  ok  ${nama}`) }
  else { gagal.push(nama); console.log(`FAIL  ${nama}${ket ? ' — ' + ket : ''}`) }
}
const sumber = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
const tanpaKomentar = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
const badan = (isi: string, awal: string) => { const i = isi.indexOf(awal); return i < 0 ? '' : isi.slice(i, isi.indexOf('\n}\n', i)) }
const urut = (s: string, ...p: string[]) => p.every((x, i) => s.indexOf(x) >= 0 && (i === 0 || s.indexOf(x) > s.indexOf(p[i - 1])))
const coba = async <T,>(f: () => Promise<T>): Promise<T | Error> => { try { return await f() } catch (e) { return e as Error } }

const MURNI = { tipe: 'MURNI' as const, seq: 0 }
const P1 = { tipe: 'PERUBAHAN' as const, seq: 1 }

// ─────────────────────────────────────────────────────────────────────────────
console.log('A. Aturan')
ok('A1 versi terbaru boleh ditutup/dibuka', alasanTolakVersi(P1, P1) === null)
const tolak = alasanTolakVersi(MURNI, P1)
ok('A2 versi final ditolak, kalimat menyebut versi terbaru', !!tolak && tolak.includes('MURNI sudah final') && tolak.includes('PERUBAHAN-1'), String(tolak))
ok('A3 samaVersi membandingkan tipe DAN nomor', samaVersi(P1, P1) && !samaVersi(P1, { tipe: 'PERUBAHAN', seq: 2 }) && !samaVersi(MURNI, { tipe: 'PERUBAHAN', seq: 0 }))
const fin: VersiFinal = { dikunci_pada: '2026-10-12 09:30:00', foto: { asal: 'BUAT_PERUBAHAN', keadaan_pada: '2026-10-12 09:30:00', difoto_oleh: 'Budi' } }
const b12 = bulanFinal(fin)
ok('A4 versi final = 12 bulan tertutup, stempel = jam dikunci', b12.length === 12 && b12.map(b => b.bulan).join() === '1,2,3,4,5,6,7,8,9,10,11,12'
  && b12.every(b => b.ditutup_pada === '2026-10-12 09:30:00' && b.ditutup_oleh === 'Budi'))
const fmt = (s: string) => `[${s}]`
ok('A5 kalimat foto Buat Perubahan', kalimatVersiFinal(fin, 'MURNI', fmt).includes('foto realisasi saat itu') && kalimatVersiFinal(fin, 'MURNI', fmt).startsWith('MURNI sudah final sejak Perubahan dibuat [2026-10-12 09:30:00]'))
ok('A6 kalimat foto dari riwayat menyebut jam simpanannya',
  kalimatVersiFinal({ ...fin, foto: { asal: 'RIWAYAT', keadaan_pada: '2026-10-11 16:05:00', difoto_oleh: null } }, 'MURNI', fmt).includes('simpanan realisasi terakhir sebelum Perubahan ([2026-10-11 16:05:00])'))
ok('A7 kalimat foto berjalan berterus terang', kalimatVersiFinal({ ...fin, foto: { asal: 'BERJALAN', keadaan_pada: '2026-11-04 08:00:00', difoto_oleh: null } }, 'MURNI', fmt).includes('sudah tidak ada di riwayat'))
ok('A8 tanpa foto: disebut masih bisa bergeser', kalimatVersiFinal({ dikunci_pada: fin.dikunci_pada, foto: null }, 'MURNI', fmt).includes('masih bisa bergeser'))

// ─────────────────────────────────────────────────────────────────────────────
console.log('B. Sambungan kode')
const KIN = tanpaKomentar(sumber('lib/data/kinerja.ts'))
const BUAT = badan(KIN, 'export async function buatVersiPerubahan')
ok('B1 Buat Perubahan: gembok versi → gembok realisasi → baru membaca (L84)',
  urut(BUAT, 'await kunciVersiSsk(tx, tahun, sumber);', 'await acquireBludLock(tx, REALISASI_LOCK_ENTITY, realisasiLockKey(tahun, sumber));', 'SELECT COALESCE(MAX(versi_seq), 0)'))
ok('B2 …realisasi versi asal dipotret SESUDAH dikunci, lalu angka kunci realisasi naik',
  urut(BUAT, 'SET locked_at = NOW()', 'potretRealisasi(tx, tahun, sumber, { tipe: fromTipe, seq: fromSeq }, userId)', 'bumpBludVersion(tx, REALISASI_LOCK_ENTITY, realisasiLockKey(tahun, sumber), userId)'))
ok('B3 …RKO kosong (tidak ada yang dikunci) tidak dipotret', BUAT.indexOf('return;\n      }\n      copied = sourceRows.length;') > 0
  && BUAT.indexOf('return;\n      }\n      copied = sourceRows.length;') < BUAT.indexOf('potretRealisasi('))
const SIMPAN = badan(KIN, 'export async function saveRealisasiBatch')
ok('B4 Simpan Realisasi dijaga tutupan versi TERBARU', SIMPAN.includes('bulanTertutupSet(tx, tahun, sumber, await versiTerbaruSsk(tx, tahun, sumber))'))
ok('B5 peringatan RKO memakai tutupan versi yang disimpan', KIN.includes('bulanTertutupSet(tx, tahun, sumber, { tipe: versiTipe, seq: versiSeq })'))
const HIDRASI = badan(KIN, 'export async function getRealisasiHydrated')
ok('B6 pembaca foto: tabel foto disaring versinya', HIDRASI.includes('FROM kinerja_realisasi_foto_baris')
  && HIDRASI.includes('WHERE tahun = ${tahun} AND sumber = ${sumber} AND versi_tipe = ${versiTipe} AND versi_seq = ${versiSeq}'))
const GET = tanpaKomentar(sumber('app/api/kinerja/realisasi/route.ts'))
ok('B7 GET: versi final → foto + 12 bulan tertutup; lainnya tutupan versinya',
  GET.includes('const final = await versiFinal(sql, tahun, sumber, v);') && GET.includes('getRealisasiHydrated(tahun, sumber, versiTipe, versiSeq, !!final?.foto)')
  && GET.includes('final ? bulanFinal(final) : daftarBulanTertutup(sql, tahun, sumber, v)'))
const TDATA = tanpaKomentar(sumber('lib/kinerja/tutup-bulan-data.ts'))
ok('B8 Tutup & Buka menolak versi yang bukan terbaru, di bawah gembok', urut(badan(TDATA, 'async function kunciVersiTutup('),
  'acquireBludLock(tx, REALISASI_LOCK_ENTITY', 'alasanTolakVersi(v, await versiTerbaruSsk(tx, tahun, sumber))', 'throw new KinerjaAturanTutupError(alasan)'))
ok('B9 setiap kueri tutupan memuat versi', (TDATA.match(/versi_tipe = \$\{v\.tipe\} AND (t\.)?versi_seq = \$\{v\.seq\}/g) ?? []).length >= 5)
const RESET = tanpaKomentar(sumber('app/api/kinerja/reset/route.ts'))
ok('B10 Reset: gembok versi → gembok realisasi, tutupan versi terbaru yang menahan',
  urut(RESET, "if (scope !== 'realisasi') await kunciVersiSsk(tx, tahun, sumber);", 'await acquireBludLock(tx, REALISASI_LOCK_ENTITY', 'versiTerbaruSsk(tx, tahun, sumber)', 'adaBulanTertutup(tx, tahun, sumber, terbaru)'))
ok('B11 Reset RKO: tutupan & foto versi yang dihapus/dibuka ikut dibuang SESUDAH kunci dibuka',
  urut(RESET, 'SET locked_at = NULL', 'buangTutupVersi(tx, tahun, sumber, versiSpecified ?', 'buangFotoTakFinal(tx, tahun, sumber)'))
ok('B12 Reset RKO versi terbaru yang punya bulan tertutup ditolak', RESET.includes("(scope !== 'ssk' || hapusVersiTerbaru) && await adaBulanTertutup("))
const TAB = tanpaKomentar(sumber('app/(dashboard)/kinerja/_tabs/RealisasiTab.tsx'))
ok('B13 layar: Tutup/Buka mengirim versi yang dilihat', TAB.includes('versi_tipe: sskVersi.tipe, versi_seq: sskVersi.seq, bulan: realisasiBulan, aksi'))
ok('B14 layar: versi final = spanduk tanpa tombol Buka/Tutup', urut(TAB, '{versiLocked ? (', 'kalimatVersiFinal(versiFinal, versiLabel, fmtStempel)', ') : bulanIniTertutup ? (')
  && !badan(TAB, '{versiLocked ? (').slice(0, TAB.indexOf(') : bulanIniTertutup ? (') - TAB.indexOf('{versiLocked ? (')).includes('tutupAtauBuka('))
ok('B15 layar: Riwayat Simpan mati di versi final', TAB.includes("onClick={() => setShowRiwayat(true)} disabled={versiLocked}>"))
const ZOD = sumber('lib/data/kinerja-schemas.ts')
ok('B16 Zod Tutup/Buka mewajibkan versi', /TutupBulanBodySchema = z\.object\(\{[\s\S]*?versi_tipe: VersiTipeSchema,\s*versi_seq:\s+VersiSeqSchema,/.test(ZOD))
const SKEMA = sumber('docs/schema-mysql.sql').replace(/\s+/g, ' ')
const MIG = sumber('docs/migrations/migration-kinerja-tutup-per-versi.sql').replace(/\s+/g, ' ')
const tabel = (s: string, n: string) => { const i = s.indexOf(`CREATE TABLE IF NOT EXISTS ${n} (`); return i < 0 ? '' : s.slice(i, s.indexOf('COMMENT=', i)) }
ok('B17 skema acuan & migrasi: dua tabel foto identik', ['kinerja_realisasi_foto', 'kinerja_realisasi_foto_baris']
  .every(n => tabel(SKEMA, n).length > 100 && tabel(SKEMA, n) === tabel(MIG, n)))
ok('B18 baris foto ikut terhapus bersama kepalanya', tabel(SKEMA, 'kinerja_realisasi_foto_baris').includes('ON DELETE CASCADE'))

// ─────────────────────────────────────────────────────────────────────────────
console.log('C. MySQL kotak pasir 2095')
const TAHUN = '2095'
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
    await k.query('DELETE FROM kinerja_realisasi_foto WHERE tahun = ?', [TAHUN])
    await k.query('UPDATE kinerja_ssk SET parent_versi_id = NULL WHERE tahun = ?', [TAHUN])
    for (const t of ['kinerja_ssk', 'kinerja_realisasi', 'kinerja_bulan_tutup', 'kinerja_riwayat_simpan']) {
      await k.query(`DELETE FROM ${t} WHERE tahun = ?`, [TAHUN])
    }
    for (const s of SUMBER) {
      await k.query("DELETE FROM blud_locks WHERE entity IN ('kinerja_versi_ssk', 'kinerja_realisasi') AND key_id = ?", [`${TAHUN}:${s}`])
      for (const v of ['MURNI:0', 'PERUBAHAN:1']) await k.query("DELETE FROM blud_locks WHERE entity = 'kinerja_ssk' AND key_id = ?", [`${TAHUN}:${s}:${v}`])
    }
  }
  const q = async <T,>(sqlTeks: string, p: unknown[] = []) => ((await k.query(sqlTeks, p)) as [T[], unknown])[0]
  const n = async (sqlTeks: string, p: unknown[] = []) => Number((await q<{ n: number }>(sqlTeks, p))[0]?.n ?? 0)
  const versiKunci = async (key: string) => n("SELECT COALESCE(MAX(version), 0) AS n FROM blud_locks WHERE entity = 'kinerja_realisasi' AND key_id = ?", [key])
  await bersih()
  try {
    const K = await import('../lib/data/kinerja')
    const T = await import('../lib/kinerja/tutup-bulan-data')
    const F = await import('../lib/kinerja/foto-realisasi-data')
    const D = await import('../lib/data/db')
    const [usr] = await k.query('SELECT id FROM users ORDER BY id LIMIT 1') as [Array<{ id: number }>, unknown]
    const userId = Number(usr[0]?.id ?? 0)
    const bulan = (v: number) => Object.fromEntries(K.MONTHS_KEYS.map(m => [m, v])) as ReturnType<typeof K.emptyMonths>
    const rko = (cid: string, uraian: string, pagu: number) => ({
      canonical_id: cid, uraian_ssk: 'US', uraian, program: 'P', kegiatan: 'K', subkegiatan: 'S',
      pagu, months: bulan(pagu / 12), months_pct: bulan(8.33), total: pagu, total_pct: 100, urut: 0, is_nullified: false,
    })
    const isiReal = async (sbr: string, nilai: Record<string, Record<number, number>>, updated = '2095-01-20 09:00:00') => {
      const baris: unknown[] = []
      for (const [cid, perBulan] of Object.entries(nilai)) for (let b = 1; b <= 12; b++) {
        baris.push([TAHUN, sbr, b, cid, 'MURNI', 0, `Belanja ${cid}`, 'P', 'K', 'S', 'US', perBulan[b] ?? 0, perBulan[b] ?? 0, updated])
      }
      await k.query('INSERT INTO kinerja_realisasi (tahun, sumber, bulan, ssk_canonical_id, ssk_versi_tipe, ssk_versi_seq, keterangan, program, kegiatan, subkegiatan, uraian_ssk, real_fisik, real_keuangan, updated_at) VALUES ?', [baris])
    }
    const keuJanuari = (rows: { bulan: number; ssk_canonical_id?: string; real_keuangan?: number }[], cid: string) =>
      Number(rows.find(r => r.bulan === 1 && r.ssk_canonical_id === cid)?.real_keuangan ?? -1)

    // GAJI: Murni berjalan, Januari sudah ditutup, lalu Oktober klik Buat Perubahan.
    await K.saveSskBatch(TAHUN, 'GAJI', [rko('G-1', 'Belanja Gaji', 1_200_000), rko('G-2', 'Belanja Tunjangan', 600_000)], userId, 'MURNI', 0)
    await isiReal('GAJI', { 'G-1': { 1: 100_000 }, 'G-2': { 1: 40_000 } })
    await T.tutupBulanRealisasi(TAHUN, 'GAJI', MURNI, 1, userId)
    const kunciAwal = await versiKunci(`${TAHUN}:GAJI`)
    const buat = await K.buatVersiPerubahan(TAHUN, 'GAJI', 'MURNI', 0, userId)
    ok('C1 Buat Perubahan memotret seluruh realisasi (24 baris), asal BUAT_PERUBAHAN',
      buat.difoto === 24 && await n("SELECT COUNT(*) AS n FROM kinerja_realisasi_foto WHERE tahun = ? AND sumber = 'GAJI' AND versi_tipe = 'MURNI' AND asal = 'BUAT_PERUBAHAN'", [TAHUN]) === 1,
      JSON.stringify(buat))
    ok('C2 …dan angka kunci realisasi naik (tab Realisasi terbuka memuat ulang)', await versiKunci(`${TAHUN}:GAJI`) > kunciAwal)
    ok('C3 versi terbaru = PERUBAHAN-1', samaVersi(await T.versiTerbaruSsk(D.sql, TAHUN, 'GAJI'), P1))
    const fMurni = await F.versiFinal(D.sql, TAHUN, 'GAJI', MURNI)
    ok('C4 MURNI final: punya foto, 12 bulan tertutup', !!fMurni?.foto && fMurni.foto.asal === 'BUAT_PERUBAHAN' && bulanFinal(fMurni).length === 12)
    ok('C5 PERUBAHAN-1 berjalan & mulai TANPA bulan tertutup (Jan–Des terbuka)',
      await F.versiFinal(D.sql, TAHUN, 'GAJI', P1) === null && (await T.daftarBulanTertutup(D.sql, TAHUN, 'GAJI', P1)).length === 0)

    // Koreksi Januari di Perubahan: boleh, dan foto Murni tidak bergeser.
    const real = (await K.getRealisasiHydrated(TAHUN, 'GAJI', 'PERUBAHAN', 1)).rows
    const ubahJan = (rows: typeof real, nilai: number) => rows.map(r => r.bulan === 1 && r.ssk_canonical_id === 'G-1' ? { ...r, real_keuangan: nilai, real_fisik: nilai } : r)
    const simpan = await coba(() => K.saveRealisasiBatch(TAHUN, 'GAJI', ubahJan(real, 150_000) as never, userId))
    ok('C6 Januari Perubahan bisa dikoreksi walau Januari Murni sudah ditutup', !(simpan instanceof Error), simpan instanceof Error ? simpan.message : '')
    const foto = (await K.getRealisasiHydrated(TAHUN, 'GAJI', 'MURNI', 0, true)).rows
    const jalan = (await K.getRealisasiHydrated(TAHUN, 'GAJI', 'MURNI', 0)).rows
    ok('C7 laporan MURNI (foto) tetap 100.000; realisasi berjalan 150.000', keuJanuari(foto, 'G-1') === 100_000 && keuJanuari(jalan, 'G-1') === 150_000,
      `foto ${keuJanuari(foto, 'G-1')} jalan ${keuJanuari(jalan, 'G-1')}`)
    ok('C8 foto berpasangan sama dengan realisasi (24 baris, urutan bulan)', foto.length === 24 && foto.every((r, i) => i === 0 || r.bulan >= foto[i - 1].bulan))

    const tutupMurni = await coba(() => T.tutupBulanRealisasi(TAHUN, 'GAJI', MURNI, 2, userId))
    ok('C9 menutup bulan di MURNI final ditolak', tutupMurni instanceof T.KinerjaAturanTutupError && /sudah final/.test(tutupMurni.message))
    const bukaMurni = await coba(() => T.bukaBulanRealisasi(TAHUN, 'GAJI', MURNI, 1))
    ok('C10 membuka bulan di MURNI final juga ditolak', bukaMurni instanceof T.KinerjaAturanTutupError)
    await T.tutupBulanRealisasi(TAHUN, 'GAJI', P1, 1, userId)
    ok('C11 menutup Januari Perubahan tidak menyentuh Murni (tutupannya tetap satu milik MURNI)',
      (await T.daftarBulanTertutup(D.sql, TAHUN, 'GAJI', P1)).map(x => x.bulan).join() === '1'
      && await n("SELECT COUNT(*) AS n FROM kinerja_bulan_tutup WHERE tahun = ? AND sumber = 'GAJI' AND versi_tipe = 'MURNI'", [TAHUN]) === 1)
    const real2 = (await K.getRealisasiHydrated(TAHUN, 'GAJI', 'PERUBAHAN', 1)).rows
    const langgar = await coba(() => K.saveRealisasiBatch(TAHUN, 'GAJI', ubahJan(real2, 175_000) as never, userId))
    ok('C12 sesudah Januari Perubahan ditutup, Simpan yang mengubahnya ditolak', langgar instanceof Error && langgar.name === 'KinerjaBulanTertutupError')
    const sskP1 = await K.getSskRows(TAHUN, 'GAJI', 'PERUBAHAN', 1)
    const rkoUbah = sskP1.map(r => (r as { canonical_id?: string }).canonical_id === 'G-1' ? { ...r, months: { ...r.months, jan: 1 } } : r)
    const peringatan = await coba(() => K.saveSskBatch(TAHUN, 'GAJI', rkoUbah, userId, 'PERUBAHAN', 1))
    ok('C13 RKO Perubahan yang mengubah target Januari tertutup → peringatan', peringatan instanceof Error && peringatan.name === 'KinerjaTargetTertutupError')
    const ulang = await D.withTransaction(({ tx }) => F.potretRealisasi(tx, TAHUN, 'GAJI', MURNI, userId))
    ok('C14 foto yang sudah ada tidak ditimpa', ulang === null && keuJanuari((await K.getRealisasiHydrated(TAHUN, 'GAJI', 'MURNI', 0, true)).rows, 'G-1') === 100_000)

    // Reset hapus PERUBAHAN-1 (langkah route Reset): Murni berjalan lagi.
    await D.withTransaction(async ({ tx }) => {
      await tx`DELETE FROM kinerja_ssk WHERE tahun = ${TAHUN} AND sumber = 'GAJI' AND versi_tipe = 'PERUBAHAN' AND versi_seq = 1`
      await tx`UPDATE kinerja_ssk SET locked_at = NULL WHERE tahun = ${TAHUN} AND sumber = 'GAJI' AND versi_tipe = 'MURNI'`
      await T.buangTutupVersi(tx, TAHUN, 'GAJI', P1)
      await F.buangFotoTakFinal(tx, TAHUN, 'GAJI')
    })
    ok('C15 Perubahan dihapus: foto Murni & barisnya dibuang, tutupan Perubahan ikut',
      await n("SELECT COUNT(*) AS n FROM kinerja_realisasi_foto WHERE tahun = ? AND sumber = 'GAJI'", [TAHUN]) === 0
      && await n("SELECT COUNT(*) AS n FROM kinerja_realisasi_foto_baris WHERE tahun = ? AND sumber = 'GAJI'", [TAHUN]) === 0
      && (await T.daftarBulanTertutup(D.sql, TAHUN, 'GAJI', P1)).length === 0)
    ok('C16 …tutupan lama Murni berlaku lagi', (await T.daftarBulanTertutup(D.sql, TAHUN, 'GAJI', MURNI)).map(x => x.bulan).join() === '1'
      && await F.versiFinal(D.sql, TAHUN, 'GAJI', MURNI) === null)

    // ── Migrasi: Murni yang sudah terkunci SEBELUM fitur ini (tanpa foto) ──
    // BLUD: ada simpanan riwayat sebelum Perubahan → foto dari riwayat, bukan realisasi sekarang.
    await K.saveSskBatch(TAHUN, 'BLUD', [rko('B-1', 'Belanja Barang', 2_400_000)], userId, 'MURNI', 0)
    await K.saveSskBatch(TAHUN, 'BLUD', [rko('B-1', 'Belanja Barang', 2_400_000)], userId, 'PERUBAHAN', 1, 0)
    await k.query("UPDATE kinerja_ssk SET locked_at = '2095-10-12 09:30:00' WHERE tahun = ? AND sumber = 'BLUD' AND versi_tipe = 'MURNI'", [TAHUN])
    const isiRiwayat = Array.from({ length: 12 }, (_, i) => ({ bulan: i + 1, ssk_canonical_id: 'B-1', ssk_versi_tipe: 'MURNI', ssk_versi_seq: 0,
      keterangan: 'Belanja Barang', program: 'P', kegiatan: 'K', subkegiatan: 'S', uraian_ssk: 'US', real_fisik: i === 0 ? 70_000 : 0, real_keuangan: i === 0 ? 70_000 : 0, akum_keuangan: 0 }))
    const riw = (pada: string, keu: number) => k.query(`INSERT INTO kinerja_riwayat_simpan (jenis, tahun, sumber, versi_tipe, versi_seq, disimpan_pada, versi_ke, jumlah_baris, total_nilai, isi, disimpan_oleh)
      VALUES ('REALISASI', ?, 'BLUD', NULL, NULL, ?, NULL, 12, ?, ?, ?)`, [TAHUN, pada, keu, JSON.stringify(isiRiwayat.map(r => r.bulan === 1 ? { ...r, real_keuangan: keu } : r)), userId])
    await riw('2095-10-01 10:00:00', 60_000)
    await riw('2095-10-12 09:00:00', 70_000)
    await riw('2095-10-20 14:00:00', 99_000)
    await isiReal('BLUD', { 'B-1': { 1: 99_000 } })
    // HARLEP: simpanannya sudah terpangkas → foto dari realisasi saat pembaruan dipasang.
    await K.saveSskBatch(TAHUN, 'HARLEP', [rko('H-1', 'Belanja Pemeliharaan', 1_200_000)], userId, 'MURNI', 0)
    await K.saveSskBatch(TAHUN, 'HARLEP', [rko('H-1', 'Belanja Pemeliharaan', 1_200_000)], userId, 'PERUBAHAN', 1, 0)
    await k.query("UPDATE kinerja_ssk SET locked_at = '2095-10-12 09:30:00' WHERE tahun = ? AND sumber = 'HARLEP' AND versi_tipe = 'MURNI'", [TAHUN])
    await isiReal('HARLEP', { 'H-1': { 1: 33_000 } })
    // Tutupan lama BLUD (sebelum pembaruan: tanpa versi = MURNI-0 bawaan) — menjaga realisasi berjalan.
    await k.query("INSERT INTO kinerja_bulan_tutup (tahun, sumber, bulan, ditutup_oleh, ditutup_pada) VALUES (?, 'BLUD', 1, ?, '2095-11-01 10:00:00'), (?, 'BLUD', 2, ?, '2095-11-01 10:00:00')", [TAHUN, userId, TAHUN, userId])

    const mentah = sumber('docs/migrations/migration-kinerja-tutup-per-versi.sql').replace(/\r\n/g, '\n')
    const pernyataan = mentah.split('\n').filter(l => !l.trim().startsWith('--')).join('\n')
      .split(/;\s*\n/).map(s => s.trim()).filter(Boolean)
    const ambil = (cari: string[]) => pernyataan.filter(s => cari.every(c => s.includes(c)))
    const langkah = [
      ...ambil(['UPDATE kinerja_bulan_tutup t']),
      ...ambil(['INSERT INTO kinerja_realisasi_foto\n', "'RIWAYAT'"]),
      ...ambil(['INSERT INTO kinerja_realisasi_foto_baris', 'JSON_TABLE']),
      ...ambil(['INSERT INTO kinerja_realisasi_foto\n', "'BERJALAN'"]),
      ...ambil(['INSERT INTO kinerja_realisasi_foto_baris', 'JOIN kinerja_realisasi r']),
    ]
    ok('C17 lima langkah data migrasi ditemukan, tiga berpenanda kotak pasir', langkah.length === 5 && langkah.filter(s => s.includes('/*UJI*/')).length === 3)
    for (const s of langkah) await k.query(s.replace('/*UJI*/', `AND tahun = '${TAHUN}'`))

    ok('C18 tutupan lama pindah ke versi TERBARU (BLUD PERUBAHAN-1) — tampilan sama seperti sebelumnya',
      (await T.daftarBulanTertutup(D.sql, TAHUN, 'BLUD', P1)).map(x => x.bulan).join() === '1,2'
      && (await T.daftarBulanTertutup(D.sql, TAHUN, 'BLUD', MURNI)).length === 0)
    ok('C18b tutupan sumber tanpa Perubahan (GAJI) tetap di MURNI', (await T.daftarBulanTertutup(D.sql, TAHUN, 'GAJI', MURNI)).map(x => x.bulan).join() === '1')
    const fBlud = await F.versiFinal(D.sql, TAHUN, 'BLUD', MURNI)
    ok('C19 BLUD MURNI: foto dari simpanan terakhir SEBELUM Perubahan (09:00, bukan 20 Okt)',
      fBlud?.foto?.asal === 'RIWAYAT' && fBlud.foto.keadaan_pada === '2095-10-12 09:00:00', JSON.stringify(fBlud))
    const fotoBlud = (await K.getRealisasiHydrated(TAHUN, 'BLUD', 'MURNI', 0, true)).rows
    ok('C20 …isinya dari riwayat itu: Januari 70.000, 12 bulan', keuJanuari(fotoBlud, 'B-1') === 70_000 && fotoBlud.length === 12, `${keuJanuari(fotoBlud, 'B-1')} / ${fotoBlud.length}`)
    const fHar = await F.versiFinal(D.sql, TAHUN, 'HARLEP', MURNI)
    ok('C21 HARLEP MURNI tanpa riwayat: foto dari realisasi saat ini, asalnya disebut',
      fHar?.foto?.asal === 'BERJALAN' && keuJanuari((await K.getRealisasiHydrated(TAHUN, 'HARLEP', 'MURNI', 0, true)).rows, 'H-1') === 33_000)
    ok('C22 versi berjalan (PERUBAHAN-1) tidak dipotret', await n("SELECT COUNT(*) AS n FROM kinerja_realisasi_foto WHERE tahun = ? AND versi_tipe = 'PERUBAHAN'", [TAHUN]) === 0)
    for (const s of langkah.slice(1)) await k.query(s.replace('/*UJI*/', `AND tahun = '${TAHUN}'`))
    ok('C23 langkah foto aman diulang: tidak ada baris ganda', await n('SELECT COUNT(*) AS n FROM kinerja_realisasi_foto_baris WHERE tahun = ?', [TAHUN]) === 24)
  } finally {
    await bersih()
    const sisa = await n(`SELECT (SELECT COUNT(*) FROM kinerja_ssk WHERE tahun = ?) + (SELECT COUNT(*) FROM kinerja_realisasi WHERE tahun = ?)
      + (SELECT COUNT(*) FROM kinerja_bulan_tutup WHERE tahun = ?) + (SELECT COUNT(*) FROM kinerja_realisasi_foto WHERE tahun = ?)
      + (SELECT COUNT(*) FROM kinerja_realisasi_foto_baris WHERE tahun = ?) + (SELECT COUNT(*) FROM kinerja_riwayat_simpan WHERE tahun = ?)
      + (SELECT COUNT(*) FROM blud_locks WHERE entity LIKE 'kinerja%' AND key_id LIKE ?) AS n`,
      [TAHUN, TAHUN, TAHUN, TAHUN, TAHUN, TAHUN, `${TAHUN}:%`])
    ok('C24 kotak pasir 2095 bersih kembali', sisa === 0, String(sisa))
    await k.end()
  }
}

console.log(`\n${lulus} lulus, ${gagal.length} gagal`)
if (gagal.length) { console.log(gagal.map(g => `  - ${g}`).join('\n')); process.exit(1) }
process.exit(0)
