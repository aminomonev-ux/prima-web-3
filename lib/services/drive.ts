// ═══ PRIMA — Google Drive helper (shared) ═════════════════════════
// OAuth2 (refresh-token) → Drive v3. Pola sama dengan app/api/upload/route.ts.
// Dipakai: arsip docx LKJIP ke folder Drive (best-effort).
import { google } from 'googleapis';
import { PassThrough } from 'stream';

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

/** Upload buffer ke folder Drive. Return id + nama file. */
export async function uploadBufferToDrive(opts: {
  buffer: Buffer; name: string; mimeType: string; folderId: string;
}): Promise<{ fileId: string; name: string }> {
  const drive = getDriveClient();
  const stream = new PassThrough();
  stream.end(opts.buffer);
  const res = await drive.files.create({
    requestBody: { name: opts.name, parents: [opts.folderId] },
    media:       { mimeType: opts.mimeType, body: stream },
    fields:      'id,name',
  });
  return { fileId: res.data.id ?? '', name: res.data.name ?? opts.name };
}
