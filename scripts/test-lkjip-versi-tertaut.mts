// scripts/test-lkjip-versi-tertaut.mts — Simpan Versi → Pulihkan pada dokumen bertabel tertaut.
//
//   npx tsx scripts/test-lkjip-versi-tertaut.mts
//
// Pulihkan menghapus semua bab lalu menulis ulang blok dari foto JSON. Dua hal yang diuji:
//   A. resep `tautan` tabel ikut kembali utuh (Perbarui/Atur Bentuk tetap hidup), dan
//   B. GRAFIK yang mengambil data dari tabel tetap menunjuk tabelnya — dulu `tabelBlockId`
//      menunjuk id blok LAMA yang ikut terhapus, jadi grafiknya kehilangan sumber data.
// Bagian DB membuat satu dokumen tahun 2099 lewat fungsi asli lalu menghapusnya.

import { readFileSync } from 'node:fs'
import mysql from 'mysql2/promise'
import { TabelPayloadSchema } from '../lib/lkjip/schemas'

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
// Kolom JSON MySQL mengurutkan ulang kunci objek — bandingkan isinya, bukan urutan kuncinya.
const kanon = (v: unknown): unknown => Array.isArray(v) ? v.map(kanon)
  : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, kanon((v as Record<string, unknown>)[k])])) : v
const samaIsi = (a: unknown, b: unknown) => JSON.stringify(kanon(a)) === JSON.stringify(kanon(b))
function ok(nama: string, syarat: boolean, ket = '') {
  if (syarat) { lulus++; console.log(`  ok  ${nama}`) }
  else { gagal.push(nama); console.log(`FAIL  ${nama}${ket ? ' — ' + ket : ''}`) }
}

const V = await import('../lib/lkjip/versi')

console.log('\nA. Pemetaan rujukan grafik (murni)')
const snapTabel = { id: 101, tipe: 'TABEL' as const, urutan: 0, payload: {} }
const snapGrafik = { id: 102, tipe: 'GRAFIK' as const, urutan: 1, payload: { judul: 'G', tabelBlockId: 101 } }
const ubahBaru = V.petakanRujukanGrafik([
  { idBaru: 501, sidLama: 9, snap: snapTabel },
  { idBaru: 502, sidLama: 9, snap: snapGrafik },
], [])
ok('A1 foto ber-id: tabelBlockId 101 → 501', ubahBaru.length === 1 && ubahBaru[0].id === 502 && ubahBaru[0].payload.tabelBlockId === 501,
  JSON.stringify(ubahBaru))
ok('A2 isi payload lain tidak hilang', ubahBaru[0]?.payload.judul === 'G')
const tanpaId = (s: typeof snapTabel | typeof snapGrafik) => ({ ...s, id: undefined })
const ubahLama = V.petakanRujukanGrafik([
  { idBaru: 601, sidLama: 9, snap: tanpaId(snapTabel) },
  { idBaru: 602, sidLama: 9, snap: tanpaId(snapGrafik) },
], [{ id: 101, section_id: 9, urutan: 0, tipe: 'TABEL' }])
ok('A3 foto lama tanpa id: dipetakan lewat letak tabel (bab + urutan)', ubahLama[0]?.payload.tabelBlockId === 601, JSON.stringify(ubahLama))
const ubahHilang = V.petakanRujukanGrafik([{ idBaru: 702, sidLama: 9, snap: tanpaId(snapGrafik) }], [])
ok('A4 tabel tidak ditemukan → null, bukan id yang sudah tidak ada', ubahHilang[0]?.payload.tabelBlockId === null, JSON.stringify(ubahHilang))
ok('A5 grafik manual (tanpa tabelBlockId) tidak disentuh',
  V.petakanRujukanGrafik([{ idBaru: 802, sidLama: 9, snap: { id: 3, tipe: 'GRAFIK', urutan: 0, payload: { tabelBlockId: null } } }], []).length === 0)

console.log('\nB. Dokumen sungguhan (MySQL, tahun 2099)')
let c: mysql.Connection | null = null
try {
  c = await mysql.createConnection({
    host: process.env.MYSQL_HOST, port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER, password: process.env.MYSQL_PASSWORD, database: process.env.MYSQL_DATABASE,
  })
} catch (e) {
  console.log(`DILEWATI bagian DB: MySQL tidak bisa dihubungi (${(e as { code?: string }).code ?? e})`)
}

const JUDUL_UJI = 'UJI versi tertaut — dokumen sementara'
if (c) {
  const k = c
  const L = await import('../lib/lkjip/data')
  await k.query('DELETE FROM lkjip_dokumen WHERE judul = ?', [JUDUL_UJI])
  const [u] = await k.query('SELECT id FROM users ORDER BY id LIMIT 1') as [Array<{ id: number }>, unknown]
  const userId = Number(u[0]?.id ?? 0)
  const blokDok = async (dokId: number) => {
    const [r] = await k.query(`SELECT b.id, b.tipe, b.urutan, b.payload FROM lkjip_block b JOIN lkjip_section s ON s.id = b.section_id
      WHERE s.dokumen_id = ? ORDER BY b.id`, [dokId]) as [Array<{ id: number; tipe: string; urutan: number; payload: unknown }>, unknown]
    return r.map(b => ({ ...b, payload: (typeof b.payload === 'string' ? JSON.parse(b.payload) : b.payload) as Record<string, unknown> }))
  }
  try {
    const dokId = (await L.createDokumen(2099, JUDUL_UJI, userId, 'standar')).id
    const bab3 = (await L.getDokumenDetail(dokId))!.tree[2]
    const tautan = {
      sumber: 'kinerja-rekap', setelan: { tahun: 2099, sdBulan: 12, versi: 'berlaku', kedalaman: 'program' },
      kolom: [{ isi: { jenis: 'nomor' } }, { isi: { jenis: 'sumber', kunci: 'label' } }, { isi: { jenis: 'sumber', kunci: 'pagu' }, format: 'rp' }],
      kunciBaris: ['["T"]', '["P","Program A"]'], sembunyi: ['["P","Program B"]'], tebalInduk: true,
      ditarikPada: '2099-01-02 03:04', ringkas: 'E-Anggaran · Rekap uji', catatan: ['catatan uji'],
    }
    const tabel = {
      judul: 'Realisasi', kolom: ['No', 'Uraian', 'Pagu'], headerRows: 1,
      rows: [[{ v: 'No' }, { v: 'Uraian' }, { v: 'Pagu' }], [{ v: '1' }, { v: 'TOTAL' }, { v: '100', nf: 'rp' }], [{ v: '2' }, { v: 'Program A' }, { v: '60', nf: 'rp' }]],
      tautan,
    }
    const { id: tabelIdLama } = await L.addBlock(bab3.id, 'TABEL', tabel)
    const { id: grafikIdLama } = await L.addBlock(bab3.id, 'GRAFIK', { judul: 'Grafik uji', source: 'tabel', tabelBlockId: tabelIdLama, labelCol: 1, valueCol: 2 })

    const { id: versiId } = await V.saveVersi(dokId, 'sebelum lepas', userId)
    const [fotoBaris] = await k.query('SELECT snapshot FROM lkjip_versi WHERE id = ?', [versiId]) as [Array<{ snapshot: unknown }>, unknown]
    const foto = (typeof fotoBaris[0].snapshot === 'string' ? JSON.parse(fotoBaris[0].snapshot) : fotoBaris[0].snapshot) as { sections: Array<{ blocks: Array<{ id?: number }> }> }
    ok('B1 foto menyimpan id blok', foto.sections.flatMap(s => s.blocks).some(b => b.id === tabelIdLama))

    // Lepas Tautan = tabel yang sama tanpa resep.
    const lepas = { ...tabel, tautan: undefined }
    await L.updateBlock(tabelIdLama, lepas)
    ok('B2 sesudah Lepas Tautan resepnya memang hilang', !('tautan' in (await blokDok(dokId)).find(b => b.id === tabelIdLama)!.payload))

    await V.restoreVersi(versiId, dokId, (await L.getDokumen(dokId))!.version, userId)
    let blok = await blokDok(dokId)
    let tb = blok.find(b => b.tipe === 'TABEL')!
    let gr = blok.find(b => b.tipe === 'GRAFIK')!
    ok('B3 blok ditulis ulang ber-id baru', tb.id !== tabelIdLama && gr.id !== grafikIdLama, `${tb.id}/${gr.id}`)
    ok('B4 resep tautan kembali UTUH', samaIsi(tb.payload.tautan, TabelPayloadSchema.parse(tabel).tautan),
      JSON.stringify(tb.payload.tautan))
    const lewatSkema = TabelPayloadSchema.safeParse(tb.payload)
    ok('B5 payload pulihan lolos TabelPayloadSchema & resepnya tidak dibuang', lewatSkema.success && !!lewatSkema.data.tautan,
      lewatSkema.success ? '' : lewatSkema.error.message)
    ok('B6 grafik menunjuk tabel yang BARU', gr.payload.tabelBlockId === tb.id, `${gr.payload.tabelBlockId} vs ${tb.id}`)
    ok('B7 isi grafik lain utuh', gr.payload.judul === 'Grafik uji' && gr.payload.source === 'tabel' && gr.payload.valueCol === 2)

    // Foto lama (sebelum perbaikan) tidak memuat id blok — dipetakan lewat letak tabel sekarang.
    const versiBaru = await V.saveVersi(dokId, 'akan dibuat lama', userId)
    const [fb] = await k.query('SELECT snapshot FROM lkjip_versi WHERE id = ?', [versiBaru.id]) as [Array<{ snapshot: unknown }>, unknown]
    const fotoLama = (typeof fb[0].snapshot === 'string' ? JSON.parse(fb[0].snapshot) : fb[0].snapshot) as { sections: Array<{ blocks: Array<Record<string, unknown>> }> }
    for (const s of fotoLama.sections) for (const b of s.blocks) delete b.id
    await k.query('UPDATE lkjip_versi SET snapshot = ? WHERE id = ?', [JSON.stringify(fotoLama), versiBaru.id])
    await V.restoreVersi(versiBaru.id, dokId, (await L.getDokumen(dokId))!.version, userId)
    blok = await blokDok(dokId)
    tb = blok.find(b => b.tipe === 'TABEL')!
    gr = blok.find(b => b.tipe === 'GRAFIK')!
    ok('B8 foto lama: grafik tetap menemukan tabelnya lewat letak', gr.payload.tabelBlockId === tb.id, `${gr.payload.tabelBlockId} vs ${tb.id}`)
    ok('B9 foto lama: resep tautan tetap utuh', samaIsi(tb.payload.tautan, TabelPayloadSchema.parse(tabel).tautan))
  } finally {
    await k.query('DELETE FROM lkjip_dokumen WHERE judul = ?', [JUDUL_UJI])
  }
  const [sisa] = await k.query('SELECT COUNT(*) AS n FROM lkjip_dokumen WHERE judul = ?', [JUDUL_UJI]) as [Array<{ n: number }>, unknown]
  ok('B10 data uji dibersihkan (dokumen + versi ikut CASCADE)', Number(sisa[0].n) === 0)
  await k.end()
}

console.log(`\n${lulus} lulus, ${gagal.length} gagal`)
if (gagal.length) { console.log('GAGAL: ' + gagal.join(', ')); process.exit(1) }
process.exit(0)
