#!/usr/bin/env npx tsx
// scripts/test-kinerja-master-menjalar.mts — ganti nama / pindah induk / gabung entri Master
// yang ikut menjalar ke Rekening, RKO (semua versi), dan Realisasi; Rapikan Bintang; Lengkapi
// Master; pilihan berantai satu aturan di tab Master & Rekening.
// Konsep: docs/CONCEPT-kinerja-master-menjalar.md
// Jalankan: npx tsx --env-file=.env.local scripts/test-kinerja-master-menjalar.mts
// Bagian G memakai MySQL sungguhan (kotak pasir 2097), dibersihkan otomatis — tanpa
// --env-file bagian itu DILEWATI dan jumlah lulusnya turun.
import { readFileSync } from 'node:fs'
import mysql from 'mysql2/promise'
import { buangBintang, cocokInduk, namaUnik } from '../lib/kinerja/master-nama'
import {
  rencanaUbahMaster, jalarkanKeBaris, rencanaRapikanBintang, rapikanBarisNama, rencanaLengkapiMaster,
  hitungKembar, kalimatJalaran, kelompokkanNilai,
  type EntriMaster, type RencanaUbahMaster, type BarisNama,
} from '../lib/kinerja/master-ubah'

let lulus = 0
const gagal: string[] = []
function ok(nama: string, syarat: unknown, ket = '') {
  if (syarat) { lulus++; console.log(`  ok  ${nama}`) }
  else { gagal.push(nama); console.log(`FAIL  ${nama}${ket ? ' — ' + ket : ''}`) }
}
const sumber = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
const tanpaKomentar = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
const badan = (isi: string, awal: string) => { const i = isi.indexOf(awal); return i < 0 ? '' : isi.slice(i, isi.indexOf('\n}\n', i)) }
const coba = async <T,>(f: () => Promise<T>): Promise<T | Error> => { try { return await f() } catch (e) { return e as Error } }
const rencana = (r: RencanaUbahMaster | { tolak: string }): RencanaUbahMaster => {
  if ('tolak' in r) throw new Error('tak terduga ditolak: ' + r.tolak)
  return r
}

const PX = 'PROGRAM PENUNJANG URUSAN'
const PXs = `${PX} ***`
const KA = 'Peningkatan Pelayanan BLUD'
const KAs = `${KA} ****`
const SA = 'Pelayanan dan Penunjang BLUD **'
const SAs = 'Pelayanan dan Penunjang BLUD *****'
const e = (id: number, tipe: EntriMaster['tipe'], nama: string, p: string | null = null, k: string | null = null, s: string | null = null): EntriMaster =>
  ({ id, tipe, nama, program_ref: p, kegiatan_ref: k, subkegiatan_ref: s })

// Bentuk data server 2026-11-02: entri manual tanpa bintang + entri Init Renaksi berbintang,
// ditambah kegiatan SENAMA di program lain (nama tidak unik di tipenya).
const MASTER: EntriMaster[] = [
  e(1, 'program', PX), e(2, 'program', PXs), e(3, 'program', 'PROGRAM LAIN'),
  e(10, 'kegiatan', KA, PX), e(11, 'kegiatan', KAs, PXs), e(12, 'kegiatan', KA, 'PROGRAM LAIN'),
  e(20, 'subkegiatan', SA, PX, KA), e(21, 'subkegiatan', SAs, PXs, KAs), e(22, 'subkegiatan', 'Sub Lain', 'PROGRAM LAIN', KA),
  e(30, 'uraian_ssk', 'Penyediaan Barang BLUD', PX, KA, SA),
  e(31, 'uraian_ssk', 'Penyediaan Gaji ASN (PNS)', PXs, KAs, SAs),
  e(32, 'uraian_ssk', 'Penyediaan Barang BLUD', PXs, KAs, SAs),
  e(33, 'uraian_ssk', 'Uraian Lain', 'PROGRAM LAIN', KA, 'Sub Lain'),
  e(40, 'sumber_anggaran', 'BLUD'), e(41, 'sumber_anggaran', 'BLUD ***'),
]
const terapkan = (rows: EntriMaster[], r: RencanaUbahMaster) => {
  const ubah = new Map(r.tulis.map(t => [t.id, t]))
  return rows.filter(x => !r.hapus.includes(x.id)).map(x => ubah.get(x.id) ?? x)
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('A. Aturan nama: buang bintang, cocok induk')
ok('A1 bintang & spasi di ujung dibuang', buangBintang('PROGRAM X ***') === 'PROGRAM X' && buangBintang('Sub A  **  ') === 'Sub A')
ok('A2 bintang di tengah nama tidak disentuh', buangBintang('Belanja *khusus* lain') === 'Belanja *khusus* lain')
ok('A3 nama tanpa bintang tetap', buangBintang('Program Y') === 'Program Y')
ok('A4 induk kosong cocok di bawah induk mana pun', cocokInduk({ program_ref: null, kegiatan_ref: null, subkegiatan_ref: null }, { program: 'P' }))
ok('A5 induk berisi harus sama', !cocokInduk({ program_ref: 'P1', kegiatan_ref: null, subkegiatan_ref: null }, { program: 'P2' })
  && cocokInduk({ program_ref: 'P1', kegiatan_ref: null, subkegiatan_ref: null }, { program: 'P1' }))
// Pilihan Kegiatan tab Rekening dulu memeriksa baris PERTAMA bernama sama — kegiatan senama di
// program lain ikut menentukan. Satu baris per entri, bukan per nama.
const opsiKeg = (program: string) => namaUnik(MASTER.filter(r => r.tipe === 'kegiatan' && cocokInduk(r, { program })))
ok('A6 kegiatan senama di dua program: tampil di keduanya', opsiKeg(PX).includes(KA) && opsiKeg('PROGRAM LAIN').includes(KA))
ok('A7 kegiatan berbintang hanya di bawah program berbintangnya', !opsiKeg(PX).includes(KAs) && opsiKeg(PXs).includes(KAs))
ok('A8 sub berinduk program+kegiatan: kedua kolom diperiksa',
  cocokInduk(MASTER[6], { program: PX, kegiatan: KA }) && !cocokInduk(MASTER[6], { program: 'PROGRAM LAIN', kegiatan: KA }))

// ─────────────────────────────────────────────────────────────────────────────
console.log('B. Rencana ganti nama / pindah induk / gabung')
// Kasus pemakai: Edit Uraian SSK, induk dipilih yang tanpa bintang.
const pindah = rencana(rencanaUbahMaster(MASTER, 31, { nama: 'Penyediaan Gaji ASN (PNS)', program_ref: PX, kegiatan_ref: KA, subkegiatan_ref: SA }))
const t31 = pindah.tulis.find(t => t.id === 31)
ok('B1 pindah induk TERSIMPAN (dulu dibuang diam-diam)', pindah.berubah && t31?.program_ref === PX && t31.kegiatan_ref === KA && t31.subkegiatan_ref === SA, JSON.stringify(t31))
ok('B2 pindah ke induk tanpa entri senama = bukan gabung', pindah.gabungKe === null && pindah.hapus.length === 0)
const ganti = rencana(rencanaUbahMaster(MASTER, 31, { nama: 'Penyediaan Gaji ASN' }))
ok('B3 induk yang tidak dikirim dipertahankan', ganti.tulis[0]?.program_ref === PXs && ganti.tulis[0].nama === 'Penyediaan Gaji ASN')
const kosong = rencanaUbahMaster(MASTER, 31, { nama: 'X', program_ref: PX, kegiatan_ref: KA, subkegiatan_ref: null })
ok('B4 induk yang tadinya ada tidak boleh dikosongkan', 'tolak' in kosong && /Sub Kegiatan induk wajib/.test(kosong.tolak), JSON.stringify(kosong))
const tiada = rencanaUbahMaster(MASTER, 31, { nama: 'X', program_ref: PX, kegiatan_ref: KA, subkegiatan_ref: 'Sub Khayalan' })
ok('B5 induk yang tidak ada di Master ditolak, namanya disebut (L68)', 'tolak' in tiada && tiada.tolak.includes('"Sub Khayalan" tidak ada di Master'), JSON.stringify(tiada))
// Pindah Program dengan Kegiatan/Sub yang sama: Sub itu harus ada juga di bawah Program baru.
const salahRantai = rencanaUbahMaster(MASTER, 30, { nama: 'Penyediaan Barang BLUD', program_ref: 'PROGRAM LAIN', kegiatan_ref: KA, subkegiatan_ref: SA })
ok('B6 rantai di bawah tingkat yang berubah ikut diperiksa', 'tolak' in salahRantai && salahRantai.tolak.includes(`"${SA}" tidak ada di Master di bawah Kegiatan "${KA}"`), JSON.stringify(salahRantai))
ok('B7 tidak berubah = berubah:false, tanpa tulisan', (() => { const r = rencana(rencanaUbahMaster(MASTER, 30, { nama: 'Penyediaan Barang BLUD' })); return !r.berubah && r.tulis.length === 0 })())

const gabungP = rencana(rencanaUbahMaster(MASTER, 2, { nama: PX }))
ok('B8 nama program jadi sama dengan entri yang ada = gabung ke sana', gabungP.gabungKe?.id === 1 && gabungP.hapus.includes(2) && !gabungP.tulis.some(t => t.id === 2))
ok('B9 keturunan program berbintang ikut pindah ke program tanpa bintang',
  gabungP.anak === 4 && [11, 21, 31, 32].every(id => gabungP.tulis.find(t => t.id === id)?.program_ref === PX), JSON.stringify(gabungP.tulis))
ok('B10 entri di program lain tidak tersentuh', !gabungP.tulis.some(t => [12, 22, 33].includes(t.id)))
const m1 = terapkan(MASTER, gabungP)
const gabungK = rencana(rencanaUbahMaster(m1, 11, { nama: KA }))
ok('B11 lalu gabung kegiatan: anak sub & uraiannya ikut', gabungK.gabungKe?.id === 10 && [21, 31, 32].every(id => gabungK.tulis.find(t => t.id === id)?.kegiatan_ref === KA), JSON.stringify(gabungK.tulis))
const m2 = terapkan(m1, gabungK)
const gabungS = rencana(rencanaUbahMaster(m2, 21, { nama: SA }))
ok('B12 gabung sub: uraian yang jadi KEMBAR digabung (yang lama dipertahankan)',
  gabungS.gabungKe?.id === 20 && gabungS.hapus.includes(21) && gabungS.hapus.includes(32) && !gabungS.hapus.includes(30), JSON.stringify(gabungS.hapus))
ok('B13 uraian yang tidak kembar ikut pindah, tidak dihapus', gabungS.tulis.find(t => t.id === 31)?.subkegiatan_ref === SA)
// Kegiatan senama di program lain: anak program lain BUKAN keturunan entri ini.
const gantiK = rencana(rencanaUbahMaster(MASTER, 10, { nama: 'Kegiatan Baru' }))
ok('B14 ganti nama kegiatan tidak memindahkan anak kegiatan senama di program lain',
  !gantiK.unik && gantiK.tulis.some(t => t.id === 20) && !gantiK.tulis.some(t => [22, 33].includes(t.id)), JSON.stringify(gantiK.tulis.map(t => t.id)))
// Data lama: anak tanpa kolom program. Milik siapa hanya bisa dipastikan kalau namanya unik.
const yatimInduk = [e(1, 'program', 'P1'), e(2, 'program', 'P2'), e(5, 'kegiatan', 'K', 'P1'), e(6, 'subkegiatan', 'S', null, 'K')]
ok('B15 anak tanpa kolom program ikut kalau nama induknya unik',
  rencana(rencanaUbahMaster(yatimInduk, 5, { nama: 'K2' })).tulis.some(t => t.id === 6 && t.kegiatan_ref === 'K2'))
const kembarInduk = [...yatimInduk, e(7, 'kegiatan', 'K', 'P2')]
ok('B16 …tapi TIDAK kalau ada kegiatan senama di program lain (tak bisa dipastikan)',
  !rencana(rencanaUbahMaster(kembarInduk, 5, { nama: 'K2' })).tulis.some(t => t.id === 6))
const gabungSa = rencana(rencanaUbahMaster(MASTER, 41, { nama: 'BLUD' }))
ok('B17 sumber anggaran: berdiri sendiri, gabung ke yang sama', gabungSa.gabungKe?.id === 40 && gabungSa.anak === 0 && gabungSa.hapus.join() === '41')

// ─────────────────────────────────────────────────────────────────────────────
console.log('C. Jalaran ke baris Rekening / RKO / Realisasi')
const b = (id: number, program: string, kegiatan: string, subkegiatan: string, uraian_ssk: string): BarisNama => ({ id, program, kegiatan, subkegiatan, uraian_ssk })
const DATA = [
  b(1, PXs, KAs, SAs, 'Penyediaan Gaji ASN (PNS)'),
  b(2, PX, KA, SA, 'Penyediaan Barang BLUD'),
  b(3, 'PROGRAM LAIN', KA, 'Sub Lain', 'Uraian Lain'),
  b(4, `${PXs} `, KAs, SAs, 'Penyediaan Gaji ASN (PNS)'),
]
const jP = jalarkanKeBaris(DATA, gabungP)
ok('C1 gabung program: baris berbintang dapat program tanpa bintang, kolom di bawahnya utuh',
  jP.length === 2 && jP[0].baris.id === 1 && jP[0].nilai.program === PX && jP[0].nilai.kegiatan === KAs, JSON.stringify(jP))
ok('C2 spasi sisa di data tetap dikenali', jP.some(t => t.baris.id === 4))
const jU = jalarkanKeBaris(DATA, pindah)
ok('C3 pindah induk uraian: seluruh rantai baris itu ikut', jU.length === 2 && jU.every(t => t.nilai.program === PX && t.nilai.kegiatan === KA && t.nilai.subkegiatan === SA))
const jK = jalarkanKeBaris(DATA, gantiK)
ok('C4 ganti nama kegiatan: baris program lain yang kegiatannya senama TIDAK ikut', jK.map(t => t.baris.id).join() === '2', JSON.stringify(jK))
ok('C5 baris yang nilainya tidak berubah tidak ikut ditulis', jalarkanKeBaris(DATA, rencana(rencanaUbahMaster(MASTER, 30, { nama: 'Penyediaan Barang BLUD' }))).length === 0)
ok('C6 kelompok tulisan per nilai baru (satu UPDATE per kelompok)',
  kelompokkanNilai(jP.map(t => ({ id: t.baris.id, nilai: t.nilai }))).length === 1)

// ─────────────────────────────────────────────────────────────────────────────
console.log('D. Rapikan Bintang')
const rapi = rencanaRapikanBintang(MASTER)
ok('D1 entri berbintang yang jadi kembar entri lama digabung', [2, 11, 41].every(id => rapi.hapus.includes(id)), JSON.stringify(rapi.hapus))
// Sub "… **" (manual) dan "… *****" (Renaksi) dua-duanya berubah: dipertahankan id terkecil.
ok('D2 dua-duanya berbintang: yang id terkecil dipertahankan', rapi.hapus.includes(21) && !rapi.hapus.includes(20))
ok('D3 uraian yang jadi kembar sesudah induknya rapi ikut digabung', rapi.hapus.includes(32) && !rapi.hapus.includes(30))
const r31 = rapi.tulis.find(t => t.id === 31)
ok('D4 penunjuk induk ikut rapi — tak ada yang menunjuk nama yang sudah hilang',
  r31?.program_ref === PX && r31.kegiatan_ref === KA && r31.subkegiatan_ref === 'Pelayanan dan Penunjang BLUD', JSON.stringify(r31))
ok('D5 contoh menyebut nama lama → baru dan tanda gabung', rapi.contoh.some(c => c.lama === PXs && c.baru === PX && c.gabung))
ok('D6 entri tanpa bintang & induk tanpa bintang tidak disentuh', !rapi.tulis.some(t => [1, 3, 10, 12, 22, 33].includes(t.id)))
const rb = rapikanBarisNama(DATA)
ok('D7 baris data dirapikan per kolom; yang bersih tidak ikut',
  rb.length === 3 && rb.find(t => t.baris.id === 1)?.nilai.subkegiatan === 'Pelayanan dan Penunjang BLUD' && !rb.some(t => t.baris.id === 3), JSON.stringify(rb.map(t => t.baris.id)))
ok('D8 hitungKembar per grup', hitungKembar([{ grup: 'A', kunci: 'x' }, { grup: 'A', kunci: 'x' }, { grup: 'B', kunci: 'x' }]) === 1)

// ─────────────────────────────────────────────────────────────────────────────
console.log('E. Lengkapi Master dari Rekening & RKO')
const lengkap = rencanaLengkapiMaster(MASTER, [
  { program: PX, kegiatan: KA, subkegiatan: SA, uraian_ssk: 'Penyediaan Jasa BLUD' },
  { program: PX, kegiatan: KA, subkegiatan: SA, uraian_ssk: 'Penyediaan Barang BLUD' },
  { program: 'PROGRAM BARU', kegiatan: 'Keg Baru', subkegiatan: 'Sub Baru', uraian_ssk: 'Ura Baru' },
  { program: 'PROGRAM BARU', kegiatan: 'Keg Baru', subkegiatan: 'Sub Baru', uraian_ssk: 'Ura Baru' },
  { program: 'PROGRAM SENDIRI', kegiatan: '', subkegiatan: 'Sub Yatim', uraian_ssk: 'X' },
])
const daftar = lengkap.baru.map(x => `${x.tipe}:${x.nama}`)
ok('E1 hanya yang belum ada: uraian baru di rantai lama', daftar.includes('uraian_ssk:Penyediaan Jasa BLUD') && !daftar.includes('uraian_ssk:Penyediaan Barang BLUD'))
ok('E2 rantai baru dibuat lengkap dari atas, sekali saja',
  ['program:PROGRAM BARU', 'kegiatan:Keg Baru', 'subkegiatan:Sub Baru', 'uraian_ssk:Ura Baru'].every(x => daftar.filter(y => y === x).length === 1), JSON.stringify(daftar))
ok('E3 tingkat kosong menghentikan rantai', daftar.includes('program:PROGRAM SENDIRI') && !daftar.includes('subkegiatan:Sub Yatim'))
ok('E4 urut program → kegiatan → sub → uraian (induk lahir dulu)', daftar.indexOf('program:PROGRAM BARU') < daftar.indexOf('uraian_ssk:Ura Baru'))
ok('E5 induk entri baru = rantainya', lengkap.baru.find(x => x.nama === 'Penyediaan Jasa BLUD')?.subkegiatan_ref === SA)
// Kegiatan bernama sama sudah ada — tapi di program LAIN, jadi tidak tampil di bawah program ini.
const senama = rencanaLengkapiMaster(MASTER, [{ program: 'PROGRAM BARU', kegiatan: KA, subkegiatan: null, uraian_ssk: null }])
ok('E8 nama yang ada di induk lain tidak dihitung "sudah ada"',
  senama.baru.some(x => x.tipe === 'kegiatan' && x.nama === KA && x.program_ref === 'PROGRAM BARU'), JSON.stringify(senama.baru))
ok('E6 nama berbintang dihitung untuk peringatan', rencanaLengkapiMaster([], [{ program: 'P ***', kegiatan: null, subkegiatan: null, uraian_ssk: null }]).berbintang === 1)
ok('E7 kalimat jalaran memadatkan RKO bila versinya banyak',
  kalimatJalaran({ rekening: 0, realisasi: 0, rko: [1, 2, 3, 4, 5].map(n => ({ sumber: 'BLUD', versi_tipe: 'PERUBAHAN', versi_seq: n, baris: 1 })) }) === '• RKO: 5 baris di 5 versi (BLUD)')

// ─────────────────────────────────────────────────────────────────────────────
console.log('F. Statis: layar, route, penulis')
const mt = tanpaKomentar(sumber('app/(dashboard)/kinerja/_tabs/MasterTab.tsx'))
const save = badan(mt, 'async function saveMaster(')
ok('F1 Edit Master MENGIRIM induknya (bug: dulu hanya nama)',
  /program_ref: masterProgramRef \|\| null/.test(save) && /kegiatan_ref: masterKegiatanRef \|\| null/.test(save) && /subkegiatan_ref: masterSubkegiatanRef \|\| null/.test(save))
ok('F2 pratinjau dulu (dry), lalu kirim dengan pernyataan gabung', /dry: true/.test(save) && /JSON\.stringify\(\{ \.\.\.body, gabung \}\)/.test(save))
ok('F3 perubahan yang menjalar/gabung ditanyakan', /if \(gabung \|\| p\.anak > 0 \|\| adaJalaran\(p\.data\)\)/.test(save))
const rk = tanpaKomentar(sumber('app/(dashboard)/kinerja/_tabs/RekeningTab.tsx'))
ok('F4 tab Rekening: pilihan berantai lewat cocokInduk (3 tingkat)', (rk.match(/cocokInduk\(/g) ?? []).length === 3)
ok('F5 tab Rekening: tidak lagi menilai kegiatan dari baris pertama senama', !rk.includes('kegiatanRows.find(r => r.nama === v)'))
ok('F6 nilai di luar Master tetap tampil (Master & Rekening, 4 + 3 pilihan)',
  (rk.match(/<OpsiDiLuarMaster /g) ?? []).length === 4 && (mt.match(/<OpsiDiLuarMaster /g) ?? []).length === 3)
const kj = sumber('lib/data/kinerja.ts')
const init = badan(kj, 'export async function initMasterFromRenaksi(')
ok('F7 Init Renaksi membuang bintang penanda', /const prog = buangBintang\(r\.program/.test(init) && /const sub = buangBintang\(r\.sub_kegiatan/.test(init))
const mu = tanpaKomentar(sumber('lib/data/kinerja-master-ubah.ts'))
for (const [nama, awal] of [['ubah', 'export async function ubahMasterMenjalar('], ['rapikan', 'export async function rapikanBintangMaster(']] as const) {
  const f = badan(mu, awal)
  const iTx = f.indexOf('withTransaction(async')
  ok(`F8 ${nama}: gembok tahun = perintah PERTAMA transaksi (L84)`, iTx > 0 && /^\(async \(\{ tx \}\) => \{\s*await kunciTahun\(tx, tahun\);/.test(f.slice(iTx + 'withTransaction'.length)))
}
ok('F9 stempel "terakhir diubah" tidak ikut berganti (3 tabel)', (mu.match(/updated_at = updated_at/g) ?? []).length === 4)
const gembok = badan(mu, 'async function naikkanGembok(')
ok('F10 angka kunci RKO per versi & Realisasi per sumber dinaikkan', /bumpBludVersion\(tx, 'kinerja_ssk'/.test(gembok) && /bumpBludVersion\(tx, REALISASI_LOCK_ENTITY/.test(gembok))
const kunci = badan(mu, 'async function kunciTahun(')
ok('F11 gembok RKO lewat kunciVersiSsk (urutan sama dgn Simpan RKO) untuk SEMUA sumber',
  /for \(const s of SUMBER_LIST\) await kunciVersiSsk\(tx, tahun, s\)/.test(kunci) && kunci.indexOf('kunciVersiSsk') < kunci.indexOf('REALISASI_LOCK_ENTITY'))
const rtUbah = sumber('app/api/kinerja/master/[id]/route.ts')
const rtRapi = sumber('app/api/kinerja/master/rapikan/route.ts')
const rtLeng = sumber('app/api/kinerja/master/lengkapi/route.ts')
ok('F12 ketiga route tunduk sakelar maintenance (L72)', [rtUbah, rtRapi, rtLeng].every(s => s.includes('await kinerjaMati(session.role)')))
ok('F13 gabung & rapikan hanya SUPER_ADMIN/ADMIN', rtUbah.includes('bolehGabung: bolehHapusMaster(session.role)') && rtRapi.includes('if (!bolehHapusMaster(session.role))'))
ok('F14 PERLU_GABUNG → 409, tolak → 400', rtUbah.includes("code: 'PERLU_GABUNG'") && rtUbah.includes("code: 'MASTER_DITOLAK'"))
ok('F15 Pulihkan menyebut nama lama ikut kembali', sumber('components/kinerja/RiwayatSimpanModal.tsx').includes('nama lama ikut kembali'))

// ─────────────────────────────────────────────────────────────────────────────
console.log('G. MySQL kotak pasir 2097')
const TAHUN = '2097'
const SUMBER = ['GAJI', 'BLUD', 'HARLEP', 'PROMKES', 'SARPRAS', 'OBAT', 'PEMELIHARAAN', 'PEMBANGUNAN']
let c: mysql.Connection | null = null
try {
  c = await mysql.createConnection({
    host: process.env.MYSQL_HOST, port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER, password: process.env.MYSQL_PASSWORD, database: process.env.MYSQL_DATABASE,
  })
} catch (er) { console.log(`DILEWATI bagian DB: MySQL tidak bisa dihubungi (${(er as { code?: string }).code ?? er})`) }
if (c) {
  const k = c
  // L92: kunci uji dihapus PERSIS, bukan `WHERE entity = ?` — entity itu dipakai data asli.
  const bersih = async () => {
    await k.query('UPDATE kinerja_ssk SET parent_versi_id = NULL WHERE tahun = ?', [TAHUN])
    for (const t of ['kinerja_ssk', 'kinerja_realisasi', 'kinerja_rekening', 'kinerja_master', 'kinerja_riwayat_simpan']) {
      await k.query(`DELETE FROM ${t} WHERE tahun = ?`, [TAHUN])
    }
    await k.query("DELETE FROM blud_locks WHERE entity = 'kinerja_master' AND key_id = ?", [TAHUN])
    for (const s of SUMBER) {
      await k.query("DELETE FROM blud_locks WHERE entity IN ('kinerja_versi_ssk', 'kinerja_realisasi') AND key_id = ?", [`${TAHUN}:${s}`])
      for (const v of ['MURNI:0', 'PERUBAHAN:1']) await k.query("DELETE FROM blud_locks WHERE entity = 'kinerja_ssk' AND key_id = ?", [`${TAHUN}:${s}:${v}`])
    }
  }
  const q = async <T,>(sqlTeks: string, p: unknown[] = []) => ((await k.query(sqlTeks, p)) as [T[], unknown])[0]
  const n = async (sqlTeks: string, p: unknown[] = []) => Number((await q<{ n: number }>(sqlTeks, p))[0]?.n ?? 0)
  const versiKunci = async (entity: string, key: string) => n('SELECT COALESCE(MAX(version), 0) AS n FROM blud_locks WHERE entity = ? AND key_id = ?', [entity, key])
  await bersih()
  try {
    const K = await import('../lib/data/kinerja')
    const MU = await import('../lib/data/kinerja-master-ubah')
    const [usr] = await k.query('SELECT id FROM users ORDER BY id LIMIT 1') as [Array<{ id: number }>, unknown]
    const userId = Number(usr[0]?.id ?? 0)
    const idOf = new Map<number, number>()
    for (const m of MASTER.filter(x => x.tipe !== 'sumber_anggaran')) {
      const [r] = await k.query('INSERT INTO kinerja_master (tahun, tipe, nama, program_ref, kegiatan_ref, subkegiatan_ref) VALUES (?, ?, ?, ?, ?, ?)',
        [TAHUN, m.tipe, m.nama, m.program_ref, m.kegiatan_ref, m.subkegiatan_ref]) as [{ insertId: number }, unknown]
      idOf.set(m.id, r.insertId)
    }
    await k.query(`INSERT INTO kinerja_rekening (tahun, sumber, uraian, uraian_ssk, program, kegiatan, subkegiatan, urut) VALUES
      (?, 'BLUD', 'Belanja Gaji PNS', 'Penyediaan Gaji ASN (PNS)', ?, ?, ?, 1),
      (?, 'BLUD', 'Belanja Barang', 'Penyediaan Barang BLUD', ?, ?, ?, 2)`,
      [TAHUN, PXs, KAs, SAs, TAHUN, PX, KA, SA])
    const rko = (cid: string, p: string, kg: string, s: string, u: string, pagu: number) => ({
      canonical_id: cid, uraian_ssk: u, uraian: `Belanja ${cid}`, program: p, kegiatan: kg, subkegiatan: s,
      pagu, months: K.emptyMonths(), months_pct: K.emptyMonths(), total: 0, total_pct: 0, urut: 0, is_nullified: false,
    })
    // MURNI memuat satu baris berbintang juga: versi terkunci ikut diganti labelnya (keputusan pemilik).
    await K.saveSskBatch(TAHUN, 'BLUD', [rko('K-1', PX, KA, SA, 'Penyediaan Barang BLUD', 5_000_000), rko('K-3', PXs, KAs, SAs, 'Penyediaan Gaji ASN (PNS)', 2_000_000)], userId, 'MURNI', 0)
    await K.buatVersiPerubahan(TAHUN, 'BLUD', 'MURNI', 0, userId)
    await K.saveSskBatch(TAHUN, 'BLUD', [
      rko('K-1', PX, KA, SA, 'Penyediaan Barang BLUD', 5_000_000),
      rko('K-3', PXs, KAs, SAs, 'Penyediaan Gaji ASN (PNS)', 2_000_000),
      rko('K-2', PXs, KAs, SAs, 'Penyediaan Gaji ASN (PNS)', 10_000_000),
    ], userId, 'PERUBAHAN', 1)
    await k.query(`INSERT INTO kinerja_realisasi (tahun, sumber, bulan, ssk_canonical_id, ssk_versi_tipe, ssk_versi_seq, keterangan, program, kegiatan, subkegiatan, uraian_ssk, real_fisik, real_keuangan, updated_at)
      VALUES (?, 'BLUD', 1, 'K-3', 'PERUBAHAN', 1, 'Belanja K-3', ?, ?, ?, 'Penyediaan Gaji ASN (PNS)', 100, 90, '2097-01-15 10:00:00'),
             (?, 'BLUD', 2, 'K-3', 'PERUBAHAN', 1, 'Belanja K-3', ?, ?, ?, 'Penyediaan Gaji ASN (PNS)', 200, 180, '2097-01-15 10:00:00')`,
      [TAHUN, PXs, KAs, SAs, TAHUN, PXs, KAs, SAs])
    const paguAwal = await n('SELECT SUM(pagu) AS n FROM kinerja_ssk WHERE tahun = ?', [TAHUN])
    const kunciP1 = await versiKunci('kinerja_ssk', `${TAHUN}:BLUD:PERUBAHAN:1`)
    const kunciReal = await versiKunci('kinerja_realisasi', `${TAHUN}:BLUD`)

    const idPXs = idOf.get(2)!
    const opsi = (o: Partial<{ dry: boolean; gabung: boolean; bolehGabung: boolean }>) => ({ userId, dry: false, gabung: false, bolehGabung: true, ...o })
    const pra = await MU.ubahMasterMenjalar(idPXs, { nama: PX }, opsi({ dry: true }))
    ok('G1 pratinjau gabung program: jumlah salinan per tempat, termasuk MURNI terkunci',
      pra.gabung_ke === PX && pra.data.rekening === 1 && pra.data.realisasi === 2
      && pra.data.rko.find(v => v.versi_tipe === 'MURNI')?.baris === 1 && pra.data.rko.find(v => v.versi_tipe === 'PERUBAHAN')?.baris === 2, JSON.stringify(pra))
    ok('G2 pratinjau tidak menulis apa pun', await n('SELECT COUNT(*) AS n FROM kinerja_master WHERE id = ?', [idPXs]) === 1
      && await n('SELECT COUNT(*) AS n FROM kinerja_ssk WHERE tahun = ? AND program = ?', [TAHUN, PXs]) === 3)
    const tanpaPernyataan = await coba(() => MU.ubahMasterMenjalar(idPXs, { nama: PX }, opsi({})))
    ok('G3 gabung tanpa dinyatakan → PERLU_GABUNG, tak ada yang tertulis',
      tanpaPernyataan instanceof MU.KinerjaMasterPerluGabungError && await n('SELECT COUNT(*) AS n FROM kinerja_master WHERE id = ?', [idPXs]) === 1)
    const bukanAdmin = await coba(() => MU.ubahMasterMenjalar(idPXs, { nama: PX }, opsi({ dry: true, bolehGabung: false })))
    ok('G4 gabung oleh peran non-admin ditolak (sudah di pratinjau)', bukanAdmin instanceof MU.KinerjaMasterTolakError)

    const hasil = await MU.ubahMasterMenjalar(idPXs, { nama: PX }, opsi({ gabung: true }))
    ok('G5 gabung program: entri berbintang hilang, anaknya pindah',
      hasil.dihapus === 1 && await n('SELECT COUNT(*) AS n FROM kinerja_master WHERE tahun = ? AND program_ref = ?', [TAHUN, PXs]) === 0)
    ok('G6 RKO semua versi berganti label — termasuk MURNI yang terkunci',
      await n('SELECT COUNT(*) AS n FROM kinerja_ssk WHERE tahun = ? AND program = ?', [TAHUN, PXs]) === 0
      && await n("SELECT COUNT(*) AS n FROM kinerja_ssk WHERE tahun = ? AND versi_tipe = 'MURNI' AND locked_at IS NOT NULL AND program = ?", [TAHUN, PX]) === 2)
    ok('G7 angka & identitas RKO tidak berubah', await n('SELECT SUM(pagu) AS n FROM kinerja_ssk WHERE tahun = ?', [TAHUN]) === paguAwal
      && await n("SELECT COUNT(*) AS n FROM kinerja_ssk WHERE tahun = ? AND canonical_id IN ('K-1','K-2','K-3')", [TAHUN]) === 5)
    ok('G8 Rekening & Realisasi ikut; stempel waktu realisasi tetap',
      await n('SELECT COUNT(*) AS n FROM kinerja_rekening WHERE tahun = ? AND program = ?', [TAHUN, PXs]) === 0
      && await n("SELECT COUNT(*) AS n FROM kinerja_realisasi WHERE tahun = ? AND program = ? AND updated_at = '2097-01-15 10:00:00' AND real_keuangan IN (90, 180)", [TAHUN, PX]) === 2)
    ok('G9 angka kunci RKO PERUBAHAN-1 & Realisasi naik (tab terbuka kena 409)',
      await versiKunci('kinerja_ssk', `${TAHUN}:BLUD:PERUBAHAN:1`) > kunciP1 && await versiKunci('kinerja_realisasi', `${TAHUN}:BLUD`) > kunciReal)

    // Kasus pemakai: Uraian SSK dipindah ke induk tanpa bintang lewat Edit.
    const idUra = idOf.get(31)!
    const pindahDb = await MU.ubahMasterMenjalar(idUra, { nama: 'Penyediaan Gaji ASN (PNS)', program_ref: PX, kegiatan_ref: KA, subkegiatan_ref: SA }, opsi({}))
    const [m31] = await q<{ program_ref: string; kegiatan_ref: string; subkegiatan_ref: string }>('SELECT program_ref, kegiatan_ref, subkegiatan_ref FROM kinerja_master WHERE id = ?', [idUra])
    ok('G10 Edit Uraian SSK: induk baru TERSIMPAN di Master', m31?.kegiatan_ref === KA && m31.subkegiatan_ref === SA, JSON.stringify(m31))
    ok('G11 …dan baris RKO/Rekening/Realisasinya pindah ke kelompok yang sama dengan Murni',
      pindahDb.data.rko.reduce((x, v) => x + v.baris, 0) === 3
      && await n('SELECT COUNT(*) AS n FROM kinerja_ssk WHERE tahun = ? AND subkegiatan = ? AND kegiatan = ?', [TAHUN, SA, KA]) === 5
      && await n('SELECT COUNT(*) AS n FROM kinerja_realisasi WHERE tahun = ? AND subkegiatan = ?', [TAHUN, SA]) === 2)

    const praRapi = await MU.rapikanBintangMaster(TAHUN, { userId, dry: true })
    ok('G12 Rapikan: pratinjau menyebut entri yang digabung', praRapi.master_hapus >= 2 && praRapi.contoh.length > 0, JSON.stringify(praRapi))
    await MU.rapikanBintangMaster(TAHUN, { userId, dry: false })
    const sisaBintang = await n(`SELECT
      (SELECT COUNT(*) FROM kinerja_master WHERE tahun = ? AND (nama LIKE '%*' OR program_ref LIKE '%*' OR kegiatan_ref LIKE '%*' OR subkegiatan_ref LIKE '%*'))
      + (SELECT COUNT(*) FROM kinerja_ssk WHERE tahun = ? AND (program LIKE '%*' OR kegiatan LIKE '%*' OR subkegiatan LIKE '%*'))
      + (SELECT COUNT(*) FROM kinerja_realisasi WHERE tahun = ? AND (program LIKE '%*' OR kegiatan LIKE '%*' OR subkegiatan LIKE '%*'))
      + (SELECT COUNT(*) FROM kinerja_rekening WHERE tahun = ? AND (program LIKE '%*' OR kegiatan LIKE '%*' OR subkegiatan LIKE '%*')) AS n`, [TAHUN, TAHUN, TAHUN, TAHUN])
    ok('G13 sesudah Rapikan: tak satu nama berbintang tersisa di 4 tabel', sisaBintang === 0, String(sisaBintang))
    ok('G14 Master tanpa entri kembar sesudah Rapikan',
      await n('SELECT COUNT(*) AS n FROM (SELECT tipe, nama, program_ref, kegiatan_ref, subkegiatan_ref, COUNT(*) c FROM kinerja_master WHERE tahun = ? GROUP BY 1,2,3,4,5 HAVING c > 1) x', [TAHUN]) === 0)
    ok('G15 angka RKO tetap', await n('SELECT SUM(pagu) AS n FROM kinerja_ssk WHERE tahun = ?', [TAHUN]) === paguAwal)

    await k.query(`INSERT INTO kinerja_rekening (tahun, sumber, uraian, uraian_ssk, program, kegiatan, subkegiatan, urut)
      VALUES (?, 'BLUD', 'Belanja Jasa', 'Penyediaan Jasa BLUD', ?, ?, 'Pelayanan dan Penunjang BLUD', 3)`, [TAHUN, PX, KA])
    const praLeng = await MU.lengkapiMasterDariData(TAHUN, { userId, dry: true })
    ok('G16 Lengkapi: hanya Uraian SSK yang belum ada', praLeng.baru.length === 1 && praLeng.baru[0].nama === 'Penyediaan Jasa BLUD', JSON.stringify(praLeng))
    await MU.lengkapiMasterDariData(TAHUN, { userId, dry: false })
    ok('G17 sesudah Lengkapi: pratinjau berikutnya kosong (aman diulang)', (await MU.lengkapiMasterDariData(TAHUN, { userId, dry: true })).baru.length === 0)
  } finally {
    await bersih()
    const sisa = await n(`SELECT (SELECT COUNT(*) FROM kinerja_ssk WHERE tahun = ?) + (SELECT COUNT(*) FROM kinerja_master WHERE tahun = ?)
      + (SELECT COUNT(*) FROM kinerja_rekening WHERE tahun = ?) + (SELECT COUNT(*) FROM kinerja_realisasi WHERE tahun = ?)
      + (SELECT COUNT(*) FROM blud_locks WHERE (entity LIKE 'kinerja%' AND key_id LIKE ?) OR (entity = 'kinerja_master' AND key_id = ?)) AS n`,
      [TAHUN, TAHUN, TAHUN, TAHUN, `${TAHUN}:%`, TAHUN])
    ok('G18 kotak pasir 2097 bersih kembali', sisa === 0, String(sisa))
    await k.end()
  }
}

console.log(`\n${lulus} lulus, ${gagal.length} gagal`)
if (gagal.length) { console.log(gagal.map(g => `  - ${g}`).join('\n')); process.exit(1) }
process.exit(0)
