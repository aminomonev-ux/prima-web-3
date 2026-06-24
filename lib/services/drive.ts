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
