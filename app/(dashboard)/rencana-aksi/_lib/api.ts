import type { RaLevel, RaRow, RaJenis } from './types';

export class VersionConflictError extends Error {
  constructor(message: string) { super(message); this.name = 'VersionConflictError'; }
}

async function jsonOrThrow<T>(r: Response): Promise<T> {
  let body: { ok?: boolean; error?: string; code?: string; [k: string]: unknown } = {};
  try { body = await r.json(); } catch {/* ignore */}
  if (!r.ok || body.ok === false) {
    if (r.status === 409 && body.code === 'VERSION_CONFLICT') {
      throw new VersionConflictError(body.error || 'Data sudah diubah pengguna lain.');
    }
    throw new Error(body.error || `HTTP ${r.status}`);
  }
  return body as unknown as T;
}

export async function apiList(tahun: number, level: RaLevel, signal?: AbortSignal): Promise<RaRow[]> {
  const r = await fetch(`/api/rencana-aksi?tahun=${tahun}&level=${level}`, { cache: 'no-store', signal });
  const body = await jsonOrThrow<{ ok: true; data: RaRow[] }>(r);
  return body.data;
}

/** Fetch SEMUA level (4 level) untuk export gabungan / preview Cetak. Promise.all paralel. */
export async function apiListAll(tahun: number, signal?: AbortSignal): Promise<RaRow[]> {
  const levels: RaLevel[] = ['tujuan', 'sasaran', 'program', 'kegiatan', 'sub-kegiatan'];
  const results = await Promise.all(levels.map(lvl => apiList(tahun, lvl, signal)));
  return results.flat();
}

export interface UpsertPayload {
  id?: number | null;
  tahun: number;
  level: RaLevel;
  sasaran?: string | null;
  tujuan?: string | null;
  outcome_program?: string | null;
  outcome_kegiatan?: string | null;
  outcome_sub_kegiatan?: string | null;
  program: string;
  kegiatan?: string | null;
  sub_kegiatan?: string | null;
  indikator: string;
  jenis: RaJenis;
  satuan: string;
  target_rpjmd: number;
  target_tahunan: number;
  q1_target: number; q2_target: number; q3_target: number; q4_target: number;
  anggaran_nominal?: number | null;
  bulan_target?: number[] | null;
  // L51: wajib diisi saat edit by id — server CAS versi baris.
  expected_version?: number | null;
}

export async function apiUpsert(p: UpsertPayload): Promise<number> {
  const r = await fetch('/api/rencana-aksi', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(p),
  });
  const body = await jsonOrThrow<{ ok: true; id: number }>(r);
  return body.id;
}

export async function apiDelete(id: number): Promise<void> {
  const r = await fetch(`/api/rencana-aksi?id=${id}`, { method: 'DELETE' });
  await jsonOrThrow(r);
}

export async function apiUpdateQuarter(id: number, quarter: 1 | 2 | 3 | 4, target: number, realisasi: number, expected_version: number): Promise<void> {
  const r = await fetch('/api/rencana-aksi', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'quarter', payload: { id, quarter, target, realisasi, expected_version } }),
  });
  await jsonOrThrow(r);
}

export async function apiUpdateBulanRealisasi(id: number, bulan_realisasi: number[], expected_version: number): Promise<void> {
  const r = await fetch('/api/rencana-aksi', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'bulan-realisasi', payload: { id, bulan_realisasi, expected_version } }),
  });
  await jsonOrThrow(r);
}

export async function apiUpdateTargets(id: number, target_rpjmd: number, target_tahunan: number, expected_version: number): Promise<void> {
  const r = await fetch('/api/rencana-aksi', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'targets', payload: { id, target_rpjmd, target_tahunan, expected_version } }),
  });
  await jsonOrThrow(r);
}

export async function apiUpdateJenis(id: number, jenis: RaJenis, expected_version: number): Promise<void> {
  const r = await fetch('/api/rencana-aksi', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'jenis', payload: { id, jenis, expected_version } }),
  });
  await jsonOrThrow(r);
}

export async function apiResetRealisasi(id: number, confirmCode: string, expectedCode: string): Promise<void> {
  const r = await fetch('/api/rencana-aksi', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'reset-realisasi',
      payload: { id, confirm_code: confirmCode, expected_code: expectedCode },
    }),
  });
  await jsonOrThrow(r);
}
