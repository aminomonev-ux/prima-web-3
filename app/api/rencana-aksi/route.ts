import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { writeAuditLog } from '@/lib/security/auditlog';
import {
  ListQuerySchema,
  UpsertRencanaAksiSchema,
  UpdateQuarterSchema,
  UpdateBulanRealisasiSchema,
  UpdateTargetsSchema,
  UpdateJenisSchema,
  ResetRealisasiSchema,
  rencanaAksiRateLimit,
} from '@/lib/data/rencana-aksi-schemas';
import {
  listRencanaAksi,
  upsertRencanaAksi,
  deleteRencanaAksi,
  updateQuarter,
  updateBulanRealisasi,
  updateTargets,
  updateJenis,
  resetRealisasi,
  getRencanaAksiById,
  RaVersionConflictError,
} from '@/lib/data/rencana-aksi';
import { guard } from './_guard';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const g = await guard();
  if (!g.ok) return g.response;

  const u = new URL(req.url);
  const parsed = ListQuerySchema.safeParse({
    tahun: u.searchParams.get('tahun'),
    level: u.searchParams.get('level'),
  });
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'Query tidak valid' }, { status: 400 });
  }

  try {
    const data = await listRencanaAksi(parsed.data.tahun, parsed.data.level);
    return NextResponse.json({ ok: true, data });
  } catch (e) {
    console.error('[RA GET]', e);
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const g = await guard();
  if (!g.ok) return g.response;

  const limited = await rencanaAksiRateLimit(g.session.userId, 'upsert', 30);
  if (limited) return limited;

  const raw = await req.json().catch(() => null);
  const parsed = UpsertRencanaAksiSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: 'Data tidak valid: ' + parsed.error.issues[0].message },
      { status: 400 },
    );
  }

  try {
    const id = await upsertRencanaAksi(parsed.data, g.session.userId);
    await writeAuditLog({
      req,
      eventType: 'RA_UPSERT',
      userId: g.session.userId,
      username: g.session.username,
      detail: `Rencana Aksi ${parsed.data.tahun}/${parsed.data.level}: ${parsed.data.indikator}`,
    });
    return NextResponse.json({ ok: true, id });
  } catch (e) {
    console.error('[RA POST]', e);
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const g = await guard();
  if (!g.ok) return g.response;

  const limited = await rencanaAksiRateLimit(g.session.userId, 'delete', 30);
  if (limited) return limited;

  const u = new URL(req.url);
  const id = Number(u.searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ ok: false, error: 'id tidak valid' }, { status: 400 });
  }

  try {
    const row = await getRencanaAksiById(id);
    if (!row) return NextResponse.json({ ok: false, error: 'Tidak ditemukan' }, { status: 404 });
    await deleteRencanaAksi(id);
    await writeAuditLog({
      req,
      eventType: 'RA_DELETE',
      userId: g.session.userId,
      username: g.session.username,
      detail: `Hapus indikator ${row.tahun}/${row.level}: ${row.indikator}`,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[RA DELETE]', e);
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 });
  }
}

const PatchBodySchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('quarter'), payload: UpdateQuarterSchema }),
  z.object({ action: z.literal('bulan-realisasi'), payload: UpdateBulanRealisasiSchema }),
  z.object({ action: z.literal('targets'), payload: UpdateTargetsSchema }),
  z.object({ action: z.literal('jenis'), payload: UpdateJenisSchema }),
  z.object({ action: z.literal('reset-realisasi'), payload: ResetRealisasiSchema }),
]);

export async function PATCH(req: NextRequest) {
  const g = await guard();
  if (!g.ok) return g.response;

  const raw = await req.json().catch(() => null);
  const parsed = PatchBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: 'Data tidak valid: ' + parsed.error.issues[0].message },
      { status: 400 },
    );
  }

  const action = parsed.data.action;
  const limited = await rencanaAksiRateLimit(
    g.session.userId,
    action,
    action === 'reset-realisasi' ? 10 : 30,
  );
  if (limited) return limited;

  try {
    if (action === 'quarter') {
      const p = parsed.data.payload;
      await updateQuarter(p.id, p.quarter as 1 | 2 | 3 | 4, p.target, p.realisasi, g.session.userId, p.expected_version);
      await writeAuditLog({
        req, eventType: 'RA_UPDATE_QUARTER',
        userId: g.session.userId, username: g.session.username,
        detail: `id=${p.id} TW${p.quarter}: target=${p.target} realisasi=${p.realisasi}`,
      });
    } else if (action === 'bulan-realisasi') {
      const p = parsed.data.payload;
      await updateBulanRealisasi(p.id, p.bulan_realisasi, g.session.userId, p.expected_version);
      await writeAuditLog({
        req, eventType: 'RA_UPDATE_BULAN_REALISASI',
        userId: g.session.userId, username: g.session.username,
        detail: `id=${p.id} realisasi bulanan=[${p.bulan_realisasi.join(',')}]`,
      });
    } else if (action === 'targets') {
      const p = parsed.data.payload;
      await updateTargets(p.id, p.target_rpjmd, p.target_tahunan, g.session.userId, p.expected_version);
      await writeAuditLog({
        req, eventType: 'RA_UPDATE_TARGETS',
        userId: g.session.userId, username: g.session.username,
        detail: `id=${p.id} rpjmd=${p.target_rpjmd} tahunan=${p.target_tahunan}`,
      });
    } else if (action === 'jenis') {
      const p = parsed.data.payload;
      await updateJenis(p.id, p.jenis, g.session.userId, p.expected_version);
      await writeAuditLog({
        req, eventType: 'RA_UPDATE_JENIS',
        userId: g.session.userId, username: g.session.username,
        detail: `id=${p.id} jenis=${p.jenis}`,
      });
    } else {
      const p = parsed.data.payload;
      const row = await getRencanaAksiById(p.id);
      if (!row) return NextResponse.json({ ok: false, error: 'Tidak ditemukan' }, { status: 404 });
      await resetRealisasi(p.id, g.session.userId);
      await writeAuditLog({
        req, eventType: 'RA_RESET_REALISASI',
        userId: g.session.userId, username: g.session.username,
        detail: `Reset realisasi id=${p.id} (${row.indikator})`,
      });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof RaVersionConflictError) {
      return NextResponse.json({ ok: false, error: e.message, code: 'VERSION_CONFLICT' }, { status: 409 });
    }
    console.error('[RA PATCH]', e);
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 });
  }
}
