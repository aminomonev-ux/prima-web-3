#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
// scripts/backup-decrypt.js — dekripsi file backup buatan backup-db.js → .sql
//
// USAGE: node scripts/backup-decrypt.js <file.sql.gz.enc> [output.sql]
//   Password diambil dari BACKUP_ENC_PASSWORD (.env.local), atau override:
//   set BACKUP_ENC_PASSWORD=xxx && node scripts/backup-decrypt.js file.enc
//
// Format file (lihat backup-db.js): MAGIC(8) + salt(16) + iv(12) + ciphertext + authTag(16).
// Restore hasilnya: mysql -u <user> -p < output.sql  (lihat docs/BACKUP-RESTORE.md)

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');

const ENC_MAGIC = Buffer.from('PRIMABK1');

function loadEnv() {
  const envPath = path.resolve(__dirname, '..', '.env.local');
  if (!fs.existsSync(envPath)) return;
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

function fail(msg) {
  console.error('[FATAL]', msg);
  process.exit(1);
}

const inFile = process.argv[2];
if (!inFile) fail('Usage: node scripts/backup-decrypt.js <file.sql.gz.enc> [output.sql]');
if (!fs.existsSync(inFile)) fail('File tidak ditemukan: ' + inFile);

loadEnv();
const password = (process.env.BACKUP_ENC_PASSWORD ?? '').trim();
if (!password) fail('BACKUP_ENC_PASSWORD tidak di-set (di .env.local atau env var).');

const buf = fs.readFileSync(inFile);
if (buf.length < 8 + 16 + 12 + 16 + 1) fail('File terlalu kecil / korup.');
if (!buf.subarray(0, 8).equals(ENC_MAGIC)) fail('Bukan file backup PRIMA (magic header tidak cocok).');

const salt = buf.subarray(8, 24);
const iv = buf.subarray(24, 36);
const authTag = buf.subarray(buf.length - 16);
const ciphertext = buf.subarray(36, buf.length - 16);

const key = crypto.scryptSync(password, salt, 32);
const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv, { authTagLength: 16 });
decipher.setAuthTag(authTag);

let gz;
try {
  gz = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
} catch {
  fail('Dekripsi gagal — password salah atau file korup (auth tag mismatch).');
}

const sql = zlib.gunzipSync(gz);
const outFile = process.argv[3] ?? inFile.replace(/\.sql\.gz\.enc$/, '') + '.sql';
fs.writeFileSync(outFile, sql);
console.log(`OK: ${outFile} (${(sql.length / 1024).toFixed(0)} KB)`);
console.log('Restore: mysql --user=<user> --password < "' + outFile + '"');
