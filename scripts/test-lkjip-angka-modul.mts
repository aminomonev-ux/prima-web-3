// scripts/test-lkjip-angka-modul.mts — Tahap 3 tabel tertaut LKJIP (konsep §19).
//
// A: angka sebaris (lib/lkjip/angka.ts) · B: skema simpan & penyaring HTML · C: Word (span bersarang)
// D: sumber PK (satu dokumen FINAL) · E: sumber BLUD Realisasi · F: Periksa untuk narasi
// G: sambungan layar (komentar dibuang dulu — L82c).
//
// Jalankan: npx tsx scripts/test-lkjip-angka-modul.mts

import { readFileSync } from 'node:fs'
import {
  teksAngka, angkaDiHtml, resepTerpakai, idAngkaBaru, bandingAngka, kalimatAngka, kunciTarikan, formatBawaanAngka,
  type ResepAngka,
} from '../lib/lkjip/angka'
import { NarasiPayloadSchema, TautanSchema, sanitizeNarasiHtml } from '../lib/lkjip/schemas'
import { tarikPk, setelanPk, pilihDokumenPk, kolomPk } from '../lib/lkjip/sumber/pk'
import { tarikBludRealisasi, setelanBludRealisasi, tingkatBaris } from '../lib/lkjip/sumber/blud-realisasi'
import { DAFTAR_SUMBER, URUTAN_SUMBER } from '../lib/lkjip/sumber'
import { kumpulkanNarasiTertaut, periksaAngka, periksaSemua, type Penarik } from '../lib/lkjip/kesegaran'
import { rekapPerPj } from '../lib/blud/realisasi-pj'
import type { HasilTarik } from '../lib/lkjip/tautan'
import type { ApiResult } from '../lib/shared/api'
import type { AmbilJson } from '../lib/lkjip/sumber/umum'

let lulus = 0
const gagal: string[] = []
function ok(nama: string, syarat: boolean, ket = '') {
  if (syarat) { lulus++; console.log(`  ok  ${nama}`) }
  else { gagal.push(nama); console.log(`FAIL  ${nama}${ket ? ' — ' + ket : ''}`) }
}
const kode = (p: string) => readFileSync(p, 'utf8')
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')
function badan(src: string, penanda: string): string {
  const i = src.indexOf(penanda)
  if (i < 0) return ''
  const buka = src.indexOf('{', i + penanda.length)
  let dalam = 0
  for (let j = buka; j >= 0 && j < src.length; j++) {
    if (src[j] === '{') dalam++
    else if (src[j] === '}' && --dalam === 0) return src.slice(buka, j + 1)
  }
  return ''
}
async function gagalDengan(p: Promise<unknown>): Promise<string> {
  try { await p; return '' } catch (e) { return e instanceof Error ? `${e.name}: ${e.message}` : String(e) }
}

// ─── A. Angka sebaris ─────────────────────────────────────────────────────────
console.log('\nA. Angka sebaris')
const hasilA: HasilTarik = {
  kolom: [
    { kunci: 'label', label: 'Uraian', jenis: 'teks' },
    { kunci: 'pagu', label: 'Anggaran', jenis: 'rp' },
    { kunci: 'pct', label: 'Realisasi (%)', jenis: 'persen' },
    { kunci: 'target', label: 'Target', jenis: 'teks' },
  ],
  baris: [
    { kunci: 'r:total', label: 'TOTAL', sel: { label: 'TOTAL', pagu: 33214000000, pct: 87.254, target: '85 %' } },
    { kunci: 'r:kosong', label: 'Kosong', sel: { label: 'Kosong', pagu: null, pct: null, target: '' } },
  ],
  catatan: [], ringkas: 'Rekap 2099 · s/d Desember',
}
const resep = (lain: Partial<ResepAngka> = {}): ResepAngka => ({
  sumber: 'kinerja-rekap', setelan: { tahun: 2099, sdBulan: 12 }, kunciBaris: 'r:total', kolom: 'pagu', format: 'rp',
  labelBaris: 'TOTAL', labelKolom: 'Anggaran', ringkas: 'Rekap 2099', ditarikPada: '2099-01-01 10:00', ...lain,
})
const tRp = teksAngka(hasilA, resep())
const tPct = teksAngka(hasilA, resep({ kolom: 'pct', format: 'persen' }))
ok('A1 rupiah & persen memakai format sel tabel (Rp bertitik, persen berkoma 2 desimal)',
  tRp === 'Rp 33.214.000.000' && tPct === '87,25%', `${tRp} | ${tPct}`)
ok('A2 kolom teks dibawa apa adanya ("85 %"), nilai kosong jadi "—", bukan 0',
  teksAngka(hasilA, resep({ kolom: 'target', format: 'teks' })) === '85 %'
  && teksAngka(hasilA, resep({ kunciBaris: 'r:kosong', kolom: 'pct', format: 'persen' })) === '—')
ok('A3 baris atau kolom yang hilang dari sumber → null (bukan 0)',
  teksAngka(hasilA, resep({ kunciBaris: 'r:hilang' })) === null && teksAngka(hasilA, resep({ kolom: 'hilang' })) === null)
ok('A4 desimal mengikuti resep', teksAngka(hasilA, resep({ kolom: 'pct', format: 'persen', desimal: 1 })) === '87,3%')

const html = '<p>Realisasi <span data-angka="a1">Rp 1</span> (<span data-angka="a2">50,00%</span>) &amp; <span data-angka="a1">Rp 2</span> <span data-angka="zz">A &amp; B</span></p>'
const peta = angkaDiHtml(html)
ok('A5 angkaDiHtml: id → teks pertama, entitas dibuka', peta.get('a1') === 'Rp 1' && peta.get('a2') === '50,00%' && peta.get('zz') === 'A & B' && peta.size === 3)
const terpakai = resepTerpakai(html, { a1: resep(), a2: resep(), a9: resep() })
ok('A6 resep yang span-nya sudah dihapus dibuang (tidak menumpuk)', Object.keys(terpakai).sort().join() === 'a1,a2')
ok('A7 id baru tidak bertabrakan', idAngkaBaru(['a1', 'a2', 'a3']) === 'a4' && idAngkaBaru(['a2']) === 'a2'.replace('2', '3') && !['a1', 'a2'].includes(idAngkaBaru(['a1', 'a2'])))

const hasilPer = new Map([[kunciTarikan(resep()), hasilA]])
const htmlB = '<p><span data-angka="a1">Rp 33.214.000.000</span> <span data-angka="a2">80,00%</span> <span data-angka="a3">x</span> <span data-angka="a4">y</span></p>'
const bandingB = bandingAngka(htmlB, {
  a1: resep(), a2: resep({ kolom: 'pct', format: 'persen', labelKolom: 'Realisasi (%)' }),
  a3: resep({ kunciBaris: 'r:hilang' }), a4: resep({ setelan: { tahun: 2098 } }),
}, hasilPer)
const st = Object.fromEntries(bandingB.map(b => [b.id, b.status]))
ok('A8 banding: sama · berubah · hilang; resep tanpa tarikan (gagal) tidak dinilai',
  st.a1 === 'sama' && st.a2 === 'berubah' && st.a3 === 'hilang' && !('a4' in st), JSON.stringify(st))
const kal = kalimatAngka(bandingB)
ok('A9 kalimat menyebut lama → baru & yang hilang dibiarkan',
  kal.includes('1 angka berubah (Realisasi (%) · TOTAL: 80,00% → 87,25%)') && kal.includes('1 angka tidak ditemukan lagi') && kal.includes('teksnya dibiarkan'), kal)
ok('A10 semua sama → "Tidak ada yang berubah."', kalimatAngka(bandingB.filter(b => b.status === 'sama')) === 'Tidak ada yang berubah.')
ok('A11 di kalimat, kolom rupiah bawaannya "Rp …" (tabel tanpa Rp karena judulnya sudah "(Rp)")',
  formatBawaanAngka('rp') === 'rp' && formatBawaanAngka('persen') === 'persen' && formatBawaanAngka('angka') === 'angka' && formatBawaanAngka('teks') === 'teks'
  && kode('app/(dashboard)/lkjip/[id]/AngkaModal.tsx').includes('formatBawaanAngka(kolomSumber.jenis)'))

// ─── B. Skema simpan & penyaring ──────────────────────────────────────────────
console.log('\nB. Skema & penyaring')
const simpanan = NarasiPayloadSchema.parse({
  html: '<p>Total <span data-angka="a1" onclick="alert(1)" style="color:red" class="x">Rp 5</span> dan <span data-angka="a2">7</span></p>',
  angka: { a1: resep(), a9: resep() },
})
ok('B1 resep yang dipakai dibawa, resep yatim dibuang saat Simpan',
  Object.keys(simpanan.angka).join() === 'a1' && simpanan.angka.a1.kunciBaris === 'r:total')
ok('B2 span angka dibentuk ulang: hanya data-angka, atribut lain (onclick/style/class) dibuang',
  simpanan.html.includes('<span data-angka="a1">Rp 5</span>') && !/onclick|class=|style="color:red"/.test(simpanan.html), simpanan.html)
ok('B3 id tak sah tidak lolos sebagai angka (jatuh ke span biasa)',
  sanitizeNarasiHtml('<span data-angka="A1&quot;x">1</span>') === '<span>1</span>'
  && sanitizeNarasiHtml(`<span data-angka='ab12'>1</span>`) === '<span data-angka="ab12">1</span>'
  && sanitizeNarasiHtml('<span data-angka = "ab12">1</span>') === '<span data-angka="ab12">1</span>'
  && sanitizeNarasiHtml('<span data-angkas="ab12" x-data-angka="cd">1</span>') === '<span>1</span>')
ok('B4 payload lama tanpa angka tetap sah (angka = {})', Object.keys(NarasiPayloadSchema.parse({ html: '<p>x</p>' }).angka).length === 0)
const banyak = Object.fromEntries(Array.from({ length: 201 }, (_, i) => [`a${i.toString(36)}`, resep()]))
ok('B5 batas 200 angka per blok, id berpola sempit, sumber dikenal',
  !NarasiPayloadSchema.safeParse({ html: '', angka: banyak }).success
  && !NarasiPayloadSchema.safeParse({ html: '', angka: { 'A-1': resep() } }).success
  && !NarasiPayloadSchema.safeParse({ html: '', angka: { a1: resep({ sumber: 'lain' as ResepAngka['sumber'] }) } }).success)
const tautBaru = (sumber: string) => TautanSchema.safeParse({ sumber, setelan: {}, kolom: [{ isi: { jenis: 'nomor' } }], kunciBaris: [], ditarikPada: '', ringkas: '' }).success
ok('B6 tautan tabel menerima sumber pk & blud-realisasi', tautBaru('pk') && tautBaru('blud-realisasi') && !tautBaru('lain'))
const enumSkema = kode('lib/lkjip/schemas.ts').match(/SUMBER_TAUTAN = \[([^\]]+)\]/)?.[1].match(/'[^']+'/g)?.map(s => s.slice(1, -1)).sort().join() ?? ''
ok('B7 daftar sumber skema = daftar sumber terdaftar (satu sumber baru tak bisa lupa salah satunya)',
  enumSkema === [...URUTAN_SUMBER].sort().join() && enumSkema === Object.keys(DAFTAR_SUMBER).sort().join(), enumSkema)

// ─── C. Word ──────────────────────────────────────────────────────────────────
console.log('\nC. Word')
const { narasiToXml } = await import('../lib/lkjip/docgen')
const xml = narasiToXml('<p><span style="color: #ff0000">Total <span data-angka="a1">Rp 5 &amp; 6</span> rupiah</span> akhir</p>', 'Arial', 24)
const runs = [...xml.matchAll(/<w:r>(.*?)<\/w:r>/g)].map(m => ({ merah: m[1].includes('<w:color w:val="FF0000"/>'), teks: /<w:t[^>]*>([^<]*)<\/w:t>/.exec(m[1])?.[1] ?? '' }))
const run = (t: string) => runs.find(r => r.teks.includes(t))
ok('C1 angka tercetak sebagai teks biasa (entitas dibuka, tanpa penanda)', !!run('Rp 5 &amp; 6') && !xml.includes('data-angka'), xml)
ok('C2 span bersarang: teks sesudah angka TETAP berwarna induknya; sesudah span induk kembali polos',
  !!run('Total')?.merah && !!run('Rp 5')?.merah && !!run('rupiah')?.merah && run('akhir')?.merah === false, JSON.stringify(runs))
ok('C3 docgen tetap tak mengenal resep tautan', !/tautan|ringkas|ditarikPada|kunciBaris/.test(kode('lib/lkjip/docgen.ts')))

// ─── D. Sumber PK ─────────────────────────────────────────────────────────────
console.log('\nD. Sumber PK')
interface DokTiruan { id: number; tanggal_dokumen: string; jenis_pk: 'MURNI' | 'PERUBAHAN'; unit_pertama: string; status: 'FINAL' | 'DRAFT' }
const lampiran = [
  { unit_kerja: 'Bidang A', level: 'program', program: 'P1', kegiatan: null, subkegiatan: null, uraian: 'Meningkatnya mutu', indikator: 'IKM', target: '85 %' },
  { unit_kerja: 'Bidang A', level: 'kegiatan', program: 'P1', kegiatan: 'K1', subkegiatan: null, uraian: 'Layanan', indikator: 'Waktu tunggu', target: '30 menit' },
  { unit_kerja: 'Bidang A', level: 'kegiatan', program: 'P1', kegiatan: 'K1', subkegiatan: null, uraian: 'Layanan', indikator: 'Waktu tunggu', target: '30 menit' },
]
const anggaran = [
  { unit_kerja: 'Bidang A', level: 'program', program: 'P1', kegiatan: null, subkegiatan: null, uraian: 'P1', keterangan_sumber: 'BLUD', nominal: '1000000.00' },
  { unit_kerja: 'Bidang A', level: 'kegiatan', program: 'P1', kegiatan: 'K1', subkegiatan: null, uraian: 'K1', keterangan_sumber: 'BLUD', nominal: '600000.00' },
  { unit_kerja: 'Bidang A', level: 'program', program: 'P2', kegiatan: null, subkegiatan: null, uraian: 'P2', keterangan_sumber: 'APBD', nominal: '500000.00' },
]
function ambilPk(dok: DokTiruan[], opsi: { status?: number; perHalaman?: number } = {}) {
  const url: string[] = []
  const ambil: AmbilJson = async (u) => {
    url.push(u)
    if (opsi.status) return { ok: false, message: 'ditolak', status: opsi.status } as ApiResult<unknown>
    const m = /dokumen\/(\d+)$/.exec(u)
    if (m) return { ok: true, header: dok.find(d => d.id === Number(m[1])), lampiran, anggaran } as ApiResult<unknown>
    const q = new URL(u, 'http://x').searchParams
    const isi = dok.filter(d => d.status === q.get('status'))
    const per = opsi.perHalaman ?? 100
    const page = Number(q.get('page') ?? 1)
    return { ok: true, data: isi.slice((page - 1) * per, page * per), pagination: { totalPages: Math.max(1, Math.ceil(isi.length / per)) } } as ApiResult<unknown>
  }
  return { ambil, url }
}
const dokPk: DokTiruan[] = [
  { id: 1, tanggal_dokumen: '2099-01-02', jenis_pk: 'MURNI', unit_pertama: 'Bidang A', status: 'FINAL' },
  { id: 2, tanggal_dokumen: '2099-08-01', jenis_pk: 'PERUBAHAN', unit_pertama: 'Bidang A', status: 'FINAL' },
  { id: 3, tanggal_dokumen: '2099-01-03', jenis_pk: 'MURNI', unit_pertama: 'Bagian C', status: 'FINAL' },
  { id: 6, tanggal_dokumen: '2099-05-01', jenis_pk: 'PERUBAHAN', unit_pertama: 'Bidang A', status: 'FINAL' },
  { id: 4, tanggal_dokumen: '2099-09-01', jenis_pk: 'PERUBAHAN', unit_pertama: 'Bidang A', status: 'DRAFT' },
  { id: 5, tanggal_dokumen: '2099-02-01', jenis_pk: 'MURNI', unit_pertama: 'Bidang D', status: 'DRAFT' },
]
const sPk = (lain: Record<string, unknown> = {}) => setelanPk({ tahun: 2099, ...lain }, 2099)
ok('D1 setelan bawaan: berlaku · sasaran & indikator · pihak belum dipilih',
  JSON.stringify(setelanPk(undefined, 2099)) === JSON.stringify({ tahun: 2099, pihak: '', versi: 'berlaku', tampilan: 'kinerja' })
  && setelanPk({ versi: 'aneh', tampilan: 'aneh', pihak: 5 }, 2099).versi === 'berlaku')
const hKosong = await tarikPk(sPk(), ambilPk(dokPk).ambil)
ok('D2 tanpa pihak: tidak ada baris, daftar Pihak Pertama dari PK FINAL saja (urut, unik)',
  hKosong.baris.length === 0 && hKosong.pilihan?.pihak?.join('|') === 'Bagian C|Bidang A' && hKosong.catatan[0].includes('Pilih Pihak Pertama'))
const hBerlaku = await tarikPk(sPk({ pihak: 'Bidang A' }), ambilPk(dokPk).ambil)
const hMurni = await tarikPk(sPk({ pihak: 'Bidang A', versi: 'murni' }), ambilPk(dokPk).ambil)
ok('D3 Berlaku = Perubahan FINAL terbaru (draf Perubahan yang lebih baru diabaikan); Murni = Murni',
  hBerlaku.ringkas.includes('Perubahan 2099-08-01') && hMurni.ringkas.includes('Murni 2099-01-02') && hBerlaku.catatan.some(c => c.includes('PK Perubahan')))
ok('D4 pilihDokumenPk: tanpa Perubahan jatuh ke Murni; pihak lain tak tercampur',
  pilihDokumenPk(dokPk.filter(d => d.status === 'FINAL') as never, 'Bagian C', 'berlaku')?.id === 3
  && pilihDokumenPk(dokPk.filter(d => d.status === 'FINAL') as never, 'Bidang X', 'berlaku') === null)
const kunci = hBerlaku.baris.map(b => b.kunci)
ok('D5 kunci baris dari ISI (id lampiran berganti tiap PK disimpan); baris kembar dibedakan #2',
  new Set(kunci).size === 3 && kunci[2] === `${kunci[1]}#2` && kunci.every(k => k.startsWith('pk:')) && !kunci.some(k => /"id"/.test(k)))
const b0 = hBerlaku.baris[0]
ok('D6 sel sasaran & indikator; target teks tidak dihitung; tingkat → indent',
  b0.sel.uraian === 'Meningkatnya mutu' && b0.sel.indikator === 'IKM' && b0.sel.target === '85 %' && b0.indent === 0 && hBerlaku.baris[1].indent === 1
  && kolomPk(sPk()).find(k => k.kunci === 'target')?.jenis === 'teks')
const hAng = await tarikPk(sPk({ pihak: 'Bidang A', tampilan: 'anggaran' }), ambilPk(dokPk).ambil)
const jumlah = hAng.baris.find(b => b.kunci === 'pk:JUMLAH')
ok('D7 Anggaran: JUMLAH hanya tingkat teratas (program 1.000.000 + 500.000), bukan + kegiatan',
  jumlah?.sel.nominal === 1500000 && jumlah.tebal === true && hAng.baris[1].sel.nominal === 600000 && hAng.catatan.some(c => c.includes('JUMLAH hanya menjumlah tingkat program')))
ok('D8 hanya ada draf → ditolak "masih draf"; tidak ada sama sekali → "Belum ada PK … FINAL"',
  (await gagalDengan(tarikPk(sPk({ pihak: 'Bidang D' }), ambilPk(dokPk).ambil))).includes('masih draf')
  && (await gagalDengan(tarikPk(sPk({ pihak: 'Bidang Z' }), ambilPk(dokPk).ambil))).includes('Belum ada PK Bidang Z tahun 2099 yang FINAL')
  && (await gagalDengan(tarikPk(sPk({ pihak: 'Bagian C', versi: 'murni' }), ambilPk(dokPk).ambil))) === '')
ok('D9 403 → kalimat menyebut modul PK', (await gagalDengan(tarikPk(sPk({ pihak: 'Bidang A' }), ambilPk(dokPk, { status: 403 }).ambil))).includes('Butuh akses Perjanjian Kinerja'))
const halaman = ambilPk(dokPk, { perHalaman: 2 })
const hHal = await tarikPk(sPk(), halaman.ambil)
ok('D10 daftar PK ditelusuri per halaman (route membatasi 100)', hHal.pilihan?.pihak?.length === 2 && halaman.url.filter(u => u.includes('status=FINAL')).length === 2 && halaman.url.some(u => u.includes('page=2')))
const tanpaFinal = await tarikPk(sPk(), ambilPk(dokPk.filter(d => d.status === 'DRAFT')).ambil)
ok('D11 tidak ada PK FINAL → kosong + kalimat (bukan galat)', tanpaFinal.baris.length === 0 && tanpaFinal.catatan[0].includes('Tidak ada PK FINAL'))

// ─── E. Sumber BLUD Realisasi ─────────────────────────────────────────────────
console.log('\nE. Sumber BLUD Realisasi')
const baris = (k: string, induk: string | null, pagu: number, sd: number, lain: Record<string, unknown> = {}) => ({
  anggaran_key: k, kode_rekening: `5.${k}`, uraian: `Uraian ${k}`, parent_key: induk, is_leaf: false, penanggung_jawab: '',
  pagu, terserap: sd + 1, bulan_ini: 0, bulan_lalu: sd, sd_bulan: sd, sisa: pagu - sd, persen: pagu > 0 ? sd / pagu * 100 : 0, ...lain,
})
const pohon = [
  baris('BD', null, 1000, 600),
  baris('BO', 'BD', 800, 500),
  baris('PEG', 'BO', 500, 400, { penanggung_jawab: 'Kasubbag A' }),
  baris('G1', 'PEG', 500, 400, { is_leaf: true }),
  baris('BRG', 'BO', 300, 100),
  baris('B1', 'BRG', 300, 100, { is_leaf: true, penanggung_jawab: 'Kasi B' }),
  baris('B2', 'BRG', 0, 0, { is_leaf: true }),
  baris('NOL', 'BO', 0, 0, { is_leaf: true }),
  baris('BM', 'BD', 200, 100),
  baris('YATIM', 'HILANG', 50, 10, { is_leaf: true }),
  // urutan DPA bukan urutan pohon: anak BM datang sesudah akar lain
  baris('MOD', 'BM', 200, 100, { is_leaf: true }),
]
const ambilBlud = (sumber: Record<string, unknown> = { sumber: 'PERGESERAN', versi: '2099-10-12', perubahan_ke: 1 }, status?: number) => {
  const url: string[] = []
  const ambil: AmbilJson = async (u) => {
    url.push(u)
    if (status) return { ok: false, message: 'x', status } as ApiResult<unknown>
    return { ok: true, data: pohon, tahun: 2099, bulan: 12, pagu_sumber: sumber } as ApiResult<unknown>
  }
  return { ambil, url }
}
const sB = (lain: Record<string, unknown> = {}) => setelanBludRealisasi({ tahun: 2099, ...lain }, 2099)
ok('E1 setelan bawaan: s/d Desember · per rekening · tingkat 3 · rekening kosong disembunyikan',
  JSON.stringify(setelanBludRealisasi(undefined, 2099)) === JSON.stringify({ tahun: 2099, sdBulan: 12, tampilan: 'rekening', kedalaman: 3, sembunyikanNol: true }))
const tk = tingkatBaris(pohon)
ok('E2 tingkat dari rantai induk; induk yang tak ada di versi = akar', tk.get('BD') === 1 && tk.get('PEG') === 3 && tk.get('G1') === 4 && tk.get('YATIM') === 1)
const jalur = ambilBlud()
const hRek = await tarikBludRealisasi(sB({ sdBulan: 6 }), jalur.ambil)
ok('E3 URL membawa tahun & s/d bulan', jalur.url[0] === '/api/blud/realisasi/pagu?tahun=2099&bulan=6')
const kRek = hRek.baris.map(b => b.kunci)
ok('E4 tingkat 3 dalam urutan POHON (anak di bawah induknya); lebih dalam & nol tidak ikut; indent = tingkat − 1',
  kRek.join() === 'rek:BD,rek:BO,rek:PEG,rek:BRG,rek:BM,rek:MOD,rek:YATIM,blud:JUMLAH' && hRek.baris.find(b => b.kunci === 'rek:PEG')?.indent === 2, kRek.join())
const peg = hRek.baris.find(b => b.kunci === 'rek:PEG')!.sel
ok('E5 Realisasi = s/d bulan (bukan setahun); kode & uraian dibawa', peg.realisasi === 400 && peg.kode === '5.PEG' && peg.uraian === 'Uraian PEG')
const jml = hRek.baris.find(b => b.kunci === 'blud:JUMLAH')!
ok('E6 JUMLAH muncul hanya karena ada >1 akar, = jumlah semua akar', jml.sel.pagu === 1050 && jml.sel.realisasi === 610 && jml.tebal === true)
ok('E7 catatan menyebut sumber pagu ("Pergeseran (DPA Perubahan ke-1) 12 Okt 2099") & rekening yang tidak ikut',
  hRek.catatan[0] === 'Pagu dari Pergeseran (DPA Perubahan ke-1) 12 Okt 2099.' && hRek.catatan.some(c => c.startsWith('4 rekening tidak ikut')), hRek.catatan.join(' | '))
const hSatuAkar = await (async () => {
  const a: AmbilJson = async () => ({ ok: true, data: pohon.filter(r => r.anggaran_key !== 'YATIM'), pagu_sumber: { sumber: 'DPA', versi: '2099-01-01', perubahan_ke: null } }) as ApiResult<unknown>
  return tarikBludRealisasi(sB({ kedalaman: 8, sembunyikanNol: false }), a)
})()
ok('E8 satu akar → tanpa JUMLAH (akar sudah memuat semuanya); semua tingkat & rekening nol ikut bila diminta',
  !hSatuAkar.baris.some(b => b.kunci === 'blud:JUMLAH') && hSatuAkar.baris.length === 10 && hSatuAkar.baris.some(b => b.kunci === 'rek:NOL') && hSatuAkar.catatan[0] === 'Pagu dari DPA 01 Jan 2099.')
const hAkarNol = await (async () => {
  const data = [...pohon.filter(r => r.anggaran_key !== 'YATIM'), baris('AKARNOL', null, 0, 0, { is_leaf: true })]
  const a: AmbilJson = async () => ({ ok: true, data, pagu_sumber: { sumber: 'DPA', versi: '2099-01-01', perubahan_ke: null } }) as ApiResult<unknown>
  return tarikBludRealisasi(sB({ sembunyikanNol: false }), a)
})()
ok('E8b akar lain yang nol tidak memunculkan JUMLAH (cuma akan mengulang angka akar satunya)',
  !hAkarNol.baris.some(b => b.kunci === 'blud:JUMLAH') && hAkarNol.baris.some(b => b.kunci === 'rek:AKARNOL'))
const hPj = await tarikBludRealisasi(sB({ tampilan: 'pj' }), ambilBlud().ambil)
const rekap = rekapPerPj(pohon)
const jPj = hPj.baris.find(b => b.kunci === 'blud:JUMLAH')!
ok('E9 per PJ = rekapPerPj layar: baris PJ urut nama, "Belum ada PJ", JUMLAH = total akar',
  hPj.baris.map(b => b.kunci).join() === 'pj:Kasi B,pj:Kasubbag A,pj:,blud:JUMLAH'
  && jPj.sel.pagu === rekap.total.pagu && jPj.sel.realisasi === rekap.total.sd_bulan
  && hPj.baris.reduce((a, b) => a + (b.kunci === 'blud:JUMLAH' ? 0 : Number(b.sel.pagu)), 0) === Number(jPj.sel.pagu))
ok('E10 kosong (belum ada DPA/Pergeseran) → tanpa baris + kalimat', (await tarikBludRealisasi(sB(), ambilBlud({ sumber: 'KOSONG', versi: null }).ambil)).catatan[0].includes('belum punya DPA maupun Pergeseran'))
ok('E11 403/503 → kalimat menyebut modul BLUD Realisasi',
  (await gagalDengan(tarikBludRealisasi(sB(), ambilBlud(undefined, 403).ambil))).includes('Butuh akses BLUD Realisasi')
  && (await gagalDengan(tarikBludRealisasi(sB(), ambilBlud(undefined, 503).ambil))).includes('pemeliharaan'))
{
  const { judulIkutSetelan } = await import('../lib/lkjip/tautan')
  const { kolomBlud } = await import('../lib/lkjip/sumber/blud-realisasi')
  const sumberKol = (kunci: string, judul: string) => ({ judul, taut: { isi: { jenis: 'sumber' as const, kunci } } })
  const ks = [sumberKol('realisasi', 'Realisasi s/d Desember'), sumberKol('pagu', 'Pagu'), { judul: 'Realisasi s/d Desember', taut: null },
    sumberKol('realisasi', 'Realisasi 2097 (diketik)')]
  const hasil = judulIkutSetelan(ks, kolomBlud({ sdBulan: 12 }), kolomBlud({ sdBulan: 4 }))
  ok('E12 ganti s/d bulan: judul yang masih label lama ikut ("… s/d April"); judul ketikan & kolom tanpa tautan dibiarkan',
    hasil.map(k => k.judul).join('|') === 'Realisasi s/d April|Pagu|Realisasi s/d Desember|Realisasi 2097 (diketik)', hasil.map(k => k.judul).join('|'))
  ok('E13 tak ada label yang berubah → larik yang SAMA (state tidak dibangunkan sia-sia)',
    judulIkutSetelan(ks, kolomBlud({ sdBulan: 12 }), kolomBlud({ sdBulan: 12 })) === ks)
  const modal = kode('app/(dashboard)/lkjip/[id]/TautanModal.tsx')
  ok('E14 modal tabel: tiap ubah setelan & ganti tampilan menyesuaikan judul dari katalog lama → baru',
    (modal.match(/setKolom\(ks => judulIkutSetelan\(ks, sumber\.kolom\(setelan\), sumber\.kolom\(s\)\)\)/g) ?? []).length === 2)
}

// ─── F. Periksa untuk narasi ──────────────────────────────────────────────────
console.log('\nF. Periksa narasi')
const bagian = [{
  id: 7, nomor: '3.1', judul: 'Anggaran', blocks: [
    { id: 70, tipe: 'NARASI', payload: { html: '<p><span data-angka="a1">Rp 33.214.000.000</span> <span data-angka="a2">80,00%</span></p>', angka: { a1: resep(), a2: resep({ kolom: 'pct', format: 'persen' }), a5: resep() } } },
    { id: 71, tipe: 'NARASI', payload: { html: '<p>tanpa angka</p>', angka: { a1: resep() } } },
    { id: 72, tipe: 'NARASI', payload: { html: '<p><span data-angka="a1">Rp 33.214.000.000</span></p>', angka: { a1: resep() } } },
    { id: 73, tipe: 'NARASI', payload: { html: '<p><span data-angka="a1">1</span></p>', angka: { a1: resep({ sumber: 'pk', setelan: { tahun: 2099 } }) } } },
  ],
}]
const narasi = kumpulkanNarasiTertaut(bagian)
ok('F1 hanya narasi yang SPAN-nya masih ada dikumpulkan; judul menyebut jumlah angka',
  narasi.map(n => n.blockId).join() === '70,72,73' && narasi[0].judul === 'Narasi · 2 angka tertaut' && narasi[0].letak === '3.1 Anggaran')
let panggil = 0
const penarik: Penarik = async (sumber) => { panggil++; if (sumber === 'pk') { const e = new Error('Butuh akses Perjanjian Kinerja.'); e.name = 'GagalTarik'; throw e } return hasilA }
const hasilF = await periksaAngka(narasi, penarik)
ok('F2 berubah / sama / gagal per narasi, kalimat gagal = kalimat modulnya',
  hasilF[0].status === 'berubah' && hasilF[1].status === 'sama' && hasilF[2].status === 'gagal'
  && hasilF[2].status === 'gagal' && hasilF[2].pesan === 'Butuh akses Perjanjian Kinerja.', JSON.stringify(hasilF))
ok('F3 resep sumber yang sama ditarik SEKALI', panggil === 2, String(panggil))
panggil = 0
const tabelTiruan = [{ blockId: 1, sectionId: 7, letak: '3.1', judul: 'T', ringkas: '', payload: { judul: '', kolom: ['A'], align: [], rows: [[{ v: 'x' }]], tautan: { sumber: 'kinerja-rekap', setelan: { tahun: 2099, sdBulan: 12 }, kolom: [{ isi: { jenis: 'sumber', kunci: 'label' } }], kunciBaris: ['r:total'], sembunyi: [], tebalInduk: true, ditarikPada: '', ringkas: '', catatan: [] } } }] as never
const semua = await periksaSemua(tabelTiruan, narasi, penarik)
ok('F4 Periksa Semua: tabel & narasi berbagi satu tarikan per resep', semua.length === 4 && semua[0].blockId === 1 && panggil === 2, String(panggil))

// ─── G. Sambungan layar ──────────────────────────────────────────────────────
console.log('\nG. Sambungan layar')
const tt = kode('app/(dashboard)/lkjip/[id]/TiptapNarasi.tsx')
const ed = kode('app/(dashboard)/lkjip/[id]/editor-client.tsx')
const tm = kode('app/(dashboard)/lkjip/[id]/TautanModal.tsx')
const am = kode('app/(dashboard)/lkjip/[id]/AngkaModal.tsx')
ok('G1 node angka = atom sebaris, dibaca dari span[data-angka]', /name: 'angkaTaut'[\s\S]*inline: true,[\s\S]*atom: true/.test(tt) && tt.includes("tag: 'span[data-angka]'") && tt.includes('AngkaTaut]'))
ok('G2 Simpan narasi mengirim resep yang terpakai saja', badan(tt, 'function simpan(').includes('onSave(html, resepTerpakai(html, angkaKini))'))
const perbarui = badan(tt, 'async function perbaruiAngka(')
ok('G3 Perbarui angka: tidak ada yang berubah → berhenti SEBELUM menulis; menulis hanya sesudah konfirmasi',
  perbarui.indexOf('if (!berubah.length)') > 0 && perbarui.indexOf('if (!berubah.length)') < perbarui.indexOf('confirmDialog(')
  && perbarui.indexOf('confirmDialog(') < perbarui.indexOf('simpan(angkaBaru)') && !perbarui.slice(0, perbarui.indexOf('confirmDialog(')).includes('simpan('))
ok('G4 Perbarui hanya mengganti angka yang BERUBAH; yang hilang dibiarkan & tidak distempel ulang',
  perbarui.includes("berubah.map(b => [b.id, b.baru!])") && perbarui.includes("b.status === 'berubah'")
  && perbarui.includes("h && !hilang.has(id) ? { ...r, ringkas:"))
ok('G5 blok narasi menyimpan angka; "Lanjut daftar" tidak membuang resepnya',
  ed.includes('onSave={(html, angka) => onSave({ html, continueList, angka })}') && ed.includes('onSave({ ...(block.payload as object), continueList: v })'))
const fin = badan(ed, 'async function finalize(')
ok('G6 Finalisasi memeriksa tabel DAN angka dulu', fin.includes('semuaTertaut.length') && fin.indexOf('await jalankanPeriksa()') < fin.indexOf('await kirimFinal()')
  && badan(ed, 'async function jalankanPeriksa(').includes('periksaSemua(tertaut, narasiTertaut,'))
ok('G7 kedua modal memakai SATU komponen setelan (tidak ada salinan isian per sumber)',
  tm.includes('<SetelanSumber ') && am.includes('<SetelanSumber ') && !tm.includes('LABEL_KEDALAMAN') && !am.includes('LABEL_KEDALAMAN') && !tm.includes("'Versi SSK'") && !tm.includes('>Versi SSK'))
ok('G8 modal Angka berhenti di form: tidak menyimpan apa pun sendiri', !/saveBlock|method:\s*'(POST|PUT|PATCH)'|\bmenulis\b/.test(am) && badan(am, 'function sisipkan(').includes('onSisipkan(teks,'))
ok('G9 sumber baru terdaftar & berurutan di pemilih', URUTAN_SUMBER.join() === 'kinerja-rekap,kinerja-laporan,renaksi-cetak,blud-realisasi,pk')
const sisip = badan(tt, 'function sisipkanAngka(')
ok('G10 modal angka dibuka lagi di sumber & setelan angka terakhir, dan langsung menarik',
  sisip.includes('setSumberTerakhir({ sumber: resep.sumber, setelan: resep.setelan })') && tt.includes('awal={sumberTerakhir}')
  && /if \(awal && !sudahTarikAwal\.current\) \{ sudahTarikAwal\.current = true; void tarik\(\); \}/.test(am))
ok('G11 sisip langsung lalu modal ditutup (urutan ketikan sesudahnya pasti benar)',
  sisip.indexOf("insertContent({ type: 'angkaTaut'") > 0 && sisip.indexOf("insertContent({ type: 'angkaTaut'") < sisip.indexOf('setModalAngka(false)'))

console.log(`\n${lulus} lulus, ${gagal.length} gagal`)
if (gagal.length) { console.log('GAGAL: ' + gagal.join(' | ')); process.exit(1) }
