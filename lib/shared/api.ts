// ─── PRIMA — API Fetch Helper ──────────────────────────────────────────────────
// BUG-W3: Wrap `fetch + res.json` ke satu helper yang aman terhadap:
//   1. HTTP error (res.ok = false) — return ApiResult.ok=false dengan message dari body
//   2. Network error (offline, DNS, abort) — return ApiResult.ok=false dengan pesan generic
//   3. JSON parse error (server return HTML 5xx) — return ApiResult.ok=false
//   4. Content-Type header auto kalau body string
//
// Caller cukup: const d = await fetchJson(url, init); if (!d.ok) showToast(d.message);
// Tidak perlu try/catch + res.ok check + .json() throw — semua sudah di-handle.

export type ApiResult<T = unknown> =
  | { ok: true; data?: T; message?: string; [k: string]: unknown }
  | { ok: false; message: string; status?: number };

export async function fetchJson<T = unknown>(
  url: string,
  init?: RequestInit,
): Promise<ApiResult<T>> {
  // Auto-add Content-Type kalau body string dan caller belum set
  let finalInit: RequestInit | undefined = init;
  if (init?.body && typeof init.body === 'string') {
    const headers = new Headers(init.headers);
    if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    finalInit = { ...init, headers };
  }

  let res: Response;
  try {
    res = await fetch(url, finalInit);
  } catch {
    // Network error: offline, DNS fail, CORS, abort
    return { ok: false, message: 'Gagal terhubung. Cek koneksi internet.' };
  }

  if (!res.ok) {
    // HTTP error — coba parse body JSON untuk message yang lebih spesifik
    try {
      const body = await res.json() as Record<string, unknown>;
      const msg = (body.message as string) || `HTTP ${res.status} ${res.statusText}`.trim();
      return { ok: false, message: msg, status: res.status };
    } catch {
      // Body bukan JSON (mis. HTML error page) → fallback ke status
      return {
        ok: false,
        message: res.status >= 500
          ? `Server bermasalah (${res.status}). Coba lagi beberapa saat.`
          : `Permintaan ditolak (${res.status}).`,
        status: res.status,
      };
    }
  }

  // Success path — parse body
  try {
    const body = await res.json();
    return body as ApiResult<T>;
  } catch {
    return { ok: false, message: 'Response server bukan JSON valid.' };
  }
}
