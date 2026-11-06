// scripts/test-lkjip-hapus-final.mts — hapus dokumen LKJIP, termasuk yang sudah FINAL.
//
// Hak menghapus = hak membuka modul (keputusan pemilik), jadi yang dijaga bukan peran melainkan syaratnya:
// dokumen FINAL wajib beralasan + arsip Word dinyatakan sudah diunduh, dinilai di bawah kunci baris.
//
// A aturan · B skema · C sambungan layar & route · D MySQL kotak pasir 2099 (bersih sendiri)
// Jalankan: npx tsx --env-file=.env.local scripts/test-lkjip-hapus-final.mts

import { readFileSync } from 'node:fs'
import mysql from 'mysql2/promise'
import { alasanTolakHapus, BATAS_ALASAN_HAPUS_FINAL, MIN_ALASAN_HAPUS_FINAL } from '../lib/lkjip/hapus-dokumen'
import { DokumenDeleteSchema } from '../lib/lkjip/schemas'
import { createDokumen, finalizeDokumen, getDokumen, hapusDokumen, type HasilHapusDokumen } from '../lib/lkjip/data'

let lulus = 0
const gagal: string[] = []
function ok(nama: string, syarat: boolean, ket = '') {
  if (syarat) { lulus++; console.log(`  ok  ${nama}`) }
  else { gagal.push(nama); console.log(`FAIL  ${nama}${ket ? ' — ' + ket : ''}`) }
}
const kode = (p: string) => readFileSync(p, 'utf8')
  .replace(/{\/\*[\s\S]*?\*\/}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')

const ALASAN_SAH = 'dokumen uji salah tahun'
const SAH = { alasan: ALASAN_SAH, arsipDiunduh: true }

// ─── A. Aturan ───────────────────────────────────────────────────────────────
console.log('\nA. Aturan')
ok('A1 DRAFT tidak butuh apa pun', alasanTolakHapus('DRAFT', {}) === null)
ok('A2 FINAL tanpa alasan ditolak', alasanTolakHapus('FINAL', { arsipDiunduh: true })?.code === 'ALASAN_WAJIB')
ok('A3 alasan tepat di bawah batas ditolak',
  alasanTolakHapus('FINAL', { alasan: 'x'.repeat(MIN_ALASAN_HAPUS_FINAL - 1), arsipDiunduh: true })?.code === 'ALASAN_WAJIB')
ok('A4 alasan tepat di batas diterima',
  alasanTolakHapus('FINAL', { alasan: 'x'.repeat(MIN_ALASAN_HAPUS_FINAL), arsipDiunduh: true }) === null)
ok('A5 spasi tidak dihitung huruf',
  alasanTolakHapus('FINAL', { alasan: ' '.repeat(40) + 'abc', arsipDiunduh: true })?.code === 'ALASAN_WAJIB')
ok('A6 FINAL beralasan tapi arsip belum: ditolak', alasanTolakHapus('FINAL', { alasan: ALASAN_SAH })?.code === 'ARSIP_BELUM')
ok('A7 centang false juga ditolak', alasanTolakHapus('FINAL', { alasan: ALASAN_SAH, arsipDiunduh: false })?.code === 'ARSIP_BELUM')
ok('A8 kalimat penolakan menyebut angka batasnya',
  alasanTolakHapus('FINAL', {})!.msg.includes(String(MIN_ALASAN_HAPUS_FINAL)))

// ─── B. Skema ────────────────────────────────────────────────────────────────
console.log('\nB. Skema')
const idSaja = DokumenDeleteSchema.safeParse({ id: '165' })
ok('B1 id saja sah (DRAFT)', idSaja.success && idSaja.data.id === 165)
const dipangkas = DokumenDeleteSchema.safeParse({ id: 1, alasan: '  uji  ' })
ok('B2 alasan dipangkas', dipangkas.success && dipangkas.data.alasan === 'uji')
ok('B3 alasan tepat di batas panjang lolos', DokumenDeleteSchema.safeParse({ id: 1, alasan: 'x'.repeat(BATAS_ALASAN_HAPUS_FINAL) }).success)
const kepanjangan = DokumenDeleteSchema.safeParse({ id: 1, alasan: 'x'.repeat(BATAS_ALASAN_HAPUS_FINAL + 1) })
ok('B4 alasan kepanjangan ditolak di kolom `alasan`, dengan kalimat kita (route menampilkannya apa adanya)',
  !kepanjangan.success && kepanjangan.error.issues[0].path[0] === 'alasan'
  && kepanjangan.error.issues[0].message === `Alasan paling panjang ${BATAS_ALASAN_HAPUS_FINAL} huruf.`)
const idRusak = DokumenDeleteSchema.safeParse({ id: 'abc' })
ok('B5 id rusak ditolak di kolom `id`', !idRusak.success && idRusak.error.issues[0].path[0] === 'id')
ok('B6 id nol/negatif ditolak', !DokumenDeleteSchema.safeParse({ id: 0 }).success && !DokumenDeleteSchema.safeParse({ id: -3 }).success)
ok('B7 arsip_diunduh bukan boolean ditolak ("true" dari pemanggil asal-asalan bukan pernyataan)',
  !DokumenDeleteSchema.safeParse({ id: 1, arsip_diunduh: 'true' }).success)

// ─── C. Sambungan ────────────────────────────────────────────────────────────
console.log('\nC. Sambungan layar & route')
const route = kode('app/api/lkjip/route.ts')
const klien = kode('app/(dashboard)/lkjip/lkjip-client.tsx')
const dialog = kode('components/ui/ConfirmDialog.tsx')

ok('C1 route tidak lagi membaca alasan dari alamat', !route.includes("searchParams.get('alasan')"))
ok('C2 route membaca alasan & pernyataan arsip dari badan permintaan',
  route.includes('alasan: badan?.alasan') && route.includes('arsip_diunduh: badan?.arsip_diunduh'))
ok('C3 route menilai lewat hapusDokumen, tidak membaca status sendiri',
  route.includes('await hapusDokumen(parsed.data.id, { alasan, arsipDiunduh: parsed.data.arsip_diunduh })') && !route.includes('getDokumen'))
ok('C4 "ID tidak valid" hanya untuk kolom id', route.includes("salah.path[0] === 'id' ? 'ID tidak valid' : salah.message"))
ok('C5 jejak audit menyimpan alasan UTUH', route.includes('alasan: ${alasan}`') && !route.includes('alasan.slice'))
ok('C6 jejak audit menyebut pernyataan arsip', route.includes('arsip Word dinyatakan sudah diunduh'))
ok('C7 jejak menyebut kode & judul (dokumennya sudah tiada saat dibaca)',
  route.includes('${doc.canonical_id}') && route.includes('${doc.judul.slice(0, 80)}'))

ok('C8 layar mengirim lewat badan, alamat hanya id', klien.includes('fetch(`/api/lkjip?id=${d.id}`, {') && klien.includes('body: JSON.stringify(isian ?? {})') && !klien.includes('encodeURIComponent'))
ok('C9 centang arsip WAJIB', /centang: \{[\s\S]{0,260}wajib: true/.test(klien))
ok('C10 hasil centang ikut dikirim', klien.includes('arsip_diunduh: hasil.centang'))
ok('C11 batas modal = batas server (konstanta, bukan angka lepas)',
  klien.includes('minLength: MIN_ALASAN_HAPUS_FINAL') && klien.includes('maxLength: BATAS_ALASAN_HAPUS_FINAL'))
ok('C12 petunjuk modal tidak menyebut "orang ini"', klien.includes("petunjuk: 'Tersimpan di jejak audit.'"))
ok('C13 daftar basi dimuat ulang saat ditolak', klien.includes("if (json.code === 'ALASAN_WAJIB' || res.status === 404) void load();"))
ok('C14 kelas `.final` tanpa CSS sudah dibuang', !klien.includes("' final'") && klien.includes('className="lk-act danger"'))

ok('C15 tombol dialog mati selama pernyataan wajib belum dicentang',
  dialog.includes("const belumDicentang = opts.centang?.wajib === true && !centang;") && dialog.includes('disabled={!cukup || belumDicentang}'))
ok('C16 tombol mati menyebut sebabnya', dialog.includes("belumDicentang ? 'Centang dulu pernyataan di atas.'"))
ok('C17 pemakai promptDialog lama tetap berbunyi sama', dialog.includes("opts.petunjuk ?? 'Tersimpan di jejak audit dan garis waktu orang ini.'"))

// ─── D. MySQL ────────────────────────────────────────────────────────────────
console.log('\nD. MySQL kotak pasir 2099')
const TAHUN_UJI = 2099
const AWALAN = 'UJI hapus final'

// Tanpa DB suite ini GAGAL, bukan melompati: bagian D yang diam-diam dilewati terlihat seperti lulus.
const koneksi = await mysql.createConnection({
  host: process.env.MYSQL_HOST, port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER, password: process.env.MYSQL_PASSWORD, database: process.env.MYSQL_DATABASE,
}).catch((e: Error) => { ok('D0 tersambung ke MySQL (jalankan dengan --env-file=.env.local)', false, e.message); return null })

async function bersihkan() {
  await koneksi!.query('DELETE FROM lkjip_dokumen WHERE tahun = ? AND judul LIKE ?', [TAHUN_UJI, `${AWALAN}%`])
}

const hitung = async (tabel: string, id: number) => {
  const [baris] = await koneksi!.query(`SELECT COUNT(*) AS n FROM ${tabel} WHERE dokumen_id = ?`, [id]) as unknown as [Array<{ n: number }>]
  return Number(baris[0].n)
}

if (koneksi) {
  try {
    await bersihkan()
    const [pengguna] = await koneksi.query('SELECT MIN(id) AS id FROM users') as unknown as [Array<{ id: number }>]
    const userId = pengguna[0].id

    // ── DRAFT tanpa syarat apa pun
    const draft = await createDokumen(TAHUN_UJI, `${AWALAN} draft`, userId, 'standar')
    const hDraft = await hapusDokumen(draft.id, {})
    ok('D1 DRAFT terhapus tanpa alasan', hDraft.jenis === 'TERHAPUS' && hDraft.dokumen.status === 'DRAFT')
    ok('D2 baris DRAFT benar-benar hilang', (await getDokumen(draft.id)) === null)

    // ── FINAL: dua penolakan, dokumen utuh
    const { id: idFinal } = await createDokumen(TAHUN_UJI, `${AWALAN} final`, userId, 'standar')
    await finalizeDokumen(idFinal, (await getDokumen(idFinal))!.version, userId)
    const bab = await hitung('lkjip_section', idFinal)
    ok('D3 dokumen uji punya bab', bab > 0, `bab=${bab}`)
    await koneksi.query(
      'INSERT INTO lkjip_versi (dokumen_id, versi_no, label, snapshot, created_by) VALUES (?, 1, ?, ?, ?)',
      [idFinal, 'uji', '{}', userId],
    )
    const t1 = await hapusDokumen(idFinal, { arsipDiunduh: true })
    ok('D4 FINAL tanpa alasan ditolak', t1.jenis === 'DITOLAK' && t1.tolak.code === 'ALASAN_WAJIB')
    const t2 = await hapusDokumen(idFinal, { alasan: ALASAN_SAH })
    ok('D5 FINAL tanpa pernyataan arsip ditolak', t2.jenis === 'DITOLAK' && t2.tolak.code === 'ARSIP_BELUM')
    const utuh = await getDokumen(idFinal)
    ok('D6 sesudah ditolak dokumen tetap FINAL & utuh',
      utuh?.status === 'FINAL' && (await hitung('lkjip_section', idFinal)) === bab && (await hitung('lkjip_versi', idFinal)) === 1)

    // ── FINAL lengkap: hilang bersama isinya
    const hSah = await hapusDokumen(idFinal, SAH)
    ok('D7 FINAL lengkap terhapus & memulangkan identitas untuk audit',
      hSah.jenis === 'TERHAPUS' && hSah.dokumen.status === 'FINAL' && hSah.dokumen.judul === `${AWALAN} final` && hSah.dokumen.canonical_id.startsWith('LKJIP-'))
    ok('D8 baris dokumen hilang', (await getDokumen(idFinal)) === null)
    ok('D9 bab & riwayat versi ikut hilang', (await hitung('lkjip_section', idFinal)) === 0 && (await hitung('lkjip_versi', idFinal)) === 0)
    ok('D10 menghapus yang sudah tiada = TIDAK_ADA', (await hapusDokumen(idFinal, SAH)).jenis === 'TIDAK_ADA')

    // ── Balapan: Finalisasi memegang baris, hapus tanpa alasan datang sesudahnya
    const balap = await createDokumen(TAHUN_UJI, `${AWALAN} balap`, userId, 'standar')
    await koneksi.beginTransaction()
    await koneksi.query("UPDATE lkjip_dokumen SET status = 'FINAL', version = version + 1 WHERE id = ? AND status = 'DRAFT'", [balap.id])
    let janji: Promise<HasilHapusDokumen> | null = null
    let menunggu = false
    try {
      janji = hapusDokumen(balap.id, {})
      const mulai = Date.now()
      while (Date.now() - mulai < 8000) {
        const [w] = await koneksi.query(`
          SELECT COUNT(*) AS n FROM performance_schema.data_lock_waits t
          JOIN performance_schema.data_locks k ON k.ENGINE_LOCK_ID = t.REQUESTING_ENGINE_LOCK_ID
          WHERE k.OBJECT_NAME = 'lkjip_dokumen'`) as unknown as [Array<{ n: number }>]
        if (Number(w[0].n) > 0) { menunggu = true; break }
        await new Promise(r => setTimeout(r, 40))
      }
    } finally {
      await koneksi.commit()
    }
    const hBalap = await janji!
    ok('D11 hapus MENUNGGU Finalisasi yang sedang berjalan', menunggu)
    ok('D12 hapus tanpa alasan ditolak: yang dinilai status SESUDAH Finalisasi',
      hBalap.jenis === 'DITOLAK' && hBalap.tolak.code === 'ALASAN_WAJIB', hBalap.jenis)
    ok('D13 dokumen yang baru difinalkan tetap ada', (await getDokumen(balap.id))?.status === 'FINAL')
  } catch (e) {
    ok('D kotak pasir berjalan tuntas', false, (e as Error).message)
  } finally {
    await bersihkan()
    const [sisa] = await koneksi.query('SELECT COUNT(*) AS n FROM lkjip_dokumen WHERE tahun = ? AND judul LIKE ?', [TAHUN_UJI, `${AWALAN}%`]) as unknown as [Array<{ n: number }>]
    ok('D14 kotak pasir bersih', Number(sisa[0].n) === 0)
    await koneksi.end()
  }
}

console.log(`\n${gagal.length ? 'GAGAL' : 'LULUS'} — ${lulus} lulus, ${gagal.length} gagal`)
process.exit(gagal.length ? 1 : 0)
