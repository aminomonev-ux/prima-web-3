// Uji Simpan Realisasi & RKO E-Anggaran — pembanding, gabung bentrok, Tutup Bulan.
//   npx tsx scripts/test-kinerja-simpan-realisasi.mts
//
// Bagian A–F menguji PERILAKU fungsi murni (lib/kinerja/banding-realisasi.ts,
// tutup-bulan.ts, sunting-ssk.ts). Bagian G memeriksa sambungannya di SEMUA jalur (L69)
// — komentar dibuang dulu supaya prosa yang menjelaskan cacat lama tidak ikut cocok.
// Yang hidup di dalam transaksi (gembok, jejak, pagar) diuji di MySQL sungguhan oleh
// scripts/test-kinerja-simpan-realisasi-db.mjs.
// Konsep: docs/CONCEPT-kinerja-simpan-realisasi.md

import { readFileSync } from 'node:fs'
import {
  bandingRealisasi, kalimatRingkasan, kalimatBelumTersimpan, gabungBentrok, terapkanPilihanBentrok,
  pelanggaranBulanTertutup, kunciRealisasi, type BarisBanding,
} from '../lib/kinerja/banding-realisasi'
import { alasanTolakTutup, alasanTolakBuka, perubahanTargetTertutup, kalimatPelanggaran } from '../lib/kinerja/tutup-bulan'
import { jumlahSskBerubah } from '../lib/kinerja/sunting-ssk'
import { gabungBentrokSsk, terapkanPilihanBentrokSsk, kalimatSelBentrokSsk } from '../lib/kinerja/bentrok-ssk'

let lulus = 0
const gagal: string[] = []
function ok(nama: string, syarat: boolean, ket = '') {
  if (syarat) { lulus++; console.log(`  ok  ${nama}`) }
  else { gagal.push(nama); console.log(`FAIL  ${nama}${ket ? ' — ' + ket : ''}`) }
}
const kode = (p: string) => readFileSync(p, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')
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
/** Semua potongan ada dan berurutan. */
function urut(teks: string, ...potongan: string[]): boolean {
  let pos = -1
  for (const p of potongan) { pos = teks.indexOf(p, pos + 1); if (pos < 0) return false }
  return true
}

const r = (bulan: number, cid: string, keu: number, fisik = keu, lain: Partial<BarisBanding> = {}): BarisBanding =>
  ({ bulan, ssk_canonical_id: cid, keterangan: `Rek ${cid}`, uraian_ssk: 'U', program: 'P', kegiatan: 'K',
     subkegiatan: 'S', ssk_versi_tipe: 'MURNI', ssk_versi_seq: 0, real_fisik: fisik, real_keuangan: keu, ...lain })

console.log('\n── A. bandingRealisasi ──────────────────────────────────────────')
{
  const lama = [r(1, 'A', 100), r(1, 'B', 50), r(9, 'A', 0), r(9, 'B', 0)]
  ok('A1 identik → tidak ada perubahan', !bandingRealisasi(lama, lama.map(x => ({ ...x }))).adaPerubahan)
  const dariDb = lama.map(x => ({ ...x, real_keuangan: `${x.real_keuangan}.00`, real_fisik: `${x.real_fisik}.00`, ssk_versi_seq: '0' }))
  ok('A2 DECIMAL string dari DB = angka layar', !bandingRealisasi(dariDb, lama).adaPerubahan)
  ok('A3 selisih < 1 sen bukan perubahan', !bandingRealisasi(lama, [r(1, 'A', 100.001), ...lama.slice(1)]).adaPerubahan)
  const ubah = bandingRealisasi(lama, [lama[0], lama[1], r(9, 'A', 250), lama[3]])
  ok('A4 satu sel September → hanya September, 1 berubah', ubah.perBulan.length === 1
    && ubah.perBulan[0].bulan === 9 && ubah.perBulan[0].berubah === 1 && ubah.perBulan[0].selisihKeuangan === 250)
  ok('A5 pasanganSama: 3 baris tak berubah dipasangkan, yang berubah tidak',
    ubah.pasanganSama.size === 3 && !ubah.pasanganSama.has(2) && ubah.pasanganSama.get(3) === 3)
  const baru = bandingRealisasi(lama, [...lama, r(9, 'C', 7)])
  ok('A6 baris baru → baru 1, selisih +7', baru.perBulan[0].baru === 1 && baru.perBulan[0].selisihKeuangan === 7)
  const hilang = bandingRealisasi(lama, lama.slice(1))
  ok('A7 baris hilang → hilang 1, selisih −100', hilang.perBulan[0].hilang === 1 && hilang.perBulan[0].selisihKeuangan === -100)
  const label = bandingRealisasi(lama, [r(1, 'A', 100, 100, { keterangan: 'Nama baru' }), ...lama.slice(1)])
  ok('A8 label saja berubah → tetap "berubah" (ikut tersimpan)', label.adaPerubahan && label.perBulan[0].berubah === 1)
  ok('A9 …dan baris itu TIDAK membawa jejak lama', !label.pasanganSama.has(0))
  // Baris kembar dipasangkan menurut kemunculan.
  const kembar = [r(3, 'D', 10), r(3, 'D', 20)]
  ok('A10 kembar: urutan sama = identik', !bandingRealisasi(kembar, kembar.map(x => ({ ...x }))).adaPerubahan)
  ok('A11 kembar: kemunculan kedua berubah → 1 berubah', bandingRealisasi(kembar, [r(3, 'D', 10), r(3, 'D', 25)]).perBulan[0].berubah === 1)
  // Dua kasus di atas tetap lulus walau semua kembar menumpuk di satu kunci (uji mutasi
  // #4 lolos) — yang membedakan hanya kembar yang BERTAMBAH atau BERKURANG.
  const tambah = bandingRealisasi(kembar, [...kembar, r(3, 'D', 30)]).perBulan[0]
  ok('A11b kembar bertambah satu → 1 baru, 0 berubah', tambah.baru === 1 && tambah.berubah === 0, JSON.stringify(tambah))
  const kurang = bandingRealisasi(kembar, [r(3, 'D', 10)]).perBulan[0]
  ok('A11c kembar berkurang satu → 1 hilang (yang 20), 0 berubah', kurang.hilang === 1 && kurang.berubah === 0 && kurang.selisihKeuangan === -20, JSON.stringify(kurang))
  ok('A12 tanpa canonical memakai keterangan+uraian', kunciRealisasi({ bulan: 2, ssk_canonical_id: '', keterangan: 'X', uraian_ssk: 'Y' }) === '2|n:X\u0000Y')
  ok('A13 kalimat ringkasan', kalimatRingkasan(ubah.perBulan) === 'September: 1 baris berubah (+Rp 250)', kalimatRingkasan(ubah.perBulan))
  ok('A14 kalimat tanda minus', kalimatRingkasan(hilang.perBulan) === 'Januari: 1 baris hilang (−Rp 100)', kalimatRingkasan(hilang.perBulan))
  ok('A15 kosong → "tidak ada yang berubah"', kalimatRingkasan([]) === 'tidak ada yang berubah')
  const banyak = Array.from({ length: 6 }, (_, i) => ({ bulan: i + 1, berubah: 1, baru: 0, hilang: 0, selisihKeuangan: 0 }))
  ok('A16 lebih dari maks → "dan N bulan lain"', kalimatRingkasan(banyak, 4).endsWith('· dan 2 bulan lain'))
  ok('A17 belum tersimpan per bulan', kalimatBelumTersimpan([{ bulan: 8, berubah: 1, baru: 0, hilang: 0, selisihKeuangan: 0 },
    { bulan: 9, berubah: 12, baru: 2, hilang: 0, selisihKeuangan: 0 }]) === 'Agustus 1 baris · September 14 baris')
}

console.log('\n── B. gabungBentrok ─────────────────────────────────────────────')
{
  const dasar = [r(8, 'A', 10), r(9, 'A', 0), r(9, 'B', 0)]
  // Saya mengetik September A; orang lain mengubah Agustus A.
  const layar = [r(8, 'A', 10), r(9, 'A', 77), r(9, 'B', 0)]
  const terbaru = [r(8, 'A', 15), r(9, 'A', 0), r(9, 'B', 0)]
  const g = gabungBentrok(dasar, layar, terbaru)
  ok('B1 ketikan saya terpasang', Number(g.rows.find(x => x.bulan === 9 && x.ssk_canonical_id === 'A')?.real_keuangan) === 77)
  ok('B2 simpanan orang lain tetap', Number(g.rows.find(x => x.bulan === 8)?.real_keuangan) === 15)
  ok('B3 tanpa bentrok, 1 baris dipasang', g.bentrok.length === 0 && g.dipasang === 1)
  ok('B4 orangLain menyebut Agustus', g.orangLain.length === 1 && g.orangLain[0].bulan === 8)
  ok('B5 tidak memutasi masukan', Number(terbaru[1].real_keuangan) === 0)

  const terbaru2 = [r(8, 'A', 10), r(9, 'A', 50, 77), r(9, 'B', 0)]
  const g2 = gabungBentrok(dasar, layar, terbaru2)
  ok('B6 sel yang sama diubah dua orang → bentrok (keuangan), fisik tidak', g2.bentrok.length === 1
    && g2.bentrok[0].kolom === 'real_keuangan' && g2.bentrok[0].milikSaya === 77 && g2.bentrok[0].tersimpan === 50)
  ok('B7 sel bentrok sementara memegang angka tersimpan', Number(g2.rows[1].real_keuangan) === 50)
  ok('B8 pilih "saya" → angka saya', Number(terapkanPilihanBentrok(g2.rows, g2.bentrok, 'saya')[1].real_keuangan) === 77)
  ok('B9 pilih "tersimpan" → angka tersimpan', Number(terapkanPilihanBentrok(g2.rows, g2.bentrok, 'tersimpan')[1].real_keuangan) === 50)
  ok('B10 angka akhir sama dari dua orang → bukan bentrok',
    gabungBentrok(dasar, layar, [r(8, 'A', 10), r(9, 'A', 77), r(9, 'B', 0)]).bentrok.length === 0)

  const g3 = gabungBentrok(dasar, layar, [r(8, 'A', 10), r(9, 'B', 0)])
  ok('B11 baris lenyap di server → tidak bisa dipasang (hilang)', g3.tidakBisa.some(x => x.alasan === 'hilang' && x.bulan === 9))
  const g4 = gabungBentrok(dasar, layar, terbaru, new Set([9]))
  ok('B12 bulan baru saja ditutup → tidak bisa dipasang (tertutup)', g4.tidakBisa.some(x => x.alasan === 'tertutup')
    && Number(g4.rows.find(x => x.bulan === 9 && x.ssk_canonical_id === 'A')?.real_keuangan) === 0)

  const init = [...layar, r(10, 'C', 0), r(9, 'C', 5)]
  const g5 = gabungBentrok(dasar, init, terbaru, new Set([9]))
  ok('B13 baris Init bernilai 0 ditambahkan', g5.rows.some(x => x.bulan === 10 && x.ssk_canonical_id === 'C'))
  ok('B14 baris baru berangka di bulan tertutup → tidak bisa dipasang', !g5.rows.some(x => x.bulan === 9 && x.ssk_canonical_id === 'C')
    && g5.tidakBisa.some(x => x.alasan === 'tertutup' && x.label === 'Rek C'))

  const pendek = [r(8, 'A', 10), r(9, 'A', 0)]   // foto riwayat tanpa September B
  ok('B15 baris yang saya buang ikut dibuang kalau orang lain tak mengubahnya',
    !gabungBentrok(dasar, pendek, terbaru).rows.some(x => x.bulan === 9 && x.ssk_canonical_id === 'B'))
  const g6 = gabungBentrok(dasar, pendek, [r(8, 'A', 10), r(9, 'A', 0), r(9, 'B', 9)])
  ok('B16 …tapi dipertahankan & disebut kalau orang lain mengubahnya', g6.rows.some(x => x.ssk_canonical_id === 'B')
    && g6.tidakBisa.some(x => x.alasan === 'diubah-orang-lain'))
}

console.log('\n── C. pelanggaranBulanTertutup ──────────────────────────────────')
{
  const lama = [r(1, 'A', 100), r(1, 'B', 0), r(2, 'A', 5)]
  const T = new Set([1])
  ok('C1 tanpa bulan tertutup → kosong', pelanggaranBulanTertutup(lama, [], new Set()).length === 0)
  ok('C2 identik → kosong', pelanggaranBulanTertutup(lama, lama, T).length === 0)
  const ubah = pelanggaranBulanTertutup(lama, [r(1, 'A', 90, 100), lama[1], lama[2]], T)
  ok('C3 angka Januari berubah → satu pelanggaran keuangan', ubah.length === 1 && ubah[0].kolom === 'real_keuangan' && ubah[0].lama === 100 && ubah[0].baru === 90)
  ok('C4 bulan terbuka bebas', pelanggaranBulanTertutup(lama, [lama[0], lama[1], r(2, 'A', 99)], T).length === 0)
  ok('C5 baris baru bernilai 0 diterima', pelanggaranBulanTertutup(lama, [...lama, r(1, 'C', 0)], T).length === 0)
  ok('C6 baris baru berangka ditolak', pelanggaranBulanTertutup(lama, [...lama, r(1, 'C', 3, 0)], T).length === 1)
  ok('C7 baris berangka yang hilang ditolak', pelanggaranBulanTertutup(lama, lama.slice(1), T).length === 2)
  ok('C8 baris nol yang hilang tidak masalah', pelanggaranBulanTertutup(lama, [lama[0], lama[2]], T).length === 0)
  ok('C9 kalimat menyebut bulan & rekeningnya', kalimatPelanggaran(ubah).startsWith('Januari sudah ditutup') && kalimatPelanggaran(ubah).includes('Rek A'))
}

console.log('\n── D. Urutan Tutup / Buka ───────────────────────────────────────')
{
  ok('D1 Januari boleh ditutup pertama', alasanTolakTutup([], 1) === null)
  ok('D2 Maret saat Februari terbuka → ditolak, menyebut Februari', (alasanTolakTutup([1], 3) ?? '').startsWith('Tutup Februari dulu'))
  ok('D3 Maret sesudah Jan–Feb → boleh', alasanTolakTutup([1, 2], 3) === null)
  ok('D4 tutup dua kali → ditolak', alasanTolakTutup([1], 1) !== null)
  ok('D5 bulan di luar 1–12 → ditolak', alasanTolakTutup([], 13) !== null && alasanTolakTutup([], 0) !== null)
  ok('D6 buka yang terakhir → boleh', alasanTolakBuka([1, 2, 3], 3) === null)
  ok('D7 buka yang bukan terakhir → ditolak, menyebut Maret', (alasanTolakBuka([1, 2, 3], 2) ?? '').startsWith('Buka Maret dulu'))
  ok('D8 buka yang belum ditutup → ditolak', alasanTolakBuka([1], 4) !== null)
}

console.log('\n── E. perubahanTargetTertutup (RKO) ─────────────────────────────')
{
  const bln = (v: number) => ({ jan: v, feb: v, mar: v, apr: v, mei: v, jun: v, jul: v, agu: v, sep: v, okt: v, nov: v, des: v })
  const lama = [{ canonical_id: 'A', uraian: 'Rek A', pagu: 1200, months: bln(100) }]
  const T = new Set([1, 2])
  ok('E1 tanpa bulan tertutup → kosong', perubahanTargetTertutup(lama, [{ ...lama[0], pagu: 1 }], new Set()).length === 0)
  ok('E2 target Januari berubah → disebut', perubahanTargetTertutup(lama, [{ ...lama[0], months: { ...bln(100), jan: 1 } }], T)
    .some(p => p.bulan === 1 && p.lama === 100 && p.baru === 1))
  ok('E3 target Oktober (terbuka) → tidak', perubahanTargetTertutup(lama, [{ ...lama[0], months: { ...bln(100), okt: 1 } }], T).length === 0)
  ok('E4 pagu berubah → disebut (bulan null)', perubahanTargetTertutup(lama, [{ ...lama[0], pagu: 1300 }], T).some(p => p.bulan === null))
  ok('E5 rekening baru bernol → tidak', perubahanTargetTertutup(lama, [...lama, { canonical_id: '', uraian: 'Baru', pagu: 0, months: bln(0) }], T).length === 0)
  ok('E6 rekening bertarget Januari dihapus → disebut', perubahanTargetTertutup(lama, [], T).some(p => p.bulan === 1 && p.baru === 0))
}

console.log('\n── F. jumlahSskBerubah ──────────────────────────────────────────')
{
  const bln = (v: number) => ({ jan: v, feb: v, mar: v, apr: v, mei: v, jun: v, jul: v, agu: v, sep: v, okt: v, nov: v, des: v })
  const a = { canonical_id: 'A', uraian_ssk: 'U', uraian: 'A', program: 'P', kegiatan: 'K', subkegiatan: 'S', pagu: 100, months: bln(1) }
  const b = { ...a, canonical_id: 'B', uraian: 'B' }
  const c = { ...a, canonical_id: 'C', uraian: 'C' }
  ok('F1 identik → 0', jumlahSskBerubah([a, b, c], [a, b, c].map(x => ({ ...x }))) === 0)
  ok('F2 satu sel → 1', jumlahSskBerubah([a, b, c], [a, { ...b, months: { ...bln(1), mar: 9 } }, c]) === 1)
  ok('F3 sisip di tengah → 1, bukan "semua sesudahnya"', jumlahSskBerubah([a, b, c], [a, { ...a, canonical_id: '', uraian: 'X' }, b, c]) === 1)
  ok('F4 hapus satu → 1', jumlahSskBerubah([a, b, c], [a, c]) === 1)
  ok('F5 kolom turunan (months_pct/total) tidak dihitung', jumlahSskBerubah([a], [{ ...a, months_pct: bln(50), total: 9 } as typeof a]) === 0)
  ok('F6 nol-kan terhitung', jumlahSskBerubah([a], [{ ...a, is_nullified: true } as typeof a]) === 1)
}

console.log('\n── G. Sambungan di semua jalur (L69) ───────────────────────────')
{
  const K = kode('lib/data/kinerja.ts')
  // Penanda di UJUNG tanda tangan: parameter bertipe objek punya `{` sendiri.
  const simpan = badan(K, '): Promise<HasilSimpanRealisasi>')
  ok('G1 Simpan Realisasi: gembok diambil PALING DULU, tanpa syarat',
    urut(simpan, 'await withTransaction(', 'await acquireBludLock(tx, lockEntity, lockKey);', 'if (expectedVersion !== undefined)'))
  ok('G2 …pagar bulan tertutup SEBELUM DELETE', urut(simpan, 'const langgar = pelanggaranBulanTertutup(lama, rows, tertutup);',
    'if (langgar.length > 0) throw new KinerjaBulanTertutupError(langgar);', 'DELETE FROM kinerja_realisasi'))
  ok('G3 …isi identik keluar SEBELUM DELETE', urut(simpan, 'if (!banding.adaPerubahan) return;', 'DELETE FROM kinerja_realisasi'))
  ok('G4 …angka gembok naik tanpa syarat expectedVersion', urut(simpan, 'DELETE FROM kinerja_realisasi', 'ON DUPLICATE KEY UPDATE version = version + 1')
    && !/if \(expectedVersion !== undefined\) \{\s*await tx`\s*INSERT INTO blud_locks/.test(simpan))
  ok('G5 …jejak lama untuk baris tak berubah', simpan.includes('jejak ? jejak.updated_by : userId') && simpan.includes('jejak ? jejak.updated_at : sekarang'))
  ok('G6 …bulan tertutup dibaca lewat tx (di bawah gembok)', simpan.includes('await bulanTertutupSet(tx, tahun, sumber)'))
  const sskF = badan(K, 'setujuBulanTertutup = false,\n)')
  ok('G7 Simpan RKO: peringatan bulan tertutup SEBELUM DELETE, bisa disetujui', urut(sskF, 'if (!setujuBulanTertutup) {',
    'perubahanTargetTertutup(', 'throw new KinerjaTargetTertutupError(', 'DELETE FROM kinerja_ssk'))

  const rRoute = kode('app/api/kinerja/realisasi/route.ts')
  ok('G8 Route Realisasi: 409 BULAN_TERTUTUP', rRoute.includes("code: 'BULAN_TERTUTUP'") && rRoute.includes('err instanceof KinerjaBulanTertutupError'))
  ok('G9 …audit hanya bila ada yang ditulis', urut(rRoute, 'if (!hasil.tidakBerubah) {', "eventType: 'KINERJA_SAVE_REALISASI'"))
  ok('G10 …audit memakai ringkasan, bukan jumlah baris', rRoute.includes('kalimatRingkasan(hasil.perBulan, 12)'))
  ok('G11 …GET membawa daftar bulan tertutup di balasan yang sama', rRoute.includes('daftarBulanTertutup(sql, tahun, sumber)')
    && /version, tertutup \}\);/.test(rRoute))
  ok('G12 …409 bentrok menyebut siapa & jam', rRoute.includes("code: 'VERSION_CONFLICT', message: err.message, actual: err.actual, oleh, pada"))
  const sRoute = kode('app/api/kinerja/ssk/route.ts')
  ok('G13 Route RKO: 409 TARGET_BULAN_TERTUTUP + persetujuan diteruskan', sRoute.includes("code: 'TARGET_BULAN_TERTUTUP'")
    && sRoute.includes('setuju_bulan_tertutup ?? false'))
  const tRoute = kode('app/api/kinerja/realisasi/tutup-bulan/route.ts')
  ok('G14 Route Tutup Bulan: sakelar → izin modul → rate limit → Zod', urut(tRoute, 'await kinerjaMati(session.role)',
    'hasAppAccess(session.userId, session.role, isKinerjaRole)', 'kinerjaRateLimit(', 'TutupBulanBodySchema.safeParse'))
  ok('G15 …tercatat di audit', tRoute.includes("'KINERJA_TUTUP_BULAN' : 'KINERJA_BUKA_BULAN'"))
  const tData = kode('lib/kinerja/tutup-bulan-data.ts')
  ok('G16 Tutup & Buka memegang gembok Simpan sebagai perintah pertama',
    urut(badan(tData, 'export async function tutupBulanRealisasi('), 'acquireBludLock(tx, REALISASI_LOCK_ENTITY, realisasiLockKey(tahun, sumber))', 'alasanTolakTutup(')
    && urut(badan(tData, 'export async function bukaBulanRealisasi('), 'acquireBludLock(tx, REALISASI_LOCK_ENTITY, realisasiLockKey(tahun, sumber))', 'alasanTolakBuka('))
  ok('G17 gembok Simpan = gembok Tutup (satu konstanta)', K.includes("from '@/lib/kinerja/tutup-bulan'")
    && simpan.includes('const lockEntity = REALISASI_LOCK_ENTITY;') && !/REALISASI_LOCK_ENTITY = /.test(K))
  const reset = kode('app/api/kinerja/reset/route.ts')
  ok('G18 Reset realisasi ditolak selama ada bulan tertutup (di bawah gembok)', urut(reset, "if (scope === 'realisasi' || scope === 'both') {",
    'acquireBludLock(tx, REALISASI_LOCK_ENTITY', 'if (await adaBulanTertutup(tx, tahun, sumber)) throw new ResetBulanTertutupError();', 'DELETE FROM kinerja_realisasi'))

  const RT = kode('app/(dashboard)/kinerja/_tabs/RealisasiTab.tsx')
  const save = badan(RT, 'async function saveRealisasi(')
  ok('G19 Layar: 409 bentrok digabung, tidak lagi dimuat ulang buta', urut(save, "kode === 'VERSION_CONFLICT'", 'await gabungSesudahBentrok(')
    && !/'VERSION_CONFLICT'\) \{\s*toast\.error\([^)]*\);\s*refetchReal\(\);/.test(save))
  ok('G20 …409 bulan tertutup ditangani', save.includes("kode === 'BULAN_TERTUTUP'") && save.includes('await tanganiBulanTertutup('))
  ok('G21 …sukses memperbarui dasar', urut(save, 'if (d.ok) {', 'setRealDasar(rows)'))
  const gab = badan(RT, 'pada?: string | null })')
  ok('G22 Gabung: angka kunci & dasar dari muatan TERBARU (L77)', urut(gab, 'gabungBentrok(realDasar, realisasiRows, h.rows,', 'setRealDasar(h.rows);', 'setRealVersion(h.version);'))
  ok('G23 Gabung: tidak menyimpan otomatis (L78)', !gab.includes("fetchJson<unknown>('/api/kinerja/realisasi'") && !gab.includes('saveRealisasi('))
  ok('G24 Impor melewati bulan tertutup', badan(RT, 'real_fisik?: number }[])').includes('semua.filter(it => !tertutupSet.has(it.bulan_ke))'))
  // Ditemukan saat dicoba di layar: toast modal menghitung isi BERKAS ("4 baris diisi")
  // padahal 2 di antaranya dilewati karena Januari tertutup.
  const imporModal = badan(kode('components/kinerja/ImportRealisasiModal.tsx'), 'function terapkan()')
  ok('G24b Toast impor menyebut baris yang BENAR-BENAR diisi', urut(imporModal, 'const masuk = onApply(items);', 'if (masuk > 0) toast.success(`${masuk} baris diisi')
    && !imporModal.includes('${items.length} baris diisi')
    && badan(RT, 'real_fisik?: number }[])').includes('return items.length;'))
  ok('G25 Pulihkan mempertahankan bulan tertutup', urut(badan(RT, 'item: { id: number; disimpan_pada: string })'),
    '...realisasiRows.filter(r => tertutupSet.has(r.bulan))', '...pulih.filter(r => !tertutupSet.has(r.bulan))'))
  ok('G26 Samakan mati di bulan tertutup', badan(RT, 'async function samakanBulanIni(').includes('if (bulanIniTertutup) return;')
    && RT.includes('disabled={versiLocked || bulanIniTertutup}'))
  ok('G27 Sel bulan tertutup hanya-baca', (RT.match(/\{bisaSunting\s*\n?\s*\?/g) ?? []).length === 2
    && RT.includes('const bisaSunting = canEdit && !bulanIniTertutup;'))
  ok('G28 Pemilih versi Realisasi lewat penjaga', RT.includes('onChange={v => pilihVersi(v)}') && !RT.includes('setSskVersi'))

  const ST = kode('app/(dashboard)/kinerja/_tabs/SskTab.tsx')
  ok('G29 RKO: Buat Perubahan ditahan selama ada suntingan', urut(ST, 'onCreatePerubahan={() => {', 'if (sskBerubah > 0) {', 'return;', 'setConfirmCreate(true);'))
  ok('G30 RKO: peringatan bulan tertutup mengulang dgn persetujuan', ST.includes("'TARGET_BULAN_TERTUTUP'") && ST.includes('await saveSsk(force, true); return;'))
  ok('G31 RKO: pemilih versi lewat penjaga', ST.includes('onChange={v => pilihVersi(v)}'))

  const KC = kode('app/(dashboard)/kinerja/kinerja-client.tsx')
  ok('G32 Shell: versi acuan mengikuti sumber Realisasi di tab Realisasi/Cetak',
    KC.includes('const sumberVersi = tabRealisasi ? realisasiSumber : activeSumber;')
    && KC.includes('useEffect(() => { ensureLatestVersi(sumberVersi); }, [sumberVersi, tahun, ensureLatestVersi]);'))
  ok('G33 Shell: tiap pemuat bernomor giliran', urut(badan(KC, 'const fetchRealisasi = useCallback('), '++giliranRealRef.current', 'if (giliran !== giliranRealRef.current) return;')
    && urut(badan(KC, 'const fetchSsk = useCallback('), '++giliranSskRef.current', 'if (giliran !== giliranSskRef.current) return;')
    && urut(badan(KC, 'const ensureLatestVersi = useCallback('), '++giliranVersiRef.current', 'giliran !== giliranVersiRef.current'))
  ok('G34 Shell: pemuat mengisi dasar bersama barisnya', urut(badan(KC, 'const fetchRealisasi = useCallback('), 'setRealisasiRows(h.rows);', 'setRealDasar(h.rows);', 'setRealTertutup(h.tertutup);')
    && urut(badan(KC, 'const fetchSsk = useCallback('), 'setSskRows(h.rows);', 'setSskDasar(h.rows);', 'setSskVersion(h.version);'))
  ok('G35 Shell: pergantian sumber & versi di dalam tab lewat penjaga', KC.includes('setRealisasiSumber={gantiSumberRealisasi}')
    && KC.includes('setActiveSumber={gantiSumberRko}') && (KC.match(/pilihVersi=\{pilihVersi\}/g) ?? []).length === 2)
  ok('G36 Shell: ganti tahun lewat penjaga', urut(badan(KC, 'const handleTahunChange = useCallback('), 'guardPending(() => {', 'setTahun(t);'))
  ok('G37 Shell: "lanjutkan" membuang isian (bukan cuma menutup dialog)', urut(badan(KC, 'const guardPending = useCallback('), 'buangRef.current(); action();'))
  ok('G38 Shell: belum tersimpan DIHITUNG dari dasar, bukan bendera', KC.includes('bandingRealisasi(realDasar, realisasiRows)') && KC.includes('jumlahSskBerubah(sskDasar, sskRows)'))

  const skema = kode('docs/schema-mysql.sql').replace(/\s+/g, ' ')
  const mig = kode('docs/migrations/migration-kinerja-bulan-tutup.sql').replace(/\s+/g, ' ')
  const tabel = (s: string) => s.slice(s.indexOf('CREATE TABLE IF NOT EXISTS kinerja_bulan_tutup'), s.indexOf('COMMENT=', s.indexOf('CREATE TABLE IF NOT EXISTS kinerja_bulan_tutup')))
  ok('G39 Skema acuan & migrasi mendefinisikan tabel yang sama persis', tabel(skema).length > 50 && tabel(skema) === tabel(mig))
  ok('G40 PRIMARY KEY yang menolak tutup ganda', tabel(mig).includes('PRIMARY KEY (tahun, sumber, bulan)'))
  const ret = kode('lib/security/retensi-audit.ts')
  ok('G41 Jenis audit baru digolongkan "perubahan data"', ret.includes('KINERJA_TUTUP_BULAN: P, KINERJA_BUKA_BULAN: P'))
}

console.log('\n── H. fetchJson meneruskan isi balasan 409 ──────────────────────')
{
  // Dialog bentrok/bulan tertutup/penurunan drastis membaca bahan kalimatnya dari
  // balasan 409. Dulu fetchJson cuma meneruskan message/status/code, jadi dialog
  // penurunan berbunyi "tersimpan 0 baris, akan ditulis 0 baris".
  const asli = globalThis.fetch
  globalThis.fetch = (async () => new Response(JSON.stringify({
    ok: false, code: 'PENURUNAN_DRASTIS', message: 'turun', existing: 180, incoming: 12,
    oleh: 'Budi', pada: '10:42', pelanggaran: [{ bulan: 1 }],
  }), { status: 409, headers: { 'Content-Type': 'application/json' } })) as typeof fetch
  try {
    const { fetchJson } = await import('../lib/shared/api')
    const d = await fetchJson('/x') as Record<string, unknown>
    ok('H1 status, code, message tetap', d.ok === false && d.status === 409 && d.code === 'PENURUNAN_DRASTIS' && d.message === 'turun')
    ok('H2 existing/incoming ikut (dialog penurunan)', d.existing === 180 && d.incoming === 12)
    ok('H3 oleh/pada/pelanggaran ikut (bentrok & bulan tertutup)', d.oleh === 'Budi' && d.pada === '10:42' && Array.isArray(d.pelanggaran))
  } finally {
    globalThis.fetch = asli
  }
}

console.log('\n── I. Tahap 4 — gabung bentrok RKO ──────────────────────────────')
{
  const bln = (v: number) => ({ jan: v, feb: v, mar: v, apr: v, mei: v, jun: v, jul: v, agu: v, sep: v, okt: v, nov: v, des: v })
  type B = { canonical_id?: string; uraian_ssk: string; uraian: string; pagu: number; months: Record<string, number>; is_nullified?: boolean }
  const s = (cid: string, pagu = 1200, m = 100, lain: Partial<B> = {}): B =>
    ({ canonical_id: cid, uraian_ssk: 'U', uraian: `Rek ${cid}`, pagu, months: bln(m), ...lain })
  const ubahBulan = (r: B, k: string, v: number): B => ({ ...r, months: { ...r.months, [k]: v } })
  const dasar = [s('A'), s('B'), s('C')]

  {
    const g = gabungBentrokSsk(dasar, [ubahBulan(dasar[0], 'mar', 500), dasar[1], dasar[2]], [dasar[0], ubahBulan(dasar[1], 'jun', 700), dasar[2]])
    ok('I1 beda baris → dua-duanya bertahan, tanpa bentrok', g.bentrok.length === 0 && g.dipasang === 1
      && g.rows[0].months.mar === 500 && g.rows[1].months.jun === 700)
  }
  {
    const g = gabungBentrokSsk(dasar, [ubahBulan(dasar[0], 'mar', 500), dasar[1], dasar[2]], [ubahBulan(dasar[0], 'jun', 700), dasar[1], dasar[2]])
    ok('I2 baris sama, bulan beda → per sel, tanpa bentrok', g.bentrok.length === 0 && g.rows[0].months.mar === 500 && g.rows[0].months.jun === 700)
  }
  {
    const g = gabungBentrokSsk(dasar, [ubahBulan(dasar[0], 'mar', 500), dasar[1], dasar[2]], [ubahBulan(dasar[0], 'mar', 900), dasar[1], dasar[2]])
    ok('I3 sel sama, angka beda → bentrok; isi tersimpan yang tinggal', g.bentrok.length === 1 && g.bentrok[0].kolom === 'mar'
      && g.bentrok[0].milikSaya === 500 && g.bentrok[0].tersimpan === 900 && g.rows[0].months.mar === 900)
    ok('I4 "pakai angka saya" menulis ketikan', terapkanPilihanBentrokSsk(g.rows, g.bentrok, 'saya')[0].months.mar === 500)
    ok('I5 "pakai angka tersimpan" membiarkan', terapkanPilihanBentrokSsk(g.rows, g.bentrok, 'tersimpan')[0].months.mar === 900)
  }
  {
    const g = gabungBentrokSsk(dasar, [ubahBulan(dasar[0], 'mar', 500), dasar[1], dasar[2]], [ubahBulan(dasar[0], 'mar', 500), dasar[1], dasar[2]])
    ok('I6 angka sama di kedua pihak → bukan bentrok', g.bentrok.length === 0 && g.rows[0].months.mar === 500)
  }
  {
    const g = gabungBentrokSsk(dasar, [{ ...dasar[0], pagu: 2400 }, dasar[1], dasar[2]], [dasar[0], dasar[1], dasar[2]])
    ok('I7 pagu ikut digabung', g.rows[0].pagu === 2400 && g.dipasang === 1)
  }
  {
    const baru: B = { uraian_ssk: 'U', uraian: 'Rek BARU', pagu: 50, months: bln(5) }
    const g = gabungBentrokSsk(dasar, [...dasar, baru], dasar)
    ok('I8 baris hasil Inject ikut, di belakang', g.rows.length === 4 && g.rows[3].uraian === 'Rek BARU' && g.dipasang === 1)
    const milikLain = s('K-LAIN', 50, 5, { uraian: 'Rek BARU' })
    const g2 = gabungBentrokSsk(dasar, [...dasar, baru], [...dasar, milikLain])
    ok('I9 rekening yang sama sudah ditambahkan orang lain → SATU baris, bukan dua', g2.rows.length === 4
      && g2.rows.filter(r => r.uraian === 'Rek BARU').length === 1 && g2.rows[3].canonical_id === 'K-LAIN' && g2.bentrok.length === 0)
    const g2b = gabungBentrokSsk(dasar, [...dasar, baru, { ...baru, pagu: 70 }], [...dasar, milikLain])
    ok('I9b dua baris baru bernama sama, orang lain menambah satu → yang kedua tetap ikut', g2b.rows.length === 5
      && g2b.rows.filter(r => r.uraian === 'Rek BARU').length === 2 && g2b.rows[4].pagu === 70)
    const g3 = gabungBentrokSsk(dasar, [...dasar, { ...baru, pagu: 80 }], [...dasar, milikLain])
    ok('I10 …dgn angka berbeda → bentrok pada baris orang itu', g3.rows.length === 4 && g3.bentrok.some(b => b.kolom === 'pagu' && b.milikSaya === 80)
      && terapkanPilihanBentrokSsk(g3.rows, g3.bentrok, 'saya')[3].pagu === 80)
  }
  {
    const g = gabungBentrokSsk(dasar, [dasar[0], dasar[2]], dasar)
    ok('I11 baris yang saya hapus & tak disentuh orang lain → ikut terhapus', g.rows.length === 2 && !g.rows.some(r => r.canonical_id === 'B'))
    const g2 = gabungBentrokSsk(dasar, [dasar[0], dasar[2]], [dasar[0], ubahBulan(dasar[1], 'jan', 1), dasar[2]])
    ok('I12 …tapi diubah orang lain → dipertahankan & disebut', g2.rows.some(r => r.canonical_id === 'B')
      && g2.tidakBisa.some(x => x.alasan === 'diubah-orang-lain'))
  }
  {
    const g = gabungBentrokSsk(dasar, [ubahBulan(dasar[0], 'mar', 500), dasar[1], dasar[2]], [dasar[1], dasar[2]])
    ok('I13 ketikan di baris yang dihapus orang lain → disebut "hilang", tidak dihidupkan lagi', g.rows.length === 2
      && g.tidakBisa.length === 1 && g.tidakBisa[0].alasan === 'hilang')
  }
  {
    // Nol-kan: diputuskan UTUH. Per sel, "pakai tersimpan" di Februari melahirkan baris
    // dinol-kan yang masih bertarget Februari.
    const nol = { ...dasar[0], is_nullified: true, pagu: 0, months: bln(0) }
    const lain = ubahBulan(dasar[0], 'feb', 999)
    const g = gabungBentrokSsk(dasar, [nol, dasar[1], dasar[2]], [lain, dasar[1], dasar[2]])
    ok('I14 nol-kan × suntingan orang lain → tidak dipasang sebagian', g.rows[0].is_nullified !== true && g.rows[0].months.feb === 999 && g.rows[0].pagu === 1200)
    const saya = terapkanPilihanBentrokSsk(g.rows, g.bentrok, 'saya')[0]
    ok('I15 …"saya" = baris dinol-kan utuh', saya.is_nullified === true && saya.pagu === 0 && Object.values(saya.months).every(v => v === 0))
    const tersimpan = terapkanPilihanBentrokSsk(g.rows, g.bentrok, 'tersimpan')[0]
    ok('I16 …"tersimpan" = baris orang lain utuh', tersimpan.is_nullified !== true && tersimpan.months.feb === 999 && tersimpan.months.mar === 100)
    const g2 = gabungBentrokSsk(dasar, [nol, dasar[1], dasar[2]], dasar)
    ok('I17 nol-kan tanpa saingan → dipasang utuh', g2.rows[0].is_nullified === true && g2.rows[0].pagu === 0 && g2.bentrok.length === 0)
    const g3 = gabungBentrokSsk(dasar, [ubahBulan(dasar[0], 'mar', 500), dasar[1], dasar[2]], [nol, dasar[1], dasar[2]])
    ok('I18 orang lain nol-kan × suntingan saya → ditanyakan utuh, tidak menempel di baris dinol-kan', g3.rows[0].is_nullified === true
      && g3.rows[0].months.mar === 0 && g3.bentrok.some(b => b.kolom === 'is_nullified'))
  }
  {
    const terbaru = [ubahBulan(dasar[0], 'mar', 9), dasar[1], dasar[2]]
    const g = gabungBentrokSsk(dasar, dasar.map(x => ({ ...x })), terbaru)
    ok('I19 tanpa ketikan → isi terbaru apa adanya', g.dipasang === 0 && g.bentrok.length === 0 && g.rows[0].months.mar === 9)
    ok('I20 hasil tidak berbagi objek dgn isi terbaru (layar bebas disunting)', g.rows.every((r, i) => r !== terbaru[i] && r.months !== terbaru[i].months))
  }
  ok('I21 kalimat sel bentrok', kalimatSelBentrokSsk({ kunci: 'c:A#0', label: 'Rek A', kolom: 'feb', milikSaya: 10, tersimpan: 12 }, n => String(n))
    === '• Rek A — target Feb: Anda 10 · tersimpan 12'
    && kalimatSelBentrokSsk({ kunci: 'c:A#0', label: 'Rek A', kolom: 'is_nullified', milikSaya: 1, tersimpan: 0 }, n => String(n)).endsWith('nol-kan: Anda ya · tersimpan tidak'))

  const ST = kode('app/(dashboard)/kinerja/_tabs/SskTab.tsx')
  const save = badan(ST, 'async function saveSsk(')
  ok('I22 Layar RKO: 409 bentrok digabung, tidak lagi dimuat ulang buta', urut(save, "'VERSION_CONFLICT'", 'await gabungSesudahBentrok(')
    && !/'VERSION_CONFLICT'\) \{\s*toast\.error\([^)]*\);\s*refetchSsk\(\);/.test(save))
  // Penanda di UJUNG tanda tangan: parameternya bertipe objek, `{` pertama milik tipe itu.
  const gab = badan(ST, 'pada?: string | null })')
  ok('I23 Gabung RKO: dasar & angka kunci dari muatan TERBARU (L77)', urut(gab, 'gabungBentrokSsk(sskDasar, sskRows, h.rows)', 'setSskDasar(h.rows);', 'setSskVersion(h.version);'))
  ok('I24 …turunan dihitung ulang lewat rumus tunggal', gab.includes('setSskRows(rows.map(r => ({ ...r, ...hitungTurunanRko(r.pagu, r.months) })));'))
  ok('I25 …tidak menyimpan otomatis (L78)', !gab.includes("'/api/kinerja/ssk'") && !gab.includes('saveSsk('))
  // Cabangnya dipotong sampai `} else if` berikutnya — pesannya memuat `${…}`, jadi
  // pola `[^}]*` berhenti di tengah kalimat dan tak pernah sampai ke kodenya.
  const cabangKunci = save.slice(save.indexOf("'VERSI_TERKUNCI'"), save.indexOf('} else if', save.indexOf("'VERSI_TERKUNCI'")))
  ok('I26 Versi baru terkunci → ketikan TETAP di layar, daftar versi disegarkan', cabangKunci.includes('fetchVersiList();')
    && !cabangKunci.includes('refetchSsk(') && !cabangKunci.includes('setSskRows('))
  const sRoute = kode('app/api/kinerja/ssk/route.ts')
  ok('I27 Route RKO: 409 bentrok menyebut siapa & jam dari gembok versi itu', sRoute.includes("penyimpanTerakhir('kinerja_ssk', `${tahun}:${sumber}:${versiTipe}:${versiSeq}`)")
    && sRoute.includes("code: 'VERSION_CONFLICT', message: err.message, actual: err.actual, oleh, pada"))
  ok('I28 …versi terkunci punya kode sendiri', sRoute.includes('err instanceof KinerjaVersiTerkunciError') && sRoute.includes("code: 'VERSI_TERKUNCI'")
    && badan(kode('lib/data/kinerja.ts'), 'setujuBulanTertutup = false,\n)').includes('throw new KinerjaVersiTerkunciError(versiTipe, versiSeq);'))
  const KC = kode('app/(dashboard)/kinerja/kinerja-client.tsx')
  ok('I29 Shell: SskTab menerima dasar & pemuat tanpa-pasang', KC.includes('sskDasar={sskDasar}') && KC.includes('ambilSsk={ambilSsk}')
    && urut(badan(KC, 'const fetchSsk = useCallback('), 'await ambilSsk(sumber, versiTipe, versiSeq)'))
  // Perilakunya diuji di MySQL (suite -db [8]); di sini urutannya: induk dibaca SEBELUM DELETE.
  const sskF = badan(kode('lib/data/kinerja.ts'), 'setujuBulanTertutup = false,\n)')
  ok('I30 Simpan RKO membawa parent_versi_id lama (dibaca sebelum DELETE, bukan dari klien)',
    urut(sskF, 'SELECT canonical_id, parent_versi_id FROM kinerja_ssk', 'DELETE FROM kinerja_ssk', 'canonical, indukPer.get(canonical) ?? null,')
    && !sskF.slice(sskF.indexOf('const values = rows.map('), sskF.indexOf('await bulkInsert(')).includes('r.parent_versi_id'))
}

console.log(`\n${lulus} lulus, ${gagal.length} gagal`)
if (gagal.length) { for (const g of gagal) console.log('  - ' + g); process.exit(1) }
