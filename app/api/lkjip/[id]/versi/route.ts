import { NextRequest, NextResponse } from 'next/server';
import { safeInt } from '@/lib/data/db';
import { writeAuditLog } from '@/lib/security/auditlog';
import { VersiSaveSchema, lkjipRateLimit } from '@/lib/lkjip/schemas';
import { saveVersi, listVersi, setVersiDrive } from '@/lib/lkjip/versi';
import { generateLkjipDocx } from '@/lib/lkjip/docgen';
import { uploadBufferToDrive } from '@/lib/services/drive';
import { LkjipNotFoundError } from '@/lib/lkjip/data';
import { guard } from '../../_guard';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs'; // googleapis butuh Node runtime

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
function stamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard();
  if (!g.ok) return g.res;
  const id = safeInt((await params).id, 0);
  if (id <= 0) return NextResponse.json({ ok: false, msg: 'ID tidak valid' }, { status: 400 });
  const rows = await listVersi(id);
  return NextResponse.json({ ok: true, rows });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard();
  if (!g.ok) return g.res;
  const limited = await lkjipRateLimit(g.session.userId, 'versi-save', 30); if (limited) return limited;
  const id = safeInt((await params).id, 0);
  if (id <= 0) return NextResponse.json({ ok: false, msg: 'ID tidak valid' }, { status: 400 });
  const raw = await req.json().catch(() => ({}));
  const parsed = VersiSaveSchema.safeParse(raw ?? {});
  if (!parsed.success) return NextResponse.json({ ok: false, msg: 'Data tidak valid: ' + parsed.error.issues[0].message }, { status: 400 });

  let saved: { id: number; versi_no: number };
  try {
    saved = await saveVersi(id, parsed.data.label, g.session.userId);
  } catch (err) {
    if (err instanceof LkjipNotFoundError) return NextResponse.json({ ok: false, msg: err.message }, { status: 404 });
    throw err;
  }
  await writeAuditLog({ req, eventType: 'LKJIP_VERSI_SAVE', userId: g.session.userId, username: g.session.username, detail: `LKJIP simpan versi ${saved.versi_no} doc=${id}` });

  // Arsip docx ke Drive — best-effort, tidak memblokir simpan versi.
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID_LKJIP?.trim();
  let driveOk = false;
  if (folderId) {
    try {
      const docx = await generateLkjipDocx(id);
      const name = docx.filename.replace(/\.docx$/i, '') + `-v${saved.versi_no}-${stamp(new Date())}.docx`;
      const up = await uploadBufferToDrive({ buffer: docx.buffer, name, mimeType: DOCX_MIME, folderId });
      if (up.fileId) {
        await setVersiDrive(saved.id, up.fileId, name);
        driveOk = true;
        await writeAuditLog({ req, eventType: 'LKJIP_DRIVE_ARCHIVE', userId: g.session.userId, username: g.session.username, detail: `LKJIP arsip Drive ${name} (${up.fileId})` });
      }
    } catch (e) {
      console.error('[LKJIP Drive archive]', e); // best-effort
    }
  }
  return NextResponse.json({ ok: true, id: saved.id, versi_no: saved.versi_no, driveArchived: driveOk, driveConfigured: !!folderId });
}
