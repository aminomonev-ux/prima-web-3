// app/api/kinerja/ssk/perubahan/route.ts
// Refactor Versi E-Anggaran — Checkpoint B Task #16.
// Buat versi PERUBAHAN baru dari versi aktif (auto-copy + lock previous).
// Reference: docs/lain/KINERJA_VERSI_REFACTOR.md
//
// POST body: { tahun, sumber, from_versi_tipe, from_versi_seq }
// Response: { ok: true, new_versi_seq: number, copied: number }
//
// Pattern:
//   - getSession + isKinerjaRole + Zod
//   - withTransaction + bulkInsert (audit anti-pattern: no for-await INSERT)
//   - writeAuditLog KINERJA_VERSI_CREATED

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/security/auth';
import { sql, bulkInsert, withTransaction } from '@/lib/data/db';
import { writeAuditLog } from '@/lib/security/auditlog';
import { isKinerjaRole, kinerjaRateLimit, TahunSchema, SumberSchema, VersiTipeSchema, VersiSeqSchema } from '@/lib/data/kinerja-schemas';
import { hasAppAccess } from '@/lib/security/guard';

const BodySchema = z.object({
  tahun:           TahunSchema,
  sumber:          SumberSchema,
  from_versi_tipe: VersiTipeSchema,
  from_versi_seq:  VersiSeqSchema,
});

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
  if (!(await hasAppAccess(session.userId, session.role, isKinerjaRole))) return NextResponse.json({ ok: false, message: 'Akses ditolak' }, { status: 403 });
  // SDL-M14: versi creation = low cadence, 10/menit.
  const limited = await kinerjaRateLimit(session.userId, 'versi-create', 10); if (limited) return limited;

  const raw = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, message: 'Data tidak valid: ' + parsed.error.issues[0].message },
      { status: 400 },
    );
  }
  const { tahun, sumber, from_versi_tipe, from_versi_seq } = parsed.data;

  // ─── Hitung versi_seq berikutnya (max PERUBAHAN seq + 1) ──────────────────
  const maxRows = await sql`
    SELECT COALESCE(MAX(versi_seq), 0) AS max_seq
    FROM kinerja_ssk
    WHERE tahun = ${tahun} AND sumber = ${sumber} AND versi_tipe = 'PERUBAHAN'
  ` as { max_seq: unknown }[];
  const newVersiSeq = Number(maxRows[0]?.max_seq ?? 0) + 1;

  // ─── Ambil semua row dari versi source ────────────────────────────────────
  const sourceRows = await sql`
    SELECT id, canonical_id, uraian_ssk, uraian,
           COALESCE(program,'') AS program, COALESCE(kegiatan,'') AS kegiatan, COALESCE(subkegiatan,'') AS subkegiatan,
           pagu, months, months_pct, total, total_pct, urut, is_nullified
    FROM kinerja_ssk
    WHERE tahun = ${tahun} AND sumber = ${sumber}
      AND versi_tipe = ${from_versi_tipe} AND versi_seq = ${from_versi_seq}
  ` as Record<string, unknown>[];

  if (sourceRows.length === 0) {
    return NextResponse.json(
      { ok: false, message: `Versi source (${from_versi_tipe} seq=${from_versi_seq}) tidak ditemukan / kosong.` },
      { status: 404 },
    );
  }

  // ─── Atomic: lock previous + bulk insert PERUBAHAN baru ───────────────────
  await withTransaction(async ({ tx, conn }) => {
    // 1) Lock versi sumber (semua row dengan versi yg dipilih + tahun + sumber)
    await tx`
      UPDATE kinerja_ssk
      SET locked_at = NOW()
      WHERE tahun = ${tahun} AND sumber = ${sumber}
        AND versi_tipe = ${from_versi_tipe} AND versi_seq = ${from_versi_seq}
        AND locked_at IS NULL
    `;

    // 2) Bulk insert row PERUBAHAN baru (copy data + set parent_versi_id ke id source)
    const values = sourceRows.map(r => [
      tahun,
      sumber,
      'PERUBAHAN',          // versi_tipe
      newVersiSeq,          // versi_seq
      String(r.canonical_id ?? ''),
      Number(r.id),         // parent_versi_id → row source langsung
      // locked_at = NULL (versi baru editable)
      Number(r.is_nullified ?? 0) ? 1 : 0,
      String(r.uraian_ssk ?? ''),
      String(r.uraian ?? ''),
      String(r.program ?? ''),
      String(r.kegiatan ?? ''),
      String(r.subkegiatan ?? ''),
      Number(r.pagu ?? 0),
      typeof r.months === 'string' ? r.months : JSON.stringify(r.months ?? {}),
      typeof r.months_pct === 'string' ? r.months_pct : JSON.stringify(r.months_pct ?? {}),
      Number(r.total ?? 0),
      Number(r.total_pct ?? 0),
      Number(r.urut ?? 0),
      session.userId,
    ]);

    await bulkInsert(
      'kinerja_ssk',
      [
        'tahun','sumber','versi_tipe','versi_seq','canonical_id','parent_versi_id','is_nullified',
        'uraian_ssk','uraian','program','kegiatan','subkegiatan',
        'pagu','months','months_pct','total','total_pct','urut','updated_by',
      ],
      values,
      conn,
    );
  });

  await writeAuditLog({
    req,
    eventType: 'KINERJA_VERSI_CREATED',
    userId:    session.userId,
    username:  session.username,
    detail:    `Buat PERUBAHAN-${newVersiSeq} ${sumber} ${tahun} dari ${from_versi_tipe}-${from_versi_seq}: ${sourceRows.length} baris dicopy, versi source dikunci.`,
  });

  return NextResponse.json({
    ok: true,
    new_versi_tipe: 'PERUBAHAN',
    new_versi_seq:  newVersiSeq,
    copied:         sourceRows.length,
  });
}
