import { Ratelimit } from '@upstash/ratelimit';
import { Redis as UpstashRedis } from '@upstash/redis';
import IORedis from 'ioredis';

// Backend dipilih SEKALI saat start dari env (bukan 2 Redis nyala bareng):
//  · UPSTASH_REDIS_REST_URL terisi → Upstash (cloud, dev/laptop)
//  · selain itu REDIS_URL terisi   → Redis lokal via ioredis (server kantor, tanpa kuota)
//  · dua-duanya kosong             → fail-open (rate-limit non-aktif, app tetap jalan)
type Backend = 'upstash' | 'local' | 'none';
const backend: Backend =
  process.env.UPSTASH_REDIS_REST_URL ? 'upstash'
  : process.env.REDIS_URL            ? 'local'
  : 'none';

// ── Upstash (cloud) ──────────────────────────────────────────────
let upstash: UpstashRedis | null = null;
const limiters = new Map<string, Ratelimit>();
function getUpstashLimiter(maxRequests: number, windowSeconds: number): Ratelimit {
  if (!upstash) {
    upstash = new UpstashRedis({
      url:   process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    });
  }
  const key = `${maxRequests}:${windowSeconds}`;
  if (!limiters.has(key)) {
    limiters.set(key, new Ratelimit({
      redis:   upstash,
      limiter: Ratelimit.slidingWindow(maxRequests, `${windowSeconds} s`),
      prefix:  'prima_rl',
    }));
  }
  return limiters.get(key)!;
}

// ── Redis lokal (server kantor) ──────────────────────────────────
// Fixed-window via INCR+EXPIRE (1-2 perintah). Lazy-init: koneksi baru dibuat
// saat panggilan pertama, jadi laptop tanpa REDIS_URL tak pernah konek.
let local: IORedis | null = null;
function getLocal(): IORedis {
  if (!local) {
    local = new IORedis(process.env.REDIS_URL!, {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    });
    local.on('error', () => {}); // swallow — checkRateLimit fail-open menangani down/error
  }
  return local;
}

async function localLimit(key: string, maxRequests: number, windowSeconds: number) {
  const redis  = getLocal();
  const nowSec = Math.floor(Date.now() / 1000);
  const bucket = Math.floor(nowSec / windowSeconds);
  const rkey   = `prima_rl:${key}:${bucket}`;
  const count  = await redis.incr(rkey);
  if (count === 1) await redis.expire(rkey, windowSeconds);
  const resetIn = (bucket + 1) * windowSeconds - nowSec;
  return {
    allowed:   count <= maxRequests,
    remaining: Math.max(0, maxRequests - count),
    resetIn:   Math.max(1, resetIn),
  };
}

// K10-2: fail-open WAJIB bersinyal — saat backend down/quota habis, rate-limit
// diam-diam mati (login throttle, lockout, email cap semua hilang tanpa jejak).
// Pakai console.warn ber-throttle (1×/menit) supaya muncul di log PM2 tanpa spam.
// TIDAK pakai writeAuditLog di sini: auditlog.ts sudah import getClientIp dari
// file ini → circular import. Surfacing via server log sudah cukup untuk ops.
let _lastRlWarn = 0;
function warnDegraded(reason: string): void {
  const now = Date.now();
  if (now - _lastRlWarn < 60_000) return;
  _lastRlWarn = now;
  console.warn(`[RateLimit] DEGRADED (${reason}) — fallback limiter in-memory per-proses aktif. Cek backend Upstash/Redis.`);
}

// V5-AUTH-04: fallback fixed-window IN-MEMORY (per-proses) menggantikan fail-open
// total. Saat backend Redis none/down, throttle tetap berlaku (proteksi minimal)
// alih-alih mengizinkan semua request. Catatan: counter per-proses → di mode PM2
// cluster (N proses) limit efektif ≈ N×max; tetap jauh lebih aman dari fail-open.
const _memBuckets = new Map<string, { count: number; resetAt: number }>();
function memLimit(key: string, maxRequests: number, windowSeconds: number) {
  const now   = Date.now();
  const winMs = windowSeconds * 1000;
  if (_memBuckets.size > 5000) {
    for (const [k, v] of _memBuckets) if (v.resetAt <= now) _memBuckets.delete(k);
  }
  let b = _memBuckets.get(key);
  if (!b || b.resetAt <= now) { b = { count: 0, resetAt: now + winMs }; _memBuckets.set(key, b); }
  b.count++;
  return {
    allowed:   b.count <= maxRequests,
    remaining: Math.max(0, maxRequests - b.count),
    resetIn:   Math.max(1, Math.ceil((b.resetAt - now) / 1000)),
  };
}

export async function checkRateLimit(
  key: string,
  maxRequests: number,
  windowSeconds: number,
): Promise<{ allowed: boolean; remaining: number; resetIn: number }> {
  try {
    if (backend === 'upstash') {
      const { success, remaining, reset } = await getUpstashLimiter(maxRequests, windowSeconds).limit(key);
      return { allowed: success, remaining, resetIn: Math.max(0, Math.ceil((reset - Date.now()) / 1000)) };
    }
    if (backend === 'local') {
      return await localLimit(key, maxRequests, windowSeconds);
    }
    warnDegraded('tidak ada backend rate-limit dikonfigurasi (UPSTASH/REDIS_URL kosong)');
    return memLimit(key, maxRequests, windowSeconds); // none: fallback in-memory (bukan fail-open)
  } catch (e) {
    warnDegraded(`backend error: ${String(e).slice(0, 120)}`);
    return memLimit(key, maxRequests, windowSeconds); // backend down: fallback in-memory (bukan fail-open)
  }
}

// SEC-W6: Leftmost X-Forwarded-For dapat di-spoof attacker (client-set header
// di-append oleh proxy). Vercel set `x-real-ip` ke IP TCP source (tidak spoofable
// dari client). Fallback ke RIGHTMOST entry XFF (entry yang ditambahkan oleh
// proxy terdekat, bukan client). Tidak pakai `request.ip` karena dihapus di
// Next.js 15+.
export function getClientIp(req: Request): string {
  const realIp = (req.headers as Headers).get('x-real-ip');
  if (realIp && realIp.trim()) return realIp.trim();
  const xff = (req.headers as Headers).get('x-forwarded-for');
  if (xff) {
    const parts = xff.split(',').map(s => s.trim()).filter(Boolean);
    if (parts.length) return parts[parts.length - 1]; // rightmost = trusted-by-proxy
  }
  return 'unknown';
}
