// ─── PRIMA — Proxy (Route Protection + CSP) ───────────────────────────────────
// Proxy berjalan di Edge Runtime — TIDAK boleh import bcryptjs/next/headers
// Verifikasi JWT langsung pakai jose (edge-compatible)
import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import type { SessionPayload } from '@/types';

const COOKIE_NAME = 'prima_session';
// SEC-C1: NO fallback. Edge Runtime — module evaluation must fail fast if secret missing.
const _rawSecret = process.env.JWT_SECRET;
if (!_rawSecret || _rawSecret.length < 32) {
  throw new Error('[FATAL] JWT_SECRET env var required (min 32 chars). See docs/audit/AUDIT_ROADMAP.md SEC-C1.');
}
const SECRET = new TextEncoder().encode(_rawSecret);
// SEC-W3: absolute session lifetime — hardcoded di edge (proxy tidak bisa
// import dari lib/constants karena edge runtime). Wajib sama dengan
// SESSION_ABSOLUTE_LIFETIME_HOURS di lib/constants.ts (7 hari).
const SESSION_ABSOLUTE_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

async function verifyToken(token: string): Promise<SessionPayload | null> {
  try {
    // SEC-W7: pin algorithm to HS256
    const { payload } = await jwtVerify(token, SECRET, { algorithms: ['HS256'] });
    const p = payload as unknown as SessionPayload;
    // SEC-W3: defense-in-depth — reject di edge supaya stolen JWT
    // tidak bisa lewat proxy meskipun server component tidak dipanggil.
    const originalIat = p.originalIat ?? p.iat;
    if (originalIat && originalIat > 0 && Date.now() - originalIat * 1000 > SESSION_ABSOLUTE_LIFETIME_MS) {
      return null;
    }
    return p;
  } catch {
    return null;
  }
}

function buildCSP(nonce: string): string {
  const isProd    = process.env.NODE_ENV === 'production';
  // V5-CFG-01: 'unsafe-inline' DIHAPUS dari script-src. Dengan 'strict-dynamic'
  // + nonce, browser modern sudah mengabaikannya; menghapusnya menutup celah di
  // browser lawas (tanpa strict-dynamic) yang menerima inline script.
  // style-src TETAP 'unsafe-inline' (app penuh inline style={{}} — by design).
  const scriptSrc = [
    "'self'",
    `'nonce-${nonce}'`,
    "'strict-dynamic'",
    "https://challenges.cloudflare.com/",
    ...(isProd ? [] : ["'unsafe-eval'"]),
  ].join(' ');
  return [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data: blob:",
    "img-src 'self' data: blob: https:",
    "connect-src 'self' https://challenges.cloudflare.com/",
    "frame-src 'self' blob: https://challenges.cloudflare.com/",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
}

// Routes yang TIDAK butuh auth
const PUBLIC_ROUTES = [
  '/login',
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/forgot-password',
  '/api/auth/reset-password',
  '/api/auth/resend-verification',
  '/api/auth/verify-email',
  '/api/cron/',           // Cron endpoints — auth via Bearer header (CRON_SECRET), bukan cookie session
  '/reset-password',
  '/verify-email',
  '/maintenance',
];

// Routes yang butuh role tertentu
const ROLE_ROUTES: Record<string, string[]> = {
  '/admin':         ['SUPER_ADMIN'],
  '/menu/admin':    ['ADMIN', 'SUPER_ADMIN'],
  '/menu/kasubag':  ['ADMIN_KASUBAG', 'SUPER_ADMIN'],
  '/menu/kabag':    ['ADMIN_KABAG', 'SUPER_ADMIN'],
};

export async function proxy(req: NextRequest) {
  const nonce     = crypto.randomUUID().replace(/-/g, '');
  const csp       = buildCSP(nonce);
  const { pathname } = req.nextUrl;

  const reqHeaders = new Headers(req.headers);
  reqHeaders.set('x-nonce', nonce);

  function nextWithNonce(): NextResponse {
    return NextResponse.next({ request: { headers: reqHeaders } });
  }

  // Izinkan static files & Next.js internals
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname.startsWith('/api/auth/logout')
  ) {
    return NextResponse.next();
  }

  // Izinkan public routes
  if (PUBLIC_ROUTES.some(r => pathname.startsWith(r))) {
    const res = nextWithNonce();
    res.headers.set('Content-Security-Policy', csp);
    return res;
  }

  // Cek session token dari cookie
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  const session = await verifyToken(token);
  if (!session) {
    const response = NextResponse.redirect(new URL('/login', req.url));
    response.cookies.delete(COOKIE_NAME);
    return response;
  }

  // Cek role-based access
  for (const [route, allowedRoles] of Object.entries(ROLE_ROUTES)) {
    if (pathname.startsWith(route)) {
      if (!allowedRoles.includes(session.role)) {
        return NextResponse.redirect(new URL('/menu', req.url));
      }
    }
  }

  // V3-1: set identitas terverifikasi di REQUEST header (bukan response) +
  // strip header klien dulu — cegah spoofing x-user-* untuk privilege escalation/IDOR.
  reqHeaders.delete('x-user-id');
  reqHeaders.delete('x-user-role');
  reqHeaders.delete('x-username');
  reqHeaders.set('x-user-id',   String(session.userId));
  reqHeaders.set('x-user-role', session.role);
  reqHeaders.set('x-username',  session.username);

  const response = nextWithNonce();
  response.headers.set('Content-Security-Policy', csp);
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
