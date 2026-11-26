#!/usr/bin/env npx tsx
// scripts/test-bba-riwayat.mts — Tahap 3 & 4 revamp alur BBA: Pengadaan per tahap, Riwayat dan batalkan, hapus berantai
// (khusus Admin), pemakai barang di pesan hapus. Konsep: docs/konsep/bba/CONCEPT-bba-revamp-alur.md §3.3, §3.4, §5.
// Jalankan: npx tsx --env-file=.env.local scripts/test-bba-riwayat.mts
// Bagian D memakai MySQL sungguhan (kotak pasir 2068, data berawalan "UJIH"), dibersihkan otomatis. Tanpa MySQL = GAGAL.
import { readFileSync } from 'node:fs'
import mysql from 'mysql2/promise'
import { alasanTakBisaHapusBerantai } from '../lib/bba/koreksi'
import { HapusBerantaiSchema } from '../lib/data/bba-penerimaan-schemas'
import { tanggalHariIniWIB } from '../lib/shared/waktu-wib'

let lulus = 0
const gagal: string[] = []
function ok(nama: string, syarat: unknown, ket = '') {
  if (syarat) { lulus++; console.log(`  ok  ${nama}`) }
  else { gagal.push(nama); console.log(`FAIL  ${nama}${ket ? ' — ' + ket : ''}`) }
}
const sumber = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
const tanpaKomentar = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
const coba = async <T,>(f: () => Promise<T>): Promise<T | Error> => { try { return await f() } catch (e) { return e as Error } }
const badan = (isi: string, nama: string) => { const i = isi.indexOf(`export async function ${nama}(`); const j = isi.indexOf('\nexport ', i + 10); return isi.slice(i, j < 0 ? undefined : j) }

console.log('A. Aturan hapus berantai per register')
{
  const a = { nama: null, nama_resmi: 'LAPTOP', register: null, kode_barang: null, kunci_impor: null, status: 'AKTIF' as const, penerimaan_id: 9 }
  const kosong = { sasaran: [], gedung: [] }
  ok('A1 belum teregister, riwayat cuma TERIMA, tanpa rujukan → boleh', alasanTakBisaHapusBerantai(a, ['TERIMA'], kosong) === null)
  ok('A2 sudah bernomor provinsi → tolak, sebut "kosongkan registernya"', alasanTakBisaHapusBerantai({ ...a, kode_barang: '1.3.2', kunci_impor: 'x|1', register: '000001' }, ['TERIMA', 'REGISTER'], kosong)?.includes('kosongkan registernya') === true)
  ok('A3 sudah dicek/dipindah → tolak dan sebut olahannya', /dicek.*ruangan|ruangan.*dicek/.test(alasanTakBisaHapusBerantai(a, ['TERIMA', 'KONDISI', 'PINDAH'], kosong) ?? ''))
  ok('A4 sasaran rencana lain / gedung ruangan / dihapus SK → tolak', !!alasanTakBisaHapusBerantai(a, ['TERIMA'], { sasaran: ['BBA-000009'], gedung: [] })
    && !!alasanTakBisaHapusBerantai(a, ['TERIMA'], { sasaran: [], gedung: ['Bangsal'] }) && !!alasanTakBisaHapusBerantai({ ...a, status: 'DIHAPUS' }, ['TERIMA'], kosong))
  ok('A5 skema: alasan ≥ 10 huruf, kode wajib', !HapusBerantaiSchema.safeParse({ id: 1, expected_version: 0, kode: 'BBA-1', alasan: 'pendek' }).success
    && HapusBerantaiSchema.safeParse({ id: 1, expected_version: 0, kode: 'BBA-000001', alasan: 'data uji salah input' }).success)
}

console.log('\nC. Route & layar')
{
  const r = tanpaKomentar(sumber('app/api/buku-besar-aset/hapus-berantai/route.ts'))
  ok('C1 route hapus berantai: guard → izin Rencana → khusus Admin → batas laju → Zod; data layer memeriksa Admin juga', r.indexOf('await guard()') < r.indexOf("tolakKecualiEdit(g.session, 'rencana')")
    && r.indexOf("tolakKecualiEdit(g.session, 'rencana')") < r.indexOf('bolehBatalkanFinal(g.session.role)') && r.indexOf('bolehBatalkanFinal(g.session.role)') < r.indexOf('safeParse')
    && r.includes("eventType: 'BBA_RENCANA_HAPUS_BERANTAI'") && sumber('lib/security/retensi-audit.ts').includes('BBA_RENCANA_HAPUS_BERANTAI: P'))
  const d = tanpaKomentar(sumber('lib/data/bba-penerimaan.ts'))
  const b = badan(d, 'hapusBerantai')
  ok('C2 urutan kunci rencana → penerimaan → register; semua penolakan SEBELUM DELETE pertama; sasaran sendiri dilepas sebelum register dibuang',
    b.indexOf('kunciRencana(tx, input.id)') < b.indexOf('FROM bba_penerimaan WHERE rencana_id') && b.indexOf('FROM bba_penerimaan WHERE rencana_id') < b.indexOf('FROM bba_aset WHERE penerimaan_id IN')
    && b.indexOf('throw new HapusBerantaiError(alasan)') < b.indexOf('DELETE FROM') && b.indexOf('DELETE FROM bba_rencana_aset WHERE rencana_id') < b.indexOf('DELETE FROM bba_aset WHERE id IN')
    && b.includes("if (!bolehAdmin) throw new HapusBerantaiError("))
  const p = tanpaKomentar(sumber('app/(dashboard)/buku-besar-aset/pengadaan/pengadaan-client.tsx'))
  ok('C3 Pengadaan: tab per tahap (tahapRencana), tombol eksplisit, tanpa select status', sumber('lib/bba/tahap.ts').includes("siap: ['DIDANAI'], dipesan: ['DIPESAN'], sebagian: ['DITERIMA_SEBAGIAN'], selesai: ['DITERIMA_PENUH', 'TERCATAT'], batal: ['BATAL_DIBELI']")
    // Halaman server tidak boleh mengambil NILAI dari berkas 'use client' — di RSC itu hanya rujukan (ketahuan di peramban).
    && ['pengadaan/page.tsx', 'page.tsx'].every(f => !/import \w+, \{[^}]*\} from '\.\/[\w-]+-client'/.test(sumber(`app/(dashboard)/buku-besar-aset/${f}`)))
    && p.includes('>Tandai dipesan</PrimaButton>') && p.includes('>Catat barang datang</PrimaButton>') && p.includes('>Pesan lagi</PrimaButton>') && !p.includes('STATUS_PROSES'))
  const pan = tanpaKomentar(sumber('app/(dashboard)/buku-besar-aset/_components/PanelRiwayat.tsx'))
  ok('C4 panel Riwayat: tiap tombol memakai aturan lama yang sama dengan server', pan.includes('alasanTolakProses(item, \'DIRENCANAKAN\', penerimaan.length)')
    && pan.includes("alasanTakBisaUbahAnggaran(item.status, item.anggaran, 'BELUM')") && pan.includes('alasanTakBisaHapus(item.status, item.jumlah_bukti)')
    && pan.includes('alasanTakBisaBatalTempatkan(a)') && pan.includes("p.ditempatkan > 0 ? `Sudah jadi"))
  const aset = sumber('app/(dashboard)/buku-besar-aset/aset/aset-client.tsx')
  ok('C5 Buku Aset: antrean "Menunggu dicatat" di paling atas, tombol Catat di Buku Aset / Perbarui kondisi gedung', aset.indexOf('<PanelAntrean') < aset.indexOf('📚 Buku Aset')
    && sumber('app/(dashboard)/buku-besar-aset/_components/AksiTerima.tsx').includes('>Catat di Buku Aset</PrimaButton>') && sumber('app/(dashboard)/buku-besar-aset/_components/AksiTerima.tsx').includes('>Perbarui kondisi gedung</PrimaButton>'))
  ok('C6 hapus barang: pemakai disebut (≤ 5) dan dioper ke layar; layar menawarkan Gabungkan', sumber('lib/data/buku-besar-aset.ts').includes('ORDER BY tahun_anggaran DESC, canonical_id LIMIT 5')
    && sumber('app/api/buku-besar-aset/barang/route.ts').includes('pemakai: err.pemakai') && sumber('app/(dashboard)/buku-besar-aset/master/BarangPanel.tsx').includes('Gabungkan ke barang lain…'))
}

console.log('\nD. MySQL sungguhan (kotak pasir 2068)')
let c: mysql.Connection | null = null
try {
  c = await mysql.createConnection({ host: process.env.MYSQL_HOST, port: Number(process.env.MYSQL_PORT || 3306), user: process.env.MYSQL_USER, password: process.env.MYSQL_PASSWORD, database: process.env.MYSQL_DATABASE })
} catch (e) { ok(`D0 MySQL bisa dihubungi (${(e as { code?: string }).code ?? e})`, false) }
if (c) {
  const k = c
  const T = 2068
  const bersih = async () => {
    await k.query("DELETE ra FROM bba_rencana_aset ra JOIN buku_besar_aset b ON b.id = ra.rencana_id WHERE b.tahun_anggaran = ? AND b.uraian LIKE 'UJIH%'", [T])
    await k.query("DELETE a FROM bba_aset a JOIN bba_penerimaan p ON p.id = a.penerimaan_id JOIN buku_besar_aset b ON b.id = p.rencana_id WHERE b.tahun_anggaran = ? AND b.uraian LIKE 'UJIH%'", [T])
    await k.query("DELETE FROM bba_aset WHERE nama_resmi LIKE 'UJIH%'")
    await k.query("DELETE p FROM bba_penerimaan p JOIN buku_besar_aset b ON b.id = p.rencana_id WHERE b.tahun_anggaran = ? AND b.uraian LIKE 'UJIH%'", [T])
    await k.query("DELETE FROM buku_besar_aset WHERE tahun_anggaran IN (?, ?) AND uraian LIKE 'UJIH%'", [T, T + 1])
    await k.query("DELETE FROM bba_barang WHERE nama LIKE 'UJIH %'")
  }
  await bersih()
  const B = await import('../lib/data/buku-besar-aset')
  const P = await import('../lib/data/bba-penerimaan')
  const A = await import('../lib/data/bba-aset')
  const [u] = await k.query("SELECT id FROM users ORDER BY id LIMIT 1") as [Array<{ id: number }>, unknown]
  const userId = Number(u[0]?.id ?? 0)
  const versi = async (id: number) => (await B.getAsetById(id))!.version
  const ref3 = [1, 2, 3].map(i => ({ sumber: 'EKATALOG' as const, nama_penyedia: `PT ${i}`, url: `https://e-katalog.lkpp.go.id/${i}`, harga: 1_000_000, tgl_cek: '2026-01-01' }))
  let brgId = 0
  /** Rencana didanai → dipesan → diterima `vol` → (opsional) ditempatkan. */
  const siapkan = async (uraian: string, o: { vol?: number; tempatkan?: boolean; jenis?: 'PENAMBAHAN' | 'PENGGANTIAN'; sasaran?: number[] } = {}) => {
    const vol = o.vol ?? 2
    const r = await B.createAset({ tahun_anggaran: T, uraian, barang_id: brgId, jenis_rencana: o.jenis ?? 'PENAMBAHAN', sumber_anggaran: 'BLUD', vol, harga: 1_000_000, referensi: ref3, aset_sasaran: o.sasaran }, userId)
    await B.tandaiAnggaran({ item: [{ id: r.id, expected_version: await versi(r.id), anggaran: 'DIDANAI' }] }, userId)
    await B.ubahStatusProses({ id: r.id, expected_version: await versi(r.id), status: 'DIPROSES', tgl_proses: '2026-02-01' }, userId)
    await P.catatPenerimaan({ rencana_id: r.id, expected_version: await versi(r.id), tgl: '2026-03-01', vol, harga_satuan: 1_000_000 }, userId)
    const [pen] = await k.query('SELECT id FROM bba_penerimaan WHERE rencana_id = ?', [r.id]) as [Array<{ id: number }>, unknown]
    if (o.tempatkan !== false) await P.tempatkan({ penerimaan_id: pen[0].id, jumlah: vol, golongan: 'B', nama_resmi: 'UJIH LAPTOP', kondisi: 'B' }, userId)
    return { id: r.id, canonical_id: r.canonical_id, pen: pen[0].id }
  }
  const sisa = async (id: number) => {
    const [x] = await k.query(`SELECT (SELECT COUNT(*) FROM buku_besar_aset WHERE id = ?) AS r, (SELECT COUNT(*) FROM bba_penerimaan WHERE rencana_id = ?) AS p,
      (SELECT COUNT(*) FROM bba_aset a JOIN bba_penerimaan p ON p.id = a.penerimaan_id WHERE p.rencana_id = ?) AS a`, [id, id, id]) as [Array<{ r: number; p: number; a: number }>, unknown]
    return { r: Number(x[0].r), p: Number(x[0].p), a: Number(x[0].a) }
  }
  try {
    brgId = (await B.createBarang({ nama: 'UJIH Laptop' }, userId)).id
    const s1 = await siapkan('UJIH berhasil')
    const riw = await P.riwayatRencana(s1.id)
    ok('D1 riwayat: 2 register hasil Tempatkan + pembuat & pemberi dana tercatat', riw.register.length === 2 && !!riw.dibuat_pada && !!riw.anggaran_oleh)
    const salinan = await B.createAset({ tahun_anggaran: T + 1, uraian: 'UJIH salinan', sumber_anggaran: 'BLUD', vol: 1, harga: 1 }, userId)
    await k.query('UPDATE buku_besar_aset SET asal_rencana_id = ? WHERE id = ?', [s1.id, salinan.id])
    const nonAdmin = await coba(async () => P.hapusBerantai({ id: s1.id, expected_version: await versi(s1.id), kode: s1.canonical_id }, userId, false))
    const salahKode = await coba(async () => P.hapusBerantai({ id: s1.id, expected_version: await versi(s1.id), kode: 'BBA-999999' }, userId, true))
    const basi = await coba(async () => P.hapusBerantai({ id: s1.id, expected_version: (await versi(s1.id)) - 1, kode: s1.canonical_id }, userId, true))
    ok('D2 bukan Admin / kode salah / versi basi → ditolak, tidak ada yang terhapus', nonAdmin instanceof P.HapusBerantaiError && salahKode instanceof P.HapusBerantaiError
      && basi instanceof B.BbaVersionConflictError && JSON.stringify(await sisa(s1.id)) === JSON.stringify({ r: 1, p: 1, a: 2 }))
    const pot = await P.hapusBerantai({ id: s1.id, expected_version: await versi(s1.id), kode: s1.canonical_id.toLowerCase() }, userId, true)
    const [asal] = await k.query('SELECT asal_rencana_id FROM buku_besar_aset WHERE id = ?', [salinan.id]) as [Array<{ asal_rencana_id: number | null }>, unknown]
    const [refSisa] = await k.query('SELECT COUNT(*) AS n FROM bba_referensi_harga WHERE aset_id = ?', [s1.id]) as [Array<{ n: number }>, unknown]
    ok('D3 berhasil: item + penerimaan + 2 register + riwayatnya hilang dalam satu langkah; salinan tahun berikut dilepas; potret lengkap',
      JSON.stringify(await sisa(s1.id)) === JSON.stringify({ r: 0, p: 0, a: 0 }) && asal[0].asal_rencana_id === null && Number(refSisa[0].n) === 0
      && pot.register.length === 2 && pot.penerimaan.length === 1 && pot.referensi === 3 && pot.item.canonical_id === s1.canonical_id)

    const s2 = await siapkan('UJIH bernomor')
    const [r2] = await k.query('SELECT a.id, a.version FROM bba_aset a WHERE a.penerimaan_id = ? ORDER BY a.id LIMIT 1', [s2.pen]) as [Array<{ id: number; version: number }>, unknown]
    await P.isiRegister({ id: r2[0].id, expected_version: Number(r2[0].version), kode_barang: '1.3.2.10.02.01.001', register: '900001' } as never, userId)
    const t2 = await coba(async () => P.hapusBerantai({ id: s2.id, expected_version: await versi(s2.id), kode: s2.canonical_id }, userId, true))
    ok('D4 register sudah bernomor provinsi → ditolak dengan sebabnya, utuh', t2 instanceof P.HapusBerantaiError && /kosongkan registernya/.test(t2.message) && (await sisa(s2.id)).a === 2, t2 instanceof Error ? t2.message : '')

    const s3 = await siapkan('UJIH dicek')
    const [r3] = await k.query('SELECT id, version FROM bba_aset WHERE penerimaan_id = ? ORDER BY id LIMIT 1', [s3.pen]) as [Array<{ id: number; version: number }>, unknown]
    await A.catatKondisi({ tgl: tanggalHariIniWIB(), item: [{ id: r3[0].id, expected_version: Number(r3[0].version), kondisi: 'RR' }] }, userId)
    const t3 = await coba(async () => P.hapusBerantai({ id: s3.id, expected_version: await versi(s3.id), kode: s3.canonical_id }, userId, true))
    ok('D5 register sudah dicek kondisinya → ditolak', t3 instanceof P.HapusBerantaiError && (await sisa(s3.id)).r === 1, t3 instanceof Error ? t3.message : '')

    const s4 = await siapkan('UJIH pindahan', { tempatkan: false })
    await k.query('UPDATE bba_penerimaan SET pindahan = 1 WHERE id = ?', [s4.pen])
    const t4 = await coba(async () => P.hapusBerantai({ id: s4.id, expected_version: await versi(s4.id), kode: s4.canonical_id }, userId, true))
    ok('D6 penerimaan pindahan (data migrasi) → ditolak', t4 instanceof P.HapusBerantaiError && /migrasi/.test(t4.message) && (await sisa(s4.id)).p === 1)

    const s5 = await siapkan('UJIH jadi sasaran')
    const [r5] = await k.query('SELECT id FROM bba_aset WHERE penerimaan_id = ? ORDER BY id LIMIT 1', [s5.pen]) as [Array<{ id: number }>, unknown]
    await B.createAset({ tahun_anggaran: T, uraian: 'UJIH pengganti', barang_id: brgId, jenis_rencana: 'PENGGANTIAN', sumber_anggaran: 'BLUD', vol: 1, harga: 1, aset_sasaran: [r5[0].id] }, userId)
    const t5 = await coba(async () => P.hapusBerantai({ id: s5.id, expected_version: await versi(s5.id), kode: s5.canonical_id }, userId, true))
    ok('D7 register jadi aset sasaran rencana lain → ditolak', t5 instanceof P.HapusBerantaiError && /sasaran rencana/.test(t5.message))

    // Penggantian yang diterima penuh menandai aset lama "siap dihapus"; hapus berantai melepas tandanya.
    const lama = await siapkan('UJIH lama')
    const [rl] = await k.query('SELECT id FROM bba_aset WHERE penerimaan_id = ? ORDER BY id LIMIT 1', [lama.pen]) as [Array<{ id: number }>, unknown]
    const s6 = await siapkan('UJIH ganti', { vol: 1, jenis: 'PENGGANTIAN', sasaran: [rl[0].id], tempatkan: false })
    const [sd1] = await k.query('SELECT siap_dihapus FROM bba_aset WHERE id = ?', [rl[0].id]) as [Array<{ siap_dihapus: number }>, unknown]
    await P.hapusBerantai({ id: s6.id, expected_version: await versi(s6.id), kode: s6.canonical_id }, userId, true)
    const [sd2] = await k.query('SELECT siap_dihapus FROM bba_aset WHERE id = ?', [rl[0].id]) as [Array<{ siap_dihapus: number }>, unknown]
    ok('D8 penggantian diterima penuh: aset lama siap dihapus → tanda dilepas saat rencananya dihapus berantai', Number(sd1[0].siap_dihapus) === 1 && Number(sd2[0].siap_dihapus) === 0)

    // Balapan dengan Tempatkan: koneksi lain memegang kunci penerimaan+rencana (bentuk SELECT Tempatkan) lalu menambah register.
    const s7 = await siapkan('UJIH balapan', { tempatkan: false })
    const lain = await mysql.createConnection({ host: process.env.MYSQL_HOST, port: Number(process.env.MYSQL_PORT || 3306), user: process.env.MYSQL_USER, password: process.env.MYSQL_PASSWORD, database: process.env.MYSQL_DATABASE })
    await lain.query('START TRANSACTION')
    await lain.query('SELECT p.id FROM bba_penerimaan p JOIN buku_besar_aset b ON b.id = p.rencana_id WHERE p.id = ? FOR UPDATE', [s7.pen])
    const v7 = await versi(s7.id)
    const jalan = coba(() => P.hapusBerantai({ id: s7.id, expected_version: v7, kode: s7.canonical_id }, userId, true))
    let menunggu = 0
    for (let i = 0; i < 50 && !menunggu; i++) {
      await new Promise(r => setTimeout(r, 100))
      const [w] = await k.query('SELECT COUNT(*) AS n FROM performance_schema.data_lock_waits') as [Array<{ n: number }>, unknown]
      menunggu = Number(w[0].n)
    }
    await lain.query(`INSERT INTO bba_aset (golongan, tahun_perolehan, nama_resmi, penerimaan_id, kib, harga) VALUES ('B', 2026, 'UJIH LAPTOP', ?, '{}', 1000000)`, [s7.pen])
    const [ins] = await lain.query('SELECT LAST_INSERT_ID() AS id') as [Array<{ id: number }>, unknown]
    await lain.query("INSERT INTO bba_aset_riwayat (aset_id, jenis, sesudah) VALUES (?, 'TERIMA', '{}')", [ins[0].id])
    await lain.query('COMMIT')
    await lain.end()
    const h7 = await jalan
    ok('D9 balapan dengan Tempatkan: hapus berantai MENUNGGU, lalu membaca register yang baru lahir dan ikut membuangnya (tanpa register yatim)',
      menunggu > 0 && !(h7 instanceof Error) && h7.register.length === 1 && JSON.stringify(await sisa(s7.id)) === JSON.stringify({ r: 0, p: 0, a: 0 }), h7 instanceof Error ? h7.message : String(menunggu))

    const pakai = await coba(() => B.hapusBarang(brgId))
    ok('D10 hapus barang yang dipakai: pemakai (kode BBA) disebut, paling banyak 5 per jenis', pakai instanceof B.BbaBarangDipakaiError
      && pakai.pemakai.some(p => p.jenis === 'RENCANA' && p.kode.startsWith('BBA-')) && pakai.pemakai.filter(p => p.jenis === 'RENCANA').length <= 5 && pakai.pemakai.some(p => p.jenis === 'ASET'))
  } finally {
    await bersih()
    const [s] = await k.query("SELECT (SELECT COUNT(*) FROM buku_besar_aset WHERE tahun_anggaran IN (?, ?) AND uraian LIKE 'UJIH%') + (SELECT COUNT(*) FROM bba_aset WHERE nama_resmi LIKE 'UJIH%') + (SELECT COUNT(*) FROM bba_barang WHERE nama LIKE 'UJIH %') AS n", [T, T + 1]) as [Array<{ n: number }>, unknown]
    ok('D11 kotak pasir bersih', Number(s[0].n) === 0)
    await k.end()
  }
}

console.log(`\n${lulus} lulus, ${gagal.length} gagal`)
if (gagal.length) { console.log(gagal.map(g => `  - ${g}`).join('\n')); process.exit(1) }
process.exit(0)
