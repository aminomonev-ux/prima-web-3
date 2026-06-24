import { NextRequest, NextResponse } from 'next/server';
import { writeAuditLog } from '@/lib/security/auditlog';
import {
  SectionCreateSchema, SectionRenameSchema, SectionMoveSchema, SectionDeleteSchema, lkjipRateLimit,
} from '@/lib/lkjip/schemas';
import {
  addSection, renameSection, moveSection, deleteSection,
  LkjipNotFoundError, LkjipFinalError, LkjipStructureError,
} from '@/lib/lkjip/data';
import { guard } from '../_guard';

export const dynamic = 'force-dynamic';

function mapErr(err: unknown): NextResponse | null {
  if (err instanceof LkjipFinalError)     return NextResponse.json({ ok: false, msg: err.message }, { status: 409 });
  if (err instanceof LkjipStructureError) return NextResponse.json({ ok: false, msg: err.message }, { status: 400 });
  if (err instanceof LkjipNotFoundError)  return NextResponse.json({ ok: false, msg: err.message }, { status: 404 });
  return null;
}

export async function POST(req: NextRequest) {
  const g = await guard();
  if (!g.ok) return g.res;
  const limited = await lkjipRateLimit(g.session.userId, 'section-add', 120); if (limited) return limited;
  const raw = await req.json().catch(() => null);
  const parsed = SectionCreateSchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ ok: false, msg: 'Data tidak valid: ' + parsed.error.issues[0].message }, { status: 400 });
  try {
    const { id } = await addSection(parsed.data);
    await writeAuditLog({ req, eventType: 'LKJIP_SECTION_ADD', userId: g.session.userId, username: g.session.username, detail: `LKJIP add section doc=${parsed.data.dokumen_id} id=${id}` });
    return NextResponse.json({ ok: true, id });
  } catch (err) {
    const mapped = mapErr(err); if (mapped) return mapped;
    throw err;
  }
}

export async function PATCH(req: NextRequest) {
  const g = await guard();
  if (!g.ok) return g.res;
  const limited = await lkjipRateLimit(g.session.userId, 'section-edit', 120); if (limited) return limited;
  const raw = await req.json().catch(() => null) as { action?: string } | null;
  const action = raw?.action;
  try {
    if (action === 'move') {
      const parsed = SectionMoveSchema.safeParse(raw);
      if (!parsed.success) return NextResponse.json({ ok: false, msg: 'Data tidak valid: ' + parsed.error.issues[0].message }, { status: 400 });
      await moveSection(parsed.data);
      await writeAuditLog({ req, eventType: 'LKJIP_SECTION_MOVE', userId: g.session.userId, username: g.session.username, detail: `LKJIP move section id=${parsed.data.id}` });
    } else {
      const parsed = SectionRenameSchema.safeParse(raw);
      if (!parsed.success) return NextResponse.json({ ok: false, msg: 'Data tidak valid: ' + parsed.error.issues[0].message }, { status: 400 });
      await renameSection(parsed.data.id, parsed.data.judul);
      await writeAuditLog({ req, eventType: 'LKJIP_SECTION_RENAME', userId: g.session.userId, username: g.session.username, detail: `LKJIP rename section id=${parsed.data.id}` });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    const mapped = mapErr(err); if (mapped) return mapped;
    throw err;
  }
}

export async function DELETE(req: NextRequest) {
  const g = await guard();
  if (!g.ok) return g.res;
  const limited = await lkjipRateLimit(g.session.userId, 'section-del', 120); if (limited) return limited;
  const { searchParams } = new URL(req.url);
  const parsed = SectionDeleteSchema.safeParse({ id: searchParams.get('id') ?? undefined });
  if (!parsed.success) return NextResponse.json({ ok: false, msg: 'ID tidak valid' }, { status: 400 });
  try {
    await deleteSection(parsed.data.id);
    await writeAuditLog({ req, eventType: 'LKJIP_SECTION_DELETE', userId: g.session.userId, username: g.session.username, detail: `LKJIP delete section id=${parsed.data.id}` });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const mapped = mapErr(err); if (mapped) return mapped;
    throw err;
  }
}
