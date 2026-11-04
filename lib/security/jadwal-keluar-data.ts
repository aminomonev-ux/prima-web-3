// lib/security/jadwal-keluar-data.ts — baca/tulis jadwal "Pemeliharaan & keluar otomatis" (DB).
// Aturannya di `jadwal-keluar.ts` (MURNI); di sini hanya kueri. Konsep: docs/CONCEPT-pemeliharaan-keluar.md
import { sql, withTransaction, type Penanya, type TxSql } from '@/lib/data/db';
import { verifyToken } from '@/lib/security/auth';
import {
  KUNCI_JADWAL_KELUAR, TAHAN_LOGIN_MAKS_JAM, bacaJadwal, sesiKenaKeluar, statusUntukSesi, loginDitahan,
  alasanTolakKirim, alasanTolakBatal, alasanTolakBukaLogin, kalimatLoginDitahan, jamDari,
  type JadwalKeluar, type StatusTab,
} from './jadwal-keluar';

const F = '%Y-%m-%d %H:%i:%s';

export class JadwalKeluarError extends Error {
  constructor(message: string, readonly status = 409) { super(message); this.name = 'JadwalKeluarError'; }
}

/** Jadwal + jam MySQL sekarang; selalu satu baris walau kuncinya belum pernah ditulis. */
export async function bacaJadwalSekarang(q: Penanya = sql): Promise<{ jadwal: JadwalKeluar | null; sekarang: string }> {
  const rows = await q`
    SELECT DATE_FORMAT(NOW(), ${F}) AS sekarang,
           (SELECT value FROM app_config WHERE \`key\` = ${KUNCI_JADWAL_KELUAR}) AS jadwal
  ` as { sekarang: string; jadwal: string | null }[];
  return { jadwal: bacaJadwal(rows[0]?.jadwal), sekarang: rows[0]?.sekarang ?? '' };
}

/**
 * Syarat SQL "sesi kena keluar paksa" (`s` = user_sessions, `u` = users) — cermin `sesiKenaKeluar`
 * (dijaga uji), termasuk `NOW() >= batas`. SATU rumus untuk mematikan dan untuk menghitung.
 */
const sesiKenaKeluarSql = (j: JadwalKeluar) => sql`(
      NOW() >= ${j.batas}
      AND s.created_at < ${j.batas}
      AND s.session_id <> ${j.sesi_pengirim}
      AND NOT (u.role = 'SUPER_ADMIN' AND s.created_at >= ${j.dikirim}))`;

/**
 * Mengeluarkan semua sesi yang kena, sekaligus — `getSession` menolaknya satu per satu saat
 * dipakai, tapi sesi yang tak pernah dipakai lagi harus ikut mati SEBELUM barisnya ditimpa jadwal
 * baru. Aman dipanggil kapan saja dan berulang.
 */
export async function terapkanKeluar(q: Penanya, j: JadwalKeluar): Promise<number> {
  const res = await q`
    UPDATE user_sessions s
    JOIN users u ON u.id = s.user_id
    SET s.invalidated_at = NOW()
    WHERE s.invalidated_at IS NULL AND ${sesiKenaKeluarSql(j)}
  ` as { affectedRows?: number }[];
  return Number(res[0]?.affectedRows ?? 0);
}

interface BarisSesi { role: string; dibuat: string; dicabut: string | null; sekarang: string; jadwal: string | null }

async function bacaSesi(sessionId: string, q: Penanya = sql): Promise<BarisSesi | null> {
  const rows = await q`
    SELECT u.role,
           DATE_FORMAT(s.created_at, ${F})     AS dibuat,
           DATE_FORMAT(s.invalidated_at, ${F}) AS dicabut,
           DATE_FORMAT(NOW(), ${F})            AS sekarang,
           m.value                             AS jadwal
    FROM user_sessions s
    JOIN users u ON u.id = s.user_id
    LEFT JOIN app_config m ON m.\`key\` = ${KUNCI_JADWAL_KELUAR}
    WHERE s.session_id = ${sessionId}
    LIMIT 1
  ` as BarisSesi[];
  return rows[0] ?? null;
}

/** Status hitung mundur untuk tab milik sesi yang masih sah. */
export async function statusTabSesi(sessionId: string): Promise<{ status: StatusTab; jadwal: JadwalKeluar | null; sekarang: string }> {
  const r = await bacaSesi(sessionId);
  if (!r) return { status: { aktif: false }, jadwal: null, sekarang: '' };
  const jadwal = bacaJadwal(r.jadwal);
  return { status: statusUntukSesi(jadwal, { id: sessionId, dibuat: r.dibuat, role: r.role }, r.sekarang), jadwal, sekarang: r.sekarang };
}

export type AlasanSesiDitolak = 'PEMELIHARAAN' | 'SESI_BERAKHIR';

/**
 * Untuk balasan 401: sesi ini mati karena pemeliharaan, atau sebab lain? Supaya halaman login bisa
 * menyebut sebab yang benar. Token WAJIB dibaca sebelum `getSession` — ia menghapus cookie sesi
 * yang ditolaknya. Sesi yang sudah keluar sendiri sebelum batas tidak dihitung pemeliharaan.
 */
export async function alasanSesiDitolak(token: string | undefined, q: Penanya = sql): Promise<AlasanSesiDitolak> {
  if (!token) return 'SESI_BERAKHIR';
  try {
    const p = await verifyToken(token);
    if (!p?.sessionId) return 'SESI_BERAKHIR';
    const r = await bacaSesi(p.sessionId, q);
    if (!r) return 'SESI_BERAKHIR';
    const j = bacaJadwal(r.jadwal);
    const kena = !!j && sesiKenaKeluar(j, { id: p.sessionId, dibuat: r.dibuat, role: r.role }, r.sekarang)
      && (r.dicabut === null || r.dicabut >= j.batas);
    return kena ? 'PEMELIHARAAN' : 'SESI_BERAKHIR';
  } catch {
    return 'SESI_BERAKHIR';
  }
}

/** Login route: kalimat penolakan kalau login sedang ditahan, `null` kalau boleh. */
export async function alasanLoginDitahan(): Promise<string | null> {
  const { jadwal, sekarang } = await bacaJadwalSekarang();
  return jadwal && loginDitahan(jadwal, sekarang) ? kalimatLoginDitahan(jadwal) : null;
}

/**
 * Halaman login: diumumkan sebelum orang mengetik kata sandi. Pesan pemeliharaannya tidak ikut —
 * kalimatnya ditulis untuk orang yang sedang bekerja ("simpan pekerjaan Anda"). Gagal baca = diam.
 */
export async function pemberitahuanLoginDitahan(): Promise<{ sampai: string } | null> {
  try {
    const { jadwal, sekarang } = await bacaJadwalSekarang();
    return jadwal && loginDitahan(jadwal, sekarang) ? { sampai: jamDari(jadwal.login_dibuka) } : null;
  } catch {
    return null;
  }
}

/**
 * Sesi lain yang masih hidup (aktif dalam batas idle 60 menit) — angka di Admin Panel. Sesi yang
 * sudah kena keluar paksa tapi belum sempat ditandai tidak dihitung; panel cukup MEMBACA (dulu
 * GET-nya menjalankan `terapkanKeluar` tiap 15 detik, selamanya sesudah pemeliharaan apa pun).
 */
export async function hitungSesiLain(sessionId: string, j: JadwalKeluar | null, q: Penanya = sql): Promise<number> {
  const rows = await q`
    SELECT COUNT(*) AS n FROM user_sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.invalidated_at IS NULL AND s.session_id <> ${sessionId}
      AND s.last_active >= NOW() - INTERVAL 60 MINUTE
      ${j ? sql`AND NOT ${sesiKenaKeluarSql(j)}` : sql``}
  ` as { n: number | string }[];
  return Number(rows[0]?.n ?? 0);
}

/** Baris jadwal dikunci dulu (dibuat kosong kalau belum ada — `FOR UPDATE` pada baris yang belum ada tidak mengunci apa pun, L69-a). */
async function kunciJadwal(tx: TxSql): Promise<{ jadwal: JadwalKeluar | null; sekarang: string }> {
  await tx`INSERT IGNORE INTO app_config (\`key\`, value) VALUES (${KUNCI_JADWAL_KELUAR}, '')`;
  const rows = await tx`
    SELECT value AS jadwal, DATE_FORMAT(NOW(), ${F}) AS sekarang
    FROM app_config WHERE \`key\` = ${KUNCI_JADWAL_KELUAR}
    FOR UPDATE
  ` as { jadwal: string; sekarang: string }[];
  return { jadwal: bacaJadwal(rows[0]?.jadwal), sekarang: rows[0]?.sekarang ?? '' };
}

const tulisJadwal = (tx: TxSql, j: JadwalKeluar | null) =>
  tx`UPDATE app_config SET value = ${j ? JSON.stringify(j) : ''} WHERE \`key\` = ${KUNCI_JADWAL_KELUAR}`;

export interface OpsiKirim { pesan: string; menit: number; tahanLogin: boolean; oleh: string; sesiPengirim: string }

/** Badan transaksi dipisah (`…Dalam`) supaya uji bisa menjalankannya di transaksi yang dibatalkan. */
export async function kirimDalam(tx: TxSql, opsi: OpsiKirim): Promise<JadwalKeluar> {
  const { jadwal: lama, sekarang } = await kunciJadwal(tx);
  const tolak = alasanTolakKirim(lama, sekarang);
  if (tolak) throw new JadwalKeluarError(tolak);
  // Jadwal lama akan ditimpa: sesi yang sudah dikeluarkannya dimatikan permanen dulu.
  if (lama) await terapkanKeluar(tx, lama);
  const [w] = await tx`
    SELECT DATE_FORMAT(CAST(${sekarang} AS DATETIME) + INTERVAL ${opsi.menit} MINUTE, ${F}) AS batas,
           DATE_FORMAT(CAST(${sekarang} AS DATETIME) + INTERVAL ${opsi.menit} MINUTE + INTERVAL ${TAHAN_LOGIN_MAKS_JAM} HOUR, ${F}) AS dibuka
  ` as { batas: string; dibuka: string }[];
  const baru: JadwalKeluar = {
    pesan: opsi.pesan, dikirim: sekarang, batas: w.batas, oleh: opsi.oleh, sesi_pengirim: opsi.sesiPengirim,
    tahan_login: opsi.tahanLogin, login_dibuka: opsi.tahanLogin ? w.dibuka : w.batas,
  };
  await tulisJadwal(tx, baru);
  return baru;
}

export async function batalkanDalam(tx: TxSql): Promise<JadwalKeluar> {
  const { jadwal, sekarang } = await kunciJadwal(tx);
  const tolak = alasanTolakBatal(jadwal, sekarang);
  if (tolak || !jadwal) throw new JadwalKeluarError(tolak ?? 'Tidak ada pemeliharaan.');
  await tulisJadwal(tx, null);
  return jadwal;
}

export async function bukaLoginDalam(tx: TxSql): Promise<JadwalKeluar> {
  const { jadwal, sekarang } = await kunciJadwal(tx);
  const tolak = alasanTolakBukaLogin(jadwal, sekarang);
  if (tolak || !jadwal) throw new JadwalKeluarError(tolak ?? 'Login sedang tidak ditahan.');
  // Batas yang sudah lewat tetap disimpan: sesi lama yang belum sempat dipakai tetap tertolak.
  if (sekarang >= jadwal.batas) await terapkanKeluar(tx, jadwal);
  const baru = { ...jadwal, login_dibuka: sekarang };
  await tulisJadwal(tx, baru);
  return baru;
}

export const kirimJadwalKeluar     = (opsi: OpsiKirim) => withTransaction(({ tx }) => kirimDalam(tx, opsi));
export const batalkanJadwalKeluar  = () => withTransaction(({ tx }) => batalkanDalam(tx));
export const bukaLoginKeluar       = () => withTransaction(({ tx }) => bukaLoginDalam(tx));
