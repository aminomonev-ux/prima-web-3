// Uji "Simpan yang isinya sama tidak menulis apa pun" + "jebakan arsip" BLUD.
//   npx tsx scripts/test-blud-simpan-identik.mts
//
// Bagian A–D menguji PERILAKU fungsi murni lib/blud/isi-sama.ts. Bagian E memeriksa
// sambungannya di server, route, dan KEDUA layar (L69) — komentar dibuang dulu supaya
// prosa yang menjelaskan cacat lama tidak ikut cocok. Jalur transaksinya diuji di MySQL
// sungguhan oleh scripts/test-blud-simpan-identik-db.mjs.
// Konsep: docs/CONCEPT-blud-simpan-identik.md

import { readFileSync } from 'node:fs'
import { isiDpaSama, isiPergeseranSama, jebakanArsip, kalimatTidakBerubah } from '../lib/blud/isi-sama'

let lulus = 0
const gagal: string[] = []
function ok(nama: string, syarat: boolean, ket = '') {
  if (syarat) { lulus++; console.log(`  ok  ${nama}`) }
  else { gagal.push(nama); console.log(`FAIL  ${nama}${ket ? ' — ' + ket : ''}`) }
}
const kode = (p: string) => readFileSync(p, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '').replace(/\{\s*\}/g, '{}')
/** Badan blok pertama sesudah `penanda`, dari `{` sampai pasangannya. */
function badan(src: string, penanda: string): string {
  const i = src.indexOf(penanda)
  if (i < 0) return ''
  const buka = src.indexOf('{', i + penanda.length)
  let dalam = 0
  for (let j = buka; j >= 0 && j < src.length; j++) {
    if (src[j] === '{') dalam++
    else if (src[j] === '}' && --dalam === 0) return src.slice(buka, j + 1)
  }
  return ''
}
function urut(teks: string, ...potongan: string[]): boolean {
  let pos = -1
  for (const p of potongan) { pos = teks.indexOf(p, pos + 1); if (pos < 0) return false }
  return true
}

const d = (row_id: string, lain: Record<string, unknown> = {}) => ({
  row_id, parent_id: row_id === 'I' ? null : 'I', tipe_baris: row_id === 'I' ? 'MASTER' : 'CHILD', urutan: row_id === 'I' ? 0 : 1,
  kode_rekening: `5.${row_id}`, uraian: `Rek ${row_id}`, vol: row_id === 'I' ? null : 1, satuan: row_id === 'I' ? null : 'paket',
  harga: row_id === 'I' ? null : 1000, jumlah: 1000, penanggung_jawab: null, keterangan: null, anggaran_key: `AK-${row_id}`,
  origin: 'MANUAL', usulan_item_id: null, usulan_no: null, ...lain,
})

console.log('\n── A. isiDpaSama ────────────────────────────────────────────────')
{
  const a = [d('I'), d('A')]
  ok('A1 identik → sama', isiDpaSama(a, a.map(x => ({ ...x }))))
  ok('A2 DECIMAL string dari DB = angka layar', isiDpaSama(a, [d('I', { jumlah: '1000.00' }), d('A', { vol: '1.0000', harga: '1000.00', jumlah: '1000.00' })]))
  ok('A3 teks NULL = teks kosong', isiDpaSama([d('A', { keterangan: '' })], [d('A', { keterangan: null })]))
  ok('A4 vol NULL ≠ vol 0', !isiDpaSama([d('A', { vol: 0 })], [d('A', { vol: null })]))
  ok('A5 satu angka beda → beda', !isiDpaSama([d('A', { jumlah: 1001 })], [d('A')]))
  ok('A6 4 desimal vol ikut dinilai', !isiDpaSama([d('A', { vol: 1.0001 })], [d('A')]))
  ok('A7 uraian beda → beda', !isiDpaSama([d('A', { uraian: 'Rek A ' })], [d('A')]))
  ok('A8 urutan daftar beda, kolom urutan sama → sama', isiDpaSama([d('A'), d('I')], [d('I'), d('A')]))
  ok('A9 kolom urutan beda → beda', !isiDpaSama([d('A', { urutan: 2 })], [d('A')]))
  ok('A10 origin kosong = MANUAL (server menulis `?? MANUAL`)', isiDpaSama([d('A', { origin: undefined })], [d('A')]))
  ok('A11 baris tanpa jangkar ≠ baris berjangkar', !isiDpaSama([d('A', { anggaran_key: null })], [d('A')]))
  ok('A12 baris bertambah → beda', !isiDpaSama([d('I'), d('A'), d('B')], [d('I'), d('A')]))
  // Baris yang hilang SENGAJA yang terurut paling akhir ('Z'): kalau di tengah, perbandingan
  // per indeks sudah berbeda dengan sendirinya dan pemeriksaan panjang tidak pernah teruji.
  ok('A12b baris berkurang → beda', !isiDpaSama([d('A'), d('B')], [d('A'), d('B'), d('Z')]))
  ok('A13 PJ beda → beda', !isiDpaSama([d('A', { penanggung_jawab: 'Kasi' })], [d('A')]))
  ok('A14 jejak usulan beda → beda', !isiDpaSama([d('A', { origin: 'USULAN', usulan_item_id: 7 })], [d('A')]))
  ok('A15 parent beda → beda', !isiDpaSama([d('A', { parent_id: 'X' })], [d('A')]))
  ok('A16 kolom Sebelum (milik server) tidak dinilai', isiDpaSama([{ ...d('A'), jumlah_sebelum: 5 } as ReturnType<typeof d>], [d('A')]))
}

console.log('\n── B. isiPergeseranSama ─────────────────────────────────────────')
{
  const p = (lain: Record<string, unknown> = {}) => ({ ...d('A'), vol_p: 1, harga_p: 900, pergeseran: 900, bertambah_berkurang: -100, bertambah: null, berkurang: null, ...lain })
  const m = [{ dari_row: 'A', ke_row: 'B', nilai: 100, keterangan: 'x' }]
  const simpan = { rows: [p()], acuan: '2099-01-10', mutasi: m }
  ok('B1 identik (baris + acuan + catatan) → sama', isiPergeseranSama({ rows: [p()], acuan: '2099-01-10', mutasi: m.map(x => ({ ...x })) }, simpan))
  ok('B2 acuan DPA beda → beda', !isiPergeseranSama({ rows: [p()], acuan: '2099-02-01', mutasi: m }, simpan))
  ok('B3 kolom P beda → beda', !isiPergeseranSama({ rows: [p({ harga_p: 901, pergeseran: 901 })], acuan: '2099-01-10', mutasi: m }, simpan))
  ok('B4 uraian geser NULL ≠ 0', !isiPergeseranSama({ rows: [p({ bertambah: 0 })], acuan: '2099-01-10', mutasi: m }, simpan))
  ok('B5 catatan bertambah → beda', !isiPergeseranSama({ rows: [p()], acuan: '2099-01-10', mutasi: [...m, { dari_row: 'C', ke_row: 'B', nilai: 1 }] }, simpan))
  ok('B6 catatan tidak dikirim → hanya baris menentukan', isiPergeseranSama({ rows: [p()], acuan: '2099-01-10' }, simpan))
  ok('B7 keterangan catatan di-trim seperti tulisMutasi', isiPergeseranSama({ rows: [p()], acuan: '2099-01-10', mutasi: [{ ...m[0], keterangan: ' x ' }] }, simpan))
  ok('B8 urutan catatan bermakna', !isiPergeseranSama(
    { rows: [p()], acuan: '2099-01-10', mutasi: [{ dari_row: 'C', ke_row: 'B', nilai: 1 }, m[0]] },
    { ...simpan, mutasi: [m[0], { dari_row: 'C', ke_row: 'B', nilai: 1, keterangan: null }] }))
}

console.log('\n── C. jebakanArsip ──────────────────────────────────────────────')
{
  const v = ['2099-01-10', '2099-09-30', '2099-10-06']
  ok('C1 periode bulan berjalan → tidak ada jebakan', jebakanArsip('', v) === null)
  ok('C2 arsip belum ada (arsip baru) → tidak ada jebakan', jebakanArsip('2099-08-31', v) === null)
  ok('C3 arsip ada tapi ia yang terbaru → tidak ada jebakan', jebakanArsip('2099-10-06', v) === null)
  const j = jebakanArsip('2099-09-30', v)
  ok('C4 arsip ada & ada versi lebih baru → jebakan', j?.arsip === '2099-09-30' && j.terbaru === '2099-10-06')
}

console.log('\n── D. kalimatTidakBerubah ───────────────────────────────────────')
{
  const t = (x: string) => `<${x}>`
  ok('D1 versi yang sama', kalimatTidakBerubah({ versiBerlaku: 'a', sasaran: 'a', tanggal: t }) === 'Tidak ada yang berubah dari versi <a> — tidak ada yang ditulis.')
  ok('D2 tanggal lain → menyebut versi yang tetap berlaku', kalimatTidakBerubah({ versiBerlaku: 'a', sasaran: 'b', tanggal: t }).includes('versi <a> tetap berlaku'))
}

console.log('\n── E. Sambungan (L69) ───────────────────────────────────────────')
{
  const D = kode('lib/blud/data.ts')
  const sDpa = badan(D, 'asalPerubahan: { sumber_dasar: \'PERGESERAN\' | \'DPA\'; versi_dasar: string } | null = null,\n): Promise<SimpanHasil>')
  // Cabang kosong+force punya assert sendiri lebih dulu — patokannya yang TERAKHIR sebelum pemeriksaan.
  const sesudahAssert = (s: string, tabel: string) => s.slice(s.lastIndexOf(`await assertBludVersion(tx, '${tabel}', lockKey, expectedVersion)`))
  ok('E1 saveDpa: diperiksa SESUDAH angka kunci, SEBELUM pagar lain & DELETE', urut(sesudahAssert(sDpa, 'dpa_blud'),
    'if (!asalPerubahan) {', 'const berlaku = await dpaBerlakuPada(tx, tahun, versiTanggal)',
    'if (berlaku && isiDpaSama(rows, berlaku.rows)) {', 'return', 'const penanda = await penandaPerubahan(tx, tahun)', 'DELETE FROM dpa_blud'))
  ok('E2 saveDpa: hasil dilewati tanpa naik angka kunci', sDpa.includes('newVersion: expectedVersion, jangkar: {}')
    && sDpa.includes('tidakBerubah: { versiBerlaku: tidakBerubah.versi }'))
  const sPg = badan(D, 'mutasi: MutasiInput[] | undefined = undefined,\n): Promise<SimpanHasil>')
  ok('E3 savePergeseran: cermin, penutupan dikecualikan', urut(sesudahAssert(sPg, 'pergeseran_dpa'),
    'if (!asalTutup) {', 'const berlaku = await pergeseranBerlakuPada(tx, tahun, versiTanggal)',
    'isiPergeseranSama({ rows, acuan: dpaVersiTanggal, mutasi }, berlaku)', 'return', 'DELETE FROM pergeseran_dpa'))
  // Penanda di UJUNG tanda tangan: tipe kembaliannya `Promise<{ … }>` punya `{` sendiri.
  const bDpa = badan(D, 'rows: DpaBaris[] } | null>')
  const bPg = badan(D, 'acuan: string; mutasi: MutasiInput[]\n} | null>')
  ok('E4 pembanding dibaca lewat tx (L69-b)', bDpa.includes('await getDpaVersiBerlaku(tahun, sasaran, tx)') && bDpa.includes('await tx`')
    && !bDpa.includes('await sql`') && bPg.includes('await getPergeseranVersiBerlaku(tahun, sasaran, tx)')
    && !bPg.includes('await sql`') && bPg.includes('FROM pergeseran_mutasi'))
  // Satu definisi "versi yang berlaku pada tanggal" (L78) — bukan query MAX kedua di sini.
  const vbDpa = badan(D, 'export async function getDpaVersiBerlaku(tahun: number, tanggal: string, q: Penanya = sql)')
  const vbPg = badan(D, 'export async function getPergeseranVersiBerlaku(tahun: number, tanggal: string, q: Penanya = sql)')
  ok('E5 pembanding = versi TERAKHIR ≤ sasaran (bukan persis sasaran), lewat penanya yang dioper',
    [vbDpa, vbPg].every(b => b.includes('versi_tanggal <= ${tanggal}') && b.includes('await q`')))

  const rD = kode('app/api/blud/dpa/route.ts')
  ok('E6 Route DPA: dilewati → balas tanpa audit', urut(rD, 'if (result.tidakBerubah) {', 'tidak_berubah: true', "eventType: 'BLUD_SAVE_DPA'"))
  const rP = kode('app/api/blud/pergeseran/route.ts')
  ok('E7 Route Pergeseran: dilewati → tanpa audit & tanpa sapuan permintaan', urut(rP, 'if (result.tidakBerubah) {', 'tidak_berubah: true',
    "eventType: 'BLUD_SAVE_PERGESERAN'", 'selesaikanPermintaanTerpenuhi('))

  for (const [nama, p] of [['DPA', 'app/(dashboard)/blud/dpa/dpa-client.tsx'], ['Pergeseran', 'app/(dashboard)/blud/pergeseran/pergeseran-client.tsx']] as const) {
    const K = kode(p)
    const tb = K.slice(K.indexOf('if (json.ok && json.tidak_berubah) {'), K.indexOf('if (json.ok) {', K.indexOf('if (json.ok && json.tidak_berubah) {')))
    ok(`E8 ${nama}: cabang "tidak berubah" SEBELUM cabang sukses biasa`, tb.length > 0 && tb.includes('kalimatTidakBerubah('))
    ok(`E9 ${nama}: …tidak memindahkan versi/periode/angka kunci`, !/setVersi\(|setPeriodeTulis\(|setVersion\(/.test(tb) && tb.includes('setBelumTersimpan(false)'))
    const simpan = badan(K, 'async function simpan()')
    ok(`E10 ${nama}: Simpan bertanya jebakan arsip SEBELUM mengunci tombol`, urut(simpan, 'if (submittingRef.current) return',
      'if (!(await lolosJebakanArsip())) return', 'submittingRef.current = true'))
    const lj = badan(K, 'async function lolosJebakanArsip(): Promise<boolean>')
    ok(`E11 ${nama}: jalan utama (Enter) = Salin Versi Lain, lanjut simpan hanya lewat tombol ketiga`,
      lj.includes("confirmLabel: 'Pakai Salin Versi Lain'") && lj.includes("if (pilih === 'utama') await bawaKeBulanIni(j.arsip)")
      && lj.includes("return pilih === 'lain'"))
    ok(`E12 ${nama}: Salin Versi dibuka SESUDAH pindah ke bulan berjalan, arsip terpilih`, urut(badan(K, 'async function bawaKeBulanIni(arsip: string)'),
      "if (!(await gantiPeriode(''))) return", 'setSalinVersiAwal(arsip)', 'setSalinVersiBuka(true)'))
    ok(`E13 ${nama}: tombol toolbar membuka Salin Versi TANPA sumber terpilih`, K.includes('onClick={() => { setSalinVersiAwal(null); setSalinVersiBuka(true) }}')
      && K.includes('sumberAwal={salinVersiAwal}'))
    ok(`E14 ${nama}: gantiPeriode melapor batal`, badan(K, 'async function gantiPeriode(tanggal: string): Promise<boolean>').includes('if (!buang) return false'))
  }
  ok('E15 Pergeseran: penutupan tidak ditanya jebakan', badan(kode('app/(dashboard)/blud/pergeseran/pergeseran-client.tsx'),
    'async function lolosJebakanArsip(): Promise<boolean>').includes('if (asalTutupRef.current) return true'))

  const C = kode('components/ui/ConfirmDialog.tsx')
  ok('E16 pilihDialog: Esc = batal, Enter = jalan utama', C.includes("if (e.key === 'Escape') onDone(null);") && C.includes("if (e.key === 'Enter') onDone('utama');"))
  ok('E17 confirmDialog tetap boolean (30-an pemanggil)', C.includes("return pasang(opts).then(v => v === 'utama');"))
  ok('E18 SalinVersiModal memilih sumberAwal hanya kalau memang tersedia', kode('components/blud/SalinVersiModal.tsx')
    .includes('pilihan.find(p => p.versi_tanggal === sumberAwal)?.versi_tanggal ?? pilihan[0]?.versi_tanggal ?? \'\''))
}

console.log(`\n${lulus} lulus, ${gagal.length} gagal`)
if (gagal.length) { for (const g of gagal) console.log('  - ' + g); process.exit(1) }
