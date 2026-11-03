#!/usr/bin/env npx tsx
// scripts/test-lkjip-pengingat-modul.mts — LKJIP memeriksa sendiri tabel & angka tertaut saat dokumen
// dibuka (seperti tabel Google Docs yang bersumber dari Sheets) + kabar "versi lebih baru".
// Konsep: docs/CONCEPT-lkjip-pengingat-modul.md
// Jalankan: npx tsx scripts/test-lkjip-pengingat-modul.mts
import { readFileSync } from 'node:fs'
import {
  kabarBlok, perluPeriksaUlang, sidikTertaut, periksaAngka, periksaKesegaran, kumpulkanNarasiTertaut,
  SELANG_PERIKSA_ULANG_MS, type HasilPeriksa,
} from '../lib/lkjip/kesegaran'
import { kalimatVersiLebihBaru } from '../lib/kinerja/versi'
import { muatBahanRekap } from '../lib/kinerja/muat-rekap'
import { tarikKinerjaRekap, setelanKinerjaRekap } from '../lib/lkjip/sumber/kinerja-rekap'
import type { HasilTarik } from '../lib/lkjip/tautan'
import type { ResepAngka } from '../lib/lkjip/angka'

let lulus = 0
const gagal: string[] = []
function ok(nama: string, syarat: unknown, ket = '') {
  if (syarat) { lulus++; console.log(`  ok  ${nama}`) }
  else { gagal.push(nama); console.log(`FAIL  ${nama}${ket ? ' — ' + ket : ''}`) }
}
const kode = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
const badan = (isi: string, awal: string) => { const i = isi.indexOf(awal); return i < 0 ? '' : isi.slice(i, isi.indexOf('\n  }', i) + 4) }
const urut = (s: string, ...p: string[]) => { let i = 0; for (const x of p) { const j = s.indexOf(x, i); if (j < 0) return false; i = j + x.length } return true }

const KABAR = 'Sudah ada versi lebih baru: GAJI PERUBAHAN-1. Tabel ini tetap memakai versi Murni; ganti versinya lewat Atur Bentuk kalau perlu.'

// ─────────────────────────────────────────────────────────────────────────────
console.log('A. Aturan')
ok('A1 kalimat versi lebih baru: kosong → tidak ada; ada → menyebut sumber, versi, dan yang dipakai',
  kalimatVersiLebihBaru([], 'versi Murni') === null
  && kalimatVersiLebihBaru([{ sumber: 'GAJI', label: 'PERUBAHAN-1' }], 'versi Murni') === KABAR,
  String(kalimatVersiLebihBaru([{ sumber: 'GAJI', label: 'PERUBAHAN-1' }], 'versi Murni')))
ok('A2 tanpa hasil / gagal (mis. tanpa akses modul) → tanpa lencana', kabarBlok(undefined, false).length === 0
  && kabarBlok({ blockId: 1, status: 'gagal', pesan: 'Butuh akses E-Anggaran.' }, false).length === 0)
ok('A3 sama tanpa kabar → tanpa lencana', kabarBlok({ blockId: 1, status: 'sama' }, false).length === 0)
const kTabel = kabarBlok({ blockId: 1, status: 'berubah', ringkas: '2 baris berubah' }, false)
const kNarasi = kabarBlok({ blockId: 1, status: 'berubah', ringkas: '1 angka berubah' }, true)
ok('A4 berubah: tabel menyuruh Perbarui, narasi Perbarui angka, rinciannya = kalimat pemeriksa',
  kTabel.length === 1 && kTabel[0].jenis === 'berubah' && kTabel[0].label === 'Data modul berubah: tekan Perbarui' && kTabel[0].rinci === '2 baris berubah'
  && kNarasi[0].label === 'Angka modul berubah: tekan Perbarui angka', JSON.stringify([kTabel, kNarasi]))
const kDua = kabarBlok({ blockId: 1, status: 'berubah', ringkas: 'x', info: [KABAR] }, false)
ok('A5 kabar versi: lencana info sendiri, "berubah" didahulukan', kDua.map(k => k.jenis).join() === 'berubah,info' && kDua[1].rinci === KABAR
  && kabarBlok({ blockId: 1, status: 'sama', info: [KABAR] }, false).map(k => k.jenis).join() === 'info')
ok('A6 periksa ulang saat tab kembali dibuka: belum pernah / ≥ 15 menit ya, kurang dari itu tidak',
  perluPeriksaUlang(null, 0) && !perluPeriksaUlang(1_000, 1_000 + SELANG_PERIKSA_ULANG_MS - 1) && perluPeriksaUlang(1_000, 1_000 + SELANG_PERIKSA_ULANG_MS)
  && SELANG_PERIKSA_ULANG_MS === 15 * 60_000)

const tautan = { sumber: 'kinerja-rekap', setelan: { tahun: 2099 }, kolom: [{ isi: { jenis: 'sumber', kunci: 'label' } }], kunciBaris: ['r'], sembunyi: [], tebalInduk: true, ditarikPada: '2099-01-01 10:00', ringkas: '', catatan: [] }
const tabel = (ditarikPada: string) => ({ blockId: 1, sectionId: 1, letak: '', judul: '', ringkas: '', payload: { judul: '', kolom: ['A'], align: [], rows: [[{ v: 'x' }]], tautan: { ...tautan, ditarikPada } } }) as never
ok('A7 jejak blok: isi sama → jejak sama; sesudah Perbarui (waktu tarik berganti) → jejak berganti, lencana lama gugur',
  sidikTertaut(tabel('2099-01-01 10:00')) === sidikTertaut(tabel('2099-01-01 10:00')) && sidikTertaut(tabel('2099-01-01 10:00')) !== sidikTertaut(tabel('2099-02-01 09:00')))
const narasiA = { blockId: 2, sectionId: 1, letak: '', judul: '', ringkas: '', html: '<p>a</p>', angka: {} }
ok('A8 jejak narasi berganti saat naskahnya disimpan ulang', sidikTertaut(narasiA) !== sidikTertaut({ ...narasiA, html: '<p>b</p>' }))

// ─────────────────────────────────────────────────────────────────────────────
console.log('B. Kabar ikut hasil pemeriksaan')
const hasilA: HasilTarik = {
  kolom: [{ kunci: 'label', label: 'Uraian', jenis: 'teks' }, { kunci: 'pagu', label: 'Anggaran', jenis: 'rp' }],
  baris: [{ kunci: 'r:total', label: 'TOTAL', sel: { label: 'TOTAL', pagu: 33214000000 } }],
  catatan: [], ringkas: 'Rekap 2099', info: [KABAR],
}
const resep: ResepAngka = { sumber: 'kinerja-rekap', setelan: { tahun: 2099, sdBulan: 12, versi: 'murni' }, kunciBaris: 'r:total', kolom: 'pagu', format: 'rp',
  labelBaris: 'TOTAL', labelKolom: 'Anggaran', ringkas: 'Rekap 2099', ditarikPada: '2099-01-01 10:00' }
const narasi = kumpulkanNarasiTertaut([{ id: 1, nomor: '3.1', judul: 'Anggaran', blocks: [
  { id: 70, tipe: 'NARASI', payload: { html: '<p><span data-angka="a1">Rp 33.214.000.000</span></p>', angka: { a1: resep } } },
] }])
const hN = await periksaAngka(narasi, async () => hasilA)
ok('B1 angka sama dengan sumbernya tapi sumbernya punya versi lebih baru: status sama + kabar', hN[0].status === 'sama' && hN[0].info?.[0] === KABAR, JSON.stringify(hN))
const hT = await periksaKesegaran([tabel('2099-01-01 10:00')], async () => hasilA)
ok('B2 tabel: kabar ikut, apa pun statusnya', hT[0].status !== 'gagal' && (hT[0] as Extract<HasilPeriksa, { status: 'berubah' }>).info?.[0] === KABAR, JSON.stringify(hT))
const hTanpa = await periksaKesegaran([tabel('2099-01-01 10:00')], async () => ({ ...hasilA, info: [] }))
ok('B3 tanpa kabar → tidak ada kunci info (lencana tidak muncul)', !('info' in hTanpa[0]))

// Muat Rekap dengan jawaban tiruan: GAJI punya MURNI + PERUBAHAN-1, BLUD hanya MURNI, sisanya kosong.
const SLOT: Record<string, unknown[]> = {
  GAJI: [{ versi_tipe: 'MURNI', versi_seq: 0 }, { versi_tipe: 'PERUBAHAN', versi_seq: 1 }],
  BLUD: [{ versi_tipe: 'MURNI', versi_seq: 0 }],
}
const ambil = async (url: string) => {
  const sumber = new URL(url, 'http://x').searchParams.get('sumber') ?? ''
  if (url.includes('/ssk/versi-list')) return { ok: true as const, items: SLOT[sumber] ?? [] }
  const tipe = new URL(url, 'http://x').searchParams.get('versi_tipe')
  return { ok: true as const, rows: [], itemSsk: [], versi: { tipe: tipe ?? (SLOT[sumber]?.length === 2 ? 'PERUBAHAN' : 'MURNI'), seq: tipe === 'MURNI' ? 0 : (SLOT[sumber]?.length === 2 ? 1 : 0) } }
}
const murni = await muatBahanRekap('2099', 'murni', ambil)
const berlaku = await muatBahanRekap('2099', 'berlaku', ambil)
ok('B4 muat Rekap Murni: hanya sumber yang SUDAH punya versi lebih baru yang disebut', JSON.stringify(murni.versiLebihBaru) === JSON.stringify([{ sumber: 'GAJI', label: 'PERUBAHAN-1' }]),
  JSON.stringify(murni.versiLebihBaru))
ok('B5 muat Rekap Berlaku: tidak pernah ada kabar versi lebih baru', berlaku.versiLebihBaru.length === 0)
const tarikM = await tarikKinerjaRekap(setelanKinerjaRekap({ versi: 'murni' }, 2099), ambil)
const tarikB = await tarikKinerjaRekap(setelanKinerjaRekap({ versi: 'berlaku' }, 2099), ambil)
ok('B6 tabel Rekap Murni membawa kabar; Rekap Berlaku tidak', tarikM.info?.length === 1 && tarikM.info[0].includes('GAJI PERUBAHAN-1') && (tarikB.info ?? []).length === 0,
  JSON.stringify([tarikM.info, tarikB.info]))

// ─────────────────────────────────────────────────────────────────────────────
console.log('C. Sambungan layar')
const ed = kode('app/(dashboard)/lkjip/[id]/editor-client.tsx')
const oto = badan(ed, 'const periksaOtomatis = useEffectEvent(')
ok('C1 dokumen yang dibuka memeriksa sendiri (bukan dokumen FINAL, bukan dokumen tanpa tautan)',
  oto.includes('if (readOnly || !semuaTertaut.length) return;') && oto.includes('void jalankanPeriksa().catch('))
ok('C2 pemicu: sesaat sesudah dibuka + saat tab kembali dibuka bila sudah 15 menit',
  ed.includes('const awal = setTimeout(() => periksaOtomatis(), 1500);')
  && ed.includes("if (document.visibilityState === 'visible' && perluPeriksaUlang(kabarPadaRef.current, Date.now())) periksaOtomatis();"))
const jp = badan(ed, 'async function jalankanPeriksa(')
ok('C3 jejak blok diambil SEBELUM menarik, hasil disimpan per blok', urut(jp, 'const sidik = sidikSekarang;', 'await periksaSemua(', 'setKabar(new Map(hasil.map(h => [h.blockId, { hasil: h, sidik: sidik.get(h.blockId)'))
ok('C4 lencana hanya berlaku selama isi blok belum berubah', ed.includes('return k && k.sidik === sidikSekarang.get(blockId) ? k.hasil : undefined;'))
ok('C5 blok menerima lencananya; rincian lewat tooltip, bukan title=', ed.includes("kabar={kabarBlok(kabarAktif(b.id), b.tipe === 'NARASI')}")
  && ed.includes('className={`lk-kabar ${k.jenis}`} data-tooltip={k.rinci}'))
ok('C6 dock menyebut jumlah blok yang berubah', ed.includes("label: jumlahBerubah ? `Periksa Data Modul (${jumlahBerubah})` : 'Periksa Data Modul'"))
ok('C7 pemeriksaan otomatis hanya membaca — memperbarui tetap tombol di blok', !oto.includes('saveBlock') && !jp.includes('saveBlock'))
ok('C8 panel Periksa menampilkan kabar versi', ed.includes("{h && h.status !== 'gagal' && h.info?.map(i => <span key={i} className=\"lk-periksa-kabar\">{i}</span>)}"))

console.log(`\n${lulus} lulus, ${gagal.length} gagal${gagal.length ? ': ' + gagal.join(', ') : ''}`)
process.exit(gagal.length ? 1 : 0)
