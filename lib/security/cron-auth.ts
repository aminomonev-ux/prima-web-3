// V4K-1 (K7): verifikasi Bearer CRON_SECRET secara constant-time.
// Sebelumnya tiap cron route pakai `authHeader !== \`Bearer ${secret}\`` (string
// compare non-constant-time → timing side-channel). Pusatkan di sini.
import crypto from 'crypto';

function timingSafeEqualStr(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) {
    crypto.timingSafeEqual(ab, ab); // jaga timing tetap konstan sebelum gagal
    return false;
  }
  return crypto.timingSafeEqual(ab, bb);
}

type CronAuthResult = { ok: true } | { ok: false; status: number; message: string };

/** Verifikasi header `Authorization: Bearer <CRON_SECRET>` (min 32 char). */
export function verifyCronSecret(authHeader: string | null): CronAuthResult {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 32) {
    return { ok: false, status: 500, message: 'CRON_SECRET tidak dikonfigurasi (min 32 chars).' };
  }
  if (!authHeader || !timingSafeEqualStr(authHeader, `Bearer ${secret}`)) {
    return { ok: false, status: 401, message: 'Unauthorized' };
  }
  return { ok: true };
}
