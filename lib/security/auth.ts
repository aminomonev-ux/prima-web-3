// ─── PRIMA — Auth Utilities ───────────────────────────────────────────────────
import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import type { SessionPayload } from '@/types';
import { SESSION_DURATION_HOURS, SESSION_INACTIVE_MINUTES, SESSION_ABSOLUTE_LIFETIME_HOURS } from '@/lib/constants';
import { sql } from '@/lib/data/db';

// SEC-C1: NO fallback. Refuse to start if JWT_SECRET is missing/weak.
const _rawSecret = process.env.JWT_SECRET;
if (!_rawSecret || _rawSecret.length < 32) {
  throw new Error(
    '[FATAL] JWT_SECRET env var is required (min 32 chars). ' +
    'Generate with: node -e "console.log(crypto.randomBytes(32).toString(\'base64\'))"'
  );
}
const SECRET = new TextEncoder().encode(_rawSecret);

export const COOKIE_NAME = 'prima_session';

// ─── Create JWT token ─────────────────────────────────────────────────────────
// SEC-W3: `originalIat` (epoch seconds) di-embed untuk enforce absolute
// lifetime. Saat keepalive rotate token, **wajib** teruskan `originalIat`
// lama (jangan generate ulang), sehingga clock absolut tidak ter-reset.
export async function createToken(payload: SessionPayload, sessionId?: string): Promise<string> {
  const nowSec = Math.floor(Date.now() / 1000);
  const originalIat = payload.originalIat && payload.originalIat > 0 ? payload.originalIat : nowSec;
  return new SignJWT({
    ...payload,
    lastActive: Date.now(),
    originalIat,
    ...(sessionId ? { sessionId } : {}),
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION_HOURS}h`)
    .sign(SECRET);
}

// ─── Verify JWT token ─────────────────────────────────────────────────────────
export async function verifyToken(token: string): Promise<SessionPayload | null> {
  try {
    // SEC-W7: pin algorithm to HS256 (prevent alg-confusion)
    const { payload } = await jwtVerify(token, SECRET, { algorithms: ['HS256'] });
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

// ─── Get session dari cookie ──────────────────────────────────────────────────
export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  const payload = await verifyToken(token);
  if (!payload) return null;

  // SEC-C3: enforce session revocation — invalidated session cannot resume
  if (payload.sessionId) {
    try {
      const rows = await sql`
        SELECT 1 FROM user_sessions
        WHERE session_id = ${payload.sessionId} AND invalidated_at IS NULL
        LIMIT 1
      ` as unknown[];
      if (!Array.isArray(rows) || rows.length === 0) {
        cookieStore.delete(COOKIE_NAME);
        return null;
      }
    } catch {
      // DB down — fail-closed: refuse session rather than allow stale JWT
      return null;
    }
  }

  if (payload.lastActive) {
    const idleMs = SESSION_INACTIVE_MINUTES * 60 * 1000;
    if (Date.now() - payload.lastActive > idleMs) {
      cookieStore.delete(COOKIE_NAME);
      return null;
    }
  }

  // SEC-W3: enforce absolute session lifetime. Token lama (sebelum upgrade)
  // tidak punya originalIat → fallback ke `iat` (issued-at) JWT supaya tidak
  // langsung force re-login. Normalize ke payload agar keepalive teruskan
  // nilai fallback sebagai originalIat (tidak reset clock absolut).
  const originalIat = payload.originalIat ?? payload.iat;
  if (originalIat && originalIat > 0) {
    const absoluteMs = SESSION_ABSOLUTE_LIFETIME_HOURS * 60 * 60 * 1000;
    if (Date.now() - originalIat * 1000 > absoluteMs) {
      cookieStore.delete(COOKIE_NAME);
      return null;
    }
    payload.originalIat = originalIat;
  }
  return payload;
}

// ─── Set session cookie (HTTP-only, Secure) ───────────────────────────────────
export async function setSessionCookie(token: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,           // tidak bisa diakses JS (XSS proof)
    secure: process.env.COOKIE_SECURE !== 'false' && process.env.NODE_ENV === 'production', // HTTPS only; set COOKIE_SECURE=false utk intranet HTTP
    sameSite: 'lax',          // CSRF protection
    maxAge: SESSION_DURATION_HOURS * 60 * 60,
    path: '/',
  });
}

// ─── Clear session cookie ─────────────────────────────────────────────────────
export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

// ─── Password hash (bcrypt) ───────────────────────────────────────────────────
import bcrypt from 'bcryptjs';

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12); // cost factor 12 = aman & tidak terlalu lambat
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// ─── Role helpers ─────────────────────────────────────────────────────────────
import { ADMIN_ROLES, BIDANG_ROLES, SUBBIDANG_ROLES } from '@/lib/constants';

export function isAdminRole(role: string): boolean {
  return ADMIN_ROLES.includes(role as typeof ADMIN_ROLES[number]);
}

export function isBidangRole(role: string): boolean {
  return BIDANG_ROLES.includes(role as typeof BIDANG_ROLES[number]);
}

export function isSubBidangRole(role: string): boolean {
  return SUBBIDANG_ROLES.includes(role as typeof SUBBIDANG_ROLES[number]);
}
