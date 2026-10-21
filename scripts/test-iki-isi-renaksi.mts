// scripts/test-iki-isi-renaksi.mts — IKI STANDAR/DIREKTUR: tombol "Isi dari Renaksi" di kepala grup.
//
//   npx tsx scripts/test-iki-isi-renaksi.mts
//
// Grup yang RHK atasannya diambil dari IKI Atasan diisi RHK, indikator, cara hitung, target tahunan & TW dari
// Renaksi. A isian satu baris Renaksi. B kartu kosong. C penempatan di grup (kartu kosong dulu, sisanya kartu
// baru di grup yang sama, kartu berisi tidak disentuh). D tanda "sudah dipakai". E sambungan layar.

import { readFileSync } from 'node:fs'
import { isianRenaksi, kartuKosong, isiGrupDariRenaksi, renaksiDipakai } from '../app/(dashboard)/iki/_lib/isi-renaksi'
import { emptyRhk, emptyTriwulan, type IkiRhk, type RenaksiImportRow } from '../app/(dashboard)/iki/_lib/types'

let lulus = 0
const gagal: string[] = []
function ok(nama: string, syarat: unknown, ket = '') {
  if (syarat) { lulus++; console.log(`  ok  ${nama}`) }
  else { gagal.push(nama); console.log(`FAIL  ${nama}${ket ? ' — ' + ket : ''}`) }
}
const sama = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
const tanpaKomentar = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const ra = (id: number, o: Partial<RenaksiImportRow> = {}): RenaksiImportRow => ({
  renaksi_id: id, level: 'kegiatan', sasaran_induk: '', rhk: `RHK Renaksi ${id}`, nama: `Kegiatan ${id}`, parent: 'Program',
  indikator: `Indikator ${id}`, jenis: 'Progres Positif', target_tahunan: `${id} Dokumen`,
  target_tw: [`${id}a`, `${id}b`, `${id}c`, `${id}d`], ...o,
})
const kartu = (noUrut: number, o: Partial<IkiRhk> = {}): IkiRhk => ({ ...emptyRhk(noUrut), ...o })

// ── A isian satu baris Renaksi ─────────────────────────────────────────────────
console.log('\nA. Isian dari satu baris Renaksi')
{
  const tw = emptyTriwulan().map((t, i) => ({ ...t, uraian: i === 1 ? 'Uraian diketik' : null, target_aksi: i === 1 ? '1 Dok' : '0' }))
  const x = isianRenaksi(ra(5, { jenis: 'Progres Negatif' }), tw)
  ok('A1 RHK, indikator, target tahunan, renaksi_id dari Renaksi',
    x.rhk === 'RHK Renaksi 5' && x.indikator === 'Indikator 5' && x.target_tahunan === '5 Dokumen' && x.renaksi_id === 5)
  ok('A2 cara hitung ikut jenis indikator Renaksi', x.aspek_b === 'Progres Negatif')
  ok('A3 target TW I–IV per urutan', sama(x.triwulan.map(t => t.target_tw), ['5a', '5b', '5c', '5d']))
  ok('A4 uraian & target aksi kartu dipertahankan', x.triwulan[1].uraian === 'Uraian diketik' && x.triwulan[1].target_aksi === '1 Dok')
  ok('A5 tidak membawa RHK atasan (milik grup)', !('rhk_intervensi' in x) && !('atasan_rhk_id' in x))
  ok('A6 nomor triwulan tetap 1–4', sama(x.triwulan.map(t => t.triwulan), [1, 2, 3, 4]))
}

// ── B kartu kosong ─────────────────────────────────────────────────────────────
console.log('\nB. Kartu kosong')
{
  ok('B1 kartu baru = kosong', kartuKosong(kartu(1)))
  ok('B2 RHK diketik = berisi', !kartuKosong(kartu(1, { rhk: 'x' })))
  ok('B3 indikator diketik = berisi', !kartuKosong(kartu(1, { indikator: 'x' })))
  ok('B4 target tahunan diketik = berisi', !kartuKosong(kartu(1, { target_tahunan: '1 Dok' })))
  ok('B5 target TW diketik = berisi', !kartuKosong(kartu(1, { triwulan: emptyTriwulan().map((t, i) => (i === 3 ? { ...t, target_tw: '1' } : t)) })))
  ok('B6 target TW "0" / kosong / spasi = kosong',
    kartuKosong(kartu(1, { triwulan: emptyTriwulan().map((t, i) => ({ ...t, target_tw: ['0', '', ' ', ' 0 '][i] })) })))
  ok('B7 isian lain (RHK atasan, aspek, formulasi, ekspektasi, rencana aksi) tidak menentukan',
    kartuKosong(kartu(1, {
      rhk_intervensi: 'Atasan', atasan_rhk_id: 3, aspek_c: 'Penunjang', formulasi: 'f', ekspektasi: 'e',
      triwulan: emptyTriwulan().map(t => ({ ...t, uraian: 'u', target_aksi: '1' })),
    })))
  ok('B8 RHK berisi spasi saja = kosong', kartuKosong(kartu(1, { rhk: '  ', indikator: '\n' })))
}

// ── C penempatan di grup ───────────────────────────────────────────────────────
console.log('\nC. Penempatan di grup')
{
  const g1 = kartu(1, { rhk: 'Grup 1', indikator: 'i1' })
  const kosong2 = kartu(2, { rhk_intervensi: 'RHK atasan dua', atasan_rhk_id: 7, aspek_b: 'Akumulatif', formulasi: 'Formulasi diketik' })
  const isi2 = kartu(2, { rhk_intervensi: 'RHK atasan dua', atasan_rhk_id: 8, rhk: 'Sudah diketik', indikator: 'Ind' })
  const g3 = kartu(3, { rhk: 'Grup 3' })
  const semua = [g1, kosong2, isi2, g3]
  const salinan = JSON.stringify(semua)
  const h = isiGrupDariRenaksi(semua, 2, [ra(10), ra(11, { jenis: 'Akumulatif' }), ra(12)])

  ok('C1 hitungan: 1 diisi, 2 baru, 1 dilewati', h.diisi === 1 && h.baru === 2 && h.dilewati === 1, JSON.stringify({ d: h.diisi, b: h.baru, l: h.dilewati }))
  ok('C2 kartu kosong terisi pilihan PERTAMA', h.rhk[1].rhk === 'RHK Renaksi 10' && h.rhk[1].renaksi_id === 10 && h.rhk[1].indikator === 'Indikator 10')
  ok('C3 RHK atasan & tautan IKI Atasan kartu terisi tetap', h.rhk[1].rhk_intervensi === 'RHK atasan dua' && h.rhk[1].atasan_rhk_id === 7)
  ok('C4 cara hitung kartu terisi ikut Renaksi (bukan atasan)', h.rhk[1].aspek_b === 'Progres Positif')
  ok('C5 isian lain kartu terisi (formulasi) dipertahankan', h.rhk[1].formulasi === 'Formulasi diketik')
  ok('C6 kartu berisi tidak disentuh', h.rhk[2] === isi2)
  ok('C7 sisa pilihan jadi kartu baru TEPAT sesudah kartu terakhir grup, sebelum grup berikutnya',
    sama(h.rhk.map(r => [r.no_urut, r.renaksi_id]), [[1, null], [2, 10], [2, null], [2, 11], [2, 12], [3, null]]))
  ok('C8 kartu baru membawa RHK atasan grup, tanpa tautan IKI Atasan (seperti tombol + RHK)',
    h.rhk[3].rhk_intervensi === 'RHK atasan dua' && h.rhk[3].atasan_rhk_id === null && h.rhk[4].rhk_intervensi === 'RHK atasan dua')
  ok('C9 kartu baru: cara hitung & target TW dari Renaksi-nya sendiri',
    h.rhk[3].aspek_b === 'Akumulatif' && sama(h.rhk[3].triwulan.map(t => t.target_tw), ['11a', '11b', '11c', '11d']))
  ok('C10 grup lain tidak disentuh (objek yang sama)', h.rhk[0] === g1 && h.rhk[5] === g3)
  ok('C11 masukan tidak diubah', JSON.stringify(semua) === salinan)

  const dua = [kartu(4), kartu(4, { rhk: 'isi' }), kartu(4)]
  const h2 = isiGrupDariRenaksi(dua, 4, [ra(1), ra(2)])
  ok('C12 beberapa kartu kosong diisi menurut urutan kartu, yang berisi dilewati',
    sama(h2.rhk.map(r => r.renaksi_id), [1, null, 2]) && h2.diisi === 2 && h2.baru === 0 && h2.dilewati === 1)
  const h3 = isiGrupDariRenaksi([kartu(4), kartu(4)], 4, [ra(9)])
  ok('C13 pilihan lebih sedikit dari kartu kosong: sisa kartu tetap kosong', h3.rhk[0].renaksi_id === 9 && kartuKosong(h3.rhk[1]) && h3.rhk.length === 2)
  const h4 = isiGrupDariRenaksi([kartu(5, { rhk: 'a' })], 5, [ra(3)])
  ok('C14 grup tanpa kartu kosong: semua pilihan jadi kartu baru', h4.rhk.length === 2 && h4.rhk[0].rhk === 'a' && h4.rhk[1].renaksi_id === 3 && h4.baru === 1)
  const twSaja = kartu(6, { triwulan: emptyTriwulan().map((t, i) => (i === 0 ? { ...t, target_tw: '5' } : t)) })
  const h5 = isiGrupDariRenaksi([twSaja], 6, [ra(4)])
  ok('C15 kartu yang baru berisi target TW tetap dilewati', h5.rhk[0] === twSaja && h5.dilewati === 1 && h5.baru === 1)
  const h6 = isiGrupDariRenaksi([kartu(7), kartu(8)], 8, [ra(6), ra(7)])
  ok('C16 grup terakhir: kartu baru di ujung daftar', sama(h6.rhk.map(r => [r.no_urut, r.renaksi_id]), [[7, null], [8, 6], [8, 7]]))
}

// ── D tanda "sudah dipakai" ────────────────────────────────────────────────────
console.log('\nD. Tanda sudah dipakai')
{
  const p = renaksiDipakai([kartu(1, { renaksi_id: 5 }), kartu(2), kartu(3, { renaksi_id: 5 }), kartu(3, { renaksi_id: 9 })])
  ok('D1 renaksi_id → grup PERTAMA yang memakainya', p.get(5) === 1 && p.get(9) === 3 && p.size === 2)
}

// ── E sambungan layar ──────────────────────────────────────────────────────────
console.log('\nE. Sambungan layar')
{
  const ed = tanpaKomentar(readFileSync(new URL('../app/(dashboard)/iki/[id]/editor-client.tsx', import.meta.url), 'utf8'))
  const kepala = ed.slice(ed.indexOf('className="iki-group-head"'), ed.indexOf('{items.map(({ rhk: r, index }, ri)'))
  ok('E1 tombol "Isi dari Renaksi" di kepala grup, membuka grup itu', /onClick=\{\(\) => setIsiGrupNo\(noUrut\)\}[\s\S]*?Isi dari Renaksi/.test(kepala))
  ok('E2 tombol + RHK tetap di kepala grup', kepala.includes('onClick={() => addRhkToGroup(noUrut)}'))
  const isi = ed.slice(ed.indexOf('function isiGrupRenaksi('), ed.indexOf('function addRhkToGroup('))
  ok('E3 pengisian lewat functional updater dari state terbaru', isi.includes('setDoc(d => ({ ...d, rhk: isiGrupDariRenaksi(d.rhk, noUrut, pilihan).rhk }))'))
  ok('E4 pengisian menandai belum tersimpan (Simpan halaman yang menulis — L78)', isi.includes('setDirty(true)') && !/fetch\(/.test(isi))
  ok('E5 jendela mode isi grup hanya untuk STANDAR/DIREKTUR', /\{isiGrupNo !== null && !readOnly && !isCustom && \(/.test(ed))
  ok('E6 mode isi grup meneruskan ke onIsi, bukan membuat grup baru',
    /if \(isiGrup\) \{[\s\S]*?isiGrup\.onIsi\(rows\);\s*return;/.test(ed) && ed.includes('onIsi: rows => isiGrupRenaksi(isiGrupNo, rows)'))
  ok('E7 tab "Dari Rencana Aksi" memakai pemeta yang SAMA (isianRenaksi)',
    ed.includes('groups.push([{ rhk_intervensi: r.sasaran_induk || r.parent || null, ...isianRenaksi(r, emptyTriwulan()) }])'))
  ok('E8 tidak ada pemeta Renaksi kedua di layar', !/target_tw: r\.target_tw\[i\]/.test(ed) && !/aspek_b: r\.jenis/.test(ed))
  ok('E9 mode isi grup menyembunyikan tab IKI Atasan', /\{isiGrup \? \([\s\S]*?\) : \(\s*<div className="iki-tabs">/.test(ed))
  ok('E10 tanda "sudah dipakai" di baris Renaksi', ed.includes('{dipakai.has(r.renaksi_id) && <div className="iki-src">↳ sudah dipakai di grup {dipakai.get(r.renaksi_id)}</div>}'))
  ok('E11 kedua jendela menerima peta dipakai dari dokumen', (ed.match(/dipakai=\{renaksiDipakai\(doc\.rhk\)\}/g) ?? []).length === 2)
}

console.log(`\n${lulus} lulus, ${gagal.length} gagal`)
if (gagal.length) { console.log(gagal.map(g => `  - ${g}`).join('\n')); process.exit(1) }
process.exit(0)
