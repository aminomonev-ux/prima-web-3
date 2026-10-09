// scripts/test-blud-dpa-perubahan-layar.mts — DPA Perubahan BLUD, Tahap 2 (layar).
//
// Konsep: docs/CONCEPT-blud-dpa-perubahan.md §5, §7, §10, §12. Sisi data (Tahap 1)
// dijaga test-blud-dpa-perubahan.mts + pasangan DB-nya; di sini yang dijaga:
//   A. fungsi murni lib/blud/perubahan.ts — diuji SUNGGUHAN, bukan dicocokkan ke teks
//   B. layar DPA — jejak `asal_perubahan` dilepas di SETIAP jalur pengganti isi (L69),
//      modal berhenti di form (L78/L80), kolom Sebelum mengikuti ISI layar
//   C. route GET — dua mode baru dan pagarnya
//   D. label "Pagu dari …" satu rumus di tiga layar (L78)
//
// Pemeriksaan teks membuang komentar dulu dan mengutip utuh (L82c).
// USAGE: npx tsx scripts/test-blud-dpa-perubahan-layar.mts

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  keBabak, catatanBabak, jenisSumberPagu, berSebelum, selisihSebelum, formatSelisih,
  totalSebelumSesudah, hapusAtauNolkan, alasanKunciPerubahan,
  KUNCI_TAMPIL_SEBELUM, bacaTampilSebelum, simpanTampilSebelum,
  catatanDasar, babakIkutDihapus,
  babakLama, spandukBabakLama, bukaKunciBabakLama, pergeseranBerlaku,
} from '../lib/blud/perubahan'
import type { PenandaPerubahan } from '../lib/blud/sumber-pagu'
import type { DpaBarisInput } from '../types'

const AKAR = join(import.meta.dirname, '..')
const baca = (p: string) => readFileSync(join(AKAR, p), 'utf8')
// CRLF dinormalkan: salinan kerja Windows (core.autocrlf) memegang \r\n, CI memegang \n.
function kode(isi: string): string {
  return isi.replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}
/** Pasangan kurung penutup dari indeks kurung buka `buka`. */
function tutupan(src: string, buka: number, a: string, z: string): number {
  let d = 0
  for (let i = buka; i < src.length; i++) {
    if (src[i] === a) d++
    else if (src[i] === z && --d === 0) return i
  }
  return -1
}
/**
 * Badan fungsi di dalam komponen: `function nama(…) {…}` atau `const nama = useCallback(… => {…}`.
 * Daftar parameter dilompati dengan pencocokan kurung — `pulihkanSimpanan` & kawan-kawan
 * bertipe objek sebaris, jadi `{` pertama sesudah nama belum tentu badannya.
 */
function badan(src: string, nama: string): string {
  const fn = src.search(new RegExp(`function ${nama}\\(`))
  if (fn >= 0) {
    const kurung = src.indexOf('(', fn)
    const buka = src.indexOf('{', tutupan(src, kurung, '(', ')'))
    return src.slice(fn, tutupan(src, buka, '{', '}') + 1)
  }
  const cb = src.search(new RegExp(`const ${nama} = useCallback\\(`))
  if (cb < 0) return ''
  const buka = src.indexOf('{', src.indexOf('=>', cb))
  return src.slice(cb, tutupan(src, buka, '{', '}') + 1)
}
const kemunculan = (s: string, x: string) => s.split(x).length - 1

let lulus = 0
let gagal = 0
function cek(nama: string, syarat: boolean, catatan = '') {
  if (syarat) { lulus++; console.log(`  ok    ${nama.padEnd(72)} ${catatan}`) }
  else        { gagal++; console.log(`  GAGAL ${nama.padEnd(72)} ${catatan}`) }
}

// ─── A. Fungsi murni ─────────────────────────────────────────────────────────
console.log('\n── A. lib/blud/perubahan.ts ──')
const penanda: PenandaPerubahan[] = [
  { versi_mulai: '2026-08-15' } as PenandaPerubahan,
  { versi_mulai: '2026-10-09' } as PenandaPerubahan,
]
cek('keBabak: sebelum penanda pertama = murni (null)', keBabak(penanda, '2026-08-14') === null)
cek('keBabak: tepat di versi_mulai = babak itu', keBabak(penanda, '2026-08-15') === 1 && keBabak(penanda, '2026-10-09') === 2)
cek('keBabak: di antara dua penanda = babak sebelumnya', keBabak(penanda, '2026-09-30') === 1)
cek('keBabak: tanpa penanda = null', keBabak([], '2026-10-09') === null)
cek('catatanBabak: tahun tanpa Perubahan TANPA lencana', catatanBabak([], '2026-10-09') === undefined)
cek('catatanBabak: MURNI / PERUBAHAN KE-n',
  catatanBabak(penanda, '2026-01-31') === 'MURNI' && catatanBabak(penanda, '2026-10-10') === 'PERUBAHAN KE-2')

cek('jenisSumberPagu: tanpa Perubahan bunyinya seperti dulu',
  jenisSumberPagu({ sumber: 'DPA' }) === 'DPA' && jenisSumberPagu({ sumber: 'PERGESERAN', perubahan_ke: null }) === 'Pergeseran')
cek('jenisSumberPagu: DPA Perubahan ke-n', jenisSumberPagu({ sumber: 'DPA', perubahan_ke: 1 }) === 'DPA Perubahan ke-1')
cek('jenisSumberPagu: Pergeseran di babak Perubahan menyebut babaknya',
  jenisSumberPagu({ sumber: 'PERGESERAN', perubahan_ke: 2 }) === 'Pergeseran (DPA Perubahan ke-2)')

cek('berSebelum: null = lahir di Perubahan; 0 = baris lama bernilai nol',
  !berSebelum({ jumlah_sebelum: null }) && berSebelum({ jumlah_sebelum: 0 }))
cek('selisihSebelum: baris baru dihitung dari nol', selisihSebelum({ jumlah: 5_000_000, jumlah_sebelum: null }) === 5_000_000)
cek('selisihSebelum: berkurang bertanda negatif', selisihSebelum({ jumlah: 3, jumlah_sebelum: 10 }) === -7)
const fmt = (n: number) => n.toLocaleString('id-ID')
cek('formatSelisih: +x / (x) / 0 — gaya dokumen anggaran, bukan minus',
  formatSelisih(15_000_000, fmt) === '+15.000.000' && formatSelisih(-10_000_000, fmt) === '(10.000.000)'
  && formatSelisih(0, fmt) === '0' && formatSelisih(0.001, fmt) === '0')

type B = Pick<DpaBarisInput, 'row_id' | 'parent_id' | 'vol' | 'harga' | 'jumlah' | 'jumlah_sebelum'>
const b = (row_id: string, parent_id: string | null, jumlah: number, jumlah_sebelum: number | null): B =>
  ({ row_id, parent_id, vol: jumlah ? 1 : null, harga: jumlah || null, jumlah, jumlah_sebelum })
//   akar(180 → 210)
//   ├─ lama-a (100 → 120)
//   ├─ lama-b (80 → 60)
//   └─ induk-baru (— → 30)
//       └─ baru-c (— → 30)
const pohon: B[] = [
  b('akar', null, 210, 180), b('lama-a', 'akar', 120, 100), b('lama-b', 'akar', 60, 80),
  b('induk-baru', 'akar', 30, null), b('baru-c', 'induk-baru', 30, null),
]
{
  const t = totalSebelumSesudah(pohon)
  cek('totalSebelumSesudah: AKAR saja (bukan menjumlah seluruh pohon)', t.sebelum === 180 && t.sesudah === 210 && t.selisih === 30,
    `${t.sebelum} → ${t.sesudah}`)
  const yatim = totalSebelumSesudah([...pohon, b('yatim', 'hilang', 7, 7)])
  cek('…baris yang induknya tak ada di layar dihitung sebagai akar', yatim.sesudah === 217)
}
{
  const h = hapusAtauNolkan(pohon, new Set(['lama-b']))
  const lb = h.rows.find(r => r.row_id === 'lama-b')
  cek('hapusAtauNolkan: baris lama DINOLKAN, tetap ada', !!lb && lb.jumlah === 0 && lb.vol === null && lb.harga === null && lb.jumlah_sebelum === 80)
  cek('…hitungannya 1 dinolkan, 0 dihapus', h.dinolkan === 1 && h.dihapus === 0)
}
{
  const h = hapusAtauNolkan(pohon, new Set(['induk-baru', 'baru-c']))
  cek('hapusAtauNolkan: subtree lahir di Perubahan DIHAPUS biasa',
    h.dihapus === 2 && h.dinolkan === 0 && !h.rows.some(r => r.row_id.includes('baru')))
}
{
  // Induk baru yang menampung baris LAMA (dipindah ke bawahnya): induk wajib bertahan,
  // kalau tidak baris lama yang dinolkan kehilangan induknya.
  const campur: B[] = [b('akar', null, 50, 50), b('induk-baru', 'akar', 50, null), b('lama-x', 'induk-baru', 50, 50)]
  const h = hapusAtauNolkan(campur, new Set(['induk-baru', 'lama-x']))
  const induk = h.rows.find(r => r.row_id === 'induk-baru')
  cek('hapusAtauNolkan: induk dipertahankan kalau keturunannya bertahan', !!induk && h.rows.some(r => r.row_id === 'lama-x'))
  cek('…yang dinolkan hanya DAUN (induk tidak diubah angkanya di sini)', induk?.jumlah === 50 && h.dinolkan === 1)
}
cek('hapusAtauNolkan: urutan baris dipertahankan',
  hapusAtauNolkan(pohon, new Set(['lama-a'])).rows.map(r => r.row_id).join() === pohon.map(r => r.row_id).join())

cek('alasanKunciPerubahan: sumber belum dimuat', alasanKunciPerubahan({ sumber: null, dpaTerakhir: null, sasaran: '2026-10-09' }) !== '')
cek('alasanKunciPerubahan: tahun tanpa DPA', /belum punya DPA/.test(alasanKunciPerubahan({ sumber: 'KOSONG', dpaTerakhir: null, sasaran: '2026-10-09' })))
cek('alasanKunciPerubahan: sasaran SUDAH berisi DPA → "simpan besok"',
  /simpan besok/.test(alasanKunciPerubahan({ sumber: 'PERGESERAN', dpaTerakhir: '2026-10-09', sasaran: '2026-10-09' })))
cek('alasanKunciPerubahan: sasaran SEBELUM DPA terakhir (§5.1) → ditolak',
  /harus sesudahnya/.test(alasanKunciPerubahan({ sumber: 'DPA', dpaTerakhir: '2026-10-09', sasaran: '2026-09-30' })))
cek('alasanKunciPerubahan: sasaran sesudah DPA terakhir → boleh',
  alasanKunciPerubahan({ sumber: 'PERGESERAN', dpaTerakhir: '2026-10-07', sasaran: '2026-10-09' }) === '')

// Sakelar — localStorage bisa MELEMPAR (jendela privat, data situs diblokir).
{
  const g = globalThis as unknown as { window?: unknown }
  const simpanan = new Map<string, string>()
  g.window = { localStorage: { getItem: (k: string) => simpanan.get(k) ?? null, setItem: (k: string, v: string) => { simpanan.set(k, v) } } }
  cek('sakelar: bawaan NYALA', bacaTampilSebelum() === true)
  simpanTampilSebelum(false)
  cek('sakelar: pilihan tersimpan di kuncinya sendiri', simpanan.get(KUNCI_TAMPIL_SEBELUM) === '0' && bacaTampilSebelum() === false)
  const lempar = () => { throw new Error('SecurityError') }
  g.window = { localStorage: { getItem: lempar, setItem: lempar } }
  let aman = true
  let nilai: boolean | undefined
  try { nilai = bacaTampilSebelum(); simpanTampilSebelum(true) } catch { aman = false }
  cek('sakelar: aksesor yang melempar tidak merobohkan layar (bawaan nyala)', aman && nilai === true)
  delete g.window
}

// ─── B. Layar DPA ────────────────────────────────────────────────────────────
console.log('\n── B. Layar DPA ──')
const LAYAR = kode(baca('app/(dashboard)/blud/dpa/dpa-client.tsx'))
// Jalur yang mengganti isi layar lewat cara selain "Jadikan DPA Perubahan". Kalau satu
// tertinggal, simpanan berikutnya mengaku membuat Perubahan dari dasar yang sudah
// tidak ada di layar — dan server menerbitkan penandanya.
const PENGGANTI = [
  'loadDpa', 'pulihkanSimpanan', 'executeBuildForm', 'muatDariBerkas', 'terapkanImpor',
  'gantiPeriode', 'gantiTahun', 'bukaVersi', 'terapkanSalinTahun', 'terapkanSalinVersi',
]
for (const f of PENGGANTI) {
  const isi = badan(LAYAR, f)
  cek(`${f}: melepas asalPerubahanRef`, isi.length > 0 && isi.includes('asalPerubahanRef.current = null'), isi ? '' : '(fungsi tak ditemukan)')
}
{
  // Pembanding: SETIAP fungsi yang menyentuh jejak salin juga harus memutuskan jejak
  // Perubahan — daftar di atas bisa ketinggalan fungsi baru, pembanding ini tidak.
  const fungsi = [...LAYAR.matchAll(/(?:function (\w+)\(|const (\w+) = useCallback\()/g)].map(m => m[1] ?? m[2])
  const lupa = fungsi.filter(f => {
    const isi = badan(LAYAR, f)
    return /asalSalinRef\.current\s*=/.test(isi) && !/asalPerubahanRef\.current\s*=/.test(isi)
  })
  cek('setiap fungsi yang menulis asalSalinRef juga menulis asalPerubahanRef', lupa.length === 0, lupa.join(', '))
}
{
  const simpan = badan(LAYAR, 'doSimpanInternal')
  cek('Simpan: body membawa asal_perubahan', simpan.includes('asal_perubahan: asalPerubahanRef.current ?? undefined'))
  const ok = simpan.slice(simpan.indexOf('if (json.ok)'))
  cek('Simpan berhasil: jejaknya dilepas (simpan berikutnya bukan pembuat Perubahan)', ok.includes('asalPerubahanRef.current = null'))
  cek('Simpan berhasil: penanda dimuat ulang (lencana & sakelar)', ok.includes('loadBabak()'))
  cek('Simpan: 409 membaca bisa_dipaksa (R8)', simpan.includes('bisaDipaksa: json.bisa_dipaksa !== false'))
}
{
  const t = badan(LAYAR, 'terapkanPerubahan')
  cek('terapkanPerubahan: memasang jejak & melepas jejak lain',
    t.includes('asalPerubahanRef.current = asal') && ['asalSalinRef', 'asalPulihkanRef', 'asalBerkasRef', 'asalImporRef']
      .every(r => new RegExp(`${r}\\.current\\s*=\\s*null`).test(t)))
  cek('terapkanPerubahan: TIDAK memindahkan sasaran Simpan (L80)',
    !/setVersi\(|setPeriodeTulis\(|setVersion\(/.test(t))
  cek('terapkanPerubahan: isi layar ditandai belum tersimpan (L79b/L83)', t.includes('setBelumTersimpan(true)'))
}
cek('kolom Sebelum mengikuti ISI layar, bukan versi/sasaran', LAYAR.includes('const kolomSebelum = adaSebelum && tampilSebelum'))
cek('…sakelarnya muncul hanya kalau layar memegang Sebelum', LAYAR.includes('{adaSebelum && (\n          <button'))
cek('…tidak ada lagi prop modePerubahan ke tabel', !LAYAR.includes('modePerubahan'))
{
  const hapus = badan(LAYAR, 'deleteBaris')
  cek('deleteBaris: baris ber-Sebelum dinolkan, patokannya barisnya sendiri', hapus.includes('if (berSebelum(target)) {'))
  const borongan = badan(LAYAR, 'deleteSelected')
  cek('deleteSelected: lewat hapusAtauNolkan', borongan.includes('const hasil = hapusAtauNolkan(rows, selectedRowIds)'))
  cek('…dialog Perubahan hanya kalau memang ada yang dinolkan', borongan.includes('if (hasil.dinolkan > 0) {'))
}
cek('modal pagu: "Tetap Lanjut" hanya kalau bisa dipaksa (R8)',
  /\{bentrokPagu\.bisaDipaksa && \(\s*<PrimaButton variant="danger"(?:(?!<\/PrimaButton>)[\s\S])*Tetap Lanjut\s*<\/PrimaButton>\s*\)\}/.test(LAYAR))
cek('…kolom alasan paksa juga hanya kalau bisa dipaksa', /\{bentrokPagu\.bisaDipaksa && \(\s*<label className="bk-field">/.test(LAYAR))
cek('daftar versi diberi lencana babak', LAYAR.includes('items={historyBerlabel}'))
cek('Salin Versi: sumber dari babak yang SAMA dengan sasaran (§12)',
  LAYAR.includes('history.filter(h => keBabak(penanda, h.versi_tanggal) === babakSasaran)')
  && /<SalinVersiModal[\s\S]{0,300}history=\{historySalin\}/.test(LAYAR)
  && LAYAR.includes('alasanKunciSalinVersi(tahun, historySalin, [versi, sasaran])'))
cek('tombol Jadikan: alasannya dari cermin §5.1, sasaran dari sasaranSimpan',
  /alasanKunciPerubahan\(\{\s*sumber: babak\.sumber\?\.sumber \?\? null,\s*dpaTerakhir: history\[0\]\?\.versi_tanggal \?\? null,\s*sasaran,\s*\}\)/.test(LAYAR))
cek('chip Kolom Sebelum: tooltip ke KIRI (di tepi kanan, tooltip tengah meluap ke luar halaman)',
  /data-tooltip-pos="left"\s*data-tooltip=\{tampilSebelum/.test(LAYAR))
cek('sakelar: state awal dari bacaTampilSebelum, tulis lewat simpanTampilSebelum',
  LAYAR.includes('useState<boolean>(bacaTampilSebelum)') && LAYAR.includes('simpanTampilSebelum(nyala)')
  && !/localStorage/.test(LAYAR.slice(LAYAR.indexOf('function gantiTampilSebelum'), LAYAR.indexOf('function gantiTampilSebelum') + 300)))

const MODAL = kode(baca('components/blud/JadikanPerubahanModal.tsx'))
cek('modal: berhenti di FORM — tidak ada fetch tulis', !/method:\s*['"](POST|PUT|PATCH|DELETE)/.test(MODAL))
cek('modal: sumber ditanyakan ke server, bukan dipilih', MODAL.includes('/api/blud/dpa?mode=dasar-perubahan&tahun=${tahun}') && !/<select/.test(MODAL))
cek('modal: sasaran DITAMPILKAN (prop), tidak dipilih', MODAL.includes('formatTanggalId(sasaran)') && !/setSasaran|onSasaran/.test(MODAL))
cek('modal: layar berisi → konfirmasi dulu', /if \(jumlahDiLayar > 0\) \{\s*const setuju = await confirmDialog/.test(MODAL))
cek('modal: fetch & json dipisah dalam try/catch', /const res = await fetch[\s\S]{0,200}try \{ json = await res\.json\(\) \} catch/.test(MODAL))

// ─── C. Route GET ────────────────────────────────────────────────────────────
console.log('\n── C. Route GET /api/blud/dpa ──')
const ROUTE = kode(baca('app/api/blud/dpa/route.ts'))
cek('mode babak: pagar daftar versi + menu Pergeseran (yang menampilkannya)',
  ROUTE.includes(`mode === 'babak'           ? await bolehLihatSalahSatu(session.userId, session.role, ['dpa', 'pergeseran', 'cetak', 'pengaturan'])`))
cek('mode history: pagarnya TIDAK ikut melebar',
  ROUTE.includes(`mode === 'history'         ? await bolehLihatSalahSatu(session.userId, session.role, ['dpa', 'cetak', 'pengaturan'])`))
cek('mode dasar-perubahan: hanya yang bisa MENYUNTING DPA', ROUTE.includes(`mode === 'dasar-perubahan' ? await bolehEditMenu(session.userId, session.role, 'dpa')`))
cek('…keduanya di bawah rate limit yang sama', ROUTE.indexOf("bludRateLimit(session.userId, 'view-dpa', 60)") < ROUTE.indexOf("if (mode === 'babak')"))
cek('…dasar-perubahan diaudit (BLUD_VIEW_DPA, dibatasi bolehCatatView)',
  /if \(mode === 'dasar-perubahan'\) \{[\s\S]{0,300}bolehCatatView[\s\S]{0,200}eventType: 'BLUD_VIEW_DPA'/.test(ROUTE))

// ─── D. Label "Pagu dari …" ──────────────────────────────────────────────────
console.log('\n── D. Label sumber pagu ──')
for (const p of ['app/(dashboard)/blud/realisasi/realisasi-client.tsx', 'app/(dashboard)/blud/buku-kas/buku-kas-client.tsx', 'app/(dashboard)/blud/dashboard-client.tsx']) {
  const isi = kode(baca(p))
  cek(`${p.split('/').at(-1)}: label lewat jenisSumberPagu`, kemunculan(isi, 'jenisSumberPagu(') >= 1)
  cek(`${p.split('/').at(-1)}: tidak ada lagi ternary 'Pergeseran' : 'DPA' sendiri`, !/=== 'PERGESERAN' \? 'Pergeseran' : 'DPA'/.test(isi))
}
cek('ringkasSerapan membawa perubahan_ke ke Beranda', /perubahan_ke/.test(kode(baca('lib/blud/serapan-ringkas.ts'))))

// ─── E. Layar Pengaturan (hapus versi) ───────────────────────────────────────
console.log('\n── E. Pengaturan: lencana babak & hapus versi Perubahan ──')
{
  const pd = [
    { versi_mulai: '2026-08-15', sumber_dasar: 'PERGESERAN', versi_dasar: '2026-08-10' },
    { versi_mulai: '2026-10-09', sumber_dasar: 'DPA', versi_dasar: '2026-09-30' },
  ] as PenandaPerubahan[]
  cek('catatanDasar: versi sumber kolom Sebelum ditandai sesuai jenisnya',
    catatanDasar(pd, 'PERGESERAN', '2026-08-10') === 'DASAR PERUBAHAN KE-1' && catatanDasar(pd, 'DPA', '2026-09-30') === 'DASAR PERUBAHAN KE-2')
  cek('catatanDasar: tanggal sama tapi JENIS beda bukan dasar', catatanDasar(pd, 'DPA', '2026-08-10') === undefined)
  const versi = ['2026-10-09', '2026-09-30', '2026-08-15', '2026-01-31']
  cek('babakIkutDihapus: versi Perubahan TERAKHIR → babaknya ikut lenyap', babakIkutDihapus(pd, versi, '2026-10-09').join() === '2')
  cek('babakIkutDihapus: masih ada versi lain di babak itu → tidak ada yang lenyap',
    babakIkutDihapus(pd, [...versi, '2026-10-12'], '2026-10-09').length === 0)
  cek('babakIkutDihapus: versi murni dihapus → tidak ada yang lenyap', babakIkutDihapus(pd, versi, '2026-01-31').length === 0)
  // Cermin `bersihkanPenandaYatim`: penanda ke-1 masih "hidup" lewat versi ≥ 15 Agu yang
  // mana pun — termasuk versi babak ke-2.
  cek('babakIkutDihapus: babak lama tetap hidup selama ada versi DPA sesudahnya',
    babakIkutDihapus(pd, versi, '2026-08-15').length === 0)
}
{
  const PG = kode(baca('app/(dashboard)/blud/pengaturan/pengaturan-client.tsx'))
  cek('Pengaturan: penanda dimuat per tahun lewat mode=babak', PG.includes('fetch(`/api/blud/dpa?mode=babak&tahun=${y}`'))
  cek('Pengaturan: lencana DPA = babak versi itu + tanda dasar',
    PG.includes("catatanBabak(penanda[v.tahun_anggaran] ?? [], v.versi_tanggal),")
    && PG.includes("catatanDasar(penanda[v.tahun_anggaran] ?? [], 'DPA', v.versi_tanggal),"))
  cek('Pengaturan: babak pergeseran diturunkan dari ACUAN-nya (§9)',
    PG.includes("catatanBabak(penanda[v.tahun_anggaran] ?? [], v.dpa_versi_tanggal),")
    && PG.includes("catatanDasar(penanda[v.tahun_anggaran] ?? [], 'PERGESERAN', v.versi_tanggal),"))
  cek('Pengaturan: penolakan versi dasar jadi panel, bukan toast 4 detik',
    /if \(res\.status === 409 && json\.code === 'VERSI_DASAR_PERUBAHAN'\) \{\s*setTertahan\(\{ kode: 'VERSI_DASAR_PERUBAHAN', pesan: json\.error \}\)\s*return/.test(PG))
  cek('Pengaturan: dialog hapus DPA memperingatkan babak yang ikut dibatalkan',
    PG.includes("{target.kind === 'dpa' && babakDibuang.length > 0 && (") && PG.includes('babakIkutDihapus('))
  cek('Pengaturan: toast sukses menyebut Perubahan yang ikut dibatalkan', PG.includes('Number(json.penanda_dibuang) > 0'))
}

// ─── G. Tahap 3: layar Pergeseran sesudah Perubahan (§9) ─────────────────────
console.log('\n── G. Pergeseran sesudah Perubahan ──')
{
  const pd = [{ versi_mulai: '2026-10-09', sumber_dasar: 'PERGESERAN', versi_dasar: '2026-10-08' }] as PenandaPerubahan[]
  cek('babakLama: acuan sebelum Perubahan terakhir', babakLama(pd, '2026-10-07') && !babakLama(pd, '2026-10-09'))
  cek('babakLama: tahun tanpa Perubahan / acuan kosong → bukan', !babakLama([], '2026-10-07') && !babakLama(pd, ''))
  const s = spandukBabakLama(pd, '2026-10-07')
  cek('spanduk: menyebut babak, tanggal mulai, acuan, dan tombol jalan keluarnya',
    /Perubahan ke-1 berlaku sejak 09 Okt 2026/.test(s) && /07 Okt 2026/.test(s) && /Tekan Buat Pergeseran/.test(s))
  cek('spanduk: peran hanya-lihat tidak disuruh menekan tombol', !/Buat Pergeseran/.test(spandukBabakLama(pd, '2026-10-07', false)))
  cek('spanduk: kosong untuk isi babak baru', spandukBabakLama(pd, '2026-10-09') === '')
  const h = [{ versi_tanggal: '2026-10-08', dpa_versi_tanggal: '2026-10-07' }, { versi_tanggal: '2026-09-30', dpa_versi_tanggal: '2026-08-29' }]
  cek('bukaKunci: isi babak lama + sasaran di babak baru → boleh', bukaKunciBabakLama(pd, '2026-10-07', '2026-10-10', h) === '')
  cek('bukaKunci: sasaran masih sebelum Perubahan (arsip lampau) → aturan biasa',
    bukaKunciBabakLama(pd, '2026-08-29', '2026-09-30', h) === null)
  cek('bukaKunci: isi bukan babak lama → aturan biasa', bukaKunciBabakLama(pd, '2026-10-09', '2026-10-10', h) === null)
  cek('bukaKunci: sasaran berisi pergeseran babak lama → ditolak dgn alasan',
    /sudah berisi pergeseran sebelum Perubahan/.test(bukaKunciBabakLama(pd, '2026-10-07', '2026-10-09',
      [...h, { versi_tanggal: '2026-10-09', dpa_versi_tanggal: '2026-10-07' }]) ?? ''))
  cek('pergeseranBerlaku: tanpa Perubahan → yang terbaru (perilaku lama)', pergeseranBerlaku([], null, '2026-10-08') === '2026-10-08')
  cek('pergeseranBerlaku: sumber pagu DPA Perubahan → tidak ada pergeseran yang berlaku',
    pergeseranBerlaku(pd, { sumber: 'DPA', versi: '2026-10-09' }, '2026-10-08') === null)
  cek('pergeseranBerlaku: sumber pagu pergeseran → versi itu',
    pergeseranBerlaku(pd, { sumber: 'PERGESERAN', versi: '2026-10-12' }, '2026-10-12') === '2026-10-12')
}
{
  const PL = kode(baca('app/(dashboard)/blud/pergeseran/pergeseran-client.tsx'))
  cek('Pergeseran: penanda dimuat saat tahun berganti DAN sesudah Simpan',
    PL.includes('await loadRiwayat(); await loadBabak() })() }, [loadPergeseran, loadHistory, loadRiwayat, loadBabak])')
    && PL.includes('loadHistory(); loadTahunList(); loadRiwayat(); loadBabak()'))
  cek('Pergeseran: gagal muat → penanda dikosongkan, bukan sisa tahun lain',
    PL.includes('} catch { setBabak({ penanda: [], sumber: null }) }') && PL.includes(': { penanda: [], sumber: null })'))
  cek('Pergeseran: babak lama diukur dari ACUAN baris di layar', PL.includes('const isiBabakLama = rows.length > 0 && babakLama(penanda, dpaVersi)'))
  cek('Pergeseran: Buat Pergeseran lewat bukaKunciBabakLama dulu, baru kunci biasa',
    PL.includes('const kunciBabakLama = bukaKunciBabakLama(penanda, dpaVersi, sasaran, history)')
    && /const alasanKunciBorongan = !versi\s*\? ''\s*: kunciBabakLama \?\? `Versi/.test(PL))
  cek('Pergeseran: Sinkronkan DPA mati di isi babak lama', PL.includes('disabled={injecting || !rows.length || isiBabakLama}'))
  cek('Pergeseran: Tutup mati di isi babak lama (sebelum lembar penutupan dibuka)',
    /const alasanKunciTutup = !rows\.length\s*\? 'Belum ada tabelnya\.'\s*: isiBabakLama\s*\?/.test(PL))
  cek('Pergeseran: lencana babak dari acuan di daftar versi', PL.includes("catatanBabak(penanda, h.dpa_versi_tanggal ?? '')"))
  cek('Pergeseran: BERLAKU dari sumber pagu', PL.includes('const berlakuVersi = pergeseranBerlaku(penanda, babak.sumber, history[0]?.versi_tanggal)')
    && PL.includes('berlaku={berlakuVersi}'))
  cek('Pergeseran: spanduk babak lama dirender', PL.includes('{isiBabakLama && (') && PL.includes('spandukBabakLama(penanda, dpaVersi, bolehUbah)'))
  const VD = kode(baca('components/blud/VersiDropdown.tsx'))
  cek('VersiDropdown: tanpa prop berlaku = items[0] (pemakai lama tak tersentuh)',
    VD.includes('const berlakuTanggal = berlaku === undefined ? items[0]?.versi_tanggal : berlaku'))
  const PG = kode(baca('app/(dashboard)/blud/pengaturan/pengaturan-client.tsx'))
  cek('Pengaturan: BERLAKU pergeseran memakai rumus yang sama',
    PG.includes('const berlaku = pergeseranBerlaku(penanda[g.tahun] ?? [], sumberPagu[g.tahun] ?? null, g.rows[0]?.versi)'))
  const DATA = kode(baca('lib/blud/data.ts'))
  cek('Server: pagar sasaran babak lama di savePergeseran, SEBELUM ambang turun drastis',
    DATA.indexOf('throw new BludSasaranBabakLamaError(') > 0
    && DATA.indexOf('throw new BludSasaranBabakLamaError(') < DATA.indexOf("throw new BludReplaceSafetyError('pergeseran_dpa'"))
  cek('Server: route memetakan SASARAN_BABAK_LAMA ke 409', kode(baca('app/api/blud/pergeseran/route.ts')).includes("code: 'SASARAN_BABAK_LAMA'"))
}

// ─── F. Lebar ponsel ─────────────────────────────────────────────────────────
console.log('\n── F. Lebar ponsel ──')
cek('modal Jadikan: kaki modal boleh berbaris (catatan tidak diperas & terpotong)',
  /display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-end'[\s\S]{0,200}marginRight: 'auto', flex: '1 1 180px'/.test(MODAL))
{
  const css = baca('app/globals.css').replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '')
  const media = /@media \(max-width: 520px\) \{([\s\S]*?)\n\}/.exec(css)?.[1] ?? ''
  cek('daftar versi dibatasi selebar layar & boleh berbaris di ≤520px',
    media.includes('.versi-menu { max-width: calc(100vw - 56px); white-space: normal; }') && media.includes('.versi-item { flex-wrap: wrap; }'))
}

console.log(`\n${lulus} lulus, ${gagal} gagal`)
if (gagal) process.exit(1)
