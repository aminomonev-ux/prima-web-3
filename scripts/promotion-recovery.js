#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
// scripts/promotion-recovery.js — BREAK-GLASS recovery untuk all-SA-locked.
// Konsep: docs/session/ROLE_PROMOTION_CONCEPT.md §4 Recovery Scenario.
//
// USAGE: node scripts/promotion-recovery.js <user_id_target> <recovery_secret>
//
// FLOW:
//   1. Load .env.local — ambil MYSQL_* + PROMOTION_RECOVERY_SECRET.
//   2. Timing-safe compare argv[3] dengan env. Salah → exit 1 + audit DENIED.
//   3. Cek system_settings.recovery_used_at — kalau NOT NULL, exit 1.
//   4. Cek user target exists + status='AKTIF'. Kalau tidak, exit 1.
//   5. Prompt konfirmasi text-based: ketik `RECOVER-{username}` untuk lanjut.
//   6. Transaction: UPDATE users role='SUPER_ADMIN' + clear probation +
//      clear promotion_locked_until. INSERT audit_log PROMOTION_RECOVERY_USED.
//      UPDATE system_settings.recovery_used_at = NOW().
//   7. Print success + reminder: rotasi PROMOTION_RECOVERY_SECRET + delete this
//      script from server setelah dipakai.

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const crypto = require('crypto');

// ─── Load .env.local manual (no dotenv dep) ─────────────────────────────────
function loadEnv() {
  const envPath = path.resolve(__dirname, '..', '.env.local');
  if (!fs.existsSync(envPath)) {
    console.error('[FATAL] .env.local tidak ditemukan di:', envPath);
    process.exit(1);
  }
  const raw = fs.readFileSync(envPath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/i);
    if (!m) continue;
    let val = m[2];
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!(m[1] in process.env)) process.env[m[1]] = val;
  }
}

function timingSafeEqualStrings(a, b) {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  try {
    return crypto.timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

function prompt(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (ans) => { rl.close(); resolve(ans); }));
}

async function writeAuditLogRaw(conn, eventType, detail) {
  try {
    await conn.execute(
      `INSERT INTO audit_log (user_id, username, event_type, ip_address, user_agent, detail)
       VALUES (NULL, ?, ?, ?, ?, ?)`,
      [
        `recovery-script@${require('os').hostname()}`,
        eventType,
        '127.0.0.1',
        `Node ${process.version} ${process.platform}`,
        detail,
      ],
    );
  } catch (e) {
    console.error('[audit_log write failed]', e.message);
  }
}

async function main() {
  loadEnv();

  const [, , userIdArg, secretArg] = process.argv;
  if (!userIdArg || !secretArg) {
    console.error('USAGE: node scripts/promotion-recovery.js <user_id> <recovery_secret>');
    process.exit(1);
  }
  const userId = parseInt(userIdArg, 10);
  if (!Number.isInteger(userId) || userId <= 0) {
    console.error('[FATAL] user_id harus integer positif.');
    process.exit(1);
  }

  const envSecret = process.env.PROMOTION_RECOVERY_SECRET ?? '';
  if (!envSecret || envSecret.length < 16) {
    console.error('[FATAL] PROMOTION_RECOVERY_SECRET tidak di-set di .env.local (min 16 chars).');
    process.exit(1);
  }

  // mysql2 sebagai dep dari Next app — sudah ke-install.
  let mysql;
  try {
    mysql = require('mysql2/promise');
  } catch {
    console.error('[FATAL] paket mysql2 tidak terinstall. Jalankan npm install dulu.');
    process.exit(1);
  }

  // Fail-closed: jangan default ke password kosong (hindari konek tak sengaja ke
  // DB yang mengizinkan login tanpa password). Set eksplisit (boleh '' kalau memang tanpa password).
  if (process.env.MYSQL_PASSWORD === undefined) {
    console.error('[FATAL] MYSQL_PASSWORD belum di-set di .env.local. Set eksplisit (boleh kosong kalau DB memang tanpa password).');
    process.exit(1);
  }
  const conn = await mysql.createConnection({
    host:     process.env.MYSQL_HOST     || 'localhost',
    port:     parseInt(process.env.MYSQL_PORT || '3306', 10),
    user:     process.env.MYSQL_USER     || 'root',
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE || 'prima_db',
    timezone: '+07:00',
  });

  try {
    // Step 1: timing-safe secret compare.
    if (!timingSafeEqualStrings(secretArg, envSecret)) {
      await writeAuditLogRaw(conn, 'PROMOTION_RECOVERY_DENIED', `Wrong secret. target_user_id=${userId}`);
      console.error('[DENIED] Recovery secret salah. Event di-log di audit_log.');
      process.exit(1);
    }

    // Step 2: cek flag used.
    const [flagRows] = await conn.execute(
      `SELECT val FROM system_settings WHERE \`key\` = 'recovery_used_at' LIMIT 1`,
    );
    if (flagRows.length > 0 && flagRows[0].val !== null) {
      await writeAuditLogRaw(conn, 'PROMOTION_RECOVERY_DENIED', `Already used at ${flagRows[0].val}. target_user_id=${userId}`);
      console.error(`[DENIED] Recovery sudah pernah dipakai pada ${flagRows[0].val}.`);
      console.error('Untuk pakai lagi, owner harus MANUAL clear flag via SQL:');
      console.error("  UPDATE system_settings SET val = NULL WHERE `key` = 'recovery_used_at';");
      console.error('Ini = incident response. Audit log keras.');
      process.exit(1);
    }

    // Step 3: cek user target.
    const [userRows] = await conn.execute(
      `SELECT username, role, status FROM users WHERE id = ? LIMIT 1`,
      [userId],
    );
    if (userRows.length === 0) {
      await writeAuditLogRaw(conn, 'PROMOTION_RECOVERY_DENIED', `User tidak ditemukan. target_user_id=${userId}`);
      console.error(`[DENIED] User dengan id=${userId} tidak ditemukan.`);
      process.exit(1);
    }
    const target = userRows[0];
    if (target.status !== 'AKTIF') {
      await writeAuditLogRaw(conn, 'PROMOTION_RECOVERY_DENIED', `User status=${target.status} (bukan AKTIF). target_user_id=${userId}`);
      console.error(`[DENIED] User ${target.username} berstatus ${target.status}, bukan AKTIF.`);
      process.exit(1);
    }

    // Step 4: prompt konfirmasi.
    console.log('');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('  RECOVERY PROMOTION — BREAK-GLASS');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`  Target user_id : ${userId}`);
    console.log(`  Username       : ${target.username}`);
    console.log(`  Current role   : ${target.role}`);
    console.log(`  Akan diubah ke : SUPER_ADMIN`);
    console.log('───────────────────────────────────────────────────────────');
    console.log(`  Ketik EXACT: RECOVER-${target.username}`);
    console.log('  (Atau ketik selain itu untuk batal.)');
    console.log('═══════════════════════════════════════════════════════════');
    const expected = `RECOVER-${target.username}`;
    const answer = (await prompt('Konfirmasi: ')).trim();
    if (answer !== expected) {
      console.error('[ABORTED] Input tidak match. Recovery dibatalkan.');
      process.exit(1);
    }

    // Step 5: transaction — atomic claim flag + promote + audit.
    // L52: claim flag DULU (atomic UPDATE WHERE val IS NULL) sebelum operasi
    // lain. Kalau 2 instance CLI jalan barengan, hanya 1 yang menang claim.
    await conn.beginTransaction();
    try {
      const [claimRes] = await conn.execute(
        `UPDATE system_settings SET val = NOW()
         WHERE \`key\` = 'recovery_used_at' AND val IS NULL`,
      );
      if (claimRes.affectedRows === 0) {
        await conn.rollback();
        await writeAuditLogRaw(
          conn,
          'PROMOTION_RECOVERY_DENIED',
          `Race lost — flag already claimed by concurrent instance. target_user_id=${userId}`,
        );
        console.error('[DENIED] Recovery flag baru saja di-claim instance lain (race).');
        process.exit(1);
      }
      await conn.execute(
        `UPDATE users
         SET role = 'SUPER_ADMIN',
             probationary_until = NULL,
             probationary_from_role = NULL,
             promotion_locked_until = NULL,
             promotion_failed_count = 0,
             promotion_failed_at = NULL
         WHERE id = ?`,
        [userId],
      );
      // Invalidate semua session lama user supaya role baru effective.
      await conn.execute(
        `UPDATE user_sessions SET invalidated_at = NOW()
         WHERE user_id = ? AND invalidated_at IS NULL`,
        [userId],
      );
      await writeAuditLogRaw(
        conn,
        'PROMOTION_RECOVERY_USED',
        `Recovery SUCCESS — user=${target.username} (id=${userId}) was ${target.role}, now SUPER_ADMIN. host=${require('os').hostname()}`,
      );
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    }

    console.log('');
    console.log('✓ RECOVERY SUCCESS');
    console.log(`  User ${target.username} sekarang SUPER_ADMIN.`);
    console.log('');
    console.log('LANGKAH SETELAH INI (WAJIB):');
    console.log('  1. Login dengan user tersebut, ganti password.');
    console.log('  2. Rotasi PROMOTION_RECOVERY_SECRET di .env.local + restart app.');
    console.log('  3. Hapus file scripts/promotion-recovery.js dari server (single-use).');
    console.log('  4. Untuk pakai recovery lagi, clear flag SQL:');
    console.log("     UPDATE system_settings SET val = NULL WHERE `key` = 'recovery_used_at';");
    console.log('');
  } finally {
    await conn.end();
  }
}

main().catch((e) => {
  console.error('[FATAL]', e);
  process.exit(1);
});
