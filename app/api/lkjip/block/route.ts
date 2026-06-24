import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { writeAuditLog } from '@/lib/security/auditlog';
import {
  BlockCreateSchema, BlockUpdateSchema, BlockReorderSchema, BlockDeleteSchema, lkjipRateLimit,
} from '@/lib/lkjip/schemas';
import {
  addBlock, updateBlock, reorderBlocks, deleteBlock,
  LkjipNotFoundError, LkjipFinalError,
} from '@/lib/lkjip/data';
import { guard } from '../_guard';

export const dynamic = 'force-dynamic';

function mapErr(err: unknown): NextResponse | null {
  if (err instanceof ZodError)           return NextResponse.json({ ok: false, msg: 'Payload blok tidak valid: ' + err.issues[0].message }, { status: 400 });
  if (err instanceof LkjipFinalError)    return NextResponse.json({ ok: false, msg: err.message }, { status: 409 });
  if (err instanceof LkjipNotFoundError) return NextResponse.json({ ok: false, msg: err.message }, { status: 404 });
  return null;
}

export async function POST(req: NextRequest) {
  const g = await guard();
  if (!g.ok) return g.res;
  const limited = await lkjipRateLimit(g.session.userId, 'block-add', 120); if (limited) return limited;
  const raw = await req.json().catch(() => null);
  const parsed = BlockCreateSchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ ok: false, msg: 'Data tidak valid: ' + parsed.error.issues[0].message }, { status: 400 });
  try {
    const { id } = await addBlock(parsed.data.section_id, parsed.data.tipe, parsed.data.payload);
    await writeAuditLog({ req, eventType: 'LKJIP_BLOCK_ADD', userId: g.session.userId, username: g.session.username, detail: `LKJIP add block section=${parsed.data.section_id} tipe=${parsed.data.tipe}` });
    return NextResponse.json({ ok: true, id });
  } catch (err) {
    const mapped = mapErr(err); if (mapped) return mapped;
    throw err;
  }
}

export async function PATCH(req: NextRequest) {
  const g = await guard();
  if (!g.ok) return g.res;
  const limited = await lkjipRateLimit(g.session.userId, 'block-edit', 180); if (limited) return limited;
  const raw = await req.json().catch(() => null) as { action?: string } | null;
  try {
    if (raw?.action === 'reorder') {
      const parsed = BlockReorderSchema.safeParse(raw);
      if (!parsed.success) return NextResponse.json({ ok: false, msg: 'Data tidak valid: ' + parsed.error.issues[0].message }, { status: 400 });
      await reorderBlocks(parsed.data.section_id, parsed.data.order);
      await writeAuditLog({ req, eventType: 'LKJIP_BLOCK_UPDATE', userId: g.session.userId, username: g.session.username, detail: `LKJIP reorder blocks section=${parsed.data.section_id}` });
    } else {
      const parsed = BlockUpdateSchema.safeParse(raw);
      if (!parsed.success) return NextResponse.json({ ok: false, msg: 'Data tidak valid: ' + parsed.error.issues[0].message }, { status: 400 });
      await updateBlock(parsed.data.id, parsed.data.payload);
      await writeAuditLog({ req, eventType: 'LKJIP_BLOCK_UPDATE', userId: g.session.userId, username: g.session.username, detail: `LKJIP update block id=${parsed.data.id}` });
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
  const limited = await lkjipRateLimit(g.session.userId, 'block-del', 120); if (limited) return limited;
  const { searchParams } = new URL(req.url);
  const parsed = BlockDeleteSchema.safeParse({ id: searchParams.get('id') ?? undefined });
  if (!parsed.success) return NextResponse.json({ ok: false, msg: 'ID tidak valid' }, { status: 400 });
  try {
    await deleteBlock(parsed.data.id);
    await writeAuditLog({ req, eventType: 'LKJIP_BLOCK_DELETE', userId: g.session.userId, username: g.session.username, detail: `LKJIP delete block id=${parsed.data.id}` });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const mapped = mapErr(err); if (mapped) return mapped;
    throw err;
  }
}
