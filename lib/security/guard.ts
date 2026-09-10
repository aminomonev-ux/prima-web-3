// ─── PRIMA — Central Route Guard helpers ──────────────────────────────────────
// STANDAR WAJIB untuk SEMUA route API (L60/L61): proxy.ts TIDAK menjaga /api/* per
// role — enforcement ada di tiap route. Route baru yang lupa guard = lubang akses
// instan. Pakai helper ini, JANGAN cuma cek getSession() (itu hanya "sudah login").
//
//   requireSession()              → wajib login (self/identity endpoint)
//   requireRole([roles])          → login + role ∈ allowed (akses berbasis role murni)
//   requireAccess(check)          → login + check(role, app_access) (modul "milik bersama"
//                                    yang bisa di-grant manual via app_access; pola lkjip/bba/ra)
//
// Semua mengembalikan discriminated union — pakai: `const g = await requireRole(...);
// if (!g.ok) return g.res; const { session } = g;`
import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { sql, queryOne } from '@/lib/data/db';
import { getSession } from '@/lib/security/auth';
import { keadaanTerburuk, type KeadaanSakelar } from '@/lib/registry/apps';
import type { SessionPayload } from '@/types';

export type GuardOk   = { ok: true; session: SessionPayload };
export type GuardFail = { ok: false; res: NextResponse };
export type GuardResult = GuardOk | GuardFail;

const unauthorized = (): GuardFail => ({ ok: false, res: NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 }) });
const forbidden    = (): GuardFail => ({ ok: false, res: NextResponse.json({ ok: false, message: 'Akses ditolak' }, { status: 403 }) });

export async function requireSession(): Promise<GuardResult> {
  const session = await getSession();
  if (!session) return unauthorized();
  return { ok: true, session };
}

export async function requireRole(allowed: readonly string[]): Promise<GuardResult> {
  const session = await getSession();
  if (!session) return unauthorized();
  if (!allowed.includes(session.role)) return forbidden();
  return { ok: true, session };
}

// Evaluasi role + app_access untuk modul "milik bersama" (isBludRole, isKinerjaRole,
// isPkRole, isLkjipRole, isAsetRole, ...). Short-circuit: role allow-list lolos tanpa
// query DB; selain itu baca users.app_access sekali. Dipakai requireAccess (route yang
// sudah pegang session) dan page guard server component (userId/role dari header proxy).
export async function hasAppAccess(
  userId: number,
  role: string,
  check: (role: string, appAccess: string[] | null) => boolean,
): Promise<boolean> {
  if (check(role, null)) return true;
  const row = await queryOne<{ app_access: string[] | null }>(
    sql`SELECT app_access FROM users WHERE id = ${userId} LIMIT 1`,
  );
  return check(role, row?.app_access ?? null);
}

/**
 * Peran yang boleh menembus sakelar mati. Orang yang mematikan modul harus tetap
 * bisa masuk memeriksanya — dan layarnya memang sudah mengecualikannya lebih dulu
 * (`blud/layout.tsx`, `blud/_izin.ts`). Kalau API tidak ikut mengecualikan, yang
 * terjadi persis keadaan yang N4 hindari: layarnya terbuka tapi tiap panggilan
 * dibalas 503 — pengguna melihat layar rusak, bukan halaman pemeliharaan (S1).
 *
 * Ditaruh di sini, bukan di tiap pemanggil, supaya kedua lapis membaca daftar yang
 * sama. Dulu daftarnya ditulis ulang sebagai `role !== 'SUPER_ADMIN'` di dua layar.
 */
export const PERAN_TEMBUS_SAKELAR: readonly string[] = ['SUPER_ADMIN'];

export type OpsiSakelar = { role?: string; kecualiRole?: readonly string[] };

function bolehTembusSakelar(opts?: OpsiSakelar): boolean {
  if (!opts?.role) return false;
  return (opts.kecualiRole ?? PERAN_TEMBUS_SAKELAR).includes(opts.role);
}

/**
 * S4 — kill-switch modul. Membaca `app_config` dan menolak kalau flagnya bukan
 * 'online'. Meniru `app/api/rima/query/route.ts` yang sudah bersikap begini.
 *
 * **503, bukan 403.** "Modul sedang dimatikan admin" dan "Anda tidak berhak" dua
 * hal berbeda, dan yang menerimanya harus bisa membedakan — yang pertama akan
 * hilang sendiri, yang kedua perlu minta akses. Karena itu pula ini TIDAK
 * diselipkan ke dalam `hasAppAccess`: hasilnya akan jadi 403 dengan pesan keliru.
 *
 * **Fail-closed.** Gagal membaca `app_config` = tolak, bukan lanjut diam-diam.
 * Sakelar keamanan yang menyala hanya kalau semuanya lancar bukan sakelar.
 * Risikonya kecil: kalau MySQL bermasalah, modulnya toh sudah tidak bisa apa-apa.
 *
 * Mengembalikan `NextResponse | null` supaya jadi early-return satu baris, pola
 * yang sama dengan `bludRateLimit`:
 *   const mati = await modulMati(['app_status_blud'], { role: session.role })
 *   if (mati) return mati
 *
 * `role` WAJIB dioper kalau pengecualian mau berlaku. Tanpa itu tidak ada yang
 * dikecualikan — pemanggil yang lupa menutup pintu, bukan diam-diam membukanya.
 */
/**
 * P5 — mode BACA-SAJA. Sakelar tidak lagi dua keadaan, tapi tiga; yang tengah
 * (`readonly`) membiarkan modul dibuka & dicetak tapi menutup semua penulisan.
 *
 * `'gagal'` bukan keadaan sakelar melainkan keadaan PEMBACAAN sakelar — dipisah
 * supaya pemanggil yang cuma bertanya "beku?" tidak salah menjawab "ya" saat MySQL
 * yang bermasalah.
 */
export type KeadaanModul = KeadaanSakelar | 'gagal';

/**
 * METODE datang dari proxy, BUKAN dioper tiap route — dan itu keputusan pokok P5.
 *
 * Kalau tiap pemanggil harus menyertakan `req.method`, satu route yang lupa berarti
 * tulisan lolos saat modulnya dibekukan: cacat senyap yang bentuknya persis T-1 dan
 * L69 (perbaikan yang tidak kena semua jalur tulis). Dengan header, kesembilan modul
 * yang dijaga gate G ikut mendapat baca-saja tanpa satu route pun disentuh, dan route
 * yang lahir besok ikut sejak hari pertama.
 *
 * Headernya di-strip lalu dipasang ulang proxy dari `req.method` — pola V3-1/L54 yang
 * sudah dipakai `x-user-*`, jadi ia tidak bisa dipalsukan klien.
 */
const METODE_BACA = new Set(['GET', 'HEAD', 'OPTIONS']);
export const HEADER_METODE = 'x-prima-metode';

/**
 * Tidak tahu metodenya = anggap MENULIS. Arah gagalnya sengaja begitu: modul beku
 * yang menolak satu pembacaan itu merepotkan, modul beku yang meloloskan tulisan itu
 * tidak membekukan apa pun.
 */
async function sedangMenulis(): Promise<boolean> {
  try {
    const m = (await headers()).get(HEADER_METODE);
    if (!m) return true;
    return !METODE_BACA.has(m.toUpperCase());
  } catch {
    return true;
  }
}

async function bacaKeadaan(keys: string[]): Promise<KeadaanModul> {
  try {
    const rows = await sql`SELECT \`key\`, value FROM app_config WHERE \`key\` IN (${keys})`;
    // Kunci yang belum ada barisnya dianggap 'online' — sama seperti GET app-status
    // yang mengisi default. Modul baru tidak boleh mati hanya karena seed tertinggal.
    return keadaanTerburuk((rows as { value: string }[]).map((r) => r.value));
  } catch {
    return 'gagal';
  }
}

/**
 * Keadaan modul apa adanya, untuk yang perlu MENAMPILKANNYA (lencana BEKU di layar,
 * spanduk, kartu /menu) alih-alih menolak permintaan.
 */
export async function keadaanModul(keys: string[], opts?: OpsiSakelar): Promise<KeadaanModul> {
  if (bolehTembusSakelar(opts)) return 'online';
  return bacaKeadaan(keys);
}

const tolakMati = (pesan: string) =>
  NextResponse.json({ ok: false, code: 'MODUL_MATI', error: pesan }, { status: 503 });

/**
 * 503 dan kode SENDIRI (`MODUL_BACA_SAJA`), terpisah dari `MODUL_MATI`. Penerimanya
 * harus bisa membedakan "sedang dibekukan, membaca tetap boleh" dari "modul mati" —
 * alasan yang sama persis dengan kenapa `modulMati` memulangkan 503 dan bukan 403.
 */
const tolakBeku = () =>
  NextResponse.json(
    {
      ok: false,
      code: 'MODUL_BACA_SAJA',
      error: 'Modul ini sedang dibekukan admin. Membuka dan mencetak tetap bisa, menyimpan ditutup sementara.',
    },
    { status: 503 },
  );

export async function modulMati(
  keys: string[],
  opts?: OpsiSakelar,
): Promise<NextResponse | null> {
  if (bolehTembusSakelar(opts)) return null;

  const keadaan = await bacaKeadaan(keys);
  if (keadaan === 'gagal') {
    return tolakMati('Modul sedang tidak tersedia. Coba lagi beberapa saat lagi.');
  }
  if (keadaan === 'maintenance') {
    return tolakMati('Modul ini sedang dimatikan admin untuk pemeliharaan.');
  }
  if (keadaan === 'readonly' && (await sedangMenulis())) return tolakBeku();
  return null;
}

/**
 * Versi untuk server component / layout: cukup tahu mati atau tidak, tanpa
 * membentuk respons. Gagal baca = dianggap mati, sejalan dengan `modulMati`.
 */
export async function modulSedangMati(keys: string[], opts?: OpsiSakelar): Promise<boolean> {
  const k = await keadaanModul(keys, opts);
  // `readonly` SENGAJA tidak ikut. Fungsi ini menjawab "haruskah halaman pemeliharaan
  // yang tampil", dan modul beku justru harus tetap bisa dibuka & dicetak — itu
  // seluruh gunanya. Menyamakan keduanya (`!== 'online'`, bentuk lamanya) mengubah
  // pembekuan jadi pemadaman tanpa satu pesan pun.
  return k === 'maintenance' || k === 'gagal';
}

/** Untuk layar: apakah tulisannya sedang dibekukan (lencana BEKU + tombol simpan mati). */
export async function modulDibekukan(keys: string[], opts?: OpsiSakelar): Promise<boolean> {
  return (await keadaanModul(keys, opts)) === 'readonly';
}

// Untuk modul "milik bersama" yang aksesnya bisa diberikan manual lewat users.app_access.
export async function requireAccess(
  check: (role: string, appAccess: string[] | null) => boolean,
): Promise<GuardResult> {
  const session = await getSession();
  if (!session) return unauthorized();
  if (!(await hasAppAccess(session.userId, session.role, check))) return forbidden();
  return { ok: true, session };
}
