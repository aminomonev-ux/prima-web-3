// app/api/perjanjian-kinerja/dokumen/[id]/route.ts
// GET detail + PATCH update + DELETE single dokumen PK.
// Pattern: ownership filter L2 + safeInt L11 + withTransaction L7 untuk update replace.

import { NextRequest, NextResponse } from 'next/server';
import { sql, withTransaction, bulkInsert, safeInt } from '@/lib/data/db';
import { getSession } from '@/lib/security/auth';
import { writeAuditLog } from '@/lib/security/auditlog';
import { isPkRole, isPkEditRole, pkRateLimit, DokumenUpdateBodySchema } from '@/lib/data/pk-schemas';
import { hasAppAccess } from '@/lib/security/guard';
import { ADMIN_ROLES } from '@/lib/constants';

export const dynamic = 'force-dynamic';

type DokumenHeader = {
  id: number;
  tahun: string;
  tanggal_dokumen: string;
  jenis_pk: 'MURNI' | 'PERUBAHAN';
  unit_pertama: string;  nama_pertama: string;  jabatan_pertama: string;  pangkat_pertama: string | null;  nip_pertama: string | null;
  unit_kedua: string;    nama_kedua: string;    jabatan_kedua: string;    pangkat_kedua: string | null;    nip_kedua: string | null;
  status: 'DRAFT' | 'FINAL';
  has_file: 0 | 1;
  generated_filesize: number | null;
  generated_filename: string | null;
  generated_at: string | null;
  created_at: string;
  created_by: number | null;
};

async function getOwnership(dokumenId: number): Promise<{ created_by: number | null; status: string } | null> {
  const rows = await sql`SELECT created_by, status FROM pk_dokumen WHERE id = ${dokumenId} LIMIT 1` as { created_by: number | null; status: string }[];
  return rows[0] ?? null;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
  if (!(await hasAppAccess(session.userId, session.role, isPkRole))) return NextResponse.json({ ok: false, message: 'Akses ditolak' }, { status: 403 });

  const limited = await pkRateLimit(session.userId, 'dokumen-detail', 60);
  if (limited) return limited;

  const { id: idRaw } = await params;
  const id = safeInt(idRaw, 0);
  if (id <= 0) return NextResponse.json({ ok: false, message: 'ID dokumen tidak valid' }, { status: 400 });

  // Ownership L2 SEC-C4 — non-admin hanya bisa lihat dokumen yang dia buat
  const isAdmin = (ADMIN_ROLES as readonly string[]).includes(session.role);
  const ownershipClause = isAdmin ? sql`` : sql`AND created_by = ${session.userId}`;

  const headers = await sql`
    SELECT id, tahun, tanggal_dokumen, jenis_pk,
           unit_pertama, nama_pertama, jabatan_pertama, pangkat_pertama, nip_pertama,
           unit_kedua,   nama_kedua,   jabatan_kedua,   pangkat_kedua,   nip_kedua,
           status,
           CASE WHEN generated_file IS NOT NULL THEN 1 ELSE 0 END AS has_file,
           generated_filesize, generated_filename, generated_at,
           created_at, created_by
    FROM pk_dokumen
    WHERE id = ${id} ${ownershipClause}
    LIMIT 1
  ` as DokumenHeader[];

  if (!headers.length) {
    return NextResponse.json({ ok: false, message: 'Dokumen tidak ditemukan' }, { status: 404 });
  }

  const [lampiran, anggaran] = await Promise.all([
    sql`SELECT id, unit_kerja, level, program, kegiatan, subkegiatan, uraian, indikator, target, urutan
        FROM pk_dokumen_lampiran WHERE dokumen_id = ${id} ORDER BY urutan, id`,
    sql`SELECT id, unit_kerja, level, program, kegiatan, subkegiatan, uraian, keterangan_sumber, nominal, urutan, auto_filled_from_blud
        FROM pk_dokumen_anggaran WHERE dokumen_id = ${id} ORDER BY urutan, id`,
  ]);

  return NextResponse.json({
    ok: true,
    header: headers[0],
    lampiran,
    anggaran,
  });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
  if (!(await hasAppAccess(session.userId, session.role, isPkEditRole))) return NextResponse.json({ ok: false, message: 'Akses ditolak' }, { status: 403 });

  const limited = await pkRateLimit(session.userId, 'update-dokumen', 20);
  if (limited) return limited;

  const { id: idRaw } = await params;
  const id = safeInt(idRaw, 0);
  if (id <= 0) return NextResponse.json({ ok: false, message: 'ID dokumen tidak valid' }, { status: 400 });

  const own = await getOwnership(id);
  if (!own) return NextResponse.json({ ok: false, message: 'Dokumen tidak ditemukan' }, { status: 404 });

  const isAdmin = (ADMIN_ROLES as readonly string[]).includes(session.role);
  if (!isAdmin && own.created_by !== session.userId) {
    return NextResponse.json({ ok: false, message: 'Bukan dokumen Anda' }, { status: 403 });
  }
  if (own.status === 'FINAL') {
    return NextResponse.json({ ok: false, message: 'Dokumen sudah FINAL — tidak bisa diedit. Hubungi SUPER_ADMIN untuk unlock.' }, { status: 409 });
  }

  const raw = await req.json().catch(() => null);
  const parsed = DokumenUpdateBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, message: 'Data tidak valid: ' + parsed.error.issues[0].message }, { status: 400 });
  }
  const d = parsed.data;

  // Replace pattern: UPDATE header + DELETE lampiran/anggaran + bulkInsert baru
  await withTransaction(async ({ tx, conn }) => {
    await tx`
      UPDATE pk_dokumen SET
        tahun = ${d.tahun}, tanggal_dokumen = ${d.tanggal_dokumen}, jenis_pk = ${d.jenis_pk},
        unit_pertama = ${d.unit_pertama}, nama_pertama = ${d.nama_pertama}, jabatan_pertama = ${d.jabatan_pertama},
        pangkat_pertama = ${d.pangkat_pertama ?? null}, nip_pertama = ${d.nip_pertama ?? null},
        unit_kedua = ${d.unit_kedua}, nama_kedua = ${d.nama_kedua}, jabatan_kedua = ${d.jabatan_kedua},
        pangkat_kedua = ${d.pangkat_kedua ?? null}, nip_kedua = ${d.nip_kedua ?? null}
      WHERE id = ${id}
    `;
    await tx`DELETE FROM pk_dokumen_lampiran WHERE dokumen_id = ${id}`;
    await tx`DELETE FROM pk_dokumen_anggaran WHERE dokumen_id = ${id}`;

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
  });

  await writeAuditLog({
    req,
    eventType: 'PK_DOKUMEN_UPDATE',
    userId:    session.userId,
    username:  session.username,
    detail:    `Update dokumen PK id=${id} (${d.jenis_pk}), ${d.lampiran.length} lampiran + ${d.anggaran.length} anggaran`,
  });

  return NextResponse.json({ ok: true, id });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
  if (!(await hasAppAccess(session.userId, session.role, isPkEditRole))) return NextResponse.json({ ok: false, message: 'Akses ditolak' }, { status: 403 });

  const limited = await pkRateLimit(session.userId, 'delete-dokumen', 10);
  if (limited) return limited;

  const { id: idRaw } = await params;
  const id = safeInt(idRaw, 0);
  if (id <= 0) return NextResponse.json({ ok: false, message: 'ID dokumen tidak valid' }, { status: 400 });

  const own = await getOwnership(id);
  if (!own) return NextResponse.json({ ok: false, message: 'Dokumen tidak ditemukan' }, { status: 404 });

  const isAdmin = (ADMIN_ROLES as readonly string[]).includes(session.role);
  if (!isAdmin && own.created_by !== session.userId) {
    return NextResponse.json({ ok: false, message: 'Bukan dokumen Anda' }, { status: 403 });
  }
  // FINAL hanya boleh dihapus SUPER_ADMIN atau ADMIN (staff admin)
  if (own.status === 'FINAL' && session.role !== 'SUPER_ADMIN' && session.role !== 'ADMIN') {
    return NextResponse.json({ ok: false, message: 'Dokumen FINAL hanya boleh dihapus SUPER_ADMIN atau ADMIN' }, { status: 409 });
  }

  // CASCADE delete lampiran/anggaran via FK
  await sql`DELETE FROM pk_dokumen WHERE id = ${id}`;

  await writeAuditLog({
    req,
    eventType: 'PK_DOKUMEN_DELETE',
    userId:    session.userId,
    username:  session.username,
    detail:    `Delete dokumen PK id=${id} (was ${own.status})`,
  });

  return NextResponse.json({ ok: true, id });
}
