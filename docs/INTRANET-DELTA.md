# INTRANET-DELTA — perbedaan `prima-web-3` vs `prima-web`

> Repo ini adalah **fork intranet** dari `prima-web` (remote `upstream`). Dokumen ini mencatat SEMUA delta yang sengaja diterapkan, supaya saat sync bug-fix dari `upstream` (`git fetch upstream` + cherry-pick) jelas bagian mana yang harus dipertahankan dan tidak ketimpa.
>
> Blueprint lengkap: `docs/session/intranet/CONCEPT-prima-web-3.md`
> Status keseluruhan: **SELESAI — D1–D12 diterapkan & CI hijau** (tsc/ESLint/Semgrep/npm-audit/gitleaks).

## Remote
```
origin → https://github.com/aminomonev-ux/prima-web-3.git   (repo PUBLIC ini · branch default: main)
```
Hanya ada `origin`. Remote ke repo privat sengaja **tidak disimpan** (cegah pull/merge tak sengaja membocorkan dokumen internal). Sync bug-fix dari privat dilakukan **manual & selektif** (cherry-pick file kode saja, jangan merge/pull penuh) dengan mempertahankan delta di bawah.

## Premis
LAN kantor, tanpa IP publik, lingkungan tepercaya. Outbound internet TERSEDIA (via NAT) — mematikan email & Turnstile adalah **pilihan desain** (intranet mandiri), bukan keterpaksaan teknis.

---

## Delta yang diterapkan

| # | Area | Perubahan | File | Status |
|---|---|---|---|---|
| D1 | Email | `sendEmail` → no-op aman (log `SKIPPED_NO_PROVIDER`) saat provider `None` | `lib/services/email.ts` | ✅ DONE |
| D2 | Turnstile | Guard fatal prod dibuang; `verifyTurnstile` selalu pass | `lib/security/recaptcha.ts` | ✅ DONE |
| D3 | Login UI | Rewrite login-only: lepas Turnstile + view signup/forgot/resend; tombol "Hubungi Super Admin" | `app/(auth)/login/page.tsx` | ✅ DONE |
| D4 | Promotion UI | Lepas widget Turnstile; `turnstileToken` placeholder konstan (schema utuh, D2 no-op) | `components/promotion/PromotionRequestModal.tsx` | ✅ DONE |
| D5 | Registrasi | Endpoint register → 410 Gone (registrasi publik mati) | `app/api/auth/register/route.ts` | ✅ DONE |
| D6 | Verifikasi email | verify-email & resend-verification → 410 Gone | `app/api/auth/verify-email`, `resend-verification` | ✅ DONE |
| D7 | Reset password | forgot-password & reset-password (consumer) → 410 Gone | `app/api/auth/forgot-password`, `reset-password` | ✅ DONE |
| D8 | Halaman auth | reset-password & verify-email page → server redirect ke `/login` | `app/(auth)/reset-password`, `app/verify-email` | ✅ DONE |
| D9 | Create-user admin | Endpoint POST `admin/users` (SUPER_ADMIN): buat akun AKTIF+verified, enforce kuota via `assertQuotaAvailable` + Zod `AdminUserCreateBodySchema` | `app/api/admin/users/route.ts`, `lib/data/admin-schemas.ts` | ✅ DONE |
| D10 | Admin Panel UI | Form modal "Tambah User" (POST create, role+kuota inline) di panel User Management; Reset Password sudah ada | `app/(dashboard)/admin/admin-client.tsx` | ✅ DONE |
| D11 | Env | `.env.example` versi LAN (hapus GMAIL/TURNSTILE/UPSTASH; tambah REDIS_URL) | `.env.example` | ✅ DONE |
| D12 | Rate-limit | Pakai Redis lokal (`REDIS_URL`), bukan Upstash — nol perubahan kode | `lib/security/ratelimit.ts` | ✅ by-config |

## Yang TIDAK diubah (tetap identik dengan upstream)
- Google Drive: `lib/services/drive.ts`, `app/api/upload/*`, `app/api/lkjip/[id]/versi` (dipertahankan, butuh outbound)
- Auth inti: `lib/security/auth.ts`, `app/api/auth/login`, `app/api/auth/change-password`
- Seluruh modul bisnis (Usulan/BLUD/Kinerja/PK/BBA/LKJIP/Dashboard/Rima)
- Schema MySQL (`docs/schema-mysql.sql`)

---

## Audit findings yang sengaja dinonaktifkan (justifikasi)

| Finding | Status di fork | Justifikasi |
|---|---|---|
| V5-AUTH-03 (guard fatal Turnstile prod) | Dinonaktifkan | LAN tepercaya, CAPTCHA tak relevan |
| V3-2 (register anti-enumeration) | Tak berlaku | Registrasi publik dimatikan |
| SDL-M18 (hash verify_token at-rest) | Tak berlaku | Verifikasi email dihapus |
| SEC-C5 (hash reset_token at-rest) | Tak berlaku | Reset password via email dihapus |

## Audit findings yang WAJIB tetap (jangan ikut dilonggarkan)
SEC-C1 (JWT throw kalau env kosong) · V3-5 (lockout login atomik) · V3-4 (kuota `FOR UPDATE` — **diimplementasikan** di create-user admin POST + PATCH ubah-role via `assertQuotaAvailableTx` dalam `withTransaction`, lihat `lib/security/promotion.ts`) · SEC-W1 (anti-enumeration login) · L55 (counter atomik).

## Hardening tambahan (audit fork, 2026-06-27)
- **L-1**: kuota create-user & ubah-role kini transaksional (`COUNT … FOR UPDATE`) — anti-race lewati cap. UNIQUE(username/email) = backstop.
- **L-2**: endpoint `POST /api/admin/users` (create-user) diberi rate-limit (`admin-create:<uid>:<ip>`).
- **CSP**: origin `challenges.cloudflare.com` dibuang dari `script/connect/frame-src` di `proxy.ts` (Turnstile mati → izin mati).
- **Doc**: wording "fail-open" diselaraskan → fallback throttle in-memory per-proses (V5-AUTH-04) di README/.env.example/ratelimit.ts.
