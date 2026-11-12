#!/usr/bin/env npx tsx
// scripts/test-kinerja-banding-renaksi.mts — pemberitahuan "Rencana Aksi berubah" & Perbarui di
// Master E-Anggaran. Konsep: docs/CONCEPT-renaksi-terhubung.md §5.3–5.5 (Tahap C).
// Jalankan: npx tsx --env-file=.env.local scripts/test-kinerja-banding-renaksi.mts
// Bagian C memakai MySQL sungguhan (kotak pasir 2094) lewat fungsi aplikasi yang sama dengan
// dialog; dibersihkan otomatis. Tanpa --env-file bagian itu GAGAL.
import { readFileSync } from 'node:fs'
import mysql from 'mysql2/promise'
import {
  bandingRenaksi, jumlahPerubahan, kalimatSpanduk, kunciJalur, lengkapiIndukPilihan, ketikanAdaDiRenaksi, kalimatKetikanRenaksi,
  type EntriBanding, type CatatanGanti,
} from '../lib/kinerja/banding-renaksi'
import type { BarisRenaksi } from '../lib/kinerja/asal-renaksi'

let lulus = 0
const gagal: string[] = []
function ok(nama: string, syarat: unknown, ket = '') {
  if (syarat) { lulus++; console.log(`  ok  ${nama}`) }
  else { gagal.push(nama); console.log(`FAIL  ${nama}${ket ? ' — ' + ket : ''}`) }
}
const sumber = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')

let id = 0
const m = (tipe: EntriBanding['tipe'], nama: string, asal: 'MANUAL' | 'RENAKSI', p: string | null = null, k: string | null = null): EntriBanding =>
  ({ id: ++id, tipe, nama, asal, program_ref: p, kegiatan_ref: k, subkegiatan_ref: null })
const ra = (level: string, program: string, kegiatan: string | null = null, sub: string | null = null): BarisRenaksi =>
  ({ level, program, kegiatan, sub_kegiatan: sub })
const cat = (level: string, dari: string, ke: string, induk: string | null = null, induk_program: string | null = null): CatatanGanti =>
  ({ level, dari, ke, induk, induk_program })
const ringkas = (xs: { tipe: string; nama: string; ke?: string }[]) => xs.map(x => `${x.tipe}:${x.nama}${x.ke ? `>${x.ke}` : ''}`).join(' | ')

// ─────────────────────────────────────────────────────────────────────────────
console.log('A. Pembanding')
{
  const master = [m('program', 'P', 'RENAKSI'), m('kegiatan', 'K', 'RENAKSI', 'P'), m('subkegiatan', 'S', 'RENAKSI', 'P', 'K')]
  const sama = bandingRenaksi(master, [ra('program', 'P ***'), ra('kegiatan', 'P', 'K ****'), ra('sub-kegiatan', 'P', 'K', 'S')], [])
  ok('A1 Master = Renaksi (penanda diabaikan) → tidak ada perubahan', jumlahPerubahan(sama) === 0 && sama.belumBertanda.length === 0, JSON.stringify(sama))

  // Program berganti nama di Renaksi; kegiatan & sub ikut (jalar Renaksi) → hanya program yang disebut.
  const h = bandingRenaksi(master,
    [ra('program', 'P2 ***'), ra('kegiatan', 'P2', 'K'), ra('sub-kegiatan', 'P2', 'K', 'S')],
    [cat('program', 'P ***', 'P2 ***', 'SAS')])
  ok('A2 ganti nama program dikenali; keturunannya ikut, tidak disebut sendiri',
    ringkas(h.gantiNama) === 'program:P>P2' && h.baru.length === 0 && h.hilang.length === 0, `${ringkas(h.gantiNama)} / baru ${ringkas(h.baru)} / hilang ${ringkas(h.hilang)}`)
  ok('A3 nama tujuan ditulis TANPA penanda', h.gantiNama[0]?.ke === 'P2')

  // Rantai: A → B lalu B → C = A → C. Kegiatan berganti nama SESUDAH programnya.
  const h2 = bandingRenaksi(master,
    [ra('program', 'P3'), ra('kegiatan', 'P3', 'K2'), ra('sub-kegiatan', 'P3', 'K2', 'S')],
    [cat('program', 'P', 'PX'), cat('program', 'PX', 'P3'), cat('kegiatan', 'K', 'K2', 'P3')])
  ok('A4 rantai A→B→C terbaca A→C; kegiatan dicatat di bawah program BARU tetap cocok',
    ringkas(h2.gantiNama) === 'program:P>P3 | kegiatan:K>K2' && jumlahPerubahan(h2) === 2, `${ringkas(h2.gantiNama)} / ${ringkas(h2.baru)} / ${ringkas(h2.hilang)}`)
  // Kegiatan berganti nama SEBELUM programnya (induk di catatan = nama program lama).
  const h3 = bandingRenaksi(master,
    [ra('program', 'P3'), ra('kegiatan', 'P3', 'K2'), ra('sub-kegiatan', 'P3', 'K2', 'S')],
    [cat('kegiatan', 'K', 'K2', 'P'), cat('program', 'P', 'P3')])
  ok('A5 urutan sebaliknya (kegiatan dulu) memberi hasil yang sama', ringkas(h3.gantiNama) === 'program:P>P3 | kegiatan:K>K2' && jumlahPerubahan(h3) === 2, ringkas(h3.gantiNama))

  const h4 = bandingRenaksi(master, [ra('program', 'P'), ra('kegiatan', 'P', 'K'), ra('sub-kegiatan', 'P', 'K', 'S')],
    [cat('program', 'P', 'Q'), cat('program', 'Q', 'P')])
  ok('A6 A→B→A saling meniadakan', jumlahPerubahan(h4) === 0)

  // Kegiatan senama di program lain: ganti nama kegiatan di program X tidak menyentuh K di P.
  const h5 = bandingRenaksi([...master, m('program', 'X', 'RENAKSI'), m('kegiatan', 'K', 'RENAKSI', 'X')],
    [ra('program', 'P'), ra('kegiatan', 'P', 'K'), ra('sub-kegiatan', 'P', 'K', 'S'), ra('program', 'X'), ra('kegiatan', 'X', 'K baru')],
    [cat('kegiatan', 'K', 'K baru', 'X')])
  ok('A7 kegiatan senama di program lain tidak ikut', ringkas(h5.gantiNama) === 'kegiatan:K>K baru' && h5.gantiNama[0].program_ref === 'X' && jumlahPerubahan(h5) === 1, ringkas(h5.gantiNama))

  // Sub kegiatan berganti nama.
  const h6 = bandingRenaksi(master, [ra('program', 'P'), ra('kegiatan', 'P', 'K'), ra('sub-kegiatan', 'P', 'K', 'S2 *****')],
    [cat('sub-kegiatan', 'S', 'S2 *****', 'K', 'P')])
  ok('A8 sub kegiatan berganti nama (lingkup program + kegiatan)', ringkas(h6.gantiNama) === 'subkegiatan:S>S2', ringkas(h6.gantiNama))

  // Hilang: entri ber-asal Renaksi yang jalurnya tidak ada lagi & bukan ganti nama. Induk mewakili keturunan.
  const h7 = bandingRenaksi(master, [ra('program', 'Lain')], [])
  ok('A9 program hilang → hanya program yang disebut (keturunannya diwakili)', ringkas(h7.hilang) === 'program:P' && ringkas(h7.baru) === 'program:Lain', `${ringkas(h7.hilang)} / ${ringkas(h7.baru)}`)
  const h8 = bandingRenaksi(master, [ra('program', 'P'), ra('kegiatan', 'P', 'K')], [])
  ok('A10 sub hilang sendirian → sub disebut', ringkas(h8.hilang) === 'subkegiatan:S')

  // Entri manual tidak pernah "hilang" maupun "berganti nama".
  const manual = [m('program', 'P', 'MANUAL'), m('kegiatan', 'Ketik', 'MANUAL', 'P')]
  const h9 = bandingRenaksi(manual, [ra('program', 'P2')], [cat('program', 'P', 'P2')])
  ok('A11 entri MANUAL tidak diganti nama / tidak hilang; Renaksi baru tetap "baru"',
    h9.gantiNama.length === 0 && h9.hilang.length === 0 && ringkas(h9.baru) === 'program:P2', `${ringkas(h9.gantiNama)} / ${ringkas(h9.hilang)} / ${ringkas(h9.baru)}`)
  const h10 = bandingRenaksi(manual, [ra('program', 'P ***'), ra('kegiatan', 'P', 'Ketik')], [])
  ok('A12 entri manual yang jalurnya ada di Renaksi → "belum bertanda", tanpa spanduk',
    ringkas(h10.belumBertanda) === 'program:P | kegiatan:Ketik' && jumlahPerubahan(h10) === 0)

  // Baru: entri yang AKAN ada sesudah ganti nama tidak disebut "baru".
  const h11 = bandingRenaksi(master, [ra('program', 'P2'), ra('kegiatan', 'P2', 'K'), ra('kegiatan', 'P2', 'K baru'), ra('sub-kegiatan', 'P2', 'K', 'S')],
    [cat('program', 'P', 'P2')])
  ok('A13 baru = yang belum ada SESUDAH ganti nama diterapkan', ringkas(h11.baru) === 'kegiatan:K baru' && h11.baru[0].program_ref === 'P2', ringkas(h11.baru))

  // Tujuan ganti nama sudah ada di Master (Init dijalankan sesudah Renaksi berganti nama).
  const h12 = bandingRenaksi([...master, m('program', 'P2', 'RENAKSI')], [ra('program', 'P2'), ra('kegiatan', 'P2', 'K'), ra('sub-kegiatan', 'P2', 'K', 'S')],
    [cat('program', 'P', 'P2')])
  ok('A14 tujuan sudah ada di Master → tetap "berganti nama" (dialog menggabung), bukan "baru"', ringkas(h12.gantiNama) === 'program:P>P2' && h12.baru.length === 0)

  // Master kosong: semuanya baru (spanduk yang sama).
  const h13 = bandingRenaksi([], [ra('program', 'P'), ra('kegiatan', 'P', 'K'), ra('sub-kegiatan', 'P', 'K', 'S')], [])
  ok('A15 Master kosong → semua terbaca baru', ringkas(h13.baru) === 'program:P | kegiatan:K | subkegiatan:S')
  ok('A16 kalimat spanduk', kalimatSpanduk({ ...h, baru: h13.baru, hilang: h7.hilang }, 2026) === 'Rencana Aksi 2026 berbeda dari Master: 1 berganti nama, 3 baru, 1 tidak ada lagi.', kalimatSpanduk({ ...h, baru: h13.baru, hilang: h7.hilang }, 2026))
  ok('A17 uraian SSK & sumber anggaran diabaikan', jumlahPerubahan(bandingRenaksi([m('uraian_ssk', 'U', 'RENAKSI')], [], [])) === 0)

  // Pilihan "baru" dilengkapi induknya.
  const pil = lengkapiIndukPilihan([kunciJalur('subkegiatan', 'S', 'P', 'K')], h13.baru)
  ok('A18 memilih sub baru ikut membawa kegiatan & program barunya', pil.size === 3)
  // Nama lama dipakai lagi di Renaksi sesudah diganti: entrinya masih ada, jadi bukan ganti nama.
  const h14 = bandingRenaksi(master, [ra('program', 'P'), ra('program', 'P2'), ra('kegiatan', 'P', 'K'), ra('sub-kegiatan', 'P', 'K', 'S')],
    [cat('program', 'P', 'P2')])
  ok('A20 jalur yang masih ada di Renaksi tidak dibaca berganti nama walau ada catatannya',
    h14.gantiNama.length === 0 && ringkas(h14.baru) === 'program:P2', `${ringkas(h14.gantiNama)} / ${ringkas(h14.baru)}`)
  // Entri manual tidak diganti nama oleh dialog → nama baru Renaksi tetap terbaca "baru".
  const h15 = bandingRenaksi([m('program', 'P', 'RENAKSI'), m('kegiatan', 'K', 'MANUAL', 'P')],
    [ra('program', 'P'), ra('kegiatan', 'P', 'K2')], [cat('kegiatan', 'K', 'K2', 'P')])
  ok('A21 kegiatan MANUAL tidak diproyeksikan ke nama baru → nama baru Renaksi = "baru"',
    h15.gantiNama.length === 0 && ringkas(h15.baru) === 'kegiatan:K2' && h15.belumBertanda.length === 0, `${ringkas(h15.gantiNama)} / ${ringkas(h15.baru)}`)
  ok('A19 kunci jalur mengabaikan penanda & huruf besar-kecil', kunciJalur('kegiatan', 'Keg ****', 'PROG ***', null) === kunciJalur('kegiatan', 'keg', 'prog', null))
}

// Saat Simpan di Master: entri ketikan yang jalurnya sudah ada di Renaksi ditanyakan.
{
  const baru = bandingRenaksi([m('program', 'P', 'RENAKSI')],
    [ra('program', 'P'), ra('program', 'Program Gizi ***'), ra('kegiatan', 'P', 'Kegiatan Dapur ****'), ra('kegiatan', 'Program Gizi', 'Kegiatan Dapur')], []).baru
  const ketik = [
    { tipe: 'program' as const, nama: 'PROGRAM GIZI', program_ref: null, kegiatan_ref: null },
    { tipe: 'kegiatan' as const, nama: 'kegiatan dapur', program_ref: 'P', kegiatan_ref: null },
    { tipe: 'kegiatan' as const, nama: 'Kegiatan Dapur', program_ref: 'Program Lain', kegiatan_ref: null },
    { tipe: 'program' as const, nama: 'Program Giz', program_ref: null, kegiatan_ref: null },
    { tipe: 'uraian_ssk' as const, nama: 'Program Gizi', program_ref: null, kegiatan_ref: null },
  ]
  const cocok = ketikanAdaDiRenaksi(ketik, baru)
  ok('A22 ketikan cocok Renaksi: beda kapital/penanda dikenali, induk lain/salah ketik/uraian SSK tidak',
    [...cocok.keys()].join() === '0,1' && cocok.get(0)?.nama === 'Program Gizi' && cocok.get(1)?.nama === 'Kegiatan Dapur', [...cocok.keys()].join())
  const kal = kalimatKetikanRenaksi([{ ketikan: 'PROGRAM GIZI', renaksi: cocok.get(0)! }], 2026)
  ok('A23 kalimat menyebut ejaan Renaksi bila berbeda', kal.startsWith('Entri ini sudah ada di Rencana Aksi 2026:') && kal.includes('PROGRAM GIZI (di Rencana Aksi: Program Gizi)'), kal)
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('B. Sambungan kode')
const KIN = sumber('lib/data/kinerja.ts')
ok('B1 Init memakai kunci jalur & pelengkap induk yang SAMA dengan pembanding',
  KIN.includes("import { kunciJalur, lengkapiIndukPilihan } from '@/lib/kinerja/banding-renaksi';") && KIN.includes('const terpilih = lengkapiIndukPilihan(pilih, kandidat);'))
const DLG = sumber('components/kinerja/PerbaruiRenaksi.tsx')
ok('B2 dialog menulis lewat jalur lama: Edit Master (PUT), Init Renaksi, route asal',
  DLG.includes("fetchJson<unknown>(`/api/kinerja/master/${g.id}`, { method: 'PUT', body: JSON.stringify({ nama: g.ke, gabung }) })")
  && DLG.includes("'/api/kinerja/master/init-renaksi', { method: 'POST', body: JSON.stringify({ tahun, pilih: pilihBaru }) }")
  && DLG.includes("'/api/kinerja/master/asal'"))
ok('B3 ganti nama dicoba "dry" dulu untuk menampilkan dampaknya', DLG.includes('JSON.stringify({ nama: g.ke, dry: true })'))
ok('B4 ganti nama diterapkan program → kegiatan → sub', DLG.includes('.sort((a, b) => urut[a.tipe] - urut[b.tipe])'))
ok('B5 bawaan centang: ganti nama & baru saja', /new Set\(\[\s*\.\.\.hasil\.gantiNama\.map\(g => kunciGanti\(g\.id\)\),\s*\.\.\.hasil\.baru\.map\(b => kunciBaru\(b\.kunci\)\),\s*\]\)/.test(DLG))
const KC = sumber('app/(dashboard)/kinerja/kinerja-client.tsx')
ok('B6 spanduk hanya di tab Master & Rekening; dialog lewat guardPending',
  KC.includes("(activeTab === 'master' || activeTab === 'rekening') && banding.jumlah > 0") && KC.includes('onBuka={() => guardPending(() => setPerbaruiBuka(true))}'))
for (const r of ['app/api/kinerja/master/banding-renaksi/route.ts', 'app/api/kinerja/master/asal/route.ts']) {
  const s = sumber(r)
  ok(`B7 ${r.split('/').slice(-2, -1)[0]}: sesi → sakelar → akses modul`, s.indexOf('await getSession()') < s.indexOf('await kinerjaMati(') && s.indexOf('await kinerjaMati(') < s.indexOf('hasAppAccess(session.userId, session.role, isKinerjaRole)'))
}
const MT = sumber('app/(dashboard)/kinerja/_tabs/MasterTab.tsx')
ok('B9 Simpan Master bertanya lewat ketikanAdaDiRenaksi; "Pakai" mengirim nama Renaksi + asal',
  MT.includes('dariRa = ketikanAdaDiRenaksi(newRows, (banding as unknown as HasilBanding).baru)') && MT.includes("nama: ra ? ra.nama : row.nama") && MT.includes("...(ra ? { asal: 'RENAKSI' } : {})"))
const RM = sumber('app/api/kinerja/master/route.ts')
ok('B10 server memeriksa jalur sebelum menerima tanda RENAKSI', RM.indexOf("asal === 'RENAKSI' && !(await jalurAdaDiRenaksiTahun(") > 0
  && RM.indexOf("asal === 'RENAKSI' && !(await jalurAdaDiRenaksiTahun(") < RM.indexOf('await createMasterRow('))
ok('B8 jenis audit baru tergolong di retensi', sumber('lib/security/retensi-audit.ts').includes('KINERJA_MASTER_SELARAS_RENAKSI: P'))

// ─────────────────────────────────────────────────────────────────────────────
console.log('C. Ujung-ke-ujung, MySQL kotak pasir 2094')
const TAHUN = '2094'
const SUMBER = ['GAJI', 'BLUD', 'HARLEP', 'PROMKES', 'SARPRAS', 'OBAT', 'PEMELIHARAAN', 'PEMBANGUNAN']
const c = await mysql.createConnection({
  host: process.env.MYSQL_HOST, port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER, password: process.env.MYSQL_PASSWORD, database: process.env.MYSQL_DATABASE,
})
const q = async <T,>(s: string, p: unknown[] = []) => ((await c.query(s, p)) as [T[], unknown])[0]
const bersih = async () => {
  for (const t of ['kinerja_master', 'kinerja_rekening', 'kinerja_realisasi']) await c.query(`DELETE FROM ${t} WHERE tahun = ?`, [TAHUN])
  await c.query('DELETE FROM rencana_aksi WHERE tahun = ?', [Number(TAHUN)])
  await c.query('DELETE FROM renaksi_ganti_nama WHERE tahun = ?', [Number(TAHUN)])
  // L92: kunci uji dihapus PERSIS.
  await c.query("DELETE FROM blud_locks WHERE entity = 'kinerja_master' AND key_id = ?", [TAHUN])
  for (const s of SUMBER) {
    await c.query("DELETE FROM blud_locks WHERE entity IN ('kinerja_versi_ssk', 'kinerja_realisasi') AND key_id = ?", [`${TAHUN}:${s}`])
  }
}
await bersih()
try {
  const RA = await import('../lib/data/rencana-aksi')
  const K = await import('../lib/data/kinerja')
  const M = await import('../lib/data/kinerja-master-ubah')
  const [usr] = await q<{ id: number }>('SELECT id FROM users ORDER BY id LIMIT 1')
  const userId = Number(usr?.id ?? 0)
  const th = Number(TAHUN)
  const dasar = { tahun: th, satuan: 'Persen', jenis: 'Akumulatif' as const, target_rpjmd: 0, target_tahunan: 0, q1_target: 0, q2_target: 0, q3_target: 0, q4_target: 0 }
  await RA.upsertRencanaAksi({ ...dasar, level: 'program', program: 'Program Layanan ***', sasaran: 'SAS', kegiatan: null, sub_kegiatan: null, indikator: 'U-P' }, userId)
  await RA.upsertRencanaAksi({ ...dasar, level: 'kegiatan', program: 'Program Layanan ***', kegiatan: 'Kegiatan Obat ****', sub_kegiatan: null, indikator: 'U-K' }, userId)
  await RA.upsertRencanaAksi({ ...dasar, level: 'sub-kegiatan', program: 'Program Layanan ***', kegiatan: 'Kegiatan Obat ****', sub_kegiatan: 'Sub Beli *****', indikator: 'U-S' }, userId)
  await RA.upsertRencanaAksi({ ...dasar, level: 'sub-kegiatan', program: 'Program Layanan ***', kegiatan: 'Kegiatan Obat ****', sub_kegiatan: 'Sub Hapus *****', indikator: 'U-S2' }, userId)
  await K.initMasterFromRenaksi(TAHUN, userId)
  ok('C1 Init awal: 4 entri bertanda Renaksi, pembanding kosong',
    Number((await q<{ n: number }>("SELECT COUNT(*) n FROM kinerja_master WHERE tahun = ? AND asal = 'RENAKSI'", [TAHUN]))[0].n) === 4
    && jumlahPerubahan(await M.bandingMasterRenaksi(TAHUN)) === 0)

  // Salinan nama di Rekening & Realisasi.
  await c.query("INSERT INTO kinerja_rekening (tahun, sumber, uraian, uraian_ssk, program, kegiatan, subkegiatan, urut) VALUES (?, 'GAJI', 'Belanja Obat', 'US', 'Program Layanan', 'Kegiatan Obat', 'Sub Beli', 1)", [TAHUN])
  await c.query("INSERT INTO kinerja_realisasi (tahun, sumber, bulan, ssk_canonical_id, ssk_versi_tipe, ssk_versi_seq, keterangan, program, kegiatan, subkegiatan, uraian_ssk, real_fisik, real_keuangan) VALUES (?, 'GAJI', 1, 'UJI-1', 'MURNI', 0, 'Belanja Obat', 'Program Layanan', 'Kegiatan Obat', 'Sub Beli', 'US', 5, 5)", [TAHUN])

  // Renaksi berubah: program & kegiatan ganti nama lewat Data Entry, program baru, satu sub dihapus.
  const cari = async (ind: string) => (await q<{ id: number; version: number }>('SELECT id, version FROM rencana_aksi WHERE tahun = ? AND indikator = ?', [th, ind]))[0]
  let r = await cari('U-P')
  await RA.upsertRencanaAksi({ ...dasar, id: r.id, expected_version: r.version, level: 'program', program: 'Program Pelayanan Kesehatan ***', sasaran: 'SAS', kegiatan: null, sub_kegiatan: null, indikator: 'U-P' }, userId)
  r = await cari('U-K')
  await RA.upsertRencanaAksi({ ...dasar, id: r.id, expected_version: r.version, level: 'kegiatan', program: 'Program Pelayanan Kesehatan ***', kegiatan: 'Kegiatan Obat & BMHP ****', sub_kegiatan: null, indikator: 'U-K' }, userId)
  await RA.upsertRencanaAksi({ ...dasar, level: 'program', program: 'Program Baru ***', sasaran: 'SAS', kegiatan: null, sub_kegiatan: null, indikator: 'U-P3' }, userId)
  await c.query("DELETE FROM rencana_aksi WHERE tahun = ? AND indikator = 'U-S2'", [th])
  // Entri ketikan tangan yang ternyata ada di Renaksi.
  await c.query("INSERT INTO kinerja_master (tahun, tipe, nama, urut) VALUES (?, 'program', 'PROGRAM BARU', 9)", [TAHUN])

  const h = await M.bandingMasterRenaksi(TAHUN)
  ok('C2 dua ganti nama dikenali dari catatan Renaksi', ringkas(h.gantiNama) === 'program:Program Layanan>Program Pelayanan Kesehatan | kegiatan:Kegiatan Obat>Kegiatan Obat & BMHP', ringkas(h.gantiNama))
  ok('C3 program baru TIDAK dihitung "baru" karena sudah diketik tangan → "belum bertanda"',
    h.baru.length === 0 && ringkas(h.belumBertanda) === 'program:PROGRAM BARU', `${ringkas(h.baru)} / ${ringkas(h.belumBertanda)}`)
  ok('C4 sub yang dihapus di Renaksi → "tidak ada lagi"', ringkas(h.hilang) === 'subkegiatan:Sub Hapus', ringkas(h.hilang))

  // Terapkan persis seperti dialog: dry → ganti nama (urut tingkat) → asal.
  for (const g of [...h.gantiNama].sort((a, b) => ['program', 'kegiatan', 'subkegiatan'].indexOf(a.tipe) - ['program', 'kegiatan', 'subkegiatan'].indexOf(b.tipe))) {
    const dry = await M.ubahMasterMenjalar(g.id, { nama: g.ke }, { userId, dry: true, gabung: false })
    await M.ubahMasterMenjalar(g.id, { nama: g.ke }, { userId, dry: false, gabung: !!dry.gabung_ke })
  }
  await M.ubahAsalMaster(TAHUN, h.hilang.map(e => e.id), 'MANUAL')
  await M.ubahAsalMaster(TAHUN, h.belumBertanda.map(e => e.id), 'RENAKSI')

  const sesudah = await M.bandingMasterRenaksi(TAHUN)
  ok('C5 sesudah diterapkan: spanduk hilang sendiri (tanpa status "sudah dibaca")', jumlahPerubahan(sesudah) === 0 && sesudah.belumBertanda.length === 0, JSON.stringify(sesudah))
  const [rek] = await q<{ program: string; kegiatan: string; subkegiatan: string }>('SELECT program, kegiatan, subkegiatan FROM kinerja_rekening WHERE tahun = ?', [TAHUN])
  ok('C6 Rekening ikut berganti nama (program & kegiatan), sub tetap', rek.program === 'Program Pelayanan Kesehatan' && rek.kegiatan === 'Kegiatan Obat & BMHP' && rek.subkegiatan === 'Sub Beli', JSON.stringify(rek))
  const [real] = await q<{ program: string; kegiatan: string; real_keuangan: string }>('SELECT program, kegiatan, real_keuangan FROM kinerja_realisasi WHERE tahun = ?', [TAHUN])
  ok('C7 Realisasi ikut berganti nama, angkanya tetap', real.program === 'Program Pelayanan Kesehatan' && real.kegiatan === 'Kegiatan Obat & BMHP' && Number(real.real_keuangan) === 5, JSON.stringify(real))
  const asal = await q<{ nama: string; asal: string }>('SELECT nama, asal FROM kinerja_master WHERE tahun = ? ORDER BY nama', [TAHUN])
  ok('C8 sub yang hilang tetap ada di Master, kini MANUAL; ketikan tangan kini RENAKSI',
    asal.find(x => x.nama === 'Sub Hapus')?.asal === 'MANUAL' && asal.find(x => x.nama === 'PROGRAM BARU')?.asal === 'RENAKSI' && asal.length === 5, JSON.stringify(asal))

  // Entri baru lewat Init berpilihan: hanya yang dipilih (plus induknya) yang dibuat.
  await RA.upsertRencanaAksi({ ...dasar, level: 'kegiatan', program: 'Program Lain ***', kegiatan: 'Kegiatan Lain ****', sub_kegiatan: null, indikator: 'U-K9' }, userId)
  await RA.upsertRencanaAksi({ ...dasar, level: 'program', program: 'Program Lain ***', sasaran: 'SAS', kegiatan: null, sub_kegiatan: null, indikator: 'U-P9' }, userId)
  await RA.upsertRencanaAksi({ ...dasar, level: 'program', program: 'Program Tidak Dipilih ***', sasaran: 'SAS', kegiatan: null, sub_kegiatan: null, indikator: 'U-P10' }, userId)
  const h2 = await M.bandingMasterRenaksi(TAHUN)
  const baruUrut = ringkas(h2.baru).split(' | ').sort().join(' | ')
  ok('C9 tiga entri baru terbaca', baruUrut === 'kegiatan:Kegiatan Lain | program:Program Lain | program:Program Tidak Dipilih', baruUrut)
  const hasil = await K.initMasterFromRenaksi(TAHUN, userId, false, [h2.baru.find(b => b.tipe === 'kegiatan')!.kunci])
  ok('C10 Init berpilihan: kegiatan terpilih + programnya, yang tidak dipilih tidak dibuat',
    hasil.kegiatanInserted === 1 && hasil.programInserted === 1, JSON.stringify(hasil))
  const h3 = await M.bandingMasterRenaksi(TAHUN)
  ok('C11 sisa satu "baru" yang tidak dipilih', ringkas(h3.baru) === 'program:Program Tidak Dipilih' && jumlahPerubahan(h3) === 1, ringkas(h3.baru))
  await c.query("INSERT INTO kinerja_master (tahun, tipe, nama, program_ref, kegiatan_ref, subkegiatan_ref, urut) VALUES (?, 'uraian_ssk', 'US', 'Program Pelayanan Kesehatan', 'Kegiatan Obat & BMHP', 'Sub Beli', 1)", [TAHUN])
  const idUs = (await q<{ id: number }>("SELECT id FROM kinerja_master WHERE tahun = ? AND tipe = 'uraian_ssk'", [TAHUN]))[0].id
  const idSub = asal.length ? (await q<{ id: number }>("SELECT id FROM kinerja_master WHERE tahun = ? AND nama = 'Sub Beli'", [TAHUN]))[0].id : 0
  ok('C11b pagar tanda dari form: jalur ada → boleh; kegiatan di program lain → ditolak',
    await M.jalurAdaDiRenaksiTahun(TAHUN, { tipe: 'program', nama: 'PROGRAM TIDAK DIPILIH', program_ref: null, kegiatan_ref: null, subkegiatan_ref: null })
    && !(await M.jalurAdaDiRenaksiTahun(TAHUN, { tipe: 'kegiatan', nama: 'Kegiatan Lain', program_ref: 'Program Baru', kegiatan_ref: null, subkegiatan_ref: null })))
  const idBaru = await K.createMasterRow(TAHUN, 'program', 'Program Tidak Dipilih', null, userId, null, null, null, 'RENAKSI')
  ok('C11c createMasterRow menyimpan asal RENAKSI → "baru" itu hilang dari pembanding',
    (await q<{ asal: string }>('SELECT asal FROM kinerja_master WHERE id = ?', [idBaru]))[0]?.asal === 'RENAKSI'
    && (await M.bandingMasterRenaksi(TAHUN)).baru.length === 0)
  ok('C12 ubahAsalMaster tidak menyentuh uraian SSK maupun tahun lain',
    await M.ubahAsalMaster(TAHUN, [Number(idUs)], 'RENAKSI') === 0 && await M.ubahAsalMaster('2093', [Number(idSub)], 'MANUAL') === 0
    && await M.ubahAsalMaster(TAHUN, [Number(idSub)], 'MANUAL') === 1)
} finally {
  await bersih()
  const sisa = await q<{ n: number }>(`SELECT (SELECT COUNT(*) FROM kinerja_master WHERE tahun = ?) + (SELECT COUNT(*) FROM rencana_aksi WHERE tahun = ?)
    + (SELECT COUNT(*) FROM renaksi_ganti_nama WHERE tahun = ?) + (SELECT COUNT(*) FROM kinerja_rekening WHERE tahun = ?) + (SELECT COUNT(*) FROM kinerja_realisasi WHERE tahun = ?) AS n`,
    [TAHUN, Number(TAHUN), Number(TAHUN), TAHUN, TAHUN])
  ok('C13 kotak pasir 2094 bersih kembali', Number(sisa[0]?.n) === 0)
  await c.end()
}

console.log(`\n${lulus} lulus, ${gagal.length} gagal`)
if (gagal.length) { console.log(gagal.map(g => `  - ${g}`).join('\n')); process.exit(1) }
process.exit(0)
