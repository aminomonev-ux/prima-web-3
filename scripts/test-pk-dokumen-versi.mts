// scripts/test-pk-dokumen-versi.mts — regresi kunci versi dokumen PK (audit I4)
//
//   npx tsx scripts/test-pk-dokumen-versi.mts
//
// Dulu PATCH menulis ulang header + seluruh lampiran/anggaran tanpa kunci: dua penyunting
// pada dokumen yang sama, yang terakhir menang dan kerja yang pertama hilang tanpa pesan.
// Finalisasi membuat Word dari isi DB lalu mengunci dokumen — simpanan yang masuk di selanya
// membuat berkas Word berbeda dengan dokumen FINAL-nya.
//
// Bagian DB membuat satu dokumen PK tahun 2099 dan menghapusnya lagi.

import { readFileSync } from 'node:fs'
import mysql from 'mysql2/promise'
import { DokumenUpdateBodySchema, DokumenFinalizeBodySchema, type DokumenUpdateBody } from '../lib/data/pk-schemas'

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
const kode = (p: string) => baca(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')

// ── A. Skema & sumber ────────────────────────────────────────────────────────
const ISI: Omit<DokumenUpdateBody, 'expected_version'> = {
  tahun: '2099', tanggal_dokumen: '2099-01-02', jenis_pk: 'MURNI',
  unit_pertama: 'UJI I4 Unit', nama_pertama: 'Pertama', jabatan_pertama: 'Jabatan 1', pangkat_pertama: null, nip_pertama: null,
  unit_kedua: 'UJI I4 Atasan', nama_kedua: 'Kedua', jabatan_kedua: 'Jabatan 2', pangkat_kedua: null, nip_kedua: null,
  lampiran: [{ unit_kerja: 'UJI I4 Unit', level: 'subkegiatan', program: null, kegiatan: null, subkegiatan: null, uraian: 'Sasaran A', indikator: null, target: null, urutan: 0 }],
  anggaran: [],
}
cek('A1 PATCH tanpa angka kunci ditolak (bukan opsional-dengan-cadangan)', !DokumenUpdateBodySchema.safeParse(ISI).success)
cek('A2 PATCH dengan angka kunci diterima', DokumenUpdateBodySchema.safeParse({ ...ISI, expected_version: 0 }).success)
cek('A3 Finalisasi tanpa angka kunci ditolak', !DokumenFinalizeBodySchema.safeParse({}).success)
const PK = kode('lib/data/pk.ts')
cek('A4 simpan: kunci ditegakkan di UPDATE header',
  PK.includes("WHERE id = ${id} AND version = ${d.expected_version} AND status = 'DRAFT'"))
cek('A5 simpan: konflik dilempar SEBELUM baris lama dihapus',
  PK.indexOf('if ((upd[0]?.affectedRows ?? 0) !== 1) throw new PkVersiKonflikError();') > 0
  && PK.indexOf('if ((upd[0]?.affectedRows ?? 0) !== 1) throw new PkVersiKonflikError();') < PK.indexOf('DELETE FROM pk_dokumen_lampiran'))
cek('A6 finalisasi ber-kunci', PK.includes("WHERE id = ${id} AND version = ${expectedVersion} AND status = 'DRAFT'"))
const RUTE = kode('app/api/perjanjian-kinerja/dokumen/[id]/route.ts')
cek('A7 GET memulangkan angka kunci', RUTE.includes('status, version,'))
cek('A8 PATCH lewat fungsi ber-kunci', RUTE.includes('versi = await gantiIsiDokumen(id, d);'))
cek('A9 PATCH konflik → 409', RUTE.includes("if (err instanceof PkVersiKonflikError) return NextResponse.json({ ok: false, code: 'VERSION_CONFLICT', message: err.message }, { status: 409 });"))
cek('A10 finalisasi lewat fungsi ber-kunci',
  kode('app/api/perjanjian-kinerja/dokumen/[id]/finalize/route.ts').includes('await kunciDokumenFinal(id, expectedVersion, { buffer, filename });'))
// Next.js menolak ekspor selain handler dari berkas route — konstanta pesan tinggal di lib.
cek('A11 berkas route tidak mengekspor selain handler', !/export const (?!dynamic|runtime)/.test(RUTE))
const FORM = kode('app/(dashboard)/perjanjian-kinerja/form/form-client.tsx')
cek('A12 layar mengirim angka kunci saat Simpan', FORM.includes('const kirim = form.id ? { ...body, expected_version: form.version } : body'))
cek('A13 layar mengirim angka kunci saat Finalisasi', FORM.includes("body: JSON.stringify({ expected_version: form.version })"))
cek('A14 layar memegang angka kunci baru sesudah Simpan', FORM.includes("if (typeof r.version === 'number') setForm(f => ({ ...f, version: r.version as number }))"))

// ── B. Basis data sungguhan ─────────────────────────────────────────────────
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

if (c) {
  const k = c
  const [kol] = await k.query(`SELECT COUNT(*) AS n FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pk_dokumen' AND COLUMN_NAME = 'version'`) as [Array<{ n: number }>, unknown]
  if (Number(kol[0].n) === 0) {
    gagal.push('B0 kolom pk_dokumen.version belum ada — jalankan docs/migrations/migration-pk-dokumen-version.sql')
  } else {
    const { gantiIsiDokumen, kunciDokumenFinal, PkVersiKonflikError } = await import('../lib/data/pk')
    const bersih = () => k.query("DELETE FROM pk_dokumen WHERE unit_pertama = 'UJI I4 Unit'")
    await bersih()
    try {
      const [r] = await k.query(`INSERT INTO pk_dokumen (tahun, tanggal_dokumen, jenis_pk, unit_pertama, nama_pertama, jabatan_pertama,
          unit_kedua, nama_kedua, jabatan_kedua) VALUES ('2099', '2099-01-02', 'MURNI', 'UJI I4 Unit', 'Pertama', 'Jabatan 1',
          'UJI I4 Atasan', 'Kedua', 'Jabatan 2')`) as [{ insertId: number }, unknown]
      const id = r.insertId
      const konflik = async (fn: () => Promise<unknown>) => {
        try { await fn(); return false } catch (e) { if (e instanceof PkVersiKonflikError) return true; throw e }
      }
      const lampiran = async () => {
        const [rows] = await k.query('SELECT uraian FROM pk_dokumen_lampiran WHERE dokumen_id = ? ORDER BY urutan', [id]) as [Array<{ uraian: string }>, unknown]
        return rows.map(x => x.uraian).join('|')
      }
      const versi = async () => {
        const [rows] = await k.query('SELECT version, status FROM pk_dokumen WHERE id = ?', [id]) as [Array<{ version: number; status: string }>, unknown]
        return rows[0]
      }

      // A dan B membuka dokumen yang sama di versi 0.
      sama('B1 penyunting A menyimpan: versi naik', await gantiIsiDokumen(id, { ...ISI, expected_version: 0 }), 1)
      sama('B2 penyunting B (masih versi 0) ditolak', await konflik(() => gantiIsiDokumen(id, {
        ...ISI, expected_version: 0,
        lampiran: [{ ...ISI.lampiran[0], uraian: 'Sasaran B menimpa' }],
      })), true)
      sama('B3 simpanan A tetap utuh — lampirannya tidak terhapus oleh penolakan B', await lampiran(), 'Sasaran A')
      sama('B4 versi tidak bergerak oleh penolakan', (await versi()).version, 1)
      sama('B5 B memuat ulang (versi 1) lalu menyimpan: diterima', await gantiIsiDokumen(id, {
        ...ISI, expected_version: 1,
        lampiran: [{ ...ISI.lampiran[0], uraian: 'Sasaran B' }],
      }), 2)
      sama('B6 isi terbaru milik B', await lampiran(), 'Sasaran B')

      const berkas = { buffer: Buffer.from('uji'), filename: 'uji.docx' }
      sama('B7 finalisasi dengan versi basi ditolak', await konflik(() => kunciDokumenFinal(id, 1, berkas)), true)
      sama('B8 dokumen tetap DRAFT sesudah penolakan', (await versi()).status, 'DRAFT')
      await kunciDokumenFinal(id, 2, berkas)
      const akhir = await versi()
      sama('B9 finalisasi dengan versi terkini berhasil', akhir.status, 'FINAL')
      sama('B10 finalisasi ikut menaikkan versi', akhir.version, 3)
      sama('B11 dokumen FINAL tidak bisa ditimpa walau angkanya cocok',
        await konflik(() => gantiIsiDokumen(id, { ...ISI, expected_version: 3 })), true)
    } finally {
      await bersih()
    }
    const [sisa] = await k.query("SELECT COUNT(*) AS n FROM pk_dokumen WHERE unit_pertama = 'UJI I4 Unit'") as [Array<{ n: number }>, unknown]
    sama('B12 data uji dibersihkan', Number(sisa[0].n), 0)
  }
  await k.end()
}

console.log(`\n${lulus} lulus, ${gagal.length} gagal`)
for (const g of gagal) console.log('  GAGAL ' + g)
process.exit(gagal.length ? 1 : 0)
