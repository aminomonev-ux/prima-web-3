# Kebijakan Keamanan

## Melaporkan Kerentanan

Jika Anda menemukan kerentanan keamanan pada PRIMA, **mohon jangan membuka GitHub Issue publik**.

Laporkan secara privat melalui salah satu cara berikut:

- Gunakan fitur **GitHub Security Advisory** (tab **Security → Report a vulnerability**) pada repositori ini, atau
- Hubungi pemilik repositori secara langsung.

Mohon sertakan:

- Deskripsi kerentanan dan dampaknya
- Langkah reproduksi (proof-of-concept jika ada)
- Versi/commit yang terpengaruh

Kami akan berusaha merespons dalam waktu wajar dan akan memberi tahu Anda saat perbaikan dirilis.

## Cakupan

Repositori ini berisi kode aplikasi tanpa kredensial produksi. Laporan yang hanya menunjukkan nilai placeholder pada `.env.example` (mis. test-key Cloudflare Turnstile) bukan kerentanan.

## Praktik Keamanan

- Pipeline CI menjalankan SAST (Semgrep), audit dependensi (npm-audit), pemindaian secret (Gitleaks), serta `tsc` + ESLint pada setiap push/PR.
- Secret tidak pernah di-commit; lihat `.env.example` untuk variabel yang diperlukan.
