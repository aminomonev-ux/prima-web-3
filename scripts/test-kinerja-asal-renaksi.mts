#!/usr/bin/env npx tsx
// scripts/test-kinerja-asal-renaksi.mts — tanda "diambil dari Rencana Aksi" di Master E-Anggaran.
// Konsep: docs/CONCEPT-renaksi-terhubung.md §5.1–5.2 (Tahap B).
// Jalankan: npx tsx --env-file=.env.local scripts/test-kinerja-asal-renaksi.mts
// Bagian C memakai MySQL sungguhan (kotak pasir 2094), dibersihkan otomatis — tanpa
// --env-file bagian itu GAGAL, bukan dilewati.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import mysql from 'mysql2/promise'
import {
  bisaDariRenaksi, dariRenaksi, tandaRantai, namaBertanda, jalurAdaDiRenaksi, kunciNamaRenaksi, tandaWarisan,
  type EntriBerasal, type BarisRenaksi,
} from '../lib/kinerja/asal-renaksi'
import { rencanaRapikanBintang, rencanaUbahMaster, type EntriMaster } from '../lib/kinerja/master-ubah'

let lulus = 0
const gagal: string[] = []
function ok(nama: string, syarat: unknown, ket = '') {
  if (syarat) { lulus++; console.log(`  ok  ${nama}`) }
  else { gagal.push(nama); console.log(`FAIL  ${nama}${ket ? ' — ' + ket : ''}`) }
}
const sumber = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
const tanpaKomentar = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')

const m = (tipe: EntriBerasal['tipe'], nama: string, asal: 'MANUAL' | 'RENAKSI', p: string | null = null, k: string | null = null): EntriBerasal =>
  ({ tipe, nama, asal, program_ref: p, kegiatan_ref: k, subkegiatan_ref: null })

// ─────────────────────────────────────────────────────────────────────────────
console.log('A. Aturan')
ok('A1 hanya program/kegiatan/subkegiatan yang bisa berasal Renaksi',
  bisaDariRenaksi('program') && bisaDariRenaksi('kegiatan') && bisaDariRenaksi('subkegiatan')
  && !bisaDariRenaksi('uraian_ssk') && !bisaDariRenaksi('sumber_anggaran'))
ok('A2 dariRenaksi: asal RENAKSI saja; uraian SSK bertanda pun tidak dihitung',
  dariRenaksi(m('program', 'P', 'RENAKSI')) && !dariRenaksi(m('program', 'P', 'MANUAL'))
  && !dariRenaksi({ ...m('program', 'P', 'RENAKSI'), asal: undefined }) && !dariRenaksi(m('uraian_ssk', 'U', 'RENAKSI')))

const master: EntriBerasal[] = [
  m('program', 'PROG A', 'RENAKSI'),
  m('program', 'PROG M', 'MANUAL'),
  m('kegiatan', 'KEG X', 'RENAKSI', 'PROG A'),
  m('kegiatan', 'KEG X', 'MANUAL', 'PROG M'),
  m('subkegiatan', 'SUB 1', 'RENAKSI', 'PROG A', 'KEG X'),
  m('subkegiatan', 'SUB LAMA', 'RENAKSI', null, null),
]
const t1 = tandaRantai({ program: 'PROG A', kegiatan: 'KEG X', subkegiatan: 'SUB 1' }, master)
ok('A3 rekening di rantai Renaksi: ketiga kolom bertanda', t1.program && t1.kegiatan && t1.subkegiatan, JSON.stringify(t1))
const t2 = tandaRantai({ program: 'PROG M', kegiatan: 'KEG X', subkegiatan: 'SUB 1' }, master)
ok('A4 kegiatan senama di program lain TIDAK menurunkan tanda', !t2.program && !t2.kegiatan && !t2.subkegiatan, JSON.stringify(t2))
const t3 = tandaRantai({ program: 'PROG Z', kegiatan: 'KEG Q', subkegiatan: 'SUB LAMA' }, master)
ok('A5 entri berinduk kosong (data lama) cocok di rantai mana pun — aturan cocokInduk', !t3.program && !t3.kegiatan && t3.subkegiatan, JSON.stringify(t3))
ok('A6 nama kosong tidak bertanda', !tandaRantai({ program: '', kegiatan: null }, master).program)
ok('A7 namaBertanda: hanya nama ber-asal Renaksi di antara baris yang lolos saringan',
  [...namaBertanda(master.filter(e => e.tipe === 'kegiatan' && e.program_ref === 'PROG M'))].length === 0
  && namaBertanda(master.filter(e => e.tipe === 'kegiatan' && e.program_ref === 'PROG A')).has('KEG X'))

const ra: BarisRenaksi[] = [
  { level: 'program', program: 'Program Pelayanan ***', kegiatan: null, sub_kegiatan: null },
  { level: 'kegiatan', program: 'Program Pelayanan ***', kegiatan: 'Kegiatan Obat ****', sub_kegiatan: null },
  { level: 'sub-kegiatan', program: 'Program Pelayanan', kegiatan: 'Kegiatan Obat', sub_kegiatan: 'Sub Beli Obat *****' },
  { level: 'sub-kegiatan', program: 'Program Lain', kegiatan: 'Kegiatan Obat', sub_kegiatan: 'Sub Lain' },
]
ok('A8 kunci nama: bintang di ujung & huruf besar-kecil diabaikan', kunciNamaRenaksi('Program X ***') === kunciNamaRenaksi('PROGRAM x'))
ok('A9 program cocok walau Master tanpa bintang & beda kapital', jalurAdaDiRenaksi(m('program', 'PROGRAM PELAYANAN', 'MANUAL'), ra))
ok('A10 program yang hanya muncul di baris kegiatan/sub TIDAK dianggap program Renaksi',
  !jalurAdaDiRenaksi(m('program', 'Program Lain', 'MANUAL'), ra))
ok('A11 kegiatan: induk sama → cocok; induk lain → tidak; induk kosong → cocok',
  jalurAdaDiRenaksi(m('kegiatan', 'Kegiatan Obat', 'MANUAL', 'Program Pelayanan'), ra)
  && !jalurAdaDiRenaksi(m('kegiatan', 'Kegiatan Obat', 'MANUAL', 'Program Lain'), ra)
  && jalurAdaDiRenaksi(m('kegiatan', 'Kegiatan Obat', 'MANUAL', null), ra))
ok('A12 sub kegiatan: dicocokkan dengan program DAN kegiatan',
  jalurAdaDiRenaksi(m('subkegiatan', 'Sub Beli Obat', 'MANUAL', 'Program Pelayanan ***', 'Kegiatan Obat'), ra)
  && !jalurAdaDiRenaksi(m('subkegiatan', 'Sub Beli Obat', 'MANUAL', 'Program Lain', 'Kegiatan Obat'), ra)
  && !jalurAdaDiRenaksi(m('subkegiatan', 'Sub Beli Obat', 'MANUAL', 'Program Pelayanan', 'Kegiatan Lain'), ra))
ok('A13 uraian SSK tidak pernah dianggap dari Renaksi', !jalurAdaDiRenaksi(m('uraian_ssk', 'Sub Beli Obat', 'MANUAL'), ra))

// Tahap G — penerima gabungan mewarisi tanda.
const em = (id: number, tipe: EntriMaster['tipe'], nama: string, p: string | null = null): EntriMaster =>
  ({ id, tipe, nama, program_ref: p, kegiatan_ref: null, subkegiatan_ref: null })
const rapi = rencanaRapikanBintang([em(1, 'program', 'Program Pelayanan'), em(2, 'program', 'Program Pelayanan ***'), em(3, 'program', 'Program Sendiri ***')])
ok('A14 Rapikan Bintang mencatat ke mana entri melebur (yang tak tersentuh = penerima)',
  JSON.stringify(rapi.lebur) === '[{"dari":2,"ke":1}]' && rapi.hapus.join() === '2', JSON.stringify(rapi.lebur))
const ubah = rencanaUbahMaster([em(1, 'kegiatan', 'Keg A', 'P'), em(2, 'kegiatan', 'Keg B', 'P')], 2, { nama: 'Keg A' })
ok('A15 Edit Master gabung: diri melebur ke entri yang sudah ada', !('tolak' in ubah) && JSON.stringify(ubah.lebur) === '[{"dari":2,"ke":1}]')
const asalPeta = (x: Array<[number, 'MANUAL' | 'RENAKSI']>) => new Map(x)
const akhirRapi = rapi.akhir
ok('A16 penerima MANUAL mewarisi RENAKSI bila jalurnya ada di Renaksi',
  tandaWarisan(rapi.lebur, asalPeta([[1, 'MANUAL'], [2, 'RENAKSI']]), akhirRapi, ra).join() === '1')
ok('A17 jalur penerima TIDAK ada di Renaksi → tetap MANUAL (pagar L68)',
  tandaWarisan(rapi.lebur, asalPeta([[1, 'MANUAL'], [2, 'RENAKSI']]), akhirRapi, ra.filter(r => r.level !== 'program')).length === 0)
ok('A18 yang melebur MANUAL → tidak ada warisan (penerima RENAKSI pun tidak disentuh)',
  tandaWarisan(rapi.lebur, asalPeta([[1, 'MANUAL'], [2, 'MANUAL']]), akhirRapi, ra).length === 0
  && tandaWarisan(rapi.lebur, asalPeta([[1, 'RENAKSI'], [2, 'MANUAL']]), akhirRapi, ra).length === 0)

// ─────────────────────────────────────────────────────────────────────────────
console.log('B. Sambungan kode')
const KIN = tanpaKomentar(sumber('lib/data/kinerja.ts'))
const INIT = KIN.slice(KIN.indexOf('export async function initMasterFromRenaksi'), KIN.indexOf('// ─── Rekening'))
ok('B1 Init Renaksi menulis kolom asal = RENAKSI di ketiga tingkat',
  INIT.includes("'created_by','asal'") && (INIT.match(/userId, 'RENAKSI'\]\)/g) ?? []).length === 3)
ok('B2 getMasterRows membaca asal', /SELECT id, tahun, tipe, sumber, nama, program_ref, kegiatan_ref, subkegiatan_ref, urut, asal\s/.test(KIN))
ok('B3 skema acuan memuat kolom asal', /asal\s+ENUM\('MANUAL','RENAKSI'\) NOT NULL DEFAULT 'MANUAL'/.test(sumber('docs/schema-mysql.sql')))
const MT = sumber('app/(dashboard)/kinerja/_tabs/MasterTab.tsx')
ok('B4 tab Master memasang lencana lewat dariRenaksi', MT.includes('{dariRenaksi(r) && <LencanaRenaksi tahun={tahun} />}'))
const RT = sumber('app/(dashboard)/kinerja/_tabs/RekeningTab.tsx')
ok('B5 tab Rekening: tanda baris diturunkan dari Master (tandaRantai), 3 kolom',
  RT.includes('const tanda = tandaRantai(r, masterBerasal)') && (RT.match(/tanda\.(program|kegiatan|subkegiatan) && <LencanaRenaksi/g) ?? []).length === 3)
ok('B6 …pilihan berantai bertanda dari baris yang LOLOS saringan induk',
  RT.includes('const barisKegiatan = masterOpts.kegiatanRows.filter(r => cocokInduk(r, { program: induk.program }));')
  && RT.includes('namaBertanda(barisKegiatan)') && RT.includes('namaBertanda(barisSub)')
  && RT.includes('labelOpsi(v, bertandaProgram)') && RT.includes('labelOpsi(v, bertandaKegiatan)') && RT.includes('labelOpsi(v, bertandaSub)'))

// Tanda TIDAK ikut ke Cetak / Laporan / unduhan / Salin ke LKJIP: tidak satu pun berkas di
// jalur itu boleh menyentuh pembaca tanda.
function berkas(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n)
    if (statSync(p).isDirectory()) berkas(p, out)
    else if (/\.(ts|tsx)$/.test(n)) out.push(p)
  }
  return out
}
const akar = fileURLToPath(new URL('..', import.meta.url))
const jalurCetak = [
  'app/(dashboard)/kinerja/_tabs/CetakTab.tsx', 'app/(dashboard)/kinerja/_tabs/LaporanTab.tsx',
  'app/(dashboard)/kinerja/_exports.ts', 'components/lkjip/SalinKeLkjip.tsx', 'lib/kinerja/muat-rekap.ts', 'lib/kinerja/rekap.ts',
  ...berkas(join(akar, 'lib/lkjip/sumber')).map(p => p.slice(akar.length).replace(/\\/g, '/').replace(/^\//, '')),
]
const bocor = jalurCetak.filter(p => /asal-renaksi|LencanaRenaksi|\.asal\b/.test(sumber(p)))
ok(`B7 ${jalurCetak.length} berkas Cetak/Laporan/unduhan/Salin ke LKJIP tidak membaca tanda`, bocor.length === 0, bocor.join(', '))
const MASTER_AOA = tanpaKomentar(sumber('app/(dashboard)/kinerja/_exports.ts'))
ok('B8 Excel Master tidak memuat kolom asal', !/asal/i.test(MASTER_AOA.slice(MASTER_AOA.indexOf('function masterAoa'), MASTER_AOA.indexOf('export async function exportMasterExcel'))))

// ─────────────────────────────────────────────────────────────────────────────
console.log('C. MySQL kotak pasir 2094')
const TAHUN = '2094'
const c = await mysql.createConnection({
  host: process.env.MYSQL_HOST, port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER, password: process.env.MYSQL_PASSWORD, database: process.env.MYSQL_DATABASE,
})
const q = async <T,>(s: string, p: unknown[] = []) => ((await c.query(s, p)) as [T[], unknown])[0]
const bersih = async () => {
  await c.query('DELETE FROM kinerja_master WHERE tahun = ?', [TAHUN])
  await c.query('DELETE FROM rencana_aksi WHERE tahun = ?', [Number(TAHUN)])
  // L92: kunci uji dihapus PERSIS (Edit Master mengunci versi RKO & Realisasi semua sumber).
  await c.query("DELETE FROM blud_locks WHERE entity = 'kinerja_master' AND key_id = ?", [TAHUN])
  for (const s of ['GAJI', 'BLUD', 'HARLEP', 'PROMKES', 'SARPRAS', 'OBAT', 'PEMELIHARAAN', 'PEMBANGUNAN']) {
    await c.query("DELETE FROM blud_locks WHERE entity IN ('kinerja_versi_ssk', 'kinerja_realisasi') AND key_id = ?", [`${TAHUN}:${s}`])
  }
}
await bersih()
try {
  const K = await import('../lib/data/kinerja')
  const [usr] = await q<{ id: number }>('SELECT id FROM users ORDER BY id LIMIT 1')
  const userId = Number(usr?.id ?? 0)

  const raBaris: Array<[string, string, string | null, string | null, string]> = [
    ['program', 'Program Pelayanan ***', null, null, 'I-P1'],
    ['program', 'Program Baru Renaksi ***', null, null, 'I-P2'],
    ['kegiatan', 'Program Pelayanan ***', 'Kegiatan Obat ****', null, 'I-K1'],
    ['sub-kegiatan', 'Program Pelayanan', 'Kegiatan Obat', 'Sub Beli Obat *****', 'I-S1'],
    ['sub-kegiatan', 'Program Lain', 'Kegiatan Obat', 'Sub Lain', 'I-S2'],
  ]
  for (const [level, program, kegiatan, sub, ind] of raBaris) {
    await c.query('INSERT INTO rencana_aksi (tahun, level, program, kegiatan, sub_kegiatan, indikator) VALUES (?, ?, ?, ?, ?, ?)',
      [Number(TAHUN), level, program, kegiatan, sub, ind])
  }
  // Master lama (sebelum kolom asal ada): campuran yang cocok & yang tidak.
  const lama: Array<[string, string, string | null, string | null]> = [
    ['program', 'PROGRAM PELAYANAN', null, null],            // cocok (kapital, tanpa bintang)
    ['program', 'Program Lain', null, null],                 // hanya induk sub di Renaksi → tidak
    ['program', 'Program Manual', null, null],               // tidak ada di Renaksi
    ['kegiatan', 'Kegiatan Obat ****', 'Program Pelayanan', null], // cocok
    ['kegiatan', 'Kegiatan Obat', 'Program Lain', null],     // kegiatan level-nya tidak ada di program itu
    ['kegiatan', 'Kegiatan Obat', null, null],               // induk kosong → cocok
    ['subkegiatan', 'Sub Beli Obat', 'Program Pelayanan ***', 'Kegiatan Obat'], // cocok
    ['subkegiatan', 'Sub Beli Obat', 'Program Lain', 'Kegiatan Obat'],          // induk lain → tidak
    ['subkegiatan', 'Sub Lain', 'Program Lain', 'Kegiatan Obat'],               // cocok
    ['uraian_ssk', 'Sub Lain', 'Program Lain', 'Kegiatan Obat'],                // tipe lain → tidak
  ]
  for (const [i, [tipe, nama, p, k]] of lama.entries()) {
    await c.query('INSERT INTO kinerja_master (tahun, tipe, nama, program_ref, kegiatan_ref, urut) VALUES (?, ?, ?, ?, ?, ?)', [TAHUN, tipe, nama, p, k, i + 1])
  }
  const awal = await q<{ asal: string }>('SELECT asal FROM kinerja_master WHERE tahun = ?', [TAHUN])
  ok('C1 entri lama lahir MANUAL (bawaan kolom)', awal.length === 10 && awal.every(x => x.asal === 'MANUAL'))

  const mentah = sumber('docs/migrations/migration-kinerja-master-asal.sql').replace(/\r\n/g, '\n')
  const potong = mentah.slice(mentah.indexOf('/*UJI-AWAL*/') + '/*UJI-AWAL*/'.length, mentah.indexOf('/*UJI-AKHIR*/'))
  const langkah = potong.split('\n').filter(l => !l.trim().startsWith('--')).join('\n').split(/;\s*\n/).map(s => s.trim()).filter(Boolean)
  ok('C2 tiga langkah isi awal ditemukan', langkah.length === 3 && langkah.every(s => s.includes('WHERE m.tipe = ')), String(langkah.length))
  for (const s of langkah) await c.query(s.replace('WHERE m.tipe = ', `WHERE m.tahun = '${TAHUN}' AND m.tipe = `))

  const sesudah = await q<EntriBerasal & { id: number }>('SELECT id, tipe, nama, program_ref, kegiatan_ref, subkegiatan_ref, asal FROM kinerja_master WHERE tahun = ? ORDER BY urut', [TAHUN])
  const raDb = await q<BarisRenaksi>('SELECT level, program, kegiatan, sub_kegiatan FROM rencana_aksi WHERE tahun = ?', [Number(TAHUN)])
  const harap = 'RENAKSI,MANUAL,MANUAL,RENAKSI,MANUAL,RENAKSI,RENAKSI,MANUAL,RENAKSI,MANUAL'
  ok('C3 isi awal migrasi menandai tepat entri yang jalurnya ada di Renaksi', sesudah.map(x => x.asal).join() === harap, sesudah.map(x => `${x.nama}:${x.asal}`).join(' | '))
  const beda = sesudah.filter(x => (x.asal === 'RENAKSI') !== jalurAdaDiRenaksi(x, raDb))
  ok('C4 SQL migrasi = aturan murni jalurAdaDiRenaksi di setiap entri', beda.length === 0, beda.map(x => x.nama).join(', '))

  // Init: yang baru dibuat bertanda; yang sudah ada (apa pun asalnya) tidak disentuh.
  const hasil = await K.initMasterFromRenaksi(TAHUN, userId)
  ok('C5 Init menambah entri yang belum ada', hasil.programInserted === 1 && hasil.kegiatanInserted === 0, JSON.stringify(hasil))
  const prog = await K.getMasterRows(TAHUN, 'program')
  const baru = prog.find(x => x.nama === 'Program Baru Renaksi')
  ok('C6 entri hasil Init = RENAKSI, nama tanpa bintang', baru?.asal === 'RENAKSI', JSON.stringify(baru))
  ok('C7 entri manual yang dilewati Init tetap MANUAL', prog.find(x => x.nama === 'Program Manual')?.asal === 'MANUAL')
  ok('C8 getMasterRows membawa asal di tiap baris', prog.every(x => x.asal === 'MANUAL' || x.asal === 'RENAKSI'))
  const sebelumUbah = await q<{ asal: string }>("SELECT asal FROM kinerja_master WHERE tahun = ? AND nama = 'Kegiatan Obat ****'", [TAHUN])
  const idKeg = (await q<{ id: number }>("SELECT id FROM kinerja_master WHERE tahun = ? AND nama = 'Kegiatan Obat ****'", [TAHUN]))[0].id
  const M = await import('../lib/data/kinerja-master-ubah')
  await M.ubahMasterMenjalar(Number(idKeg), { nama: 'Kegiatan Obat Ganti', program_ref: 'Program Pelayanan' }, { userId, dry: false, gabung: false })
  const sesudahUbah = await q<{ asal: string }>("SELECT asal FROM kinerja_master WHERE tahun = ? AND nama = 'Kegiatan Obat Ganti'", [TAHUN])
  ok('C9 ganti nama lewat Edit Master mempertahankan tanda (§5.1)', sebelumUbah[0]?.asal === 'RENAKSI' && sesudahUbah[0]?.asal === 'RENAKSI')

  // Tahap G — gabung mewarisi tanda (Edit Master gabung & Rapikan Bintang).
  await c.query(`INSERT INTO rencana_aksi (tahun, level, program, kegiatan, sub_kegiatan, indikator) VALUES
    (?, 'program', 'Program Rapi ***', NULL, NULL, 'G-P1'), (?, 'kegiatan', 'Program Pelayanan', 'Kegiatan Gabung', NULL, 'G-K1')`, [Number(TAHUN), Number(TAHUN)])
  await c.query(`INSERT INTO kinerja_master (tahun, tipe, nama, program_ref, urut, asal) VALUES
    (?, 'program', 'Program Rapi', NULL, 50, 'MANUAL'), (?, 'program', 'Program Rapi ***', NULL, 51, 'RENAKSI'),
    (?, 'program', 'Program Liar', NULL, 52, 'MANUAL'), (?, 'program', 'Program Liar ***', NULL, 53, 'RENAKSI'),
    (?, 'kegiatan', 'Kegiatan Gabung', 'Program Pelayanan', 54, 'MANUAL'), (?, 'kegiatan', 'Kegiatan Gabung Lama', 'Program Pelayanan', 55, 'RENAKSI')`,
    [TAHUN, TAHUN, TAHUN, TAHUN, TAHUN, TAHUN])
  const asalNama = async (nama: string) => (await q<{ asal: string }>('SELECT asal FROM kinerja_master WHERE tahun = ? AND nama = ?', [TAHUN, nama])).map(x => x.asal).join()
  await M.rapikanBintangMaster(TAHUN, { userId, dry: false })
  ok('C11 Rapikan Bintang: entri MANUAL penerima mewarisi RENAKSI', await asalNama('Program Rapi') === 'RENAKSI' && await asalNama('Program Rapi ***') === '')
  ok('C12 …tapi tidak kalau jalurnya tidak ada di Renaksi', await asalNama('Program Liar') === 'MANUAL')
  const idLama = (await q<{ id: number }>("SELECT id FROM kinerja_master WHERE tahun = ? AND nama = 'Kegiatan Gabung Lama'", [TAHUN]))[0].id
  await M.ubahMasterMenjalar(Number(idLama), { nama: 'Kegiatan Gabung' }, { userId, dry: false, gabung: true })
  ok('C13 Edit Master gabung: entri MANUAL tujuan mewarisi RENAKSI', await asalNama('Kegiatan Gabung') === 'RENAKSI' && await asalNama('Kegiatan Gabung Lama') === '')
} finally {
  await bersih()
  const sisa = await q<{ n: number }>('SELECT (SELECT COUNT(*) FROM kinerja_master WHERE tahun = ?) + (SELECT COUNT(*) FROM rencana_aksi WHERE tahun = ?) AS n', [TAHUN, Number(TAHUN)])
  ok('C10 kotak pasir 2094 bersih kembali', Number(sisa[0]?.n) === 0)
  await c.end()
}

console.log(`\n${lulus} lulus, ${gagal.length} gagal`)
if (gagal.length) { console.log(gagal.map(g => `  - ${g}`).join('\n')); process.exit(1) }
process.exit(0)
