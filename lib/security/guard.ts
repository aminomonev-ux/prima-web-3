// ─── PRIMA — Central Route Guard helpers ──────────────────────────────────────
// ATURANNYA WAJIB, HELPERNYA TIDAK (L60/L61): proxy.ts TIDAK menjaga /api/* per role —
// penegakannya ada di TIAP route, dan route baru yang lupa menjaga = lubang akses
// instan. Yang wajib itu penjagaannya; `getSession()` telanjang tidak pernah cukup,
// sebab ia cuma menjawab "sudah login".
//
// Q4 (2026-09-16) — kepala berkas ini dulu berbunyi "STANDAR WAJIB untuk SEMUA route
// API", dan angkanya tidak pernah mendekati itu: 2 route dari 147 memakai ketiga
// helper di bawah. Sisanya memakai penjaga modul (`bludMati` + `bolehEditMenu`,
// `usulanMati`, pabrik `buatGuardModul`, …) yang justru LEBIH ketat — mereka mengenal
// izin per-menu dan sakelar pemeliharaan, dua hal yang tidak diketahui helper di sini.
// Jadi yang keliru kalimatnya, bukan 145 route itu. Dokumen yang menjanjikan
// keseragaman yang tidak ada membuat pembacanya mengira sedang melihat 145
// pelanggaran, lalu berhenti memercayai kepala berkas berikutnya.
//
// Dipakai untuk modul yang penjagaannya memang sesederhana peran + `app_access`:
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
import { keadaanTerburuk, kunciDenganGlobal, type KeadaanSakelar } from '@/lib/registry/apps';
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

/**
 * P12 — sakelar global disisipkan DI SINI, satu tempat, bukan di tiap pemanggil.
 *
 * Keempat pintu (`modulMati`, `keadaanModul`, `modulSedangMati`, `modulDibekukan`)
 * lewat fungsi ini, jadi menambahkannya sekali membuat kesembilan modul ikut — termasuk
 * modul yang lahir besok. Menyuruh tiap pemanggil mengingat kunci global adalah bentuk
 * T-1/L69 yang persis: ia akan berlaku di modul yang kebetulan diingat.
 *
 * Admin Panel tidak ikut mati, dan bukan karena dikecualikan di sini — `admin` memang
 * tidak punya `sakelar` di registry, jadi tak satu pun route `app/api/admin/*` memanggil
 * fungsi ini. Pengecualian struktural lebih kuat daripada daftar perkecualian yang harus
 * dipelihara; uji Tahap 12 menjaganya tetap begitu.
 */
async function bacaKeadaan(keys: string[]): Promise<KeadaanModul> {
  try {
    const semua = kunciDenganGlobal(keys);
    const rows = await sql`SELECT \`key\`, value FROM app_config WHERE \`key\` IN (${semua})`;
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

/**
 * T3 — kalimatnya diisi ke TIGA laci, bukan satu. Klien PRIMA membaca galat dari laci
 * yang berbeda-beda: `message` (fetchJson, PK, Kinerja, BBA, Usulan, IKI), `error`
 * (BLUD, Renaksi), `msg` (LKJIP — `app-guard.ts` sengaja mempertahankannya). Balasan
 * ini keluar dari penjaga yang dipakai SEMUA modul, jadi dulu hanya berisi `error` dan
 * kalimat pemeliharaan cuma sampai ke BLUD & Renaksi; sisanya menampilkan
 * "HTTP 503 Service Unavailable" atau pesan cadangan. Menambah laci tidak mengubah
 * laci yang sudah dibaca, jadi tak satu klien pun perlu disentuh.
 */
const balasSakelar = (code: 'MODUL_MATI' | 'MODUL_BACA_SAJA', pesan: string) =>
  NextResponse.json({ ok: false, code, error: pesan, message: pesan, msg: pesan }, { status: 503 });

const tolakMati = (pesan: string) => balasSakelar('MODUL_MATI', pesan);

/**
 * 503 dan kode SENDIRI (`MODUL_BACA_SAJA`), terpisah dari `MODUL_MATI`. Penerimanya
 * harus bisa membedakan "sedang dibekukan, membaca tetap boleh" dari "modul mati" —
 * alasan yang sama persis dengan kenapa `modulMati` memulangkan 503 dan bukan 403.
 */
const tolakBeku = () =>
  balasSakelar(
    'MODUL_BACA_SAJA',
    'Modul ini sedang dalam mode hanya baca. Anda tetap bisa membuka dan mencetak, tapi belum bisa menyimpan.',
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
    return tolakMati('Modul ini sedang dalam pemeliharaan. Silakan coba lagi nanti.');
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
