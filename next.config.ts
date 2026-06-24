import type { NextConfig } from "next";

const securityHeaders = [
  { key: 'X-Frame-Options',            value: 'DENY' },
  { key: 'X-Content-Type-Options',     value: 'nosniff' },
  // X-XSS-Protection sengaja dihapus (SDL-M7): header deprecated, CSP per-req nonce di proxy.ts sudah cover.
  { key: 'Referrer-Policy',            value: 'no-referrer' },
  { key: 'Permissions-Policy',         value: 'accelerometer=(), autoplay=(), bluetooth=(), camera=(), clipboard-write=(), display-capture=(), encrypted-media=(), fullscreen=(self), geolocation=(), gyroscope=(), hid=(), idle-detection=(), magnetometer=(), microphone=(), midi=(), payment=(), picture-in-picture=(), publickey-credentials-get=(), screen-wake-lock=(), serial=(), sync-xhr=(), usb=(), web-share=(), xr-spatial-tracking=()' },
  { key: 'Strict-Transport-Security',  value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
  // Content-Security-Policy dikelola di proxy.ts (nonce per-request)
];

const nextConfig: NextConfig = {
  allowedDevOrigins: ['192.168.4.64', 'snarl-wand-dominoes.ngrok-free.dev'],
  async headers() {
    return [{ source: '/(.*)', headers: securityHeaders }];
  },
};

export default nextConfig;
