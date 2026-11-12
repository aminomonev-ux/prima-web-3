#!/usr/bin/env npx tsx
// scripts/test-pk-asal-sasaran.mts — keterangan "milik siapa" di lampiran Form PK.
// Konsep: docs/CONCEPT-pk-lampiran-asal-sasaran.md. Jalankan: npx tsx scripts/test-pk-asal-sasaran.mts
import { readFileSync } from 'node:fs'
import { asalSasaran, dipakaiDi, tulisEntitas, tulisPemakai, type BarisLampiranLain, type BarisRenaksiAsal } from '../lib/pk/asal-sasaran'

let lulus = 0
const gagal: string[] = []
const ok = (n: string, s: unknown, k = '') => { if (s) { lulus++; console.log(`  ok  ${n}`) } else { gagal.push(n); console.log(`FAIL  ${n}${k ? ' — ' + k : ''}`) } }
const sumber = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n')

const ra = (id: number, level: string, program: string, kegiatan: string | null, sub: string | null, indikator: string,
  o: { kode?: string; outcome?: string; induk?: number } = {}): BarisRenaksiAsal => ({
  id, level, kode: o.kode ?? null, program, kegiatan, sub_kegiatan: sub,
  outcome_program: level === 'program' ? (o.outcome ?? null) : null,
  outcome_kegiatan: level === 'kegiatan' ? (o.outcome ?? null) : null,
  outcome_sub_kegiatan: level === 'sub-kegiatan' ? (o.outcome ?? null) : null,
  indikator, induk_indikator_id: o.induk ?? null,
})
const RA = [
  ra(1, 'program', 'PROGRAM A ***', null, null, '(1) IP1', { kode: '1.02.02', outcome: 'Meningkatnya Mutu ***' }),
  ra(2, 'program', 'PROGRAM A ***', null, null, '(2) IP2', { kode: '1.02.02', outcome: 'Meningkatnya Mutu ***' }),
  ra(3, 'kegiatan', 'PROGRAM A ***', 'KEG X ****', null, 'IK1', { kode: '1.02.02.2.01', outcome: 'Tersedianya Layanan', induk: 2 }),
  ra(4, 'kegiatan', 'PROGRAM A ***', 'KEG X ****', null, 'IK2', { kode: '1.02.02.2.01', outcome: 'Tersedianya Layanan' }),
  ra(5, 'sub-kegiatan', 'PROGRAM A ***', 'KEG X ****', 'SUB Z *****', 'IS1', { kode: '1.02.02.2.01.0001', induk: 3 }),
]

console.log('A. Asal di Rencana Aksi')
{
  const p = asalSasaran(RA, 'program', 'meningkatnya mutu')
  ok('A1 sasaran program (outcome, penanda & huruf besar dibuang) → program + kode, tanpa kegiatan',
    p.length === 1 && tulisEntitas(p[0].program) === '1.02.02 PROGRAM A' && p[0].kegiatan === null && p[0].indikatorInduk === null, JSON.stringify(p))
  const k = asalSasaran(RA, 'kegiatan', 'Tersedianya Layanan', 'IK1')
  ok('A2 kegiatan + indikator tertaut → program, kegiatan (kode masing-masing) + indikator induk yang dijabarkan',
    k.length === 1 && k[0].kegiatan?.kode === '1.02.02.2.01' && k[0].kegiatan?.nama === 'KEG X' && k[0].program.kode === '1.02.02' && k[0].indikatorInduk === 'IP2', JSON.stringify(k))
  ok('A3 indikator belum tertaut → indikator induk kosong (tidak ditebak)', asalSasaran(RA, 'kegiatan', 'Tersedianya Layanan', 'IK2')[0]?.indikatorInduk === null)
  ok('A4 indikator tak dikenal → tetap menyebut entitas pemikul sasarannya, tanpa indikator induk',
    asalSasaran(RA, 'kegiatan', 'Tersedianya Layanan', 'LAIN')[0]?.indikatorInduk === null && asalSasaran(RA, 'kegiatan', 'Tersedianya Layanan', 'LAIN').length === 1)
  const s = asalSasaran(RA, 'subkegiatan', 'SUB Z', 'IS1')
  ok('A5 sub kegiatan tanpa outcome → dicocokkan lewat nama; tiga tingkat + indikator induk',
    s.length === 1 && s[0].sub?.kode === '1.02.02.2.01.0001' && s[0].kegiatan?.nama === 'KEG X' && s[0].indikatorInduk === 'IK1', JSON.stringify(s))
  ok('A6 sasaran diketik manual (tak ada di Renaksi) → kosong', asalSasaran(RA, 'program', 'Sasaran Karangan').length === 0)
  ok('A7 tingkat lain tidak tercampur (sasaran kegiatan dicari di tingkat program = kosong)', asalSasaran(RA, 'program', 'Tersedianya Layanan').length === 0)
  const dua = [...RA, ra(6, 'kegiatan', 'PROGRAM B', 'KEG Y', null, 'IK9', { outcome: 'Tersedianya Layanan' })]
  ok('A8 teks sasaran dipakai dua entitas → keduanya disebut', asalSasaran(dua, 'kegiatan', 'Tersedianya Layanan').length === 2)
}

console.log('B. Dipakai juga di PK lain')
{
  const L: BarisLampiranLain[] = [
    { dokumen_id: 10, unit: 'Wadir Pelayanan', jenis: 'MURNI', status: 'DRAFT', uraian: 'Meningkatnya Mutu ***', indikator: '(1) IP1' },
    { dokumen_id: 10, unit: 'Wadir Pelayanan', jenis: 'MURNI', status: 'DRAFT', uraian: 'Meningkatnya Mutu', indikator: 'IP2' },
    { dokumen_id: 11, unit: 'Wadir Umum', jenis: 'PERUBAHAN', status: 'FINAL', uraian: 'meningkatnya mutu', indikator: 'IP2' },
    { dokumen_id: 12, unit: 'Kabid X', jenis: 'MURNI', status: 'FINAL', uraian: 'Lain', indikator: 'IP2' },
  ]
  const semua = dipakaiDi(L, 'Meningkatnya Mutu', undefined, null)
  ok('B1 sasaran (indikator apa pun) → satu entri per dokumen, FINAL dulu', semua.map(p => p.dokumen_id).join() === '11,10', JSON.stringify(semua))
  ok('B2 sasaran + indikator → hanya dokumen yang memuat indikator itu (penanda dibuang)',
    dipakaiDi(L, 'Meningkatnya Mutu', 'IP1', null).map(p => p.dokumen_id).join() === '10')
  ok('B3 dokumen yang sedang dibuka tidak disebut', dipakaiDi(L, 'Meningkatnya Mutu', undefined, 10).map(p => p.dokumen_id).join() === '11')
  ok('B4 kalimat menyebut unit, status, dan Perubahan', tulisPemakai(semua) === 'Wadir Umum (FINAL · PERUBAHAN), Wadir Pelayanan (DRAFT)', tulisPemakai(semua))
}

console.log('C. Sambungan: tampil saja, tidak tersimpan')
{
  const lay = sumber('app/(dashboard)/perjanjian-kinerja/form/_components/LampiranAnggaranSplit.tsx')
  const add = lay.slice(lay.indexOf('function handleAdd()'), lay.indexOf('function handleDelete('))
  ok('C1 handleAdd tidak membaca keterangan asal (tidak ikut ditambahkan ke lampiran)',
    add.length > 0 && !/asal|pemakai|Asal/.test(add))
  ok('C2 tampil di tiga tempat: kotak sasaran, tiap indikator, kartu lampiran',
    lay.includes('<KotakAsal ') && lay.includes('<KeteranganIndikator ') && lay.includes('<RingkasAsal '))
  ok('C3 kartu lampiran memakai tingkat BARIS itu, dokumen yang dibuka dikecualikan',
    lay.includes('asalDari(r.uraian, r.indikator, r.level)') && lay.includes('dipakaiDi(asal.lampiran, sasaran, indikator, form.id)'))
  const rt = sumber('app/api/perjanjian-kinerja/asal-sasaran/route.ts')
  ok('C4 route: sesi → sakelar → menu Form → batas laju; hanya SELECT',
    rt.indexOf('getSession()') < rt.indexOf('pkMati(') && rt.indexOf('pkMati(') < rt.indexOf("bolehBukaMenu(session.userId, session.role, 'form')")
    && rt.indexOf("'form')") < rt.indexOf('pkRateLimit(') && !/INSERT|UPDATE|DELETE/.test(rt))
  ok('C5 route tidak memulangkan nama/NIP pejabat dokumen lain', !/nama_pertama|nip_pertama/.test(rt))
}

console.log(`\n${lulus} lulus, ${gagal.length} gagal`)
if (gagal.length) { console.log(gagal.map(g => `  - ${g}`).join('\n')); process.exit(1) }
process.exit(0)
