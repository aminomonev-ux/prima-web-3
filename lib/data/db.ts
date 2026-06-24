import mysql from 'mysql2/promise';

// Cache pool di globalThis supaya HMR (Turbopack/Next.js dev) tidak bikin
// pool baru setiap kali file di-rebuild. Tanpa ini, setiap save file kode
// yg import db.ts akan spawn pool baru — connection lama tidak dilepas →
// MySQL kena `ER_CON_COUNT_ERROR: Too many connections` setelah beberapa HMR.
//
// Production: `globalThis.__mysqlPool` undefined di first import → create once.
// Dev HMR: module re-eval → ambil pool yang sudah ada dari globalThis.
declare global {
   
  var __mysqlPool: mysql.Pool | undefined;
}

function createPool(): mysql.Pool {
  return mysql.createPool({
    host:             process.env.MYSQL_HOST     ?? 'localhost',
    port:             parseInt(process.env.MYSQL_PORT ?? '3306'),
    user:             process.env.MYSQL_USER     ?? '',
    password:         process.env.MYSQL_PASSWORD ?? '',
    database:         process.env.MYSQL_DATABASE ?? '',
    ssl:              process.env.MYSQL_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
    waitForConnections: true,
    connectionLimit:  10,
    queueLimit:       0,
    timezone:         '+07:00',
  });
}

const pool: mysql.Pool = globalThis.__mysqlPool ?? createPool();
if (process.env.NODE_ENV !== 'production') {
  globalThis.__mysqlPool = pool;
}

type SqlValue = string | number | boolean | null | undefined | SqlFragment | SqlValue[] | Buffer | Uint8Array;

class SqlFragment implements PromiseLike<unknown[]> {
  constructor(public readonly query: string, public readonly params: unknown[]) {}

  then<TResult1 = unknown[], TResult2 = never>(
    onFulfilled?: ((value: unknown[]) => TResult1 | PromiseLike<TResult1>) | null,
    onRejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return execute(this.query, this.params).then(
      onFulfilled ?? undefined,
      onRejected ?? undefined,
    ) as PromiseLike<TResult1 | TResult2>;
  }
}

async function execute(query: string, params: unknown[]): Promise<unknown[]> {
  try {
    // pool.query (non-prepared) hanya untuk JSON_OBJECTAGG yang tidak kompatibel dengan prepared statements
    const useQuery = /JSON_OBJECTAGG/i.test(query);
    if (useQuery) {
      const [result] = await pool.query(query, params);
      if (Array.isArray(result)) return result as unknown[];
      const ok = result as mysql.OkPacket;
      return [{ insertId: ok.insertId, affectedRows: ok.affectedRows }];
    }
    const [result] = await pool.execute(query, params as never);
    if (Array.isArray(result)) return result as unknown[];
    const ok = result as mysql.OkPacket;
    return [{ insertId: ok.insertId, affectedRows: ok.affectedRows }];
  } catch (error) {
    console.error('[DB Error]', error);
    throw error;
  }
}

// Embed integer langsung ke SQL (bukan ? parameter) — aman untuk LIMIT/OFFSET
export function sqlInt(n: number): SqlFragment {
  return new SqlFragment(String(Math.floor(Math.max(0, n))), []);
}

// Convert JS Date → MySQL DATETIME string `YYYY-MM-DD HH:MM:SS` pakai LOCAL TIME.
// MySQL 8.4 strict mode tolak ISO 8601 format (T/Z/ms) — wajib pakai helper ini.
// Local time digunakan karena pool config `timezone: '+07:00'`.
export function toMysqlDatetime(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ` +
         `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

// Parse integer dari query param dengan fallback — cegah NaN masuk ke SQL
export function safeInt(val: string | null | undefined, fallback: number): number {
  const n = parseInt(String(val ?? fallback), 10);
  return Number.isNaN(n) ? fallback : n;
}

// O5: Escape LIKE wildcard (% dan _) di user input. `LIKE '%foo%'` aman dari
// SQLi (parameterized), tapi karakter `%` dan `_` di user input akan diperlakukan
// sebagai wildcard MySQL → hasil melebar (`%`) atau match karakter tunggal (`_`)
// secara unexpected. Escape dengan backslash supaya literal.
//
// Usage:
//   const term = escapeLike(search);
//   sql`WHERE username LIKE ${'%' + term + '%'}`;
//
// MySQL default escape char untuk LIKE adalah backslash. Kalau kolom pakai
// ESCAPE 'X' eksplisit, sesuaikan. NOT_LIKE pakai aturan sama.
export function escapeLike(input: string): string {
  return input.replace(/[\\%_]/g, c => '\\' + c);
}

// O1: Typed query helpers — hilangkan boilerplate
// `const rows = await sql\`...\` as Record<string,unknown>[]; if (!rows.length) return null; const x = rows[0];`
// yang berulang 50+ tempat. Sekarang:
//   const h = await queryOne<UsulanHeader>(sql`SELECT * FROM usulan_headers WHERE id = ${id} LIMIT 1`);
//   if (!h) return ...notFound;
//   // h.sub_bidang sudah typed
//
//   const items = await queryMany<UsulanItem>(sql`SELECT * FROM usulan_items WHERE usulan_id = ${id}`);
//
// Tetap kompatibel dengan pattern lama (await sql`...`) — helper ini opt-in,
// migrasi gradual per route. SqlFragment.then() resolve ke unknown[], helper
// tinggal narrow type-nya.
export async function queryOne<T = Record<string, unknown>>(
  fragment: SqlFragment,
): Promise<T | null> {
  const rows = await fragment;
  return rows.length ? (rows[0] as T) : null;
}

export async function queryMany<T = Record<string, unknown>>(
  fragment: SqlFragment,
): Promise<T[]> {
  const rows = await fragment;
  return rows as T[];
}

// V5-CQ-02: jalankan statement non-SELECT, kembalikan typed { affectedRows, insertId }.
// Ganti pola berulang `await sql\`UPDATE...\` as unknown as Array<{affectedRows:number}>`.
// Migrasi call-site bertahap (opsional). Untuk konteks transaksi gunakan hasil `tx` langsung.
export async function execWrite(fragment: SqlFragment): Promise<{ affectedRows: number; insertId: number }> {
  const rows = await fragment as Array<{ affectedRows?: number; insertId?: number }>;
  const r = rows[0] ?? {};
  return { affectedRows: r.affectedRows ?? 0, insertId: r.insertId ?? 0 };
}

// BUG-C2: Transaction wrapper. Wrap DELETE+INSERT / multi-statement ops
// to guarantee atomicity. Auto-rollback on throw, auto-release connection.
//
// Usage:
//   await withTransaction(async ({ tx }) => {
//     await tx`DELETE FROM usulan_items WHERE usulan_id = ${id}`;
//     await tx`INSERT INTO usulan_items (...) VALUES (...)`;
//   });
//
// `tx` is a tagged template (identical surface to global `sql`) but bound to the
// transaction connection. Throws inside `fn` → rollback. Returns fn's value.

export type TxSql = (strings: TemplateStringsArray, ...values: SqlValue[]) => Promise<unknown[]>;

function buildQuery(strings: TemplateStringsArray, values: SqlValue[]): { query: string; params: unknown[] } {
  let query = '';
  const params: unknown[] = [];
  strings.forEach((str, i) => {
    query += str;
    if (i < values.length) {
      const val = values[i];
      if (val instanceof SqlFragment) {
        query += val.query;
        params.push(...val.params);
      } else if (Array.isArray(val)) {
        if (val.length === 0) query += 'NULL';
        else { query += val.map(() => '?').join(', '); params.push(...val); }
      } else {
        query += '?'; params.push(val ?? null);
      }
    }
  });
  return { query, params };
}

// PERF-C1: Bulk INSERT helper untuk batch save.
// Sebelum: 200 row INSERT loop = 200 round-trip × 30-80ms = 6-16 detik.
// Sesudah: single multi-row INSERT VALUES (...), (...), ... = 1 round-trip.
//
// Pakai pool.query (bukan execute) karena `VALUES ?` expansion butuh non-prepared.
// Returns OkPacket dengan insertId (first row) + affectedRows.
//
// IMPORTANT: kalau dipanggil DI DALAM withTransaction (mis. setelah DELETE),
// WAJIB pass `conn` agar pakai connection transaksi yang sama. Kalau tidak,
// connection baru dari pool akan menunggu lock dari DELETE → deadlock + timeout.
//
// Usage:
//   // Standalone:
//   await bulkInsert('kinerja_ssk', cols, values);
//
//   // Di dalam transaction (WAJIB pass conn):
//   await withTransaction(async ({ tx, conn }) => {
//     await tx`DELETE FROM kinerja_ssk WHERE ...`;
//     await bulkInsert('kinerja_ssk', cols, values, conn);
//   });
//
// Tabel/kolom name dibungkus backtick agar aman dari reserved word.
export async function bulkInsert(
  table: string,
  columns: readonly string[],
  rows: unknown[][],
  conn?: mysql.PoolConnection,
): Promise<{ insertId: number; affectedRows: number }> {
  if (rows.length === 0) return { insertId: 0, affectedRows: 0 };
  const colList = columns.map(c => `\`${c}\``).join(', ');
  const query   = `INSERT INTO \`${table}\` (${colList}) VALUES ?`;
  const executor = conn ?? pool;
  const [result] = await executor.query(query, [rows]);
  const ok = result as mysql.OkPacket;
  return { insertId: ok.insertId, affectedRows: ok.affectedRows };
}

export async function withTransaction<T>(
  fn: (ctx: { tx: TxSql; conn: mysql.PoolConnection }) => Promise<T>
): Promise<T> {
  const conn = await pool.getConnection();
  const tx: TxSql = async (strings, ...values) => {
    const { query, params } = buildQuery(strings, values);
    const hasComplexSubquery = /JSON_OBJECTAGG/i.test(query);
    const [result] = hasComplexSubquery
      ? await conn.query(query, params)
      : await conn.execute(query, params as never);
    if (Array.isArray(result)) return result as unknown[];
    const ok = result as mysql.OkPacket;
    return [{ insertId: ok.insertId, affectedRows: ok.affectedRows }];
  };
  try {
    await conn.beginTransaction();
    const result = await fn({ tx, conn });
    await conn.commit();
    return result;
  } catch (e) {
    try { await conn.rollback(); } catch {}
    throw e;
  } finally {
    conn.release();
  }
}

export function sql(strings: TemplateStringsArray, ...values: SqlValue[]): SqlFragment {
  let query = '';
  const params: unknown[] = [];

  strings.forEach((str, i) => {
    query += str;
    if (i < values.length) {
      const val = values[i];
      if (val instanceof SqlFragment) {
        query += val.query;
        params.push(...val.params);
      } else if (Array.isArray(val)) {
        if (val.length === 0) {
          query += 'NULL';
        } else {
          query += val.map(() => '?').join(', ');
          params.push(...val);
        }
      } else {
        query += '?';
        params.push(val ?? null);
      }
    }
  });

  return new SqlFragment(query, params);
}