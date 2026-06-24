// app/api/perjanjian-kinerja/units/route.ts
// GET list unit kerja (default active-only, dropdown).
// GET ?include_inactive=true&with_mapping=true → admin Master Unit view.
// POST upsert pattern (admin only) — Sprint 8a.
//
// Pattern: getSession + isPkRole + pkRateLimit + Zod + withTransaction (L7) + bulkInsert (L13).

import { NextRequest, NextResponse } from 'next/server';
import { withTransaction, bulkInsert } from '@/lib/data/db';
import { getSession } from '@/lib/security/auth';
import { writeAuditLog } from '@/lib/security/auditlog';
import {
  isPkRole, pkRateLimit, PkQuerySchema, UnitKerjaBodySchema,
} from '@/lib/data/pk-schemas';
import { hasAppAccess } from '@/lib/security/guard';
import { getPkUnitKerjaList, getAllPkUnitKerjaWithMapping } from '@/lib/data/pk';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
  if (!(await hasAppAccess(session.userId, session.role, isPkRole))) return NextResponse.json({ ok: false, message: 'Akses ditolak' }, { status: 403 });

  const limited = await pkRateLimit(session.userId, 'units-list', 60);
  if (limited) return limited;

  const { searchParams } = new URL(req.url);
  const q = PkQuerySchema.safeParse({
    as_pertama: searchParams.get('as_pertama') ?? undefined,
  });
  if (!q.success) {
    return NextResponse.json(
      { ok: false, message: 'Parameter tidak valid: ' + q.error.issues[0].message },
      { status: 400 },
    );
  }

  // Admin Master Unit view: include_inactive + with_mapping
  const includeInactive = searchParams.get('include_inactive') === 'true';
  const withMapping     = searchParams.get('with_mapping') === 'true';

  if (includeInactive) {
    if (session.role !== 'SUPER_ADMIN' && session.role !== 'ADMIN') {
      return NextResponse.json({ ok: false, message: 'Hanya SUPER_ADMIN/ADMIN' }, { status: 403 });
    }
    const data = await getAllPkUnitKerjaWithMapping();
    return NextResponse.json({
      ok: true,
      units: data.units,
      mapping: withMapping ? data.mapping : undefined,
    });
  }

  const asPertama = q.data.as_pertama === 'true';
  const units = await getPkUnitKerjaList(asPertama);
  return NextResponse.json({ ok: true, units });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'SUPER_ADMIN' && session.role !== 'ADMIN') {
    return NextResponse.json({ ok: false, message: 'Hanya SUPER_ADMIN/ADMIN yang dapat edit Master Unit' }, { status: 403 });
  }

  const limited = await pkRateLimit(session.userId, 'save-unit-kerja', 10);
  if (limited) return limited;

  const raw = await req.json().catch(() => null);
  const parsed = UnitKerjaBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, message: 'Data tidak valid: ' + parsed.error.issues[0].message }, { status: 400 });
  }
  const { units, bludMapping = [] } = parsed.data;

  // Validate: nama_unit unique within payload
  const seen = new Set<string>();
  for (const u of units) {
    const k = u.nama_unit.trim();
    if (seen.has(k)) {
      return NextResponse.json({ ok: false, message: `Nama unit "${k}" duplikat dalam payload` }, { status: 400 });
    }
    seen.add(k);
  }
  // Validate: atasan_default harus refer ke nama_unit yang ada (jika tidak null)
  const allNames = new Set(units.map(u => u.nama_unit.trim()));
  for (const u of units) {
    if (u.atasan_default && !allNames.has(u.atasan_default.trim())) {
      return NextResponse.json({
        ok: false,
        message: `Unit "${u.nama_unit}": atasan_default "${u.atasan_default}" tidak terdaftar`,
      }, { status: 400 });
    }
  }
  // Validate: bludMapping.unit_pk harus refer ke nama_unit di payload
  for (const m of bludMapping) {
    if (!allNames.has(m.unit_pk.trim())) {
      return NextResponse.json({
        ok: false,
        message: `Mapping BLUD: unit "${m.unit_pk}" tidak terdaftar di payload`,
      }, { status: 400 });
    }
  }

  let insertedCount = 0;
  let updatedCount  = 0;

  await withTransaction(async ({ tx, conn }) => {
    for (const u of units) {
      if (u.id) {
        await tx`
          UPDATE pk_unit_kerja SET
            nama_unit             = ${u.nama_unit.trim()},
            level                 = ${u.level},
            atasan_default        = ${u.atasan_default ?? null},
            selectable_as_pertama = ${u.selectable_as_pertama},
            urutan                = ${u.urutan},
            active                = ${u.active}
          WHERE id = ${u.id}
        `;
        updatedCount += 1;
      } else {
        await tx`
          INSERT INTO pk_unit_kerja
            (nama_unit, level, atasan_default, selectable_as_pertama, urutan, active)
          VALUES
            (${u.nama_unit.trim()}, ${u.level}, ${u.atasan_default ?? null},
             ${u.selectable_as_pertama}, ${u.urutan}, ${u.active})
        `;
        insertedCount += 1;
      }
    }

    // Replace BLUD mapping per-unit (preserve mapping untuk unit lain)
    const affectedUnits = Array.from(new Set([
      ...allNames,
      ...bludMapping.map(m => m.unit_pk.trim()),
    ]));
    for (const name of affectedUnits) {
      await tx`DELETE FROM pk_unit_kerja_blud_pj WHERE unit_pk = ${name}`;
    }
    if (bludMapping.length > 0) {
      await bulkInsert(
        'pk_unit_kerja_blud_pj',
        ['unit_pk', 'blud_pj_label'],
        bludMapping.map(m => [m.unit_pk.trim(), m.blud_pj_label.trim()]),
        conn,
      );
    }
  });

  await writeAuditLog({
    req,
    eventType: 'PK_SAVE_UNIT_KERJA',
    userId:    session.userId,
    username:  session.username,
    detail:    `Save Master Unit Kerja: ${updatedCount} updated, ${insertedCount} inserted, ${bludMapping.length} BLUD mappings`,
  });

  return NextResponse.json({
    ok: true,
    updated: updatedCount,
    inserted: insertedCount,
    mappings: bludMapping.length,
  });
}
