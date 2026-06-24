// app/api/perjanjian-kinerja/dokumen/route.ts
// Dokumen PK — GET list (paginated) + POST create (header + lampiran + anggaran atomic).
// Pattern: withTransaction L7 + bulkInsert L13 + ownership filter L2.

import { NextRequest, NextResponse } from 'next/server';
import { sql, withTransaction, bulkInsert, sqlInt, safeInt } from '@/lib/data/db';
import { getSession } from '@/lib/security/auth';
import { writeAuditLog } from '@/lib/security/auditlog';
import {
  isPkRole,
  isPkEditRole,
  pkRateLimit,
  PkQuerySchema,
  DokumenCreateBodySchema,
} from '@/lib/data/pk-schemas';
import { hasAppAccess } from '@/lib/security/guard';
import { ADMIN_ROLES } from '@/lib/constants';

export const dynamic = 'force-dynamic';

type DokumenListRow = {
  id: number;
  tahun: string;
  tanggal_dokumen: string;
  jenis_pk: 'MURNI' | 'PERUBAHAN';
  unit_pertama: string;
  nama_pertama: string;
  jabatan_pertama: string;
  unit_kedua: string;
  nama_kedua: string;
  status: 'DRAFT' | 'FINAL';
  has_file: 0 | 1;
  created_at: string;
  created_by: number | null;
};

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
  if (!(await hasAppAccess(session.userId, session.role, isPkRole))) return NextResponse.json({ ok: false, message: 'Akses ditolak' }, { status: 403 });

  const limited = await pkRateLimit(session.userId, 'dokumen-list', 30);
  if (limited) return limited;

  const sp    = req.nextUrl.searchParams;
  const q = PkQuerySchema.safeParse({
    tahun:    sp.get('tahun')    ?? undefined,
    status:   sp.get('status')   ?? undefined,
    jenis_pk: sp.get('jenis_pk') ?? undefined,
  });
  if (!q.success) {
    return NextResponse.json({ ok: false, message: 'Parameter tidak valid: ' + q.error.issues[0].message }, { status: 400 });
  }
  const tahun  = q.data.tahun ?? new Date().getFullYear().toString();
  const page   = Math.max(1, safeInt(sp.get('page'), 1));
  const limit  = Math.min(100, Math.max(1, safeInt(sp.get('limit'), 20)));
  const offset = (page - 1) * limit;

  // Ownership filter L2 SEC-C4: non-admin hanya lihat dokumen yang dibuat sendiri
  const isAdmin = (ADMIN_ROLES as readonly string[]).includes(session.role);
  const ownershipClause = isAdmin ? sql`` : sql`AND created_by = ${session.userId}`;
  const statusClause    = q.data.status   ? sql`AND status   = ${q.data.status}`   : sql``;
  const jenisClause     = q.data.jenis_pk ? sql`AND jenis_pk = ${q.data.jenis_pk}` : sql``;

  const [{ count }] = await sql`
    SELECT COUNT(*) AS count FROM pk_dokumen
    WHERE tahun = ${tahun} ${ownershipClause} ${statusClause} ${jenisClause}
  ` as { count: number }[];

  // PENTING: jangan SELECT generated_file (MEDIUMBLOB) di list — pakai has_file flag saja.
  const rows = await sql`
    SELECT id, tahun, tanggal_dokumen, jenis_pk,
           unit_pertama, nama_pertama, jabatan_pertama,
           unit_kedua, nama_kedua,
           status,
           CASE WHEN generated_file IS NOT NULL THEN 1 ELSE 0 END AS has_file,
           created_at, created_by
    FROM pk_dokumen
    WHERE tahun = ${tahun} ${ownershipClause} ${statusClause} ${jenisClause}
    ORDER BY tanggal_dokumen DESC, id DESC
    LIMIT ${sqlInt(limit)} OFFSET ${sqlInt(offset)}
  ` as DokumenListRow[];

  // Audit log bulk PII (UU PDP Pasal 39) — hanya kalau ada data sensitif
  if (rows.length > 0) {
    await writeAuditLog({
      req,
      eventType: 'PK_VIEW_LIST',
      userId:    session.userId,
      username:  session.username,
      detail:    `View list dokumen PK tahun ${tahun} (${rows.length} baris)`,
    });
  }

  return NextResponse.json({
    ok: true,
    data: rows,
    pagination: {
      page, limit, total: Number(count), totalPages: Math.ceil(Number(count) / limit),
    },
  });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
  if (!(await hasAppAccess(session.userId, session.role, isPkEditRole))) return NextResponse.json({ ok: false, message: 'Akses ditolak' }, { status: 403 });

  const limited = await pkRateLimit(session.userId, 'create-dokumen', 20);
  if (limited) return limited;

  const raw = await req.json().catch(() => null);
  const parsed = DokumenCreateBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, message: 'Data tidak valid: ' + parsed.error.issues[0].message }, { status: 400 });
  }
  const d = parsed.data;

  // Multi-step atomic insert (header + lampiran + anggaran) — L7 BUG-C2 + L24 conn pass
  const dokumenId = await withTransaction(async ({ tx, conn }): Promise<number> => {
    // tx untuk INSERT return [{insertId, affectedRows}] — akses [0].insertId
    // (mirror pattern usulan/route.ts:253)
    const result = await tx`
      INSERT INTO pk_dokumen (
        tahun, tanggal_dokumen, jenis_pk,
        unit_pertama, nama_pertama, jabatan_pertama, pangkat_pertama, nip_pertama,
        unit_kedua,   nama_kedua,   jabatan_kedua,   pangkat_kedua,   nip_kedua,
        status, created_by
      ) VALUES (
        ${d.tahun}, ${d.tanggal_dokumen}, ${d.jenis_pk},
        ${d.unit_pertama}, ${d.nama_pertama}, ${d.jabatan_pertama}, ${d.pangkat_pertama ?? null}, ${d.nip_pertama ?? null},
        ${d.unit_kedua},   ${d.nama_kedua},   ${d.jabatan_kedua},   ${d.pangkat_kedua ?? null},   ${d.nip_kedua ?? null},
        'DRAFT', ${session.userId}
      )
    ` as unknown as Array<{ insertId: number }>;
    const id = Number(result[0]?.insertId);
    if (!id) throw new Error('Gagal create dokumen — insertId kosong');

    if (d.lampiran.length > 0) {
      await bulkInsert(
        'pk_dokumen_lampiran',
        ['dokumen_id','unit_kerja','level','program','kegiatan','subkegiatan','uraian','indikator','target','urutan'],
        d.lampiran.map((l, i) => [
          id, l.unit_kerja, l.level,
          l.program ?? null, l.kegiatan ?? null, l.subkegiatan ?? null,
          l.uraian, l.indikator ?? null, l.target ?? null,
          l.urutan ?? i,
        ]),
        conn,
      );
    }

    if (d.anggaran.length > 0) {
      await bulkInsert(
        'pk_dokumen_anggaran',
        ['dokumen_id','unit_kerja','level','program','kegiatan','subkegiatan','uraian','keterangan_sumber','nominal','urutan','auto_filled_from_blud'],
        d.anggaran.map((a, i) => [
          id, a.unit_kerja, a.level,
          a.program ?? null, a.kegiatan ?? null, a.subkegiatan ?? null,
          a.uraian, a.keterangan_sumber, a.nominal ?? 0,
          a.urutan ?? i,
          a.auto_filled_from_blud ?? false,
        ]),
        conn,
      );
    }

    return id;
  });

  await writeAuditLog({
    req,
    eventType: 'PK_DOKUMEN_CREATE',
    userId:    session.userId,
    username:  session.username,
    detail:    `Create dokumen PK id=${dokumenId} (${d.jenis_pk}) ${d.unit_pertama} → ${d.unit_kedua}, ${d.lampiran.length} lampiran + ${d.anggaran.length} anggaran`,
  });

  return NextResponse.json({ ok: true, id: dokumenId });
}
