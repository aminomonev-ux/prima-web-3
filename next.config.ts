import type { NextConfig } from "next";

const securityHeaders = [
  { key: 'X-Frame-Options',            value: 'DENY' },
  { key: 'X-Content-Type-Options',     value: 'nosniff' },
  // X-XSS-Protection sengaja dihapus (SDL-M7): header deprecated, CSP per-req nonce di proxy.ts sudah cover.
  { key: 'Referrer-Policy',            value: 'no-referrer' },
  { key: 'Permissions-Policy',         value: 'accelerometer=(), autoplay=(), bluetooth=(), camera=(), clipboard-write=(), display-capture=(), encrypted-media=(), fullscreen=(self), geolocation=(), gyroscope=(), hid=(), idle-detection=(), magnetometer=(), microphone=(), midi=(), payment=(), picture-in-picture=(), publickey-credentials-get=(), screen-wake-lock=(), serial=(), sync-xhr=(), usb=(), web-share=(), xr-spatial-tracking=()' },
  // Q6 — edisi intranet berjalan di HTTP (COOKIE_SECURE=false), dan peramban
  // MENGABAIKAN HSTS yang datang lewat HTTP. Jadi baris ini hari ini tidak berpengaruh
  // apa pun; ia ditinggalkan untuk pemasangan yang memakai Nginx + HTTPS (§6 PANDUAN).
  //
  // Yang perlu diketahui SEBELUM menyalakan HTTPS: begitu header ini benar-benar
  // sampai lewat HTTPS, peramban staf mengunci diri ke HTTPS untuk domain itu selama
  // dua tahun (`max-age=63072000`) berikut seluruh subdomainnya — dan `preload`
  // meminta dimasukkan ke daftar bawaan peramban, yang jauh lebih sulit ditarik
  // kembali daripada dipasang. Kalau sertifikatnya kedaluwarsa atau HTTPS-nya
  // dimatikan, aplikasinya tidak bisa dibuka sama sekali, bukan turun ke HTTP.
  { key: 'Strict-Transport-Security',  value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
  // Content-Security-Policy dikelola di proxy.ts (nonce per-request)
];

const nextConfig: NextConfig = {
  allowedDevOrigins: ['192.168.4.64', '10.24.100.240'],
  async headers() {
    return [{ source: '/(.*)', headers: securityHeaders }];
  },
};

export default nextConfig;
