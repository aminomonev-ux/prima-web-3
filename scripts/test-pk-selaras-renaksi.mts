#!/usr/bin/env npx tsx
// scripts/test-pk-selaras-renaksi.mts — Master Program & Master Sasaran PK mengikuti Rencana Aksi.
// Konsep: docs/CONCEPT-renaksi-terhubung.md §6 (Tahap D).
// Jalankan: npx tsx --env-file=.env.local scripts/test-pk-selaras-renaksi.mts
// Bagian D memakai MySQL (kotak pasir 2094) untuk mengadu isi awal migrasi dengan aturan murni;
// dibersihkan otomatis. Tanpa --env-file bagian itu GAGAL.
import { readFileSync } from 'node:fs'
import mysql from 'mysql2/promise'
import {
  bandingProgramPk, terapkanSelarasProgram, kunciPilih, susunSasaranRenaksi, sasaranAdaDiRenaksi,
  bandingSasaranPk, terapkanSelarasSasaran, jumlahPerubahanSasaran,
  type BarisProgramPk, type BarisSasaranPk, type RaSasaranSrc,
} from '../lib/pk/selaras-renaksi'
import { jumlahPerubahan, type CatatanGanti } from '../lib/kinerja/banding-renaksi'
import { jalurAdaDiRenaksi, type BarisRenaksi } from '../lib/kinerja/asal-renaksi'
import { entriProgramPk } from '../lib/pk/selaras-renaksi'
import { buangProgramKembar } from '../lib/pk/program-kembar'
import { rapikanBarisProgram } from '../lib/pk/rapikan-nama'
import { kalimatSpandukPk } from '../lib/pk/selaras-renaksi'
import { anakMilikIndikator } from '../lib/renaksi/rantai'
import { buildHierarchyRows, type RaRow } from '../app/(dashboard)/rencana-aksi/_lib/types'

let lulus = 0
const gagal: string[] = []
function ok(nama: string, syarat: unknown, ket = '') {
  if (syarat) { lulus++; console.log(`  ok  ${nama}`) }
  else { gagal.push(nama); console.log(`FAIL  ${nama}${ket ? ' — ' + ket : ''}`) }
}
const sumber = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n')

const pr = (program: string, kegiatan: string | null = null, sub: string | null = null, asal: 'MANUAL' | 'RENAKSI' = 'RENAKSI'): BarisProgramPk =>
  ({ program, kegiatan, subkegiatan: sub, level: sub ? 'subkegiatan' : kegiatan ? 'kegiatan' : 'program', asal })
const ra = (level: string, program: string, kegiatan: string | null = null, sub: string | null = null): BarisRenaksi =>
  ({ level, program, kegiatan, sub_kegiatan: sub })
const cat = (level: string, dari: string, ke: string, induk: string | null = null, induk_program: string | null = null): CatatanGanti =>
  ({ level, dari, ke, induk, induk_program })
const semua = (h: { gantiNama: { id: number }[]; baru: { kunci: string }[]; hilang: { id: number }[]; belumBertanda: { id: number }[] }) => new Set([
  ...h.gantiNama.map(g => kunciPilih.ganti(g.id)), ...h.baru.map(b => kunciPilih.baru(b.kunci)),
  ...h.hilang.map(e => kunciPilih.hilang(e.id)), ...h.belumBertanda.map(e => kunciPilih.tanda(e.id)),
])
const buat = (b: BarisProgramPk) => ({ ...b })

// ─────────────────────────────────────────────────────────────────────────────
console.log('A. Master Program')
{
  const rows = [pr('P'), pr('P', 'K'), pr('P', 'K', 'S'), pr('P', 'K', 'S2'), pr('X', null, null, 'MANUAL')]
  ok('A1 entri pembanding: tingkat & induk dari kolom baris',
    JSON.stringify(entriProgramPk(rows).map(e => [e.tipe, e.nama, e.program_ref, e.kegiatan_ref])) === JSON.stringify([
      ['program', 'P', null, null], ['kegiatan', 'K', 'P', null], ['subkegiatan', 'S', 'P', 'K'], ['subkegiatan', 'S2', 'P', 'K'], ['program', 'X', null, null]]))
  const renaksi = [ra('program', 'P2 ***'), ra('kegiatan', 'P2', 'K2'), ra('sub-kegiatan', 'P2', 'K2', 'S'), ra('program', 'X'), ra('sub-kegiatan', 'P2', 'K2', 'S Baru')]
  const catatan = [cat('program', 'P', 'P2 ***'), cat('kegiatan', 'K', 'K2', 'P2')]
  const h = bandingProgramPk(rows, renaksi, catatan)
  ok('A2 ganti nama program & kegiatan, sub hilang, sub baru, manual "belum bertanda"',
    h.gantiNama.map(g => `${g.nama}>${g.ke}`).join() === 'P>P2,K>K2' && h.hilang.map(e => e.nama).join() === 'S2'
    && h.baru.map(b => b.nama).join() === 'S Baru' && h.belumBertanda.map(e => e.nama).join() === 'X',
    JSON.stringify({ g: h.gantiNama.map(g => g.ke), hl: h.hilang.map(e => e.nama), b: h.baru.map(b => b.nama), t: h.belumBertanda.map(e => e.nama) }))
  const hasil = terapkanSelarasProgram(rows, h, semua(h), buat)
  ok('A3 ganti nama program membawa SEMUA baris di bawahnya; kegiatan membawa sub-nya',
    hasil.slice(0, 4).every(r => r.program === 'P2') && hasil.slice(1, 4).every(r => r.kegiatan === 'K2'), JSON.stringify(hasil.slice(0, 4)))
  ok('A4 hilang → MANUAL, belum bertanda → RENAKSI (nama tidak disentuh)',
    hasil[3].asal === 'MANUAL' && hasil[3].subkegiatan === 'S2' && hasil[4].asal === 'RENAKSI' && hasil[4].program === 'X')
  ok('A5 baru ditambah di akhir dengan induk yang sudah ada & tanda Renaksi',
    hasil.length === 6 && hasil[5].program === 'P2' && hasil[5].kegiatan === 'K2' && hasil[5].subkegiatan === 'S Baru' && hasil[5].asal === 'RENAKSI' && hasil[5].level === 'subkegiatan')
  ok('A6 sesudah diterapkan, pembanding kosong', jumlahPerubahan(bandingProgramPk(hasil, renaksi, catatan)) === 0 && bandingProgramPk(hasil, renaksi, catatan).belumBertanda.length === 0)
  ok('A7 baris yang tidak dipilih tidak berubah (identitas sama)', terapkanSelarasProgram(rows, h, new Set(), buat).every((r, i) => r === rows[i]))
  // Ejaan induk yang sudah ada dipakai (beda huruf besar tidak melahirkan program kedua).
  const h2 = bandingProgramPk([pr('PROGRAM A')], [ra('program', 'Program A'), ra('kegiatan', 'Program A', 'Keg Baru')], [])
  const r2 = terapkanSelarasProgram([pr('PROGRAM A')], h2, semua(h2), buat)
  ok('A8 kegiatan baru memakai ejaan program yang SUDAH di layar', r2.length === 2 && r2[1].program === 'PROGRAM A' && r2[1].kegiatan === 'Keg Baru', JSON.stringify(r2))
  // Program baru + kegiatan barunya: memilih kegiatan saja ikut membawa programnya.
  const h3 = bandingProgramPk([], [ra('program', 'Q'), ra('kegiatan', 'Q', 'KQ')], [])
  const r3 = terapkanSelarasProgram([], h3, new Set([kunciPilih.baru(h3.baru.find(b => b.tipe === 'kegiatan')!.kunci)]), buat)
  ok('A9 memilih kegiatan baru ikut membawa program barunya, program dulu', r3.map(r => r.level).join() === 'program,kegiatan', JSON.stringify(r3))
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('B. Master Sasaran')
const raw = (level: string, program: string, kegiatan: string | null, sub: string | null, indikator: string, target: string, satuan = 'Persen', oP: string | null = null): RaSasaranSrc =>
  ({ level, program, kegiatan, sub_kegiatan: sub, outcome_program: oP, outcome_kegiatan: null, outcome_sub_kegiatan: null, indikator, satuan, target_tahunan: target })
const RA: RaSasaranSrc[] = [
  raw('program', 'PRG ***', null, null, '(1) IKP Program', '90.00', 'Persen', 'Meningkatnya Mutu ***'),
  raw('kegiatan', 'PRG ***', 'KEG ****', null, 'IK Kegiatan', '100.00', 'Persen'),
  raw('sub-kegiatan', 'PRG ***', 'KEG ****', 'SUB A *****', 'IK Sub A', '12.00', 'Dokumen'),
  raw('sub-kegiatan', 'PRG ***', 'KEG ****', 'SUB B *****', 'IK Sub B', '5.00', 'Kegiatan'),
]
{
  const susun = susunSasaranRenaksi(RA)
  ok('B1 penyusun Import Renaksi: satu baris per sub, nama & indikator dibersihkan, target angka + satuan',
    susun.length === 2 && susun[0].program === 'Meningkatnya Mutu' && susun[0].indikator_program === 'IKP Program' && susun[0].kegiatan === 'KEG'
    && susun[0].subkegiatan === 'SUB A' && susun[0].target_subkegiatan === '12' && susun[0].satuan_subkegiatan === 'Dokumen', JSON.stringify(susun[0]))
  const layar: (BarisSasaranPk & { _deleted?: boolean })[] = susun.map(r => ({ ...r, asal: 'RENAKSI' as const }))
  ok('B2 isi layar = Renaksi → tidak ada perubahan', jumlahPerubahanSasaran(bandingSasaranPk(layar, susun)) === 0)
  const layarLama = layar.map((r, i) => i === 0 ? { ...r, indikator_subkegiatan: '(1) IK SUB A ***', program: 'MENINGKATNYA MUTU' } : r)
  ok('B2b penanda & huruf besar di indikator/nama tidak dianggap berubah', jumlahPerubahanSasaran(bandingSasaranPk(layarLama, susun)) === 0)
  ok('B2c satuan "Persen" yang diketik = "%" hasil Import', jumlahPerubahanSasaran(bandingSasaranPk(layar.map(r => ({ ...r, satuan_program: 'Persen', satuan_kegiatan: 'persen' })), susun)) === 0)

  const RA2 = RA.map(r => r.sub_kegiatan === 'SUB A *****' ? { ...r, target_tahunan: '15.00' } : r)
    .filter(r => r.sub_kegiatan !== 'SUB B *****')
    .concat(raw('sub-kegiatan', 'PRG ***', 'KEG ****', 'SUB C *****', 'IK Sub C', '1.00', 'Laporan'))
  const h = bandingSasaranPk(layar, susunSasaranRenaksi(RA2))
  ok('B3 target berubah → "isinya berubah" dengan kolomnya; sub dihapus → tidak ada lagi; sub baru → baru',
    h.berubah.length === 1 && h.berubah[0].idx === 0 && h.berubah[0].kolom.join() === 'Target sub kegiatan'
    && h.hilang.join() === '1' && h.baru.length === 1 && h.baru[0].baris.subkegiatan === 'SUB C', JSON.stringify(h))
  // Indikator diganti teksnya: tetap berpasangan (nama sama, tinggal satu di masing-masing sisi).
  const RA3 = RA.map(r => r.sub_kegiatan === 'SUB A *****' ? { ...r, indikator: 'IK Sub A (revisi)' } : r)
  const h3 = bandingSasaranPk(layar, susunSasaranRenaksi(RA3))
  ok('B4 indikator berganti teks → "isinya berubah", bukan hilang + baru',
    h3.berubah.length === 1 && h3.berubah[0].kolom.join() === 'Indikator sub kegiatan' && h3.baru.length === 0 && h3.hilang.length === 0, JSON.stringify(h3))
  // Baris manual yang sama persis → belum bertanda (kolom kosong); yang dihapus di layar diabaikan.
  const manual = layar.map((r, i) => i === 1 ? { ...r, asal: 'MANUAL' as const } : r)
  const h4 = bandingSasaranPk(manual, susun)
  ok('B5 baris manual sama persis → "belum bertanda" tanpa beda', h4.belumBertanda.length === 1 && h4.belumBertanda[0].idx === 1 && h4.belumBertanda[0].kolom.length === 0 && jumlahPerubahanSasaran(h4) === 0)
  const h5 = bandingSasaranPk(layar.map((r, i) => i === 1 ? { ...r, _deleted: true } : r), susun, i => i !== 1)
  ok('B6 baris bertanda hapus tidak dihitung → baris Renaksi-nya terbaca baru', h5.baru.length === 1 && h5.hilang.length === 0)
  const hasil = terapkanSelarasSasaran(layar, h, new Set([kunciPilih.berubah(0), kunciPilih.hilang(1), kunciPilih.baru(h.baru[0].kunci)]), b => ({ ...b }))
  ok('B7 terapkan: isi disamakan, hilang jadi manual, baru ditambah bertanda',
    hasil[0].target_subkegiatan === '15' && hasil[1].asal === 'MANUAL' && hasil[2].subkegiatan === 'SUB C' && hasil[2].asal === 'RENAKSI' && hasil.length === 3)
  ok('B8 sesudah diterapkan: tidak ada perubahan tersisa', jumlahPerubahanSasaran(bandingSasaranPk(hasil, susunSasaranRenaksi(RA2))) === 0)
  // Satu sub dengan DUA indikator yang sama-sama berubah target: pasangan lewat indikatornya.
  const RA4 = [...RA, raw('sub-kegiatan', 'PRG ***', 'KEG ****', 'SUB A *****', 'IK Sub A2', '3.00', 'Dokumen')]
  const layar4 = susunSasaranRenaksi(RA4).map(r => ({ ...r, asal: 'RENAKSI' as const }))
  const RA4b = RA4.map(r => r.indikator === 'IK Sub A' ? { ...r, target_tahunan: '13.00' } : r.indikator === 'IK Sub A2' ? { ...r, target_tahunan: '4.00' } : r)
  const urutBalik = susunSasaranRenaksi(RA4b).reverse()
  const h6 = bandingSasaranPk(layar4, urutBalik)
  ok('B9a dua indikator senama-sub berubah bersamaan: masing-masing berpasangan dengan indikatornya',
    h6.berubah.length === 2 && h6.berubah.every(x => x.kolom.join() === 'Target sub kegiatan'), JSON.stringify(h6.berubah.map(x => x.kolom)))
  const h7 = bandingSasaranPk(manual.map((r, i) => i === 1 ? { ...r, target_subkegiatan: '99' } : r), susun)
  const r7 = terapkanSelarasSasaran(manual, h7, new Set([kunciPilih.tanda(1)]), b => ({ ...b }))
  ok('B9b "tandai" baris manual: isi disamakan dengan Renaksi + tanda', h7.belumBertanda[0]?.kolom.join() === 'Target sub kegiatan' && r7[1].asal === 'RENAKSI' && r7[1].target_subkegiatan === '5')
  ok('B9 sasaranAdaDiRenaksi: tingkat terdalam (outcome/nama + indikator, penanda dibuang)',
    sasaranAdaDiRenaksi({ ...susun[0], indikator_subkegiatan: '(2) ik sub a ***' }, RA) && !sasaranAdaDiRenaksi({ ...susun[0], indikator_subkegiatan: 'lain' }, RA)
    && sasaranAdaDiRenaksi({ ...susun[0], kegiatan: null, subkegiatan: null }, RA))
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('E. Pasangan indikator mengikuti tautan Renaksi')
{
  // Program 2 indikator × kegiatan 3 indikator. Tanpa tautan = 6 pasangan (cara lama).
  const t = (id: number, r: RaSasaranSrc, induk: number | null = null): RaSasaranSrc => ({ ...r, id, induk_indikator_id: induk })
  const P1 = t(1, raw('program', 'PRG', null, null, 'IP1', '1'))
  const P2 = t(2, raw('program', 'PRG', null, null, 'IP2', '1'))
  const k = (id: number, ind: string, induk: number | null) => t(id, raw('kegiatan', 'PRG', 'KEG', null, ind, '1'), induk)
  const lepas = [P1, P2, k(3, 'IK1', null), k(4, 'IK2', null), k(5, 'IK3', null)]
  ok('E1 tanpa tautan: tetap dipasangkan semua (cara lama, 2 × 3 = 6)', susunSasaranRenaksi(lepas).length === 6)
  const taut = [P1, P2, k(3, 'IK1', 1), k(4, 'IK2', 1), k(5, 'IK3', 2)]
  const s = susunSasaranRenaksi(taut)
  ok('E2 bertautan: tiap kegiatan hanya dengan indikator program yang dijabarkannya (3 baris)',
    s.length === 3 && s.filter(r => r.indikator_program === 'IP1').map(r => r.indikator_kegiatan).join() === 'IK1,IK2'
    && s.filter(r => r.indikator_program === 'IP2').map(r => r.indikator_kegiatan).join() === 'IK3', JSON.stringify(s.map(r => [r.indikator_program, r.indikator_kegiatan])))
  const campur = [P1, P2, k(3, 'IK1', 1), k(4, 'IK2', null), k(5, 'IK3', 99)]
  ok('E3 campuran: belum tertaut / tautan usang (id di luar program itu) tetap ke semua indikator',
    susunSasaranRenaksi(campur).length === 1 + 2 + 2, String(susunSasaranRenaksi(campur).length))
  const P3 = t(6, raw('program', 'PRG', null, null, 'IP3', '1'))
  const s4 = susunSasaranRenaksi([...taut, P3])
  ok('E4 indikator program tanpa kegiatan tertaut tetap muncul sebagai baris program saja',
    s4.some(r => r.indikator_program === 'IP3' && r.kegiatan === null) && s4.length === 4)
  const sub = (id: number, ind: string, induk: number | null) => t(id, raw('sub-kegiatan', 'PRG', 'KEG', 'SUB', ind, '1'), induk)
  const s5 = susunSasaranRenaksi([P1, k(3, 'IK1', 1), k(4, 'IK2', 1), sub(7, 'IS1', 4)])
  ok('E5 sub kegiatan juga mengikuti tautannya ke indikator kegiatan',
    s5.length === 2 && s5.find(r => r.indikator_kegiatan === 'IK1')?.subkegiatan === null
    && s5.find(r => r.indikator_kegiatan === 'IK2')?.indikator_subkegiatan === 'IS1', JSON.stringify(s5.map(r => [r.indikator_kegiatan, r.indikator_subkegiatan])))

  // Master PK berisi 6 pasangan lama; Renaksi kini tertaut → 3 pasangan kelebihan.
  const layar = susunSasaranRenaksi(lepas).map(r => ({ ...r, asal: 'RENAKSI' as const }))
  const h = bandingSasaranPk(layar, s)
  ok('E6 pasangan lama dibaca "pasangan lepas", bukan "tidak ada lagi" atau "isinya berubah"',
    h.pasanganLepas.length === 3 && h.hilang.length === 0 && h.berubah.length === 0 && h.baru.length === 0, JSON.stringify(h))
  ok('E7 spanduk menyebutnya', kalimatSpandukPk({ baru: 0, hilang: 0, pasangan: h.pasanganLepas.length }, 2026) === 'Rencana Aksi 2026 berbeda dari isi layar ini: 3 pasangan indikator tidak tertaut lagi.')
  const pilih = new Set(h.pasanganLepas.map(kunciPilih.pasangan))
  const r = terapkanSelarasSasaran(layar, h, pilih, b => ({ ...b }), x => ({ ...x, _deleted: true }))
  ok('E8 terapkan: yang dicentang ditandai hapus di layar (berhenti di form)', r.filter(x => (x as { _deleted?: boolean })._deleted).length === 3 && r.length === 6)
  ok('E9 sesudahnya tidak ada perubahan tersisa',
    jumlahPerubahanSasaran(bandingSasaranPk(r, s, i => !(r[i] as { _deleted?: boolean })._deleted)) === 0)
  const tanpaHapus = terapkanSelarasSasaran(layar, h, pilih, b => ({ ...b }))
  ok('E10 tanpa penanda hapus: hanya dilepas tandanya, tidak pernah dibuang diam-diam',
    tanpaHapus.length === 6 && tanpaHapus.filter(x => x.asal === 'MANUAL').length === 3)
  // Entitas yang benar-benar dihapus di Renaksi tetap "tidak ada lagi", bukan pasangan lepas.
  const h2 = bandingSasaranPk(layar, susunSasaranRenaksi([P1, P2, k(3, 'IK1', 1), k(4, 'IK2', 1)]))
  ok('E11 indikator yang hilang dari Renaksi tetap "tidak ada lagi"',
    h2.hilang.length === 2 && h2.pasanganLepas.length === 2, JSON.stringify({ hilang: h2.hilang, lepas: h2.pasanganLepas }))
  ok('E12 aturan bersama: belum tertaut & usang = milik semua; tertaut = milik indikatornya saja',
    anakMilikIndikator(null, 1, new Set([1, 2])) && anakMilikIndikator(99, 1, new Set([1, 2]))
    && anakMilikIndikator(1, 1, new Set([1, 2])) && !anakMilikIndikator(2, 1, new Set([1, 2])))
  const rS = sumber('app/api/perjanjian-kinerja/sasaran/import-renaksi/route.ts')
  const rB = sumber('app/api/perjanjian-kinerja/banding-renaksi/route.ts')
  ok('E13 kedua route penyusun membaca id + induk_indikator_id (tanpanya semua kembali cara lama)',
    [rS, rB].every(x => /SELECT id, level[\s\S]*?induk_indikator_id\s+FROM rencana_aksi/.test(x)))

  // Cetak Renaksi: aturan yang sama di pohon cetak (layar, PDF, Excel, tabel LKJIP).
  const rr = (id: number, level: RaRow['level'], program: string, kegiatan: string | null, indikator: string, induk: number | null, sasaran: string | null = null): RaRow =>
    ({ id, level, program, kegiatan, sub_kegiatan: null, sasaran, tujuan: null, indikator, induk_indikator_id: induk } as RaRow)
  const pohon = buildHierarchyRows([
    rr(10, 'sasaran', 'SAS', null, 'IS', null),
    rr(1, 'program', 'PRG', null, 'IP1', null, 'SAS'), rr(2, 'program', 'PRG', null, 'IP2', null, 'SAS'),
    rr(3, 'kegiatan', 'PRG', 'KEG A', 'IKA', 2), rr(4, 'kegiatan', 'PRG', 'KEG B', 'IKB', null),
  ]).map(h => h.source.indikator)
  ok('E14 Cetak: kegiatan tertaut tampil di bawah indikator program yang dijabarkannya; yang belum tertaut di bawah indikator pertama',
    pohon.join() === 'IS,IP1,IKB,IP2,IKA', pohon.join())
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('C. Sambungan kode')
const rP = sumber('app/api/perjanjian-kinerja/program/route.ts')
const rS = sumber('app/api/perjanjian-kinerja/sasaran/route.ts')
ok('C1 Master Program & Sasaran membaca dan menulis asal',
  rP.includes('SELECT id, program, kegiatan, subkegiatan, tahun, level, asal') && rP.includes("r.asal ?? 'MANUAL'") && rP.includes("'level','asal','created_by'")
  && rS.includes('satuan_subkegiatan, tahun, asal') && rS.includes("r.asal ?? 'MANUAL'") && rS.includes("'asal','tahun','created_by'"))
const kP = sumber('app/(dashboard)/perjanjian-kinerja/program/program-client.tsx')
const kS = sumber('app/(dashboard)/perjanjian-kinerja/sasaran/sasaran-client.tsx')
ok('C2 Import Renaksi menandai baris RENAKSI; Simpan mengirim asal (kedua layar)',
  kP.includes("asal:        'RENAKSI',") && kP.includes("asal:        r.asal ?? 'MANUAL',") && kS.includes("asal: 'RENAKSI',") && kS.includes("asal:                  r.asal ?? 'MANUAL',"))
ok('C3 Perbarui berhenti di form: tidak ada fetch tulis di penerapnya',
  [kP, kS].every(s => { const i = s.indexOf('function terapkanPerbarui'); const b = s.slice(i, s.indexOf('\n  }\n', i)); return i > 0 && !b.includes('fetch') && b.includes('setRows(') }))
const rB = sumber('app/api/perjanjian-kinerja/banding-renaksi/route.ts')
ok('C4 route bahan: sakelar dulu, lalu hak MENGUBAH menu', rB.indexOf('await pkMati(') < rB.indexOf('await bolehEditMenu(') && rB.includes('susunSasaranRenaksi(raRows)'))
{
  // Tahap G: baris kembar yang digabung (Simpan & Rapikan Nama) mewariskan tanda RENAKSI.
  const g = buangProgramKembar([
    { program: 'PROGRAM X', kegiatan: null, asal: 'MANUAL' as const },
    { program: 'program x ', kegiatan: null, asal: 'RENAKSI' as const },
    { program: 'PROGRAM Y', kegiatan: null, asal: 'MANUAL' as const },
  ])
  ok('C6 kembar digabung: yang dipertahankan mewarisi RENAKSI, baris lain tidak tersentuh',
    g.kembar === 1 && g.unik[0].asal === 'RENAKSI' && g.unik[0].program === 'PROGRAM X' && g.unik[1].asal === 'MANUAL')
  const r = rapikanBarisProgram([{ program: 'Program Z', asal: 'MANUAL' as const }, { program: 'Program Z ***', asal: 'RENAKSI' as const }])
  ok('C7 Rapikan Nama memakai aturan yang sama', r.rows.length === 1 && r.rows[0].asal === 'RENAKSI')
  ok('C8 baris tanpa kolom asal (tab lama) tidak dikarang tandanya',
    !('asal' in buangProgramKembar([{ program: 'A' }, { program: 'a', asal: 'RENAKSI' as const }]).unik[0]))
}
ok('C5 skema acuan memuat asal di kedua tabel', (sumber('docs/schema-mysql.sql').match(/asal\s+ENUM\('MANUAL','RENAKSI'\) NOT NULL DEFAULT 'MANUAL' COMMENT 'RENAKSI = diambil lewat Import Renaksi \(migration-pk-asal\)'/g) ?? []).length === 2)

// ─────────────────────────────────────────────────────────────────────────────
console.log('D. Isi awal migrasi = aturan murni (MySQL kotak pasir 2094)')
const TAHUN = '2094'
const c = await mysql.createConnection({
  host: process.env.MYSQL_HOST, port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER, password: process.env.MYSQL_PASSWORD, database: process.env.MYSQL_DATABASE,
})
const q = async <T,>(s: string, p: unknown[] = []) => ((await c.query(s, p)) as [T[], unknown])[0]
const bersih = async () => {
  await c.query('DELETE FROM pk_program WHERE tahun = ?', [TAHUN])
  await c.query('DELETE FROM pk_sasaran WHERE tahun = ?', [TAHUN])
  await c.query('DELETE FROM rencana_aksi WHERE tahun = ?', [Number(TAHUN)])
}
await bersih()
try {
  for (const r of RA) {
    await c.query(`INSERT INTO rencana_aksi (tahun, level, program, kegiatan, sub_kegiatan, outcome_program, indikator, satuan, target_tahunan, sasaran)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'SAS')`, [Number(TAHUN), r.level, r.program, r.kegiatan, r.sub_kegiatan, r.outcome_program, r.indikator, r.satuan, r.target_tahunan])
  }
  const programPk: [string, string | null, string | null, string][] = [
    ['prg', null, null, 'program'], ['PRG', 'KEG', null, 'kegiatan'], ['PRG', 'KEG', 'SUB A', 'subkegiatan'],
    ['PRG', 'LAIN', null, 'kegiatan'], ['Manual', null, null, 'program'], ['PRG', 'KEG', 'SUB Z', 'subkegiatan'],
    ['OTHER', 'KEG', null, 'kegiatan'], ['OTHER', 'KEG', 'SUB A', 'subkegiatan'],
  ]
  for (const [p, k, s, lv] of programPk) await c.query('INSERT INTO pk_program (program, kegiatan, subkegiatan, tahun, level) VALUES (?, ?, ?, ?, ?)', [p, k, s, TAHUN, lv])
  const sas = susunSasaranRenaksi(RA)
  const sasaranPk = [
    sas[0], { ...sas[1], indikator_subkegiatan: '(3) IK SUB B' }, { ...sas[0], indikator_subkegiatan: 'Lain' },
    { ...sas[0], kegiatan: null, subkegiatan: null, indikator_kegiatan: null, indikator_subkegiatan: null },
    { ...sas[0], subkegiatan: null, indikator_subkegiatan: null }, { ...sas[0], program: 'Bukan', kegiatan: null, subkegiatan: null },
  ]
  for (const r of sasaranPk) {
    await c.query(`INSERT INTO pk_sasaran (program, indikator_program, kegiatan, indikator_kegiatan, subkegiatan, indikator_subkegiatan, tahun) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [r.program, r.indikator_program, r.kegiatan, r.indikator_kegiatan, r.subkegiatan, r.indikator_subkegiatan, TAHUN])
  }
  const mentah = sumber('docs/migrations/migration-pk-asal.sql').replace(/\r\n/g, '\n')
  const potong = mentah.slice(mentah.indexOf('/*UJI-AWAL*/') + 12, mentah.indexOf('/*UJI-AKHIR*/'))
  const langkah = potong.split('\n').filter(l => !l.trim().startsWith('--')).join('\n').split(/;\s*\n/).map(s => s.trim()).filter(Boolean)
  ok('D1 enam langkah isi awal ditemukan', langkah.length === 6, String(langkah.length))
  for (const s of langkah) await c.query(s.replace(/WHERE (m|s)\./, (_, a) => `WHERE ${a}.tahun = '${TAHUN}' AND ${a}.`))

  const raDb = await q<BarisRenaksi>('SELECT level, program, kegiatan, sub_kegiatan FROM rencana_aksi WHERE tahun = ?', [Number(TAHUN)])
  const progDb = await q<BarisProgramPk & { id: number }>('SELECT id, program, kegiatan, subkegiatan, level, asal FROM pk_program WHERE tahun = ? ORDER BY id', [TAHUN])
  const entri = entriProgramPk(progDb)
  const bedaP = progDb.filter((r, i) => (r.asal === 'RENAKSI') !== jalurAdaDiRenaksi(entri[i], raDb))
  ok('D2 pk_program: SQL migrasi = jalurAdaDiRenaksi di setiap baris', bedaP.length === 0, JSON.stringify(bedaP))
  ok('D3 pk_program: tebakan sesuai harapan', progDb.map(r => (r.asal ?? "?")[0]).join('') === 'RRRMMMMM', progDb.map(r => (r.asal ?? "?")[0]).join(''))
  const raRaw = await q<RaSasaranSrc>('SELECT level, program, kegiatan, sub_kegiatan, outcome_program, outcome_kegiatan, outcome_sub_kegiatan, indikator, satuan, target_tahunan FROM rencana_aksi WHERE tahun = ?', [Number(TAHUN)])
  const sasDb = await q<BarisSasaranPk & { id: number }>('SELECT * FROM pk_sasaran WHERE tahun = ? ORDER BY id', [TAHUN])
  const bedaS = sasDb.filter(r => (r.asal === 'RENAKSI') !== sasaranAdaDiRenaksi(r, raRaw))
  ok('D4 pk_sasaran: SQL migrasi = sasaranAdaDiRenaksi di setiap baris', bedaS.length === 0, JSON.stringify(bedaS.map(r => r.id)))
  ok('D5 pk_sasaran: tebakan sesuai harapan', sasDb.map(r => (r.asal ?? "?")[0]).join('') === 'RRMRRM', sasDb.map(r => (r.asal ?? "?")[0]).join(''))
} finally {
  await bersih()
  const sisa = await q<{ n: number }>('SELECT (SELECT COUNT(*) FROM pk_program WHERE tahun = ?) + (SELECT COUNT(*) FROM pk_sasaran WHERE tahun = ?) + (SELECT COUNT(*) FROM rencana_aksi WHERE tahun = ?) AS n', [TAHUN, TAHUN, Number(TAHUN)])
  ok('D6 kotak pasir 2094 bersih kembali', Number(sisa[0]?.n) === 0)
  await c.end()
}

console.log(`\n${lulus} lulus, ${gagal.length} gagal`)
if (gagal.length) { console.log(gagal.map(g => `  - ${g}`).join('\n')); process.exit(1) }
process.exit(0)
