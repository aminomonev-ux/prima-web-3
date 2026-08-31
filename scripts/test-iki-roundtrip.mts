// scripts/test-iki-roundtrip.mts — ekspor Excel IKI → impor lagi, DUA varian.
//
// Kenapa ada: parser impor dikalibrasi ke 20 berkas asli yang SEMUANYA varian
// STANDAR, jadi tidak ada satu pun yang menjaga varian DIREKTUR. Akibatnya nyata —
// mengunduh IKI Direktur lalu mengimpornya kembali ditolak "Kolom wajib target_tw
// tidak terdeteksi", padahal berkasnya hasil ekspor aplikasi ini sendiri.
//
// Sebabnya struktural: Target Triwulan membentang 3 kolom di STANDAR (romawi ·
// cara menghitung · target) tapi 2 di DIREKTUR (romawi · target). Pemilih kolom
// membuang romawi lalu "cara", dan di DIREKTUR yang terbuang justru satu-satunya
// kolom target.
//
// Uji ini menutup kontrak ekspor↔impor: berkasnya DIBUAT oleh `buildIkiExcelBytes`
// yang sama dengan tombol unduh, lalu dibaca `parseIkiExcel` yang sama dengan
// tombol impor. Tidak ada berkas contoh yang perlu disiapkan, jadi ia jalan di
// mana saja — berbeda dengan `test-iki-import.mjs` yang butuh arsip kalibrasi.
//
// Jalankan: npx tsx scripts/test-iki-roundtrip.mts

import { buildIkiExcelBytes } from '../lib/iki/export-excel'
import type { IkiGridDokumen } from '../lib/iki/layout'
import { parseIkiExcel } from '../lib/iki/import-excel'

let lulus = 0
let gagal = 0
function cek(nama: string, syarat: boolean, catatan = '') {
  if (syarat) { lulus++; console.log(`  ok    ${nama.padEnd(56)} ${catatan}`) }
  else        { gagal++; console.log(`  GAGAL ${nama.padEnd(56)} ${catatan}`) }
}

function dokumen(varian: 'STANDAR' | 'DIREKTUR'): IkiGridDokumen {
  return {
    varian,
    jenis: 'MURNI',
    opd: 'RSJD Dr. Amino Gondohutomo',
    nama: varian === 'DIREKTUR' ? 'dr. IKHWAN HAMZAH' : 'EKO MULYADI, SPd. MM',
    nip: '19700811 200312 1 002',
    jabatan: varian === 'DIREKTUR' ? 'DIREKTUR' : 'KASUBBAG PROGRAM',
    pangkat: 'Pembina Tingkat I',
    ikhtisar: null,
    nama_atasan: varian === 'DIREKTUR' ? null : 'dr. IKHWAN HAMZAH',
    nip_atasan: varian === 'DIREKTUR' ? null : '19700811 200312 1 002',
    jabatan_atasan: varian === 'DIREKTUR' ? null : 'DIREKTUR',
    pangkat_atasan: null,
    kota_ttd: 'Semarang',
    tanggal_ttd: '2026-01-02',
    rhk: [
      {
        no_urut: 1,
        rhk_intervensi: varian === 'DIREKTUR' ? null : 'Meningkatnya mutu layanan',
        rhk: 'Terlaksananya penyusunan dokumen perencanaan',
        aspek_a: 'Kuantitas', aspek_b: 'Jumlah dokumen', aspek_c: 'Dokumen',
        indikator: 'Jumlah dokumen perencanaan yang tersusun',
        target_tahunan: '12',
        formulasi: 'Jumlah dokumen tersusun dibagi target',
        ekspektasi: varian === 'DIREKTUR' ? null : 'Tepat waktu',
        triwulan: [
          { triwulan: 1, target_tw: '3', uraian: 'Menyusun draf awal',   target_aksi: '3' },
          { triwulan: 2, target_tw: '6', uraian: 'Menyusun draf lanjut', target_aksi: '3' },
          { triwulan: 3, target_tw: '9', uraian: 'Reviu dokumen',        target_aksi: '3' },
          { triwulan: 4, target_tw: '12', uraian: 'Finalisasi',          target_aksi: '3' },
        ],
      },
    ],
  }
}

for (const varian of ['STANDAR', 'DIREKTUR'] as const) {
  console.log(`\n── Varian ${varian} ──`)
  const doc = dokumen(varian)
  const bytes = await buildIkiExcelBytes(doc, '2026')

  // Parser MELEMPAR kalau strukturnya tidak dikenali — persis pesan yang dilihat
  // pemakai di layar. Ditangkap supaya kegagalannya terbaca sebagai satu baris
  // GAGAL, bukan tumpukan stack yang menyembunyikan pemeriksaan berikutnya.
  let hasil: Awaited<ReturnType<typeof parseIkiExcel>> | null = null
  try {
    hasil = await parseIkiExcel(Buffer.from(bytes))
  } catch (e) {
    cek('Berkasnya terbaca tanpa ditolak', false, e instanceof Error ? e.message : String(e))
    continue
  }

  cek('Berkasnya terbaca tanpa ditolak', hasil.groups.length > 0,
    hasil.groups.length ? '' : (hasil.warnings.at(-1) ?? 'tidak ada baris'))
  if (!hasil.groups.length) continue

  const r = hasil.groups[0]?.rhkList?.[0]

  // Ini yang dulu jatuh di DIREKTUR: kolom target_tw tidak pernah ketemu.
  const kolomTw = hasil.columns.find(c => c.field === 'target_tw')
  cek('Kolom target_tw terdeteksi', !!kolomTw && kolomTw.col !== null,
    `sumber: ${kolomTw?.source ?? '-'}`)

  cek('Variannya dikenali kembali', hasil.varian === varian, hasil.varian)
  cek('Identitas pegawai kembali utuh',
    hasil.nama === doc.nama && hasil.nip.replace(/\D/g, '') === doc.nip.replace(/\D/g, ''),
    `${hasil.nama} · ${hasil.nip}`)
  cek('RHK-nya kembali', r?.rhk === doc.rhk[0].rhk)
  cek('Indikator kembali', r?.indikator === doc.rhk[0].indikator)
  cek('Target tahunan kembali', r?.target_tahunan === doc.rhk[0].target_tahunan, r?.target_tahunan)

  cek('Empat triwulan lengkap', r?.triwulan.length === 4, String(r?.triwulan.length))
  const tw = (n: number) => r?.triwulan.find(t => t.triwulan === n)
  cek('Target tiap triwulan kembali apa adanya',
    ['3', '6', '9', '12'].every((v, i) => tw(i + 1)?.target_tw === v),
    [1, 2, 3, 4].map(n => tw(n)?.target_tw).join(' · '))
  cek('Rencana aksi tiap triwulan kembali',
    [1, 2, 3, 4].every(n => tw(n)?.target_aksi === '3'))

  // Kolom "cara menghitung" cuma ada di STANDAR — di DIREKTUR ia memang tidak
  // boleh terdeteksi, dan dulu justru itulah yang menelan kolom target.
  const cara = hasil.columns.find(c => c.field === 'romawi')
  cek('Kolom romawi triwulan terdeteksi', !!cara && cara.col !== null)
}

console.log(`\n${lulus} pemeriksaan LULUS · ${gagal} GAGAL`)
process.exit(gagal > 0 ? 1 : 0)
