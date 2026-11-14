// ═══ PRIMA — Google Drive: SATU-SATUNYA pembuat klien Drive di app/ & lib/ ═══
// Konsep: docs/CONCEPT-drive-terpusat.md §6.1. Satu pengecualian yang disengaja:
// `scripts/backup-db.js` (CommonJS, jalan di luar Next) punya klien sendiri.
import { google } from 'googleapis';
import { PassThrough } from 'stream';

/** Panggilan Drive tanpa batas waktu bisa menggantung selamanya (googleapis tidak membatasi). */
export const BATAS_WAKTU_DRIVE_MS = 30_000;

/** Build Drive v3 client dari env OAuth. Throw kalau env belum lengkap. */
export function getDriveClient() {
  const clientId     = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim()     ?? '';
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim() ?? '';
  const refreshToken = process.env.GOOGLE_OAUTH_REFRESH_TOKEN?.trim() ?? '';
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Konfigurasi Google Drive belum lengkap di .env.local (CLIENT_ID / CLIENT_SECRET / REFRESH_TOKEN).');
  }
  const oauth2 = new google.auth.OAuth2(clientId, clientSecret, 'https://developers.google.com/oauthplayground');
  oauth2.setCredentials({ refresh_token: refreshToken });
  return google.drive({ version: 'v3', auth: oauth2 });
}

/**
 * Kode HTTP dari galat Google API (GaxiosError), atau null. Jangan mencocokkan pesannya:
 * berkas yang tidak ada berbunyi "File not found: <id>.", alasan `notFound` hanya ada di
 * `errors[]` — pencocokan `/notFound|404/` atas pesan dulu membuatnya jadi 500.
 */
export function kodeGalatDrive(err: unknown): number | null {
  if (!err || typeof err !== 'object') return null;
  const e = err as { status?: unknown; code?: unknown; response?: { status?: unknown } };
  for (const v of [e.response?.status, e.status, e.code]) {
    const n = Number(v);
    if (Number.isInteger(n) && n >= 400 && n < 600) return n;
  }
  return null;
}

export type JenisGalatDrive = 'quota' | 'permission' | 'notfound' | 'token' | 'jaringan' | 'lain';

function alasanGalat(err: unknown): string[] {
  const e = err as { errors?: { reason?: unknown }[]; response?: { data?: { error?: unknown; error_description?: unknown } } };
  const dariErrors = (Array.isArray(e?.errors) ? e.errors : []).map((x) => String(x?.reason ?? ''));
  const data = e?.response?.data;
  return [...dariErrors, String(data?.error ?? '')].filter(Boolean);
}

/**
 * Golongan galat untuk kalimat operator. `kodeGalatDrive` tetap memulangkan kode HTTP
 * (dipakai pembanding 404 di route unduh) — fungsi ini di atasnya, bukan penggantinya.
 */
export function jenisGalatDrive(err: unknown): JenisGalatDrive {
  const alasan = alasanGalat(err);
  if (alasan.includes('invalid_grant') || alasan.includes('unauthorized_client')) return 'token';
  const kode = kodeGalatDrive(err);
  if (kode === 401) return 'token';
  if (kode === 403) return alasan.includes('storageQuotaExceeded') || alasan.includes('quotaExceeded') ? 'quota' : 'permission';
  if (kode === 404) return 'notfound';
  if (kode === null) {
    const c = String((err as { code?: unknown })?.code ?? '');
    if (/^(ENOTFOUND|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|ECONNABORTED)$/.test(c)) return 'jaringan';
  }
  return 'lain';
}

/** Upload buffer ke folder Drive. `size` dari Drive (null bila tak dilaporkan). */
export async function uploadBufferToDrive(opts: {
  buffer: Buffer; name: string; mimeType: string; folderId: string;
}): Promise<{ fileId: string; name: string; size: number | null }> {
  const drive = getDriveClient();
  const stream = new PassThrough();
  stream.end(opts.buffer);
  const res = await drive.files.create({
    requestBody: { name: opts.name, parents: [opts.folderId] },
    media:       { mimeType: opts.mimeType, body: stream },
    fields:      'id,name,size',
  });
  const size = res.data.size == null ? null : Number(res.data.size);
  return { fileId: res.data.id ?? '', name: res.data.name ?? opts.name, size: Number.isFinite(size) ? size : null };
}

const MIME_FOLDER = 'application/vnd.google-apps.folder';

/** Nama di dalam kueri Drive: kutip tunggal & garis miring terbalik wajib di-escape. */
export function kutipKueriDrive(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

/**
 * Folder bernama `nama` di dalam `induk` — dicari dulu, dibuat bila tidak ada. Lebih dari
 * satu (dibuat dua proses bersamaan, atau salah operator) → yang TERTUA, supaya semua
 * pemanggil berikutnya sepakat pada folder yang sama.
 *
 * Token `drive.file` hanya melihat folder buatan aplikasi ini sendiri: subfolder buatan
 * tangan dengan nama sama tidak ditemukan dan folder kedua dibuat (konsep §7.3).
 */
export async function cariAtauBuatFolder(induk: string, nama: string): Promise<{ id: string; dibuat: boolean }> {
  const drive = getDriveClient();
  const ada = await drive.files.list({
    q: `'${kutipKueriDrive(induk)}' in parents and mimeType = '${MIME_FOLDER}' and name = '${kutipKueriDrive(nama)}' and trashed = false`,
    orderBy: 'createdTime',
    pageSize: 10,
    fields: 'files(id,name)',
  }, { timeout: BATAS_WAKTU_DRIVE_MS });
  const pertama = ada.data.files?.[0]?.id;
  if (pertama) {
    if ((ada.data.files?.length ?? 0) > 1) console.warn(`[drive] folder "${nama}" kembar di induk ${induk} — dipakai yang tertua (${pertama}).`);
    return { id: pertama, dibuat: false };
  }
  const baru = await drive.files.create({
    requestBody: { name: nama, mimeType: MIME_FOLDER, parents: [induk] },
    fields: 'id',
  }, { timeout: BATAS_WAKTU_DRIVE_MS });
  if (!baru.data.id) throw new Error(`Drive tidak mengembalikan id folder "${nama}".`);
  return { id: baru.data.id, dibuat: true };
}
