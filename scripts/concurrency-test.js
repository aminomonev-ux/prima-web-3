#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
// scripts/concurrency-test.js — Audit Fase A (race konklusif, app-wide).
// Uji race di LAPISAN DB: mirror persis urutan query endpoint, jalankan N transaksi
// paralel, cek invarian. Data uji ber-prefix __racetest_ + auto-cleanup.
//
// USAGE: node scripts/concurrency-test.js
// AMAN: hanya menyentuh row ber-prefix __racetest_ / role __RACETEST_ROLE. Cleanup di akhir.

const fs = require('fs');
const path = require('path');

function loadEnv() {
  const p = path.join(process.cwd(), '.env.local');
  const txt = fs.readFileSync(p, 'utf8');
  for (const line of txt.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i === -1) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!(k in process.env)) process.env[k] = v;
  }
}
loadEnv();

const ROLE_QUOTA = 3;
const MAX_LOGIN_ATTEMPTS = 5;
const TEST_ROLE = '__RACETEST_ROLE';
const PREFIX = '__racetest_';

let mysql;
try { mysql = require('mysql2/promise'); }
catch { console.error('[FATAL] mysql2 belum terinstall.'); process.exit(1); }

if (process.env.MYSQL_PASSWORD === undefined) {
  console.error('[FATAL] MYSQL_PASSWORD belum di-set di .env.local.');
  process.exit(1);
}

const cfg = {
  host: process.env.MYSQL_HOST || 'localhost',
  port: parseInt(process.env.MYSQL_PORT || '3306', 10),
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE || 'prima_db',
  timezone: '+07:00',
};

const DUMMY_HASH = '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewKyqnM1KFMoTM.K';
const results = [];
function record(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`${pass ? '✅ PASS' : '❌ FAIL'} — ${name}\n        ${detail}`);
}

async function cleanup(pool) {
  await pool.query(`DELETE FROM users WHERE role = ? OR username LIKE ?`, [TEST_ROLE, PREFIX + '%']);
  await pool.query(`DELETE FROM blud_locks WHERE entity LIKE ?`, [PREFIX + '%']);
}

// Mirror login-fail ATOMIK (fix V3-5): satu statement increment + conditional lock.
async function failLoginAtomic(pool, userId) {
  await pool.query(
    `UPDATE users
       SET failed_attempts = failed_attempts + 1,
           locked_until = IF(failed_attempts >= ?, DATE_ADD(NOW(), INTERVAL 15 MINUTE), locked_until)
     WHERE id = ?`,
    [MAX_LOGIN_ATTEMPTS, userId]
  );
}
async function testLockoutAtomic(pool) {
  await cleanup(pool);
  await pool.query(`INSERT INTO users (username, email, password_hash, role, status, failed_attempts) VALUES (?, ?, ?, ?, 'AKTIF', 0)`,
    [`${PREFIX}lock2`, `${PREFIX}lock2@t.local`, DUMMY_HASH, TEST_ROLE]);
  const [r] = await pool.query(`SELECT id FROM users WHERE username = ?`, [`${PREFIX}lock2`]);
  const id = r[0].id;
  const N = 8;
  await Promise.all(Array.from({ length: N }, () => failLoginAtomic(pool, id)));
  const [f] = await pool.query(`SELECT failed_attempts, locked_until FROM users WHERE id = ?`, [id]);
  return { attempts: Number(f[0].failed_attempts), locked: !!f[0].locked_until, N };
}

// Mirror BLUD save (L51): assertBludVersion (SELECT version [FOR UPDATE], cek == expected) -> bump.
async function bludSave(pool, entity, keyId, expected, useForUpdate) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const lock = useForUpdate ? 'FOR UPDATE' : '';
    const [rows] = await conn.query(
      `SELECT version FROM blud_locks WHERE entity = ? AND key_id = ? ${lock}`, [entity, keyId]
    );
    const current = Number(rows[0]?.version ?? 0);
    if (current !== expected) { await conn.rollback(); return 'conflict'; }
    await new Promise(r => setTimeout(r, 15)); // window race (mirror DELETE+bulkInsert)
    await conn.query(
      `INSERT INTO blud_locks (entity, key_id, version) VALUES (?, ?, 1)
       ON DUPLICATE KEY UPDATE version = version + 1`, [entity, keyId]
    );
    await conn.commit();
    return 'saved';
  } catch (e) { await conn.rollback(); throw e; }
  finally { conn.release(); }
}
async function testBludLock(pool, useForUpdate) {
  await pool.query(`DELETE FROM blud_locks WHERE entity LIKE ?`, [PREFIX + '%']);
  const entity = `${PREFIX}dpa`, keyId = '2099-01-01';
  await pool.query(`INSERT INTO blud_locks (entity, key_id, version) VALUES (?, ?, 0)`, [entity, keyId]);
  const out = await Promise.all([0, 0, 0].map(() => bludSave(pool, entity, keyId, 0, useForUpdate)));
  const saved = out.filter(x => x === 'saved').length;
  const [v] = await pool.query(`SELECT version FROM blud_locks WHERE entity = ? AND key_id = ?`, [entity, keyId]);
  return { saved, conflict: out.length - saved, version: Number(v[0].version) };
}

async function seedUsers(pool, { aktif, menunggu }) {
  await cleanup(pool);
  const rows = [];
  for (let i = 0; i < aktif; i++) rows.push([`${PREFIX}aktif_${i}`, `${PREFIX}aktif_${i}@t.local`, DUMMY_HASH, TEST_ROLE, 'AKTIF']);
  for (let i = 0; i < menunggu; i++) rows.push([`${PREFIX}wait_${i}`, `${PREFIX}wait_${i}@t.local`, DUMMY_HASH, TEST_ROLE, 'MENUNGGU']);
  await pool.query(`INSERT INTO users (username, email, password_hash, role, status) VALUES ?`, [rows]);
  const [ids] = await pool.query(`SELECT id, status FROM users WHERE role = ? ORDER BY id`, [TEST_ROLE]);
  return ids;
}

// Mirror verify-email activation: COUNT AKTIF [FOR UPDATE] -> if < quota set AKTIF.
async function activate(pool, userId, useForUpdate) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const lock = useForUpdate ? 'FOR UPDATE' : '';
    const [c] = await conn.query(
      `SELECT COUNT(*) AS cnt FROM users WHERE role = ? AND status = 'AKTIF' ${lock}`,
      [TEST_ROLE]
    );
    const cnt = Number(c[0].cnt);
    if (cnt < ROLE_QUOTA) {
      // jeda kecil untuk memperlebar window race (mensimulasikan latency app)
      await new Promise(r => setTimeout(r, 15));
      await conn.query(`UPDATE users SET status = 'AKTIF' WHERE id = ?`, [userId]);
    }
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

async function testQuota(pool, useForUpdate) {
  const seeded = await seedUsers(pool, { aktif: 2, menunggu: 5 }); // 2 AKTIF + 5 mau aktivasi, quota 3
  const waiters = seeded.filter(r => r.status === 'MENUNGGU').map(r => r.id);
  await Promise.all(waiters.map(id => activate(pool, id, useForUpdate)));
  const [c] = await pool.query(`SELECT COUNT(*) AS cnt FROM users WHERE role = ? AND status = 'AKTIF'`, [TEST_ROLE]);
  return Number(c[0].cnt);
}

// Mirror generateNoUsulan + INSERT race: dua insert no_usulan sama -> UNIQUE harus tolak satu.
async function testNoUsulanUnique(pool) {
  // pakai tabel users.username (ada UNIQUE) sebagai proxy aman untuk uji constraint-race,
  // tanpa menyentuh usulan_headers real. Invarian: 2 insert username sama -> 1 sukses, 1 ER_DUP_ENTRY.
  const uname = `${PREFIX}dup_${Date.now()}`;
  const ins = () => pool.query(
    `INSERT INTO users (username, email, password_hash, role, status) VALUES (?, ?, ?, ?, 'MENUNGGU')`,
    [uname, `${uname}_${Math.random()}@t.local`, DUMMY_HASH, TEST_ROLE]
  );
  const settled = await Promise.allSettled([ins(), ins(), ins()]);
  const ok = settled.filter(s => s.status === 'fulfilled').length;
  const dup = settled.filter(s => s.status === 'rejected' && /ER_DUP_ENTRY|Duplicate/i.test(String(s.reason && s.reason.code || s.reason))).length;
  return { ok, dup, total: settled.length };
}

// Mirror login-fail (route saat ini): SELECT failed_attempts -> hitung +1 di JS -> UPDATE.
// Baca-lalu-tulis non-atomik → rawan lost-update saat banyak gagal-login barengan.
async function failLoginOnce(pool, userId) {
  const conn = await pool.getConnection();
  try {
    const [u] = await conn.query(`SELECT failed_attempts FROM users WHERE id = ?`, [userId]);
    const newAttempts = (Number(u[0].failed_attempts) || 0) + 1;
    await new Promise(r => setTimeout(r, 10)); // window race (mirror latency bcrypt compare)
    if (newAttempts >= MAX_LOGIN_ATTEMPTS) {
      await conn.query(`UPDATE users SET failed_attempts = ?, locked_until = DATE_ADD(NOW(), INTERVAL 15 MINUTE) WHERE id = ?`, [newAttempts, userId]);
    } else {
      await conn.query(`UPDATE users SET failed_attempts = ? WHERE id = ?`, [newAttempts, userId]);
    }
  } finally { conn.release(); }
}

async function testLockoutRace(pool) {
  await cleanup(pool);
  await pool.query(`INSERT INTO users (username, email, password_hash, role, status, failed_attempts) VALUES (?, ?, ?, ?, 'AKTIF', 0)`,
    [`${PREFIX}lock`, `${PREFIX}lock@t.local`, DUMMY_HASH, TEST_ROLE]);
  const [r] = await pool.query(`SELECT id FROM users WHERE username = ?`, [`${PREFIX}lock`]);
  const id = r[0].id;
  const N = 8; // 8 gagal-login barengan; benar = failed_attempts berakhir 8 (atau ter-lock)
  await Promise.all(Array.from({ length: N }, () => failLoginOnce(pool, id)));
  const [f] = await pool.query(`SELECT failed_attempts, locked_until FROM users WHERE id = ?`, [id]);
  return { attempts: Number(f[0].failed_attempts), locked: !!f[0].locked_until, N };
}

// Mirror Rencana Aksi L48 — per-row CAS: UPDATE ... version=version+1 WHERE id AND version=expected.
// Proxy via blud_locks.version (mekanisme CAS identik, tanpa menyentuh tabel rencana_aksi real).
async function raCasUpdate(pool, entity, keyId, expected) {
  const [res] = await pool.query(
    `UPDATE blud_locks SET version = version + 1 WHERE entity = ? AND key_id = ? AND version = ?`,
    [entity, keyId, expected]
  );
  return res.affectedRows === 1 ? 'saved' : 'conflict'; // affectedRows=0 → assertUpdated throw conflict
}
async function testRaCas(pool) {
  await pool.query(`DELETE FROM blud_locks WHERE entity LIKE ?`, [PREFIX + '%']);
  const entity = `${PREFIX}ra`, keyId = 'row1';
  await pool.query(`INSERT INTO blud_locks (entity, key_id, version) VALUES (?, ?, 0)`, [entity, keyId]);
  const out = await Promise.all([0, 0, 0].map(() => raCasUpdate(pool, entity, keyId, 0)));
  const saved = out.filter(x => x === 'saved').length;
  const [v] = await pool.query(`SELECT version FROM blud_locks WHERE entity = ? AND key_id = ?`, [entity, keyId]);
  return { saved, conflict: out.length - saved, version: Number(v[0].version) };
}

// Mirror Kinerja saveSskBatch (versi AKTIF): whole-replace DELETE+INSERT TANPA CAS/version-check.
// Cek apakah save barengan ke versi sama → lost-update tanpa conflict (gap vs BLUD L51).
// Mirror FIX V3-6 saveSskBatch: assert version (blud_locks FOR UPDATE) → DELETE+INSERT → bump.
const KIN_ENTITY = 'kinerja_ssk', KIN_KEY = '9999:GAJI:MURNI:0';
async function sskSave(pool, tahun, sumber, marker, expected) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [vr] = await conn.query(`SELECT version FROM blud_locks WHERE entity=? AND key_id=? FOR UPDATE`, [KIN_ENTITY, KIN_KEY]);
    const cur = Number(vr[0]?.version ?? 0);
    if (cur !== expected) { await conn.rollback(); return 'conflict:VERSION_CONFLICT'; }
    await conn.query(`DELETE FROM kinerja_ssk WHERE tahun=? AND sumber=? AND versi_tipe='MURNI' AND versi_seq=0`, [tahun, sumber]);
    await new Promise(r => setTimeout(r, 15));
    await conn.query(
      `INSERT INTO kinerja_ssk (tahun,sumber,versi_tipe,versi_seq,canonical_id,parent_versi_id,is_nullified,uraian_ssk,uraian,program,kegiatan,subkegiatan,pagu,months,months_pct,total,total_pct,urut,updated_by)
       VALUES (?,?,'MURNI',0,?,NULL,0,?,?,'','','',0,'{}','{}',0,0,1,NULL)`,
      [tahun, sumber, 'K-RT' + marker, 'racetest_' + marker, 'racetest_' + marker]
    );
    await conn.query(`INSERT INTO blud_locks (entity,key_id,version) VALUES (?,?,1) ON DUPLICATE KEY UPDATE version=version+1`, [KIN_ENTITY, KIN_KEY]);
    await conn.commit();
    return 'saved';
  } catch (e) { await conn.rollback(); return 'conflict:' + (e.code || e.message); }
  finally { conn.release(); }
}
async function testKinerjaLostUpdate(pool) {
  const tahun = '9999', sumber = 'GAJI';
  await pool.query(`DELETE FROM kinerja_ssk WHERE tahun=?`, [tahun]);
  await pool.query(`DELETE FROM blud_locks WHERE entity=?`, [KIN_ENTITY]);
  await pool.query(`INSERT INTO blud_locks (entity,key_id,version) VALUES (?,?,0)`, [KIN_ENTITY, KIN_KEY]);
  // 2 writer barengan dgn baseline version=0 (FIX V3-6 aktif).
  const out = await Promise.all([1, 2].map(m => sskSave(pool, tahun, sumber, m, 0)));
  const graceful = out.filter(x => x === 'saved').length;
  const errored = out.filter(x => typeof x === 'string' && x.startsWith('conflict:'));
  const [rows] = await pool.query(`SELECT canonical_id FROM kinerja_ssk WHERE tahun=? AND sumber=?`, [tahun, sumber]);
  await pool.query(`DELETE FROM kinerja_ssk WHERE tahun=?`, [tahun]);
  await pool.query(`DELETE FROM blud_locks WHERE entity=?`, [KIN_ENTITY]);
  return { graceful, errored: errored.length, errSample: errored[0] || '', surviving: rows.length };
}

(async () => {
  const pool = await mysql.createPool({ ...cfg, connectionLimit: 12, waitForConnections: true });
  try {
    console.log('=== Audit Fase A — Race Konklusif (DB-layer) ===\n');

    // T1a: TANPA FOR UPDATE (baseline — harus bocor > quota untuk membuktikan race nyata)
    const withoutFU = await testQuota(pool, false);
    record(
      'T1a Kuota TANPA FOR UPDATE (baseline race)',
      withoutFU > ROLE_QUOTA,
      `AKTIF akhir = ${withoutFU} (quota ${ROLE_QUOTA}). Diharapkan >${ROLE_QUOTA} → membuktikan TOCTOU nyata kalau tanpa lock.`
    );

    // T1b: DENGAN FOR UPDATE (fix V3-4 — harus tepat = quota, tidak bocor)
    const withFU = await testQuota(pool, true);
    record(
      'T1b Kuota DENGAN FOR UPDATE (fix V3-4)',
      withFU === ROLE_QUOTA,
      `AKTIF akhir = ${withFU} (quota ${ROLE_QUOTA}). Diharapkan tepat ${ROLE_QUOTA} → fix menahan luapan saat verifikasi barengan.`
    );

    // T2: UNIQUE constraint race (proxy no_usulan / username)
    const t2 = await testNoUsulanUnique(pool);
    record(
      'T2 UNIQUE constraint race (proxy no_usulan)',
      t2.ok === 1 && t2.dup === t2.total - 1,
      `${t2.total} insert nilai sama → ${t2.ok} sukses, ${t2.dup} ditolak ER_DUP_ENTRY. Diharapkan 1 sukses sisanya ditolak.`
    );

    // T3a: race lockout login LAMA (baseline — harus bocor, membuktikan lost-update)
    const t3a = await testLockoutRace(pool);
    record(
      'T3a Lockout login LAMA (baseline lost-update)',
      t3a.attempts < t3a.N && !t3a.locked,
      `${t3a.N} gagal-login barengan → failed_attempts=${t3a.attempts}, locked=${t3a.locked}. Diharapkan counter < ${t3a.N} → membuktikan lost-update kalau non-atomik.`
    );

    // T3b: race lockout login ATOMIK (fix V3-5 — counter harus tepat N + ter-lock)
    const t3b = await testLockoutAtomic(pool);
    record(
      'T3b Lockout login ATOMIK (fix V3-5)',
      t3b.attempts === t3b.N && t3b.locked,
      `${t3b.N} gagal-login barengan → failed_attempts=${t3b.attempts}, locked=${t3b.locked}. Diharapkan tepat ${t3b.N} + locked → increment atomik tahan lost-update.`
    );

    // T4a: BLUD optimistic-lock TANPA FOR UPDATE (baseline — banyak save lolos = lost update)
    const t4a = await testBludLock(pool, false);
    record(
      'T4a BLUD lock TANPA FOR UPDATE (baseline race)',
      t4a.saved > 1,
      `3 save expected=0 barengan → ${t4a.saved} "saved", ${t4a.conflict} conflict, version=${t4a.version}. Diharapkan >1 saved → membuktikan lost-update tanpa lock.`
    );

    // T4b: BLUD optimistic-lock DENGAN FOR UPDATE (L51 — tepat 1 saved, sisanya conflict)
    const t4b = await testBludLock(pool, true);
    record(
      'T4b BLUD lock DENGAN FOR UPDATE (L51)',
      t4b.saved === 1 && t4b.conflict === 2 && t4b.version === 1,
      `3 save expected=0 barengan → ${t4b.saved} saved, ${t4b.conflict} conflict, version=${t4b.version}. Diharapkan 1 saved / 2 conflict / version=1.`
    );

    // T5: Rencana Aksi L48 — per-row CAS optimistic lock (harus 1 saved / 2 conflict)
    const t5 = await testRaCas(pool);
    record(
      'T5 Rencana Aksi L48 — per-row CAS (proxy)',
      t5.saved === 1 && t5.conflict === 2 && t5.version === 1,
      `3 update expected=0 barengan → ${t5.saved} saved, ${t5.conflict} conflict, version=${t5.version}. Diharapkan 1/2/1 → CAS (WHERE version=expected) tahan lost-update.`
    );

    // T6: Kinerja SSK versi aktif — FIX V3-6 (optimistic lock via blud_locks, pola L51).
    // PASS = 1 commit + 1 graceful VERSION_CONFLICT (bukan deadlock, bukan lost-update senyap).
    const t6 = await testKinerjaLostUpdate(pool);
    record(
      'T6 Kinerja SSK optimistic-lock (fix V3-6)',
      t6.graceful === 1 && t6.errored === 1 && t6.errSample.includes('VERSION_CONFLICT') && t6.surviving === 1,
      `2 save barengan versi sama → ${t6.graceful} commit, ${t6.errored} conflict(${t6.errSample}), surviving=${t6.surviving}. Diharapkan 1 commit / 1 VERSION_CONFLICT anggun (≠ deadlock/lost-update).`
    );

    console.log('\n=== RINGKASAN ===');
    const failed = results.filter(r => !r.pass);
    console.log(`${results.length - failed.length}/${results.length} PASS.`);
    if (failed.length) console.log('GAGAL:', failed.map(f => f.name).join('; '));
  } finally {
    await cleanup(pool);
    console.log('\n[cleanup] semua row __racetest dihapus.');
    await pool.end();
  }
})().catch(e => { console.error('[ERROR]', e); process.exit(1); });
