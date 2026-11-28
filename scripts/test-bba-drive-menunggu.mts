#!/usr/bin/env npx tsx
// scripts/test-bba-drive-menunggu.mts — perubahan Drive yang menunggu tampil per baris di web, "tetap nilai PRIMA",
// dan lepas tahanan otomatis. Konsep: docs/konsep/bba/CONCEPT-bba-drive-dua-arah.md (U2).
// Jalankan: npx tsx --env-file=.env.local scripts/test-bba-drive-menunggu.mts
// Bagian D memakai MySQL sungguhan (kotak pasir 2064, data "UJIM") dan Drive TIRUAN berrevisi; app_config yang disentuh
// dikembalikan. Tanpa MySQL = GAGAL.
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import ExcelJS from 'exceljs'
import mysql from 'mysql2/promise'
import { selisihDrive, nilaiMenunggu, bolehLepasOtomatis, saringTetap, kunciSel, MAKS_SEL_MENUNGGU, type RingkasMenunggu } from '../lib/bba/drive-menunggu'
import { gabungTigaArah, type BacaanBerkas, type Potret, type MetaPrima, type NilaiBaku } from '../lib/bba/drive-balik'

let lulus = 0
const gagal: string[] = []
function ok(nama: string, syarat: unknown, ket = '') {
  if (syarat) { lulus++; console.log(`  ok  ${nama}`) }
  else { gagal.push(nama); console.log(`FAIL  ${nama}${ket ? ' — ' + ket : ''}`) }
}
const coba = async <T,>(f: () => Promise<T>): Promise<T | Error> => { try { return await f() } catch (e) { return e as Error } }
const sumber = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
const tanpaKomentar = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

// ─── A. Aturan murni ─────────────────────────────────────────────────────────
console.log('\nA. Aturan murni')
type Baris = Record<string, NilaiBaku>
const kosong = () => ({ ada: false, peta: null, baris: [] })
const berkasDari = (rencana: Array<{ id: number | null; nilai: Baris; baris?: number }>, penawaran: Array<{ id: number; nilai: Baris }> = []): BacaanBerkas => ({
  rencana: { ada: true, peta: null, baris: rencana.map((b, i) => ({ baris: b.baris ?? 9 + i, id: b.id, jangkarAsing: null, nilai: b.nilai, galat: {} })) },
  pengadaan: kosong(), penerimaan: kosong(),
  penawaran: penawaran.length ? { ada: true, peta: null, baris: penawaran.map((b, i) => ({ baris: 9 + i, id: b.id, jangkarAsing: null, nilai: b.nilai, galat: {} })) } : kosong(),
})
const potret = (rencana: Record<string, Baris>, penawaran: Record<string, Baris> = {}): Potret => ({ rencana, pengadaan: {}, penerimaan: {}, penawaran })
const meta = (ids: number[], usulan: number[] = []): MetaPrima => ({
  rencana: Object.fromEntries(ids.map(id => [id, { label: `BBA-${id}`, versi: 1, terkunciUsulan: usulan.includes(id) }])), pengadaan: {}, penerimaan: {}, penawaran: {},
})
const baris = (o: Partial<Baris> = {}): Baris => ({ uraian: 'Laptop', harga: 1000, vol: 2, nilai: 2000, alasan: null, ...o })
const ringkasDari = (b: BacaanBerkas, asal: Potret, prima: Potret, m: MetaPrima, tambahan: Partial<RingkasMenunggu> = {}): RingkasMenunggu =>
  ({ revisi: 'rev1', peringatan: 0, tetap: {}, ...selisihDrive(b, asal, prima, m), ...tambahan })

{
  const asal = potret({ 1: baris(), 2: baris({ uraian: 'Kursi', harga: 500, vol: 1, nilai: 500 }) })
  const berkas = berkasDari([{ id: 1, nilai: baris({ harga: 1200, nilai: 2400 }) }, { id: 2, nilai: baris({ uraian: 'Kursi', harga: 700, vol: 1, nilai: 700 }) }])
  const primaSama = asal
  const r = ringkasDari(berkas, asal, primaSama, meta([1, 2]))
  ok('A1 ringkasan = sel yang diubah di Drive dibanding asal; kolom hitungan (Nilai) tidak ikut & tidak menahan', r.sel.length === 2 && r.sel.every(s => s.k === 'harga') && r.catatan === 0,
    JSON.stringify(r))
  const m1 = nilaiMenunggu(r, primaSama)
  ok('A2 PRIMA belum berubah → keduanya "usul", dengan teks tampil berpemisah', m1.length === 2 && m1.every(s => s.jenis === 'usul') && m1[0].teks.drive === '1.200', JSON.stringify(m1.map(s => [s.id, s.jenis, s.teks])))
  const primaB = potret({ 1: baris({ harga: 1200 }), 2: baris({ uraian: 'Kursi', harga: 800, vol: 1 }) })
  const m2 = nilaiMenunggu(r, primaB)
  ok('A3 dinilai terhadap PRIMA SEKARANG: nilai Drive sudah dipakai di web → hilang; PRIMA diubah ke nilai lain → benturan',
    m2.length === 1 && m2[0].id === 2 && m2[0].jenis === 'benturan' && m2[0].teks.prima === '800' && m2[0].teks.asal === '500', JSON.stringify(m2))
  const rPrimaSudahSama = ringkasDari(berkas, asal, primaB, meta([1, 2]))
  ok('A4 ringkasan TIDAK bergantung PRIMA saat disusun (nilai yang kebetulan sudah sama tetap dicatat) — PRIMA yang berubah lagi tetap tertangkap',
    rPrimaSudahSama.sel.length === 2 && nilaiMenunggu(rPrimaSudahSama, potret({ 1: baris({ harga: 900 }), 2: baris({ uraian: 'Kursi', harga: 700, vol: 1 }) })).some(s => s.id === 1 && s.jenis === 'benturan'))
  const rTetap = { ...r, tetap: { [kunciSel('rencana', 2, 'harga')]: 700 } }
  ok('A5 "tetap nilai PRIMA" untuk isi Drive yang sama → tidak menunggu lagi; untuk isi Drive LAIN → tetap ditanyakan',
    nilaiMenunggu(rTetap, primaB).length === 0 && nilaiMenunggu({ ...r, tetap: { [kunciSel('rencana', 2, 'harga')]: 650 } }, primaB).length === 1)
  ok('A6 lepas otomatis hanya bila tidak ada yang menunggu', bolehLepasOtomatis(rTetap, nilaiMenunggu(rTetap, primaB)) && !bolehLepasOtomatis(r, nilaiMenunggu(r, primaB)))
  const t = gabungTigaArah(berkas, asal, primaB, meta([1, 2]))
  const st = saringTetap(t, rTetap.tetap)
  ok('A7 tinjauan tidak menanyakan sel yang sudah "tetap" di web (dan menghitungnya)', st.diputuskan === 1 && !st.tinjauan.ubah.some(u => u.id === 2)
    && saringTetap(t, { [kunciSel('rencana', 2, 'harga')]: 650 }).diputuskan === 0)
  ok('A8 baris dihapus di PRIMA → tidak ditampilkan sebagai menunggu', nilaiMenunggu(r, potret({ 2: baris({ uraian: 'Kursi', harga: 500, vol: 1 }) })).every(s => s.id === 2))
}
{
  const asal = potret({ 1: baris() })
  const baru = berkasDari([{ id: 1, nilai: baris() }, { id: null, nilai: baris({ uraian: 'Lemari', harga: 250, vol: 3 }) }])
  const r = ringkasDari(baru, asal, asal, meta([1]))
  ok('A9 baris baru di Drive → menahan lepas otomatis (hanya bisa dilihat di tinjauan)', r.baru === 1 && !bolehLepasOtomatis(r, nilaiMenunggu(r, asal)))
  const hapus = ringkasDari(berkasDari([]), asal, asal, meta([1]))
  ok('A10 baris dihapus di Drive → catatan, menahan lepas otomatis', hapus.catatan === 1 && !bolehLepasOtomatis(hapus, []))
  ok('A11 kolom asing/ragu/lembar hilang (peringatan) dan ringkasan terpotong menahan lepas otomatis',
    !bolehLepasOtomatis({ ...ringkasDari(berkasDari([{ id: 1, nilai: baris() }]), asal, asal, meta([1])), peringatan: 1 }, [])
    && !bolehLepasOtomatis({ ...ringkasDari(berkasDari([{ id: 1, nilai: baris() }]), asal, asal, meta([1])), terpotong: true }, []))
  const usulan = ringkasDari(berkasDari([{ id: 1, nilai: baris({ uraian: 'Laptop lain', alasan: 'x' }) }]), asal, asal, meta([1], [1]))
  ok('A12 pagar gabung tiga arah ikut: uraian baris asal Usulan terkunci tidak masuk ringkasan, alasan ya', usulan.sel.length === 1 && usulan.sel[0].k === 'alasan' && usulan.catatan === 1)
  const banyak = potret(Object.fromEntries(Array.from({ length: MAKS_SEL_MENUNGGU + 5 }, (_, i) => [i + 1, baris()])))
  const rb = ringkasDari(berkasDari(Array.from({ length: MAKS_SEL_MENUNGGU + 5 }, (_, i) => ({ id: i + 1, nilai: baris({ harga: 9 }) }))), banyak, banyak, meta(Array.from({ length: MAKS_SEL_MENUNGGU + 5 }, (_, i) => i + 1)))
  ok('A13 batas sel ringkasan (satu baris app_config) → terpotong ditandai', rb.sel.length === MAKS_SEL_MENUNGGU && rb.terpotong)
  const panjang = ringkasDari(berkasDari([{ id: 1, nilai: baris({ alasan: 'x'.repeat(400) }) }]), asal, asal, meta([1]))
  ok('A14 teks panjang dipotong di ringkasan', String(panjang.sel[0].d).length === 150)
}

// ─── C. Statis: satu aturan, izin, jalur tulis ───────────────────────────────
console.log('\nC. Statis')
{
  const rute = tanpaKomentar(sumber('app/api/buku-besar-aset/drive-balik/route.ts'))
  ok('C1 "tetap" memakai izin lembar pemilik kolom (sama dengan Terapkan) dan dicatat di audit', /step === 'tetap'[\s\S]{0,700}if \(!bolehLembar\[l\]\)[\s\S]{0,500}tetapkanNilaiPrima\([\s\S]{0,400}writeAuditLog/.test(rute))
  const data = tanpaKomentar(sumber('lib/data/bba-drive-balik.ts'))
  ok('C2 ringkasan dikosongkan di SETIAP pelepasan tahanan (terapkan, abaikan, lepas otomatis)', (data.match(/tulisMenunggu\(tx, [\w.]+, null\)/g) ?? []).length === 3)
  ok('C3 pratinjau menyaring sel "tetap" — hanya untuk revisi yang sama dengan tahanan', /saringTetap\(gabungTigaArah\([^)]*\), ringkas\?\.revisi === b\.luar\.revisi \? ringkas\.tetap : undefined\)/.test(data))
  ok('C4 lepas otomatis memegang kunci pengirim dulu, lalu memeriksa revisi tahanan masih sama', /if \(!\(await kunciPengirim\(tx\)\)\) return false;[\s\S]{0,200}s0\.luar\.revisi !== ringkas!\.revisi/.test(data))
  ok('C5 lepas otomatis tidak jalan bila berkas disunting lagi sesudah ringkasan disusun (md5 kepala)', /if \(!s\.luar\.tertimpa && kepala\.md5 !== s\.luar\.md5\)/.test(data))
  const cron = tanpaKomentar(sumber('app/api/cron/bba-drive/route.ts'))
  ok('C6 cron menyusun ringkasan hanya untuk berkas yang ditahan, dan mengaudit pelepasan otomatis', /h\.ditahan\.length \? await segarkanMenunggu\(\)/.test(cron) && /DILEPAS OTOMATIS/.test(cron))
  const kotak = tanpaKomentar(sumber('app/(dashboard)/buku-besar-aset/_components/DriveMenunggu.tsx'))
  const modal = tanpaKomentar(sumber('app/(dashboard)/buku-besar-aset/_components/ModalItem.tsx'))
  const pakai = /const pakaiDrive = [\s\S]*?\n {2}\}\);/.exec(modal)?.[0] ?? ''
  ok('C7 "Pakai nilai Drive" hanya mengisi form (L78) — tidak ada pemanggilan server di dalamnya', !!pakai && /setIsian\(/.test(pakai) && !/fetch/.test(pakai))
  ok('C8 "Tetap" hanya tampil untuk pemegang izin lembar; "Pakai" ikut izin form', /const pakai = bolehPakai && bisaPakai\(s\)/.test(kotak) && /const bolehTetap = !!bolehLembar\[s\.l\]/.test(kotak))
  const pen = tanpaKomentar(sumber('app/(dashboard)/buku-besar-aset/penawaran/penawaran-client.tsx'))
  const kepalaLayar = /const KEPALA_SURAT = new Set\(\[([^\]]+)\]\)/.exec(pen)?.[1]
  const kepalaData = /const KOLOM_KEPALA = \[([^\]]+)\] as const/.exec(data)?.[1]
  const daftar = (x?: string) => (x ?? '').split(',').map(s => s.trim().replace(/'/g, '')).filter(Boolean).sort().join(',')
  ok('C9 kolom kepala surat di layar = KOLOM_KEPALA Drive balik (satu daftar)', !!kepalaLayar && daftar(kepalaLayar) === daftar(kepalaData), `${daftar(kepalaLayar)} vs ${daftar(kepalaData)}`)
}

// ─── D. MySQL + Drive tiruan ─────────────────────────────────────────────────
console.log('\nD. MySQL sungguhan + Drive tiruan berrevisi (kotak pasir 2064)')
let c: mysql.Connection | null = null
try {
  c = await mysql.createConnection({ host: process.env.MYSQL_HOST, port: Number(process.env.MYSQL_PORT || 3306), user: process.env.MYSQL_USER, password: process.env.MYSQL_PASSWORD, database: process.env.MYSQL_DATABASE })
} catch (e) { ok(`D0 MySQL bisa dihubungi (${(e as { code?: string }).code ?? e})`, false) }
if (c) {
  const k = c
  const T = 2064, KUNCI = `rencana:${T}`
  const CFG = ['bba_drive_status', 'drive_root', 'drive_subfolder_otomatis', `bba_drive_menunggu:${KUNCI}`]
  const [simpanan] = await k.query('SELECT `key`, value FROM app_config WHERE `key` IN (?)', [CFG]) as [Array<{ key: string; value: string }>, unknown]
  const [[potretAwal]] = await k.query('SELECT COALESCE(MAX(id), 0) AS m FROM bba_drive_potret') as [Array<{ m: number }>, unknown]
  const [[kunciAda]] = await k.query("SELECT COUNT(*) AS n FROM blud_locks WHERE entity = 'bba_drive_menunggu' AND key_id = ?", [KUNCI]) as [Array<{ n: number }>, unknown]
  const bersih = async () => {
    await k.query("DELETE FROM buku_besar_aset WHERE tahun_anggaran = ? AND uraian LIKE 'UJIM%'", [T])
    await k.query("DELETE FROM bba_penawaran WHERE rekanan LIKE 'UJIM%'")
    await k.query("DELETE FROM bba_barang WHERE nama LIKE 'UJIM%'")
    await k.query("DELETE FROM drive_arsip WHERE file_id LIKE 'UJIM%'")
    await k.query('DELETE FROM bba_drive_potret WHERE id > ?', [Number(potretAwal.m)])
    await k.query('DELETE FROM app_config WHERE `key` IN (?)', [CFG])
  }
  await bersih()
  for (const kr of ['GOOGLE_OAUTH_CLIENT_ID', 'GOOGLE_OAUTH_CLIENT_SECRET', 'GOOGLE_OAUTH_REFRESH_TOKEN']) process.env[kr] = process.env[kr] || 'x'

  type Rev = { id: string; md5: string; buf: Buffer; waktu: string; oleh: string; me: boolean }
  const berkas = new Map<string, { name: string; parents: string[]; folder: boolean; revs: Rev[] }>()
  let urut = 0, unduhRevisi = 0
  const md5 = (b: Buffer) => createHash('md5').update(b).digest('hex')
  const tambahRev = (id: string, buf: Buffer, oleh = 'monev', me = true) => { berkas.get(id)!.revs.push({ id: `rev${++urut}`, md5: md5(buf), buf, waktu: new Date(Date.UTC(2064, 0, 1) + urut * 60000).toISOString(), oleh, me }) }
  const isiAliran = async (s: NodeJS.ReadableStream) => { const xs: Buffer[] = []; for await (const ch of s) xs.push(Buffer.from(ch as Buffer)); return Buffer.concat(xs) }
  const metaBerkas = (id: string) => { const f = berkas.get(id)!; const h = f.revs[f.revs.length - 1]; return { id, name: f.name, parents: f.parents, trashed: false, md5Checksum: h?.md5, headRevisionId: h?.id, modifiedTime: h?.waktu, lastModifyingUser: { displayName: h?.oleh, me: h?.me }, size: String(h?.buf.length ?? 0) } }
  const tidakAda = () => Object.assign(new Error('File not found'), { code: 404 })
  let panggilUpdate: string[] = []
  const { google } = await import('googleapis')
  const asli = google.drive
  ;(google as unknown as { drive: unknown }).drive = () => ({
    files: {
      list: async (o: { q: string }) => {
        const nama = /name = '(.+?)'/.exec(o.q)?.[1], induk = /'(.+?)' in parents/.exec(o.q)?.[1]
        return { data: { files: [...berkas].filter(([, f]) => f.folder && f.name === nama && f.parents.includes(induk!)).map(([id, f]) => ({ id, name: f.name })) } }
      },
      create: async (o: { requestBody: { name: string; mimeType?: string; parents?: string[] }; media?: { body: NodeJS.ReadableStream } }) => {
        const id = `UJIM${String(++urut).padStart(8, '0')}`
        const folder = o.requestBody.mimeType === 'application/vnd.google-apps.folder'
        berkas.set(id, { name: o.requestBody.name, parents: o.requestBody.parents ?? [], folder, revs: [] })
        if (!folder) tambahRev(id, await isiAliran(o.media!.body))
        return { data: folder ? { id } : metaBerkas(id) }
      },
      update: async (o: { fileId: string; media: { body: NodeJS.ReadableStream } }) => {
        if (!berkas.has(o.fileId)) throw tidakAda()
        panggilUpdate.push(o.fileId)
        tambahRev(o.fileId, await isiAliran(o.media.body))
        return { data: metaBerkas(o.fileId) }
      },
      get: async (o: { fileId: string; alt?: string }) => {
        const f = berkas.get(o.fileId); if (!f) throw tidakAda()
        if (o.alt === 'media') unduhRevisi++
        return { data: o.alt === 'media' ? f.revs[f.revs.length - 1].buf : metaBerkas(o.fileId) }
      },
    },
    revisions: {
      list: async (o: { fileId: string }) => ({ data: { revisions: berkas.get(o.fileId)!.revs.map(r => ({ id: r.id, md5Checksum: r.md5, modifiedTime: r.waktu, lastModifyingUser: { displayName: r.oleh, me: r.me } })) } }),
      get: async (o: { fileId: string; revisionId: string }) => { unduhRevisi++; const r = berkas.get(o.fileId)?.revs.find(x => x.id === o.revisionId); if (!r) throw tidakAda(); return { data: r.buf } },
    },
  })
  const kolom = (ws: ExcelJS.Worksheet, judul: string) => { for (let cc = 1; cc <= 40; cc++) if (String(ws.getCell(7, cc).value ?? '') === judul) return cc; return -1 }
  const barisKode = (ws: ExcelJS.Worksheet, kode: string) => { for (let r = 8; r <= ws.rowCount; r++) if (String(ws.getCell(r, 2).value ?? '') === kode) return r; return -1 }
  const sunting = async (id: string, f: (wb: ExcelJS.Workbook) => void) => {
    const wb = new ExcelJS.Workbook(); const b = berkas.get(id)!
    await wb.xlsx.load(b.revs[b.revs.length - 1].buf as unknown as ArrayBuffer); f(wb)
    tambahRev(id, Buffer.from(await wb.xlsx.writeBuffer()), 'Pengguna A', false)
  }
  const berkasLaporan = () => [...berkas].find(([, f]) => f.name === `BBA ${T} — Rencana s.d. Pengadaan.xlsx`)?.[0]

  const B = await import('../lib/data/buku-besar-aset')
  const L = await import('../lib/data/bba-laporan')
  const D = await import('../lib/data/bba-drive-balik')
  const M = await import('../lib/data/bba-drive-menunggu')
  const W = await import('../lib/data/bba-penawaran')
  const Tj = await import('../lib/services/drive-tujuan')
  const [u] = await k.query('SELECT id FROM users ORDER BY id LIMIT 1') as [Array<{ id: number }>, unknown]
  const uid = Number(u[0].id)
  const status = async () => (await L.bacaStatusDrive()).berkas[KUNCI]
  const versi = async (id: number) => (await B.getAsetById(id))!.version
  const menunggu = async () => (await D.menungguPerBaris(T)).find(x => x.kunci === KUNCI)?.sel ?? []
  try {
    await Tj.aturFolderInduk('UJIMINDUK0000001')
    const r1 = await B.createAset({ tahun_anggaran: T, uraian: 'UJIM laptop', sumber_anggaran: 'BLUD', vol: 2, harga: 1000 }, uid)
    const r2 = await B.createAset({ tahun_anggaran: T, uraian: 'UJIM kursi', sumber_anggaran: 'BLUD', vol: 1, harga: 500 }, uid)
    const surat = await W.simpanPenawaran({ kepala: { rekanan: 'UJIM PT Satu', nomor_surat: 'S-1', tgl_surat: '2064-01-02' }, item: [{ nama_barang: 'UJIM meja', harga_satuan: 300 }] }, uid)
    await L.kirimLaporanKeDrive(true)
    const fid = berkasLaporan()!

    await sunting(fid, wb => {
      const ws = wb.getWorksheet('Rencana')!
      ws.getCell(barisKode(ws, r1.canonical_id), kolom(ws, 'Harga Satuan')).value = 1200
      ws.getCell(barisKode(ws, r2.canonical_id), kolom(ws, 'Harga Satuan')).value = 700
      const wp = wb.getWorksheet('Penawaran')!
      for (let r = 8; r <= wp.rowCount; r++) if (String(wp.getCell(r, kolom(wp, 'Nama Barang')).value) === 'UJIM meja') wp.getCell(r, kolom(wp, 'Harga Penawaran (Rp)')).value = 280
    })
    await B.updateAset({ id: r2.id, expected_version: await versi(r2.id), harga: 800 }, uid)
    const k1 = await L.kirimLaporanKeDrive(false)
    ok('D1 berkas ditahan; tanpa ringkasan cron, layar belum menampilkan apa pun (tidak menunggu Google)', k1.status === 'selesai' && k1.ditahan.length === 1 && (await menunggu()).length === 0)

    const s1 = await D.segarkanMenunggu()
    const m1 = await menunggu()
    const sel = (l: string, id: number) => m1.find(s => s.l === l && s.id === id && s.k === 'harga')
    const meja = (await W.listPenawaran('UJIM PT Satu'))[0].item[0]
    ok('D2 cron menyusun ringkasan: laptop "usul", kursi "benturan" (Drive 700, PRIMA 800, semula 500), harga meja di Penawaran "usul"',
      s1.some(x => x.kunci === KUNCI && !x.dilepas) && sel('rencana', r1.id)?.jenis === 'usul' && sel('rencana', r2.id)?.jenis === 'benturan'
      && sel('rencana', r2.id)?.teks.asal === '500' && sel('penawaran', meja.id)?.jenis === 'usul', JSON.stringify(m1.map(s => [s.l, s.id, s.k, s.jenis, s.teks])))
    const unduh1 = unduhRevisi
    await D.segarkanMenunggu()
    ok('D3 revisi yang sama tidak diunduh ulang tiap putaran cron', unduhRevisi === unduh1)

    await B.updateAset({ id: r1.id, expected_version: await versi(r1.id), harga: 1200 }, uid)
    ok('D4 "Pakai nilai Drive" lalu Simpan biasa → hilang dari daftar SEKETIKA (dinilai terhadap PRIMA sekarang, tanpa cron)', !(await menunggu()).some(s => s.id === r1.id && s.l === 'rencana'))

    const st = await status()
    const basi = await coba(() => D.tetapkanNilaiPrima(KUNCI, 'rev-lama', 'rencana', r2.id, 'harga'))
    ok('D5 "tetap" untuk revisi yang sudah lewat → PRATINJAU_BASI, tidak tertulis', basi instanceof D.TinjauanDriveError && basi.code === 'PRATINJAU_BASI')
    await D.tetapkanNilaiPrima(KUNCI, st!.luar!.revisi, 'rencana', r2.id, 'harga')
    const p = await D.pratinjauDriveBalik(KUNCI)
    ok('D6 "tetap nilai PRIMA": hilang dari daftar web DAN tinjauan tidak menanyakannya lagi (disebut "diputuskan di web")',
      !(await menunggu()).some(s => s.id === r2.id && s.l === 'rencana') && !p.tinjauan.ubah.some(x => x.lembar === 'rencana' && x.id === r2.id) && p.diputuskanWeb === 1,
      JSON.stringify([p.diputuskanWeb, p.tinjauan.ubah.map(x => [x.lembar, x.id])]))

    const s2 = await D.segarkanMenunggu()
    ok('D7 masih ada yang menunggu (harga meja) → tahanan TIDAK dilepas', s2.some(x => x.kunci === KUNCI && !x.dilepas) && !!(await status())?.luar)

    const sm = (await W.listPenawaran('UJIM PT Satu'))[0]
    await W.simpanPenawaran({ id: sm.id, expected_version: sm.version, kepala: { rekanan: sm.rekanan, nomor_surat: sm.nomor_surat, tgl_surat: sm.tgl_surat },
      item: sm.item.map(i => ({ id: i.id, nama_barang: i.nama_barang, harga_satuan: 280 })) }, uid)
    const s3 = await D.segarkanMenunggu()
    const st3 = await status()
    ok('D8 semua sudah diputuskan di web → tahanan DILEPAS sendiri, ringkasan dibuang, kiriman berikutnya segera',
      s3.some(x => x.kunci === KUNCI && x.dilepas) && !st3?.luar && !!st3?.kirim_segera && (await M.bacaMenunggu(KUNCI)) === null, JSON.stringify([s3, st3?.luar]))
    panggilUpdate = []
    await L.kirimLaporanKeDrive(false)
    const wbAkhir = new ExcelJS.Workbook(); await wbAkhir.xlsx.load(berkas.get(fid)!.revs.at(-1)!.buf as unknown as ArrayBuffer)
    const wsA = wbAkhir.getWorksheet('Rencana')!
    ok('D9 berkas Drive ditimpa hasil gabungan: laptop 1.200 (dari Drive), kursi 800 (tetap PRIMA)', panggilUpdate.includes(fid)
      && Number(wsA.getCell(barisKode(wsA, r1.canonical_id), kolom(wsA, 'Harga Satuan')).value) === 1200
      && Number(wsA.getCell(barisKode(wsA, r2.canonical_id), kolom(wsA, 'Harga Satuan')).value) === 800)

    // Baris baru di Drive hanya bisa dilihat di tinjauan → tidak pernah dilepas otomatis.
    await sunting(fid, wb => { const ws = wb.getWorksheet('Rencana')!; const n = ws.rowCount + 1; ws.getCell(n, kolom(ws, 'Uraian')).value = 'UJIM lemari'; ws.getCell(n, kolom(ws, 'Vol')).value = 1; ws.getCell(n, kolom(ws, 'Harga Satuan')).value = 90 })
    await L.kirimLaporanKeDrive(false)
    const s4 = await D.segarkanMenunggu()
    ok('D10 baris baru di Drive: tidak ada sel menunggu, tapi tahanan TIDAK dilepas otomatis', (await menunggu()).length === 0 && s4.some(x => x.kunci === KUNCI && !x.dilepas) && !!(await status())?.luar)
    const st4 = await status()
    await D.abaikanDriveBalik(KUNCI, st4!.luar!.revisi)
    ok('D11 abaikan membuang ringkasan berkas itu', (await M.bacaMenunggu(KUNCI)) === null)
    void surat
  } finally {
    ;(google as unknown as { drive: unknown }).drive = asli
    await bersih()
    for (const s of simpanan) await k.query('INSERT INTO app_config (`key`, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)', [s.key, s.value])
    if (Number(kunciAda.n) === 0) await k.query("DELETE FROM blud_locks WHERE entity = 'bba_drive_menunggu' AND key_id = ?", [KUNCI]) // L92: kunci uji ini saja
    const [[x]] = await k.query("SELECT COUNT(*) AS n FROM buku_besar_aset WHERE tahun_anggaran = ? AND uraian LIKE 'UJIM%'", [T]) as [Array<{ n: number }>, unknown]
    ok('D12 kotak pasir bersih, app_config dikembalikan', Number(x.n) === 0)
    await k.end()
  }
}

console.log(`\n${lulus} lulus, ${gagal.length} gagal`)
if (gagal.length) { console.log(gagal.map(g => `  - ${g}`).join('\n')); process.exit(1) }
process.exit(0)
