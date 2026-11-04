#!/usr/bin/env npx tsx
// scripts/test-lkjip-tabel-dari-modul.mts — "Salin ke LKJIP" (tabel modul → tempel tertaut di LKJIP),
// sumber E-Anggaran Cetak Detail, dan ubah bentuk tabel tertaut lewat klik kanan (baris tangan,
// sembunyikan baris, hapus kolom). Konsep: docs/CONCEPT-lkjip-tabel-dari-modul.md
// Jalankan: npx tsx scripts/test-lkjip-tabel-dari-modul.mts
import { readFileSync } from 'node:fs'
import {
  htmlSalinan, bacaSalinan, templatDariSalinan, centangAwalSalinan, LEWAT_BATAS_KOLOM, type SalinanModul,
} from '../lib/lkjip/salinan-modul'
import { salinanKinerjaRekap, KOLOM_KINERJA_REKAP } from '../lib/lkjip/sumber/kinerja-rekap'
import { salinanRenaksiCetak } from '../lib/lkjip/sumber/renaksi-cetak'
import { salinanKinerjaLaporan } from '../lib/lkjip/sumber/kinerja-laporan'
import {
  salinanKinerjaDetail, setelanKinerjaDetail, tarikKinerjaDetail, KOLOM_KINERJA_DETAIL, labelPilihanVersiDetail,
} from '../lib/lkjip/sumber/kinerja-detail'
import { DAFTAR_SUMBER, URUTAN_SUMBER } from '../lib/lkjip/sumber'
import { DEFAULT_CETAK_FILTER } from '../app/(dashboard)/rencana-aksi/_lib/cetak-filter'
import {
  bangunBadan, sisipBarisTangan, buangBarisTertaut, hapusKolomTertaut, ambilIsianTangan, nilaiPerbarui, kunciBarisTangan, hitungRumusTangan,
  alasanTakBisaSisipTangan, BATAS_BARIS_TANGAN,
  type HasilTarik, type Tautan, type PayloadTertaut, type BarisTangan,
} from '../lib/lkjip/tautan'
import { TabelPayloadSchema } from '../lib/lkjip/schemas'
import { tabelBelumDiisi } from '../lib/lkjip/tabel'
import type { RealRow } from '../app/(dashboard)/kinerja/_types'

let lulus = 0
const gagal: string[] = []
function ok(nama: string, syarat: unknown, ket = '') {
  if (syarat) { lulus++; console.log(`  ok  ${nama}`) }
  else { gagal.push(nama); console.log(`FAIL  ${nama}${ket ? ' — ' + ket : ''}`) }
}
const kode = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
const coba = async <T,>(f: () => Promise<T>): Promise<T | Error> => { try { return await f() } catch (e) { return e as Error } }
const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64')

// ─────────────────────────────────────────────────────────────────────────────
console.log('A. Format salinan')
const S: SalinanModul = { v: 1, sumber: 'kinerja-rekap', setelan: { tahun: 2040, sdBulan: 9, versi: 'murni', kedalaman: 'program' },
  kolom: ['label', 'pagu', 'realKeu'], judulKolom: ['Uraian', 'Anggaran', 'Realisasi'], judul: 'Rekap — Capaian é 2040' }
const html = htmlSalinan(S, '<table><tr><td>x</td></tr></table>')
ok('A1 tabel HTML tetap ada (Word/Excel bisa menempelnya) + resep bolak-balik utuh, termasuk huruf non-ASCII',
  html.includes('<table><tr><td>x</td></tr></table>') && JSON.stringify(bacaSalinan(`<html><body><!--StartFragment-->${html}<!--EndFragment--></body></html>`)) === JSON.stringify(S))
const tanda = (o: unknown) => `<div data-prima-salinan="${b64(JSON.stringify(o))}"></div>`
ok('A2 bukan salinan / rusak / sumber asing / versi lain / kolom ngawur → ditolak',
  bacaSalinan('<table></table>') === null && bacaSalinan('<div data-prima-salinan="@@@"></div>') === null
  && bacaSalinan(tanda({ ...S, sumber: 'gaji-rahasia' })) === null && bacaSalinan(tanda({ ...S, v: 2 })) === null
  && bacaSalinan(tanda({ ...S, kolom: [] })) === null && bacaSalinan(tanda({ ...S, kolom: Array(41).fill('x') })) === null
  && bacaSalinan(tanda({ ...S, kolom: [1, 2] })) === null && bacaSalinan(tanda({ ...S, setelan: [1] })) === null
  && bacaSalinan(tanda({ ...S, setelan: { x: 'y'.repeat(5000) } })) === null)
const sk = bacaSalinan(tanda({ ...S, kelompok: [{ judul: 'K', dari: 0, sampai: 1 }, { judul: 'rusak', dari: 2, sampai: 9 }, { judul: 'mundur', dari: 2, sampai: 1 }] }))
ok('A3 kelompok kepala di luar jangkauan kolom dibuang', sk?.kelompok?.length === 1 && sk.kelompok[0].judul === 'K')

const S6: SalinanModul = { v: 1, sumber: 'renaksi-cetak', setelan: {}, judul: 'R',
  kolom: ['indikator', 'tw1t', 'tw1r', 'tw2t', 'tw2r', 'capaian'], judulKolom: ['Indikator', 'T', 'R', 'T', 'R', 'Capaian'],
  kelompok: [{ judul: 'TW I', dari: 1, sampai: 2 }, { judul: 'TW II', dari: 3, sampai: 4 }] }
const t6 = templatDariSalinan(S6, DAFTAR_SUMBER['renaksi-cetak'].kolom(), [true, true, false, false, false, true])
ok('A4 kolom yang dicentang saja; judul seperti layar modul; kelompok merapat, yang kosong hilang',
  t6.kolom.map(k => k.judul).join() === 'Indikator,T,Capaian' && JSON.stringify(t6.kelompok) === JSON.stringify([{ judul: 'TW I', dari: 1, sampai: 1 }])
  && t6.kolom.every(k => k.taut.isi.jenis === 'sumber') && t6.sumber === 'renaksi-cetak', JSON.stringify(t6))
ok('A5 rata kanan untuk kolom angka/persen/rupiah, kiri untuk teks', t6.kolom[0].align === 'left' && t6.kolom[2].align === 'right')
const s13 = salinanKinerjaRekap({ tahun: 2040, sdBulan: 9, versi: 'murni', kedalaman: 'program' })
ok('A6 Rekap: 13 kolom → 12 pertama dicentang, pesan menyebut batasnya', s13.kolom.length === 13 && centangAwalSalinan(s13).filter(Boolean).length === 12
  && centangAwalSalinan(s13)[12] === false && LEWAT_BATAS_KOLOM(13).includes('12') && centangAwalSalinan(S).every(Boolean))
ok('A7 Rekap: kolom = katalog sumbernya, setelan = layar', JSON.stringify(s13.kolom) === JSON.stringify(KOLOM_KINERJA_REKAP.map(k => k.kunci)) && s13.setelan.versi === 'murni')
const sr = salinanRenaksiCetak(2045, { ...DEFAULT_CETAK_FILTER, colMode: 'both', showTw: true })
ok('A8 Renaksi: kepala TW I–IV masing-masing T/R, kolom = cetakHeader filter layar',
  sr.kelompok?.map(k => `${k.judul}:${k.sampai - k.dari + 1}`).join() === 'TW I:2,TW II:2,TW III:2,TW IV:2'
  && sr.judulKolom?.[sr.kelompok![0].dari] === 'T' && sr.judulKolom?.[sr.kelompok![0].dari + 1] === 'R'
  && sr.kolom.every(k => DAFTAR_SUMBER['renaksi-cetak'].kolom().some(x => x.kunci === k)), JSON.stringify(sr.kelompok))
const srT = salinanRenaksiCetak(2045, { ...DEFAULT_CETAK_FILTER, colMode: 'target', showTw: true })
ok('A9 Renaksi hanya Target: tiap TW satu kolom', srT.kelompok?.every(k => k.dari === k.sampai) && !srT.kolom.includes('tw1r'))
const sl = salinanKinerjaLaporan({ tahun: 2040, tampilan: 'bulanan', sumber: 'BLUD' })
ok('A10 Laporan: kolom mengikuti tampilannya', sl.kolom.includes('akumKeu') && !sl.kolom.includes('versi')
  && salinanKinerjaLaporan({ tahun: 2040, tampilan: 'sumber', sumber: 'GAJI' }).kolom.includes('versi'))
ok('A11 Cetak Detail: setelan versi disaring (berlaku / murni / TIPE:SEQ), sisanya jatuh ke berlaku',
  setelanKinerjaDetail({ versi: 'PERUBAHAN:1' }, 2040).versi === 'PERUBAHAN:1' && setelanKinerjaDetail({ versi: 'murni' }, 2040).versi === 'murni'
  && setelanKinerjaDetail({ versi: 'DROP TABLE' }, 2040).versi === 'berlaku' && setelanKinerjaDetail({ bulan: 99 }, 2040).bulan === 12
  && labelPilihanVersiDetail('PERUBAHAN:1') === 'Versi PERUBAHAN-1 (tetap)')
const sd = salinanKinerjaDetail({ tahun: 2040, sumber: 'BLUD', bulan: 3, versi: 'MURNI:0' })
ok('A11b Cetak Detail: semua 15 kolom, judul menyebut sumber & bulan, versi apa adanya', sd.kolom.length === 15 && sd.judul.includes('BLUD') && sd.judul.includes('Maret')
  && sd.setelan.versi === 'MURNI:0')
ok('A12 sumber baru terdaftar di registry, Zod, dan pemilih', URUTAN_SUMBER.includes('kinerja-detail') && DAFTAR_SUMBER['kinerja-detail'].modul === 'E-Anggaran'
  && kode('lib/lkjip/schemas.ts').includes("'pk', 'kinerja-detail'] as const"))

// ─────────────────────────────────────────────────────────────────────────────
console.log('B. Sumber Cetak Detail')
const rr = (bulan: number, cid: string, ket: string, real: number, lain: Partial<RealRow> = {}): RealRow => ({
  bulan, keterangan: ket, program: 'P', kegiatan: 'K', subkegiatan: 'S', uraian_ssk: 'U', ssk_canonical_id: cid,
  pagu_awal: 1_200_000, target_fisik: 0, target_rp: 100_000, real_fisik: real, pct_fisik: 0, akum_target_fisik: 0, akum_target_rp: 0,
  akum_real_fisik: 0, akum_pct_fisik: 0, real_keuangan: real, pct_keuangan: 0, akum_keuangan: 0, akum_pct_keuangan: 0,
  deviasi_fisik: 0, deviasi_keuangan: 0, ...lain,
} as RealRow)
const ROWS = [rr(1, 'G1', 'Gaji', 100_000), rr(2, 'G1', 'Gaji', 200_000), rr(2, 'G2', 'Tunjangan', 50_000), rr(2, 'X9', 'Yatim', 70_000, { yatim: true, pagu_awal: 0 })]
const dipanggil: string[] = []
const ambil = (slot: unknown[] | null) => async (url: string) => {
  dipanggil.push(url)
  if (url.includes('/ssk/versi-list')) return slot ? { ok: true as const, items: slot } : { ok: false as const, status: 403, message: 'Forbidden' }
  return { ok: true as const, rows: ROWS }
}
const SLOT = [{ versi_tipe: 'MURNI', versi_seq: 0 }, { versi_tipe: 'PERUBAHAN', versi_seq: 1 }]
const hB = await tarikKinerjaDetail(setelanKinerjaDetail({ tahun: 2040, sumber: 'GAJI', bulan: 2, versi: 'berlaku' }, 2040), ambil(SLOT))
ok('B1 versi berlaku = versi terakhir; tanpa kabar versi', dipanggil.at(-1)!.includes('versi_tipe=PERUBAHAN&versi_seq=1') && (hB.info ?? []).length === 0)
const jumlah = hB.baris.at(-1)!
ok('B2 baris bulan terpilih saja, kunci = identitas rekening, JUMLAH di akhir & tebal',
  hB.baris.map(b => b.kunci).join() === 'cid:G1,cid:G2,cid:X9,r:jumlah' && jumlah.tebal === true && jumlah.label === 'JUMLAH')
ok('B3 Akum. menjumlah bulan sebelumnya (dihitung setahun dulu, baru disaring)', hB.baris[0].sel.akumKeu === 300_000, String(hB.baris[0].sel.akumKeu))
ok('B4 yatim ditandai di uraian & TIDAK ikut JUMLAH; catatannya disebut',
  String(hB.baris[2].sel.uraian).includes('tidak ada di SSK PERUBAHAN-1') && jumlah.sel.realKeu === 250_000 && jumlah.sel.pagu === 2_400_000
  && hB.catatan.some(c => c.includes('tidak ikut dijumlah')), JSON.stringify([jumlah.sel.realKeu, jumlah.sel.pagu, hB.catatan]))
ok('B5 judul kolom = kepala Cetak Detail', KOLOM_KINERJA_DETAIL[1].label === 'Uraian Kegiatan' && KOLOM_KINERJA_DETAIL.length === 15)
const hM = await tarikKinerjaDetail(setelanKinerjaDetail({ tahun: 2040, sumber: 'GAJI', bulan: 2, versi: 'murni' }, 2040), ambil(SLOT))
ok('B6 versi Murni padahal Perubahan sudah ada → kabar versi lebih baru', dipanggil.at(-1)!.includes('versi_tipe=MURNI&versi_seq=0')
  && hM.info?.[0]?.includes('GAJI PERUBAHAN-1') === true && hM.ringkas.includes('SSK MURNI'), JSON.stringify(hM.info))
const hT = await tarikKinerjaDetail(setelanKinerjaDetail({ tahun: 2040, sumber: 'GAJI', bulan: 2, versi: 'PERUBAHAN:1' }, 2040), ambil(SLOT))
ok('B7 versi tetap yang memang terbaru → tanpa kabar', (hT.info ?? []).length === 0)
const hilang = await coba(() => tarikKinerjaDetail(setelanKinerjaDetail({ tahun: 2040, sumber: 'GAJI', bulan: 2, versi: 'PERUBAHAN:2' }, 2040), ambil(SLOT)))
const tolak = await coba(() => tarikKinerjaDetail(setelanKinerjaDetail({ tahun: 2040, sumber: 'GAJI', bulan: 2 }, 2040), ambil(null)))
ok('B8 versi yang tidak ada / akses ditolak → galat bertutur, bukan tabel kosong',
  hilang instanceof Error && hilang.name === 'GagalTarik' && hilang.message.includes('PERUBAHAN-2')
  && tolak instanceof Error && tolak.name === 'GagalTarik', `${(hilang as Error).message} | ${(tolak as Error).message}`)

// ─────────────────────────────────────────────────────────────────────────────
console.log('C. Tabel tertaut: baris tangan, sembunyikan, hapus kolom')
const HASIL: HasilTarik = {
  kolom: [{ kunci: 'grup', label: 'Grup', jenis: 'teks' }, { kunci: 'label', label: 'Uraian', jenis: 'teks' }, { kunci: 'pagu', label: 'Pagu', jenis: 'angka' }],
  baris: [
    { kunci: 'a', label: 'A', sel: { grup: 'X', label: 'A', pagu: 1 } },
    { kunci: 'b', label: 'B', sel: { grup: 'X', label: 'B', pagu: 2 } },
    { kunci: 'c', label: 'C', sel: { grup: 'Y', label: 'C', pagu: 3 } },
  ],
  catatan: [], ringkas: 'uji',
}
const KOLOM: Tautan['kolom'] = [
  { isi: { jenis: 'nomor' } }, { isi: { jenis: 'sumber', kunci: 'grup' }, gabungSama: true },
  { isi: { jenis: 'sumber', kunci: 'label' } }, { isi: { jenis: 'sumber', kunci: 'pagu' } }, { isi: { jenis: 'rumus', ekspresi: '=D*2' } },
]
const bt = (id: string, setelah: string | null, sel: string[]): BarisTangan => ({ id, setelah, sel })
const resep = (barisTangan: BarisTangan[] = [], sembunyi: string[] = []) => ({ kolom: KOLOM, sembunyi, tebalInduk: true, barisTangan })
const b1 = bangunBadan(HASIL, resep([bt('t1', 'b', ['', 'X', 'Manual', '5', '']), bt('t0', null, ['', '', 'Atas', '', '']), bt('t9', 'zzz', ['', '', 'Yatim', '', ''])]))
ok('C1 urutan: tangan berjangkar kosong di atas, tiap baris sumber diikuti tangannya, jangkar hilang → akhir',
  b1.kunciBaris.join() === 'tangan:t0,a,b,tangan:t1,c,tangan:t9' && b1.barisTanganPindah.join() === 't9', b1.kunciBaris.join())
ok('C2 nomor urut ikut baris tangan; rumus kolom dihitung di baris tangan', b1.rows.map(r => r[0].v).join() === '1,2,3,4,5,6' && b1.rows[3][4].v === '10', JSON.stringify(b1.rows[3]))
ok('C3 gabung-sama ikut menimbang baris tangan (A, B, Manual sama-sama X)', b1.rows[1][1].rs === 3 && b1.rows[3][1].h === true, JSON.stringify(b1.rows.map(r => r[1])))
const b2 = bangunBadan(HASIL, resep([bt('t1', 'b', ['', 'Z', 'Manual', '', ''])], ['b']))
ok('C4 jangkar disembunyikan → baris tangan tetap di tempatnya', b2.kunciBaris.join() === 'a,tangan:t1,c' && b2.barisTanganPindah.length === 0, b2.kunciBaris.join())

const awal = (t: Partial<Tautan> = {}): PayloadTertaut => {
  const tautan: Tautan = { sumber: 'kinerja-rekap', setelan: {}, kolom: KOLOM, kunciBaris: [], sembunyi: [], tebalInduk: true, ditarikPada: '', ringkas: 'uji', catatan: [], ...t }
  const bd = bangunBadan(HASIL, tautan)
  return { judul: '', kolom: ['No', 'Grup', 'Uraian', 'Pagu', 'Dua kali'], align: [], headerRows: 1,
    rows: [[{ v: 'No' }, { v: 'Grup' }, { v: 'Uraian' }, { v: 'Pagu' }, { v: 'Dua kali' }], ...bd.rows], tautan: { ...tautan, kunciBaris: bd.kunciBaris } }
}
/** Operasi lokal harus menghasilkan tabel yang SAMA dengan menyusun ulang dari sumber. */
const samaDenganSusunUlang = (p: PayloadTertaut) => {
  const bd = bangunBadan(HASIL, p.tautan)
  return JSON.stringify(bd.kunciBaris) === JSON.stringify(p.tautan.kunciBaris) && JSON.stringify(bd.rows) === JSON.stringify(p.rows.slice(1))
}
const p0 = awal()
const p1 = sisipBarisTangan(p0, 0, 'n1')!
ok('C5 sisip di bawah baris sumber: tertambat padanya, posisi & isi = susun ulang dari sumber',
  p1.tautan.kunciBaris.join() === 'a,tangan:n1,b,c' && p1.tautan.barisTangan?.[0].setelah === 'a' && samaDenganSusunUlang(p1), p1.tautan.kunciBaris.join())
const p2 = sisipBarisTangan(p1, 1, 'n2')!
ok('C6 sisip di bawah baris tangan: ikut jangkarnya, tepat sesudahnya', p2.tautan.kunciBaris.join() === 'a,tangan:n1,tangan:n2,b,c'
  && p2.tautan.barisTangan?.map(b => `${b.id}@${b.setelah}`).join() === 'n1@a,n2@a' && samaDenganSusunUlang(p2))
const p3 = sisipBarisTangan(p2, 0, 'n3')!
ok('C7 sisip langsung di bawah baris sumber mendahului baris tangan lama di situ', p3.tautan.kunciBaris.join() === 'a,tangan:n3,tangan:n1,tangan:n2,b,c' && samaDenganSusunUlang(p3))
const pAtas = sisipBarisTangan(p0, -1, 'n0')!
ok('C8 sisip dari baris kepala terakhir → paling atas badan', pAtas.tautan.kunciBaris[0] === kunciBarisTangan('n0') && pAtas.tautan.barisTangan?.[0].setelah === null && samaDenganSusunUlang(pAtas))
ok('C9 batas baris tabel → ditolak (null)', sisipBarisTangan({ ...p0, rows: Array(500).fill(p0.rows[1]) }, 0, 'x') === null)

const ketik = (p: PayloadTertaut, r: number, c: number, v: string): PayloadTertaut => ({ ...p, rows: p.rows.map((row, i) => (i === r ? row.map((s, j) => (j === c ? { ...s, v } : s)) : row)) })
const pKetik = ketik(p1, 2, 2, 'Diketik')
const tKetik = ambilIsianTangan(pKetik.tautan, pKetik.rows.slice(1))
ok('C10 isian baris tangan ditangkap ke resepnya; kolom Nomor & rumus tidak', tKetik.barisTangan?.[0].sel.join('|') === '||Diketik||', JSON.stringify(tKetik.barisTangan))
const pX = ketik(p1, 2, 1, 'X')
const pXrapi = { ...pX, tautan: ambilIsianTangan(pX.tautan, pX.rows.slice(1)) }
const tGabung = ambilIsianTangan(bangunBadan(HASIL, pXrapi.tautan) && pXrapi.tautan, bangunBadan(HASIL, pXrapi.tautan).rows)
ok('C11 baris tangan yang tertutup gabung-sama tetap terbaca isinya (bukan kosong)', tGabung.barisTangan?.[0].sel[1] === 'X', JSON.stringify(tGabung.barisTangan))
ok('C12 isian baris tangan tidak dicatat sebagai isian tangan baris sumber', !JSON.stringify(ambilIsianTangan({ ...p1.tautan, kolom: [...KOLOM.slice(0, 4), { isi: { jenis: 'tangan', nilai: {} } }] }, p1.rows.slice(1)).kolom[4]).includes('tangan:'))

const pS = buangBarisTertaut(p1, 2)
ok('C13 sembunyikan baris sumber: masuk daftar sembunyi, baris tangan tetap, = susun ulang', pS.tautan.sembunyi.join() === 'b'
  && pS.tautan.kunciBaris.join() === 'a,tangan:n1,c' && samaDenganSusunUlang(pS), pS.tautan.kunciBaris.join())
const pH = buangBarisTertaut(p2, 1)
ok('C14 hapus baris tangan: hilang dari resep & tabel, tidak masuk daftar sembunyi', pH.tautan.barisTangan?.map(b => b.id).join() === 'n2'
  && pH.tautan.sembunyi.length === 0 && samaDenganSusunUlang(pH))

const pK = hapusKolomTertaut(p1, 2)
ok('C15 hapus kolom tertaut: resep, judul, isi baris tangan ikut; rumus menunjuk kolom yang bergeser',
  typeof pK !== 'string' && pK.kolom.join() === 'No,Grup,Pagu,Dua kali' && pK.tautan.kolom.length === 4
  && pK.tautan.kolom[3].isi.jenis === 'rumus' && (pK.tautan.kolom[3].isi as { ekspresi: string }).ekspresi === '=C*2'
  && pK.tautan.barisTangan?.[0].sel.length === 4 && pK.rows.every(r => r.length === 4), typeof pK === 'string' ? pK : JSON.stringify(pK.tautan.kolom[3]))
ok('C16 kolom yang dirujuk rumus / kolom terakhir → ditolak dengan alasan', typeof hapusKolomTertaut(p1, 3) === 'string'
  && String(hapusKolomTertaut(p1, 3)).includes('rumus') && typeof hapusKolomTertaut({ ...p1, kolom: ['A'], tautan: { ...p1.tautan, kolom: [KOLOM[2]] } }, 0) === 'string')

const tanpaB: HasilTarik = { ...HASIL, baris: HASIL.baris.filter(b => b.kunci !== 'b') }
const pB = sisipBarisTangan(p0, 1, 'nb')!
const n1 = nilaiPerbarui(pB, tanpaB)
ok('C17 jangkar baris tangan hilang dari sumber: Perbarui menyebutnya & menambatkannya ke baris terakhir',
  !n1.sama && n1.badan.barisTanganPindah.join() === 'nb' && n1.tautanBaru.barisTangan?.[0].setelah === 'c')
const n2 = nilaiPerbarui({ ...pB, rows: [pB.rows[0], ...n1.badan.rows], tautan: { ...n1.tautanBaru, ditarikPada: 'x' } }, tanpaB)
ok('C18 …lalu stabil: Perbarui berikutnya berkata sama', n2.sama, JSON.stringify(n2.ringkas))
ok('C19 baris tangan TIDAK membuat Perbarui menyala selama sumbernya sama', nilaiPerbarui(p2, HASIL).sama)
// Satu-satunya perubahan = jangkar baris tangan lenyap: jangkarnya baris TERSEMBUNYI terakhir, jadi
// baris yang tampil & urutannya sama persis — tanpa pemeriksaan ini resepnya terus menunjuk jangkar mati.
const pSem = buangBarisTertaut(sisipBarisTangan(p0, 2, 'nh')!, 2)
const tanpaC: HasilTarik = { ...HASIL, baris: HASIL.baris.filter(b => b.kunci !== 'c') }
const nSem = nilaiPerbarui(pSem, tanpaC)
ok('C20 jangkar tersembunyi lenyap (tampilan sama) → tetap dihitung berubah & ditambatkan ulang', pSem.tautan.kunciBaris.join() === 'a,b,tangan:nh'
  && nSem.ringkas.sama && !nSem.sama && nSem.tautanBaru.barisTangan?.[0].setelah === 'b',
  JSON.stringify([pSem.tautan.kunciBaris, nSem.ringkas.sama, nSem.tautanBaru.barisTangan]))
// Ditemukan di peramban: ketikan 250000000 di baris tangan tampil mentah di samping 1.800.000.000.
const fmt = (s: { nf?: string; dec?: number }) => `${s.nf ?? '-'}/${s.dec ?? '-'}`
ok('C21 sel baris tangan di kolom angka memakai format kolomnya — sisip lokal DAN susun ulang; kolom teks polos',
  p1.rows[2][3].nf === 'num' && fmt(p1.rows[2][3]) === fmt(p1.rows[1][3]) && fmt(b1.rows[3][3]) === fmt(b1.rows[2][3]) && !p1.rows[2][2].nf && !b1.rows[0][2].nf,
  JSON.stringify([p1.rows[2][3], p1.rows[1][3], b1.rows[3]]))
const pRumus = ketik(p1, 2, 3, '1.125')
const pRumusHitung = { ...pRumus, rows: hitungRumusTangan(pRumus.rows, 1, pRumus.tautan) }
ok('C22 kolom rumus baris tangan dihitung saat diketik (= susun ulang) — tanpa itu Periksa melapor "berubah" palsu',
  !nilaiPerbarui(pRumus, HASIL).sama && pRumusHitung.rows[2][4].v === '2.25' && nilaiPerbarui(pRumusHitung, HASIL).sama
  && hitungRumusTangan(p0.rows, 1, p0.tautan) === p0.rows, JSON.stringify(pRumusHitung.rows[2]))
// Audit 2026-11-04: rumus kolom membaca isian tangan dengan Number() — "1.250.000" → NaN → "—".
const HASIL_RP: HasilTarik = {
  kolom: [{ kunci: 'label', label: 'Uraian', jenis: 'teks' }, { kunci: 'pagu', label: 'Pagu', jenis: 'rp' }, { kunci: 'pct', label: '%', jenis: 'persen' },
    { kunci: 'ang', label: 'Indeks', jenis: 'angka' }],
  baris: [{ kunci: 'a', label: 'A', sel: { label: 'A', pagu: 2_000_000, pct: 50, ang: 1.125 } }], catatan: [], ringkas: 'uji',
}
const rumusTangan = (nilai: string) => bangunBadan(HASIL_RP, { kolom: [
  { isi: { jenis: 'sumber', kunci: 'label' } }, { isi: { jenis: 'sumber', kunci: 'pagu' } },
  { isi: { jenis: 'tangan', nilai: { a: nilai } } }, { isi: { jenis: 'rumus', ekspresi: '=B-C' } },
], sembunyi: [], tebalInduk: false }).rows[0][3].v
ok('C23 rumus kolom membaca isian tangan gaya Indonesia ("1.250.000", "Rp 1.250.000", "1250000,5") dan bentuk mesin ("7.5")',
  rumusTangan('1.250.000') === '750000' && rumusTangan('Rp 1.250.000') === '750000' && rumusTangan('1250000,5') === '749999.5'
  && rumusTangan('7.5') === '1999992.5' && rumusTangan('belum ada') === '—' && rumusTangan('') === '—',
  JSON.stringify(['1.250.000', 'Rp 1.250.000', '1250000,5', '7.5', 'belum ada', ''].map(rumusTangan)))
const rumusPct = bangunBadan(HASIL_RP, { kolom: [{ isi: { jenis: 'sumber', kunci: 'pct' } }, { isi: { jenis: 'rumus', ekspresi: '=A*2' } },
  { isi: { jenis: 'sumber', kunci: 'ang' } }, { isi: { jenis: 'rumus', ekspresi: '=C*2' } }], sembunyi: [], tebalInduk: false }).rows[0]
// "1.125" mesin = 1,125; dibaca gaya Indonesia = 1.125 ribu — hanya angka bertiga-desimal yang membedakan.
ok('C24 sel BERFORMAT tetap dibaca angka mesin — persen (0.5) tidak jadi ×100, "1.125" tidak jadi 1.125 ribu',
  rumusPct[0].nf === 'pct' && rumusPct[0].v === '0.5' && rumusPct[1].v === '1' && rumusPct[2].v === '1.125' && rumusPct[3].v === '2.25', JSON.stringify(rumusPct))
ok('C25 tabel kosong hasil "Tempel dari Modul" dikenali; yang berisi / tertaut / tanpa kepala tidak',
  tabelBelumDiisi({ headerRows: 1, rows: [[{ v: 'Kolom 1' }, { v: 'Kolom 2' }], [{ v: '' }, { v: ' ' }]] })
  && !tabelBelumDiisi({ headerRows: 1, rows: [[{ v: 'K' }], [{ v: 'x' }]] })
  && !tabelBelumDiisi({ headerRows: 1, rows: [[{ v: 'K' }], [{ v: '' }]], tautan: {} })
  && !tabelBelumDiisi({ headerRows: 0, rows: [[{ v: 'Kolom 1' }]] }) && !tabelBelumDiisi(null))
const penuhTangan = { ...p1, tautan: { ...p1.tautan, barisTangan: Array.from({ length: BATAS_BARIS_TANGAN }, (_, i) => bt(`z${i}`, 'a', ['', '', '', '', ''])) } }
ok('C26 batas baris tangan = batas skema: sisipan ke-201 ditolak di layar dengan alasan, bukan oleh server sesudahnya',
  BATAS_BARIS_TANGAN === 200 && alasanTakBisaSisipTangan(penuhTangan)?.includes('200 baris tangan') === true && sisipBarisTangan(penuhTangan, 0, 'x') === null
  && alasanTakBisaSisipTangan(p1) === null && kode('lib/lkjip/schemas.ts').includes('})).max(BATAS_BARIS_TANGAN).optional(),'))

// ─────────────────────────────────────────────────────────────────────────────
console.log('D. Skema (Zod)')
const lolos = TabelPayloadSchema.safeParse(p2)
ok('D1 baris tangan terdaftar di skema — tidak dibuang saat Simpan', lolos.success && lolos.data.tautan?.barisTangan?.length === 2, lolos.success ? '' : lolos.error.issues[0].message)
ok('D2 kunci tangan:… tanpa resepnya → ditolak', !TabelPayloadSchema.safeParse({ ...p2, tautan: { ...p2.tautan, barisTangan: [] } }).success)
ok('D3 isi baris tangan tidak sejajar kolom → ditolak', !TabelPayloadSchema.safeParse({ ...p2, tautan: { ...p2.tautan, barisTangan: p2.tautan.barisTangan!.map(b => ({ ...b, sel: ['x'] })) } }).success)
ok('D4 id baris tangan hanya huruf kecil & angka', !TabelPayloadSchema.safeParse({
  ...p1, tautan: { ...p1.tautan, kunciBaris: p1.tautan.kunciBaris.map(k => (k === 'tangan:n1' ? 'tangan:<b>' : k)), barisTangan: [{ ...p1.tautan.barisTangan![0], id: '<b>' }] },
}).success)

// ─────────────────────────────────────────────────────────────────────────────
console.log('E. Sambungan layar')
const te = kode('components/tabel/TabelEditor.tsx')
const tm = kode('app/(dashboard)/lkjip/[id]/TautanModal.tsx')
const ed = kode('app/(dashboard)/lkjip/[id]/editor-client.tsx')
const sk2 = kode('components/lkjip/SalinKeLkjip.tsx')
ok('E1 tombol Salin memakai event copy + execCommand (server kantor http), bukan Clipboard API',
  sk2.includes("document.addEventListener('copy', tangkap);") && sk2.includes("document.execCommand('copy')") && !sk2.includes('navigator.clipboard'))
ok('E2 tombol menyalin tabel di layar + resepnya', sk2.includes('htmlSalinan(salinan, t?.outerHTML ??'))
const layar: [string, string][] = [
  ['app/(dashboard)/kinerja/_tabs/CetakTab.tsx', 'kinerja-rekap'], ['app/(dashboard)/kinerja/_tabs/CetakTab.tsx', 'kinerja-detail'],
  ['app/(dashboard)/kinerja/_tabs/LaporanTab.tsx', 'kinerja-laporan'], ['app/(dashboard)/rencana-aksi/_components/CetakPanel.tsx', 'renaksi-cetak'],
]
ok('E3 empat tabel modul diberi penanda & tombol yang mencarinya', layar.every(([f, id]) => {
  const s = kode(f); return s.includes(`<table data-salin-lkjip="${id}"`) && s.includes(`'table[data-salin-lkjip="${id}"]'`)
}))
ok('E4 Cetak Detail: satu bulan saja; versi terbaru disalin sebagai Berlaku', kode('app/(dashboard)/kinerja/_tabs/CetakTab.tsx').includes("salinan={bulanEfektif === 'semua' ? null : salinanKinerjaDetail(")
  && kode('app/(dashboard)/kinerja/_tabs/CetakTab.tsx').includes("versi: versiDetail.terbaru ? 'berlaku' :"))
ok('E5 Ctrl+V di tabel: salinan modul dikenali → tawarkan tempel tertaut / biasa', te.includes('const salinan = lkjip && html && !nilaiSaja ? bacaSalinan(html) : null;')
  && te.includes("confirmLabel: 'Tempel tertaut', altLabel: 'Tempel biasa'") && te.includes("if (pilihan === 'lain') { tempelBiasa(); return; }"))
ok('E6 tempel tertaut = membuka modal tautan berisi salinan (berhenti di form, yang menulis tetap Masukkan)',
  te.includes('setSalinanModal(salinan);\n    setModalTaut(true);') && te.includes('salinan={salinanModal ?? undefined}') && !/tawarkanTempelTertaut[\s\S]{0,900}pasangDanSimpan/.test(te.slice(te.indexOf('async function tawarkanTempelTertaut'), te.indexOf('async function tawarkanTempelTertaut') + 900)))
ok('E7 modal: pemilih kolom maksimal 12; angka ditarik ulang dari modul', tm.includes('disabled={memuat || (!centang[i] && jumlahCentang >= BATAS_KOLOM_TABEL)}')
  && tm.includes("if (centang && jumlahCentang === 0) masalah.push(") && tm.includes('pasangSalinan(salinan, centangAwalSalinan(salinan), true)'))
ok('E8 modal: baris tangan ikut Atur Bentuk (pratinjau & resep)', tm.includes('const resep = lengkap ? { kolom: kolom.map(k => k.taut!), sembunyi, tebalInduk, barisTangan } : null;')
  && tm.includes('...(barisTangan.length ? { barisTangan } : {}),'))
ok('E9 Tempel dari Modul: kotak tangkap Ctrl+V → blok TABEL baru → modal langsung terbuka', ed.includes('onPaste={e => void tempelDariModul(e)}')
  && ed.includes("setSalinanBaru({ blockId: Number(r.id), salinan });") && ed.includes('salinanAwal={salinanBaru?.blockId === b.id ? salinanBaru.salinan : undefined}')
  && te.includes('const [modalTaut, setModalTaut] = useState(() => !!lkjip?.salinanAwal);'))
ok('E10 klik kanan tabel tertaut: sisip baris tangan, sembunyikan/hapus baris, hapus kolom lewat jalur tertaut',
  te.includes("kunci: 'sisip-tangan'") && te.includes("kunci: 'buang-tertaut'") && te.includes("case 'sisip-tangan': sisipBarisTanganPilihan(); break;")
  && te.includes("case 'buang-tertaut': void buangBarisTertautPilihan(); break;") && te.includes('if (terkait) { void hapusKolomTertautPilihan(); return; }'))
ok('E11 sel baris tangan bisa diketik (kecuali Nomor & rumus); sel sumber tetap terkunci',
  te.includes('const terkunci = (r: number, c: number) => diBadan(r) && !kolomTangan.has(c) && !selBarisTangan(r, c);')
  && te.includes("return barisTanganDi.has(r) && (j === 'sumber' || j === 'tangan');"))
ok('E12 isi baris tangan / kolom isian tangan yang akan hilang ditanyakan dulu', te.includes("title: 'Hapus baris tangan?'") && te.includes("title: 'Hapus kolom isian tangan?'"))
ok('E13 baris yang tampil (= yang disimpan) menghitung kolom rumus baris tangan', te.includes('nomorUlang(tautan ? hitungRumusTangan(rows, jumlahBarisKepala({ headerRows, rows }), tautan) : rows,'))
ok('E14 Batal di modal salinan awal → pemilik membuang blok kosongnya; Masukkan tidak',
  te.includes('if (dariSalinanAwalRef.current) { dariSalinanAwalRef.current = false; lkjip.onSalinanBatal?.(); }')
  && /dariSalinanAwalRef\.current = false;\n\s*pasangDanSimpan\(p\);/.test(te)
  && ed.includes('onSalinanBatal={() => void buangBlokTempelBatal(b.id)}') && ed.includes('if (!b || !tabelBelumDiisi(b.payload)) return;')
  && ed.includes('lkjip={{ tahunDokumen, TautanModal, salinanAwal, onSalinanDipakai, onSalinanBatal }}'))
ok('E15 batas baris tangan: menu & tombol memakai alasan yang sama', te.includes('const alasanSisipTangan = tautan ? alasanTakBisaSisipTangan({ rows, tautan }) : null;')
  && te.includes('disabled: readOnly || rect.r2 < headerRows - 1 || !!alasanSisipTangan,')
  && te.includes('const alasan = alasanTakBisaSisipTangan(p);\n    if (alasan) { toast.info(alasan); return; }'))

console.log(`\n${lulus} lulus, ${gagal.length} gagal${gagal.length ? ': ' + gagal.join(', ') : ''}`)
process.exit(gagal.length ? 1 : 0)
