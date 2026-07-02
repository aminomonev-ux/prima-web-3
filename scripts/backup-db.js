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
//   GOOGLE_DRIVE_FOLDER_ID_BACKUP  — folder Drive privat khusus backup
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

  const folderId = requireEnv('GOOGLE_DRIVE_FOLDER_ID_BACKUP');
  requireEnv('BACKUP_ENC_PASSWORD', 16);
  const retention = Math.max(3, parseInt(process.env.BACKUP_RETENTION ?? '30', 10) || 30);

  fs.mkdirSync(PENDING_DIR, { recursive: true });
  const drive = getDriveClient();

  // 1. Coba upload ulang backup pending dari run sebelumnya yang gagal
  for (const name of fs.readdirSync(PENDING_DIR).filter(n => n.endsWith('.enc'))) {
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
    await uploadToDrive(drive, folderId, filePath);
    fs.rmSync(filePath, { force: true });
    log('UPLOAD-OK', `${fileName} → Drive folder backup`);
  } catch (e) {
    log('UPLOAD-FAIL', `${fileName} disimpan di backups-pending/ utk retry: ${e.message}`);
    process.exitCode = 1;
  }

  // 4. Rotasi retensi di Drive (best-effort)
  try {
    const deleted = await rotateOldBackups(drive, folderId, retention);
    log('DONE', `selesai ${((Date.now() - startedAt) / 1000).toFixed(1)}s · retensi ${retention} · rotasi hapus ${deleted}`);
  } catch (e) {
    log('ROTATE-FAIL', e.message);
  }
}

main().catch(e => fail(e.stack ?? String(e)));
