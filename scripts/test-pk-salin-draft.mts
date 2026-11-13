// scripts/test-pk-salin-draft.mts — regresi "Salin jadi DRAFT baru" (dokumen PK FINAL)
//
//   npx tsx --env-file=.env.local scripts/test-pk-salin-draft.mts
//
// Dokumen FINAL memang terkunci. Yang dibutuhkan bukan membuka kuncinya (itu mengubah
// arsip yang sudah jadi), melainkan salinan DRAFT yang bisa disunting. Yang diuji:
// salinan membawa SELURUH isi (header + lampiran + anggaran), sumbernya tidak berubah
// sebutir pun, salinan lahir sebagai DRAFT versi 0 tanpa berkas Word, salinan itu bisa
// disimpan, dan menyalin dokumen DRAFT ditolak.
//
// Bagian DB memakai tahun 2099 + awalan unit "UJI SALIN" lalu menghapusnya lagi.

import { readFileSync } from 'node:fs'
import mysql from 'mysql2/promise'
import type { DokumenUpdateBody } from '../lib/data/pk-schemas'

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
const kode = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')

// ── A. Sumber ───────────────────────────────────────────────────────────────
const PK = kode('lib/data/pk.ts')
const RUTE = kode('app/api/perjanjian-kinerja/dokumen/[id]/salin-draft/route.ts')
const FORM = kode('app/(dashboard)/perjanjian-kinerja/form/form-client.tsx')
const RIWAYAT = kode('app/(dashboard)/perjanjian-kinerja/riwayat/riwayat-client.tsx')

cek('A1 salinan memakai INSERT…SELECT (satu tempat daftar kolom, tanpa jendela baca-tulis)',
  ['INSERT INTO pk_dokumen_lampiran', 'FROM pk_dokumen_lampiran WHERE dokumen_id = ${id}',
    'INSERT INTO pk_dokumen_anggaran', 'FROM pk_dokumen_anggaran WHERE dokumen_id = ${id}']
    .every(s => PK.includes(s)))
cek('A2 salinan ditulis sebagai DRAFT versi 0 milik penyunting', PK.includes("'DRAFT', 0, ${userId}"))
cek('A3 berkas Word TIDAK ikut disalin', !/INSERT INTO pk_dokumen \([\s\S]*generated_file[\s\S]*?SELECT/.test(PK.slice(PK.indexOf('salinJadiDraft'))))
cek('A4 hanya FINAL yang boleh disalin', PK.includes("if (baris[0].status !== 'FINAL') throw new PkHanyaFinalDisalinError();"))
cek('A5 dokumen sumber tidak di-UPDATE/DELETE', !/UPDATE pk_dokumen SET[\s\S]{0,400}salinJadiDraft/.test(PK))
cek('A6 urutan penjaga rute: sesi → sakelar → izin tulis Form → rate limit',
  ['getSession()', 'pkMati(session.role)', "bolehEditMenu(session.userId, session.role, 'form')", "'salin-draft'"]
    .map(k => RUTE.indexOf(k)).every((v, i, a) => v > 0 && (i === 0 || v > a[i - 1])))
cek('A7 rute menolak dokumen milik orang lain (non-admin)', RUTE.includes('if (!isAdmin && sumber.created_by !== session.userId)'))
cek('A8 rute mencatat audit PK_DOKUMEN_SALIN_DRAFT', RUTE.includes("eventType: 'PK_DOKUMEN_SALIN_DRAFT'"))
cek('A9 layar Riwayat memanggil endpoint salin-draft', RIWAYAT.includes('/salin-draft`'))
cek('A10 tombol Riwayat hanya untuk baris FINAL', RIWAYAT.includes("bolehUbah && r.status === 'FINAL' && ("))
cek('A11 layar Form menyediakan salin saat dokumen FINAL', FORM.includes('{form.id && isFinal && bolehUbah && ('))

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
  const [users] = await k.query('SELECT id FROM users ORDER BY id LIMIT 1') as [Array<{ id: number }>, unknown]
  if (!users.length) {
    gagal.push('B0 tidak ada baris di tabel users — created_by tidak bisa diuji')
  } else {
    const userId = users[0].id
    const { salinJadiDraft, gantiIsiDokumen, PkDokumenTidakAdaError, PkHanyaFinalDisalinError } = await import('../lib/data/pk')
    const bersih = () => k.query("DELETE FROM pk_dokumen WHERE unit_pertama LIKE 'UJI SALIN%'")
    await bersih()
    try {
      const [r] = await k.query(`INSERT INTO pk_dokumen
        (tahun, tanggal_dokumen, jenis_pk, unit_pertama, nama_pertama, jabatan_pertama,
         unit_kedua, nama_kedua, jabatan_kedua, status, version, generated_file, generated_filename, generated_at, created_by)
        VALUES ('2099', '2099-03-04', 'PERUBAHAN', 'UJI SALIN Unit', 'Pertama', 'Jabatan 1',
                'UJI SALIN Atasan', 'Kedua', 'Jabatan 2', 'FINAL', 7, 'berkas-lama', 'lama.docx', NOW(), ?)`,
        [userId]) as [{ insertId: number }, unknown]
      const sumber = r.insertId
      await k.query(`INSERT INTO pk_dokumen_lampiran
        (dokumen_id, unit_kerja, level, program, kegiatan, subkegiatan, uraian, indikator, target, satuan, urutan)
        VALUES (?, 'UJI SALIN Unit', 'program', 'Program A', NULL, NULL, 'Sasaran A', 'Indikator A', '100', '%', 0),
               (?, 'UJI SALIN Unit', 'subkegiatan', 'Program A', 'Kegiatan A', 'Sub A', 'Sasaran B', 'Indikator B', '20', 'Orang', 1)`,
        [sumber, sumber])
      await k.query(`INSERT INTO pk_dokumen_anggaran
        (dokumen_id, unit_kerja, level, program, kegiatan, subkegiatan, uraian, keterangan_sumber, nominal, urutan, auto_filled_from_blud)
        VALUES (?, 'UJI SALIN Unit', 'program', 'Program A', NULL, NULL, 'Program A', 'BLUD', 1500000, 0, 0)`,
        [sumber])

      const isiSumber = async (id: number) => {
        const [[h]] = await k.query(`SELECT status, version, unit_pertama, nama_kedua, tanggal_dokumen,
            jenis_pk, created_by, generated_filename FROM pk_dokumen WHERE id = ?`, [id]) as [Array<Record<string, unknown>>, unknown]
        const [[l]] = await k.query('SELECT COUNT(*) AS n FROM pk_dokumen_lampiran WHERE dokumen_id = ?', [id]) as [Array<{ n: number }>, unknown]
        const [[a]] = await k.query('SELECT COUNT(*) AS n FROM pk_dokumen_anggaran WHERE dokumen_id = ?', [id]) as [Array<{ n: number }>, unknown]
        return { h, lampiran: Number(l.n), anggaran: Number(a.n) }
      }
      const asal = await isiSumber(sumber)

      const baru = await salinJadiDraft(sumber, userId)
      cek('B1 salinan lahir sebagai baris baru (id berbeda)', baru !== sumber)

      const salinan = await isiSumber(baru)
      sama('B2 salinan berstatus DRAFT', salinan.h.status, 'DRAFT')
      sama('B3 salinan mulai dari versi 0', Number(salinan.h.version), 0)
      sama('B4 salinan tanpa berkas Word', salinan.h.generated_filename, null)
      sama('B5 salinan milik penyunting', Number(salinan.h.created_by), userId)
      sama('B6 header ikut tersalin (unit, pihak kedua, tanggal, jenis)', [
        salinan.h.unit_pertama, salinan.h.nama_kedua, String(salinan.h.tanggal_dokumen).slice(0, 10), salinan.h.jenis_pk,
      ].join('|'), [
        asal.h.unit_pertama, asal.h.nama_kedua, String(asal.h.tanggal_dokumen).slice(0, 10), asal.h.jenis_pk,
      ].join('|'))
      sama('B7 jumlah lampiran sama', salinan.lampiran, asal.lampiran)
      sama('B8 jumlah anggaran sama', salinan.anggaran, asal.anggaran)
      const [isisalin] = await k.query('SELECT uraian, target FROM pk_dokumen_lampiran WHERE dokumen_id = ? ORDER BY urutan', [baru]) as [Array<{ uraian: string; target: string }>, unknown]
      sama('B9 isi lampiran benar-benar tersalin', isisalin.map(x => `${x.uraian}:${x.target}`).join('|'), 'Sasaran A:100|Sasaran B:20')

      const sesudah = await isiSumber(sumber)
      sama('B10 dokumen FINAL sumber tetap FINAL', sesudah.h.status, 'FINAL')
      sama('B11 versi dokumen sumber tidak bergerak', Number(sesudah.h.version), 7)
      sama('B12 berkas Word sumber tetap ada', sesudah.h.generated_filename, 'lama.docx')
      sama('B13 isi dokumen sumber tetap utuh', `${sesudah.lampiran}/${sesudah.anggaran}`, `${asal.lampiran}/${asal.anggaran}`)

      // Salinan memang bisa disunting — inilah gunanya.
      const ISI: Omit<DokumenUpdateBody, 'expected_version'> = {
        tahun: '2099', tanggal_dokumen: '2099-03-04', jenis_pk: 'PERUBAHAN',
        unit_pertama: 'UJI SALIN Unit', nama_pertama: 'Pertama', jabatan_pertama: 'Jabatan 1', pangkat_pertama: null, nip_pertama: null,
        unit_kedua: 'UJI SALIN Atasan', nama_kedua: 'Kedua', jabatan_kedua: 'Jabatan 2', pangkat_kedua: null, nip_kedua: null,
        lampiran: [{ unit_kerja: 'UJI SALIN Unit', level: 'program', program: 'Program A', kegiatan: null, subkegiatan: null, uraian: 'Sasaran disunting', indikator: null, target: null, urutan: 0 }],
        anggaran: [],
      }
      sama('B14 salinan bisa disimpan (versi 0 → 1)', await gantiIsiDokumen(baru, { ...ISI, expected_version: 0 }), 1)

      const tolak = async (fn: () => Promise<unknown>, jenis: 'final' | 'tidakada') => {
        try { await fn(); return false } catch (e) {
          if (jenis === 'final' && e instanceof PkHanyaFinalDisalinError) return true
          if (jenis === 'tidakada' && e instanceof PkDokumenTidakAdaError) return true
          throw e
        }
      }
      sama('B15 menyalin dokumen DRAFT ditolak', await tolak(() => salinJadiDraft(baru, userId), 'final'), true)
      sama('B16 menyalin id yang tidak ada → tidak ditemukan', await tolak(() => salinJadiDraft(2147483000, userId), 'tidakada'), true)
    } finally {
      await bersih()
    }
    const [sisa] = await k.query("SELECT COUNT(*) AS n FROM pk_dokumen WHERE unit_pertama LIKE 'UJI SALIN%'") as [Array<{ n: number }>, unknown]
    sama('B17 data uji dibersihkan', Number(sisa[0].n), 0)
  }
  await k.end()
}

console.log(`\n${lulus} lulus, ${gagal.length} gagal`)
for (const g of gagal) console.log('  GAGAL ' + g)
process.exit(gagal.length ? 1 : 0)
