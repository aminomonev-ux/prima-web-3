// scripts/test-lkjip-bab-wajib.mts — regresi aturan BAB LKJIP (audit B12)
//
//   npx tsx scripts/test-lkjip-bab-wajib.mts
//
// Dulu "BAB I–IV terkunci" hanya ada di panduan editor: seed menulis locked = 0, dan
// hapus/pindah tidak memeriksa apa pun — "Hapus" pada BAB III membuang 5 sub-bab beserta
// isinya, "Jadikan sub-bab" pada BAB II menjadikannya 1.7. Keputusan pemilik aplikasi:
//   · 4 BAB wajib tidak bisa Naik/Turun/dijadikan sub-bab; judulnya boleh diubah;
//   · bab tambahan selalu sesudah BAB wajib terakhir; sub-bab bebas;
//   · bagian yang masih punya sub-bagian tidak bisa dihapus (semua tingkat).
//
// Bagian DB membuat satu dokumen tahun 2099 lewat `createDokumen` asli lalu menghapusnya.

import { readFileSync } from 'node:fs'
import mysql from 'mysql2/promise'
import {
  putusanPindah, putusanHapus, babTambahanDiDepan, judulBabWajib, ALASAN_BAB, type BagianRingkas,
} from '../lib/lkjip/aturan-bab'

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
function cek(nama: string, syarat: boolean) {
  if (syarat) lulus++
  else gagal.push(nama)
}
function sama(nama: string, dapat: unknown, harap: unknown) {
  cek(`${nama} — dapat ${JSON.stringify(dapat)}, harap ${JSON.stringify(harap)}`, dapat === harap)
}
const baca = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
const kode = (p: string) => baca(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
function badan(isi: string, awal: string): string {
  const i = isi.indexOf(awal)
  if (i < 0) return ''
  const sisa = isi.slice(i + awal.length)
  const j = sisa.search(/\n(export |async function |function )/)
  return awal + (j < 0 ? sisa : sisa.slice(0, j))
}

// Dokumen standar: 4 BAB wajib (10..13) + LAMPIRAN (14) + sub-bab tiap BAB.
const bab = (id: number, urutan: number, locked: number): BagianRingkas => ({ id, parent_id: null, urutan, locked })
const sub = (id: number, parent: number, urutan: number): BagianRingkas => ({ id, parent_id: parent, urutan, locked: 0 })
const STANDAR: BagianRingkas[] = [
  bab(10, 0, 1), bab(11, 1, 1), bab(12, 2, 1), bab(13, 3, 1), bab(14, 4, 0), bab(15, 5, 0),
  sub(20, 10, 0), sub(21, 10, 1), sub(22, 11, 0), sub(23, 13, 0), sub(24, 13, 1),
]
const boleh = (p: ReturnType<typeof putusanPindah>) => p.boleh
const alasan = (p: ReturnType<typeof putusanPindah>) => (p.boleh ? '' : p.alasan)

// ── A. Aturan pindah ─────────────────────────────────────────────────────────
sama('A1 BAB wajib tidak bisa Naik', alasan(putusanPindah(STANDAR, 11, null, 0)), ALASAN_BAB.wajibDipindah)
sama('A2 BAB wajib tidak bisa Turun', alasan(putusanPindah(STANDAR, 11, null, 2)), ALASAN_BAB.wajibDipindah)
sama('A3 BAB wajib tidak bisa dijadikan sub-bab', alasan(putusanPindah(STANDAR, 11, 10, 2)), ALASAN_BAB.wajibDipindah)
sama('A4 bab tambahan tidak bisa naik melewati BAB IV', alasan(putusanPindah(STANDAR, 14, null, 3)), ALASAN_BAB.babDiDepanWajib)
cek('A5 bab tambahan bebas di antara sesamanya (Turun)', boleh(putusanPindah(STANDAR, 14, null, 5)))
cek('A6 bab tambahan bebas di antara sesamanya (Naik ke sesudah BAB IV)', boleh(putusanPindah(STANDAR, 15, null, 4)))
cek('A7 sub-bab bebas pindah antar-BAB', boleh(putusanPindah(STANDAR, 20, 12, 0)))
cek('A8 sub-bab bebas Naik/Turun', boleh(putusanPindah(STANDAR, 21, 10, 0)))
cek('A9 bab tambahan boleh dijadikan sub-bab BAB wajib', boleh(putusanPindah(STANDAR, 14, 13, 2)))
sama('A10 "Jadikan bab" dari sub-bab BAB II ditolak (jatuh di antara BAB II & III)',
  alasan(putusanPindah(STANDAR, 22, null, 2)), ALASAN_BAB.babDiDepanWajib)
cek('A11 "Jadikan bab" dari sub-bab BAB IV boleh (jatuh sesudah BAB IV)', boleh(putusanPindah(STANDAR, 23, null, 4)))
// Dokumen lama yang sudah punya bab tambahan di DEPAN: boleh dirapikan selangkah demi selangkah.
const LAMA: BagianRingkas[] = [bab(30, 0, 0), bab(31, 1, 1), bab(32, 2, 1), bab(33, 3, 1), bab(34, 4, 1), bab(35, 5, 0)]
sama('A12 hitungan bab tambahan di depan (dok. lama)', babTambahanDiDepan([...LAMA].sort((a, b) => a.urutan - b.urutan)), 1)
cek('A13 dok. lama: bab depan boleh Turun selangkah', boleh(putusanPindah(LAMA, 30, null, 1)))
cek('A14 dok. lama: bab depan boleh langsung ke sesudah BAB wajib', boleh(putusanPindah(LAMA, 30, null, 5)))
sama('A15 dok. lama: bab tambahan lain tetap tidak boleh menyusul ke depan',
  alasan(putusanPindah(LAMA, 35, null, 0)), ALASAN_BAB.babDiDepanWajib)
const KOSONG: BagianRingkas[] = [bab(40, 0, 0), bab(41, 1, 0), bab(42, 2, 0)]
cek('A16 dokumen tanpa BAB wajib: bebas', boleh(putusanPindah(KOSONG, 42, null, 0)))

// ── B. Aturan hapus ──────────────────────────────────────────────────────────
sama('B1 bab dengan sub-bagian tidak bisa dihapus', (p => (p.boleh ? '' : p.alasan))(putusanHapus(STANDAR, 10)), ALASAN_BAB.masihPunyaSub(2))
cek('B2 sub-bab tanpa anak boleh dihapus', putusanHapus(STANDAR, 20).boleh)
cek('B3 BAB wajib tanpa sub-bagian boleh dihapus (aturan pemilik: anak, bukan gembok)', putusanHapus(STANDAR, 12).boleh)
cek('B4 aturan berlaku di semua tingkat (sub-bab ber-anak ditolak)', !putusanHapus([...STANDAR, sub(50, 20, 0)], 20).boleh)

// ── C. Judul BAB wajib ───────────────────────────────────────────────────────
cek('C1 judul wajib dikenali tanpa beda huruf & spasi tepi', judulBabWajib('  Perencanaan Kinerja '))
cek('C2 judul yang diganti tidak ditebak', !judulBabWajib('PENDAHULUAN (REVISI)'))

// ── D. Sumber ────────────────────────────────────────────────────────────────
const DATA = kode('lib/lkjip/data.ts')
cek('D1 seed menulis BAB wajib terkunci', DATA.includes('VALUES (${id}, NULL, 0, ${bi}, ${bab.judul}, 1)'))
const HAPUS = badan(DATA, 'export async function deleteSection(')
// L82c: dikutip sampai backtick penutup — `WHERE id = ${id} OR parent_id = …` tidak boleh ikut cocok.
cek('D2 hapus: tidak lagi menghapus seluruh cabang', !HAPUS.includes('collectSubtree') && HAPUS.includes('await tx`DELETE FROM lkjip_section WHERE id = ${id}`;'))
cek('D3 hapus: anak dihitung di transaksi yang sama, sebelum DELETE',
  HAPUS.indexOf('if (n > 0) throw new LkjipAturanBabError(ALASAN_BAB.masihPunyaSub(n));') > 0
  && HAPUS.indexOf('if (n > 0) throw new LkjipAturanBabError(ALASAN_BAB.masihPunyaSub(n));') < HAPUS.indexOf('DELETE FROM lkjip_section'))
const PINDAH = badan(DATA, 'export async function moveSection(')
cek('D4 pindah: aturan BAB dinilai sesudah kunci dokumen',
  PINDAH.indexOf('await kunciDokumenDraft(tx, Number(node.dokumen_id));') > 0
  && PINDAH.indexOf('await kunciDokumenDraft(tx, Number(node.dokumen_id));') < PINDAH.indexOf('const putusan = putusanPindah(norm, input.id, input.new_parent_id ?? null, input.new_index);'))
cek('D5 pindah: putusan ditegakkan', PINDAH.includes('if (!putusan.boleh) throw new LkjipAturanBabError(putusan.alasan);'))
cek('D6 route: pelanggaran aturan BAB → 409',
  kode('app/api/lkjip/section/route.ts').includes('if (err instanceof LkjipAturanBabError) return NextResponse.json({ ok: false, msg: err.message }, { status: 409 });'))
cek('D7 pulihkan versi mengenali BAB wajib di foto lama',
  kode('lib/lkjip/versi.ts').includes('const locked = s.locked || (s.parent_old_id == null && judulBabWajib(s.judul)) ? 1 : 0;'))
const EDITOR = kode('app/(dashboard)/lkjip/[id]/editor-client.tsx')
cek('D8 editor menilai pindah dengan fungsi yang sama', EDITOR.includes('t ? putusanPindah(bagian, f.node.id, t.parent, t.index) : null;'))
cek('D9 editor mengirim pindah dari tujuan yang sama', EDITOR.includes('function pindahKe(f: FlatNode, t: Tujuan | null) { if (t) void move(f.node.id, t.parent, t.index); }'))
cek('D10 Hapus mati beserta alasannya',
  EDITOR.includes("danger: true, disabled: !pHapus.boleh, alasan: pHapus.boleh ? undefined : pHapus.alasan,"))
cek('D11 alasan tampil sebagai tooltip', EDITOR.includes('data-tooltip={it.disabled ? it.alasan : undefined}'))
cek('D12 tombol mati tidak meredupkan tooltip-nya', !EDITOR.includes('.lk-rowmenu-item.disabled { opacity'))
cek('D13 ikon gembok di BAB wajib', EDITOR.includes('{f.node.locked ? ('))
cek('D14 dialog hapus menyebut isi yang ikut terhapus', EDITOR.includes('${ringkasIsi(f.node.blocks)}'))
cek('D15 panduan tak lagi menjanjikan "tidak bisa dihapus" untuk BAB wajib', !EDITOR.includes('tidak bisa dihapus atau dipindah'))

// ── E. Basis data sungguhan ─────────────────────────────────────────────────
let c: mysql.Connection | null = null
try {
  c = await mysql.createConnection({
    host: process.env.MYSQL_HOST || 'localhost', port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER, password: process.env.MYSQL_PASSWORD, database: process.env.MYSQL_DATABASE,
    timezone: '+07:00',
  })
} catch (e) {
  console.log(`DILEWATI bagian DB: MySQL tidak bisa dihubungi (${(e as { code?: string }).code ?? e})`)
}

const JUDUL_UJI = 'UJI B12 — dokumen sementara'
if (c) {
  const k = c
  const L = await import('../lib/lkjip/data')
  const V = await import('../lib/lkjip/versi')
  await k.query('DELETE FROM lkjip_dokumen WHERE judul = ?', [JUDUL_UJI])
  const [u] = await k.query('SELECT id FROM users ORDER BY id LIMIT 1') as [Array<{ id: number }>, unknown]
  const userId = Number(u[0]?.id ?? 0)
  let dokId = 0
  try {
    dokId = (await L.createDokumen(2099, JUDUL_UJI, userId, 'standar')).id
    const akar = async () => (await L.getDokumenDetail(dokId))!.tree
    const galatDari = async (fn: () => Promise<unknown>) => {
      try { await fn(); return '' } catch (e) { return e instanceof L.LkjipAturanBabError ? `ATURAN: ${e.message}` : String(e) }
    }
    let pohon = await akar()
    sama('E1 dokumen baru: 4 BAB', pohon.length, 4)
    cek('E2 dokumen baru: keempatnya terkunci', pohon.every(n => n.locked === 1))
    const [b1, b2, b3, b4] = pohon

    sama('E3 hapus BAB III yang punya 5 sub-bab ditolak', await galatDari(() => L.deleteSection(b3.id)), `ATURAN: ${ALASAN_BAB.masihPunyaSub(5)}`)
    pohon = await akar()
    sama('E4 BAB III & sub-babnya utuh', pohon[2]?.children.length, 5)

    const daun = b4.children[1]
    await L.addBlock(daun.id, 'NARASI', { html: '<p>uji</p>' })
    sama('E5 hapus sub-bab tanpa anak berhasil', await galatDari(() => L.deleteSection(daun.id)), '')
    const [blokSisa] = await k.query('SELECT COUNT(*) AS n FROM lkjip_block WHERE section_id = ?', [daun.id]) as [Array<{ n: number }>, unknown]
    sama('E6 blok bagian yang dihapus ikut terhapus', Number(blokSisa[0].n), 0)

    sama('E7 Naik BAB II ditolak', await galatDari(() => L.moveSection({ id: b2.id, new_parent_id: null, new_index: 0 })), `ATURAN: ${ALASAN_BAB.wajibDipindah}`)
    sama('E8 Jadikan sub-bab BAB II ditolak', await galatDari(() => L.moveSection({ id: b2.id, new_parent_id: b1.id, new_index: 6 })), `ATURAN: ${ALASAN_BAB.wajibDipindah}`)
    pohon = await akar()
    sama('E9 urutan BAB tidak berubah', pohon.map(n => n.id).join(','), [b1.id, b2.id, b3.id, b4.id].join(','))

    const { id: lampiran } = await L.addSection({ dokumen_id: dokId, parent_id: null, judul: 'LAMPIRAN' })
    pohon = await akar()
    sama('E10 bab baru jatuh sesudah BAB IV', pohon[4]?.id, lampiran)
    sama('E11 bab tambahan tidak bisa naik melewati BAB IV',
      await galatDari(() => L.moveSection({ id: lampiran, new_parent_id: null, new_index: 3 })), `ATURAN: ${ALASAN_BAB.babDiDepanWajib}`)
    const subBab2 = b2.children[0]
    sama('E12 "Jadikan bab" dari sub-bab BAB II ditolak',
      await galatDari(() => L.moveSection({ id: subBab2.id, new_parent_id: null, new_index: 2 })), `ATURAN: ${ALASAN_BAB.babDiDepanWajib}`)
    sama('E13 sub-bab bebas Naik', await galatDari(() => L.moveSection({ id: b1.children[1].id, new_parent_id: b1.id, new_index: 0 })), '')
    sama('E14 "Jadikan bab" dari sub-bab BAB IV boleh (sesudah BAB IV)',
      await galatDari(() => L.moveSection({ id: b4.children[0].id, new_parent_id: null, new_index: 4 })), '')
    pohon = await akar()
    sama('E15 BAB I–IV tetap di depan', pohon.slice(0, 4).map(n => n.id).join(','), [b1.id, b2.id, b3.id, b4.id].join(','))

    // Foto yang diambil sebelum migrasi (semua locked = 0) tidak boleh melepas kuncinya.
    await k.query('UPDATE lkjip_section SET locked = 0 WHERE dokumen_id = ? AND parent_id IS NULL', [dokId])
    await L.renameSection(b1.id, 'PENDAHULUAN (REVISI)')
    const { id: versiId } = await V.saveVersi(dokId, 'uji', userId)
    const versiDok = (await L.getDokumen(dokId))!.version
    await V.restoreVersi(versiId, dokId, versiDok, userId)
    pohon = await akar()
    const kunci = Object.fromEntries(pohon.map(n => [n.judul, n.locked]))
    sama('E16 pulihkan: BAB wajib berjudul baku terkunci lagi', kunci['PERENCANAAN KINERJA'], 1)
    sama('E17 pulihkan: BAB IV terkunci lagi', kunci['PENUTUP'], 1)
    sama('E18 pulihkan: judul yang diganti tidak ditebak', kunci['PENDAHULUAN (REVISI)'], 0)
    sama('E19 pulihkan: bab tambahan tetap tidak terkunci', kunci['LAMPIRAN'], 0)
  } finally {
    await k.query('DELETE FROM lkjip_dokumen WHERE judul = ?', [JUDUL_UJI])
  }
  const [sisa] = await k.query('SELECT COUNT(*) AS n FROM lkjip_dokumen WHERE judul = ?', [JUDUL_UJI]) as [Array<{ n: number }>, unknown]
  sama('E20 data uji dibersihkan', Number(sisa[0].n), 0)
  await k.end()
}

console.log(`\n${lulus} lulus, ${gagal.length} gagal`)
for (const g of gagal) console.log('  GAGAL ' + g)
process.exit(gagal.length ? 1 : 0)
