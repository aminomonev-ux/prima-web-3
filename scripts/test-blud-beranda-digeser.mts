// scripts/test-blud-beranda-digeser.mts — rincian "Rekening yang Digeser" + kartu DPA Perubahan
// di Beranda BLUD. Konsep: docs/CONCEPT-blud-beranda-panel-bergerak.md §11
//
// Bagian A–C menguji PERILAKU fungsi murni (lib/blud/rekening-digeser.ts, ringkasPerubahan).
// Bagian D–G memeriksa sambungannya — komentar dibuang dulu supaya prosa yang menjelaskan
// keputusan tidak ikut cocok (L82c).
//
// Jalankan: npx tsx scripts/test-blud-beranda-digeser.mts

import { readFileSync } from 'node:fs'
import {
  pisahDigeser, cocokCari, tautanPergeseran, tahunDariTautan, versiDariTautan, type RekeningGeser,
} from '../lib/blud/rekening-digeser'
import { ringkasPerubahan } from '../lib/blud/perubahan'

let lulus = 0
const gagal: string[] = []
function ok(nama: string, syarat: boolean, ket = '') {
  if (syarat) { lulus++; console.log(`  ok  ${nama}`) }
  else { gagal.push(nama); console.log(`FAIL  ${nama}${ket ? ' — ' + ket : ''}`) }
}
const kode = (p: string) => readFileSync(p, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '').replace(/\{\s*\}/g, '{}')
/** Badan blok pertama sesudah `penanda`, dari `{` sampai pasangannya. */
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
function urut(teks: string, ...potongan: string[]): boolean {
  let pos = -1
  for (const p of potongan) { pos = teks.indexOf(p, pos + 1); if (pos < 0) return false }
  return true
}

const r = (anggaran_key: string | null, uraian: string, nominal: number, kode_rekening = `5.${uraian}`): RekeningGeser =>
  ({ anggaran_key, kode_rekening, uraian, nominal })

console.log('\n── A. pisahDigeser & cocokCari ─────────────────────────────────')
{
  // Urutan masuk = urutan server (terbesar dulu); sengaja tidak berurut tanda.
  const semua = [r('A', 'Jasa', 6_000_000), r('B', 'Endoskopi', -1_750_000), r('C', 'Tunjangan', 1_000_000), r('D', 'Plasma', -5_250_000)]
  const p = pisahDigeser(semua)
  ok('A1 dipisah menurut tanda', p.bertambah.map(x => x.anggaran_key).join() === 'A,C' && p.berkurang.map(x => x.anggaran_key).join() === 'B,D')
  ok('A2 total bertambah', p.totalBertambah === 7_000_000)
  ok('A3 total berkurang POSITIF (besarnya)', p.totalBerkurang === 7_000_000)
  ok('A4 urutan masuk dipertahankan (server terbesar dulu)', p.berkurang[0].anggaran_key === 'B')
  ok('A5 kosong → nol semua', (() => { const k = pisahDigeser([]); return !k.bertambah.length && !k.berkurang.length && k.totalBertambah === 0 && k.totalBerkurang === 0 })())
  // Kode sengaja TIDAK memuat teks uraian — kalau memuat, kecocokannya lewat kode, bukan uraian.
  ok('A6 cari uraian tanpa peduli huruf besar', cocokCari(r('A', 'Belanja Jasa', 1, '5.1.02'), 'jASA'))
  ok('A7 cari kode rekening', cocokCari(r('A', 'X', 1, '5.1.02.01'), '1.02'))
  ok('A8 kosong / spasi = semua', cocokCari(r('A', 'X', 1), '   '))
  ok('A9 tidak cocok → tidak', !cocokCari(r('A', 'Jasa', 1, '5.1'), 'obat'))
}

console.log('\n── B. Tautan ke layar Pergeseran ────────────────────────────────')
{
  const t = tautanPergeseran({ tahun: 2026, versi: '2026-10-12', anggaran_key: 'AK 1&2' })
  const q = new URL(t, 'http://x').searchParams
  ok('B1 menuju /blud/pergeseran', t.startsWith('/blud/pergeseran?'))
  ok('B2 tahun, versi, fokus ikut — tahun WAJIB (layar membuka tahun berjalan kalau tidak)',
    q.get('tahun') === '2026' && q.get('versi') === '2026-10-12' && q.get('fokus') === 'AK 1&2')
  ok('B3 tanpa jangkar → tanpa fokus', !new URL(tautanPergeseran({ tahun: 2026, versi: '2026-10-12' }), 'http://x').searchParams.has('fokus'))
  ok('B4 tahunDariTautan: empat angka', tahunDariTautan('2099') === 2099)
  ok('B5 …selain itu diabaikan', [null, '', 'abc', '20999', '99'].every(x => tahunDariTautan(x) === null))
  const h = [{ versi_tanggal: '2026-10-12' }, { versi_tanggal: '2026-10-08' }]
  ok('B6 versiDariTautan: versi yang ada', versiDariTautan('2026-10-08', h) === '2026-10-08')
  ok('B7 …versi yang sudah tidak ada → null (layar tetap di versi terbaru)', versiDariTautan('2026-09-30', h) === null)
  ok('B8 …tanpa parameter → null', versiDariTautan(null, h) === null)
}

console.log('\n── C. ringkasPerubahan (kartu DPA Perubahan) ───────────────────')
{
  const rows = [
    { row_id: 'A', parent_id: null, jumlah: 110, jumlah_sebelum: 100 },
    { row_id: 'A1', parent_id: 'A', jumlah: 60, jumlah_sebelum: 50 },
    { row_id: 'A2', parent_id: 'A', jumlah: 50, jumlah_sebelum: 50 },
    // Lahir di Perubahan: Sebelum-nya NULL dan dihitung 0.
    { row_id: 'B', parent_id: null, jumlah: 20, jumlah_sebelum: null },
  ]
  const p = [{ versi_mulai: '2026-10-07' }, { versi_mulai: '2026-11-02' }]
  const k = ringkasPerubahan(p, '2026-11-05', rows)
  ok('C1 tanpa penanda → null (DPA masih murni)', ringkasPerubahan([], '2026-11-05', rows) === null)
  ok('C2 tanpa versi DPA → null', ringkasPerubahan(p, null, rows) === null)
  ok('C3 nomor babak = babak TERAKHIR', k?.ke === 2 && k.versi_mulai === '2026-11-02')
  ok('C4 total AKAR saja — anak tidak dihitung dua kali', k?.sebelum === 100 && k.sesudah === 130, `${k?.sebelum} → ${k?.sesudah}`)
  ok('C5 selisih = sesudah − sebelum (baris baru dari nol)', k?.selisih === 30)
  ok('C6 versi terbaru sebelum babak terakhir → null, bukan angka babak lain', ringkasPerubahan(p, '2026-10-20', rows) === null)
}

console.log('\n── D. Server: panel & kartu ─────────────────────────────────────')
{
  const BP = kode('lib/blud/beranda-panel.ts')
  ok('D1 jangkar ikut dibaca (untuk ?fokus=)', BP.includes('SELECT p.versi_tanggal, p.anggaran_key, p.kode_rekening'))
  ok('D2 SEMUA rekening ikut dikirim — modal tanpa endpoint baru', urut(badan(BP, 'export async function riwayatPergeseran('),
    'rekening: semua.slice(0, BATAS_REKENING)', 'semua,'))
  ok('D3 tipe tinggal di modul murni (satu definisi)', BP.includes("export type { RekeningGeser, VersiPergeseran } from './rekening-digeser'")
    && !/export interface (RekeningGeser|VersiPergeseran)\b/.test(BP))
  ok('D4 modul murni tanpa impor apa pun', !/^import /m.test(kode('lib/blud/rekening-digeser.ts')))
  const PG = kode('app/(dashboard)/blud/page.tsx')
  ok('D5 kartu Δ Net dibuang beserta kuerinya', !PG.includes('getPergeseranDelta') && !PG.includes('pgLatestDelta'))
  const rp = badan(PG, 'async function getRingkasPerubahan(tahun: number, versi: string | null): Promise<RingkasPerubahan | null>')
  ok('D6 kartu Perubahan: penanda dulu, baris versi hanya bila ada, rumus ringkasPerubahan', urut(rp,
    'const penanda = await getPerubahan(tahun)', 'if (!penanda.length || !versi) return null', 'FROM dpa_blud', 'return ringkasPerubahan(penanda, versi,'))
  ok('D7 …versi yang dipakai = versi DPA terbaru (yang dihitung kartu Total Anggaran)', PG.includes('await getRingkasPerubahan(tahun, dpaLatestVersi)'))
}

console.log('\n── E. Beranda ───────────────────────────────────────────────────')
{
  const DC = kode('app/(dashboard)/blud/dashboard-client.tsx')
  ok('E1 kartu "Δ Pergeseran Net" tidak ada lagi', !DC.includes('Δ Pergeseran Net') && !DC.includes('pgLatestDelta'))
  ok('E2 kartu DPA Perubahan menuju layar DPA', urut(DC, "label: 'DPA Perubahan'", "href:  '/blud/dpa'"))
  ok('E3 …kalimat murni bila belum ada Perubahan', DC.includes("'DPA tahun ini masih murni'"))
  ok('E4 …selisih bergaya dokumen anggaran (formatSelisih)', DC.includes('formatSelisih(p.perubahan.selisih, fmtRp)'))
  ok('E5 baris panel jadi tautan HANYA bila boleh buka Pergeseran DAN berjangkar',
    DC.includes('return p.bolehPergeseran && r.anggaran_key ? (')
    && DC.includes('href={tautanPergeseran({ tahun: p.tahun, versi: v.versi_tanggal, anggaran_key: r.anggaran_key })}'))
  ok('E6 "+N rekening lainnya" membuka modal', urut(DC, '{v.lainnya > 0 && (', 'onClick={() => setRincianVersi(v)}', '+{v.lainnya} rekening lainnya'))
  ok('E7 modal ikut aturan akses kartu', DC.includes('bolehBuka={p.bolehPergeseran}'))
  ok('E8 tipe panel dari modul murni, bukan berkas ber-sql', DC.includes("from '@/lib/blud/rekening-digeser'")
    && !/import \{[^}]*\} from '@\/lib\/blud\/beranda-panel'/.test(DC.replace(/import type \{[^}]*\} from '@\/lib\/blud\/beranda-panel'/g, '')))
}

console.log('\n── F. Modal rincian ─────────────────────────────────────────────')
{
  const M = kode('components/blud/RekeningDigeserModal.tsx')
  ok('F1 tidak mengimpor berkas ber-sql (bundel peramban)', !M.includes('beranda-panel') && !M.includes('@/lib/data/db'))
  ok('F2 rekening jadi tautan hanya bila boleh buka & berjangkar', M.includes('return bolehBuka && r.anggaran_key ? ('))
  ok('F3 tombol "Buka versi ini" hanya bila boleh buka', urut(M, '{bolehBuka && (', 'tautanPergeseran({ tahun, versi: versi.versi_tanggal })', 'Buka versi ini'))
  ok('F4 isi & total dari pisahDigeser (satu rumus)', M.includes('pisahDigeser(versi.semua)'))
  ok('F5 pencarian menyaring daftar, BUKAN totalnya', M.includes('daftar.filter(r => cocokCari(r, cari))')
    && M.includes('rincian.totalBertambah') && !/filter\([^)]*cocokCari[\s\S]{0,80}total/.test(M))
  ok('F6 Escape menutup', urut(M, "if (e.key === 'Escape') onTutup()"))
}

console.log('\n── G. Layar Pergeseran: tautan ?tahun=&versi= ───────────────────')
{
  const PC = kode('app/(dashboard)/blud/pergeseran/pergeseran-client.tsx')
  ok('G1 tahun dari tautan sejak muatan pertama', PC.includes("useState<number>(() => tahunDariTautan(searchParams.get('tahun')) ?? CURRENT_YEAR)"))
  ok('G2 useSearchParams cuma sekali', PC.split('useSearchParams()').length - 1 === 1)
  // Dipotong sampai akhir efeknya — sisa berkas punya toast.warning lain yang akan ikut cocok.
  const awalBuka = PC.indexOf('if (!versiTautan || versiTautanSudah.current || !history.length) return')
  const buka = PC.slice(awalBuka, PC.indexOf('}, [versiTautan, history])', awalBuka))
  ok('G3 versi dibuka lewat bukaVersi (periode ikut — L79), sekali per tautan', urut(buka,
    'versiTautanSudah.current = true', 'const v = versiDariTautan(versiTautan, history)', 'if (v !== versi) void bukaVersi(v)'))
  ok('G4 …versi yang sudah tidak ada disebut, bukan diam', urut(buka, 'if (!v) {', 'toast.warning(', 'return'))
  ok('G5 sorotan menunggu versi tautan terbuka DAN barisnya selesai dimuat',
    PC.includes('const tungguVersiTautan = !!versiTautan && (loading || (versi !== versiTautan')
    && PC.includes('fokusSudah.current === fokus || tungguVersiTautan) return')
    && PC.includes('}, [fokus, rows, tungguVersiTautan])'))
}

console.log(`\n${lulus} lulus, ${gagal.length} gagal`)
if (gagal.length) { for (const g of gagal) console.log('  - ' + g); process.exit(1) }
