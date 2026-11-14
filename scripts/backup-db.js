#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
// scripts/backup-db.js — Backup harian MySQL → Google Drive (Lapis 1).
//
// FLOW: mysqldump → gzip → enkripsi AES-256-GCM → upload folder Drive privat
//       → hapus file lokal → rotasi (hapus backup tertua di Drive melebihi
//       BACKUP_RETENTION) → catat hasil ke scripts/backup-db.log.
// Gagal upload (mis. internet mati) → file DISIMPAN di backups-pending/ dan
// dicoba upload ulang di run berikutnya sebelum backup baru dibuat.
//
// USAGE: node scripts/backup-db.js
//        (jadwalkan via Windows Task Scheduler / cron, 1x tiap malam)
//
// ENV (.env.local): MYSQL_* (sudah ada), GOOGLE_OAUTH_* (sudah ada),
//   GOOGLE_DRIVE_FOLDER_ID_ROOT    — folder induk PRIMA; backup masuk subfolder
//                                    "01 Backup Database" (dibuat sendiri bila belum ada).
//                                    Terisi = MENGALAHKAN _BACKUP di bawah.
//   GOOGLE_DRIVE_FOLDER_ID_BACKUP  — folder Drive privat khusus backup (tanpa folder induk)
//   BACKUP_ENC_PASSWORD            — password enkripsi (min 16 char); TANPA ini
//                                    backup TIDAK dibuat (fail-closed, jangan
//                                    kirim dump polos ke cloud)
//   BACKUP_RETENTION               — opsional, default 30 file
//   MYSQLDUMP_PATH                 — opsional, default 'mysqldump' di PATH
//
// Restore: node scripts/backup-decrypt.js <file.enc>  → hasilkan .sql,
//          lalu import ke MySQL (lihat docs/BACKUP-RESTORE.md).

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { pipeline } = require('stream/promises');

const ROOT = path.resolve(__dirname, '..');
const PENDING_DIR = path.join(ROOT, 'backups-pending');
const LOG_FILE = path.join(__dirname, 'backup-db.log');
const ENC_MAGIC = Buffer.from('PRIMABK1'); // format marker utk backup-decrypt.js

function loadEnv() {
  const envPath = path.join(ROOT, '.env.local');
  if (!fs.existsSync(envPath)) fail('.env.local tidak ditemukan di: ' + envPath);
  const raw = fs.readFileSync(envPath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/i);
    if (!m) continue;
    let val = m[2];
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!(m[1] in process.env)) process.env[m[1]] = val;
  }
}

function log(status, detail) {
  const line = `${new Date().toISOString()} [${status}] ${detail}`;
  console.log(line);
  try { fs.appendFileSync(LOG_FILE, line + '\n'); } catch { /* log gagal jangan gagalkan backup */ }
}

function fail(msg) {
  log('FATAL', msg);
  process.exit(1);
}

function requireEnv(name, minLen = 1) {
  const v = (process.env[name] ?? '').trim();
  if (v.length < minLen) fail(`env ${name} kosong/terlalu pendek (min ${minLen} char).`);
  return v;
}

// ─── mysqldump → gzip → AES-256-GCM → file ──────────────────────────────────
// Format file: MAGIC(8) + salt(16) + iv(12) + ciphertext + authTag(16 terakhir).
async function createEncryptedDump(outFile) {
  const host = process.env.MYSQL_HOST ?? 'localhost';
  const port = process.env.MYSQL_PORT ?? '3306';
  const user = requireEnv('MYSQL_USER');
  const database = requireEnv('MYSQL_DATABASE');
  // MYSQL_PASSWORD boleh kosong (Laragon intranet default tanpa password root)
  const password = process.env.MYSQL_PASSWORD ?? '';
  const encPassword = requireEnv('BACKUP_ENC_PASSWORD', 16);
  const mysqldump = process.env.MYSQLDUMP_PATH?.trim() || 'mysqldump';

  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = crypto.scryptSync(encPassword, salt, 32);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv, { authTagLength: 16 });

  // MYSQL_PWD via env — jangan taruh password di argumen CLI (kelihatan di task list)
  const dump = spawn(mysqldump, [
    '--host', host, '--port', port, '--user', user,
    '--single-transaction', '--routines', '--triggers', '--events',
    '--no-tablespaces', '--set-gtid-purged=OFF',
    '--databases', database,
  ], { env: { ...process.env, MYSQL_PWD: password } });

  let dumpErr = '';
  dump.stderr.on('data', d => { dumpErr += d.toString(); });
  dump.on('error', e => {
    fs.rmSync(outFile, { force: true });
    fail(`mysqldump tidak bisa dijalankan (${e.code}): set MYSQLDUMP_PATH di .env.local ke path lengkap mysqldump.exe`);
  });

  const out = fs.createWriteStream(outFile);
  out.write(Buffer.concat([ENC_MAGIC, salt, iv]));
  await pipeline(dump.stdout, zlib.createGzip({ level: 9 }), cipher, out);

  const exitCode = dump.exitCode ?? await new Promise(r => dump.on('close', r));
  if (exitCode !== 0) {
    fs.rmSync(outFile, { force: true });
    fail(`mysqldump exit ${exitCode}: ${dumpErr.slice(0, 500)}`);
  }
  // authTag GCM baru tersedia setelah cipher final — append di akhir file
  fs.appendFileSync(outFile, cipher.getAuthTag());
  return fs.statSync(outFile).size;
}

// ─── Google Drive ────────────────────────────────────────────────────────────
// Klien & penyiap subfolder di sini SENGAJA salinan `lib/services/drive.ts` +
// `lib/services/drive-tujuan.ts`: skrip ini CommonJS di luar Next (tanpa alias `@/`).
// Nama subfolder, kunci app_config, dan kunci `blud_locks` WAJIB sama dengan di sana
// (dijaga scripts/test-drive-terpusat.mts) — kalau beda, lahir folder kembar.
const NAMA_SUBFOLDER_BACKUP = '01 Backup Database';
const KUNCI_PETA_SUBFOLDER = 'drive_subfolder_otomatis';
const MIME_FOLDER = 'application/vnd.google-apps.folder';

function kutipKueri(s) { return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'"); }

function bacaPeta(nilai) {
  try {
    const j = JSON.parse(nilai);
    return j && typeof j.induk === 'string' && j.induk ? { induk: j.induk, folder: (j.folder && typeof j.folder === 'object') ? j.folder : {} } : null;
  } catch { return null; }
}

async function cariAtauBuatFolder(drive, induk, nama) {
  const ada = await drive.files.list({
    q: `'${kutipKueri(induk)}' in parents and mimeType = '${MIME_FOLDER}' and name = '${kutipKueri(nama)}' and trashed = false`,
    orderBy: 'createdTime', pageSize: 10, fields: 'files(id,name)',
  }, { timeout: 30000 });
  if (ada.data.files && ada.data.files[0]) return ada.data.files[0].id;
  const baru = await drive.files.create({ requestBody: { name: nama, mimeType: MIME_FOLDER, parents: [induk] }, fields: 'id' }, { timeout: 30000 });
  if (!baru.data.id) throw new Error(`Drive tidak mengembalikan id folder "${nama}".`);
  log('FOLDER', `subfolder "${nama}" dibuat di folder induk (${baru.data.id})`);
  return baru.data.id;
}

// Folder induk terisi → subfolder backup dari app_config (dicatat aplikasi atau skrip ini),
// kalau belum ada dicari/dibuat di bawah kunci yang SAMA dengan aplikasi (blud_locks
// drive_folder:otomatis) lalu dicatat. Tanpa folder induk → env _BACKUP seperti dulu.
async function folderBackup(drive) {
  const induk = (process.env.GOOGLE_DRIVE_FOLDER_ID_ROOT ?? '').trim();
  if (!induk) return requireEnv('GOOGLE_DRIVE_FOLDER_ID_BACKUP');
  const mysql = require('mysql2/promise');
  const conn = await mysql.createConnection({
    host: process.env.MYSQL_HOST ?? 'localhost',
    port: Number(process.env.MYSQL_PORT ?? 3306),
    user: requireEnv('MYSQL_USER'),
    password: process.env.MYSQL_PASSWORD ?? '',
    database: requireEnv('MYSQL_DATABASE'),
    ssl: process.env.MYSQL_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
  });
  try {
    await conn.beginTransaction();
    await conn.execute("INSERT INTO blud_locks (entity, key_id, version) VALUES ('drive_folder', 'otomatis', 0) ON DUPLICATE KEY UPDATE version = version");
    await conn.execute("SELECT version FROM blud_locks WHERE entity = 'drive_folder' AND key_id = 'otomatis' FOR UPDATE");
    const [rows] = await conn.execute('SELECT value FROM app_config WHERE `key` = ? LIMIT 1', [KUNCI_PETA_SUBFOLDER]);
    const peta = rows[0] ? bacaPeta(rows[0].value) : null;
    const tercatat = peta && peta.induk === induk ? peta.folder.backup_db : '';
    if (tercatat) { await conn.commit(); return tercatat; }
    const id = await cariAtauBuatFolder(drive, induk, NAMA_SUBFOLDER_BACKUP);
    const baru = { induk, folder: { ...(peta && peta.induk === induk ? peta.folder : {}), backup_db: id } };
    await conn.execute('INSERT INTO app_config (`key`, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)', [KUNCI_PETA_SUBFOLDER, JSON.stringify(baru)]);
    await conn.commit();
    return id;
  } catch (e) {
    try { await conn.rollback(); } catch { /* koneksi sudah putus */ }
    throw e;
  } finally {
    await conn.end();
  }
}

function getDriveClient() {
  const { google } = require('googleapis');
  const clientId = requireEnv('GOOGLE_OAUTH_CLIENT_ID');
  const clientSecret = requireEnv('GOOGLE_OAUTH_CLIENT_SECRET');
  const refreshToken = requireEnv('GOOGLE_OAUTH_REFRESH_TOKEN');
  const oauth2 = new google.auth.OAuth2(clientId, clientSecret, 'https://developers.google.com/oauthplayground');
  oauth2.setCredentials({ refresh_token: refreshToken });
  return google.drive({ version: 'v3', auth: oauth2 });
}

async function uploadToDrive(drive, folderId, filePath) {
  const res = await drive.files.create({
    requestBody: { name: path.basename(filePath), parents: [folderId] },
    media: { mimeType: 'application/octet-stream', body: fs.createReadStream(filePath) },
    fields: 'id,name',
  });
  return res.data.id;
}

async function rotateOldBackups(drive, folderId, retention) {
  const res = await drive.files.list({
    q: `'${folderId}' in parents and name contains 'prima-db-' and trashed = false`,
    orderBy: 'createdTime desc',
    pageSize: 200,
    fields: 'files(id,name,createdTime)',
  });
  const files = res.data.files ?? [];
  const toDelete = files.slice(retention);
  for (const f of toDelete) {
    await drive.files.delete({ fileId: f.id });
    log('ROTATE', `hapus backup lama di Drive: ${f.name}`);
  }
  return toDelete.length;
}

// ─── Main ────────────────────────────────────────────────────────────────────
async function main() {
  const startedAt = Date.now();
  loadEnv();

  requireEnv('BACKUP_ENC_PASSWORD', 16);
  const retention = Math.max(3, parseInt(process.env.BACKUP_RETENTION ?? '30', 10) || 30);

  fs.mkdirSync(PENDING_DIR, { recursive: true });
  const drive = getDriveClient();
  // Folder gagal disiapkan (internet mati, induk salah) → dump TETAP dibuat & ditaruh di
  // backups-pending/, persis seperti unggahan gagal. Backup yang batal karena Drive lebih
  // buruk daripada backup yang terlambat naik.
  let folderId = '';
  try { folderId = await folderBackup(drive); }
  catch (e) { log('FOLDER-FAIL', `folder backup tidak bisa disiapkan: ${e.message}`); process.exitCode = 1; }

  // 1. Coba upload ulang backup pending dari run sebelumnya yang gagal
  for (const name of folderId ? fs.readdirSync(PENDING_DIR).filter(n => n.endsWith('.enc')) : []) {
    const p = path.join(PENDING_DIR, name);
    try {
      await uploadToDrive(drive, folderId, p);
      fs.rmSync(p, { force: true });
      log('RETRY-OK', `pending terupload: ${name}`);
    } catch (e) {
      log('RETRY-FAIL', `pending masih gagal (${name}): ${e.message}`);
    }
  }

  // 2. Backup baru
  const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16);
  const fileName = `prima-db-${stamp}.sql.gz.enc`;
  const filePath = path.join(PENDING_DIR, fileName);

  const size = await createEncryptedDump(filePath);
  log('DUMP-OK', `${fileName} (${(size / 1024).toFixed(0)} KB)`);

  // 3. Upload → sukses = hapus lokal; gagal = biarkan di pending utk retry besok
  try {
    if (!folderId) throw new Error('folder backup belum siap');
    await uploadToDrive(drive, folderId, filePath);
    fs.rmSync(filePath, { force: true });
    log('UPLOAD-OK', `${fileName} → Drive folder backup`);
  } catch (e) {
    log('UPLOAD-FAIL', `${fileName} disimpan di backups-pending/ utk retry: ${e.message}`);
    process.exitCode = 1;
  }

  // 4. Rotasi retensi di Drive (best-effort). Hanya folder yang SEDANG dipakai: backup di
  //    folder lama (sebelum pindah ke folder induk) tidak ikut dirotasi — hapus manual.
  if (!folderId) return;
  try {
    const deleted = await rotateOldBackups(drive, folderId, retention);
    log('DONE', `selesai ${((Date.now() - startedAt) / 1000).toFixed(1)}s · retensi ${retention} · rotasi hapus ${deleted}`);
  } catch (e) {
    log('ROTATE-FAIL', e.message);
  }
}

main().catch(e => fail(e.stack ?? String(e)));
