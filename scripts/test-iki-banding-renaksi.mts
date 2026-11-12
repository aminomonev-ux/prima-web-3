#!/usr/bin/env npx tsx
// scripts/test-iki-banding-renaksi.mts — kartu RHK IKI yang diambil dari Rencana Aksi diberi tahu
// saat Renaksi berubah. Konsep: docs/CONCEPT-renaksi-terhubung.md §6 (Tahap E).
// Jalankan: npx tsx scripts/test-iki-banding-renaksi.mts (murni + pemeriksaan sambungan, tanpa DB).
import { readFileSync } from 'node:fs'
import { bandingKartuRenaksi, terapkanBandingKartu, kunciKartu, kalimatSpandukKartu, jumlahPerubahanKartu } from '../app/(dashboard)/iki/_lib/banding-renaksi'
import { isianRenaksi } from '../app/(dashboard)/iki/_lib/isi-renaksi'
import { emptyRhk, type IkiRhk, type RenaksiImportRow } from '../app/(dashboard)/iki/_lib/types'

let lulus = 0
const gagal: string[] = []
function ok(nama: string, syarat: unknown, ket = '') {
  if (syarat) { lulus++; console.log(`  ok  ${nama}`) }
  else { gagal.push(nama); console.log(`FAIL  ${nama}${ket ? ' — ' + ket : ''}`) }
}
const sumber = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n')

const ra = (id: number, isi: Partial<RenaksiImportRow> = {}): RenaksiImportRow => ({
  renaksi_id: id, induk_indikator_id: null, level: 'sub-kegiatan', sasaran_induk: '', rhk: `RHK ${id}`, nama: `Sub ${id}`, parent: 'Keg',
  indikator: `Indikator ${id}`, jenis: 'Akumulatif', target_tahunan: '12 Dokumen', target_tw: ['3 Dokumen', '3 Dokumen', '3 Dokumen', '3 Dokumen'], ...isi,
})
const kartu = (src: RenaksiImportRow | null, isi: Partial<IkiRhk> = {}): IkiRhk => {
  const r = emptyRhk(1)
  const dasar = src ? { ...r, ...isianRenaksi(src, r.triwulan) } : r
  return { ...dasar, triwulan: dasar.triwulan.map((t, i) => ({ ...t, uraian: `uraian ${i + 1}`, target_aksi: '1' })), ...isi }
}

console.log('A. Pembanding kartu')
const R1 = ra(1), R2 = ra(2)
const rhk = [kartu(R1), kartu(R2), kartu(null, { rhk: 'Ketik sendiri', indikator: 'x' }), kartu(ra(9))]
ok('A1 kartu sama dengan Renaksi → tidak ada perubahan; kartu manual diabaikan',
  jumlahPerubahanKartu(bandingKartuRenaksi(rhk.slice(0, 3), [R1, R2])) === 0)
const kini = [ra(1, { target_tahunan: '15 Dokumen', target_tw: ['3 Dokumen', '4 Dokumen', '4 Dokumen', '4 Dokumen'] }), ra(2, { rhk: 'RHK 2 baru ***', jenis: 'Progres Positif' })]
const h = bandingKartuRenaksi(rhk, kini)
ok('A2 kolom yang berubah disebut dengan isi lama → baru',
  h.berubah.length === 2 && h.berubah[0].kolom.map(k => k[0]).join() === 'Target tahunan,Target TW II,Target TW III,Target TW IV'
  && h.berubah[0].kolom[0][1] === '12 Dokumen' && h.berubah[0].kolom[0][2] === '15 Dokumen', JSON.stringify(h.berubah.map(b => b.kolom)))
ok('A3 RHK & cara hitung berubah dikenali (penanda bintang dari data Renaksi diabaikan saat membandingkan)',
  h.berubah[1].kolom.map(k => k[0]).join() === 'RHK,Cara hitung', JSON.stringify(h.berubah[1].kolom))
ok('A4 kartu yang baris Renaksi-nya hilang → "tidak ada lagi"', h.hilang.join() === '3')
ok('A5 beda spasi / huruf besar / penanda bintang & "(1)" tidak dihitung berubah',
  jumlahPerubahanKartu(bandingKartuRenaksi([kartu(R1, { rhk: 'rhk 1 ***', indikator: '(1)  Indikator 1 ', target_tahunan: ' 12  Dokumen' })], [R1])) === 0)

console.log('B. Menerapkan ke form')
const pilih = new Set([kunciKartu.samakan(0), kunciKartu.lepas(3)])
const hasil = terapkanBandingKartu(rhk, h, pilih)
ok('B1 disamakan: target ikut Renaksi, uraian & target aksi kartu TETAP',
  hasil[0].target_tahunan === '15 Dokumen' && hasil[0].triwulan[1].target_tw === '4 Dokumen'
  && hasil[0].triwulan.every((t, i) => t.uraian === `uraian ${i + 1}` && t.target_aksi === '1') && hasil[0].renaksi_id === 1)
ok('B2 yang tidak dipilih tidak berubah (identitas sama)', hasil[1] === rhk[1] && hasil[2] === rhk[2])
ok('B3 lepas tautan: renaksi_id null, isi tetap', hasil[3].renaksi_id === null && hasil[3].rhk === rhk[3].rhk)
ok('B4 sesudah diterapkan, kartu itu tidak lagi disebut', !bandingKartuRenaksi(hasil, kini).berubah.some(b => b.index === 0) && bandingKartuRenaksi(hasil, kini).hilang.length === 0)
const lepasSaja = terapkanBandingKartu(rhk, h, new Set([kunciKartu.lepas(1)]))
ok('B5 "tidak ingin mengikuti": kartu berbeda dilepas tanpa disamakan', lepasSaja[1].renaksi_id === null && lepasSaja[1].rhk === 'RHK 2')
ok('B6 kalimat spanduk', kalimatSpandukKartu(h, 2026) === 'Rencana Aksi 2026 berubah: 2 kartu isinya berbeda, 1 kartu tidak ada lagi di Rencana Aksi.')

console.log('C. Sambungan kode')
const ED = sumber('app/(dashboard)/iki/[id]/editor-client.tsx')
ok('C1 hanya dokumen DRAFT non-CUSTOM yang dipantau', ED.includes('const pantauRenaksi = !readOnly && !isCustom;'))
ok('C2 bacaan lewat import-renaksi mode pantau (tanpa audit per buka)', ED.includes('/api/iki/import-renaksi?tahun=${doc.tahun}&pantau=1'))
const terap = ED.slice(ED.indexOf('function terapkanPerbarui'), ED.indexOf('const judulKartu'))
ok('C3 berhenti di form: tanpa fetch, menandai belum tersimpan', !terap.includes('fetch') && terap.includes('setDirty(true)') && terap.includes('terapkanBandingKartu(d.rhk, bandingRa, pilih)'))
ok('C4 lencana di kartu bertaut', ED.includes('{r.renaksi_id != null && <LencanaRenaksi tahun={String(doc.tahun)} />}'))
const RT = sumber('app/api/iki/import-renaksi/route.ts')
ok('C5 mode pantau pulang sebelum audit; impor biasa tetap diaudit',
  RT.indexOf('if (pantau) return NextResponse.json') > 0 && RT.indexOf('if (pantau) return NextResponse.json') < RT.indexOf("eventType: 'IKI_IMPORT_RENAKSI'"))
const EXP = ['lib/iki/export-pdf.ts', 'lib/iki/export-excel.ts', 'lib/iki/layout.ts'].map(sumber).join('\n')
ok('C6 PDF/Excel IKI tidak menyentuh lencana', !/LencanaRenaksi|renaksi_id/.test(EXP))

console.log(`\n${lulus} lulus, ${gagal.length} gagal`)
if (gagal.length) { console.log(gagal.map(g => `  - ${g}`).join('\n')); process.exit(1) }
process.exit(0)
