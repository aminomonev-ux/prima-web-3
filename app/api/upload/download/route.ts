// SDL-H4 fix: backend proxy untuk download file Drive.
// File Drive di-set PRIVATE (no permissions.create({type:'anyone'})) → URL
// public.drive.com tidak lagi readable cross-user. Stream lewat sini setelah
// verify session.

import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { getSession } from '@/lib/security/auth';
import { sql, queryOne } from '@/lib/data/db';
import { writeAuditLog } from '@/lib/security/auditlog';
import { ADMIN_ROLES, BIDANG_ROLES, BIDANG_TO_SUBBIDANG } from '@/lib/constants';

export const runtime = 'nodejs';

function getDriveClient() {
  const clientId     = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim()     ?? '';
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim() ?? '';
  const refreshToken = process.env.GOOGLE_OAUTH_REFRESH_TOKEN?.trim() ?? '';
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Konfigurasi Google Drive belum lengkap.');
  }
  const oauth2 = new google.auth.OAuth2(clientId, clientSecret, 'https://developers.google.com/oauthplayground');
  oauth2.setCredentials({ refresh_token: refreshToken });
  return google.drive({ version: 'v3', auth: oauth2 });
}

function safeId(raw: string): string | null {
  // Google Drive fileId = alphanumeric + - _ (max ~44 char). Reject anything else.
  return /^[\w-]{20,64}$/.test(raw) ? raw : null;
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });

  const raw = req.nextUrl.searchParams.get('id') ?? '';
  const id  = safeId(raw);
  if (!id) return NextResponse.json({ ok: false, message: 'ID file tidak valid.' }, { status: 400 });

  // L61: authorize per-file, bukan sekadar "sudah login". Boleh unduh kalau uploader
  // sendiri ATAU role elevated (admin/kasubag/kabag/bidang — reviewer usulan org-wide).
  // File legacy (tak ada baris tracking) → fallback akses login (back-compat), tetap di-audit.
  // Resilient: kalau tabel belum di-migrate / query gagal → anggap legacy (null), jangan 500.
  // V5-AUTHZ-01: scoping akses unduh per kebijakan —
  //  · admin tier (SUPER_ADMIN/ADMIN/ADMIN_KASUBAG/ADMIN_KABAG) → semua file
  //  · pemilik (pengunggah) → file sendiri
  //  · BIDANG verifikator → hanya file dari sub-bidang DALAM kelompoknya
  //  · sub-bidang biasa → hanya file miliknya sendiri
  //  · file legacy/tak terlacak (atau lookup gagal) → admin tier saja (fail-closed)
  let owner: { uploaded_by: number | null; uploader_role: string | null; sniff_ok: number | null } | null = null;
  let lookupFailed = false;
  try {
    owner = await queryOne<{ uploaded_by: number | null; uploader_role: string | null; sniff_ok: number | null }>(
      sql`SELECT f.uploaded_by, u.role AS uploader_role, f.sniff_ok
            FROM uploaded_files f
            LEFT JOIN users u ON u.id = f.uploaded_by
           WHERE f.file_id = ${id} LIMIT 1`,
    );
  } catch (e) { lookupFailed = true; console.error('[Download] uploaded_files lookup failed (run migration?)', e); }

  const isAdminTier = (ADMIN_ROLES as readonly string[]).includes(session.role);
  if (!isAdminTier) {
    const deny = async () => {
      await writeAuditLog({ req, eventType: 'FILE_DOWNLOAD_DENIED', userId: session.userId, username: session.username, detail: `Tolak akses file ${id}${owner ? '' : ' (tak terlacak)'}` });
      return NextResponse.json({ ok: false, message: 'Akses ditolak.' }, { status: 403 });
    };
    if (!owner || lookupFailed) return await deny();
    const isOwner = owner.uploaded_by != null && owner.uploaded_by === session.userId;
    let bidangAllowed = false;
    if ((BIDANG_ROLES as readonly string[]).includes(session.role)) {
      const subs = (BIDANG_TO_SUBBIDANG as Record<string, string[]>)[session.role] ?? [];
      bidangAllowed = !!owner.uploader_role && subs.includes(owner.uploader_role);
    }
    if (!isOwner && !bidangAllowed) return await deny();
  }

  try {
    const drive = getDriveClient();
    const meta  = await drive.files.get({ fileId: id, fields: 'id,name,mimeType,size' });
    const name  = meta.data.name  ?? 'file';
    const mime  = meta.data.mimeType ?? 'application/octet-stream';

    await writeAuditLog({ req, eventType: 'FILE_DOWNLOAD', userId: session.userId, username: session.username, detail: `Unduh file ${name} (${id})` });

    const fileRes = await drive.files.get(
      { fileId: id, alt: 'media' },
      { responseType: 'stream' },
    );

    // Convert Node stream → Web ReadableStream untuk Next.js Response
    const nodeStream = fileRes.data as NodeJS.ReadableStream;
    const webStream  = new ReadableStream<Uint8Array>({
      start(controller) {
        nodeStream.on('data', (chunk: Buffer) => controller.enqueue(new Uint8Array(chunk)));
        nodeStream.on('end',  ()       => controller.close());
        nodeStream.on('error', (err: Error) => controller.error(err));
      },
    });

    // Residual SDL-L3: file yang gagal sniff magic-number (sniff_ok=0) jangan
    // di-render inline — paksa download supaya browser tak pernah interpret kontennya.
    const disposition = owner?.sniff_ok === 0 ? 'attachment' : 'inline';

    return new NextResponse(webStream, {
      status: 200,
      headers: {
        'Content-Type':        mime,
        'Content-Disposition': `${disposition}; filename="${encodeURIComponent(name)}"`,
        'Cache-Control':       'private, max-age=60',
        // Prevent browser from sniffing into other content types
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/notFound|404/i.test(msg)) {
      return NextResponse.json({ ok: false, message: 'File tidak ditemukan.' }, { status: 404 });
    }
    console.error('[Upload Download Error]', msg);
    return NextResponse.json({ ok: false, message: 'Gagal mengambil file.' }, { status: 500 });
  }
}
