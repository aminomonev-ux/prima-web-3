# Konsep: Akses PRIMA dari luar kantor

Status: **DRAF DISKUSI** (2026-11-26). Belum ada keputusan, belum ada kode.
Asal: diskusi revamp BBA (`docs/konsep/bba/CONCEPT-bba-revamp-alur.md` §5C). PRIMA hanya hidup di laptop kantor, jadi untuk melihat atau mengisi data orang harus datang ke kantor dulu.

---

## 1. Keadaan sekarang (premis yang akan berubah)

PRIMA dirancang sebagai **intranet** (`docs/konsep/sistem/INTRANET-DELTA.md`): LAN kantor, tanpa IP publik, lingkungan tepercaya. Beberapa keputusan keamanan berdiri di atas premis itu:

| Keputusan intranet | Di mana | Kenapa aman di LAN | Yang berubah bila diakses dari luar |
|---|---|---|---|
| Turnstile dimatikan (D2) | `lib/security/recaptcha.ts` | tidak ada bot internet yang sampai ke halaman login | jalur yang menjangkau internet butuh gerbang lain di depan login |
| IP klien = `'unknown'` untuk semua orang | `getClientIp`, `TRUST_PROXY_HEADERS=false` | tanpa proxy, header IP bisa dikarang siapa saja | semua pengguna luar berbagi satu ember rate-limit login; audit tidak tahu dari mana orang masuk |
| Cookie sesi boleh tanpa `Secure` | `COOKIE_SECURE=false` (HTTP di LAN) | lalu lintas tidak keluar gedung | lalu lintas luar WAJIB terenkripsi |
| Server = laptop, mati tiap malam | memori proyek, autostart berlapis | — | akses luar hanya bisa selama laptop menyala |

Pertahanan yang tetap jalan apa pun pilihannya:
- lockout login 5× / 15 menit per akun;
- sesi 60 menit, revokasi;
- izin per modul / per menu;
- sakelar pemeliharaan;
- audit log.

## 2. Pilihan

| | **A. Drive saja** | **B. Tailscale** | **C. Cloudflare Tunnel + Access** | ~~D. Port forwarding~~ |
|---|---|---|---|---|
| Apa | laporan Excel otomatis di Google Drive (BBA §5B, modul lain menyusul) | jaringan pribadi antara laptop kantor dan perangkat yang diizinkan | alamat web publik dengan gerbang login email/OTP Cloudflare di depan PRIMA | buka port router ke laptop |
| Bisa mengisi data? | tidak, lihat saja | ya, aplikasi penuh | ya, aplikasi penuh | — |
| Terbuka ke internet? | tidak | **tidak**: tak ada port dibuka, hanya perangkat terdaftar | ya, tetapi di balik gerbang Access | **ya, telanjang** |
| Yang perlu dipasang | nol (sudah ada Drive terpusat) | aplikasi Tailscale di laptop server + tiap HP/laptop pemakai | `cloudflared` di laptop server + domain di Cloudflare | — |
| Cocok untuk | pimpinan / cek angka | sedikit orang tetap (admin, perencanaan, keuangan) | banyak orang, tanpa memasang apa pun di HP | **tidak dipakai** |
| Premis intranet | utuh | hampir utuh (jaringannya tetap tertutup) | berubah: PRIMA jadi layanan internet | rusak |

**Usulan awal:** A untuk semua yang hanya perlu melihat, ditambah B untuk segelintir orang yang perlu mengisi dari luar. C baru dipertimbangkan bila jumlah pemakai luar banyak dan memasang aplikasi di tiap HP tidak realistis.

## 3. Yang harus disiapkan di PRIMA (bila B atau C dipilih)

1. **HTTPS untuk jalur luar.**
   - B: `tailscale serve` memberi alamat `https://<nama>.<tailnet>.ts.net` bersertifikat.
   - C: TLS dipegang Cloudflare.
   - Jalur LAN boleh tetap HTTP. Perlu dicek bahwa `securityHeaders` (HSTS) tidak membuat peramban memaksa HTTPS di alamat LAN.
2. **Membedakan jalur luar dari LAN** di server, dari `Host` permintaan (alamat `ts.net` / domain tunnel), bukan dari header IP yang bisa dikarang. Satu penolong `jalurAkses(req)` dipakai untuk:
   - **izin akses luar per akun**: grant baru di Pusat Akses ("boleh dari luar kantor"), diperiksa saat login DAN di `getSession`. Akun tanpa grant hanya bisa masuk dari LAN, walaupun perangkatnya ada di tailnet;
   - **audit**: tiap `LOGIN_*` dan aksi tulis mencatat jalurnya (LAN / Tailscale / Tunnel);
   - **sakelar darurat** "tutup akses luar" di Admin Panel (pola sakelar pemeliharaan).
3. **IP klien yang bisa dipercaya.**
   - B: alamat tailnet (100.x) terlihat sebagai alamat sumber TCP. Next tidak membukanya ke handler, jadi butuh Nginx di depan, atau `tailscale serve` yang memasang header.
   - C: `cloudflared` berjalan di laptop yang sama, jadi semua permintaan datang dari 127.0.0.1. IP asli ada di `Cf-Connecting-Ip`.
   - Menyalakan `TRUST_PROXY_HEADERS` sah **hanya** bila port 3000 tertutup dari LAN dan semua orang masuk lewat proxy. Ini syarat dua-duanya yang sudah tertulis di `ratelimit.ts`. Kalau syarat itu tidak terpenuhi, rate-limit per IP tetap `'unknown'` dan perlindungan utama tetap lockout per akun.
4. **C saja:** periksa token Cloudflare Access (`Cf-Access-Jwt-Assertion`) di `proxy.ts` untuk jalur tunnel, sebagai lapisan kedua. Kalau gerbang Access salah setel, PRIMA sendiri yang menolak. Pertimbangkan juga Turnstile hidup lagi khusus jalur tunnel.
5. **Panduan pemasangan** di `docs/panduan/` (memasang, mendaftarkan perangkat, mencabut perangkat yang hilang).

## 4. Pertanyaan untuk dibicarakan

1. Siapa saja yang benar-benar perlu **mengisi** dari luar, dan siapa yang cukup **melihat**? Ini menentukan A saja atau A + B.
2. Perangkat pribadi (HP/laptop rumah) boleh, atau hanya perangkat dinas?
3. Apakah IT / manajemen RS punya kebijakan akses jarak jauh (atau VPN RS sendiri yang bisa dipakai)?
4. Laptop server mati tiap malam. Apakah akses luar dibutuhkan di luar jam kantor? Kalau ya, laptop harus tetap menyala (daya, panas, *keep awake*), atau server dipindah.
5. Biaya: paket gratis Tailscale / Cloudflare Zero Trust punya batas jumlah pengguna. Angka pastinya **belum dicek** dan harus dilihat di situs resminya sebelum memutuskan.

## 5. Yang sengaja di luar konsep ini

- Memindahkan PRIMA ke server/hosting (cloud). Itu keputusan lain dengan dampak jauh lebih besar.
- Aplikasi HP khusus.
- Port forwarding (D), yang ditolak.
