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
  T.DRIVE_TUJUAN.every((t) => T.tujuanTerkonfigurasi(t, { GOOGLE_DRIVE_FOLDER_ID_ROOT: ' induk ' })))
ok('A5 tanpa induk & env: arsip LKJIP / cadangan BLUD belum terkonfigurasi', !T.tujuanTerkonfigurasi('lkjip_arsip', envUmum) && !T.tujuanTerkonfigurasi('blud_json', {}))
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
ok('B3 /api/upload lewat folderUntuk + uploadBufferToDrive', unggah.includes('await folderUntuk(tujuanUnggahan(modulAsal))') && unggah.includes('uploadBufferToDrive(') && !unggah.includes('googleapis'))
const unduh = tanpaKomentar(baca('app/api/upload/download/route.ts'))
ok('B4 /api/upload/download memakai klien bersama', unduh.includes("import { getDriveClient, kodeGalatDrive } from '@/lib/services/drive'") && !unduh.includes('googleapis'))
const versi = tanpaKomentar(baca('app/api/lkjip/[id]/versi/route.ts'))
ok('B5 arsip versi LKJIP: tujuan lkjip_arsip, status tanpa menyentuh Drive', versi.includes("tujuanTerkonfigurasi('lkjip_arsip')") && versi.includes("await folderUntuk('lkjip_arsip')"))
ok('B6 impor Word LKJIP: tujuan lkjip (bukan folder umum langsung)', tanpaKomentar(baca('app/api/lkjip/impor/route.ts')).includes("folderUntuk('lkjip')"))
const cadangan = tanpaKomentar(baca('lib/blud/cadangan-json.ts'))
ok('B7 cadangan BLUD: status tanpa Drive, unggahan lewat folderUntuk', cadangan.includes("aktif:    tujuanTerkonfigurasi('blud_json')") && cadangan.includes("await folderUntuk('blud_json')"))

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
  && skrip.indexOf("key_id = 'otomatis' FOR UPDATE") >= 0 && skrip.indexOf("key_id = 'otomatis' FOR UPDATE") < skrip.indexOf('SELECT value FROM app_config'))
ok('B13 skrip memakai kunci peta "backup_db" yang sama dengan FOLDER_TUJUAN', T.FOLDER_TUJUAN.backup_db === 'backup_db' && skrip.includes('peta.folder.backup_db') && skrip.includes('backup_db: id'))
ok('B14 folder induk mengalahkan _BACKUP di skrip', /if \(!induk\) return requireEnv\('GOOGLE_DRIVE_FOLDER_ID_BACKUP'\);/.test(skrip))
ok('B15 folder gagal disiapkan: dump tetap dibuat & diantrekan', skrip.includes("log('FOLDER-FAIL'") && skrip.includes("if (!folderId) throw new Error('folder backup belum siap');"))

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
  } finally {
    KREDENSIAL.forEach((k, i) => { if (kredAsli[i] === undefined) delete process.env[k]; else process.env[k] = kredAsli[i] })
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
  } finally {
    await sql`DELETE FROM app_config WHERE \`key\` = ${T.KUNCI_PETA_SUBFOLDER}`
    if (lama !== null) await sql`INSERT INTO app_config (\`key\`, value) VALUES (${T.KUNCI_PETA_SUBFOLDER}, ${lama})`
    await sql`DELETE FROM blud_locks WHERE entity = 'drive_folder' AND key_id = 'otomatis'`
    if (process.env.UJI_DRIVE_HAPUS === '1') {
      for (const id of dibuatUji) await drive.files.delete({ fileId: id }).catch((e) => console.log('    gagal hapus', id, e.message))
      console.log(`    ${dibuatUji.length} subfolder buatan uji dihapus`)
    }
  }
}

console.log(`\n${lulus} lulus, ${gagal} gagal`)
process.exit(gagal ? 1 : 0)
