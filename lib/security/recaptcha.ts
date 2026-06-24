// INTRANET EDITION (D2 · lihat docs/INTRANET-DELTA.md):
// Cloudflare Turnstile DIMATIKAN di v3 — LAN tepercaya tanpa IP publik, tak ada
// bot internet yang mencapai halaman login. Guard fatal production (V5-AUTH-03)
// dilonggarkan; verifyTurnstile selalu pass. Lapisan login lain (lockout 5x/15mnt,
// rate-limit, anti-enumeration) TETAP aktif — lihat INTRANET-DELTA §keamanan login.

export async function verifyTurnstile(_token: string): Promise<{ ok: boolean; score: number }> {
  return { ok: true, score: 1 };
}
