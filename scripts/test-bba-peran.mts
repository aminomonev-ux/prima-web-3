#!/usr/bin/env npx tsx
// scripts/test-bba-peran.mts — Tahap A Buku Aset: izin lima bagian + pengaman riwayat.
// Konsep: docs/CONCEPT-bba-buku-aset.md §3.1, §10 butir 7, §16, §17 Tahap A.
// Jalankan: npx tsx --env-file=.env.local scripts/test-bba-peran.mts
// Bagian D & E memakai MySQL sungguhan, kotak pasir tahun 2084, bersih otomatis.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import mysql from 'mysql2/promise'
import { izinMenu, bolehEdit, MENU_BBA, type MenuBba } from '../lib/bba/peran'
import { referensiBeku, alasanTakBisaHapus, BBA_STATUSES } from '../lib/bba/status'
import { MENU_APPS, izinMenuRegistry, keyMenuBba } from '../lib/registry/menu-apps'
import { bolehMasukModul, modul } from '../lib/registry/apps'

let lulus = 0
const gagal: string[] = []
function ok(nama: string, syarat: unknown, ket = '') {
  if (syarat) { lulus++; console.log(`  ok  ${nama}`) }
  else { gagal.push(nama); console.log(`FAIL  ${nama}${ket ? ' — ' + ket : ''}`) }
}
const sumber = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
const coba = async <T,>(f: () => Promise<T>): Promise<T | Error> => { try { return await f() } catch (e) { return e as Error } }
const peta = (role: string, penimpa: Partial<Record<MenuBba, 'EDIT' | 'LIHAT' | 'TIDAK'>> = {}) =>
  MENU_BBA.map(m => `${m}=${izinMenu(role, m, penimpa[m] ?? null)}`).join(' ')

console.log('A. Tabel izin lib/bba/peran.ts (§3.1)')
ok('A1 SUPER_ADMIN & ADMIN: semua bagian ubah, Cetak lihat (tanpa jalur tulis)',
  peta('SUPER_ADMIN') === 'aset=EDIT rencana=EDIT pengadaan=EDIT master=EDIT cetak=LIHAT' && peta('ADMIN') === peta('SUPER_ADMIN'), peta('ADMIN'))
ok('A2 RUMAH TANGGA (Umum Aset): Buku Aset & Master ubah, sisanya lihat',
  peta('RUMAH TANGGA') === 'aset=EDIT rencana=LIHAT pengadaan=LIHAT master=EDIT cetak=LIHAT', peta('RUMAH TANGGA'))
ok('A3 PROGRAM (Perencanaan): Rencana ubah, sisanya lihat',
  peta('PROGRAM') === 'aset=LIHAT rencana=EDIT pengadaan=LIHAT master=LIHAT cetak=LIHAT', peta('PROGRAM'))
ok('A4 peran ber-grant di luar tabel (mis. KEUANGAN): semua lihat — grant = boleh masuk, bukan boleh ubah',
  MENU_BBA.every(m => izinMenu('KEUANGAN', m) === 'LIHAT'))
ok('A5 Pengadaan per orang: KEUANGAN + perkecualian Pengadaan=EDIT → hanya Pengadaan yang bisa diubah',
  peta('KEUANGAN', { pengadaan: 'EDIT' }) === 'aset=LIHAT rencana=LIHAT pengadaan=EDIT master=LIHAT cetak=LIHAT')
ok('A6 Cetak tidak bisa dijadikan EDIT lewat Admin Panel', izinMenu('SUPER_ADMIN', 'cetak', 'EDIT') === 'LIHAT' && !bolehEdit('ADMIN', 'cetak', 'EDIT'))
ok('A7 Rencana (halaman depan) tidak bisa ditutup — TIDAK jadi LIHAT; bagian lain bisa ditutup',
  izinMenu('PROGRAM', 'rencana', 'TIDAK') === 'LIHAT' && izinMenu('PROGRAM', 'aset', 'TIDAK') === 'TIDAK')
ok('A8 perkecualian menang atas bawaan peran (RT dicabut ubah Master)', izinMenu('RUMAH TANGGA', 'master', 'LIHAT') === 'LIHAT')

console.log('\nB. Registry & pintu modul')
const app = MENU_APPS.find(a => a.key === 'buku_besar_aset')
ok('B1 BBA terdaftar di matriks Admin Panel dengan lima bagian berawalan key app_access',
  !!app && app.menus.length === 5 && app.menus.every(m => m.key.startsWith('buku_besar_aset.')) && app.menus.find(m => m.key === keyMenuBba('cetak'))?.bacaSaja === true)
ok('B2 izinMenuRegistry = izinMenu modulnya (Admin Panel & pagar tidak berbeda pendapat)',
  ['SUPER_ADMIN', 'RUMAH TANGGA', 'PROGRAM', 'KEUANGAN'].every(r => MENU_BBA.every(m => izinMenuRegistry('buku_besar_aset', keyMenuBba(m), r, null) === izinMenu(r, m))))
ok('B3 RUMAH TANGGA & PROGRAM masuk tanpa grant; peran lain tetap butuh grant',
  bolehMasukModul('buku_besar_aset', 'RUMAH TANGGA', null) && bolehMasukModul('buku_besar_aset', 'PROGRAM', [])
  && !bolehMasukModul('buku_besar_aset', 'KEUANGAN', null) && bolehMasukModul('buku_besar_aset', 'KEUANGAN', ['buku_besar_aset']))
ok('B4 registry modul: punyaMenu = true', modul('buku_besar_aset')?.punyaMenu === true)

console.log('\nC. Aturan pengaman riwayat (lib/bba/status.ts) + pagar di route')
ok('C1 referensi beku sejak status bukan Direncanakan', BBA_STATUSES.every(s => referensiBeku(s) === (s !== 'DIRENCANAKAN')))
ok('C2 hapus: hanya Direncanakan tanpa bukti', alasanTakBisaHapus('DIRENCANAKAN', 0) === null && !!alasanTakBisaHapus('DIRENCANAKAN', 1)
  && BBA_STATUSES.filter(s => s !== 'DIRENCANAKAN').every(s => !!alasanTakBisaHapus(s, 0)))

// Setiap handler tulis di app/api/buku-besar-aset WAJIB memanggil tolakKecualiEdit sesudah guard —
// dipindai dari folder, jadi route baru yang lupa ikut tertangkap.
const HARAP: Record<string, string> = {
  'route.ts': "'rencana'", 'realisasi/route.ts': "'pengadaan'", 'bukti/route.ts': "'rencana', 'pengadaan'",
  'barang/route.ts': "'master'", 'barang/tautkan/route.ts': "'rencana'", 'barang/gabung/route.ts': "'master'",
  'lokasi/route.ts': "'master'", 'kategori/route.ts': "'master'",
  'aset/route.ts': "'aset'", 'aset/impor/route.ts': "'aset'", 'pengaturan/route.ts': "'master'",
  'aset/kondisi/route.ts': "'aset'", 'aset/pindah/route.ts': "'aset'", 'aset/barang/route.ts': "'aset'",
  'anggaran/route.ts': "'rencana'", 'salin-tahun-lalu/route.ts': "'rencana'",
}
const akarApi = path.join(process.cwd(), 'app/api/buku-besar-aset')
const semuaRoute: string[] = []
const jelajah = (d: string) => { for (const n of readdirSync(d)) { const p = path.join(d, n); if (statSync(p).isDirectory()) jelajah(p); else if (n === 'route.ts') semuaRoute.push(path.relative(akarApi, p).replace(/\\/g, '/')) } }
jelajah(akarApi)
const tanpaPagar: string[] = []
for (const r of semuaRoute) {
  if (r === 'import-usulan/route.ts') continue
  const isi = readFileSync(path.join(akarApi, r), 'utf8')
  const handler = [...isi.matchAll(/export async function (POST|PATCH|PUT|DELETE)\([^)]*\) \{([\s\S]*?)\n\}/g)]
  for (const [, metode, badan] of handler) {
    const iGuard = badan.indexOf('if (!g.ok) return g.res;')
    const pagar = `tolakKecualiEdit(g.session, ${HARAP[r] ?? '?'})`
    const iPagar = badan.indexOf(pagar)
    const iBaca = Math.min(...['req.json()', 'searchParams', 'safeParse'].map(t => { const i = badan.indexOf(t); return i < 0 ? Infinity : i }))
    if (!(iGuard >= 0 && iPagar > iGuard && iPagar < iBaca)) tanpaPagar.push(`${r} ${metode}`)
  }
}
ok(`C3 semua handler tulis (${semuaRoute.length} route) memasang pagar bagian yang benar, sesudah guard & sebelum membaca isian`, tanpaPagar.length === 0 && semuaRoute.length >= 10, tanpaPagar.join(', '))
const imp = sumber('app/api/buku-besar-aset/import-usulan/route.ts')
ok('C4 Tarik dari Usulan = izin EDIT Rencana (role PROGRAM bisa), tanpa daftar peran admin',
  imp.includes("tolakKecualiEdit(g.session, 'rencana')") && !imp.includes('BBA_IMPORT_ALLOWED_ROLES')
  && (imp.match(/await guardImport\(\)/g) ?? []).length === 2)
const klien = sumber('app/(dashboard)/buku-besar-aset/buku-besar-aset-client.tsx')
ok('C5 layar Rencana: tombol ikut izin — tidak ada lagi pemeriksaan role langsung',
  !klien.includes("role === 'ADMIN'") && klien.includes('{!isRejected && bolehPengadaan && <span data-rima="bba.row-realisasi">')
  && klien.includes('alasanTakBisaHapus(r.status, r.jumlah_bukti)') && klien.includes('bolehUbah={bolehRencana} bolehBukti={bolehBukti}'))
const modal = sumber('app/(dashboard)/buku-besar-aset/_components/ModalItem.tsx')
ok('C6 modal item: isian mati tanpa izin, referensi mati sejak beku, bukti ikut izin bukti',
  modal.includes('<fieldset disabled={!bolehUbah} style={FIELDSET_POLOS}>') && modal.includes('<fieldset disabled={!bolehUbah || refBeku} style={FIELDSET_POLOS}>')
  && modal.includes('bolehUbah={bolehBukti}') && modal.includes('const refBeku = !!item && referensiBeku(item.status);'))
const izinLayar = sumber('app/(dashboard)/buku-besar-aset/_izin.ts')
ok('C7 halaman: izin dihitung dua lapis dari server; bagian tertutup dilempar ke Rencana',
  izinLayar.includes('petaIzinBba(Number(uid), role)') && izinLayar.includes("if (peta[menu] === 'TIDAK') redirect('/buku-besar-aset');")
  && sumber('app/(dashboard)/buku-besar-aset/page.tsx').includes("izinLayarBba('rencana')")
  && sumber('app/(dashboard)/buku-besar-aset/master/page.tsx').includes("izinLayarBba('master')"))

console.log('\nD. MySQL sungguhan — pengaman riwayat (kotak pasir 2084)')
const TAHUN = 2084
const UJI = 'UJI-BBA-PERAN'
let c: mysql.Connection | null = null
try {
  c = await mysql.createConnection({
    host: process.env.MYSQL_HOST, port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER, password: process.env.MYSQL_PASSWORD, database: process.env.MYSQL_DATABASE,
  })
} catch (e) {
  console.log(`DILEWATI bagian DB: MySQL tidak bisa dihubungi (${(e as { code?: string }).code ?? e})`)
}
if (c) {
  const k = c
  const ROLE_UJI = 'UJI_PERAN_BBA'
  const bersih = async () => {
    await k.query('DELETE FROM buku_besar_aset WHERE tahun_anggaran = ?', [TAHUN])
    await k.query('DELETE FROM usulan_items WHERE no_usulan = ?', [UJI])
    await k.query('DELETE FROM usulan_headers WHERE no_usulan = ?', [UJI])
    await k.query('DELETE FROM menu_role_access WHERE role = ?', [ROLE_UJI])
  }
  await bersih()
  const D = await import('../lib/data/buku-besar-aset')
  const [u] = await k.query('SELECT id FROM users ORDER BY id LIMIT 1') as [Array<{ id: number }>, unknown]
  const userId = Number(u[0]?.id ?? 0)
  const versi = async (id: number) => Number(((await k.query('SELECT version FROM buku_besar_aset WHERE id = ?', [id])) as [Array<{ version: number }>, unknown])[0][0]?.version)
  const refDb = async (id: number) => ((await k.query('SELECT url, harga FROM bba_referensi_harga WHERE aset_id = ? ORDER BY urutan', [id])) as [Array<{ url: string | null; harga: string | null }>, unknown])[0]
  const proses = async (id: number, status: 'DIPROSES' | 'DIRENCANAKAN') =>
    D.setRealisasi({ id, expected_version: await versi(id), nilai_realisasi: 0, vol_realisasi: 0, tgl_realisasi: null, status }, userId)
  try {
    const [h] = await k.query("INSERT INTO usulan_headers (no_usulan, pengusul, sub_bidang, tahun_anggaran) VALUES (?, 'UJI', 'SUB_UJI', ?)", [UJI, String(TAHUN)]) as [{ insertId: number }, unknown]
    await k.query(`INSERT INTO usulan_items (usulan_id, no_usulan, no_item, sub_bidang, pengusul, jenis_belanja, nama_barang, spesifikasi, qty, satuan, harga_est, status, url_merk1, url_merk2, url_merk3)
      VALUES (?, ?, 1, 'SUB_UJI', 'UJI', 'Belanja Modal Peralatan', ?, 'Merk A', 2, 'unit', 4000000, 'DISETUJUI', 'https://shopee.co.id/merk-a', 'javascript:alert(1)', 'https://e-katalog.lkpp.go.id/merk-b')`,
      [h.insertId, UJI, `${UJI} Kursi roda`])
    await D.commitImportUsulan(TAHUN, userId)
    const usul = (await D.listAset({ tahun: TAHUN, page: 1, limit: 50 })).rows.find(r => r.origin === 'USULAN')!
    ok('D1 sebelum diproses: tautan usulan hanya dibaca lewat JOIN (belum ada referensi tersimpan)', usul.tautan_usulan.length === 2 && (await refDb(usul.id)).length === 0)

    await proses(usul.id, 'DIPROSES')
    const beku = await refDb(usul.id)
    ok('D2 masuk Dalam Proses → tautan usulan ditulis jadi referensi (yang aman saja)',
      beku.length === 2 && beku[0].url === 'https://shopee.co.id/merk-a' && beku[1].url === 'https://e-katalog.lkpp.go.id/merk-b', JSON.stringify(beku))
    await k.query("UPDATE usulan_items SET url_merk1 = 'https://contoh.id/lain', url_merk3 = NULL WHERE no_usulan = ?", [UJI])
    ok('D3 usulannya diubah sesudahnya → referensi tersimpan tidak ikut berubah', JSON.stringify(await refDb(usul.id)) === JSON.stringify(beku))

    const ubahRef = await coba(async () => D.updateAset({ id: usul.id, expected_version: await versi(usul.id), referensi: [{ sumber: 'LAINNYA', url: 'https://x.id', harga: 9 }] }, userId))
    ok('D4 referensi item Dalam Proses tidak bisa diganti', ubahRef instanceof D.BbaReferensiBekuError && JSON.stringify(await refDb(usul.id)) === JSON.stringify(beku))
    const detail = await D.getAsetDetail(usul.id)
    const samaPersis = await coba(async () => D.updateAset({ id: usul.id, expected_version: await versi(usul.id), keterangan: 'catatan', referensi: detail!.referensi }, userId))
    ok('D5 mengirim referensi yang SAMA tetap diterima (modal lama yang ikut mengirimnya tidak macet)', !(samaPersis instanceof Error), String(samaPersis))
    const tanpaRef = await coba(async () => D.updateAset({ id: usul.id, expected_version: await versi(usul.id), keterangan: 'tanpa referensi' }, userId))
    ok('D6 data item lain tetap bisa diubah walau referensinya beku', !(tanpaRef instanceof Error))

    const hapusProses = await coba(() => D.deleteAset(usul.id))
    ok('D7 item Dalam Proses tidak bisa dihapus', hapusProses instanceof D.BbaRiwayatTerkunciError && (await D.getAsetById(usul.id)) !== null)

    await proses(usul.id, 'DIRENCANAKAN')
    const nRef = (await refDb(usul.id)).length
    await proses(usul.id, 'DIPROSES')
    ok('D8 batal lalu diproses lagi → referensi tidak ditulis dobel', (await refDb(usul.id)).length === nRef && nRef === 2)
    await proses(usul.id, 'DIRENCANAKAN')
    const bukaLagi = await coba(async () => D.updateAset({ id: usul.id, expected_version: await versi(usul.id), referensi: [{ sumber: 'LAINNYA', url: 'https://x.id', harga: 9 }] }, userId))
    ok('D9 pesanan batal (kembali Direncanakan) → referensi bisa disunting lagi', !(bukaLagi instanceof Error) && (await refDb(usul.id)).length === 1)

    const manual = await D.createAset({ tahun_anggaran: TAHUN, uraian: `${UJI} Manual`, sumber_anggaran: 'BLUD', vol: 1, harga: 1 }, userId)
    await proses(manual.id, 'DIPROSES')
    ok('D10 item manual tanpa tautan usulan → tidak ada referensi yang dikarang', (await refDb(manual.id)).length === 0)

    const draf = await D.createAset({ tahun_anggaran: TAHUN, uraian: `${UJI} Draf`, sumber_anggaran: 'BLUD', vol: 1, harga: 1 }, userId)
    await D.tambahBukti({ aset_id: draf.id, jenis: 'LAINNYA', nama: 'catatan', url: 'https://a.id' }, userId)
    const hapusBerbukti = await coba(() => D.deleteAset(draf.id))
    const [bk] = (await k.query('SELECT id FROM bba_lampiran WHERE aset_id = ?', [draf.id])) as [Array<{ id: number }>, unknown]
    await D.hapusBukti(Number(bk[0].id))
    const hapusSesudah = await coba(() => D.deleteAset(draf.id))
    ok('D11 rencana berbukti ditolak dihapus; sesudah buktinya dilepas boleh', hapusBerbukti instanceof D.BbaRiwayatTerkunciError && hapusSesudah === true)

    console.log('\nE. MySQL sungguhan — izin dua lapis dari Admin Panel')
    const MA = await import('../lib/data/menu-access')
    const { petaIzinBba } = await import('../lib/bba/izin-server')
    await k.query("INSERT INTO menu_role_access (app_key, role, menu_key, izin, updated_by) VALUES ('buku_besar_aset', ?, 'buku_besar_aset.pengadaan', 'EDIT', ?)", [ROLE_UJI, userId])
    MA.bersihkanCacheIzin()
    const pRole = await petaIzinBba(userId, ROLE_UJI)
    ok('E1 aturan peran dari Admin Panel dibaca (peran uji: Pengadaan=EDIT, sisanya bawaan LIHAT)', pRole.pengadaan === 'EDIT' && pRole.rencana === 'LIHAT' && pRole.aset === 'LIHAT')
  } finally {
    await bersih()
    const [sisa] = await k.query('SELECT (SELECT COUNT(*) FROM buku_besar_aset WHERE tahun_anggaran = ?) AS a, (SELECT COUNT(*) FROM usulan_items WHERE no_usulan = ?) AS u, (SELECT COUNT(*) FROM menu_role_access WHERE role = ?) AS m',
      [TAHUN, UJI, ROLE_UJI]) as [Array<{ a: number; u: number; m: number }>, unknown]
    ok('E9 kotak pasir bersih', Number(sisa[0].a) === 0 && Number(sisa[0].u) === 0 && Number(sisa[0].m) === 0, JSON.stringify(sisa[0]))
    await k.end()
  }
}

console.log(`\n${lulus} lulus, ${gagal.length} gagal`)
if (gagal.length) { console.log(gagal.map(g => `  - ${g}`).join('\n')); process.exit(1) }
process.exit(0)
