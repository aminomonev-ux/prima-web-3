



import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { PassThrough } from 'stream';
import { getSession } from '@/lib/security/auth';
import { checkRateLimit, getClientIp } from '@/lib/security/ratelimit';
import { writeAuditLog } from '@/lib/security/auditlog';
import { sql } from '@/lib/data/db';

export const runtime = 'nodejs';

const UPLOAD_RL_REQUESTS = 20;
const UPLOAD_RL_WINDOW   = 60;

const ALLOWED_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
];
const MAX_SIZE = 10 * 1024 * 1024;

// V5-FEAT-01: ekstensi → MIME yang diizinkan. Tutup celah saat magic-number tak
// ter-sniff (text/HTML) — declared file.type dipalsukan ke nilai allow-list.
const EXT_MIME: Record<string, readonly string[]> = {
  pdf:  ['application/pdf'],
  doc:  ['application/msword'],
  docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  xls:  ['application/vnd.ms-excel'],
  xlsx: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  jpg:  ['image/jpeg'], jpeg: ['image/jpeg'],
  png:  ['image/png'], gif: ['image/gif'], webp: ['image/webp'],
};

// SDL-L3: magic-number validation. file-type ESM-only → dynamic import lazy.
async function sniffMime(buf: Buffer): Promise<string | null> {
  const mod = await import('file-type');
  const result = await mod.fileTypeFromBuffer(buf);
  return result?.mime ?? null;
}

function sanitizeFilename(raw: string): string {
  return (raw
    .replace(/[^\w.\-\s]/g, '_')
    .replace(/\.{2,}/g, '.')
    .replace(/^\./, '_')
    .slice(0, 200)
    .trim()) || 'upload';
}

function getDriveClient() {
  const clientId     = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim()     ?? '';
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim() ?? '';
  const refreshToken = process.env.GOOGLE_OAUTH_REFRESH_TOKEN?.trim() ?? '';

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Konfigurasi Google Drive belum lengkap di .env.local (CLIENT_ID / CLIENT_SECRET / REFRESH_TOKEN).');
  }

  const oauth2 = new google.auth.OAuth2(
    clientId,
    clientSecret,
    'https://developers.google.com/oauthplayground'
  );
  oauth2.setCredentials({ refresh_token: refreshToken });
  return google.drive({ version: 'v3', auth: oauth2 });
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });

    const ip = getClientIp(req);
    const rl = await checkRateLimit(`upload:${ip}`, UPLOAD_RL_REQUESTS, UPLOAD_RL_WINDOW);
    if (!rl.allowed) {
      return NextResponse.json(
        { ok: false, message: `Terlalu banyak upload. Coba lagi dalam ${rl.resetIn} detik.` },
        { status: 429, headers: { 'Retry-After': String(rl.resetIn) } }
      );
    }

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) return NextResponse.json({ ok: false, message: 'Tidak ada file yang dipilih.' }, { status: 400 });
    if (file.size > MAX_SIZE)
      return NextResponse.json({ ok: false, message: 'Ukuran file melebihi 10MB.' }, { status: 400 });
    if (!ALLOWED_TYPES.includes(file.type))
      return NextResponse.json({ ok: false, message: 'Tipe file tidak diizinkan.' }, { status: 400 });

    // V5-FEAT-01: ekstensi nama file WAJIB cocok dengan declared MIME.
    const ext = (file.name.split('.').pop() ?? '').toLowerCase();
    if (!EXT_MIME[ext] || !EXT_MIME[ext].includes(file.type))
      return NextResponse.json({ ok: false, message: 'Ekstensi file tidak cocok dengan tipe kontennya.' }, { status: 400 });

    const bytes = await file.arrayBuffer();
    const buf   = Buffer.from(bytes);

    // SDL-L3: magic-number check selain client-set file.type. Tolak kalau:
    //   - magic-number bisa di-sniff tapi tidak match ALLOWED_TYPES, atau
    //   - sniff gagal (plain text/CSV ok-listed via MIME = `image/png` palsu).
    const sniffed = await sniffMime(buf);
    if (sniffed && !ALLOWED_TYPES.includes(sniffed)) {
      return NextResponse.json({ ok: false, message: 'Konten file tidak cocok dengan ekstensi (magic-number mismatch).' }, { status: 400 });
    }
    // Kalau `sniffed === null` declared file.type (sudah lolos ALLOWED_TYPES) diterima,
    // tapi ditandai sniff_ok=0 → /api/upload/download serve attachment, bukan inline.
    const sniffOk = sniffed !== null;

    const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID?.trim();
    if (!folderId) throw new Error('GOOGLE_DRIVE_FOLDER_ID belum dikonfigurasi di .env');
    const drive = getDriveClient();

    const stream = new PassThrough();
    stream.end(buf);

    const uploaded = await drive.files.create({
      requestBody: { name: sanitizeFilename(file.name), parents: [folderId] },
      media:       { mimeType: file.type, body: stream },
      fields:      'id,name',
    });

    const fileId      = uploaded.data.id!;
    // L61: catat pemilik file → /api/upload/download bisa authorize per-file
    // (uploader atau role elevated), bukan sekadar "sudah login". Silent-fail
    // (jangan gagalkan upload kalau insert tracking error).
    const context = (formData.get('context') as string | null)?.slice(0, 40) || null;
    try {
      await sql`INSERT INTO uploaded_files (file_id, uploaded_by, context, sniff_ok) VALUES (${fileId}, ${session.userId}, ${context}, ${sniffOk ? 1 : 0})`;
    } catch (e) { console.error('[Upload] tracking insert failed', e); }
    // SDL-H4: file Drive SENGAJA tidak di-set public. Akses lewat proxy
    // /api/upload/download?id=<fileId> yang verify session sebelum stream.
    // Kompatibilitas: `url` field tetap diisi dengan proxy URL agar consumer
    // existing yang simpan ke `file_url` kolom DB langsung migrate ke flow aman.
    const downloadUrl = `/api/upload/download?id=${fileId}`;

    await writeAuditLog({ req, eventType: 'FILE_UPLOAD', userId: session.userId, username: session.username, detail: `Upload: ${sanitizeFilename(file.name)} (${(file.size/1024).toFixed(0)}KB)` });
    return NextResponse.json({ ok: true, url: downloadUrl, fileId, filename: sanitizeFilename(file.name) });

  } catch (error) {
    console.error('[Upload Error]', error);
    return NextResponse.json({ ok: false, message: 'Gagal mengupload file.' }, { status: 500 });
  }
}
