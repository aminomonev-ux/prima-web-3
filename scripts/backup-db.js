#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
// scripts/backup-db.js — Backup harian MySQL → Google Drive (Lapis 1).
//
// FLOW: mysqldump → gzip → enkripsi AES-256-GCM → upload folder Drive privat
//       → hapus file lokal → catat di drive_arsip + drive_health → rotasi (hapus
//       backup tercatat tertua melebihi BACKUP_RETENTION) → log scripts/backup-db.log.
// Gagal upload (mis. internet mati) → file DISIMPAN di backups-pending/ dan
// dicoba upload ulang di run berikutnya sebelum backup baru dibuat.
//
// USAGE: node scripts/backup-db.js
//        (jadwalkan via Windows Task Scheduler — docs/PANDUAN-jadwal-backup.md)
//
// ENV (.env.local): MYSQL_* (sudah ada), GOOGLE_OAUTH_* (sudah ada),
//   GOOGLE_DRIVE_FOLDER_ID_ROOT    — folder induk PRIMA; backup masuk subfolder
//                                    "01 Backup Database" (dibuat sendiri bila belum ada).
//                                    Isian Admin Panel (app_config drive_root) mengalahkannya.
//                                    Folder induk terisi = MENGALAHKAN _BACKUP di bawah.
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
const LOCK_FILE = path.join(PENDING_DIR, '.lock');
const LOG_FILE = path.join(__dirname, 'backup-db.log');
const ENC_MAGIC = Buffer.from('PRIMABK1'); // format marker utk backup-decrypt.js
const JAKARTA_OFFSET_MS = 7 * 60 * 60 * 1000;
/** Kunci anti-tumpang-tindih yang lebih tua dari ini dianggap tertinggal proses yang mati. */
const UMUR_KUNCI_BASI_MS = 2 * 60 * 60 * 1000;

class FatalError extends Error {}

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

/** Galat yang menghentikan backup. Dilempar (bukan exit) supaya kegagalannya sempat dicatat di drive_health. */
function fail(msg) {
  throw new FatalError(msg);
}

function requireEnv(name, minLen = 1) {
  const v = (process.env[name] ?? '').trim();
  if (v.length < minLen) fail(`env ${name} kosong/terlalu pendek (min ${minLen} char).`);
  return v;
}

/** Nama berkas ber-jam WIB (A16): backup 12.00 WIB = `prima-db-…-12-00`, bukan `…-05-00` (UTC). */
function namaBerkasBackup(sekarang = Date.now()) {
  const stamp = new Date(sekarang + JAKARTA_OFFSET_MS).toISOString().replace(/[:T]/g, '-').slice(0, 16);
  return `prima-db-${stamp}.sql.gz.enc`;
}

// ─── Kunci anti-tumpang-tindih ───────────────────────────────────────────────
// Task Scheduler sudah `IgnoreNew`, tapi backup manual yang berbarengan dengan jadwal
// tidak lewat penjadwal — dua proses saling menghapus saat rotasi.
function ambilKunci() {
  fs.mkdirSync(PENDING_DIR, { recursive: true });
  try {
    fs.writeFileSync(LOCK_FILE, `${process.pid} ${new Date().toISOString()}`, { flag: 'wx' });
    return true;
  } catch (e) {
    if (e.code !== 'EEXIST') throw e;
    const umur = Date.now() - fs.statSync(LOCK_FILE).mtimeMs;
    if (umur < UMUR_KUNCI_BASI_MS) return false;
    log('LOCK', `kunci lama (${Math.round(umur / 60000)} menit) dianggap tertinggal — diambil alih`);
    fs.writeFileSync(LOCK_FILE, `${process.pid} ${new Date().toISOString()}`);
    return true;
  }
}
function lepasKunci() { try { fs.rmSync(LOCK_FILE, { force: true }); } catch { /* sudah tidak ada */ } }

// ─── MySQL (catatan & folder) ────────────────────────────────────────────────
// Satu koneksi untuk seluruh jalan. Gagal tersambung → catatan dilewati (backup tetap
// jalan; mysqldump yang akan melapor kalau MySQL memang mati).
let koneksi = null;
async function db() {
  if (koneksi) return koneksi;
  const mysql = require('mysql2/promise');
  koneksi = await mysql.createConnection({
    host: process.env.MYSQL_HOST ?? 'localhost',
    port: Number(process.env.MYSQL_PORT ?? 3306),
    user: requireEnv('MYSQL_USER'),
    password: process.env.MYSQL_PASSWORD ?? '',
    database: requireEnv('MYSQL_DATABASE'),
    ssl: process.env.MYSQL_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
  });
  return koneksi;
}

/** Golongan galat — cermin `jenisGalatDrive` (lib/services/drive.ts). */
function jenisGalat(e) {
  const alasan = [...((e && e.errors) || []).map((x) => String(x && x.reason)), String(e && e.response && e.response.data && e.response.data.error)];
  if (alasan.includes('invalid_grant') || alasan.includes('unauthorized_client')) return 'token';
  const kode = Number((e && e.response && e.response.status) ?? (e && e.status) ?? (e && e.code));
  if (kode === 401) return 'token';
  if (kode === 403) return alasan.includes('storageQuotaExceeded') || alasan.includes('quotaExceeded') ? 'quota' : 'permission';
  if (kode === 404) return 'notfound';
  if (/^(ENOTFOUND|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|ECONNABORTED)$/.test(String(e && e.code))) return 'jaringan';
  return 'lain';
}

/** drive_health 'backup_db' — catatan, bukan pagar: gagal menulis tidak menggagalkan backup. */
async function catatKesehatan(galat, kodeTimpa) {
  try {
    const c = await db();
    if (!galat) {
      await c.execute("INSERT INTO drive_health (tujuan, terakhir_ok_at, jumlah_ok) VALUES ('backup_db', NOW(), 1) ON DUPLICATE KEY UPDATE terakhir_ok_at = NOW(), jumlah_ok = jumlah_ok + 1");
    } else {
      const pesan = String(galat.message ?? galat).replace(/\s+/g, ' ').trim().slice(0, 250);
      await c.execute("INSERT INTO drive_health (tujuan, terakhir_gagal_at, pesan, kode, jumlah_gagal) VALUES ('backup_db', NOW(), ?, ?, 1) ON DUPLICATE KEY UPDATE terakhir_gagal_at = NOW(), pesan = VALUES(pesan), kode = VALUES(kode), jumlah_gagal = jumlah_gagal + 1",
        [pesan, kodeTimpa ?? jenisGalat(galat)]);
    }
  } catch (e) { log('CATAT-FAIL', `drive_health: ${e.message}`); }
}

/** drive_arsip — manifest mencatat kenyataan Drive, jadi ditulis SESUDAH unggahan berhasil. */
async function catatArsip(r) {
  try {
    const c = await db();
    await c.execute("INSERT IGNORE INTO drive_arsip (tujuan, file_id, nama, ukuran, sha256, folder_id, sumber, dibuat_pada) VALUES ('backup_db', ?, ?, ?, ?, ?, 'backup_db', NOW())",
      [r.fileId, r.nama, r.ukuran, r.sha256, r.folderId]);
    return true;
  } catch (e) { log('CATAT-FAIL', `drive_arsip: ${e.message}`); return false; }
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
  let galatJalan = null;
  dump.stderr.on('data', d => { dumpErr += d.toString(); });
  dump.on('error', e => { galatJalan = e; });

  const out = fs.createWriteStream(outFile);
  out.write(Buffer.concat([ENC_MAGIC, salt, iv]));
  await pipeline(dump.stdout, zlib.createGzip({ level: 9 }), cipher, out);

  const exitCode = dump.exitCode ?? await new Promise(r => dump.on('close', r));
  if (galatJalan) {
    fs.rmSync(outFile, { force: true });
    fail(`mysqldump tidak bisa dijalankan (${galatJalan.code}): set MYSQLDUMP_PATH di .env.local ke path lengkap mysqldump.exe`);
  }
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
const KUNCI_FOLDER_INDUK = 'drive_root';
const POLA_ID_DRIVE = /^[\w-]{10,128}$/;
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

/** Folder induk: isian Admin Panel (app_config drive_root) dulu, env cadangan — cermin `folderInduk()`. */
async function folderInduk() {
  try {
    const [rows] = await (await db()).execute('SELECT value FROM app_config WHERE `key` = ? LIMIT 1', [KUNCI_FOLDER_INDUK]);
    const v = String((rows[0] && rows[0].value) ?? '').trim();
    if (POLA_ID_DRIVE.test(v)) return v;
  } catch { /* DB tak terbaca → env */ }
  return (process.env.GOOGLE_DRIVE_FOLDER_ID_ROOT ?? '').trim();
}

// Folder induk terisi → subfolder backup dari app_config (dicatat aplikasi atau skrip ini),
// kalau belum ada dicari/dibuat di bawah kunci yang SAMA dengan aplikasi (blud_locks
// drive_folder:otomatis) lalu dicatat. Tanpa folder induk → env _BACKUP seperti dulu.
async function folderBackup(drive) {
  const induk = await folderInduk();
  if (!induk) return requireEnv('GOOGLE_DRIVE_FOLDER_ID_BACKUP');
  const conn = await db();
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

function sha256Berkas(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

/** Unggah + catat manifest & kesehatan. Melempar galat Drive (pemanggil memutuskan antrean). */
async function uploadToDrive(drive, folderId, filePath) {
  const sha256 = sha256Berkas(filePath);
  const res = await drive.files.create({
    requestBody: { name: path.basename(filePath), parents: [folderId] },
    media: { mimeType: 'application/octet-stream', body: fs.createReadStream(filePath) },
    fields: 'id,name,size',
  });
  await catatArsip({ fileId: res.data.id, nama: res.data.name ?? path.basename(filePath), ukuran: res.data.size == null ? null : Number(res.data.size), sha256, folderId });
  await catatKesehatan(null);
  return res.data.id;
}

/**
 * Rotasi berdasarkan MANIFEST (A6): hanya backup yang tercatat di drive_arsip yang boleh
 * dihapus, dan barisnya tidak dibuang (`dihapus_pada` diisi) — salinan arsip manual
 * bernama `prima-db-…` di folder yang sama tidak ikut terhapus. Tabel belum ada
 * (migrasi belum dijalankan) → cara lama: per nama di folder yang sedang dipakai.
 */
async function rotateOldBackups(drive, folderId, retention) {
  let tercatat = null;
  try {
    const [rows] = await (await db()).query(
      "SELECT id, file_id, nama FROM drive_arsip WHERE tujuan = 'backup_db' AND dihapus_pada IS NULL ORDER BY dibuat_pada DESC, id DESC");
    tercatat = rows;
  } catch (e) { log('ROTATE', `manifest tak terbaca (${e.message}) — rotasi per nama berkas`); }

  if (tercatat) {
    const hapus = tercatat.slice(retention);
    for (const r of hapus) {
      try { await drive.files.delete({ fileId: r.file_id }); }
      catch (e) { if (jenisGalat(e) !== 'notfound') { log('ROTATE-FAIL', `${r.nama}: ${e.message}`); continue; } }
      await (await db()).execute('UPDATE drive_arsip SET dihapus_pada = NOW() WHERE id = ?', [r.id]);
      log('ROTATE', `hapus backup lama di Drive: ${r.nama}`);
    }
    return hapus.length;
  }

  const res = await drive.files.list({
    q: `'${kutipKueri(folderId)}' in parents and name contains 'prima-db-' and trashed = false`,
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

  if (!ambilKunci()) {
    log('LEWAT', 'backup lain sedang berjalan (backups-pending/.lock) — jalan ini dilewati');
    return;
  }
  try {
    const drive = getDriveClient();
    // Folder gagal disiapkan (internet mati, induk salah) → dump TETAP dibuat & ditaruh di
    // backups-pending/, persis seperti unggahan gagal. Backup yang batal karena Drive lebih
    // buruk daripada backup yang terlambat naik.
    let folderId = '';
    try { folderId = await folderBackup(drive); }
    catch (e) {
      if (e instanceof FatalError) throw e;
      log('FOLDER-FAIL', `folder backup tidak bisa disiapkan: ${e.message}`);
      await catatKesehatan(e);
      process.exitCode = 1;
    }

    // 1. Coba upload ulang backup pending dari run sebelumnya yang gagal
    for (const name of folderId ? fs.readdirSync(PENDING_DIR).filter(n => n.endsWith('.enc')) : []) {
      const p = path.join(PENDING_DIR, name);
      try {
        await uploadToDrive(drive, folderId, p);
        fs.rmSync(p, { force: true });
        log('RETRY-OK', `pending terupload: ${name}`);
      } catch (e) {
        log('RETRY-FAIL', `pending masih gagal (${name}): ${e.message}`);
        await catatKesehatan(e);
      }
    }

    // 2. Backup baru
    const fileName = namaBerkasBackup();
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
      if (folderId) await catatKesehatan(e);
      process.exitCode = 1;
    }

    // 4. Rotasi retensi di Drive (best-effort). Manifest mencakup backup di folder mana pun yang
    //    TERCATAT; backup lama sebelum pencatatan dipasang tidak ikut dirotasi — hapus manual.
    if (!folderId) return;
    try {
      const deleted = await rotateOldBackups(drive, folderId, retention);
      log('DONE', `selesai ${((Date.now() - startedAt) / 1000).toFixed(1)}s · retensi ${retention} · rotasi hapus ${deleted}`);
    } catch (e) {
      log('ROTATE-FAIL', e.message);
    }
  } finally {
    lepasKunci();
  }
}

main()
  .catch(async (e) => {
    log('FATAL', e instanceof FatalError ? e.message : (e.stack ?? String(e)));
    await catatKesehatan(e, 'lain');
    process.exitCode = 1;
  })
  .finally(async () => {
    if (koneksi) { try { await koneksi.end(); } catch { /* sudah putus */ } }
  });
