// scripts/test-drive-terpusat.mts — Drive satu pintu + folder induk otomatis.
// Konsep: docs/CONCEPT-drive-terpusat.md §6–§7, §14 Tahap 1.
//
//   npx tsx scripts/test-drive-terpusat.mts                         (A–C, tanpa DB & Drive)
//   npx tsx --env-file=.env.local scripts/test-drive-terpusat.mts   (+ D: MySQL, Drive tiruan)
//   UJI_DRIVE_INDUK=<id folder> npx tsx --env-file=.env.local …     (+ E: Drive SUNGGUHAN)
//
// Bagian E membuat subfolder sungguhan di folder induk yang diberikan, lalu mengembalikan
// `app_config` seperti semula. Subfolder-nya DIBIARKAN (memang itu tujuannya) kecuali
// UJI_DRIVE_HAPUS=1 — yang dihapus hanya folder yang DIBUAT oleh uji ini.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { createHash } from 'node:crypto'
import { waktuSekarangWIB } from '../lib/shared/waktu-wib'

/** DATETIME dari mysql2 (pool +07:00) → teks WIB, untuk mengembalikan baris yang dipotret. */
const tglDb = (v: unknown): string | null => (v instanceof Date ? waktuSekarangWIB(v.getTime()) : v == null ? null : String(v))

let lulus = 0
let gagal = 0
function ok(nama: string, syarat: boolean, info = '') {
  if (syarat) { lulus++; console.log(`  ✓ ${nama}`) }
  else { gagal++; console.log(`  ✗ ${nama}${info ? ` — ${info}` : ''}`) }
}
const baca = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n')
const tanpaKomentar = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/ .*$/gm, '')

const T = await import('../lib/services/drive-tujuan')
const D = await import('../lib/services/drive')
const U = await import('../lib/security/unggahan-modul')

// ── A · aturan murni ────────────────────────────────────────────────────────────
console.log('\nA · peta tujuan & folder induk (murni)')
const envLengkap = {
  GOOGLE_DRIVE_FOLDER_ID: 'umum', GOOGLE_DRIVE_FOLDER_ID_LKJIP: 'lkjip', GOOGLE_DRIVE_FOLDER_ID_BBA: 'bba',
  GOOGLE_DRIVE_FOLDER_ID_BLUD_JSON: 'blud', GOOGLE_DRIVE_FOLDER_ID_BACKUP: 'backup',
}
const envUmum = { GOOGLE_DRIVE_FOLDER_ID: 'umum' }
ok('A1 env khusus dipakai per tujuan', T.DRIVE_TUJUAN.every((t) => T.folderDariEnv(t, envLengkap) === ({
  backup_db: 'backup', lkjip: 'lkjip', lkjip_arsip: 'lkjip', blud_json: 'blud', bba: 'bba', usulan: 'umum',
} as const)[t]))
ok('A2 hanya folder umum: unggahan LKJIP/BBA/usulan ikut umum, arsip LKJIP/cadangan BLUD/backup TIDAK',
  T.folderDariEnv('lkjip', envUmum) === 'umum' && T.folderDariEnv('bba', envUmum) === 'umum' && T.folderDariEnv('usulan', envUmum) === 'umum'
  && T.folderDariEnv('lkjip_arsip', envUmum) === '' && T.folderDariEnv('blud_json', envUmum) === '' && T.folderDariEnv('backup_db', envUmum) === '')
ok('A3 env berisi spasi saja = kosong', T.folderDariEnv('bba', { GOOGLE_DRIVE_FOLDER_ID: 'umum', GOOGLE_DRIVE_FOLDER_ID_BBA: '   ' }) === 'umum')
ok('A4 folder induk membuat SEMUA tujuan terkonfigurasi (termasuk yang env-nya kosong)',
  T.DRIVE_TUJUAN.every((t) => T.terkonfigurasiDengan(T.folderIndukDariEnv({ GOOGLE_DRIVE_FOLDER_ID_ROOT: ' induk ' }), t, {})))
ok('A5 tanpa induk & env: arsip LKJIP / cadangan BLUD belum terkonfigurasi', !T.terkonfigurasiDengan('', 'lkjip_arsip', envUmum) && !T.terkonfigurasiDengan('', 'blud_json', {}))
ok('A6 lkjip & lkjip_arsip berbagi SATU subfolder', T.FOLDER_TUJUAN.lkjip === T.FOLDER_TUJUAN.lkjip_arsip)
const namaFolder = Object.values(T.NAMA_SUBFOLDER)
ok('A7 lima subfolder, nama unik & tiap tujuan punya nama', namaFolder.length === 5 && new Set(namaFolder).size === 5
  && T.DRIVE_TUJUAN.every((t) => !!T.NAMA_SUBFOLDER[T.FOLDER_TUJUAN[t]]))
ok('A8 tujuan unggahan per modul', U.tujuanUnggahan('buku_besar_aset') === 'bba' && U.tujuanUnggahan('lkjip') === 'lkjip'
  && U.tujuanUnggahan('usulan_aset') === 'usulan' && U.tujuanUnggahan(null) === 'usulan')

console.log('\nA · peta subfolder di app_config (murni)')
const idA = '1AbcdefghijKLMNOP', idB = '1ZyxwvutsrQPONML'
ok('A9 isi rusak/kosong/tanpa induk = null', T.bacaPetaSubfolder('') === null && T.bacaPetaSubfolder('{bukan json') === null
  && T.bacaPetaSubfolder('[]') === null && T.bacaPetaSubfolder(JSON.stringify({ folder: { bba: idA } })) === null && T.bacaPetaSubfolder(null) === null)
const petaKotor = T.bacaPetaSubfolder(JSON.stringify({ induk: 'X', folder: { bba: idA, usulan: 'a b', lkjip: 7, asing: idB } }))
ok('A10 ID berbentuk aneh & kunci asing dibuang', !!petaKotor && petaKotor.folder.bba === idA && !('usulan' in petaKotor.folder)
  && !('lkjip' in petaKotor.folder) && !('asing' in petaKotor.folder))
ok('A11 peta milik induk lain DIABAIKAN (induk diganti → subfolder baru)', T.subfolderTercatat(petaKotor, 'Y', 'bba') === ''
  && T.subfolderTercatat(petaKotor, 'X', 'bba') === idA && T.subfolderTercatat(null, 'X', 'bba') === '')
const petaBaru = T.catatSubfolder(petaKotor, 'X', 'usulan', idB)
ok('A12 mencatat menambah, tidak menimpa catatan lain', petaBaru.folder.bba === idA && petaBaru.folder.usulan === idB && petaBaru.induk === 'X')
const petaGanti = T.catatSubfolder(petaKotor, 'Y', 'usulan', idB)
ok('A13 induk berganti → catatan induk lama dibuang', petaGanti.induk === 'Y' && !petaGanti.folder.bba && petaGanti.folder.usulan === idB)
ok('A14 bolak-balik JSON utuh', JSON.stringify(T.bacaPetaSubfolder(JSON.stringify(petaBaru))) === JSON.stringify(petaBaru))
ok('A15 kutipan kueri Drive', D.kutipKueriDrive("O'Brien\\x") === "O\\'Brien\\\\x")

console.log('\nA · golongan galat Drive (murni)')
const g = (o: unknown) => D.jenisGalatDrive(o)
ok('A16 403 kuota', g({ response: { status: 403 }, errors: [{ reason: 'storageQuotaExceeded' }] }) === 'quota')
ok('A17 403 lain = izin', g({ response: { status: 403 }, errors: [{ reason: 'insufficientPermissions' }] }) === 'permission')
ok('A18 404', g({ code: 404, message: 'File not found: x.' }) === 'notfound')
ok('A19 invalid_grant / 401 = token', g({ response: { status: 400, data: { error: 'invalid_grant' } } }) === 'token' && g({ status: 401 }) === 'token')
ok('A20 jaringan & lain', g({ code: 'ENOTFOUND' }) === 'jaringan' && g({ code: 'ETIMEDOUT' }) === 'jaringan' && g(new Error('aneh')) === 'lain' && g(null) === 'lain')
const S = await import('../lib/services/drive-status')
console.log('\nA · peringatan backup & isian folder (murni)')
const bb = (ok: string | null, mulai: string, kini: string) => S.backupBasi(ok, mulai, kini).tingkat
ok('A22 belum pernah tercatat = belum', bb(null, '2026-11-16 07:30:00', '2026-11-16 15:00:00') === 'belum')
ok('A23 terakhir > 4 hari = merah', bb('2026-11-10 12:00:00', '2026-11-16 07:30:00', '2026-11-16 08:00:00') === 'merah')
ok('A24 Senin pagi sesudah akhir pekan mati = aman (bukan alarm palsu)', bb('2026-11-13 12:05:00', '2026-11-16 07:30:00', '2026-11-16 08:30:00') === 'aman')
ok('A25 hari ini belum, sudah lewat jadwal+2 jam, hidup sejak pagi = kuning', bb('2026-11-15 12:00:00', '2026-11-16 07:30:00', '2026-11-16 14:30:00') === 'kuning')
ok('A26 restart siang (hidup < 2 jam) = aman', bb('2026-11-15 12:00:00', '2026-11-16 13:00:00', '2026-11-16 14:30:00') === 'aman')
ok('A27 belum lewat jadwal+2 jam = aman', bb('2026-11-15 12:00:00', '2026-11-16 07:30:00', '2026-11-16 13:30:00') === 'aman')
ok('A28 sudah ada backup hari ini = aman', bb('2026-11-16 12:01:00', '2026-11-16 07:30:00', '2026-11-16 15:00:00') === 'aman')
ok('A29 proses yang hidup sejak kemarin = kuning juga', bb('2026-11-15 12:00:00', '2026-11-15 07:00:00', '2026-11-16 14:10:00') === 'kuning')
ok('A30 laptop baru dinyalakan sore = aman (belum 2 jam)', bb('2026-11-15 12:00:00', '2026-11-16 15:00:00', '2026-11-16 16:00:00') === 'aman')
ok('A31 URL folder yang ditempel → ID', S.bacaIdFolder(' https://drive.google.com/drive/folders/1UEBFTorLarSsE9J7bAAZk9?usp=sharing ') === '1UEBFTorLarSsE9J7bAAZk9'
  && S.bacaIdFolder('https://drive.google.com/drive/u/0/folders/AbC_d-123456789') === 'AbC_d-123456789'
  && S.bacaIdFolder('https://drive.google.com/open?id=XyZ123456789ab') === 'XyZ123456789ab' && S.bacaIdFolder('1abcDEF234567') === '1abcDEF234567')
ok('A32 ID folder: URL & spasi bukan ID', T.POLA_ID_DRIVE.test('1UEBFTorLarSsE9J7bAAZk9jJmSrwQg7K') && !T.POLA_ID_DRIVE.test('https://drive.google.com/x') && !T.POLA_ID_DRIVE.test('ab cd efgh ij'))
ok('A33 tiap kode uji punya saran', ['quota', 'permission', 'notfound', 'token', 'jaringan', 'lain', 'kosong', 'lama_tak_terbaca'].every((k) => !!S.SARAN_KODE[k as keyof typeof S.SARAN_KODE]))
ok('A34 ukuran berkas', S.ukuranBerkas(4_800_000) === '4,6 MB' && S.ukuranBerkas(null) === '—' && S.ukuranBerkas(512) === '512 B')
ok('A21 kodeGalatDrive tidak berubah arti (tetap kode HTTP)', D.kodeGalatDrive({ code: 404 }) === 404 && D.kodeGalatDrive({ code: 'ENOTFOUND' }) === null)

// ── B · satu pintu (statis) ─────────────────────────────────────────────────────
console.log('\nB · satu pintu kredensial & folder (statis)')
function semuaBerkas(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    if (n === 'node_modules' || n.startsWith('.')) return []
    return statSync(p).isDirectory() ? semuaBerkas(p) : /\.(ts|tsx|mts|js|mjs)$/.test(n) ? [p] : []
  })
}
const sumber = ['app', 'lib', 'components'].flatMap(semuaBerkas).map((p) => relative('.', p).replace(/\\/g, '/'))
const bacaEnvFolder = sumber.filter((p) => p !== 'lib/services/drive-tujuan.ts' && /process\.env\.GOOGLE_DRIVE_FOLDER_ID/.test(tanpaKomentar(baca(p))))
ok('B1 tidak ada process.env.GOOGLE_DRIVE_FOLDER_ID* di luar drive-tujuan.ts', bacaEnvFolder.length === 0, bacaEnvFolder.join(', '))
const klienLain = sumber.filter((p) => p !== 'lib/services/drive.ts' && /google\.drive\(|new google\.auth\.OAuth2/.test(tanpaKomentar(baca(p))))
ok('B2 tidak ada klien Drive kedua di app/ lib/ components/', klienLain.length === 0, klienLain.join(', '))
const unggah = tanpaKomentar(baca('app/api/upload/route.ts'))
ok('B3 /api/upload lewat unggahKeTujuan (folder + manifest + kesehatan)', unggah.includes('await unggahKeTujuan(tujuanUnggahan(modulAsal),') && !unggah.includes('uploadBufferToDrive(') && !unggah.includes('googleapis'))
const unduh = tanpaKomentar(baca('app/api/upload/download/route.ts'))
ok('B4 /api/upload/download memakai klien bersama', unduh.includes("import { getDriveClient, kodeGalatDrive } from '@/lib/services/drive'") && !unduh.includes('googleapis'))
const versi = tanpaKomentar(baca('app/api/lkjip/[id]/versi/route.ts'))
ok('B5 arsip versi LKJIP: tujuan lkjip_arsip, status tanpa menyentuh Drive', versi.includes("await tujuanTerkonfigurasi('lkjip_arsip')") && versi.includes("await unggahKeTujuan('lkjip_arsip',"))
ok('B6 impor Word LKJIP: tujuan lkjip (bukan folder umum langsung)', tanpaKomentar(baca('app/api/lkjip/impor/route.ts')).includes("await unggahKeTujuan('lkjip',"))
const cadangan = tanpaKomentar(baca('lib/blud/cadangan-json.ts'))
ok('B7 cadangan BLUD: status tanpa Drive, unggahan lewat unggahKeTujuan', cadangan.includes("aktif:    await tujuanTerkonfigurasi('blud_json')") && cadangan.includes("await unggahKeTujuan('blud_json',"))
const unggahLangsung = sumber.filter((p) => !['lib/services/drive.ts', 'lib/services/drive-catatan.ts', 'lib/services/drive-uji.ts'].includes(p) && /uploadBufferToDrive\(/.test(tanpaKomentar(baca(p))))
ok('B7b tidak ada unggahan yang melewati catatan (uploadBufferToDrive hanya di drive*.ts)', unggahLangsung.length === 0, unggahLangsung.join(', '))
const catatan = tanpaKomentar(baca('lib/services/drive-catatan.ts'))
const iUnggah = catatan.indexOf('await uploadBufferToDrive('), iArsip = catatan.indexOf('catatArsip({ tujuan, fileId: hasil.fileId')
ok('B7c manifest ditulis SESUDAH unggahan berhasil', iUnggah > 0 && iArsip > iUnggah)
ok('B7d folder belum diatur tidak dicatat sebagai gagal sambungan', catatan.includes('if (!(e instanceof FolderBelumDiaturError)) await catatKesehatan(tujuan, e);'))

console.log('\nB · panel & tombol Uji')
const rute = tanpaKomentar(baca('app/api/admin/drive/route.ts'))
ok('B16 /api/admin/drive SUPER_ADMIN saja (GET & POST)', rute.includes("return session?.role === 'SUPER_ADMIN' ? session : null;")
  && (rute.match(/const session = await sesiSuperAdmin\(\);\s*if \(!session\) return NextResponse\.json\(\{ ok: false, message: 'Unauthorized' \}, \{ status: 403 \}\);/g) ?? []).length === 2)
ok('B17 Uji dibatasi 1 per 30 detik & diaudit DRIVE_UJI', rute.includes('checkRateLimit(`drive-uji:${session.userId}`, 1, 30)') && rute.includes("eventType: 'DRIVE_UJI'"))
ok('B18 ubah folder induk diaudit DRIVE_FOLDER_UBAH dengan nilai lama & baru', rute.includes("eventType: 'DRIVE_FOLDER_UBAH'") && rute.includes('const lama = await folderInduk();'))
const { RETENSI_PERISTIWA } = await import('../lib/security/retensi-audit')
ok('B19 retensi audit: folder 5 tahun, uji 12 bulan', RETENSI_PERISTIWA.DRIVE_FOLDER_UBAH === 'PANJANG' && RETENSI_PERISTIWA.DRIVE_UJI === 'PENDEK')
const uji = tanpaKomentar(baca('lib/services/drive-uji.ts'))
const badanStatus = uji.slice(uji.indexOf('export async function bacaStatusDrive'))
ok('B20 status panel tidak memanggil Google & tidak membuat folder', badanStatus.length > 100 && !/getDriveClient|folderUntuk|infoKuota|uploadBufferToDrive/.test(badanStatus))
ok('B21 Uji memeriksa berkas LAMA (A15), bukan hanya menulis baru', uji.includes("baris.kode = 'lama_tak_terbaca';") && uji.includes('const lama = await berkasLama(tujuan);'))
ok('B22 berkas uji selalu dihapus (finally) & sisa dilaporkan', /finally \{\s*try \{ await drive\.files\.delete\(\{ fileId \}\); \}\s*catch \{ return \{ ms: Date\.now\(\) - t0, sisaProbe: fileId \}; \}/.test(uji))
const mig = baca('docs/migrations/migration-drive-arsip.sql'), skema = baca('docs/schema-mysql.sql')
const tabel = (src: string, n: string) => src.slice(src.indexOf(`CREATE TABLE IF NOT EXISTS ${n} (`)).split(') ENGINE')[0]
ok('B23 skema acuan = migrasi untuk kedua tabel', ['drive_arsip', 'drive_health'].every((n) => tabel(mig, n).length > 50 && tabel(mig, n) === tabel(skema, n)))
const admin = baca('app/(dashboard)/admin/admin-client.tsx')
ok('B24 tab Drive & Backup hanya untuk SUPER_ADMIN', admin.includes("...(isSA ? [{ id:'drive-backup' as Tab") && admin.includes("{tab === 'drive-backup'    && isSA && <TabDriveBackup/>}"))

const tujuanSrc = tanpaKomentar(baca('lib/services/drive-tujuan.ts'))
const badanBuat = tujuanSrc.slice(tujuanSrc.indexOf('withTransaction(async ({ tx }) => {'), tujuanSrc.indexOf('.finally('))
const iKunci = badanBuat.indexOf('await acquireBludLock(tx, ENTITAS_KUNCI'), iBaca = badanBuat.indexOf('await bacaPeta(tx)'), iBuat = badanBuat.indexOf('await cariAtauBuatFolder(')
ok('B8 subfolder dibuat di bawah kunci: kunci → baca ulang → cari/buat (L84)', iKunci >= 0 && iBaca > iKunci && iBuat > iBaca)
ok('B9 mode induk TIDAK jatuh ke env lama', /return induk \? subfolderOtomatis\(induk, FOLDER_TUJUAN\[tujuan\]\) : folderDariEnv\(tujuan, env\);/.test(tujuanSrc))

console.log('\nB · skrip backup sepakat dengan aplikasi')
const skrip = baca('scripts/backup-db.js')
const konst = (n: string) => skrip.match(new RegExp(`const ${n} = '([^']+)'`))?.[1]
ok('B10 nama subfolder backup sama', konst('NAMA_SUBFOLDER_BACKUP') === T.NAMA_SUBFOLDER.backup_db, String(konst('NAMA_SUBFOLDER_BACKUP')))
ok('B11 kunci app_config sama', konst('KUNCI_PETA_SUBFOLDER') === T.KUNCI_PETA_SUBFOLDER)
ok('B12 kunci blud_locks sama (drive_folder:otomatis) & dipegang SEBELUM membaca peta',
  tujuanSrc.includes("const ENTITAS_KUNCI = 'drive_folder'") && tujuanSrc.includes("acquireBludLock(tx, ENTITAS_KUNCI, 'otomatis')")
  && skrip.indexOf("key_id = 'otomatis' FOR UPDATE") >= 0 && skrip.indexOf("key_id = 'otomatis' FOR UPDATE") < skrip.indexOf('[KUNCI_PETA_SUBFOLDER]);'))
ok('B13 skrip memakai kunci peta "backup_db" yang sama dengan FOLDER_TUJUAN', T.FOLDER_TUJUAN.backup_db === 'backup_db' && skrip.includes('peta.folder.backup_db') && skrip.includes('backup_db: id'))
ok('B14 folder induk mengalahkan _BACKUP di skrip', /if \(!induk\) return requireEnv\('GOOGLE_DRIVE_FOLDER_ID_BACKUP'\);/.test(skrip))
ok('B15 folder gagal disiapkan: dump tetap dibuat & diantrekan', skrip.includes("log('FOLDER-FAIL'") && skrip.includes("if (!folderId) throw new Error('folder backup belum siap');"))
ok('B25 nama berkas backup ber-jam WIB (A16)', skrip.includes('new Date(sekarang + JAKARTA_OFFSET_MS).toISOString()') && skrip.includes('const fileName = namaBerkasBackup();')
  && !skrip.includes("new Date().toISOString().replace(/[:T]/g, '-')"))
ok('B26 galat fatal dilempar (bukan exit) supaya sempat dicatat', /function fail\(msg\) \{\s*throw new FatalError\(msg\);\s*\}/.test(skrip) && skrip.includes("await catatKesehatan(e, 'lain');"))
ok('B27 rotasi berdasarkan manifest, baris tidak dihapus (dihapus_pada)', skrip.includes("FROM drive_arsip WHERE tujuan = 'backup_db' AND dihapus_pada IS NULL ORDER BY dibuat_pada DESC")
  && skrip.includes('UPDATE drive_arsip SET dihapus_pada = NOW() WHERE id = ?') && !/DELETE FROM drive_arsip/.test(skrip))
ok('B28 manifest ditulis SESUDAH unggah berhasil', skrip.indexOf('await catatArsip({ fileId: res.data.id') > skrip.indexOf('const res = await drive.files.create({\n    requestBody: { name: path.basename(filePath)'))
ok('B29 kunci anti-tumpang-tindih: diambil sebelum kerja, dilepas di finally', skrip.includes('if (!ambilKunci()) {') && /\} finally \{\s*lepasKunci\(\);\s*\}/.test(skrip) && skrip.includes("flag: 'wx'"))
ok('B30 skrip membaca folder induk panel (drive_root) sebelum env', skrip.includes("const KUNCI_FOLDER_INDUK = 'drive_root';") && T.KUNCI_FOLDER_INDUK === 'drive_root'
  && skrip.indexOf('[KUNCI_FOLDER_INDUK]') > 0 && skrip.indexOf('[KUNCI_FOLDER_INDUK]') < skrip.indexOf("return (process.env.GOOGLE_DRIVE_FOLDER_ID_ROOT ?? '').trim();"))


// ── D · MySQL sungguhan, Drive tiruan ──────────────────────────────────────────
const adaDb = !!process.env.MYSQL_DATABASE
if (!adaDb) console.log('\nD · dilewati (jalankan dengan --env-file=.env.local)')
else {
  console.log('\nD · folderUntuk + app_config + kunci (MySQL, Drive tiruan)')
  const { sql } = await import('../lib/data/db')
  const KREDENSIAL = ['GOOGLE_OAUTH_CLIENT_ID', 'GOOGLE_OAUTH_CLIENT_SECRET', 'GOOGLE_OAUTH_REFRESH_TOKEN'] as const
  const kredAsli = KREDENSIAL.map((k) => process.env[k])
  const lama = (await sql`SELECT value FROM app_config WHERE \`key\` = ${T.KUNCI_PETA_SUBFOLDER} LIMIT 1` as { value: string }[])[0]?.value ?? null
  try {
    await sql`DELETE FROM app_config WHERE \`key\` = ${T.KUNCI_PETA_SUBFOLDER}`
    const { google } = await import('googleapis')
    const asli = google.drive
    const dibuat: string[] = []
    let daftarDipanggil = 0
    // Drive tiruan: list selalu kosong (folder baru), create memulangkan ID berurutan.
    ;(google as unknown as { drive: unknown }).drive = () => ({
      files: {
        list: async () => { daftarDipanggil++; await new Promise((r) => setTimeout(r, 30)); return { data: { files: [] } } },
        create: async (o: { requestBody: { name: string } }) => { const id = `UJI${String(dibuat.length + 1).padStart(12, '0')}`; dibuat.push(`${o.requestBody.name}=${id}`); return { data: { id } } },
      },
    })
    for (const k of KREDENSIAL) process.env[k] = 'x'
    const env = { ...process.env }
    const induk = 'INDUKUJI0000000001'
    const envInduk = { ...env, GOOGLE_DRIVE_FOLDER_ID_ROOT: induk, GOOGLE_DRIVE_FOLDER_ID_BBA: 'jangan-dipakai' }
    const serentak = await Promise.all([
      T.folderUntuk('lkjip', envInduk), T.folderUntuk('lkjip_arsip', envInduk), T.folderUntuk('lkjip', envInduk),
      T.folderUntuk('bba', envInduk), T.folderUntuk('bba', envInduk),
    ])
    ok('D1 panggilan serentak: lkjip & lkjip_arsip satu folder, satu folder per tujuan', serentak[0] === serentak[1] && serentak[1] === serentak[2] && serentak[3] === serentak[4] && serentak[0] !== serentak[3])
    ok('D2 hanya DUA folder dibuat (bukan lima)', dibuat.length === 2, dibuat.join(' · '))
    ok('D3 folder induk mengalahkan env khusus', serentak[3] !== 'jangan-dipakai')
    const peta = T.bacaPetaSubfolder((await sql`SELECT value FROM app_config WHERE \`key\` = ${T.KUNCI_PETA_SUBFOLDER}` as { value: string }[])[0]?.value)
    ok('D4 tercatat di app_config, terikat induknya', peta?.induk === induk && peta.folder.lkjip === serentak[0] && peta.folder.bba === serentak[3])
    const sebelum = dibuat.length
    ok('D5 tujuan lain menambah catatan tanpa menimpa', (await T.folderUntuk('usulan', envInduk)) !== serentak[0] && dibuat.length === sebelum + 1)
    const p2 = T.bacaPetaSubfolder((await sql`SELECT value FROM app_config WHERE \`key\` = ${T.KUNCI_PETA_SUBFOLDER}` as { value: string }[])[0]?.value)
    ok('D6 …catatan lama tetap ada', p2?.folder.lkjip === serentak[0] && p2?.folder.bba === serentak[3] && !!p2?.folder.usulan)
    const listSebelum = daftarDipanggil
    await T.folderUntuk('bba', envInduk)
    ok('D7 panggilan berikutnya tanpa menyentuh Drive', daftarDipanggil === listSebelum && dibuat.length === sebelum + 1)
    const lain = await T.folderUntuk('bba', { ...envInduk, GOOGLE_DRIVE_FOLDER_ID_ROOT: 'INDUKLAIN000000002' })
    const p3 = T.bacaPetaSubfolder((await sql`SELECT value FROM app_config WHERE \`key\` = ${T.KUNCI_PETA_SUBFOLDER}` as { value: string }[])[0]?.value)
    ok('D8 induk diganti → subfolder baru di induk baru, catatan induk lama dibuang', lain !== serentak[3] && p3?.induk === 'INDUKLAIN000000002' && !p3.folder.lkjip)
    ok('D9 tanpa induk → env seperti dulu, tanpa Drive', (await T.folderUntuk('bba', { GOOGLE_DRIVE_FOLDER_ID: 'umum' })) === 'umum' && (await T.folderUntuk('blud_json', {})) === '')
    ;(google as unknown as { drive: unknown }).drive = asli
    // Gagal di Drive → melempar (tidak jatuh diam-diam ke env lama) dan tidak mencatat apa pun.
    ;(google as unknown as { drive: unknown }).drive = () => ({ files: { list: async () => { throw Object.assign(new Error('File not found'), { code: 404 }) }, create: async () => ({ data: {} }) } })
    let dilempar = false
    try { await T.folderUntuk('blud_json', { ...envInduk, GOOGLE_DRIVE_FOLDER_ID_ROOT: 'INDUKSALAH00000003' }) } catch { dilempar = true }
    const p4 = T.bacaPetaSubfolder((await sql`SELECT value FROM app_config WHERE \`key\` = ${T.KUNCI_PETA_SUBFOLDER}` as { value: string }[])[0]?.value)
    ok('D10 induk salah → melempar, catatan tidak berubah', dilempar && p4?.induk === 'INDUKLAIN000000002')
    ;(google as unknown as { drive: unknown }).drive = asli

    // Folder induk dari panel (app_config drive_root) mengalahkan env.
    await T.aturFolderInduk('INDUKPANEL00000004')
    const dariPanel = await T.folderInduk({ GOOGLE_DRIVE_FOLDER_ID_ROOT: 'INDUKENV000000005' })
    await T.aturFolderInduk('')
    const sesudahKosong = await T.folderInduk({ GOOGLE_DRIVE_FOLDER_ID_ROOT: 'INDUKENV000000005' })
    ok('D11 folder induk panel mengalahkan env; dikosongkan → kembali ke env', dariPanel.id === 'INDUKPANEL00000004' && dariPanel.asal === 'panel'
      && sesudahKosong.id === 'INDUKENV000000005' && sesudahKosong.asal === 'env')
    let tolakId = false
    try { await T.aturFolderInduk('https://drive.google.com/x') } catch { tolakId = true }
    ok('D12 isian bukan ID ditolak di lapisan data juga', tolakId)

    // unggahKeTujuan: manifest + kesehatan (Drive tiruan).
    const C = await import('../lib/services/drive-catatan')
    const kesehatanLama = await sql`SELECT * FROM drive_health WHERE tujuan = 'usulan'` as Record<string, unknown>[]
    await sql`DELETE FROM drive_health WHERE tujuan = 'usulan'`
    ;(google as unknown as { drive: unknown }).drive = () => ({ files: {
      list: async () => ({ data: { files: [{ id: 'UJIFOLDERUSULAN01' }] } }),
      create: async (o: { requestBody: { name: string } }) => ({ data: { id: 'UJIBERKAS00000000001', name: o.requestBody.name, size: '5' } }),
    } })
    const up = await C.unggahKeTujuan('usulan', { buffer: Buffer.from('halo!'), name: 'uji.txt', mimeType: 'text/plain' })
    const ars = (await sql`SELECT tujuan, nama, ukuran, sha256, folder_id FROM drive_arsip WHERE file_id = 'UJIBERKAS00000000001'` as Record<string, unknown>[])[0]
    const kes1 = (await sql`SELECT jumlah_ok, jumlah_gagal FROM drive_health WHERE tujuan = 'usulan'` as Record<string, unknown>[])[0]
    ok('D13 unggahan tercatat di manifest (ukuran, sha256, folder) & kesehatan ok', up.fileId === 'UJIBERKAS00000000001' && ars?.tujuan === 'usulan' && Number(ars?.ukuran) === 5
      && ars?.sha256 === createHash('sha256').update('halo!').digest('hex')
      && ars?.folder_id === up.folderId && Number(kes1?.jumlah_ok) === 1 && Number(kes1?.jumlah_gagal) === 0)
    ;(google as unknown as { drive: unknown }).drive = () => ({ files: {
      list: async () => ({ data: { files: [{ id: 'UJIFOLDERUSULAN01' }] } }),
      create: async () => { throw Object.assign(new Error('The user has exceeded their Drive storage quota'), { response: { status: 403 }, errors: [{ reason: 'storageQuotaExceeded' }] }) },
    } })
    let galatUnggah = false
    try { await C.unggahKeTujuan('usulan', { buffer: Buffer.from('x'), name: 'uji2.txt', mimeType: 'text/plain' }) } catch { galatUnggah = true }
    const kes2 = (await sql`SELECT jumlah_ok, jumlah_gagal, kode, pesan FROM drive_health WHERE tujuan = 'usulan'` as Record<string, unknown>[])[0]
    ok('D14 unggahan gagal: tetap melempar, tercatat gagal dengan golongan kuota', galatUnggah && Number(kes2?.jumlah_gagal) === 1 && kes2?.kode === 'quota' && String(kes2?.pesan).includes('quota'))
    const envBlud = process.env.GOOGLE_DRIVE_FOLDER_ID_BLUD_JSON
    delete process.env.GOOGLE_DRIVE_FOLDER_ID_BLUD_JSON
    const kesBludSebelum = (await sql`SELECT COUNT(*) AS n FROM drive_health WHERE tujuan = 'blud_json'` as { n: unknown }[])[0]?.n
    let belumDiatur: unknown = null
    try { await C.unggahKeTujuan('blud_json', { buffer: Buffer.from('x'), name: 'x', mimeType: 'text/plain' }) } catch (e) { belumDiatur = e }
    if (envBlud !== undefined) process.env.GOOGLE_DRIVE_FOLDER_ID_BLUD_JSON = envBlud
    const kesBludSesudah = (await sql`SELECT COUNT(*) AS n FROM drive_health WHERE tujuan = 'blud_json'` as { n: unknown }[])[0]?.n
    ok('D15 folder belum diatur: ditolak jelas, TIDAK dicatat sebagai gagal sambungan',
      belumDiatur instanceof C.FolderBelumDiaturError && Number(kesBludSesudah) === Number(kesBludSebelum))
    // Tombol Uji dengan Drive tiruan: berkas lama berawalan UJIKARANGAN "tidak ada" (404).
    const U = await import('../lib/services/drive-uji')
    const kesSemua = await sql`SELECT * FROM drive_health` as Record<string, unknown>[]
    await sql`INSERT INTO drive_arsip (tujuan, file_id, nama, sumber) VALUES ('backup_db', 'UJIKARANGAN000000000001', 'prima-db-karangan.sql.gz.enc', 'backup_db')`
    let probeTerhapus = 0
    ;(google as unknown as { drive: unknown }).drive = () => ({
      about: { get: async () => ({ data: { user: { emailAddress: 'uji@contoh.test' }, storageQuota: { usage: '10', limit: '100' } } }) },
      files: {
        list: async () => ({ data: { files: [] } }),
        create: async () => ({ data: { id: `UJIPROBE${Date.now()}${Math.random().toString(36).slice(2, 8)}`, name: 'p', size: '30' } }),
        get: async (o: { fileId: string }) => { if (o.fileId.startsWith('UJIKARANGAN')) throw Object.assign(new Error('File not found'), { code: 404 }); return { data: { id: o.fileId } } },
        delete: async () => { probeTerhapus++; return { data: {} } },
      },
    })
    const hasilTiruan = await U.ujiDrive()
    const bTiruan = hasilTiruan.tujuan.find((t) => t.tujuan === 'backup_db')
    ok('D16 Uji: berkas lama tak terbaca → lama_tak_terbaca, bukan hijau', bTiruan?.kode === 'lama_tak_terbaca' && !bTiruan.ok && bTiruan.lama.diperiksa === 1 && bTiruan.lama.terbaca === 0, JSON.stringify(bTiruan))
    const terdiatur = hasilTiruan.tujuan.filter((t) => t.kode !== 'kosong')
    ok('D17 Uji: tujuan lain hijau, berkas uji dihapus sekali per FOLDER (lkjip & arsip berbagi bila sama)',
      terdiatur.filter((t) => t.tujuan !== 'backup_db').every((t) => t.ok) && probeTerhapus === new Set(terdiatur.map((t) => t.folderId)).size, String(probeTerhapus))
    const kesBackup = (await sql`SELECT kode FROM drive_health WHERE tujuan = 'backup_db'` as { kode: string }[])[0]
    ok('D18 kegagalan Uji tercatat di kesehatan dengan kodenya', kesBackup?.kode === 'lama_tak_terbaca')
    await sql`DELETE FROM drive_arsip WHERE file_id = 'UJIKARANGAN000000000001'`
    await sql`DELETE FROM app_config WHERE \`key\` = ${U.KUNCI_UJI_TERAKHIR}`
    await sql`DELETE FROM drive_health`
    for (const r of kesSemua) {
      await sql`INSERT INTO drive_health (tujuan, terakhir_ok_at, terakhir_gagal_at, pesan, kode, jumlah_ok, jumlah_gagal)
                VALUES (${String(r.tujuan)}, ${tglDb(r.terakhir_ok_at)}, ${tglDb(r.terakhir_gagal_at)}, ${r.pesan as string | null}, ${r.kode as string | null}, ${Number(r.jumlah_ok)}, ${Number(r.jumlah_gagal)})`
    }

    ;(google as unknown as { drive: unknown }).drive = asli
    await sql`DELETE FROM drive_arsip WHERE file_id LIKE 'UJI%'`
    await sql`DELETE FROM drive_health WHERE tujuan = 'usulan'`
    for (const r of kesehatanLama) {
      await sql`INSERT INTO drive_health (tujuan, terakhir_ok_at, terakhir_gagal_at, pesan, kode, jumlah_ok, jumlah_gagal)
                VALUES (${String(r.tujuan)}, ${tglDb(r.terakhir_ok_at)}, ${tglDb(r.terakhir_gagal_at)}, ${r.pesan as string | null}, ${r.kode as string | null}, ${Number(r.jumlah_ok)}, ${Number(r.jumlah_gagal)})`
    }
  } finally {
    KREDENSIAL.forEach((k, i) => { if (kredAsli[i] === undefined) delete process.env[k]; else process.env[k] = kredAsli[i] })
    await sql`DELETE FROM app_config WHERE \`key\` = ${T.KUNCI_FOLDER_INDUK} AND value LIKE 'INDUK%'`
    await sql`DELETE FROM drive_arsip WHERE file_id LIKE 'UJI%'`.then(() => undefined, () => undefined)
    await sql`DELETE FROM app_config WHERE \`key\` = ${T.KUNCI_PETA_SUBFOLDER}`
    if (lama !== null) await sql`INSERT INTO app_config (\`key\`, value) VALUES (${T.KUNCI_PETA_SUBFOLDER}, ${lama})`
    await sql`DELETE FROM blud_locks WHERE entity = 'drive_folder' AND key_id = 'otomatis'`
  }
}

// ── E · Drive sungguhan (opsional) ─────────────────────────────────────────────
const indukNyata = process.env.UJI_DRIVE_INDUK?.trim()
if (!indukNyata || !adaDb) console.log('\nE · dilewati (UJI_DRIVE_INDUK + --env-file=.env.local)')
else {
  console.log('\nE · Drive sungguhan')
  const { sql } = await import('../lib/data/db')
  const lama = (await sql`SELECT value FROM app_config WHERE \`key\` = ${T.KUNCI_PETA_SUBFOLDER} LIMIT 1` as { value: string }[])[0]?.value ?? null
  const drive = D.getDriveClient()
  const dibuatUji: string[] = []
  const kesehatanAwal = await sql`SELECT * FROM drive_health` as Record<string, unknown>[]
  try {
    await sql`DELETE FROM app_config WHERE \`key\` = ${T.KUNCI_PETA_SUBFOLDER}`
    const sebelum = new Map<string, string[]>()
    for (const nama of Object.values(T.NAMA_SUBFOLDER)) {
      const r = await drive.files.list({ q: `'${indukNyata}' in parents and name = '${D.kutipKueriDrive(nama)}' and trashed = false`, fields: 'files(id)' })
      sebelum.set(nama, (r.data.files ?? []).map((f) => f.id!))
    }
    const env = { ...process.env, GOOGLE_DRIVE_FOLDER_ID_ROOT: indukNyata }
    const pertama = Object.fromEntries(await Promise.all(T.DRIVE_TUJUAN.map(async (t) => [t, await T.folderUntuk(t, env)] as const)))
    for (const [k, id] of Object.entries(T.bacaPetaSubfolder((await sql`SELECT value FROM app_config WHERE \`key\` = ${T.KUNCI_PETA_SUBFOLDER}` as { value: string }[])[0]?.value)?.folder ?? {})) {
      if (!(sebelum.get(T.NAMA_SUBFOLDER[k as keyof typeof T.NAMA_SUBFOLDER]) ?? []).includes(id as string)) dibuatUji.push(id as string)
    }
    ok('E1 lima subfolder di induk sungguhan', new Set(Object.values(pertama)).size === 5, JSON.stringify(pertama))
    // Tanpa catatan app_config (mis. server lain): pencarian nama harus MENEMUKAN folder yang sama.
    const kedua = await D.cariAtauBuatFolder(indukNyata, T.NAMA_SUBFOLDER.bba)
    ok('E2 pencarian menemukan subfolder buatan aplikasi di induk buatan tangan (drive.file)', !kedua.dibuat && kedua.id === pertama.bba, JSON.stringify(kedua))
    let jumlahBba = 0
    const r = await drive.files.list({ q: `'${indukNyata}' in parents and name = '${D.kutipKueriDrive(T.NAMA_SUBFOLDER.bba)}' and trashed = false`, fields: 'files(id)' })
    jumlahBba = r.data.files?.length ?? 0
    ok('E3 tidak ada folder kembar', jumlahBba === 1, String(jumlahBba))
    const probe = await D.uploadBufferToDrive({ buffer: Buffer.from('PRIMA-DRIVE-TEST'), name: `prima-uji-${Date.now()}.txt`, mimeType: 'text/plain', folderId: pertama.usulan })
    ok('E4 unggah ke subfolder berhasil & ukuran dilaporkan', !!probe.fileId && probe.size === 16)
    const izin = await drive.files.get({ fileId: pertama.usulan, fields: 'permissions(type,role)' }).catch(() => null)
    const publik = (izin?.data.permissions ?? []).some((p) => p.type === 'anyone')
    console.log(`    ℹ subfolder ${publik ? 'MEWARISI akses "siapa pun yang punya tautan" dari folder induk' : 'privat (tidak ada akses "siapa pun")'}`)
    await drive.files.delete({ fileId: probe.fileId })
    // Uji "baca berkas lama" (§8.2 no. 5): ID karangan di manifest backup → merah, tujuan lain tetap hijau.
    const U = await import('../lib/services/drive-uji')
    await sql`INSERT INTO drive_arsip (tujuan, file_id, nama, sumber) VALUES ('backup_db', 'UJIKARANGAN000000000001', 'prima-db-karangan.sql.gz.enc', 'backup_db')`
    const hasilUji = await U.ujiDrive()
    const ujiBackup = hasilUji.tujuan.find((t) => t.tujuan === 'backup_db')
    ok('E5 Uji: berkas lama yang tak terbaca → lama_tak_terbaca (bukan hijau)', ujiBackup?.kode === 'lama_tak_terbaca' && !ujiBackup.ok, JSON.stringify(ujiBackup))
    ok('E6 Uji: tujuan lain hijau, akun & kuota terbaca', hasilUji.tujuan.filter((t) => t.tujuan !== 'backup_db').every((t) => t.ok) && !!hasilUji.akun?.email)
    await sql`DELETE FROM drive_arsip WHERE file_id = 'UJIKARANGAN000000000001'`
    await sql`DELETE FROM app_config WHERE \`key\` = ${U.KUNCI_UJI_TERAKHIR}`
  } finally {
    await sql`DELETE FROM app_config WHERE \`key\` = ${T.KUNCI_PETA_SUBFOLDER}`
    if (lama !== null) await sql`INSERT INTO app_config (\`key\`, value) VALUES (${T.KUNCI_PETA_SUBFOLDER}, ${lama})`
    await sql`DELETE FROM blud_locks WHERE entity = 'drive_folder' AND key_id = 'otomatis'`
    // Uji menulis drive_health sungguhan — kembalikan seperti sebelum bagian E.
    await sql`DELETE FROM drive_health`
    for (const r of kesehatanAwal) {
      await sql`INSERT INTO drive_health (tujuan, terakhir_ok_at, terakhir_gagal_at, pesan, kode, jumlah_ok, jumlah_gagal)
                VALUES (${String(r.tujuan)}, ${tglDb(r.terakhir_ok_at)}, ${tglDb(r.terakhir_gagal_at)}, ${r.pesan as string | null}, ${r.kode as string | null}, ${Number(r.jumlah_ok)}, ${Number(r.jumlah_gagal)})`
    }
    if (process.env.UJI_DRIVE_HAPUS === '1') {
      for (const id of dibuatUji) await drive.files.delete({ fileId: id }).catch((e) => console.log('    gagal hapus', id, e.message))
      console.log(`    ${dibuatUji.length} subfolder buatan uji dihapus`)
    }
  }
}

console.log(`\n${lulus} lulus, ${gagal} gagal`)
process.exit(gagal ? 1 : 0)
