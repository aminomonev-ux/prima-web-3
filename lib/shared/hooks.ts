// ─── PRIMA — Shared React Hooks ────────────────────────────────────────────────
// PERF-W2: Replace 8 paginated fetcher duplicates di usulan-client.tsx dengan satu
// hook generic. Lessons learned yang diawetkan di hook:
//   • BUG-W5  : auto-clamp page (kalau row kosong & pg>1, drop ke page valid terakhir)
//   • PERF-W4 : AbortController per cycle (cancel in-flight saat filter/enabled berubah)
//   • BUG-W3  : delegate ke fetchJson, jangan re-implement error handling
//
// API ringkas:
//   const list = usePaginatedList<UsulanHeader>({
//     endpoint: '/api/usulan',
//     params: { scope: 'milik', tahun, status, search },  // undefined/'' di-skip
//     enabled: panel === 'milik',
//     limit: 20,                                          // default 20
//     onError: (msg) => showToast(msg),                   // default: silent
//   });
//   // pakai: list.data, list.loading, list.page, list.totalPages, list.setPage(2), list.refetch()

import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchJson } from './api';

// ─── useAbortableEffect ────────────────────────────────────────────────────────
// O8: wrapper untuk useEffect async yang auto-abort fetch saat dependency change
// atau component unmount. Cegah race condition "stale response overwrite":
// user ganti filter cepat → response lama (fetch #1) datang setelah response
// baru (fetch #2) → overwrite state dengan data lama.
//
// Usage:
//   useAbortableEffect(async (signal) => {
//     const d = await fetchJson('/api/foo', { signal });
//     if (!signal.aborted && d.ok) setData(d.data);
//   }, [tahun, filter]);
//
// fetchJson sudah handle AbortError silent (return ok:false). Check
// `signal.aborted` sebelum setState untuk extra safety (avoid state update
// pada component yang sudah unmount).
export function useAbortableEffect(
  effect: (signal: AbortSignal) => Promise<void> | void,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  deps: any[],
) {
  useEffect(() => {
    const ctrl = new AbortController();
    Promise.resolve(effect(ctrl.signal)).catch(err => {
      // AbortError ter-suppress (expected on cleanup); log error lain.
      if (err instanceof Error && err.name !== 'AbortError') {
        console.error('[useAbortableEffect]', err);
      }
    });
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

export type PaginatedParams = Record<string, string | number | undefined | null>;

export type UsePaginatedListOpts = {
  endpoint: string;
  params: PaginatedParams;
  enabled?: boolean;
  limit?: number;
  onError?: (message: string) => void;
};

export type UsePaginatedListReturn<T> = {
  data: T[];
  page: number;
  total: number;
  totalPages: number;
  loading: boolean;
  refetch: () => Promise<void>;
  setPage: (pg: number) => void;
  // SWR-style: untuk optimistic update tanpa round-trip (mis. drop item setelah delete).
  // Kalau perlu sync `total`, panggil refetch() setelah mutate.
  mutate: (updater: T[] | ((prev: T[]) => T[])) => void;
};

function serializeParams(params: PaginatedParams): string {
  const keys = Object.keys(params).sort();
  const entries: string[] = [];
  for (const k of keys) {
    const v = params[k];
    if (v !== undefined && v !== null && v !== '') entries.push(`${k}=${String(v)}`);
  }
  return entries.join('&');
}

export function usePaginatedList<T>({
  endpoint,
  params,
  enabled = true,
  limit = 20,
  onError,
}: UsePaginatedListOpts): UsePaginatedListReturn<T> {
  const [data, setData] = useState<T[]>([]);
  const [page, setPageState] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(false);

  // paramHash = stable string yang berubah hanya saat content filter berubah.
  // Tanpa hash, params object cycles tiap render → effect terus refire.
  const paramHash = serializeParams(params);

  // Ref pattern: simpan latest values supaya fetchPage tidak perlu recreate tiap render.
  // React 19: update ref di useEffect (bukan render) — cegah rule react-hooks/refs.
  const paramsRef = useRef(params);
  const onErrorRef = useRef(onError);
  useEffect(() => {
    paramsRef.current = params;
    onErrorRef.current = onError;
  });

  const abortRef = useRef<AbortController | null>(null);

  const fetchPage = useCallback(async (pg: number): Promise<void> => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    try {
      const q = new URLSearchParams();
      q.set('page', String(pg));
      q.set('limit', String(limit));
      for (const [k, v] of Object.entries(paramsRef.current)) {
        if (v !== undefined && v !== null && v !== '') q.set(k, String(v));
      }

      const sep = endpoint.includes('?') ? '&' : '?';
      const d = await fetchJson<T[]>(`${endpoint}${sep}${q}`, { signal: controller.signal });

      // Race protection: kalau request ini sudah di-abort (filter berubah mid-flight,
      // unmount, dll), bail out tanpa update state.
      if (controller.signal.aborted) return;

      if (d.ok) {
        const rows = (d.data ?? []) as T[];
        const pag = (d as { pagination?: { total: number; totalPages: number } }).pagination
          ?? { total: 0, totalPages: 0 };
        // BUG-W5 clamp: page lewat batas (delete drop totalPages) → drop ke halaman valid terakhir.
        if (rows.length === 0 && pg > 1 && pag.totalPages > 0) {
          return fetchPage(Math.min(pg - 1, pag.totalPages));
        }
        setData(rows);
        setPageState(pg);
        setTotal(pag.total);
        setTotalPages(pag.totalPages);
      } else if (onErrorRef.current) {
        onErrorRef.current(d.message);
      }
    } finally {
      // Hanya reset loading kalau request belum disuperseded oleh request berikutnya
      // (yang akan ngerset loading sendiri di start-nya).
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [endpoint, limit]);

  const setPage = useCallback((pg: number) => { void fetchPage(pg); }, [fetchPage]);
  const refetch = useCallback(() => fetchPage(1), [fetchPage]);
  const mutate = useCallback((updater: T[] | ((prev: T[]) => T[])) => {
    setData(prev => (typeof updater === 'function' ? (updater as (p: T[]) => T[])(prev) : updater));
  }, []);

  // Auto-fetch saat enabled→true atau params berubah. Match perilaku original
  // (selalu drop ke page 1 saat filter berubah / panel re-enter).
  useEffect(() => {
    if (!enabled) return;
    void fetchPage(1);
    return () => { abortRef.current?.abort(); };
    // paramHash di dep array — string stable, refire hanya saat content berubah.
  }, [enabled, paramHash, fetchPage]);

  return { data, page, total, totalPages, loading, refetch, setPage, mutate };
}
