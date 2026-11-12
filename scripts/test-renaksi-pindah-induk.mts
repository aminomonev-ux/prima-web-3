#!/usr/bin/env npx tsx
// scripts/test-renaksi-pindah-induk.mts — kegiatan / sub kegiatan yang dipindah induknya di Renaksi
// menjalar di Renaksi, tercatat, dan ditawarkan sebagai "pindah induk" di E-Anggaran & PK.
// Konsep: docs/CONCEPT-renaksi-terhubung.md Tahap H.
// Jalankan: npx tsx --env-file=.env.local scripts/test-renaksi-pindah-induk.mts (bagian D MySQL
// kotak pasir 2076, dibersihkan otomatis; tanpa --env-file GAGAL, tidak melompati).
import mysql from 'mysql2/promise'
import { rencanaGantiNama, pindahInduk, type BarisHierarki } from '../lib/renaksi/ganti-nama'
import { jenisPerubahan, kalimatPemakai } from '../lib/renaksi/pemakai'
import {
  bandingRenaksi, kalimatSpanduk, itemPindah, badanUbahMaster, indukTujuanDiBaru,
  type CatatanGanti, type EntriBanding,
} from '../lib/kinerja/banding-renaksi'
import type { BarisRenaksi } from '../lib/kinerja/asal-renaksi'
import { bandingProgramPk, terapkanSelarasProgram, kunciPilih, type BarisProgramPk } from '../lib/pk/selaras-renaksi'

let lulus = 0
const gagal: string[] = []
function ok(nama: string, syarat: unknown, ket = '') {
  if (syarat) { lulus++; console.log(`  ok  ${nama}`) }
  else { gagal.push(nama); console.log(`FAIL  ${nama}${ket ? ' — ' + ket : ''}`) }
}

console.log('A. Renaksi mengenali pindah induk')
const bh = (level: BarisHierarki['level'], program: string, kegiatan: string | null, sub: string | null): BarisHierarki =>
  ({ level, program, kegiatan, sub_kegiatan: sub, sasaran: null, tujuan: null })
const gK = rencanaGantiNama(bh('kegiatan', 'P1', 'K', null), { program: 'P2', kegiatan: 'K', sub_kegiatan: null })
ok('A1 kegiatan pindah program, nama tetap → tercatat sebagai pindah',
  !!gK && gK.dari === 'K' && gK.ke === 'K' && gK.induk === 'P1' && gK.indukBaru === 'P2' && pindahInduk(gK), JSON.stringify(gK))
ok('A2 tanpa perubahan apa pun → null', rencanaGantiNama(bh('kegiatan', 'P1', 'K', null), { program: ' P1 ', kegiatan: 'K', sub_kegiatan: null }) === null)
const gS = rencanaGantiNama(bh('sub-kegiatan', 'P1', 'K1', 'S'), { program: 'P1', kegiatan: 'K2', sub_kegiatan: 'S' })
ok('A3 sub pindah kegiatan (program tetap)', gS?.indukBaru === 'K2' && gS?.indukProgramBaru === null && gS?.indukProgram === 'P1')
const gS2 = rencanaGantiNama(bh('sub-kegiatan', 'P1', 'K1', 'S'), { program: 'P9', kegiatan: 'K1', sub_kegiatan: 'S2' })
ok('A4 sub ganti nama + pindah program sekaligus', gS2?.ke === 'S2' && gS2?.indukProgramBaru === 'P9' && gS2?.indukBaru === null)
ok('A5 ganti nama saja tetap ganti nama biasa', !pindahInduk(rencanaGantiNama(bh('kegiatan', 'P1', 'K', null), { program: 'P1', kegiatan: 'K2', sub_kegiatan: null })!))
ok('A6 induk baru kosong bukan pindah', rencanaGantiNama(bh('kegiatan', 'P1', 'K', null), { program: '', kegiatan: 'K', sub_kegiatan: null }) === null)
const gKosong = rencanaGantiNama(bh('kegiatan', 'P1', 'K', null), { program: '', kegiatan: 'K2', sub_kegiatan: null })
ok('A6b ganti nama dengan isian induk kosong: induk TIDAK dikosongkan (null, bukan "")', gKosong?.ke === 'K2' && gKosong?.indukBaru === null, JSON.stringify(gKosong))
ok('A7 program pindah sasaran tidak dicatat sebagai pindah (tak disalin modul lain)',
  rencanaGantiNama({ ...bh('program', 'P1', null, null), sasaran: 'S1' }, { program: 'P1', kegiatan: null, sub_kegiatan: null }) === null)
ok('A8 jenis & kalimat keterangan pemakai',
  jenisPerubahan(gK!) === 'induk' && jenisPerubahan(gS2!) === 'nama-induk'
  && kalimatPemakai([{ modul: 'PK', tempat: 'Master Program', jumlah: 1 }], 'induk')!.startsWith('Induk lama masih dipakai di PK'))

console.log('B. Pembanding E-Anggaran')
const e = (id: number, tipe: EntriBanding['tipe'], nama: string, p: string | null = null, kg: string | null = null, asal: 'MANUAL' | 'RENAKSI' = 'RENAKSI'): EntriBanding =>
  ({ id, tipe, nama, program_ref: p, kegiatan_ref: kg, subkegiatan_ref: null, asal })
const ra = (level: string, program: string, kegiatan: string | null = null, sub: string | null = null): BarisRenaksi => ({ level, program, kegiatan, sub_kegiatan: sub })
const cK = (dari: string, ke: string, induk: string, induk_baru: string | null = null): CatatanGanti =>
  ({ level: 'kegiatan', dari, ke, induk, induk_program: null, induk_baru })
const master1 = [e(1, 'program', 'P1'), e(2, 'program', 'P2'), e(3, 'kegiatan', 'K', 'P1'), e(4, 'subkegiatan', 'S', 'P1', 'K'), e(5, 'program', 'P3'), e(6, 'kegiatan', 'K', 'P3')]
const renaksi1 = [ra('program', 'P1'), ra('program', 'P2 ***'), ra('program', 'P3'), ra('kegiatan', 'P2 ***', 'K ****'), ra('sub-kegiatan', 'P2', 'K', 'S'), ra('kegiatan', 'P3', 'K')]
const h1 = bandingRenaksi(master1, renaksi1, [cK('K', 'K', 'P1', 'P2 ***')])
ok('B1 kegiatan dipindah → satu item pindah induk ke program tujuan (ejaan Master)',
  h1.gantiNama.length === 1 && h1.gantiNama[0].id === 3 && h1.gantiNama[0].program_ke === 'P2' && itemPindah(h1.gantiNama[0]), JSON.stringify(h1.gantiNama))
ok('B2 sub di bawahnya ikut (tidak disebut sendiri, tidak "baru"), kegiatan senama di program lain diam',
  h1.baru.length === 0 && h1.hilang.length === 0, JSON.stringify(h1))
ok('B3 spanduk menyebut pindah induk terpisah dari ganti nama', kalimatSpanduk(h1, 2076) === 'Rencana Aksi 2076 berbeda dari Master: 1 pindah induk.')
ok('B4 badan Edit Master membawa induk tujuan', JSON.stringify(badanUbahMaster(h1.gantiNama[0])) === '{"nama":"K","program_ref":"P2"}')
const renaksiChain = [ra('program', 'P1'), ra('program', 'P2'), ra('kegiatan', 'P2', 'K2')]
const hPindahGanti = bandingRenaksi([e(1, 'program', 'P1'), e(2, 'program', 'P2'), e(3, 'kegiatan', 'K', 'P1')], renaksiChain,
  [cK('K', 'K', 'P1', 'P2'), cK('K', 'K2', 'P2')])
ok('B5 pindah LALU ganti nama → (P1,K) jadi (P2,K2)', hPindahGanti.gantiNama[0]?.ke === 'K2' && hPindahGanti.gantiNama[0]?.program_ke === 'P2' && hPindahGanti.baru.length === 0, JSON.stringify(hPindahGanti))
const hGantiPindah = bandingRenaksi([e(1, 'program', 'P1'), e(2, 'program', 'P2'), e(3, 'kegiatan', 'K', 'P1')], renaksiChain,
  [cK('K', 'K2', 'P1'), cK('K2', 'K2', 'P1', 'P2')])
ok('B6 ganti nama LALU pindah → sama', hGantiPindah.gantiNama[0]?.ke === 'K2' && hGantiPindah.gantiNama[0]?.program_ke === 'P2' && hGantiPindah.baru.length === 0, JSON.stringify(hGantiPindah))
const hProgGanti = bandingRenaksi([e(1, 'program', 'P1'), e(2, 'program', 'P2'), e(3, 'kegiatan', 'K', 'P1')],
  [ra('program', 'P1'), ra('program', 'P2 Baru'), ra('kegiatan', 'P2 Baru', 'K')],
  [cK('K', 'K', 'P1', 'P2'), { level: 'program', dari: 'P2', ke: 'P2 Baru', induk: null, induk_program: null }])
ok('B7 program tujuan berganti nama sesudahnya → tujuan = nama baru yang juga ditawarkan',
  hProgGanti.gantiNama.length === 2 && hProgGanti.gantiNama.find(g => g.id === 3)?.program_ke === 'P2 Baru', JSON.stringify(hProgGanti.gantiNama))
const hSub = bandingRenaksi([e(1, 'program', 'P1'), e(2, 'kegiatan', 'K1', 'P1'), e(3, 'kegiatan', 'K2', 'P1'), e(4, 'subkegiatan', 'S', 'P1', 'K1')],
  [ra('program', 'P1'), ra('kegiatan', 'P1', 'K1'), ra('kegiatan', 'P1', 'K2'), ra('sub-kegiatan', 'P1', 'K2', 'S')],
  [{ level: 'sub-kegiatan', dari: 'S', ke: 'S', induk: 'K1', induk_program: 'P1', induk_baru: 'K2', induk_program_baru: null }])
ok('B8 sub dipindah ke kegiatan lain', hSub.gantiNama.length === 1 && hSub.gantiNama[0].kegiatan_ke === 'K2' && hSub.gantiNama[0].program_ke === 'P1' && hSub.baru.length === 0, JSON.stringify(hSub))
const hBaru = bandingRenaksi([e(1, 'program', 'P1'), e(3, 'kegiatan', 'K', 'P1')], [ra('program', 'P1'), ra('program', 'P Baru ***'), ra('kegiatan', 'P Baru', 'K')], [cK('K', 'K', 'P1', 'P Baru ***')])
ok('B9 tujuan belum ada di Master → menunggu daftar Baru (ejaan Init, tanpa bintang)',
  hBaru.gantiNama[0]?.program_ke === 'P Baru' && indukTujuanDiBaru(hBaru.gantiNama[0], hBaru.baru) && hBaru.baru.map(b => b.nama).join() === 'P Baru', JSON.stringify(hBaru))
ok('B10 tujuan sudah ada → tidak menunggu', !indukTujuanDiBaru(h1.gantiNama[0], h1.baru))
const hManual = bandingRenaksi([e(1, 'program', 'P1'), e(2, 'program', 'P2'), e(3, 'kegiatan', 'K', 'P1', null, 'MANUAL')], [ra('program', 'P1'), ra('program', 'P2'), ra('kegiatan', 'P2', 'K')], [cK('K', 'K', 'P1', 'P2')])
ok('B11 entri MANUAL tidak dipindah (hanya yang bertanda Renaksi)', hManual.gantiNama.length === 0)
const hEjaan = bandingRenaksi([e(1, 'program', 'P1'), e(2, 'program', 'PROGRAM TUJUAN'), e(3, 'kegiatan', 'K', 'P1')],
  [ra('program', 'P1'), ra('program', 'Program Tujuan ***'), ra('kegiatan', 'Program Tujuan ***', 'K')], [cK('K', 'K', 'P1', 'Program Tujuan ***')])
ok('B12 ejaan Master dipakai (Edit Master mencocokkan induk persis)', hEjaan.gantiNama[0]?.program_ke === 'PROGRAM TUJUAN', JSON.stringify(hEjaan.gantiNama))

console.log('C. PK Master Program (berhenti di form)')
const pk: BarisProgramPk[] = [
  { program: 'P1', kegiatan: null, subkegiatan: null, level: 'program', asal: 'RENAKSI' },
  { program: 'P2', kegiatan: null, subkegiatan: null, level: 'program', asal: 'RENAKSI' },
  { program: 'P1', kegiatan: 'K', subkegiatan: null, level: 'kegiatan', asal: 'RENAKSI' },
  { program: 'P1', kegiatan: 'K', subkegiatan: 'S', level: 'subkegiatan', asal: 'RENAKSI' },
]
const hPk = bandingProgramPk(pk, [ra('program', 'P1'), ra('program', 'P2'), ra('kegiatan', 'P2', 'K'), ra('sub-kegiatan', 'P2', 'K', 'S')], [cK('K', 'K', 'P1', 'P2')])
const pkBaru = terapkanSelarasProgram(pk, hPk, new Set(hPk.gantiNama.map(g => kunciPilih.ganti(g.id))), b => b)
ok('C1 kegiatan & sub-nya pindah ke program tujuan di layar', pkBaru[2].program === 'P2' && pkBaru[3].program === 'P2' && pkBaru[3].kegiatan === 'K' && pkBaru[0] === pk[0], JSON.stringify(pkBaru))
ok('C2 sesudah diterapkan, pembanding bersih', bandingProgramPk(pkBaru, [ra('program', 'P1'), ra('program', 'P2'), ra('kegiatan', 'P2', 'K'), ra('sub-kegiatan', 'P2', 'K', 'S')], [cK('K', 'K', 'P1', 'P2')]).gantiNama.length === 0)
const pkSub = terapkanSelarasProgram(
  [pk[0], { ...pk[2] }, { program: 'P1', kegiatan: 'K2', subkegiatan: null, level: 'kegiatan', asal: 'RENAKSI' }, { ...pk[3] }],
  { gantiNama: [{ id: 4, tipe: 'subkegiatan', nama: 'S', program_ref: 'P1', kegiatan_ref: 'K', ke: 'S', program_ke: 'P1', kegiatan_ke: 'K2' }], baru: [], hilang: [], belumBertanda: [] },
  new Set([kunciPilih.ganti(4)]), b => b)
ok('C3 sub pindah kegiatan di layar', pkSub[3].kegiatan === 'K2' && pkSub[3].program === 'P1')

console.log('E. Sambungan dialog E-Anggaran')
const { readFileSync } = await import('node:fs')
const DLG = readFileSync(new URL('../components/kinerja/PerbaruiRenaksi.tsx', import.meta.url), 'utf8')
const TERAP = DLG.slice(DLG.indexOf('async function terapkan'), DLG.indexOf('const ringkas = ['))
ok('E1 pindah induk diterapkan SESUDAH entri baru dibuat (tujuan bisa entri baru)',
  TERAP.indexOf("'/api/kinerja/master/init-renaksi'") > 0
  && TERAP.indexOf('for (const g of daftar.filter(itemPindah))') > TERAP.indexOf("'/api/kinerja/master/init-renaksi'")
  && TERAP.indexOf('for (const g of daftar.filter(x => !itemPindah(x)))') < TERAP.indexOf("'/api/kinerja/master/init-renaksi'"))
ok('E2 item yang menunggu induk baru tidak dimatikan', DLG.includes('mati: !menunggu && !!p && !p.ok'))

console.log('D. Ujung-ke-ujung (MySQL kotak pasir 2076)')
const TAHUN = 2076
const c = await mysql.createConnection({
  host: process.env.MYSQL_HOST, port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER, password: process.env.MYSQL_PASSWORD, database: process.env.MYSQL_DATABASE,
})
const q = async <T,>(s: string, p: unknown[] = []) => ((await c.query(s, p)) as [T[], unknown])[0]
const bersihkan = async () => {
  await c.query('DELETE FROM iki_dokumen WHERE tahun = ?', [String(TAHUN)])
  await c.query('DELETE FROM rencana_aksi WHERE tahun = ?', [TAHUN])
  await c.query('DELETE FROM renaksi_ganti_nama WHERE tahun = ?', [TAHUN])
  await c.query('DELETE FROM kinerja_master WHERE tahun = ?', [String(TAHUN)])
  await c.query("DELETE FROM blud_locks WHERE entity = 'kinerja_master' AND key_id = ?", [String(TAHUN)])
  for (const s of ['GAJI', 'BLUD', 'HARLEP', 'PROMKES', 'SARPRAS', 'OBAT', 'PEMELIHARAAN', 'PEMBANGUNAN']) {
    await c.query("DELETE FROM blud_locks WHERE entity IN ('kinerja_versi_ssk', 'kinerja_realisasi') AND key_id = ?", [`${TAHUN}:${s}`])
  }
}
await bersihkan()
try {
  const RA = await import('../lib/data/rencana-aksi')
  const M = await import('../lib/data/kinerja-master-ubah')
  const [usr] = await q<{ id: number }>('SELECT id FROM users ORDER BY id LIMIT 1')
  const uid = Number(usr?.id ?? 0)
  const dasar = { tahun: TAHUN, satuan: 'Dokumen', jenis: 'Akumulatif' as const, target_rpjmd: 0, target_tahunan: 0, q1_target: 0, q2_target: 0, q3_target: 0, q4_target: 0 }
  const isi = (level: 'program' | 'kegiatan' | 'sub-kegiatan', program: string, kegiatan: string | null, sub: string | null, indikator: string) =>
    RA.upsertRencanaAksi({ ...dasar, level, program, kegiatan, sub_kegiatan: sub, indikator }, uid)
  await isi('program', 'PRG ASAL ***', null, null, 'H-P1')
  await isi('program', 'PRG TUJUAN ***', null, null, 'H-P2')
  await isi('program', 'PRG LAIN ***', null, null, 'H-P3')
  const idK1 = await isi('kegiatan', 'PRG ASAL ***', 'KEG PINDAH ****', null, 'H-K1')
  await isi('kegiatan', 'PRG ASAL ***', 'KEG PINDAH ****', null, 'H-K2')
  await isi('sub-kegiatan', 'PRG ASAL ***', 'KEG PINDAH ****', 'SUB DI K *****', 'H-S1')
  await isi('kegiatan', 'PRG LAIN ***', 'KEG PINDAH ****', null, 'H-K3')
  await c.query(`INSERT INTO kinerja_master (tahun, tipe, nama, program_ref, kegiatan_ref, urut, asal) VALUES
    (?, 'program', 'PRG ASAL', NULL, NULL, 1, 'RENAKSI'), (?, 'program', 'PRG TUJUAN', NULL, NULL, 2, 'RENAKSI'), (?, 'program', 'PRG LAIN', NULL, NULL, 3, 'RENAKSI'),
    (?, 'kegiatan', 'KEG PINDAH', 'PRG ASAL', NULL, 4, 'RENAKSI'), (?, 'kegiatan', 'KEG PINDAH', 'PRG LAIN', NULL, 5, 'RENAKSI'),
    (?, 'subkegiatan', 'SUB DI K', 'PRG ASAL', 'KEG PINDAH', 6, 'RENAKSI')`, Array(6).fill(String(TAHUN)))
  ok('D0 awal: Master sama dengan Renaksi', (await M.bandingMasterRenaksi(String(TAHUN))).gantiNama.length === 0)

  const r = (await q<{ version: number }>('SELECT version FROM rencana_aksi WHERE id = ?', [idK1]))[0]
  const info: { gantiNama: import('../lib/renaksi/ganti-nama').GantiNama | null } = { gantiNama: null }
  await RA.upsertRencanaAksi({ ...dasar, id: idK1, expected_version: r.version, level: 'kegiatan', program: 'PRG TUJUAN ***', kegiatan: 'KEG PINDAH ****', sub_kegiatan: null, indikator: 'H-K1' }, uid, info)
  const baris = await q<{ indikator: string; program: string; kegiatan: string | null }>('SELECT indikator, program, kegiatan FROM rencana_aksi WHERE tahun = ? AND indikator LIKE ? ORDER BY indikator', [TAHUN, 'H-%'])
  const prog = (ind: string) => baris.find(b => b.indikator === ind)?.program
  ok('D1 Renaksi: baris indikator SAUDARA ikut pindah (entitas tidak terbelah)', prog('H-K1') === 'PRG TUJUAN ***' && prog('H-K2') === 'PRG TUJUAN ***', JSON.stringify(baris))
  ok('D2 Renaksi: sub kegiatan di bawahnya ikut pindah', prog('H-S1') === 'PRG TUJUAN ***')
  ok('D3 Renaksi: kegiatan senama di program lain tidak ikut', prog('H-K3') === 'PRG LAIN ***')
  const cat = await RA.listGantiNama(TAHUN)
  ok('D4 tercatat: kegiatan, nama tetap, induk lama → baru', cat.length === 1 && cat[0].level === 'kegiatan' && cat[0].dari === cat[0].ke
    && cat[0].induk === 'PRG ASAL ***' && cat[0].induk_baru === 'PRG TUJUAN ***' && info.gantiNama?.indukBaru === 'PRG TUJUAN ***', JSON.stringify(cat))

  const h = await M.bandingMasterRenaksi(String(TAHUN))
  const item = h.gantiNama[0]
  ok('D5 E-Anggaran: satu "pindah induk", tanpa hilang/baru palsu', h.gantiNama.length === 1 && item.program_ke === 'PRG TUJUAN' && h.hilang.length === 0 && h.baru.length === 0, JSON.stringify(h))
  await M.ubahMasterMenjalar(item.id, badanUbahMaster(item), { userId: uid, dry: false, gabung: false })
  const mst = await q<{ tipe: string; nama: string; program_ref: string | null; kegiatan_ref: string | null }>(
    "SELECT tipe, nama, program_ref, kegiatan_ref FROM kinerja_master WHERE tahun = ? AND tipe IN ('kegiatan','subkegiatan') ORDER BY urut", [String(TAHUN)])
  ok('D6 Edit Master memindah kegiatan & sub-nya; kegiatan senama di program lain tetap',
    mst.map(m => `${m.tipe}:${m.program_ref}/${m.kegiatan_ref ?? ''}/${m.nama}`).join() === 'kegiatan:PRG TUJUAN//KEG PINDAH,kegiatan:PRG LAIN//KEG PINDAH,subkegiatan:PRG TUJUAN/KEG PINDAH/SUB DI K', JSON.stringify(mst))
  const sesudah = await M.bandingMasterRenaksi(String(TAHUN))
  ok('D7 sesudah diterapkan, pemberitahuan hilang sendiri', sesudah.gantiNama.length + sesudah.baru.length + sesudah.hilang.length === 0, JSON.stringify(sesudah))

  // Keterangan pemakai (Tahap F): pindah saja tidak mengubah kartu IKI; ganti nama + pindah dicari di induk BARU.
  const { pemakaiNamaRenaksi } = await import('../lib/data/renaksi-pemakai')
  const [dok] = await c.query(`INSERT INTO iki_dokumen (tahun, nama, nip, jabatan, status) VALUES (?, 'Uji', '0', 'Jab H', 'DRAFT')`, [String(TAHUN)]) as unknown as [{ insertId: number }]
  await c.query(`INSERT INTO iki_rhk (dokumen_id, no_urut, rhk, indikator, renaksi_id) VALUES (?, 1, 'KEG PINDAH', 'H-K1', ?)`, [dok.insertId, idK1])
  const pIki = (p: Awaited<ReturnType<typeof pemakaiNamaRenaksi>>) => p.find(x => x.modul === 'IKI')?.jumlah
  ok('D9 pindah saja: kartu IKI tidak dihitung', pIki(await pemakaiNamaRenaksi(TAHUN, info.gantiNama!)) === 0)
  const r2 = (await q<{ version: number }>('SELECT version FROM rencana_aksi WHERE id = ?', [idK1]))[0]
  const info2: typeof info = { gantiNama: null }
  await RA.upsertRencanaAksi({ ...dasar, id: idK1, expected_version: r2.version, level: 'kegiatan', program: 'PRG LAIN ***', kegiatan: 'KEG BARU ****', sub_kegiatan: null, indikator: 'H-K1' }, uid, info2)
  ok('D10 ganti nama + pindah: kartu IKI dicari di induk BARU', pIki(await pemakaiNamaRenaksi(TAHUN, info2.gantiNama!)) === 1, JSON.stringify(info2.gantiNama))

  // Sub kegiatan dipindah ke kegiatan lain: baris indikator saudaranya ikut.
  const idS = await isi('sub-kegiatan', 'PRG LAIN ***', 'KEG PINDAH ****', 'SUB DUA *****', 'H-S2')
  await isi('sub-kegiatan', 'PRG LAIN ***', 'KEG PINDAH ****', 'SUB DUA *****', 'H-S3')
  const vS = (await q<{ version: number }>('SELECT version FROM rencana_aksi WHERE id = ?', [idS]))[0]
  await RA.upsertRencanaAksi({ ...dasar, id: idS, expected_version: vS.version, level: 'sub-kegiatan', program: 'PRG LAIN ***', kegiatan: 'KEG BARU ****', sub_kegiatan: 'SUB DUA *****', indikator: 'H-S2' }, uid)
  const sub = await q<{ kegiatan: string }>("SELECT kegiatan FROM rencana_aksi WHERE tahun = ? AND indikator IN ('H-S2','H-S3')", [TAHUN])
  ok('D11 Renaksi: sub pindah kegiatan, baris saudaranya ikut', sub.length === 2 && sub.every(s => s.kegiatan === 'KEG BARU ****'), JSON.stringify(sub))
  const catSub = (await RA.listGantiNama(TAHUN)).find(x => x.level === 'sub-kegiatan')
  ok('D12 …tercatat dengan kegiatan & program lama, kegiatan baru', catSub?.induk === 'KEG PINDAH ****' && catSub?.induk_program === 'PRG LAIN ***'
    && catSub?.induk_baru === 'KEG BARU ****' && catSub?.induk_program_baru === null, JSON.stringify(catSub))
} finally {
  await bersihkan()
  const [s] = await q<{ n: number }>(`SELECT (SELECT COUNT(*) FROM rencana_aksi WHERE tahun = ?) + (SELECT COUNT(*) FROM renaksi_ganti_nama WHERE tahun = ?)
    + (SELECT COUNT(*) FROM kinerja_master WHERE tahun = ?) AS n`, [TAHUN, TAHUN, String(TAHUN)])
  ok('D8 kotak pasir 2076 bersih kembali', Number(s.n) === 0)
  await c.end()
}

console.log(`\n${lulus} lulus, ${gagal.length} gagal`)
if (gagal.length) { console.log(gagal.map(g => `  - ${g}`).join('\n')); process.exit(1) }
process.exit(0)
