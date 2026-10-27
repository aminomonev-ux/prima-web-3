// scripts/test-bba-referensi.mts — Buku Besar Aset Tahap 1: referensi harga + bukti dukung
// (docs/CONCEPT-bba-perencanaan.md §4).
//
//   npx tsx scripts/test-bba-referensi.mts
//
// A `lib/bba/referensi.ts` (murni): tebak sumber, referensi sah, ringkasan harga, kelengkapan, slot dari usulan.
// B skema Zod. C sambungan sumber (aturan unduh BBA, L87 referensi, satu jalur unggah, retensi audit,
// folder Drive BBA, berkas Drive hilang = 404, muatan tabel yang basi dibuang).
// D MySQL sungguhan di tahun kotak pasir 2089 lewat fungsi data asli, lalu dibersihkan.

import { readFileSync } from 'node:fs'
import mysql from 'mysql2/promise'
import {
  tebakSumber, referensiSah, ringkasHarga, selisihAtasTertinggi, kelengkapanRef, perluReferensi,
  kelengkapanBukti, buktiBelumLengkap, slotDariUsulan, rapikanReferensi, referensiSama, tautanAman,
  type ReferensiIsian,
} from '../lib/bba/referensi'

try {
  for (const b of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split(/\r?\n/)) {
    const t = b.trim()
    const i = t.indexOf('=')
    if (!t || t.startsWith('#') || i < 0) continue
    const k = t.slice(0, i).trim()
    if (process.env[k] === undefined) process.env[k] = t.slice(i + 1).trim().replace(/^["']|["']$/g, '')
  }
} catch { /* tanpa .env.local: bagian DB dilewati */ }

let lulus = 0
const gagal: string[] = []
function ok(nama: string, syarat: unknown, ket = '') {
  if (syarat) { lulus++; console.log(`  ok  ${nama}`) }
  else { gagal.push(nama); console.log(`FAIL  ${nama}${ket ? ' — ' + ket : ''}`) }
}
const sumber = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
const tanpaKomentar = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/ .*$/gm, '')
const coba = async <T,>(f: () => Promise<T>): Promise<T | Error> => { try { return await f() } catch (e) { return e as Error } }
const ref = (p: Partial<ReferensiIsian>): ReferensiIsian => ({ sumber: 'LAINNYA', nama_penyedia: null, url: null, harga: null, tgl_cek: null, file_id: null, ...p })

console.log('A. Aturan murni lib/bba/referensi.ts')
ok('A1 e-Katalog LKPP & INAPROC dikenali', tebakSumber('https://e-katalog.lkpp.go.id/katalog/produk/123') === 'EKATALOG' && tebakSumber('https://katalog.inaproc.id/p/9') === 'EKATALOG')
ok('A2 Shopee/Tokopedia (termasuk tautan pendek & www) dikenali', tebakSumber('https://shopee.co.id/laptop-i.1.2') === 'TOKO_DARING'
  && tebakSumber('https://www.tokopedia.com/toko/laptop') === 'TOKO_DARING' && tebakSumber('https://shp.ee/abc') === 'TOKO_DARING')
ok('A3 domain mirip tidak ikut ditebak (batas domain, bukan akhiran teks)', tebakSumber('https://evilshopee.co.id/x') === null && tebakSumber('https://tokopedia.com.penipu.id/x') === null)
ok('A4 domain lain / bukan http / kosong → null (pilihan orang tidak ditimpa)', tebakSumber('https://tokokomputer-semarang.com') === null
  && tebakSumber('javascript:alert(1)') === null && tebakSumber('') === null && tebakSumber(null) === null)

ok('A5 sah = harga > 0 DAN (tautan aman ATAU berkas)', referensiSah({ harga: 10, url: 'https://shopee.co.id/x', file_id: null })
  && referensiSah({ harga: 10, url: null, file_id: 'berkas' }) && !referensiSah({ harga: 0, url: 'https://a.id', file_id: 'x' })
  && !referensiSah({ harga: null, url: 'https://a.id', file_id: null }) && !referensiSah({ harga: 10, url: 'javascript:alert(1)', file_id: null }))

const tiga = [
  ref({ harga: 13_200_000, url: 'https://e-katalog.lkpp.go.id/a' }),
  ref({ harga: 12_799_000, url: 'https://shopee.co.id/b' }),
  ref({ harga: 13_650_000, file_id: 'nota' }),
  ref({ harga: 1, nama_penyedia: 'tanpa bukti' }),
]
const rk = ringkasHarga(tiga)
ok('A6 ringkasan dari referensi SAH saja (contoh konsep §4.4)', rk?.jumlah === 3 && rk.terendah === 12_799_000 && rk.tertinggi === 13_650_000 && rk.rata === 13_216_333, JSON.stringify(rk))
ok('A7 rata-rata dibulatkan ke rupiah (yang tampil = yang diisi "Pakai rata-rata")', Number.isInteger(rk?.rata))
ok('A8 tanpa referensi sah → ringkasan null', ringkasHarga([ref({ harga: 5 })]) === null && ringkasHarga([]) === null)
ok('A9 selisih di atas tertinggi', selisihAtasTertinggi(13_900_000, rk) === 250_000 && selisihAtasTertinggi(13_650_000, rk) === 0 && selisihAtasTertinggi(99, null) === 0)

ok('A10 belum ada yang tersimpan + ada tautan usulan → "tautan dari usulan"', kelengkapanRef(0, 0, 3).tingkat === 'TAUTAN_USULAN')
ok('A11 begitu ada yang tersimpan, tautan usulan tidak berlaku lagi (3 tautan tanpa harga = 0/3)', kelengkapanRef(0, 3, 3).tingkat === 'KOSONG')
ok('A12 tingkat 3+/1–2/0', kelengkapanRef(3, 3, 0).tingkat === 'LENGKAP' && kelengkapanRef(4, 5, 0).tingkat === 'LENGKAP'
  && kelengkapanRef(2, 2, 0).tingkat === 'SEBAGIAN' && kelengkapanRef(0, 0, 0).tingkat === 'KOSONG')
ok('A13 "Lengkapi referensi" melewatkan usulan DITOLAK dan yang lengkap',
  !perluReferensi({ usulan_keputusan: 'DITOLAK', ref: kelengkapanRef(0, 0, 0) })
  && !perluReferensi({ usulan_keputusan: null, ref: kelengkapanRef(3, 3, 0) })
  && perluReferensi({ usulan_keputusan: 'DISETUJUI', ref: kelengkapanRef(0, 0, 2) }))

ok('A14 bukti belum relevan sebelum terealisasi', kelengkapanBukti(['BUKTI_BELI', 'BAST', 'FOTO'], 'DIRENCANAKAN') === null && kelengkapanBukti([], 'TIDAK_TEREALISASI') === null)
const kb = kelengkapanBukti(['FOTO', 'FOTO', 'LAINNYA'], 'REALISASI_PENUH')
ok('A15 "Bukti n/3" menghitung JENIS inti, bukan jumlah berkas', kb?.n === 1 && kb.target === 3 && buktiBelumLengkap(kb))
ok('A16 tiga jenis inti = lengkap', kelengkapanBukti(['BAST', 'FOTO', 'BUKTI_BELI'], 'REALISASI_SEBAGIAN')?.n === 3 && !buktiBelumLengkap(kelengkapanBukti(['BAST', 'FOTO', 'BUKTI_BELI'], 'REALISASI_PENUH')))

const slot = slotDariUsulan([' https://shopee.co.id/x ', '', 'javascript:alert(1)', 'https://e-katalog.lkpp.go.id/p'])
ok('A17 slot dari usulan: hanya http/https, dirapikan, sumber ditebak, harga kosong', slot.length === 2 && slot[0].url === 'https://shopee.co.id/x'
  && slot[0].sumber === 'TOKO_DARING' && slot[1].sumber === 'EKATALOG' && slot.every(s => s.harga === null))
ok('A18 tautan dari domain tak dikenal masuk sebagai Lainnya', slotDariUsulan(['https://toko-a.com'])[0]?.sumber === 'LAINNYA')
ok('A19 tautanAman membuang kosong/null/skema berbahaya', JSON.stringify(tautanAman(['', null, undefined, 'data:text/html,x', 'http://a.id'])) === JSON.stringify(['http://a.id']))

const rapi = rapikanReferensi([ref({ nama_penyedia: '  PT A  ', harga: 0 }), ref({}), ref({ url: '  ', tgl_cek: '' })])
ok('A20 rapikan: baris kosong dibuang, teks dirapikan, harga 0 = belum diisi', rapi.length === 1 && rapi[0].nama_penyedia === 'PT A' && rapi[0].harga === null)
ok('A21 "+ Referensi" yang tak jadi diisi bukan perubahan', referensiSama(slot, [...slot, ref({})]) && !referensiSama(slot, slot.slice(1)))

console.log('\nB. Skema Zod')
const S = await import('../lib/data/buku-besar-aset-schemas')
const fileId = 'UJIBBA_ref_0000000001'
ok('B1 referensi sah diterima', S.ReferensiSchema.safeParse({ sumber: 'EKATALOG', url: 'https://e-katalog.lkpp.go.id/a', harga: 100, tgl_cek: '2026-10-22', file_id: fileId }).success)
ok('B2 tautan javascript:/data: ditolak (stored-XSS)', !S.ReferensiSchema.safeParse({ sumber: 'LAINNYA', url: 'javascript:alert(1)', harga: 1 }).success
  && !S.BuktiCreateSchema.safeParse({ aset_id: 1, jenis: 'FOTO', nama: 'x', url: 'data:text/html,1' }).success)
ok('B3 referensi kosong melompong ditolak', !S.ReferensiSchema.safeParse({ sumber: 'LAINNYA' }).success)
ok('B4 id berkas bukan bentuk Drive ditolak', !S.ReferensiSchema.safeParse({ sumber: 'LAINNYA', harga: 1, file_id: '../etc/passwd' }).success)
const tanpaRef = S.BbaUpdateSchema.parse({ id: 1, expected_version: 0 })
const refKosong = S.BbaUpdateSchema.parse({ id: 1, expected_version: 0, referensi: [] })
ok('B5 L87: referensi TIDAK dikirim = undefined (jangan sentuh), larik kosong = kosongkan', tanpaRef.referensi === undefined && Array.isArray(refKosong.referensi) && refKosong.referensi.length === 0)
ok('B6 paling banyak 10 referensi', !S.BbaUpdateSchema.safeParse({ id: 1, expected_version: 0, referensi: Array.from({ length: 11 }, () => ({ sumber: 'LAINNYA', harga: 1 })) }).success
  && S.BbaCreateSchema.safeParse({ tahun_anggaran: 2089, uraian: 'x', referensi: Array.from({ length: 10 }, () => ({ sumber: 'LAINNYA', harga: 1 })) }).success)
ok('B7 bukti perlu berkas atau tautan', !S.BuktiCreateSchema.safeParse({ aset_id: 1, jenis: 'BAST', nama: 'BAST' }).success
  && S.BuktiCreateSchema.safeParse({ aset_id: 1, jenis: 'BAST', nama: 'BAST', file_id: fileId }).success)

console.log('\nC. Sambungan sumber')
const { MODUL_PENGUNGGAH, kunciSakelarBerkas, modulPengunggah } = await import('../lib/security/unggahan-modul')
ok('C1 BBA terdaftar sebagai modul pengunggah, sakelarnya sendiri', (MODUL_PENGUNGGAH as readonly string[]).includes('buku_besar_aset')
  && modulPengunggah('buku_besar_aset') === 'buku_besar_aset' && JSON.stringify(kunciSakelarBerkas('buku_besar_aset')) === JSON.stringify(['app_status_buku_besar_aset']))
const unduh = tanpaKomentar(sumber('app/api/upload/download/route.ts'))
const iAdmin = unduh.indexOf('if (!isAdminTier) {')
const iBba = unduh.indexOf("if (owner.context === 'buku_besar_aset') {")
const iTolak = unduh.indexOf('if (!isOwner && !bidangAllowed && !bbaAllowed) return await deny();')
ok('C2 aturan unduh BBA dikunci pada context BERKAS, di dalam cabang non-admin, sebelum penolakan', iAdmin >= 0 && iBba > iAdmin && iTolak > iBba)
ok('C3 …app_access dibaca dari DB (bukan JWT) lalu ditimbang isAsetRole',
  unduh.slice(iBba, iTolak).includes('SELECT app_access FROM users WHERE id = ${session.userId}') && unduh.slice(iBba, iTolak).includes('bbaAllowed = isAsetRole(session.role, akses?.app_access ?? null);'))
const data = tanpaKomentar(sumber('lib/data/buku-besar-aset.ts'))
const badanUpdate = data.slice(data.indexOf('export async function updateAset('), data.indexOf('export async function ubahStatusProses('))
const iCas = badanUpdate.indexOf('assertCas(res);')
const iGanti = badanUpdate.indexOf('if (input.referensi !== undefined) await gantiReferensi(tx, conn, input.id, input.referensi);')
ok('C4 updateAset: referensi diganti HANYA bila dikirim, sesudah CAS, di transaksi yang sama', iCas >= 0 && iGanti > iCas && badanUpdate.includes('await withTransaction(async ({ tx, conn }) => {'))
const badanGanti = data.slice(data.indexOf('async function gantiReferensi('), data.indexOf('export async function tambahBukti('))
ok('C5 gantiReferensi: berkas diperiksa SEBELUM DELETE (L68/L87)', badanGanti.indexOf('await pastikanBerkasBba(') >= 0
  && badanGanti.indexOf('await pastikanBerkasBba(') < badanGanti.indexOf('DELETE FROM bba_referensi_harga'))
ok("C6 berkas harus ber-context 'buku_besar_aset'", data.includes("WHERE file_id IN (${unik}) AND context = 'buku_besar_aset'"))
const modal = tanpaKomentar(sumber('app/(dashboard)/buku-besar-aset/_components/ModalItem.tsx'))
ok('C7 modal: satu jalur unggah ber-modul buku_besar_aset', (modal.match(/'\/api\/upload', \{ method: 'POST'/g) ?? []).length === 1 && modal.includes("fd.append('modul', 'buku_besar_aset')"))
ok('C8 modal: referensi dikirim hanya kalau berubah (L87)', modal.includes('...(refBerubah ? { referensi: rapi } : {}),') && modal.includes('const refBerubah = !referensiSama(refs, dasar.refs);'))
ok('C9 modal: "belum tersimpan" dihitung, bukan state (L79b)', modal.includes('const belumTersimpan = JSON.stringify(isian) !== JSON.stringify(dasar.isian) || !referensiSama(refs, dasar.refs);')
  && !/useState[^\n]*belumTersimpan|setBelumTersimpan/.test(modal))
ok('C10 modal: isi awal dari tautan usulan HANYA bila belum ada yang tersimpan', modal.includes('const refsAwal = det.referensi.length > 0 ? det.referensi : slotDariUsulan(det.item.tautan_usulan);'))
ok('C11 modal: angka kunci Simpan dari muatan segar GET ?id= (L77), bukan baris tabel', modal.includes('id: item!.id, expected_version: item!.version')
  && modal.includes('setMuatan({ item: det.item'))
const klien = tanpaKomentar(sumber('app/(dashboard)/buku-besar-aset/buku-besar-aset-client.tsx'))
ok('C12 halaman: form item lama sudah tidak ada (satu modal, satu jalur tulis — L78)', !klien.includes('saveForm') && !klien.includes("method: isEdit ? 'PATCH' : 'POST'") && klien.includes('<ModalItem '))
const { RETENSI_PERISTIWA } = await import('../lib/security/retensi-audit')
ok('C13 audit bukti digolongkan perubahan data (5 tahun)', RETENSI_PERISTIWA.BBA_BUKTI_ADD === 'PANJANG' && RETENSI_PERISTIWA.BBA_BUKTI_DELETE === 'PANJANG')
const rBukti = tanpaKomentar(sumber('app/api/buku-besar-aset/bukti/route.ts'))
ok('C14 route bukti: tiap handler lewat guard modul lebih dulu', (rBukti.match(/const g = await guard\(\);\s*if \(!g\.ok\) return g\.res;/g) ?? []).length === 2)
const skema = sumber('docs/schema-mysql.sql')
ok('C15 skema acuan memuat kedua tabel baru', skema.includes('CREATE TABLE IF NOT EXISTS bba_referensi_harga (') && skema.includes('CREATE TABLE IF NOT EXISTS bba_lampiran ('))

const { folderUnggahan } = await import('../lib/security/unggahan-modul')
const envUji = { GOOGLE_DRIVE_FOLDER_ID: 'umum', GOOGLE_DRIVE_FOLDER_ID_BBA: ' bba ' }
ok('C16 unggahan BBA ke folder BBA; modul lain & modul tak dikenal tetap ke folder umum', folderUnggahan('buku_besar_aset', envUji) === 'bba'
  && folderUnggahan('lkjip', envUji) === 'umum' && folderUnggahan('usulan_aset', envUji) === 'umum' && folderUnggahan(null, envUji) === 'umum')
ok('C17 folder BBA belum disetel/kosong → jatuh ke folder umum (server lama tetap bisa unggah)', folderUnggahan('buku_besar_aset', { GOOGLE_DRIVE_FOLDER_ID: 'umum' }) === 'umum'
  && folderUnggahan('buku_besar_aset', { GOOGLE_DRIVE_FOLDER_ID: 'umum', GOOGLE_DRIVE_FOLDER_ID_BBA: '  ' }) === 'umum')
ok('C18 route unggah memakai folderUnggahan(modulAsal), bukan env umum langsung', tanpaKomentar(sumber('app/api/upload/route.ts')).includes('const folderId = folderUnggahan(modulAsal);')
  && !tanpaKomentar(sumber('app/api/upload/route.ts')).includes('process.env.GOOGLE_DRIVE_FOLDER_ID'))

const { kodeGalatDrive } = await import('../lib/services/drive')
// Bentuk galat Drive sungguhan untuk berkas yang tidak ada (diukur 2026-10-26): pesannya
// "File not found: <id>." — tanpa "404"/"notFound" — kodenya di status/code/response.status.
const galatHilang = Object.assign(new Error('File not found: UJIBBA_x.'), { status: 404, code: 404, response: { status: 404 } })
ok('C19 kodeGalatDrive membaca status, bukan pesan', kodeGalatDrive(galatHilang) === 404 && kodeGalatDrive({ response: { status: 404 } }) === 404
  && kodeGalatDrive({ code: '404' }) === 404 && kodeGalatDrive({ code: 'ECONNRESET' }) === null && kodeGalatDrive(new Error('File not found: x')) === null && kodeGalatDrive(null) === null)
ok('C20 route unduh: berkas Drive yang hilang = 404 lewat kodeGalatDrive', unduh.includes('if (kodeGalatDrive(err) === 404) {') && !unduh.includes('/notFound|404/i'))

const badanLoad = klien.slice(klien.indexOf('const load = useCallback('), klien.indexOf('const rowsTampil'))
const iJawab = badanLoad.indexOf('const d = await fetchJson<unknown>(`/api/buku-besar-aset?${params}`);')
const iBasi = badanLoad.indexOf('if (nomor !== nomorMuat.current) return;')
ok('C21 tabel: jawaban muatan yang sudah basi dibuang SEBELUM mengisi baris', iJawab >= 0 && iBasi > iJawab && iBasi < badanLoad.indexOf('setRows(r.rows)')
  && badanLoad.includes('const nomor = ++nomorMuat.current;') && badanLoad.includes('finally { if (nomor === nomorMuat.current) setLoading(false); }'))
const rumusKunci = /const kunciSaringan = (`[^`]+`);/.exec(klien)?.[1] ?? '?'
ok('C22 tabel: muat otomatis berpatokan saringan yang terakhir dimuat, tahun setengah diketik dilewati', !badanLoad.includes('didMount')
  && badanLoad.includes('if (kunciTermuat.current === kunciSaringan || tahun < 2020 || tahun > 2100) return;'))
ok('C23 tabel: tiap muatan mencatat saringannya dengan rumus kunci yang SAMA (kalau tidak, kembali ke tahun awal tak memuat ulang)',
  rumusKunci.includes('${tahun}') && badanLoad.includes(`kunciTermuat.current = ${rumusKunci};`))

console.log('\nD. MySQL sungguhan (kotak pasir 2089)')
const TAHUN = 2089
const UJI = 'UJI-BBA-REF'
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
  const bersih = async () => {
    await k.query('DELETE p FROM bba_penerimaan p JOIN buku_besar_aset b ON b.id = p.rencana_id WHERE b.tahun_anggaran = ?', [TAHUN])
    await k.query('DELETE FROM buku_besar_aset WHERE tahun_anggaran = ?', [TAHUN])
    await k.query('DELETE FROM usulan_items WHERE no_usulan = ?', [UJI])
    await k.query('DELETE FROM usulan_headers WHERE no_usulan = ?', [UJI])
    await k.query("DELETE FROM uploaded_files WHERE file_id LIKE 'UJIBBA\\_%'")
  }
  await bersih()
  const D = await import('../lib/data/buku-besar-aset')
  const [u] = await k.query('SELECT id FROM users ORDER BY id LIMIT 1') as [Array<{ id: number }>, unknown]
  const userId = Number(u[0]?.id ?? 0)
  const fBba1 = 'UJIBBA_ref_0000000001', fBba2 = 'UJIBBA_ref_0000000002', fLain = 'UJIBBA_lkj_0000000003'
  const versiDb = async (id: number) => Number(((await k.query('SELECT version FROM buku_besar_aset WHERE id = ?', [id])) as [Array<{ version: number }>, unknown])[0][0]?.version)
  const jumlahRef = async (id: number) => Number(((await k.query('SELECT COUNT(*) AS n FROM bba_referensi_harga WHERE aset_id = ?', [id])) as [Array<{ n: number }>, unknown])[0][0]?.n)
  try {
    await k.query('INSERT INTO uploaded_files (file_id, uploaded_by, context, sniff_ok) VALUES (?,?,?,1),(?,?,?,1),(?,?,?,1)',
      [fBba1, userId, 'buku_besar_aset', fBba2, userId, 'buku_besar_aset', fLain, userId, 'lkjip'])

    const { id } = await D.createAset({
      tahun_anggaran: TAHUN, uraian: `${UJI} Laptop`, sumber_anggaran: 'BLUD', vol: 4, harga: 13_900_000,
      referensi: [
        { sumber: 'EKATALOG', nama_penyedia: 'PT Datascrip', url: 'https://e-katalog.lkpp.go.id/a', harga: 13_200_000, tgl_cek: '2089-01-02', file_id: fBba1 },
        { sumber: 'TOKO_DARING', nama_penyedia: 'Shopee', url: 'https://shopee.co.id/b', harga: 12_799_000 },
        { sumber: 'TOKO_LURING', nama_penyedia: 'Toko C', harga: 13_650_000, file_id: fBba2 },
      ],
    }, userId)
    const d1 = await D.getAsetDetail(id)
    ok('D1 Tambah item + 3 referensi dalam satu transaksi; urutan & tanggal terjaga', d1?.referensi.length === 3 && d1.referensi[0].nama_penyedia === 'PT Datascrip'
      && d1.referensi[0].tgl_cek === '2089-01-02' && d1.referensi[2].file_id === fBba2 && d1.item.ref.tingkat === 'LENGKAP', JSON.stringify(d1?.item.ref))

    const pinjam = await coba(() => D.createAset({ tahun_anggaran: TAHUN, uraian: `${UJI} Pinjam berkas`, sumber_anggaran: 'BLUD', vol: 1, harga: 1,
      referensi: [{ sumber: 'LAINNYA', harga: 1, file_id: fLain }] }, userId))
    const [sisaPinjam] = await k.query('SELECT COUNT(*) AS n FROM buku_besar_aset WHERE uraian = ?', [`${UJI} Pinjam berkas`]) as [Array<{ n: number }>, unknown]
    ok('D2 berkas modul lain ditolak — dan item-nya ikut batal (satu transaksi)', pinjam instanceof D.BbaBerkasTidakDikenalError && Number(sisaPinjam[0].n) === 0)

    const v0 = await versiDb(id)
    await D.updateAset({ id, expected_version: v0, keterangan: 'tanpa referensi' }, userId)
    ok('D3 L87: PATCH tanpa field referensi tidak menyentuh referensi', await jumlahRef(id) === 3 && await versiDb(id) === v0 + 1)

    const basi = await coba(() => D.updateAset({ id, expected_version: v0, referensi: [] }, userId))
    ok('D4 angka kunci basi → 409, referensi TIDAK terhapus (CAS sebelum DELETE)', basi instanceof D.BbaVersionConflictError && await jumlahRef(id) === 3)

    const v1 = await versiDb(id)
    const salahBerkas = await coba(() => D.updateAset({ id, expected_version: v1, harga: 1, referensi: [{ sumber: 'LAINNYA', harga: 1, file_id: 'UJIBBA_tidak_ada_00001' }] }, userId))
    const dSalah = await D.getAsetDetail(id)
    ok('D5 berkas tak dikenal saat edit → seluruh Simpan batal (harga & versi tetap, referensi utuh)', salahBerkas instanceof D.BbaBerkasTidakDikenalError
      && await versiDb(id) === v1 && dSalah?.item.harga === 13_900_000 && dSalah.referensi.length === 3)

    await D.updateAset({ id, expected_version: v1, referensi: [{ sumber: 'TOKO_DARING', url: 'https://shopee.co.id/b', harga: 12_500_000 }] }, userId)
    const d2 = await D.getAsetDetail(id)
    ok('D6 larik referensi mengganti semuanya', d2?.referensi.length === 1 && d2.referensi[0].harga === 12_500_000 && d2.item.ref.tingkat === 'SEBAGIAN')
    await D.updateAset({ id, expected_version: await versiDb(id), referensi: [] }, userId)
    ok('D7 larik kosong = mengosongkan dengan sengaja', await jumlahRef(id) === 0)

    // Item asal usulan: tautan url_merk dibaca langsung, tanpa disalin.
    const [h] = await k.query("INSERT INTO usulan_headers (no_usulan, pengusul, sub_bidang, tahun_anggaran) VALUES (?, 'UJI', 'SUB_UJI', ?)", [UJI, String(TAHUN)]) as [{ insertId: number }, unknown]
    await k.query(`INSERT INTO usulan_items (usulan_id, no_usulan, no_item, sub_bidang, pengusul, jenis_belanja, nama_barang, spesifikasi, qty, satuan, harga_est, status, url_merk1, url_merk2, url_merk3, file_url)
      VALUES (?, ?, 1, 'SUB_UJI', 'UJI', 'Belanja Modal Peralatan', ?, 'Core i5', 2, 'unit', 10000000, 'DISETUJUI', 'https://shopee.co.id/x', 'javascript:alert(1)', ' https://e-katalog.lkpp.go.id/y ', ?)`,
      [h.insertId, UJI, `${UJI} Printer`, `/api/upload/download?id=${fBba2}`])
    const { inserted } = await D.commitImportUsulan(TAHUN, userId)
    const daftar = await D.listAset({ tahun: TAHUN, page: 1, limit: 200 })
    const usul = daftar.rows.find(r => r.origin === 'USULAN')
    ok('D8 tarik dari usulan TIDAK berubah, tautannya terbaca lewat JOIN (2 aman dari 3)', inserted === 1 && usul?.tautan_usulan.length === 2
      && usul.tautan_usulan[1] === 'https://e-katalog.lkpp.go.id/y' && usul.ref.tingkat === 'TAUTAN_USULAN', JSON.stringify(usul?.tautan_usulan))
    ok('D9 lampiran usulan (path unduh internal) ikut terbaca', usul?.lampiran_usulan === `/api/upload/download?id=${fBba2}`)
    const [jmlRefUsul] = await k.query('SELECT COUNT(*) AS n FROM bba_referensi_harga WHERE aset_id = ?', [usul!.id]) as [Array<{ n: number }>, unknown]
    ok('D10 tanpa pengisi: tidak ada referensi yang ditulis saat ditarik', Number(jmlRefUsul[0].n) === 0)
    const manual = daftar.rows.find(r => r.id === id)
    ok('D11 daftar menghitung Ref per baris (item manual kosong = 0/3)', manual?.ref.tingkat === 'KOSONG' && manual.tautan_usulan.length === 0)

    // Bukti dukung — ditulis per aksi, tanpa menaikkan versi item.
    const vB = await versiDb(id)
    const t1 = await D.tambahBukti({ aset_id: id, jenis: 'BUKTI_BELI', nama: 'Faktur PT A', file_id: fBba1 }, userId)
    const t2 = await D.tambahBukti({ aset_id: id, jenis: 'FOTO', nama: 'Foto unit', url: 'https://drive.google.com/x', keterangan: 'tampak depan' }, userId)
    ok('D12 tambah bukti → daftar terbaru dipulangkan, versi item TIDAK naik', t1.bukti.length === 1 && t2.bukti.length === 2 && t2.canonical_id.startsWith('BBA-') && await versiDb(id) === vB)
    const buktiPinjam = await coba(() => D.tambahBukti({ aset_id: id, jenis: 'BAST', nama: 'BAST', file_id: fLain }, userId))
    ok('D13 bukti dengan berkas modul lain ditolak', buktiPinjam instanceof D.BbaBerkasTidakDikenalError && (await D.listBukti(id)).length === 2)
    const tanpaAset = await coba(() => D.tambahBukti({ aset_id: 999_999_999, jenis: 'FOTO', nama: 'x', url: 'https://a.id' }, userId))
    ok('D14 bukti untuk item yang tidak ada → BbaNotFoundError', tanpaAset instanceof D.BbaNotFoundError)

    // Tahap E: diterima = lewat penerimaan, untuk rencana yang didanai (tanggal tidak boleh sesudah hari ini).
    await D.tandaiAnggaran({ anggaran: 'DIDANAI', item: [{ id, expected_version: await versiDb(id) }] }, userId)
    const PEN = await import('../lib/data/bba-penerimaan')
    await PEN.catatPenerimaan({ rencana_id: id, expected_version: await versiDb(id), tgl: '2025-03-01', vol: 4, harga_satuan: 13_000_000 }, userId)
    const sesudahReal = (await D.listAset({ tahun: TAHUN, page: 1, limit: 200 })).rows.find(r => r.id === id)
    ok('D15 Bukti n/3 terhitung begitu terealisasi (beli + foto = 2/3)', sesudahReal?.bukti?.n === 2 && sesudahReal.jumlah_bukti === 2, JSON.stringify(sesudahReal?.bukti))

    const idFoto = t2.bukti.find(b => b.jenis === 'FOTO')!.id
    const h1 = await D.hapusBukti(idFoto)
    const [sisaBerkas] = await k.query('SELECT COUNT(*) AS n FROM uploaded_files WHERE file_id = ?', [fBba1]) as [Array<{ n: number }>, unknown]
    ok('D16 hapus bukti melepas catatannya saja (jejak unggahan tetap)', h1?.bukti.length === 1 && h1.nama === 'Foto unit' && Number(sisaBerkas[0].n) === 1)
    ok('D17 hapus bukti yang sudah tidak ada → null (404)', (await D.hapusBukti(idFoto)) === null)

    const isi = Array.from({ length: 29 }, (_, i) => [id, 'LAINNYA', `isi ${i}`, 'https://a.id', userId])
    await k.query('INSERT INTO bba_lampiran (aset_id, jenis, nama, url, created_by) VALUES ?', [isi])
    const penuh = await coba(() => D.tambahBukti({ aset_id: id, jenis: 'FOTO', nama: 'ke-31', url: 'https://a.id' }, userId))
    ok('D18 batas 30 bukti per item dijaga server', penuh instanceof D.BbaBuktiPenuhError && (await D.listBukti(id)).length === 30)

    // Sejak Tahap A (docs/CONCEPT-bba-buku-aset.md §10 butir 7) item terealisasi tidak bisa dihapus
    // dan referensinya beku — CASCADE tinggal berlaku untuk rencana yang belum diproses.
    const hitungRb = async () => {
      const [x] = await k.query('SELECT (SELECT COUNT(*) FROM bba_referensi_harga WHERE aset_id = ?) AS r, (SELECT COUNT(*) FROM bba_lampiran WHERE aset_id = ?) AS b', [id, id]) as [Array<{ r: number; b: number }>, unknown]
      return `${x[0].r}/${x[0].b}`
    }
    const sebelum = await hitungRb()
    const bekuRef = await coba(async () => D.updateAset({ id, expected_version: await versiDb(id), referensi: [{ sumber: 'LAINNYA', harga: 1, url: 'https://a.id' }] }, userId))
    const tolakHapus = await coba(() => D.deleteAset(id))
    ok('D19 item terealisasi: referensi beku & hapus ditolak — referensi & bukti tetap', bekuRef instanceof D.BbaReferensiBekuError
      && tolakHapus instanceof D.BbaRiwayatTerkunciError && await hitungRb() === sebelum && sebelum.endsWith('/30'), sebelum)
    const draf = await D.createAset({ tahun_anggaran: TAHUN, uraian: `${UJI} Draf`, sumber_anggaran: 'BLUD', vol: 1, harga: 1, referensi: [{ sumber: 'LAINNYA', harga: 5, url: 'https://a.id' }] }, userId)
    await D.deleteAset(draf.id)
    const [yatim] = await k.query('SELECT COUNT(*) AS r FROM bba_referensi_harga WHERE aset_id = ?', [draf.id]) as [Array<{ r: number }>, unknown]
    ok('D19b rencana belum diproses & tanpa bukti boleh dihapus — referensinya ikut (CASCADE)', Number(yatim[0].r) === 0)
  } finally {
    await bersih()
    const [sisa] = await k.query("SELECT (SELECT COUNT(*) FROM buku_besar_aset WHERE tahun_anggaran = ?) AS a, (SELECT COUNT(*) FROM usulan_items WHERE no_usulan = ?) AS u, (SELECT COUNT(*) FROM uploaded_files WHERE file_id LIKE 'UJIBBA\\_%') AS f",
      [TAHUN, UJI]) as [Array<{ a: number; u: number; f: number }>, unknown]
    ok('D20 kotak pasir bersih', Number(sisa[0].a) === 0 && Number(sisa[0].u) === 0 && Number(sisa[0].f) === 0, JSON.stringify(sisa[0]))
    await k.end()
  }
}

console.log(`\n${lulus} lulus, ${gagal.length} gagal`)
if (gagal.length) { console.log(gagal.map(g => `  - ${g}`).join('\n')); process.exit(1) }
process.exit(0)
