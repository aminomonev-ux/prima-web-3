// scripts/test-iki-beranda.mts — beranda IKI per tahun (docs/CONCEPT-iki-beranda.md, pilihan B).
//
//   npx tsx scripts/test-iki-beranda.mts
//
// A–H menguji `lib/iki/beranda.ts` (murni): pohon jabatan, baris "belum ada", rencana Salin
// semua (urutan atasan → bawahan), pencarian, isi & jalur zip. I memeriksa sambungan layar
// & route. K = penaut atasan. J memakai MySQL sungguhan di tahun kotak pasir 2091–2093 lewat fungsi asli
// `duplicateDokumen`/`salinTahun`, lalu menghapus dokumennya.

import { readFileSync } from 'node:fs'
import mysql from 'mysql2/promise'
import { normJabatan, tahunSumber, susunPohon, ringkasPohon, rencanaSalinTahun, saringPohon, dokumenZip, jalurZip, pilihDokumenAtasan, type DokBeranda } from '../lib/iki/beranda'

try {
  for (const b of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split(/\r?\n/)) {
    const t = b.trim()
    const i = t.indexOf('=')
    if (!t || t.startsWith('#') || i < 0) continue
    const k = t.slice(0, i).trim()
    if (process.env[k] === undefined) process.env[k] = t.slice(i + 1).trim().replace(/^["']|["']$/g, '')
  }
} catch { /* tanpa .env.local: bagian DB dilewati */ }

let lulus = 0
const gagal: string[] = []
function ok(nama: string, syarat: unknown, ket = '') {
  if (syarat) { lulus++; console.log(`  ok  ${nama}`) }
  else { gagal.push(nama); console.log(`FAIL  ${nama}${ket ? ' — ' + ket : ''}`) }
}
const sumber = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
const tanpaKomentar = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

let idBerikut = 1
function dok(tahun: string, jenis: 'MURNI' | 'PERUBAHAN', jabatan: string, atasan: DokBeranda | null, o: Partial<DokBeranda> = {}): DokBeranda {
  return {
    id: idBerikut++, tahun, jenis, jabatan, varian: jabatan === 'DIREKTUR' ? 'DIREKTUR' : 'STANDAR',
    nama: `Pejabat ${jabatan}`, nip: `NIP-${normJabatan(jabatan)}`, status: 'DRAFT',
    atasan_dokumen_id: atasan?.id ?? null, ...o,
  }
}

// Pohon 2026 meniru data nyata (Plt., Murni + Perubahan, 4 tingkat).
const dirM = dok('2026', 'MURNI', 'DIREKTUR', null, { status: 'FINAL' })
const dirP = dok('2026', 'PERUBAHAN', 'DIREKTUR', null, { nama: 'Direktur versi Perubahan' })
const wadirUK = dok('2026', 'PERUBAHAN', 'WAKIL DIREKTUR UMUM DAN KEUANGAN', dirP)
const wadirPel = dok('2026', 'PERUBAHAN', 'Plt. WAKIL DIREKTUR PELAYANAN', dirP)
const kabagKeuM = dok('2026', 'MURNI', 'KEPALA BAGIAN KEUANGAN', wadirUK)
const kabagKeuP = dok('2026', 'PERUBAHAN', 'KEPALA BAGIAN KEUANGAN', wadirUK)
const kabagUmumM = dok('2026', 'MURNI', 'KEPALA BAGIAN UMUM', wadirUK)
const kabagUmumP = dok('2026', 'PERUBAHAN', 'KEPALA BAGIAN UMUM', wadirUK)
const kabidPen = dok('2026', 'PERUBAHAN', 'Plt. KEPALA BIDANG PENUNJANG', wadirPel)
const subAkun = dok('2026', 'PERUBAHAN', 'KASUBBAG AKUNTANSI', kabagKeuP)
const subBend = dok('2026', 'PERUBAHAN', 'KASUBBAG PERBENDAHARAAN', kabagKeuP)
const kasiMed = dok('2026', 'PERUBAHAN', 'KASIE PENUNJANG MEDIS', kabidPen)
const d2026 = [dirM, dirP, wadirUK, wadirPel, kabagKeuM, kabagKeuP, kabagUmumM, kabagUmumP, kabidPen, subAkun, subBend, kasiMed]

// 2027 baru sebagian: Direktur & Kabag Keuangan sudah Murni, Kabid Penunjang definitif
// (orang lain, tanpa "Plt.") sudah Murni tapi belum ditautkan ke atasan.
const dir27 = dok('2027', 'MURNI', 'DIREKTUR', null)
const keu27 = dok('2027', 'MURNI', 'KEPALA BAGIAN KEUANGAN', null, { atasan_dokumen_id: null })
const kabid27 = dok('2027', 'MURNI', 'KEPALA BIDANG PENUNJANG', null, { nip: 'NIP-ORANG-BARU', nama: 'Pejabat Definitif' })
keu27.atasan_dokumen_id = dir27.id
const d2027 = [dir27, keu27, kabid27]
const semua = [...d2026, ...d2027]

console.log('\nA. Normalisasi jabatan & tahun sumber')
ok('A1 "Plt." dibuang, kapital & spasi disamakan', normJabatan('  Plt.  kepala   bidang penunjang') === 'KEPALA BIDANG PENUNJANG')
ok('A2 "Plh" tanpa titik juga', normJabatan('Plh KASUBBAG PROGRAM') === 'KASUBBAG PROGRAM')
ok('A3 kata yang diawali "pj" di tengah tidak dipotong', normJabatan('KEPALA PJ X') === 'KEPALA PJ X')
ok('A4 tahun sumber 2027 = 2026', tahunSumber(semua, '2027') === '2026')
ok('A5 tahun sumber 2028 = tahun terdekat yang punya dokumen (2027), bukan 2026', tahunSumber(semua, '2028') === '2027')
ok('A6 tahun paling awal tidak punya sumber', tahunSumber(semua, '2026') === null)

console.log('\nB. Pohon 2026 — satu baris per jabatan, menjorok mengikuti atasan')
const p26 = susunPohon(semua, '2026')
const urut26 = p26.baris.map(b => `${b.kedalaman}:${normJabatan(b.jabatan)}`)
ok('B1 Murni & Perubahan jabatan yang sama satu baris (9 jabatan, 12 dokumen)',
  p26.baris.length === 9 && ringkasPohon(p26.baris).dokumen === 12, urut26.join(' | '))
ok('B2 urutan atasan → bawahan, saudara urut abjad (tanpa "Plt.")', JSON.stringify(urut26) === JSON.stringify([
  '0:DIREKTUR',
  '1:WAKIL DIREKTUR PELAYANAN', '2:KEPALA BIDANG PENUNJANG', '3:KASIE PENUNJANG MEDIS',
  '1:WAKIL DIREKTUR UMUM DAN KEUANGAN', '2:KEPALA BAGIAN KEUANGAN', '3:KASUBBAG AKUNTANSI', '3:KASUBBAG PERBENDAHARAAN',
  '2:KEPALA BAGIAN UMUM',
]), urut26.join(' | '))
const barisKeu = p26.baris.find(b => b.kunci === 'KEPALA BAGIAN KEUANGAN')!
ok('B3 sel Murni & Perubahan berisi dokumen masing-masing', barisKeu.murni?.id === kabagKeuM.id && barisKeu.perubahan?.id === kabagKeuP.id)
ok('B4 anak tercatat di induknya', JSON.stringify(barisKeu.anak) === JSON.stringify(['KASUBBAG AKUNTANSI', 'KASUBBAG PERBENDAHARAAN']))
ok('B5 tidak ada baris lepas di 2026 (semua tertaut)', p26.baris.every(b => !b.lepas))
ok('B6 tahun paling awal: tanpa sumber dan tanpa rencana salin', p26.sumber === null && p26.rencana.length === 0)
ok('B7 nama baris dari Perubahan (versi terakhir)', p26.baris[0].nama === dirP.nama && p26.baris[0].murni?.id === dirM.id)

console.log('\nC. Pohon 2027 — baris "belum ada" + rencana Salin semua')
const p27 = susunPohon(semua, '2027')
const r27 = rencanaSalinTahun(semua, '2026', '2027')
ok('C1 rencana = jabatan 2026 yang belum punya Murni 2027 (Direktur, Kabag Keu, Kabid definitif dilewati)',
  JSON.stringify(r27.map(d => normJabatan(d.jabatan)).sort()) === JSON.stringify([
    'KASIE PENUNJANG MEDIS', 'KASUBBAG AKUNTANSI', 'KASUBBAG PERBENDAHARAAN', 'KEPALA BAGIAN UMUM',
    'WAKIL DIREKTUR PELAYANAN', 'WAKIL DIREKTUR UMUM DAN KEUANGAN',
  ]), r27.map(d => d.jabatan).join(' | '))
const dalamRencana = r27.map(d => ({ WAKIL: 1, KEPALA: 2, KASUBBAG: 3, KASIE: 3 } as Record<string, number>)[normJabatan(d.jabatan).split(' ')[0]])
ok('C2 rencana berurutan atasan → bawahan (tautan atasan tersambung)', dalamRencana.every((x, i) => i === 0 || dalamRencana[i - 1] <= x), dalamRencana.join(','))
ok('C3 sumber Kabag Umum = Perubahan walau Murni-nya ada', r27.find(d => normJabatan(d.jabatan) === 'KEPALA BAGIAN UMUM')?.id === kabagUmumP.id)
ok('C4 rencana tombol = rencana pohon (satu fungsi)', JSON.stringify(p27.rencana.map(d => d.id)) === JSON.stringify(r27.map(d => d.id)))
const hantu = p27.baris.filter(b => !b.murni && !b.perubahan)
ok('C5 baris "belum ada" = 6, masing-masing membawa sumbernya', hantu.length === 6 && hantu.every(b => b.sumber))
const kasi27 = p27.baris.find(b => b.kunci === 'KASIE PENUNJANG MEDIS')!
ok('C6 baris "belum ada" berinduk lewat atasan TAHUN LALU, dicocokkan tanpa "Plt."', kasi27.induk === 'KEPALA BIDANG PENUNJANG')
const kabidBaris = p27.baris.find(b => b.kunci === 'KEPALA BIDANG PENUNJANG')!
ok('C7 dokumen tanpa tautan atasan = lepas, tidak disembunyikan', kabidBaris.lepas && kabidBaris.murni?.id === kabid27.id)
ok('C8 baris lepas di akhir, dengan bawahannya', p27.baris.at(-2)?.kunci === 'KEPALA BIDANG PENUNJANG' && p27.baris.at(-1)?.kunci === 'KASIE PENUNJANG MEDIS',
  p27.baris.map(b => b.kunci).join(' | '))
const subAkun27 = p27.baris.find(b => b.kunci === 'KASUBBAG AKUNTANSI')!
ok('C9 baris "belum ada" di bawah induk yang SUDAH ada di 2027', subAkun27.induk === 'KEPALA BAGIAN KEUANGAN' && subAkun27.kedalaman === 2)
const rk27 = ringkasPohon(p27.baris)
ok('C10 ringkasan rel: 3 dari 9 jabatan', rk27.ada === 3 && rk27.jabatan === 9 && rk27.belum === 6, JSON.stringify(rk27))
const semuaPlusPerubahan27 = [...semua, dok('2027', 'PERUBAHAN', 'KASUBBAG AKUNTANSI', keu27)]
const rKurang = rencanaSalinTahun(semuaPlusPerubahan27, '2026', '2027')
ok('C11 jabatan yang baru punya Perubahan 2027 (tanpa Murni) tetap ditawari Murni',
  rKurang.some(d => normJabatan(d.jabatan) === 'KASUBBAG AKUNTANSI') && susunPohon(semuaPlusPerubahan27, '2027').baris.find(b => b.kunci === 'KASUBBAG AKUNTANSI')?.sumber)
ok('C12 rencana TIDAK pernah memuat dokumen tahun tujuan', r27.every(d => d.tahun === '2026'))

console.log('\nD. Tidak ada dokumen yang hilang dari daftar')
const kembarA = dok('2030', 'MURNI', 'KASUBBAG PROGRAM', null, { nip: 'A' })
const kembarB = dok('2030', 'MURNI', 'KASUBBAG PROGRAM', null, { nip: 'B' })
const kembarC = dok('2030', 'MURNI', 'KASUBBAG PROGRAM', null, { nip: 'B' })
const p30 = susunPohon([kembarA, kembarB, kembarC], '2030')
const idTampil = p30.baris.flatMap(b => [b.murni?.id, b.perubahan?.id]).filter(Boolean).sort()
ok('D1 tiga dokumen Murni jabatan sama → tiga baris, tiga dokumen', p30.baris.length === 3 && JSON.stringify(idTampil) === JSON.stringify([kembarA.id, kembarB.id, kembarC.id].sort()))
const idSemua26 = p26.baris.flatMap(b => [b.murni?.id, b.perubahan?.id]).filter(Boolean).sort((a, b) => a! - b!)
ok('D2 tiap dokumen 2026 muncul tepat sekali', JSON.stringify(idSemua26) === JSON.stringify(d2026.map(d => d.id).sort((a, b) => a - b)))

console.log('\nE. Data rusak tidak membuat layar berputar')
const lingA = dok('2031', 'MURNI', 'A', null)
const lingB = dok('2031', 'MURNI', 'B', lingA)
lingA.atasan_dokumen_id = lingB.id
const pLing = susunPohon([lingA, lingB], '2031')
ok('E1 tautan melingkar diputus, kedua baris tetap tampil', pLing.baris.length === 2)
const diriSendiri = dok('2032', 'MURNI', 'C', null)
diriSendiri.atasan_dokumen_id = diriSendiri.id
ok('E2 menaut diri sendiri = akar', susunPohon([diriSendiri], '2032').baris[0]?.induk === null)
const lingSrcA = dok('2033', 'MURNI', 'P', null)
const lingSrcB = dok('2033', 'MURNI', 'Q', lingSrcA)
lingSrcA.atasan_dokumen_id = lingSrcB.id
ok('E3 rencana tetap selesai pada sumber melingkar', rencanaSalinTahun([lingSrcA, lingSrcB], '2033', '2034').length === 2)

console.log('\nF. Pencarian menampilkan atasannya juga')
const cari = saringPohon(p26.baris, 'perbendaharaan')
ok('F1 cocok + seluruh rantai atasannya', JSON.stringify([...cari].sort()) === JSON.stringify(['DIREKTUR', 'KASUBBAG PERBENDAHARAAN', 'KEPALA BAGIAN KEUANGAN', 'WAKIL DIREKTUR UMUM DAN KEUANGAN']), [...cari].join(' | '))
ok('F2 cari NIP', saringPohon(p26.baris, 'nip-kasie').has('KASIE PENUNJANG MEDIS'))
ok('F3 kosong = semua baris', saringPohon(p26.baris, '  ').size === p26.baris.length)
ok('F4 baris "belum ada" ikut dicari lewat nama sumbernya', saringPohon(p27.baris, 'pejabat kasubbag akuntansi').has('KASUBBAG AKUNTANSI'))

console.log('\nG. Isi zip')
const final26 = { ...dirM }
const pilih = new Set([subAkun.id, kabagKeuM.id])
const zPilih = dokumenZip(d2026, pilih, { jenis: 'PERUBAHAN', hanyaFinal: true })
ok('G1 ada yang dicentang → HANYA yang dicentang, saringan jenis & FINAL tidak berlaku',
  zPilih.length === 2 && zPilih.every(d => pilih.has(d.id)), zPilih.map(d => d.id).join(','))
ok('G2 tanpa centang → saringan FINAL berlaku', JSON.stringify(dokumenZip(d2026, new Set(), { jenis: 'SEMUA', hanyaFinal: true }).map(d => d.id)) === JSON.stringify([final26.id]))
ok('G3 tanpa centang → saringan jenis berlaku', dokumenZip(d2026, new Set(), { jenis: 'MURNI', hanyaFinal: false }).every(d => d.jenis === 'MURNI')
  && dokumenZip(d2026, new Set(), { jenis: 'MURNI', hanyaFinal: false }).length === 3)

console.log('\nH. Jalur berkas di dalam zip')
const j1 = jalurZip([{ jenis: 'MURNI', nama: 'IKI_a_2026.pdf' }, { jenis: 'PERUBAHAN', nama: 'IKI_a_2026.pdf' }])
ok('H1 Murni & Perubahan jabatan sama tidak saling menimpa (folder per jenis)', JSON.stringify(j1) === JSON.stringify(['MURNI/IKI_a_2026.pdf', 'PERUBAHAN/IKI_a_2026.pdf']), j1.join(' | '))
const j2 = jalurZip([{ jenis: 'MURNI', nama: 'IKI_a_2026.pdf' }, { jenis: 'MURNI', nama: 'IKI_a_2026.pdf' }, { jenis: 'MURNI', nama: 'IKI_A_2026.pdf' }])
ok('H2 satu jenis: tanpa folder; nama kembar → _2, _3 (tak peka kapital)', JSON.stringify(j2) === JSON.stringify(['IKI_a_2026.pdf', 'IKI_a_2026_2.pdf', 'IKI_A_2026_3.pdf']), j2.join(' | '))

console.log('\nI. Sambungan layar & route')
const klien = tanpaKomentar(sumber('app/(dashboard)/iki/iki-client.tsx'))
ok('I1 zip memakai dokumenZip dengan centang', klien.includes('dokumenZip(docsTahun, selected, { jenis: zipJenis, hanyaFinal: zipOnlyFinal })'))
ok('I2 jalur berkas zip lewat jalurZip', klien.includes('jalurZip(berkas).forEach((jalur, i) => zip.file(jalur, berkas[i].bytes));'))
ok('I3 bilah pilihan punya Unduh Zip', /iki-selbar[\s\S]*?Unduh Zip \(\{selected\.size\}\)[\s\S]*?Hapus/.test(klien))
ok('I4 bawaan tampilan = pohon, tidak dibaca dari penyimpanan', klien.includes("useState<'pohon' | 'kartu'>('pohon')") && !/localStorage/.test(klien))
ok('I5 Salin dari tahun lalu = MURNI', klien.includes("const hasil = await duplikat(sumber, tahun, 'MURNI');"))
ok('I6 Perubahan disalin dari Murni tahun yang sama', klien.includes("const hasil = await duplikat(murni, tahun, 'PERUBAHAN');"))
ok('I7 Salin semua mengirim tahun sumber & tujuan', klien.includes('body: JSON.stringify({ tahun_sumber: sumber, tahun_target: tahun }),'))
ok('I8 ganti tahun melepas centang (zip tidak membawa dokumen tahun lain)', /function pilihTahun\(y: string\) \{[^}]*exitSelect\(\);/.test(klien))
const rDup = tanpaKomentar(sumber('app/api/iki/[id]/duplicate/route.ts'))
ok('I9 route duplikat meneruskan jenis_target', rDup.includes('await duplicateDokumen(id, tahun_target, g.session.userId, jenis_target);'))
const rSalin = tanpaKomentar(sumber('app/api/iki/salin-tahun/route.ts'))
ok('I10 route salin-tahun: guard (sakelar & beku) + Zod + rate limit', rSalin.includes('const g = await guard();') && rSalin.includes('SalinTahunSchema.safeParse(raw)') && rSalin.includes("ikiRateLimit(g.session.userId, 'salin-tahun', 3)"))
const data = tanpaKomentar(sumber('lib/data/iki.ts'))
ok('I11 salinTahun memakai rencanaSalinTahun yang sama dengan layar', data.includes('const rencana = rencanaSalinTahun([...await baca(tahunSumberIki), ...await baca(tahunTarget)], tahunSumberIki, tahunTarget);'))
ok('I12 penaut atasan lewat pilihDokumenAtasan (jabatan lama, lalu jenis)', data.includes('if (calon.length) atasanTarget = pilihDokumenAtasan(calon[0].jabatan_lama, calon, jenis);'))
ok('I13 listDokumen membawa atasan_dokumen_id (kedua cabang)', (data.match(/d\.atasan_dokumen_id, d\.updated_at, COUNT\(r\.id\) AS jumlah_rhk/g) ?? []).length === 2)
const editor = tanpaKomentar(sumber('app/(dashboard)/iki/[id]/editor-client.tsx'))
ok('I14 Kembali dari editor pulang ke tahun dokumennya', (editor.match(/router\.push\(`\/iki\?tahun=\$\{doc\.tahun\}`\)/g) ?? []).length === 2)

console.log('\nK. Penaut atasan hasil salinan (pilihDokumenAtasan)')
const calonPlt = [
  { id: 10, jabatan: 'Plt. WAKIL DIREKTUR PELAYANAN', jenis: 'MURNI' as const },
  { id: 11, jabatan: 'KEPALA BIDANG PELAYANAN MEDIS', jenis: 'MURNI' as const },
]
ok('K1 orang dengan dua jabatan → jabatan atasan lama yang dipilih, walau id-nya lebih kecil', pilihDokumenAtasan('Plt. WAKIL DIREKTUR PELAYANAN', calonPlt, 'MURNI') === 10)
ok('K2 "Plt." hilang di tahun baru tetap cocok', pilihDokumenAtasan('Plt. WAKIL DIREKTUR PELAYANAN', [{ id: 12, jabatan: 'WAKIL DIREKTUR PELAYANAN', jenis: 'MURNI' }, calonPlt[1]], 'MURNI') === 12)
ok('K3 dua jabatan, tak satu pun cocok → tidak ditebak', pilihDokumenAtasan('DIREKTUR', calonPlt, 'MURNI') === null)
ok('K4 satu jabatan saja (pindah jabatan) → tetap ditautkan', pilihDokumenAtasan('KEPALA BAGIAN UMUM', [{ id: 13, jabatan: 'KEPALA BAGIAN KEUANGAN', jenis: 'MURNI' }], 'MURNI') === 13)
ok('K5 jabatan sama, Murni & Perubahan → jenis yang sama', pilihDokumenAtasan('DIREKTUR', [{ id: 20, jabatan: 'DIREKTUR', jenis: 'PERUBAHAN' }, { id: 21, jabatan: 'DIREKTUR', jenis: 'MURNI' }], 'PERUBAHAN') === 20)
ok('K6 tanpa calon → null', pilihDokumenAtasan('DIREKTUR', [], 'MURNI') === null)

console.log('\nJ. MySQL sungguhan (kotak pasir 2091–2093)')
let c: mysql.Connection | null = null
try {
  c = await mysql.createConnection({
    host: process.env.MYSQL_HOST, port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER, password: process.env.MYSQL_PASSWORD, database: process.env.MYSQL_DATABASE,
  })
} catch (e) {
  console.log(`DILEWATI bagian DB: MySQL tidak bisa dihubungi (${(e as { code?: string }).code ?? e})`)
}
const NAMA = 'UJI-BERANDA'
if (c) {
  const k = c
  const bersih = () => k.query("DELETE FROM iki_dokumen WHERE tahun IN ('2091','2092','2093') AND nama LIKE ?", [`${NAMA}%`])
  await bersih()
  const D = await import('../lib/data/iki')
  const [u] = await k.query('SELECT id FROM users ORDER BY id LIMIT 1') as [Array<{ id: number }>, unknown]
  const userId = Number(u[0]?.id ?? 0)
  const buat = async (tahun: string, jenis: string, jabatan: string, nip: string, atasan: number | null) => {
    const [r] = await k.query(
      `INSERT INTO iki_dokumen (tahun, varian, jenis, nama, nip, jabatan, atasan_dokumen_id, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [tahun, jabatan === 'DIREKTUR' ? 'DIREKTUR' : 'STANDAR', jenis, `${NAMA} ${jabatan}`, nip, jabatan, atasan, userId, userId],
    ) as [{ insertId: number }, unknown]
    const [rhk] = await k.query(
      `INSERT INTO iki_rhk (dokumen_id, no_urut, rhk, indikator, urutan) VALUES (?, 1, 'RHK uji', 'Indikator uji', 0)`, [r.insertId],
    ) as [{ insertId: number }, unknown]
    await k.query(`INSERT INTO iki_rhk_triwulan (rhk_id, triwulan, target_tw, target_aksi) VALUES (?,1,'1','1'),(?,2,'2','2'),(?,3,'3','3'),(?,4,'4','4')`,
      [rhk.insertId, rhk.insertId, rhk.insertId, rhk.insertId])
    return r.insertId
  }
  const baca = async (id: number) => {
    const [r] = await k.query('SELECT id, tahun, jenis, jabatan, atasan_dokumen_id, status FROM iki_dokumen WHERE id = ?', [id]) as [Array<{ id: number; tahun: string; jenis: string; jabatan: string; atasan_dokumen_id: number | null; status: string }>, unknown]
    return r[0]
  }
  try {
    const dirM97 = await buat('2091', 'MURNI', 'DIREKTUR', 'UJI-1', null)
    const dirP97 = await buat('2091', 'PERUBAHAN', 'DIREKTUR', 'UJI-1', null)
    // UJI-2 memegang DUA jabatan (pola Plt. dr. Retno 2026): Plt. Wadir dan Kabid di bawahnya.
    const wadir97 = await buat('2091', 'PERUBAHAN', 'Plt. WAKIL DIREKTUR UJI', 'UJI-2', dirP97)
    await buat('2091', 'PERUBAHAN', 'KEPALA BIDANG UJI', 'UJI-2', wadir97)
    // Bawahan Wadir yang tersalin SESUDAH dokumen Kabid UJI-2 ada (urut abjad) — dulu tertaut ke Kabid.
    const sub97 = await buat('2091', 'PERUBAHAN', 'STAF AHLI UJI', 'UJI-3', wadir97)
    void dirM97

    const lebihDulu = await D.duplicateDokumen(wadir97, '2092', userId, 'MURNI')
    ok('J1 bawahan disalin sebelum atasannya → atasanLepas dilaporkan', lebihDulu.atasanLepas === true && (await baca(lebihDulu.id))?.atasan_dokumen_id === null)
    await k.query('DELETE FROM iki_dokumen WHERE id = ?', [lebihDulu.id])

    const h1 = await D.salinTahun('2091', '2092', userId)
    const hasilBaru = await Promise.all(h1.dibuat.map(d => baca(d.id)))
    ok('J2 Salin semua membuat 4 dokumen, semuanya MURNI 2092 DRAFT', h1.dibuat.length === 4 && h1.dilewati.length === 0
      && hasilBaru.every(d => d?.tahun === '2092' && d.jenis === 'MURNI' && d.status === 'DRAFT'), JSON.stringify(h1))
    ok('J3 urutan atasan → bawahan', JSON.stringify(h1.dibuat.map(d => d.jabatan)) === JSON.stringify(['DIREKTUR', 'Plt. WAKIL DIREKTUR UJI', 'KEPALA BIDANG UJI', 'STAF AHLI UJI']))
    ok('J4 sumber Direktur = Perubahan 2091, bukan Murni', h1.dibuat[0].sumber_id === dirP97)
    const [dir98, wadir98, kabid98, sub98] = hasilBaru
    ok('J5 tautan atasan tersambung — bawahan Wadir ke Wadir, BUKAN ke jabatan kedua orang yang sama', wadir98?.atasan_dokumen_id === dir98?.id
      && kabid98?.atasan_dokumen_id === wadir98?.id && sub98?.atasan_dokumen_id === wadir98?.id
      && h1.dibuat.every(d => !d.atasan_lepas))
    const [tw] = await k.query(`SELECT COUNT(*) AS n FROM iki_rhk_triwulan t JOIN iki_rhk r ON r.id = t.rhk_id WHERE r.dokumen_id = ?`, [sub98!.id]) as [Array<{ n: number }>, unknown]
    ok('J6 RHK & triwulan ikut tersalin', Number(tw[0].n) === 4)
    const h2 = await D.salinTahun('2091', '2092', userId)
    ok('J7 dijalankan ulang = tidak membuat apa pun (aman diulang)', h2.dibuat.length === 0 && h2.dilewati.length === 0, JSON.stringify(h2))

    // Galat di sini dicatat sebagai gagal, bukan menghentikan suite (uji mutasi butuh baris FAIL-nya).
    const coba = async <T,>(f: () => Promise<T>): Promise<T | Error> => { try { return await f() } catch (e) { return e as Error } }
    const dirP98 = await coba(() => D.duplicateDokumen(dir98!.id, '2092', userId, 'PERUBAHAN'))
    ok('J8 Perubahan dari Murni tahun yang SAMA diterima', !(dirP98 instanceof Error)
      && (await baca(dirP98.id))?.jenis === 'PERUBAHAN' && (await baca(dirP98.id))?.tahun === '2092', dirP98 instanceof Error ? dirP98.message : '')
    const wadirP98 = await coba(() => D.duplicateDokumen(wadir98!.id, '2092', userId, 'PERUBAHAN'))
    ok('J9 atasan punya Murni DAN Perubahan → yang setipe (Perubahan) yang ditautkan', !(wadirP98 instanceof Error) && !(dirP98 instanceof Error)
      && (await baca(wadirP98.id))?.atasan_dokumen_id === dirP98.id)
    let tolak = ''
    try { await D.duplicateDokumen(wadir98!.id, '2092', userId, 'MURNI') } catch (e) { tolak = (e as Error).message }
    ok('J10 tahun DAN jenis sama ditolak dengan pesan yang dikenali route', tolak.includes('sama dengan dokumen sumber') && D.galatDuplikatDikenal(new Error(tolak)) === tolak, tolak)
    let kembar = ''
    try { await D.duplicateDokumen(dirP97, '2092', userId, 'MURNI') } catch (e) { kembar = (e as Error).message }
    ok('J11 Murni yang sudah ada tidak dibuat kembar', kembar.includes('sudah ada'), kembar)
    const tanpaJenis = await D.duplicateDokumen(sub97, '2093', userId)
    ok('J12 tanpa jenis_target jenis ikut sumber (tab lama tidak berubah arti)', (await baca(tanpaJenis.id))?.jenis === 'PERUBAHAN')
    const [daftar] = await k.query("SELECT COUNT(*) AS n FROM iki_dokumen WHERE tahun = '2092' AND nama LIKE ?", [`${NAMA}%`]) as [Array<{ n: number }>, unknown]
    ok('J13 jumlah akhir 2092 = 4 Murni + 2 Perubahan', Number(daftar[0].n) === 6)
    const list = await D.listDokumen('2092') as Array<{ atasan_dokumen_id: number | null; nama: string }>
    ok('J14 listDokumen mengembalikan atasan_dokumen_id', list.filter(r => r.nama.startsWith(NAMA)).some(r => r.atasan_dokumen_id !== null))
  } finally {
    await bersih()
    const [sisa] = await k.query("SELECT COUNT(*) AS n FROM iki_dokumen WHERE tahun IN ('2091','2092','2093')") as [Array<{ n: number }>, unknown]
    ok('J15 kotak pasir bersih', Number(sisa[0].n) === 0, `sisa ${sisa[0].n}`)
    await k.end()
  }
}

console.log(`\n${lulus} lulus, ${gagal.length} gagal`)
if (gagal.length) { console.log(gagal.map(g => `  - ${g}`).join('\n')); process.exit(1) }
process.exit(0)
