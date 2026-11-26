#!/usr/bin/env npx tsx
// scripts/test-bba-tahap.mts — Tahap 1 revamp alur BBA: `tahapRencana`, tab & pita alur, keputusan anggaran per item.
// Konsep: docs/konsep/bba/CONCEPT-bba-revamp-alur.md §2, §3.1, §3.2, §6.
// Jalankan: npx tsx --env-file=.env.local scripts/test-bba-tahap.mts
// Bagian D memakai MySQL sungguhan (kotak pasir 2070, data berawalan "UJIT"), dibersihkan otomatis. Tanpa MySQL
// bagian itu GAGAL, bukan dilewati — jumlah lulus yang turun diam-diam tidak boleh terlihat seperti hijau.
import { readFileSync } from 'node:fs'
import mysql from 'mysql2/promise'
import {
  tahapRencana, kurangPertama, masukTabRencana, hitungTabRencana, ringkasAlur, langkahTahap, TAHAP, TAB_RENCANA,
  type BahanTahap, type Tahap,
} from '../lib/bba/tahap'
import { BBA_STATUSES } from '../lib/bba/status'
import { ANGGARAN, JENIS_RENCANA } from '../lib/bba/rencana'
import { kelengkapanRef } from '../lib/bba/referensi'
import { AnggaranSchema } from '../lib/data/buku-besar-aset-schemas'

let lulus = 0
const gagal: string[] = []
function ok(nama: string, syarat: unknown, ket = '') {
  if (syarat) { lulus++; console.log(`  ok  ${nama}`) }
  else { gagal.push(nama); console.log(`FAIL  ${nama}${ket ? ' — ' + ket : ''}`) }
}
const sumber = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
const tanpaKomentar = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
const coba = async <T,>(f: () => Promise<T>): Promise<T | Error> => { try { return await f() } catch (e) { return e as Error } }

const LENGKAP = kelengkapanRef(3, 3, 0)
const r = (o: Partial<BahanTahap> = {}): BahanTahap => ({
  status: 'DIRENCANAKAN', anggaran: 'BELUM', usulan_keputusan: null, barang_id: 1, jenis_rencana: 'PENAMBAHAN', ref: LENGKAP, belum_dicatat: 0, ...o,
})

console.log('A. tahapRencana — semua kombinasi status × anggaran × kelengkapan × penerimaan × register')
{
  // Pembanding ditulis ulang dari kalimat konsep §2 butir 1, bukan disalin dari fungsinya.
  const harap = (b: BahanTahap): Tahap => {
    if (b.usulan_keputusan === 'DITOLAK') return 'USULAN_DITOLAK'
    if (b.status === 'TIDAK_TEREALISASI') return 'BATAL_DIBELI'
    if (b.status === 'DIPROSES') return 'DIPESAN'
    if (b.status === 'REALISASI_SEBAGIAN') return 'DITERIMA_SEBAGIAN'
    if (b.status === 'REALISASI_PENUH') return b.belum_dicatat === 0 ? 'TERCATAT' : 'DITERIMA_PENUH'
    if (b.anggaran === 'DIDANAI') return 'DIDANAI'
    if (b.anggaran === 'TIDAK_DIDANAI') return 'TIDAK_DIDANAI'
    const lengkap = b.barang_id !== null && b.jenis_rencana !== null && b.ref.n >= 3 && b.ref.tingkat === 'LENGKAP'
    return lengkap ? 'SIAP_DIPUTUSKAN' : 'PERLU_DILENGKAPI'
  }
  const refs = [kelengkapanRef(3, 3, 0), kelengkapanRef(2, 3, 0), kelengkapanRef(0, 0, 0), kelengkapanRef(0, 0, 2), kelengkapanRef(4, 4, 0)]
  let n = 0
  const beda: string[] = []
  const muncul = new Set<Tahap>()
  for (const status of BBA_STATUSES) for (const anggaran of ANGGARAN) for (const usulan_keputusan of [null, 'DISETUJUI', 'DITOLAK'])
    for (const barang_id of [null, 7]) for (const jenis_rencana of [null, ...JENIS_RENCANA]) for (const ref of refs) for (const belum_dicatat of [0, 1, 3]) {
      const b: BahanTahap = { status, anggaran, usulan_keputusan, barang_id, jenis_rencana, ref, belum_dicatat }
      const t = tahapRencana(b); n++; muncul.add(t)
      if (t !== harap(b)) beda.push(JSON.stringify(b) + ' → ' + t)
    }
  ok(`A1 ${n} kombinasi = pembanding dari kalimat konsep`, beda.length === 0, beda.slice(0, 2).join(' | '))
  ok('A2 kesepuluh tahap benar-benar bisa terjadi', TAHAP.every(t => muncul.has(t)), TAHAP.filter(t => !muncul.has(t)).join())
  ok('A3 usulan ditolak menang atas apa pun (catatan sejarah)', tahapRencana(r({ usulan_keputusan: 'DITOLAK', anggaran: 'DIDANAI', status: 'REALISASI_PENUH' })) === 'USULAN_DITOLAK')
  ok('A4 rencana didanai yang belum lengkap tetap Didanai (keputusan sudah diambil)', tahapRencana(r({ anggaran: 'DIDANAI', barang_id: null })) === 'DIDANAI')
  ok('A5 diterima penuh: belum dicatat → Diterima penuh; semua tercatat (atau data pindahan) → Tercatat',
    tahapRencana(r({ status: 'REALISASI_PENUH', anggaran: 'DIDANAI', belum_dicatat: 2 })) === 'DITERIMA_PENUH' && tahapRencana(r({ status: 'REALISASI_PENUH', anggaran: 'DIDANAI' })) === 'TERCATAT')
  ok('A6 diterima sebagian tetap sebagian walau semua yang datang sudah dicatat', tahapRencana(r({ status: 'REALISASI_SEBAGIAN', anggaran: 'DIDANAI', belum_dicatat: 0 })) === 'DITERIMA_SEBAGIAN')
  ok('A7 tautan usulan saja ≠ referensi lengkap', tahapRencana(r({ ref: kelengkapanRef(0, 0, 3) })) === 'PERLU_DILENGKAPI')
}

console.log('\nB. Yang kurang, garis tahap, tab, pita')
ok('B1 yang pertama kurang: barang → jenis → referensi', kurangPertama(r({ barang_id: null, jenis_rencana: null, ref: kelengkapanRef(0, 0, 0) })) === 'BARANG'
  && kurangPertama(r({ jenis_rencana: null, ref: kelengkapanRef(0, 0, 0) })) === 'JENIS' && kurangPertama(r({ ref: kelengkapanRef(1, 1, 0) })) === 'REFERENSI' && kurangPertama(r()) === null)
ok('B2 garis tahap naik monoton di urutan utama; cabang merah/abu', (['PERLU_DILENGKAPI', 'SIAP_DIPUTUSKAN', 'DIDANAI', 'DIPESAN', 'DITERIMA_PENUH', 'TERCATAT'] as Tahap[])
  .map(t => langkahTahap(t).langkah).every((x, i, a) => i === 0 || x > a[i - 1])
  && langkahTahap('TIDAK_DIDANAI').cabang === 'MERAH' && langkahTahap('BATAL_DIBELI').cabang === 'MERAH' && langkahTahap('USULAN_DITOLAK').cabang === 'ABU' && langkahTahap('DIPESAN').cabang === null)
{
  const contoh: BahanTahap[] = [
    r({ barang_id: null }), r({ ref: kelengkapanRef(1, 1, 0) }), r(), r(), r({ anggaran: 'DIDANAI' }), r({ anggaran: 'DIDANAI', status: 'DIPROSES' }),
    r({ anggaran: 'DIDANAI', status: 'REALISASI_SEBAGIAN', belum_dicatat: 1 }), r({ anggaran: 'DIDANAI', status: 'REALISASI_PENUH', belum_dicatat: 2 }),
    r({ anggaran: 'TIDAK_DIDANAI' }), r({ anggaran: 'DIDANAI', status: 'TIDAK_TEREALISASI' }), r({ usulan_keputusan: 'DITOLAK' }),
    r({ usulan_keputusan: 'DITOLAK', status: 'REALISASI_PENUH', belum_dicatat: 9 }),
  ]
  const n = hitungTabRencana(contoh)
  ok('B3 angka tab: Siap = yang lengkap saja; isi tab Siap = semua yang belum diputuskan (yang belum lengkap tampil redup)',
    n.perlu === 2 && n.siap === 2 && contoh.filter(x => masukTabRencana('siap', x)).length === 4 && n.didanai === 5 && n.tidak === 1 && n.ditolak === 2 && n.semua === 12, JSON.stringify(n))
  ok('B4 tab kecuali Semua tidak memuat usulan ditolak; tiap baris tak ditolak masuk tepat satu tab keputusan (siap/didanai/tidak)',
    TAB_RENCANA.filter(t => t !== 'semua' && t !== 'ditolak').every(t => contoh.filter(x => x.usulan_keputusan === 'DITOLAK').every(x => !masukTabRencana(t, x)))
    && contoh.filter(x => x.usulan_keputusan !== 'DITOLAK').every(x => (['siap', 'didanai', 'tidak'] as const).filter(t => masukTabRencana(t, x)).length === 1))
  const p = ringkasAlur(contoh)
  ok('B5 pita: perlu 2 · menunggu 2 · siap dipesan 1 · menunggu barang 2 · belum dicatat 3 unit (usulan ditolak tidak dihitung)',
    p.perluDilengkapi === 2 && p.menungguKeputusan === 2 && p.siapDipesan === 1 && p.menungguBarang === 2 && p.belumDicatat === 3, JSON.stringify(p))
}

console.log('\nC. Skema, route, layar')
ok('C1 keputusan per item ATAU satu untuk semua; tanpa keputusan ditolak', AnggaranSchema.safeParse({ item: [{ id: 1, expected_version: 0, anggaran: 'DIDANAI' }, { id: 2, expected_version: 3, anggaran: 'TIDAK_DIDANAI' }] }).success
  && AnggaranSchema.safeParse({ anggaran: 'BELUM', item: [{ id: 1, expected_version: 0 }] }).success
  && !AnggaranSchema.safeParse({ item: [{ id: 1, expected_version: 0 }] }).success
  && !AnggaranSchema.safeParse({ item: [{ id: 1, expected_version: 0, anggaran: 'YA' }] }).success)
{
  const d = tanpaKomentar(sumber('lib/data/buku-besar-aset.ts'))
  const i = d.indexOf('export async function tandaiAnggaran('), b = d.slice(i, d.indexOf('\nexport ', i + 10))
  ok('C2 tandaiAnggaran: kunci dulu, versi tiap item, keputusan per item (bentuk lama sebagai cadangan), semua-atau-tidak', b.indexOf('FOR UPDATE') < b.indexOf('expected_version')
    && b.includes('(x.anggaran ?? input.anggaran)!') && b.includes('alasanTakBisaUbahAnggaran(r.status, r.anggaran, tujuan.get(r.id)!)') && b.indexOf('throw new BbaAnggaranError') < b.indexOf('UPDATE buku_besar_aset'))
  const rute = sumber('app/api/buku-besar-aset/ringkas-alur/route.ts')
  ok('C3 ringkas-alur: baca saja lewat guard, angka dari ringkasAlur(rencanaSetahun)', rute.includes('const g = await guard();') && rute.includes('ringkasAlur(await rencanaSetahun(p.data.tahun))') && !/export async function (POST|PATCH|DELETE)/.test(rute))
}
{
  const k = tanpaKomentar(sumber('app/(dashboard)/buku-besar-aset/buku-besar-aset-client.tsx'))
  ok('C4 layar: tab & angka dari aturan bersama, tanpa centang & bilah "Tandai didanai" lama', k.includes('hitungTabRencana(rowsSaring)') && k.includes('masukTabRencana(tab, r)')
    && !k.includes('Tandai didanai') && !k.includes('type="checkbox" aria-label={`Pilih'))
  ok('C5 simpan keputusan: satu kiriman per item membawa angka kunci; 409 memuat ulang tanpa membuang pilihan', k.includes('[{ id, expected_version: r.version, anggaran }]')
    && k.includes("body: JSON.stringify({ item })") && /if \(d\.code === 'VERSION_CONFLICT'\) \{[\s\S]{0,300}void load\(\);/.test(k) && !/VERSION_CONFLICT'\) \{[\s\S]{0,300}setPilihan\(new Map\(\)\)/.test(k))
  ok('C6 pilihan yang belum tersimpan bertahan sesudah muat ulang kecuali yang barisnya hilang / sudah sama', k.includes("per.has(id) && per.get(id)!.anggaran !== a"))
  ok('C7 pengingat belum tersimpan + tahun dikunci + pindah tab bertanya', k.includes('useIngatkanBelumTersimpan(jumlahBelum > 0') && k.includes('disabled={jumlahBelum > 0}')
    && /async function gantiTab[\s\S]{0,300}if \(jumlahBelum > 0 && t !== 'siap'\)/.test(k))
  const lembar = tanpaKomentar(sumber('app/(dashboard)/buku-besar-aset/_components/LembarKeputusan.tsx'))
  ok('C8 lembar: yang belum lengkap tanpa sakelar (tombol Lengkapi), borongan hanya yang lengkap', lembar.includes("{kurang\n                    ? (bolehUbah ? <PrimaButton variant=\"warning\"")
    && lembar.includes("const lengkap = k.rows.filter(r => tahapRencana(r) === 'SIAP_DIPUTUSKAN');") && lembar.includes("lengkap.forEach(r => onPilih(r.id, 'DIDANAI'))"))
  const nav = sumber('app/(dashboard)/buku-besar-aset/_components/BbaNav.tsx')
  ok('C9 Menu aplikasi pindah ke lencana profil: dock BBA/Dashboard/IKI/LKJIP tanpa tombol Menu', !nav.includes("label: 'Menu'")
    && ['app/(dashboard)/dashboard/dashboard-client.tsx', 'app/(dashboard)/dashboard/[modul]/detail-client.tsx', 'app/(dashboard)/iki/iki-client.tsx', 'app/(dashboard)/iki/[id]/editor-client.tsx', 'app/(dashboard)/lkjip/lkjip-client.tsx', 'app/(dashboard)/lkjip/[id]/editor-client.tsx']
      .every(p => !sumber(p).includes("label: 'Menu'")) && sumber('components/ui/UserBadge.tsx').includes('Menu aplikasi'))
}

console.log('\nD. MySQL sungguhan (kotak pasir 2070)')
let c: mysql.Connection | null = null
try {
  c = await mysql.createConnection({ host: process.env.MYSQL_HOST, port: Number(process.env.MYSQL_PORT || 3306), user: process.env.MYSQL_USER, password: process.env.MYSQL_PASSWORD, database: process.env.MYSQL_DATABASE })
} catch (e) { ok(`D0 MySQL bisa dihubungi (${(e as { code?: string }).code ?? e})`, false) }
if (c) {
  const k = c
  const bersih = async () => {
    await k.query("DELETE a FROM bba_aset a JOIN bba_penerimaan p ON p.id = a.penerimaan_id JOIN buku_besar_aset b ON b.id = p.rencana_id WHERE b.tahun_anggaran = 2070 AND b.uraian LIKE 'UJIT%'")
    await k.query("DELETE p FROM bba_penerimaan p JOIN buku_besar_aset b ON b.id = p.rencana_id WHERE b.tahun_anggaran = 2070 AND b.uraian LIKE 'UJIT%'")
    await k.query("DELETE FROM buku_besar_aset WHERE tahun_anggaran = 2070 AND uraian LIKE 'UJIT%'")
    await k.query("DELETE FROM bba_barang WHERE nama LIKE 'UJIT %'")
  }
  await bersih()
  const B = await import('../lib/data/buku-besar-aset')
  const P = await import('../lib/data/bba-penerimaan')
  const [u] = await k.query('SELECT id FROM users ORDER BY id LIMIT 1') as [Array<{ id: number }>, unknown]
  let userId = Number(u[0]?.id ?? 0)
  if (!userId) {
    const [ins] = await k.query("INSERT INTO users (username, password_hash, role, status) VALUES ('ujit-pengguna', 'x', 'ADMIN', 'AKTIF')") as [{ insertId: number }, unknown]
    userId = ins.insertId
  }
  const versi = async (id: number) => (await B.getAsetById(id))!.version
  const ref3 = [1, 2, 3].map(i => ({ sumber: 'EKATALOG' as const, nama_penyedia: `PT ${i}`, url: `https://e-katalog.lkpp.go.id/${i}`, harga: 1_000_000 + i, tgl_cek: '2069-12-01' }))
  try {
    const brg = await B.createBarang({ nama: 'UJIT Laptop' }, userId)
    const lengkap = await B.createAset({ tahun_anggaran: 2070, uraian: 'UJIT lengkap', barang_id: brg.id, jenis_rencana: 'PENAMBAHAN', sumber_anggaran: 'BLUD', vol: 2, harga: 1_000_000, referensi: ref3 }, userId)
    const kurang = await B.createAset({ tahun_anggaran: 2070, uraian: 'UJIT kurang', barang_id: brg.id, sumber_anggaran: 'BLUD', vol: 1, harga: 500_000 }, userId)
    const lain = await B.createAset({ tahun_anggaran: 2070, uraian: 'UJIT lain', barang_id: brg.id, jenis_rencana: 'PENGADAAN_BARU', sumber_anggaran: 'APBD', vol: 1, harga: 700_000, referensi: ref3 }, userId)
    const setahun = await B.rencanaSetahun(2070)
    const t = (id: number) => tahapRencana(setahun.find(x => x.id === id)!)
    ok('D1 dari DB: lengkap → Siap diputuskan, tanpa jenis → Perlu dilengkapi', t(lengkap.id) === 'SIAP_DIPUTUSKAN' && t(kurang.id) === 'PERLU_DILENGKAPI')

    const h = await B.tandaiAnggaran({ item: [
      { id: lengkap.id, expected_version: await versi(lengkap.id), anggaran: 'DIDANAI' },
      { id: lain.id, expected_version: await versi(lain.id), anggaran: 'TIDAK_DIDANAI' },
    ] }, userId)
    const a1 = await B.getAsetById(lengkap.id), a2 = await B.getAsetById(lain.id)
    ok('D2 dua keputusan berbeda dalam SATU kiriman, masing-masing tercatat (didanai membawa vol & nilai)', h.ditandai === 2 && h.per.DIDANAI === 1 && h.per.TIDAK_DIDANAI === 1
      && a1?.anggaran === 'DIDANAI' && a1.anggaran_nilai === 2_000_000 && a2?.anggaran === 'TIDAK_DIDANAI' && a2.anggaran_nilai === null)

    const v1 = await versi(lengkap.id), v2 = await versi(lain.id)
    const basi = await coba(() => B.tandaiAnggaran({ item: [
      { id: lengkap.id, expected_version: v1, anggaran: 'BELUM' },
      { id: lain.id, expected_version: v2 - 1, anggaran: 'BELUM' },
    ] }, userId))
    ok('D3 satu angka kunci basi → seluruh kiriman 409, yang lain tidak ikut tertulis', basi instanceof B.BbaVersionConflictError
      && (await B.getAsetById(lengkap.id))?.anggaran === 'DIDANAI' && (await versi(lengkap.id)) === v1)

    await B.tandaiAnggaran({ item: [{ id: lain.id, expected_version: v2, anggaran: 'BELUM' }] }, userId)
    ok('D4 kembalikan ke belum diputuskan → kembali ke tab Siap', masukTabRencana('siap', (await B.rencanaSetahun(2070)).find(x => x.id === lain.id)!))

    await B.ubahStatusProses({ id: lengkap.id, expected_version: await versi(lengkap.id), status: 'DIPROSES', tgl_proses: '2026-01-10' }, userId)
    const tolak = await coba(async () => B.tandaiAnggaran({ item: [{ id: lengkap.id, expected_version: await versi(lengkap.id), anggaran: 'BELUM' }] }, userId))
    ok('D5 rencana yang sudah dipesan tidak bisa dikembalikan ke belum diputuskan', tolak instanceof B.BbaAnggaranError && (await B.getAsetById(lengkap.id))?.anggaran === 'DIDANAI')

    await P.catatPenerimaan({ rencana_id: lengkap.id, expected_version: await versi(lengkap.id), tgl: '2026-02-01', vol: 2, harga_satuan: 1_000_000 }, userId)
    const sesudahTerima = (await B.rencanaSetahun(2070)).find(x => x.id === lengkap.id)!
    ok('D6 diterima penuh 2 unit, belum ditempatkan → belum_dicatat 2, tahap Diterima penuh, pita 2 unit',
      sesudahTerima.belum_dicatat === 2 && tahapRencana(sesudahTerima) === 'DITERIMA_PENUH' && ringkasAlur(await B.rencanaSetahun(2070)).belumDicatat === 2, String(sesudahTerima.belum_dicatat))
    const [pen] = await k.query('SELECT id FROM bba_penerimaan WHERE rencana_id = ?', [lengkap.id]) as [Array<{ id: number }>, unknown]
    await P.tempatkan({ penerimaan_id: pen[0].id, jumlah: 2, golongan: 'B', nama_resmi: 'UJIT LAPTOP', kondisi: 'B' }, userId)
    const tercatat = (await B.rencanaSetahun(2070)).find(x => x.id === lengkap.id)!
    ok('D7 semua unit ditempatkan → Tercatat di Buku Aset', tercatat.belum_dicatat === 0 && tahapRencana(tercatat) === 'TERCATAT')

    // Realisasi lama yang dipindah migrasi (`pindahan`): barangnya sudah di KIB provinsi, tidak menunggu dicatat.
    const lama = await B.createAset({ tahun_anggaran: 2070, uraian: 'UJIT pindahan', barang_id: brg.id, jenis_rencana: 'PENAMBAHAN', sumber_anggaran: 'BLUD', vol: 3, harga: 100_000 }, userId)
    await k.query("UPDATE buku_besar_aset SET anggaran = 'DIDANAI', status = 'REALISASI_PENUH', vol_realisasi = 3, nilai_realisasi = 300000 WHERE id = ?", [lama.id])
    await k.query("INSERT INTO bba_penerimaan (rencana_id, tgl, vol, harga_satuan, nilai, pindahan) VALUES (?, '2026-01-05', 3, 100000, 300000, 1)", [lama.id])
    const rl = (await B.rencanaSetahun(2070)).find(x => x.id === lama.id)!
    ok('D7b penerimaan pindahan tidak dihitung belum dicatat → Tercatat', rl.belum_dicatat === 0 && tahapRencana(rl) === 'TERCATAT', String(rl.belum_dicatat))
  } finally {
    await bersih()
    const [sisa] = await k.query("SELECT (SELECT COUNT(*) FROM buku_besar_aset WHERE tahun_anggaran = 2070 AND uraian LIKE 'UJIT%') AS r, (SELECT COUNT(*) FROM bba_barang WHERE nama LIKE 'UJIT %') AS b") as [Array<{ r: number; b: number }>, unknown]
    ok('D8 kotak pasir bersih', Number(sisa[0].r) + Number(sisa[0].b) === 0, JSON.stringify(sisa[0]))
    await k.end()
  }
}

console.log(`\n${lulus} lulus, ${gagal.length} gagal`)
if (gagal.length) { console.log(gagal.map(g => `  - ${g}`).join('\n')); process.exit(1) }
process.exit(0)
